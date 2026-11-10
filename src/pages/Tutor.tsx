// The whiteboard tutor: a full-screen lesson taught on a wide board by an animated tutor who walks
// to what it is writing, points, gestures, and sits down to listen when the student talks. The
// student can just speak (hands-free) or use the mic / keyboard at any moment, answers questions
// on the board — tapped, spoken or in their own words — and ends with practice and flashcards.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Eraser, Highlighter, Keyboard, Layers, LocateFixed, Maximize2, Mic, MicOff, Minimize2, PenLine, ScanEye, Trash2, Undo2, Pause, Play, RotateCcw, Send, Settings2, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/ui';
import Board, { type InkTool, type QuizEl, type ShownItem, type WriteSpot } from '../components/Board';
import { INK_COLOURS, type InkStroke } from '../../shared/ink';
import { TutorPicker } from '../components/TutorPicker';
import { TutorCharacter, type Act, type CharacterControl } from '../components/TutorCharacter';
import { useAiStatus, updateAiUsage, left } from '../lib/ai';
import { Narrator, type Track } from '../lib/tutor/narrator';
import type { Mouth } from '../lib/tutor/visemes';
import { listenOnce, matchOption, recognitionSupported, recordWav, recordingSupported, type Listening } from '../lib/tutor/listen';
import { handsFreeSupported, startHandsFree, type HandsFree } from '../lib/tutor/handsfree';
import { useTutorPrefs } from '../lib/tutor/prefs';
import { useStudyTimer } from '../lib/usePack';
import type { BoardItem, Check, Gesture, TutorLesson, TutorStep } from '../../shared/tutor';
import { ACCENTS, accentById, DEFAULT_PREFS, tutorById, type TutorPrefs } from '../../shared/tutors';

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

type PlayStep = TutorStep & { lessonIndex: number; asked?: boolean };
type Phase = 'ready' | 'playing' | 'paused' | 'waiting' | 'done';

const PRAISE = ['Exactly right!', 'Yes — well done!', 'Spot on!', 'That’s it!', 'Brilliant, correct!', 'Nailed it!'];
const NOT_QUITE = ['Ooh, not quite.', 'Close, but not this time.', 'Hmm, not quite — no worries.', 'Good try, but no.'];
const THINKING = ['Ooh, good question. Let me show you.', 'Hmm, let me think about the best way to explain that.', 'Great question — give me a second.', 'Ah, I see what you mean. Let me draw it.'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const GESTURE_ACT: Record<Gesture, Act> = { explain: 'explain', point: 'point', emphasis: 'emphasis', think: 'think', happy: 'happy', wave: 'wave', count: 'count' };

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
  const control = useRef<CharacterControl>({ x: 0, sit: false, act: 'think', side: 'right', speaking: false, pulse: 0 });

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
  control.current.act = error ? 'sad' : 'think';

  return (
    <div className="tutor-start">
      <div className="tutor-warm">
        <div className="tutor-warm-char">
          <TutorCharacter tutor={persona.id} control={control} height={190} />
        </div>
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
            <h2 className="hand-title">{persona.name} is planning your lesson…</h2>
            <p className="muted">
              <strong>{what}</strong> — about 20 seconds the first time.
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
  const { user } = useAuth();
  const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';
  const { prefs: savedPrefs, natural, save: savePrefs } = useTutorPrefs();
  const prefs: TutorPrefs = savedPrefs || DEFAULT_PREFS;
  const persona = tutorById(prefs.tutor);

  const [data, setData] = useState<LessonReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<PlayStep[]>([]);
  const stepsRef = useRef<PlayStep[]>([]);
  const [cur, setCur] = useState(0);
  const curRef = useRef(0);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhaseState] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState('');
  const [quizzes, setQuizzes] = useState<Record<string, QuizEl>>({});
  const quizRef = useRef<Record<string, QuizEl>>({});
  const [inPractice, setInPractice] = useState(false);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const answerFn = useRef<((i: number) => void) | null>(null);
  const openFn = useRef<((text: string) => void) | null>(null);
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
  const askingRef = useRef(false);
  const [listening, setListening] = useState<'speech' | 'record' | null>(null);
  /** the student is talking (hands-free heard them) */
  const [hearing, setHearing] = useState(false);
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<{ score: number; total: number; points: number } | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const [section, setSection] = useState<{ part: number; title: string; n: number } | null>(null);
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
  const hf = useRef<HandsFree | null>(null);
  /** the lesson was paused because the student started talking */
  const barged = useRef(false);
  const greeted = useRef(false);

  // ── the tutor on the board
  const control = useRef<CharacterControl>({ x: 0, sit: false, act: 'idle', side: 'left', speaking: false, pulse: 0 });
  const mouth = useRef<(() => Mouth) | null>(null);
  const startControl = useRef<CharacterControl>({ x: 0, sit: false, act: 'wave', side: 'right', speaking: false, pulse: 0 });
  const actRef = useRef<Act>('idle');
  const spot = useRef<{ spot: WriteSpot | null; view: { w: number; h: number } } | null>(null);
  const [charH, setCharH] = useState(200);
  mouth.current = () => track.current?.t.mouth() ?? ({ open: 0, wide: 0.15, round: 0, teeth: 0, tongue: 0, press: 0.2, bite: 0 } as Mouth);

  const act = useCallback((a: Act, pulse = false) => {
    actRef.current = a;
    control.current.act = a;
    if (pulse) control.current.pulse++;
  }, []);

  /** Where the tutor stands: beside what it is writing, or in the corner while it listens. */
  const place = useCallback(() => {
    const s = spot.current;
    if (!s) return;
    const { view } = s;
    const h = Math.max(120, Math.min(270, view.h * 0.42, view.w < 640 ? 150 : 270));
    if (Math.abs(h - charH) > 4) setCharH(h);
    const box = h * (240 / 292);
    const body = h * 0.34;
    let center: number;
    let side: 'left' | 'right' = 'left';
    if (control.current.sit || !s.spot) center = view.w - body * 1.1;
    else {
      const r = s.spot;
      const right = r.x + r.w + body * 0.75;
      const leftOf = r.x - body * 0.75;
      if (right + body * 0.6 < view.w) center = right;
      else if (leftOf - body * 0.6 > 0) {
        center = leftOf;
        side = 'right';
      } else center = view.w - body * 0.8;
    }
    control.current.x = Math.max(-box * 0.2, Math.min(view.w - box * 0.8, center - box / 2));
    control.current.side = side;
  }, [charH]);

  const onWriteSpot = useCallback(
    (s: WriteSpot | null, view: { w: number; h: number }) => {
      spot.current = { spot: s, view };
      place();
    },
    [place],
  );

  useEffect(() => {
    control.current.speaking = speaking;
  }, [speaking]);
  useEffect(() => {
    const sit = hearing || listening !== null;
    control.current.sit = sit;
    if (sit) act('listen');
    place();
  }, [hearing, listening, act, place]);

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
        setCaption('');
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
    const n = new Narrator(mode, (reason) => toast(`${reason} Using your phone’s voice instead.`), { name: persona.voice, accent: prefs.accent, gender: persona.gender });
    n.rate = prefs.rate;
    narrator.current = n;
    return () => {
      track.current?.t.stop();
      track.current = null;
      n.dispose();
      narrator.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, prefs.sound, prefs.accent, prefs.tutor, prefs.rate]);

  const setQuiz = (q: QuizEl) => {
    quizRef.current = { ...quizRef.current, [q.qid]: q };
    setQuizzes(quizRef.current);
  };

  /** Say something, writing `items` board items of step `stepIndex` in time with it. Resolves when done. */
  const narrate = useCallback(async (text: string, token: number, stepIndex = -1, items = 0, gesture?: Act) => {
    const n = narrator.current;
    if (!n || token !== runToken.current) return false;
    const me = ++narrId.current;
    setCaption(text);
    const t = await n.track(text);
    if (token !== runToken.current || me !== narrId.current) {
      t.stop();
      return false;
    }
    const weights = Array.from({ length: items }, (_, i) => {
      const b = stepsRef.current[stepIndex]?.board[i];
      if (!b) return 1;
      return b.t === 'circle' || b.t === 'underline' || b.t === 'arrow' || b.t === 'clear' ? 0.4 : b.t === 'sketch' || b.t === 'pie' || b.t === 'bars' || b.t === 'example' ? 3 : 1 + Math.min(3, JSON.stringify(b).length / 80);
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
    // writing first, then turning to the student to explain (unless the step has its own move)
    const big = gesture && gesture !== 'explain' && gesture !== 'point';
    return new Promise<boolean>((resolve) => {
      let raf = 0;
      const tick = () => {
        if (token !== runToken.current || me !== narrId.current) {
          cancelAnimationFrame(raf);
          t.stop();
          setSpeaking(false);
          hf.current?.setTutorText('');
          resolve(false);
          return;
        }
        if (stepIndex >= 0 && items) {
          const count = offsets.filter((o) => o <= t.time()).length;
          setRevealed((r) => (count > r ? count : r));
          if (!control.current.sit && !big) act(count < items || t.time() < offsets[items - 1] + 0.8 ? 'write' : gesture || 'explain');
        }
        raf = requestAnimationFrame(tick);
      };
      t.onEnd(() => {
        cancelAnimationFrame(raf);
        setSpeaking(false);
        hf.current?.setTutorText('');
        if (stepIndex >= 0) setRevealed(items);
        window.setTimeout(() => resolve(token === runToken.current), 380);
      });
      if (!control.current.sit) act(gesture || (items ? 'write' : 'explain'), gesture === 'happy' || gesture === 'emphasis');
      const go = () => {
        t.play();
        setSpeaking(true);
        hf.current?.setTutorText(text);
      };
      if (pausedRef.current) resumeFn.current = go;
      else go();
      tick();
    });
  }, [act]);

  /** Write a question on the board, read it out, wait for the answer, then react to it like a teacher. */
  const askCheck = useCallback(
    async (qid: string, check: Check, label: string, token: number, lessonIndex: number) => {
      const existing = quizRef.current[qid];
      if (existing && (existing.chosen !== null || existing.verdict)) return true;
      const open = check.kind === 'open';
      setQuiz({ t: 'quiz', qid, label: open ? 'Your turn — in your own words' : label, q: check.q, options: check.options, answer: check.answer, chosen: null, explain: check.explain, open });
      // the student can answer as soon as the question is on the board, even while it is read out
      awaitingRef.current = qid;
      setAwaiting(qid);
      const answered = new Promise<number | string>((resolve) => {
        answerFn.current = resolve;
        openFn.current = open ? resolve : null;
      });
      const first = await Promise.race([answered.then(() => 'answered' as const), narrate(open ? check.q : `${label}. ${check.q}`, token, -1, 0, 'think').then((ok) => (ok ? ('read' as const) : ('stopped' as const)))]);
      if (first === 'stopped' && token !== runToken.current) return false;
      if (first === 'answered') narrId.current++; // stop reading the question
      else {
        setCaption(open ? 'Say your answer out loud, or type it.' : `${check.q} — tap your answer${recognitionSupported ? ', or say it' : ''}.`);
        setPhase('waiting');
        act('listen');
        if (open && !(prefs.handsFree && handsFreeSupported)) setTyping(true);
      }
      const got = await answered;
      answerFn.current = null;
      openFn.current = null;
      awaitingRef.current = null;
      setAwaiting(null);
      setTyping(false);
      if (token !== runToken.current) return false;
      setPhase('playing');

      if (open) {
        const said = String(got);
        setQuiz({ ...quizRef.current[qid], said, verdict: 'marking' });
        act('think');
        let verdict: 'right' | 'partly' | 'wrong' = 'partly';
        let say = `Good thinking. Here's what I was looking for: ${check.model}`;
        try {
          const r = await api<{ verdict: 'right' | 'partly' | 'wrong'; say: string; usage: any }>(`/tutor/lessons/${id}/open`, { body: { step: lessonIndex, answer: said, tutor: persona.id } });
          updateAiUsage(r.usage);
          verdict = r.verdict;
          say = r.say;
        } catch {
          /* marking is a bonus: the tutor still gives the answer */
        }
        if (token !== runToken.current) return false;
        setQuiz({ ...quizRef.current[qid], said, verdict });
        return narrate(say, token, -1, 0, verdict === 'right' ? 'happy' : verdict === 'partly' ? 'explain' : 'emphasis');
      }

      const chosen = Number(got);
      setQuiz({ ...quizRef.current[qid], chosen });
      const ok = chosen === check.answer;
      const feedback = ok ? `${pick(PRAISE)}${firstName && Math.random() < 0.4 ? `, ${firstName}` : ''}. ${check.explain}` : `${pick(NOT_QUITE)} The answer is ${String.fromCharCode(65 + check.answer)}, ${check.options[check.answer]}. ${check.explain}`;
      return narrate(feedback, token, -1, 0, ok ? 'happy' : 'explain');
    },
    [narrate, act, id, persona.id, firstName, prefs.handsFree],
  );

  /** Play the lesson from a step to the end: steps, checks, then practice on the board. */
  const runFrom = useCallback(
    async (from: number) => {
      const token = ++runToken.current;
      track.current?.t.stop();
      track.current = null;
      pausedRef.current = false;
      resumeFn.current = null;
      setShowEnd(false);
      setOverview(false);
      setFollow(true);
      setPhase('playing');
      // say hello the first time, like a teacher would
      if (!greeted.current && data) {
        greeted.current = true;
        const hello = from === 0 ? `Hi${firstName ? ` ${firstName}` : ''}! I'm ${persona.name}. Today we're doing ${data.lesson.title}. Stop me any time${prefs.handsFree && handsFreeSupported ? ' — just talk' : ' with the mic'}.` : `Welcome back${firstName ? `, ${firstName}` : ''}! Let's carry on where we stopped.`;
        if (!(await narrate(hello, token, -1, 0, 'wave'))) return;
      }
      let part = stepsRef.current.slice(0, Math.max(0, from)).filter((s) => !s.asked && s.board[0]?.t === 'heading').length;
      for (let i = Math.max(0, from); i < stepsRef.current.length; i++) {
        if (token !== runToken.current) return;
        const s = stepsRef.current[i];
        curRef.current = i;
        setCur(i);
        setRevealed(0);
        setInPractice(false);
        // a new section: say so clearly
        const h = s.board.find((b) => b.t === 'heading');
        if (h && h.t === 'heading' && !s.asked) {
          part++;
          setSection({ part, title: h.text, n: Date.now() });
        }
        if (!(await narrate(s.say, token, i, s.board.length, s.gesture ? GESTURE_ACT[s.gesture] : undefined))) return;
        if (s.check && !(await askCheck(`c${i}`, s.check, 'Quick check', token, s.lessonIndex))) return;
        if (!s.asked && data) void api(`/tutor/lessons/${id}`, { method: 'PATCH', body: { step: s.lessonIndex } }).catch(() => {});
      }
      // practice on the board
      const practice = data?.lesson.practice || [];
      if (practice.length) {
        setInPractice(true);
        setSection({ part: 0, title: 'Check yourself', n: Date.now() });
        if (!(await narrate(`Right${firstName ? `, ${firstName}` : ''} — let's see what you remember. ${practice.length} quick questions.`, token, -1, 0, 'count'))) return;
        for (let p = 0; p < practice.length; p++) if (!(await askCheck(`p${p}`, { ...practice[p], kind: 'choice' }, `Question ${p + 1} of ${practice.length}`, token, -1))) return;
        const answers = practice.map((_, p) => quizRef.current[`p${p}`]?.chosen ?? -1);
        try {
          const r = await api<{ score: number; total: number; points: number }>(`/tutor/lessons/${id}/practice`, { body: { answers } });
          setResult(r);
          if (token === runToken.current) await narrate(r.score === r.total ? `All ${r.total} right. That's brilliant work${firstName ? `, ${firstName}` : ''}!` : `You got ${r.score} out of ${r.total}. Save these as flashcards and they'll come back just before you forget.`, token, -1, 0, r.score === r.total ? 'happy' : 'explain');
        } catch {
          /* points are a bonus; the lesson still ends */
        }
      }
      if (token !== runToken.current) return;
      setPhase('done');
      act('wave');
      setOverview(true);
      setShowEnd(true);
      setCaption('Lesson complete. Look over the whole board, or save it as flashcards.');
    },
    [narrate, askCheck, data, id, act, firstName, persona.name, prefs.handsFree],
  );

  function pause() {
    if (phaseRef.current !== 'playing') return;
    pausedRef.current = true;
    track.current?.t.pause();
    setSpeaking(false);
    setPhase('paused');
    if (!control.current.sit) act('idle');
  }
  function play() {
    const p = phaseRef.current;
    if (p === 'ready' || p === 'done') {
      void runFrom(p === 'done' ? 0 : Math.min(data?.step || 0, stepsRef.current.length - 1));
      return;
    }
    if (p === 'paused') {
      pausedRef.current = false;
      setPhase('playing');
      setFollow(true);
      if (resumeFn.current) {
        const f = resumeFn.current;
        resumeFn.current = null;
        f();
      } else if (track.current && !track.current.t.ended) {
        track.current.t.play();
        setSpeaking(true);
      } else void runFrom(curRef.current);
    }
  }
  function go(to: number) {
    answerFn.current = null;
    openFn.current = null;
    awaitingRef.current = null;
    setAwaiting(null);
    // past the last step: straight on to the practice
    void runFrom(Math.max(0, Math.min(stepsRef.current.length, to)));
  }

  function answer(qid: string, i: number) {
    if (awaitingRef.current === qid && answerFn.current && !openFn.current) answerFn.current(i);
  }

  /** Something the student said or typed: an answer to the question on the board, or a question. */
  function heardText(t: string) {
    const checking = awaitingRef.current;
    if (checking) {
      const q = quizRef.current[checking];
      if (q?.open && openFn.current) return openFn.current(t);
      const i = q ? matchOption(t, q.options) : -1;
      if (i >= 0) return answer(checking, i);
      // not an answer: maybe a question about it
      if (t.split(/\s+/).length < 4) return toast(`I heard “${t}”. Tap the answer you mean.`);
    }
    void ask(t);
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
    act('think');
    checkedUpTo.current = ink.length;
    void ask(question.trim(), undefined, pic);
  }

  /** "I have a question": the tutor reacts, answers on a fresh part of the board, then goes on. */
  async function ask(text: string, audio?: string, image?: string) {
    const step = stepsRef.current[curRef.current];
    if (!step || (!text.trim() && !audio && !image) || askingRef.current) return;
    if (!ai?.enabled) return toast('Questions need the AI tutor, which is not switched on here yet.');
    askingRef.current = true;
    setAsking(true);
    hf.current?.hold(true);
    // stop the lesson where it is and say something while the answer is worked out, as a person would
    const token = ++runToken.current;
    track.current?.t.stop();
    pausedRef.current = false;
    resumeFn.current = null;
    setPhase('playing');
    control.current.sit = false;
    place();
    setCaption(text ? `You asked: ${text}` : image ? `${persona.name} is reading what you wrote…` : 'Listening to your question…');
    const filler = narrate(image ? 'Let me have a look at what you wrote.' : pick(THINKING), token, -1, 0, 'think');
    try {
      const [r] = await Promise.all([api<{ steps: TutorStep[]; heard?: string; usage: any }>(`/tutor/lessons/${id}/ask`, { body: { step: step.lessonIndex, question: text.trim() || undefined, audio, image, tutor: persona.id } }), filler]);
      updateAiUsage(r.usage);
      const q = text.trim() || r.heard || (image ? 'check what I wrote' : 'your question');
      const heading: BoardItem = { t: 'heading', text: `You asked: ${q.length > 60 ? `${q.slice(0, 57)}…` : q}` };
      const extra: PlayStep[] = r.steps.map((s, k) => ({ ...s, board: k === 0 ? [heading, ...s.board.filter((b) => b.t !== 'clear')] : s.board, lessonIndex: step.lessonIndex, asked: true }));
      // finish writing this step, then teach the answer straight after it
      setRevealed(step.board.length);
      const at = curRef.current;
      const all = [...stepsRef.current.slice(0, at + 1), ...extra, ...stepsRef.current.slice(at + 1)];
      stepsRef.current = all;
      setSteps(all);
      setTyping(false);
      setQuestion('');
      if (token === runToken.current) void runFrom(at + 1);
    } catch (err: any) {
      toast(err.message);
      if (token === runToken.current) void runFrom(curRef.current);
    } finally {
      askingRef.current = false;
      setAsking(false);
      setHeard('');
      hf.current?.hold(false);
    }
  }

  // ── hands-free: just talk. The lesson pauses when the student starts speaking.
  const started = phase !== 'ready';
  useEffect(() => {
    if (!data || !started || !prefs.handsFree || !handsFreeSupported || !ai?.enabled) return;
    const h = startHandsFree({
      onStart: () => {
        if (askingRef.current) return;
        setHearing(true);
        setHeard('');
        if (!awaitingRef.current && phaseRef.current === 'playing') {
          barged.current = true;
          pause();
        }
      },
      onInterim: (t) => setHeard(t),
      onFinal: (t) => {
        setHearing(false);
        barged.current = false;
        heardText(t);
      },
      onFalseStart: () => {
        setHearing(false);
        setHeard('');
        if (barged.current) {
          barged.current = false;
          play();
        }
      },
      onError: (m) => toast(m),
    });
    hf.current = h;
    return () => {
      h?.stop();
      hf.current = null;
      setHearing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, started, prefs.handsFree, ai?.enabled]);

  /** The mic: answer by voice, or ask anything (push to talk). */
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
    if (!awaitingRef.current) pause();
    if (recognitionSupported) {
      hf.current?.hold(true);
      setListening('speech');
      setHeard('');
      listenRef.current = listenOnce({
        onInterim: (t) => setHeard(t),
        onFinal: (t) => heardText(t),
        onEnd: () => {
          setListening(null);
          if (!askingRef.current) hf.current?.hold(false);
        },
        onError: (m) => toast(m),
      });
      return;
    }
    if (awaitingRef.current && !openFn.current) return toast('Tap your answer on the board.');
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

  function restartWith(next: TutorPrefs, msg?: string) {
    const p = phaseRef.current;
    runToken.current++;
    void savePrefs(next).then(() => {
      if (msg) toast(msg);
      if (p === 'playing' || p === 'waiting') window.setTimeout(() => void runFrom(curRef.current), 60);
      else if (p !== 'ready' && p !== 'done') setPhase('paused');
    });
  }
  function toggleSound() {
    restartWith({ ...prefs, sound: prefs.sound === 'silent' ? (natural ? 'natural' : 'device') : 'silent' });
  }
  function nextAccent() {
    const i = ACCENTS.findIndex((a) => a.id === prefs.accent);
    const a = ACCENTS[(i + 1) % ACCENTS.length];
    restartWith({ ...prefs, accent: a.id }, `${persona.name} now speaks with a ${a.label} accent.`);
  }

  // keyboard: space play/pause, arrows step, Q type a question
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || typing || picker) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (phaseRef.current === 'playing') pause();
        else play();
      } else if (e.key === 'ArrowRight') {
        if (!inPractice && phase !== 'done') go(cur + 1);
      } else if (e.key === 'ArrowLeft') go(cur - 1);
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

  // the section banner fades after a moment
  useEffect(() => {
    if (!section) return;
    const t = window.setTimeout(() => setSection(null), 2800);
    return () => window.clearTimeout(t);
  }, [section]);

  // everything written so far, with the questions after their steps and the practice at the end
  const shown: ShownItem[] = useMemo(() => {
    const out: ShownItem[] = [];
    let part = 0;
    steps.forEach((s, si) => {
      const lessonHeading = !s.asked;
      if (si > cur && !(phase === 'done' || inPractice)) return;
      const upto = si < cur || phase === 'done' || inPractice ? s.board.length : revealed;
      s.board.slice(0, upto).forEach((item, ii) => {
        let draw = 0;
        if (si === cur && track.current?.step === cur && !inPractice) {
          const o = track.current.offsets;
          draw = Math.max(0.45, Math.min(1.8, (o[ii + 1] ?? track.current.t.duration) - o[ii]));
          if (item.t === 'sketch' || item.t === 'pie' || item.t === 'bars') draw = Math.max(1.6, Math.min(4, draw * 1.5));
        }
        out.push({ key: `${si}-${ii}`, item, draw, part: item.t === 'heading' && lessonHeading ? ++part : undefined });
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
  const progress = phase === 'done' ? 1 : (step.lessonIndex + (phase === 'ready' ? 0 : 0.5)) / lessonSteps;
  const handsFreeOn = prefs.handsFree && handsFreeSupported && !!ai?.enabled && started;
  const awaitingOpen = !!(awaiting && quizzes[awaiting]?.open);
  const status = listening || hearing ? 'listening' : asking ? 'thinking' : speaking ? 'speaking' : awaiting ? 'waiting' : phase;

  return (
    <div className="tutor-full">
      <header className="tf-top">
        <Link to={back} className="btn icon ghost" aria-label="Leave the lesson">
          <X size={20} />
        </Link>
        <div className="tf-title">
          <h1>{data.lesson.title}</h1>
          <div className="tf-progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={lessonSteps} aria-valuenow={step.lessonIndex + 1} aria-label={`Step ${step.lessonIndex + 1} of ${lessonSteps}`}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
        <button className="tf-accent" onClick={nextAccent} title="Change the accent" aria-label={`Accent: ${accentById(prefs.accent).label}. Tap to change.`}>
          {accentById(prefs.accent).label}
        </button>
        <button className="btn icon ghost" onClick={() => setPicker(true)} title="Tutor, voice and settings" aria-label="Tutor, voice and settings">
          <Settings2 size={19} />
        </button>
      </header>

      <div className={`tf-stage ${prefs.avatar ? 'with-char' : ''}`}>
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
          onWriteSpot={onWriteSpot}
          showPen={!prefs.avatar}
          insetBottom={prefs.avatar && phase !== 'ready' && (spot.current?.view.w ?? 1000) < 640 ? charH * 0.8 : 0}
        />
        {prefs.avatar && phase !== 'ready' && (
          <div className="tf-chars" aria-hidden>
            <TutorCharacter tutor={persona.id} control={control} mouth={mouth} height={charH} />
          </div>
        )}
        {section && (
          <div key={section.n} className="tf-section" role="status">
            <small>{section.part ? `Part ${section.part}` : 'Practice'}</small>
            <strong>{section.title}</strong>
          </div>
        )}
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
            <span className="tutor-start-char">
              <TutorCharacter tutor={persona.id} control={startControl} height={170} />
            </span>
            <span className="tutor-startcircle">
              <Play size={30} />
            </span>
            <span>{data.step > 0 ? `Continue with ${persona.name}` : `Start with ${persona.name}`}</span>
            <span className="small muted">
              About {mins} min · {handsFreeSupported && prefs.handsFree ? 'just talk to ask a question' : 'tap the mic to ask a question'}
            </span>
          </button>
        )}
        {!follow && !overview && phase !== 'ready' && (
          <button className="tf-follow" onClick={() => setFollow(true)}>
            <LocateFixed size={15} /> Follow {persona.name}
          </button>
        )}
        {showEnd && <LessonEnd id={id} data={data} result={result} onReplay={() => go(0)} onNext={() => data.next && data.packId && nav(`/tutor/new?mode=lesson&pack=${data.packId}&chunk=${data.next.chunk}`)} onClose={() => setShowEnd(false)} />}
      </div>

      {(typing || awaitingOpen) && (
        <form
          className="tf-type"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!question.trim()) return;
            if (awaitingOpen && openFn.current) {
              openFn.current(question.trim());
              setQuestion('');
            } else void ask(question);
          }}
        >
          <div className="row" style={{ gap: 6 }}>
            <input className="input" style={{ flex: 1 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={awaitingOpen ? 'Type your answer…' : `Ask ${persona.name} anything…`} autoFocus={typing} disabled={asking} aria-label={awaitingOpen ? 'Your answer' : 'Your question'} />
            <button className="btn primary" disabled={asking || !question.trim()} aria-label={awaitingOpen ? 'Send answer' : 'Ask'}>
              <Send size={16} />
            </button>
            {!awaitingOpen && (
              <button type="button" className="btn icon ghost" onClick={() => setTyping(false)} aria-label="Close">
                <X size={16} />
              </button>
            )}
          </div>
          {!awaitingOpen && (
            <div className="tf-chips">
              {['Explain that again, more simply', 'Give me another example', 'Why does that work?', 'How would this come in an exam?'].map((c) => (
                <button key={c} type="button" className="chip" onClick={() => void ask(c)} disabled={asking}>
                  {c}
                </button>
              ))}
              {ai && <span className="small muted">{left(ai, 'tutor')} questions left today</span>}
            </div>
          )}
        </form>
      )}

      <footer className="tf-bar">
        <p className="tf-caption" aria-live="polite">
          {listening || hearing || asking ? <span className="tf-heard">{heard || (asking ? `${persona.name} is thinking…` : 'Listening…')}</span> : prefs.captions || prefs.sound === 'silent' ? caption : ''}
        </p>
        <div className="tf-ctrls">
          <button
            className="tf-btn"
            onClick={() => {
              pause();
              setTyping((t) => !t);
            }}
            aria-label="Type a question"
            title="Type (Q)"
            disabled={!ai?.enabled}
          >
            <Keyboard size={19} />
          </button>
          {phase === 'playing' ? (
            <button className="tf-btn" onClick={pause} aria-label="Pause" title="Pause (space)">
              <Pause size={20} />
            </button>
          ) : (
            <button className="tf-btn" onClick={play} aria-label="Play" title="Play (space)" disabled={phase === 'waiting'}>
              <Play size={20} />
            </button>
          )}
          <button className={`tf-mic ${listening || hearing ? 'on' : ''} ${awaiting ? 'waiting' : ''} ${handsFreeOn ? 'handsfree' : ''}`} onClick={() => void mic()} aria-label={listening ? 'Stop listening' : awaiting ? 'Say your answer' : `Talk to ${persona.name}`} disabled={!ai?.enabled && !awaiting} title={handsFreeOn ? 'Hands-free is on: just talk. Or tap to talk now.' : 'Tap and talk'}>
            {listening ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <button className={`tf-btn ${tool ? 'on' : ''}`} onClick={() => setTool((t) => (t ? null : { tool: 'pen', color: penColour, w: 3 }))} aria-label={tool ? 'Stop writing on the board' : 'Write on the board'} aria-pressed={!!tool} title="Write on the board (P)">
            <PenLine size={19} />
          </button>
          <button className="tf-btn" onClick={toggleSound} aria-label={prefs.sound === 'silent' ? 'Turn the voice on' : 'Mute the voice'} title={prefs.sound === 'silent' ? 'Voice on' : 'Mute'}>
            {prefs.sound === 'silent' ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <button className="tf-btn hide-sm" onClick={() => setOverview((o) => !o)} aria-pressed={overview} aria-label="See the whole board" title="Whole board">
            {overview ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
        <p className={`tf-status ${status}`}>
          {status === 'listening' ? `${persona.name} is listening` : status === 'thinking' ? `${persona.name} is thinking` : handsFreeOn ? 'Hands-free · just talk' : prefs.handsFree && !handsFreeSupported ? 'Tap the mic to talk' : ''}
        </p>
      </footer>

      {picker && (
        <TutorPicker
          prefs={prefs}
          natural={natural && data.voice}
          onClose={() => setPicker(false)}
          onSave={(p) => restartWith(p, `${tutorById(p.tutor).name} will teach you from now on.`)}
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
