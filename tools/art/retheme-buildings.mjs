// The buildings family's pictures (the re-theme, 2026-11-10): node tools/art/retheme-buildings.mjs <outdir> [--elev=40]
// Renders both peoples' buildings (retheme.js RT_BUILDINGS and the two turning heads) with a few slice units for scale
// and writes, at a landscape phone's size (1688x780 at 2x, 844x390 CSS):
//   family.png (2x), family-1x.png, family-grey.png: four phone rows, the kingdom (seat 0) then the Expedition (seat 1),
//     each people's buildings beside the slice's main building and its units, zoom 1.0 on the grass
//   base-kingdom.png, base-expedition.png: a full base of each people (every building once, units) at zoom 1.0, and
//     base-kingdom-075.png, base-expedition-075.png the same at 0.75 (2x and -1x copies of each)
//   range-overlay.png (+ -1x): the Expedition base with a machine selected and the Radio tower's and Data centre's range
//     shown on the ground (the proposed look: a faint pale tint inside, a soft ring at the edge)
//   models/<name>.png and <name>@2x.png: each new building (and the fixed Castle and Data centre) alone in seats 0, 1 and 6
//     with its team share, plus -protan and -deutan copies; the two towers drawn with their heads
//   shares.json, and the printed shares (review.mjs's measure, facing 0) and sizes at zoom 1.0 (CSS px, w x h)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { SEAT_COLORS } from '../../src/client/look.js';
import { canvas, ground, half, resample, crop, paste, simulate, grey, meanValue, label, makeScene } from './retheme-scene.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/buildings';
const ELEV = +opt('elev', 40);
mkdirSync(join(outDir, 'models'), { recursive: true });

const KG = ['cottage', 'market', 'barracks', 'blacksmith', 'workshop', 'tower', 'stables'], EX = ['bunkhouse', 'post', 'factory', 'lab', 'radio', 'portal'];
const HEADS = { bldg_kg_tower: 'kg_towerhead', bldg_ex_radio: 'ex_radiohead' };
const FILTER = '^bldg_(kg|ex)_|^kg_towerhead_|^ex_radiohead_|^kg_(villager|guard|knight)_(0|1|15|4)_0$|^ex_(bot|buggy|marine)_(8|9|7|4)_0$';
const t0 = Date.now();
const fresh = await render3d(FILTER, { elev: ELEV });
console.log(`rendered ${fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
// Seat 0 royal blue (the PM, slice round 3): the picture's own override, as retheme-compare.mjs does it; nothing in src/.
const TINTS = [...fresh.tints], SEAT0 = 0x2f63d6, ch = (c, k) => c >> (16 - 8 * k) & 255;
TINTS[0] = [0, 1, 2].reduce((t, k) => t << 8 | Math.min(255, Math.round(ch(fresh.tints[5], k) * ch(SEAT0, k) / Math.max(1, ch(SEAT_COLORS[5], k)))), 0);
const sc = makeScene(fresh, TINTS), { get, draw, place, share, size, masks } = sc;
const head = (name, dir = 4) => HEADS[name] ? `${HEADS[name]}_${dir}` : undefined;

// ---- shares and sizes ----
const shares = {};
/** A tower with its head: team px of both masks over the solid px of both sprites (the same cell and anchor). */
function shareWithHead(base, hd) {
  const b = get(base).img, h = get(hd).img, mb = masks.get(base), mh = masks.get(hd); let solid = 0, team = 0;
  for (let i = 3; i < b.data.length; i += 4) { if (b.data[i] === 255 || h.data[i] === 255) solid++; if (mb.data[i] >= 128 || mh.data[i] >= 128) team++; }
  return +(team / solid).toFixed(3);
}
console.log('team colour share of the solid pixels (facing 0; the floor is 0.12 for buildings: floors, not targets):');
for (const name of [...KG.map(k => `bldg_kg_${k}`), 'bldg_kg_castle', ...EX.map(k => `bldg_ex_${k}`), 'bldg_ex_hall']) {
  shares[name] = share(name); let line = `  ${name.padEnd(20)} ${shares[name].toFixed(3)}${shares[name] < 0.12 ? '  BELOW THE FLOOR' : ''}`;
  if (HEADS[name]) { const hn = `${HEADS[name]}_0`; shares[hn] = share(hn); shares[`${name}+head`] = shareWithHead(name, hn); line += `   head ${shares[hn].toFixed(3)}, with its head ${shares[`${name}+head`].toFixed(3)}`; }
  console.log(line);
}
writeFileSync(join(outDir, 'shares.json'), JSON.stringify(shares, null, 1));
console.log('sizes at zoom 1.0 (CSS px, width x height, the shadow left out):');
const sizes = {};
for (const name of [...KG.map(k => `bldg_kg_${k}`), ...EX.map(k => `bldg_ex_${k}`), 'bldg_kg_castle', 'bldg_ex_hall']) { const [w, h] = size(name); sizes[name] = [w, h]; console.log(`  ${name.padEnd(20)} ${w} x ${h}`); }
writeFileSync(join(outDir, 'sizes.json'), JSON.stringify(sizes, null, 1));

// ---- the family rows ----
const W = 1688, H = 780;
const rows = [
  { text: 'ROW 1  THE KINGDOM (SEAT 0): CASTLE, BARRACKS, WORKSHOP, STABLES; VILLAGER, GUARD, KNIGHT', list: [
    ['bldg_kg_castle', 230, 440, 0], ['bldg_kg_barracks', 560, 450, 0], ['bldg_kg_workshop', 860, 450, 0], ['bldg_kg_stables', 1160, 450, 0],
    ['kg_villager_1_0', 1400, 330, 0], ['kg_guard_0_0', 1440, 430, 0], ['kg_guard_15_0', 1500, 500, 0], ['kg_knight_0_0', 1440, 600, 0]] },
  { text: 'ROW 2  THE KINGDOM: COTTAGE, MARKET, BLACKSMITH, WATCHTOWER (ITS ARCHER TURNING); CASTLE FOR SCALE', list: [
    ['bldg_kg_cottage', 180, 440, 0], ['bldg_kg_market', 440, 440, 0], ['bldg_kg_blacksmith', 700, 440, 0], ['bldg_kg_tower', 960, 440, 0, 'kg_towerhead_2'],
    ['bldg_kg_castle', 1380, 440, 0], ['kg_villager_0_0', 1150, 400, 0], ['kg_guard_1_0', 1170, 520, 0]] },
  { text: 'ROW 3  THE EXPEDITION (SEAT 1): DATA CENTRE, FACTORY, PORTAL, RADIO TOWER (ITS TURRET TURNING); BOT, BUGGY, MARINE', list: [
    ['bldg_ex_hall', 230, 440, 1], ['bldg_ex_factory', 560, 450, 1], ['bldg_ex_portal', 830, 440, 1], ['bldg_ex_radio', 1050, 440, 1, 'ex_radiohead_6'],
    ['ex_bot_8_0', 1300, 330, 1], ['ex_buggy_8_0', 1360, 430, 1], ['ex_marine_8_0', 1300, 530, 1], ['ex_marine_9_0', 1400, 580, 1]] },
  { text: 'ROW 4  THE EXPEDITION: BUNKHOUSE, RECRUITING POST, LAB; DATA CENTRE FOR SCALE', list: [
    ['bldg_ex_bunkhouse', 200, 440, 1], ['bldg_ex_post', 460, 440, 1], ['bldg_ex_lab', 720, 440, 1], ['bldg_ex_hall', 1300, 440, 1],
    ['ex_bot_9_0', 980, 400, 1], ['ex_marine_7_0', 1000, 520, 1]] },
];
const big = canvas(W, H * rows.length);
rows.forEach((row, n) => {
  const sub = canvas(W, H); ground(sub, 0, H, 2 + n); place(sub, row.list);
  label(sub, `${row.text}  GROUND ${meanValue(sub, 0, H).toFixed(2)}`, 12, 12, 2);
  paste(big, sub, 0, n * H);
});
writeFileSync(join(outDir, 'family.png'), encodePNG(big));
writeFileSync(join(outDir, 'family-1x.png'), encodePNG(half(big)));
writeFileSync(join(outDir, 'family-grey.png'), encodePNG(grey(big)));

// ---- the bases: every building once, a few units, on a bigger ground; the phone's view at 1.0 and the whole at 0.75 ----
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
  const b = canvas(BW, BH); ground(b, 0, BH, seed); place(b, list);
  const z100 = crop(b, (BW - W) / 2, (BH - H) / 2, W, H), z075 = resample(b, 0.75);
  label(z100, `${name.toUpperCase()} BASE, ZOOM 1.0  GROUND ${meanValue(z100, 0, H).toFixed(2)}`, 12, 12, 2); label(z075, `${name.toUpperCase()} BASE, ZOOM 0.75`, 12, 12, 2);
  writeFileSync(join(outDir, `base-${name}.png`), encodePNG(z100)); writeFileSync(join(outDir, `base-${name}-1x.png`), encodePNG(half(z100)));
  writeFileSync(join(outDir, `base-${name}-075.png`), encodePNG(z075)); writeFileSync(join(outDir, `base-${name}-075-1x.png`), encodePNG(half(z075)));
  return b;
}
base('kingdom', KINGDOM_BASE, 11);
const exBase = base('expedition', EXPEDITION_BASE, 13);

// ---- the range overlay mock-up: the Expedition base with a Buggy selected; the Radio tower's and Data centre's range
// on the ground as a faint pale tint inside and a soft ring at the edge (neutral, not the team's colour: it must read
// in every seat and never fight the grass or the team flags) ----
{
  const c = crop(exBase, (BW - W) / 2, (BH - H) / 2, W, H), ox = (BW - W) / 2, oy = (BH - H) / 2;
  const ranges = [[1560 - ox, 500 - oy, 7 * 32 * 2], [1000 - ox, 500 - oy, 9 * 32 * 2]];           // [x, y, radius in 2x px]: 7 tiles round a Radio tower, 9 round the Data centre (stand-in numbers)
  const SQ = 0.62;                                                                                 // the ground's foreshortening at 40 degrees: a circle on the ground is this ellipse
  const over = canvas(W, H);                                                                       // the overlay's alpha and the ring's: painted first, then composited under the sprites' shadows is not possible here, so it goes over the ground and under nothing (a mock-up)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let inside = 0, edge = 0;
    const ds = ranges.map(([cx, cy, r]) => Math.hypot(x - cx, (y - cy) / SQ) / r);
    ds.forEach((d, k) => { if (d < 1) inside = 1; if (ds.every((o, j) => j === k || o > 0.988)) edge = Math.max(edge, Math.max(0, 1 - Math.abs(d - 1) / 0.012)); }); // the ring only on the union's outline
    over.data[(y * W + x) * 4 + 3] = Math.round(Math.min(1, inside * 0.10 + edge * 0.45) * 255);
  }
  for (let i = 0; i < c.data.length; i += 4) { const a = over.data[i + 3] / 255; if (!a) continue; for (let k = 0; k < 3; k++) c.data[i + k] = c.data[i + k] * (1 - a) + [232, 240, 228][k] * a; }
  // redraw the sprites over the tint (the overlay is on the ground, under units and buildings), then the selection ring
  place(c, EXPEDITION_BASE.map(([n, x, y, s, h]) => [n, x - ox, y - oy, s, h]));
  const sel = EXPEDITION_BASE.find(e => e[0] === 'ex_buggy_8_0'), sx = sel[1] - ox, sy = sel[2] - oy;
  for (let y = sy - 30; y <= sy + 30; y++) for (let x = sx - 40; x <= sx + 40; x++) { const d = Math.hypot((x - sx) / 36, (y - sy) / 22); if (Math.abs(d - 1) < 0.08) { const i = (y * W + x) * 4; c.data[i] = 120; c.data[i + 1] = 236; c.data[i + 2] = 120; } }
  label(c, 'RANGE OVERLAY MOCK-UP: A BUGGY SELECTED; THE RADIO TOWER\'S AND DATA CENTRE\'S RANGE (TINT 10%, RING 45%)', 12, 12, 2);
  writeFileSync(join(outDir, 'range-overlay.png'), encodePNG(c)); writeFileSync(join(outDir, 'range-overlay-1x.png'), encodePNG(half(c)));
}

// ---- each new model alone at phone size, seats 0, 1 and 6, its share in the label ----
for (const [side, kinds] of [['kg', [...KG, 'castle']], ['ex', [...EX, 'hall']]]) for (const kind of kinds) {   // (the slice's two with their fixes too)
  const name = `bldg_${side}_${kind}`, n = { castle: 4, hall: 4, barracks: 3, workshop: 3, stables: 3, factory: 3 }[kind] ?? 2, P = n >= 3 ? 500 : 380;
  const c = canvas(P * 3, P + 30); ground(c, 0, P + 30, 7 + kind.length);
  [0, 1, 6].forEach((seat, k) => { draw(c, get(name), P * k + P / 2, P / 2 + P * 0.12, seat); if (HEADS[name]) draw(c, get(head(name, 2)), P * k + P / 2, P / 2 + P * 0.12, seat); });
  const sh = HEADS[name] ? `TEAM ${shares[name].toFixed(3)} (WITH HEAD ${shares[`${name}+head`].toFixed(3)})` : `TEAM ${shares[name].toFixed(3)}`;
  label(c, `${name}  SEATS 0 1 6  ${sh}  ${sizes[name][0]}X${sizes[name][1]} CSS PX`, 6, P + 6, 2);
  writeFileSync(join(outDir, 'models', `${name}@2x.png`), encodePNG(c)); const h1 = half(c); writeFileSync(join(outDir, 'models', `${name}.png`), encodePNG(h1));
  for (const mode of ['protan', 'deutan']) writeFileSync(join(outDir, 'models', `${name}-${mode}.png`), encodePNG(simulate(h1, mode)));
}
console.log('buildings pictures ->', outDir);
