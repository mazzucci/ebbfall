// Writes a scaled-up contact sheet of selected sprites for eyeballing: node tools/art/preview.mjs <out.png> [filter]
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { unitSprites } from './units.js';
import { buildingSprites, resourceSprites, effectSprites } from './props.js';

const [out = '/tmp/preview.png', filter = '', scale = '4'] = process.argv.slice(2);
const sprites = [...unitSprites(), ...buildingSprites(), ...resourceSprites(), ...effectSprites()].filter(s => new RegExp(filter).test(s.name)).slice(0, 96);
const S = +scale, cols = Math.min(16, sprites.length), cell = Math.max(...sprites.map(s => s.img.w)) + 4, rows = Math.ceil(sprites.length / cols);
const W = cols * cell * S, H = rows * cell * S, data = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { data[i * 4] = 26; data[i * 4 + 1] = 36; data[i * 4 + 2] = 52; data[i * 4 + 3] = 255; }
sprites.forEach((s, k) => {
  const ox = (k % cols) * cell * S, oy = Math.floor(k / cols) * cell * S;
  for (let y = 0; y < s.img.h * S; y++) for (let x = 0; x < s.img.w * S; x++) {
    const si = (Math.floor(y / S) * s.img.w + Math.floor(x / S)) * 4, a = s.img.data[si + 3] / 255; if (!a) continue;
    const di = ((oy + y) * W + ox + x) * 4;
    for (let c = 0; c < 3; c++) data[di + c] = data[di + c] * (1 - a) + s.img.data[si + c] * a;
  }
});
writeFileSync(out, encodePNG({ w: W, h: H, data }));
console.log(`${sprites.length} sprites -> ${out}`);
