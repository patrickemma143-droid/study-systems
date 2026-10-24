import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpenCheck, ChevronDown, Flag, KeyRound, Plus, Sparkles, Star, Target, Trash2, Users } from 'lucide-react';
import { api } from '../api';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { FACULTY_ICON, FACULTY_TINT, ItemCard, TYPE_ICON, typeLabel, type LibItem } from '../components/LibraryParts';
import { facultyById } from '@shared/library';

interface Detail {
  item: LibItem;
  preview: any;
  related: LibItem[];
  myRating: number | null;
  reported: boolean;
  isOwner: boolean;
  inMyPacks: number[];
  myPacks: { id: number; title: string }[];
}

const REASONS = [
  { id: 'copyright', label: 'Copyright: shared without permission' },
  { id: 'wrong', label: 'Wrong or misleading content' },
  { id: 'poor', label: 'Poor quality / unreadable' },
  { id: 'spam', label: 'Spam or not study material' },
  { id: 'other', label: 'Something else' },
];

export default function LibraryItem() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<number>(0);
  const [text, setText] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('copyright');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    setD(null);
    setText(null);
    setShowText(false);
    api<Detail>(`/library/${id}`)
      .then((r) => {
        setD(r);
        setTarget(r.myPacks[0]?.id || 0);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <ErrorState message={error} action={<Link to="/library" className="btn">Back to the library</Link>} />;
  if (!d) return <Loading />;
  const { item, preview } = d;
  const fac = facultyById(item.faculty);
  const FIcon = FACULTY_ICON[item.faculty];
  const TIcon = TYPE_ICON[item.type];

  async function add() {
    setBusy(true);
    try {
      const r = await api<{ packId: number }>(`/library/${id}/add`, { body: item.kind === 'paper' ? { packId: target } : {} });
      if (item.kind === 'pack') nav(`/pack/${r.packId}`);
      else {
        toast('Past paper added. Practise it or make a paper like it.');
        nav(`/pack/${r.packId}/paper#past-papers`);
      }
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function rate(stars: number) {
    try {
      const r = await api<{ rating: number; ratings: number }>(`/library/${id}/rate`, { body: { stars } });
      setD({ ...d!, myRating: stars, item: { ...item, rating: r.rating, ratings: r.ratings } });
      toast('Thanks for rating.');
    } catch (e: any) {
      toast(e.message);
    }
  }
  async function report() {
    try {
      await api(`/library/${id}/report`, { body: { reason, detail: detail || undefined } });
      setD({ ...d!, reported: true });
      setReporting(false);
      toast('Reported. An admin will check it.');
    } catch (e: any) {
      toast(e.message);
    }
  }
  async function remove() {
    if (!confirm('Remove this from the library? Students who already added it keep their copy.')) return;
    await api(`/library/${id}`, { method: 'DELETE' });
    toast('Removed from the library.');
    nav('/library');
  }
  async function toggleText() {
    if (!showText && text === null) {
      const r = await api<{ text: string }>(`/library/${id}/text`);
      setText(r.text);
    }
    setShowText((v) => !v);
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/library', label: 'Library' }, { to: `/library?faculty=${item.faculty}`, label: fac.short }, { label: item.title }]} />
      <div className="sheet lib-detail-head" style={{ borderLeft: `8px solid ${FACULTY_TINT[item.faculty]}` }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span className="lib-type" style={{ background: FACULTY_TINT[item.faculty] }}>
            <TIcon size={14} /> {typeLabel(item.type)}
            {item.year ? ` · ${item.year}` : ''}
          </span>
          <span className="chip">
            <FIcon size={14} /> {fac.label}
          </span>
          {item.smart && (
            <span className="chip">
              <Sparkles size={14} /> Smart pack: AI-made cards and quiz
            </span>
          )}
          {item.hasKey && (
            <span className="chip">
              <KeyRound size={14} /> Marking key included
            </span>
          )}
          {item.status !== 'live' && <span className="chip exam">Hidden while an admin checks it</span>}
        </div>
        <h1 style={{ margin: '4px 0' }}>{item.title}</h1>
        <div className="muted">
          {[item.courseCode, item.courseName, item.university, item.semester, item.author && `by ${item.author}`].filter(Boolean).join(' · ')}
        </div>
        {item.description && <p style={{ margin: '10px 0 0' }}>{item.description}</p>}
        <div className="lib-stats" style={{ marginTop: 12 }}>
          {item.kind === 'pack' ? (
            <>
              <span>{item.lessons} lessons</span>
              <span>{item.cards} flashcards</span>
              <span>{Math.max(1, Math.round(item.words / 200))} min reading</span>
            </>
          ) : (
            <span>{item.cards} questions</span>
          )}
          <span>
            <Users size={13} /> {item.uses} student{item.uses === 1 ? '' : 's'} use this
          </span>
          {item.rating != null && (
            <span>
              <Star size={13} /> {item.rating.toFixed(1)} ({item.ratings})
            </span>
          )}
          {item.sharedBy && <span>Shared by {item.sharedBy}</span>}
        </div>

        <div className="row" style={{ marginTop: 16, gap: 10, flexWrap: 'wrap' }}>
          {item.kind === 'pack' ? (
            d.inMyPacks.length ? (
              <Link to={`/pack/${d.inMyPacks[0]}`} className="btn primary">
                <BookOpenCheck size={17} /> Open my copy
              </Link>
            ) : (
              <button className="btn primary" onClick={add} disabled={busy}>
                <Plus size={17} /> {busy ? 'Adding…' : 'Add to my study packs'}
              </button>
            )
          ) : d.myPacks.length ? (
            <>
              <select className="input" value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Which of your study packs" style={{ maxWidth: 280 }}>
                {d.myPacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    For: {p.title}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={add} disabled={busy || !target}>
                <Plus size={17} /> {busy ? 'Adding…' : 'Add to this pack'}
              </button>
            </>
          ) : (
            <span className="small muted">Make a study pack for this course first (or add its notes from the library), then add this past paper to it.</span>
          )}
          <button className="btn" onClick={toggleText}>
            <ChevronDown size={16} style={{ transform: showText ? 'rotate(180deg)' : undefined }} /> {showText ? 'Hide the full text' : 'Read the full text'}
          </button>
        </div>
      </div>

      {showText && text !== null && (
        <article className="page lib-text" aria-label="Full text">
          {text || 'No text available.'}
        </article>
      )}

      {preview && item.kind === 'pack' && (
        <div className="grid cols-2" style={{ alignItems: 'start', marginTop: 18 }}>
          <div className="sheet">
            <h3 style={{ marginTop: 0 }}>Lessons</h3>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {preview.lessons.slice(0, 40).map((l: any) => (
                <li key={l.index} style={{ marginBottom: 8 }}>
                  <strong>{l.title}</strong> <span className="small muted">· {l.minutes} min</span>
                  {l.nutshell && <div className="small muted">{l.nutshell}</div>}
                </li>
              ))}
            </ol>
          </div>
          <div className="stack">
            {preview.objectives.length > 0 && (
              <div className="sheet objectives-card">
                <h3 style={{ marginTop: 0 }} className="row">
                  <Target size={18} /> You’ll be able to
                </h3>
                <ul className="objectives">
                  {preview.objectives.map((o: string, i: number) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.sampleCards.length > 0 && (
              <div className="sheet">
                <h3 style={{ marginTop: 0 }}>Sample flashcards</h3>
                {preview.sampleCards.map((c: any, i: number) => (
                  <details key={i} className="lib-sample">
                    <summary>{c.front}</summary>
                    <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                      {c.back}
                    </div>
                  </details>
                ))}
                <div className="small muted" style={{ marginTop: 8 }}>
                  {item.cards} cards, {preview.questions} quiz questions and {preview.terms} key terms come with it.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {preview && item.kind === 'paper' && (
        <div className="sheet" style={{ marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>How this paper is set</h3>
          <div className="small">
            {preview.questions} questions{preview.totalMarks ? ` · ${preview.totalMarks} marks` : ''}
            {preview.duration ? ` · ${preview.duration}` : ''}
          </div>
          {preview.sections.length > 0 && (
            <ul className="small" style={{ paddingLeft: 20 }}>
              {preview.sections.map((s: any) => (
                <li key={s.name}>
                  <strong>Section {s.name}</strong>: {s.questions} questions{s.marks ? `, ${s.marks} marks` : ''}
                  {s.instruction ? ` — ${s.instruction}` : ''}
                </li>
              ))}
            </ul>
          )}
          {preview.sample.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 10 }}>
                First questions
              </div>
              <ol className="small" style={{ paddingLeft: 20 }}>
                {preview.sample.map((q: string, i: number) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {q}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      <div className="sheet row between" style={{ marginTop: 18, flexWrap: 'wrap', gap: 12 }}>
        {!d.isOwner ? (
          <div className="row" style={{ gap: 6 }} aria-label="Rate this">
            <span className="small muted">{d.myRating ? 'Your rating' : 'Was it useful?'}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="star-btn" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={(d.myRating || 0) >= n} onClick={() => rate(n)}>
                <Star size={20} />
              </button>
            ))}
          </div>
        ) : (
          <span className="small muted">You shared this. You earn Helper points every time a classmate adds it.</span>
        )}
        <div className="row" style={{ gap: 8 }}>
          {d.isOwner ? (
            <button className="btn ghost small" onClick={remove}>
              <Trash2 size={15} /> Remove from library
            </button>
          ) : d.reported ? (
            <span className="small muted">You reported this.</span>
          ) : (
            <button className="btn ghost small" onClick={() => setReporting((v) => !v)}>
              <Flag size={15} /> Report
            </button>
          )}
        </div>
        {reporting && (
          <div className="stack" style={{ width: '100%' }}>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
              {REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Anything we should know? (optional)" maxLength={500} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary small" onClick={report}>
                Send report
              </button>
            </div>
          </div>
        )}
      </div>

      {d.related.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>More for {item.courseCode}</h2>
          </div>
          <div className="lib-grid">
            {d.related.map((it) => (
              <ItemCard key={it.id} item={it} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
