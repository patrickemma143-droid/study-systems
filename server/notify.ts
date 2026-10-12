// Reminders: web push to students' phones and laptops, sent by a once-a-minute check.
// Free to run (no SMS costs). Keys are created once and kept in the database.
import crypto from 'node:crypto';
import webpush from 'web-push';
import { db, now } from './db';
import { config } from './config';
import { lastWeek, leaderboard } from './points';

let keys: { publicKey: string; privateKey: string } | null = null;

export async function pushKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const row = await db('app_settings').where({ key: 'vapid' }).first();
    if (row) keys = JSON.parse(row.value);
    else {
      keys = webpush.generateVAPIDKeys();
      try {
        await db('app_settings').insert({ key: 'vapid', value: JSON.stringify(keys) });
      } catch {
        keys = JSON.parse((await db('app_settings').where({ key: 'vapid' }).first()).value);
      }
    }
  }
  webpush.setVapidDetails(`mailto:${config.contactEmail || 'hello@chariscreations.com'}`, keys!.publicKey, keys!.privateKey);
  return keys!;
}

export const endpointHash = (endpoint: string) => crypto.createHash('sha256').update(endpoint).digest('hex');

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Send to every device the student turned reminders on for. Dead subscriptions are removed. */
export async function sendToUser(userId: number, msg: PushMessage): Promise<number> {
  await pushKeys();
  const subs = await db('push_subscriptions').where({ user_id: userId });
  let sent = 0;
  for (const s of subs as any[]) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600 });
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) await db('push_subscriptions').where({ id: s.id }).delete();
      else console.warn('Push failed:', err?.statusCode || err?.message);
    }
  }
  return sent;
}

/** Record a reminder once; returns false if it was already sent. */
async function once(userId: number, kind: string, dedupe: string): Promise<boolean> {
  try {
    await db('notification_log').insert({ user_id: userId, kind, dedupe: dedupe.slice(0, 120), created_at: now() });
    return true;
  } catch {
    return false;
  }
}

export const localNow = (tzOffsetMin: number, at = Date.now()) => {
  const d = new Date(at + tzOffsetMin * 60000);
  return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), hhmm: d.toISOString().slice(11, 16) };
};

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

async function tick() {
  const t = now();
  // 1. Sessions starting in the next 10 minutes
  const sessions = await db('plan_sessions')
    .join('users', 'users.id', 'plan_sessions.user_id')
    .where('users.reminders_on', true)
    .andWhere('plan_sessions.status', 'planned')
    .andWhere('plan_sessions.notified', false)
    .andWhere('plan_sessions.starts_at', '<=', t + 10 * 60000)
    .andWhere('plan_sessions.starts_at', '>', t - 5 * 60000)
    .select('plan_sessions.*')
    .limit(500);
  for (const s of sessions as any[]) {
    await db('plan_sessions').where({ id: s.id }).update({ notified: true });
    const mins = Math.max(0, Math.round((Number(s.starts_at) - t) / 60000));
    await sendToUser(s.user_id, {
      title: mins <= 1 ? 'Time to study' : `Study session in ${mins} minutes`,
      body: `${s.title} (${s.minutes} min). Phone face down, one task only.`,
      url: '/plan',
      tag: `session-${s.id}`,
    });
  }

  // 2. Daily reminder at the time each student chose
  const users = await db('users').where({ reminders_on: true }).select('id', 'name', 'tz_offset', 'reminder_time');
  for (const u of users as any[]) {
    const local = localNow(Number(u.tz_offset) || 0, t);
    const diff = local.minutes - toMin(u.reminder_time || '19:00');
    if (diff < 0 || diff > 15) continue;
    if (!(await once(u.id, 'daily', `daily-${u.id}-${local.day}`))) continue;
    const due = await db('cards').where({ user_id: u.id, suspended: false }).andWhere('due_at', '<=', t + 3 * 3600_000).count({ n: '*' }).first();
    const dueN = Number((due as any)?.n || 0);
    const studied = await db('activity').where({ user_id: u.id, day: local.day }).sum({ m: 'minutes' }).first();
    const minutes = Math.round(Number((studied as any)?.m || 0));
    const exams = await db('packs').where({ user_id: u.id }).whereNotNull('exam_date').andWhere('exam_date', '>', local.day).orderBy('exam_date').select('title', 'exam_date').limit(1);
    let examNote = '';
    if (exams.length) {
      const days = Math.round((Date.parse(`${exams[0].exam_date}T12:00:00Z`) - Date.parse(`${local.day}T12:00:00Z`)) / 86400000);
      if (days <= 7) examNote = days === 1 ? ` ${exams[0].title} is TOMORROW — open your cram plan.` : ` ${exams[0].title} is in ${days} days.`;
    }
    const first = String(u.name || '').split(' ')[0];
    let body: string;
    if (minutes >= 10 && dueN === 0) body = `Nice work today, ${first}. You’re up to date.${examNote}`;
    else if (dueN > 0) body = `${dueN} flashcard${dueN === 1 ? '' : 's'} are ready — about ${Math.max(1, Math.round((dueN * 12) / 60))} min to keep them in your memory.${examNote}`;
    else body = `A short session today keeps your streak alive, ${first}.${examNote}`;
    await sendToUser(u.id, { title: 'Charis Study', body, url: examNote.includes('TOMORROW') ? '/home' : dueN ? '/review' : '/plan', tag: 'daily' });
  }
}

/** Monday morning: tell each student how they did last week. */
async function weeklyResults(t: number) {
  const users = await db('users').where({ reminders_on: true }).select('id', 'name', 'tz_offset', 'university');
  const week = lastWeek();
  let board: Awaited<ReturnType<typeof leaderboard>> | null = null;
  const uniBoards = new Map<string, Awaited<ReturnType<typeof leaderboard>>>();
  for (const u of users as any[]) {
    const local = localNow(Number(u.tz_offset) || 0, t);
    if (new Date(`${local.day}T12:00:00Z`).getUTCDay() !== 1 || local.minutes < 8 * 60 || local.minutes > 8 * 60 + 30) continue;
    if (!(await once(u.id, 'weekly', `weekly-${u.id}-${week}`))) continue;
    board ??= await leaderboard(week);
    const me = board.find((r) => r.userId === u.id);
    if (!me) continue;
    let where = `#${me.rank} of ${board.length} overall`;
    if (u.university) {
      const key = String(u.university).trim().toLowerCase();
      if (!uniBoards.has(key)) uniBoards.set(key, await leaderboard(week, { university: u.university }));
      const r = uniBoards.get(key)!.find((x) => x.userId === u.id);
      if (r) where = `#${r.rank} at ${u.university}`;
    }
    await sendToUser(u.id, { title: 'Weekly results are out', body: `You finished ${where} with ${me.total} points. A new week starts now.`, url: '/ranks', tag: 'weekly' });
  }
}

let started = false;
/** Start the reminder loop (once). Runs every minute; errors never stop the server. */
export function startReminders() {
  if (started || process.env.REMINDERS_OFF === 'true') return;
  started = true;
  const run = () =>
    tick()
      .then(() => weeklyResults(now()))
      .catch((err) => console.warn('Reminder check failed:', err?.message || err));
  setTimeout(run, 15_000);
  setInterval(run, 60_000).unref?.();
}
