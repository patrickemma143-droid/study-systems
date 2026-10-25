import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Box,
  Boxes,
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  GraduationCap,
  Hand,
  Layers3,
  ListChecks,
  MessageCircleQuestion,
  Orbit,
  RotateCcw,
  Scissors,
  Search,
  Send,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/ui';
import { useStudyTimer } from '../lib/usePack';
import { left, updateAiUsage, useAiStatus } from '../lib/ai';
import { AnatomyViewer, SYSTEM_LABEL, SYSTEM_ORDER, type Catalogue, type Region, type Structure, type SystemId, type ViewDir } from '../lib/anatomy/viewer';

const CATALOGUE_VERSION = '2';
const REGIONS: { id: Region; label: string }[] = [
  { id: 'all', label: 'Whole body' },
  { id: 'head', label: 'Head & neck' },
  { id: 'trunk', label: 'Trunk' },
  { id: 'upper', label: 'Upper limb' },
  { id: 'lower', label: 'Lower limb' },
];

interface Described {
  name: string;
  latin: string | null;
  description: string | null;
}
interface AiCard {
  summary: string;
  facts: { label: string; value: string }[];
  clinical: string[];
  mnemonic: string;
  examTips: string[];
  quiz: { q: string; a: string }[];
  cached?: boolean;
}
type Tab = 'systems' | 'info' | 'quiz';
type QuizMode = 'find' | 'name' | 'spotter';
interface QuizQ {
  id: string;
  name: string;
  options?: string[];
}

type LabelMode = 'all' | 'tap' | 'test';
interface PinView {
  name: string;
  x: number;
  y: number;
  facing: boolean;
}
interface PlacedLabel extends PinView {
  lx: number;
  ly: number;
  left: boolean;
}
const shuffle = <T,>(a: T[]) =>
  a
    .map((x) => [Math.random(), x] as const)
    .sort((p, q) => p[0] - q[0])
    .map(([, x]) => x);

/** Atlas-style labels: two columns at the sides, in the same order as their points, joined by lines. */
function placeLabels(pins: PinView[], W: number, H: number, width: number): PlacedLabel[] {
  if (!pins.length) return [];
  const xs = pins.map((p) => p.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const out: PlacedLabel[] = [];
  for (const left of [true, false]) {
    // each pin goes to exactly one side; the right column starts below the tool buttons
    const col = pins.filter((p) => p.x < mid === left).sort((a, b) => a.y - b.y);
    if (!col.length) continue;
    const top = left ? 70 : Math.min(240, H * 0.4);
    const bottom = H - 62;
    const gap = col.length > 1 ? Math.max(13, Math.min(21, (bottom - top) / (col.length - 1))) : 21;
    const ys = col.map((p) => p.y);
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + gap : top);
    for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - gap : bottom);
    col.forEach((p, i) => out.push({ ...p, left, ly: ys[i], lx: left ? 8 : W - 8 - width }));
  }
  return out;
}

const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;
const sideLabel = (s?: Structure) => (s?.side ? ` (${s.side})` : '');

export default function Anatomy() {
  useStudyTimer('anatomy', null);
  const toast = useToast();
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<AnatomyViewer | null>(null);
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, force] = useState(0);
  const [progress, setProgress] = useState<Partial<Record<SystemId, number>>>({});
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('systems');
  const [query, setQuery] = useState('');
  const [peeling, setPeeling] = useState(false);
  const [section, setSection] = useState<{
    axis: 'none' | 'x' | 'y' | 'z';
    pos: number;
  }>({ axis: 'none', pos: 0 });
  const [labelPos, setLabelPos] = useState<{ x: number; y: number } | null>(null);
  const [marks, setMarks] = useState<{ name: string; x: number; y: number }[]>([]);
  const [quiz, setQuiz] = useState<{
    mode: QuizMode;
    qs: QuizQ[];
    i: number;
    answers: { id: string; answer: string }[];
    feedback: string | null;
    result: any;
  } | null>(null);
  const [typed, setTyped] = useState('');
  const [asked, setAsked] = useState<{
    question: string;
    answer: string;
    structures: string[];
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const aiStatus = useAiStatus();
  const down = useRef<{ x: number; y: number } | null>(null);
  // dismantle, and studying one structure with its labelled parts
  const [moving, setMoving] = useState(false);
  const dragId = useRef<string | null>(null);
  const [labelMode, setLabelMode] = useState<LabelMode>('all');
  const [part, setPart] = useState<string | null>(null);
  const [pins, setPins] = useState<PinView[]>([]);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [ptest, setPtest] = useState<{
    order: string[];
    i: number;
    options: string[];
    feedback: string | null;
    score: number;
    done: boolean;
  } | null>(null);

  // the catalogue of every structure (small), then the viewer
  useEffect(() => {
    fetch(`/anatomy/catalogue.json?v=${CATALOGUE_VERSION}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('The 3D atlas could not be loaded.'))))
      .then(setCat)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!cat || !host.current) return;
    let v: AnatomyViewer;
    try {
      v = new AnatomyViewer(host.current, cat);
    } catch {
      setError('This device could not start 3D graphics (WebGL). Try another browser, such as Chrome.');
      return;
    }
    viewer.current = v;
    (window as any).__anatomy = v; // handy for support and automated checks
    const off = v.on(() => force((n) => n + 1));
    // the skeleton first: it is the frame everything else hangs on
    void toggle('skeleton', true);
    return () => {
      off();
      v.dispose();
      viewer.current = null;
    };
  }, [cat]);

  // keep the label on the selected structure as the camera moves
  useEffect(() => {
    const v = viewer.current;
    if (!v || !selId || v.studyId) {
      setLabelPos(null);
      setMarks([]);
      return;
    }
    // a bone's landmarks (processes, foramina, crests…) as labelled points
    const lms = cat?.structures[selId]?.system === 'skeleton' ? v.partsOf(selId) : [];
    const update = () => {
      const shown = v.isVisible(selId);
      const c = shown ? v.centreOf(selId) : null;
      setLabelPos(c ? v.toScreen(c) : null);
      setMarks(
        shown
          ? lms
              .filter((l) => v.pinFacing(selId, l))
              .slice(0, 20)
              .map((l) => {
                const p = v.toScreen(v.pinNow(selId, l));
                return p ? { name: l.name, ...p } : null;
              })
              .filter((x): x is { name: string; x: number; y: number } => !!x)
          : [],
      );
    };
    update();
    const offR = v.onRender(update);
    const off = v.on(update);
    return () => {
      offR();
      off();
    };
  }, [selId, cat, viewer.current?.studyId]);

  // study mode: every named part of the structure, following it as it turns
  const studyId = viewer.current?.studyId || null;
  useEffect(() => {
    const v = viewer.current;
    if (!v || !studyId) {
      setPins([]);
      return;
    }
    const list = v.partsOf(studyId);
    const update = () => {
      const el = v.renderer.domElement;
      setSize((o) => (o.w === el.clientWidth && o.h === el.clientHeight ? o : { w: el.clientWidth, h: el.clientHeight }));
      setPins(
        list
          .map((pin) => {
            const p = v.toScreen(v.pinNow(studyId, pin));
            return p
              ? {
                  name: pin.name,
                  x: p.x,
                  y: p.y,
                  facing: v.pinFacing(studyId, pin),
                }
              : null;
          })
          .filter((x): x is PinView => !!x),
      );
    };
    update();
    const off = v.onRender(update);
    return () => {
      off();
    };
  }, [studyId]);

  const toggle = useCallback(
    async (sid: SystemId, on: boolean) => {
      const v = viewer.current;
      if (!v) return;
      try {
        if (on && !v.isLoaded(sid)) setProgress((p) => ({ ...p, [sid]: 0 }));
        await v.show(sid, on, (pct) => setProgress((p) => ({ ...p, [sid]: pct })));
        setProgress((p) => {
          const n = { ...p };
          delete n[sid];
          return n;
        });
        if (on && sid === 'skeleton' && v.visibleSystems.size === 1) v.resetView();
      } catch {
        setProgress((p) => {
          const n = { ...p };
          delete n[sid];
          return n;
        });
        toast(`Could not download the ${SYSTEM_LABEL[sid].toLowerCase()}. Check your connection.`);
      }
    },
    [toast],
  );

  const sel = selId && cat ? cat.structures[selId] : undefined;
  const v = viewer.current;
  const studied = studyId && cat ? cat.structures[studyId] : undefined;
  const parts = useMemo(() => (studyId && viewer.current ? viewer.current.partsOf(studyId) : []), [studyId]);

  function startStudy(id: string) {
    if (!v) return;
    setQuiz(null);
    setPeeling(false);
    setMoving(false);
    setPart(null);
    setPtest(null);
    setLabelMode('all');
    setAsked(null);
    setSelId(null);
    v.study(id);
    setTab('info');
  }
  function exitStudy() {
    if (!v) return;
    const id = v.studyId;
    v.endStudy();
    setPart(null);
    setPtest(null);
    if (id) {
      setSelId(id);
      v.select([id]);
    }
  }
  function choosePart(name: string) {
    if (!v || !studyId || ptest) return;
    setPart(name);
    const pin = parts.find((p) => p.name === name);
    if (pin) v.showPin(studyId, pin);
  }
  // test yourself on the parts: a red pin, four names
  function partOptions(name: string) {
    const others = shuffle(parts.map((p) => p.name).filter((n) => n !== name)).slice(0, 3);
    return shuffle([name, ...others]);
  }
  function startPartTest() {
    if (!v || !studyId || parts.length < 4) return;
    const order = shuffle(parts.map((p) => p.name)).slice(0, Math.min(10, parts.length));
    setPart(null);
    setLabelMode('test');
    setPtest({
      order,
      i: 0,
      options: partOptions(order[0]),
      feedback: null,
      score: 0,
      done: false,
    });
    const pin = parts.find((p) => p.name === order[0]);
    if (pin) v.showPin(studyId, pin, true);
    // on a phone the model is above the panel: bring it back into view
    if (window.innerWidth < 760) host.current?.closest('.anat-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function answerPart(o: string) {
    if (!ptest || ptest.feedback || !v || !studyId) return;
    const right = ptest.order[ptest.i];
    const ok = o === right;
    const t = {
      ...ptest,
      score: ptest.score + (ok ? 1 : 0),
      feedback: ok ? 'Correct!' : `It is the ${right.toLowerCase()}`,
    };
    setPtest(t);
    window.setTimeout(
      () => {
        if (t.i + 1 >= t.order.length) {
          setPtest({ ...t, feedback: null, done: true });
          return;
        }
        const next = t.order[t.i + 1];
        setPtest({
          ...t,
          i: t.i + 1,
          options: partOptions(next),
          feedback: null,
        });
        const pin = parts.find((p) => p.name === next);
        if (pin && viewer.current?.studyId) viewer.current.showPin(viewer.current.studyId, pin, true);
      },
      ok ? 700 : 1500,
    );
  }
  const viewButtons: { d: ViewDir; label: string }[] = useMemo(() => {
    const lateral: ViewDir = studied?.side === 'right' ? 'right' : 'left';
    const medial: ViewDir = studied?.side === 'right' ? 'left' : 'right';
    return [
      { d: 'anterior', label: 'Front' },
      { d: 'posterior', label: 'Back' },
      ...(studied?.side
        ? [
            { d: lateral, label: 'Lateral' },
            { d: medial, label: 'Medial' },
          ]
        : [
            { d: 'left' as ViewDir, label: 'Left' },
            { d: 'right' as ViewDir, label: 'Right' },
          ]),
      { d: 'superior', label: 'Top' },
      { d: 'inferior', label: 'Bottom' },
    ];
  }, [studied]);

  function selectId(id: string | null, frame = false) {
    if (!v) return;
    setSelId(id);
    v.select(id ? [id] : [], frame);
    if (id) setTab('info');
  }

  // tap = identify (or peel, or answer a quiz); drag = rotate (or move a piece when dismantled)
  function onPointerDownCapture(e: React.PointerEvent<HTMLDivElement>) {
    down.current = { x: e.clientX, y: e.clientY };
    if (!v || !moving || v.studyId) return;
    const hit = v.pick(e.clientX, e.clientY);
    // runs before the camera controls see the press, so they stay still while a piece moves
    if (hit && v.startDrag(hit.id, e.clientX, e.clientY)) {
      dragId.current = hit.id;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragId.current && v) v.moveDrag(e.clientX, e.clientY);
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = down.current;
    down.current = null;
    if (dragId.current && v) {
      const id = dragId.current;
      dragId.current = null;
      v.endDrag();
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      selectId(id);
      return;
    }
    if (!d || !v || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    if (v.studyId) {
      // a tap on the bone picks the nearest labelled part
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const near = pins
        .filter((p) => p.facing)
        .map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 40) choosePart(near.p.name);
      return;
    }
    const hit = v.pick(e.clientX, e.clientY);
    if (quiz && quiz.mode === 'find' && !quiz.result) {
      if (hit) answerQuiz(hit.structure.name, hit.id);
      return;
    }
    if (!hit) {
      selectId(null);
      return;
    }
    if (peeling) {
      v.peel(hit.id);
      return;
    }
    selectId(hit.id);
  }

  // search across every system's structure names
  const names = useMemo(() => {
    if (!cat) return [] as { name: string; system: SystemId }[];
    const seen = new Map<string, SystemId>();
    for (const s of Object.values(cat.structures)) {
      if (!s.role && !seen.has(s.name)) seen.set(s.name, s.system);
      // whole muscles whose parts are modelled separately ("Biceps brachii muscle" = its two heads)
      if (s.system === 'muscles') for (const g of s.groups || []) if (/ muscle$/i.test(g) && !seen.has(g)) seen.set(g, 'muscles');
      if (s.role && / muscle$/i.test(s.name) && !seen.has(s.name)) seen.set(s.name, 'muscles');
    }
    return [...seen.entries()].map(([name, system]) => ({ name, system })).sort((a, b) => a.name.localeCompare(b.name));
  }, [cat]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const words = q.split(/\s+/);
    return names.filter((n) => words.every((w) => n.name.toLowerCase().includes(w))).slice(0, 12);
  }, [query, names]);

  /** "Which muscles flex the elbow?" — the AI answers and the model lights up the answer. */
  async function askBody(question: string) {
    if (!v || !cat) return;
    setAsking(true);
    try {
      const r = await api<{ answer: string; structures: string[]; usage: any }>('/anatomy/ai/find', { body: { question } });
      updateAiUsage(r.usage);
      setAsked({ question, answer: r.answer, structures: r.structures });
      setQuery('');
      setTab('info');
      setSelId(null);
      const systems = new Set<SystemId>();
      const ids: string[] = [];
      for (const n of r.structures) {
        for (const id of v.idsByName(n)) {
          ids.push(id);
          systems.add(cat.structures[id].system);
        }
      }
      for (const sid of systems) await toggle(sid, true);
      v.select(ids, ids.length > 0, true);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setAsking(false);
    }
  }

  async function goTo(name: string, system: SystemId) {
    if (!v) return;
    setQuery('');
    await toggle(system, true);
    const ids = v.idsByName(name);
    setSelId(ids[0] || null);
    v.select(ids, true);
    setTab('info');
  }

  // ─── quiz on the model ───
  function startQuiz(mode: QuizMode) {
    if (!v || !cat) return;
    const pool = new Map<string, string>();
    for (const id of v.visibleIds()) {
      const s = cat.structures[id];
      if (!s || s.role || s.part || s.name.length > 60) continue;
      if (!pool.has(s.name)) pool.set(s.name, id);
    }
    const entries = [...pool.entries()].sort(() => Math.random() - 0.5).slice(0, 10);
    if (entries.length < 5) {
      toast('Show more of the body first (switch on a system or choose a bigger region).');
      return;
    }
    const allNames = [...pool.keys()];
    const qs: QuizQ[] = entries.map(([name, id]) => {
      if (mode !== 'name') return { id, name };
      const wrong = allNames
        .filter((n) => n !== name)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      return {
        id,
        name,
        options: [name, ...wrong].sort(() => Math.random() - 0.5),
      };
    });
    setPeeling(false);
    setQuiz({ mode, qs, i: 0, answers: [], feedback: null, result: null });
    setTab('quiz');
    setTyped('');
    showQuestion(mode, qs[0]);
  }
  function showQuestion(mode: QuizMode, q: QuizQ) {
    if (!v) return;
    if (mode === 'find') {
      setSelId(null);
      v.select([]);
    } else {
      setSelId(null);
      v.select([q.id], true);
    }
  }
  async function answerQuiz(answer: string, tappedId?: string) {
    if (!quiz || quiz.feedback || !v) return;
    const q = quiz.qs[quiz.i];
    const ok = answer.trim().toLowerCase() === q.name.toLowerCase();
    if (quiz.mode === 'find' && tappedId) v.select(ok ? [tappedId] : [tappedId, ...v.idsByName(q.name).slice(0, 1)]);
    const answers = [...quiz.answers, { id: q.id, answer }];
    const feedback = ok ? 'Correct!' : `It was: ${q.name}${quiz.mode === 'find' ? ' (shown in blue)' : ''}`;
    setQuiz({ ...quiz, answers, feedback });
    window.setTimeout(
      async () => {
        if (quiz.i + 1 < quiz.qs.length) {
          const next = { ...quiz, answers, i: quiz.i + 1, feedback: null };
          setQuiz(next);
          setTyped('');
          showQuestion(quiz.mode, quiz.qs[quiz.i + 1]);
        } else {
          try {
            const r = await api<{
              score: number;
              total: number;
              points: number;
              marked: { id: string; right: string; ok: boolean }[];
            }>('/anatomy/quiz', { body: { mode: quiz.mode, answers } });
            setQuiz({ ...quiz, answers, feedback: null, result: r });
            v.select([]);
          } catch (e: any) {
            toast(e.message);
            setQuiz(null);
          }
        }
      },
      ok ? 700 : 1600,
    );
  }

  if (error) {
    return (
      <div className="sheet empty" style={{ maxWidth: 640, margin: '40px auto' }}>
        <h2>Anatomy 3D</h2>
        <p className="muted">{error}</p>
      </div>
    );
  }

  const q = quiz && !quiz.result ? quiz.qs[quiz.i] : null;
  return (
    <div className="anat">
      <div className="anat-stage">
        <div
          ref={host}
          className={`anat-canvas ${moving ? 'moving' : ''}`}
          onPointerDownCapture={onPointerDownCapture}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragId.current = null;
            v?.endDrag();
          }}
          onDoubleClick={(e) => {
            if (!v || v.studyId || moving || quiz) return;
            const hit = v.pick(e.clientX, e.clientY);
            if (hit) startStudy(hit.id);
          }}
          aria-label="3D model of the human body. Drag to turn, pinch or scroll to zoom, tap a part to name it, double-tap to study it on its own."
          role="img"
        />
        {!cat && <div className="anat-loading">Opening the atlas…</div>}

        {studied && (
          <div className="anat-studybar">
            <button className="btn small" onClick={exitStudy}>
              <ArrowLeft size={14} /> Body
            </button>
            <strong>
              {studied.name}
              {sideLabel(studied)}
            </strong>
            {parts.length > 0 && <span className="small muted">{parts.length} parts</span>}
          </div>
        )}
        {/* search */}
        {!studied && (
          <form
            className="anat-search"
            onSubmit={(e) => {
              e.preventDefault();
              const qq = query.trim();
              if (results.length && results[0].name.toLowerCase() === qq.toLowerCase()) void goTo(results[0].name, results[0].system);
              else if (aiStatus?.enabled && qq.split(/\s+/).length >= 3) void askBody(qq);
              else if (results.length) void goTo(results[0].name, results[0].system);
            }}
          >
            <Search size={16} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={aiStatus?.enabled ? 'Find a part, or ask: which muscles flex the elbow?' : 'Find a bone, muscle, nerve…'}
              aria-label="Find a structure"
            />
            {aiStatus?.enabled && query.trim().split(/\s+/).length >= 3 && (
              <button type="submit" className="btn small primary" disabled={asking} title="Ask the AI and highlight the answer">
                <Sparkles size={14} /> {asking ? '…' : 'Ask'}
              </button>
            )}
            {query && (
              <button type="button" className="btn icon ghost small" aria-label="Clear" onClick={() => setQuery('')}>
                <X size={14} />
              </button>
            )}
            {results.length > 0 && (
              <div className="anat-results" role="listbox">
                {results.map((r) => (
                  <button type="button" key={r.name} role="option" onClick={() => goTo(r.name, r.system)}>
                    {r.name} <span className="muted small">· {SYSTEM_LABEL[r.system]}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        )}

        {/* tools */}
        <div className="anat-tools" role="toolbar" aria-label="Tools">
          <button className="anat-tool" onClick={() => v?.resetView()} title="Reset view" aria-label="Reset view">
            <RotateCcw size={18} />
          </button>
          {studied && (
            <button className="anat-tool" aria-pressed={v?.spinning || false} onClick={() => v?.setSpin(!v.spinning)} title="Spin it slowly" aria-label="Spin">
              <Orbit size={18} />
            </button>
          )}
          <button className="anat-tool" aria-pressed={v?.xrayOn || false} onClick={() => v?.setXray(!v.xrayOn)} title="X-ray: see through to nerves and vessels" aria-label="X-ray">
            <Box size={18} />
          </button>
          <button
            className="anat-tool"
            aria-pressed={section.axis !== 'none'}
            onClick={() => {
              const next = section.axis === 'none' ? 'y' : section.axis === 'y' ? 'x' : section.axis === 'x' ? 'z' : 'none';
              setSection({ axis: next, pos: 0 });
              v?.setSection(next, 0);
            }}
            title="Cross-section (tap again to change the plane)"
            aria-label="Cross-section"
          >
            <Scissors size={18} />
          </button>
          {!studied && (
            <>
              <button
                className="anat-tool"
                aria-pressed={v?.dismantled || false}
                onClick={() => {
                  if (!v) return;
                  if (v.dismantled) {
                    v.reassemble();
                    setMoving(false);
                  } else {
                    setPeeling(false);
                    v.setDismantle(1);
                  }
                }}
                title={v?.dismantled ? 'Put it back together' : 'Dismantle: take the body apart, then tap any piece to study it'}
                aria-label="Dismantle"
              >
                <Boxes size={18} />
              </button>
              {v?.dismantled && (
                <button className="anat-tool" aria-pressed={moving} onClick={() => setMoving((m) => !m)} title="Move pieces: drag a piece to pull it out" aria-label="Move pieces">
                  <Hand size={18} />
                </button>
              )}
              <button
                className="anat-tool"
                aria-pressed={peeling}
                onClick={() => {
                  setMoving(false);
                  setPeeling((p) => !p);
                }}
                title="Dissect: tap parts to remove them"
                aria-label="Dissect mode"
              >
                <Layers3 size={18} />
              </button>
            </>
          )}
          {!studied && (v?.hiddenCount || 0) > 0 && (
            <>
              <button className="anat-tool" onClick={() => v?.undoHide()} title="Undo" aria-label="Undo">
                <Undo2 size={18} />
              </button>
              <button className="anat-tool" onClick={() => v?.showAll()} title="Show everything again" aria-label="Show all">
                <Eye size={18} />
              </button>
            </>
          )}
        </div>

        <div className="anat-bottom">
          {peeling && <div className="anat-hint">Dissect mode: tap a part to remove it. Undo brings it back.</div>}
          {!studied && v?.dismantled && !quiz && (
            <div className="anat-hint">{moving ? 'Drag a piece to move it' : 'Tap a piece, then Study'}</div>
          )}
          {section.axis !== 'none' && !(studied && ptest && !ptest.done) && (
            <div className="anat-slider">
              <span className="small">{section.axis === 'y' ? 'Horizontal cut' : section.axis === 'x' ? 'Side-to-side cut' : 'Front-to-back cut'}</span>
              <input
                type="range"
                min={-100}
                max={100}
                value={Math.round(section.pos * 100)}
                onChange={(e) => {
                  const pos = Number(e.target.value) / 100;
                  setSection({ ...section, pos });
                  v?.setSection(section.axis, pos);
                }}
                aria-label="Move the cut"
              />
            </div>
          )}
          {!studied && v?.dismantled && !quiz && (
            <div className="anat-slider">
              <span className="small">Spread</span>
              <input type="range" min={20} max={150} value={Math.round((v.spread || 1) * 100)} onChange={(e) => v.setDismantle(Number(e.target.value) / 100)} aria-label="How far apart" />
              <button
                className="btn small"
                onClick={() => {
                  v.reassemble();
                  setMoving(false);
                }}
              >
                Reassemble
              </button>
            </div>
          )}
          {studied && ptest && !ptest.done && (
            <div className="anat-quizbar static">
              <div className="small muted">
                Part {ptest.i + 1} of {ptest.order.length} · score {ptest.score}
              </div>
              <strong>Which part is the red pin?</strong>
              {ptest.feedback ? (
                <div className={ptest.feedback === 'Correct!' ? 'ok-text' : 'bad-text'}>{ptest.feedback}</div>
              ) : (
                <div className="anat-options">
                  {ptest.options.map((o) => (
                    <button key={o} className="chip" onClick={() => answerPart(o)}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {studied && !(ptest && !ptest.done) && (
            <div className="anat-views" role="toolbar" aria-label="Views">
              {viewButtons.map((b) => (
                <button key={b.label} onClick={() => v?.viewFrom(b.d)}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {studied &&
          (() => {
            const width = size.w < 500 ? size.w * 0.33 : Math.min(170, Math.max(96, size.w * 0.27));
            const target = ptest && !ptest.done ? ptest.order[ptest.i] : null;
            // all labels: parts on the far side are labelled too, dimmed
            const labelled = labelMode === 'all' ? pins : labelMode === 'tap' ? pins.filter((p) => p.name === part) : [];
            const placed = placeLabels(labelled, size.w, size.h, width);
            return (
              <>
                <svg className="anat-lines" width={size.w} height={size.h} aria-hidden>
                  {placed.map((p) => (
                    <line key={p.name} x1={p.left ? p.lx + width : p.lx} y1={p.ly} x2={p.x} y2={p.y} className={`${p.name === part ? 'sel' : ''} ${p.facing ? '' : 'back'}`} />
                  ))}
                </svg>
                {pins
                  .filter((p) => (target ? p.name === target : true))
                  .map((p) => (
                    <button
                      key={p.name}
                      className={`anat-pin ${p.facing ? '' : 'back'} ${p.name === part ? 'sel' : ''} ${p.name === target ? 'target' : ''}`}
                      style={{ left: p.x, top: p.y }}
                      onClick={() => choosePart(p.name)}
                      aria-label={target ? 'The part to name' : p.name}
                      title={target ? undefined : p.name}
                    />
                  ))}
                {placed.map((p) => (
                  <button key={p.name} className={`anat-plabel ${p.left ? 'l' : ''} ${p.name === part ? 'sel' : ''} ${p.facing ? '' : 'back'}`} style={{ left: p.lx, top: p.ly, width }} onClick={() => choosePart(p.name)}>
                    {p.name}
                  </button>
                ))}
              </>
            );
          })()}
        {!quiz &&
          !studied &&
          marks.map((m) => (
            <div key={m.name} className="anat-mark" style={{ left: m.x, top: m.y }}>
              <span>{m.name}</span>
            </div>
          ))}
        {sel && selId && labelPos && !quiz && !studied && (
          <div className="anat-label" style={{ left: labelPos.x, top: labelPos.y }}>
            {sel.name}
            {sideLabel(sel)}
            <button onClick={() => startStudy(selId)} title="Show only this and its labelled parts">
              Study ›
            </button>
          </div>
        )}

        {q && (
          <div className="anat-quizbar">
            <div className="small muted">
              Question {quiz!.i + 1} of {quiz!.qs.length}
            </div>
            <strong>{quiz!.mode === 'find' ? `Tap the ${q.name.toLowerCase()}` : quiz!.mode === 'name' ? 'What is the part in blue?' : 'Spotter: name the part in blue'}</strong>
            {quiz!.feedback && <div className={quiz!.feedback === 'Correct!' ? 'ok-text' : 'bad-text'}>{quiz!.feedback}</div>}
          </div>
        )}
      </div>

      <aside className="anat-panel">
        {studied && studyId ? (
          <div className="stack">
            <div
              className="row"
              style={{
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <div className="small muted">Studying · drag to turn it, pinch to zoom</div>
                <h2 style={{ margin: '2px 0', fontSize: '1.25rem' }}>
                  {studied.name}
                  {sideLabel(studied)}
                </h2>
              </div>
              <button className="btn small ghost" onClick={exitStudy}>
                <ArrowLeft size={14} /> Body
              </button>
            </div>
            {parts.length > 0 ? (
              <>
                <div className="segmented anat-tabs">
                  <button
                    aria-pressed={labelMode === 'all'}
                    onClick={() => {
                      setPtest(null);
                      setLabelMode('all');
                    }}
                  >
                    All labels
                  </button>
                  <button
                    aria-pressed={labelMode === 'tap'}
                    onClick={() => {
                      setPtest(null);
                      setLabelMode('tap');
                    }}
                  >
                    Tap a part
                  </button>
                  <button aria-pressed={labelMode === 'test'} onClick={startPartTest} disabled={parts.length < 4}>
                    Test me
                  </button>
                </div>
                {ptest?.done && (
                  <div className="sheet tight">
                    <strong style={{ fontSize: '1.15rem' }}>
                      {ptest.score} / {ptest.order.length}
                    </strong>{' '}
                    <span className="small muted">parts named right</span>
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button className="btn small primary" onClick={startPartTest}>
                        Again
                      </button>
                      <button
                        className="btn small"
                        onClick={() => {
                          setPtest(null);
                          setLabelMode('all');
                        }}
                      >
                        Show labels
                      </button>
                    </div>
                  </div>
                )}
                {!(ptest && !ptest.done) && (
                  <div>
                    <div className="label" style={{ marginBottom: 6 }}>
                      Parts ({parts.length})
                    </div>
                    <div className="anat-partlist">
                      {parts.map((p) => (
                        <button key={p.name} aria-pressed={part === p.name} onClick={() => choosePart(p.name)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                The model has no labelled landmarks on this part yet. Turn it around, and use the tutor below.
              </p>
            )}
            {part ? (
              <StructurePanel key={`part-${part}`} s={{ name: part, system: studied.system }} partOf={studied.name} onBack={() => setPart(null)} />
            ) : (
              <StructurePanel key={`study-${studied.name}`} s={studied} compact />
            )}
          </div>
        ) : (
          <>
            <div className="segmented anat-tabs" role="tablist">
              <button role="tab" aria-pressed={tab === 'systems'} onClick={() => setTab('systems')}>
                Systems
              </button>
              <button role="tab" aria-pressed={tab === 'info'} onClick={() => setTab('info')}>
                {sel ? 'Info' : 'Info'}
              </button>
              <button role="tab" aria-pressed={tab === 'quiz'} onClick={() => setTab('quiz')}>
                Quiz
              </button>
            </div>

            {tab === 'systems' && cat && (
              <div className="stack">
                <div className="anat-systems">
                  {SYSTEM_ORDER.map((sid) => {
                    const on = v?.visibleSystems.has(sid) || false;
                    const pct = progress[sid];
                    return (
                      <button key={sid} className={`anat-sys ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(sid, !on)} disabled={pct !== undefined}>
                        <span className="dot" style={{ background: cat.systems[sid]?.colour }} />
                        <span style={{ flex: 1, textAlign: 'left' }}>{SYSTEM_LABEL[sid]}</span>
                        <span className="small muted">{pct !== undefined ? `${pct}%` : v?.isLoaded(sid) ? (on ? 'On' : 'Off') : mb(cat.systems[sid]?.bytes || 0)}</span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>
                    Region
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {REGIONS.map((r) => (
                      <button key={r.id} className="chip" aria-pressed={(v?.region || 'all') === r.id} onClick={() => v?.setRegion(r.id)}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                {v?.visibleSystems.has('muscles') && (
                  <div>
                    <div className="label" style={{ marginBottom: 6 }}>
                      Muscle layer
                    </div>
                    <div className="segmented">
                      <button aria-pressed={v.muscleDepth === 'all'} onClick={() => v.setMuscleDepth('all')}>
                        Superficial
                      </button>
                      <button aria-pressed={v.muscleDepth === 'deep'} onClick={() => v.setMuscleDepth('deep')}>
                        Deep
                      </button>
                    </div>
                    <label className="row small" style={{ gap: 8, marginTop: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={v.showWrappings} onChange={(e) => v.setWrappings(e.target.checked)} /> Show fascia, bursae and tendon sheaths
                    </label>
                  </div>
                )}
                <p className="hint" style={{ margin: 0 }}>
                  Drag to turn the body, pinch or scroll to zoom, two fingers to move. Tap any part to name it. Each system downloads once and then works without data.
                </p>
                <p className="small muted" style={{ margin: 0 }}>
                  3D models: Z-Anatomy (CC BY-SA 4.0), from BodyParts3D © The Database Center for Life Science (CC BY-SA 2.1 JP). Descriptions based on Wikipedia (CC BY-SA).
                </p>
              </div>
            )}

            {tab === 'info' && asked && !sel && (
              <div className="sheet tight ai-card stack">
                <div className="small muted">
                  <Sparkles size={13} style={{ verticalAlign: '-2px' }} /> {asked.question}
                </div>
                <p className="small" style={{ margin: 0 }}>
                  {asked.answer}
                </p>
                {asked.structures.length > 0 && (
                  <div className="row" style={{ gap: 4 }}>
                    {asked.structures.map((n) => (
                      <button key={n} className="chip" onClick={() => goTo(n, cat!.structures[v!.idsByName(n)[0]]?.system || 'skeleton')}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                <button className="btn ghost small" onClick={() => setAsked(null)}>
                  Clear
                </button>
              </div>
            )}
            {tab === 'info' &&
              (sel && selId ? (
                <StructurePanel
                  key={sel.name}
                  s={sel}
                  onHide={() => {
                    v?.hide(v.idsByName(sel.name));
                    setSelId(null);
                  }}
                  onIsolate={() => v?.isolate(v.idsByName(sel.name))}
                  onFocus={() => v?.select(v.idsByName(sel.name), true)}
                  onStudy={() => startStudy(selId)}
                />
              ) : (
                <div className="sheet tight muted small">
                  <Crosshair size={16} style={{ verticalAlign: '-3px' }} /> Tap any part of the body, or search for it, to see what it is.
                </div>
              ))}

            {tab === 'quiz' && (
              <div className="stack">
                {!quiz || quiz.result ? (
                  <>
                    {quiz?.result && (
                      <div className="sheet tight">
                        <strong style={{ fontSize: '1.2rem' }}>
                          {quiz.result.score} / {quiz.result.total}
                        </strong>
                        {quiz.result.points > 0 && <span className="small"> · +{quiz.result.points} Memory points</span>}
                        <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                          {quiz.result.marked
                            .filter((m: any) => !m.ok)
                            .map((m: any) => (
                              <li key={m.id}>
                                <button className="linklike" onClick={() => goTo(m.right, cat!.structures[m.id]?.system || 'skeleton')}>
                                  {m.right}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                    <p className="small muted" style={{ margin: 0 }}>
                      Questions come from what is on screen now. Pick a system and region first, e.g. muscles of the upper limb.
                    </p>
                    <button className="btn" onClick={() => startQuiz('find')}>
                      <Crosshair size={16} /> Find it: tap the named part
                    </button>
                    <button className="btn" onClick={() => startQuiz('name')}>
                      <ListChecks size={16} /> Name it: choose the right name
                    </button>
                    <button className="btn" onClick={() => startQuiz('spotter')}>
                      <Focus size={16} /> Spotter: type the name, like a practical exam
                    </button>
                  </>
                ) : (
                  <div className="stack">
                    {quiz.mode === 'name' && q?.options && (
                      <div className="stack">
                        {q.options.map((o) => (
                          <button key={o} className="option" disabled={!!quiz.feedback} onClick={() => answerQuiz(o)}>
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                    {quiz.mode === 'spotter' && (
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (typed.trim()) void answerQuiz(typed.trim());
                        }}
                      >
                        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type the name" aria-label="Your answer" style={{ flex: 1 }} autoFocus />
                        <button className="btn primary" disabled={!!quiz.feedback}>
                          Check
                        </button>
                      </form>
                    )}
                    {quiz.mode === 'find' && <p className="small muted">Tap the part on the model. Turn and zoom as much as you need.</p>}
                    <button className="btn ghost small" onClick={() => setQuiz(null)}>
                      Stop the quiz
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function StructurePanel({
  s,
  onHide,
  onIsolate,
  onFocus,
  onStudy,
  partOf,
  compact,
  onBack,
}: {
  s: Pick<Structure, 'name' | 'system'> & Partial<Structure>;
  onHide?: () => void;
  onIsolate?: () => void;
  onFocus?: () => void;
  onStudy?: () => void;
  /** a landmark: the bone it is part of */
  partOf?: string;
  /** inside study mode: no zoom/hide buttons */
  compact?: boolean;
  onBack?: () => void;
}) {
  const ai = useAiStatus();
  const [d, setD] = useState<Described | null>(null);
  const [more, setMore] = useState(false);
  const [card, setCard] = useState<AiCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<Described>(`/anatomy/describe?name=${encodeURIComponent(s.name)}`)
      .then(setD)
      .catch(() => setD({ name: s.name, latin: null, description: null }));
  }, [s.name]);

  async function explain() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<AiCard & { usage: any }>('/anatomy/ai/card', {
        body: { name: s.name, system: s.system, of: partOf },
      });
      updateAiUsage(r.usage);
      setCard(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(e: FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    const next = [...chat, { role: 'user' as const, content: msg.trim() }];
    setChat(next);
    setMsg('');
    setBusy(true);
    try {
      const r = await api<{ reply: string; usage: any }>('/anatomy/ai/ask', {
        body: { name: s.name, system: s.system, of: partOf, messages: next },
      });
      updateAiUsage(r.usage);
      setChat([...next, { role: 'assistant', content: r.reply }]);
    } catch (e2: any) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const desc = d?.description || '';
  const short = desc.split('\n').slice(0, 2).join(' ');
  return (
    <div className="stack anat-info">
      {compact ? (
        d?.latin && (
          <div className="small" style={{ fontStyle: 'italic' }}>
            {d.latin}
          </div>
        )
      ) : (
        <div>
          <div className="small muted">
            {partOf ? (
              <>
                Part of the {partOf.toLowerCase()}
                {onBack && (
                  <button className="linklike" onClick={onBack}>
                    {' '}
                    · back to the {partOf.toLowerCase()}
                  </button>
                )}
              </>
            ) : (
              <>
                {SYSTEM_LABEL[s.system]}
                {s.side ? ` · ${s.side} side` : ''}
                {s.role ? ` · ${s.role}` : ''}
              </>
            )}
          </div>
          <h2 style={{ margin: '2px 0', fontSize: partOf ? '1.1rem' : '1.25rem' }}>{s.name}</h2>
          {d?.latin && (
            <div className="small" style={{ fontStyle: 'italic' }}>
              {d.latin}
            </div>
          )}
        </div>
      )}
      {onStudy && (
        <button className="btn primary" onClick={onStudy}>
          <GraduationCap size={16} /> {s.system === 'skeleton' ? 'Study this bone and its parts' : 'Study this on its own in 3D'}
        </button>
      )}
      {!compact && !partOf && (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={onFocus}>
            <Focus size={14} /> Zoom to it
          </button>
          <button className="btn small" onClick={onIsolate}>
            <Eye size={14} /> Only this
          </button>
          <button className="btn small" onClick={onHide}>
            <EyeOff size={14} /> Hide
          </button>
        </div>
      )}
      {desc ? (
        <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
          {more ? desc : short}
          {desc.length > short.length && (
            <button className="linklike" onClick={() => setMore((m) => !m)}>
              {more ? ' Less' : ' More'}
            </button>
          )}
        </div>
      ) : (
        d && <div className="small muted">No description yet{ai?.enabled ? ' — ask the AI below.' : '.'}</div>
      )}
      {!compact && !partOf && s.groups && s.groups.length > 0 && (
        <div className="row" style={{ gap: 4 }}>
          {s.groups.slice(0, 6).map((g) => (
            <span key={g} className="chip small">
              {g}
            </span>
          ))}
        </div>
      )}

      {ai?.enabled && (
        <div className="sheet tight ai-card stack">
          {!card ? (
            <button className="btn primary small" onClick={explain} disabled={busy}>
              <Sparkles size={15} /> {busy ? 'Thinking…' : 'Explain it like my lecturer'}
            </button>
          ) : (
            <>
              <p className="small" style={{ margin: 0 }}>
                {card.summary}
              </p>
              {card.facts.length > 0 && (
                <dl className="anat-facts">
                  {card.facts.map((f) => (
                    <div key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {card.mnemonic && (
                <div className="small">
                  <strong>Remember it:</strong> {card.mnemonic}
                </div>
              )}
              {card.clinical.length > 0 && (
                <div className="small">
                  <strong>Clinical:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {card.clinical.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {card.examTips.length > 0 && (
                <div className="small">
                  <strong>Exam tips:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {card.examTips.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {card.quiz.length > 0 && (
                <details className="lib-sample">
                  <summary className="small">Test yourself ({card.quiz.length})</summary>
                  {card.quiz.map((x, i) => (
                    <details key={i} className="small" style={{ marginTop: 4 }}>
                      <summary>{x.q}</summary>
                      <div className="key-answer">{x.a}</div>
                    </details>
                  ))}
                </details>
              )}
              {card.cached && <span className="small muted">Shared answer: free for you.</span>}
            </>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          <form className="row" onSubmit={ask} style={{ gap: 6 }}>
            <input
              className="input"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={`Ask about the ${s.name.toLowerCase()}${partOf ? ` of the ${partOf.toLowerCase()}` : ''}…`}
              aria-label="Ask the anatomy tutor"
              disabled={busy || left(ai, 'tutor') <= 0}
              style={{ flex: 1 }}
            />
            <button className="btn icon primary" aria-label="Ask" disabled={busy || !msg.trim()}>
              {busy ? <MessageCircleQuestion size={16} /> : <Send size={16} />}
            </button>
          </form>
          {err && (
            <div className="small" style={{ color: 'var(--bad)' }}>
              {err}
            </div>
          )}
        </div>
      )}
      {!partOf && (
        <Link to="/library?q=anatomy" className="small">
          Study this in the Anatomy & Physiology chapters →
        </Link>
      )}
    </div>
  );
}
