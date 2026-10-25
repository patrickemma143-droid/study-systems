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

let cache: { descriptions: Record<string, string>; latin: Record<string, string>; names: Map<string, string> } | null = null;
function data() {
  if (cache) return cache;
  const descriptions = readJson<Record<string, string>>(path.join(config.root, 'seed', 'anatomy', 'descriptions.json')) || {};
  const latin = readJson<Record<string, string>>(path.join(config.root, 'seed', 'anatomy', 'latin.json')) || {};
  const catalogue = readJson<{ structures: Record<string, { name: string }> }>(path.join(config.distDir, 'anatomy', 'catalogue.json'), path.join(config.root, 'public', 'anatomy', 'catalogue.json'));
  const names = new Map<string, string>();
  for (const [id, s] of Object.entries(catalogue?.structures || {})) names.set(id, s.name);
  cache = { descriptions, latin, names };
  return cache;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

anatomyRouter.get('/describe', (req, res) => {
  const name = clean(String(req.query.name || '')).slice(0, 200);
  if (!name) throw new HttpError(400, 'Which structure?');
  const d = data();
  const key = name.toLowerCase();
  // tidy leftovers of removed pronunciations: "( , pl. femurs)" → "(pl. femurs)"
  const desc = d.descriptions[key] ? d.descriptions[key].replace(/\(\s*[,;:]\s*/g, '(').replace(/\(\s*\)/g, '').replace(/ +([,.;])/g, '$1') : null;
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
