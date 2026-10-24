import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth';
import { Logo } from '../components/ui';

const UNIVERSITIES = [
  'Makerere University',
  'Kyambogo University',
  'Makerere University Business School (MUBS)',
  'Uganda Christian University',
  'Mbarara University of Science and Technology',
  'Gulu University',
  'Busitema University',
  'Kampala International University',
  'Uganda Martyrs University',
  'Ndejje University',
  'Nkumba University',
  'Islamic University in Uganda',
  'Kabale University',
  'Muni University',
  'Lira University',
  'Soroti University',
  'Victoria University',
  'Cavendish University Uganda',
  'Bugema University',
  'Uganda Management Institute',
];

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', university: '', course: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === 'login';

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register({ name: form.name, email: form.email, password: form.password, university: form.university || undefined, course: form.course || undefined });
      const next = new URLSearchParams(location.search).get('next');
      nav(next && next.startsWith('/') && !next.startsWith('//') ? next : '/home', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <Link to="/" className="brand" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <Logo size={40} />
          <span style={{ fontSize: '1.3rem' }}>Charis Study</span>
        </Link>
        <form className="sheet stack" onSubmit={submit} noValidate>
          <div>
            <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>{isLogin ? 'Welcome back' : 'Create your free account'}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {isLogin ? 'Log in to continue where you stopped.' : 'Your study packs and progress are saved to your account, so you can switch between phone and laptop.'}
            </p>
          </div>
          {!isLogin && (
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" className="input" autoComplete="name" value={form.name} onChange={set('name')} required />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={set('password')}
                required
                minLength={isLogin ? 1 : 8}
                style={{ paddingRight: 52 }}
              />
              <button type="button" className="btn ghost icon small" style={{ position: 'absolute', right: 5, top: 5 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {!isLogin && <span className="hint">At least 8 characters.</span>}
          </div>
          {!isLogin && (
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor="uni">University (optional)</label>
                <input id="uni" className="input" list="unis" value={form.university} onChange={set('university')} />
                <datalist id="unis">
                  {UNIVERSITIES.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="course">Course (optional)</label>
                <input id="course" className="input" placeholder="e.g. BSc Nursing" value={form.course} onChange={set('course')} />
              </div>
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary big block" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
          </button>
          <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
            {isLogin ? (
              <>
                New here? <Link to={`/register${location.search}`}>Create a free account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link to={`/login${location.search}`}>Log in</Link>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
