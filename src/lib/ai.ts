import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api';

export type AiKind = 'simplify' | 'tutor' | 'feedback' | 'build' | 'paper' | 'teach' | 'homework' | 'voice';

export interface AiStatus {
  enabled: boolean;
  provider: string | null;
  /** the tutor's natural (AI) voice is available */
  voice?: boolean;
  plan: 'free' | 'pro';
  admin: boolean;
  limits: Record<AiKind, number>;
  used: Record<AiKind, number>;
}

export interface Simplified {
  simple: string;
  example: string;
  keyPoints: string[];
  questions: { q: string; a: string }[];
  cached?: boolean;
}

export interface AiFeedbackResult {
  score: number;
  summary: string;
  correct: string[];
  missing: string[];
  misconceptions: string[];
  tip: string;
  cached?: boolean;
}

// One shared copy of the AI status for the whole app, refreshed after every AI call.
let current: AiStatus | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(s: AiStatus | null) {
  current = s;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function refreshAiStatus(): Promise<void> {
  loading = api<AiStatus>('/ai/status')
    .then(publish)
    .catch(() => publish(null));
  return loading;
}

/** Forget the cached status when someone logs in or out, so nobody sees another account's allowance. */
export function resetAiStatus(loggedIn: boolean) {
  loading = null;
  publish(null);
  if (loggedIn) refreshAiStatus();
}

export function updateAiUsage(usage: Partial<AiStatus> | undefined) {
  if (usage && current) publish({ ...current, ...usage });
}

export function useAiStatus(): AiStatus | null {
  const s = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  useEffect(() => {
    if (!current && !loading) refreshAiStatus();
  }, []);
  return s;
}

export function left(s: AiStatus | null, kind: AiKind): number {
  if (!s) return 0;
  return Math.max(0, s.limits[kind] - s.used[kind]);
}
