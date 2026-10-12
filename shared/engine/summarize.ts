import { contentStems, dropLeadingConnective, stripCitations, wordCount } from './text';

const CUE_WORDS = /\b(?:important|importance|key|main|principal|essential|significant|crucial|fundamental|primary|major|therefore|thus|hence|consequently|because|result|cause|effect|function|purpose|role|define|definition|known as|called|refers? to|means|consists? of|includes?|types? of|advantages?|disadvantages?|characteristics?|features?|principles?|law|theory|rule|always|never)\b/i;

export interface ScoredSentence {
  text: string;
  index: number;
  score: number;
  /** first sentence of its paragraph/bullet */
  lead: boolean;
}

/** TextRank: sentences that share vocabulary with many other sentences are central. */
function textRank(stemsList: string[][]): number[] {
  const n = stemsList.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const sets = stemsList.map((s) => new Set(s));
  const w: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!sets[i].size || !sets[j].size) continue;
      let overlap = 0;
      for (const x of sets[i]) if (sets[j].has(x)) overlap++;
      if (!overlap) continue;
      const sim = overlap / (Math.log(sets[i].size + 1) + Math.log(sets[j].size + 1));
      w[i][j] = w[j][i] = sim;
    }
  }
  const outSum = w.map((row) => row.reduce((a, b) => a + b, 0));
  let pr = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 30; iter++) {
    const next = new Array(n).fill((1 - 0.85) / n);
    for (let j = 0; j < n; j++) {
      if (!outSum[j]) continue;
      for (let i = 0; i < n; i++) if (w[j][i]) next[i] += (0.85 * w[j][i] * pr[j]) / outSum[j];
    }
    pr = next;
  }
  const max = Math.max(...pr) || 1;
  return pr.map((x) => x / max);
}

/**
 * Score sentences of one chunk. `termStems` are stems of the document's key terms,
 * `definitionSentences` are sentences that contained a definition.
 */
export function scoreSentences(
  sentences: { text: string; lead: boolean }[],
  termStems: Set<string>,
  definitionHints: string[],
): ScoredSentence[] {
  const stems = sentences.map((s) => contentStems(s.text));
  const tr = textRank(stems);
  return sentences.map((s, i) => {
    const wc = wordCount(s.text);
    const termHits = stems[i].filter((x) => termStems.has(x)).length;
    const isDef = definitionHints.some((d) => s.text.includes(d.slice(0, 40)));
    let score = 0.35 + tr[i];
    score *= 1 + Math.min(termHits, 3) * 0.12;
    if (isDef) score *= 1.6;
    if (CUE_WORDS.test(s.text)) score *= 1.2;
    if (s.lead) score *= 1.15;
    if (wc < 6) score *= 0.5;
    else if (wc < 9) score *= 0.8;
    if (wc > 45) score *= 0.75;
    if (/\?$/.test(s.text)) score *= 0.5;
    if (/^(?:for example|e\.g\.|for instance|see |figure|table)/i.test(s.text)) score *= 0.6;
    return { text: s.text, index: i, score, lead: s.lead };
  });
}

export function pickKeyPoints(scored: ScoredSentence[], max = 6): ScoredSentence[] {
  const n = scored.length;
  if (n === 0) return [];
  const k = Math.max(Math.min(n, 2), Math.min(max, Math.round(n * 0.35)));
  const chosen: ScoredSentence[] = [];
  for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= k) break;
    // avoid near-duplicates
    const st = new Set(contentStems(s.text));
    const dup = chosen.some((c) => {
      const cs = contentStems(c.text);
      const overlap = cs.filter((x) => st.has(x)).length;
      return overlap / Math.max(1, Math.min(cs.length, st.size)) > 0.8;
    });
    if (!dup) chosen.push(s);
  }
  return chosen.sort((a, b) => a.index - b.index);
}

/** Make an extracted sentence stand on its own: no citations, no dangling "However,". */
export function tidySentence(s: string): string {
  let t = stripCitations(s).replace(/\s+/g, ' ').trim();
  t = dropLeadingConnective(t);
  t = t.replace(/\s*\((?:see|cf\.?|fig(?:ure)?\.?|table)[^)]*\)/gi, '');
  return t;
}
