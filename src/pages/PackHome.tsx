import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpenCheck, CalendarDays, Check, Download, Target, ExternalLink, FileUp, Pencil, PartyPopper, Play, Presentation, Trash2, X } from 'lucide-react';
import { useAiStatus } from '../lib/ai';
import { TutorFace } from '../components/TutorFace';
import { api } from '../api';
import { useAuth } from '../auth';
import { AiPackExplainer, SmartPackBuilder } from '../components/AiPanels';
import { ReadinessCard } from '../components/Readiness';
import { LibraryMatch, PackLibraryCard } from '../components/PackLibrary';
import { Bar, Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { METHODS, methodById, recommend } from '../methods';
import { invalidatePack, usePack } from '../lib/usePack';
import { daysUntil, examLabel, plural } from '../lib/util';
import { buildOutline } from '@shared/engine/outline';
import { downloadPack, isDownloaded } from '../lib/offline';

const PREFS = [
  { id: 'reading', label: 'Reading' },
  { id: 'listening', label: 'Listening' },
  { id: 'seeing', label: 'Seeing pictures' },
  { id: 'doing', label: 'Testing myself' },
] as const;

export default function PackHome() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const aiTutor = useAiStatus();
  const { data, error, reload } = usePack(id);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [editExam, setEditExam] = useState<string | null>(null);
  const [match, setMatch] = useState<'checking' | 'none' | 'found'>('checking');
  const [offline, setOffline] = useState<'no' | 'saving' | 'saved'>(() => (isDownloaded(id) ? 'saved' : 'no'));

  const outline = useMemo(() => (data ? data.pack.data.outline ?? buildOutline(data.pack.data) : null), [data]);
  const done = useMemo(() => (data ? Object.values(data.progress).filter((p) => p.status === 'understood' || p.status === 'mastered').length : 0), [data]);

  if (error) return <ErrorState message={error} action={<Link to="/home" className="btn">Back home</Link>} />;
  if (!data) return <Loading />;

  const { pack, progress, cards, quiz } = data;
  const d = pack.data;
  const daysLeft = daysUntil(pack.examDate);
  const picks = recommend(daysLeft, user?.preference ?? null, done, d.chunks.length);
  const others = METHODS.filter((m) => !picks.some((p) => p.id === m.id));
  const nextLesson = d.chunks.find((c) => !progress[c.index] || progress[c.index].status === 'new' || progress[c.index].status === 'read')?.index ?? 0;
  const bestQuiz = quiz.length ? Math.max(...quiz.map((q) => Math.round((q.score / q.total) * 100))) : null;
  const pathFor = (p: string) => (p === 'learn/0' ? `learn/${nextLesson}` : p);

  async function saveMeta(body: { title?: string; examDate?: string | null }) {
    try {
      await api(`/packs/${id}`, { method: 'PATCH', body });
      invalidatePack(id);
      await reload();
      setEditTitle(null);
      setEditExam(null);
      toast('Saved');
    } catch (e: any) {
      toast(e.message);
    }
  }

  async function setPref(pref: string) {
    const r = await api<{ user: any }>('/auth/me', { method: 'PATCH', body: { preference: user?.preference === pref ? null : pref } });
    setUser(r.user);
  }

  async function remove() {
    if (!window.confirm(`Delete “${pack.title}” and all its flashcards and progress? This can’t be undone.`)) return;
    await api(`/packs/${id}`, { method: 'DELETE' });
    invalidatePack(id);
    toast('Study pack deleted');
    nav('/home');
  }

  return (
    <>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { label: pack.title }]} />

      {params.get('new') && (
        <div className="callout" style={{ marginBottom: 20 }}>
          <PartyPopper size={22} />
          <div>
            <strong>Your study pack is ready.</strong> We made {plural(d.stats.chunks, 'short lesson')}, {plural(d.stats.cards, 'flashcard')} and {plural(d.stats.questions, 'quiz question')} from{' '}
            {plural(d.stats.words, 'word')}. Pick a way to study below.
          </div>
        </div>
      )}

      {params.get('new') && !pack.libraryItemId && <LibraryMatch packId={id} onResult={(found) => setMatch(found ? 'found' : 'none')} />}

      <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
        {editTitle !== null ? (
          <form
            className="row"
            style={{ flex: 1 }}
            onSubmit={(e) => {
              e.preventDefault();
              saveMeta({ title: editTitle });
            }}
          >
            <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus style={{ flex: 1, fontSize: '1.3rem' }} aria-label="Pack name" />
            <button className="btn primary icon" aria-label="Save name">
              <Check size={18} />
            </button>
            <button type="button" className="btn icon" onClick={() => setEditTitle(null)} aria-label="Cancel">
              <X size={18} />
            </button>
          </form>
        ) : (
          <h1 style={{ marginBottom: 0 }}>
            {pack.title}{' '}
            <button className="btn ghost icon small" style={{ verticalAlign: 'middle' }} onClick={() => setEditTitle(pack.title)} aria-label="Rename pack">
              <Pencil size={16} />
            </button>
          </h1>
        )}
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 22 }}>
        <span className="chip">
          {plural(d.stats.chunks, 'lesson')}, about {d.stats.readMinutes} min reading
        </span>
        {editExam !== null ? (
          <span className="row" style={{ gap: 6 }}>
            <input type="date" className="input" style={{ minHeight: 36, padding: '4px 10px', width: 'auto' }} value={editExam} onChange={(e) => setEditExam(e.target.value)} aria-label="Exam date" />
            <button className="btn small primary" onClick={() => saveMeta({ examDate: editExam || null })}>
              Save
            </button>
            {pack.examDate && (
              <button className="btn small ghost" onClick={() => saveMeta({ examDate: null })}>
                Remove
              </button>
            )}
          </span>
        ) : (
          <button className={`chip ${daysLeft !== null && daysLeft >= 0 ? 'exam' : ''}`} onClick={() => setEditExam(pack.examDate || '')}>
            <CalendarDays size={14} /> {examLabel(pack.examDate) || 'Add exam date'}
          </button>
        )}
        <button
          className="chip"
          disabled={offline === 'saving'}
          onClick={async () => {
            setOffline('saving');
            try {
              await downloadPack(id);
              setOffline('saved');
              toast('Saved on this device. You can study its lessons and flashcards without data.');
            } catch (e: any) {
              setOffline('no');
              toast(e.message);
            }
          }}
        >
          <Download size={14} /> {offline === 'saved' ? 'Saved for offline ✓' : offline === 'saving' ? 'Saving…' : 'Save for offline'}
        </button>
      </div>

      <div className="grid cols-3">
        <div className="sheet tight">
          <div className="row between small">
            <span>Lessons understood</span>
            <strong>
              {done}/{d.chunks.length}
            </strong>
          </div>
          <div style={{ marginTop: 8 }}>
            <Bar value={(done / Math.max(1, d.chunks.length)) * 100} good />
          </div>
        </div>
        <div className="sheet tight">
          <div className="row between small">
            <span>Cards remembered</span>
            <strong>
              {cards.growing + cards.strong}/{cards.total}
            </strong>
          </div>
          <div style={{ marginTop: 8 }}>
            <Bar value={((cards.growing + cards.strong) / Math.max(1, cards.total)) * 100} />
          </div>
        </div>
        <div className="sheet tight">
          <div className="row between small">
            <span>Best quiz score</span>
            <strong>{bestQuiz === null ? 'Not yet' : `${bestQuiz}%`}</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            <Bar value={bestQuiz ?? 0} good={(bestQuiz ?? 0) >= 70} />
          </div>
        </div>
      </div>

      {data.readiness && (pack.examDate || data.readiness.score > 0) && <ReadinessCard r={data.readiness} packId={id} />}

      <div className="sheet tight row between ai-card" style={{ marginTop: 18, borderLeftColor: 'var(--hl-orange)' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <strong className="row" style={{ gap: 8 }}>
            <FileUp size={18} color="var(--biro)" /> Got past papers for this course?
          </strong>
          <div className="small muted">Upload them with their marking keys. We learn how your examiners set questions, let you practise the real papers, and make new mock papers in the same style.</div>
        </div>
        <Link to="paper#past-papers" className="btn primary">
          <FileUp size={16} /> Upload a past paper
        </Link>
      </div>

      {aiTutor?.enabled && (
        <section className="tutor-banner">
          <TutorFace size={58} />
          <div className="tutor-banner-text">
            <strong>Let the tutor teach it</strong>
            <span className="small muted">Every lesson taught step by step on a whiteboard, out loud. Stop and ask questions any time.</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link to={`/tutor/new?mode=lesson&pack=${id}&chunk=0`} className="btn primary">
              <Presentation size={17} /> Teach me this pack
            </Link>
            <Link to={`/tutor/new?mode=exam&pack=${id}`} className="btn">
              <Play size={16} /> Exam prep
            </Link>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>How do you want to study?</h2>
        </div>
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          <span className="small muted">I enjoy:</span>
          {PREFS.map((p) => (
            <button key={p.id} className="chip" aria-pressed={user?.preference === p.id} onClick={() => setPref(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="methods fit">
          {picks.map((p) => {
            const m = methodById(p.id);
            return (
              <Link key={m.id} to={pathFor(m.path)} className="method suggested" style={{ ['--tint' as any]: m.tint }}>
                <div className="row between">
                  <span className="glyph">
                    <m.icon size={20} />
                  </span>
                  <span className="why">{p.why}</span>
                </div>
                <h3>{m.name}</h3>
                <p>{m.blurb}</p>
                <span className="meta">{m.time}</span>
              </Link>
            );
          })}
        </div>
        <h3 style={{ margin: '26px 0 12px' }}>More ways to study</h3>
        <div className="methods">
          {others.map((m) => (
            <Link key={m.id} to={pathFor(m.path)} className="method" style={{ ['--tint' as any]: m.tint }}>
              <span className="glyph">
                <m.icon size={20} />
              </span>
              <h3>{m.name}</h3>
              <p>{m.blurb}</p>
              <span className="meta">Best for: {m.bestFor.toLowerCase()}</span>
            </Link>
          ))}
        </div>
      </section>

      {(d.simpleIntro || d.overview.length > 0) && (
        <section className="section grid cols-2" style={{ alignItems: 'start' }}>
          {d.simpleIntro && (
            <div className="sheet">
              <h3>In simple words</h3>
              <p style={{ margin: 0 }}>{d.simpleIntro.split('\n')[0]}</p>
            </div>
          )}
          {d.overview.length > 0 && (
            <div className="sheet" style={d.simpleIntro ? undefined : { gridColumn: '1 / -1' }}>
              <h3>What this is about</h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {d.overview.map((o, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Lessons</h2>
          <Link to={`learn/${nextLesson}`} className="btn small">
            <BookOpenCheck size={16} /> {done ? 'Continue' : 'Start lesson 1'}
          </Link>
        </div>
        <SmartPackBuilder
          packId={id}
          lessons={d.chunks.map((c) => c.index)}
          smartDone={Object.keys(d.smart?.lessons || {}).map(Number)}
          autoStart={!!params.get('new') && (match === 'none' || !!pack.libraryItemId)}
          onSaved={() => {
            invalidatePack(id);
            reload();
          }}
        />
        <AiPackExplainer packId={id} lessons={d.chunks.map((c) => c.index)} />
        {outline && (outline.stated.length > 0 || outline.statedTopics.length > 0) && (
          <div className="sheet outline-card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginTop: 0 }}>
              <Target size={18} /> {outline.stated.length ? 'What your lecturer expects you to be able to do' : 'Course outline'}
            </h3>
            {outline.stated.length > 0 && (
              <ul className="objectives">
                {outline.stated.slice(0, 10).map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
            {outline.stated.length > 0 && outline.statedTopics.length > 0 && <div className="small muted" style={{ margin: '10px 0 4px' }}>Course outline</div>}
            {outline.statedTopics.length > 0 && (
              <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
                {outline.statedTopics.slice(0, 16).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            )}
          </div>
        )}
        <div className="sheet" style={{ padding: '4px 20px' }}>
          <div className="list">
            {(outline && outline.topics.length >= 2 && outline.topics.length < d.chunks.length ? outline.topics : [{ title: '', chunks: d.chunks.map((c) => c.index) }]).map((topic, ti) => (
              <div key={ti}>
                {topic.title && (
                  <div className="topic-head">
                    <span className="small muted">Topic {ti + 1}</span> {topic.title}
                  </div>
                )}
                {topic.chunks.map((ci) => {
                  const c = d.chunks[ci];
                  if (!c) return null;
                  const st = progress[c.index]?.status || 'new';
                  const cs = cards.byChunk[c.index];
                  const objs = outline?.objectives[c.index]?.length || 0;
                  return (
                    <Link key={c.index} to={`learn/${c.index}`} className="list-row">
                      <span className={`list-num ${st}`}>{st === 'understood' || st === 'mastered' ? <Check size={16} /> : c.index + 1}</span>
                      <span className="list-body">
                        <span className="list-title" style={{ display: 'block' }}>
                          {c.title}
                        </span>
                        <span className="list-sub">
                          {c.readMinutes} min
                          {objs ? `, ${plural(objs, 'objective')}` : ''}
                          {cs ? `, ${cs.known}/${cs.total} cards remembered` : ''}
                          {c.importance >= 0.75 ? ', likely to be examined' : ''}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <PackLibraryCard packId={id} libraryItemId={pack.libraryItemId ?? null} sharedItemId={pack.sharedItemId ?? null} onShared={reload} />

      {d.resources && d.resources.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Learn more for free</h2>
          </div>
          <div className="grid cols-3">
            {d.resources.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="sheet tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between">
                  <strong>{r.name}</strong>
                  <ExternalLink size={16} color="var(--ink-3)" />
                </div>
                <div className="small muted">{r.note}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section no-print">
        <button className="btn danger small" onClick={remove}>
          <Trash2 size={16} /> Delete this study pack
        </button>
      </section>
    </>
  );
}
