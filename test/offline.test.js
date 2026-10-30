// The service worker (tools/offline/sw.js, as the build writes it) in Node on a fake Cache Storage: what PLAY OFFLINE
// hears back (all files stored, some, none, no storage), an install that resumes where it stopped, and Cloudflare's
// analytics beacon left to the network. Also the manifest's app icons, which the install prompt needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { swSource } from '../tools/offline/plugin.mjs';
import { decodePNG } from '../tools/art/png.js';

const FILES = ['./', 'index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'art/atlas-0.png'];

/** A fake Cache Storage: `stored` names the files already in the build's cache (null: no cache yet). */
function fakeCaches(stored, { broken = false, fetched = [], failing = null, modes = [] } = {}) {
  const store = new Map();
  if (stored) store.set('endfall-v1', new Set(stored));
  const cache = (name) => ({
    match: async (f) => (store.get(name).has(f) ? { ok: true } : undefined),
    add: async (req) => {
      const f = req.url ?? req; modes.push(req.cache);
      if (f === failing) throw new TypeError('Failed to fetch');
      fetched.push(f); store.get(name).add(f);
    },
  });
  return {
    has: async (name) => { if (broken) throw new Error('SecurityError'); return store.has(name); },
    open: async (name) => { if (broken) throw new Error('SecurityError'); if (!store.has(name)) store.set(name, new Set()); return cache(name); },
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
  };
}

/** Load the worker on `caches`; returns its event handlers. */
class FakeRequest { constructor(url, o = {}) { this.url = url; this.cache = o.cache; } }
function worker(caches, flags = {}) {
  const on = {};
  const self = { addEventListener: (t, fn) => { on[t] = fn; }, skipWaiting: () => { flags.skipped = true; }, clients: { claim: () => {} } };
  runInNewContext(swSource('v1', 'b1d0', FILES), { self, caches, location: { origin: 'http://x' }, URL, Request: FakeRequest });
  return on;
}

/** What the worker answers PLAY OFFLINE's message. */
async function ask(on) {
  let reply, waited;
  const port = { postMessage: (m) => { reply = structuredClone(m); } }; // (as a real port would: a copy, in this realm)
  on.message({ data: { t: 'offline' }, ports: [port], waitUntil: (p) => { waited = p; } });
  await waited;
  return reply;
}

test('every file stored: ready, with the build the About page shows', async () => {
  assert.deepEqual(await ask(worker(fakeCaches(FILES))), { version: 'b1d0', total: 5, stored: 5 });
});

test('some files stored: how many of how many, and the missing ones are fetched for the next check', async () => {
  const fetched = [], on = worker(fakeCaches(['./', 'index.html'], { fetched }));
  assert.deepEqual(await ask(on), { version: 'b1d0', total: 5, stored: 2 });
  assert.deepEqual(fetched.sort(), ['art/atlas-0.png', 'assets/index-abc.css', 'assets/index-abc.js']);
  assert.deepEqual(await ask(on), { version: 'b1d0', total: 5, stored: 5 });
});

test('an install with one file failing does not go live (the build before stays), and every file is fetched past the HTTP cache', async () => {
  const flags = {}, modes = [], on = worker(fakeCaches(null, { failing: 'assets/index-abc.js', modes }), flags);
  let waited; on.install({ waitUntil: (p) => { waited = p; } });
  await assert.rejects(waited, /Failed to fetch/);
  assert.ok(!flags.skipped, 'not activated');
  assert.ok(modes.length > 0 && modes.every(m => m === 'reload'), `fetched with cache: 'reload' (${modes})`);
});

test('nothing stored yet: none of them', async () => {
  assert.deepEqual(await ask(worker(fakeCaches(null))), { version: 'b1d0', total: 5, stored: 0 });
});

test('storage blocked: an error the page reads as unavailable', async () => {
  const r = await ask(worker(fakeCaches(null, { broken: true })));
  assert.equal(r.stored, 0);
  assert.match(r.error, /SecurityError/);
});

test('other messages get no answer', async () => {
  const on = worker(fakeCaches(FILES));
  let replied = false, waited = false;
  on.message({ data: { t: 'other' }, ports: [{ postMessage: () => { replied = true; } }], waitUntil: () => { waited = true; } });
  on.message({ data: { t: 'offline' }, ports: [], waitUntil: () => { waited = true; } });
  assert.equal(replied || waited, false);
});

test('an install cut short resumes: only the missing files are fetched', async () => {
  const fetched = [], caches = fakeCaches(['./', 'index.html'], { fetched });
  const on = worker(caches);
  let done;
  on.install({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual(fetched.sort(), ['art/atlas-0.png', 'assets/index-abc.css', 'assets/index-abc.js']);
  assert.deepEqual(await ask(on), { version: 'b1d0', total: 5, stored: 5 });
});

test("Cloudflare's analytics beacon is left to the network: never stored, never answered from the cache", async () => {
  // (Web Analytics, injected into index.html at Cloudflare's edge: a cross-origin script, and a POST to /cdn-cgi/rum)
  const on = worker(fakeCaches(FILES));
  for (const [url, method] of [['https://static.cloudflareinsights.com/beacon.min.js', 'GET'], ['http://x/cdn-cgi/rum', 'POST']]) {
    let answered = false;
    on.fetch({ request: { url, method, mode: 'no-cors' }, respondWith: () => { answered = true; } });
    assert.equal(answered, false, url);
  }
});

test('the manifest has PNG icons of 192 and 512 pixels and a maskable one, and the files exist', () => {
  const pub = new URL('../public/', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('manifest.webmanifest', pub), 'utf8'));
  const png = m.icons.filter(i => i.type === 'image/png');
  for (const size of ['192x192', '512x512']) assert.ok(png.some(i => i.sizes === size && i.purpose.includes('any')), size);
  assert.ok(png.some(i => i.purpose.includes('maskable') && i.sizes === '512x512'), 'maskable');
  assert.ok(m.icons.some(i => i.src === 'icon.svg'), 'the SVG stays');
  for (const i of m.icons) {
    assert.ok(existsSync(new URL(i.src, pub)), i.src);
    if (i.type !== 'image/png') continue;
    const b = readFileSync(new URL(i.src, pub)), [w, h] = i.sizes.split('x').map(Number);
    assert.equal(b.toString('latin1', 1, 4), 'PNG', i.src);
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [w, h], i.src); // (IHDR: the size it claims)
  }
});

test('the maskable icon keeps to the safe zone: outside the circle of radius 40%, only its background colour', () => {
  const pub = new URL('../public/', import.meta.url);
  const bg = readFileSync(new URL('icon.svg', pub), 'utf8').match(/<rect[^>]*fill="#([0-9a-f]{6})"/i)[1], want = [0, 2, 4].map(i => parseInt(bg.slice(i, i + 2), 16));
  const { w, h, data } = decodePNG(readFileSync(new URL('icon-maskable-512.png', pub)));
  assert.deepEqual([w, h], [512, 512]);
  let outside = 0, wrong = 0, inside = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / w, isBg = data[i] === want[0] && data[i + 1] === want[1] && data[i + 2] === want[2] && data[i + 3] === 255;
    if (r > 0.4) { outside++; if (!isBg) wrong++; } else if (!isBg) inside++;
  }
  assert.equal(wrong, 0, `${wrong} of ${outside} pixels outside the safe zone are not the background`);
  assert.ok(inside > 1000, 'the icon is in the safe zone, not missing');
});
