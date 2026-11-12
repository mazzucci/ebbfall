// The Archer's redraw pictures (tools/render3d/kingdom-units.js `archer`; 2026-11-11): node tools/art/retheme-archer.mjs [outdir] [--save-old]
// Stelian: the Archer read like the Villager (both seemed to carry something); the redraw is Robin Hood's silhouette, a
// pointed team hood with a short cape and a tall dark longbow held out from the body. Renders the kingdom's figures in
// the approved look (the polish at the game's 40-degree camera and 420 sun) on the real countryside grass tiles
// (terrain3.js), the game's seat colors (seat 0 blue, seat 1 magenta), and writes to <outdir> (default target/archer-review):
//   --save-old      first, before the model changes: renders today's Archer alone and keeps it in <outdir>/old.json
//   lineup-100.png  a phone at zoom 1.0 (2x device px; -1x the CSS-px copy, -grey in greyscale): per seat a row of
//                   the old Archer E S W N, the new one E S W N, then the Villager, Guard and Knight (E and S)
//   lineup-075.png  the same at zoom 0.75 (+ -1x)
//   closeups-4x.png old against new at 4x (nearest-neighbour from 2x), facing E S W N, both seats
//   crowd-100.png   each seat's blob at the sim's spacing: Villagers, the new Archers, Guards, a Knight, zoom 1.0 (+ -1x)
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
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/archer-review';
mkdirSync(outDir, { recursive: true });
const OLD = join(outDir, 'old.json');
const pack = (s) => ({ ...s, img: undefined, w: s.img.w, h: s.img.h, data: Buffer.from(s.img.data).toString('base64') });
const unpack = (s) => ({ ...s, w: undefined, h: undefined, data: undefined, img: { w: s.w, h: s.h, data: new Uint8ClampedArray(Buffer.from(s.data, 'base64')) } });

if (argv.includes('--save-old')) {
  const old = await render3d('^kg_archer_\\d+_[01]$', { polish: true });
  writeFileSync(OLD, JSON.stringify({ tints: old.tints, sprites: old.map(pack) }));
  console.log(`kept today's Archer (${old.length} sprites) in ${OLD}`);
  process.exit(0);
}
if (!existsSync(OLD)) throw new Error(`${OLD} missing: run with --save-old before changing the model`);
const oldSprites = JSON.parse(readFileSync(OLD, 'utf8')).sprites.map(unpack).map(s => ({ ...s, name: s.name.replace(/^kg_archer_/, 'old_archer_'), anim: s.anim && s.anim.replace(/^kg_archer_/, 'old_archer_') }));

const T = 64, W = 1688, H = 780;
const DIRS = { E: 0, S: 4, W: 8, N: 12 };
const FILTER = '^kg_archer_\\d+_[01]$|^kg_(villager|guard|knight)_(0|4|8|12|1|15|2|14)_[01]$';
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
console.log('team share (facing 0, frame 0) and size at zoom 1.0 (CSS px):');
for (const name of ['old_archer_0_0', 'kg_archer_0_0', 'kg_archer_4_0', 'kg_archer_8_0', 'kg_archer_12_0', 'kg_villager_0_0', 'kg_guard_0_0', 'kg_knight_0_0']) {
  const sh = P.share(name), [w, h] = P.size(name);
  console.log(`  ${name.padEnd(18)} team ${sh.toFixed(3)}${sh < 0.12 ? '  BELOW THE FLOOR' : ''}   ${w} x ${h}`);
}

// ---- the line-up: per seat, old E S W N, new E S W N, Villager E S, Guard E S, Knight E S ----
const BW = 2250, BH = 1040;
function lineup(seat, y) {
  const list = [], step = 112; let x = 240;
  for (const kind of ['old_archer', 'kg_archer']) for (const d of ['E', 'S', 'W', 'N']) { list.push([`${kind}_${DIRS[d]}_0`, x, y, seat]); x += step; }
  x += 40;
  for (const kind of ['villager', 'guard', 'knight']) for (const d of ['E', 'S']) { list.push([`kg_${kind}_${DIRS[d]}_0`, x, y, seat]); x += step + (kind === 'knight' ? 30 : 0); }
  return list;
}
{
  const b = canvas(BW, BH); grass(b, 4242);
  P.place(b, [...lineup(0, 380), ...lineup(1, 700)]);
  const z100 = crop(b, (BW - W) / 2, (BH - H) / 2, W, H);
  save('lineup-100-grey.png', grey(z100));
  label(z100, `SEAT 0 (TOP), SEAT 1: OLD ARCHER E S W N | NEW ARCHER E S W N | VILLAGER, GUARD, KNIGHT (E, S). ZOOM 1.0  GROUND ${meanValue(z100, 0, H).toFixed(2)}`, 12, 12, 2);
  save('lineup-100.png', z100); save('lineup-100-1x.png', half(z100));
  const r = resample(b, 0.75), z075 = crop(r, (r.w - W) / 2, (r.h - H) / 2, W, H);
  label(z075, 'THE SAME AT ZOOM 0.75', 12, 12, 2);
  save('lineup-075.png', z075); save('lineup-075-1x.png', half(z075));
}

// ---- the close-ups: old against new at 4x, E S W N, both seats ----
{
  const CW = 150, CH = 170, cols = 8, out = DARK(canvas(cols * (CW * 2 + 6), 2 * (CH * 2 + 6) + 40));
  [0, 1].forEach((seat, row) => {
    let k = 0;
    for (const kind of ['old_archer', 'kg_archer']) for (const d of ['E', 'S', 'W', 'N']) {
      const c = canvas(CW, CH); grass(c, 9 + k); P.draw(c, `${kind}_${DIRS[d]}_0`, CW / 2, CH * 0.72, seat);
      paste(out, scale2(c), k * (CW * 2 + 6), row * (CH * 2 + 6)); k++;
    }
  });
  label(out, 'OLD ARCHER E S W N (LEFT) AGAINST THE NEW ONE E S W N, AT 4X; SEAT 0 ABOVE, SEAT 1 BELOW', 6, 2 * (CH * 2 + 6) + 8, 3);
  save('closeups-4x.png', out);
}

// ---- the crowd: each seat's blob at the sim's spacing, Villagers among Archers ----
function blob(cx, cy, seat) {
  const kinds = ['villager', 'archer', 'guard', 'archer', 'villager', 'knight', 'archer', 'guard', 'villager', 'archer', 'guard', 'villager'], dirs = [0, 1, 15, 2, 14, 4, 12], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  return kinds.map((kind, k) => { const col = Math.floor(k / 4), row = k % 4; return [`kg_${kind}_${dirs[k % dirs.length]}_${k % 2}`, cx + col * 52 + jit(k), cy - 90 + row * 60 + jit(k + 5) + (col % 2) * 20, seat]; });
}
{
  const b = canvas(BW, BH); grass(b, 77);
  P.place(b, [...blob(700, 520, 0), ...blob(1350, 520, 1)]);
  const z100 = crop(b, (BW - W) / 2, (BH - H) / 2, W, H);
  label(z100, 'THE CROWD: VILLAGERS, THE NEW ARCHERS, GUARDS, A KNIGHT AT THE SIM\'S SPACING; SEAT 0 LEFT, SEAT 1 RIGHT. ZOOM 1.0', 12, 12, 2);
  save('crowd-100.png', z100); save('crowd-100-1x.png', half(z100));
}
console.log('archer pictures ->', outDir);
