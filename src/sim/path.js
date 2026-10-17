// A* over the tile grid with 8-way movement and corner cutting disallowed, then line-of-sight smoothing.
import { TILE, MW, MH } from './constants.js';
import { lerp, dist } from './util.js';
import { blocked, nearestFree, idx } from './map.js';

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], l = a.pop();
    if (a.length) { a[0] = l; let i = 0; for (;;) { let s = i; const L = 2 * i + 1, R = L + 1; if (L < a.length && a[L].f < a[s].f) s = L; if (R < a.length && a[R].f < a[s].f) s = R; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } }
    return top;
  }
  get size() { return this.a.length; }
}

// Scratch arrays reused across searches; `stamp` marks which search a cell belongs to.
const gCost = new Float32Array(MW * MH), came = new Int32Array(MW * MH), closed = new Uint8Array(MW * MH), stampArr = new Uint32Array(MW * MH);
let stamp = 1;

/** Returns a list of world-space waypoints (excluding the start), or null if unreachable. Expands at most 5000 nodes. */
export function astar(sx, sy, gx, gy) {
  const g = nearestFree(gx, gy); if (!g) return null; gx = g.x; gy = g.y;
  if (blocked(sx, sy)) { const s = nearestFree(sx, sy, 3); if (!s) return null; sx = s.x; sy = s.y; }
  stamp++;
  const open = new Heap();
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const si = idx(sx, sy); stampArr[si] = stamp; gCost[si] = 0; came[si] = -1; closed[si] = 0; open.push({ i: si, x: sx, y: sy, f: h(sx, sy) });
  let best = null, bestH = 1e9, n = 0;
  while (open.size && n++ < 5000) {
    const c = open.pop();
    if (closed[c.i] && stampArr[c.i] === stamp) continue;
    closed[c.i] = 1;
    const hh = h(c.x, c.y); if (hh < bestH) { bestH = hh; best = c.i; }
    if (c.x === gx && c.y === gy) { best = c.i; break; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = c.x + dx, ny = c.y + dy;
      if (blocked(nx, ny)) continue;
      if (dx && dy && (blocked(c.x + dx, c.y) || blocked(c.x, c.y + dy))) continue;
      const ni = idx(nx, ny), ng = gCost[c.i] + (dx && dy ? 1.414 : 1);
      if (stampArr[ni] !== stamp || ng < gCost[ni]) { stampArr[ni] = stamp; gCost[ni] = ng; came[ni] = c.i; closed[ni] = 0; open.push({ i: ni, x: nx, y: ny, f: ng + h(nx, ny) }); }
    }
  }
  if (best === null) return null;
  const path = [];
  for (let i = best; i !== -1; i = came[i]) path.push({ x: (i % MW) * TILE + 16, y: Math.floor(i / MW) * TILE + 16 });
  path.reverse(); path.shift();
  const out = []; let cur = { x: sx * TILE + 16, y: sy * TILE + 16 }, k = 0;
  while (k < path.length) { let j = path.length - 1; while (j > k && !los(cur, path[j])) j--; out.push(path[j]); cur = path[j]; k = j + 1; }
  return out;
}

/** True when a unit-sized body can travel the straight segment a→b without touching a blocked tile. */
export function los(a, b) {
  const steps = Math.ceil(dist(a, b) / 10) + 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
    for (const [ox, oy] of [[0, 0], [8, 8], [-8, 8], [8, -8], [-8, -8]]) if (blocked(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE))) return false;
  }
  return true;
}
