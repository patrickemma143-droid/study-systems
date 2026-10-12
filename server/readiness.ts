// How ready a student is for an exam, from what they have actually done,
// with an honest but encouraging message and the lessons to fix next.
import { db, now, parseJSON } from './db';
import { aiDay } from './ai/service';
import { recallNow } from '../shared/srs';
import type { StudyPack } from '../shared/engine/types';

export interface Readiness {
  score: number;
  label: 'Not ready yet' | 'Getting there' | 'Nearly ready' | 'Ready';
  parts: { coverage: number; memory: number; practice: number; explain: number };
  weak: { index: number; title: string; why: string }[];
  message: string;
  daysLeft: number | null;
}

const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

export async function readinessFor(uid: number, packId: number, pack?: StudyPack | null, examDate?: string | null): Promise<Readiness | null> {
  if (!pack) {
    const row = await db('packs').where({ id: packId, user_id: uid }).select('data', 'exam_date').first();
    if (!row) return null;
    pack = parseJSON<StudyPack | null>(row.data, null);
    examDate = row.exam_date;
  }
  if (!pack || !pack.chunks.length) return null;
  const t = now();
  const progress = await db('chunk_progress').where({ user_id: uid, pack_id: packId }).select('chunk_index', 'status', 'best_recall');
  const prog = new Map(progress.map((p: any) => [Number(p.chunk_index), p]));
  const cards = await db('cards').where({ user_id: uid, pack_id: packId, suspended: false }).select('chunk_index', 'ease', 'interval_days', 'reps', 'lapses', 'stability', 'last_reviewed_at');
  const quizzes = await db('quiz_attempts').where({ user_id: uid, pack_id: packId }).orderBy('id', 'desc').limit(3).select('score', 'total');

  const lessons = pack.chunks.map((c) => {
    const p: any = prog.get(c.index);
    const understood = p && (p.status === 'understood' || p.status === 'mastered');
    const own = (cards as any[]).filter((x) => Number(x.chunk_index) === c.index);
    const mem = own.length
      ? own.reduce((n, x) => n + (Number(x.reps) > 0 || x.last_reviewed_at ? recallNow({ ease: Number(x.ease), interval_days: Number(x.interval_days), reps: Number(x.reps), lapses: Number(x.lapses), stability: x.stability == null ? null : Number(x.stability), last_reviewed_at: x.last_reviewed_at == null ? null : Number(x.last_reviewed_at) }, t) : 0), 0) / own.length
      : understood
        ? 0.7
        : 0;
    return { c, understood: !!understood, mem, explain: p?.best_recall != null ? Number(p.best_recall) / 100 : 0 };
  });

  const coverage = lessons.filter((l) => l.understood).length / lessons.length;
  const memory = lessons.reduce((n, l) => n + l.mem, 0) / lessons.length;
  const practice = quizzes.length ? quizzes.reduce((n: number, q: any) => n + Number(q.score) / Math.max(1, Number(q.total)), 0) / quizzes.length : 0;
  const explain = lessons.reduce((n, l) => n + l.explain, 0) / lessons.length;
  const score = pct(0.3 * coverage + 0.3 * memory + 0.25 * practice + 0.15 * explain);
  const label: Readiness['label'] = score >= 85 ? 'Ready' : score >= 65 ? 'Nearly ready' : score >= 40 ? 'Getting there' : 'Not ready yet';

  // Weakest lessons, most examinable first
  const weak = lessons
    .map((l) => ({ l, gap: (1 - (l.understood ? 1 : 0)) * 0.4 + (1 - l.mem) * 0.4 + (1 - l.explain) * 0.2, imp: l.c.importance }))
    .filter((x) => x.gap > 0.35)
    .sort((a, b) => b.gap * (0.5 + b.imp) - a.gap * (0.5 + a.imp))
    .slice(0, 3)
    .map(({ l }) => ({ index: l.c.index, title: l.c.title, why: !l.understood ? 'not studied yet' : l.mem < 0.6 ? 'fading from memory' : 'not explained yet' }));

  const today = aiDay();
  const daysLeft = examDate ? Math.round((Date.parse(`${examDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) : null;
  const done = lessons.filter((l) => l.understood).length;
  const praise = done ? `You’ve already got ${done} of ${lessons.length} lessons — that’s real progress. ` : '';
  const focus = weak.length ? `Focus on ${weak.slice(0, 2).map((w) => `“${w.title}”`).join(' and ')}.` : '';
  let message: string;
  if (score >= 85) message = `${praise}You’re ready. Keep it light now: one quick quiz, the cheat sheet, and a good night’s sleep. You’ve got this!`;
  else if (score >= 65) message = `${praise}Nearly there. ${focus} A couple of short sessions and you’ll walk in confident.`;
  else if (score >= 40) message = `${praise}You’re getting there. ${focus} Every session from now counts more than you think.`;
  else if (daysLeft !== null && daysLeft <= 1) message = `${praise}Don’t panic — there’s still time to learn the parts most likely to come up. Open the cram plan; Extreme mode picks them for you, then sleep.`;
  else message = `${praise}There’s time to get ready. ${focus || 'Start with the first lesson.'} Follow your timetable and you’ll see this number climb every day.`;

  return { score, label, parts: { coverage: pct(coverage), memory: pct(memory), practice: pct(practice), explain: pct(explain) }, weak, message, daysLeft };
}
