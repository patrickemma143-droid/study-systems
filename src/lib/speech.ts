// Text-to-speech and dictation using the browser's built-in Web Speech API (free, no API key).

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function voices(): SpeechSynthesisVoice[] {
  if (!ttsSupported) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

export function speak(text: string, opts: { rate?: number; voice?: string; onEnd?: () => void; onBoundary?: (charIndex: number) => void } = {}) {
  if (!ttsSupported) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 1;
  u.lang = 'en-GB';
  const v = voices().find((x) => x.name === opts.voice);
  if (v) u.voice = v;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary!(e.charIndex);
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported) window.speechSynthesis.cancel();
}

/** Speak a list of texts one after another; returns a cancel function. */
export function speakSequence(items: string[], opts: { rate?: number; voice?: string; gapMs?: number; onItem?: (i: number) => void; onDone?: () => void }) {
  let cancelled = false;
  let timer: number | undefined;
  const run = (i: number) => {
    if (cancelled) return;
    if (i >= items.length) return opts.onDone?.();
    opts.onItem?.(i);
    speak(items[i], {
      rate: opts.rate,
      voice: opts.voice,
      onEnd: () => {
        timer = window.setTimeout(() => run(i + 1), opts.gapMs ?? 350);
      },
    });
  };
  stopSpeaking();
  run(0);
  return () => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
    stopSpeaking();
  };
}

// Dictation (Chrome/Edge/Android): lets students speak their Feynman explanation.
type Recognizer = { start: () => void; stop: () => void; onresult: (e: any) => void; onend: () => void; continuous: boolean; interimResults: boolean; lang: string };

export const dictationSupported = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

export function startDictation(onText: (finalText: string) => void, onEnd: () => void): () => void {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return () => {};
  const rec: Recognizer = new Ctor();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = 'en-GB';
  rec.onresult = (e: any) => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
    if (text) onText(text.trim());
  };
  rec.onend = onEnd;
  rec.start();
  return () => rec.stop();
}

/** A gentle two-tone chime for the focus timer. */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.65);
    });
  } catch {
    /* audio not available */
  }
}
