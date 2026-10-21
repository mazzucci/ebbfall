// Scenery ("doodads"): neutral props the client scatters over the map. Tall ones (boulders, spires, ruins) stand on
// rock plateaus, which nothing walks on; low ones (craters, wrecks, debris) lie on open ground and are walked over.
// All are centred on their anchor; `v` picks a variant and seeds the shapes.
import * as THREE from 'three';
import { grp, add, rbox, cyl, limb } from './models.js';

let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const std = (o) => new THREE.MeshStandardMaterial(o);
export const DMATS = {
  rock: std({ color: 0x4f5562, roughness: 0.9, metalness: 0.05, flatShading: true }),
  rockDark: std({ color: 0x363b46, roughness: 0.95, metalness: 0.05, flatShading: true }),
  dirt: std({ color: 0x45382c, roughness: 1, flatShading: true }),
  scorch: std({ color: 0x2e251d, roughness: 1 }),
  rust: std({ color: 0x5a3c2a, roughness: 0.75, metalness: 0.45 }),
  rustDark: std({ color: 0x33271f, roughness: 0.8, metalness: 0.5 }),
  hull: std({ color: 0x353b43, roughness: 0.6, metalness: 0.6 }),
  concrete: std({ color: 0x67645f, roughness: 0.95, metalness: 0.02, flatShading: true }),
  steel: std({ color: 0x585e66, roughness: 0.4, metalness: 0.85 }),
  ember: std({ color: 0x301008, emissive: 0xff6a20, emissiveIntensity: 1.6 }),
};
const M = DMATS;
const stone = (r, detail = 0) => new THREE.DodecahedronGeometry(r, detail);

/** A pile of three to six boulders. */
export function boulders(v) {
  const g = grp(); s = 101 + v * 17;
  const n = 3 + v + (rnd() * 2 | 0);
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, d = k ? 6 + rnd() * 12 : 0, r = k ? 4 + rnd() * 5 : 9 + rnd() * 3;
    const m = add(g, stone(r), k % 3 === 2 ? M.rockDark : M.rock, Math.cos(a) * d, r * 0.55, Math.sin(a) * d, rnd() * 3, rnd() * 3, rnd() * 3);
    m.scale.set(1, 0.65 + rnd() * 0.3, 1);
  }
  return g;
}

/** A jagged rock spire with rubble at its foot. */
export function spire(v) {
  const g = grp(); s = 211 + v * 23;
  const h = 40 + v * 12;
  for (let k = 0; k < 3; k++) {
    const r = 10 - k * 2.4, m = add(g, new THREE.ConeGeometry(r, h * (1 - k * 0.22), 5), k ? M.rockDark : M.rock, (rnd() - 0.5) * 6, h * (1 - k * 0.22) / 2, (rnd() - 0.5) * 6, (rnd() - 0.5) * 0.25, rnd() * 3, (rnd() - 0.5) * 0.25);
    m.position.x += k * 3 * (v ? -1 : 1);
  }
  for (let k = 0; k < 5; k++) { const a = rnd() * Math.PI * 2, d = 8 + rnd() * 6, r = 2 + rnd() * 2.5; add(g, stone(r), M.rock, Math.cos(a) * d, r * 0.5, Math.sin(a) * d, rnd() * 3, rnd() * 3, 0); }
  return g;
}

/** A broken concrete wall or pillar with rebar sticking out of the break. */
export function ruin(v) {
  const g = grp(); s = 307 + v * 29;
  const cols = v ? 1 : 4;
  for (let k = 0; k < cols; k++) {
    const h = v ? 30 : 10 + rnd() * 14, x = v ? 0 : (k - 1.5) * 8.5, w = v ? 9 : 8, d = v ? 9 : 5;
    add(g, rbox(w, h, d, 0.6), M.concrete, x, h / 2, 0, 0, v ? 0.3 : 0, (rnd() - 0.5) * 0.08);
    for (let j = 0; j < 3; j++) limb(g, [x + (j - 1) * 2.4, h - 1, (rnd() - 0.5) * 2], [x + (j - 1) * 3 + (rnd() - 0.5) * 3, h + 3 + rnd() * 4, (rnd() - 0.5) * 4], 0.35, M.rustDark);
  }
  if (v) { add(g, rbox(22, 2, 9, 0.5), M.concrete, 11, 5, 6, 0.1, 0.5, 0.45); } // a fallen beam leaning on it
  for (let k = 0; k < 7; k++) { const sz = 2 + rnd() * 3; add(g, rbox(sz, sz * 0.6, sz, 0.3), M.concrete, (rnd() - 0.5) * 30, sz * 0.25, 6 + rnd() * 8, rnd(), rnd() * 3, rnd()); }
  return g;
}

/** A shallow blast crater: a low dirt rim around a scorched floor, with a few clods thrown out. */
export function crater(v) {
  const g = grp(); s = 401 + v * 31;
  const r = 14 + v * 6;
  add(g, new THREE.CircleGeometry(r, 24), M.scorch, 0, 0.2, 0, -Math.PI / 2);
  const rim = add(g, new THREE.TorusGeometry(r, 1.8 + v * 0.6, 6, 22), M.dirt, 0, 0.2, 0, Math.PI / 2);
  rim.scale.set(1, 1, 0.45);
  for (let k = 0; k < 9 + v * 4; k++) { const a = rnd() * Math.PI * 2, d = r + 3 + rnd() * 8, c = 1 + rnd() * 1.8; add(g, stone(c), M.dirt, Math.cos(a) * d, c * 0.4, Math.sin(a) * d, rnd() * 3, rnd() * 3, 0); }
  return g;
}

/** A tank hull half sunk into the ground, its turret thrown beside it. */
export function wreck(v) {
  const g = grp(); s = 503 + v * 37;
  const hull = grp(); hull.rotation.set(0.12, v ? 0.9 : -0.5, v ? -0.18 : 0.15); hull.position.y = -1.5; g.add(hull);
  add(hull, rbox(30, 8, 17, 1.2), M.hull, 0, 4, 0);
  for (const side of [-1, 1]) add(hull, rbox(32, 5, 4.5, 1.4), M.rustDark, 0, 2.5, side * 9.5);
  add(hull, rbox(10, 1, 12, 0.3), M.scorch, -3, 8.2, 0); // blown-open turret ring
  add(hull, cyl(4, 4, 1.4, 14), M.rust, -3, 8.6, 0);
  const tur = grp(); tur.position.set(v ? -20 : 19, 0, v ? 10 : -11); tur.rotation.set(0.35, rnd() * 3, 0.2); g.add(tur);
  add(tur, rbox(13, 5.5, 11, 1.4), M.rust, 0, 3, 0);
  add(tur, cyl(0.9, 0.9, 14, 8), M.rustDark, 9, 3.5, 0, 0, 0, Math.PI / 2 + 0.25);
  add(g, new THREE.CircleGeometry(17, 20), M.scorch, 0, 0.15, 0, -Math.PI / 2).scale.set(1.3, 1, 1);
  for (let k = 0; k < 6; k++) { const sz = 1.5 + rnd() * 2.5; add(g, rbox(sz * 2, 0.6, sz, 0.2), k % 2 ? M.rust : M.hull, (rnd() - 0.5) * 44, 0.4, (rnd() - 0.5) * 30, 0, rnd() * 3, 0); }
  if (!v) add(g, new THREE.SphereGeometry(1.4, 8, 6), M.ember, -3, 9.5, 0); // still smouldering
  return g;
}

/** Scattered plates, girders and a buckled drum. */
export function debris(v) {
  const g = grp(); s = 601 + v * 41;
  for (let k = 0; k < 8 + v * 3; k++) {
    const w = 3 + rnd() * 7, d = 2 + rnd() * 5, x = (rnd() - 0.5) * 34, z = (rnd() - 0.5) * 24;
    add(g, rbox(w, 0.8, d, 0.3), [M.hull, M.rust, M.steel][k % 3], x, 0.5 + rnd() * 0.8, z, (rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
  }
  for (let k = 0; k < 2 + v; k++) add(g, rbox(24 + rnd() * 8, 1.6, 2.2, 0.3), M.rustDark, (rnd() - 0.5) * 14, 1.2, (rnd() - 0.5) * 16, 0, rnd() * 3, (rnd() - 0.5) * 0.2);
  const drum = add(g, cyl(2.6, 2.6, 6, 12), M.rust, v ? -10 : 9, 2.6, v ? 7 : -6, Math.PI / 2, rnd() * 3, 0);
  drum.scale.set(1, 1, 0.85);
  return g;
}

/** [name, model, radius (game units), height]: what the client may place, by where it may stand. */
export const DOODADS = {
  rock: [['boulders_0', () => boulders(0), 26, 22], ['boulders_1', () => boulders(1), 28, 22], ['boulders_2', () => boulders(2), 30, 24],
    ['spire_0', () => spire(0), 22, 42], ['spire_1', () => spire(1), 24, 54], ['ruin_0', () => ruin(0), 26, 28], ['ruin_1', () => ruin(1), 26, 38]],
  ground: [['crater_0', () => crater(0), 26, 6], ['crater_1', () => crater(1), 34, 7], ['wreck_0', () => wreck(0), 34, 14], ['wreck_1', () => wreck(1), 34, 14],
    ['debris_0', () => debris(0), 26, 6], ['debris_1', () => debris(1), 28, 6]],
};
