// What goes where on the ground, pure (no DOM, no PixiJS): the ground broken up at large scale, from the map alone (its
// rock, its water, its gold mines and every start, seated or not) and its seed, so every player of a game sees the same
// ground whoever sits where. Decoration only: the sim never sees any of it. Only exact arithmetic (+ - * / sqrt floor on
// doubles, integer hashes): no Math.sin, hypot or pow, whose last bit may differ between browsers and would move a
// threshold on one screen. Sorts break ties on an index. gl/render.js draws the plan:
//   dry, lush  broad meadows in the shade layers (gl/ground.js shadeLayers): dry (an olive straw) and lush (a deep
//              green) fields 5 to 12 tiles across, soft-edged, off the rock and the water
//   dirt       worn ground as overlay tiles (gl/groundpaint.js): a trodden yard at every start, tracks from each start
//              to its mines, between the starts, and from every other mine to the nearest track
//   rockTone   each hill and forest toned warm or cool, drifting along its length (the shade layers again)
//   crag       an upper tier on the inside of the wide hills (overlay tiles)
import { hash, noise } from './ground.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Every start of a map from the menu's preview (engine `mapPreview`: one byte a tile, 4 over each start's 4x4 tiles):
 *  the tile at each block's middle, in reading order. The same whoever is seated where. */
export function startsOf(preview, w, h) {
  const out = [], at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? preview[y * w + x] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === 4 && at(x - 1, y) !== 4 && at(x, y - 1) !== 4) out.push({ tx: x + 2, ty: y + 2 });
  return out;
}

/** Steps (through sides and corners) from each tile to the nearest tile marked in `mask`, capped at `cap`; past the
 *  map's edge counts as one when `edge`. */
function distanceTo(w, h, mask, cap, edge = false) {
  const n = w * h, d = new Uint8Array(n).fill(cap), queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (mask[i]) { d[i] = 0; queue[tail++] = i; }
  if (edge && cap > 1) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && d[i] > 1) { d[i] = 1; queue[tail++] = i; }
  }
  while (head < tail) { // (breadth first: each tile's steps one more than the tile it was reached from)
    const i = queue[head++], x = i % w, y = (i - x) / w, next = d[i] + 1;
    if (next >= cap) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || d[j] <= next) continue;
      d[j] = next; queue[tail++] = j;
    }
  }
  return d;
}

/** The connected parts of `mask` (through sides and corners when `corners`), each a list of tile indices. */
function parts(w, h, mask, corners) {
  const seen = new Uint8Array(w * h), out = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!mask[i0] || seen[i0]) continue;
    const part = [i0]; seen[i0] = 1;
    for (let k = 0; k < part.length; k++) {
      const i = part[k], x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!corners && dx && dy)) continue;
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[j] && !seen[j]) { seen[j] = 1; part.push(j); }
      }
    }
    out.push(part);
  }
  return out;
}

/** Cheap routes over a cost grid (Infinity: no way), eight ways, never cutting a blocked corner. `route(from, goal,
 *  worn)`: from tile index `from` to tile `goal` (A*, guided by the distance as the crow flies at the cost of open
 *  ground: the cheapest route but where worn ground shortens it), or with `goal` an array of 0/1 per tile, to the
 *  nearest tile marked (Dijkstra); tiles where `worn[i]` cost WORN_COST (so tracks join into trunks). Returns the tiles
 *  walked, `from` first, or null. */
const WORN_COST = 0.33, DIAGONAL = 1.41421356;
function router(w, h, cost) {
  const n = w * h, dist = new Float64Array(n), prev = new Int32Array(n);
  let heap = new Int32Array(1024), key = new Float64Array(1024), size = 0; // (a binary heap of tiles by estimate, then by index)
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
  return function route(from, goal, worn) {
    const one = typeof goal === 'number', gx = one ? goal % w : 0, gy = one ? (goal - gx) / w : 0;
    const est = (x, y) => { if (!one) return 0; const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + (DIAGONAL - 1) * Math.min(dx, dy); };
    dist.fill(Infinity); prev.fill(-1); size = 0; dist[from] = 0; push(from, est(from % w, (from - from % w) / w));
    while (size) {
      const i = pop(), x = i % w, y = (i - x) / w, d = dist[i];
      if (i !== from && (one ? i === goal : goal[i])) { const path = []; for (let k = i; k >= 0; k = prev[k]) path.push(k); return path.reverse(); }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || cost[j] === Infinity) continue;
        if (dx && dy && (cost[y * w + nx] === Infinity || cost[ny * w + x] === Infinity)) continue;
        const nd = d + cost[j] * (worn[j] ? WORN_COST : 1) * (dx && dy ? DIAGONAL : 1);
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(j, nd + est(nx, ny)); }
      }
    }
    return null;
  };
}

/** A track fades out over this many tiles before the rock or the water cuts it (a pass, a gate, a ford): never a
 *  broken piece in a pass, nor a track that stops dead at a hill. */
export const TRACK_FADE = 3;
/** Pieces of worn ground smaller than this many tiles, left between two cuts, are not drawn. */
export const TRACK_MIN = 6;

/**
 * The plan for a map of w x h tiles: `rock` (1 a rock tile) and `depth` (0 land, 1 shallows, 2 deep), grids in reading
 * order, `nodes` (the gold mines: tx, ty, w, h), `starts` (startsOf), `seed`, and the rock's regions (gl/ground.js rockKinds: `kindAt(x, y)`, 'hill',
 * 'forest' or null, and `regionAt`). Per-tile grids in reading order:
 *   dry, lush   Float32Array 0-1: the meadows' tone (0 on the rock, beside it and in the water)
 *   rockTone    Float32Array -1..1 on rock tiles: warm (above 0) or cool (below); 0 on the rock's outer tiles (its
 *               edge keeps its look) and at the map's edge, where the apron's rock (gl/render.js) carries on untoned
 *   dirt        Float32Array 0-1: the worn ground's strength (0: none; under 1 where a track fades out)
 *   crag        Uint8Array 0/1: the hill tiles of an upper tier
 * Worn ground is only ever on land whose eight neighbors are land too, so every dual-grid cell it touches is drawn
 * whole (gl/render.js draws no overlay in a cell with rock or water in it); a crag's eight neighbors are all hill.
 */
export function planGround({ w, h, rock, depth, nodes, starts, seed, kindAt, regionAt }) {
  const n = w * h, s = (seed | 0) % 9973, wetA = new Uint8Array(n), forestA = new Uint8Array(n), openA = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % w;
    wetA[i] = !rock[i] && depth[i] > 0 ? 1 : 0; openA[i] = rock[i] ? 0 : 1; forestA[i] = rock[i] && kindAt(x, (i - x) / w) === 'forest' ? 1 : 0;
  }
  const land = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !rock[y * w + x] && !depth[y * w + x];
  const dRock = distanceTo(w, h, rock, 12, true), dWet = distanceTo(w, h, wetA, 4), dForest = distanceTo(w, h, forestA, 8), dOut = distanceTo(w, h, openA, 4, true);
  const ctx = { w, h, s, land, rock, depth, nodes, starts, dRock, dWet, dOut };
  const { dry, lush } = meadows(ctx, dForest);
  const dirt = tracks(ctx);
  // (worn ground under a meadow's tone goes gray or yellow: the tone mostly gives way on the tracks and the yards)
  for (let i = 0; i < n; i++) if (dirt[i]) { lush[i] *= 0.25; dry[i] *= 0.5; }
  return { dry, lush, dirt, rockTone: rockTone(ctx, regionAt), crag: crags(ctx, kindAt) };
}

/** A hash of a plan's grids, bit for bit (FNV-1a over their bytes): the tests' check that every browser lays the
 *  same ground. */
export function planHash(plan) {
  let h = 2166136261;
  for (const k of ['dry', 'lush', 'dirt', 'rockTone', 'crag']) {
    const b = new Uint8Array(plan[k].buffer, plan[k].byteOffset, plan[k].byteLength);
    for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619);
  }
  return h >>> 0;
}

/** The meadows: two warped noises over the map, each cut to fields with a soft edge of a tile or so. Drier out in the
 *  open, lusher by the woods; none on a tile beside rock or water (the shade layers blend between tile centers, so
 *  the tone has faded out half a tile before a hill's or a forest's edge: they keep today's ground at their foot). */
function meadows({ w, h, s, land, dRock, dWet }, dForest) {
  const dry = new Float32Array(w * h), lush = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!land(x, y) || dRock[i] < 2 || dWet[i] < 2) continue;
    const wx = x + (noise(x / 6 + s * 0.13, y / 6 + 3.1) - 0.5) * 7, wy = y + (noise(x / 6 - 7.7, y / 6 + s * 0.29) - 0.5) * 7;
    const a = noise(wx / 6.5 + s * 0.71, wy / 6.5 - s * 0.37) * 0.72 + noise(wx / 2.6 + 11.3, wy / 2.6 + s * 0.53) * 0.28;
    const b = noise(wx / 7.5 - s * 0.43, wy / 7.5 + s * 0.67 + 40) * 0.72 + noise(wx / 2.9 - 5.9, wy / 2.9 - s * 0.19) * 0.28;
    const open = clamp01((dRock[i] - 3) / 5), woods = dForest[i] < 6 ? 1 - Math.abs(dForest[i] - 3) / 3 : 0;
    const edge = clamp01((Math.min(dRock[i], dWet[i]) - 1) / 2);
    dry[i] = smooth(0.55, 0.615, a + open * 0.05 - woods * 0.04) * edge;
    lush[i] = smooth(0.55, 0.615, b + woods * 0.07 - open * 0.03) * (1 - dry[i]) * edge;
  }
  return { dry, lush };
}

/** The rock's tone: each region its own lean, warm or cool, and a slow drift along it, so one hill is a tan sandstone
 *  and the next a blue slate, and a long band changes as it runs; only on rock tiles with rock all round (the shade
 *  layers blend it out toward the edge's tiles), fading out over the three tiles at the map's edge. */
function rockTone({ w, h, s, dOut }, regionAt) {
  const t = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dOut[y * w + x] >= 2) {
    const lean = hash(regionAt(x, y) * 131 + 17, s * 7 + 3) * 2 - 1, drift = noise(x / 9 + s * 0.21, y / 9 - s * 0.33) * 2 - 1;
    const rim = clamp01(Math.min(x, y, w - 1 - x, h - 1 - y) / 3);
    t[y * w + x] = Math.max(-1, Math.min(1, lean * 0.75 + drift * 0.9)) * rim;
  }
  return t;
}

/** The crags: on a hill's tiles two or more from its edge and from the map's, in ragged parts (a noise), none smaller
 *  than three tiles (joined through sides). */
function crags({ w, h, s, rock, dOut }, kindAt) {
  const crag = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rock[y * w + x] && kindAt(x, y) === 'hill' && dOut[y * w + x] >= 2 && noise(x / 2.6 + s * 0.3, y / 2.6 - s * 0.7) > 0.4) crag[y * w + x] = 1;
  }
  for (const part of parts(w, h, crag, false)) if (part.length < 3) for (const i of part) crag[i] = 0;
  return crag;
}

/** The worn ground: a yard at every start, tracks from each start to its own mines and to the other starts, and from
 *  every other mine to the nearest track. A track winds a little (a noise in its cost), keeps off the rock's foot and
 *  the waterline where it can, fords the shallows and joins a track already worn rather than run beside it. Then it
 *  keeps only to open land (eight land neighbors), fades out over TRACK_FADE tiles where that cuts it, and drops the
 *  pieces left under TRACK_MIN tiles. */
function tracks({ w, h, s, land, rock, depth, nodes, starts, dRock, dWet }) {
  const n = w * h, worn = new Uint8Array(n), cost = new Float32Array(n), at = (x, y) => y * w + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y), d = depth[i], v = noise(x / 3.2 + s * 0.17, y / 3.2 - s * 0.41);
    cost[i] = rock[i] || d === 2 ? Infinity : (1 + 6 * v * v + (dRock[i] < 2 || (d === 0 && dWet[i] < 2) ? 5 : 0)) * (d === 1 ? 5 : 1);
  }
  for (const m of nodes) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.tx + x < w && m.ty + y < h) cost[at(m.tx + x, m.ty + y)] = Infinity;
  const route = router(w, h, cost), paths = [];
  // A path wears its tiles, and a diagonal step one of its two corners too (a track is never joined by corners alone):
  // kept in order, so the fade can follow it.
  const wear = (path) => {
    if (!path) return;
    const walked = [];
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      if (k) {
        const p = path[k - 1], dx = i % w - p % w, dy = (i - p - dx) / w;
        if (dx && dy) { const a = p + dx, b = p + dy * w; walked.push(cost[a] <= cost[b] ? a : b); }
      }
      walked.push(i);
    }
    for (const i of walked) worn[i] = 1;
    paths.push(walked);
  };
  // the yards: a trodden round some 3 tiles out from each start's middle, ragged
  for (const st of starts) for (let dy = -6; dy <= 5; dy++) for (let dx = -6; dx <= 5; dx++) {
    const x = st.tx + dx, y = st.ty + dy; if (!land(x, y)) continue;
    const r2 = (dx + 0.5) * (dx + 0.5) + (dy + 0.5) * (dy + 0.5), r = 2.5 + noise(x / 2.1 + s, y / 2.1 - s) * 1.5;
    if (r2 < r * r) worn[at(x, y)] = 1;
  }
  // a mine's mouth: the tile under its foot (the cart's side), or any tile round it
  const mouth = (m) => {
    const sx = m.tx + (m.w >> 1), sy = m.ty + m.h; if (land(sx, sy)) return [at(sx, sy)];
    const ring = []; for (let y = -1; y <= m.h; y++) for (let x = -1; x <= m.w; x++) if ((x < 0 || y < 0 || x === m.w || y === m.h) && land(m.tx + x, m.ty + y)) ring.push(at(m.tx + x, m.ty + y));
    return ring;
  };
  const home = (m) => starts.find(st => (st.tx - m.tx) * (st.tx - m.tx) + (st.ty - m.ty) * (st.ty - m.ty) < 13 * 13);
  const center = (st) => at(Math.min(w - 1, st.tx), Math.min(h - 1, st.ty));
  const marks = (tiles) => { const g = new Uint8Array(n); for (const i of tiles) g[i] = 1; return g; };
  for (const m of nodes) { const st = home(m), ms = mouth(m); if (st && ms.length) wear(route(center(st), ms.length === 1 ? ms[0] : marks(ms), worn)); }
  // start to start: each start to its three nearest (every pair, on a map of four), the short ones first (nearest as
  // the crow flies: a walk's length would cost a search of the whole map per start)
  const links = [];
  starts.forEach((a, i) => {
    const near = starts.map((b, j) => [(a.tx - b.tx) * (a.tx - b.tx) + (a.ty - b.ty) * (a.ty - b.ty), j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (const [d, j] of near.slice(0, 3)) if (!links.some(l => l[1] === Math.min(i, j) && l[2] === Math.max(i, j))) links.push([d, Math.min(i, j), Math.max(i, j)]);
  });
  links.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  for (const [, i, j] of links) wear(route(center(starts[i]), center(starts[j]), worn));
  // the other mines: each to the nearest worn tile
  for (const m of nodes) {
    if (home(m)) continue;
    const ms = mouth(m); if (!ms.length) continue;
    const goal = worn.slice(); for (const i of ms) goal[i] = 0;
    wear(route(ms[0], goal, worn));
  }

  // Only open land: a worn tile with rock or water among its eight neighbors would be cut by the cells gl/render.js
  // leaves as they are, into a broken piece in a pass. Then the small pieces left go.
  const dirt = new Float32Array(n), kept = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (worn[i] && dRock[i] >= 2 && dWet[i] >= 2) kept[i] = 1;
  for (const part of parts(w, h, kept, true)) if (part.length < TRACK_MIN) for (const i of part) kept[i] = 0;
  for (let i = 0; i < n; i++) if (kept[i]) dirt[i] = 1;
  // The fade: along each path, the tiles within TRACK_FADE of a cut lose strength a step a tile toward it.
  for (const path of paths) for (let k = 0; k < path.length; k++) {
    if (kept[path[k]]) continue;
    for (let d = 1; d <= TRACK_FADE; d++) for (const j of [k - d, k + d]) {
      if (j < 0 || j >= path.length || !kept[path[j]]) continue;
      dirt[path[j]] = Math.min(dirt[path[j]], d / (TRACK_FADE + 1));
    }
  }
  return dirt;
}
