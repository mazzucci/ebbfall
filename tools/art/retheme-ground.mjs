// The ground family's pictures (the re-theme, 2026-11-10): node tools/art/retheme-ground.mjs <outdir> [--elev=40]
// The countryside (tools/art/terrain3.js: grass, forest clumps and rocky hills on the reef's dual grid), the gold
// outcrop in four stages (tools/render3d/country.js), the scenery props, construction and rubble for each people,
// and the effects (tools/art/effects3.js), beside the slice's models for scale, at the 40-degree camera, zoom 1.0,
// seat 0 (royal blue) against seat 1 (magenta). Rows of family.png, each a landscape phone at 2x (1688x780):
//   row 0  the map view at zoom 1.0: grass, a forest clump, a rocky hill, a gold clump at its four stages, props,
//          the slice's two bases on the new ground
//   row 1  the kingdom's construction: foundation, the castle rising in its scaffold (3/8 and 6/8), rubble; sizes 2 and 3
//   row 2  the Expedition's, the same
//   row 3  every prop at 1:1 beside a Guard; the gold's four stages in four variants
//   row 4  the effects strip: every projectile and animation frame at phone size, the projectiles at 4x
//   row 5  a small fight: arrows, a bolt, a stone, tracers and a rocket in flight, a hit, a muzzle flash, explosions
// Writes family.png (2x), family-1x.png (CSS px), family-grey.png (2x, greyscale); map-100.png and map-075.png (the
// map view at each zoom, 2x, and -1x copies); fog.png (explored-but-unseen ground beside visible ground, the proposed
// dim); worn.png (worn dirt under a base's buildings, with and without); effects.png (rows 4 and 5 alone);
// models/<name>.png and <name>@2x.png (each new model alone at phone size: seats 0, 1 and 6 for the team-coloured
// ones, with the share in the label; -protan and -deutan copies); shares.json (shares and sizes at zoom 1.0).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile, VARIANTS } from './terrain3.js';
import { effectSprites } from './effects3.js';
import { hash2, vnoise } from './raster.js';
import { canvas, SEAT0, seatTints, makePainters, half, resample, crop, simulate, grey, meanValue, label } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/ground';
const ELEV = +opt('elev', 40);
mkdirSync(join(outDir, 'models'), { recursive: true });
const T = 64, W = 1688, H = 780;

// ---- what to render ----
const FILTER = '^rt_|^bldg_(kg_castle|ex_hall)$|^kg_(villager|guard|archer)_(0|1|15)_[01]$|^kg_knight_2_1$|^kg_ballista_0_0$|^kg_trebuchet_0_3$|^ex_(marine|bot|rover)_8_0$|^ex_(marine|mercenary)_9_1$|^ex_buggy_7_1$';
const t0 = Date.now();
const fresh = await render3d(FILTER, { elev: ELEV });
for (const e of effectSprites()) fresh.push(e);
console.log(`rendered ${fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const TINTS = seatTints(fresh.tints);
console.log(`seat 0 drawn as #${SEAT0.toString(16)} (tint #${TINTS[0].toString(16)}; the game's gold stays in src/)`);
const { get, has, share, sizeOf } = makePainters(fresh, TINTS);
const tintOf = (seat) => { const c = TINTS[seat]; return [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v / 255); };
const SHADOW = 1.45; // the finish's ground shadow firmed on grass, as the slice's rows

// ---- painting ----
/** A sprite with its anchor at (x, y): `seat` tints its team mask; `rot` turns it about the anchor (a projectile towards
 *  its target); `fromRow` draws only its rows from there down (the renderer's construction reveal); `alpha`. */
function blit(c, s, x, y, { seat = null, rot = 0, fromRow = 0, alpha = 1 } = {}) {
  const { w, h, data } = s.img, m = seat === null || !has(s.name + '_m') ? null : get(s.name + '_m').img, tc = seat === null ? null : tintOf(seat);
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
/** Items {name, x, y, seat?, rot?, fromRow?, alpha?, layer?} drawn by layer (0 decals, 1 the ground sort by y, 2 air). */
const place = (c, list) => { for (const it of list.slice().sort((a, b) => (a.layer ?? 1) - (b.layer ?? 1) || a.y - b.y)) blit(c, get(it.name), it.x, it.y, it); };
const it = (name, x, y, o = {}) => ({ name, x, y, ...o });

// ---- the ground: the dual grid as gl/render.js draws it, the tiles picked as the client picks them ----
const tiles = {}; const getTile = (m, v) => tiles[`${m}_${v}`] ??= tile(m, v);
/** The marks' chance on grass, proposed: the client's cluster noise (gl/ground.js groundTile, up to 0.4 for kelp) scaled
 *  to at most 0.14 for dirt patches: a swarm of them read as a mud field. */
const MARK_SCALE = 0.35;
function groundVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > MARK_SCALE) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function blitTile(c, t, x0, y0) { for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), (py * c.w + px) * 4); } } }
/** `region(tx, ty)`: 0 open ground, 'forest' or 'hill' (a blocking region's kind: the proposed client rule picks the
 *  variant half by the region, the variant inside it by the cell's draw as today). */
function patch(c, { tw, th, region = () => 0, seed = 1 }) {
  const R = (x, y) => region(x, y) || 0, rnd = mulberry(seed * 7 + 3);
  for (let j = -1; j < th; j++) for (let i = -1; i < tw; i++) {
    const q = [R(i, j), R(i + 1, j), R(i, j + 1), R(i + 1, j + 1)], m = (q[0] ? 1 : 0) | (q[1] ? 2 : 0) | (q[2] ? 4 : 0) | (q[3] ? 8 : 0), r = rnd();
    const n = VARIANTS(m), v = m === 0 ? groundVariant(r, i, j, seed) : (q.find(Boolean) === 'forest' ? n : 0) + Math.floor(r * n);
    blitTile(c, getTile(m, v), i * T + T / 2, j * T + T / 2);
  }
}
/** The bed under a gold clump (the client's crust layer today, proposed as bare trodden earth): the union of soft blobs
 *  round its nodes, broken by noise, the grass showing through. */
function earthBed(c, nodes) {
  const col = [104, 94, 70];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    let a = 0; for (const [nx, ny] of nodes) { const d = Math.hypot(x - nx, (y - ny) / 0.85); if (d < 60) a = Math.max(a, Math.min(1, (60 - d) / 26)); }
    if (!a) continue;
    a *= 0.55 + (vnoise(x, y, 7, 31, 0) - 0.5) * 0.5; if (a <= 0) continue;
    const i = (y * c.w + x) * 4; for (let k = 0; k < 3; k++) c.data[i + k] = c.data[i + k] * (1 - a) + col[k] * a;
  }
}
/** The explored-but-unseen dim: the fog layer's colour at alpha `a` over everything, from x0 on (softened over 24 px). */
function fogDim(c, x0, rgb, a) {
  for (let y = 0; y < c.h; y++) for (let x = Math.max(0, x0 - 12); x < c.w; x++) { const k = a * Math.min(1, (x - x0 + 12) / 24), i = (y * c.w + x) * 4; for (let q = 0; q < 3; q++) c.data[i + q] = c.data[i + q] * (1 - k) + rgb[q] * k; }
}
const wobbly = (x, y, cx, cy, rx, ry, seed) => Math.hypot((x - cx) / rx, (y - cy) / ry) + (hash2(x, y, seed) - 0.5) * 0.5 < 1;
const save = (name, c) => writeFileSync(join(outDir, name), encodePNG(c));

// ---- shares and sizes ----
const NEW = fresh.filter(s => /^rt_/.test(s.name) && !s.trim && !/^rt_coins$/.test(s.name)).map(s => s.name);
const TEAM = NEW.filter(n => has(n + '_m'));
const shares = {}, sizes = {};
console.log('team colour share of the solid pixels (the floor is 0.12; floors, not targets) and sizes at zoom 1.0 (CSS px):');
/** A decal's size: the box of every painted pixel (sizeOf counts only solid ones). */
const sizeAny = (name) => { const { w, h, data } = get(name).img; let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [(x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2]; };
for (const name of NEW) { const [w, h] = sizes[name] = /^rt_worn_/.test(name) ? sizeAny(name) : sizeOf(name); if (TEAM.includes(name)) { shares[name] = share(name); console.log(`  ${name.padEnd(22)} ${shares[name].toFixed(3)}${shares[name] < 0.12 ? '  BELOW THE FLOOR' : ''}   ${w.toFixed(0)} x ${h.toFixed(0)}`); } else console.log(`  ${name.padEnd(22)} not team   ${w.toFixed(0)} x ${h.toFixed(0)}`); }
writeFileSync(join(outDir, 'shares.json'), JSON.stringify({ shares, sizes }, null, 1));

// ---- row 0: the map view ----
const BIG = canvas(2304, 1088);
const region = (x, y) => wobbly(x, y, 7.5, 4, 3.8, 2.6, 5) ? 'forest' : wobbly(x, y, 29, 12.5, 3.2, 2.3, 9) ? 'hill' : 0;
patch(BIG, { tw: 36, th: 17, region, seed: 4242 });
const GOLD_A = [[900, 560], [1000, 560], [900, 660], [1000, 660]], GOLD_B = [[1480, 780], [1580, 810], [1530, 890]];
earthBed(BIG, [...GOLD_A, ...GOLD_B]);
const MAP = [
  it('bldg_kg_castle', 560, 700, { seat: 0 }), it('bldg_ex_hall', 1760, 520, { seat: 1 }),
  it('rt_gold_0_0', ...GOLD_A[0]), it('rt_gold_1_1', ...GOLD_A[1]), it('rt_gold_2_2', ...GOLD_A[2]), it('rt_gold_3_3', ...GOLD_A[3]),
  it('rt_gold_0_3', ...GOLD_B[0]), it('rt_gold_0_1', ...GOLD_B[1]), it('rt_gold_1_2', ...GOLD_B[2]),
  it('rt_doodad_boulders_0', 420, 200), it('rt_doodad_boulders_1', 540, 300), it('rt_doodad_boulders_2', 330, 330),
  it('rt_doodad_spire_0', 1800, 740), it('rt_doodad_ruin_0', 1940, 830), it('rt_doodad_wreck_0', 1770, 880),
  it('rt_doodad_crater_0', 1250, 300), it('rt_doodad_crater_1', 1300, 920), it('rt_doodad_debris_0', 700, 980), it('rt_doodad_debris_1', 1350, 650),
  it('kg_villager_1_0', 790, 600, { seat: 0 }), it('kg_villager_0_1', 810, 700, { seat: 0 }), it('kg_guard_0_0', 760, 830, { seat: 0 }), it('kg_archer_1_1', 700, 890, { seat: 0 }), it('kg_knight_2_1', 830, 910, { seat: 0 }),
  it('ex_bot_8_0', 1400, 780, { seat: 1 }), it('ex_marine_8_0', 1600, 620, { seat: 1 }), it('ex_marine_9_1', 1650, 680, { seat: 1 }), it('ex_mercenary_9_1', 1560, 660, { seat: 1 }), it('ex_buggy_7_1', 1500, 560, { seat: 1 }), it('ex_rover_8_0', 1660, 920, { seat: 1 }),
  it('rt_kg_scaffold_3', 330, 980, { seat: 0 }), it('rt_ex_foundation_3', 2020, 300, { seat: 1 }),
];
place(BIG, MAP);
const z100 = crop(BIG, (2304 - W) / 2, (1088 - H) / 2, W, H), z075 = crop(resample(BIG, 0.75), (1728 - W) / 2, (816 - H) / 2, W, H);
save('map-100.png', z100); save('map-100-1x.png', half(z100)); save('map-075.png', z075); save('map-075-1x.png', half(z075));

// ---- rows 1 and 2: construction and rubble, each people ----
function constructionRow(c, side, bldg, seat, seed) {
  patch(c, { tw: 27, th: 13, seed });
  const b = get(bldg), row = (k) => Math.round(b.img.h * (1 - k / 8)), Y = 330, X = [210, 580, 950, 1320];
  const list = [it(`rt_${side}_foundation_4`, X[0], Y, { seat })];
  for (const [k, st] of [[1, 3], [2, 6]]) list.push(it(`rt_${side}_foundation_4`, X[k], Y, { seat, layer: 0 }), it(bldg, X[k], Y, { seat, fromRow: row(st) }), it(`rt_${side}_scaffold_4`, X[k], Y, { seat, layer: 2 }));
  list.push(it(`rt_${side}_rubble_4`, X[3], Y, { seat }));
  let x = 150; for (const n of [2, 3]) { for (const kind of ['foundation', 'scaffold', 'rubble']) { list.push(it(`rt_${side}_${kind}_${n}`, x, 690, { seat })); x += n * 64 + 60; } x += 60; }
  place(c, list);
}

// ---- row 3: the props at 1:1 and the gold's stages ----
const PROPS = ['boulders_0', 'boulders_1', 'boulders_2', 'spire_0', 'spire_1', 'ruin_0', 'ruin_1', 'wreck_0', 'wreck_1', 'crater_0', 'crater_1', 'debris_0', 'debris_1'];
function propsRow(c) {
  patch(c, { tw: 27, th: 13, seed: 17 });
  const list = PROPS.map((p, k) => it(`rt_doodad_${p}`, 80 + k * 122, 270));
  list.push(it('kg_guard_0_0', 1640, 270, { seat: 0 }));
  const nodes = []; for (let st = 0; st < 4; st++) for (let v = 0; v < 4; v++) nodes.push([70 + (st * 4 + v) * 105, 620]);
  earthBed(c, nodes);
  nodes.forEach(([x, y], k) => list.push(it(`rt_gold_${Math.floor(k / 4)}_${k % 4}`, x, y)));
  place(c, list);
  label(c, 'PROPS: TREES (BOULDERS), SPIRES, RUINS, CARTS (WRECK), STUMP, PUDDLE (CRATER), FLOWERS, STONES (DEBRIS); A GUARD FOR SCALE', 12, 390, 2);
  label(c, 'THE GOLD: STAGES 0 TO 3, EACH IN ITS FOUR VARIANTS, ON THE PROPOSED EARTH BED', 12, 720, 2);
}

// ---- row 4: the effects strip ----
const PROJ = ['rt_arrow', 'rt_bolt', 'rt_stone', 'rt_tracer', 'rt_dart', 'rt_tower_shot', 'rt_rocket'];
const ANIMS = [['rt_hit', 3], ['rt_muzzle', 3], ['rt_puff', 4], ['rt_trail', 4], ['rt_spark', 4], ['rt_boom_small', 6]];
function scale4(c, s, x, y) { const { w, h, data } = s.img; for (let j = 0; j < h * 4; j++) for (let i = 0; i < w * 4; i++) { const si = ((j >> 2) * w + (i >> 2)) * 4, a = data[si + 3] / 255; if (!a) continue; const px = x + i, py = y + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue; const di = (py * c.w + px) * 4; for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * a; } }
function effectsRow(c) {
  patch(c, { tw: 27, th: 13, seed: 23 });
  const list = PROJ.map((p, k) => it(p, 80 + k * 90, 60));
  let x = 60; for (const [a, n] of ANIMS) { for (let f = 0; f < n; f++) { list.push(it(`${a}_${f}`, x, 150)); x += a === 'rt_boom_small' ? 64 : 40; } x += 30; }
  for (let f = 0; f < 8; f++) list.push(it(`rt_boom_${f}`, 90 + f * 140, 300));
  place(c, list);
  PROJ.forEach((p, k) => { const s = get(p); scale4(c, s, 40 + k * 230, 470); });
  for (const [a, f, k] of [['rt_hit', 0, 0], ['rt_muzzle', 0, 1], ['rt_puff', 1, 2]]) scale4(c, get(`${a}_${f}`), 40 + (7 + k) * 230 - 1000, 620);
  label(c, 'PROJECTILES AT PHONE SIZE: ARROW, BALLISTA BOLT, TREBUCHET STONE, RIFLE TRACER, DRONE DART, RADIO TOWER SHOT, ROCKET', 12, 90, 2);
  label(c, 'HIT FLASH, MUZZLE FLASH, SMOKE, THE ROCKET\'S TRAIL, SPARKS, A UNIT\'S EXPLOSION; BELOW: A BUILDING\'S EXPLOSION, 8 FRAMES', 12, 190, 2);
  label(c, 'THE SAME AT 4X', 12, 440, 2);
}

// ---- row 5: the fight ----
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
  // the trail: a puff every 14 world px behind the rocket (the renderer's spawn rate at the rocket's speed), each older
  // one a later frame and fainter (the renderer fades a puff over its life), so they overlap into one soft trail
  for (let k = 0; k < 9; k++) { const [px, py] = at(1240, 505, 450, 475, 0.45 - (k + 1) * 0.035); list.push(it(`rt_trail_${Math.min(3, Math.floor(k / 2.3))}`, px, py - k * 1.5, { layer: 2, alpha: 1 - k * 0.1 })); }
  place(c, list);
  label(c, 'A FIGHT: ARROWS, A BOLT AND A STONE AGAINST TRACERS AND A ROCKET WITH ITS SMOKE; A HIT, A MUZZLE FLASH, A BUILDING\'S AND A UNIT\'S EXPLOSION', 12, 740, 2);
}

// ---- family.png ----
const rows = [
  { text: `ROW 0  THE MAP AT ZOOM 1.0: GRASS, A FOREST CLUMP, A ROCKY HILL, GOLD AT ITS FOUR STAGES, PROPS, THE SLICE'S BASES`, make: (c) => c.data.set(z100.data) },
  { text: 'ROW 1  THE KINGDOM: FOUNDATION, THE CASTLE RISING IN ITS SCAFFOLD (3/8, 6/8), RUBBLE; SIZES 2 AND 3 BELOW', make: (c) => constructionRow(c, 'kg', 'bldg_kg_castle', 0, 11) },
  { text: 'ROW 2  THE EXPEDITION: FOUNDATION, THE DATA CENTRE RISING IN ITS SCAFFOLD, RUBBLE; SIZES 2 AND 3 BELOW', make: (c) => constructionRow(c, 'ex', 'bldg_ex_hall', 1, 13) },
  { text: 'ROW 3  THE SCENERY AT 1:1 AND THE GOLD OUTCROP', make: propsRow },
  { text: 'ROW 4  THE EFFECTS', make: effectsRow },
  { text: 'ROW 5  THE FIGHT', make: fightRow },
];
const big = canvas(W, H * rows.length), singles = [];
rows.forEach((row, n) => {
  const sub = canvas(W, H); row.make(sub);
  const gv = meanValue(sub, 0, H);
  label(sub, `${row.text}  GROUND ${gv.toFixed(2)}`, 12, 12, 2);
  big.data.set(sub.data, n * H * W * 4); singles.push(sub);
  console.log(`row ${n}: mean value ${gv.toFixed(3)}`);
});
save('family.png', big); save('family-1x.png', half(big)); save('family-grey.png', grey(big));
{ const e = canvas(W, H * 2); e.data.set(singles[4].data, 0); e.data.set(singles[5].data, H * W * 4); save('effects.png', e); save('effects-1x.png', half(e)); }

// ---- the fog mock-up: the map view, its east part explored but unseen ----
const FOG = { rgb: [18, 22, 34], a: 0.45 };
{
  const c = canvas(W, H + 330); c.data.set(z100.data);
  fogDim(c, 760, FOG.rgb, FOG.a);
  label(c, `VISIBLE  |  EXPLORED, UNSEEN: FOG RGB ${FOG.rgb.join(',')} AT ALPHA ${FOG.a} (TODAY 5,7,11 AT 0.55)`, 12, 12, 2);
  [0.35, 0.45, 0.55].forEach((a, k) => { const sw = crop(z100, 380, 330, 560, 300); fogDim(sw, 0, FOG.rgb, a); label(sw, `ALPHA ${a}`, 6, 6, 2); for (let y = 0; y < 300; y++) c.data.set(sw.data.subarray(y * 560 * 4, (y + 1) * 560 * 4), ((H + 20 + y) * W + 4 + k * 562) * 4); });
  save('fog.png', c); save('fog-1x.png', half(c));
}

// ---- the worn-dirt mock-up: a base's buildings with the decal under them, and without ----
{
  const c = canvas(W, H * 2);
  for (const [n, worn] of [[0, true], [1, false]]) {
    const sub = canvas(W, H); patch(sub, { tw: 27, th: 13, seed: 31 });
    const list = [it('bldg_kg_castle', 400, 470, { seat: 0 }), it('rt_kg_scaffold_3', 780, 560, { seat: 0 }), it('rt_kg_foundation_2', 620, 700, { seat: 0 }), it('bldg_ex_hall', 1300, 470, { seat: 1 }), it('rt_ex_foundation_2', 1620, 660, { seat: 1 }), it('rt_ex_scaffold_2', 1080, 690, { seat: 1 }),
      it('kg_villager_1_0', 560, 520, { seat: 0 }), it('kg_guard_0_0', 520, 640, { seat: 0 }), it('ex_bot_8_0', 1480, 560, { seat: 1 }), it('ex_marine_8_0', 1440, 660, { seat: 1 })];
    if (worn) list.push(it('rt_worn_4', 400, 470, { layer: 0 }), it('rt_worn_3', 780, 560, { layer: 0 }), it('rt_worn_2', 620, 700, { layer: 0 }), it('rt_worn_4', 1300, 470, { layer: 0 }), it('rt_worn_2', 1620, 660, { layer: 0 }), it('rt_worn_2', 1080, 690, { layer: 0 }));
    place(sub, list);
    label(sub, worn ? 'WORN DIRT UNDER EACH BUILDING (A DECAL IN THE GROUND LAYER: FOOTPRINT + 22 WORLD PX, ALPHA 0.55 MAX, NO PATHS)' : 'THE SAME WITHOUT', 12, 12, 2);
    c.data.set(sub.data, n * H * W * 4);
  }
  save('worn.png', c); save('worn-1x.png', half(c));
}

// ---- each new model alone at phone size: seats 0, 1 and 6 for the team-coloured ones ----
for (const name of NEW) {
  const s = get(name), team = TEAM.includes(name), P = Math.max(224, s.img.h + 24), cols = team ? 3 : 1;
  const c = canvas(P * cols, P + 30); patch(c, { tw: Math.ceil(c.w / T) + 1, th: Math.ceil(c.h / T) + 1, seed: 7 + name.length });
  if (/^rt_gold_/.test(name)) earthBed(c, [[P / 2, P / 2 + P * 0.1]]);
  (team ? [0, 1, 6] : [null]).forEach((seat, k) => blit(c, s, P * k + P / 2, P / 2 + (s.img.h > 224 ? P * 0.22 : P * 0.1), { seat }));
  label(c, `${name}  ${team ? `SEATS 0 1 6  TEAM ${shares[name].toFixed(3)}` : 'NOT TEAM'}  ${sizes[name][0].toFixed(0)}X${sizes[name][1].toFixed(0)} CSS PX`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); const h1 = half(c); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(h1));
  if (team || /^rt_gold_/.test(name)) for (const mode of ['protan', 'deutan']) writeFileSync(join(outDir, 'models', `${name}-${mode}.png`), encodePNG(simulate(h1, mode)));
}

// ---- the maker's checks: the ground's values in grey, the gold against the grass ----
{
  const g = grey(z100), at = (x, y) => g.data[(y * g.w + x) * 4], med = (v) => { v.sort((a, b) => a - b); return v.length ? `${v[v.length >> 1]} (p90 ${v[Math.floor(v.length * 0.9)]})` : 'none'; };
  const X0 = (2304 - W) / 2, Y0 = (1088 - H) / 2, bins = { grass: [], forest: [], hill: [] };
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const tx = Math.floor((x + X0 - 32) / T), ty = Math.floor((y + Y0 - 32) / T); const k = region(tx, ty) || 'grass'; if (k !== 'grass' || (x > 1100 && y < 300)) bins[k].push(at(x, y)); }
  console.log('grey check (map view at zoom 1.0, sRGB 0-255, medians): grass', med(bins.grass), ' forest', med(bins.forest), ' hill', med(bins.hill));
  const lum = (name) => { const { data } = get(name).img, v = []; for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255 && (data[i] | data[i + 1] | data[i + 2])) v.push(Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])); return med(v); };
  for (const n of ['rt_gold_0_0', 'rt_gold_2_0', 'rt_doodad_boulders_0', 'rt_doodad_spire_0', 'rt_kg_scaffold_3', 'rt_ex_scaffold_3']) console.log(`  ${n.padEnd(22)} solid px luminance ${lum(n)}`);
  const goldPx = (name) => { const { data } = get(name).img; let n = 0, g2 = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255 && (data[i] | data[i + 1] | data[i + 2])) { n++; if (data[i] > 150 && data[i + 1] > 110 && data[i + 2] < 120 && data[i] - data[i + 2] > 70) g2++; } return (g2 / n).toFixed(2); };
  console.log(`  gold's share of the outcrop's solid pixels: stage 0 ${goldPx('rt_gold_0_0')}, stage 1 ${goldPx('rt_gold_1_0')}, stage 2 ${goldPx('rt_gold_2_0')}, stage 3 ${goldPx('rt_gold_3_0')}`);
}
console.log('ground family picture ->', outDir);
