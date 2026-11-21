// The ground options (a prototype behind ?ground=N, branch ground-options): the ground broken up at large scale. Pure
// (no DOM, no PixiJS): what goes where on a map, from the map alone (its rock, its water, its gold mines and every
// start, seated or not) and its seed, so every player of a game sees the same ground whoever sits where. Decoration
// only: the sim never sees any of it. Only exact arithmetic (+ - * / sqrt floor on doubles, integer hashes): no
// Math.sin, hypot or pow, whose last bit may differ between browsers and would move a threshold on one screen.
//   tone      broad meadows in the shade layers: dry (straw) and lush (deep green) fields, soft-edged, off the rock
//   paths     worn dirt tracks: every start to its mines, the starts to each other through the passes, each far mine
//             to the nearest track; a trodden yard at every start
//   patches   patches of another ground a few tiles across, far apart: straw in the open, clover by the woods
//   rockTone  the hills and the forests toned region by region and along their length (the shade layers again)
//   crags     an upper tier on the inside of the wide hills
//   outcrops  sparse flat slabs of bedrock in the open grass (walked over)
import { hash, noise } from './ground.js';

export const GROUND_OPTIONS = {
  1: { tone: true },
  2: { paths: true, patches: true },
  3: { rockTone: true, crags: true, outcrops: true },
  4: { tone: true, paths: true, rockTone: true, crags: true },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Every start of a map from the menu's preview (engine `mapPreview`: one byte a tile, 4 over each start's 4x4 tiles):
 *  the tile at each block's middle. */
export function startsOf(preview, w, h) {
  const out = [], at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? preview[y * w + x] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === 4 && at(x - 1, y) !== 4 && at(x, y - 1) !== 4) out.push({ tx: x + 2, ty: y + 2 });
  return out;
}

/** Steps (through sides and corners) from each tile to the nearest tile where `is(x, y)`, capped at `cap`; past the
 *  map's edge counts when `edge`. */
function distanceTo(w, h, is, cap, edge = false) {
  const d = new Uint8Array(w * h).fill(cap); let ring = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (is(x, y)) { d[y * w + x] = 0; ring.push(y * w + x); }
  for (let step = 1; step < cap; step++) {
    const next = [];
    if (step === 1 && edge) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && d[y * w + x] > 1) { d[y * w + x] = 1; next.push(y * w + x); }
    for (const i of ring) {
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy, j = ny * w + nx; if (nx < 0 || ny < 0 || nx >= w || ny >= h || d[j] <= step) continue; d[j] = step; next.push(j); }
    }
    ring = next;
  }
  return d;
}

/** Cheapest routes over a cost grid (Infinity: no way), eight ways, never cutting a blocked corner. `route(from, done,
 *  worn)`: from tile index `from` to the first tile where `done(i)`; tiles where `worn[i]` cost a third (so tracks
 *  join into trunks). Returns the tiles walked, `from` first, or null. */
function router(w, h, cost) {
  const n = w * h, dist = new Float64Array(n), prev = new Int32Array(n);
  let heap = new Int32Array(1024), key = new Float64Array(1024), size = 0; // (a binary heap of tiles by distance, then by index)
  const less = (a, b) => key[a] < key[b] || (key[a] === key[b] && heap[a] < heap[b]);
  const swap = (a, b) => { const i = heap[a], d = key[a]; heap[a] = heap[b]; key[a] = key[b]; heap[b] = i; key[b] = d; };
  const push = (i, d) => {
    if (size === heap.length) { const h2 = new Int32Array(size * 2), k2 = new Float64Array(size * 2); h2.set(heap); k2.set(key); heap = h2; key = k2; }
    heap[size] = i; key[size] = d; let k = size++;
    while (k > 0) { const p = (k - 1) >> 1; if (!less(k, p)) break; swap(k, p); k = p; }
  };
  const pop = () => {
    const i = heap[0]; size--; heap[0] = heap[size]; key[0] = key[size];
    for (let k = 0; ;) { let m = k; const a = 2 * k + 1, b = a + 1; if (a < size && less(a, m)) m = a; if (b < size && less(b, m)) m = b; if (m === k) break; swap(m, k); k = m; }
    return i;
  };
  return function route(from, done, worn = null) {
    dist.fill(Infinity); prev.fill(-1); size = 0; dist[from] = 0; push(from, 0);
    while (size) {
      const d = key[0], i = pop(); if (d > dist[i]) continue;
      if (done(i) && i !== from) { const path = []; for (let k = i; k >= 0; k = prev[k]) path.push(k); return path.reverse(); }
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || cost[j] === Infinity) continue;
        if (dx && dy && (cost[y * w + nx] === Infinity || cost[ny * w + x] === Infinity)) continue;
        const nd = d + cost[j] * (worn && worn[j] ? 0.33 : 1) * (dx && dy ? 1.41421356 : 1);
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(j, nd); }
      }
    }
    return null;
  };
}

/**
 * The plan for a map of w x h tiles: `rock(x, y)`, `depth(x, y)` (0 land, 1 shallows, 2 deep), `nodes` (the gold mines:
 * tx, ty, w, h), `starts` (startsOf), `kindAt(x, y)` (ground.js rockKinds: 'hill', 'forest' or null) and `regionAt`.
 * Returns per-tile grids (reading order), each null when its option is off:
 *   dry, lush   Float32Array 0-1: the meadows' tone (0 on the rock, beside it and in the water)
 *   rockTone    Float32Array -1..1 on rock tiles: warm (above 0) or cool (below), for a hill or a forest
 *   dirt, straw, clover, slab, crag   Uint8Array 0/1: the tiles each overlay ground covers (crag: hill tiles)
 */
export function planGround(opt, { w, h, rock, depth, nodes, starts, seed, kindAt, regionAt }) {
  const n = w * h, s = (seed | 0) % 9973, plan = { dry: null, lush: null, rockTone: null, dirt: null, straw: null, clover: null, slab: null, crag: null, opt };
  const land = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !rock(x, y) && depth(x, y) === 0;
  const dRock = distanceTo(w, h, (x, y) => rock(x, y), 12, true), dWet = distanceTo(w, h, (x, y) => !rock(x, y) && depth(x, y) > 0, 4);
  const dForest = distanceTo(w, h, (x, y) => rock(x, y) && kindAt(x, y) === 'forest', 8);

  // The meadows: two warped noises over the map, each cut to fields with a soft edge of a tile or so. Drier out in the
  // open, lusher by the woods; none on a tile beside rock or water (the shade layers blend between tile centers, so
  // the tone has faded out half a tile before a hill's or a forest's edge: they keep today's ground at their foot).
  const meadow = (x, y) => {
    if (!land(x, y) || dRock[y * w + x] < 2 || dWet[y * w + x] < 2) return [0, 0];
    const wx = x + (noise(x / 6 + s * 0.13, y / 6 + 3.1) - 0.5) * 7, wy = y + (noise(x / 6 - 7.7, y / 6 + s * 0.29) - 0.5) * 7;
    const a = noise(wx / 6.5 + s * 0.71, wy / 6.5 - s * 0.37) * 0.72 + noise(wx / 2.6 + 11.3, wy / 2.6 + s * 0.53) * 0.28;
    const b = noise(wx / 7.5 - s * 0.43, wy / 7.5 + s * 0.67 + 40) * 0.72 + noise(wx / 2.9 - 5.9, wy / 2.9 - s * 0.19) * 0.28;
    const open = clamp01((dRock[y * w + x] - 3) / 5), woods = dForest[y * w + x] < 6 ? 1 - Math.abs(dForest[y * w + x] - 3) / 3 : 0;
    const edge = clamp01((Math.min(dRock[y * w + x], dWet[y * w + x]) - 1) / 2);
    const dry = smooth(0.55, 0.615, a + open * 0.05 - woods * 0.04) * edge;
    return [dry, smooth(0.55, 0.615, b + woods * 0.07 - open * 0.03) * (1 - dry) * edge];
  };
  if (opt.tone) {
    plan.dry = new Float32Array(n); plan.lush = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [d, l] = meadow(x, y); plan.dry[y * w + x] = d; plan.lush[y * w + x] = l; }
  }

  // Patches: ragged rounds a few tiles across, scattered far apart from the seed, each kind where the map suggests it.
  const put = [], far = (list, x, y, d) => list.every(p => (p.tx - x) * (p.tx - x) + (p.ty - y) * (p.ty - y) >= d * d);
  const blob = (mask, x, y, rx, ry, minRock) => {
    put.push({ tx: x, ty: y });
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const e = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (noise((x + dx) / 2.2 + 5, (y + dy) / 2.2 + s) - 0.5) * 1.5;
      if (e < 1 && land(x + dx, y + dy) && dRock[(y + dy) * w + x + dx] >= minRock && dWet[(y + dy) * w + x + dx] >= 2) mask[(y + dy) * w + x + dx] = 1;
    }
  };
  if (opt.patches) {
    plan.straw = new Uint8Array(n); plan.clover = new Uint8Array(n);
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
      const i = y * w + x, r = hash(x * 3 + s, y * 5 + 57);
      if (r > 0.07 || dRock[i] < 3 || dWet[i] < 3 || !far(starts, x, y, 7) || !far(nodes, x, y, 4) || !far(put, x, y, 10)) continue;
      const rx = 1.8 + hash(x + 7, y + s) * 2.2, ry = 1.5 + hash(x + s, y + 13) * 1.6;
      if (dForest[i] <= 5) blob(plan.clover, x, y, rx * 0.8, ry * 0.8, 2); else if (dRock[i] >= 4) blob(plan.straw, x, y, rx, ry, 2);
    }
  }

  // The rock's tone: each region its own lean, warm or cool, and a slow drift along it, so one hill is a tan sandstone
  // and the next a blue slate, and a long band changes as it runs.
  if (opt.rockTone) {
    const t = plan.rockTone = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rock(x, y)) {
      const lean = hash(regionAt(x, y) * 131 + 17, s * 7 + 3) * 2 - 1, drift = noise(x / 9 + s * 0.21, y / 9 - s * 0.33) * 2 - 1;
      t[y * w + x] = Math.max(-1, Math.min(1, lean * 0.75 + drift * 0.9));
    }
  }

  if (opt.paths) plan.dirt = tracks(w, h, { land, rock, depth, nodes, starts, s, dRock, dWet });
  // (worn ground under a lush meadow's cool tone goes gray: the tone gives way on the tracks and the yards)
  if (plan.dirt && plan.lush) for (let i = 0; i < n; i++) if (plan.dirt[i]) plan.lush[i] *= 0.25;

  // The outcrops: flat slabs of bedrock, a few tiles across, far apart, off the bases, the mines and the rock.
  if (opt.outcrops) {
    plan.slab = new Uint8Array(n);
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
      if (hash(x * 3 + s, y * 5 + 91) > 0.05 || dRock[y * w + x] < 4 || dWet[y * w + x] < 4 || !far(starts, x, y, 10) || !far(nodes, x, y, 5) || !far(put, x, y, 17)) continue;
      blob(plan.slab, x, y, 1.3 + hash(x + 7, y + s) * 1.5, 1.1 + hash(x + s, y + 13) * 1.1, 3);
    }
  }

  // The crags: on a hill's tiles two or more from its edge, in ragged parts (a noise), none smaller than three tiles.
  if (opt.crags) {
    const dOut = distanceTo(w, h, (x, y) => !rock(x, y), 4);
    plan.crag = bigOnly(w, h, Uint8Array.from({ length: n }, (_, i) => { const x = i % w, y = (i - x) / w; return rock(x, y) && kindAt(x, y) === 'hill' && dOut[i] >= 2 && noise(x / 2.6 + s * 0.3, y / 2.6 - s * 0.7) > 0.4 ? 1 : 0; }), 3);
  }
  return plan;
}

/** `mask` without its connected scraps of fewer than `min` tiles (joined through sides). */
function bigOnly(w, h, mask, min) {
  const seen = new Uint8Array(w * h);
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!mask[i0] || seen[i0]) continue;
    const part = [i0]; seen[i0] = 1;
    for (let k = 0; k < part.length; k++) { const i = part[k], x = i % w; for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) if (j >= 0 && j < w * h && mask[j] && !seen[j]) { seen[j] = 1; part.push(j); } }
    if (part.length < min) for (const i of part) mask[i] = 0;
  }
  return mask;
}

/** The worn ground: a yard at every start, tracks from each start to its own mines and to the other starts, and from
 *  every other mine to the nearest track. A track winds a little (a noise in its cost), keeps off the rock's foot and the waterline where
 *  it can, fords the shallows (not drawn there) and joins a track already worn rather than run beside it. */
function tracks(w, h, { land, rock, depth, nodes, starts, s, dRock, dWet }) {
  const n = w * h, dirt = new Uint8Array(n), cost = new Float32Array(n), at = (x, y) => y * w + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = depth(x, y);
    const v = noise(x / 3.2 + s * 0.17, y / 3.2 - s * 0.41);
    cost[at(x, y)] = rock(x, y) || d === 2 ? Infinity : (1 + 6 * v * v + (dRock[at(x, y)] < 2 || (d === 0 && dWet[at(x, y)] < 2) ? 5 : 0)) * (d === 1 ? 5 : 1);
  }
  for (const m of nodes) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.tx + x < w && m.ty + y < h) cost[at(m.tx + x, m.ty + y)] = Infinity;
  const route = router(w, h, cost);
  const wear = (path) => { // (a diagonal step wears one of its two corners too: a track is never joined by corners alone)
    if (!path) return;
    for (let k = 0; k < path.length; k++) {
      const i = path[k]; if (land(i % w, (i - i % w) / w)) dirt[i] = 1;
      if (!k) continue;
      const p = path[k - 1], dx = i % w - p % w, dy = (i - p - dx) / w;
      if (dx && dy) { const a = p + dx, b = p + dy * w, c = cost[a] <= cost[b] ? a : b; if (land(c % w, (c - c % w) / w)) dirt[c] = 1; }
    }
  };
  // the yards: a trodden round some 3 tiles out from each start's middle, ragged
  for (const st of starts) for (let dy = -6; dy <= 5; dy++) for (let dx = -6; dx <= 5; dx++) {
    const x = st.tx + dx, y = st.ty + dy; if (!land(x, y)) continue;
    const r2 = (dx + 0.5) * (dx + 0.5) + (dy + 0.5) * (dy + 0.5), r = 2.5 + noise(x / 2.1 + s, y / 2.1 - s) * 1.5;
    if (r2 < r * r) dirt[at(x, y)] = 1;
  }
  // a mine's mouth: the tile under its foot (the cart's side), or any tile round it
  const mouth = (m) => {
    const sx = m.tx + (m.w >> 1), sy = m.ty + m.h; if (land(sx, sy)) return [at(sx, sy)];
    const ring = []; for (let y = -1; y <= m.h; y++) for (let x = -1; x <= m.w; x++) if ((x < 0 || y < 0 || x === m.w || y === m.h) && land(m.tx + x, m.ty + y)) ring.push(at(m.tx + x, m.ty + y));
    return ring;
  };
  const home = (m) => starts.find(st => (st.tx - m.tx) * (st.tx - m.tx) + (st.ty - m.ty) * (st.ty - m.ty) < 13 * 13);
  const center = (st) => at(Math.min(w - 1, st.tx), Math.min(h - 1, st.ty));
  for (const m of nodes) { const st = home(m), ms = mouth(m); if (st && ms.length) wear(route(center(st), (i) => ms.includes(i), dirt)); }
  // start to start: each start to its three nearest (every pair, on a map of four); the short ones first
  const links = [];
  starts.forEach((a, i) => { // (nearest as the crow flies: a walk's length would cost a search of the whole map per start)
    const near = starts.map((b, j) => [(a.tx - b.tx) * (a.tx - b.tx) + (a.ty - b.ty) * (a.ty - b.ty), j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (const [d, j] of near.slice(0, 3)) if (!links.some(l => l[1] === Math.min(i, j) && l[2] === Math.max(i, j))) links.push([d, Math.min(i, j), Math.max(i, j)]);
  });
  links.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  for (const [, i, j] of links) { const goal = center(starts[j]); wear(route(center(starts[i]), (k) => k === goal, dirt)); }
  // the other mines: each to the nearest worn tile
  for (const m of nodes) { if (home(m)) continue; const ms = mouth(m); if (ms.length) wear(route(ms[0], (i) => dirt[i] === 1 && !ms.includes(i), dirt)); }
  return dirt;
}
