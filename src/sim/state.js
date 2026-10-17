// Game state and the rules that change it directly: entity creation, placement, economy, supply,
// production, fog of war, damage and death. The sim never touches the DOM: anything the client
// should show (sounds, toasts, explosions) is pushed onto G.events and drained by the client.
import { TILE, MW, MH, PLAYER, ENEMY, UNITS, BUILDINGS, DIFF, BASES } from './constants.js';
import { clamp, dist, mulberry } from './util.js';
import { map, idx, inMap, blocked, nearestFree, genMap } from './map.js';
import { ids } from './ids.js';
import { startGather, moveTo, nearestNode } from './commands.js';
import { initAI } from './ai.js';

export const G = {
  seed: 1, diff: 1, time: 0, tick: 0,
  units: [], bldgs: [], projs: [],
  res: [[50, 0], [50, 0]], sup: [[0, 0], [0, 0]],
  explored: new Uint8Array(MW * MH), vis: new Uint8Array(MW * MH),
  over: false, winner: -1,
  stats: { built: 0, lost: 0, killed: 0, razed: 0 },
  ai: null,
  /** Seeded RNG for anything in the sim that needs randomness. Never use Math.random in src/sim. */
  rng: mulberry(1),
  /** Events for the client to drain each frame: {t:'sfx'|'toast'|'burst'|'hit', ...}. */
  events: [],
};

export function emit(ev) { G.events.push(ev); }

/** Reset the world for a new game. Call before anything else. */
export function resetGame(seed, diff) {
  G.seed = seed; G.diff = diff; G.rng = mulberry(seed ^ 0x9e3779b9); ids.next = 1;
  G.time = 0; G.tick = 0; G.units = []; G.bldgs = []; G.projs = [];
  G.res = [[50, 0], [50, 0]]; G.sup = [[0, 0], [0, 0]];
  G.explored.fill(0); G.vis.fill(0); G.over = false; G.winner = -1;
  G.stats = { built: 0, lost: 0, killed: 0, razed: 0 }; G.events = [];
  genMap(seed);
  for (const team of [PLAYER, ENEMY]) {
    const b = BASES[team];
    makeBuilding('core', team, b.x, b.y, true);
    for (let i = 0; i < 4; i++) {
      const f = nearestFree(b.x - 1 + (i % 2) * 6, b.y + 4 + (i >> 1) * 2, 4) || { x: b.x, y: b.y + 5 };
      const u = makeUnit('harvester', team, f.x * TILE + 16, f.y * TILE + 16);
      const n = nearestNode(u, 'shard'); if (n) startGather(u, n);
    }
    recalcSupply(team);
  }
  initAI();
  updateFog();
}

// ---- spatial hash (rebuilt every tick) ----
const cellOf = (x, y) => ((x / 64) | 0) + ',' + ((y / 64) | 0);
let hash = new Map();
export function rebuildHash() { hash = new Map(); for (const u of G.units) { const k = cellOf(u.x, u.y); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(u); } }
export function nearby(x, y, rad) {
  const out = []; const c = Math.ceil(rad / 64); const cx = (x / 64) | 0, cy = (y / 64) | 0;
  for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) { const a = hash.get((cx + dx) + ',' + (cy + dy)); if (a) for (const u of a) out.push(u); }
  return out;
}

// ---- geometry ----
export function closestPt(b, p) { return { x: clamp(p.x, b.tx * TILE, (b.tx + b.w) * TILE), y: clamp(p.y, b.ty * TILE, (b.ty + b.h) * TILE) }; }
export function edgeDist(e, p) { return e.kind === 'bldg' ? dist(closestPt(e, p), p) : dist(e, p) - e.r; }

// ---- entities ----
export function makeUnit(type, team, x, y) {
  const d = UNITS[type];
  const u = { id: ids.next++, kind: 'unit', type, d, team, x, y, hp: d.hp, maxhp: d.hp, r: d.r, task: { t: 'idle' }, path: null, cd: 0, face: team ? Math.PI : 0, carry: 0, carryType: null, lastNode: null, repath: 0, dead: false, flash: 0, aggroCd: 0 };
  G.units.push(u); return u;
}

export function makeBuilding(type, team, tx, ty, done) {
  const d = BUILDINGS[type];
  const b = { id: ids.next++, kind: 'bldg', type, d, team, tx, ty, w: d.w, h: d.h, x: (tx + d.w / 2) * TILE, y: (ty + d.h / 2) * TILE, hp: done ? d.hp : Math.max(10, d.hp * 0.1), maxhp: d.hp, progress: done ? 1 : 0, done: !!done, queue: [], prog: 0, rally: null, cd: 0, dead: false, flash: 0, r: Math.max(d.w, d.h) * TILE / 2, builders: 0, vent: null, aim: 0 };
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const i = idx(tx + x, ty + y);
    if (map.occ[i] < 0 && d.onVent) { const nd = map.nodes.find(n => n.id === -map.occ[i]); if (nd) { nd.extractor = b; b.vent = nd; } }
    map.occ[i] = b.id;
  }
  // Nudge units standing in the footprint.
  for (const u of G.units) { const tx2 = (u.x / TILE) | 0, ty2 = (u.y / TILE) | 0; if (tx2 >= tx && tx2 < tx + d.w && ty2 >= ty && ty2 < ty + d.h) { const f = nearestFree(tx2, ty2, 4); if (f) { u.x = f.x * TILE + 16; u.y = f.y * TILE + 16; } } }
  G.bldgs.push(b); recalcSupply(team); return b;
}

export function canPlace(type, tx, ty, team) {
  const d = BUILDINGS[type];
  if (!inMap(tx, ty) || !inMap(tx + d.w - 1, ty + d.h - 1)) return false;
  if (d.onVent) { const nd = map.nodes.find(n => n.type === 'ether' && n.tx === tx && n.ty === ty); return !!nd && !nd.extractor && (team !== PLAYER || G.explored[idx(tx, ty)]); }
  for (let y = -1; y <= d.h; y++) for (let x = -1; x <= d.w; x++) {
    const X = tx + x, Y = ty + y; if (!inMap(X, Y)) continue;
    const i = idx(X, Y); const edge = x < 0 || y < 0 || x >= d.w || y >= d.h;
    if (edge) { if (map.occ[i] < 0) return false; continue; }
    if (map.rock[i] || map.occ[i] !== 0) return false;
    if (team === PLAYER && !G.explored[i]) return false;
  }
  return true;
}

export function hasReq(team, type) { const r = BUILDINGS[type] && BUILDINGS[type].req; return !r || G.bldgs.some(b => b.team === team && b.type === r && b.done && !b.dead); }
export function canAfford(team, cost) { return G.res[team][0] >= cost[0] && G.res[team][1] >= cost[1]; }
export function pay(team, cost, sign = -1) { G.res[team][0] += sign * cost[0]; G.res[team][1] += sign * cost[1]; }

export function recalcSupply(team) {
  let used = 0, cap = 0;
  for (const u of G.units) if (u.team === team && !u.dead) used += u.d.supply;
  for (const b of G.bldgs) if (b.team === team && !b.dead) { if (b.done && b.d.supply) cap += b.d.supply; for (const q of b.queue) used += UNITS[q].supply; }
  G.sup[team] = [used, Math.min(200, cap)];
}

/** Returns an error string, or null on success. */
export function queueUnit(b, type) {
  const d = UNITS[type];
  if (b.queue.length >= 5) return 'Queue is full';
  if (!canAfford(b.team, d.cost)) return 'Not enough ' + (G.res[b.team][0] < d.cost[0] ? 'shards' : 'ether');
  if (G.sup[b.team][0] + d.supply > G.sup[b.team][1]) return 'Supply blocked. Build a Depot.';
  pay(b.team, d.cost); b.queue.push(type); recalcSupply(b.team); return null;
}
export function cancelQueue(b, i) { const t = b.queue.splice(i, 1)[0]; if (t) { pay(b.team, UNITS[t].cost, 1); if (i === 0) b.prog = 0; recalcSupply(b.team); } }

export function spawnFrom(b, type) {
  let f = null;
  for (let r = 0; r < 6 && !f; r++) {
    const cands = [];
    for (let y = b.ty - r - 1; y <= b.ty + b.h + r; y++) for (let x = b.tx - r - 1; x <= b.tx + b.w + r; x++) {
      if (x >= b.tx - r && x < b.tx + b.w + r && y >= b.ty - r && y < b.ty + b.h + r && r > 0) continue;
      if (!blocked(x, y)) cands.push({ x, y });
    }
    if (cands.length) { const ref = b.rally || { x: b.x, y: b.y + MH * TILE * (b.team ? -1 : 1) }; cands.sort((p, q) => dist({ x: p.x * TILE, y: p.y * TILE }, ref) - dist({ x: q.x * TILE, y: q.y * TILE }, ref)); f = cands[0]; }
  }
  if (!f) f = { x: b.tx, y: b.ty + b.h };
  const u = makeUnit(type, b.team, f.x * TILE + 16, f.y * TILE + 16);
  if (b.team === PLAYER) G.stats.built++;
  if (b.rally) { if (b.rally.node && type === 'harvester') startGather(u, b.rally.node); else moveTo(u, b.rally.x, b.rally.y); }
  else if (type === 'harvester' && b.type === 'core') { const nd = nearestNode(u, 'shard'); if (nd) startGather(u, nd); }
  recalcSupply(b.team); return u;
}

// ---- fog of war (player perspective; see PLAN.md for the per-player version multiplayer needs) ----
export function updateFog() {
  G.vis.fill(0);
  const mark = (e, s) => {
    const cx = e.x / TILE, cy = e.y / TILE, s2 = s * s;
    for (let y = Math.max(0, (cy - s) | 0); y <= Math.min(MH - 1, (cy + s) | 0); y++) for (let x = Math.max(0, (cx - s) | 0); x <= Math.min(MW - 1, (cx + s) | 0); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= s2) { const i = idx(x, y); G.vis[i] = 1; G.explored[i] = 1; }
    }
  };
  for (const u of G.units) if (u.team === PLAYER && !u.dead) mark(u, u.d.sight);
  for (const b of G.bldgs) if (b.team === PLAYER && !b.dead) mark(b, b.done ? b.d.sight : 3);
}
export function visibleEnt(e) {
  if (e.team === PLAYER) return true;
  if (e.kind === 'bldg') { for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) if (G.vis[idx(e.tx + x, e.ty + y)]) return true; return false; }
  return !!G.vis[idx(clamp((e.x / TILE) | 0, 0, MW - 1), clamp((e.y / TILE) | 0, 0, MH - 1))];
}

// ---- combat resolution ----
export function findTarget(e, range, onlyUnits) {
  let best = null, bd = 1e9; const p = { x: e.x, y: e.y };
  for (const u of G.units) { if (u.team === e.team || u.dead) continue; const d = dist(u, p) - u.r; if (d < range && d * 0.6 < bd) { bd = d * 0.6; best = u; } }
  if (!onlyUnits) for (const b of G.bldgs) { if (b.team === e.team || b.dead) continue; const d = edgeDist(b, p); if (d < range && d < bd) { bd = d; best = b; } }
  return best;
}

export function damage(t, amt, by) {
  if (t.dead) return;
  t.hp -= Math.max(1, amt - (t.d.armor || 0)); t.flash = 0.12;
  if (t.kind === 'unit' && by && !by.dead) {
    if (t.task.t === 'idle' || (t.task.t === 'amove' && !t.task.target)) { if (!t.d.melee || t.type !== 'harvester') t.task = { t: 'attack', target: by, back: t.task.t === 'amove' ? { x: t.task.x, y: t.task.y } : null }; }
    for (const a of nearby(t.x, t.y, 180)) { if (a.team !== t.team || a.dead || a.type === 'harvester') continue; if (a.task.t === 'idle') a.task = { t: 'attack', target: by, back: null }; }
  }
  if (t.hp <= 0) kill(t, by);
}

export function kill(e) {
  if (e.dead) return;
  e.dead = true; const isP = e.team === PLAYER;
  if (e.kind === 'unit') {
    G.units.splice(G.units.indexOf(e), 1);
    if (e.lastNode && e.task.t === 'gather' && e.task.phase === 'mine') e.task.node.miners--;
    emit({ t: 'burst', x: e.x, y: e.y, r: e.r, team: e.team, n: 10 });
    if (isP) G.stats.lost++; else G.stats.killed++;
    emit({ t: 'sfx', name: isP ? 'lost' : 'kill' });
  } else {
    G.bldgs.splice(G.bldgs.indexOf(e), 1);
    for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) map.occ[idx(e.tx + x, e.ty + y)] = e.vent ? -e.vent.id : 0;
    if (e.vent) e.vent.extractor = null;
    for (const q of e.queue) pay(e.team, UNITS[q].cost, 1);
    for (const u of G.units) if (u.task.t === 'build' && u.task.b === e) u.task = { t: 'idle' };
    emit({ t: 'burst', x: e.x, y: e.y, r: e.r, team: e.team, n: 24 });
    if (!isP) G.stats.razed++;
    emit({ t: 'sfx', name: 'boom' });
    if (isP) emit({ t: 'toast', msg: e.d.name + ' destroyed', bad: true });
  }
  recalcSupply(e.team);
  checkEnd();
}

export function checkEnd() {
  if (G.over) return;
  const pb = G.bldgs.some(b => b.team === PLAYER), eb = G.bldgs.some(b => b.team === ENEMY);
  if (!eb) { G.over = true; G.winner = PLAYER; }
  else if (!pb && !G.units.some(u => u.team === PLAYER && u.type === 'harvester')) { G.over = true; G.winner = ENEMY; }
}

export { DIFF };
