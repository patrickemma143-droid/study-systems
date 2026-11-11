// Home: one question ("what do you want to learn?"), three big ways in, then what to continue and
// your packs. Everything else is one tap away in the short row at the bottom.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bone, CalendarClock, CalendarDays, Camera, FileText, Flame, Globe, Layers, LibraryBig, Play, Plus, Presentation, Shuffle, Sparkles, StickyNote, Target, Timer, Trophy, Upload, Users } from 'lucide-react';
import { api, type PackSummary, type Stats } from '../api';
import { useAuth } from '../auth';
import { Loading, Ring, useToast } from '../components/ui';
import { daysUntil, examLabel, greeting, plural, today } from '../lib/util';
import type { PlanSession } from './Plan';
import { ExamReview, pendingReviews, readyColor } from '../components/Readiness';
import { useAiStatus } from '../lib/ai';
import { TutorPicker } from '../components/TutorPicker';
import { TutorCharacter, type CharacterControl } from '../components/TutorCharacter';
import { useTutorPrefs } from '../lib/tutor/prefs';
import { DEFAULT_PREFS, tutorById } from '../../shared/tutors';
import { LEVELS } from '../../shared/tutor';

interface TutorSummary {
  id: number;
  mode: string;
  title: string;
  step: number;
  steps: number;
}
const TOPIC_IDEAS = ['Photosynthesis', 'Supply and demand', 'Ohm’s law', 'The cardiac cycle'];

const SOURCE_ICON: Record<string, typeof FileText> = { pdf: FileText, docx: FileText, pptx: Presentation, topic: Globe, paste: StickyNote, txt: StickyNote, anatomy: Bone };

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [making, setMaking] = useState(false);
  const [nextSession, setNextSession] = useState<PlanSession | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof pendingReviews>>>([]);
  const ai = useAiStatus();
  const [topic, setTopic] = useState('');
  const [examPick, setExamPick] = useState(false);
  const [lessons, setLessons] = useState<TutorSummary[]>([]);
  const [checkins, setCheckins] = useState(0);
  const tp = useTutorPrefs();
  const [picker, setPicker] = useState(false);
  const persona = tutorById(tp.prefs?.tutor);
  const control = useRef<CharacterControl>({ x: 0, sit: false, act: 'wave', side: 'right', speaking: false, pulse: 0 });

  useEffect(() => {
    api<{ packs: PackSummary[] }>('/packs')
      .then((r) => setPacks(r.packs ?? []))
      .catch(() => setPacks((p) => p ?? []));
    api<Stats>(`/study/stats?day=${today()}`)
      .then(setStats)
      .catch(() => {});
    api<{ sessions: PlanSession[] }>(`/plan?from=${today()}`)
      .then((r) => setNextSession((r.sessions ?? []).find((s) => s.day === today() && s.status === 'planned') || null))
      .catch(() => {});
    pendingReviews()
      .then(setReviews)
      .catch(() => {});
    api<{ due: unknown[] }>('/mastery/checkins')
      .then((r) => setCheckins(r.due?.length || 0))
      .catch(() => {});
    api<{ lessons: TutorSummary[] }>('/tutor/lessons')
      .then((r) => setLessons(r.lessons ?? []))
      .catch(() => {});
    // the tutor waves hello, then relaxes
    const t = window.setTimeout(() => (control.current.act = 'idle'), 2200);
    return () => window.clearTimeout(t);
  }, []);

  /** "Teach me …": the whiteboard tutor when the AI is on, otherwise a study pack from the topic. */
  async function learnTopic(e?: FormEvent, t = topic) {
    e?.preventDefault();
    const what = t.trim();
    if (what.length < 2) return toast('Type what you want to learn first.');
    if (ai?.enabled) return nav(`/tutor/new?mode=topic&topic=${encodeURIComponent(what)}`);
    setMaking(true);
    try {
      const r = await api<{ id: number }>('/packs/topic', { body: { topic: what } });
      nav(`/pack/${r.id}?new=1`);
    } catch (err: any) {
      toast(err.message);
      setMaking(false);
    }
  }

  async function trySample() {
    setMaking(true);
    try {
      const r = await api<{ id: number }>('/packs/sample', { method: 'POST' });
      nav(`/pack/${r.id}?new=1`);
    } catch (e: any) {
      toast(e.message);
      setMaking(false);
    }
  }

  if (!packs || !stats) return <Loading />;
  const first = user?.name.split(' ')[0] || 'there';

  return (
    <>
      <section className="home-hero">
        <button className="home-tutor" onClick={() => setPicker(true)} title="Change your tutor or voice" aria-label={`Your tutor is ${persona.name}. Change tutor or voice`}>
          <TutorCharacter tutor={persona.id} control={control} height={150} />
          <span className="home-tutor-name">{persona.name}</span>
        </button>
        <div className="home-ask">
          <p className="learn-hi">
            {greeting()}, {first}
          </p>
          <h1>What do you want to learn?</h1>
          <form className="learn-box" onSubmit={learnTopic}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Type any topic…" aria-label="Topic to learn" />
            <button className="btn primary" disabled={making}>
              <Play size={16} /> {ai?.enabled ? 'Teach me' : 'Make lessons'}
            </button>
          </form>
          {ai?.enabled && (
            <div className="level-pick" role="radiogroup" aria-label="How deep should the tutor go?">
              <span>Level</span>
              {LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={(tp.prefs?.level || 'university') === l.id} title={l.hint} onClick={() => void tp.save({ ...(tp.prefs || DEFAULT_PREFS), level: l.id })}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
          <div className="learn-ideas">
            {TOPIC_IDEAS.map((t) => (
              <button key={t} className="chip" onClick={() => learnTopic(undefined, t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="home-actions">
        <Link to="/new" className="home-action">
          <Upload size={22} />
          <strong>Upload notes</strong>
          <span>PDF, slides, Word or photos</span>
        </Link>
        <Link to="/homework" className="home-action">
          <Camera size={22} />
          <strong>Snap homework</strong>
          <span>Worked out with you, step by step</span>
        </Link>
        <button className={`home-action ${examPick ? 'on' : ''}`} onClick={() => (packs.length ? setExamPick((x) => !x) : nav('/new'))}>
          <Target size={22} />
          <strong>Exam prep</strong>
          <span>{packs.length ? 'Pick a course and go' : 'Add your course notes first'}</span>
        </button>
      </div>
      {examPick && packs.length > 0 && (
        <div className="home-exam">
          {packs.slice(0, 8).map((p) => (
            <Link key={p.id} to={ai?.enabled ? `/tutor/new?mode=exam&pack=${p.id}` : `/pack/${p.id}/coach`} className="chip">
              {p.title}
            </Link>
          ))}
        </div>
      )}

      {(lessons.length > 0 || stats.dueCards > 0 || nextSession || checkins > 0) && (
        <div className="continue-row">
          {checkins > 0 && (
            <Link to="/checkin" className="continue-card due">
              <Sparkles size={20} />
              <span>
                <strong>Check-in: {plural(checkins, 'idea')} from earlier</strong>
                <span className="small muted">About {Math.max(1, Math.round(checkins * 0.4))} min · keep what you learned</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {stats.dueCards > 0 && (
            <Link to="/review" className="continue-card due">
              <Layers size={20} />
              <span>
                <strong>Review {plural(stats.dueCards, 'card')}</strong>
                <span className="small muted">About {Math.max(1, Math.round(stats.dueCards * 0.2))} min</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {nextSession && (
            <Link to="/plan" className="continue-card">
              <CalendarClock size={20} />
              <span>
                <strong>{nextSession.title || 'Study session'}</strong>
                <span className="small muted">Today’s plan · {nextSession.start}</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {lessons.slice(0, stats.dueCards > 0 ? 2 : 3).map((l) => (
            <Link key={l.id} to={`/tutor/${l.id}`} className="continue-card">
              <Play size={18} />
              <span>
                <strong>{l.title}</strong>
                <span className="continue-bar">
                  <span style={{ width: `${Math.round(((l.step + 1) / Math.max(1, l.steps)) * 100)}%` }} />
                </span>
              </span>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      )}

      {reviews.length > 0 && (
        <div className="stack" style={{ marginBottom: 18 }}>
          {reviews.slice(0, 1).map((r) => (
            <ExamReview key={r.packId} p={r} onDone={() => setReviews((list) => list.filter((x) => x.packId !== r.packId))} />
          ))}
        </div>
      )}

      {packs.length > 0 && (
        <div className="home-stats" aria-label="Your progress">
          <span>
            <Flame size={17} color={stats.streak ? 'var(--warn)' : 'var(--ink-3)'} /> <strong>{stats.streak}</strong> {stats.streak === 1 ? 'day' : 'days'} in a row
          </span>
          <span>
            <Timer size={17} /> <strong>{stats.today.minutes}</strong> / {stats.today.goal} min today
          </span>
          <span>
            <Layers size={17} /> <strong>{stats.strongCards}</strong> cards remembered
          </span>
        </div>
      )}

      {stats.exams.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Exams coming up</h2>
          </div>
          <div className="grid cols-3">
            {stats.exams.map((e) => {
              const d = daysUntil(e.examDate)!;
              return (
                <Link key={e.packId} to={`/pack/${e.packId}${d <= 2 ? '/cram' : ''}`} className="sheet tight row" style={{ textDecoration: 'none', color: 'inherit', gap: 14 }}>
                  <div style={{ textAlign: 'center', minWidth: 54 }}>
                    <div style={{ fontSize: '1.7rem', fontWeight: 600, lineHeight: 1, color: d <= 2 ? 'var(--bad)' : 'var(--ink)' }}>{d}</div>
                    <div className="small muted">{d === 1 ? 'day' : 'days'}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="list-title">{e.title}</div>
                    {e.readiness ? (
                      <div className="small" style={{ color: readyColor(e.readiness.score), fontWeight: 600 }}>
                        {e.readiness.score}% ready
                      </div>
                    ) : (
                      <div className="small muted">{d <= 2 ? 'Open the cram plan' : 'Open'}</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2>Your study packs</h2>
          {packs.length > 0 && (
            <Link to="/new" className="btn small">
              <Plus size={15} /> New
            </Link>
          )}
        </div>
        {packs.length === 0 ? (
          <div className="sheet empty">
            <Sparkles size={34} color="var(--biro)" style={{ margin: '0 auto 12px' }} />
            <h2>Add your first notes</h2>
            <p className="muted" style={{ maxWidth: 460, margin: '0 auto 20px' }}>
              Upload a lecture PDF, slides or Word notes — you get bite-size lessons, flashcards and a quiz in seconds.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link to="/new" className="btn primary big">
                <Plus size={18} /> Add notes
              </Link>
              <button className="btn big" onClick={trySample} disabled={making}>
                {making ? 'Preparing…' : 'Try a sample lecture'}
              </button>
            </div>
          </div>
        ) : (
          <div className="sheet" style={{ padding: '6px 20px' }}>
            <div className="list">
              {packs.map((p) => {
                const Icon = SOURCE_ICON[p.sourceType] || FileText;
                const exam = examLabel(p.examDate);
                const d = daysUntil(p.examDate);
                return (
                  <Link key={p.id} to={`/pack/${p.id}`} className="list-row">
                    <span className="list-num" style={{ border: 0, background: 'var(--paper-2)' }}>
                      <Icon size={18} />
                    </span>
                    <span className="list-body">
                      <span className="list-title" style={{ display: 'block', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </span>
                      <span className="list-sub row" style={{ gap: 8 }}>
                        <span>{plural(p.stats.chunks, 'lesson')}</span>
                        {exam && d !== null && d >= 0 && (
                          <span className="chip exam">
                            <CalendarDays size={13} /> {exam}
                          </span>
                        )}
                        {p.due > 0 && <span className="chip">{p.due} due</span>}
                      </span>
                    </span>
                    <Ring value={p.mastery} size={42} stroke={5} color={p.mastery >= 70 ? 'var(--good)' : 'var(--biro)'} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <nav className="home-more" aria-label="More ways to study">
        <Link to="/library">
          <LibraryBig size={18} /> Library
        </Link>
        <Link to="/anatomy">
          <Bone size={18} /> Anatomy 3D
        </Link>
        <Link to="/classes">
          <Users size={18} /> Classes
        </Link>
        <Link to="/plan">
          <CalendarClock size={18} /> Timetable
        </Link>
        <Link to="/ranks">
          <Trophy size={18} /> Rankings
        </Link>
        {packs.length >= 2 && (
          <Link to="/quiz/mixed">
            <Shuffle size={18} /> Mixed quiz
          </Link>
        )}
      </nav>

      {picker && (
        <TutorPicker
          prefs={tp.prefs || DEFAULT_PREFS}
          natural={tp.natural}
          onClose={() => setPicker(false)}
          onSave={async (p) => {
            await tp.save(p);
            toast(`${tutorById(p.tutor).name} will teach you from now on.`);
          }}
        />
      )}
    </>
  );
}
