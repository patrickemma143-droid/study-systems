// The tutor on the board: an original anime / cartoon character drawn in SVG with a simple
// skeleton (hips, body, head, arms with elbows, legs with knees). Every joint is moved by a spring
// towards a pose, so the character can walk to where it is writing, point at the board, count on its
// fingers, think, cheer, wave, and sit down cross-legged to listen when the student talks — then
// stand back up. Its mouth follows the voice sound by sound (see lib/tutor/visemes.ts).
//
// Everything moves by writing SVG attributes in an animation frame (no React re-render per frame).
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { tutorById, type TutorLook } from '../../shared/tutors';
import { REST, type Mouth } from '../lib/tutor/visemes';

export type Act = 'idle' | 'explain' | 'point' | 'emphasis' | 'think' | 'happy' | 'wave' | 'count' | 'write' | 'listen' | 'sad';

export interface CharacterControl {
  /** where the character should stand, in px from the left of its layer */
  x: number;
  /** stand, or sit cross-legged on the floor (listening) */
  sit: boolean;
  act: Act;
  /** which side the thing it is writing or pointing at is on */
  side: 'left' | 'right';
  speaking: boolean;
  /** bump to replay a one-off reaction (jump for joy, nod…) */
  pulse: number;
}

// ─── poses ───────────────────────────────────────────────────────────────────────────────────────
// Angles in degrees. Arms and legs: 0 hangs straight down, positive swings outwards (away from the
// body). Forearms and shins are relative to their upper bone. A = the arm/leg on the screen's left.
interface Pose {
  hipY: number;
  lean: number;
  head: number;
  armA: number;
  foreA: number;
  armB: number;
  foreB: number;
  thighA: number;
  shinA: number;
  thighB: number;
  shinB: number;
  brow: number;
  smile: number;
  turn: number;
  lookX: number;
  lookY: number;
}
type K = keyof Pose;
const KEYS: K[] = ['hipY', 'lean', 'head', 'armA', 'foreA', 'armB', 'foreB', 'thighA', 'shinA', 'thighB', 'shinB', 'brow', 'smile', 'turn', 'lookX', 'lookY'];

const STAND: Pose = { hipY: 0, lean: 0, head: 0, armA: 9, foreA: -12, armB: 9, foreB: -12, thighA: 4, shinA: -2, thighB: 4, shinB: -2, brow: 0, smile: 0.35, turn: 0, lookX: 0, lookY: 0 };
const SIT: Partial<Pose> = { hipY: 60, thighA: 80, shinA: -152, thighB: 80, shinB: -152, armA: 30, foreA: -46, armB: 30, foreB: -46 };

/** arm angles for each act, with the "near" arm (towards the board) and the "far" one */
function actArms(act: Act, t: number): { near: [number, number]; far: [number, number]; extra?: Partial<Pose> } {
  switch (act) {
    case 'explain':
      return { near: [24 + Math.sin(t * 2.1) * 6, 76 + Math.sin(t * 2.6) * 10], far: [22 + Math.sin(t * 1.7 + 1) * 5, 70 + Math.sin(t * 2.3 + 1) * 10], extra: { brow: 0.25 } };
    case 'point':
      return { near: [104, 8], far: [30, -96], extra: { brow: 0.3, lookX: 0.6 } };
    case 'write':
      return { near: [96 + Math.sin(t * 9) * 3, 22 + Math.sin(t * 13) * 7], far: [12, -24], extra: { lookX: 0.8, lookY: -0.2 } };
    case 'emphasis':
      return { near: [44 + Math.sin(t * 6) * 4, 112], far: [44 + Math.sin(t * 6 + 0.4) * 4, 112], extra: { brow: 0.9, smile: 0.5 } };
    case 'count':
      return { near: [12, -148 + Math.sin(t * 5) * 8], far: [10, -16], extra: { brow: 0.3 } };
    case 'think':
      return { near: [16, -24], far: [18, -164], extra: { brow: -0.5, head: 8, lookX: -0.5, lookY: -0.8, smile: 0.1 } };
    case 'happy':
      return { near: [150, 18], far: [150, 18], extra: { brow: 1, smile: 1 } };
    case 'wave':
      return { near: [8, -10], far: [122, 32 + Math.sin(t * 9) * 26], extra: { smile: 0.9, brow: 0.5 } };
    case 'listen':
      return { near: [16, -58], far: [16, -58], extra: { head: 7 + Math.sin(t * 0.8) * 2, smile: 0.45, brow: 0.2 } };
    case 'sad':
      return { near: [6, -8], far: [6, -8], extra: { brow: -0.7, smile: -0.3, head: -4, lookY: 0.6 } };
    default:
      return { near: [9 + Math.sin(t * 1.1) * 2, -12], far: [9 + Math.sin(t * 1.3 + 2) * 2, -12] };
  }
}

// ─── drawing ─────────────────────────────────────────────────────────────────────────────────────
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
};
const INK = '#1e2240';

// body measurements (units); the feet stand on y = 0
const HIP = 80;
const TORSO = 62;
const UPPER = 33;
const FORE = 30;
const THIGH = 40;
const SHIN = 38;
const HEAD_R = 40;

function headShape(look: TutorLook) {
  if (look.style === 'robot') return <rect x={-40} y={-40} width={80} height={78} rx={22} fill={look.skin} stroke={shade(look.skin, -0.35)} strokeWidth={2.5} />;
  if (look.style === 'cartoon') return <ellipse cx={0} cy={2} rx={39} ry={41} fill={look.skin} stroke={shade(look.skin, -0.3)} strokeWidth={1.6} />;
  return <path d="M-38,-8 C-38,-52 38,-52 38,-8 C38,16 18,38 0,43 C-18,38 -38,16 -38,-8 Z" fill={look.skin} stroke={shade(look.skin, -0.28)} strokeWidth={1.4} />;
}

function hairBack(look: TutorLook): ReactNode {
  const c = look.hair;
  const d = shade(c, -0.25);
  switch (look.hairStyle) {
    case 'long':
      return <path d="M-45,-18 C-52,-66 52,-66 45,-18 L50,74 C30,84 -30,84 -50,74 Z" fill={c} stroke={d} strokeWidth={1.5} />;
    case 'twintails':
      return (
        <g fill={c} stroke={d} strokeWidth={1.5}>
          <path d="M-36,-34 C-74,-30 -82,30 -62,80 C-58,60 -50,40 -40,20 Z" />
          <path d="M36,-34 C74,-30 82,30 62,80 C58,60 50,40 40,20 Z" />
          <circle cx={-36} cy={-32} r={6} fill={look.trim} stroke="none" />
          <circle cx={36} cy={-32} r={6} fill={look.trim} stroke="none" />
          <path d="M-42,-14 C-48,-62 48,-62 42,-14 L40,10 L-40,10 Z" />
        </g>
      );
    case 'puff':
      return (
        <g fill={c} stroke={d} strokeWidth={1.5}>
          <circle cx={0} cy={-60} r={28} />
          <circle cx={-16} cy={-52} r={18} />
          <circle cx={16} cy={-52} r={18} />
        </g>
      );
    case 'messy':
      return <path d="M-44,-10 C-50,-60 50,-60 44,-10 L42,20 L-42,20 Z" fill={c} stroke={d} strokeWidth={1.5} />;
    case 'spiky':
      return <path d="M-42,-6 C-46,-50 46,-50 42,-6 L40,14 L-40,14 Z" fill={c} />;
    default:
      return null;
  }
}

function hairFront(look: TutorLook): ReactNode {
  const c = look.hair;
  const d = shade(c, -0.3);
  const hi = shade(c, 0.35);
  switch (look.hairStyle) {
    case 'long':
      return (
        <g>
          <path d="M-43,-8 C-48,-60 48,-60 43,-8 L37,-4 L31,-22 L23,-6 L14,-26 L5,-9 L-5,-27 L-14,-8 L-23,-24 L-32,-5 Z" fill={c} stroke={d} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M-43,-12 C-47,10 -44,32 -36,44 L-33,6 Z M43,-12 C47,10 44,32 36,44 L33,6 Z" fill={c} stroke={d} strokeWidth={1.4} />
          <path d="M-20,-40 C-10,-46 6,-46 16,-40" stroke={hi} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.7} />
        </g>
      );
    case 'spiky':
      return (
        <g>
          <path d="M-45,-2 L-52,-30 L-37,-28 L-42,-58 L-23,-45 L-17,-72 L-3,-51 L10,-74 L16,-49 L33,-63 L31,-39 L50,-36 L41,-12 L31,-25 L22,-9 L12,-28 L1,-12 L-9,-30 L-19,-10 L-29,-27 Z" fill={c} stroke={d} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M-14,-56 L-6,-44 M8,-60 L12,-46" stroke={hi} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case 'twintails':
      return <path d="M-41,-10 C-46,-58 46,-58 41,-10 L35,-6 L28,-20 L18,-5 L8,-22 L-2,-6 L-12,-22 L-22,-6 L-31,-20 Z" fill={c} stroke={d} strokeWidth={1.4} strokeLinejoin="round" />;
    case 'messy':
      return (
        <g>
          <path d="M-44,-4 C-52,-40 -30,-62 0,-60 C32,-62 54,-38 44,-4 C40,-18 36,-14 30,-24 C26,-10 20,-12 14,-28 C8,-12 0,-10 -6,-26 C-12,-8 -20,-10 -24,-24 C-30,-10 -36,-12 -44,-4 Z" fill={c} stroke={d} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M-40,-30 C-52,-34 -56,-24 -50,-16 M40,-32 C52,-38 58,-28 50,-18" stroke={d} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'puff':
      return (
        <g>
          <path d="M-40,-4 C-44,-54 44,-54 40,-4 C34,-28 -34,-28 -40,-4 Z" fill={c} stroke={d} strokeWidth={1.4} />
          <path d="M-36,-30 C-20,-42 20,-42 36,-30" stroke={look.trim} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'short':
      return <path d="M-40,-6 C-43,-50 43,-50 40,-6 C36,-24 26,-30 0,-32 C-26,-30 -36,-24 -40,-6 Z" fill={c} stroke={d} strokeWidth={1.4} />;
    case 'tufts':
      return (
        <g fill={c} stroke={shade(c, -0.2)} strokeWidth={1.2}>
          <circle cx={-40} cy={-12} r={9} />
          <circle cx={-44} cy={-2} r={8} />
          <circle cx={-36} cy={-22} r={7} />
          <circle cx={40} cy={-12} r={9} />
          <circle cx={44} cy={-2} r={8} />
          <circle cx={36} cy={-22} r={7} />
          <path d="M-6,-42 C-2,-52 4,-52 2,-42" fill="none" strokeWidth={2} />
        </g>
      );
    case 'none':
      return (
        <g>
          <line x1={0} y1={-40} x2={0} y2={-56} stroke={shade(look.skin, -0.4)} strokeWidth={3} />
          <circle cx={0} cy={-60} r={6} fill={look.trim} className="robot-bulb" />
        </g>
      );
    default:
      return null;
  }
}

/** Torso, drawn from the hip (0,0) up to the neck (0,-TORSO). */
function body(look: TutorLook): ReactNode {
  const { top, trim } = look;
  const edge = shade(top, -0.3);
  const shape = 'M-22,-60 C-29,-58 -29,-48 -26,-38 L-23,2 L23,2 L26,-38 C29,-48 29,-58 22,-60 Z';
  switch (look.outfit) {
    case 'blazer':
      return (
        <g>
          <path d={shape} fill={top} stroke={edge} strokeWidth={1.5} />
          <path d="M-9,-60 L0,-34 L9,-60 Z" fill="#fff" />
          <path d="M-9,-60 L-3,-26 L-14,-40 M9,-60 L3,-26 L14,-40" stroke={shade(top, -0.4)} strokeWidth={1.6} fill="none" />
          <circle cx={0} cy={-18} r={2} fill={trim} />
          <circle cx={0} cy={-8} r={2} fill={trim} />
        </g>
      );
    case 'hoodie':
      return (
        <g>
          <path d={shape} fill={top} stroke={edge} strokeWidth={1.5} />
          <path d="M-18,-60 C-14,-48 14,-48 18,-60" stroke={edge} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M-5,-52 L-6,-36 M5,-52 L6,-36" stroke={trim} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M-16,-16 L16,-16 L13,0 L-13,0 Z" fill={shade(top, -0.12)} stroke={edge} strokeWidth={1} />
        </g>
      );
    case 'sailor':
      return (
        <g>
          <path d={shape} fill={top} stroke="#c9cbe0" strokeWidth={1.5} />
          <path d="M-24,-58 L0,-30 L24,-58 L18,-62 L0,-42 L-18,-62 Z" fill={look.legs} />
          <path d="M-7,-34 L0,-26 L7,-34 L4,-20 L0,-24 L-4,-20 Z" fill={trim} />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path d={shape} fill={top} stroke={edge} strokeWidth={1.5} />
          <path d="M0,-58 L0,2" stroke={edge} strokeWidth={1.2} />
          <path d="M-20,-62 C-10,-52 10,-52 20,-62 L20,-54 C10,-44 -10,-44 -20,-54 Z" fill={trim} />
          <path d="M8,-50 L14,-22 L6,-22 L2,-48 Z" fill={trim} />
        </g>
      );
    case 'cardigan':
      return (
        <g>
          <path d={shape} fill={top} stroke={edge} strokeWidth={1.5} />
          <path d="M-8,-60 L-5,2 L5,2 L8,-60 Z" fill={trim} />
          <path d="M-4,-60 L0,-50 L4,-60" stroke={shade(trim, -0.3)} fill="none" strokeWidth={1.2} />
          {[-40, -28, -16].map((y) => (
            <circle key={y} cx={-8} cy={y} r={1.8} fill={shade(top, -0.4)} />
          ))}
        </g>
      );
    case 'labcoat':
      return (
        <g>
          <path d="M-22,-60 C-29,-58 -29,-48 -26,-38 L-28,26 L28,26 L26,-38 C29,-48 29,-58 22,-60 Z" fill="#fbfbff" stroke="#c9cbe0" strokeWidth={1.5} />
          <path d="M-8,-60 L0,-40 L8,-60 Z" fill="#dfe6ff" />
          <path d="M-2,-46 L2,-46 L4,-18 L0,-12 L-4,-18 Z" fill={trim} />
          <path d="M-8,-60 L-2,-30 L-2,26 M8,-60 L2,-30" stroke="#c9cbe0" strokeWidth={1.4} fill="none" />
          <rect x={10} y={-34} width={10} height={8} rx={1.5} fill="none" stroke="#c9cbe0" strokeWidth={1.2} />
        </g>
      );
    case 'jacket':
      return (
        <g>
          <path d={shape} fill={top} stroke={edge} strokeWidth={1.5} />
          <path d="M0,-58 L0,2" stroke={shade(top, -0.4)} strokeWidth={1.4} />
          <path d="M-25,-44 L-22,0 M25,-44 L22,0" stroke={trim} strokeWidth={3} />
          <path d="M-12,-62 L0,-54 L12,-62" stroke={trim} strokeWidth={3} fill="none" />
        </g>
      );
    case 'robot':
      return (
        <g>
          <rect x={-25} y={-62} width={50} height={64} rx={12} fill={top} stroke={shade(top, -0.35)} strokeWidth={2} />
          <rect x={-12} y={-46} width={24} height={16} rx={4} fill="#1e2240" />
          <circle cx={-5} cy={-38} r={2.6} fill={trim} className="robot-bulb" />
          <circle cx={4} cy={-38} r={2.6} fill="#ffd166" />
          <path d="M-16,-18 L16,-18 M-16,-10 L16,-10" stroke={shade(top, -0.3)} strokeWidth={1.4} />
        </g>
      );
    default:
      return <path d={shape} fill={top} stroke={edge} strokeWidth={1.5} />;
  }
}

interface Refs {
  root: SVGGElement | null;
  hips: SVGGElement | null;
  torso: SVGGElement | null;
  headF: SVGGElement | null;
  headB: SVGGElement | null;
  face: SVGGElement | null;
  armA: SVGGElement | null;
  foreA: SVGGElement | null;
  armB: SVGGElement | null;
  foreB: SVGGElement | null;
  thighA: SVGGElement | null;
  shinA: SVGGElement | null;
  thighB: SVGGElement | null;
  shinB: SVGGElement | null;
  irisA: SVGGElement | null;
  irisB: SVGGElement | null;
  lidA: SVGGElement | null;
  lidB: SVGGElement | null;
  browA: SVGPathElement | null;
  browB: SVGPathElement | null;
  mouthIn: SVGPathElement | null;
  mouthLip: SVGPathElement | null;
  teeth: SVGRectElement | null;
  tongue: SVGEllipseElement | null;
  shadow: SVGEllipseElement | null;
}

function limb(color: string, len: number, width: number, end?: ReactNode, outline?: string) {
  return (
    <>
      {outline && <line x1={0} y1={0} x2={0} y2={len} stroke={outline} strokeWidth={width + 2.4} strokeLinecap="round" />}
      <line x1={0} y1={0} x2={0} y2={len} stroke={color} strokeWidth={width} strokeLinecap="round" />
      {end}
    </>
  );
}

/** The mouth path for a set of mouth shapes. */
function mouthPaths(m: Mouth, smile: number, style: TutorLook['style']) {
  const w = (style === 'cartoon' ? 10 : 8) + m.wide * 6 - m.round * 4.5 + Math.max(0, smile) * 2;
  const h = m.open * (style === 'cartoon' ? 13 : 11) + m.round * 2;
  const lift = smile * 3.2;
  if (h < 1.2 || m.press > 0.6) {
    // closed: a line, curving up into a smile (or down when sad)
    const line = `M${-w},${-lift} Q0,${lift * 0.9 + 1} ${w},${-lift}`;
    return { inner: '', lip: line, teethH: 0, tongue: 0, w, h: 0 };
  }
  const top = -h * 0.3 - lift * 0.3;
  const bot = h * 0.75;
  const inner = `M${-w},${-lift} Q0,${top * 1.7} ${w},${-lift} Q${w * 0.55},${bot * 1.25} 0,${bot * 1.3} Q${-w * 0.55},${bot * 1.25} ${-w},${-lift} Z`;
  return { inner, lip: inner, teethH: m.teeth * Math.min(h * 0.42, 4), tongue: m.tongue, w, h };
}

export function TutorCharacter({
  tutor,
  control,
  mouth,
  height = 220,
  portrait = false,
  still = false,
  className = '',
}: {
  tutor: string;
  /** read every frame (keep it in a ref so it can change without re-rendering) */
  control?: { current: CharacterControl };
  /** the mouth right now (lip sync) */
  mouth?: { current: (() => Mouth) | null };
  /** px */
  height?: number;
  /** head and shoulders only (for faces and the picker) */
  portrait?: boolean;
  /** draw once, no animation */
  still?: boolean;
  className?: string;
}) {
  const persona = tutorById(tutor);
  const look = persona.look;
  const uid = useId().replace(/:/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const r = useRef<Refs>({} as Refs);
  const set = <T extends keyof Refs>(k: T) => (el: Refs[T] | null) => {
    r.current[k] = el as Refs[T];
  };

  useEffect(() => {
    const R = r.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const pose: Pose = { ...STAND };
    const vel: Record<K, number> = Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<K, number>;
    let x = control?.current.x ?? 0;
    let placed = false;
    let walk = 0;
    let lastPulse = control?.current.pulse ?? 0;
    let jumpT = -10;
    let nextBlink = 1.5;
    let blinkT = -1;
    let lookT = 0;
    let glance = { x: 0, y: 0 };
    let m: Mouth = REST;
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const tr = (el: Element | null, v: string) => el?.setAttribute('transform', v);
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const c = control?.current;
      const target: Pose = { ...STAND };
      let walking = false;
      let dir = 0;

      // ── where to stand: walk there
      if (c && wrap.current && !portrait) {
        if (!placed || reduced) {
          x = c.x;
          placed = true;
        }
        const dx = c.x - x;
        if (Math.abs(dx) > 3 && !c.sit && pose.hipY < 12) {
          walking = true;
          dir = Math.sign(dx);
          const speed = Math.min(260, 90 + Math.abs(dx) * 1.6) * (height / 220);
          x += dir * Math.min(Math.abs(dx), speed * dt);
          walk += (speed * dt) / (height * 0.16);
        }
        wrap.current.style.transform = `translate3d(${x}px,0,0)`;
      }

      // ── the pose for what the tutor is doing
      if (c && !portrait) {
        const act: Act = walking ? 'idle' : c.act;
        const arms = actArms(act, t);
        const nearIsA = c.side === 'left';
        const [na, nf] = arms.near;
        const [fa, ff] = arms.far;
        if (nearIsA) [target.armA, target.foreA, target.armB, target.foreB] = [na, nf, fa, ff];
        else [target.armA, target.foreA, target.armB, target.foreB] = [fa, ff, na, nf];
        Object.assign(target, arms.extra || {});
        if (c.sit) Object.assign(target, SIT, act === 'listen' ? {} : {});
        if (c.side === 'left' && arms.extra?.lookX) target.lookX = -arms.extra.lookX;
        target.turn = walking ? dir * 0.85 : act === 'write' || act === 'point' ? (c.side === 'right' ? 0.55 : -0.55) : c.sit ? 0 : 0.12 * Math.sin(t * 0.4);
        if (c.speaking && !c.sit) {
          // talking: small beats of the head and body, as people do
          target.head += Math.sin(t * 3.1) * 2.2 + Math.sin(t * 5.3) * 1.2;
          target.lean += Math.sin(t * 1.6) * 1.2;
        }
        if (c.pulse !== lastPulse) {
          lastPulse = c.pulse;
          if (c.act === 'happy' || c.act === 'emphasis') jumpT = t;
        }
      } else {
        target.smile = 0.45;
        target.head = Math.sin(t * 0.7) * 2;
      }

      // ── the walk cycle: knees lift in turn, the body bobs and sways
      let liftA = 0;
      let liftB = 0;
      if (walking) {
        liftA = Math.max(0, Math.sin(walk));
        liftB = Math.max(0, -Math.sin(walk));
        target.thighA = 5 + Math.sin(walk) * 4;
        target.thighB = 5 - Math.sin(walk) * 4;
        target.armA = 12 + Math.sin(walk) * 10;
        target.armB = 12 - Math.sin(walk) * 10;
        target.foreA = target.foreB = -20;
        target.hipY = -Math.abs(Math.cos(walk)) * 4;
        target.lean = Math.sin(walk) * 2.5;
      }

      // ── glances and blinks
      if (t > lookT) {
        lookT = t + 1.2 + Math.random() * 2.6;
        glance = Math.random() < 0.55 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 1.2, y: (Math.random() - 0.5) * 0.6 };
      }
      if (!c?.speaking && !walking && target.lookX === 0) {
        target.lookX = glance.x;
        target.lookY = glance.y;
      }
      if (t > nextBlink) {
        blinkT = t;
        nextBlink = t + 1.8 + Math.random() * 3.5 + (Math.random() < 0.15 ? -1.5 : 0);
      }
      const bk = blinkT >= 0 ? (t - blinkT) / 0.16 : 2;
      const lid = bk < 1 ? Math.abs(1 - bk * 2) : 1;

      // ── springs
      for (const k of KEYS) {
        const stiff = k === 'hipY' || k.startsWith('thigh') || k.startsWith('shin') ? (walking ? 220 : 60) : k === 'lookX' || k === 'lookY' ? 160 : k === 'smile' || k === 'brow' ? 50 : 90;
        const damp = 2 * Math.sqrt(stiff) * 0.9;
        vel[k] += ((target[k] - pose[k]) * stiff - vel[k] * damp) * dt;
        pose[k] += vel[k] * dt;
      }

      // ── mouth: the voice's shapes, smoothed a little
      const want = mouth?.current ? mouth.current() : REST;
      const kk = Math.min(1, dt * 28);
      m = {
        open: m.open + (want.open - m.open) * kk,
        wide: m.wide + (want.wide - m.wide) * kk,
        round: m.round + (want.round - m.round) * kk,
        teeth: m.teeth + (want.teeth - m.teeth) * kk,
        tongue: m.tongue + (want.tongue - m.tongue) * kk,
        press: m.press + (want.press - m.press) * kk,
        bite: m.bite + (want.bite - m.bite) * kk,
      };

      // ── apply
      const jump = t - jumpT < 0.55 ? Math.sin(((t - jumpT) / 0.55) * Math.PI) * 26 : 0;
      const breathe = Math.sin(t * 2.2) * 0.012;
      tr(R.root, `translate(0,${-jump})`);
      tr(R.hips, `translate(0,${-HIP + pose.hipY})`);
      tr(R.torso, `rotate(${pose.lean}) scale(${1 - breathe * 0.4},${1 + breathe})`);
      const headT = `translate(${pose.turn * 2},${-TORSO}) rotate(${pose.head}) translate(0,${-HEAD_R + 2})`;
      tr(R.headF, headT);
      tr(R.headB, headT);
      tr(R.face, `translate(${pose.turn * 6},${pose.lookY * 1.2})`);
      tr(R.armA, `translate(-23,${-TORSO + 6}) rotate(${pose.armA})`);
      tr(R.foreA, `translate(0,${UPPER}) rotate(${pose.foreA})`);
      tr(R.armB, `translate(23,${-TORSO + 6}) rotate(${-pose.armB})`);
      tr(R.foreB, `translate(0,${UPPER}) rotate(${-pose.foreB})`);
      tr(R.thighA, `translate(-10,0) rotate(${pose.thighA}) scale(1,${1 - liftA * 0.38})`);
      tr(R.shinA, `translate(0,${THIGH}) rotate(${pose.shinA}) scale(1,${1 / (1 - liftA * 0.38)})`);
      tr(R.thighB, `translate(10,0) rotate(${-pose.thighB}) scale(1,${1 - liftB * 0.38})`);
      tr(R.shinB, `translate(0,${THIGH}) rotate(${-pose.shinB}) scale(1,${1 / (1 - liftB * 0.38)})`);
      const gx = pose.lookX * 2.6;
      const gy = pose.lookY * 2;
      tr(R.irisA, `translate(${gx},${gy})`);
      tr(R.irisB, `translate(${gx},${gy})`);
      tr(R.lidA, `translate(-15,2) scale(1,${Math.max(0.08, lid)}) translate(15,-2)`);
      tr(R.lidB, `translate(15,2) scale(1,${Math.max(0.08, lid)}) translate(-15,-2)`);
      const by = -16 - pose.brow * 3.5;
      const tilt = pose.brow < 0 ? pose.brow * 2.5 : 0;
      R.browA?.setAttribute('d', `M-23,${by + 1 - tilt} Q-15,${by - 3} -8,${by + tilt}`);
      R.browB?.setAttribute('d', `M8,${by + tilt} Q15,${by - 3} 23,${by + 1 - tilt}`);
      const mp = mouthPaths(m, pose.smile, look.style);
      R.mouthIn?.setAttribute('d', mp.inner || 'M0,0');
      R.mouthLip?.setAttribute('d', mp.lip);
      if (R.teeth) {
        R.teeth.setAttribute('x', String(-mp.w));
        R.teeth.setAttribute('width', String(mp.w * 2));
        R.teeth.setAttribute('y', String(-mp.h * 0.6 - 2));
        R.teeth.setAttribute('height', String(mp.teethH + 2));
      }
      if (R.tongue) {
        R.tongue.setAttribute('cy', String(mp.h * 0.6));
        R.tongue.setAttribute('rx', String(mp.w * 0.5));
        R.tongue.setAttribute('ry', String(Math.max(0.01, mp.h * 0.32 * (0.4 + mp.tongue))));
      }
      R.shadow?.setAttribute('rx', String(36 - jump * 0.3 + (c?.sit ? 14 : 0)));
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutor, portrait, still, height]);

  const robot = look.style === 'robot';
  const anime = look.style === 'anime';
  const skinEdge = shade(look.skin, -0.3);
  const sleeve = look.outfit === 'labcoat' ? '#fbfbff' : look.top;
  const hand = <circle cx={0} cy={FORE + 2} r={6.5} fill={robot ? shade(look.skin, -0.1) : look.skin} stroke={skinEdge} strokeWidth={1.2} />;
  const skirt = look.outfit === 'sailor';
  const legColour = skirt ? look.skin : look.legs;
  const shoe = <ellipse cx={0} cy={SHIN + 2} rx={9} ry={5} fill={robot ? shade(look.legs, -0.3) : INK} />;
  const eye = (cx: number, irisRef: (el: SVGGElement | null) => void, lidRef: (el: SVGGElement | null) => void, flip: number) =>
    robot ? (
      <g ref={lidRef}>
        <circle cx={cx} cy={2} r={8} fill="#0f1530" />
        <g ref={irisRef}>
          <circle cx={cx} cy={2} r={5.5} fill={look.eyes} className="robot-eye" />
          <circle cx={cx - 1.8} cy={0} r={1.6} fill="#fff" />
        </g>
      </g>
    ) : anime ? (
      <g>
        <g ref={lidRef}>
          <ellipse cx={cx} cy={2} rx={8.5} ry={10.5} fill="#fff" />
          <g ref={irisRef} clipPath={`url(#${uid}-eye${flip})`}>
            <ellipse cx={cx} cy={3} rx={6.4} ry={8.4} fill={`url(#${uid}-iris)`} />
            <ellipse cx={cx} cy={4} rx={3} ry={4.2} fill="#120d1c" />
            <circle cx={cx - 2.6} cy={-1.5} r={2.3} fill="#fff" />
            <circle cx={cx + 2.4} cy={6} r={1.1} fill="#fff" opacity={0.85} />
          </g>
          <path d={`M${cx - 9},-6 Q${cx},-12.5 ${cx + 9},-6 M${cx + 9 * flip},-6 L${cx + 12.5 * flip},-9.5`} stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </g>
      </g>
    ) : (
      <g ref={lidRef}>
        <ellipse cx={cx} cy={2} rx={7.5} ry={9} fill="#fff" stroke={skinEdge} strokeWidth={1} />
        <g ref={irisRef}>
          <circle cx={cx} cy={3} r={4.6} fill={look.eyes} />
          <circle cx={cx} cy={3} r={2.4} fill="#0b0b12" />
          <circle cx={cx - 1.6} cy={1.2} r={1.4} fill="#fff" />
        </g>
      </g>
    );

  const head = (
    <g ref={set('headF')}>
      {!robot && (
        <>
          <ellipse cx={-38} cy={4} rx={6} ry={9} fill={look.skin} stroke={skinEdge} strokeWidth={1.2} />
          <ellipse cx={38} cy={4} rx={6} ry={9} fill={look.skin} stroke={skinEdge} strokeWidth={1.2} />
          {look.earrings && (
            <>
              <circle cx={-39} cy={15} r={3.2} fill="#ffd166" stroke="#c99a2e" strokeWidth={0.8} />
              <circle cx={39} cy={15} r={3.2} fill="#ffd166" stroke="#c99a2e" strokeWidth={0.8} />
            </>
          )}
        </>
      )}
      {headShape(look)}
      <g ref={set('face')}>
        {robot && <rect x={-31} y={-24} width={62} height={52} rx={14} fill="#1e2a4a" />}
        {look.blush && <ellipse cx={-21} cy={16} rx={6} ry={3.2} fill="#ff6f91" opacity={0.28} />}
        {look.blush && <ellipse cx={21} cy={16} rx={6} ry={3.2} fill="#ff6f91" opacity={0.28} />}
        {eye(-15, set('irisA'), set('lidA'), -1)}
        {eye(15, set('irisB'), set('lidB'), 1)}
        {!robot && (
          <>
            <path ref={set('browA')} d="M-23,-15 Q-15,-19 -8,-16" stroke={look.hairStyle === 'tufts' ? '#e8e8e8' : shade(look.hair, -0.2)} strokeWidth={look.hairStyle === 'tufts' ? 4 : 2.4} fill="none" strokeLinecap="round" />
            <path ref={set('browB')} d="M8,-16 Q15,-19 23,-15" stroke={look.hairStyle === 'tufts' ? '#e8e8e8' : shade(look.hair, -0.2)} strokeWidth={look.hairStyle === 'tufts' ? 4 : 2.4} fill="none" strokeLinecap="round" />
          </>
        )}
        {!robot && (anime ? <path d="M0,13 L-1.6,17 L1,17.4" stroke={shade(look.skin, -0.35)} strokeWidth={1.2} fill="none" strokeLinecap="round" /> : <ellipse cx={0} cy={15} rx={5} ry={4} fill={shade(look.skin, -0.12)} />)}
        {look.glasses && (
          <g fill="rgba(200,225,255,0.18)" stroke={INK} strokeWidth={1.8}>
            <rect x={-26} y={-9} width={21} height={19} rx={7} />
            <rect x={5} y={-9} width={21} height={19} rx={7} />
            <path d="M-5,-1 Q0,-4 5,-1" fill="none" />
          </g>
        )}
        <g transform={`translate(0,${robot ? 18 : anime ? 26 : 28})`}>
          <path ref={set('mouthIn')} id={`${uid}-mshape`} d="M0,0" fill={robot ? look.eyes : '#6b1f30'} className={robot ? 'robot-eye' : undefined} />
          {!robot && (
            <g clipPath={`url(#${uid}-mclip)`}>
              <rect ref={set('teeth')} x={-8} y={-4} width={16} height={0} fill="#fff" />
              <ellipse ref={set('tongue')} cx={0} cy={4} rx={4} ry={0.01} fill="#ff8095" />
            </g>
          )}
          <path ref={set('mouthLip')} d="M-8,0 Q0,2 8,0" stroke={robot ? look.eyes : shade(look.skin, -0.5)} strokeWidth={robot ? 2.4 : 1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {look.mustache && <path d="M-15,-5 C-10,-11 -3,-9 0,-6 C3,-9 10,-11 15,-5 C10,-3 4,-4 0,-4 C-4,-4 -10,-3 -15,-5 Z" fill="#eeeeee" stroke="#cfcfcf" strokeWidth={1} />}
        </g>
      </g>
      {hairFront(look)}
    </g>
  );

  const svg = (
    <svg viewBox={portrait ? '-64 -268 128 140' : '-120 -280 240 292'} className="tc-svg" aria-hidden>
      <defs>
        <radialGradient id={`${uid}-iris`} cx="50%" cy="70%" r="70%">
          <stop offset="0%" stopColor={shade(look.eyes, 0.45)} />
          <stop offset="60%" stopColor={look.eyes} />
          <stop offset="100%" stopColor={shade(look.eyes, -0.55)} />
        </radialGradient>
        <clipPath id={`${uid}-eye-1`}>
          <ellipse cx={-15} cy={2} rx={8.5} ry={10.5} />
        </clipPath>
        <clipPath id={`${uid}-eye1`}>
          <ellipse cx={15} cy={2} rx={8.5} ry={10.5} />
        </clipPath>
        {/* the open mouth, used to keep the teeth and tongue inside it */}
        <clipPath id={`${uid}-mclip`}>
          <use href={`#${uid}-mshape`} />
        </clipPath>
      </defs>
      {!portrait && <ellipse ref={set('shadow')} cx={0} cy={2} rx={36} ry={6} fill="#1e2240" opacity={0.13} />}
      <g ref={set('root')}>
        <g ref={set('hips')} transform={`translate(0,${-HIP})`}>
          {/* legs */}
          <g ref={set('thighA')} transform="translate(-10,0)">
            {limb(legColour, THIGH, 15, undefined, skirt ? skinEdge : shade(look.legs, -0.3))}
            <g ref={set('shinA')} transform={`translate(0,${THIGH})`}>
              {limb(skirt ? look.skin : look.legs, SHIN, 13, shoe, skirt ? skinEdge : shade(look.legs, -0.3))}
              {skirt && <line x1={0} y1={SHIN * 0.45} x2={0} y2={SHIN} stroke="#fff" strokeWidth={13} strokeLinecap="round" />}
            </g>
          </g>
          <g ref={set('thighB')} transform="translate(10,0)">
            {limb(legColour, THIGH, 15, undefined, skirt ? skinEdge : shade(look.legs, -0.3))}
            <g ref={set('shinB')} transform={`translate(0,${THIGH})`}>
              {limb(skirt ? look.skin : look.legs, SHIN, 13, shoe, skirt ? skinEdge : shade(look.legs, -0.3))}
              {skirt && <line x1={0} y1={SHIN * 0.45} x2={0} y2={SHIN} stroke="#fff" strokeWidth={13} strokeLinecap="round" />}
            </g>
          </g>
          {!skirt && look.outfit !== 'labcoat' && <rect x={-22} y={-4} width={44} height={14} rx={6} fill={look.legs} stroke={shade(look.legs, -0.3)} strokeWidth={1.2} />}
          {skirt && <path d="M-24,-4 L24,-4 L34,22 L-34,22 Z" fill={look.legs} stroke={shade(look.legs, -0.3)} strokeWidth={1.2} />}
          <g ref={set('torso')}>
            <g ref={set('headB')}>{hairBack(look)}</g>
            {/* neck */}
            <rect x={-7} y={-TORSO - 8} width={14} height={14} rx={4} fill={robot ? shade(look.skin, -0.2) : shade(look.skin, -0.08)} />
            {body(look)}
            {/* arms */}
            <g ref={set('armA')} transform={`translate(-23,${-TORSO + 6})`}>
              {limb(sleeve, UPPER, 12, undefined, shade(sleeve, -0.3))}
              <g ref={set('foreA')} transform={`translate(0,${UPPER})`}>
                {limb(sleeve, FORE, 10.5, hand, shade(sleeve, -0.3))}
              </g>
            </g>
            <g ref={set('armB')} transform={`translate(23,${-TORSO + 6})`}>
              {limb(sleeve, UPPER, 12, undefined, shade(sleeve, -0.3))}
              <g ref={set('foreB')} transform={`translate(0,${UPPER})`}>
                {limb(sleeve, FORE, 10.5, hand, shade(sleeve, -0.3))}
              </g>
            </g>
            {head}
          </g>
        </g>
      </g>
    </svg>
  );

  if (portrait) return <div className={`tc tc-portrait ${className}`}>{svg}</div>;
  return (
    <div ref={wrap} className={`tc ${className}`} style={{ height, width: height * (240 / 292) }}>
      {svg}
    </div>
  );
}
