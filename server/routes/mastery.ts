// What each student has understood, idea by idea, across every lesson — the learner model.
// A lesson reports how each idea went (understood first time, with help, or not yet), plus whether
// a right answer was only a guess and whether a wrong one was given confidently (a misconception).
// Each idea then gets a strength (0..1) and a date to be checked again: weak ideas tomorrow, ideas
// learned with help in a few days, secure ones in a week or two. Check-ins re-ask the idea's own
// question (no AI, no cost) and move it up or down. Weak ideas also join the pack's flashcards.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { cleanCheck, type Check } from '../../shared/tutor';

export const masteryRouter = Router();
masteryRouter.use(requireAuth);

const DAY = 86_400_000;
const keyOf = (topic: string, concept: string) => crypto.createHash('sha256').update(`${topic.trim().toLowerCase()}\n${concept.trim().toLowerCase()}`).digest('hex').slice(0, 64);

type Outcome = 'got' | 'helped' | 'review';
/** How much one result says about the idea. A guess that happened to be right says little. */
const VALUE: Record<Outcome, number> = { got: 0.95, helped: 0.6, review: 0.2 };
const statusOf = (s: number): Outcome => (s >= 0.8 ? 'got' : s >= 0.5 ? 'helped' : 'review');

/** When to check the idea again: weak tomorrow, shaky in 3 days, secure in a week (two if it stays secure). */
function nextCheck(status: Outcome, prev?: Outcome) {
  const days = status === 'review' ? 1 : status === 'helped' ? 3 : prev === 'got' ? 14 : 7;
  return now() + days * DAY;
}

async function upsert(uid: number, o: { topic: string; concept: string; outcome: Outcome; correct: boolean; guessed?: boolean; sureWrong?: boolean; check?: Check; packId?: number | null; lessonId?: number | null }) {
  const concept_key = keyOf(o.topic, o.concept);
  const row = await db('concept_mastery').where({ user_id: uid, concept_key }).first();
  // blend with what we knew before, so one lucky or unlucky answer doesn't swing everything
  const strength = row ? Math.round((Number(row.strength) * 0.45 + VALUE[o.outcome] * 0.55) * 100) / 100 : VALUE[o.outcome];
  const status = statusOf(strength);
  const patch = {
    strength,
    status,
    seen: (row?.seen || 0) + 1,
    correct: (row?.correct || 0) + (o.correct ? 1 : 0),
    sure_wrong: (row?.sure_wrong || 0) + (o.sureWrong ? 1 : 0),
    guess_right: (row?.guess_right || 0) + (o.guessed && o.correct ? 1 : 0),
    next_check: nextCheck(status, row?.status),
    updated_at: now(),
    ...(o.check ? { check_json: JSON.stringify(o.check) } : {}),
    ...(o.packId !== undefined ? { pack_id: o.packId } : {}),
    ...(o.lessonId !== undefined ? { lesson_id: o.lessonId } : {}),
  };
  if (row) await db('concept_mastery').where({ id: row.id }).update(patch);
  else {
    try {
      await db('concept_mastery').insert({ user_id: uid, concept_key, concept: o.concept.slice(0, 200), topic: o.topic.slice(0, 200), ...patch });
    } catch {
      await db('concept_mastery').where({ user_id: uid, concept_key }).update(patch); // stored a moment ago
    }
  }
  return { status, strength };
}

/** A weak idea joins its pack's flashcards, so spaced review keeps bringing it back. */
async function addCard(uid: number, packId: number | null | undefined, check: Check | undefined) {
  if (!packId || !check) return;
  if (!(await db('packs').where({ id: packId, user_id: uid }).first())) return;
  const front = check.kind === 'open' || !check.options.length ? check.q : `${check.q}\n\n${check.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}`;
  const back = check.kind === 'open' ? `${check.model || ''}${check.explain ? `\n\n${check.explain}` : ''}` : `${check.options[check.answer]}${check.explain ? `\n\n${check.explain}` : ''}`;
  if (await db('cards').where({ user_id: uid, pack_id: packId, front }).first()) return;
  await db('cards').insert({ user_id: uid, pack_id: packId, chunk_index: 0, type: 'custom', front, back, due_at: now() });
}

const checkSchema = z.any().transform((v) => cleanCheck(v));

/** A lesson ended (or a weak part was gone over again): record how each idea went. */
masteryRouter.post('/lesson', async (req, res) => {
  const uid = userId(res);
  const b = z
    .object({
      lessonId: z.number().int(),
      items: z
        .array(
          z.object({
            concept: z.string().trim().min(1).max(200),
            outcome: z.enum(['got', 'helped', 'review']),
            correct: z.boolean(),
            guessed: z.boolean().optional(),
            sureWrong: z.boolean().optional(),
            check: checkSchema.optional(),
          }),
        )
        .max(60),
    })
    .parse(req.body);
  const lesson = await db('tutor_lessons').where({ id: b.lessonId, user_id: uid }).first('id', 'title', 'pack_id');
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
  const out = [];
  for (const it of b.items) {
    const r = await upsert(uid, { topic: lesson.title, concept: it.concept, outcome: it.outcome, correct: it.correct, guessed: it.guessed, sureWrong: it.sureWrong, check: it.check, packId: lesson.pack_id ?? null, lessonId: lesson.id });
    if (r.status !== 'got') await addCard(uid, lesson.pack_id, it.check).catch(() => {});
    out.push({ concept: it.concept, ...r });
  }
  res.json({ concepts: out });
});

/** What the student already knows from this topic (so a lesson can skip it). */
masteryRouter.get('/topic', async (req, res) => {
  const topic = String(req.query.topic || '').slice(0, 200);
  const rows = topic ? await db('concept_mastery').where({ user_id: userId(res), topic }).select('concept', 'status', 'strength', 'updated_at') : [];
  res.json({ concepts: rows.map((r: any) => ({ concept: r.concept, status: r.status, strength: Number(r.strength), updatedAt: Number(r.updated_at) })) });
});

/** Ideas due for a check-in now, each with its own question. */
masteryRouter.get('/checkins', async (_req, res) => {
  const uid = userId(res);
  const rows = await db('concept_mastery').where({ user_id: uid }).andWhere('next_check', '<=', now()).whereNotNull('check_json').orderBy('strength', 'asc').limit(8);
  const due = rows
    .map((r: any) => ({ id: r.id, concept: r.concept, topic: r.topic, status: r.status, lessonId: r.lesson_id, check: cleanCheck(parseJSON(r.check_json, null)) }))
    .filter((r) => r.check);
  const counts = await db('concept_mastery').where({ user_id: uid }).select('status').count({ n: '*' }).groupBy('status');
  const summary = Object.fromEntries((counts as any[]).map((c) => [c.status, Number(c.n)]));
  res.json({ due, summary });
});

/** The answer to a check-in question. */
masteryRouter.post('/checkins/:id', async (req, res) => {
  const uid = userId(res);
  const b = z.object({ correct: z.boolean(), guessed: z.boolean().optional() }).parse(req.body);
  const row = await db('concept_mastery').where({ id: Number(req.params.id), user_id: uid }).first();
  if (!row) return res.status(404).json({ error: 'Not found.' });
  // remembered days later, without a guess: secure. Right by guessing: still shaky. Forgotten: back to tomorrow.
  const outcome: Outcome = b.correct ? (b.guessed ? 'helped' : 'got') : 'review';
  const r = await upsert(uid, { topic: row.topic, concept: row.concept, outcome, correct: b.correct, guessed: b.guessed, sureWrong: !b.correct && !b.guessed });
  if (!b.correct) await addCard(uid, row.pack_id, cleanCheck(parseJSON(row.check_json, null))).catch(() => {});
  res.json(r);
});
