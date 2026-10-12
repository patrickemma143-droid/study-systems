import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { adminEmails, ai } from '../config';
import { HttpError, requireAuth, userId } from '../auth';
import { db } from '../db';
import { aiDay, dayStartMs } from '../ai/service';

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(async (_req: Request, res: Response, next: NextFunction) => {
  const u = await db('users').where({ id: userId(res) }).select('email').first();
  if (!u || !adminEmails.includes(String(u.email).toLowerCase())) return next(new HttpError(403, 'Admins only.'));
  next();
});

function daysAgo(n: number) {
  return aiDay(Date.now() - n * 86400_000);
}

async function aiSummary(fromDay: string) {
  const rows = await db('ai_events')
    .where('day', '>=', fromDay)
    .groupBy('kind')
    .select('kind')
    .count({ requests: '*' })
    .sum({ cachedHits: db.raw('CASE WHEN cached THEN 1 ELSE 0 END') })
    .sum({ tokensIn: 'tokens_in' })
    .sum({ tokensOut: 'tokens_out' })
    .sum({ costMicro: 'cost_micro_usd' });
  const users = await db('ai_events').where('day', '>=', fromDay).countDistinct({ n: 'user_id' }).first();
  return {
    activeUsers: Number((users as any)?.n || 0),
    byKind: (rows as any[]).map((r) => ({
      kind: r.kind,
      requests: Number(r.requests),
      cachedHits: Number(r.cachedHits || 0),
      tokensIn: Number(r.tokensIn || 0),
      tokensOut: Number(r.tokensOut || 0),
      costUsd: Number(r.costMicro || 0) / 1e6,
    })),
  };
}

adminRouter.get('/overview', async (_req, res) => {
  const today = aiDay();
  const [users, pro, packs, newToday] = await Promise.all([
    db('users').count({ n: '*' }).first(),
    db('users').where({ plan: 'pro' }).count({ n: '*' }).first(),
    db('packs').count({ n: '*' }).first(),
    db('users').where('created_at', '>=', dayStartMs(today)).count({ n: '*' }).first(),
  ]);
  const activeToday = await db('activity').where('created_at', '>=', dayStartMs(today)).countDistinct({ n: 'user_id' }).first();
  const cache = await db('ai_cache').count({ n: '*' }).sum({ hits: 'hits' }).first();
  res.json({
    ai: { enabled: ai.enabled, provider: ai.enabled ? ai.provider : null, model: ai.enabled ? ai.model : null, limits: ai.limits },
    users: { total: Number((users as any)?.n || 0), pro: Number((pro as any)?.n || 0), newToday: Number((newToday as any)?.n || 0), activeToday: Number((activeToday as any)?.n || 0) },
    packs: Number((packs as any)?.n || 0),
    cache: { entries: Number((cache as any)?.n || 0), hits: Number((cache as any)?.hits || 0) },
    today: await aiSummary(today),
    last30: await aiSummary(daysAgo(29)),
    reviews: await (async () => {
      const agg = await db('exam_reviews').count({ n: '*' }).avg({ app: 'app_rating' }).avg({ went: 'how_it_went' }).first();
      const recent = await db('exam_reviews').join('users', 'users.id', 'exam_reviews.user_id').join('packs', 'packs.id', 'exam_reviews.pack_id').orderBy('exam_reviews.id', 'desc').limit(10).select('users.name', 'users.university', 'packs.title', 'exam_reviews.how_it_went', 'exam_reviews.app_rating', 'exam_reviews.readiness', 'exam_reviews.comment', 'exam_reviews.created_at');
      return {
        count: Number((agg as any)?.n || 0),
        appRating: (agg as any)?.app == null ? null : Math.round(Number((agg as any).app) * 10) / 10,
        howItWent: (agg as any)?.went == null ? null : Math.round(Number((agg as any).went) * 10) / 10,
        recent: recent.map((r: any) => ({ name: r.name, university: r.university, pack: r.title, howItWent: r.how_it_went, appRating: r.app_rating, readiness: r.readiness, comment: r.comment, at: Number(r.created_at) })),
      };
    })(),
  });
});

adminRouter.get('/users', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
  let query = db('users').select('id', 'name', 'email', 'plan', 'university', 'created_at').orderBy('id', 'desc').limit(25);
  if (q) query = query.where((w) => w.whereRaw('LOWER(email) LIKE ?', [`%${q}%`]).orWhereRaw('LOWER(name) LIKE ?', [`%${q}%`]));
  const rows = await query;
  const ids = rows.map((r: any) => r.id);
  const usage = ids.length
    ? await db('ai_events').whereIn('user_id', ids).andWhere('day', '>=', daysAgo(29)).groupBy('user_id').select('user_id').count({ n: '*' }).sum({ costMicro: 'cost_micro_usd' })
    : [];
  const byUser = new Map((usage as any[]).map((u) => [Number(u.user_id), u]));
  res.json({
    users: rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      plan: r.plan || 'free',
      university: r.university,
      createdAt: Number(r.created_at),
      admin: adminEmails.includes(String(r.email).toLowerCase()),
      aiRequests30d: Number(byUser.get(r.id)?.n || 0),
      aiCost30d: Number(byUser.get(r.id)?.costMicro || 0) / 1e6,
    })),
  });
});

adminRouter.post('/plan', async (req, res) => {
  const body = z.object({ userId: z.number().int(), plan: z.enum(['free', 'pro']) }).parse(req.body);
  const n = await db('users').where({ id: body.userId }).update({ plan: body.plan });
  if (!n) throw new HttpError(404, 'User not found.');
  res.json({ ok: true });
});
