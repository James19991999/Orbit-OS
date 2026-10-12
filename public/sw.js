/* OrbitOS service worker — makes the app installable and usable on weak connections.
   • App code, fonts and icons: cache-first (they are content-hashed, so never stale).
   • Pages: always from the network; if that fails, the offline page. Signed-in pages are never
     cached, so nothing private is left on a shared device.
   • API calls, auth and Supabase are never touched. */
const VERSION = 'orbit-v3';
const STATIC = `${VERSION}-static`;
// A plain HTML file with no app scripts: it keeps working after every new release.
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/icon-512.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Old releases' files pile up otherwise; keep the most recent ones (plus the precached files).
const MAX_STATIC = 150;
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.filter((r) => !PRECACHE.includes(new URL(r.url).pathname)).slice(0, Math.max(0, keys.length - MAX_STATIC));
  await Promise.all(extra.map((r) => cache.delete(r)));
}

function isStatic(url) {
  return url.pathname.startsWith('/_next/static/') || /\.(?:woff2|png|svg|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/monitoring')) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) { await cache.put(req, res.clone()); trim(cache); }
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || new Response('Offline', { status: 503 })));
  }
});

// ───────── Notifications (Web Push) ─────────
// The server sends {title, body, url, tag}; tapping opens (or focuses) OrbitOS on that page.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : 'OrbitOS' }; }
  const title = data.title || 'OrbitOS';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'orbitos',
    renotify: true,
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = wins.find((w) => w.url.startsWith(self.location.origin));
    if (same) { await same.focus(); if ('navigate' in same) return same.navigate(url); return; }
    return self.clients.openWindow(url);
  })());
});
