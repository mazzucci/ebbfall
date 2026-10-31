// The Rust sim compiled to WASM, loaded in Node through src/engine/core.js (the surface the client uses).
// Skipped when src/engine/pkg/ has not been built (run `npm run build:wasm`); CI sets ENDFALL_REQUIRE_WASM=1
// so a missing build fails instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mulberry } from '../src/engine/util.js';
import { GOLDEN, playGolden } from '../src/engine/golden.js';
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
  assert.deepEqual(C.DIFF.map(x => x.name), ['Easy', 'Medium', 'Hard', 'Brutal']);
  assert.match(C.UPGRADES.weapons.desc, /Trooper \+1.*Turret \+2/, 'the Weapons description is built from the tables');
});

test('every fighter names what it beats and what beats it, in real kinds', { skip }, () => {
  for (const [k, u] of Object.entries(C.UNITS)) {
    const fighter = !!u.weapon && !u.worker;
    // (counters for fighters only; a fighter may go without, as the Umbra does: players work its counters out)
    if (!fighter) assert.ok(!u.strong && !u.weak, `${k}: counters for fighters only`);
    else assert.equal(!!u.strong?.length, !!u.weak?.length, `${k}: both lists or neither`);
    for (const o of [...(u.strong || []), ...(u.weak || [])]) assert.ok(C.UNITS[o] && o !== k, `${k}: ${o} is another unit`);
    assert.ok(!(u.strong || []).some(o => (u.weak || []).includes(o)), `${k}: nothing both`);
    for (const o of u.strong || []) if (C.UNITS[o].strong) assert.ok(C.UNITS[o].weak.includes(k), `${o} lists ${k} as a weakness (${k} is strong against it)`);
  }
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

test('a game on a larger map mirrors its size, and the next game its own', { skip }, () => {
  // M4: maps of 64 to 128 tiles across (the menus offer 64x64 only for now); the client's grids follow each game.
  const sized = (seed, size) => {
    E.resetGame(seed, 1, 0, 0, 'humans', 'humans', size);
    assert.deepEqual([E.MW, E.MH, E.WW, E.WH], [size, size, size * E.TILE, size * E.TILE], `${size}: the map's size`);
    for (const grid of [E.map.rock, E.map.shade, E.map.occ, E.G.vis, E.G.explored]) assert.equal(grid.length, size * size);
    assert.deepEqual(E.map.rock, Uint8Array.from(E.liveGame().rock()), `${size}: the rock as the sim has it`);
    for (const b of E.G.bldgs) assert.ok(E.inMap(b.tx + 3, b.ty + 3) && E.G.vis[E.idx(b.tx + 1, b.ty + 1)] === +(b.team === E.G.me), `${size}: a base on the map, ours in sight`);
    return E.G.bldgs.some(b => b.tx > 64 || b.ty > 64);
  };
  assert.equal(sized(4242, 64), false);
  assert.ok(sized(4242, 128), 'a base past the 64x64 corner');
  E.step(); assert.equal(E.G.vis.length, 128 * 128);
  assert.ok(sized(77, 96));
  sized(4242, 64); sized(4242, 64); // (back, twice: nothing kept from the larger games)
  E.resetGame(4242, 1);
  assert.equal(E.MW, 64, 'a menu game is 64x64');
  for (const n of [256, 97, 100]) assert.throws(() => E.resetGame(1, 1, 0, 0, 'humans', 'humans', n), /64, 96 or 128/, `size ${n}`);
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

test('the WASM sim agrees with the native one: every golden game, to 5 min (src/engine/golden.js)', { skip }, async () => {
  // Browsers on any machine must compute the same game; CI also runs these in Firefox and WebKit, phones at selftest.html.
  for (const g of GOLDEN) assert.deepEqual(await playGolden(sim, g), g.want, g.name);
});

test('the golden table the browsers check is golden.rs\'s', () => {
  const rs = readFileSync(new URL('../crates/endfall-sim/tests/golden.rs', import.meta.url), 'utf8');
  for (const g of GOLDEN) assert.ok(rs.includes(`[${g.want.join(', ')}]`), `${g.name}: ${g.want} is not in golden.rs`);
  for (const name of GOLDEN.map(g => g.name).filter(n => !n.startsWith('vael'))) assert.ok(rs.includes(`"${name}"`), `golden.rs has no game ${name}`);
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
  for (const f of C.SCHEMA.seat) assert.ok(src.includes(`at('${f}')`), `core.js does not read seat.${f}`); // (per seat, by name)
});

test('the upgrade levels follow the seat records, every seat\'s, in the schema\'s order', { skip }, () => {
  E.resetGame(3, 1);
  const n = C.SCHEMA.upgrades.length;
  assert.deepEqual(Object.keys(C.UPGRADES), C.SCHEMA.upgrades);
  for (const k of C.SCHEMA.upgrades) assert.ok(['weapons', 'armor', 'shields', 'unlock', 'speed', 'build'].includes(C.UPGRADES[k].effect), k + ' has an effect the client knows');
  // A tech names what it unlocks or speeds up (a construction tech, its side's building), has one level and words of
  // its own; each ability's tech is found.
  for (const [k, u] of Object.entries(C.UPGRADES).filter(([, u]) => u.levels === 1)) {
    if (u.effect === 'build') assert.ok(C.TECH_BUILD > 1 && /faster/.test(u.desc), `${k} says how much faster`);
    else assert.ok(u.effect === 'unlock' ? C.ABILITIES[u.of] : C.UNITS[u.of], `${k} names a real ${u.effect === 'unlock' ? 'ability' : 'unit'}`);
    assert.ok(u.desc && u.hot, `${k} has words and a key`);
  }
  // A line unit's ability is there from the start; a heavy unit's waits for its tech (the Siege Tank's Deploy is how it
  // fires at all: no tech).
  assert.deepEqual(Object.keys(C.ABILITIES).map(a => [a, C.unlockOf(a)]), [['stim', null], ['entrench', 'entrenching'], ['blink', null], ['overcharge', 'overchargeCore'], ['cloak', 'cloakingField'], ['veil', 'veilWeave'], ['deploy', null]]);
  assert.deepEqual(E.G.upgrades, [0, 1].map(() => Object.fromEntries(C.SCHEMA.upgrades.map(k => [k, 0]))));
  assert.equal(C.effectLevel({ weapons: 2, armor: 1 }, 'weapons'), 2);
  assert.ok(n >= 2);
});

test('the client names no seat: it plays G.me, whichever team that is', () => {
  for (const f of ['main.js', 'client/hud.js', 'client/card.js', 'client/ui.js', 'client/input.js', 'client/tools.js', 'client/gl/render.js', 'client/menu.js', 'client/audio.js', 'client/fx.js', 'client/icons.js', 'client/scout.js', 'client/online.js', 'net/net.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\b(PLAYER|ENEMY)\b|team [!=]== [01]\b|team = [01]\b|1 - G\.me/, `${f} names a fixed team`);
  }
});

test('the client reads its seat, and each seat\'s stats, from the game', { skip }, () => {
  E.resetGame(4, 0);
  assert.equal(E.G.me, 0);
  assert.equal(E.G.stats.length, 2);
  assert.ok(E.visibleEnt(E.G.bldgs.find(b => b.team === E.G.me)), 'its own buildings are always visible');
  // Each seat its own team: the enemies are the other seat; the winner is a team.
  assert.deepEqual([E.G.teams, E.G.out, E.foes(), E.enemies(0, 1), E.enemies(1, 1)], [[0, 1], [false, false], [1], true, false]);
});

test('a room\'s RANDOM seat is drawn from its seed and seat: the same on every client, either race', { skip }, () => {
  const keys = Object.keys(C.FACTIONS), seen = [new Set(), new Set()];
  for (let seed = 1; seed <= 200; seed++) {
    const r = E.seatRaces(['random', 'random'], seed, keys);
    assert.deepEqual(E.seatRaces(['random', 'random'], seed, keys), r, 'the same draw every time');
    r.forEach((k, i) => { assert.ok(keys.includes(k), k); seen[i].add(k); });
  }
  assert.deepEqual(seen.map(s => s.size), [keys.length, keys.length], 'each seat draws every race over many rooms');
  assert.ok([...Array(50).keys()].some(seed => { const [x, y] = E.seatRaces(['random', 'random'], seed + 1, keys); return x !== y; }), 'the seats draw apart');
  assert.deepEqual(E.seatRaces(['vael', 'humans'], 7, keys), ['vael', 'humans'], 'a chosen race stays');
  // Both seats' games: the same factions, the drawn ones (never a silent Humans).
  const vael = [...Array(100).keys()].map(i => i + 1).find(seed => E.seatRaces(['humans', 'random'], seed, keys)[1] === 'vael');
  const factions = [0, 1].map(me => { E.resetGameForSeat(4242, 0, 0, E.seatRaces(['humans', 'random'], vael, keys), me); return E.G.factions.slice(); });
  assert.deepEqual(factions, [['humans', 'vael'], ['humans', 'vael']]);
  assert.throws(() => E.resetGameForSeat(4242, 0, 0, ['humans', 'random'], 0), /drawn first/, 'an undrawn RANDOM is not taken for the Humans');
  assert.throws(() => E.resetGame(4, 0, 0, 0, 'random'), /no race random/, 'a single player\'s RANDOM is drawn by the menu, not taken for the Humans');
});

test('a game for any number of seats takes a setup it can play and refuses the rest', { skip }, () => {
  const seats = (f, t, ai, me) => sim.Game.withSeats(9, 1, 0, 0, Uint32Array.from(f), Uint8Array.from(t), Uint8Array.from(ai), me);
  assert.throws(() => seats([0, 1, 0], [], [], 0), /3 seats/, 'more seats than the map has starts');
  assert.throws(() => seats([0, 1], [0, 0], [], 0), /Teams/, 'one team');
  assert.throws(() => seats([0, 1], [], [], 2), /seat/, 'no such seat');
  const a = seats([0, 1], [0, 1], [0, 1], 0), b = sim.Game.withSetup(9, 1, 0, 0, 0, 1);
  for (let i = 0; i < 300; i++) { a.step(); b.step(); }
  assert.equal(a.stateHash(), b.stateHash(), 'two seats: the same game as before');
  a.free(); b.free();
});

test('a game of four seats on a four-start map mirrors every seat\'s record', { skip }, () => {
  const races = ['humans', 'vael', 'humans', 'vael'];
  assert.throws(() => E.resetGameSeats(31, 1, 0, 0, [...races, 'humans'], [], [], 0, 96), /5 seats: a 96x96 map has 4 starts/);
  E.resetGameSeats(31, 1, 0, 0, races, [0, 0, 1, 1], [false, true, true, true], 0, 96);
  assert.deepEqual([E.MW, E.MH, E.G.me], [96, 96, 0]);
  assert.deepEqual([E.G.factions, E.G.teams, E.G.out], [races, [0, 0, 1, 1], [false, false, false, false]]);
  for (const k of ['res', 'sup', 'stats', 'upgrades']) assert.equal(E.G[k].length, 4, k + ' per seat');
  assert.deepEqual(E.foes(), [2, 3], 'the other team');
  for (let t = 0; t < 4; t++) {
    const hq = E.G.bldgs.filter(b => b.team === t && b.d.hq);
    assert.equal(hq.length, 1, `seat ${t}'s headquarters`);
    assert.equal(hq[0].type, C.FACTIONS[races[t]].hq);
    assert.equal(E.G.units.filter(u => u.team === t).length, 4, `seat ${t}'s workers`);
  }
  const cores = [0, 1, 2, 3].map(t => E.G.bldgs.find(b => b.team === t).tx).sort((a, b) => a - b);
  assert.ok(new Set(cores).size >= 2, 'four starts, not one');
  runSeconds(30);
  assert.ok(E.G.res[0][0] > 50 && E.G.stats.slice(1).every(s => s.built > 0), 'the person mines, the AIs train');
  E.resetGame(4, 0); // (back to a duel's map for the tests after)
  assert.deepEqual([E.MW, E.G.teams.length], [64, 2]);
});

/** The client's view of the world as plain data: every mirrored field of every entity (references by id). */
function view() {
  const { G, map } = E, id = (e) => e ? e.id : null;
  return JSON.stringify({
    tick: G.tick, time: G.time, over: G.over, winner: G.winner, out: G.out, res: G.res, sup: G.sup, stats: G.stats, upgrades: G.upgrades,
    vis: Array.from(G.vis), explored: Array.from(G.explored), occ: Array.from(map.occ),
    units: G.units.map(u => ({ id: u.id, type: u.type, team: u.team, x: u.x, y: u.y, hp: u.hp, maxhp: u.maxhp, sh: u.sh, maxsh: u.maxsh, r: u.r, face: u.face, flash: u.flash, carry: u.carry, carryType: u.carryType, cd: u.cd, abCd: u.abCd, boost: u.boost, mode: u.mode, swap: u.swap, warp: u.warp, hid: u.hid, cloaked: u.cloaked, task: { t: u.task.t, phase: u.task.phase, node: id(u.task.node), b: id(u.task.b), target: id(u.task.target) }, dead: u.dead })),
    bldgs: G.bldgs.map(b => ({ id: b.id, type: b.type, team: b.team, hp: b.hp, sh: b.sh, planted: b.planted, powered: b.powered, progress: b.progress, done: b.done, prog: b.prog, flash: b.flash, aim: b.aim, rally: b.rally && { x: b.rally.x, y: b.rally.y, node: id(b.rally.node) }, queue: b.queue, research: b.research, vent: id(b.vent), dead: b.dead })),
    nodes: map.nodes.map(n => ({ id: n.id, amount: n.amount, miners: n.miners, extractor: id(n.extractor) })),
    projs: G.projs,
  });
}

test('advance() then one read of G is the same as step() after step(): the same world, every tick\'s events, the dead let go', { skip }, () => {
  const setup = () => E.resetGameSeats(77, 2, 0, 0, ['humans', 'vael', 'vael', 'humans'], [], [true, true, true, true], 0, 96);
  const runs = [], TICKS = 30 * 240, chunk = (k) => 1 + (k * 5) % 7; // (1 to 7 ticks between reads)
  // Eagerly mirrored: a step, its events; the world and the events since the last read at each read of the other run.
  setup();
  let events = [];
  for (let t = 0, k = 0, next = chunk(0); t < TICKS; t++) {
    E.step(); events.push(...E.G.events); E.G.events.length = 0;
    if (t + 1 === next || t + 1 === TICKS) { runs.push({ hash: E.stateHash(), view: view(), events: JSON.stringify(events) }); events = []; next += chunk(++k); }
  }
  // Lazily: several ticks, then one read.
  setup();
  const held = new Map(); let i = 0, fights = 0;
  for (let t = 0, k = 0; t < TICKS; k++) {
    const n = Math.min(chunk(k), TICKS - t);
    for (let j = 0; j < n; j++) assert.ok(E.advance());
    t += n;
    const r = runs[i++], v = view();
    assert.equal(E.stateHash(), r.hash, `tick ${t}: the same game`);
    assert.equal(JSON.stringify(E.G.events), r.events, `tick ${t}: every tick's events, in order`);
    fights += E.G.events.filter(e => e.t === 'burst' || e.t === 'hit').length; E.G.events.length = 0;
    assert.ok(v === r.view, `tick ${t}: the same mirror`);
    for (const u of E.G.units) held.set(u.id, u);
    for (const [id, u] of held) if (!E.G.units.includes(u)) { assert.ok(u.dead, `unit ${id} gone: marked dead`); held.delete(id); }
  }
  assert.equal(i, runs.length);
  assert.ok(fights > 0, 'fights in the game (events of every kind compared)');
  E.resetGame(4, 0); // (back to a duel's map for the tests after)
});

test('allies share vision: G.vis is what this side\'s team sees, its fog-free area and the units in it', { skip }, () => {
  // Seat 1's Trooper in the middle of a 96x96 map, an enemy (seat 2) beside it; nobody else near. Seen from seat 0.
  const look = (teams) => {
    E.resetGameSeats(31, 1, 0, 0, ['humans', 'vael', 'humans', 'vael'], teams, [false, false, false, false], 0, 96);
    const x = 48 * C.TILE + 16, y = 48 * C.TILE + 16, at = E.idx(48, 48);
    assert.equal(E.G.vis[at], 0, 'the middle out of sight to begin with');
    const ally = E.debugSpawn(1, 'trooper', x, y), enemy = E.debugSpawn(2, 'trooper', x + 40, y);
    E.step();
    const [a, e] = [ally, enemy].map(id => E.G.units.find(u => u.id === id));
    return { vis: E.G.vis[at], explored: E.G.explored[at], ally: E.visibleEnt(a), enemy: E.visibleEnt(e) };
  };
  assert.deepEqual(look([0, 0, 1, 1]), { vis: 1, explored: 1, ally: true, enemy: true }, 'two against two: the ally\'s sight is ours');
  assert.deepEqual(look([]), { vis: 0, explored: 0, ally: false, enemy: false }, 'free for all: our own sight only');
  E.resetGame(4, 0);
});

test('the menus\' maps: a preview of any size with every start, and an online room\'s game with its AI seats', { skip }, async () => {
  const { MAPS, onlineMap } = await import('../src/client/maps.js');
  for (const m of MAPS.filter(x => !x.random)) {
    const p = E.mapPreview(m.seed, m.kind, m.size);
    assert.equal(p.length, m.size * m.size, `${m.name}: a byte per tile`);
    // (a start is a 4x4 square of 4s; count the squares' top-left corners)
    const starts = [...p.keys()].filter(i => p[i] === 4 && p[i - 1] !== 4 && p[i - m.size] !== 4).length;
    assert.equal(starts, { 64: 2, 96: 4, 128: 8 }[m.size], `${m.name}: every start`);
  }
  assert.deepEqual(E.mapPreview(4242, 0), E.mapPreview(4242, 0, 64), 'a duel\'s 64x64 by default');
  // An online room of four: two people, two AIs against them; seat 1's game.
  const setup = { seed: 77, map: 5, side: 3, races: ['humans', 'vael', 'random', 'vael'], names: ['Ann', 'Bo', '', ''], teams: [0, 0, 1, 1], ai: [0, 0, 1, 1], diff: 2 };
  const m = onlineMap(setup);
  assert.deepEqual([m.name, m.size], [MAPS[5].name, 96]);
  E.resetGameForSeat(m.seed, m.kind, setup.side, E.seatRaces(setup.races, setup.seed, Object.keys(C.FACTIONS)), 1, { teams: setup.teams, ai: setup.ai, diff: setup.diff, size: m.size });
  assert.deepEqual([E.MW, E.G.me, E.G.teams, E.G.diff], [96, 1, [0, 0, 1, 1], 2]);
  assert.deepEqual(E.foes(), [2, 3]);
  // A map that does not seat the room (the host's pick before the count changed): the first that does.
  assert.equal(onlineMap({ ...setup, map: 0 }).size, 96);
  assert.equal(onlineMap({ ...setup, map: 5, races: ['humans', 'humans'] }).size, 96, 'two on a four-start map: its own size');
  // Two seats on an eight-start map: the map played is the one previewed (all its starts), the two far apart.
  const iron = MAPS.findIndex(x => x.name === 'Iron Compass'), im = onlineMap({ ...setup, map: iron, races: ['humans', 'vael'], teams: [], ai: [0, 1] });
  E.resetGameForSeat(im.seed, im.kind, 5, ['humans', 'vael'], 0, { ai: [0, 1], size: im.size });
  const preview = E.mapPreview(im.seed, im.kind, im.size), rock = [...preview].map(v => (v === 1 ? 1 : 0));
  assert.equal(E.MW, 128);
  assert.deepEqual([...E.map.rock].map(v => (v ? 1 : 0)), rock, 'the rock as previewed');
  const cores = E.G.bldgs.filter(b => b.d.hq), gap = Math.hypot(cores[0].x - cores[1].x, cores[0].y - cores[1].y);
  assert.equal(cores.length, 2); assert.ok(gap > 64 * 32, `the two cores far apart (${Math.round(gap / 32)} tiles)`);
  E.resetGame(4, 0); // (back to a duel's map for the tests after)
});

test('the client names no unit or building kind outside its data tables and look table', () => {
  // Kind-specific behaviour lives in the sim's flags (worker, hq, onVent, researches...) and src/client/look.js.
  for (const f of ['client/hud.js', 'client/card.js', 'client/ui.js', 'client/input.js', 'client/tools.js', 'client/gl/render.js', 'client/audio.js', 'client/scout.js', 'client/online.js', 'net/net.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    for (const k of [...Object.keys(C.UNITS), ...Object.keys(C.BUILDINGS)]) assert.ok(!src.includes(`=== '${k}'`) && !src.includes(`!== '${k}'`), `${f} tests for '${k}'`);
  }
});
