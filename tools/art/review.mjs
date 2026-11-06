// The review pack for the new look (tools/render3d/STYLE.md): node tools/art/review.mjs <outdir> [family|sliceRegex]
// Renders a family (FAMILIES below; the step-0 slice by default, or any regex of sprite names) and writes into <outdir>:
//   contact.png      each sprite at 1:1 (atlas px) in seats 0, 1 and 6 and its bare team mask; contact.json names the rows
//   phone@2x.png     the sprites at their game size on the seabed beside a salt field, as a 2x phone shows them (atlas px)
//   phone.png        the same at CSS-pixel size (what the game shows at default zoom: world px 1:1)
//   phone-grey.png, phone-protan.png, phone-deutan.png   phone.png in greyscale and under Machado et al. 2009 protanopia
//                    and deuteranopia at full severity
//   blind/<letter>.png   each unit alone at phone size, in seats 0 and 6, each on its own patch of plain seabed; blind/key.json
//                    maps the letters to the kinds
//   battle-desktop.png (1280x720 CSS px), battle-phone.png (844x390) and battle-phone@2x.png   the slice as a small
//                    scene: a Lighthouse with Riggers and Pickets at a salt field against a Tidewell with Glints and Lenses,
//                    the family's other kinds among them
// It prints, per sprite, the team mask's share of its opaque pixels in the facing-0 frame (rule 3: 1/6 is the floor).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { tile } from './terrain2.js';
import { render3d } from './render3d.mjs';

/** A family: its `units` ([key, name, frames to show: [frame, label]]) and the extra placements of its `battle`
 *  (beside the slice's scene; `cx`, `cy` its centre). The slice's buildings and salt always render. */
const SLICE_UNITS = [['harvester', 'Rigger', [[0]]], ['trooper', 'Picket', [[0], [3, 'dug in']]], ['lumen', 'Glint', [[0]]], ['prism', 'Lens', [[0]]]];
const FAMILIES = {
  slice: { units: SLICE_UNITS, battle: () => [] },
  // Harbour infantry (harbour-infantry.js): the Rigger and the Picket beside the Harpooner and the Mender; the Vael of the slice for the peoples
  hinf: {
    units: [['harvester', 'Rigger', [[0]]], ['trooper', 'Picket', [[0], [3, 'dug in']]], ['lancer', 'Harpooner', [[0]]], ['medic', 'Mender', [[0]]], ['lumen', 'Glint', [[0]]], ['prism', 'Lens', [[0]]]],
    battle: (cx, cy) => [['lancer_0_0', cx - 190, cy + 40, 0], ['lancer_1_1', cx - 140, cy + 70, 0], ['lancer_0_0', cx - 110, cy + 20, 0], ['medic_0_1', cx - 230, cy + 10, 0], ['medic_2_0', cx - 180, cy + 100, 0], ['lancer_8_0', cx + 60, cy - 110, 1], ['medic_9_0', cx + 100, cy - 60, 1]],
  },
};
const [outDir = '/tmp/review', pick = 'slice'] = process.argv.slice(2);
const family = FAMILIES[pick] || { units: SLICE_UNITS, battle: () => [] };
const unitKeys = [...new Set(family.units.map(([k]) => k))];
const filter = FAMILIES[pick] ? `^(${unitKeys.join('|')})_\\d+_\\d+$|^bldg_(core|conflux)$|^shard_\\d$` : pick;
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
  for (let ty = -1; ty * 64 < c.h; ty++) for (let tx = -1; tx * 64 < c.w; tx++) {
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
for (const [k, , fr] of family.units) for (const f of fr.flatMap(([f]) => f === 3 ? [2, 3] : [f])) for (const d of [0, 4, 8, 12]) rows.push(`${k}_${d}_${f}`);
rows.push('bldg_core', 'bldg_conflux', 'shard_0', 'shard_1', 'shard_2', 'shard_3');
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

// ---- 2. team share per sprite (facing 0, frame 0; the dug-in Picket too): mask pixels over the sprite's solid pixels ----
console.log('team colour share of the solid pixels (facing 0; rule 3 floor 1/6 = 0.167):');
for (const name of [...family.units.flatMap(([k, , fr]) => fr.map(([f]) => `${k}_0_${f}`)), 'bldg_core', 'bldg_conflux']) {
  const s = get(name), m = masks.get(name); let solid = 0, team = 0;
  for (let i = 3; i < s.img.data.length; i += 4) { if (s.img.data[i] === 255) solid++; if (m.data[i] >= 128) team++; }
  console.log(`  ${name.padEnd(14)} ${(team / solid).toFixed(3)}  (${team} / ${solid} px)${team / solid < 1 / 6 ? '  BELOW THE FLOOR' : ''}`);
}

// ---- 3. the phone sheet: everything at game size on the seabed beside a salt field ----
const place = (c, list) => { for (const [name, x, y, seat] of list.slice().sort((a, b) => a[2] - b[2])) draw(c, get(name), x, y, seat); };
{
  const c = canvas(1688, 780); seabed(c); // a 2x phone (844x390 CSS px)
  const list = [['shard_0', 130, 150], ['shard_2', 130, 300], ['bldg_core', 360, 330, 0], ['bldg_conflux', 1330, 330, 1]];
  const shown = family.units.flatMap(([k, , fr]) => fr.map(([f]) => f === 3 ? `${k}_4_3` : `${k}_0_${f}`)), step = shown.length > 5 ? 66 : 80;
  const unitsAt = (x0, y, seat) => shown.map((name, n) => [name, x0 + n * step, y, seat]);
  for (const [y, seat] of [[500, 0], [630, 1], [760, 6]]) list.push(...unitsAt(540, y, seat));
  unitKeys.forEach((k, n) => list.push([`${k}_${[12, 8][n % 2]}_0`, 1000 + n * 60, 760, n % 2])); // the other way round
  place(c, list);
  ring(c, 630, 503, 24, 14); // the game's selection ring under the Picket (seat 0)
  save('phone@2x.png', c);
  const p = half(c); save('phone.png', p);
  for (const mode of ['grey', 'protan', 'deutan']) save(`phone-${mode}.png`, simulate(p, mode));
}

// ---- 4. blind: each unit alone at phone size, named by a random letter ----
{
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''), key = {};
  const kinds = family.units.flatMap(([k, name, fr]) => fr.map(([f, label]) => [`${k}_0_${f}`, `${k}${label ? ' ' + label : ''} (${name})`]));
  let n = 0;
  for (const [name, what] of kinds) for (const seat of [0, 6]) {
    const c = canvas(192, 192); seabed(c, 11 + n++ * 7, true); draw(c, get(name), 96, 110, seat);
    const L = letters.splice(Math.floor(Math.random() * letters.length), 1)[0];
    key[L] = `${what}, seat ${seat}`; writeFileSync(join(outDir, 'blind', `${L}.png`), encodePNG(half(c)));
  }
  writeFileSync(join(outDir, 'blind', 'key.json'), JSON.stringify(key, null, 1));
}

// ---- 5. the battle stand-in: the slice as a scene, at desktop size and at a phone's ----
function battle(w, h) {
  const c = canvas(w, h); seabed(c);
  const cx = w / 2, cy = h / 2, list = [];
  list.push(['bldg_core', cx - 560, cy + 60, 0], ['shard_0', cx - 330, cy - 190], ['shard_1', cx - 250, cy - 120], ['shard_3', cx - 380, cy - 90]);
  for (let k = 0; k < 4; k++) list.push([`harvester_${[2, 14, 1, 0][k]}_${k % 2}`, cx - 330 + (k % 2) * 50, cy - 60 + k * 36, 0]);
  for (let k = 0; k < 6; k++) list.push([`trooper_${k % 2 ? 1 : 0}_${k % 2}`, cx - 150 + (k % 3) * 46, cy - 40 + Math.floor(k / 3) * 60 + (k % 3) * 8, 0]);
  for (let k = 0; k < 3; k++) list.push(['trooper_0_3', cx - 60 + k * 16, cy + 110 + k * 50, 0]);
  list.push(['bldg_conflux', cx + 540, cy - 80, 1]);
  for (let k = 0; k < 3; k++) list.push([`lumen_${[9, 8, 7][k]}_0`, cx + 330 + k * 40, cy - 160 + k * 30, 1]);
  for (let k = 0; k < 6; k++) list.push([`prism_8_${k % 2}`, cx + 150 + (k % 3) * 50, cy - 30 + Math.floor(k / 3) * 70 + (k % 3) * 10, 1]);
  for (let k = 0; k < 3; k++) list.push([`prism_${[10, 8, 6][k]}_0`, cx + 120 + k * 10, cy + 130 + k * 50, 1]);
  list.push(...family.battle(cx, cy));
  place(c, list);
  ring(c, cx - 104, cy - 37, 24, 14);
  return c;
}
save('battle-desktop.png', half(battle(2560, 1440)));
{ const c = battle(1688, 780); save('battle-phone@2x.png', c); save('battle-phone.png', half(c)); }
console.log('review pack ->', outDir);
