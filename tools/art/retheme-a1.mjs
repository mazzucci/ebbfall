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
import { execFileSync } from 'node:child_process';
import { encodePNG, decodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, makePainters, seatTints, half, resample, label, crop } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';

const args = process.argv.slice(2), mode = args.includes('--trial') ? 'trial' : args.includes('--check') ? 'check' : args.includes('--units') ? 'units' : 'pictures';
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

const SIZES = { kg_cottagehip: 2, kg_cottageround: 2, ex_vortex: 2, ex_warehouse: 3, ex_platform: 2, ex_posttent: 2, ex_posttavern: 2, ex_posthouse: 2, ex_hangar: 3, kg_castle: 4, kg_cottage: 2, kg_market: 2, kg_barracks: 3, kg_blacksmith: 2, kg_workshop: 3, kg_stables: 3, ex_pad: 2, kg_tower: 2, ex_datahall: 4, ex_labdome: 2, ex_gate: 2, ex_gatetube: 2, ex_ring: 2, ex_hall: 4, ex_bunkhouse: 2, ex_post: 2, ex_factory: 3, ex_lab: 2, ex_radio: 2, ex_portal: 2, ex_turbine: 2, ex_windfarm: 2, ex_uplink: 3 };
/** The turning heads over their bases, [name, the frames the pictures use]: the turrets at facings, the rotors and the
 *  gate's light at phases, the Uplink's dish at a few pan angles about its frame-0 turn. */
const HEADS = { kg_tower: ['kg_towerhead', [0, 5, 11]], ex_radio: ['ex_radiohead', [0, 5, 11]], ex_turbine: ['ex_turbinehead', [0, 5, 11]], ex_windfarm: ['ex_windfarmhead', [0, 5, 11]], ex_uplink: ['ex_uplinkhead', [0, 14, 2]], ex_gate: ['ex_gatehead', [0, 5, 11]], ex_gatetube: ['ex_gatetubehead', [0, 5, 11]], ex_ring: ['ex_ringhead', [0, 5, 11]], ex_pad: ['ex_padhead', [0]], ex_platform: ['ex_platformhead', [0]], ex_vortex: ['ex_vortexhead', [0, 5, 11]] }; // (the pads' ships landed unless a sheet asks for a lift frame)
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

const UNITS = '(ex_bot|ex_marine|kg_villager|kg_guard|kg_archer)_(0|2|4|6|8|10|12|14)_0';
const GOLD = [21.5, 9.2], PANEL = [25, 17]; // the bases' gold field and panel, in tiles
/** The pictures' render: every building that the sheets and bases show, the heads at their frames, a few units, the gold. */
const FINAL_FILTER = `^(bldg_ex_(turbine|windfarm|uplink|bunkhouse|radio|hall|datahall|post|posttent|posttavern|posthouse|factory|hangar|warehouse|lab|labdome|portal|gate|gatetube|ring|pad|platform|vortex)$|bldg_kg_|(ex_(radiohead|turbinehead|windfarmhead|gatehead|gatetubehead|ringhead)|kg_towerhead)_(0|5|11)$|ex_(padhead|platformhead)_(0|6|12)$|ex_vortexhead_(0|4|5|8|11|12)$|ex_uplinkhead_(${PAN.join('|')})$|${UNITS}|rt_gold_0_0$)`;

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

// ---- the units review (pictures and data only): every unit of both peoples as it will ship, the sizes of everything ----
if (mode === 'units') {
  const KG_U = [['harvester', 'kg', 'villager', 'VILLAGER'], ['trooper', 'kg', 'guard', 'GUARD'], ['lancer', 'kg', 'archer', 'ARCHER'], ['medic', 'kg', null, 'HEALER (OLD MODEL)'], ['observer', 'kg', 'balloon', 'BALLOON'], ['siegeTank', 'kg', 'cannon', 'CANNON'], ['bastion', 'kg', 'ballista', 'BALLISTA'], ['rider', 'kg', 'rider', 'RIDER'], ['knight', 'kg', 'knight', 'KNIGHT']];
  const EX_U = [['lumen', 'ex', 'bot', 'BOT'], ['scythe', 'ex', 'buggy', 'BUGGY'], ['prism', 'ex', 'mercenary', 'SELLSWORD'], ['bruiser', 'ex', 'veteran', 'BRUISER'], ['halo', 'ex', null, 'MEDIC (OLD MODEL)'], ['monolith', 'ex', 'rover', 'ROVER'], ['shrike', 'ex', 'drone', 'DRONE'], ['umbra', 'ex', 'marine', 'MARINE']];
  const ALL = [...KG_U, ...EX_U], DIRS = [0, 4, 8, 12];
  const U = await rendered('units', `^((kg_(villager|guard|archer|rider|knight|ballista|cannon|balloon)|ex_(bot|buggy|mercenary|veteran|rover|drone|marine))_(${DIRS.join('|')})_0|kg_cannon_(0|4)_3)$`, { polish: true });
  const B = await rendered('final', FINAL_FILTER, { polish: true });
  const PU = makePainters(U, seatTints(U.tints)), PB = makePainters(B, seatTints(B.tints)), old = atlasAt('HEAD'), Q = makePainters(old, seatTints(old.tints));
  /** The sprite and painter of a unit at facing `d`: the re-theme's render, or the old atlas for the two healers. */
  const spriteOf = ([sim, side, model], d) => model ? [PU, `${side}_${model}_${d}_0`] : [Q, `${sim}_${d}_0`];
  /** The opaque box of a sprite without its baked shadow (alpha 255 and not pure black: the finish's cast shadow is black at alpha 110, its soft edge below 255), CSS px at zoom 1. On-screen extents: a height carries the camera's foreshortening and, for a unit, UNIT_ART_SCALE; a building its fit and turn. */
  const box = (s) => { const { w, h, data } = s.img; let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (data[i + 3] === 255 && (data[i] | data[i + 1] | data[i + 2])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return x1 < 0 ? null : { w: (x1 - x0 + 1) / 2, h: (y1 - y0 + 1) / 2, x0, y0, x1, y1 }; };
  const union = (a, b) => !a ? b : !b ? a : { w: 0, h: 0, x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
  const fin = (b) => ({ w: (b.x1 - b.x0 + 1) / 2, h: (b.y1 - b.y0 + 1) / 2 });
  // the units sheet: both seats, each unit facing the camera (4) and east (0), labelled
  {
    const cw = 4 * T, rh = 6 * T, c = cv(cw * ALL.length, rh * 2); grass(c, 5);
    [0, 1].forEach(seat => ALL.forEach((u, i) => {
      const [p4, n4] = spriteOf(u, 4), [p0, n0] = spriteOf(u, 0), y = Math.round(seat * rh + rh - 1.3 * T);
      p4.draw(c, p4.get(n4), i * cw + cw * 0.36, y, seat); p0.draw(c, p0.get(n0), i * cw + cw * 0.72, y, seat);
      label(c, u[3], i * cw + 4, seat * rh + rh - 22, 2);
    }));
    label(c, 'EVERY UNIT AS IT WILL SHIP: THE KINGDOM, THEN THE EXPEDITION, EACH FACING THE CAMERA AND EAST. SEAT 0 ABOVE, SEAT 1 BELOW. 1X', 4, 4, 2);
    save('units', c);
  }
  // the changed units beside what they must part from: both seats, facing the camera and east
  {
    const cols = [['ex_bot', 'BOT'], ['ex_buggy', 'BUGGY'], ['ex_rover', 'ROVER 1.4X'], ['kg_cannon', 'CANNON'], ['kg_cannon', 'CANNON, RECOIL', 3], ['ex_radio', 'SENTRY GUN'], ['ex_marine', 'MARINE'], ['ex_mercenary', 'SELLSWORD'], ['kg_villager', 'VILLAGER']];
    const cw = 5 * T, rh = 6 * T, c = cv(cw * cols.length, rh * 2); grass(c, 7);
    [0, 1].forEach(seat => cols.forEach(([k, txt, f = 0], i) => { const y = Math.round(seat * rh + rh - 1.3 * T); if (k === 'ex_radio') { drawBldg(PB, c, k, i * cw + cw / 2, y - T, seat, 0); } else { PU.draw(c, PU.get(`${k}_4_${f}`), i * cw + cw * 0.34, y, seat); PU.draw(c, PU.get(`${k}_0_${f}`), i * cw + cw * 0.72, y, seat); } label(c, txt, i * cw + 4, seat * rh + rh - 22, 2); }));
    label(c, 'THE CHANGED UNITS (LIGHTER PAINT, MORE TEAM; THE ROVER 1.4X; THE CANNON, TRAVELLING AND IN RECOIL, BESIDE THE SENTRY GUN; THE MARINE IN TAN) WITH THE SELLSWORD AND THE VILLAGER. SEAT 0 ABOVE, SEAT 1 BELOW', 4, 4, 2);
    save('units-changed', c);
  }
  // the review sheet (the last batch): the Kingdom base with the hip-roof Cottage in its slots, and beside it, per seat,
  // the Cannon travelling and in recoil and the Marine beside the Sellsword
  {
    const KGB = [['kg_castle', 10, 7], ['kg_cottagehip', 5, 2], ['kg_cottagehip', 8, 2], ['kg_cottagehip', 5, 5], ['kg_cottagehip', 8, 5], ['kg_blacksmith', 12, 3], ['kg_barracks', 15, 2], ['kg_market', 16, 7], ['kg_stables', 16, 11], ['kg_workshop', 4, 10], ['kg_tower', 21, 4], ['kg_tower', 21, 13], ['kg_cottagehip', 12, 12]];
    const KGU = [['kg_villager_0_0', 15.2, 9.4], ['kg_villager_2_0', 18.6, 8.2], ['kg_villager_8_0', 19.8, 10.1], ['kg_villager_12_0', 20.4, 7.3], ['kg_guard_4_0', 15.5, 5.8], ['kg_guard_4_0', 16.4, 5.9], ['kg_archer_4_0', 17.3, 6.0], ['kg_guard_0_0', 9.5, 12.6]];
    const bp = base(0, KGB, KGU, PB), cols = [['kg_cannon', 'CANNON', 0], ['kg_cannon', 'CANNON, RECOIL', 3], ['ex_marine', 'MARINE', 0], ['ex_mercenary', 'SELLSWORD', 0]], cw = 5 * T, rh = Math.round(bp.h / 2);
    const c = cv(bp.w + cw * cols.length + T / 2, bp.h); grass(c, 15);
    for (let y = 0; y < bp.h; y++) c.data.set(bp.data.subarray(y * bp.w * 4, (y + 1) * bp.w * 4), y * c.w * 4);
    [0, 1].forEach(seat => cols.forEach(([k, txt, f], i) => { const x0 = bp.w + T / 2 + i * cw, y = Math.round(seat * rh + rh - 1.4 * T); PU.draw(c, PU.get(`${k}_4_${f}`), x0 + cw * 0.34, y, seat); PU.draw(c, PU.get(`${k}_0_${f}`), x0 + cw * 0.72, y, seat); label(c, `${txt} S${seat}`, x0 + 4, seat * rh + rh - 22, 2); }));
    label(c, 'THE LAST BATCH: THE KINGDOM BASE WITH THE HIP-ROOF COTTAGE (SEAT 0); THE CANNON TRAVELLING AND IN RECOIL, THE MARINE BESIDE THE SELLSWORD, SEAT 0 ABOVE AND SEAT 1 BELOW. 1X', 4, 4, 2);
    save('review', c);
  }
  // the crowd: the Kingdom (seat 0) facing east meets the Expedition (seat 1) facing west, at about the sim's spacing
  {
    const c = cv(22 * T, 11 * T); grass(c, 9); const items = [];
    const KG_ROWS = [['knight', [3.2, 3.6, 4.0, 4.4]], ['guard', [2.4, 2.8, 3.2, 3.6, 4.0, 4.4, 4.8]], ['archer', [1.6, 2.0, 2.4, 2.8, 3.2, 3.6]], ['rider', [0.9, 1.3]], ['ballista', [0.4, 0.8]], ['villager', [0.6, 1.0]]];
    const EX_ROWS = [['veteran', [3.2, 3.6, 4.0, 4.4]], ['mercenary', [2.4, 2.8, 3.2, 3.6, 4.0, 4.4, 4.8]], ['marine', [1.6, 2.0, 2.4, 2.8, 3.2, 3.6]], ['rover', [0.9, 1.3]], ['buggy', [0.4, 0.8]], ['bot', [0.6, 1.0]], ['drone', [2.2, 2.6]]];
    const rowsOf = (rows, side, x0, dirX, seat, dir) => rows.forEach(([model, ys], r) => ys.forEach(y => { const x = x0 + dirX * (r * 1.5 + ((y * 7) % 1) * 0.4), yy = 2.4 + y * 1.1; items.push({ y: yy, draw: (cc) => PU.draw(cc, PU.get(`${side}_${model}_${dir}_0`), x * T, yy * T, seat) }); })); // (ranks 1.5 tiles apart, a unit every 1.1 tiles down a rank, a little stagger)
    rowsOf(KG_ROWS, 'kg', 9.4, -1, 0, 0); rowsOf(EX_ROWS, 'ex', 12.6, 1, 1, 8);
    for (const it of items.sort((a, b) => a.y - b.y)) it.draw(c);
    label(c, 'THE TWO ARMIES MEETING: THE KINGDOM (SEAT 0) FACING EAST, THE EXPEDITION (SEAT 1) FACING WEST. 1X', 4, 4, 2);
    save('crowd', c);
  }
  // the lineup: every unit facing the camera on one ground line, sorted by its on-screen height, then three buildings for scale
  const sizes = [];
  for (const u of ALL) { const [p4, n4] = spriteOf(u, 4), [p0, n0] = spriteOf(u, 0), b4 = box(p4.get(n4)), b0 = box(p0.get(n0)); sizes.push({ kind: u[0], name: u[3], people: u[1] === 'kg' ? 'Kingdom' : 'Expedition', what: 'unit', height: b0.h, width: b4.w, length: b0.w, team: p4.share(n4), brightness: +brightness(p4.get(n4)).toFixed(2) }); } // (height: the box of the unit facing east, where its length lies across the screen and adds nothing to the height; width: facing the camera; length: facing east)
  const BLD = [['core', 'kg_castle', 'CASTLE'], ['depot', 'kg_cottage', 'COTTAGE'], ['extractor', 'kg_market', 'MARKET'], ['barracks', 'kg_barracks', 'BARRACKS'], ['forge', 'kg_blacksmith', 'BLACKSMITH'], ['factory', 'kg_workshop', 'WORKSHOP'], ['turret', 'kg_tower', 'WATCHTOWER'], ['airfield', 'kg_stables', 'STABLES'],
    ['conflux', 'ex_datahall', 'DATA CENTER'], ['spire', 'ex_turbine', 'WIND TURBINE'], ['siphon', 'ex_posttavern', 'RECRUITING POST'], ['kiln', 'ex_warehouse', 'FACTORY'], ['loom', 'ex_labdome', 'LAB'], ['ward', 'ex_radio', 'SENTRY GUN'], ['uplink', 'ex_uplink', 'UPLINK'], ['eclipse', 'ex_vortex', 'PORTAL']];
  for (const [sim, k, nm] of BLD) { let b = box(PB.get(`bldg_${k}`)); if (HEADS[k]) b = union(b, box(PB.get(`${HEADS[k][0]}_0`))); const f = fin(b), s = PB.get(`bldg_${k}`); sizes.push({ kind: sim, name: nm, people: k.startsWith('kg') ? 'Kingdom' : 'Expedition', what: 'building', footprint: `${SIZES[k]}x${SIZES[k]}`, angle: s.turn?.yaw ?? 0, fit: +(s.turn?.scale ?? 1).toFixed(2), height: f.h, width: f.w }); }
  writeFileSync(join(outDir, 'sizes.json'), JSON.stringify(sizes, null, 1));
  writeFileSync(join(outDir, 'sizes.csv'), 'kind,name,people,what,footprint,angle,fit,height_px,width_px,length_px\n' + sizes.map(r => [r.kind, r.name, r.people, r.what, r.footprint ?? '', r.angle ?? '', r.fit ?? '', r.height, r.width, r.length ?? ''].join(',')).join('\n') + '\n');
  {
    const units = sizes.filter(r => r.what === 'unit').sort((a, b) => a.height - b.height), byKind = Object.fromEntries(ALL.map(u => [u[0], u]));
    const step = 3.2 * T, scale3 = [['kg_cottage', 2], ['kg_barracks', 3], ['ex_datahall', 4]], bw = scale3.reduce((t, [, n]) => t + (n + 2.5) * T, 0);
    const c = cv(units.length * step + bw + T, 8 * T); grass(c, 13); const gy = Math.round(6.4 * T); // (an integer y: a fractional one lands the labels a column over)
    units.forEach((r, i) => { const [p0, n0] = spriteOf(byKind[r.kind], 0); p0.draw(c, p0.get(n0), i * step + step / 2, gy, 0); label(c, `${r.name.replace(' (OLD MODEL)', '*')} ${r.height}`, i * step + 4, gy + 14, 2); }); // (facing east: the height as measured)
    let x = units.length * step + T / 2;
    for (const [k, n] of scale3) { const cx = x + (n + 2.5) * T / 2; drawBldg(PB, c, k, cx, gy - n * T / 2, 0, 0); label(c, `${k.slice(3).toUpperCase()} ${sizes.find(r => r.name === (k === 'ex_datahall' ? 'DATA CENTER' : k.slice(3).toUpperCase())).height}`, x + 4, gy + 14, 2); x += (n + 2.5) * T; }
    label(c, 'EVERY UNIT ON ONE GROUND LINE, SORTED BY ON-SCREEN HEIGHT (CSS PX AT ZOOM 1), A COTTAGE, A BARRACKS AND THE DATA CENTER FOR SCALE. * THE OLD MODEL. SEAT 0. 1X', 4, 4, 2);
    save('lineup', c, false);
  }
  // the units table: team share, brightness, size, the maker's notes
  const NOTES = {
    harvester: 'ok: a bundle on the back', trooper: 'ok: a shield and spear', lancer: 'a bow: slim; near the Villager in build at 0.75', medic: 'the old Harbour Mender (pale coat, satchel): not in the re-theme look', observer: 'ok: the one balloon', siegeTank: 'the Cannon: a light iron barrel on a warm light wooden carriage, two big wheels; the wood keeps it apart from the Sentry gun', bastion: 'ok, low and wide; near the Buggy in footprint', rider: 'ok: a horse', knight: 'ok: a horse with armor; near the Rider at 0.75',
    lumen: 'ok: a low box with arms', scythe: 'ok: wheels and a bull bar', prism: 'a sword and vest', bruiser: 'ok: the big shield', halo: 'the old Vael Tender (a flower): not in the re-theme look', monolith: 'ok: a big low machine', shrike: 'ok: the one flyer with a shadow apart', umbra: 'a pale near-future soldier: off-white plates, a cyan visor, a compact rifle, team on both shoulders; nothing like the dark Sellsword',
  };
  const rows = sizes.filter(r => r.what === 'unit').map(r => ({ ...r, note: NOTES[r.kind] ?? '' }));
  writeFileSync(join(outDir, 'units.json'), JSON.stringify(rows, null, 1));
  console.log('\nunit                   team   bright  height  width (facing camera)  length (facing east)   note');
  for (const r of rows) console.log(`  ${r.name.padEnd(20)} ${String(r.team).padEnd(6)} ${r.brightness}    ${String(r.height).padStart(5)}  ${String(r.width).padStart(6)}                ${String(r.length).padStart(6)}               ${r.note}`);
  console.log('\nbuilding               h x w (on screen)  angle fit');
  for (const r of sizes.filter(r => r.what === 'building')) console.log(`  ${r.name.padEnd(20)} ${String(r.height).padStart(5)} x ${String(r.width).padEnd(6)} ${String(r.angle).padStart(4)}  ${r.fit}`);
  console.log('units review ->', outDir);
  process.exit(0);
}

// ---- the pictures ----
const t0 = Date.now();
const art = await rendered('final', FINAL_FILTER, { polish: true });
console.log(`rendered ${art.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makePainters(art, seatTints(art.tints));
console.log('building      angle   fit   spill W / E / S   team    cyan   size at 1x');
for (const k of ['kg_castle', 'kg_cottage', 'kg_market', 'kg_barracks', 'kg_blacksmith', 'kg_workshop', 'kg_stables', 'ex_datahall', 'ex_turbine', 'ex_windfarm', 'ex_uplink', 'ex_radio', 'ex_labdome', 'ex_vortex', 'ex_platform', 'ex_warehouse', 'ex_posttavern', 'ex_pad', 'ex_posttent', 'ex_posthouse', 'ex_hangar', 'ex_gate', 'ex_gatetube', 'ex_ring', 'ex_bunkhouse', 'ex_lab', 'ex_portal', 'kg_tower']) {
  const s = P.get(`bldg_${k}`), turn = s.turn ?? { yaw: 0, scale: 1 }, sz = P.sizeOf(`bldg_${k}`);
  console.log(`  ${k.padEnd(12)} ${String(turn.yaw).padStart(4)}   ${turn.scale.toFixed(2)}  ${fmtSpill(spill(s, SIZES[k])).padEnd(18)} ${String(P.share(`bldg_${k}`)).padEnd(6)}  ${(cyan(s) * 100).toFixed(1).padStart(4)}%  ${sz[0]} x ${sz[1]}${clipped(s) ? '  CLIPPED' : ''}`);
  if (HEADS[k]) for (const d of (k === 'ex_uplink' ? PAN : (k === 'ex_pad' || k === 'ex_platform') ? [0, 6, 12] : HEADS[k][1])) { const h = `${HEADS[k][0]}_${d}`, hs = P.sizeOf(h); console.log(`    ${h.padEnd(18)} team ${P.share(h)}  ${hs[0]} x ${hs[1]}${clipped(P.get(h)) ? '  CLIPPED' : ''}`); }
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
sheet('turbine', [['ex_bunkhouse', "TODAY'S CABIN"], ['ex_turbine', 'ONE TURBINE'], ['ex_radio', 'SENTRY GUN'], ['ex_datahall', 'DATA CENTER']], 'THE POWER SOURCE: TODAY, THE TURBINE, THE SENTRY GUN AND THE DATA CENTER FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('uplink', [['ex_uplink', 'THE UPLINK'], ['ex_radio', 'SENTRY GUN'], ['ex_labdome', 'LAB'], ['ex_datahall', 'DATA CENTER']], 'THE UPLINK BESIDE THE SENTRY GUN, THE LAB AND THE DATA CENTER. SEAT 0 ABOVE, SEAT 1 BELOW', 8 * T);
sheet('uplink-pan', PAN.map(d => ['ex_uplink', `PAN ${((d + 8) % 16 - 8) * -22.5}`, d]), 'THE UPLINK: THE DISH PANNED ABOUT ITS COLUMN (THE HEAD AT FIVE FRAMES). SEAT 0 ABOVE, SEAT 1 BELOW', 8 * T);
sheet('sentry', [['ex_radio', 'SENTRY GUN 1.25X'], ['kg_tower', 'WATCHTOWER'], ['ex_turbine', 'ONE TURBINE']], 'THE SENTRY GUN (1.25X) BESIDE THE WATCHTOWER AND A TURBINE FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('lab', [['ex_lab', "TODAY'S LAB"], ['ex_labdome', 'THE DOME'], ['ex_datahall', 'DATA CENTER']], 'THE LAB: TODAY AND THE DOME, THE DATA CENTER FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('post', [['ex_post', "TODAY'S POST"], ['ex_posttavern', 'THE TAVERN HALL'], ['kg_cottage', 'KINGDOM COTTAGE'], ['kg_barracks', 'KINGDOM BARRACKS']], 'THE RECRUITING POST: TODAY AND THE TAVERN HALL (THE PICK, LONGER), THE COTTAGE AND THE BARRACKS FOR COMPARISON. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('factory', [['ex_factory', "TODAY'S FACTORY"], ['ex_hangar', 'THE HANGAR (REJECTED)'], ['ex_warehouse', 'THE WAREHOUSE'], ['ex_datahall', 'DATA CENTER']], 'THE FACTORY: TODAY, THE HANGAR AND THE WAREHOUSE (THE COG FLAT ON ITS ROOF), THE DATA CENTER FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW', 8 * T);
sheet('portal', [['ex_portal', "TODAY'S PORTAL"], ['ex_vortex', 'THE VORTEX, FRAME 0', 0], ['ex_vortex', 'FRAME 4', 4], ['ex_vortex', 'FRAME 8', 8], ['ex_vortex', 'FRAME 12', 12], ['ex_datahall', 'DATA CENTER']], 'THE PORTAL AS A BLACK-HOLE VORTEX: TODAY, THE SPIRAL AT FOUR OF ITS 16 SPIN FRAMES, THE DATA CENTER FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('portal-rejected', [['ex_gate', 'THE WIDE GATE'], ['ex_gatetube', 'GATE AND TUBE'], ['ex_ring', 'THE OVAL RING'], ['ex_pad', 'THE HELIPAD', 0], ['ex_platform', 'THE PLATFORM', 0]], 'THE PORTAL: THE REJECTED OPTIONS, FOR THE RECORD');
sheet('cottage', [['kg_cottage', 'THE WIDE ONE'], ['kg_cottagehip', 'A: SQUARE, HIP ROOF'], ['kg_cottageround', 'B: ROUND HUT, CONE ROOF'], ['kg_barracks', 'BARRACKS']], 'THE COTTAGE: THE WIDE ONE AND THE TWO OPTIONS, THE BARRACKS FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW');
sheet('datahall', [['ex_hall', 'THE BLOCK'], ['ex_datahall', 'THE SERVER HALL, LIGHTER'], ['kg_castle', 'CASTLE']], 'THE DATA CENTER: THE SERVER HALL WITH ITS DARK FACES A STEP LIGHTER, THE CASTLE FOR SCALE. SEAT 0 ABOVE, SEAT 1 BELOW', 8 * T);
// the Kingdom pass: today (the committed atlas) beside the new render, both seats, a row per building
{
  const Q = makePainters(atlasAt('HEAD'), seatTints(atlasAt('HEAD').tints));
  const rows = [['core', 'kg_castle', 'CASTLE'], ['depot', 'kg_cottage', 'COTTAGE'], ['extractor', 'kg_market', 'MARKET'], ['barracks', 'kg_barracks', 'BARRACKS'], ['forge', 'kg_blacksmith', 'BLACKSMITH'], ['factory', 'kg_workshop', 'WORKSHOP'], ['turret', 'kg_tower', 'WATCHTOWER'], ['airfield', 'kg_stables', 'STABLES']];
  const cw = 6 * T, rhs = rows.map(([, k]) => Math.round((SIZES[k] + 3.4) * T)), c = cv(cw * 4, rhs.reduce((a, b) => a + b, 0)); grass(c, 5);
  let y = 0;
  rows.forEach(([game, k, nm], i) => {
    const n = SIZES[k], s = P.get(`bldg_${k}`), turn = s.turn ?? { yaw: 0, scale: 1 }, cells = [[Q, `bldg_${game}`, 0, 'TODAY'], [P, `bldg_${k}`, 0, `NEW ${turn.yaw} X${turn.scale.toFixed(2)}`], [Q, `bldg_${game}`, 1, 'TODAY'], [P, `bldg_${k}`, 1, `NEW ${turn.yaw} X${turn.scale.toFixed(2)}`]];
    cells.forEach(([pr, name, seat, txt], j) => { const x = j * cw + cw / 2, by = Math.round(y + rhs[i] - 1.2 * T - n * T / 2); pr.draw(c, pr.get(name), x, by, seat); if (k === 'kg_tower') pr.draw(c, pr.get(pr === Q ? 'turret_head_0' : 'kg_towerhead_0'), x, by, seat); label(c, txt, j * cw + 4, y + rhs[i] - 22, 2); });
    label(c, nm, 4, y + 4, 2); y += rhs[i];
  });
  label(c, 'THE KINGDOM: TODAY (THE ATLAS) | NEW AT -20 (THE CASTLE SCALED TO FIT, THE LOW WIDE COTTAGE, THE CREAM-AND-TAN MARKET). SEAT 0, THEN SEAT 1. 1X', c.w - 1500, 4, 2);
  save('kingdom', c);
}

// ---- the bases: tools/art/retheme-bases.mjs's layouts, the Expedition with the picks, the Kingdom with its pass ----
const EX_UNITS = [['ex_bot_0_0', 15.2, 9.4], ['ex_bot_2_0', 18.6, 8.2], ['ex_bot_8_0', 19.8, 10.1], ['ex_bot_12_0', 20.4, 7.3], ['ex_marine_4_0', 15.5, 5.8], ['ex_marine_4_0', 16.4, 5.9], ['ex_marine_4_0', 17.3, 6.0], ['ex_marine_0_0', 9.5, 12.6]];
const KG_UNITS = [['kg_villager_0_0', 15.2, 9.4], ['kg_villager_2_0', 18.6, 8.2], ['kg_villager_8_0', 19.8, 10.1], ['kg_villager_12_0', 20.4, 7.3], ['kg_guard_4_0', 15.5, 5.8], ['kg_guard_4_0', 16.4, 5.9], ['kg_archer_4_0', 17.3, 6.0], ['kg_guard_0_0', 9.5, 12.6]];
const EXPEDITION = [['ex_datahall', 10, 7], ['ex_turbine', 5, 2], ['ex_turbine', 8, 2], ['ex_turbine', 5, 5], ['ex_turbine', 8, 5], ['ex_posttavern', 12, 3], ['ex_posttavern', 15, 3],
  ['ex_warehouse', 16, 7], ['ex_labdome', 16, 11], ['ex_vortex', 4, 10], ['ex_radio', 21, 4], ['ex_radio', 21, 13], ['ex_uplink', 11, 12], ['ex_turbine', 1, 7]];
const KINGDOM = [['kg_castle', 10, 7], ['kg_cottagehip', 5, 2], ['kg_cottagehip', 8, 2], ['kg_cottagehip', 5, 5], ['kg_cottagehip', 8, 5], ['kg_blacksmith', 12, 3], ['kg_barracks', 15, 2],
  ['kg_market', 16, 7], ['kg_stables', 16, 11], ['kg_workshop', 4, 10], ['kg_tower', 21, 4], ['kg_tower', 21, 13], ['kg_cottagehip', 12, 12]]; // (the Cottage slots: option A, the hip roof, Stelian's pick)
function base(seat, list, units, pr = P) {
  const c = cv(PANEL[0] * T, PANEL[1] * T); grass(c, seat + 11);
  const items = [];
  list.forEach(([kind, tx, ty], id) => { const n = SIZES[kind], x = (tx + n / 2) * T, y = (ty + n / 2) * T; items.push({ y, draw: [(cc) => drawBldg(pr, cc, kind, x, y, seat, id)] }); });
  for (const [name, tx, ty] of units) items.push({ y: ty * T, draw: [(cc) => pr.draw(cc, pr.get(name), tx * T, ty * T, seat)] });
  items.push({ y: GOLD[1] * T, draw: [(cc) => pr.draw(cc, pr.get('rt_gold_0_0'), GOLD[0] * T, GOLD[1] * T)] });
  for (const it of items.sort((a, b) => a.y - b.y)) for (const d of it.draw) d(c);
  return c;
}
for (const [name, seat, list, units, cap] of [['base', 1, EXPEDITION, EX_UNITS, 'EXPEDITION BASE: THE SERVER HALL, TURBINES, TAVERN HALLS, THE WAREHOUSE, THE LAB DOME, THE VORTEX, SENTRY GUNS, THE UPLINK'], ['kingdom-base', 0, KINGDOM, KG_UNITS, 'KINGDOM BASE AFTER THE PASS, THE HIP-ROOF COTTAGE IN ITS SLOTS']]) {
  const c = base(seat, list, units), z = resample(c, 0.75);
  label(c, cap, 6, 6, 2); save(`${name}-100`, c, false);
  label(z, `${cap}  ZOOM 0.75`, 6, 6, 2); save(`${name}-075`, z, false);
}
{ // a 1x crop of the Kingdom base's north-west: the four hip-roof Cottages (the last change: half-timbered walls)
  const c = base(0, KINGDOM, KG_UNITS), cr = crop(c, 4 * T, 1 * T, 8 * T, 7 * T); label(cr, 'THE HIP-ROOF COTTAGE, HALF-TIMBERED, IN THE KINGDOM BASE. 1X', 4, 4, 2); save('cottage-crop', cr, false);
}
console.log('pictures ->', outDir);

// ---- the consistency sheet: every building of both peoples at 1x, as they will ship: the Kingdom from the committed
// atlas (HEAD:public/art), the Expedition's approved art in each slot; both seats on the same ground; and the table:
// team share, mean brightness, angle, and the maker's own rule notes ----
function atlasAt(ref) {
  const show = (p) => execFileSync('git', ['show', `${ref}:public/art/${p}`], { maxBuffer: 1 << 28 });
  const index = JSON.parse(show('atlas.json').toString()), sprites = [];
  for (const page of index.pages) {
    const { frames, meta } = JSON.parse(show(page).toString()), img = decodePNG(show(meta.image));
    for (const [name, f] of Object.entries(frames)) {
      if (!/^(bldg_|turret_head_0|medic_|halo_)/.test(name)) continue;
      const { x, y, w, h } = f.frame, src = f.sourceSize, o = f.spriteSourceSize, out = canvas(src.w, src.h);
      for (let j = 0; j < h; j++) out.data.set(img.data.subarray(((y + j) * img.w + x) * 4, ((y + j) * img.w + x + w) * 4), ((o.y + j) * src.w + o.x) * 4);
      sprites.push({ name, img: out, anchor: f.anchor, ...(name.endsWith('_m') ? { trim: true } : {}) });
    }
  }
  return Object.assign(sprites, { tints: index.tints });
}
/** Mean luminance (0..1) of a sprite's solid, non-shadow pixels. */
function brightness(s) { const { data } = s.img; let n = 0, t = 0; for (let i = 0; i < data.length; i += 4) { if (data[i + 3] !== 255 || !(data[i] | data[i + 1] | data[i + 2])) continue; n++; t += (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 255; } return t / n; }
{
  const KG = [['kg_castle', 'CASTLE'], ['kg_cottage', 'COTTAGE'], ['kg_market', 'MARKET'], ['kg_barracks', 'BARRACKS'], ['kg_blacksmith', 'BLACKSMITH'], ['kg_workshop', 'WORKSHOP'], ['kg_tower', 'WATCHTOWER'], ['kg_stables', 'STABLES']];
  const EX = [['ex_datahall', 'DATA CENTER'], ['ex_turbine', 'WIND TURBINE'], ['ex_posttavern', 'RECRUITING POST'], ['ex_warehouse', 'FACTORY'], ['ex_labdome', 'LAB'], ['ex_radio', 'SENTRY GUN'], ['ex_uplink', 'UPLINK'], ['ex_vortex', 'PORTAL']];
  const NOTES = { // the maker's own reading against Stelian's rules (no tiny details, team on a flag or trim only, one iconic shape, not too dark, a consistent angle)
    kg_castle: 'dark; many towers and flags (its own shape)', kg_cottage: 'ok after the pass', kg_market: 'the gold chest is small but is the cue', kg_barracks: 'ok after the pass (bare yard)', kg_blacksmith: 'dark open front; the anvil and hearth stay (the cue)', kg_workshop: 'siege frame and balloon: still two shapes', kg_tower: 'ok', kg_stables: 'horse and fence are smallish',
    ex_datahall: 'ok, a step lighter', ex_turbine: 'ok', ex_posttavern: 'ok (the sign is its one detail)', ex_warehouse: 'ok', ex_labdome: 'ok', ex_radio: 'ok', ex_uplink: 'ok (team share high: the flag is big beside a thin stand)', ex_vortex: 'ok (round; the spiral is the head)',
  };
  const cols = [...KG, ...EX].map(([k, nm]) => { const s = P.get(`bldg_${k}`), yaw = s.turn?.yaw ?? 0; return { pr: P, name: `bldg_${k}`, head: HEADS[k] ? `${HEADS[k][0]}_0` : null, n: SIZES[k], txt: `${nm} ${yaw > 0 ? '+' : ''}${yaw}`, k, yaw, fit: s.turn?.scale ?? 1 }; });
  const cw = 6 * T, rh = 9 * T, c = cv(cw * cols.length, rh * 2); grass(c, 5);
  [0, 1].forEach(seat => cols.forEach((col, i) => {
    const x = i * cw + cw / 2, by = Math.round(seat * rh + rh - 1.2 * T - col.n * T / 2);
    col.pr.draw(c, col.pr.get(col.name), x, by, seat); if (col.head) col.pr.draw(c, col.pr.get(col.head), x, by, seat);
    label(c, col.txt, i * cw + 4, seat * rh + rh - 22, 2);
  }));
  label(c, 'EVERY BUILDING AS IT WILL SHIP, ONE ANGLE (-20) FOR ALL BUT THE ROUND AND TURNING ONES: THE KINGDOM AFTER ITS PASS, THE EXPEDITION\'S PICKS. SEAT 0 ABOVE, SEAT 1 BELOW. 1X', 4, 4, 2);
  save('consistency', c);
  console.log('\nbuilding            angle   fit    team   bright   note');
  const rows = [];
  for (const col of cols) { const s = col.pr.get(col.name), team = col.pr.share(col.name), br = brightness(s); rows.push({ kind: col.k, angle: col.yaw, fit: +col.fit.toFixed(2), team, brightness: +br.toFixed(2), note: NOTES[col.k] ?? '' }); console.log(`  ${col.txt.padEnd(20)} ${String(col.yaw).padStart(4)}   ${col.fit.toFixed(2)}   ${String(team).padEnd(6)} ${br.toFixed(2)}     ${NOTES[col.k] ?? ''}${col.fit < 0.85 ? '   FIT BELOW 0.85' : ''}`); }
  writeFileSync(join(outDir, 'consistency.json'), JSON.stringify(rows, null, 1));
}
console.log('consistency sheet ->', join(outDir, 'consistency-1x.png'));
