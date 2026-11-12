// The whole set's review pack (step 2 of the new art), read from the committed atlas (public/art/: exactly what the game
// loads, no 3D render): node tools/art/review-all.mjs [outdir]   (default target/art-review/step2)
// Writes into <outdir>:
//   contact.png      every unit (frame 0 and the state frames) and every building of both peoples at 1:1 (atlas px): a
//                    unit's row is facings 0, 4, 8, 12, each in seats 0, 1, 6 and its bare team mask; a building's row
//                    is seats 0, 1, 6 and the mask (the Lookout with its gun head); contact.json names rows and columns
//   phone@2x.png     every unit and building at game size on the seabed (the atlas's ground tiles, the game's shade) beside
//                    salt fields, as a 2x phone shows them (atlas px); phone.png the same in CSS px (world px 1:1)
//   phone-grey.png, phone-protan.png, phone-deutan.png   phone.png in greyscale and under Machado et al. 2009
//                    protanopia and deuteranopia at full severity
//   blind/units/<code>.png, blind/buildings/<code>.png   one sprite alone on plain seabed at phone size (CSS px), in
//                    seats 0 and 6 (the units' state frames in seat 0), named by random capital letters; key.json each
//   atlas-size.txt   the atlas's PNG bytes against the 4.5 MB budget, its pages and sprites
// It prints any unit or building frame (or mask) missing from the atlas, and every frame whose art touches its cell's edge.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.js';
import { groundTile, shadeLayers } from '../../src/client/gl/ground.js';

const ART = fileURLToPath(new URL('../../public/art/', import.meta.url));
const outDir = process.argv[2] ?? fileURLToPath(new URL('../../target/art-review/step2/', import.meta.url));
for (const d of ['blind/units', 'blind/buildings']) mkdirSync(join(outDir, d), { recursive: true });

// (the re-theme's set: the Kingdom in the old `HARBOUR` slot, the Expedition in `VAEL`; the healers keep their old art)
const HARBOUR = [['harvester', 'Villager'], ['trooper', 'Guard'], ['lancer', 'Archer'], ['medic', 'Mender'], ['rider', 'Rider'], ['knight', 'Knight'], ['siegeTank', 'Trebuchet'], ['observer', 'Balloon'], ['bastion', 'Ballista']];
const VAEL = [['lumen', 'Bot'], ['scythe', 'Buggy'], ['prism', 'Mercenary'], ['halo', 'Tender'], ['bruiser', 'Bruiser'], ['monolith', 'Rover'], ['umbra', 'Marine'], ['shrike', 'Drone']];
const STATES = [['siegeTank', 3, 'Trebuchet set up']];
const HBLD = [['core', 'Castle'], ['depot', 'Cottage'], ['extractor', 'Market'], ['barracks', 'Barracks'], ['forge', 'Blacksmith'], ['factory', 'Workshop'], ['turret', 'Watchtower'], ['airfield', 'Stables']];
const VBLD = [['conflux', 'Data centre'], ['spire', 'Cabin'], ['siphon', 'Recruiting post'], ['kiln', 'Factory'], ['loom', 'Lab'], ['ward', 'Radio tower'], ['eclipse', 'Portal']];
const UNITS = [...HARBOUR, ...VAEL];

// ---- the atlas: each frame cut out at its full source size (a trimmed mask put back at its offset) ----
const index = JSON.parse(readFileSync(join(ART, 'atlas.json'), 'utf8')), frames = new Map();
for (const page of index.pages) {
  const sheet = JSON.parse(readFileSync(join(ART, page), 'utf8')), img = decodePNG(readFileSync(join(ART, sheet.meta.image)));
  for (const [name, f] of Object.entries(sheet.frames)) {
    const { w, h } = f.sourceSize, at = f.spriteSourceSize ?? { x: 0, y: 0 }, data = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < f.frame.h; j++) data.set(img.data.subarray(((f.frame.y + j) * img.w + f.frame.x) * 4, ((f.frame.y + j) * img.w + f.frame.x + f.frame.w) * 4), ((at.y + j) * w + at.x) * 4);
    frames.set(name, { name, img: { w, h, data }, anchor: f.anchor ?? { x: 0.5, y: 0.5 } });
  }
}
const missing = new Set();
const get = (name) => { const s = frames.get(name); if (!s) { missing.add(name); return { name, img: { w: 1, h: 1, data: new Uint8ClampedArray(4) }, anchor: { x: 0, y: 0 } }; } return s; };
const tintOf = (seat) => { const c = index.tints[seat]; return [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v / 255); };

// ---- a canvas and the painters (as review.mjs's) ----
const canvas = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
const fill = (c, rgb) => { for (let i = 0; i < c.w * c.h; i++) c.data.set([...rgb, 255], i * 4); };
/** Source-over of a sprite with its anchor at (x, y); its team mask (`name_m`) tinted over it for a seat, as the renderer
 *  draws the two; `seat` 'm' draws the bare mask. A Lookout is drawn with its gun head (`head`: the head's frame). */
function draw(c, s, x, y, seat = null) {
  const layers = seat === 'm' ? [[frames.get(s.name + '_m'), null]] : [[s, null], [seat === null ? null : frames.get(s.name + '_m'), seat === null ? null : tintOf(seat)]];
  for (const [l, tint] of layers) {
    if (!l) continue;
    const { w, h, data } = l.img, ox = Math.round(x - s.anchor.x * w), oy = Math.round(y - s.anchor.y * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = ox + i, py = oy + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue;
      const si = (j * w + i) * 4, di = (py * c.w + px) * 4, a = data[si + 3] / 255;
      if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * (tint ? tint[k] : 1) * a;
      c.data[di + 3] = 255;
    }
  }
}
/** A building, the Lookout with its gun head (facing `head`) drawn at the building's own point, as the renderer does. */
function drawBldg(c, kind, x, y, seat, head = 0) {
  draw(c, get(`bldg_${kind}`), x, y, seat);
  if (kind === 'turret') draw(c, get(`turret_head_${head}`), x, y, seat);
}
/** The seabed as the game lays it: the atlas's ground tiles on the dual grid (a cell between four tiles' centers), picked
 *  by gl/ground.js `groundTile` for `seed`, and the land's shade multiply over it (gl/ground.js `shadeLayers`, one texel a
 *  tile, linear-filtered). `plain`: the base tile only, no shade (the blind images judge the unit, not the tile). */
function seabed(c, seed = 1, plain = false) {
  const T = 64, tw = Math.ceil(c.w / T) + 1, th = Math.ceil(c.h / T) + 1;
  let r = seed * 2654435761 >>> 0; const rnd = () => ((r = Math.imul(r ^ r >>> 15, 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296);
  for (let j = -1; j < th; j++) for (let i = -1; i < tw; i++) {
    const t = get(`ground_${plain ? 0 : groundTile(rnd(), i, j, seed, false)}`).img;
    for (let y = 0; y < T; y++) { const py = j * T + T / 2 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = i * T + T / 2 + x; if (px >= 0 && px < c.w) c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), (py * c.w + px) * 4); } }
  }
  if (plain) return;
  const n = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return s - Math.floor(s); };
  const sh = shadeLayers(tw, th, { rock: () => false, ground: () => 'land', shade: (x, y) => 0.1 + n(x >> 2, y >> 2) * 0.5 });
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const fx = x / T - 0.5, fy = y / T - 0.5, x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), u = Math.max(0, fx - x0), v = Math.max(0, fy - y0);
    const q = (xx, yy) => (Math.min(sh.h - 1, yy) * sh.w + Math.min(sh.w - 1, xx)) * 4, i = (y * c.w + x) * 4;
    for (let k = 0; k < 3; k++) {
      const m = (sh.mul[q(x0, y0) + k] * (1 - u) + sh.mul[q(x0 + 1, y0) + k] * u) * (1 - v) + (sh.mul[q(x0, y0 + 1) + k] * (1 - u) + sh.mul[q(x0 + 1, y0 + 1) + k] * u) * v;
      c.data[i + k] = Math.round(c.data[i + k] * m / 255);
    }
  }
}
/** A selection ring as the game draws one (pale, under the unit), radius in atlas px. */
function ring(c, x, y, rx, ry, rgb = [0xea, 0xf6, 0xff]) {
  for (let a = 0; a < Math.PI * 2; a += 0.01) { const px = Math.round(x + Math.cos(a) * rx), py = Math.round(y + Math.sin(a) * ry); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (px + dx >= 0 && px + dx < c.w && py + dy >= 0 && py + dy < c.h) c.data.set([...rgb, 255], ((py + dy) * c.w + px + dx) * 4); }
}
/** 2x box downsample: the CSS-pixel view of a 2x canvas. */
function half(c) {
  const o = canvas(c.w >> 1, c.h >> 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) for (let k = 0; k < 4; k++) { const i = (2 * y * c.w + 2 * x) * 4 + k; o.data[(y * o.w + x) * 4 + k] = Math.round((c.data[i] + c.data[i + 4] + c.data[i + c.w * 4] + c.data[i + c.w * 4 + 4]) / 4); }
  return o;
}
// Colour-vision simulation (Machado, Oliveira and Fernandes 2009, severity 1.0), applied in linear RGB.
const MACHADO = { protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]] };
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };
function simulate(c, mode) {
  const o = canvas(c.w, c.h), M = MACHADO[mode];
  for (let i = 0; i < c.w * c.h * 4; i += 4) {
    const r = toLin(c.data[i]), g = toLin(c.data[i + 1]), b = toLin(c.data[i + 2]);
    if (mode === 'grey') { const y = toSrgb(0.2126 * r + 0.7152 * g + 0.0722 * b); o.data.set([y, y, y, 255], i); continue; }
    o.data.set([toSrgb(M[0][0] * r + M[0][1] * g + M[0][2] * b), toSrgb(M[1][0] * r + M[1][1] * g + M[1][2] * b), toSrgb(M[2][0] * r + M[2][1] * g + M[2][2] * b), 255], i);
  }
  return o;
}
const save = (name, c) => writeFileSync(join(outDir, name), encodePNG(c));

// ---- 1. the contact sheet ----
{
  const PAD = 6, SEATS = [0, 1, 6, 'm'], rows = [];
  for (const [k] of UNITS) rows.push({ name: `${k}_0`, kind: k, frame: 0 });
  for (const [k, f] of STATES) rows.push({ name: `${k}_${f}`, kind: k, frame: f });
  for (const [k] of [...HBLD, ...VBLD]) rows.push({ name: `bldg_${k}`, bldg: k });
  const sizeOf = (r) => r.bldg ? get(`bldg_${r.bldg}`).img : [0, 4, 8, 12].map(d => get(`${r.kind}_${d}_${r.frame}`).img).reduce((a, b) => ({ w: Math.max(a.w, b.w), h: Math.max(a.h, b.h) }));
  const cells = rows.map(r => ({ ...r, ...sizeOf(r), n: r.bldg ? 4 : 16 }));
  const c = canvas(Math.max(...cells.map(r => (r.w + PAD) * r.n)), cells.reduce((a, r) => a + r.h + PAD, 0)); fill(c, [52, 54, 56]);
  let y = 0;
  for (const r of cells) {
    let col = 0;
    for (const d of r.bldg ? [null] : [0, 4, 8, 12]) for (const seat of SEATS) {
      const s = r.bldg ? get(`bldg_${r.bldg}`) : get(`${r.kind}_${d}_${r.frame}`), x = col++ * (r.w + PAD) + PAD / 2 + Math.round(s.anchor.x * s.img.w), ay = y + PAD / 2 + Math.round(s.anchor.y * s.img.h);
      if (r.bldg) drawBldg(c, r.bldg, x, ay, seat); else draw(c, s, x, ay, seat);
    }
    y += r.h + PAD;
  }
  save('contact.png', c);
  writeFileSync(join(outDir, 'contact.json'), JSON.stringify({
    units: { columns: [0, 4, 8, 12].flatMap(d => ['seat 0 (gold)', 'seat 1 (magenta)', 'seat 6 (violet)', 'team mask'].map(s => `facing ${d}, ${s}`)), rows: cells.filter(r => !r.bldg).map(r => `${r.kind}_<facing>_${r.frame}`) },
    buildings: { columns: ['seat 0 (gold)', 'seat 1 (magenta)', 'seat 6 (violet)', 'team mask'], rows: cells.filter(r => r.bldg).map(r => r.bldg === 'turret' ? 'bldg_turret + turret_head_0' : r.name) },
  }, null, 1));
}

// ---- 2. the phone sheet: everything at game size on the seabed beside salt fields ----
{
  const c = canvas(2600, 1500); seabed(c, 7);
  const list = [], row = (names, y, x0, gap, seat) => names.forEach((n, k) => list.push([n, x0 + k * gap, y, seat]));
  list.push(['shard_0', 2470, 120], ['shard_1', 2470, 290], ['shard_3', 2470, 500], ['shard_2', 130, 1380]);
  let x = 120; for (const [k] of HBLD) { const s = get(`bldg_${k}`).img; x += s.w * 0.45; list.push([`bldg_${k}`, x, 270, 0, k === 'turret' ? 'head' : null]); x += s.w * 0.6 + 20; }
  x = 120; for (const [k] of VBLD) { const s = get(`bldg_${k}`).img; x += s.w * 0.45; list.push([`bldg_${k}`, x, 700, 1]); x += s.w * 0.6 + 20; }
  for (const [y, seat] of [[960, 0], [1100, 1], [1240, 6]]) { row(HARBOUR.map(([k]) => `${k}_0_0`), y, 120, 118, seat); row(VAEL.map(([k]) => `${k}_0_0`), y, 1420, 118, seat); }
  row(STATES.map(([k, f]) => `${k}_0_${f}`), 1390, 400, 140, 0); row(STATES.map(([k, f]) => `${k}_8_${f}`), 1390, 1000, 140, 1);
  row(['harvester_4_0', 'trooper_8_0', 'rider_12_0', 'lumen_12_0', 'shrike_4_0', 'bruiser_8_0'], 1390, 1650, 130, 6);
  for (const [name, px, py, seat, head] of list.sort((a, b) => a[2] - b[2])) {
    if (name.startsWith('bldg_')) drawBldg(c, name.slice(5), px, py, seat, head ? 3 : 0); else draw(c, get(name), px, py, seat ?? null);
  }
  ring(c, 238, 963, 24, 14); // the game's selection ring under the second unit (seat 0)
  save('phone@2x.png', c);
  const p = half(c); save('phone.png', p);
  for (const mode of ['grey', 'protan', 'deutan']) save(`phone-${mode}.png`, simulate(p, mode));
}

// ---- 2b. every seat's team color: a row per seat (0-7) of the Harbor's units and its canvas-roofed buildings, then the
// Vael's units and pale shells, at game size; the same in deuteranopia and protanopia (seats.png, seats-deutan.png,
// seats-protan.png): whether each seat's team reads, and seat 0's gold apart from seat 6's violet ----
{
  const ROW = 150, c = canvas(3000, ROW * 8 + 40); seabed(c, 5);
  const list = [];
  for (let seat = 0; seat < 8; seat++) {
    const y = 90 + seat * ROW; let x = 90;
    for (const [k] of HARBOUR) { list.push([`${k}_0_0`, x, y, seat]); x += 104; }
    for (const k of ['barracks', 'factory', 'airfield']) { const w = get(`bldg_${k}`).img.w; x += w * 0.3; list.push([`bldg_${k}`, x, y + 40, seat]); x += w * 0.42; }
    x += 40; for (const [k] of VAEL) { list.push([`${k}_0_0`, x, y, seat]); x += 104; }
    for (const k of ['conflux', 'kiln']) { const w = get(`bldg_${k}`).img.w; x += w * 0.25; list.push([`bldg_${k}`, x, y + 40, seat]); x += w * 0.35; }
  }
  for (const [name, px, py, seat] of list.sort((a, b) => a[2] - b[2])) {
    if (name.startsWith('bldg_')) drawBldg(c, name.slice(5), px, py, seat); else draw(c, get(name), px, py, seat);
  }
  const p = half(c); save('seats.png', p);
  for (const mode of ['protan', 'deutan']) save(`seats-${mode}.png`, simulate(p, mode));
}

// ---- 3. blind: each sprite alone on plain seabed at phone size, named by random capital letters ----
function blind(dir, items, B) {
  const used = new Set(), key = {}, A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  items.forEach(([draws, what], n) => {
    let code; do code = A[Math.floor(Math.random() * A.length)] + A[Math.floor(Math.random() * A.length)]; while (used.has(code)); used.add(code);
    const c = canvas(B, B); seabed(c, 11 + n * 7, true); draws(c, B / 2, B / 2 + B * 0.07);
    key[code] = what; writeFileSync(join(outDir, 'blind', dir, `${code}.png`), encodePNG(half(c)));
  });
  writeFileSync(join(outDir, 'blind', dir, 'key.json'), JSON.stringify(Object.fromEntries(Object.entries(key).sort()), null, 1));
}
blind('units', [
  ...UNITS.flatMap(([k, n]) => [0, 6].map(seat => [(c, x, y) => draw(c, get(`${k}_0_0`), x, y, seat), `${k} (${n}), seat ${seat}`])),
  ...STATES.map(([k, f, what]) => [(c, x, y) => draw(c, get(`${k}_0_${f}`), x, y, 0), `${k} frame ${f} (${what}), seat 0`]),
], 224);
blind('buildings', [...HBLD, ...VBLD].flatMap(([k, n]) => [0, 6].map(seat => [(c, x, y) => drawBldg(c, k, x, y, seat), `${k} (${n}), seat ${seat}`])), 480);

// ---- 4. the atlas's size ----
{
  const pngs = readdirSync(ART).filter(f => f.endsWith('.png')), bytes = pngs.reduce((a, f) => a + statSync(join(ART, f)).size, 0), BUDGET = 4.5 * 1024 * 1024;
  const masks = [...frames.keys()].filter(n => n.endsWith('_m')).length;
  const text = [
    `public/art/*.png: ${bytes} bytes (${(bytes / 1e6).toFixed(2)} MB, ${(bytes / 1024 / 1024).toFixed(2)} MiB): ${(bytes / 4.5e6 * 100).toFixed(1)}% of 4.5 MB (${(bytes / BUDGET * 100).toFixed(1)}% of 4.5 MiB)`,
    ...pngs.map(f => `  ${f}: ${statSync(join(ART, f)).size} bytes`),
    `pages: ${index.pages.length}`,
    `sprites (frames): ${frames.size} (${frames.size - masks} art, ${masks} team masks)`,
  ].join('\n') + '\n';
  writeFileSync(join(outDir, 'atlas-size.txt'), text); process.stdout.write(text);
}
// ---- 5. the checks: every unit's facings x frames and masks there, every building's; no art touching its cell's edge ----
for (const [k] of UNITS) {
  let n = 0; while (frames.has(`${k}_0_${n}`)) n++;
  for (let d = 0; d < index.facings; d++) for (let f = 0; f < n; f++) for (const s of ['', '_m']) if (!frames.has(`${k}_${d}_${f}${s}`)) missing.add(`${k}_${d}_${f}${s}`);
}
for (const [k] of [...HBLD, ...VBLD]) for (const s of ['', '_m']) if (!frames.has(`bldg_${k}${s}`)) missing.add(`bldg_${k}${s}`);
const edge = [];
for (const [name, { img: { w, h, data } }] of frames) {
  if (name.endsWith('_m') || /^(ground|rock|light|sel)_?/.test(name)) continue; // (tiles fill their cell; masks are trimmed)
  let n = 0; for (let i = 0; i < w; i++) n += (data[i * 4 + 3] > 8) + (data[((h - 1) * w + i) * 4 + 3] > 8); for (let j = 0; j < h; j++) n += (data[j * w * 4 + 3] > 8) + (data[(j * w + w - 1) * 4 + 3] > 8);
  if (n) edge.push(`${name} (${n} px)`);
}
console.log(`frames with opaque pixels on their cell's edge: ${edge.length ? edge.join(', ') : 'none'}`);
if (missing.size) console.log('MISSING frames:', [...missing].join(', '));
console.log('review pack ->', outDir);
