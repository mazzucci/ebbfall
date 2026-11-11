// The Data center's redraw and the depth pass (2026-11-11, Stelian's briefs): pictures at 2x with a -1x copy in CSS
// px, on the game's grass tiles in the seats' colours, into target/datacenter (or [outdir]). "Today" is the branch
// point's committed atlas (public/art on origin/retheme-legibility, read with `git show`): what the game drew before.
//   node tools/art/retheme-datacenter.mjs --trial   the two options (retheme.js ex_hall, the block; ex_datahall, the
//     server hall) at -20 .. +20 at 1x, seat 0, each angle's fit scale, spill and whether the chip's die still shows
//     (trial.png); renders cached under <outdir>/cache (--fresh)
//   node tools/art/retheme-datacenter.mjs           options.png: today's Data center, the server hall and the block
//     at their chosen angles, both seats, next to a Castle; base-100.png / base-075.png: an Expedition base with the pick
//     (tools/art/retheme-bases.mjs's layout); look-point.png: the client's glow point (look.js) on the pick
//   node tools/art/retheme-datacenter.mjs --depth   depth-before-after.png: every building's current angled sprite
//     (today's atlas) beside the new render, "DEEPENED" or "OK AS IS", at 1x on grass; the fit table
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { encodePNG, decodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, makePainters, seatTints, half, resample, label } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';
import { BLDG_LOOK } from '../../src/client/look.js';

const args = process.argv.slice(2), mode = args.includes('--trial') ? 'trial' : args.includes('--depth') ? 'depth' : 'pictures';
const outDir = args.find(a => !a.startsWith('--')) ?? 'target/datacenter';
mkdirSync(outDir, { recursive: true });
const T = 64; // a tile at 2x
const TODAY_REF = 'origin/retheme-legibility';
const cv = (w, h) => canvas(Math.round(w), Math.round(h));
/** render3d, cached under <outdir>/cache/<key>.json (--fresh renders anew). */
async function rendered(key, filter, opts) {
  const dir = join(outDir, 'cache'), f = join(dir, `${key}.json`);
  if (!args.includes('--fresh') && existsSync(f)) { const { sprites, tints } = JSON.parse(readFileSync(f, 'utf8')); return Object.assign(sprites.map(({ data, ...s }) => ({ ...s, img: { ...s.img, data: new Uint8ClampedArray(Buffer.from(data, 'base64')) } })), { tints }); }
  const out = await render3d(filter, opts); mkdirSync(dir, { recursive: true });
  writeFileSync(f, JSON.stringify({ tints: out.tints, sprites: out.map(({ img, ...s }) => ({ ...s, img: { w: img.w, h: img.h }, data: Buffer.from(img.data).toString('base64') })) }));
  return out;
}

const KINDS = { kg_castle: 'Castle', kg_cottage: 'Cottage', kg_market: 'Market', kg_barracks: 'Barracks', kg_blacksmith: 'Blacksmith', kg_workshop: 'Workshop', kg_tower: 'Watchtower', kg_stables: 'Stables',
  ex_hall: 'Data center', ex_bunkhouse: 'Cabin', ex_post: 'Recruiting post', ex_factory: 'Factory', ex_lab: 'Lab', ex_radio: 'Radio tower', ex_portal: 'Portal' };
const SIZES = { kg_castle: 4, kg_cottage: 2, kg_market: 2, kg_barracks: 3, kg_blacksmith: 2, kg_workshop: 3, kg_tower: 2, kg_stables: 3, ex_hall: 4, ex_datahall: 4, ex_bunkhouse: 2, ex_post: 2, ex_factory: 3, ex_lab: 2, ex_radio: 2, ex_portal: 2 };
const GAME = { kg_castle: 'core', kg_cottage: 'depot', kg_market: 'extractor', kg_barracks: 'barracks', kg_blacksmith: 'forge', kg_workshop: 'factory', kg_tower: 'turret', kg_stables: 'airfield',
  ex_hall: 'conflux', ex_bunkhouse: 'spire', ex_post: 'siphon', ex_factory: 'kiln', ex_lab: 'loom', ex_radio: 'ward', ex_portal: 'eclipse' };
const HEADS = { kg_tower: ['kg_towerhead', 'turret_head'], ex_radio: ['ex_radiohead', 'ward_head'] }, HEAD_DIRS = [0, 2, 14];
/** The depth pass: the buildings deepened (the label on the sheet). */
const DEEPENED = new Set(['ex_bunkhouse', 'kg_cottage']); // (the Recruiting post, a rounded tent, and the Factory, its roof, south face and lean-to, read as volumes as they are)

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
const save = (name, c) => { writeFileSync(join(outDir, `${name}.png`), encodePNG(c)); writeFileSync(join(outDir, `${name}-1x.png`), encodePNG(half(c))); };
/** The ground spill of a drawn body past its n-tile footprint, world px, west / east / south (solid pixels, the shadow excluded). */
function spill(s, n) {
  const { w, h, data } = s.img, ax = s.anchor.x * w, ay = s.anchor.y * h, F = n * T / 2, solid = (i) => data[i + 3] === 255 && (data[i] || data[i + 1] || data[i + 2]);
  let x0 = w, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!solid((y * w + x) * 4)) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const px = (v) => +(v / 2).toFixed(1);
  return { W: px(Math.max(0, -F - (x0 - ax))), E: px(Math.max(0, x1 + 1 - ax - F)), S: px(Math.max(0, y1 + 1 - ay - F)) };
}
const fmtSpill = (sp) => `${sp.W} / ${sp.E} / ${sp.S}`;
function clipped(s) { const { w, h, data } = s.img; for (let x = 0; x < w; x++) if (data[x * 4 + 3] || data[((h - 1) * w + x) * 4 + 3]) return true; for (let y = 0; y < h; y++) if (data[y * w * 4 + 3] || data[(y * w + w - 1) * 4 + 3]) return true; return false; }
/** The cyan neon's share of a sprite's solid pixels (the glow must read). */
function cyan(s) { const { data } = s.img; let n = 0, c = 0; for (let i = 0; i < data.length; i += 4) { if (data[i + 3] !== 255 || !(data[i] | data[i + 1] | data[i + 2])) continue; n++; if (data[i + 2] > 170 && data[i + 1] > 150 && data[i] < 0.75 * data[i + 2]) c++; } return c / n; }

// ---- today's art: the branch point's atlas, as the game draws it ----
function todayAtlas() {
  const show = (p) => execFileSync('git', ['show', `${TODAY_REF}:public/art/${p}`], { maxBuffer: 1 << 28 });
  const index = JSON.parse(show('atlas.json').toString()), sprites = [];
  for (const page of index.pages) {
    const { frames, meta } = JSON.parse(show(page).toString()), img = decodePNG(show(meta.image));
    for (const [name, f] of Object.entries(frames)) {
      if (!/^(bldg_|turret_head|ward_head)/.test(name)) continue;
      const { x, y, w, h } = f.frame, src = f.sourceSize, o = f.spriteSourceSize, out = canvas(src.w, src.h);
      for (let j = 0; j < h; j++) out.data.set(img.data.subarray(((y + j) * img.w + x) * 4, ((y + j) * img.w + x + w) * 4), ((o.y + j) * src.w + o.x) * 4);
      sprites.push({ name, img: out, anchor: f.anchor, ...(name.endsWith('_m') ? { trim: true } : {}) });
    }
  }
  return Object.assign(sprites, { tints: index.tints });
}

// ---- the trial: both options at every candidate angle ----
if (mode === 'trial') {
  const ANGLES = [-20, -10, 0, 10, 20], kinds = ['ex_hall', 'ex_datahall'], byYaw = {};
  const t0 = Date.now();
  for (const yaw of ANGLES) byYaw[yaw] = await rendered(`trial-${yaw}`, '^bldg_ex_(hall|datahall)$', { polish: true, yaws: Object.fromEntries(kinds.map(k => [k, yaw])) });
  console.log(`rendered ${ANGLES.length} angles in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const P = Object.fromEntries(ANGLES.map(a => [a, makePainters(byYaw[a], seatTints(byYaw[a].tints))]));
  const cw = 7 * T, rows = kinds.map(k => ({ k, h: Math.round((SIZES[k] + 4.2) * T) }));
  const c = cv(cw * ANGLES.length, rows.reduce((s, r) => s + r.h, 0)); grass(c, 3);
  console.log('option        angle   fit   spill W / E / S   cyan share');
  let y = 0;
  for (const { k, h } of rows) {
    const n = SIZES[k];
    ANGLES.forEach((yaw, i) => {
      const pr = P[yaw], s = pr.get(`bldg_${k}`), x = i * cw + cw / 2, by = Math.round(y + h - 1.2 * T - n * T / 2);
      pr.draw(c, s, x, by, 0);
      const sp = spill(s, n), fit = s.turn?.scale ?? 1;
      console.log(`  ${k.padEnd(12)} ${String(yaw).padStart(4)}   ${fit.toFixed(2)}  ${fmtSpill(sp).padEnd(18)} ${(cyan(s) * 100).toFixed(1)}%${clipped(s) ? '  CLIPPED' : ''}`);
      label(c, `${yaw > 0 ? '+' : ''}${yaw} ${fit < 1 ? 'x' + fit.toFixed(2) : ''}`, i * cw + 4, y + h - 22, 2);
    });
    label(c, k === 'ex_hall' ? 'THE BLOCK' : 'THE SERVER HALL', 4, y + 4, 2);
    y += h;
  }
  save('trial', c);
  console.log('trial sheet ->', join(outDir, 'trial-1x.png'));
  process.exit(0);
}

// ---- the depth pass: every building today beside the new render ----
if (mode === 'depth') {
  const kinds = Object.keys(KINDS).filter(k => k !== 'ex_hall');
  const art = await rendered('depth', `^(bldg_(kg|ex)_|(kg_towerhead|ex_radiohead)_0$)`, { polish: true });
  const P = makePainters(art, seatTints(art.tints)), today = todayAtlas(), Q = makePainters(today, seatTints(today.tints));
  console.log('building          angle   fit   new spill W / E / S   today\'s spill W / E / S');
  const cw = 6 * T, rows = kinds.map(k => ({ k, h: Math.round((SIZES[k] + 3.2) * T) })), cols = 4;
  const c = cv(cw * cols, rows.reduce((s, r) => s + r.h, 0)); grass(c, 5);
  let y = 0;
  for (const { k, h } of rows) {
    const n = SIZES[k], s = P.get(`bldg_${k}`), q = Q.get(`bldg_${GAME[k]}`), sp = spill(s, n), sq = spill(q, n), turn = s.turn ?? { yaw: 0, scale: 1 };
    console.log(`  ${KINDS[k].padEnd(16)} ${String(turn.yaw).padStart(4)}   ${turn.scale.toFixed(2)}  ${fmtSpill(sp).padEnd(20)}  ${fmtSpill(sq)}${clipped(s) ? '  CLIPPED' : ''}`);
    const verdict = DEEPENED.has(k) ? 'DEEPENED' : 'OK AS IS', cells = [[Q, q, 0, 'TODAY'], [P, s, 0, verdict], [Q, q, 1, 'TODAY'], [P, s, 1, verdict]];
    cells.forEach(([pr, sp2, seat, txt], i) => {
      const x = i * cw + cw / 2, by = Math.round(y + h - 1.2 * T - n * T / 2);
      pr.draw(c, sp2, x, by, seat);
      if (HEADS[k]) pr.draw(c, pr.get(`${HEADS[k][pr === P ? 0 : 1]}_0`), x, by, seat);
      label(c, txt, i * cw + 4, y + h - 22, 2);
    });
    label(c, `${KINDS[k]} ${turn.yaw > 0 ? '+' : ''}${turn.yaw}`, 4, y + 4, 2);
    y += h;
  }
  const cap = 'TODAY (RETHEME-LEGIBILITY) | NEW: SEAT 0, THEN SEAT 1. 1X'; label(c, cap, c.w - (cap.length * 6 + 2) * 2 - 4, 4, 2);
  save('depth-before-after', c);
  console.log('depth sheet ->', join(outDir, 'depth-before-after-1x.png'));
  process.exit(0);
}

// ---- the pictures: options.png, the base, the glow point ----
const UNITS = '(ex_bot|ex_marine)_(0|2|4|6|8|10|12|14)_0';
const t0 = Date.now();
const art = await rendered('final', `^(bldg_(ex_|kg_castle$)|${UNITS}|rt_gold_0_0|ex_radiohead_(${HEAD_DIRS.join('|')})$)`, { polish: true });
console.log(`rendered ${art.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makePainters(art, seatTints(art.tints)), today = todayAtlas(), Q = makePainters(today, seatTints(today.tints));
for (const k of ['ex_hall', 'ex_datahall']) { const s = P.get(`bldg_${k}`), turn = s.turn ?? { yaw: 0, scale: 1 }; console.log(`  ${k.padEnd(12)} yaw ${turn.yaw} fit ${turn.scale.toFixed(2)} spill ${fmtSpill(spill(s, 4))} (today ${fmtSpill(spill(Q.get('bldg_conflux'), 4))}) cyan ${(cyan(s) * 100).toFixed(1)}% team ${P.share(`bldg_${k}`)}${clipped(s) ? ' CLIPPED' : ''}`); }

{ // options.png: today | the server hall | the block | a Castle, seat 0 above, seat 1 below
  const cols = [[Q, 'bldg_conflux', 'TODAY'], [P, 'bldg_ex_datahall', 'THE SERVER HALL'], [P, 'bldg_ex_hall', 'THE BLOCK'], [P, 'bldg_kg_castle', 'A CASTLE, FOR SCALE']];
  const cw = 8 * T, rh = 9 * T, c = cv(cw * cols.length, rh * 2); grass(c, 5); // (integer rows: a fractional y lands the labels a column over)
  [0, 1].forEach(seat => cols.forEach(([pr, name, txt], i) => {
    const x = i * cw + cw / 2, by = Math.round(seat * rh + rh - 1.4 * T - 2 * T), s = pr.get(name);
    pr.draw(c, s, x, by, seat);
    label(c, `${txt}${s.turn && s.turn.yaw ? ` ${s.turn.yaw > 0 ? '+' : ''}${s.turn.yaw}` : ''}`, i * cw + 4, seat * rh + rh - 22, 2);
  }));
  label(c, 'THE DATA CENTER: TODAY, THE TWO OPTIONS AT THEIR ANGLE, A CASTLE. SEAT 0 ABOVE, SEAT 1 BELOW. 1X', 4, 4, 2);
  save('options', c);
}

// ---- the base: tools/art/retheme-bases.mjs's Expedition layout with the pick ----
const EXPEDITION = [['ex_hall', 10, 7], ['ex_bunkhouse', 5, 2], ['ex_bunkhouse', 8, 2], ['ex_bunkhouse', 5, 5], ['ex_bunkhouse', 8, 5], ['ex_post', 12, 3], ['ex_post', 15, 3],
  ['ex_factory', 16, 7], ['ex_lab', 16, 11], ['ex_portal', 4, 10], ['ex_radio', 21, 4], ['ex_radio', 21, 13], ['ex_bunkhouse', 12, 12]];
const EX_UNITS = [['ex_bot_0_0', 15.2, 9.4], ['ex_bot_2_0', 18.6, 8.2], ['ex_bot_8_0', 19.8, 10.1], ['ex_bot_12_0', 20.4, 7.3], ['ex_marine_4_0', 15.5, 5.8], ['ex_marine_4_0', 16.4, 5.9], ['ex_marine_4_0', 17.3, 6.0], ['ex_marine_0_0', 9.5, 12.6]];
const GOLD = [21.5, 9.2], PANEL = [25, 17];
function base(seat) {
  const c = cv(PANEL[0] * T, PANEL[1] * T); grass(c, seat + 11);
  const items = [];
  EXPEDITION.forEach(([kind, tx, ty], id) => {
    const n = SIZES[kind], x = (tx + n / 2) * T, y = (ty + n / 2) * T, draw = [(cc) => P.draw(cc, P.get(`bldg_${kind}`), x, y, seat)];
    if (HEADS[kind]) draw.push((cc) => P.draw(cc, P.get(`${HEADS[kind][0]}_${HEAD_DIRS[id % HEAD_DIRS.length]}`), x, y, seat));
    items.push({ y, draw });
  });
  for (const [name, tx, ty] of EX_UNITS) items.push({ y: ty * T, draw: [(cc) => P.draw(cc, P.get(name), tx * T, ty * T, seat)] });
  items.push({ y: GOLD[1] * T, draw: [(cc) => P.draw(cc, P.get('rt_gold_0_0'), GOLD[0] * T, GOLD[1] * T)] });
  for (const it of items.sort((a, b) => a.y - b.y)) for (const d of it.draw) d(c);
  return c;
}
{
  const c = base(1), z = resample(c, 0.75);
  label(c, 'EXPEDITION BASE WITH THE NEW DATA CENTER', 6, 6, 2); save('base-100', c);
  label(z, 'EXPEDITION BASE WITH THE NEW DATA CENTER  ZOOM 0.75', 6, 6, 2); save('base-075', z);
}
{ // the client's glow point over the pick (look.js BLDG_LOOK conflux): a yellow dot
  const c = cv(8 * T, 9 * T); grass(c, 7); const x = 4 * T, y = Math.round(9 * T - 1.4 * T - 2 * T), L = BLDG_LOOK.conflux;
  P.draw(c, P.get('bldg_ex_hall'), x, y, 0);
  if (L?.glow) { const px = x + (L.glow[5] || 0) * 2, py = y - L.glow[3] * 2; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) c.data.set([255, 230, 60, 255], ((py + dy) * c.w + px + dx) * 4); }
  label(c, 'THE GLOW POINT', 4, 4, 2); save('look-point', c);
}
console.log('pictures ->', outDir);
