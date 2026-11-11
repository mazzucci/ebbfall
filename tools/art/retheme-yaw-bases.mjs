// The yaw bases picture (2026-11-11, after retheme-yaw.mjs): would bases look less like a grid of identical squares if
// each building were turned a little about the vertical? Whole bases laid out as a player would, on the game's grass
// tiles with the seats' colours, a few units and the gold mine for scale, at zoom 1.0 and 0.75, each at 2x with a -1x
// copy in CSS px. Every turned building is fitted to its footprint (retheme.js `turns`, scale 'fit': its ground
// outline stays inside the footprint; footprint, hit area and rules unchanged), and the sun is the scene's: turning the
// model never turns the light.
//   node tools/art/retheme-yaw-bases.mjs [outdir]      (target/yaw-bases by default)
// The angles (the spec): the Kingdom -10/-5/0/+5/+10 by building id (id mod 5, as a client-only cosmetic would pick
// them), the Expedition -5/0/+5 (id mod 3), the Radio towers -10/0/+10 (id mod 3); the landmarks fixed, the Castle +11
// (its banners' side towards the camera), the Data center +5. A turned Watchtower's or Radio tower's head is scaled as
// its base is and drawn over it, facing as the game would face it.
// Shadows (Stelian's addition): the turned pictures draw the buildings' cast shadow at alpha 110 (polish.js `shadow`,
// matched to the units' `unitShadow`, one sun one tone), crisp, as long as today's; the square comparison keeps today's
// 150; buildings-shadow-match.png puts a few buildings at 150 over the same at 110.
//   kingdom-turned-100.png / -075: the Kingdom base, every building at its variant     (+ -labels: the angle under each)
//   kingdom-square-100.png / -075: the same base with today's square buildings and today's shadow
//   expedition-turned-100.png / -075: the Expedition base with two forward Radio towers (+ -labels)
//   buildings-shadow-match.png: today's shadow (150) over the matched one (110), square buildings and two units
//   fits.json and the printed table: per building and angle the fit's scale and the drawn body's spill past the
//   footprint (west, east, south, world px), plus the extra atlas frames and their area if the variants were shipped.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, makePainters, half, resample, label } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const outDir = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'target/yaw-bases';
mkdirSync(outDir, { recursive: true });
const T = 64; // a tile at 2x
const MATCHED = { alpha: 110, soft: 0 }; // the buildings' cast shadow matched to the units' (today: 150, crisp)

// ---- the angles ----
const KG_ANGLES = [-10, -5, 0, 5, 10], EX_ANGLES = [-5, 0, 5], WARD_ANGLES = [-10, 0, 10], CASTLE = 11, HALL = 5;
const ANGLES = [...new Set([...KG_ANGLES, ...EX_ANGLES, ...WARD_ANGLES, CASTLE, HALL])].filter(a => a !== 0).sort((a, b) => a - b);
/** The angle a building of `kind` with id `id` gets. */
function angleOf(kind, id) {
  if (kind === 'kg_castle') return CASTLE; if (kind === 'ex_hall') return HALL;
  if (kind === 'ex_radio') return WARD_ANGLES[id % 3];
  return kind.startsWith('kg_') ? KG_ANGLES[id % 5] : EX_ANGLES[id % 3];
}

// ---- what to render ----
const SIZES = { kg_castle: 4, kg_cottage: 2, kg_market: 2, kg_barracks: 3, kg_blacksmith: 2, kg_workshop: 3, kg_tower: 2, kg_stables: 3, ex_hall: 4, ex_bunkhouse: 2, ex_post: 2, ex_factory: 3, ex_lab: 2, ex_radio: 2, ex_portal: 2 };
const TITLES = { kg_castle: 'Castle', kg_cottage: 'Cottage', kg_market: 'Market', kg_barracks: 'Barracks', kg_blacksmith: 'Blacksmith', kg_workshop: 'Workshop', kg_tower: 'Watchtower', kg_stables: 'Stables', ex_hall: 'Data center', ex_bunkhouse: 'Cabin', ex_post: 'Recruiting post', ex_factory: 'Factory', ex_lab: 'Lab', ex_radio: 'Radio tower', ex_portal: 'Portal' };
const HEADS = { kg_tower: 'kg_towerhead', ex_radio: 'ex_radiohead' }, HEAD_DIRS = [0, 2, 14];
const UNITS = '(kg_villager|kg_guard|ex_bot|ex_marine)_(0|2|4|6|8|10|12|14)_0';
const t0 = Date.now();
const turned = await render3d(`^(bldg_|${UNITS}|rt_gold_0_0|(kg_towerhead|ex_radiohead)_(${HEAD_DIRS.join('|')})(@|$))`, { polish: { shadow: MATCHED }, turns: [{ yaw: 0, scale: 'fit' }, ...ANGLES.map(yaw => ({ yaw, scale: 'fit' }))] });
const square = await render3d('^bldg_', { polish: true }); // today's: square, shadow 150
console.log(`rendered ${turned.length + square.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makePainters(turned, turned.tints), Q = makePainters(square, square.tints); // (the game's own seat tints; shadows as the game draws them)
/** The rendered name of `base` turned `yaw` (its fit scale in the name) or the square one at yaw 0. */
function turnedName(base, yaw) {
  if (!yaw) return base;
  const s = turned.find(s => s.name.startsWith(`${base}@y${yaw}s`) && !s.name.endsWith('_m')); if (!s) throw new Error(`${base} at ${yaw} was not rendered`);
  return s.name;
}
const scaleOf = (name) => name.includes('@') ? +name.slice(name.lastIndexOf('s') + 1) : 1;

// ---- fits: every building at every angle, and the drawn body's spill past the footprint ----
const solid = (d, i) => d[i + 3] === 255 && (d[i] || d[i + 1] || d[i + 2]);
function spill(s, n) {
  const { w, h, data } = s.img, ax = s.anchor.x * w, ay = s.anchor.y * h, F = n * T / 2;
  let x0 = w, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!solid(data, (y * w + x) * 4)) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const px = (v) => +(v / 2).toFixed(1);
  return { W: px(Math.max(0, -F - (x0 - ax))), E: px(Math.max(0, x1 + 1 - ax - F)), S: px(Math.max(0, y1 + 1 - ay - F)) };
}
const fits = {};
console.log('building          angle  fit    drawn spill W / E / S (world px; the square building first)');
for (const kind of Object.keys(SIZES)) {
  const n = SIZES[kind], base = `bldg_${kind}`, rows = fits[kind] = {};
  for (const yaw of [0, ...ANGLES]) {
    const name = turnedName(base, yaw), sp = spill(P.get(name), n), fit0 = yaw ? null : scaleOf(turned.find(s => s.name.startsWith(`${base}@y0s`) && !s.name.endsWith('_m')).name);
    rows[yaw] = { scale: scaleOf(name), ...sp, ...(yaw ? {} : { fitAtZero: fit0 }) };
    console.log(`  ${TITLES[kind].padEnd(16)} ${String(yaw).padStart(4)}  ${rows[yaw].scale.toFixed(2)}   ${sp.W} / ${sp.E} / ${sp.S}${yaw ? '' : `   (the square outline's own fit: ${fit0.toFixed(2)})`}`);
  }
}

// ---- the extra atlas frames the variants would cost (the Kingdom 4 per building, the Expedition 2, the Radio tower 2, the landmarks a swap) ----
{
  const bbox = (img) => { const { w, h, data } = img; let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? 0 : (x1 - x0 + 1) * (y1 - y0 + 1); };
  let frames = 0, area = 0, today = 0;
  for (const kind of Object.keys(SIZES)) {
    const base = `bldg_${kind}`, extra = kind === 'kg_castle' || kind === 'ex_hall' ? [] : kind === 'ex_radio' ? WARD_ANGLES : kind.startsWith('kg_') ? KG_ANGLES : EX_ANGLES;
    today += bbox(P.get(base).img) + bbox(P.get(base + '_m').img);
    for (const yaw of extra.filter(a => a)) { const name = turnedName(base, yaw); frames += 2; area += bbox(P.get(name).img) + bbox(P.get(name + '_m').img); }
  }
  fits.atlas = { extraFrames: frames, extraAreaPx: area, todaysBuildingAreaPx: today, note: 'trimmed body + mask frames at atlas scale 2; the landmarks swap their frame, no extra' };
  console.log(`atlas growth: +${frames} frames, +${(area / 1e6).toFixed(2)} Mpx trimmed (today's 30 building frames: ${(today / 1e6).toFixed(2)} Mpx)`);
}
writeFileSync(join(outDir, 'fits.json'), JSON.stringify(fits, null, 1));

// ---- the ground: the game's grass tiles (retheme-yaw.mjs's layout) ----
const tiles = {}; const getTile = (m, v) => tiles[`${m}_${v}`] ??= tile(m, v);
function groundVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > 0.35) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function grass(c, seed) {
  const rnd = mulberry(seed * 7 + 3);
  for (let j = -1; j < Math.ceil(c.h / T) + 1; j++) for (let i = -1; i < Math.ceil(c.w / T) + 1; i++) {
    const t = getTile(0, groundVariant(rnd(), i, j, seed)), x0 = i * T + T / 2, y0 = j * T + T / 2;
    for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), ((py) * c.w + px) * 4); } }
  }
}

// ---- the bases: [kind, tx, ty] in placement order (the id), units [name, tx, ty] at tile coordinates (fractions allowed) ----
const KINGDOM = [['kg_castle', 10, 7], ['kg_cottage', 5, 2], ['kg_cottage', 8, 2], ['kg_cottage', 5, 5], ['kg_cottage', 8, 5], ['kg_blacksmith', 12, 3], ['kg_barracks', 15, 2],
  ['kg_market', 16, 7], ['kg_stables', 16, 11], ['kg_workshop', 4, 10], ['kg_tower', 21, 4], ['kg_tower', 21, 13], ['kg_cottage', 12, 12]];
const EXPEDITION = [['ex_hall', 10, 7], ['ex_bunkhouse', 5, 2], ['ex_bunkhouse', 8, 2], ['ex_bunkhouse', 5, 5], ['ex_bunkhouse', 8, 5], ['ex_post', 12, 3], ['ex_post', 15, 3],
  ['ex_factory', 16, 7], ['ex_lab', 16, 11], ['ex_portal', 4, 10], ['ex_radio', 21, 4], ['ex_radio', 21, 13], ['ex_bunkhouse', 12, 12]];
const KG_UNITS = [['kg_villager_0_0', 15.2, 9.4], ['kg_villager_2_0', 18.6, 8.2], ['kg_villager_8_0', 19.8, 10.1], ['kg_villager_12_0', 20.4, 7.3], ['kg_guard_4_0', 15.5, 5.8], ['kg_guard_4_0', 16.4, 5.9], ['kg_guard_4_0', 17.3, 6.0], ['kg_guard_0_0', 9.5, 12.6]];
const EX_UNITS = [['ex_bot_0_0', 15.2, 9.4], ['ex_bot_2_0', 18.6, 8.2], ['ex_bot_8_0', 19.8, 10.1], ['ex_bot_12_0', 20.4, 7.3], ['ex_marine_4_0', 15.5, 5.8], ['ex_marine_4_0', 16.4, 5.9], ['ex_marine_4_0', 17.3, 6.0], ['ex_marine_0_0', 9.5, 12.6]];
const GOLD = [21.5, 9.2];
const PANEL = [25, 17]; // tiles

/** Draws a base: `mode` 'turned' (each building at its variant, P's matched shadow) or 'square' (today's, Q). */
function base(list, units, seat, mode, labels = false) {
  const c = canvas(PANEL[0] * T, PANEL[1] * T); grass(c, seat + 11);
  const items = [], pr = mode === 'turned' ? P : Q;
  list.forEach(([kind, tx, ty], id) => {
    const n = SIZES[kind], yaw = mode === 'turned' ? angleOf(kind, id) : 0, name = mode === 'turned' ? turnedName(`bldg_${kind}`, yaw) : `bldg_${kind}`;
    const x = (tx + n / 2) * T, y = (ty + n / 2) * T, draw = [(cc) => pr.draw(cc, pr.get(name), x, y, seat)];
    if (HEADS[kind]) { const dir = HEAD_DIRS[id % HEAD_DIRS.length], hn = `${HEADS[kind]}_${dir}` + (yaw ? name.slice(name.indexOf('@')) : ''); draw.push((cc) => P.draw(cc, P.get(hn), x, y, seat)); }
    items.push({ y, draw, lbl: labels ? [yaw > 0 ? `+${yaw}` : String(yaw), tx * T + 2, (ty + n) * T - 20] : null });
  });
  for (const [name, tx, ty] of units) items.push({ y: ty * T, draw: [(cc) => P.draw(cc, P.get(name), tx * T, ty * T, seat)] });
  items.push({ y: GOLD[1] * T, draw: [(cc) => P.draw(cc, P.get('rt_gold_0_0'), GOLD[0] * T, GOLD[1] * T)] });
  for (const it of items.sort((a, b) => a.y - b.y)) for (const d of it.draw) d(c);
  for (const it of items) if (it.lbl) label(c, ...it.lbl, 2);
  return c;
}
const save = (name, c) => { writeFileSync(join(outDir, `${name}.png`), encodePNG(c)); writeFileSync(join(outDir, `${name}-1x.png`), encodePNG(half(c))); };
function picture(name, c, caption) {
  const z = resample(c, 0.75);
  label(c, caption, 6, 6, 2); save(`${name}-100`, c);
  label(z, `${caption}  ZOOM 0.75`, 6, 6, 2); save(`${name}-075`, z);
}
picture('kingdom-turned', base(KINGDOM, KG_UNITS, 0, 'turned'), 'KINGDOM TURNED -10/-5/0/+5/+10 BY ID, CASTLE +11, SHADOW 110');
save('kingdom-turned-100-labels', base(KINGDOM, KG_UNITS, 0, 'turned', true));
picture('kingdom-square', base(KINGDOM, KG_UNITS, 0, 'square'), 'KINGDOM TODAY: SQUARE, SHADOW 150');
picture('expedition-turned', base(EXPEDITION, EX_UNITS, 1, 'turned'), 'EXPEDITION TURNED -5/0/+5 BY ID, RADIO TOWERS -10/0/+10, DATA CENTER +5, SHADOW 110');
save('expedition-turned-100-labels', base(EXPEDITION, EX_UNITS, 1, 'turned', true));

// ---- the shadow match: a few square buildings at today's 150 over the same at 110, a unit beside each row ----
{
  const row = [['kg_cottage', 1], ['kg_barracks', 4], ['kg_castle', 8], ['ex_bunkhouse', 13], ['ex_factory', 16], ['ex_radio', 20]], tw = 23, th = 9;
  const paste = (dst, src, x, y) => { for (let j = 0; j < src.h; j++) dst.data.set(src.data.subarray(j * src.w * 4, (j + 1) * src.w * 4), ((y + j) * dst.w + x) * 4); };
  function strip(pr, caption, seed) {
    const c = canvas(tw * T, th * T); grass(c, seed);
    const items = row.map(([kind, tx]) => { const n = SIZES[kind], seat = kind.startsWith('kg') ? 0 : 1, x = (tx + n / 2) * T, y = (th - 1.5 - n / 2) * T; return { y, d: (cc) => { pr.draw(cc, pr.get(`bldg_${kind}`), x, y, seat); if (HEADS[kind]) P.draw(cc, P.get(`${HEADS[kind]}_0`), x, y, seat); } }; });
    items.push({ y: (th - 1.6) * T, d: (cc) => P.draw(cc, P.get('kg_guard_4_0'), 7.5 * T, (th - 1.6) * T, 0) }, { y: (th - 1.6) * T, d: (cc) => P.draw(cc, P.get('ex_marine_4_0'), 19.4 * T, (th - 1.6) * T, 1) });
    for (const it of items.sort((a, b) => a.y - b.y)) it.d(c);
    label(c, caption, 6, 6, 2); return c;
  }
  const a = strip(Q, 'BUILDINGS SHADOW 150 (TODAY), UNITS 110', 5), b = strip(P, 'BUILDINGS SHADOW 110 (MATCHED TO THE UNITS)', 5);
  const c = canvas(a.w, a.h + b.h); paste(c, a, 0, 0); paste(c, b, 0, a.h);
  writeFileSync(join(outDir, 'buildings-shadow-match.png'), encodePNG(c)); writeFileSync(join(outDir, 'buildings-shadow-match-1x.png'), encodePNG(half(c)));
}
console.log('yaw bases pictures ->', outDir);
