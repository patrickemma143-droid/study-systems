import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Plus, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorState, Loading, useToast } from '../components/ui';
import { examLabel } from '../lib/util';

interface ClassRow {
  id: number;
  name: string;
  courseCode: string | null;
  university: string | null;
  examDate: string | null;
  role: 'owner' | 'rep' | 'member';
  joinCode: string | null;
  members: number;
}

export default function Classes() {
  const { code } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState(code || '');
  const [making, setMaking] = useState(false);
  const [form, setForm] = useState({ name: '', courseCode: '', university: user?.university || '', examDate: '' });
  const [busy, setBusy] = useState(false);
  const joined = useRef(false);

  useEffect(() => {
    api<{ classes: ClassRow[] }>('/classes')
      .then((r) => setRows(r.classes))
      .catch((e) => setError(e.message));
  }, []);
  // a join link (/join/ABC123) joins straight away
  useEffect(() => {
    if (code && !joined.current) {
      joined.current = true;
      void join(code);
    }
  }, [code]);

  async function join(c: string) {
    setBusy(true);
    try {
      const r = await api<{ id: number; name: string }>('/classes/join', { body: { code: c } });
      toast(`You joined ${r.name}.`);
      nav(`/class/${r.id}`, { replace: true });
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ id: number }>('/classes', { body: { name: form.name, courseCode: form.courseCode || null, university: form.university || null, examDate: form.examDate || null } });
      nav(`/class/${r.id}`);
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!rows) return <Loading />;

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <h1 className="row">
        <Users size={28} color="var(--biro)" /> Classes
      </h1>
      <p className="muted" style={{ maxWidth: 660 }}>
        Study together. Your course rep or lecturer shares the notes, past papers and exam date once, and everyone in the class gets them — with a class ranking to keep you going.
      </p>

      <div className="grid cols-2" style={{ alignItems: 'start', marginTop: 10 }}>
        <form
          className="sheet stack"
          onSubmit={(e) => {
            e.preventDefault();
            void join(joinCode);
          }}
        >
          <strong>Join a class</strong>
          <span className="small muted">Ask your course rep for the class code.</span>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. K7MX2Q" aria-label="Class code" maxLength={12} style={{ flex: 1, letterSpacing: '.12em', fontWeight: 600 }} />
            <button className="btn primary" disabled={busy || joinCode.trim().length < 4}>
              Join
            </button>
          </div>
        </form>
        <div className="sheet stack">
          <strong>Start a class</strong>
          <span className="small muted">For course reps, class leaders and lecturers.</span>
          {!making ? (
            <button className="btn" onClick={() => setMaking(true)}>
              <Plus size={16} /> Create a class
            </button>
          ) : (
            <form className="stack" onSubmit={create}>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Class name, e.g. BSc Nursing Year 2" aria-label="Class name" required minLength={3} maxLength={160} />
              <div className="row" style={{ gap: 8 }}>
                <input className="input" value={form.courseCode} onChange={(e) => setForm({ ...form, courseCode: e.target.value })} placeholder="Course code (optional)" aria-label="Course code" maxLength={40} style={{ flex: 1 }} />
                <input className="input" type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} aria-label="Exam date" style={{ flex: 1 }} />
              </div>
              <input className="input" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} placeholder="University" aria-label="University" maxLength={160} />
              <button className="btn primary" disabled={busy || form.name.trim().length < 3}>
                Create the class
              </button>
            </form>
          )}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>My classes</h2>
        </div>
        {rows.length === 0 ? (
          <div className="sheet empty">
            <p className="muted" style={{ margin: 0 }}>
              You are not in a class yet. Join with a code, or start one for your course.
            </p>
          </div>
        ) : (
          <div className="lib-grid">
            {rows.map((c) => (
              <Link key={c.id} to={`/class/${c.id}`} className="lib-card">
                <div className="lib-card-top">
                  <span className="lib-type" style={{ background: 'var(--hl-blue)' }}>
                    <Users size={14} /> {c.members} member{c.members === 1 ? '' : 's'}
                  </span>
                  {c.role !== 'member' && <span className="lib-flag">{c.role === 'owner' ? 'You run it' : 'Course rep'}</span>}
                </div>
                <div className="lib-title">{c.name}</div>
                <div className="lib-meta">{[c.courseCode, c.university].filter(Boolean).join(' · ') || ' '}</div>
                {c.examDate && (
                  <div className="lib-stats">
                    <span>
                      <CalendarDays size={13} /> {examLabel(c.examDate)}
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
