// The units family's picture (the re-theme, 2026-11-10): node tools/art/retheme-units.mjs <outdir> [--elev=40]
// The units of both peoples (the slice's four, fixed, and the nine new ones: Archer, Rider, Ballista, Trebuchet,
// Balloon; Mercenary, Veteran, Rover, Drone) at the 40-degree camera on grass, drawn 1.4x, seat 0 (royal blue) against
// seat 1 (magenta). Rows, each a landscape phone at 2x (1688x780):
//   row 0  the family: every unit beside the slice's models and buildings for scale and people
//   row 1  the crowd: about twelve a side in a fight at the sim's spacing, mixing every unit, zoom 1.0
//   row 2  the two flyers (Balloon high, Drone low) over a few ground units: their heights and shadows apart
// Writes family.png (2x), family-1x.png (CSS px), family-grey.png (2x, greyscale), crowd.png and flyers.png (rows 1 and
// 2 alone, 2x), models/<name>.png and <name>@2x.png (each model alone at phone size in seats 0, 1 and 6 with its team
// share, plus -protan and -deutan copies) and shares.json; prints the shares and the sizes at zoom 1.0. The painters
// are retheme-paint.mjs's, shared with the slice's retheme-compare.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { canvas, SEAT0, seatTints, makePainters, ground, GRASS, half, crop, simulate, grey, meanValue, label } from './retheme-paint.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/units';
const ELEV = +opt('elev', 40);
mkdirSync(join(outDir, 'models'), { recursive: true });

// ---- what to render ----
const KG = ['villager', 'guard', 'knight', 'archer', 'rider', 'ballista', 'trebuchet', 'balloon'], EX = ['bot', 'buggy', 'marine', 'mercenary', 'veteran', 'rover', 'drone'];
const NEW = { kg: ['villager', 'archer', 'rider', 'ballista', 'trebuchet', 'balloon'], ex: ['bot', 'buggy', 'marine', 'mercenary', 'veteran', 'rover', 'drone'] }; // the family's own and the slice's fixes
const RT = `^kg_(${KG.join('|')})_(0|1|15|2|14)_[0-3]$|^ex_(${EX.join('|')})_(8|9|7|10|6|0)_[0-3]$|^bldg_(kg_castle|ex_hall)$`;
const t0 = Date.now();
const fresh = await render3d(RT, { elev: ELEV });
console.log(`rendered ${fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const TINTS = seatTints(fresh.tints);
console.log(`seat 0 drawn as #${SEAT0.toString(16)} (tint #${TINTS[0].toString(16)}; the game's gold stays in src/)`);
const { get, has, draw, place, share: measure, sizeOf, setShadow } = makePainters(fresh, TINTS);
const frameOf = (kind) => kind === 'balloon' ? '0' : null;                                     // the Balloon has one frame
const nm = (side, kind, dir, f) => `${side}_${kind}_${dir}_${frameOf(kind) ?? f}`;

// ---- team shares and sizes (facing 0, frame 0; the Trebuchet set up too) ----
const shares = {}, sizes = {};
const CHECK = [...KG.map(k => nm('kg', k, 0, 0)), 'kg_trebuchet_0_3', ...EX.map(k => nm('ex', k, 0, 0)), ...[7, 8, 9].flatMap(d => [`ex_marine_${d}_0`, `ex_veteran_${d}_0`])]; // (the judge, round 2: the Marine's and the Veteran's shares at the Expedition's usual facings too)
console.log('team colour share of the solid pixels (facing 0; the floor is 0.12, floors not targets):');
for (const name of CHECK) { const sh = shares[name] = measure(name); const [w, h] = sizes[name] = sizeOf(name); console.log(`  ${name.padEnd(20)} ${sh.toFixed(3)}${sh < 0.12 ? '  BELOW THE FLOOR' : ''}   ${w.toFixed(0)} x ${h.toFixed(0)} CSS px at zoom 1.0`); }
writeFileSync(join(outDir, 'shares.json'), JSON.stringify({ shares, sizes }, null, 1));

// ---- the scenes ----
const W = 1688, H = 780;
const FAMILY = [
  ['bldg_kg_castle', 330, 440, 0], ['bldg_ex_hall', 1360, 440, 1],
  ['kg_villager_1_0', 500, 310, 0], ['kg_archer_0_0', 610, 320, 0], ['kg_villager_0_1', 540, 390, 0], ['kg_guard_0_0', 650, 400, 0],
  ['kg_archer_15_1', 520, 470, 0], ['kg_guard_1_1', 640, 480, 0], ['kg_rider_0_0', 770, 450, 0],
  ['kg_ballista_0_0', 710, 570, 0], ['kg_rider_2_1', 560, 565, 0],
  ['kg_trebuchet_0_3', 500, 700, 0], ['kg_knight_0_0', 690, 690, 0], ['kg_balloon_0_0', 800, 780, 0],
  ['ex_bot_8_0', 1180, 310, 1], ['ex_mercenary_8_0', 1060, 320, 1], ['ex_bot_9_1', 1140, 390, 1], ['ex_marine_8_0', 1020, 400, 1],
  ['ex_mercenary_9_1', 1150, 470, 1], ['ex_marine_9_1', 1040, 480, 1], ['ex_veteran_8_0', 930, 440, 1],
  ['ex_buggy_8_0', 980, 565, 1], ['ex_veteran_9_1', 1120, 565, 1],
  ['ex_rover_8_0', 1180, 700, 1], ['ex_marine_10_0', 1000, 690, 1], ['ex_drone_8_0', 890, 700, 1],
];
/** The crowd: about twelve a side meeting at the centre, every unit of both peoples, at the sim's spacing (line units
 *  r 10-11 stand about 24 world px apart in a blob; they overlap when they press). */
function crowd(cx, cy) {
  const list = [], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  const side = (sd, kinds, dirs, sign) => kinds.forEach((kind, k) => { const col = Math.floor(k / 4), row = k % 4; list.push([nm(sd, kind, dirs[k % dirs.length], k % 2), cx + sign * (40 + col * 52) + jit(k), cy - 90 + row * 60 + jit(k + 5) + (col % 2) * 20, sign < 0 ? 0 : 1]); });
  side('kg', ['guard', 'archer', 'guard', 'knight', 'archer', 'rider', 'guard', 'archer', 'ballista', 'balloon', 'trebuchet', 'villager'], [0, 1, 15, 2, 14], -1);
  side('ex', ['marine', 'mercenary', 'marine', 'buggy', 'mercenary', 'veteran', 'marine', 'mercenary', 'rover', 'drone', 'veteran', 'bot'], [8, 9, 7, 10, 6], 1);
  return list;
}
const FLYERS = [
  ['kg_guard_0_0', 560, 430, 0], ['kg_archer_1_1', 640, 470, 0], ['kg_villager_15_0', 720, 440, 0], ['kg_balloon_0_0', 640, 560, 0],
  ['ex_marine_8_0', 1040, 430, 1], ['ex_mercenary_9_1', 1120, 470, 1], ['ex_bot_8_0', 960, 440, 1], ['ex_drone_8_0', 1060, 560, 1], ['ex_drone_9_1', 1180, 600, 1],
];
const rows = [];
rows.push({ text: `ROW 0  THE UNITS FAMILY: KINGDOM V EXPEDITION, UNITS 1.4X, ${ELEV}°, GRASS`, make: (c) => { ground(c, 0, H, 2, GRASS); setShadow(1.45); place(c, FAMILY); setShadow(1); } });
const BIG = canvas(2250, 1040); ground(BIG, 0, 1040, 3, GRASS); setShadow(1.45); place(BIG, crowd(1125, 520)); setShadow(1);
const z100 = crop(BIG, (2250 - W) / 2, (1040 - H) / 2, W, H);
rows.push({ text: 'ROW 1  THE CROWD: 12 A SIDE, EVERY UNIT, THE SIM\'S SPACING, ZOOM 1.0', make: (c) => c.data.set(z100.data) });
rows.push({ text: 'ROW 2  THE FLYERS: THE BALLOON HIGH, THE DRONE LOW, OVER GROUND UNITS', make: (c) => { ground(c, 0, H, 5, GRASS); setShadow(1.45); place(c, FLYERS); setShadow(1); } });
const big = canvas(W, H * rows.length), singles = {};
rows.forEach((row, n) => {
  const sub = canvas(W, H); row.make(sub);
  const gv = meanValue(sub, 0, H);
  label(sub, `${row.text}  GROUND ${gv.toFixed(2)}`, 12, 12, 2);
  big.data.set(sub.data, n * H * W * 4); singles[n] = sub;
  console.log(`row ${n}: mean value ${gv.toFixed(3)}`);
});
writeFileSync(join(outDir, 'family.png'), encodePNG(big));
writeFileSync(join(outDir, 'family-1x.png'), encodePNG(half(big)));
writeFileSync(join(outDir, 'family-grey.png'), encodePNG(grey(big)));
writeFileSync(join(outDir, 'crowd.png'), encodePNG(singles[1]));
writeFileSync(join(outDir, 'flyers.png'), encodePNG(singles[2]));

// ---- each model alone at phone size, seats 0, 1 and 6, its share in the label ----
const strips = [...NEW.kg.map(k => nm('kg', k, 0, 0)), 'kg_trebuchet_0_3', ...NEW.ex.map(k => nm('ex', k, 0, 0))];
for (const name of strips) {
  if (!has(name)) continue;
  const s = get(name), P = Math.max(224, s.img.h + 24);
  const c = canvas(P * 3, P + 30); ground(c, 0, P + 30, 7 + name.length, GRASS); setShadow(1.45);
  [0, 1, 6].forEach((seat, k) => draw(c, s, P * k + P / 2, P / 2 + (s.img.h > 224 ? P * 0.22 : P * 0.1), seat));
  setShadow(1);
  label(c, `${name}  SEATS 0 1 6  TEAM ${(shares[name] ?? measure(name)).toFixed(3)}`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); const h1 = half(c); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(h1));
  for (const mode of ['protan', 'deutan']) writeFileSync(join(outDir, 'models', `${name}-${mode}.png`), encodePNG(simulate(h1, mode)));
}
console.log('units family picture ->', outDir);
