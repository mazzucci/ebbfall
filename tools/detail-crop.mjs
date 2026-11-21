// detail-exp: a crop of a PNG: node tools/detail-crop.mjs <in.png> <out.png> <x> <y> <w> <h>
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeAny } from './hd-png.mjs';
import { encodePNG } from './art/png.js';
const [i, o, X, Y, W, H] = process.argv.slice(2), a = decodeAny(readFileSync(i)), x0 = +X, y0 = +Y, w = Math.min(+W, a.w - x0), h = Math.min(+H, a.h - y0), d = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) d.set(a.data.subarray(((y0 + y) * a.w + x0) * 4, ((y0 + y) * a.w + x0 + w) * 4), y * w * 4);
writeFileSync(o, encodePNG({ w, h, data: d }));
