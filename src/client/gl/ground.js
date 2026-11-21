// The ground's layers, pure (no DOM, no PixiJS): gl/render.js draws them and tools/art/review-ground.mjs renders the
// same for the art's review. Which countryside tile a cell of the dual grid draws (tools/art/terrain3.js), which kind
// each rock region is (a forest or a rocky hill), and the shade layers over the terrain and the scenery: a multiply
// (the land's large-scale shade, the wet line along a shore, the water's tints) and, on a map with water, an add (the
// water's own light, which lifts the shallows over the land so the shore and the deep channel's edge read in gray too).

/** The grass tiles (tools/art/terrain3.js): `ground_0..7` the plain bases, `ground_8..19` a soft patch each (eight of
 *  trodden dirt, four of dry grass), from a third of a tile to near a tile across, every one its own turn and mirror. */
export const GROUND_BASES = 8, GROUND_MARKS = 12;
/** The most of a map's cells that show a patch, where its cluster noise is highest (the re-theme's ground: a swarm of
 *  dirt patches read as a mud field; the seabed's kelp went up to 0.4). */
export const MARK_MAX = 0.14;
/** The tile the ground cell (i, j) of a map seeded `seed` draws for its draw `r` in [0, 1). Patches lie in clusters
 *  with plain grass between (a low noise over the map sets the chance of a mark, 0 over about half of it, up to
 *  MARK_MAX), and never in the water (`wet`: any of the cell's four tiles shallow or deep). */
export function groundTile(r, i, j, seed, wet) {
  const p = wet ? 0 : Math.min(MARK_MAX, Math.max(0, (noise(i / 4.5 + seed * 0.37, j / 4.5 - seed * 0.11) - 0.5) * 1.3 * (MARK_MAX / 0.4)));
  if (r < p) return GROUND_BASES + Math.min(GROUND_MARKS - 1, Math.floor(r / p * GROUND_MARKS));
  return Math.min(GROUND_BASES - 1, Math.floor((r - p) / (1 - p) * GROUND_BASES));
}

/** The same with the ground options' meadows (gl/groundplan.js): `dry` and `lush` the cell's tone, 0-1. A dry meadow
 *  shows the dry-grass patches (marks 2, 5, 8 and 11) on up to a fifth of its cells and no dirt; a lush one no patch. */
export function groundTileToned(r, i, j, seed, wet, dry, lush) {
  if (wet || (dry < 0.5 && lush < 0.5)) return groundTile(r, i, j, seed, wet);
  const p = dry >= 0.5 ? 0.2 * (dry - 0.5) * 2 : 0;
  if (r < p) return GROUND_BASES + 2 + 3 * Math.min(3, Math.floor(r / p * 4));
  return Math.min(GROUND_BASES - 1, Math.floor((r - p) / (1 - p) * GROUND_BASES));
}

/** The rock's tiles: `rock_<mask>_<v>`, per corner mask n variants of a rocky hill (v 0..n-1) then n of a forest
 *  (v n..2n-1); n is 3 for an edge and 6 for the inside (mask 15), whose marks would otherwise come back often enough
 *  to count (tools/art/terrain3.js VARIANTS). `kind` is the cell's region's ('hill' or 'forest', rockKinds). */
export const rockTile = (m, r, kind = 'hill') => { const n = m === 15 ? 6 : 3; return `rock_${m}_${(kind === 'forest' ? n : 0) + Math.floor(r * n)}`; };

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
    /** The region of map tile (x, y), a number of its own; -1 off the rock. (The ground options: gl/groundplan.js.) */
    regionAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : region[y * w + x]),
    kindAt(x, y) {
      const cx = Math.max(0, Math.min(w - 1, x)), cy = Math.max(0, Math.min(h - 1, y)), id = region[cy * w + cx];
      if (cx === x && cy === y) return id >= 0 ? kinds[id] : null;
      return id >= 0 ? kinds[id] : border;
    },
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Smooth value noise over tile coordinates (cells of one tile), for the shore line's wobble and the patches' clusters. */
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

/**
 * The shade layers for a map of w x h tiles: `rock(x, y)`, `ground(x, y)` ('land', 'shallow' or 'deep', as core.js
 * `ground`) and `shade(x, y)` (the map's large-scale shade, 0-1). Returns `{ k, w, h, mul, add }`: k texels a tile
 * (1 on a map without water, as before; with water up to 16, for a crisp waterline: a texture of at most 2048), RGBA images of w x h texels to draw
 * linear-filtered at TILE / k world px a texel; `add` is null without water.
 * `tone` (the ground options, gl/groundplan.js; null: today's ground): `{ dry, lush, rockTone, kindAt }`, per-tile
 * grids. The meadows (dry, lush: 0-1) shift the land's shade toward straw or a deeper green; they are 0 on the rock and
 * the tiles beside it, so blended between tile centers they are gone half a tile before a hill. The rock's tone (-1 cool
 * to 1 warm) is cut to the rock itself (k is 4 then, for a mask that sharp), nothing of it on the grass. With a tone
 * there is an `add` on a dry map too.
 */
export function shadeLayers(w, h, { rock, ground, shade, tone = null }) {
  const depth = new Float32Array(w * h), sh = new Float32Array(w * h);
  let wet = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = rock(x, y) ? 'land' : ground(x, y), i = y * w + x;
    depth[i] = g === 'deep' ? 2 : g === 'shallow' ? 1 : 0; if (depth[i]) wet = true;
    sh[i] = clamp01((shade(x, y) - 0.2) * 1.8);
  }
  const meadows = tone && tone.dry ? tone : null, rt = tone && tone.rockTone ? tone.rockTone : null;
  const k = wet ? Math.max(1, Math.min(16, Math.floor(2048 / Math.max(w, h)))) : rt ? 4 : 1, W = w * k, H = h * k, mul = new Uint8ClampedArray(W * H * 4), add = wet || meadows || rt ? new Uint8ClampedArray(W * H * 4) : null;
  let isRock = null, forest = null;
  if (rt) { isRock = new Float32Array(w * h); forest = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rock(x, y)) { isRock[y * w + x] = 1; forest[y * w + x] = tone.kindAt(x, y) === 'forest' ? 1 : 0; } }
  const al = [0, 0, 0]; // (the land's add at the texel at hand)
  const at = (a, x, y) => a[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  const lerp2 = (a, fx, fy, f = (v) => v) => {   // bilinear between tile centers, as the old one-texel-a-tile layer drew
    const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    return (f(at(a, x0, y0)) * (1 - u) + f(at(a, x0 + 1, y0)) * u) * (1 - v) + (f(at(a, x0, y0 + 1)) * (1 - u) + f(at(a, x0 + 1, y0 + 1)) * u) * v;
  };
  // (written channel by channel, nothing allocated per texel: the Shore's 1024x1024 texels would take seconds otherwise)
  const isWet = (d) => (d > 0 ? 1 : 0), isDeep = (d) => (d > 1 ? 1 : 0);
  const put = (a, o, r, g, b) => { a[o] = r; a[o + 1] = g; a[o + 2] = b; a[o + 3] = 255; };
  let lr = 0, lg = 0, lb = 0;
  /** The ground options' tone on the land's shade at a texel (lr, lg, lb, al): asked only where the texel is land. */
  const toned = (fx, fy) => {
  if (meadows) { // dry: lighter, warmer, dustier (the add lifts the darks); lush: a deeper, cooler green
    const d = lerp2(meadows.dry, fx, fy), l = lerp2(meadows.lush, fx, fy);
    lr = (lr + (255 - lr) * 0.6 * d) * (1 - 0.18 * l); lg = (lg + (252 - lg) * 0.3 * d) * (1 - 0.05 * l); lb = lb * (1 - 0.1 * d) * (1 - 0.07 * l);
    al[0] = 26 * d; al[1] = 17 * d + 2 * l; al[2] = 8 * d + 5 * l;
  }
  if (rt) { // (only well inside the rock: nothing at its edge, where the lip and the face read against the grass)
    const on = clamp01((lerp2(isRock, fx, fy) - 0.56) / 0.36);
    if (on > 0) {
      const t = lerp2(rt, fx, fy), warm = Math.max(0, t) * on, cool = Math.max(0, -t) * on, f = lerp2(forest, fx, fy) > 0.5;
      if (f) { lr *= 1 - 0.24 * cool; lg *= 1 - 0.07 * cool - 0.03 * warm; lb *= 1 - 0.34 * warm; al[0] += 12 * warm; al[1] += 5 * warm; al[2] += 6 * cool; }
      else { lr *= 1 - 0.12 * cool - 0.02 * warm; lg *= 1 - 0.07 * cool - 0.08 * warm; lb *= 1 - 0.02 * cool - 0.22 * warm; al[2] += 2 * cool; al[0] += 4 * warm; }
    }
  }
  };
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const fx = (tx + 0.5) / k - 0.5, fy = (ty + 0.5) / k - 0.5, o = (ty * W + tx) * 4, s = lerp2(sh, fx, fy);
    lr = Math.min(255, 200 + 55 * s); lg = 200 + 50 * s; lb = 205 + 45 * s;   // the land's shade
    al[0] = al[1] = al[2] = 0;
    if (!wet) { if (tone) toned(fx, fy); put(mul, o, Math.round(lr), Math.round(lg), Math.round(lb)); if (add) put(add, o, Math.round(al[0]), Math.round(al[1]), Math.round(al[2])); continue; }
    // Away from any edge (the four tiles round the texel all one depth) the wobble cannot reach a contour (it moves a
    // level by 0.15 at most): plain land, shallows or deep, with no noise to compute.
    const x0 = Math.floor(fx), y0 = Math.floor(fy), d0 = at(depth, x0, y0);
    if (d0 === at(depth, x0 + 1, y0) && d0 === at(depth, x0, y0 + 1) && d0 === at(depth, x0 + 1, y0 + 1)) {
      if (d0 === 0) { if (tone) toned(fx, fy); put(mul, o, Math.round(lr), Math.round(lg), Math.round(lb)); put(add, o, Math.round(al[0]), Math.round(al[1]), Math.round(al[2])); continue; }
      const deep = d0 === 2 ? 1 : 0;
      for (let c = 0; c < 3; c++) { mul[o + c] = Math.round(SHALLOW[c] + (DEEP[c] - SHALLOW[c]) * deep); add[o + c] = Math.round(SHALLOW_ADD[c] + (DEEP_ADD[c] - SHALLOW_ADD[c]) * deep); }
      mul[o + 3] = add[o + 3] = 255; continue;
    }
    // How wet: 0 on land, 1 in water, its 0.5 contour the waterline, rounded between tiles and wobbled a little.
    const wob = (noise(fx * 1.7, fy * 1.7) - 0.5) * 0.22 + (noise(fx * 5.3 + 31, fy * 5.3) - 0.5) * 0.08;
    const wv = lerp2(depth, fx, fy, isWet) + wob;
    if (wv < 0.5) {
      if (tone) toned(fx, fy);
      const t = clamp01((wv - (0.5 - WET_BAND)) / WET_BAND), dark = 1 - (1 - WET_DARK) * t * t;  // darkest at the water's edge
      put(mul, o, Math.round(lr * dark), Math.round(lg * dark), Math.round(lb * dark)); put(add, o, Math.round(al[0] * dark), Math.round(al[1] * dark), Math.round(al[2] * dark));
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
