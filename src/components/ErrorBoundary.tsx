import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { isStaleBuildError, reloadForNewVersion } from '../lib/lazyPage';

/** Shows a friendly message instead of a blank screen if a page crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
    if (isStaleBuildError(error)) reloadForNewVersion();
  }

  render() {
    if (!this.state.error) return this.props.children;
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
      </div>
    );
  }
}
