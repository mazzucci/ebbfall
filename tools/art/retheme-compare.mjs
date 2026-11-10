// The re-theme's slice picture (Stelian's look, then four blind testers; 2026-11-10): node tools/art/retheme-compare.mjs <outdir> [--elev=40] [--skip-today]
// Rows, each a landscape phone at 2x (1688x780), seat 0 (left) against seat 1:
//   row 0  today's art at the game's 55-degree camera on the seabed: Rigger, Picket, Breakwater, Lighthouse against
//          Glint, Needle, Lens, Tidewell, a salt field between (world px 1:1 at the default zoom)
//   row 1  the slice (retheme.js: the kingdom on palette B, the Expedition's one look) at the lower camera (--elev, 40
//          by default) on grass, the units drawn 1.4x: Villager, Guard, Knight, Castle against Bot, Buggy, Marine,
//          Data centre, a gold outcrop between
//   row 2  the crowd check: about twelve units a side in a fight at the sim's spacing (they overlap), at zoom 1.0
//   row 3  the same scene at the phone's default zoom, 0.75 (the PM's question: would a closer default help)
// Writes compare.png (2x), compare-1x.png (CSS px), compare-grey.png (2x, greyscale), zoom-075.png and zoom-100.png
// (the crowd at each zoom, 2x), models/<name>.png and models/<name>@2x.png (each new model alone at phone size in
// seats 0, 1 and 6 with its team share), shares.json, and prints the team shares (review.mjs's measure: mask px over
// solid px at facing 0) and each row's ground value. Reuses review.mjs's approach: terrain2.js tile() for the ground,
// render3d.mjs for the sprites, the same compositing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { tile } from './terrain2.js';
import { render3d } from './render3d.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/retheme';
const ELEV = +opt('elev', 40), SKIP_TODAY = argv.includes('--skip-today');
mkdirSync(join(outDir, 'models'), { recursive: true });

// ---- what to render ----
const TODAY = '^harvester_(0|1|15)_[01]$|^trooper_(0|1|15)_[01]$|^vanguard_1_0$|^lumen_(8|9)_0$|^scythe_(7|8|9)_[01]$|^prism_(8|9)_0$|^bldg_(core|conflux)$|^shard_[01]$';
const KG = ['villager', 'guard', 'knight'], EX = ['bot', 'buggy', 'marine'];
const RT = `^kg_(${KG.join('|')})_(0|1|15|2|14)_[01]$|^ex_(${EX.join("|")})_(8|9|7|10|6|0)_[01]$|^bldg_(kg_castle|ex_hall)$|^rt_coins$`;
const t0 = Date.now();
const today = SKIP_TODAY ? Object.assign([], { tints: null }) : await render3d(TODAY);
const fresh = await render3d(RT, { elev: ELEV });
console.log(`rendered ${today.length + fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const TINTS = fresh.tints;
const byName = new Map([...today, ...fresh].map(s => [s.name, s]));
const masks = new Map([...today, ...fresh].filter(s => s.trim).map(s => [s.name.slice(0, -2), s.img]));
const get = (name) => { const s = byName.get(name); if (!s) throw new Error(`${name} was not rendered (filter?)`); return s; };
const tintOf = (seat) => { const c = TINTS[seat]; return [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v / 255); };

// ---- a canvas and the painters (as review.mjs) ----
const canvas = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
let SHADOW = 1; // (the new rows firm up the sprites' contact shadows: round 3's judge saw units sinking into the earth)
function draw(c, s, x, y, seat = null, alpha = 1) {
  const { w, h, data } = s.img, ox = Math.round(x - s.anchor.x * w), oy = Math.round(y - s.anchor.y * h);
  const m = seat === null ? null : masks.get(s.name), tint = seat === null ? null : tintOf(seat);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = ox + i, py = oy + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue;
    const si = (j * w + i) * 4, di = (py * c.w + px) * 4;
    let a = data[si + 3] / 255 * alpha;
    if (SHADOW !== 1 && data[si + 3] === 150 && !data[si] && !data[si + 1] && !data[si + 2]) a = Math.min(1, a * SHADOW); // (the finish's shadow: black at 150)
    if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * a;
    if (m) { a = m.data[si + 3] / 255 * alpha; if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + m.data[si + k] * tint[k] * a; }
    c.data[di + 3] = 255;
  }
}
const place = (c, list) => { for (const [name, x, y, seat] of list.slice().sort((a, b) => a[2] - b[2])) draw(c, get(name), x, y, seat ?? null); };
/** The seabed tiles (64 px, 2x) from terrain2.js, spread as review.mjs spreads them; `paint` repaints each tile. */
const tiles = {}; const groundTile = (v, paint) => (tiles[`${v}|${paint?.name ?? ''}`] ??= paint ? repaint(tile(0, v), paint) : tile(0, v));
function ground(c, y0, h, seed = 0, paint = null) {
  const ox = (seed * 37) % 64, oy = (seed * 53) % 64;
  for (let ty = -1; (ty - 1) * 64 < h; ty++) for (let tx = -1; (tx - 1) * 64 < c.w; tx++) {
    const r = (((tx + 3) * 7919 + (ty + 3) * 104729 + seed * 15485863) % 97) / 97, t = groundTile(paint ? (r > 0.94 ? [11, 13, 16, 18][((r * 1000) | 0) % 4] : ((r * 100) | 0) % 8) : r < 0.82 ? 0 : 1 + ((r * 100) | 0) % 5, paint); // (the new rows spread all eight bases evenly; one tile in sixteen one of the four largest marks, a soft dirt patch when repainted)
    for (let y = 0; y < 64; y++) { const py = ty * 64 + y - oy; if (py < 0 || py >= h) continue; for (let x = 0; x < 64; x++) { const px = tx * 64 + x - ox; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4), ((py + y0) * c.w + px) * 4); } }
  }
}
/** The seabed tile repainted as grass (Stelian): its values spread at half contrast between a dark and a light green
 *  (the tile's own grain, ripples and veins kept), the kelp marks' darks a patch of bare dirt. A stand-in for the
 *  real terrain. */
function repaint(t, { dark, light, dirt }) {
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
const GRASS = { name: 'grass', dark: [52, 74, 38], light: [118, 144, 74], dirt: [96, 90, 58] };
function half(c) {
  const o = canvas(c.w >> 1, c.h >> 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) for (let k = 0; k < 4; k++) { const i = (2 * y * c.w + 2 * x) * 4 + k; o.data[(y * o.w + x) * 4 + k] = Math.round((c.data[i] + c.data[i + 4] + c.data[i + c.w * 4] + c.data[i + c.w * 4 + 4]) / 4); }
  return o;
}
/** Bilinear resample of `c` by `k` (the zoom check: a 2x canvas at zoom 0.75 is the 1.0 canvas scaled by 0.75). */
function resample(c, k) {
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
function crop(c, x0, y0, w, h) { const o = canvas(w, h); for (let y = 0; y < h; y++) o.data.set(c.data.subarray(((y0 + y) * c.w + x0) * 4, ((y0 + y) * c.w + x0 + w) * 4), y * w * 4); return o; }
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };
function grey(c) {
  const o = canvas(c.w, c.h);
  for (let i = 0; i < c.data.length; i += 4) { const y = toSrgb(0.2126 * toLin(c.data[i]) + 0.7152 * toLin(c.data[i + 1]) + 0.0722 * toLin(c.data[i + 2])); o.data.set([y, y, y, 255], i); }
  return o;
}
function meanValue(c, y0, h) { let s = 0, n = 0; for (let y = y0; y < y0 + h; y++) for (let x = 0; x < c.w; x++) { const i = (y * c.w + x) * 4; s += (0.3 * c.data[i] + 0.59 * c.data[i + 1] + 0.11 * c.data[i + 2]) / 255; n++; } return s / n; }
// A 5x7 pixel font for the labels (upper case; rows as 5-bit numbers).
const FONT = { A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 18, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 10, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 10, 4, 4, 4, 10, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0], '/': [1, 2, 2, 4, 8, 8, 16], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '%': [25, 26, 2, 4, 8, 11, 19], ',': [0, 0, 0, 0, 0, 4, 8], '°': [6, 9, 9, 6, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], "'": [4, 4, 0, 0, 0, 0, 0] };
function label(c, text, x, y, k = 3) {
  text = text.toUpperCase(); const w = text.length * 6 * k + 2 * k, h = 9 * k;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const px = x + i, py = y + j; if (px < c.w && py < c.h) { const d = (py * c.w + px) * 4; c.data[d] = c.data[d] * 0.25; c.data[d + 1] = c.data[d + 1] * 0.25; c.data[d + 2] = c.data[d + 2] * 0.25; } }
  [...text].forEach((ch, n) => { const gl = FONT[ch] ?? FONT[' ']; for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (gl[r] >> (4 - col) & 1) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const px = x + k + n * 6 * k + col * k + dx, py = y + k + r * k + dy; if (px < c.w && py < c.h) c.data.set([236, 232, 220, 255], (py * c.w + px) * 4); } });
}

// ---- team shares (review.mjs's measure: facing 0, frame 0) ----
const shares = {};
const share = (name) => { const s = get(name), m = masks.get(name); let solid = 0, team = 0; for (let i = 3; i < s.img.data.length; i += 4) { if (s.img.data[i] === 255) solid++; if (m.data[i] >= 128) team++; } return shares[name] = +(team / solid).toFixed(3); };
console.log('team colour share of the solid pixels (facing 0; the floor is 1/6 = 0.167 for units, 0.12 for buildings: the PM, Nov 9):');
for (const name of [...KG.map(k => `kg_${k}_0_0`), 'bldg_kg_castle', ...EX.map(k => `ex_${k}_0_0`), 'bldg_ex_hall']) { const sh = share(name), floor = name.startsWith('bldg_') ? 0.12 : 1 / 6; console.log(`  ${name.padEnd(18)} ${sh.toFixed(3)}${sh < floor ? '  BELOW THE FLOOR' : ''}`); }
writeFileSync(join(outDir, 'shares.json'), JSON.stringify(shares, null, 1));
// each unit's size at zoom 1.0 (facing 0): the box of its opaque pixels without the ground shadow, in CSS px (atlas px / 2)
console.log('unit sizes at zoom 1.0 (facing 0; CSS px, width x height, the shadow left out):');
for (const name of [...KG.map(k => `kg_${k}_0_0`), ...EX.map(k => `ex_${k}_0_0`)]) {
  const { w, h, data } = get(name).img; let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (data[i + 3] === 255 && !(data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  console.log(`  ${name.padEnd(18)} ${((x1 - x0 + 1) / 2).toFixed(0)} x ${((y1 - y0 + 1) / 2).toFixed(0)}`);
}

// ---- the scenes ----
const W = 1688, H = 780;
const TODAY_LIST = [
  ['bldg_core', 330, 440, 0], ['shard_0', 844, 400], ['shard_1', 900, 470], ['bldg_conflux', 1360, 440, 1],
  ['harvester_1_0', 560, 330, 0], ['harvester_0_1', 600, 380, 0], ['trooper_0_0', 640, 450, 0], ['trooper_1_1', 680, 500, 0], ['trooper_15_0', 620, 560, 0], ['vanguard_1_0', 700, 620, 0],
  ['lumen_8_0', 1120, 330, 1], ['lumen_9_0', 1080, 380, 1], ['scythe_8_0', 1040, 450, 1], ['scythe_7_1', 1000, 500, 1], ['scythe_9_0', 1060, 560, 1], ['prism_8_0', 1010, 620, 1], ['prism_9_0', 1100, 640, 1],
];
const SLICE_LIST = [
  ['bldg_kg_castle', 330, 440, 0], ['rt_coins', 844, 430], ['bldg_ex_hall', 1360, 440, 1],
  ['kg_villager_1_0', 560, 320, 0], ['kg_villager_0_1', 610, 380, 0], ['kg_guard_0_0', 650, 460, 0], ['kg_guard_1_1', 700, 520, 0], ['kg_guard_15_0', 620, 580, 0], ['kg_knight_0_0', 720, 650, 0], ['kg_knight_2_1', 560, 690, 0],
  ['ex_bot_8_0', 1130, 320, 1], ['ex_bot_9_1', 1080, 380, 1], ['ex_buggy_8_0', 1040, 470, 1], ['ex_buggy_7_1', 1120, 560, 1], ['ex_marine_8_0', 1000, 540, 1], ['ex_marine_9_1', 1060, 640, 1], ['ex_marine_10_0', 1150, 660, 1],
];
/** The crowd: about twelve a side meeting at the centre of a world `w` x `h` (2x px), at the sim's spacing (line
 *  units r 10-11 stand about 24 world px apart in a blob; they overlap when they press). */
function crowd(cx, cy) {
  const list = [], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  const side = (names, dirs, sign) => names.forEach((name, k) => { const col = Math.floor(k / 4), row = k % 4; list.push([`${name}_${dirs[k % dirs.length]}_${k % 2}`, cx + sign * (40 + col * 52) + jit(k), cy - 90 + row * 60 + jit(k + 5) + (col % 2) * 20, sign < 0 ? 0 : 1]); });
  side(['kg_guard', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_villager', 'kg_villager'], [0, 1, 15, 2, 14], -1);
  side(['ex_marine', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_bot', 'ex_bot'], [8, 9, 7, 10, 6], 1);
  return list;
}
const rows = [];
if (!SKIP_TODAY) rows.push({ text: 'ROW 0  TODAY: HARBOUR V VAEL, 55° CAMERA, THE SEABED', make: (c) => { ground(c, 0, H, 1); place(c, TODAY_LIST); } });
rows.push({ text: `ROW 1  THE SLICE: KINGDOM (SLATE) V EXPEDITION, UNITS 1.4X, ${ELEV}°, GRASS`, make: (c) => { ground(c, 0, H, 2, GRASS); SHADOW = 1.45; place(c, SLICE_LIST); SHADOW = 1; } });
// the crowd at zoom 1.0 is the centre of a bigger canvas; at 0.75 the whole of it scaled down (the phone's 2x screen then shows 1125x520 world px)
const BIG = canvas(2250, 1040); ground(BIG, 0, 1040, 3, GRASS); SHADOW = 1.45; place(BIG, crowd(1125, 520)); SHADOW = 1;
const z100 = crop(BIG, (2250 - W) / 2, (1040 - H) / 2, W, H), z075 = resample(BIG, 0.75);
writeFileSync(join(outDir, 'zoom-100.png'), encodePNG(z100)); writeFileSync(join(outDir, 'zoom-075.png'), encodePNG(z075));
rows.push({ text: 'ROW 2  THE CROWD: 12 A SIDE AT THE SIM\'S SPACING, ZOOM 1.0', make: (c) => c.data.set(z100.data) });
rows.push({ text: 'ROW 3  THE SAME CROWD AT THE PHONE\'S DEFAULT ZOOM, 0.75', make: (c) => c.data.set(z075.data) });
const big = canvas(W, H * rows.length);
rows.forEach((row, n) => {
  const sub = canvas(W, H); row.make(sub);
  const gv = meanValue(sub, 0, H);
  label(sub, `${row.text}  GROUND ${gv.toFixed(2)}`, 12, 12, 2);
  big.data.set(sub.data, n * H * W * 4);
  console.log(`row ${n}: mean value ${gv.toFixed(3)}`);
});
writeFileSync(join(outDir, 'compare.png'), encodePNG(big));
writeFileSync(join(outDir, 'compare-1x.png'), encodePNG(half(big)));
writeFileSync(join(outDir, 'compare-grey.png'), encodePNG(grey(big)));

// ---- each new model alone at phone size, seats 0, 1 and 6, its share in the label ----
const B = 224;
for (const [side, kinds, bld] of [['kg', KG, 'castle'], ['ex', EX, 'hall']]) for (const kind of [...kinds, bld]) {
  const isB = kind === bld, name = isB ? `bldg_${side}_${bld}` : `${side}_${kind}_0_0`, P = isB ? 520 : B;
  const c = canvas(P * 3, P + 30); ground(c, 0, P + 30, 7 + kind.length, GRASS); SHADOW = 1.45;
  [0, 1, 6].forEach((seat, k) => draw(c, get(name), P * k + P / 2, P / 2 + (isB ? P * 0.12 : P * 0.1), seat));
  SHADOW = 1;
  label(c, `${name}  SEATS 0 1 6  TEAM ${shares[name].toFixed(3)}`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(half(c)));
}
console.log('slice picture ->', outDir);
