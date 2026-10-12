import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, userId } from '../auth';
import { db } from '../db';
import { lastWeek, leaderboard, thisWeek } from '../points';
import { baseUrl, slugify } from '../public';
import crypto from 'node:crypto';

export const pointsRouter = Router();
pointsRouter.use(requireAuth);

/** The student's own points: this week by category, all time, rank, recent awards, past weeks. */
pointsRouter.get('/me', async (_req, res) => {
  const uid = userId(res);
  const week = thisWeek();
  const u = await db('users').where({ id: uid }).select('university', 'course', 'leaderboard', 'public_profile', 'public_slug', 'bio').first();
  const board = await leaderboard(week);
  const uni = u?.university ? await leaderboard(week, { university: u.university }) : [];
  const mine = board.find((r) => r.userId === uid);
  const allTime = await db('points_events').where({ user_id: uid }).sum({ p: 'points' }).first();
  const recent = await db('points_events').where({ user_id: uid }).orderBy('id', 'desc').limit(12).select('category', 'points', 'reason', 'created_at');
  const weeks = await db('points_events').where({ user_id: uid }).groupBy('week').select('week').sum({ p: 'points' }).orderBy('week', 'desc').limit(6);
  const byCat = await db('points_events').where({ user_id: uid, week }).groupBy('category').select('category').sum({ p: 'points' });
  const cats = { memory: 0, fast: 0, explain: 0, steady: 0 } as Record<string, number>;
  for (const r of byCat as any[]) cats[r.category] = Number(r.p);
  res.json({
    week,
    total: Object.values(cats).reduce((a, b) => a + b, 0),
    categories: cats,
    allTime: Number((allTime as any)?.p || 0),
    rank: u?.leaderboard ? (mine?.rank ?? null) : null,
    rankUniversity: u?.leaderboard ? (uni.find((r) => r.userId === uid)?.rank ?? null) : null,
    players: board.length,
    playersUniversity: uni.length,
    onLeaderboard: !!u?.leaderboard,
    publicProfile: !!u?.public_profile,
    publicUrl: u?.public_profile && u.public_slug ? `${baseUrl(_req)}/u/${u.public_slug}` : null,
    bio: u?.bio || '',
    recent: recent.map((r: any) => ({ category: r.category, points: r.points, reason: r.reason, at: Number(r.created_at) })),
    history: weeks.map((w: any) => ({ week: w.week, points: Number(w.p) })),
  });
});

pointsRouter.get('/leaderboard', async (req, res) => {
  const uid = userId(res);
  const q = z
    .object({
      week: z.enum(['this', 'last']).default('this'),
      scope: z.enum(['all', 'university', 'course']).default('all'),
    })
    .parse(req.query);
  const u = await db('users').where({ id: uid }).select('university', 'course').first();
  const week = q.week === 'last' ? lastWeek() : thisWeek();
  const opts: { university?: string; course?: string } = {};
  if (q.scope !== 'all' && u?.university) opts.university = u.university;
  if (q.scope === 'course' && u?.course) opts.course = u.course;
  const rows = await leaderboard(week, opts);
  const me = rows.find((r) => r.userId === uid) || null;
  const end = new Date(`${week}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  res.json({
    week,
    weekEnd: end.toISOString().slice(0, 10),
    final: q.week === 'last',
    scope: q.scope,
    university: u?.university || null,
    course: u?.course || null,
    rows: rows.slice(0, 50).map(({ userId: id, ...r }) => ({ ...r, me: id === uid })),
    me: me ? { ...me, me: true } : null,
  });
});

pointsRouter.put('/visibility', async (req, res) => {
  const body = z.object({ onLeaderboard: z.boolean() }).parse(req.body);
  await db('users').where({ id: userId(res) }).update({ leaderboard: body.onLeaderboard });
  res.json({ ok: true });
});

/** Opt in (or out) of a public profile page that Google and others can find. */
pointsRouter.put('/public', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ public: z.boolean(), bio: z.string().trim().max(200).optional() }).parse(req.body);
  const u = await db('users').where({ id: uid }).select('name', 'public_slug').first();
  const patch: Record<string, unknown> = { public_profile: body.public };
  if (body.bio !== undefined) patch.bio = body.bio || null;
  if (body.public && !u?.public_slug) {
    let slug = slugify(String(u?.name || 'student'));
    if (await db('users').where({ public_slug: slug }).first()) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    patch.public_slug = slug;
  }
  await db('users').where({ id: uid }).update(patch);
  const row = await db('users').where({ id: uid }).select('public_profile', 'public_slug').first();
  res.json({ publicProfile: !!row.public_profile, publicUrl: row.public_profile ? `${baseUrl(req)}/u/${row.public_slug}` : null });
});
