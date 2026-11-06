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
