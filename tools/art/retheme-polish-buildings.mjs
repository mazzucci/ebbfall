// The polish pass on the buildings family (the recipe Stelian approved on the slice, applied to the other thirteen
// buildings; 2026-11-10): node tools/art/retheme-polish-buildings.mjs <outdir> [--elev=40] [--sun=420]
// Both halves render under the build's new sun (420) at the re-theme's 40-degree camera: "before" is the family's
// models with the plain finish, "after" the same models through polish.js (the buildings' lights, the depth-pass
// finish with the crisp contact ellipse, the 1x course textures, and each model's secondary detail under `M.polish`).
// Writes, at a landscape phone's size (1688x780 at 2x, 844x390 CSS):
//   before-after.png (2x: two phone scenes, seat 0's kingdom against seat 1's Expedition, each before over after, the
//     polished slice pieces in the after rows), before-after-1x.png (CSS px), before-after-grey.png
//   closeups.png: each building before and after at 2x, then at 4x (nearest-neighbour doubled)
//   base-kingdom.png, base-expedition.png: a full base of each people after the polish at zoom 1.0 (+ -1x), and
//     base-*-075.png the same at 0.75 (+ -1x)
//   models/<name>.png and @2x: each polished building alone in seats 0, 1 and 6 (the towers with their heads), its
//     share before and after in the label; shares.json (before and after, the towers with and without their heads)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { seatTints, SEAT0 } from './retheme-paint.mjs';
import { canvas, ground, half, resample, crop, paste, grey, meanValue, label, makeScene } from './retheme-scene.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/polish-buildings';
const ELEV = +opt('elev', 40), SUN = +opt('sun', 420);
mkdirSync(join(outDir, 'models'), { recursive: true });

const KG = ['cottage', 'market', 'barracks', 'blacksmith', 'workshop', 'tower', 'stables'], EX = ['bunkhouse', 'post', 'factory', 'lab', 'radio', 'portal'];
const HEADS = { bldg_kg_tower: 'kg_towerhead', bldg_ex_radio: 'ex_radiohead' };
const FILTER = '^bldg_(kg|ex)_|^kg_towerhead_(0|2|4)$|^ex_radiohead_(0|6|12)$|^kg_(villager|guard|knight)_(0|1|15|4)_0$|^ex_(bot|buggy|marine)_(8|9|7|4)_0$';
const t0 = Date.now();
const before = await render3d(FILTER, { elev: ELEV, sun: SUN });
const after = await render3d(FILTER, { elev: ELEV, sun: SUN, polish: true });
console.log(`rendered ${before.length + after.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s (sun ${SUN}, camera ${ELEV}°)`);
const TINTS = seatTints(after.tints);
console.log(`seat 0 drawn as #${SEAT0.toString(16)}`);
const B = makeScene(before, TINTS), A = makeScene(after, TINTS);
const head = (name, dir) => HEADS[name] ? `${HEADS[name]}_${dir}` : undefined;

// ---- shares, before and after (the towers with their heads too) ----
function shareWithHead(P, base, hd) {
  const b = P.get(base).img, h = P.get(hd).img, mb = P.masks.get(base), mh = P.masks.get(hd); let solid = 0, team = 0;
  for (let i = 3; i < b.data.length; i += 4) { if (b.data[i] === 255 || h.data[i] === 255) solid++; if (mb.data[i] >= 128 || mh.data[i] >= 128) team++; }
  return +(team / solid).toFixed(3);
}
const NAMES = [...KG.map(k => `bldg_kg_${k}`), 'bldg_kg_castle', ...EX.map(k => `bldg_ex_${k}`), 'bldg_ex_hall'];
const shares = { before: {}, after: {} };
console.log('team share of the solid pixels (facing 0; the floor is 0.12, 0.08 for the main buildings):');
for (const name of NAMES) {
  const b = shares.before[name] = B.share(name), a = shares.after[name] = A.share(name), floor = /castle|hall/.test(name) ? 0.08 : 0.12;
  const [w0, h0] = B.size(name), [w1, h1] = A.size(name);
  let line = `  ${name.padEnd(18)} before ${b.toFixed(3)}  after ${a.toFixed(3)}${a < floor ? '  BELOW THE FLOOR' : ''}   size ${w0}x${h0} -> ${w1}x${h1} CSS px`;
  if (HEADS[name]) { const hn = `${HEADS[name]}_0`; shares.before[`${name}+head`] = shareWithHead(B, name, hn); shares.after[`${name}+head`] = shareWithHead(A, name, hn); line += `   with its head ${shares.before[`${name}+head`].toFixed(3)} -> ${shares.after[`${name}+head`].toFixed(3)}`; }
  console.log(line);
}
writeFileSync(join(outDir, 'shares.json'), JSON.stringify(shares, null, 1));

// ---- the phone scenes, before over after: seat 0's kingdom on the left against seat 1's Expedition on the right ----
const W = 1688, H = 780;
const SCENES = [
  { text: 'COTTAGE, MARKET, BARRACKS, BLACKSMITH  /  TENT, RECRUITING POST, FACTORY', list: [
    ['bldg_kg_cottage', 150, 300, 0], ['bldg_kg_market', 380, 290, 0], ['bldg_kg_barracks', 270, 600, 0], ['bldg_kg_blacksmith', 580, 560, 0],
    ['kg_villager_1_0', 560, 330, 0], ['kg_guard_0_0', 640, 400, 0], ['kg_guard_15_0', 690, 470, 0], ['kg_knight_0_0', 760, 300, 0],
    ['bldg_ex_bunkhouse', 1480, 280, 1], ['bldg_ex_post', 1200, 260, 1], ['bldg_ex_factory', 1340, 600, 1],
    ['ex_bot_8_0', 1060, 320, 1], ['ex_buggy_8_0', 1020, 440, 1], ['ex_marine_8_0', 1080, 540, 1], ['ex_marine_9_0', 1010, 620, 1]] },
  { text: 'CASTLE, WORKSHOP, WATCHTOWER, STABLES  /  DATA CENTRE, LAB, RADIO TOWER, PORTAL', list: [
    ['bldg_kg_castle', 230, 420, 0], ['bldg_kg_workshop', 560, 300, 0], ['bldg_kg_tower', 740, 580, 0, 'kg_towerhead_2'], ['bldg_kg_stables', 520, 640, 0],
    ['kg_guard_1_0', 760, 420, 0], ['kg_villager_0_0', 800, 470, 0],
    ['bldg_ex_hall', 1440, 420, 1], ['bldg_ex_lab', 1120, 280, 1], ['bldg_ex_radio', 960, 560, 1, 'ex_radiohead_6'], ['bldg_ex_portal', 1180, 640, 1],
    ['ex_marine_7_0', 930, 400, 1], ['ex_bot_9_0', 880, 460, 1]] },
];
function scene(P, text, list, seed) {
  const c = canvas(W, H); ground(c, 0, H, seed); P.place(c, list);
  label(c, `${text}  GROUND ${meanValue(c, 0, H).toFixed(2)}`, 12, 12, 2);
  return c;
}
const big = canvas(W, H * 4);
SCENES.forEach((s, k) => {
  paste(big, scene(B, `BEFORE: PLAIN FINISH, SUN ${SUN}, ${ELEV}°   ${s.text}`, s.list, 2 + k), 0, k * 2 * H);
  paste(big, scene(A, `AFTER: THE POLISH (THE SLICE'S RECIPE, ROUND 3)   ${s.text}`, s.list, 2 + k), 0, (k * 2 + 1) * H);
});
writeFileSync(join(outDir, 'before-after.png'), encodePNG(big));
writeFileSync(join(outDir, 'before-after-1x.png'), encodePNG(half(big)));
writeFileSync(join(outDir, 'before-after-grey.png'), encodePNG(grey(big)));

// ---- close-ups: each building before and after at 2x and at 4x ----
function scale2(c) { const o = canvas(c.w * 2, c.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y >> 1) * c.w + (x >> 1)) * 4, ((y >> 1) * c.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4); return o; }
const DARK = (c) => { for (let i = 0; i < c.data.length; i += 4) c.data.set([30, 30, 30, 255], i); return c; };
const CLOSE = [...KG.map(k => [`bldg_kg_${k}`, 0]), ...EX.map(k => [`bldg_ex_${k}`, 1])];
const cellSize = (name) => /barracks|workshop|stables|factory/.test(name) ? 320 : /tower|radio/.test(name) ? 300 : 250;
const rows = CLOSE.map(([name, seat]) => {
  const P = cellSize(name), tall = /tower|radio/.test(name);
  const cell = (painter, n) => { const c = canvas(P, P); ground(c, 0, P, 7 + n); painter.draw(c, name, P / 2, P / 2 + (tall ? P * 0.3 : P * 0.14), seat); if (HEADS[name]) painter.draw(c, head(name, name.includes('kg') ? 2 : 6), P / 2, P / 2 + (tall ? P * 0.3 : P * 0.14), seat); return c; };
  const b2 = cell(B, 1), a2 = cell(A, 2), b4 = scale2(b2), a4 = scale2(a2);
  const row = DARK(canvas(P * 6 + 24, P * 2 + 26));
  paste(row, b2, 0, 0); paste(row, a2, P + 4, 0); paste(row, b4, P * 2 + 12, 0); paste(row, a4, P * 4 + 16, 0);
  label(row, `${name}  BEFORE / AFTER AT 2X, THEN AT 4X`, 4, P * 2 + 4, 2);
  return row;
});
const CW = Math.max(...rows.map(r => r.w)), CH = rows.reduce((t, r) => t + r.h + 6, 0);
const closeups = DARK(canvas(CW, CH));
let cy = 0; for (const r of rows) { paste(closeups, r, 0, cy); cy += r.h + 6; }
writeFileSync(join(outDir, 'closeups.png'), encodePNG(closeups));

// ---- the bases after the polish: every building once, a few units; the phone's view at 1.0 and the whole at 0.75 ----
const BW = 2250, BH = 1040;
const KINGDOM_BASE = [
  ['bldg_kg_castle', 1000, 500, 0], ['bldg_kg_stables', 690, 300, 0], ['bldg_kg_market', 1330, 290, 0], ['bldg_kg_barracks', 700, 720, 0],
  ['bldg_kg_blacksmith', 1340, 520, 0], ['bldg_kg_workshop', 1390, 790, 0], ['bldg_kg_tower', 1560, 470, 0, 'kg_towerhead_0'], ['bldg_kg_cottage', 1110, 780, 0],
  ['kg_villager_0_0', 1180, 380, 0], ['kg_villager_1_0', 1220, 420, 0], ['kg_villager_15_0', 1160, 640, 0], ['kg_guard_4_0', 760, 580, 0], ['kg_guard_0_0', 820, 600, 0], ['kg_guard_15_0', 880, 620, 0],
  ['kg_knight_0_0', 900, 300, 0], ['kg_knight_4_0', 560, 460, 0]];
const EXPEDITION_BASE = [
  ['bldg_ex_hall', 1000, 500, 1], ['bldg_ex_factory', 700, 740, 1], ['bldg_ex_portal', 1330, 310, 1], ['bldg_ex_radio', 1560, 500, 1, 'ex_radiohead_12'],
  ['bldg_ex_bunkhouse', 1240, 770, 1], ['bldg_ex_post', 710, 300, 1], ['bldg_ex_lab', 1390, 560, 1],
  ['ex_bot_8_0', 1180, 380, 1], ['ex_bot_9_0', 1220, 430, 1], ['ex_bot_7_0', 1150, 650, 1], ['ex_marine_4_0', 1300, 440, 1], ['ex_marine_8_0', 1360, 450, 1], ['ex_marine_9_0', 1420, 470, 1],
  ['ex_buggy_8_0', 900, 300, 1], ['ex_buggy_4_0', 560, 520, 1]];
function base(name, list, seed) {
  const b = canvas(BW, BH); ground(b, 0, BH, seed); A.place(b, list);
  const z100 = crop(b, (BW - W) / 2, (BH - H) / 2, W, H), z075 = resample(b, 0.75);
  if (name === 'expedition') writeFileSync(join(outDir, 'bunkhouse-check.png'), encodePNG(half(z100)));                     // (the Bunkhouse in its base at zoom 1.0 and 1x, no label: for cold testers)
  label(z100, `${name.toUpperCase()} BASE AFTER THE POLISH, ZOOM 1.0  GROUND ${meanValue(z100, 0, H).toFixed(2)}`, 12, 12, 2); label(z075, `${name.toUpperCase()} BASE AFTER THE POLISH, ZOOM 0.75`, 12, 12, 2);
  writeFileSync(join(outDir, `base-${name}.png`), encodePNG(z100)); writeFileSync(join(outDir, `base-${name}-1x.png`), encodePNG(half(z100)));
  writeFileSync(join(outDir, `base-${name}-075.png`), encodePNG(z075)); writeFileSync(join(outDir, `base-${name}-075-1x.png`), encodePNG(half(z075)));
}
base('kingdom', KINGDOM_BASE, 11);
base('expedition', EXPEDITION_BASE, 13);

// ---- each polished building alone in seats 0, 1 and 6, its share before and after in the label ----
for (const [name, n] of NAMES.map(nm => [nm, /castle|hall/.test(nm) ? 4 : /barracks|workshop|stables|factory/.test(nm) ? 3 : 2])) {
  const P = n >= 3 ? 500 : 380, c = canvas(P * 3, P + 30); ground(c, 0, P + 30, 7 + name.length);
  [0, 1, 6].forEach((seat, k) => { A.draw(c, name, P * k + P / 2, P / 2 + P * 0.12, seat); if (HEADS[name]) A.draw(c, head(name, name.includes('kg') ? 2 : 6), P * k + P / 2, P / 2 + P * 0.12, seat); });
  const sh = HEADS[name] ? `TEAM ${shares.after[name].toFixed(3)} (WAS ${shares.before[name].toFixed(3)}; WITH HEAD ${shares.after[`${name}+head`].toFixed(3)})` : `TEAM ${shares.after[name].toFixed(3)} (WAS ${shares.before[name].toFixed(3)})`;
  label(c, `${name}  SEATS 0 1 6  ${sh}`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(half(c)));
}
console.log('polish pictures (buildings) ->', outDir);
