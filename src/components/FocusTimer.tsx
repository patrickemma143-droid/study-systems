import { useEffect, useRef, useState } from 'react';
import { Coffee, Pause, Play, RotateCcw, Timer, X } from 'lucide-react';
import { api } from '../api';
import { chime } from '../lib/speech';
import { formatClock, save, store, today } from '../lib/util';

type Phase = 'focus' | 'break';
interface TimerState {
  phase: Phase;
  focusMin: number;
  breakMin: number;
  endsAt: number | null; // running when set
  remaining: number; // seconds, used while paused
  rounds: number;
}

const PRESETS = [
  { label: '25 / 5', focus: 25, brk: 5 },
  { label: '15 / 3', focus: 15, brk: 3 },
  { label: '50 / 10', focus: 50, brk: 10 },
];

const initial: TimerState = { phase: 'focus', focusMin: 25, breakMin: 5, endsAt: null, remaining: 25 * 60, rounds: 0 };

const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** A saved timer from an older version, another account or a cleared browser must never break the page. */
function loadTimer(): TimerState {
  const t = store<Partial<TimerState> | null>('cs-timer', null);
  if (!t || typeof t !== 'object') return initial;
  const focusMin = num(t.focusMin, 1, 180) ? t.focusMin! : initial.focusMin;
  const breakMin = num(t.breakMin, 1, 60) ? t.breakMin! : initial.breakMin;
  return {
    phase: t.phase === 'break' ? 'break' : 'focus',
    focusMin,
    breakMin,
    endsAt: num(t.endsAt, 0, Date.now() + 4 * 3600_000) ? t.endsAt! : null,
    remaining: num(t.remaining, 0, 4 * 3600) ? t.remaining! : focusMin * 60,
    rounds: num(t.rounds, 0, 1000) ? t.rounds! : 0,
  };
}

/** Pomodoro focus timer. Lives in the top bar so it keeps running while you move between pages. */
export function FocusTimer() {
  const [s, setS] = useState<TimerState>(loadTimer);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    save('cs-timer', s);
  }, [s]);

  const left = s.endsAt ? Math.max(0, Math.round((s.endsAt - Date.now()) / 1000)) : s.remaining;

  useEffect(() => {
    if (!s.endsAt) return;
    const iv = window.setInterval(() => {
      tick((n) => n + 1);
      if (s.endsAt && Date.now() >= s.endsAt) {
        chime();
        if (s.phase === 'focus') {
          api('/study/activity', { body: { method: 'focus', minutes: s.focusMin, day: today() } }).catch(() => {});
          notify('Focus session done', `Great work. Take a ${s.breakMin}-minute break: stand up, drink water, look far away.`);
          setS((p) => ({ ...p, phase: 'break', endsAt: Date.now() + p.breakMin * 60000, rounds: p.rounds + 1 }));
        } else {
          notify('Break over', 'Ready for another focus session?');
          setS((p) => ({ ...p, phase: 'focus', endsAt: null, remaining: p.focusMin * 60 }));
        }
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [s.endsAt, s.phase, s.focusMin, s.breakMin]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const running = !!s.endsAt;
  const start = () => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    setS((p) => ({ ...p, endsAt: Date.now() + p.remaining * 1000 }));
  };
  const pause = () => setS((p) => ({ ...p, endsAt: null, remaining: left }));
  const reset = () => setS((p) => ({ ...p, phase: 'focus', endsAt: null, remaining: p.focusMin * 60 }));
  const preset = (f: number, b: number) => setS({ ...initial, focusMin: f, breakMin: b, remaining: f * 60, rounds: s.rounds });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`timer-pill ${running ? (s.phase === 'break' ? 'break' : 'running') : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={running ? `Focus timer: ${formatClock(left)} left` : 'Open focus timer'}
      >
        {s.phase === 'break' ? <Coffee size={16} /> : <Timer size={16} />}
        {running || s.remaining !== s.focusMin * 60 ? formatClock(left) : <span className="focus-label">Focus</span>}
      </button>
      {open && (
        <div className="pop" style={{ right: 0, top: 46, width: 290 }} role="dialog" aria-label="Focus timer">
          <div className="row between">
            <strong>{s.phase === 'focus' ? 'Focus session' : 'Break time'}</strong>
            <button className="btn ghost icon small" onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div style={{ fontSize: '3rem', fontWeight: 600, textAlign: 'center', fontVariantNumeric: 'tabular-nums', margin: '6px 0' }}>{formatClock(left)}</div>
          <p className="small muted" style={{ textAlign: 'center', marginTop: -4 }}>
            {s.phase === 'focus' ? 'Phone face down. One task only.' : 'Stand up, stretch, drink some water.'}
            {s.rounds > 0 && ` ${s.rounds} ${s.rounds === 1 ? 'session' : 'sessions'} done.`}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {running ? (
              <button className="btn primary" onClick={pause}>
                <Pause size={18} /> Pause
              </button>
            ) : (
              <button className="btn primary" onClick={start}>
                <Play size={18} /> {left === s.focusMin * 60 && s.phase === 'focus' ? 'Start focus' : 'Resume'}
              </button>
            )}
            <button className="btn icon" onClick={reset} aria-label="Reset timer">
              <RotateCcw size={18} />
            </button>
          </div>
          {!running && (
            <div className="segmented" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} role="group" aria-label="Session length">
              {PRESETS.map((p) => (
                <button key={p.label} aria-pressed={s.focusMin === p.focus} onClick={() => preset(p.focus, p.brk)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function notify(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(title, { body, icon: '/icon.svg' });
  } catch {
    /* notifications unavailable */
  }
}
