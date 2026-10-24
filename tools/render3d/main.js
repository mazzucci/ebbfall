// Renders every 3D sprite and hands the RGBA images to the Node driver (tools/art/generate.mjs) via window.render().
import { shoot, S, LIFT } from './scene.js';
import { makeMats } from './materials.js';
import * as THREE from 'three';
import { UNIT_MODELS } from './models.js';
import * as B from './buildings.js';
import { DOODADS } from './doodads.js';

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
const BUILDINGS = { core: [4, B.core, 56], depot: [2, B.depot, 32], extractor: [2, B.extractor, 58], barracks: [3, B.barracks, 44], forge: [2, B.forge, 72], turret: [2, B.turretBase, 14], airfield: [3, B.airfield, 58] };
const RES = {
  rock: new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.9, metalness: 0.05, flatShading: true }),
  pit: new THREE.MeshStandardMaterial({ color: 0x120c1e, roughness: 1 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x3d2a80, emissive: 0xa98bff, emissiveIntensity: 2.2 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x1f8a80, emissive: 0x16786f, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.12, flatShading: true }),
  crystalTip: new THREE.MeshStandardMaterial({ color: 0x7ff0e2, emissive: 0x4fd1c5, emissiveIntensity: 2.0, metalness: 0.1, roughness: 0.1, flatShading: true }),
};

window.render = async function (filter = '') {
  const out = [];
  const want = (name) => !filter || new RegExp(filter).test(name);
  for (const [kind, m] of Object.entries(UNIT_MODELS)) for (let team = 0; team < 2; team++) {
    const M = makeMats(team), cell = unitCell(m.r, m.h);
    for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < m.frames; f++) {
      const name = `${kind}_${team}_${dir}_${f}`; if (!want(name)) continue;
      const obj = m.build(M, f); obj.rotation.y = -dir / FACINGS * Math.PI * 2;
      const img = shoot(obj, cell);
      out.push({ name, w: img.width, h: img.height, data: enc(img), anchor: { x: cell.ax / cell.w, y: cell.ay / cell.h } });
    }
  }
  const push = (name, obj, cell, opts = {}) => { if (!want(name)) return; const img = shoot(obj, { ...cell, ...opts }); out.push({ name, w: img.width, h: img.height, data: enc(img), anchor: { x: cell.ax / cell.w, y: cell.ay / cell.h } }); };
  for (const [type, [n, build, h]] of Object.entries(BUILDINGS)) for (let team = 0; team < 2; team++) push(`bldg_${type}_${team}`, build(makeMats(team)), bldgCell(n, h));
  for (let team = 0; team < 2; team++) for (let dir = 0; dir < FACINGS; dir++) {
    const head = B.turretHead(makeMats(team)); head.rotation.y = -dir / FACINGS * Math.PI * 2;
    push(`turret_head_${team}_${dir}`, head, bldgCell(2, 30), { shadow: false }); // drawn above the base, which has its own shadow
  }
  const neutral = makeMats(0);
  for (const n of [2, 3, 4]) {
    push(`foundation_${n}`, B.foundation(n), bldgCell(n, 4));
    push(`scaffold_${n}`, B.scaffold(n, neutral), bldgCell(n, 10 + n * 6), { shadow: false });
    push(`rubble_${n}`, B.rubble(n, neutral), bldgCell(n, 10));
  }
  for (let st = 0; st < 4; st++) push(`shard_${st}`, B.shardField(st, RES), unitCell(15, 20));
  for (let f = 0; f < 4; f++) push(`vent_${f}`, B.vent(f, RES), unitCell(30, 8));
  for (const list of Object.values(DOODADS)) for (const [name, build, r, h] of list) push(`doodad_${name}`, build(), unitCell(r, h));
  return out;
};
window.ready = true;
