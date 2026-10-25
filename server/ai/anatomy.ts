// AI prompts for Anatomy 3D. Grounded in the model's own description of the structure.
import { AiError, type AiRequest } from './providers';
import { PERSONA } from './prompts';

export interface AnatomyContext {
  name: string;
  system: string;
  latin: string | null;
  description: string | null;
}

function block(c: AnatomyContext) {
  return `STRUCTURE: ${c.name}${c.latin ? ` (Latin: ${c.latin})` : ''}
BODY SYSTEM: ${c.system || 'unknown'}
${c.description ? `REFERENCE TEXT (from the 3D atlas, based on Wikipedia):\n<<<\n${c.description.slice(0, 3500)}\n>>>` : 'There is no reference text for this structure.'}`;
}

const ANATOMIST = `${PERSONA}
You are also an experienced anatomy lecturer for medical, nursing, dental and allied-health students. Be anatomically precise and use standard terminology (Terminologia Anatomica), then explain it simply. If a fact is uncertain or varies between people, say so. Never invent details.`;

export function anatomyCardRequest(c: AnatomyContext): AiRequest {
  return {
    system: `${ANATOMIST}\n\nTASK:ANATOMY_CARD\n\n${block(c)}`,
    messages: [
      {
        role: 'user',
        content: `Make a study card for this structure. Reply with JSON only, in exactly this shape:
{"summary": "2-3 simple sentences: what it is, where it is, what it does",
 "facts": [{"label": "e.g. Location / Origin / Insertion / Action / Nerve supply / Blood supply / Venous drainage / Lymph drainage / Articulates with / Relations / Function", "value": "short exact answer"}],
 "clinical": ["1-3 clinical notes relevant to students in East Africa where possible (injuries, diseases, procedures)"],
 "mnemonic": "a memory aid if a well-known or useful one exists, otherwise empty",
 "examTips": ["2-3 things examiners commonly ask about it"],
 "quiz": [{"q": "a short question", "a": "the answer"}]}
Include only the fact labels that apply to this kind of structure (bones: articulations, parts, attachments; muscles: origin, insertion, action, nerve supply, blood supply; vessels: origin, course, branches, area supplied or drained; nerves: roots, course, branches, motor and sensory supply; organs: location, parts, function, blood supply). Give 4-8 facts and 3 quiz items.`,
      },
    ],
    json: true,
    maxTokens: 1300,
    temperature: 0.2,
  };
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export function cleanAnatomyCard(raw: any) {
  const facts = (Array.isArray(raw?.facts) ? raw.facts : []).map((f: any) => ({ label: str(f?.label, 60), value: str(f?.value, 500) })).filter((f: any) => f.label && f.value).slice(0, 10);
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => str(x, 400)).filter(Boolean).slice(0, n) : []);
  const quiz = (Array.isArray(raw?.quiz) ? raw.quiz : []).map((q: any) => ({ q: str(q?.q, 300), a: str(q?.a, 400) })).filter((q: any) => q.q && q.a).slice(0, 5);
  const out = { summary: str(raw?.summary, 900), facts, clinical: list(raw?.clinical, 4), mnemonic: str(raw?.mnemonic, 300), examTips: list(raw?.examTips, 4), quiz };
  if (!out.summary && !facts.length) throw new AiError('The AI answer was incomplete. Try again.');
  return out;
}

export function anatomyTutorRequest(c: AnatomyContext, messages: { role: 'user' | 'assistant'; content: string }[]): AiRequest {
  return {
    system: `${ANATOMIST}\n\nTASK:ANATOMY_TUTOR\nThe student is looking at this structure in a 3D atlas and asking about it. Answer in under 150 words unless asked for more, with simple steps, and end with a quick check question when it helps.\n\n${block(c)}`,
    messages,
    maxTokens: 500,
    temperature: 0.4,
  };
}

/** "Which muscles flex the elbow?" → an answer plus the structures to light up on the model. */
export function anatomyFindRequest(question: string, names: string[]): AiRequest {
  return {
    system: `${ANATOMIST}\n\nTASK:ANATOMY_FIND\nThe student asks a question about the body while looking at a 3D atlas. Answer it, and list the structures the atlas should highlight. Use ONLY names from this list, written exactly as in the list:\n${names.join('; ')}`,
    messages: [
      {
        role: 'user',
        content: `${question.slice(0, 500)}\n\nReply with JSON only: {"answer": "a clear answer in 2-5 sentences", "structures": ["exact names from the list, most important first, at most 12"]}`,
      },
    ],
    json: true,
    maxTokens: 700,
    temperature: 0.2,
  };
}

export function cleanAnatomyFind(valid: Set<string>) {
  return (raw: any) => {
    const lower = new Map([...valid].map((n) => [n.toLowerCase(), n]));
    const structures = (Array.isArray(raw?.structures) ? raw.structures : [])
      .map((n: unknown) => (typeof n === 'string' ? lower.get(n.trim().toLowerCase()) : undefined))
      .filter((n: string | undefined): n is string => !!n);
    const answer = str(raw?.answer, 1500);
    if (!answer) throw new AiError('The AI answer was incomplete. Try again.');
    return { answer, structures: [...new Set(structures)].slice(0, 12) };
  };
}
