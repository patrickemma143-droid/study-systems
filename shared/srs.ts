// Spaced repetition (a modified SM-2, similar to Anki) with an exam-date cap,
// so cards are always reviewed at least twice before the exam.
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface CardState {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export function schedule(card: CardState, rating: Rating, nowMs: number, examDate?: string | null) {
  let { ease, interval_days: interval, reps, lapses } = card;
  let dueIn: number;

  if (rating === 1) {
    if (reps > 0) lapses += 1;
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    dueIn = 1 * MIN;
  } else if (reps === 0) {
    // first time seeing (or relearning) the card
    if (rating === 2) {
      interval = 0;
      dueIn = 6 * MIN;
    } else if (rating === 3) {
      interval = 1;
      dueIn = DAY;
    } else {
      interval = 3;
      ease += 0.15;
      dueIn = 3 * DAY;
    }
    reps = rating === 2 ? 0 : 1;
  } else {
    if (rating === 2) {
      interval = Math.max(1, interval * 1.2);
      ease = Math.max(1.3, ease - 0.15);
    } else if (rating === 3) {
      interval = Math.max(1, interval < 1 ? 1 : interval * ease);
    } else {
      interval = Math.max(2, (interval < 1 ? 1 : interval) * ease * 1.3);
      ease += 0.15;
    }
    reps += 1;
    // small fuzz so cards learnt together don't all come back on the same day
    interval = interval * (0.95 + Math.random() * 0.1);
    dueIn = interval * DAY;
  }

  // Exam cap: never schedule past halfway to the exam, so there is time for another look.
  if (examDate && rating > 1) {
    const exam = Date.parse(`${examDate}T08:00:00`);
    if (!Number.isNaN(exam) && exam > nowMs) {
      const daysLeft = (exam - nowMs) / DAY;
      const cap = Math.max(1 / 24, daysLeft / 2);
      if (dueIn > cap * DAY) {
        dueIn = cap * DAY;
        interval = Math.min(interval, cap);
      }
    }
  }

  return {
    ease: Math.round(ease * 100) / 100,
    interval_days: Math.round(interval * 100) / 100,
    reps,
    lapses,
    due_at: Math.round(nowMs + dueIn),
    last_reviewed_at: nowMs,
  };
}

/** Friendly label for the next-review time, shown on the rating buttons. */
export function strength(intervalDays: number, reps: number): 'new' | 'learning' | 'growing' | 'strong' {
  if (reps === 0) return intervalDays > 0 ? 'learning' : 'new';
  if (intervalDays < 1) return 'learning';
  if (intervalDays < 7) return 'growing';
  return 'strong';
}

/** Human-friendly "in 10 min / 3 d" preview of when a card would come back. */
export function previewLabel(card: CardState, rating: Rating, examDate?: string | null): string {
  const now = Date.now();
  const s = schedule(card, rating, now, examDate);
  const ms = s.due_at - now;
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} h`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)} d`;
  return `${Math.round(d / 30)} mo`;
}
