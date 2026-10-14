import { Router } from 'express';
import { regenerate } from './plan';
import { readinessFor } from '../readiness';
import { z } from 'zod';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { blocksFromPlainText, buildStudyPack, type SourceBlock, type StudyPack } from '../../shared/engine';
import { resourceLinks } from '../../shared/resources';
import { SAMPLE_NOTES, SAMPLE_TITLE } from '../../shared/sample';
import { fetchTopic } from '../services/wikipedia';

/** New notes or a new exam date change the timetable: rebuild it in the background. */
function refreshPlan(uid: number) {
  db('users')
    .where({ id: uid })
    .select('study_prefs')
    .first()
    .then((u: any) => (u?.study_prefs && JSON.parse(u.study_prefs).setup ? regenerate(uid) : null))
    .catch((err: any) => console.warn('Timetable refresh failed:', err?.message || err));
}

export const packsRouter = Router();
packsRouter.use(requireAuth);

const MAX_WORDS = 120_000;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30.').nullable().optional();

const blockSchema = z.object({
  kind: z.enum(['heading', 'para', 'item']),
  text: z.string().max(20_000),
  level: z.number().int().min(1).max(6).optional(),
  page: z.number().int().min(0).optional(),
});

const createSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    sourceType: z.enum(['pdf', 'docx', 'pptx', 'txt', 'paste', 'image']),
    sourceName: z.string().trim().max(255).optional(),
    blocks: z.array(blockSchema).max(60_000).optional(),
    text: z.string().max(1_500_000).optional(),
    examDate: dateStr,
  })
  .refine((b) => (b.blocks && b.blocks.length) || (b.text && b.text.trim().length), { message: 'Add some notes or a file first.' });

function sourceText(blocks: SourceBlock[]): string {
  return blocks.map((b) => (b.kind === 'heading' ? `\n${b.text}\n` : b.kind === 'item' ? `- ${b.text}` : b.text)).join('\n');
}

async function savePack(uid: number, pack: StudyPack, meta: { sourceType: string; sourceName?: string; examDate?: string | null; text: string }) {
  const t = now();
  const id = await db.transaction(async (trx) => {
    const [packId] = await trx('packs').insert({
      user_id: uid,
      title: pack.title,
      source_type: meta.sourceType,
      source_name: meta.sourceName || null,
      exam_date: meta.examDate || null,
      source_text: meta.text,
      data: JSON.stringify(pack),
      stats: JSON.stringify(pack.stats),
      created_at: t,
      updated_at: t,
      last_opened_at: t,
    });
    const rows_len = pack.cards.length;
    const rows = pack.cards.map((c, i) => ({
      user_id: uid,
      pack_id: packId,
      chunk_index: c.chunk,
      type: c.type,
      front: c.front,
      back: c.back,
      hint: c.hint?.slice(0, 255) || null,
      due_at: t - rows_len + i, // all due now, keeping the original order
    }));
    for (let i = 0; i < rows.length; i += 100) await trx('cards').insert(rows.slice(i, i + 100));
    return packId as number;
  });
  return id;
}

function assertUsable(pack: StudyPack) {
  if (pack.stats.words < 40) throw new HttpError(422, 'There isn’t enough readable text here. If this is a scanned PDF or photos of notes, copy the text in or try a different file.');
}

packsRouter.post('/', async (req, res) => {
  const body = createSchema.parse(req.body);
  const blocks: SourceBlock[] = body.blocks?.length ? body.blocks : blocksFromPlainText(body.text || '');
  const text = sourceText(blocks);
  if (text.split(/\s+/).length > MAX_WORDS) throw new HttpError(413, 'This file is very large. Split it into chapters (under about 300 pages each) and add them one at a time.');
  const firstHeading = blocks.slice(0, 4).find((b) => b.kind === 'heading' && b.text.split(/\s+/).length <= 14)?.text;
  const pack = buildStudyPack(blocks, { title: body.title || firstHeading || body.sourceName?.replace(/\.[a-z0-9]+$/i, '') });
  assertUsable(pack);
  const id = await savePack(userId(res), pack, { sourceType: body.sourceType, sourceName: body.sourceName, examDate: body.examDate, text });
  refreshPlan(userId(res));
  res.status(201).json({ id });
});

packsRouter.post('/topic', async (req, res) => {
  const body = z.object({ topic: z.string().trim().min(2, 'Type a topic first.').max(160), examDate: dateStr }).parse(req.body);
  let src;
  try {
    src = await fetchTopic(body.topic);
  } catch {
    throw new HttpError(502, 'Couldn’t reach Wikipedia right now. Check your internet connection and try again.');
  }
  if (!src) throw new HttpError(404, `No good article found for “${body.topic}”. Try a more common name for the topic.`);
  const blocks = blocksFromPlainText(src.text);
  const pack = buildStudyPack(blocks, { title: src.title });
  assertUsable(pack);
  pack.resources = resourceLinks(src.title, src.url, src.simpleUrl);
  pack.simpleIntro = src.simpleIntro;
  const id = await savePack(userId(res), pack, { sourceType: 'topic', sourceName: src.url, examDate: body.examDate, text: src.text });
  refreshPlan(userId(res));
  res.status(201).json({ id, related: src.related });
});

packsRouter.post('/sample', async (_req, res) => {
  const pack = buildStudyPack(blocksFromPlainText(SAMPLE_NOTES), { title: SAMPLE_TITLE });
  pack.resources = resourceLinks('cell biology mitosis meiosis');
  const id = await savePack(userId(res), pack, { sourceType: 'paste', sourceName: 'Sample lecture', text: SAMPLE_NOTES });
  refreshPlan(userId(res));
  res.status(201).json({ id });
});

packsRouter.get('/', async (_req, res) => {
  const uid = userId(res);
  const t = now();
  const packs = await db('packs')
    .where({ user_id: uid })
    .select('id', 'title', 'source_type', 'source_name', 'exam_date', 'stats', 'created_at', 'last_opened_at')
    .orderBy([{ column: 'last_opened_at', order: 'desc' }, { column: 'id', order: 'desc' }]);
  const cardRows = await db('cards')
    .where({ user_id: uid, suspended: false })
    .groupBy('pack_id')
    .select('pack_id')
    .count({ total: '*' })
    .sum({ due: db.raw('CASE WHEN due_at <= ? THEN 1 ELSE 0 END', [t]) })
    .sum({ known: db.raw('CASE WHEN interval_days >= 1 THEN 1 ELSE 0 END') });
  const progRows = await db('chunk_progress')
    .where({ user_id: uid })
    .whereIn('status', ['understood', 'mastered'])
    .groupBy('pack_id')
    .select('pack_id')
    .count({ done: '*' });
  const cards = new Map(cardRows.map((r: any) => [Number(r.pack_id), r]));
  const prog = new Map(progRows.map((r: any) => [Number(r.pack_id), Number(r.done)]));
  res.json({
    packs: packs.map((p: any) => {
      const stats = parseJSON(p.stats, { chunks: 0, cards: 0, words: 0, questions: 0, readMinutes: 0 });
      const c: any = cards.get(Number(p.id)) || {};
      const total = Number(c.total || 0);
      const known = Number(c.known || 0);
      const done = prog.get(Number(p.id)) || 0;
      const mastery = Math.round(100 * (0.5 * (stats.chunks ? done / stats.chunks : 0) + 0.5 * (total ? known / total : 0)));
      return {
        id: p.id,
        title: p.title,
        sourceType: p.source_type,
        examDate: p.exam_date,
        createdAt: Number(p.created_at),
        lastOpenedAt: Number(p.last_opened_at || p.created_at),
        stats,
        due: Number(c.due || 0),
        chunksDone: done,
        mastery,
      };
    }),
  });
});

async function ownPack(uid: number, id: number) {
  const pack = await db('packs').where({ id, user_id: uid }).first();
  if (!pack) throw new HttpError(404, 'This study pack doesn’t exist or was deleted.');
  return pack;
}

packsRouter.get('/:id', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  const row = await ownPack(uid, id);
  await db('packs').where({ id }).update({ last_opened_at: now() });
  const t = now();
  const progress = await db('chunk_progress').where({ user_id: uid, pack_id: id }).select('chunk_index', 'status', 'best_recall');
  const cards = await db('cards').where({ user_id: uid, pack_id: id, suspended: false }).select('chunk_index', 'interval_days', 'reps', 'due_at');
  const quiz = await db('quiz_attempts').where({ user_id: uid, pack_id: id }).select('score', 'total', 'created_at').orderBy('created_at', 'desc').limit(20);

  const byChunk: Record<number, { total: number; known: number }> = {};
  const counts = { total: cards.length, due: 0, new: 0, learning: 0, growing: 0, strong: 0 };
  for (const c of cards as any[]) {
    const iv = Number(c.interval_days);
    const reps = Number(c.reps);
    if (Number(c.due_at) <= t) counts.due++;
    if (reps === 0 && iv === 0) counts.new++;
    else if (iv < 1) counts.learning++;
    else if (iv < 7) counts.growing++;
    else counts.strong++;
    const b = (byChunk[c.chunk_index] ||= { total: 0, known: 0 });
    b.total++;
    if (iv >= 1) b.known++;
  }

  const data = parseJSON<StudyPack | null>(row.data, null);
  res.json({
    pack: {
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      sourceName: row.source_name,
      examDate: row.exam_date,
      createdAt: Number(row.created_at),
      data,
    },
    readiness: await readinessFor(uid, id, data, row.exam_date).catch(() => null),
    progress: Object.fromEntries(progress.map((p: any) => [p.chunk_index, { status: p.status, bestRecall: p.best_recall }])),
    cards: { ...counts, byChunk },
    quiz: quiz.map((q: any) => ({ score: q.score, total: q.total, at: Number(q.created_at) })),
  });
});

packsRouter.get('/:id/source', async (req, res) => {
  const row = await ownPack(userId(res), Number(req.params.id));
  res.json({ text: row.source_text || '' });
});

packsRouter.patch('/:id', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  await ownPack(uid, id);
  const body = z.object({ title: z.string().trim().min(1).max(200).optional(), examDate: dateStr }).parse(req.body);
  const patch: Record<string, unknown> = { updated_at: now() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.examDate !== undefined) patch.exam_date = body.examDate;
  await db('packs').where({ id }).update(patch);
  refreshPlan(userId(res));
  res.json({ ok: true });
});

packsRouter.delete('/:id', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  await ownPack(uid, id);
  await db('packs').where({ id, user_id: uid }).delete();
  refreshPlan(userId(res));
  res.json({ ok: true });
});
