// Past papers: upload one to a pack and we work out how its questions are set.
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { analyzeKey, analyzePaper, type KeyAnalysis, type PaperAnalysis } from '../../shared/engine/paper';
import type { StudyPack } from '../../shared/engine/types';

export const papersRouter = Router();
papersRouter.use(requireAuth);

async function ownPack(uid: number, id: number) {
  const row = await db('packs').where({ id, user_id: uid }).select('id', 'data').first();
  if (!row) throw new HttpError(404, 'Study pack not found.');
  return parseJSON<StudyPack | null>(row.data, null) || undefined;
}

const out = (r: any) => ({ id: r.id, name: r.name, analysis: parseJSON<PaperAnalysis | null>(r.analysis, null), key: parseJSON<KeyAnalysis | null>(r.key_analysis, null), createdAt: Number(r.created_at) });

/** Every past paper the student has uploaded, in any course pack, so a format learnt once can be used anywhere. */
papersRouter.get('/all/past-papers', async (_req, res) => {
  const uid = userId(res);
  const rows = await db('past_papers as pp')
    .join('packs as p', 'p.id', 'pp.pack_id')
    .where('pp.user_id', uid)
    .orderBy('pp.id', 'desc')
    .limit(100)
    .select('pp.id', 'pp.name', 'pp.analysis', 'pp.key_analysis', 'pp.created_at', 'pp.pack_id', 'p.title as pack_title');
  res.json({ papers: rows.map((r: any) => ({ ...out(r), packId: r.pack_id, packTitle: r.pack_title })) });
});

papersRouter.get('/:id/past-papers', async (req, res) => {
  const uid = userId(res);
  await ownPack(uid, Number(req.params.id));
  const rows = await db('past_papers').where({ user_id: uid, pack_id: Number(req.params.id) }).orderBy('id', 'desc').select('id', 'name', 'analysis', 'key_analysis', 'created_at');
  res.json({ papers: rows.map(out) });
});

papersRouter.post('/:id/past-papers', async (req, res) => {
  const uid = userId(res);
  const packId = Number(req.params.id);
  const pack = await ownPack(uid, packId);
  const body = z
    .object({
      name: z.string().trim().min(1).max(200),
      text: z.string().trim().min(80, 'We found very little text in that paper. Try a clearer scan or photo, or paste the questions instead.').max(300_000),
      keyText: z.string().trim().max(300_000).optional(),
    })
    .parse(req.body);
  const analysis = analyzePaper(body.text, pack);
  const key = body.keyText && body.keyText.length > 20 ? analyzeKey(body.keyText, analysis) : null;
  if (analysis.questionCount < 2) throw new HttpError(422, 'We couldn’t find numbered questions in that paper. Check that the questions start with numbers like “1.” or “Question 1”.');
  const [id] = await db('past_papers').insert({ user_id: uid, pack_id: packId, name: body.name, text: body.text, analysis: JSON.stringify(analysis), key_text: key ? body.keyText : null, key_analysis: key ? JSON.stringify(key) : null, created_at: now() });
  const row = await db('past_papers').where({ id }).first();
  res.status(201).json({ paper: out(row) });
});

papersRouter.delete('/:id/past-papers/:pid', async (req, res) => {
  await db('past_papers').where({ id: Number(req.params.pid), user_id: userId(res) }).delete();
  res.json({ ok: true });
});

/** Add (or replace) the marking key for a past paper. */
papersRouter.post('/:id/past-papers/:pid/key', async (req, res) => {
  const uid = userId(res);
  const row = await db('past_papers').where({ id: Number(req.params.pid), user_id: uid, pack_id: Number(req.params.id) }).first();
  if (!row) throw new HttpError(404, 'Past paper not found.');
  const body = z.object({ text: z.string().trim().min(20, 'We found very little text in that marking key.').max(300_000) }).parse(req.body);
  const key = analyzeKey(body.text, parseJSON<PaperAnalysis | null>(row.analysis, null));
  if (!Object.keys(key.answers).length) throw new HttpError(422, 'We couldn’t find numbered answers in that key. Answers should start with the question number, like “1.” or “Q1”.');
  await db('past_papers').where({ id: row.id }).update({ key_text: body.text, key_analysis: JSON.stringify(key) });
  res.json({ paper: out(await db('past_papers').where({ id: row.id }).first()) });
});
