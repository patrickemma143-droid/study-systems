// Prompts for the AI features. Each one is grounded in the student's own notes.
import type { StudyPack } from '../../shared/engine/types';
import type { AiRequest } from './providers';

const PERSONA = `You are the study tutor inside Charis Study, an app for university students in Uganda and East Africa.
Write in clear, simple English that a first-year student can follow (short sentences, everyday words, explain any technical term the first time).
Stay faithful to the student's notes. If the notes are unclear or seem wrong, say so politely instead of inventing facts.
When you give examples, prefer everyday life in Uganda / East Africa (markets, boda bodas, matooke, taxis, campus life) when it fits naturally.`;

export interface LessonContext {
  packTitle: string;
  title: string;
  text: string;
  terms: { term: string; definition?: string }[];
}

export function lessonContext(pack: { title: string; data: StudyPack }, index: number): LessonContext | null {
  const c = pack.data.chunks[index];
  if (!c) return null;
  const text = c.body
    .map((p) => (p.t === 'h' ? `\n## ${p.x}` : p.t === 'li' ? `- ${p.x}` : p.x))
    .join('\n')
    .slice(0, 12_000);
  const terms = c.keyTerms.map((t) => ({ term: t, definition: pack.data.glossary.find((g) => g.term.toLowerCase() === t.toLowerCase())?.definition }));
  return { packTitle: pack.title, title: c.title, text, terms };
}

function contextBlock(ctx: LessonContext): string {
  const terms = ctx.terms.length ? `\nKey terms: ${ctx.terms.map((t) => (t.definition ? `${t.term} (${t.definition})` : t.term)).join('; ')}` : '';
  return `Course/pack: ${ctx.packTitle}\nLesson title: ${ctx.title}${terms}\n\nThe student's notes for this lesson:\n<<<\n${ctx.text}\n>>>`;
}

export function simplifyRequest(ctx: LessonContext): AiRequest {
  return {
    system: `${PERSONA}\n\nTASK:SIMPLIFY\n\n${contextBlock(ctx)}`,
    messages: [
      {
        role: 'user',
        content: `Re-teach this lesson so it is easy to understand and remember. Reply with JSON only, in exactly this shape:
{"simple": "the lesson explained simply in 120-200 words; separate paragraphs with \\n\\n",
 "example": "one real-life example or analogy in 1-3 sentences",
 "keyPoints": ["3 to 5 short points to remember"],
 "questions": [{"q": "an exam-style short-answer question", "a": "a model answer in 1-3 sentences"}, {"q": "...", "a": "..."}, {"q": "...", "a": "..."}]}`,
      },
    ],
    json: true,
    maxTokens: 1200,
    temperature: 0.4,
  };
}

export function tutorRequest(ctx: LessonContext, messages: { role: 'user' | 'assistant'; content: string }[]): AiRequest {
  return {
    system: `${PERSONA}\n\nTASK:TUTOR\nYou are chatting with a student about one lesson. Answer their question using the notes below.
If the answer is not in the notes, say "Your notes don't cover this, but…" and give a short, careful general answer.
Keep replies under 150 words unless they ask for more. Use small steps and one quick check-question at the end when it helps.
Never write long essays for the student to copy; help them understand.\n\n${contextBlock(ctx)}`,
    messages,
    maxTokens: 450,
    temperature: 0.5,
  };
}

export function feedbackRequest(ctxs: LessonContext[], keyPoints: string[], answer: string, mode: 'feynman' | 'blurt'): AiRequest {
  const what = mode === 'feynman' ? 'explanation of the lesson in their own words (Feynman technique)' : 'everything they could remember without looking (blurting)';
  return {
    system: `${PERSONA}\n\nTASK:FEEDBACK\nYou mark a student's ${what}. Be encouraging but honest. Judge understanding, not wording or spelling.\n\n${ctxs
      .map(contextBlock)
      .join('\n\n')}\n\nKey points the student should cover:\n${keyPoints.map((p) => `- ${p}`).join('\n')}`,
    messages: [
      {
        role: 'user',
        content: `Here is what the student wrote:\n<<<\n${answer.slice(0, 6000)}\n>>>\n\nReply with JSON only, in exactly this shape:
{"score": 0-100 (how well they understand the key points),
 "summary": "one or two sentences of overall feedback, speaking to the student as 'you'",
 "correct": ["things they got right"],
 "missing": ["important ideas they left out, each as a short helpful sentence"],
 "misconceptions": ["anything they got wrong, with the correct idea"],
 "tip": "one practical tip for their next attempt"}`,
      },
    ],
    json: true,
    maxTokens: 700,
    temperature: 0.2,
  };
}
