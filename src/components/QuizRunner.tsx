import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react';
import type { QuizQuestion } from '@shared/engine/types';
import { answerMatches, shuffle } from '@shared/engine/text';
import { Bar } from './ui';

export type RunnerQuestion = QuizQuestion & { packId?: number; packTitle?: string };
export interface QuizResult {
  score: number;
  total: number;
  answers: { q: RunnerQuestion; correct: boolean; given: string }[];
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuizRunner({ questions, onFinish, label }: { questions: RunnerQuestion[]; onFinish: (r: QuizResult) => void; label?: (q: RunnerQuestion) => string | undefined }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<QuizResult['answers']>([]);
  const [picked, setPicked] = useState<number | boolean | null>(null);
  const [typed, setTyped] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const q = questions[i];

  useEffect(() => {
    setPicked(null);
    setTyped('');
    setChecked(false);
    setCorrect(false);
    if (q?.type === 'order') {
      let s = shuffle(q.items);
      for (let k = 0; k < 5 && s.every((x, j) => x === q.items[j]); k++) s = shuffle(q.items);
      setOrder(s);
    }
  }, [i, q]);

  useEffect(() => {
    if (checked) nextBtn.current?.focus();
  }, [checked]);

  const score = answers.filter((a) => a.correct).length;

  function record(ok: boolean, given: string) {
    setCorrect(ok);
    setChecked(true);
    setAnswers((a) => [...a, { q, correct: ok, given }]);
  }

  function next() {
    if (i + 1 >= questions.length) {
      onFinish({ score: answers.filter((a) => a.correct).length, total: questions.length, answers });
    } else setI(i + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      if (!checked && q?.type === 'mcq') {
        const n = Number(e.key);
        if (n >= 1 && n <= q.options.length) {
          setPicked(n - 1);
          record(n - 1 === q.answer, q.options[n - 1]);
        }
      }
      if (!checked && q?.type === 'tf' && (e.key === 't' || e.key === 'f')) {
        const v = e.key === 't';
        setPicked(v);
        record(v === q.answer, v ? 'True' : 'False');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const orderCorrect = useMemo(() => (q?.type === 'order' ? order.map((x, k) => x === q.items[k]) : []), [order, q]);

  if (!q) return null;
  const extra = label?.(q);

  return (
    <div>
      <div className="row between small muted" style={{ marginBottom: 8 }}>
        <span>
          Question {i + 1} of {questions.length}
          {extra ? `, ${extra}` : ''}
        </span>
        <span>
          {score} correct so far
        </span>
      </div>
      <div style={{ marginBottom: 18 }}>
        <Bar value={(i / questions.length) * 100} />
      </div>

      <div className="sheet">
        <div className="small muted" style={{ marginBottom: 6 }}>
          {q.type === 'mcq' ? 'Choose one' : q.type === 'tf' ? 'True or false?' : q.type === 'fill' ? 'Type the missing word or words' : 'Put these in the right order'}
        </div>
        <div className="question">{q.prompt}</div>

        {q.type === 'mcq' && (
          <div className="options">
            {q.options.map((o, k) => {
              const state = checked ? (k === q.answer ? 'correct' : k === picked ? 'wrong' : '') : '';
              return (
                <button
                  key={k}
                  className={`option ${state}`}
                  disabled={checked}
                  onClick={() => {
                    setPicked(k);
                    record(k === q.answer, o);
                  }}
                >
                  <span className="letter">{LETTERS[k]}</span>
                  <span>{o}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.type === 'tf' && (
          <div className="grid cols-2" style={{ gap: 10 }}>
            {[true, false].map((v) => {
              const state = checked ? (v === q.answer ? 'correct' : v === picked ? 'wrong' : '') : '';
              return (
                <button
                  key={String(v)}
                  className={`option ${state}`}
                  style={{ justifyContent: 'center', fontWeight: 600 }}
                  disabled={checked}
                  onClick={() => {
                    setPicked(v);
                    record(v === q.answer, v ? 'True' : 'False');
                  }}
                >
                  {v ? 'True' : 'False'}
                </button>
              );
            })}
          </div>
        )}

        {q.type === 'fill' && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!checked && typed.trim()) record(answerMatches(typed, q.accept), typed);
            }}
          >
            <input className="input" style={{ flex: 1, minWidth: 200 }} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={checked} placeholder="Your answer" autoFocus aria-label="Your answer" />
            {!checked && (
              <button className="btn primary" disabled={!typed.trim()}>
                Check
              </button>
            )}
          </form>
        )}

        {q.type === 'order' && (
          <div className="stack">
            {order.map((item, k) => (
              <div key={item} className={`order-item ${checked ? (orderCorrect[k] ? 'option correct' : 'option wrong') : ''}`}>
                <span className="letter" style={{ width: 26, textAlign: 'center', fontWeight: 600 }}>
                  {k + 1}
                </span>
                <span className="grow">{item}</span>
                {!checked && (
                  <>
                    <button className="btn icon small" disabled={k === 0} onClick={() => setOrder((o) => swap(o, k, k - 1))} aria-label={`Move ${item} up`}>
                      <ArrowUp size={16} />
                    </button>
                    <button className="btn icon small" disabled={k === order.length - 1} onClick={() => setOrder((o) => swap(o, k, k + 1))} aria-label={`Move ${item} down`}>
                      <ArrowDown size={16} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {!checked && (
              <button className="btn primary" onClick={() => record(orderCorrect.every(Boolean), order.join(' → '))}>
                Check my order
              </button>
            )}
          </div>
        )}

        {checked && (
          <div className={`feedback ${correct ? 'good' : 'bad'}`} role="status">
            <div className="row" style={{ gap: 8, fontWeight: 600, marginBottom: 4 }}>
              {correct ? <Check size={18} color="var(--good)" /> : <X size={18} color="var(--bad)" />}
              {correct ? 'Correct' : q.type === 'fill' ? `Not quite. The answer is “${q.answer}”.` : 'Not quite'}
            </div>
            <div className="small">{q.explanation}</div>
          </div>
        )}
      </div>

      {checked && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button ref={nextBtn} className="btn primary big" onClick={next}>
            {i + 1 >= questions.length ? 'See my results' : 'Next question'}
          </button>
        </div>
      )}
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const c = arr.slice();
  [c[a], c[b]] = [c[b], c[a]];
  return c;
}
