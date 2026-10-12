import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, EyeOff, Printer } from 'lucide-react';
import { Crumbs, ErrorState, Loading } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';

export default function Cornell() {
  const id = Number(useParams().id);
  const { data, error } = usePack(id);
  useStudyTimer('cornell', id);
  const [covered, setCovered] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const d = data.pack.data;

  const toggleCover = () => {
    setCovered((c) => !c);
    setRevealed(new Set());
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Cornell notes' }]} />
      <div className="row between no-print" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Cornell notes</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Cover the notes and answer the questions on the left out loud. Then uncover to check.
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={toggleCover} aria-pressed={covered}>
            {covered ? <Eye size={18} /> : <EyeOff size={18} />} {covered ? 'Uncover notes' : 'Cover notes'}
          </button>
          <button className="btn" onClick={() => window.print()}>
            <Printer size={18} /> Print
          </button>
        </div>
      </div>

      <div className="stack">
        {d.chunks.map((c) => {
          const cues = d.cards
            .filter((x) => x.chunk === c.index && (x.type === 'definition' || x.type === 'list'))
            .slice(0, 4)
            .map((x) => x.front);
          const questions = cues.length ? cues : c.prompts.slice(0, 2);
          const hidden = covered && !revealed.has(c.index);
          return (
            <section key={c.index} className="sheet" style={{ padding: 0, overflow: 'hidden', breakInside: 'avoid' }}>
              <h2 style={{ fontSize: '1.1rem', margin: 0, padding: '14px 20px', borderBottom: '2px solid var(--ink)' }}>
                {c.index + 1}. {c.title}
              </h2>
              <div className="cornell-grid">
                <div className="cornell-cues">
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Questions
                  </div>
                  {questions.map((q, i) => (
                    <p key={i} className="small" style={{ fontWeight: 500, marginBottom: 10 }}>
                      {q}
                    </p>
                  ))}
                </div>
                <div style={{ padding: '14px 20px', position: 'relative' }}>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Notes
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, filter: hidden ? 'blur(7px)' : undefined, userSelect: hidden ? 'none' : undefined }} aria-hidden={hidden}>
                    {c.keyPoints.map((p, i) => (
                      <li key={i} className="small" style={{ marginBottom: 6 }}>
                        {p}
                      </li>
                    ))}
                  </ul>
                  {hidden && (
                    <button className="btn small" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }} onClick={() => setRevealed((s) => new Set(s).add(c.index))}>
                      <Eye size={16} /> Check my answers
                    </button>
                  )}
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '2px solid var(--ink)' }}>
                <span className="small muted">Summary: </span>
                <span className="small" style={{ filter: hidden ? 'blur(6px)' : undefined }}>
                  {c.nutshell}
                </span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
