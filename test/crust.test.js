// The salt outcrops' crust (src/client/gl/crust.js): salt nodes in clumps, each clump's crust one opaque mass with no
// holes and its footing round it, the same image every time, and the crystals' variant fixed by the tile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saltClumps, crustImage, crystalVariant } from '../src/client/gl/crust.js';

// Two clumps as the sim lays them (crates/endfall-sim/src/map.rs CLUMP_7 and CLUMP_5: little groups a tile apart, one in
// a ring round an empty middle), far apart.
const at = (rows, x0, y0) => rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === 'X' ? [{ tx: x0 + x, ty: y0 + y }] : [])));
const seven = at(['..XX.', 'X....', 'X..X.', '...X.', '.X...'], 10, 10), five = at(['.XX.', '....', 'X..X', 'X...'], 40, 30);

test('salt nodes fall into clumps, linked into one tree', () => {
  const clumps = saltClumps([...seven, ...five]);
  assert.equal(clumps.length, 2);
  assert.deepEqual(clumps.map(c => c.nodes.length), [7, 5]);
  for (const c of clumps) assert.equal(c.links.length, c.nodes.length - 1, 'a spanning tree: every node reached');
});

test('a clump\'s crust is one opaque mass without holes, a footing round it, and the same every time', () => {
  for (const c of saltClumps([...seven, ...five])) {
    const im = crustImage(c), { w, h, data } = im;
    assert.equal(data.length, w * h * 4);
    const solid = (i) => data[i * 4 + 3] === 255;
    // Every node's tile middle is under the crust.
    for (const n of c.nodes) assert.ok(solid(Math.floor(((n.ty + 0.5) * 32 - im.y) * im.k) * w + Math.floor(((n.tx + 0.5) * 32 - im.x) * im.k)), `node ${n.tx},${n.ty} on the crust`);
    // One mass: a flood from one solid texel reaches them all.
    const seen = new Uint8Array(w * h), start = [...Array(w * h).keys()].find(solid), stack = [start]; seen[start] = 1;
    let reached = 0;
    while (stack.length) { const i = stack.pop(); reached++; for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && Math.abs((j % w) - (i % w)) <= 1 && !seen[j] && solid(j)) { seen[j] = 1; stack.push(j); } }
    assert.equal(reached, [...Array(w * h).keys()].filter(solid).length, 'one connected crust');
    // No holes: everything not solid is reached from the image's border.
    const out = new Uint8Array(w * h), q = [];
    for (let i = 0; i < w * h; i++) if ((i % w === 0 || i % w === w - 1 || i < w || i >= w * (h - 1)) && !solid(i)) { out[i] = 1; q.push(i); }
    while (q.length) { const i = q.pop(); for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && Math.abs((j % w) - (i % w)) <= 1 && !out[j] && !solid(j)) { out[j] = 1; q.push(j); } }
    for (let i = 0; i < w * h; i++) assert.ok(solid(i) || out[i], 'no ground inside the crust');
    // A footing: dark, half-transparent texels round it; the border itself clear.
    assert.ok([...Array(w * h).keys()].some(i => data[i * 4 + 3] > 40 && data[i * 4 + 3] < 255 && data[i * 4] < 40), 'a footing round it');
    for (let i = 0; i < w; i++) assert.equal(data[i * 4 + 3], 0, 'the image\'s top row clear');
    assert.deepEqual(crustImage(c).data, data, 'the same image again');
  }
});

test('the crystals\' variant is fixed by the tile, and a clump mixes them', () => {
  for (const n of seven) { const v = crystalVariant(n.tx, n.ty); assert.ok(Number.isInteger(v) && v >= 0 && v < 4); assert.equal(crystalVariant(n.tx, n.ty), v); }
  let tiles = 0, mixed = 0;
  for (let y = 0; y < 60; y += 3) for (let x = 0; x < 60; x += 3) { tiles++; if (new Set(seven.map(n => crystalVariant(n.tx + x, n.ty + y))).size >= 2) mixed++; }
  assert.equal(mixed, tiles, 'every placement of a seven-crystal clump draws at least two variants');
});
