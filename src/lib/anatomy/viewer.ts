// The 3D anatomy viewer: loads one body system at a time, lets the student rotate, zoom, tap to
// identify, hide, isolate, see through (x-ray), cut a cross-section and peel layers away.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export type SystemId = 'skeleton' | 'insertions' | 'joints' | 'muscles' | 'vessels' | 'lymph' | 'nervous' | 'viscera';

export interface Structure {
  name: string;
  side?: 'left' | 'right';
  part?: boolean;
  system: SystemId;
  groups?: string[];
  superficial?: boolean;
  role?: 'origin' | 'insertion';
}
export interface Landmark {
  name: string;
  side?: string;
  system: SystemId;
  /** the two ends of the label line: one on the surface, one where the label text sits */
  p: [number, number, number];
  q?: [number, number, number];
  groups?: string[];
}
export interface Catalogue {
  systems: Record<SystemId, { colour: string; parts: number; bytes: number }>;
  structures: Record<string, Structure>;
  landmarks: Landmark[];
}

export const SYSTEM_ORDER: SystemId[] = ['skeleton', 'muscles', 'nervous', 'vessels', 'viscera', 'joints', 'lymph', 'insertions'];
export const SYSTEM_LABEL: Record<SystemId, string> = {
  skeleton: 'Skeleton',
  muscles: 'Muscles',
  nervous: 'Nervous system',
  vessels: 'Heart & vessels',
  viscera: 'Organs',
  joints: 'Joints & ligaments',
  lymph: 'Lymphatic',
  insertions: 'Muscle attachments',
};

export type Region = 'all' | 'head' | 'trunk' | 'upper' | 'lower';
const REGION_RE: Record<Exclude<Region, 'all'>, RegExp> = {
  head: /head|crani|skull|face|facial|neck|cervical|brain|cerebr|orbit|eye|ear|nasal|oral|mouth|tongue|larynx|pharynx|teeth|mandib|maxill|temporal|encephal/i,
  trunk: /trunk|thora|abdom|pelv|back|dorsal|vertebr|rib|stern|spine|spinal|heart|lung|perine|gluteal region|diaphragm|chest/i,
  upper: /upper limb|arm|forearm|hand|shoulder|axill|elbow|wrist|carp|finger|humer|radius|ulna|scapul|clavic|brachi|digit(?!.*foot)/i,
  lower: /lower limb|thigh|leg|foot|feet|hip|knee|ankle|tars|toe|femur|tibia|fibula|patell|gluteal|popliteal|crural|plantar/i,
};

const REGION_TAG = /^(head|neck|trunk|thorax|abdomen|pelvis|back|perineum|(left|right) (upper limb|lower limb|hand|foot))$/i;
const GROUP_RE: Record<Exclude<Region, 'all'>, RegExp> = {
  head: /^(head|neck)$/i,
  trunk: /^(trunk|thorax|abdomen|pelvis|back|perineum)$/i,
  upper: /upper limb|hand$/i,
  lower: /lower limb|foot$/i,
};

const HIGHLIGHT = new THREE.Color('#2f6bff');
const isWrapping = (s: Structure) => /fascia|bursa|tendon sheath|retinaculum|aponeurosis/i.test(s.name) || (s.groups || []).some((g) => /^(fascia|bursae|tendon sheaths)$/i.test(g));

/** A named landmark on a bone (head, trochanter, foramen…), in the bone's resting position. */
export interface PartPin {
  name: string;
  p: THREE.Vector3;
  /** the bone surface's outward direction there: used to tell whether the point faces the student */
  n: THREE.Vector3;
}
export type ViewDir = 'anterior' | 'posterior' | 'left' | 'right' | 'superior' | 'inferior';
const VIEW_DIR: Record<ViewDir, [number, number, number]> = {
  anterior: [0, 0, 1],
  posterior: [0, 0, -1],
  left: [1, 0, 0], // the body's left is +x
  right: [-1, 0, 0],
  superior: [0, 1, 0.02],
  inferior: [0, -1, 0.02],
};
/** parts of a bone that are named on their own: "Temporal surface of greater wing" is the sphenoid's */
const PART_OF_BONE: Record<string, string> = {
  'greater wing': 'sphenoid bone',
  'lesser wing': 'sphenoid bone',
  'petrous part': 'temporal bone',
  'squamous part of temporal bone': 'temporal bone',
};
/** how far apart pieces move when the body is dismantled: mostly sideways and front-back */
const SPREAD = new THREE.Vector3(1.6, 0.7, 1.6);

export interface Pick {
  id: string;
  structure: Structure;
  point: THREE.Vector3;
}

type Listener = () => void;

export class AnatomyViewer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private loader: GLTFLoader;
  private groups = new Map<SystemId, THREE.Group>();
  private loading = new Map<SystemId, Promise<void>>();
  /** every part has its own shade of its system's colour, so neighbouring muscles and bones stand apart */
  private materials = new Map<SystemId, THREE.MeshStandardMaterial[]>();
  private highlightMat: THREE.MeshStandardMaterial;
  private meshes = new Map<string, THREE.Mesh>();
  private hidden = new Set<string>();
  private selected: string[] = [];
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10);
  private clipOn = false;
  private xray = false;
  private needsRender = true;
  private raf = 0;
  private ro: ResizeObserver;
  private listeners = new Set<Listener>();
  readonly visibleSystems = new Set<SystemId>();
  region: Region = 'all';
  /** fascia, bursae and tendon sheaths cover the muscles; hidden unless asked for */
  showWrappings = false;
  private ghost = false;
  muscleDepth: 'all' | 'deep' = 'all';
  hiddenHistory: string[][] = [];
  /** study mode: one structure on its own, turning around its own centre */
  studyId: string | null = null;
  private beforeStudy: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private explodeNow = 0;
  private explodeTarget = 0;
  private explodeCentre = new THREE.Vector3(0, 0.9, 0);
  private dragged = new Map<string, THREE.Vector3>();
  private dragging: {
    id: string;
    plane: THREE.Plane;
    start: THREE.Vector3;
    base: THREE.Vector3;
  } | null = null;
  private tween: {
    p0: THREE.Vector3;
    t0: THREE.Vector3;
    p1: THREE.Vector3;
    t1: THREE.Vector3;
    start: number;
    dur: number;
  } | null = null;
  private renderListeners = new Set<Listener>();
  private partsCache = new Map<string, PartPin[]>();

  constructor(
    private host: HTMLElement,
    readonly catalogue: Catalogue,
    private base = '/anatomy',
  ) {
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 300;
    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 50);
    this.camera.position.set(0, 1.0, 3.2);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    // phones: a lower pixel ratio keeps it smooth and saves battery
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.5 : 2));
    this.renderer.setSize(w, h);
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1.5, 2.5, 2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(-2, 1, -2);
    this.scene.add(rim);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 8;
    this.controls.addEventListener('change', () => this.invalidate());

    this.highlightMat = new THREE.MeshStandardMaterial({
      color: HIGHLIGHT,
      emissive: HIGHLIGHT,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });

    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    let last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      // pieces gliding apart or back together
      if (this.explodeNow !== this.explodeTarget) {
        const step = dt * 1.8;
        const d = this.explodeTarget - this.explodeNow;
        this.explodeNow = Math.abs(d) <= step ? this.explodeTarget : this.explodeNow + Math.sign(d) * step;
        this.applyOffsets();
      }
      // camera gliding to a new view
      if (this.tween) {
        const k = Math.min(1, (now - this.tween.start) / this.tween.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, e);
        this.controls.target.lerpVectors(this.tween.t0, this.tween.t1, e);
        if (k >= 1) this.tween = null;
        this.needsRender = true;
      }
      // only draw when something changed (or the camera is still gliding)
      if (this.controls.update() || this.needsRender) {
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
        for (const fn of this.renderListeners) fn();
      }
    };
    loop();
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Called after every frame that was drawn (for labels that follow the model). */
  onRender(fn: Listener) {
    this.renderListeners.add(fn);
    return () => this.renderListeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
  invalidate() {
    this.needsRender = true;
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.invalidate();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    this.renderer.domElement.remove();
  }

  isLoaded(sid: SystemId) {
    return this.groups.has(sid);
  }

  /** Download a system the first time it's shown (the service worker keeps it for next time). */
  load(sid: SystemId, onProgress?: (pct: number) => void): Promise<void> {
    if (this.groups.has(sid)) return Promise.resolve();
    const existing = this.loading.get(sid);
    if (existing) return existing;
    const info = this.catalogue.systems[sid];
    const p = new Promise<void>((resolve, reject) => {
      this.loader.load(
        `${this.base}/${sid}.glb?v=${info?.bytes || 1}`,
        (gltf) => {
          const base = new THREE.Color(info?.colour || '#cccccc');
          const mats: THREE.MeshStandardMaterial[] = [];
          this.materials.set(sid, mats);
          const group = gltf.scene;
          group.name = sid;
          group.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            // node names are short ids that look the structure up in the catalogue
            const id = m.name || m.parent?.name || '';
            const key = this.catalogue.structures[id] ? id : this.catalogue.structures[m.parent?.name || ''] ? m.parent!.name : id;
            m.name = key;
            m.userData.id = key;
            // a small, stable change of shade per structure (same structure, same shade on both sides)
            const nm = this.catalogue.structures[key]?.name || key;
            let h = 0;
            for (let i = 0; i < nm.length; i++) h = (h * 31 + nm.charCodeAt(i)) | 0;
            const shade = ((h >>> 0) % 1000) / 1000 - 0.5;
            const col = base.clone().offsetHSL(shade * 0.03, shade * 0.12, shade * 0.12);
            const mat = new THREE.MeshStandardMaterial({
              color: col,
              roughness: sid === 'muscles' ? 0.5 : 0.62,
              metalness: 0.02,
              side: THREE.DoubleSide,
              clippingPlanes: [],
            });
            mats.push(mat);
            m.userData.mat = mat;
            m.material = mat;
            this.meshes.set(key, m);
          });
          this.groups.set(sid, group);
          this.scene.add(group);
          // remember where every piece belongs, for dismantling and putting it back
          group.updateMatrixWorld(true);
          group.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.userData.home = m.position.clone();
            m.userData.homeWorld = m.matrixWorld.clone();
            m.userData.homeCentre = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
            m.userData.pinv = new THREE.Matrix3().setFromMatrix4(m.parent!.matrixWorld).invert();
          });
          if (this.explodeNow || this.dragged.size) this.applyOffsets();
          this.applyVisibility();
          this.applyMaterialState();
          resolve();
        },
        (ev) => {
          if (onProgress && ev.total) onProgress(Math.round((ev.loaded / ev.total) * 100));
          else if (onProgress && info?.bytes) onProgress(Math.min(99, Math.round((ev.loaded / info.bytes) * 100)));
        },
        (err) => {
          this.loading.delete(sid);
          reject(err);
        },
      );
    });
    this.loading.set(sid, p);
    return p;
  }

  async show(sid: SystemId, on: boolean, onProgress?: (pct: number) => void) {
    if (on) {
      this.visibleSystems.add(sid);
      await this.load(sid, onProgress);
    } else this.visibleSystems.delete(sid);
    this.applyVisibility();
    this.emit();
  }

  structureOf(id: string): Structure | undefined {
    return this.catalogue.structures[id];
  }

  private inRegion(s: Structure) {
    if (this.region === 'all') return true;
    // the model tags most parts with their region; names are the fallback
    const tags = (s.groups || []).filter((g) => REGION_TAG.test(g));
    if (tags.length) return tags.some((g) => GROUP_RE[this.region as Exclude<Region, 'all'>].test(g));
    return REGION_RE[this.region].test(s.name);
  }

  isVisible(id: string) {
    const m = this.meshes.get(id);
    return !!m && m.visible && !!m.parent?.visible;
  }

  /** Who is visible: system switched on, not hidden by the student, in the region, and the muscle layer. */
  private applyVisibility() {
    const studySys = this.studyId ? this.catalogue.structures[this.studyId]?.system : null;
    for (const [sid, g] of this.groups) g.visible = this.visibleSystems.has(sid) || sid === studySys;
    for (const [id, m] of this.meshes) {
      const s = this.catalogue.structures[id];
      if (!s) continue;
      if (this.studyId) {
        m.visible = id === this.studyId;
        continue;
      }
      let v = !this.hidden.has(id) && this.inRegion(s);
      if (v && s.system === 'muscles' && this.muscleDepth === 'deep' && s.superficial) v = false;
      if (v && s.system === 'muscles' && !this.showWrappings && isWrapping(s)) v = false;
      m.visible = v;
    }
    this.invalidate();
  }

  private applyMaterialState() {
    for (const [sid, mats] of this.materials) {
      // ghost: everything except the highlighted answer fades, so hidden-away parts can be seen
      const fade = this.ghost || (this.xray && sid !== 'nervous' && sid !== 'vessels');
      for (const mat of mats) {
        mat.transparent = fade;
        mat.opacity = fade ? 0.18 : 1;
        mat.depthWrite = !fade;
        mat.clippingPlanes = this.clipOn ? [this.clip] : [];
        mat.needsUpdate = true;
      }
    }
    this.highlightMat.clippingPlanes = this.clipOn ? [this.clip] : [];
    this.highlightMat.needsUpdate = true;
    this.invalidate();
  }

  setRegion(r: Region) {
    this.region = r;
    this.applyVisibility();
    if (r !== 'all') this.frameVisible();
    else this.resetView();
    this.emit();
  }

  setMuscleDepth(d: 'all' | 'deep') {
    this.muscleDepth = d;
    this.applyVisibility();
    this.emit();
  }

  setXray(on: boolean) {
    this.xray = on;
    this.applyMaterialState();
    this.emit();
  }
  get xrayOn() {
    return this.xray;
  }

  /** A cutting plane through the body: axis and position from -1 (one end) to 1 (other end). */
  setSection(axis: 'none' | 'x' | 'y' | 'z', pos = 0) {
    if (axis === 'none') {
      this.clipOn = false;
    } else {
      const box = this.visibleBox();
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      const n = axis === 'x' ? new THREE.Vector3(-1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, -1);
      const along = axis === 'x' ? c.x + (pos * s.x) / 2 : axis === 'y' ? c.y + (pos * s.y) / 2 : c.z + (pos * s.z) / 2;
      this.clip.set(n, along);
      this.clipOn = true;
    }
    this.applyMaterialState();
    this.emit();
  }

  private visibleBox() {
    const box = new THREE.Box3();
    for (const m of this.meshes.values()) if (m.visible && m.parent?.visible) box.expandByObject(m);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 1.8, 0.2));
    return box;
  }

  private frameBox(box: THREE.Box3, pad = 1.4, animate = false, dirOverride?: THREE.Vector3) {
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 0.3;
    const dist = (size * pad) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const dir = (dirOverride || this.camera.position.clone().sub(this.controls.target)).clone().normalize();
    const pos = c.clone().add(dir.multiplyScalar(Math.max(dist, 0.12)));
    this.camera.near = Math.max(0.002, Math.min(0.01, dist / 200));
    this.camera.updateProjectionMatrix();
    if (animate) this.animateCamera(pos, c);
    else {
      this.tween = null;
      this.controls.target.copy(c);
      this.camera.position.copy(pos);
    }
    this.invalidate();
  }

  /** Glide the camera to a new position (and point it at a new centre). */
  animateCamera(pos: THREE.Vector3, target: THREE.Vector3, dur = 550) {
    this.tween = {
      p0: this.camera.position.clone(),
      t0: this.controls.target.clone(),
      p1: pos.clone(),
      t1: target.clone(),
      start: performance.now(),
      dur,
    };
    this.invalidate();
  }

  frameVisible() {
    this.frameBox(this.visibleBox());
  }

  resetView() {
    if (this.studyId) {
      this.frameStudy(new THREE.Vector3(...VIEW_DIR.anterior));
      return;
    }
    this.tween = null;
    this.controls.target.set(0, 1.0, 0);
    this.camera.position.set(0, 1.0, 3.2);
    this.camera.near = 0.01;
    this.camera.updateProjectionMatrix();
    this.frameVisible();
  }

  /** What is under the finger or mouse. */
  pick(clientX: number, clientY: number): Pick | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const targets = [...this.meshes.values()].filter((m) => m.visible && m.parent?.visible);
    const hits = ray.intersectObjects(targets, false);
    for (const h of hits) {
      // in a cross-section, ignore the part that has been cut away
      if (this.clipOn && this.clip.distanceToPoint(h.point) < 0) continue;
      // in x-ray, faded systems can be looked through
      const s = this.catalogue.structures[h.object.userData.id];
      if (!s) continue;
      if (this.xray && s.system !== 'nervous' && s.system !== 'vessels' && hits.some((x) => x !== h && ['nervous', 'vessels'].includes(this.catalogue.structures[x.object.userData.id]?.system)))
        continue;
      return { id: h.object.userData.id, structure: s, point: h.point.clone() };
    }
    return null;
  }

  /** All meshes with this name (both sides, all parts). */
  idsByName(name: string): string[] {
    const n = name.toLowerCase();
    // a muscle made of heads or parts ("biceps brachii") is the group its parts belong to
    const hits = Object.entries(this.catalogue.structures).filter(([, s]) => s.name.toLowerCase() === n || (/ muscle$/.test(n) && (s.groups || []).some((g) => g.toLowerCase() === n)));
    let real = hits.filter(([, s]) => !s.role);
    if (!real.length && / muscle$/.test(n)) {
      // "Biceps brachii muscle" is modelled as its heads: "Long head of biceps brachii", "Short head of…"
      const core = n.replace(/ muscle$/, '');
      if (core.length >= 5)
        real = Object.entries(this.catalogue.structures).filter(
          ([, s]) => !s.role && s.system === 'muscles' && new RegExp(`\\b${core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(s.name.toLowerCase()),
        );
    }
    return (real.length ? real : hits).map(([id]) => id);
  }

  setWrappings(on: boolean) {
    this.showWrappings = on;
    this.applyVisibility();
    this.emit();
  }

  select(ids: string[], frame = false, ghost = false) {
    if (this.ghost !== (ghost && ids.length > 0)) {
      this.ghost = ghost && ids.length > 0;
      this.applyMaterialState();
    }
    for (const id of this.selected) {
      const m = this.meshes.get(id);
      if (m && m.userData.mat) m.material = m.userData.mat;
    }
    this.selected = ids.filter((id) => this.meshes.has(id));
    for (const id of this.selected) {
      const m = this.meshes.get(id)!;
      m.material = this.highlightMat;
      // a hidden structure that is being looked up becomes visible again
      if (this.hidden.has(id)) this.hidden.delete(id);
    }
    if (this.selected.length) this.applyVisibility();
    if (frame && this.selected.length) {
      const box = new THREE.Box3();
      for (const id of this.selected) box.expandByObject(this.meshes.get(id)!);
      this.frameBox(box, 2.2);
    }
    this.invalidate();
    this.emit();
  }
  get selection() {
    return this.selected;
  }

  hide(ids: string[]) {
    const fresh = ids.filter((id) => !this.hidden.has(id));
    if (!fresh.length) return;
    this.hiddenHistory.push(fresh);
    for (const id of fresh) this.hidden.add(id);
    if (this.selected.some((id) => fresh.includes(id))) this.select([]);
    this.applyVisibility();
    this.emit();
  }
  undoHide() {
    const last = this.hiddenHistory.pop();
    if (!last) return;
    for (const id of last) this.hidden.delete(id);
    this.applyVisibility();
    this.emit();
  }
  /** Show only these (everything else in the loaded systems is hidden). */
  isolate(ids: string[]) {
    const keep = new Set(ids);
    const others = [...this.meshes.keys()].filter((id) => !keep.has(id) && !this.hidden.has(id));
    this.hide(others);
    const box = new THREE.Box3();
    for (const id of ids) if (this.meshes.has(id)) box.expandByObject(this.meshes.get(id)!);
    if (!box.isEmpty()) this.frameBox(box, 2);
  }
  showAll() {
    this.hidden.clear();
    this.hiddenHistory = [];
    this.applyVisibility();
    this.emit();
  }
  get hiddenCount() {
    return this.hidden.size;
  }

  /** Screen position of a 3D point (for labels), or null when behind the camera. */
  toScreen(p: THREE.Vector3): { x: number; y: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    const r = this.renderer.domElement;
    return {
      x: ((v.x + 1) / 2) * r.clientWidth,
      y: ((1 - v.y) / 2) * r.clientHeight,
    };
  }
  /** Is this point on (or right next to) the structure? Used to pin a bone's landmarks to the right bone. */
  isNear(id: string, p: [number, number, number], margin = 0.015) {
    const m = this.meshes.get(id);
    if (!m) return false;
    return new THREE.Box3()
      .setFromObject(m)
      .expandByScalar(margin)
      .containsPoint(new THREE.Vector3(p[0], p[1], p[2]));
  }
  pointToScreen(p: [number, number, number]) {
    return this.toScreen(new THREE.Vector3(p[0], p[1], p[2]));
  }
  centreOf(id: string): THREE.Vector3 | null {
    const m = this.meshes.get(id);
    if (!m) return null;
    return new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
  }

  /** Structures that are on screen now — for quizzes. */
  visibleIds(): string[] {
    return [...this.meshes.entries()].filter(([, m]) => m.visible && m.parent?.visible).map(([id]) => id);
  }

  /** Peel: hide the structure under the finger, like dissection. */
  peel(id: string) {
    this.hide([id]);
  }

  // ─── dismantle: pull every piece away from the centre, and let pieces be dragged ───

  get dismantled() {
    return this.explodeTarget > 0 || this.dragged.size > 0;
  }
  /** Pieces or camera still moving. */
  get animating() {
    return this.explodeNow !== this.explodeTarget || !!this.tween;
  }
  get spread() {
    return this.explodeTarget;
  }
  /** 0 = assembled, 1 = fully apart. */
  setDismantle(amount: number) {
    const a = Math.max(0, Math.min(1.5, amount));
    if (a > 0 && this.explodeNow === 0 && this.explodeTarget === 0) {
      // pieces move away from the centre of what is on screen now
      const box = new THREE.Box3();
      for (const m of this.meshes.values()) if (m.visible && m.parent?.visible && m.userData.homeCentre) box.expandByPoint(m.userData.homeCentre);
      if (!box.isEmpty()) box.getCenter(this.explodeCentre);
    }
    this.explodeTarget = a;
    // keep every piece in view as they spread out (or come back together)
    if (!this.studyId) {
      // leave room for the spread slider at the bottom
      const box = this.boxAt(a);
      const h = box.max.y - box.min.y;
      box.min.y -= h * 0.12;
      this.frameBox(box, this.camera.aspect < 1 ? 1.15 : 1.2, true);
    }
    this.invalidate();
    this.emit();
  }
  /** Where the visible pieces will be once the spread reaches this amount. */
  private boxAt(amount: number) {
    const box = new THREE.Box3();
    for (const m of this.meshes.values()) {
      if (!m.visible || !m.parent?.visible || !m.userData.homeWorld) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.userData.homeWorld);
      const off = (m.userData.homeCentre as THREE.Vector3).clone().sub(this.explodeCentre).multiply(SPREAD).multiplyScalar(amount);
      const d = this.dragged.get(m.userData.id);
      if (d) off.add(d);
      box.union(b.translate(off));
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 1.8, 0.2));
    return box;
  }
  /** Put everything back where it belongs. */
  reassemble() {
    this.dragged.clear();
    this.explodeTarget = 0;
    if (this.explodeNow === 0) this.applyOffsets();
    if (!this.studyId) this.frameBox(this.boxAt(0), 1.4, true);
    this.invalidate();
    this.emit();
  }
  private applyOffsets() {
    for (const m of this.meshes.values()) {
      const home = m.userData.home as THREE.Vector3 | undefined;
      if (!home) continue;
      const off = (m.userData.homeCentre as THREE.Vector3).clone().sub(this.explodeCentre).multiply(SPREAD).multiplyScalar(this.explodeNow);
      const d = this.dragged.get(m.userData.id);
      if (d) off.add(d);
      m.position.copy(home).add(off.applyMatrix3(m.userData.pinv));
      m.updateMatrixWorld(true);
    }
    this.invalidate();
  }
  private rayOnPlane(clientX: number, clientY: number, plane: THREE.Plane) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }
  /** Start moving a piece with the finger: it slides on a plane facing the student. */
  startDrag(id: string, clientX: number, clientY: number) {
    const c = this.centreOf(id);
    if (!c) return false;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()).negate(), c);
    const start = this.rayOnPlane(clientX, clientY, plane);
    if (!start) return false;
    this.dragging = {
      id,
      plane,
      start,
      base: (this.dragged.get(id) || new THREE.Vector3()).clone(),
    };
    this.controls.enabled = false;
    return true;
  }
  moveDrag(clientX: number, clientY: number) {
    const d = this.dragging;
    if (!d) return;
    const p = this.rayOnPlane(clientX, clientY, d.plane);
    if (!p) return;
    this.dragged.set(d.id, d.base.clone().add(p.sub(d.start)));
    this.applyOffsets();
  }
  endDrag() {
    const was = !!this.dragging;
    this.dragging = null;
    this.controls.enabled = true;
    if (was) this.emit();
    return was;
  }

  // ─── study one structure on its own ───

  study(id: string) {
    if (!this.meshes.has(id)) return;
    if (!this.studyId)
      this.beforeStudy = {
        pos: this.camera.position.clone(),
        target: this.controls.target.clone(),
      };
    this.studyId = id;
    if (this.selected.length || this.ghost) this.select([]);
    this.applyVisibility();
    this.frameStudy();
    this.emit();
  }
  endStudy() {
    if (!this.studyId) return;
    this.studyId = null;
    this.controls.autoRotate = false;
    this.applyVisibility();
    if (this.beforeStudy) this.animateCamera(this.beforeStudy.pos, this.beforeStudy.target);
    this.beforeStudy = null;
    this.emit();
  }
  private frameStudy(dir?: THREE.Vector3) {
    if (!this.studyId) return;
    const m = this.meshes.get(this.studyId);
    if (!m) return;
    this.frameBox(new THREE.Box3().setFromObject(m), 1.25, true, dir);
  }
  /** Look at the structure (or the whole view) from the front, back, either side, above or below. */
  viewFrom(d: ViewDir) {
    const t = this.studyId ? this.centreOf(this.studyId) || this.controls.target.clone() : this.controls.target.clone();
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.animateCamera(t.clone().add(new THREE.Vector3(...VIEW_DIR[d]).normalize().multiplyScalar(dist)), t);
  }
  setSpin(on: boolean) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 2.5;
    this.invalidate();
    this.emit();
  }
  get spinning() {
    return this.controls.autoRotate;
  }

  // ─── the named parts (landmarks) of a bone ───

  private worldVerts(m: THREE.Mesh): Float32Array {
    if (m.userData.wv) return m.userData.wv;
    const pos = m.geometry.getAttribute('position');
    const out = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    const mw = (m.userData.homeWorld as THREE.Matrix4) || m.matrixWorld;
    const box = new THREE.Box3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
      box.expandByPoint(v);
    }
    m.userData.wv = out;
    m.userData.hbox = box;
    return out;
  }
  private homeBox(m: THREE.Mesh): THREE.Box3 {
    this.worldVerts(m);
    return m.userData.hbox;
  }
  /** Distance from a point to the bone's surface (the true surface, not just its corner points). */
  private surface(m: THREE.Mesh, p: THREE.Vector3) {
    const wv = this.worldVerts(m);
    const index = m.geometry.index;
    const n = index ? index.count : wv.length / 3;
    const tri = new THREE.Triangle();
    const q = new THREE.Vector3();
    let best = Infinity;
    let at = -1;
    for (let t = 0; t < n; t += 3) {
      const i0 = index ? index.getX(t) : t;
      const i1 = index ? index.getX(t + 1) : t + 1;
      const i2 = index ? index.getX(t + 2) : t + 2;
      // skip triangles that are clearly far away
      const x = wv[i0 * 3] - p.x;
      const y = wv[i0 * 3 + 1] - p.y;
      const z = wv[i0 * 3 + 2] - p.z;
      if (x * x + y * y + z * z > 0.0036 && best < 0.02) continue;
      tri.a.set(wv[i0 * 3], wv[i0 * 3 + 1], wv[i0 * 3 + 2]);
      tri.b.set(wv[i1 * 3], wv[i1 * 3 + 1], wv[i1 * 3 + 2]);
      tri.c.set(wv[i2 * 3], wv[i2 * 3 + 1], wv[i2 * 3 + 2]);
      tri.closestPointToPoint(p, q);
      const d = q.distanceToSquared(p);
      if (d < best) {
        best = d;
        // the corner nearest the point gives the surface direction there
        const da = tri.a.distanceToSquared(p);
        const db = tri.b.distanceToSquared(p);
        const dc = tri.c.distanceToSquared(p);
        at = da <= db && da <= dc ? i0 : db <= dc ? i1 : i2;
      }
    }
    return { d: Math.sqrt(best), i: at };
  }
  /** One-word bone names ("femur", "tibia", "sacrum"): a landmark named after another bone is not this bone's. */
  private boneWords(system: SystemId) {
    const words = new Set<string>();
    for (const s of Object.values(this.catalogue.structures)) if (s.system === system && /^[a-z]{4,}$/i.test(s.name)) words.add(s.name.toLowerCase());
    return words;
  }
  /**
   * The landmarks that sit on this bone. The model stores most of them once (for one side), so the
   * mirror image is tried too, and each point goes to the bone whose surface it is on.
   */
  partsOf(id: string): PartPin[] {
    const cached = this.partsCache.get(id);
    if (cached) return cached;
    const s = this.catalogue.structures[id];
    const m = this.meshes.get(id);
    if (!s || !m || !m.userData.homeWorld) return [];
    const lms = (this.catalogue.landmarks || []).filter((l) => l.system === s.system);
    if (!lms.length) return [];
    const box = this.homeBox(m).clone().expandByScalar(0.015);
    const own = s.name.toLowerCase();
    const words = [...this.boneWords(s.system)].filter((w) => !own.includes(w));
    const ownWords = own.split(/\s+/).filter((w) => w.length >= 4 && !/^(bone|left|right)$/.test(w));
    const others = [...this.meshes.entries()].filter(([oid, o]) => oid !== id && this.catalogue.structures[oid]?.system === s.system && o.userData.homeWorld).map(([, o]) => o);
    const best = new Map<string, { d: number; p: THREE.Vector3; n: THREE.Vector3 }>();
    const otherNames = new Set(Object.values(this.catalogue.structures).filter((x) => x.system === s.system).map((x) => x.name.toLowerCase()));
    otherNames.delete(own);
    // the nearest other bone surface to a point (only bones whose box is close enough to matter)
    const otherDist = (p: THREE.Vector3) => {
      let d = Infinity;
      for (const o of others) if (this.homeBox(o).clone().expandByScalar(0.01).containsPoint(p)) d = Math.min(d, this.surface(o, p).d);
      return d;
    };
    for (const l of lms) {
      const raw = l.name.replace(/^\[(.*)\]$/, '$1');
      const ln = raw.toLowerCase();
      if (ln === own) continue;
      // collection names ("Bones of lower limb", "Pelvic girdle") and broken names are not landmarks
      if (/\b(bones|skeleton|girdle)\b|^bony |^pelvic (inlet|outlet)$/.test(ln) || (raw.match(/\(/g) || []).length !== (raw.match(/\)/g) || []).length) continue;
      if (words.some((w) => new RegExp(`\\b${w}`).test(ln))) continue; // "…of tibia" is the tibia's
      // "Temporal surface of frontal bone" belongs to the frontal bone, wherever its point lands
      const rawTail = ln.match(/ of (?:the )?(.+)$/)?.[1] || (PART_OF_BONE[ln] ? ln : undefined);
      const tail = rawTail && PART_OF_BONE[rawTail] ? PART_OF_BONE[rawTail] : rawTail;
      if (tail && tail !== own && (otherNames.has(tail) || PART_OF_BONE[rawTail!])) continue;
      const named = tail === own || ownWords.some((w) => ln.includes(w)); // "…of femur" on the femur
      const ends = [l.p, l.q || l.p];
      for (const sx of [1, -1]) {
        const a = new THREE.Vector3(ends[0][0] * sx, ends[0][1], ends[0][2]);
        const b = new THREE.Vector3(ends[1][0] * sx, ends[1][1], ends[1][2]);
        if (a.length() < 0.05 || (!box.containsPoint(a) && !box.containsPoint(b))) continue;
        // one end of the label line touches a bone (the landmark), the other is where the text sits
        const dma = this.surface(m, a).d;
        const dmb = l.q ? this.surface(m, b).d : Infinity;
        let p: THREE.Vector3, d: number, other: THREE.Vector3;
        if (named) {
          [p, d, other] = dma <= dmb ? [a, dma, b] : [b, dmb, a];
        } else {
          const doa = otherDist(a);
          const dob = l.q ? otherDist(b) : Infinity;
          const aTouches = Math.min(dma, doa) <= Math.min(dmb, dob);
          [p, d, other] = aTouches ? [a, dma, b] : [b, dmb, a];
          // at a joint two bones meet: the landmark belongs to the one whose surface it is on
          if ((aTouches ? doa : dob) < d - 0.0005) continue;
        }
        if (d > (named ? 0.02 : 0.01)) continue;
        const out = other.clone().sub(p);
        const n = out.length() > 0.002 ? out.normalize() : p.clone().sub(m.userData.homeCentre).normalize();
        const prev = best.get(raw);
        if (!prev || d < prev.d) best.set(raw, { d, p, n });
      }
    }
    const pins = [...best.entries()].map(([name, b]) => ({ name, p: b.p, n: b.n }));
    pins.sort((a, b) => b.p.y - a.p.y); // top of the bone first
    this.partsCache.set(id, pins);
    return pins;
  }
  /** Where a landmark is now (the bone may have been dismantled or dragged). */
  pinNow(id: string, pin: PartPin): THREE.Vector3 {
    const m = this.meshes.get(id);
    if (!m || !m.userData.homeWorld) return pin.p.clone();
    const now = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const home = new THREE.Vector3().setFromMatrixPosition(m.userData.homeWorld);
    return pin.p.clone().add(now.sub(home));
  }
  /** Is the landmark on the side of the bone that faces the student? */
  pinFacing(id: string, pin: PartPin) {
    const p = this.pinNow(id, pin);
    return pin.n.dot(this.camera.position.clone().sub(p)) > -0.002;
  }
  /** Turn the structure so this landmark faces the student. */
  showPin(id: string, pin: PartPin, centreOnPin = false) {
    const box = this.centreOf(id);
    if (!box) return;
    const p = this.pinNow(id, pin);
    // a quiz puts the point itself in the middle of the screen, clear of the question at the bottom
    const c = centreOnPin ? p.clone().lerp(box, 0.15) : box;
    const dir = pin.n.clone().multiplyScalar(0.75).add(p.clone().sub(box).normalize().multiplyScalar(0.25)).normalize();
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.animateCamera(c.clone().add(dir.multiplyScalar(dist)), c);
  }
}
