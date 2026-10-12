// Cram levels: how hard to push depends on how close the paper is and how much you've covered.
import type { Chunk } from '@shared/engine/types';

export type Level = 'chill' | 'steady' | 'intense' | 'extreme';
export type StepId = 'learn' | 'sheet' | 'cards' | 'quiz' | 'blurt' | 'mistakes' | 'break';

export interface CramStep {
  id: StepId;
  label: string;
  min: number;
  lessons: number[];
  cards?: number;
  questions?: number;
  sprint?: number;
}

export interface CramPlan {
  level: Level;
  steps: CramStep[];
  covered: number[];
  skipped: number[];
  totalMin: number;
}

export const LEVELS: Record<Level, { name: string; when: string; blurb: string; tone: string }> = {
  chill: {
    name: 'Chill',
    when: 'Exam more than a week away',
    blurb: 'A full, calm pass over everything. Your timetable does the real work; this is a top-up.',
    tone: 'var(--good)',
  },
  steady: {
    name: 'Steady',
    when: 'Exam in 3 to 7 days',
    blurb: 'Every lesson, tested properly: cheat sheet, flashcards, quiz and recall.',
    tone: 'var(--biro)',
  },
  intense: {
    name: 'Intense',
    when: 'Exam in 1 or 2 days',
    blurb: 'The most examinable two-thirds, in focused sprints with short breaks.',
    tone: 'var(--warn)',
  },
  extreme: {
    name: 'Extreme',
    when: 'Paper tomorrow and you haven’t read much',
    blurb: 'Survival mode. We pick the lessons most likely to come up, teach them fast, test them, and get you to bed.',
    tone: 'var(--bad)',
  },
};

/** Which level fits, from days to the exam and the share of lessons already understood. */
export function suggestLevel(daysLeft: number | null, understoodShare: number): Level {
  if (daysLeft === null) return 'steady';
  if (daysLeft <= 1) return understoodShare < 0.5 ? 'extreme' : 'intense';
  if (daysLeft <= 2) return understoodShare < 0.25 ? 'extreme' : 'intense';
  if (daysLeft <= 7) return 'steady';
  return 'chill';
}

const byImportance = (chunks: Chunk[]) => [...chunks].sort((a, b) => b.importance - a.importance);

/**
 * Build the plan. `minutes` is the time the student has right now.
 * Lessons are taught most-examinable first; whatever doesn't fit is listed honestly as skipped.
 */
export function buildCramPlan(level: Level, chunks: Chunk[], minutes: number, understood: Set<number>): CramPlan {
  const ranked = byImportance(chunks);
  const all = ranked.map((c) => c.index);

  if (level === 'chill' || level === 'steady') {
    const m = Math.max(30, minutes);
    const steps: CramStep[] = [
      { id: 'sheet', label: 'Read the cheat sheet', min: Math.round(m * 0.25), lessons: all },
      { id: 'cards', label: 'Flashcards', min: Math.round(m * 0.3), lessons: all, cards: Math.round(m * 0.9) },
      { id: 'quiz', label: 'Practice quiz', min: Math.round(m * 0.25), lessons: all, questions: Math.max(8, Math.round(m / 4)) },
      { id: 'blurt', label: 'Blurt what you remember', min: Math.round(m * 0.12), lessons: all.slice(0, 6) },
      { id: 'mistakes', label: 'Go over mistakes', min: Math.max(3, Math.round(m * 0.08)), lessons: all },
    ];
    return { level, steps, covered: all, skipped: [], totalMin: steps.reduce((n, s) => n + s.min, 0) };
  }

  // Intense and Extreme: 25-minute sprints with 5-minute breaks, plus a final wrap-up.
  const wrap = minutes >= 60 ? 15 : 8;
  const sprintCount = Math.max(1, Math.floor((minutes - wrap) / 30));
  const perLesson = (c: Chunk) => {
    const read = understood.has(c.index) ? 1 : level === 'extreme' ? Math.min(4, Math.max(2, Math.ceil(c.readMinutes / 2))) : Math.min(5, Math.max(2, c.readMinutes));
    return read + 4; // reading the key points, then 3–4 cards and a couple of questions
  };
  const share = level === 'intense' ? 0.7 : 1;
  const candidates = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * share)));

  const sprints: number[][] = [];
  let pool = [...candidates];
  for (let i = 0; i < sprintCount && pool.length; i++) {
    const group: number[] = [];
    let used = 0;
    while (pool.length && (used + perLesson(pool[0]) <= 25 || !group.length)) {
      used += perLesson(pool[0]);
      group.push(pool[0].index);
      pool = pool.slice(1);
    }
    sprints.push(group);
  }
  const covered = sprints.flat();
  const skipped = all.filter((i) => !covered.includes(i));

  const steps: CramStep[] = [];
  sprints.forEach((group, i) => {
    const sprint = i + 1;
    const newOnes = group.filter((g) => !understood.has(g));
    if (newOnes.length) steps.push({ id: 'learn', label: `Sprint ${sprint}: learn ${newOnes.length === 1 ? '1 lesson' : `${newOnes.length} lessons`}`, min: Math.max(5, Math.round(25 * 0.45)), lessons: newOnes, sprint });
    steps.push({ id: 'cards', label: `Sprint ${sprint}: flashcards`, min: newOnes.length ? 8 : 13, lessons: group, cards: group.length * 4, sprint });
    steps.push({ id: 'quiz', label: `Sprint ${sprint}: quick quiz`, min: newOnes.length ? 6 : 12, lessons: group, questions: Math.max(3, group.length * 2), sprint });
    if (i < sprints.length - 1) steps.push({ id: 'break', label: '5-minute break', min: 5, lessons: [], sprint });
  });
  steps.push({ id: 'sheet', label: 'Wrap-up: cheat sheet', min: Math.max(4, wrap - 5), lessons: covered });
  if (minutes >= 60) steps.push({ id: 'blurt', label: 'Wrap-up: blurt it all out', min: 5, lessons: covered.slice(0, 6) });
  steps.push({ id: 'mistakes', label: 'Go over mistakes', min: 3, lessons: covered });
  return { level, steps, covered, skipped, totalMin: steps.reduce((n, s) => n + s.min, 0) };
}

/** Hours from now until a bedtime like "23:00" (tomorrow if it has passed). */
export function hoursUntil(bedtime: string, now = new Date()): number {
  const [h, m] = bedtime.split(':').map(Number);
  const t = new Date(now);
  t.setHours(h, m || 0, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  const hours = (t.getTime() - now.getTime()) / 3600_000;
  return hours > 18 ? 0 : hours; // already past bedtime
}
