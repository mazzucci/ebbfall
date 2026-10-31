// Renders every 3D sprite and hands the RGBA images to the Node driver (tools/art/generate.mjs) via window.render().
import { shoot, S, LIFT } from './scene.js';
import { makeMats, GOLD } from './materials.js';
import { SEAT_COLORS } from '../../src/client/look.js';
import * as THREE from 'three';
import { UNIT_MODELS } from './models.js';
import * as B from './buildings.js';
import { DOODADS } from './doodads.js';
import { VAEL_UNITS, VAEL_BUILDINGS, makeVaelMats } from './vael.js';

// The Vael units in the game; each race renders with its own materials.
const VAEL_IN_GAME = VAEL_UNITS;
const UNITS_ALL = [...Object.entries(UNIT_MODELS).map(([k, m]) => [k, m, makeMats]), ...Object.entries(VAEL_IN_GAME).map(([k, m]) => [k, m, makeVaelMats])];

const FACINGS = 16;
const enc = (img) => { let s = ''; const b = img.data; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

/** Cell around a unit: room above for its height, below/right for its shadow. Returns px sizes and anchor. */
function unitCell(r, h) {
  const left = r + 2, right = r + h * 0.55 + 4, up = r + h * LIFT + 2, down = r + h * 0.45 + 3;
  return { w: Math.ceil((left + right) * S), h: Math.ceil((up + down) * S), ax: Math.round(left * S), ay: Math.round(up * S) };
}

/** Cell around a building footprint (n tiles): height above, shadow right/below. Anchor = footprint centre. */
function bldgCell(n, h) {
  const W = n * 32, left = 4, right = h * 0.5 + 6, up = h * LIFT + 6, down = h * 0.4 + 6;
  return { w: Math.ceil((left + W + right) * S), h: Math.ceil((up + W + down) * S), ax: Math.round((left + W / 2) * S), ay: Math.round((up + W / 2) * S) };
}
const BUILDINGS = { core: [4, B.core, 56], depot: [2, B.depot, 32], extractor: [2, B.extractor, 58], barracks: [3, B.barracks, 44], forge: [2, B.forge, 72], turret: [2, B.turretBase, 14], airfield: [3, B.airfield, 58], factory: [3, B.factory, 48] };
const RES = {
  rock: new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.9, metalness: 0.05, flatShading: true }),
  pit: new THREE.MeshStandardMaterial({ color: 0x120c1e, roughness: 1 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x3d2a80, emissive: 0xa98bff, emissiveIntensity: 2.2 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x1f8a80, emissive: 0x16786f, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.12, flatShading: true }),
  crystalTip: new THREE.MeshStandardMaterial({ color: 0x7ff0e2, emissive: 0x4fd1c5, emissiveIntensity: 2.0, metalness: 0.1, roughness: 0.1, flatShading: true }),
};

/**
 * The mask tint per seat: the colour that, multiplied into the neutral team mask, comes closest to paint of the seat's
 * colour (SEAT_COLORS) rendered and finished for real (the finish's contrast curve deepens dark channels, so a plain
 * multiply by the paint colour would read paler). Least squares over the solid mask pixels of a few reference sprites.
 */
function fitTints() {
  const turn = (o, dir) => { o.rotation.y = -dir / FACINGS * Math.PI * 2; return o; };
  const REF = [
    [(M) => turn(UNIT_MODELS.trooper.build(M, 0), 2), unitCell(UNIT_MODELS.trooper.r, UNIT_MODELS.trooper.h), makeMats],
    [(M) => turn(UNIT_MODELS.vanguard.build(M, 0), 5), unitCell(UNIT_MODELS.vanguard.r, UNIT_MODELS.vanguard.h), makeMats],
    [(M) => B.core(M), bldgCell(4, 56), makeMats], [(M) => B.barracks(M), bldgCell(3, 44), makeMats],
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

window.render = async function (filter = '') {
  const out = [];
  const want = (name) => !filter || new RegExp(filter).test(name);
  const anchor = (cell) => ({ x: cell.ax / cell.w, y: cell.ay / cell.h });
  const sprite = (name, img, cell, extra) => out.push({ name, w: img.width, h: img.height, data: enc(img), anchor: anchor(cell), ...extra });
  const push = (name, obj, cell, opts = {}) => { if (want(name)) sprite(name, shoot(obj, { ...cell, ...opts }), cell); };
  /** A team-coloured sprite: the neutral render `name` and its team mask `name_m` (trimmed by the packer). */
  const pushTeam = (name, obj, cell, opts = {}, extra = {}) => {
    if (!want(name)) return;
    const { img, mask } = shoot(obj, { ...cell, ...opts, mask: true });
    sprite(name, img, cell, extra); sprite(`${name}_m`, mask, cell, { trim: true });
  };
  for (const [kind, m, mats] of UNITS_ALL) {
    const M = mats(), cell = unitCell(m.r, m.h);
    for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < m.frames; f++) {
      const obj = m.build(M, f); obj.rotation.y = -dir / FACINGS * Math.PI * 2;
      pushTeam(`${kind}_${dir}_${f}`, obj, cell, {}, { anim: `${kind}_${dir}`, frame: f });
    }
  }
  for (const [type, [n, build, h]] of Object.entries(BUILDINGS)) pushTeam(`bldg_${type}`, build(makeMats()), bldgCell(n, h));
  for (const [type, [n, build, h]] of Object.entries(VAEL_BUILDINGS)) pushTeam(`bldg_${type}`, build(makeVaelMats()), bldgCell(n, h));
  for (let dir = 0; dir < FACINGS; dir++) {
    const head = B.turretHead(makeMats()); head.rotation.y = -dir / FACINGS * Math.PI * 2;
    pushTeam(`turret_head_${dir}`, head, bldgCell(2, 30), { shadow: false }); // drawn above the base, which has its own shadow
  }
  const neutral = makeMats(GOLD); // construction and ruins: seat 0's gold
  for (const n of [2, 3, 4]) {
    push(`foundation_${n}`, B.foundation(n), bldgCell(n, 4));
    push(`scaffold_${n}`, B.scaffold(n, neutral), bldgCell(n, 10 + n * 6), { shadow: false });
    push(`rubble_${n}`, B.rubble(n, neutral), bldgCell(n, 10));
  }
  for (let st = 0; st < 4; st++) push(`shard_${st}`, B.shardField(st, RES), unitCell(15, 20));
  for (let f = 0; f < 4; f++) push(`vent_${f}`, B.vent(f, RES), unitCell(30, 8));
  for (const list of Object.values(DOODADS)) for (const [name, build, r, h] of list) push(`doodad_${name}`, build(), unitCell(r, h));
  return { sprites: out, tints: fitTints() };
};
window.ready = true;
