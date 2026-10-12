import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RotateCcw, X } from 'lucide-react';
import { shuffle } from '@shared/engine/text';
import { buildLevelQuiz, LEVEL_POINTS, type Level } from '@shared/engine/levels';
import { api, type MixedQuestion } from '../api';
import { QuizRunner, type QuizResult, type RunnerQuestion } from '../components/QuizRunner';
import { Crumbs, ErrorState, Loading, Ring, useToast } from '../components/ui';
import { invalidatePack, usePack, useStudyTimer } from '../lib/usePack';

const COUNTS = [5, 10, 20, 0];

export default function QuizPage({ mixed = false }: { mixed?: boolean }) {
  const params = useParams();
  const packId = mixed ? null : Number(params.id);
  const toast = useToast();
  const { data, error } = usePack(packId ?? -1);
  useStudyTimer(mixed ? 'mixed-quiz' : 'quiz', packId);

  const [count, setCount] = useState(10);
  const [selected, setSelected] = useState<number[]>([]);
  const [questions, setQuestions] = useState<RunnerQuestion[] | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [round, setRound] = useState(0);
  const [mixedErr, setMixedErr] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('medium');

  useEffect(() => {
    if (!mixed) return;
    api<{ questions: MixedQuestion[] }>(`/study/mixed?limit=12&level=${level}`)
      .then((r) => {
        if (!r.questions.length) setMixedErr('Add at least one study pack to get a mixed quiz.');
        setQuestions(r.questions.map((m) => ({ ...m.q, packId: m.packId, packTitle: m.packTitle })));
      })
      .catch((e) => setMixedErr(e.message));
  }, [mixed, round, level]);

  const pool = useMemo(() => {
    if (!data) return [];
    return buildLevelQuiz(data.pack.data, level, selected.length ? selected : undefined, `${round}`);
  }, [data, selected, level, round]);

  function start(from = pool) {
    const picked = shuffle(from).slice(0, count || from.length);
    setQuestions(picked.map((q) => ({ ...q, packId: packId! })));
    setResult(null);
  }

  async function finish(r: QuizResult) {
    setResult(r);
    const wrong = r.answers.filter((a) => !a.correct).map((a) => ({ packId: a.q.packId ?? packId!, chunk: a.q.chunk }));
    const uniq = [...new Map(wrong.map((w) => [`${w.packId}:${w.chunk}`, w])).values()];
    const saved = await api<{ points?: number }>('/study/quiz', { body: { packId, mode: mixed ? 'mixed' : 'quiz', level, score: r.score, total: r.total, wrong: uniq, details: r.answers.map((a) => ({ id: a.q.id, ok: a.correct })) } }).catch(() => null);
    if (saved?.points) toast(`+${saved.points} fast learner points`);
    if (packId) invalidatePack(packId);
  }

  if (error) return <ErrorState message={error} />;
  if (mixedErr) return <ErrorState message={mixedErr} action={<Link to="/new" className="btn primary">Add notes</Link>} />;
  if (!mixed && !data) return <Loading />;

  const title = mixed ? 'Mixed quiz' : 'Practice quiz';
  const crumbs = mixed ? [{ to: '/home', label: 'Home' }, { label: title }] : [{ to: '/home', label: 'Home' }, { to: `/pack/${packId}`, label: data!.pack.title }, { label: title }];
  const chunks = data?.pack.data.chunks || [];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <Crumbs items={crumbs} />
      <h1>{title}</h1>
      {mixed && !result && <p className="muted">Questions from all your packs, mixed together. Switching topics feels harder, but it builds stronger memory than practising one topic at a time.</p>}
      {!result && (!questions || mixed) && (
        <div style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            Difficulty
          </div>
          <div className="levels" role="radiogroup" aria-label="Difficulty">
            {(['easy', 'medium', 'hard'] as Level[]).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={level === l}
                className={`level-btn ${l} ${level === l ? 'on' : ''}`}
                onClick={() => {
                  setLevel(l);
                  if (mixed) setQuestions(null);
                }}
              >
                <strong>{l === 'easy' ? 'Easy' : l === 'medium' ? 'Medium' : 'Hard'}</strong>
                <span className="small">{l === 'easy' ? 'Fewer choices, clear answers' : l === 'medium' ? 'The standard quiz' : 'Twisted: “NOT” questions, swapped definitions, type the answer'}</span>
                <span className="level-pts">{LEVEL_POINTS[l] * 1}× points</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result ? (
        <Results
          result={result}
          chunkTitle={(q) => (q.packTitle ? q.packTitle : chunks[q.chunk]?.title)}
          lessonLink={(q) => `/pack/${q.packId ?? packId}/learn/${q.chunk}`}
          onRetryWrong={() => {
            const wrong = result.answers.filter((a) => !a.correct).map((a) => a.q);
            setQuestions(shuffle(wrong));
            setResult(null);
          }}
          onNew={() => {
            if (mixed) {
              setQuestions(null);
              setResult(null);
              setRound((n) => n + 1);
            } else start();
          }}
          cardsLink={packId ? `/pack/${packId}/cards` : '/review'}
        />
      ) : questions ? (
        <QuizRunner key={JSON.stringify(questions.map((q) => q.id + q.packId))} questions={questions} onFinish={finish} label={(q) => (mixed ? q.packTitle : chunks[q.chunk]?.title)} />
      ) : mixed ? (
        <Loading />
      ) : (
        <div className="sheet stack">
          <p className="muted" style={{ margin: 0 }}>
            Testing yourself is one of the strongest ways to remember. Wrong answers are useful: those lessons’ flashcards move to the front of your queue.
          </p>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              How many questions?
            </div>
            <div className="segmented" role="group" aria-label="Number of questions">
              {COUNTS.map((c) => (
                <button key={c} aria-pressed={count === c} onClick={() => setCount(c)}>
                  {c || `All ${pool.length}`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              Which lessons?
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="chip" aria-pressed={!selected.length} onClick={() => setSelected([])}>
                All lessons
              </button>
              {chunks.map((c) => (
                <button key={c.index} className="chip" aria-pressed={selected.includes(c.index)} onClick={() => setSelected((s) => (s.includes(c.index) ? s.filter((x) => x !== c.index) : [...s, c.index]))}>
                  {c.index + 1}. {c.title.length > 28 ? `${c.title.slice(0, 27)}…` : c.title}
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary big" onClick={() => start()} disabled={!pool.length}>
            {pool.length ? 'Start quiz' : 'No questions for these lessons'}
          </button>
        </div>
      )}
    </div>
  );
}

function Results({
  result,
  chunkTitle,
  lessonLink,
  onRetryWrong,
  onNew,
  cardsLink,
}: {
  result: QuizResult;
  chunkTitle: (q: RunnerQuestion) => string | undefined;
  lessonLink: (q: RunnerQuestion) => string;
  onRetryWrong: () => void;
  onNew: () => void;
  cardsLink: string;
}) {
  const pct = Math.round((result.score / result.total) * 100);
  const wrong = result.answers.filter((a) => !a.correct);
  const msg = pct >= 90 ? 'Excellent. You know this well.' : pct >= 70 ? 'Good work. A little more practice and you have it.' : pct >= 50 ? 'Getting there. Go over the ones you missed.' : 'This needs more work. Re-read the lessons below, then try again.';
  return (
    <div className="stack">
      <div className="sheet row" style={{ gap: 20 }}>
        <Ring value={pct} size={96} stroke={9} color={pct >= 70 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)'} />
        <div>
          <h2 style={{ marginBottom: 4 }}>
            {result.score} out of {result.total}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {msg}
          </p>
        </div>
      </div>
      <div className="row">
        {wrong.length > 0 && (
          <button className="btn primary" onClick={onRetryWrong}>
            <RotateCcw size={18} /> Retry the {wrong.length} I missed
          </button>
        )}
        <button className="btn" onClick={onNew}>
          New quiz
        </button>
        {wrong.length > 0 && (
          <Link to={cardsLink} className="btn">
            Review flashcards
          </Link>
        )}
      </div>
      {wrong.length > 0 && (
        <div className="sheet">
          <h3>What you missed</h3>
          {wrong.map((a, k) => (
            <div key={k} className="point-check">
              <X size={18} color="var(--bad)" />
              <div>
                <div style={{ fontWeight: 500 }}>{a.q.prompt}</div>
                <div className="small muted">You said: {a.given || '—'}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  {a.q.explanation}
                </div>
                <Link to={lessonLink(a.q)} className="small">
                  Re-read: {chunkTitle(a.q)}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
