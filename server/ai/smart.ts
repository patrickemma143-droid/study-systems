// "Smart" AI work: rebuilding a lesson's cards, quiz and objectives, and writing a full exam
// paper in the exact format of a past paper. Everything the model returns is checked before use.
import type { CourseOutline, QuizQuestion, StudyPack } from '../../shared/engine/types';
import type { Paper } from '../../shared/engine/paper';
import { buildOutline } from '../../shared/engine/outline';
import { AiError, type AiRequest } from './providers';
import { PERSONA, contextBlock, type LessonContext } from './prompts';

// ─── Smart lesson ────────────────────────────────────────────

export function smartLessonRequest(ctx: LessonContext, outline: string[]): AiRequest {
  return {
    system: `${PERSONA}\n\nTASK:SMART_LESSON\nYou are an experienced university lecturer and exam setter. You turn one lesson of a student's notes into study material that is accurate, complete and exam-focused.
${outline.length ? `\nThe course outline (all lessons in this pack):\n${outline.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n` : ''}
${contextBlock(ctx)}`,
    messages: [
      {
        role: 'user',
        content: `Read the lesson carefully, work out what it is really about, and reply with JSON only, in exactly this shape:
{"title": "a clear lesson title, at most 8 words",
 "topic": "the course topic this lesson belongs to, at most 6 words (lessons on the same topic must use the same words)",
 "objectives": ["3 to 5 learning objectives, each starting with a command verb such as Define, List, Describe, Explain, Compare, Calculate, Apply"],
 "cards": [{"type": "definition | list | concept | cloze", "front": "question", "back": "answer"}],
 "quiz": [{"q": "multiple-choice question", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "why that answer is right"}]}

Rules for cards (give 6 to 10):
- Cover every examinable idea in the lesson: definitions, lists, processes, differences, causes and effects, formulas.
- Each front is one complete, self-contained question a lecturer could ask. Never a fragment, never "Name the 7 X" unless there really are exactly 7 items.
- A list card says exactly what the list is, e.g. "Name the 3 types of epidemiological studies." and the back lists them one per line ("• item — short explanation").
- Never put a heading or a sub-heading (like "Helps to:") into an answer as if it were an item.
- A cloze card's front is a sentence from the lesson with the key word replaced by _____ ; the back is only the missing word(s).
- Backs are short and memorable: at most 45 words.
Rules for quiz (give 5 to 8): four options each, one clearly correct, wrong options plausible and from the same lesson; "answer" is the index 0-3.
Use only facts in the notes. If something in the notes is wrong, do not repeat it.`,
      },
    ],
    json: true,
    maxTokens: 2600,
    temperature: 0.3,
  };
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.replace(/\s+\n/g, '\n').trim().slice(0, max) : '');

export interface SmartLesson {
  title: string;
  topic: string;
  objectives: string[];
  cards: { type: 'definition' | 'list' | 'concept' | 'cloze'; front: string; back: string }[];
  quiz: { q: string; options: string[]; answer: number; explanation: string }[];
}

export function cleanSmartLesson(raw: any): SmartLesson {
  const types = new Set(['definition', 'list', 'concept', 'cloze']);
  const cards = (Array.isArray(raw?.cards) ? raw.cards : [])
    .map((c: any) => ({ type: types.has(c?.type) ? c.type : 'concept', front: str(c?.front, 400), back: str(c?.back, 700) }))
    .filter((c: any) => c.front.length >= 8 && c.back.length >= 1 && (c.type !== 'cloze' || c.front.includes('___')))
    .slice(0, 12);
  const quiz = (Array.isArray(raw?.quiz) ? raw.quiz : [])
    .map((q: any) => ({
      q: str(q?.q, 400),
      options: Array.isArray(q?.options) ? q.options.map((o: any) => str(o, 200)).filter(Boolean).slice(0, 4) : [],
      answer: Number(q?.answer),
      explanation: str(q?.explanation, 500),
    }))
    .filter((q: any) => q.q && q.options.length === 4 && new Set(q.options.map((o: string) => o.toLowerCase())).size === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .slice(0, 10);
  const objectives = (Array.isArray(raw?.objectives) ? raw.objectives : []).map((o: any) => str(o, 200)).filter((o: string) => o.length > 5).slice(0, 6);
  if (cards.length < 3) throw new AiError('The AI answer was incomplete. Try again.');
  return { title: str(raw?.title, 80), topic: str(raw?.topic, 60), objectives, cards, quiz };
}

/** Put a smart lesson into the pack: objectives, topic and quiz in the pack data. Cards are handled by the caller. */
export function mergeSmartLesson(pack: StudyPack, chunk: number, s: SmartLesson): StudyPack {
  const outline: CourseOutline = pack.outline ?? buildOutline(pack);
  if (s.objectives.length) outline.objectives[chunk] = s.objectives;
  const smart = (pack.smart ??= { lessons: {} });
  smart.lessons[chunk] = { title: s.title, topic: s.topic, at: Date.now() };
  // once every lesson has an AI topic, the topics come from the AI
  const topics = pack.chunks.map((c) => smart.lessons[c.index]?.topic);
  if (topics.every(Boolean)) {
    const groups: CourseOutline['topics'] = [];
    for (const c of pack.chunks) {
      const t = topics[c.index]!;
      const g = groups.find((x) => x.title.toLowerCase() === t.toLowerCase());
      if (g) g.chunks.push(c.index);
      else groups.push({ title: t, chunks: [c.index] });
    }
    outline.topics = groups;
    outline.source = 'ai';
  }
  pack.outline = outline;
  if (s.quiz.length) {
    const ai: QuizQuestion[] = s.quiz.map((q, i) => ({ id: `ai-${chunk}-${i}`, chunk, type: 'mcq', prompt: q.q, options: q.options, answer: q.answer, explanation: q.explanation }));
    const rest = pack.quiz.filter((q) => q.chunk !== chunk || q.type === 'order');
    pack.quiz = [...rest, ...ai].sort((a, b) => a.chunk - b.chunk);
  }
  pack.cards = [...pack.cards.filter((c) => c.chunk !== chunk), ...s.cards.map((c) => ({ chunk, type: c.type, front: c.front, back: c.back }))].sort((a, b) => a.chunk - b.chunk);
  pack.stats = { ...pack.stats, cards: pack.cards.length, questions: pack.quiz.length };
  return pack;
}

// ─── Exam paper in the format of a past paper ───────────────

export function paperRequest(opts: {
  courseTitle: string;
  lessons: LessonContext[];
  pastPaper: string | null;
  keyStyle: string | null;
  level: 'easy' | 'medium' | 'hard';
  objectives: string[];
}): AiRequest {
  const budget = 26_000;
  const per = Math.max(1200, Math.floor(budget / Math.max(1, opts.lessons.length)));
  const notes = opts.lessons.map((l) => `## ${l.title}\n${l.text.slice(0, per)}`).join('\n\n');
  const format = opts.pastPaper
    ? `PAST PAPER (copy its format exactly: the same sections in the same order, the same number of questions in each section, the same marks per question, the same sub-parts (a), (b), (i)… with the same marks, the same kinds of command words in the same positions, the same instructions, duration and total marks):\n<<<\n${opts.pastPaper.slice(0, 9000)}\n>>>`
    : 'There is no past paper: use a standard university format (Section A short-answer questions, Section B structured/essay questions with "answer any" choice).';
  return {
    system: `${PERSONA}\n\nTASK:PAPER\nYou are a university exam setter. You write a brand-new mock exam that follows the format of the past paper exactly but tests the content of the student's notes. Never copy the past paper's questions; write new ones on the notes.
Difficulty: ${opts.level}.${opts.keyStyle ? `\nThe marking key for the past paper awards marks like this: ${opts.keyStyle}. Write the marking guide the same way.` : ''}
${opts.objectives.length ? `\nLearning objectives to test:\n${opts.objectives.slice(0, 30).map((o) => `- ${o}`).join('\n')}\n` : ''}
${format}

COURSE: ${opts.courseTitle}
THE STUDENT'S NOTES:
<<<
${notes}
>>>`,
    messages: [
      {
        role: 'user',
        content: `Write the mock paper. Reply with JSON only, in exactly this shape:
{"title": "course code and name as on the past paper, or the course title",
 "duration": "e.g. 3 hours",
 "instructions": ["general instructions, as on the past paper"],
 "sections": [{"name": "A", "title": "short section title", "instruction": "the section's rule, e.g. Answer ALL questions",
   "questions": [{"n": 1, "text": "the full question including any sub-parts (a) … (b) … with their marks in brackets", "marks": 4,
                  "options": ["only for multiple-choice: four options"], "answer": "the model answer in brief",
                  "guide": ["marking points, one per mark or as the key shows"]}]}],
 "totalMarks": 100}`,
      },
    ],
    json: true,
    maxTokens: 8000,
    temperature: 0.4,
  };
}

export function cleanPaper(raw: any): Paper {
  const sections = (Array.isArray(raw?.sections) ? raw.sections : [])
    .map((s: any, i: number) => ({
      name: str(s?.name, 6) || String.fromCharCode(65 + i),
      title: str(s?.title, 80),
      instruction: str(s?.instruction, 300) || 'Answer ALL questions in this section.',
      questions: (Array.isArray(s?.questions) ? s.questions : [])
        .map((q: any) => {
          const options = Array.isArray(q?.options) ? q.options.map((o: any) => str(o, 200)).filter(Boolean).slice(0, 5) : [];
          return {
            n: 0,
            text: str(q?.text, 2500),
            marks: Math.max(1, Math.min(100, Math.round(Number(q?.marks) || 1))),
            ...(options.length >= 3 ? { options } : {}),
            answer: str(q?.answer, 2500),
            guide: (Array.isArray(q?.guide) ? q.guide : []).map((g: any) => str(g, 400)).filter(Boolean).slice(0, 25),
          };
        })
        .filter((q: any) => q.text.length >= 5)
        .slice(0, 60),
    }))
    .filter((s: any) => s.questions.length);
  if (!sections.length) throw new AiError('The AI paper was incomplete. Try again.');
  let n = 1;
  for (const s of sections) for (const q of s.questions) q.n = n++;
  const sum = sections.reduce((t: number, s: any) => t + s.questions.reduce((m: number, q: any) => m + q.marks, 0), 0);
  const total = Math.round(Number(raw?.totalMarks));
  return {
    title: str(raw?.title, 160) || 'Mock examination',
    duration: str(raw?.duration, 40) || '3 hours',
    instructions: (Array.isArray(raw?.instructions) ? raw.instructions : []).map((x: any) => str(x, 300)).filter(Boolean).slice(0, 8),
    sections,
    totalMarks: total > 0 && total <= sum ? total : sum,
  };
}
