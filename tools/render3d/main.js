// Renders every 3D sprite and hands the RGBA images to the Node driver (tools/art/generate.mjs) via window.render().
import { shoot, S, LIFT } from './scene.js';
import { makeMats, GOLD } from './materials.js';
import { SEAT_COLORS } from '../../src/client/look.js';
import * as THREE from 'three';
import { UNIT_MODELS } from './models.js';
import * as B from './buildings.js';
import { DOODADS } from './doodads.js';
import { VAEL_UNITS, VAEL_BUILDINGS, makeVaelMats } from './vael.js';
import { lighthouse } from './harbour.js';
import { rigger, picket, harpooner, mender } from './harbour-infantry.js';
import { glint, lens, tidewell } from './vael2.js';
import { needle, tender, conch, undertow, petrel, argonaut } from './vael-units.js';
import { breakwater, anchorGun, netter } from './harbour-machines.js';
import { kite, spyglass, windjammer } from './harbour-air.js';

// The new look (STYLE.md), kind by kind as it is made: these entries replace the old models for their keys.
// Harbour infantry (harbour-infantry.js): the Rigger, the Picket (0-1 the march, 2 settling, 3 dug in: look.js UNIT_POSE), the Harpooner, the Mender
Object.assign(UNIT_MODELS, {
  harvester: { build: rigger, frames: 2, r: 12, h: 18 }, trooper: { build: picket, frames: 4, r: 17, h: 20 },
  lancer: { build: harpooner, frames: 2, r: 21, h: 26 }, medic: { build: mender, frames: 2, r: 15, h: 21 },
});
Object.assign(VAEL_UNITS, { lumen: { build: glint, frames: 2, r: 12, h: 13 }, prism: { build: lens, frames: 2, r: 12, h: 14 } });
Object.assign(VAEL_BUILDINGS, { conflux: [4, tidewell, 62] });
// Vael units (step 1, vael-units.js): the Needle, the Tender, the Conch, the Undertow (0-1 gliding, 2 lying flat as it
// lurks: look.js UNIT_POSE), the Petrel (one frame: a glider) and the Argonaut (four: a slow bob).
Object.assign(VAEL_UNITS, {
  scythe: { build: needle, frames: 2, r: 17, h: 10 }, halo: { build: tender, frames: 2, r: 13, h: 13 },
  monolith: { build: conch, frames: 2, r: 17, h: 22 }, umbra: { build: undertow, frames: 3, r: 14, h: 12 },
  shrike: { build: petrel, frames: 1, r: 20, h: 24 }, // (r 20: the gull wing's tip reaches 19.4 from the centre)
  sovereign: { build: argonaut, frames: 4, r: 26, h: 20 },
});
// Harbour machines (step 1, harbour-machines.js): the Breakwater (0-1 the walk, 2 settling, 3 beached: look.js
// UNIT_POSE), the Anchor Gun (0-1 travelling, 2 half, 3 anchored) and the Netter (two frames, its wheels turning).
Object.assign(UNIT_MODELS, {
  vanguard: { build: breakwater, frames: 4, r: 22, h: 20 },   // (r 22: the spades and legs splay past 17 beached and in some walk facings; the mortar's muzzle about 16.7 ahead)
  siegeTank: { build: anchorGun, frames: 4, r: 31, h: 24 },   // (r 31: the muzzle reaches 24.4 ahead, the dropped anchor about 29 astern; h 24: raised)
  interceptor: { build: netter, frames: 2, r: 14, h: 21 },    // (r 14: the reel is 15.8 across; h 21: the tubes raised)
});
// Harbour air (step 1, harbour-air.js): the Kite (flies at 17, its tail reaching 17.5 aft), the Spyglass (at 26) and
// the Windjammer (at 24, 44 long); one frame each, gliders (look.js UNIT_FPS 0). The cells hold the flyer and its
// shadow, which lands 0.4 of the height east and 0.3 south of it.
Object.assign(UNIT_MODELS, {
  raider: { build: kite, frames: 1, r: 19, h: 18 }, observer: { build: spyglass, frames: 1, r: 11, h: 30 },
  bastion: { build: windjammer, frames: 1, r: 25, h: 40 },
});

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
const BUILDINGS = { core: [4, lighthouse, 68], depot: [2, B.depot, 32], extractor: [2, B.extractor, 58], barracks: [3, B.barracks, 44], forge: [2, B.forge, 72], turret: [2, B.turretBase, 14], airfield: [3, B.airfield, 58], factory: [3, B.factory, 48] };
const RES = {
  pit: new THREE.MeshStandardMaterial({ color: 0x120c1e, roughness: 1 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x3d2a80, emissive: 0xa98bff, emissiveIntensity: 2.2 }),
  // the salt field (STYLE.md): halite, pale and unlit, on wet slate
  slate: new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: 0.8, metalness: 0.1, flatShading: true }),
  salt: new THREE.MeshStandardMaterial({ color: 0xe4e0d4, roughness: 0.42, metalness: 0.04, flatShading: true }),
  saltWet: new THREE.MeshStandardMaterial({ color: 0xc4c8c8, roughness: 0.25, metalness: 0.1, flatShading: true }),
  crust: new THREE.MeshStandardMaterial({ color: 0xb9b5a6, roughness: 0.95, metalness: 0, flatShading: true }),
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
