import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="charis-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7B5CFF" />
          <stop offset="1" stopColor="#19B8E6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#charis-logo-g)" />
      <path d="M14 46 L50 28" stroke="#FFE45C" strokeWidth="11" strokeLinecap="round" opacity=".95" />
      <path d="M20 18h17a9 9 0 0 1 9 9v19H29a9 9 0 0 1-9-9z" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M27 28h12M27 35h9" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-load" role="status">
      <div className="row">
        <div className="spinner" />
        <span className="muted">{label}</span>
      </div>
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="sheet empty">
      <h2>That didn’t load</h2>
      <p className="muted">{message}</p>
      {action}
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, label, color = 'var(--biro)' }: { value: number; size?: number; stroke?: number; label?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <span className="ring-label" style={{ fontSize: size * 0.24 }}>{label ?? `${Math.round(v)}%`}</span>
    </div>
  );
}

export function Bar({ value, good }: { value: number; good?: boolean }) {
  return (
    <div className={`bar ${good ? 'good' : ''}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="crumbs no-print" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="row" style={{ gap: 6 }}>
          {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// ─── Toasts ───
const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" aria-live="polite">
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Countdown that calls onDone once; pauses while `running` is false. */
export function useCountdown(seconds: number, running: boolean, onDone?: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(false);
  const cb = useRef(onDone);
  cb.current = onDone;
  useEffect(() => {
    setLeft(seconds);
    done.current = false;
  }, [seconds, running]);
  useEffect(() => {
    if (!running) return;
    const endsAt = Date.now() + seconds * 1000;
    const iv = window.setInterval(() => {
      const l = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0) {
        window.clearInterval(iv);
        if (!done.current) {
          done.current = true;
          cb.current?.();
        }
      }
    }, 250);
    return () => window.clearInterval(iv);
  }, [running, seconds]);
  return left;
}
