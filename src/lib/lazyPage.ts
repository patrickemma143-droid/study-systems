import { lazy, type ComponentType } from 'react';

const KEY = 'cs-reloaded-for-update';

/** Errors the browser throws when a code file from an older deploy no longer exists on the server. */
export function isStaleBuildError(err: unknown): boolean {
  const msg = String((err as any)?.message || err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload/i.test(msg);
}

/**
 * After a redeploy, a page that was already open still points at the previous build's files.
 * Reload once to pick up the new version. Guarded so it can never loop.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable — still reload once */
  }
  window.location.reload();
  return true;
}

/** React.lazy that recovers from "this file no longer exists" after a new deploy. */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (err) {
      if (isStaleBuildError(err) && reloadForNewVersion()) return new Promise<never>(() => {});
      throw err;
    }
  });
}
