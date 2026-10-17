// The Rust sim compiled to WASM, loaded in Node. Skipped when src/engine/pkg/ has not been built
// (run `npm run build:wasm`); CI sets ENDFALL_REQUIRE_WASM=1 so a missing build fails instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mulberry } from '../src/sim/util.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');

const load = async () => {
  const sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  return sim;
};

test('the WASM RNG matches the JS mulberry stream', { skip: !built && 'WASM not built' }, async () => {
  const sim = await load();
  for (const seed of [0, 1, 12345, 4242, 0xffffffff]) {
    const r = mulberry(seed);
    const js = Array.from({ length: 1000 }, () => r() * 4294967296);
    assert.deepEqual(Array.from(sim.rngSequence(seed, 1000)), js, 'seed ' + seed);
  }
});

test('the WASM game is deterministic', { skip: !built && 'WASM not built' }, async () => {
  const sim = await load();
  const run = (seed) => { const g = new sim.Game(seed); for (let i = 0; i < 2700; i++) g.step(); const h = [g.tick(), g.stateHash()]; g.free(); return h; };
  assert.deepEqual(run(4242), run(4242));
  assert.equal(run(4242)[0], 2700);
  assert.notEqual(run(1)[1], run(2)[1]);
});
