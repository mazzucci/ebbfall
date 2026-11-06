// High-resolution terrain (64 px per tile = 2x the game's units) for a dual grid, painted smoothly: the drained
// seabed with its marks; reef plateaus with a bleached lip, a dark face in layers on every edge (tall to the south) and
// a soft contact shadow. Corner-mask scheme and seamless variants as in terrain.js (bit 1 TL, 2 TR, 4 BL, 8 BR).
import { image, hash2, vnoise } from './raster.js';

const T = 64;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Ground: the drained seabed (STYLE.md): wet sand and slate, salt crust in pale veins, dark patches of drying kelp;
// the darkest thing on screen. Rock: dead reef, a pale lip over a dark layered face.
const SAND = [58, 54, 47], SAND_WET = [44, 42, 38], SLATE = [40, 44, 50], SALT = [142, 140, 130], SALT_DIM = [96, 95, 88], KELP = [36, 29, 21], KELP_DARK = [23, 19, 14];
// Rock: dead reef (the PRD): a pale bleached lip, a crumbly grey-brown top pitted with holes, a dark face in layers.
const ROCK_TOP = [86, 82, 73], ROCK_TOP2 = [68, 65, 58], ROCK_LIP = [168, 162, 146], ROCK_FACE = [34, 32, 30], ROCK_FACE2 = [70, 66, 58], ROCK_PIT = [42, 40, 36];
const KELP_EDGE = [46, 39, 25]; // kelp brown-black, olive at its edge, never green (round 3's green kelp doubled as the seep)

/** A well-mixed seed for a variant's own noise and draws: hash2 of nearby integers is correlated (one mixing round), so
 *  variants seeded 1, 2, 3 came out alike (round 1's marks all lay one way); hashing twice spreads them. */
const sd = (a, b = 0) => Math.floor(hash2(Math.floor(hash2(a, b, 991) * 1e9), a * 31 + b, 992) * 65536);

/** Distance from (x, y) to a polyline of [x, y] points. */
function segDist(x, y, pts) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay;
    const t = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}
/** A smooth curve through control points, sampled into a polyline (Catmull-Rom, 6 steps a span). */
function curve(ctrl, steps = 6) {
  const out = [], P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < steps; k++) {
    const t = k / steps, t2 = t * t, t3 = t2 * t, [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    out.push([0, 1].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
  }
  out.push(ctrl[ctrl.length - 1]); return out;
}

/** The seabed at pixel (x, y) of a tile: the base noise is periodic over the tile, so every tile seams with every other.
 *  Sand with slate showing through, soft ripples, low ridges; then by variant (src/client/gl/ground.js GROUND_BASES,
 *  GROUND_MARKS): faint pale salt veins, each base (0..7) its own; a mark tile (8..19) one mark, each of its own size,
 *  turn, mirror and size: kelp drying in a dark patch (the shore litter's pale pebble pairs went in round 3). Veins and
 *  marks fade out at the tile's edge (the neighbours are other variants). */
function ground(x, y, variant) {
  const n2 = vnoise(x, y, 8, 9, 8), n3 = vnoise(x, y, 4, 13, 16), n4 = vnoise(x, y, 2, 15, 32), n5 = vnoise(x, y, 16, 19, 4);
  let c = mix(SAND, SLATE, clamp01(0.3 + (n2 - 0.5) * 0.9));                                // sand with slate showing through
  c = mix(c, SAND_WET, clamp01((n5 - 0.5) * 2) * 0.45);                                      // wet, darker sheets
  const rip = Math.sin((2 * x + y) * Math.PI * 2 / T + (n3 - 0.5) * 5 + (n2 - 0.5) * 3);      // soft sand ripples, bent by noise so no one direction shows
  let k = 0.95 + rip * 0.025 + (n4 - 0.5) * 0.08 + (hash2(x, y, 17, T) - 0.5) * 0.07;
  if (n5 > 0.6 && n5 < 0.66) k += (0.66 - Math.abs(n5 - 0.63) * 2 - 0.6) * 1.2;              // a low slate ridge: a soft contour catching the light
  c = c.map(v => v * k);
  const vs = sd(variant, 101), r = (q) => hash2(q, 0, vs), u = (x + 0.5) / T, v = (y + 0.5) / T;
  const win = clamp01(Math.min(1, Math.sin(Math.PI * u) * 4) * Math.min(1, Math.sin(Math.PI * v) * 4)); // fades marks out at the tile edge
  c = veins(c, x, y, variant < 8 ? variant : 8, win);
  if (variant < 8) return c;
  const m = variant - 8;
  // The mark's own frame: its centre, a turn, a mirror and a scale, so no two marks lie the same way.
  const cx = 32 + (r(1) - 0.5) * 14, cy = 32 + (r(2) - 0.5) * 14, a = r(3) * Math.PI * 2, mir = r(4) < 0.5 ? -1 : 1;
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy, lx = (dx * Math.cos(a) + dy * Math.sin(a)) * mir, ly = -dx * Math.sin(a) + dy * Math.cos(a);
  // kelp drying in a dark patch: two or three lobes, fibrous inside, a damp halo; the twelve marks spread from a scrap
  // to near a tile across (the renderer clusters them: gl/ground.js groundTile)
  const sc = 0.4 + ((m * 7) % 12) / 11 * 0.95 + (r(5) - 0.5) * 0.08, lobes = [[0, 0, 13, 7.5], [9 + r(6) * 5, 3 + r(7) * 4, 7 + r(8) * 3, 5], [-8 - r(9) * 4, -3 - r(10) * 3, 6 + r(11) * 3, 4.5]].slice(0, 2 + (r(12) > 0.4 ? 1 : 0));
  let e = 9;
  for (const [ox, oy, rx, ry] of lobes) e = Math.min(e, Math.hypot((lx / sc - ox) / rx, (ly / sc - oy) / ry));
  e += (vnoise(x, y, 8, vs + 500, 8) - 0.5) * 0.55 + (vnoise(x, y, 4, vs + 510, 16) - 0.5) * 0.25;
  if (e < 1) {
    const fib = (Math.sin(ly / sc * 2.1 + vnoise(x, y, 4, vs + 520, 16) * 5) + 1) / 2, glint = hash2(x, y, vs + 530, T) > 0.93 ? 1 : 0;
    const kelp = mix(KELP_DARK, KELP, fib * 0.8 + glint * 0.6);
    return mix(c, e > 0.82 ? mix(kelp, KELP_EDGE, 0.45) : kelp, clamp01((1 - e) * 4) * 0.92 * win).map(Math.round);
  }
  if (e < 1.35) c = c.map(q => q * (1 - (1.35 - e) / 0.35 * 0.22 * win));                   // damp sand round it
  return c;
}

/** Faint pale salt veins: a few lines of a crackle of polygons some 16 px across, a pixel wide, the base's own net and
 *  its own patches of it (a low noise picks which lines show), faded out at the tile's edge. Eight bases, so no one
 *  pattern comes back often enough to count. No branches drawn by hand, no tangles. */
function veins(c, x, y, b, win) {
  const N = 4, S = T / N, gx = Math.floor(x / S), gy = Math.floor(y / S);
  let d1 = 99, d2 = 99;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j, px = (cx + 0.15 + hash2(cx, cy, sd(b, 351), N) * 0.7) * S, py = (cy + 0.15 + hash2(cx, cy, sd(b, 353), N) * 0.7) * S, d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  const edge = (d2 - d1) / 2;                                                                // ~ the distance to the net's nearest line, in px
  if (edge > 1.2) return c;
  const on = clamp01((vnoise(x, y, 32, sd(b, 367), 2) * 0.6 + vnoise(x, y, 16, sd(b, 368), 4) * 0.4 - 0.5) * 3.5) * win;
  return mix(c, SALT_DIM, (edge < 0.5 ? 0.3 : (1.2 - edge) * 0.43) * on);
}

/** Rockness at a pixel for corner mask m. The edge noise is periodic over the tile and shared by all variants, so
 *  an edge leaving one tile always continues exactly into the next; variants differ only inside the plateau. */
function rockness(m, x, y) {
  const c = [m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1];
  const u = clamp01((x + 0.5) / T), v = clamp01((y + 0.5) / T);
  const b = c[0] * (1 - u) * (1 - v) + c[1] * u * (1 - v) + c[2] * (1 - u) * v + c[3] * u * v;
  return b + (vnoise(x, y, 16, 41, 4) - 0.5) * 0.34 + (vnoise(x, y, 4, 43, 16) - 0.5) * 0.12;
}

const FACE = 18; // cliff face height in px (rock is ~9 game units high at this camera angle)
const SIDE = 5;  // the north face's height in px, the west and east faces' width one less: every edge shows the reef standing up

/** The reef's pits and bleached nubs for a variant: a few at hashed places clear of the tile's edge (no window, so no
 *  pit-free lattice where the tiles meet, and too few to count a grid by). */
const holes = (variant) => Array.from({ length: 3 + (variant % 3) }, (_, k) => ({ x: 7 + hash2(k, 0, sd(variant, 131)) * 50, y: 7 + hash2(k, 0, sd(variant, 137)) * 50, r: 0.8 + hash2(k, 0, sd(variant, 139)) ** 2 * 2.4,
  a: hash2(k, 0, sd(variant, 141)) * Math.PI, el: 1.3 + hash2(k, 0, sd(variant, 143)) * 1.4, nub: k === 0, seed: sd(variant, 150 + k) }));

export function tile(m, variant = 0) {
  const isRock = (x, y) => m === 15 || (m !== 0 && rockness(m, x, y) > 0.5);
  /** How many px from (x, y) in a direction to the first open ground in this tile (0: none within n). */
  const reach = (x, y, dx, dy, n) => { for (let d = 1; d <= n; d++) { const px = x + dx * d, py = y + dy * d; if (px < 0 || py < 0 || px >= T || py >= T) return 0; if (!isRock(px, py)) return d; } return 0; };
  const pits = holes(variant);
  return image(T, T, (x, y) => {
    let c;
    if (!isRock(x, y)) {
      c = ground(x, y, m === 0 ? variant : 0);
      let sh = 0; // soft contact shadow south and east of cliffs, and the reef's dark foot on its other sides
      for (let d = 1; d <= 7; d++) if (y - d >= 0 && isRock(x, y - d)) { sh = Math.max(sh, 0.62 - d * 0.075); break; }
      for (let d = 1; d <= 3; d++) if (x - d >= 0 && isRock(x - d, y)) { sh = Math.max(sh, 0.3 - d * 0.08); break; }
      for (let d = 1; d <= 2; d++) if ((y + d < T && isRock(x, y + d)) || (x + d < T && isRock(x + d, y))) { sh = Math.max(sh, 0.34 - d * 0.12); break; }
      c = c.map(v => v * (1 - sh));
    } else {
      const below = reach(x, y, 0, 1, FACE), above = reach(x, y, 0, -1, SIDE + 2), left = reach(x, y, -1, 0, SIDE + 1), right = reach(x, y, 1, 0, SIDE + 1);
      const layered = (t) => { // the reef's beds: dark, thin pale seams between them, lighter towards the lip (t 0 at the foot, 1 at the lip)
        const wob = vnoise(x, y, 8, 71, 8) * 5, layer = (Math.sin((y + wob) * 1.25) + 1) / 2, seam = layer > 0.86 ? 1 : 0;
        return mix(ROCK_FACE, ROCK_FACE2, (layer * 0.5 + seam * 0.5) * (0.3 + 0.7 * t)).map(v => v * (0.55 + 0.55 * t) * (0.94 + hash2(x, y, 77, T) * 0.1));
      };
      if (below) { // the south face, tall: dark at the foot, the bleached lip at the top
        c = layered(below / FACE);
        if (below >= FACE - 1) c = mix(c, ROCK_LIP, 0.75); else if (below === FACE - 2) c = mix(c, ROCK_LIP, 0.3);
      } else if ((above && above <= SIDE) || (left && left < SIDE) || (right && right < SIDE)) { // the north, west and east faces: short, as dark
        const t = Math.min(above && above <= SIDE ? above / SIDE : 1, left && left < SIDE ? left / SIDE : 1, right && right < SIDE ? right / SIDE : 1);
        c = layered(t * 0.8);
      } else {
        // the top: dead reef, crumbly grey-brown; its noise periodic over the tile and shared by the variants, so tiles seam
        const n = vnoise(x, y, 32, 61, 2) * 0.45 + vnoise(x, y, 8, 63, 8) * 0.35 + vnoise(x, y, 4, 65, 16) * 0.2;
        c = mix(ROCK_TOP2, ROCK_TOP, n).map(v => v * (0.93 + hash2(x, y, 67, T) * 0.1));
        if (above === SIDE + 1) c = mix(c, ROCK_LIP, 0.8); else if (above === SIDE + 2) c = mix(c, ROCK_LIP, 0.35); // the bleached lip over each face
        if (left === SIDE) c = mix(c, ROCK_LIP, 0.5); else if (left === SIDE + 1) c = mix(c, ROCK_LIP, 0.2);
        if (right === SIDE) c = mix(c, ROCK_LIP, 0.22);
        for (const p of pits) { // a pit: a ragged, drawn-out hollow (not a round chip), its far wall lit; a nub: a small bleached knob
          const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, ca = Math.cos(p.a), sa = Math.sin(p.a);
          const d = Math.hypot((dx * ca + dy * sa) / p.el, -dx * sa + dy * ca) + (hash2(x, y, p.seed, T) - 0.5) * 0.9;
          if (p.nub) { if (d < p.r * 0.5) c = mix(c, ROCK_LIP, 0.4); continue; }
          if (d < p.r) c = mix(c, ROCK_PIT, 0.5 - (dx + dy) / p.r * 0.08); else if (d < p.r + 1 && dx + dy > 0) c = mix(c, ROCK_LIP, 0.14);
        }
      }
    }
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255];
  });
}

export function terrainSprites() {
  const out = [];
  for (let v = 0; v < 20; v++) out.push({ name: `ground_${v}`, img: tile(0, v), anchor: { x: 0, y: 0 } });
  for (let m = 1; m < 16; m++) for (let v = 0; v < (m === 15 ? 6 : 3); v++) out.push({ name: `rock_${m}_${v}`, img: tile(m, v), anchor: { x: 0, y: 0 } });
  return out;
}
