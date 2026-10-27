// Contact sheet of 3D-rendered sprites on a ground-coloured background: node tools/art/preview3d.mjs out.png [regex] [scale] [seats]
// Team-coloured sprites are shown once per seat in `seats` (comma-separated, default 0,1: their mask tinted with the seat's
// fitted tint over the neutral render, as the game draws them); `m` in the list shows the bare mask.
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
const [out = '/tmp/p3d.png', filter = '', scale = '2', seatList = '0,1'] = process.argv.slice(2);
const all = await render3d(filter), S = +scale, TINTS = all.tints, masks = new Map(all.filter(s => s.trim).map(s => [s.name.slice(0, -2), s.img]));
const cells = all.filter(s => !s.trim).flatMap(s => masks.has(s.name) ? seatList.split(',').map(k => ({ s, k })) : [{ s }]);
const cols = Math.min(8, cells.length), cw = Math.max(...cells.map(c => c.s.img.w)) + 8, ch = Math.max(...cells.map(c => c.s.img.h)) + 8;
const W = cols * cw * S, H = Math.ceil(cells.length / cols) * ch * S, data = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) data.set([40, 48, 58, 255], i * 4);
const over = (di, px, si, tint = [1, 1, 1]) => { const a = px[si + 3] / 255; if (a) for (let c = 0; c < 3; c++) data[di + c] = data[di + c] * (1 - a) + px[si + c] * tint[c] * a; };
cells.forEach(({ s, k }, n) => {
  const ox = (n % cols) * cw * S, oy = Math.floor(n / cols) * ch * S, m = masks.get(s.name), col = TINTS[+k];
  const tint = col === undefined ? null : [col >> 16, col >> 8 & 255, col & 255].map(v => v / 255);
  for (let y = 0; y < s.img.h * S; y++) for (let x = 0; x < s.img.w * S; x++) {
    const si = (Math.floor(y / S) * s.img.w + Math.floor(x / S)) * 4, di = ((oy + y) * W + ox + x) * 4;
    if (k === 'm') over(di, m.data, si); else { over(di, s.img.data, si); if (tint) over(di, m.data, si, tint); }
  }
});
writeFileSync(out, encodePNG({ w: W, h: H, data })); console.log(cells.length, 'cells ->', out);
