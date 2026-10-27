// The whiteboard tutor: a full-screen lesson taught step by step on a wide board, in the voice the
// student chose. The student can talk to it (mic) or type at any moment, answers quick checks on
// the board, and finishes with practice that turns into flashcards.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eraser, Highlighter, Keyboard, Layers, LocateFixed, Maximize2, Mic, MicOff, Minimize2, PenLine, ScanEye, Trash2, Undo2, Pause, Play, RotateCcw, Send, Settings2, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/ui';
import Board, { type InkTool, type QuizEl, type ShownItem } from '../components/Board';
import { INK_COLOURS, type InkStroke } from '../../shared/ink';
import { TutorFace } from '../components/TutorFace';
import { TutorPicker } from '../components/TutorPicker';
import { TutorAvatar, type Reaction } from '../components/TutorAvatar';
import { unlockMeter } from '../lib/tutor/meter';
import { useAiStatus, updateAiUsage, left } from '../lib/ai';
import { Narrator, type Track } from '../lib/tutor/narrator';
import { listenOnce, matchOption, recognitionSupported, recordWav, recordingSupported, type Listening } from '../lib/tutor/listen';
import { useTutorPrefs } from '../lib/tutor/prefs';
import { useStudyTimer } from '../lib/usePack';
import type { BoardItem, Check, TutorLesson, TutorStep } from '../../shared/tutor';
import { DEFAULT_PREFS, tutorById, type TutorPrefs } from '../../shared/tutors';

interface LessonReply {
  id: number;
  lesson: TutorLesson;
  step: number;
  packId: number | null;
  chunk: number | null;
  packTitle: string | null;
  next: { chunk: number; title: string } | null;
  voice: boolean;
  ink?: InkStroke[];
}
/** A step as played: lesson steps, plus answers to the student's questions put in between. */
type PlayStep = TutorStep & { lessonIndex: number; asked?: boolean };
type Phase = 'ready' | 'playing' | 'paused' | 'waiting' | 'done';

const PRAISE = ['Exactly right!', 'Yes, well done!', 'Spot on!', 'That’s it!', 'Great — correct!'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export default function Tutor() {
  const { id } = useParams();
  return id === 'new' ? <TutorStart /> : <TutorPlayer key={id} id={Number(id)} />;
}

/** /tutor/new?mode=…: make (or reopen) the lesson, then play it. */
function TutorStart() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { prefs } = useTutorPrefs();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const mode = params.get('mode') || 'topic';
  const what = mode === 'topic' ? params.get('topic') || '' : mode === 'exam' ? 'your exam' : 'your lesson';
  const persona = tutorById(prefs?.tutor);

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
      <div className="tutor-warm">
        <TutorFace speaking={!error} size={84} tutor={persona.id} />
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
            <h2 className="hand-title">{persona.name} is getting the board ready…</h2>
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
  );
}

function TutorPlayer({ id }: { id: number }) {
  useStudyTimer('tutor', null);
  const toast = useToast();
  const nav = useNavigate();
  const ai = useAiStatus();
  const { prefs: savedPrefs, natural, save: savePrefs } = useTutorPrefs();
  const prefs: TutorPrefs = savedPrefs || DEFAULT_PREFS;
  const persona = tutorById(prefs.tutor);

  const [data, setData] = useState<LessonReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<PlayStep[]>([]);
  const stepsRef = useRef<PlayStep[]>([]);
  const [cur, setCur] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState('');
  const [quizzes, setQuizzes] = useState<Record<string, QuizEl>>({});
  const quizRef = useRef<Record<string, QuizEl>>({});
  const [inPractice, setInPractice] = useState(false);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const answerFn = useRef<((i: number) => void) | null>(null);
  const [follow, setFollow] = useState(true);
  const [overview, setOverview] = useState(false);
  const [picker, setPicker] = useState(false);
  const [typing, setTyping] = useState(false);
  // the student's own writing on the board
  const [ink, setInk] = useState<InkStroke[]>([]);
  const [tool, setTool] = useState<InkTool | null>(null);
  const [penColour, setPenColour] = useState(INK_COLOURS[1]);
  const inkSaved = useRef<string>('[]');
  const checkedUpTo = useRef(0);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [listening, setListening] = useState<'speech' | 'record' | null>(null);
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<{ score: number; total: number; points: number } | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const [reaction, setReaction] = useState<Reaction>(null);
  const [camMin, setCamMin] = useState(() => window.innerWidth < 380);
  const narrator = useRef<Narrator | null>(null);
  const track = useRef<{ step: number; t: Track; offsets: number[] } | null>(null);
  const runToken = useRef(0);
  /** each narration has an id; bumping it cuts the current one short */
  const narrId = useRef(0);
  const awaitingRef = useRef<string | null>(null);
  const pausedRef = useRef(false);
  const resumeFn = useRef<(() => void) | null>(null);
  const listenRef = useRef<Listening | null>(null);
  const recRef = useRef<{ stop: () => Promise<string> } | null>(null);

  useEffect(() => {
    api<LessonReply>(`/tutor/lessons/${id}`)
      .then((r) => {
        setData(r);
        setInk(r.ink || []);
        inkSaved.current = JSON.stringify(r.ink || []);
        checkedUpTo.current = (r.ink || []).length;
        const s = r.lesson.steps.map((x, i) => ({ ...x, lessonIndex: i }));
        stepsRef.current = s;
        setSteps(s);
        setCaption(r.lesson.steps[0]?.say || '');
      })
      .catch((e) => setError(e.message));
    return () => {
      runToken.current++;
    };
  }, [id]);

  // the voice: the chosen tutor's natural voice, the phone's voice, or captions only
  useEffect(() => {
    if (!data) return;
    const mode = prefs.sound === 'natural' && !data.voice ? 'device' : prefs.sound;
    const n = new Narrator(mode, (reason) => toast(`${reason} Using your phone’s voice instead.`), { name: persona.voice, accent: prefs.accent });
    n.rate = prefs.rate;
    narrator.current = n;
    return () => {
      track.current?.t.stop();
      track.current = null;
      n.dispose();
      narrator.current = null;
    };
  }, [data, prefs.sound, prefs.accent, prefs.tutor, prefs.rate]);

  const setQuiz = (q: QuizEl) => {
    quizRef.current = { ...quizRef.current, [q.qid]: q };
    setQuizzes(quizRef.current);
  };

  /** Say something, writing `items` board items of step `stepIndex` in time with it. Resolves when done. */
  const narrate = useCallback(async (text: string, token: number, stepIndex = -1, items = 0) => {
    const n = narrator.current;
    if (!n || token !== runToken.current) return false;
    const me = ++narrId.current;
    setCaption(text);
    const t = await n.track(text);
    if (token !== runToken.current) {
      t.stop();
      return false;
    }
    const weights = Array.from({ length: items }, (_, i) => {
      const b = stepsRef.current[stepIndex]?.board[i];
      if (!b) return 1;
      return b.t === 'circle' || b.t === 'underline' || b.t === 'arrow' || b.t === 'clear' ? 0.4 : b.t === 'sketch' || b.t === 'pie' || b.t === 'bars' ? 3 : 1 + Math.min(3, JSON.stringify(b).length / 80);
    });
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const span = t.duration * 0.82;
    let acc = 0.15;
    const offsets = weights.map((w) => {
      const o = acc;
      acc += (w / total) * span;
      return o;
    });
    track.current = { step: stepIndex, t, offsets };
    const next = stepsRef.current[stepIndex + 1];
    if (next) n.prefetch(next.say);
    return new Promise<boolean>((resolve) => {
      let raf = 0;
      const tick = () => {
        if (token !== runToken.current || me !== narrId.current) {
          cancelAnimationFrame(raf);
          t.stop();
          setSpeaking(false);
          resolve(false);
          return;
        }
        if (stepIndex >= 0 && items) {
          const count = offsets.filter((o) => o <= t.time()).length;
          setRevealed((r) => (count > r ? count : r));
        }
        raf = requestAnimationFrame(tick);
      };
      t.onEnd(() => {
        cancelAnimationFrame(raf);
        setSpeaking(false);
        if (stepIndex >= 0) setRevealed(items);
        window.setTimeout(() => resolve(token === runToken.current), 450);
      });
      if (pausedRef.current) {
        resumeFn.current = () => {
          t.play();
          setSpeaking(true);
        };
      } else {
        t.play();
        setSpeaking(true);
      }
      tick();
    });
  }, []);

  /** Write a question on the board, read it out, wait for the answer, then react to it. */
  const askCheck = useCallback(
    async (qid: string, check: Check, label: string, token: number) => {
      const existing = quizRef.current[qid];
      if (existing && existing.chosen !== null) return true;
      setQuiz({ t: 'quiz', qid, label, q: check.q, options: check.options, answer: check.answer, chosen: null, explain: check.explain });
      // the student can answer as soon as the question is on the board, even while it is read out
      awaitingRef.current = qid;
      setAwaiting(qid);
      const answered = new Promise<number>((resolve) => {
        answerFn.current = resolve;
      });
      const first = await Promise.race([answered.then(() => 'answered' as const), narrate(`${label}. ${check.q}`, token).then((ok) => (ok ? ('read' as const) : ('stopped' as const)))]);
      if (first === 'stopped' && token !== runToken.current) return false;
      if (first === 'answered') narrId.current++; // stop reading the question
      else {
        setCaption(`${check.q} — tap your answer${recognitionSupported ? ', or say it' : ''}.`);
        setPhase('waiting');
      }
      const chosen = await answered;
      answerFn.current = null;
      awaitingRef.current = null;
      setAwaiting(null);
      if (token !== runToken.current) return false;
      setQuiz({ ...quizRef.current[qid], chosen });
      setPhase('playing');
      const ok = chosen === check.answer;
      setReaction({ kind: ok ? 'happy' : 'think', n: Date.now() });
      const feedback = ok ? `${pick(PRAISE)} ${check.explain}` : `Not quite. The answer is ${String.fromCharCode(65 + check.answer)}, ${check.options[check.answer]}. ${check.explain}`;
      return narrate(feedback, token);
    },
    [narrate],
  );

  /** Play the lesson from a step to the end: steps, checks, then practice on the board. */
  const runFrom = useCallback(
    async (from: number) => {
      const token = ++runToken.current;
      track.current?.t.stop();
      track.current = null;
      pausedRef.current = false;
      setShowEnd(false);
      setOverview(false);
      setFollow(true);
      setPhase('playing');
      for (let i = Math.max(0, from); i < stepsRef.current.length; i++) {
        if (token !== runToken.current) return;
        const s = stepsRef.current[i];
        setCur(i);
        setRevealed(0);
        setInPractice(false);
        if (!(await narrate(s.say, token, i, s.board.length))) return;
        if (s.check && !(await askCheck(`c${i}`, s.check, 'Quick check', token))) return;
        if (!s.asked && data) void api(`/tutor/lessons/${id}`, { method: 'PATCH', body: { step: s.lessonIndex } }).catch(() => {});
      }
      // practice on the board
      const practice = data?.lesson.practice || [];
      if (practice.length) {
        setInPractice(true);
        if (!(await narrate(`Now let's see what you remember. ${practice.length} questions.`, token))) return;
        for (let p = 0; p < practice.length; p++) if (!(await askCheck(`p${p}`, practice[p], `Question ${p + 1} of ${practice.length}`, token))) return;
        const answers = practice.map((_, p) => quizRef.current[`p${p}`]?.chosen ?? -1);
        try {
          const r = await api<{ score: number; total: number; points: number }>(`/tutor/lessons/${id}/practice`, { body: { answers } });
          setResult(r);
          if (token === runToken.current) await narrate(r.score === r.total ? `All ${r.total} right. Brilliant work!` : `You got ${r.score} out of ${r.total}. Save these as flashcards and they'll come back before you forget.`, token);
        } catch {
          /* points are a bonus; the lesson still ends */
        }
      }
      if (token !== runToken.current) return;
      setPhase('done');
      setOverview(true);
      setShowEnd(true);
      setCaption('Lesson complete. Look over the whole board, or save it as flashcards.');
    },
    [narrate, askCheck, data, id],
  );

  function pause() {
    if (phase !== 'playing') return;
    pausedRef.current = true;
    track.current?.t.pause();
    setSpeaking(false);
    setPhase('paused');
  }
  function play() {
    unlockMeter(); // a tap: the voice can now be measured for lip sync
    if (phase === 'ready' || phase === 'done') {
      void runFrom(phase === 'done' ? 0 : Math.min(data?.step || 0, stepsRef.current.length - 1));
      return;
    }
    if (phase === 'paused') {
      pausedRef.current = false;
      setPhase('playing');
      setFollow(true);
      if (resumeFn.current) {
        resumeFn.current();
        resumeFn.current = null;
      } else if (track.current && !track.current.t.ended) {
        track.current.t.play();
        setSpeaking(true);
      } else void runFrom(cur);
    }
  }
  function go(to: number) {
    answerFn.current = null;
    awaitingRef.current = null;
    setAwaiting(null);
    // past the last step: straight on to the practice
    void runFrom(Math.max(0, Math.min(stepsRef.current.length, to)));
  }

  function answer(qid: string, i: number) {
    if (awaitingRef.current === qid && answerFn.current) answerFn.current(i);
  }

  // save the student's writing a moment after they stop (it comes back when the lesson is reopened)
  useEffect(() => {
    const json = JSON.stringify(ink);
    if (json === inkSaved.current) return;
    const t = window.setTimeout(() => {
      api(`/tutor/lessons/${id}`, { method: 'PATCH', body: { ink } })
        .then(() => (inkSaved.current = json))
        .catch((e) => toast(e.message));
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink, id]);

  /** A picture of what the student wrote (the newest writing, or all of it), for the tutor to read. */
  function inkPicture(): string | null {
    const fresh = ink.slice(checkedUpTo.current);
    const strokes = fresh.length ? fresh : ink;
    if (!strokes.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of strokes)
      for (let i = 0; i < st.pts.length; i += 2) {
        x0 = Math.min(x0, st.pts[i] - st.w);
        y0 = Math.min(y0, st.pts[i + 1] - st.w);
        x1 = Math.max(x1, st.pts[i] + st.w);
        y1 = Math.max(y1, st.pts[i + 1] + st.w);
      }
    const pad = 24;
    const k = Math.min(2, 1100 / Math.max(x1 - x0 + pad * 2, y1 - y0 + pad * 2, 1));
    const c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0 + pad * 2) * k);
    c.height = Math.ceil((y1 - y0 + pad * 2) * k);
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const st of strokes) {
      g.globalAlpha = st.tool === 'marker' ? 0.38 : 1;
      g.strokeStyle = st.color;
      g.lineWidth = st.w * k;
      g.beginPath();
      for (let i = 0; i < st.pts.length; i += 2) {
        const px = (st.pts[i] - x0 + pad) * k;
        const py = (st.pts[i + 1] - y0 + pad) * k;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      if (st.pts.length === 2) g.lineTo((st.pts[0] - x0 + pad) * k + 0.1, (st.pts[1] - y0 + pad) * k);
      g.stroke();
    }
    return c.toDataURL('image/jpeg', 0.85);
  }

  /** "Check my writing": the tutor reads what the student wrote and answers on the board. */
  function checkWriting() {
    const pic = inkPicture();
    if (!pic) return toast('Write your working or answer on the board first.');
    pause();
    setReaction({ kind: 'think', n: Date.now() });
    checkedUpTo.current = ink.length;
    void ask(question.trim(), undefined, pic);
  }

  /** "I have a question": the answer is taught on a fresh part of the board, then the lesson goes on. */
  async function ask(text: string, audio?: string, image?: string) {
    const step = stepsRef.current[cur];
    if (!step || (!text.trim() && !audio && !image)) return;
    setAsking(true);
    setCaption(text ? `You asked: ${text}` : image ? `${persona.name} is reading what you wrote…` : 'Listening to your question…');
    try {
      const r = await api<{ steps: TutorStep[]; heard?: string; usage: any }>(`/tutor/lessons/${id}/ask`, { body: { step: step.lessonIndex, question: text.trim() || undefined, audio, image } });
      updateAiUsage(r.usage);
      const q = text.trim() || r.heard || (image ? 'check what I wrote' : 'your question');
      const heading: BoardItem = { t: 'heading', text: `You asked: ${q.length > 60 ? `${q.slice(0, 57)}…` : q}` };
      const extra: PlayStep[] = r.steps.map((s, k) => ({ ...s, board: k === 0 ? [heading, ...s.board.filter((b) => b.t !== 'clear')] : s.board, lessonIndex: step.lessonIndex, asked: true }));
      setReaction({ kind: 'nod', n: Date.now() });
      // finish writing this step, then teach the answer straight after it
      setRevealed(step.board.length);
      const all = [...stepsRef.current.slice(0, cur + 1), ...extra, ...stepsRef.current.slice(cur + 1)];
      stepsRef.current = all;
      setSteps(all);
      setTyping(false);
      setQuestion('');
      void runFrom(cur + 1);
    } catch (err: any) {
      toast(err.message);
    } finally {
      setAsking(false);
      setHeard('');
    }
  }

  /** The mic: answer a check by voice, or ask anything. */
  async function mic() {
    if (listening === 'speech') {
      listenRef.current?.stop();
      return;
    }
    if (listening === 'record') {
      const rec = recRef.current;
      recRef.current = null;
      setListening(null);
      if (rec) void ask('', await rec.stop());
      return;
    }
    const checking = awaitingRef.current;
    if (!checking) pause();
    if (recognitionSupported) {
      setListening('speech');
      setHeard('');
      listenRef.current = listenOnce({
        onInterim: (t) => setHeard(t),
        onFinal: (t) => {
          if (checking) {
            const q = quizRef.current[checking];
            const i = q ? matchOption(t, q.options) : -1;
            if (i >= 0) answer(checking, i);
            else toast(`I heard “${t}”. Tap the answer you mean.`);
          } else void ask(t);
        },
        onEnd: () => setListening(null),
        onError: (m) => toast(m),
      });
      return;
    }
    if (checking) return toast('Tap your answer on the board.');
    if (!recordingSupported) {
      setTyping(true);
      return;
    }
    try {
      recRef.current = await recordWav();
      setListening('record');
      setHeard('Recording… tap the mic again when you’ve finished.');
    } catch {
      toast('Allow the microphone to talk to your tutor, or type your question.');
    }
  }

  function toggleSound() {
    const next: TutorPrefs = { ...prefs, sound: prefs.sound === 'silent' ? (natural ? 'natural' : 'device') : 'silent' };
    runToken.current++;
    void savePrefs(next).then(() => {
      if (phase === 'playing' || phase === 'waiting') window.setTimeout(() => void runFrom(cur), 50);
    });
  }

  // keyboard: space play/pause, arrows step, Q type a question
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || typing || picker) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (phase === 'playing') pause();
        else play();
      } else if (e.key === 'ArrowRight') {
        if (!inPractice && phase !== 'done') go(cur + 1);
      }
      else if (e.key === 'ArrowLeft') go(cur - 1);
      else if (e.key.toLowerCase() === 'q') {
        pause();
        setTyping(true);
      } else if (e.key.toLowerCase() === 'p') setTool((t) => (t ? null : { tool: 'pen', color: penColour, w: 3 }));
      else if (e.key === 'Escape' && tool) setTool(null);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && tool) {
        e.preventDefault();
        setInk((k) => k.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  // everything written so far, with the quick checks after their steps and the practice at the end
  const shown: ShownItem[] = useMemo(() => {
    const out: ShownItem[] = [];
    steps.forEach((s, si) => {
      if (si > cur && !(phase === 'done' || inPractice)) return;
      const upto = si < cur || phase === 'done' || inPractice ? s.board.length : revealed;
      s.board.slice(0, upto).forEach((item, ii) => {
        let draw = 0;
        if (si === cur && track.current?.step === cur && !inPractice) {
          const o = track.current.offsets;
          draw = Math.max(0.45, Math.min(1.8, (o[ii + 1] ?? track.current.t.duration) - o[ii]));
          if (item.t === 'sketch' || item.t === 'pie' || item.t === 'bars') draw = Math.max(1.6, Math.min(4, draw * 1.5));
        }
        out.push({ key: `${si}-${ii}`, item, draw });
      });
      const q = quizzes[`c${si}`];
      if (q) out.push({ key: `q-c${si}`, item: q, draw: 0 });
    });
    const practice = data?.lesson.practice || [];
    if (practice.some((_, p) => quizzes[`p${p}`])) {
      out.push({ key: 'practice-h', item: { t: 'heading', text: 'Check yourself' }, draw: 0 });
      practice.forEach((_, p) => {
        const q = quizzes[`p${p}`];
        if (q) out.push({ key: `q-p${p}`, item: q, draw: 0 });
      });
    }
    return out;
  }, [steps, cur, revealed, quizzes, phase, inPractice, data]);
  // the camera follows the newest thing written (circles and arrows sit on earlier items)
  const focus = [...shown].reverse().find((x) => !['circle', 'underline', 'arrow', 'clear'].includes(x.item.t))?.key ?? null;

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
  if (!data || !steps.length) return <div className="tutor-start muted">Opening the lesson…</div>;

  const step = steps[cur];
  const lessonSteps = data.lesson.steps.length;
  const back = data.packId ? `/pack/${data.packId}` : '/home';
  const mins = Math.max(2, Math.round(data.lesson.steps.reduce((n, s) => n + s.say.split(/\s+/).length, 0) / 150 + lessonSteps * 0.2));
  const checks = data.lesson.steps.filter((s) => s.check).length;

  return (
    <div className="tutor-full">
      <header className="tf-top">
        <Link to={back} className="btn icon ghost" aria-label="Leave the lesson">
          <X size={20} />
        </Link>
        <div className="tf-title">
          <h1>{data.lesson.title}</h1>
          <div className="tf-progress" aria-label={`Step ${step.lessonIndex + 1} of ${lessonSteps}`}>
            {data.lesson.steps.map((_, i) => (
              <span key={i} className={i < step.lessonIndex || phase === 'done' ? 'past' : i === step.lessonIndex ? 'now' : ''} />
            ))}
          </div>
        </div>
        <button className="btn icon ghost" onClick={() => setOverview((o) => !o)} aria-pressed={overview} title="See the whole board" aria-label="See the whole board">
          <Maximize2 size={18} />
        </button>
        <button className="btn icon ghost" onClick={() => setPicker(true)} title="Choose your tutor and voice" aria-label="Choose your tutor and voice">
          <Settings2 size={19} />
        </button>
      </header>

      <div className="tf-stage">
        <Board
          items={shown}
          focus={focus}
          follow={follow && !overview}
          overview={overview}
          onUserMove={() => {
            setFollow(false);
            setOverview(false);
          }}
          onAnswer={answer}
          ink={ink}
          tool={tool}
          onInk={setInk}
        />
        {tool && (
          <div className="tf-inkbar" role="toolbar" aria-label="Write on the board">
            <button className="ib" aria-pressed={tool.tool === 'pen'} onClick={() => setTool({ tool: 'pen', color: penColour, w: 3 })} aria-label="Pen" title="Pen (P)">
              <PenLine size={17} />
            </button>
            <button className="ib" aria-pressed={tool.tool === 'marker'} onClick={() => setTool({ tool: 'marker', color: tool.tool === 'marker' ? tool.color : INK_COLOURS[4], w: 18 })} aria-label="Highlighter" title="Highlighter">
              <Highlighter size={17} />
            </button>
            <button className="ib" aria-pressed={tool.tool === 'eraser'} onClick={() => setTool({ ...tool, tool: 'eraser' })} aria-label="Eraser" title="Eraser">
              <Eraser size={17} />
            </button>
            <span className="sep" />
            {INK_COLOURS.map((c) => (
              <button
                key={c}
                className="dot"
                style={{ background: c }}
                aria-pressed={tool.tool !== 'eraser' && tool.color === c}
                aria-label={`Colour ${c}`}
                onClick={() => {
                  if (tool.tool !== 'marker') setPenColour(c);
                  setTool({ tool: tool.tool === 'eraser' ? 'pen' : tool.tool, color: c, w: tool.tool === 'marker' ? 18 : 3 });
                }}
              />
            ))}
            <span className="sep" />
            <button className="ib" onClick={() => setInk((k) => k.slice(0, -1))} disabled={!ink.length} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Undo2 size={17} />
            </button>
            <button
              className="ib"
              onClick={() => {
                if (ink.length && window.confirm('Clear everything you wrote on this board?')) {
                  setInk([]);
                  checkedUpTo.current = 0;
                }
              }}
              disabled={!ink.length}
              aria-label="Clear my writing"
              title="Clear my writing"
            >
              <Trash2 size={16} />
            </button>
            {ai?.enabled && (
              <button className="btn small primary" onClick={checkWriting} disabled={asking || !ink.length} title={`${persona.name} reads what you wrote and helps`}>
                <ScanEye size={15} /> Check my writing
              </button>
            )}
            <button className="ib" onClick={() => setTool(null)} aria-label="Stop writing" title="Done (Esc)">
              <X size={17} />
            </button>
          </div>
        )}
        {phase === 'ready' && (
          <button className="tutor-startbtn" onClick={play}>
            <TutorFace tutor={persona.id} size={92} />
            <span className="tutor-startcircle">
              <Play size={30} />
            </span>
            <span>{data.step > 0 ? `Continue with ${persona.name}` : `Start the lesson with ${persona.name}`}</span>
            <span className="small muted">
              {lessonSteps} steps{checks ? ` · ${checks} quick checks` : ''} · about {mins} min · talk to {persona.name} any time with the mic
            </span>
          </button>
        )}
        {prefs.avatar && (
          <div className={`tf-cam ${camMin ? 'min' : ''} ${speaking ? 'speaking' : ''} ${listening ? 'listening' : ''}`}>
            <TutorAvatar tutor={persona.id} speaking={speaking} listening={!!listening || !!awaiting} reaction={reaction} framing={camMin ? 'face' : 'bust'} />
            <span className="tf-cam-name">
              <i /> {persona.name}
            </span>
            <button className="tf-cam-min" onClick={() => setCamMin((m) => !m)} aria-label={camMin ? `Show ${persona.name} bigger` : `Make ${persona.name} smaller`} title={camMin ? 'Show bigger' : 'Make smaller'}>
              {camMin ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
          </div>
        )}
        {!follow && !overview && phase !== 'ready' && (
          <button className="tf-follow" onClick={() => setFollow(true)}>
            <LocateFixed size={15} /> Follow {persona.name}
          </button>
        )}
        {showEnd && <LessonEnd id={id} data={data} result={result} onReplay={() => go(0)} onNext={() => data.next && data.packId && nav(`/tutor/new?mode=lesson&pack=${data.packId}&chunk=${data.next.chunk}`)} onClose={() => setShowEnd(false)} />}
      </div>

      {typing && (
        <form
          className="tf-type"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <div className="row" style={{ gap: 6 }}>
            <input className="input" style={{ flex: 1 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={`Ask ${persona.name} anything…`} autoFocus disabled={asking} aria-label="Your question" />
            <button className="btn primary" disabled={asking || !question.trim()} aria-label="Ask">
              <Send size={16} /> {asking ? '…' : ''}
            </button>
            <button type="button" className="btn icon ghost" onClick={() => setTyping(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {['Explain that again, more simply', 'Give me another example', 'Why does that work?', 'How would this come in an exam?'].map((c) => (
              <button key={c} type="button" className="chip" onClick={() => void ask(c)} disabled={asking}>
                {c}
              </button>
            ))}
          </div>
          {ai && <span className="small muted">{left(ai, 'tutor')} questions left today</span>}
        </form>
      )}

      <footer className="tf-bar">
        <TutorFace tutor={persona.id} size={48} speaking={speaking} listening={!!listening} />
        <div className="tf-ctrls">
          {phase === 'playing' ? (
            <button className="tf-btn" onClick={pause} aria-label="Pause">
              <Pause size={20} />
            </button>
          ) : (
            <button className="tf-btn" onClick={play} aria-label="Play" disabled={phase === 'waiting'}>
              <Play size={20} />
            </button>
          )}
          <button className="tf-btn" onClick={toggleSound} aria-label={prefs.sound === 'silent' ? 'Turn the voice on' : 'Mute the voice'}>
            {prefs.sound === 'silent' ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <button className="tf-btn hide-sm" onClick={() => go(cur - 1)} aria-label="Previous step" disabled={cur === 0 || phase === 'ready'}>
            <ChevronLeft size={20} />
          </button>
          <button className="tf-btn hide-sm" onClick={() => go(cur + 1)} aria-label="Next step" disabled={phase === 'ready' || phase === 'done' || inPractice}>
            <ChevronRight size={20} />
          </button>
        </div>
        <p className="tf-caption" aria-live="polite">
          {listening || asking ? <span className="tf-heard">{heard || (asking ? 'Thinking about your question…' : 'Listening…')}</span> : prefs.captions || prefs.sound === 'silent' ? caption : ''}
        </p>
        <div className="tf-talk">
          <button className={`tf-btn ${tool ? 'on' : ''}`} onClick={() => setTool((t) => (t ? null : { tool: 'pen', color: penColour, w: 3 }))} aria-label={tool ? 'Stop writing on the board' : 'Write on the board'} aria-pressed={!!tool} title="Write on the board (P)">
            <PenLine size={19} />
          </button>
          <button
            className="tf-btn"
            onClick={() => {
              pause();
              setTyping((t) => !t);
            }}
            aria-label="Type a question"
            disabled={!ai?.enabled}
          >
            <Keyboard size={19} />
          </button>
          <button className={`tf-mic ${listening ? 'on' : ''} ${awaiting ? 'waiting' : ''}`} onClick={() => void mic()} aria-label={listening ? 'Stop listening' : awaiting ? 'Say your answer' : `Talk to ${persona.name}`} disabled={!ai?.enabled && !awaiting} title={awaiting ? 'Say your answer' : 'Ask a question out loud'}>
            {listening ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        </div>
      </footer>

      {picker && (
        <TutorPicker
          prefs={prefs}
          natural={natural && data.voice}
          onClose={() => setPicker(false)}
          onSave={async (p) => {
            runToken.current++;
            await savePrefs(p);
            toast(`${tutorById(p.tutor).name} will teach you from now on.`);
            if (phase === 'playing' || phase === 'waiting') window.setTimeout(() => void runFrom(cur), 80);
            else if (phase !== 'ready' && phase !== 'done') setPhase('paused');
          }}
        />
      )}
    </div>
  );
}

function LessonEnd({ id, data, result, onReplay, onNext, onClose }: { id: number; data: LessonReply; result: { score: number; total: number; points: number } | null; onReplay: () => void; onNext: () => void; onClose: () => void }) {
  const toast = useToast();
  const { lesson } = data;
  const [saved, setSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTry, setShowTry] = useState(false);

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
    <div className="tf-end">
      <button className="btn icon ghost tf-end-close" onClick={onClose} aria-label="Hide and look at the board">
        <X size={18} />
      </button>
      <h2>
        <Sparkles size={20} /> Lesson complete
      </h2>
      {result && (
        <p className="tf-score">
          <strong>
            {result.score} / {result.total}
          </strong>{' '}
          in the practice{result.points > 0 ? ` · +${result.points} Memory points` : ''}
        </p>
      )}
      {lesson.summary.length > 0 && (
        <ul className="tutor-summary">
          {lesson.summary.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      {lesson.tryNext && (
        <div className="tf-try">
          <strong>Now you try:</strong> {lesson.tryNext.q}
          {showTry ? (
            <div className="key-answer" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
              {lesson.tryNext.answer}
            </div>
          ) : (
            <button className="btn small" style={{ marginTop: 6 }} onClick={() => setShowTry(true)}>
              Show the worked answer
            </button>
          )}
        </div>
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
            Next: {data.next.title} <ChevronRight size={16} />
          </button>
        )}
        <button className="btn ghost" onClick={onReplay}>
          <RotateCcw size={16} /> Watch again
        </button>
        <Link to="/home" className="btn ghost">
          Learn something else
        </Link>
      </div>
    </div>
  );
}
