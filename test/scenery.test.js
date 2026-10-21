// The scenery scatter (src/client/scenery.js) on real maps from the WASM sim: deterministic and stable, solid props inside
// plateaus, flat props clear of the bases, resource fields and cliffs, spacing and density, and atlas sprites that fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mulberry } from '../src/engine/util.js';
import { MW, MH, TILE } from '../src/engine/constants.js';
import { scatterDoodads, DOODADS, SPACING, JITTER } from '../src/client/scenery.js';

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
const env = { MW, MH, TILE, mulberry };
const scatter = (seed, clear) => {
  E.resetGame(seed, 1);
  const cores = E.G.bldgs.filter(b => b.type === 'core').map(b => ({ tx: b.tx + b.w / 2, ty: b.ty + b.h / 2 }));
  return { list: scatterDoodads(E.G.seed, E.map, clear || cores, env), cores, map: E.map };
};
const SEEDS = [1, 2, 3, 4242, 99999];
const art = new URL('../public/art/', import.meta.url);
const frames = {};
for (const p of JSON.parse(readFileSync(new URL('atlas.json', art))).pages) Object.assign(frames, JSON.parse(readFileSync(new URL(p, art))).frames);

test('the scenery is the same every time for a seed and differs between seeds', { skip }, () => {
  assert.deepEqual(scatter(4242).list, scatter(4242).list);
  assert.notDeepEqual(scatter(4242).list, scatter(4243).list);
});

test('solid props stand inside plateaus; flat props stay clear of bases, fields and cliffs', { skip }, () => {
  for (const seed of SEEDS) {
    const { list, cores, map } = scatter(seed);
    const rock = (x, y) => map.rock[y * MW + x] !== 0;
    const around = (d, want) => [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => rock(d.tx + dx, d.ty + dy) === want));
    assert.ok(list.some(d => d.ground) && list.some(d => !d.ground), `seed ${seed}: both kinds of props`);
    for (const d of list) {
      if (!d.ground) { assert.ok(around(d, true), `seed ${seed}: ${d.name} at ${d.tx},${d.ty} is inside rock`); continue; }
      assert.ok(around(d, false), `seed ${seed}: ${d.name} at ${d.tx},${d.ty} is off the cliffs`);
      for (const c of cores) assert.ok(Math.hypot(c.tx - d.tx, c.ty - d.ty) >= 11, `seed ${seed}: ${d.name} clear of a base`);
      for (const n of map.nodes) assert.ok(Math.hypot(n.tx - d.tx, n.ty - d.ty) >= 4, `seed ${seed}: ${d.name} clear of a field`);
    }
  }
});

test('props keep their spacing and every map gets a fair number of each kind', { skip }, () => {
  for (const seed of SEEDS) {
    const { list } = scatter(seed);
    for (const kind of ['rock', 'ground']) {
      const own = list.filter(d => d.ground === (kind === 'ground'));
      assert.ok(own.length >= (kind === 'rock' ? 15 : 8), `seed ${seed}: ${own.length} ${kind} props`);
      for (const a of own) for (const b of own) if (a !== b) assert.ok(Math.hypot(a.tx - b.tx, a.ty - b.ty) >= SPACING[kind], `seed ${seed}: ${a.name} and ${b.name} too close`);
    }
  }
});

test('the plateau props do not move when the open-ground layout changes', { skip }, () => {
  // Every tile draws the same random numbers whatever happens, so keeping different ground clear leaves the rock
  // props exactly where they were.
  for (const seed of SEEDS) {
    const rock = (l) => l.filter(d => !d.ground);
    assert.deepEqual(rock(scatter(seed).list), rock(scatter(seed, []).list), `seed ${seed}`);
  }
});

test('the client places every prop in the atlas and nothing else', () => {
  const inAtlas = Object.keys(frames).filter(n => n.startsWith('doodad_')).sort();
  const placed = [...DOODADS.rock, ...DOODADS.ground].map(n => `doodad_${n}`).sort();
  assert.deepEqual(placed, inAtlas);
});

test('a ground prop stays inside its clear 3x3 cell', () => {
  for (const name of DOODADS.ground) {
    const f = frames[`doodad_${name}`], w = f.frame.w / 2, h = f.frame.h / 2; // the atlas is drawn at 2x
    const reach = Math.max(w * f.anchor.x, w * (1 - f.anchor.x), h * f.anchor.y, h * (1 - f.anchor.y)) + JITTER.ground;
    assert.ok(reach <= TILE * 1.5, `${name} reaches ${reach} px from its tile centre`);
  }
});
