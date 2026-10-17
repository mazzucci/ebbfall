// High-resolution terrain (64 px per tile = 2x the game's units) for a dual grid, painted smoothly: blended dirt
// colours, pebbles with soft shading, cracks; rock plateaus with a lit rim, a south-facing cliff face with strata
// and a soft contact shadow. Corner-mask scheme and seamless variants as in terrain.js (bit 1 TL, 2 TR, 4 BL, 8 BR).
import { image, hash2, vnoise } from './raster.js';

const T = 64;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Ground: cool dusty dirt with warmer patches. Rock: blue-grey slate.
const DIRT_A = [60, 62, 68], DIRT_B = [92, 84, 72], DIRT_C = [78, 66, 54], DIRT_DARK = [34, 36, 42];
const ROCK_TOP = [92, 100, 116], ROCK_TOP2 = [74, 82, 98], ROCK_LIP = [150, 160, 178], ROCK_FACE = [44, 49, 60], ROCK_FACE2 = [56, 62, 74];

/** Ground colour at pixel (x, y) of a tile; noise periodic over the tile so every tile seams with every other. */
function ground(x, y, variant) {
  // Only fine detail here (periodic over the tile); large-scale variation comes from the renderer's overlay.
  const n2 = vnoise(x, y, 8, 9, 8), n3 = vnoise(x, y, 4, 13, 16), n4 = vnoise(x, y, 2, 15, 32);
  let c = mix(DIRT_A, DIRT_B, 0.35 + (n2 - 0.5) * 0.5);
  c = mix(c, DIRT_C, clamp01((n3 - 0.6) * 2.5) * 0.5);
  const k = 0.93 + (n3 - 0.5) * 0.1 + (n4 - 0.5) * 0.08 + (hash2(x, y, 17, T) - 0.5) * 0.07;
  c = c.map(v => v * k);
  // interior-only decals for variants: pebbles with light from the top-left, and a crack
  if (variant) {
    const r = (q) => hash2(variant, q, 101);
    for (let p = 0; p < 1 + variant % 3; p++) {
      const cx = 10 + r(p * 3) * 44, cy = 10 + r(p * 3 + 1) * 44, rad = 1.8 + r(p * 3 + 2) * 3.2;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d <= rad) { const lit = clamp01(0.55 - (dx + dy) / (rad * 2.4)); return mix([70, 74, 82], [128, 134, 144], lit); }
      if (d <= rad + 2 && dy > 0 && dx > -rad * 0.4) c = c.map(v => v * (0.72 + 0.14 * (d - rad)));
    }
    if (variant % 3 === 2) {
      const x0 = 10 + r(20) * 16, y0 = 12 + r(21) * 12, x1 = 36 + r(22) * 16, y1 = 36 + r(23) * 16;
      const t = clamp01(((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2));
      const px = x0 + (x1 - x0) * t + Math.sin(t * 9 + variant) * 3, py = y0 + (y1 - y0) * t, d = Math.abs(x + 0.5 - px) + Math.abs(y + 0.5 - py) * 0.4;
      if (d < 0.9 && t > 0.02 && t < 0.98) c = mix(c, DIRT_DARK, 0.85); else if (d < 1.8 && t > 0.02 && t < 0.98) c = c.map(v => v * 0.9);
    }
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
