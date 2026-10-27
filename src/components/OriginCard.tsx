// "Where this is from": the university, course, kind of exam and date read from an uploaded paper,
// shown as a one-line summary the student can check and correct.
import { useEffect, useRef, useState } from 'react';
import { Check, Info, Loader2, Pencil, Sparkles } from 'lucide-react';
import { api } from '../api';
import { cleanOrigin, detectOrigin, EXAM_TYPES, MONTHS, originLabel, UNIVERSITIES, type OriginField, type PaperOrigin } from '../../shared/origin';

/** Read the header at once (rules), then let the AI refine it when it is switched on. */
export function useOriginDetect(text: string | null, name: string, enabled = true) {
  const [origin, setOrigin] = useState<PaperOrigin | null>(null);
  const [refining, setRefining] = useState(false);
  const [ai, setAi] = useState(false);
  const edited = useRef(false);
  useEffect(() => {
    edited.current = false;
    if (!text || !enabled) {
      setOrigin(null);
      return;
    }
    const rules = detectOrigin(text, name);
    setOrigin(rules);
    setAi(false);
    let gone = false;
    setRefining(true);
    api<{ origin: PaperOrigin; ai: boolean }>('/origin/detect', { body: { text: text.slice(0, 8000), name } })
      .then((r) => {
        if (gone || edited.current) return;
        setOrigin(cleanOrigin(r.origin));
        setAi(r.ai);
      })
      .catch(() => {})
      .finally(() => !gone && setRefining(false));
    return () => {
      gone = true;
    };
  }, [text, name, enabled]);
  return {
    origin,
    refining,
    ai,
    setOrigin: (o: PaperOrigin) => {
      edited.current = true;
      setOrigin(o);
    },
  };
}

const ROMAN = ['I', 'II', 'III'];

export function OriginCard({ origin, refining, ai, onChange, compact }: { origin: PaperOrigin | null; refining?: boolean; ai?: boolean; onChange: (o: PaperOrigin) => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!origin) return null;
  const label = originLabel(origin);
  const found = !!label;
  const set = <K extends keyof PaperOrigin>(k: K, v: PaperOrigin[K]) => {
    const inferred = origin.inferred.filter((x) => x !== (k as OriginField));
    onChange({ ...origin, [k]: v, inferred });
  };
  const why = (f: OriginField) => (origin.evidence[f] ? `Read from: “${origin.evidence[f]}”` : undefined);
  const guess = (f: OriginField) => origin.inferred.includes(f);

  return (
    <div className={`origin-card ${compact ? 'compact' : ''}`}>
      <div className="origin-head">
        <span className="origin-icon">
          <Sparkles size={15} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="origin-title">
            {origin.isPaper ? 'Past paper detected' : 'Where this is from'}
            {refining ? (
              <span className="origin-status">
                <Loader2 size={12} className="spin" /> checking…
              </span>
            ) : ai ? (
              <span className="origin-status">checked by AI</span>
            ) : null}
          </div>
          {found ? (
            <div className="origin-chips">
              {origin.university && (
                <span className="chip-ro" title={why('university')}>
                  {origin.university}
                </span>
              )}
              {(origin.courseCode || origin.courseName) && (
                <span className="chip-ro" title={why('courseCode') || why('courseName')}>
                  {[origin.courseCode, origin.courseName].filter(Boolean).join(' · ')}
                </span>
              )}
              {origin.examType && (
                <span className={`chip-ro ${guess('examType') ? 'guess' : ''}`} title={why('examType')}>
                  {EXAM_TYPES.find((e) => e.id === origin.examType)?.label}
                </span>
              )}
              {origin.semester && (
                <span className="chip-ro" title={why('semester')}>
                  Semester {ROMAN[origin.semester - 1]}
                </span>
              )}
              {(origin.year || origin.academicYear) && (
                <span className={`chip-ro ${guess('year') ? 'guess' : ''}`} title={why('date') || why('month') || why('year') || why('academicYear')}>
                  {origin.date ? new Date(`${origin.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : origin.month && origin.year ? `${MONTHS[origin.month - 1]} ${origin.year}` : origin.year || origin.academicYear}
                  {guess('year') ? '?' : ''}
                </span>
              )}
              {origin.yearOfStudy && <span className="chip-ro">Year {origin.yearOfStudy}</span>}
              {origin.duration && <span className="chip-ro">{origin.duration}</span>}
            </div>
          ) : (
            <div className="small muted">We couldn’t read the university or date from it. Add them, so classmates can find it and the Exam coach knows the year.</div>
          )}
          {!compact && (origin.unit || origin.programme) && <div className="small muted origin-sub">{[origin.programme, origin.unit].filter(Boolean).join(' · ')}</div>}
        </div>
        <button className="btn small ghost" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? 'Done' : found ? 'Correct' : 'Add details'}
        </button>
      </div>
      {editing && (
        <div className="origin-form">
          <label className="field">
            <span>University or exam body</span>
            <input className="input" list="origin-unis" value={origin.university || ''} onChange={(e) => onChange({ ...origin, university: e.target.value || null, universityShort: UNIVERSITIES.find((u) => u.name === e.target.value)?.short || null })} placeholder="e.g. Makerere University" />
            <datalist id="origin-unis">
              {UNIVERSITIES.map((u) => (
                <option key={u.name} value={u.name} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Course code</span>
            <input className="input" value={origin.courseCode || ''} onChange={(e) => set('courseCode', e.target.value.toUpperCase() || null)} placeholder="e.g. BST 2101" />
          </label>
          <label className="field">
            <span>Course name</span>
            <input className="input" value={origin.courseName || ''} onChange={(e) => set('courseName', e.target.value || null)} placeholder="e.g. Biostatistics" />
          </label>
          <label className="field">
            <span>Kind of paper</span>
            <select className="input" value={origin.examType || ''} onChange={(e) => set('examType', (e.target.value || null) as PaperOrigin['examType'])}>
              <option value="">Not a paper / not sure</option>
              {EXAM_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Semester</span>
            <select className="input" value={origin.semester || ''} onChange={(e) => set('semester', e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              <option value="1">Semester I</option>
              <option value="2">Semester II</option>
              <option value="3">Semester III / recess</option>
            </select>
          </label>
          <label className="field">
            <span>Academic year</span>
            <input className="input" value={origin.academicYear || ''} onChange={(e) => set('academicYear', e.target.value || null)} placeholder="e.g. 2022/2023" />
          </label>
          <label className="field">
            <span>Month sat</span>
            <select className="input" value={origin.month || ''} onChange={(e) => set('month', e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Year sat</span>
            <input className="input" type="number" min={1990} max={2100} value={origin.year || ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 2023" />
          </label>
          <label className="field">
            <span>Year of study</span>
            <select className="input" value={origin.yearOfStudy || ''} onChange={(e) => set('yearOfStudy', e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted origin-note">
            <Info size={13} /> Hover over a detail to see the line it was read from. A “?” means it was worked out (e.g. the year from “2022/2023, Semester I”).
          </p>
        </div>
      )}
    </div>
  );
}
