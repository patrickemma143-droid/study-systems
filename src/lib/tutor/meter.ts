// Measures the tutor's natural voice while it plays (loudness and how "bright" it sounds), so the 3D
// tutor's lips follow the real speech. Audio is only routed through Web Audio once the context is
// running (after a tap), so the voice is never silenced by a browser's autoplay rules.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let current: HTMLMediaElement | null = null;
const routed = new WeakSet<HTMLMediaElement>();
let buf: Float32Array<ArrayBuffer> | null = null;
let freq: Uint8Array<ArrayBuffer> | null = null;

/** Call from a tap (e.g. "Start the lesson") so measuring can begin. */
export function unlockMeter() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Start measuring this audio element (the step being spoken). */
export function meterAudio(el: HTMLMediaElement) {
  if (!ctx || ctx.state !== 'running') return;
  try {
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35;
      analyser.connect(ctx.destination);
      buf = new Float32Array(analyser.fftSize);
      freq = new Uint8Array(analyser.frequencyBinCount);
    }
    if (!routed.has(el)) {
      ctx.createMediaElementSource(el).connect(analyser);
      routed.add(el);
    }
    current = el;
  } catch {
    /* already routed elsewhere, or not allowed: the tutor uses a speaking rhythm instead */
  }
}

export function stopMeter(el?: HTMLMediaElement) {
  if (!el || el === current) current = null;
}

/** null when nothing is being measured. level 0..1; bright 0..1 (high = "ee"/"s", low = "oo"). */
export function voiceLevel(): { level: number; bright: number } | null {
  if (!analyser || !current || current.paused || current.ended || !buf || !freq) return null;
  analyser.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const rms = Math.sqrt(s / buf.length);
  analyser.getByteFrequencyData(freq);
  const hz = (ctx!.sampleRate / 2) / freq.length;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < freq.length; i++) {
    const f = i * hz;
    if (f > 250 && f < 1200) lo += freq[i];
    else if (f > 2000 && f < 6000) hi += freq[i];
  }
  const bright = hi + lo > 0 ? Math.min(1, (hi / (hi + lo)) * 1.8) : 0.5;
  return { level: Math.min(1, rms * 5.5), bright };
}
