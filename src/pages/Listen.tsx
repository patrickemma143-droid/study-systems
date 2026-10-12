import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Headphones, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { Crumbs, ErrorState, Loading } from '../components/ui';
import { speak, stopSpeaking, ttsSupported, voices } from '../lib/speech';
import { usePack, useStudyTimer } from '../lib/usePack';
import { save, store } from '../lib/util';

const SPEEDS = [0.8, 1, 1.25, 1.5];
const WAITS = [3, 5, 8];

export default function Listen() {
  const id = Number(useParams().id);
  const { data, error } = usePack(id);
  useStudyTimer('listen', id);
  const [mode, setMode] = useState<'lessons' | 'cards'>('lessons');
  const [full, setFull] = useState(false);
  const [rate, setRate] = useState<number>(() => store('cs-tts-rate', 1));
  const [voice, setVoice] = useState<string>(() => store('cs-tts-voice', ''));
  const [wait, setWait] = useState(5);
  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<'q' | 'a'>('q');
  const run = useRef(0);
  const timer = useRef<number>(undefined);

  useEffect(() => {
    if (!ttsSupported) return;
    const load = () => setVoiceList(voices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  useEffect(() => save('cs-tts-rate', rate), [rate]);
  useEffect(() => save('cs-tts-voice', voice), [voice]);
  useEffect(() => () => stopAll(), []);

  function stopAll() {
    run.current++;
    window.clearTimeout(timer.current);
    stopSpeaking();
  }

  const items = data?.pack.data.chunks || [];
  const cards = data?.pack.data.cards || [];
  const total = mode === 'lessons' ? items.length : cards.length;

  function playFrom(i: number) {
    stopAll();
    if (!data || i >= total) {
      setPlaying(false);
      return;
    }
    const my = run.current;
    setPos(i);
    setPlaying(true);
    const opts = { rate, voice };
    if (mode === 'lessons') {
      const c = items[i];
      const parts = [`Lesson ${i + 1}. ${c.title}.`, ...(full ? c.body.map((b) => b.x) : [c.nutshell, ...c.keyPoints])];
      const step = (k: number) => {
        if (my !== run.current) return;
        if (k >= parts.length) {
          timer.current = window.setTimeout(() => my === run.current && playFrom(i + 1), 900);
          return;
        }
        speak(parts[k], { ...opts, onEnd: () => step(k + 1) });
      };
      step(0);
    } else {
      const c = cards[i];
      setPhase('q');
      speak(c.front.replace(/_____/g, 'blank'), {
        ...opts,
        onEnd: () => {
          if (my !== run.current) return;
          timer.current = window.setTimeout(() => {
            if (my !== run.current) return;
            setPhase('a');
            speak(`Answer: ${c.back.replace(/^[•\d.]+\s*/gm, '')}`, { ...opts, onEnd: () => my === run.current && (timer.current = window.setTimeout(() => playFrom(i + 1), 1400)) });
          }, wait * 1000);
        },
      });
    }
  }

  function toggle() {
    if (playing) {
      stopAll();
      setPlaying(false);
    } else playFrom(pos);
  }

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  const currentLesson = mode === 'lessons' ? items[pos] : null;
  const currentCard = mode === 'cards' ? cards[pos] : null;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Listen' }]} />
      <h1>Listen mode</h1>
      {!ttsSupported ? (
        <div className="sheet empty">
          <h2>Your browser can’t read aloud</h2>
          <p className="muted">Open Charis Study in Chrome, Edge or Safari to use listen mode.</p>
        </div>
      ) : (
        <>
          <p className="muted">Put in your earphones. Good for the taxi, the walk to class, or when your eyes are tired. The screen can stay on this page.</p>
          <div className="row between" style={{ margin: '14px 0' }}>
            <div className="segmented" role="group" aria-label="What to play">
              <button aria-pressed={mode === 'lessons'} onClick={() => { stopAll(); setPlaying(false); setMode('lessons'); setPos(0); }}>
                Lessons
              </button>
              <button aria-pressed={mode === 'cards'} onClick={() => { stopAll(); setPlaying(false); setMode('cards'); setPos(0); }}>
                Audio flashcards
              </button>
            </div>
            {mode === 'lessons' ? (
              <div className="segmented" role="group" aria-label="How much to read">
                <button aria-pressed={!full} onClick={() => setFull(false)}>
                  Main points
                </button>
                <button aria-pressed={full} onClick={() => setFull(true)}>
                  Full notes
                </button>
              </div>
            ) : (
              <div className="segmented" role="group" aria-label="Thinking time">
                {WAITS.map((w) => (
                  <button key={w} aria-pressed={wait === w} onClick={() => setWait(w)}>
                    {w}s to think
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sheet" style={{ textAlign: 'center', padding: '30px 24px' }}>
            <Headphones size={30} color="var(--biro)" style={{ margin: '0 auto 8px' }} />
            <div className="small muted">
              {mode === 'lessons' ? `Lesson ${pos + 1} of ${total}` : `Card ${pos + 1} of ${total}`}
            </div>
            {currentLesson && <h2 style={{ margin: '6px 0 0' }}>{currentLesson.title}</h2>}
            {currentCard && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 500, whiteSpace: 'pre-line' }}>{currentCard.front}</div>
                {phase === 'a' && playing && <div className="hand" style={{ color: 'var(--biro)', marginTop: 10, whiteSpace: 'pre-line' }}>{currentCard.back}</div>}
              </div>
            )}
            <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
              <button className="btn icon big" onClick={() => playFrom(Math.max(0, pos - 1))} aria-label="Previous">
                <SkipBack size={20} />
              </button>
              <button className="btn primary big" style={{ minWidth: 140 }} onClick={toggle}>
                {playing ? <Pause size={20} /> : <Play size={20} />} {playing ? 'Pause' : 'Play'}
              </button>
              <button className="btn icon big" onClick={() => playFrom(Math.min(total - 1, pos + 1))} aria-label="Next">
                <SkipForward size={20} />
              </button>
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16, gap: 8 }}>
              <span className="small muted">Speed</span>
              <div className="segmented" role="group" aria-label="Speed">
                {SPEEDS.map((s) => (
                  <button key={s} aria-pressed={rate === s} onClick={() => setRate(s)}>
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            {voiceList.length > 1 && (
              <div style={{ maxWidth: 320, margin: '14px auto 0' }}>
                <select className="select" value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="Voice">
                  <option value="">Default voice</option>
                  {voiceList.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {mode === 'lessons' && (
            <div className="sheet" style={{ padding: '4px 20px', marginTop: 18 }}>
              <div className="list">
                {items.map((c, i) => (
                  <button key={i} className="list-row" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => playFrom(i)}>
                    <span className={`list-num ${i === pos ? 'read' : ''}`}>{i + 1}</span>
                    <span className="list-body">
                      <span className="list-title" style={{ display: 'block', color: i === pos ? 'var(--biro)' : undefined }}>
                        {c.title}
                      </span>
                      <span className="list-sub">{c.readMinutes} min</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
