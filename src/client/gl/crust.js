// The gold outcrops' bed, pure (no DOM, no PixiJS): gl/render.js draws it under the gold, and the art's review can draw
// the same. A clump of gold nodes (the sim lays a field's lumps in a clump, a tile or so apart; the sim still calls
// them salt, `shard`) stands on one bed of bare trodden earth: the union of soft blobs round its nodes, bridged along
// the shortest links between them so it is always one mass, its outline wobbled by a noise fixed to the map; soft at
// its edge and never opaque, so the grass shows through (the re-theme's ground family: a pale salt crust read as a
// plinth under the gold).

const TILE = 32;
/** Texels per world px of a crust's image (the atlas is 2; the crust is soft, so less costs a phone less memory). */
export const CRUST_K = 1;
/** How far (tiles) two nodes may lie apart and still share a bed. */
const LINK = 3.2;
/** The blobs: a node's spread (tiles), a link's half-width spread and weight, the threshold of the outline. */
const SIGMA = 0.42, BRIDGE = 0.4, BRIDGE_W = 0.7, EDGE = 0.18;
/** How far past its outermost node a bed's image reaches (tiles): the blob and the wobble. */
const MARGIN = 1.5;

function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2246822519 + 977) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
/** Smooth value noise over a 256-cell table that repeats (a map is at most 128 tiles: no repeat shows), `s` a shift. */
let LAT = null;
function noise(x, y, s = 0) {
  if (!LAT) { LAT = new Float32Array(256 * 256); for (let i = 0; i < LAT.length; i++) LAT[i] = hash(i & 255, i >> 8, 5); }
  const xf = Math.floor(x), yf = Math.floor(y), u = x - xf, v = y - yf, xi = (xf + s * 37) & 255, yi = (yf + s * 91) & 255, x1 = (xi + 1) & 255, y1 = ((yi + 1) & 255) << 8, y0 = yi << 8;
  const a = LAT[y0 + xi], b = LAT[y0 + x1], c = LAT[y1 + xi], d = LAT[y1 + x1], fu = u * u * (3 - 2 * u), fv = v * v * (3 - 2 * v);
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Which of the outcrop's variants (tools/render3d/country.js `GOLD_VARIANTS`: `shard_k`, `shard_k_1..3`) the node on
 *  tile (tx, ty) draws: fixed by its tile, so every side and every frame agrees. */
export const crystalVariant = (tx, ty, n = 4) => Math.floor(hash(tx, ty, 7) * n);

/**
 * The salt nodes (`{ tx, ty }`) in clumps: nodes within LINK tiles of each other, and so on, share one. Each clump
 * `{ nodes, links }`: its nodes in the order given and the links of its shortest spanning tree (index pairs), the
 * bridges that keep its crust one mass. Clumps in the order of their first node.
 */
export function saltClumps(nodes) {
  const n = nodes.length, root = nodes.map((_, i) => i);
  const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  const d = (a, b) => Math.hypot(nodes[a].tx - nodes[b].tx, nodes[a].ty - nodes[b].ty);
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (d(i, j) <= LINK) pairs.push([d(i, j), i, j]);
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const links = [];
  for (const [, i, j] of pairs) { const a = find(i), b = find(j); if (a !== b) { root[Math.max(a, b)] = Math.min(a, b); links.push([i, j]); } }
  const by = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!by.has(r)) by.set(r, { nodes: [], at: new Map(), links: [] }); const c = by.get(r); c.at.set(i, c.nodes.length); c.nodes.push(nodes[i]); }
  for (const [i, j] of links) { const c = by.get(find(i)); c.links.push([c.at.get(i), c.at.get(j)]); }
  return [...by.values()].map(({ nodes, links }) => ({ nodes, links }));
}

/** No grass inside a bed: the field raised, softly, over any pocket below its outline that the outside does not
 *  reach (a clump laid round an empty middle, or a dip in the wobble), so the bed is one mass without holes. */
function fillHoles(F, w, h) {
  const out = new Uint8Array(w * h), stack = [];
  const push = (i) => { if (!out[i] && F[i] <= 0) { out[i] = 1; stack.push(i); } };
  for (let i = 0; i < w; i++) { push(i); push((h - 1) * w + i); }
  for (let j = 0; j < h; j++) { push(j * w); push(j * w + w - 1); }
  while (stack.length) { const i = stack.pop(), x = i % w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w); }
  let any = false; const m = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (F[i] <= 0 && !out[i]) { m[i] = 1; any = true; }
  if (!any) return;
  const R = 5, tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {   // a box blur twice, across then down: the pocket's raise fades out round it
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let t = 0; for (let k = -R; k <= R; k++) t += m[j * w + Math.max(0, Math.min(w - 1, i + k))]; tmp[j * w + i] = t / (2 * R + 1); }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let t = 0; for (let k = -R; k <= R; k++) t += tmp[Math.max(0, Math.min(h - 1, j + k)) * w + i]; m[j * w + i] = t / (2 * R + 1); }
  }
  for (let i = 0; i < w * h; i++) if (m[i] > 0) F[i] = Math.max(F[i] + 0.4 * Math.min(1, m[i] * 3), out[i] ? F[i] : 0.05);
}

/** The earth: a dusty brown in two tones mottled together, and the most of it that covers the grass (the edge less, a
 *  noise taking a little more or less): tools/art/retheme-ground.mjs's `earthBed`, as approved. */
const EARTH = [112, 100, 76], EARTH_DIM = [94, 86, 64], EARTH_ALPHA = 0.55;
/** How soft its edge is: texels from nothing at the outline to the full alpha inside it. */
const SOFT = 12;

/**
 * A clump's bed as an RGBA image: `{ x, y, w, h, k, data }`, its top-left corner at world px (x, y), w x h texels of
 * 1/k world px. Earth at an alpha under EARTH_ALPHA (straight alpha), fading out over SOFT texels inside its outline.
 */
export function crustImage(clump, k = CRUST_K) {
  const ns = clump.nodes.map(n => [n.tx + 0.5, n.ty + 0.5]);
  const tx0 = Math.min(...ns.map(p => p[0])) - MARGIN, ty0 = Math.min(...ns.map(p => p[1])) - MARGIN;
  const tx1 = Math.max(...ns.map(p => p[0])) + MARGIN, ty1 = Math.max(...ns.map(p => p[1])) + MARGIN;
  const x = Math.floor(tx0 * TILE), y = Math.floor(ty0 * TILE), w = Math.ceil((tx1 * TILE - x) * k), h = Math.ceil((ty1 * TILE - y) * k);
  const segs = clump.links.map(([a, b]) => [ns[a], ns[b]]);
  // (a clump laid in a ring would leave ground in its middle: a broad blob at its centre fills it)
  const mx = ns.reduce((t, p) => t + p[0], 0) / ns.length, my = ns.reduce((t, p) => t + p[1], 0) / ns.length;
  const spread = Math.sqrt(ns.reduce((t, p) => t + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0) / ns.length), c2 = 2 * (0.45 * spread + 0.15) ** 2;
  // The field: blobs round the nodes, bridges along the links, the map's own wobble; its EDGE contour the outline. The
  // blobs and bridges are smooth: worked out on a coarse grid (every STEP world px) and interpolated.
  const STEP = 3, gw = Math.ceil(w / k / STEP) + 2, gh = Math.ceil(h / k / STEP) + 2, Fc = new Float32Array(gw * gh);
  const s2 = 2 * SIGMA * SIGMA, b2 = 2 * BRIDGE * BRIDGE;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const u = (x + i * STEP) / TILE, v = (y + j * STEP) / TILE;
    let f = 0, br = 0;
    for (let n = 0; n < ns.length; n++) { const dx = u - ns[n][0], dy = v - ns[n][1], d2 = dx * dx + dy * dy; if (d2 < 9) f += Math.exp(-d2 / s2); }
    for (let e = 0; e < segs.length; e++) {
      const ax = segs[e][0][0], ay = segs[e][0][1], vx = segs[e][1][0] - ax, vy = segs[e][1][1] - ay, t = Math.max(0, Math.min(1, ((u - ax) * vx + (v - ay) * vy) / (vx * vx + vy * vy)));
      const dx = u - ax - vx * t, dy = v - ay - vy * t; br = Math.max(br, Math.exp(-(dx * dx + dy * dy) / b2));
    }
    const cx = u - mx, cy = v - my;
    Fc[j * gw + i] = f + BRIDGE_W * br + (ns.length > 3 ? 0.45 * Math.exp(-(cx * cx + cy * cy) / c2) : 0) + (noise(u * 1.6, v * 1.6, 11) - 0.5) * 0.28 - EDGE;
  }
  const F = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const wx = (i + 0.5) / k, wy = (j + 0.5) / k, gx = wx / STEP, gy = wy / STEP, i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0, o = j0 * gw + i0;
    const f = (Fc[o] * (1 - fx) + Fc[o + 1] * fx) * (1 - fy) + (Fc[o + gw] * (1 - fx) + Fc[o + gw + 1] * fx) * fy;
    F[j * w + i] = f + (noise((x + wx) / TILE * 4.5, (y + wy) / TILE * 4.5, 13) - 0.5) * 0.07;
  }
  fillHoles(F, w, h);
  const at = (i, j) => F[Math.max(0, Math.min(h - 1, j)) * w + Math.max(0, Math.min(w - 1, i))];
  const data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const o = (j * w + i) * 4, s = F[j * w + i]; if (s <= 0) continue;
    const gx = at(i + 1, j) - at(i - 1, j), gy = at(i, j + 1) - at(i, j - 1), d = s / Math.max(1e-4, 0.5 * Math.sqrt(gx * gx + gy * gy)); // (d: texels inside the outline)
    const u = (x + (i + 0.5) / k) / TILE, v = (y + (j + 0.5) / k) / TILE;
    const a = smooth(0, SOFT * k, d) * (1 + (noise(u * 4.5, v * 4.5, 31) - 0.5) * 0.9) * EARTH_ALPHA;   // (soft at the edge, trodden more in places)
    const m = noise(u * 6, v * 6, 25);
    for (let c = 0; c < 3; c++) data[o + c] = Math.round(EARTH_DIM[c] + (EARTH[c] - EARTH_DIM[c]) * m);
    data[o + 3] = Math.max(1, Math.round(a * 255));
  }
  return { x, y, w, h, k, data };
}
