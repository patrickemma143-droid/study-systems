import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { api, type User } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/ui';
import { save, store } from '../lib/util';

type Theme = 'system' | 'light' | 'dark';

function applyTheme(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem('cs-theme');
    else localStorage.setItem('cs-theme', t);
  } catch {
    /* ignore */
  }
}

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: user?.name || '', university: user?.university || '', course: user?.course || '', dailyGoal: user?.dailyGoal || 20 });
  const [theme, setTheme] = useState<Theme>(() => (store<string | null>('cs-theme', null) as Theme) || 'system');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [delPw, setDelPw] = useState('');

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: { ...form, university: form.university || null, course: form.course || null, dailyGoal: Number(form.dailyGoal) } });
      setUser(r.user);
      toast('Profile saved');
    } catch (err: any) {
      toast(err.message);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setMsg({});
    try {
      await api('/auth/password', { body: pw });
      setPw({ current: '', next: '' });
      setMsg({ ok: 'Password changed.' });
    } catch (err: any) {
      setMsg({ err: err.message });
    }
  }

  async function deleteAccount() {
    if (!window.confirm('Delete your account and all your study packs for good? This can’t be undone.')) return;
    try {
      await api('/auth/me', { method: 'DELETE', body: { password: delPw } });
      save('cs-timer', null);
      window.location.href = '/';
    } catch (err: any) {
      toast(err.message);
    }
  }

  const pickTheme = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }} className="stack">
      <h1>Your profile</h1>

      <form className="sheet stack" onSubmit={saveProfile}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>About you</h2>
        <div className="field">
          <label htmlFor="pn">Name</label>
          <input id="pn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="pu">University</label>
            <input id="pu" className="input" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pc">Course</label>
            <input id="pc" className="input" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="pg">Daily study goal (minutes)</label>
          <input id="pg" className="input" type="number" min={5} max={500} step={5} value={form.dailyGoal} onChange={(e) => setForm({ ...form, dailyGoal: Number(e.target.value) })} style={{ maxWidth: 160 }} />
          <span className="hint">20–30 minutes a day beats one long night before the exam.</span>
        </div>
        <div>
          <button className="btn primary">Save profile</button>
        </div>
      </form>

      <div className="sheet stack">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Appearance</h2>
        <div className="segmented" role="group" aria-label="Theme">
          <button aria-pressed={theme === 'system'} onClick={() => pickTheme('system')}>
            <Monitor size={16} /> Match my device
          </button>
          <button aria-pressed={theme === 'light'} onClick={() => pickTheme('light')}>
            <Sun size={16} /> Light
          </button>
          <button aria-pressed={theme === 'dark'} onClick={() => pickTheme('dark')}>
            <Moon size={16} /> Dark
          </button>
        </div>
        <span className="hint">Dark is easier on the eyes for late-night reading.</span>
      </div>

      <form className="sheet stack" onSubmit={changePassword}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Change password</h2>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="cp">Current password</label>
            <input id="cp" className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="np">New password</label>
            <input id="np" className="input" type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
        </div>
        {msg.ok && <div className="ok-box">{msg.ok}</div>}
        {msg.err && <div className="error-box">{msg.err}</div>}
        <div>
          <button className="btn" disabled={!pw.current || pw.next.length < 8}>
            Change password
          </button>
        </div>
      </form>

      <div className="sheet row between">
        <div>
          <strong>Log out</strong>
          <div className="small muted">Your packs and progress stay saved in your account.</div>
        </div>
        <button
          className="btn"
          onClick={async () => {
            await logout();
            nav('/');
          }}
        >
          <LogOut size={18} /> Log out
        </button>
      </div>

      <div className="sheet stack">
        <h2 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--bad)' }}>Delete account</h2>
        <p className="small muted" style={{ margin: 0 }}>
          This removes your account, every study pack, flashcard and note. Enter your password to confirm.
        </p>
        <div className="row">
          <input className="input" type="password" placeholder="Your password" value={delPw} onChange={(e) => setDelPw(e.target.value)} style={{ maxWidth: 260 }} aria-label="Password to confirm deletion" />
          <button className="btn danger" onClick={deleteAccount} disabled={!delPw}>
            Delete my account
          </button>
        </div>
      </div>

      <p className="small muted" style={{ textAlign: 'center' }}>
        Charis Study by Charis Creations. The study engine runs on our own server — your notes are never sent to an outside AI service.
      </p>
    </div>
  );
}
