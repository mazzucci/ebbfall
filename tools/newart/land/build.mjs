// The new look's land (`?art=new`, group `land`): the trees, rocks and low plants cut from the picture sheets, and the
// tiling grounds, built into public/art/new/ (ignored by git: no picture is committed) with the group's entry merged
// into index.json; and each piece's measured numbers written to src/client/gl/newland-pieces.js, which IS committed:
// the client places the pieces by that table and test/newland.test.js checks the placement against it.
//   node tools/newart/land/build.mjs            (EBBFALL_PICTURES: the pictures' folder; nothing is written there)
//   node tools/newart/land/build.mjs --debug    also a numbered contact sheet of the pieces in target/newart/land/
// A JPEG is decoded once in headless Chromium (decode.mjs; run under the machine's Chrome lock) and cached under
// target/; everything after is arithmetic in Node (img.js), so the same pictures give the same bytes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { decodeAll } from './decode.mjs';
import { blank, bleed, blur, box, cut, keyMagenta, over, pack, parts, scale, span } from './img.js';
import { encodeWebP } from '../../art/webp.mjs';
import { encodePNG } from '../../art/png.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const PICTURES = process.env.EBBFALL_PICTURES || '/home/mazzucci/projects/ebbfall-article/nano-test';
const OUT = join(root, 'public/art/new'), WORK = join(root, 'target/newart/land'), TABLE = join(root, 'src/client/gl/newland-pieces.js');

// ---- every tuned number ----
const CFG = {
  /** The pieces' page: texels per world px (a page's `meta.scale`), its width, the gap between frames (wide: the page
   *  is mipmapped), and how far a frame's colors are carried out under its transparent edge. */
  texels: 4, pageWidth: 2048, gap: 12, bleed: 6,
  /** The page's WebP: lossy color, the alpha kept exact. */
  page: { lossless: 0, quality: 86, method: 6, exact: 1, alpha_quality: 100, use_sharp_yuv: 1 },
  /** The sheets: `unit` world px per picture px (one scale a sheet, so its things keep their sizes against each other),
   *  `min` the smallest part counted (picture px), and what each part is, in reading order (null: left out).
   *  Kinds: tree (a trunk and a crown), bush (knee-high, on blocked ground), low (flat plants a unit walks over),
   *  crag, boulder (rock that stands), scree (small stones a unit walks over). `[kind, unit]` sets a part's own scale. */
  sheets: [
    { file: 'land2/trees-2.jpg', unit: 0.085, min: 20000, parts: ['tree', 'tree', 'tree', null /* a leftover wall */, 'tree', 'tree', 'tree', 'tree'] },
    { file: 'land2/trees2-1.jpg', unit: 0.085, min: 20000, parts: ['tree', 'tree', 'tree', 'tree', 'tree', ['bush', 0.06], 'tree', null /* a dead tree: reads as a mast */] },
    { file: 'land2/rocks-2.jpg', unit: 0.1, min: 3000, parts: ['crag', 'crag', 'crag', 'boulder', 'boulder', 'boulder', 'scree', 'scree', 'scree'] },
    { file: 'land2/rocks2-1.jpg', unit: 0.1, min: 3000, parts: ['crag', 'crag', 'crag', 'boulder', 'boulder', 'boulder', 'scree', 'scree', 'scree'] },
    { file: 'land2/bush-1.jpg', unit: 0.055, min: 3000, parts: ['bush', 'bush', 'bush', 'low', 'low', 'low', 'low', 'low', null /* a log */] },
  ],
  /** The cast shadow, as today's buildings' (tools/render3d: the sun from the north-west, a shadow 0.36 of a height
   *  long, black at alpha 110): a piece's solid shape thrown to the south-east, a pixel `a` px up landing 0.24 a to
   *  the right and 0.18 a below its foot (the 40-degree camera draws a height 1.19 times itself). `soft`: its edge
   *  feathered over this many world px (today's is crisp; a crown's is softened a little, as leaves are). */
  shadow: { dx: 0.24, dy: 0.18, alpha: 110, soft: 1 },
  /** What counts as solid when a piece is measured (alpha), and the slice of a piece's profile (world px). */
  solid: 128, slice: 4,
  /** The grounds (they tile): the side each is kept at, and their WebP. */
  grounds: [
    { name: 'grass', file: 'land/grass-2.jpg', size: 1024 },
    { name: 'calm', file: 'land/calm-1.jpg', size: 256 },
    { name: 'dirt', file: 'land/dirt-1.jpg', size: 512 },
    { name: 'floor', file: 'land2/floor.jpg', size: 512 },
    { name: 'scree', file: 'land2/scree.jpg', size: 512 },
  ],
  ground: { lossless: 0, quality: 84, method: 6, use_sharp_yuv: 1 },
};

const q = (v) => Math.round(v * 4) / 4; // (the table's numbers: world px to a quarter)

/** A part at the page's scale, with its shadow under it, and its numbers. */
function piece(src, kind, unit, name) {
  const k = unit * CFG.texels, body = scale(src, k), b = box(body, CFG.solid), S = CFG.texels;
  if (!b) throw new Error(`${name}: nothing solid`);
  const h = b.y1 - b.y0 + 1, w = b.x1 - b.x0 + 1;
  // The ground point: a tree's trunk where it meets the ground (the middle of its lowest solid rows), anything else
  // the middle of its box; at the art's lowest solid row.
  let ax = (b.x0 + b.x1 + 1) / 2;
  if (kind === 'tree') { let lo = Infinity, hi = -Infinity; for (let y = b.y1; y > b.y1 - Math.max(2, Math.round(h * 0.04)); y--) { const s = span(body, y, CFG.solid); if (s) { lo = Math.min(lo, s[0]); hi = Math.max(hi, s[1]); } } ax = (lo + hi + 1) / 2; }
  const ay = b.y1 + 1;
  // Its profile: per slice of height from the ground up, how far its solid pixels reach left and right of the ground point.
  const rows = [], step = CFG.slice * S;
  for (let top = ay - step; top > b.y0 - step; top -= step) {
    let l = -Infinity, r = -Infinity;
    for (let y = Math.max(b.y0, top); y < Math.min(ay, top + step); y++) { const s = span(body, y, CFG.solid); if (s) { l = Math.max(l, ax - s[0]); r = Math.max(r, s[1] + 1 - ax); } }
    rows.push(l === -Infinity ? [0, 0] : [q(l / S), q(r / S)]);
  }
  // Its base on the ground. A tree's: its trunk's width, as deep as wide (a round trunk under the 40-degree camera
  // is drawn 0.64 as deep). Rock and bushes: the whole width; as deep as the drop from the shape's two ends (where the
  // base is widest: its middle line) to its lowest row, twice, kept between 0.3 and 0.6 of the width.
  let fw, fd;
  if (kind === 'tree') { const s = span(body, b.y1 - Math.round(h * 0.02), CFG.solid) || [ax - 1, ax + 1]; fw = (s[1] - s[0] + 1) / S; fd = fw * 0.64; }
  else {
    const low = (x) => { for (let y = b.y1; y >= b.y0; y--) if (body.data[(y * body.w + x) * 4 + 3] > CFG.solid) return y; return b.y0; };
    const ends = (low(b.x0 + Math.round(w * 0.04)) + low(b.x1 - Math.round(w * 0.04))) / 2;
    fw = w / S; fd = Math.max(0.3 * fw, Math.min(0.6 * fw, 2 * (b.y1 - ends) / S));
  }
  // The frame: the body's box, room to the right and below for the shadow.
  const sh = CFG.shadow, soft = Math.round(sh.soft * S), padR = Math.ceil(h * sh.dx) + 2 * soft + 2, padB = Math.ceil(h * sh.dy) + 2 * soft + 2, pad = 2 + 2 * soft;
  const fwPx = w + pad + padR, fhPx = h + pad + padB, ox = pad - b.x0, oy = pad - b.y0; // (body px -> frame px)
  const plane = new Float32Array(fwPx * fhPx), foot = ay + oy;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    const a = body.data[(y * body.w + x) * 4 + 3]; if (a <= 24) continue;
    const up = ay - y, X = Math.round(x + ox + up * sh.dx), Y = Math.round(foot + up * sh.dy - (kind === 'tree' ? 0 : fd * S / 2)); // (rock stands on its base's middle line)
    if (X >= 0 && Y >= 0 && X < fwPx && Y < fhPx) plane[Y * fwPx + X] = Math.max(plane[Y * fwPx + X], a / 255);
    if (X + 1 < fwPx && Y >= 0 && Y < fhPx) plane[Y * fwPx + X + 1] = Math.max(plane[Y * fwPx + X + 1], a / 255); // (no holes where the shear skips a column)
  }
  const soften = blur(plane, fwPx, fhPx, soft), frame = blank(fwPx, fhPx);
  for (let i = 0; i < fwPx * fhPx; i++) frame.data[i * 4 + 3] = Math.round(Math.min(1, soften[i]) * sh.alpha);
  over(frame, body, ox, oy);
  bleed(frame, CFG.bleed);
  return { name, kind, img: frame, anchor: { x: (ax + ox) / fwPx, y: (ay + oy) / fhPx },
    row: { name, kind, w: q(w / S), h: q(h / S), l: q((ax - b.x0) / S), r: q((b.x1 + 1 - ax) / S), fw: q(fw), fd: q(fd), rows } };
}

const files = [...CFG.sheets.map(s => s.file), ...CFG.grounds.map(g => g.file)];
const decoded = await decodeAll(PICTURES, files, join(WORK, 'cache'));
const pic = (f) => { const d = decoded[files.indexOf(f)]; return { w: d.w, h: d.h, data: d.data.slice() }; };

// ---- the pieces ----
const pieces = [], count = {};
for (const sheet of CFG.sheets) {
  const img = keyMagenta(pic(sheet.file)), found = parts(img, { min: sheet.min });
  if (found.length !== sheet.parts.length) throw new Error(`${sheet.file}: ${found.length} parts, the config names ${sheet.parts.length}: the picture changed, look at it again (--debug)`);
  found.forEach((p, i) => {
    const as = sheet.parts[i]; if (!as) return;
    const [kind, unit] = Array.isArray(as) ? as : [as, sheet.unit], n = count[kind] = (count[kind] ?? -1) + 1;
    pieces.push(piece(cut(img, p), kind, unit, `land_${kind}_${n}`));
  });
}
const pageH = pack(pieces, CFG.pageWidth, CFG.gap), page = blank(CFG.pageWidth, pageH), frames = {};
for (const p of pieces) {
  for (let y = 0; y < p.img.h; y++) page.data.set(p.img.data.subarray(y * p.img.w * 4, (y + 1) * p.img.w * 4), ((p.y + y) * page.w + p.x) * 4);
  frames[p.name] = { frame: { x: p.x, y: p.y, w: p.img.w, h: p.img.h }, anchor: p.anchor, sourceSize: { w: p.img.w, h: p.img.h }, spriteSourceSize: { x: 0, y: 0, w: p.img.w, h: p.img.h } };
}
mkdirSync(OUT, { recursive: true });
const bytes = {};
const put = (name, buf) => { writeFileSync(join(OUT, name), buf); bytes[name] = buf.length; };
put('land-0.webp', await encodeWebP(page, CFG.page));
put('land-0.json', Buffer.from(JSON.stringify({ frames, meta: { app: 'endfall tools/newart/land', image: 'land-0.webp', format: 'RGBA8888', size: { w: page.w, h: page.h }, scale: String(CFG.texels) } })));

// ---- the grounds ----
const ground = {};
for (const g of CFG.grounds) {
  const src = pic(g.file); if (src.w !== src.h || src.w % g.size) throw new Error(`${g.file}: ${src.w}x${src.h} does not shrink to ${g.size} whole`);
  const img = scale(src, g.size / src.w, g.size, g.size); for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  const name = `land-${g.name}.webp`; put(name, await encodeWebP(img, CFG.ground)); ground[g.name] = name;
}

// ---- the index (this group's key only) and the committed table ----
const ixPath = join(OUT, 'index.json');
let ix = { groups: {} };
if (existsSync(ixPath)) { try { const old = JSON.parse(readFileSync(ixPath, 'utf8')); if (old && typeof old.groups === 'object') ix = old; } catch { /* (not JSON: written new) */ } }
ix.groups.land = { pages: ['land-0.json'], ground, texels: CFG.texels };
writeFileSync(ixPath, JSON.stringify(ix, null, 1));

const table = `// The new look's land pieces as tools/newart/land/build.mjs measured them from the pictures (generated: do not edit;
// run the builder). Numbers only: the pictures themselves are not in the repo. World px at scale 1, to a quarter:
// \`w\`, \`h\` the solid shape's box; \`l\`, \`r\` how far it reaches left and right of its ground point (its trunk's foot, or
// its middle), which is at its lowest row; \`fw\`, \`fd\` its base on the ground, wide and deep (the base lies from the
// ground point \`fd\` up, \`fw\` across, centered); \`rows\` its profile, a pair [left, right] per SLICE px of height from
// the ground up. gl/newland.js places the pieces by this table and test/newland.test.js checks the placement.
export const SLICE = ${CFG.slice};
export const PIECES = [
${pieces.map(p => '  ' + JSON.stringify(p.row)).join(',\n')},
];
`;
writeFileSync(TABLE, table);

const total = Object.values(bytes).reduce((a, b) => a + b, 0);
console.log(`land: ${pieces.length} pieces (${Object.entries(count).map(([k, n]) => `${n + 1} ${k}`).join(', ')}) on a ${page.w}x${page.h} page`);
for (const [n, b] of Object.entries(bytes)) console.log(`  ${n.padEnd(18)} ${String(b).padStart(8)} B`);
console.log(`  total ${total} B; the table: ${TABLE.slice(root.length)}`);

if (process.argv.includes('--debug')) { // (the page over gray, for a look: never under public/)
  const o = blank(page.w, page.h);
  for (let i = 0; i < page.w * page.h; i++) { const a = page.data[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o.data[i * 4 + c] = Math.round(page.data[i * 4 + c] * a + 96 * (1 - a)); o.data[i * 4 + 3] = 255; }
  writeFileSync(join(WORK, 'page.png'), encodePNG(o));
  console.log(`  debug: ${join(WORK, 'page.png')}`);
}
