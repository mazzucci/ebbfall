// Generates Endfall's sprite sheets: public/art/atlas-<n>.png + .json pages (PixiJS spritesheet format, scale 2:
// art is drawn at twice the game's resolution) and public/art/atlas.json, an index with the pages, animations and
// facings. Units, buildings and resources are 3D models rendered in headless Chromium (tools/render3d); terrain and
// effects are painted in Node. Usage: node tools/art/generate.mjs
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { encodePNG } from './png.js';
import { terrainSprites } from './terrain2.js';
import { effectSprites } from './effects2.js';
import { render3d } from './render3d.mjs';

const FACINGS = 16, UNIT_FRAMES = { harvester: 2, trooper: 4, vanguard: 4 };
const sprites = [...terrainSprites(), ...effectSprites(), ...await render3d()];

// Shelf packing into 2048x2048 pages, tallest first, 2 px gutters. Terrain tiles get 4 px gutters filled with their
// own edge pixels, so filtering and mipmaps never pull in transparency (which would draw a grid on the ground).
const W = 2048, H = 2048, PAD = 2, EXT = 4;
const isTile = (s) => /^(ground|rock)_/.test(s.name);
for (const s of sprites) if (isTile(s)) {
  const { w, h, data } = s.img, W2 = w + EXT * 2, H2 = h + EXT * 2, out = new Uint8ClampedArray(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const sx = Math.min(w - 1, Math.max(0, x - EXT)), sy = Math.min(h - 1, Math.max(0, y - EXT));
    out.set(data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * W2 + x) * 4);
  }
  s.img = { w: W2, h: H2, data: out }; s.ext = EXT;
}
const order = sprites.map((s, i) => i).sort((a, b) => sprites[b].img.h - sprites[a].img.h || sprites[b].img.w - sprites[a].img.w || a - b);
const pages = [];
let page = null;
for (const i of order) {
  const { w, h } = sprites[i].img;
  if (!page) pages.push(page = { x: 0, y: 0, shelf: 0, items: [] });
  if (page.x + w > W) { page.x = 0; page.y += page.shelf + PAD; page.shelf = 0; }
  if (page.y + h > H) { pages.push(page = { x: 0, y: 0, shelf: 0, items: [] }); }
  page.items.push({ i, x: page.x, y: page.y }); page.x += w + PAD; page.shelf = Math.max(page.shelf, h);
}

const root = new URL('../../public/art/', import.meta.url);
mkdirSync(root, { recursive: true });
for (const f of readdirSync(root)) if (/^atlas/.test(f)) rmSync(new URL(f, root));
const pageFiles = [];
pages.forEach((p, n) => {
  const height = 2 ** Math.ceil(Math.log2(Math.max(...p.items.map(it => it.y + sprites[it.i].img.h))));
  const data = new Uint8ClampedArray(W * height * 4), frames = {};
  for (const { i, x, y } of p.items) {
    const s = sprites[i], { w, h, data: src } = s.img;
    for (let r = 0; r < h; r++) data.set(src.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * W + x) * 4);
    const e = s.ext || 0, fw = w - e * 2, fh = h - e * 2; // extruded tiles: the frame is the inner, original tile
    frames[s.name] = { frame: { x: x + e, y: y + e, w: fw, h: fh }, anchor: s.anchor, sourceSize: { w: fw, h: fh }, spriteSourceSize: { x: 0, y: 0, w: fw, h: fh } };
  }
  writeFileSync(new URL(`atlas-${n}.png`, root), encodePNG({ w: W, h: height, data }));
  writeFileSync(new URL(`atlas-${n}.json`, root), JSON.stringify({ frames, meta: { app: 'endfall tools/art', image: `atlas-${n}.png`, format: 'RGBA8888', size: { w: W, h: height }, scale: '2' } }));
  pageFiles.push(`atlas-${n}.json`);
});
const seq = (prefix, n) => Array.from({ length: n }, (_, f) => `${prefix}${f}`);
const animations = { boom_big: seq('boom_big_', 8), boom_small: seq('boom_small_', 6), puff: seq('puff_', 4), flash: seq('flash_', 3), spark: seq('spark_', 4), flag: seq('flag_', 4), vent: seq('vent_', 4) };
for (const [kind, n] of Object.entries(UNIT_FRAMES)) for (let t = 0; t < 2; t++) for (let d = 0; d < FACINGS; d++) animations[`${kind}_${t}_${d}`] = seq(`${kind}_${t}_${d}_`, n);
writeFileSync(new URL('atlas.json', root), JSON.stringify({ pages: pageFiles, animations, facings: FACINGS, scale: 2 }, null, 1));
console.log(`${sprites.length} sprites on ${pages.length} page(s)`);
