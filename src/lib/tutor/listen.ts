// Talking to the tutor. Uses the browser's speech recognition where it exists (Chrome, Edge,
// Android, Safari); otherwise records a short WAV clip that the server sends to the AI to hear.

export const recognitionSupported = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
export const recordingSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && !!(window.AudioContext || (window as any).webkitAudioContext);

export interface Listening {
  stop(): void;
}

/** Listen for one sentence. onInterim shows the words as they come; onFinal gets the whole thing. */
export function listenOnce(opts: { onInterim?: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError?: (msg: string) => void }): Listening {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-GB';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    opts.onInterim?.((final + ' ' + interim).trim());
  };
  rec.onerror = (e: any) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') opts.onError?.('Allow the microphone to talk to your tutor.');
    else if (e.error === 'no-speech') opts.onError?.('I didn’t hear anything. Tap the mic and try again.');
    else if (e.error !== 'aborted') opts.onError?.('The microphone didn’t work. You can type instead.');
  };
  rec.onend = () => {
    if (final.trim()) opts.onFinal(final.trim());
    opts.onEnd();
  };
  rec.start();
  return { stop: () => rec.stop() };
}

/** Record up to maxMs of speech as a small 16 kHz mono WAV (as a data: URL). */
export async function recordWav(maxMs = 15000): Promise<{ stop: () => Promise<string>; level: () => number }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let level = 0;
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    let sum = 0;
    for (let i = 0; i < d.length; i += 64) sum += d[i] * d[i];
    level = Math.sqrt(sum / (d.length / 64));
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  let timer = 0;
  let done: Promise<string> | null = null;
  const finish = () => {
    if (done) return done;
    done = (async () => {
      window.clearTimeout(timer);
      proc.disconnect();
      src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate;
      await ctx.close().catch(() => {});
      // join, then shrink to 16 kHz
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(total);
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      const ratio = rate / 16000;
      const n = Math.floor(total / ratio);
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const v = Math.max(-1, Math.min(1, all[Math.floor(i * ratio)]));
        pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      const buf = new ArrayBuffer(44 + pcm.length * 2);
      const view = new DataView(buf);
      const w = (off: number, s: string) => [...s].forEach((ch, i) => view.setUint8(off + i, ch.charCodeAt(0)));
      w(0, 'RIFF');
      view.setUint32(4, 36 + pcm.length * 2, true);
      w(8, 'WAVE');
      w(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 16000, true);
      view.setUint32(28, 32000, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      w(36, 'data');
      view.setUint32(40, pcm.length * 2, true);
      new Int16Array(buf, 44).set(pcm);
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:audio/wav;base64,${btoa(bin)}`;
    })();
    return done;
  };
  timer = window.setTimeout(() => void finish(), maxMs);
  return { stop: finish, level: () => level };
}

/** Which option did the student say? ("B", "option two", "the mitochondria"…). -1 if unclear. */
export function matchOption(said: string, options: string[]): number {
  const t = said.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const letters = ['a', 'b', 'c', 'd'];
  const words = ['one', 'two', 'three', 'four'];
  const ord = ['first', 'second', 'third', 'fourth'];
  const m = t.match(/^(?:it s |its |option |answer |letter |the answer is )?([abcd])(?: |$)/);
  if (m) return letters.indexOf(m[1]);
  for (let i = 0; i < options.length; i++) if (new RegExp(`\\b(${words[i]}|${ord[i]}|number ${i + 1})\\b`).test(t)) return i;
  // otherwise: the option sharing the most words with what was said
  const norm = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const said2 = norm(t);
  let best = -1;
  let score = 0;
  options.forEach((o, i) => {
    const ow = norm(o);
    let hit = 0;
    ow.forEach((w) => said2.has(w) && hit++);
    const sc = ow.size ? hit / ow.size : 0;
    if (sc > score) {
      score = sc;
      best = i;
    }
  });
  return score >= 0.5 ? best : -1;
}
