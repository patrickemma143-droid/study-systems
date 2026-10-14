// Exam papers: read how a past paper is set, and build a full paper from a study pack —
// in a standard university format or in the style of an uploaded past paper.
import type { StudyPack } from './types';
import { buildLevelQuiz, type Level } from './levels';
import { capitalize, contentStems, ensurePeriod, seededRandom, shuffle, wordCount } from './text';

// ─── Reading a past paper ────────────────────────────────────

const COMMANDS = [
  'define', 'state', 'list', 'name', 'identify', 'outline', 'describe', 'explain', 'discuss', 'compare', 'contrast',
  'distinguish', 'differentiate', 'evaluate', 'assess', 'analyse', 'analyze', 'examine', 'justify', 'illustrate',
  'calculate', 'derive', 'prove', 'suggest', 'account for', 'critically', 'with examples', 'with the aid of', 'what is', 'why', 'how',
];

export interface PaperQuestion {
  n: string;
  text: string;
  marks: number | null;
  command: string | null;
  section: string | null;
  objective: boolean;
  options?: string[];
}

export interface PaperAnalysis {
  questionCount: number;
  totalMarks: number | null;
  duration: string | null;
  instructions: string[];
  sections: { name: string; instruction: string | null; questions: number; marks: number | null; objective: boolean }[];
  commands: { word: string; count: number }[];
  /** Command words used for long (8+ marks) questions, and for short ones */
  longCommands: string[];
  shortCommands: string[];
  marks: { typical: number | null; min: number | null; max: number | null };
  mix: { objective: number; short: number; long: number };
  samples: string[];
  /** Every question found, for practising the real paper */
  questions?: PaperQuestion[];
  topics: { chunk: number; title: string; hits: number }[];
}

const marksIn = (s: string) => {
  const m = s.match(/[([]\s*(\d{1,3})\s*(?:marks?|mks?)\s*[)\]]|\b(\d{1,3})\s*marks?\b/i);
  return m ? Number(m[1] || m[2]) : null;
};
const commandIn = (s: string) => {
  const t = s.toLowerCase();
  let best: { w: string; at: number } | null = null;
  for (const w of COMMANDS) {
    const at = t.search(new RegExp(`\\b${w}\\b`));
    if (at >= 0 && (!best || at < best.at)) best = { w, at };
  }
  return best ? (best.w === 'analyze' ? 'analyse' : best.w) : null;
};

/**
 * PDFs and scans often run several questions together on one line: split them back apart.
 * Question numbers are trusted only when they follow on (1, 2, 3…), so "3 marks" or "2.5" don't split.
 */
export function splitNumbered(text: string): string[] {
  let spaced = text.replace(/\r/g, '').replace(/[ \t]+(?=SECTION\s+[A-Z0-9]\b)/g, '\n');
  let expect = 1;
  spaced = spaced.replace(/(^|[ \t\n])((?:Q(?:uestion)?\.?\s*)?(\d{1,2})\s*[.)]\s+)(?=[A-Z(a-z])/g, (m, pre: string, q: string, num: string) => {
    const n = Number(num);
    if (n === expect || (n === 1 && expect > 1)) {
      expect = n + 1;
      return `\n${q}`;
    }
    return m;
  });
  // multiple-choice options "A. … B. … C. …" on one line
  spaced = spaced.replace(/(?<![Ss]ection|SECTION|[Pp]art|PART)[ \t]+(?=[A-D][.)][ \t]+\S)/g, '\n');
  return spaced.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function analyzePaper(text: string, pack?: StudyPack): PaperAnalysis {
  const lines = splitNumbered(text);
  const questions: PaperQuestion[] = [];
  const sections: PaperAnalysis['sections'] = [];
  const instructions: string[] = [];
  let section: string | null = null;
  let cur: PaperQuestion | null = null;
  let optionLines = 0;
  const flush = () => {
    if (cur) {
      cur.objective = optionLines >= 3;
      cur.command = commandIn(cur.text);
      questions.push(cur);
    }
    cur = null;
    optionLines = 0;
  };
  for (const line of lines) {
    const sec = line.match(/^section\s+([a-z0-9]+)\b[:.\s-]*(.*)$/i);
    if (sec && !/\b(and|questions? in)\b/i.test(sec[2].slice(0, 40))) {
      flush();
      section = sec[1].toUpperCase();
      const secMarks = marksIn(sec[2] || '');
      const rest = (sec[2] || '').replace(/[([]\s*\d{1,3}\s*marks?\s*[)\]]/i, '').trim();
      sections.push({ name: section, instruction: rest || null, questions: 0, marks: secMarks, objective: false });
      continue;
    }
    if (/^(answer|attempt|instructions?|time|duration|read|candidates|write)\b/i.test(line) && line.length < 200 && !cur) {
      instructions.push(line);
      const s = sections[sections.length - 1];
      if (s && !s.instruction && /^(answer|attempt)/i.test(line)) s.instruction = line;
      continue;
    }
    const q = line.match(/^(?:q(?:uestion)?\.?\s*)?(\d{1,2})\s*[.):]\s*(.+)$/i);
    // "(b) Explain … (8 marks)" is a sub-part of a structured question, not a multiple-choice option
    const opt = /^(?:\(?[a-dA-D][.)]|[a-dA-D]\s*[-–])\s+\S/.test(line) && marksIn(line) == null;
    if (q && !(cur && opt)) {
      flush();
      cur = { n: q[1], text: q[2], marks: marksIn(q[2]), command: null, section, objective: false };
      continue;
    }
    if (cur) {
      if (opt) {
        optionLines++;
        (cur.options ||= []).push(line.replace(/^\(?[a-dA-D][.)\-–]?\s*/, '').trim());
      }
      else if (/^\(?([ivx]+|[a-h])\)\s+/i.test(line) || line.length > 3) {
        if (cur.text.length < 1200) cur.text += ` ${line}`;
        cur.marks ??= marksIn(line);
      }
      const m = marksIn(line);
      if (m && cur.marks !== m && /^\(?([ivx]+|[a-h])\)/i.test(line)) cur.marks = (cur.marks || 0) + m;
    }
  }
  flush();

  for (const s of sections) {
    const qs = questions.filter((q) => q.section === s.name);
    s.questions = qs.length;
    const sum = qs.reduce((n, q) => n + (q.marks || 0), 0);
    s.marks = s.marks || sum || null;
    s.objective = qs.length > 0 && qs.filter((q) => q.objective).length / qs.length > 0.5;
  }
  const counts = new Map<string, number>();
  for (const q of questions) if (q.command) counts.set(q.command, (counts.get(q.command) || 0) + 1);
  const marks = questions.map((q) => q.marks).filter((m): m is number => m != null);
  const sorted = [...marks].sort((a, b) => a - b);
  const total = (text.match(/total\s*(?:marks?)?\s*[:=]?\s*(\d{2,3})/i) || [])[1];
  const duration = (text.match(/(?:time|duration)\s*(?:allowed)?\s*[:-]?\s*([0-9½.]+\s*(?:hours?|hrs?|minutes?|mins?)(?:\s*\d+\s*minutes?)?)/i) || text.match(/\b(\d\s*(?:hours?|hrs))\b/i) || [])[1];
  const objective = questions.filter((q) => q.objective).length;
  const long = questions.filter((q) => !q.objective && ((q.marks || 0) >= 8 || /discuss|evaluate|critically|examine|with examples/i.test(q.text))).length;

  let topics: PaperAnalysis['topics'] = [];
  if (pack) {
    const qStems = new Set(questions.flatMap((q) => contentStems(q.text)));
    topics = pack.chunks
      .map((c) => ({ chunk: c.index, title: c.title, hits: [...new Set(contentStems([c.title, ...c.keyTerms].join(' ')))].filter((x) => qStems.has(x)).length }))
      .filter((t) => t.hits > 0)
      .sort((a, b) => b.hits - a.hits);
  }

  return {
    questionCount: questions.length,
    totalMarks: total ? Number(total) : marks.length ? marks.reduce((a, b) => a + b, 0) : null,
    duration: duration ? duration.trim() : null,
    instructions: instructions.slice(0, 6),
    sections,
    commands: [...counts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count),
    longCommands: [...new Set(questions.filter((q) => q.command && !q.objective && ((q.marks || 0) >= 8 || /discuss|evaluate|critically|examine|with/i.test(q.command))).map((q) => q.command!))],
    shortCommands: [...new Set(questions.filter((q) => q.command && !q.objective && (q.marks || 0) < 8 && !/discuss|evaluate|critically|examine|with/i.test(q.command)).map((q) => q.command!))],
    marks: { typical: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, min: sorted[0] ?? null, max: sorted[sorted.length - 1] ?? null },
    mix: { objective, short: questions.length - objective - long, long },
    samples: questions.filter((q) => !q.objective).slice(0, 6).map((q) => q.text.slice(0, 220)),
    questions: questions.slice(0, 80),
    topics,
  };
}

// ─── Building a paper ────────────────────────────────────────

export interface Paper {
  title: string;
  duration: string;
  instructions: string[];
  sections: {
    name: string;
    title: string;
    instruction: string;
    questions: { n: number; text: string; marks: number; options?: string[]; answer: string; guide: string[] }[];
  }[];
  totalMarks: number;
}

export interface PaperOptions {
  chunks?: number[];
  level?: Level;
  style?: PaperAnalysis | null;
  seed?: string;
}

const LONG_COMMANDS = ['Explain', 'Discuss', 'Describe', 'With the aid of examples, explain', 'Examine', 'Outline and explain'];

export function buildPaper(pack: StudyPack, title: string, opts: PaperOptions = {}): Paper {
  const rand = seededRandom(opts.seed || 'paper');
  const level = opts.level || 'medium';
  const inScope = (c: number) => !opts.chunks?.length || opts.chunks.includes(c);
  const chunks = pack.chunks.filter((c) => inScope(c.index)).sort((a, b) => b.importance - a.importance);
  const style = opts.style && opts.style.questionCount >= 3 ? opts.style : null;
  // a past paper we could read question by question: copy its layout exactly
  if (style?.questions && style.questions.filter((q) => !q.objective).length >= 2) return buildPaperLike(pack, title, opts, style);

  // Command words: from the past paper if we have one
  const phrase = (w: string) =>
    ({ 'with examples': 'With examples, explain', 'with the aid of': 'With the aid of examples, explain', critically: 'Critically examine', 'account for': 'Account for', 'what is': 'Explain', why: 'Explain why', how: 'Explain how', compare: 'Compare and contrast' } as Record<string, string>)[w] || capitalize(w);
  const unusable = /calculate|derive|prove/i;
  const longPool = (style?.longCommands || []).filter((w) => !unusable.test(w)).map(phrase);
  const shortPool = (style?.shortCommands || []).filter((w) => !unusable.test(w) && !['define', 'distinguish', 'differentiate', 'name', 'identify'].includes(w)).map(phrase);
  const pickCommand = (fallback: string[], i: number) => (longPool.length ? longPool[i % longPool.length] : fallback[i % fallback.length]);

  // Section A: objective questions
  const wantObjective = style ? style.mix.objective > 0 : true;
  const objCount = style ? Math.min(30, Math.max(style.mix.objective, wantObjective ? 10 : 0)) : Math.min(20, Math.max(10, chunks.length * 3));
  const mcqs = shuffle(buildLevelQuiz(pack, level, opts.chunks, opts.seed).filter((q) => q.type === 'mcq' || q.type === 'tf'), rand).slice(0, objCount);
  const sectionA = mcqs.map((q, i) => {
    if (q.type === 'mcq') return { n: i + 1, text: q.prompt, marks: 1, options: q.options, answer: `${'ABCD'[q.answer]}. ${q.options[q.answer]}`, guide: [q.explanation] };
    return { n: i + 1, text: `${q.prompt.replace(/^True or false\?\s*/i, '')} (True / False)`, marks: 1, answer: q.type === 'tf' && q.answer ? 'True' : 'False', guide: [q.explanation] };
  });

  // Section B: short answers
  const short: Paper['sections'][number]['questions'] = [];
  const defs = shuffle(pack.glossary.filter((g) => inScope(g.chunk)), rand);
  for (const d of defs.slice(0, 4)) short.push({ n: 0, text: `Define the term “${d.term}”.`, marks: 2, answer: ensurePeriod(d.definition), guide: [ensurePeriod(d.definition)] });
  for (const l of pack.lists.filter((x) => inScope(x.chunk) && x.items.length >= 2).slice(0, 3)) {
    const k = Math.min(l.items.length, 4);
    const verb = shortPool.length ? shortPool[short.length % shortPool.length] : 'List';
    short.push({ n: 0, text: l.question && k === l.items.length ? l.question : `${k === l.items.length ? verb : `${verb === 'List' ? 'State' : verb} any ${k} of`} the ${l.category}.`, marks: k, answer: l.items.map((i) => i.label).join('; '), guide: l.items.map((i) => (i.detail ? `${i.label}: ${i.detail}` : i.label)) });
  }
  // distinguish pairs from the same lesson
  const byChunk = new Map<number, typeof defs>();
  for (const d of defs) (byChunk.get(d.chunk) || byChunk.set(d.chunk, []).get(d.chunk)!).push(d);
  for (const [, ds] of byChunk) {
    if (ds.length >= 2 && short.length < 10) short.push({ n: 0, text: `Distinguish between ${ds[0].term} and ${ds[1].term}.`, marks: 4, answer: `${capitalize(ds[0].term)}: ${ensurePeriod(ds[0].definition)} ${capitalize(ds[1].term)}: ${ensurePeriod(ds[1].definition)}`, guide: [`${capitalize(ds[0].term)}: ${ensurePeriod(ds[0].definition)}`, `${capitalize(ds[1].term)}: ${ensurePeriod(ds[1].definition)}`] });
  }
  const shortQs = shuffle(short, rand).slice(0, style ? Math.max(4, Math.min(10, style.mix.short)) : 8);

  // Section C: structured / essay questions, one per examinable lesson
  const longMarks = style?.marks.max && style.marks.max >= 8 ? style.marks.max : style?.marks.typical && style.marks.typical >= 8 ? style.marks.typical : level === 'hard' ? 20 : 15;
  const longCount = Math.min(chunks.length, style ? Math.max(4, (style.mix.long || 3) + 1) : Math.max(3, Math.min(6, chunks.length)));
  const longQs = chunks.slice(0, longCount).map((c, i) => {
    const list = pack.lists.find((l) => l.chunk === c.index && l.items.length >= 3);
    const cmd = pickCommand(LONG_COMMANDS, i);
    const subject = list && i % 2 === 0 && wordCount(list.category) >= 2 ? `the ${list.category}` : c.title.replace(/^(an?|the)\s+/i, '').toLowerCase();
    const a = Math.round(longMarks * 0.4);
    const text = level === 'hard' || longMarks >= 15
      ? `(a) ${cmd} ${subject}. (${longMarks - a} marks)  (b) ${i % 2 ? 'Using an example from everyday life in Uganda, show why this matters.' : `Show how this links to ${(chunks[(i + 1) % chunks.length] || c).title.replace(/^(an?|the)\s+/i, '').toLowerCase()}.`} (${a} marks)`
      : `${cmd} ${subject}.`;
    return { n: 0, text, marks: longMarks, answer: c.nutshell, guide: [...c.keyPoints.slice(0, 6), ...(list ? [`${capitalize(list.category)}: ${list.items.map((x) => x.label).join(', ')}`] : [])] };
  });
  // "Answer any THREE": copy the past paper's rule when it has one
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const anyText = [...(style?.instructions || []), ...(style?.sections.map((x) => x.instruction || '') || [])].join(' ').match(/any\s+(\d|one|two|three|four|five|six)\b/i);
  const styleAny = anyText ? Number(anyText[1]) || WORDS[anyText[1].toLowerCase()] : 0;
  const answerAny = styleAny ? Math.max(1, Math.min(longQs.length, styleAny)) : Math.max(2, Math.min(longQs.length, Math.ceil(longQs.length * 0.6)));
  // Match the past paper's marks for the short-answer section
  const shortTarget = style?.sections.find((x) => !x.objective && x.marks && x.marks < 100 && (x.name === 'A' || x.questions > 2))?.marks;
  const shortSum = shortQs.reduce((m, q) => m + q.marks, 0);
  if (shortTarget && shortSum && shortSum < shortTarget) {
    const f = shortTarget / shortSum;
    let left = shortTarget;
    shortQs.forEach((q, i) => {
      q.marks = i === shortQs.length - 1 ? Math.max(1, left) : Math.max(1, Math.round(q.marks * f));
      left -= q.marks;
    });
  }

  const sections: Paper['sections'] = [];
  if (sectionA.length) sections.push({ name: 'A', title: 'Objective questions', instruction: `Answer ALL questions in this section. Each question carries 1 mark.`, questions: sectionA });
  if (shortQs.length) sections.push({ name: String.fromCharCode(65 + sections.length), title: 'Short answer questions', instruction: 'Answer ALL questions in this section.', questions: shortQs });
  if (longQs.length) sections.push({ name: String.fromCharCode(65 + sections.length), title: 'Structured and essay questions', instruction: `Answer any ${answerAny} questions from this section. Each question carries ${longMarks} marks.`, questions: longQs });
  let n = 1;
  for (const s of sections) for (const q of s.questions) q.n = n++;

  const totalMarks = sections.reduce((t, s) => t + (s.title.startsWith('Structured') ? answerAny * longMarks : s.questions.reduce((m, q) => m + q.marks, 0)), 0);
  const hours = totalMarks > 80 ? 3 : totalMarks > 50 ? 2 : 1.5;
  return {
    title,
    duration: style?.duration || (hours === 1.5 ? '1 hour 30 minutes' : `${hours} hours`),
    instructions: [
      'Read all the questions carefully before you start.',
      'Write your answers clearly. Marks are shown for each question.',
      ...(style?.instructions.filter((x) => /answer|attempt/i.test(x)).slice(0, 2) || []),
    ],
    sections,
    totalMarks,
  };
}

// ─── Same format as the past paper ───────────────────────────

/** "(a) Define X. (2 marks) (b) Explain Y. (4 marks)" → [{ cmd: 'define', marks: 2 }, { cmd: 'explain', marks: 4 }] */
export function subParts(text: string): { cmd: string | null; marks: number | null }[] {
  const pieces = text.split(/\s*\((?:[a-h]|i{1,3}|iv|v|vi{0,3})\)\s+/i).slice(1);
  return pieces.length >= 2 ? pieces.map((x) => ({ cmd: commandIn(x), marks: marksIn(x) })) : [];
}

type GenQ = { text: string; answer: string; guide: string[] };

/**
 * Build a paper that looks like the past paper: the same sections in the same order, the same
 * number of questions in each, the same marks, the same sub-parts and the same command word in
 * each position — only the content comes from the student's notes.
 */
function buildPaperLike(pack: StudyPack, title: string, opts: PaperOptions, style: PaperAnalysis): Paper {
  const rand = seededRandom(`${opts.seed || 'paper'}:like`);
  const level = opts.level || 'medium';
  const inScope = (c: number) => !opts.chunks?.length || opts.chunks.includes(c);
  const chunks = shuffle(pack.chunks.filter((c) => inScope(c.index)), rand).sort((a, b) => b.importance - a.importance);
  const defs = shuffle(pack.glossary.filter((g) => inScope(g.chunk)), rand);
  const lists = shuffle(pack.lists.filter((l) => inScope(l.chunk) && l.items.length >= 2), rand);
  const used = new Set<string>();
  const once = <T,>(xs: T[], key: (x: T) => string) => {
    const x = xs.find((y) => !used.has(key(y)));
    if (x) used.add(key(x));
    return x;
  };
  const bare = (t: string) => t.replace(/\s*\(part \d+\)$/, '').replace(/\s*&\s.*$/, '').replace(/^(?:an?\s+)?(?:introduction|overview)\s+(?:to|of)\s+/i, '').replace(/^(an?|the)\s+/i, '');
  const lc = (t: string) => (/\b[A-Z]{2,}|\b[A-Z][a-z]+[A-Z]/.test(t) ? t : t.toLowerCase());

  /** One question (or sub-part) in the shape of the past one: its command word and its marks. */
  const make = (cmd: string | null, marks: number, chunkHint?: number): GenQ => {
    const c = (chunkHint != null ? pack.chunks[chunkHint] : null) || chunks[0];
    const local = <T extends { chunk: number }>(xs: T[]) => [...xs.filter((x) => x.chunk === c?.index), ...xs];
    const w = (cmd || '').toLowerCase();
    if (/define|what is/.test(w) || (!w && marks <= 2)) {
      const d = once(local(defs), (x) => `d:${x.term}`);
      if (d) return { text: `Define the term “${d.term}”.`, answer: ensurePeriod(d.definition), guide: [ensurePeriod(d.definition)] };
    }
    if (/distinguish|differentiate|compare|contrast/.test(w)) {
      // two terms from the same lesson, so the comparison makes sense
      const pair = local(defs).filter((d) => !used.has(`d:${d.term}`));
      const a = pair.find((d) => pair.some((e) => e !== d && e.chunk === d.chunk));
      const b = a && pair.find((d) => d !== a && d.chunk === a.chunk);
      if (a && b) {
        used.add(`d:${a.term}`);
        used.add(`d:${b.term}`);
        const g = [`${capitalize(a.term)}: ${ensurePeriod(a.definition)}`, `${capitalize(b.term)}: ${ensurePeriod(b.definition)}`];
        return { text: `${w === 'compare' || w === 'contrast' ? 'Compare and contrast' : `${capitalize(w || 'distinguish')} between`} ${a.term} and ${b.term}.`, answer: g.join(' '), guide: g };
      }
    }
    if (/list|state|name|identify|outline|give/.test(w) || (!w && marks <= 6)) {
      const l = once(local(lists), (x) => `l:${x.category}`);
      if (l) {
        const k = Math.max(2, Math.min(l.items.length, marks >= 2 && marks <= l.items.length ? marks : l.items.length));
        const verb = capitalize(w && w !== 'list' ? w : 'list');
        const text = k === l.items.length ? `${verb} the ${l.category}.` : `${verb} any ${numberWord(k)} ${l.category}.`;
        return { text, answer: l.items.map((i) => i.label).join('; '), guide: l.items.map((i) => (i.detail ? `${i.label}: ${i.detail}` : i.label)) };
      }
    }
    // explain / describe / discuss / evaluate…: a lesson-sized idea
    const ch = (chunkHint != null ? c : once(chunks, (x) => `c:${x.index}`)) || c;
    // never ask about the same thing twice: lists, then key terms, then the lesson itself
    const l = pack.lists.find((x) => x.chunk === ch.index && x.items.length >= 3 && !used.has(`s:the ${x.category}`));
    const options = [
      ...(l && marks >= 4 ? [`the ${l.category}`] : []),
      ...ch.keyTerms.slice(0, 4).map((t) => (marks >= 6 ? `the importance of ${lc(t)}` : lc(t))),
      lc(bare(ch.title)),
      ...pack.chunks.filter((x) => inScope(x.index)).map((x) => lc(bare(x.title))),
    ];
    const subject = options.find((o) => !used.has(`s:${o}`)) || lc(bare(ch.title));
    used.add(`s:${subject}`);
    const verb = (/^(?:explain|describe|discuss|evaluate|assess|analyse|examine|illustrate|outline|critically|with examples|with the aid of|account for|justify)$/.test(w) ? phraseCommand(w) : '') || (marks >= 10 ? (level === 'hard' ? 'Critically discuss' : 'Discuss') : 'Explain');
    const tail = /with examples|with the aid/.test(w) ? '' : marks >= 10 && level !== 'easy' ? ', giving relevant examples' : '';
    return { text: `${verb} ${subject}${tail}.`, answer: ch.nutshell, guide: [...ch.keyPoints.slice(0, Math.max(3, Math.min(8, Math.ceil(marks / 2)))), ...(l && subject === `the ${l.category}` ? [`${capitalize(l.category)}: ${l.items.map((x) => x.label).join(', ')}`] : [])] };
  };

  const order = style.sections.length ? style.sections.map((s) => s.name) : [null];
  const sections: Paper['sections'] = [];
  let mcqPool = shuffle(buildLevelQuiz(pack, level, opts.chunks, opts.seed).filter((q) => q.type === 'mcq'), rand);
  let chunkTurn = 0;
  for (const name of order) {
    const sec = style.sections.find((s) => s.name === name);
    const past = (style.questions || []).filter((q) => q.section === name);
    if (!past.length) continue;
    const objective = sec ? sec.objective : past.filter((q) => q.objective).length / past.length > 0.5;
    const questions: Paper['sections'][number]['questions'] = [];
    if (objective) {
      const take = mcqPool.slice(0, Math.min(40, past.length));
      mcqPool = mcqPool.slice(take.length);
      const m = past.find((q) => q.marks)?.marks || 1;
      for (const q of take) if (q.type === 'mcq') questions.push({ n: 0, text: q.prompt, marks: m, options: q.options, answer: `${'ABCD'[q.answer]}. ${q.options[q.answer]}`, guide: [q.explanation] });
    } else {
      for (const pq of past.slice(0, 15)) {
        const marks = pq.marks || style.marks.typical || 10;
        const parts = subParts(pq.text);
        const lead = pq.text.split(/\s*\((?:a|i)\)\s+/i)[0];
        if (parts.length >= 2 && parts.filter((x) => x.cmd).length === 0 && /^(?:define|explain the (?:following )?terms|what is meant by)/i.test(lead.trim())) {
          // "Define the following terms: (a) osmosis (b) diffusion"
          const ds = defs.filter((d) => !used.has(`d:${d.term}`)).slice(0, parts.length);
          ds.forEach((d) => used.add(`d:${d.term}`));
          if (ds.length >= 2) {
            questions.push({
              n: 0,
              text: `${lead.trim().replace(/[:\s]*$/, ':')} ${ds.map((d, i) => `(${'abcdefgh'[i]}) ${d.term}`).join(' ')}`,
              marks,
              answer: ds.map((d, i) => `(${'abcdefgh'[i]}) ${ensurePeriod(d.definition)}`).join(' '),
              guide: ds.map((d) => `${capitalize(d.term)}: ${ensurePeriod(d.definition)}`),
            });
            continue;
          }
        }
        if (parts.length >= 2 && parts.filter((x) => x.cmd || x.marks).length >= 2) {
          // a structured question: one lesson, the same sub-parts, the same marks per part
          const ch = chunks[chunkTurn++ % Math.max(1, chunks.length)];
          const known = parts.reduce((n, x) => n + (x.marks || 0), 0);
          const each = parts.map((x) => x.marks || Math.max(1, Math.round((marks - known) / Math.max(1, parts.filter((y) => !y.marks).length))));
          const gen = parts.map((x, i) => ({ ...make(x.cmd, each[i], ch?.index), marks: each[i] }));
          questions.push({
            n: 0,
            text: gen.map((g, i) => `(${'abcdefgh'[i]}) ${g.text} (${g.marks} mark${g.marks === 1 ? '' : 's'})`).join('  '),
            marks: gen.reduce((n, g) => n + g.marks, 0),
            answer: gen.map((g, i) => `(${'abcdefgh'[i]}) ${g.answer}`).join(' '),
            guide: gen.flatMap((g, i) => g.guide.map((x, j) => (j === 0 ? `(${'abcdefgh'[i]}) ${x}` : x))),
          });
        } else {
          const ch = marks >= 8 ? chunks[chunkTurn++ % Math.max(1, chunks.length)] : undefined;
          const g = make(pq.command, marks, ch?.index);
          questions.push({ n: 0, ...g, marks });
        }
      }
    }
    if (!questions.length) continue;
    const marksEach = new Set(questions.map((q) => q.marks));
    // "Answer ALL questions in Section A and any THREE questions in Section B" → each section's own rule
    const global = style.instructions.join(' ');
    const rule = name ? global.match(new RegExp(`\\b(all|any\\s+(?:\\d|one|two|three|four|five|six))\\s+(?:questions?\\s+)?(?:from|in)\\s+section\\s+${name}\\b`, 'i')) : null;
    const maxMarks = Math.max(...questions.map((q) => q.marks));
    sections.push({
      name: name || String.fromCharCode(65 + sections.length),
      title: objective ? 'Objective questions' : marksEach.size === 1 && maxMarks >= 10 ? 'Essay questions' : maxMarks < 8 ? 'Short answer questions' : 'Structured questions',
      instruction: sec?.instruction || (rule ? `Answer ${/^all/i.test(rule[1]) ? 'ALL' : rule[1].replace(/^any\s+/i, 'any ').replace(/any (\w+)/i, (_m, x) => `any ${String(x).toUpperCase()}`)} questions in this section.` : objective ? 'Answer ALL questions in this section.' : 'Answer ALL questions.'),
      questions,
    });
  }
  let n = 1;
  for (const s of sections) for (const q of s.questions) q.n = n++;

  // marks: count only the questions the instruction asks for ("answer any three")
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const sectionMarks = (s: Paper['sections'][number]) => {
    const any = s.instruction.match(/any\s+(\d|one|two|three|four|five|six)\b/i);
    const k = any ? Number(any[1]) || WORDS[any[1].toLowerCase()] : 0;
    const ms = s.questions.map((q) => q.marks).sort((a, b) => b - a);
    return k && k < ms.length ? ms.slice(0, k).reduce((a, b) => a + b, 0) : ms.reduce((a, b) => a + b, 0);
  };
  const totalMarks = style.totalMarks && Math.abs(style.totalMarks - sections.reduce((t, s) => t + sectionMarks(s), 0)) <= 10 ? style.totalMarks : sections.reduce((t, s) => t + sectionMarks(s), 0);
  return {
    title,
    duration: style.duration || (totalMarks > 80 ? '3 hours' : totalMarks > 50 ? '2 hours' : '1 hour 30 minutes'),
    instructions: style.instructions.length ? style.instructions.slice(0, 6) : ['Read all the questions carefully before you start.'],
    sections,
    totalMarks,
  };
}

function numberWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n);
}

function phraseCommand(w: string): string {
  if (!w) return '';
  const map: Record<string, string> = { 'with examples': 'With examples, explain', 'with the aid of': 'With the aid of examples, explain', critically: 'Critically examine', 'account for': 'Account for', 'what is': 'Explain', why: 'Explain why', how: 'Explain how', compare: 'Compare and contrast', calculate: 'Explain', derive: 'Explain', prove: 'Explain' };
  return map[w] || capitalize(w);
}

export const paperWords = (p: Paper) => p.sections.reduce((n, s) => n + s.questions.reduce((m, q) => m + wordCount(q.text), 0), 0);

// ─── Marking keys ────────────────────────────────────────────

export interface KeyAnalysis {
  answers: Record<string, string>;
  matched: number;
  /** "About 1 mark per point" when the key shows it */
  markPerPoint: number | null;
  avgPoints: number | null;
  style: string;
}

/** Read a marking key / answer scheme and line its answers up with the paper's question numbers. */
export function analyzeKey(text: string, paper?: PaperAnalysis | null): KeyAnalysis {
  const lines = splitNumbered(text);
  const answers: Record<string, string> = {};
  let cur: string | null = null;
  for (const line of lines) {
    const q = line.match(/^(?:q(?:uestion)?\.?\s*)?(\d{1,2})\s*[.):]\s*(.*)$/i);
    if (q) {
      cur = String(Number(q[1]));
      answers[cur] = q[2] || '';
      continue;
    }
    if (cur && answers[cur].length < 3000) answers[cur] += `${answers[cur] ? '\n' : ''}${line}`;
  }
  const all = Object.values(answers);
  const points = all.map((a) => a.split(/\n|;|•|(?:^|\s)-\s/).filter((x) => x.trim().length > 2).length);
  const perPoint = text.match(/(\d|½|one|half)\s*marks?\s*(?:each|per|for each)/i) || text.match(/\((½|1|2)\s*marks?\)/i);
  const mark = perPoint ? (/½|half/i.test(perPoint[1]) ? 0.5 : Number(perPoint[1]) || 1) : null;
  const questionNs = new Set((paper?.questions || []).map((q) => String(Number(q.n))));
  const matched = Object.keys(answers).filter((n) => questionNs.has(n)).length;
  const avgPoints = points.length ? Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 10) / 10 : null;
  const style = mark ? `about ${mark === 0.5 ? '½' : mark} mark for each correct point` : avgPoints && avgPoints >= 3 ? 'marks given point by point' : 'short model answers';
  return { answers, matched, markPerPoint: mark, avgPoints, style };
}
