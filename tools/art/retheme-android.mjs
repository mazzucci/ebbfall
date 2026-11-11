// The Android (2026-11-11): an alternative model for the Expedition's elite (the `umbra` slot, renamed the Android),
// a robot beside the current Marine, pictures only, for Stelian's pick. One sheet at 2x with a -1x copy in CSS px and
// a -075 copy at zoom 0.75, on the game's grass tiles in the seats' colours, into target/android (or [outdir]):
//   node tools/art/retheme-android.mjs [outdir] [--fresh]   android.png: the Android, the Marine, the Sellsword and the
//     Bot side by side, each facing the camera and east, seat 0 above and seat 1 below; the table: height, width,
//     length, team share and brightness, measured as retheme-a1.mjs measures its units.json (android.json)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, makePainters, seatTints, half, resample, label } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const args = process.argv.slice(2), outDir = args.find(a => !a.startsWith('--')) ?? 'target/android';
mkdirSync(outDir, { recursive: true });
const T = 64; // a tile at 2x
const cv = (w, h) => canvas(Math.round(w), Math.round(h));
/** render3d, cached under <outdir>/cache/<key>.json (--fresh renders anew). */
async function rendered(key, filter, opts) {
  const dir = join(outDir, 'cache'), f = join(dir, `${key}.json`);
  if (!args.includes('--fresh') && existsSync(f)) { const { sprites, tints } = JSON.parse(readFileSync(f, 'utf8')); return Object.assign(sprites.map(({ data, ...s }) => ({ ...s, img: { ...s.img, data: new Uint8ClampedArray(Buffer.from(data, 'base64')) } })), { tints }); }
  const out = await render3d(filter, opts); mkdirSync(dir, { recursive: true });
  writeFileSync(f, JSON.stringify({ tints: out.tints, sprites: out.map(({ img, ...s }) => ({ ...s, img: { w: img.w, h: img.h }, data: Buffer.from(img.data).toString('base64') })) }));
  return out;
}

// ---- the ground: the game's grass tiles (retheme-a1.mjs's) ----
const tiles = {}; const getTile = (m, v) => tiles[`${m}_${v}`] ??= tile(m, v);
function groundVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > 0.35) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function grass(c, seed) {
  const rnd = mulberry(seed * 7 + 3);
  for (let j = -1; j < Math.ceil(c.h / T) + 1; j++) for (let i = -1; i < Math.ceil(c.w / T) + 1; i++) {
    const t = getTile(0, groundVariant(rnd(), i, j, seed)), x0 = i * T + T / 2, y0 = j * T + T / 2;
    for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), ((py) * c.w + px) * 4); } }
  }
}
/** Saved at 2x, 1x (CSS px) and at zoom 0.75 (CSS px, the phone's). */
const save = (name, c) => { writeFileSync(join(outDir, `${name}.png`), encodePNG(c)); writeFileSync(join(outDir, `${name}-1x.png`), encodePNG(half(c))); writeFileSync(join(outDir, `${name}-075.png`), encodePNG(half(resample(c, 0.75)))); };

// ---- the measures (retheme-a1.mjs's units.json) ----
/** The opaque box of a sprite without its baked shadow (alpha 255 and not pure black), CSS px at zoom 1. */
const box = (s) => { const { w, h, data } = s.img; let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (data[i + 3] === 255 && (data[i] | data[i + 1] | data[i + 2])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return x1 < 0 ? null : { w: (x1 - x0 + 1) / 2, h: (y1 - y0 + 1) / 2 }; };
/** Mean luminance (0..1) of a sprite's solid, non-shadow pixels. */
function brightness(s) { const { data } = s.img; let n = 0, t = 0; for (let i = 0; i < data.length; i += 4) { if (data[i + 3] !== 255 || !(data[i] | data[i + 1] | data[i + 2])) continue; n++; t += (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 255; } return t / n; }
/** The cyan light's share of a sprite's solid pixels (retheme-a1.mjs's). */
function cyan(s) { const { data } = s.img; let n = 0, c = 0; for (let i = 0; i < data.length; i += 4) { if (data[i + 3] !== 255 || !(data[i] | data[i + 1] | data[i + 2])) continue; n++; if (data[i + 2] > 170 && data[i + 1] > 150 && data[i] < 0.75 * data[i + 2]) c++; } return c / n; }
function clipped(s) { const { w, h, data } = s.img; for (let x = 0; x < w; x++) if (data[x * 4 + 3] || data[((h - 1) * w + x) * 4 + 3]) return true; for (let y = 0; y < h; y++) if (data[y * w * 4 + 3] || data[(y * w + w - 1) * 4 + 3]) return true; return false; }

const COLS = [['android', 'ANDROID (NEW)'], ['marine', 'MARINE (CURRENT)'], ['mercenary', 'SELLSWORD'], ['bot', 'BOT']];
const DIRS = [0, 4, 8, 12]; // (east, the camera, west, away: the sheet shows the first two; the others and frame 1 are rendered for the clipping check and the maker's own look)
const U = await rendered('units', `^ex_(${COLS.map(c => c[0]).join('|')})_(${DIRS.join('|')})_(0|1)$`, { polish: true });
const P = makePainters(U, seatTints(U.tints));

// the sheet: both seats, each unit facing the camera (4) and east (0), labelled
{
  const cw = 5 * T, rh = 6 * T, c = cv(cw * COLS.length, rh * 2); grass(c, 5);
  [0, 1].forEach(seat => COLS.forEach(([k, txt], i) => {
    const y = Math.round(seat * rh + rh - 1.3 * T);
    P.draw(c, P.get(`ex_${k}_4_0`), i * cw + cw * 0.34, y, seat); P.draw(c, P.get(`ex_${k}_0_0`), i * cw + cw * 0.72, y, seat);
    label(c, `${txt} S${seat}`, i * cw + 4, seat * rh + rh - 22, 2);
  }));
  label(c, 'THE ANDROID (NEW) BESIDE THE CURRENT MARINE, THE SELLSWORD AND THE BOT, EACH FACING THE CAMERA AND EAST. SEAT 0 ABOVE, SEAT 1 BELOW. 1X', 4, 4, 2);
  save('android', c);
}
// the walk: the two frames at the four facings, seat 0 (the maker's check that the frames match the Marine's)
{
  const cw = 3 * T, rh = 5 * T, c = cv(cw * DIRS.length * 2, rh * 2); grass(c, 9);
  [['android', 0], ['marine', 1]].forEach(([k, row]) => DIRS.forEach((d, i) => [0, 1].forEach(f => { const x = (i * 2 + f) * cw + cw / 2, y = Math.round(row * rh + rh - 1.2 * T); P.draw(c, P.get(`ex_${k}_${d}_${f}`), x, y, 0); label(c, `${k === 'android' ? 'AND' : 'MAR'} D${d} F${f}`, (i * 2 + f) * cw + 4, row * rh + rh - 22, 2); })));
  label(c, 'THE WALK: THE ANDROID (ABOVE) AND THE MARINE (BELOW) AT FOUR FACINGS, FRAMES 0 AND 1. SEAT 0. 1X', 4, 4, 2);
  save('walk', c);
}

// the table: as retheme-a1.mjs's units.json (height: the box facing east; width: facing the camera; length: facing east;
// team share and brightness facing the camera), plus the cyan share and whether any frame clips its cell
const rows = COLS.map(([k, name]) => {
  const s4 = P.get(`ex_${k}_4_0`), b4 = box(s4), b0 = box(P.get(`ex_${k}_0_0`));
  const clip = DIRS.some(d => [0, 1].some(f => clipped(P.get(`ex_${k}_${d}_${f}`))));
  return { kind: k, name, height: b0.h, width: b4.w, length: b0.w, team: P.share(`ex_${k}_4_0`), brightness: +brightness(s4).toFixed(2), cyan: +(cyan(s4) * 100).toFixed(1), clipped: clip };
});
writeFileSync(join(outDir, 'android.json'), JSON.stringify(rows, null, 1));
console.log('\nunit                  height  width (camera)  length (east)  team    bright  cyan %   clipped');
for (const r of rows) console.log(`  ${r.name.padEnd(18)} ${String(r.height).padStart(6)}  ${String(r.width).padStart(6)}          ${String(r.length).padStart(6)}         ${String(r.team).padEnd(6)}  ${r.brightness}    ${String(r.cyan).padStart(5)}    ${r.clipped ? 'CLIPPED' : 'no'}`);
console.log('\nsheet ->', join(outDir, 'android-1x.png'), '(also android.png at 2x, android-075.png at zoom 0.75; walk-*.png the frames)');
