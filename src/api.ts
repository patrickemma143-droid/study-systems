import type { StudyPack, QuizQuestion } from '@shared/engine/types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError(0, 'You seem to be offline. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('cs:unauthorized'));
    throw new ApiError(res.status, data.error || `Request failed (${res.status}).`);
  }
  return data as T;
}

// ─── Shared response types ───
export interface User {
  id: number;
  name: string;
  email: string;
  university: string | null;
  course: string | null;
  dailyGoal: number;
  preference: 'reading' | 'listening' | 'seeing' | 'doing' | null;
  createdAt: number;
  plan?: 'free' | 'pro';
  isAdmin?: boolean;
}

export interface PackSummary {
  id: number;
  title: string;
  sourceType: string;
  examDate: string | null;
  createdAt: number;
  lastOpenedAt: number;
  stats: StudyPack['stats'];
  due: number;
  chunksDone: number;
  mastery: number;
}

export type ChunkStatus = 'new' | 'read' | 'understood' | 'mastered';

export interface PackDetail {
  pack: { id: number; title: string; sourceType: string; sourceName: string | null; examDate: string | null; createdAt: number; data: StudyPack };
  progress: Record<number, { status: ChunkStatus; bestRecall: number | null }>;
  cards: { total: number; due: number; new: number; learning: number; growing: number; strong: number; byChunk: Record<number, { total: number; known: number }> };
  quiz: { score: number; total: number; at: number }[];
}

export interface Card {
  id: number;
  packId: number;
  packTitle?: string;
  examDate?: string | null;
  chunk: number;
  type: string;
  front: string;
  back: string;
  hint: string | null;
  ease: number;
  interval: number;
  reps: number;
  lapses: number;
  dueAt: number;
  suspended: boolean;
}

export interface Stats {
  streak: number;
  today: { minutes: number; reviews: number; goal: number };
  week: { day: string; minutes: number; reviews: number }[];
  dueCards: number;
  totalCards: number;
  strongCards: number;
  exams: { packId: number; title: string; examDate: string }[];
}

export interface Note<T = Record<string, unknown>> {
  id: number;
  chunk: number | null;
  kind: string;
  content: T;
  createdAt: number;
}

export type MixedQuestion = { packId: number; packTitle: string; q: QuizQuestion };
