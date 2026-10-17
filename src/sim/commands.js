// Orders a player (human or AI) can give. These are the only entry points that should ever change a
// unit's task from outside the sim's own update loop. In multiplayer every call here becomes a
// serialized command executed on a specific tick by every client.
import { TILE, MW, MH, WW, WH, PLAYER, BUILDINGS } from './constants.js';
import { clamp, dist } from './util.js';
import { map } from './map.js';
import { astar } from './path.js';
import { G, emit, makeBuilding, canPlace, hasReq, canAfford, pay } from './state.js';

export const tileOf = (p) => ({ x: clamp((p.x / TILE) | 0, 0, MW - 1), y: clamp((p.y / TILE) | 0, 0, MH - 1) });

export function pathTo(u, x, y) {
  const a = tileOf(u), b = tileOf({ x, y });
  u.path = astar(a.x, a.y, b.x, b.y);
  if (u.path && u.path.length && !blockedTile(b)) u.path[u.path.length - 1] = { x: clamp(x, 16, WW - 16), y: clamp(y, 16, WH - 16) };
  u.repath = 0.6 + G.rng() * 0.3;
}
const blockedTile = (t) => map.rock[t.y * MW + t.x] || map.occ[t.y * MW + t.x] !== 0;

export function releaseMine(u) { if (u.task.t === 'gather' && u.task.phase === 'mine' && u.task.node) u.task.node.miners--; }
export function moveTo(u, x, y) { releaseMine(u); u.task = { t: 'move', x, y }; pathTo(u, x, y); }
export function attackMove(u, x, y) { releaseMine(u); u.task = { t: 'amove', x, y, target: null }; pathTo(u, x, y); }
export function attackEnt(u, target) { if (target.team === u.team) return; releaseMine(u); u.task = { t: 'attack', target, back: null }; u.path = null; u.repath = 0; }
export function stopUnit(u) { releaseMine(u); u.task = { t: 'idle' }; u.path = null; }
export function holdUnit(u) { releaseMine(u); u.task = { t: 'hold' }; u.path = null; }

export function nearestNode(u, type, maxD = 900) {
  let best = null, bd = maxD;
  for (const n of map.nodes) {
    if (n.type !== type || n.amount <= 0) continue;
    if (type === 'ether' && !(n.extractor && n.extractor.done && n.extractor.team === u.team)) continue;
    const d = dist(n, u); if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** Returns whether the order took effect (it is refused for non-harvesters and vents without our extractor). */
export function startGather(u, node) {
  if (u.type !== 'harvester') return false;
  if (node.type === 'ether' && !(node.extractor && node.extractor.done && node.extractor.team === u.team)) { if (u.team === PLAYER) emit({ t: 'toast', msg: 'Build an Extractor on the vent first', bad: true }); return false; }
  releaseMine(u); u.lastNode = node; u.task = { t: 'gather', node, phase: u.carry ? 'return' : 'go' }; u.path = null; u.repath = 0;
  return true;
}
export function startBuild(u, b) { releaseMine(u); u.task = { t: 'build', b }; u.path = null; u.repath = 0; }

/** Returns an error string, or null when the building was placed and paid for. */
export function placeBuilding(team, type, tx, ty, builder) {
  const d = BUILDINGS[type];
  if (!canPlace(type, tx, ty, team)) return 'Cannot build there';
  if (!hasReq(team, type)) return 'Requires ' + BUILDINGS[d.req].name;
  if (!canAfford(team, d.cost)) return 'Not enough ' + (G.res[team][0] < d.cost[0] ? 'shards' : 'ether');
  pay(team, d.cost);
  const b = makeBuilding(type, team, tx, ty, false);
  if (builder) startBuild(builder, b);
  for (const u of G.units) if (u.team === team && u.path) u.repath = Math.min(u.repath, 0.1);
  return null;
}

/** Spread a group around a point in a loose square. */
export function formation(units, x, y) {
  const n = units.length, cols = Math.ceil(Math.sqrt(n)), sp = 28;
  units.slice().sort((p, q) => p.x - q.x || p.id - q.id).forEach((u, i) => {
    const ox = (i % cols - (cols - 1) / 2) * sp, oy = (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * sp;
    moveTo(u, clamp(x + ox, 16, WW - 16), clamp(y + oy, 16, WH - 16));
  });
}
