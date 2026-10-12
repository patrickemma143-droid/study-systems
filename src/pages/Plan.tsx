import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, BookOpen, CalendarPlus, Check, Layers, ListChecks, Pencil, Plus, RefreshCw, Trash2, Wand2, Zap, type LucideIcon } from 'lucide-react';
import type { StudyPrefs, Window } from '@shared/timetable';
import { api, type PackSummary } from '../api';
import { Crumbs, Loading, useToast } from '../components/ui';
import { deviceSubscribed, disablePush, enablePush, pushSupport, tzOffset } from '../lib/push';
import { today } from '../lib/util';

export interface PlanSession {
  id: number;
  packId: number | null;
  day: string;
  start: string;
  minutes: number;
  kind: 'review' | 'learn' | 'quiz' | 'recall' | 'cram';
  title: string;
  status: 'planned' | 'done' | 'skipped';
  startsAt: number;
  link: string;
}

interface Settings {
  prefs: StudyPrefs;
  reminderTime: string;
  remindersOn: boolean;
  tzOffset: number;
  devices: number;
  pushKey: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
export const KIND: Record<PlanSession['kind'], { label: string; icon: LucideIcon; tone: string }> = {
  review: { label: 'Flashcards', icon: Layers, tone: 'var(--biro)' },
  learn: { label: 'Learn', icon: BookOpen, tone: 'var(--good)' },
  quiz: { label: 'Quiz', icon: ListChecks, tone: 'var(--warn)' },
  recall: { label: 'Recall', icon: Pencil, tone: '#8a4fd8' },
  cram: { label: 'Cram', icon: Zap, tone: 'var(--bad)' },
};

export function dayLabel(day: string) {
  const t = today();
  const tomorrow = new Date(`${t}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === t) return 'Today';
  if (day === today(tomorrow)) return 'Tomorrow';
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

export function SessionRow({ s, onStatus }: { s: PlanSession; onStatus?: (s: PlanSession, status: PlanSession['status']) => void }) {
  const k = KIND[s.kind];
  const Icon = k.icon;
  const done = s.status === 'done';
  return (
    <div className={`session-row ${s.status}`} style={{ ['--tone' as any]: k.tone }}>
      <div className="session-time">
        <strong>{s.start}</strong>
        <span className="small muted">{s.minutes} min</span>
      </div>
      <div className="session-body">
        <span className="session-kind">
          <Icon size={13} /> {k.label}
        </span>
        <div className="session-title">{s.title}</div>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        {!done && (
          <Link to={s.link} className="btn small primary">
            Start
          </Link>
        )}
        {onStatus && (
          <button className={`btn small icon ${done ? 'primary' : ''}`} aria-pressed={done} aria-label={done ? 'Mark as not done' : 'Mark as done'} title={done ? 'Done' : 'Mark as done'} onClick={() => onStatus(s, done ? 'planned' : 'done')}>
            <Check size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Plan() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [prefs, setPrefs] = useState<StudyPrefs | null>(null);
  const [sessions, setSessions] = useState<PlanSession[] | null>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thisDevice, setThisDevice] = useState(false);

  useEffect(() => {
    api<Settings>('/plan/settings').then((s) => {
      setSettings(s);
      setPrefs(s.prefs);
      if (!s.prefs.setup) setEditing(true);
    });
    api<{ sessions: PlanSession[] }>(`/plan?from=${today()}`).then((r) => setSessions(r.sessions));
    api<{ packs: PackSummary[] }>('/packs').then((r) => setPacks(r.packs));
    deviceSubscribed().then(setThisDevice).catch(() => {});
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, PlanSession[]>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${today()}T12:00:00`);
      d.setDate(d.getDate() + i);
      m.set(today(d), []);
    }
    for (const s of sessions || []) m.get(s.day)?.push(s);
    return [...m.entries()];
  }, [sessions]);

  if (!settings || !prefs || !sessions) return <Loading />;

  async function build(p = prefs!) {
    setBusy(true);
    try {
      await api('/plan/settings', { method: 'PUT', body: { prefs: { ...p, setup: true }, tzOffset: tzOffset() } });
      const r = await api<{ sessions: PlanSession[] }>('/plan/generate', { body: { tzOffset: tzOffset() } });
      setSessions(r.sessions);
      setPrefs({ ...p, setup: true });
      setEditing(false);
      toast(r.sessions.length ? `Timetable ready: ${r.sessions.length} sessions this week` : 'Saved. Add free time or study packs to fill your timetable.');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: PlanSession, status: PlanSession['status']) {
    setSessions((list) => list && list.map((x) => (x.id === s.id ? { ...x, status } : x)));
    await api(`/plan/sessions/${s.id}`, { method: 'PATCH', body: { status } }).catch((e) => toast(e.message));
  }

  const setDay = (d: number, windows: Window[]) => setPrefs({ ...prefs, windows: { ...prefs.windows, [d]: windows } });
  const total = sessions.filter((s) => s.status !== 'skipped').length;
  const doneCount = sessions.filter((s) => s.status === 'done').length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { label: 'Timetable' }]} />
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0 }}>Your timetable</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Built around your free time and exam dates: nearest exams and unread lessons first, flashcards when they fall due.
          </p>
        </div>
        {!editing && (
          <div className="row">
            <button className="btn" onClick={() => setEditing(true)}>
              <Pencil size={16} /> My free time
            </button>
            <button className="btn" onClick={() => build()} disabled={busy}>
              <RefreshCw size={16} /> Rebuild
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="sheet stack">
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{prefs.setup ? 'Your free time' : 'Let’s plan your week'}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            When can you usually study? Add the times you’re free outside lectures. Short, regular sessions beat long ones.
          </p>
          <div className="free-days">
            {ORDER.map((d) => (
              <div key={d} className="free-day">
                <strong className="free-day-name">{DAYS[d].slice(0, 3)}</strong>
                <div className="row" style={{ gap: 6 }}>
                  {(prefs.windows[d] || []).map((w, i) => (
                    <span key={i} className="free-window">
                      <input type="time" value={w.start} aria-label={`${DAYS[d]} from`} onChange={(e) => setDay(d, prefs.windows[d].map((x, k) => (k === i ? { ...x, start: e.target.value } : x)))} />
                      –
                      <input type="time" value={w.end} aria-label={`${DAYS[d]} until`} onChange={(e) => setDay(d, prefs.windows[d].map((x, k) => (k === i ? { ...x, end: e.target.value } : x)))} />
                      <button className="btn ghost icon small" aria-label="Remove this time" onClick={() => setDay(d, prefs.windows[d].filter((_, k) => k !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  ))}
                  {(prefs.windows[d] || []).length < 4 && (
                    <button className="chip" onClick={() => setDay(d, [...(prefs.windows[d] || []), d === 0 || d === 6 ? { start: '10:00', end: '12:00' } : { start: '19:00', end: '21:00' }])}>
                      <Plus size={13} /> Add time
                    </button>
                  )}
                  {!(prefs.windows[d] || []).length && <span className="small muted">Rest day</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="grid cols-2" style={{ gap: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Session length
              </div>
              <div className="segmented" role="group" aria-label="Session length">
                {[25, 45, 60, 90].map((m) => (
                  <button key={m} aria-pressed={prefs.sessionMinutes === m} onClick={() => setPrefs({ ...prefs, sessionMinutes: m })}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="bed" style={{ display: 'block', marginBottom: 6 }}>
                I usually sleep at
              </label>
              <input id="bed" type="time" className="input" style={{ maxWidth: 160 }} value={prefs.bedtime} onChange={(e) => setPrefs({ ...prefs, bedtime: e.target.value || '23:00' })} />
            </div>
          </div>
          <ExamDates packs={packs} onChange={setPacks} />
          <div className="row">
            <button className="btn primary big" onClick={() => build()} disabled={busy}>
              <Wand2 size={18} /> {busy ? 'Planning…' : prefs.setup ? 'Save and rebuild' : 'Build my timetable'}
            </button>
            {prefs.setup && (
              <button className="btn ghost" onClick={() => { setPrefs(settings.prefs); setEditing(false); }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <Reminders settings={settings} onChange={setSettings} thisDevice={thisDevice} setThisDevice={setThisDevice} />

      {!editing && (
        <>
          {total > 0 && (
            <div className="row between" style={{ margin: '18px 0 8px' }}>
              <span className="small muted">
                {doneCount} of {total} sessions done this week
              </span>
              <a className="btn small" href="/api/plan/calendar.ics" download>
                <CalendarPlus size={15} /> Add to my phone calendar
              </a>
            </div>
          )}
          {packs.length === 0 && (
            <div className="sheet empty" style={{ marginTop: 18 }}>
              <h2>Add your notes first</h2>
              <p className="muted">Your timetable is built from your study packs and their exam dates.</p>
              <Link to="/new" className="btn primary">
                <Plus size={18} /> New study pack
              </Link>
            </div>
          )}
          <div className="stack" style={{ marginTop: 6 }}>
            {byDay.map(([day, list]) => (
              <div key={day} className="sheet tight">
                <div className="row between" style={{ marginBottom: list.length ? 6 : 0 }}>
                  <strong>{dayLabel(day)}</strong>
                  <span className="small muted">{list.length ? `${list.reduce((n, s) => n + s.minutes, 0)} min` : 'Free day'}</span>
                </div>
                {list.map((s) => (
                  <SessionRow key={s.id} s={s} onStatus={setStatus} />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExamDates({ packs, onChange }: { packs: PackSummary[]; onChange: (p: PackSummary[]) => void }) {
  const toast = useToast();
  if (!packs.length) return null;
  async function save(p: PackSummary, examDate: string) {
    onChange(packs.map((x) => (x.id === p.id ? { ...x, examDate: examDate || null } : x)));
    await api(`/packs/${p.id}`, { method: 'PATCH', body: { examDate: examDate || null } }).catch((e) => toast(e.message));
  }
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>
        Exam dates
      </div>
      {packs.map((p) => (
        <div key={p.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'nowrap' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
          <input type="date" className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }} value={p.examDate || ''} min={today()} onChange={(e) => save(p, e.target.value)} aria-label={`Exam date for ${p.title}`} />
        </div>
      ))}
    </div>
  );
}

function Reminders({ settings, onChange, thisDevice, setThisDevice }: { settings: Settings; onChange: (s: Settings) => void; thisDevice: boolean; setThisDevice: (b: boolean) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  async function turnOn() {
    setBusy(true);
    try {
      const s = await enablePush(settings.pushKey);
      onChange(s as Settings);
      setThisDevice(true);
      await api('/plan/settings', { method: 'PUT', body: { tzOffset: tzOffset() } });
      await api('/plan/push/test', { method: 'POST' }).catch(() => {});
      toast('Reminders are on. We just sent a test.');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function turnOff() {
    setBusy(true);
    await disablePush();
    const s = await api<Settings>('/plan/settings', { method: 'PUT', body: { remindersOn: false } });
    onChange(s);
    setThisDevice(false);
    setBusy(false);
    toast('Reminders are off.');
  }
  async function setTime(t: string) {
    const s = await api<Settings>('/plan/settings', { method: 'PUT', body: { reminderTime: t, tzOffset: tzOffset() } });
    onChange(s);
  }

  const on = settings.remindersOn && thisDevice;
  return (
    <div className="sheet tight" style={{ marginTop: 14 }}>
      <div className="row between">
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          {on ? <Bell size={20} color="var(--biro)" /> : <BellOff size={20} color="var(--ink-3)" />}
          <div>
            <strong>Reminders</strong>
            <div className="small muted">
              {on
                ? 'We’ll remind you 10 minutes before each session, plus a daily nudge about due flashcards and exams.'
                : support === 'ios-install'
                  ? 'On iPhone: tap Share, then “Add to Home Screen”, open Charis Study from there, then turn reminders on.'
                  : support === 'blocked'
                    ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.'
                    : support === 'unsupported'
                      ? 'This browser can’t show reminders. Try Chrome on Android, or add your timetable to your phone calendar.'
                      : 'Get a reminder before each session and a daily nudge, even when the app is closed.'}
            </div>
          </div>
        </div>
        {support === 'ok' &&
          (on ? (
            <button className="btn small" onClick={turnOff} disabled={busy}>
              Turn off
            </button>
          ) : (
            <button className="btn small primary" onClick={turnOn} disabled={busy}>
              <Bell size={15} /> Turn on
            </button>
          ))}
      </div>
      {on && (
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <label className="small" htmlFor="rt">
            Daily reminder at
          </label>
          <input id="rt" type="time" className="input" style={{ width: 'auto', minHeight: 34, padding: '2px 8px' }} value={settings.reminderTime} onChange={(e) => e.target.value && setTime(e.target.value)} />
          <button className="btn ghost small" onClick={() => api('/plan/push/test', { method: 'POST' }).then(() => toast('Test reminder sent')).catch((e) => toast(e.message))}>
            Send a test
          </button>
        </div>
      )}
    </div>
  );
}
