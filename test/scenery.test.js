// The scenery scatter (src/client/scenery.js) on real maps from the WASM sim: deterministic, tall props only inside
// plateaus, low props clear of the bases, resource fields and cliffs, and every prop has a sprite in the atlas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mulberry } from '../src/engine/util.js';
import { MW, MH, TILE } from '../src/engine/constants.js';
import { scatterDoodads, DOODADS } from '../src/client/scenery.js';

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
const scatter = (seed) => {
  E.resetGame(seed, 1);
  const cores = E.G.bldgs.filter(b => b.type === 'core');
  return { list: scatterDoodads(E.G.seed, E.map, cores, env), cores, map: E.map };
};

test('the scenery is the same every time for a seed and differs between seeds', { skip }, () => {
  assert.deepEqual(scatter(4242).list, scatter(4242).list);
  assert.notDeepEqual(scatter(4242).list, scatter(4243).list);
});

test('tall props stand inside plateaus; low props stay clear of bases, fields and cliffs', { skip }, () => {
  for (const seed of [1, 2, 3, 4242, 99999]) {
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

test('every prop has a sprite in the atlas', () => {
  const art = new URL('../public/art/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('atlas.json', art)));
  const frames = new Set(index.pages.flatMap(p => Object.keys(JSON.parse(readFileSync(new URL(p, art))).frames)));
  for (const name of [...DOODADS.rock, ...DOODADS.ground]) assert.ok(frames.has(`doodad_${name}`), name);
});
