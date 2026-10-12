// Marks a typed flashcard answer against the card's answer. Runs in the browser, no AI needed.
// Short answers (a term, a name, a number) are matched forgivingly, allowing small typos.
// Longer answers (definitions, lists) are marked on how many of the key words you included.
import { answerMatches, contentStems, levenshtein, stem, words } from './text';

export type Verdict = 'right' | 'close' | 'wrong';

export interface TypedMark {
  verdict: Verdict;
  score: number; // 0–100
  /** Key words from the correct answer, and whether you used each one. */
  keywords: { word: string; hit: boolean }[];
  suggested: 1 | 2 | 3 | 4;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Answer text without "(hint)" asides and list bullets. */
function cleanAnswer(answer: string): string {
  return answer.replace(/\([^)]*\)/g, ' ').replace(/^[\s•\-*\d.)]+/gm, '');
}

export function markTyped(typed: string, answer: string, secondsTaken = 30): TypedMark {
  const given = typed.trim();
  const clean = cleanAnswer(answer);
  const answerWords = words(clean);
  const keyStems = [...new Set(contentStems(clean))];
  const givenStems = new Set(contentStems(given));
  const display = new Map<string, string>();
  for (const w of answerWords) {
    const s = stem(w);
    if (keyStems.includes(s) && !display.has(s)) display.set(s, w);
  }
  const keywords = keyStems.map((s) => ({ word: display.get(s) || s, hit: givenStems.has(s) || [...givenStems].some((g) => g.length > 4 && similarity(g, s) >= 0.8) }));

  let score: number;
  if (!given) score = 0;
  else if (answerWords.length <= 4) {
    // A term or short fact: forgiving exact match
    const options = clean.split(/[,;/]|\bor\b/).map((x) => x.trim()).filter(Boolean);
    if (answerMatches(given, [clean, ...options])) score = 100;
    else {
      const sim = Math.max(similarity(norm(given), norm(clean)), ...options.map((o) => similarity(norm(given), norm(o))));
      const overlap = keyStems.length ? keywords.filter((k) => k.hit).length / keyStems.length : 0;
      score = Math.round(100 * Math.max(sim, overlap));
    }
  } else {
    // A definition or list: share of the key words you remembered
    const hits = keywords.filter((k) => k.hit).length;
    const coverage = keyStems.length ? hits / keyStems.length : 0;
    score = Math.round(100 * Math.min(1, coverage / 0.75)); // ~75% of key words counts as full marks
  }

  const verdict: Verdict = score >= 85 ? 'right' : score >= 55 ? 'close' : 'wrong';
  const fast = secondsTaken <= Math.max(6, answerWords.length * 1.2);
  const suggested = verdict === 'right' ? (fast && score === 100 ? 4 : 3) : verdict === 'close' ? 2 : 1;
  return { verdict, score, keywords: keywords.slice(0, 14), suggested };
}
