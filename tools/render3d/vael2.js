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
  add(parent, sph(r * 0.62, 8, 6), M.deepCore, x, y, z);
  add(parent, sph(r * 1.7, 10, 8), M.deepHalo1, x, y, z);
  add(parent, sph(r * 2.5, 10, 8), M.deepHalo2, x, y, z);
  add(parent, sph(r * 3.4, 10, 8), M.deepHalo3, x, y, z);
}
/** A band over the back of a body round the x axis (a half torus in the yz plane, open side down). */
const saddle = (r, t, seg = 28) => memo(`sd${r},${t},${seg}`, () => { const g = new THREE.TorusGeometry(r, t, 8, seg, Math.PI); g.rotateY(Math.PI / 2); return g; });

/** Glint (worker): a fat pearl drop, its blunt tail to the stern (a team sleeve on its aft half, a pearl knob at its end), an ink belly beneath, one big deeplight at the
 *  tip in an ink socket; the team glaze saddle set back behind it, between two ink seams. Round from above, hovering
 *  low with its shadow right beneath it: not a dart. */
export function glint(M, f) {
  const g = grp(), b = grp(); b.position.y = 5 + (f % 2) * 0.7;
  add(b, sph(4.8, 22, 16), M.shellLight, 0, 0, 0).scale.set(1.05, 0.9, 1);                   // the drop's head, the lightest pearl: pale from above (a visible belly made it a dark blob, the Undertow)
  add(b, cone(4.0, 7, 16), M.shellLight, -6.4, 0.1, 0, 0, 0, Math.PI / 2).scale.set(1, 0.85, 1);  // its tail, blunt (7 long since step 1: in the white seat a short tail left a round eye, the Lens)
  add(b, sph(4.2, 18, 12), M.ink, 0.1, -2, 0).scale.set(0.95, 0.6, 0.82);                     // the ink belly, tucked under the head: seen from the side and the south, never from above
  add(b, sph(3.1, 18, 12), M.glaze, -1.7, 2.7, 0).scale.set(1.15, 0.55, 1.05);                 // the team patch: one smooth dome on the back, no bars; pearl shows round it
  add(b, sph(3.4, 18, 12), M.inkSeam, -1.7, 2.45, 0).scale.set(1.15, 0.5, 1.05);              // the ink seam round its edge, a thin ring
  add(b, sph(1.8, 12, 10), M.inkSeam, 4.3, 0.6, 0);                                           // the ink socket, small
  deeplight(b, M, 1.5, 4.9, 0.7, 0);                                                         // the one light, big and lit, at the tip
  add(b, sph(0.95, 8, 6), M.deepCore, 5.6, 0.9, 0);                                           // its pale heart, forward where the camera sees it
  add(b, sph(0.5, 8, 6), M.deepWhite, 6.1, 1.1, 0.5);                                          // a brighter centre that survives 1x
  add(b, cyl(1.1, 2.3, 2.6, 14), M.glaze, -7.9, 0.1, 0, 0, 0, Math.PI / 2);                   // the tail's team sleeve, the aft half of the tail
  add(b, cyl(2.5, 2.5, 0.35, 14), M.inkSeam, -6.5, 0.1, 0, 0, 0, Math.PI / 2);                // its ink seam
  add(b, sph(1.15, 10, 8), M.ring, -9.6, 0.1, 0);                                              // a pearl knob at the tail's end
  g.add(b); return g;
}

/** Lens (ranged): a disc of ink glass in a pearl rim, its deeplight in the middle, a thin pearl ring etched in the glass
 *  (a lens, not an eye); team glaze on two long arcs of the rim between ink seams and on the three pods that stand out
 *  beneath it. Never the Glint: a dark hollow with a bright centre against the Glint's solid pale drop. */
export function lens(M, f) {
  const g = grp(), b = grp(); b.position.y = 9 + (f % 2) * 0.7; b.rotation.z = -0.16;
  add(b, cyl(7.6, 7.6, 1.4, 40), M.ink, 0, 0, 0);                                           // the disc: the glass big and dark, the one "eye" (a narrow pupil in a wide pale rim read as a pebble, the Glint)
  ring(b, 5, 0.18, M.shellDeep, 0.72, { seg: 36 });                                           // the etched ring, faint
  ring(b, 7.9, 1.0, M.ring, 0, { seg: 44 });                                                  // the pearl rim, narrow
  ring(b, 7.9, 0.8, M.shellDark, -0.8, { seg: 44 });
  for (const a0 of [0.35, Math.PI + 0.35]) {                                                  // team arcs: bow and stern
    ring(b, 7.9, 1.1, M.glaze, 0.08, { arc: Math.PI * 0.56, a0, seg: 44 });
    ring(b, 7.9, 1.16, M.inkSeam, 0.1, { arc: 0.06, a0: a0 - 0.06, seg: 44 });                // ink seams at the arc's ends
    ring(b, 7.9, 1.16, M.inkSeam, 0.1, { arc: 0.06, a0: a0 + Math.PI * 0.56, seg: 44 });
    ring(b, 6.85, 0.25, M.inkSeam, 1.05, { arc: Math.PI * 0.56, a0, seg: 44 });               // and along its inner shoulder
  }
  deeplight(b, M, 1.3, 0, 1.3, 0);                                                           // the light in the middle
  for (let k = 0; k < 3; k++) {                                                               // three pods under the rim
    const a = k / 3 * Math.PI * 2 + Math.PI, x = Math.cos(a) * 8.5, z = Math.sin(a) * 8.5;
    add(b, rbox(3.2, 2.2, 2.6, 0.8), M.shell, x, -2, z, 0, -a, 0);
    add(b, rbox(2.8, 0.5, 2.3, 0.2), M.glaze, x * 1.05, -0.85, z * 1.05, 0, -a, 0);          // team cap
    add(b, rbox(3, 0.2, 2.5, 0.1), M.inkSeam, x * 1.05, -1.2, z * 1.05, 0, -a, 0);
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
  for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; add(g, rbox(2.2, 9, 1.4, 0.5), M.shellDark, Math.cos(a) * 47, 10.5, Math.sin(a) * 47, 0, -a, 0); } // pearl ribs round it
  add(g, cyl(44.4, 44.4, 0.6, 56), M.shellDeep, 0, 16.2, 0);                                  // its seam under the ring
  add(g, cyl(33.5, 33.5, 0.8, 48), M.pool, 0, 16.6, 0);                                       // the pool
  for (const r of [30, 25, 20, 11]) ring(g, r, 0.3, M.shellDeep, 17.05, { seg: 56 });              // ripples, faint pearl rings
  add(g, cyl(15, 15, 0.4, 40), M.poolDeep, 0, 17.1, 0);                                       // deeper at the centre
  add(g, cyl(33, 33, 0.25, 48), M.deepHalo2, 0, 17.4, 0);                                     // a faint sheen over it
  for (const a of [Math.PI / 2, -Math.PI / 6, -Math.PI * 5 / 6]) {                           // three short sluice channels from the pylons into the pool, stopping well short of the centre
    const x = Math.cos(a), z = Math.sin(a);
    add(g, rbox(11, 1.6, 4.6, 0.5), M.shellDark, x * 27, 17.4, z * 27, 0, -a, 0);
    add(g, rbox(10.6, 0.5, 2.4, 0.2), M.deeplight, x * 27, 18.2, z * 27, 0, -a, 0);          // the lit water in the channel
    add(g, rbox(2.6, 2.2, 5.4, 0.5), M.shell, x * 21.6, 17.8, z * 21.6, 0, -a, 0);            // its pearl mouth
  }
  deeplight(g, M, 1.6, -4, 18.2, 2);                                                         // a light adrift near the centre
  for (const [x, z, r] of [[-14, 12, 1.1], [15, -8, 1.0]]) deeplight(g, M, r, x, 18.2, z);   // lights adrift on the pool
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
    add(p, rbox(13, 6, 22, 1.5), M.shellDark, 0, 1, 0); add(p, rbox(11, 2, 19, 1), M.shell, 0, 4, 0); // a broad foot
    add(p, rbox(2.5, 5, 8, 0.5), M.ink, -5.5, 1.5, 0); add(p, rbox(1, 3, 6, 0.3), M.deeplight, -6.6, 1.6, 0); // the sluice, lit, onto the pool
    add(lean, rbox(8, 40, 16, 2.2), M.shell, 0, 22, 0);
    add(lean, rbox(3.6, 32, 11, 1.2), M.shellLight, 2.8, 20, 0);                               // outer plate
    add(lean, rbox(4, 0.5, 11.4, 0.15), M.shellDeep, 2.8, 20, 0);                              // seam
    add(lean, rbox(1.4, 28, 9, 0.8), M.glaze, -3.4, 22, 0);                                   // inner face glaze
    add(lean, rbox(1.6, 29, 0.5, 0.1), M.inkSeam, -3.5, 22, 4.75); add(lean, rbox(1.6, 29, 0.5, 0.1), M.inkSeam, -3.5, 22, -4.75); // ink edges
    add(lean, rbox(1.6, 0.5, 9.4, 0.1), M.inkSeam, -3.5, 36.3, 0); add(lean, rbox(1.6, 0.5, 9.4, 0.1), M.inkSeam, -3.5, 7.7, 0);
    add(lean, rbox(7.4, 2, 15.4, 0.6), M.ink, 0, 43, 0);                                       // ink cap
    add(lean, rbox(6, 0.6, 13, 0.2), M.glaze, 0, 44.2, 0);                                      // team on the cap
    deeplight(lean, M, 1.8, 0, 45.6, 0);
    g.add(p);
  }
  add(g, rbox(24, 4, 5, 1), M.ink, 0, 7.5, 50);                                               // the south gate
  add(g, rbox(20, 0.8, 1.2, 0.3), M.deeplight, 0, 9.8, 52);
  return g;
}
