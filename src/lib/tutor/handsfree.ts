// Hands-free: the tutor listens all through the lesson, like a teacher sitting with you. As soon as
// the student starts talking the lesson pauses ("barge in"); when they finish, what they said is
// answered. The microphone also hears the tutor's own voice from the speakers, so words that match
// what the tutor is saying right now are ignored, and a false start lets the lesson carry on.

import { recognitionSupported } from './listen';

export interface HandsFree {
  /** what the tutor is saying now (its own words are not taken as the student's) */
  setTutorText(text: string): void;
  /** stop listening for a while (e.g. while the tutor thinks about an answer) */
  hold(on: boolean): void;
  stop(): void;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

export const handsFreeSupported = recognitionSupported;

export function startHandsFree(opts: {
  /** the student has started talking: pause the tutor */
  onStart: () => void;
  onInterim: (text: string) => void;
  /** the student finished a sentence */
  onFinal: (text: string) => void;
  /** it was only noise or the tutor's own voice: carry on */
  onFalseStart: () => void;
  onError: (msg: string) => void;
}): HandsFree | null {
  if (!recognitionSupported) return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  let rec: any = null;
  let stopped = false;
  let held = false;
  let echo = new Set<string>();
  let started = false;
  let failures = 0;
  let restartTimer = 0;
  let clearTimer = 0;
  let talking = false;

  /** the share of the words that are the student's own (not the tutor's) */
  const own = (text: string) => {
    const w = words(text);
    if (!w.length) return { n: 0, share: 0 };
    const mine = w.filter((x) => !echo.has(x)).length;
    return { n: mine, share: mine / w.length };
  };

  const begin = () => {
    if (stopped || held || rec) return;
    try {
      rec = new Ctor();
    } catch {
      opts.onError('Hands-free listening is not available in this browser. Use the mic button.');
      stopped = true;
      return;
    }
    rec.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      failures = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = String(r[0].transcript || '').trim();
        if (!text) continue;
        const o = own(text);
        if (!r.isFinal) {
          // two of their own words (or one long one while the tutor is quiet) is the student talking
          if (!started && (o.n >= 2 || (o.n >= 1 && !talking && text.length > 3)) && o.share > 0.5) {
            started = true;
            opts.onStart();
          }
          if (started) opts.onInterim(text);
        } else {
          const real = o.n >= 1 && o.share >= 0.45 && (o.n >= 2 || !talking);
          if (real) {
            if (!started) opts.onStart();
            opts.onFinal(text);
          } else if (started) opts.onFalseStart();
          started = false;
        }
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        opts.onError('Allow the microphone so you can just talk to your tutor.');
      } else if (e.error === 'network' || e.error === 'audio-capture') {
        if (++failures > 2) {
          stopped = true;
          opts.onError('Hands-free listening stopped (no microphone or connection). Use the mic button instead.');
        }
      }
    };
    rec.onend = () => {
      rec = null;
      if (started) {
        started = false;
        opts.onFalseStart();
      }
      // browsers stop listening after a while: start again
      if (!stopped && !held) restartTimer = window.setTimeout(begin, failures ? 1200 : 250);
    };
    try {
      rec.start();
    } catch {
      rec = null;
    }
  };

  begin();
  return {
    setTutorText(text) {
      window.clearTimeout(clearTimer);
      if (text) {
        talking = true;
        // keep the last things said too: the speakers and the recogniser lag a little behind
        echo = new Set([...words(text), ...[...echo].slice(-40)]);
      } else {
        talking = false;
        clearTimer = window.setTimeout(() => (echo = new Set()), 2500);
      }
    },
    hold(on) {
      held = on;
      if (on) {
        window.clearTimeout(restartTimer);
        try {
          rec?.abort();
        } catch {
          /* already stopped */
        }
        rec = null;
        started = false;
      } else begin();
    },
    stop() {
      stopped = true;
      window.clearTimeout(restartTimer);
      try {
        rec?.abort();
      } catch {
        /* already stopped */
      }
      rec = null;
    },
  };
}
