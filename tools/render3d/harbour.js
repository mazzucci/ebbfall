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

/** Rigger (worker): a stocky sailor in a pale cap hauling a two-wheeled hand-barrow behind them, hands on the
 *  handles: a plain team-painted box on big pale-rimmed wheels under a dark tarp, a pale coil of rope and the pick on
 *  it. From above a long shape, a figure with a pale head ahead of a team box with a pale ring on it: never the
 *  Picket's disc and stick, and nothing striped. */
export function rigger(M, f) {
  const g = grp(), man = sailor(M, f); man.position.x = 3.2; g.add(man);
  const b = man.body;
  add(b, cyl(2.5, 2.7, 1.3, 14), M.canvas, 0.2, 15.4, 0);                                       // a pale canvas cap: the head shows above the barrow
  add(b, cyl(2.6, 2.6, 0.3, 14), M.inkLine, 0.2, 14.7, 0);                                      // its dark band
  add(b, rbox(2, 0.4, 3, 0.15), M.oilskin, 2.6, 14.9, 0);                                       // its peak
  for (const side of [-1, 1]) add(b, rbox(3.8, 1.3, 3.8, 0.7), M.paintCanvas, -0.4, 13.1, side * 3.7, side * 0.35, 0, 0); // yoke over the shoulders (team)
  add(b, rbox(5.4, 0.4, 7.4, 0.1), M.inkLine, -0.4, 12.4, 0);                                   // its ink edge
  for (const side of [-1, 1]) {
    limb(b, [0.6, 11.2, side * 3.4], [-2.2, 7.8, side * 3.6], 1.1, M.paintCanvas);              // arms back to the handles (team canvas sleeves, as the Picket's)
    add(b, sph(0.9, 8, 6), M.oilskin, -2.4, 7.6, side * 3.6);                                   // hands on the handles
  }
  // the barrow: two shafts from the hands, a plain team-painted box on two big wheels, a dark oilskin tarp over the
  // load with the coil and the pick on it; nothing striped (bands on the box made it read as a wasp at 18 px)
  for (const side of [-1, 1]) add(g, rbox(8.5, 0.8, 0.8, 0.25), M.timber, -3.2, 7.3, side * 3.6);
  add(g, rbox(7, 5.6, 6.6, 0.5), M.paintCanvas, -6.2, 5.6, 0);                                  // the box, one plain team panel
  add(g, rbox(7.2, 0.5, 6.8, 0.15), M.inkLine, -6.2, 2.9, 0);                                   // one ink line at its foot
  for (const side of [-1, 1]) {
    add(g, cyl(3.3, 3.3, 0.9, 18), M.timberPale, -6.2, 3.3, side * 4.2, Math.PI / 2);            // the wheels: pale rims, wide of the box, so they read as discs from the side
    add(g, cyl(3.4, 3.4, 0.5, 18), M.ironDark, -6.2, 3.3, side * 4.6, Math.PI / 2);              // iron tyre
    add(g, cyl(1, 1, 1.3, 10), M.ironDark, -6.2, 3.3, side * 4.5, Math.PI / 2);                  // hub
    for (let k = 0; k < 3; k++) add(g, rbox(0.5, 6, 0.4, 0.1), M.oilskin, -6.2, 3.3, side * 4.3, 0, 0, k * Math.PI / 3 + f * 0.4); // spokes (turning)
  }
  add(g, rbox(6.4, 1.4, 6, 0.6), M.oilskin, -6.2, 8.9, 0);                                      // the dark tarp over the load
  for (const z of [-2, 2]) add(g, rbox(0.5, 1.6, 6.4, 0.15), M.rope, -6.2 + z, 9, 0);           // lashings
  add(g, torus(2.6, 1.1, 28), M.rope, -6.2, 10.4, 0, Math.PI / 2, 0, 0);                          // the coil, lying on the tarp
  add(g, cyl(0.42, 0.42, 10, 8), M.timber, -5.6, 11.5, 0.4, 0, 0.45, Math.PI / 2);               // the pick across the coil
  add(g, rbox(1, 1.1, 5, 0.3), M.ironDark, -1.1, 11.5, 2.6, 0, 0.45, 0);                         // its head
  for (const side of [-1, 1]) add(g, new THREE.ConeGeometry(0.5, 1.6, 6), M.brass, -1.1 - side * 1.1, 11.5, 2.6 + side * 2.9, side * Math.PI / 2, 0.45, 0);
  g.scale.setScalar(0.95);
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
  add(hat, cyl(4.5, 4.5, 0.3, 24), M.inkLine, 0, -0.1, 0);                                       // a dark line under the brim
  add(hat, cyl(3.25, 3.25, 1.9, 20), M.paintCanvas, 0, 1.85, 0);                                 // team band round the crown
  add(hat, cyl(3.35, 3.35, 0.5, 20), M.inkLine, 0, 0.9, 0); add(hat, cyl(3.35, 3.35, 0.5, 20), M.inkLine, 0, 2.95, 0); // black ink rings above and below it
  add(b, rbox(2.6, 5.4, 4.2, 0.6), M.paintCanvas, -3.8, 10.6, 0);                                // a narrow pack on the back (team): the figure stays slim
  add(b, rbox(2.8, 0.4, 4.4, 0.1), M.inkLine, -3.8, 13.3, 0); add(b, rbox(2.8, 0.4, 4.4, 0.1), M.inkLine, -3.8, 7.9, 0);
  add(b, rbox(2.9, 0.5, 1.4, 0.15), M.rope, -3.8, 11.6, 0);                                      // its strap
  add(b, rbox(0.8, 2.2, 1.6, 0.3), M.ironDark, -5.2, 9.2, 1.2);                                  // water can
  // arms (team canvas sleeves) and the rifle: a pale timber stock, a long iron barrel, a brass bead at the muzzle
  const ry = kneel ? 8.4 : 9.8;
  const gun = grp(); gun.position.set(2.4, ry, 0.6); gun.rotation.z = kneel ? 0 : 0.34; b.add(gun); // standing: the muzzle up ahead, close to the body, never a level barrel out to the side
  add(gun, rbox(7.5, 1.6, 1.7, 0.5), M.timberPale, 0.8, 0, 0);                                   // stock
  add(gun, rbox(1.2, 1.9, 1.9, 0.2), M.ironDark, 4.9, 0, 0);                                     // lock
  add(gun, cyl(0.62, 0.62, 9.8, 8), M.ironDark, 9.5, 0.3, 0, 0, 0, Math.PI / 2);                 // barrel
  add(gun, rbox(1, 2.2, 1, 0.3), M.oilskin, -1.2, -1.2, 0);                                      // grip
  add(gun, sph(0.55, 8, 6), M.brass, 14.5, 0.3, 0);
  limb(b, [0.6, 11, 3.6], [3.6, ry - 0.2, 1.4], 1.1, M.paintCanvas);
  limb(b, [0.6, 11, -3.6], [kneel ? 7.6 : 6.4, kneel ? ry : ry + 1.6, 0.4], 1.1, M.paintCanvas);
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
  add(g, sph(2.2, 12, 8), M.lampCore, TX, 51.6, TZ + 3.4);                                             // its near-white core on the south face, where the camera looks
  add(g, sph(6.4, 16, 12), M.lampHalo, TX, 51.6, TZ); add(g, sph(8.6, 16, 12), M.lampHalo2, TX, 51.6, TZ); // its warm halo
  add(g, cyl(2.4, 3, 2, 12), M.brass, TX, 46.2, TZ);                                                   // the lamp's brass foot
  add(g, cyl(8.8, 8.8, 1.2, 24), M.ironDark, TX, 57.9, TZ);
  add(g, new THREE.ConeGeometry(8.6, 5, 24), M.canvasDark, TX, 61, TZ);                               // the canvas cone, old sailcloth, a band dimmer than the lamp; no overhang, so the lamp shows under it
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
