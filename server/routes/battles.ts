// Quiz battles: challenge a classmate to the same questions. Answers are marked here on the
// server (the browser never sees the answers before playing), so results are fair.
// Two kinds: a challenge (each player plays when they open the link) and a live battle
// (both start together and see each other's score move after every question).
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { award } from '../points';
import { sendToUser } from '../notify';
import { buildLevelQuiz, type Level } from '../../shared/engine/levels';
import { answerMatches, shuffle } from '../../shared/engine/text';
import type { QuizQuestion, StudyPack } from '../../shared/engine/types';

export const battlesRouter = Router();
battlesRouter.use(requireAuth);

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(7), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const WEEK = 7 * 86400_000;
const LIVE_LOBBY = 2 * 3600_000; // a live battle waits two hours for its opponent
export const SECONDS_PER_QUESTION = 20;
const COUNTDOWN_MS = 4000;
const WIN_POINTS: Record<Level, number> = { easy: 6, medium: 10, hard: 16 };

type BattleQ = Extract<QuizQuestion, { type: 'mcq' | 'tf' | 'fill' }>;
type Side = 'creator' | 'opponent';
type Answer = number | boolean | string | null;

function publicQuestion(q: BattleQ, i: number) {
  if (q.type === 'mcq') return { i, type: 'mcq' as const, prompt: q.prompt, options: q.options };
  if (q.type === 'tf') return { i, type: 'tf' as const, prompt: q.prompt };
  return { i, type: 'fill' as const, prompt: q.prompt };
}
function isRight(q: BattleQ, a: unknown): boolean {
  if (q.type === 'mcq') return Number(a) === q.answer && a !== null && a !== '';
  if (q.type === 'tf') return a === q.answer;
  return typeof a === 'string' && answerMatches(a, [q.answer, ...(q.accept || [])]);
}
function rightAnswer(q: BattleQ): string {
  return q.type === 'mcq' ? q.options[q.answer] : q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.answer;
}

async function names(ids: (number | null)[]) {
  const list = ids.filter((x): x is number => !!x);
  const rows = list.length ? await db('users').whereIn('id', list).select('id', 'name') : [];
  return new Map((rows as any[]).map((r) => [Number(r.id), String(r.name)]));
}

const answersOf = (b: any, side: Side) => parseJSON<Answer[] | null>(b[`${side}_answers`], null);
const sideOf = (b: any, uid: number): Side | null => (b.creator_id === uid ? 'creator' : b.opponent_id === uid ? 'opponent' : null);
function winnerOf(b: any): Side | null {
  if (b.status !== 'done') return null;
  if (b.creator_score === b.opponent_score) return Number(b.creator_ms) <= Number(b.opponent_ms) ? 'creator' : 'opponent';
  return b.creator_score > b.opponent_score ? 'creator' : 'opponent';
}

function view(b: any, uid: number, who: Map<number, string>) {
  const qs = parseJSON<BattleQ[]>(b.questions, []) || [];
  const me = sideOf(b, uid);
  const done = b.status === 'done';
  const mine = me ? answersOf(b, me) : null;
  const myScore = me ? b[`${me}_score`] : null;
  const live = !!b.live;
  const progress = (side: Side) => {
    const a = answersOf(b, side) || [];
    return { answered: a.length, correct: a.reduce((n: number, x, i) => n + (qs[i] && isRight(qs[i], x) ? 1 : 0), 0) };
  };
  const startAt = b.start_at == null ? null : Number(b.start_at);
  // who may see the questions: a challenge shows them to a player who hasn't played yet; a live battle only once it has started
  let questions: ReturnType<typeof publicQuestion>[] = [];
  if (live) {
    if (me && myScore == null && startAt && now() >= startAt - COUNTDOWN_MS) questions = qs.map(publicQuestion);
  } else if ((me && myScore == null) || (!me && !b.opponent_id)) questions = qs.map(publicQuestion);
  const side = (s: Side) => ({
    name: who.get(b[`${s}_id`]) || 'Someone',
    score: done || me === s ? b[`${s}_score`] : b[`${s}_score`] != null ? ('played' as const) : null,
    ms: done ? b[`${s}_ms`] : null,
    ready: !!b[`${s}_ready`],
    ...(live ? progress(s) : {}),
  });
  return {
    code: b.code,
    title: b.title,
    level: b.level,
    count: qs.length,
    live,
    status: b.status,
    expired: Number(b.expires_at) < now() && !done,
    you: me,
    startAt,
    serverNow: now(),
    secondsPerQuestion: SECONDS_PER_QUESTION,
    creator: side('creator'),
    opponent: b.opponent_id ? side('opponent') : null,
    questions,
    answered: mine ? mine.length : 0,
    review:
      mine && (myScore != null || done)
        ? qs.map((q, i) => ({ prompt: q.prompt, yours: mine[i] == null ? '—' : q.type === 'mcq' ? (q.options[Number(mine[i])] ?? '—') : String(mine[i]), right: rightAnswer(q), ok: isRight(q, mine[i]), explanation: q.explanation }))
        : [],
    winner: winnerOf(b),
  };
}

/** Both players have finished: mark it done, give points, tell the other player. */
async function finish(b: any, by: number) {
  const fresh = await db('battles').where({ id: b.id }).first();
  if (fresh.creator_score == null || fresh.opponent_score == null || fresh.status === 'done') return fresh;
  const changed = await db('battles').where({ id: b.id, status: 'open' }).update({ status: 'done' });
  fresh.status = 'done';
  if (!changed) return fresh;
  const w = winnerOf(fresh)!;
  const winnerId = fresh[`${w}_id`];
  const loserId = fresh[`${w === 'creator' ? 'opponent' : 'creator'}_id`];
  const lvl = fresh.level as Level;
  await award(winnerId, 'fast', WIN_POINTS[lvl], `Won a ${lvl} quiz battle`, `battle-win-${fresh.id}`).catch(() => 0);
  await award(loserId, 'fast', 2, 'Played a quiz battle', `battle-play-${fresh.id}`).catch(() => 0);
  const who = await names([winnerId]);
  const other = fresh.creator_id === by ? fresh.opponent_id : fresh.creator_id;
  if (!fresh.live) sendToUser(other, { title: 'Quiz battle finished', body: `${who.get(winnerId)} won ${Math.max(fresh.creator_score, fresh.opponent_score)}–${Math.min(fresh.creator_score, fresh.opponent_score)}. See the result.`, url: `/battle/${fresh.code}` }).catch(() => 0);
  return fresh;
}

/** A live battle whose time is up: unanswered questions count as wrong, and it ends. */
async function settleIfOver(b: any) {
  if (!b.live || b.status === 'done' || b.start_at == null) return b;
  const qs = parseJSON<BattleQ[]>(b.questions, []) || [];
  const end = Number(b.start_at) + qs.length * SECONDS_PER_QUESTION * 1000 + 15_000;
  if (now() < end) return b;
  for (const s of ['creator', 'opponent'] as Side[]) {
    if (b[`${s}_score`] != null || !b[`${s}_id`]) continue;
    const a = answersOf(b, s) || [];
    const full = [...a, ...Array(Math.max(0, qs.length - a.length)).fill(null)];
    await db('battles').where({ id: b.id }).update({ [`${s}_answers`]: JSON.stringify(full), [`${s}_score`]: full.reduce((n: number, x, i) => n + (isRight(qs[i], x) ? 1 : 0), 0), [`${s}_ms`]: end - Number(b.start_at) });
  }
  return finish(b, b.creator_id);
}

battlesRouter.get('/', async (_req, res) => {
  const uid = userId(res);
  const rows = await db('battles').where((w) => w.where('creator_id', uid).orWhere('opponent_id', uid)).orderBy('created_at', 'desc').limit(20);
  const who = await names((rows as any[]).flatMap((b) => [b.creator_id, b.opponent_id]));
  res.json({ battles: (rows as any[]).map((b) => ({ ...view(b, uid, who), questions: [], review: [] })) });
});

battlesRouter.post('/', async (req, res) => {
  const uid = userId(res);
  const b = z
    .object({ packId: z.number().int(), level: z.enum(['easy', 'medium', 'hard']).default('medium'), count: z.number().int().min(5).max(20).default(10), chunks: z.array(z.number().int()).max(80).optional(), live: z.boolean().optional() })
    .parse(req.body);
  const row = await db('packs').where({ id: b.packId, user_id: uid }).first('title', 'data');
  if (!row) throw new HttpError(404, 'Study pack not found.');
  const pack = parseJSON<StudyPack | null>(row.data, null);
  if (!pack) throw new HttpError(500, 'This study pack could not be read.');
  const pool = buildLevelQuiz(pack, b.level, b.chunks?.length ? b.chunks : undefined).filter((q): q is BattleQ => q.type === 'mcq' || q.type === 'tf' || q.type === 'fill');
  const qs = shuffle(pool).slice(0, b.count);
  if (qs.length < 5) throw new HttpError(422, 'This pack doesn’t have enough quiz questions for a battle yet.');
  const recent = await db('battles').where({ creator_id: uid }).andWhere('created_at', '>', now() - 3600_000).count({ n: '*' }).first();
  if (Number((recent as any)?.n || 0) >= 30) throw new HttpError(429, 'That’s a lot of battles. Try again in a while.');
  let code = newCode();
  while (await db('battles').where({ code }).first('id')) code = newCode();
  const t = now();
  await db('battles').insert({ code, creator_id: uid, title: String(row.title).slice(0, 200), level: b.level, questions: JSON.stringify(qs), live: !!b.live, creator_ready: false, created_at: t, expires_at: t + (b.live ? LIVE_LOBBY : WEEK) });
  res.status(201).json({ code });
});

async function load(code: string) {
  const b = await db('battles').where({ code: String(code).toUpperCase() }).first();
  if (!b) throw new HttpError(404, 'This battle doesn’t exist.');
  return b;
}

battlesRouter.get('/:code', async (req, res) => {
  const uid = userId(res);
  const b = await settleIfOver(await load(req.params.code));
  const who = await names([b.creator_id, b.opponent_id]);
  res.json(view(b, uid, who));
});

/** Live battles: take the empty seat. */
battlesRouter.post('/:code/join', async (req, res) => {
  const uid = userId(res);
  const b = await load(req.params.code);
  if (!b.live) throw new HttpError(400, 'This is not a live battle.');
  if (Number(b.expires_at) < now() && !b.start_at) throw new HttpError(410, 'This battle has expired. Start a new one.');
  if (b.creator_id !== uid && b.opponent_id !== uid) {
    if (b.opponent_id) throw new HttpError(409, 'This battle already has two players.');
    const claimed = await db('battles').where({ id: b.id }).whereNull('opponent_id').update({ opponent_id: uid });
    if (!claimed) throw new HttpError(409, 'Someone else took this battle first. Start your own!');
    sendToUser(b.creator_id, { title: 'Your live battle has an opponent', body: `Open it now and press “I’m ready”.`, url: `/battle/${b.code}` }).catch(() => 0);
  }
  const fresh = await load(req.params.code);
  res.json(view(fresh, uid, await names([fresh.creator_id, fresh.opponent_id])));
});

/** Live battles: when both players are ready, a short countdown starts the battle for both. */
battlesRouter.post('/:code/ready', async (req, res) => {
  const uid = userId(res);
  const b = await load(req.params.code);
  const side = sideOf(b, uid);
  if (!b.live || !side) throw new HttpError(400, 'You are not in this live battle.');
  if (!b.start_at) {
    await db('battles').where({ id: b.id }).update({ [`${side}_ready`]: true });
    const fresh = await load(req.params.code);
    if (fresh.creator_ready && fresh.opponent_ready && fresh.opponent_id) await db('battles').where({ id: b.id }).whereNull('start_at').update({ start_at: now() + COUNTDOWN_MS });
  }
  const fresh = await load(req.params.code);
  res.json(view(fresh, uid, await names([fresh.creator_id, fresh.opponent_id])));
});

/** Live battles: answer one question; marked straight away. */
battlesRouter.post('/:code/answer', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ i: z.number().int().min(0).max(19), answer: z.union([z.number(), z.boolean(), z.string().max(200), z.null()]) }).parse(req.body);
  let b = await load(req.params.code);
  const side = sideOf(b, uid);
  if (!b.live || !side) throw new HttpError(400, 'You are not in this live battle.');
  if (!b.start_at || now() < Number(b.start_at)) throw new HttpError(409, 'The battle hasn’t started yet.');
  b = await settleIfOver(b);
  if (b.status === 'done' || b[`${side}_score`] != null) throw new HttpError(409, 'You have finished this battle.');
  const qs = parseJSON<BattleQ[]>(b.questions, []) || [];
  const mine = answersOf(b, side) || [];
  if (body.i !== mine.length) throw new HttpError(409, 'Answer the questions in order.');
  const q = qs[body.i];
  const next = [...mine, body.answer];
  const patch: Record<string, unknown> = { [`${side}_answers`]: JSON.stringify(next) };
  if (next.length >= qs.length) {
    patch[`${side}_score`] = next.reduce((n: number, x, i) => n + (isRight(qs[i], x) ? 1 : 0), 0);
    patch[`${side}_ms`] = now() - Number(b.start_at);
  }
  await db('battles').where({ id: b.id }).update(patch);
  let fresh = await load(req.params.code);
  if (next.length >= qs.length) fresh = await finish(fresh, uid);
  res.json({ ok: isRight(q, body.answer), right: rightAnswer(q), explanation: q.explanation, battle: view(fresh, uid, await names([fresh.creator_id, fresh.opponent_id])) });
});

/** Challenges: submit all your answers at once. The first other person to submit becomes the opponent. */
battlesRouter.post('/:code/play', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ answers: z.array(z.union([z.number(), z.boolean(), z.string().max(200), z.null()])).max(20), ms: z.number().int().min(0).max(3_600_000) }).parse(req.body);
  const b = await load(req.params.code);
  if (b.live) throw new HttpError(400, 'This is a live battle: join it and press ready.');
  if (Number(b.expires_at) < now() && b.status !== 'done') throw new HttpError(410, 'This battle has expired. Start a new one.');
  let side: Side;
  if (b.creator_id === uid) side = 'creator';
  else if (b.opponent_id === uid) side = 'opponent';
  else if (!b.opponent_id) {
    const claimed = await db('battles').where({ id: b.id }).whereNull('opponent_id').update({ opponent_id: uid });
    if (!claimed) throw new HttpError(409, 'Someone else took this battle first. Start your own!');
    side = 'opponent';
  } else throw new HttpError(409, 'This battle already has two players.');
  if (b[`${side}_score`] != null) throw new HttpError(409, 'You already played this battle.');
  const qs = parseJSON<BattleQ[]>(b.questions, []) || [];
  const score = qs.reduce((n, q, i) => n + (isRight(q, body.answers[i]) ? 1 : 0), 0);
  // a whole battle can't honestly be answered in under a second per question
  const ms = Math.max(body.ms, qs.length * 1000);
  await db('battles').where({ id: b.id }).update({ [`${side}_score`]: score, [`${side}_ms`]: ms, [`${side}_answers`]: JSON.stringify(body.answers.slice(0, qs.length)) });
  let fresh = await load(req.params.code);
  if (fresh.creator_score != null && fresh.opponent_score != null) fresh = await finish(fresh, uid);
  else if (side === 'opponent') {
    const who = await names([uid]);
    sendToUser(fresh.creator_id, { title: 'Your quiz battle was accepted', body: `${who.get(uid)} played your battle on “${fresh.title}”. Your turn if you haven’t played.`, url: `/battle/${fresh.code}` }).catch(() => 0);
  }
  res.json(view(fresh, uid, await names([fresh.creator_id, fresh.opponent_id])));
});
