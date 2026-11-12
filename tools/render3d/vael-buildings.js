// An older Expedition building look (STYLE.md, "Vael buildings"): pale pearl shells on an ink core, a few small lantern
// deeplights (vael-palette.js), team glaze between ink seams. One remains: `cradle` (kiln, a half-open shell), a
// fitTints reference (main.js); `tidewell` (conflux) is in vael2.js. Same conventions: game units (1 tile = 32), y up,
// +z south (towards the camera); a building's anchor is its footprint's center.
// The camera looks down at 55 degrees from the south: a face shows when its normal points up or south; a plate
// leaning towards the camera shows only its edge (its back faces down), so petals and lids open past the view angle.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, boxUV } from './models.js';
import { torus } from './vael.js';
import { deeplight } from './vael2.js';
import { VP } from './vael-palette.js';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
// ---- the family's own materials (colors: vael-palette.js): dark glass for faces and panes, the Cradle's basin and bud ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const A = {
    darkGlass: new THREE.MeshPhysicalMaterial({ color: VP.darkGlass, metalness: 0.5, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }), // the Glasshouse's panes
    petalGlass: new THREE.MeshPhysicalMaterial({ color: VP.petalGlass[0], emissive: VP.petalGlass[1], emissiveIntensity: 0.5, metalness: 0.35, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: VP.petalGlass[2] }), // the Sunpetal's faces: deep glass with a light sweep, never flat black
    violetWater: new THREE.MeshStandardMaterial({ color: VP.basin[0], emissive: VP.basin[1], emissiveIntensity: VP.basin[2], metalness: 0.35, roughness: 0.3 }), // the Cradle's basin: deep and lit (violet on the pearl palette), never black
    bud: new THREE.MeshPhysicalMaterial({ color: VP.bud[0], emissive: VP.bud[1], emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35, clearcoat: 0.8, sheen: 0.8, sheenColor: VP.bud[2] }), // the Cradle's bud: the light's color under a pale sheen
    mouth: new THREE.MeshStandardMaterial({ color: VP.mouth[0], emissive: VP.mouth[1], emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 }), // the Anemone's mouth: dark, lit from within
  };
  FAM.set(M, A); return A;
}
/** Three-lobed plinth outline (top view) of radius r, as the Tidewell's. */
const tri = (r, k = 0.55) => { const p = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = r * (1 - k * 0.5 + k * 0.5 * Math.cos(3 * a)); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
/** The family's plinth: a darker base plate and a pearl step, three-lobed. */
function plinth(g, M, r, k = 0.3) {
  add(g, plate(tri(r, k), 4, 1.5), M.shellDark, 0, 0, 0);
  add(g, plate(tri(r * 0.9, k), 3, 1.4), M.shell, 0, 3.5, 0);
}
/** A flat team ring between two ink seams (a rim, a collar's top), radius r, width w, at height y. */
function hoop(g, M, r, w, y, seg = 48) {
  add(g, torus(r, w / 2, Math.PI * 2, seg), M.glaze, 0, y, 0, Math.PI / 2, 0, 0);
  add(g, torus(r + w / 2 + 0.25, 0.35, Math.PI * 2, seg), M.inkSeam, 0, y + 0.1, 0, Math.PI / 2, 0, 0);
  add(g, torus(r - w / 2 - 0.25, 0.35, Math.PI * 2, seg), M.inkSeam, 0, y + 0.1, 0, Math.PI / 2, 0, 0);
}
/** A petal outline rooted at the origin, `l` long along +x and `w` wide; `k` narrows it towards the tip. */
const petal = (l, w, n = 16, k = 0) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = l / 2 - Math.cos(a) * l / 2; p.push([x, Math.sin(a) * w / 2 * (1 - k * x / l)]); } return p; };
/** A flat ribbon along a helix round the y axis (`turns` from radius r0 to r1, geometric or linear with `lin`, y0 to y1, from angle a0),
 *  `w0` to `w1` wide across the radius and `t` thick; four strips with hard edges, so its top face takes the light. */
function ribbon(H, w0, w1, t, seg = 120) {
  return memo(`rib${JSON.stringify([H, w0, w1, t, seg])}`, () => {
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, a = H.a0 + u * H.turns * Math.PI * 2, r = H.lin ? H.r0 + (H.r1 - H.r0) * u : H.r0 * (H.r1 / H.r0) ** u, hw = w0 * (w1 / w0) ** u / 2;
      const P = [Math.cos(a) * r, H.y0 + (H.y1 - H.y0) * u, -Math.sin(a) * r], R = [Math.cos(a), 0, -Math.sin(a)];
      const c = (sr, sy) => [P[0] + R[0] * sr * hw, P[1] + sy * t / 2, P[2] + R[2] * sr * hw];
      const TO = c(1, 1), TI = c(-1, 1), BI = c(-1, -1), BO = c(1, -1);
      for (const [p, q] of [[TO, TI], [TI, BI], [BI, BO], [BO, TO]]) pos.push(...p, ...q);        // top, inner side, bottom, outer side
    }
    for (let i = 0; i < seg; i++) for (let s = 0; s < 4; s++) { const p = i * 8 + s * 2, q = p + 1, r = p + 8, w = q + 8; idx.push(p, q, r, q, w, r); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const ix = g.getIndex(); for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i); ix.setX(i, ix.getX(i + 1)); ix.setX(i + 1, a); } g.computeVertexNormals(); } // the top face must face up
    return boxUV(g);
  });
}

/** Cradle (trains the line, 3x3): a scallop shell with something growing in it: a fan-shaped bowl, its flat hinge
 *  a team bar across the north, pearl flutes splaying from the hinge across the bowl's floor to a ridged rim wall
 *  (a knob on each ridge); the basin dark amber water (`violetWater`, an old name, never black); in it one big bud, horn
 *  under a pearl sheen with a pearl crown and a faint glow, and one deeplight at its foot. From above: a pale fan
 *  of ribs on dark water, a bud at its heart; the Darkwater beside it is a flat ink pool with low thin arms. */
export function cradle(M) {
  const g = grp(), A = fam(M);
  plinth(g, M, 40, 0.2);
  const C = [0, 4], R = 30, A0 = -0.5, A1 = Math.PI + 0.5, N = 15, HZ = C[1] - 31, HW = 15;        // the fan: an arc of 237 degrees round C, closed to the north by a flat hinge 30 wide
  const fan = (k) => { const p = []; for (let i = 0; i <= 28; i++) { const a = A0 + (A1 - A0) * i / 28; p.push([C[0] + Math.cos(a) * R * k, C[1] + Math.sin(a) * R * k]); } p.push([-HW * k, C[1] + (HZ - C[1]) * k], [HW * k, C[1] + (HZ - C[1]) * k]); return p; };
  add(g, plate(fan(1.06), 5, 1), M.shellDark, 0, 4, 0);                                          // the bowl's floor, pearl in shade
  add(g, plate(fan(0.97), 1.2, 0.3), A.violetWater, 0, 8.6, 0);                                  // the basin: dark amber water
  for (let i = 0; i < 9; i++) {                                                                  // the flutes: pearl ribs splaying from the hinge across the floor to the rim
    const a = A0 + 0.15 + (A1 - A0 - 0.3) * i / 8, x0 = 0, z0 = HZ + 3, x1 = C[0] + Math.cos(a) * (R - 1.5), z1 = C[1] + Math.sin(a) * (R - 1.5);
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
    add(g, rbox(len, 1.6, 2.2, 0.6), M.shell, (x0 + x1) / 2, 9.6, (z0 + z1) / 2, 0, ry, 0);
  }
  add(g, torus(R, 3.2, A1 - A0, 48), M.shell, C[0], 12.2, C[1], Math.PI / 2, 0, A0);              // the rim wall round the arc
  add(g, torus(R - 0.4, 1.4, A1 - A0, 48), M.glaze, C[0], 15.4, C[1], Math.PI / 2, 0, A0);         // a team hoop along its crest
  add(g, torus(R + 1.4, 0.4, A1 - A0, 48), M.inkSeam, C[0], 15.3, C[1], Math.PI / 2, 0, A0); add(g, torus(R - 2.2, 0.4, A1 - A0, 48), M.inkSeam, C[0], 15.3, C[1], Math.PI / 2, 0, A0); // ink seams either side of it
  add(g, torus(R + 1.2, 2.4, A1 - A0, 48), M.glaze, C[0], 6.8, C[1], Math.PI / 2, 0, A0);         // the team band round the wall's foot
  add(g, torus(R + 1.8, 0.5, A1 - A0, 48), M.inkSeam, C[0], 9.4, C[1], Math.PI / 2, 0, A0);
  add(g, torus(R + 1.8, 0.5, A1 - A0, 48), M.inkSeam, C[0], 4.4, C[1], Math.PI / 2, 0, A0);
  for (let i = 0; i < N; i++) {                                                                  // the wall's ridges, leaning out, a knob on each
    const a = A0 + (A1 - A0) * (i + 0.5) / N, f = grp(); f.position.set(C[0] + Math.cos(a) * (R + 2.4), 11, C[1] + Math.sin(a) * (R + 2.4)); f.rotation.y = -a; g.add(f);
    add(f, rbox(2.6, 9.5, 3, 0.9), M.shellLight, 0, 0, 0, 0, 0, -0.22);
    add(f, sph(1.7, 10, 8), M.ring, -1.2, 5.4, 0);
  }
  for (const side of [-1, 1]) {                                                                  // the straight edges from the arc's ends to the hinge, team-capped
    const ax = C[0] + Math.cos(A0) * R * side, az = C[1] + Math.sin(A0) * R, bx = side * HW, bz = HZ, ry = -Math.atan2(bz - az, bx - ax), len = Math.hypot(bx - ax, bz - az);
    add(g, rbox(len, 9, 3.4, 1.2), M.shell, (ax + bx) / 2, 10.5, (az + bz) / 2, 0, ry, 0);
    add(g, rbox(len, 2.2, 3.8, 0.5), M.glaze, (ax + bx) / 2, 15.2, (az + bz) / 2, 0, ry, 0); add(g, rbox(len + 0.2, 0.5, 4, 0.2), M.inkSeam, (ax + bx) / 2, 13.9, (az + bz) / 2, 0, ry, 0);
  }
  add(g, rbox(2 * HW + 4, 11, 8, 2), M.glaze, 0, 9.5, HZ - 1);                                   // the hinge: a flat team bar across the north
  add(g, rbox(2 * HW + 4.4, 0.6, 8.4, 0.2), M.inkSeam, 0, 4.3, HZ - 1); add(g, rbox(2 * HW + 4.4, 0.6, 8.4, 0.2), M.inkSeam, 0, 14.9, HZ - 1);
  add(g, rbox(2 * HW, 2.2, 6, 0.7), M.ink, 0, 16, HZ - 1); add(g, rbox(2 * HW - 6, 1.2, 4, 0.5), M.ring, 0, 17.6, HZ - 1); // an ink cap, a pearl ridge
  const bud = grp(); bud.position.set(-2, 10, 3); g.add(bud);                                   // the bud: big, an egg standing in the water
  add(bud, sph(8, 20, 16), A.bud, 0, 6, 0).scale.set(1, 1.3, 1);                                 // horn under a pale sheen
  add(bud, sph(6.6, 18, 14), M.shellLight, 0, 11.2, 0).scale.set(1, 1.05, 1);                    // its pearl crown, the top half
  add(bud, sph(10.5, 14, 10), M.deepHalo2, 0, 6, 0).scale.set(1, 1.2, 1);                        // a faint glow round it
  add(bud, cyl(4.6, 5.2, 1.4, 16), M.glaze, 0, 17.6, 0); add(bud, cyl(5.3, 5.3, 0.5, 16), M.inkSeam, 0, 16.7, 0); add(bud, sph(2.4, 10, 8), M.ring, 0, 18.9, 0); // a team collar under a pearl tip
  deeplight(g, M, 1.5, 8, 10.6, 11);                                                             // the one light, at the bud's foot
  return g;
}
