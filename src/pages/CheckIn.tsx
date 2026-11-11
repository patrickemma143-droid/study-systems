// Check-ins: the ideas from earlier lessons that are due to be checked again (weak ones the next day,
// shaky ones in a few days, secure ones after a week or two). Each comes back with its own question —
// no AI, no cost — and what the student does moves it up or down their learning map.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check as Tick, RotateCcw, Sparkles, X as Cross } from 'lucide-react';
import { api } from '../api';
import { Loading } from '../components/ui';
import type { Check } from '../../shared/tutor';

interface Due {
  id: number;
  concept: string;
  topic: string;
  status: string;
  lessonId: number | null;
  check: Check;
}

export default function CheckIn() {
  const [due, setDue] = useState<Due[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [guess, setGuess] = useState(false);
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState(false);
  const [results, setResults] = useState<{ d: Due; ok: boolean }[]>([]);

  useEffect(() => {
    api<{ due: Due[]; summary: Record<string, number> }>('/mastery/checkins')
      .then((r) => {
        setDue(r.due);
        setSummary(r.summary);
      })
      .catch(() => setDue([]));
  }, []);

  if (!due) return <Loading />;
  const d = due[i];

  function record(ok: boolean) {
    if (!d) return;
    void api(`/mastery/checkins/${d.id}`, { body: { correct: ok, guessed: guess } }).catch(() => {});
    setResults((r) => [...r, { d, ok }]);
  }
  function next() {
    setI((n) => n + 1);
    setChosen(null);
    setGuess(false);
    setTyped('');
    setShown(false);
  }

  if (!due.length) {
    return (
      <div className="sheet empty checkin">
        <Sparkles size={30} color="var(--biro)" style={{ margin: '0 auto 10px' }} />
        <h2>Nothing to check right now</h2>
        <p className="muted">
          Ideas from your lessons come back here a day or a few days later, so you keep them. {summary.got ? `${summary.got} ideas are secure on your learning map.` : ''}
        </p>
        <Link to="/home" className="btn primary">
          Home
        </Link>
      </div>
    );
  }

  if (!d) {
    const kept = results.filter((r) => r.ok).length;
    const missed = results.filter((r) => !r.ok);
    return (
      <div className="sheet checkin">
        <h2>
          <Sparkles size={20} /> {kept} of {results.length} still remembered
        </h2>
        <p className="muted">{kept === results.length ? 'Every one — these are moving into long-term memory.' : 'The ones you missed come back for another check soon — or go over them with the tutor now.'}</p>
        {missed.length > 0 && (
          <ul className="checkin-missed">
            {missed.map(({ d: m }) => (
              <li key={m.id}>
                <span>
                  <strong>{m.concept}</strong> <span className="small muted">· {m.topic}</span>
                </span>
                {m.lessonId && (
                  <Link to={`/tutor/${m.lessonId}`} className="btn small">
                    Go over it with the tutor
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link to="/home" className="btn primary">
          Done
        </Link>
      </div>
    );
  }

  const open = d.check.kind === 'open' || !d.check.options.length;
  const answered = open ? shown : chosen !== null;
  return (
    <div className="sheet checkin">
      <div className="checkin-top">
        <span className="small muted">
          Check-in {i + 1} of {due.length} · {d.topic}
        </span>
        <div className="checkin-bar">
          <span style={{ width: `${(i / due.length) * 100}%` }} />
        </div>
      </div>
      <p className="checkin-concept">{d.concept}</p>
      <h2 className="checkin-q">{d.check.q}</h2>
      {!open ? (
        <div className="checkin-opts">
          {d.check.options.map((o, k) => {
            const right = chosen !== null && k === d.check.answer;
            const wrong = chosen === k && k !== d.check.answer;
            return (
              <button
                key={k}
                className={`checkin-opt ${right ? 'right' : ''} ${wrong ? 'wrong' : ''}`}
                disabled={chosen !== null}
                onClick={() => {
                  setChosen(k);
                  record(k === d.check.answer);
                }}
              >
                <span>{String.fromCharCode(65 + k)}</span> {o}
                {right && <Tick size={18} />}
                {wrong && <Cross size={18} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="input" rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Say it in your own words first — then check." disabled={shown} />
          {shown ? (
            <div className="checkin-model">
              <strong>A good answer:</strong> {d.check.model || d.check.explain}
            </div>
          ) : (
            <button className="btn" onClick={() => setShown(true)}>
              Show a good answer
            </button>
          )}
        </div>
      )}
      {!answered && (
        <button className={`b-guess ${guess ? 'on' : ''}`} aria-pressed={guess} onClick={() => setGuess((g) => !g)}>
          {guess ? '✓ I’m guessing' : 'Not sure? Tap “I’m guessing” first'}
        </button>
      )}
      {answered && !open && d.check.explain && <p className="muted">{d.check.explain}</p>}
      {open && shown && results.length === i && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => record(true)}>
            <Tick size={16} /> I had it
          </button>
          <button className="btn" onClick={() => record(false)}>
            <RotateCcw size={16} /> Not quite
          </button>
        </div>
      )}
      {results.length > i && (
        <button className="btn primary" onClick={next}>
          {i + 1 < due.length ? 'Next' : 'See how I did'}
        </button>
      )}
    </div>
  );
}
