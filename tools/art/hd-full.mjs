// HD experiment (branch hd-exp, never merged): the shipped atlas (public/art) by class of frame: how many frames, their
// packed pixels, and each class's bytes when its frames are packed and encoded on their own (generate.mjs's shelves,
// lossless WebP), so the sample's bytes-per-frame ratios (hd-pack.mjs stats.json) can be applied class by class; and
// how many pages of 2048, 4096 and 8192 px the full set needs with its 3D frames at 1x, 2x and 3x (the same shelves over
// the frames' sizes times k, gutters 4k).   node tools/art/hd-full.mjs   -> target/hd/full.json
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWebP, decodeWebP } from './webp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), art = join(root, 'public/art');
const ix = JSON.parse(readFileSync(join(art, 'atlas.json'), 'utf8')), kinds = Object.keys(ix.unitTops).join('|');
const WALK = new RegExp(`^(${kinds})_\\d+_\\d+(_m)?$`), STRIKE = /_(wind|strike)(_m)?$/;
const STATIC = /^(bldg_|[a-z]+_head_\d+|foundation_|scaffold_|rubble_|gantry_|gantrybar_|mine_|shard_|doodad_)/;
const classOf = (n) => (STRIKE.test(n) ? 'strikes' : WALK.test(n) ? 'walk' : STATIC.test(n) ? 'static' : 'painted');

const shipped = { pages: [], bytes: 0, json: statSync(join(art, 'atlas.json')).size, px: 0 }, sprites = [];
for (const p of ix.pages) {
  const j = JSON.parse(readFileSync(join(art, p), 'utf8')), file = join(art, j.meta.image), img = await decodeWebP(readFileSync(file));
  shipped.pages.push({ page: p, w: img.w, h: img.h, bytes: statSync(file).size, frames: Object.keys(j.frames).length });
  shipped.bytes += statSync(file).size; shipped.json += statSync(join(art, p)).size; shipped.px += img.w * img.h;
  for (const [name, f] of Object.entries(j.frames)) {
    const { x, y, w, h } = f.frame, data = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) data.set(img.data.subarray(((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4), r * w * 4);
    sprites.push({ name, cls: classOf(name), img: { w, h, data } });
  }
}

/** generate.mjs's shelves over sizes [w, h], pages W square at most; returns each page's used height (a power of two). */
function shelves(sizes, W, PAD) {
  const order = sizes.map((s, i) => i).sort((a, b) => sizes[b][1] - sizes[a][1] || sizes[b][0] - sizes[a][0] || a - b), pages = [];
  let page = null;
  for (const i of order) {
    const [w, h] = sizes[i];
    if (w > W || h > W) return null;
    if (!page) pages.push(page = { x: 0, y: 0, shelf: 0, items: [], bottom: 0 });
    if (page.x + w > W) { page.x = 0; page.y += page.shelf + PAD; page.shelf = 0; }
    if (page.y + h > W) pages.push(page = { x: 0, y: 0, shelf: 0, items: [], bottom: 0 });
    page.items.push({ i, x: page.x, y: page.y }); page.x += w + PAD; page.shelf = Math.max(page.shelf, h); page.bottom = Math.max(page.bottom, page.y + h);
  }
  for (const p of pages) p.h = 2 ** Math.ceil(Math.log2(p.bottom));
  return pages;
}

const classes = {};
for (const cls of ['walk', 'strikes', 'static', 'painted']) {
  const list = sprites.filter(s => s.cls === cls), pages = shelves(list.map(s => [s.img.w, s.img.h]), 2048, 4);
  let bytes = 0;
  for (const p of pages) {
    const data = new Uint8ClampedArray(2048 * p.h * 4);
    for (const { i, x, y } of p.items) { const { w, h, data: src } = list[i].img; for (let r = 0; r < h; r++) data.set(src.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * 2048 + x) * 4); }
    bytes += (await encodeWebP({ w: 2048, h: p.h, data })).length;
  }
  classes[cls] = { sprites: list.length, frames: list.filter(s => !/_m$/.test(s.name)).length, packedPx: list.reduce((a, s) => a + s.img.w * s.img.h, 0), bytesAlone: bytes, pagesAlone: pages.length };
  console.log(cls, classes[cls]);
}

// pages the full set needs: the 3D frames (walk, strikes, static) at k times their size, the painted ones as they are
const layouts = {};
for (const k of [1, 2, 2.5, 3]) for (const W of [2048, 4096, 8192]) {
  const hd = shelves(sprites.filter(s => s.cls !== 'painted').map(s => [Math.ceil(s.img.w * k), Math.ceil(s.img.h * k)]), W, Math.ceil(4 * k));
  const all = shelves(sprites.map(s => [Math.ceil(s.img.w * k), Math.ceil(s.img.h * k)]), W, Math.ceil(4 * k));
  const sum = (ps) => ps && { pages: ps.length, px: ps.reduce((a, p) => a + W * p.h, 0), heights: ps.map(p => p.h) };
  layouts[`${k}x@${W}`] = { k, W, models: sum(hd), everything: sum(all) };
}
const painted = shelves(sprites.filter(s => s.cls === 'painted').map(s => [s.img.w, s.img.h]), 2048, 4);
const outp = { shipped, classes, layouts, paintedPages: { pages: painted.length, px: painted.reduce((a, p) => a + 2048 * p.h, 0) } };
writeFileSync(join(root, 'target/hd/full.json'), JSON.stringify(outp, null, 1));
console.log(JSON.stringify({ shipped, layouts, painted: outp.paintedPages }, null, 1));
