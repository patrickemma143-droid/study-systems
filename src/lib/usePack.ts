import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type PackDetail } from '../api';
import { today } from './util';

// Small in-memory cache so moving between study methods in the same pack is instant.
const cache = new Map<number, PackDetail>();

export function invalidatePack(id: number) {
  cache.delete(id);
}

export function usePack(id: number) {
  const [data, setData] = useState<PackDetail | null>(cache.get(id) || null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!(id > 0)) return;
    try {
      const d = await api<PackDetail>(`/packs/${id}`);
      cache.set(id, d);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    setData(cache.get(id) || null);
    reload();
  }, [id, reload]);

  return { data, error, reload };
}

/** Records how long the student actively studies with a method (only while the tab is visible). */
export function useStudyTimer(method: string, packId: number | null) {
  const acc = useRef(0);
  const since = useRef<number | null>(document.visibilityState === 'visible' ? Date.now() : null);

  useEffect(() => {
    const flush = (keepalive = false) => {
      if (since.current) {
        acc.current += Date.now() - since.current;
        since.current = document.visibilityState === 'visible' ? Date.now() : null;
      }
      const minutes = acc.current / 60000;
      if (minutes >= 0.25) {
        acc.current = 0;
        api('/study/activity', { body: { packId, method, minutes: Math.min(minutes, 120), day: today() }, keepalive }).catch(() => {});
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') since.current = Date.now();
      else flush(true);
    };
    document.addEventListener('visibilitychange', onVis);
    const iv = window.setInterval(() => flush(), 120000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(iv);
      flush(true);
    };
  }, [method, packId]);
}

/** Marks a lesson as read / understood and keeps the cached pack in sync. */
export async function setProgress(packId: number, chunk: number, body: { status?: string; recall?: number }) {
  const r = await api<{ progress: { status: any; bestRecall: number | null } }>('/study/progress', { method: 'PUT', body: { packId, chunk, ...body } });
  const c = cache.get(packId);
  if (c) c.progress = { ...c.progress, [chunk]: r.progress };
  return r.progress;
}
