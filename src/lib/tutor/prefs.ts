// The student's chosen tutor, voice, accent and speed: loaded once, saved with the account.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { DEFAULT_PREFS, type TutorPrefs } from '../../../shared/tutors';

let current: TutorPrefs | null = null;
let natural = true;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  if (!loading) {
    loading = api<{ prefs: TutorPrefs; natural: boolean }>('/tutor/prefs')
      .then((r) => {
        current = r.prefs;
        natural = r.natural;
      })
      .catch(() => {
        current = { ...DEFAULT_PREFS };
      })
      .finally(() => listeners.forEach((l) => l()));
  }
  return loading;
}

export function useTutorPrefs(): { prefs: TutorPrefs | null; natural: boolean; save: (p: TutorPrefs) => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    prefs: current,
    natural,
    save: async (p) => {
      current = p;
      listeners.forEach((l) => l());
      const r = await api<{ prefs: TutorPrefs }>('/tutor/prefs', { method: 'PUT', body: p });
      current = r.prefs;
      listeners.forEach((l) => l());
    },
  };
}
