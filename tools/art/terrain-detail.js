// detail-exp (never merged): the desktop detail variant of the painted ground, for the test's sample. terrain3.js is
// not touched: a detail tile is today's tile (terrain3.js `tile`) drawn at twice its resolution (128 px for a 32 px
// tile: bilinear, clamped at the tile's edge) with new elements painted over it at that resolution:
//   grass (`ground_0..19`): a fine blade grain, grass tufts (fans of blades, lit tips, a dark foot), small white
//     flowers in twos and threes on some tiles, a pebble or two; on the dirt patches (the marks) more pebbles, cart
//     ruts and a few footprints: the worn ground;
//   hills (`rock_<m>_<v>`, the hill variants): moss in the slabs' joints and pale lichen spots on the tops, only on
//     pixels well inside the top; the faces, lips, edges and shadows, which say "you cannot walk here", are today's.
//   forests: not in the sample (drawn from today's tiles).
// Every element keeps clear of the tile's edge (so tiles seam as today) and is small and low in contrast next to the
// hill's faces and the forest's rim: passable and impassable ground read as they do today.
import { tile, VARIANTS, kindOf } from './terrain3.js';
import { hash2 } from './raster.js';

const T = 64, N = 128;
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const isGrass = (d, i) => d[i + 1] > d[i] + 10 && d[i + 1] > d[i + 2] + 20;
const isDirt = (d, i) => d[i] >= d[i + 1] - 2 && d[i] > d[i + 2] + 14 && d[i] > 84;
const isTop = (d, i) => Math.abs(d[i] - d[i + 1]) < 7 && d[i + 1] - d[i + 2] < 14 && d[i + 1] - d[i + 2] > -2 && d[i] > 78 && d[i] < 180;

export function detailTile(m, variant = 0) {
  const base = tile(m, variant), b = base.data, out = new Uint8ClampedArray(N * N * 4);
  // today's tile at twice the size
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = Math.max(0, Math.min(T - 1, (x + 0.5) / 2 - 0.5)), fy = Math.max(0, Math.min(T - 1, (y + 0.5) / 2 - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(T - 1, x0 + 1), y1 = Math.min(T - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    for (let c = 0; c < 4; c++) out[(y * N + x) * 4 + c] = Math.round((b[(y0 * T + x0) * 4 + c] * (1 - tx) + b[(y0 * T + x1) * 4 + c] * tx) * (1 - ty) + (b[(y1 * T + x0) * 4 + c] * (1 - tx) + b[(y1 * T + x1) * 4 + c] * tx) * ty);
  }
  const kindAt = (x, y, test) => { const sx = Math.max(0, Math.min(T - 1, x >> 1)), sy = Math.max(0, Math.min(T - 1, y >> 1)); return test(b, (sy * T + sx) * 4); };
  /** Is every 1x pixel within `r` (2x px) of (x, y) of the kind `test`? */
  const all = (x, y, r, test) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { if (x + dx < 0 || y + dy < 0 || x + dx >= N || y + dy >= N || !kindAt(x + dx, y + dy, test)) return false; } return true; };
  const put = (x, y, c, a = 1) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= N || y >= N) return; const i = (y * N + x) * 4; for (let k = 0; k < 3; k++) out[i + k] = Math.round(out[i + k] * (1 - a) + c[k] * a); };
  const shade = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= N || y >= N) return; const i = (y * N + x) * 4; for (let q = 0; q < 3; q++) out[i + q] = Math.max(0, Math.min(255, Math.round(out[i + q] * k))); };
  const kind = m === 0 ? 'grass' : kindOf(m, variant), rnd = mulberry(7001 + m * 131 + variant * 17);
  const spot = (r, test, tries = 40) => { for (let k = 0; k < tries; k++) { const x = 10 + rnd() * (N - 20), y = 12 + rnd() * (N - 22); if (all(x | 0, y | 0, r, test)) return [x, y]; } return null; };

  if (kind === 'grass' || kind === 'hill') {
    // the blade grain: short upright strokes, a touch lighter or darker, on grass only (periodic in the tile, clear of nothing: it is under a tenth)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (kindAt(x, y, isGrass)) {
      const col = hash2(x, y >> 2, 911, N), g = hash2(x, y, 913, N);
      shade(x, y, 1 + (col - 0.5) * 0.13 + (g - 0.5) * 0.06);
    }
  }
  if (kind === 'grass') {
    const pebble = (x, y, w) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -w; dx <= w; dx++) { if (Math.abs(dx) === w && dy) continue; put(x + dx, y + dy, dx + dy < 0 ? [158, 154, 142] : dx + dy > 0 ? [92, 88, 80] : [128, 124, 114]); } for (let dx = -w + 1; dx <= w + 1; dx++) shade(x + dx, y + 2, 0.78); };
    // worn ground on a dirt patch: two cart ruts across it, footprints, pebbles
    const dirt = spot(10, isDirt, 60);
    if (dirt) {
      const a = rnd() * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      for (const off of [-5, 5]) for (let s = -46; s <= 46; s += 0.5) { const x = dirt[0] + ca * s - sa * off + Math.sin(s / 7) * 1.2, y = dirt[1] + sa * s + ca * off; if (x > 5 && y > 5 && x < N - 5 && y < N - 5 && kindAt(x | 0, y | 0, isDirt)) { shade(x, y, 0.8); shade(x + 1, y, 0.86); shade(x - 1, y + 1, 1.1); } }
      for (let k = 0; k < 5; k++) { const p = spot(3, isDirt, 20); if (p) { for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) shade(p[0] + dx, p[1] + dy, 0.84); shade(p[0], p[1] + 4, 0.86); shade(p[0] + 1, p[1] + 4, 0.86); } }
      for (let k = 0; k < 6; k++) { const p = spot(3, isDirt, 20); if (p) pebble(p[0], p[1], 1 + (k % 3 === 0 ? 1 : 0)); }
    }
    // tufts: a fan of blades from one foot, dark at the foot, lit at the tips, a soft shadow to the south-east
    const tufts = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < tufts; k++) {
      const p = spot(8, isGrass); if (!p) continue;
      const [x0, y0] = p, blades = 4 + Math.floor(rnd() * 3);
      for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 4; dx++) shade(x0 + dx + dy, y0 + 1 + dy, 0.84);
      for (let q = 0; q < blades; q++) {
        const lean = (q / (blades - 1) - 0.5) * 1.5 + (rnd() - 0.5) * 0.3, len = 6 + rnd() * 5;
        for (let s = 0; s <= len; s++) { const t = s / len, x = x0 + lean * s * 0.55 + lean * t * t * 2, y = y0 - s * 0.9; put(x, y, [48 + 74 * t, 70 + 78 * t, 36 + 40 * t], 0.9); if (s < len * 0.6) put(x + 1, y, [44 + 40 * t, 64 + 44 * t, 34 + 20 * t], 0.6); }
      }
    }
    // small white flowers in twos and threes, on four tiles in ten
    if (variant % 5 === 1 || variant % 5 === 3) {
      const p = spot(12, isGrass), n = 2 + Math.floor(rnd() * 3);
      if (p) for (let k = 0; k < n; k++) {
        const x = Math.round(p[0] + (rnd() - 0.5) * 18), y = Math.round(p[1] + (rnd() - 0.5) * 14), pale = variant % 5 === 3 ? [226, 214, 236] : [238, 236, 224];
        for (let s = 1; s <= 3; s++) put(x, y + s + 1, [52, 78, 40], 0.8);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(x + dx, y + dy, pale, 0.95);
        put(x, y, [214, 188, 110]); shade(x + 2, y + 2, 0.8);
      }
    }
    for (let k = 0, n = 1 + Math.floor(rnd() * 2.4); k < n; k++) { const p = spot(6, isGrass); if (p) pebble(p[0], p[1], 1); }
  }
  if (kind === 'hill') {
    // moss in soft clumps and pale lichen spots, only well inside the rock's top
    const clumps = m === 15 ? 4 : 2;
    for (let k = 0; k < clumps; k++) {
      const p = spot(10, isTop, 50); if (!p) continue;
      const r = 4 + rnd() * 4, lobes = [[0, 0, r], [r * 0.8, r * 0.3, r * 0.6], [-r * 0.5, r * 0.6, r * 0.55]];
      for (let dy = -12; dy <= 12; dy++) for (let dx = -14; dx <= 14; dx++) {
        let e = 9; for (const [ox, oy, rr] of lobes) e = Math.min(e, Math.hypot((dx - ox) / rr, (dy - oy) / (rr * 0.75)));
        e += (hash2(Math.round(p[0]) + dx, Math.round(p[1]) + dy, 931, N) - 0.5) * 0.7;
        if (e < 1 && all((p[0] + dx) | 0, (p[1] + dy) | 0, 2, isTop)) put(p[0] + dx, p[1] + dy, e < 0.45 ? [96, 122, 60] : dx + dy > 0 ? [62, 84, 44] : [80, 104, 52], 0.88);
      }
    }
    for (let k = 0; k < (m === 15 ? 7 : 3); k++) { const p = spot(4, isTop, 30); if (!p) continue; const r = 1 + Math.floor(rnd() * 2); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy) <= r + 0.3 && hash2(dx + 9, dy + 9, 941 + k) > 0.25) put(p[0] + dx, p[1] + dy, [172, 176, 150], 0.55); }
    for (let k = 0; k < (m === 15 ? 5 : 2); k++) { const p = spot(4, isTop, 30); if (!p) continue; put(p[0], p[1], [158, 156, 146]); put(p[0] + 1, p[1], [150, 148, 138]); put(p[0], p[1] + 1, [70, 68, 62]); put(p[0] + 1, p[1] + 1, [60, 58, 54]); } // chips of stone
  }
  return { w: N, h: N, data: out };
}
/** The sample's tiles: every grass tile and every hill tile ({ name, img }); the forests stay today's. */
export function detailTerrain() {
  const out = [];
  for (let v = 0; v < 20; v++) out.push({ name: `ground_${v}`, img: detailTile(0, v) });
  for (let m = 1; m < 16; m++) for (let v = 0; v < VARIANTS(m); v++) out.push({ name: `rock_${m}_${v}`, img: detailTile(m, v) });
  return out;
}
