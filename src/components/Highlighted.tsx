import { useMemo, useState, type ReactNode } from 'react';
import { escapeRegExp } from '@shared/engine/text';

export interface Gloss {
  term: string;
  definition?: string;
}

const COLORS = ['hl-yellow', 'hl-green', 'hl-blue', 'hl-pink', 'hl-orange', 'hl-purple'];

/**
 * Renders text with key terms marked like a highlighter. Tapping a term shows its definition,
 * so students never get stuck on jargon.
 */
export function Highlighted({ text, terms, colorful = false }: { text: string; terms: Gloss[]; colorful?: boolean }) {
  const [tip, setTip] = useState<{ x: number; y: number; g: Gloss } | null>(null);

  const re = useMemo(() => {
    const list = terms.filter((t) => t.term.length > 2).sort((a, b) => b.term.length - a.term.length);
    if (!list.length) return null;
    return new RegExp(`\\b(${list.map((t) => escapeRegExp(t.term)).join('|')})(?:s|es)?\\b`, 'gi');
  }, [terms]);

  const parts = useMemo(() => {
    if (!re) return [text] as ReactNode[];
    const out: ReactNode[] = [];
    let last = 0;
    const seen = new Set<string>();
    text.replace(re, (match, base: string, offset: number) => {
      const key = base.toLowerCase();
      const g = terms.find((t) => t.term.toLowerCase() === key);
      if (!g || seen.has(key)) return match; // highlight only the first mention in each block
      seen.add(key);
      out.push(text.slice(last, offset));
      const color = colorful ? COLORS[terms.indexOf(g) % COLORS.length] : 'hl-yellow';
      out.push(
        g.definition ? (
          <button
            key={offset}
            type="button"
            className={`hl term ${color}`}
            aria-label={`${match}: ${g.definition}`}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTip((t) => (t?.g === g ? null : { x: r.left, y: r.bottom + 8, g }));
            }}
            onBlur={() => setTip(null)}
          >
            {match}
          </button>
        ) : (
          <mark key={offset} className={color}>
            {match}
          </mark>
        ),
      );
      last = offset + match.length;
      return match;
    });
    out.push(text.slice(last));
    return out;
  }, [text, re, terms, colorful]);

  return (
    <>
      {parts}
      {tip && (
        <span className="tip" role="tooltip" style={{ left: Math.max(12, Math.min(tip.x, window.innerWidth - 332)), top: Math.min(tip.y, window.innerHeight - 140) }}>
          <strong>{tip.g.term}</strong>
          {tip.g.definition}
        </span>
      )}
    </>
  );
}
