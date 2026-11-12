// An older building model kept as a fitTints reference (main.js): the Garrison. Buildings are centered on their footprint
// (1 tile = 32 units).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, boxUV } from './models.js';

let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

/** Half-cylinder shell (a vault / quonset roof) with its axis along z, open side down; length along z. */
function vault(r, len, seg = 24) { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return boxUV(g); }
/** Vertical half-disc (a vault's end wall) facing +z. */
function halfDisc(r, seg = 24) { return new THREE.CircleGeometry(r, seg, 0, Math.PI); }

/** Garrison (barracks): three ribbed bunk vaults with team-color doors opening onto a parade yard with a flag. */
export function barracks(M) {
  const g = grp();
  add(g, rbox(92, 3, 92, 1), M.concrete, 0, 1.5, 0);
  const R = 12, L = 52, ZC = -14;                                                                   // vault radius, length, center z
  for (const x of [-28, 0, 28]) {
    add(g, rbox(2 * R + 2, 3, L + 2, 0.6), M.dark, x, 4, ZC);                                      // plinth
    add(g, vault(R, L), M.khaki, x, 5.5, ZC);
    for (let k = -2; k <= 2; k++) add(g, vault(R + 0.7, 1.8), M.steel, x, 5.5, ZC + k * 11);        // ribs
    add(g, rbox(5, 1.2, L - 4, 0.4), M.paint, x, 5.5 + R + 0.2, ZC);                                 // team ridge stripe
    add(g, halfDisc(R), M.paint, x, 5.5, ZC + L / 2 + 0.2);                                          // south end wall (team)
    add(g, halfDisc(R), M.trim, x, 5.5, ZC - L / 2 - 0.2, 0, Math.PI, 0);                            // north end wall
    add(g, rbox(8, 9, 1.4, 0.5), M.dark, x, 9.5, ZC + L / 2 + 0.8);                                  // door
    add(g, rbox(9.4, 1.2, 0.8, 0.3), M.hazard, x, 14.6, ZC + L / 2 + 0.9);
    add(g, sph(1.1, 8, 6), M.white, x, 16.5, ZC + L / 2 + 1.2);
    add(g, rbox(4, 2, 5, 0.6), M.dark, x + 6, 5.5 + R - 0.6, ZC - 10);                              // roof vent
  }
  add(g, rbox(84, 1.2, 28, 0.4), M.dark, 0, 3.4, 30);                                               // parade yard
  for (const k of [-1, 1]) { add(g, rbox(24, 0.6, 3.5, 0.2), M.mark, k * 10, 4.1, 30, 0, k * 0.6); add(g, rbox(14, 0.6, 2.4, 0.2), M.paint, k * 9, 4.3, 36, 0, k * 0.6); } // painted chevrons
  add(g, rbox(3, 0.6, 20, 0.2), M.mark, -40, 4.1, 30); add(g, rbox(3, 0.6, 20, 0.2), M.mark, 40, 4.1, 30);
  for (const side of [-1, 1]) {
    add(g, rbox(30, 6, 3, 1), M.khaki, side * 31, 6, 45);                                            // front wall with a gate
    add(g, rbox(12, 1.2, 3.4, 0.4), M.paint, side * 34, 9.2, 45);                                    // team banner on the wall
    add(g, rbox(3, 10, 3, 0.8), M.steel, side * 16, 8, 45); add(g, rbox(3, 1.4, 3.2, 0.4), M.hazard, side * 16, 11, 45);
    add(g, rbox(8, 5, 6, 0.8), M.dark, side * 40, 5.5, 20);                                          // sandbag blocks
  }
  add(g, cyl(0.7, 0.7, 36, 8), M.steel, 38, 21, 36);                                                // flagpole
  add(g, rbox(0.6, 7, 10, 0.2), M.paint, 38, 35, 31);                                               // team banner
  add(g, sph(1, 8, 6), M.lamp, 38, 39.5, 36);
  add(g, cyl(0.5, 0.5, 22, 6), M.steel, -40, 14, 38); add(g, rbox(4, 2, 3, 0.5), M.dark, -40, 25.5, 38); add(g, sph(1.1, 8, 6), M.white, -40, 25, 40);  // floodlight
  return g;
}
