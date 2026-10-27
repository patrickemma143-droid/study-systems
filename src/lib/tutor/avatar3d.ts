// The tutor in 3D: a human head built from the CC0 MakeHuman base mesh (scripts/tutor-heads/build.py).
// It blinks, glances around, breathes and moves its head, and its mouth follows the voice: the real
// loudness and brightness of the natural voice when we can measure it, otherwise a speaking rhythm.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { voiceLevel } from './meter';
import { TUTOR_ART_VERSION } from '../../../shared/tutors';

export type Framing = 'face' | 'bust' | 'portrait';

export interface AvatarHandle {
  setSpeaking(on: boolean): void;
  setListening(on: boolean): void;
  setFraming(f: Framing): void;
  /** show another tutor in the same picture (no new 3D context) */
  setTutor(id: string): Promise<void>;
  /** a short reaction: nod (agreeing), happy (well done), think (hmm) */
  react(kind: 'nod' | 'happy' | 'think'): void;
  dispose(): void;
  readonly ready: Promise<void>;
}

interface Extras {
  eyeL: number[];
  eyeR: number[];
  eyeRadius: number;
  neck: number[];
  headTop: number[];
  mouth: number[];
  headWidth: number;
  earL: number[];
  noseTip: number[];
  glasses: null | 'round' | 'rect' | 'half' | 'cat';
  smile: number;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

function load(id: string) {
  if (!cache.has(id)) {
    cache.set(
      id,
      loader.loadAsync(`/tutors/${id}.glb?v=${TUTOR_ART_VERSION}`).then((g) => {
        g.scene.userData = { ...g.scene.userData, ...(g.scenes?.[0]?.userData || {}) };
        return g.scene;
      }),
    );
    cache.get(id)!.catch(() => cache.delete(id));
  }
  return cache.get(id)!.then((s) => {
    const c = s.clone(true);
    c.userData = s.userData;
    return c;
  });
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function eyeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const sg = x.createRadialGradient(128, 128, 40, 128, 128, 128);
  sg.addColorStop(0, '#e6ddd2');
  sg.addColorStop(0.7, '#d4c7b8');
  sg.addColorStop(1, '#a89584');
  x.fillStyle = sg;
  x.fillRect(0, 0, 256, 256);
  const g = x.createRadialGradient(128, 128, 18, 128, 128, 60);
  g.addColorStop(0, '#1a0f08');
  g.addColorStop(0.35, '#2e1a0d');
  g.addColorStop(0.75, '#4d2c16');
  g.addColorStop(1, '#170c06');
  x.fillStyle = g;
  x.beginPath();
  x.arc(128, 128, 60, 0, Math.PI * 2);
  x.fill();
  // iris fibres
  x.strokeStyle = 'rgba(120,70,35,0.35)';
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * 24, 128 + Math.sin(a) * 24);
    x.lineTo(128 + Math.cos(a + 0.05) * 56, 128 + Math.sin(a + 0.05) * 56);
    x.stroke();
  }
  x.fillStyle = '#050302';
  x.beginPath();
  x.arc(128, 128, 21, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeEye(r: number, tex: THREE.Texture) {
  const geo = new THREE.SphereGeometry(r, 32, 24);
  const pa = geo.attributes.position;
  const uv = geo.attributes.uv;
  // a front projection, so the iris sits in the middle of the +z side
  for (let i = 0; i < pa.count; i++) {
    const z = pa.getZ(i);
    uv.setXY(i, z > 0 ? 0.5 + (pa.getX(i) / r) * 0.5 : 0.02, z > 0 ? 0.5 + (pa.getY(i) / r) * 0.5 : 0.02);
  }
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03 }));
}

/** Glasses that fit this head: two rims, a bridge and the arms back to the ears. */
function makeGlasses(ex: Extras) {
  const g = new THREE.Group();
  const kind = ex.glasses!;
  const r = ex.eyeRadius;
  const frame = new THREE.MeshPhysicalMaterial({ color: kind === 'round' ? 0x3a2418 : 0x141414, roughness: 0.35, metalness: kind === 'half' ? 0.6 : 0.1, clearcoat: 0.6 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.12, metalness: 0, depthWrite: false });
  const w = r * 1.55;
  const h = kind === 'round' ? r * 1.5 : r * 1.15;
  const z = Math.max(ex.eyeL[2], ex.eyeR[2]) + r * 1.75;
  const thick = r * (kind === 'half' ? 0.06 : 0.09);
  for (const e of [ex.eyeL, ex.eyeR]) {
    const side = Math.sign(e[0]) || 1;
    const pts: THREE.Vector3[] = [];
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let x: number, y: number;
      if (kind === 'round') {
        x = Math.cos(a) * w;
        y = Math.sin(a) * h;
      } else {
        // a rounded rectangle (superellipse); cat-eye lifts the outer top corner
        const p = 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        x = Math.sign(c) * Math.abs(c) ** (2 / p) * w * 1.12;
        y = Math.sign(s) * Math.abs(s) ** (2 / p) * h;
        if (kind === 'cat' && y > 0 && x * side > 0) y += (x * side) / w * h * 0.35;
      }
      if (kind === 'half' && y < -h * 0.05) continue;
      pts.push(new THREE.Vector3(e[0] + x, e[1] + y + r * 0.05, z - Math.abs(x) * 0.18));
    }
    const curve = new THREE.CatmullRomCurve3(pts, kind !== 'half', 'centripetal');
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, thick, 8, kind !== 'half'), frame));
    if (kind !== 'half') {
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
      const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), lensMat);
      lens.position.z = z - r * 0.05;
      g.add(lens);
    }
    // the arm, from the outer edge back to the ear
    const ox = e[0] + side * w * 1.12;
    const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(ox, e[1] + r * 0.4, z - r * 0.3), new THREE.Vector3(ox + side * r * 0.35, e[1] + r * 0.45, z - r * 2.5), new THREE.Vector3(Math.sign(side) * Math.abs(ex.earL[0]) * 0.98, e[1] + r * 0.2, ex.earL[2] + r * 0.6)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(arm, 24, thick * 0.8, 6, false), frame));
  }
  const bridge = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(ex.eyeR[0] + w * 0.95, ex.eyeR[1] + r * 0.45, z),
    new THREE.Vector3(0, ex.eyeR[1] + r * 0.85, z + r * 0.15),
    new THREE.Vector3(ex.eyeL[0] - w * 0.95, ex.eyeL[1] + r * 0.45, z),
  );
  g.add(new THREE.Mesh(new THREE.TubeGeometry(bridge, 16, thick * 0.8, 6, false), frame));
  return g;
}

const ease = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

/** Put a talking 3D tutor in `host`. The canvas fills the host; the background stays transparent. */
export function mountAvatar(host: HTMLElement, tutorId: string, opts: { framing?: Framing; still?: boolean; onError?: (e: unknown) => void } = {}): AvatarHandle {
  let framing: Framing = opts.framing || 'bust';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: framing === 'portrait', powerPreference: 'low-power' });
  // quality steps down on slow devices: [pixel ratio cap, frames per second]
  const LEVELS: [number, number][] = [[1.75, 30], [1.25, 30], [1, 24], [0.85, 15], [0.75, 6]];
  let quality = framing === 'portrait' ? 0 : (navigator.hardwareConcurrency || 4) <= 4 ? 1 : 0;
  const applyQuality = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, framing === 'portrait' ? 2 : LEVELS[quality][0]));
  applyQuality();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
  key.position.set(3, 4, 6);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  fill.position.set(-5, 1, 4);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(-2, 4, -6);
  scene.add(key, fill, rim);
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 100);

  let speaking = false;
  let listening = false;
  let disposed = false;
  let raf = 0;
  const morphMeshes: THREE.Mesh[] = [];
  const st = { blink: 0, jaw: 0, oo: 0, ee: 0, mbp: 0, smile: 0, browUp: 0, browInner: 0, nod: 0, think: 0, happy: 0 };
  let nextBlink = 1 + Math.random() * 2;
  let blinkT = -1;
  let gaze = new THREE.Vector2();
  let gazeTarget = new THREE.Vector2();
  let nextGaze = 0.5;
  let syl = 0; // the current "syllable" shape while speaking
  let lastPeak = 0;
  let prevLevel = 0;
  let reactT = -1;
  let reactKind: 'nod' | 'happy' | 'think' = 'nod';
  const rig = new THREE.Group();
  scene.add(rig);
  let eyes: THREE.Mesh[] = [];
  let ex: Extras | null = null;
  let current: THREE.Object3D | null = null;
  let want = tutorId;
  const eyeTex = eyeTexture();
  let baseY = 0;

  const resize = () => {
    const w = host.clientWidth || 160;
    const h = host.clientHeight || 160;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    frame();
    cam.updateProjectionMatrix();
  };

  function frame() {
    if (!ex) return;
    const eyeY = ex.eyeL[1];
    const z = ex.eyeL[2] - 0.5;
    const t = framing === 'face' || framing === 'portrait' ? new THREE.Vector3(0, eyeY - 0.38, z) : new THREE.Vector3(0, eyeY - 0.75, z);
    // fit the head (and, for the bust, the shoulders) whatever the shape of the box
    const need = framing === 'bust' ? 4.1 : 3.15; // decimetres of height to show
    const needW = framing === 'bust' ? 3.6 : 2.7;
    const vfov = (cam.fov * Math.PI) / 180;
    const dist = Math.max(need / 2 / Math.tan(vfov / 2), needW / 2 / Math.tan(vfov / 2) / cam.aspect);
    cam.position.set(0, t.y + 0.25, t.z + dist);
    cam.lookAt(t);
  }

  function show(id: string) {
    want = id;
    return load(id).then((model) => {
      if (disposed || want !== id) return;
      const ex2 = model.userData as Extras;
      const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(ex2.neck[1] - 1.05))];
      const meshes: THREE.Mesh[] = [];
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.name === 'skin') {
          m.material =
            framing === 'portrait'
              ? new THREE.MeshPhysicalMaterial({ map: mat.map, roughness: 0.6, sheen: 0.35, sheenColor: new THREE.Color(0.8, 0.35, 0.25), sheenRoughness: 0.6, clippingPlanes: clip })
              : new THREE.MeshStandardMaterial({ map: mat.map, roughness: 0.58, clippingPlanes: clip });
        } else {
          m.material = mat.clone();
          (m.material as THREE.MeshStandardMaterial).clippingPlanes = clip;
          if (mat.name === 'teeth') (m.material as THREE.MeshStandardMaterial).color.setRGB(0.62, 0.58, 0.52);
        }
        if (m.morphTargetDictionary) meshes.push(m);
      });
      const newEyes: THREE.Mesh[] = [];
      for (const k of ['eyeL', 'eyeR'] as const) {
        const e = makeEye(ex2.eyeRadius, eyeTex);
        e.position.fromArray(ex2[k]);
        newEyes.push(e);
        model.add(e);
      }
      if (ex2.glasses) model.add(makeGlasses(ex2));
      // swap the old tutor out
      if (current) {
        rig.remove(current);
        current.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          // the geometry and textures are shared with the cached model; only our own copies go
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm) => mm.dispose());
          if (!m.morphTargetDictionary && !m.geometry.userData.cached) m.geometry.dispose();
        });
      }
      ex = ex2;
      eyes = newEyes;
      morphMeshes.length = 0;
      morphMeshes.push(...meshes);
      // pivot the head and shoulders around the neck
      rig.position.set(0, ex.neck[1], ex.neck[2]);
      model.position.set(0, -ex.neck[1], -ex.neck[2]);
      rig.add(model);
      current = model;
      baseY = rig.position.y;
      st.smile = ex.smile;
      resize();
      if (opts.still) {
        setMorphs({ blink: 0.08, smile: ex.smile + 0.12 });
        renderer.render(scene, cam);
      } else if (!raf) start();
    });
  }

  const ready = show(tutorId).catch((e) => opts.onError?.(e));

  function setMorphs(v: Partial<Record<string, number>>) {
    for (const m of morphMeshes) {
      const d = m.morphTargetDictionary!;
      const inf = m.morphTargetInfluences!;
      for (const [k, val] of Object.entries(v)) {
        if (k === 'blink') {
          inf[d.blinkL] = val!;
          inf[d.blinkR] = val!;
        } else if (k in d) inf[d[k]] = val!;
      }
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  let visible = true;
  const io = new IntersectionObserver((en) => {
    visible = en.some((e) => e.isIntersecting);
    if (visible && !raf && !disposed && ex && !opts.still) start();
  });
  io.observe(host);

  let last = 0;
  let clock = 0;
  let cost = 0; // average milliseconds per rendered frame
  let frames = 0;
  function start() {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', onVis);
  function onVis() {
    if (!document.hidden && visible && !raf && !disposed && ex && !opts.still) start();
  }

  function tick(now: number) {
    raf = 0;
    if (disposed || !ex) return;
    if (!visible || document.hidden) return; // the observers restart us
    const fps = LEVELS[quality][1];
    if (now - last < 1000 / fps - 2) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    clock += dt;
    const t0 = performance.now();
    animate(Math.min(dt, 0.05), clock);
    renderer.render(scene, cam);
    const ms = performance.now() - t0;
    cost = frames ? cost * 0.9 + ms * 0.1 : ms;
    frames++;
    // too slow for this device: step down (fewer pixels, then fewer frames)
    if (frames > 12 && cost > 1000 / fps / 2.5 && quality < LEVELS.length - 1) {
      quality++;
      applyQuality();
      resize();
      frames = 0;
    }
    if (quality === LEVELS.length - 1 && frames > 6 && cost > 120) {
      // still very slow: show a moving frame only now and then
      raf = window.setTimeout(() => requestAnimationFrame(tick), 900) as unknown as number;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function animate(dt: number, t: number) {
    // ── voice → mouth ──
    let level = 0;
    let bright = 0.5;
    if (speaking) {
      const m = voiceLevel();
      if (m) {
        level = m.level;
        bright = m.bright;
      } else {
        // no audio to measure (phone voice or captions): a natural speaking rhythm
        const a = Math.sin(t * 2 * Math.PI * 4.2 + Math.sin(t * 1.7) * 2) * 0.5 + 0.5;
        const b = Math.sin(t * 2 * Math.PI * 2.3 + 1.3) * 0.5 + 0.5;
        level = Math.max(0, a * 0.7 + b * 0.3 - 0.18) * (0.75 + 0.25 * Math.sin(t * 0.9));
        bright = 0.5 + 0.4 * Math.sin(t * 3.1);
      }
    }
    // a new syllable when the voice rises: pick its mouth shape from the sound's brightness
    if (level > 0.25 && level > prevLevel + 0.04 && t - lastPeak > 0.12) {
      lastPeak = t;
      syl = bright > 0.62 ? 1 : bright < 0.36 ? 2 : Math.random() < 0.25 ? 3 : 0; // 1 ee, 2 oo, 3 lips together
    }
    prevLevel = level;
    const open = Math.min(0.78, level * 1.25);
    st.jaw = ease(st.jaw, syl === 3 && level < 0.35 ? 0 : open, 22, dt);
    st.ee = ease(st.ee, speaking && syl === 1 ? 0.45 : 0, 14, dt);
    st.oo = ease(st.oo, speaking && syl === 2 ? 0.55 : 0, 12, dt);
    st.mbp = ease(st.mbp, speaking && syl === 3 && level < 0.35 ? 0.5 : 0, 18, dt);
    // ── expression ──
    let smileT = ex!.smile + (speaking ? 0.05 : 0.15) + (listening ? 0.12 : 0);
    let browUpT = speaking ? Math.max(0, level - 0.55) * 1.2 : 0;
    let browInnerT = listening ? 0.25 : 0;
    if (reactT >= 0) {
      reactT += dt;
      const k = Math.sin(Math.min(1, reactT / 1.4) * Math.PI);
      if (reactKind === 'happy') {
        smileT += 0.55 * k;
        browUpT += 0.4 * k;
      }
      if (reactKind === 'think') browInnerT += 0.5 * k;
      if (reactT > 1.4) reactT = -1;
    }
    st.smile = ease(st.smile, smileT, 4, dt);
    st.browUp = ease(st.browUp, browUpT, 8, dt);
    st.browInner = ease(st.browInner, browInnerT, 5, dt);
    // ── blinking ──
    nextBlink -= dt;
    if (nextBlink <= 0 && blinkT < 0) {
      blinkT = 0;
      nextBlink = 2 + Math.random() * 3.5;
      if (Math.random() < 0.15) nextBlink = 0.25; // a double blink now and then
    }
    let blink = 0.08 + (listening ? 0 : 0.02);
    if (blinkT >= 0) {
      blinkT += dt;
      const p = blinkT / 0.16;
      blink = p < 0.5 ? 0.08 + 1.84 * p : Math.max(0.08, 1 - (p - 0.5) * 1.6);
      if (p > 1.1) blinkT = -1;
    }
    setMorphs({ blink, jawOpen: st.jaw, ee: st.ee, oo: st.oo, mbp: st.mbp, smile: st.smile, browUp: st.browUp, browInner: st.browInner });
    // ── eyes: look at the student, with small glances away ──
    nextGaze -= dt;
    if (nextGaze <= 0) {
      nextGaze = 0.6 + Math.random() * (speaking ? 1.6 : 2.6);
      const away = !listening && Math.random() < (speaking ? 0.35 : 0.25);
      gazeTarget = away ? new THREE.Vector2((Math.random() - 0.5) * 0.5, (Math.random() - 0.35) * 0.3) : new THREE.Vector2((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.04);
      if (reactKind === 'think' && reactT >= 0) gazeTarget.set(0.25, 0.22);
    }
    gaze.lerp(gazeTarget, 1 - Math.exp(-18 * dt));
    for (const e of eyes) e.rotation.set(-gaze.y, gaze.x, 0);
    // ── head and breathing ──
    const sway = speaking ? 1.6 : 1;
    let nod = 0;
    if (reactT >= 0 && reactKind === 'nod') nod = Math.sin(reactT * 9) * 0.07 * Math.max(0, 1 - reactT / 1.2);
    rig.rotation.x = 0.025 * Math.sin(t * 0.7) * sway + (speaking ? level * 0.05 : 0) + nod - (listening ? 0.03 : 0);
    rig.rotation.y = 0.05 * Math.sin(t * 0.37) * sway + gaze.x * 0.25;
    rig.rotation.z = 0.02 * Math.sin(t * 0.53) + (listening ? 0.06 : 0);
    rig.position.y = baseY + Math.sin(t * 1.6) * 0.012;
  }

  return {
    ready: ready.then(() => undefined),
    setSpeaking(on) {
      speaking = on;
    },
    setTutor(id) {
      if (id === want) return Promise.resolve();
      return show(id).catch((e) => opts.onError?.(e));
    },
    setFraming(f) {
      framing = f;
      resize();
    },
    setListening(on) {
      listening = on;
      if (on) gazeTarget.set(0, 0);
    },
    react(kind) {
      reactKind = kind;
      reactT = 0;
      if (kind === 'think') nextGaze = 0;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      io.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm) => mm.dispose());
        }
      });
      env.dispose();
      eyeTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
