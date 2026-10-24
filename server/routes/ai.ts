import { Router } from 'express';
import { z } from 'zod';
import { ai } from '../config';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import type { StudyPack } from '../../shared/engine/types';
import { AiError } from '../ai/providers';
import { feedbackRequest, lessonContext, simplifyRequest, tutorRequest } from '../ai/prompts';
import { cleanMark, markAnswerRequest, cleanPaper, cleanSmartLesson, mergeSmartLesson, paperRequest, smartLessonRequest } from '../ai/smart';
import { buildOutline } from '../../shared/engine/outline';
import { contentStems } from '../../shared/engine/text';
import type { KeyAnalysis } from '../../shared/engine/paper';
import { cachedJson, cleanFeedback, cleanSimplify, limitsFor, liveText, peekJson } from '../ai/service';

export const aiRouter = Router();
aiRouter.use(requireAuth);

// Burst guard: stops a stuck browser tab or script from firing hundreds of AI calls a minute.
const recent = new Map<number, number[]>();
const BURST_PER_MINUTE = 40;
aiRouter.use((req, res, next) => {
  if (req.method !== 'POST' || req.body?.peek) return next();
  const uid = userId(res);
  const cutoff = Date.now() - 60_000;
  const times = (recent.get(uid) || []).filter((t) => t > cutoff);
  if (times.length >= BURST_PER_MINUTE) return next(new HttpError(429, 'Slow down a little. Try again in a minute.'));
  times.push(Date.now());
  recent.set(uid, times);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((t) => t > cutoff)) recent.delete(k);
  next();
});

async function loadPack(uid: number, packId: number) {
  const row = await db('packs').where({ id: packId, user_id: uid }).select('id', 'title', 'data').first();
  if (!row) throw new HttpError(404, 'Study pack not found.');
  const data = parseJSON<StudyPack | null>(row.data, null);
  if (!data) throw new HttpError(500, 'This study pack could not be read.');
  return { title: row.title as string, data };
}

function requireAi() {
  if (!ai.enabled) throw new HttpError(503, 'AI features are not switched on for this site yet.');
}

/** Turns provider failures into friendly messages without leaking details. */
function wrap(handler: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof AiError) {
        console.error('AI error:', err.message);
        throw new HttpError(err.status === 503 ? 503 : 502, err.message.startsWith('AI request was rejected') ? 'The AI service rejected the request. Check the AI settings on the server.' : err.message);
      }
      throw err;
    }
  };
}

aiRouter.get('/status', async (_req, res) => {
  const { plan, admin, limits, used } = await limitsFor(userId(res));
  res.json({ enabled: ai.enabled, provider: ai.enabled ? ai.provider : null, plan, admin, limits, used });
});

aiRouter.post(
  '/simplify',
  wrap(async (req, res) => {
    requireAi();
    const body = z.object({ packId: z.number().int(), chunk: z.number().int().min(0), peek: z.boolean().optional() }).parse(req.body);
    const pack = await loadPack(userId(res), body.packId);
    const ctx = lessonContext(pack, body.chunk);
    if (!ctx) throw new HttpError(404, 'Lesson not found.');
    if (body.peek) {
      const found = await peekJson('simplify', `${ctx.title}\n${ctx.text}`, cleanSimplify);
      res.json(found ? { ...found, cached: true } : { available: false });
      return;
    }
    // Keyed by the lesson text itself — classmates with the same notes share one AI run.
    const { data, cached } = await cachedJson(userId(res), 'simplify', `${ctx.title}\n${ctx.text}`, simplifyRequest(ctx), cleanSimplify);
    res.json({ ...data, cached, usage: await limitsFor(userId(res)) });
  }),
);

aiRouter.post(
  '/tutor',
  wrap(async (req, res) => {
    requireAi();
    const body = z
      .object({
        packId: z.number().int(),
        chunk: z.number().int().min(0),
        messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) })).min(1).max(20),
      })
      .parse(req.body);
    if (body.messages[body.messages.length - 1].role !== 'user') throw new HttpError(400, 'Ask a question first.');
    const pack = await loadPack(userId(res), body.packId);
    const ctx = lessonContext(pack, body.chunk);
    if (!ctx) throw new HttpError(404, 'Lesson not found.');
    // Only the last few turns are sent, to keep each question cheap.
    let history = body.messages.slice(-8);
    while (history.length && history[0].role !== 'user') history = history.slice(1);
    const reply = await liveText(userId(res), 'tutor', tutorRequest(ctx, history));
    res.json({ reply, usage: await limitsFor(userId(res)) });
  }),
);

aiRouter.post(
  '/feedback',
  wrap(async (req, res) => {
    requireAi();
    const body = z
      .object({
        packId: z.number().int(),
        chunks: z.array(z.number().int().min(0)).min(1).max(40),
        text: z.string().trim().min(5, 'Write a little more first.').max(8000),
        mode: z.enum(['feynman', 'blurt']),
      })
      .parse(req.body);
    const pack = await loadPack(userId(res), body.packId);
    const ctxs = body.chunks.map((i) => lessonContext(pack, i)).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 12);
    if (!ctxs.length) throw new HttpError(404, 'Lesson not found.');
    const points = body.chunks.flatMap((i) => pack.data.chunks[i]?.keyPoints.slice(0, 5) || []).slice(0, 40);
    const key = `${body.mode}\n${body.chunks.join(',')}\n${ctxs.map((c) => c.title).join('|')}\n${body.text}`;
    const { data, cached } = await cachedJson(userId(res), 'feedback', key, feedbackRequest(ctxs, points, body.text, body.mode), cleanFeedback);
    res.json({ ...data, cached, usage: await limitsFor(userId(res)) });
  }),
);

/**
 * Rebuild one lesson with the AI: better cards, a better quiz, real learning objectives and its topic.
 * Cards the student has already reviewed are kept; only untouched auto-made cards are replaced.
 */
aiRouter.post(
  '/smart-lesson',
  wrap(async (req, res) => {
    requireAi();
    const uid = userId(res);
    const body = z.object({ packId: z.number().int(), chunk: z.number().int().min(0) }).parse(req.body);
    const pack = await loadPack(uid, body.packId);
    if (pack.data.smart?.lessons[body.chunk]) {
      res.json({ already: true, usage: await limitsFor(uid) });
      return;
    }
    const ctx = lessonContext(pack, body.chunk);
    if (!ctx) throw new HttpError(404, 'Lesson not found.');
    const outline = pack.data.chunks.map((c) => c.title);
    const { data, cached } = await cachedJson(uid, 'build', `${ctx.title}\n${ctx.text}`, smartLessonRequest(ctx, outline), cleanSmartLesson);

    // read the pack again: another lesson may have been saved while the AI was working
    const fresh = await loadPack(uid, body.packId);
    if (fresh.data.smart?.lessons[body.chunk]) {
      res.json({ already: true, usage: await limitsFor(uid) });
      return;
    }
    const merged = mergeSmartLesson(fresh.data, body.chunk, data);
    const t = now();
    await db.transaction(async (trx) => {
      await trx('cards')
        .where({ pack_id: body.packId, user_id: uid, chunk_index: body.chunk, reps: 0 })
        .whereNull('last_reviewed_at')
        .whereNot('type', 'custom')
        .delete();
      await trx('cards').insert(
        data.cards.map((c, i) => ({ user_id: uid, pack_id: body.packId, chunk_index: body.chunk, type: c.type, front: c.front, back: c.back, hint: null, due_at: t - data.cards.length + i })),
      );
      await trx('packs').where({ id: body.packId, user_id: uid }).update({ data: JSON.stringify(merged), stats: JSON.stringify(merged.stats), updated_at: t });
    });
    res.json({ cached, cards: data.cards.length, questions: data.quiz.length, objectives: data.objectives, topic: data.topic, usage: await limitsFor(uid) });
  }),
);

/** A complete mock paper written by the AI in the exact format of one of the student's past papers. */
aiRouter.post(
  '/paper',
  wrap(async (req, res) => {
    requireAi();
    const uid = userId(res);
    const body = z
      .object({
        packId: z.number().int(),
        pastPaperId: z.number().int().optional(),
        chunks: z.array(z.number().int().min(0)).max(80).optional(),
        level: z.enum(['easy', 'medium', 'hard']).default('medium'),
        fresh: z.number().int().min(0).max(1000).optional(),
      })
      .parse(req.body);
    const pack = await loadPack(uid, body.packId);
    const idx = body.chunks?.length ? body.chunks : pack.data.chunks.map((c) => c.index);
    const lessons = idx.map((i) => lessonContext(pack, i)).filter((c): c is NonNullable<typeof c> => !!c);
    if (!lessons.length) throw new HttpError(404, 'Pick at least one lesson.');
    let past: { text: string; key: KeyAnalysis | null } | null = null;
    if (body.pastPaperId) {
      // any of the student's past papers, from any course pack
      const row = await db('past_papers').where({ id: body.pastPaperId, user_id: uid }).select('text', 'key_analysis').first();
      if (!row) throw new HttpError(404, 'Past paper not found.');
      past = { text: String(row.text), key: parseJSON<KeyAnalysis | null>(row.key_analysis, null) };
    }
    const outline = pack.data.outline ?? buildOutline(pack.data);
    const objectives = idx.flatMap((i) => outline.objectives[i] || []);
    const req2 = paperRequest({ courseTitle: pack.title, lessons, pastPaper: past?.text || null, keyStyle: past?.key?.style || null, level: body.level, objectives });
    const key = `${body.level}\n${body.fresh || 0}\n${past?.text.slice(0, 20000) || ''}\n${lessons.map((l) => `${l.title}\n${l.text}`).join('\n')}`;
    const { data, cached } = await cachedJson(uid, 'paper', key, req2, cleanPaper);
    res.json({ paper: data, cached, usage: await limitsFor(uid) });
  }),
);

/** Mark a written exam answer like an examiner, against the marking key (or the notes). */
aiRouter.post(
  '/mark-answer',
  wrap(async (req, res) => {
    requireAi();
    const uid = userId(res);
    const body = z
      .object({
        packId: z.number().int(),
        question: z.string().trim().min(3).max(3000),
        marks: z.number().int().min(1).max(100),
        key: z.string().trim().max(8000).optional(),
        answer: z.string().trim().min(5, 'Write your answer first.').max(10000),
      })
      .parse(req.body);
    const pack = await loadPack(uid, body.packId);
    // the lessons this question is about, so the AI marks against the student's own course
    const qStems = new Set(contentStems(body.question));
    const ranked = pack.data.chunks
      .map((c) => ({ c, s: contentStems(`${c.title} ${c.keyTerms.join(' ')}`).filter((w) => qStems.has(w)).length }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2)
      .map((x) => lessonContext(pack, x.c.index)!)
      .filter(Boolean);
    const notes = ranked.map((l) => `## ${l.title}\n${l.text}`).join('\n\n');
    const key = `${body.question}\n${body.marks}\n${body.key || ''}\n${body.answer}`;
    const { data, cached } = await cachedJson(uid, 'feedback', key, markAnswerRequest({ question: body.question, marks: body.marks, key: body.key || null, notes, answer: body.answer }), cleanMark(body.marks));
    res.json({ ...data, cached, usage: await limitsFor(uid) });
  }),
);
