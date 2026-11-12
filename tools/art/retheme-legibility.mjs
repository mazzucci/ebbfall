// The legibility test pictures (2026-11-11; Stelian: the Archer's bow and the other units' props are hard to see at
// zoom 1.0: near-black props on dark grass and on the unit's own near-black shadow). Three columns of the same units:
// TODAY (the atlas as it was, cached by --save-old), ADJUSTED (lighter, softer, slightly shorter unit shadows; a faint
// cool rim light from the south-east; bolder mid-toned props) and C (the adjusted set under a key light from the
// front-left, over the viewer's shoulder: the faces we see lit, the cast shadow up-screen behind the unit, a small
// contact shadow all round the feet; a picture-only variant, never the atlas's). On the real countryside grass
// (terrain3.js) in the game's seat colors. node tools/art/retheme-legibility.mjs [outdir] [--save-old]
//   --save-old          first, before any change: renders today's units and the two buildings into <outdir>/old.json
//   lineup-100.png      a row per kind (Archer, Villager, Guard, Knight; Bot, Sellsword, Marine), seat 0 left, seat 1
//                       right, each seat TODAY E S | ADJUSTED E S | C E S, zoom 1.0 (2x device px; -1x the CSS-px copy)
//   lineup-075.png      the same at zoom 0.75 (+ -1x)
//   crowd-100.png       the sim's spacing: a Kingdom crowd (seat 0, top) and an Expedition crowd (seat 1, bottom) in
//                       the three columns, zoom 1.0 (+ -1x)
//   closeups-4x.png     the Archer, Guard, Sellsword and Marine E at 4x in the three columns, both seats (the maker's check)
//   buildings-shadow.png     the Barracks and the Factory with today's shadow and with the unit shadow change (+ -1x)
//   buildings-front-light.png the same two buildings today and under the front-left key light (+ -1x)
// The shadow is baked into each sprite (scene.js's catcher, polish.js finishPolish), so every picture draws the sprite
// as the game does (no shadow multiplier: retheme-scene.mjs's 1.45 is turned off).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, half, resample, crop, paste, label, makeScene } from './retheme-scene.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const argv = process.argv.slice(2);
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/legibility';
mkdirSync(outDir, { recursive: true });
const OLD = join(outDir, 'old.json');
const pack = (s) => ({ ...s, img: undefined, w: s.img.w, h: s.img.h, data: Buffer.from(s.img.data).toString('base64') });
const unpack = (s) => ({ ...s, w: undefined, h: undefined, data: undefined, img: { w: s.w, h: s.h, data: new Uint8ClampedArray(Buffer.from(s.data, 'base64')) } });
const rename = (list, pre) => list.map(s => ({ ...s, name: `${pre}_${s.name}`, anim: s.anim && `${pre}_${s.anim}` }));

const KG = ['archer', 'villager', 'guard', 'knight'], EX = ['bot', 'mercenary', 'marine'];
const KINDS = [...KG.map(k => `kg_${k}`), ...EX.map(k => `ex_${k}`)];
const BLDGS = ['bldg_kg_barracks', 'bldg_ex_factory'];
const FILTER = `^(kg_(${KG.join('|')})|ex_(${EX.join('|')}))_(0|1|2|4|12|14|15)_0$|^(${BLDGS.join('|')})$`;
/** Variant C: the key from the front-left (south-west: west as today, but south of the model instead of north), the
 *  contact ellipse all round the feet (today's lies on the north-west sun's lee side only), its alpha a step lower. */
const FRONT = { sunDir: [-120, 90], polish: { contact: { radius: 5, squash: 0.7, hMin: 0.15, hMax: 3.5, lee: -99, alpha: 96 } } };
/** The unit shadow change applied to a building (polish.js: the units' `unitShadow` instead of the buildings' `shadow`). */
const UNIT_SHADOW = { polish: { shadow: { alpha: 110, soft: 1 } } };

if (argv.includes('--save-old')) {
  const old = await render3d(FILTER, { polish: true });
  writeFileSync(OLD, JSON.stringify({ tints: old.tints, sprites: old.map(pack) }));
  console.log(`kept today's ${old.length} sprites in ${OLD}`);
  process.exit(0);
}
if (!existsSync(OLD)) throw new Error(`${OLD} missing: run with --save-old before changing the art`);
const oldSprites = rename(JSON.parse(readFileSync(OLD, 'utf8')).sprites.map(unpack), 'old');

const t0 = Date.now();
const fresh = await render3d(FILTER, { polish: true });
const front = rename(await render3d(FILTER, { polish: FRONT.polish, sunDir: FRONT.sunDir }), 'front');
const bshadow = rename(await render3d(`^(${BLDGS.join('|')})$`, UNIT_SHADOW), 'ushadow');
console.log(`rendered ${fresh.length + front.length + bshadow.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makeScene([...oldSprites, ...fresh, ...front, ...bshadow], fresh.tints);
P.S.shadow = 1; // (the game draws the baked shadow as it is)

// ---- the ground: the countryside's grass tiles, picked as the client picks them ----
const T = 64, tiles = {}; const getTile = (v) => tiles[v] ??= tile(0, v);
function grassVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > 0.35) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function grass(c, seed) {
  const rnd = mulberry(seed * 7 + 3), tw = Math.ceil(c.w / T) + 1, th = Math.ceil(c.h / T) + 1;
  for (let j = -1; j < th; j++) for (let i = -1; i < tw; i++) {
    const t = getTile(grassVariant(rnd(), i, j, seed)), x0 = i * T + T / 2, y0 = j * T + T / 2;
    for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), (py * c.w + px) * 4); } }
  }
}
const save = (name, c) => writeFileSync(join(outDir, name), encodePNG(c));
const save2 = (name, c) => { save(`${name}.png`, c); save(`${name}-1x.png`, half(c)); };
function scale2(c) { const o = canvas(c.w * 2, c.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y >> 1) * c.w + (x >> 1)) * 4, ((y >> 1) * c.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4); return o; }
const DARK = (c) => { for (let i = 0; i < c.data.length; i += 4) c.data.set([30, 30, 30, 255], i); return c; };
/** A faint divider line down `c` at x. */
const rule = (c, x, y0, y1) => { for (let y = y0; y < y1; y++) { const i = (y * c.w + x) * 4; c.data[i] = c.data[i + 1] = c.data[i + 2] = 200; } };
const COLS = ['old', '', 'front'], colName = (k, kind) => (COLS[k] ? `${COLS[k]}_${kind}` : kind);

// ---- the measures ----
console.log('team share (facing 0) and size at zoom 1.0 (CSS px): today | adjusted | front-left');
for (const kind of KINDS) {
  const row = COLS.map(c => { const n = `${colName(COLS.indexOf(c), kind)}_0_0`, [w, h] = P.size(n); return `${P.share(n).toFixed(3)} ${w}x${h}`; });
  console.log(`  ${kind.padEnd(14)} ${row.join('  |  ')}`);
}

// ---- the line-up: a row per kind; seat 0 left, seat 1 right; per seat TODAY E S | ADJUSTED E S | C E S ----
const W = 1688, STEP = 68, ROW = 150;
{
  const b = canvas(W, 60 + KINDS.length * ROW); grass(b, 4242);
  const list = [];
  KINDS.forEach((kind, r) => {
    const y = 60 + r * ROW + 112, wide = kind === 'kg_knight' ? 14 : 0;
    [0, 1].forEach(seat => { let x = 40 + seat * (W / 2) + wide; for (let k = 0; k < 3; k++) { for (const d of [0, 4]) { list.push([`${colName(k, kind)}_${d}_0`, x, y, seat]); x += STEP + wide; } x += 14; } });
  });
  P.place(b, list);
  for (const seat of [0, 1]) for (let k = 1; k < 3; k++) rule(b, 40 + seat * (W / 2) - 20 + k * (2 * STEP + 14) + 14 * (k === 1 ? 2 : 4), 50, b.h); // (the dividers: rough, past the Knight's extra room)
  label(b, 'PER SEAT: TODAY E S | ADJUSTED E S | C: FRONT-LEFT KEY E S.  ROWS: ARCHER, VILLAGER, GUARD, KNIGHT, BOT, SELLSWORD, MARINE.  SEAT 0 LEFT, SEAT 1 RIGHT.  ZOOM 1.0', 12, 12, 2);
  save2('lineup-100', b);
  const r = resample(b, 0.75); label(r, 'THE SAME AT ZOOM 0.75', 12, 12, 2); save2('lineup-075', r);
}

// ---- the crowd: each people's blob at the sim's spacing, in the three columns ----
function blob(kinds, cx, cy, seat, col) {
  const dirs = [0, 1, 15, 2, 14, 4, 12], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  return kinds.map((kind, k) => { const c = Math.floor(k / 4), row = k % 4; return [`${colName(col, kind)}_${dirs[k % dirs.length]}_0`, cx + c * 52 + jit(k), cy - 90 + row * 60 + jit(k + 5) + (c % 2) * 20, seat]; });
}
{
  const KGC = ['villager', 'archer', 'guard', 'archer', 'villager', 'knight', 'archer', 'guard', 'villager', 'archer', 'guard', 'villager'].map(k => `kg_${k}`);
  const EXC = ['bot', 'mercenary', 'marine', 'mercenary', 'bot', 'marine', 'mercenary', 'bot', 'marine', 'mercenary', 'bot', 'marine'].map(k => `ex_${k}`);
  const b = canvas(W, 820); grass(b, 77);
  const list = [];
  for (let k = 0; k < 3; k++) { const cx = 220 + k * (W / 3); list.push(...blob(KGC, cx, 250, 0, k), ...blob(EXC, cx, 610, 1, k)); }
  P.place(b, list);
  for (let k = 1; k < 3; k++) rule(b, Math.round(k * W / 3), 40, b.h);
  label(b, 'THE CROWD AT THE SIM\'S SPACING: TODAY | ADJUSTED | C: FRONT-LEFT KEY.  KINGDOM SEAT 0 (TOP), EXPEDITION SEAT 1 (BOTTOM).  ZOOM 1.0', 12, 12, 2);
  save2('crowd-100', b);
}

// ---- the close-ups at 4x: the four prop carriers facing E, both seats ----
{
  const CW = 110, CH = 130, picks = ['kg_archer', 'kg_guard', 'ex_mercenary', 'ex_marine'], cols = picks.length * 3;
  const out = DARK(canvas(cols * (CW * 2 + 6), 2 * (CH * 2 + 6) + 40));
  [0, 1].forEach((seat, row) => {
    let n = 0;
    for (const kind of picks) for (let k = 0; k < 3; k++) {
      const c = canvas(CW, CH); grass(c, 9 + n); P.draw(c, `${colName(k, kind)}_0_0`, CW / 2, CH * 0.72, seat);
      paste(out, scale2(c), n * (CW * 2 + 6), row * (CH * 2 + 6)); n++;
    }
  });
  label(out, 'AT 4X, FACING E: ARCHER, GUARD, SELLSWORD, MARINE, EACH TODAY | ADJUSTED | C; SEAT 0 ABOVE, SEAT 1 BELOW', 6, 2 * (CH * 2 + 6) + 8, 3);
  save('closeups-4x.png', out);
}

// ---- the buildings: today against the unit shadow change, and today against the front-left key ----
function bldgs(file, pre, text) {
  const b = canvas(1400, 420); grass(b, 31);
  const list = [];
  BLDGS.forEach((name, i) => { const seat = i; list.push([`old_${name}`, 190 + i * 700, 250, seat], [`${pre}_${name}`, 520 + i * 700, 250, seat]); });
  P.place(b, list);
  rule(b, 700, 30, b.h);
  label(b, text, 12, 12, 2);
  save2(file, b);
}
bldgs('buildings-shadow', 'ushadow', 'BARRACKS (SEAT 0), FACTORY (SEAT 1): TODAY\'S SHADOW (LEFT OF EACH PAIR), THE UNIT SHADOW CHANGE (RIGHT). ZOOM 1.0');
bldgs('buildings-front-light', 'front', 'BARRACKS (SEAT 0), FACTORY (SEAT 1): TODAY (LEFT OF EACH PAIR), C: THE FRONT-LEFT KEY (RIGHT). ZOOM 1.0');
console.log('legibility pictures ->', outDir);
