/* eslint-disable no-undef -- placeholders are substituted at build time */
/* Pixel Hospital service worker. Generated at build time – do not edit dist/sw.js by hand.
 * Caches only static application files. It never touches IndexedDB (save games). */
const CACHE_PREFIX = 'pixel-hospital-';
const CACHE_NAME = CACHE_PREFIX + '__CACHE_VERSION__';
const BASE = '__BASE__';
const PRECACHE = __PRECACHE_LIST__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE.map((p) => BASE + p))),
  );
  // Do not skipWaiting automatically: the game first pauses and saves, then asks us to activate.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ cache: CACHE_NAME });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(BASE + 'index.html', { cacheName: CACHE_NAME, ignoreVary: true }).then((cached) => cached || fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { cacheName: CACHE_NAME, ignoreSearch: true, ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && url.pathname.startsWith(BASE)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
