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

export function analyzePaper(text: string, pack?: StudyPack): PaperAnalysis {
  // PDFs often run several questions together on one line: split them back apart.
  // Question numbers are trusted only when they follow on (1, 2, 3…), so "3 marks" or "2.5" don't split.
  let spaced = text.replace(/\r/g, '').replace(/[ \t]+(?=SECTION\s+[A-Z0-9]\b)/g, '\n');
  let expect = 1;
  spaced = spaced.replace(/(^|[ \t\n])((?:Q(?:uestion)?\.?\s*)?(\d{1,2})\s*[.)]\s+)(?=[A-Z(])/g, (m, pre: string, q: string, num: string) => {
    const n = Number(num);
    if (n === expect || (n === 1 && expect > 1)) {
      expect = n + 1;
      return `\n${q}`;
    }
    return m;
  });
  // multiple-choice options "A. … B. … C. …" on one line
  spaced = spaced.replace(/(?<![Ss]ection|SECTION|[Pp]art|PART)[ \t]+(?=[A-D][.)][ \t]+\S)/g, '\n');
  const lines = spaced.split('\n').map((l) => l.trim()).filter(Boolean);
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
    const opt = /^(?:\(?[a-dA-D][.)]|[a-dA-D]\s*[-–])\s+\S/.test(line);
    if (q && !(cur && opt)) {
      flush();
      cur = { n: q[1], text: q[2], marks: marksIn(q[2]), command: null, section, objective: false };
      continue;
    }
    if (cur) {
      if (opt) optionLines++;
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

export const paperWords = (p: Paper) => p.sections.reduce((n, s) => n + s.questions.reduce((m, q) => m + wordCount(q.text), 0), 0);
