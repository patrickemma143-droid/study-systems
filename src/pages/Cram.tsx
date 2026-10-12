import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Clock, Moon, RotateCcw, X, Zap } from 'lucide-react';
import type { CardSeed } from '@shared/engine/types';
import { checkRecall, type RecallCheck } from '@shared/engine/recall';
import { shuffle } from '@shared/engine/text';
import { api } from '../api';
import { QuizRunner, type QuizResult } from '../components/QuizRunner';
import { RecallResult } from '../components/RecallResult';
import { Crumbs, ErrorState, Loading, useCountdown } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';
import { daysUntil, formatClock } from '../lib/util';
import { SheetBody } from './CheatSheet';

type StepId = 'sheet' | 'cards' | 'quiz' | 'blurt' | 'mistakes';
interface Plan {
  minutes: number;
  share: number; // fraction of most-examinable lessons to cover
  cards: number;
  questions: number;
  steps: { id: StepId; label: string; min: number }[];
}

const PLANS: Plan[] = [
  { minutes: 15, share: 0.4, cards: 12, questions: 5, steps: [{ id: 'sheet', label: 'Read the cheat sheet', min: 5 }, { id: 'cards', label: 'Quick-fire flashcards', min: 6 }, { id: 'quiz', label: 'Quick quiz', min: 3 }, { id: 'mistakes', label: 'Go over mistakes', min: 1 }] },
  { minutes: 30, share: 0.65, cards: 24, questions: 10, steps: [{ id: 'sheet', label: 'Read the cheat sheet', min: 8 }, { id: 'cards', label: 'Quick-fire flashcards', min: 12 }, { id: 'quiz', label: 'Practice quiz', min: 8 }, { id: 'mistakes', label: 'Go over mistakes', min: 2 }] },
  { minutes: 60, share: 1, cards: 40, questions: 15, steps: [{ id: 'sheet', label: 'Read the cheat sheet', min: 15 }, { id: 'cards', label: 'Quick-fire flashcards', min: 20 }, { id: 'quiz', label: 'Practice quiz', min: 15 }, { id: 'blurt', label: 'Blurt what you remember', min: 6 }, { id: 'mistakes', label: 'Go over mistakes', min: 4 }] },
];

function RapidCards({ cards, onDone }: { cards: CardSeed[]; onDone: (missed: CardSeed[]) => void }) {
  const [queue, setQueue] = useState(cards);
  const [pos, setPos] = useState(0);
  const [flip, setFlip] = useState(false);
  const [missed, setMissed] = useState<CardSeed[]>([]);
  const card = queue[pos];
  if (!card) {
    return (
      <div className="sheet empty">
        <Check size={34} color="var(--good)" style={{ margin: '0 auto 8px' }} />
        <h2>Cards done</h2>
        <p className="muted">{missed.length ? `${missed.length} to look at again in the mistakes step.` : 'You knew them all.'}</p>
        <button className="btn primary" onClick={() => onDone(missed)}>
          Next step
        </button>
      </div>
    );
  }
  const answer = (ok: boolean) => {
    if (!ok) {
      setMissed((m) => (m.includes(card) ? m : [...m, card]));
      if (!queue.slice(pos + 1).includes(card)) setQueue((q) => [...q, card]);
    }
    setFlip(false);
    setPos((p) => p + 1);
  };
  return (
    <div>
      <div className="small muted" style={{ textAlign: 'center', marginBottom: 8 }}>
        {pos + 1} of {queue.length}
      </div>
      <div className="card-stage">
        <div className={`flashcard ${flip ? 'flipped' : ''}`} onClick={() => setFlip((f) => !f)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setFlip((f) => !f))}>
          <div className="face front">
            <div className="content">{card.front}</div>
            <div className="tap">Tap to flip</div>
          </div>
          <div className="face back">
            <div className="content">{card.back}</div>
          </div>
        </div>
      </div>
      {flip && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn big" style={{ color: 'var(--bad)' }} onClick={() => answer(false)}>
            <X size={18} /> Not yet
          </button>
          <button className="btn primary big" onClick={() => answer(true)}>
            <Check size={18} /> Got it
          </button>
        </div>
      )}
    </div>
  );
}

export default function Cram() {
  const id = Number(useParams().id);
  const { data, error } = usePack(id);
  useStudyTimer('cram', id);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [step, setStep] = useState(0);
  const [missedCards, setMissedCards] = useState<CardSeed[]>([]);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [blurt, setBlurt] = useState('');
  const [blurtCheck, setBlurtCheck] = useState<RecallCheck | null>(null);

  const scope = useMemo(() => {
    if (!data || !plan) return null;
    const ranked = [...data.pack.data.chunks].sort((a, b) => b.importance - a.importance);
    const keep = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * plan.share))).map((c) => c.index);
    const order: Record<string, number> = { definition: 0, list: 1, cloze: 2, reverse: 3 };
    const cards = data.pack.data.cards
      .filter((c) => keep.includes(c.chunk))
      .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))
      .slice(0, plan.cards);
    const questions = shuffle(data.pack.data.quiz.filter((q) => keep.includes(q.chunk))).slice(0, plan.questions);
    return { keep, cards: shuffle(cards), questions };
  }, [data, plan]);

  const current = plan?.steps[step];
  const left = useCountdown((current?.min || 1) * 60, !!current && current.id !== 'mistakes');

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const d = daysUntil(data.pack.examDate);
  const next = () => setStep((s) => s + 1);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Cram plan' }]} />

      {!plan ? (
        <>
          <h1>Cram plan</h1>
          <p className="muted" style={{ maxWidth: 640 }}>
            {d === 0 ? 'Your exam is today. ' : d === 1 ? 'Your exam is tomorrow. ' : ''}
            Choose how much time you have. We focus on the lessons most likely to be examined — the ones full of definitions and lists — and guide you step by step.
          </p>
          <div className="grid cols-3" style={{ marginTop: 18 }}>
            {PLANS.map((p) => (
              <button key={p.minutes} className="sheet" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)' }} onClick={() => { setPlan(p); setStep(0); }}>
                <div className="row" style={{ gap: 8 }}>
                  <Clock size={20} color="var(--biro)" />
                  <strong style={{ fontSize: '1.3rem' }}>{p.minutes} minutes</strong>
                </div>
                <ol style={{ margin: '12px 0 0', paddingLeft: 20 }} className="small">
                  {p.steps.map((s) => (
                    <li key={s.id} style={{ marginBottom: 4 }}>
                      {s.label} <span className="muted">({s.min} min)</span>
                    </li>
                  ))}
                </ol>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="row between" style={{ marginBottom: 14 }}>
            <h1 style={{ margin: 0 }}>
              <Zap size={26} style={{ display: 'inline', verticalAlign: '-4px', color: 'var(--warn)' }} /> {plan.minutes}-minute cram
            </h1>
            {current && current.id !== 'mistakes' && <span className={`timer-pill ${left > 0 ? 'running' : ''}`}>{left > 0 ? `${formatClock(left)} left for this step` : 'Time’s up — move on when ready'}</span>}
          </div>
          <ol className="steps" style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
            {plan.steps.map((s, i) => (
              <li key={s.id} className={`step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}>
                <b>{i < step ? <Check size={13} /> : i + 1}</b> {s.label}
              </li>
            ))}
          </ol>

          {current?.id === 'sheet' && scope && (
            <>
              <SheetBody d={data.pack.data} chunkFilter={scope.keep} examFirst />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn primary big" onClick={next}>
                  I’ve read it, next step
                </button>
              </div>
            </>
          )}
          {current?.id === 'cards' && scope && (
            <RapidCards
              cards={scope.cards}
              onDone={(m) => {
                setMissedCards(m);
                next();
              }}
            />
          )}
          {current?.id === 'quiz' && scope && (
            scope.questions.length ? (
              <QuizRunner
                questions={scope.questions}
                onFinish={(r) => {
                  setQuiz(r);
                  api('/study/quiz', { body: { packId: id, mode: 'cram', score: r.score, total: r.total, wrong: r.answers.filter((a) => !a.correct).map((a) => ({ packId: id, chunk: a.q.chunk })) } }).catch(() => {});
                  next();
                }}
              />
            ) : (
              <div className="sheet empty">
                <p className="muted">No quiz questions for these lessons.</p>
                <button className="btn primary" onClick={next}>Next step</button>
              </div>
            )
          )}
          {current?.id === 'blurt' && scope && (
            blurtCheck ? (
              <div className="stack">
                <RecallResult check={blurtCheck} />
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn primary big" onClick={next}>
                    Next step
                  </button>
                </div>
              </div>
            ) : (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  Without looking, write everything you remember. Lists, words, half-sentences — all of it counts.
                </p>
                <textarea className="textarea ruled" style={{ minHeight: 260 }} value={blurt} onChange={(e) => setBlurt(e.target.value)} autoFocus aria-label="Everything you remember" />
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button
                    className="btn primary big"
                    disabled={!blurt.trim()}
                    onClick={() => {
                      const cs = data.pack.data.chunks.filter((c) => scope.keep.includes(c.index));
                      setBlurtCheck(checkRecall(blurt, cs.flatMap((c) => c.keyPoints.slice(0, 3)), [...new Set(cs.flatMap((c) => c.keyTerms.slice(0, 3)))]));
                    }}
                  >
                    Compare with my notes
                  </button>
                </div>
              </div>
            )
          )}
          {(current?.id === 'mistakes' || !current) && (
            <div className="stack">
              {missedCards.length === 0 && (!quiz || quiz.answers.every((a) => a.correct)) ? (
                <div className="sheet">
                  <h2>No mistakes to review</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    Strong work. Skim the cheat sheet once more just before the exam.
                  </p>
                </div>
              ) : (
                <div className="sheet">
                  <h2>Look at these once more</h2>
                  {missedCards.map((c, i) => (
                    <div key={`c${i}`} className="point-check">
                      <X size={18} color="var(--bad)" />
                      <div>
                        <div style={{ fontWeight: 500 }}>{c.front}</div>
                        <div className="small" style={{ whiteSpace: 'pre-line' }}>
                          {c.back}
                        </div>
                      </div>
                    </div>
                  ))}
                  {quiz?.answers
                    .filter((a) => !a.correct)
                    .map((a, i) => (
                      <div key={`q${i}`} className="point-check">
                        <X size={18} color="var(--bad)" />
                        <div>
                          <div style={{ fontWeight: 500 }}>{a.q.prompt}</div>
                          <div className="small">{a.q.explanation}</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              <div className="callout">
                <Moon size={22} />
                <div className="small">
                  <strong>Before the exam:</strong> sleep at least 6 hours if you can — sleep is when your brain saves what you studied. In the morning, read the cheat sheet once more and do one quick quiz.
                </div>
              </div>
              <div className="row">
                <button className="btn" onClick={() => { setPlan(null); setStep(0); setQuiz(null); setMissedCards([]); setBlurt(''); setBlurtCheck(null); }}>
                  <RotateCcw size={18} /> New cram plan
                </button>
                <Link to={`/pack/${id}/sheet`} className="btn">
                  Open the cheat sheet
                </Link>
                <Link to={`/pack/${id}`} className="btn primary">
                  Finish
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
