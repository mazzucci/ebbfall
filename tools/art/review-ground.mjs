// The review pack of the ground family (STYLE.md "The ground and the scenery"): node tools/art/review-ground.mjs <outdir>
// Renders the family's sprites (the salt field, the scenery, construction and wrecks of both peoples)
// and a few units and buildings for scale, and writes into <outdir>:
//   ground@2x.png, ground.png   a phone's screen (844x390 CSS px; @2x: atlas px, 1:1) of seabed with a reef plateau, the
//                    salt field at its four stages, and the scenery as the game scatters it (no mine shaft since the re-theme)
//                    (src/client/scenery.js on this patch); the game's shade layer over it as gl/render.js draws it
//   units@2x.png, units.png     the same sheet with Harbour and Vael units (seats 0, 1, 6) and a building of each people
//   ground-grey.png, ground-protan.png, ground-deutan.png, units-*.png   the phone sheets in greyscale and under Machado
//                    et al. 2009 protanopia and deuteranopia at full severity
//   scenery.png      every prop at 1:1 on the seabed, in the atlas's order (scenery.json names the cells)
//   construction.png the Harbour's foundation, scaffold over a rising Lighthouse (3/8 and 6/8 as the renderer reveals it),
//                    the whole and its rubble; the Vael's bud, the bud over the Tidewell's warp ghost, the whole and its
//                    rubble; the three sizes' foundations, scaffolds, buds and rubble below
//   projectiles.png  bolt, shell, missile, harpoon and beam at 1:1 and at 4x, beside a Harpooner and a Lens
//   base@2x.png, base.png, base-grey.png   a real main (the sim's 64x64 map, seed 4242) at a phone's size: the Lighthouse,
//                    its arc of salt fields, the scatter, a few workers
//                    and troopers; `--base-only` writes only these
//   shore@2x.png, shore.png     a Shore-like patch: a cove, shallows, a deep channel and a reef basin, with the shade
//                    layer's water tints as render.js multiplies them, and the minimap's colours for the same tiles (x4)
// Nothing here renders the whole atlas: render3d takes a filter.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { tile } from './terrain2.js';
import { effectSprites } from './effects2.js';
import { render3d } from './render3d.mjs';
import { hash2, vnoise } from './raster.js';
import { scatterDoodads, DOODADS } from '../../src/client/scenery.js';
import { mulberry } from '../../src/engine/util.js';
import { groundTile, rockTile, shadeLayers } from '../../src/client/gl/ground.js';

const outDir = process.argv.slice(2).find(a => !a.startsWith('--')) ?? '/tmp/review-ground', BASE_ONLY = process.argv.includes('--base-only');
mkdirSync(outDir, { recursive: true });
const FILTER = BASE_ONLY ? '^(harvester|trooper|lancer)_(0|4|8|12)_0$|^bldg_(core|extractor)$|^shard_\\d$|^doodad_'
  : '^(harvester|trooper|lancer|lumen|prism|scythe)_(0|4|8|12)_0$|^bldg_(core|conflux|extractor)$|^shard_\\d$|^doodad_|^foundation_\\d$|^scaffold_\\d$|^rubble_\\d$|^bud_\\d$|^rubble_vael_\\d$';
const all = process.env.NO3D ? Object.assign([], { tints: [] }) : await render3d(FILTER), TINTS = all.tints;
for (const e of effectSprites()) all.push(e);
const byName = new Map(all.map(s => [s.name, s]));
const masks = new Map(all.filter(s => s.trim).map(s => [s.name.slice(0, -2), s.img]));
const get = (name) => { const s = byName.get(name); if (!s && process.env.NO3D) return { name, img: { w: 0, h: 0, data: [] }, anchor: { x: 0, y: 0 } }; if (!s) throw new Error(`${name} was not rendered`); return s; };
const tintOf = (seat) => { const c = TINTS[seat]; return [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v / 255); };

// ---- a canvas and the painters (as review.mjs's) ----
const T = 64; // a tile in atlas px
const canvas = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
const fill = (c, rgb) => { for (let i = 0; i < c.w * c.h; i++) c.data.set([...rgb, 255], i * 4); };
/** Source-over of a sprite with its anchor at (x, y); the team mask tinted for a seat; `alpha` and `tint` for a warp
 *  ghost; `fromRow`: only the sprite's rows from there down (the renderer's construction reveal, bottom-aligned). */
function draw(c, s, x, y, seat = null, { alpha = 1, tint = null, fromRow = 0 } = {}) {
  const { w, h, data } = s.img, ox = Math.round(x - s.anchor.x * w), oy = Math.round(y - s.anchor.y * h);
  const m = seat === null ? null : masks.get(s.name), tc = seat === null ? null : tintOf(seat);
  for (let j = fromRow; j < h; j++) for (let i = 0; i < w; i++) {
    const px = ox + i, py = oy + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue;
    const si = (j * w + i) * 4, di = (py * c.w + px) * 4;
    let a = data[si + 3] / 255 * alpha; if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * (tint ? tint[k] : 1) * a;
    if (m) { a = m.data[si + 3] / 255 * alpha; if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + m.data[si + k] * tc[k] * a; }
    c.data[di + 3] = 255;
  }
}
/** A patch of map: `rock(tx, ty)` and `height(tx, ty)` over tw x th tiles; the dual grid drawn as gl/render.js draws it
 *  (a cell between four tiles, at their centres' offset), its tiles picked as the game picks them (gl/ground.js
 *  groundTile, seeded), and the game's shade layers over it (gl/ground.js shadeLayers, linear-filtered as the GPU does):
 *  the multiply (the map's large-scale noise on land, the wet line, the water tints) and the add (the water's light). */
const tiles = {}; const getTile = (m, v) => tiles[m + '_' + v] ??= tile(m, v);
const MINI = { rock: '#6b665a', shallow: '#467c80', deep: '#1d3658' }; // the minimap's colours (render.js: the land hsl(36,10%,14-23%))
function patch(c, { tw, th, rock = () => 0, height = () => 1, seed = 1, shade = true, kelp = null, shadeAt = null }) {
  const R = (x, y) => x < 0 || y < 0 || x >= tw || y >= th ? 1 : rock(x, y);
  const rnd = mulberry(seed * 7 + 3);
  for (let j = -1; j < th; j++) for (let i = -1; i < tw; i++) {
    const m = R(i, j) | R(i + 1, j) << 1 | R(i, j + 1) << 2 | R(i + 1, j + 1) << 3, r = rnd();
    const wet = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].some(([x, y]) => !R(x, y) && height(x, y) <= 0);
    const t = m === 0 ? getTile(0, groundTile(r, i, j, seed, wet)) : getTile(m, +rockTile(m, r).split('_')[2]);
    for (let y = 0; y < T; y++) { const py = j * T + T / 2 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = i * T + T / 2 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), (py * c.w + px) * 4); } }
    if (kelp && m === 0 && groundTile(r, i, j, seed, wet) >= 8) {                                   // (the grey check: where this tile's kelp lies)
      const L = (o) => 0.2126 * t.data[o] + 0.7152 * t.data[o + 1] + 0.0722 * t.data[o + 2], base = getTile(0, 0), Lb = (o) => 0.2126 * base.data[o] + 0.7152 * base.data[o + 1] + 0.0722 * base.data[o + 2];
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const o = (y * T + x) * 4, px = i * T + T / 2 + x, py = j * T + T / 2 + y; if (px >= 0 && py >= 0 && px < c.w && py < c.h && L(o) < Lb(o) * 0.7) kelp.push([px, py]); }
    }
  }
  if (!shade) return;
  const gd = (x, y) => height(x, y) > 0 ? 'land' : height(x, y) > -2 ? 'shallow' : 'deep';
  const sh = shadeLayers(tw, th, { rock: (x, y) => !!rock(x, y), ground: gd, shade: shadeAt ?? ((x, y) => 0.1 + vnoise(x, y, 5, 3 + seed, 0) * 0.5) });
  const texel = (a, x, y) => { x = Math.max(0, Math.min(sh.w - 1, x)); y = Math.max(0, Math.min(sh.h - 1, y)); return (y * sh.w + x) * 4; };
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {                                       // linear filtering between texel centres
    const fx = x * sh.k / T - 0.5, fy = y * sh.k / T - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const i = (y * c.w + x) * 4, q = [texel(0, x0, y0), texel(0, x0 + 1, y0), texel(0, x0, y0 + 1), texel(0, x0 + 1, y0 + 1)], wts = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    for (let k = 0; k < 3; k++) {
      const mul = q.reduce((s, o, n) => s + sh.mul[o + k] * wts[n], 0), add = sh.add ? q.reduce((s, o, n) => s + sh.add[o + k] * wts[n], 0) : 0;
      c.data[i + k] = Math.min(255, Math.round(c.data[i + k] * mul / 255 + add));
    }
  }
}
function ring(c, x, y, rx, ry, rgb = [0xea, 0xf6, 0xff]) {
  for (let a = 0; a < Math.PI * 2; a += 0.01) { const px = Math.round(x + Math.cos(a) * rx), py = Math.round(y + Math.sin(a) * ry); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((py + dy) * c.w + px + dx) * 4; if (px + dx >= 0 && px + dx < c.w && py + dy >= 0 && py + dy < c.h) c.data.set([...rgb, 255], i); } }
}
function half(c) {
  const o = canvas(c.w >> 1, c.h >> 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) for (let k = 0; k < 4; k++) { const i = (2 * y * c.w + 2 * x) * 4 + k; o.data[(y * o.w + x) * 4 + k] = Math.round((c.data[i] + c.data[i + 4] + c.data[i + c.w * 4] + c.data[i + c.w * 4 + 4]) / 4); }
  return o;
}
function scale(c, k) { const o = canvas(c.w * k, c.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y / k | 0) * c.w + (x / k | 0)) * 4, ((y / k | 0) * c.w + (x / k | 0)) * 4 + 4), (y * o.w + x) * 4); return o; }
function blit(c, src, x, y) { for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) { const px = x + i, py = y + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue; c.data.set(src.data.subarray((j * src.w + i) * 4, (j * src.w + i) * 4 + 4), (py * c.w + px) * 4); } }
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
const place = (c, list) => { for (const [name, x, y, seat, opts] of list.slice().sort((a, b) => a[2] - b[2])) draw(c, get(name), x, y, seat ?? null, opts); };
/** The luminance of a sprite's solid pixels (mean, the 95th percentile and the peak, 1 = white): a maker's check of the
 *  value order. */
function lum(name) {
  const { data } = get(name).img, v = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255 && (data[i] | data[i + 1] | data[i + 2])) v.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  v.sort((a, b) => a - b); return { mean: (v.reduce((a, b) => a + b, 0) / v.length / 255).toFixed(2), p95: (v[Math.floor(v.length * 0.95)] / 255).toFixed(2), peak: Math.round(v[v.length - 1]) };
}

// ---- 1. the ground sheet: a phone's screen of seabed with a reef, the fields and the scatter ----
const TW = 27, TH = 13; // a 2x phone (1688x780) is 26.4 x 12.2 tiles
const reef = (x, y) => (Math.hypot((x - 5) / 3.2, (y - 3) / 2.2) + (hash2(x, y, 5) - 0.5) * 0.5 < 1) || (Math.hypot((x - 22) / 2.4, (y - 10.5) / 1.8) + (hash2(x, y, 9) - 0.5) * 0.5 < 1) ? 1 : 0;
const groundMap = { rock: new Uint8Array(TW * TH), height: null, nodes: [{ tx: 4, ty: 9 }, { tx: 7, ty: 9 }, { tx: 10, ty: 9 }, { tx: 13, ty: 9 }, { tx: 19, ty: 3 }] };
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) groundMap.rock[y * TW + x] = reef(x, y);
const scatter = scatterDoodads(4242, groundMap, [], { MW: TW, MH: TH, TILE: 32, mulberry });
const greyCheck = { kelp: [], list: null };
function groundSheet(withUnits) {
  const c = canvas(TW * T, TH * T); patch(c, { tw: TW, th: TH, rock: reef, seed: 4242, kelp: withUnits ? greyCheck.kelp : null });
  const list = [];
  for (const d of scatter) list.push([`doodad_${d.name}`, d.x * 2, d.y * 2]);
  groundMap.nodes.slice(0, 4).forEach((n, k) => list.push([`shard_${k}`, (n.tx + 0.5) * T, (n.ty + 0.5) * T]));
  if (withUnits) {
    list.push(['bldg_core', 9 * T, 4 * T, 0], ['bldg_conflux', 23 * T, 5.5 * T, 1]);
    const row = (names, y, seat, x0) => names.forEach((n, k) => list.push([n, x0 + k * 80, y, seat]));
    row(['harvester_0_0', 'trooper_0_0', 'lancer_0_0', 'lumen_0_0', 'prism_0_0', 'scythe_0_0'], 7.2 * T, 0, 13 * T);
    row(['harvester_4_0', 'trooper_8_0', 'lancer_12_0', 'lumen_8_0', 'prism_4_0', 'scythe_12_0'], 8.6 * T, 1, 13.4 * T);
    row(['harvester_12_0', 'trooper_4_0', 'lancer_8_0', 'lumen_12_0', 'prism_8_0', 'scythe_4_0'], 10 * T, 6, 13 * T);
    row(['trooper_0_0', 'trooper_4_0', 'lancer_0_0'], 11.5 * T, 0, 4.5 * T);
    row(['lumen_8_0', 'prism_8_0', 'scythe_8_0'], 11.5 * T, 1, 9 * T);
  }
  place(c, list); if (withUnits) greyCheck.list = list;
  if (withUnits) ring(c, 13 * T + 80, 7.2 * T + 3, 24, 14);
  return { w: 1688, h: 780, data: (() => { const o = canvas(1688, 780); for (let y = 0; y < 780; y++) o.data.set(c.data.subarray((y * c.w) * 4, (y * c.w + 1688) * 4), y * 1688 * 4); return o.data; })() };
}
let unitsSheet = null;
if (!BASE_ONLY) for (const [name, units] of [['ground', false], ['units', true]]) {
  const c = groundSheet(units); save(`${name}@2x.png`, c); if (units) unitsSheet = c;
  const p = half(c); save(`${name}.png`, p);
  for (const mode of ['grey', 'protan', 'deutan']) save(`${name}-${mode}.png`, simulate(p, mode));
}

// ---- 2. the scenery at 1:1: every prop on the seabed, one cell each ----
if (!BASE_ONLY) {
  const names = [...DOODADS.rock, ...DOODADS.ground].map(n => `doodad_${n}`), cw = 150, ch = 130, cols = 5;
  const c = canvas(cw * cols, ch * Math.ceil(names.length / cols)); patch(c, { tw: Math.ceil(c.w / T), th: Math.ceil(c.h / T), seed: 7 });
  names.forEach((n, k) => draw(c, get(n), (k % cols) * cw + cw / 2, Math.floor(k / cols) * ch + ch * 0.6));
  save('scenery.png', c); greyCheck.scenery = { c, names, cw, ch, cols };
  writeFileSync(join(outDir, 'scenery.json'), JSON.stringify({ columns: cols, cells: names, what: { boulders: 'a heap of shells', spire: 'pilings', ruin: "a boat's ribs", wreck: 'a hull on its side', crater_0: 'an anchor in the sand', crater_1: 'a tide pool', debris: 'flotsam' } }, null, 1));
}

// ---- 3. construction and wrecks: the Harbour's Lighthouse and the Vael's Tidewell through their stages ----
if (!BASE_ONLY) {
  const c = canvas(1500, 760); patch(c, { tw: 24, th: 12, seed: 11 });
  const core = get('bldg_core'), conflux = get('bldg_conflux'), stageRow = (s, k) => Math.round(s.img.h * (1 - k / 8));
  const Y = 190, X = (k) => 150 + k * 290;
  draw(c, get('foundation_4'), X(0), Y);
  for (const [k, st] of [[1, 3], [2, 6]]) { draw(c, get('foundation_4'), X(k), Y); draw(c, core, X(k), Y, 0, { fromRow: stageRow(core, st) }); draw(c, get('scaffold_4'), X(k), Y); }
  draw(c, core, X(3), Y, 0); draw(c, get('rubble_4'), X(4), Y);
  const Y2 = 470;
  draw(c, get('bud_4'), X(0), Y2);
  for (const [k, a] of [[1, 0.35], [2, 0.7]]) { draw(c, conflux, X(k), Y2, 1, { alpha: a, tint: [0.8, 0.71, 1] }); draw(c, get('bud_4'), X(k), Y2); }
  draw(c, conflux, X(3), Y2, 1); draw(c, get('rubble_vael_4'), X(4), Y2);
  const Y3 = 690; let x = 60;
  for (const n of [2, 3]) for (const kind of ['foundation', 'scaffold', 'rubble', 'bud', 'rubble_vael']) { draw(c, get(`${kind}_${n}`), x, Y3); x += n * 32 * 2 + 30; }
  save('construction.png', c);
}

// ---- 4. the projectiles at 1:1 and at 4x, beside a Harpooner and a Lens ----
if (!BASE_ONLY) {
  const c = canvas(900, 300); patch(c, { tw: 15, th: 5, seed: 5 });
  const names = ['bolt', 'shell', 'missile', 'harpoon', 'beam'];
  names.forEach((n, k) => draw(c, get(n), 60 + k * 90, 40));
  draw(c, get('lancer_0_0'), 560, 60, 0); draw(c, get('prism_0_0'), 640, 60, 1);
  names.forEach((n, k) => { const s = get(n), big = canvas(s.img.w, s.img.h); patch(big, { tw: 2, th: 1, seed: 5 + k, shade: false }); draw(big, s, s.anchor.x * s.img.w, s.anchor.y * s.img.h); blit(c, scale(big, 4), 20 + k * 175, 120); });
  save('projectiles.png', c);
}

// ---- 5. a Shore-like patch: the shade layer's water tints over the new ground, and the minimap's colours ----
if (!BASE_ONLY) {
  const SW = 27, SH = 13;
  const h = (x, y) => { // a cove on land to the west, shallows, a deep channel, shallows, a reef basin to the east
    const n = (hash2(x, y, 21) - 0.5) * 1.2, d = x + n;
    if (d < 7) return 1; if (d < 10) return 0; if (d < 15) return -3; if (d < 19) return -1; if (d < 22) return 0; return 1;
  };
  const rk = (x, y) => (y < 2 && x < 6) || (Math.hypot((x - 23) / 2.6, (y - 6) / 2.6) > 0.8 && Math.hypot((x - 23) / 2.6, (y - 6) / 2.6) < 1.25 && !(x > 21 && x < 25 && y < 4.5)) ? 1 : 0;
  const c = canvas(SW * T, SH * T); patch(c, { tw: SW, th: SH, rock: rk, height: h, seed: 3 });
  const shoreMap = { rock: new Uint8Array(SW * SH), height: new Int8Array(SW * SH), nodes: [{ tx: 3, ty: 8 }, { tx: 23, ty: 6 }] };
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { shoreMap.rock[y * SW + x] = rk(x, y); shoreMap.height[y * SW + x] = h(x, y); }
  const list = scatterDoodads(99, shoreMap, [], { MW: SW, MH: SH, TILE: 32, mulberry }).map(d => [`doodad_${d.name}`, d.x * 2, d.y * 2]);
  list.push(['shard_0', 3.5 * T, 8.5 * T], ['shard_1', 23.5 * T, 6.5 * T], ['trooper_0_0', 5 * T, 5 * T, 0], ['lancer_0_0', 8.5 * T, 6 * T, 0], ['lumen_8_0', 17 * T, 4 * T, 1], ['scythe_8_0', 12 * T, 7 * T, 1], ['prism_8_0', 20 * T, 9 * T, 1]);
  place(c, list);
  const mini = canvas(SW * 4, SH * 4), hsl = (s) => { const l = (14 + s * 9) / 100, sat = 0.1, q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q, f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(0.1 + 1 / 3), f(0.1), f(0.1 - 1 / 3)].map(v => Math.round(v * 255)); };
  const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const g = rk(x, y) ? 'rock' : h(x, y) > 0 ? 'land' : h(x, y) > -2 ? 'shallow' : 'deep', nv = 0.1 + vnoise(x, y, 5, 6, 0) * 0.5;
    const col = g === 'land' ? hsl(nv) : hex(MINI[g]);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) mini.data.set([...col, 255], ((y * 4 + j) * mini.w + x * 4 + i) * 4);
  }
  const out = canvas(c.w, c.h + mini.h * 2 + 12); fill(out, [20, 22, 26]); blit(out, c, 0, 0); blit(out, scale(mini, 2), 0, c.h + 12);
  save('shore@2x.png', out); save('shore.png', half(out));
}

// ---- 6. the base shot: a real main (the sim's map, seed 4242, 64x64) at a phone's size: the Lighthouse, its arc of salt
// fields, the scatter as the game lays it, a few workers and troopers ----
{
  const sim = await import('../../src/engine/pkg/endfall_sim.js');
  sim.initSync({ module: readFileSync(new URL('../../src/engine/pkg/endfall_sim_bg.wasm', import.meta.url)) });
  const E = await import('../../src/engine/core.js');
  E.resetGame(4242, 1, 0, 0, 'humans', 'vael');
  const m = E.map, MW = E.MW, MH = E.MH, core = E.G.bldgs.find(b => b.team === 0 && b.d.hq), at = (x, y) => y * MW + x;
  const c = canvas(MW * T, MH * T);
  patch(c, { tw: MW, th: MH, rock: (x, y) => m.rock[at(x, y)] ? 1 : 0, height: (x, y) => m.height[at(x, y)] - E.WATER, seed: 4242, shadeAt: (x, y) => m.shade[at(x, y)] });
  const cores = E.G.bldgs.filter(b => b.d.hq).map(b => ({ tx: b.tx + b.w / 2, ty: b.ty + b.h / 2 }));
  const list = scatterDoodads(4242, m, cores, { MW, MH, TILE: 32, mulberry }).map(d => [`doodad_${d.name}`, d.x * 2, d.y * 2]);
  for (const n of m.nodes) list.push(['shard_0', n.x * 2, n.y * 2]); // (no map has a mine shaft since the re-theme)
  list.push(['bldg_core', (core.tx + core.w / 2) * T, (core.ty + core.h / 2) * T, 0]);
  const fields = m.nodes.filter(n => Math.hypot(n.tx - core.tx, n.ty - core.ty) < 14);
  fields.slice(0, 4).forEach((n, k) => list.push([['harvester_12_0', 'harvester_8_0', 'harvester_4_0', 'harvester_0_0'][k], (n.tx - 1.2) * T, (n.ty - 0.6) * T, 0]));
  list.push(['trooper_8_0', (core.tx - 3) * T, (core.ty + 1) * T, 0], ['trooper_4_0', (core.tx - 3.5) * T, (core.ty + 2.4) * T, 0], ['lancer_8_0', (core.tx - 5) * T, (core.ty + 1.6) * T, 0]);
  const [fa, fb] = [fields[2], fields[3]], wx = (fa.tx + fb.tx + 1) / 2 * T, wy = (fa.ty + fb.ty + 1) / 2 * T;   // the contrast check: a worker between two fields
  list.push(['harvester_4_0', wx, wy, 0]);
  place(c, list);
  { const g = simulate(c, 'grey'), sp = get('harvester_4_0'), { w, h, data } = sp.img, ox = Math.round(wx - sp.anchor.x * w), oy = Math.round(wy - sp.anchor.y * h), mine = [], round = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (data[(j * w + i) * 4 + 3] === 255) mine.push(g.data[((oy + j) * g.w + ox + i) * 4]);
    for (let y = Math.round(wy) - 40; y <= wy + 40; y++) for (let x = Math.round(wx) - 40; x <= wx + 40; x++) { const d = Math.hypot(x - wx, y - wy); if (d > 28 && d < 40) round.push(g.data[(y * g.w + x) * 4]); }
    const q = (v, p) => { v.sort((a, b) => a - b); return v[Math.floor((v.length - 1) * p)]; };
    greyCheck.worker = `worker between two fields: body median ${q(mine, 0.5)}, p10 ${q(mine.slice(), 0.1)}, p90 ${q(mine.slice(), 0.9)}; the ground round it median ${q(round, 0.5)} (base shot in grey)`; }
  const X0 = Math.max(0, Math.min(MW - 27, core.tx - 16)) * T, Y0 = Math.round(Math.max(0, Math.min(MH - 14, core.ty - 3.5)) * T), out = canvas(1688, 896);
  for (let y = 0; y < 896; y++) out.data.set(c.data.subarray(((Y0 + y) * c.w + X0) * 4, ((Y0 + y) * c.w + X0 + 1688) * 4), y * 1688 * 4);
  save('base@2x.png', out); const p = half(out); save('base.png', p); save('base-grey.png', simulate(p, 'grey'));
}

// ---- the maker's checks: values of the ground family against the units' pale tops ----
if (!process.env.NO3D && !BASE_ONLY) console.log('luminance of the solid pixels (mean / p95, 1 = white; peak in sRGB 0-255):');
if (!process.env.NO3D && !BASE_ONLY) for (const n of ['shard_0', 'shard_1', 'shard_2', 'shard_3', 'rubble_3', 'rubble_vael_3', 'doodad_boulders_0', 'doodad_spire_0', 'doodad_wreck_0', 'doodad_crater_1', 'scaffold_3', 'bud_3', 'rubble_vael_3', 'trooper_0_0', 'lumen_0_0', 'bldg_core']) { const l = lum(n); console.log(`  ${n.padEnd(20)} ${l.mean} / ${l.p95}  peak ${l.peak}`); }
// ---- the grey check: medians in the units sheet in grey (sRGB 0-255) of the bare ground, the kelp, each resource's
// and prop's solid pixels and the units', so the order (units, then the shaft and the full salt, kelp never) is measured ----
if (!process.env.NO3D && !BASE_ONLY) {
  const g = simulate(unitsSheet, 'grey'), at = (i) => g.data[i * 4], med = (v) => { v.sort((a, b) => a - b); return v.length ? `${String(v[v.length >> 1]).padStart(3)}  p90 ${String(v[Math.floor(v.length * 0.9)]).padStart(3)}` : 'none'; };
  const solid = (name, x, y) => { const sp = get(name), { w, h, data } = sp.img, ox = Math.round(x - sp.anchor.x * w), oy = Math.round(y - sp.anchor.y * h), v = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const px = ox + i, py = oy + j; if (data[(j * w + i) * 4 + 3] === 255 && px >= 0 && py >= 0 && px < g.w && py < g.h) v.push(at(py * g.w + px)); } return v; };
  const groups = {};
  for (const [name, x, y] of greyCheck.list) { const k = name.startsWith('doodad_') ? name.replace(/_\d$/, '') : /^(shard|vent)_/.test(name) ? name : /^bldg_/.test(name) ? 'buildings' : 'units'; (groups[k] ??= []).push(...solid(name, x, y)); }
  const ground = []; for (let y = 0; y < g.h; y += 3) for (let x = 0; x < g.w; x += 3) ground.push(at(y * g.w + x));
  console.log('grey check (units sheet in grey, sRGB 0-255: median and 90th percentile of solid pixels):');
  console.log(`  ${'ground (all px)'.padEnd(22)} ${med(ground)}`); console.log(`  ${'kelp'.padEnd(22)} ${med(greyCheck.kelp.filter(([x, y]) => x < g.w && y < g.h).map(([x, y]) => at(y * g.w + x)))}`);
  for (const [k, v] of Object.entries(groups).sort()) console.log(`  ${k.padEnd(22)} ${med(v)}`);
  const ring = (cx, cy, r0, r1) => { cx = Math.round(cx); cy = Math.round(cy); const v = []; for (let y = cy - r1; y <= cy + r1; y++) for (let x = cx - r1; x <= cx + r1; x++) { const d = Math.hypot(x - cx, (y - cy) / 0.82); if (d >= r0 && d < r1) v.push(at(y * g.w + x)); } return med(v); };
  console.log(`  ${'shard_0 apron'.padEnd(22)} ${ring(4.5 * T, 9.5 * T, 26, 30)}`);
  console.log(`  ${'reef top'.padEnd(22)} ${ring(5 * T, 3.4 * T, 0, 60)}`);
  { const { c, names, cw, ch, cols } = greyCheck.scenery, sg = simulate(c, 'grey'), k = names.indexOf('doodad_crater_1'), cx = Math.round((k % cols) * cw + cw / 2), cy = Math.round(Math.floor(k / cols) * ch + ch * 0.6), v = [];
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 12; x <= cx + 12; x++) v.push(sg.data[(y * sg.w + x) * 4]);
    console.log(`  ${'tide pool water'.padEnd(22)} ${med(v)}  (scenery.png in grey, the pool's middle)`); }
}
if (greyCheck.worker) console.log('  ' + greyCheck.worker);
console.log('review pack ->', outDir);
