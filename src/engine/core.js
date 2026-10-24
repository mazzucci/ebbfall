// The Rust sim (WASM) behind the surface the client reads: a live `G` and `map`, entity
// objects with stable identity (selections hold them), and order functions that take those objects.
// State is mirrored from flat snapshot arrays after every step and order, so entity objects in hand are
// always current (a few hundred records: cheap next to rendering). Requires the WASM module to be initialised first (index.js does it in the browser,
// tests call initSync).
import { Game } from './pkg/endfall_sim.js';
import { TILE, MW, MH, PLAYER, UNITS, BUILDINGS } from './constants.js';
import { clamp } from './util.js';

export * from './constants.js';
export { clamp, dist, lerp, fmt, mulberry } from './util.js';

// Snapshot record layouts; keep in sync with UNIT_STRIDE etc. in crates/endfall-sim/src/lib.rs.
const US = 16, BS = 24, PS = 8, NS = 12;
const UNIT_KEYS = Object.keys(UNITS), BLDG_KEYS = Object.keys(BUILDINGS);
const PROJ_KINDS = ['bolt', 'shell', 'missile'];
const UPGRADE_KEYS = ['weapons', 'armor'];
const TASKS = ['idle', 'hold', 'move', 'amove', 'attack', 'gather', 'build', 'repair'], PHASES = ['go', 'wait', 'mine', 'return'];

let game = null, dirty = true;
const units = new Map(), bldgs = new Map(), nodes = new Map();
const S = {
  seed: 0, diff: 1, mapKind: 0, time: 0, tick: 0, units: [], bldgs: [], projs: [], res: [[0, 0], [0, 0]], sup: [[0, 0], [0, 0]],
  vis: new Uint8Array(MW * MH), explored: new Uint8Array(MW * MH), over: false, winner: -1,
  stats: { built: 0, lost: 0, killed: 0, razed: 0 }, events: [], upgrades: [{ weapons: 0, armor: 0 }, { weapons: 0, armor: 0 }],
};
const M = { rock: new Uint8Array(MW * MH), shade: new Float32Array(MW * MH), occ: new Int32Array(MW * MH), nodes: [] };

const live = (k) => ({ enumerable: true, get() { sync(); return S[k]; } });
/** The world as the client sees it. Read-only: change it through the order functions below. */
export const G = Object.defineProperties({}, Object.fromEntries(Object.keys(S).map(k => [k, live(k)])));
export const map = Object.defineProperties({}, Object.fromEntries(Object.keys(M).map(k => [k, { enumerable: true, get() { sync(); return M[k]; } }])));

export const idx = (x, y) => y * MW + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
export const blocked = (x, y) => !inMap(x, y) || map.rock[idx(x, y)] || map.occ[idx(x, y)] !== 0;

function retire(pool, seen) { for (const [id, e] of pool) if (!seen.has(id)) { e.dead = true; pool.delete(id); } }

function sync() {
  if (!dirty || !game) return;
  dirty = false;
  const I = game.info();
  Object.assign(S, { time: I[0], tick: I[1], over: !!I[10], winner: I[11], seed: I[16], diff: I[17], mapKind: I[22] });
  S.res[0][0] = I[2]; S.res[0][1] = I[3]; S.res[1][0] = I[4]; S.res[1][1] = I[5];
  S.sup[0] = [I[6], I[7]]; S.sup[1] = [I[8], I[9]];
  Object.assign(S.stats, { built: I[12], lost: I[13], killed: I[14], razed: I[15] });
  Object.assign(S.upgrades[0], { weapons: I[18], armor: I[19] }); Object.assign(S.upgrades[1], { weapons: I[20], armor: I[21] });
  S.vis.set(game.vis(PLAYER)); S.explored.set(game.explored(PLAYER)); M.occ.set(game.occ());

  const N = game.nodes(), seenN = new Set(); M.nodes = [];
  for (let o = 0; o < N.length; o += NS) {
    const id = N[o]; seenN.add(id);
    let n = nodes.get(id);
    if (!n) nodes.set(id, n = { id, kind: 'node', type: N[o + 1] ? 'ether' : 'shard', tx: N[o + 2], ty: N[o + 3], x: N[o + 4], y: N[o + 5], r: N[o + 9], w: N[o + 1] ? 2 : 1, h: N[o + 1] ? 2 : 1, max: N[o + 6], dead: false });
    n.amount = N[o + 6]; n.miners = N[o + 7]; n.extractorId = N[o + 8];
    M.nodes.push(n);
  }
  retire(nodes, seenN);

  const B = game.buildings(), seenB = new Set(); S.bldgs = [];
  for (let o = 0; o < B.length; o += BS) {
    const id = B[o]; seenB.add(id);
    let b = bldgs.get(id);
    if (!b) {
      const type = BLDG_KEYS[B[o + 1]], d = BUILDINGS[type];
      bldgs.set(id, b = { id, kind: 'bldg', type, d, team: B[o + 2], tx: B[o + 3], ty: B[o + 4], w: d.w, h: d.h, x: (B[o + 3] + d.w / 2) * TILE, y: (B[o + 4] + d.h / 2) * TILE, r: Math.max(d.w, d.h) * TILE / 2, dead: false });
    }
    b.hp = B[o + 5]; b.maxhp = B[o + 6]; b.progress = B[o + 7]; b.done = !!B[o + 8]; b.prog = B[o + 9]; b.flash = B[o + 10]; b.aim = B[o + 11];
    b.rally = B[o + 12] ? { x: B[o + 13], y: B[o + 14], node: nodes.get(B[o + 15]) || null } : null;
    b.queue = []; for (let k = 0; k < B[o + 16]; k++) b.queue.push(UNIT_KEYS[B[o + 17 + k]]);
    b.research = B[o + 22] ? { type: UPGRADE_KEYS[B[o + 22] - 1], prog: B[o + 23] } : null;
    S.bldgs.push(b);
  }
  retire(bldgs, seenB);
  for (const b of S.bldgs) b.vent = null;
  for (const n of M.nodes) { n.extractor = bldgs.get(n.extractorId) || null; if (n.extractor) n.extractor.vent = n; }

  const U = game.units(), seenU = new Set(), attacks = []; S.units = [];
  for (let o = 0; o < U.length; o += US) {
    const id = U[o]; seenU.add(id);
    let u = units.get(id);
    if (!u) { const type = UNIT_KEYS[U[o + 1]]; units.set(id, u = { id, kind: 'unit', type, d: UNITS[type], team: U[o + 2], task: {}, dead: false }); }
    u.x = U[o + 3]; u.y = U[o + 4]; u.hp = U[o + 5]; u.maxhp = U[o + 6]; u.r = U[o + 7]; u.face = U[o + 8]; u.flash = U[o + 9];
    u.carry = U[o + 10]; u.carryType = U[o + 11] < 0 ? null : U[o + 11] ? 'ether' : 'shard'; u.cd = U[o + 15];
    const t = TASKS[U[o + 12]], target = U[o + 14];
    u.task = { t };
    if (t === 'gather') { u.task.phase = PHASES[U[o + 13]]; u.task.node = nodes.get(target) || null; }
    else if (t === 'attack') attacks.push([u, target]);
    else if (t === 'build' || t === 'repair') u.task.b = bldgs.get(target) || null;
    S.units.push(u);
  }
  retire(units, seenU);
  for (const [u, id] of attacks) u.task.target = units.get(id) || bldgs.get(id) || null;

  const P = game.projectiles(); S.projs = [];
  for (let o = 0; o < P.length; o += PS) S.projs.push({ x: P[o], y: P[o + 1], type: PROJ_KINDS[P[o + 2]], team: P[o + 3], ax: P[o + 4], ay: P[o + 5] });

  for (const e of JSON.parse(game.drainEvents())) S.events.push(e);
}

const touch = (r) => { dirty = true; sync(); return r; };
const err = (s) => s || null;

/** Start a new game on a fresh WASM world (so nothing from a previous game, even a failed call, carries over). */
/** `side` 1: the player starts in the other base of the map. */
export function resetGame(seed, diff, map = 0, side = 0) {
  if (game) { try { game.free(); } catch { /* already unusable */ } }
  game = Game.withMapSide(seed >>> 0, diff, map, side);
  units.forEach(u => { u.dead = true; }); bldgs.forEach(b => { b.dead = true; }); nodes.forEach(n => { n.dead = true; });
  units.clear(); bldgs.clear(); nodes.clear(); S.events.length = 0;
  M.rock.set(game.rock()); M.shade.set(game.shade());
  dirty = true; sync();
}
export function step() { game.step(); dirty = true; sync(); }
export function stateHash() { return game.stateHash(); }

// ---- orders (the future network command set) ----
export const moveTo = (u, x, y) => touch(game.moveTo(u.id, x, y));
export const attackMove = (u, x, y) => touch(game.attackMove(u.id, x, y));
export const attackEnt = (u, t) => touch(game.attackEnt(u.id, t.id));
export const stopUnit = (u) => touch(game.stopUnit(u.id));
export const holdUnit = (u) => touch(game.holdUnit(u.id));
export const startGather = (u, n) => touch(game.startGather(u.id, n.id));
export const startBuild = (u, b) => touch(game.startBuild(u.id, b.id));
/** A harvester repairs a damaged finished building of its team (costs a share of the price as it heals). */
export const repair = (u, b) => touch(game.repair(u.id, b.id));
export const formation = (us, x, y) => touch(game.formation(Uint32Array.from(us.map(u => u.id)), x, y));
/** Returns an error string, or null when the building was placed and paid for. */
export const placeBuilding = (team, type, tx, ty, builder) => touch(err(game.placeBuilding(team, type, tx, ty, builder ? builder.id : 0)));
/** Returns an error string, or null on success. */
export const queueUnit = (b, type) => touch(err(game.queueUnit(b.id, type)));
export const cancelQueue = (b, i) => touch(game.cancelQueue(b.id, i));
/** Research the next level of an upgrade at a Foundry; returns an error string or null. */
export const research = (b, type) => touch(err(game.research(b.id, type)));
export const cancelResearch = (b) => touch(game.cancelResearch(b.id));
/** Cancel an unfinished building (75% refund). */
export const cancelConstruction = (b) => touch(game.cancelConstruction(b.id));
export const setRally = (b, x, y, node) => touch(game.setRally(b.id, x, y, node ? node.id : 0));
/** Tests and tools only. */
export const disableAi = () => game.disableAi();
/** Tests and tools only: put a unit on the map; returns its id (0 if refused). */
export const debugSpawn = (team, kind, x, y) => touch(game.debugSpawn(team, kind, x, y));
/** Tests and tools only. */
export const debugSetHp = (b, hp) => touch(game.debugSetHp(b.id ?? b, hp));
/** Tests and tools only. */
export const setResources = (team, shards, ether) => touch(game.setResources(team, shards, ether));

// ---- rule queries ----
export const canPlace = (type, tx, ty, team) => game.canPlace(type, tx, ty, team);
export const hasReq = (team, type) => game.hasReq(team, type);
export const canAfford = (team, cost) => game.canAfford(team, cost[0], cost[1]);

/** Whether `shooter` (a unit or building object) has a weapon that can hit `target`. */
export function canHit(shooter, target) {
  if (!target || target.kind === 'node') return false;
  const air = target.kind === 'unit' && !!target.d.air;
  return (air ? shooter.d.dmgAir : shooter.d.dmg) > 0;
}

/** Whether the human player can see this unit or building right now. */
export function visibleEnt(e) {
  if (e.team === PLAYER) return true;
  const vis = G.vis;
  if (e.kind === 'bldg') { for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) if (vis[idx(e.tx + x, e.ty + y)]) return true; return false; }
  return !!vis[idx(clamp((e.x / TILE) | 0, 0, MW - 1), clamp((e.y / TILE) | 0, 0, MH - 1))];
}
