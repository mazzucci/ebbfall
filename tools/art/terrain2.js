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
/** A smooth curve through control points, sampled into a polyline (Catmull-Rom, 6 steps a span). */
function curve(ctrl, steps = 6) {
  const out = [], P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < steps; k++) {
    const t = k / steps, t2 = t * t, t3 = t2 * t, [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    out.push([0, 1].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
  }
  out.push(ctrl[ctrl.length - 1]); return out;
}

/** Ground colour at pixel (x, y) of a tile; noise periodic over the tile so every tile seams with every other. The base
 *  tile (variant 0, most of the map) is calm: sand with slate showing through, soft ripples, low ridges. Variants add
 *  marks inside the tile, faded out at its edges: thin salt veins along the slate cracks, flat kelp strands, a crust
 *  plate, a clustered scatter of shells and pebbles, a piece of driftwood with its shadow. */
function ground(x, y, variant) {
  const n2 = vnoise(x, y, 8, 9, 8), n3 = vnoise(x, y, 4, 13, 16), n4 = vnoise(x, y, 2, 15, 32), n5 = vnoise(x, y, 16, 19, 4);
  let c = mix(SAND, SLATE, clamp01(0.3 + (n2 - 0.5) * 0.9));                                // sand with slate showing through
  c = mix(c, SAND_WET, clamp01((n5 - 0.5) * 2) * 0.45);                                      // wet, darker sheets
  const rip = Math.sin((2 * x + y) * Math.PI * 2 / T + (n3 - 0.5) * 5 + (n2 - 0.5) * 3);      // soft sand ripples, bent by noise so no one direction shows
  let k = 0.95 + rip * 0.025 + (n4 - 0.5) * 0.08 + (hash2(x, y, 17, T) - 0.5) * 0.07;
  if (n5 > 0.6 && n5 < 0.66) k += (0.66 - Math.abs(n5 - 0.63) * 2 - 0.6) * 1.2;              // a low slate ridge: a soft contour catching the light
  c = c.map(v => v * k);
  if (!variant) return c;
  const r = (q) => hash2(variant, q, 101), u = (x + 0.5) / T, v = (y + 0.5) / T;
  const win = clamp01(Math.min(1, Math.sin(Math.PI * u) * 4) * Math.min(1, Math.sin(Math.PI * v) * 4)); // fades marks out at the tile edge
  const kind = (variant - 1) % 5;
  if (kind === 0) {                                                                          // salt veins: thin, branching, low contrast, along the slate cracks
    const main = curve([[6 + r(1) * 8, 12 + r(2) * 40], [22 + r(3) * 8, 18 + r(4) * 28], [40 + r(5) * 8, 16 + r(6) * 32], [58 + r(7) * 4, 14 + r(8) * 36]]);
    const p1 = main[8], p2 = main[14], b1 = curve([p1, [p1[0] + 8 + r(9) * 6, p1[1] + (r(10) > 0.5 ? 1 : -1) * (6 + r(11) * 8)], [p1[0] + 14 + r(12) * 6, p1[1] + (r(10) > 0.5 ? 1 : -1) * (12 + r(13) * 8)]]);
    const b2 = curve([p2, [p2[0] + 6 + r(14) * 6, p2[1] + (r(15) > 0.5 ? 1 : -1) * (7 + r(16) * 8)]]);
    const d = Math.min(segDist(x, y, main), segDist(x, y, b1) + 0.25, segDist(x, y, b2) + 0.35);
    if (d < 0.7) c = mix(c, SALT_DIM, 0.8 * win); else if (d < 1.5) c = mix(c, SALT_DIM, (1.5 - d) * 0.35 * win);
  }
  if (kind === 1) {                                                                          // kelp: two or three flat dark strands, trailing one way
    for (let j = 0; j < 2 + (r(29) > 0.5 ? 1 : 0); j++) {
      const y0 = 8 + r(20 + j * 4) * 30, pts = curve([[4 + r(21 + j * 4) * 8, y0], [20, y0 + 4 + r(22 + j * 4) * 10], [38, y0 + 2 + r(23 + j * 4) * 14], [56 + r(24 + j * 4) * 4, y0 + 8 + r(25 + j * 4) * 12]]);
      const d = segDist(x, y, pts), wdt = 1.2 + j * 0.3;
      if (d < wdt) c = mix(c, KELP_DARK, 0.85 * win); else if (d < wdt + 1.2) c = mix(c, KELP, (wdt + 1.2 - d) * 0.45 * win);
    }
  }
  if (kind === 2) {                                                                          // a plate of salt crust, cracked
    const cx = 20 + r(30) * 24, cy = 20 + r(31) * 24, d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + (hash2(x, y, 41 + variant, T) - 0.5) * 1.5;
    if (d < 8 + r(32) * 4) { const crack = hash2(x >> 1, y >> 1, 43 + variant, T) > 0.88; c = mix(c, crack ? SAND_WET : SALT, (crack ? 0.5 : 0.5 + (hash2(x, y, 47, T) - 0.5) * 0.2) * win); }
  }
  if (kind === 3) {                                                                          // shells and pebbles, clustered by noise, sizes 0.6-1.4x, lit from the north-west
    const cx0 = 16 + r(70) * 32, cy0 = 16 + r(71) * 32;
    for (let p = 0; p < 7; p++) {
      const a = r(72 + p * 3) * Math.PI * 2, dist = r(73 + p * 3) ** 0.7 * 14, cx = cx0 + Math.cos(a) * dist, cy = cy0 + Math.sin(a) * dist, rad = 1.6 * (0.6 + r(74 + p * 3) * 0.8);
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d <= rad) { const lit = clamp01(0.55 - (dx + dy) / (rad * 2.4)); return p % 3 ? mix([56, 60, 66], [104, 110, 118], lit) : mix([110, 104, 90], [184, 178, 160], lit); }
      if (d <= rad + 2 && dy > 0 && dx > -rad * 0.4) c = c.map(v => v * (0.72 + 0.14 * (d - rad)));
    }
  }
  if (kind === 4) {                                                                          // a piece of driftwood: a dark log, a lit top edge, its shadow to the south-east
    const a = r(80) * Math.PI, L = 10 + r(81) * 8, cx = 32 + (r(82) - 0.5) * 20, cy = 32 + (r(83) - 0.5) * 20;
    const pts = [[cx - Math.cos(a) * L, cy - Math.sin(a) * L], [cx + Math.cos(a) * L, cy + Math.sin(a) * L]];
    const d = segDist(x, y, pts), ds = segDist(x - 1.5, y - 2, pts);
    if (d < 1.6) { const top = segDist(x + 0.6, y + 0.6, pts) > d; return mix([44, 34, 26], top ? [96, 78, 56] : [60, 46, 34], top ? 0.9 : 0.4).map(v => Math.round(v)); }
    if (ds < 1.8) c = c.map(v => v * (0.55 + 0.2 * ds));
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
