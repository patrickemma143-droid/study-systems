// Prompts for the whiteboard tutor: a lesson taught step by step on a board, follow-up answers when
// the student interrupts, and snapped homework problems worked through together.
import type { AiRequest } from './providers';
import { PERSONA } from './prompts';
import type { TutorMode } from '../../shared/tutor';

const BOARD_FORMAT = `Reply with JSON only, in exactly this shape:
{"title": "short lesson title",
 "steps": [
   {"say": "what you say out loud for this step: 1-3 short, warm, conversational sentences in plain spoken English (no symbols, no LaTeX, say 'x squared' not 'x^2')",
    "board": [ ...what you write or draw on the whiteboard during this step... ]}
 ],
 "summary": ["3-5 key takeaways, short"],
 "practice": [{"q": "question", "options": ["A","B","C","D"], "answer": 0, "explain": "why, in one or two sentences"}]}

Board items you can use (keep each one short — it is a whiteboard, not a page of notes):
- {"t":"heading","text":"..."}                      a title for a new part
- {"t":"write","id":"w1","text":"...","tone":"normal|key|muted"}   one handwritten line; "key" = important; inline maths between $...$ e.g. "Speed $v = \\\\frac{d}{t}$"
- {"t":"math","id":"m1","tex":"LaTeX"}               a displayed equation or chemical equation (e.g. "6CO_2 + 6H_2O \\\\rightarrow C_6H_{12}O_6 + 6O_2")
- {"t":"bullets","items":["...","..."]}             up to 5 short points
- {"t":"box","label":"Definition","text":"..."}     a boxed definition, rule or final answer
- {"t":"flow","items":["A","B","C"]}                 a process/sequence with arrows
- {"t":"cycle","items":["A","B","C","D"]}            a cycle drawn round in a circle
- {"t":"table","head":["",""],"rows":[["",""]]}      a small comparison table (max 4 columns, 6 rows)
- {"t":"graph","fn":"x^2-4","xmin":-4,"xmax":4,"label":"y = x² − 4"}   plot y = f(x); use x, numbers, + - * / ^, sin cos tan sqrt log ln exp abs, pi, e
- {"t":"circle","target":"w1"}                      circle something already on the board (by its id)
- {"t":"underline","target":"m1"}                   underline something already on the board
- {"t":"arrow","from":"w1","to":"m1","label":"..."}   an arrow between two board items
- {"t":"clear"}                                     wipe the board to start a fresh section
Give an "id" to anything you will later circle, underline or point to. Use 0-6 board items per step.`;

const TEACHER = `${PERSONA}
You are a brilliant one-to-one tutor teaching at a whiteboard, like the best lecturer a student ever had. You TEACH: you build understanding step by step, check it, and use simple language, local examples (Uganda / East Africa when natural), analogies and worked examples. Never just dump notes. Say less, show more on the board. Be accurate; if the material is unclear or wrong, teach the correct idea and mention it gently.`;

const modeGuide: Record<TutorMode, string> = {
  topic: 'Teach this topic from the start to a university student: hook, core ideas one at a time, a worked example, common mistakes, then a quick recap. 7-10 steps.',
  lesson: "Teach this part of the student's own notes. Follow the material: cover every important idea in it, in its order, explain the hard parts with examples, and connect the ideas. 6-10 steps.",
  text: "Teach the student's material below. Cover every important idea in it, explain the hard parts with examples. 6-10 steps.",
  exam: 'This is fast exam preparation. Recap the must-know points from the material, show how exam questions on them are usually asked and answered (with a model answer outline), warn about traps, and end with a rapid recap. 7-10 steps.',
  homework: 'Work through this problem WITH the student. First say what is being asked and what we know, choose a method and say why, then do each step on the board (one idea per step), box the final answer, and check it. Teach the method so they can do the next one alone. 5-9 steps.',
};

export function lessonRequest(mode: TutorMode, title: string, material: string): AiRequest {
  return {
    system: `${TEACHER}\n\nTASK:TEACH_LESSON\n${modeGuide[mode]}\nThen write 3-5 multiple-choice practice questions that test understanding (not word-matching).\n\n${BOARD_FORMAT}\n\nLESSON: ${title}\n${material ? `MATERIAL:\n<<<\n${material.slice(0, 14000)}\n>>>` : 'There is no material: teach it from your own knowledge, at university level.'}`,
    messages: [{ role: 'user', content: `Teach me: ${title}` }],
    json: true,
    maxTokens: 6000,
    temperature: 0.4,
  };
}

/** A snapped (or typed) homework / past-paper problem, solved together. */
export function problemRequest(text: string, image?: { mime: string; data: string }): AiRequest {
  return {
    system: `${TEACHER}\n\nTASK:HOMEWORK\n${modeGuide.homework}\nIf the photo is unreadable or is not a study problem, return {"title":"Unclear problem","steps":[{"say":"I couldn't read that clearly. Please take a sharper photo or type the question.","board":[]},{"say":"Make sure the whole question is in the picture.","board":[]}],"summary":[],"practice":[]}.\nAlso add "tryNext": {"q": "a similar problem for the student to try alone", "answer": "its worked answer"}.\n\n${BOARD_FORMAT}`,
    messages: [{ role: 'user', content: `${image ? 'The problem is in the photo.' : ''}${text ? `\n${text.slice(0, 3000)}` : ''}`.trim() || 'Solve the problem in the photo.' }],
    images: image ? [image] : undefined,
    json: true,
    maxTokens: 6000,
    temperature: 0.2,
  };
}

/** The student stopped the lesson to ask something: answer on the board, then hand back. */
export function askRequest(lessonTitle: string, sofar: string, board: string, question: string): AiRequest {
  return {
    system: `${TEACHER}\n\nTASK:TEACH_ASK\nYou are in the middle of teaching "${lessonTitle}". The student just interrupted with a question. Answer it on the board in 1-4 short steps (start with {"t":"clear"} if the board needs space), check they understood, then say you'll carry on with the lesson.\nReply with JSON only: {"steps": [ ... ]} using the same step and board item format:\n${BOARD_FORMAT.split('\n').slice(1).join('\n')}\n\nWHAT YOU HAVE SAID SO FAR:\n<<<\n${sofar.slice(-5000)}\n>>>\nON THE BOARD NOW:\n<<<\n${board.slice(0, 2000)}\n>>>`,
    messages: [{ role: 'user', content: question.slice(0, 800) }],
    json: true,
    maxTokens: 2500,
    temperature: 0.4,
  };
}
