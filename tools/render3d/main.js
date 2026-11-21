// Renders every 3D sprite and hands the RGBA images to the Node driver (tools/art/generate.mjs) via window.render().
import { shoot, S, LIFT } from './scene.js';
import { makeMats } from './materials.js';
import { SEAT_COLORS, UNIT_ART_SCALE } from '../../src/client/look.js';
import * as B from './buildings.js';
import { makeVaelMats } from './vael.js';
import { lighthouse } from './harbour.js';
import { picket, mender } from './harbour-infantry.js';
import { glint, tidewell } from './vael2.js';
import { needle, tender } from './vael-units.js';
import { breakwater } from './harbour-machines.js';
import { cradle } from './vael-buildings.js';
import { rethemeSprites, atlasSprites, ATLAS_UNITS } from './retheme.js';

// The re-theme (retheme.js ATLAS_UNITS, ATLAS_BUILDINGS) draws every unit and building in the game but the two healers,
// which keep their older models: the Healer (`medic`, harbour-infantry.js `mender`) and the Medic (`halo`, vael-units.js
// `tender`; both in the sim's tables, trained nowhere), each with its own people's materials, in this order. fitTints
// measures a few more older models (below).
const HEALERS = [
  ['medic', { build: mender, frames: 2, r: 15, h: 21 }, makeMats],
  ['halo', { build: tender, frames: 2, r: 13, h: 13 }, makeVaelMats],
];
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
  const unit = (build, dir, r, h, mats) => [(M) => turn(build(M, 0), dir), unitCell(r, h), mats];
  // The older models: the Picket and the Breakwater (harbour-infantry.js, harbour-machines.js), the lighthouse
  // (harbour.js) and buildings.js's barracks; the Glint and the Needle (vael2.js, vael-units.js), the Tidewell (vael2.js)
  // and the Cradle (vael-buildings.js).
  const REF = [
    unit(picket, 2, 17, 20, makeMats), unit(breakwater, 5, 22, 20, makeMats),
    [(M) => lighthouse(M), bldgCell(4, 68), makeMats], [(M) => B.barracks(M), bldgCell(3, 44), makeMats],
    unit(glint, 2, 12, 13, makeVaelMats), unit(needle, 3, 17, 10, makeVaelMats),
    [(M) => tidewell(M), bldgCell(4, 70), makeVaelMats], [(M) => cradle(M), bldgCell(3, 42), makeVaelMats],
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
  const out = [], ZOOM = opts.zoom || 1; // (`zoom`: every sprite that many times the atlas's scale)
  const want = (name) => !filter || new RegExp(filter).test(name);
  const anchor = (cell) => ({ x: cell.ax / cell.w, y: cell.ay / cell.h });
  const sprite = (name, img, cell, extra) => out.push({ name, w: img.width, h: img.height, data: enc(img), anchor: anchor(cell), ...extra });
  /** A sprite drawn `z` times larger than the atlas's (the model and its cell scaled together; tools/menu-art.mjs's hero band). */
  const zoomed = (obj, cell, z) => { if (!z || z === 1) return cell; obj.scale.multiplyScalar(z); return { w: Math.ceil(cell.w * z), h: Math.ceil(cell.h * z), ax: Math.round(cell.ax * z), ay: Math.round(cell.ay * z) }; };
  const push = (name, obj, cell, opts = {}) => { if (!want(name)) return; cell = zoomed(obj, cell, ZOOM); sprite(name, shoot(obj, { ...cell, ...opts }), cell); };
  /** A team-colored sprite: the neutral render `name` and its team mask `name_m` (trimmed by the packer). */
  const pushTeam = (name, obj, cell, opts = {}, extra = {}) => {
    if (!want(name)) return;
    cell = zoomed(obj, cell, ZOOM);
    const { img, mask } = shoot(obj, { ...cell, ...opts, mask: true });
    sprite(name, img, cell, extra); sprite(`${name}_m`, mask, cell, { trim: true });
  };
  // The re-theme's models under today's names (retheme.js atlasSprites: the units, buildings, turning heads,
  // construction and rubble, the gold and the scenery), polished at the game's camera and sun.
  for (const [name, obj, cell, o, isTeam, extra] of atlasSprites(want)) isTeam ? pushTeam(name, obj, cell, o, extra) : push(name, obj, cell, o);
  // The healers on their older models (HEALERS; a row in ATLAS_UNITS would replace one), drawn UNIT_ART_SCALE times
  // their model's size (look.js), the cell with them.
  for (const [kind, m, mats] of HEALERS) {
    if (ATLAS_UNITS[kind]) continue;
    const K = UNIT_ART_SCALE, M = mats(), cell = unitCell(m.r * K, m.h * K);
    for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < m.frames; f++) {
      const obj = m.build(M, f); obj.rotation.y = -dir / FACINGS * Math.PI * 2; obj.scale.multiplyScalar(K);
      pushTeam(`${kind}_${dir}_${f}`, obj, cell, {}, { anim: `${kind}_${dir}`, frame: f });
    }
  }
  // The re-theme's models under their own names (retheme.js rethemeSprites), only when a filter asks for them by name,
  // at their own camera (`opts.elev`), sun (`opts.sun`) and finish (`opts.polish`): the review pictures' path.
  if (filter) for (const [name, obj, cell, o, isTeam, extra] of rethemeSprites(want, opts)) isTeam ? pushTeam(name, obj, cell, o, extra) : push(name, obj, cell, o);
  return { sprites: out, tints: opts.noTints ? [] : fitTints() }; // (hd-exp `noTints`: the sample's batches skip the fit)
};
window.ready = true;
