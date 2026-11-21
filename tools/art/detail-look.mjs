// detail-exp: a quick look at raw frames (target/hd/raw/<tag>, tools/art/hd-render.mjs): the named frames of one or
// more tags side by side on the game's grass tone, the team mask tinted with a seat's color, each pixel drawn `scale` times.
//   node tools/art/detail-look.mjs <out.png> <scale> <seat> <tag,tag> <frame> [frame...]   (a frame may carry a crop: name@x,y,w,h in its own pixels)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.js';
const [out, sc, seat, tags, ...frames] = process.argv.slice(2), S = +sc, root = fileURLToPath(new URL('../../', import.meta.url));
const TINT = [0x2f63d6, 0xe0386e, 0x0e9478, 0xc293e0][+seat], tint = [TINT >> 16, TINT >> 8 & 255, TINT & 255].map(v => v / 255);
const cells = [];
for (const fr of frames) for (const tag of tags.split(',')) {
  const [name, crop] = fr.split('@'), dir = join(root, 'target/hd/raw', tag), ix = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const s = ix.sprites.find(s => s.name === name), m = ix.sprites.find(q => q.name === name + '_m'); if (!s) throw new Error(`${name} not in ${tag}`);
  const k = ix.hd / 2, d = readFileSync(join(dir, name + '.rgba')), md = m ? readFileSync(join(dir, name + '_m.rgba')) : null; // (crops are given in 2x pixels)
  const [cx, cy, cw, ch] = crop ? crop.split(',').map(v => Math.round(+v * k)) : [0, 0, s.w, s.h];
  cells.push({ s, d, md, cx, cy, cw, ch, z: S / k });
}
const W = cells.reduce((a, c) => a + Math.round(c.cw * c.z) + 6, 6), H = Math.max(...cells.map(c => Math.round(c.ch * c.z))) + 12, data = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) data.set([104, 128, 72, 255], i * 4);
let ox = 6;
for (const c of cells) {
  const w = Math.round(c.cw * c.z), h = Math.round(c.ch * c.z);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = c.cx + Math.floor(x / c.z), sy = c.cy + Math.floor(y / c.z); if (sx >= c.s.w || sy >= c.s.h) continue;
    const si = (sy * c.s.w + sx) * 4, di = ((y + 6) * W + ox + x) * 4, a = c.d[si + 3] / 255;
    for (let ch = 0; ch < 3; ch++) data[di + ch] = data[di + ch] * (1 - a) + c.d[si + ch] * a;
    if (c.md) { const ma = c.md[si + 3] / 255; for (let ch = 0; ch < 3; ch++) data[di + ch] = data[di + ch] * (1 - ma) + c.md[si + ch] * tint[ch] * ma; }
  }
  ox += w + 6;
}
writeFileSync(out, encodePNG({ w: W, h: H, data })); console.log(`${W}x${H} -> ${out}`);
