// The whiteboard: draws the tutor's board items as if being written, with circles, underlines and
// arrows that point at earlier items, flows, cycles, tables and graphs. Maths is drawn with KaTeX.
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { BoardItem } from '../../shared/tutor';
import { plot } from '../lib/tutor/graph';

export interface ShownItem {
  key: string;
  item: BoardItem;
  /** seconds for its "being written" animation; 0 = already there */
  draw: number;
}

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

function render(item: BoardItem): ReactNode {
  switch (item.t) {
    case 'heading':
      return (
        <h3 className="b-heading">
          <Rich text={item.text} />
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
    default:
      return null;
  }
}

const isMark = (i: BoardItem) => i.t === 'circle' || i.t === 'underline' || i.t === 'arrow';
const tall = (i: BoardItem) => i.t === 'bullets' || i.t === 'table' || i.t === 'cycle' || i.t === 'graph';

interface Mark {
  key: string;
  draw: number;
  d: string;
  label?: { x: number; y: number; text: string };
  arrow?: boolean;
}

export default function Board({ items, focus }: { items: ShownItem[]; focus?: string | null }) {
  const inner = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // circles, underlines and arrows are drawn over the items they point at
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const rectOf = (id: string) => {
        const node = el.querySelector<HTMLElement>(`[data-bid="${CSS.escape(id)}"] > *`);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        // the text's own width, not the whole line
        const range = document.createRange();
        range.selectNodeContents(node);
        const tr = range.getBoundingClientRect();
        const w = Math.min(r.width, tr.width || r.width);
        return { x: r.left - base.left + el.scrollLeft, y: r.top - base.top + el.scrollTop, w: Math.max(30, w), h: r.height };
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
          // a hand-drawn loop that overshoots its start a little
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
          const down = b.y > a.y;
          const x1 = a.x + a.w + 8;
          const y1 = a.y + a.h / 2;
          const x2 = b.x + b.w + 8;
          const y2 = b.y + b.h / 2;
          const bulge = Math.max(x1, x2) + 40 + Math.abs(y2 - y1) * 0.15;
          out.push({
            key: s.key,
            draw: s.draw,
            arrow: true,
            d: `M${x1},${y1} C${bulge},${y1} ${bulge},${y2} ${x2 + 4},${y2 + (down ? -2 : 2)}`,
            label: it.label ? { x: bulge - 6, y: (y1 + y2) / 2, text: it.label } : undefined,
          });
        }
      }
      setMarks(out);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    measure();
    // fonts and maths change sizes once they load
    const t = window.setTimeout(measure, 350);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // keep the newest writing in view
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [items]);

  return (
    <div className="board">
      <div className="board-inner" ref={inner}>
        {items
          .filter((s) => !isMark(s.item) && s.item.t !== 'clear')
          .map((s) => {
            const id = 'id' in s.item ? s.item.id : undefined;
            const style = s.draw ? ({ '--d': `${s.draw}s` } as CSSProperties) : undefined;
            return (
              <div key={s.key} className={`bi ${s.draw ? (tall(s.item) ? 'writing-y' : 'writing') : ''} ${focus && id === focus ? 'focus' : ''}`} style={style} data-bid={id}>
                {render(s.item)}
              </div>
            );
          })}
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
      </div>
    </div>
  );
}
