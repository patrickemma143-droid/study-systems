// ─── Input ────────────────────────────────────────────────────
export type BlockKind = 'heading' | 'para' | 'item';

/** A structural piece of the source document, produced by the file extractors. */
export interface SourceBlock {
  kind: BlockKind;
  text: string;
  /** heading level (1 = biggest) */
  level?: number;
  page?: number;
}

// ─── Output ───────────────────────────────────────────────────
export type BodyPart = { t: 'h' | 'p' | 'li'; x: string };

export interface Chunk {
  index: number;
  title: string;
  /** One-sentence gist */
  nutshell: string;
  /** The most important sentences, in reading order */
  keyPoints: string[];
  /** Key terms that appear in this chunk */
  keyTerms: string[];
  /** Cleaned reading text */
  body: BodyPart[];
  wordCount: number;
  readMinutes: number;
  /** 0..1 — how "examinable" this chunk looks relative to the rest */
  importance: number;
  /** Elaboration / "think deeper" questions */
  prompts: string[];
}

export interface Definition {
  term: string;
  definition: string;
  chunk: number;
  /** strength of the pattern that found it (higher = more reliable) */
  strength: number;
}

export interface TermList {
  /** e.g. "stages of mitosis" */
  category: string;
  items: { label: string; detail?: string }[];
  ordered: boolean;
  chunk: number;
  /** a ready-made question when the category alone would lose context */
  question?: string;
}

export interface KeyTerm {
  term: string;
  score: number;
  chunks: number[];
}

export type CardType = 'definition' | 'reverse' | 'cloze' | 'list';

export interface CardSeed {
  chunk: number;
  type: CardType;
  front: string;
  back: string;
  hint?: string;
}

export type QuizQuestion =
  | { id: string; chunk: number; type: 'mcq'; prompt: string; options: string[]; answer: number; explanation: string }
  | { id: string; chunk: number; type: 'tf'; prompt: string; answer: boolean; explanation: string }
  | { id: string; chunk: number; type: 'fill'; prompt: string; answer: string; accept: string[]; explanation: string }
  | { id: string; chunk: number; type: 'order'; prompt: string; items: string[]; explanation: string };

export interface Mnemonic {
  chunk: number;
  category: string;
  items: string[];
  ordered: boolean;
  /** Item order used for the acronym (may be rearranged for unordered lists) */
  order: number[];
  acronym: string;
  acrostics: string[];
  story: string;
}

export interface PalaceItem {
  chunk: number;
  cue: string;
  detail: string;
}

export interface Resource {
  name: string;
  url: string;
  kind: 'article' | 'video' | 'course' | 'book' | 'practice' | 'research';
  note: string;
}

export interface StudyPack {
  version: 1;
  title: string;
  overview: string[];
  chunks: Chunk[];
  glossary: Definition[];
  keyTerms: KeyTerm[];
  lists: TermList[];
  mnemonics: Mnemonic[];
  palace: PalaceItem[];
  quiz: QuizQuestion[];
  cards: CardSeed[];
  resources?: Resource[];
  simpleIntro?: string;
  stats: { words: number; chunks: number; cards: number; questions: number; readMinutes: number };
}
