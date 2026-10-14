import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleHelp, EyeOff, Keyboard, Pencil, PartyPopper, Trophy, Undo2, Volume2, X } from 'lucide-react';
import { previewLabel, type Rating } from '@shared/srs';
import { markTyped, type TypedMark } from '@shared/engine/typed';
import { api, type Card } from '../api';
import { Bar, Crumbs, Loading, useToast } from '../components/ui';
import { invalidatePack, usePack, useStudyTimer } from '../lib/usePack';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';
import { plural, save, store, today } from '../lib/util';

const RATINGS: { r: Rating; label: string; cls: string; key: string }[] = [
  { r: 1, label: 'Again', cls: 'again', key: '1' },
  { r: 2, label: 'Hard', cls: '', key: '2' },
  { r: 3, label: 'Good', cls: '', key: '3' },
  { r: 4, label: 'Easy', cls: 'easy', key: '4' },
];

const TYPE_LABEL: Record<string, string> = { definition: 'Definition', reverse: 'Name the term', cloze: 'Fill the gap', list: 'List', concept: 'Explain', custom: 'Your card' };

export default function Flashcards() {
  const params = useParams();
  const packId = params.id ? Number(params.id) : null;
  const [search, setSearch] = useSearchParams();
  const mode = (search.get('mode') as 'due' | 'all' | 'weak') || 'due';
  const chunks = search.get('chunks') || '';
  const toast = useToast();
  const pack = usePack(packId ?? -1);
  useStudyTimer('flashcards', packId);

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState({ reviewed: 0, again: 0, good: 0 });
  const [editing, setEditing] = useState<{ front: string; back: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [typeMode, setTypeMode] = useState<boolean>(() => store('cs-type-answers', false));
  const [typed, setTyped] = useState('');
  const [mark, setMark] = useState<TypedMark | null>(null);
  const shownAt = useRef(Date.now());
  // Cards already rated in this session, so you can step back and look again (or change a rating)
  const [history, setHistory] = useState<{ card: Card; rating: Rating; points: number }[]>([]);
  const [back, setBack] = useState(0);
  const [changing, setChanging] = useState(false);
  const [earned, setEarned] = useState(0);

  const load = useCallback(async () => {
    setQueue(null);
    setPos(0);
    setFlipped(false);
    setDone({ reviewed: 0, again: 0, good: 0 });
    setHistory([]);
    setBack(0);
    setEarned(0);
    const q = new URLSearchParams({ mode, limit: mode === 'all' ? '200' : '40' });
    if (packId) q.set('packId', String(packId));
    if (chunks) q.set('chunks', chunks);
    const r = await api<{ cards: Card[] }>(`/study/cards?${q}`);
    setQueue(r.cards);
  }, [mode, chunks, packId]);

  useEffect(() => {
    load();
    return () => stopSpeaking();
  }, [load]);

  const card = queue?.[pos];

  useEffect(() => {
    setTyped('');
    setMark(null);
    shownAt.current = Date.now();
  }, [card?.id, pos]);

  useEffect(() => {
    save('cs-type-answers', typeMode);
  }, [typeMode]);

  function checkTyped(e?: FormEvent) {
    e?.preventDefault();
    if (!card) return;
    setMark(markTyped(typed, card.back, (Date.now() - shownAt.current) / 1000));
    setFlipped(true);
  }

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const r = await api<{ card: Card; points: number }>(`/study/cards/${card.id}/review`, { body: { rating, day: today(), typed: !!mark, typedText: mark ? typed : undefined } });
        setHistory((h) => [...h, { card, rating, points: r.points || 0 }]);
        setEarned((n) => n + (r.points || 0));
        setDone((d) => ({ reviewed: d.reviewed + 1, again: d.again + (rating === 1 ? 1 : 0), good: d.good + (rating >= 3 ? 1 : 0) }));
        setQueue((q) => {
          if (!q) return q;
          // "Again" cards come back later in this same session
          if (rating === 1) return [...q, { ...card, ...r.card }];
          return q;
        });
        setFlipped(false);
        setPos((p) => p + 1);
        if (packId) invalidatePack(packId);
      } catch (e: any) {
        toast(e.message);
      } finally {
        setBusy(false);
      }
    },
    [card, busy, packId, toast, mark, typed],
  );

  /** Change the rating of a card you already answered (looking back). */
  async function rerate(rating: Rating) {
    const idx = history.length - back;
    const entry = history[idx];
    if (!entry || busy) return;
    setBusy(true);
    try {
      await api(`/study/cards/${entry.card.id}/undo`, { method: 'POST' });
      const r = await api<{ card: Card; points: number }>(`/study/cards/${entry.card.id}/review`, { body: { rating, day: today() } });
      setHistory((h) => h.map((x, i) => (i === idx ? { ...x, rating, points: r.points || 0 } : x)));
      setEarned((n) => n - entry.points + (r.points || 0));
      setQueue((q) => {
        if (!q) return q;
        let next = q;
        if (entry.rating === 1) {
          // remove the extra copy that "Again" queued for later
          const at = next.map((c) => c.id).lastIndexOf(entry.card.id);
          if (at >= pos) next = next.filter((_, i) => i !== at);
        }
        if (rating === 1) next = [...next, { ...entry.card, ...r.card }];
        return next;
      });
      setDone((d) => ({ ...d, again: d.again - (entry.rating === 1 ? 1 : 0) + (rating === 1 ? 1 : 0), good: d.good - (entry.rating >= 3 ? 1 : 0) + (rating >= 3 ? 1 : 0) }));
      setChanging(false);
      toast('Rating changed');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  const lookingBack = back > 0 ? history[history.length - back] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement).closest('input,textarea')) return;
      if (e.key === 'ArrowLeft' && back < history.length) {
        setBack((b) => b + 1);
        setChanging(false);
        return;
      }
      if (e.key === 'ArrowRight' && back > 0) {
        setBack((b) => b - 1);
        setChanging(false);
        return;
      }
      if (back > 0) {
        if (changing && ['1', '2', '3', '4'].includes(e.key)) rerate(Number(e.key) as Rating);
        return;
      }
      if (e.key === 'Enter' && flipped && mark) {
        e.preventDefault();
        rate(mark.suggested);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (typeMode && !flipped) checkTyped();
        else setFlipped((f) => !f);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, rate, editing, mark, typeMode, typed, card, back, history, changing]);

  async function saveEdit() {
    if (!card || !editing) return;
    await api(`/study/cards/${card.id}`, { method: 'PATCH', body: editing });
    setQueue((q) => q && q.map((c) => (c.id === card.id ? { ...c, ...editing } : c)));
    setEditing(null);
    toast('Card updated');
  }

  async function suspend() {
    if (!card) return;
    await api(`/study/cards/${card.id}`, { method: 'PATCH', body: { suspended: true } });
    setQueue((q) => q && q.filter((c) => c.id !== card.id));
    setFlipped(false);
    toast('Card hidden. It won’t come up again.');
  }

  const crumbs = packId && pack.data ? [{ to: '/home', label: 'Home' }, { to: `/pack/${packId}`, label: pack.data.pack.title }, { label: 'Flashcards' }] : [{ to: '/home', label: 'Home' }, { label: 'Review' }];
  const setMode = (m: string) => {
    const s = new URLSearchParams(search);
    s.set('mode', m);
    setSearch(s);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Crumbs items={crumbs} />
      <div className="row between" style={{ marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{packId ? 'Flashcards' : 'Today’s review'}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {chunks ? `Lesson ${Number(chunks.split(',')[0]) + 1}. ` : ''}
            {typeMode ? 'Type your answer, then we mark it and suggest a rating.' : 'Try to answer before you flip. Be honest when you rate yourself.'}
          </p>
        </div>
        <button className="chip" aria-pressed={typeMode} onClick={() => setTypeMode((t) => !t)} title="Typing answers makes you recall them properly, so they stick better">
          <Keyboard size={14} /> Type answers
        </button>
        <div className="segmented" role="group" aria-label="Which cards">
          <button aria-pressed={mode === 'due'} onClick={() => setMode('due')}>
            Due
          </button>
          <button aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
            All
          </button>
          <button aria-pressed={mode === 'weak'} onClick={() => setMode('weak')}>
            Struggling
          </button>
        </div>
      </div>

      {queue && (history.length > 0 || back > 0) && (
        <div className="row between" style={{ marginBottom: 10 }}>
          <button className="btn ghost small" onClick={() => { setBack((b) => Math.min(history.length, b + 1)); setChanging(false); }} disabled={back >= history.length} title="Previous card (←)">
            <ArrowLeft size={16} /> Previous card
          </button>
          {back > 0 && (
            <button className="btn ghost small" onClick={() => { setBack((b) => b - 1); setChanging(false); }} title="Next (→)">
              {back === 1 ? 'Back to where I was' : 'Next card'} <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      {!queue ? (
        <Loading />
      ) : lookingBack ? (
        <div>
          <div className="small muted" style={{ marginBottom: 8, textAlign: 'center' }}>
            Looking back: card {history.length - back + 1} of the {history.length} you’ve answered
          </div>
          <div className="card-stage">
            <div className="flashcard flipped" role="group" aria-label={`Question: ${lookingBack.card.front}. Answer: ${lookingBack.card.back}`}>
              <div className="face front">
                <div className="content">{lookingBack.card.front}</div>
              </div>
              <div className="face back">
                <div className="kind">
                  <span>{lookingBack.card.front.length > 70 ? `${lookingBack.card.front.slice(0, 68)}…` : lookingBack.card.front}</span>
                </div>
                <div className="content">{lookingBack.card.back}</div>
                <div className="tap">You rated this: {RATINGS.find((r) => r.r === lookingBack.rating)?.label}</div>
              </div>
            </div>
          </div>
          {changing ? (
            <div className="ratings">
              {RATINGS.map((x) => (
                <button key={x.r} className={`rate ${x.cls} ${x.r === lookingBack.rating ? 'suggested' : ''}`} onClick={() => rerate(x.r)} disabled={busy}>
                  {x.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn" onClick={() => setChanging(true)}>
                <Undo2 size={16} /> Change my rating
              </button>
              <button className="btn primary" onClick={() => setBack(0)}>
                Continue where I was <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      ) : !card ? (
        <div className="sheet empty">
          {done.reviewed > 0 ? (
            <>
              <PartyPopper size={36} color="var(--biro)" style={{ margin: '0 auto 10px' }} />
              <h2>Session done</h2>
              <p className="muted">
                You reviewed {plural(done.reviewed, 'card')}. {done.good} felt good{done.again ? `, ${done.again} needed another go` : ''}. The scheduler will bring each one back at the right time.
              </p>
              {earned > 0 && (
                <p className="row" style={{ justifyContent: 'center', gap: 6, color: 'var(--biro)', fontWeight: 500 }}>
                  <Trophy size={18} /> +{earned} memory points this session
                </p>
              )}
            </>
          ) : (
            <>
              <Check size={36} color="var(--good)" style={{ margin: '0 auto 10px' }} />
              <h2>{mode === 'due' ? 'Nothing due right now' : mode === 'weak' ? 'No struggling cards' : 'No cards here yet'}</h2>
              <p className="muted">{mode === 'due' ? 'Your memory is up to date. Come back later, or practise all cards now.' : 'Keep going — cards you find hard will show up here.'}</p>
            </>
          )}
          <div className="row" style={{ justifyContent: 'center' }}>
            {mode !== 'all' && (
              <button className="btn primary" onClick={() => setMode('all')}>
                Practise all cards
              </button>
            )}
            {packId ? (
              <>
                <Link to={`/pack/${packId}/quiz`} className="btn">
                  Take a quiz
                </Link>
                <Link to={`/pack/${packId}`} className="btn ghost">
                  Back to the pack
                </Link>
              </>
            ) : (
              <Link to="/home" className="btn ghost">
                Back home
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="row between small muted" style={{ marginBottom: 8 }}>
            <span>
              Card {Math.min(pos + 1, queue.length)} of {queue.length}
            </span>
            {!packId && card.packTitle && <span>{card.packTitle}</span>}
          </div>
          <div style={{ marginBottom: 18 }}>
            <Bar value={(pos / Math.max(1, queue.length)) * 100} />
          </div>

          {editing ? (
            <div className="sheet stack">
              <div className="field">
                <label htmlFor="ef">Front</label>
                <textarea id="ef" className="textarea" style={{ minHeight: 90 }} value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="eb">Back</label>
                <textarea id="eb" className="textarea" style={{ minHeight: 110 }} value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} />
              </div>
              <div className="row">
                <button className="btn primary" onClick={saveEdit}>
                  Save card
                </button>
                <button className="btn ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="card-stage">
              <div
                className={`flashcard ${flipped ? 'flipped' : ''}`}
                onClick={() => setFlipped((f) => !f)}
                role="button"
                tabIndex={0}
                aria-label={flipped ? `Answer: ${card.back}` : `Question: ${card.front}. Press space to show the answer.`}
              >
                <div className="face front">
                  <span className="card-lesson" title="The lesson this card is from">
                    Lesson {card.chunk + 1}
                    {card.chunkTitle ? `: ${card.chunkTitle}` : ''}
                  </span>
                  <div className="kind">
                    <span>{TYPE_LABEL[card.type] || 'Card'}</span>
                    {card.reps === 0 && card.interval === 0 && <span className="chip" style={{ padding: '0 8px' }}>New</span>}
                  </div>
                  <div className="content">{card.front}</div>
                  <div className="tap">{card.hint && !flipped ? `Hint: ${card.hint}` : 'Tap to see the answer'}</div>
                </div>
                <div className="face back">
                  <span className="card-lesson">
                    Lesson {card.chunk + 1}
                    {card.chunkTitle ? `: ${card.chunkTitle}` : ''}
                  </span>
                  <div className="kind">
                    <span>Answer</span>
                  </div>
                  <div className="content">{card.back}</div>
                  <div className="tap">How well did you remember it?</div>
                </div>
              </div>
            </div>
          )}

          {!editing && (
            <>
              {flipped && mark && <TypedResult mark={mark} typed={typed} />}
              {flipped ? (
                <div className="ratings">
                  {RATINGS.map((x) => (
                    <button key={x.r} className={`rate ${x.cls} ${mark?.suggested === x.r ? 'suggested' : ''}`} onClick={() => rate(x.r)} disabled={busy} aria-describedby={mark?.suggested === x.r ? 'suggest-note' : undefined}>
                      {x.label}
                      <small>
                        {previewLabel(
                          { ease: card.ease, interval_days: card.interval, reps: card.reps, lapses: card.lapses, stability: card.stability, difficulty: card.difficulty, last_reviewed_at: card.lastReviewedAt },
                          x.r,
                          card.examDate,
                        )}
                      </small>
                    </button>
                  ))}
                </div>
              ) : typeMode ? (
                <form onSubmit={checkTyped} style={{ maxWidth: 640, margin: '18px auto 0' }} className="stack">
                  <textarea
                    className="textarea"
                    style={{ minHeight: 80 }}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        checkTyped();
                      }
                    }}
                    placeholder="Type your answer… (Enter to check, Shift+Enter for a new line)"
                    aria-label="Your answer"
                    autoFocus
                  />
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button type="button" className="btn" onClick={() => checkTyped()}>
                      <CircleHelp size={17} /> I don’t know
                    </button>
                    <button className="btn primary big" style={{ flex: 1 }}>
                      Check my answer
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ maxWidth: 640, margin: '18px auto 0' }}>
                  <button className="btn primary big block" onClick={() => setFlipped(true)}>
                    Show answer
                  </button>
                </div>
              )}
              <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 4 }}>
                {ttsSupported && (
                  <button className="btn ghost small" onClick={() => speak(flipped ? card.back : card.front)}>
                    <Volume2 size={16} /> Read aloud
                  </button>
                )}
                <button className="btn ghost small" onClick={() => setEditing({ front: card.front, back: card.back })}>
                  <Pencil size={16} /> Edit
                </button>
                <button className="btn ghost small" onClick={suspend}>
                  <EyeOff size={16} /> Hide card
                </button>
              </div>
              <div className="kbd-hints">
                {typeMode ? (
                  <>
                    <kbd>Enter</kbd> check, then <kbd>Enter</kbd> to accept the suggested rating or <kbd>1</kbd>–<kbd>4</kbd> to choose
                  </>
                ) : (
                  <>
                    <kbd>Space</kbd> flip, then <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> to rate
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
      {queue && card && done.reviewed > 0 && (
        <p className="small muted" style={{ textAlign: 'center', marginTop: 10 }}>
          <X size={12} style={{ display: 'inline' }} /> {done.again} to repeat, {done.reviewed} reviewed so far
        </p>
      )}
    </div>
  );
}

const VERDICT = {
  right: { label: 'Correct', color: 'var(--good)', bg: 'var(--good-soft)' },
  close: { label: 'Nearly there', color: 'var(--warn)', bg: 'var(--paper-2)' },
  wrong: { label: 'Not yet', color: 'var(--bad)', bg: 'var(--bad-soft)' },
} as const;

function TypedResult({ mark, typed }: { mark: TypedMark; typed: string }) {
  const v = VERDICT[mark.verdict];
  const hits = mark.keywords.filter((k) => k.hit).length;
  return (
    <div className="sheet tight" style={{ maxWidth: 640, margin: '16px auto 0', borderLeft: `5px solid ${v.color}` }} aria-live="polite">
      <div className="row between">
        <strong style={{ color: v.color }}>{v.label}</strong>
        {mark.keywords.length > 1 && (
          <span className="small muted">
            {hits} of {mark.keywords.length} key words
          </span>
        )}
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        <span className="muted">You wrote: </span>
        {typed.trim() ? <span style={{ whiteSpace: 'pre-wrap' }}>{typed.trim()}</span> : <em className="muted">nothing</em>}
      </div>
      {mark.keywords.length > 1 && (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          {mark.keywords.map((k) => (
            <span key={k.word} className={`kw ${k.hit ? 'hit' : 'miss'}`}>
              {k.hit ? <Check size={12} /> : <X size={12} />} {k.word}
            </span>
          ))}
        </div>
      )}
      <p id="suggest-note" className="hint" style={{ margin: '8px 0 0' }}>
        We suggest <strong>{RATINGS.find((r) => r.r === mark.suggested)?.label}</strong>. Press Enter to accept, or pick another if you disagree.
      </p>
    </div>
  );
}
