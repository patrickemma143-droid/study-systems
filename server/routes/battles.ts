// Quiz battles: challenge a classmate to the same questions. Answers are marked here on the
// server (the browser never sees the answers before playing), so results are fair.
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
const WIN_POINTS: Record<Level, number> = { easy: 6, medium: 10, hard: 16 };

type BattleQ = Extract<QuizQuestion, { type: 'mcq' | 'tf' | 'fill' }>;

/** What a player may see before answering: no answers. */
function publicQuestion(q: BattleQ, i: number) {
  if (q.type === 'mcq') return { i, type: 'mcq' as const, prompt: q.prompt, options: q.options };
  if (q.type === 'tf') return { i, type: 'tf' as const, prompt: q.prompt };
  return { i, type: 'fill' as const, prompt: q.prompt };
}
function isRight(q: BattleQ, a: unknown): boolean {
  if (q.type === 'mcq') return Number(a) === q.answer;
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

function view(b: any, uid: number, who: Map<number, string>) {
  const qs = parseJSON<BattleQ[]>(b.questions, []) || [];
  const me = b.creator_id === uid ? 'creator' : b.opponent_id === uid ? 'opponent' : null;
  const myScore = me ? b[`${me}_score`] : null;
  const done = b.status === 'done';
  const myAnswers = me ? parseJSON<unknown[] | null>(b[`${me}_answers`], null) : null;
  return {
    code: b.code,
    title: b.title,
    level: b.level,
    count: qs.length,
    status: b.status,
    expired: Number(b.expires_at) < now() && !done,
    you: me,
    creator: { name: who.get(b.creator_id) || 'Someone', score: done || me === 'creator' ? b.creator_score : b.creator_score != null ? 'played' : null, ms: done ? b.creator_ms : null },
    opponent: b.opponent_id ? { name: who.get(b.opponent_id) || 'Someone', score: done || me === 'opponent' ? b.opponent_score : b.opponent_score != null ? 'played' : null, ms: done ? b.opponent_ms : null } : null,
    // questions to play (only if you haven't played yet)
    questions: me && myScore == null ? qs.map(publicQuestion) : me === null && !b.opponent_id ? qs.map(publicQuestion) : [],
    // your marked answers after playing
    review: myAnswers ? qs.map((q, i) => ({ prompt: q.prompt, yours: myAnswers[i] == null ? '—' : q.type === 'mcq' ? q.options[Number(myAnswers[i])] ?? '—' : String(myAnswers[i]), right: rightAnswer(q), ok: isRight(q, myAnswers[i]), explanation: q.explanation })) : [],
    winner: done ? (b.creator_score === b.opponent_score ? (b.creator_ms <= b.opponent_ms ? 'creator' : 'opponent') : b.creator_score > b.opponent_score ? 'creator' : 'opponent') : null,
  };
}

battlesRouter.get('/', async (_req, res) => {
  const uid = userId(res);
  const rows = await db('battles').where((w) => w.where('creator_id', uid).orWhere('opponent_id', uid)).orderBy('created_at', 'desc').limit(20);
  const who = await names((rows as any[]).flatMap((b) => [b.creator_id, b.opponent_id]));
  res.json({ battles: (rows as any[]).map((b) => { const v = view(b, uid, who); return { ...v, questions: [], review: [] }; }) });
});

battlesRouter.post('/', async (req, res) => {
  const uid = userId(res);
  const b = z.object({ packId: z.number().int(), level: z.enum(['easy', 'medium', 'hard']).default('medium'), count: z.number().int().min(5).max(20).default(10), chunks: z.array(z.number().int()).max(80).optional() }).parse(req.body);
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
  await db('battles').insert({ code, creator_id: uid, title: String(row.title).slice(0, 200), level: b.level, questions: JSON.stringify(qs), created_at: t, expires_at: t + WEEK });
  res.status(201).json({ code });
});

battlesRouter.get('/:code', async (req, res) => {
  const uid = userId(res);
  const b = await db('battles').where({ code: String(req.params.code).toUpperCase() }).first();
  if (!b) throw new HttpError(404, 'This battle doesn’t exist.');
  const who = await names([b.creator_id, b.opponent_id]);
  res.json(view(b, uid, who));
});

/** Submit your answers. The first other person to submit becomes the opponent. */
battlesRouter.post('/:code/play', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ answers: z.array(z.union([z.number(), z.boolean(), z.string().max(200), z.null()])).max(20), ms: z.number().int().min(0).max(3_600_000) }).parse(req.body);
  const b = await db('battles').where({ code: String(req.params.code).toUpperCase() }).first();
  if (!b) throw new HttpError(404, 'This battle doesn’t exist.');
  if (Number(b.expires_at) < now() && b.status !== 'done') throw new HttpError(410, 'This battle has expired. Start a new one.');
  let side: 'creator' | 'opponent';
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
  const fresh = await db('battles').where({ id: b.id }).first();
  if (fresh.creator_score != null && fresh.opponent_score != null && fresh.status !== 'done') {
    await db('battles').where({ id: b.id }).update({ status: 'done' });
    fresh.status = 'done';
    const who = await names([fresh.creator_id, fresh.opponent_id]);
    const v = view(fresh, uid, who);
    const winnerId = v.winner === 'creator' ? fresh.creator_id : fresh.opponent_id;
    const loserId = v.winner === 'creator' ? fresh.opponent_id : fresh.creator_id;
    const lvl = fresh.level as Level;
    await award(winnerId, 'fast', WIN_POINTS[lvl], `Won a ${lvl} quiz battle`, `battle-win-${fresh.id}`).catch(() => 0);
    await award(loserId, 'fast', 2, 'Played a quiz battle', `battle-play-${fresh.id}`).catch(() => 0);
    const other = side === 'creator' ? fresh.opponent_id : fresh.creator_id;
    sendToUser(other, { title: 'Quiz battle finished', body: `${who.get(winnerId)} won ${Math.max(fresh.creator_score, fresh.opponent_score)}–${Math.min(fresh.creator_score, fresh.opponent_score)}. See the result.`, url: `/battle/${fresh.code}` }).catch(() => 0);
  } else if (side === 'opponent') {
    const who = await names([uid]);
    sendToUser(fresh.creator_id, { title: 'Your quiz battle was accepted', body: `${who.get(uid)} played your battle on “${fresh.title}”. Your turn if you haven’t played.`, url: `/battle/${fresh.code}` }).catch(() => 0);
  }
  const who = await names([fresh.creator_id, fresh.opponent_id]);
  res.json(view(fresh, uid, who));
});
