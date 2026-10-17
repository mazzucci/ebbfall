// A dual-grid patch from terrain2.js at 1:1 for eyeballing: node tools/art/terrain2-preview.mjs out.png
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { tile } from './terrain2.js';
const W = 14, H = 8, T = 64;
const rock = (x, y) => x < 0 || y < 0 || x >= W || y >= H || [[3, 2], [4, 2], [5, 2], [3, 3], [4, 3], [5, 3], [6, 3], [4, 4], [5, 4], [9, 5], [10, 5], [10, 6], [11, 6], [0, 7], [1, 7], [12, 0], [13, 1], [12, 1]].some(([a, b]) => a === x && b === y) ? 1 : 0;
const tiles = {}; const get = (m, v) => tiles[m + '_' + v] ??= tile(m, v);
const PW = (W + 1) * T, PH = (H + 1) * T, data = new Uint8ClampedArray(PW * PH * 4);
for (let j = -1; j < H; j++) for (let i = -1; i < W; i++) {
  const m = rock(i, j) | rock(i + 1, j) << 1 | rock(i, j + 1) << 2 | rock(i + 1, j + 1) << 3;
  const t = get(m, m === 0 ? (((i * 7 + j * 13) % 11 + 11) % 11 > 7 ? 1 + (i + j + 6) % 5 : 0) : ((i * 5 + j * 3) % 3 + 3) % 3);
  for (let y = 0; y < T; y++) data.set(t.data.subarray(y * T * 4, (y + 1) * T * 4), (((j + 1) * T + y) * PW + (i + 1) * T) * 4);
}
writeFileSync(process.argv[2], encodePNG({ w: PW, h: PH, data }));
