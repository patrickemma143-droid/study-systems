// The shared library: students share study packs and past papers; anyone can find them by
// faculty, course, university or year and add them to their own account in one tap.
import crypto from 'node:crypto';
import { detectOrigin, type PaperOrigin } from '../../shared/origin';
import { Router } from 'express';
import { z } from 'zod';
import { adminEmails } from '../config';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { award } from '../points';
import { refreshPlan, savePack } from './packs';
import type { StudyPack } from '../../shared/engine/types';
import type { KeyAnalysis, PaperAnalysis } from '../../shared/engine/paper';
import { buildOutline } from '../../shared/engine/outline';
import { FACULTIES, guessCourseCode, guessYear, normaliseForHash, suggestFaculty } from '../../shared/library';

export const libraryRouter = Router();
libraryRouter.use(requireAuth);

export const hashOf = (text: string) => crypto.createHash('sha256').update(normaliseForHash(text)).digest('hex');
const facultyIds = FACULTIES.map((f) => f.id) as [string, ...string[]];
const REPORTS_TO_HIDE = 3;

async function isAdmin(uid: number) {
  const u = await db('users').where({ id: uid }).first('email');
  return !!u && adminEmails.includes(String(u.email).toLowerCase());
}

/** What a list or card shows (never the big snapshot). */
function summary(r: any) {
  return {
    id: Number(r.id),
    kind: r.kind as 'pack' | 'paper',
    type: r.item_type as string,
    title: r.title as string,
    faculty: r.faculty as string,
    university: r.university || null,
    courseCode: r.course_code || null,
    courseName: r.course_name || null,
    year: r.year == null ? null : Number(r.year),
    semester: r.semester || null,
    author: r.author || null,
    description: r.description || null,
    words: Number(r.words || 0),
    lessons: Number(r.lessons || 0),
    cards: Number(r.cards || 0),
    smart: !!r.smart,
    hasKey: !!r.has_key,
    uses: Number(r.uses || 0),
    rating: r.rating_count ? Math.round((Number(r.rating_sum) / Number(r.rating_count)) * 10) / 10 : null,
    ratings: Number(r.rating_count || 0),
    status: r.status as string,
    sharedBy: r.owner_name || null,
    createdAt: Number(r.created_at),
  };
}
const SUMMARY_COLS = ['li.id', 'li.kind', 'li.item_type', 'li.title', 'li.faculty', 'li.university', 'li.course_code', 'li.course_name', 'li.year', 'li.semester', 'li.author', 'li.description', 'li.words', 'li.lessons', 'li.cards', 'li.smart', 'li.has_key', 'li.uses', 'li.rating_sum', 'li.rating_count', 'li.status', 'li.created_at', 'u.name as owner_name'];

// ─── Browse ──────────────────────────────────────────────────

libraryRouter.get('/', async (req, res) => {
  const q = z
    .object({
      q: z.string().trim().max(120).optional(),
      faculty: z.enum(facultyIds).optional(),
      type: z.enum(['notes', 'slides', 'book', 'paper']).optional(),
      university: z.string().trim().max(160).optional(),
      year: z.coerce.number().int().min(1980).max(2100).optional(),
      sort: z.enum(['popular', 'new', 'rated']).default('popular'),
      page: z.coerce.number().int().min(1).max(200).default(1),
    })
    .parse(req.query);
  const per = 24;
  let query = db('library_items as li').join('users as u', 'u.id', 'li.owner_id').where('li.status', 'live');
  if (q.faculty) query = query.where('li.faculty', q.faculty);
  if (q.type) query = query.where('li.item_type', q.type);
  if (q.year) query = query.where('li.year', q.year);
  if (q.university) query = query.whereRaw('LOWER(li.university) LIKE ?', [`%${q.university.toLowerCase()}%`]);
  if (q.q) {
    // every word must match the title, course, university, author or description
    for (const w of q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
      const like = `%${w.replace(/[%_]/g, '')}%`;
      const compact = `%${w.replace(/[^a-z0-9]/g, '')}%`;
      query = query.where((b) =>
        b
          .whereRaw('LOWER(li.title) LIKE ?', [like])
          .orWhereRaw('LOWER(li.course_code) LIKE ?', [like])
          .orWhereRaw("LOWER(REPLACE(li.course_code, ' ', '')) LIKE ?", [compact])
          .orWhereRaw('LOWER(li.course_name) LIKE ?', [like])
          .orWhereRaw('LOWER(li.university) LIKE ?', [like])
          .orWhereRaw('LOWER(li.author) LIKE ?', [like])
          .orWhereRaw('LOWER(li.description) LIKE ?', [like]),
      );
    }
  }
  const total = Number(((await query.clone().count({ n: '*' }).first()) as any)?.n || 0);
  if (q.sort === 'new') query = query.orderBy('li.created_at', 'desc');
  else if (q.sort === 'rated') query = query.orderByRaw('CASE WHEN li.rating_count = 0 THEN 0 ELSE li.rating_sum * 1.0 / li.rating_count END DESC').orderBy('li.uses', 'desc');
  // most used first; among equals, past papers first and then each book's chapters in order
  else query = query.orderBy('li.uses', 'desc').orderByRaw("CASE WHEN li.item_type = 'paper' THEN 0 ELSE 1 END").orderBy('li.course_name', 'asc').orderBy('li.created_at', 'asc');
  const rows = await query.select(SUMMARY_COLS).limit(per).offset((q.page - 1) * per);
  res.json({ items: rows.map(summary), total, page: q.page, pages: Math.max(1, Math.ceil(total / per)) });
});

/** The library's front page: every faculty with its counts, plus popular and new items. */
libraryRouter.get('/home', async (_req, res) => {
  const counts = await db('library_items').where('status', 'live').groupBy('faculty', 'item_type').select('faculty', 'item_type').count({ n: '*' });
  const faculties = FACULTIES.map((f) => {
    const mine = (counts as any[]).filter((c) => c.faculty === f.id);
    const by = (t: string) => Number(mine.find((c) => c.item_type === t)?.n || 0);
    return { id: f.id, label: f.label, short: f.short, packs: by('notes') + by('slides'), books: by('book'), papers: by('paper') };
  });
  const base = () => db('library_items as li').join('users as u', 'u.id', 'li.owner_id').where('li.status', 'live').select(SUMMARY_COLS);
  const popular = await base().orderBy('li.uses', 'desc').orderBy('li.created_at', 'desc').limit(8);
  const fresh = await base().orderBy('li.created_at', 'desc').limit(8);
  const total = (counts as any[]).reduce((n, c) => n + Number(c.n), 0);
  // the bookshelf: each textbook with how many chapters are ready to study
  const books = await db('library_items').where({ status: 'live', item_type: 'book' }).whereNotNull('course_name').groupBy('course_name', 'faculty').select('course_name', 'faculty').count({ n: '*' }).orderBy('faculty');
  res.json({ faculties, popular: popular.map(summary), fresh: fresh.map(summary), total, books: (books as any[]).map((b) => ({ title: b.course_name, faculty: b.faculty, chapters: Number(b.n) })) });
});

/** Things this student shared. */
libraryRouter.get('/mine', async (req, res) => {
  const uid = userId(res);
  const rows = await db('library_items as li').join('users as u', 'u.id', 'li.owner_id').where('li.owner_id', uid).orderBy('li.created_at', 'desc').select(SUMMARY_COLS);
  res.json({ items: rows.map(summary) });
});

// ─── Sharing ─────────────────────────────────────────────────

export async function loadSource(uid: number, src: { packId?: number; paperId?: number }) {
  if (src.packId) {
    const row = await db('packs').where({ id: src.packId, user_id: uid }).first();
    if (!row) throw new HttpError(404, 'Study pack not found.');
    const data = parseJSON<StudyPack | null>(row.data, null);
    if (!data) throw new HttpError(500, 'This study pack could not be read.');
    return { kind: 'pack' as const, row, data, text: String(row.source_text || data.chunks.map((c) => c.body.map((p) => p.x).join('\n')).join('\n')), title: String(row.title) };
  }
  const row = await db('past_papers').where({ id: src.paperId, user_id: uid }).first();
  if (!row) throw new HttpError(404, 'Past paper not found.');
  return { kind: 'paper' as const, row, data: null, text: String(row.text), title: String(row.name) };
}

/** A frozen copy of a pack or past paper that others can add to their accounts. */
export function snapshotOf(src: Awaited<ReturnType<typeof loadSource>>) {
  if (src.kind === 'pack') {
    const data = src.data!;
    if (!data.outline) data.outline = buildOutline(data);
    return { snapshot: JSON.stringify(data), stats: { words: data.stats.words, lessons: data.chunks.length, cards: data.cards.length, smart: !!data.smart && Object.keys(data.smart.lessons).length > 0, hasKey: false } };
  }
  const analysis = parseJSON<PaperAnalysis | null>(src.row.analysis, null);
  return {
    snapshot: JSON.stringify({ name: src.row.name, analysis, keyText: src.row.key_text || null, key: parseJSON<KeyAnalysis | null>(src.row.key_analysis, null) }),
    stats: { words: src.text.split(/\s+/).length, lessons: 0, cards: analysis?.questionCount || 0, smart: false, hasKey: !!src.row.key_text },
  };
}

/** Add a frozen copy to a student's account: a pack becomes their own pack; a past paper joins one of their packs. */
export async function copyMaterial(uid: number, m: { kind: 'pack' | 'paper'; title: string; data: any; sourceText: string; year?: number | null; libraryItemId?: number; examDate?: string | null }, targetPackId?: number): Promise<number> {
  if (m.kind === 'pack') {
    const id = await savePack(uid, m.data as StudyPack, { sourceType: 'paste', sourceName: m.title.slice(0, 255), text: m.sourceText, libraryItemId: m.libraryItemId, examDate: m.examDate || null });
    refreshPlan(uid);
    return id;
  }
  if (!targetPackId) throw new HttpError(400, 'Choose which of your study packs this past paper is for.');
  const own = await db('packs').where({ id: targetPackId, user_id: uid }).first('id');
  if (!own) throw new HttpError(404, 'Study pack not found.');
  await db('past_papers').insert({
    user_id: uid,
    pack_id: targetPackId,
    name: `${m.data.name || m.title}${m.year ? ` (${m.year})` : ''}`.slice(0, 200),
    text: m.sourceText,
    analysis: JSON.stringify(m.data.analysis || {}),
    key_text: m.data.keyText || null,
    key_analysis: m.data.key ? JSON.stringify(m.data.key) : null,
    created_at: now(),
  });
  return targetPackId;
}

/** Smart guesses for the share form, and whether this is already in the library. */
libraryRouter.get('/suggest', async (req, res) => {
  const uid = userId(res);
  const q = z.object({ packId: z.coerce.number().int().optional(), paperId: z.coerce.number().int().optional() }).parse(req.query);
  if (!q.packId && !q.paperId) throw new HttpError(400, 'Choose a pack or past paper.');
  const src = await loadSource(uid, q);
  const u = await db('users').where({ id: uid }).first('university', 'course');
  const hash = hashOf(src.text);
  const shared = await db('library_items').where({ owner_id: uid, kind: src.kind, ...(src.kind === 'pack' ? { pack_id: q.packId } : { paper_id: q.paperId }) }).first();
  const duplicate = shared ? null : await db('library_items').where({ text_hash: hash, status: 'live' }).whereNot('owner_id', uid).first('id', 'title');
  // a past paper borrows its course details from the pack it belongs to, if that pack is shared
  const packShare = src.kind === 'paper' ? await db('library_items').where({ owner_id: uid, kind: 'pack', pack_id: src.row.pack_id }).first() : null;
  // where it is from: saved with the pack / paper (confirmed by the student), else read from the header
  const packOrigin = src.kind === 'paper' ? parseJSON<PaperOrigin | null>((await db('packs').where({ id: src.row.pack_id }).first('origin'))?.origin, null) : null;
  const og = parseJSON<PaperOrigin | null>(src.row.origin, null) || detectOrigin(src.text, src.title);
  res.json({
    suggestion: shared
      ? { title: shared.title, faculty: shared.faculty, type: shared.item_type, university: shared.university, courseCode: shared.course_code, courseName: shared.course_name, year: shared.year, semester: shared.semester, author: shared.author, description: shared.description }
      : {
          title: src.title,
          faculty: packShare?.faculty || suggestFaculty(src.text, src.title),
          type: src.kind === 'paper' ? 'paper' : src.row.source_type === 'pptx' ? 'slides' : (src.data?.stats.words || 0) > 25_000 ? 'book' : 'notes',
          university: og.university || packShare?.university || packOrigin?.university || u?.university || '',
          courseCode: og.courseCode || packShare?.course_code || packOrigin?.courseCode || guessCourseCode(`${src.title}\n${src.text}`) || '',
          courseName: og.courseName || packShare?.course_name || packOrigin?.courseName || u?.course || '',
          year: src.kind === 'paper' ? og.year || guessYear(src.text) : null,
          semester: og.semester ? `Semester ${['I', 'II', 'III'][og.semester - 1]}` : null,
          author: null,
          description: '',
        },
    sharedItemId: shared?.id ?? null,
    duplicate: duplicate ? { id: duplicate.id, title: duplicate.title } : null,
  });
});

const shareSchema = z
  .object({
    packId: z.number().int().optional(),
    paperId: z.number().int().optional(),
    title: z.string().trim().min(3, 'Give it a clear title.').max(200),
    type: z.enum(['notes', 'slides', 'book', 'paper']),
    faculty: z.enum(facultyIds),
    university: z.string().trim().max(160).nullish(),
    courseCode: z.string().trim().max(40).nullish(),
    courseName: z.string().trim().max(160).nullish(),
    year: z.number().int().min(1980).max(2100).nullable().optional(),
    semester: z.string().trim().max(20).nullish(),
    author: z.string().trim().max(160).nullish(),
    description: z.string().trim().max(600).nullish(),
    rights: z.literal(true, { message: 'Please confirm you are allowed to share this.' }),
  })
  .refine((b) => !!b.packId !== !!b.paperId, { message: 'Choose a pack or a past paper.' });

libraryRouter.post('/share', async (req, res) => {
  const uid = userId(res);
  const b = shareSchema.parse(req.body);
  const src = await loadSource(uid, b);
  const hash = hashOf(src.text);
  const existing = await db('library_items').where({ owner_id: uid, kind: src.kind, ...(src.kind === 'pack' ? { pack_id: b.packId } : { paper_id: b.paperId }) }).first();
  if (!existing) {
    const dup = await db('library_items').where({ text_hash: hash, status: 'live' }).whereNot('owner_id', uid).first('id');
    if (dup) throw new HttpError(409, `This is already in the library. Open it instead: /library/${dup.id}`);
  }
  const { snapshot, stats } = snapshotOf(src);
  const t = now();
  const fields = {
    item_type: b.type,
    title: b.title,
    faculty: b.faculty,
    university: b.university || null,
    course_code: b.courseCode ? b.courseCode.toUpperCase().replace(/\s+/g, ' ') : null,
    course_name: b.courseName || null,
    year: b.year ?? null,
    semester: b.semester || null,
    author: b.author || null,
    description: b.description || null,
    text_hash: hash,
    words: stats.words,
    lessons: stats.lessons,
    cards: stats.cards,
    smart: stats.smart,
    has_key: stats.hasKey,
    data: snapshot,
    source_text: src.text,
    updated_at: t,
  };
  let id: number;
  if (existing) {
    await db('library_items').where({ id: existing.id }).update(fields);
    id = existing.id;
  } else {
    const [newId] = await db('library_items').insert({ ...fields, owner_id: uid, kind: src.kind, pack_id: b.packId || null, paper_id: b.paperId || null, created_at: t });
    id = Number(newId);
  }
  res.status(existing ? 200 : 201).json({ id, updated: !!existing });
});

/** Is the pack I just made already in the library (maybe already made smart by someone)? */
libraryRouter.get('/match/:packId', async (req, res) => {
  const uid = userId(res);
  const row = await db('packs').where({ id: Number(req.params.packId), user_id: uid }).first('source_text', 'library_item_id');
  if (!row || row.library_item_id || !row.source_text) {
    res.json({ match: null });
    return;
  }
  const hit = await db('library_items as li').join('users as u', 'u.id', 'li.owner_id').where({ 'li.text_hash': hashOf(String(row.source_text)), 'li.status': 'live' }).whereNot('li.owner_id', uid).first(SUMMARY_COLS);
  res.json({ match: hit ? summary(hit) : null });
});

// ─── One item ────────────────────────────────────────────────

async function liveItem(id: number, uid: number) {
  const r = await db('library_items as li').join('users as u', 'u.id', 'li.owner_id').where('li.id', id).first([...SUMMARY_COLS, 'li.owner_id', 'li.data']);
  if (!r) throw new HttpError(404, 'This item is no longer in the library.');
  if (r.status !== 'live' && r.owner_id !== uid && !(await isAdmin(uid))) throw new HttpError(404, 'This item is no longer in the library.');
  return r;
}

libraryRouter.get('/:id', async (req, res) => {
  const uid = userId(res);
  const r = await liveItem(Number(req.params.id), uid);
  const data = parseJSON<any>(r.data, null);
  let preview: any = null;
  if (r.kind === 'pack' && data) {
    const p = data as StudyPack;
    const outline = p.outline ?? buildOutline(p);
    preview = {
      overview: p.overview.slice(0, 4),
      topics: outline.topics.slice(0, 30),
      objectives: (outline.stated.length ? outline.stated : outline.objectives.flat()).slice(0, 10),
      lessons: p.chunks.map((c) => ({ index: c.index, title: c.title, minutes: c.readMinutes, nutshell: c.nutshell })),
      sampleCards: p.cards.slice(0, 4).map((c) => ({ front: c.front, back: c.back })),
      questions: p.quiz.length,
      terms: p.glossary.length,
    };
  } else if (data) {
    const a = data.analysis as PaperAnalysis | null;
    preview = {
      questions: a?.questionCount || 0,
      totalMarks: a?.totalMarks ?? null,
      duration: a?.duration ?? null,
      sections: a?.sections || [],
      instructions: a?.instructions || [],
      sample: (a?.questions || []).slice(0, 5).map((q) => q.text.slice(0, 260)),
      hasKey: !!data.keyText,
    };
  }
  // the same course (by code), or the other chapters of the same book
  const related =
    r.course_code || r.course_name
      ? await db('library_items as li')
          .join('users as u', 'u.id', 'li.owner_id')
          .where('li.status', 'live')
          .where((b) => (r.course_code ? b.where('li.course_code', r.course_code) : b.where('li.course_name', r.course_name)))
          .whereNot('li.id', r.id)
          .orderByRaw("CASE WHEN li.item_type = 'paper' THEN 0 ELSE 1 END")
          .orderBy('li.year', 'desc')
          .orderBy('li.created_at', 'asc')
          .limit(r.course_code ? 12 : 40)
          .select(SUMMARY_COLS)
      : [];
  const mine = await db('library_ratings').where({ item_id: r.id, user_id: uid }).first('stars');
  const reported = await db('library_reports').where({ item_id: r.id, user_id: uid }).first('id');
  const myPacks = r.kind === 'pack' ? await db('packs').where({ user_id: uid, library_item_id: r.id }).select('id') : [];
  const packs = r.kind === 'paper' ? await db('packs').where({ user_id: uid }).orderBy('last_opened_at', 'desc').limit(50).select('id', 'title') : [];
  res.json({
    item: summary(r),
    preview,
    related: related.map(summary),
    myRating: mine?.stars ?? null,
    reported: !!reported,
    isOwner: r.owner_id === uid,
    inMyPacks: myPacks.map((p: any) => p.id),
    myPacks: packs,
  });
});

/** Read the full text of a shared item. */
libraryRouter.get('/:id/text', async (req, res) => {
  const uid = userId(res);
  const r = await liveItem(Number(req.params.id), uid);
  const row = await db('library_items').where({ id: r.id }).first('source_text');
  res.json({ title: r.title, text: String(row?.source_text || '') });
});

/** Add a shared item to my account: a pack becomes my own pack; a past paper joins one of my packs. */
libraryRouter.post('/:id/add', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ packId: z.number().int().optional() }).parse(req.body || {});
  const r = await liveItem(Number(req.params.id), uid);
  const data = parseJSON<any>(r.data, null);
  if (!data) throw new HttpError(500, 'This item could not be read.');
  const src = await db('library_items').where({ id: r.id }).first('source_text');
  const packId = await copyMaterial(uid, { kind: r.kind, title: `Library: ${r.title}`, data, sourceText: String(src?.source_text || ''), year: r.year, libraryItemId: r.kind === 'pack' ? r.id : undefined }, body.packId);
  // count each student once, and thank the person who shared it
  if (r.owner_id !== uid) {
    try {
      await db('library_uses').insert({ item_id: r.id, user_id: uid, created_at: now() });
      await db('library_items').where({ id: r.id }).increment('uses', 1);
      await award(r.owner_id, 'helper', 5, `Someone used your “${String(r.title).slice(0, 80)}” from the library`, `lib-use-${r.id}-${uid}`);
    } catch {
      /* already counted */
    }
  }
  res.status(201).json({ packId });
});

libraryRouter.post('/:id/rate', async (req, res) => {
  const uid = userId(res);
  const { stars } = z.object({ stars: z.number().int().min(1).max(5) }).parse(req.body);
  const r = await liveItem(Number(req.params.id), uid);
  if (r.owner_id === uid) throw new HttpError(400, 'You can’t rate your own upload.');
  await db.transaction(async (trx) => {
    const prev = await trx('library_ratings').where({ item_id: r.id, user_id: uid }).first('stars');
    if (prev) {
      await trx('library_ratings').where({ item_id: r.id, user_id: uid }).update({ stars });
      await trx('library_items').where({ id: r.id }).increment('rating_sum', stars - Number(prev.stars));
    } else {
      await trx('library_ratings').insert({ item_id: r.id, user_id: uid, stars, created_at: now() });
      await trx('library_items').where({ id: r.id }).increment({ rating_sum: stars, rating_count: 1 });
    }
  });
  const fresh = await db('library_items').where({ id: r.id }).first('rating_sum', 'rating_count');
  res.json({ rating: Math.round((fresh.rating_sum / fresh.rating_count) * 10) / 10, ratings: Number(fresh.rating_count) });
});

libraryRouter.post('/:id/report', async (req, res) => {
  const uid = userId(res);
  const body = z.object({ reason: z.enum(['copyright', 'wrong', 'poor', 'spam', 'other']), detail: z.string().trim().max(500).optional() }).parse(req.body);
  const r = await liveItem(Number(req.params.id), uid);
  try {
    await db('library_reports').insert({ item_id: r.id, user_id: uid, reason: body.reason, detail: body.detail || null, created_at: now() });
    await db('library_items').where({ id: r.id }).increment('reports', 1);
  } catch {
    throw new HttpError(409, 'You already reported this. Thank you, an admin will look at it.');
  }
  // several reports take it down until an admin checks it
  await db('library_items').where({ id: r.id }).andWhere('reports', '>=', REPORTS_TO_HIDE).update({ status: 'hidden' });
  res.json({ ok: true });
});

libraryRouter.delete('/:id', async (req, res) => {
  const uid = userId(res);
  const r = await db('library_items').where({ id: Number(req.params.id) }).first('id', 'owner_id');
  if (!r) throw new HttpError(404, 'Not found.');
  if (r.owner_id !== uid && !(await isAdmin(uid))) throw new HttpError(403, 'Only the person who shared this can remove it.');
  await db('library_items').where({ id: r.id }).delete();
  res.json({ ok: true });
});

// ─── Admin ───────────────────────────────────────────────────

libraryRouter.get('/admin/reports', async (_req, res) => {
  if (!(await isAdmin(userId(res)))) throw new HttpError(403, 'Admins only.');
  const rows = await db('library_items as li')
    .join('users as u', 'u.id', 'li.owner_id')
    .where('li.reports', '>', 0)
    .orderBy('li.reports', 'desc')
    .limit(100)
    .select([...SUMMARY_COLS, 'li.reports', 'u.email as owner_email']);
  const reasons = await db('library_reports').whereIn('item_id', rows.map((r: any) => r.id)).select('item_id', 'reason', 'detail');
  res.json({
    items: rows.map((r: any) => ({ ...summary(r), reports: Number(r.reports), ownerEmail: r.owner_email, reasons: (reasons as any[]).filter((x) => x.item_id === r.id).map((x) => ({ reason: x.reason, detail: x.detail })) })),
  });
});

libraryRouter.post('/admin/:id/status', async (req, res) => {
  if (!(await isAdmin(userId(res)))) throw new HttpError(403, 'Admins only.');
  const { status } = z.object({ status: z.enum(['live', 'hidden']) }).parse(req.body);
  const patch: Record<string, unknown> = { status, updated_at: now() };
  if (status === 'live') patch.reports = 0;
  await db('library_items').where({ id: Number(req.params.id) }).update(patch);
  if (status === 'live') await db('library_reports').where({ item_id: Number(req.params.id) }).delete();
  res.json({ ok: true });
});
