import { Router } from 'express';
import { z } from 'zod';
import { ai } from '../config';
import { HttpError, requireAuth, userId } from '../auth';
import { db, parseJSON } from '../db';
import type { StudyPack } from '../../shared/engine/types';
import { AiError } from '../ai/providers';
import { feedbackRequest, lessonContext, simplifyRequest, tutorRequest } from '../ai/prompts';
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
