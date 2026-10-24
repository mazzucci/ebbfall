// Building, resource and debris models. Buildings are centred on their footprint (1 tile = 32 units).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './models.js';

const oct = (r, k = 0.42) => { const c = r * k; return [[-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c]]; };
let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

export function core(M) {
  const g = grp();
  add(g, plate(oct(62), 4, 1.2), M.concrete, 0, 0, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(g, rbox(14, 24, 14, 2), M.dark, x * 46, 0 + 12, z * 46);
    add(g, rbox(10, 3, 10, 1), M.paint, x * 46, 25, z * 46);
    add(g, sph(1.8, 12, 8), M.lamp, x * 46, 27.6, z * 46);
    add(g, cyl(2, 2, 26, 10), M.steel, x * 30, 9, z * 30, z * 0.0, 0, 0).rotation.set(Math.PI / 2, 0, Math.atan2(z, x));
  }
  add(g, plate(oct(48), 16, 2), M.trim, 0, 3, 0);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; add(g, rbox(10, 0.8, 3, 0.3), M.paint, Math.cos(a) * 40, 19.2, Math.sin(a) * 40, 0, -a); } // deck stripes
  for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) add(g, rbox(x ? 16 : 6, 2, z ? 16 : 6, 0.6), M.dark, x * 38, 19.6, z * 38); // cable trays
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + 0.26; add(g, rbox(6, 0.6, 6, 0.2), M.dark, Math.cos(a) * 41, 19.4, Math.sin(a) * 41, 0, -a); } // intake grilles
  add(g, new THREE.TorusGeometry(38, 1.2, 8, 48), M.steel, 0, 18.6, 0, Math.PI / 2);
  add(g, plate(oct(49, 0.42).map(([x, z]) => [x * 1.0, z * 1.0]), 2.4, 0.6), M.trim, 0, 15.5, 0);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; add(g, rbox(8, 6, 2, 0.6), M.dark, Math.cos(a) * 44, 9, Math.sin(a) * 44, 0, -a + Math.PI / 2); }
  add(g, rbox(26, 12, 6, 1.5), M.dark, 0, 8, 47);                                    // south hangar door
  add(g, rbox(28, 1.4, 1.4, 0.5), M.hazard, 0, 15, 50.4);
  add(g, cyl(32, 34, 10, 40), M.trim, 0, 23, 0);
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; add(g, rbox(2.6, 6, 1.4, 0.5), M.glass, Math.cos(a) * 32.4, 23, Math.sin(a) * 32.4, 0, -a + Math.PI / 2); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.2; add(g, rbox(2, 2.4, 1, 0.3), M.glass, Math.cos(a) * 33.2, 27, Math.sin(a) * 33.2, 0, -a + Math.PI / 2); }
  const dome = add(g, new THREE.SphereGeometry(26, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.trim, 0, 28, 0);
  dome.scale.set(1, 0.72, 1);
  add(g, cyl(22.5, 24.5, 4, 40), M.paint, 0, 36.5, 0);                    // team band on the dome
  for (const [x, z, h] of [[-8, 10, 14], [10, 6, 10], [4, -12, 12]]) { add(g, cyl(0.4, 0.4, h, 6), M.steel, x, 44 + h / 2, z); add(g, sph(0.8, 8, 6), M.lamp, x, 44 + h, z); }
  add(g, cyl(6, 7, 8, 20), M.steel, 0, 46, 0);
  add(g, sph(4.2, 16, 12), M.white, 0, 51, 0);
  add(g, cyl(0.6, 0.6, 18, 6), M.steel, -14, 44, -10); add(g, sph(1, 8, 6), M.lamp, -14, 53, -10);
  const dish = add(g, new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), M.trim, 18, 40, 8, Math.PI * 0.75, 0, 0.3);
  dish.material = M.trim;
  return g;
}

/** Half-cylinder shell (a vault / quonset roof) with its axis along z, open side down; length along z. */
function vault(r, len, seg = 24) { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return boxUV(g); }
/** Vertical half-disc (a vault's end wall) facing +z. */
function halfDisc(r, seg = 24) { return new THREE.CircleGeometry(r, seg, 0, Math.PI); }

export function depot(M) {
  const g = grp();
  add(g, rbox(60, 3, 60, 1), M.concrete, 0, 1.5, 0);
  for (const [x, mat] of [[-14, M.paint], [14, M.trim]]) {
    add(g, rbox(26, 14, 52, 1.5), mat, x, 10, 0);
    for (const z of [-24, 24]) add(g, rbox(26.4, 2, 1.2, 0.4), M.hazard, x, 3.6, z);
    for (const z of [-20, -8, 4, 16]) add(g, rbox(26.4, 12, 0.8, 0.3), M.dark, x, 10, z);
  }
  add(g, rbox(24, 10, 26, 1.5), M.trim, -2, 22, -8);
  add(g, rbox(24.4, 2, 1.2, 0.4), M.hazard, -2, 26.5, 5.6);
  add(g, rbox(3, 26, 3, 0.8), M.steel, 24, 16, -22);                       // crane mast + arm
  add(g, rbox(26, 2.4, 2.4, 0.6), M.steel, 12, 29, -22);
  add(g, cyl(0.25, 0.25, 10, 6), M.dark, 2, 23, -22);
  add(g, sph(1.2, 8, 6), M.lamp, 24, 30, -22);
  return g;
}

/** Ether Extractor: a derrick over the vent with a violet ether column rising through it, pumping into a side tank. */
export function extractor(M) {
  const g = grp();
  add(g, cyl(30, 31, 4, 40), M.concrete, 0, 2, 0);
  add(g, new THREE.TorusGeometry(21, 2.4, 10, 40), M.steel, 0, 5.5, 0, Math.PI / 2);
  add(g, cyl(13, 14, 12, 28), M.paint, 0, 10, 0);                                                  // wellhead tank (team)
  add(g, cyl(13.3, 13.3, 3, 28), M.ether, 0, 9, 0);                                                // sight glass ring
  add(g, cyl(10, 11, 3, 24), M.trim, 0, 17.5, 0);
  add(g, cyl(4.2, 4.2, 30, 16), M.etherSoft, 0, 32, 0);                                            // ether column
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(g, rbox(7, 6, 7, 1), M.dark, x * 20, 6.5, z * 20);                                         // leg footings
    limb(g, [x * 20, 9, z * 20], [x * 5.5, 44, z * 5.5], 1.7, M.steel);                           // derrick legs
    limb(g, [x * 15, 20, z * 15], [x * 15, 20, -z * 15], 0.8, M.steel);                           // cross braces
  }
  add(g, rbox(14, 3, 14, 0.8), M.trim, 0, 45.5, 0);                                                // crown platform
  add(g, rbox(15, 1.4, 15, 0.5), M.paint, 0, 47.6, 0);
  add(g, cyl(2, 2, 6, 10), M.steel, 0, 51, 0); add(g, sph(3, 14, 10), M.ether, 0, 55, 0);          // ether lamp
  add(g, sph(1.1, 8, 6), M.lamp, 7, 48.5, 7);
  add(g, cyl(6, 6, 16, 16), M.trim, 22, 11, -14, 0, 0, 0);                                          // side tank
  add(g, cyl(6.2, 6.2, 2, 16), M.paint, 22, 15, -14);
  add(g, cyl(1.4, 1.4, 14, 8), M.steel, 14, 12, -7, 0, Math.PI / 4, Math.PI / 2);                   // feed pipe
  add(g, rbox(8, 10, 8, 1.2), M.trim, -22, 7, 20); add(g, rbox(5, 2.4, 0.8, 0.3), M.glass, -22, 9.5, 24.2); // pump house
  return g;
}

/** Garrison (barracks): three ribbed bunk vaults with team-colour doors opening onto a parade yard with a flag. */
export function barracks(M) {
  const g = grp();
  add(g, rbox(92, 3, 92, 1), M.concrete, 0, 1.5, 0);
  const R = 12, L = 52, ZC = -14;                                                                   // vault radius, length, centre z
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

/** A box beam from point a to point b (w wide, h thick), like `limb` but square. */
function beam(parent, a, b, w, h, mat) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv);
  const m = new THREE.Mesh(rbox(w, h, len, 0.5), mat);
  m.position.copy(A).add(Bv).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), Bv.clone().sub(A).normalize());
  parent.add(m); return m;
}
/** Chimney: fat iron stack with a team band, a wide soot cap and a dark mouth, top at y = base + h + 4. */
function chimney(g, M, x, z, r, h, base = 3) {
  add(g, cyl(r, r * 1.2, h, 24), M.iron, x, base + h / 2, z);
  add(g, cyl(r + 0.5, r + 0.5, 3, 24), M.paint, x, base + h * 0.8, z);
  add(g, cyl(r + 1.8, r, 4, 24), M.gunmetal, x, base + h + 2, z);                                  // soot cap
  add(g, cyl(r - 1.2, r - 1.2, 1, 20), M.skinDark, x, base + h + 4.2, z);                          // mouth
}

/** F1. Foundry as a compact 2x2 hall in the industry family: dark iron hall with two fat chimneys and a flue arch
 *  on the roof, glowing roof louvres, a team band on the walls and eaves, the furnace mouth and slag pool south. */
export function forge(M) {
  const g = grp();
  add(g, rbox(60, 3, 60, 1), M.concrete, 0, 1.5, 0);
  add(g, rbox(52, 22, 42, 2.5), M.iron, 0, 14, -5);                                                 // hall
  add(g, rbox(52.6, 3, 42.6, 0.8), M.paint, 0, 9, -5);                                              // team band on the walls
  add(g, rbox(54, 3, 44, 1), M.iron, 0, 26, -5);                                                    // roof slab
  for (const z of [-26, 16]) add(g, rbox(54, 1.2, 2.4, 0.4), M.paint, 0, 28, z);                    // team eave stripes
  for (const x of [-26, 26]) add(g, rbox(2.4, 1.2, 44, 0.4), M.paint, x, 28, -5);
  for (const z of [-4, 8]) {                                                                        // glowing roof louvres
    add(g, rbox(20, 3, 5, 0.8), M.dark, 2, 29, z);
    for (const dz of [-1.5, 1.5]) add(g, rbox(18, 0.6, 1, 0.2), M.fire, 2, 30.6, z + dz);
  }
  for (const x of [-15, 15]) chimney(g, M, x, -16, 7, 38, 27);                                      // two fat stacks on the roof
  add(g, new THREE.TorusGeometry(15, 1.6, 8, 24, Math.PI), M.steel, 0, 50, -16, 0, 0, 0);          // flue arch between them
  add(g, rbox(24, 14, 6, 2), M.dark, 0, 10, 18);                                                    // furnace mouth
  add(g, rbox(18, 8, 2, 1), M.fire, 0, 9, 20.2);
  add(g, rbox(16, 0.6, 7, 0.3), M.slag, 0, 3.1, 25);                                                // slag pool
  add(g, rbox(26, 1.6, 1.6, 0.5), M.hazard, 0, 18.5, 19.4);
  for (let x = -22; x <= 22; x += 8) add(g, cyl(0.3, 0.3, 4, 6), M.steel, x, 29.5, 17);            // roof-edge railing
  add(g, rbox(46, 0.6, 0.6, 0.2), M.steel, 0, 31.5, 17);
  add(g, rbox(2.6, 30, 2.6, 0.8), M.steel, -27, 17, 24); add(g, sph(1.3, 10, 8), M.lamp, -27, 33, 24); // lamp mast
  add(g, rbox(6, 6, 6, 1), M.dark, 24, 6, 24); add(g, rbox(6.4, 1.2, 1.2, 0.4), M.hazard, 24, 9.5, 27.2); // tool crate
  return g;
}

/** Airfield: a big round landing pad (white ring, team-colour H, edge lights) with a tall control tower and radar,
 *  a service shed, fuel tanks and a windsock. */
export function airfield(M) {
  const g = grp();
  add(g, rbox(92, 3, 92, 1), M.concrete, 0, 1.5, 0);
  const PX = 8, PZ = 8, PR = 35;
  add(g, cyl(PR, PR + 1, 2.4, 48), M.dark, PX, 4.2, PZ);                                           // pad deck
  add(g, cyl(PR - 3, PR - 3, 0.6, 48), M.mark, PX, 5.4, PZ);                                       // white ring ...
  add(g, cyl(PR - 6.5, PR - 6.5, 0.7, 48), M.dark, PX, 5.5, PZ);                                   // ... masked back to the deck
  for (const x of [-7, 7]) add(g, rbox(4, 0.6, 20, 0.2), M.paint, PX + x, 5.9, PZ);                // team-colour H
  add(g, rbox(10, 0.6, 4, 0.2), M.paint, PX, 5.9, PZ);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; add(g, sph(1.1, 8, 6), M.glass, PX + Math.cos(a) * (PR - 1), 5.8, PZ + Math.sin(a) * (PR - 1)); }
  for (const [x, z] of [[44, -42], [44, 44], [-44, 44]]) add(g, sph(1.1, 8, 6), M.lamp, x, 4.2, z);
  add(g, rbox(13, 32, 13, 1.6), M.trim, -36, 19, -34);                                              // control tower
  for (const y of [12, 22]) add(g, rbox(13.6, 1.4, 13.6, 0.4), M.dark, -36, y, -34);
  add(g, rbox(17, 7, 17, 1.6), M.glass, -36, 38.5, -34);
  add(g, rbox(18, 2.2, 18, 0.6), M.paint, -36, 43, -34);
  add(g, cyl(1.6, 1.6, 5, 10), M.steel, -36, 46.5, -34);
  const dish = add(g, new THREE.SphereGeometry(7.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), M.trim, -36, 48, -34, Math.PI * 0.72, 0, 0.35);
  dish.material = M.trim;
  add(g, cyl(0.5, 0.5, 10, 6), M.steel, -31, 49, -30); add(g, sph(1.3, 8, 6), M.beacon, -31, 54.5, -30);
  add(g, rbox(14, 12, 30, 1.5), M.trim, -37, 9, 14);                                                // service shed
  add(g, rbox(14.6, 2, 30.6, 0.6), M.paint, -37, 15.5, 14);
  add(g, rbox(1.6, 9, 16, 0.5), M.dark, -29.8, 8, 14);                                              // shed door onto the pad
  add(g, rbox(1.2, 1.2, 17, 0.4), M.hazard, -29.6, 13, 14);
  for (const z of [-40, -30]) { add(g, cyl(4.5, 4.5, 14, 16), M.steel, 36, 7.5, z, 0, 0, Math.PI / 2); add(g, cyl(4.7, 4.7, 2, 16), M.hazard, 36, 7.5, z, 0, 0, Math.PI / 2); } // fuel tanks
  add(g, cyl(0.5, 0.5, 20, 6), M.steel, 44, 13, 44);                                                 // windsock
  add(g, new THREE.ConeGeometry(2.2, 9, 10), M.paint, 40, 22, 44, 0, 0, Math.PI / 2);
  return g;
}

export function turretBase(M) {
  const g = grp();
  add(g, rbox(60, 3, 60, 1.2), M.concrete, 0, 1.5, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(10, 1, 10, 0.4), M.hazard, x * 22, 3.2, z * 22);
  add(g, cyl(22, 25, 8, 36), M.trim, 0, 7, 0);
  add(g, cyl(22.3, 22.3, 2, 36), M.paint, 0, 10, 0);
  add(g, cyl(17, 18, 3, 36), M.trim, 0, 12, 0);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(g, rbox(5, 5, 2, 0.6), M.dark, Math.cos(a) * 23.5, 7, Math.sin(a) * 23.5, 0, -a + Math.PI / 2); }
  return g;
}
/** Turret head facing +x; sits on the base at y = 13. */
export function turretHead(M) {
  const g = grp();
  add(g, cyl(10, 11, 4, 28), M.gunmetal, 0, 15, 0);
  add(g, sph(9, 24, 16), M.paint, 0, 19, 0).scale.set(1, 0.75, 1);
  for (const side of [-1, 1]) { add(g, rbox(18, 3, 3, 1), M.gunmetal, 12, 20, side * 4.2); add(g, rbox(3, 3.6, 3.6, 0.8), M.dark, 21, 20, side * 4.2); }
  add(g, rbox(6, 4, 7, 1.2), M.trim, -6, 24, 0); add(g, rbox(1, 2, 4, 0.3), M.glass, -2.6, 24.6, 0);
  add(g, sph(0.9, 8, 6), M.lamp, -8, 27, 2);
  return g;
}

export function foundation(n) {
  const g = grp(), W = n * 32 - 6;
  const M = { concrete: new THREE.MeshStandardMaterial({ color: 0x4e504f, roughness: 0.95 }), mark: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.7 }) };
  add(g, rbox(W, 2, W, 0.8), M.concrete, 0, 1, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { add(g, rbox(W * 0.22, 0.6, 2, 0.2), M.mark, x * W * 0.36, 2.2, z * (W / 2 - 3)); add(g, rbox(2, 0.6, W * 0.22, 0.2), M.mark, x * (W / 2 - 3), 2.2, z * W * 0.36); }
  return g;
}
export function scaffold(n, M) {
  const g = grp(), W = n * 32 - 8, H = 10 + n * 6;
  for (let x = -W / 2; x <= W / 2 + 0.1; x += W / Math.max(2, n)) for (const z of [-W / 2, W / 2]) { add(g, rbox(2.2, H, 2.2, 0.4), M.steel, x, H / 2, z); add(g, rbox(2.2, H, 2.2, 0.4), M.steel, z, H / 2, x); }
  for (const y of [H * 0.35, H * 0.7, H]) for (const z of [-W / 2, W / 2]) { add(g, rbox(W, 1.6, 1.6, 0.4), M.hazard, 0, y, z); add(g, rbox(1.6, 1.6, W, 0.4), M.hazard, z, y, 0); }
  for (const z of [-W / 2, W / 2]) { limb(g, [-W / 2, 1, z], [W / 2, H * 0.7, z], 0.7, M.steel); limb(g, [z, 1, -W / 2], [z, H * 0.7, W / 2], 0.7, M.steel); }
  return g;
}
export function rubble(n, M) {
  const g = grp(), W = n * 32 - 8; s = 11 + n;
  for (let k = 0; k < n * n * 9; k++) {
    const x = (rnd() - 0.5) * W, z = (rnd() - 0.5) * W, sz = 2 + rnd() * (3 + n * 1.5);
    const m = add(g, rbox(sz, sz * (0.4 + rnd() * 0.6), sz * (0.5 + rnd()), 0.4), [M.dark, M.gunmetal, M.skinDark, M.concrete][k % 4], x, sz * 0.3, z, rnd(), rnd() * 3, rnd());
    m.scale.y = 0.7;
  }
  return g;
}

// ---------------- resources ----------------
export function shardField(stage, mats) {
  const g = grp(); s = 31;
  add(g, cyl(13, 15, 2, 14), mats.rock, 0, 1, 0).scale.set(1, 1, 0.8);
  const crystals = [[-6, 2, 3.4, 15, -0.25, 0.2], [5, 3, 3, 13, 0.3, -0.3], [0, -2, 3.8, 19, 0.05, 0.1], [-2, 6, 2.6, 10, -0.4, 0.4], [7, -4, 2.2, 10, 0.5, -0.2], [-8, -4, 2, 8, -0.5, -0.4]];
  crystals.slice(0, 6 - stage * 1.5 | 0).forEach(([x, z, r, h, lx, lz]) => {
    const k = 1 - stage * 0.15, c = grp();
    add(c, new THREE.CylinderGeometry(r * k, r * k * 1.1, h * k * 0.75, 5), mats.crystal, 0, h * k * 0.375, 0);
    add(c, new THREE.ConeGeometry(r * k, h * k * 0.4, 5), mats.crystalTip, 0, h * k * 0.75 + h * k * 0.2, 0);
    c.position.set(x, 1, z); c.rotation.set(lz, rnd() * 3, -lx); g.add(c);
  });
  for (let k = 0; k < 6; k++) add(g, new THREE.DodecahedronGeometry(1.5 + rnd() * 1.5), mats.rock, (rnd() - 0.5) * 24, 1, (rnd() - 0.5) * 18);
  for (let k = 0; k < 7 - stage * 2; k++) add(g, new THREE.ConeGeometry(0.9, 3 + rnd() * 2, 5), mats.crystalTip, (rnd() - 0.5) * 22, 1.5, (rnd() - 0.5) * 16, (rnd() - 0.5), 0, (rnd() - 0.5));
  return g;
}
export function vent(f, mats) {
  const g = grp(); s = 51;
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const r = 23 + rnd() * 3; add(g, new THREE.DodecahedronGeometry(4 + rnd() * 3), mats.rock, Math.cos(a) * r, 2, Math.sin(a) * r, rnd(), rnd(), rnd()).scale.y = 0.7; }
  add(g, cyl(20, 22, 2, 32), mats.pit, 0, 0.5, 0);
  add(g, new THREE.ConeGeometry(18, 8, 32, 1, true), mats.pit, 0, -2, 0, Math.PI, 0, 0);
  // three spiral arms (arcs of growing radius), turned a little more each frame
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) {
    const arm = grp(); arm.rotation.y = k / 3 * Math.PI * 2 + f / 4 * Math.PI * 2 / 3 + j * 0.9;
    add(arm, new THREE.TorusGeometry(6 + j * 4.5, 2.2 - j * 0.4, 8, 16, 1.1), mats.glow, 0, 1.4, 0, Math.PI / 2);
    g.add(arm);
  }
  add(g, cyl(5 + (f % 2), 6, 1.5, 20), mats.glow, 0, 2, 0);
  return g;
}
