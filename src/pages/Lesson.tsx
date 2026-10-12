import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Layers, Lightbulb, MessageSquareText, Square, Volume2 } from 'lucide-react';
import type { BodyPart } from '@shared/engine/types';
import { api } from '../api';
import { Highlighted, type Gloss } from '../components/Highlighted';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { setProgress, usePack, useStudyTimer } from '../lib/usePack';
import { speakSequence, stopSpeaking, ttsSupported } from '../lib/speech';

function groupBody(parts: BodyPart[]): ({ t: 'h' | 'p'; x: string } | { t: 'ul'; items: string[] })[] {
  const out: ({ t: 'h' | 'p'; x: string } | { t: 'ul'; items: string[] })[] = [];
  for (const p of parts) {
    if (p.t === 'li') {
      const last = out[out.length - 1];
      if (last && last.t === 'ul') last.items.push(p.x);
      else out.push({ t: 'ul', items: [p.x] });
    } else out.push({ t: p.t, x: p.x });
  }
  return out;
}

export default function Lesson() {
  const { id: idParam, chunk: chunkParam } = useParams();
  const id = Number(idParam);
  const index = Number(chunkParam);
  const nav = useNavigate();
  const toast = useToast();
  const { data, error } = usePack(id);
  const [showFull, setShowFull] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [openPrompt, setOpenPrompt] = useState<number | null>(null);
  useStudyTimer('lesson', id);

  const chunk = data?.pack.data.chunks[index];
  const total = data?.pack.data.chunks.length ?? 0;

  const glossary: Gloss[] = useMemo(() => {
    if (!data || !chunk) return [];
    const g = data.pack.data.glossary;
    const terms = new Map<string, Gloss>();
    for (const t of chunk.keyTerms) {
      const def = g.find((x) => x.term.toLowerCase() === t.toLowerCase());
      terms.set(t.toLowerCase(), { term: t, definition: def?.definition });
    }
    for (const def of g.filter((x) => x.chunk === index)) if (!terms.has(def.term.toLowerCase())) terms.set(def.term.toLowerCase(), { term: def.term, definition: def.definition });
    return [...terms.values()];
  }, [data, chunk, index]);

  // Mark as read after a little while on the page
  useEffect(() => {
    if (!data || !chunk) return;
    const st = data.progress[index]?.status;
    if (st && st !== 'new') return;
    const t = window.setTimeout(() => setProgress(id, index, { status: 'read' }).catch(() => {}), 15000);
    return () => window.clearTimeout(t);
  }, [data, chunk, id, index]);

  useEffect(() => {
    stopSpeaking();
    setSpeaking(false);
    setOpenPrompt(null);
    return () => stopSpeaking();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      if (e.key === 'ArrowRight' && index < total - 1) nav(`/pack/${id}/learn/${index + 1}`);
      if (e.key === 'ArrowLeft' && index > 0) nav(`/pack/${id}/learn/${index - 1}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total, id, nav]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  if (!chunk) return <ErrorState message="This lesson doesn’t exist." action={<Link to={`/pack/${id}`} className="btn">Back to the pack</Link>} />;

  const status = data.progress[index]?.status || 'new';
  const understood = status === 'understood' || status === 'mastered';

  function listen() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const parts = [chunk!.title, ...(showFull ? chunk!.body.map((b) => b.x) : [chunk!.nutshell, ...chunk!.keyPoints])];
    setSpeaking(true);
    speakSequence(parts, { onDone: () => setSpeaking(false) });
  }

  async function markUnderstood() {
    await setProgress(id, index, { status: 'understood' });
    toast(index < total - 1 ? 'Nice — on to the next lesson.' : 'That was the last lesson. Time to test yourself!');
    nav(index < total - 1 ? `/pack/${id}/learn/${index + 1}` : `/pack/${id}/quiz`);
  }

  async function saveAnswer(i: number) {
    const answer = (answers[i] || '').trim();
    if (!answer) return;
    await api('/study/notes', { body: { packId: id, chunk: index, kind: 'elaboration', content: { prompt: chunk!.prompts[i], answer } } });
    toast('Answer saved to your notes');
    setOpenPrompt(null);
  }

  const groups = groupBody(chunk.body);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: `Lesson ${index + 1}` }]} />
      <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="small muted">
            Lesson {index + 1} of {total}, {chunk.readMinutes} min
            {chunk.importance >= 0.75 && <span className="chip exam" style={{ marginLeft: 8 }}>Likely to be examined</span>}
          </div>
          <h1 style={{ margin: '4px 0 0' }}>{chunk.title}</h1>
        </div>
        {ttsSupported && (
          <button className="btn" onClick={listen} aria-pressed={speaking}>
            {speaking ? <Square size={16} /> : <Volume2 size={18} />} {speaking ? 'Stop' : 'Listen'}
          </button>
        )}
      </div>

      <div className="sheet" style={{ borderLeft: '6px solid var(--hl-yellow)', marginBottom: 18 }}>
        <div className="small muted" style={{ marginBottom: 4 }}>
          In a nutshell
        </div>
        <div style={{ fontSize: '1.12rem', fontWeight: 500 }}>
          <Highlighted text={chunk.nutshell} terms={glossary} />
        </div>
      </div>

      <div className="sheet" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.15rem' }}>The main points</h2>
        <ol style={{ margin: 0, paddingLeft: 22 }}>
          {chunk.keyPoints.map((p, i) => (
            <li key={i} style={{ marginBottom: 10 }}>
              <Highlighted text={p} terms={glossary} />
            </li>
          ))}
        </ol>
      </div>

      <button className="btn ghost" onClick={() => setShowFull((s) => !s)} aria-expanded={showFull} style={{ marginBottom: 10 }}>
        <ChevronDown size={18} style={{ transform: showFull ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        {showFull ? 'Hide the full notes' : 'Read the full notes'}
      </button>
      {showFull && (
        <article className="page" style={{ marginBottom: 18 }}>
          {chunk.importance >= 0.75 && (
            <span className="margin-note" style={{ top: 26 }}>
              exam!
            </span>
          )}
          {groups.map((g, i) =>
            g.t === 'ul' ? (
              <ul key={i}>
                {g.items.map((it, k) => (
                  <li key={k}>
                    <Highlighted text={it} terms={glossary} colorful />
                  </li>
                ))}
              </ul>
            ) : g.t === 'h' ? (
              <h3 key={i}>{g.x}</h3>
            ) : (
              <p key={i}>
                <Highlighted text={g.x} terms={glossary} colorful />
              </p>
            ),
          )}
        </article>
      )}

      {glossary.some((g) => g.definition) && (
        <div className="sheet" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: '1.15rem' }}>Words to know</h2>
          <dl style={{ margin: 0 }}>
            {glossary
              .filter((g) => g.definition)
              .map((g) => (
                <div key={g.term} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                  <dt style={{ fontWeight: 600 }}>
                    <mark>{g.term}</mark>
                  </dt>
                  <dd style={{ margin: '2px 0 0' }}>{g.definition}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {chunk.prompts.length > 0 && (
        <div className="sheet" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: '1.15rem' }}>
            <Lightbulb size={18} style={{ display: 'inline', verticalAlign: '-3px', color: 'var(--warn)' }} /> Think deeper
          </h2>
          <p className="small muted">Answering “why” and “how” questions links new ideas to what you already know, so they stick.</p>
          {chunk.prompts.map((p, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px dashed var(--line)' : undefined }}>
              <button className="btn ghost" style={{ height: 'auto', padding: '6px 8px', whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => setOpenPrompt(openPrompt === i ? null : i)} aria-expanded={openPrompt === i}>
                {p}
              </button>
              {openPrompt === i && (
                <div className="stack" style={{ marginTop: 8 }}>
                  <textarea className="textarea ruled" style={{ minHeight: 120 }} placeholder="Write your answer in your own words…" value={answers[i] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
                  <div className="row">
                    <button className="btn small primary" onClick={() => saveAnswer(i)} disabled={!(answers[i] || '').trim()}>
                      Save answer
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="sheet row between">
        <div className="row">
          <Link to={`/pack/${id}/feynman?chunk=${index}`} className="btn">
            <MessageSquareText size={18} /> Explain it in my words
          </Link>
          <Link to={`/pack/${id}/cards?chunks=${index}&mode=all`} className="btn">
            <Layers size={18} /> Cards for this lesson
          </Link>
        </div>
        <button className="btn primary" onClick={markUnderstood}>
          <Check size={18} /> {understood ? 'Next lesson' : 'I understand this'}
        </button>
      </div>

      <div className="row between" style={{ marginTop: 18 }}>
        {index > 0 ? (
          <Link to={`/pack/${id}/learn/${index - 1}`} className="btn ghost">
            <ArrowLeft size={18} /> Previous
          </Link>
        ) : (
          <span />
        )}
        {index < total - 1 && (
          <Link to={`/pack/${id}/learn/${index + 1}`} className="btn ghost">
            Next lesson <ArrowRight size={18} />
          </Link>
        )}
      </div>
    </div>
  );
}
