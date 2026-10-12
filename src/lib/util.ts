/** Today's date in the student's own time zone, as YYYY-MM-DD. */
export function today(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from today until a YYYY-MM-DD date (0 = today, negative = past). */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  const now = new Date(`${today()}T00:00:00`);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function examLabel(date: string | null | undefined): string | null {
  const d = daysUntil(date);
  if (d === null) return null;
  if (d < 0) return 'Exam passed';
  if (d === 0) return 'Exam today';
  if (d === 1) return 'Exam tomorrow';
  return `Exam in ${d} days`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable (private mode) — ignore */
  }
}
