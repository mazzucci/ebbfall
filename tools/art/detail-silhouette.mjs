// detail-exp: the outline's change, today's frames against the detail frames at the same scale (target/hd/raw/<tag>).
//   node tools/art/detail-silhouette.mjs <today tag> <detail tag> [regex] -> target/detail/silhouette-<detail tag>.json
// The body is the frame's solid pixels (alpha 255: the cast shadow is translucent). Per frame: the body's area, the
// pixels the detail adds and removes, their share of today's area, and how far out the added ones reach (px from
// today's body, 8-connected steps). The summary groups the frames.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [A, B, RE = '.'] = process.argv.slice(2), root = fileURLToPath(new URL('../../', import.meta.url)), raw = join(root, 'target/hd/raw'), rx = new RegExp(RE);
const ia = JSON.parse(readFileSync(join(raw, A, 'index.json'), 'utf8')), ib = JSON.parse(readFileSync(join(raw, B, 'index.json'), 'utf8')), rows = [];
for (const s of ib.sprites) {
  if (/_m$/.test(s.name) || !rx.test(s.name)) continue;
  const t = ia.sprites.find(q => q.name === s.name); if (!t || t.w !== s.w || t.h !== s.h) continue;
  const a = readFileSync(join(raw, A, `${s.name}.rgba`)), b = readFileSync(join(raw, B, `${s.name}.rgba`)), n = s.w * s.h, dist = new Int16Array(n).fill(-1);
  let area = 0, added = 0, removed = 0, queue = [];
  for (let p = 0; p < n; p++) { const ma = a[p * 4 + 3] === 255, mb = b[p * 4 + 3] === 255; if (ma) { area++; dist[p] = 0; queue.push(p); } if (mb && !ma) added++; if (ma && !mb) removed++; }
  for (let h = 0; h < queue.length; h++) { const p = queue[h], x = p % s.w, y = (p - x) / s.w; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue; const q = ny * s.w + nx; if (dist[q] < 0) { dist[q] = dist[p] + 1; queue.push(q); } } }
  let reach = 0, far = 0; for (let p = 0; p < n; p++) if (b[p * 4 + 3] === 255 && a[p * 4 + 3] !== 255) { reach = Math.max(reach, dist[p]); if (dist[p] > 4) far++; }
  // the outline: today's body pixels with a neighbor outside; "kept" where the detail's body has an edge within 2 px
  let edge = 0, moved = 0;
  const mB = (x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && b[(y * s.w + x) * 4 + 3] === 255, mA = (x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && a[(y * s.w + x) * 4 + 3] === 255;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (!mA(x, y) || (mA(x - 1, y) && mA(x + 1, y) && mA(x, y - 1) && mA(x, y + 1))) continue; edge++;
    let kept = false; for (let dy = -2; dy <= 2 && !kept; dy++) for (let dx = -2; dx <= 2 && !kept; dx++) if (mB(x + dx, y + dy) && !(mB(x + dx - 1, y + dy) && mB(x + dx + 1, y + dy) && mB(x + dx, y + dy - 1) && mB(x + dx, y + dy + 1))) kept = true;
    if (!kept) moved++;
  }
  rows.push({ name: s.name, area, added, removed, changed: (added + removed) / area, reach, far, edge, edgeMoved: moved / edge });
}
const group = (n) => (/^knight_\d+_\d$/.test(n) ? 'knight gallop' : /^knight_/.test(n) ? 'knight wind-up and strike' : n.replace(/^bldg_/, ''));
const sum = {};
for (const r of rows) { const g = sum[group(r.name)] ||= { frames: 0, area: 0, added: 0, removed: 0, edge: 0, edgeMoved: 0, reach: 0, worst: null }; g.frames++; g.area += r.area; g.added += r.added; g.removed += r.removed; g.edge += r.edge; g.edgeMoved += r.edgeMoved * r.edge; g.reach = Math.max(g.reach, r.reach); if (!g.worst || r.changed > g.worst.changed) g.worst = { name: r.name, changed: +r.changed.toFixed(4), edgeMoved: +r.edgeMoved.toFixed(4) }; }
for (const g of Object.values(sum)) { g.changedShareOfArea = +((g.added + g.removed) / g.area).toFixed(4); g.outlineMovedOver2px = +(g.edgeMoved / g.edge).toFixed(4); delete g.edgeMoved; }
mkdirSync(join(root, 'target/detail'), { recursive: true });
writeFileSync(join(root, `target/detail/silhouette-${B}.json`), JSON.stringify({ today: A, detail: B, scale: ib.hd, summary: sum, frames: rows }, null, 1));
console.log(JSON.stringify(sum, null, 1));
