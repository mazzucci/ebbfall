// The review pack for the new look (tools/render3d/STYLE.md): node tools/art/review.mjs <outdir> [--family=NAME] [filterRegex]
// Renders a family (FAMILIES: `slice`, the six step-0 kinds and the salt field, by default; `vael-units`, the Vael's
// eight units; `hinf`, the Harbour infantry; `hmach`, the Harbour machines; `hair`, the Harbour air; `vbld`, the Vael's eight
// buildings; `hbld`, the Harbour buildings) and writes into <outdir>:
//   contact.png      each sprite at 1:1 (atlas px) in seats 0, 1 and 6 and its bare team mask; contact.json names the rows
//   phone@2x.png     the sprites at their game size on the seabed beside a salt field, as a 2x phone shows them (atlas px);
//                    a building family lays its own scene out (`phoneScene`: each building once, in seat 0 or 6, a few again in
//                    seat 1, units for scale)
//   phone.png        the same at CSS-pixel size (what the game shows at default zoom: world px 1:1)
//   phone-grey.png, phone-protan.png, phone-deutan.png   phone.png in greyscale and under Machado et al. 2009 protanopia
//                    and deuteranopia at full severity
//   blind/<letter>.png   each unit alone at phone size, in seats 0 and 6, each on its own patch of plain seabed; blind/key.json
//                    maps the letters to the kinds (a building family's images are wider, `blindSize`)
//   battle-desktop.png (1280x720 CSS px), battle-phone.png (844x390) and battle-phone@2x.png   the family beside the
//                    slice as a small scene: a Lighthouse with Riggers and Pickets (and the family's Harbour units) at a salt field against a Tidewell
//                    with the Vael
// It prints, per sprite, the team mask's share of its opaque pixels in the facing-0 frame (rule 3: 1/6 is the floor).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { tile } from './terrain2.js';
import { render3d } from './render3d.mjs';

const VAEL = [['lumen', 'Glint'], ['prism', 'Lens'], ['scythe', 'Needle'], ['halo', 'Tender'], ['monolith', 'Conch'], ['umbra', 'Undertow'], ['shrike', 'Petrel'], ['sovereign', 'Argonaut']];
/** A family: what to render (`filter`), the contact sheet's unit rows (`units`: kind -> frames) and extra rows, the
 *  sprites whose team share is printed, the phone sheet's row of units (names at facing 0), the blind set's kinds
 *  (sprite name -> what it is) and the family's extra placements in the battle stand-in (`vael`: [name, x, y, seat], the
 *  Vael side and any Harbour units the family adds; x, y about its centre). */
const FAMILIES = {
  slice: {
    filter: '^(harvester|lumen|prism)_\\d+_\\d+$|^trooper_\\d+_\\d+$|^bldg_(core|conflux)$|^shard_\\d$',
    units: { harvester: [0], trooper: [0, 2, 3], lumen: [0], prism: [0] }, rows: ['bldg_core', 'bldg_conflux', 'shard_0', 'shard_1', 'shard_2', 'shard_3'],
    shares: ['harvester_0_0', 'trooper_0_0', 'trooper_0_3', 'lumen_0_0', 'prism_0_0', 'bldg_core', 'bldg_conflux'],
    phone: ['harvester_0_0', 'trooper_0_0', 'trooper_4_3', 'lumen_0_0', 'prism_0_0'], turned: ['harvester_12_0', 'trooper_8_0', 'lumen_8_0', 'prism_12_0'],
    blind: [['harvester_0_0', 'harvester (Rigger)'], ['trooper_0_0', 'trooper (Picket)'], ['trooper_0_3', 'trooper dug in (Picket)'], ['lumen_0_0', 'lumen (Glint)'], ['prism_0_0', 'prism (Lens)']],
    vael: sliceVael,
  },
  'vael-units': {
    filter: '^(harvester|trooper|lumen|prism|scythe|halo|monolith|umbra|shrike|sovereign)_\\d+_\\d+$|^bldg_(core|conflux)$|^shard_\\d$',
    units: { lumen: [0], prism: [0], scythe: [0], halo: [0], monolith: [0], umbra: [0, 2], shrike: [0], sovereign: [0] }, rows: ['bldg_conflux', 'shard_0'],
    shares: ['lumen_0_0', 'prism_0_0', 'scythe_0_0', 'halo_0_0', 'monolith_0_0', 'umbra_0_0', 'umbra_0_2', 'shrike_0_0', 'sovereign_0_0'],
    phone: ['lumen_0_0', 'prism_0_0', 'scythe_0_0', 'halo_0_0', 'umbra_0_0', 'umbra_4_2', 'shrike_0_0', 'monolith_0_0', 'sovereign_0_0'],
    turned: ['scythe_12_0', 'halo_8_0', 'umbra_8_0', 'shrike_12_0', 'monolith_4_0', 'sovereign_12_0'],
    blind: [...VAEL.map(([k, n]) => [`${k}_0_0`, `${k} (${n})`]), ['umbra_0_2', 'umbra lurking, flat (Undertow)']],
    vael: (cx, cy) => [
      ['bldg_conflux', cx + 540, cy - 80, 1],
      ...[0, 1, 2].map(k => [`lumen_${[9, 8, 7][k]}_0`, cx + 330 + k * 40, cy - 160 + k * 30, 1]),
      ...[0, 1, 2, 3].map(k => [`prism_8_${k % 2}`, cx + 150 + (k % 2) * 50, cy - 30 + Math.floor(k / 2) * 70 + (k % 2) * 10, 1]),
      ...[0, 1, 2, 3].map(k => [`scythe_${[8, 9, 7, 8][k]}_${k % 2}`, cx + 60 + (k % 2) * 40, cy - 90 + k * 34, 1]),
      ...[0, 1].map(k => [`halo_8_${k}`, cx + 230 + k * 20, cy + 20 + k * 60, 1]),
      ...[0, 1, 2].map(k => [`umbra_${[8, 7, 8][k]}_${[0, 0, 2][k]}`, cx + 30 + k * 30, cy + 70 + k * 40, 1]),
      ...[0, 1].map(k => [`shrike_${[9, 8][k]}_0`, cx + 120 + k * 70, cy - 220 + k * 30, 1]),
      ['monolith_8_0', cx + 300, cy + 110, 1], ['sovereign_8_0', cx + 420, cy + 30, 1],
    ],
  },
  // Harbour infantry (harbour-infantry.js): the Rigger and the Picket beside the Harpooner and the Mender, the slice's
  // Glint and Lens with them for the peoples; the battle adds Harpooners and Menders on both sides
  hinf: {
    filter: '^(harvester|trooper|lancer|medic|lumen|prism)_\\d+_\\d+$|^bldg_(core|conflux)$|^shard_\\d$',
    units: { harvester: [0], trooper: [0, 2, 3], lancer: [0], medic: [0], lumen: [0], prism: [0] }, rows: ['bldg_core', 'bldg_conflux', 'shard_0'],
    shares: ['harvester_0_0', 'trooper_0_0', 'trooper_0_3', 'lancer_0_0', 'medic_0_0', 'lumen_0_0', 'prism_0_0'],
    phone: ['harvester_0_0', 'trooper_0_0', 'trooper_4_3', 'lancer_0_0', 'medic_0_0', 'lumen_0_0', 'prism_0_0'],
    turned: ['harvester_12_0', 'trooper_8_0', 'lancer_12_0', 'medic_8_0'],
    blind: [['harvester_0_0', 'harvester (Rigger)'], ['trooper_0_0', 'trooper (Picket)'], ['trooper_0_3', 'trooper dug in (Picket)'], ['lancer_0_0', 'lancer (Harpooner)'], ['medic_0_0', 'medic (Mender)'], ['lumen_0_0', 'lumen (Glint)'], ['prism_0_0', 'prism (Lens)']],
    vael: (cx, cy) => [
      ...sliceVael(cx, cy),
      ['lancer_0_0', cx - 190, cy + 40, 0], ['lancer_1_1', cx - 140, cy + 70, 0], ['lancer_0_0', cx - 110, cy + 20, 0],
      ['medic_0_1', cx - 230, cy + 10, 0], ['medic_2_0', cx - 180, cy + 100, 0], ['lancer_8_0', cx + 60, cy - 110, 1], ['medic_9_0', cx + 100, cy - 60, 1],
    ],
  },
};
// Harbour buildings (harbour-buildings.js): the eight buildings (the Lookout's gun its own sprite) with the slice's
// Rigger and Picket for scale; a family of buildings, so the phone sheet is a scene of its own (`phoneScene`: the
// Lighthouse, Windmast, Pump, Crew Hall and Workshop in seat 0, the Slipway, Lookout and Loft in seat 6, a Windmast, a
// Lookout and a Pump on a seep in seat 1, a salt field, the Tidewell, Pickets, Riggers, a Glint and a Lens), the blind
// images are wider (`blindSize`) and the battle stand-in (`vael`) adds a Harbour base of every building but the
// Lighthouse, already in the battle, to the slice's Vael side
const HBLD = [['core', 'Lighthouse'], ['depot', 'Windmast'], ['extractor', 'Pump'], ['barracks', 'Crew Hall'], ['forge', 'Workshop'], ['factory', 'Slipway'], ['turret', 'Lookout'], ['airfield', 'Loft']];
FAMILIES.hbld = {
  filter: '^(harvester|trooper|lumen|prism)_\\d+_\\d+$|^bldg_(core|depot|extractor|barracks|forge|factory|turret|airfield|conflux)$|^turret_head_\\d+$|^shard_\\d$|^vent_0$',
  units: {}, rows: [...HBLD.map(([k]) => `bldg_${k}`), 'turret_head_0', 'turret_head_4', 'turret_head_8', 'turret_head_12'],
  shares: [...HBLD.map(([k]) => `bldg_${k}`), 'turret_head_0'],
  phone: [], turned: [],
  phoneScene: () => [
    ['bldg_core', 190, 250, 0], ['bldg_depot', 420, 230, 0], ['bldg_extractor', 580, 230, 0], ['bldg_barracks', 800, 240, 0], ['bldg_forge', 1030, 230, 0],
    ['bldg_factory', 290, 620, 6], ['bldg_turret', 520, 600, 6], ['turret_head_3', 520, 600, 6], ['bldg_airfield', 760, 620, 6],
    ['bldg_depot', 1060, 620, 1], ['bldg_turret', 1200, 600, 1], ['turret_head_13', 1200, 600, 1], ['vent_0', 1320, 570], ['bldg_extractor', 1320, 570, 1],
    ['shard_0', 1240, 140], ['shard_1', 1330, 220], ['bldg_conflux', 1520, 300, 1],
    ...[0, 1, 2].map(k => [`trooper_${[0, 1, 0][k]}_${k % 2}`, 300 + k * 34, 380 + k * 10, 0]), ...[0, 1].map(k => [`harvester_${[2, 14][k]}_0`, 640 + k * 36, 330 + k * 14, 0]),
    ...[0, 1].map(k => [`trooper_0_${k}`, 940 + k * 36, 330 + k * 12, 0]), ...[0, 1, 2].map(k => [`trooper_${[8, 9, 8][k]}_${k % 2}`, 410 + k * 34, 720 + k * 8, 6]),
    ...[0, 1].map(k => [`harvester_${[1, 0][k]}_${k}`, 900 + k * 36, 720 + k * 10, 6]), ['trooper_0_0', 1130, 720, 1], ['trooper_0_3', 1230, 740, 1], ['harvester_0_0', 1290, 700, 1],
    ['lumen_8_0', 1450, 420, 1], ['prism_8_0', 1400, 480, 1],
  ],
  blindSize: 400,
  blind: [...HBLD.map(([k, n]) => [`bldg_${k}`, `${k} (${n})`])],
  vael: (cx, cy) => [
    ...sliceVael(cx, cy),
    ['bldg_barracks', cx - 840, cy - 80, 0], ['bldg_factory', cx - 1060, cy + 230, 0], ['bldg_airfield', cx - 620, cy - 330, 0], ['bldg_forge', cx - 800, cy + 300, 0],
    ['bldg_depot', cx - 1080, cy - 250, 0], ['bldg_depot', cx - 1180, cy - 80, 0], ['vent_0', cx - 1000, cy + 30], ['bldg_extractor', cx - 1000, cy + 30, 0],
    ['bldg_turret', cx - 240, cy + 150, 0], ['turret_head_2', cx - 240, cy + 150, 0], ['bldg_turret', cx - 420, cy - 300, 0], ['turret_head_1', cx - 420, cy - 300, 0],
    ...[0, 1, 2].map(k => [`trooper_${[0, 1, 0][k]}_${k % 2}`, cx - 700 + k * 40, cy - 10 + k * 20, 0]), ...[0, 1].map(k => [`harvester_${[3, 2][k]}_${k}`, cx - 960 + k * 40, cy + 150 + k * 20, 0]),
  ],
};
// Vael buildings (vael-buildings.js): the eight buildings in the contact sheet, on the phone sheets with a few Glints
// and Lenses for scale (`phoneBldgs` places them instead of the default Lighthouse and Tidewell), alone in the blind
// set (`blindSize`: a bigger patch than a unit's) and, in the battle, a whole Vael base against the Lighthouse
const VBLD = [['conflux', 'Tidewell'], ['spire', 'Sunpetal'], ['siphon', 'Siphon'], ['kiln', 'Cradle'], ['loom', 'Glasshouse'], ['ward', 'Anemone'], ['zenith', 'Gyre'], ['eclipse', 'Darkwater']];
FAMILIES.vbld = {
  filter: '^harvester_(0|1|2|14)_[01]$|^trooper_(0_[03]|1_1)$|^(lumen|prism)_(0|4|8|12)_[01]$|^bldg_(core|conflux|spire|siphon|kiln|loom|ward|zenith|eclipse)$|^shard_[0-3]$',
  units: {}, rows: VBLD.map(([k]) => `bldg_${k}`),
  shares: VBLD.map(([k]) => `bldg_${k}`),
  phone: ['lumen_0_0', 'prism_0_0', 'lumen_4_0', 'prism_8_0'], turned: ['lumen_8_0', 'prism_12_0'],
  phoneBldgs: [['bldg_conflux', 330, 210, 0], ['bldg_spire', 600, 210, 0], ['bldg_siphon', 810, 210, 0], ['bldg_kiln', 1040, 210, 0], ['bldg_loom', 1270, 210, 0], ['bldg_eclipse', 1470, 210, 0],
    ['bldg_zenith', 300, 630, 0], ['bldg_ward', 1120, 630, 0], ['bldg_spire', 1300, 630, 1], ['bldg_ward', 1470, 630, 6], ['bldg_eclipse', 1620, 630, 6]],
  blindSize: 480,
  blind: VBLD.map(([k, n]) => [`bldg_${k}`, `${k} (${n})`]),
  vael: (cx, cy) => [
    ['bldg_conflux', cx + 560, cy - 60, 1], ['bldg_spire', cx + 330, cy - 250, 1], ['bldg_siphon', cx + 160, cy - 180, 1],
    ['bldg_kiln', cx + 420, cy + 150, 1], ['bldg_loom', cx + 220, cy + 10, 1], ['bldg_ward', cx + 60, cy - 10, 1],
    ['bldg_zenith', cx + 700, cy + 180, 1], ['bldg_eclipse', cx + 180, cy + 200, 1],
    ...[0, 1, 2].map(k => [`lumen_${[8, 8, 4][k]}_0`, cx + 340 + k * 36, cy - 120 + k * 26, 1]),
    ...[0, 1, 2, 3].map(k => [`prism_8_${k % 2}`, cx + 40 + (k % 2) * 46, cy + 80 + Math.floor(k / 2) * 60 + (k % 2) * 10, 1]),
  ],
};
function sliceVael(cx, cy) {
  const list = [['bldg_conflux', cx + 540, cy - 80, 1]];
  for (let k = 0; k < 3; k++) list.push([`lumen_${[9, 8, 7][k]}_0`, cx + 330 + k * 40, cy - 160 + k * 30, 1]);
  for (let k = 0; k < 6; k++) list.push([`prism_8_${k % 2}`, cx + 150 + (k % 3) * 50, cy - 30 + Math.floor(k / 3) * 70 + (k % 3) * 10, 1]);
  for (let k = 0; k < 3; k++) list.push([`prism_${[10, 8, 6][k]}_0`, cx + 120 + k * 10, cy + 130 + k * 50, 1]);
  return list;
}
// Harbour machines (harbour-machines.js): the Breakwater (walking and beached), the Anchor Gun (travelling and anchored)
// and the Netter, with the slice's Rigger and Picket (standing and dug in) for the people; the battle adds the machines
// on the Harbour side. `gap`: the phone row's spacing (heavies are wider than the 80 px default allows).
FAMILIES.hmach = {
  filter: '^(harvester|trooper|vanguard|siegeTank|interceptor|lumen|prism)_\\d+_\\d+$|^bldg_(core|conflux)$|^shard_\\d$',
  units: { vanguard: [0, 2, 3], siegeTank: [0, 2, 3], interceptor: [0], harvester: [0], trooper: [0, 3] }, rows: ['bldg_core', 'shard_0'],
  shares: ['vanguard_0_0', 'vanguard_0_3', 'siegeTank_0_0', 'siegeTank_0_3', 'interceptor_0_0', 'harvester_0_0', 'trooper_0_0'],
  phone: ['vanguard_0_0', 'trooper_0_0', 'siegeTank_0_0', 'harvester_0_0', 'interceptor_0_0', 'vanguard_0_3', 'trooper_4_3', 'siegeTank_0_3'], gap: 92,
  turned: ['vanguard_12_0', 'siegeTank_8_0', 'interceptor_12_0', 'vanguard_8_3'],
  blind: [['vanguard_0_0', 'vanguard (Breakwater)'], ['vanguard_0_3', 'vanguard beached (Breakwater)'], ['siegeTank_0_0', 'siegeTank (Anchor Gun)'], ['siegeTank_0_3', 'siegeTank anchored (Anchor Gun)'], ['interceptor_0_0', 'interceptor (Netter)'], ['harvester_0_0', 'harvester (Rigger)'], ['trooper_0_0', 'trooper (Picket)'], ['trooper_0_3', 'trooper dug in (Picket)']],
  vael: (cx, cy) => [
    ...sliceVael(cx, cy),
    ['siegeTank_0_3', cx - 260, cy + 40, 0], ['siegeTank_2_0', cx - 310, cy + 160, 0],
    ['vanguard_1_0', cx - 30, cy - 130, 0], ['vanguard_0_3', cx - 10, cy + 30, 0],
    ['interceptor_0_0', cx - 210, cy - 130, 0], ['interceptor_15_1', cx - 130, cy + 180, 0],
  ],
};
// Harbour air (harbour-air.js): the Kite, the Spyglass and the Windjammer, the Vael's Petrel beside them for contrast
// and the slice's Rigger and Picket for the people; the battle puts the flyers over the slice, Petrels over the Vael.
FAMILIES.hair = {
  filter: '^(raider|observer|bastion|shrike|harvester|trooper|lumen|prism)_\\d+_\\d+$|^bldg_(core|conflux)$|^shard_\\d$',
  units: { raider: [0], observer: [0], bastion: [0], shrike: [0] }, rows: ['bldg_core', 'shard_0'],
  shares: ['raider_0_0', 'observer_0_0', 'bastion_0_0', 'shrike_0_0'],
  phone: ['harvester_0_0', 'trooper_0_0', 'raider_0_0', 'observer_0_0', 'shrike_0_0', 'lumen_0_0', 'prism_0_0', 'bastion_0_0'],
  turned: ['raider_12_0', 'observer_8_0', 'shrike_12_0', 'raider_4_0', 'bastion_12_0'], turnedY: 690,
  blind: [['raider_0_0', 'raider (Kite)'], ['observer_0_0', 'observer (Spyglass)'], ['bastion_0_0', 'bastion (Windjammer)'], ['shrike_0_0', 'shrike (Petrel)'],
    ['harvester_0_0', 'harvester (Rigger)'], ['trooper_0_0', 'trooper (Picket)'], ['trooper_0_3', 'trooper dug in (Picket)']],
  vael: (cx, cy) => [
    ...sliceVael(cx, cy),
    ...[0, 1, 2, 3].map(k => [`raider_${[1, 0, 2, 1][k]}_0`, cx - 120 + k * 44, cy - 150 + (k % 2) * 40, 0]),
    ['observer_2_0', cx - 250, cy - 170, 0], ['bastion_1_0', cx - 420, cy + 200, 0],
    ['shrike_9_0', cx + 260, cy - 230, 1], ['shrike_8_0', cx + 330, cy - 190, 1],
  ],
};

const argv = process.argv.slice(2), famAt = argv.indexOf('--family'), famName = argv.find(a => a.startsWith('--family='))?.slice(9) ?? (famAt >= 0 ? argv[famAt + 1] : 'slice'), FAM = FAMILIES[famName];
if (!FAM) throw new Error(`no family ${famName}: ${Object.keys(FAMILIES).join(', ')}`);
const [outDir = '/tmp/review', filter = FAM.filter] = argv.filter((a, i) => !a.startsWith('--') && !(famAt >= 0 && i === famAt + 1));
mkdirSync(join(outDir, 'blind'), { recursive: true });
const all = await render3d(filter), TINTS = all.tints;
const byName = new Map(all.map(s => [s.name, s]));
const masks = new Map(all.filter(s => s.trim).map(s => [s.name.slice(0, -2), s.img]));
const get = (name) => { const s = byName.get(name); if (!s) throw new Error(`${name} was not rendered (filter?)`); return s; };
const tintOf = (seat) => { const c = TINTS[seat]; return [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v / 255); };

// ---- a canvas and the painters ----
const canvas = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
const fill = (c, rgb) => { for (let i = 0; i < c.w * c.h; i++) c.data.set([...rgb, 255], i * 4); };
/** Source-over of a sprite (atlas px) with its anchor at (x, y); the team mask tinted over it for a seat. */
function draw(c, s, x, y, seat = null) {
  const { w, h, data } = s.img, ox = Math.round(x - s.anchor.x * w), oy = Math.round(y - s.anchor.y * h);
  const m = seat === null ? null : masks.get(s.name), tint = seat === null ? null : tintOf(seat);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = ox + i, py = oy + j; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue;
    const si = (j * w + i) * 4, di = (py * c.w + px) * 4;
    let a = data[si + 3] / 255; if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + data[si + k] * a;
    if (m) { a = m.data[si + 3] / 255; if (a) for (let k = 0; k < 3; k++) c.data[di + k] = c.data[di + k] * (1 - a) + m.data[si + k] * tint[k] * a; }
    c.data[di + 3] = 255;
  }
}
/** The seabed: ground tiles (64 px, 2x) from terrain2.js, the variants spread as the game spreads them. */
const tiles = {}; const groundTile = (v) => tiles[v] ??= tile(0, v);
/** `seed` gives a patch its own tiles and origin; `plain` draws the base tile only (the blind images: no mark may sit
 *  beside a unit and be read as part of it; the test judges the unit, not the tile). */
function seabed(c, seed = 0, plain = false) {
  const ox = (seed * 37) % 64, oy = (seed * 53) % 64;
  for (let ty = -1; (ty - 1) * 64 < c.h; ty++) for (let tx = -1; (tx - 1) * 64 < c.w; tx++) { // (one tile past the edge: the origin's offset)
    const r = (((tx + 3) * 7919 + (ty + 3) * 104729 + seed * 15485863) % 97) / 97, t = groundTile(plain || r < 0.82 ? 0 : 1 + ((r * 100) | 0) % 5);
    for (let y = 0; y < 64; y++) { const py = ty * 64 + y - oy; if (py < 0 || py >= c.h) continue; for (let x = 0; x < 64; x++) { const px = tx * 64 + x - ox; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4), (py * c.w + px) * 4); } }
  }
}
/** A selection ring as the game draws one (pale, under the unit), radius in atlas px. */
function ring(c, x, y, rx, ry, rgb = [0xea, 0xf6, 0xff]) {
  for (let a = 0; a < Math.PI * 2; a += 0.01) { const px = Math.round(x + Math.cos(a) * rx), py = Math.round(y + Math.sin(a) * ry); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((py + dy) * c.w + px + dx) * 4; if (px + dx >= 0 && px + dx < c.w && py + dy >= 0 && py + dy < c.h) c.data.set([...rgb, 255], i); } }
}
/** 2x box downsample: the CSS-pixel view of a 2x canvas. */
function half(c) {
  const o = canvas(c.w >> 1, c.h >> 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) for (let k = 0; k < 4; k++) {
    const i = (2 * y * c.w + 2 * x) * 4 + k; o.data[(y * o.w + x) * 4 + k] = Math.round((c.data[i] + c.data[i + 4] + c.data[i + c.w * 4] + c.data[i + c.w * 4 + 4]) / 4);
  }
  return o;
}
// Colour-vision simulation (Machado, Oliveira and Fernandes 2009, severity 1.0), applied in linear RGB.
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };
function simulate(c, mode) {
  const o = canvas(c.w, c.h), M = MACHADO[mode];
  for (let i = 0; i < c.w * c.h * 4; i += 4) {
    const r = toLin(c.data[i]), g = toLin(c.data[i + 1]), b = toLin(c.data[i + 2]);
    if (mode === 'grey') { const y = toSrgb(0.2126 * r + 0.7152 * g + 0.0722 * b); o.data.set([y, y, y, 255], i); continue; }
    o.data.set([toSrgb(M[0][0] * r + M[0][1] * g + M[0][2] * b), toSrgb(M[1][0] * r + M[1][1] * g + M[1][2] * b), toSrgb(M[2][0] * r + M[2][1] * g + M[2][2] * b), 255], i);
  }
  return o;
}
const save = (name, c) => writeFileSync(join(outDir, name), encodePNG(c));

// ---- 1. the contact sheet: each sprite at 1:1 in seats 0, 1, 6 and its bare mask ----
const rows = [];
for (const [k, frames] of Object.entries(FAM.units)) for (const f of frames) for (const d of [0, 4, 8, 12]) rows.push(`${k}_${d}_${f}`);
rows.push(...FAM.rows);
{
  const PAD = 6, cells = rows.map(get), cw = Math.max(...cells.map(s => s.img.w)) + PAD, ch = cells.map(s => s.img.h + PAD);
  const cols = 4, c = canvas(cw * cols, ch.reduce((a, b) => a + b, 0)); fill(c, [52, 54, 56]);
  let y = 0;
  cells.forEach((s, n) => {
    [0, 1, 6, 'm'].forEach((seat, col) => {
      const x = col * cw + Math.round(s.anchor.x * s.img.w) + PAD / 2, ay = y + Math.round(s.anchor.y * s.img.h) + PAD / 2;
      if (seat === 'm') { const m = masks.get(s.name); if (m) draw(c, { img: m, anchor: s.anchor, name: '' }, x, ay); } else draw(c, s, x, ay, seat);
    });
    y += ch[n];
  });
  save('contact.png', c);
  writeFileSync(join(outDir, 'contact.json'), JSON.stringify({ columns: ['seat 0 (gold)', 'seat 1 (magenta)', 'seat 6 (white)', 'team mask'], rows }, null, 1));
}

// ---- 2. team share per sprite (facing 0, frame 0; pose frames too): mask pixels over the sprite's solid pixels ----
console.log('team colour share of the solid pixels (facing 0; rule 3 floor 1/6 = 0.167):');
for (const name of FAM.shares) {
  const s = get(name), m = masks.get(name); let solid = 0, team = 0;
  for (let i = 3; i < s.img.data.length; i += 4) { if (s.img.data[i] === 255) solid++; if (m.data[i] >= 128) team++; }
  console.log(`  ${name.padEnd(14)} ${(team / solid).toFixed(3)}  (${team} / ${solid} px)${team / solid < 1 / 6 ? '  BELOW THE FLOOR' : ''}`);
}

// ---- 3. the phone sheet: everything at game size on the seabed beside a salt field ----
const place = (c, list) => { for (const [name, x, y, seat] of list.slice().sort((a, b) => a[2] - b[2])) draw(c, get(name), x, y, seat); };
{
  const c = canvas(1688, 780); seabed(c); // a 2x phone (844x390 CSS px)
  const list = [['shard_0', 130, 150], ['shard_2', 130, 300]];
  if (FAM.phoneScene) { list.length = 0; list.push(...FAM.phoneScene()); } else {
    if (FAM.phoneBldgs) list.push(...FAM.phoneBldgs);
    else { if (byName.has('bldg_core')) list.push(['bldg_core', 360, 330, 0]); list.push(['bldg_conflux', 1330, 330, 1]); }
    const gap = Math.min(FAM.gap ?? 80, Math.floor(1000 / FAM.phone.length));
    for (const [y, seat] of [[500, 0], [630, 1], [760, 6]]) FAM.phone.forEach((name, k) => list.push([name, 560 + k * gap, y, seat]));
    FAM.turned.forEach((name, k) => list.push([name, 600 + FAM.phone.length * gap + k * 60, FAM.turnedY ?? 760, k % 2])); // (`turnedY`: a family with a long flyer lifts the row clear of the edge)
  }
  place(c, list);
  if (!FAM.phoneScene) ring(c, 630, 503, 24, 14); // the game's selection ring under the second unit (seat 0)
  save('phone@2x.png', c);
  const p = half(c); save('phone.png', p);
  for (const mode of ['grey', 'protan', 'deutan']) save(`phone-${mode}.png`, simulate(p, mode));
}

// ---- 4. blind: each unit alone at phone size, named by a random letter ----
{
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''), key = {}, B = FAM.blindSize ?? 192;
  let n = 0;
  for (const [name, what] of FAM.blind) for (const seat of [0, 6]) {
    const c = canvas(B, B); seabed(c, 11 + n++ * 7, true); draw(c, get(name), B / 2, B / 2 + B * 0.07, seat);
    if (name === 'bldg_turret' && byName.has('turret_head_0')) draw(c, get('turret_head_0'), B / 2, B / 2 + B * 0.07, seat); // (its gun: a head sprite the game draws at the building's own point)
    const L = letters.splice(Math.floor(Math.random() * letters.length), 1)[0];
    key[L] = `${what}, seat ${seat}`; writeFileSync(join(outDir, 'blind', `${L}.png`), encodePNG(half(c)));
  }
  writeFileSync(join(outDir, 'blind', 'key.json'), JSON.stringify(key, null, 1));
}

// ---- 5. the battle stand-in: the family beside the slice as a scene, at desktop size and at a phone's ----
function battle(w, h) {
  const c = canvas(w, h); seabed(c);
  const cx = w / 2, cy = h / 2, list = [];
  list.push(['bldg_core', cx - 560, cy + 60, 0], ['shard_0', cx - 330, cy - 190], ['shard_1', cx - 250, cy - 120], ['shard_3', cx - 380, cy - 90]);
  for (let k = 0; k < 4; k++) list.push([`harvester_${[2, 14, 1, 0][k]}_${k % 2}`, cx - 330 + (k % 2) * 50, cy - 60 + k * 36, 0]);
  for (let k = 0; k < 6; k++) list.push([`trooper_${k % 2 ? 1 : 0}_${k % 2}`, cx - 150 + (k % 3) * 46, cy - 40 + Math.floor(k / 3) * 60 + (k % 3) * 8, 0]);
  for (let k = 0; k < 3; k++) list.push(['trooper_0_3', cx - 60 + k * 16, cy + 110 + k * 50, 0]);
  list.push(...FAM.vael(cx, cy));
  place(c, list);
  ring(c, cx - 104, cy - 37, 24, 14);
  return c;
}
save('battle-desktop.png', half(battle(2560, 1440)));
{ const c = battle(1688, 780); save('battle-phone@2x.png', c); save('battle-phone.png', half(c)); }
console.log('review pack ->', outDir);
