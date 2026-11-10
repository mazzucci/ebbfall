// The polish pass's before-and-after picture (the slice's eight pieces; Stelian: "more polished, more detail, less like
// drawings", 2026-11-10): node tools/art/retheme-polish.mjs <outdir> [--elev=40] [--sun=420] [--polish='{"ao":{...}}']
// Both halves render under the build's new sun (scene.js `sun`, 420 over the ground: the final lighting); "before" is
// the slice's models with the plain finish, "after" the same models with polish.js (the depth pass finish, the material
// texture and each model's secondary detail under `M.polish`). Writes before-after.png (2x: the slice's phone scene
// before over after), before-after-1x.png (CSS px), before-after-grey.png; closeups.png (each piece before and after at
// 2x and at 4x); crowd-after-1x.png (twelve a side at zoom 1.0, polished, at CSS px; and crowd-after.png at 2x);
// models/<name>.png and @2x (each polished piece in seats 0, 1 and 6 with its share); shares.json (before and after).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { canvas, SEAT0, seatTints, makePainters, ground, GRASS, half, crop, grey, meanValue, label } from './retheme-paint.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/polish';
const ELEV = +opt('elev', 40), SUN = +opt('sun', 420), POLISH = opt('polish', null) ? JSON.parse(opt('polish')) : true;
mkdirSync(join(outDir, 'models'), { recursive: true });

const KG = ['villager', 'guard', 'knight'], EX = ['bot', 'buggy', 'marine'];
const RT = `^kg_(${KG.join('|')})_(0|1|15|2|14)_[01]$|^ex_(${EX.join('|')})_(8|9|7|10|6|0)_[01]$|^bldg_(kg_castle|ex_hall)$|^rt_coins$`;
const t0 = Date.now();
const before = await render3d(RT, { elev: ELEV, sun: SUN });
const after = await render3d(RT, { elev: ELEV, sun: SUN, polish: POLISH });
console.log(`rendered ${before.length + after.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s (sun ${SUN}, camera ${ELEV}°)`);
const TINTS = seatTints(after.tints);
console.log(`seat 0 drawn as #${SEAT0.toString(16)}`);
const B = makePainters(before, TINTS), A = makePainters(after, TINTS);

// ---- team shares and sizes, before and after ----
const PIECES = [...KG.map(k => `kg_${k}_0_0`), 'bldg_kg_castle', ...EX.map(k => `ex_${k}_0_0`), 'bldg_ex_hall'];
const shares = { before: {}, after: {} };
console.log('team share of the solid pixels (facing 0; the floor is 0.12, 0.08 for main buildings):');
for (const name of PIECES) {
  const b = shares.before[name] = B.share(name), a = shares.after[name] = A.share(name), floor = name.startsWith('bldg') ? 0.08 : 0.12;
  const [w0, h0] = B.sizeOf(name), [w1, h1] = A.sizeOf(name);
  console.log(`  ${name.padEnd(18)} before ${b.toFixed(3)}  after ${a.toFixed(3)}${a < floor ? '  BELOW THE FLOOR' : ''}   size ${w0.toFixed(0)}x${h0.toFixed(0)} -> ${w1.toFixed(0)}x${h1.toFixed(0)} CSS px`);
}
writeFileSync(join(outDir, 'shares.json'), JSON.stringify(shares, null, 1));

// ---- the phone scene, before over after ----
const W = 1688, H = 780;
const SLICE_LIST = [
  ['bldg_kg_castle', 330, 440, 0], ['rt_coins', 844, 430], ['bldg_ex_hall', 1360, 440, 1],
  ['kg_villager_1_0', 560, 320, 0], ['kg_villager_0_1', 610, 380, 0], ['kg_guard_0_0', 650, 460, 0], ['kg_guard_1_1', 700, 520, 0], ['kg_guard_15_0', 620, 580, 0], ['kg_knight_0_0', 720, 650, 0], ['kg_knight_2_1', 560, 690, 0],
  ['ex_bot_8_0', 1130, 320, 1], ['ex_bot_9_1', 1080, 380, 1], ['ex_buggy_8_0', 1040, 470, 1], ['ex_buggy_7_1', 1120, 560, 1], ['ex_marine_8_0', 1000, 540, 1], ['ex_marine_9_1', 1060, 640, 1], ['ex_marine_10_0', 1150, 660, 1],
];
function scene(P, text) {
  const c = canvas(W, H); ground(c, 0, H, 2, GRASS); P.setShadow(1.45); P.place(c, SLICE_LIST); P.setShadow(1);
  label(c, `${text}  GROUND ${meanValue(c, 0, H).toFixed(2)}`, 12, 12, 2);
  return c;
}
const big = canvas(W, H * 2);
big.data.set(scene(B, `BEFORE: THE SLICE, PLAIN FINISH, SUN ${SUN}, ${ELEV}°`).data, 0);
big.data.set(scene(A, `AFTER: POLISH R3 (UNITS: HARSH KEY, 5-BIT STEPS; BUILDINGS: MORE FILL, LIGHTER WALL)`).data, H * W * 4);
writeFileSync(join(outDir, 'before-after.png'), encodePNG(big));
writeFileSync(join(outDir, 'before-after-1x.png'), encodePNG(half(big)));
writeFileSync(join(outDir, 'before-after-grey.png'), encodePNG(grey(big)));

// ---- close-ups: each piece before and after at 2x and at 4x (the 2x sprite doubled, nearest neighbour) ----
function scale2(c) { const o = canvas(c.w * 2, c.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y >> 1) * c.w + (x >> 1)) * 4, ((y >> 1) * c.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4); return o; }
const CLOSE = [['kg_villager_0_0', 0, 120], ['kg_guard_0_0', 0, 150], ['kg_knight_0_0', 0, 170], ['bldg_kg_castle', 0, 420], ['ex_bot_8_0', 1, 120], ['ex_buggy_8_0', 1, 150], ['ex_marine_8_0', 1, 150], ['bldg_ex_hall', 1, 420]];
const rows = CLOSE.map(([name, seat, P]) => {
  const cell = (painter, n) => { const c = canvas(P, P); ground(c, 0, P, 7 + n, GRASS); painter.setShadow(1.45); painter.draw(c, painter.get(name), P / 2, P / 2 + (name.startsWith('bldg') ? P * 0.12 : P * 0.15), seat); painter.setShadow(1); return c; };
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
function paste(dst, src, x, y) { for (let j = 0; j < src.h; j++) { if (y + j < 0 || y + j >= dst.h) continue; const w = Math.min(src.w, dst.w - x); if (w > 0) dst.data.set(src.data.subarray((j * src.w) * 4, (j * src.w + w) * 4), ((y + j) * dst.w + x) * 4); } }

// ---- the crowd after the polish, at zoom 1.0 (the noise check) ----
function crowd(cx, cy) {
  const list = [], jit = (k) => ((k * 7919) % 13 - 6) * 3;
  const side = (names, dirs, sign) => names.forEach((name, k) => { const col = Math.floor(k / 4), row = k % 4; list.push([`${name}_${dirs[k % dirs.length]}_${k % 2}`, cx + sign * (40 + col * 52) + jit(k), cy - 90 + row * 60 + jit(k + 5) + (col % 2) * 20, sign < 0 ? 0 : 1]); });
  side(['kg_guard', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_guard', 'kg_guard', 'kg_knight', 'kg_villager', 'kg_villager'], [0, 1, 15, 2, 14], -1);
  side(['ex_marine', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_marine', 'ex_marine', 'ex_buggy', 'ex_bot', 'ex_bot'], [8, 9, 7, 10, 6], 1);
  return list;
}
const BIG = canvas(2250, 1040); ground(BIG, 0, 1040, 3, GRASS); A.setShadow(1.45); A.place(BIG, crowd(1125, 520)); A.setShadow(1);
const z100 = crop(BIG, (2250 - W) / 2, (1040 - H) / 2, W, H);
label(z100, 'AFTER: THE CROWD, 12 A SIDE, ZOOM 1.0', 12, 12, 2);
writeFileSync(join(outDir, 'crowd-after.png'), encodePNG(z100)); writeFileSync(join(outDir, 'crowd-after-1x.png'), encodePNG(half(z100)));
const BIGB = canvas(2250, 1040); ground(BIGB, 0, 1040, 3, GRASS); B.setShadow(1.45); B.place(BIGB, crowd(1125, 520)); B.setShadow(1);
const z100b = crop(BIGB, (2250 - W) / 2, (1040 - H) / 2, W, H); label(z100b, 'BEFORE: THE CROWD, 12 A SIDE, ZOOM 1.0', 12, 12, 2);
writeFileSync(join(outDir, 'crowd-before-1x.png'), encodePNG(half(z100b)));

// ---- each polished piece alone in seats 0, 1 and 6, its share in the label ----
const MB = 224;
for (const [side, kinds, bld] of [['kg', KG, 'castle'], ['ex', EX, 'hall']]) for (const kind of [...kinds, bld]) {
  const isB = kind === bld, name = isB ? `bldg_${side}_${bld}` : `${side}_${kind}_0_0`, P = isB ? 520 : MB;
  const c = canvas(P * 3, P + 30); ground(c, 0, P + 30, 7 + kind.length, GRASS); A.setShadow(1.45);
  [0, 1, 6].forEach((seat, k) => A.draw(c, A.get(name), P * k + P / 2, P / 2 + (isB ? P * 0.12 : P * 0.1), seat));
  A.setShadow(1);
  label(c, `${name}  SEATS 0 1 6  TEAM ${shares.after[name].toFixed(3)} (WAS ${shares.before[name].toFixed(3)})`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(half(c)));
}
console.log('polish picture ->', outDir);
