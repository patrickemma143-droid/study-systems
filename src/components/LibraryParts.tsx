// Shared pieces of the library: item cards, faculty icons and the "share to library" form.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Briefcase, Cog, FileQuestion, FlaskConical, Folder, GraduationCap, KeyRound, Laptop, Library as LibraryIcon, Presentation, Scale, Sparkles, Sprout, Star, Stethoscope, Users } from 'lucide-react';
import { api } from '../api';
import { FACULTIES, facultyById, ITEM_TYPES } from '@shared/library';

export interface LibItem {
  id: number;
  kind: 'pack' | 'paper';
  type: 'notes' | 'slides' | 'book' | 'paper';
  title: string;
  faculty: string;
  university: string | null;
  courseCode: string | null;
  courseName: string | null;
  year: number | null;
  semester: string | null;
  author: string | null;
  description: string | null;
  words: number;
  lessons: number;
  cards: number;
  smart: boolean;
  hasKey: boolean;
  uses: number;
  rating: number | null;
  ratings: number;
  status: string;
  sharedBy: string | null;
  createdAt: number;
}

export const FACULTY_ICON: Record<string, typeof Cog> = {
  medicine: Stethoscope,
  engineering: Cog,
  computing: Laptop,
  business: Briefcase,
  law: Scale,
  education: GraduationCap,
  agriculture: Sprout,
  sciences: FlaskConical,
  humanities: BookOpen,
  other: Folder,
};
export const FACULTY_TINT: Record<string, string> = {
  medicine: 'var(--hl-pink)',
  engineering: 'var(--hl-orange)',
  computing: 'var(--hl-blue)',
  business: 'var(--hl-yellow)',
  law: 'var(--hl-purple)',
  education: 'var(--hl-green)',
  agriculture: 'var(--hl-green)',
  sciences: 'var(--hl-blue)',
  humanities: 'var(--hl-purple)',
  other: 'var(--paper-2)',
};
export const TYPE_ICON: Record<string, typeof Cog> = { notes: BookOpen, slides: Presentation, book: LibraryIcon, paper: FileQuestion };
export const typeLabel = (t: string) => ITEM_TYPES.find((x) => x.id === t)?.label || t;

export function ItemCard({ item }: { item: LibItem }) {
  const Icon = TYPE_ICON[item.type] || BookOpen;
  const FIcon = FACULTY_ICON[item.faculty] || Folder;
  return (
    <Link to={`/library/${item.id}`} className="lib-card">
      <div className="lib-card-top">
        <span className="lib-type" style={{ background: FACULTY_TINT[item.faculty] }}>
          <Icon size={14} /> {typeLabel(item.type)}
          {item.type === 'paper' && item.year ? ` ${item.year}` : ''}
        </span>
        {item.smart && (
          <span className="lib-flag" title="Cards and quiz made by the AI">
            <Sparkles size={13} /> Smart
          </span>
        )}
        {item.hasKey && (
          <span className="lib-flag" title="Comes with the marking key">
            <KeyRound size={13} /> Key
          </span>
        )}
      </div>
      <div className="lib-title">{item.title}</div>
      <div className="lib-meta">
        {[item.courseCode, item.university].filter(Boolean).join(' · ') || facultyById(item.faculty).short}
      </div>
      <div className="lib-stats">
        <span>
          <FIcon size={13} /> {facultyById(item.faculty).short}
        </span>
        {item.kind === 'pack' ? <span>{item.lessons} lessons</span> : <span>{item.cards} questions</span>}
        <span>
          <Users size={13} /> {item.uses}
        </span>
        {item.rating != null && (
          <span>
            <Star size={13} /> {item.rating.toFixed(1)}
          </span>
        )}
      </div>
    </Link>
  );
}

interface Suggestion {
  title: string;
  faculty: string;
  type: string;
  university: string;
  courseCode: string;
  courseName: string;
  year: number | null;
  semester: string | null;
  author: string | null;
  description: string | null;
}

/** The form for putting a study pack or past paper into the library. */
export function ShareToLibrary({ packId, paperId, onDone, onCancel }: { packId?: number; paperId?: number; onDone: (id: number) => void; onCancel?: () => void }) {
  const [s, setS] = useState<Suggestion | null>(null);
  const [sharedId, setSharedId] = useState<number | null>(null);
  const [dup, setDup] = useState<{ id: number; title: string } | null>(null);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ suggestion: Suggestion; sharedItemId: number | null; duplicate: { id: number; title: string } | null }>(`/library/suggest?${packId ? `packId=${packId}` : `paperId=${paperId}`}`)
      .then((r) => {
        setS(r.suggestion);
        setSharedId(r.sharedItemId);
        setDup(r.duplicate);
      })
      .catch((e) => setErr(e.message));
  }, [packId, paperId]);

  if (err && !s) return <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>;
  if (!s) return <div className="small muted">Getting the details ready…</div>;
  const set = (k: keyof Suggestion, v: any) => setS({ ...s, [k]: v });
  const isPaper = !!paperId;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: number }>('/library/share', {
        body: {
          packId,
          paperId,
          title: s!.title,
          type: s!.type,
          faculty: s!.faculty,
          university: s!.university || '',
          courseCode: s!.courseCode || '',
          courseName: s!.courseName || '',
          year: s!.year ? Number(s!.year) : null,
          semester: s!.semester || '',
          author: s!.author || '',
          description: s!.description || '',
          rights,
        },
      });
      onDone(r.id);
    } catch (e: any) {
      const m = String(e.message).match(/\/library\/(\d+)/);
      if (m) setDup({ id: Number(m[1]), title: 'the same notes' });
      setErr(m ? null : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack share-form">
      {dup && (
        <div className="lib-dup">
          These notes are already in the library. <Link to={`/library/${dup.id}`}>Open “{dup.title}”</Link> instead, so everyone studies one good copy.
        </div>
      )}
      <div className="grid cols-2" style={{ gap: 12 }}>
        <label className="field">
          <span className="label">Title</span>
          <input className="input" value={s.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span className="label">What is it?</span>
          <select className="input" value={s.type} onChange={(e) => set('type', e.target.value)} disabled={isPaper}>
            {ITEM_TYPES.filter((t) => (isPaper ? t.id === 'paper' : t.id !== 'paper')).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Faculty</span>
          <select className="input" value={s.faculty} onChange={(e) => set('faculty', e.target.value)}>
            {FACULTIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">University</span>
          <input className="input" value={s.university || ''} onChange={(e) => set('university', e.target.value)} placeholder="e.g. Makerere University" maxLength={160} />
        </label>
        <label className="field">
          <span className="label">Course code</span>
          <input className="input" value={s.courseCode || ''} onChange={(e) => set('courseCode', e.target.value)} placeholder="e.g. BST 2101" maxLength={40} />
        </label>
        <label className="field">
          <span className="label">Course name</span>
          <input className="input" value={s.courseName || ''} onChange={(e) => set('courseName', e.target.value)} placeholder="e.g. Biostatistics" maxLength={160} />
        </label>
        <label className="field">
          <span className="label">{isPaper ? 'Exam year' : 'Year (optional)'}</span>
          <input className="input" type="number" min={1980} max={2100} value={s.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 2025" />
        </label>
        {s.type === 'book' ? (
          <label className="field">
            <span className="label">Author</span>
            <input className="input" value={s.author || ''} onChange={(e) => set('author', e.target.value)} maxLength={160} />
          </label>
        ) : (
          <label className="field">
            <span className="label">Semester (optional)</span>
            <input className="input" value={s.semester || ''} onChange={(e) => set('semester', e.target.value)} placeholder="e.g. Year 2, Sem 1" maxLength={20} />
          </label>
        )}
      </div>
      <label className="field">
        <span className="label">A line about it (optional)</span>
        <input className="input" value={s.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Dr. Okello’s lectures 1–6, covers everything for the mid-semester test" maxLength={600} />
      </label>
      <label className="row small" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 3 }} />
        <span>I made these notes or I’m allowed to share them. Everyone on Charis Study will be able to read the full text and study from it. Items reported for copyright are taken down.</span>
      </label>
      {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn primary" onClick={submit} disabled={busy || !rights || s.title.trim().length < 3}>
          <LibraryIcon size={16} /> {busy ? 'Sharing…' : sharedId ? 'Update the library copy' : 'Share to the library'}
        </button>
      </div>
    </div>
  );
}
