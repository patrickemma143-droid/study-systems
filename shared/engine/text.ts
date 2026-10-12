// Text utilities shared by the study engine (server) and the browser (Feynman/blurting checks).

export const STOPWORDS = new Set(
  `a about above according across actually after again against all almost along already also although always am among an and another any anyone anything are around as at be became because become becomes been before being below between both but by can cannot could did do does doing done down during each either else enough etc even ever every few for from further get gets given gives go had has have having he her here hers herself him himself his how however i if in into is it its itself just least less let like likely made mainly make makes many may me might more most mostly much must my myself near need neither never no nor not now of off often on once one only onto or other others otherwise our ours ourselves out over own per perhaps rather really same seem seems several shall she should since so some something sometimes still such than that the their theirs them themselves then there therefore these they this those though through thus to too toward towards under until up upon us use used uses using usually various very via was we well were what whatever when where whereas whether which while who whom whose why will with within without would yet you your yours yourself yourselves e.g i.e eg ie`.split(
    /\s+/,
  ),
);

/** Words that look like key terms but rarely are. */
export const GENERIC = new Set(
  `example examples figure fig table chapter section page pages part parts lecture lectures slide slides unit units course note notes introduction conclusion summary overview objectives objective outline topic topics thing things way ways lot type types kind kinds number numbers form forms case cases fact facts point points term terms result results time times year years day days people person student students study studies first second third fourth fifth new old good bad high low large small different important main major key basic general common specific particular certain able also include includes including called known refer refers given following follows show shows shown see seen question questions answer answers end beginning reference references author authors word words level levels area areas group groups order sense instance aspect aspects factor factors role roles use process issue issues approach idea ideas`.split(
    /\s+/,
  ),
);

const PRONOUN_START = new Set(
  `it this that these those they there he she we you i one another such which what who each every some many most all here its their his her our your`.split(' '),
);

export function isPronounStart(word: string): boolean {
  return PRONOUN_START.has(word.toLowerCase());
}

const ABBREVIATIONS = new Set(
  `e.g i.e etc vs mr mrs ms dr prof sr jr st fig figs no nos vol vols ch sec eq eqs approx cf al inc ltd co corp dept univ gen gov jan feb mar apr jun jul aug sep sept oct nov dec mt ft p pp ed eds op cit ibid viz u.s u.k a.m p.m`.split(' '),
);

/** Normalise odd characters that PDFs and Word files produce. */
export function normalize(text: string): string {
  return text
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/­/g, '') // soft hyphen
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Join words that were split across lines: "infor- mation" → "information". */
export function dehyphenate(text: string): string {
  return text.replace(/([a-z])-\s+([a-z])/g, '$1$2');
}

/** Remove in-text citations like (Smith, 2010), (Smith & Jones 2012; Lee et al., 2019) and [12]. */
export function stripCitations(text: string): string {
  return text
    .replace(/\s*\((?:see\s+)?(?:[A-Z][A-Za-z'’\-]+(?:\s+(?:et al\.?|and|&)\s*(?:[A-Z][A-Za-z'’\-]+)?)?,?\s*(?:\d{4}[a-z]?|n\.d\.)(?:,\s*p+\.\s*\d+(?:[-–]\d+)?)?(?:;\s*)?)+\)/g, '')
    .replace(/\s*\[\d+(?:\s*[,–-]\s*\d+)*\]/g, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Split text into sentences, protecting common abbreviations, initials and decimals. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const src = text.replace(/\s+/g, ' ').trim();
  if (!src) return out;
  let start = 0;
  const re = /([.!?]+)(["'’”)\]]*)\s+(?=["'“(]?[A-Z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const end = m.index + m[1].length + m[2].length;
    const before = src.slice(start, m.index);
    const lastWord = (before.match(/([A-Za-z.]+)$/)?.[1] || '').toLowerCase().replace(/\.$/, '');
    if (m[1] === '.') {
      if (ABBREVIATIONS.has(lastWord)) continue;
      if (/^[a-z]$/i.test(lastWord)) continue; // initials: J. Smith
      if (/\d$/.test(before) && /^\d/.test(src.slice(re.lastIndex))) continue; // 3. 5
    }
    const s = src.slice(start, end).trim();
    if (s) out.push(s);
    start = re.lastIndex;
  }
  const tail = src.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

export function words(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z'’\-]*[A-Za-z]|[A-Za-z]|\d+(?:\.\d+)?/g) || [];
}

export function wordCount(text: string): number {
  return words(text).length;
}

/** A light English stemmer — good enough to match "cells"/"cell", "dividing"/"divide". */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[’']s$/, '').replace(/[’']/g, '');
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('xes') || w.endsWith('ches') || w.endsWith('shes')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith('e') && w.length > 4) w = w.slice(0, -1);
  if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Stemmed content words (no stopwords, no tiny words). */
export function contentStems(text: string): string[] {
  return words(text)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function trimEndPunct(s: string): string {
  return s.replace(/[\s,;:–—-]+$/, '').trim();
}

export function ensurePeriod(s: string): string {
  const t = s.trim();
  return /[.!?…]$/.test(t) ? t : t + '.';
}

/** Words that start a sentence but only connect it to the previous one. */
export function dropLeadingConnective(s: string): string {
  return capitalize(
    s.replace(
      /^(?:also|in addition|additionally|furthermore|moreover|besides|similarly|likewise|again|then|thus|hence|so|and|but|however|consequently|therefore|as a result|in other words|for this reason|on the other hand|in contrast|nevertheless|nonetheless|finally|firstly|secondly|thirdly|lastly)\s*,\s*/i,
      '',
    ),
  );
}

/** Rough syllable count (for the simplicity check). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Deterministic random generator so the same notes produce the same pack. */
export function seededRandom(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex that matches a term (and its simple plural) as whole words. */
export function termRegex(term: string, flags = 'i'): RegExp {
  const base = escapeRegExp(term.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^A-Za-z0-9])(${base}(?:s|es)?)(?=$|[^A-Za-z0-9])`, flags);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Forgiving answer check for typed answers (ignores case, articles, small typos). */
export function answerMatches(given: string, accepted: string[]): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(?:the|a|an)\s+/, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const g = norm(given);
  if (!g) return false;
  return accepted.some((acc) => {
    const a = norm(acc);
    if (!a) return false;
    if (g === a || stem(g) === stem(a)) return true;
    const tolerance = a.length <= 4 ? 0 : a.length <= 8 ? 1 : 2;
    return levenshtein(g, a) <= tolerance;
  });
}
