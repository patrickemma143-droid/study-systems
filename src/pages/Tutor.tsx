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
import { DONT_KNOW, neutralAfterChecks, type BoardItem, type Check, type Gesture, type TutorLesson, type TutorStep } from '../../shared/tutor';
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

/**
 * A step being played. Steps the tutor adds during the lesson (an answer to a question, or an idea
 * taught again after a wrong answer) are `asked`; re-teaching steps also say which question they help with.
 */
type PlayStep = TutorStep & { lessonIndex: number; asked?: boolean; retryOf?: string; attempt?: number; label?: string };

/** How well each idea checked in the lesson was understood. */
interface MasteryItem {
  q: string;
  section: string;
  /** the lesson step where that section starts (to go over it again) */
  sectionStep: PlayStep | null;
  status: 'got' | 'helped' | 'review';
  /** the question that checks this idea (asked again in later check-ins) */
  check?: Check;
  correct?: boolean;
  /** right, but only a guess */
  guessed?: boolean;
  /** wrong, and sure of it: a misconception */
  sureWrong?: boolean;
}
type Phase = 'ready' | 'playing' | 'paused' | 'waiting' | 'done';

const PRAISE = ['Exactly right!', 'Yes — well done!', 'Spot on!', 'That’s it!', 'Brilliant, correct!', 'Nailed it!'];
const NOT_QUITE = ['Ooh, not quite.', 'Close, but not this time.', 'Hmm, not quite — no worries.', 'Good try, but no.'];
const THINKING = ['Ooh, good question. Let me show you.', 'Hmm, let me think about the best way to explain that.', 'Great question — give me a second.', 'Ah, I see what you mean. Let me draw it.'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** a stable choice from a list (the same words each time, so their voice can be fetched ahead) */
const pickBy = <T,>(a: T[], key: string) => a[[...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % a.length];

/** The rest of what was being said, from the sentence the tutor had reached (`at` = 0..1 through it). */
function restFrom(say: string, at: number): string {
  const parts = say.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) || [say];
  let seen = 0;
  const total = say.length || 1;
  for (let i = 0; i < parts.length; i++) {
    // restart the sentence that was being said when the student cut in
    if ((seen + parts[i].length) / total > at) return parts.slice(i).join('').trim();
    seen += parts[i].length;
  }
  return '';
}
const BACK_LINE = 'Right — back to where we were.';

/** What the tutor says when a question goes up on the board. */
const checkLine = (check: Check, label: string) => (check.kind === 'open' ? check.q : `${label}. ${check.q}`);
/** What the tutor says after a multiple-choice answer, right or wrong (known before the student answers). */
function feedbackLine(qid: string, check: Check, ok: boolean, name: string) {
  if (ok) return `${pickBy(PRAISE, qid).replace(/[.!]+$/, '')}${name && pickBy([0, 1, 2], qid + name) === 0 ? `, ${name}` : ''}! ${check.explain}`;
  return `${pickBy(NOT_QUITE, qid)} The answer is ${String.fromCharCode(65 + check.answer)}, ${check.options[check.answer]}. ${check.explain}`;
}
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
    const level = params.get('level') || prefs?.level || 'university';
    api<{ id: number; usage: any }>('/tutor/lesson', { body: { ...body, level } })
      .then((r) => {
        updateAiUsage(r.usage);
        nav(`/tutor/${r.id}`, { replace: true });
      })
      .catch((e) => setError(e.message));
  }, [mode, params, nav, prefs?.level]);

  useEffect(() => {
    // wait for the student's settings, so the lesson is made at the level they chose
    if (started.current || !prefs) return;
    started.current = true;
    start();
  }, [start, prefs]);
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
              <strong>{what}</strong>{prefs?.level === 'professor' ? ' at Professor level' : ''} — {prefs?.level === 'professor' ? 'about a minute' : 'about 20 seconds'} the first time.
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
  /** every idea checked so far, and how well it was understood */
  const mastery = useRef(new Map<string, MasteryItem>());
  const [masteryList, setMasteryList] = useState<MasteryItem[]>([]);
  /** parts of the lesson the student already knows (from the quick check, or mastered before): skipped */
  const skip = useRef(new Set<PlayStep>());
  /** parts of this topic mastered in earlier lessons */
  const [knownBefore, setKnownBefore] = useState<Set<string>>(new Set());
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
        // a pre-written "Spot on!" after a question would contradict the student's real answer
        const s = neutralAfterChecks(r.lesson.steps).map((x, i) => ({ ...x, lessonIndex: i }));
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

  /** The voice for what comes after step i: its question, then the next two steps and their questions. */
  function prefetchFrom(i: number) {
    const s = stepsRef.current;
    const lines: (string | undefined)[] = [];
    if (s[i]?.check) lines.push(checkLine(s[i].check!, 'Quick check'));
    for (const j of [i + 1, i + 2]) {
      lines.push(s[j]?.say);
      if (s[j]?.check) lines.push(checkLine(s[j].check!, 'Quick check'));
    }
    narrator.current?.prefetchAll(lines);
  }

  /** The greeting, the same words every time (so it can be fetched before Start is pressed). */
  function helloLine(from: number) {
    if (!data) return '';
    return from === 0 ? `Hi${firstName ? ` ${firstName}` : ''}! I'm ${persona.name}. Today we're doing ${data.lesson.title}. Stop me any time${prefs.handsFree && handsFreeSupported ? ' — just talk' : ' with the mic'}.` : `Welcome back${firstName ? `, ${firstName}` : ''}! Let's carry on where we stopped.`;
  }
  const startAt = () => Math.min(data?.step || 0, Math.max(0, stepsRef.current.length - 1));
  /** the "good question" line used next — chosen ahead so its voice is ready the moment a question comes */
  const filler = useRef(pick(THINKING));

  // as soon as the lesson opens, get the greeting and the first steps ready (before Start is pressed)
  useEffect(() => {
    const n = narrator.current;
    if (!n || !data) return;
    const from = startAt();
    n.prefetchAll([helloLine(from), stepsRef.current[from]?.say, stepsRef.current[from + 1]?.say, filler.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, prefs.sound, prefs.accent, prefs.tutor, prefs.rate]);

  /** Say something, writing `items` board items of step `stepIndex` in time with it. Resolves when done. */
  const narrate = useCallback(async (text: string, token: number, stepIndex = -1, items = 0, gesture?: Act) => {
    const n = narrator.current;
    if (!n || token !== runToken.current) return false;
    const me = ++narrId.current;
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
    // while this plays, get the next lines ready so there is never a wait between them
    if (stepIndex >= 0) prefetchFrom(stepIndex);
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
        window.setTimeout(() => resolve(token === runToken.current), 160);
      });
      if (!control.current.sit) act(gesture || (items ? 'write' : 'explain'), gesture === 'happy' || gesture === 'emphasis');
      const go = () => {
        t.play();
        // the caption appears with the voice, not before it
        setCaption(text);
        setSpeaking(true);
        hf.current?.setTutorText(text);
      };
      if (pausedRef.current) resumeFn.current = go;
      else go();
      tick();
    });
  }, [act]);

  /** The lesson section a step belongs to (its heading and first step), for the mastery map. */
  function sectionOf(stepAt: number): { title: string; step: PlayStep | null } {
    for (let i = Math.min(stepAt, stepsRef.current.length - 1); i >= 0; i--) {
      const s = stepsRef.current[i];
      const h = !s.asked && s.board.find((b) => b.t === 'heading');
      if (h && h.t === 'heading') return { title: h.text, step: s };
    }
    return { title: data?.lesson.title || 'This lesson', step: stepsRef.current[0] || null };
  }

  /**
   * The mastery loop: a missed question means the idea hasn't clicked yet. The tutor works out the
   * misunderstanding, teaches it again a new way, and asks a fresh question on it — up to twice —
   * before moving on. Each idea ends as understood, understood after help, or one to review.
   */
  async function afterAnswer(o: { qid: string; check: Check; stepAt: number; lessonIndex: number; missed: boolean; partly?: boolean; given: string; right: string; feedback: Promise<boolean> }) {
    const here = stepsRef.current[o.stepAt];
    const root = here?.retryOf || o.qid;
    const attempt = here?.attempt || 0;
    // "I'm guessing": a right guess isn't understanding yet, and a wrong answer given without it
    // was given with confidence — a misconception to untangle, not just a gap
    const guessed = !!quizRef.current[o.qid]?.guess;
    const sureWrong = o.missed && !guessed && o.check.kind !== 'open';
    if (o.lessonIndex >= 0 && !o.check.predict) {
      const prev = mastery.current.get(root);
      const sec = sectionOf(o.stepAt);
      mastery.current.set(root, {
        q: prev?.q || o.check.q,
        section: prev?.section || sec.title,
        sectionStep: prev?.sectionStep || sec.step,
        check: prev?.check || o.check,
        status: !o.missed ? (attempt > 0 || o.partly || guessed ? 'helped' : 'got') : 'review',
        correct: !o.missed,
        guessed: guessed && !o.missed,
        sureWrong: (prev?.sureWrong ?? false) || sureWrong,
      });
    }
    // fetch the new explanation while the tutor is still giving its feedback
    const help = o.missed && !o.check.predict && o.lessonIndex >= 0 && attempt < 2 && ai?.enabled
      ? api<{ steps: TutorStep[]; check: Check; usage: any }>(`/tutor/lessons/${id}/reteach`, { body: { step: o.lessonIndex, question: o.check.q, answerGiven: o.given, rightAnswer: o.right, attempt: attempt + 1, confident: sureWrong, tutor: persona.id } }).catch(() => null)
      : null;
    const ok = await o.feedback;
    if (!ok) return false;
    if (o.missed && !o.check.predict && o.lessonIndex >= 0 && attempt >= 2) {
      return narrate(`No worries${firstName ? `, ${firstName}` : ''} — this one is tricky. I've marked it to go over again, and it will come back in your review.`, runToken.current, -1, 0, 'explain');
    }
    const r = help ? await help : null;
    if (!r) return true;
    updateAiUsage(r.usage);
    // teach it again straight after this step, ending with the new question
    const extra: PlayStep[] = r.steps.map((s, k) => ({ ...s, lessonIndex: o.lessonIndex, asked: true, retryOf: root, attempt: attempt + 1, ...(k === r.steps.length - 1 ? { check: r.check, label: 'Let’s try that again' } : {}) }));
    const all = [...stepsRef.current.slice(0, o.stepAt + 1), ...extra, ...stepsRef.current.slice(o.stepAt + 1)];
    stepsRef.current = all;
    setSteps(all);
    return true;
  }

  /** Write a question on the board, read it out, wait for the answer, then react to it like a teacher. */
  const askCheck = useCallback(
    async (qid: string, check: Check, label: string, token: number, lessonIndex: number, stepAt = -1) => {
      const existing = quizRef.current[qid];
      if (existing && (existing.chosen !== null || existing.verdict)) return true;
      const open = check.kind === 'open';
      setQuiz({ t: 'quiz', qid, label: open ? (check.predict ? 'Predict — what do you think?' : 'Your turn — in your own words') : label, q: check.q, options: check.options, answer: check.answer, chosen: null, explain: check.explain, open });
      // the student can answer as soon as the question is on the board, even while it is read out
      awaitingRef.current = qid;
      setAwaiting(qid);
      const answered = new Promise<number | string>((resolve) => {
        answerFn.current = resolve;
        openFn.current = open ? resolve : null;
      });
      // while the student thinks, get both replies ready (right and wrong), so the tutor answers at once
      if (!open) narrator.current?.prefetchAll([feedbackLine(qid, check, true, firstName), feedbackLine(qid, check, false, firstName)]);
      const first = await Promise.race([answered.then(() => 'answered' as const), narrate(checkLine(check, label), token, -1, 0, 'think').then((ok) => (ok ? ('read' as const) : ('stopped' as const)))]);
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

      if (open && DONT_KNOW.test(String(got).trim())) {
        setQuiz({ ...quizRef.current[qid], said: 'I’m not sure', verdict: 'wrong', guess: true });
        const say = check.predict ? "That's fine — it's only a guess. Let's find out." : `That's completely fine — that's what I'm here for. Here's the idea: ${check.model || check.explain}`;
        const feedback = narrate(say, token, -1, 0, 'explain');
        return afterAnswer({ qid, check, stepAt, lessonIndex, missed: true, given: "I don't know", right: check.model || check.explain, feedback });
      }

      if (open) {
        const said = String(got);
        setQuiz({ ...quizRef.current[qid], said, verdict: 'marking' });
        act('think');
        let verdict: 'right' | 'partly' | 'wrong' = 'partly';
        let say = check.predict ? "Interesting guess — let's find out." : `Good thinking. Here's what I was looking for: ${check.model}`;
        try {
          const r = await api<{ verdict: 'right' | 'partly' | 'wrong'; say: string; usage: any }>(`/tutor/lessons/${id}/open`, { body: { step: lessonIndex >= 0 ? lessonIndex : 0, answer: said, tutor: persona.id, q: check.q, model: check.model, predict: !!check.predict } });
          updateAiUsage(r.usage);
          verdict = r.verdict;
          say = r.say;
        } catch {
          /* marking is a bonus: the tutor still gives the answer */
        }
        if (token !== runToken.current) return false;
        setQuiz({ ...quizRef.current[qid], said, verdict });
        const feedback = narrate(say, token, -1, 0, check.predict ? 'think' : verdict === 'right' ? 'happy' : verdict === 'partly' ? 'explain' : 'emphasis');
        return afterAnswer({ qid, check, stepAt, lessonIndex, missed: verdict === 'wrong', partly: verdict === 'partly', given: said, right: check.model || check.explain, feedback });
      }

      const chosen = Number(got);
      if (chosen === -1) {
        setQuiz({ ...quizRef.current[qid], chosen: -1, guess: true });
        const feedback = narrate(`That's completely fine — that's what I'm here for. The answer is ${String.fromCharCode(65 + check.answer)}, ${check.options[check.answer]}. ${check.explain}`, token, -1, 0, 'explain');
        return afterAnswer({ qid, check, stepAt, lessonIndex, missed: true, given: "I don't know", right: `${check.options[check.answer]}. ${check.explain}`, feedback });
      }
      setQuiz({ ...quizRef.current[qid], chosen });
      const ok = chosen === check.answer;
      const feedback = narrate(feedbackLine(qid, check, ok, firstName), token, -1, 0, ok ? 'happy' : 'explain');
      return afterAnswer({ qid, check, stepAt, lessonIndex, missed: !ok, given: check.options[chosen] ?? '(no answer)', right: `${check.options[check.answer]}. ${check.explain}`, feedback });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [narrate, act, id, persona.id, firstName, prefs.handsFree, ai?.enabled, data],
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
        const hello = helloLine(from);
        if (!(await narrate(hello, token, -1, 0, 'wave'))) return;
      }
      let part = stepsRef.current.slice(0, Math.max(0, from)).filter((s) => !s.asked && s.board[0]?.t === 'heading').length;
      for (let i = Math.max(0, from); i < stepsRef.current.length; i++) {
        if (token !== runToken.current) return;
        const s = stepsRef.current[i];
        // a part the student already knows: say so once, then skip ahead
        const sec = !s.asked ? sectionOf(i).step : null;
        if (sec && skip.current.has(sec)) {
          if (s === sec) {
            curRef.current = i;
            setCur(i);
            const h = s.board.find((b) => b.t === 'heading');
            if (!(await narrate(`You already know ${h && h.t === 'heading' ? h.text : 'this part'}, so let's skip ahead.`, token, i, s.board.length, 'point'))) return;
          }
          continue;
        }
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
        if (s.check && !(await askCheck(`c${i}`, s.check, s.label || 'Quick check', token, s.lessonIndex, i))) return;
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
      const learned = [...mastery.current.values()];
      setMasteryList(learned);
      saveMastery(learned);
      setPhase('done');
      act('wave');
      setOverview(true);
      setShowEnd(true);
      setCaption('Lesson complete. Look over the whole board, or save it as flashcards.');
    },
    [narrate, askCheck, data, id, act, firstName, persona.name, prefs.handsFree],
  );

  /** One question per part of the lesson (its first multiple-choice check), for the quick check first. */
  const diagnostic = useMemo(() => {
    const out: { sectionStep: PlayStep; title: string; check: Check }[] = [];
    let cur: { step: PlayStep; title: string } | null = null;
    let taken = false;
    for (const s of steps) {
      if (s.asked) continue;
      const h = s.board.find((b) => b.t === 'heading');
      if (h && h.t === 'heading') {
        cur = { step: s, title: h.text };
        taken = false;
      }
      if (cur && !taken && s.check && s.check.kind !== 'open' && !s.check.predict) {
        out.push({ sectionStep: cur.step, title: cur.title, check: s.check });
        taken = true;
      }
    }
    return out.slice(0, 5);
  }, [steps]);

  // what the student mastered in earlier lessons on this topic
  useEffect(() => {
    if (!data) return;
    api<{ concepts: { concept: string; status: string }[] }>(`/mastery/topic?topic=${encodeURIComponent(data.lesson.title)}`)
      .then((r) => setKnownBefore(new Set(r.concepts.filter((c) => c.status === 'got').map((c) => c.concept))))
      .catch(() => {});
  }, [data]);

  /**
   * "Quiz me first": a question on each part before teaching. Parts answered right (without a guess),
   * or mastered in an earlier lesson, are skipped — no one sits through what they already know.
   */
  async function runDiagnostic() {
    const token = ++runToken.current;
    greeted.current = true;
    setPhase('playing');
    const todo = diagnostic.filter((d) => !knownBefore.has(d.title));
    for (const d of diagnostic) if (knownBefore.has(d.title)) skip.current.add(d.sectionStep);
    narrator.current?.prefetchAll(['Yes — you know this one.', "No problem — we'll cover that."]);
    const intro = todo.length
      ? `Hi${firstName ? ` ${firstName}` : ''}! Before we start, ${todo.length === 1 ? 'one quick question' : `${todo.length} quick questions`}, so I can skip what you already know.`
      : `Hi${firstName ? ` ${firstName}` : ''}! You've learned parts of this before.`;
    if (!(await narrate(intro, token, -1, 0, 'wave'))) return;
    for (let k = 0; k < todo.length; k++) {
      const d = todo[k];
      const qid = `d${k}`;
      setQuiz({ t: 'quiz', qid, label: `Before we start · ${k + 1} of ${todo.length}`, q: d.check.q, options: d.check.options, answer: d.check.answer, chosen: null, explain: d.check.explain });
      awaitingRef.current = qid;
      setAwaiting(qid);
      const answered = new Promise<number>((resolve) => {
        answerFn.current = resolve;
      });
      const first = await Promise.race([answered.then(() => 'answered' as const), narrate(d.check.q, token, -1, 0, 'think').then((ok) => (ok ? ('read' as const) : ('stopped' as const)))]);
      if (first === 'stopped' && token !== runToken.current) return;
      if (first !== 'answered') {
        setPhase('waiting');
        act('listen');
      }
      const chosen = await answered;
      answerFn.current = null;
      awaitingRef.current = null;
      setAwaiting(null);
      if (token !== runToken.current) return;
      setPhase('playing');
      const guessed = !!quizRef.current[qid]?.guess;
      const ok = chosen === d.check.answer;
      setQuiz({ ...quizRef.current[qid], chosen });
      if (ok && !guessed) {
        skip.current.add(d.sectionStep);
        mastery.current.set(qid, { q: d.check.q, section: d.title, sectionStep: d.sectionStep, check: d.check, status: 'got', correct: true });
      }
      if (!(await narrate(ok && !guessed ? 'Yes — you know this one.' : "No problem — we'll cover that.", token, -1, 0, ok && !guessed ? 'happy' : 'explain'))) return;
    }
    const known = diagnostic.filter((d) => skip.current.has(d.sectionStep)).length;
    const msg =
      known === diagnostic.length
        ? "You know all of this already! I'll skip ahead and we'll finish with practice."
        : known
          ? `You already know ${known} of the ${diagnostic.length} parts, so I'll skip ${known === 1 ? 'that one' : 'those'} and focus on the rest.`
          : "Great — now I know where to start. Let's go.";
    if (!(await narrate(msg, token, -1, 0, known ? 'happy' : 'explain'))) return;
    void runFrom(0);
  }

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

  /** The student's learner model: how each idea went, kept across lessons (and weak ideas brought back later). */
  function saveMastery(items: MasteryItem[]) {
    if (!items.length) return;
    void api('/mastery/lesson', {
      body: { lessonId: id, items: items.map((m) => ({ concept: m.section, outcome: m.status, correct: m.correct ?? m.status !== 'review', guessed: m.guessed, sureWrong: m.sureWrong, check: m.check })) },
    }).catch(() => {});
  }

  /** "I'm guessing" on a question that is waiting for an answer. */
  function toggleGuess(qid: string) {
    const q = quizRef.current[qid];
    if (q && q.chosen === null) setQuiz({ ...q, guess: !q.guess });
  }

  function answer(qid: string, i: number) {
    if (awaitingRef.current !== qid) return;
    // -1 = "I don't know" (for a question in your own words too)
    if (i === -1 && openFn.current) return openFn.current("I don't know");
    if (answerFn.current && !openFn.current) answerFn.current(i);
  }

  /** Something the student said or typed: an answer to the question on the board, or a question. */
  function heardText(t: string) {
    const checking = awaitingRef.current;
    // "not sure" / "I don't know" is an honest answer, never a right one
    if (checking && DONT_KNOW.test(t.trim())) return answer(checking, -1);
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

  /**
   * "I have a question" — at any moment. The tutor notes exactly where it was (half-way through a
   * sentence, or waiting for an answer to a question on the board), reacts straight away, answers on
   * a fresh part of the board, then says "back to where we were" and carries on from that very point.
   */
  async function ask(text: string, audio?: string, image?: string) {
    const at = curRef.current;
    const step = stepsRef.current[at];
    if (!step || (!text.trim() && !audio && !image) || askingRef.current) return;
    if (!ai?.enabled) return toast('Questions need the AI tutor, which is not switched on here yet.');
    askingRef.current = true;
    setAsking(true);
    hf.current?.hold(true);

    // where were we? the rest of the sentence being said, and any question still waiting for an answer
    const tr = track.current;
    let resumeSay = '';
    if (tr && tr.step === at && !tr.t.ended && tr.t.duration > 0) {
      const done = tr.t.time() / tr.t.duration;
      if (done < 0.9) resumeSay = done < 0.12 ? step.say : restFrom(step.say, done);
    }
    const waitingQ = awaitingRef.current;
    const pendingCheck = waitingQ && waitingQ === `c${at}` && step.check ? step.check : null;
    // a question left on the board must be closed properly, or the lesson waits for it forever
    if (waitingQ) {
      answerFn.current = null;
      openFn.current = null;
      awaitingRef.current = null;
      setAwaiting(null);
      if (pendingCheck) {
        const { [waitingQ]: _gone, ...rest } = quizRef.current;
        quizRef.current = rest;
        setQuizzes(rest);
      }
    }
    // the way back is known now, so get its voice ready while the question is answered
    narrator.current?.prefetchAll([BACK_LINE, resumeSay]);

    // stop the lesson where it is and say something while the answer is worked out, as a person would
    const token = ++runToken.current;
    track.current?.t.stop();
    pausedRef.current = false;
    resumeFn.current = null;
    setPhase('playing');
    control.current.sit = false;
    place();
    setCaption(text ? `You asked: ${text}` : image ? `${persona.name} is reading what you wrote…` : 'Listening to your question…');
    const said = image ? 'Let me have a look at what you wrote.' : filler.current;
    // the next "good question" line, ready for next time
    filler.current = pick(THINKING.filter((x) => x !== said));
    narrator.current?.prefetch(filler.current);
    const thinking = narrate(said, token, -1, 0, 'think');
    try {
      const [r] = await Promise.all([api<{ steps: TutorStep[]; heard?: string; usage: any }>(`/tutor/lessons/${id}/ask`, { body: { step: step.lessonIndex, question: text.trim() || undefined, audio, image, tutor: persona.id } }), thinking]);
      updateAiUsage(r.usage);
      const q = text.trim() || r.heard || (image ? 'check what I wrote' : 'your question');
      const heading: BoardItem = { t: 'heading', text: `You asked: ${q.length > 60 ? `${q.slice(0, 57)}…` : q}` };
      const extra: PlayStep[] = r.steps.map((s, k) => ({ ...s, board: k === 0 ? [heading, ...s.board.filter((b) => b.t !== 'clear')] : s.board, lessonIndex: step.lessonIndex, asked: true }));
      // ...then back to the lesson: a fresh column headed "Back to …", the rest of what was being
      // said, and the question that was waiting (asked again)
      if (resumeSay || pendingCheck) {
        const sec = sectionOf(at).title;
        extra.push({ say: BACK_LINE, board: [{ t: 'heading', text: `Back to: ${sec.length > 50 ? `${sec.slice(0, 47)}…` : sec}` }], lessonIndex: step.lessonIndex, asked: true, gesture: 'point', ...(!resumeSay && pendingCheck ? { check: pendingCheck } : {}) });
        if (resumeSay) extra.push({ say: resumeSay, board: [], lessonIndex: step.lessonIndex, asked: true, ...(pendingCheck ? { check: pendingCheck } : {}) });
      }
      // the answer's lines are new: get their voices now so there is no wait between them
      narrator.current?.prefetchAll(extra.map((s) => s.say));
      // finish writing this step, then teach the answer straight after it
      setRevealed(step.board.length);
      const all = [...stepsRef.current.slice(0, at + 1), ...extra, ...stepsRef.current.slice(at + 1)];
      stepsRef.current = all;
      setSteps(all);
      setTyping(false);
      setQuestion('');
      if (token === runToken.current) void runFrom(at + 1);
    } catch (err: any) {
      toast(err.message);
      // the answer didn't come: carry on from exactly where we were (the question again, if one was waiting)
      if (token === runToken.current) void runFrom(at);
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
    // the quick check before the lesson, in its own column at the start
    const diag = Object.keys(quizzes).filter((k) => k.startsWith('d'));
    if (diag.length) {
      out.push({ key: 'diag-h', item: { t: 'heading', text: 'Quick check first' }, draw: 0 });
      for (const k of diag) out.push({ key: `q-${k}`, item: quizzes[k], draw: 0 });
    }
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
          <h1>
            {data.lesson.title}
            {data.lesson.level && data.lesson.level !== 'university' && <span className={`tf-level ${data.lesson.level}`}>{data.lesson.level === 'professor' ? 'Professor' : 'Simple'}</span>}
          </h1>
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
          onGuess={toggleGuess}
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
          <div className="tutor-startbtn">
            <button className="tutor-startmain" onClick={play}>
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
            {data.step === 0 && diagnostic.length >= 2 && (
              <button className="btn small tutor-quizfirst" onClick={() => void runDiagnostic()}>
                <Sparkles size={15} /> Quiz me first — skip what I know
                {knownBefore.size > 0 && <span className="small muted"> · you’ve mastered {knownBefore.size} part{knownBefore.size === 1 ? '' : 's'} before</span>}
              </button>
            )}
          </div>
        )}
        {!follow && !overview && phase !== 'ready' && (
          <button className="tf-follow" onClick={() => setFollow(true)}>
            <LocateFixed size={15} /> Follow {persona.name}
          </button>
        )}
        {showEnd && <LessonEnd id={id} data={data} result={result} mastery={masteryList} onReview={(st) => {
              // go back to that part and ask its questions again (fresh, not already answered)
              const from = Math.max(0, stepsRef.current.indexOf(st));
              quizRef.current = Object.fromEntries(Object.entries(quizRef.current).filter(([k]) => !(k.startsWith('c') && Number(k.slice(1)) >= from)));
              setQuizzes(quizRef.current);
              go(from);
            }} onReplay={() => go(0)} onNext={() => data.next && data.packId && nav(`/tutor/new?mode=lesson&pack=${data.packId}&chunk=${data.next.chunk}`)} onClose={() => setShowEnd(false)} />}
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

function LessonEnd({ id, data, result, mastery, onReview, onReplay, onNext, onClose }: { id: number; data: LessonReply; result: { score: number; total: number; points: number } | null; mastery: MasteryItem[]; onReview: (step: PlayStep) => void; onReplay: () => void; onNext: () => void; onClose: () => void }) {
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
      {mastery.length > 0 && <MasteryMap items={mastery} onReview={onReview} />}
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

/** How well each part of the lesson was understood, with a way to go over the weak parts again. */
function MasteryMap({ items, onReview }: { items: MasteryItem[]; onReview: (step: PlayStep) => void }) {
  // one row per section: its weakest idea decides its colour
  const rank = { got: 0, helped: 1, review: 2 } as const;
  const sections = new Map<string, { step: PlayStep | null; status: MasteryItem['status']; n: number }>();
  for (const m of items) {
    const cur = sections.get(m.section);
    if (!cur) sections.set(m.section, { step: m.sectionStep, status: m.status, n: 1 });
    else sections.set(m.section, { ...cur, n: cur.n + 1, status: rank[m.status] > rank[cur.status] ? m.status : cur.status });
  }
  const got = items.filter((m) => m.status !== 'review').length;
  const sure = items.filter((m) => m.sureWrong).length;
  const lucky = items.filter((m) => m.guessed).length;
  const label = { got: 'Understood', helped: 'Got it with help', review: 'Go over again' } as const;
  return (
    <div className="mastery">
      <p className="mastery-head">
        <strong>
          You understood {got} of {items.length} ideas
        </strong>
        {got === items.length ? ' — every one.' : '.'}
      </p>
      {(sure > 0 || lucky > 0) && (
        <p className="mastery-cal">
          {sure > 0 && <>You were sure of {sure === 1 ? 'one answer' : `${sure} answers`} that turned out wrong — those are the ideas worth untangling. </>}
          {lucky > 0 && <>{lucky === 1 ? 'One right answer was' : `${lucky} right answers were`} a guess, so {lucky === 1 ? 'it comes' : 'they come'} back for a check-in.</>}
        </p>
      )}
      <ul>
        {[...sections.entries()].map(([title, s]) => (
          <li key={title} className={`m-${s.status}`}>
            <span className="m-dot" aria-hidden />
            <span className="m-title">{title}</span>
            <span className="m-status">{label[s.status]}</span>
            {s.status !== 'got' && s.step && (
              <button className="btn small" onClick={() => onReview(s.step!)}>
                Go over it again
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mastery-foot">Saved to your learning map. I’ll check these again in a few days — weak ones tomorrow.</p>
    </div>
  );
}
