import { envelope, LipSync, REST, type Mouth } from './visemes';
import { accentById } from '../../../shared/tutors';

// The tutor's voice. Natural AI voice from the server (small MP3s, shared and cached), the phone's
// own voice when that isn't available, or silent with captions. One "track" per thing said. Every
// track also knows the shape of the tutor's mouth at each moment (lip sync).

export type VoiceMode = 'natural' | 'device' | 'silent';

export interface Track {
  /** seconds */
  readonly duration: number;
  /** seconds played so far */
  time(): number;
  play(): void;
  pause(): void;
  stop(): void;
  readonly ended: boolean;
  onEnd(cb: () => void): void;
  /** the mouth right now (closed when paused or finished) */
  mouth(): Mouth;
}

const WPS = 2.6; // spoken words per second at normal speed
const SEC_PER_UNIT = 0.072; // lip-sync units per second at normal speed (see visemes.ts)

/** A pausable clock for when we can't read the audio's own position. */
class Clock {
  private start = 0;
  private acc = 0;
  running = false;
  constructor(private rate = 1) {}
  play() {
    if (!this.running) {
      this.start = performance.now();
      this.running = true;
    }
  }
  pause() {
    if (this.running) {
      this.acc += ((performance.now() - this.start) / 1000) * this.rate;
      this.running = false;
    }
  }
  set(t: number) {
    this.acc = t;
    if (this.running) this.start = performance.now();
  }
  time() {
    return this.acc + (this.running ? ((performance.now() - this.start) / 1000) * this.rate : 0);
  }
}

function estimate(text: string, rate: number) {
  return Math.max(2, text.split(/\s+/).length / WPS / rate + 0.4);
}

let decoder: OfflineAudioContext | null = null;
/** Loudness of a clip every 10 ms, for lip sync. Null if this browser can't decode it. */
async function measure(blob: Blob) {
  try {
    const OAC = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!OAC) return null;
    decoder ??= new OAC(1, 1, 16000);
    const buf = await decoder.decodeAudioData(await blob.arrayBuffer());
    return envelope(buf);
  } catch {
    return null;
  }
}

/** Natural voice: an MP3 from the server. Its clock is in "lesson seconds" (so board timing matches at 1.25× speed). */
class AudioTrack implements Track {
  ended = false;
  private cbs: (() => void)[] = [];
  constructor(
    private audio: HTMLAudioElement,
    readonly duration: number,
    private rate: number,
    private lip: LipSync,
  ) {
    audio.onended = () => this.finish();
  }
  private finish() {
    if (this.ended) return;
    this.ended = true;
    for (const cb of this.cbs) cb();
  }
  time() {
    return this.audio.currentTime / this.rate;
  }
  play() {
    if (this.ended) return;
    this.audio.play().catch(() => {
      /* the browser blocked sound (no tap yet): carry on silently */
      window.setTimeout(() => this.finish(), this.duration * 1000);
    });
  }
  pause() {
    this.audio.pause();
  }
  stop() {
    this.audio.pause();
    this.cbs = [];
  }
  onEnd(cb: () => void) {
    this.cbs.push(cb);
  }
  mouth() {
    if (this.ended || this.audio.paused) return REST;
    // the audio's own position (media time), which is what the lip-sync was measured against
    return this.lip.atTime(this.audio.currentTime);
  }
}

/** The phone's own voice (speechSynthesis), or silence: timed by a clock. */
class ClockTrack implements Track {
  ended = false;
  private cbs: (() => void)[] = [];
  private clock: Clock;
  private timer = 0;
  private utter: SpeechSynthesisUtterance | null = null;
  /** lip-sync position, in units, and when it was last set by the voice */
  private unitBase = 0;
  private unitAt = 0;
  private talking = false;
  readonly duration: number;
  constructor(
    private text: string,
    private speakAloud: boolean,
    private rate: number,
    private lip: LipSync,
    private voice: SpeechSynthesisVoice | null,
    private lang: string,
  ) {
    this.duration = speakAloud ? estimate(text, rate) : Math.max(1.5, (lip.total * SEC_PER_UNIT) / rate + 0.3);
    this.clock = new Clock();
  }
  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.talking = false;
    window.clearTimeout(this.timer);
    for (const cb of this.cbs) cb();
  }
  time() {
    return Math.min(this.duration, this.clock.time());
  }
  play() {
    if (this.ended) return;
    this.clock.play();
    this.talking = true;
    this.unitBase = 0;
    this.unitAt = performance.now();
    if (this.speakAloud && 'speechSynthesis' in window) {
      // pausing speech is unreliable on phones, so a paused step starts its sentence again
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(this.text);
      u.rate = this.rate;
      u.lang = this.lang;
      if (this.voice) u.voice = this.voice;
      u.onend = () => {
        if (this.utter === u) this.finish();
      };
      // the phone tells us which word it is saying: keep the mouth on that word
      u.onboundary = (e) => {
        if (this.utter !== u || e.name === 'sentence') return;
        this.unitBase = this.lip.unitsAtChar(e.charIndex);
        this.unitAt = performance.now();
      };
      this.utter = u;
      window.speechSynthesis.speak(u);
    }
    // never wait forever: the clock ends the step if the voice goes quiet
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.finish(), (this.duration - this.time()) * 1000 + (this.speakAloud ? 4000 : 0));
  }
  pause() {
    this.clock.pause();
    this.talking = false;
    window.clearTimeout(this.timer);
    if (this.speakAloud && 'speechSynthesis' in window) {
      this.utter = null;
      window.speechSynthesis.cancel();
    }
  }
  stop() {
    this.pause();
    this.cbs = [];
  }
  onEnd(cb: () => void) {
    this.cbs.push(cb);
  }
  mouth() {
    if (!this.talking || this.ended) return REST;
    const u = this.unitBase + ((performance.now() - this.unitAt) / 1000 / SEC_PER_UNIT) * this.rate;
    return this.lip.atUnits(Math.min(u, this.lip.total - 0.01));
  }
}

/** The phone's best voice for an accent (by language, preferring natural-sounding ones). */
function deviceVoice(lang: string, gender?: 'f' | 'm'): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return null;
  const want = lang.toLowerCase();
  const base = want.split('-')[0];
  const score = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase().replace('_', '-');
    let s = l === want ? 10 : l.startsWith(base) ? 3 : 0;
    if (/natural|neural|premium|enhanced|google/i.test(v.name)) s += 2;
    if (gender && (gender === 'f' ? /female|woman|zira|susan|hazel|libby|sonia|natasha|samantha|karen|moira|tessa|veena/i : /\bmale\b|man|david|george|ryan|william|daniel|thomas|rishi|james/i).test(v.name)) s += 1;
    return s;
  };
  const best = [...all].sort((a, b) => score(b) - score(a))[0];
  return best && score(best) >= 3 ? best : null;
}

export class Narrator {
  private cache = new Map<string, Promise<{ url: string; duration: number; blob: Blob } | null>>();
  private envs = new Map<string, Promise<ReturnType<typeof envelope> | null>>();
  private failed = false;
  rate = 1;
  constructor(
    public mode: VoiceMode,
    private onFallback: (reason: string) => void,
    /** the chosen tutor's natural voice and accent */
    private voice?: { name: string; accent: string; gender?: 'f' | 'm' },
  ) {
    if (mode === 'device' && !('speechSynthesis' in window)) this.mode = 'silent';
    // voices load late on some browsers: pick the phone's voice once they are there, and keep it
    if ('speechSynthesis' in window) {
      this.pickDeviceVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', this.pickDeviceVoice);
    }
  }

  /** The phone's voice for this tutor and accent — chosen once, so every line is the same voice. */
  private deviceChoice: SpeechSynthesisVoice | null = null;
  private pickDeviceVoice = () => {
    if (this.deviceChoice) return;
    this.deviceChoice = deviceVoice(accentById(this.voice?.accent).lang, this.voice?.gender);
  };

  /** Fetch something's natural voice in the background (the next step, while this one plays). */
  prefetch(text: string) {
    if (this.mode !== 'natural' || this.failed || this.cache.has(text)) return;
    const get = () => fetch('/api/tutor/voice', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: this.voice?.name, accent: this.voice?.accent }) });
    const giveUp = (msg: string) => {
      // switching voice changes how the tutor sounds, so it happens once and then stays
      if (!this.failed) {
        this.failed = true;
        this.onFallback(msg);
      }
      return null;
    };
    const p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await get();
          if (r.ok) {
            const ms = Number(r.headers.get('X-Duration-Ms')) || 0;
            const blob = await r.blob();
            return { url: URL.createObjectURL(blob), duration: ms / 1000, blob };
          }
          // the day's allowance or a switched-off voice won't change by trying again
          if (r.status === 429 || r.status === 403 || attempt === 1) return giveUp((await r.json().catch(() => null))?.error || 'The natural voice is not available right now.');
        } catch {
          if (attempt === 1) return giveUp('No connection for the natural voice.');
        }
        await new Promise((res) => window.setTimeout(res, 900));
      }
      return null;
    })();
    this.cache.set(text, p);
    this.envs.set(text, p.then((x) => (x ? measure(x.blob) : null)));
  }

  async track(text: string): Promise<Track> {
    const lip = new LipSync(text);
    if (this.mode === 'natural' && !this.failed) {
      this.prefetch(text);
      const got = await this.cache.get(text);
      if (got) {
        const audio = new Audio(got.url);
        audio.playbackRate = this.rate;
        audio.preservesPitch = true;
        const media =
          got.duration ||
          (await new Promise<number>((res) => {
            audio.onloadedmetadata = () => res(audio.duration);
            audio.onerror = () => res(estimate(text, 1));
          }));
        // the measuring is quick (a few ms), but never hold the lesson up for it
        const env = await Promise.race([this.envs.get(text) || Promise.resolve(null), new Promise<null>((r) => window.setTimeout(() => r(null), 600))]);
        lip.align(media, env);
        return new AudioTrack(audio, media / this.rate, this.rate, lip);
      }
    }
    const aloud = this.mode !== 'silent' && (this.mode === 'device' || this.failed) && 'speechSynthesis' in window;
    const lang = accentById(this.voice?.accent).lang;
    if (aloud) this.pickDeviceVoice();
    return new ClockTrack(text, aloud, this.rate, lip, aloud ? this.deviceChoice : null, lang);
  }

  dispose() {
    if ('speechSynthesis' in window) window.speechSynthesis.removeEventListener?.('voiceschanged', this.pickDeviceVoice);
    for (const p of this.cache.values()) void p.then((x) => x && URL.revokeObjectURL(x.url));
    this.cache.clear();
    this.envs.clear();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}
