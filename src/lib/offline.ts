// Offline study: download a pack to this phone, study flashcards without data, and send the
// answers to the server when the connection comes back.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';

const QUEUE = 'cs-offline-reviews';
const PACKS = 'cs-offline-packs';
const DATA_CACHE = 'cs-data-v1';

interface QueuedReview {
  cardId: number;
  body: Record<string, unknown>;
  at: number;
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
};

export function queueReview(cardId: number, body: Record<string, unknown>) {
  const q = read<QueuedReview[]>(QUEUE, []);
  q.push({ cardId, body, at: Date.now() });
  write(QUEUE, q.slice(-2000));
  window.dispatchEvent(new Event('cs:queue'));
}
export const queuedCount = () => read<QueuedReview[]>(QUEUE, []).length;

let flushing = false;
/** Send answers saved while offline, oldest first. Stops at the first network failure. */
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    let q = read<QueuedReview[]>(QUEUE, []);
    while (q.length) {
      const item = q[0];
      try {
        await api(`/study/cards/${item.cardId}/review`, { body: item.body });
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break; // still offline
        // anything else (card deleted, logged out…) can't be retried usefully
      }
      q = q.slice(1);
      write(QUEUE, q);
      sent++;
    }
  } finally {
    flushing = false;
    window.dispatchEvent(new Event('cs:queue'));
  }
  return sent;
}

export function startOfflineSync() {
  window.addEventListener('online', () => void flushQueue());
  void flushQueue();
  window.setInterval(() => {
    if (queuedCount()) void flushQueue();
  }, 60_000);
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}

export const downloadedPacks = () => read<number[]>(PACKS, []);
export const isDownloaded = (id: number) => downloadedPacks().includes(id);

/** Fetch everything a pack needs while online, so the service worker keeps a copy. */
export async function downloadPack(id: number): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    // first visit: the offline helper starts on the next page load
    await navigator.serviceWorker?.ready.catch(() => undefined);
  }
  const urls = [
    `/api/packs/${id}`,
    `/api/packs`,
    `/api/auth/me`,
    `/api/study/cards?mode=due&limit=40&packId=${id}`,
    `/api/study/cards?mode=all&limit=200&packId=${id}`,
    `/api/study/cards?mode=weak&limit=40&packId=${id}`,
    `/api/packs/${id}/past-papers`,
  ];
  for (const u of urls) {
    const r = await fetch(u, { credentials: 'same-origin' });
    if (!r.ok && u === `/api/packs/${id}`) throw new Error('Could not download this pack. Check your connection.');
  }
  // the screens used offline
  await Promise.all([import('../pages/PackHome'), import('../pages/Lesson'), import('../pages/Flashcards'), import('../pages/QuizPage'), import('../pages/CheatSheet')]);
  const list = downloadedPacks().filter((x) => x !== id);
  write(PACKS, [id, ...list].slice(0, 20));
}

export function forgetDownload(id: number) {
  write(PACKS, downloadedPacks().filter((x) => x !== id));
}

/** Logging out removes this student's offline copies from the phone. */
export async function clearOfflineData() {
  try {
    localStorage.removeItem(PACKS);
    localStorage.removeItem(QUEUE);
  } catch {
    /* ignore */
  }
  try {
    await caches.delete(DATA_CACHE);
  } catch {
    /* ignore */
  }
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

export function useQueued(): number {
  const [n, setN] = useState(queuedCount);
  useEffect(() => {
    const f = () => setN(queuedCount());
    window.addEventListener('cs:queue', f);
    return () => window.removeEventListener('cs:queue', f);
  }, []);
  return n;
}
