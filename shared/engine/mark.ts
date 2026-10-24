// Marks a written exam answer against a marking key, point by point, the way examiners do:
// each marking point the answer makes earns its mark(s). Runs in the browser, no AI needed.
import { contentStems, splitSentences, termRegex, wordCount } from './text';

export interface AnswerMark {
  awarded: number;
  outOf: number;
  points: { point: string; got: boolean }[];
  comment: string;
}

/** Break a key or model answer into separate marking points. */
export function keyPoints(key: string): string[] {
  const lines = key
    .split(/\n+|;\s+|\s(?=\([a-h]\)\s)|\s(?=\(?[ivx]{1,4}\)\s)|\s+(?=•|- )/i)
    .map((l) => l.replace(/^\s*(?:[-•*]|\(?[a-h]\)|\(?[ivx]{1,4}\)|\d+[.)])\s*/i, '').trim())
    .filter((l) => wordCount(l) >= 1);
  // long lines are usually several points written as sentences
  const pts = lines.flatMap((l) => (wordCount(l) > 30 ? splitSentences(l) : [l])).filter((l) => contentStems(l).length > 0);
  return [...new Set(pts)].slice(0, 30);
}

export function markAnswer(answer: string, key: string | string[], outOf: number): AnswerMark {
  const points = Array.isArray(key) ? key.filter(Boolean) : keyPoints(key);
  const ans = new Set(contentStems(answer));
  const checked = points.map((point) => {
    const st = [...new Set(contentStems(point))];
    const hits = st.filter((x) => ans.has(x)).length;
    const ratio = st.length ? hits / st.length : 0;
    // a short point ("Mitochondria") must be named; a longer one needs most of its ideas
    const got = st.length <= 2 ? ratio >= 0.99 || termRegex(point).test(answer) : ratio >= 0.5;
    return { point, got };
  });
  const n = Math.max(1, checked.length);
  const got = checked.filter((p) => p.got).length;
  const awarded = Math.min(outOf, Math.round((got / n) * outOf * 2) / 2);
  const words = wordCount(answer);
  const comment =
    words < 3
      ? 'Write your answer first.'
      : got === n
        ? 'Full marks on the key points. Make sure each one is explained, not just named.'
        : got === 0
          ? 'None of the marking points came through. Re-read the notes and try again, using the key words.'
          : `You made ${got} of ${n} marking points. Add the missing ones below${outOf >= 8 ? ' and explain each with an example' : ''}.`;
  return { awarded, outOf, points: checked, comment };
}
