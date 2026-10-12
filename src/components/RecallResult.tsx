import { CheckCircle2, CircleDashed } from 'lucide-react';
import type { RecallCheck } from '@shared/engine/recall';
import { Ring } from './ui';

export function RecallResult({ check, groupTitle }: { check: RecallCheck; groupTitle?: (pointIndex: number) => string | undefined }) {
  const color = check.score >= 75 ? 'var(--good)' : check.score >= 50 ? 'var(--warn)' : 'var(--bad)';
  const covered = check.points.filter((p) => p.covered).length;
  let lastGroup: string | undefined;
  return (
    <div className="stack">
      <div className="sheet row" style={{ gap: 20, alignItems: 'center' }}>
        <Ring value={check.score} size={92} stroke={9} color={color} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ marginBottom: 6 }}>
            You covered {covered} of {check.points.length} key ideas
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {check.feedback.map((f, i) => (
              <li key={i} className="small">
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="sheet">
        <h3>Key ideas</h3>
        {check.points.map((p, i) => {
          const g = groupTitle?.(i);
          const header = g && g !== lastGroup ? g : null;
          lastGroup = g;
          return (
            <div key={i}>
              {header && <div className="small muted" style={{ marginTop: i ? 14 : 0, fontWeight: 600 }}>{header}</div>}
              <div className="point-check">
                {p.covered ? <CheckCircle2 size={18} className="covered" /> : <CircleDashed size={18} className="missed" />}
                <div>
                  <div style={{ color: p.covered ? 'var(--ink-2)' : 'var(--ink)' }}>{p.text}</div>
                  {!p.covered && <div className="small missed">Missing from your answer</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(check.termsCovered.length > 0 || check.termsMissed.length > 0) && (
        <div className="sheet">
          <h3>Key terms</h3>
          <div className="row" style={{ gap: 8 }}>
            {check.termsCovered.map((t) => (
              <span key={t} className="chip" style={{ background: 'var(--good-soft)', color: 'var(--good)', borderColor: 'transparent' }}>
                {t}
              </span>
            ))}
            {check.termsMissed.map((t) => (
              <span key={t} className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', borderColor: 'transparent', textDecoration: 'line-through' }}>
                {t}
              </span>
            ))}
          </div>
          {check.hardWords.length > 0 && (
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              Could you say these more simply? {check.hardWords.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
