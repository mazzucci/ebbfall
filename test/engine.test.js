// The Rust sim compiled to WASM, loaded in Node through src/engine/core.js (the surface the client uses).
// Skipped when src/engine/pkg/ has not been built (run `npm run build:wasm`); CI sets ENDFALL_REQUIRE_WASM=1
// so a missing build fails instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mulberry } from '../src/engine/util.js';
import * as C from '../src/engine/constants.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';

let sim, E;
if (built) {
  sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  E = await import('../src/engine/core.js');
}
const runSeconds = (s) => { for (let i = 0; i < s * 30; i++) E.step(); };

test('the WASM RNG matches the JS mulberry stream', { skip }, () => {
  for (const seed of [0, 1, 12345, 4242, 0xffffffff]) {
    const r = mulberry(seed);
    const js = Array.from({ length: 1000 }, () => r() * 4294967296);
    assert.deepEqual(Array.from(sim.rngSequence(seed, 1000)), js, 'seed ' + seed);
  }
});

test('hypot matches V8 Math.hypot bit for bit', { skip }, () => {
  const r = mulberry(7);
  for (let i = 0; i < 20000; i++) {
    const a = (r() - 0.5) * 4096 * (i % 3 ? 1 : 1e-3), b = (r() - 0.5) * 4096 * (i % 5 ? 1 : 1e3);
    assert.equal(sim.jsHypot(a, b), Math.hypot(a, b), `hypot(${a}, ${b})`);
  }
});

test('the Rust data tables match the client constants', { skip }, () => {
  const d = JSON.parse(sim.dataJson());
  for (const [k, u] of Object.entries(C.UNITS)) {
    const r = d.units[k]; assert.ok(r, k);
    for (const f of ['cost', 'supply', 'hp', 'armor', 'speed', 'range', 'dmg', 'dmgAir', 'cd', 'sight', 'r', 'build']) assert.deepEqual(r[f], u[f], `${k}.${f}`);
    assert.equal(r.melee, !!u.melee, k + '.melee'); assert.equal(r.proj, u.proj ?? null, k + '.proj');
    assert.equal(r.air, !!u.air, k + '.air'); assert.equal(r.bio, !!u.bio, k + '.bio'); assert.equal(r.heal, u.heal ?? 0, k + '.heal'); assert.equal(r.req, u.req ?? null, k + '.req');
  }
  for (const [k, b] of Object.entries(C.BUILDINGS)) {
    const r = d.buildings[k]; assert.ok(r, k);
    for (const f of ['name', 'cost', 'w', 'h', 'hp', 'armor', 'build', 'sight']) assert.deepEqual(r[f], b[f], `${k}.${f}`);
    assert.equal(r.supply, b.supply ?? 0, k + '.supply'); assert.deepEqual(r.trains, b.trains ?? [], k + '.trains');
    assert.equal(r.dropoff, !!b.dropoff); assert.equal(r.onVent, !!b.onVent); assert.equal(r.req, b.req ?? null);
    assert.equal(r.range, b.range ?? 0); assert.equal(r.dmg, b.dmg ?? 0); assert.equal(r.dmgAir, b.dmgAir ?? 0); assert.equal(r.cd, b.cd ?? 0); assert.equal(r.proj, b.proj ?? null);
  }
  assert.deepEqual(d.diff, C.DIFF.map(({ name, ...rest }) => rest));
  for (const [k, u] of Object.entries(C.UPGRADES)) { assert.deepEqual(d.upgrades[k].cost, u.cost, k + ' cost'); assert.deepEqual(d.upgrades[k].time, u.time, k + ' time'); }
  for (const [k, u] of Object.entries(d.units)) assert.equal(u.upDmg, C.UP_DMG[k] ?? 0, k + ' upDmg');
  assert.equal(d.buildings.turret.upDmg, C.UP_DMG.turret);
  assert.deepEqual(d.bases, C.BASES);
});

test('a fresh game has two cores, eight harvesters and resource nodes', { skip }, () => {
  E.resetGame(12345, 1);
  assert.equal(E.G.bldgs.length, 2);
  assert.equal(E.G.units.length, 8);
  assert.ok(E.map.nodes.length > 20);
  assert.deepEqual(E.G.sup[E.PLAYER], [4, 10]);
  assert.ok(E.G.units.every(u => u.task.t === 'gather' && u.task.node && u.task.node.kind === 'node'));
});

test('harvesters bring shards home and entity objects keep their identity', { skip }, () => {
  E.resetGame(777, 1);
  const first = E.G.units[0];
  runSeconds(60);
  assert.ok(E.G.res[E.PLAYER][0] > 50, 'income after a minute: ' + E.G.res[E.PLAYER][0]);
  assert.equal(E.G.units[0], first);
  assert.equal(first.dead, false);
});

test('the same seed and orders produce the same state hash', { skip }, () => {
  const play = () => {
    E.resetGame(4242, 2);
    for (let i = 0; i < 30 * 90; i++) {
      E.step();
      if (i === 30 * 20) { const core = E.G.bldgs.find(b => b.team === E.PLAYER); E.queueUnit(core, 'harvester'); }
      if (i === 30 * 40) { const u = E.G.units.find(x => x.team === E.PLAYER); const e = E.G.bldgs.find(b => b.team === E.ENEMY); E.attackMove(u, e.x, e.y); }
    }
    return E.stateHash();
  };
  assert.equal(play(), play());
});

test('placing a depot costs 100 shards and a harvester builds it', { skip }, () => {
  E.resetGame(99, 0);
  E.setResources(E.PLAYER, 500, 0);
  const core = E.G.bldgs.find(b => b.team === E.PLAYER);
  const h = E.G.units.find(u => u.team === E.PLAYER);
  let placed = null;
  for (let r = 3; r < 9 && !placed; r++) for (let a = 0; a < 12 && !placed; a++) {
    const tx = Math.round(core.tx + 2 + Math.cos(a / 12 * 6.28) * r - 1), ty = Math.round(core.ty + 2 + Math.sin(a / 12 * 6.28) * r - 1);
    if (E.canPlace('depot', tx, ty, E.PLAYER)) { assert.equal(E.placeBuilding(E.PLAYER, 'depot', tx, ty, h), null); placed = { tx, ty }; }
  }
  assert.ok(placed);
  assert.equal(E.G.res[E.PLAYER][0], 400);
  assert.equal(h.task.t, 'build');
  runSeconds(45);
  const depot = E.G.bldgs.find(b => b.type === 'depot' && b.team === E.PLAYER);
  assert.ok(depot && depot.done, 'depot finished');
  assert.equal(E.G.sup[E.PLAYER][1], 18);
});

test('orders report errors and a rally point shows up on the building', { skip }, () => {
  E.resetGame(5, 1);
  const core = E.G.bldgs.find(b => b.team === E.PLAYER);
  assert.match(E.placeBuilding(E.PLAYER, 'forge', core.tx, core.ty, null), /Cannot build there/);
  E.setResources(E.PLAYER, 0, 0);
  assert.match(E.queueUnit(core, 'harvester'), /Not enough shards/);
  E.setRally(core, 100, 200, E.map.nodes[0]);
  assert.deepEqual(core.rally, { x: 100, y: 200, node: E.map.nodes[0] });
});

test('the AI ends the game against an idle player, and events reach the client', { skip }, () => {
  E.resetGame(31337, 2);
  let booms = 0;
  for (let i = 0; i < 30 * 900 && !E.G.over; i++) {
    E.step();
    for (const e of E.G.events) if (e.t === 'sfx' && e.name === 'boom') booms++;
    E.G.events.length = 0;
  }
  assert.ok(E.G.bldgs.filter(b => b.team === E.ENEMY).length > 3, 'AI built structures');
  assert.ok(E.G.over, 'game ended within 15 minutes');
  assert.equal(E.G.winner, E.ENEMY);
  assert.ok(booms >= 1, 'buildings blew up');
  assert.ok(E.G.units.every(u => !u.dead));
});

test('a harvester whose last node is a vent without an extractor goes idle instead of getting stuck', { skip }, () => {
  // Reproduces the review finding: resume after building, with last_node = an ether vent and no extractor.
  for (const S of [E]) {
    S.resetGame(7, 1);
    S.setResources(E.PLAYER, 1000, 0);
    const G = S.G, core = G.bldgs.find(b => b.team === S.PLAYER), vent = S.map.nodes.find(n => n.type === 'ether');
    const h = G.units.find(u => u.team === S.PLAYER);
    S.startGather(h, vent); // refused (no extractor), last node unchanged
    let placed = false;
    for (let r = 3; r < 9 && !placed; r++) for (let a = 0; a < 12 && !placed; a++) {
      const tx = Math.round(core.tx + 2 + Math.cos(a / 12 * 6.28) * r - 1), ty = Math.round(core.ty + 2 + Math.sin(a / 12 * 6.28) * r - 1);
      if (S.canPlace('depot', tx, ty, S.PLAYER)) placed = !S.placeBuilding(S.PLAYER, 'depot', tx, ty, h);
    }
    assert.ok(placed);
    let toasts = 0;
    for (let i = 0; i < 30 * 40; i++) { S.step(S.DT); for (const e of G.events) if (e.t === 'toast' && /Extractor/.test(e.msg)) toasts++; G.events.length = 0; }
    assert.ok(toasts <= 1, `${S === E ? 'rust' : 'js'}: ${toasts} extractor toasts`);
    assert.notEqual(G.units.find(u => u.id === h.id).task.t, 'build');
  }
});

test('out-of-range teams are rejected without poisoning the game', { skip }, () => {
  E.resetGame(3, 1);
  assert.equal(E.canAfford(2, [0, 0]), false);
  assert.equal(E.canPlace('depot', 10, 10, 9), false);
  assert.match(E.placeBuilding(5, 'depot', 10, 10, null), /team/);
  E.step(); E.resetGame(4, 1);
  assert.equal(E.G.units.length, 8);
});

test('an extractor knows its vent, and harvesters ordered to the vent mine ether', { skip }, () => {
  E.resetGame(11, 1);
  E.setResources(E.PLAYER, 1000, 0);
  const vent = E.map.nodes.filter(n => n.type === 'ether').sort((a, b) => a.y - b.y).pop(); // the player's (south) vent
  const hs = E.G.units.filter(u => u.team === E.PLAYER);
  assert.equal(E.placeBuilding(E.PLAYER, 'extractor', vent.tx, vent.ty, hs[0]), null);
  const ext = E.G.bldgs.find(b => b.type === 'extractor');
  assert.equal(ext.vent, vent);
  runSeconds(60); // walk over, then 25 s of construction
  assert.ok(ext.done, 'extractor built');
  for (const h of hs) E.startGather(h, ext.vent);
  runSeconds(40);
  assert.ok(E.G.res[E.PLAYER][1] > 0, 'ether mined: ' + E.G.res[E.PLAYER][1]);
});
