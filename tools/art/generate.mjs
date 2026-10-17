// Generates Endfall's sprite sheet: public/art/atlas.png + public/art/atlas.json (PixiJS spritesheet format,
// with animations). Deterministic: the same code always writes the same files.  Usage: node tools/art/generate.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { unitSprites, UNIT_ART, FACINGS } from './units.js';
import { terrainSprites } from './terrain.js';
import { buildingSprites, resourceSprites, effectSprites } from './props.js';

const sprites = [...terrainSprites(), ...resourceSprites(), ...buildingSprites(), ...unitSprites(), ...effectSprites()];

// Shelf packing, tallest first, 2 px transparent gutter (stops sampling bleed when zoomed).
const W = 2048, PAD = 2;
const order = sprites.map((s, i) => i).sort((a, b) => sprites[b].img.h - sprites[a].img.h || sprites[b].img.w - sprites[a].img.w || a - b);
let x = 0, y = 0, shelf = 0;
const place = [];
for (const i of order) {
  const { w, h } = sprites[i].img;
  if (x + w + PAD > W) { x = 0; y += shelf + PAD; shelf = 0; }
  place[i] = { x, y }; x += w + PAD; shelf = Math.max(shelf, h);
}
const H = 2 ** Math.ceil(Math.log2(y + shelf));
const data = new Uint8ClampedArray(W * H * 4);
sprites.forEach((s, i) => {
  const { x: px, y: py } = place[i], { w, h, data: src } = s.img;
  for (let r = 0; r < h; r++) data.set(src.subarray(r * w * 4, (r + 1) * w * 4), ((py + r) * W + px) * 4);
});

const frames = {};
sprites.forEach((s, i) => { frames[s.name] = { frame: { x: place[i].x, y: place[i].y, w: s.img.w, h: s.img.h }, anchor: s.anchor, sourceSize: { w: s.img.w, h: s.img.h }, spriteSourceSize: { x: 0, y: 0, w: s.img.w, h: s.img.h } }; });
const seq = (prefix, n) => Array.from({ length: n }, (_, f) => `${prefix}${f}`);
const animations = {
  boom_big: seq('boom_big_', 8), boom_small: seq('boom_small_', 6), puff: seq('puff_', 4), flash: seq('flash_', 3),
  spark: seq('spark_', 4), flag: seq('flag_', 4), vent: seq('vent_', 4),
};
for (const [kind, art] of Object.entries(UNIT_ART)) for (let team = 0; team < 2; team++) for (let d = 0; d < FACINGS; d++) animations[`${kind}_${team}_${d}`] = seq(`${kind}_${team}_${d}_`, art.frames);

const root = new URL('../../public/art/', import.meta.url);
mkdirSync(root, { recursive: true });
writeFileSync(new URL('atlas.png', root), encodePNG({ w: W, h: H, data }));
writeFileSync(new URL('atlas.json', root), JSON.stringify({ frames, animations, meta: { app: 'endfall tools/art', version: '1', image: 'atlas.png', format: 'RGBA8888', size: { w: W, h: H }, scale: '1', facings: FACINGS } }));
console.log(`atlas ${W}x${H}, ${sprites.length} sprites`);
