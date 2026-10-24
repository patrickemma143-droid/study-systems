import { BookOpen, Castle, Crosshair, ClipboardList, Columns2, FileText, Headphones, Layers, ListChecks, MessageSquareText, Network, PenLine, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import type { User } from './api';

export type MethodId = 'cram' | 'lessons' | 'cards' | 'quiz' | 'feynman' | 'blurt' | 'palace' | 'mnemonics' | 'mindmap' | 'cornell' | 'listen' | 'sheet' | 'paper' | 'coach';

export interface Method {
  id: MethodId;
  name: string;
  icon: LucideIcon;
  tint: string;
  blurb: string;
  bestFor: string;
  time: string;
  path: string;
}

export const METHODS: Method[] = [
  { id: 'cram', name: 'Cram plan', icon: Zap, tint: 'var(--hl-orange)', blurb: 'A timed plan for when the exam is close: cheat sheet, quick-fire cards, then a short quiz.', bestFor: 'Exam in the next day or two', time: '15–60 min', path: 'cram' },
  { id: 'lessons', name: 'Bite-size lessons', icon: BookOpen, tint: 'var(--hl-yellow)', blurb: 'Read one small chunk at a time, with the main points pulled out and jargon explained.', bestFor: 'Learning it for the first time', time: '3–5 min each', path: 'learn/0' },
  { id: 'cards', name: 'Flashcards', icon: Layers, tint: 'var(--hl-blue)', blurb: 'Spaced repetition: each card comes back just before you would forget it.', bestFor: 'Remembering it for weeks', time: '10 min a day', path: 'cards' },
  { id: 'quiz', name: 'Practice quiz', icon: ListChecks, tint: 'var(--hl-green)', blurb: 'Easy, medium or hard (twisted) questions. Harder levels earn more points.', bestFor: 'Exam practice', time: '5–15 min', path: 'quiz' },
  { id: 'coach', name: 'Exam coach', icon: Crosshair, tint: 'var(--hl-pink)', blurb: 'What is most likely to come up (from past papers) and where you are weak, with a 10-card drill to fix it.', bestFor: 'Knowing what to revise next', time: '10–20 min', path: 'coach' },
  { id: 'paper', name: 'Exam paper', icon: ClipboardList, tint: 'var(--hl-orange)', blurb: 'A full mock paper with sections, marks and a marking guide, to download. Upload a past paper and we copy its style.', bestFor: 'Sitting a practice exam', time: '1–3 hours', path: 'paper' },
  { id: 'feynman', name: 'Feynman technique', icon: MessageSquareText, tint: 'var(--hl-purple)', blurb: 'Explain a lesson in your own simple words. We show which ideas you covered and missed.', bestFor: 'Really understanding it', time: '5–10 min', path: 'feynman' },
  { id: 'blurt', name: 'Blurting', icon: PenLine, tint: 'var(--hl-pink)', blurb: 'Write down everything you remember before a timer runs out, then compare with your notes.', bestFor: 'Checking what stuck', time: '2–10 min', path: 'blurt' },
  { id: 'palace', name: 'Memory palace', icon: Castle, tint: 'var(--hl-purple)', blurb: 'Place key ideas along a route you know well, like your walk to campus, and walk it in your mind.', bestFor: 'Lists, sequences and facts', time: '10–15 min', path: 'palace' },
  { id: 'mnemonics', name: 'Mnemonics', icon: Sparkles, tint: 'var(--hl-pink)', blurb: 'Acronyms, silly sentences and stories made from every list in your notes.', bestFor: 'Lists to memorise', time: '5 min', path: 'mnemonics' },
  { id: 'mindmap', name: 'Mind map', icon: Network, tint: 'var(--hl-green)', blurb: 'See how every lesson and key term connects on one map.', bestFor: 'The big picture', time: '5 min', path: 'mindmap' },
  { id: 'cornell', name: 'Cornell notes', icon: Columns2, tint: 'var(--hl-blue)', blurb: 'Questions on the left, notes on the right, summary below. Cover one side to test yourself.', bestFor: 'Revision notes to print', time: '10 min', path: 'cornell' },
  { id: 'listen', name: 'Listen mode', icon: Headphones, tint: 'var(--hl-orange)', blurb: 'Your lessons and flashcards read aloud. For the taxi, the walk or tired eyes.', bestFor: 'Studying on the move', time: 'Any time', path: 'listen' },
  { id: 'sheet', name: 'Cheat sheet', icon: FileText, tint: 'var(--hl-yellow)', blurb: 'Everything examinable on one page: definitions, lists and key points.', bestFor: 'The final look before the exam', time: '5–10 min', path: 'sheet' },
];

export const methodById = (id: MethodId) => METHODS.find((m) => m.id === id)!;

/** Suggest three methods based on how close the exam is and what the student enjoys. */
export function recommend(daysLeft: number | null, pref: User['preference'], lessonsDone: number, lessonsTotal: number): { id: MethodId; why: string }[] {
  let picks: { id: MethodId; why: string }[];
  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 2) {
    picks = [
      { id: 'cram', why: daysLeft === 0 ? 'Exam today, start here' : 'Exam is close, start here' },
      { id: 'sheet', why: 'Everything on one page' },
      { id: 'quiz', why: 'Find your gaps fast' },
    ];
  } else if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) {
    picks = [
      { id: lessonsDone < lessonsTotal ? 'lessons' : 'feynman', why: lessonsDone < lessonsTotal ? 'Finish the lessons first' : 'Check you really understand' },
      { id: 'cards', why: 'Daily cards until the exam' },
      { id: 'coach', why: 'Fix what is likely to come up' },
    ];
  } else {
    picks = [
      { id: lessonsDone < lessonsTotal ? 'lessons' : 'quiz', why: lessonsDone < lessonsTotal ? 'Start with the lessons' : 'Test yourself' },
      { id: 'cards', why: 'A few minutes a day keeps it' },
      { id: 'feynman', why: 'Understand, don’t just memorise' },
    ];
  }
  const swap: Partial<Record<NonNullable<User['preference']>, { id: MethodId; why: string }>> = {
    listening: { id: 'listen', why: 'You like to listen' },
    seeing: { id: 'mindmap', why: 'You like to see it' },
    doing: { id: 'blurt', why: 'You like to be active' },
  };
  const extra = pref ? swap[pref] : undefined;
  if (extra && !picks.some((p) => p.id === extra.id)) picks[2] = extra;
  return picks;
}
