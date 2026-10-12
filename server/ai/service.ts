// Shared cache, daily limits and usage tracking around every AI call.
import crypto from 'node:crypto';
import { ai, adminEmails, type AiKind } from '../config';
import { db, now } from '../db';
import { HttpError } from '../auth';
import { AiError, complete, costMicroUsd, parseJsonReply, type AiRequest, type AiResult } from './providers';

const PROMPT_VERSION = 'v1';
const TZ_OFFSET_HOURS = Number(process.env.TZ_OFFSET_HOURS ?? 3); // Kampala by default

/** "Today" for daily limits, on the server's clock (students can't reset it). */
export function aiDay(at = Date.now()): string {
  return new Date(at + TZ_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);
}

/** Epoch milliseconds when the given local day (YYYY-MM-DD) starts. */
export function dayStartMs(day = aiDay()): number {
  return Date.parse(`${day}T00:00:00Z`) - TZ_OFFSET_HOURS * 3600_000;
}

export async function userPlan(userId: number): Promise<{ plan: 'free' | 'pro'; admin: boolean }> {
  const u = await db('users').where({ id: userId }).select('plan', 'email').first();
  const admin = !!u && adminEmails.includes(String(u.email).toLowerCase());
  return { plan: admin || u?.plan === 'pro' ? 'pro' : 'free', admin };
}

/** Requests that actually used the AI today (shared/cached answers don't count). */
export async function usedToday(userId: number): Promise<Record<AiKind, number>> {
  const rows = await db('ai_events').where({ user_id: userId, day: aiDay(), cached: false }).groupBy('kind').select('kind').count({ n: '*' });
  const out: Record<AiKind, number> = { simplify: 0, tutor: 0, feedback: 0 };
  for (const r of rows as any[]) if (r.kind in out) out[r.kind as AiKind] = Number(r.n);
  return out;
}

export async function limitsFor(userId: number) {
  const { plan, admin } = await userPlan(userId);
  const limits = ai.limits[plan];
  const used = await usedToday(userId);
  return { plan, admin, limits, used };
}

async function assertAllowed(userId: number, kind: AiKind) {
  const { plan, limits, used } = await limitsFor(userId);
  if (limits[kind] <= 0) throw new HttpError(403, plan === 'free' ? 'This AI feature is for Pro accounts.' : 'This AI feature is switched off.');
  if (used[kind] >= limits[kind]) {
    throw new HttpError(429, plan === 'free' ? `You’ve used today’s ${limits[kind]} free ${label(kind)}. They reset tomorrow, or upgrade to Pro for more.` : `You’ve reached today’s limit of ${limits[kind]} ${label(kind)}. It resets tomorrow.`);
  }
}

function label(kind: AiKind) {
  return kind === 'simplify' ? 'simple explanations' : kind === 'tutor' ? 'tutor questions' : 'AI marks';
}

async function record(userId: number, kind: AiKind, result: AiResult | null, cached: boolean) {
  await db('ai_events').insert({
    user_id: userId,
    day: aiDay(),
    kind,
    model: ai.model,
    cached,
    tokens_in: result?.tokensIn || 0,
    tokens_out: result?.tokensOut || 0,
    cost_micro_usd: result ? costMicroUsd(ai.model, result.tokensIn, result.tokensOut, result.cachedIn) : 0,
    created_at: now(),
  });
}

function cacheKey(kind: AiKind, input: string) {
  return crypto.createHash('sha256').update([kind, ai.provider, ai.model, PROMPT_VERSION, input].join('\u0000')).digest('hex');
}

/**
 * Run a JSON-producing AI task once per unique input. Every later request for the same input —
 * from any student — is served from the shared cache, costs nothing and doesn't use their limit.
 */
export async function cachedJson<T>(userId: number, kind: AiKind, keyInput: string, req: AiRequest, clean: (raw: any) => T): Promise<{ data: T; cached: boolean }> {
  const key = cacheKey(kind, keyInput);
  const hit = await db('ai_cache').where({ cache_key: key }).first();
  if (hit) {
    await db('ai_cache').where({ id: hit.id }).increment('hits', 1);
    await record(userId, kind, null, true);
    return { data: clean(JSON.parse(hit.output)), cached: true };
  }
  await assertAllowed(userId, kind);
  const result = await complete(req);
  const data = clean(parseJsonReply(result.text));
  await record(userId, kind, result, false);
  try {
    await db('ai_cache').insert({ cache_key: key, kind, model: ai.model, output: JSON.stringify(data), tokens_in: result.tokensIn, tokens_out: result.tokensOut, created_at: now() });
  } catch {
    /* another request stored the same answer a moment earlier — fine */
  }
  return { data, cached: false };
}

/** Look in the shared cache without calling the AI or using any allowance. */
export async function peekJson<T>(kind: AiKind, keyInput: string, clean: (raw: any) => T): Promise<T | null> {
  const hit = await db('ai_cache').where({ cache_key: cacheKey(kind, keyInput) }).first();
  return hit ? clean(JSON.parse(hit.output)) : null;
}

/** A plain-text AI reply (tutor chat): always live, always counted. */
export async function liveText(userId: number, kind: AiKind, req: AiRequest): Promise<string> {
  await assertAllowed(userId, kind);
  const result = await complete(req);
  await record(userId, kind, result, false);
  return result.text;
}

export { AiError };

// ─── Output cleaners: never trust model output blindly ───
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, n = 6, max = 400) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

export function cleanSimplify(raw: any) {
  const questions = Array.isArray(raw?.questions)
    ? raw.questions.map((q: any) => ({ q: str(q?.q, 400), a: str(q?.a, 800) })).filter((q: any) => q.q && q.a).slice(0, 5)
    : [];
  const out = { simple: str(raw?.simple, 3000), example: str(raw?.example, 800), keyPoints: strList(raw?.keyPoints), questions };
  if (!out.simple) throw new AiError('The AI answer was incomplete. Try again.');
  return out;
}

export function cleanFeedback(raw: any) {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw?.score) || 0)));
  return {
    score,
    summary: str(raw?.summary, 600),
    correct: strList(raw?.correct),
    missing: strList(raw?.missing),
    misconceptions: strList(raw?.misconceptions),
    tip: str(raw?.tip, 400),
  };
}
