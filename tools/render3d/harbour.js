// The Harbour (the Humans' new look, STYLE.md): dark hulls of tar and iron under pale canvas; timber, rope and brass
// only on small tips. Step 0's slice: the Lighthouse (core); the Rigger and the Picket moved to harbour-infantry.js with
// the rest of the infantry. Same conventions as models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate } from './models.js';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
export const lathe = (pts, seg = 20) => memo(`hl${JSON.stringify(pts)},${seg}`, () => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.computeVertexNormals(); return g; });
export const torus = (r, t, seg = 24, arc = Math.PI * 2) => memo(`ht${r},${t},${seg},${arc}`, () => new THREE.TorusGeometry(r, t, 8, seg, arc));
/** A half-cylinder shell (an upturned hull) with its axis along z, open side down. */
const hull = (r, len, seg = 20) => memo(`hh${r},${len},${seg}`, () => { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return g; });
const oct = (r, k = 0.42) => { const c = r * k; return [[-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c]]; };

/** Lighthouse (core, 4x4): a tapered tarred tower with iron bands and a team band, a lantern room (pale glass in a
 *  dark cage, a warm lamp inside) under a canvas cone; a keeper's house roofed with an upturned hull under lashed
 *  canvas, every other panel team-painted, its end wall team; a flagstone quay with a timber jetty under team
 *  sailcloth, crates under a lashed tarp, bollards, coils, a pennant. Tower at the east, house at the west. */
export function lighthouse(M) {
  const g = grp();
  add(g, plate(oct(62), 4, 1.2), M.flagstone, 0, 0, 0);
  for (let k = 0; k < 10; k++) { add(g, rbox(2.4, 2.4, 2.4, 0.3), M.slate, -58 + k * 13, 5, 58 - (k % 3)); add(g, rbox(2.5, 0.6, 2.5, 0.1), M.paintCanvas, -58 + k * 13, 6.4, 58 - (k % 3)); } // mooring posts along the south edge, their tops painted
  // the keeper's house
  const HX = -32, HZ = -6, HL = 72;
  add(g, rbox(30, 14, HL, 1), M.timber, HX, 11, HZ);                                                // timber walls
  for (const z of [-30, -10, 10, 30]) add(g, rbox(30.4, 14, 1.2, 0.3), M.tar, HX, 11, HZ + z);       // tarred ribs
  add(g, rbox(31, 1.6, HL + 1, 0.4), M.ironDark, HX, 4.8, HZ);                                      // plinth band
  add(g, hull(16, HL), M.tar, HX, 18, HZ);                                                          // the upturned hull roof
  add(g, rbox(2.2, 2.2, HL + 2, 0.6), M.timber, HX, 34.5, HZ);                                      // keel
  for (let k = 0; k < 6; k++) add(g, hull(16.5, 9.4), k % 2 ? M.canvas : M.paintCanvas, HX, 18.2, HZ - 25 + k * 10); // lashed canvas panels, pale and team alternating at equal width
  for (let k = 0; k <= 6; k++) add(g, torus(16.9, 0.5, 32, Math.PI), M.rope, HX, 18.2, HZ - 30 + k * 10, 0, 0, 0); // the lashings between them
  for (let k = 0; k <= 6; k++) add(g, hull(16.75, 1.2), M.inkLine, HX, 18.2, HZ - 30 + k * 10);     // ink where the panels meet
  add(g, rbox(5, 7, 5, 0.6), M.ironDark, HX - 8, 36, HZ - 24); add(g, rbox(5.6, 1.4, 5.6, 0.4), M.slate, HX - 8, 40, HZ - 24); // chimney
  add(g, new THREE.CircleGeometry(15.4, 24, 0, Math.PI), M.paintCanvas, HX, 18.2, HZ + HL / 2 + 0.3); // the south end wall under the hull: team
  add(g, new THREE.CircleGeometry(15.8, 24, 0, Math.PI), M.inkLine, HX, 18.2, HZ + HL / 2 + 0.1);
  add(g, rbox(9, 9, 1.2, 0.4), M.oilskin, HX + 2, 9, HZ + HL / 2 + 0.9);                             // south door
  add(g, rbox(14, 0.6, 8, 0.2), M.paintCanvas, HX + 2, 15.5, HZ + HL / 2 + 3.5, 0.3);                 // the porch's team canvas
  add(g, rbox(14.3, 0.3, 8.3, 0.1), M.inkLine, HX + 2, 15.1, HZ + HL / 2 + 3.5, 0.3);
  for (const x of [-10, 10]) add(g, rbox(4, 4, 1, 0.3), M.canvasDark, HX + x, 11, HZ + HL / 2 + 0.9); // windows, shuttered
  // the tower: tapered, tarred, banded; the gallery; the lantern room; the cone
  const TX = 20, TZ = -10;
  add(g, cyl(20, 22, 6, 32), M.slate, TX, 7, TZ);
  add(g, cyl(11.5, 18.5, 34, 32), M.tar, TX, 25, TZ);                                                // the tarred shaft
  for (const [y, r] of [[12, 17.7], [18, 16.5]]) add(g, cyl(r + 0.5, r + 0.6, 1.6, 32), M.ironDark, TX, y, TZ); // iron bands
  add(g, cyl(12.2, 15, 18, 32), M.paintCanvas, TX, 32, TZ);                                          // the team band
  add(g, cyl(15.3, 15.3, 0.8, 32), M.inkLine, TX, 22.8, TZ); add(g, cyl(12.5, 12.5, 0.8, 32), M.inkLine, TX, 41.2, TZ); // ink rings
  add(g, torus(24.5, 1.8, 48), M.slate, TX, 4.4, TZ, Math.PI / 2, 0, 0);                             // a raised stone kerb round the tower's foot
  add(g, torus(23.1, 0.45, 48), M.slateLit, TX, 5.9, TZ, Math.PI / 2, 0, 0);                          // its lit inner top edge
  add(g, torus(24.5, 1.1, 48), M.paintCanvas, TX, 5.6, TZ, Math.PI / 2, 0, 0).scale.z = 0.45;         // the band on its top face only
  add(g, cyl(14.3, 12.3, 0.6, 32), M.paintCanvas, TX, 43.9, TZ);                                      // the gallery's deck painted team
  add(g, cyl(14.5, 14.5, 0.4, 32), M.inkLine, TX, 43.8, TZ);
  add(g, cyl(14.2, 12.4, 2.2, 32), M.ironDark, TX, 42.6, TZ);                                         // gallery deck
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; add(g, cyl(0.3, 0.3, 4, 6), M.ironDark, TX + Math.cos(a) * 13.6, 45.6, TZ + Math.sin(a) * 13.6); }
  add(g, torus(13.6, 0.3, 36), M.ironDark, TX, 47.6, TZ, Math.PI / 2, 0, 0);                        // rail
  add(g, cyl(9.2, 9.8, 1.6, 24), M.ironDark, TX, 44.5, TZ);                                           // lantern-room floor
  add(g, cyl(8.2, 8.2, 12, 24), M.lanternPane, TX, 51.3, TZ);                                         // the lantern room: glass, see-through
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; add(g, rbox(0.6, 12.4, 0.6, 0.2), M.ironDark, TX + Math.cos(a) * 8.3, 51.3, TZ + Math.sin(a) * 8.3, 0, -a, 0); } // the cage
  for (const y of [45.6, 57]) add(g, cyl(8.5, 8.5, 0.6, 24), M.ironDark, TX, y, TZ);                  // its rails
  add(g, sph(4.8, 16, 12), M.lampHot, TX, 51.6, TZ);                                                  // the lamp: the brightest Harbour pixel
  add(g, sph(2.4, 12, 8), M.lampCore, TX, 52, TZ + 3.8);                                               // its near-white core on the south face, where the camera looks: 3 px at phone size
  add(g, sph(3.6, 12, 8), M.lampAmber, TX, 52, TZ + 3.8);                                              // a tight amber halo round it, 1 px at phone size
  add(g, sph(6.4, 16, 12), M.lampHalo, TX, 51.6, TZ); add(g, sph(8.6, 16, 12), M.lampHalo2, TX, 51.6, TZ); // its warm halo
  add(g, cyl(2.4, 3, 2, 12), M.brass, TX, 46.2, TZ);                                                   // the lamp's brass foot
  add(g, cyl(8.8, 8.8, 1.2, 24), M.ironDark, TX, 57.9, TZ);
  add(g, new THREE.ConeGeometry(8.6, 5, 24), M.canvasShade, TX, 61, TZ);                              // the canvas cone, a band below pale canvas and below the lamp; no overhang, so the lamp shows under it
  add(g, cyl(0.4, 0.4, 3, 6), M.brass, TX, 64.5, TZ); add(g, sph(0.6, 8, 6), M.brass, TX, 66.1, TZ); // finial
  add(g, rbox(8, 10, 1.2, 0.4), M.oilskin, TX, 11, TZ + 21.6);                                       // the tower's door, facing south
  // the quay: a timber jetty south-east under team sailcloth, bollards, rope coils, crates under a lashed tarp, a pennant
  add(g, rbox(44, 2.4, 16, 0.4), M.timber, 30, 5, 48);
  for (let x = 10; x <= 50; x += 5) add(g, rbox(0.8, 2.6, 16.4, 0.2), M.oilskin, x, 5, 48);           // plank seams
  for (const [x, z] of [[14, 42], [36, 42], [50, 54]]) { add(g, cyl(1.6, 2, 4, 10), M.ironDark, x, 8, z); add(g, sph(1.7, 10, 8), M.ironDark, x, 10, z); }
  for (const [x, z, r] of [[-50, 44, 4], [48, 20, 3.4], [-6, 50, 3]]) add(g, torus(r, 1.3, 20), M.rope, x, 5.2, z, Math.PI / 2, 0, 0); // coils on the quay
  add(g, cyl(0.6, 0.8, 34, 8), M.timber, 52, 21, -46);                                                // mast
  add(g, plate([[0, -4.5], [16, -1.2], [16, 1.2], [0, 4.5]], 0.5, 0.15), M.paintCanvas, 52, 35, -46, 0, 0, Math.PI / 2); // the pennant
  for (const [x, z, n] of [[-46, -46, 3], [-44, 44, 2]]) {                                            // crates, stacked, under a lashed tarp
    for (let k = 0; k < n; k++) { add(g, rbox(10 - k * 1.5, 5, 10 - k * 1.5, 0.4), M.timber, x + k * 0.8, 6.5 + k * 5, z - k * 0.6); add(g, rbox(10.3 - k * 1.5, 0.8, 10.3 - k * 1.5, 0.2), M.ironDark, x + k * 0.8, 6.5 + k * 5, z - k * 0.6); }
    add(g, rbox(13, 1, 13, 0.5), M.paintCanvas, x + (n - 1) * 0.8, 4.5 + n * 5, z - (n - 1) * 0.6);
    add(g, rbox(13.3, 0.4, 13.3, 0.2), M.inkLine, x + (n - 1) * 0.8, 3.8 + n * 5, z - (n - 1) * 0.6);
    for (const dz of [-3, 3]) add(g, rbox(0.5, 1.4, 12.4, 0.15), M.rope, x + (n - 1) * 0.8 + dz, 4.6 + n * 5, z - (n - 1) * 0.6);
  }
  for (const [x, z] of [[14, 36], [50, 36], [14, 60], [50, 60]]) add(g, cyl(0.7, 0.7, 20, 8), M.timber, x, 14, z); // the jetty's awning on four posts
  for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) {                                            // sailcloth: two stripes, pale and team, each folded over three sags between the spars
    const x = 12 + k * 20 + j * 6.67 + 3.33, tilt = j === 1 ? 0 : (j ? -1 : 1) * 0.16;
    add(g, rbox(6.9, 0.8, 26, 0.3), k ? M.paintCanvas : M.canvas, x, 23.6 - (j === 1 ? 0.9 : 0), 48, 0.12, 0, tilt);
  }
  add(g, rbox(0.6, 1.4, 27, 0.2), M.rope, 32, 24.2, 48, 0.12);                                          // the seam between them, roped
  add(g, rbox(41, 0.4, 27.5, 0.2), M.inkLine, 32, 22.6, 48, 0.12);                                      // the ink hem under it
  add(g, rbox(2, 2, 30, 0.3), M.timber, 12, 24.4, 48, 0.12); add(g, rbox(2, 2, 30, 0.3), M.timber, 52, 24.4, 48, 0.12); // its spars
  return g;
}
