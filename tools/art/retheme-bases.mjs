// The buildings' angles and shadows (2026-11-11, after the yaw review's retheme-yaw-bases.mjs): every building turned
// its fixed angle (retheme.js BLDG_YAW) and fitted to its footprint, the cast shadow at the units' alpha, the Cottage
// without its woodpile and smoke. Pictures for Stelian, at 2x with a -1x copy in CSS px, on the game's grass tiles with
// the seats' colours. `today` is main's committed atlas (public/art on origin/main), read with `git show`, so the
// comparison is against what the game draws now, not a re-render.
//   node tools/art/retheme-bases.mjs [outdir]          (target/buildings by default)
//     angles-contact-sheet.png: every building square (today's atlas) beside its chosen angle, both seats, named, the
//       angle and its verdict under it (fits as is, or a small shrink with its scale; a wider angle that needed more
//       than a 0.85 shrink would have shown a proposed bigger footprint too: none did); the printed table: each
//       building's angle, fit and ground spill (W / E / S) against today's
//     kingdom-base-100.png / -075.png: a built-up Kingdom base with the final art, units around (zoom 1.0 and 0.75)
//     kingdom-base-today-100.png: the same base from main's atlas
//     expedition-base-100.png: the Expedition base with the final art (and -today-100)
//     cottage-left-before-after.png: the Cottage's west edge, today's and the new one, at 4x (the -1x copy at 1x)
//   node tools/art/retheme-bases.mjs --trial [outdir]  the pick's sheet (renders are cached under <outdir>/cache; --fresh): every building at -30 .. +30 at 1x, seat 0
//     (angles-trial.png), with each angle's fit scale; nothing else
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { encodePNG, decodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, makePainters, seatTints, half, resample, label, crop } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';
import { BLDG_LOOK } from '../../src/client/look.js';

const args = process.argv.slice(2), trial = args.includes('--trial');
const outDir = args.find(a => !a.startsWith('--')) ?? 'target/buildings';
mkdirSync(outDir, { recursive: true });
const T = 64; // a tile at 2x
const cv = (w, h) => canvas(Math.round(w), Math.round(h));
/** render3d, its result kept under target/buildings/cache/<key>.json (a Chromium render of every building takes minutes
 *  on this machine; a drawing bug must not cost it again). `--fresh` renders anew. */
async function rendered(key, filter, opts) {
  const dir = join(outDir, 'cache'), f = join(dir, `${key}.json`);
  if (!args.includes('--fresh') && existsSync(f)) { const { sprites, tints } = JSON.parse(readFileSync(f, 'utf8')); return Object.assign(sprites.map(({ data, ...s }) => ({ ...s, img: { ...s.img, data: new Uint8ClampedArray(Buffer.from(data, 'base64')) } })), { tints }); }
  const out = await render3d(filter, opts); mkdirSync(dir, { recursive: true });
  writeFileSync(f, JSON.stringify({ tints: out.tints, sprites: out.map(({ img, ...s }) => ({ ...s, img: { w: img.w, h: img.h }, data: Buffer.from(img.data).toString('base64') })) }));
  return out;
}

const KINDS = { kg_castle: 'Castle', kg_cottage: 'Cottage', kg_market: 'Market', kg_barracks: 'Barracks', kg_blacksmith: 'Blacksmith', kg_workshop: 'Workshop', kg_tower: 'Watchtower', kg_stables: 'Stables',
  ex_hall: 'Data center', ex_bunkhouse: 'Cabin', ex_post: 'Recruiting post', ex_factory: 'Factory', ex_lab: 'Lab', ex_radio: 'Radio tower', ex_portal: 'Portal' };
const SIZES = { kg_castle: 4, kg_cottage: 2, kg_market: 2, kg_barracks: 3, kg_blacksmith: 2, kg_workshop: 3, kg_tower: 2, kg_stables: 3, ex_hall: 4, ex_bunkhouse: 2, ex_post: 2, ex_factory: 3, ex_lab: 2, ex_radio: 2, ex_portal: 2 };
/** The game's names for the re-theme's (retheme.js ATLAS_BUILDINGS, main's atlas). */
const GAME = { kg_castle: 'core', kg_cottage: 'depot', kg_market: 'extractor', kg_barracks: 'barracks', kg_blacksmith: 'forge', kg_workshop: 'factory', kg_tower: 'turret', kg_stables: 'airfield',
  ex_hall: 'conflux', ex_bunkhouse: 'spire', ex_post: 'siphon', ex_factory: 'kiln', ex_lab: 'loom', ex_radio: 'ward', ex_portal: 'eclipse' };
const HEADS = { kg_tower: ['kg_towerhead', 'turret_head'], ex_radio: ['ex_radiohead', 'ward_head'] }, HEAD_DIRS = [0, 2, 14];

// ---- the ground: the game's grass tiles ----
const tiles = {}; const getTile = (m, v) => tiles[`${m}_${v}`] ??= tile(m, v);
function groundVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > 0.35) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function grass(c, seed) {
  const rnd = mulberry(seed * 7 + 3);
  for (let j = -1; j < Math.ceil(c.h / T) + 1; j++) for (let i = -1; i < Math.ceil(c.w / T) + 1; i++) {
    const t = getTile(0, groundVariant(rnd(), i, j, seed)), x0 = i * T + T / 2, y0 = j * T + T / 2;
    for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), ((py) * c.w + px) * 4); } }
  }
}
const paste = (dst, src, x, y) => { for (let j = 0; j < src.h; j++) { if (y + j >= dst.h) break; dst.data.set(src.data.subarray(j * src.w * 4, (j + 1) * src.w * 4), ((y + j) * dst.w + x) * 4); } };
const save = (name, c) => { writeFileSync(join(outDir, `${name}.png`), encodePNG(c)); writeFileSync(join(outDir, `${name}-1x.png`), encodePNG(half(c))); };
/** Nearest-neighbour upscale by k (the 4x crops). */
function up(c, k) { const o = canvas(c.w * k, c.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y / k | 0) * c.w + (x / k | 0)) * 4, ((y / k | 0) * c.w + (x / k | 0)) * 4 + 4), (y * o.w + x) * 4); return o; }

/** The ground spill of a drawn body past its n-tile footprint, world px, west / east / south (solid pixels, the shadow excluded). */
function spill(s, n) {
  const { w, h, data } = s.img, ax = s.anchor.x * w, ay = s.anchor.y * h, F = n * T / 2, solid = (i) => data[i + 3] === 255 && (data[i] || data[i + 1] || data[i + 2]);
  let x0 = w, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!solid((y * w + x) * 4)) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const px = (v) => +(v / 2).toFixed(1);
  return { W: px(Math.max(0, -F - (x0 - ax))), E: px(Math.max(0, x1 + 1 - ax - F)), S: px(Math.max(0, y1 + 1 - ay - F)) };
}
/** Whether a sprite's painted pixels touch its cell's edge (a cell too small for a turned building). */
function clipped(s) { const { w, h, data } = s.img; for (let x = 0; x < w; x++) if (data[x * 4 + 3] || data[((h - 1) * w + x) * 4 + 3]) return true; for (let y = 0; y < h; y++) if (data[y * w * 4 + 3] || data[(y * w + w - 1) * 4 + 3]) return true; return false; }

// ---- today's art: main's atlas, as the game draws it ----
function mainAtlas() {
  const show = (p) => execFileSync('git', ['show', `origin/main:public/art/${p}`], { maxBuffer: 1 << 28 });
  const index = JSON.parse(show('atlas.json').toString()), sprites = [];
  for (const page of index.pages) {
    const { frames, meta } = JSON.parse(show(page).toString()), img = decodePNG(show(meta.image));
    for (const [name, f] of Object.entries(frames)) {
      const { x, y, w, h } = f.frame, src = f.sourceSize, o = f.spriteSourceSize, out = canvas(src.w, src.h); // (a trimmed mask back at its base's size)
      for (let j = 0; j < h; j++) out.data.set(img.data.subarray(((y + j) * img.w + x) * 4, ((y + j) * img.w + x + w) * 4), ((o.y + j) * src.w + o.x) * 4);
      sprites.push({ name, img: out, anchor: f.anchor, ...(name.endsWith('_m') ? { trim: true } : {}) });
    }
  }
  return Object.assign(sprites, { tints: index.tints });
}

// ---- the trial: every building at every candidate angle ----
if (trial) {
  const ANGLES = [-30, -20, -10, 0, 10, 20, 30], kinds = Object.keys(KINDS), byYaw = {};
  const t0 = Date.now();
  for (const yaw of ANGLES) {
    const yaws = Object.fromEntries(kinds.map(k => [k, yaw]));
    byYaw[yaw] = await rendered(`trial-${yaw}`, `^(bldg_(kg|ex)_|(kg_towerhead|ex_radiohead)_0$)`, { polish: true, yaws });
  }
  console.log(`rendered ${ANGLES.length} angles in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const P = Object.fromEntries(ANGLES.map(a => [a, makePainters(byYaw[a], seatTints(byYaw[a].tints))]));
  const cw = 6 * T, rows = kinds.map(k => ({ k, h: Math.round((SIZES[k] + 3.2) * T) }));
  const c = cv(cw * ANGLES.length, rows.reduce((s, r) => s + r.h, 0)); grass(c, 3);
  console.log('building          angle   fit   spill W / E / S');
  let y = 0;
  for (const { k, h } of rows) {
    const n = SIZES[k];
    ANGLES.forEach((yaw, i) => {
      const pr = P[yaw], s = pr.get(`bldg_${k}`), x = i * cw + cw / 2, by = Math.round(y + h - 1.2 * T - n * T / 2);
      pr.draw(c, s, x, by, 0); if (HEADS[k]) pr.draw(c, pr.get(`${HEADS[k][0]}_0`), x, by, 0);
      const sp = spill(s, n), fit = s.turn?.scale ?? 1;
      console.log(`  ${KINDS[k].padEnd(16)} ${String(yaw).padStart(4)}   ${fit.toFixed(2)}  ${sp.W} / ${sp.E} / ${sp.S}${clipped(s) ? '  CLIPPED' : ''}`);
      label(c, `${yaw > 0 ? '+' : ''}${yaw} ${fit < 1 ? 'x' + fit.toFixed(2) : ''}`, i * cw + 4, y + h - 22, 2);
    });
    label(c, KINDS[k], 4, y + 4, 2);
    y += h;
  }
  save('angles-trial', c);
  console.log('trial sheet ->', join(outDir, 'angles-trial-1x.png'));
  process.exit(0);
}

// ---- the final art, and today's ----
const UNITS = '(kg_villager|kg_guard|kg_archer|ex_bot|ex_marine)_(0|2|4|6|8|10|12|14)_0';
const t0 = Date.now();
const art = await rendered('final', `^(bldg_(kg|ex)_|${UNITS}|rt_gold_0_0|(kg_towerhead|ex_radiohead)_(${HEAD_DIRS.join('|')})$)`, { polish: true });
console.log(`rendered ${art.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makePainters(art, seatTints(art.tints)), today = mainAtlas(), Q = makePainters(today, seatTints(today.tints));

// ---- the table ----
console.log('building          angle   fit   new spill W / E / S   today\'s spill W / E / S');
const table = {};
for (const k of Object.keys(KINDS)) {
  const n = SIZES[k], s = P.get(`bldg_${k}`), q = Q.get(`bldg_${GAME[k]}`), sp = spill(s, n), sq = spill(q, n), turn = s.turn ?? { yaw: 0, scale: 1 };
  table[k] = { ...turn, spill: sp, today: sq };
  console.log(`  ${KINDS[k].padEnd(16)} ${String(turn.yaw).padStart(4)}   ${turn.scale.toFixed(2)}  ${String(sp.W).padStart(4)} / ${String(sp.E).padStart(4)} / ${String(sp.S).padStart(4)}       ${String(sq.W).padStart(4)} / ${String(sq.E).padStart(4)} / ${String(sq.S).padStart(4)}${clipped(s) ? '  CLIPPED' : ''}`);
}
writeFileSync(join(outDir, 'angles.json'), JSON.stringify(table, null, 1));

// ---- the contact sheet: square (today) | chosen, seat 0 and seat 1 ----
{
  const kinds = Object.keys(KINDS), cw = 6 * T, rows = kinds.map(k => ({ k, h: Math.round((SIZES[k] + 3.2) * T) }));
  const c = cv(cw * 4, rows.reduce((s, r) => s + r.h, 0)); grass(c, 5);
  let y = 0;
  for (const { k, h } of rows) {
    const n = SIZES[k], s = P.get(`bldg_${k}`), q = Q.get(`bldg_${GAME[k]}`), turn = table[k];
    const verdict = turn.scale >= 0.995 ? 'FITS AS IS' : `SMALL SHRINK X${turn.scale.toFixed(2)}`; // (every chosen angle fits its footprint at 0.88 or more: no new footprint proposed)
    const mine = `${turn.yaw > 0 ? '+' : ''}${turn.yaw}: ${verdict}`, cells = [[Q, q, 0, 'TODAY'], [P, s, 0, mine], [Q, q, 1, 'TODAY'], [P, s, 1, mine]];
    cells.forEach(([pr, sp, seat, txt], i) => {
      const x = i * cw + cw / 2, by = Math.round(y + h - 1.2 * T - n * T / 2);
      pr.draw(c, sp, x, by, seat);
      if (HEADS[k]) { const hn = pr === P ? `${HEADS[k][0]}_0` : `${HEADS[k][1]}_0`; pr.draw(c, pr.get(hn), x, by, seat); }
      label(c, txt, i * cw + 4, y + h - 22, 2);
    });
    label(c, KINDS[k], 4, y + 4, 2);
    y += h;
  }
  const cap = 'TODAY (MAIN) | THE CHOSEN ANGLE, SHADOW 110: SEAT 0, THEN SEAT 1'; label(c, cap, c.w - (cap.length * 6 + 2) * 2 - 4, 4, 2);
  save('angles-contact-sheet', c);
}

// ---- the bases: [kind, tx, ty] in placement order, units [name, tx, ty] at tile coordinates ----
const KINGDOM = [['kg_castle', 10, 7], ['kg_cottage', 5, 2], ['kg_cottage', 8, 2], ['kg_cottage', 5, 5], ['kg_cottage', 8, 5], ['kg_blacksmith', 12, 3], ['kg_barracks', 15, 2],
  ['kg_market', 16, 7], ['kg_stables', 16, 11], ['kg_workshop', 4, 10], ['kg_tower', 21, 4], ['kg_tower', 21, 13], ['kg_cottage', 12, 12]];
const EXPEDITION = [['ex_hall', 10, 7], ['ex_bunkhouse', 5, 2], ['ex_bunkhouse', 8, 2], ['ex_bunkhouse', 5, 5], ['ex_bunkhouse', 8, 5], ['ex_post', 12, 3], ['ex_post', 15, 3],
  ['ex_factory', 16, 7], ['ex_lab', 16, 11], ['ex_portal', 4, 10], ['ex_radio', 21, 4], ['ex_radio', 21, 13], ['ex_bunkhouse', 12, 12]];
const KG_UNITS = [['kg_villager_0_0', 15.2, 9.4], ['kg_villager_2_0', 18.6, 8.2], ['kg_villager_8_0', 19.8, 10.1], ['kg_villager_12_0', 20.4, 7.3], ['kg_guard_4_0', 15.5, 5.8], ['kg_guard_4_0', 16.4, 5.9], ['kg_archer_4_0', 17.3, 6.0], ['kg_guard_0_0', 9.5, 12.6]];
const EX_UNITS = [['ex_bot_0_0', 15.2, 9.4], ['ex_bot_2_0', 18.6, 8.2], ['ex_bot_8_0', 19.8, 10.1], ['ex_bot_12_0', 20.4, 7.3], ['ex_marine_4_0', 15.5, 5.8], ['ex_marine_4_0', 16.4, 5.9], ['ex_marine_4_0', 17.3, 6.0], ['ex_marine_0_0', 9.5, 12.6]];
const GOLD = [21.5, 9.2], PANEL = [25, 17];
/** The units' game names in main's atlas (retheme.js ATLAS_UNITS). */
const UNIT_GAME = { kg_villager: 'harvester', kg_guard: 'trooper', kg_archer: 'lancer', ex_bot: 'lumen', ex_marine: 'umbra' };
/** A base drawn with the final art (`P`) or today's (`Q`, main's names). Buildings and units sorted by ground y, as the game draws them. */
function base(list, units, seat, pr) {
  const c = cv(PANEL[0] * T, PANEL[1] * T); grass(c, seat + 11);
  const items = [], isToday = pr === Q;
  list.forEach(([kind, tx, ty], id) => {
    const n = SIZES[kind], x = (tx + n / 2) * T, y = (ty + n / 2) * T, name = isToday ? `bldg_${GAME[kind]}` : `bldg_${kind}`, draw = [(cc) => pr.draw(cc, pr.get(name), x, y, seat)];
    if (HEADS[kind]) { const hn = `${HEADS[kind][isToday ? 1 : 0]}_${HEAD_DIRS[id % HEAD_DIRS.length]}`; draw.push((cc) => pr.draw(cc, pr.get(hn), x, y, seat)); }
    items.push({ y, draw });
  });
  for (const [name, tx, ty] of units) { const nm = isToday ? name.replace(/^(kg|ex)_\w+?_(\d+)_(\d+)$/, (m, p, d, f) => `${UNIT_GAME[name.replace(/_\d+_\d+$/, '')]}_${d}_${f}`) : name; items.push({ y: ty * T, draw: [(cc) => pr.draw(cc, pr.get(nm), tx * T, ty * T, seat)] }); }
  items.push({ y: GOLD[1] * T, draw: [(cc) => pr.draw(cc, pr.get(isToday ? 'shard_0' : 'rt_gold_0_0'), GOLD[0] * T, GOLD[1] * T)] });
  for (const it of items.sort((a, b) => a.y - b.y)) for (const d of it.draw) d(c);
  return c;
}
function picture(name, c, caption, zoomToo = true) {
  const z = resample(c, 0.75);
  label(c, caption, 6, 6, 2); save(`${name}-100`, c);
  if (zoomToo) { label(z, `${caption}  ZOOM 0.75`, 6, 6, 2); save(`${name}-075`, z); }
}
picture('kingdom-base', base(KINGDOM, KG_UNITS, 0, P), 'KINGDOM: THE CHOSEN ANGLES, SHADOW 110, THE NEW COTTAGE');
picture('kingdom-base-today', base(KINGDOM, KG_UNITS, 0, Q), 'KINGDOM TODAY (MAIN): SQUARE, SHADOW 150', false);
picture('expedition-base', base(EXPEDITION, EX_UNITS, 1, P), 'EXPEDITION: THE CHOSEN ANGLES, SHADOW 110');
picture('expedition-base-today', base(EXPEDITION, EX_UNITS, 1, Q), 'EXPEDITION TODAY (MAIN): SQUARE, SHADOW 150', false);

// ---- the Cottage's west edge: today's over the new one, at 4x (the -1x copy at 1x) ----
{
  const cell = (pr, s, caption) => { const c = cv(5 * T, 4.4 * T); grass(c, 9); pr.draw(c, s, 2.5 * T, 2.6 * T, 0); label(c, caption, 4, 4, 2); return c; };
  const a = cell(Q, Q.get('bldg_depot'), 'TODAY'), b = cell(P, P.get('bldg_kg_cottage'), 'NEW: NO WOODPILE, NO SMOKE');
  const c = cv(a.w * 2 + 8, a.h); paste(c, a, 0, 0); paste(c, b, a.w + 8, 0);
  writeFileSync(join(outDir, 'cottage-left-before-after.png'), encodePNG(up(c, 2))); writeFileSync(join(outDir, 'cottage-left-before-after-1x.png'), encodePNG(half(c)));
}

// ---- the client's smoke and glow points over the new sprites (look.js BLDG_LOOK): a red dot at each, for the check ----
{
  const kinds = Object.keys(KINDS).filter(k => BLDG_LOOK[GAME[k]]?.smoke || BLDG_LOOK[GAME[k]]?.glow), cw = 6 * T, ch = 7.2 * T;
  const c = cv(cw * kinds.length, ch); grass(c, 7);
  kinds.forEach((k, i) => {
    const n = SIZES[k], x = i * cw + cw / 2, y = Math.round(ch - 1.2 * T - n * T / 2), L = BLDG_LOOK[GAME[k]];
    P.draw(c, P.get(`bldg_${k}`), x, y, 0);
    const dot = (px, py, col) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) c.data.set(col, ((Math.round(py) + dy) * c.w + Math.round(px) + dx) * 4); };
    for (const [sx, sy] of L.smoke ?? []) dot(x - n * T / 2 + sx * 2, y - n * T / 2 + sy * 2, [255, 40, 40, 255]);
    if (L.glow) dot(x + (L.glow[5] || 0) * 2, y - L.glow[3] * 2, [255, 230, 60, 255]);
    label(c, KINDS[k], i * cw + 4, 4, 2);
  });
  save('look-points', c);
}
console.log('pictures ->', outDir);
