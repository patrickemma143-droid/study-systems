import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EyeOff, Mic, MicOff, RotateCcw, Save } from 'lucide-react';
import { checkRecall, type RecallCheck } from '@shared/engine/recall';
import { api } from '../api';
import { Highlighted } from '../components/Highlighted';
import { RecallResult } from '../components/RecallResult';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { dictationSupported, startDictation } from '../lib/speech';
import { setProgress, usePack, useStudyTimer } from '../lib/usePack';

type Step = 'study' | 'explain' | 'check';

export default function Feynman() {
  const id = Number(useParams().id);
  const [search, setSearch] = useSearchParams();
  const toast = useToast();
  const { data, error } = usePack(id);
  useStudyTimer('feynman', id);
  const chunkIndex = search.get('chunk') !== null ? Number(search.get('chunk')) : null;
  const [step, setStep] = useState<Step>('study');
  const [text, setText] = useState('');
  const [check, setCheck] = useState<RecallCheck | null>(null);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<() => void>(() => {});

  const chunk = chunkIndex !== null ? data?.pack.data.chunks[chunkIndex] : undefined;
  const glossary = useMemo(() => (data && chunk ? chunk.keyTerms.map((t) => ({ term: t, definition: data.pack.data.glossary.find((g) => g.term.toLowerCase() === t.toLowerCase())?.definition })) : []), [data, chunk]);

  useEffect(() => {
    setStep('study');
    setText('');
    setCheck(null);
  }, [chunkIndex]);
  useEffect(() => () => stopRef.current(), []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const crumbs = [{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Feynman technique' }];

  if (!chunk) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Crumbs items={crumbs} />
        <h1>Feynman technique</h1>
        <p className="muted">
          Pick a lesson. You will study it, hide it, then explain it in your own simple words — as if teaching a friend. Where you get stuck shows exactly what you don’t understand yet.
        </p>
        <div className="sheet" style={{ padding: '4px 20px' }}>
          <div className="list">
            {data.pack.data.chunks.map((c) => {
              const best = data.progress[c.index]?.bestRecall;
              return (
                <button key={c.index} className="list-row" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setSearch({ chunk: String(c.index) })}>
                  <span className="list-num">{c.index + 1}</span>
                  <span className="list-body">
                    <span className="list-title" style={{ display: 'block' }}>
                      {c.title}
                    </span>
                    <span className="list-sub">{best != null ? `Best explanation score: ${best}%` : 'Not explained yet'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function toggleMic() {
    if (listening) {
      stopRef.current();
      setListening(false);
      return;
    }
    setListening(true);
    stopRef.current = startDictation(
      (t) => setText((prev) => (prev ? `${prev.trimEnd()} ${t}` : t)),
      () => setListening(false),
    );
  }

  function runCheck() {
    stopRef.current();
    setListening(false);
    setCheck(checkRecall(text, chunk!.keyPoints, chunk!.keyTerms));
    setStep('check');
  }

  async function saveResult() {
    if (!check) return;
    await api('/study/notes', { body: { packId: id, chunk: chunk!.index, kind: 'feynman', content: { text, score: check.score } } });
    await setProgress(id, chunk!.index, { recall: check.score, ...(check.score >= 70 ? { status: 'understood' } : {}) });
    toast(check.score >= 70 ? 'Saved. Lesson marked as understood.' : 'Saved. Have another go after re-reading.');
  }

  const steps: { id: Step; label: string }[] = [
    { id: 'study', label: 'Study' },
    { id: 'explain', label: 'Explain' },
    { id: 'check', label: 'Check' },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Crumbs items={crumbs} />
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <div className="small muted">Feynman technique, lesson {chunk.index + 1}</div>
          <h1 style={{ margin: 0 }}>{chunk.title}</h1>
        </div>
        <button className="btn ghost small" onClick={() => setSearch({})}>
          Choose another lesson
        </button>
      </div>
      <ol className="steps" style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
        {steps.map((s, i) => (
          <li key={s.id} className={`step ${i === stepIndex ? 'on' : ''} ${i < stepIndex ? 'done' : ''}`}>
            <b>{i + 1}</b> {s.label}
          </li>
        ))}
      </ol>

      {step === 'study' && (
        <div className="stack">
          <div className="sheet">
            <p style={{ fontWeight: 500 }}>
              <Highlighted text={chunk.nutshell} terms={glossary} />
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {chunk.keyPoints.map((p, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <Highlighted text={p} terms={glossary} />
                </li>
              ))}
            </ul>
          </div>
          <div className="row between">
            <Link to={`/pack/${id}/learn/${chunk.index}`} className="btn ghost">
              Read the full lesson
            </Link>
            <button className="btn primary big" onClick={() => setStep('explain')}>
              <EyeOff size={18} /> I’m ready, hide the notes
            </button>
          </div>
        </div>
      )}

      {step === 'explain' && (
        <div className="stack">
          <div className="callout">
            <span className="hand" style={{ fontSize: '1.6rem', color: 'var(--biro)' }}>
              Teach it
            </span>
            <div className="small">
              Explain “{chunk.title}” to a friend who missed the lecture. Use short sentences and everyday words. If you get stuck, that is the part to go back to.
            </div>
          </div>
          <textarea className="textarea ruled" style={{ minHeight: 260 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Start with: “Basically, this is about…”" autoFocus aria-label="Your explanation" />
          <div className="row between">
            <div className="row">
              {dictationSupported && (
                <button className={`btn ${listening ? 'danger' : ''}`} onClick={toggleMic} aria-pressed={listening}>
                  {listening ? <MicOff size={18} /> : <Mic size={18} />} {listening ? 'Stop talking' : 'Say it out loud'}
                </button>
              )}
              <span className="small muted">{text.trim() ? `${text.trim().split(/\s+/).length} words` : ''}</span>
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setStep('study')}>
                Peek at the notes
              </button>
              <button className="btn primary big" onClick={runCheck} disabled={text.trim().split(/\s+/).length < 5}>
                Check my explanation
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'check' && check && (
        <div className="stack">
          <RecallResult check={check} />
          <div className="row between">
            <button className="btn" onClick={() => setStep('explain')}>
              <RotateCcw size={18} /> Improve my explanation
            </button>
            <div className="row">
              <button className="btn" onClick={saveResult}>
                <Save size={18} /> Save
              </button>
              {chunk.index < data.pack.data.chunks.length - 1 && (
                <button
                  className="btn primary"
                  onClick={async () => {
                    await saveResult();
                    setSearch({ chunk: String(chunk.index + 1) });
                  }}
                >
                  Save and do the next lesson
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
