// The re-theme pictures' painters, shared by tools/art/retheme-compare.mjs (the slice) and the families' scripts
// (tools/art/retheme-units.mjs, ...): a plain RGBA canvas, sprites drawn with their team masks tinted per seat (seat 0
// royal blue by the pictures' own override, nothing in src/), the seabed tile repainted as grass, the halving to CSS
// pixels, the zoom resample, grayscale and the two color-blindness simulations, a pixel-font label, review.mjs's
// team-share measure and a unit's size at zoom 1.0. Nothing here is in the game.
import { tile } from './terrain2.js';
import { SEAT_COLORS } from '../../src/client/look.js';

export const canvas = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
/** Seat 0 drawn royal blue (the PM, slice round 3): seat 5's fitted tint scaled channel by channel to the new color. */
export const SEAT0 = 0x2f63d6;
export function seatTints(tints) {
  const T = [...tints], ch = (c, k) => c >> (16 - 8 * k) & 255;
  T[0] = [0, 1, 2].reduce((t, k) => t << 8 | Math.min(255, Math.round(ch(tints[5], k) * ch(SEAT0, k) / Math.max(1, ch(SEAT_COLORS[5], k)))), 0);
  return T;
}

/** The painters over a set of rendered sprites (render3d.mjs's list with `.tints`). `shadow` firms the finish's ground
 *  shadow (black at alpha 150) when set above 1: the grass rows draw at 1.45 (round 3's judge saw units sinking). */
export function makePainters(sprites, tints = seatTints(sprites.tints)) {
  const byName = new Map(sprites.map(s => [s.name, s]));
  const masks = new Map(sprites.filter(s => s.trim).map(s => [s.name.slice(0, -2), s.img]));
  const get = (name) => { const s = byName.get(name); if (!s) throw new Error(`${name} was not rendered (filter?)`); return s; };
  const tintOf = (seat) => { const c = tints[seat]; return [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v / 255); };
  let SHADOW = 1;
  function draw(c, s, x, y, seat = null, alpha = 1) {
    const { w, h, data } = s.img, ox = Math.round(x - s.anchor.x * w), oy = Math.round(y - s.anchor.y * h);
    const m = seat === null ? null : masks.get(s.name), tint = seat === null ? null : tintOf(seat);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = ox + i, py = oy + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue;
      const si = (j * w + i) * 4, di = (py * c.w + px) * 4;
      let a = data[si + 3] / 255 * alpha;
      if (SHADOW !== 1 && data[si + 3] === 150 && !data[si] && !data[si + 1] && !data[si + 2]) a = Math.min(1, a * SHADOW);
      if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * a;
      if (m) { a = m.data[si + 3] / 255 * alpha; if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + m.data[si + k] * tint[k] * a; }
      c.data[di + 3] = 255;
    }
  }
  /** Sprites sorted by ground y, as the game draws them: [name, x, y, seat?]. */
  const place = (c, list) => { for (const [name, x, y, seat] of list.slice().sort((a, b) => a[2] - b[2])) draw(c, get(name), x, y, seat ?? null); };
  /** review.mjs's team-share measure: mask px over solid px of one sprite. */
  const share = (name) => { const s = get(name), m = masks.get(name); let solid = 0, team = 0; for (let i = 3; i < s.img.data.length; i += 4) { if (s.img.data[i] === 255) solid++; if (m.data[i] >= 128) team++; } return +(team / solid).toFixed(3); };
  /** A sprite's size at zoom 1.0: the box of its opaque pixels without the ground shadow, in CSS px (atlas px / 2). */
  const sizeOf = (name) => {
    const { w, h, data } = get(name).img; let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (data[i + 3] === 255 && !(data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    return [(x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2];
  };
  return { tints, get, has: (name) => byName.has(name), draw, place, share, sizeOf, setShadow: (v) => { SHADOW = v; } };
}

// ---- the ground ----
/** The seabed tiles (64 px, 2x) from terrain2.js, spread as review.mjs spreads them; `paint` repaints each tile (grass). */
const tiles = {}; const groundTile = (v, paint) => (tiles[`${v}|${paint?.name ?? ''}`] ??= paint ? repaint(tile(0, v), paint) : tile(0, v));
export function ground(c, y0, h, seed = 0, paint = null) {
  const ox = (seed * 37) % 64, oy = (seed * 53) % 64;
  for (let ty = -1; (ty - 1) * 64 < h; ty++) for (let tx = -1; (tx - 1) * 64 < c.w; tx++) {
    const r = (((tx + 3) * 7919 + (ty + 3) * 104729 + seed * 15485863) % 97) / 97, t = groundTile(paint ? (r > 0.94 ? [11, 13, 16, 18][((r * 1000) | 0) % 4] : ((r * 100) | 0) % 8) : r < 0.82 ? 0 : 1 + ((r * 100) | 0) % 5, paint); // (grass spreads all eight bases evenly; one tile in sixteen one of the four largest marks, a soft dirt patch)
    for (let y = 0; y < 64; y++) { const py = ty * 64 + y - oy; if (py < 0 || py >= h) continue; for (let x = 0; x < 64; x++) { const px = tx * 64 + x - ox; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4), ((py + y0) * c.w + px) * 4); } }
  }
}
/** The seabed tile repainted as grass (Stelian): its values spread at half contrast between a dark and a light green
 *  (the tile's own grain, ripples and veins kept), the kelp marks' darks a patch of bare dirt. A stand-in for the
 *  real terrain. */
export function repaint(t, { dark, light, dirt }) {
  const o = { w: t.w, h: t.h, data: new Uint8ClampedArray(t.data.length) }, lum = [];
  for (let i = 0; i < t.data.length; i += 4) lum.push(0.3 * t.data[i] + 0.59 * t.data[i + 1] + 0.11 * t.data[i + 2]);
  const sorted = lum.filter(v => v >= 38).sort((a, b) => a - b), lo = sorted[Math.floor(sorted.length * 0.03)], hi = sorted[Math.floor(sorted.length * 0.97)];
  for (let i = 0, k = 0; i < t.data.length; i += 4, k++) {
    const u = 0.4 + (Math.max(0, Math.min(1, (lum[k] - lo) / (hi - lo))) - 0.4) * 0.5;
    const d = dirt ? 0.7 * Math.max(0, Math.min(1, (46 - lum[k]) / 18)) : 0;                   // (soft: a patch, not a splat)
    for (let ch = 0; ch < 3; ch++) o.data[i + ch] = Math.round((dark[ch] + (light[ch] - dark[ch]) * u) * (1 - d) + (dirt ? dirt[ch] : 0) * d);
    o.data[i + 3] = 255;
  }
  return o;
}
export const GRASS = { name: 'grass', dark: [52, 74, 38], light: [118, 144, 74], dirt: [96, 90, 58] };

// ---- resampling and color ----
export function half(c) {
  const o = canvas(c.w >> 1, c.h >> 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) for (let k = 0; k < 4; k++) { const i = (2 * y * c.w + 2 * x) * 4 + k; o.data[(y * o.w + x) * 4 + k] = Math.round((c.data[i] + c.data[i + 4] + c.data[i + c.w * 4] + c.data[i + c.w * 4 + 4]) / 4); }
  return o;
}
/** Bilinear resample of `c` by `k` (the zoom check: a 2x canvas at zoom 0.75 is the 1.0 canvas scaled by 0.75). */
export function resample(c, k) {
  const o = canvas(Math.round(c.w * k), Math.round(c.h * k));
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const sx = Math.min(c.w - 1.001, (x + 0.5) / k - 0.5), sy = Math.min(c.h - 1.001, (y + 0.5) / k - 0.5), x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy)), fx = sx - x0, fy = sy - y0;
    for (let ch = 0; ch < 4; ch++) {
      const p = (xx, yy) => c.data[(yy * c.w + xx) * 4 + ch];
      o.data[(y * o.w + x) * 4 + ch] = Math.round((p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy);
    }
  }
  return o;
}
export function crop(c, x0, y0, w, h) { const o = canvas(w, h); for (let y = 0; y < h; y++) o.data.set(c.data.subarray(((y0 + y) * c.w + x0) * 4, ((y0 + y) * c.w + x0 + w) * 4), y * w * 4); return o; }
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };
const MACHADO = { protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]] };
export function simulate(c, mode) {
  const o = canvas(c.w, c.h), Mx = MACHADO[mode];
  for (let i = 0; i < c.data.length; i += 4) { const r = toLin(c.data[i]), g = toLin(c.data[i + 1]), b = toLin(c.data[i + 2]); o.data.set([toSrgb(Mx[0][0] * r + Mx[0][1] * g + Mx[0][2] * b), toSrgb(Mx[1][0] * r + Mx[1][1] * g + Mx[1][2] * b), toSrgb(Mx[2][0] * r + Mx[2][1] * g + Mx[2][2] * b), 255], i); }
  return o;
}
export function grey(c) {
  const o = canvas(c.w, c.h);
  for (let i = 0; i < c.data.length; i += 4) { const y = toSrgb(0.2126 * toLin(c.data[i]) + 0.7152 * toLin(c.data[i + 1]) + 0.0722 * toLin(c.data[i + 2])); o.data.set([y, y, y, 255], i); }
  return o;
}
export function meanValue(c, y0, h) { let s = 0, n = 0; for (let y = y0; y < y0 + h; y++) for (let x = 0; x < c.w; x++) { const i = (y * c.w + x) * 4; s += (0.3 * c.data[i] + 0.59 * c.data[i + 1] + 0.11 * c.data[i + 2]) / 255; n++; } return s / n; }

// ---- a 5x7 pixel font for the labels (upper case; rows as 5-bit numbers) ----
const FONT = { A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 18, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 10, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 10, 4, 4, 4, 10, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0], '/': [1, 2, 2, 4, 8, 8, 16], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '%': [25, 26, 2, 4, 8, 11, 19], ',': [0, 0, 0, 0, 0, 4, 8], '°': [6, 9, 9, 6, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], "'": [4, 4, 0, 0, 0, 0, 0] };
export function label(c, text, x, y, k = 3) {
  text = text.toUpperCase(); const w = text.length * 6 * k + 2 * k, h = 9 * k;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const px = x + i, py = y + j; if (px < c.w && py < c.h) { const d = (py * c.w + px) * 4; c.data[d] = c.data[d] * 0.25; c.data[d + 1] = c.data[d + 1] * 0.25; c.data[d + 2] = c.data[d + 2] * 0.25; } }
  [...text].forEach((ch, n) => { const gl = FONT[ch] ?? FONT[' ']; for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (gl[r] >> (4 - col) & 1) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const px = x + k + n * 6 * k + col * k + dx, py = y + k + r * k + dy; if (px < c.w && py < c.h) c.data.set([236, 232, 220, 255], (py * c.w + px) * 4); } });
}
