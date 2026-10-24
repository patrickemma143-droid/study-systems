import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CalendarDays, FileText, Flame, Globe, Layers, Plus, Presentation, Shuffle, Sparkles, StickyNote, LibraryBig, Users } from 'lucide-react';
import { api, type PackSummary, type Stats } from '../api';
import { useAuth } from '../auth';
import { Loading, Ring, useToast } from '../components/ui';
import { daysUntil, examLabel, greeting, plural, today } from '../lib/util';
import { SessionRow, type PlanSession } from './Plan';
import { ExamReview, pendingReviews, readyColor } from '../components/Readiness';

const SOURCE_ICON: Record<string, typeof FileText> = { pdf: FileText, docx: FileText, pptx: Presentation, topic: Globe, paste: StickyNote, txt: StickyNote };

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [making, setMaking] = useState(false);
  const [todayPlan, setTodayPlan] = useState<PlanSession[] | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof pendingReviews>>>([]);

  useEffect(() => {
    api<{ packs: PackSummary[] }>('/packs').then((r) => setPacks(r.packs));
    api<Stats>(`/study/stats?day=${today()}`).then(setStats);
    api<{ sessions: PlanSession[] }>(`/plan?from=${today()}`)
      .then((r) => setTodayPlan(r.sessions.filter((s) => s.day === today())))
      .catch(() => setTodayPlan([]));
    pendingReviews()
      .then(setReviews)
      .catch(() => {});
  }, []);

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
      <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 22 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {greeting()}, {first}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {stats.dueCards > 0
              ? `${plural(stats.dueCards, 'flashcard')} ${stats.dueCards === 1 ? 'is' : 'are'} ready for review.`
              : packs.length
                ? 'Nothing due right now. A short quiz keeps it fresh.'
                : 'Add your first notes to get started.'}
          </p>
        </div>
        <div className="row">
          {stats.dueCards > 0 && (
            <Link to="/review" className="btn primary">
              <Layers size={18} /> Review {stats.dueCards} cards
            </Link>
          )}
          {packs.length >= 2 && (
            <Link to="/quiz/mixed" className="btn">
              <Shuffle size={18} /> Mixed quiz
            </Link>
          )}
          <Link to="/new" className={`btn ${stats.dueCards > 0 ? '' : 'primary'}`}>
            <Plus size={18} /> New study pack
          </Link>
        </div>
      </div>

      <div className="quick-links">
        <Link to="/library" className="quick-link">
          <LibraryBig size={18} /> <span><strong>Library</strong><span className="small muted">Notes, books and past papers from other students</span></span>
        </Link>
        <Link to="/classes" className="quick-link">
          <Users size={18} /> <span><strong>Classes</strong><span className="small muted">Study with your class: shared notes and a class ranking</span></span>
        </Link>
      </div>

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
    </>
  );
}
