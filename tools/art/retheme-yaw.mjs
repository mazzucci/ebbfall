// The yaw review (2026-11-11): do buildings read better turned about the vertical than square to their footprint?
// node tools/art/retheme-yaw.mjs [outdir] [--yaw=30]
// Renders the Castle, the Data centre and the Cottage square (as shipped) and turned +yaw, -yaw and +yaw scaled to fit
// the footprint (retheme.js `turns`), in the approved look (polish, the game's camera and sun), and writes to outdir
// (target/yaw-review by default), each at 2x (a DPR-2 phone at zoom 1.0) with a -1x copy in CSS px:
//   <kind>-100.png: seat 0 and seat 1 clean, then seat 0 with the overlays, the four variants in columns, zoom 1.0
//   <kind>-075.png: the same at zoom 0.75
//   neighbours-100.png, -075.png: each variant with square Cottages touching its footprint on every side (seat 0,
//     "+ COTTAGES"): what a turned corner covers of a neighbour
//   measures.json and the printed table: per variant the spill of the drawn body (its solid pixels, the ground shadow
//     left out) past the footprint's west, east and south edges in world px and tiles, the share of the footprint the
//     body covers, and the share of the body a click lands on (the client's hit zone: the footprint's columns from the
//     art's top row down to the footprint's bottom edge, input.js `pick` with gl/render.js `bldgArtTop`).
// Overlays: the footprint's tiles in yellow, the neighbouring tile grid faint, the hit zone dashed in cyan.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, makePainters, half, resample, label } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/yaw-review';
const YAW = +opt('yaw', 30);
mkdirSync(outDir, { recursive: true });
const T = 64; // a tile at 2x

// ---- what to render: the three buildings, square and turned ----
const KINDS = [['bldg_kg_castle', 4, 'CASTLE'], ['bldg_ex_hall', 4, 'DATA CENTER'], ['bldg_kg_cottage', 2, 'COTTAGE']];
const TURNS = [{ yaw: YAW }, { yaw: -YAW }, { yaw: YAW, scale: 'fit' }];
const t0 = Date.now();
const sprites = await render3d('^bldg_(kg_castle|ex_hall|kg_cottage)', { polish: true, turns: TURNS });
console.log(`rendered ${sprites.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makePainters(sprites, sprites.tints); P.setShadow(1.45); // (the game's own seat tints; the ground shadow firmed on grass as the other pictures do)
/** The four variants of a building: [label, sprite name]. */
function variants(base) {
  const fit = sprites.find(s => s.name.startsWith(`${base}@y${YAW}s`) && !s.name.endsWith('_m') && s.name !== `${base}@y${YAW}s1.00`) ?? P.get(`${base}@y${YAW}s1.00`); // (a building that fits turned as it is: its fit is the turn itself)
  return [['SQUARE', base], [`YAW +${YAW}`, `${base}@y${YAW}s1.00`], [`YAW -${YAW}`, `${base}@y-${YAW}s1.00`], [`YAW +${YAW} SCALED ${fit.name.slice(fit.name.lastIndexOf('s') + 1)}`, fit.name]];
}

// ---- the ground: the game's grass tiles on the dual grid (retheme-polish-ground.mjs's layout) ----
const tiles = {}; const getTile = (m, v) => tiles[`${m}_${v}`] ??= tile(m, v);
function groundVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > 0.35) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function grass(c, seed) {
  const rnd = mulberry(seed * 7 + 3);
  for (let j = -1; j < Math.ceil(c.h / T) + 1; j++) for (let i = -1; i < Math.ceil(c.w / T) + 1; i++) {
    const t = getTile(0, groundVariant(rnd(), i, j, seed)), x0 = i * T + T / 2, y0 = j * T + T / 2;
    for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), ((py) * c.w + px) * 4); } }
  }
}

// ---- measures: the drawn body against the footprint and the client's hit zone ----
const solid = (d, i) => d[i + 3] === 255 && (d[i] || d[i + 1] || d[i + 2]); // (the finish's ground shadow is black at alpha 150; the contact shadow soft)
/** The footprint spans [-n*T/2, n*T/2) about the anchor in 2x px; the hit zone is its columns from the sprite's top row
 *  down to its bottom edge (the client: the footprint rect, or above it within its columns down from the art's top). */
function measure(name, n) {
  const s = P.get(name), { w, h, data } = s.img, ax = s.anchor.x * w, ay = s.anchor.y * h, F = n * T / 2;
  let x0 = w, x1 = -1, y1 = -1, body = 0, hit = 0; const inFoot = new Uint8Array(n * T * n * T);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(data, (y * w + x) * 4)) continue;
    body++; const rx = x - ax, ry = y - ay;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y;
    if (rx >= -F && rx < F && ry < F) hit++;
    if (rx >= -F && rx < F && ry >= -F && ry < F) inFoot[Math.floor(ry + F) * n * T + Math.floor(rx + F)] = 1;
  }
  const px = (v) => +(v / 2).toFixed(1); // 2x px -> world px
  return { spillW: px(Math.max(0, -F - (x0 - ax))), spillE: px(Math.max(0, x1 + 1 - ax - F)), spillS: px(Math.max(0, y1 + 1 - ay - F)), footprint: +(inFoot.reduce((a, b) => a + b, 0) / inFoot.length).toFixed(3), clickable: +(hit / body).toFixed(3) };
}
const measures = {};
console.log('variant                              spill W   E   S (world px; a tile is 32)   footprint covered   body clickable');
for (const [base, n, title] of KINDS) for (const [lbl, name] of variants(base)) {
  const m = measures[name] = measure(name, n);
  console.log(`  ${(title + ' ' + lbl).padEnd(36)} ${String(m.spillW).padStart(5)} ${String(m.spillE).padStart(5)} ${String(m.spillS).padStart(5)}${' '.repeat(28)}${(m.footprint * 100).toFixed(0).padStart(4)}%${' '.repeat(14)}${(m.clickable * 100).toFixed(0).padStart(4)}%`);
}
writeFileSync(join(outDir, 'measures.json'), JSON.stringify(measures, null, 1));

// ---- the overlays ----
const put = (c, x, y, rgb, a = 1) => { if (x < 0 || y < 0 || x >= c.w || y >= c.h) return; const i = (y * c.w + x) * 4; for (let k = 0; k < 3; k++) c.data[i + k] = c.data[i + k] * (1 - a) + rgb[k] * a; };
function rect(c, x0, y0, x1, y1, rgb, a = 1, dash = 0) {
  for (let x = x0; x < x1; x++) if (!dash || Math.floor(x / dash) % 2 === 0) for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) put(c, x, y, rgb, a);
  for (let y = y0; y < y1; y++) if (!dash || Math.floor(y / dash) % 2 === 0) for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) put(c, x, y, rgb, a);
}
const YELLOW = [255, 222, 70], CYAN = [70, 230, 255], GRID = [255, 255, 255];
/** The tile grid faint over the whole panel, the footprint's tiles in yellow, the hit zone dashed in cyan. */
function overlays(c, { tx, ty, n, name }) {
  for (let x = 0; x < c.w; x += T) for (let y = 0; y < c.h; y++) put(c, x, y, GRID, 0.22);
  for (let y = 0; y < c.h; y += T) for (let x = 0; x < c.w; x++) put(c, x, y, GRID, 0.22);
  rect(c, tx * T, ty * T, (tx + n) * T, (ty + n) * T, YELLOW);
  const s = P.get(name), top = Math.round((ty + n / 2) * T - s.anchor.y * s.img.h);
  rect(c, tx * T, top, (tx + n) * T, (ty + n) * T, CYAN, 1, 6);
}

// ---- panels: a building (and neighbours) on grass in a panel of tw x th tiles, buildings sorted by their bottom row ----
/** `list`: [{ name, tx, ty, n, seat }]. */
function panel(tw, th, list, seed, over = null) {
  const c = canvas(tw * T, th * T); grass(c, seed);
  for (const b of list.slice().sort((a, b) => (a.ty + a.n) - (b.ty + b.n))) P.draw(c, P.get(b.name), (b.tx + b.n / 2) * T, (b.ty + b.n / 2) * T, b.seat);
  if (over) overlays(c, over);
  return c;
}
const paste = (dst, src, x, y) => { for (let j = 0; j < src.h; j++) { if (y + j >= dst.h) break; const w = Math.min(src.w, dst.w - x); if (w > 0) dst.data.set(src.data.subarray(j * src.w * 4, (j * src.w + w) * 4), ((y + j) * dst.w + x) * 4); } };
/** Panels in a row, a label on each. */
function row(panels, texts) {
  const c = canvas(panels.reduce((a, p) => a + p.w, 0), Math.max(...panels.map(p => p.h))); let x = 0;
  panels.forEach((p, k) => { paste(c, p, x, 0); label(c, texts[k], x + 6, 6, 2); x += p.w; });
  return c;
}
const stack = (rows) => { const c = canvas(Math.max(...rows.map(r => r.w)), rows.reduce((a, r) => a + r.h, 0)); let y = 0; for (const r of rows) { paste(c, r, 0, y); y += r.h; } return c; };
const save = (name, c) => { writeFileSync(join(outDir, `${name}.png`), encodePNG(c)); writeFileSync(join(outDir, `${name}-1x.png`), encodePNG(half(c))); };
const metrics = (name) => { const m = measures[name]; return `SPILL W${m.spillW} E${m.spillE} S${m.spillS}  FOOT ${(m.footprint * 100).toFixed(0)}%  CLICK ${(m.clickable * 100).toFixed(0)}%`; };

// ---- each building: seat 0 and seat 1 clean, seat 0 with the overlays; at zoom 1.0 and 0.75 ----
for (const [base, n, title] of KINDS) {
  const vs = variants(base), tw = n === 4 ? 9 : 7, th = n === 4 ? 12 : 6, tx = n === 4 ? 2 : 2, ty = n === 4 ? 5 : 2; // (the Cottage's panels wide enough for their labels)
  const rows = [];
  for (const [seat, over] of [[0, false], [1, false], [0, true]]) {
    rows.push(row(vs.map(([, name]) => panel(tw, th, [{ name, tx, ty, n, seat }], 3 + n + seat, over ? { tx, ty, n, name } : null)),
      vs.map(([lbl, name], k) => over ? (k ? metrics(name) : `${title}  ${lbl}  FOOTPRINT, HIT ZONE`) : `${title}  ${lbl}  SEAT ${seat}`)));
  }
  const big = stack(rows);
  save(`${base.slice(5)}-100`, big);
  const z = resample(big, 0.75); label(z, 'ZOOM 0.75', 6, z.h - 24, 2); save(`${base.slice(5)}-075`, z);
}

// ---- neighbours: each variant with square Cottages touching its footprint west, east, north and south (seat 0) ----
{
  const C = 'bldg_kg_cottage', rows = [];
  for (const [base, n, title] of KINDS) {
    const tw = n + 6, th = n + 8, tx = 3, ty = 5; // (two tiles of Cottage each side, sky above)
    const nb = (dx, dy) => ({ name: C, tx: tx + dx, ty: ty + dy, n: 2, seat: 0 });
    const vs = variants(base);
    rows.push(row(vs.map(([, name]) => panel(tw, th, [{ name, tx, ty, n, seat: 0 }, nb(-2, n / 2 - 1), nb(n, n / 2 - 1), nb(n / 2 - 1, -2), nb(n / 2 - 1, n)], 17 + n, { tx, ty, n, name })),
      vs.map(([lbl]) => `${title}  ${lbl}  + COTTAGES`)));
  }
  const big = stack(rows);
  save('neighbours-100', big);
  const z = resample(big, 0.75); label(z, 'ZOOM 0.75', 6, z.h - 24, 2); save('neighbours-075', z);
}
console.log('yaw pictures ->', outDir);
