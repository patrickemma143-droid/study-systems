import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { isStaleBuildError, reloadForNewVersion } from '../lib/lazyPage';

const reported = new Map<string, number>();

/** Send a crash to the server log, at most twice per message per visit. */
export function reportClientError(error: unknown, extra = '') {
  try {
    const message = String((error as any)?.message || error).slice(0, 500);
    const n = reported.get(message) || 0;
    if (n >= 2) return;
    reported.set(message, n + 1);
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ message, stack: `${String((error as any)?.stack || '').slice(0, 1200)} ${extra}`.slice(0, 1500), url: location.pathname }),
    }).catch(() => {});
  } catch {
    /* reporting must never cause a second crash */
  }
}

/**
 * Shows a friendly message instead of a blank screen if part of the app crashes.
 * With `fallback`, a small part of the screen (like the focus timer) just disappears instead.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
    if (isStaleBuildError(error)) {
      reloadForNewVersion();
      return;
    }
    reportClientError(error, `component: ${(info.componentStack || '').trim().split('\n')[0]}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    const stale = isStaleBuildError(this.state.error);
    return (
      <div className="sheet empty" role="alert" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h2>{stale ? 'Charis Study was just updated' : 'This page hit a problem'}</h2>
        <p className="muted">{stale ? 'Reload to get the newest version. Your work is saved.' : 'Reload the page to try again. Your progress is saved in your account.'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => window.location.reload()}>
            <RotateCcw size={18} /> Reload
          </button>
          <a className="btn ghost" href="/home">
            Go to home
          </a>
        </div>
        {!stale && (
          <details style={{ marginTop: 16, textAlign: 'left' }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              Technical details
            </summary>
            <code className="small" style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--ink-2)' }}>
              {String(this.state.error?.message || this.state.error).slice(0, 300)}
            </code>
          </details>
        )}
      </div>
    );
  }
}
