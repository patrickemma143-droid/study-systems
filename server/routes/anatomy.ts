// Anatomy 3D: descriptions and Latin names for every structure, quiz marking and points, and the
// AI tutor that explains any structure the student taps.
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config, ai } from '../config';
import { HttpError, requireAuth, userId } from '../auth';
import { award } from '../points';
import { aiDay, cachedJson, limitsFor, liveText } from '../ai/service';
import { db } from '../db';
import { anatomyCardRequest, anatomyFindRequest, anatomyTutorRequest, cleanAnatomyCard, cleanAnatomyFind } from '../ai/anatomy';
import { AiError } from '../ai/providers';
import { answerMatches } from '../../shared/engine/text';
import { blocksFromPlainText, buildStudyPack, type CardSeed, type QuizQuestion, type SourceBlock } from '../../shared/engine';
import { refreshPlan, savePack } from './packs';

export const anatomyRouter = Router();
anatomyRouter.use(requireAuth);

function readJson<T>(...candidates: string[]): T | null {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
    } catch {
      /* try the next place */
    }
  }
  return null;
}

let cache: { descriptions: Record<string, string>; latin: Record<string, string>; names: Map<string, string>; landmarks: Set<string> } | null = null;
function data() {
  if (cache) return cache;
  const descriptions = readJson<Record<string, string>>(path.join(config.root, 'seed', 'anatomy', 'descriptions.json')) || {};
  const latin = readJson<Record<string, string>>(path.join(config.root, 'seed', 'anatomy', 'latin.json')) || {};
  const catalogue = readJson<{ structures: Record<string, { name: string }>; landmarks?: { name: string }[] }>(path.join(config.distDir, 'anatomy', 'catalogue.json'), path.join(config.root, 'public', 'anatomy', 'catalogue.json'));
  const names = new Map<string, string>();
  for (const [id, s] of Object.entries(catalogue?.structures || {})) names.set(id, s.name);
  const landmarks = new Set((catalogue?.landmarks || []).map((l) => l.name.replace(/^\[(.*)\]$/, '$1').toLowerCase()));
  cache = { descriptions, latin, names, landmarks };
  return cache;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
// tidy leftovers of removed pronunciations: "( , pl. femurs)" → "(pl. femurs)"
const tidy = (d: string) => d.replace(/\(\s*[,;:]\s*/g, '(').replace(/\(\s*\)/g, '').replace(/ +([,.;])/g, '$1');

anatomyRouter.get('/describe', (req, res) => {
  const name = clean(String(req.query.name || '')).slice(0, 200);
  if (!name) throw new HttpError(400, 'Which structure?');
  const d = data();
  const key = name.toLowerCase();
  // tidy leftovers of removed pronunciations: "( , pl. femurs)" → "(pl. femurs)"
  const desc = d.descriptions[key] ? tidy(d.descriptions[key]) : null;
  res.json({ name, latin: d.latin[key] || null, description: desc });
});

/** Quiz answers are checked here against the model's own names, so points are fair. */
anatomyRouter.post('/quiz', async (req, res) => {
  const uid = userId(res);
  const body = z
    .object({
      mode: z.enum(['find', 'name', 'spotter']),
      answers: z.array(z.object({ id: z.string().max(12), answer: z.string().max(200) })).min(1).max(30),
    })
    .parse(req.body);
  const d = data();
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const marked = body.answers.map((a) => {
    const right = d.names.get(a.id) || '';
    // a typed spotter answer may have small spelling slips
    return { id: a.id, right, ok: !!right && (same(a.answer, right) || (body.mode === 'spotter' && answerMatches(a.answer, [right, right.replace(/ (muscle|bone|artery|vein|nerve)$/i, '')]))) };
  });
  const score = marked.filter((m) => m.ok).length;
  const total = marked.length;
  let points = 0;
  if (total >= 5) {
    const day = aiDay();
    const done = await db('points_events').where({ user_id: uid, day }).andWhere('dedupe', 'like', `anat-${uid}-${day}-%`).count({ n: '*' }).first();
    const n = Number((done as any)?.n || 0);
    if (n < 3) {
      const per = body.mode === 'spotter' ? 3 : body.mode === 'name' ? 2 : 1;
      points = await award(uid, 'memory', Math.min(30, score * per), `Anatomy ${body.mode === 'find' ? '“find it”' : body.mode === 'name' ? '“name it”' : 'spotter'} quiz: ${score}/${total}`, `anat-${uid}-${day}-${n}`, { score: Math.round((score / total) * 100) }).catch(() => 0);
    }
  }
  res.json({ score, total, points, marked });
});

function requireAi() {
  if (!ai.enabled) throw new HttpError(503, 'AI features are not switched on for this site yet.');
}
function friendly(err: unknown): never {
  if (err instanceof AiError) throw new HttpError(err.status === 503 ? 503 : 502, err.message);
  throw err;
}

/** The AI study card for one structure: shared by every student, so it is usually free. */
anatomyRouter.post('/ai/card', async (req, res) => {
  requireAi();
  const uid = userId(res);
  const b = z.object({ name: z.string().trim().min(2).max(200), system: z.string().max(20).optional(), of: z.string().trim().max(200).optional(), peek: z.boolean().optional() }).parse(req.body);
  const d = data();
  const key = b.name.toLowerCase();
  const ctx = { name: b.name, system: b.system || '', latin: d.latin[key] || null, description: d.descriptions[key] || null, partOf: b.of || null };
  try {
    const { data: card, cached } = await cachedJson(uid, 'simplify', `anatomy-card\n${key}${b.of ? `\n${b.of.toLowerCase()}` : ''}`, anatomyCardRequest(ctx), cleanAnatomyCard);
    res.json({ ...card, cached, usage: await limitsFor(uid) });
  } catch (err) {
    friendly(err);
  }
});

/** Ask the body: the AI answers and names the structures to highlight. */
anatomyRouter.post('/ai/find', async (req, res) => {
  requireAi();
  const uid = userId(res);
  const b = z.object({ question: z.string().trim().min(4, 'Ask a question first.').max(500) }).parse(req.body);
  const d = data();
  const valid = new Set([...d.names.values()]);
  try {
    const { data: found, cached } = await cachedJson(uid, 'tutor', `anatomy-find\n${b.question.toLowerCase()}`, anatomyFindRequest(b.question, [...valid].sort()), cleanAnatomyFind(valid));
    res.json({ ...found, cached, usage: await limitsFor(uid) });
  } catch (err) {
    friendly(err);
  }
});

/** Follow-up questions about a structure. */
anatomyRouter.post('/ai/ask', async (req, res) => {
  requireAi();
  const uid = userId(res);
  const b = z
    .object({
      name: z.string().trim().min(2).max(200),
      system: z.string().max(20).optional(),
      of: z.string().trim().max(200).optional(),
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1500) })).min(1).max(12),
    })
    .parse(req.body);
  if (b.messages[b.messages.length - 1].role !== 'user') throw new HttpError(400, 'Ask a question first.');
  const d = data();
  const key = b.name.toLowerCase();
  try {
    const reply = await liveText(uid, 'tutor', anatomyTutorRequest({ name: b.name, system: b.system || '', latin: d.latin[key] || null, description: d.descriptions[key] || null, partOf: b.of || null }, b.messages.slice(-8)));
    res.json({ reply, usage: await limitsFor(uid) });
  } catch (err) {
    friendly(err);
  }
});

/**
 * Turn the labelled parts of a bone (or the muscles attached to it) into a study pack: a lesson per
 * group of parts, flashcards both ways and quiz questions, so they come back in spaced review.
 */
anatomyRouter.post('/pack', async (req, res) => {
  const uid = userId(res);
  const b = z
    .object({
      structure: z.string().trim().min(2).max(200),
      side: z.enum(['left', 'right']).optional(),
      parts: z.array(z.string().trim().min(2).max(200)).min(3, 'This needs at least three labelled parts.').max(120),
      attachments: z.array(z.object({ muscle: z.string().trim().max(200), role: z.enum(['origin', 'insertion', 'attachment']) })).max(120).optional(),
    })
    .parse(req.body);
  const d = data();
  const structure = b.structure;
  if (![...d.names.values()].some((n) => n.toLowerCase() === structure.toLowerCase())) throw new HttpError(404, 'That structure is not in the atlas.');
  const parts = [...new Set(b.parts.filter((p) => d.landmarks.has(p.toLowerCase())))];
  if (parts.length < 3) throw new HttpError(422, 'This needs at least three labelled parts.');
  const title = `${structure}: parts and landmarks`;
  // the same bone twice: open the pack already made
  const existing = await db('packs').where({ user_id: uid, title, source_type: 'anatomy' }).first('id');
  if (existing) return res.json({ id: existing.id, existing: true });

  const sentences = (t: string) => (t.match(/[^.!?]+[.!?]+/g) || [t]).map((x) => x.trim()).filter(Boolean);
  const about = (name: string) => {
    const desc = d.descriptions[name.toLowerCase()];
    if (!desc) return '';
    return sentences(tidy(desc).replace(/\n+/g, ' '))
      .slice(0, 2)
      .join(' ')
      .slice(0, 500);
  };
  const lower = structure.toLowerCase();
  const blocks: SourceBlock[] = [{ kind: 'heading', level: 1, text: title }];
  const lesson = (heading: string, items: string[]) => {
    blocks.push({ kind: 'heading', level: 2, text: heading });
    for (const name of items) blocks.push({ kind: 'item', text: `${name}: ${about(name) || `a named part of the ${lower}. Find it on the 3D model in Anatomy 3D.`}` });
  };
  // a lesson for every eight parts, top of the bone first (the order they came in)
  for (let i = 0; i < parts.length; i += 8) lesson(parts.length > 8 ? `Parts of the ${lower} (${i / 8 + 1})` : `Parts of the ${lower}`, parts.slice(i, i + 8));
  const att = (b.attachments || []).filter((a) => a.role !== 'attachment' && [...d.names.values()].some((n) => n.toLowerCase() === a.muscle.toLowerCase()));
  if (att.length) {
    blocks.push({ kind: 'heading', level: 2, text: `Muscles attached to the ${lower}` });
    for (const role of ['origin', 'insertion'] as const) {
      const list = att.filter((a) => a.role === role).map((a) => a.muscle);
      if (list.length) blocks.push({ kind: 'para', text: `${role === 'origin' ? 'Muscles that arise (originate) from' : 'Muscles that insert into'} the ${lower}: ${[...new Set(list)].join(', ')}.` });
    }
  }
  const text = blocks.map((x) => (x.kind === 'heading' ? `\n${x.text}\n` : x.text)).join('\n');
  const pack = buildStudyPack(blocks.length > 2 ? blocks : blocksFromPlainText(text), { title });

  // flashcards and questions written for anatomy, not guessed from the text
  const chunkOf = (name: string) => Math.max(0, pack.chunks.findIndex((c) => JSON.stringify(c.body).includes(name)));
  const cards: CardSeed[] = [];
  const quiz: QuizQuestion[] = [];
  const named = parts.map((name) => ({ name, about: about(name) }));
  const blank = (t: string, name: string) => t.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '_____');
  for (const p of named) {
    const chunk = chunkOf(p.name);
    cards.push({ chunk, type: 'definition', front: `${p.name} (${lower}): what and where is it?`, back: p.about || `A named part of the ${lower}.`, hint: `Part of the ${lower}` });
    if (p.about) {
      const clue = blank(p.about, p.name);
      if (clue !== p.about) cards.push({ chunk, type: 'reverse', front: `Which part of the ${lower} is this? ${clue}`, back: p.name });
      const wrong = named.filter((x) => x.name !== p.name).map((x) => x.name).sort(() => Math.random() - 0.5).slice(0, 3);
      if (clue !== p.about && wrong.length === 3) {
        const options = [p.name, ...wrong].sort(() => Math.random() - 0.5);
        quiz.push({ id: `anat-${quiz.length}`, chunk, type: 'mcq', prompt: `Which part of the ${lower} is described? ${clue}`, options, answer: options.indexOf(p.name), explanation: `${p.name}: ${p.about}` });
      }
    }
  }
  for (const a of att) {
    const chunk = chunkOf(`Muscles attached`) || pack.chunks.length - 1;
    cards.push({ chunk: Math.max(0, chunk), type: 'concept', front: `Does the ${a.muscle.toLowerCase()} arise from or insert into the ${lower}?`, back: a.role === 'origin' ? `It arises (originates) from the ${lower}.` : `It inserts into the ${lower}.` });
  }
  pack.cards = cards;
  if (quiz.length >= 3) pack.quiz = quiz;
  pack.stats = { ...pack.stats, cards: cards.length, questions: pack.quiz.length };
  const id = await savePack(uid, pack, { sourceType: 'anatomy', sourceName: `Anatomy 3D: ${structure}${b.side ? ` (${b.side})` : ''}`, text });
  refreshPlan(uid);
  res.status(201).json({ id });
});
