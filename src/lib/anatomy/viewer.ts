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
  p: [number, number, number];
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

  constructor(
    private host: HTMLElement,
    readonly catalogue: Catalogue,
    private base = '/anatomy',
  ) {
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 300;
    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 50);
    this.camera.position.set(0, 1.0, 3.2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
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

    this.highlightMat = new THREE.MeshStandardMaterial({ color: HIGHLIGHT, emissive: HIGHLIGHT, emissiveIntensity: 0.35, roughness: 0.5, side: THREE.DoubleSide });

    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      // only draw when something changed (or the camera is still gliding)
      if (this.controls.update() || this.needsRender) {
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
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
            const mat = new THREE.MeshStandardMaterial({ color: col, roughness: sid === 'muscles' ? 0.5 : 0.62, metalness: 0.02, side: THREE.DoubleSide, clippingPlanes: [] });
            mats.push(mat);
            m.userData.mat = mat;
            m.material = mat;
            this.meshes.set(key, m);
          });
          this.groups.set(sid, group);
          this.scene.add(group);
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
    for (const [sid, g] of this.groups) g.visible = this.visibleSystems.has(sid);
    for (const [id, m] of this.meshes) {
      const s = this.catalogue.structures[id];
      if (!s) continue;
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

  private frameBox(box: THREE.Box3, pad = 1.4) {
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 0.3;
    const dist = (size * pad) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c.clone().add(dir.multiplyScalar(Math.max(dist, 0.12))));
    this.camera.near = Math.max(0.005, dist / 200);
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  frameVisible() {
    this.frameBox(this.visibleBox());
  }

  resetView() {
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
      if (this.xray && s.system !== 'nervous' && s.system !== 'vessels' && hits.some((x) => x !== h && ['nervous', 'vessels'].includes(this.catalogue.structures[x.object.userData.id]?.system))) continue;
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
      if (core.length >= 5) real = Object.entries(this.catalogue.structures).filter(([, s]) => !s.role && s.system === 'muscles' && new RegExp(`\\b${core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(s.name.toLowerCase()));
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
    return { x: ((v.x + 1) / 2) * r.clientWidth, y: ((1 - v.y) / 2) * r.clientHeight };
  }
  /** Is this point on (or right next to) the structure? Used to pin a bone's landmarks to the right bone. */
  isNear(id: string, p: [number, number, number], margin = 0.015) {
    const m = this.meshes.get(id);
    if (!m) return false;
    return new THREE.Box3().setFromObject(m).expandByScalar(margin).containsPoint(new THREE.Vector3(p[0], p[1], p[2]));
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
}
