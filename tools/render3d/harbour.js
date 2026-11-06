// The Harbour (the Humans' new look, STYLE.md): dark hulls of tar and iron under pale canvas; timber, rope and brass
// only on small tips. Step 0's slice: the Rigger (harvester), the Picket (trooper, with its dug-in state) and the
// Lighthouse (core). Same conventions as models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const lathe = (pts, seg = 20) => memo(`hl${JSON.stringify(pts)},${seg}`, () => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.computeVertexNormals(); return g; });
const torus = (r, t, seg = 24, arc = Math.PI * 2) => memo(`ht${r},${t},${seg},${arc}`, () => new THREE.TorusGeometry(r, t, 8, seg, arc));
/** A half-cylinder shell (an upturned hull) with its axis along z, open side down. */
const hull = (r, len, seg = 20) => memo(`hh${r},${len},${seg}`, () => { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return g; });
const oct = (r, k = 0.42) => { const c = r * k; return [[-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c]]; };

/** A sailor in a tar oilskin coat: legs by frame (two strides), or kneeling (`kneel`: the right knee down, the left
 *  foot forward); the body lowered to `drop`. Returns the group; the head sits at y 13.6 - drop. */
function sailor(M, f, { kneel = false } = {}) {
  const g = grp(), drop = kneel ? 3.4 : 0, st = [3.2, -3.2][f % 2];
  for (const side of [-1, 1]) {
    const z = side * 2.1;
    if (kneel) {
      if (side < 0) { limb(g, [0, 6.2 - drop, z], [3.8, 3.4, z], 1.25, M.oilskin); limb(g, [3.8, 3.4, z], [3.8, 1.2, z], 1.1, M.oilskin); add(g, rbox(3.6, 1.6, 2.2, 0.6), M.oilskin, 4.4, 0.8, z); }
      else { limb(g, [0, 6.2 - drop, z], [-2.6, 1.4, z], 1.25, M.oilskin); limb(g, [-2.6, 1.4, z], [-6.2, 1, z], 1.1, M.oilskin); add(g, rbox(2.2, 1.6, 2.4, 0.6), M.oilskin, -7, 0.9, z, 0, 0, 0.5); }
      continue;
    }
    const s = st * side;
    add(g, rbox(3.6, 1.6, 2.2, 0.6), M.oilskin, s + 0.6, 0.8, z);                               // sea boot
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, z * 1.05], 1.25, M.oilskin);
    limb(g, [s * 0.55, 3.4, z * 1.05], [s, 1.3, z], 1.1, M.oilskin);
  }
  const b = grp(); b.position.y = -drop; g.add(b);
  add(b, cyl(3.3, 4.1, 3.6, 12), M.tar, 0, 7.4, 0);                                            // the coat's flared skirt
  add(b, rbox(5.2, 6.2, 6.8, 1.6), M.tar, 0, 10.4, 0);                                          // the coat
  add(b, rbox(5.4, 0.9, 7, 0.3), M.ironDark, 0, 8.4, 0);                                        // belt
  add(b, rbox(2, 2.2, 1.4, 0.4), M.ironDark, 2.6, 8.4, 0.2);                                    // buckle pouch
  add(b, sph(2.1, 16, 12), M.oilskin, 0.2, 13.5, 0);                                            // head (hood up)
  add(b, sph(1.6, 12, 10), M.canvasDark, 1.2, 13.3, 0).scale.set(0.8, 0.9, 0.9);               // the face, in the hood's shade
  return Object.assign(g, { body: b });
}

/** Rigger (worker): a stocky sailor under a flat cap, a pale coil of rope worn as a sash over the shoulder (the
 *  signature from above: a pale arc across a dark coat, no hat), a team-canvas pack and yoke, a pick carried low across
 *  the front, brass on its points. */
export function rigger(M, f) {
  const g = sailor(M, f), b = g.body;
  add(b, cyl(2.5, 2.6, 1.1, 14), M.oilskin, 0.2, 15.3, 0);                                      // flat cap
  add(b, rbox(2, 0.4, 3, 0.15), M.oilskin, 2.6, 14.9, 0);                                       // its peak
  add(b, rbox(3, 4.6, 5.6, 0.8), M.paintCanvas, -3.9, 10.6, 0);                                 // haversack (team canvas)
  add(b, rbox(3.2, 0.5, 5.8, 0.15), M.ironDark, -3.9, 12.95, 0);                                // its iron frame edge (ink round the team band)
  for (const side of [-1, 1]) add(b, rbox(3.4, 1.4, 3.6, 0.7), M.paintCanvas, -0.4, 13.1, side * 3.6, side * 0.35, 0, 0); // yoke over the shoulders (team)
  add(b, torus(3.9, 1.3, 28), M.rope, -0.2, 10.2, -0.3, 0.84, 0, 0);                           // the coil, worn over the right shoulder and under the left arm
  add(b, rbox(2.4, 1, 1.2, 0.3), M.rope, 0.6, 13.1, 3.1, 0.84, 0, 0);                            // its lashing on the shoulder
  add(b, rbox(1.2, 2.2, 1.6, 0.3), M.paintCanvas, 0.4, 9.8, -4.1);                               // armband (team)
  // arms and the pick, carried across the front
  limb(b, [0.6, 11.4, 3.4], [4.2, 8.6, 1.6], 1.05, M.tar);
  limb(b, [0.6, 11.4, -3.4], [1.6, 8.4, -0.4], 1.05, M.tar);
  add(b, cyl(0.42, 0.42, 9, 8), M.timber, 3, 7.9, 0.6, 0, 0, Math.PI / 2 + 0.18);               // handle
  add(b, rbox(1, 1.1, 5.4, 0.3), M.ironDark, 7.3, 8.7, 0.6);                                    // head
  for (const side of [-1, 1]) add(b, new THREE.ConeGeometry(0.5, 1.6, 6), M.brass, 7.3, 8.7, 0.6 + side * 3.4, side * Math.PI / 2, 0, 0); // brass points
  g.scale.setScalar(1.08);
  return g;
}

/** Picket (line infantry): a sailor under a broad round canvas hat, the team band round its crown between two ink
 *  rings, a team cape square over the shoulders and a team pack, a long rifle. Frames: 0-1 the march, 2 going to
 *  ground (kneeling on a team-painted groundsheet, half a ring of sandbags laid), 3 dug in (the full ring, the rifle
 *  resting on it). */
export function picket(M, f) {
  const st = f < 2 ? 0 : f - 1, kneel = st > 0;                                                  // 0 marching, 1 settling, 2 dug in
  const g = sailor(M, f, { kneel }), b = g.body;
  const hat = grp(); hat.position.set(0.2, 14.6, 0); b.add(hat);
  add(hat, lathe([[0, 0], [5, 0], [5, 0.45], [3.3, 0.6], [3.2, 2.9], [2.5, 3.5], [1, 3.9], [0, 4]]), M.canvas, 0, 0, 0);
  add(hat, cyl(5.05, 5.05, 0.3, 24), M.canvasDark, 0, 0.1, 0);                                   // the brim's underside
  add(hat, cyl(3.35, 3.35, 1.4, 20), M.paintCanvas, 0, 1.8, 0);                                  // team band
  add(hat, cyl(3.4, 3.4, 0.3, 20), M.oilskin, 0, 1.0, 0); add(hat, cyl(3.4, 3.4, 0.3, 20), M.oilskin, 0, 2.6, 0); // ink rings round the band
  add(hat, cyl(2.4, 2.9, 1, 20), M.paintCanvas, 0, 3.7, 0);                                      // team crown (the brim stays pale canvas)
  add(hat, cyl(3.0, 3.0, 0.3, 20), M.oilskin, 0, 3.25, 0);                                       // its ink ring
  add(b, rbox(5, 0.9, 7.6, 0.3), M.paintCanvas, -0.6, 13.5, 0);                                  // cape square over the shoulders (team)
  add(b, rbox(5.3, 0.3, 7.9, 0.1), M.oilskin, -0.6, 12.95, 0);                                   // its ink edge
  add(b, rbox(2.8, 4.4, 5.4, 0.8), M.paintCanvas, -3.9, 10.4, 0);                                // pack (team canvas)
  add(b, rbox(3, 0.5, 5.6, 0.15), M.ironDark, -3.9, 12.7, 0);
  add(b, rbox(0.8, 2.2, 1.6, 0.3), M.ironDark, -5.4, 9.2, 1.2);                                  // water can
  // arms and the rifle: a timber stock, a long iron barrel, a brass bead at the muzzle
  const level = kneel ? -0.1 : 0, ry = kneel ? 8.6 : 9.6;
  const gun = grp(); gun.position.set(2.6, ry, 1.2); gun.rotation.z = level; b.add(gun);
  add(gun, rbox(6.5, 1.5, 1.2, 0.4), M.timber, 0.5, 0, 0);
  add(gun, cyl(0.42, 0.42, 9.5, 8), M.ironDark, 7.8, 0.25, 0, 0, 0, Math.PI / 2);
  add(gun, rbox(1, 2.2, 1, 0.3), M.oilskin, -1.2, -1.2, 0);                                      // grip
  add(gun, sph(0.42, 8, 6), M.brass, 12.6, 0.25, 0);
  limb(b, [0.6, 11, 3.6], [4.2, ry - 0.6, 1.8], 1.05, M.tar);
  limb(b, [0.6, 11, -3.6], [7.4, ry - 0.2, 0.8], 1.05, M.tar);
  // the sandbags: a ring in front and round the sides, laid bag by bag; half of them while settling
  if (st) {
    const bags = st === 2 ? 11 : 5, R = 8.6;
    add(g, cyl(7.4, 7.4, 0.5, 28), M.paintCanvas, 0, 0.25, 0);                                   // the team groundsheet laid in the pit
    add(g, cyl(7.7, 7.7, 0.35, 28), M.oilskin, 0, 0.17, 0);                                      // its ink hem
    for (let k = 0; k < bags; k++) {
      const a = -Math.PI * 0.72 + k * (Math.PI * 1.44 / 10) + (k % 2) * 0.03;                   // from north-west round the east to south-west
      const x = Math.cos(a) * R, z = Math.sin(a) * R, lift = k % 2 ? 0.2 : 0;
      add(g, rbox(2.6, 2.1, 4.2, 0.9), M.sandbag, x, 1.05 + lift, z, 0, -a, 0);
      if (k % 2) add(g, rbox(2.4, 1.9, 3.8, 0.9), M.sandbag, x * 0.93, 3 + lift, z * 0.93, 0, -a + 0.15, 0); // a second course
    }
  }
  g.scale.setScalar(1.08);
  return g;
}

/** Lighthouse (core, 4x4): a tarred stone tower with iron bands, the team band under its gallery, a brass-caged lamp
 *  under a canvas cone; a keeper's house roofed with an upturned hull under a lashed team-painted tarpaulin; a slate
 *  quay with a timber jetty, bollards, coils of rope, a team flag. Tower at the east, house at the west. */
export function lighthouse(M) {
  const g = grp();
  add(g, plate(oct(62), 4, 1.2), M.slate, 0, 0, 0);
  for (let k = 0; k < 10; k++) add(g, rbox(2.2, 1.2, 2.2, 0.3), M.slate, -58 + k * 13, 4.6, 58 - (k % 3)); // kerb stones along the south edge
  // the keeper's house
  const HX = -32, HZ = -6, HL = 72;
  add(g, rbox(30, 14, HL, 1), M.timber, HX, 11, HZ);                                                // timber walls
  for (const z of [-30, -10, 10, 30]) add(g, rbox(30.4, 14, 1.2, 0.3), M.tar, HX, 11, HZ + z);       // tarred ribs
  add(g, rbox(31, 1.6, HL + 1, 0.4), M.ironDark, HX, 4.8, HZ);                                      // plinth band
  add(g, hull(16, HL), M.tar, HX, 18, HZ);                                                          // the upturned hull roof
  add(g, rbox(2.2, 2.2, HL + 2, 0.6), M.timber, HX, 34.5, HZ);                                      // keel
  add(g, hull(16.5, 60), M.paintCanvas, HX, 18.2, HZ + 2);                                          // the lashed team tarpaulin
  for (const z of [-24, -14, -4, 6, 16, 26]) add(g, torus(16.8, 0.45, 32, Math.PI), M.rope, HX, 18.2, HZ + z, 0, 0, 0); // its lashings
  for (const z of [-28, 32]) add(g, hull(16.7, 1.4), M.oilskin, HX, 18.2, HZ + z);                  // ink edges of the tarp
  add(g, rbox(5, 7, 5, 0.6), M.ironDark, HX - 8, 36, HZ - 24); add(g, rbox(5.6, 1.4, 5.6, 0.4), M.slate, HX - 8, 40, HZ - 24); // chimney
  add(g, rbox(9, 9, 1.2, 0.4), M.oilskin, HX + 2, 9, HZ + HL / 2 + 0.4);                             // south door
  add(g, rbox(12, 0.6, 7, 0.2), M.canvas, HX + 2, 15.5, HZ + HL / 2 + 3, 0.3);                       // canvas porch
  for (const x of [-10, 10]) add(g, rbox(4, 4, 1, 0.3), M.canvasDark, HX + x, 11, HZ + HL / 2 + 0.4); // windows, shuttered
  // the tower
  const TX = 20, TZ = -10;
  add(g, cyl(20, 22, 6, 32), M.slate, TX, 7, TZ);
  add(g, cyl(13, 17.5, 36, 32), M.tar, TX, 26, TZ);                                                  // the tarred shaft
  for (const [y, r] of [[14, 17], [25, 15.6], [34, 14.2]]) add(g, cyl(r + 0.5, r + 0.5, 1.6, 32), M.ironDark, TX, y, TZ); // iron bands
  add(g, cyl(13.6, 14.6, 13, 32), M.paintCanvas, TX, 37.5, TZ);                                      // the team band
  add(g, cyl(14.9, 14.9, 0.7, 32), M.oilskin, TX, 30.8, TZ); add(g, cyl(14.1, 14.1, 0.7, 32), M.oilskin, TX, 44.2, TZ); // ink rings
  add(g, cyl(15.2, 14, 2.2, 32), M.ironDark, TX, 45.3, TZ);                                           // gallery deck
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; add(g, cyl(0.3, 0.3, 4, 6), M.ironDark, TX + Math.cos(a) * 14.6, 48.3, TZ + Math.sin(a) * 14.6); }
  add(g, torus(14.6, 0.3, 36), M.ironDark, TX, 50.3, TZ, Math.PI / 2, 0, 0);                        // rail
  add(g, cyl(8.5, 9.5, 2, 24), M.ironDark, TX, 47.5, TZ);                                             // lamp-room floor
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; add(g, cyl(0.45, 0.45, 9, 6), M.brass, TX + Math.cos(a) * 7.8, 53, TZ + Math.sin(a) * 7.8); } // the brass cage
  add(g, sph(3.4, 16, 12), M.white, TX, 53, TZ);                                                      // the lamp
  add(g, cyl(8.3, 8.3, 1.2, 24), M.brass, TX, 57.8, TZ);
  add(g, new THREE.ConeGeometry(10, 7, 24), M.canvas, TX, 61.5, TZ);                                 // the canvas cone
  add(g, cyl(0.4, 0.4, 3, 6), M.brass, TX, 66, TZ); add(g, sph(0.6, 8, 6), M.brass, TX, 67.6, TZ);   // finial
  add(g, rbox(8, 10, 1.2, 0.4), M.oilskin, TX, 11, TZ + 21.6);                                       // the tower's door, facing south
  // the quay: a timber jetty south-east, bollards, rope coils, a team flag
  add(g, rbox(44, 2.4, 16, 0.4), M.timber, 30, 5, 48);
  for (let x = 10; x <= 50; x += 5) add(g, rbox(0.8, 2.6, 16.4, 0.2), M.oilskin, x, 5, 48);           // plank seams
  for (const [x, z] of [[14, 42], [36, 42], [50, 54]]) { add(g, cyl(1.6, 2, 4, 10), M.ironDark, x, 8, z); add(g, sph(1.7, 10, 8), M.ironDark, x, 10, z); }
  for (const [x, z, r] of [[-50, 44, 4], [48, 20, 3.4], [-6, 50, 3]]) add(g, torus(r, 1.3, 20), M.rope, x, 5.2, z, Math.PI / 2, 0, 0); // coils on the quay
  add(g, cyl(0.6, 0.8, 34, 8), M.timber, 52, 21, -46);                                                // flag mast
  add(g, rbox(0.5, 7, 12, 0.2), M.paintCanvas, 52, 33, -40);                                           // team flag
  add(g, rbox(0.7, 0.4, 12.4, 0.1), M.oilskin, 52, 29.4, -40);                                         // its ink hem
  add(g, rbox(14, 1.2, 14, 0.4), M.paintCanvas, -46, 4.6, -46);                                        // a painted mark on the quay, north-west
  add(g, rbox(14, 0.5, 14, 0.2), M.oilskin, -46, 4.2, -46);
  for (const [x, z] of [[14, 36], [50, 36], [14, 60], [50, 60]]) add(g, cyl(0.7, 0.7, 20, 8), M.timber, x, 14, z); // the jetty's awning on four posts
  add(g, rbox(40, 0.8, 28, 0.3), M.paintCanvas, 32, 24, 48, 0.12);                                      // team sailcloth, sloped to the south
  add(g, rbox(41, 0.4, 29, 0.2), M.oilskin, 32, 23.4, 48, 0.12);                                        // its ink hem
  add(g, rbox(2, 2, 30, 0.3), M.timber, 12, 24.4, 48, 0.12); add(g, rbox(2, 2, 30, 0.3), M.timber, 52, 24.4, 48, 0.12); // its spars
  return g;
}
