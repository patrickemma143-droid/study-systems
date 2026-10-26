// The whiteboard tutor: a lesson taught step by step on a board, in a natural voice, that the
// student can stop at any moment to ask a question. Ends with practice that turns into flashcards.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Captions, CheckCircle2, ChevronLeft, ChevronRight, Hand, Layers, Mic, Pause, Play, RotateCcw, Send, Sparkles, Volume2, VolumeX, XCircle } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/ui';
import Board, { type ShownItem } from '../components/Board';
import { TutorFace } from '../components/TutorFace';
import { useAiStatus, updateAiUsage, left } from '../lib/ai';
import { Narrator, type Track, type VoiceMode } from '../lib/tutor/narrator';
import { dictationSupported, startDictation } from '../lib/speech';
import { useStudyTimer } from '../lib/usePack';
import type { TutorLesson, TutorStep } from '../../shared/tutor';

interface LessonReply {
  id: number;
  lesson: TutorLesson;
  step: number;
  packId: number | null;
  chunk: number | null;
  packTitle: string | null;
  next: { chunk: number; title: string } | null;
  voice: boolean;
}
type PlayStep = TutorStep & { group: string; lessonIndex: number };

const MODE_LABEL: Record<string, string> = { topic: 'Topic', lesson: 'From your notes', exam: 'Exam prep', homework: 'Homework', text: 'Your material' };

export default function Tutor() {
  const { id } = useParams();
  return id === 'new' ? <TutorStart /> : <TutorPlayer key={id} id={Number(id)} />;
}

/** /tutor/new?mode=…: make (or reopen) the lesson, then play it. */
function TutorStart() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const mode = params.get('mode') || 'topic';
  const what = mode === 'topic' ? params.get('topic') || '' : mode === 'exam' ? 'your exam' : 'your lesson';

  const start = useCallback(() => {
    setError(null);
    const body =
      mode === 'lesson'
        ? { mode, packId: Number(params.get('pack')), chunk: Number(params.get('chunk') || 0) }
        : mode === 'exam'
          ? { mode, packId: Number(params.get('pack')) }
          : { mode: 'topic', topic: params.get('topic') || '' };
    api<{ id: number; usage: any }>('/tutor/lesson', { body })
      .then((r) => {
        updateAiUsage(r.usage);
        nav(`/tutor/${r.id}`, { replace: true });
      })
      .catch((e) => setError(e.message));
  }, [mode, params, nav]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  return (
    <div className="tutor-start">
      <div className="board tutor-warm">
        <div className="board-inner">
          <TutorFace speaking={!error} size={72} />
          {error ? (
            <>
              <h2>That lesson didn’t start</h2>
              <p className="muted">{error}</p>
              <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
                <button className="btn primary" onClick={start}>
                  <RotateCcw size={16} /> Try again
                </button>
                <Link to="/home" className="btn">
                  Home
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="hand-title">Getting the board ready…</h2>
              <p className="muted">
                Planning a lesson on <strong>{what}</strong>. This takes about 20 seconds the first time; after that it opens instantly for everyone.
              </p>
              <div className="tutor-dots" aria-hidden>
                <span />
                <span />
                <span />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TutorPlayer({ id }: { id: number }) {
  useStudyTimer('tutor', null);
  const toast = useToast();
  const nav = useNavigate();
  const ai = useAiStatus();
  const [data, setData] = useState<LessonReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<PlayStep[]>([]);
  const [cur, setCur] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(() => {
    try {
      return (localStorage.getItem('tutor-voice') as VoiceMode) || 'natural';
    } catch {
      return 'natural';
    }
  });
  const [rate, setRate] = useState(1);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [listening, setListening] = useState(false);
  const stopDictation = useRef<(() => void) | null>(null);
  const narrator = useRef<Narrator | null>(null);
  const track = useRef<{ step: number; t: Track; offsets: number[] } | null>(null);
  const qCount = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<LessonReply>(`/tutor/lessons/${id}`)
      .then((r) => {
        setData(r);
        setSteps(r.lesson.steps.map((s, i) => ({ ...s, group: 'L', lessonIndex: i })));
        const resume = Math.min(r.step, r.lesson.steps.length - 1);
        setCur(resume > 0 && resume < r.lesson.steps.length - 1 ? resume : 0);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  // the voice: natural if the site has it, else the phone's voice
  useEffect(() => {
    if (!data) return;
    const mode: VoiceMode = voiceMode === 'natural' && !data.voice ? 'device' : voiceMode;
    const n = new Narrator(mode, (reason) => toast(`${reason} Using your phone’s voice instead.`));
    n.rate = rate;
    narrator.current = n;
    return () => {
      track.current?.t.stop();
      track.current = null;
      n.dispose();
      narrator.current = null;
    };
  }, [data, voiceMode]);
  useEffect(() => {
    if (narrator.current) narrator.current.rate = rate;
  }, [rate]);

  const step = steps[cur];

  // play the current step: voice, then board items written in time with it
  useEffect(() => {
    const n = narrator.current;
    if (!playing || !step || !n || done) return;
    let cancelled = false;
    let raf = 0;
    (async () => {
      let tr = track.current?.step === cur && !track.current.t.ended ? track.current : null;
      if (!tr) {
        const t = await n.track(step.say);
        if (cancelled) {
          t.stop();
          return;
        }
        // spread the board writing over the spoken part, longer items getting more time
        const weights = step.board.map((b) => (b.t === 'circle' || b.t === 'underline' || b.t === 'arrow' || b.t === 'clear' ? 0.4 : 1 + Math.min(3, JSON.stringify(b).length / 80)));
        const total = weights.reduce((a, b) => a + b, 0) || 1;
        const span = t.duration * 0.82;
        let acc = 0.15;
        const offsets = weights.map((w) => {
          const o = acc;
          acc += (w / total) * span;
          return o;
        });
        tr = { step: cur, t, offsets };
        track.current = tr;
        t.onEnd(() => {
          setSpeaking(false);
          setRevealed(step.board.length);
          window.setTimeout(() => {
            if (cancelled) return;
            track.current = null;
            if (cur < steps.length - 1) {
              setCur(cur + 1);
              setRevealed(0);
            } else {
              setDone(true);
              setPlaying(false);
            }
          }, 650);
        });
      }
      const next = steps[cur + 1];
      if (next) n.prefetch(next.say);
      tr.t.play();
      setSpeaking(true);
      const tick = () => {
        const tt = tr!.t.time();
        const count = tr!.offsets.filter((o) => o <= tt).length;
        setRevealed((r) => (count > r ? count : r));
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (track.current?.step === cur) track.current.t.pause();
      setSpeaking(false);
    };
  }, [playing, cur, steps, done]);

  // remember the place in the lesson
  useEffect(() => {
    if (!data || !step || step.group !== 'L') return;
    const t = window.setTimeout(() => {
      void api(`/tutor/lessons/${id}`, { method: 'PATCH', body: { step: step.lessonIndex } }).catch(() => {});
    }, 800);
    return () => {
      window.clearTimeout(t);
    };
  }, [cur, data]);

  // what is on the board: this part (lesson, or the answer to a question) since the last wipe
  const shown: ShownItem[] = useMemo(() => {
    if (!step) return [];
    const out: ShownItem[] = [];
    steps.forEach((s, si) => {
      if (si > cur || s.group !== step.group) return;
      const upto = si < cur ? s.board.length : revealed;
      s.board.slice(0, upto).forEach((item, ii) => {
        let draw = 0;
        if (si === cur && track.current?.step === cur) {
          const o = track.current.offsets;
          draw = Math.max(0.45, Math.min(1.6, (o[ii + 1] ?? track.current.t.duration) - o[ii]));
        }
        out.push({ key: `${si}-${ii}`, item, draw });
      });
    });
    const lastClear = out.map((x) => x.item.t).lastIndexOf('clear');
    return out.slice(lastClear + 1);
  }, [steps, cur, revealed, step]);

  function go(to: number) {
    track.current?.t.stop();
    track.current = null;
    setDone(false);
    const target = Math.max(0, Math.min(steps.length - 1, to));
    setCur(target);
    // paused: show the whole step; playing: it is written out again with the voice
    setRevealed(playing ? 0 : steps[target]?.board.length || 0);
  }
  function togglePlay() {
    if (!started) setStarted(true);
    if (done) {
      setDone(false);
      go(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }
  function skip() {
    if (cur >= steps.length - 1) {
      track.current?.t.stop();
      track.current = null;
      setRevealed(step?.board.length || 0);
      setDone(true);
      setPlaying(false);
      return;
    }
    go(cur + 1);
  }

  // "I have a question"
  function openAsk() {
    setPlaying(false);
    setAskOpen(true);
  }
  async function ask(q: string, e?: FormEvent) {
    e?.preventDefault();
    const text = q.trim();
    if (!text || !step) return;
    setAsking(true);
    stopDictation.current?.();
    try {
      const r = await api<{ steps: TutorStep[]; usage: any }>(`/tutor/lessons/${id}/ask`, { body: { step: step.lessonIndex, question: text } });
      updateAiUsage(r.usage);
      const group = `Q${++qCount.current}`;
      const extra = r.steps.map((s) => ({ ...s, group, lessonIndex: step.lessonIndex }));
      track.current?.t.stop();
      track.current = null;
      setSteps((all) => [...all.slice(0, cur + 1), ...extra, ...all.slice(cur + 1)]);
      setRevealed(0);
      setCur(cur + 1);
      setDone(false);
      setAskOpen(false);
      setQuestion('');
      setStarted(true);
      setPlaying(true);
    } catch (err: any) {
      toast(err.message);
    } finally {
      setAsking(false);
    }
  }
  function dictate() {
    if (listening) {
      stopDictation.current?.();
      return;
    }
    setListening(true);
    stopDictation.current = startDictation(
      (t) => setQuestion((q) => (q ? `${q} ${t}` : t)),
      () => setListening(false),
    );
  }

  // keyboard: space play/pause, arrows step, Q ask
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || askOpen) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') skip();
      else if (e.key === 'ArrowLeft') go(cur - 1);
      else if (e.key.toLowerCase() === 'q') openAsk();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (done) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [done]);

  if (error) {
    return (
      <div className="sheet empty" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h2>Lesson not found</h2>
        <p className="muted">{error}</p>
        <Link to="/home" className="btn primary">
          Home
        </Link>
      </div>
    );
  }
  if (!data || !step) return <div className="tutor-start muted">Opening the lesson…</div>;

  const lessonSteps = data.lesson.steps.length;
  const inAnswer = step.group !== 'L';
  const back = data.packId ? `/pack/${data.packId}` : '/home';
  const voiceLabel = voiceMode === 'natural' ? (data.voice ? 'Natural voice' : 'Phone voice') : voiceMode === 'device' ? 'Phone voice' : 'No sound';

  return (
    <div className="tutor">
      <div className="tutor-top">
        <Link to={back} className="btn icon ghost" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <div className="tutor-title">
          <span className="chip small">{MODE_LABEL[data.lesson.mode] || 'Lesson'}</span>
          <h1>{data.lesson.title}</h1>
        </div>
        <div className="tutor-settings">
          <button
            className="btn small ghost"
            onClick={() => {
              const order: VoiceMode[] = ['natural', 'device', 'silent'];
              const next = order[(order.indexOf(voiceMode) + 1) % order.length];
              try {
                localStorage.setItem('tutor-voice', next);
              } catch {
                /* fine */
              }
              setPlaying(false);
              setVoiceMode(next);
            }}
            title="Change the voice"
          >
            {voiceMode === 'silent' ? <VolumeX size={15} /> : <Volume2 size={15} />} {voiceLabel}
          </button>
          <button className="btn small ghost" onClick={() => setRate((r) => (r >= 1.5 ? 1 : +(r + 0.25).toFixed(2)))} title="Speed">
            {rate}×
          </button>
          <button className="btn small ghost" aria-pressed={captions} onClick={() => setCaptions((c) => !c)} title="Captions">
            <Captions size={15} />
          </button>
        </div>
      </div>

      <div className="tutor-progress" aria-label={`Step ${step.lessonIndex + 1} of ${lessonSteps}`}>
        {data.lesson.steps.map((_, i) => (
          <button key={i} className={i < step.lessonIndex || (i === step.lessonIndex && done) ? 'past' : i === step.lessonIndex ? 'now' : ''} onClick={() => go(steps.findIndex((s) => s.group === 'L' && s.lessonIndex === i))} aria-label={`Go to step ${i + 1}`} />
        ))}
      </div>

      <div className={`tutor-stage ${inAnswer ? 'answering' : ''}`}>
        {inAnswer && (
          <div className="tutor-qbanner">
            <Hand size={14} /> Answering your question
          </div>
        )}
        <Board items={shown} />
        {!started && (
          <button className="tutor-startbtn" onClick={togglePlay}>
            <span className="tutor-startcircle">
              <Play size={30} />
            </span>
            <span>{data.step > 0 ? 'Continue the lesson' : 'Start the lesson'}</span>
            <span className="small muted">
              {lessonSteps} steps · about {Math.max(2, Math.round(data.lesson.steps.reduce((n, s) => n + s.say.split(/\s+/).length, 0) / 150 + lessonSteps * 0.15))} min
            </span>
          </button>
        )}
      </div>

      <div className="tutor-bar">
        <div className="tutor-caption">
          <TutorFace speaking={speaking} size={46} />
          <p aria-live="polite">{captions ? step.say : <span className="muted">Captions off</span>}</p>
        </div>
        <div className="tutor-controls">
          <button className="btn icon" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Previous step">
            <ChevronLeft size={20} />
          </button>
          <button className="btn icon primary tutor-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button className="btn icon" onClick={skip} aria-label="Next step">
            <ChevronRight size={20} />
          </button>
          <button className="btn tutor-ask" onClick={openAsk} disabled={!ai?.enabled}>
            <Hand size={17} /> I have a question
          </button>
        </div>
      </div>

      {askOpen && (
        <div className="sheet tutor-askbox">
          <form onSubmit={(e) => ask(question, e)} className="stack">
            <label className="label" htmlFor="tq">
              What would you like to ask?
            </label>
            <div className="row" style={{ gap: 6 }}>
              <input id="tq" className="input" style={{ flex: 1 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Why does that step work?" autoFocus disabled={asking} />
              {dictationSupported && (
                <button type="button" className={`btn icon ${listening ? 'primary' : ''}`} onClick={dictate} aria-label={listening ? 'Stop listening' : 'Ask by voice'}>
                  <Mic size={17} />
                </button>
              )}
              <button className="btn primary" disabled={asking || !question.trim()}>
                <Send size={16} /> {asking ? 'Thinking…' : 'Ask'}
              </button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {['Explain that again, more simply', 'Give me another example', 'Why does that work?', 'How would this come in an exam?'].map((c) => (
                <button key={c} type="button" className="chip" onClick={() => ask(c)} disabled={asking}>
                  {c}
                </button>
              ))}
            </div>
            <div className="row small muted" style={{ justifyContent: 'space-between' }}>
              <span>{ai ? `${left(ai, 'tutor')} questions left today` : ''}</span>
              <button
                type="button"
                className="linklike"
                onClick={() => {
                  setAskOpen(false);
                  setPlaying(true);
                }}
              >
                No question, carry on
              </button>
            </div>
          </form>
        </div>
      )}

      {done && (
        <div ref={endRef}>
          <LessonEnd id={id} data={data} onReplay={() => { go(0); setPlaying(true); }} onNext={() => data.next && data.packId && nav(`/tutor/new?mode=lesson&pack=${data.packId}&chunk=${data.next.chunk}`)} />
        </div>
      )}
    </div>
  );
}

function LessonEnd({ id, data, onReplay, onNext }: { id: number; data: LessonReply; onReplay: () => void; onNext: () => void }) {
  const toast = useToast();
  const { lesson } = data;
  const [picks, setPicks] = useState<number[]>(() => lesson.practice.map(() => -1));
  const [result, setResult] = useState<{ score: number; total: number; points: number; marked: { right: number; ok: boolean }[] } | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTry, setShowTry] = useState(false);

  async function check() {
    try {
      setResult(await api(`/tutor/lessons/${id}/practice`, { body: { answers: picks } }));
    } catch (e: any) {
      toast(e.message);
    }
  }
  async function save() {
    setSaving(true);
    try {
      const r = await api<{ packId: number; added: number }>(`/tutor/lessons/${id}/save`, { method: 'POST' });
      setSaved(r.packId);
      toast(r.added ? `${r.added} flashcards added — they come back in your daily review.` : 'These flashcards are already saved.');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tutor-end stack">
      <div className="sheet">
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <TutorFace size={40} />
          <h2 style={{ margin: 0 }}>Nice work! Here’s what to remember</h2>
        </div>
        {lesson.summary.length > 0 && (
          <ul className="tutor-summary">
            {lesson.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        <div className="row" style={{ gap: 8 }}>
          {saved ? (
            <Link to={`/pack/${saved}/cards`} className="btn primary">
              <Layers size={16} /> Review the flashcards
            </Link>
          ) : (
            <button className="btn primary" onClick={save} disabled={saving}>
              <Layers size={16} /> {saving ? 'Saving…' : 'Save as flashcards'}
            </button>
          )}
          {data.next && (
            <button className="btn" onClick={onNext}>
              Next lesson: {data.next.title} <ChevronRight size={16} />
            </button>
          )}
          <button className="btn ghost" onClick={onReplay}>
            <RotateCcw size={16} /> Watch again
          </button>
        </div>
      </div>

      {lesson.tryNext && (
        <div className="sheet">
          <h3>Now you try</h3>
          <p>{lesson.tryNext.q}</p>
          {showTry ? (
            <div className="key-answer" style={{ whiteSpace: 'pre-wrap' }}>
              {lesson.tryNext.answer}
            </div>
          ) : (
            <button className="btn small" onClick={() => setShowTry(true)}>
              Show the worked answer
            </button>
          )}
        </div>
      )}

      {lesson.practice.length > 0 && (
        <div className="sheet stack">
          <h3 style={{ margin: 0 }}>
            <Sparkles size={17} style={{ verticalAlign: '-3px' }} /> Check you’ve got it
          </h3>
          {lesson.practice.map((p, i) => (
            <div key={i} className="tutor-q">
              <p className="tutor-qtext">
                {i + 1}. {p.q}
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {p.options.map((o, j) => {
                  const m = result?.marked[i];
                  const cls = m ? (j === m.right ? 'correct' : j === picks[i] ? 'wrong' : '') : picks[i] === j ? 'picked' : '';
                  return (
                    <button key={j} className={`option ${cls}`} disabled={!!result} onClick={() => setPicks((ps) => ps.map((x, k) => (k === i ? j : x)))}>
                      {m && j === m.right && <CheckCircle2 size={16} />}
                      {m && j === picks[i] && j !== m.right && <XCircle size={16} />} {o}
                    </button>
                  );
                })}
              </div>
              {result && p.explain && <p className="small muted" style={{ margin: '6px 0 0' }}>{p.explain}</p>}
            </div>
          ))}
          {result ? (
            <p style={{ margin: 0 }}>
              <strong>
                {result.score} / {result.total}
              </strong>
              {result.points > 0 && <span className="small"> · +{result.points} Memory points</span>}
            </p>
          ) : (
            <button className="btn primary" onClick={check} disabled={picks.some((x) => x < 0)}>
              Check my answers
            </button>
          )}
        </div>
      )}
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <Link to="/home" className="btn ghost">
          Learn something else
        </Link>
        {data.packId && (
          <Link to={`/pack/${data.packId}`} className="btn ghost">
            Back to {data.packTitle || 'the pack'}
          </Link>
        )}
      </div>
    </div>
  );
}
