import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarClock, Home, Layers, Library as LibraryIcon, Plus, Trophy, Users } from 'lucide-react';
import { api, type Stats } from '../api';
import { useAuth } from '../auth';
import { today } from '../lib/util';
import { FocusTimer } from './FocusTimer';
import { ErrorBoundary } from './ErrorBoundary';
import { Loading, Logo } from './ui';
import { useOnline, useQueued } from '../lib/offline';

export function Layout() {
  const { user } = useAuth();
  const loc = useLocation();
  const [due, setDue] = useState(0);

  useEffect(() => {
    api<Stats>(`/study/stats?day=${today()}`)
      .then((s) => setDue(s.dueCards))
      .catch(() => {});
  }, [loc.pathname]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const initials = (user?.name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/home" className="brand" aria-label="Charis Study home">
            <Logo />
            <span>Charis Study</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/home">
              <Home size={18} /> Home
            </NavLink>
            <NavLink to="/review">
              <Layers size={18} /> Review {due > 0 && <span className="badge">{due > 99 ? '99+' : due}</span>}
            </NavLink>
            <NavLink to="/plan">
              <CalendarClock size={18} /> Timetable
            </NavLink>
            <NavLink to="/library">
              <LibraryIcon size={18} /> Library
            </NavLink>
            <NavLink to="/classes">
              <Users size={18} /> Classes
            </NavLink>
            <NavLink to="/ranks">
              <Trophy size={18} /> Rankings
            </NavLink>
            <NavLink to="/new">
              <Plus size={18} /> New pack
            </NavLink>
          </nav>
          <div className="spacer" />
          <ErrorBoundary fallback={null}>
            <FocusTimer />
          </ErrorBoundary>
          <Link to="/profile" className="btn icon" style={{ borderRadius: '50%', fontWeight: 600, fontSize: '0.85rem' }} aria-label="Your profile">
            {initials}
          </Link>
        </div>
      </header>
      <OfflineBar />
      <main className="main" id="main">
        <ErrorBoundary key={loc.pathname}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/home">
          <Home size={22} />
          Home
        </NavLink>
        <NavLink to="/review">
          <Layers size={22} />
          Review
          {due > 0 && <span className="badge">{due > 99 ? '99+' : due}</span>}
        </NavLink>
        <NavLink to="/plan">
          <CalendarClock size={22} />
          Plan
        </NavLink>
        <NavLink to="/ranks">
          <Trophy size={22} />
          Ranks
        </NavLink>
        <NavLink to="/new">
          <Plus size={22} />
          Add
        </NavLink>
        <NavLink to="/library">
          <LibraryIcon size={22} />
          Library
        </NavLink>
      </nav>
    </div>
  );
}

/** A thin bar when there is no connection, or answers are still waiting to be sent. */
function OfflineBar() {
  const online = useOnline();
  const queued = useQueued();
  if (online && !queued) return null;
  return (
    <div className="offline-bar" role="status">
      {online ? `Sending ${queued} answer${queued === 1 ? '' : 's'} you made offline…` : `You're offline. Packs you saved for offline still work${queued ? ` — ${queued} answer${queued === 1 ? '' : 's'} will be sent when you're back online` : ''}.`}
    </div>
  );
}
