import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlarmClock, Check, Coffee, Moon, RotateCcw, Sparkles, X, Zap } from 'lucide-react';
import type { CardSeed } from '@shared/engine/types';
import { checkRecall, type RecallCheck } from '@shared/engine/recall';
import { shuffle } from '@shared/engine/text';
import { api } from '../api';
import { QuizRunner, type QuizResult } from '../components/QuizRunner';
import { RecallResult } from '../components/RecallResult';
import { Crumbs, ErrorState, Loading, useCountdown } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';
import { daysUntil, formatClock, save, store } from '../lib/util';
import { buildCramPlan, hoursUntil, LEVELS, suggestLevel, type CramPlan, type Level } from '../lib/cram';
import { Highlighted } from '../components/Highlighted';
import { SheetBody } from './CheatSheet';

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
  const [level, setLevel] = useState<Level | null>(null);
  const [bedtime, setBedtime] = useState<string>(() => store('cs-bedtime', '23:00'));
  const [minutes, setMinutes] = useState<number | null>(null);
  const [plan, setPlan] = useState<CramPlan | null>(null);
  const [step, setStep] = useState(0);
  const [missedCards, setMissedCards] = useState<CardSeed[]>([]);
  const [quizWrong, setQuizWrong] = useState<QuizResult['answers']>([]);
  const [blurt, setBlurt] = useState('');
  const [blurtCheck, setBlurtCheck] = useState<RecallCheck | null>(null);

  useEffect(() => {
    save('cs-bedtime', bedtime);
  }, [bedtime]);

  const understood = useMemo(() => new Set(data ? Object.entries(data.progress).filter(([, p]) => p.status === 'understood' || p.status === 'mastered').map(([k]) => Number(k)) : []), [data]);
  const d = data ? daysUntil(data.pack.examDate) : null;
  const total = data?.pack.data.chunks.length || 0;
  const suggested = suggestLevel(d, total ? understood.size / total : 0);
  const chosen = level || suggested;
  const hoursLeft = Math.max(0.25, hoursUntil(bedtime));
  const defaultMinutes = chosen === 'extreme' || chosen === 'intense' ? Math.max(30, Math.min(300, Math.floor((hoursLeft * 60) / 30) * 30)) : chosen === 'steady' ? 60 : 45;
  const mins = minutes ?? defaultMinutes;
  const preview = useMemo(() => (data ? buildCramPlan(chosen, data.pack.data.chunks, mins, understood) : null), [data, chosen, mins, understood]);

  const current = plan?.steps[step];
  const timed = !!current && current.id !== 'mistakes';
  const left = useCountdown((current?.min || 1) * 60, timed);

  const stepScope = useMemo(() => {
    if (!data || !current) return null;
    const keep = current.lessons;
    const order: Record<string, number> = { definition: 0, list: 1, concept: 2, cloze: 3, reverse: 4 };
    const cards = shuffle(
      data.pack.data.cards
        .filter((c) => keep.includes(c.chunk))
        .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))
        .slice(0, current.cards || 20),
    );
    const questions = shuffle(data.pack.data.quiz.filter((q) => keep.includes(q.chunk))).slice(0, current.questions || 8);
    return { keep, cards, questions };
  }, [data, current]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const next = () => setStep((s) => s + 1);
  const title = (i: number) => data.pack.data.chunks[i]?.title || `Lesson ${i + 1}`;
  const reset = () => {
    setPlan(null);
    setStep(0);
    setQuizWrong([]);
    setMissedCards([]);
    setBlurt('');
    setBlurtCheck(null);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Cram plan' }]} />

      {!plan ? (
        <>
          <h1>Cram plan</h1>
          <p className="muted" style={{ maxWidth: 680 }}>
            {d === null ? 'Add your exam date on the pack page and we’ll pick the right level for you. ' : d < 0 ? '' : d === 0 ? 'Your paper is today. ' : d === 1 ? 'Your paper is tomorrow. ' : `Your paper is in ${d} days. `}
            You understand {understood.size} of {total} lessons. Pick how hard to push; we suggest a level from your exam date and progress.
          </p>

          <div className="cram-levels" role="radiogroup" aria-label="Cram level">
            {(Object.keys(LEVELS) as Level[]).map((l) => (
              <button key={l} role="radio" aria-checked={chosen === l} className={`cram-level ${chosen === l ? 'on' : ''}`} style={{ ['--tone' as any]: LEVELS[l].tone }} onClick={() => { setLevel(l); setMinutes(null); }}>
                <span className="row between" style={{ width: '100%' }}>
                  <strong>{LEVELS[l].name}</strong>
                  {l === suggested && <span className="chip" style={{ padding: '0 8px', fontSize: '0.72rem' }}>Suggested</span>}
                </span>
                <span className="small muted">{LEVELS[l].when}</span>
                <span className="small">{LEVELS[l].blurb}</span>
              </button>
            ))}
          </div>

          <div className="sheet stack" style={{ marginTop: 18 }}>
            <div className="row between">
              <strong>How much time do you have now?</strong>
              {(chosen === 'extreme' || chosen === 'intense') && (
                <label className="row small" style={{ gap: 6 }}>
                  <Moon size={15} /> I’ll sleep at
                  <input type="time" className="input" value={bedtime} onChange={(e) => { setBedtime(e.target.value || '23:00'); setMinutes(null); }} style={{ width: 'auto', minHeight: 34, padding: '2px 8px' }} aria-label="Bedtime" />
                </label>
              )}
            </div>
            <div className="row" style={{ gap: 6 }}>
              {[15, 30, 45, 60, 90, 120, 180, 240, 300].map((m) => (
                <button key={m} className="chip" aria-pressed={mins === m} onClick={() => setMinutes(m)}>
                  {m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`}
                </button>
              ))}
            </div>
            {(chosen === 'extreme' || chosen === 'intense') && (
              <p className="hint" style={{ margin: 0 }}>
                {hoursLeft <= 0.25 ? 'It’s past your bedtime. Do a short plan, then sleep — a rested brain recalls far more than a tired one.' : hoursLeft < 1 ? 'It’s nearly bedtime. A short plan and good sleep beats an all-nighter.' : `About ${Math.floor(hoursLeft)} h ${Math.round((hoursLeft % 1) * 60)} min until bed. Sleep is when your brain saves what you studied — don’t skip it.`}
              </p>
            )}

            {preview && (
              <div className="grid cols-2" style={{ gap: 14, alignItems: 'start' }}>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>
                    Your plan, {preview.totalMin} min
                  </div>
                  <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
                    {preview.steps.map((st, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>
                        {st.label} <span className="muted">({st.min} min)</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>
                    Covering {preview.covered.length} of {total} lessons
                  </div>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {preview.covered.slice(0, 8).map((i) => (
                      <li key={i}>{title(i)}</li>
                    ))}
                    {preview.covered.length > 8 && <li className="muted">and {preview.covered.length - 8} more</li>}
                  </ul>
                  {preview.skipped.length > 0 && (
                    <p className="small muted" style={{ margin: '8px 0 0' }}>
                      Leaving out for now (less likely to be examined): {preview.skipped.map(title).join(', ')}.
                    </p>
                  )}
                </div>
              </div>
            )}
            <div>
              <button className="btn primary big" onClick={() => { if (preview) { setPlan(preview); setStep(0); } }}>
                <Zap size={18} /> Start {LEVELS[chosen].name.toLowerCase()} cram
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="row between" style={{ marginBottom: 14 }}>
            <h1 style={{ margin: 0 }}>
              <Zap size={26} style={{ display: 'inline', verticalAlign: '-4px', color: LEVELS[plan.level].tone }} /> {LEVELS[plan.level].name} cram
            </h1>
            {timed && <span className={`timer-pill ${left > 0 ? 'running' : ''}`}>{left > 0 ? `${formatClock(left)} left for this step` : 'Time’s up — move on when ready'}</span>}
          </div>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Step {Math.min(step + 1, plan.steps.length)} of {plan.steps.length}
          </div>
          <div className="meter" style={{ marginBottom: 18 }}>
            <span style={{ width: `${(step / plan.steps.length) * 100}%` }} />
          </div>
          {current && <h2 style={{ fontSize: '1.2rem' }}>{current.label}</h2>}

          {current?.id === 'learn' && <LearnStep key={step} lessons={current.lessons.map((i) => data.pack.data.chunks[i]).filter(Boolean)} glossary={data.pack.data.glossary} onDone={next} />}
          {current?.id === 'break' && (
            <div className="sheet empty">
              <Coffee size={36} color="var(--biro)" style={{ margin: '0 auto 8px' }} />
              <h2>Break time</h2>
              <p className="muted">Stand up, stretch, drink water. Stay off social media — it pushes out what you just learnt.</p>
              <button className="btn primary" onClick={next}>
                I’m back, next sprint
              </button>
            </div>
          )}
          {current?.id === 'sheet' && stepScope && (
            <>
              <SheetBody d={data.pack.data} chunkFilter={stepScope.keep} examFirst />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn primary big" onClick={next}>
                  I’ve read it, next step
                </button>
              </div>
            </>
          )}
          {current?.id === 'cards' && stepScope && (
            stepScope.cards.length ? (
              <RapidCards
                key={step}
                cards={stepScope.cards}
                onDone={(m) => {
                  setMissedCards((prev) => [...prev, ...m.filter((x) => !prev.includes(x))]);
                  next();
                }}
              />
            ) : (
              <div className="sheet empty">
                <p className="muted">No flashcards for these lessons.</p>
                <button className="btn primary" onClick={next}>Next step</button>
              </div>
            )
          )}
          {current?.id === 'quiz' && stepScope && (
            stepScope.questions.length ? (
              <QuizRunner
                key={step}
                questions={stepScope.questions}
                onFinish={(r) => {
                  setQuizWrong((w) => [...w, ...r.answers.filter((a) => !a.correct)]);
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
          {current?.id === 'blurt' && stepScope && (
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
                      const cs = data.pack.data.chunks.filter((c) => stepScope.keep.includes(c.index));
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
              {missedCards.length === 0 && quizWrong.length === 0 ? (
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
                  {quizWrong.map((a, i) => (
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
              {plan.level === 'extreme' || plan.level === 'intense' ? (
                <div className="callout">
                  <AlarmClock size={22} />
                  <div className="small">
                    <strong>Now sleep.</strong> Six hours or more if you can; sleep is when your brain stores tonight’s work. <strong>Tomorrow morning</strong>, give 20 minutes to the cheat sheet for the {plan.covered.length} lessons you covered, then one quick quiz. Eat something before the paper.
                  </div>
                </div>
              ) : (
                <div className="callout">
                  <Moon size={22} />
                  <div className="small">
                    <strong>Before the exam:</strong> sleep at least 6 hours if you can — sleep is when your brain saves what you studied. In the morning, read the cheat sheet once more and do one quick quiz.
                  </div>
                </div>
              )}
              <div className="row">
                <button className="btn" onClick={reset}>
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

/** Fast teaching for crams: gist, key points and key words, one lesson at a time. */
function LearnStep({ lessons, glossary, onDone }: { lessons: import('@shared/engine/types').Chunk[]; glossary: import('@shared/engine/types').Definition[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const c = lessons[i];
  if (!c) return null;
  const terms = c.keyTerms.map((t) => ({ term: t, definition: glossary.find((g) => g.term.toLowerCase() === t.toLowerCase())?.definition }));
  const last = i >= lessons.length - 1;
  return (
    <div className="stack">
      <div className="small muted">
        Lesson {i + 1} of {lessons.length}
      </div>
      <div className="sheet" style={{ borderLeft: '6px solid var(--hl-yellow)' }}>
        <h3 style={{ marginTop: 0 }}>{c.title}</h3>
        <p style={{ fontWeight: 500, fontSize: '1.08rem' }}>
          <Highlighted text={c.nutshell} terms={terms} />
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {c.keyPoints.slice(0, 5).map((p, k) => (
            <li key={k} style={{ marginBottom: 8 }}>
              <Highlighted text={p} terms={terms} />
            </li>
          ))}
        </ol>
        {terms.some((t) => t.definition) && (
          <div style={{ marginTop: 12 }}>
            <div className="label">Words to know</div>
            {terms
              .filter((t) => t.definition)
              .slice(0, 5)
              .map((t) => (
                <div key={t.term} className="small" style={{ padding: '4px 0' }}>
                  <mark>{t.term}</mark>: {t.definition}
                </div>
              ))}
          </div>
        )}
      </div>
      <div className="callout" style={{ background: 'var(--paper-2)' }}>
        <Sparkles size={18} />
        <div className="small">Before you move on, cover the screen and say the main idea out loud in one sentence.</div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary big" onClick={() => (last ? onDone() : setI(i + 1))}>
          {last ? 'Done, test me' : 'Got it, next lesson'}
        </button>
      </div>
    </div>
  );
}
