// Quiz levels. Easy: recognise the answer among a few clear choices. Medium: the pack's normal quiz.
// Hard: "twisted" questions — negatives, swapped definitions, typed answers with no options,
// choosing the one correct statement among near-misses.
import type { QuizQuestion, StudyPack } from './types';
import { capitalize, ensurePeriod, escapeRegExp, seededRandom, shuffle, termRegex, wordCount } from './text';

export type Level = 'easy' | 'medium' | 'hard';
export const LEVEL_POINTS: Record<Level, number> = { easy: 1, medium: 2, hard: 4 };

export function buildLevelQuiz(pack: StudyPack, level: Level, chunks?: number[], seed = String(Date.now())): QuizQuestion[] {
  const inScope = (c: number) => !chunks || chunks.includes(c);
  const base = pack.quiz.filter((q) => inScope(q.chunk));
  if (level === 'medium') return base;
  const rand = seededRandom(`${seed}:${level}`);
  let n = 0;
  const id = () => `${level[0]}${++n}`;
  const out: QuizQuestion[] = [];
  const glossary = pack.glossary.filter((g) => inScope(g.chunk));
  const allDefs = pack.glossary;

  if (level === 'easy') {
    for (const q of base) {
      if (q.type === 'mcq' && q.options.length > 3) {
        // keep the right answer and the two least similar wrong ones
        const right = q.options[q.answer];
        const wrong = q.options.filter((_, i) => i !== q.answer).sort((a, b) => similarity(b, right) - similarity(a, right)).slice(-2);
        const options = shuffle([right, ...wrong], rand);
        out.push({ ...q, id: id(), options, answer: options.indexOf(right) });
      } else if (q.type === 'tf') out.push({ ...q, id: id() });
      else if (q.type === 'fill') {
        // typed gaps become a choice between three
        const others = shuffle(pack.keyTerms.map((t) => t.term).filter((t) => t.toLowerCase() !== q.answer.toLowerCase() && !new RegExp(escapeRegExp(t), 'i').test(q.prompt)), rand).slice(0, 2);
        if (others.length < 2) continue;
        const options = shuffle([q.answer, ...others], rand);
        out.push({ id: id(), chunk: q.chunk, type: 'mcq', prompt: q.prompt, options, answer: options.indexOf(q.answer), explanation: q.explanation });
      }
    }
    return out;
  }

  // ── Hard ──
  // 1) Definition → type the term, no options
  for (const d of glossary) {
    out.push({ id: id(), chunk: d.chunk, type: 'fill', prompt: `Name the term: ${ensurePeriod(d.definition)}`, answer: capitalize(d.term), accept: [d.term], explanation: `${capitalize(d.term)}: ${ensurePeriod(d.definition)}` });
  }
  // 2) Swapped definitions: true or false (mostly false, so guessing "true" fails)
  for (const d of glossary) {
    const other = shuffle(allDefs.filter((g) => g.term !== d.term), rand).sort((a, b) => Math.abs(a.chunk - d.chunk) - Math.abs(b.chunk - d.chunk))[0];
    const twist = other && rand() < 0.65;
    out.push({
      id: id(),
      chunk: d.chunk,
      type: 'tf',
      prompt: `True or false? ${capitalize(d.term)}: ${lowerFirst(twist ? other!.definition : d.definition)}.`,
      answer: !twist,
      explanation: twist ? `False. That describes ${other!.term}. ${capitalize(d.term)}: ${ensurePeriod(d.definition)}` : `True. ${capitalize(d.term)}: ${ensurePeriod(d.definition)}`,
    });
  }
  // 3) Only one statement is correct
  for (const d of glossary) {
    // near-misses: definitions from the same or neighbouring lessons are the most confusable
    const wrongs = shuffle(allDefs.filter((g) => g.term !== d.term), rand)
      .sort((a, b) => Math.abs(a.chunk - d.chunk) - Math.abs(b.chunk - d.chunk))
      .slice(0, 3);
    if (wrongs.length < 3) continue;
    const right = ensurePeriod(capitalize(lowerFirst(d.definition)));
    const options = shuffle([right, ...wrongs.map((w) => ensurePeriod(capitalize(lowerFirst(w.definition))))], rand);
    out.push({ id: id(), chunk: d.chunk, type: 'mcq', prompt: `Only one of these correctly describes ${d.term}. Which one?`, options, answer: options.indexOf(right), explanation: `${capitalize(d.term)}: ${right}` });
  }
  // 4) NOT questions on lists
  for (const l of pack.lists.filter((x) => inScope(x.chunk) && x.items.length >= 3)) {
    const labels = l.items.map((i) => i.label).filter((x) => wordCount(x) <= 5);
    if (labels.length < 3) continue;
    const outsider = shuffle(
      pack.lists.filter((o) => o !== l).flatMap((o) => o.items.map((i) => i.label)).concat(pack.glossary.map((g) => g.term)).filter((x) => !labels.some((y) => y.toLowerCase() === x.toLowerCase()) && wordCount(x) <= 5),
      rand,
    )[0];
    if (!outsider) continue;
    const options = shuffle([...shuffle(labels, rand).slice(0, 3), outsider], rand);
    out.push({ id: id(), chunk: l.chunk, type: 'mcq', prompt: `Which of these is NOT one of the ${l.category}?`, options, answer: options.indexOf(outsider), explanation: `The ${l.category} are: ${labels.join(', ')}. “${outsider}” is not one of them.` });
    if (l.ordered && labels.length <= 7) out.push({ id: id(), chunk: l.chunk, type: 'order', prompt: `Put the ${l.category} in the correct order.`, items: labels, explanation: labels.map((x, k) => `${k + 1}. ${x}`).join('  ') });
  }
  // 5) Key points with the important word removed, typed, no options
  for (const c of pack.chunks.filter((x) => inScope(x.index))) {
    for (const p of c.keyPoints.slice(0, 3)) {
      if (wordCount(p) < 8 || wordCount(p) > 40) continue;
      const term = c.keyTerms.find((t) => t.length >= 4 && termRegex(t).test(p));
      if (!term) continue;
      const re = termRegex(term);
      const found = p.match(re)![2];
      out.push({ id: id(), chunk: c.index, type: 'fill', prompt: p.replace(re, (_a, pre) => `${pre}_____`), answer: found, accept: [found, term], explanation: p });
    }
  }
  // keep a balanced, shuffled set (max 6 per lesson)
  const per = new Map<number, number>();
  return shuffle(out, rand).filter((q) => {
    const k = per.get(q.chunk) || 0;
    per.set(q.chunk, k + 1);
    return k < 6;
  });
}

const lowerFirst = (s: string) => (/^[A-Z](?![A-Z])/.test(s) ? s[0].toLowerCase() + s.slice(1) : s).replace(/[.…]$/, '');

function similarity(a: string, b: string) {
  const A = new Set(a.toLowerCase().split(/\W+/));
  const B = b.toLowerCase().split(/\W+/);
  return B.filter((w) => w.length > 3 && A.has(w)).length;
}
