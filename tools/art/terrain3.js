// The countryside (the re-theme's ground family, 2026-11-10): grass tiles `ground_0..19` and the blocking regions as
// rocky hills or forest clumps, `rock_<mask>_<v>`, on the same corner-mask dual grid as terrain2.js (bit 1 TL, 2 TR,
// 4 BL, 8 BR), so no rules change: only the paint. Not in the atlas: tools/art/retheme-ground.mjs paints the family's
// pictures from it; the build step swaps it for terrain2.js in generate.mjs.
//   Grass: a calm mid green (mean value about 0.35), its base noise periodic over the tile and shared by every variant
//   so every tile seams with every other; each base (0..7) adds its own soft lush or dry blotch, faded at the edge;
//   the marks (8..19) a soft dirt patch each (eight) or a dry-grass patch (four), never a splat.
//   Hill and forest: the edge noise (`rockness`) is the reef's, shared by both kinds and all variants, so a region's
//   edge continues from tile to tile whatever the variant. Variants 0..n-1 of a mask are hill, n..2n-1 forest (n = 3
//   for an edge mask, 6 for the inside, 15): the proposed client rule picks the half by the region (gl/ground.js
//   rockTile, a seeded choice per connected region of map.rock), the variant inside it by the cell's draw as today.
import { image, hash2, vnoise } from './raster.js';

const T = 64;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
/** A well-mixed seed for a variant's own draws (terrain2.js: hash2 of neighbouring integers is correlated). */
const sd = (a, b = 0) => Math.floor(hash2(Math.floor(hash2(a, b, 991) * 1e9), a * 31 + b, 992) * 65536);

// Grass: a mid green under the units in value and saturation (the slice's stand-in was [52,74,38] to [118,144,74]);
// dirt a dusty tan, never red-brown (splats read as blood); dry grass a straw green.
const G_DARK = [54, 76, 40], G_MID = [78, 102, 52], G_LIGHT = [106, 130, 66], G_DRY = [120, 126, 72];
const DIRT = [120, 110, 84], DIRT_DARK = [92, 84, 64], PEBBLE = [138, 134, 124];
// Hill: grey rock, a lit top (value about 0.45: over the grass, under the units' pale tops), a dark layered face.
const ROCK_TOP = [136, 134, 126], ROCK_TOP2 = [84, 82, 76], ROCK_LIP = [162, 160, 150], ROCK_FACE = [34, 32, 30], ROCK_FACE2 = [76, 72, 66], CRACK = [56, 54, 50], MOSS = [88, 112, 56];
// the hill's boulders: lumps standing on the slabs, lit on their north-west, dark on their south-east, a dark seam round each
const BOULDER_LIT = [152, 150, 140], BOULDER = [114, 112, 104], BOULDER_DARK = [66, 64, 60];
// Forest: canopy in three greens darker than the grass, a dark underside where it meets the grass, trunks at its foot.
const CAN_DARK = [30, 46, 26], CAN_MID = [50, 72, 36], CAN_LIT = [78, 104, 50], CAN_GLINT = [112, 134, 66], UNDER = [28, 32, 22], TRUNK = [70, 54, 36];

/** The grass at pixel (x, y) of tile `variant`: a shared periodic base (broad mottle, clumps with a lit north-west
 *  side, fine grain), then the variant's own windowed feature. */
function grass(x, y, variant) {
  // the shared base is fine grain only (clumps 4 px across with a lit north-west side, a hash grain): a texture that
  // repeats every 4 px shows no tile; the broad mottle is each variant's own, windowed, so no two tiles are alike
  const n2 = vnoise(x, y, 8, 303, 8), n3 = vnoise(x, y, 4, 305, 16), n3b = vnoise(x + 1, y + 1, 4, 305, 16), g = hash2(x, y, 307, T);
  const vs = sd(variant, 101), r = (q) => hash2(q, 0, vs);
  const win = smooth(Math.min(x + 0.5, T - x - 0.5, y + 0.5, T - y - 0.5) / 14);                // fades the variant's own features out at the tile's edge
  const mot = (vnoise(x, y, 16, vs + 11, 0) - 0.5) * 0.4 + (vnoise(x, y, 32, vs + 13, 0) - 0.5) * 0.3;
  const u = 0.47 + (n2 - 0.5) * 0.16 + (n3 - n3b) * 0.8 + (g - 0.5) * 0.12 + mot * win;
  let c = u < 0.5 ? mix(G_DARK, G_MID, clamp01(u * 2)) : mix(G_MID, G_LIGHT, clamp01((u - 0.5) * 2));
  if (variant < 8) {                                                                          // a base: one soft lush or dry blotch of its own
    const b = vnoise(x, y, 16, vs + 17, 0);
    c = mix(c, G_DRY, clamp01((b - 0.64) * 4) * 0.3 * win);
    return mix(c, G_DARK, clamp01((0.34 - b) * 4) * 0.3 * win);
  }
  // a mark: a soft dirt patch (or a dry one), large (a third of a tile to nearly all of it), its edge eaten by grass
  const m = variant - 8, cx = 32 + (r(1) - 0.5) * 8, cy = 32 + (r(2) - 0.5) * 8, a = r(3) * Math.PI * 2, mir = r(4) < 0.5 ? -1 : 1;
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy, lx = (dx * Math.cos(a) + dy * Math.sin(a)) * mir, ly = -dx * Math.sin(a) + dy * Math.cos(a);
  const sc = 0.7 + ((m * 7) % 12) / 11 * 0.7, lobes = [[0, 0, 18, 12], [11 + r(6) * 5, 3 + r(7) * 5, 10 + r(8) * 4, 8], [-10 - r(9) * 4, -4 - r(10) * 4, 9 + r(11) * 4, 7]].slice(0, 2 + (r(12) > 0.4 ? 1 : 0));
  let e = 9;
  for (const [ox, oy, rx, ry] of lobes) e = Math.min(e, Math.hypot((lx / sc - ox) / rx, (ly / sc - oy) / ry));
  e += (vnoise(x, y, 8, vs + 500, 8) - 0.5) * 0.45 + (vnoise(x, y, 4, vs + 510, 16) - 0.5) * 0.3;  // grass eats into the edge
  if (e >= 1.35) return c;
  if (m % 3 === 2) return mix(c, G_DRY, clamp01((1.35 - e) * 1.6) * 0.45 * win);                // a dry patch: straw grass, very soft
  if (e >= 1) return mix(c, G_DRY, (1.35 - e) / 0.35 * 0.2 * win);                              // worn grass round the dirt
  const inner = vnoise(x, y, 6, vs + 520, 0) * 0.7 + hash2(x, y, vs + 530, T) * 0.3, dirt = mix(DIRT_DARK, DIRT, inner);
  const peb = hash2(x >> 1, y >> 1, vs + 540, T / 2) > 0.988 ? 0.5 : 0;                        // a pebble or two
  return mix(c, mix(dirt, PEBBLE, peb), clamp01((1 - e) * 2.2) * 0.72 * win);
}

/** Rockness at a pixel for corner mask m: terrain2.js's, so hills and forests take the reef's exact edges (shared by
 *  all variants and both kinds: an edge leaving one tile always continues into the next). */
function rockness(m, x, y) {
  const c = [m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1];
  const u = clamp01((x + 0.5) / T), v = clamp01((y + 0.5) / T);
  const b = c[0] * (1 - u) * (1 - v) + c[1] * u * (1 - v) + c[2] * (1 - u) * v + c[3] * u * v;
  return b + (vnoise(x, y, 16, 41, 4) - 0.5) * 0.34 + (vnoise(x, y, 4, 43, 16) - 0.5) * 0.12;
}
/** Variants per mask and kind: 3 for an edge, 6 for the plateau's inside. */
export const VARIANTS = (m) => (m === 15 ? 6 : 3);
export const kindOf = (m, v) => (v < VARIANTS(m) ? 'hill' : 'forest');

const FACE = 22; // the hill's south face in px (some 10 game units: tall to the south, as the reef's, and dark; round 2's judge saw a flat plateau with a thin outline)
const SIDE = 5;  // its north face's height, the west and east faces' width one less
/** A hill's own marks for a variant: a few cracks and moss tufts at hashed places clear of the edge. */
const hillMarks = (v) => Array.from({ length: 5 + (v % 3) }, (_, k) => ({ x: 8 + hash2(k, 0, sd(v, 131)) * 48, y: 8 + hash2(k, 0, sd(v, 137)) * 48, a: hash2(k, 0, sd(v, 141)) * Math.PI, len: 4 + hash2(k, 0, sd(v, 143)) * 7, moss: k % 3 !== 2, seed: sd(v, 150 + k) }));

/** The forest's crowns: a lattice of C px cells, periodic over the tile, each cell one crown whose place and size are
 *  shared at the tile's edge (so canopies seam) and the variant's own inside (so no two tiles repeat). */
const C = 16, NC = T / C;
function crown(ci, cj, vs, salt = 0) {
  const wi = ((ci % NC) + NC) % NC, wj = ((cj % NC) + NC) % NC, h = (q, s) => hash2(wi, wj, q + s + salt);
  const sx = (ci + 0.5) * C + (h(1, 0) - 0.5) * C * 0.9, sy = (cj + 0.5) * C + (h(2, 0) - 0.5) * C * 0.9;
  const w = smooth((Math.min(sx, T - sx, sy, T - sy) - 20) / 6);                               // 0 for any crown that can reach the tile's edge (r up to 19): shared, so canopies seam; 1 in the middle: the variant's own
  const x = lerp(sx, (ci + 0.5) * C + (h(1, vs) - 0.5) * C * 0.9, w), y = lerp(sy, (cj + 0.5) * C + (h(2, vs) - 0.5) * C * 0.9, w);
  return { x, y, r: C * (0.7 + lerp(h(3, 0), h(3, vs), w) * 0.5), top: lerp(h(4, 0), h(4, vs), w), on: h(5, 0) };
}

export function tile(m, variant = 0) {
  const kind = kindOf(m, variant), v = kind === 'hill' ? variant : variant - VARIANTS(m), vs = sd(v + 7, 211 + m * 0);
  // rockness clamps its corner weights at the tile's edge and its noise is periodic, so asked beyond the tile it continues
  // the edge's value: the faces and the shadows run on across a tile's edge instead of stopping at it (the reef's did stop,
  // so a face showed only where the contour ran through a tile's middle)
  const isRock = (x, y) => m === 15 || (m !== 0 && rockness(m, x, y) > 0.5);
  const reach = (x, y, dx, dy, n) => { for (let d = 1; d <= n; d++) if (!isRock(x + dx * d, y + dy * d)) return d; return 0; };
  const toRock = (x, y, dx, dy, n) => { for (let d = 1; d <= n; d++) if (isRock(x + dx * d, y + dy * d)) return d; return 0; };   // px to the first rock in a direction (0: none within n)
  const marks = hillMarks(v);
  return image(T, T, (x, y) => {
    let c;
    if (!isRock(x, y)) {
      c = grass(x, y, m === 0 ? variant : 0);
      if (m && kind === 'hill') {
        // the hill's south face hangs below the plateau's edge on screen and covers the ground south of it (the camera is
        // south, 40 degrees up): so the face is painted on the open side of the contour, where it always gets its full
        // height (the reef painted it on the rock side, where an inside tile cut it short); dark over its whole height,
        // the lip at its top, the beds' seams across it; the contact shadow on the grass beyond its foot
        const up = toRock(x, y, 0, -1, FACE + 6);
        if (up && up <= FACE) {
          const t = 1 - up / FACE, wob = vnoise(x, y, 8, 71, 8) * 5, layer = (Math.sin((y + wob) * 1.25) + 1) / 2, seam = layer > 0.88 ? 1 : 0;
          c = mix(ROCK_FACE, ROCK_FACE2, (layer * 0.4 + seam * 0.6) * 0.55).map(q => q * (0.72 + 0.22 * t) * (0.94 + hash2(x, y, 77, T) * 0.1));
          if (up === 1) c = mix(c, ROCK_LIP, 0.7); else if (up === 2) c = mix(c, ROCK_LIP, 0.25);
          return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255];
        }
        let sh = up ? 0.5 - (up - FACE) * 0.08 : 0;
        for (let d = 1; d <= 3; d++) if (isRock(x - d, y)) { sh = Math.max(sh, 0.3 - d * 0.08); break; }
        for (let d = 1; d <= 2; d++) if (isRock(x, y + d) || isRock(x + d, y)) { sh = Math.max(sh, 0.3 - d * 0.12); break; }
        c = c.map(q => q * (1 - sh));
      } else if (m) { // the trees' shadow south and east, a dark foot on the other sides
        const S = 9, k = 0.6;
        let sh = 0;
        for (let d = 1; d <= S; d++) if (isRock(x, y - d)) { sh = Math.max(sh, k - d * (k / (S + 1))); break; }
        for (let d = 1; d <= 3; d++) if (isRock(x - d, y)) { sh = Math.max(sh, 0.3 - d * 0.08); break; }
        for (let d = 1; d <= 2; d++) if (isRock(x, y + d) || isRock(x + d, y)) { sh = Math.max(sh, 0.3 - d * 0.12); break; }
        c = c.map(q => q * (1 - sh));
      }
    } else if (kind === 'hill') {
      const below = reach(x, y, 0, 1, 2), above = reach(x, y, 0, -1, SIDE + 2), left = reach(x, y, -1, 0, SIDE + 1), right = reach(x, y, 1, 0, SIDE + 1);
      const layered = (t) => { // the short north, west and east faces: the rock's beds in shade, thin pale seams
        const wob = vnoise(x, y, 8, 71, 8) * 5, layer = (Math.sin((y + wob) * 1.25) + 1) / 2, seam = layer > 0.88 ? 1 : 0;
        return mix(ROCK_FACE, ROCK_FACE2, (layer * 0.4 + seam * 0.6) * 0.55).map(q => q * (0.72 + 0.2 * t) * (0.94 + hash2(x, y, 77, T) * 0.1));
      };
      if ((above && above <= SIDE) || (left && left < SIDE) || (right && right < SIDE)) {
        const t = Math.min(above && above <= SIDE ? above / SIDE : 1, left && left < SIDE ? left / SIDE : 1, right && right < SIDE ? right / SIDE : 1);
        c = layered(t * 0.8);
      } else {
        // the top: grey rock in broad slabs, periodic and shared by the variants; the lip over each face
        const n = vnoise(x, y, 32, 61, 2) * 0.45 + vnoise(x, y, 8, 63, 8) * 0.35 + vnoise(x, y, 4, 65, 16) * 0.2;
        c = mix(ROCK_TOP2, ROCK_TOP, n).map(q => q * (0.92 + hash2(x, y, 67, T) * 0.14));
        const slab = vnoise(x, y, 16, 69, 4), slabN = vnoise(x + 1, y + 1, 16, 69, 4);
        c = c.map(q => q * (1 + (slab - slabN) * 2.6));                                        // the slabs' relief, lit from the north-west (no drawn cracks: they read as worms)
        if (Math.abs(slab - 0.5) < 0.012) c = mix(c, CRACK, 0.5);                              // a thin joint between slabs
        // boulders: on the crowns' lattice (its own salt), about half the cells, each lit on its north-west and dark on its
        // south-east with a dark seam at its foot; shared at the tile's edge, the variant's own inside, as the forest's
        const gx = Math.floor(x / C), gy = Math.floor(y / C);
        let bd = 9, bk = null;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = crown(gx + i, gy + j, vs, 700); if (k.on < 0.6) continue; const d = Math.hypot(x + 0.5 - k.x, y + 0.5 - k.y) / (k.r * (0.3 + 0.55 * k.top)); if (d < bd) { bd = d; bk = k; } }   // (two cells in five, sizes from a stone to a slab: an even field of one size read as cobbles)
        if (bk && bd < 1) {
          const dx = (x + 0.5 - bk.x) / bk.r, dy = (y + 0.5 - bk.y) / bk.r, lit = clamp01(0.6 - (dx + dy) * 1.1 - bd * 0.2) + (hash2(x, y, 87, T) - 0.5) * 0.1;
          c = bd > 0.86 ? BOULDER_DARK.map(q => q * 0.8) : lit > 0.55 ? BOULDER_LIT : lit > 0.28 ? BOULDER : BOULDER_DARK;
        }
        const broken = vnoise(x, y, 4, 91, 16) > 0.32;                                        // the lit lip, broken here and there
        if (above === SIDE + 1 && broken) c = mix(c, ROCK_LIP, 0.8); else if (above === SIDE + 2 && broken) c = mix(c, ROCK_LIP, 0.35);
        if (left === SIDE && broken) c = mix(c, ROCK_LIP, 0.5); else if (left === SIDE + 1) c = mix(c, ROCK_LIP, 0.2);
        if (right === SIDE) c = mix(c, ROCK_LIP, 0.22);
        if (below === 1) c = mix(c, ROCK_LIP, 0.55); else if (below === 2) c = mix(c, ROCK_LIP, 0.2);               // the lit edge over the south face
        for (const p of marks) { // a crack (one short straight dark line) or a moss tuft
          const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, ca = Math.cos(p.a), sa = Math.sin(p.a), along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
          if (p.moss) { const d = Math.hypot(along / 1.5, across) + (hash2(x, y, p.seed, T) - 0.5) * 0.9; if (d < 3.4) c = mix(c, d < 1.6 ? MOSS : MOSS.map(q => q * 0.8), 0.85 - d * 0.12); continue; }   // a tuft of grass in a crack, darker at its edge
          if (Math.abs(along) < p.len * 0.7 && Math.abs(across) < 0.6) c = mix(c, CRACK, 0.5);
        }
      }
    } else {
      // the forest: the canopy's crowns, the one nearest (in radii) owns the pixel; lit on its north-west, dark on its
      // south-east, a dark seam where two crowns meet; the dark underside and trunks where the canopy meets the grass
      const gx = Math.floor(x / C), gy = Math.floor(y / C);
      let best = null, b1 = 9, b2 = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const k = crown(gx + i, gy + j, vs), d = Math.hypot(x + 0.5 - k.x, y + 0.5 - k.y) / k.r - k.top * 0.25;
        if (d < b1) { b2 = b1; b1 = d; best = k; } else if (d < b2) b2 = d;
      }
      const dx = (x + 0.5 - best.x) / best.r, dy = (y + 0.5 - best.y) / best.r, lit = clamp01(0.55 - (dx + dy) * 0.55 - Math.hypot(dx, dy) * 0.25) + (hash2(x, y, 81, T) - 0.5) * 0.12;
      c = lit < 0.5 ? mix(CAN_DARK, CAN_MID, lit * 2) : mix(CAN_MID, CAN_LIT, (lit - 0.5) * 2);
      if (b2 - b1 < 0.1) c = mix(c, CAN_DARK, 0.75);                                            // the seam between crowns
      if (hash2(x, y, 83, T) > 0.985 && lit > 0.5) c = mix(c, CAN_GLINT, 0.7);                 // a leaf catching the light
      const below = reach(x, y, 0, 1, 7), above = reach(x, y, 0, -1, 3), left = reach(x, y, -1, 0, 3), right = reach(x, y, 1, 0, 3);
      if (below) { // the south edge: the canopy's underside in shade with trunks standing in it
        const trunk = hash2(Math.floor(x / 5), 0, 85, T / 5) > 0.45 && (x % 5) < 2 && below < 6;
        c = trunk ? TRUNK.map(q => q * (0.7 + below * 0.05)) : mix(UNDER, c, clamp01((below - 3) / 5) * 0.5);
      } else if (above || left || right) c = mix(c, CAN_DARK, 0.55);                            // the other edges: a dark rim
    }
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255];
  });
}

export function terrainSprites() {
  const out = [];
  for (let v = 0; v < 20; v++) out.push({ name: `ground_${v}`, img: tile(0, v), anchor: { x: 0, y: 0 } });
  for (let m = 1; m < 16; m++) for (let v = 0; v < VARIANTS(m) * 2; v++) out.push({ name: `rock_${m}_${v}`, img: tile(m, v), anchor: { x: 0, y: 0 } });
  return out;
}
