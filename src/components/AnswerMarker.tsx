// Write a full exam answer and get it marked point by point: instantly against the key,
// or by the AI like an examiner when AI is switched on.
import { useState } from 'react';
import { CheckCircle2, CircleDashed, PenLine, Sparkles } from 'lucide-react';
import { markAnswer, type AnswerMark } from '@shared/engine/mark';
import { api } from '../api';
import { left, updateAiUsage, useAiStatus } from '../lib/ai';

interface AiMark extends AnswerMark {
  points: { point: string; got: boolean; comment?: string }[];
  improve?: string;
  model?: string;
}

export function AnswerMarker({ packId, question, marks, keyText, guide }: { packId: number; question: string; marks: number; keyText?: string | null; guide?: string[] }) {
  const ai = useAiStatus();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [mark, setMark] = useState<AiMark | null>(null);
  const [byAi, setByAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasKey = !!(keyText && keyText.trim()) || !!guide?.length;

  if (!open) {
    return (
      <button className="btn small" onClick={() => setOpen(true)}>
        <PenLine size={15} /> Write my answer
      </button>
    );
  }

  function quick() {
    setByAi(false);
    setErr(null);
    setMark(markAnswer(answer, guide?.length ? guide : keyText || '', marks));
  }
  async function withAi() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<AiMark & { usage: any }>('/ai/mark-answer', { body: { packId, question, marks, key: keyText || guide?.join('\n') || undefined, answer } });
      updateAiUsage(r.usage);
      setMark(r);
      setByAi(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pct = mark ? mark.awarded / Math.max(1, mark.outOf) : 0;
  return (
    <div className="answer-box stack">
      <textarea className="input" rows={marks >= 8 ? 9 : 4} value={answer} onChange={(e) => { setAnswer(e.target.value); setMark(null); }} placeholder={`Write your answer as you would in the exam (${marks} mark${marks === 1 ? '' : 's'})…`} aria-label="Your answer" />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {hasKey && (
          <button className="btn small" onClick={quick} disabled={answer.trim().length < 5}>
            <CheckCircle2 size={15} /> Mark against the key
          </button>
        )}
        {ai?.enabled && (
          <button className="btn small primary" onClick={withAi} disabled={busy || answer.trim().length < 5 || left(ai, 'feedback') <= 0}>
            <Sparkles size={15} /> {busy ? 'Marking…' : 'Mark it like an examiner'}
          </button>
        )}
        {!hasKey && !ai?.enabled && <span className="small muted">No marking key for this question. Add the key to the past paper to mark answers.</span>}
        {ai?.enabled && <span className="small muted">{left(ai, 'feedback')} AI marks left today</span>}
      </div>
      {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
      {mark && (
        <div className="mark-result">
          <div className="row between">
            <strong style={{ fontSize: '1.15rem', color: pct >= 0.7 ? 'var(--good)' : pct >= 0.4 ? 'var(--warn)' : 'var(--bad)' }}>
              {mark.awarded} / {mark.outOf} marks
            </strong>
            <span className="small muted">{byAi ? 'Marked by the AI examiner' : 'Quick check against the key'}</span>
          </div>
          <p className="small" style={{ margin: '6px 0' }}>
            {mark.comment}
          </p>
          <ul className="mark-points">
            {mark.points.map((p, i) => (
              <li key={i} className={p.got ? 'got' : 'miss'}>
                {p.got ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
                <span>
                  {p.point}
                  {p.comment ? <span className="muted"> — {p.comment}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {mark.improve && (
            <p className="small" style={{ margin: '6px 0 0' }}>
              <strong>To gain more marks:</strong> {mark.improve}
            </p>
          )}
          {mark.model && (
            <details className="lib-sample">
              <summary className="small">See a full-marks answer</summary>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                {mark.model}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
