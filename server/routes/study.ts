import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { recallNow, schedule, type Rating } from '../../shared/srs';
import { onActivity, onBlurt, onExplain, onQuiz, onReview, removeAward } from '../points';
import { readinessFor } from '../readiness';
import type { QuizQuestion, StudyPack } from '../../shared/engine/types';
import { buildLevelQuiz } from '../../shared/engine/levels';

export const studyRouter = Router();
studyRouter.use(requireAuth);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function cardOut(c: any) {
  return {
    id: c.id,
    packId: c.pack_id,
    packTitle: c.pack_title,
    examDate: c.exam_date,
    chunk: c.chunk_index,
    ...(c.chunk_title !== undefined ? { chunkTitle: c.chunk_title } : {}),
    type: c.type,
    front: c.front,
    back: c.back,
    hint: c.hint,
    ease: Number(c.ease),
    interval: Number(c.interval_days),
    reps: Number(c.reps),
    lapses: Number(c.lapses),
    stability: c.stability == null ? null : Number(c.stability),
    difficulty: c.difficulty == null ? null : Number(c.difficulty),
    lastReviewedAt: c.last_reviewed_at == null ? null : Number(c.last_reviewed_at),
    dueAt: Number(c.due_at),
    suspended: !!c.suspended,
  };
}

// ─── Flashcards ───────────────────────────────────────────────
studyRouter.get('/cards', async (req, res) => {
  const uid = userId(res);
  const q = z
    .object({
      packId: z.coerce.number().int().optional(),
      chunks: z.string().optional(),
      mode: z.enum(['due', 'all', 'weak']).default('due'),
      ids: z.string().max(2000).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(30),
    })
    .parse(req.query);
  const t = now();
  let query = db('cards')
    .join('packs', 'packs.id', 'cards.pack_id')
    .where({ 'cards.user_id': uid, 'cards.suspended': false })
    .select('cards.*', 'packs.title as pack_title', 'packs.exam_date');
  if (q.packId) query = query.where('cards.pack_id', q.packId);
  if (q.chunks) {
    const list = q.chunks.split(',').map(Number).filter((n) => Number.isInteger(n));
    if (list.length) query = query.whereIn('cards.chunk_index', list);
  }
  if (q.ids) {
    // a hand-picked set, e.g. the weak-spot coach's "drill these 10 cards"
    const list = q.ids.split(',').map(Number).filter((n) => Number.isInteger(n)).slice(0, 100);
    query = query.whereIn('cards.id', list.length ? list : [-1]);
  }
  if (q.ids) {
    query = query.orderBy('cards.lapses', 'desc');
  } else if (q.mode === 'due') {
    query = query.where('cards.due_at', '<=', t).orderByRaw('CASE WHEN cards.reps > 0 THEN 0 ELSE 1 END').orderBy('cards.due_at', 'asc');
  } else if (q.mode === 'weak') {
    query = query.where((w) => w.where('cards.lapses', '>', 0).orWhere('cards.difficulty', '>', 7).orWhere('cards.ease', '<', 2.3)).orderBy('cards.lapses', 'desc');
  } else {
    query = query.orderBy([{ column: 'cards.chunk_index' }, { column: 'cards.id' }]);
  }
  let rows: any[];
  if (q.mode === 'due' && !q.ids) {
    // Most-at-risk first: the cards you are closest to forgetting come up before the safe ones.
    const pool = await query.limit(Math.max(q.limit, 400));
    const state = (c: any) => ({ ease: Number(c.ease), interval_days: Number(c.interval_days), reps: Number(c.reps), lapses: Number(c.lapses), stability: c.stability == null ? null : Number(c.stability), last_reviewed_at: c.last_reviewed_at == null ? null : Number(c.last_reviewed_at) });
    const reviewed = pool.filter((c: any) => Number(c.reps) > 0 || c.last_reviewed_at).sort((a: any, b: any) => recallNow(state(a), t) - recallNow(state(b), t));
    const fresh = pool.filter((c: any) => !(Number(c.reps) > 0 || c.last_reviewed_at));
    rows = [...reviewed, ...fresh].slice(0, q.limit);
  } else rows = await query.limit(q.limit);
  // Which lesson each card comes from, so the card can show its heading
  const titles = new Map<number, string[]>();
  for (const pid of [...new Set(rows.map((r: any) => Number(r.pack_id)))]) {
    const pk = await db('packs').where({ id: pid }).select('data').first();
    titles.set(pid, (parseJSON<StudyPack | null>(pk?.data, null)?.chunks || []).map((c) => c.title));
  }
  for (const r of rows as any[]) r.chunk_title = titles.get(Number(r.pack_id))?.[Number(r.chunk_index)] || null;
  const dueCount = await db('cards').where({ user_id: uid, suspended: false }).andWhere('due_at', '<=', t).modify((b) => q.packId && b.where('pack_id', q.packId)).count({ n: '*' }).first();
  res.json({ cards: rows.map(cardOut), dueTotal: Number((dueCount as any)?.n || 0) });
});

studyRouter.post('/cards/:id/review', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ rating: z.number().int().min(1).max(4), day, typed: z.boolean().optional(), typedText: z.string().max(2000).optional() }).parse(req.body);
  const card = await db('cards').join('packs', 'packs.id', 'cards.pack_id').where({ 'cards.id': Number(req.params.id), 'cards.user_id': uid }).select('cards.*', 'packs.exam_date').first();
  if (!card) throw new HttpError(404, 'Card not found.');
  const t = now();
  const next = schedule(
    {
      ease: Number(card.ease),
      interval_days: Number(card.interval_days),
      reps: Number(card.reps),
      lapses: Number(card.lapses),
      stability: card.stability == null ? null : Number(card.stability),
      difficulty: card.difficulty == null ? null : Number(card.difficulty),
      last_reviewed_at: card.last_reviewed_at == null ? null : Number(card.last_reviewed_at),
    },
    body.rating as Rating,
    t,
    card.exam_date,
  );
  const prev = { ease: card.ease, stability: card.stability, difficulty: card.difficulty, interval_days: card.interval_days, reps: card.reps, lapses: card.lapses, due_at: card.due_at, last_reviewed_at: card.last_reviewed_at };
  await db('cards').where({ id: card.id }).update(next);
  const [reviewId] = await db('reviews').insert({ user_id: uid, card_id: card.id, rating: body.rating, interval_days: next.interval_days, reviewed_at: t, day: body.day, typed: !!body.typed, prev_state: JSON.stringify(prev) });
  const points = await onReview(uid, Number(reviewId), { ...card, ...next }, body.rating, body.typed ? body.typedText : null).catch(() => 0);
  res.json({ card: cardOut({ ...card, ...next }), points, reviewId: Number(reviewId) });
});

/** Step back: undo your latest rating of this card (within 30 minutes) so you can rate it again. */
studyRouter.post('/cards/:id/undo', async (req, res) => {
  const uid = userId(res);
  const cardId = Number(req.params.id);
  const last = await db('reviews').where({ user_id: uid, card_id: cardId }).andWhere('reviewed_at', '>=', now() - 30 * 60000).orderBy('id', 'desc').first();
  if (!last || !last.prev_state) throw new HttpError(409, 'That rating can no longer be changed.');
  const prev = parseJSON<Record<string, unknown> | null>(last.prev_state, null);
  if (!prev) throw new HttpError(409, 'That rating can no longer be changed.');
  await db('cards').where({ id: cardId, user_id: uid }).update(prev);
  await db('reviews').where({ id: last.id }).delete();
  await removeAward(`review-${last.id}`);
  const row = await db('cards').join('packs', 'packs.id', 'cards.pack_id').where({ 'cards.id': cardId }).select('cards.*', 'packs.title as pack_title', 'packs.exam_date').first();
  res.json({ card: cardOut(row) });
});

const cardEdit = z.object({ front: z.string().trim().min(1).max(2000), back: z.string().trim().min(1).max(4000), hint: z.string().trim().max(255).optional() });

studyRouter.post('/cards', async (req, res) => {
  const uid = userId(res);
  const body = cardEdit.extend({ packId: z.number().int(), chunk: z.number().int().min(0).default(0) }).parse(req.body);
  const pack = await db('packs').where({ id: body.packId, user_id: uid }).first();
  if (!pack) throw new HttpError(404, 'Study pack not found.');
  const [id] = await db('cards').insert({ user_id: uid, pack_id: body.packId, chunk_index: body.chunk, type: 'custom', front: body.front, back: body.back, hint: body.hint || null, due_at: now() });
  const row = await db('cards').where({ id }).first();
  res.status(201).json({ card: cardOut(row) });
});

studyRouter.patch('/cards/:id', async (req, res) => {
  const uid = userId(res);
  const body = cardEdit.partial().extend({ suspended: z.boolean().optional() }).parse(req.body);
  const n = await db('cards').where({ id: Number(req.params.id), user_id: uid }).update(body);
  if (!n) throw new HttpError(404, 'Card not found.');
  res.json({ ok: true });
});

studyRouter.delete('/cards/:id', async (req, res) => {
  await db('cards').where({ id: Number(req.params.id), user_id: userId(res) }).delete();
  res.json({ ok: true });
});

// ─── Quizzes ──────────────────────────────────────────────────
studyRouter.post('/quiz', async (req, res) => {
  const uid = userId(res);
  const body = z
    .object({
      packId: z.number().int().nullable(),
      mode: z.string().max(20),
      level: z.enum(['easy', 'medium', 'hard']).default('medium'),
      score: z.number().int().min(0),
      total: z.number().int().min(1),
      wrong: z.array(z.object({ packId: z.number().int(), chunk: z.number().int() })).max(200).default([]),
      details: z.unknown().optional(),
    })
    .parse(req.body);
  if (body.packId) {
    const own = await db('packs').where({ id: body.packId, user_id: uid }).first();
    if (!own) throw new HttpError(404, 'Study pack not found.');
  }
  await db('quiz_attempts').insert({ user_id: uid, pack_id: body.packId, mode: body.mode, score: body.score, total: body.total, details: body.details ? JSON.stringify(body.details).slice(0, 200_000) : null, created_at: now() });
  // Testing effect: bring the flashcards of chunks you got wrong forward for review.
  for (const w of body.wrong.slice(0, 30)) {
    await db('cards').where({ user_id: uid, pack_id: w.packId, chunk_index: w.chunk }).andWhere('due_at', '>', now()).update({ due_at: now() });
  }
  const points = await onQuiz(uid, body.packId, body.score, body.total, body.level).catch(() => 0);
  res.status(201).json({ ok: true, points });
});

/** Interleaved practice: questions mixed from all your packs. */
studyRouter.get('/mixed', async (req, res) => {
  const uid = userId(res);
  const limit = Math.min(30, Number(req.query.limit) || 12);
  const level = z.enum(['easy', 'medium', 'hard']).catch('medium').parse(req.query.level);
  const packs = await db('packs').where({ user_id: uid }).select('id', 'title', 'data').orderBy('last_opened_at', 'desc').limit(12);
  const pool: { packId: number; packTitle: string; q: QuizQuestion }[] = [];
  for (const p of packs as any[]) {
    const data = parseJSON<StudyPack | null>(p.data, null);
    if (data) for (const q of buildLevelQuiz(data, level)) pool.push({ packId: p.id, packTitle: p.title, q });
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // round-robin across packs so topics are genuinely interleaved
  const byPack = new Map<number, typeof pool>();
  for (const item of pool) (byPack.get(item.packId) || byPack.set(item.packId, []).get(item.packId)!).push(item);
  const out: typeof pool = [];
  while (out.length < limit && [...byPack.values()].some((a) => a.length)) {
    for (const a of byPack.values()) if (a.length && out.length < limit) out.push(a.shift()!);
  }
  res.json({ questions: out });
});

// ─── Lesson progress ──────────────────────────────────────────
studyRouter.put('/progress', async (req, res) => {
  const uid = userId(res);
  const body = z
    .object({ packId: z.number().int(), chunk: z.number().int().min(0), status: z.enum(['new', 'read', 'understood', 'mastered']).optional(), recall: z.number().int().min(0).max(100).optional() })
    .parse(req.body);
  const own = await db('packs').where({ id: body.packId, user_id: uid }).first();
  if (!own) throw new HttpError(404, 'Study pack not found.');
  const rank = { new: 0, read: 1, understood: 2, mastered: 3 } as const;
  const existing = await db('chunk_progress').where({ user_id: uid, pack_id: body.packId, chunk_index: body.chunk }).first();
  if (!existing) {
    await db('chunk_progress').insert({ user_id: uid, pack_id: body.packId, chunk_index: body.chunk, status: body.status || 'read', best_recall: body.recall ?? null, updated_at: now() });
  } else {
    const patch: Record<string, unknown> = { updated_at: now() };
    if (body.status && (req.query.force === '1' || rank[body.status] > rank[existing.status as keyof typeof rank])) patch.status = body.status;
    if (body.recall !== undefined && body.recall > (existing.best_recall ?? -1)) patch.best_recall = body.recall;
    await db('chunk_progress').where({ id: existing.id }).update(patch);
  }
  const row = await db('chunk_progress').where({ user_id: uid, pack_id: body.packId, chunk_index: body.chunk }).first();
  res.json({ progress: { status: row.status, bestRecall: row.best_recall } });
});

// ─── Notes (Feynman explanations, blurts, mnemonics, palace) ──
const noteKinds = z.enum(['feynman', 'blurt', 'mnemonic', 'palace', 'elaboration', 'note']);

studyRouter.get('/notes', async (req, res) => {
  const q = z.object({ packId: z.coerce.number().int(), kind: noteKinds.optional() }).parse(req.query);
  let query = db('notes').where({ user_id: userId(res), pack_id: q.packId });
  if (q.kind) query = query.where('kind', q.kind);
  const rows = await query.orderBy('created_at', 'desc').limit(200);
  res.json({ notes: rows.map((n: any) => ({ id: n.id, chunk: n.chunk_index, kind: n.kind, content: parseJSON(n.content, {}), createdAt: Number(n.created_at) })) });
});

studyRouter.post('/notes', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ packId: z.number().int(), chunk: z.number().int().nullable().optional(), kind: noteKinds, content: z.record(z.string(), z.unknown()) }).parse(req.body);
  const own = await db('packs').where({ id: body.packId, user_id: uid }).first();
  if (!own) throw new HttpError(404, 'Study pack not found.');
  const content = JSON.stringify(body.content);
  if (content.length > 100_000) throw new HttpError(413, 'That note is too long.');
  // palace/mnemonic notes are "one per item": replace the previous version
  if (body.kind === 'palace' || body.kind === 'mnemonic') {
    const key = (body.content as any).key;
    if (key !== undefined) {
      const old = await db('notes').where({ user_id: uid, pack_id: body.packId, kind: body.kind }).select('id', 'content');
      const same = old.filter((o: any) => parseJSON<any>(o.content, {}).key === key).map((o: any) => o.id);
      if (same.length) await db('notes').whereIn('id', same).delete();
    }
  }
  const [id] = await db('notes').insert({ user_id: uid, pack_id: body.packId, chunk_index: body.chunk ?? null, kind: body.kind, content, created_at: now() });
  // The server reads the saved work itself and marks it for points.
  const c = body.content as any;
  let result = { points: 0, score: 0, copied: false };
  if (body.kind === 'feynman' && body.chunk != null && typeof c.text === 'string') result = await onExplain(uid, body.packId, body.chunk, c.text, !!c.peeked).catch(() => result);
  if (body.kind === 'blurt' && typeof c.text === 'string') result = await onBlurt(uid, body.packId, Array.isArray(c.lessons) ? c.lessons.filter((x: unknown) => Number.isInteger(x)) : [], c.text).catch(() => result);
  res.status(201).json({ id, ...result });
});

studyRouter.delete('/notes/:id', async (req, res) => {
  await db('notes').where({ id: Number(req.params.id), user_id: userId(res) }).delete();
  res.json({ ok: true });
});

// ─── Activity, streaks and stats ──────────────────────────────
studyRouter.post('/activity', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ packId: z.number().int().nullable().optional(), method: z.string().max(30), minutes: z.number().min(0).max(600), day }).parse(req.body);
  if (body.minutes < 0.1) return res.json({ ok: true });
  let packId = body.packId ?? null;
  if (packId) {
    const own = await db('packs').where({ id: packId, user_id: uid }).first();
    if (!own) packId = null;
  }
  await db('activity').insert({ user_id: uid, pack_id: packId, method: body.method, minutes: Math.round(body.minutes * 10) / 10, day: body.day, created_at: now() });
  await onActivity(uid).catch(() => 0);
  res.json({ ok: true });
});

function shiftDay(d: string, delta: number): string {
  const dt = new Date(`${d}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

studyRouter.get('/stats', async (req, res) => {
  const uid = userId(res);
  const today = day.parse(req.query.day);
  const since = shiftDay(today, -60);
  const t = now();

  const actDays = await db('activity').where({ user_id: uid }).andWhere('day', '>=', since).groupBy('day').select('day').sum({ minutes: 'minutes' });
  const revDays = await db('reviews').where({ user_id: uid }).andWhere('day', '>=', since).groupBy('day').select('day').count({ n: '*' });
  const minutesByDay = new Map(actDays.map((r: any) => [r.day, Number(r.minutes)]));
  const reviewsByDay = new Map(revDays.map((r: any) => [r.day, Number(r.n)]));
  const active = (d: string) => (minutesByDay.get(d) || 0) > 0 || (reviewsByDay.get(d) || 0) > 0;

  let streak = 0;
  let cursor = active(today) ? today : shiftDay(today, -1);
  while (active(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDay(today, i - 6);
    return { day: d, minutes: Math.round(minutesByDay.get(d) || 0), reviews: reviewsByDay.get(d) || 0 };
  });

  const due = await db('cards').where({ user_id: uid, suspended: false }).andWhere('due_at', '<=', t).count({ n: '*' }).first();
  const totals = await db('cards').where({ user_id: uid, suspended: false }).count({ total: '*' }).sum({ strong: db.raw('CASE WHEN interval_days >= 7 THEN 1 ELSE 0 END') }).first();
  const user = await db('users').where({ id: uid }).first();
  const exams = await db('packs').where({ user_id: uid }).whereNotNull('exam_date').andWhere('exam_date', '>=', today).select('id', 'title', 'exam_date').orderBy('exam_date', 'asc').limit(5);

  res.json({
    streak,
    today: { minutes: Math.round(minutesByDay.get(today) || 0), reviews: reviewsByDay.get(today) || 0, goal: user?.daily_goal ?? 20 },
    week,
    dueCards: Number((due as any)?.n || 0),
    totalCards: Number((totals as any)?.total || 0),
    strongCards: Number((totals as any)?.strong || 0),
    exams: await Promise.all(
      exams.map(async (e: any) => {
        const r = await readinessFor(uid, e.id).catch(() => null);
        return { packId: e.id, title: e.title, examDate: e.exam_date, readiness: r ? { score: r.score, label: r.label, message: r.message } : null };
      }),
    ),
  });
});

// ─── After the paper: "How did it go?" ───────────────────────
studyRouter.get('/exam-reviews/pending', async (req, res) => {
  const uid = userId(res);
  const today = day.parse(req.query.day);
  const since = shiftDay(today, -21);
  const packs = await db('packs').where({ user_id: uid }).whereNotNull('exam_date').andWhere('exam_date', '<', today).andWhere('exam_date', '>=', since).select('id', 'title', 'exam_date', 'data');
  const done = new Set((await db('exam_reviews').where({ user_id: uid }).select('pack_id')).map((r: any) => Number(r.pack_id)));
  const pending = (packs as any[])
    .filter((p) => !done.has(Number(p.id)))
    .map((p) => ({ packId: p.id, title: p.title, examDate: p.exam_date, lessons: (parseJSON<StudyPack | null>(p.data, null)?.chunks || []).map((c) => ({ index: c.index, title: c.title })) }));
  res.json({ pending });
});

studyRouter.post('/exam-reviews', async (req, res) => {
  const uid = userId(res);
  const body = z
    .object({
      packId: z.number().int(),
      howItWent: z.number().int().min(1).max(5),
      appRating: z.number().int().min(1).max(5).nullable().optional(),
      topics: z.array(z.number().int()).max(100).default([]),
      comment: z.string().trim().max(2000).optional(),
    })
    .parse(req.body);
  const own = await db('packs').where({ id: body.packId, user_id: uid }).first();
  if (!own) throw new HttpError(404, 'Study pack not found.');
  const r = await readinessFor(uid, body.packId).catch(() => null);
  await db('exam_reviews').where({ user_id: uid, pack_id: body.packId }).delete();
  await db('exam_reviews').insert({ user_id: uid, pack_id: body.packId, how_it_went: body.howItWent, app_rating: body.appRating ?? null, readiness: r?.score ?? null, topics: JSON.stringify(body.topics), comment: body.comment || null, created_at: now() });
  res.status(201).json({ ok: true });
});
