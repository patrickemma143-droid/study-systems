import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, Crown, Share2, Swords, Timer, XCircle } from 'lucide-react';
import { api } from '../api';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';

type Q = { i: number; type: 'mcq' | 'tf' | 'fill'; prompt: string; options?: string[] };
interface Side {
  name: string;
  score: number | 'played' | null;
  ms: number | null;
  ready?: boolean;
  answered?: number;
  correct?: number;
}
interface BattleView {
  code: string;
  title: string;
  level: 'easy' | 'medium' | 'hard';
  count: number;
  status: 'open' | 'done';
  expired: boolean;
  you: 'creator' | 'opponent' | null;
  creator: Side;
  opponent: Side | null;
  questions: Q[];
  review: { prompt: string; yours: string; right: string; ok: boolean; explanation: string }[];
  winner: 'creator' | 'opponent' | null;
  live?: boolean;
  startAt?: number | null;
  serverNow?: number;
  answered?: number;
  secondsPerQuestion?: number;
}

const SECONDS = 20;
const secs = (ms: number | null) => (ms == null ? '' : `${Math.round(ms / 1000)} s`);

export default function Battle() {
  const code = String(useParams().code || '').toUpperCase();
  const toast = useToast();
  const [b, setB] = useState<BattleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | boolean | string | null)[]>([]);
  const [typed, setTyped] = useState('');
  const [left, setLeft] = useState(SECONDS);
  const started = useRef(0);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api<BattleView>(`/battles/${code}`)
      .then(setB)
      .catch((e) => setError(e.message));
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);
  // waiting for the other player: check every few seconds
  const waiting = !!b && b.status === 'open' && !playing && b.you !== null && b.questions.length === 0;
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [waiting, load]);

  const submit = useCallback(
    async (final: (number | boolean | string | null)[]) => {
      setSending(true);
      try {
        const r = await api<BattleView>(`/battles/${code}/play`, { body: { answers: final, ms: Date.now() - started.current } });
        setB(r);
        setPlaying(false);
      } catch (e: any) {
        toast(e.message);
        load();
        setPlaying(false);
      } finally {
        setSending(false);
      }
    },
    [code, load, toast],
  );

  const answer = useCallback(
    (a: number | boolean | string | null) => {
      if (!b) return;
      const next = [...answers];
      next[idx] = a;
      setAnswers(next);
      setTyped('');
      if (idx + 1 >= b.questions.length) void submit(next);
      else {
        setIdx(idx + 1);
        setLeft(SECONDS);
      }
    },
    [answers, b, idx, submit],
  );

  // a clock for each question; time up counts as no answer
  useEffect(() => {
    if (!playing || sending) return;
    if (left <= 0) {
      answer(null);
      return;
    }
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [playing, left, sending, answer]);

  if (error) return <ErrorState message={error} action={<Link to="/home" className="btn">Home</Link>} />;
  if (!b) return <Loading />;
  if (b.live && b.status !== 'done') return <LiveBattle initial={b} onDone={setB} />;
  const link = `${location.origin}/battle/${b.code}`;
  const share = `I challenge you to a ${b.level} quiz battle on “${b.title}” on Charis Study! ${link}`;
  const copy = () => navigator.clipboard?.writeText(link).then(() => toast('Link copied.'), () => toast(link));

  if (playing) {
    const q = b.questions[idx];
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="small muted">
            Question {idx + 1} of {b.questions.length}
          </span>
          <span className={`chip ${left <= 5 ? 'exam' : ''}`}>
            <Timer size={14} /> {left}s
          </span>
        </div>
        <div className="meter" style={{ marginBottom: 14 }}>
          <span style={{ width: `${(idx / b.questions.length) * 100}%` }} />
        </div>
        <div className="sheet stack">
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{q.prompt}</h2>
          {q.type === 'mcq' && (
            <div className="stack">
              {q.options!.map((o, i) => (
                <button key={i} className="option" onClick={() => answer(i)} disabled={sending}>
                  <span className="letter">{'ABCD'[i]}</span> {o}
                </button>
              ))}
            </div>
          )}
          {q.type === 'tf' && (
            <div className="row">
              <button className="btn big" onClick={() => answer(true)} disabled={sending}>
                True
              </button>
              <button className="btn big" onClick={() => answer(false)} disabled={sending}>
                False
              </button>
            </div>
          )}
          {q.type === 'fill' && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                answer(typed.trim() || null);
              }}
            >
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Your answer" style={{ flex: 1 }} />
              <button className="btn primary">Next</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const canPlay = b.questions.length > 0 && !b.expired;
  const iWon = b.status === 'done' && b.winner === b.you;
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { label: 'Quiz battle' }]} />
      <h1 className="row">
        <Swords size={28} color="var(--biro)" /> Quiz battle
      </h1>
      <p className="muted">
        {b.count} {b.level} questions on “{b.title}”. Same questions for both players; most right wins, and if it’s a tie the faster player wins.
      </p>

      <div className="battle-board">
        {(['creator', 'opponent'] as const).map((side) => {
          const s = side === 'creator' ? b.creator : b.opponent;
          const won = b.winner === side;
          return (
            <div key={side} className={`sheet battle-side ${won ? 'won' : ''}`}>
              <div className="small muted">{side === 'creator' ? 'Challenger' : 'Opponent'}{b.you === side ? ' (you)' : ''}</div>
              <strong style={{ fontSize: '1.1rem' }}>
                {won && <Crown size={16} color="#e0a100" />} {s ? s.name : 'Waiting for a player…'}
              </strong>
              <div className="battle-score">{s?.score == null ? '–' : s.score === 'played' ? '✓' : `${s.score}/${b.count}`}</div>
              <div className="small muted">{s?.score === 'played' ? 'Played — result when you finish' : secs(s?.ms ?? null)}</div>
            </div>
          );
        })}
      </div>

      {b.status === 'done' && (
        <div className="callout" style={{ marginTop: 14 }}>
          <Crown size={22} />
          <div>
            <strong>{b.you ? (iWon ? 'You won! Points added to your Fast learner score.' : 'Good game! Review your misses below and ask for a rematch.') : 'This battle is over.'}</strong>
          </div>
        </div>
      )}

      {canPlay ? (
        <div className="sheet stack" style={{ marginTop: 14 }}>
          <strong>{b.you === 'creator' ? 'Play your round first, then send the link.' : `${b.creator.name} challenged you!`}</strong>
          <span className="small muted">{SECONDS} seconds per question. No going back.</span>
          <button
            className="btn primary big"
            onClick={() => {
              started.current = Date.now();
              setAnswers([]);
              setIdx(0);
              setLeft(SECONDS);
              setPlaying(true);
            }}
          >
            <Swords size={18} /> Start
          </button>
        </div>
      ) : b.expired ? (
        <div className="sheet" style={{ marginTop: 14 }}>
          This battle has expired.
        </div>
      ) : null}

      {b.you && b.status === 'open' && (
        <div className="sheet tight lib-banner" style={{ marginTop: 14 }}>
          <span className="small">{b.opponent ? `Waiting for ${b.you === 'creator' ? b.opponent.name : b.creator.name} to finish…` : 'Send this link to a classmate. The first person to open it plays against you.'}</span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={copy}>
              <Copy size={15} /> Copy link
            </button>
            <a className="btn small primary" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">
              <Share2 size={15} /> WhatsApp
            </a>
          </span>
        </div>
      )}

      {b.review.length > 0 && (
        <div className="sheet stack" style={{ marginTop: 18 }}>
          <strong>Your answers</strong>
          {b.review.map((r, i) => (
            <div key={i} className="point-check" style={{ display: 'block' }}>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                {r.ok ? <CheckCircle2 size={18} color="var(--good)" /> : <XCircle size={18} color="var(--bad)" />}
                <div>
                  <div>{r.prompt}</div>
                  <div className="small">
                    {r.ok ? (
                      <span>
                        You said <strong>{r.yours}</strong>.
                      </span>
                    ) : (
                      <span>
                        You said {r.yours}. Answer: <strong>{r.right}</strong>.
                      </span>
                    )}{' '}
                    <span className="muted">{r.explanation}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A live battle: both players in the room, a countdown, then the same question for both at once. */
function LiveBattle({ initial, onDone }: { initial: BattleView; onDone: (b: BattleView) => void }) {
  const toast = useToast();
  const [b, setB] = useState(initial);
  const [offset, setOffset] = useState(() => (initial.serverNow || Date.now()) - Date.now());
  const [nowMs, setNowMs] = useState(Date.now());
  const [idx, setIdx] = useState(initial.answered || 0);
  const [typed, setTyped] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; right: string } | null>(null);
  const [qStart, setQStart] = useState<number | null>(null);
  const busy = useRef(false);
  const per = (b.secondsPerQuestion || SECONDS) * 1000;
  const link = `${location.origin}/battle/${b.code}`;

  const refresh = useCallback(async () => {
    try {
      const r = await api<BattleView>(`/battles/${b.code}`);
      setOffset((r.serverNow || Date.now()) - Date.now());
      if (r.status === 'done') onDone(r);
      setB(r);
    } catch {
      /* try again on the next tick */
    }
  }, [b.code, onDone]);

  // the room updates itself: who joined, who is ready, the other player's score
  useEffect(() => {
    const t = window.setInterval(refresh, b.startAt ? 1500 : 2000);
    return () => window.clearInterval(t);
  }, [refresh, b.startAt]);
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const serverNow = nowMs + offset;
  const started = !!b.startAt && serverNow >= b.startAt;
  const finishedMine = idx >= b.count;
  const q = b.questions[idx];

  // each question gets its own clock
  useEffect(() => {
    if (started && !finishedMine) setQStart(Date.now());
  }, [started, idx, finishedMine]);

  const send = useCallback(
    async (answer: number | boolean | string | null) => {
      if (busy.current || finishedMine) return;
      busy.current = true;
      try {
        const r = await api<{ ok: boolean; right: string; battle: BattleView }>(`/battles/${b.code}/answer`, { body: { i: idx, answer } });
        setFeedback({ ok: r.ok, right: r.right });
        setB(r.battle);
        window.setTimeout(() => {
          setFeedback(null);
          setTyped('');
          setIdx((n) => n + 1);
          busy.current = false;
          if (r.battle.status === 'done') onDone(r.battle);
        }, 900);
      } catch (e: any) {
        busy.current = false;
        toast(e.message);
        refresh();
      }
    },
    [b.code, idx, finishedMine, onDone, refresh, toast],
  );

  const left = qStart == null ? per / 1000 : Math.max(0, Math.ceil((per - (nowMs - qStart)) / 1000));
  useEffect(() => {
    if (started && !finishedMine && !feedback && qStart != null && left <= 0) void send(null);
  }, [left, started, finishedMine, feedback, qStart, send]);

  async function join() {
    try {
      setB(await api<BattleView>(`/battles/${b.code}/join`, { body: {} }));
    } catch (e: any) {
      toast(e.message);
    }
  }
  async function ready() {
    try {
      setB(await api<BattleView>(`/battles/${b.code}/ready`, { body: {} }));
    } catch (e: any) {
      toast(e.message);
    }
  }

  const me = b.you;
  const other = me === 'creator' ? b.opponent : b.creator;
  const mine = me === 'creator' ? b.creator : b.opponent;
  const bars = (
    <div className="live-bars">
      {[
        { label: mine?.name ? `${mine.name} (you)` : 'You', s: mine },
        { label: other?.name || 'Waiting…', s: other },
      ].map(({ label, s }, i) => (
        <div key={i} className="live-bar">
          <div className="row between small">
            <span>{label}</span>
            <strong>
              {s?.correct ?? 0} right · {s?.answered ?? 0}/{b.count}
            </strong>
          </div>
          <div className="meter">
            <span style={{ width: `${((s?.answered ?? 0) / b.count) * 100}%`, background: i ? 'var(--hl-orange)' : undefined }} />
          </div>
        </div>
      ))}
    </div>
  );

  // not in the room yet
  if (!me) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }} className="stack">
        <h1 className="row">
          <Swords size={28} color="var(--biro)" /> Live quiz battle
        </h1>
        <p className="muted">
          {b.creator.name} wants to battle you live: {b.count} {b.level} questions on “{b.title}”, {b.secondsPerQuestion || SECONDS} seconds each.
        </p>
        {b.opponent ? <div className="sheet">This battle already has two players.</div> : b.expired ? <div className="sheet">This battle has expired.</div> : (
          <button className="btn primary big" onClick={join}>
            <Swords size={18} /> Join the battle
          </button>
        )}
      </div>
    );
  }

  // the lobby
  if (!b.startAt) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }} className="stack">
        <h1 className="row">
          <Swords size={28} color="var(--biro)" /> Live quiz battle
        </h1>
        <p className="muted">
          {b.count} {b.level} questions on “{b.title}”. When you’re both ready, it starts for both of you at the same moment.
        </p>
        <div className="battle-board">
          {(['creator', 'opponent'] as const).map((side) => {
            const s = side === 'creator' ? b.creator : b.opponent;
            return (
              <div key={side} className={`sheet battle-side ${s?.ready ? 'won' : ''}`}>
                <div className="small muted">{side === b.you ? 'You' : side === 'creator' ? 'Challenger' : 'Opponent'}</div>
                <strong>{s ? s.name : 'Waiting for someone to join…'}</strong>
                <div className="small" style={{ marginTop: 6 }}>
                  {s ? (s.ready ? '✓ Ready' : 'Not ready yet') : ''}
                </div>
              </div>
            );
          })}
        </div>
        {!b.opponent && (
          <div className="sheet tight lib-banner">
            <span className="small">Send this link to a classmate who is free now.</span>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={() => navigator.clipboard?.writeText(link).then(() => toast('Link copied.'), () => toast(link))}>
                <Copy size={15} /> Copy link
              </button>
              <a className="btn small primary" href={`https://wa.me/?text=${encodeURIComponent(`Live quiz battle on “${b.title}” — join me now on Charis Study: ${link}`)}`} target="_blank" rel="noreferrer">
                <Share2 size={15} /> WhatsApp
              </a>
            </span>
          </div>
        )}
        {mine && !mine.ready ? (
          <button className="btn primary big" onClick={ready}>
            I’m ready
          </button>
        ) : (
          <div className="sheet small muted">You’re ready. {b.opponent ? `Waiting for ${other?.name}…` : 'Waiting for an opponent…'}</div>
        )}
      </div>
    );
  }

  // countdown
  if (!started) {
    const n = Math.max(1, Math.ceil((b.startAt - serverNow) / 1000));
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }} className="stack">
        <h2>Get ready…</h2>
        <div className="live-count">{n}</div>
        {bars}
      </div>
    );
  }

  // finished my questions: watch the other player
  if (finishedMine || !q) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }} className="stack">
        <h2>You’re done!</h2>
        <p className="muted">Waiting for {other?.name} to finish their last questions…</p>
        {bars}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {bars}
      <div className="row between" style={{ margin: '12px 0 8px' }}>
        <span className="small muted">
          Question {idx + 1} of {b.count}
        </span>
        <span className={`chip ${left <= 5 ? 'exam' : ''}`}>
          <Timer size={14} /> {left}s
        </span>
      </div>
      <div className={`sheet stack ${feedback ? (feedback.ok ? 'live-ok' : 'live-bad') : ''}`}>
        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{q.prompt}</h2>
        {feedback ? (
          <div className="row" style={{ gap: 8 }}>
            {feedback.ok ? <CheckCircle2 size={22} color="var(--good)" /> : <XCircle size={22} color="var(--bad)" />}
            <strong>{feedback.ok ? 'Correct!' : `Answer: ${feedback.right}`}</strong>
          </div>
        ) : q.type === 'mcq' ? (
          <div className="stack">
            {q.options!.map((o, i) => (
              <button key={i} className="option" onClick={() => send(i)}>
                <span className="letter">{'ABCD'[i]}</span> {o}
              </button>
            ))}
          </div>
        ) : q.type === 'tf' ? (
          <div className="row">
            <button className="btn big" onClick={() => send(true)}>
              True
            </button>
            <button className="btn big" onClick={() => send(false)}>
              False
            </button>
          </div>
        ) : (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void send(typed.trim() || null);
            }}
          >
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Your answer" style={{ flex: 1 }} />
            <button className="btn primary">Next</button>
          </form>
        )}
      </div>
    </div>
  );
}
