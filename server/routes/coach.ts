// Exam coach: what is likely to come up (from past papers) and where the student is weak,
// combined into "fix these first" with ready-made drills.
import { Router } from 'express';
import { HttpError, requireAuth, userId } from '../auth';
import { db, now, parseJSON } from '../db';
import { recallNow } from '../../shared/srs';
import { predictTopics, type Prediction } from '../../shared/engine/predict';
import { guessYear } from '../../shared/library';
import type { StudyPack } from '../../shared/engine/types';

export const coachRouter = Router();
coachRouter.use(requireAuth);

export interface WeakSpot {
  chunk: number;
  title: string;
  risk: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
  likelihood: string | null;
  cards: number;
}

async function prediction(uid: number, packId: number, pack: StudyPack): Promise<Prediction> {
  const papers = await db('past_papers').where({ user_id: uid, pack_id: packId }).select('name', 'text');
  return predictTopics(
    pack,
    (papers as any[]).map((p) => ({ text: String(p.text), year: guessYear(`${p.name} ${String(p.text).slice(0, 3000)}`) })),
  );
}

coachRouter.get('/:packId', async (req, res) => {
  const uid = userId(res);
  const packId = Number(req.params.packId);
  const row = await db('packs').where({ id: packId, user_id: uid }).first('data');
  if (!row) throw new HttpError(404, 'Study pack not found.');
  const pack = parseJSON<StudyPack | null>(row.data, null);
  if (!pack) throw new HttpError(500, 'This study pack could not be read.');
  const t = now();

  const predict = await prediction(uid, packId, pack);
  const likely = new Map(predict.topics.map((x) => [x.chunk, x]));

  const progress = new Map((await db('chunk_progress').where({ user_id: uid, pack_id: packId }).select('chunk_index', 'status', 'best_recall')).map((p: any) => [Number(p.chunk_index), p]));
  const cards = (await db('cards').where({ user_id: uid, pack_id: packId, suspended: false }).select('id', 'chunk_index', 'ease', 'interval_days', 'reps', 'lapses', 'stability', 'last_reviewed_at', 'difficulty')) as any[];
  const recall = (c: any) =>
    Number(c.reps) > 0 || c.last_reviewed_at
      ? recallNow({ ease: Number(c.ease), interval_days: Number(c.interval_days), reps: Number(c.reps), lapses: Number(c.lapses), stability: c.stability == null ? null : Number(c.stability), last_reviewed_at: c.last_reviewed_at == null ? null : Number(c.last_reviewed_at) }, t)
      : null;

  // quiz questions answered wrongly, by lesson
  const quizChunk = new Map(pack.quiz.map((q) => [q.id, q.chunk]));
  const attempts = await db('quiz_attempts').where({ user_id: uid, pack_id: packId }).orderBy('id', 'desc').limit(10).select('details');
  const quizWrong = new Map<number, number>();
  const quizSeen = new Map<number, number>();
  for (const a of attempts as any[]) {
    for (const d of parseJSON<{ id: string; ok: boolean }[]>(a.details, []) || []) {
      const ch = quizChunk.get(d?.id);
      if (ch == null) continue;
      quizSeen.set(ch, (quizSeen.get(ch) || 0) + 1);
      if (!d.ok) quizWrong.set(ch, (quizWrong.get(ch) || 0) + 1);
    }
  }

  const spots: (WeakSpot & { drill: number[] })[] = pack.chunks.map((c) => {
    const p: any = progress.get(c.index);
    const own = cards.filter((x) => Number(x.chunk_index) === c.index);
    const reviewed = own.map((x) => ({ x, r: recall(x) })).filter((y) => y.r != null) as { x: any; r: number }[];
    const mem = reviewed.length ? reviewed.reduce((n, y) => n + y.r, 0) / reviewed.length : null;
    const lapses = own.reduce((n, x) => n + Number(x.lapses || 0), 0);
    const wrong = quizWrong.get(c.index) || 0;
    const seen = quizSeen.get(c.index) || 0;
    const understood = p && (p.status === 'understood' || p.status === 'mastered');
    const explained = p?.best_recall != null ? Number(p.best_recall) : null;
    const reasons: string[] = [];
    let gap = 0;
    if (!understood) {
      gap += 0.35;
      reasons.push(p?.status === 'read' ? 'read but not yet checked' : 'not studied yet');
    }
    if (mem != null && mem < 0.7) {
      gap += 0.3 * (1 - mem);
      reasons.push(`${Math.round((1 - mem) * 100)}% of its cards are fading`);
    }
    if (lapses >= 2) {
      gap += Math.min(0.25, lapses * 0.05);
      reasons.push(`forgotten ${lapses} times in flashcards`);
    }
    if (seen && wrong / seen >= 0.34) {
      gap += 0.3 * (wrong / seen);
      reasons.push(`${wrong} of ${seen} quiz answers wrong`);
    }
    if (explained != null && explained < 60) {
      gap += 0.15;
      reasons.push(`explanation scored ${explained}%`);
    } else if (explained == null && understood) {
      gap += 0.05;
    }
    const lk = likely.get(c.index);
    const weight = predict.method === 'past-papers' ? 0.35 + (lk?.score || 0) / 100 : 0.6 + c.importance * 0.4;
    const score = Math.round(Math.min(1, gap) * weight * 100);
    // the cards worth drilling: forgotten before, fading now, or never tried
    const drill = own
      .map((x) => ({ id: Number(x.id), w: Number(x.lapses || 0) * 2 + (recall(x) == null ? 0.5 : 1 - (recall(x) as number)) }))
      .sort((a, b) => b.w - a.w)
      .map((x) => x.id);
    return {
      chunk: c.index,
      title: c.title,
      risk: score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low',
      score,
      reasons,
      likelihood: lk && predict.method === 'past-papers' ? lk.likelihood : null,
      cards: own.length,
      drill,
    };
  });
  spots.sort((a, b) => b.score - a.score);
  const focus = spots.filter((s) => s.risk !== 'low').slice(0, 4);
  const drillCards: number[] = [];
  for (let round = 0; drillCards.length < 10 && round < 10; round++) {
    for (const s of focus.length ? focus : spots.slice(0, 3)) {
      const id = s.drill[round];
      if (id != null && !drillCards.includes(id) && drillCards.length < 10) drillCards.push(id);
    }
  }
  res.json({
    prediction: predict,
    spots: spots.map(({ drill, ...s }) => s),
    focus: focus.map((s) => s.chunk),
    drillCards,
    studied: cards.some((c) => Number(c.reps) > 0) || progress.size > 0 || attempts.length > 0,
  });
});
