// The ground's plan (src/client/gl/groundplan.js): what goes where (meadows, worn tracks and yards, the rock's tone, the
// crags), from the map alone. The same ground for the same map whoever is seated where; worn ground only on open land,
// a track fading out before a pass instead of breaking into pieces; the tones off the rock's edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { planGround, planHash, startsOf, TRACK_FADE, TRACK_MIN } from '../src/client/gl/groundplan.js';
import { rockKinds } from '../src/client/gl/ground.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';
let E;
if (built) {
  const sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  E = await import('../src/engine/core.js');
}

/** The plan as gl/render.js makes it for the game at hand. */
function gamePlan() {
  const { MW, MH, map, G } = E, depthOf = { land: 0, shallow: 1, deep: 2 }, depth = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) depth[y * MW + x] = depthOf[E.ground(x, y)];
  const kinds = rockKinds(MW, MH, (x, y) => map.rock[y * MW + x] !== 0, G.seed), starts = startsOf(E.mapPreview(G.seed, G.mapKind, MW), MW, MH);
  return { starts, ...planGround({ w: MW, h: MH, rock: map.rock, depth, nodes: map.nodes, starts, seed: G.seed, kindAt: kinds.kindAt, regionAt: kinds.regionAt }) };
}
const grids = (p) => ({ starts: p.starts, ...Object.fromEntries(['dry', 'lush', 'dirt', 'rockTone', 'crag'].map(k => [k, Array.from(p[k])])) });

test('the same ground from the same seed whatever the seats: two, three or four seated, any starts filled', { skip }, () => {
  // (the sim seats two at least; `side` turns the ring of starts, so other starts are filled each time)
  for (const [seed, kind, size, setups] of [
    [1291, 0, 96, [[2, 0], [2, 1], [2, 3], [3, 2], [4, 0], [4, 1]]],
    [5, 0, 128, [[2, 0], [2, 5], [5, 3], [8, 0], [8, 7]]],
    [1, 6, 64, [[2, 0], [2, 1]]],
  ]) {
    let first = null, hqs = new Set();
    for (const [n, side] of setups) {
      const races = Array.from({ length: n }, (_, s) => (s % 2 ? 'vael' : 'humans'));
      E.resetGameSeats(seed, 1, kind, side, races, [], races.map((_, s) => s > 0), 0, size);
      hqs.add(E.G.bldgs.filter(b => b.d.hq).sort((a, b) => a.team - b.team).map(b => `${b.tx},${b.ty}`).join(' ')); // (who sits where)
      const p = grids(gamePlan());
      assert.equal(p.starts.length, { 64: 2, 96: 4, 128: 8 }[size], 'every start of the map, seated or not');
      assert.ok(p.dirt.some(v => v > 0) && p.dry.some(v => v > 0) && p.rockTone.some(v => v !== 0), 'tracks, meadows and toned rock laid');
      if (!first) first = p; else assert.deepEqual(p, first, `map ${size} seed ${seed}: ${n} seated from side ${side} sees the first setup's ground`);
    }
    assert.equal(hqs.size, setups.length, 'every setup seats its players on other starts');
  }
});

test('a different seed lays different ground', { skip }, () => {
  E.resetGameSeats(1291, 1, 0, 0, ['humans', 'vael'], [], [false, true], 0, 96); const a = grids(gamePlan());
  E.resetGameSeats(2026, 1, 0, 0, ['humans', 'vael'], [], [false, true], 0, 96); const b = grids(gamePlan());
  assert.notDeepEqual(a.dirt, b.dirt);
});

/** A hand-made map from rows: '#' rock (a hill), '~' shallows, 'S' a start's middle, 'M' a gold mine's corner (2x2). */
function handMap(rows, seed = 7) {
  const h = rows.length, w = rows[0].length, rock = new Uint8Array(w * h), depth = new Uint8Array(w * h), starts = [], nodes = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '#') rock[y * w + x] = 1; if (c === '~') depth[y * w + x] = 1;
    if (c === 'S') starts.push({ tx: x, ty: y }); if (c === 'M') nodes.push({ tx: x, ty: y, w: 2, h: 2 });
  }));
  const kinds = rockKinds(w, h, (x, y) => rock[y * w + x] === 1, seed);
  return { w, h, rock, depth, plan: planGround({ w, h, rock, depth, nodes, starts, seed, kindAt: () => 'hill', regionAt: kinds.regionAt }) };
}
// Two starts either side of a wall of rock with a pass one tile wide in it.
const WALL = [
  '..........................................',
  '..........................................',
  '..........................................',
  '....S...................................S.',
  '..........................................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '..........................................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
  '....................#.....................',
];
const COLUMN = Array.from({ length: 40 }, (_, y) => '....................#.....................'.replace(/#/, y === 20 ? '.' : '#')); // (a wall the whole height, a gap at row 20)
COLUMN[4] = '....S.......................................'.slice(0, 42); COLUMN[34] = '.........................................S'.slice(0, 42);

test('worn ground keeps to open land: never a tile with rock or water among its eight neighbors, nor at the map\'s edge', () => {
  for (const rows of [WALL, COLUMN]) {
    const { w, h, rock, depth, plan } = handMap(rows);
    assert.ok(plan.dirt.some(v => v > 0), 'tracks laid');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!plan.dirt[y * w + x]) continue;
      assert.ok(x > 0 && y > 0 && x < w - 1 && y < h - 1, `worn tile ${x},${y} at the map's edge`);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.ok(!rock[(y + dy) * w + x + dx] && !depth[(y + dy) * w + x + dx], `worn tile ${x},${y} beside rock or water`);
    }
  }
});

test('a track through a one-tile pass fades out on both sides of it instead of breaking, and leaves no small pieces', () => {
  const { w, h, plan } = handMap(COLUMN);
  // the worn tiles each side of the wall, and their strength by the distance to the gap
  const left = [], right = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = plan.dirt[y * w + x]; if (v > 0) (x < 20 ? left : right).push({ x, y, v }); }
  assert.ok(left.length && right.length, 'the track on both sides of the wall');
  assert.ok(!plan.dirt[20 * w + 20] && !plan.dirt[20 * w + 19] && !plan.dirt[20 * w + 21], 'nothing in the pass or beside it');
  for (const side of [left, right]) {
    const near = side.reduce((a, b) => (Math.abs(a.x - 20) + Math.abs(a.y - 20) <= Math.abs(b.x - 20) + Math.abs(b.y - 20) ? a : b));
    assert.ok(near.v < 1 && near.v >= 1 / (TRACK_FADE + 1) - 1e-9, `the track's end by the pass is faded (${near.v} at ${near.x},${near.y})`);
    assert.ok(side.some(t => t.v === 1), 'and full strength farther out');
  }
  // no piece smaller than TRACK_MIN (pieces joined through sides and corners)
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!plan.dirt[i] || seen[i]) continue;
    const part = [i]; seen[i] = 1;
    for (let k = 0; k < part.length; k++) { const j = part[k], x = j % w, y = (j - x) / w; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = (y + dy) * w + x + dx; if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && plan.dirt[q] && !seen[q]) { seen[q] = 1; part.push(q); } } }
    assert.ok(part.length >= TRACK_MIN, `a piece of ${part.length} worn tiles`);
  }
});

test('the meadows and the rock\'s tone stay off the rock\'s edge, the water and the map\'s edge; crags only deep in a hill', () => {
  const rows = Array.from({ length: 30 }, (_, y) => Array.from({ length: 30 }, (_, x) => (x >= 8 && x < 20 && y >= 6 && y < 18 ? '#' : x >= 22 && y >= 22 ? '~' : '.')).join(''));
  rows[3] = rows[3].slice(0, 3) + 'S' + rows[3].slice(4); rows[26] = rows[26].slice(0, 3) + 'S' + rows[26].slice(4);
  const { w, h, rock, depth, plan } = handMap(rows, 3);
  const near = (x, y, f) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && f(Y * w + X)) return true; } return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (near(x, y, j => rock[j] || depth[j])) assert.ok(!plan.dry[i] && !plan.lush[i], `a meadow at ${x},${y}, beside rock or water`);
    if (!rock[i] || near(x, y, j => !rock[j]) || x === 0 || y === 0 || x === w - 1 || y === h - 1) assert.equal(plan.rockTone[i], 0, `the rock's tone at ${x},${y}, off the rock's inside`);
    if (plan.crag[i]) assert.ok(!near(x, y, j => !rock[j]), `a crag at ${x},${y} beside the hill's edge`);
  }
  assert.ok(plan.rockTone.some(v => v !== 0), 'the hill toned inside');
});

test('the plan of the e2e game\'s map hashes to the number test/e2e/ground.e2e.mjs expects in every browser', { skip }, () => {
  // (the random 64 map, seed 4242: the scenarios' game; a change to the plan updates both numbers on purpose)
  E.resetGameSeats(4242, 1, 0, 0, ['humans', 'humans'], [], [false, true], 0, 64);
  assert.equal(planHash(gamePlan()), 1000791099);
});
