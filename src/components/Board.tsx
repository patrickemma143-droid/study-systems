// The whiteboard: a wide canvas the tutor writes and draws on, section by section in columns.
// The view glides to wherever the tutor is writing (a pencil moves along), the student can drag
// and zoom, and at the end the whole board can be seen at once. Quick-check questions are written
// on the board and answered by tapping them.
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Pencil, Check as Tick, X as Cross } from 'lucide-react';
import type { BoardItem, Ink, Shape } from '../../shared/tutor';
import { plot } from '../lib/tutor/graph';
import { inkPath, type InkStroke } from '../../shared/ink';

/** A question written on the board (from a step's check or the end-of-lesson practice). */
export interface QuizEl {
  t: 'quiz';
  qid: string;
  label: string;
  q: string;
  options: string[];
  answer: number;
  chosen: number | null;
  explain?: string;
}
export type BoardEl = BoardItem | QuizEl;

export interface ShownItem {
  key: string;
  item: BoardEl;
  /** seconds for its "being written" animation; 0 = already there */
  draw: number;
}

const INK: Record<Ink, string> = { ink: '#1e2240', blue: '#3d5bd9', red: '#d6336c', green: '#0f9361', orange: '#e8890c', purple: '#7b5cff' };
const PALETTE = ['#3d5bd9', '#d6336c', '#e8890c', '#0f9361', '#7b5cff', '#0f8b8d', '#b5651d', '#5d6080'];
const MARKERS = ['#ffe45c', '#acdcff', '#b8f09e', '#ffbcdc'];
const COL = 430; // width of one column of the board, in board pixels

function tex(src: string, display = false) {
  try {
    return katex.renderToString(src, { throwOnError: false, displayMode: display, output: 'html', strict: 'ignore' });
  } catch {
    return src;
  }
}

/** Text with inline maths between $…$. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('$') && p.endsWith('$') && p.length > 2 ? <span key={i} className="bm" dangerouslySetInnerHTML={{ __html: tex(p.slice(1, -1)) }} /> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

function wrap(text: string, max = 14): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Arrowheads in every ink colour, plus a hatch fill. */
function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      {Object.entries(INK).map(([name, col]) => (
        <marker key={name} id={`${uid}-h-${name}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={col} />
        </marker>
      ))}
      {Object.entries(INK).map(([name, col]) => (
        <pattern key={`p${name}`} id={`${uid}-hatch-${name}`} width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="2.4" stroke={col} strokeWidth="0.45" opacity="0.55" />
        </pattern>
      ))}
      <filter id={`${uid}-rough`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" />
      </filter>
    </defs>
  );
}

/** A smooth path through points (Catmull-Rom → Bézier). */
function smooth(p: number[]) {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

let uidN = 0;
function Sketch({ h, shapes, caption, draw }: { h: number; shapes: Shape[]; caption?: string; draw: number }) {
  const [uid] = useState(() => `sk${++uidN}`);
  const n = shapes.length || 1;
  const per = draw ? draw / n : 0;
  const anim = (i: number): CSSProperties | undefined => (draw ? ({ animationDelay: `${i * per}s`, animationDuration: `${Math.max(0.35, per * 1.4)}s` } as CSSProperties) : undefined);
  return (
    <figure className="b-sketch">
      <svg viewBox={`-2 -2 104 ${h + 4}`} role="img" aria-label={caption || 'Diagram'}>
        <Defs uid={uid} />
        <g filter={`url(#${uid}-rough)`}>
          {shapes.map((s, i) => {
            const col = INK[s.c || 'ink'];
            const cls = draw ? 'sk-draw' : '';
            switch (s.k) {
              case 'line':
              case 'arrow':
              case 'double': {
                const [x1, y1, x2, y2] = s.p;
                return (
                  <g key={i}>
                    <path className={cls} style={anim(i)} d={`M${x1},${y1} L${x2},${y2}`} pathLength={1} stroke={col} strokeWidth={0.7} fill="none" strokeDasharray={s.dash ? '2 1.4' : undefined} markerEnd={s.k !== 'line' ? `url(#${uid}-h-${s.c || 'ink'})` : undefined} markerStart={s.k === 'double' ? `url(#${uid}-h-${s.c || 'ink'})` : undefined} />
                    {s.label && (
                      <text className={`sk-label ${draw ? 'sk-fade' : ''}`} style={anim(i)} x={x2 + (x2 >= x1 ? 1.5 : -1.5)} y={y2 - 1.6} textAnchor={x2 >= x1 ? 'start' : 'end'} fill={col}>
                        {s.label}
                      </text>
                    )}
                  </g>
                );
              }
              case 'ground': {
                const [x1, y, x2] = s.p;
                const ticks: number[] = [];
                for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x += 3) ticks.push(x);
                return (
                  <g key={i} stroke={col} fill="none">
                    <path className={cls} style={anim(i)} d={`M${x1},${y} L${x2},${y}`} pathLength={1} strokeWidth={0.7} />
                    {ticks.map((x) => (
                      <line key={x} x1={x} y1={y + 0.4} x2={x - 2.2} y2={y + 2.6} strokeWidth={0.35} className={draw ? 'sk-fade' : ''} style={anim(i)} />
                    ))}
                  </g>
                );
              }
              case 'rect': {
                const [x, y, w, hh] = s.p;
                return (
                  <g key={i}>
                    {s.fill && <rect x={x} y={y} width={w} height={hh} fill={`url(#${uid}-hatch-${s.c || 'ink'})`} className={draw ? 'sk-fade' : ''} style={anim(i)} />}
                    <path className={cls} style={anim(i)} d={`M${x},${y} h${w} v${hh} h${-w} Z`} pathLength={1} stroke={col} strokeWidth={0.7} fill="none" />
                    {s.label && (
                      <text className={`sk-label ${draw ? 'sk-fade' : ''}`} style={anim(i)} x={x + w / 2} y={y + hh / 2 + 1.5} textAnchor="middle" fill={col}>
                        {s.label}
                      </text>
                    )}
                  </g>
                );
              }
              case 'circle': {
                const [cx, cy, r] = s.p;
                return (
                  <g key={i}>
                    {s.fill && <circle cx={cx} cy={cy} r={r} fill={`url(#${uid}-hatch-${s.c || 'ink'})`} className={draw ? 'sk-fade' : ''} style={anim(i)} />}
                    <circle className={cls} style={anim(i)} cx={cx} cy={cy} r={r} pathLength={1} stroke={col} strokeWidth={0.7} fill="none" />
                    {s.label && (
                      <text className={`sk-label ${draw ? 'sk-fade' : ''}`} style={anim(i)} x={cx} y={cy + 1.5} textAnchor="middle" fill={col}>
                        {s.label}
                      </text>
                    )}
                  </g>
                );
              }
              case 'poly': {
                const d = `M${s.p[0]},${s.p[1]} ${s.p.slice(2).reduce((acc, v, j) => acc + (j % 2 ? `,${v} ` : `L${v}`), '')}${s.closed ? 'Z' : ''}`;
                return (
                  <g key={i}>
                    {s.fill && s.closed && <path d={d} fill={`url(#${uid}-hatch-${s.c || 'ink'})`} className={draw ? 'sk-fade' : ''} style={anim(i)} />}
                    <path className={cls} style={anim(i)} d={d} pathLength={1} stroke={col} strokeWidth={0.7} fill="none" strokeLinejoin="round" />
                  </g>
                );
              }
              case 'curve':
                return <path key={i} className={cls} style={anim(i)} d={smooth(s.p)} pathLength={1} stroke={col} strokeWidth={0.8} fill="none" strokeLinecap="round" />;
              case 'text':
                return (
                  <text key={i} className={`sk-text ${draw ? 'sk-fade' : ''}`} style={{ ...anim(i), fontSize: s.size || 5 }} x={s.p[0]} y={s.p[1]} fill={col} textAnchor="middle">
                    {s.text}
                  </text>
                );
              default:
                return null;
            }
          })}
        </g>
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Pie({ items, caption, draw }: { items: { label: string; value: number }[]; caption?: string; draw: number }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const R = 34;
  const C = 50;
  let a0 = -Math.PI / 2;
  const per = draw ? draw / items.length : 0;
  return (
    <figure className="b-pie">
      <svg viewBox="-46 -4 252 108" role="img" aria-label={`Pie chart: ${items.map((x) => `${x.label} ${x.value}`).join(', ')}`}>
        {items.map((it, i) => {
          const a1 = a0 + (it.value / total) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const x0 = C + R * Math.cos(a0);
          const y0 = C + R * Math.sin(a0);
          const x1 = C + R * Math.cos(a1);
          const y1 = C + R * Math.sin(a1);
          const mid = (a0 + a1) / 2;
          const lx = C + (R + 6) * Math.cos(mid);
          const ly = C + (R + 6) * Math.sin(mid);
          const col = PALETTE[i % PALETTE.length];
          const st = draw ? ({ animationDelay: `${i * per}s`, animationDuration: `${Math.max(0.4, per)}s` } as CSSProperties) : undefined;
          a0 = a1;
          return (
            <g key={i}>
              <path className={draw ? 'sk-fade' : ''} style={st} d={`M${C},${C} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`} fill={col} fillOpacity={0.14} stroke={col} strokeWidth={1.1} strokeLinejoin="round" />
              <text className={`pie-label ${draw ? 'sk-fade' : ''}`} style={st} x={lx} y={ly} textAnchor={Math.cos(mid) >= 0 ? 'start' : 'end'} fill={col}>
                {it.label} ({Math.round((it.value / total) * 100)}%)
              </text>
            </g>
          );
        })}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Bars({ items, caption, unit, draw }: { items: { label: string; value: number }[]; caption?: string; unit?: string; draw: number }) {
  const max = Math.max(...items.map((x) => x.value), 1);
  const W = 160;
  const H = 96;
  const bw = (W - 20) / items.length;
  const per = draw ? draw / items.length : 0;
  return (
    <figure className="b-bars">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart: ${items.map((x) => `${x.label} ${x.value}${unit || ''}`).join(', ')}`}>
        <line x1={12} y1={H - 14} x2={W - 4} y2={H - 14} stroke="#1e2240" strokeWidth={0.9} />
        <line x1={12} y1={6} x2={12} y2={H - 14} stroke="#1e2240" strokeWidth={0.9} />
        {items.map((it, i) => {
          const h = ((H - 26) * it.value) / max;
          const x = 16 + i * bw;
          const col = PALETTE[i % PALETTE.length];
          const st = draw ? ({ animationDelay: `${i * per}s`, animationDuration: `${Math.max(0.4, per)}s` } as CSSProperties) : undefined;
          return (
            <g key={i}>
              <rect className={draw ? 'bar-grow' : ''} style={{ ...st, transformOrigin: `0 ${H - 14}px` }} x={x} y={H - 14 - h} width={bw * 0.66} height={h} fill={col} fillOpacity={0.2} stroke={col} strokeWidth={0.9} />
              <text className="bar-val" x={x + bw * 0.33} y={H - 16 - h} textAnchor="middle" fill={col}>
                {it.value}
                {unit || ''}
              </text>
              <text className="bar-label" x={x + bw * 0.33} y={H - 4} textAnchor="middle">
                {it.label}
              </text>
            </g>
          );
        })}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Cycle({ items }: { items: string[] }) {
  const n = items.length;
  const R = 78;
  const C = 110;
  const pos = items.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [C + R * Math.cos(a), C + R * Math.sin(a)] as const;
  });
  return (
    <svg className="b-cycle" viewBox="0 0 220 220" role="img" aria-label={`Cycle: ${items.join(', then ')}, and back again`}>
      <defs>
        <marker id="bh" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {pos.map((p, i) => {
        const a1 = -Math.PI / 2 + ((i + 0.28) * 2 * Math.PI) / n;
        const a2 = -Math.PI / 2 + ((i + 0.72) * 2 * Math.PI) / n;
        return <path key={`a${i}`} className="b-stroke" d={`M${C + R * Math.cos(a1)},${C + R * Math.sin(a1)} A${R},${R} 0 0 1 ${C + R * Math.cos(a2)},${C + R * Math.sin(a2)}`} markerEnd="url(#bh)" />;
      })}
      {pos.map(([x, y], i) => {
        const lines = wrap(items[i]);
        return (
          <text key={i} x={x} y={y - ((lines.length - 1) * 13) / 2} textAnchor="middle" dominantBaseline="middle" className="b-ctext">
            {lines.map((l, j) => (
              <tspan key={j} x={x} dy={j ? 13 : 0}>
                {l}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

function Graph({ fn, xmin, xmax, label }: { fn: string; xmin: number; xmax: number; label?: string }) {
  const W = 340;
  const H = 210;
  const g = plot(fn, xmin, xmax, W, H);
  if (!g) return <div className="b-write muted">(graph of {label || fn})</div>;
  const ticks = (a: number, b: number) => {
    const span = b - a;
    const step = Math.pow(10, Math.floor(Math.log10(span))) * (span / Math.pow(10, Math.floor(Math.log10(span))) > 5 ? 1 : 0.5);
    const out: number[] = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) if (Math.abs(v) > 1e-9) out.push(+v.toFixed(6));
    return out.slice(0, 12);
  };
  return (
    <figure className="b-graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Graph of ${label || fn}`}>
        {g.y0 != null && <line className="b-axis" x1={14} x2={W - 8} y1={g.y0} y2={g.y0} />}
        {g.x0 != null && <line className="b-axis" x1={g.x0} x2={g.x0} y1={8} y2={H - 14} />}
        {ticks(g.xmin, g.xmax).map((v) => (
          <text key={`x${v}`} x={g.sx(v)} y={(g.y0 ?? H - 22) + 14} className="b-tick" textAnchor="middle">
            {v}
          </text>
        ))}
        {ticks(g.ymin, g.ymax).map((v) => (
          <text key={`y${v}`} x={(g.x0 ?? 22) - 5} y={g.sy(v) + 4} className="b-tick" textAnchor="end">
            {v}
          </text>
        ))}
        <path className="b-curve" d={g.d} pathLength={1} />
      </svg>
      {label && (
        <figcaption>
          <Rich text={label} />
        </figcaption>
      )}
    </figure>
  );
}

function Quiz({ el, onAnswer }: { el: QuizEl; onAnswer?: (qid: string, i: number) => void }) {
  const done = el.chosen !== null;
  return (
    <div className={`b-quiz ${done ? 'done' : 'open'}`}>
      <div className="b-quiz-label">{el.label}</div>
      <p className="b-quiz-q">
        <Rich text={el.q} />
      </p>
      <div className="b-quiz-opts">
        {el.options.map((o, i) => {
          const right = done && i === el.answer;
          const wrong = done && i === el.chosen && i !== el.answer;
          return (
            <button key={i} type="button" className={`b-quiz-opt ${right ? 'right' : ''} ${wrong ? 'wrong' : ''}`} disabled={done || !onAnswer} onClick={() => onAnswer?.(el.qid, i)}>
              <span className="b-quiz-letter">{String.fromCharCode(65 + i)})</span> <Rich text={o} />
              {right && <Tick className="b-tick-mark" size={22} />}
              {wrong && <Cross className="b-cross-mark" size={22} />}
            </button>
          );
        })}
      </div>
      {done && el.explain && <p className="b-quiz-explain">{el.explain}</p>}
    </div>
  );
}

function render(item: BoardEl, draw: number, section: number, onAnswer?: (qid: string, i: number) => void): ReactNode {
  switch (item.t) {
    case 'heading':
      return (
        <h3 className="b-heading" style={{ ['--mk' as any]: MARKERS[section % MARKERS.length] }}>
          <span>
            <Rich text={item.text} />
          </span>
        </h3>
      );
    case 'write':
      return (
        <p className={`b-write ${item.tone || ''}`}>
          <Rich text={item.text} />
        </p>
      );
    case 'math':
      return <div className="b-math" dangerouslySetInnerHTML={{ __html: tex(item.tex, true) }} />;
    case 'bullets':
      return (
        <ul className="b-bullets">
          {item.items.map((x, i) => (
            <li key={i}>
              <Rich text={x} />
            </li>
          ))}
        </ul>
      );
    case 'box':
      return (
        <div className="b-box">
          {item.label && <span className="b-box-label">{item.label}</span>}
          <Rich text={item.text} />
        </div>
      );
    case 'flow':
      return (
        <div className="b-flow">
          {item.items.map((x, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <span className="b-flow-arrow" aria-hidden>
                  →
                </span>
              )}
              <span className="b-flow-node">
                <Rich text={x} />
              </span>
            </Fragment>
          ))}
        </div>
      );
    case 'cycle':
      return <Cycle items={item.items} />;
    case 'table':
      return (
        <table className="b-table">
          <thead>
            <tr>
              {item.head.map((h, i) => (
                <th key={i}>
                  <Rich text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {item.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>
                    <Rich text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'graph':
      return <Graph fn={item.fn} xmin={item.xmin} xmax={item.xmax} label={item.label} />;
    case 'sketch':
      return <Sketch h={item.h} shapes={item.shapes} caption={item.caption} draw={draw} />;
    case 'pie':
      return <Pie items={item.items} caption={item.caption} draw={draw} />;
    case 'bars':
      return <Bars items={item.items} caption={item.caption} unit={item.unit} draw={draw} />;
    case 'quiz':
      return <Quiz el={item} onAnswer={onAnswer} />;
    default:
      return null;
  }
}

const isMark = (i: BoardEl) => i.t === 'circle' || i.t === 'underline' || i.t === 'arrow';
const tall = (i: BoardEl) => i.t === 'bullets' || i.t === 'table' || i.t === 'cycle' || i.t === 'graph' || i.t === 'quiz';
/** Diagrams draw themselves stroke by stroke, so they don't need the wipe. */
const selfDrawn = (i: BoardEl) => i.t === 'sketch' || i.t === 'pie' || i.t === 'bars';

interface Mark {
  key: string;
  draw: number;
  d: string;
  label?: { x: number; y: number; text: string };
  arrow?: boolean;
}
interface Cam {
  x: number;
  y: number;
  s: number;
}

/** Split the items into sections: a new heading (or a wipe) starts a new column. */
function sectionsOf(items: ShownItem[]) {
  const out: ShownItem[][] = [];
  let cur: ShownItem[] = [];
  for (const s of items) {
    // a new heading starts a new column — unless the column so far is only headings
    if ((s.item.t === 'heading' || s.item.t === 'clear') && cur.some((x) => !isMark(x.item) && x.item.t !== 'heading')) {
      out.push(cur);
      cur = [];
    }
    if (s.item.t !== 'clear') cur.push(s);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Position of an element inside the world, ignoring the camera's transform. */
function offsetIn(el: HTMLElement, world: HTMLElement) {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== world) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export type InkTool = { tool: 'pen' | 'marker' | 'eraser'; color: string; w: number };

export default function Board({
  items,
  focus,
  follow = true,
  overview = false,
  onUserMove,
  onAnswer,
  ink = [],
  tool = null,
  onInk,
}: {
  items: ShownItem[];
  /** key of the item being written now */
  focus?: string | null;
  follow?: boolean;
  overview?: boolean;
  onUserMove?: () => void;
  onAnswer?: (qid: string, i: number) => void;
  /** what the student has written on the board */
  ink?: InkStroke[];
  /** the student's pen, when they are writing (otherwise dragging moves the board) */
  tool?: InkTool | null;
  onInk?: (ink: InkStroke[]) => void;
}) {
  const view = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, s: 1 });
  const [gliding, setGliding] = useState(true);
  const [pen, setPen] = useState<{ x: number; y: number; w: number; d: number; key: string } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; pts: Map<number, { x: number; y: number }>; dist?: number; s0?: number } | null>(null);
  // the stroke being written now (kept out of React state until it is finished)
  const live = useRef<{ id: number; stroke: InkStroke; path: SVGPathElement | null } | null>(null);
  const livePath = useRef<SVGPathElement>(null);
  const inkRef = useRef(ink);
  inkRef.current = ink;

  const sections = sectionsOf(items);

  // where the camera should be: on the writing, or the whole board
  const aim = useCallback(() => {
    const v = view.current;
    const w = world.current;
    if (!v || !w) return;
    const vw = v.clientWidth;
    const vh = v.clientHeight;
    if (overview || !focus) {
      const W = w.scrollWidth;
      const H = w.scrollHeight;
      const s = Math.max(0.1, Math.min(1.1, Math.min((vw - 30) / W, (vh - 30) / H)));
      setCam({ s, x: (vw - W * s) / 2, y: Math.max(14, (vh - H * s) / 2) });
      return;
    }
    const el = w.querySelector<HTMLElement>(`[data-key="${CSS.escape(focus)}"]`);
    const col = el?.closest<HTMLElement>('.b-col');
    if (!el || !col) return;
    const r = offsetIn(el, w);
    const c = offsetIn(col, w);
    const s = Math.max(0.5, Math.min(1.12, vw / (COL + 110)));
    // like reading a page: the section from its top, scrolling on once the writing reaches the bottom
    let y = 26 - c.y * s;
    if ((r.y + r.h) * s + y > vh - 36) y = vh - 36 - (r.y + r.h) * s;
    setCam({ s, x: vw / 2 - (c.x + COL / 2) * s, y });
  }, [focus, overview]);

  // measure marks (circles, underlines, arrows) and the pen position after every change
  useLayoutEffect(() => {
    const w = world.current;
    if (!w) return;
    const measure = () => {
      const rectOf = (id: string) => {
        const node = w.querySelector<HTMLElement>(`[data-bid="${CSS.escape(id)}"] > *`);
        return node ? offsetIn(node, w) : null;
      };
      const out: Mark[] = [];
      for (const s of items) {
        const it = s.item;
        if (it.t === 'circle') {
          const r = rectOf(it.target);
          if (!r) continue;
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          const rx = r.w / 2 + 14;
          const ry = r.h / 2 + 9;
          out.push({ key: s.key, draw: s.draw, d: `M${cx},${cy - ry} C${cx + rx * 1.33},${cy - ry} ${cx + rx * 1.33},${cy + ry} ${cx},${cy + ry} C${cx - rx * 1.36},${cy + ry} ${cx - rx * 1.3},${cy - ry * 1.08} ${cx + rx * 0.22},${cy - ry * 1.14}` });
        } else if (it.t === 'underline') {
          const r = rectOf(it.target);
          if (!r) continue;
          const y = r.y + r.h - 1;
          out.push({ key: s.key, draw: s.draw, d: `M${r.x - 2},${y + 2} Q${r.x + r.w / 2},${y + 6} ${r.x + r.w + 4},${y}` });
        } else if (it.t === 'arrow') {
          const a = rectOf(it.from);
          const b = rectOf(it.to);
          if (!a || !b) continue;
          const x1 = a.x + a.w + 8;
          const y1 = a.y + a.h / 2;
          const x2 = b.x + b.w + 8;
          const y2 = b.y + b.h / 2;
          const bulge = Math.max(x1, x2) + 40 + Math.abs(y2 - y1) * 0.15;
          out.push({ key: s.key, draw: s.draw, arrow: true, d: `M${x1},${y1} C${bulge},${y1} ${bulge},${y2} ${x2 + 4},${y2}`, label: it.label ? { x: bulge - 6, y: (y1 + y2) / 2, text: it.label } : undefined });
        }
      }
      setMarks(out);
      setSize({ w: w.scrollWidth, h: w.scrollHeight });
      // the pencil writes along the newest item
      const last = [...items].reverse().find((x) => x.draw > 0 && !isMark(x.item) && x.item.t !== 'clear');
      if (last) {
        const el = w.querySelector<HTMLElement>(`[data-key="${CSS.escape(last.key)}"] > *`);
        if (el) {
          const r = offsetIn(el, w);
          setPen((p) => (p?.key === last.key ? p : { key: last.key, x: r.x, y: r.y + Math.min(r.h, 60) * 0.55, w: Math.min(r.w, COL), d: last.draw }));
        }
      }
      if (follow) aim();
    };
    measure();
    const t = window.setTimeout(measure, 350); // fonts and maths settle
    return () => {
      window.clearTimeout(t);
    };
  }, [items, follow, aim]);

  useEffect(() => {
    if (follow || overview) {
      setGliding(true);
      aim();
    }
  }, [follow, overview, aim]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const ro = new ResizeObserver(() => {
      if (follow || overview) aim();
    });
    ro.observe(v);
    return () => {
      ro.disconnect();
    };
  }, [follow, overview, aim]);

  // the student moves the board: drag to pan, wheel or pinch to zoom
  function zoomAt(px: number, py: number, factor: number) {
    setCam((c) => {
      const s = Math.max(0.1, Math.min(2.2, c.s * factor));
      const k = s / c.s;
      return { s, x: px - (px - c.x) * k, y: py - (py - c.y) * k };
    });
  }
  /** board coordinates under the pointer */
  function toWorld(e: { clientX: number; clientY: number }) {
    const r = view.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - cam.x) / cam.s, y: (e.clientY - r.top - cam.y) / cam.s };
  }
  function eraseAt(p: { x: number; y: number }) {
    const rad = 14 / cam.s;
    const near = (s: InkStroke) => {
      const r = rad + s.w / 2;
      if (s.pts.length === 2) return Math.hypot(s.pts[0] - p.x, s.pts[1] - p.y) < r;
      for (let i = 0; i + 3 < s.pts.length; i += 2) {
        // distance from the pointer to this piece of the line
        const ax = s.pts[i], ay = s.pts[i + 1], bx = s.pts[i + 2], by = s.pts[i + 3];
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(ax + t * dx - p.x, ay + t * dy - p.y) < r) return true;
      }
      return false;
    };
    const keep = inkRef.current.filter((s) => !near(s));
    if (keep.length !== inkRef.current.length) onInk?.(keep);
  }
  const capture = (e: RPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not every pointer can be captured (e.g. one that already ended) */
    }
  };
  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    // while writing, the pen writes over everything on the board (answers are tapped with the pen off)
    if (!tool && (e.target as HTMLElement).closest('button')) return;
    // writing: one pointer draws; a second finger turns it into moving the board
    if (tool && !drag.current && !live.current && (e.pointerType !== 'touch' || e.isPrimary)) {
      capture(e);
      const p = toWorld(e);
      setGliding(false);
      onUserMove?.();
      if (tool.tool === 'eraser') {
        live.current = { id: e.pointerId, stroke: { id: 'eraser', tool: 'pen', color: '', w: 0, pts: [] }, path: null };
        eraseAt(p);
        return;
      }
      const stroke: InkStroke = { id: Math.random().toString(36).slice(2, 10), tool: tool.tool, color: tool.color, w: tool.w, pts: [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10] };
      live.current = { id: e.pointerId, stroke, path: livePath.current };
      livePath.current?.setAttribute('d', inkPath(stroke.pts));
      livePath.current?.setAttribute('stroke', stroke.color);
      livePath.current?.setAttribute('stroke-width', String(stroke.w));
      livePath.current?.setAttribute('class', `ink-${stroke.tool}`);
      return;
    }
    if (live.current && live.current.id !== e.pointerId) {
      // a second finger: drop the stroke just started and pan/zoom instead
      live.current = null;
      livePath.current?.setAttribute('d', '');
    }
    type Drag = NonNullable<typeof drag.current>;
    const d: Drag = drag.current || { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, pts: new Map() };
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pts.size === 2) {
      const [a, b] = [...d.pts.values()];
      d.dist = Math.hypot(a.x - b.x, a.y - b.y);
      d.s0 = cam.s;
    }
    drag.current = d;
    capture(e);
  }
  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    const L = live.current;
    if (L && L.id === e.pointerId) {
      const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const p = toWorld(ev);
        if (L.stroke.id === 'eraser') {
          eraseAt(p);
          continue;
        }
        const n = L.stroke.pts.length;
        if (Math.hypot(p.x - L.stroke.pts[n - 2], p.y - L.stroke.pts[n - 1]) * cam.s < 1.5) continue;
        L.stroke.pts.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
      }
      if (L.path) L.path.setAttribute('d', inkPath(L.stroke.pts));
      return;
    }
    const d = drag.current;
    if (!d || !d.pts.has(e.pointerId)) return;
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = view.current!.getBoundingClientRect();
    if (d.pts.size >= 2 && d.dist) {
      const [a, b] = [...d.pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const f = (d.s0! * (dist / d.dist)) / cam.s;
      if (Math.abs(f - 1) > 0.01) {
        setGliding(false);
        onUserMove?.();
        zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, f);
      }
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < 5) return;
    setGliding(false);
    onUserMove?.();
    setCam((c) => ({ ...c, x: d.cx + dx, y: d.cy + dy }));
  }
  function onPointerUp(e: RPointerEvent<HTMLDivElement>) {
    const L = live.current;
    if (L && L.id === e.pointerId) {
      live.current = null;
      livePath.current?.setAttribute('d', '');
      livePath.current?.removeAttribute('class');
      if (L.stroke.id !== 'eraser' && e.type !== 'pointercancel') onInk?.([...inkRef.current, L.stroke]);
      return;
    }
    const d = drag.current;
    if (!d) return;
    d.pts.delete(e.pointerId);
    if (!d.pts.size) drag.current = null;
    else {
      // one finger left: carry on panning from here
      const [p] = [...d.pts.values()];
      d.x = p.x;
      d.y = p.y;
      d.cx = cam.x;
      d.cy = cam.y;
      d.dist = undefined;
    }
  }
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = v.getBoundingClientRect();
      setGliding(false);
      onUserMove?.();
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
      else setCam((c) => ({ ...c, x: c.x - e.deltaX }));
    };
    v.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      v.removeEventListener('wheel', onWheel);
    };
  }, [onUserMove]);

  return (
    <div className={`board ${tool ? `drawing tool-${tool.tool}` : ''}`} ref={view} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className={`board-world ${gliding ? 'glide' : ''}`} ref={world} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})` }}>
        {sections.map((sec, si) => (
          <section key={sec[0]?.key || si} className="b-col" style={{ width: COL }}>
            {sec
              .filter((s) => !isMark(s.item))
              .map((s) => {
                const id = 'id' in s.item ? s.item.id : undefined;
                const style = s.draw && !selfDrawn(s.item) ? ({ '--d': `${s.draw}s` } as CSSProperties) : undefined;
                const cls = s.draw && !selfDrawn(s.item) ? (tall(s.item) ? 'writing-y' : 'writing') : '';
                return (
                  <div key={s.key} className={`bi bi-${s.item.t} ${cls}`} style={style} data-bid={id} data-key={s.key}>
                    {render(s.item, s.draw, si, onAnswer)}
                  </div>
                );
              })}
          </section>
        ))}
        <svg className="board-marks" width={size.w} height={size.h} aria-hidden>
          <defs>
            <marker id="bm-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {marks.map((m) => (
            <g key={m.key}>
              <path d={m.d} pathLength={1} className={`bmark ${m.draw ? 'drawing' : ''}`} style={m.draw ? ({ '--d': `${m.draw}s` } as CSSProperties) : undefined} markerEnd={m.arrow ? 'url(#bm-head)' : undefined} />
              {m.label && (
                <text x={m.label.x} y={m.label.y} className="bmark-label" textAnchor="end">
                  {m.label.text}
                </text>
              )}
            </g>
          ))}
        </svg>
        <svg className="board-ink" width={Math.max(size.w, 1)} height={Math.max(size.h, 1)} aria-hidden>
          {ink.map((s) => (
            <path key={s.id} d={inkPath(s.pts)} stroke={s.color} strokeWidth={s.w} className={`ink-${s.tool}`} />
          ))}
          <path ref={livePath} d="" />
        </svg>
        {pen && (
          <span key={pen.key} className="b-pen" style={{ left: pen.x, top: pen.y, ['--w' as any]: `${pen.w}px`, ['--d' as any]: `${pen.d}s` } as CSSProperties} aria-hidden>
            <Pencil size={26} />
          </span>
        )}
      </div>
    </div>
  );
}
