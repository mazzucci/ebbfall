// Ebbfall's service worker (generated into dist/ by tools/offline/plugin.mjs): every file of the game is stored on
// install, then served from the cache, so the game runs offline. A new build has a new cache; the old one is dropped.
const CACHE = 'endfall-__VERSION__';
const BUILD = '__BUILD__'; // the game's version, as the About page shows it
const FILES = __FILES__;

// Each file is stored on its own and kept: an install cut short (a phone losing its signal) resumes where it stopped
// the next time, and PLAY OFFLINE can say how far it got (and, asking, fetches what is missing).
// Fetched past the browser's HTTP cache (`reload`): a copy from before a deploy (GitHub Pages lets them live 10
// minutes) would otherwise be stored for good, an index.html pointing at another build's files. One file failing
// fails the install (nothing half stored is ever served: the build before stays). Refilling after a check fetches
// from the network as it is then: should a newer build be deployed meanwhile, its next install sets things right.
let filling = null;
const fill = () => (filling ||= caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.match(f).then(hit => hit || c.add(new Request(f, { cache: 'reload' })))))).finally(() => { filling = null; }));
self.addEventListener('install', (e) => {
  e.waitUntil(fill().then(() => self.skipWaiting()));
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

/** How much of this build is stored for offline play: {version, total, stored} (and `error`: no storage here). */
async function status() {
  const s = { version: BUILD, total: FILES.length, stored: 0 };
  try {
    if (!(await caches.has(CACHE))) return s;
    const c = await caches.open(CACHE);
    s.stored = (await Promise.all(FILES.map(f => c.match(f)))).filter(Boolean).length;
  } catch (err) { s.error = String(err?.message || err); }
  return s;
}
// PLAY OFFLINE asks {t: 'offline'} over a MessageChannel; the answer goes back on its port. Files
// missing (storage cleared in part): fetch them again, so that "check again" can find them.
self.addEventListener('message', (e) => {
  const port = e.ports?.[0];
  if (e.data?.t !== 'offline' || !port) return;
  e.waitUntil(status().then(s => { port.postMessage(s); if (!s.error && s.stored < s.total) return fill().catch(() => {}); }));
});
