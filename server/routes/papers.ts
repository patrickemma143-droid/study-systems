// Past papers: upload one to a pack and we work out how its questions are set.
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { analyzePaper, type PaperAnalysis } from '../../shared/engine/paper';
import type { StudyPack } from '../../shared/engine/types';

export const papersRouter = Router();
papersRouter.use(requireAuth);

async function ownPack(uid: number, id: number) {
  const row = await db('packs').where({ id, user_id: uid }).select('id', 'data').first();
  if (!row) throw new HttpError(404, 'Study pack not found.');
  return parseJSON<StudyPack | null>(row.data, null) || undefined;
}

const out = (r: any) => ({ id: r.id, name: r.name, analysis: parseJSON<PaperAnalysis | null>(r.analysis, null), createdAt: Number(r.created_at) });

papersRouter.get('/:id/past-papers', async (req, res) => {
  const uid = userId(res);
  await ownPack(uid, Number(req.params.id));
  const rows = await db('past_papers').where({ user_id: uid, pack_id: Number(req.params.id) }).orderBy('id', 'desc').select('id', 'name', 'analysis', 'created_at');
  res.json({ papers: rows.map(out) });
});

papersRouter.post('/:id/past-papers', async (req, res) => {
  const uid = userId(res);
  const packId = Number(req.params.id);
  const pack = await ownPack(uid, packId);
  const body = z.object({ name: z.string().trim().min(1).max(200), text: z.string().trim().min(80, 'That paper has very little text. If it is a scanned photo, it can’t be read yet; try pasting the questions instead.').max(300_000) }).parse(req.body);
  const analysis = analyzePaper(body.text, pack);
  if (analysis.questionCount < 2) throw new HttpError(422, 'We couldn’t find numbered questions in that paper. Check that the questions start with numbers like “1.” or “Question 1”.');
  const [id] = await db('past_papers').insert({ user_id: uid, pack_id: packId, name: body.name, text: body.text, analysis: JSON.stringify(analysis), created_at: now() });
  const row = await db('past_papers').where({ id }).first();
  res.status(201).json({ paper: out(row) });
});

papersRouter.delete('/:id/past-papers/:pid', async (req, res) => {
  await db('past_papers').where({ id: Number(req.params.pid), user_id: userId(res) }).delete();
  res.json({ ok: true });
});
