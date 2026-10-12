// Spaced repetition with FSRS-5 (the memory model behind modern Anki).
// Each card has a memory "stability" (days until recall drops to 90%) and a "difficulty".
// A card comes back just before you would forget it, so you spend the least possible
// time reviewing for the most remembering. Near an exam, cards that would fade before
// the paper are brought forward; cards that will last until the paper are left alone.
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface CardState {
  ease: number; // kept for older data; FSRS uses difficulty instead
  interval_days: number;
  reps: number;
  lapses: number;
  stability?: number | null;
  difficulty?: number | null;
  last_reviewed_at?: number | null;
}

export interface ScheduleOptions {
  /** Share of cards you want to still remember when they come back (0.8–0.97). */
  retention?: number;
  /** Add a little randomness so cards learnt together don't all return together. */
  fuzz?: boolean;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// FSRS-5 default weights (trained on millions of Anki reviews).
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Chance (0–1) of remembering a card `days` after the last review. */
export function retrievability(days: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, days)) / stability, DECAY);
}

/** Days until recall falls to `retention`. */
export function intervalFor(stability: number, retention = 0.9): number {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

const initStability = (g: Rating) => W[g - 1];
const initDifficulty = (g: Rating) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d: number, g: Rating) {
  const delta = -W[6] * (g - 3);
  const dPrime = d + (delta * (10 - d)) / 9;
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * dPrime, 1, 10);
}

function recallStability(d: number, s: number, r: number, g: Rating) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetStability(d: number, s: number, r: number) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
}

const shortTermStability = (s: number, g: Rating) => s * Math.exp(W[17] * (g - 3 + W[18]));

/** Cards saved by the older SM-2 scheduler get a memory state that matches their history. */
function fromLegacy(card: CardState): { s: number; d: number } | null {
  if (!card.reps || card.interval_days <= 0) return null;
  return { s: Math.max(0.5, card.interval_days), d: clamp(5 + (2.5 - (card.ease || 2.5)) * 3.3, 1, 10) };
}

/** Retention target: aim higher when the exam is close, so nothing slips on the day. */
export function retentionFor(examDate: string | null | undefined, nowMs: number, base = 0.9): number {
  const exam = examTime(examDate);
  if (!exam || exam <= nowMs) return base;
  const days = (exam - nowMs) / DAY;
  if (days <= 2) return Math.max(base, 0.95);
  if (days <= 7) return Math.max(base, 0.92);
  return base;
}

function examTime(examDate: string | null | undefined): number | null {
  if (!examDate) return null;
  const t = Date.parse(`${examDate}T08:00:00`);
  return Number.isNaN(t) ? null : t;
}

export function schedule(card: CardState, rating: Rating, nowMs: number, examDate?: string | null, opts: ScheduleOptions = {}) {
  const retention = clamp(opts.retention ?? retentionFor(examDate, nowMs), 0.8, 0.97);
  const fuzz = opts.fuzz ?? true;
  let { reps, lapses } = card;
  const legacy = card.stability ? null : fromLegacy(card);
  const hasMemory = !!card.stability || !!legacy;
  let s = card.stability || legacy?.s || 0;
  let d = card.difficulty || legacy?.d || 0;
  const last = card.last_reviewed_at || 0;
  const elapsedDays = last ? Math.max(0, (nowMs - last) / DAY) : 0;

  if (!hasMemory) {
    s = initStability(rating);
    d = initDifficulty(rating);
  } else if (elapsedDays < 1 && last) {
    // Seen again on the same day (learning or relearning)
    s = shortTermStability(s, rating);
    d = nextDifficulty(d, rating);
  } else {
    const r = retrievability(elapsedDays, s);
    s = rating === 1 ? forgetStability(d, s, r) : recallStability(d, s, r, rating);
    d = nextDifficulty(d, rating);
  }
  s = clamp(s, 0.05, 36500);

  let dueIn: number;
  let interval: number;
  if (rating === 1) {
    if (reps > 0) lapses += 1;
    reps = 0;
    interval = 0;
    dueIn = 1 * MIN; // straight back in this session
  } else if (rating === 2 && reps === 0) {
    interval = 0;
    dueIn = 10 * MIN; // still learning: one more look soon
    reps = 0;
  } else {
    reps += 1;
    interval = Math.max(1, intervalFor(s, retention));
    if (fuzz && interval > 2) interval *= 0.95 + Math.random() * 0.1;
    interval = Math.min(interval, 365 * 3);
    dueIn = interval * DAY;
  }

  // Exam check: if the memory would fade below target before the paper, bring the card
  // forward so it is reviewed shortly before. If it will hold until then, leave it alone.
  const exam = examTime(examDate);
  if (exam && exam > nowMs && rating > 1) {
    const daysLeft = (exam - nowMs) / DAY;
    if (dueIn > exam - nowMs && retrievability(daysLeft, s) < retention) {
      const target = daysLeft > 2 ? daysLeft * 0.75 : Math.max(1 / 24, daysLeft - 0.5);
      dueIn = Math.max(HOUR, Math.min(dueIn, target * DAY));
      interval = Math.min(interval, dueIn / DAY);
    }
  }

  return {
    ease: card.ease,
    stability: Math.round(s * 1000) / 1000,
    difficulty: Math.round(d * 1000) / 1000,
    interval_days: Math.round(interval * 100) / 100,
    reps,
    lapses,
    due_at: Math.round(nowMs + dueIn),
    last_reviewed_at: nowMs,
  };
}

/** Friendly memory strength for a card. */
export function strength(intervalDays: number, reps: number): 'new' | 'learning' | 'growing' | 'strong' {
  if (reps === 0) return intervalDays > 0 ? 'learning' : 'new';
  if (intervalDays < 1) return 'learning';
  if (intervalDays < 7) return 'growing';
  return 'strong';
}

/** Human-friendly "in 10 min / 3 d" preview of when a card would come back. */
export function previewLabel(card: CardState, rating: Rating, examDate?: string | null): string {
  const now = Date.now();
  const s = schedule(card, rating, now, examDate, { fuzz: false });
  const ms = s.due_at - now;
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)} d`;
  if (d < 365) return `${Math.round(d / 30)} mo`;
  return `${Math.round(d / 365)} y`;
}

/** Chance of remembering this card right now (1 for cards never studied). */
export function recallNow(card: CardState, nowMs = Date.now()): number {
  const legacy = card.stability ? null : fromLegacy(card);
  const s = card.stability || legacy?.s;
  if (!s || !card.last_reviewed_at) return card.reps ? 0.5 : 1;
  return retrievability((nowMs - card.last_reviewed_at) / DAY, s);
}

/** Rough seconds a review takes, used to estimate session length. */
export const SECONDS_PER_REVIEW = 12;
