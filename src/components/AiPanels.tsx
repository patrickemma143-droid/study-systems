import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Crown, Eye, EyeOff, Layers, MessageCircleQuestion, Send, ShieldCheck, Sparkles, Square, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { left, updateAiUsage, useAiStatus, type AiFeedbackResult, type AiKind, type Simplified } from '../lib/ai';
import { Ring, useToast } from './ui';

function Allowance({ kind, cached }: { kind: AiKind; cached?: boolean }) {
  const s = useAiStatus();
  if (!s) return null;
  if (cached) return <span className="small muted">Shared answer, didn’t use your daily allowance</span>;
  return (
    <span className="small muted">
      {left(s, kind)} of {s.limits[kind]} left today{s.plan === 'pro' ? ' (Pro)' : ''}
    </span>
  );
}

/** Turns **bold** and "- " lines from the AI into simple formatted text. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => {
        const lines = para.split('\n');
        const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const fmt = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, k) => (k % 2 ? <strong key={k}>{part}</strong> : part));
        return bullets ? (
          <ul key={i} style={{ margin: '0 0 10px', paddingLeft: 20 }}>
            {lines.map((l, k) => (
              <li key={k}>{fmt(l.replace(/^\s*[-*•]\s+/, ''))}</li>
            ))}
          </ul>
        ) : (
          <p key={i} style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>
            {fmt(para)}
          </p>
        );
      })}
    </>
  );
}

// ─── Explain it simply ────────────────────────────────────────
export function AiSimplify({ packId, chunk }: { packId: number; chunk: number }) {
  const status = useAiStatus();
  const toast = useToast();
  const [data, setData] = useState<Simplified | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setData(null);
    setError(null);
    setShown({});
    if (!status?.enabled) return;
    // Free check: show it straight away if this lesson was already explained (by anyone).
    api<Simplified & { available?: boolean }>('/ai/simplify', { body: { packId, chunk, peek: true } })
      .then((r) => r.available !== false && setData(r))
      .catch(() => {});
  }, [packId, chunk, status?.enabled]);

  if (!status?.enabled) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Simplified & { usage: any }>('/ai/simplify', { body: { packId, chunk } });
      setData(r);
      updateAiUsage(r.usage);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addCards() {
    if (!data) return;
    for (const q of data.questions) await api('/study/cards', { body: { packId, chunk, front: q.q, back: q.a } });
    toast(`${data.questions.length} questions added to your flashcards`);
  }

  return (
    <div className="sheet ai-card" style={{ marginBottom: 18 }}>
      <div className="row between" style={{ marginBottom: data ? 10 : 0 }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }} className="row">
          <Sparkles size={18} color="var(--biro)" /> Explain it simply
        </h2>
        {data ? <Allowance kind="simplify" cached={data.cached} /> : <Allowance kind="simplify" />}
      </div>
      {!data && (
        <div className="row between" style={{ marginTop: 8 }}>
          <p className="small muted" style={{ margin: 0, maxWidth: 460 }}>
            Get this lesson re-taught in plain English, with a real-life example and exam-style questions.
          </p>
          <button className="btn primary" onClick={run} disabled={busy || left(status, 'simplify') <= 0}>
            <Sparkles size={17} /> {busy ? 'Explaining…' : 'Explain simply'}
          </button>
        </div>
      )}
      {error && <AiError message={error} />}
      {data && (
        <div className="stack">
          <div style={{ fontSize: '1.03rem' }}>
            <Rich text={data.simple} />
          </div>
          {data.example && (
            <div className="callout" style={{ background: 'var(--paper-2)', display: 'block' }}>
              <div className="hand" style={{ color: 'var(--biro)', fontSize: '1.3rem', lineHeight: 1.1 }}>
                For example
              </div>
              <div>{data.example}</div>
            </div>
          )}
          {data.keyPoints.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                Remember
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {data.keyPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {data.questions.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Exam-style questions
              </div>
              {data.questions.map((q, i) => (
                <div key={i} className="point-check" style={{ display: 'block' }}>
                  <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <strong style={{ fontWeight: 500 }}>
                      {i + 1}. {q.q}
                    </strong>
                    <button className="btn ghost small" onClick={() => setShown((s) => ({ ...s, [i]: !s[i] }))} aria-expanded={!!shown[i]}>
                      {shown[i] ? <EyeOff size={15} /> : <Eye size={15} />} {shown[i] ? 'Hide' : 'Answer'}
                    </button>
                  </div>
                  {shown[i] && <p className="small" style={{ margin: '6px 0 0', color: 'var(--ink-2)' }}>{q.a}</p>}
                </div>
              ))}
              <button className="btn small" style={{ marginTop: 10 }} onClick={addCards}>
                <Layers size={15} /> Add these to my flashcards
              </button>
            </div>
          )}
          <p className="hint" style={{ margin: 0 }}>
            Written by AI from your notes. It can make mistakes, so check anything that looks off against the lesson.
          </p>
        </div>
      )}
    </div>
  );
}

function AiError({ message }: { message: string }) {
  return (
    <div className="error-box row" role="alert" style={{ marginTop: 10, gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <TriangleAlert size={17} style={{ flex: 'none', marginTop: 2 }} /> <span>{message}</span>
    </div>
  );
}

// ─── Tutor chat ───────────────────────────────────────────────
type Msg = { role: 'user' | 'assistant'; content: string };
const STARTERS = ['Explain this like I’m new to it', 'Give me a real-life example', 'Quiz me with one question', 'What will the exam ask about this?'];

export function TutorChat({ packId, chunk, title }: { packId: number; chunk: number; title: string }) {
  const status = useAiStatus();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [packId, chunk]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, busy]);

  if (!status?.enabled) return null;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ reply: string; usage: any }>('/ai/tutor', { body: { packId, chunk, messages: next } });
      setMessages([...next, { role: 'assistant', content: r.reply }]);
      updateAiUsage(r.usage);
    } catch (e: any) {
      setError(e.message);
      setMessages(messages);
      setInput(q);
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const out = left(status, 'tutor') <= 0;

  return (
    <div className="sheet ai-card" style={{ marginBottom: 18 }}>
      <button className="row between" style={{ width: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }} className="row">
          <MessageCircleQuestion size={18} color="var(--biro)" /> Ask the tutor
        </h2>
        <Allowance kind="tutor" />
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div className="chat" aria-live="polite">
            {messages.length === 0 && <p className="small muted" style={{ margin: 0 }}>Stuck on something in “{title}”? Ask in your own words. The tutor answers from your notes.</p>}
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.role === 'assistant' ? <Rich text={m.content} /> : m.content}
              </div>
            ))}
            {busy && <div className="bubble assistant muted">Thinking…</div>}
            <div ref={end} />
          </div>
          {messages.length === 0 && (
            <div className="row" style={{ gap: 6, margin: '10px 0' }}>
              {STARTERS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)} disabled={busy || out}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {error && <AiError message={error} />}
          <form className="row" onSubmit={onSubmit} style={{ marginTop: 10, flexWrap: 'nowrap' }}>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={out ? 'No tutor questions left today' : 'Type your question…'} disabled={busy || out} aria-label="Your question" maxLength={2000} />
            <button className="btn primary icon" disabled={busy || out || !input.trim()} aria-label="Send question">
              <Send size={18} />
            </button>
          </form>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            AI answers can be wrong. Check important facts against your notes.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── AI marking for Feynman and blurting ──────────────────────
export function AiFeedback({ packId, chunks, text, mode }: { packId: number; chunks: number[]; text: string; mode: 'feynman' | 'blurt' }) {
  const status = useAiStatus();
  const [data, setData] = useState<AiFeedbackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [text]);

  if (!status?.enabled) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<AiFeedbackResult & { usage: any }>('/ai/feedback', { body: { packId, chunks, text, mode } });
      setData(r);
      updateAiUsage(r.usage);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const color = (n: number) => (n >= 75 ? 'var(--good)' : n >= 50 ? 'var(--warn)' : 'var(--bad)');
  return (
    <div className="sheet ai-card">
      <div className="row between">
        <h3 className="row" style={{ margin: 0 }}>
          <Sparkles size={18} color="var(--biro)" /> AI tutor’s marking
        </h3>
        <Allowance kind="feedback" cached={data?.cached} />
      </div>
      {!data && (
        <div className="row between" style={{ marginTop: 8 }}>
          <p className="small muted" style={{ margin: 0, maxWidth: 440 }}>
            The check above matches key words. The AI tutor reads your answer for meaning, and spots misunderstandings too.
          </p>
          <button className="btn primary" onClick={run} disabled={busy || left(status, 'feedback') <= 0}>
            <Sparkles size={17} /> {busy ? 'Marking…' : 'Get AI marking'}
          </button>
        </div>
      )}
      {error && <AiError message={error} />}
      {data && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 16, flexWrap: 'nowrap', alignItems: 'center' }}>
            <Ring value={data.score} size={72} stroke={7} color={color(data.score)} />
            <p style={{ margin: 0 }}>{data.summary}</p>
          </div>
          {[
            { list: data.correct, label: 'What you got right', icon: <CheckCircle2 size={17} className="covered" /> },
            { list: data.missing, label: 'Add next time', icon: <CircleDashed size={17} className="missed" /> },
            { list: data.misconceptions, label: 'Watch out', icon: <TriangleAlert size={17} color="var(--warn)" /> },
          ]
            .filter((g) => g.list.length)
            .map((g) => (
              <div key={g.label}>
                <div className="label">{g.label}</div>
                {g.list.map((x, i) => (
                  <div key={i} className="point-check">
                    {g.icon}
                    <div>{x}</div>
                  </div>
                ))}
              </div>
            ))}
          {data.tip && (
            <div className="callout" style={{ background: 'var(--paper-2)', display: 'block' }}>
              <div className="hand" style={{ color: 'var(--biro)', fontSize: '1.3rem', lineHeight: 1.1 }}>
                Tip
              </div>
              <div>{data.tip}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Explain every lesson in a pack ───────────────────────────
export function AiPackExplainer({ packId, lessons }: { packId: number; lessons: number[] }) {
  const status = useAiStatus();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'stopped'>('idle');
  const [done, setDone] = useState(0);
  const [shared, setShared] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );

  if (!status?.enabled || !lessons.length) return null;

  async function run() {
    // "Carry on" picks up where it stopped; finished lessons are already saved.
    const from = phase === 'stopped' ? done : 0;
    stop.current = false;
    setPhase('running');
    setError(null);
    if (!from) setShared(0);
    for (let i = from; i < lessons.length; i++) {
      if (stop.current) {
        setPhase('stopped');
        return;
      }
      try {
        const r = await api<Simplified & { usage: any }>('/ai/simplify', { body: { packId, chunk: lessons[i] } });
        if (r.cached) setShared((n) => n + 1);
        updateAiUsage(r.usage);
        setDone(i + 1);
      } catch (e: any) {
        setError(e.message);
        setPhase('stopped');
        return;
      }
    }
    setPhase('done');
  }

  const total = lessons.length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="sheet tight ai-card" style={{ marginBottom: 12 }}>
      <div className="row between">
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong className="row" style={{ gap: 6 }}>
            <Sparkles size={17} color="var(--biro)" /> Explain every lesson simply
          </strong>
          <div className="small muted" style={{ marginTop: 2 }}>
            {phase === 'idle' && `Prepares a plain-English version of all ${total} lessons. Lessons a classmate already explained are free; the rest use your daily allowance (${left(status, 'simplify')} left).`}
            {phase === 'running' && `Explaining lesson ${Math.min(done + 1, total)} of ${total}…`}
            {phase === 'done' && `All ${total} lessons are ready${shared ? ` (${shared} were shared answers)` : ''}. Open any lesson to read its simple version.`}
            {phase === 'stopped' && `${done} of ${total} lessons explained. Open a lesson to read them.`}
          </div>
        </div>
        {phase === 'running' ? (
          <button className="btn small" onClick={() => (stop.current = true)}>
            <Square size={14} /> Stop
          </button>
        ) : phase !== 'done' ? (
          <button className="btn small primary" onClick={run}>
            <Sparkles size={15} /> {phase === 'stopped' ? 'Carry on' : 'Explain all'}
          </button>
        ) : null}
      </div>
      {(phase === 'running' || done > 0) && (
        <div className="meter" style={{ marginTop: 10 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Lessons explained">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {error && <AiError message={error} />}
    </div>
  );
}

// ─── Plan and today’s AI use (profile) ────────────────────────
export function AiPlanCard() {
  const s = useAiStatus();
  if (!s) return null;
  const rows: { kind: AiKind; label: string }[] = [
    { kind: 'simplify', label: 'Simple explanations' },
    { kind: 'tutor', label: 'Tutor questions' },
    { kind: 'feedback', label: 'AI marking' },
  ];
  return (
    <div className="sheet stack">
      <div className="row between">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Your plan</h2>
        <span className="row" style={{ gap: 8 }}>
          {s.plan === 'pro' ? (
            <span className="badge-pro">
              <Crown size={14} /> Pro
            </span>
          ) : (
            <span className="chip">Free</span>
          )}
          {s.admin && (
            <Link to="/admin" className="btn small">
              <ShieldCheck size={15} /> Admin
            </Link>
          )}
        </span>
      </div>
      {!s.enabled ? (
        <p className="small muted" style={{ margin: 0 }}>
          Everything in Charis Study works without AI. AI helpers (simple explanations, a tutor and AI marking) will appear here when they are switched on for this site.
        </p>
      ) : (
        <>
          {rows.map((r) => {
            const lim = s.limits[r.kind];
            const used = Math.min(s.used[r.kind], lim);
            return (
              <div key={r.kind}>
                <div className="row between small" style={{ marginBottom: 4 }}>
                  <span>{r.label}</span>
                  <span className="muted">{lim > 0 ? `${used} of ${lim} used today` : 'Pro only'}</span>
                </div>
                <div className="meter">
                  <span style={{ width: `${lim > 0 ? (used / lim) * 100 : 0}%` }} />
                </div>
              </div>
            );
          })}
          <span className="hint">
            Allowances reset every day. Answers a classmate already got for the same notes are shared and don’t count.
            {s.plan === 'free' ? ' Ask Charis Creations about Pro for bigger daily allowances.' : ''}
          </span>
        </>
      )}
    </div>
  );
}
