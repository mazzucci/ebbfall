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

test('the client reads the sim\'s tables and adds a hotkey and a description to every kind', { skip }, () => {
  const d = JSON.parse(sim.dataJson());
  assert.deepEqual(Object.keys(C.UNITS), Object.keys(d.units), 'units in the sim\'s order (the snapshot sends kind indices)');
  assert.deepEqual(Object.keys(C.BUILDINGS), Object.keys(d.buildings), 'buildings in the sim\'s order');
  assert.deepEqual(C.UNITS.vanguard.cost, d.units.vanguard.cost, 'pkg/data.js is current (rebuild with npm run build:wasm)');
  for (const [k, u] of [...Object.entries(C.UNITS), ...Object.entries(C.BUILDINGS)]) {
    assert.ok(u.name && /^[A-Z]$/.test(u.hot) && u.desc, `${k} has a name, a hotkey and a description`);
  }
  for (const [k, b] of Object.entries(C.BUILDINGS)) { // hotkeys within one card do not collide (Rally R, Cancel X)
    const keys = [...b.trains.map(t => C.UNITS[t].hot), ...(b.trains.length ? ['R', 'X'] : [])];
    assert.equal(new Set(keys).size, keys.length, `${k}: training hotkeys`);
  }
  for (const f of Object.values(C.FACTIONS)) {
    const page = (ks) => ks.map(k => C.BUILDINGS[k].hot);
    for (const ks of [f.buildBasic, f.buildAdvanced]) assert.equal(new Set(page(ks)).size, ks.length, 'Build page hotkeys');
    assert.ok(C.UNITS[f.worker].worker && C.BUILDINGS[f.hq].hq, 'the faction names its worker and headquarters');
  }
  assert.deepEqual(C.DIFF.map(x => x.name), ['Easy', 'Medium', 'Hard']);
  assert.match(C.UPGRADES.weapons.desc, /Trooper \+1.*Turret \+2/, 'the Weapons description is built from the tables');
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
  let booms = 0, shots = 0;
  for (let i = 0; i < 30 * 900 && !E.G.over; i++) {
    E.step();
    for (const e of E.G.events) { if (e.t === 'burst' && e.n >= 24) booms++; if (e.t === 'fire' && typeof e.x === 'number' && e.w) shots++; }
    E.G.events.length = 0;
  }
  assert.ok(E.G.bldgs.filter(b => b.team === E.ENEMY).length > 3, 'AI built structures');
  assert.ok(E.G.over, 'game ended within 15 minutes');
  assert.equal(E.G.winner, E.ENEMY);
  assert.ok(booms >= 1, 'buildings blew up');
  assert.ok(shots >= 10, 'shots reach the client with a position and a weapon, for the sound');
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
    for (let i = 0; i < 30 * 40; i++) { S.step(S.DT); for (const e of G.events) if (e.t === 'toast' && /Ether Rig/.test(e.msg)) toasts++; G.events.length = 0; }
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
  const core = E.G.bldgs.find(b => b.team === E.PLAYER && b.type === 'core');
  const vent = E.map.nodes.filter(n => n.type === 'ether').sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0]; // the player's own vent
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

test('the WASM sim agrees with the native one: the same golden hashes (crates/endfall-sim/tests/golden.rs)', { skip }, () => {
  // ashen-easy and glass-medium-swapped at 10 s and 1.5 min: browsers on any machine must compute the same game.
  for (const [seed, diff, map, side, want, race] of [[4242, 0, 0, 0, [2837662687, 2165983458], 0], [1998, 1, 1, 1, [4033544991, 4008581887], 0], [4242, 1, 0, 0, [1095254690, 1576671732], 1]]) {
    const g = sim.Game.withSetup(seed, diff, map, side, race, 0), got = []; // (race 1: a Vael player, golden_hashes_pin_a_vael_game)
    for (let t = 1; t <= 2700; t++) { g.step(); if (t === 300 || t === 2700) got.push(g.stateHash() >>> 0); }
    g.free();
    assert.deepEqual(got, want, `seed ${seed}`);
  }
});

test('the client mirror reads every snapshot field the sim declares (crates/endfall-sim/src/snapshot.rs)', () => {
  const src = readFileSync(new URL('../src/engine/core.js', import.meta.url), 'utf8');
  const by = { unit: 'fu', bldg: 'fb', proj: 'fp', node: 'fn', info: 'fi' };
  for (const [rec, v] of Object.entries(by)) {
    for (const f of C.SCHEMA[rec]) {
      if (/^q[1-9]$/.test(f)) continue; // queue slots: read as q0 + k
      assert.ok(src.includes(`${v}.${f}`), `core.js does not read ${rec}.${f}`);
    }
  }
});

test('the upgrade levels follow the info record, both teams, in the schema\'s order', { skip }, () => {
  E.resetGame(3, 1);
  const n = C.SCHEMA.upgrades.length;
  assert.deepEqual(Object.keys(C.UPGRADES), C.SCHEMA.upgrades);
  for (const k of C.SCHEMA.upgrades) assert.ok(['weapons', 'armor', 'shields'].includes(C.UPGRADES[k].effect), k + ' has an effect the client knows');
  assert.deepEqual(E.G.upgrades, [0, 1].map(() => Object.fromEntries(C.SCHEMA.upgrades.map(k => [k, 0]))));
  assert.equal(C.effectLevel({ weapons: 2, armor: 1 }, 'weapons'), 2);
  assert.ok(n >= 2);
});

test('the client names no seat: it plays G.me, whichever team that is', () => {
  for (const f of ['main.js', 'client/hud.js', 'client/card.js', 'client/ui.js', 'client/input.js', 'client/tools.js', 'client/gl/render.js', 'client/menu.js', 'client/audio.js', 'client/fx.js', 'client/icons.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\b(PLAYER|ENEMY)\b|team [!=]== [01]\b|team = [01]\b/, `${f} names a fixed team`);
  }
});

test('the client reads its seat, and each seat\'s stats, from the game', { skip }, () => {
  E.resetGame(4, 0);
  assert.equal(E.G.me, 0);
  assert.equal(E.G.stats.length, 2);
  assert.ok(E.visibleEnt(E.G.bldgs.find(b => b.team === E.G.me)), 'its own buildings are always visible');
});

test('the client names no unit or building kind outside its data tables and look table', () => {
  // Kind-specific behaviour lives in the sim's flags (worker, hq, onVent, researches...) and src/client/look.js.
  for (const f of ['client/hud.js', 'client/card.js', 'client/ui.js', 'client/input.js', 'client/tools.js', 'client/gl/render.js', 'client/audio.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    for (const k of [...Object.keys(C.UNITS), ...Object.keys(C.BUILDINGS)]) assert.ok(!src.includes(`=== '${k}'`) && !src.includes(`!== '${k}'`), `${f} tests for '${k}'`);
  }
});
