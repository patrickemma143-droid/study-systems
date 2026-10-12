// Study points. Every point comes from work the server can check for itself:
// flashcard answers (typed ones are re-marked here), quiz results, lessons proven by
// their cards or an explanation, and explanations re-marked against the student's notes.
import { db, now, parseJSON } from './db';
import { aiDay } from './ai/service';
import { checkRecall } from '../shared/engine/recall';
import { markTyped } from '../shared/engine/typed';
import { LEVEL_POINTS } from '../shared/engine/levels';
import { words } from '../shared/engine/text';
import type { StudyPack } from '../shared/engine/types';

export type Category = 'memory' | 'fast' | 'explain' | 'steady';

export const CATEGORY_LABEL: Record<Category, string> = {
  memory: 'Memory',
  fast: 'Fast learner',
  explain: 'Explainer',
  steady: 'Consistency',
};

/** Most points a student can earn per category in one day (stops grinding). */
const DAILY_CAP: Record<Category, number> = { memory: 250, fast: 200, explain: 200, steady: 20 };

/** Monday (YYYY-MM-DD) of the week a day falls in. Weeks run Monday to Sunday, Kampala time. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const thisWeek = () => weekOf(aiDay());
export const lastWeek = () => {
  const d = new Date(`${thisWeek()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
};

async function earnedToday(uid: number, category: Category, day: string) {
  const r = await db('points_events').where({ user_id: uid, category, day }).sum({ p: 'points' }).first();
  return Number((r as any)?.p || 0);
}

/**
 * Give points once per `dedupe` key, within the daily cap. With `best`, an existing award
 * for the same key is raised if the new one is higher (e.g. a better explanation).
 */
export async function award(uid: number, category: Category, points: number, reason: string, dedupe: string, opts: { score?: number; best?: boolean } = {}): Promise<number> {
  points = Math.max(0, Math.round(points));
  if (!points) return 0;
  const day = aiDay();
  const key = dedupe.slice(0, 120);
  const existing = await db('points_events').where({ dedupe: key }).first();
  if (existing && !opts.best) return 0;
  const room = DAILY_CAP[category] - (await earnedToday(uid, category, day)) + (existing && existing.day === day ? Number(existing.points) : 0);
  const give = Math.min(points, Math.max(0, room));
  if (existing) {
    if (give <= Number(existing.points)) return 0;
    await db('points_events').where({ id: existing.id }).update({ points: give, score: opts.score ?? existing.score, reason: reason.slice(0, 160) });
    return give - Number(existing.points);
  }
  if (!give) return 0;
  try {
    await db('points_events').insert({ user_id: uid, week: weekOf(day), day, category, points: give, reason: reason.slice(0, 160), score: opts.score ?? null, dedupe: key, created_at: now() });
  } catch {
    return 0; // the same award arrived twice at once
  }
  return give;
}

export async function removeAward(dedupe: string) {
  await db('points_events').where({ dedupe }).delete();
}

/** Has this student copied whole runs of words from the notes instead of explaining? */
export function copiedShare(answer: string, source: string): number {
  const a = words(answer.toLowerCase());
  if (a.length < 12) return 0;
  const src = new Set<string>();
  const s = words(source.toLowerCase());
  for (let i = 0; i + 6 <= s.length; i++) src.add(s.slice(i, i + 6).join(' '));
  let hits = 0;
  let total = 0;
  for (let i = 0; i + 6 <= a.length; i++) {
    total++;
    if (src.has(a.slice(i, i + 6).join(' '))) hits++;
  }
  return total ? hits / total : 0;
}

async function loadPack(uid: number, packId: number) {
  const row = await db('packs').where({ id: packId, user_id: uid }).select('id', 'title', 'data', 'created_at').first();
  if (!row) return null;
  const data = parseJSON<StudyPack | null>(row.data, null);
  return data ? { id: row.id as number, title: row.title as string, createdAt: Number(row.created_at), data } : null;
}

const chunkText = (pack: StudyPack, i: number) => (pack.chunks[i]?.body || []).map((b) => b.x).join(' ');

/** A lesson is "proven" once you show you know it; quicker learning earns a bonus. */
async function lessonProven(uid: number, packId: number, chunk: number, how: string) {
  const pack = await loadPack(uid, packId);
  if (!pack || !pack.data.chunks[chunk]) return 0;
  const days = (now() - pack.createdAt) / 86400_000;
  const speed = days <= 1 ? 2 : days <= 3 ? 1.5 : 1;
  const pts = 10 * speed;
  const label = speed > 1 ? ` (${speed === 2 ? 'double' : '1.5×'} for learning it fast)` : '';
  return award(uid, 'fast', pts, `Proved “${pack.data.chunks[chunk].title}” ${how}${label}`, `proven-${uid}-${packId}-${chunk}`);
}

// ─── Hooks called from the study routes ──────────────────────

export async function onReview(uid: number, reviewId: number, card: any, rating: number, typedText?: string | null): Promise<number> {
  let pts = 0;
  let reason = 'Remembered a flashcard';
  if (typedText != null && typedText.trim()) {
    const m = markTyped(typedText, String(card.back));
    pts = m.verdict === 'right' ? 3 : m.verdict === 'close' ? 2 : 0;
    reason = m.verdict === 'right' ? 'Typed a flashcard answer correctly' : 'Typed a flashcard answer nearly right';
  } else if (rating >= 3) pts = 1;
  let total = pts ? await award(uid, 'memory', pts, reason, `review-${reviewId}`) : 0;

  const t = now();
  const day = aiDay();
  // Answered every due card today
  const due = await db('cards').where({ user_id: uid, suspended: false }).andWhere('due_at', '<=', t).count({ n: '*' }).first();
  if (Number((due as any)?.n || 0) === 0) {
    const reviewed = await db('reviews').where({ user_id: uid, day }).count({ n: '*' }).first();
    if (Number((reviewed as any)?.n || 0) >= 10) total += await award(uid, 'memory', 15, 'Answered all your due flashcards', `cleared-${uid}-${day}`);
  }
  // Every card of this lesson answered right at least once → lesson proven
  if (rating >= 3) {
    const rows = await db('cards').where({ user_id: uid, pack_id: card.pack_id, chunk_index: card.chunk_index, suspended: false }).select('reps');
    if (rows.length >= 2 && rows.every((r: any) => Number(r.reps) >= 1)) total += await lessonProven(uid, card.pack_id, card.chunk_index, 'by getting all its cards right');
  }
  return total;
}

export async function onQuiz(uid: number, packId: number | null, score: number, total: number, level: 'easy' | 'medium' | 'hard' = 'medium'): Promise<number> {
  if (total < 3) return 0;
  const day = aiDay();
  const pct = Math.round((score / total) * 100);
  const attempt = await db('points_events').where({ user_id: uid, day }).andWhere('dedupe', 'like', `quiz-${uid}-${packId ?? 'mixed'}-${day}-%`).count({ n: '*' }).first();
  const n = Number((attempt as any)?.n || 0);
  if (n >= 2) return 0; // only your first two quizzes per pack per day count
  const per = LEVEL_POINTS[level];
  const name = level === 'hard' ? 'Hard quiz' : level === 'easy' ? 'Easy quiz' : 'Quiz';
  return award(uid, 'fast', Math.min(15 * per, score * per), `${name}: ${score}/${total} (${pct}%)`, `quiz-${uid}-${packId ?? 'mixed'}-${day}-${n}`, { score: pct });
}

export interface ExplainResult {
  points: number;
  score: number;
  copied: boolean;
}

/** Feynman: the explanation is re-marked here against the lesson, and copying is caught. */
export async function onExplain(uid: number, packId: number, chunk: number, text: string, peeked: boolean): Promise<ExplainResult> {
  const pack = await loadPack(uid, packId);
  const c = pack?.data.chunks[chunk];
  if (!pack || !c) return { points: 0, score: 0, copied: false };
  const check = checkRecall(text, c.keyPoints, c.keyTerms);
  const copied = copiedShare(text, chunkText(pack.data, chunk)) > 0.4;
  if (copied || check.wordCount < 20 || check.score < 40) return { points: 0, score: check.score, copied };
  let pts = check.score / 5 + (check.score >= 80 ? 5 : 0);
  if (peeked) pts /= 2;
  const got = await award(uid, 'explain', pts, `Explained “${c.title}” in your own words (${check.score}%)${peeked ? ', after peeking' : ''}`, `explain-${uid}-${packId}-${chunk}-${thisWeek()}`, { score: check.score, best: true });
  let bonus = 0;
  if (check.score >= 70 && !peeked) bonus = await lessonProven(uid, packId, chunk, 'by explaining it');
  return { points: got + bonus, score: check.score, copied };
}

/** Blurting: free recall across the lessons chosen. */
export async function onBlurt(uid: number, packId: number, lessons: number[], text: string): Promise<ExplainResult> {
  const pack = await loadPack(uid, packId);
  if (!pack) return { points: 0, score: 0, copied: false };
  const chunks = (lessons.length ? lessons : pack.data.chunks.map((c) => c.index)).map((i) => pack.data.chunks[i]).filter(Boolean);
  const check = checkRecall(text, chunks.flatMap((c) => c.keyPoints.slice(0, 4)), [...new Set(chunks.flatMap((c) => c.keyTerms.slice(0, 4)))]);
  const copied = copiedShare(text, chunks.map((c) => chunkText(pack.data, c.index)).join(' ')) > 0.4;
  if (copied || check.wordCount < 15 || check.score < 30) return { points: 0, score: check.score, copied };
  const pts = Math.min(25, check.score / 4);
  const got = await award(uid, 'explain', pts, `Recalled ${pack.title} from memory (${check.score}%)`, `blurt-${uid}-${packId}-${aiDay()}`, { score: check.score, best: true });
  return { points: got, score: check.score, copied };
}

/** Daily goal reached. */
export async function onActivity(uid: number) {
  const day = aiDay();
  const u = await db('users').where({ id: uid }).select('daily_goal').first();
  const m = await db('activity').where({ user_id: uid, day }).sum({ m: 'minutes' }).first();
  if (Number((m as any)?.m || 0) >= Number(u?.daily_goal || 20)) return award(uid, 'steady', 10, 'Reached your daily study goal', `goal-${uid}-${day}`);
  return 0;
}

// ─── Leaderboard ─────────────────────────────────────────────

export const norm = (s: string | null | undefined) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export async function leaderboard(week: string, opts: { university?: string; course?: string; limit?: number } = {}) {
  let q = db('points_events')
    .join('users', 'users.id', 'points_events.user_id')
    .where('points_events.week', week)
    .andWhere('users.leaderboard', true)
    .groupBy('users.id', 'users.name', 'users.university', 'users.course')
    .select('users.id', 'users.name', 'users.university', 'users.course')
    .sum({ total: 'points_events.points' })
    .sum({ memory: db.raw("CASE WHEN points_events.category = 'memory' THEN points_events.points ELSE 0 END") })
    .sum({ fast: db.raw("CASE WHEN points_events.category = 'fast' THEN points_events.points ELSE 0 END") })
    .sum({ explain: db.raw("CASE WHEN points_events.category = 'explain' THEN points_events.points ELSE 0 END") })
    .sum({ steady: db.raw("CASE WHEN points_events.category = 'steady' THEN points_events.points ELSE 0 END") })
    .max({ bestQuiz: db.raw("CASE WHEN points_events.dedupe LIKE 'quiz-%' THEN points_events.score END") })
    .max({ bestExplain: db.raw("CASE WHEN points_events.category = 'explain' THEN points_events.score END") })
    .orderBy('total', 'desc');
  if (opts.university) q = q.whereRaw('LOWER(TRIM(users.university)) = ?', [norm(opts.university)]);
  if (opts.course) q = q.whereRaw('LOWER(TRIM(users.course)) = ?', [norm(opts.course)]);
  const rows = (await q) as any[];
  const list = rows.map((r) => ({
    userId: Number(r.id),
    name: String(r.name),
    university: r.university || null,
    course: r.course || null,
    total: Number(r.total || 0),
    memory: Number(r.memory || 0),
    fast: Number(r.fast || 0),
    explain: Number(r.explain || 0),
    steady: Number(r.steady || 0),
    bestQuiz: r.bestQuiz == null ? null : Number(r.bestQuiz),
    bestExplain: r.bestExplain == null ? null : Number(r.bestExplain),
  }));
  list.sort((a, b) => b.total - a.total || b.explain - a.explain || a.userId - b.userId);
  return list.map((r, i) => ({ ...r, rank: i + 1 }));
}
