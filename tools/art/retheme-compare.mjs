// The re-theme's slice picture (Stelian's look, then four blind testers; 2026-11-10): node tools/art/retheme-compare.mjs <outdir> [--elev=40] [--skip-today]
// Rows, each a landscape phone at 2x (1688x780), seat 0 (left) against seat 1:
//   row 0  the game's atlas kinds (since the re-theme's PR 1: its art) on the seabed: Villager, Guard, Knight, Castle against
//          Bot, Buggy, Mercenary, Data centre, a gold outcrop between (world px 1:1 at the default zoom)
//   row 1  the slice (retheme.js: the kingdom on palette B, the Expedition's one look) at the lower camera (--elev, 40
//          by default) on grass, the units drawn 1.4x: Villager, Guard, Knight, Castle against Bot, Buggy, Marine,
//          Data centre, a gold outcrop between
//   row 2  the crowd check: about twelve units a side in a fight at the sim's spacing (they overlap), at zoom 1.0
//   row 3  the same scene at the phone's default zoom, 0.75 (the PM's question: would a closer default help)
// Writes compare.png (2x), compare-1x.png (CSS px), compare-grey.png (2x, greyscale), zoom-075.png and zoom-100.png
// (the crowd at each zoom, 2x), models/<name>.png and models/<name>@2x.png (each new model alone at phone size in
// seats 0, 1 and 6 with its team share), shares.json, and prints the team shares (review.mjs's measure: mask px over
// solid px at facing 0) and each row's ground value. Reuses review.mjs's approach: terrain2.js tile() for the ground,
// render3d.mjs for the sprites, the same compositing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { canvas, SEAT0, seatTints, makePainters, ground, GRASS, half, resample, crop, simulate, grey, meanValue, label } from './retheme-paint.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/retheme';
const ELEV = +opt('elev', 40), SKIP_TODAY = argv.includes('--skip-today');
mkdirSync(join(outDir, 'models'), { recursive: true });

// ---- what to render ----
const TODAY = '^harvester_(0|1|15)_[01]$|^trooper_(0|1|15)_[01]$|^knight_1_0$|^lumen_(8|9)_0$|^scythe_(7|8|9)_[01]$|^prism_(8|9)_0$|^bldg_(core|conflux)$|^shard_[01]$';
const KG = ['villager', 'guard', 'knight'], EX = ['bot', 'buggy', 'marine'];
const RT = `^kg_(${KG.join('|')})_(0|1|15|2|14)_[01]$|^ex_(${EX.join("|")})_(8|9|7|10|6|0)_[01]$|^bldg_(kg_castle|ex_hall)$|^rt_coins$`;
const t0 = Date.now();
const today = SKIP_TODAY ? Object.assign([], { tints: null }) : await render3d(TODAY);
const fresh = await render3d(RT, { elev: ELEV });
console.log(`rendered ${today.length + fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
// Seat 0 leaves gold for royal blue (the PM, slice round 3): the picture's own override, nothing in src/ (retheme-paint.mjs seatTints).
const TINTS = seatTints(fresh.tints);
console.log(`seat 0 drawn as #${SEAT0.toString(16)} (tint #${TINTS[0].toString(16)}; the game's gold stays in src/)`);
const { get, draw, place, share: measure, sizeOf, setShadow } = makePainters([...today, ...fresh], TINTS);
// (the painters, the grass, the font and the colour checks live in retheme-paint.mjs, shared with the families' scripts)

// ---- team shares (review.mjs's measure: facing 0, frame 0) ----
const shares = {};
const share = (name) => shares[name] = measure(name);
console.log('team colour share of the solid pixels (facing 0; the floor is 0.12 for units and buildings: the PM, slice round 3; floors, not targets):');
for (const name of [...KG.map(k => `kg_${k}_0_0`), 'bldg_kg_castle', ...EX.map(k => `ex_${k}_0_0`), 'bldg_ex_hall']) { const sh = share(name); console.log(`  ${name.padEnd(18)} ${sh.toFixed(3)}${sh < 0.12 ? '  BELOW THE FLOOR' : ''}`); }
writeFileSync(join(outDir, 'shares.json'), JSON.stringify(shares, null, 1));
// each unit's size at zoom 1.0 (facing 0): the box of its opaque pixels without the ground shadow, in CSS px (atlas px / 2)
console.log('unit sizes at zoom 1.0 (facing 0; CSS px, width x height, the shadow left out):');
for (const name of [...KG.map(k => `kg_${k}_0_0`), ...EX.map(k => `ex_${k}_0_0`)]) { const [w, h] = sizeOf(name); console.log(`  ${name.padEnd(18)} ${w.toFixed(0)} x ${h.toFixed(0)}`); }

// ---- the scenes ----
const W = 1688, H = 780;
const TODAY_LIST = [
  ['bldg_core', 330, 440, 0], ['shard_0', 844, 400], ['shard_1', 900, 470], ['bldg_conflux', 1360, 440, 1],
  ['harvester_1_0', 560, 330, 0], ['harvester_0_1', 600, 380, 0], ['trooper_0_0', 640, 450, 0], ['trooper_1_1', 680, 500, 0], ['trooper_15_0', 620, 560, 0], ['knight_1_0', 700, 620, 0],
  ['lumen_8_0', 1120, 330, 1], ['lumen_9_0', 1080, 380, 1], ['scythe_8_0', 1040, 450, 1], ['scythe_7_1', 1000, 500, 1], ['scythe_9_0', 1060, 560, 1], ['prism_8_0', 1010, 620, 1], ['prism_9_0', 1100, 640, 1],
];
const SLICE_LIST = [
  ['bldg_kg_castle', 330, 440, 0], ['rt_coins', 844, 430], ['bldg_ex_hall', 1360, 440, 1],
  ['kg_villager_1_0', 560, 320, 0], ['kg_villager_0_1', 610, 380, 0], ['kg_guard_0_0', 650, 460, 0], ['kg_guard_1_1', 700, 520, 0], ['kg_guard_15_0', 620, 580, 0], ['kg_knight_0_0', 720, 650, 0], ['kg_knight_2_1', 560, 690, 0],
  ['ex_bot_8_0', 1130, 320, 1], ['ex_bot_9_1', 1080, 380, 1], ['ex_buggy_8_0', 1040, 470, 1], ['ex_buggy_7_1', 1120, 560, 1], ['ex_marine_8_0', 1000, 540, 1], ['ex_marine_9_1', 1060, 640, 1], ['ex_marine_10_0', 1150, 660, 1],
];
/** The crowd: about twelve a side meeting at the centre of a world `w` x `h` (2x px), at the sim's spacing (line
 *  units r 10-11 stand about 24 world px apart in a blob; they overlap when they press). */
function crowd(cx, cy) {
  const list = [], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  const side = (names, dirs, sign) => names.forEach((name, k) => { const col = Math.floor(k / 4), row = k % 4; list.push([`${name}_${dirs[k % dirs.length]}_${k % 2}`, cx + sign * (40 + col * 52) + jit(k), cy - 90 + row * 60 + jit(k + 5) + (col % 2) * 20, sign < 0 ? 0 : 1]); });
  side(['kg_guard', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_villager', 'kg_villager'], [0, 1, 15, 2, 14], -1);
  side(['ex_marine', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_bot', 'ex_bot'], [8, 9, 7, 10, 6], 1);
  return list;
}
const rows = [];
if (!SKIP_TODAY) rows.push({ text: 'ROW 0  TODAY: HARBOUR V VAEL, 55° CAMERA, THE SEABED', make: (c) => { ground(c, 0, H, 1); place(c, TODAY_LIST); } });
rows.push({ text: `ROW 1  THE SLICE: KINGDOM (SLATE) V EXPEDITION, UNITS 1.4X, ${ELEV}°, GRASS`, make: (c) => { ground(c, 0, H, 2, GRASS); setShadow(1.45); place(c, SLICE_LIST); setShadow(1); } });
// the crowd at zoom 1.0 is the centre of a bigger canvas; at 0.75 the whole of it scaled down (the phone's 2x screen then shows 1125x520 world px)
const BIG = canvas(2250, 1040); ground(BIG, 0, 1040, 3, GRASS); setShadow(1.45); place(BIG, crowd(1125, 520)); setShadow(1);
const z100 = crop(BIG, (2250 - W) / 2, (1040 - H) / 2, W, H), z075 = resample(BIG, 0.75);
writeFileSync(join(outDir, 'zoom-100.png'), encodePNG(z100)); writeFileSync(join(outDir, 'zoom-075.png'), encodePNG(z075));
rows.push({ text: 'ROW 2  THE CROWD: 12 A SIDE AT THE SIM\'S SPACING, ZOOM 1.0', make: (c) => c.data.set(z100.data) });
rows.push({ text: 'ROW 3  THE SAME CROWD AT THE PHONE\'S DEFAULT ZOOM, 0.75', make: (c) => c.data.set(z075.data) });
const big = canvas(W, H * rows.length);
rows.forEach((row, n) => {
  const sub = canvas(W, H); row.make(sub);
  const gv = meanValue(sub, 0, H);
  label(sub, `${row.text}  GROUND ${gv.toFixed(2)}`, 12, 12, 2);
  big.data.set(sub.data, n * H * W * 4);
  console.log(`row ${n}: mean value ${gv.toFixed(3)}`);
});
writeFileSync(join(outDir, 'compare.png'), encodePNG(big));
writeFileSync(join(outDir, 'compare-1x.png'), encodePNG(half(big)));
writeFileSync(join(outDir, 'compare-grey.png'), encodePNG(grey(big)));

// ---- each new model alone at phone size, seats 0, 1 and 6, its share in the label ----
const B = 224;
for (const [side, kinds, bld] of [['kg', KG, 'castle'], ['ex', EX, 'hall']]) for (const kind of [...kinds, bld]) {
  const isB = kind === bld, name = isB ? `bldg_${side}_${bld}` : `${side}_${kind}_0_0`, P = isB ? 520 : B;
  const c = canvas(P * 3, P + 30); ground(c, 0, P + 30, 7 + kind.length, GRASS); setShadow(1.45);
  [0, 1, 6].forEach((seat, k) => draw(c, get(name), P * k + P / 2, P / 2 + (isB ? P * 0.12 : P * 0.1), seat));
  setShadow(1);
  label(c, `${name}  SEATS 0 1 6  TEAM ${shares[name].toFixed(3)}`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); const h1 = half(c); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(h1));
  for (const mode of ['protan', 'deutan']) writeFileSync(join(outDir, 'models', `${name}-${mode}.png`), encodePNG(simulate(h1, mode))); // (seats 0 blue, 1 magenta, 6 violet under the two colour blindnesses)
}
console.log('slice picture ->', outDir);
