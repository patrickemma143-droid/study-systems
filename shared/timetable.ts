// Builds a personal study timetable from the student's free time, exam dates,
// unread lessons and the flashcards that will fall due. Pure function: easy to test.

export interface Window {
  start: string; // "HH:MM"
  end: string;
}

export interface StudyPrefs {
  /** Free time per weekday, 0 = Sunday … 6 = Saturday */
  windows: Record<string, Window[]>;
  sessionMinutes: number;
  bedtime: string;
  setup: boolean;
}

export const DEFAULT_PREFS: StudyPrefs = {
  windows: {
    '0': [{ start: '15:00', end: '17:00' }],
    '1': [{ start: '19:00', end: '21:00' }],
    '2': [{ start: '19:00', end: '21:00' }],
    '3': [{ start: '19:00', end: '21:00' }],
    '4': [{ start: '19:00', end: '21:00' }],
    '5': [{ start: '19:00', end: '20:00' }],
    '6': [
      { start: '10:00', end: '12:00' },
      { start: '15:00', end: '17:00' },
    ],
  },
  sessionMinutes: 45,
  bedtime: '23:00',
  setup: false,
};

export type SessionKind = 'review' | 'learn' | 'quiz' | 'recall' | 'cram';

export interface PlanPack {
  id: number;
  title: string;
  examDate: string | null;
  lessons: { index: number; title: string; readMinutes: number; importance: number; done: boolean }[];
}

export interface PlannedSession {
  packId: number | null;
  day: string;
  start: string;
  minutes: number;
  kind: SessionKind;
  title: string;
  detail: { chunks?: number[]; cards?: number };
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Clean up whatever the browser sent: valid times only, sensible lengths. */
export function sanitizePrefs(raw: any): StudyPrefs {
  const p: StudyPrefs = { ...DEFAULT_PREFS, windows: {} };
  const okTime = (t: unknown) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  for (let d = 0; d < 7; d++) {
    const list = Array.isArray(raw?.windows?.[d]) ? raw.windows[d] : raw?.windows ? [] : DEFAULT_PREFS.windows[d];
    p.windows[d] = list.filter((w: any) => okTime(w?.start) && okTime(w?.end) && toMin(w.end) - toMin(w.start) >= 15).slice(0, 4).map((w: any) => ({ start: w.start, end: w.end }));
  }
  p.sessionMinutes = [25, 30, 45, 60, 90].includes(Number(raw?.sessionMinutes)) ? Number(raw.sessionMinutes) : DEFAULT_PREFS.sessionMinutes;
  p.bedtime = okTime(raw?.bedtime) ? raw.bedtime : DEFAULT_PREFS.bedtime;
  p.setup = !!raw?.setup;
  return p;
}

/**
 * @param today local date "YYYY-MM-DD"; @param nowMinutes minutes past local midnight now
 * @param dueByDay flashcards due per local day (overdue cards count on `today`)
 */
export function buildTimetable(prefs: StudyPrefs, packs: PlanPack[], today: string, nowMinutes: number, dueByDay: Record<string, number>, days = 7): PlannedSession[] {
  const out: PlannedSession[] = [];
  const left = new Map(packs.map((p) => [p.id, p.lessons.filter((l) => !l.done)]));
  const practiceTurn = new Map<number, number>();
  const crammed = new Set<number>();
  let carryCards = 0;

  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    // Slots: back-to-back sessions with a 5-minute break between them
    const slots: { t: number; len: number }[] = [];
    for (const w of prefs.windows[weekday(day)] || []) {
      let t = toMin(w.start);
      const end = toMin(w.end);
      while (end - t >= 15) {
        const len = Math.min(prefs.sessionMinutes, end - t);
        if (i > 0 || t >= nowMinutes + 10) slots.push({ t, len });
        t += len + 5;
      }
    }
    const due = (dueByDay[day] || 0) + carryCards;
    if (!slots.length) {
      carryCards = due;
      continue;
    }
    carryCards = 0;
    let slotIdx = 0;
    if (due > 0) {
      const mins = Math.min(slots[0].len, Math.max(10, Math.ceil((due * 12) / 60 / 5) * 5));
      out.push({ packId: null, day, start: toHHMM(slots[0].t), minutes: mins, kind: 'review', title: `Review ${due} flashcard${due === 1 ? '' : 's'}`, detail: { cards: due } });
      slotIdx = 1;
    }
    const usedToday = new Map<number, number>();
    for (; slotIdx < slots.length; slotIdx++) {
      const candidates = packs
        .map((p) => {
          const toExam = p.examDate ? daysBetween(day, p.examDate) : null;
          if (toExam !== null && toExam < 1) return null; // exam today or passed
          const remaining = left.get(p.id)!;
          const urgency = toExam === null ? 1 / 21 : 1 / toExam;
          const work = remaining.length ? 2 : 1;
          const repeat = Math.pow(0.6, usedToday.get(p.id) || 0);
          return { p, toExam, score: urgency * work * repeat };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => b.score - a.score);
      const pick = candidates[0];
      if (!pick) break;
      const { p, toExam } = pick;
      usedToday.set(p.id, (usedToday.get(p.id) || 0) + 1);
      const start = toHHMM(slots[slotIdx].t);
      const minutes = slots[slotIdx].len;
      const remaining = left.get(p.id)!;

      if (toExam === 1 && !crammed.has(p.id)) {
        crammed.add(p.id);
        out.push({ packId: p.id, day, start, minutes, kind: 'cram', title: `Cram for tomorrow: ${p.title}`, detail: {} });
        continue;
      }
      if (remaining.length) {
        // Close to the exam, learn the most examinable lessons first; otherwise go in order.
        const ordered = toExam !== null && toExam <= 3 ? [...remaining].sort((a, b) => b.importance - a.importance) : remaining;
        const take: typeof remaining = [];
        let used = 0;
        for (const l of ordered) {
          const cost = Math.max(5, l.readMinutes) + 6;
          if (take.length && used + cost > minutes) break;
          take.push(l);
          used += cost;
        }
        left.set(p.id, remaining.filter((l) => !take.includes(l)));
        const nums = take.map((l) => l.index + 1).sort((a, b) => a - b);
        const label = nums.length === 1 ? `lesson ${nums[0]}` : `lessons ${nums.join(', ')}`;
        out.push({ packId: p.id, day, start, minutes, kind: 'learn', title: `Learn ${label}: ${p.title}`, detail: { chunks: take.map((l) => l.index) } });
        continue;
      }
      const turn = practiceTurn.get(p.id) || 0;
      practiceTurn.set(p.id, turn + 1);
      const kind: SessionKind = turn % 2 === 0 ? 'quiz' : 'recall';
      out.push({ packId: p.id, day, start, minutes, kind, title: `${kind === 'quiz' ? 'Practice quiz' : 'Blurt and check'}: ${p.title}`, detail: {} });
    }
  }
  return out;
}

/** Where a session's Start button goes in the app. */
export function sessionLink(s: { kind: string; packId: number | null; detail?: { chunks?: number[] } | null }): string {
  if (!s.packId) return '/review';
  const base = `/pack/${s.packId}`;
  if (s.kind === 'learn') return `${base}/learn/${s.detail?.chunks?.[0] ?? 0}`;
  if (s.kind === 'quiz') return `${base}/quiz`;
  if (s.kind === 'recall') return `${base}/blurt`;
  if (s.kind === 'cram') return `${base}/cram`;
  return `${base}/cards`;
}
