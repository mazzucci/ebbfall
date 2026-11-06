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

/** Rigger (worker): a stocky sailor under a flat cap hauling a two-wheeled hand-barrow behind them: a timber box
 *  with iron bands under a team-canvas tarpaulin, a pale coil of rope on top and the pick laid across it. From above a
 *  long shape, a dark figure ahead of a team box with a pale ring on it: never the Picket's disc and stick. */
export function rigger(M, f) {
  const g = grp(), man = sailor(M, f); man.position.x = 3.6; g.add(man);
  const b = man.body;
  add(b, cyl(2.5, 2.6, 1.1, 14), M.oilskin, 0.2, 15.3, 0);                                      // flat cap
  add(b, rbox(2, 0.4, 3, 0.15), M.oilskin, 2.6, 14.9, 0);                                       // its peak
  for (const side of [-1, 1]) add(b, rbox(3.2, 1.3, 3.4, 0.7), M.paintCanvas, -0.4, 13.1, side * 3.6, side * 0.35, 0, 0); // yoke over the shoulders (team)
  add(b, rbox(5.4, 0.4, 7.4, 0.1), M.inkLine, -0.4, 12.4, 0);                                   // its ink edge
  for (const side of [-1, 1]) limb(b, [0.6, 11.2, side * 3.4], [-2.6, 7.6, side * 3.7], 1.1, M.paintCanvas); // arms back to the shafts (team canvas sleeves, as the Picket's)
  // the barrow: two shafts from the hands, a box on two wheels, bands, the load
  for (const side of [-1, 1]) add(g, rbox(10, 0.8, 0.8, 0.25), M.timber, -4.2, 7.2, side * 3.7);
  add(g, rbox(8.4, 5, 7.4, 0.4), M.paintCanvas, -7.4, 5.3, 0);                                  // the box, team-painted
  for (const y of [3.0, 7.6]) add(g, rbox(8.7, 0.5, 7.7, 0.15), M.inkLine, -7.4, y, 0);           // ink bands above and below the paint
  for (const x of [-10.8, -4]) add(g, rbox(0.8, 5.2, 7.8, 0.15), M.timber, x, 5.3, 0);           // timber corner posts
  for (const side of [-1, 1]) {
    add(g, cyl(3.1, 3.1, 1.1, 18), M.ironDark, -7.4, 3.1, side * 4.5, Math.PI / 2);              // wheels
    add(g, cyl(1.1, 1.1, 1.4, 10), M.oilskin, -7.4, 3.1, side * 4.6, Math.PI / 2);
    for (let k = 0; k < 4; k++) add(g, rbox(0.5, 5.2, 0.4, 0.1), M.timber, -7.4, 3.1, side * 4.55, 0, 0, k * Math.PI / 4 + f * 0.4); // spokes (turning)
  }
  add(g, rbox(7.8, 1.3, 7, 0.5), M.paintCanvas, -7.4, 8.4, 0);                                   // the team tarpaulin over the load
  add(g, rbox(8.1, 0.35, 7.3, 0.1), M.inkLine, -7.4, 7.75, 0);                                   // its ink hem
  for (const z of [-2.4, 2.4]) add(g, rbox(0.5, 1.6, 7.4, 0.15), M.rope, -7.4 + z, 8.5, 0);     // lashings
  add(g, torus(3.1, 1.25, 28), M.rope, -7.4, 10.1, 0, Math.PI / 2, 0, 0);                        // the coil, lying on the tarp
  add(g, cyl(0.42, 0.42, 11, 8), M.timber, -6.6, 11.4, 0.4, 0, 0.45, Math.PI / 2);               // the pick across the coil
  add(g, rbox(1, 1.1, 5, 0.3), M.ironDark, -1.6, 11.4, 2.8, 0, 0.45, 0);                         // its head
  for (const side of [-1, 1]) add(g, new THREE.ConeGeometry(0.5, 1.6, 6), M.brass, -1.6 - side * 1.1, 11.4, 2.8 + side * 2.9, side * Math.PI / 2, 0.45, 0);
  g.scale.setScalar(1.06);
  return g;
}

/** Picket (line infantry): a sailor under a round canvas hat, pale brim and crown, the team band round the crown
 *  between two black ink rings; team canvas sleeves and a team bedroll across the back; a long rifle with a pale
 *  timber stock held out ahead: from above a pale disc with a long bar. Frames: 0-1 the march, 2 going to ground
 *  (kneeling, the first course of a sandbag parapet laid ahead), 3 dug in (two courses, the rifle resting on them,
 *  a team groundsheet spread behind). */
export function picket(M, f) {
  const st = f < 2 ? 0 : f - 1, kneel = st > 0;                                                  // 0 marching, 1 settling, 2 dug in
  const g = sailor(M, f, { kneel }), b = g.body;
  const hat = grp(); hat.position.set(0.2, 14.6, 0); b.add(hat);
  add(hat, lathe([[0, 0], [4.4, 0], [4.4, 0.5], [3.2, 0.65], [3.1, 3], [2.4, 3.6], [1, 3.95], [0, 4.05]]), M.canvas, 0, 0, 0);
  add(hat, cyl(4.45, 4.45, 0.3, 24), M.canvasDark, 0, 0.1, 0);                                   // the brim's underside
  add(hat, cyl(3.25, 3.25, 1.9, 20), M.paintCanvas, 0, 1.85, 0);                                 // team band round the crown
  add(hat, cyl(3.35, 3.35, 0.5, 20), M.inkLine, 0, 0.9, 0); add(hat, cyl(3.35, 3.35, 0.5, 20), M.inkLine, 0, 2.95, 0); // black ink rings above and below it
  add(b, cyl(1.4, 1.4, 9.4, 12), M.paintCanvas, -3.4, 12.2, 0, Math.PI / 2);                     // bedroll across the back (team)
  add(b, cyl(1.5, 1.5, 0.5, 12), M.inkLine, -3.4, 12.2, 4.6, Math.PI / 2); add(b, cyl(1.5, 1.5, 0.5, 12), M.inkLine, -3.4, 12.2, -4.6, Math.PI / 2);
  add(b, rbox(2.6, 0.5, 2, 0.15), M.rope, -3.4, 13.5, 0);                                        // its strap
  add(b, rbox(0.8, 2.2, 1.6, 0.3), M.ironDark, -5.2, 9.2, 1.2);                                  // water can
  // arms (team canvas sleeves) and the rifle: a pale timber stock, a long iron barrel, a brass bead at the muzzle
  const ry = kneel ? 8.4 : 9.8;
  const gun = grp(); gun.position.set(2.8, ry, 1.0); b.add(gun);
  add(gun, rbox(7.5, 1.6, 1.7, 0.5), M.timberPale, 0.8, 0, 0);                                   // stock
  add(gun, rbox(1.2, 1.9, 1.9, 0.2), M.ironDark, 4.9, 0, 0);                                     // lock
  add(gun, cyl(0.62, 0.62, 9.8, 8), M.ironDark, 9.5, 0.3, 0, 0, 0, Math.PI / 2);                 // barrel
  add(gun, rbox(1, 2.2, 1, 0.3), M.oilskin, -1.2, -1.2, 0);                                      // grip
  add(gun, sph(0.55, 8, 6), M.brass, 14.5, 0.3, 0);
  limb(b, [0.6, 11, 3.6], [4, ry - 0.4, 1.6], 1.1, M.paintCanvas);
  limb(b, [0.6, 11, -3.6], [7.6, ry, 0.6], 1.1, M.paintCanvas);
  // the parapet: a crescent of wet sandbags laid ahead, one course while settling, two dug in; the groundsheet behind
  if (st) {
    const R = 7.6, n = 7;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * 0.55 + k * (Math.PI * 1.1 / (n - 1)), x = Math.cos(a) * R, z = Math.sin(a) * R;
      add(g, rbox(2.6, 2.1, 4, 0.9), M.sandbag, x, 1.05, z, 0, -a, 0);
      if (st === 2 && k < n - 1) { const a2 = a + Math.PI * 0.55 / (n - 1); add(g, rbox(2.5, 2, 3.8, 0.9), M.sandbag, Math.cos(a2) * R * 0.96, 3, Math.sin(a2) * R * 0.96, 0, -a2, 0); }
    }
    if (st === 2) {
      add(g, new THREE.CylinderGeometry(6.4, 6.4, 0.5, 24, 1, false, Math.PI / 2, Math.PI), M.paintCanvas, -0.8, 0.25, 0, 0, 0, 0); // the groundsheet, a half disc behind
      add(g, new THREE.CylinderGeometry(6.7, 6.7, 0.35, 24, 1, false, Math.PI / 2, Math.PI), M.inkLine, -0.8, 0.17, 0, 0, 0, 0);
      add(g, rbox(3.2, 2.2, 3.2, 0.3), M.timber, -4.6, 1.1, -5.2); add(g, rbox(3.4, 0.6, 3.4, 0.1), M.paintCanvas, -4.6, 2.4, -5.2); add(g, rbox(3.5, 0.3, 3.5, 0.1), M.inkLine, -4.6, 2.05, -5.2); // an ammunition crate, its lid team
    }
  }
  g.scale.setScalar(1.08);
  return g;
}

/** Lighthouse (core, 4x4): a tapered tarred tower with iron bands and a team band, a lantern room (pale glass in a
 *  dark cage, a warm lamp inside) under a canvas cone; a keeper's house roofed with an upturned hull under lashed
 *  canvas, every other panel team-painted, its end wall team; a flagstone quay with a timber jetty under team
 *  sailcloth, crates under a lashed tarp, bollards, coils, a pennant. Tower at the east, house at the west. */
export function lighthouse(M) {
  const g = grp();
  add(g, plate(oct(62), 4, 1.2), M.flagstone, 0, 0, 0);
  for (let k = 0; k < 10; k++) add(g, rbox(2.2, 1.2, 2.2, 0.3), M.slate, -58 + k * 13, 4.6, 58 - (k % 3)); // kerb stones along the south edge
  // the keeper's house
  const HX = -32, HZ = -6, HL = 72;
  add(g, rbox(30, 14, HL, 1), M.timber, HX, 11, HZ);                                                // timber walls
  for (const z of [-30, -10, 10, 30]) add(g, rbox(30.4, 14, 1.2, 0.3), M.tar, HX, 11, HZ + z);       // tarred ribs
  add(g, rbox(31, 1.6, HL + 1, 0.4), M.ironDark, HX, 4.8, HZ);                                      // plinth band
  add(g, hull(16, HL), M.tar, HX, 18, HZ);                                                          // the upturned hull roof
  add(g, rbox(2.2, 2.2, HL + 2, 0.6), M.timber, HX, 34.5, HZ);                                      // keel
  for (let k = 0; k < 6; k++) add(g, hull(16.5, 9.4), k % 3 === 1 ? M.canvas : M.paintCanvas, HX, 18.2, HZ - 25 + k * 10); // lashed canvas panels, two team to one pale
  for (let k = 0; k <= 6; k++) add(g, torus(16.9, 0.5, 32, Math.PI), M.rope, HX, 18.2, HZ - 30 + k * 10, 0, 0, 0); // the lashings between them
  for (let k = 0; k <= 6; k++) add(g, hull(16.75, 1.2), M.inkLine, HX, 18.2, HZ - 30 + k * 10);     // ink where the panels meet
  add(g, rbox(5, 7, 5, 0.6), M.ironDark, HX - 8, 36, HZ - 24); add(g, rbox(5.6, 1.4, 5.6, 0.4), M.slate, HX - 8, 40, HZ - 24); // chimney
  add(g, new THREE.CircleGeometry(15.4, 24, 0, Math.PI), M.paintCanvas, HX, 18.2, HZ + HL / 2 + 0.3); // the south end wall under the hull: team
  add(g, new THREE.CircleGeometry(15.8, 24, 0, Math.PI), M.inkLine, HX, 18.2, HZ + HL / 2 + 0.1);
  add(g, rbox(9, 9, 1.2, 0.4), M.oilskin, HX + 2, 9, HZ + HL / 2 + 0.9);                             // south door
  add(g, rbox(12, 0.6, 7, 0.2), M.canvas, HX + 2, 15.5, HZ + HL / 2 + 3, 0.3);                       // canvas porch
  for (const x of [-10, 10]) add(g, rbox(4, 4, 1, 0.3), M.canvasDark, HX + x, 11, HZ + HL / 2 + 0.9); // windows, shuttered
  // the tower: tapered, tarred, banded; the gallery; the lantern room; the cone
  const TX = 20, TZ = -10;
  add(g, cyl(20, 22, 6, 32), M.slate, TX, 7, TZ);
  add(g, cyl(11.5, 18.5, 34, 32), M.tar, TX, 25, TZ);                                                // the tarred shaft
  for (const [y, r] of [[13, 17.5], [20, 16]]) add(g, cyl(r + 0.5, r + 0.6, 1.6, 32), M.ironDark, TX, y, TZ); // iron bands
  add(g, cyl(12.2, 14.7, 16, 32), M.paintCanvas, TX, 33, TZ);                                        // the team band
  add(g, cyl(15, 15, 0.8, 32), M.inkLine, TX, 24.8, TZ); add(g, cyl(12.5, 12.5, 0.8, 32), M.inkLine, TX, 41.2, TZ); // ink rings
  add(g, torus(24.5, 3, 48), M.paintCanvas, TX, 4.1, TZ, Math.PI / 2, 0, 0).scale.z = 0.25;           // a painted mooring ring round the tower's foot
  add(g, torus(27.7, 0.5, 48), M.inkLine, TX, 4.15, TZ, Math.PI / 2, 0, 0); add(g, torus(21.3, 0.5, 48), M.inkLine, TX, 4.15, TZ, Math.PI / 2, 0, 0); // its ink edges
  add(g, cyl(14.2, 12.4, 2.2, 32), M.ironDark, TX, 42.6, TZ);                                         // gallery deck
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; add(g, cyl(0.3, 0.3, 4, 6), M.ironDark, TX + Math.cos(a) * 13.6, 45.6, TZ + Math.sin(a) * 13.6); }
  add(g, torus(13.6, 0.3, 36), M.ironDark, TX, 47.6, TZ, Math.PI / 2, 0, 0);                        // rail
  add(g, cyl(9.2, 9.8, 1.6, 24), M.ironDark, TX, 44.5, TZ);                                           // lantern-room floor
  add(g, cyl(8.2, 8.2, 12, 24), M.lanternGlass, TX, 51.3, TZ);                                        // the lantern room: pale glass
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + Math.PI / 10; add(g, rbox(0.9, 12.4, 0.9, 0.2), M.ironDark, TX + Math.cos(a) * 8.3, 51.3, TZ + Math.sin(a) * 8.3, 0, -a, 0); } // the cage
  for (const y of [47.5, 55]) add(g, cyl(8.5, 8.5, 0.6, 24), M.ironDark, TX, y, TZ);                  // its rails
  add(g, sph(3.6, 16, 12), M.white, TX, 51.5, TZ);                                                    // the lamp
  add(g, cyl(9, 9, 1.4, 24), M.ironDark, TX, 58, TZ);
  add(g, new THREE.ConeGeometry(10, 7, 24), M.canvas, TX, 62, TZ);                                   // the canvas cone
  add(g, cyl(0.4, 0.4, 3, 6), M.brass, TX, 66.5, TZ); add(g, sph(0.6, 8, 6), M.brass, TX, 68.1, TZ); // finial
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
    add(g, rbox(11.5, 1, 11.5, 0.5), M.paintCanvas, x + (n - 1) * 0.8, 4.5 + n * 5, z - (n - 1) * 0.6);
    add(g, rbox(11.8, 0.4, 11.8, 0.2), M.inkLine, x + (n - 1) * 0.8, 3.8 + n * 5, z - (n - 1) * 0.6);
    for (const dz of [-3, 3]) add(g, rbox(0.5, 1.4, 12.4, 0.15), M.rope, x + (n - 1) * 0.8 + dz, 4.6 + n * 5, z - (n - 1) * 0.6);
  }
  for (const [x, z] of [[14, 36], [50, 36], [14, 60], [50, 60]]) add(g, cyl(0.7, 0.7, 20, 8), M.timber, x, 14, z); // the jetty's awning on four posts
  for (let k = 0; k < 5; k++) add(g, rbox(8, 0.8, 26, 0.3), k % 2 ? M.canvas : M.paintCanvas, 16 + k * 8, 24 - Math.abs(k - 2) * 0.5, 48, 0.12); // sailcloth in panels, every other one team, sagging between the spars
  for (let k = 0; k <= 5; k++) add(g, rbox(0.6, 1.4, 27, 0.2), M.rope, 12 + k * 8, 24.2 - Math.abs(k - 2.5) * 0.5, 48, 0.12); // the seams, roped
  add(g, rbox(41, 0.4, 27.5, 0.2), M.inkLine, 32, 23.3, 48, 0.12);                                      // the ink hem under it
  add(g, rbox(2, 2, 30, 0.3), M.timber, 12, 24.4, 48, 0.12); add(g, rbox(2, 2, 30, 0.3), M.timber, 52, 24.4, 48, 0.12); // its spars
  return g;
}
