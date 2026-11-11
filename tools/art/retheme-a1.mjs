// A1 (2026-11-11): the Wind turbine (the Power source, replacing the Cabin) and the Uplink (3x3), models and pictures
// only (the atlas is wired in the UI PR). Pictures at 2x with a -1x copy in CSS px and a -075 copy at zoom 0.75, on
// the game's grass tiles in the seats' colours, into target/a1 (or [outdir]). The rotors are drawn over the masts as
// the game draws a turning head (retheme.js RT_HEADS `spin`: 16 phases of a third of a turn).
//   node tools/art/retheme-a1.mjs --trial   the Uplink at -30 .. +30 at 1x, seat 0, each angle's fit scale and spill
//     (trial.png); renders cached under <outdir>/cache (--fresh)
//   node tools/art/retheme-a1.mjs --check   check.png: the three new buildings alone (their rotors at phase 0), seat 0,
//     with the table (a correction round's quick look; --fresh after a model change)
//   node tools/art/retheme-a1.mjs           turbine.png: today's Cabin, the two turbine options (one tall turbine; three
//     small ones on a pad) with their rotors, the Radio tower and the Data center for scale, seats 0 and 1;
//     uplink.png: the Uplink beside the Sentry gun, the Lab (its small dish) and the Data center, both
//     seats; uplink-pan.png: the dish (the head) at five pan angles; sentry.png: the Sentry gun (the `radio` slot's
//     new model, its barrel the head) beside the Kingdom's Watchtower and a turbine; lab.png: today's Lab and the dome;
//     portal.png: today's Portal and the three options (the wide gate, the gate with its tube, the oval ring; their
//     swirls the heads); base-100 / base-075 (and base-tube-*, base-ring-*, one per Portal option): the Expedition base
//     (tools/art/retheme-bases.mjs's layout) with the server hall, the turbines in the Cabins' places, an Uplink, the
//     Sentry guns, the dome and the gate; the printed table: angle, fit, spill, team share, cyan share, clipping
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, makePainters, seatTints, half, resample, label } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const args = process.argv.slice(2), mode = args.includes('--trial') ? 'trial' : args.includes('--check') ? 'check' : 'pictures';
const outDir = args.find(a => !a.startsWith('--')) ?? 'target/a1';
mkdirSync(outDir, { recursive: true });
const T = 64; // a tile at 2x
const cv = (w, h) => canvas(Math.round(w), Math.round(h));
/** render3d, cached under <outdir>/cache/<key>.json (--fresh renders anew). */
async function rendered(key, filter, opts) {
  const dir = join(outDir, 'cache'), f = join(dir, `${key}.json`);
  if (!args.includes('--fresh') && existsSync(f)) { const { sprites, tints } = JSON.parse(readFileSync(f, 'utf8')); return Object.assign(sprites.map(({ data, ...s }) => ({ ...s, img: { ...s.img, data: new Uint8ClampedArray(Buffer.from(data, 'base64')) } })), { tints }); }
  const out = await render3d(filter, opts); mkdirSync(dir, { recursive: true });
  writeFileSync(f, JSON.stringify({ tints: out.tints, sprites: out.map(({ img, ...s }) => ({ ...s, img: { w: img.w, h: img.h }, data: Buffer.from(img.data).toString('base64') })) }));
  return out;
}

const SIZES = { kg_tower: 2, ex_datahall: 4, ex_labdome: 2, ex_gate: 2, ex_gatetube: 2, ex_ring: 2, ex_hall: 4, ex_bunkhouse: 2, ex_post: 2, ex_factory: 3, ex_lab: 2, ex_radio: 2, ex_portal: 2, ex_turbine: 2, ex_windfarm: 2, ex_uplink: 3 };
/** The turning heads over their bases, [name, the frames the pictures use]: the turrets at facings, the rotors and the
 *  gate's light at phases, the Uplink's dish at a few pan angles about its frame-0 turn. */
const HEADS = { kg_tower: ['kg_towerhead', [0, 5, 11]], ex_radio: ['ex_radiohead', [0, 5, 11]], ex_turbine: ['ex_turbinehead', [0, 5, 11]], ex_windfarm: ['ex_windfarmhead', [0, 5, 11]], ex_uplink: ['ex_uplinkhead', [0, 14, 2]], ex_gate: ['ex_gatehead', [0, 5, 11]], ex_gatetube: ['ex_gatetubehead', [0, 5, 11]], ex_ring: ['ex_ringhead', [0, 5, 11]] };
const PAN = [12, 14, 0, 2, 4]; // the Uplink's pan sheet: -90, -45, 0, +45, +90 degrees about the column

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
/** Saved at 2x, 1x (CSS px) and at zoom 0.75 (CSS px). */
const save = (name, c, zoomToo = true) => { writeFileSync(join(outDir, `${name}.png`), encodePNG(c)); writeFileSync(join(outDir, `${name}-1x.png`), encodePNG(half(c))); if (zoomToo) writeFileSync(join(outDir, `${name}-075.png`), encodePNG(half(resample(c, 0.75)))); }; // (-075: zoom 0.75 in CSS px, the phone's)
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
/** The cyan light's share of a sprite's solid pixels. */
function cyan(s) { const { data } = s.img; let n = 0, c = 0; for (let i = 0; i < data.length; i += 4) { if (data[i + 3] !== 255 || !(data[i] | data[i + 1] | data[i + 2])) continue; n++; if (data[i + 2] > 170 && data[i + 1] > 150 && data[i] < 0.75 * data[i + 2]) c++; } return c / n; }
/** A building drawn at (x, y) for `seat`, its head over it: the k-th of its frames, or the frame `dir` given. */
function drawBldg(P, c, kind, x, y, seat, k = 0, dir = null) { P.draw(c, P.get(`bldg_${kind}`), x, y, seat); if (HEADS[kind]) { const [name, dirs] = HEADS[kind]; P.draw(c, P.get(`${name}_${dir ?? dirs[k % dirs.length]}`), x, y, seat); } }

// ---- the trial: the Uplink at every candidate angle ----
if (mode === 'trial') {
  const ANGLES = [-30, -20, -10, 0, 10, 20, 30], byYaw = {};
  const t0 = Date.now();
  for (const yaw of ANGLES) byYaw[yaw] = await rendered(`trial-${yaw}`, '^bldg_ex_uplink$', { polish: true, yaws: { ex_uplink: yaw } });
  console.log(`rendered ${ANGLES.length} angles in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const cw = 6 * T, rh = Math.round((3 + 3.2) * T), c = cv(cw * ANGLES.length, rh); grass(c, 3);
  console.log('angle   fit   spill W / E / S   cyan share');
  ANGLES.forEach((yaw, i) => {
    const pr = makePainters(byYaw[yaw], seatTints(byYaw[yaw].tints)), s = pr.get('bldg_ex_uplink'), x = i * cw + cw / 2, by = Math.round(rh - 1.2 * T - 3 * T / 2);
    pr.draw(c, s, x, by, 0);
    const sp = spill(s, 3), fit = s.turn?.scale ?? 1;
    console.log(`  ${String(yaw).padStart(4)}   ${fit.toFixed(2)}  ${fmtSpill(sp).padEnd(18)} ${(cyan(s) * 100).toFixed(1)}%${clipped(s) ? '  CLIPPED' : ''}`);
    label(c, `${yaw > 0 ? '+' : ''}${yaw} ${fit < 1 ? 'x' + fit.toFixed(2) : ''}`, i * cw + 4, rh - 22, 2);
  });
  label(c, 'THE UPLINK AT -30 .. +30, SEAT 0, 1X', 4, 4, 2);
  save('trial', c, false);
  console.log('trial sheet ->', join(outDir, 'trial-1x.png'));
  process.exit(0);
}

// ---- the check: the three new buildings alone ----
if (mode === 'check') {
  const art = await rendered('check', '^(bldg_ex_(turbine|uplink|radio|labdome|gate)$|ex_(turbinehead|radiohead|uplinkhead|gatehead)_0$)', { polish: true });
  const P = makePainters(art, seatTints(art.tints)), kinds = ['ex_turbine', 'ex_uplink', 'ex_radio', 'ex_labdome', 'ex_gate'], cw = 7 * T, rh = 9 * T;
  const c = cv(cw * kinds.length, rh); grass(c, 5);
  kinds.forEach((k, i) => {
    const s = P.get(`bldg_${k}`), turn = s.turn ?? { yaw: 0, scale: 1 }, sz = P.sizeOf(`bldg_${k}`), x = i * cw + cw / 2, by = Math.round(rh - 1.2 * T - SIZES[k] * T / 2);
    drawBldg(P, c, k, x, by, 0, 0); label(c, k, i * cw + 4, rh - 22, 2);
    console.log(`  ${k.padEnd(12)} ${String(turn.yaw).padStart(4)}   ${turn.scale.toFixed(2)}  ${fmtSpill(spill(s, SIZES[k])).padEnd(18)} team ${P.share(`bldg_${k}`)}  cyan ${(cyan(s) * 100).toFixed(1)}%  ${sz[0]} x ${sz[1]}${clipped(s) ? '  CLIPPED' : ''}`);
    if (HEADS[k]) { const h = `${HEADS[k][0]}_0`, hs = P.sizeOf(h); console.log(`    ${h.padEnd(18)} ${hs[0]} x ${hs[1]}${clipped(P.get(h)) ? '  CLIPPED' : ''}`); }
  });
  save('check', c);
  console.log('check sheet ->', join(outDir, 'check-1x.png'));
  process.exit(0);
}

// ---- the pictures ----
const UNITS = '(ex_bot|ex_marine)_(0|2|4|6|8|10|12|14)_0';
const t0 = Date.now();
const art = await rendered('final', `^(bldg_ex_(turbine|windfarm|uplink|bunkhouse|radio|hall|datahall|post|factory|lab|labdome|portal|gate|gatetube|ring)$|bldg_kg_tower$|(ex_(radiohead|turbinehead|windfarmhead|gatehead|gatetubehead|ringhead)|kg_towerhead)_(0|5|11)$|ex_uplinkhead_(${PAN.join('|')})$|${UNITS}|rt_gold_0_0$)`, { polish: true });
console.log(`rendered ${art.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makePainters(art, seatTints(art.tints));
console.log('building      angle   fit   spill W / E / S   team    cyan   size at 1x');
for (const k of ['ex_turbine', 'ex_windfarm', 'ex_uplink', 'ex_radio', 'ex_labdome', 'ex_gate', 'ex_gatetube', 'ex_ring', 'ex_bunkhouse', 'ex_lab', 'ex_portal', 'kg_tower']) {
  const s = P.get(`bldg_${k}`), turn = s.turn ?? { yaw: 0, scale: 1 }, sz = P.sizeOf(`bldg_${k}`);
  console.log(`  ${k.padEnd(12)} ${String(turn.yaw).padStart(4)}   ${turn.scale.toFixed(2)}  ${fmtSpill(spill(s, SIZES[k])).padEnd(18)} ${String(P.share(`bldg_${k}`)).padEnd(6)}  ${(cyan(s) * 100).toFixed(1).padStart(4)}%  ${sz[0]} x ${sz[1]}${clipped(s) ? '  CLIPPED' : ''}`);
  if (HEADS[k]) for (const d of (k === 'ex_uplink' ? PAN : HEADS[k][1])) { const h = `${HEADS[k][0]}_${d}`, hs = P.sizeOf(h); console.log(`    ${h.padEnd(18)} team ${P.share(h)}  ${hs[0]} x ${hs[1]}${clipped(P.get(h)) ? '  CLIPPED' : ''}`); }
}

/** A row of buildings per seat: [kind, caption, head frame?] columns, seat 0 above, seat 1 below. */
function sheet(name, cols, caption, cw = 7 * T, rh = 9 * T) {
  const c = cv(cw * cols.length, rh * 2); grass(c, 5);
  [0, 1].forEach(seat => cols.forEach(([kind, txt, dir], i) => {
    const x = i * cw + cw / 2, n = SIZES[kind], by = Math.round(seat * rh + rh - 1.2 * T - n * T / 2), s = P.get(`bldg_${kind}`);
    drawBldg(P, c, kind, x, by, seat, i + seat, dir ?? null);
    label(c, `${txt}${s.turn && s.turn.yaw ? ` ${s.turn.yaw > 0 ? '+' : ''}${s.turn.yaw}` : ''}`, i * cw + 4, seat * rh + rh - 22, 2);
  }));
  label(c, caption, 4, 4, 2);
  save(name, c);
}
sheet('turbine', [['ex_bunkhouse', "TODAY'S CABIN"], ['ex_turbine', 'ONE TURBINE'], ['ex_windfarm', 'THREE ON A PAD'], ['ex_radio', 'SENTRY GUN'], ['ex_datahall', 'DATA CENTER']], 'THE POWER SOURCE: TODAY, THE TWO OPTIONS, THE SENTRY GUN AND THE DATA CENTER FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('uplink', [['ex_uplink', 'THE UPLINK'], ['ex_radio', 'SENTRY GUN'], ['ex_labdome', 'LAB'], ['ex_datahall', 'DATA CENTER']], 'THE UPLINK BESIDE THE SENTRY GUN, THE LAB AND THE DATA CENTER. SEAT 0 ABOVE, SEAT 1 BELOW', 8 * T);
sheet('uplink-pan', PAN.map(d => ['ex_uplink', `PAN ${((d + 8) % 16 - 8) * -22.5}`, d]), 'THE UPLINK: THE DISH PANNED ABOUT ITS COLUMN (THE HEAD AT FIVE FRAMES). SEAT 0 ABOVE, SEAT 1 BELOW', 8 * T);
sheet('sentry', [['ex_radio', 'SENTRY GUN'], ['kg_tower', 'WATCHTOWER'], ['ex_turbine', 'ONE TURBINE']], 'THE SENTRY GUN BESIDE THE WATCHTOWER AND A TURBINE FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('lab', [['ex_lab', "TODAY'S LAB"], ['ex_labdome', 'THE DOME'], ['ex_datahall', 'DATA CENTER']], 'THE LAB: TODAY AND THE DOME, THE DATA CENTER FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('portal', [['ex_portal', "TODAY'S PORTAL"], ['ex_gate', '1 THE WIDE GATE'], ['ex_gatetube', '2 GATE AND TUBE'], ['ex_ring', '3 THE OVAL RING'], ['ex_datahall', 'DATA CENTER']], 'THE PORTAL: TODAY AND THE THREE OPTIONS (THE SWIRL AT THREE PHASES), THE DATA CENTER FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');

// ---- the base: tools/art/retheme-bases.mjs's Expedition layout, the turbines in the Cabins' places, an Uplink ----
const EX_UNITS = [['ex_bot_0_0', 15.2, 9.4], ['ex_bot_2_0', 18.6, 8.2], ['ex_bot_8_0', 19.8, 10.1], ['ex_bot_12_0', 20.4, 7.3], ['ex_marine_4_0', 15.5, 5.8], ['ex_marine_4_0', 16.4, 5.9], ['ex_marine_4_0', 17.3, 6.0], ['ex_marine_0_0', 9.5, 12.6]];
const GOLD = [21.5, 9.2], PANEL = [25, 17];
function layout(power, portal) {
  return [['ex_datahall', 10, 7], [power, 5, 2], [power, 8, 2], [power, 5, 5], [power, 8, 5], ['ex_post', 12, 3], ['ex_post', 15, 3],
    ['ex_factory', 16, 7], ['ex_labdome', 16, 11], [portal, 4, 10], ['ex_radio', 21, 4], ['ex_radio', 21, 13], ['ex_uplink', 11, 12], [power, 1, 7]];
}
function base(seat, power, portal) {
  const c = cv(PANEL[0] * T, PANEL[1] * T); grass(c, seat + 11);
  const items = [];
  layout(power, portal).forEach(([kind, tx, ty], id) => { const n = SIZES[kind], x = (tx + n / 2) * T, y = (ty + n / 2) * T; items.push({ y, draw: [(cc) => drawBldg(P, cc, kind, x, y, seat, id)] }); });
  for (const [name, tx, ty] of EX_UNITS) items.push({ y: ty * T, draw: [(cc) => P.draw(cc, P.get(name), tx * T, ty * T, seat)] });
  items.push({ y: GOLD[1] * T, draw: [(cc) => P.draw(cc, P.get('rt_gold_0_0'), GOLD[0] * T, GOLD[1] * T)] });
  for (const it of items.sort((a, b) => a.y - b.y)) for (const d of it.draw) d(c);
  return c;
}
for (const [name, portal, what] of [['base', 'ex_gate', 'THE WIDE GATE'], ['base-tube', 'ex_gatetube', 'THE GATE AND TUBE'], ['base-ring', 'ex_ring', 'THE OVAL RING']]) {
  const c = base(1, 'ex_turbine', portal), z = resample(c, 0.75), cap = `EXPEDITION BASE: THE SERVER HALL, TURBINES, THE UPLINK, SENTRY GUNS, THE LAB DOME, ${what}`;
  label(c, cap, 6, 6, 2); save(`${name}-100`, c, false);
  label(z, `${cap}  ZOOM 0.75`, 6, 6, 2); save(`${name}-075`, z, false);
}
console.log('pictures ->', outDir);
