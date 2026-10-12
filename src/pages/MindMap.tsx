import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Crumbs, ErrorState, Loading } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';

const TINTS = ['var(--hl-yellow)', 'var(--hl-green)', 'var(--hl-blue)', 'var(--hl-pink)', 'var(--hl-orange)', 'var(--hl-purple)'];

function wrap(text: string, max: number, lines = 2): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = kept[lines - 1].slice(0, max - 1) + '…';
    return kept;
  }
  return out;
}

export default function MindMap() {
  const id = Number(useParams().id);
  const { data, error } = usePack(id);
  useStudyTimer('mindmap', id);
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState<'map' | 'outline'>(() => (window.innerWidth < 700 ? 'outline' : 'map'));

  const layout = useMemo(() => {
    if (!data) return null;
    const chunks = data.pack.data.chunks;
    const n = chunks.length;
    const R1 = n > 10 ? 260 : n > 6 ? 230 : 200;
    const showLeaves = n <= 14;
    const R2 = R1 + 165;
    const step = (2 * Math.PI) / Math.max(n, 1);
    const used = new Set<string>();
    const defined = new Map(data.pack.data.glossary.map((g) => [g.term.toLowerCase(), g.chunk]));
    const leafTerms = chunks.map((c) => {
      const ranked = [...c.keyTerms].sort((a, b) => Number(defined.get(b.toLowerCase()) === c.index) - Number(defined.get(a.toLowerCase()) === c.index));
      const pick = ranked.filter((t) => !used.has(t.toLowerCase())).slice(0, 3);
      pick.forEach((t) => used.add(t.toLowerCase()));
      return pick;
    });
    const branches = chunks.map((c, i) => {
      const a = -Math.PI / 2 + i * step;
      const x = Math.cos(a) * R1;
      const y = Math.sin(a) * R1;
      const terms = showLeaves ? leafTerms[i] : [];
      const leaves = terms.map((t, k) => {
        const spread = terms.length > 1 ? (k / (terms.length - 1) - 0.5) * Math.min(step * 0.75, 0.9) : 0;
        const la = a + spread;
        return { t, x: Math.cos(la) * R2, y: Math.sin(la) * R2 };
      });
      return { c, x, y, a, leaves, tint: TINTS[i % TINTS.length] };
    });
    const ext = (showLeaves ? R2 : R1) + 80;
    return { branches, ext };
  }, [data]);

  if (error) return <ErrorState message={error} />;
  if (!data || !layout) return <Loading />;
  const chunks = data.pack.data.chunks;
  const selected = sel !== null ? chunks[sel] : null;

  return (
    <div>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Mind map' }]} />
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Mind map</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Each branch is a lesson, with its key terms around it. Tap a branch to see its main idea.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === 'map'} onClick={() => setView('map')}>
            Map
          </button>
          <button aria-pressed={view === 'outline'} onClick={() => setView('outline')}>
            Outline
          </button>
        </div>
      </div>

      {view === 'map' ? (
        <div className="sheet" style={{ padding: 8, overflow: 'hidden' }}>
          <svg viewBox={`${-layout.ext - 40} ${-layout.ext} ${(layout.ext + 40) * 2} ${layout.ext * 2}`} style={{ width: '100%', height: 'auto', maxHeight: '78vh' }} role="img" aria-label={`Mind map of ${data.pack.title}`}>
            {layout.branches.map((b, i) => (
              <g key={`l${i}`} opacity={sel === null || sel === i ? 1 : 0.25} style={{ transition: 'opacity .2s' }}>
                <path d={`M0 0 Q ${b.x * 0.45} ${b.y * 0.1} ${b.x} ${b.y}`} fill="none" stroke={b.tint} strokeWidth={10} strokeLinecap="round" />
                {b.leaves.map((l, k) => (
                  <path key={k} d={`M${b.x} ${b.y} L ${l.x} ${l.y}`} fill="none" stroke={b.tint} strokeWidth={3} strokeLinecap="round" />
                ))}
              </g>
            ))}
            <g>
              <ellipse cx={0} cy={0} rx={128} ry={62} fill="var(--biro)" />
              {wrap(data.pack.title, 22, 3).map((line, k, arr) => (
                <text key={k} x={0} y={(k - (arr.length - 1) / 2) * 22 + 6} textAnchor="middle" fill="var(--on-biro)" fontSize={18} fontWeight={600}>
                  {line}
                </text>
              ))}
            </g>
            {layout.branches.map((b, i) => {
              const lines = wrap(`${i + 1}. ${b.c.title}`, 20, 2);
              const w = Math.max(...lines.map((l) => l.length)) * 9.2 + 28;
              const h = lines.length * 21 + 18;
              return (
                <g key={`b${i}`} opacity={sel === null || sel === i ? 1 : 0.35} style={{ cursor: 'pointer', transition: 'opacity .2s' }} onClick={() => setSel(sel === i ? null : i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(sel === i ? null : i)} aria-label={`Lesson ${i + 1}: ${b.c.title}`}>
                  <rect x={b.x - w / 2} y={b.y - h / 2} width={w} height={h} rx={12} fill="var(--paper)" stroke={b.tint} strokeWidth={sel === i ? 5 : 3} />
                  {lines.map((line, k) => (
                    <text key={k} x={b.x} y={b.y + (k - (lines.length - 1) / 2) * 21 + 6} textAnchor="middle" fill="var(--ink)" fontSize={16} fontWeight={600}>
                      {line}
                    </text>
                  ))}
                  {b.leaves.map((l, k) => {
                    const lw = Math.min(l.t.length, 22) * 8.4 + 20;
                    return (
                      <g key={k}>
                        <rect x={l.x - lw / 2} y={l.y - 15} width={lw} height={30} rx={15} fill={b.tint} />
                        <text x={l.x} y={l.y + 5} textAnchor="middle" fill="var(--hl-ink)" fontSize={14}>
                          {l.t.length > 22 ? `${l.t.slice(0, 21)}…` : l.t}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="sheet">
          <h2 style={{ fontSize: '1.2rem' }}>{data.pack.title}</h2>
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {chunks.map((c, i) => (
              <li key={i} style={{ marginBottom: 14 }}>
                <button className="btn ghost" style={{ height: 'auto', padding: '2px 6px', fontWeight: 600, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setSel(sel === i ? null : i)}>
                  {c.title}
                </button>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  {c.keyTerms.slice(0, 5).map((t) => (
                    <span key={t} className="chip" style={{ background: TINTS[i % TINTS.length], color: 'var(--hl-ink)', borderColor: 'transparent' }}>
                      {t}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {selected && (
        <div className="sheet" style={{ marginTop: 16, borderLeft: `6px solid ${TINTS[sel! % TINTS.length]}` }}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>
              {sel! + 1}. {selected.title}
            </h3>
            <Link to={`/pack/${id}/learn/${sel}`} className="btn small">
              <BookOpen size={16} /> Open lesson
            </Link>
          </div>
          <p style={{ margin: '10px 0 8px', fontWeight: 500 }}>{selected.nutshell}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {selected.keyPoints.slice(0, 4).map((p, k) => (
              <li key={k} className="small" style={{ marginBottom: 4 }}>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
