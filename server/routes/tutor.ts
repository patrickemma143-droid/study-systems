// The whiteboard tutor: lessons taught step by step on a board with a natural voice, questions in
// the middle of a lesson, snapped homework problems, and practice that turns into flashcards.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ai, voice } from '../config';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { award } from '../points';
import { aiDay, assertAllowed, cachedJson, limitsFor, record } from '../ai/service';
import { AiError, speak } from '../ai/providers';
import { askRequest, lessonRequest, problemRequest } from '../ai/tutor';
import { boardText, cleanLesson, cleanSteps, type TutorLesson, type TutorMode } from '../../shared/tutor';
import { blocksFromPlainText, buildStudyPack, type CardSeed, type StudyPack } from '../../shared/engine';
import { fetchTopic } from '../services/wikipedia';
import { refreshPlan, savePack } from './packs';

export const tutorRouter = Router();
tutorRouter.use(requireAuth);

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function requireAi() {
  if (!ai.enabled) throw new HttpError(503, 'The AI tutor is not switched on for this site yet.');
}
function friendly(err: unknown): never {
  if (err instanceof AiError) throw new HttpError(err.status === 503 ? 503 : 502, err.message);
  if (err instanceof Error && /incomplete/.test(err.message)) throw new HttpError(502, 'The tutor got muddled making that lesson. Try again.');
  throw err;
}

async function packOf(uid: number, packId: number): Promise<{ row: any; data: StudyPack }> {
  const row = await db('packs').where({ id: packId, user_id: uid }).first();
  if (!row) throw new HttpError(404, 'Study pack not found.');
  return { row, data: parseJSON<StudyPack>(row.data, null as any) };
}
const chunkText = (c: StudyPack['chunks'][number]) => c.body.map((b) => (b.t === 'h' ? `\n## ${b.x}` : b.t === 'li' ? `- ${b.x}` : b.x)).join('\n');

async function saveLesson(uid: number, lesson: TutorLesson, packId: number | null, chunk: number | null) {
  const t = now();
  // the same lesson again: reopen it (and keep the place) rather than making a copy
  const same = await db('tutor_lessons').where({ user_id: uid, mode: lesson.mode, title: lesson.title, pack_id: packId, chunk_index: chunk }).first();
  if (same) {
    await db('tutor_lessons').where({ id: same.id }).update({ data: JSON.stringify(lesson), opened_at: t });
    return same.id as number;
  }
  const [id] = await db('tutor_lessons').insert({ user_id: uid, mode: lesson.mode, pack_id: packId, chunk_index: chunk, title: lesson.title, data: JSON.stringify(lesson), step: 0, created_at: t, opened_at: t });
  return id as number;
}

const startSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('topic'), topic: z.string().trim().min(2, 'Type a topic first.').max(160) }),
  z.object({ mode: z.literal('lesson'), packId: z.number().int(), chunk: z.number().int().min(0) }),
  z.object({ mode: z.literal('exam'), packId: z.number().int() }),
  z.object({ mode: z.literal('text'), title: z.string().trim().max(160).optional(), text: z.string().trim().min(40, 'Paste a bit more to teach from.').max(40_000) }),
]);

/** Start (or reopen) a whiteboard lesson. Lessons are shared: the same material is only made once. */
tutorRouter.post('/lesson', async (req, res) => {
  requireAi();
  const uid = userId(res);
  const b = startSchema.parse(req.body);
  let title = '';
  let material = '';
  let packId: number | null = null;
  let chunk: number | null = null;
  if (b.mode === 'topic') {
    title = b.topic;
    // ground the lesson in an encyclopedia article when one can be reached
    const src = await fetchTopic(b.topic).catch(() => null);
    if (src) {
      title = src.title;
      material = src.text.slice(0, 12000);
    }
  } else if (b.mode === 'lesson') {
    const { data } = await packOf(uid, b.packId);
    const c = data.chunks[b.chunk];
    if (!c) throw new HttpError(404, 'Lesson not found.');
    title = c.title;
    material = chunkText(c);
    packId = b.packId;
    chunk = b.chunk;
  } else if (b.mode === 'exam') {
    const { row, data } = await packOf(uid, b.packId);
    title = `Exam prep: ${row.title}`;
    // the most examinable lessons first, with their key points and terms
    const top = [...data.chunks].sort((x, y) => y.importance - x.importance).slice(0, 8);
    material = top.map((c) => `## ${c.title}\n${c.keyPoints.map((k) => `- ${k}`).join('\n')}`).join('\n\n') + (data.glossary.length ? `\n\n## Key terms\n${data.glossary.slice(0, 25).map((g) => `- ${g.term}: ${g.definition}`).join('\n')}` : '');
    packId = b.packId;
  } else {
    title = b.title || b.text.split(/\n/)[0].slice(0, 80);
    material = b.text;
  }
  try {
    const { data: lesson, cached } = await cachedJson(uid, 'teach', `lesson\n${b.mode}\n${title.toLowerCase()}\n${hash(material)}`, lessonRequest(b.mode, title, material), (raw) => cleanLesson(raw, b.mode));
    const id = await saveLesson(uid, lesson, packId, chunk);
    res.status(201).json({ id, cached, usage: await limitsFor(uid) });
  } catch (err) {
    friendly(err);
  }
});

/** A snapped or typed homework / past-paper problem, worked through on the board. */
tutorRouter.post('/problem', async (req, res) => {
  requireAi();
  const uid = userId(res);
  const b = z
    .object({
      text: z.string().trim().max(3000).optional(),
      image: z
        .string()
        .max(6_000_000)
        .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'That picture could not be read. Try a JPEG or PNG photo.')
        .optional(),
    })
    .refine((x) => (x.text && x.text.length >= 3) || x.image, { message: 'Take a photo of the problem or type it.' })
    .parse(req.body);
  const image = b.image ? { mime: b.image.slice(5, b.image.indexOf(';')), data: b.image.slice(b.image.indexOf(',') + 1) } : undefined;
  try {
    const { data: lesson, cached } = await cachedJson(uid, 'homework', `problem\n${hash((b.text || '') + '\n' + (image?.data || ''))}`, problemRequest(b.text || '', image), (raw) => cleanLesson(raw, 'homework'));
    const id = await saveLesson(uid, lesson, null, null);
    res.status(201).json({ id, cached, usage: await limitsFor(uid) });
  } catch (err) {
    friendly(err);
  }
});

tutorRouter.get('/lessons', async (_req, res) => {
  const rows = await db('tutor_lessons').where({ user_id: userId(res) }).orderBy('opened_at', 'desc').limit(12).select('id', 'mode', 'title', 'step', 'pack_id', 'chunk_index', 'opened_at', 'data');
  res.json({
    lessons: rows.map((r: any) => {
      const l = parseJSON<TutorLesson | null>(r.data, null);
      return { id: r.id, mode: r.mode, title: r.title, step: r.step, steps: l?.steps.length || 0, packId: r.pack_id, chunk: r.chunk_index, openedAt: Number(r.opened_at) };
    }),
  });
});

async function lessonRow(uid: number, id: number) {
  const row = await db('tutor_lessons').where({ id, user_id: uid }).first();
  if (!row) throw new HttpError(404, 'Lesson not found.');
  return { row, lesson: parseJSON<TutorLesson>(row.data, null as any) };
}

tutorRouter.get('/lessons/:id', async (req, res) => {
  const uid = userId(res);
  const { row, lesson } = await lessonRow(uid, Number(req.params.id));
  await db('tutor_lessons').where({ id: row.id }).update({ opened_at: now() });
  let next: { chunk: number; title: string } | null = null;
  let packTitle: string | null = null;
  if (row.pack_id != null) {
    const p = await db('packs').where({ id: row.pack_id, user_id: uid }).first();
    if (p) {
      const data = parseJSON<StudyPack | null>(p.data, null);
      packTitle = p.title;
      if (row.chunk_index != null && data && data.chunks[row.chunk_index + 1]) next = { chunk: row.chunk_index + 1, title: data.chunks[row.chunk_index + 1].title };
    }
  }
  res.json({ id: row.id, lesson, step: row.step, packId: row.pack_id, chunk: row.chunk_index, packTitle, next, voice: voice.enabled });
});

tutorRouter.patch('/lessons/:id', async (req, res) => {
  const b = z.object({ step: z.number().int().min(0).max(100) }).parse(req.body);
  await db('tutor_lessons').where({ id: Number(req.params.id), user_id: userId(res) }).update({ step: b.step, opened_at: now() });
  res.json({ ok: true });
});

/** "I have a question": answered on the board, then the lesson carries on. */
tutorRouter.post('/lessons/:id/ask', async (req, res) => {
  requireAi();
  const uid = userId(res);
  const b = z.object({ step: z.number().int().min(0).max(100), question: z.string().trim().min(2, 'Ask your question first.').max(800) }).parse(req.body);
  const { lesson } = await lessonRow(uid, Number(req.params.id));
  const upto = lesson.steps.slice(0, b.step + 1);
  const sofar = upto.map((s) => s.say).join('\n');
  // what is on the board now: everything since the last wipe
  const items = upto.flatMap((s) => s.board);
  const lastClear = items.map((x) => x.t).lastIndexOf('clear');
  const board = items.slice(lastClear + 1).map(boardText).filter(Boolean).join('\n');
  try {
    const { data } = await cachedJson(uid, 'tutor', `tutor-ask\n${hash(lesson.title + sofar)}\n${b.question.toLowerCase()}`, askRequest(lesson.title, sofar, board, b.question), (raw) => {
      const steps = cleanSteps(raw?.steps, 5);
      if (!steps.length) throw new AiError('The tutor could not answer that one. Try asking another way.');
      return { steps };
    });
    res.json({ ...data, usage: await limitsFor(uid) });
  } catch (err) {
    friendly(err);
  }
});

/** Practice answers are marked here, against the lesson, so points are fair. */
tutorRouter.post('/lessons/:id/practice', async (req, res) => {
  const uid = userId(res);
  const b = z.object({ answers: z.array(z.number().int().min(-1).max(9)).max(6) }).parse(req.body);
  const { row, lesson } = await lessonRow(uid, Number(req.params.id));
  const marked = lesson.practice.map((p, i) => ({ right: p.answer, ok: b.answers[i] === p.answer }));
  const score = marked.filter((m) => m.ok).length;
  let points = 0;
  if (lesson.practice.length >= 3) {
    points = await award(uid, 'memory', score * 3, `Whiteboard lesson practice: ${lesson.title} (${score}/${lesson.practice.length})`, `tutor-${uid}-${row.id}-${aiDay()}`, { score: Math.round((score / lesson.practice.length) * 100) }).catch(() => 0);
  }
  res.json({ score, total: lesson.practice.length, points, marked });
});

/** Keep the lesson: its summary and practice become flashcards (in the pack it came from, or a new pack). */
tutorRouter.post('/lessons/:id/save', async (req, res) => {
  const uid = userId(res);
  const { row, lesson } = await lessonRow(uid, Number(req.params.id));
  const cards: { front: string; back: string }[] = [
    ...lesson.practice.map((p) => ({ front: p.q, back: `${p.options[p.answer]}${p.explain ? `\n\n${p.explain}` : ''}` })),
    ...lesson.summary.map((s, i) => ({ front: `${lesson.title}: key point ${i + 1} — can you recall it?`, back: s })),
    ...(lesson.tryNext ? [{ front: lesson.tryNext.q, back: lesson.tryNext.answer }] : []),
  ];
  if (!cards.length) throw new HttpError(422, 'This lesson has nothing to turn into flashcards.');
  if (row.pack_id != null && (await db('packs').where({ id: row.pack_id, user_id: uid }).first())) {
    const t = now();
    const existing = new Set((await db('cards').where({ user_id: uid, pack_id: row.pack_id }).select('front')).map((c: any) => c.front));
    const fresh = cards.filter((c) => !existing.has(c.front));
    if (fresh.length) await db('cards').insert(fresh.map((c, i) => ({ user_id: uid, pack_id: row.pack_id, chunk_index: row.chunk_index ?? 0, type: 'custom', front: c.front, back: c.back, due_at: t + i })));
    return res.json({ packId: row.pack_id, added: fresh.length });
  }
  // a topic or homework lesson becomes a small study pack of its own
  const text = [lesson.title, ...lesson.steps.map((s) => [s.say, ...s.board.map(boardText).filter(Boolean)].join('\n')), lesson.summary.length ? `Summary\n${lesson.summary.map((s) => `- ${s}`).join('\n')}` : ''].join('\n\n');
  const pack = buildStudyPack(blocksFromPlainText(text), { title: lesson.title });
  pack.cards = cards.map<CardSeed>((c) => ({ chunk: 0, type: 'concept', front: c.front, back: c.back }));
  pack.stats = { ...pack.stats, cards: pack.cards.length };
  const packId = await savePack(uid, pack, { sourceType: 'tutor', sourceName: `Whiteboard lesson: ${lesson.title}`, text });
  await db('tutor_lessons').where({ id: row.id }).update({ pack_id: packId });
  refreshPlan(uid);
  res.status(201).json({ packId, added: pack.cards.length });
});

/** The tutor's natural voice for one step, as a small MP3. Shared: each sentence is spoken once. */
tutorRouter.post('/voice', async (req, res) => {
  const uid = userId(res);
  if (!voice.enabled) throw new HttpError(503, 'The natural voice is not switched on.');
  const b = z.object({ text: z.string().trim().min(1).max(900) }).parse(req.body);
  const key = hash(`${voice.model}\n${voice.voiceName}\n${b.text}`);
  let row = await db('tts_audio').where({ cache_key: key }).first();
  if (!row) {
    await assertAllowed(uid, 'voice');
    let speech;
    try {
      speech = await speak(b.text);
    } catch (err) {
      friendly(err);
    }
    await record(uid, 'voice', null, false, Math.round(speech.tokensOut * voice.priceOutput));
    try {
      await db('tts_audio').insert({ cache_key: key, mime: 'audio/mpeg', bytes: speech.mp3, duration_ms: speech.durationMs, hits: 0, created_at: now() });
    } catch {
      /* stored a moment ago by another request */
    }
    row = { bytes: speech.mp3, duration_ms: speech.durationMs, mime: 'audio/mpeg' };
  } else {
    await db('tts_audio').where({ id: row.id }).increment('hits', 1);
  }
  const bytes: Buffer = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
  res.setHeader('Content-Type', row.mime || 'audio/mpeg');
  res.setHeader('X-Duration-Ms', String(row.duration_ms || 0));
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.end(bytes);
});
