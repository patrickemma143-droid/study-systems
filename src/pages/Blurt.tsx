import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Play, RotateCcw, Save } from 'lucide-react';
import { checkRecall, type RecallCheck } from '@shared/engine/recall';
import { api } from '../api';
import { AiFeedback } from '../components/AiPanels';
import { RecallResult } from '../components/RecallResult';
import { Crumbs, ErrorState, Loading, useCountdown, useToast } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';
import { formatClock } from '../lib/util';

const DURATIONS = [2, 5, 10];

export default function Blurt() {
  const id = Number(useParams().id);
  const toast = useToast();
  const { data, error } = usePack(id);
  useStudyTimer('blurt', id);
  const [selected, setSelected] = useState<number[]>([]);
  const [minutes, setMinutes] = useState(5);
  const [phase, setPhase] = useState<'setup' | 'write' | 'result'>('setup');
  const [text, setText] = useState('');
  const [check, setCheck] = useState<RecallCheck | null>(null);

  const chunks = useMemo(() => {
    const all = data?.pack.data.chunks || [];
    return selected.length ? all.filter((c) => selected.includes(c.index)) : all;
  }, [data, selected]);

  const points = useMemo(() => chunks.flatMap((c) => c.keyPoints.slice(0, 4).map((p) => ({ p, title: c.title }))), [chunks]);

  const finish = useCallback(() => {
    const terms = [...new Set(chunks.flatMap((c) => c.keyTerms.slice(0, 4)))];
    setCheck(checkRecall(text, points.map((x) => x.p), terms));
    setPhase('result');
  }, [chunks, points, text]);

  const left = useCountdown(minutes * 60, phase === 'write', finish);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  async function save() {
    if (!check) return;
    const r = await api<{ points: number; copied: boolean }>('/study/notes', { body: { packId: id, chunk: selected.length === 1 ? selected[0] : null, kind: 'blurt', content: { text, score: check.score, lessons: selected } } });
    toast(r.copied ? 'Saved, but it looks copied from the notes, so no points.' : r.points > 0 ? `Saved. +${r.points} explainer points.` : 'Saved to your notes');
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Blurting' }]} />
      <h1>Blurting</h1>

      {phase === 'setup' && (
        <div className="sheet stack">
          <p className="muted" style={{ margin: 0 }}>
            Without looking at your notes, write down everything you can remember — words, facts, lists, half-sentences. Then we compare it with your notes, so you see exactly what stuck and what didn’t.
          </p>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              What do you want to recall?
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="chip" aria-pressed={!selected.length} onClick={() => setSelected([])}>
                Everything
              </button>
              {data.pack.data.chunks.map((c) => (
                <button key={c.index} className="chip" aria-pressed={selected.includes(c.index)} onClick={() => setSelected((s) => (s.includes(c.index) ? s.filter((x) => x !== c.index) : [...s, c.index]))}>
                  {c.index + 1}. {c.title.length > 28 ? `${c.title.slice(0, 27)}…` : c.title}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              Time limit
            </div>
            <div className="segmented" role="group" aria-label="Time limit">
              {DURATIONS.map((d) => (
                <button key={d} aria-pressed={minutes === d} onClick={() => setMinutes(d)}>
                  {d} minutes
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn primary big"
            onClick={() => {
              setText('');
              setPhase('write');
            }}
          >
            <Play size={18} /> Start the timer
          </button>
        </div>
      )}

      {phase === 'write' && (
        <div className="stack">
          <div className="row between">
            <span className="muted">Write everything you remember about {selected.length ? `${chunks.length === 1 ? 'this lesson' : 'these lessons'}` : 'this pack'}.</span>
            <span className={`timer-pill running`} aria-live="off">
              {formatClock(left)}
            </span>
          </div>
          <textarea className="textarea ruled" style={{ minHeight: 340 }} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="Go! Don’t worry about spelling or order." aria-label="Everything you remember" />
          <button className="btn primary big" onClick={finish} disabled={!text.trim()}>
            I’m done, compare with my notes
          </button>
        </div>
      )}

      {phase === 'result' && check && (
        <div className="stack">
          <RecallResult check={check} groupTitle={(i) => points[i]?.title} />
          <AiFeedback packId={id} chunks={chunks.slice(0, 40).map((c) => c.index)} text={text} mode="blurt" />
          <div className="row between">
            <button className="btn" onClick={() => setPhase('setup')}>
              <RotateCcw size={18} /> Blurt again
            </button>
            <button className="btn primary" onClick={save}>
              <Save size={18} /> Save this attempt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
