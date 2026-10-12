// The personal timetable, study settings and reminder subscriptions.
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import type { StudyPack } from '../../shared/engine/types';
import { buildTimetable, DEFAULT_PREFS, sanitizePrefs, sessionLink, type PlanPack } from '../../shared/timetable';
import { endpointHash, localNow, pushKeys, sendToUser } from '../notify';

export const planRouter = Router();
planRouter.use(requireAuth);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

async function settingsFor(uid: number) {
  const u = await db('users').where({ id: uid }).select('study_prefs', 'reminder_time', 'reminders_on', 'tz_offset').first();
  const devices = await db('push_subscriptions').where({ user_id: uid }).count({ n: '*' }).first();
  return {
    prefs: u?.study_prefs ? sanitizePrefs(parseJSON(u.study_prefs, DEFAULT_PREFS)) : DEFAULT_PREFS,
    reminderTime: u?.reminder_time || '19:00',
    remindersOn: !!u?.reminders_on,
    tzOffset: Number(u?.tz_offset ?? 180),
    devices: Number((devices as any)?.n || 0),
    pushKey: (await pushKeys()).publicKey,
  };
}

function sessionOut(s: any) {
  const detail = parseJSON<{ chunks?: number[]; cards?: number }>(s.detail, {});
  return {
    id: s.id,
    packId: s.pack_id,
    day: s.day,
    start: s.start,
    minutes: s.minutes,
    kind: s.kind,
    title: s.title,
    detail,
    status: s.status,
    startsAt: Number(s.starts_at),
    link: sessionLink({ kind: s.kind, packId: s.pack_id, detail }),
  };
}

planRouter.get('/settings', async (_req, res) => {
  res.json(await settingsFor(userId(res)));
});

planRouter.put('/settings', async (req, res) => {
  const body = z
    .object({
      prefs: z.unknown().optional(),
      reminderTime: hhmm.optional(),
      remindersOn: z.boolean().optional(),
      tzOffset: z.number().int().min(-720).max(840).optional(),
    })
    .parse(req.body);
  const patch: Record<string, unknown> = {};
  if (body.prefs !== undefined) patch.study_prefs = JSON.stringify(sanitizePrefs(body.prefs));
  if (body.reminderTime) patch.reminder_time = body.reminderTime;
  if (body.remindersOn !== undefined) patch.reminders_on = body.remindersOn;
  if (body.tzOffset !== undefined) patch.tz_offset = body.tzOffset;
  if (Object.keys(patch).length) await db('users').where({ id: userId(res) }).update(patch);
  res.json(await settingsFor(userId(res)));
});

/** Rebuild the coming week. Finished and skipped sessions, and anything already past, are kept. */
planRouter.post('/generate', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ tzOffset: z.number().int().min(-720).max(840).optional() }).parse(req.body || {});
  if (body.tzOffset !== undefined) await db('users').where({ id: uid }).update({ tz_offset: body.tzOffset });
  const day = await regenerate(uid);
  res.json({ sessions: await upcoming(uid, day) });
});

const running = new Map<number, Promise<string>>();

/** Rebuild the coming week for one student; returns their local "today". One rebuild at a time per student. */
export function regenerate(uid: number): Promise<string> {
  const prev = running.get(uid) || Promise.resolve('');
  const next = prev.catch(() => '').then(() => rebuild(uid));
  running.set(uid, next);
  next.finally(() => running.get(uid) === next && running.delete(uid)).catch(() => {});
  return next;
}

async function rebuild(uid: number): Promise<string> {
  const { prefs, tzOffset } = await settingsFor(uid);
  const t = now();
  const local = localNow(tzOffset, t);

  const packs = await db('packs').where({ user_id: uid }).select('id', 'title', 'exam_date', 'data');
  const progress = await db('chunk_progress').where({ user_id: uid }).whereIn('status', ['understood', 'mastered']).select('pack_id', 'chunk_index');
  const done = new Set(progress.map((p: any) => `${p.pack_id}:${p.chunk_index}`));
  const planPacks: PlanPack[] = [];
  for (const p of packs as any[]) {
    if (p.exam_date && p.exam_date < local.day) continue; // exam already written
    const data = parseJSON<StudyPack | null>(p.data, null);
    if (!data) continue;
    planPacks.push({
      id: p.id,
      title: p.title,
      examDate: p.exam_date,
      lessons: data.chunks.map((c) => ({ index: c.index, title: c.title, readMinutes: c.readMinutes, importance: c.importance, done: done.has(`${p.id}:${c.index}`) })),
    });
  }

  // Forecast how many flashcards fall due each day (overdue ones count today).
  const dueRows = await db('cards').where({ user_id: uid, suspended: false }).andWhere('due_at', '<', t + 8 * 86400_000).select('due_at');
  const dueByDay: Record<string, number> = {};
  for (const r of dueRows as any[]) {
    const day = Number(r.due_at) <= t ? local.day : localNow(tzOffset, Number(r.due_at)).day;
    dueByDay[day] = (dueByDay[day] || 0) + 1;
  }

  const plan = buildTimetable(prefs, planPacks, local.day, local.minutes, dueByDay, 7);
  const startsAt = (day: string, start: string) => Date.parse(`${day}T${start}:00Z`) - tzOffset * 60000;

  await db.transaction(async (trx) => {
    await trx('plan_sessions').where({ user_id: uid, status: 'planned' }).andWhere('starts_at', '>=', t).delete();
    const rows = plan
      .map((s) => ({ user_id: uid, pack_id: s.packId, day: s.day, start: s.start, minutes: s.minutes, kind: s.kind, title: s.title.slice(0, 200), detail: JSON.stringify(s.detail), status: 'planned', notified: false, starts_at: startsAt(s.day, s.start), created_at: t }))
      .filter((r) => r.starts_at >= t);
    for (let i = 0; i < rows.length; i += 100) await trx('plan_sessions').insert(rows.slice(i, i + 100));
  });
  if (!prefs.setup) await db('users').where({ id: uid }).update({ study_prefs: JSON.stringify({ ...prefs, setup: true }) });
  return local.day;
}

async function upcoming(uid: number, fromDay: string, days = 7) {
  const to = new Date(`${fromDay}T12:00:00Z`);
  to.setUTCDate(to.getUTCDate() + days);
  const rows = await db('plan_sessions').where({ user_id: uid }).andWhere('day', '>=', fromDay).andWhere('day', '<', to.toISOString().slice(0, 10)).orderBy('starts_at');
  return rows.map(sessionOut);
}

planRouter.get('/', async (req, res) => {
  const uid = userId(res);
  const { tzOffset } = await settingsFor(uid);
  const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(req.query.from) || localNow(tzOffset).day;
  // Keep the plan fresh: rebuild once it is more than 6 hours old (new notes, progress, due cards).
  const { prefs } = await settingsFor(uid);
  if (prefs.setup) {
    const latest = await db('plan_sessions').where({ user_id: uid, status: 'planned' }).andWhere('starts_at', '>=', now()).max({ c: 'created_at' }).first();
    const created = Number((latest as any)?.c || 0);
    if (!created || created < now() - 6 * 3600_000) await regenerate(uid);
  }
  res.json({ sessions: await upcoming(uid, from) });
});

planRouter.patch('/sessions/:id', async (req, res) => {
  const body = z.object({ status: z.enum(['planned', 'done', 'skipped']) }).parse(req.body);
  const n = await db('plan_sessions').where({ id: Number(req.params.id), user_id: userId(res) }).update({ status: body.status });
  if (!n) throw new HttpError(404, 'Session not found.');
  res.json({ ok: true });
});

/** The timetable as a calendar file, so it shows up in the phone's own calendar with alarms. */
planRouter.get('/calendar.ics', async (_req, res) => {
  const uid = userId(res);
  const rows = await db('plan_sessions').where({ user_id: uid, status: 'planned' }).andWhere('starts_at', '>=', now() - 3600_000).orderBy('starts_at').limit(200);
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const host = `${_req.protocol}://${_req.get('host')}`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Charis Creations//Charis Study//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Charis Study timetable'];
  for (const r of rows as any[]) {
    const s = sessionOut(r);
    lines.push(
      'BEGIN:VEVENT',
      `UID:charis-study-${r.id}@${_req.get('host')}`,
      `DTSTAMP:${stamp(now())}`,
      `DTSTART:${stamp(s.startsAt)}`,
      `DTEND:${stamp(s.startsAt + s.minutes * 60000)}`,
      `SUMMARY:${esc(s.title)}`,
      `DESCRIPTION:${esc(`Open in Charis Study: ${host}${s.link}`)}`,
      `URL:${host}${s.link}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(s.title)}`,
      'TRIGGER:-PT10M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="charis-study-timetable.ics"');
  res.send(lines.join('\r\n'));
});

// ─── Reminder devices ─────────────────────────────────────────
planRouter.post('/push/subscribe', async (req, res) => {
  const uid = userId(res);
  const body = z
    .object({
      endpoint: z.string().url().max(1000),
      keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
    })
    .parse(req.body);
  const hash = endpointHash(body.endpoint);
  await db('push_subscriptions').where({ endpoint_hash: hash }).delete();
  await db('push_subscriptions').insert({ user_id: uid, endpoint_hash: hash, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, device: String(req.get('user-agent') || '').slice(0, 120), created_at: now() });
  await db('users').where({ id: uid }).update({ reminders_on: true });
  res.json(await settingsFor(uid));
});

planRouter.post('/push/unsubscribe', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ endpoint: z.string().max(1000).optional() }).parse(req.body || {});
  if (body.endpoint) await db('push_subscriptions').where({ user_id: uid, endpoint_hash: endpointHash(body.endpoint) }).delete();
  res.json(await settingsFor(uid));
});

planRouter.post('/push/test', async (_req, res) => {
  const sent = await sendToUser(userId(res), { title: 'Reminders are on', body: 'This is how Charis Study will remind you to study.', url: '/plan', tag: 'test' });
  if (!sent) throw new HttpError(400, 'No device is set up for reminders yet. Turn them on first.');
  res.json({ sent });
});
