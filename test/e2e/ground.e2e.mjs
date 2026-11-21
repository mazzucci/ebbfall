// The ground (src/client/gl/groundplan.js, render.js renderTerrain): a game starts with its meadows, worn tracks and
// yards and toned rock laid, the same plan bit for bit in every browser engine as in Node (test/groundplan.test.js),
// and no page error. Run: npm run build && node --test test/e2e/ground.e2e.mjs
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, DESKTOP, PHONE, ENGINE_NAME } from './harness.mjs';

before(start);
after(stop);

/** The plan's hash on the scenarios' map (the random 64 map, seed 4242): test/groundplan.test.js pins the same number. */
const PLAN_HASH = 1000791099;

for (const [label, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE]]) {
  test(`the ground is laid at a game's start on ${label} in ${ENGINE_NAME}: tracks, yards and crags drawn, the plan as Node's, no page error`, { engines: true }, async () => {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      const g = await d.eval(() => ({ ...endfall.ground(), mw: endfall.engine.MW, mh: endfall.engine.MH }));
      assert.deepEqual(g.size, [g.mw, g.mh], 'laid for this map');
      assert.equal(g.starts, 2, 'both starts of the map');
      assert.ok(g.worn > 20 && g.sprites > 20, `worn ground and its overlay tiles drawn (${g.worn} tiles, ${g.sprites} sprites)`);
      assert.equal(g.hash, PLAN_HASH, 'the same ground as every other browser');
      assert.ok(g.ms.total > 0 && g.ms.plan >= 0 && g.ms.shade >= 0, 'timed');
      await d.skip(2); // (a few frames drawn over it)
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}
