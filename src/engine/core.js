// The Rust sim (WASM) behind the surface the client reads: a live `G` and `map`, entity
// objects with stable identity (selections hold them), and order functions that take those objects.
// State is mirrored from flat snapshot arrays after every step and order, so entity objects in hand are
// always current (a few hundred records: cheap next to rendering). Requires the WASM module to be initialised first (index.js does it in the browser,
// tests call initSync).
import { Game } from './pkg/endfall_sim.js';
import { TILE, MW, MH, PLAYER, UNITS, BUILDINGS, SCHEMA, FACTIONS } from './constants.js';
import { clamp } from './util.js';

export * from './constants.js';
export { clamp, dist, lerp, fmt, mulberry } from './util.js';

// Snapshot record layouts, by field name (crates/endfall-sim/src/snapshot.rs declares them; pkg/data.js carries them).
const offsets = (fields) => Object.fromEntries(fields.map((f, i) => [f, i]));
const fu = offsets(SCHEMA.unit), fb = offsets(SCHEMA.bldg), fp = offsets(SCHEMA.proj), fn = offsets(SCHEMA.node), fi = offsets(SCHEMA.info);
const US = SCHEMA.unit.length, BS = SCHEMA.bldg.length, PS = SCHEMA.proj.length, NS = SCHEMA.node.length;
const UNIT_KEYS = SCHEMA.unitKinds, BLDG_KEYS = SCHEMA.bldgKinds, PROJ_KINDS = SCHEMA.projKinds, UPGRADE_KEYS = SCHEMA.upgrades;
const TASKS = SCHEMA.tasks, PHASES = SCHEMA.phases, FACTION_KEYS = Object.keys(FACTIONS);

let game = null, dirty = true;
const units = new Map(), bldgs = new Map(), nodes = new Map();
const S = {
  seed: 0, diff: 1, mapKind: 0, factions: ['humans', 'humans'], time: 0, tick: 0, units: [], bldgs: [], projs: [], res: [[0, 0], [0, 0]], sup: [[0, 0], [0, 0]],
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
  Object.assign(S, { time: I[fi.time], tick: I[fi.tick], over: !!I[fi.over], winner: I[fi.winner], seed: I[fi.seed], diff: I[fi.diff], mapKind: I[fi.map_kind] });
  S.factions = [FACTION_KEYS[I[fi.faction0]], FACTION_KEYS[I[fi.faction1]]];
  S.res[0][0] = I[fi.shards0]; S.res[0][1] = I[fi.ether0]; S.res[1][0] = I[fi.shards1]; S.res[1][1] = I[fi.ether1];
  S.sup[0] = [I[fi.sup_used0], I[fi.sup_cap0]]; S.sup[1] = [I[fi.sup_used1], I[fi.sup_cap1]];
  Object.assign(S.stats, { built: I[fi.built], lost: I[fi.lost], killed: I[fi.killed], razed: I[fi.razed] });
  Object.assign(S.upgrades[0], { weapons: I[fi.weapons0], armor: I[fi.armor0] }); Object.assign(S.upgrades[1], { weapons: I[fi.weapons1], armor: I[fi.armor1] });
  S.vis.set(game.vis(PLAYER)); S.explored.set(game.explored(PLAYER)); M.occ.set(game.occ());

  const N = game.nodes(), seenN = new Set(); M.nodes = [];
  for (let o = 0; o < N.length; o += NS) {
    const id = N[o + fn.id], ether = !!N[o + fn.ether]; seenN.add(id);
    let n = nodes.get(id);
    if (!n) nodes.set(id, n = { id, kind: 'node', type: ether ? 'ether' : 'shard', tx: N[o + fn.tx], ty: N[o + fn.ty], x: N[o + fn.x], y: N[o + fn.y], r: N[o + fn.r], w: ether ? 2 : 1, h: ether ? 2 : 1, max: N[o + fn.amount], dead: false });
    n.amount = N[o + fn.amount]; n.miners = N[o + fn.miners]; n.extractorId = N[o + fn.extractor];
    M.nodes.push(n);
  }
  retire(nodes, seenN);

  const B = game.buildings(), seenB = new Set(); S.bldgs = [];
  for (let o = 0; o < B.length; o += BS) {
    const id = B[o + fb.id]; seenB.add(id);
    let b = bldgs.get(id);
    if (!b) {
      const type = BLDG_KEYS[B[o + fb.kind]], d = BUILDINGS[type], tx = B[o + fb.tx], ty = B[o + fb.ty];
      bldgs.set(id, b = { id, kind: 'bldg', type, d, team: B[o + fb.team], tx, ty, w: d.w, h: d.h, x: (tx + d.w / 2) * TILE, y: (ty + d.h / 2) * TILE, r: Math.max(d.w, d.h) * TILE / 2, dead: false });
    }
    b.hp = B[o + fb.hp]; b.maxhp = B[o + fb.maxhp]; b.sh = B[o + fb.sh]; b.maxsh = B[o + fb.maxsh]; b.progress = B[o + fb.progress]; b.done = !!B[o + fb.done]; b.prog = B[o + fb.prog]; b.flash = B[o + fb.flash]; b.aim = B[o + fb.aim];
    b.rally = B[o + fb.has_rally] ? { x: B[o + fb.rally_x], y: B[o + fb.rally_y], node: nodes.get(B[o + fb.rally_node]) || null } : null;
    b.queue = []; for (let k = 0; k < B[o + fb.queue_len]; k++) b.queue.push(UNIT_KEYS[B[o + fb.q0 + k]]);
    b.research = B[o + fb.research] ? { type: UPGRADE_KEYS[B[o + fb.research] - 1], prog: B[o + fb.research_prog] } : null;
    S.bldgs.push(b);
  }
  retire(bldgs, seenB);
  for (const b of S.bldgs) b.vent = null;
  for (const n of M.nodes) { n.extractor = bldgs.get(n.extractorId) || null; if (n.extractor) n.extractor.vent = n; }

  const U = game.units(), seenU = new Set(), attacks = []; S.units = [];
  for (let o = 0; o < U.length; o += US) {
    const id = U[o + fu.id]; seenU.add(id);
    let u = units.get(id);
    if (!u) { const type = UNIT_KEYS[U[o + fu.kind]]; units.set(id, u = { id, kind: 'unit', type, d: UNITS[type], team: U[o + fu.team], task: {}, dead: false }); }
    u.x = U[o + fu.x]; u.y = U[o + fu.y]; u.hp = U[o + fu.hp]; u.maxhp = U[o + fu.maxhp]; u.sh = U[o + fu.sh]; u.maxsh = U[o + fu.maxsh]; u.r = U[o + fu.r]; u.face = U[o + fu.face]; u.flash = U[o + fu.flash];
    const ct = U[o + fu.carry_type];
    u.carry = U[o + fu.carry]; u.carryType = ct < 0 ? null : ct ? 'ether' : 'shard'; u.cd = U[o + fu.cd];
    const t = TASKS[U[o + fu.task]], target = U[o + fu.target];
    u.task = { t };
    if (t === 'gather') { u.task.phase = PHASES[U[o + fu.phase]]; u.task.node = nodes.get(target) || null; }
    else if (t === 'attack') attacks.push([u, target]);
    else if (t === 'build' || t === 'repair') u.task.b = bldgs.get(target) || null;
    S.units.push(u);
  }
  retire(units, seenU);
  for (const [u, id] of attacks) u.task.target = units.get(id) || bldgs.get(id) || null;

  const P = game.projectiles(); S.projs = [];
  for (let o = 0; o < P.length; o += PS) S.projs.push({ x: P[o + fp.x], y: P[o + fp.y], type: PROJ_KINDS[P[o + fp.kind]], team: P[o + fp.team], ax: P[o + fp.aim_x], ay: P[o + fp.aim_y] });

  for (const e of JSON.parse(game.drainEvents())) S.events.push(e);
}

const touch = (r) => { dirty = true; sync(); return r; };
const err = (s) => s || null;

/** Start a new game on a fresh WASM world (so nothing from a previous game, even a failed call, carries over). */
/** `side` 1: the player starts in the other base of the map; `race`: the player's faction key (the AI plays the humans). */
export function resetGame(seed, diff, map = 0, side = 0, race = 'humans') {
  if (game) { try { game.free(); } catch { /* already unusable */ } }
  game = Game.withSetup(seed >>> 0, diff, map, side, Math.max(0, Object.keys(FACTIONS).indexOf(race)), 0);
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
