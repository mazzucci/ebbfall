// detail-exp: writes the detail ground's tiles (terrain-detail.js) as raw frames, target/hd/raw/2x-ground, for
// tools/art/hd-pack.mjs; and checks that today's painter still paints the shipped atlas's tiles byte for byte.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detailTerrain } from './terrain-detail.js';
import { terrainSprites } from './terrain3.js';
import { decodeWebP } from './webp.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)), out = join(root, 'target/hd/raw/2x-ground'); mkdirSync(out, { recursive: true });
const t0 = Date.now(), list = detailTerrain();
for (const s of list) writeFileSync(join(out, `${s.name}.rgba`), Buffer.from(s.img.data.buffer));
writeFileSync(join(out, 'index.json'), JSON.stringify({ hd: 2, detail: true, seconds: (Date.now() - t0) / 1000, sprites: list.map(s => ({ name: s.name, w: s.img.w, h: s.img.h, anchor: { x: 0, y: 0 } })) }));
// today's tiles against the shipped atlas
const art = join(root, 'public/art'), ix = JSON.parse(readFileSync(join(art, 'atlas.json'), 'utf8')), pages = [];
for (const p of ix.pages) { const j = JSON.parse(readFileSync(join(art, p), 'utf8')); pages.push({ j, img: await decodeWebP(readFileSync(join(art, j.meta.image))) }); }
let same = 0, differ = 0;
for (const s of terrainSprites()) {
  const hit = pages.find(p => p.j.frames[s.name]), f = hit.j.frames[s.name].frame; let bad = f.w !== s.img.w || f.h !== s.img.h;
  for (let y = 0; y < s.img.h && !bad; y++) for (let x = 0; x < s.img.w * 4; x++) if (hit.img.data[((f.y + y) * hit.img.w + f.x) * 4 + x] !== s.img.data[y * s.img.w * 4 + x]) { bad = true; break; }
  bad ? differ++ : same++;
}
console.log(`${list.length} detail tiles in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}; today's painter against the shipped atlas: ${same} tiles the same, ${differ} differ`);
