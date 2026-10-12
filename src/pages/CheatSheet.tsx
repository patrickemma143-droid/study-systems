import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import type { StudyPack } from '@shared/engine/types';
import { Crumbs, ErrorState, Loading } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';

/** The one-page summary. Also used inside the cram plan. */
export function SheetBody({ d, chunkFilter, examFirst = false }: { d: StudyPack; chunkFilter?: number[]; examFirst?: boolean }) {
  const chunks = useMemo(() => {
    let cs = chunkFilter ? d.chunks.filter((c) => chunkFilter.includes(c.index)) : d.chunks;
    if (examFirst) cs = [...cs].sort((a, b) => b.importance - a.importance);
    return cs;
  }, [d, chunkFilter, examFirst]);
  const inScope = (chunk: number) => !chunkFilter || chunkFilter.includes(chunk);
  const glossary = d.glossary.filter((g) => inScope(g.chunk));
  const mnemonics = d.mnemonics.filter((m) => inScope(m.chunk));
  const lists = d.lists.filter((l) => inScope(l.chunk) && !mnemonics.some((m) => m.category === l.category));

  return (
    <div className="stack">
      {glossary.length > 0 && (
        <div className="sheet">
          <h2 style={{ fontSize: '1.15rem' }}>Definitions</h2>
          <div className="grid cols-2" style={{ gap: '4px 24px' }}>
            {glossary.map((g) => (
              <div key={g.term} className="small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                <mark style={{ fontWeight: 600 }}>{g.term}</mark> {g.definition}
              </div>
            ))}
          </div>
        </div>
      )}
      {(mnemonics.length > 0 || lists.length > 0) && (
        <div className="sheet">
          <h2 style={{ fontSize: '1.15rem' }}>Lists to know</h2>
          <div className="grid cols-2" style={{ gap: 14 }}>
            {mnemonics.map((m) => (
              <div key={m.category} className="small">
                <div className="row between" style={{ gap: 6 }}>
                  <strong>{m.category.charAt(0).toUpperCase() + m.category.slice(1)}</strong>
                  <span className="chip" style={{ background: 'var(--hl-pink)', color: 'var(--hl-ink)', borderColor: 'transparent', fontWeight: 700 }}>
                    {m.acronym}
                  </span>
                </div>
                <div>{m.order.map((i) => m.items[i]).join(', ')}</div>
              </div>
            ))}
            {lists.map((l) => (
              <div key={l.category} className="small">
                <strong>{l.category.charAt(0).toUpperCase() + l.category.slice(1)}</strong>
                <div>{l.items.map((i) => i.label).join(', ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="sheet">
        <h2 style={{ fontSize: '1.15rem' }}>Key points by lesson</h2>
        {chunks.map((c) => (
          <div key={c.index} style={{ padding: '10px 0', borderTop: '1px solid var(--line)', breakInside: 'avoid' }}>
            <div className="row" style={{ gap: 8 }}>
              <strong>
                {c.index + 1}. {c.title}
              </strong>
              {c.importance >= 0.75 && <span className="chip exam">Likely examined</span>}
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {c.keyPoints.slice(0, 4).map((p, i) => (
                <li key={i} className="small" style={{ marginBottom: 3 }}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CheatSheet() {
  const id = Number(useParams().id);
  const { data, error } = usePack(id);
  useStudyTimer('cheat-sheet', id);
  const [examFirst, setExamFirst] = useState(false);
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const d = data.pack.data;
  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Cheat sheet' }]} />
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{data.pack.title}</h1>
          <p className="muted small no-print" style={{ margin: 0 }}>
            Everything examinable on one page. Read it the night before and again in the morning.
          </p>
        </div>
        <div className="row no-print">
          <button className="chip" aria-pressed={examFirst} onClick={() => setExamFirst((x) => !x)}>
            Most examinable first
          </button>
          <button className="btn" onClick={() => window.print()}>
            <Printer size={18} /> Print
          </button>
        </div>
      </div>
      {d.overview.length > 0 && (
        <div className="sheet" style={{ marginBottom: 18, borderLeft: '6px solid var(--hl-yellow)' }}>
          {d.overview.join(' ')}
        </div>
      )}
      <SheetBody d={d} examFirst={examFirst} />
    </div>
  );
}
