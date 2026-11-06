// The Vael's new look (STYLE.md): pale pearl shells on an ink core, violet-blue "deeplight" in a few small lights.
// Step 0's slice: the Glint (lumen), the Lens (prism) and the Tidewell (conflux). Same conventions as vael.js: game
// units, units face +x, y up, +z south; everything hovers. Team glaze sits between thin ink seams, so a white seat
// still parts from the pearl.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate } from './models.js';
import { ring, torus, cone } from './vael.js';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const tri = (r, k = 0.55) => { const p = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = r * (1 - k * 0.5 + k * 0.5 * Math.cos(3 * a)); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
/** A small deeplight: a violet-blue bead with a white heart and a soft falloff. */
export function deeplight(parent, M, r, x, y, z) {
  add(parent, sph(r, 10, 8), M.deeplight, x, y, z);
  add(parent, sph(r * 0.5, 8, 6), M.deepCore, x, y, z);
  add(parent, sph(r * 1.7, 10, 8), M.deepHalo1, x, y, z);
  add(parent, sph(r * 2.5, 10, 8), M.deepHalo2, x, y, z);
  add(parent, sph(r * 3.4, 10, 8), M.deepHalo3, x, y, z);
}
/** A band over the back of a body round the x axis (a half torus in the yz plane, open side down). */
const saddle = (r, t, seg = 28) => memo(`sd${r},${t},${seg}`, () => { const g = new THREE.TorusGeometry(r, t, 8, seg, Math.PI); g.rotateY(Math.PI / 2); return g; });

/** Glint (worker): a pearl drop, its tail to the stern, an ink belly beneath, one deeplight at its tip; a broad team
 *  glaze saddle across its back between two ink seams, team on the side vanes too. */
export function glint(M, f) {
  const g = grp(), b = grp(); b.position.y = 6 + (f % 2) * 0.8;
  add(b, sph(4.6, 22, 16), M.shell, 0, 0, 0).scale.set(1.12, 0.92, 1);                       // the drop's head
  add(b, cone(4.2, 9, 16), M.shell, -7.2, 0.2, 0, 0, 0, Math.PI / 2);                        // its tail, apex to the stern
  add(b, sph(4.3, 18, 12), M.ink, 0.2, -1.3, 0).scale.set(1.25, 0.72, 0.98);                 // the ink belly
  add(b, cone(3.6, 7, 14), M.ink, -6.2, -1.3, 0, 0, 0, Math.PI / 2).scale.set(1, 0.6, 1);
  add(b, saddle(4.55, 1.3), M.glaze, -0.6, 0, 0).scale.set(1, 0.95, 1.02);                   // the team saddle
  add(b, saddle(4.62, 0.28), M.inkSeam, 0.85, 0, 0).scale.set(1, 0.95, 1.02);                // ink seams either side of it
  add(b, saddle(4.62, 0.28), M.inkSeam, -2.05, 0, 0).scale.set(1, 0.95, 1.02);
  deeplight(b, M, 0.95, 5.2, 0.3, 0);                                                        // the one light, at the tip
  add(b, rbox(4.6, 2.8, 0.8, 0.3), M.glaze, -6.5, 3.2, 0, 0, 0, 0.3);                         // tail fin (team)
  add(b, rbox(4.8, 0.3, 1, 0.1), M.inkSeam, -6.5, 1.9, 0, 0, 0, 0.3);                         // its ink root
  for (const side of [-1, 1]) {
    add(b, rbox(3.6, 0.7, 3, 0.3), M.glaze, -1.4, 0.4, side * 5.3, side * 0.25, 0, 0);       // side vanes (team)
    add(b, rbox(3.8, 0.25, 0.8, 0.1), M.inkSeam, -1.4, 0.4, side * 4.1, side * 0.25, 0, 0);
  }
  g.add(b); return g;
}

/** Lens (ranged): a disc of ink glass in a pearl rim, its deeplight in the middle; team glaze on two long arcs of
 *  the rim between ink seams and on the three pods that stand out beneath the rim. Never the Glint: a dark hollow
 *  with a bright centre against the Glint's solid pale drop. */
export function lens(M, f) {
  const g = grp(), b = grp(); b.position.y = 9 + (f % 2) * 0.7; b.rotation.z = -0.16;
  add(b, cyl(8.4, 8.4, 1.4, 40), M.ink, 0, 0, 0);                                           // the disc
  add(b, cyl(5.2, 5.2, 0.3, 32), M.poolDeep, 0, 0.72, 0);                                   // a deeper pool at its heart
  ring(b, 8.9, 1.5, M.ring, 0, { seg: 44 });                                                  // the pearl rim
  ring(b, 8.9, 1.0, M.shellDark, -0.9, { seg: 44 });
  for (const a0 of [0.35, Math.PI + 0.35]) {                                                  // team arcs: bow and stern
    ring(b, 8.9, 1.62, M.glaze, 0.08, { arc: Math.PI * 0.56, a0, seg: 44 });
    ring(b, 8.9, 1.7, M.inkSeam, 0.1, { arc: 0.05, a0: a0 - 0.05, seg: 44 });                 // ink seams at the arc's ends
    ring(b, 8.9, 1.7, M.inkSeam, 0.1, { arc: 0.05, a0: a0 + Math.PI * 0.56, seg: 44 });
    ring(b, 7.3, 0.3, M.inkSeam, 1.45, { arc: Math.PI * 0.56, a0, seg: 44 });                 // and along its inner shoulder
  }
  deeplight(b, M, 1.5, 0, 1.4, 0);                                                           // the light in the middle
  for (let k = 0; k < 3; k++) {                                                               // three pods under the rim
    const a = k / 3 * Math.PI * 2 + Math.PI, x = Math.cos(a) * 9.6, z = Math.sin(a) * 9.6;
    add(b, rbox(3.6, 2.4, 3, 0.8), M.shell, x, -2.2, z, 0, -a, 0);
    add(b, rbox(3.2, 0.5, 2.6, 0.2), M.glaze, x * 1.05, -0.95, z * 1.05, 0, -a, 0);          // team cap
    add(b, rbox(3.4, 0.2, 2.8, 0.1), M.inkSeam, x * 1.05, -1.3, z * 1.05, 0, -a, 0);
  }
  g.add(b); return g;
}

/** Tidewell (core, 4x4): a pearl ring round a pool of deeplight, raised on an ink drum over a three-lobed pearl
 *  plinth; three pearl pylons lean out from its rim, one to the north, their inner faces glazed; three team arcs on
 *  the ring between ink seams; a few small lights floating on the pool. */
export function tidewell(M) {
  const g = grp();
  add(g, plate(tri(62, 0.22), 4, 1.5), M.shellDark, 0, 0, 0);
  add(g, plate(tri(56, 0.22), 3, 1.4), M.shell, 0, 3.5, 0);
  add(g, cyl(44, 49, 10, 56), M.ink, 0, 11, 0);                                               // the ink drum
  add(g, cyl(44.4, 44.4, 0.6, 56), M.shellDeep, 0, 16.2, 0);                                  // its seam under the ring
  add(g, cyl(33.5, 33.5, 0.8, 48), M.pool, 0, 16.6, 0);                                       // the pool
  add(g, cyl(18, 18, 0.4, 40), M.poolDeep, 0, 17.1, 0);                                       // deeper at the centre
  add(g, cyl(33, 33, 0.25, 48), M.deepHalo2, 0, 17.4, 0);                                     // a faint sheen over it
  for (const [x, z, r] of [[-12, 14, 1.3], [16, -6, 1.1], [-6, -16, 1.0]]) deeplight(g, M, r, x, 18.2, z); // lights adrift on the pool
  ring(g, 40, 7, M.ring, 20, { seg: 72 });                                                    // the ring
  ring(g, 40, 7.2, M.shellDark, 18.6, { seg: 72 });                                           // its underside
  for (let k = 0; k < 3; k++) {                                                               // team arcs
    const a0 = k / 3 * Math.PI * 2 + 0.25, arc = Math.PI * 0.5;
    ring(g, 41, 6, M.glaze, 22, { arc, a0, seg: 72 });                                     // over the ring's top and outer shoulder
    for (const e of [a0 - 0.03, a0 + arc]) ring(g, 41, 6.1, M.inkSeam, 22, { arc: 0.03, a0: e, seg: 72 });
    ring(g, 35.8, 0.6, M.inkSeam, 25.6, { arc, a0, seg: 72 });                                  // ink along its inner edge
  }
  for (let k = 0; k < 3; k++) {                                                               // the pylons
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, p = grp(); p.position.set(Math.cos(a) * 52, 6, Math.sin(a) * 52); p.rotation.y = -a;
    const lean = grp(); lean.rotation.z = -0.2; p.add(lean);                                   // leaning outward
    add(lean, rbox(7, 42, 15, 2.2), M.shell, 0, 21, 0);
    add(lean, rbox(3.6, 32, 11, 1.2), M.shellLight, 2.8, 20, 0);                               // outer plate
    add(lean, rbox(4, 0.5, 11.4, 0.15), M.shellDeep, 2.8, 20, 0);                              // seam
    add(lean, rbox(1.4, 28, 9, 0.8), M.glaze, -3.4, 22, 0);                                   // inner face glaze
    add(lean, rbox(1.6, 29, 0.5, 0.1), M.inkSeam, -3.5, 22, 4.75); add(lean, rbox(1.6, 29, 0.5, 0.1), M.inkSeam, -3.5, 22, -4.75); // ink edges
    add(lean, rbox(1.6, 0.5, 9.4, 0.1), M.inkSeam, -3.5, 36.3, 0); add(lean, rbox(1.6, 0.5, 9.4, 0.1), M.inkSeam, -3.5, 7.7, 0);
    add(lean, rbox(7.4, 2, 15.4, 0.6), M.ink, 0, 43, 0);                                       // ink cap
    add(lean, rbox(6, 0.6, 13, 0.2), M.glaze, 0, 44.2, 0);                                      // team on the cap
    deeplight(lean, M, 1.3, 0, 45.2, 0);
    g.add(p);
  }
  add(g, rbox(24, 4, 5, 1), M.ink, 0, 7.5, 50);                                               // the south gate
  add(g, rbox(20, 0.8, 1.2, 0.3), M.deeplight, 0, 9.8, 52);
  return g;
}
