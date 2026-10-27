// Prompts for the whiteboard tutor: a lesson taught step by step on a board, follow-up answers when
// the student interrupts, and snapped homework problems worked through together.
import type { AiRequest } from './providers';
import { PERSONA } from './prompts';
import type { TutorMode } from '../../shared/tutor';

const BOARD_FORMAT = `Reply with JSON only, in exactly this shape:
{"title": "short lesson title",
 "steps": [
   {"say": "what you say out loud for this step: 1-3 short, warm, conversational sentences in plain spoken English (no symbols, no LaTeX, say 'x squared' not 'x^2')",
    "board": [ ...what you write or draw on the whiteboard during this step... ],
    "check": {"q": "optional: a quick question to check understanding", "options": ["A","B","C"], "answer": 0, "explain": "one or two sentences: why"}}
 ],
 "summary": ["3-5 key takeaways, short"],
 "practice": [{"q": "question", "options": ["A","B","C","D"], "answer": 0, "explain": "why, in one or two sentences"}]}

THE BOARD is a big canvas, like a wide sheet of paper. Every "heading" starts a new section in a new column next to the last one, so earlier sections stay visible. Draw, don't just write: a good lesson has at least two drawings (sketch, pie, bars, graph, flow, cycle or table).
Board items (keep each one short — it is a whiteboard, not a page of notes):
- {"t":"heading","text":"..."}                      starts a new section (highlighted title)
- {"t":"write","id":"w1","text":"...","tone":"normal|key|muted"}   one handwritten line; "key" = important (red); inline maths between $...$ e.g. "Speed $v = \\frac{d}{t}$"
- {"t":"math","id":"m1","tex":"LaTeX"}               a displayed equation or chemical equation (e.g. "6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2")
- {"t":"bullets","items":["...","..."]}             up to 5 short points
- {"t":"box","label":"Definition","text":"..."}     a boxed definition, rule or final answer
- {"t":"flow","items":["A","B","C"]}                 a process/sequence with arrows
- {"t":"cycle","items":["A","B","C","D"]}            a cycle drawn round in a circle
- {"t":"table","head":["",""],"rows":[["",""]]}      a small comparison table (max 4 columns, 6 rows)
- {"t":"graph","fn":"x^2-4","xmin":-4,"xmax":4,"label":"y = x² − 4"}   plot y = f(x); use x, numbers, + - * / ^, sin cos tan sqrt log ln exp abs, pi, e
- {"t":"pie","items":[{"label":"TV","value":50},{"label":"Online","value":35}],"caption":"..."}   a pie chart (values are shares)
- {"t":"bars","items":[{"label":"2019","value":12},{"label":"2020","value":18}],"unit":"%","caption":"..."}   a bar chart
- {"t":"sketch","id":"s1","h":60,"caption":"Forces on a block","shapes":[...]}   YOUR OWN hand-drawn diagram in a box 100 wide and h high (y grows downwards). Shapes:
    {"k":"line","p":[x1,y1,x2,y2],"c":"blue","dash":false}   {"k":"arrow","p":[x1,y1,x2,y2],"c":"red","label":"F"}   {"k":"double","p":[x1,y1,x2,y2]} (two-headed, for sizes)
    {"k":"rect","p":[x,y,w,h],"c":"blue","fill":true,"label":"block"}   {"k":"circle","p":[cx,cy,r],"c":"green","label":"nucleus"}
    {"k":"poly","p":[x1,y1,x2,y2,x3,y3],"closed":true,"c":"orange"} (e.g. an inclined plane)   {"k":"curve","p":[x1,y1,x2,y2,x3,y3,...]} (a smooth curve through the points)
    {"k":"ground","p":[x1,y,x2]} (a surface with hatching)   {"k":"text","p":[x,y],"text":"mg","c":"ink","size":5}
    colours: ink, blue, red, green, orange, purple. Use sketches for force diagrams, circuits, apparatus, cells and organs, maps, timelines, geometry, molecules, supply-and-demand curves, etc.
- {"t":"circle","target":"w1"}                      circle something already on the board (by its id)
- {"t":"underline","target":"m1"}                   underline something already on the board
- {"t":"arrow","from":"w1","to":"m1","label":"..."}   an arrow between two board items
Give an "id" to anything you will later circle, underline or point to. Use 0-6 board items per step.
CHECKS: add a "check" to 2 or 3 steps (after explaining something important), so the student answers before you go on. 3 options, short. Do not put a check on the first step.`;

const TEACHER = `${PERSONA}
You are a brilliant one-to-one tutor teaching at a whiteboard, like the best lecturer a student ever had. You TEACH: you build understanding step by step, check it, and use simple language, local examples (Uganda / East Africa when natural), analogies and worked examples. Never just dump notes. Say less, show more on the board. Be accurate; if the material is unclear or wrong, teach the correct idea and mention it gently.`;

const modeGuide: Record<TutorMode, string> = {
  topic: 'Teach this topic from the start to a university student: hook, core ideas one at a time, a worked example, common mistakes, then a quick recap. 8-12 steps.',
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
export function askRequest(lessonTitle: string, sofar: string, board: string, question: string, audio?: { mime: string; data: string }): AiRequest {
  return {
    system: `${TEACHER}\n\nTASK:TEACH_ASK\nYou are in the middle of teaching "${lessonTitle}". The student just interrupted with a question${audio ? ' (spoken, in the audio clip — they may have an East African accent; if you cannot make it out, ask them kindly to repeat or type it)' : ''}. Answer it on the board in 1-4 short steps (start with {"t":"clear"} so the answer gets its own fresh space), check they understood, then say you'll carry on with the lesson.\nReply with JSON only: {"heard": "the student's question in words", "steps": [ ... ]} using the same step and board item format:\n${BOARD_FORMAT.split('\n').slice(1).join('\n')}\n\nWHAT YOU HAVE SAID SO FAR:\n<<<\n${sofar.slice(-5000)}\n>>>\nON THE BOARD NOW:\n<<<\n${board.slice(0, 2000)}\n>>>`,
    messages: [{ role: 'user', content: question.slice(0, 800) || 'My question is in the audio.' }],
    images: audio ? [audio] : undefined,
    json: true,
    maxTokens: 2500,
    temperature: 0.4,
  };
}
