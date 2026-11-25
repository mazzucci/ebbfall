// The game's art: what loads it (src/client/gl/artload.js: tried again, then RETRY), its sizes as the index says, the
// page cut from the older atlas (tools/art/remains.mjs) pixel for pixel, and how the units are drawn (gl/newart.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { decodeWebP } from '../tools/art/webp.mjs';
import { artFiles } from '../tools/newart/bytes.mjs';
import { ANIMS, SINGLES } from '../tools/art/remains.mjs';
const { UNIT_SIZE, UNIT_SIZE_REST, unitSize, WORK_LOOK, workLook, RING_SIZE, ringSize } = await import('../src/client/gl/newart.js');
const { art, file, onArt, retryArt, TRIES } = await import('../src/client/gl/artload.js');
const { BUILDINGS, UNITS } = await import('../src/engine/constants.js');
const { SHOT_LOOK, PEOPLE_SHOT, TOWER_SHOT, SHOT_TRAIL, BLDG_LOOK } = await import('../src/client/look.js');

const ART = new URL('../tools/art/older/', import.meta.url), NEW = new URL('../public/art/new/', import.meta.url), read = (u) => JSON.parse(readFileSync(u, 'utf8'));
const ix = read(new URL('index.json', NEW));

test('a file that fails is tried again, counted once; after the last try it waits for RETRY, and then comes', async () => {
  const before = globalThis.fetch, warn = console.warn; console.warn = () => {};
  let asked = 0, fails = TRIES + 1, failedAt = 0;
  globalThis.fetch = async () => { asked++; if (asked <= fails) { if (asked % 2) throw new TypeError('no network'); return new Response('half', { status: 500 }); } return new Response('the bytes'); };
  onArt((a) => { if (a.failed && !failedAt) { failedAt = asked; setTimeout(retryArt, 5); } });
  try {
    art.total = 9;
    const got = await file('x', 9, 'auto', (b) => b.text(), () => Promise.resolve());
    assert.equal(got, 'the bytes'); assert.equal(failedAt, TRIES, 'asked the player after the last try'); assert.equal(asked, TRIES + 2);
    assert.deepEqual([art.done, art.failed], [9, false], 'its bytes counted once');
    // a body that breaks off, then a picture that does not decode: what had come is taken back
    let n = 0;
    globalThis.fetch = async () => new Response(n++ ? 'whole!' : new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('who')); c.error(new Error('broke off')); } }));
    let made = 0;
    assert.equal(await file('y', 6, 'auto', async (b) => { if (!made++) throw new Error('bad picture'); return b.text(); }, () => Promise.resolve()), 'whole!');
    assert.equal(n, 3); assert.equal(art.done, 15);
  } finally { globalThis.fetch = before; console.warn = warn; }
});
test('the index names every file with its size (node tools/newart/bytes.mjs), each page its picture by name; nothing else lies there', () => {
  const files = artFiles(ix, (p) => read(new URL(p, NEW)));
  assert.deepEqual(Object.keys(ix.bytes), files);
  for (const f of files) assert.equal(ix.bytes[f], statSync(new URL(f, NEW)).size, f);
  for (const g of Object.values(ix.groups)) for (const p of g.pages) assert.equal(read(new URL(p, NEW)).meta.image, p.replace(/\.json$/, '.webp'), 'the picture the loader asks for');
  assert.deepEqual(readdirSync(NEW).sort(), [...files, 'index.json', 'NOTICE.txt'].sort());
  assert.deepEqual(Object.keys(ix.groups).slice(0, 2), ['remains', 'bldg'], 'the small ones first');
});
test('the page cut from the older atlas is its pixels, frame by frame, and carries its paint, facings and animations', async () => {
  const atlas = read(new URL('atlas.json', ART)), sheet = read(new URL('remains-0.json', NEW)), im = await decodeWebP(readFileSync(new URL('remains-0.webp', NEW))), pages = new Map();
  assert.deepEqual(Object.keys(sheet.frames).sort(), [...SINGLES, ...ANIMS.flatMap(a => atlas.animations[a])].sort());
  for (const p of atlas.pages) {
    const s = read(new URL(p, ART));
    for (const [n, f] of Object.entries(s.frames)) {
      const c = sheet.frames[n]; if (!c) continue;
      if (!pages.has(p)) pages.set(p, await decodeWebP(readFileSync(new URL(s.meta.image, ART))));
      const o = pages.get(p), { x, y, w, h } = f.frame, d = c.frame;
      assert.deepEqual({ ...c, frame: 0 }, { ...f, frame: 0 }, `${n}: its anchor and size`); assert.deepEqual([d.w, d.h], [w, h]);
      for (let r = 0; r < h; r++) assert.equal(Buffer.compare(Buffer.from(im.data.subarray(((d.y + r) * im.w + d.x) * 4, ((d.y + r) * im.w + d.x + w) * 4)), Buffer.from(o.data.subarray(((y + r) * o.w + x) * 4, ((y + r) * o.w + x + w) * 4))), 0, `${n}, row ${r}`);
    }
  }
  const g = ix.groups.remains;
  assert.deepEqual([g.tints, g.facings, g.animations], [atlas.tints, atlas.facings, Object.fromEntries(ANIMS.map(a => [a, atlas.animations[a]]))]);
});
test('every frame the client names is in the art it loads: bodies, masks, heads, sites\' ground, rubble, shots, effects', () => {
  const frames = new Set(Object.values(ix.groups).flatMap(g => g.pages.flatMap(p => Object.keys(read(new URL(p, NEW)).frames))));
  for (const type of Object.keys(BUILDINGS)) {
    assert.ok(frames.has(`bldg_${type}`) && frames.has(`bldg_${type}_m`), type);
    assert.ok(Array.isArray(ix.groups.bldg.looks[type]?.base), `${type}: its outline on the ground`);
    const L = BLDG_LOOK[type]; if (!L?.head) continue;
    for (const d of L.pan ? [13, 14, 15, 0, 1, 2, 3] : Array.from({ length: 16 }, (_, i) => i)) assert.ok(frames.has(`${L.head}_${d}`), `${L.head}_${d}`);
  }
  for (const n of [2, 3, 4]) for (const k of ['rubble', 'rubble_vael']) assert.ok(frames.has(`${k}_${n}`), `${k}_${n}`); // (no `worn_n`: the earth under a building is the ground's own, gl/newland.js wearMix)
  for (const s of new Set([...Object.values(SHOT_LOOK), ...Object.values(PEOPLE_SHOT).flatMap(Object.values), ...Object.values(TOWER_SHOT)])) assert.ok(frames.has(s), `the shot ${s}`);
  for (const a of [...Object.values(SHOT_TRAIL), 'boom_small', 'flash', 'spark', 'glint', 'muzzle']) assert.ok(ix.groups.remains.animations[a]?.every(f => frames.has(f)), a);
  for (const m of ['full', 'low', 'empty']) assert.ok(frames.has(`mine_${m}`)); assert.ok(frames.has('light'));
  for (const k of Object.keys(ix.groups.unit.unitTops)) for (let d = 0; d < 16; d++) assert.ok(ix.groups.unit.animations[`${k}_${d}`].every(f => frames.has(f)) && frames.has(`${k}_${d}_0_m`), `${k}_${d}`);
});
test('the unit sizes: every kind drawn as its frames are packed, a row only for a real kind', () => {
  assert.deepEqual(UNIT_SIZE, { monolith: 0.9 }); assert.equal(UNIT_SIZE_REST, 1); // (the second pack's frames come at their final sizes; the Rover a little less)
  for (const kind of Object.keys(UNIT_SIZE)) assert.ok(UNITS[kind], `${kind} is a unit kind`);
  for (const kind of Object.keys(UNITS)) {
    assert.equal(unitSize(kind), UNIT_SIZE[kind] ?? UNIT_SIZE_REST, kind);
    assert.ok(unitSize(kind) > 0.5 && unitSize(kind) <= 1, `${kind}: a size a unit can be read at`);
  }
});
test('how a builder with its own work frames works: the Bot stands still and turns its arm, the rest lean and flash', () => {
  assert.deepEqual(WORK_LOOK, { lumen: { nudge: false, turns: true } });
  for (const kind of Object.keys(WORK_LOOK)) assert.ok(UNITS[kind]?.worker, `${kind} is a worker`);
  for (const kind of Object.keys(UNITS)) {
    assert.deepEqual(workLook(kind), WORK_LOOK[kind] ?? { nudge: true, turns: false }, kind);
  }
});
test('people on foot have a selection ring a fifth smaller, and only the ring: their size and their hit area are untouched', () => {
  assert.deepEqual(RING_SIZE, { harvester: 0.8, trooper: 0.8, lancer: 0.8, prism: 0.8, bruiser: 0.8, umbra: 0.8 });
  for (const kind of Object.keys(RING_SIZE)) { assert.ok(UNITS[kind], `${kind} is a unit kind`); assert.ok(!UNITS[kind].air, `${kind} is on the ground`); }
  for (const kind of Object.keys(UNITS)) {
    assert.equal(ringSize(kind), RING_SIZE[kind] ?? 1, kind);
    assert.equal(unitSize(kind), UNIT_SIZE[kind] ?? UNIT_SIZE_REST, `${kind}: its drawn size (the bar, the hit test) is not the ring's`);
  }
  // the renderer takes the ring's factor in one place, the ring's own size: not in the drawn height or radius the hit test reads
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8'), lines = src.split('\n').filter(l => /ringSize\(/.test(l));
  assert.equal(lines.length, 1, 'one use of ringSize');
  assert.match(lines[0], /^\s*this\.size = /, 'on the selection ring\'s size');
  for (const name of ['unitTop', 'unitRadius']) assert.doesNotMatch(src.split('\n').find(l => l.startsWith(`export const ${name} = `)), /ringSize|RING_SIZE/, `${name} does not read the ring's table`);
});
