// The re-theme's blind recognition pack (2026-11-10): node tools/art/retheme-blind.mjs [outdir] [--elev=40]
// Every unit and building of the new set alone on plain grass at zoom 1.0 (the 40-degree camera, units 1.4x as in
// retheme.js), shuffled with a fixed seed and named by number only, for testers who are told the two peoples and a list
// of roles and asked which image is which. Writes into outdir (target/art-review/blind by default):
//   NN.png (CSS px, 1x) and 2x/NN.png (device px): 31 images, numbered 01.. in the shuffled order
//     units (15): one image each, the unit twice side by side, seat 0 (royal blue, facing 0) then seat 1 (magenta, dir 2)
//       (the Trebuchet traveling, frame 0; the Balloon its one frame)
//     buildings (15): one image each in one seat, seats alternating 0, 1, 0, ... down the list (the kingdom's then the
//       Expedition's); the Watchtower and the Radio tower drawn with their heads (dir 2)
//     the Portal check (1): the Portal in seat 1 with three Marines of seat 1 standing beside it
//   key.json: number -> people, kind, role, seats (and facings for the units)
//   roles.md: what a tester gets (the peoples and the roles, no kind names)
// No labels and no text in any image; each image has its own patch of plain grass (no dirt marks). Like review.mjs's
// blind set, but with a fixed shuffle so the key can be re-made. The painters are retheme-paint.mjs's.
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain2.js';
import { canvas, seatTints, makePainters, repaint, GRASS, half } from './retheme-paint.mjs';

const argv = process.argv.slice(2), opt = (k, d) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/art-review/blind';
const ELEV = +opt('elev', 40), SUN = +opt('sun', 420), POLISH = !argv.includes('--plain'), SEED = 20261110; // the approved look: the build's sun and the polish (Stelian, 2026-11-11); --plain for the unpolished finish

// ---- the roster: [kind, display name, role] ----
const UNITS = {
  kg: [['villager', 'Villager', 'worker'], ['guard', 'Guard', 'spear infantry'], ['archer', 'Archer', 'archer'], ['rider', 'Rider', 'light cavalry'],
    ['knight', 'Knight', 'heavy cavalry'], ['ballista', 'Ballista', 'anti-air crossbow cart'], ['trebuchet', 'Trebuchet (travelling)', 'siege engine'],
    ['balloon', 'Balloon', 'scout balloon']],
  ex: [['bot', 'Bot', 'worker'], ['buggy', 'Buggy', 'fast raider vehicle'], ['mercenary', 'Mercenary', 'hired gunman'], ['veteran', 'Veteran', 'heavy armoured gunman'],
    ['marine', 'Marine', 'modern soldier'], ['rover', 'Rover', 'rocket artillery cart'], ['drone', 'Drone', 'small drone']],
};
const BUILDINGS = {
  kg: [['castle', 'Castle', 'main building'], ['cottage', 'Cottage', 'house'], ['market', 'Market', 'income building'], ['barracks', 'Barracks', 'troop building'],
    ['blacksmith', 'Blacksmith', 'upgrade building'], ['workshop', 'Workshop', 'machine building'], ['tower', 'Watchtower (with its head)', 'defence tower'],
    ['stables', 'Stables', 'cavalry building']],
  ex: [['hall', 'Data centre', 'main building'], ['bunkhouse', 'Bunkhouse', 'house'], ['post', 'Recruiting post', 'recruiting building'], ['factory', 'Factory', 'machine building'],
    ['lab', 'Lab', 'upgrade building'], ['radio', 'Radio tower (with its head)', 'defence tower'], ['portal', 'Portal', 'arrival platform']],
};
const PEOPLE = { kg: 'the kingdom', ex: 'the Expedition' };
const HEADS = { bldg_kg_tower: 'kg_towerhead_2', bldg_ex_radio: 'ex_radiohead_2' };
const UNIT_DIRS = [0, 2];                                                                       // seat 0 at facing 0, seat 1 at dir 2 (three-quarter)
const MARINES = [['ex_marine_8_0', 1], ['ex_marine_9_0', 1], ['ex_marine_7_0', 1]];              // the Portal check's three, facing the Expedition's usual way

// ---- render ----
const kinds = (side) => UNITS[side].map(u => u[0]).join('|');
const FILTER = `^kg_(${kinds('kg')})_(0|2)_0$|^ex_(${kinds('ex')})_(0|2)_0$|^ex_marine_(7|8|9)_0$|^bldg_(kg|ex)_|^kg_towerhead_2$|^ex_radiohead_2$`;
const t0 = Date.now();
const fresh = await render3d(FILTER, POLISH ? { elev: ELEV, sun: SUN, polish: true } : { elev: ELEV, sun: SUN });
console.log(`rendered ${fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const { get, has, draw, setShadow } = makePainters(fresh, seatTints(fresh.tints));
setShadow(1.45);                                                                                // the grass rows' firmer contact shadow, as the families' pictures draw it

/** A sprite's box of drawn pixels (shadow included) relative to its anchor, in 2x px: [x0, y0, x1, y1]. */
function box(name) {
  const s = get(name), { w, h, data } = s.img, ax = s.anchor.x * w, ay = s.anchor.y * h; let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0 - ax, y0 - ay, x1 + 1 - ax, y1 + 1 - ay];
}
const union = (...bs) => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

/** Plain grass: the repainted seabed's eight base variants only (no dirt patch), its own origin per seed. */
const tiles = [];
function plainGrass(c, seed) {
  const ox = (seed * 37) % 64, oy = (seed * 53) % 64;
  for (let ty = -1; (ty - 1) * 64 < c.h; ty++) for (let tx = -1; (tx - 1) * 64 < c.w; tx++) {
    const v = (((tx + 3) * 7919 + (ty + 3) * 104729 + seed * 15485863) % 97 + 97) % 8, t = tiles[v] ??= repaint(tile(0, v), GRASS);
    for (let y = 0; y < 64; y++) { const py = ty * 64 + y - oy; if (py < 0 || py >= c.h) continue; for (let x = 0; x < 64; x++) { const px = tx * 64 + x - ox; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4), (py * c.w + px) * 4); } }
  }
}

// ---- the images: each a list of [name, dx, dy, seat] groups laid out on one ground line, and its key entry ----
const items = [];
for (const side of ['kg', 'ex']) for (const [kind, label, role] of UNITS[side]) {
  const names = UNIT_DIRS.map(d => `${side}_${kind}_${d}_0`);
  items.push({ group: 'unit', key: { people: PEOPLE[side], kind: label, role, seats: [0, 1], facings: UNIT_DIRS }, copies: names.map((n, k) => [[n, 0, 0, k]]) });
}
let bi = 0;
for (const side of ['kg', 'ex']) for (const [kind, label, role] of BUILDINGS[side]) {
  const name = `bldg_${side}_${kind}`, seat = bi++ % 2, parts = [[name, 0, 0, seat]];
  if (HEADS[name]) parts.push([HEADS[name], 0, 0, seat]);
  items.push({ group: 'building', key: { people: PEOPLE[side], kind: label, role, seats: [seat] }, copies: [parts] });
}
{ // the Portal check: the Marines in a loose group to the Portal's right and front (2x px from its anchor)
  const parts = [['bldg_ex_portal', 0, 0, 1], [MARINES[0][0], 150, -10, 1], [MARINES[1][0], 190, 40, 1], [MARINES[2][0], 130, 70, 1]];
  items.push({ group: 'building', key: { people: PEOPLE.ex, kind: 'Portal with three Marines beside it (the Portal check)', role: 'arrival platform', seats: [1], check: 'portal' }, copies: [parts] });
}
const missing = items.flatMap(it => it.copies.flat().map(p => p[0])).filter(n => !has(n));
if (missing.length) throw new Error(`not rendered: ${[...new Set(missing)].join(', ')}`);

/** A copy's box: the union of its parts' boxes, each moved by its offset. */
const copyBox = (parts) => union(...parts.map(([n, dx, dy]) => { const b = box(n); return [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]; }));
// One canvas size per group (units: each half; buildings: the whole), from the largest box in it, plus a margin, so the
// sizes compare at zoom 1.0 and nothing is cut off. Even sizes, so the 1x halving is exact.
const MARGIN = 28, even = (v) => Math.ceil(v / 2) * 2;
const cellOf = {};
for (const g of ['unit', 'building']) {
  const bs = items.filter(it => it.group === g).flatMap(it => it.copies.map(copyBox));
  cellOf[g] = { w: even(Math.max(...bs.map(b => b[2] - b[0])) + 2 * MARGIN), h: even(Math.max(...bs.map(b => b[3] - b[1])) + 2 * MARGIN) };
}
cellOf.unit.w = cellOf.unit.h = Math.max(cellOf.unit.w, cellOf.unit.h);                          // square halves: the pair is 2:1
cellOf.building.w = cellOf.building.h = Math.max(cellOf.building.w, cellOf.building.h);
console.log(`unit images ${cellOf.unit.w * 2}x${cellOf.unit.h} (2x), building images ${cellOf.building.w}x${cellOf.building.h} (2x)`);

// ---- shuffle (Mulberry32, Fisher-Yates) and paint ----
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED), order = items.map((_, k) => k);
for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(join(outDir, '2x'), { recursive: true });
const key = {}, pad = String(items.length).length;
order.forEach((k, n) => {
  const it = items[k], cell = cellOf[it.group], id = String(n + 1).padStart(pad, '0');
  const c = canvas(cell.w * it.copies.length, cell.h); plainGrass(c, 11 + n * 7);
  const bs = it.copies.map(copyBox), gy = Math.round(cell.h / 2 - (Math.min(...bs.map(b => b[1])) + Math.max(...bs.map(b => b[3]))) / 2); // one ground line, the pair centered
  it.copies.forEach((parts, j) => {
    const b = bs[j], gx = Math.round(cell.w * j + cell.w / 2 - (b[0] + b[2]) / 2);
    if (gx + b[0] < cell.w * j || gx + b[2] > cell.w * (j + 1) || gy + b[1] < 0 || gy + b[3] > cell.h) throw new Error(`${parts[0][0]} does not fit its cell`);
    for (const [name, dx, dy, seat] of parts.slice().sort((p, q) => p[2] - q[2])) draw(c, get(name), gx + dx, gy + dy, seat); // by ground y (stable: a head after its base)
  });
  writeFileSync(join(outDir, '2x', `${id}.png`), encodePNG(c));
  writeFileSync(join(outDir, `${id}.png`), encodePNG(half(c)));
  key[id] = it.key;
});
writeFileSync(join(outDir, 'key.json'), `{\n${Object.entries(key).sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => ` "${id}": ${JSON.stringify(v)}`).join(',\n')}\n}\n`); // (sorted by hand: JS orders the keys "10".. before "01"..)

const ROLES = ['worker', 'spear infantry', 'archer', 'light cavalry', 'heavy cavalry', 'anti-air crossbow cart', 'siege engine', 'scout balloon',
  'modern soldier', 'hired gunman', 'heavy armoured gunman', 'fast raider vehicle', 'rocket artillery cart', 'small drone',
  'main building', 'house', 'income building', 'troop building', 'upgrade building', 'machine building', 'defence tower', 'cavalry building',
  'recruiting building', 'arrival platform'];
writeFileSync(join(outDir, 'roles.md'), [
  '# The peoples', '',
  '- the kingdom: a medieval people',
  '- the Expedition: a modern crew stranded in the past', '',
  '# The roles', '',
  ...ROLES.map(r => `- ${r}`), '',
].join('\n'));
console.log(`${items.length} images -> ${outDir} (1x; 2x in 2x/), key.json, roles.md`);
