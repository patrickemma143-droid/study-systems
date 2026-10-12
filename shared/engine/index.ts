import type { Chunk, PalaceItem, SourceBlock, StudyPack } from './types';
import { cleanBlocks } from './blocks';
import { buildSections } from './chunker';
import { findDefinitions, findLists } from './definitions';
import { extractKeyTerms } from './keyterms';
import { buildMnemonic } from './mnemonics';
import { buildCards, buildPrompts, buildQuiz } from './practice';
import { pickKeyPoints, scoreSentences, tidySentence } from './summarize';
import { capitalize, contentStems, seededRandom, splitSentences, termRegex, wordCount } from './text';

export * from './types';
export { blocksFromPlainText } from './blocks';

export interface BuildOptions {
  title?: string;
  seed?: string;
}

const READING_WPM = 200;

/**
 * The API-free study engine: turns structured text into bite-size chunks, key points,
 * a glossary, flashcards, quiz questions, mnemonics and memory-palace stops.
 * Swap this function for an AI-backed one later — the output shape stays the same.
 */
export function buildStudyPack(blocks: SourceBlock[], opts: BuildOptions = {}): StudyPack {
  const cleaned = cleanBlocks(blocks);
  const sections = buildSections(cleaned);
  const seed = opts.seed || opts.title || cleaned.slice(0, 3).map((b) => b.text).join(' ');
  const rand = seededRandom(seed);

  const chunkParts = sections.map((s) => s.parts);
  const headings = sections.map((s) => s.title);

  // sentences per chunk (bullets count as one "sentence" each)
  const chunkSentences = sections.map((s) => {
    const out: { text: string; lead: boolean }[] = [];
    for (const p of s.parts) {
      if (p.t === 'h') continue;
      const ss = p.t === 'li' ? [p.x] : splitSentences(p.x);
      ss.forEach((x, i) => out.push({ text: x.trim(), lead: i === 0 }));
    }
    return out;
  });

  const definitions = findDefinitions(chunkParts);
  const keyTerms = extractKeyTerms(
    chunkSentences.map((ss) => ss.map((s) => s.text)),
    headings.filter((h): h is string => !!h),
    definitions.map((d) => d.term),
  );
  const termStems = new Set(keyTerms.slice(0, 40).flatMap((t) => contentStems(t.term)));
  const lists = findLists(chunkParts, sections.map((s) => s.titles[0] ?? s.title));

  // "topic words" (e.g. "cell" in a cell-biology lecture) appear everywhere — useless to blank out or highlight
  const titleWords = new Set(contentStems(opts.title || ''));
  const topic = new Set(
    keyTerms
      .filter((t) => !t.term.includes(' ') && ((sections.length >= 3 && t.chunks.length / sections.length >= 0.6) || titleWords.has(contentStems(t.term)[0])))
      .filter((t) => !definitions.some((d) => d.term.toLowerCase() === t.term.toLowerCase() && sections.length < 3))
      .map((t) => t.term.toLowerCase()),
  );
  const practiceTerms = keyTerms.filter((t) => !topic.has(t.term.toLowerCase()));

  const chunks: Chunk[] = sections.map((s, index) => {
    const text = s.parts.map((p) => p.x).join(' ');
    const lower = text.toLowerCase();
    const localDefs = definitions.filter((d) => d.chunk === index);
    const scored = scoreSentences(chunkSentences[index], termStems, localDefs.map((d) => d.definition));
    const points = pickKeyPoints(scored, 6).map((x) => tidySentence(x.text)).filter((x) => wordCount(x) >= 3);
    const best = [...scored].sort((a, b) => b.score - a.score)[0];
    let nutshell = best ? tidySentence(best.text) : '';
    if (wordCount(nutshell) > 40) nutshell = nutshell.split(/;\s/)[0];

    const chunkTerms = practiceTerms
      .filter((t) => lower.includes(t.term.toLowerCase()) || termRegex(t.term).test(text))
      .slice(0, 6)
      .map((t) => t.term);

    let title = s.title;
    if (!title) {
      const tt = chunkTerms.slice(0, 2).map(capitalize);
      title = tt.length === 2 ? `${tt[0]} and ${tt[1].toLowerCase() === tt[1] ? tt[1] : tt[1]}` : tt[0] || `${nutshell.split(/\s+/).slice(0, 6).join(' ')}…`;
    }
    const wc = s.words;
    return {
      index,
      title,
      nutshell,
      keyPoints: points.length ? points : nutshell ? [nutshell] : [],
      keyTerms: chunkTerms,
      body: s.parts,
      wordCount: wc,
      readMinutes: Math.max(1, Math.round(wc / READING_WPM)),
      importance: 0,
      prompts: [],
    };
  });

  // importance: definitions, lists and key-term density mark the "examinable" chunks
  const termScore = new Map(keyTerms.map((t) => [t.term, t.score]));
  const raw = chunks.map((c) => {
    const d = definitions.filter((x) => x.chunk === c.index).length;
    const l = lists.filter((x) => x.chunk === c.index).length;
    const t = c.keyTerms.reduce((n, term) => n + (termScore.get(term) || 0), 0);
    return d * 2 + l * 1.5 + t / 4 + Math.min(c.wordCount, 300) / 300;
  });
  const maxRaw = Math.max(...raw, 1);
  chunks.forEach((c, i) => (c.importance = Math.round((raw[i] / maxRaw) * 100) / 100));

  chunks.forEach((c) => {
    c.prompts = buildPrompts(c, definitions.filter((d) => d.chunk === c.index && !topic.has(d.term.toLowerCase())), lists, rand);
  });

  const glossary = [...definitions].sort((a, b) => a.chunk - b.chunk || b.strength - a.strength).slice(0, 200);
  const cards = buildCards(chunks, glossary, lists, practiceTerms);
  const quiz = buildQuiz(chunks, glossary, lists, practiceTerms, seed);
  const mnemonics = lists.filter((l) => l.items.length >= 3).slice(0, 24).map((l, i) => buildMnemonic(l, `${seed}:${i}`));

  // memory palace stops: the most examinable ideas, walked in reading order
  const candidates: (PalaceItem & { weight: number })[] = [
    ...glossary.map((d) => ({ chunk: d.chunk, cue: capitalize(d.term), detail: d.definition, weight: 2 + d.strength / 4 + chunks[d.chunk].importance })),
    ...lists.map((l) => ({ chunk: l.chunk, cue: capitalize(l.category), detail: l.items.map((i) => i.label).join(', '), weight: 2.2 + chunks[l.chunk].importance })),
    ...chunks.map((c) => ({ chunk: c.index, cue: c.title, detail: c.nutshell, weight: 1 + c.importance })),
  ];
  const seenCue = new Set<string>();
  const palace = candidates
    .sort((a, b) => b.weight - a.weight)
    .filter((c) => {
      const k = c.cue.toLowerCase();
      if (seenCue.has(k) || !c.detail) return false;
      seenCue.add(k);
      return true;
    })
    .slice(0, 12)
    .sort((a, b) => a.chunk - b.chunk)
    .map(({ chunk, cue, detail }) => ({ chunk, cue, detail }));

  const overview = chunks.length <= 2
    ? (chunks[0]?.keyPoints || []).slice(0, 3)
    : [...chunks]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, Math.min(5, Math.ceil(chunks.length / 2)))
        .sort((a, b) => a.index - b.index)
        .map((c) => c.nutshell)
        .filter(Boolean);

  const words = chunks.reduce((n, c) => n + c.wordCount, 0);
  const title = (opts.title || cleaned.find((b) => b.kind === 'heading')?.text || chunks[0]?.title || 'My notes').slice(0, 140);

  return {
    version: 1,
    title,
    overview,
    chunks,
    glossary,
    keyTerms: practiceTerms.slice(0, 40),
    lists,
    mnemonics,
    palace,
    quiz,
    cards,
    stats: {
      words,
      chunks: chunks.length,
      cards: cards.length,
      questions: quiz.length,
      readMinutes: Math.max(1, Math.round(words / READING_WPM)),
    },
  };
}
