import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { adminEmails, config } from './config';
import { db, now } from './db';

const COOKIE = 'cs_session';
const key = new TextEncoder().encode(config.jwtSecret);
const MAX_AGE_DAYS = 30;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function issueSession(res: Response, userId: number) {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(key);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: MAX_AGE_DAYS * 24 * 3600 * 1000,
    path: '/',
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try {
    const { payload } = await jwtVerify(token, key);
    const id = Number(payload.sub);
    if (!id) throw new Error('bad token');
    res.locals.userId = id;
    next();
  } catch {
    res.clearCookie(COOKIE, { path: '/' });
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

export const userId = (res: Response): number => res.locals.userId as number;

function publicUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    university: u.university,
    course: u.course,
    dailyGoal: u.daily_goal,
    preference: u.preference,
    plan: u.plan === 'pro' || adminEmails.includes(String(u.email).toLowerCase()) ? 'pro' : 'free',
    isAdmin: adminEmails.includes(String(u.email).toLowerCase()),
    createdAt: Number(u.created_at),
  };
}

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Wait a few minutes and try again.' } });

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(190);
const password = z.string().min(8, 'Use at least 8 characters for your password.').max(200);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(120),
  email,
  password,
  university: z.string().trim().max(160).optional().nullable(),
  course: z.string().trim().max(160).optional().nullable(),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  university: z.string().trim().max(160).nullable().optional(),
  course: z.string().trim().max(160).nullable().optional(),
  dailyGoal: z.number().int().min(5).max(500).optional(),
  preference: z.enum(['reading', 'listening', 'seeing', 'doing']).nullable().optional(),
});

export const authRouter = Router();

authRouter.post('/register', limiter, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const exists = await db('users').where({ email: body.email }).first();
  if (exists) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  const hash = await bcrypt.hash(body.password, 10);
  const [id] = await db('users').insert({
    name: body.name,
    email: body.email,
    password_hash: hash,
    university: body.university || null,
    course: body.course || null,
    created_at: now(),
  });
  const user = await db('users').where({ id }).first();
  await issueSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', limiter, async (req, res) => {
  const body = z.object({ email, password: z.string().min(1, 'Enter your password.') }).parse(req.body);
  const user = await db('users').where({ email: body.email }).first();
  const ok = user && (await bcrypt.compare(body.password, user.password_hash));
  if (!ok) throw new HttpError(401, 'That email and password don’t match. Check them and try again.');
  await issueSession(res, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Returns { user: null } instead of 401 when logged out, so the landing page loads quietly.
authRouter.get('/me', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.json({ user: null });
  try {
    const { payload } = await jwtVerify(token, key);
    const user = await db('users').where({ id: Number(payload.sub) }).first();
    if (!user) throw new Error('gone');
    res.json({ user: publicUser(user) });
  } catch {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ user: null });
  }
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = profileSchema.parse(req.body);
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.university !== undefined) patch.university = body.university;
  if (body.course !== undefined) patch.course = body.course;
  if (body.dailyGoal !== undefined) patch.daily_goal = body.dailyGoal;
  if (body.preference !== undefined) patch.preference = body.preference;
  if (Object.keys(patch).length) await db('users').where({ id: userId(res) }).update(patch);
  const user = await db('users').where({ id: userId(res) }).first();
  res.json({ user: publicUser(user) });
});

authRouter.post('/password', requireAuth, limiter, async (req, res) => {
  const body = z.object({ current: z.string().min(1), next: password }).parse(req.body);
  const user = await db('users').where({ id: userId(res) }).first();
  if (!(await bcrypt.compare(body.current, user.password_hash))) throw new HttpError(400, 'Your current password is not correct.');
  await db('users').where({ id: user.id }).update({ password_hash: await bcrypt.hash(body.next, 10) });
  res.json({ ok: true });
});

authRouter.delete('/me', requireAuth, async (req, res) => {
  const body = z.object({ password: z.string().min(1) }).parse(req.body);
  const user = await db('users').where({ id: userId(res) }).first();
  if (!(await bcrypt.compare(body.password, user.password_hash))) throw new HttpError(400, 'Your password is not correct.');
  await db('users').where({ id: user.id }).delete();
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});
