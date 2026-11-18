// The melee units' strike poses for review (look.js STRIKE, retheme.js STRIKE_POSES): one sheet per unit, three rows (the
// walk's first frame, the wind-up, the strike) by eight facings, 0-7 above a dark line and 8-15 below it, each sprite in seat 0's color (or `seat`) on the grass,
// drawn at the size the game draws it: `1x` a desktop at zoom 1 (0.6 of the atlas's pixels: the atlas is at scale 2,
// units drawn 1.2x) and `phone` an 844x390 phone at 3x at zoom 1 (1.8 of them), then magnified `mag` times with no
// smoothing so the pixels can be read. Renders the sprites itself (tools/render3d), so it shows the models as they stand.
//   node tools/art/strike-sheet.mjs outdir [kinds,...] [seat] [facings,...]
// (`facings`, e.g. 10,11,12,13,14: render those only, the other cells left empty: a quicker look while posing)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { STRIKE } from '../../src/client/look.js';

const [outDir = 'target/art-review/strike', kindArg, seatArg = '0', facingArg] = process.argv.slice(2);
const kinds = kindArg ? kindArg.split(',') : [...STRIKE.kinds], seat = +seatArg, dirs = facingArg ? facingArg.split(',').join('|') : '\\d+';
const SIZES = [['1x', 0.6, 3], ['phone', 1.8, 1]]; // [label, device px per atlas px, magnification]
const POSES = ['0', 'wind', 'strike'];
const GRASS = [74, 92, 52];
mkdirSync(outDir, { recursive: true });
const all = await render3d(`^(${kinds.join('|')})_(${dirs})_(${POSES.join('|')})$`), tint = all.tints[seat];
const tc = [tint >> 16, tint >> 8 & 255, tint & 255].map(v => v / 255), byName = new Map(all.map(s => [s.name, s]));

/** The sprite `name` composed as the game draws it: the neutral render, then its mask multiplied by the seat's tint. */
function composed(name) {
  const s = byName.get(name), m = byName.get(`${name}_m`); if (!s) return { w: 1, h: 1, data: new Float32Array(4), ax: 0, ay: 0 }; // (a facing left out: an empty cell)
  const { w, h } = s.img, out = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = s.img.data[i * 4 + 3] / 255; let r = s.img.data[i * 4], g = s.img.data[i * 4 + 1], b = s.img.data[i * 4 + 2];
    const ma = m ? m.img.data[i * 4 + 3] / 255 : 0;
    if (ma) { r = r * (1 - ma) + m.img.data[i * 4] * tc[0] * ma; g = g * (1 - ma) + m.img.data[i * 4 + 1] * tc[1] * ma; b = b * (1 - ma) + m.img.data[i * 4 + 2] * tc[2] * ma; }
    out.set([r * a, g * a, b * a, a], i * 4); // premultiplied, for filtering
  }
  return { w, h, data: out, ax: s.anchor.x * w, ay: s.anchor.y * h };
}
/** Resampled by `k` (area average going down, bilinear going up), premultiplied. */
function resample(img, k) {
  const W = Math.max(1, Math.round(img.w * k)), H = Math.max(1, Math.round(img.h * k)), out = new Float32Array(W * H * 4);
  const at = (x, y, c) => img.data[(Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * 4 + c];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) {
    let v = 0;
    if (k < 1) { const x0 = x / k, x1 = (x + 1) / k, y0 = y / k, y1 = (y + 1) / k; let n = 0; for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) { v += at(sx, sy, c); n++; } v /= n; }
    else { const sx = (x + 0.5) / k - 0.5, sy = (y + 0.5) / k - 0.5, fx = sx - Math.floor(sx), fy = sy - Math.floor(sy), X = Math.floor(sx), Y = Math.floor(sy); v = at(X, Y, c) * (1 - fx) * (1 - fy) + at(X + 1, Y, c) * fx * (1 - fy) + at(X, Y + 1, c) * (1 - fx) * fy + at(X + 1, Y + 1, c) * fx * fy; }
    out[(y * W + x) * 4 + c] = v;
  }
  return { w: W, h: H, data: out, ax: img.ax * k, ay: img.ay * k };
}
for (const kind of kinds) for (const [label, k, mag] of SIZES) {
  const cells = POSES.map(p => Array.from({ length: 16 }, (_, d) => resample(composed(`${kind}_${d}_${p}`), k)));
  // (two blocks of eight facings, 0-7 over 8-15, each the three poses in rows: a sheet that reads when shown smaller)
  const cw = Math.max(...cells.flat().map(c => c.w)) + 4, ch = Math.max(...cells.flat().map(c => c.h)) + 4, W = cw * 8, H = ch * POSES.length * 2 + 6;
  const px = new Float32Array(W * H * 3); for (let i = 0; i < W * H; i++) px.set(i < W * (ch * POSES.length + 6) && i >= W * ch * POSES.length ? [30, 34, 28] : GRASS, i * 3);
  cells.forEach((row, r) => row.forEach((c, d) => {
    const bx = d % 8, by = (d >= 8 ? POSES.length * ch + 6 : 0) + r * ch;
    const ox = bx * cw + Math.round(cw / 2 - c.ax), oy = by + Math.round(ch * 0.62 - c.ay); // (every cell's anchor on one spot: the body never moves between rows)
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = (y * c.w + x) * 4, a = c.data[i + 3], o = (Y * W + X) * 3;
      for (let ch3 = 0; ch3 < 3; ch3++) px[o + ch3] = px[o + ch3] * (1 - a) + c.data[i + ch3];
    }
  }));
  const MW = W * mag, MH = H * mag, data = new Uint8ClampedArray(MW * MH * 4);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const o = (Math.floor(y / mag) * W + Math.floor(x / mag)) * 3, d = (y * MW + x) * 4; data[d] = px[o]; data[d + 1] = px[o + 1]; data[d + 2] = px[o + 2]; data[d + 3] = 255; }
  const file = join(outDir, `${kind}-${label}.png`);
  writeFileSync(file, encodePNG({ w: MW, h: MH, data })); console.log(file, `${MW}x${MH}`);
}
