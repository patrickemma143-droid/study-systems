// AI providers behind one small interface. Only the one chosen in the environment is used.
import { Mp3Encoder } from '@breezystack/lamejs';
import { ai, voice } from '../config';

export interface AiRequest {
  /** Instructions plus long, reusable context (lesson notes) — cached by Claude, implicitly by Gemini. */
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  json?: boolean;
  /** pictures sent with the last user message (a snapped homework problem) */
  images?: { mime: string; data: string }[];
  maxTokens: number;
  temperature?: number;
}

export interface AiResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  cachedIn: number;
}

export class AiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

// USD per 1M tokens: [input, output, cached input]. Gemini Flash prices are the 2026 rates.
const PRICES: Record<string, [number, number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
  'claude-sonnet-5-5': [2, 10, 0.1],
  'gemini-3.5-flash-lite': [0.3, 2.5, 0.03],
  'gemini-3.1-flash-lite': [0.25, 1.5, 0.025],
  'gemini-3.6-flash': [0.75, 3.75, 0.075],
  'gemini-3.8-flash': [0.75, 3.75, 0.075],
  'mock-model': [0.1, 0.5, 0.01],
};

/** Estimated cost in millionths of a dollar (so it fits in an integer column). */
export function costMicroUsd(model: string, tokensIn: number, tokensOut: number, cachedIn = 0): number {
  const [pi, po, pc] = PRICES[model] || [ai.priceInput ?? 0.3, ai.priceOutput ?? 2.5, (ai.priceInput ?? 0.3) / 10];
  const inPrice = ai.priceInput ?? pi;
  const outPrice = ai.priceOutput ?? po;
  const fresh = Math.max(0, tokensIn - cachedIn);
  return Math.round(fresh * inPrice + cachedIn * pc + tokensOut * outPrice);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const msg = data?.error?.message || data?.error?.type || `HTTP ${res.status}`;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new AiError(res.status === 429 ? 'The AI service is busy right now. Try again in a minute.' : `AI service error: ${msg}`, 503);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw new AiError(`AI request was rejected: ${msg}`, 502);
    } catch (err) {
      if (err instanceof AiError && err.status !== 503) throw err;
      lastErr = err instanceof AiError ? err : new AiError('Couldn’t reach the AI service. Try again in a minute.', 503);
    }
  }
  throw lastErr;
}

async function gemini(req: AiRequest): Promise<AiResult> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: req.maxTokens,
    temperature: req.temperature ?? 0.4,
  };
  if (req.json) generationConfig.responseMimeType = 'application/json';
  if (ai.geminiThinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: ai.geminiThinkingLevel };
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent`,
    { 'x-goog-api-key': ai.key },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m, i) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [...(i === req.messages.length - 1 && req.images ? req.images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })) : []), { text: m.content }],
      })),
      generationConfig,
    },
  );
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => (p.thought ? '' : p.text || '')).join('').trim();
  if (!text) throw new AiError(cand?.finishReason === 'SAFETY' ? 'The AI declined to answer this one. Try rephrasing.' : 'The AI returned an empty answer. Try again.');
  const u = data?.usageMetadata || {};
  return {
    text,
    tokensIn: Number(u.promptTokenCount || 0),
    tokensOut: Number(u.candidatesTokenCount || 0) + Number(u.thoughtsTokenCount || 0),
    cachedIn: Number(u.cachedContentTokenCount || 0),
  };
}

async function claude(req: AiRequest): Promise<AiResult> {
  const data = await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': ai.key, 'anthropic-version': '2023-06-01' },
    {
      model: ai.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0.4,
      // The lesson notes sit in the system prompt, so follow-up questions read them from the cache.
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages.map((m, i) =>
        i === req.messages.length - 1 && req.images?.length
          ? { role: m.role, content: [...req.images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.data } })), { type: 'text', text: m.content }] }
          : m,
      ),
    },
  );
  const text = (data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  if (!text) throw new AiError('The AI returned an empty answer. Try again.');
  const u = data?.usage || {};
  const cachedIn = Number(u.cache_read_input_tokens || 0);
  return {
    text,
    tokensIn: Number(u.input_tokens || 0) + Number(u.cache_creation_input_tokens || 0) + cachedIn,
    tokensOut: Number(u.output_tokens || 0),
    cachedIn,
  };
}

/** Deterministic stand-in for development and tests (AI_PROVIDER=mock). Never use in production. */
async function mock(req: AiRequest): Promise<AiResult> {
  const last = req.messages[req.messages.length - 1]?.content || '';
  const title = (req.system.match(/Lesson title: (.+)/) || [])[1] || 'this lesson';
  let text: string;
  if (req.system.includes('TASK:SIMPLIFY')) {
    text = JSON.stringify({
      simple: `In simple words, “${title}” is about how the main ideas fit together.\n\nThink of it as a short story: first the basic idea, then why it matters, then how it is used.`,
      example: 'Like a boda boda stage that organises riders, this idea organises the parts so everything works smoothly.',
      keyPoints: ['The first main idea in plain words.', 'Why it matters.', 'How it connects to the rest of the topic.'],
      questions: [
        { q: `Explain the main idea of ${title} in your own words.`, a: 'A clear answer names the key term and what it does.' },
        { q: 'Give one real-life example.', a: 'Any everyday example that shows the idea in action.' },
        { q: 'Why is this important for the exam?', a: 'Because it links the definitions to how they are applied.' },
      ],
    });
  } else if (req.system.includes('TASK:SMART_LESSON')) {
    text = JSON.stringify({
      title: `${title} (smart)`,
      topic: 'Core ideas',
      objectives: [`Define the key terms in ${title}.`, `Explain the main idea of ${title}.`, 'Apply it to a real example.'],
      cards: [
        { type: 'definition', front: `What is meant by ${title}?`, back: 'A short, exact definition from the notes.' },
        { type: 'list', front: 'Name the 3 main parts covered in this lesson.', back: '• First part — what it does\n• Second part — what it does\n• Third part — what it does' },
        { type: 'concept', front: `Why does ${title} matter?`, back: 'Because it links the definitions to how they are used. (Smart card)' },
        { type: 'cloze', front: 'The main process in this lesson needs _____ to work.', back: 'energy' },
      ],
      quiz: [
        { q: `Which statement best describes ${title}?`, options: ['The correct description (smart)', 'A near miss', 'A common mistake', 'Something from another lesson'], answer: 0, explanation: 'It matches the notes.' },
        { q: 'Which of these is NOT part of the lesson?', options: ['Part one', 'Part two', 'Part three', 'Something unrelated'], answer: 3, explanation: 'The last option is not in the notes.' },
      ],
    });
  } else if (req.system.includes('TASK:TEACH_ASK')) {
    text = JSON.stringify({
      steps: [
        { say: 'Great question. Let me show you on a fresh part of the board.', board: [{ t: 'clear' }, { t: 'heading', text: 'Your question' }, { t: 'write', id: 'q1', text: last.slice(0, 120), tone: 'muted' }] },
        { say: 'Here is the idea in one line. Does that make sense? Let us carry on.', board: [{ t: 'box', label: 'In short', text: 'The answer, simply (AI test answer).' }, { t: 'underline', target: 'q1' }] },
      ],
    });
  } else if (req.system.includes('TASK:TEACH_LESSON') || req.system.includes('TASK:HOMEWORK')) {
    const lessonTitle = (req.system.match(/LESSON: (.+)/) || [])[1] || (req.system.includes('TASK:HOMEWORK') ? 'Solving a quadratic equation' : 'Test lesson');
    text = JSON.stringify({
      title: lessonTitle,
      steps: [
        { say: `Welcome! Today we are learning ${lessonTitle}. Let us start with the big idea.`, board: [{ t: 'heading', text: lessonTitle }, { t: 'write', id: 'w1', text: 'The big idea, in one line', tone: 'key' }] },
        { say: 'Here is the key equation. Notice the two parts on each side.', board: [{ t: 'math', id: 'm1', tex: 'x^2 + 5x + 6 = 0' }, { t: 'write', id: 'w2', text: 'Factorise: $(x+2)(x+3) = 0$' }, { t: 'circle', target: 'm1' }] },
        { say: 'Now let us see the process as a flow, and how the steps connect.', board: [{ t: 'flow', items: ['Read the question', 'Choose a method', 'Solve', 'Check'] }, { t: 'arrow', from: 'w1', to: 'w2', label: 'leads to' }] },
        { say: 'Some things repeat as a cycle, and a table helps us compare.', board: [{ t: 'clear' }, { t: 'cycle', items: ['Plan', 'Do', 'Check', 'Improve'] }, { t: 'table', head: ['Method', 'When to use'], rows: [['Factorise', 'Small whole numbers'], ['Formula', 'Always works']] }] },
        { say: 'A graph shows where the curve crosses zero. Those are our answers.', board: [{ t: 'graph', fn: 'x^2+5x+6', xmin: -5, xmax: 1, label: 'y = x² + 5x + 6' }, { t: 'bullets', items: ['Crosses at x = −2', 'and at x = −3'] }] },
        { say: 'So the answer is x equals minus two or minus three. Well done!', board: [{ t: 'box', label: 'Answer', text: '$x = -2$ or $x = -3$' }, { t: 'underline', target: 'w2' }] },
      ],
      summary: ['Factorise to find the roots.', 'Check by putting the answers back in.', 'The graph crosses the x-axis at the roots.'],
      practice: [
        { q: 'What are the roots of x² + 5x + 6 = 0?', options: ['−2 and −3', '2 and 3', '−6 and 1', '5 and 6'], answer: 0, explain: '(x+2)(x+3)=0 gives x = −2 or −3.' },
        { q: 'Which method always works for a quadratic?', options: ['Guessing', 'The quadratic formula', 'Drawing only', 'None'], answer: 1, explain: 'The formula works for every quadratic.' },
        { q: 'Where does the graph cross the x-axis?', options: ['At the roots', 'At the top', 'Nowhere', 'At y = 6'], answer: 0, explain: 'y = 0 at the roots.' },
      ],
      tryNext: req.system.includes('TASK:HOMEWORK') ? { q: 'Solve x² + 7x + 12 = 0', answer: '(x+3)(x+4)=0, so x = −3 or x = −4' } : undefined,
    });
  } else if (req.system.includes('TASK:ANATOMY_FIND')) {
    text = JSON.stringify({ answer: 'The biceps brachii and brachialis flex the elbow (AI test answer).', structures: ['Biceps brachii muscle', 'Brachialis muscle', 'Femur', 'Not a real structure'] });
  } else if (req.system.includes('TASK:ANATOMY_CARD')) {
    const nm = (req.system.match(/STRUCTURE: ([^\n(]+)/) || [])[1]?.trim() || 'this structure';
    text = JSON.stringify({
      summary: `${nm} is shown here in 3D (AI test card).`,
      facts: [{ label: 'Location', value: 'Test location' }, { label: 'Function', value: 'Test function' }],
      clinical: ['A test clinical note.'],
      mnemonic: '',
      examTips: ['Know where it is.'],
      quiz: [{ q: `Where is the ${nm}?`, a: 'Test answer' }],
    });
  } else if (req.system.includes('TASK:MARK_ANSWER')) {
    const words = last.split(/\s+/).length;
    const outOf = Number((req.system.match(/QUESTION \((\d+) marks\)/) || [])[1] || 10);
    text = JSON.stringify({
      awarded: Math.min(outOf, Math.round((words / 20) * 2) / 2),
      outOf,
      points: [
        { point: 'States the key definition', got: words > 8, comment: 'Clear.' },
        { point: 'Gives an example', got: /example|e\.g\./i.test(last), comment: 'Add a real example.' },
      ],
      comment: 'You have the main idea (AI marking test).',
      improve: 'Add one example for each point.',
      model: 'A model answer would define the term, explain it and give an example.',
    });
  } else if (req.system.includes('TASK:PAPER')) {
    text = JSON.stringify({
      title: 'MOCK PAPER (AI)',
      duration: '3 hours',
      instructions: ['Answer ALL questions in Section A and any TWO in Section B.'],
      sections: [
        { name: 'A', title: 'Short answers', instruction: 'Answer ALL questions.', questions: [
          { n: 1, text: 'Define the term osmosis. (2 marks)', marks: 2, answer: 'Movement of water across a membrane.', guide: ['Water moves', 'across a partially permeable membrane'] },
          { n: 2, text: 'State three functions of the cell membrane.', marks: 3, answer: 'Controls entry; protects; communicates.', guide: ['Controls what enters', 'Protects', 'Cell signalling'] },
        ] },
        { name: 'B', title: 'Essays', instruction: 'Answer any TWO questions.', questions: [
          { n: 3, text: '(a) Describe mitosis. (10 marks) (b) Explain why it matters. (10 marks)', marks: 20, answer: 'Stages and importance.', guide: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'] },
          { n: 4, text: 'Discuss active transport. (20 marks)', marks: 20, answer: 'Uses energy.', guide: ['Needs ATP', 'Against gradient'] },
          { n: 5, text: 'Examine the role of mitochondria. (20 marks)', marks: 20, answer: 'Energy.', guide: ['ATP'] },
        ] },
      ],
      totalMarks: 45,
    });
  } else if (req.system.includes('TASK:FEEDBACK')) {
    const words = last.split(/\s+/).length;
    text = JSON.stringify({
      score: Math.min(95, 30 + words),
      summary: 'You explained the core idea clearly, but some details were missing.',
      correct: ['You named the main process correctly.'],
      missing: ['Say what the process needs (for example, energy) and where it happens.'],
      misconceptions: words < 15 ? ['Your answer is too short to show full understanding.'] : [],
      tip: 'Add one everyday example to make the idea stick.',
    });
  } else {
    text = `Good question! Based on your notes for “${title}”: ${last.slice(0, 80)}… In simple terms, focus on the key definition first, then the example. (Test reply)`;
  }
  const tokensIn = Math.ceil((req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0)) / 4);
  return { text, tokensIn, tokensOut: Math.ceil(text.length / 4), cachedIn: 0 };
}

export async function complete(req: AiRequest): Promise<AiResult> {
  if (!ai.enabled) throw new AiError('AI features are not switched on for this site.', 503);
  if (ai.provider === 'gemini') return gemini(req);
  if (ai.provider === 'claude') return claude(req);
  return mock(req);
}

/** Pull a JSON object out of a model reply, even if it is wrapped in ``` fences or extra words. */
export function parseJsonReply<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new AiError('The AI answer was not in the expected format. Try again.');
  }
}

// ─── Natural voice (Gemini text-to-speech) ───────────────────

/** Raw 16-bit mono PCM → a small MP3 (about 5 KB a second), kind to students' data bundles. */
export function pcmToMp3(pcm: Int16Array, rate: number): Buffer {
  const enc = new Mp3Encoder(1, rate, 40);
  const out: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) out.push(b);
  }
  const end = enc.flush();
  if (end.length) out.push(end);
  return Buffer.concat(out.map((b) => Buffer.from(b.buffer, b.byteOffset, b.length)));
}

export interface Speech {
  mp3: Buffer;
  durationMs: number;
  tokensOut: number;
}

/** Speak one tutor step. The style lines steer the voice; only the transcript is read out. */
export async function speak(text: string): Promise<Speech> {
  if (!voice.enabled) throw new AiError('The natural voice is not switched on.', 503);
  if (ai.provider === 'mock') {
    // a quiet tone as long as the words would take to say, so the whole path can be tested
    const rate = 24000;
    const n = Math.min(rate * 8, Math.max(rate / 2, Math.round((text.length / 15) * rate)));
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 600);
    return { mp3: pcmToMp3(pcm, rate), durationMs: Math.round((n / rate) * 1000), tokensOut: Math.ceil(text.length / 4) };
  }
  const prompt = `[Audio Profile: A warm, patient university tutor who loves helping students understand.]
[Scene: A one-to-one lesson at a whiteboard.]
[Director's Notes: Clear, friendly and encouraging. Unhurried pace, natural pauses, gentle emphasis on key words.]
${text}`;
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(voice.model)}:generateContent`,
    { 'x-goog-api-key': voice.key },
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voiceName } } } },
    },
  );
  const part = (data?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
  if (!part) throw new AiError('The voice service returned no audio.', 503);
  const rate = Number(String(part.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1]) || 24000;
  const raw = Buffer.from(part.inlineData.data, 'base64');
  // copy into its own buffer: a typed array view needs 2-byte alignment
  const pcm = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length - (raw.length % 2)));
  return { mp3: pcmToMp3(pcm, rate), durationMs: Math.round((pcm.length / rate) * 1000), tokensOut: Number(data?.usageMetadata?.candidatesTokenCount || 0) };
}
