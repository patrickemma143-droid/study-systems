import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Layers, Plus, UserRound } from 'lucide-react';
import { api, type Stats } from '../api';
import { useAuth } from '../auth';
import { today } from '../lib/util';
import { FocusTimer } from './FocusTimer';
import { ErrorBoundary } from './ErrorBoundary';
import { Loading, Logo } from './ui';

export function Layout() {
  const { user } = useAuth();
  const loc = useLocation();
  const [due, setDue] = useState(0);

  useEffect(() => {
    api<Stats>(`/study/stats?day=${today()}`)
      .then((s) => setDue(s.dueCards))
      .catch(() => {});
  }, [loc.pathname]);

  useEffect(() => window.scrollTo(0, 0), [loc.pathname]);

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
            <NavLink to="/new">
              <Plus size={18} /> New study pack
            </NavLink>
          </nav>
          <div className="spacer" />
          <FocusTimer />
          <Link to="/profile" className="btn icon" style={{ borderRadius: '50%', fontWeight: 600, fontSize: '0.85rem' }} aria-label="Your profile">
            {initials}
          </Link>
        </div>
      </header>
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
        <NavLink to="/new">
          <Plus size={22} />
          Add notes
        </NavLink>
        <NavLink to="/profile">
          <UserRound size={22} />
          Profile
        </NavLink>
      </nav>
    </div>
  );
}
