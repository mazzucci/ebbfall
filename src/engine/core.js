// The Rust sim (WASM) behind the surface the client reads: a live `G` and `map`, entity
// objects with stable identity (selections hold them), and order functions that take those objects.
// State is mirrored from flat snapshot arrays after every step and order, so entity objects in hand are
// always current; the game loop's `advance` leaves the mirror for the next read of `G` (once a frame, however many
// ticks ran). Entity objects and their parts are updated in place: nothing is allocated per entity per tick. Requires the WASM module to be initialised first (index.js does it in the browser,
// tests call initSync).
import { Game, mapPreview as simMapPreview } from './pkg/endfall_sim.js';
import { TILE, DUEL_MW, DUEL_MH, UNITS, BUILDINGS, SCHEMA, FACTIONS } from './constants.js';
import { clamp } from './util.js';

export * from './constants.js';
export { clamp, dist, fmt, mulberry, seatRaces } from './util.js';

// Snapshot record layouts, by field name (crates/endfall-sim/src/snapshot.rs declares them; pkg/data.js carries them).
const offsets = (fields) => Object.fromEntries(fields.map((f, i) => [f, i]));
const fu = offsets(SCHEMA.unit), fb = offsets(SCHEMA.bldg), fp = offsets(SCHEMA.proj), fn = offsets(SCHEMA.node), fi = offsets(SCHEMA.info), fs = offsets(SCHEMA.seat);
const US = SCHEMA.unit.length, BS = SCHEMA.bldg.length, PS = SCHEMA.proj.length, NS = SCHEMA.node.length, SS = SCHEMA.seat.length;
const UNIT_KEYS = SCHEMA.unitKinds, BLDG_KEYS = SCHEMA.bldgKinds, PROJ_KINDS = SCHEMA.projKinds, UPGRADE_KEYS = SCHEMA.upgrades, ABILITY_KEYS = SCHEMA.abilities;
const TASKS = SCHEMA.tasks, PHASES = SCHEMA.phases, FACTION_KEYS = Object.keys(FACTIONS);

let game = null, dirty = true, occStale = false, gen = 0;
/** The map's size in tiles and in world px: the game's, set when it starts (a two-seat map's before any). Live
 *  bindings: read them where they are used, never copy them at load. */
export let MW = DUEL_MW, MH = DUEL_MH, WW = MW * TILE, WH = MH * TILE;
const units = new Map(), bldgs = new Map(), nodes = new Map();
const S = {
  me: 0, seed: 0, diff: 1, mapKind: 0, factions: ['humans', 'humans'], teams: [0, 1], out: [false, false], time: 0, tick: 0, units: [], bldgs: [], projs: [], res: [[0, 0], [0, 0]], sup: [[0, 0], [0, 0]],
  vis: new Uint8Array(MW * MH), explored: new Uint8Array(MW * MH), over: false, winner: -1, conceded: -1,
  stats: [0, 1].map(() => ({ built: 0, lost: 0, killed: 0, razed: 0 })), events: [], upgrades: [0, 1].map(() => Object.fromEntries(UPGRADE_KEYS.map(k => [k, 0]))),
};
const M = { rock: new Uint8Array(MW * MH), shade: new Float32Array(MW * MH), occ: new Int32Array(MW * MH), nodes: [] };

const live = (k) => ({ enumerable: true, get() { sync(); return S[k]; } });
/** The world as the client sees it. Read-only: change it through the order functions below. */
export const G = Object.defineProperties({}, Object.fromEntries(Object.keys(S).map(k => [k, live(k)])));
export const map = Object.defineProperties({}, Object.fromEntries(Object.keys(M).map(k => [k, { enumerable: true, get() { sync(); if (k === 'occ') syncOcc(); return M[k]; } }])));
/** The occupancy grid (the largest snapshot, read only by placement and the scenery) is copied when it is read. */
function syncOcc() { if (occStale && game) { occStale = false; M.occ.set(game.occ()); } }

export const idx = (x, y) => y * MW + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
export const blocked = (x, y) => !inMap(x, y) || map.rock[idx(x, y)] || map.occ[idx(x, y)] !== 0;

/** Entities not in this snapshot (their `gen` is an older one) are gone. */
function retire(pool) { for (const [id, e] of pool) if (e.gen !== gen) { e.dead = true; pool.delete(id); } }

function sync() {
  if (!dirty || !game) return;
  dirty = false; gen++;
  const I = game.info();
  Object.assign(S, { time: I[fi.time], tick: I[fi.tick], over: !!I[fi.over], winner: I[fi.winner], conceded: I[fi.conceded], seed: I[fi.seed], diff: I[fi.diff], mapKind: I[fi.map_kind] });
  // A record per seat follows the info record, then each seat's upgrade levels.
  const n = I[fi.seats], lv = SCHEMA.info.length + n * SS;
  for (const k of ['factions', 'teams', 'out', 'res', 'sup', 'stats', 'upgrades']) S[k].length = n;
  for (let t = 0; t < n; t++) {
    const o = SCHEMA.info.length + t * SS, at = (f) => I[o + fs[f]];
    S.factions[t] = FACTION_KEYS[at('faction')]; S.teams[t] = at('team'); S.out[t] = !!at('out');
    S.res[t] = [at('shards'), at('ether')]; S.sup[t] = [at('sup_used'), at('sup_cap')];
    S.stats[t] = Object.assign(S.stats[t] || {}, { built: at('built'), lost: at('lost'), killed: at('killed'), razed: at('razed') });
    const ups = S.upgrades[t] ||= {}; UPGRADE_KEYS.forEach((k, i) => { ups[k] = I[lv + t * UPGRADE_KEYS.length + i]; });
  }
  S.me = game.me(); S.replaying = game.replayEnd() > 0; S.vis.set(game.vis(S.me)); S.explored.set(game.explored(S.me)); occStale = true;

  const N = game.nodes(); M.nodes = [];
  for (let o = 0; o < N.length; o += NS) {
    const id = N[o + fn.id], ether = !!N[o + fn.ether];
    let n = nodes.get(id);
    if (!n) nodes.set(id, n = { id, kind: 'node', type: ether ? 'ether' : 'shard', tx: N[o + fn.tx], ty: N[o + fn.ty], x: N[o + fn.x], y: N[o + fn.y], r: N[o + fn.r], w: ether ? 2 : 1, h: ether ? 2 : 1, max: N[o + fn.amount], dead: false, gen, amount: 0, miners: 0, extractorId: 0, extractor: null });
    n.gen = gen; n.amount = N[o + fn.amount]; n.miners = N[o + fn.miners]; n.extractorId = N[o + fn.extractor];
    M.nodes.push(n);
  }
  retire(nodes);

  const B = game.buildings(); S.bldgs = [];
  for (let o = 0; o < B.length; o += BS) {
    const id = B[o + fb.id];
    let b = bldgs.get(id);
    if (!b) {
      const type = BLDG_KEYS[B[o + fb.kind]], d = BUILDINGS[type], tx = B[o + fb.tx], ty = B[o + fb.ty];
      bldgs.set(id, b = { id, kind: 'bldg', type, d, team: B[o + fb.team], tx, ty, w: d.w, h: d.h, x: (tx + d.w / 2) * TILE, y: (ty + d.h / 2) * TILE, r: Math.max(d.w, d.h) * TILE / 2, dead: false, gen, queue: [], rally: null, research: null, vent: null });
    }
    b.gen = gen; b.hp = B[o + fb.hp]; b.maxhp = B[o + fb.maxhp]; b.sh = B[o + fb.sh]; b.maxsh = B[o + fb.maxsh]; b.planted = !!B[o + fb.planted]; b.powered = !!B[o + fb.powered]; b.progress = B[o + fb.progress]; b.done = !!B[o + fb.done]; b.prog = B[o + fb.prog]; b.flash = B[o + fb.flash]; b.aim = B[o + fb.aim];
    if (B[o + fb.has_rally]) { const r = b.rally ||= {}; r.x = B[o + fb.rally_x]; r.y = B[o + fb.rally_y]; r.node = nodes.get(B[o + fb.rally_node]) || null; } else b.rally = null;
    const q = b.queue; q.length = B[o + fb.queue_len]; for (let k = 0; k < q.length; k++) q[k] = UNIT_KEYS[B[o + fb.q0 + k]];
    if (B[o + fb.research]) { const r = b.research ||= {}; r.type = UPGRADE_KEYS[B[o + fb.research] - 1]; r.prog = B[o + fb.research_prog]; } else b.research = null;
    S.bldgs.push(b);
  }
  retire(bldgs);
  for (const b of S.bldgs) b.vent = null;
  for (const n of M.nodes) { n.extractor = bldgs.get(n.extractorId) || null; if (n.extractor) n.extractor.vent = n; }

  const U = game.units(); S.units = []; attacks.length = 0;
  for (let o = 0; o < U.length; o += US) {
    const id = U[o + fu.id];
    let u = units.get(id);
    if (!u) { const type = UNIT_KEYS[U[o + fu.kind]]; units.set(id, u = { id, kind: 'unit', type, d: UNITS[type], team: U[o + fu.team], task: { t: null, phase: null, node: null, b: null, target: null }, abCd: [0, 0], dead: false, gen }); }
    u.gen = gen; u.x = U[o + fu.x]; u.y = U[o + fu.y]; u.hp = U[o + fu.hp]; u.maxhp = U[o + fu.maxhp]; u.sh = U[o + fu.sh]; u.maxsh = U[o + fu.maxsh]; u.r = U[o + fu.r]; u.face = U[o + fu.face]; u.flash = U[o + fu.flash];
    const ct = U[o + fu.carry_type];
    u.carry = U[o + fu.carry]; u.carryType = ct < 0 ? null : ct ? 'ether' : 'shard'; u.cd = U[o + fu.cd];
    // Abilities: seconds of cooldown left per slot (the kind's `abilities` order), the boost and the toggle that are on.
    // (no ability is 0: never read a key at index -1, which is a slow property lookup)
    u.abCd[0] = U[o + fu.ab_cd0]; u.abCd[1] = U[o + fu.ab_cd1]; const boost = U[o + fu.boost], mode = U[o + fu.mode];
    u.boost = boost > 0 ? ABILITY_KEYS[boost - 1] || null : null;
    u.mode = mode > 0 ? ABILITY_KEYS[mode - 1] || null : null; u.swap = U[o + fu.swap]; u.warp = U[o + fu.warp]; u.hid = U[o + fu.hid]; u.cloaked = !!U[o + fu.cloaked];
    const t = TASKS[U[o + fu.task]], target = U[o + fu.target], task = u.task;
    task.t = t; task.phase = task.node = task.b = task.target = null;
    if (t === 'gather') { task.phase = PHASES[U[o + fu.phase]]; task.node = nodes.get(target) || null; }
    else if (t === 'attack') attacks.push(u, target);
    else if (t === 'build' || t === 'repair') task.b = bldgs.get(target) || null;
    S.units.push(u);
  }
  retire(units);
  for (let i = 0; i < attacks.length; i += 2) attacks[i].task.target = units.get(attacks[i + 1]) || bldgs.get(attacks[i + 1]) || null;

  const P = game.projectiles(); S.projs = [];
  for (let o = 0; o < P.length; o += PS) S.projs.push({ x: P[o + fp.x], y: P[o + fp.y], type: PROJ_KINDS[P[o + fp.kind]], team: P[o + fp.team], ax: P[o + fp.aim_x], ay: P[o + fp.aim_y] });

  const ev = game.drainEvents();
  if (ev !== '[]') for (const e of JSON.parse(ev)) S.events.push(e);
}
const attacks = []; // (units attacking, and their target's id: resolved once every unit is in)

const touch = (r) => { dirty = true; sync(); return r; };
const err = (s) => s || null;

/** Start a new game on a fresh WASM world (so nothing from a previous game, even a failed call, carries over). */
function fresh(g) {
  if (game) { try { game.free(); } catch { /* already unusable */ } }
  game = g;
  units.forEach(u => { u.dead = true; }); bldgs.forEach(b => { b.dead = true; }); nodes.forEach(n => { n.dead = true; });
  units.clear(); bldgs.clear(); nodes.clear(); S.events.length = 0;
  // The per-tile grids at the map's size (made again only when it differs from the last game's).
  MW = game.mapW(); MH = game.mapH(); WW = MW * TILE; WH = MH * TILE;
  if (M.rock.length !== MW * MH) {
    const n = MW * MH;
    Object.assign(M, { rock: new Uint8Array(n), shade: new Float32Array(n), occ: new Int32Array(n) });
    Object.assign(S, { vis: new Uint8Array(n), explored: new Uint8Array(n) });
  }
  M.rock.set(game.rock()); M.shade.set(game.shade());
  dirty = true; sync();
}
/** An online game (docs/MULTIPLAYER.md): the room's setup, seen from seat `me`, in lockstep (orders go out to the
 *  relay; the network layer feeds the turns back). `seed` is the map's; `races` the seats' (RANDOM drawn: seatRaces);
 *  `teams` a team per seat (empty: each its own), `ai` the seats the AI plays (at `diff`; every client runs them alike),
 *  on a `size` x `size` map. Two people and no AI: the game a two-seat room always played. */
export function resetGameForSeat(seed, map, side, races, me, { teams = [], ai = [], diff = 1, size = DUEL_MW } = {}) {
  const f = (k) => { if (k === 'random') throw new Error('a RANDOM seat is drawn first (seatRaces)'); return Math.max(0, Object.keys(FACTIONS).indexOf(k)); }; // (an unknown race: the first)
  const g = Game.withSeats(seed >>> 0, ai.some(a => a) ? diff : 1, map, side, Uint32Array.from(races.map(f)), Uint8Array.from(teams),
    Uint8Array.from(races.map((_, s) => (ai[s] ? 1 : 0))), me, size);
  g.startLockstep();
  fresh(g);
}
/** The WASM game itself (the network layer talks to it directly). */
export const liveGame = () => game;
/** `side` 1: the player starts in the other base of the map; `race`, `enemy`: the player's and the AI's faction keys;
 *  `size`: the map's tiles across (64 to 128; tests: the menus offer a two-seat map's 64). */
export function resetGame(seed, diff, map = 0, side = 0, race = 'humans', enemy = 'humans', size = DUEL_MW) {
  const f = (k) => { const i = Object.keys(FACTIONS).indexOf(k); if (i < 0) throw new Error(`no race ${k}`); return i; }; // (a menu's RANDOM is drawn before)
  fresh(Game.withSize(seed >>> 0, diff, map, side, f(race), f(enemy), size));
}
/** A game for any number of seats, seen from seat `me` (tests for now; M4's lobby): each seat's race key, team (empty:
 *  each its own) and whether the AI plays it (empty: nobody), on a `size` x `size` map with a start per seat (64: 2,
 *  96: 4, 128: 8). Throws for a setup the sim cannot play. */
export function resetGameSeats(seed, diff, map, side, races, teams, ai, me, size = DUEL_MW) {
  const f = (k) => Math.max(0, Object.keys(FACTIONS).indexOf(k));
  fresh(Game.withSeats(seed >>> 0, diff, map, side, Uint32Array.from(races.map(f)), Uint8Array.from(teams),
    Uint8Array.from(ai.map(a => a ? 1 : 0)), me, size));
}
export function step() { if (!game.canStep()) return false; game.step(); dirty = true; sync(); return true; }
/** One tick, mirrored at the next read of `G` or `map` (the game loop: once a frame, however many ticks it ran). */
export function advance() { if (!game.canStep()) return false; game.step(); dirty = true; return true; }
/** Watch the game just played again from its first tick (both sides in view, no orders taken); false if it cannot be. */
export function startReplay() {
  if (!game.startReplay()) return false;
  units.forEach(u => { u.dead = true; }); bldgs.forEach(b => { b.dead = true; }); nodes.forEach(n => { n.dead = true; });
  units.clear(); bldgs.clear(); nodes.clear(); S.events.length = 0;
  dirty = true; sync(); return true;
}
/** The tick the replay being watched ends on (0: none). */
export const replayEnd = () => game.replayEnd();
export function stateHash() { return game.stateHash(); }
/** A map's layout for the menu's thumbnail, `size` x `size` tiles (64: a duel's; 96: four starts) with every start, one
 *  byte per tile: 0 ground, 1 rock, 2 shards, 3 vent, 4 a start. */
export const mapPreview = (seed, kind, size = DUEL_MW) => simMapPreview(seed, kind, size);
/** `team`'s army value every 10 s since the start (the end screen's chart). */
export const armyLog = (team) => Array.from(game.armyLog(team));
/** `team`'s units lost by what killed them: unit kinds in order, then building kinds (empty before any loss). */
export const lostTo = (team) => Array.from(game.lostTo(team));

// ---- orders (the future network command set) ----
export const moveTo = (u, x, y) => touch(game.moveTo(u.id, x, y));
export const attackMove = (u, x, y) => touch(game.attackMove(u.id, x, y));
/** Attack-move for several units: together, at the pace of the slowest. */
export const attackMoveGroup = (us, x, y) => touch(game.attackMoveGroup(Uint32Array.from(us.map(u => u.id)), x, y));
export const attackEnt = (u, t) => touch(game.attackEnt(u.id, t.id));
export const stopUnit = (u) => touch(game.stopUnit(u.id));
export const holdUnit = (u) => touch(game.holdUnit(u.id));
export const startGather = (u, n) => touch(game.startGather(u.id, n.id));
export const startBuild = (u, b) => touch(game.startBuild(u.id, b.id));
/** A harvester repairs a damaged finished building of its team (costs a share of the price as it heals). */
export const repair = (u, b) => touch(game.repair(u.id, b.id));
export const formation = (us, x, y) => touch(game.formation(Uint32Array.from(us.map(u => u.id)), x, y));
/** Every unit of `us` that has the ability (by key) and can use it now does; null, or why nobody could. */
export const castAbility = (us, key) => touch(err(game.cast(Uint32Array.from(us.map(u => u.id)), key)));
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
/** The guided first game: hold the opponent's waves back (5:00 at most), or let them come. */
export const holdWaves = (on) => game.holdWaves(on);
/** Give up the game (the end screen then shows a defeat). */
export const concede = () => touch(game.concede());
/** Tests and tools only: put a unit on the map; returns its id (0 if refused). */
export const debugSpawn = (team, kind, x, y) => touch(game.debugSpawn(team, kind, x, y));
export const debugResearch = (team, key, level = 1) => touch(game.debugResearch(team, key, level));
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
  const w = shooter.d.weapon;
  return !!w && (air ? w.dmgAir : w.dmg) > 0;
}

/** Whether this client's player (seat G.me) can see this unit or building right now. G.vis is the team's sight (allies
 *  share vision, crates/endfall-sim/src/world/fog.rs): our allies' are always seen, their enemies where any of us sees. */
export function visibleEnt(e) {
  if (e.team === S.me || !enemies(S.me, e.team)) return true;
  const vis = G.vis;
  if (e.kind === 'bldg') { for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) if (vis[idx(e.tx + x, e.ty + y)]) return true; return false; }
  if ((e.hid >> S.me) & 1 && !S.replaying) return false; // cloaked, and we detect nothing there (a replay shows all)
  return !!vis[idx(clamp((e.x / TILE) | 0, 0, MW - 1), clamp((e.y / TILE) | 0, 0, MH - 1))];
}

/** Whether seats `a` and `b` are on different teams (they fight). G.winner is a team: G.teams[G.me] when this side won. */
export const enemies = (a, b) => G.teams[a] !== G.teams[b];
/** The seats this client's player fights. */
export const foes = () => G.teams.map((_, t) => t).filter(t => enemies(G.me, t));
