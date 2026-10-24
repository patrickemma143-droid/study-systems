import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Crosshair, FileUp, Layers, ListChecks, RotateCcw, TrendingUp } from 'lucide-react';
import type { Prediction } from '@shared/engine/predict';
import { api } from '../api';
import { Crumbs, ErrorState, Loading } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';

interface Spot {
  chunk: number;
  title: string;
  risk: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
  likelihood: string | null;
  cards: number;
}
interface CoachData {
  prediction: Prediction;
  spots: Spot[];
  focus: number[];
  drillCards: number[];
  studied: boolean;
}

const LIKELY_TINT: Record<string, string> = { 'Very likely': 'var(--hl-pink)', Likely: 'var(--hl-orange)', Possible: 'var(--hl-yellow)', 'Not seen yet': 'var(--paper-2)' };

export default function Coach() {
  const id = Number(useParams().id);
  const { data, error } = usePack(id);
  useStudyTimer('coach', id);
  const [c, setC] = useState<CoachData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api<CoachData>(`/coach/${id}`)
      .then(setC)
      .catch((e) => setErr(e.message));
  }, [id]);

  if (error || err) return <ErrorState message={(error || err)!} />;
  if (!data || !c) return <Loading />;
  const p = c.prediction;
  const focus = c.spots.filter((s) => c.focus.includes(s.chunk));
  const topics = showAll ? p.topics : p.topics.slice(0, 8);

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Exam coach' }]} />
      <h1 className="row">
        <Crosshair size={28} color="var(--biro)" /> Exam coach
      </h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        Your time is short, so spend it where the marks are: on what is likely to come up and what you don’t know yet.
      </p>

      <section className="section">
        <div className="section-head">
          <h2>Fix these first</h2>
        </div>
        {focus.length === 0 ? (
          <div className="sheet">
            {c.studied ? (
              <p style={{ margin: 0 }}>
                <strong>No weak spots right now.</strong> Your cards, quizzes and explanations all look solid. Keep your daily cards going and try a mock paper.
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                <strong>Study a little first.</strong> Read a lesson, do some flashcards or a quiz, and the coach will show exactly where you are weak.
              </p>
            )}
          </div>
        ) : (
          <div className="stack">
            {focus.map((s, i) => (
              <div key={s.chunk} className={`sheet weak-spot ${s.risk}`}>
                <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="small muted">
                      {i + 1}. {s.risk === 'high' ? 'High risk' : 'Worth fixing'}
                      {s.likelihood ? ` · ${s.likelihood} to come up` : ''}
                    </div>
                    <strong>{s.title}</strong>
                    <div className="small" style={{ marginTop: 4 }}>
                      {s.reasons.join(' · ') || 'not practised enough yet'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Link to={`/pack/${id}/learn/${s.chunk}`} className="btn small">
                      <BookOpen size={15} /> Re-read
                    </Link>
                    <Link to={`/pack/${id}/feynman?chunk=${s.chunk}`} className="btn small">
                      Explain it
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            <div className="sheet coach-actions">
              <strong>Your 15-minute fix</strong>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {c.drillCards.length > 0 && (
                  <Link to={`/pack/${id}/cards?ids=${c.drillCards.join(',')}`} className="btn primary">
                    <Layers size={16} /> Drill these {c.drillCards.length} cards
                  </Link>
                )}
                <Link to={`/pack/${id}/quiz?chunks=${focus.map((s) => s.chunk).join(',')}`} className="btn">
                  <ListChecks size={16} /> Quiz on these lessons
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="row" style={{ gap: 8 }}>
            <TrendingUp size={20} /> What’s likely to come up
          </h2>
          {p.method === 'past-papers' && (
            <span className="small muted">
              From {p.papers} past paper{p.papers === 1 ? '' : 's'}
              {p.years.length ? ` (${p.years.join(', ')})` : ''}
            </span>
          )}
        </div>
        {p.method === 'notes' && (
          <div className="sheet tight lib-banner" style={{ marginBottom: 12 }}>
            <span className="small">
              <strong>No past papers yet,</strong> so this is based on what your notes stress most. Add past papers (yours or from the library) for a real prediction.
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Link to={`/pack/${id}/paper#past-papers`} className="btn small">
                <FileUp size={15} /> Add a past paper
              </Link>
              <Link to={`/library?type=paper`} className="btn small">
                Find in library
              </Link>
            </span>
          </div>
        )}
        <div className="sheet" style={{ padding: '6px 18px' }}>
          {topics.map((t) => (
            <div key={t.chunk} className="predict-row">
              <div className="predict-bar" aria-hidden>
                <span style={{ width: `${t.score}%`, background: LIKELY_TINT[t.likelihood] }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <Link to={`/pack/${id}/learn/${t.chunk}`} className="predict-title">
                    {t.title}
                  </Link>
                  <span className="lib-type" style={{ background: LIKELY_TINT[t.likelihood] }}>
                    {t.likelihood}
                  </span>
                </div>
                <div className="small muted">
                  {p.method === 'past-papers'
                    ? t.appeared
                      ? `In ${t.appeared} of ${p.papers} papers${t.years.length ? ` (${t.years.join(', ')})` : ''}${t.marks ? `, about ${t.marks} marks in total` : ''}`
                      : 'Not in your past papers so far'
                    : `${t.score}% emphasis in your notes`}
                  {t.comeback && (
                    <span className="chip exam" style={{ marginLeft: 6 }}>
                      <RotateCcw size={12} /> Due for a comeback
                    </span>
                  )}
                </div>
                {t.questions.length > 0 && (
                  <details className="lib-sample">
                    <summary className="small">How they asked it</summary>
                    <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {t.questions.map((q, i) => (
                        <li key={i}>
                          {q.text}
                          {q.year ? <span className="muted"> ({q.year})</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
        {p.topics.length > 8 && (
          <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${p.topics.length} lessons`}
          </button>
        )}
        <p className="hint">Predictions show patterns, not promises: revise everything, but start at the top.</p>
      </section>
    </div>
  );
}
