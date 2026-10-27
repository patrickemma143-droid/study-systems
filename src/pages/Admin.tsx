import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Crown, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';

type Kind = 'simplify' | 'tutor' | 'feedback' | 'build' | 'paper' | 'teach' | 'homework' | 'voice' | 'detect';
interface KindRow {
  kind: Kind;
  requests: number;
  cachedHits: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}
interface Summary {
  activeUsers: number;
  byKind: KindRow[];
}
interface Overview {
  ai: { enabled: boolean; provider: string | null; model: string | null; limits: { free: Record<Kind, number>; pro: Record<Kind, number> } };
  users: { total: number; pro: number; newToday: number; activeToday: number };
  packs: number;
  cache: { entries: number; hits: number };
  today: Summary;
  last30: Summary;
  reviews?: {
    count: number;
    appRating: number | null;
    howItWent: number | null;
    recent: { name: string; university: string | null; pack: string; howItWent: number; appRating: number | null; readiness: number | null; comment: string | null; at: number }[];
  };
}
interface AdminUser {
  id: number;
  name: string;
  email: string;
  plan: 'free' | 'pro';
  university: string | null;
  createdAt: number;
  admin: boolean;
  aiRequests30d: number;
  aiCost30d: number;
}

const KIND_LABEL: Record<Kind, string> = { simplify: 'Explain simply', tutor: 'Tutor chat', feedback: 'AI marking', build: 'Smart lessons', paper: 'AI papers', teach: 'Whiteboard lessons', homework: 'Homework problems', voice: 'Natural voice (steps)', detect: 'Paper details' };
const n = (x: number) => x.toLocaleString();
const usd = (x: number) => (x === 0 ? '$0' : x < 0.01 ? '< $0.01' : `$${x.toFixed(x < 10 ? 2 : 0)}`);

function UsageTable({ title, s }: { title: string; s: Summary }) {
  const total = s.byKind.reduce(
    (t, r) => ({ requests: t.requests + r.requests, cachedHits: t.cachedHits + r.cachedHits, tokensIn: t.tokensIn + r.tokensIn, tokensOut: t.tokensOut + r.tokensOut, costUsd: t.costUsd + r.costUsd }),
    { requests: 0, cachedHits: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
  );
  const sharedPct = total.requests ? Math.round((total.cachedHits / total.requests) * 100) : 0;
  return (
    <div className="sheet">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{title}</h2>
        <span className="small muted">
          {n(s.activeUsers)} {s.activeUsers === 1 ? 'student' : 'students'} used AI{total.requests ? `, ${sharedPct}% served free from shared answers` : ''}
        </span>
      </div>
      {s.byKind.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          No AI use yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="num">Requests</th>
                <th className="num">Shared (free)</th>
                <th className="num">Tokens in</th>
                <th className="num">Tokens out</th>
                <th className="num">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {s.byKind.map((r) => (
                <tr key={r.kind}>
                  <td>{KIND_LABEL[r.kind] || r.kind}</td>
                  <td className="num">{n(r.requests)}</td>
                  <td className="num">{n(r.cachedHits)}</td>
                  <td className="num">{n(r.tokensIn)}</td>
                  <td className="num">{n(r.tokensOut)}</td>
                  <td className="num">{usd(r.costUsd)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num">
                  <strong>{n(total.requests)}</strong>
                </td>
                <td className="num">{n(total.cachedHits)}</td>
                <td className="num">{n(total.tokensIn)}</td>
                <td className="num">{n(total.tokensOut)}</td>
                <td className="num">
                  <strong>{usd(total.costUsd)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {s.activeUsers > 0 && total.costUsd > 0 && (
        <p className="hint" style={{ margin: '8px 0 0' }}>
          About {usd(total.costUsd / s.activeUsers)} per student who used AI. Costs are estimates from token counts; your provider’s bill is the final word.
        </p>
      )}
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadOverview = useCallback(() => {
    setError(null);
    api<Overview>('/admin/overview')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const loadUsers = useCallback((query: string) => {
    api<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(query)}`)
      .then((r) => setUsers(r.users))
      .catch((e) => toast(e.message));
  }, [toast]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    loadOverview();
    loadUsers('');
  }, [user?.isAdmin, loadOverview, loadUsers]);

  if (!user?.isAdmin) return <ErrorState message="This page is for Charis Study admins." action={<Link to="/home" className="btn">Back home</Link>} />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  async function setPlan(u: AdminUser, plan: 'free' | 'pro') {
    setBusyId(u.id);
    try {
      await api('/admin/plan', { body: { userId: u.id, plan } });
      setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, plan } : x)) || null);
      toast(`${u.name} is now on ${plan === 'pro' ? 'Pro' : 'Free'}`);
      loadOverview();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const search = (e: FormEvent) => {
    e.preventDefault();
    loadUsers(q.trim());
  };
  const { ai } = data;

  return (
    <div className="stack" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { label: 'Admin' }]} />
      <div className="row between">
        <h1 className="row" style={{ margin: 0, gap: 10 }}>
          <ShieldCheck size={28} color="var(--biro)" /> Admin
        </h1>
        <button className="btn small" onClick={loadOverview}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="num">{n(data.users.total)}</span>
          <div className="lbl">students ({n(data.users.newToday)} new today)</div>
        </div>
        <div className="stat">
          <span className="num">{n(data.users.activeToday)}</span>
          <div className="lbl">studied today</div>
        </div>
        <div className="stat">
          <span className="num">{n(data.users.pro)}</span>
          <div className="lbl">on Pro</div>
        </div>
        <div className="stat">
          <span className="num">{n(data.packs)}</span>
          <div className="lbl">study packs made</div>
        </div>
      </div>

      <div className="sheet ai-card">
        <div className="row between">
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>AI helpers</h2>
          <span className={ai.enabled ? 'badge-pro' : 'chip'}>{ai.enabled ? `On: ${ai.provider}, ${ai.model}` : 'Off'}</span>
        </div>
        {ai.enabled ? (
          <>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Daily allowance</th>
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <th key={k} className="num">
                        {KIND_LABEL[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['free', 'pro'] as const).map((p) => (
                    <tr key={p}>
                      <td>{p === 'pro' ? 'Pro' : 'Free'}</td>
                      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                        <td key={k} className="num">
                          {ai.limits[p][k]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              {n(data.cache.entries)} answers saved for sharing, reused {n(data.cache.hits)} {data.cache.hits === 1 ? 'time' : 'times'}. Change allowances with AI_LIMITS_FREE and AI_LIMITS_PRO in the hosting environment variables.
            </p>
          </>
        ) : (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            The app is running on the built-in engine only. To switch AI on, add GEMINI_API_KEY (or ANTHROPIC_API_KEY) in your hosting environment variables and redeploy.
          </p>
        )}
      </div>

      {data.reviews && (
        <div className="sheet">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>After-exam reviews</h2>
            <span className="small muted">
              {n(data.reviews.count)} reviews
              {data.reviews.appRating != null ? ` · app rated ${data.reviews.appRating}/5` : ''}
              {data.reviews.howItWent != null ? ` · papers went ${data.reviews.howItWent}/5 on average` : ''}
            </span>
          </div>
          {data.reviews.recent.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              No reviews yet. Students are asked the day after each exam date.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Exam</th>
                    <th className="num">Went (1–5)</th>
                    <th className="num">Ready before</th>
                    <th className="num">App (1–5)</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reviews.recent.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <div>{r.name}</div>
                        <div className="small muted">{r.university || '—'}</div>
                      </td>
                      <td className="small">{r.pack}</td>
                      <td className="num">{r.howItWent}</td>
                      <td className="num">{r.readiness != null ? `${r.readiness}%` : '—'}</td>
                      <td className="num">{r.appRating ?? '—'}</td>
                      <td className="small" style={{ whiteSpace: 'normal', minWidth: 200 }}>
                        {r.comment || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <UsageTable title="AI use today" s={data.today} />
      <UsageTable title="AI use, last 30 days" s={data.last30} />

      <div className="sheet">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Students</h2>
          <form className="row" onSubmit={search} style={{ flexWrap: 'nowrap', gap: 6 }}>
            <input className="input" style={{ minHeight: 38, width: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search students" />
            <button className="btn small icon" aria-label="Search">
              <Search size={16} />
            </button>
          </form>
        </div>
        {!users ? (
          <Loading />
        ) : users.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            No students match that search.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>University</th>
                  <th>Joined</th>
                  <th className="num">AI uses (30 days)</th>
                  <th className="num">AI cost (30 days)</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{u.name}</div>
                      <div className="small muted">{u.email}</div>
                    </td>
                    <td className="small">{u.university || '—'}</td>
                    <td className="small">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="num">{n(u.aiRequests30d)}</td>
                    <td className="num">{usd(u.aiCost30d)}</td>
                    <td>
                      {u.admin ? (
                        <span className="badge-pro">
                          <ShieldCheck size={13} /> Admin
                        </span>
                      ) : u.plan === 'pro' ? (
                        <button className="btn small" onClick={() => setPlan(u, 'free')} disabled={busyId === u.id} title="Move back to Free">
                          <Crown size={14} color="var(--biro)" /> Pro, set Free
                        </button>
                      ) : (
                        <button className="btn small primary" onClick={() => setPlan(u, 'pro')} disabled={busyId === u.id}>
                          <Crown size={14} /> Make Pro
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ margin: '8px 0 0' }}>
          Showing the 25 newest matches. Admins are set with ADMIN_EMAILS and always get Pro allowances.
        </p>
      </div>
      <LibraryReports />
    </div>
  );
}

/** Library items students reported (copyright, wrong content…). Three reports hide an item until checked. */
function LibraryReports() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => {
    api<{ items: any[] }>('/library/admin/reports')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  };
  useEffect(() => {
    load();
  }, []);
  async function setStatus(id: number, status: 'live' | 'hidden') {
    await api(`/library/admin/${id}/status`, { body: { status } });
    load();
  }
  async function remove(id: number) {
    if (!confirm('Delete this item from the library for good?')) return;
    await api(`/library/${id}`, { method: 'DELETE' });
    load();
  }
  return (
    <div className="sheet" style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Library reports</h2>
      {!items ? (
        <p className="small muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="small muted">No reported library items.</p>
      ) : (
        <div className="stack">
          {items.map((it) => (
            <div key={it.id} className="row between" style={{ borderTop: '1px dashed var(--line)', paddingTop: 10, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <a href={`/library/${it.id}`} target="_blank" rel="noreferrer">
                  <strong>{it.title}</strong>
                </a>{' '}
                <span className="small muted">
                  · {it.reports} report{it.reports === 1 ? '' : 's'} · {it.status} · by {it.ownerEmail}
                </span>
                <div className="small">{it.reasons.map((r: any) => `${r.reason}${r.detail ? `: ${r.detail}` : ''}`).join(' | ')}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {it.status === 'live' ? (
                  <button className="btn small" onClick={() => setStatus(it.id, 'hidden')}>
                    Hide
                  </button>
                ) : (
                  <button className="btn small" onClick={() => setStatus(it.id, 'live')}>
                    Restore
                  </button>
                )}
                <button className="btn small ghost" onClick={() => remove(it.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
