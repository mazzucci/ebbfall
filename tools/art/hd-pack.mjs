// HD experiment (branch hd-exp, never merged): packs target/hd/raw/<tag>/ (tools/art/hd-render.mjs) the way
// tools/art/generate.mjs packs the atlas (masks and strike poses cut to their content, shelves, tallest first; lossless
// WebP, tools/art/webp.mjs), into pages `W` wide with gutters of 4 px times hd, the pages' scale 2 * hd.
//   node tools/art/hd-pack.mjs <tag> [W]     -> target/hd/atlas/<tag>/atlas-<n>.webp + .json, atlas.json, stats.json
// stats.json: the sample's bytes as one atlas and by group (walk frames, strike poses, buildings; each packed and
// encoded on its own), the frames' pixel areas, and, for 1x, whether every frame is the shipped atlas's pixel for pixel.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWebP, decodeWebP } from './webp.mjs';

const tag = process.argv[2], root = fileURLToPath(new URL('../../', import.meta.url));
const raw = join(root, 'target/hd/raw', tag), out = join(root, 'target/hd/atlas', tag);
const idx = JSON.parse(readFileSync(join(raw, 'index.json'), 'utf8')), hd = idx.hd;
const W = +process.argv[3] || (hd === 1 ? 2048 : 4096), PAD = 4 * hd;
mkdirSync(out, { recursive: true });

const sprites = idx.sprites.map(s => ({ ...s, img: { w: s.w, h: s.h, data: new Uint8ClampedArray(readFileSync(join(raw, `${s.name}.rgba`))) } }));
for (const s of sprites) { s.full = { w: s.img.w, h: s.img.h }; if (s.trim) trim(s); }
function trim(s) { // (generate.mjs's)
  const { w, h, data } = s.img; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) x0 = y0 = x1 = y1 = 0;
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, o = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) o.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * tw * 4);
  s.src = { x: x0, y: y0, w, h }; s.img = { w: tw, h: th, data: o };
}

/** generate.mjs's shelves over `list`, in pages W wide and at most W tall. */
function pack(list) {
  const order = list.map((s, i) => i).sort((a, b) => list[b].img.h - list[a].img.h || list[b].img.w - list[a].img.w || a - b), pages = [];
  let page = null;
  for (const i of order) {
    const { w, h } = list[i].img;
    if (w > W || h > W) throw new Error(`${list[i].name} is ${w}x${h}, larger than a page`);
    if (!page) pages.push(page = { x: 0, y: 0, shelf: 0, items: [] });
    if (page.x + w > W) { page.x = 0; page.y += page.shelf + PAD; page.shelf = 0; }
    if (page.y + h > W) pages.push(page = { x: 0, y: 0, shelf: 0, items: [] });
    page.items.push({ s: list[i], x: page.x, y: page.y }); page.x += w + PAD; page.shelf = Math.max(page.shelf, h);
  }
  return pages;
}
async function encode(pages, dir) {
  let bytes = 0, px = 0; const files = [], sizes = [];
  for (const [n, p] of pages.entries()) {
    const height = 2 ** Math.ceil(Math.log2(Math.max(...p.items.map(it => it.y + it.s.img.h))));
    const data = new Uint8ClampedArray(W * height * 4), frames = {};
    for (const { s, x, y } of p.items) {
      const { w, h, data: src } = s.img;
      for (let r = 0; r < h; r++) data.set(src.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * W + x) * 4);
      frames[s.name] = s.src ? { frame: { x, y, w, h }, anchor: s.anchor, trimmed: true, sourceSize: { w: s.src.w, h: s.src.h }, spriteSourceSize: { x: s.src.x, y: s.src.y, w, h } }
        : { frame: { x, y, w, h }, anchor: s.anchor, sourceSize: { w, h }, spriteSourceSize: { x: 0, y: 0, w, h } };
    }
    const webp = await encodeWebP({ w: W, h: height, data });
    bytes += webp.length; px += W * height; sizes.push({ w: W, h: height, bytes: webp.length });
    if (dir) {
      writeFileSync(join(dir, `atlas-${n}.webp`), webp);
      writeFileSync(join(dir, `atlas-${n}.json`), JSON.stringify({ frames, meta: { app: 'endfall hd-exp', image: `atlas-${n}.webp`, format: 'RGBA8888', size: { w: W, h: height }, scale: String(2 * hd) } }));
      files.push(`atlas-${n}.json`);
    }
  }
  return { bytes, px, pages: sizes, files };
}

const group = (s) => (/^bldg_/.test(s.name) ? 'buildings' : /_(wind|strike)(_m)?$/.test(s.name) ? 'strikes' : 'walk');
const stats = { tag, hd, W, pad: PAD, renderSeconds: idx.seconds, groups: {} };
const all = await encode(pack(sprites), out);
writeFileSync(join(out, 'atlas.json'), JSON.stringify({ pages: all.files, scale: 2 * hd }));
stats.all = { sprites: sprites.length, frames: sprites.filter(s => !/_m$/.test(s.name)).length, bytes: all.bytes, pages: all.pages, packedPx: sprites.reduce((a, s) => a + s.img.w * s.img.h, 0) };
for (const g of process.argv.includes('nostats') ? [] : ['walk', 'strikes', 'buildings']) { // (`nostats`: the trailer's full atlas: one encode)
  const list = sprites.filter(s => group(s) === g), e = await encode(pack(list), null);
  stats.groups[g] = { sprites: list.length, frames: list.filter(s => !/_m$/.test(s.name)).length, bytes: e.bytes, pages: e.pages, packedPx: list.reduce((a, s) => a + s.img.w * s.img.h, 0) };
}

// 1x: is every frame the shipped atlas's, pixel for pixel? (the patched renderer at hd 1 must be today's)
if (hd === 1 && !/px/.test(tag)) {
  const art = join(root, 'public/art'), ix = JSON.parse(readFileSync(join(art, 'atlas.json'), 'utf8'));
  let same = 0, differ = [], missing = [];
  const pagesPx = {};
  for (const p of ix.pages) {
    const j = JSON.parse(readFileSync(join(art, p), 'utf8')); pagesPx[p] = { j, img: await decodeWebP(readFileSync(join(art, j.meta.image))) };
  }
  for (const s of sprites) {
    const hit = Object.values(pagesPx).find(p => p.j.frames[s.name]); if (!hit) { missing.push(s.name); continue; }
    const f = hit.j.frames[s.name].frame, { w, h, data } = s.img; let ok = f.w === w && f.h === h, bad = 0;
    if (ok) for (let y = 0; y < h; y++) for (let x = 0; x < w * 4; x++) if (hit.img.data[((f.y + y) * hit.img.w + f.x) * 4 + x] !== data[y * w * 4 + x]) bad++;
    if (ok && !bad) same++; else differ.push(`${s.name}${ok ? ` (${bad} bytes of ${w * h * 4})` : ` (${w}x${h} against ${f.w}x${f.h})`}`);
  }
  stats.identity = { same, differ: differ.length, missing, examples: differ.slice(0, 8) };
}
writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 1));
console.log(JSON.stringify(stats, null, 1));
