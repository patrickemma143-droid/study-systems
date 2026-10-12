import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Brain, Medal, MessageSquareText, Trophy, Zap } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Crumbs, ErrorState, Loading } from '../components/ui';

interface Row {
  rank: number;
  name: string;
  university: string | null;
  course: string | null;
  total: number;
  memory: number;
  fast: number;
  explain: number;
  steady: number;
  bestQuiz: number | null;
  bestExplain: number | null;
  me: boolean;
}
interface Board {
  week: string;
  weekEnd: string;
  final: boolean;
  scope: 'all' | 'university' | 'course';
  university: string | null;
  course: string | null;
  rows: Row[];
  me: Row | null;
}

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const MEDAL = ['#d4a017', '#9aa4b2', '#b87333'];

export const HOW_POINTS = [
  { icon: Brain, name: 'Memory', text: 'Flashcards you remember. Typed answers that are right earn 3, nearly right 2, a self-rated “Good” 1. Clear all your due cards in a day for +15.' },
  { icon: Zap, name: 'Fast learner', text: 'Prove a lesson by getting all its cards right or explaining it well: +10, doubled if you do it within a day of adding the notes. Quizzes earn 2 per correct answer (first two a day per pack).' },
  { icon: MessageSquareText, name: 'Explainer', text: 'Explain a lesson to a friend who missed it (Feynman) or blurt what you remember. We re-mark your saved work against your notes. Copied text earns nothing; peeking halves the points.' },
  { icon: Award, name: 'Consistency', text: '+10 each day you reach your study goal.' },
];

export default function Ranks() {
  const { user } = useAuth();
  const [week, setWeek] = useState<'this' | 'last'>('this');
  const [scope, setScope] = useState<'all' | 'university' | 'course'>('all');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBoard(null);
    api<Board>(`/points/leaderboard?week=${week}&scope=${scope}`)
      .then(setBoard)
      .catch((e) => setError(e.message));
  }, [week, scope]);

  if (error) return <ErrorState message={error} />;
  const missing = !user?.university || (scope === 'course' && !user?.course);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { label: 'Rankings' }]} />
      <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0 }} className="row">
            <Trophy size={28} color="#d4a017" /> Weekly rankings
          </h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {board ? `${fmt(board.week)} – ${fmt(board.weekEnd)}. ` : ''}
            {week === 'this' ? 'Live: points update as students study. Final results are published every Monday morning.' : 'Final results for last week.'}
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Which week">
          <button aria-pressed={week === 'this'} onClick={() => setWeek('this')}>
            This week
          </button>
          <button aria-pressed={week === 'last'} onClick={() => setWeek('last')}>
            Last week’s results
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        <button className="chip" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
          All universities
        </button>
        <button className="chip" aria-pressed={scope === 'university'} onClick={() => setScope('university')}>
          {user?.university || 'My university'}
        </button>
        <button className="chip" aria-pressed={scope === 'course'} onClick={() => setScope('course')}>
          {user?.course || 'My course'}
        </button>
      </div>

      {scope !== 'all' && missing ? (
        <div className="sheet empty">
          <h2>Add your {user?.university ? 'course' : 'university'} first</h2>
          <p className="muted">Then you can compare yourself with classmates.</p>
          <Link to="/profile" className="btn primary">
            Open my profile
          </Link>
        </div>
      ) : !board ? (
        <Loading />
      ) : (
        <>
          {board.me ? (
            <div className="sheet tight row between ai-card" style={{ marginBottom: 14 }}>
              <div>
                <div className="small muted">{week === 'this' ? 'Your position so far' : 'You finished'}</div>
                <strong style={{ fontSize: '1.4rem' }}>
                  #{board.me.rank} <span className="small muted">of {board.rows.length < 50 ? board.rows.length : 'many'}</span>
                </strong>
              </div>
              <div className="row" style={{ gap: 18 }}>
                <Stat label="Points" value={board.me.total} strong />
                <Stat label="Memory" value={board.me.memory} />
                <Stat label="Fast learner" value={board.me.fast} />
                <Stat label="Explainer" value={board.me.explain} />
              </div>
            </div>
          ) : (
            <div className="sheet tight small muted" style={{ marginBottom: 14 }}>
              {week === 'this' ? 'You have no points yet this week. Review some flashcards or explain a lesson to get on the board.' : 'You didn’t earn points last week.'}
            </div>
          )}

          {board.rows.length === 0 ? (
            <div className="sheet empty">
              <h2>No one is on the board yet</h2>
              <p className="muted">Be the first: every flashcard, quiz and explanation counts.</p>
            </div>
          ) : (
            <>
              <div className="podium">
                {board.rows.slice(0, 3).map((r, i) => (
                  <div key={i} className={`sheet tight podium-card ${r.me ? 'me' : ''}`}>
                    <Medal size={30} color={MEDAL[i]} />
                    <strong>{r.name}</strong>
                    <span className="small muted">{[r.course, r.university].filter(Boolean).join(', ') || '—'}</span>
                    <span className="podium-points">{r.total} pts</span>
                  </div>
                ))}
              </div>
              <div className="sheet" style={{ padding: '8px 12px' }}>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student</th>
                        <th>University</th>
                        <th className="num">Points</th>
                        <th className="num">Memory</th>
                        <th className="num">Fast learner</th>
                        <th className="num">Explainer</th>
                        <th>Best scores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...board.rows, ...(board.me && !board.rows.some((r) => r.me) ? [board.me] : [])].map((r) => (
                        <tr key={`${r.rank}-${r.name}`} className={r.me ? 'me-row' : ''}>
                          <td>
                            <strong>{r.rank}</strong>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>
                              {r.name}
                              {r.me ? ' (you)' : ''}
                            </div>
                            <div className="small muted">{r.course || '—'}</div>
                          </td>
                          <td className="small">{r.university || '—'}</td>
                          <td className="num">
                            <strong>{r.total}</strong>
                          </td>
                          <td className="num">{r.memory}</td>
                          <td className="num">{r.fast}</td>
                          <td className="num">{r.explain}</td>
                          <td className="small">
                            {[r.bestQuiz != null ? `Quiz ${r.bestQuiz}%` : null, r.bestExplain != null ? `Explained ${r.bestExplain}%` : null].filter(Boolean).join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="section">
        <div className="section-head">
          <h2>How you earn points</h2>
        </div>
        <div className="grid cols-2">
          {HOW_POINTS.map((h) => (
            <div key={h.name} className="sheet tight row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
              <h.icon size={22} color="var(--biro)" style={{ flex: 'none', marginTop: 2 }} />
              <div>
                <strong>{h.name}</strong>
                <div className="small muted">{h.text}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="hint">Points come only from work the app can check, and each kind has a daily limit, so steady daily study beats one long night. You can hide yourself from the rankings in your profile.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: strong ? '1.4rem' : '1.1rem', fontWeight: 600 }}>{value}</div>
      <div className="small muted">{label}</div>
    </div>
  );
}
