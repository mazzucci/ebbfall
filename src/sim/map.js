// Terrain, resource nodes and the occupancy grid. One map per game; resetGame() regenerates it.
import { TILE, MW, MH, BASES } from './constants.js';
import { mulberry, makeNoise } from './util.js';
import { ids } from './ids.js';

export const map = {
  /** 1 = impassable rock. */
  rock: new Uint8Array(MW * MH),
  /** 0 free, >0 building id, <0 negative resource-node id. */
  occ: new Int32Array(MW * MH),
  /** Noise value per tile, kept for the renderer. */
  shade: new Float32Array(MW * MH),
  /** Resource nodes: shard fields (1 tile) and ether vents (2x2). */
  nodes: [],
};

export const idx = (x, y) => y * MW + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
export const blocked = (x, y) => !inMap(x, y) || map.rock[idx(x, y)] || map.occ[idx(x, y)] !== 0;

export function genMap(seed) {
  const rnd = mulberry(seed), noise = makeNoise(rnd);
  map.nodes = [];
  map.occ.fill(0);
  let thr = 0.6;
  for (let attempt = 0; attempt < 12; attempt++) {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const n = noise(x / 7.5, y / 7.5);
      map.shade[idx(x, y)] = n;
      let r = n > thr ? 1 : 0;
      if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) r = 1;
      for (const b of BASES) if (Math.hypot(x - b.x - 1.5, y - b.y - 1.5) < 12) r = 0;
      for (const e of [[32, 32, 7], [16, 22, 6], [47, 41, 6], [14, 38, 4], [49, 25, 4]]) if (Math.hypot(x - e[0], y - e[1]) < e[2]) r = 0;
      map.rock[idx(x, y)] = r;
    }
    if (connected(BASES[0].x, BASES[0].y, BASES[1].x, BASES[1].y)) break;
    thr += 0.03;
  }
  const addShards = (cx, cy, ang, n, rad) => {
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * 0.32, d = rad + ((i % 2) ? 0.9 : 0);
      let tx = Math.round(cx + Math.cos(a) * d), ty = Math.round(cy + Math.sin(a) * d);
      for (let k = 0; k < 6 && (!inMap(tx, ty) || map.occ[idx(tx, ty)] || (map.rock[idx(tx, ty)] && k > 3)); k++) { tx += Math.sign(Math.cos(a)); ty += Math.sign(Math.sin(a)); }
      if (!inMap(tx, ty)) continue;
      map.rock[idx(tx, ty)] = 0;
      const nd = { id: ids.next++, kind: 'node', type: 'shard', tx, ty, x: tx * TILE + 16, y: ty * TILE + 16, amount: 1500, miners: 0, r: 14 };
      map.nodes.push(nd);
      map.occ[idx(tx, ty)] = -nd.id;
    }
  };
  const addVent = (tx, ty) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) map.rock[idx(tx + x, ty + y)] = 0;
    const nd = { id: ids.next++, kind: 'node', type: 'ether', tx, ty, x: tx * TILE + 32, y: ty * TILE + 32, amount: 5000, miners: 0, r: 24, w: 2, h: 2, extractor: null };
    map.nodes.push(nd);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) map.occ[idx(tx + x, ty + y)] = -nd.id;
  };
  addShards(BASES[0].x + 1.5, BASES[0].y + 1.5, Math.PI * 0.75, 7, 6.5); addVent(BASES[0].x + 9, BASES[0].y - 2);
  addShards(BASES[1].x + 1.5, BASES[1].y + 1.5, -Math.PI * 0.25, 7, 6.5); addVent(BASES[1].x - 7, BASES[1].y + 4);
  addShards(32, 32, Math.PI * 0.5, 6, 5); addVent(27, 27);
  addShards(16, 22, Math.PI, 5, 4.5); addShards(47, 41, 0, 5, 4.5);
}

/** Flood fill over passable rock (ignores occupancy). */
export function connected(ax, ay, bx, by) {
  const seen = new Uint8Array(MW * MH), q = [[ax, ay]];
  seen[idx(ax, ay)] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    if (x === bx && y === by) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inMap(nx, ny) && !map.rock[idx(nx, ny)] && !seen[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; q.push([nx, ny]); }
    }
  }
  return false;
}

/** Nearest unblocked tile to (tx,ty) within a square radius, searching ring by ring. */
export function nearestFree(tx, ty, maxR = 8) {
  if (!blocked(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = tx + dx, y = ty + dy;
    if (!blocked(x, y)) return { x, y };
  }
  return null;
}
