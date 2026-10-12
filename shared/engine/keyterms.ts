import type { KeyTerm } from './types';
import { GENERIC, STOPWORDS, stem, words } from './text';

const ADVERBS = new Set('best known well-known worst better worse later earlier often always never sometimes usually also still even just only mostly largely mainly partly fully highly well together further rather quite less least more most new old many much'.split(' '));
const NUMBERS = new Set('one two three four five six seven eight nine ten eleven twelve hundred thousand million first second third fourth fifth'.split(' '));
const COMMON_VERBS = new Set(
  'control surround produce contain enter leave make give take help cause allow require involve include carry move use need show mean form occur become keep create divide grow copy provide reduce increase decrease affect depend determine describe explain develop lead result remain consist exist happen begin start stop change turn break build bring hold let put set run read write call find get seem appear tend try want work play live die die eat drink see look feel think know say tell ask answer follow apply act add pass meet send receive return reach rise fall release absorb transport protect support store supply prevent enable ensure perform contribute represent refer relate compare state define focus vary differ emerge involve achieve maintain manage operate obtain identify measure regulate respond transfer convert combine separate attach link limit cover enclose'.split(' '),
);
const VERBISH = /^(?:is|are|was|were|be|been|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must)$/;

function phraseKey(phrase: string): string {
  return phrase.toLowerCase().split(/\s+/).map(stem).join(' ');
}

/** RAKE-style candidate phrases: runs of content words between stopwords/punctuation. */
export function candidatePhrases(sentence: string): string[] {
  const out: string[] = [];
  const fragments = sentence.split(/[.,;:!?()[\]{}"“”‘’/\\|–—]|\s-\s|\s+(?=\d)/);
  for (const frag of fragments) {
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 1 && run.length <= 4) out.push(run.join(' '));
      else if (run.length > 4) {
        // long runs: keep the trailing 2–3 words (usually the head noun phrase)
        out.push(run.slice(-3).join(' '));
        out.push(run.slice(-2).join(' '));
      }
      run = [];
    };
    for (const w of words(frag)) {
      const lw = w.toLowerCase();
      if (STOPWORDS.has(lw) || VERBISH.test(lw) || /^\d/.test(w) || w.length < 2) {
        flush();
        continue;
      }
      run.push(w);
    }
    flush();
  }
  return out.filter((p) => {
    const ws = p.toLowerCase().split(' ');
    if (ws.every((w) => GENERIC.has(w))) return false;
    if (ws.length === 1 && /(?:ed|ing|ly|ful|ous|ive|able|ible|est)$/.test(ws[0]) && !/^[A-Z]{2,}/.test(p)) return false;
    if (/ly$/.test(ws[0]) || /(?:ed|ly)$/.test(ws[ws.length - 1])) return false;
    if (ADVERBS.has(ws[0]) || ADVERBS.has(ws[ws.length - 1])) return false;
    if (ws.some((w) => NUMBERS.has(w))) return false;
    if (ws.length > 1 && /(?:al|ive|ous|ful|ible|able|ic|ical|est)$/.test(ws[ws.length - 1])) return false;
    if (ws.length === 1 && COMMON_VERBS.has(ws[0].replace(/(?:es|s)$/, '')) ) return false;
    if (ws.length === 1 && COMMON_VERBS.has(ws[0].replace(/s$/, ''))) return false;
    if (ws.length > 1 && (COMMON_VERBS.has(ws[ws.length - 1].replace(/(?:es|s)$/, '')) || COMMON_VERBS.has(ws[ws.length - 1].replace(/s$/, '')))) return false;
    if (ws.length > 1 && GENERIC.has(ws[ws.length - 1])) return false;
    if (ws.length === 1 && (ws[0].length < 4 || GENERIC.has(ws[0]))) return false;
    if (/ly$/.test(ws[ws.length - 1]) && ws.length === 1) return false;
    return true;
  });
}

interface Acc {
  forms: Map<string, number>;
  count: number;
  chunks: Set<number>;
  boost: number;
}

/**
 * Score candidate key terms across all chunks: frequency × spread × phrase-length bonus,
 * boosted when the term is defined, appears in a heading, or is an acronym.
 */
export function extractKeyTerms(
  chunkSentences: string[][],
  headings: string[],
  definedTerms: string[],
  limit = 60,
): KeyTerm[] {
  const acc = new Map<string, Acc>();
  const nChunks = Math.max(1, chunkSentences.length);

  const add = (phrase: string, chunk: number, weight = 1) => {
    const k = phraseKey(phrase);
    if (!k) return;
    let a = acc.get(k);
    if (!a) {
      a = { forms: new Map(), count: 0, chunks: new Set(), boost: 0 };
      acc.set(k, a);
    }
    a.forms.set(phrase, (a.forms.get(phrase) || 0) + 1);
    a.count += weight;
    if (chunk >= 0) a.chunks.add(chunk);
  };

  chunkSentences.forEach((sentences, ci) => {
    for (const s of sentences) {
      for (const p of candidatePhrases(s)) add(p, ci);
    }
  });

  const headingText = headings.join(' | ').toLowerCase();
  for (const h of headings) for (const p of candidatePhrases(h)) add(p, -1, 0.5);

  for (const t of definedTerms) {
    const k = phraseKey(t);
    const a = acc.get(k);
    if (a) a.boost += 3;
    else acc.set(k, { forms: new Map([[t, 1]]), count: 1, chunks: new Set(), boost: 3 });
  }

  // a phrase "cell membrane" also counts toward its words' importance, but not the other way round
  const scored: KeyTerm[] = [];
  for (const [k, a] of acc) {
    const nWords = k.split(' ').length;
    const top = [...a.forms.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const lower = [...a.forms.keys()].find((f) => f === f.toLowerCase());
    const form = lower && !/^[A-Z]{2,6}s?$/.test(top) ? lower : top;
    const isAcronym = /^[A-Z]{2,6}s?$/.test(form);
    const spread = a.chunks.size / nChunks;
    let score = Math.log2(1 + a.count) * (1 + 0.5 * (nWords - 1)) * (1 + Math.min(spread, 0.5));
    if (a.count < 2 && a.boost === 0) score *= 0.4;
    if (headingText.includes(form.toLowerCase())) score *= 1.4;
    if (isAcronym) score *= 1.3;
    score += a.boost;
    scored.push({ term: form, score, chunks: [...a.chunks].sort((x, y) => x - y) });
  }

  scored.sort((a, b) => b.score - a.score);

  // drop single words already covered by a better multi-word term ("membrane" vs "cell membrane")
  const kept: KeyTerm[] = [];
  for (const t of scored) {
    const tk = phraseKey(t.term);
    const coveredBy = kept.find((k) => {
      const kk = phraseKey(k.term);
      return kk !== tk && (` ${kk} `.includes(` ${tk} `) || ` ${tk} `.includes(` ${kk} `)) && k.score >= t.score * 0.8;
    });
    if (coveredBy) continue;
    kept.push(t);
    if (kept.length >= limit) break;
  }
  return kept;
}
