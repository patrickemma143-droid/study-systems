import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Star, Target } from 'lucide-react';
import { api, type Readiness } from '../api';
import { Ring, useToast } from './ui';
import { today } from '../lib/util';

export const readyColor = (n: number) => (n >= 85 ? 'var(--good)' : n >= 65 ? 'var(--biro)' : n >= 40 ? 'var(--warn)' : 'var(--bad)');

/** "How ready am I?" on the pack page. */
export function ReadinessCard({ r, packId }: { r: Readiness; packId: number }) {
  const parts = [
    { k: 'coverage', label: 'Lessons understood' },
    { k: 'memory', label: 'Remembered now' },
    { k: 'practice', label: 'Quiz scores' },
    { k: 'explain', label: 'Explained in own words' },
  ] as const;
  return (
    <div className="sheet ai-card" style={{ borderLeftColor: readyColor(r.score), marginTop: 18 }}>
      <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
        <Ring value={r.score} size={92} stroke={8} color={readyColor(r.score)} label={`${r.score}%`} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="row" style={{ gap: 8 }}>
            <Target size={18} color={readyColor(r.score)} />
            <strong style={{ fontSize: '1.15rem' }}>
              Exam readiness: {r.label}
              {r.daysLeft !== null && r.daysLeft >= 0 ? ` · ${r.daysLeft === 0 ? 'exam today' : r.daysLeft === 1 ? 'exam tomorrow' : `${r.daysLeft} days to go`}` : ''}
            </strong>
          </div>
          <p style={{ margin: '6px 0 10px' }}>{r.message}</p>
          <div className="grid cols-2" style={{ gap: 8 }}>
            {parts.map((p) => (
              <div key={p.k}>
                <div className="row between small" style={{ marginBottom: 3 }}>
                  <span>{p.label}</span>
                  <strong>{r.parts[p.k]}%</strong>
                </div>
                <div className="meter">
                  <span style={{ width: `${r.parts[p.k]}%`, background: readyColor(r.parts[p.k]) }} />
                </div>
              </div>
            ))}
          </div>
          {r.weak.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <span className="small muted">Fix next:</span>
              {r.weak.map((w) => (
                <Link key={w.index} to={`/pack/${packId}/learn/${w.index}`} className="chip" title={w.why}>
                  {w.index + 1}. {w.title.length > 30 ? `${w.title.slice(0, 29)}…` : w.title} <span className="muted">({w.why})</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Pending {
  packId: number;
  title: string;
  examDate: string;
  lessons: { index: number; title: string }[];
}

const FEELINGS = ['Very badly', 'Not well', 'Okay', 'Well', 'Very well'];

/** After the paper: how did it go, which topics came up, did the app help. */
export function ExamReview({ p, onDone }: { p: Pending; onDone: () => void }) {
  const toast = useToast();
  const [went, setWent] = useState<number | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const [topics, setTopics] = useState<number[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!went) return;
    setBusy(true);
    try {
      await api('/study/exam-reviews', { body: { packId: p.packId, howItWent: went, appRating: stars, topics, comment: comment.trim() || undefined } });
      toast(went >= 4 ? 'Congratulations! Thanks for telling us.' : 'Thank you. Well done for sitting it — on to the next one.');
      onDone();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet stack ai-card" style={{ borderLeftColor: 'var(--hl-pink)' }}>
      <div className="row" style={{ gap: 8 }}>
        <Heart size={18} color="var(--bad)" />
        <strong>How did {p.title} go?</strong>
        <span className="small muted">({new Date(`${p.examDate}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})</span>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {FEELINGS.map((f, i) => (
          <button key={f} className="chip" aria-pressed={went === i + 1} onClick={() => setWent(i + 1)}>
            {f}
          </button>
        ))}
      </div>
      {went && (
        <>
          {p.lessons.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Which topics came up? (helps us predict your next papers)
              </div>
              <div className="row" style={{ gap: 6 }}>
                {p.lessons.map((l) => (
                  <button key={l.index} className="chip" aria-pressed={topics.includes(l.index)} onClick={() => setTopics((t) => (t.includes(l.index) ? t.filter((x) => x !== l.index) : [...t, l.index]))}>
                    {l.title.length > 30 ? `${l.title.slice(0, 29)}…` : l.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Did Charis Study help you prepare?
            </div>
            <div className="row" style={{ gap: 2 }} role="radiogroup" aria-label="Rate Charis Study">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className="btn ghost icon" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setStars(n)}>
                  <Star size={22} fill={stars && n <= stars ? '#d4a017' : 'none'} color="#d4a017" />
                </button>
              ))}
            </div>
          </div>
          <textarea className="textarea" style={{ minHeight: 70 }} placeholder="Anything you’d like to tell us? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          <div>
            <button className="btn primary" onClick={send} disabled={busy}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export async function pendingReviews(): Promise<Pending[]> {
  return api<{ pending: Pending[] }>(`/study/exam-reviews/pending?day=${today()}`).then((r) => r.pending);
}
