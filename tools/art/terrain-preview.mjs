// Renders a small dual-grid terrain patch from a rock mask to eyeball seams: node terrain-preview.mjs out.png
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { groundTile, rockTile } from './terrain.js';
const W = 14, H = 9, S = 3;
const rock = (x, y) => x < 0 || y < 0 || x >= W || y >= H || [[3, 2], [4, 2], [5, 2], [3, 3], [4, 3], [5, 3], [6, 3], [4, 4], [5, 4], [9, 5], [10, 5], [10, 6], [11, 6], [0, 8], [1, 8], [12, 0], [13, 1], [12, 1]].some(([a, b]) => a === x && b === y) ? 1 : 0;
const tiles = {}; const get = (m, v) => tiles[m + '_' + v] ??= (m === 0 ? groundTile(v) : rockTile(m, v));
const PW = (W + 1) * 32, PH = (H + 1) * 32, data = new Uint8ClampedArray(PW * PH * S * S * 4);
for (let j = -1; j < H; j++) for (let i = -1; i < W; i++) {
  const m = rock(i, j) | rock(i + 1, j) << 1 | rock(i, j + 1) << 2 | rock(i + 1, j + 1) << 3;
  const t = get(m, m === 0 ? ((i * 7 + j * 13) % 11 + 11) % 11 % 6 : ((i * 5 + j * 3) % 3 + 3) % 3);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
    const X = ((i + 1) * 32 + x) * S + sx, Y = ((j + 1) * 32 + y) * S + sy, o = (Y * PW * S + X) * 4, si = (y * 32 + x) * 4;
    for (let c = 0; c < 4; c++) data[o + c] = t.data[si + c];
  }
}
writeFileSync(process.argv[2], encodePNG({ w: PW * S, h: PH * S, data }));
