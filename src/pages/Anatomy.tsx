import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Box, Crosshair, Eye, EyeOff, Focus, Layers3, ListChecks, MessageCircleQuestion, RotateCcw, Scissors, Search, Send, Sparkles, Undo2, X } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/ui';
import { useStudyTimer } from '../lib/usePack';
import { left, updateAiUsage, useAiStatus } from '../lib/ai';
import { AnatomyViewer, SYSTEM_LABEL, SYSTEM_ORDER, type Catalogue, type Region, type Structure, type SystemId } from '../lib/anatomy/viewer';

const CATALOGUE_VERSION = '1';
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
  const [section, setSection] = useState<{ axis: 'none' | 'x' | 'y' | 'z'; pos: number }>({ axis: 'none', pos: 0 });
  const [labelPos, setLabelPos] = useState<{ x: number; y: number } | null>(null);
  const [marks, setMarks] = useState<{ name: string; x: number; y: number }[]>([]);
  const [quiz, setQuiz] = useState<{ mode: QuizMode; qs: QuizQ[]; i: number; answers: { id: string; answer: string }[]; feedback: string | null; result: any } | null>(null);
  const [typed, setTyped] = useState('');
  const [asked, setAsked] = useState<{ question: string; answer: string; structures: string[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const aiStatus = useAiStatus();
  const down = useRef<{ x: number; y: number } | null>(null);

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
    if (!v || !selId) {
      setLabelPos(null);
      setMarks([]);
      return;
    }
    // a bone's landmarks (processes, foramina, crests…) as labelled points
    const s = cat?.structures[selId];
    const lms = s && s.system === 'skeleton' ? (cat?.landmarks || [])
            .filter((l) => {
              if (l.system !== 'skeleton' || l.name.toLowerCase() === s.name.toLowerCase()) return false;
              const bone = s.name.toLowerCase();
              const named = new RegExp(`\\b${bone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(l.name.toLowerCase()) || (l.groups || []).some((g) => g.toLowerCase().includes(bone));
              return named && v.isNear(selId, l.p);
            })
            .slice(0, 16) : [];
    const update = () => {
      const c = v.isVisible(selId) ? v.centreOf(selId) : null;
      setLabelPos(c ? v.toScreen(c) : null);
      setMarks(
        v.isVisible(selId)
          ? lms
              .map((l) => {
                const p = v.pointToScreen(l.p);
                return p ? { name: l.name, ...p } : null;
              })
              .filter((x): x is { name: string; x: number; y: number } => !!x)
          : [],
      );
    };
    update();
    v.controls.addEventListener('change', update);
    const off = v.on(update);
    return () => {
      v.controls.removeEventListener('change', update);
      off();
    };
  }, [selId, cat]);

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

  function selectId(id: string | null, frame = false) {
    if (!v) return;
    setSelId(id);
    v.select(id ? [id] : [], frame);
    if (id) setTab('info');
  }

  // tap = identify (or peel, or answer a quiz); drag = rotate
  function onPointerDown(e: React.PointerEvent) {
    down.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = down.current;
    down.current = null;
    if (!d || !v || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
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
      const wrong = allNames.filter((n) => n !== name).sort(() => Math.random() - 0.5).slice(0, 3);
      return { id, name, options: [name, ...wrong].sort(() => Math.random() - 0.5) };
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
    window.setTimeout(async () => {
      if (quiz.i + 1 < quiz.qs.length) {
        const next = { ...quiz, answers, i: quiz.i + 1, feedback: null };
        setQuiz(next);
        setTyped('');
        showQuestion(quiz.mode, quiz.qs[quiz.i + 1]);
      } else {
        try {
          const r = await api<{ score: number; total: number; points: number; marked: { id: string; right: string; ok: boolean }[] }>('/anatomy/quiz', { body: { mode: quiz.mode, answers } });
          setQuiz({ ...quiz, answers, feedback: null, result: r });
          v.select([]);
        } catch (e: any) {
          toast(e.message);
          setQuiz(null);
        }
      }
    }, ok ? 700 : 1600);
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
        <div ref={host} className="anat-canvas" onPointerDown={onPointerDown} onPointerUp={onPointerUp} aria-label="3D model of the human body. Drag to turn, pinch or scroll to zoom, tap a part to name it." role="img" />
        {!cat && <div className="anat-loading">Opening the atlas…</div>}

        {/* search */}
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={aiStatus?.enabled ? 'Find a part, or ask: which muscles flex the elbow?' : 'Find a bone, muscle, nerve…'} aria-label="Find a structure" />
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

        {/* tools */}
        <div className="anat-tools" role="toolbar" aria-label="Tools">
          <button className="anat-tool" onClick={() => v?.resetView()} title="Reset view" aria-label="Reset view">
            <RotateCcw size={18} />
          </button>
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
          <button className="anat-tool" aria-pressed={peeling} onClick={() => setPeeling((p) => !p)} title="Dissect: tap parts to remove them" aria-label="Dissect mode">
            <Layers3 size={18} />
          </button>
          {(v?.hiddenCount || 0) > 0 && (
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

        {section.axis !== 'none' && (
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
        {peeling && <div className="anat-hint">Dissect mode: tap a part to remove it. Undo brings it back.</div>}

        {!quiz &&
          marks.map((m) => (
            <div key={m.name} className="anat-mark" style={{ left: m.x, top: m.y }}>
              <span>{m.name}</span>
            </div>
          ))}
        {sel && labelPos && !quiz && (
          <div className="anat-label" style={{ left: labelPos.x, top: labelPos.y }}>
            {sel.name}
            {sideLabel(sel)}
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
      </aside>
    </div>
  );
}

function StructurePanel({ s, onHide, onIsolate, onFocus }: { s: Structure; onHide: () => void; onIsolate: () => void; onFocus: () => void }) {
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
      const r = await api<AiCard & { usage: any }>('/anatomy/ai/card', { body: { name: s.name, system: s.system } });
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
      const r = await api<{ reply: string; usage: any }>('/anatomy/ai/ask', { body: { name: s.name, system: s.system, messages: next } });
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
      <div>
        <div className="small muted">
          {SYSTEM_LABEL[s.system]}
          {s.side ? ` · ${s.side} side` : ''}
          {s.role ? ` · ${s.role}` : ''}
        </div>
        <h2 style={{ margin: '2px 0', fontSize: '1.25rem' }}>{s.name}</h2>
        {d?.latin && <div className="small" style={{ fontStyle: 'italic' }}>{d.latin}</div>}
      </div>
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
      {s.groups && s.groups.length > 0 && (
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
            <input className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Ask about the ${s.name.toLowerCase()}…`} aria-label="Ask the anatomy tutor" disabled={busy || left(ai, 'tutor') <= 0} style={{ flex: 1 }} />
            <button className="btn icon primary" aria-label="Ask" disabled={busy || !msg.trim()}>
              {busy ? <MessageCircleQuestion size={16} /> : <Send size={16} />}
            </button>
          </form>
          {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
        </div>
      )}
      <Link to="/library?q=anatomy" className="small">
        Study this in the Anatomy & Physiology chapters →
      </Link>
    </div>
  );
}
