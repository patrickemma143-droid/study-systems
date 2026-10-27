import type { StudyPack, QuizQuestion } from '@shared/engine/types';
import { canDefer, deferredReply, enqueue } from './lib/outbox';

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
    const method = opts.method || (opts.body !== undefined ? 'POST' : 'GET');
    // study work done offline is kept and sent later, so the student can carry on
    if (canDefer(path, method)) {
      enqueue(path, method, opts.body);
      return deferredReply(path, opts.body) as T;
    }
    throw new ApiError(0, 'You seem to be offline. Check your connection and try again.');
  }
  const raw = await res.text().catch(() => null);
  let data: any = {};
  if (raw === null) throw new ApiError(0, 'The reply was cut off. Please try again.');
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      if (res.ok) throw new ApiError(res.status, 'The server sent an unexpected reply. Please try again.');
    }
  }
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
  pack: { id: number; title: string; sourceType: string; sourceName: string | null; examDate: string | null; createdAt: number; libraryItemId?: number | null; sharedItemId?: number | null; data: StudyPack };
  progress: Record<number, { status: ChunkStatus; bestRecall: number | null }>;
  cards: { total: number; due: number; new: number; learning: number; growing: number; strong: number; byChunk: Record<number, { total: number; known: number }> };
  quiz: { score: number; total: number; at: number }[];
  readiness?: Readiness | null;
}

export interface Readiness {
  score: number;
  label: 'Not ready yet' | 'Getting there' | 'Nearly ready' | 'Ready';
  parts: { coverage: number; memory: number; practice: number; explain: number };
  weak: { index: number; title: string; why: string }[];
  message: string;
  daysLeft: number | null;
}

export interface Card {
  id: number;
  packId: number;
  packTitle?: string;
  examDate?: string | null;
  chunk: number;
  chunkTitle?: string | null;
  type: string;
  front: string;
  back: string;
  hint: string | null;
  ease: number;
  interval: number;
  reps: number;
  lapses: number;
  stability: number | null;
  difficulty: number | null;
  lastReviewedAt: number | null;
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
  exams: { packId: number; title: string; examDate: string; readiness?: { score: number; label: string; message: string } | null }[];
}

export interface Note<T = Record<string, unknown>> {
  id: number;
  chunk: number | null;
  kind: string;
  content: T;
  createdAt: number;
}

export type MixedQuestion = { packId: number; packTitle: string; q: QuizQuestion };
