// Class groups: a course rep or lecturer makes a class, students join with a code, and everyone
// gets the same notes, past papers and exam date, with a class ranking and short announcements.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { leaderboard, thisWeek } from '../points';
import { sendToUser } from '../notify';
import { copyMaterial, loadSource, snapshotOf } from './library';
import { refreshPlan } from './packs';
import { guessYear } from '../../shared/library';

export const classesRouter = Router();
classesRouter.use(requireAuth);

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30.').nullable().optional();

async function membership(classId: number, uid: number) {
  const m = await db('class_members').where({ class_id: classId, user_id: uid }).first('role');
  if (!m) throw new HttpError(404, 'You are not in this class. Ask for the join code.');
  return m.role as 'owner' | 'rep' | 'member';
}
const canManage = (role: string) => role === 'owner' || role === 'rep';

/** Tell the class (in the background, never failing the request). */
function notifyClass(classId: number, exceptUid: number, msg: { title: string; body: string; url: string }) {
  db('class_members')
    .where({ class_id: classId })
    .whereNot('user_id', exceptUid)
    .select('user_id')
    .then((rows: any[]) => Promise.all(rows.map((r) => sendToUser(r.user_id, { ...msg, tag: `class-${classId}` }).catch(() => 0))))
    .catch(() => {});
}

classesRouter.get('/', async (_req, res) => {
  const uid = userId(res);
  const rows = await db('class_members as m')
    .join('classes as c', 'c.id', 'm.class_id')
    .where('m.user_id', uid)
    .orderBy('c.created_at', 'desc')
    .select('c.id', 'c.name', 'c.course_code', 'c.university', 'c.exam_date', 'c.join_code', 'm.role');
  const counts = rows.length ? await db('class_members').whereIn('class_id', rows.map((r: any) => r.id)).groupBy('class_id').select('class_id').count({ n: '*' }) : [];
  res.json({
    classes: rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      courseCode: r.course_code,
      university: r.university,
      examDate: r.exam_date,
      role: r.role,
      joinCode: canManage(r.role) ? r.join_code : null,
      members: Number((counts as any[]).find((c) => c.class_id === r.id)?.n || 1),
    })),
  });
});

classesRouter.post('/', async (req, res) => {
  const uid = userId(res);
  const b = z
    .object({ name: z.string().trim().min(3, 'Give the class a name.').max(160), courseCode: z.string().trim().max(40).nullish(), university: z.string().trim().max(160).nullish(), examDate: dateStr })
    .parse(req.body);
  const owned = await db('classes').where({ owner_id: uid }).count({ n: '*' }).first();
  if (Number((owned as any)?.n || 0) >= 20) throw new HttpError(429, 'You already run 20 classes.');
  let code = newCode();
  while (await db('classes').where({ join_code: code }).first('id')) code = newCode();
  const t = now();
  const [id] = await db('classes').insert({ owner_id: uid, name: b.name, course_code: b.courseCode ? b.courseCode.toUpperCase() : null, university: b.university || null, join_code: code, exam_date: b.examDate || null, created_at: t });
  await db('class_members').insert({ class_id: id, user_id: uid, role: 'owner', joined_at: t });
  res.status(201).json({ id: Number(id), joinCode: code });
});

classesRouter.post('/join', async (req, res) => {
  const uid = userId(res);
  const { code } = z.object({ code: z.string().trim().min(4).max(12) }).parse(req.body);
  const c = await db('classes').where({ join_code: code.toUpperCase().replace(/[^A-Z0-9]/g, '') }).first('id', 'name');
  if (!c) throw new HttpError(404, 'No class has that code. Check it with your course rep.');
  const size = await db('class_members').where({ class_id: c.id }).count({ n: '*' }).first();
  if (Number((size as any)?.n || 0) >= 1500) throw new HttpError(409, 'This class is full.');
  try {
    await db('class_members').insert({ class_id: c.id, user_id: uid, role: 'member', joined_at: now() });
  } catch {
    /* already a member */
  }
  res.json({ id: c.id, name: c.name });
});

classesRouter.get('/:id', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  const role = await membership(id, uid);
  const c = await db('classes').where({ id }).first();
  const members = await db('class_members as m').join('users as u', 'u.id', 'm.user_id').where('m.class_id', id).orderBy('m.joined_at').select('u.id', 'u.name', 'm.role');
  const items = await db('class_items as i').join('users as u', 'u.id', 'i.added_by').where('i.class_id', id).orderBy('i.created_at', 'desc').select('i.id', 'i.kind', 'i.title', 'i.year', 'i.lessons', 'i.cards', 'i.created_at', 'u.name as added_by_name');
  const used = await db('class_item_uses').where({ user_id: uid }).whereIn('item_id', items.map((i: any) => i.id)).select('item_id', 'pack_id');
  const posts = await db('class_posts as p').join('users as u', 'u.id', 'p.user_id').where('p.class_id', id).orderBy('p.created_at', 'desc').limit(30).select('p.id', 'p.text', 'p.created_at', 'u.name', 'u.id as user_id');
  const ids = new Set(members.map((m: any) => Number(m.id)));
  const board = (await leaderboard(thisWeek())).filter((r) => ids.has(r.userId)).map((r, i) => ({ ...r, rank: i + 1 }));
  const myPacks = await db('packs').where({ user_id: uid }).orderBy('last_opened_at', 'desc').limit(60).select('id', 'title');
  const myPapers = canManage(role) ? await db('past_papers as pp').join('packs as p', 'p.id', 'pp.pack_id').where('pp.user_id', uid).orderBy('pp.id', 'desc').limit(60).select('pp.id', 'pp.name', 'p.title as pack_title') : [];
  res.json({
    class: { id: c.id, name: c.name, courseCode: c.course_code, university: c.university, examDate: c.exam_date, joinCode: canManage(role) ? c.join_code : null, createdAt: Number(c.created_at) },
    role,
    members: members.map((m: any) => ({ id: m.id, name: m.name, role: m.role })),
    items: items.map((i: any) => ({ id: i.id, kind: i.kind, title: i.title, year: i.year, lessons: i.lessons, cards: i.cards, addedBy: i.added_by_name, createdAt: Number(i.created_at), myPackId: (used as any[]).find((u) => u.item_id === i.id)?.pack_id ?? null })),
    posts: posts.map((p: any) => ({ id: p.id, text: p.text, at: Number(p.created_at), name: p.name, mine: p.user_id === uid })),
    ranking: board.slice(0, 50),
    myPacks,
    myPapers: (myPapers as any[]).map((p) => ({ id: p.id, name: p.name, packTitle: p.pack_title })),
  });
});

classesRouter.patch('/:id', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  if (!canManage(await membership(id, uid))) throw new HttpError(403, 'Only the course rep can change this.');
  const b = z.object({ name: z.string().trim().min(3).max(160).optional(), examDate: dateStr }).parse(req.body);
  const patch: Record<string, unknown> = {};
  if (b.name) patch.name = b.name;
  if (b.examDate !== undefined) patch.exam_date = b.examDate;
  await db('classes').where({ id }).update(patch);
  if (b.examDate) {
    // members' packs from this class get the new exam date, so their timetable and cram plan follow it
    const uses = await db('class_item_uses as u').join('class_items as i', 'i.id', 'u.item_id').where('i.class_id', id).whereNotNull('u.pack_id').select('u.user_id', 'u.pack_id');
    for (const u of uses as any[]) await db('packs').where({ id: u.pack_id, user_id: u.user_id }).update({ exam_date: b.examDate });
    for (const uidm of new Set((uses as any[]).map((u) => Number(u.user_id)))) refreshPlan(uidm);
    const c = await db('classes').where({ id }).first('name');
    notifyClass(id, uid, { title: `${c.name}: exam date set`, body: `The exam is on ${b.examDate}. Your timetable has been updated.`, url: `/class/${id}` });
  }
  res.json({ ok: true });
});

/** Share one of my packs or past papers with the class (course rep or lecturer). */
classesRouter.post('/:id/items', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  if (!canManage(await membership(id, uid))) throw new HttpError(403, 'Only the course rep can add materials. Post a message to suggest one.');
  const b = z.object({ packId: z.number().int().optional(), paperId: z.number().int().optional() }).refine((x) => !!x.packId !== !!x.paperId, { message: 'Choose a pack or a past paper.' }).parse(req.body);
  const src = await loadSource(uid, b);
  const { snapshot, stats } = snapshotOf(src);
  const [itemId] = await db('class_items').insert({
    class_id: id,
    added_by: uid,
    kind: src.kind,
    title: src.title,
    year: src.kind === 'paper' ? guessYear(`${src.title} ${src.text.slice(0, 3000)}`) : null,
    lessons: stats.lessons,
    cards: stats.cards,
    data: snapshot,
    source_text: src.text,
    created_at: now(),
  });
  // the rep's own pack counts as "added" for them
  if (src.kind === 'pack') await db('class_item_uses').insert({ item_id: itemId, user_id: uid, pack_id: b.packId, created_at: now() });
  const c = await db('classes').where({ id }).first('name');
  notifyClass(id, uid, { title: `New in ${c.name}`, body: `${src.kind === 'pack' ? 'Notes' : 'Past paper'}: ${src.title}`, url: `/class/${id}` });
  res.status(201).json({ id: Number(itemId) });
});

classesRouter.post('/:id/items/:itemId/add', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  await membership(id, uid);
  const b = z.object({ packId: z.number().int().optional() }).parse(req.body || {});
  const item = await db('class_items').where({ id: Number(req.params.itemId), class_id: id }).first();
  if (!item) throw new HttpError(404, 'Not found.');
  const c = await db('classes').where({ id }).first('exam_date', 'name');
  const packId = await copyMaterial(uid, { kind: item.kind, title: `${c.name}: ${item.title}`, data: parseJSON<any>(item.data, {}), sourceText: String(item.source_text || ''), year: item.year, examDate: c.exam_date }, b.packId);
  try {
    await db('class_item_uses').insert({ item_id: item.id, user_id: uid, pack_id: item.kind === 'pack' ? packId : null, created_at: now() });
  } catch {
    if (item.kind === 'pack') await db('class_item_uses').where({ item_id: item.id, user_id: uid }).update({ pack_id: packId });
  }
  res.status(201).json({ packId });
});

classesRouter.delete('/:id/items/:itemId', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  if (!canManage(await membership(id, uid))) throw new HttpError(403, 'Only the course rep can remove materials.');
  await db('class_items').where({ id: Number(req.params.itemId), class_id: id }).delete();
  res.json({ ok: true });
});

classesRouter.post('/:id/posts', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  const role = await membership(id, uid);
  const { text } = z.object({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
  const recent = await db('class_posts').where({ class_id: id, user_id: uid }).andWhere('created_at', '>', now() - 60_000).count({ n: '*' }).first();
  if (Number((recent as any)?.n || 0) >= 5) throw new HttpError(429, 'Slow down a little.');
  const [pid] = await db('class_posts').insert({ class_id: id, user_id: uid, text, created_at: now() });
  if (canManage(role)) {
    const c = await db('classes').where({ id }).first('name');
    notifyClass(id, uid, { title: c.name, body: text.slice(0, 140), url: `/class/${id}` });
  }
  res.status(201).json({ id: Number(pid) });
});

classesRouter.delete('/:id/posts/:postId', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  const role = await membership(id, uid);
  const q = db('class_posts').where({ id: Number(req.params.postId), class_id: id });
  await (canManage(role) ? q : q.andWhere('user_id', uid)).delete();
  res.json({ ok: true });
});

/** Make someone a course rep, remove them, or leave the class yourself. */
classesRouter.post('/:id/members/:userId', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  const target = Number(req.params.userId);
  const role = await membership(id, uid);
  const { action } = z.object({ action: z.enum(['rep', 'member', 'remove']) }).parse(req.body);
  if (target === uid && action === 'remove') {
    if (role === 'owner') throw new HttpError(400, 'You run this class. Delete the class instead.');
    await db('class_members').where({ class_id: id, user_id: uid }).delete();
    res.json({ ok: true });
    return;
  }
  if (role !== 'owner') throw new HttpError(403, 'Only the person who made the class can do this.');
  if (target === uid) throw new HttpError(400, 'You are the owner.');
  if (action === 'remove') await db('class_members').where({ class_id: id, user_id: target }).delete();
  else await db('class_members').where({ class_id: id, user_id: target }).update({ role: action });
  res.json({ ok: true });
});

classesRouter.delete('/:id', async (req, res) => {
  const uid = userId(res);
  const id = Number(req.params.id);
  if ((await membership(id, uid)) !== 'owner') throw new HttpError(403, 'Only the person who made the class can delete it.');
  await db('classes').where({ id }).delete();
  res.json({ ok: true });
});
