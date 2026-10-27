// The service worker (tools/offline/sw.js, as the build writes it) in Node on a fake Cache Storage: what CHECK OFFLINE
// hears back (all files stored, some, none, no storage), and an install that resumes where it stopped. Also the
// manifest's app icons, which the install prompt needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { swSource } from '../tools/offline/plugin.mjs';

const FILES = ['./', 'index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'art/atlas-0.png'];

/** A fake Cache Storage: `stored` names the files already in the build's cache (null: no cache yet). */
function fakeCaches(stored, { broken = false, fetched = [] } = {}) {
  const store = new Map();
  if (stored) store.set('endfall-v1', new Set(stored));
  const cache = (name) => ({
    match: async (f) => (store.get(name).has(f) ? { ok: true } : undefined),
    add: async (f) => { fetched.push(f); store.get(name).add(f); },
  });
  return {
    has: async (name) => { if (broken) throw new Error('SecurityError'); return store.has(name); },
    open: async (name) => { if (broken) throw new Error('SecurityError'); if (!store.has(name)) store.set(name, new Set()); return cache(name); },
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
  };
}

/** Load the worker on `caches`; returns its event handlers. */
function worker(caches) {
  const on = {};
  const self = { addEventListener: (t, fn) => { on[t] = fn; }, skipWaiting: () => {}, clients: { claim: () => {} } };
  runInNewContext(swSource('v1', 'b1d0', FILES), { self, caches, location: { origin: 'http://x' }, URL });
  return on;
}

/** What the worker answers CHECK OFFLINE's message. */
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
