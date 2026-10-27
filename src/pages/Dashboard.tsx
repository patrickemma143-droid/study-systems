import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpenText, Camera, CalendarClock, CalendarDays, FileText, Flame, Globe, GraduationCap, Layers, Lightbulb, Play, Plus, Presentation, Shuffle, Sparkles, StickyNote, LibraryBig, Target, Trophy, Upload, Users, Bone } from 'lucide-react';
import { api, type PackSummary, type Stats } from '../api';
import { useAuth } from '../auth';
import { Loading, Ring, useToast } from '../components/ui';
import { daysUntil, examLabel, greeting, plural, today } from '../lib/util';
import { SessionRow, type PlanSession } from './Plan';
import { ExamReview, pendingReviews, readyColor } from '../components/Readiness';
import { useAiStatus } from '../lib/ai';
import { TutorFace } from '../components/TutorFace';
import { TutorPicker } from '../components/TutorPicker';
import { useTutorPrefs } from '../lib/tutor/prefs';
import { DEFAULT_PREFS, tutorById } from '../../shared/tutors';

interface TutorSummary {
  id: number;
  mode: string;
  title: string;
  step: number;
  steps: number;
}
type LearnMode = 'topic' | 'notes' | 'exam' | 'homework';
const TOPIC_IDEAS = ['Photosynthesis', 'Supply and demand', 'Ohm’s law', 'The cardiac cycle', 'Differentiation', 'Contract law basics'];

const SOURCE_ICON: Record<string, typeof FileText> = { pdf: FileText, docx: FileText, pptx: Presentation, topic: Globe, paste: StickyNote, txt: StickyNote, anatomy: Bone };

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [making, setMaking] = useState(false);
  const [todayPlan, setTodayPlan] = useState<PlanSession[] | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof pendingReviews>>>([]);
  const ai = useAiStatus();
  const [mode, setMode] = useState<LearnMode>('topic');
  const [topic, setTopic] = useState('');
  const [pick, setPick] = useState<number | ''>('');
  const [lessons, setLessons] = useState<TutorSummary[]>([]);
  const tp = useTutorPrefs();
  const [picker, setPicker] = useState(false);
  const persona = tutorById(tp.prefs?.tutor);

  useEffect(() => {
    api<{ packs: PackSummary[] }>('/packs').then((r) => setPacks(r.packs ?? []))
      .catch(() => setPacks((p) => p ?? []));
    api<Stats>(`/study/stats?day=${today()}`)
      .then(setStats)
      .catch(() => {});
    api<{ sessions: PlanSession[] }>(`/plan?from=${today()}`)
      .then((r) => setTodayPlan((r.sessions ?? []).filter((s) => s.day === today())))
      .catch(() => setTodayPlan([]));
    pendingReviews()
      .then(setReviews)
      .catch(() => {});
    api<{ lessons: TutorSummary[] }>('/tutor/lessons')
      .then((r) => setLessons(r.lessons ?? []))
      .catch(() => {});
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
  const maxWeek = Math.max(...stats.week.map((w) => w.minutes), 1);
  const goalPct = Math.min(100, (stats.today.minutes / Math.max(1, stats.today.goal)) * 100);

  return (
    <>
      <section className="learn-hero">
        <div className="learn-hero-head">
          <button className="learn-face" onClick={() => setPicker(true)} title="Choose your tutor and voice" aria-label={`Your tutor is ${persona.name}. Choose another tutor or voice`}>
            <TutorFace size={58} look={persona.look} />
            <span>{persona.name}</span>
          </button>
          <div>
            <p className="learn-hi">
              {greeting()}, {first}
            </p>
            <h1>What do you want to learn today?</h1>
          </div>
        </div>
        <div className="learn-tabs" role="tablist">
          {(
            [
              ['topic', Lightbulb, 'Topic'],
              ['notes', BookOpenText, 'My notes'],
              ['exam', Target, 'Exam prep'],
              ['homework', Camera, 'Homework'],
            ] as const
          ).map(([m, Icon, label]) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
        {mode === 'topic' && (
          <form className="learn-box" onSubmit={learnTopic}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis, the Krebs cycle, supply and demand…" aria-label="Topic to learn" />
            <button className="btn primary" disabled={making}>
              <Play size={16} /> {ai?.enabled ? 'Teach me' : 'Make lessons'}
            </button>
          </form>
        )}
        {mode === 'topic' && (
          <div className="learn-ideas">
            {TOPIC_IDEAS.map((t) => (
              <button key={t} className="chip" onClick={() => learnTopic(undefined, t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        {mode === 'notes' && (
          <div className="learn-split">
            <Link to="/new" className="learn-card">
              <Upload size={22} />
              <strong>Upload notes, slides or a textbook</strong>
              <span className="small muted">PDF, PowerPoint, Word or photos. We break it into bite-size lessons.</span>
            </Link>
            <div className="learn-card">
              <GraduationCap size={22} />
              <strong>Teach me one of my packs</strong>
              {packs.length ? (
                <div className="row" style={{ gap: 6, width: '100%' }}>
                  <select className="input" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')} aria-label="Study pack" style={{ flex: 1, minWidth: 0 }}>
                    <option value="">Choose a pack…</option>
                    {packs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary" disabled={!pick} onClick={() => nav(ai?.enabled ? `/tutor/new?mode=lesson&pack=${pick}&chunk=0` : `/pack/${pick}`)}>
                    <Play size={16} />
                  </button>
                </div>
              ) : (
                <span className="small muted">Upload notes first, then the tutor teaches them on the board.</span>
              )}
            </div>
          </div>
        )}
        {mode === 'exam' && (
          <div className="learn-split">
            <div className="learn-card">
              <Target size={22} />
              <strong>Help me study for my test</strong>
              <span className="small muted">A fast board review of the must-knows, how they’re examined, and practice.</span>
              {packs.length ? (
                <div className="row" style={{ gap: 6, width: '100%' }}>
                  <select className="input" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')} aria-label="Study pack for the exam" style={{ flex: 1, minWidth: 0 }}>
                    <option value="">Which course?</option>
                    {packs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary" disabled={!pick} onClick={() => nav(ai?.enabled ? `/tutor/new?mode=exam&pack=${pick}` : `/pack/${pick}/coach`)}>
                    <Play size={16} />
                  </button>
                </div>
              ) : (
                <Link to="/new" className="btn small">
                  <Plus size={15} /> Add your course notes first
                </Link>
              )}
            </div>
            <div className="learn-card">
              <CalendarClock size={22} />
              <strong>Exam tomorrow?</strong>
              <span className="small muted">Open a pack’s cram plan, the exam coach or a mock paper in the examiner’s style.</span>
              {pick ? (
                <div className="row" style={{ gap: 6 }}>
                  <Link to={`/pack/${pick}/cram`} className="btn small">
                    Cram plan
                  </Link>
                  <Link to={`/pack/${pick}/coach`} className="btn small">
                    Exam coach
                  </Link>
                  <Link to={`/pack/${pick}/paper`} className="btn small">
                    Mock paper
                  </Link>
                </div>
              ) : (
                <span className="small muted">Choose the course on the left.</span>
              )}
            </div>
          </div>
        )}
        {mode === 'homework' && (
          <div className="learn-split">
            <Link to="/homework" className="learn-card hot">
              <Camera size={24} />
              <strong>Snap a problem</strong>
              <span className="small">Homework or a past-paper question: we work it out together on the board, then you try one.</span>
            </Link>
            <Link to="/homework" className="learn-card">
              <StickyNote size={22} />
              <strong>Type the question</strong>
              <span className="small muted">Maths, chemistry, physics, accounting, law problems — any subject.</span>
            </Link>
          </div>
        )}
      </section>
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

      {(lessons.length > 0 || stats.dueCards > 0) && (
        <div className="continue-row">
          {stats.dueCards > 0 && (
            <Link to="/review" className="continue-card due">
              <Layers size={20} />
              <span>
                <strong>Review {plural(stats.dueCards, 'card')}</strong>
                <span className="small muted">Ready now — about {Math.max(1, Math.round(stats.dueCards * 0.2))} min</span>
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

      {packs.length > 0 && (
        <div className="stats">
          <div className="stat">
            <div className="row" style={{ gap: 8 }}>
              <Flame size={22} color={stats.streak ? 'var(--warn)' : 'var(--ink-3)'} />
              <span className="num">{stats.streak}</span>
            </div>
            <div className="lbl">{stats.streak === 1 ? 'day streak' : 'days in a row'}</div>
          </div>
          <div className="stat row" style={{ gap: 14 }}>
            <Ring value={goalPct} size={58} stroke={6} label={`${stats.today.minutes}`} />
            <div className="lbl">
              of {stats.today.goal} minutes
              <br />
              studied today
            </div>
          </div>
          <div className="stat">
            <span className="num">
              {stats.strongCards}
              <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>
                {' '}
                / {stats.totalCards}
              </span>
            </span>
            <div className="lbl">cards in long-term memory</div>
          </div>
          <div className="stat">
            <div className="weekbars" aria-label="Minutes studied this week">
              {stats.week.map((w) => (
                <div className="col" key={w.day} title={`${w.day}: ${w.minutes} min, ${w.reviews} cards`}>
                  <div className={`b ${w.minutes || w.reviews ? '' : 'zero'}`} style={{ height: `${Math.max(4, (w.minutes / maxWeek) * 64)}px` }} />
                  <span className="d">{new Date(`${w.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="stack" style={{ marginBottom: 18 }}>
          {reviews.slice(0, 2).map((r) => (
            <ExamReview key={r.packId} p={r} onDone={() => setReviews((list) => list.filter((x) => x.packId !== r.packId))} />
          ))}
        </div>
      )}

      {packs.length > 0 && todayPlan && (
        <div className="section">
          <div className="section-head">
            <h2>Today’s plan</h2>
            <Link to="/plan" className="btn small">
              <CalendarClock size={16} /> {todayPlan.length ? 'Full timetable' : 'Make my timetable'}
            </Link>
          </div>
          {todayPlan.length ? (
            <div className="sheet tight">
              {todayPlan.map((s) => (
                <SessionRow key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <div className="sheet tight small muted">Tell us when you’re free and we’ll plan every session around your exams, and remind you when it’s time.</div>
          )}
        </div>
      )}

      {stats.exams.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Coming up</h2>
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
                    <div className="small muted">{d <= 2 ? 'Open the cram plan' : new Date(`${e.examDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
                    {e.readiness && (
                      <div className="small" style={{ color: readyColor(e.readiness.score), fontWeight: 600 }}>
                        {e.readiness.score}% ready · {e.readiness.label}
                      </div>
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
          {packs.length > 0 && <span className="muted small">{plural(packs.length, 'pack')}</span>}
        </div>
        {packs.length === 0 ? (
          <div className="sheet empty">
            <Sparkles size={34} color="var(--biro)" style={{ margin: '0 auto 12px' }} />
            <h2>Add your first notes</h2>
            <p className="muted" style={{ maxWidth: 460, margin: '0 auto 20px' }}>
              Upload a lecture PDF, slides or Word notes, paste text, or type a topic. You will get bite-size lessons, flashcards and a quiz in seconds.
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
                        <span>
                          {plural(p.stats.chunks, 'lesson')}, {plural(p.stats.cards, 'card')}
                        </span>
                        {exam && d !== null && d >= 0 && (
                          <span className="chip exam">
                            <CalendarDays size={13} /> {exam}
                          </span>
                        )}
                        {p.due > 0 && <span className="chip">{p.due} due</span>}
                      </span>
                    </span>
                    <Ring value={p.mastery} size={46} stroke={5} color={p.mastery >= 70 ? 'var(--good)' : 'var(--biro)'} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="section">
        <div className="section-head">
          <h2>More ways to study</h2>
        </div>
        <div className="tools-grid">
          <Link to="/library" className="tool-tile">
            <LibraryBig size={22} />
            <strong>Library</strong>
            <span className="small muted">Notes, books and past papers</span>
          </Link>
          <Link to="/anatomy" className="tool-tile">
            <Bone size={22} />
            <strong>Anatomy 3D</strong>
            <span className="small muted">The whole body, part by part</span>
          </Link>
          <Link to="/classes" className="tool-tile">
            <Users size={22} />
            <strong>Classes</strong>
            <span className="small muted">Study with your class</span>
          </Link>
          <Link to="/plan" className="tool-tile">
            <CalendarClock size={22} />
            <strong>Timetable</strong>
            <span className="small muted">Sessions planned for you</span>
          </Link>
          <Link to="/ranks" className="tool-tile">
            <Trophy size={22} />
            <strong>Rankings</strong>
            <span className="small muted">This week’s top students</span>
          </Link>
          {packs.length >= 2 && (
            <Link to="/quiz/mixed" className="tool-tile">
              <Shuffle size={22} />
              <strong>Mixed quiz</strong>
              <span className="small muted">Questions from all your packs</span>
            </Link>
          )}
          <Link to="/new" className="tool-tile">
            <Plus size={22} />
            <strong>New study pack</strong>
            <span className="small muted">From a file, notes or a topic</span>
          </Link>
        </div>
      </div>
    </>
  );
}
