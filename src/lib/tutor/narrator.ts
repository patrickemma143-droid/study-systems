import { meterAudio, stopMeter } from './meter';

// The tutor's voice. Natural AI voice from the server (small MP3s, shared and cached), the phone's
// own voice when that isn't available, or silent with captions. One "track" per lesson step.

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
}

const WPS = 2.6; // spoken words per second at normal speed

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
  time() {
    return this.acc + (this.running ? ((performance.now() - this.start) / 1000) * this.rate : 0);
  }
}

function estimate(text: string, rate: number) {
  return Math.max(2, text.split(/\s+/).length / WPS / rate + 0.4);
}

/** Natural voice: an MP3 from the server. */
class AudioTrack implements Track {
  ended = false;
  private cbs: (() => void)[] = [];
  constructor(
    private audio: HTMLAudioElement,
    readonly duration: number,
  ) {
    audio.onended = () => this.finish();
  }
  private finish() {
    if (this.ended) return;
    this.ended = true;
    for (const cb of this.cbs) cb();
  }
  time() {
    return this.audio.currentTime;
  }
  play() {
    if (this.ended) return;
    meterAudio(this.audio);
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
    stopMeter(this.audio);
    this.cbs = [];
  }
  onEnd(cb: () => void) {
    this.cbs.push(cb);
  }
}

/** The phone's own voice (speechSynthesis), or silence: timed by a clock. */
class ClockTrack implements Track {
  ended = false;
  private cbs: (() => void)[] = [];
  private clock: Clock;
  private timer = 0;
  private utter: SpeechSynthesisUtterance | null = null;
  readonly duration: number;
  constructor(
    private text: string,
    private speakAloud: boolean,
    private rate: number,
  ) {
    this.duration = estimate(text, rate);
    this.clock = new Clock();
  }
  private finish() {
    if (this.ended) return;
    this.ended = true;
    window.clearTimeout(this.timer);
    for (const cb of this.cbs) cb();
  }
  time() {
    return Math.min(this.duration, this.clock.time());
  }
  play() {
    if (this.ended) return;
    this.clock.play();
    if (this.speakAloud && 'speechSynthesis' in window) {
      // pausing speech is unreliable on phones, so a paused step starts its sentence again
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(this.text);
      u.rate = this.rate;
      u.lang = 'en-GB';
      u.onend = () => {
        if (this.utter === u) this.finish();
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
}

export class Narrator {
  private cache = new Map<string, Promise<{ url: string; duration: number } | null>>();
  private failed = false;
  rate = 1;
  constructor(
    public mode: VoiceMode,
    private onFallback: (reason: string) => void,
    /** the chosen tutor's natural voice and accent */
    private voice?: { name: string; accent: string },
  ) {
    if (mode === 'device' && !('speechSynthesis' in window)) this.mode = 'silent';
  }

  /** Fetch a step's natural voice in the background (the next step, while this one plays). */
  prefetch(text: string) {
    if (this.mode !== 'natural' || this.failed || this.cache.has(text)) return;
    this.cache.set(
      text,
      fetch('/api/tutor/voice', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: this.voice?.name, accent: this.voice?.accent }) })
        .then(async (r) => {
          if (!r.ok) {
            const msg = (await r.json().catch(() => null))?.error || 'The natural voice is not available right now.';
            if (!this.failed) {
              this.failed = true;
              this.onFallback(msg);
            }
            return null;
          }
          const ms = Number(r.headers.get('X-Duration-Ms')) || 0;
          const blob = await r.blob();
          return { url: URL.createObjectURL(blob), duration: ms / 1000 };
        })
        .catch(() => {
          if (!this.failed) {
            this.failed = true;
            this.onFallback('No connection for the natural voice.');
          }
          return null;
        }),
    );
  }

  async track(text: string): Promise<Track> {
    if (this.mode === 'natural' && !this.failed) {
      this.prefetch(text);
      const got = await this.cache.get(text);
      if (got) {
        const audio = new Audio(got.url);
        audio.playbackRate = this.rate;
        audio.preservesPitch = true;
        const dur = (got.duration || (await new Promise<number>((res) => {
          audio.onloadedmetadata = () => res(audio.duration);
          audio.onerror = () => res(estimate(text, 1));
        }))) / this.rate;
        return new AudioTrackRated(audio, dur, this.rate);
      }
    }
    const aloud = this.mode !== 'silent' && (this.mode === 'device' || this.failed) && 'speechSynthesis' in window;
    return new ClockTrack(text, aloud, this.rate);
  }

  dispose() {
    for (const p of this.cache.values()) void p.then((x) => x && URL.revokeObjectURL(x.url));
    this.cache.clear();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

/** An audio track whose clock is in "lesson seconds" (so board timing matches at 1.25× speed). */
class AudioTrackRated extends AudioTrack {
  constructor(
    audio: HTMLAudioElement,
    duration: number,
    private r: number,
  ) {
    super(audio, duration);
  }
  time() {
    return super.time() / this.r;
  }
}
