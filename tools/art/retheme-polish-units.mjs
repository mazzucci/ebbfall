// The polish pass on the units family (the recipe approved on the slice, polish.js, applied to the Archer, Rider,
// Ballista, Trebuchet and Balloon; the Mercenary, Veteran, Rover and Drone; 2026-11-10):
//   node tools/art/retheme-polish-units.mjs <outdir> [--elev=40] [--sun=420] [--polish='{"ao":{...}}']
// Both halves render under the build's sun (420); "before" is the family's models with the plain finish, "after" the
// same with polish.js (every unit frame under the units' lights and banding, as retheme.js sets it). Writes
// before-after.png (2x: the crowd, twelve a side mixing every unit of both peoples at zoom 1.0, before over after; the
// slice's six units are in it, polished, for consistency), before-after-1x.png (CSS px), before-after-grey.png;
// flyers.png and flyers-1x.png (the Balloon high and the Drone low over ground units, before over after); closeups.png
// (each of the family's models before and after at 2x, then at 4x); models/<name>.png and @2x (each polished model
// in seats 0, 1 and 6, its share and the old one in the label); shares.json (before and after, the slice's six too).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { canvas, SEAT0, seatTints, makePainters, ground, GRASS, half, crop, grey, meanValue, label } from './retheme-paint.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/polish-units';
const ELEV = +opt('elev', 40), SUN = +opt('sun', 420), POLISH = opt('polish', null) ? JSON.parse(opt('polish')) : true;
mkdirSync(join(outDir, 'models'), { recursive: true });

const KG = ['villager', 'guard', 'knight', 'archer', 'rider', 'ballista', 'trebuchet', 'balloon'], EX = ['bot', 'buggy', 'marine', 'mercenary', 'veteran', 'rover', 'drone'];
const FAMILY = { kg: ['archer', 'rider', 'ballista', 'trebuchet', 'balloon'], ex: ['mercenary', 'veteran', 'rover', 'drone'] };
const RT = `^kg_(${KG.join('|')})_(0|1|15|2|14)_[0-3]$|^ex_(${EX.join('|')})_(8|9|7|10|6|0)_[0-3]$`;
const t0 = Date.now();
const before = await render3d(RT, { elev: ELEV, sun: SUN });
const after = await render3d(RT, { elev: ELEV, sun: SUN, polish: POLISH });
console.log(`rendered ${before.length + after.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s (sun ${SUN}, camera ${ELEV}°)`);
const TINTS = seatTints(after.tints);
console.log(`seat 0 drawn as #${SEAT0.toString(16)}`);
const B = makePainters(before, TINTS), A = makePainters(after, TINTS);
const frameOf = (kind) => kind === 'balloon' ? '0' : null;                                     // the Balloon has one frame
const nm = (side, kind, dir, f) => `${side}_${kind}_${dir}_${frameOf(kind) ?? f}`;

// ---- team shares and sizes, before and after (the family's, then the slice's six, which must not have moved) ----
const STRIPS = [...FAMILY.kg.map(k => nm('kg', k, 0, 0)), 'kg_trebuchet_0_3', ...FAMILY.ex.map(k => nm('ex', k, 0, 0))];
const PIECES = [...STRIPS, ...[7, 8, 9].flatMap(d => [`ex_veteran_${d}_0`, `ex_marine_${d}_0`]), 'kg_villager_0_0', 'kg_guard_0_0', 'kg_knight_0_0', 'ex_bot_0_0', 'ex_buggy_0_0', 'ex_marine_0_0'];
const shares = { before: {}, after: {} };
console.log('team share of the solid pixels (the floor is 0.12):');
for (const name of PIECES) {
  const b = shares.before[name] = B.share(name), a = shares.after[name] = A.share(name);
  const [w0, h0] = B.sizeOf(name), [w1, h1] = A.sizeOf(name);
  console.log(`  ${name.padEnd(20)} before ${b.toFixed(3)}  after ${a.toFixed(3)}${a < 0.12 ? '  BELOW THE FLOOR' : ''}   size ${w0.toFixed(0)}x${h0.toFixed(0)} -> ${w1.toFixed(0)}x${h1.toFixed(0)} CSS px`);
}
writeFileSync(join(outDir, 'shares.json'), JSON.stringify(shares, null, 1));

// ---- the crowd, before over after: twelve a side meeting at the center, every unit of both peoples, at the sim's spacing ----
const W = 1688, H = 780;
function crowd(cx, cy) {
  const list = [], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  const side = (sd, kinds, dirs, sign) => kinds.forEach((kind, k) => { const col = Math.floor(k / 4), row = k % 4; list.push([nm(sd, kind, dirs[k % dirs.length], k % 2), cx + sign * (40 + col * 52) + jit(k), cy - 90 + row * 60 + jit(k + 5) + (col % 2) * 20, sign < 0 ? 0 : 1]); });
  side('kg', ['guard', 'archer', 'guard', 'knight', 'archer', 'rider', 'guard', 'archer', 'ballista', 'balloon', 'trebuchet', 'villager'], [0, 1, 15, 2, 14], -1);
  side('ex', ['marine', 'mercenary', 'marine', 'buggy', 'mercenary', 'veteran', 'marine', 'mercenary', 'rover', 'drone', 'veteran', 'bot'], [8, 9, 7, 10, 6], 1);
  return list;
}
function crowdScene(P, text) {
  const big = canvas(2250, 1040); ground(big, 0, 1040, 3, GRASS); P.setShadow(1.45); P.place(big, crowd(1125, 520)); P.setShadow(1);
  const c = crop(big, (2250 - W) / 2, (1040 - H) / 2, W, H);
  label(c, `${text}  GROUND ${meanValue(c, 0, H).toFixed(2)}`, 12, 12, 2);
  return c;
}
const ba = canvas(W, H * 2);
ba.data.set(crowdScene(B, `BEFORE: THE UNITS, PLAIN FINISH, SUN ${SUN}, ${ELEV}°, 12 A SIDE, ZOOM 1.0`).data, 0);
ba.data.set(crowdScene(A, 'AFTER: POLISH R3 (UNITS\' HARSH KEY, 5-BIT STEPS, GLINTS, DETAIL THAT READS AT 2X), THE SLICE\'S SIX IN IT').data, H * W * 4);
writeFileSync(join(outDir, 'before-after.png'), encodePNG(ba));
writeFileSync(join(outDir, 'before-after-1x.png'), encodePNG(half(ba)));
writeFileSync(join(outDir, 'before-after-grey.png'), encodePNG(grey(ba)));

// ---- the flyers, before over after: the Balloon high, the Drone low, over ground units ----
const FLYERS = [
  ['kg_guard_0_0', 560, 430, 0], ['kg_archer_1_1', 640, 470, 0], ['kg_villager_15_0', 720, 440, 0], ['kg_balloon_0_0', 640, 560, 0],
  ['ex_marine_8_0', 1040, 430, 1], ['ex_mercenary_9_1', 1120, 470, 1], ['ex_bot_8_0', 960, 440, 1], ['ex_drone_8_0', 1060, 560, 1], ['ex_drone_9_1', 1180, 600, 1],
];
function flyerScene(P, text) {
  const c = canvas(W, H); ground(c, 0, H, 5, GRASS); P.setShadow(1.45); P.place(c, FLYERS); P.setShadow(1);
  label(c, `${text}  GROUND ${meanValue(c, 0, H).toFixed(2)}`, 12, 12, 2);
  return c;
}
const fl = canvas(W, H * 2);
fl.data.set(flyerScene(B, 'BEFORE: THE FLYERS, THE BALLOON HIGH, THE DRONE LOW').data, 0);
fl.data.set(flyerScene(A, 'AFTER: THE FLYERS, POLISHED').data, H * W * 4);
writeFileSync(join(outDir, 'flyers.png'), encodePNG(fl));
writeFileSync(join(outDir, 'flyers-1x.png'), encodePNG(half(fl)));

// ---- close-ups: each of the family's models before and after at 2x and at 4x (the 2x sprite doubled, nearest neighbor) ----
function scale2(c) { const o = canvas(c.w * 2, c.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y >> 1) * c.w + (x >> 1)) * 4, ((y >> 1) * c.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4); return o; }
function paste(dst, src, x, y) { for (let j = 0; j < src.h; j++) { if (y + j < 0 || y + j >= dst.h) continue; const w = Math.min(src.w, dst.w - x); if (w > 0) dst.data.set(src.data.subarray((j * src.w) * 4, (j * src.w + w) * 4), ((y + j) * dst.w + x) * 4); } }
const rows = STRIPS.map((name) => {
  const seat = name.startsWith('kg') ? 0 : 1, s = A.get(name), P = Math.max(130, s.img.h + 16), fly = s.img.h > 224;
  const cell = (painter, n) => { const c = canvas(P, P); ground(c, 0, P, 7 + n, GRASS); painter.setShadow(1.45); painter.draw(c, painter.get(name), P / 2, P / 2 + (fly ? P * 0.3 : P * 0.15), seat); painter.setShadow(1); return c; };
  const b2 = cell(B, 1), a2 = cell(A, 2), b4 = scale2(b2), a4 = scale2(a2);
  const row = canvas(P * 2 + 8 + P * 4 + 16, P * 2 + 26);
  for (let i = 0; i < row.data.length; i += 4) row.data.set([30, 30, 30, 255], i);
  paste(row, b2, 0, 0); paste(row, a2, P + 4, 0); paste(row, b4, P * 2 + 12, 0); paste(row, a4, P * 4 + 16, 0);
  label(row, `${name}  BEFORE / AFTER AT 2X, THEN AT 4X`, 4, P * 2 + 4, 2);
  return row;
});
const CW = Math.max(...rows.map(r => r.w)), CH = rows.reduce((t, r) => t + r.h + 6, 0);
const closeups = canvas(CW, CH); for (let i = 0; i < closeups.data.length; i += 4) closeups.data.set([30, 30, 30, 255], i);
let cy = 0; for (const r of rows) { paste(closeups, r, 0, cy); cy += r.h + 6; }
writeFileSync(join(outDir, 'closeups.png'), encodePNG(closeups));

// ---- each polished model alone in seats 0, 1 and 6, its share (and the old one) in the label ----
for (const name of STRIPS) {
  const s = A.get(name), P = Math.max(224, s.img.h + 24);
  const c = canvas(P * 3, P + 30); ground(c, 0, P + 30, 7 + name.length, GRASS); A.setShadow(1.45);
  [0, 1, 6].forEach((seat, k) => A.draw(c, s, P * k + P / 2, P / 2 + (s.img.h > 224 ? P * 0.22 : P * 0.1), seat));
  A.setShadow(1);
  label(c, `${name}  SEATS 0 1 6  TEAM ${shares.after[name].toFixed(3)} (WAS ${shares.before[name].toFixed(3)})`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(half(c)));
}
console.log('units polish picture ->', outDir);
