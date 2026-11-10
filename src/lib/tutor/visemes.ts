// Lip sync: the tutor's words become a timeline of mouth shapes (visemes), lined up with the real
// audio. The text is split into sounds (a few English spelling rules are enough for a cartoon
// mouth), each sound gets a share of time, and the phrases between commas and full stops are matched
// to the stretches of speech found in the audio, so pauses land where the voice really pauses. The
// loudness of the audio then opens or closes the mouth a little more.

export interface Mouth {
  /** jaw open 0..1 */
  open: number;
  /** lips stretched wide (ee) 0..1 */
  wide: number;
  /** lips rounded (oo) 0..1 */
  round: number;
  /** top teeth showing 0..1 */
  teeth: number;
  /** tongue showing (th, l) 0..1 */
  tongue: number;
  /** lips pressed together (m, b, p) 0..1 */
  press: number;
  /** lower lip tucked under the teeth (f, v) 0..1 */
  bite: number;
}

type V = 'rest' | 'MBP' | 'FV' | 'TH' | 'L' | 'AI' | 'E' | 'I' | 'O' | 'U' | 'CH' | 'etc';

export const REST: Mouth = { open: 0, wide: 0.15, round: 0, teeth: 0, tongue: 0, press: 0.2, bite: 0 };
const SHAPES: Record<V, Mouth> = {
  rest: REST,
  MBP: { open: 0, wide: 0.2, round: 0, teeth: 0, tongue: 0, press: 1, bite: 0 },
  FV: { open: 0.12, wide: 0.35, round: 0, teeth: 1, tongue: 0, press: 0, bite: 1 },
  TH: { open: 0.3, wide: 0.35, round: 0, teeth: 0.8, tongue: 1, press: 0, bite: 0 },
  L: { open: 0.42, wide: 0.3, round: 0, teeth: 0.7, tongue: 0.8, press: 0, bite: 0 },
  AI: { open: 0.95, wide: 0.45, round: 0, teeth: 0.4, tongue: 0.2, press: 0, bite: 0 },
  E: { open: 0.5, wide: 0.75, round: 0, teeth: 0.8, tongue: 0, press: 0, bite: 0 },
  I: { open: 0.35, wide: 0.95, round: 0, teeth: 0.9, tongue: 0, press: 0, bite: 0 },
  O: { open: 0.7, wide: 0, round: 0.85, teeth: 0, tongue: 0, press: 0, bite: 0 },
  U: { open: 0.3, wide: 0, round: 1, teeth: 0, tongue: 0, press: 0, bite: 0 },
  CH: { open: 0.3, wide: 0.2, round: 0.55, teeth: 1, tongue: 0, press: 0, bite: 0 },
  etc: { open: 0.32, wide: 0.45, round: 0, teeth: 0.75, tongue: 0.1, press: 0, bite: 0 },
};

interface Ev {
  v: V;
  /** length in "units" (about 70 ms each at normal speed) */
  u: number;
  /** a real pause (comma, full stop), not just a gap between words */
  pause?: boolean;
  /** where it starts in the text */
  ch: number;
}

const DIGIT = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** One word's sounds. */
function wordSounds(word: string, at: number, out: Ev[]) {
  const w = word.toLowerCase().replace(/\d/g, (d) => DIGIT[Number(d)] + ' ');
  const push = (v: V, u: number) => out.push({ v, u, ch: at });
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    const c = w[i];
    if (!/[a-z]/.test(c)) {
      i++;
      continue;
    }
    // a silent e at the end of a word
    if (c === 'e' && i === w.length - 1 && i > 1) break;
    if (two === 'th') (push('TH', 0.8), (i += 2));
    else if (two === 'sh' || two === 'ch' || two === 'tch') (push('CH', 0.9), (i += 2));
    else if (two === 'ph') (push('FV', 0.8), (i += 2));
    else if (two === 'oo' || two === 'ou' || two === 'ew') (push('U', 1.2), (i += 2));
    else if (two === 'ee' || two === 'ea' || two === 'ie') (push('I', 1.2), (i += 2));
    else if (two === 'ai' || two === 'ay') (push('E', 1.1), (i += 2));
    else if (two === 'oa' || two === 'ow' || two === 'oi' || two === 'oy') (push('O', 1.2), (i += 2));
    else if (two === 'qu') (push('U', 0.7), push('etc', 0.5), (i += 2));
    else if (two === 'ng' || two === 'ck') (push('etc', 0.6), (i += 2));
    else {
      if (c === 'a') push('AI', 1);
      else if (c === 'e') push('E', 0.9);
      else if (c === 'i' || c === 'y') push(i === 0 && c === 'y' ? 'etc' : 'I', 0.85);
      else if (c === 'o') push('O', 1);
      else if (c === 'u') push('U', 0.9);
      else if (c === 'm' || c === 'b' || c === 'p') push('MBP', 0.75);
      else if (c === 'f' || c === 'v') push('FV', 0.7);
      else if (c === 'w') push('U', 0.7);
      else if (c === 'l') push('L', 0.7);
      else if (c === 'j' || c === 'g') push(c === 'j' ? 'CH' : 'etc', 0.7);
      else if (c === 'r') push('CH', 0.55);
      else push('etc', 0.55);
      i++;
    }
  }
}

/** The text as a list of sounds and pauses. */
function sounds(text: string): Ev[] {
  const out: Ev[] = [];
  const re = /([A-Za-z0-9'’]+)|([.!?…]+)|([,;:—–()]+|\s-\s)/g;
  let m: RegExpExecArray | null;
  let lastWordEnd = -1;
  while ((m = re.exec(text))) {
    if (m[1]) {
      if (lastWordEnd >= 0 && out.length && !out[out.length - 1].pause) out.push({ v: 'rest', u: 0.35, ch: m.index });
      wordSounds(m[1], m.index, out);
      lastWordEnd = m.index + m[1].length;
    } else if (out.length) {
      out.push({ v: 'rest', u: m[2] ? 4.5 : 2.6, pause: true, ch: m.index });
      lastWordEnd = -1;
    }
  }
  return out;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function mixMouth(a: Mouth, b: Mouth, k: number): Mouth {
  return { open: lerp(a.open, b.open, k), wide: lerp(a.wide, b.wide, k), round: lerp(a.round, b.round, k), teeth: lerp(a.teeth, b.teeth, k), tongue: lerp(a.tongue, b.tongue, k), press: lerp(a.press, b.press, k), bite: lerp(a.bite, b.bite, k) };
}

/** Loudness of a decoded voice, every 10 ms (0..1, scaled to the loudest moment). */
export function envelope(buffer: AudioBuffer): { env: Float32Array; step: number } {
  const step = 0.01;
  const data = buffer.getChannelData(0);
  const per = Math.max(1, Math.round(buffer.sampleRate * step));
  const n = Math.ceil(data.length / per);
  const env = new Float32Array(n);
  let peak = 1e-6;
  for (let f = 0; f < n; f++) {
    let s = 0;
    const a = f * per;
    const b = Math.min(data.length, a + per);
    for (let i = a; i < b; i += 2) s += data[i] * data[i];
    env[f] = Math.sqrt(s / Math.max(1, (b - a) / 2));
    if (env[f] > peak) peak = env[f];
  }
  for (let f = 0; f < n; f++) env[f] = Math.min(1, env[f] / (peak * 0.8));
  return { env, step };
}

export class LipSync {
  private ev: Ev[];
  /** start of each sound, in units */
  private start: number[];
  readonly total: number;
  /** (seconds, units) points: the audio clock mapped onto the sounds */
  private knots: [number, number][] = [];
  private env: Float32Array | null = null;
  private envStep = 0.01;

  constructor(text: string) {
    this.ev = sounds(text);
    this.start = [];
    let u = 0;
    for (const e of this.ev) {
      this.start.push(u);
      u += e.u;
    }
    this.total = u || 1;
  }

  /** Line the sounds up with an audio clip of `duration` seconds (and its loudness, when known). */
  align(duration: number, envInfo?: { env: Float32Array; step: number } | null) {
    this.env = envInfo?.env || null;
    this.envStep = envInfo?.step || 0.01;
    const plain = (): [number, number][] => [
      [Math.min(0.12, duration * 0.05), 0],
      [Math.max(0.2, duration - Math.min(0.15, duration * 0.05)), this.total],
    ];
    if (!this.env) {
      this.knots = plain();
      return;
    }
    // stretches of speech in the audio
    const env = this.env;
    const thr = 0.14;
    let segs: [number, number][] = [];
    let on = -1;
    for (let f = 0; f <= env.length; f++) {
      const v = f < env.length && env[f] > thr;
      if (v && on < 0) on = f;
      else if (!v && on >= 0) {
        segs.push([on * this.envStep, f * this.envStep]);
        on = -1;
      }
    }
    // join little gaps (between words), drop clicks
    const joined: [number, number][] = [];
    for (const s of segs) {
      const last = joined[joined.length - 1];
      if (last && s[0] - last[1] < 0.16) last[1] = s[1];
      else joined.push([s[0], s[1]]);
    }
    segs = joined.filter((s) => s[1] - s[0] > 0.06);
    // phrases in the text: runs of sounds between pauses
    let phrases: { a: number; b: number; pause: number }[] = [];
    let a = 0;
    this.ev.forEach((e, i) => {
      if (e.pause) {
        if (this.start[i] > a) phrases.push({ a, b: this.start[i], pause: e.u });
        a = this.start[i] + e.u;
      }
    });
    if (this.total > a) phrases.push({ a, b: this.total, pause: 0 });
    if (!segs.length || !phrases.length) {
      this.knots = plain();
      return;
    }
    // make the counts match: merge the closest speech stretches, or the phrases with the shortest pause
    while (segs.length > phrases.length) {
      let k = 0;
      for (let i = 1; i < segs.length - 1; i++) if (segs[i + 1][0] - segs[i][1] < segs[k + 1][0] - segs[k][1]) k = i;
      segs.splice(k, 2, [segs[k][0], segs[k + 1][1]]);
    }
    while (phrases.length > segs.length) {
      let k = 0;
      for (let i = 1; i < phrases.length - 1; i++) if (phrases[i].pause < phrases[k].pause) k = i;
      phrases.splice(k, 2, { a: phrases[k].a, b: phrases[k + 1].b, pause: phrases[k + 1].pause });
    }
    this.knots = [];
    phrases.forEach((p, i) => {
      this.knots.push([segs[i][0], p.a], [segs[i][1], p.b]);
    });
    phrases = [];
  }

  /** Where in the sounds the audio is at `t` seconds. */
  unitsAt(t: number): number {
    const k = this.knots;
    if (!k.length) return 0;
    if (t <= k[0][0]) return k[0][1] - 0.001;
    for (let i = 0; i < k.length - 1; i++) {
      if (t <= k[i + 1][0]) {
        const span = k[i + 1][0] - k[i][0];
        return span > 0 ? lerp(k[i][1], k[i + 1][1], (t - k[i][0]) / span) : k[i + 1][1];
      }
    }
    return this.total + 1;
  }

  /** Units before a character in the text (the phone's voice reports which word it is on). */
  unitsAtChar(ch: number): number {
    for (let i = 0; i < this.ev.length; i++) if (this.ev[i].ch >= ch) return this.start[i];
    return this.total;
  }

  /** The mouth `u` units into the sounds. Neighbouring sounds blend (as real mouths do). */
  atUnits(u: number): Mouth {
    if (u < 0 || u >= this.total) return REST;
    let lo = 0;
    let hi = this.ev.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.start[mid] <= u) lo = mid;
      else hi = mid - 1;
    }
    const e = this.ev[lo];
    const k = (u - this.start[lo]) / e.u;
    const cur = SHAPES[e.v];
    const next = SHAPES[this.ev[lo + 1]?.v || 'rest'];
    // ease into the next shape over the last 35% of this one
    return k > 0.65 ? mixMouth(cur, next, (k - 0.65) / 0.35) : cur;
  }

  /** The mouth at `t` seconds into the audio. */
  atTime(t: number): Mouth {
    const m = this.atUnits(this.unitsAt(t));
    if (!this.env) return m;
    const f = Math.floor(t / this.envStep);
    const loud = this.env[Math.max(0, Math.min(this.env.length - 1, f))] || 0;
    if (loud < 0.06) return mixMouth(m, REST, 0.85);
    // louder speech opens the jaw a little more; quiet speech a little less
    return m.press > 0.5 ? m : { ...m, open: Math.min(1, m.open * (0.55 + loud * 0.75)) };
  }
}
