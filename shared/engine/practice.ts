import type { CardSeed, Chunk, Definition, KeyTerm, QuizQuestion, TermList } from './types';
import { capitalize, ensurePeriod, escapeRegExp, seededRandom, shuffle, termRegex, wordCount } from './text';

function isPlural(term: string): boolean {
  const last = term.split(/\s+/).pop() || '';
  return /[^s]s$/i.test(last) && !/(?:is|us|ss|sis|ics)$/i.test(last);
}

function whatIs(term: string): string {
  return `What is meant by ${term}?`;
}

/** Find the best key term inside a sentence to blank out. */
function blankableTerm(sentence: string, terms: KeyTerm[]): { term: string; cloze: string } | null {
  let best: { term: string; cloze: string; score: number } | null = null;
  for (const t of terms) {
    if (t.term.length < 3) continue;
    const re = termRegex(t.term);
    const m = sentence.match(re);
    if (!m || m.index === undefined) continue;
    const at = m.index + m[1].length;
    const found = m[2];
    // don't blank the very first word of the sentence if a better option exists
    const score = t.score * (at === 0 ? 0.7 : 1) * (1 + 0.2 * (t.term.split(' ').length - 1));
    if (!best || score > best.score) {
      const cloze = sentence.slice(0, at) + '_____' + sentence.slice(at + found.length);
      best = { term: found, cloze, score };
    }
  }
  return best ? { term: best.term, cloze: best.cloze } : null;
}

function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function buildCards(chunks: Chunk[], glossary: Definition[], lists: TermList[], terms: KeyTerm[]): CardSeed[] {
  const cards: CardSeed[] = [];
  for (const chunk of chunks) {
    const local: CardSeed[] = [];
    const defs = glossary.filter((d) => d.chunk === chunk.index);
    for (const d of defs.slice(0, 6)) {
      local.push({ chunk: chunk.index, type: 'definition', front: whatIs(d.term), back: ensurePeriod(d.definition) });
    }
    for (const d of defs.slice(0, 2)) {
      local.push({ chunk: chunk.index, type: 'reverse', front: `Which term means: “${d.definition.replace(/[.…]$/, '')}”?`, back: capitalize(d.term) });
    }
    for (const l of lists.filter((x) => x.chunk === chunk.index).slice(0, 3)) {
      const labels = l.items.map((i) => i.label);
      local.push({
        chunk: chunk.index,
        type: 'list',
        front: l.question ? `${l.question.replace(/Name them\.$/, l.ordered ? 'Name them in order.' : labels.length === 2 ? 'Name both.' : `Name all ${labels.length}.`)}` : `${l.ordered ? 'In order, name' : 'Name'} the ${labels.length} ${l.category}.`,
        back: l.items
          .map((it, i) => {
            const head = l.ordered ? `${i + 1}. ${it.label}` : `• ${it.label}`;
            // short explanations help the answer stick ("Analytic studies — test a causal hypothesis…")
            return it.detail && it.detail !== it.label && wordCount(it.detail) <= 22 && l.items.length <= 6 ? `${head} — ${lowerFirst(it.detail.replace(/[.]$/, ''))}` : head;
          })
          .join('\n'),
        hint: `First letters: ${labels.map((x) => x.charAt(0).toUpperCase()).join(' ')}`,
      });
    }
    const defTerms = new Set(defs.map((d) => d.term.toLowerCase()));
    const localTerms = terms.filter((t) => chunk.keyTerms.includes(t.term));
    let clozes = 0;
    for (const p of chunk.keyPoints) {
      if (clozes >= 3) break;
      if (wordCount(p) < 7 || wordCount(p) > 45) continue;
      const b = blankableTerm(p, localTerms.length ? localTerms : terms);
      if (!b) continue;
      if (defTerms.has(b.term.toLowerCase()) && local.some((c) => c.back.includes(p.slice(0, 30)))) continue;
      local.push({ chunk: chunk.index, type: 'cloze', front: b.cloze, back: b.term, hint: `${b.term.length} letters, starts with “${b.term.charAt(0).toUpperCase()}”` });
      clozes++;
    }
    cards.push(...local.slice(0, 11));
  }
  return cards;
}

// ─── Quiz ─────────────────────────────────────────────────────

export function buildQuiz(chunks: Chunk[], glossary: Definition[], lists: TermList[], terms: KeyTerm[], seed: string): QuizQuestion[] {
  const rand = seededRandom(seed + ':quiz');
  const qs: QuizQuestion[] = [];
  let n = 0;
  const id = () => `q${++n}`;
  // the "concept vocabulary": defined terms, list items and the strongest key terms make the best distractors
  const conceptSet = new Map<string, string>();
  for (const t of [
    ...glossary.map((g) => g.term),
    ...lists.flatMap((l) => l.items.map((i) => i.label)).filter((x) => wordCount(x) <= 4 && !x.endsWith('…')),
    ...terms.slice(0, 25).map((t) => t.term),
  ]) {
    if (!conceptSet.has(t.toLowerCase())) conceptSet.set(t.toLowerCase(), t);
  }
  const allTermNames = [...conceptSet.values()];
  const glossaryNames = new Set(glossary.map((g) => g.term.toLowerCase()));
  let tfCount = 0;

  const nearby = <T extends { chunk: number }>(arr: T[], chunk: number): T[] =>
    [...arr].sort((a, b) => Math.abs(a.chunk - chunk) - Math.abs(b.chunk - chunk) || rand() - 0.5);

  for (const chunk of chunks) {
    const local: QuizQuestion[] = [];
    const defs = glossary.filter((d) => d.chunk === chunk.index);

    // 1) term → definition
    for (const d of defs.slice(0, 3)) {
      const others = nearby(glossary.filter((g) => g.term !== d.term), chunk.index).slice(0, 3).map((g) => g.definition);
      if (others.length < 2) continue;
      const options = shuffle([d.definition, ...others], rand);
      local.push({
        id: id(),
        chunk: chunk.index,
        type: 'mcq',
        prompt: `Which of these best describes ${d.term}?`,
        options,
        answer: options.indexOf(d.definition),
        explanation: `${capitalize(d.term)}: ${ensurePeriod(d.definition)}`,
      });
    }
    // 2) definition → term
    for (const d of defs.slice(3, 5).concat(defs.length <= 3 ? defs.slice(0, 1) : [])) {
      const pool = glossary.filter((g) => g.term.toLowerCase() !== d.term.toLowerCase()).map((g) => g.term);
      const extra = allTermNames.filter((t) => t.toLowerCase() !== d.term.toLowerCase() && !pool.includes(t));
      const distract = shuffle(pool, rand).slice(0, 3);
      while (distract.length < 3 && extra.length) distract.push(extra.shift()!);
      if (distract.length < 2) continue;
      const options = shuffle([capitalize(d.term), ...distract.map(capitalize)], rand);
      local.push({
        id: id(),
        chunk: chunk.index,
        type: 'mcq',
        prompt: `Which term matches this description? “${d.definition.replace(/[.…]$/, '')}”`,
        options,
        answer: options.indexOf(capitalize(d.term)),
        explanation: `${capitalize(d.term)}: ${ensurePeriod(d.definition)}`,
      });
    }

    // 3) cloze MCQ, true/false and typed answers from key points
    const localTerms = terms.filter((t) => chunk.keyTerms.includes(t.term));
    chunk.keyPoints.forEach((p, i) => {
      if (wordCount(p) < 7 || wordCount(p) > 45) return;
      const hit = localTerms
        .concat(terms)
        .find((t) => t.term.length >= 3 && termRegex(t.term).test(p));
      if (!hit) return;
      const re = termRegex(hit.term);
      const m = p.match(re)!;
      const found = m[2];
      const others = shuffle(
        allTermNames.filter((t) => t.toLowerCase() !== hit.term.toLowerCase() && !new RegExp(escapeRegExp(t), 'i').test(p) && Math.abs(t.split(' ').length - hit.term.split(' ').length) <= 1),
        rand,
      );
      const kind = (i + chunk.index) % 3;
      if (kind === 0 && others.length >= 3) {
        const options = shuffle([found, ...others.slice(0, 3)], rand);
        local.push({
          id: id(),
          chunk: chunk.index,
          type: 'mcq',
          prompt: `Fill the gap: ${p.replace(re, (_a, pre) => `${pre}_____`)}`,
          options,
          answer: options.indexOf(found),
          explanation: p,
        });
      } else if (kind === 1 && (glossaryNames.has(hit.term.toLowerCase()) || lists.some((l) => l.items.some((it) => it.label.toLowerCase() === hit.term.toLowerCase())))) {
        const makeFalse = tfCount++ % 2 === 0;
        const siblings = lists
          .filter((l) => l.items.some((it) => it.label.toLowerCase() === hit.term.toLowerCase()))
          .flatMap((l) => l.items.map((it) => it.label))
          .filter((x) => x.toLowerCase() !== hit.term.toLowerCase() && !new RegExp(escapeRegExp(x), 'i').test(p));
        const sameKind = nearby(glossary.filter((g) => g.term.toLowerCase() !== hit.term.toLowerCase() && !new RegExp(escapeRegExp(g.term), 'i').test(p)), chunk.index).map((g) => g.term);
        const swapped = siblings[0] || sameKind[0];
        if (makeFalse && !swapped) return;
        const keepCase = (x: string) => (/^[A-Z]/.test(found) ? capitalize(x) : x);
        let statement = makeFalse ? p.replace(re, (_a, pre) => `${pre}${keepCase(swapped)}`) : p;
        if (makeFalse) {
          statement = statement.replace(new RegExp(`\\b(an?|An?)\\s+(${escapeRegExp(keepCase(swapped))})`), (_m, art: string, w: string) => {
            const an = /^[aeiou]/i.test(w);
            return `${art[0]}${an ? 'n' : ''} ${w}`;
          });
        }
        local.push({
          id: id(),
          chunk: chunk.index,
          type: 'tf',
          prompt: statement,
          answer: !makeFalse,
          explanation: makeFalse ? `False — the notes say: “${p}”` : `True — straight from your notes.`,
        });
      } else {
        local.push({
          id: id(),
          chunk: chunk.index,
          type: 'fill',
          prompt: p.replace(re, (_a, pre) => `${pre}_____`),
          answer: found,
          accept: [found, hit.term],
          explanation: p,
        });
      }
    });

    // 4) put an ordered list in order
    for (const l of lists.filter((x) => x.chunk === chunk.index && x.ordered && x.items.length >= 3 && x.items.length <= 7).slice(0, 1)) {
      local.push({
        id: id(),
        chunk: chunk.index,
        type: 'order',
        prompt: `Put the ${l.category} in the correct order.`,
        items: l.items.map((i) => i.label),
        explanation: l.items.map((i, k) => `${k + 1}. ${i.label}`).join('  '),
      });
    }
    // 5) "which of these is one of the …" for unordered lists
    for (const l of lists.filter((x) => x.chunk === chunk.index && !x.ordered).slice(0, 1)) {
      const listLabels = new Set(l.items.map((i) => i.label.toLowerCase()));
      const outsiders = shuffle(allTermNames.filter((t) => !listLabels.has(t.toLowerCase())), rand).slice(0, 3);
      if (outsiders.length < 3) continue;
      const right = l.items[Math.floor(rand() * l.items.length)].label;
      const options = shuffle([right, ...outsiders], rand);
      local.push({
        id: id(),
        chunk: chunk.index,
        type: 'mcq',
        prompt: `Which of these is one of the ${l.category}?`,
        options,
        answer: options.indexOf(right),
        explanation: `The ${l.category}: ${l.items.map((i) => i.label).join(', ')}.`,
      });
    }
    qs.push(...local.slice(0, 7));
  }
  return qs;
}

// ─── Elaboration prompts ("think deeper") ─────────────────────

export function buildPrompts(chunk: Chunk, defs: Definition[], lists: TermList[], rand: () => number): string[] {
  const terms = chunk.keyTerms.slice(0, 4);
  const out: string[] = [];
  const t0 = defs[0]?.term || terms[0];
  const t1 = terms.find((t) => t.toLowerCase() !== (t0 || '').toLowerCase());
  if (t0) out.push(`Explain ${t0} to a friend who has never heard of it — in two sentences, no jargon.`);
  if (t0 && t1) out.push(`How is ${t0} connected to ${t1}? Try to describe the link in your own words.`);
  const l = lists.find((x) => x.chunk === chunk.index);
  if (l) out.push(l.ordered ? `Why do the ${l.category} happen in this order? What would go wrong if one were skipped?` : `Which of the ${l.category} matters most in practice, and why?`);
  if (t0) out.push(`Think of a real-life example of ${t0} — from Uganda, your campus or your own life.`);
  if (t1) out.push(`What would happen if there were no ${t1}?`);
  if (chunk.keyPoints[0]) out.push(`Why is this true? “${chunk.keyPoints[0].replace(/[.]$/, '')}”`);
  return shuffle(out, rand).slice(0, 3);
}
