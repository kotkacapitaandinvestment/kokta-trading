/* Kotka service worker: app-shell caching, offline fallback and Web Push.
 *
 * - API calls (/api/*) always go to the network and are never cached, so
 *   prices, messages and research are never stale.
 * - Hashed build assets are cached on first use (they never change).
 * - Page loads always go to the network; when offline, /offline.html.
 */
const VERSION = 'kotka-2026-09-27';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const PRECACHE = ['/offline.html', '/brand/kotka-mark-128.png', '/icon-192.png', '/icon-maskable-192.png', '/site.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, ASSET_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only

  // Pages always come from the network (data is live); offline shows a page
  // that says so instead of a half-working app.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
  }
});

// ── Web Push ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Kotka', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // If Kotka is open and in front, the app already shows it live.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = windows.find((w) => w.focused && w.visibilityState === 'visible');
      if (focused && data.skipIfFocused !== false) {
        focused.postMessage({ type: 'push', data });
        return;
      }
      await self.registration.showNotification(data.title || 'Kotka', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-maskable-192.png',
        tag: data.tag || undefined,
        renotify: !!data.tag,
        timestamp: data.at ? Date.parse(data.at) : Date.now(),
        data: { link: data.link || '/app/notifications' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = new URL(event.notification.data?.link || '/app/notifications', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return existing.navigate(link).catch(() => existing.postMessage({ type: 'navigate', link }));
      }
      return self.clients.openWindow(link);
    })(),
  );
});

// The browser rotated the subscription: register the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription?.options?.applicationServerKey;
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch('/api/push/subscribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), replaces: event.oldSubscription?.endpoint }) });
    })(),
  );
});
