// Endfall's service worker (generated into dist/ by tools/offline/plugin.mjs): every file of the game is stored on
// install, then served from the cache, so the game runs offline. A new build has a new cache; the old one is dropped.
const CACHE = 'endfall-__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('endfall-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // The cached copy first (offline, and instant); anything not in the cache goes to the network. Pages are matched
  // without their query (?seed=...), so the game opens offline from any of its links.
  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit || fetch(req))));
});
