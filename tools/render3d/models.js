// The models, built from primitives in game units (1 tile = 32). Units face +x at rotation 0; y is up, +z is
// south. Walk frames pose the legs; `mats` carries the team's paint.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const grp = () => new THREE.Group();
export function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
/** Box-project UVs from positions (16 game units per texture repeat), so surface detail keeps one scale on any size. */
export function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / 16, v / 16);
  }
  return g;
}
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
/** Rounded box: w along x, h along y (up), d along z. */
export const rbox = (w, h, d, r = 0.8) => memo(`rb${w},${h},${d},${r}`, () => boxUV(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01))));
export const cyl = (rt, rb, h, seg = 18) => memo(`cy${rt},${rb},${h},${seg}`, () => boxUV(new THREE.CylinderGeometry(rt, rb, h, seg)));
export const sph = (r, ws = 20, hs = 14) => memo(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
/** Extrude a top-view outline ([x, z] points) upward by `depth`, with a bevel. */
export function plate(pts, depth, bevel = 1) {
  return memo(`pl${JSON.stringify(pts)},${depth},${bevel}`, () => {
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.1, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
    g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 16, uv.getY(i) / 16); // ~16 units per texture
    return g;
  });
}
/** A capsule from point a to point b (THREE.Vector3-like arrays). */
export function limb(parent, a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const m = new THREE.Mesh(memo(`cap${r},${len.toFixed(2)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.01, len), 6, 12)), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m); return m;
}

// ---------------- units ----------------

export function harvester(M, f) {
  const g = grp();
  M.rubber.map.offset.x = f * 0.07;
  for (const side of [-1, 1]) {
    add(g, rbox(21, 5, 4.6, 1.6), M.rubber, 0, 2.5, side * 6.6);
    for (const x of [-7, -2.4, 2.2, 6.8]) add(g, cyl(1.7, 1.7, 0.8, 14), M.steel, x, 2.6, side * 9.0, Math.PI / 2);
    add(g, rbox(19, 1.8, 1.4, 0.5), M.paint, -0.5, 5.6, side * 8.6);            // track skirt (team)
    add(g, cyl(1.6, 1.6, 9, 12), M.steel, -3.5, 9.2, side * 6.4, 0, 0, Math.PI / 2); // side tanks
    add(g, cyl(1.7, 1.7, 0.6, 12), M.dark, 1.2, 9.2, side * 6.4, 0, 0, Math.PI / 2);
    for (const x of [-6, 0, 6]) add(g, rbox(1.2, 1.2, 0.6, 0.2), M.dark, x, 5.6, side * 9.35);
  }
  add(g, plate([[-10.5, -6], [5.5, -6.5], [10, -3.5], [10, 3.5], [5.5, 6.5], [-10.5, 6]], 4.5, 1.1), M.trim, 0, 3.6, 0);
  // hopper with ribs, cargo floor and hazard rims
  add(g, rbox(9.5, 4.2, 10, 0.8), M.dark, -4.8, 9.6, 0);
  for (const x of [-8.6, -4.8, -1]) add(g, rbox(0.8, 4.4, 10.4, 0.3), M.trim, x, 9.6, 0);
  add(g, rbox(8, 1, 8.4, 0.4), M.gunmetal, -4.8, 11.3, 0);
  for (const side of [-1, 1]) add(g, rbox(9.6, 0.8, 0.9, 0.3), M.hazard, -4.8, 11.8, side * 5);
  // cab, windscreen, roof gear
  add(g, rbox(6.4, 5.4, 8.6, 1.2), M.paint, 3.6, 10.2, 0);
  add(g, rbox(1, 2.6, 7, 0.4), M.glass, 6.9, 11, 0, 0, 0, -0.45);
  add(g, rbox(3.2, 0.8, 6.2, 0.3), M.dark, 3.2, 13.2, 0);
  add(g, rbox(1.6, 1, 1.6, 0.3), M.steel, 2.2, 14, -2); add(g, sph(0.55, 8, 6), M.lamp, 2.2, 14.8, -2);
  for (const z of [-3.4, -1.8, 1.8, 3.4]) add(g, rbox(0.5, 1.4, 0.9, 0.2), M.dark, 0.6, 11, z);
  // mining drill on an arm
  add(g, rbox(2.4, 3, 7, 0.8), M.gunmetal, 9.6, 6.2, 0);
  for (const side of [-1, 1]) add(g, rbox(5, 1.4, 1.4, 0.4), M.steel, 11.4, 6.6, side * 2.6);
  add(g, cyl(2.6, 2.6, 2, 14), M.dark, 13.6, 6.4, 0, 0, 0, Math.PI / 2);
  add(g, cyl(0.4, 2.6, 7, 12), M.gunmetal, 18, 6.4, 0, 0, 0, -Math.PI / 2);
  for (let k = 0; k < 3; k++) add(g, new THREE.TorusGeometry(2.2 - k * 0.6, 0.35, 6, 14), M.steel, 15.4 + k * 1.8, 6.4, 0, 0, Math.PI / 2, 0);
  for (const side of [-1, 1]) { add(g, sph(0.8, 10, 8), M.white, 9.4, 7.6, side * 4.3); add(g, sph(0.7, 10, 8), M.lamp, -10.6, 9, side * 4.6); }
  add(g, cyl(0.18, 0.18, 6, 6), M.steel, -8.5, 14, 4.6);
  add(g, cyl(0.9, 0.9, 4, 10), M.gunmetal, -1, 13, -4.2); add(g, cyl(1.1, 1.1, 0.6, 10), M.dark, -1, 15.2, -4.2);
  return g;
}

export function trooper(M, f) {
  const g = grp();
  const st = [0, 3.2, 0, -3.2][f % 4];
  for (const side of [-1, 1]) {
    const s = st * side, z = side * 2.1;
    add(g, rbox(3.6, 1.6, 2.2, 0.6), M.dark, s + 0.6, 0.8, z);
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, z * 1.05], 1.25, M.cloth);
    limb(g, [s * 0.55, 3.4, z * 1.05], [s, 1.3, z], 1.1, M.skinDark);
    add(g, sph(1.25, 12, 10), M.paint, s * 0.55 + 0.3, 3.6, z * 1.05);
  }
  add(g, rbox(4.6, 3.2, 6.4, 1.2), M.cloth, 0, 6.6, 0);
  add(g, rbox(5.2, 6.4, 7, 1.6), M.trim, 0, 9.8, 0);
  add(g, rbox(1.4, 4.2, 5.2, 0.5), M.paint, 2.6, 10, 0);
  add(g, rbox(5.4, 0.8, 7.2, 0.3), M.dark, 0, 7.2, 0);
  for (const side of [-1, 1]) add(g, rbox(3.4, 2.4, 3.6, 0.9), M.paint, -0.2, 12.4, side * 3.9);
  add(g, rbox(3.2, 4.8, 5.4, 1), M.dark, -3.6, 10, 0);
  add(g, sph(0.5, 8, 6), M.lamp, -5.1, 11.8, 1.8);
  // arms and rifle
  limb(g, [0.6, 11, 3.6], [4.6, 8.8, 1.8], 1.05, M.paint);
  limb(g, [0.6, 11, -3.6], [6.2, 9.2, 0.6], 1.05, M.paint);
  add(g, rbox(9.5, 1.5, 1.3, 0.4), M.gunmetal, 5.6, 9.4, 1.2);
  add(g, cyl(0.38, 0.38, 4.5, 8), M.steel, 12.3, 9.6, 1.2, 0, 0, Math.PI / 2);
  add(g, rbox(1.2, 2.4, 0.9, 0.3), M.dark, 4.8, 8, 1.2);
  // helmet and visor
  add(g, sph(2.7, 18, 14), M.trim, 0.2, 13.4, 0);
  add(g, rbox(1, 1.4, 4.4, 0.45), M.glass, 2.6, 13.3, 0);
  g.scale.setScalar(1.12);
  return g;
}

export function vanguard(M, f) {
  const g = grp();
  const st = [0, 5, 0, -5][f % 4];
  for (const side of [-1, 1]) {
    const s = st * side, z = side * 10.5;
    const hip = [0, 12.5, side * 9.5], knee = [s * 0.55 + 3, 7.2, z], ankle = [s, 2.4, z];
    add(g, rbox(8.5, 2.6, 5.4, 1), M.dark, s + 1.2, 1.3, z);
    add(g, rbox(3, 1.4, 6, 0.5), M.steel, s + 5.4, 1.2, z);
    limb(g, hip, knee, 2.1, M.gunmetal);
    limb(g, knee, ankle, 1.8, M.steel);
    add(g, rbox(3.4, 3.6, 3.6, 1), M.paint, knee[0] + 0.4, knee[1] + 0.2, z);
    add(g, rbox(4.2, 5, 4.2, 1.2), M.paint, (hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2 + 0.5, z * 0.98);
    add(g, rbox(3, 1.2, 6, 0.4), M.hazard, s + 5.6, 2.4, z);
    add(g, sph(2.8, 16, 12), M.steel, ...hip);
  }
  add(g, plate([[-12, -9], [7, -10], [13, -5], [13, 5], [7, 10], [-12, 9], [-14.5, 0]], 6.5, 1.6), M.trim, 0, 11.5, 0);
  add(g, plate([[6, -7], [13.6, -4], [13.6, 4], [6, 7]], 6.9, 1.2), M.paint, 0, 11.4, 0);
  add(g, plate([[-9, -6], [5, -6.5], [9, -3], [9, 3], [5, 6.5], [-9, 6]], 2.4, 0.8), M.trim, 0, 18, 0);
  add(g, sph(4, 20, 14), M.glass, 6, 19.4, 0).scale.set(1.25, 0.3, 1);
  for (const side of [-1, 1]) {
    const z = side * 11.2;
    add(g, rbox(8, 5.4, 5.2, 1.4), M.paint, 1.5, 15.6, z);
    add(g, rbox(13, 3, 3, 1), M.gunmetal, 9, 15.6, z);
    add(g, cyl(1, 1, 8, 12), M.steel, 18.5, 15.6, z, 0, 0, Math.PI / 2);
    add(g, rbox(2.2, 2.6, 2.6, 0.6), M.dark, 22.5, 15.6, z);
  }
  add(g, rbox(6.5, 3.4, 7, 1), M.dark, -7.5, 21.2, 0);
  for (const dz of [-2.2, 0, 2.2]) add(g, cyl(0.9, 0.9, 1.2, 10), M.gunmetal, -4.4, 21.2, dz, 0, 0, Math.PI / 2);
  for (const side of [-1, 1]) {
    add(g, rbox(10, 1.2, 1.4, 0.4), M.hazard, -2, 18.4, side * 8.4);
    add(g, rbox(4, 2, 2.6, 0.6), M.dark, -10.5, 16.5, side * 6);          // exhausts
    add(g, cyl(0.8, 0.8, 2.2, 10), M.gunmetal, -12.8, 16.5, side * 6, 0, 0, Math.PI / 2);
    for (const x of [-6, -3, 0]) add(g, rbox(1.6, 0.6, 1.6, 0.2), M.steel, x, 18.2, side * 5.5);
  }
  for (const dz of [-2, 0, 2]) add(g, sph(0.7, 8, 6), M.lamp, -4.2, 21.8, dz);
  add(g, cyl(0.2, 0.2, 9, 6), M.steel, -11, 22, -5);
  for (const side of [-1, 1]) add(g, sph(0.9, 10, 8), M.white, 12.6, 13.4, side * 4);
  return g;
}

export const UNIT_MODELS = {
  harvester: { build: harvester, frames: 2, r: 15, h: 15 },
  trooper: { build: trooper, frames: 4, r: 13, h: 16 },
  vanguard: { build: vanguard, frames: 4, r: 24, h: 24 },
};
