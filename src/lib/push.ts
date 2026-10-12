import { api } from '../api';

export type PushSupport = 'ok' | 'ios-install' | 'unsupported' | 'blocked';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function pushSupport(): PushSupport {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  return 'ok';
}

function keyBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await navigator.serviceWorker.ready;
  return reg;
}

/** Is this device already getting reminders? */
export async function deviceSubscribed(): Promise<boolean> {
  if (pushSupport() !== 'ok') return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return !!(await reg?.pushManager.getSubscription());
}

/** Ask permission and register this device for reminders. */
export async function enablePush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your browser’s site settings.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
  const json = sub.toJSON();
  return api('/plan/push/subscribe', { body: { endpoint: json.endpoint, keys: json.keys } });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/plan/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

/** Minutes ahead of UTC, as the server expects (Kampala = 180). */
export const tzOffset = () => -new Date().getTimezoneOffset();
