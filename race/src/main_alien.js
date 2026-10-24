// Renders a plan of sprites (Vael concepts and human references) and returns RGBA images to the Node driver.
// plan: [{ name, kind: 'vunit'|'vbldg'|'hunit'|'hbldg', key, team, dir, frame }]
import { shoot, S, LIFT } from './scene.js';
import { makeMats } from './materials.js';
import { UNIT_MODELS } from './models.js';
import * as B from './buildings.js';
import { makeVaelMats, VAEL_UNITS, VAEL_BUILDINGS } from '/models_alien.js';

const FACINGS = 16;
const enc = (img) => { let s = ''; const b = img.data; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
function unitCell(r, h) {
  const left = r + 2, right = r + h * 0.55 + 4, up = r + h * LIFT + 2, down = r + h * 0.45 + 3;
  return { w: Math.ceil((left + right) * S), h: Math.ceil((up + down) * S), ax: Math.round(left * S), ay: Math.round(up * S) };
}
function bldgCell(n, h) {
  const W = n * 32, left = 4, right = h * 0.5 + 6, up = h * LIFT + 6, down = h * 0.4 + 6;
  return { w: Math.ceil((left + W + right) * S), h: Math.ceil((up + W + down) * S), ax: Math.round((left + W / 2) * S), ay: Math.round((up + W / 2) * S) };
}
const HUMAN_BLDGS = { core: [4, B.core, 56], depot: [2, B.depot, 32], extractor: [2, B.extractor, 58], barracks: [3, B.barracks, 44], forge: [2, B.forge, 72], turret: [2, B.turretBase, 14], airfield: [3, B.airfield, 58] };
const hm = [makeMats(0), makeMats(1)], vm = [makeVaelMats(0), makeVaelMats(1)];

window.render = async function (plan) {
  const out = [];
  for (const p of plan) {
    let obj, cell;
    if (p.kind === 'vunit') { const m = VAEL_UNITS[p.key]; obj = m.build(vm[p.team], p.frame || 0); cell = unitCell(m.r, m.h); }
    else if (p.kind === 'hunit') { const m = UNIT_MODELS[p.key]; obj = m.build(hm[p.team], p.frame || 0); cell = unitCell(m.r, m.h); }
    else if (p.kind === 'vbldg') { const [n, build, h] = VAEL_BUILDINGS[p.key]; obj = build(vm[p.team]); cell = bldgCell(n, h); }
    else if (p.kind === 'hbldg') {
      const [n, build, h] = HUMAN_BLDGS[p.key]; obj = build(hm[p.team]); cell = bldgCell(n, h);
      if (p.key === 'turret') { const head = B.turretHead(hm[p.team]); head.rotation.y = -(p.dir || 0) / FACINGS * Math.PI * 2; obj.add(head); cell = bldgCell(n, 30); }
    }
    if (p.kind === 'vunit' || p.kind === 'hunit') obj.rotation.y = -(p.dir || 0) / FACINGS * Math.PI * 2;
    const img = shoot(obj, cell);
    out.push({ name: p.name, w: img.width, h: img.height, data: enc(img), anchor: { x: cell.ax / cell.w, y: cell.ay / cell.h } });
  }
  return out;
};
window.ready = true;
