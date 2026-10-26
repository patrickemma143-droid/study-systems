// The whiteboard tutor's lesson format, shared by the server (which checks what the AI wrote)
// and the browser (which draws it). Board text may hold inline maths between $…$ (KaTeX).

export type BoardItem =
  | { t: 'heading'; id?: string; text: string }
  | { t: 'write'; id?: string; text: string; tone?: 'normal' | 'key' | 'muted' }
  | { t: 'math'; id?: string; tex: string }
  | { t: 'bullets'; id?: string; items: string[] }
  | { t: 'box'; id?: string; text: string; label?: string }
  | { t: 'flow'; id?: string; items: string[] }
  | { t: 'cycle'; id?: string; items: string[] }
  | { t: 'table'; id?: string; head: string[]; rows: string[][] }
  | { t: 'graph'; id?: string; fn: string; xmin: number; xmax: number; label?: string }
  | { t: 'circle'; target: string }
  | { t: 'underline'; target: string }
  | { t: 'arrow'; from: string; to: string; label?: string }
  | { t: 'clear' };

export interface TutorStep {
  /** what the tutor says out loud (plain words, no symbols) */
  say: string;
  board: BoardItem[];
}

export interface PracticeItem {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface TutorLesson {
  title: string;
  mode: TutorMode;
  steps: TutorStep[];
  summary: string[];
  practice: PracticeItem[];
  /** homework: a similar problem to try alone */
  tryNext?: { q: string; answer: string } | null;
}

export type TutorMode = 'topic' | 'lesson' | 'exam' | 'homework' | 'text';

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strs = (v: unknown, n: number, max = 160) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const id = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,24}$/.test(v) ? v : undefined);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, v)) : d);

/** Keep only board items the board can draw, with sensible sizes. */
export function cleanBoardItem(raw: any): BoardItem | null {
  if (!raw || typeof raw !== 'object') return null;
  switch (raw.t) {
    case 'heading':
      return str(raw.text, 120) ? { t: 'heading', id: id(raw.id), text: str(raw.text, 120) } : null;
    case 'write': {
      const text = str(raw.text, 260);
      const tone = raw.tone === 'key' || raw.tone === 'muted' ? raw.tone : 'normal';
      return text ? { t: 'write', id: id(raw.id), text, tone } : null;
    }
    case 'math':
      return str(raw.tex, 300) ? { t: 'math', id: id(raw.id), tex: str(raw.tex, 300) } : null;
    case 'bullets': {
      const items = strs(raw.items, 6, 180);
      return items.length ? { t: 'bullets', id: id(raw.id), items } : null;
    }
    case 'box':
      return str(raw.text, 300) ? { t: 'box', id: id(raw.id), text: str(raw.text, 300), label: str(raw.label, 40) || undefined } : null;
    case 'flow':
    case 'cycle': {
      const items = strs(raw.items, 6, 60);
      return items.length >= 2 ? { t: raw.t, id: id(raw.id), items } : null;
    }
    case 'table': {
      const head = strs(raw.head, 4, 50);
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).map((r: unknown) => strs(r, head.length || 4, 90)).filter((r: string[]) => r.length).slice(0, 6);
      return head.length && rows.length ? { t: 'table', id: id(raw.id), head, rows } : null;
    }
    case 'graph': {
      const fn = str(raw.fn, 80);
      if (!fn || !/^[0-9x+\-*/^().,\s a-z]+$/i.test(fn)) return null;
      let xmin = num(raw.xmin, -5);
      let xmax = num(raw.xmax, 5);
      if (xmax <= xmin) [xmin, xmax] = [-5, 5];
      return { t: 'graph', id: id(raw.id), fn, xmin, xmax, label: str(raw.label, 60) || undefined };
    }
    case 'circle':
    case 'underline':
      return id(raw.target) ? { t: raw.t, target: id(raw.target)! } : null;
    case 'arrow':
      return id(raw.from) && id(raw.to) ? { t: 'arrow', from: id(raw.from)!, to: id(raw.to)!, label: str(raw.label, 40) || undefined } : null;
    case 'clear':
      return { t: 'clear' };
    default:
      return null;
  }
}

export function cleanSteps(raw: unknown, max = 14): TutorStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => ({ say: str(s?.say, 700), board: (Array.isArray(s?.board) ? s.board : []).map(cleanBoardItem).filter(Boolean).slice(0, 8) as BoardItem[] }))
    .filter((s) => s.say)
    .slice(0, max);
}

export function cleanPractice(raw: unknown): PracticeItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => {
      const options = strs(p?.options, 4, 160);
      const answer = Number(p?.answer);
      return { q: str(p?.q, 400), options, answer, explain: str(p?.explain, 500) };
    })
    .filter((p) => p.q && p.options.length >= 2 && Number.isInteger(p.answer) && p.answer >= 0 && p.answer < p.options.length)
    .slice(0, 6);
}

export function cleanLesson(raw: any, mode: TutorMode): TutorLesson {
  const steps = cleanSteps(raw?.steps);
  if (steps.length < 2) throw new Error('The lesson came back incomplete.');
  const tq = str(raw?.tryNext?.q, 400);
  return {
    title: str(raw?.title, 120) || 'Lesson',
    mode,
    steps,
    summary: strs(raw?.summary, 5, 200),
    practice: cleanPractice(raw?.practice),
    tryNext: tq ? { q: tq, answer: str(raw?.tryNext?.answer, 600) } : null,
  };
}

/** Everything written on the board, as plain text (for saving a lesson as a study pack). */
export function boardText(item: BoardItem): string {
  switch (item.t) {
    case 'heading':
    case 'write':
    case 'box':
      return item.text;
    case 'math':
      return item.tex;
    case 'bullets':
    case 'flow':
    case 'cycle':
      return item.items.join(item.t === 'bullets' ? '; ' : ' → ');
    case 'table':
      return [item.head.join(' | '), ...item.rows.map((r) => r.join(' | '))].join('\n');
    case 'graph':
      return item.label || `y = ${item.fn}`;
    default:
      return '';
  }
}
