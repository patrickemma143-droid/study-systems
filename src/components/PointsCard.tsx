import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

interface MyPoints {
  week: string;
  total: number;
  categories: Record<'memory' | 'fast' | 'explain' | 'steady', number>;
  allTime: number;
  rank: number | null;
  rankUniversity: number | null;
  players: number;
  playersUniversity: number;
  onLeaderboard: boolean;
  recent: { category: string; points: number; reason: string; at: number }[];
  history: { week: string; points: number }[];
}

const LABEL: Record<string, string> = { memory: 'Memory', fast: 'Fast learner', explain: 'Explainer', steady: 'Consistency' };

/** The student's own points, shown on their profile. */
export function PointsCard() {
  const { user } = useAuth();
  const [p, setP] = useState<MyPoints | null>(null);

  useEffect(() => {
    api<MyPoints>('/points/me').then(setP).catch(() => {});
  }, []);

  if (!p) return null;
  const max = Math.max(1, ...Object.values(p.categories));

  async function toggle() {
    const next = !p!.onLeaderboard;
    await api('/points/visibility', { method: 'PUT', body: { onLeaderboard: next } });
    setP({ ...p!, onLeaderboard: next, rank: next ? p!.rank : null, rankUniversity: next ? p!.rankUniversity : null });
  }

  return (
    <div className="sheet stack">
      <div className="row between">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }} className="row">
          <Trophy size={20} color="#d4a017" /> Your points
        </h2>
        <Link to="/ranks" className="btn small">
          See the rankings
        </Link>
      </div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="stat">
          <span className="num">{p.total}</span>
          <div className="lbl">this week</div>
        </div>
        <div className="stat">
          <span className="num">{p.rank ? `#${p.rank}` : '—'}</span>
          <div className="lbl">{p.rankUniversity && user?.university ? `#${p.rankUniversity} at ${user.university}` : 'overall rank'}</div>
        </div>
        <div className="stat">
          <span className="num">{p.allTime}</span>
          <div className="lbl">all time</div>
        </div>
      </div>
      {(Object.keys(LABEL) as (keyof MyPoints['categories'])[]).map((k) => (
        <div key={k}>
          <div className="row between small" style={{ marginBottom: 4 }}>
            <span>{LABEL[k]}</span>
            <strong>{p.categories[k]}</strong>
          </div>
          <div className="meter">
            <span style={{ width: `${(p.categories[k] / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {p.recent.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            Latest points
          </div>
          {p.recent.slice(0, 6).map((r, i) => (
            <div key={i} className="row between small" style={{ padding: '5px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'nowrap' }}>
              <span style={{ minWidth: 0 }}>{r.reason}</span>
              <strong style={{ color: 'var(--good)', whiteSpace: 'nowrap' }}>+{r.points}</strong>
            </div>
          ))}
        </div>
      )}
      {!user?.university && <p className="hint" style={{ margin: 0 }}>Add your university and course above to appear in your university’s and course’s rankings.</p>}
      <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={p.onLeaderboard} onChange={toggle} />
        Show my name, university and course in the weekly rankings
      </label>
    </div>
  );
}
