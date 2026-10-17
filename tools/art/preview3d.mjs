// Contact sheet of 3D-rendered sprites on a ground-coloured background: node tools/art/preview3d.mjs out.png [regex] [scale]
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
const [out = '/tmp/p3d.png', filter = '', scale = '2'] = process.argv.slice(2);
const sprites = await render3d(filter); const S = +scale;
const cols = Math.min(8, sprites.length), cw = Math.max(...sprites.map(s => s.img.w)) + 8, ch = Math.max(...sprites.map(s => s.img.h)) + 8;
const W = cols * cw * S, H = Math.ceil(sprites.length / cols) * ch * S, data = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) data.set([40, 48, 58, 255], i * 4);
sprites.forEach((s, k) => {
  const ox = (k % cols) * cw * S, oy = Math.floor(k / cols) * ch * S;
  for (let y = 0; y < s.img.h * S; y++) for (let x = 0; x < s.img.w * S; x++) {
    const si = (Math.floor(y / S) * s.img.w + Math.floor(x / S)) * 4, a = s.img.data[si + 3] / 255; if (!a) continue;
    const di = ((oy + y) * W + ox + x) * 4; for (let c = 0; c < 3; c++) data[di + c] = data[di + c] * (1 - a) + s.img.data[si + c] * a;
  }
});
writeFileSync(out, encodePNG({ w: W, h: H, data })); console.log(sprites.length, 'sprites ->', out);
