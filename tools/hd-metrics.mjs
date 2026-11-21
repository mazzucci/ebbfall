// HD experiment (branch hd-exp, never merged): what the captures (target/hd/shots) differ by, measured. Per config and
// view, inside the canvas (48 CSS px in from its edges, so the HUD's bars stay out): the share of pixels that differ
// between levels by more than 6/255 in any channel, the mean difference there, and an edge measure (the mean absolute
// Laplacian of the luminance, 4 neighbors) over the pixels any level changes (the HD sprites' pixels): higher is
// sharper. Prints a Markdown table.   node tools/hd-metrics.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAny } from './hd-png.mjs';

const shots = fileURLToPath(new URL('../target/hd/shots/', import.meta.url)), T = 6;
console.log('| capture | view | px that differ: 1x-2x | 2x-3x | 1x-3x | mean difference there: 1x-2x | 2x-3x | edge measure 1x | 2x | 3x | 2x/1x | 3x/2x |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const config of readdirSync(shots).sort()) {
  if (!existsSync(join(shots, config, 'shots.json'))) continue;
  const log = JSON.parse(readFileSync(join(shots, config, 'shots.json'), 'utf8')), d = log.dpr, b = log.canvasBox, m = 48 * d;
  const x0 = Math.round(b.x * d + m), x1 = Math.round((b.x + b.width) * d - m), y0 = Math.round(b.y * d + m), y1 = Math.round((b.y + b.height) * d - m);
  for (const view of Object.keys(log.views)) {
    const L = ['1x', '2x', '3x'].map(l => decodeAny(readFileSync(join(shots, config, `${view}-${l}.png`)))), w = L[0].w;
    const diff = (A, B, i) => Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    const lum = (A, i) => 0.3 * A.data[i] + 0.59 * A.data[i + 1] + 0.11 * A.data[i + 2];
    const n = (x1 - x0) * (y1 - y0), c = [0, 0, 0], s = [0, 0, 0], e = [0, 0, 0]; let mask = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4, d12 = diff(L[0], L[1], i), d23 = diff(L[1], L[2], i), d13 = diff(L[0], L[2], i);
      if (d12 > T) { c[0]++; s[0] += d12; } if (d23 > T) { c[1]++; s[1] += d23; } if (d13 > T) { c[2]++; s[2] += d13; }
      if (d12 > T || d13 > T) { mask++; for (let k = 0; k < 3; k++) e[k] += Math.abs(4 * lum(L[k], i) - lum(L[k], i - 4) - lum(L[k], i + 4) - lum(L[k], i - w * 4) - lum(L[k], i + w * 4)); }
    }
    const pc = (v) => `${(v / n * 100).toFixed(2)}%`, E = e.map(v => v / (mask || 1));
    console.log(`| ${config} (${log.viewport.join('x')} at DPR ${d}, zoom ${log.zoom}) | ${view} | ${pc(c[0])} | ${pc(c[1])} | ${pc(c[2])} | ${(s[0] / (c[0] || 1)).toFixed(1)} | ${(s[1] / (c[1] || 1)).toFixed(1)} | ${E[0].toFixed(1)} | ${E[1].toFixed(1)} | ${E[2].toFixed(1)} | ${(E[1] / E[0]).toFixed(2)} | ${(E[2] / E[1]).toFixed(2)} |`);
  }
}
