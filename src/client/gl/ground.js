// The ground's layers, pure (no DOM, no PixiJS): gl/render.js and gl/newlandgl.js draw by them. Which kind each rock
// region is (a forest or a rocky hill), and the shade of the land: a multiply
// (the land's large-scale shade, the meadows, the rock's tone, the wet line along a shore, the water's tints) and an
// add (the meadows' and the rock's lift; on a map with water, the water's own light, which lifts the shallows over the
// land so the shore and the deep channel's edge read in gray too). What goes where (the meadows, the tracks, the rock's
// tone): gl/groundplan.js.

/**
 * Each rock region's kind, chosen once per region: `{ kindAt(x, y) }` for the rock tiles of a map w x h tiles
 * (`rock(x, y)`, in the map), 'forest' or 'hill'. A region is a set of rock tiles joined through their sides or
 * corners (so the rock corners of one dual-grid cell are always one region); its kind is a hash of the map's seed and
 * the region's first tile in reading order: the same on every client and every time, whatever else is on the map.
 * Off the map (the rock the dual grid sees past the edge) a tile takes the kind of the map tile beside it when that is
 * rock, else the border's own kind (from the seed too). Client-only: the sim never sees it.
 */
export function rockKinds(w, h, rock, seed) {
  const region = new Int32Array(w * h).fill(-1), kinds = [], stack = [];
  const pick = (k) => (hash(k * 7919 + 13, (seed | 0) * 31 + 7) < 0.5 ? 'forest' : 'hill');
  for (let y0 = 0; y0 < h; y0++) for (let x0 = 0; x0 < w; x0++) {
    if (region[y0 * w + x0] >= 0 || !rock(x0, y0)) continue;
    const id = kinds.length; kinds.push(pick(y0 * w + x0));
    region[y0 * w + x0] = id; stack.push(y0 * w + x0);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || region[j] >= 0 || !rock(nx, ny)) continue;
        region[j] = id; stack.push(j);
      }
    }
  }
  const border = pick(-1);
  return {
    /** The region of map tile (x, y), a number of its own (-1: not rock, or off the map). */
    regionAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : region[y * w + x]),
    kindAt(x, y) {
      const cx = Math.max(0, Math.min(w - 1, x)), cy = Math.max(0, Math.min(h - 1, y)), id = region[cy * w + cx];
      if (cx === x && cy === y) return id >= 0 ? kinds[id] : null;
      return id >= 0 ? kinds[id] : border;
    },
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** A hash of two integers, 0-1, and smooth value noise over tile coordinates (cells of one tile): the shore line's
 *  wobble, the patches' clusters, the meadows and the tracks' winding (gl/groundplan.js). Integer and exact arithmetic
 *  only, so every browser lands on the same side of a threshold. */
export function hash(x, y) { let h = (x * 374761393 + y * 668265263 + 977) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v);
}

// The multiply: the land between 0.78 and 1 by the map's shade; the shallows a
// clear teal and deep water a blue. The add: the water's light, more in the shallows than in the deep.
const SHALLOW = [150, 230, 222], DEEP = [66, 118, 198], SHALLOW_ADD = [14, 34, 31], DEEP_ADD = [2, 8, 22];
/** The wet line: on the land side of the waterline, a band some 9 px wide darkened to WET_DARK at the water; on the
 *  water side the lap, a 2 px line of pale foam (added). */
const WET_BAND = 0.28, WET_DARK = 0.5, LAP = 0.07, LAP_ADD = [26, 30, 28];
/** The drop-off: where the shallows fall to deep water, a crisp dark line some 2 px wide (round 2's soft blur lost the
 *  channel's edge), then the deep, deepening a little further out. */
const DROP = 0.07, DROP_DARK = [34, 60, 104];

/** The meadows on the land's shade, at full strength (gl/groundplan.js `dry`, `lush`): a dry one lighter and an olive
 *  straw (the multiply lifted toward MEADOW_DRY, the add's MEADOW_DRY_ADD lifting the darks), a lush one a deeper,
 *  cooler green (the multiply down by MEADOW_LUSH, a little blue added). */
const MEADOW_DRY = [0.45, 0.34, -0.06], MEADOW_DRY_ADD = [17, 18, 8], MEADOW_LUSH = [0.18, 0.05, 0.07], MEADOW_LUSH_ADD = [0, 2, 5];
/** The rock's tone at full strength (gl/groundplan.js `rockTone`, -1 cool to 1 warm): the multiply down by these and a
 *  little added. A hill cool: a blue slate; warm: a tan sandstone. A forest cool: a spruce; warm: an olive; never
 *  lighter, so never toward the grass. */
const HILL_COOL = [0.12, 0.07, 0.02], HILL_COOL_ADD = [0, 0, 2], HILL_WARM = [0.02, 0.08, 0.22], HILL_WARM_ADD = [4, 0, 0];
const FOREST_COOL = [0.24, 0.07, 0], FOREST_COOL_ADD = [0, 0, 6], FOREST_WARM = [0.05, 0.05, 0.26], FOREST_WARM_ADD = [0, 0, 0];

/**
 * The shade layers for a map of w x h tiles: `rock(x, y)`, `ground(x, y)` ('land', 'shallow' or 'deep', as core.js
 * `ground`) and `shade(x, y)` (the map's large-scale shade, 0-1); `tone` (gl/groundplan.js, or null): `{ dry, lush,
 * rockTone, kindAt }`, the meadows (0-1 per tile, 0 on the rock and beside it) and the rock's tone (-1 cool to 1 warm,
 * 0 on the rock's outer tiles; `kindAt` as rockKinds'): blended between tile centers, both are gone half a tile before
 * a rock edge, whose lip and face keep their pixels. Returns `{ k, w, h, mul, add }`: k texels a tile (1 on a dry map;
 * with water up to 16, for a crisp waterline: a texture of at most 2048), RGBA images of w x h texels to draw
 * linear-filtered at TILE / k world px a texel; `add` is null on a dry map without a tone.
 */
export function shadeLayers(w, h, { rock, ground, shade, tone = null }) {
  const n = w * h, depth = new Uint8Array(n), wetA = new Float32Array(n), deepA = new Float32Array(n), sh = new Float32Array(n);
  let wet = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = rock(x, y) ? 'land' : ground(x, y), i = y * w + x;
    depth[i] = g === 'deep' ? 2 : g === 'shallow' ? 1 : 0; if (depth[i]) wet = true;
    wetA[i] = depth[i] > 0 ? 1 : 0; deepA[i] = depth[i] > 1 ? 1 : 0;
    sh[i] = clamp01((shade(x, y) - 0.2) * 1.8);
  }
  // The land's multiply and add at each tile's center, toned by the meadows and the rock's tone: blended between tile
  // centers per texel as the GPU blends a one-texel-a-tile layer.
  const dry = tone?.dry ?? null, lush = tone?.lush ?? null, rt = tone?.rockTone ?? null;
  const Lr = new Float32Array(n), Lg = new Float32Array(n), Lb = new Float32Array(n), Ar = new Float32Array(n), Ag = new Float32Array(n), Ab = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = sh[i], d = dry ? dry[i] : 0, l = lush ? lush[i] : 0, r0 = Math.min(255, 200 + 55 * s), g0 = 200 + 50 * s;
    Lr[i] = (r0 + (255 - r0) * MEADOW_DRY[0] * d) * (1 - MEADOW_LUSH[0] * l);
    Lg[i] = (g0 + (252 - g0) * MEADOW_DRY[1] * d) * (1 - MEADOW_LUSH[1] * l);
    Lb[i] = (205 + 45 * s) * (1 + MEADOW_DRY[2] * d) * (1 - MEADOW_LUSH[2] * l);
    Ar[i] = MEADOW_DRY_ADD[0] * d + MEADOW_LUSH_ADD[0] * l; Ag[i] = MEADOW_DRY_ADD[1] * d + MEADOW_LUSH_ADD[1] * l; Ab[i] = MEADOW_DRY_ADD[2] * d + MEADOW_LUSH_ADD[2] * l;
    const t = rt ? rt[i] : 0;
    if (t) {
      const x = i % w, forest = tone.kindAt(x, (i - x) / w) === 'forest', a = Math.abs(t);
      const [f, fa] = t < 0 ? (forest ? [FOREST_COOL, FOREST_COOL_ADD] : [HILL_COOL, HILL_COOL_ADD]) : (forest ? [FOREST_WARM, FOREST_WARM_ADD] : [HILL_WARM, HILL_WARM_ADD]);
      Lr[i] *= 1 - f[0] * a; Lg[i] *= 1 - f[1] * a; Lb[i] *= 1 - f[2] * a; Ar[i] += fa[0] * a; Ag[i] += fa[1] * a; Ab[i] += fa[2] * a;
    }
  }
  const k = wet ? Math.max(1, Math.min(16, Math.floor(2048 / Math.max(w, h)))) : 1, W = w * k, H = h * k;
  const mul = new Uint8ClampedArray(W * H * 4), add = wet || tone ? new Uint8ClampedArray(W * H * 4) : null;
  // Each texel's four tiles and weights, worked out once a column and once a row (written channel by channel, nothing
  // allocated per texel: the Lake's 1024x1024 texels would take seconds otherwise).
  const cols = new Int32Array(2 * W), cu = new Float64Array(W), rows = new Int32Array(2 * H), rv = new Float64Array(H);
  const clampTo = (v, m) => Math.max(0, Math.min(m - 1, v));
  for (let t = 0; t < W; t++) { const f = (t + 0.5) / k - 0.5, x0 = Math.floor(f); cu[t] = f - x0; cols[2 * t] = clampTo(x0, w); cols[2 * t + 1] = clampTo(x0 + 1, w); }
  for (let t = 0; t < H; t++) { const f = (t + 0.5) / k - 0.5, y0 = Math.floor(f); rv[t] = f - y0; rows[2 * t] = clampTo(y0, h) * w; rows[2 * t + 1] = clampTo(y0 + 1, h) * w; }
  const put = (a, o, r, g, b) => { a[o] = r; a[o + 1] = g; a[o + 2] = b; a[o + 3] = 255; };
  /** The land at texel offset `o`, between tiles a b (above) and c d (below) at u, v: its multiply and add, darkened
   *  by `dark` (the wet line). */
  const land = (o, a, b, c, d, u, v, dark) => {
    const wa = (1 - u) * (1 - v), wb = u * (1 - v), wc = (1 - u) * v, wd = u * v;
    const lr = Lr[a] * wa + Lr[b] * wb + Lr[c] * wc + Lr[d] * wd, lg = Lg[a] * wa + Lg[b] * wb + Lg[c] * wc + Lg[d] * wd, lb = Lb[a] * wa + Lb[b] * wb + Lb[c] * wc + Lb[d] * wd;
    let ar = 0, ag = 0, ab = 0;
    if (add) { ar = Ar[a] * wa + Ar[b] * wb + Ar[c] * wc + Ar[d] * wd; ag = Ag[a] * wa + Ag[b] * wb + Ag[c] * wc + Ag[d] * wd; ab = Ab[a] * wa + Ab[b] * wb + Ab[c] * wc + Ab[d] * wd; }
    put(mul, o, Math.round(lr * dark), Math.round(lg * dark), Math.round(lb * dark));
    if (add) put(add, o, Math.round(ar * dark), Math.round(ag * dark), Math.round(ab * dark));
  };
  const lerp2 = (A, a, b, c, d, u, v) => (A[a] * (1 - u) + A[b] * u) * (1 - v) + (A[c] * (1 - u) + A[d] * u) * v;
  for (let ty = 0; ty < H; ty++) {
    const r0 = rows[2 * ty], r1 = rows[2 * ty + 1], fy = (ty + 0.5) / k - 0.5, v = rv[ty];
    for (let tx = 0; tx < W; tx++) {
      const c0 = cols[2 * tx], c1 = cols[2 * tx + 1], o = (ty * W + tx) * 4, u = cu[tx];
      const a = r0 + c0, b = r0 + c1, c = r1 + c0, d = r1 + c1;
      // Away from any edge (the four tiles round the texel all one depth) the wobble cannot reach a contour (it moves
      // a level by 0.15 at most): plain land, shallows or deep, with no noise to compute.
      const d0 = depth[a];
      if (d0 === 0 && (!wet || (depth[b] === 0 && depth[c] === 0 && depth[d] === 0))) { land(o, a, b, c, d, u, v, 1); continue; }
      if (d0 === depth[b] && d0 === depth[c] && d0 === depth[d]) {
        const deep = d0 === 2 ? 1 : 0;
        for (let ch = 0; ch < 3; ch++) { mul[o + ch] = Math.round(SHALLOW[ch] + (DEEP[ch] - SHALLOW[ch]) * deep); add[o + ch] = Math.round(SHALLOW_ADD[ch] + (DEEP_ADD[ch] - SHALLOW_ADD[ch]) * deep); }
        mul[o + 3] = add[o + 3] = 255; continue;
      }
      // How wet: 0 on land, 1 in water, its 0.5 contour the waterline, rounded between tiles and wobbled a little.
      const fx = (tx + 0.5) / k - 0.5;
      const wob = (noise(fx * 1.7, fy * 1.7) - 0.5) * 0.22 + (noise(fx * 5.3 + 31, fy * 5.3) - 0.5) * 0.08;
      const wv = lerp2(wetA, a, b, c, d, u, v) + wob;
      if (wv < 0.5) {
        const t = clamp01((wv - (0.5 - WET_BAND)) / WET_BAND);
        land(o, a, b, c, d, u, v, 1 - (1 - WET_DARK) * t * t); // (darkest at the water's edge)
        continue;
      }
      const dv = lerp2(deepA, a, b, c, d, u, v) + (noise(fx * 1.9 + 57, fy * 1.9) - 0.5) * 0.22 + (noise(fx * 6.1, fy * 6.1 + 17) - 0.5) * 0.06;
      if (dv >= 0.5 && dv < 0.5 + DROP) { put(mul, o, DROP_DARK[0], DROP_DARK[1], DROP_DARK[2]); put(add, o, 0, 0, 0); continue; }
      const deep = dv < 0.5 ? 0 : 0.8 + 0.2 * clamp01((dv - 0.5) * 3), lap = wv < 0.5 + LAP ? 1 : 0;   // deep: 0 the shallows, 1 the deep
      for (let ch = 0; ch < 3; ch++) {
        mul[o + ch] = Math.round(SHALLOW[ch] + (DEEP[ch] - SHALLOW[ch]) * deep);
        add[o + ch] = Math.round(SHALLOW_ADD[ch] + (DEEP_ADD[ch] - SHALLOW_ADD[ch]) * deep + LAP_ADD[ch] * lap);
      }
      mul[o + 3] = add[o + 3] = 255;
    }
  }
  return { k, w: W, h: H, mul, add };
}
