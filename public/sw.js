// Charis Study service worker: study reminders, and offline study.
// Pages and data are always fetched fresh from the network first, so a new version of the app is
// picked up straight away; the saved copies are only used when there is no connection.
const SHELL = 'cs-shell-v1';
// 3D anatomy models are kept on the phone after the first download (they are versioned by ?v=)
const DATA = 'cs-data-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

// Data that is useful offline: a student's packs, cards and profile. Nothing else is stored.
const OFFLINE_API = [/^\/api\/auth\/me$/, /^\/api\/packs$/, /^\/api\/packs\/\d+$/, /^\/api\/packs\/\d+\/past-papers$/, /^\/api\/study\/cards$/, /^\/api\/study\/stats$/];

async function networkFirst(request, cacheName, fallbackKey) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(fallbackKey || request, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = await caches.match(fallbackKey || request);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // public profile pages are server-rendered, not the app
  if (url.pathname.startsWith('/u/') || url.pathname === '/leaderboard' || url.pathname === '/sitemap.xml' || url.pathname === '/robots.txt') return;
  if (req.mode === 'navigate') {
    // the app page: fresh when online, the saved copy when offline
    event.respondWith(networkFirst(req, SHELL, '/__app'));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/anatomy/') || url.pathname.startsWith('/tutors/') || url.pathname.startsWith('/draco/') || url.pathname.startsWith('/fonts/') || /^\/(icon[\w-]*\.(png|svg)|theme\.js|manifest\.webmanifest)$/.test(url.pathname)) {
    // build files have unique names per version, so a saved copy is always correct
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname.startsWith('/api/') && OFFLINE_API.some((r) => r.test(url.pathname))) {
    event.respondWith(
      networkFirst(req, DATA).catch(
        () => new Response(JSON.stringify({ error: 'You are offline. This was not saved for offline use.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }),
      ),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-data') event.waitUntil(caches.delete(DATA));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Charis Study', {
      body: data.body || 'Time for a short study session.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'charis-study',
      renotify: true,
      data: { url: data.url || '/home' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/home', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
