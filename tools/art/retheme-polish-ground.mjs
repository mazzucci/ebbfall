// The polish pass on the ground family (the gold outcrop, the scenery props, each people's construction and rubble;
// the slice's recipe, polish.js, applied as approved: 2026-11-10): node tools/art/retheme-polish-ground.mjs <outdir>
// [--elev=40] [--sun=420] [--polish='{"ao":{...}}']
// Both halves render under the build's sun (420); "before" is the family's models with the plain finish, "after" the
// same with polish.js (the depth-pass finish under the buildings' lights, the country's polished materials and each
// piece's secondary detail under `polish`). On the family's own grass (tools/art/terrain3.js). Writes before-after.png
// (2x: a phone scene, before over after, a few polished slice pieces in both rows), before-after-1x.png (CSS px),
// before-after-grey.png; closeups.png (each piece before and after at 2x and at 4x); map-100.png and map-075.png (the
// map view with the polished pieces at each zoom, 2x, and -1x copies); effects.png (the effects strip and the small
// fight, after only, and -1x); models/<name>.png and @2x (each polished piece, seats 0, 1 and 6 for the team ones, its
// share); shares.json (before and after, and sizes at zoom 1.0).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile, VARIANTS } from './terrain3.js';
import { effectSprites } from './effects3.js';
import { hash2, vnoise } from './raster.js';
import { canvas, SEAT0, seatTints, makePainters, half, resample, crop, grey, meanValue, label } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/polish-ground';
const ELEV = +opt('elev', 40), SUN = +opt('sun', 420), POLISH = opt('polish', null) ? JSON.parse(opt('polish')) : true;
mkdirSync(join(outDir, 'models'), { recursive: true });
const T = 64, W = 1688, H = 780;

// ---- what to render: the family, the slice's bases, a few units (the fight's too) ----
const FILTER = '^rt_|^bldg_(kg_castle|ex_hall)$|^kg_(villager|guard|archer)_(0|1)_[01]$|^kg_knight_2_1$|^kg_ballista_0_0$|^kg_trebuchet_0_3$|^ex_(marine|bot|rover)_8_0$|^ex_(marine|mercenary)_9_1$|^ex_buggy_7_1$';
const t0 = Date.now();
const before = await render3d(FILTER, { elev: ELEV, sun: SUN });
const after = await render3d(FILTER, { elev: ELEV, sun: SUN, polish: POLISH });
for (const e of effectSprites()) { before.push(e); after.push(e); }
console.log(`rendered ${before.length + after.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s (sun ${SUN}, camera ${ELEV}°)`);
const TINTS = seatTints(after.tints);
console.log(`seat 0 drawn as #${SEAT0.toString(16)}`);
const tintOf = (seat) => { const c = TINTS[seat]; return [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v / 255); };
const SHADOW = 1.45; // the finish's ground shadow firmed on grass, as the slice's rows

/** A painter over one render: retheme-paint's measures, and a blit with the ground family's options (`seat` tints the
 *  team mask; `rot` turns a projectile; `fromRow` draws only the rows from there down, the construction reveal;
 *  `alpha`; `layer` 0 decals, 1 the ground sort by y, 2 air). */
function painter(sprites) {
  const P = makePainters(sprites, TINTS);
  function blit(c, s, x, y, { seat = null, rot = 0, fromRow = 0, alpha = 1 } = {}) {
    const { w, h, data } = s.img, m = seat === null || !P.has(s.name + '_m') ? null : P.get(s.name + '_m').img, tc = seat === null ? null : tintOf(seat);
    const ax = s.anchor.x * w, ay = s.anchor.y * h;
    const put = (px, py, si) => {
      if (px < 0 || py < 0 || px >= c.w || py >= c.h) return;
      const di = (py * c.w + px) * 4;
      let a = data[si + 3] / 255 * alpha;
      if (data[si + 3] === 150 && !data[si] && !data[si + 1] && !data[si + 2]) a = Math.min(1, a * SHADOW);
      if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * a;
      if (m) { a = m.data[si + 3] / 255 * alpha; if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + m.data[si + k] * tc[k] * a; }
      c.data[di + 3] = 255;
    };
    if (!rot) { const ox = Math.round(x - ax), oy = Math.round(y - ay); for (let j = fromRow; j < h; j++) for (let i = 0; i < w; i++) put(ox + i, oy + j, (j * w + i) * 4); return; }
    const cs = Math.cos(rot), sn = Math.sin(rot), R = Math.ceil(Math.hypot(w, h));
    for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
      const i = Math.floor(px * cs + py * sn + ax), j = Math.floor(-px * sn + py * cs + ay);
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      put(Math.round(x) + px, Math.round(y) + py, (j * w + i) * 4);
    }
  }
  const place = (c, list) => { for (const o of list.slice().sort((a, b) => (a.layer ?? 1) - (b.layer ?? 1) || a.y - b.y)) blit(c, P.get(o.name), o.x, o.y, o); };
  return { ...P, blit, place };
}
const B = painter(before), A = painter(after);
const it = (name, x, y, o = {}) => ({ name, x, y, ...o });

// ---- the ground: the family's tiles on the dual grid, as retheme-ground.mjs lays them ----
const tiles = {}; const getTile = (m, v) => tiles[`${m}_${v}`] ??= tile(m, v);
const MARK_SCALE = 0.35;
function groundVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > MARK_SCALE) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function blitTile(c, t, x0, y0) { for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), (py * c.w + px) * 4); } } }
function patch(c, { tw, th, region = () => 0, seed = 1 }) {
  const R = (x, y) => region(x, y) || 0, rnd = mulberry(seed * 7 + 3);
  for (let j = -1; j < th; j++) for (let i = -1; i < tw; i++) {
    const q = [R(i, j), R(i + 1, j), R(i, j + 1), R(i + 1, j + 1)], m = (q[0] ? 1 : 0) | (q[1] ? 2 : 0) | (q[2] ? 4 : 0) | (q[3] ? 8 : 0), r = rnd();
    const n = VARIANTS(m), v = m === 0 ? groundVariant(r, i, j, seed) : (q.find(Boolean) === 'forest' ? n : 0) + Math.floor(r * n);
    blitTile(c, getTile(m, v), i * T + T / 2, j * T + T / 2);
  }
}
const grass = (c, seed) => patch(c, { tw: Math.ceil(c.w / T) + 1, th: Math.ceil(c.h / T) + 1, seed });
/** The bed under a gold clump (the client's crust layer, proposed as bare trodden earth). */
function earthBed(c, nodes) {
  const col = [104, 94, 70];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    let a = 0; for (const [nx, ny] of nodes) { const d = Math.hypot(x - nx, (y - ny) / 0.85); if (d < 60) a = Math.max(a, Math.min(1, (60 - d) / 26)); }
    if (!a) continue;
    a *= 0.55 + (vnoise(x, y, 7, 31, 0) - 0.5) * 0.5; if (a <= 0) continue;
    const i = (y * c.w + x) * 4; for (let k = 0; k < 3; k++) c.data[i + k] = c.data[i + k] * (1 - a) + col[k] * a;
  }
}
const wobbly = (x, y, cx, cy, rx, ry, seed) => Math.hypot((x - cx) / rx, (y - cy) / ry) + (hash2(x, y, seed) - 0.5) * 0.5 < 1;
const save = (name, c) => writeFileSync(join(outDir, name), encodePNG(c));
function paste(dst, src, x, y) { for (let j = 0; j < src.h; j++) { if (y + j < 0 || y + j >= dst.h) continue; const w = Math.min(src.w, dst.w - x); if (w > 0) dst.data.set(src.data.subarray((j * src.w) * 4, (j * src.w + w) * 4), ((y + j) * dst.w + x) * 4); } }
function scale2(c) { const o = canvas(c.w * 2, c.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y >> 1) * c.w + (x >> 1)) * 4, ((y >> 1) * c.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4); return o; }

// ---- shares and sizes, before and after ----
const NEW = after.filter(s => /^rt_(gold|doodad|kg|ex)_/.test(s.name) && !s.trim).map(s => s.name).sort();
const TEAM = NEW.filter(n => A.has(n + '_m'));
const shares = { before: {}, after: {}, sizes: {} };
console.log('team share of the solid pixels (the floor is 0.12; the foundations and rubble carry none) and sizes at zoom 1.0 (CSS px):');
for (const name of NEW) {
  const [w0, h0] = B.sizeOf(name), [w1, h1] = A.sizeOf(name); shares.sizes[name] = [w1, h1];
  if (TEAM.includes(name)) { const b = shares.before[name] = B.share(name), a = shares.after[name] = A.share(name); console.log(`  ${name.padEnd(22)} before ${b.toFixed(3)}  after ${a.toFixed(3)}${a < 0.12 ? '  BELOW THE FLOOR' : ''}   size ${w0.toFixed(0)}x${h0.toFixed(0)} -> ${w1.toFixed(0)}x${h1.toFixed(0)}`); }
  else console.log(`  ${name.padEnd(22)} not team   size ${w0.toFixed(0)}x${h0.toFixed(0)} -> ${w1.toFixed(0)}x${h1.toFixed(0)}`);
}
writeFileSync(join(outDir, 'shares.json'), JSON.stringify(shares, null, 1));

// ---- the phone scene, before over after: the family round the slice's two bases ----
const GOLD_NODES = [[870, 360], [970, 410], [870, 500], [970, 560]];
const SCENE = [
  it('bldg_kg_castle', 290, 450, { seat: 0 }), it('bldg_ex_hall', 1400, 450, { seat: 1 }),
  it('rt_kg_foundation_3', 560, 190, { seat: 0, layer: 0 }), it('rt_kg_scaffold_3', 560, 190, { seat: 0, layer: 2 }), it('rt_kg_rubble_3', 520, 690, { seat: 0 }),
  it('rt_ex_foundation_3', 1130, 190, { seat: 1, layer: 0 }), it('rt_ex_scaffold_3', 1130, 190, { seat: 1, layer: 2 }), it('rt_ex_rubble_3', 1180, 680, { seat: 1 }),
  it('rt_gold_0_0', ...GOLD_NODES[0]), it('rt_gold_1_1', ...GOLD_NODES[1]), it('rt_gold_2_2', ...GOLD_NODES[2]), it('rt_gold_3_3', ...GOLD_NODES[3]),
  it('rt_doodad_boulders_0', 800, 150), it('rt_doodad_boulders_1', 1000, 170), it('rt_doodad_boulders_2', 1560, 180),
  it('rt_doodad_spire_0', 1310, 740), it('rt_doodad_ruin_0', 1000, 720), it('rt_doodad_wreck_0', 780, 620),
  it('rt_doodad_crater_0', 1120, 280), it('rt_doodad_crater_1', 1230, 450), it('rt_doodad_debris_0', 900, 740), it('rt_doodad_debris_1', 1230, 620),
  it('kg_villager_1_0', 700, 300, { seat: 0 }), it('kg_villager_0_1', 740, 400, { seat: 0 }), it('kg_guard_0_0', 660, 530, { seat: 0 }), it('kg_guard_1_1', 720, 610, { seat: 0 }), it('kg_knight_2_1', 600, 740, { seat: 0 }),
  it('ex_bot_8_0', 1240, 330, { seat: 1 }), it('ex_marine_8_0', 1270, 520, { seat: 1 }), it('ex_marine_9_1', 1320, 580, { seat: 1 }), it('ex_buggy_7_1', 1560, 660, { seat: 1 }),
];
function scene(P, text, seed) {
  const c = canvas(W, H); grass(c, seed); earthBed(c, GOLD_NODES); P.place(c, SCENE);
  label(c, `${text}  GROUND ${meanValue(c, 0, H).toFixed(2)}`, 12, 12, 2);
  return c;
}
const big = canvas(W, H * 2);
big.data.set(scene(B, `BEFORE: THE GROUND FAMILY, PLAIN FINISH, SUN ${SUN}, ${ELEV}°`, 4242).data, 0);
big.data.set(scene(A, 'AFTER: THE SLICE\'S POLISH (BUILDINGS\' LIGHTS; GOLD GLINTS, LIT AND DARK SIDES, COURSES, CONTACT)', 4242).data, H * W * 4);
save('before-after.png', big); save('before-after-1x.png', half(big)); save('before-after-grey.png', grey(big));

// ---- close-ups: each piece before and after at 2x and at 4x ----
const CLOSE = [['rt_gold_0_0', null, 170], ['rt_gold_1_1', null, 170], ['rt_gold_2_2', null, 170], ['rt_gold_3_3', null, 170],
  ...['boulders_0', 'boulders_1', 'boulders_2', 'spire_0', 'spire_1', 'ruin_0', 'ruin_1', 'wreck_0', 'wreck_1', 'crater_0', 'crater_1', 'debris_0', 'debris_1'].map(p => [`rt_doodad_${p}`, null, 170]),
  ...['kg', 'ex'].flatMap(side => ['foundation', 'scaffold', 'rubble'].map(k => [`rt_${side}_${k}_3`, side === 'kg' ? 0 : 1, 340]))];
const rows = CLOSE.map(([name, seat, P]) => {
  const cell = (Pt, n) => { const c = canvas(P, P); grass(c, 7 + n + name.length); const y = P / 2 + (P > 200 ? P * 0.18 : P * 0.12); if (/^rt_gold_/.test(name)) earthBed(c, [[P / 2, y]]); Pt.blit(c, Pt.get(name), P / 2, y, { seat }); return c; };
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
save('closeups.png', closeups);

// ---- the map view with the polished pieces, at zoom 1.0 and 0.75 (retheme-ground.mjs's scene) ----
const BIG = canvas(2304, 1088);
const region = (x, y) => wobbly(x, y, 7.5, 4, 3.8, 2.6, 5) ? 'forest' : wobbly(x, y, 29, 12.5, 3.2, 2.3, 9) ? 'hill' : 0;
patch(BIG, { tw: 36, th: 17, region, seed: 4242 });
const GOLD_A = [[900, 560], [1000, 560], [900, 660], [1000, 660]], GOLD_B = [[1480, 780], [1580, 810], [1530, 890]];
earthBed(BIG, [...GOLD_A, ...GOLD_B]);
A.place(BIG, [
  it('bldg_kg_castle', 560, 700, { seat: 0 }), it('bldg_ex_hall', 1760, 520, { seat: 1 }),
  it('rt_gold_0_0', ...GOLD_A[0]), it('rt_gold_1_1', ...GOLD_A[1]), it('rt_gold_2_2', ...GOLD_A[2]), it('rt_gold_3_3', ...GOLD_A[3]),
  it('rt_gold_0_3', ...GOLD_B[0]), it('rt_gold_0_1', ...GOLD_B[1]), it('rt_gold_1_2', ...GOLD_B[2]),
  it('rt_doodad_boulders_0', 420, 200), it('rt_doodad_boulders_1', 540, 300), it('rt_doodad_boulders_2', 330, 330),
  it('rt_doodad_spire_0', 1800, 740), it('rt_doodad_ruin_0', 1940, 830), it('rt_doodad_wreck_0', 1770, 880),
  it('rt_doodad_crater_0', 1250, 300), it('rt_doodad_crater_1', 1300, 920), it('rt_doodad_debris_0', 700, 980), it('rt_doodad_debris_1', 1350, 650),
  it('kg_villager_1_0', 790, 600, { seat: 0 }), it('kg_villager_0_1', 810, 700, { seat: 0 }), it('kg_guard_0_0', 760, 830, { seat: 0 }), it('kg_archer_1_1', 700, 890, { seat: 0 }), it('kg_knight_2_1', 830, 910, { seat: 0 }),
  it('ex_bot_8_0', 1400, 780, { seat: 1 }), it('ex_marine_8_0', 1600, 620, { seat: 1 }), it('ex_marine_9_1', 1650, 680, { seat: 1 }), it('ex_mercenary_9_1', 1560, 660, { seat: 1 }), it('ex_buggy_7_1', 1500, 560, { seat: 1 }), it('ex_rover_8_0', 1660, 920, { seat: 1 }),
  it('rt_kg_scaffold_3', 330, 980, { seat: 0 }), it('rt_ex_foundation_3', 2020, 300, { seat: 1 }),
]);
const z100 = crop(BIG, (2304 - W) / 2, (1088 - H) / 2, W, H), z075 = crop(resample(BIG, 0.75), (1728 - W) / 2, (816 - H) / 2, W, H);
label(z100, `THE MAP AT ZOOM 1.0, POLISHED PIECES  GROUND ${meanValue(z100, 0, H).toFixed(2)}`, 12, 12, 2); label(z075, 'THE MAP AT ZOOM 0.75, POLISHED PIECES', 12, 12, 2);
save('map-100.png', z100); save('map-100-1x.png', half(z100)); save('map-075.png', z075); save('map-075-1x.png', half(z075));

// ---- the effects strip and the small fight, after only ----
const PROJ = ['rt_arrow', 'rt_bolt', 'rt_stone', 'rt_tracer', 'rt_dart', 'rt_tower_shot', 'rt_rocket'];
const ANIMS = [['rt_hit', 3], ['rt_muzzle', 3], ['rt_puff', 4], ['rt_trail', 4], ['rt_spark', 4], ['rt_boom_small', 6]];
function scale4(c, s, x, y) { const { w, h, data } = s.img; for (let j = 0; j < h * 4; j++) for (let i = 0; i < w * 4; i++) { const si = ((j >> 2) * w + (i >> 2)) * 4, a = data[si + 3] / 255; if (!a) continue; const px = x + i, py = y + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue; const di = (py * c.w + px) * 4; for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * a; } }
function effectsRow(c) {
  patch(c, { tw: 27, th: 13, seed: 23 });
  const list = PROJ.map((p, k) => it(p, 80 + k * 90, 60));
  let x = 60; for (const [a, n] of ANIMS) { for (let f = 0; f < n; f++) { list.push(it(`${a}_${f}`, x, 150)); x += a === 'rt_boom_small' ? 64 : 40; } x += 30; }
  for (let f = 0; f < 8; f++) list.push(it(`rt_boom_${f}`, 90 + f * 140, 300));
  list.push(it('kg_guard_0_0', 1300, 160, { seat: 0 }), it('ex_marine_8_0', 1400, 160, { seat: 1 }), it('rt_gold_0_0', 1550, 170));  // polished pieces beside the strip, for the finish check
  A.place(c, list);
  PROJ.forEach((p, k) => scale4(c, A.get(p), 40 + k * 230, 470));
  for (const [a, f, k] of [['rt_hit', 0, 0], ['rt_muzzle', 0, 1], ['rt_puff', 1, 2]]) scale4(c, A.get(`${a}_${f}`), 40 + (7 + k) * 230 - 1000, 620);
  label(c, 'THE EFFECTS (PAINTED, UNCHANGED) BESIDE POLISHED PIECES: ARROW, BOLT, STONE, TRACER, DART, TOWER SHOT, ROCKET', 12, 90, 2);
  label(c, 'HIT FLASH, MUZZLE FLASH, SMOKE, THE ROCKET\'S TRAIL, SPARKS, A UNIT\'S EXPLOSION; BELOW: A BUILDING\'S EXPLOSION, 8 FRAMES', 12, 190, 2);
  label(c, 'THE SAME AT 4X', 12, 440, 2);
}
function fightRow(c) {
  patch(c, { tw: 27, th: 13, seed: 29 });
  const ang = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0), at = (x0, y0, x1, y1, t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  const list = [
    it('kg_archer_0_0', 560, 380, { seat: 0 }), it('kg_archer_1_1', 600, 470, { seat: 0 }), it('kg_archer_0_0', 540, 560, { seat: 0 }), it('kg_ballista_0_0', 450, 480, { seat: 0 }), it('kg_trebuchet_0_3', 360, 640, { seat: 0 }), it('kg_guard_0_0', 650, 620, { seat: 0 }),
    it('ex_marine_8_0', 1120, 400, { seat: 1 }), it('ex_marine_9_1', 1170, 480, { seat: 1 }), it('ex_marine_8_0', 1100, 570, { seat: 1 }), it('ex_mercenary_9_1', 1210, 630, { seat: 1 }), it('ex_rover_8_0', 1270, 520, { seat: 1 }),
    it('rt_ex_rubble_2', 860, 470, { seat: 1 }), it('rt_boom_3', 860, 440, { layer: 2 }), it('rt_boom_small_2', 720, 520, { layer: 2 }),
    it('rt_hit_0', 1122, 388, { layer: 2 }), it('rt_spark_1', 1140, 380, { layer: 2 }), it('rt_spark_2', 1108, 402, { layer: 2 }),
    it('rt_muzzle_0', 1062, 566, { layer: 2, rot: Math.PI }),
    it('rt_stone', 760, 300, { layer: 2 }),
  ];
  const shots = [['rt_arrow', 585, 350, 1120, 390, 0.45], ['rt_arrow', 625, 440, 1170, 470, 0.6], ['rt_arrow', 565, 530, 1100, 560, 0.3], ['rt_bolt', 490, 460, 1270, 510, 0.5],
    ['rt_tracer', 1090, 392, 560, 380, 0.4], ['rt_tracer', 1140, 472, 600, 470, 0.7], ['rt_tracer', 1070, 562, 540, 560, 0.2], ['rt_tracer', 1180, 622, 650, 620, 0.55]];
  for (const [n, x0, y0, x1, y1, t] of shots) { const [x, y] = at(x0, y0, x1, y1, t); list.push(it(n, x, y, { layer: 2, rot: ang(x0, y0, x1, y1) })); }
  const [rx, ry] = at(1240, 505, 450, 475, 0.45); list.push(it('rt_rocket', rx, ry, { layer: 2, rot: ang(1240, 505, 450, 475) }));
  for (let k = 0; k < 9; k++) { const [px, py] = at(1240, 505, 450, 475, 0.45 - (k + 1) * 0.035); list.push(it(`rt_trail_${Math.min(3, Math.floor(k / 2.3))}`, px, py - k * 1.5, { layer: 2, alpha: 1 - k * 0.1 })); }
  A.place(c, list);
  label(c, 'A FIGHT WITH POLISHED UNITS: ARROWS, A BOLT AND A STONE AGAINST TRACERS AND A ROCKET; A HIT, A MUZZLE FLASH, EXPLOSIONS', 12, 740, 2);
}
{ const e = canvas(W, H * 2), r4 = canvas(W, H), r5 = canvas(W, H); effectsRow(r4); fightRow(r5); e.data.set(r4.data, 0); e.data.set(r5.data, H * W * 4); save('effects.png', e); save('effects-1x.png', half(e)); }

// ---- each polished piece alone at phone size: seats 0, 1 and 6 for the team-colored ones ----
for (const name of NEW) {
  const s = A.get(name), team = TEAM.includes(name), P = Math.max(224, s.img.h + 24), cols = team ? 3 : 1;
  const c = canvas(P * cols, P + 30); grass(c, 7 + name.length);
  const y = P / 2 + (s.img.h > 224 ? P * 0.22 : P * 0.1);
  if (/^rt_gold_/.test(name)) earthBed(c, [[P / 2, y]]);
  (team ? [0, 1, 6] : [null]).forEach((seat, k) => A.blit(c, s, P * k + P / 2, y, { seat }));
  label(c, `${name}  ${team ? `SEATS 0 1 6  TEAM ${shares.after[name].toFixed(3)} (WAS ${shares.before[name].toFixed(3)})` : 'NOT TEAM'}  ${shares.sizes[name][0].toFixed(0)}X${shares.sizes[name][1].toFixed(0)} CSS PX`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(half(c)));
}

// ---- the maker's checks: the ground's values in gray under the polished pieces, the gold against the grass ----
{
  const g = grey(z100), at = (x, y) => g.data[(y * g.w + x) * 4], med = (v) => { v.sort((a, b) => a - b); return v.length ? `${v[v.length >> 1]} (p90 ${v[Math.floor(v.length * 0.9)]})` : 'none'; };
  const X0 = (2304 - W) / 2, Y0 = (1088 - H) / 2, bins = { grass: [], forest: [], hill: [] };
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const tx = Math.floor((x + X0 - 32) / T), ty = Math.floor((y + Y0 - 32) / T); const k = region(tx, ty) || 'grass'; if (k !== 'grass' || (x > 1100 && y < 300)) bins[k].push(at(x, y)); }
  console.log('grey check (map view at zoom 1.0, sRGB 0-255, medians): grass', med(bins.grass), ' forest', med(bins.forest), ' hill', med(bins.hill));
  const lum = (Pt, name) => { const { data } = Pt.get(name).img, v = []; for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255 && (data[i] | data[i + 1] | data[i + 2])) v.push(Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])); return med(v); };
  for (const n of ['rt_gold_0_0', 'rt_gold_2_0', 'rt_doodad_boulders_0', 'rt_doodad_spire_0', 'rt_doodad_ruin_0', 'rt_kg_scaffold_3', 'rt_ex_scaffold_3', 'rt_kg_rubble_3']) console.log(`  ${n.padEnd(22)} solid px luminance before ${lum(B, n)}  after ${lum(A, n)}`);
  const goldPx = (Pt, name) => { const { data } = Pt.get(name).img; let n = 0, g2 = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255 && (data[i] | data[i + 1] | data[i + 2])) { n++; if (data[i] > 150 && data[i + 1] > 110 && data[i + 2] < 120 && data[i] - data[i + 2] > 70) g2++; } return (g2 / n).toFixed(2); };
  for (const Pt of [B, A]) console.log(`  gold's share of the outcrop's solid pixels (${Pt === B ? 'before' : 'after'}): stage 0 ${goldPx(Pt, 'rt_gold_0_0')}, stage 1 ${goldPx(Pt, 'rt_gold_1_0')}, stage 2 ${goldPx(Pt, 'rt_gold_2_0')}, stage 3 ${goldPx(Pt, 'rt_gold_3_0')}`);
}
console.log('polish-ground picture ->', outDir);
