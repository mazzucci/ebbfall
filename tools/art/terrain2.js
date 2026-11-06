// High-resolution terrain (64 px per tile = 2x the game's units) for a dual grid, painted smoothly: blended dirt
// colours, pebbles with soft shading, cracks; rock plateaus with a lit rim, a south-facing cliff face with strata
// and a soft contact shadow. Corner-mask scheme and seamless variants as in terrain.js (bit 1 TL, 2 TR, 4 BL, 8 BR).
import { image, hash2, vnoise } from './raster.js';

const T = 64;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Ground: the drained seabed (STYLE.md): wet sand and slate, salt crust in pale veins, dark patches of drying kelp;
// the darkest thing on screen. Rock: blue-grey slate (unchanged for now).
const SAND = [58, 54, 47], SAND_WET = [44, 42, 38], SLATE = [40, 44, 50], SALT = [142, 140, 130], SALT_DIM = [96, 95, 88], KELP = [26, 32, 27], KELP_DARK = [18, 22, 19];
const ROCK_TOP = [92, 100, 116], ROCK_TOP2 = [74, 82, 98], ROCK_LIP = [150, 160, 178], ROCK_FACE = [44, 49, 60], ROCK_FACE2 = [56, 62, 74];

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

/** Ground colour at pixel (x, y) of a tile; noise periodic over the tile so every tile seams with every other. The base
 *  tile (variant 0, most of the map) is calm: sand with slate showing through, soft ripples, low ridges. Variants add
 *  marks inside the tile, faded out at its edges: a branching salt vein, a kelp strand, a crust plate, shells, a kelp patch. */
function ground(x, y, variant) {
  const n2 = vnoise(x, y, 8, 9, 8), n3 = vnoise(x, y, 4, 13, 16), n4 = vnoise(x, y, 2, 15, 32), n5 = vnoise(x, y, 16, 19, 4);
  let c = mix(SAND, SLATE, clamp01(0.3 + (n2 - 0.5) * 0.9));                                // sand with slate showing through
  c = mix(c, SAND_WET, clamp01((n5 - 0.5) * 2) * 0.45);                                      // wet, darker sheets
  const rip = Math.sin((4 * x + 2 * y) * Math.PI * 2 / T + (n3 - 0.5) * 2.4);                 // sand ripples running north-east
  let k = 0.95 + rip * 0.045 + (n4 - 0.5) * 0.08 + (hash2(x, y, 17, T) - 0.5) * 0.07;
  if (n5 > 0.6 && n5 < 0.66) k += (0.66 - Math.abs(n5 - 0.63) * 2 - 0.6) * 1.2;              // a low slate ridge: a soft contour catching the light
  c = c.map(v => v * k);
  if (!variant) return c;
  const r = (q) => hash2(variant, q, 101), u = (x + 0.5) / T, v = (y + 0.5) / T;
  const win = clamp01(Math.min(1, Math.sin(Math.PI * u) * 4) * Math.min(1, Math.sin(Math.PI * v) * 4)); // fades marks out at the tile edge
  const kind = (variant - 1) % 5;
  if (kind === 0 || kind === 3) {                                                            // a branching salt vein, thin and pale
    const p0 = [8 + r(1) * 10, 10 + r(2) * 44], p1 = [24 + r(3) * 8, 16 + r(4) * 32], p2 = [40 + r(5) * 8, 14 + r(6) * 36], p3 = [56 + r(7) * 6, 10 + r(8) * 44];
    const main = [p0, p1, p2, p3], b1 = [p1, [p1[0] + 6 + r(9) * 8, p1[1] + (r(10) > 0.5 ? 1 : -1) * (8 + r(11) * 10)]], b2 = [p2, [p2[0] + 4 + r(12) * 6, p2[1] + (r(13) > 0.5 ? 1 : -1) * (6 + r(14) * 10)]];
    const wob = (vnoise(x, y, 3, 53 + variant, 0) - 0.5) * 1.6, d = Math.min(segDist(x + wob, y, main), segDist(x, y + wob, b1) + 0.3, segDist(x, y + wob, b2) + 0.3);
    if (d < 0.75) c = mix(c, SALT, 0.75 * win); else if (d < 1.7) c = mix(c, SALT_DIM, (1.7 - d) * 0.45 * win);
  }
  if (kind === 1) {                                                                          // a strand of kelp, with a dark patch under it
    const pts = [[8 + r(20) * 10, 12 + r(21) * 12], [24 + r(22) * 8, 30 + r(23) * 10], [40 + r(24) * 8, 24 + r(25) * 20], [54 + r(26) * 6, 40 + r(27) * 12]];
    const d = segDist(x, y + Math.sin(x * 0.5 + variant) * 1.5, pts);
    const patch = vnoise(x, y, 8, 61 + variant, 0);
    if (patch > 0.6) c = mix(c, KELP, clamp01((patch - 0.6) * 5) * 0.6 * win);
    if (d < 1.2) c = mix(c, KELP_DARK, 0.9 * win); else if (d < 2.4) c = mix(c, KELP, (2.4 - d) * 0.4 * win);
  }
  if (kind === 2) {                                                                          // a plate of salt crust, cracked
    const cx = 20 + r(30) * 24, cy = 20 + r(31) * 24, d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + (hash2(x, y, 41 + variant, T) - 0.5) * 1.5;
    if (d < 8 + r(32) * 4) { const crack = hash2(x >> 1, y >> 1, 43 + variant, T) > 0.88; c = mix(c, crack ? SAND_WET : SALT, (crack ? 0.5 : 0.5 + (hash2(x, y, 47, T) - 0.5) * 0.2) * win); }
  }
  if (kind === 3 || kind === 4) {                                                            // shells and pebbles lit from the north-west
    for (let p = 0; p < 2 + kind; p++) {
      const cx = 12 + r(p * 3 + 70) * 40, cy = 12 + r(p * 3 + 71) * 40, rad = 1.4 + r(p * 3 + 72) * 2.2;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d <= rad) { const lit = clamp01(0.55 - (dx + dy) / (rad * 2.4)); return p % 2 ? mix([56, 60, 66], [104, 110, 118], lit) : mix([110, 104, 90], [184, 178, 160], lit); }
      if (d <= rad + 2 && dy > 0 && dx > -rad * 0.4) c = c.map(v => v * (0.72 + 0.14 * (d - rad)));
    }
  }
  if (kind === 4) {                                                                          // a patch of drying kelp
    const patch = vnoise(x, y, 10, 67 + variant, 0) * 0.7 + vnoise(x, y, 3, 71 + variant, 0) * 0.3;
    if (patch > 0.58) c = mix(c, patch > 0.68 ? KELP_DARK : KELP, clamp01((patch - 0.58) * 6) * 0.8 * win);
  }
  return c;
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

export function tile(m, variant = 0) {
  const isRock = (x, y) => m === 15 || (m !== 0 && rockness(m, x, y) > 0.5);
  return image(T, T, (x, y) => {
    let c;
    if (!isRock(x, y)) {
      c = ground(x, y, m === 0 ? variant : 0);
      let sh = 0; // soft contact shadow south and east of cliffs
      for (let d = 1; d <= 7; d++) if (y - d >= 0 && isRock(x, y - d)) { sh = Math.max(sh, 0.62 - d * 0.075); break; }
      for (let d = 1; d <= 3; d++) if (x - d >= 0 && isRock(x - d, y)) { sh = Math.max(sh, 0.3 - d * 0.08); break; }
      c = c.map(v => v * (1 - sh));
    } else {
      let below = 0; for (let d = 1; d <= FACE; d++) if (y + d < T && !isRock(x, y + d)) { below = d; break; }
      if (below) { // south face: dark at the foot, lighter strata, a lit lip at the top
        const t = below / FACE, strata = (Math.sin((y + vnoise(x, y, 8, 71, 0) * 6) * 1.7) + 1) / 2;
        c = mix(ROCK_FACE, ROCK_FACE2, strata * 0.7 * t + 0.15);
        c = c.map(v => v * (0.6 + 0.5 * t) * (0.94 + hash2(x, y, 77, T) * 0.1));
        if (below >= FACE - 1) c = mix(c, ROCK_LIP, 0.55);
      } else {
        const n = vnoise(x, y, 18, 61, 4) * 0.6 + vnoise(x, y, 6, 63, 0) * 0.4;
        c = mix(ROCK_TOP2, ROCK_TOP, n);
        c = c.map(v => v * (0.93 + hash2(x, y, 67 + variant, T) * 0.1));
        if (y > 0 && !isRock(x, y - 1)) c = mix(c, ROCK_LIP, 0.8);                 // north rim catches the light
        else if (y > 1 && !isRock(x, y - 2)) c = mix(c, ROCK_LIP, 0.35);
        if (x > 0 && !isRock(x - 1, y)) c = mix(c, ROCK_LIP, 0.4);
        if (x < T - 1 && !isRock(x + 1, y)) c = c.map(v => v * 0.75);
        // pits: a different pattern per variant, faded out toward the tile edges so variants still seam
        const ux = (x + 0.5) / T, uy = (y + 0.5) / T, win = Math.min(1, Math.sin(Math.PI * ux) * 3) * Math.min(1, Math.sin(Math.PI * uy) * 3);
        if (vnoise(x, y, 6, 69 + variant * 7, 0) * win > 0.72) c = c.map(v => v * 0.84);
      }
    }
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255];
  });
}

export function terrainSprites() {
  const out = [];
  for (let v = 0; v < 6; v++) out.push({ name: `ground_${v}`, img: tile(0, v), anchor: { x: 0, y: 0 } });
  for (let m = 1; m < 16; m++) for (let v = 0; v < 3; v++) out.push({ name: `rock_${m}_${v}`, img: tile(m, v), anchor: { x: 0, y: 0 } });
  return out;
}
