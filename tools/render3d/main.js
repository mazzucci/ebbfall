// Renders every 3D sprite and hands the RGBA images to the Node driver (tools/art/generate.mjs) via window.render().
import { shoot, S, LIFT } from './scene.js';
import { makeMats } from './materials.js';
import { SEAT_COLORS, UNIT_ART_SCALE } from '../../src/client/look.js';
import { UNIT_MODELS } from './models.js';
import * as B from './buildings.js';
import { VAEL_UNITS, VAEL_BUILDINGS, makeVaelMats } from './vael.js';
import { lighthouse } from './harbour.js';
import { picket, mender } from './harbour-infantry.js';
import { glint, tidewell } from './vael2.js';
import { needle, tender } from './vael-units.js';
import { breakwater } from './harbour-machines.js';
import { cradle } from './vael-buildings.js';
import { rethemeSprites, atlasSprites, ATLAS_UNITS } from './retheme.js';

// The re-theme (retheme.js ATLAS_UNITS, ATLAS_BUILDINGS) replaces the models below for every kind it maps; the rest of
// this file's models stay only for the two healers (the Medic and the Halo: in the sim's tables, trained nowhere) and
// for fitTints' reference sprites. The retired kinds (RETIRED) are no longer drawn.
// The step-2 look (STYLE.md): the Picket (0-1 the march, 2 settling, 3 dug in; a fitTints reference) and the Mender
// (harbour-infantry.js), the Breakwater (0-1 the walk, 2 settling, 3 beached; a fitTints reference: harbour-machines.js).
Object.assign(UNIT_MODELS, {
  trooper: { build: picket, frames: 4, r: 17, h: 20 }, medic: { build: mender, frames: 2, r: 15, h: 21 },
  vanguard: { build: breakwater, frames: 4, r: 22, h: 20 },
});
// The older Expedition models (vael2.js, vael-units.js, vael-buildings.js): `glint`, `needle`, `tidewell` and `cradle` as
// fitTints references, and `tender` (the Halo).
Object.assign(VAEL_UNITS, {
  lumen: { build: glint, frames: 2, r: 12, h: 13 }, scythe: { build: needle, frames: 2, r: 17, h: 10 }, halo: { build: tender, frames: 2, r: 13, h: 13 },
});
Object.assign(VAEL_BUILDINGS, { conflux: [4, tidewell, 62], kiln: [3, cradle, 42] });

// The Vael units in the game; each race renders with its own materials.
const VAEL_IN_GAME = VAEL_UNITS;
const UNITS_ALL = [...Object.entries(UNIT_MODELS).map(([k, m]) => [k, m, makeMats]), ...Object.entries(VAEL_IN_GAME).map(([k, m]) => [k, m, makeVaelMats])];

/** The unit kinds and building types the re-theme's roster retired (no longer in the sim): no sprite of theirs goes
 *  into the atlas. */
const RETIRED = new Set(['vanguard', 'raider', 'interceptor', 'sovereign', 'zenith']);
const FACINGS = 16;
const enc = (img) => { let s = ''; const b = img.data; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

/** Cell around a unit: room above for its height, below/right for its shadow. Returns px sizes and anchor. */
function unitCell(r, h) {
  const left = r + 2, right = r + h * 0.55 + 4, up = r + h * LIFT + 2, down = r + h * 0.45 + 3;
  return { w: Math.ceil((left + right) * S), h: Math.ceil((up + down) * S), ax: Math.round(left * S), ay: Math.round(up * S) };
}

/** Cell around a building footprint (n tiles): height above, shadow right/below. Anchor = footprint center. */
function bldgCell(n, h) {
  const W = n * 32, left = 4, right = h * 0.5 + 6, up = h * LIFT + 6, down = h * 0.4 + 6;
  return { w: Math.ceil((left + W + right) * S), h: Math.ceil((up + W + down) * S), ax: Math.round((left + W / 2) * S), ay: Math.round((up + W / 2) * S) };
}
/**
 * The mask tint per seat: the color that, multiplied into the neutral team mask, comes closest to paint of the seat's
 * color (SEAT_COLORS) rendered and finished for real (the finish's contrast curve deepens dark channels, so a plain
 * multiply by the paint color would read paler). Least squares over the solid mask pixels of a few reference sprites.
 */
function fitTints() {
  const turn = (o, dir) => { o.rotation.y = -dir / FACINGS * Math.PI * 2; return o; };
  const REF = [
    [(M) => turn(UNIT_MODELS.trooper.build(M, 0), 2), unitCell(UNIT_MODELS.trooper.r, UNIT_MODELS.trooper.h), makeMats],
    [(M) => turn(UNIT_MODELS.vanguard.build(M, 0), 5), unitCell(UNIT_MODELS.vanguard.r, UNIT_MODELS.vanguard.h), makeMats],
    [(M) => lighthouse(M), bldgCell(4, 68), makeMats], [(M) => B.barracks(M), bldgCell(3, 44), makeMats],
    [(M) => turn(VAEL_UNITS.lumen.build(M, 0), 2), unitCell(VAEL_UNITS.lumen.r, VAEL_UNITS.lumen.h), makeVaelMats],
    [(M) => turn(VAEL_UNITS.scythe.build(M, 0), 3), unitCell(VAEL_UNITS.scythe.r, VAEL_UNITS.scythe.h), makeVaelMats],
    [(M) => VAEL_BUILDINGS.conflux[1](M), bldgCell(4, 70), makeVaelMats], [(M) => VAEL_BUILDINGS.kiln[1](M), bldgCell(3, 42), makeVaelMats],
  ];
  const mo = SEAT_COLORS.map(() => [0, 0, 0]), mm = [0, 0, 0];
  for (const [build, cell, mats] of REF) {
    const { mask } = shoot(build(mats()), { ...cell, mask: true }), m = mask.data;
    SEAT_COLORS.forEach((c, k) => {
      const o = shoot(build(mats({ paint: c, light: c })), cell).data;
      for (let i = 0; i < m.length; i += 4) if (m[i + 3] === 255 && o[i + 3] === 255) for (let ch = 0; ch < 3; ch++) { mo[k][ch] += m[i + ch] * o[i + ch]; if (!k) mm[ch] += m[i + ch] * m[i + ch]; }
    });
  }
  return mo.map(v => v.reduce((t, x, ch) => t << 8 | Math.min(255, Math.round(255 * x / mm[ch])), 0));
}

window.render = async function (filter = '', opts = {}) {
  const out = [];
  const want = (name) => !filter || new RegExp(filter).test(name);
  const anchor = (cell) => ({ x: cell.ax / cell.w, y: cell.ay / cell.h });
  const sprite = (name, img, cell, extra) => out.push({ name, w: img.width, h: img.height, data: enc(img), anchor: anchor(cell), ...extra });
  const push = (name, obj, cell, opts = {}) => { if (want(name)) sprite(name, shoot(obj, { ...cell, ...opts }), cell); };
  /** A team-colored sprite: the neutral render `name` and its team mask `name_m` (trimmed by the packer). */
  const pushTeam = (name, obj, cell, opts = {}, extra = {}) => {
    if (!want(name)) return;
    const { img, mask } = shoot(obj, { ...cell, ...opts, mask: true });
    sprite(name, img, cell, extra); sprite(`${name}_m`, mask, cell, { trim: true });
  };
  // The re-theme's models under today's names (retheme.js atlasSprites: the units, buildings, turning heads,
  // construction and rubble, the gold and the scenery), polished at the game's camera and sun.
  for (const [name, obj, cell, o, isTeam, extra] of atlasSprites(want)) isTeam ? pushTeam(name, obj, cell, o, extra) : push(name, obj, cell, o);
  // The healers keep their old models (ATLAS_UNITS has no row for them); the retired kinds are not drawn. Units are
  // drawn UNIT_ART_SCALE times their model's size (look.js), the cell with them.
  for (const [kind, m, mats] of UNITS_ALL) {
    if (ATLAS_UNITS[kind] || RETIRED.has(kind)) continue;
    const K = UNIT_ART_SCALE, M = mats(), cell = unitCell(m.r * K, m.h * K);
    for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < m.frames; f++) {
      const obj = m.build(M, f); obj.rotation.y = -dir / FACINGS * Math.PI * 2; obj.scale.multiplyScalar(K);
      pushTeam(`${kind}_${dir}_${f}`, obj, cell, {}, { anim: `${kind}_${dir}`, frame: f });
    }
  }
  // The re-theme's models under their own names (retheme.js rethemeSprites), only when a filter asks for them by name,
  // at their own camera (`opts.elev`), sun (`opts.sun`) and finish (`opts.polish`): the review pictures' path.
  if (filter) for (const [name, obj, cell, o, isTeam, extra] of rethemeSprites(want, opts)) isTeam ? pushTeam(name, obj, cell, o, extra) : push(name, obj, cell, o);
  return { sprites: out, tints: fitTints() };
};
window.ready = true;
