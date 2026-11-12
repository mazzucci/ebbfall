// A2, the two hired fighters go melee (tools/render3d/expedition-units.js `mercenary` -> the Sellsword with a light
// sword, `veteran` -> the Bruiser with a big shield and an axe; 2026-11-11): node tools/art/retheme-a2.mjs [outdir] [--save-old]
// Renders in the approved look (the polish at the game's 40-degree camera and 420 sun) on the real countryside grass
// tiles (terrain3.js), the game's seat colors (seat 0 blue, seat 1 magenta), and writes to <outdir> (default target/a2):
//   --save-old       first, before the model changes: renders today's Mercenary and Veteran alone and keeps them in <outdir>/old.json
//   models-2x.png    a phone at zoom 1.0 (2x device px; models-1x.png the CSS-px copy, models-grey.png in greyscale): per
//                    seat, a row per unit: today's model E S W N, the new one E S W N, then the Guard E S beside them
//   models-075.png   the same at zoom 0.75 (+ -1x)
//   closeups-4x.png  today's against the new at 4x (nearest-neighbour from 2x), facing E S W N, both units, both seats
//   crowd-100.png    the two sides meeting at the sim's spacing: Guards and Archers (seat 0) against Sellswords,
//                    Bruisers and Marines (seat 1), zoom 1.0 (+ -1x)
//   crowd-075.png    the same crowd at zoom 0.75 (+ -1x)
// Prints each kind's team share (mask px over solid px, facing 0) and its size at zoom 1.0 (CSS px).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, half, resample, crop, paste, grey, meanValue, label, makeScene } from './retheme-scene.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const argv = process.argv.slice(2);
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/a2';
mkdirSync(outDir, { recursive: true });
const OLD = join(outDir, 'old.json');
const OLD_FILTER = '^ex_(mercenary|veteran)_\\d+_[01]$';
const pack = (s) => ({ ...s, img: undefined, w: s.img.w, h: s.img.h, data: Buffer.from(s.img.data).toString('base64') });
const unpack = (s) => ({ ...s, w: undefined, h: undefined, data: undefined, img: { w: s.w, h: s.h, data: new Uint8ClampedArray(Buffer.from(s.data, 'base64')) } });

if (argv.includes('--save-old')) {
  const old = await render3d(OLD_FILTER, { polish: true });
  writeFileSync(OLD, JSON.stringify({ tints: old.tints, sprites: old.map(pack) }));
  console.log(`kept today's Mercenary and Veteran (${old.length} sprites) in ${OLD}`);
  process.exit(0);
}
if (!existsSync(OLD)) throw new Error(`${OLD} missing: run with --save-old before changing the models`);
const oldSprites = JSON.parse(readFileSync(OLD, 'utf8')).sprites.map(unpack).map(s => ({ ...s, name: s.name.replace(/^ex_/, 'old_'), anim: s.anim && s.anim.replace(/^ex_/, 'old_') }));

const T = 64, W = 1688, H = 780;
const DIRS = { E: 0, S: 4, W: 8, N: 12 };
const FILTER = `${OLD_FILTER}|^kg_(guard|archer)_(0|1|2|4|8|12|14|15)_[01]$|^ex_marine_(0|4|6|7|8|9|10|12)_[01]$`;
const t0 = Date.now();
const fresh = await render3d(FILTER, { polish: true });
console.log(`rendered ${fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makeScene([...oldSprites, ...fresh], fresh.tints); // (the game's own seat colors)

// ---- the ground: the countryside's grass tiles, picked as the client picks them ----
const tiles = {}; const getTile = (v) => tiles[v] ??= tile(0, v);
function grassVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > 0.35) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function grass(c, seed) {
  const rnd = mulberry(seed * 7 + 3), tw = Math.ceil(c.w / T) + 1, th = Math.ceil(c.h / T) + 1;
  for (let j = -1; j < th; j++) for (let i = -1; i < tw; i++) {
    const t = getTile(grassVariant(rnd(), i, j, seed)), x0 = i * T + T / 2, y0 = j * T + T / 2;
    for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), (py * c.w + px) * 4); } }
  }
}
const save = (name, c) => writeFileSync(join(outDir, name), encodePNG(c));
function scale2(c) { const o = canvas(c.w * 2, c.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y >> 1) * c.w + (x >> 1)) * 4, ((y >> 1) * c.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4); return o; }
const DARK = (c) => { for (let i = 0; i < c.data.length; i += 4) c.data.set([30, 30, 30, 255], i); return c; };

// ---- the measures ----
/** Whether a sprite's opaque pixels touch its cell's edge (the model outgrew its r/h in retheme.js). */
function clipped(name) {
  const { w, h, data } = P.get(name).img, solid = (x, y) => data[(y * w + x) * 4 + 3] === 255;
  for (let x = 0; x < w; x++) if (solid(x, 0) || solid(x, h - 1)) return true;
  for (let y = 0; y < h; y++) if (solid(0, y) || solid(w - 1, y)) return true;
  return false;
}
console.log('team share (mask px over solid px) and size at zoom 1.0 (CSS px):');
for (const name of ['old_mercenary_0_0', 'ex_mercenary_0_0', 'ex_mercenary_4_0', 'ex_mercenary_8_0', 'ex_mercenary_12_0', 'old_veteran_0_0', 'ex_veteran_0_0', 'ex_veteran_4_0', 'ex_veteran_8_0', 'ex_veteran_12_0', 'kg_guard_0_0', 'ex_marine_0_0']) {
  const sh = P.share(name), [w, h] = P.size(name);
  console.log(`  ${name.padEnd(18)} team ${sh.toFixed(3)}${sh < 0.12 ? '  BELOW THE FLOOR' : ''}   ${w} x ${h}${clipped(name) ? '  CLIPPED BY ITS CELL' : ''}`);
}
for (const s of fresh) if (/^ex_(mercenary|veteran)_\d+_[01]$/.test(s.name) && clipped(s.name)) console.log(`  ${s.name} is clipped by its cell`);

// ---- the models: per seat, a row per unit: old E S W N, new E S W N, Guard E S ----
const BW = 2250, BH = 1300;
function row(unit, seat, y) {
  const list = [], step = 118; let x = 230;
  for (const kind of [`old_${unit}`, `ex_${unit}`]) for (const d of ['E', 'S', 'W', 'N']) { list.push([`${kind}_${DIRS[d]}_0`, x, y, seat]); x += step; }
  x += 50;
  for (const d of ['E', 'S']) { list.push([`kg_guard_${DIRS[d]}_0`, x, y, seat]); x += step; }
  return list;
}
{
  const b = canvas(BW, BH); grass(b, 4242);
  const rows = [['mercenary', 0, 330], ['veteran', 0, 560], ['mercenary', 1, 800], ['veteran', 1, 1030]];
  P.place(b, rows.flatMap(([u, s, y]) => row(u, s, y)));
  const MH = 1040, z100 = crop(b, (BW - W) / 2, (BH - MH) / 2, W, MH);
  save('models-grey.png', grey(z100));
  label(z100, `SEAT 0 (TOP TWO ROWS), SEAT 1: TODAY'S E S W N | THE NEW ONE E S W N | THE GUARD E, S. SELLSWORD, THEN BRUISER. ZOOM 1.0  GROUND ${meanValue(z100, 0, MH).toFixed(2)}`, 12, 12, 2);
  save('models-2x.png', z100); save('models-1x.png', half(z100));
  const r = resample(b, 0.75), MH75 = Math.floor(MH * 0.75), z075 = crop(r, Math.floor((r.w - W) / 2), Math.floor((r.h - MH75) / 2), W, MH75); // (whole offsets: a half row shifts the crop by half its width)
  label(z075, 'THE SAME AT ZOOM 0.75', 12, 12, 2);
  save('models-075.png', z075); save('models-075-1x.png', half(z075));
}

// ---- the close-ups: old against new at 4x, E S W N, both units, both seats ----
{
  const CW = 150, CH = 180, cols = 8, out = DARK(canvas(cols * (CW * 2 + 6), 4 * (CH * 2 + 6) + 40));
  [['mercenary', 0], ['mercenary', 1], ['veteran', 0], ['veteran', 1]].forEach(([unit, seat], rowN) => {
    let k = 0;
    for (const kind of [`old_${unit}`, `ex_${unit}`]) for (const d of ['E', 'S', 'W', 'N']) {
      const c = canvas(CW, CH); grass(c, 9 + k + rowN * 8); P.draw(c, `${kind}_${DIRS[d]}_0`, CW / 2, CH * 0.72, seat);
      paste(out, scale2(c), k * (CW * 2 + 6), rowN * (CH * 2 + 6)); k++;
    }
  });
  label(out, 'TODAY\'S E S W N (LEFT) AGAINST THE NEW ONE E S W N, AT 4X: SELLSWORD SEAT 0, SEAT 1; BRUISER SEAT 0, SEAT 1', 6, 4 * (CH * 2 + 6) + 8, 3);
  save('closeups-4x.png', out);
}

// ---- the crowd: the two sides meeting at the sim's spacing, the melee at the center ----
function crowd(cx, cy) {
  const list = [], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  const side = (sd, kinds, dirs, sign, seat) => kinds.forEach((kind, k) => { const col = Math.floor(k / 4), r = k % 4; list.push([`${sd}_${kind}_${dirs[k % dirs.length]}_${k % 2}`, cx + sign * (12 + col * 50) + jit(k), cy - 90 + r * 60 + jit(k + 5) + (col % 2) * 20, seat]); }); // (the front columns mesh at the center: the melee)
  side('kg', ['guard', 'guard', 'guard', 'guard', 'archer', 'guard', 'archer', 'guard', 'archer', 'archer', 'guard', 'archer'], [0, 1, 15, 2, 14], -1, 0);
  side('ex', ['veteran', 'mercenary', 'mercenary', 'veteran', 'mercenary', 'marine', 'veteran', 'mercenary', 'marine', 'mercenary', 'marine', 'veteran'], [8, 9, 7, 10, 6], 1, 1);
  return list;
}
{
  const b = canvas(BW, BH); grass(b, 77);
  P.place(b, crowd(BW / 2, BH / 2));
  const z100 = crop(b, (BW - W) / 2, (BH - H) / 2, W, H);
  label(z100, 'THE CROWD: GUARDS AND ARCHERS (SEAT 0, LEFT) MEET SELLSWORDS, BRUISERS AND MARINES (SEAT 1, RIGHT) AT THE SIM\'S SPACING. ZOOM 1.0', 12, 12, 2);
  save('crowd-100.png', z100); save('crowd-100-1x.png', half(z100));
  const r = resample(b, 0.75), z075 = crop(r, Math.floor((r.w - W) / 2), Math.floor((r.h - H) / 2), W, H);
  label(z075, 'THE SAME CROWD AT ZOOM 0.75', 12, 12, 2);
  save('crowd-075.png', z075); save('crowd-075-1x.png', half(z075));
}
console.log('A2 pictures ->', outDir);
