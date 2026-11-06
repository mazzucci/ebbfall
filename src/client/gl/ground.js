// The ground's layers, pure (no DOM, no PixiJS): gl/render.js draws them and tools/art/review-ground.mjs renders the
// same for the art's review. Which seabed tile a cell of the dual grid draws, and the shade layers over the terrain
// and the scenery: a multiply (the land's large-scale shade, the wet line along a shore, the water's tints) and, on a
// map with water, an add (the water's own light, which lifts the shallows over the land so the shore and the deep
// channel's edge read in grey too). tools/render3d/STYLE.md "The ground and the scenery".

/** The seabed's tiles (tools/art/terrain2.js): `ground_0..7` the calm bases, each showing its own faint salt veins,
 *  `ground_8..19` a kelp patch each, from a scrap to near a tile across, every one its own turn and mirror. */
export const GROUND_BASES = 8, GROUND_MARKS = 12;
/** The tile the ground cell (i, j) of a map seeded `seed` draws for its draw `r` in [0, 1). Kelp lies in clusters with
 *  bare ground between (a low noise over the map sets the chance of a mark, 0 over about half of it, up to 0.4), and
 *  never in the water (`wet`: any of the cell's four tiles shallow or deep): there it read as fish or swimmers. */
export function groundTile(r, i, j, seed, wet) {
  const p = wet ? 0 : Math.min(0.4, Math.max(0, (noise(i / 4.5 + seed * 0.37, j / 4.5 - seed * 0.11) - 0.5) * 1.3));
  if (r < p) return GROUND_BASES + Math.min(GROUND_MARKS - 1, Math.floor(r / p * GROUND_MARKS));
  return Math.min(GROUND_BASES - 1, Math.floor((r - p) / (1 - p) * GROUND_BASES));
}

/** The reef's tiles: `rock_<mask>_<v>`, three variants of each edge and six of the plateau's inside (mask 15), whose
 *  pits would otherwise come back often enough to count. */
export const rockTile = (m, r) => `rock_${m}_${Math.floor(r * (m === 15 ? 6 : 3))}`;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Smooth value noise over tile coordinates (cells of one tile), for the shore line's wobble and the kelp's clusters. */
function hash(x, y) { let h = (x * 374761393 + y * 668265263 + 977) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v);
}

// The multiply: the land between 0.78 and 1 by the map's shade (the seabed tiles are dark already); the shallows a
// clear teal and deep water a blue. The add: the water's light, more in the shallows than in the deep.
const SHALLOW = [150, 230, 222], DEEP = [66, 118, 198], SHALLOW_ADD = [14, 34, 31], DEEP_ADD = [2, 8, 22];
/** The wet line: on the land side of the waterline, a band some 9 px wide darkened to WET_DARK at the water; on the
 *  water side the lap, a 2 px line of pale salt foam (added). */
const WET_BAND = 0.28, WET_DARK = 0.5, LAP = 0.07, LAP_ADD = [26, 30, 28];
/** The drop-off: where the shallows fall to deep water, a crisp dark line some 2 px wide (round 2's soft blur lost the
 *  channel's edge), then the deep, deepening a little further out. */
const DROP = 0.07, DROP_DARK = [34, 60, 104];

/**
 * The shade layers for a map of w x h tiles: `rock(x, y)`, `ground(x, y)` ('land', 'shallow' or 'deep', as core.js
 * `ground`) and `shade(x, y)` (the map's large-scale shade, 0-1). Returns `{ k, w, h, mul, add }`: k texels a tile
 * (1 on a map without water, as before; with water up to 16, for a crisp waterline: a texture of at most 2048), RGBA images of w x h texels to draw
 * linear-filtered at TILE / k world px a texel; `add` is null without water.
 */
export function shadeLayers(w, h, { rock, ground, shade }) {
  const depth = new Float32Array(w * h), sh = new Float32Array(w * h);
  let wet = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = rock(x, y) ? 'land' : ground(x, y), i = y * w + x;
    depth[i] = g === 'deep' ? 2 : g === 'shallow' ? 1 : 0; if (depth[i]) wet = true;
    sh[i] = clamp01((shade(x, y) - 0.2) * 1.8);
  }
  const k = wet ? Math.max(1, Math.min(16, Math.floor(2048 / Math.max(w, h)))) : 1, W = w * k, H = h * k, mul = new Uint8ClampedArray(W * H * 4), add = wet ? new Uint8ClampedArray(W * H * 4) : null;
  const at = (a, x, y) => a[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  const lerp2 = (a, fx, fy, f = (v) => v) => {   // bilinear between tile centres, as the old one-texel-a-tile layer drew
    const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    return (f(at(a, x0, y0)) * (1 - u) + f(at(a, x0 + 1, y0)) * u) * (1 - v) + (f(at(a, x0, y0 + 1)) * (1 - u) + f(at(a, x0 + 1, y0 + 1)) * u) * v;
  };
  // (written channel by channel, nothing allocated per texel: the Shore's 1024x1024 texels would take seconds otherwise)
  const isWet = (d) => (d > 0 ? 1 : 0), isDeep = (d) => (d > 1 ? 1 : 0);
  const put = (a, o, r, g, b) => { a[o] = r; a[o + 1] = g; a[o + 2] = b; a[o + 3] = 255; };
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const fx = (tx + 0.5) / k - 0.5, fy = (ty + 0.5) / k - 0.5, o = (ty * W + tx) * 4, s = lerp2(sh, fx, fy);
    const lr = Math.min(255, 200 + 55 * s), lg = 200 + 50 * s, lb = 205 + 45 * s;   // the land's shade
    if (!wet) { put(mul, o, Math.round(lr), Math.round(lg), Math.round(lb)); continue; }
    // Away from any edge (the four tiles round the texel all one depth) the wobble cannot reach a contour (it moves a
    // level by 0.15 at most): plain land, shallows or deep, with no noise to compute.
    const x0 = Math.floor(fx), y0 = Math.floor(fy), d0 = at(depth, x0, y0);
    if (d0 === at(depth, x0 + 1, y0) && d0 === at(depth, x0, y0 + 1) && d0 === at(depth, x0 + 1, y0 + 1)) {
      if (d0 === 0) { put(mul, o, Math.round(lr), Math.round(lg), Math.round(lb)); put(add, o, 0, 0, 0); continue; }
      const deep = d0 === 2 ? 1 : 0;
      for (let c = 0; c < 3; c++) { mul[o + c] = Math.round(SHALLOW[c] + (DEEP[c] - SHALLOW[c]) * deep); add[o + c] = Math.round(SHALLOW_ADD[c] + (DEEP_ADD[c] - SHALLOW_ADD[c]) * deep); }
      mul[o + 3] = add[o + 3] = 255; continue;
    }
    // How wet: 0 on land, 1 in water, its 0.5 contour the waterline, rounded between tiles and wobbled a little.
    const wob = (noise(fx * 1.7, fy * 1.7) - 0.5) * 0.22 + (noise(fx * 5.3 + 31, fy * 5.3) - 0.5) * 0.08;
    const wv = lerp2(depth, fx, fy, isWet) + wob;
    if (wv < 0.5) {
      const t = clamp01((wv - (0.5 - WET_BAND)) / WET_BAND), dark = 1 - (1 - WET_DARK) * t * t;  // darkest at the water's edge
      put(mul, o, Math.round(lr * dark), Math.round(lg * dark), Math.round(lb * dark)); put(add, o, 0, 0, 0);
      continue;
    }
    const dv = lerp2(depth, fx, fy, isDeep) + (noise(fx * 1.9 + 57, fy * 1.9) - 0.5) * 0.22 + (noise(fx * 6.1, fy * 6.1 + 17) - 0.5) * 0.06;
    if (dv >= 0.5 && dv < 0.5 + DROP) { put(mul, o, DROP_DARK[0], DROP_DARK[1], DROP_DARK[2]); put(add, o, 0, 0, 0); continue; }
    const deep = dv < 0.5 ? 0 : 0.8 + 0.2 * clamp01((dv - 0.5) * 3), lap = wv < 0.5 + LAP ? 1 : 0;   // deep: 0 the shallows, 1 the deep
    for (let c = 0; c < 3; c++) {
      mul[o + c] = Math.round(SHALLOW[c] + (DEEP[c] - SHALLOW[c]) * deep);
      add[o + c] = Math.round(SHALLOW_ADD[c] + (DEEP_ADD[c] - SHALLOW_ADD[c]) * deep + LAP_ADD[c] * lap);
    }
    mul[o + 3] = add[o + 3] = 255;
  }
  return { k, w: W, h: H, mul, add };
}

// ---- the salt pans ----
/** Salt nodes within this many tiles of each other lie on one pan (a field's arc spaces them 2 to 3.2 apart). */
const PAN_LINK = 3.6;
/** World px a texel of a pan (2: a field's pan costs some 20 ms to make on a desktop, a quarter of one at 1). */
export const PAN_RES = 2;
/** The pan's crust: a dull grey-white well under the salt heaps on it, the reef top and a unit's body (about 58 in grey
 *  on the seabed's 40: the salt works round 1's pale pan was the largest light mass on screen and the workers lost
 *  contrast where they mine), cracked into flags about half a tile across by faint pale lines that come and go, each
 *  flag its own shade, damp and darker towards its edge, which breaks up into loose flakes of crust over the seabed. */
const PAN = [75, 73, 68], PAN_CRACK = [96, 94, 88], PAN_LIP = [104, 101, 94], PAN_SHADOW = [14, 13, 12];
/**
 * The salt pans under the salt fields (tools/render3d/STYLE.md "The salt works"): one continuous cracked crust under
 * each field's nodes (nodes within PAN_LINK tiles join), so a field reads as a salt flat, not as separate rocks. `nodes`:
 * the map's nodes ({ type, tx, ty }; seeps, type 'ether', are left out). Returns one image a pan, `{ x, y, w, h, data }`:
 * its top-left in world px and its size in texels of PAN_RES world px each (RGBA, transparent off the pan), drawn under the
 * shade layers, scaled by PAN_RES and linear-filtered. Deterministic from the nodes.
 */
export function saltPans(nodes, TILE = 32) {
  const salt = nodes.filter(n => n.type !== 'ether').map(n => ({ x: n.tx + 0.5, y: n.ty + 0.5 })), parent = salt.map((_, i) => i);
  const root = (i) => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const links = [];
  for (let i = 0; i < salt.length; i++) for (let j = i + 1; j < salt.length; j++) if (Math.hypot(salt[i].x - salt[j].x, salt[i].y - salt[j].y) <= PAN_LINK) { parent[root(i)] = root(j); links.push([i, j]); }
  const groups = new Map(); salt.forEach((_, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const out = [];
  for (const members of groups.values()) {
    const ps = members.map(i => salt[i]), segs = links.filter(([a]) => members.includes(a)).map(([a, b]) => [salt[a], salt[b]]);
    const x0 = Math.floor(Math.min(...ps.map(p => p.x)) - 2.2), y0 = Math.floor(Math.min(...ps.map(p => p.y)) - 2.2), x1 = Math.ceil(Math.max(...ps.map(p => p.x)) + 2.2), y1 = Math.ceil(Math.max(...ps.map(p => p.y)) + 2.2);
    const T = TILE / PAN_RES, w = (x1 - x0) * T, h = (y1 - y0) * T, data = new Uint8ClampedArray(w * h * 4), seed = ps[0].x * 7.3 + ps[0].y * 3.1;
    // The slow parts made once: the crust's crack points (a cell ~0.45 tile, a jittered point in each) and the two low
    // noises (the pan's uneven shore, its shading) on a grid of 4 px, read bilinearly.
    const S = 0.55, gx0 = Math.floor(x0 / S) - 1, gy0 = Math.floor(y0 / S) - 1, gw = Math.ceil(x1 / S) + 2 - gx0, gh = Math.ceil(y1 / S) + 2 - gy0, pts = new Float32Array(gw * gh * 2);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { pts[(j * gw + i) * 2] = (gx0 + i + 0.15 + hash(gx0 + i, gy0 + j + 7001) * 0.7) * S; pts[(j * gw + i) * 2 + 1] = (gy0 + j + 0.15 + hash(gx0 + i + 3301, gy0 + j) * 0.7) * S; }
    const F = 0.3, fx0 = Math.floor(x0 / F) - 1, fy0 = Math.floor(y0 / F) - 1, fw = Math.ceil(x1 / F) + 2 - fx0, fh = Math.ceil(y1 / F) + 2 - fy0, fpts = new Float32Array(fw * fh * 2);   // the edge's flakes, ~0.2 tile
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { fpts[(j * fw + i) * 2] = (fx0 + i + 0.1 + hash(fx0 + i, fy0 + j + 5003) * 0.8) * F; fpts[(j * fw + i) * 2 + 1] = (fy0 + j + 0.1 + hash(fx0 + i + 1709, fy0 + j) * 0.8) * F; }
    const B = 4, bw = Math.ceil(w / B) + 2, bh = Math.ceil(h / B) + 2, wobG = new Float32Array(bw * bh), shG = new Float32Array(bw * bh), fG = new Float32Array(bw * bh), nG = new Float32Array(bw * bh);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const u = x0 + i * B / T, v = y0 + j * B / T;
      wobG[j * bw + i] = (noise(u * 1.4 + seed, v * 1.4) - 0.5) * 0.55 + (noise(u * 4.3, v * 4.3 + seed) - 0.5) * 0.2;
      shG[j * bw + i] = noise(u * 2.2 + 13, v * 2.2);
      let f = 9;                                                                               // the pan's shape: its distance field, smooth enough to read bilinearly
      for (let n = 0; n < ps.length; n++) { const dx = u - ps[n].x, dy = v - ps[n].y, d = Math.sqrt(dx * dx + dy * dy) - 1.3; if (d < f) f = d; }
      nG[j * bw + i] = f;
      for (let n = 0; n < segs.length; n++) {
        const a = segs[n][0], b = segs[n][1], dx = b.x - a.x, dy = b.y - a.y, t = clamp01(((u - a.x) * dx + (v - a.y) * dy) / (dx * dx + dy * dy)), ex = u - a.x - dx * t, ey = v - a.y - dy * t, d = Math.sqrt(ex * ex + ey * ey) - 0.95;
        if (d < f) f = d;
      }
      fG[j * bw + i] = f + wobG[j * bw + i];
    }
    const grid = (g, px, py) => { const fx = px / B, fy = py / B, i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, o = j * bw + i; return (g[o] * (1 - a) + g[o + 1] * a) * (1 - b) + (g[o + bw] * (1 - a) + g[o + bw + 1] * a) * b; };
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const u = x0 + (px + 0.5) / T, v = y0 + (py + 0.5) / T;
      const f = grid(fG, px, py) + (hash(px >> 1, py >> 1) - 0.5) * 0.02;                     // the pan's shape, its shore uneven, its rim a little ragged
      if (f > 0.2) continue;
      const fNode = grid(nG, px, py);                                                          // (the crust is whitest round the heaps)
      const o = (py * w + px) * 4;
      // The edge, crisp (round 2's soft, dithered edge read as smoke or fog): the crust ends in a thin pale lip with a
      // dark line of shadow under it; past it a few flakes broken off it lie on the seabed, each with its own lip.
      if (f > 0) {
        const gx = Math.floor(u / F) - fx0, gy = Math.floor(v / F) - fy0; let d1 = 9, d2 = 9, near = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const q = ((gy + j) * fw + gx + i) * 2, ex = u - fpts[q], ey = v - fpts[q + 1], d = ex * ex + ey * ey;
          if (d < d1) { d2 = d1; d1 = d; near = q; } else if (d < d2) d2 = d;
        }
        const gap = (Math.sqrt(d2) - Math.sqrt(d1)) * TILE / 2, flake = hash(near, 4111) < 0.5 * (1 - f / 0.2);
        if (flake && gap > 2) { const c = gap < 3.5 ? PAN_LIP : PAN, k = 0.9 + hash(near, 4127) * 0.12; data[o] = c[0] * k; data[o + 1] = c[1] * k; data[o + 2] = c[2] * k; data[o + 3] = 255; continue; }
        if ((flake && gap > 0.6) || f < 0.06) { data[o] = PAN_SHADOW[0]; data[o + 1] = PAN_SHADOW[1]; data[o + 2] = PAN_SHADOW[2]; data[o + 3] = 110; }   // the shadow under the lip, round a flake
        continue;
      }
      if (f > -0.07) { const k = 0.95 + hash(px, py) * 0.08; data[o] = PAN_LIP[0] * k; data[o + 1] = PAN_LIP[1] * k; data[o + 2] = PAN_LIP[2] * k; data[o + 3] = 255; continue; }   // the lip
      const gx = Math.floor(u / S) - gx0, gy = Math.floor(v / S) - gy0; let d1 = 9, d2 = 9, near = 0;   // the crust's flags: a crack where the nearest two points are near equal
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const q = ((gy + j) * gw + gx + i) * 2, ex = u - pts[q], ey = v - pts[q + 1], d = ex * ex + ey * ey;
        if (d < d1) { d2 = d1; d1 = d; near = q; } else if (d < d2) d2 = d;
      }
      const gap = (Math.sqrt(d2) - Math.sqrt(d1)) * TILE / 2;                                                       // ~ world px to the crack
      const flag = 0.95 + hash(near, 9157) * 0.1, open = grid(wobG, px * 3.7 % (w - 1), py * 3.7 % (h - 1)) > -0.05;   // each flag its own shade; cracks come and go
      const shade = (0.92 + grid(shG, px, py) * 0.12 - clamp01((f + 0.6) / 0.46) * 0.1 + clamp01(-0.3 - fNode) * 0.06 + (hash(px, py) - 0.5) * 0.06) * flag; // darker towards the damp edge, a little whiter by the heaps, a grain
      const crack = gap < 0.9 && open, c = crack ? PAN_CRACK : PAN, k = crack ? 1 : shade;     // a faint pale crack, or the flag
      data[o] = c[0] * k; data[o + 1] = c[1] * k; data[o + 2] = c[2] * k; data[o + 3] = 255;
    }
    out.push({ x: x0 * TILE, y: y0 * TILE, w, h, data });
  }
  return out;
}
