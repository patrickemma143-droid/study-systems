// The outbox: study work done without a connection (flashcard answers, quiz results, lesson
// progress, study minutes) is kept on the phone and sent, oldest first, when the connection returns.

export interface OutboxItem {
  path: string;
  method: string;
  body: unknown;
  at: number;
}

const KEY = 'cs-outbox';
const OLD_REVIEWS = 'cs-offline-reviews';

/** Writes that can safely wait for the connection to come back. */
const DEFERRABLE: RegExp[] = [/^\/study\/cards\/\d+\/review$/, /^\/study\/quiz$/, /^\/study\/progress$/, /^\/study\/activity$/];
export const canDefer = (path: string, method: string) => method !== 'GET' && DEFERRABLE.some((r) => r.test(path));

function read(): OutboxItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || '[]') as OutboxItem[];
    // answers saved by the earlier version of offline mode
    const old = JSON.parse(localStorage.getItem(OLD_REVIEWS) || '[]') as { cardId: number; body: unknown; at: number }[];
    if (old.length) {
      localStorage.removeItem(OLD_REVIEWS);
      const merged = [...old.map((o) => ({ path: `/study/cards/${o.cardId}/review`, method: 'POST', body: o.body, at: o.at })), ...items];
      localStorage.setItem(KEY, JSON.stringify(merged));
      return merged;
    }
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}
function write(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-3000)));
  } catch {
    /* storage full or blocked */
  }
  window.dispatchEvent(new Event('cs:queue'));
}

export function enqueue(path: string, method: string, body: unknown) {
  write([...read(), { path, method, body, at: Date.now() }]);
}
export const outboxCount = () => read().length;
export function clearOutbox() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_REVIEWS);
  } catch {
    /* ignore */
  }
}

/** What the app gets back for a write that was saved for later, so it can carry on. */
export function deferredReply(path: string, body: any): any {
  if (path === '/study/progress') return { progress: { status: body?.status ?? 'read', bestRecall: body?.recall ?? null }, queued: true };
  return { ok: true, points: 0, queued: true };
}

let flushing = false;
/** Send everything saved offline. Stops at the first network failure; drops items the server refuses. */
export async function flushOutbox(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    let items = read();
    while (items.length) {
      const it = items[0];
      try {
        const res = await fetch(`/api${it.path}`, { method: it.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it.body), credentials: 'same-origin' });
        if (res.status === 401) break; // logged out: keep it until they log back in
        if (res.status === 503 && res.headers.get('content-type')?.includes('json')) {
          const j = await res.clone().json().catch(() => ({}));
          if (/offline/i.test(String(j.error))) break; // still offline (answered by the service worker)
        }
      } catch {
        break; // still offline
      }
      items = items.slice(1);
      write(items);
      sent++;
    }
  } finally {
    flushing = false;
    window.dispatchEvent(new Event('cs:queue'));
  }
  return sent;
}
