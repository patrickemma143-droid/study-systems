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
  | { t: 'sketch'; id?: string; h: number; shapes: Shape[]; caption?: string }
  | { t: 'pie'; id?: string; items: { label: string; value: number }[]; caption?: string }
  | { t: 'bars'; id?: string; items: { label: string; value: number }[]; caption?: string; unit?: string }
  | { t: 'circle'; target: string }
  | { t: 'underline'; target: string }
  | { t: 'arrow'; from: string; to: string; label?: string }
  | { t: 'clear' };

/** Ink colours on the board. */
export type Ink = 'ink' | 'blue' | 'red' | 'green' | 'orange' | 'purple';
/**
 * A hand-drawn diagram in a box 100 units wide and h units high (force diagrams, circuits, a cell,
 * apparatus…). Points are [x, y] pairs flattened into p.
 */
export type Shape =
  | { k: 'line' | 'arrow' | 'double'; p: [number, number, number, number]; c?: Ink; label?: string; dash?: boolean }
  | { k: 'ground'; p: [number, number, number]; c?: Ink }
  | { k: 'rect'; p: [number, number, number, number]; c?: Ink; fill?: boolean; label?: string }
  | { k: 'circle'; p: [number, number, number]; c?: Ink; fill?: boolean; label?: string }
  | { k: 'poly'; p: number[]; c?: Ink; closed?: boolean; fill?: boolean }
  | { k: 'curve'; p: number[]; c?: Ink }
  | { k: 'text'; p: [number, number]; text: string; c?: Ink; size?: number };

/** A question in the middle of the lesson: the tutor waits for the student's answer. */
export interface Check {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface TutorStep {
  /** what the tutor says out loud (plain words, no symbols) */
  say: string;
  board: BoardItem[];
  /** a quick check of understanding after this step */
  check?: Check;
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
    case 'sketch': {
      const h = Math.max(20, Math.min(100, Math.round(num(raw.h, 60))));
      const shapes = (Array.isArray(raw.shapes) ? raw.shapes : []).map((x: unknown) => cleanShape(x, h)).filter(Boolean).slice(0, 40) as Shape[];
      return shapes.length ? { t: 'sketch', id: id(raw.id), h, shapes, caption: str(raw.caption, 80) || undefined } : null;
    }
    case 'pie':
    case 'bars': {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((x: any) => ({ label: str(x?.label, 30), value: Number(x?.value) }))
        .filter((x: { label: string; value: number }) => x.label && Number.isFinite(x.value) && x.value >= 0)
        .slice(0, 8);
      if (items.length < 2) return null;
      return raw.t === 'pie' ? { t: 'pie', id: id(raw.id), items, caption: str(raw.caption, 80) || undefined } : { t: 'bars', id: id(raw.id), items, caption: str(raw.caption, 80) || undefined, unit: str(raw.unit, 12) || undefined };
    }
    case 'clear':
      return { t: 'clear' };
    default:
      return null;
  }
}

const INKS: Ink[] = ['ink', 'blue', 'red', 'green', 'orange', 'purple'];
function cleanShape(raw: any, h: number): Shape | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.p)) return null;
  const c: Ink | undefined = INKS.includes(raw.c) ? raw.c : undefined;
  const nums = raw.p.map(Number).filter((n: number) => Number.isFinite(n)).map((n: number, i: number) => Math.max(-5, Math.min(i % 2 ? h + 5 : 105, n)));
  const label = str(raw.label, 24) || undefined;
  switch (raw.k) {
    case 'line':
    case 'arrow':
    case 'double':
      return nums.length >= 4 ? { k: raw.k, p: nums.slice(0, 4) as [number, number, number, number], c, label, dash: !!raw.dash } : null;
    case 'ground':
      return nums.length >= 3 ? { k: 'ground', p: nums.slice(0, 3) as [number, number, number], c } : null;
    case 'rect':
      return nums.length >= 4 ? { k: 'rect', p: nums.slice(0, 4) as [number, number, number, number], c, fill: !!raw.fill, label } : null;
    case 'circle':
      return nums.length >= 3 ? { k: 'circle', p: nums.slice(0, 3) as [number, number, number], c, fill: !!raw.fill, label } : null;
    case 'poly':
      return nums.length >= 4 ? { k: 'poly', p: nums.slice(0, 40), c, closed: !!raw.closed, fill: !!raw.fill } : null;
    case 'curve':
      return nums.length >= 6 ? { k: 'curve', p: nums.slice(0, 40), c } : null;
    case 'text': {
      const text = str(raw.text, 30);
      return nums.length >= 2 && text ? { k: 'text', p: nums.slice(0, 2) as [number, number], text, c, size: Math.max(3, Math.min(9, num(raw.size, 5))) } : null;
    }
    default:
      return null;
  }
}

export function cleanCheck(raw: any): Check | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const options = strs(raw.options, 4, 140);
  const answer = Number(raw.answer);
  const q = str(raw.q, 300);
  if (!q || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return undefined;
  return { q, options, answer, explain: str(raw.explain, 400) };
}

export function cleanSteps(raw: unknown, max = 14): TutorStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => {
      const step: TutorStep = { say: str(s?.say, 700), board: (Array.isArray(s?.board) ? s.board : []).map(cleanBoardItem).filter(Boolean).slice(0, 8) as BoardItem[] };
      const check = cleanCheck(s?.check);
      if (check) step.check = check;
      return step;
    })
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
    case 'sketch':
      return [item.caption, ...item.shapes.map((x) => ('label' in x && x.label) || (x.k === 'text' ? x.text : '')).filter(Boolean)].filter(Boolean).join(', ');
    case 'pie':
    case 'bars':
      return [item.caption, item.items.map((x) => `${x.label}: ${x.value}${item.t === 'bars' && item.unit ? item.unit : ''}`).join(', ')].filter(Boolean).join(' — ');
    default:
      return '';
  }
}
