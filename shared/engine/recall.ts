// Checks a student's own explanation (Feynman technique) or free recall (blurting)
// against the key points and key terms of the material. Runs in the browser.
import { contentStems, splitSentences, syllables, termRegex, words } from './text';

export interface RecallCheck {
  score: number;
  points: { text: string; covered: boolean; ratio: number }[];
  termsCovered: string[];
  termsMissed: string[];
  wordCount: number;
  avgSentenceWords: number;
  readingEase: number;
  longSentences: string[];
  hardWords: string[];
  feedback: string[];
}

export function checkRecall(answer: string, keyPoints: string[], keyTerms: string[]): RecallCheck {
  const ansStems = new Set(contentStems(answer));
  const ansWords = words(answer);

  const points = keyPoints.map((text) => {
    const st = [...new Set(contentStems(text))];
    const hits = st.filter((x) => ansStems.has(x)).length;
    const ratio = st.length ? hits / st.length : 0;
    const termInside = keyTerms.some((t) => termRegex(t).test(text) && termRegex(t).test(answer));
    return { text, ratio, covered: ratio >= 0.34 || (termInside && ratio >= 0.2) };
  });

  const termsCovered: string[] = [];
  const termsMissed: string[] = [];
  for (const t of keyTerms) {
    const st = contentStems(t);
    const ok = termRegex(t).test(answer) || (st.length > 0 && st.every((x) => ansStems.has(x)));
    (ok ? termsCovered : termsMissed).push(t);
  }

  const pScore = points.length ? points.filter((p) => p.covered).length / points.length : 0;
  const tScore = keyTerms.length ? termsCovered.length / keyTerms.length : pScore;
  const score = Math.round(100 * (0.65 * pScore + 0.35 * tScore));

  const sentences = splitSentences(answer).filter((s) => words(s).length > 0);
  const nS = Math.max(1, sentences.length);
  const nW = Math.max(1, ansWords.length);
  const syl = ansWords.reduce((n, w) => n + syllables(w), 0);
  const readingEase = Math.round(206.835 - 1.015 * (nW / nS) - 84.6 * (syl / nW));
  const longSentences = sentences.filter((s) => words(s).length > 28);
  const termWords = new Set(keyTerms.flatMap((t) => t.toLowerCase().split(/\s+/)));
  const hardWords = [...new Set(ansWords.filter((w) => w.length > 6 && syllables(w) >= 4 && !termWords.has(w.toLowerCase())))].slice(0, 6);

  const feedback: string[] = [];
  if (ansWords.length < 25) feedback.push('Your explanation is very short. Aim for at least 3–4 sentences.');
  if (score >= 80) feedback.push('Excellent. You covered the important ideas.');
  else if (score >= 50) feedback.push('Good start. Add the ideas marked as missing, then try once more.');
  else feedback.push('Re-read the lesson, then try again. Focus on the ideas marked as missing.');
  if (readingEase < 45 && ansWords.length >= 25) feedback.push('Use simpler words and shorter sentences, as if you were explaining it to a 12-year-old.');
  if (longSentences.length) feedback.push(`Break up ${longSentences.length === 1 ? 'your longest sentence' : `${longSentences.length} long sentences`} into two.`);
  if (termsMissed.length && termsMissed.length <= 3) feedback.push(`Try to use: ${termsMissed.join(', ')}.`);

  return {
    score,
    points,
    termsCovered,
    termsMissed,
    wordCount: ansWords.length,
    avgSentenceWords: Math.round(nW / nS),
    readingEase,
    longSentences,
    hardWords,
    feedback,
  };
}
