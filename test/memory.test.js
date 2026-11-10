// What this side remembers of enemy buildings (src/client/memory.js): the client must never draw, map or let one pick an
// enemy building it does not see; in the fog only the last-seen
// state. The field (gl/render.js), the minimap and picking (input.js) all draw from `shownBldgs`. On the WASM sim in
// Node; skipped when src/engine/pkg/ has not been built (as engine.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';

let E, M;
if (built) {
  const sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  E = await import('../src/engine/core.js');
  M = await import('../src/client/memory.js');
}
/** Step the game `s` seconds, the client noting what it sees every frame (as the renderer does). */
const run = (s) => { for (let i = 0; i < s * 30; i++) { E.step(); M.noteBuildings(); } };

test('an enemy Market: not shown until seen, then its last-seen ghost, even after it falls out of sight, until its ground is seen again', { skip }, () => {
  // Three seats on 96x96, each its own: seat 1 the AI (it raises a Market, then stops: the scene holds still), seat 2
  // idle, we are seat 0.
  E.resetGameSeats(31, 1, 0, 0, ['humans', 'humans', 'humans'], [], [false, true, false], 0, 96);
  M.resetMemory();
  const shown = (id) => M.shownBldgs().find(b => b.id === id);
  let ext = null;
  for (let t = 0; t < 400 && !ext; t++) { run(1); ext = E.G.bldgs.find(b => b.team === 1 && b.type === 'extractor'); }
  assert.ok(ext, 'the AI placed a Market');
  E.disableAi();
  const at = E.idx(ext.tx, ext.ty);
  assert.equal(E.G.vis[at], 0, 'not in sight');
  run(1);
  assert.equal(shown(ext.id), undefined, 'not drawn, mapped or picked: never seen');
  // One of ours looks: the live building.
  const scout = E.debugSpawn(0, 'trooper', ext.x + 70, ext.y);
  E.holdUnit(E.G.units.find(u => u.id === scout));
  run(1);
  assert.ok(shown(ext.id) && !shown(ext.id).ghost, 'seen: the live one');
  // It walks away: the ghost, as it was last seen.
  E.moveTo(E.G.units.find(u => u.id === scout), ext.x > 1536 ? 200 : E.WW - 200, ext.y);
  run(25);
  assert.equal(E.G.vis[at], 0, 'out of sight again');
  const g = shown(ext.id);
  assert.ok(g && g.ghost && g.type === 'extractor' && g.team === 1 && g.tx === ext.tx, 'its ghost, as last seen');
  // Destroyed out of sight (seat 2's Archers, which give us no sight): the ghost stays.
  const killers = [0, 1, 2, 3, 4, 5, 6, 7].map(i => E.debugSpawn(2, 'lancer', ext.x + 40, ext.y + 20 * (i - 3)));
  for (let t = 0; t < 60 && E.G.bldgs.some(b => b.id === ext.id); t++) run(1);
  assert.ok(!E.G.bldgs.some(b => b.id === ext.id), 'seat 2 destroyed it');
  assert.equal(E.G.vis[at], 0, 'unseen by us');
  assert.ok(shown(ext.id)?.ghost, 'still its ghost: we did not see it fall');
  for (const id of killers) { const u = E.G.units.find(x => x.id === id); if (u) E.moveTo(u, ext.x, ext.y + 400); }
  // We look again: gone.
  const back = E.debugSpawn(0, 'trooper', ext.x + 70, ext.y);
  E.holdUnit(E.G.units.find(u => u.id === back));
  run(1);
  assert.ok(E.G.vis[at] === 1, 'in sight again');
  assert.equal(shown(ext.id), undefined, 'the ghost forgotten: its ground seen empty');
});

test('our own and our allies\' buildings are always live; an enemy building in sight is live', { skip }, () => {
  E.resetGameSeats(31, 1, 0, 0, ['humans', 'vael', 'humans', 'vael'], [0, 0, 1, 1], [false, false, false, false], 0, 96);
  M.resetMemory();
  run(1);
  const ids = new Set(M.shownBldgs().map(b => b.id));
  for (const b of E.G.bldgs) {
    if (b.team === 0 || b.team === 1) assert.ok(ids.has(b.id), `seat ${b.team}'s ${b.type}: ours or an ally's`);
    else assert.equal(ids.has(b.id), E.visibleEnt(b), `seat ${b.team}'s ${b.type}: an enemy's only in sight`);
  }
});
