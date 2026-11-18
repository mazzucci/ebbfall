// The shared builders every model uses: primitives in game units (1 tile = 32). Units face +x at rotation 0; y is up,
// +z is south; `mats` carries the team's paint.
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
/** The strike poses seen from behind (retheme.js STRIKE_POSES: the builders get the sprite's facing `dir` for them,
 *  11-13 the unit walking away from the camera): a weapon thrust or chopped straight ahead moves in depth there,
 *  behind the body, and the strike read like the wind-up. The yaw (a rotation.y for the weapon group, applied after
 *  its tilt) that swings the strike out to one side so it crosses the screen as a diagonal: 0 at every other facing,
 *  and for the walk, which passes no `dir`. At 12 and 13 (straight away, and turned to the right) to the unit's
 *  right (negative: local +z, screen-right from behind), at 12 the larger swing; at 11 (turned to the left) to its
 *  left, the mirror of 13, so the blow points the way the unit faces and the side flips at 12, straight away, not
 *  between 10 and 11 (the designer, 2026-11-15: to the right at 11 it pointed some 70 degrees off the target). The
 *  Rider, the Sellsword and the Bruiser swing farther at 11 (their builders): this small swing left their weapons
 *  behind the body there. */
export const awayYaw = (dir) => (dir === 11 ? 0.175 : dir === 12 ? -0.525 : dir === 13 ? -0.175 : 0);
/** The point `d` units from `a` towards `b` (arrays): a cuff a step up a forearm from a moved hand. */
export const toward = (a, b, d) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1; return a.map((v, i) => v + (b[i] - v) / L * d); };
/** A capsule from point a to point b (THREE.Vector3-like arrays). */
export function limb(parent, a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const m = new THREE.Mesh(memo(`cap${r},${len.toFixed(2)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.01, len), 6, 12)), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m); return m;
}
