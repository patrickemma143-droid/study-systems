import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, EyeOff, Pencil, PartyPopper, Volume2, X } from 'lucide-react';
import { previewLabel, type Rating } from '@shared/srs';
import { api, type Card } from '../api';
import { Bar, Crumbs, Loading, useToast } from '../components/ui';
import { invalidatePack, usePack, useStudyTimer } from '../lib/usePack';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';
import { plural, today } from '../lib/util';

const RATINGS: { r: Rating; label: string; cls: string; key: string }[] = [
  { r: 1, label: 'Again', cls: 'again', key: '1' },
  { r: 2, label: 'Hard', cls: '', key: '2' },
  { r: 3, label: 'Good', cls: '', key: '3' },
  { r: 4, label: 'Easy', cls: 'easy', key: '4' },
];

const TYPE_LABEL: Record<string, string> = { definition: 'Definition', reverse: 'Name the term', cloze: 'Fill the gap', list: 'List', custom: 'Your card' };

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

  const load = useCallback(async () => {
    setQueue(null);
    setPos(0);
    setFlipped(false);
    setDone({ reviewed: 0, again: 0, good: 0 });
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

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const r = await api<{ card: Card }>(`/study/cards/${card.id}/review`, { body: { rating, day: today() } });
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
    [card, busy, packId, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement).closest('input,textarea')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, rate, editing]);

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
            {chunks ? `Lesson ${Number(chunks.split(',')[0]) + 1}. ` : ''}Try to answer before you flip. Be honest when you rate yourself.
          </p>
        </div>
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

      {!queue ? (
        <Loading />
      ) : !card ? (
        <div className="sheet empty">
          {done.reviewed > 0 ? (
            <>
              <PartyPopper size={36} color="var(--biro)" style={{ margin: '0 auto 10px' }} />
              <h2>Session done</h2>
              <p className="muted">
                You reviewed {plural(done.reviewed, 'card')}. {done.good} felt good{done.again ? `, ${done.again} needed another go` : ''}. The scheduler will bring each one back at the right time.
              </p>
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
                  <div className="kind">
                    <span>{TYPE_LABEL[card.type] || 'Card'}</span>
                    {card.reps === 0 && card.interval === 0 && <span className="chip" style={{ padding: '0 8px' }}>New</span>}
                  </div>
                  <div className="content">{card.front}</div>
                  <div className="tap">{card.hint && !flipped ? `Hint: ${card.hint}` : 'Tap to see the answer'}</div>
                </div>
                <div className="face back">
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
              {flipped ? (
                <div className="ratings">
                  {RATINGS.map((x) => (
                    <button key={x.r} className={`rate ${x.cls}`} onClick={() => rate(x.r)} disabled={busy}>
                      {x.label}
                      <small>{previewLabel({ ease: card.ease, interval_days: card.interval, reps: card.reps, lapses: card.lapses }, x.r, card.examDate)}</small>
                    </button>
                  ))}
                </div>
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
                <kbd>Space</kbd> flip, then <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> to rate
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
