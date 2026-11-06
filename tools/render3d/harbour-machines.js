// The Harbour machines (STYLE.md, "Harbour machines"): boxes and hulls, a dark tarred hull under pale canvas, timber
// and rope in small amounts, brass only on a muzzle. Step 1's family: the Breakwater (vanguard, a walking hull with
// its beached state), the Anchor Gun (siegeTank, a long gun on a heavy frame with its anchored state) and the Netter
// (interceptor, a wheeled box with a flak mount and a folded net). Same conventions as models.js: game units, units
// face +x, y up, +z south. Each kind owns one cue a stranger names at 20 px: the boat hull on legs, the long gun, the
// box with a net; the three never differ by size alone (legs, a long bar, round wheels).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { torus } from './harbour.js';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
/** A half-cylinder shell (a canvas hood) with its axis along z, open side down. */
const hood = (r, len, seg = 16) => memo(`mh${r},${len},${seg}`, () => { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return g; });
const halfDisc = (r, seg = 16) => memo(`md${r},${seg}`, () => new THREE.CircleGeometry(r, seg, 0, Math.PI));
const scaled = (pts, kx, kz, dx = 0) => pts.map(([x, z]) => [x * kx + dx, z * kz]);

/** A cart wheel with its axle along z: a pale timber disc inside an iron tyre (so it reads as a disc from the side),
 *  a dark hub and three dark spokes on the outer face turning with `turn`. `side` says which face is outside; `disc`
 *  the disc's material (team paint on the Anchor Gun's, the ink tyre its seam). */
function wheel(g, M, r, x, y, z, side, turn, disc = M.timberPale) {
  add(g, cyl(r - 0.35, r - 0.35, 1.3, 20), disc, x, y, z, Math.PI / 2);
  add(g, torus(r - 0.3, 0.5, 22), M.ironDark, x, y, z);
  add(g, cyl(0.95, 0.95, 1.8, 10), M.ironDark, x, y, z, Math.PI / 2);
  for (let k = 0; k < 3; k++) add(g, rbox(0.45, (r - 0.9) * 2, 0.35, 0.1), M.oilskin, x, y, z + side * 0.75, 0, 0, k * Math.PI / 3 + turn);
}
/** A tube along local +x from `x0`, radius `r0` at the breech to `r1` at the muzzle, with a brass muzzle ring. */
function barrel(g, M, x0, len, r0, r1, y = 0, z = 0) {
  add(g, cyl(r1, r0, len, 12), M.ironDark, x0 + len / 2, y, z, 0, 0, -Math.PI / 2);
  add(g, torus(r1 + 0.05, 0.22, 12), M.brass, x0 + len - 0.2, y, z, 0, Math.PI / 2, 0);
}

/** Breakwater (vanguard, heavy): a boat's hull walking on four iron legs, its stem ahead: a tarred hull with plank
 *  seams, iron straps across it and an iron gunwale, the bow and stern decks bare tar so the dark hull and the point
 *  show in every facing; a canvas tarp humped over midships only (the pale top), ribbed on rope hoops with a seam
 *  along its ridge and a dark hem, pale forward and team aft of an ink bar; a team strake along both hull
 *  sides between ink lines and the aft deck painted team inside an ink seam; a short splash mortar on the stem. The
 *  legs are dark iron with team knee caps and team-topped foot pads (pale shins read as a second pale mass in
 *  grey). Frames 0-1 the walk (diagonal pairs stride), 2 settling (the hull coming down, the spades swinging out),
 *  3 beached (look.js UNIT_POSE): the hull down on the sand, the legs crouched tight, four pale-bladed spades out on
 *  the ground either side. A dark hull under canvas on legs, never a pale egg on stilts. */
export function breakwater(M, f) {
  const g = grp(), st = f < 2 ? 0 : f - 1;                                                     // 0 walking, 1 settling, 2 beached
  const lift = [8, 4, 0.6][st];                                                                // the keel above the ground
  const b = grp(); b.position.y = lift; g.add(b);
  const HULL = [[15.5, 0], [13, -2.6], [8, -5.6], [-2, -7], [-9, -6.4], [-12.5, -3.4], [-13.5, 0], [-12.5, 3.4], [-9, 6.4], [-2, 7], [8, 5.6], [13, 2.6]];
  add(b, plate(HULL, 6.5, 1.3), M.tar, 0, 0, 0);                                               // the hull: tarred planks, the stem at +x
  add(b, plate(scaled(HULL, 1.02, 1.05), 3.4, 0.3), M.paintCanvas, 0, 1.9, 0);                 // the team strake along both sides, 3.4 tall
  add(b, plate(scaled(HULL, 1.025, 1.06), 0.45, 0.1), M.inkLine, 0, 1.5, 0); add(b, plate(scaled(HULL, 1.025, 1.06), 0.45, 0.1), M.inkLine, 0, 5.25, 0); // ink lines either side
  add(b, plate(scaled(HULL, 1.03, 1.06), 1.2, 0.4), M.ironDark, 0, 5.6, 0);                    // the iron gunwale
  for (const z of [-2.2, 0, 2.2]) add(b, rbox(26, 0.3, 0.35, 0.1), M.oilskin, 0.6, 6.5, z);      // the deck's plank seams, dark lines along it
  for (const x of [-9.5, 8.5]) add(b, rbox(1, 0.5, 11.6, 0.15), M.ironDark, x, 6.6, 0);          // iron straps across the deck
  add(b, plate([[-6.4, -5.2], [-6.4, 5.2], [-10.2, 4.4], [-11.6, 0], [-10.2, -4.4]], 0.8, 0.2), M.paintCanvas, 0, 6.5, 0); // the aft deck, painted team
  add(b, plate([[-6, -5.5], [-6, 5.5], [-10.5, 4.7], [-12, 0], [-10.5, -4.7]], 0.5, 0.1), M.inkLine, 0, 6.4, 0);       // its ink seam
  // the tarp: a canvas hump over midships, pale forward of an ink bar and team aft of it (three bands across read as
  // stripes, an insect), a rope hoop ribbing the pale part, a seam down the ridge, a dark hem worn at the foot
  add(b, plate([[5.6, -5.3], [5.6, 5.3], [-0.6, 5.5], [-0.6, -5.5]], 4.2, 1.6), M.canvas, 0, 6.6, 0);
  add(b, plate([[-1, -5.5], [-1, 5.5], [-5.8, 5.6], [-5.8, -5.6]], 4.2, 1.6), M.paintCanvas, 0, 6.6, 0);
  add(b, plate([[-0.5, -5.6], [-0.5, 5.6], [-1.1, 5.6], [-1.1, -5.6]], 4.3, 1.6), M.inkLine, 0, 6.58, 0);   // the ink bar between them
  add(b, plate([[5.8, -5.5], [5.8, 5.5], [-6, 5.8], [-6, -5.8]], 0.7, 0.2), M.oilskin, 0, 6.5, 0);         // the hem, dark, worn at the foot
  add(b, torus(5.6, 0.3, 24, Math.PI), M.rope, 2.8, 6.9, 0);                                   // the hoop, a rib over the pale canvas
  add(b, rbox(5.6, 0.4, 0.5, 0.1), M.canvasDark, 2.6, 10.9, 0);                                 // the seam along the ridge
  add(b, rbox(1.4, 2.4, 1.4, 0.3), M.timber, -12.4, 7.2, 0);                                   // the stern post
  // the mortar on the dark stem: a short fat tube angled up ahead on an iron pivot (never the Anchor Gun's long bar)
  const gun = grp(); gun.position.set(12.4, 8.2, 0); gun.rotation.z = 0.62; b.add(gun);
  add(b, cyl(1.4, 1.7, 1.8, 12), M.ironDark, 12.4, 7.4, 0);
  add(gun, cyl(1.5, 1.3, 5.5, 12), M.ironDark, 2.6, 0, 0, 0, 0, -Math.PI / 2);
  add(gun, torus(1.5, 0.28, 12), M.brass, 5.2, 0, 0, 0, Math.PI / 2, 0);
  // the legs: four, dark iron, hips under the hull's sides; walking they stride in diagonal pairs; settling they fold; beached, crouched
  const stride = st ? 0 : [3.5, -3.5][f % 2];
  for (const side of [-1, 1]) for (const i of [0, 1]) {
    const hx = i ? -7 : 6, s = stride * (i ? -side : side), z = side * 6.4, hip = [hx, lift + 1.2, z];
    const knee = [[hx + s * 0.4, lift - 0.6, side * 11.6], [hx, lift - 0.2, side * 10.8], [hx, 4.6, side * 9.6]][st];
    const foot = [[hx + s, 1, side * 13.6], [hx, 1, side * 13], [hx, 1, side * 12.2]][st];
    add(g, sph(1.5, 12, 10), M.ironDark, ...hip);
    limb(g, hip, knee, 1.4, M.ironDark);
    add(g, sph(1.7, 12, 10), M.paintCanvas, ...knee);                                          // a team knee cap
    add(g, sph(1.9, 12, 10), M.inkLine, ...knee).scale.set(1, 0.3, 1);                          // its ink seam
    limb(g, knee, [foot[0], foot[1] + 0.8, foot[2]], 1.15, M.ironDark);
    add(g, rbox(3.6, 1.1, 3, 0.4), M.ironDark, foot[0], 0.55, foot[2]);                        // the foot pad
    add(g, rbox(3, 0.5, 2.4, 0.1), M.paintCanvas, foot[0], 1.3, foot[2]);                      // its team top (the pad's iron edge is its seam)
  }
  // the spades: four timber shafts from the gunwale with broad pale blades, out and down into the sand when beached
  if (st) {
    const out = st === 2;
    for (const side of [-1, 1]) for (const x of [6.5, -7.5]) {
      const top = [x, lift + 6.4, side * 6.4], tip = out ? [x, 0.5, side * 14] : [x, 2.8, side * 11];
      limb(g, top, tip, 0.55, M.timber);
      const bl = grp(); bl.position.set(tip[0], tip[1] + 0.3, tip[2]); bl.rotation.x = out ? 0 : -side * 0.9; g.add(bl);
      add(bl, rbox(4.8, 0.8, 4.4, 0.3), M.timberPale, 0, 0, side * 0.6);                        // the blade, pale timber
      add(bl, rbox(5, 0.6, 1, 0.2), M.ironDark, 0, -0.1, side * 3);                              // its iron edge
    }
  }
  return g;
}

/** Anchor Gun (siegeTank, heavy): a long gun on a heavy frame: a tarred carriage between two iron-shod timber runners
 *  on six spoked wheels, its whole deck team canvas between ink lines, a low pale canvas hood on hoops over the crew
 *  at the stern (the pale top); the gun a 21-unit tapered iron barrel on iron trunnion cheeks forward, a team band
 *  round its breech, a brass muzzle ring. Frames 0-1 travelling (the gun level, the anchor lashed on the hood), 2 half
 *  anchored (the gun rising, the anchor swinging down off the stern), 3 anchored (look.js UNIT_POSE): the gun raised
 *  and an anchor dropped on the sand astern, a pale hawser taut to it. The long gun ahead of a box: nothing else in
 *  the family has one. */
export function anchorGun(M, f) {
  const g = grp(), st = f < 2 ? 0 : f - 1;                                                     // 0 travelling, 1 half, 2 anchored
  const elev = [0.03, 0.26, 0.46][st];
  for (const side of [-1, 1]) {                                                                // the runners and the wheels
    const z = side * 7.4;
    add(g, rbox(23, 2.4, 3, 0.6), M.timber, 0, 3.6, z);
    add(g, rbox(23.4, 0.9, 3.3, 0.2), M.ironDark, 0, 2.5, z);
    for (const x of [-8, 0, 8]) wheel(g, M, 2.9, x, 2.9, side * 9.5, side, (f % 2) * 0.55 + x * 0.1, M.paintCanvas); // (the discs team-painted: a gun carriage's wheels)
  }
  add(g, rbox(21, 5.2, 13, 0.8), M.tar, 0, 6.6, 0);                                             // the carriage: a tarred box
  for (const x of [-7.5, 6.5]) add(g, rbox(1, 5.6, 13.6, 0.2), M.ironDark, x, 6.6, 0);          // iron bands
  add(g, rbox(2.2, 4.4, 10, 0.5), M.ironDark, 10.4, 6.2, 0);                                    // the bow plate
  add(g, rbox(15, 0.9, 11.4, 0.3), M.paintCanvas, -0.5, 9.5, 0);                                // the team deck, the carriage's whole top
  add(g, rbox(15.6, 0.4, 12, 0.1), M.inkLine, -0.5, 9.15, 0);                                  // its ink hem
  // the hood over the crew at the stern: pale canvas on three rope hoops, closed at both ends with old sailcloth
  const HX = -9.4, HR = 4.6, HL = 12.4;
  add(g, hood(HR, HL), M.canvas, HX, 9.2, 0);
  for (const z of [-5, 0, 5]) add(g, torus(HR + 0.15, 0.35, 24, Math.PI), M.rope, HX, 9.2, z);
  for (const side of [-1, 1]) {                                                                // its ends closed with team canvas inside an ink rim
    add(g, halfDisc(HR - 0.1), M.inkLine, HX, 9.2, side * (HL / 2 - 0.2), 0, side > 0 ? 0 : Math.PI, 0);
    add(g, halfDisc(HR - 0.7), M.paintCanvas, HX, 9.2, side * (HL / 2 - 0.1), 0, side > 0 ? 0 : Math.PI, 0);
  }
  add(g, rbox(0.6, 1.4, 12.6, 0.1), M.inkLine, HX + HR - 0.2, 9.5, 0);                          // ink where the hood meets the team deck
  // the gun: trunnion cheeks on the deck, the breech and the long barrel elevated by frame, a team band round the breech
  const GX = 3.4;
  for (const side of [-1, 1]) add(g, rbox(4.2, 4.6, 1, 0.3), M.ironDark, GX, 11.6, side * 2.2);
  add(g, cyl(0.8, 0.8, 5.4, 10), M.ironDark, GX, 12.6, 0, Math.PI / 2);                         // the trunnion
  const gun = grp(); gun.position.set(GX, 12.6, 0); gun.rotation.z = elev; g.add(gun);
  add(gun, cyl(2, 2.1, 5.2, 14), M.ironDark, -3, 0, 0, 0, 0, -Math.PI / 2);                     // the breech
  add(gun, cyl(2.15, 2.15, 1.8, 14), M.paintCanvas, -2.6, 0, 0, 0, 0, -Math.PI / 2);            // the team band round it
  for (const x of [-3.7, -1.5]) add(gun, cyl(2.25, 2.25, 0.4, 14), M.inkLine, x, 0, 0, 0, 0, -Math.PI / 2);
  add(gun, sph(1.7, 10, 8), M.ironDark, -5.8, 0, 0);                                            // the cascabel
  barrel(gun, M, -0.4, 21, 1.55, 1.05);                                                         // the long gun
  add(gun, rbox(4, 0.6, 1.2, 0.2), M.timberPale, 4, 1.7, 0);                                    // a pale sight rail on top of the chase
  add(g, cyl(0.5, 0.5, 3.4, 8), M.ironDark, GX - 4.2, 10.6, 0, 0, 0, 0.3);                      // the elevating screw
  // the anchor: lashed on the hood, or swinging down at the stern, or dropped astern with the hawser taut
  const an = grp(); g.add(an);
  if (st === 0) { an.position.set(HX, 9.2 + HR - 0.2, 0); an.rotation.set(0, 0, 0); }
  else if (st === 1) { an.position.set(-15, 4.8, 0); an.rotation.set(0, 0, 1.3); }
  else { an.position.set(-21.5, 0.5, 0); an.rotation.set(0, 0, 0); }
  an.scale.setScalar(1.25);
  add(an, cyl(0.5, 0.6, 7.5, 8), M.ironDark, 0, 0, 0, 0, 0, Math.PI / 2);                       // the shank (along x: the crown aft, the ring forward)
  add(an, rbox(1.1, 0.9, 7.6, 0.3), M.timberPale, 3.2, 0, 0);                                  // the stock, pale timber, across the ring end
  add(an, plate([[-3.5, 0], [-5.4, -2.6], [-6.6, -1.9], [-4.6, 0], [-6.6, 1.9], [-5.4, 2.6]], 0.9, 0.3), M.ironDark, 0, -0.45, 0); // the arms and flukes
  add(an, torus(0.9, 0.3, 12), M.ironDark, 4.4, 0, 0, Math.PI / 2, 0, 0);                        // the ring
  if (st) { const post = [-12, 8.6, 0], ring = st === 2 ? [-16, 0.7, 0] : [-15 + Math.cos(1.3) * 5.5, 4.8 + Math.sin(1.3) * 5.5, 0]; limb(g, post, ring, 0.42, M.rope); } // the hawser
  add(g, cyl(0.8, 1, 2.2, 8), M.ironDark, -12, 8.6, 0);                                        // the stern post it is made fast to
  return g;
}

/** Netter (interceptor, anti-air): a wheeled box with a flak mount and a folded net: a tarred box on four big
 *  pale-rimmed cart wheels, its whole long sides team canvas between ink lines and a team roof over the cab; behind
 *  the cab the folded net on a reel, a fat drum of pale rope wider than the box between pale timber end discs, cork
 *  floats in two rows along it, its mesh hanging down the tail (the pale top); on the cab roof a twin flak mount,
 *  two short fat tubes set well apart, angled up ahead on one cradle, brass at the muzzles. Two frames: the wheels
 *  turn. The box with a net: round wheels, a drum across and a short steep pair of tubes, never the Breakwater's
 *  pointed hull nor the Anchor Gun's long level gun. */
export function netter(M, f) {
  const g = grp();
  for (const side of [-1, 1]) for (const x of [-5, 5]) wheel(g, M, 4, x, 4, side * 7.6, side, f * 0.55 + (x > 0 ? 0.35 : 0));
  for (const x of [-5, 5]) add(g, cyl(0.6, 0.6, 14.8, 8), M.ironDark, x, 4, 0, Math.PI / 2);     // the axles
  add(g, rbox(15, 1.4, 11, 0.4), M.timber, 0, 5, 0);                                            // the bed
  add(g, rbox(14.6, 5.4, 10.8, 0.8), M.tar, 0, 8.3, 0);                                         // the box
  for (const side of [-1, 1]) {                                                                // the long sides team canvas, ink along the top and the foot
    add(g, rbox(13.6, 4.2, 0.5, 0.15), M.paintCanvas, 0, 8.2, side * 5.5);
    add(g, rbox(13.9, 0.45, 0.6, 0.1), M.inkLine, 0, 10.5, side * 5.55); add(g, rbox(13.9, 0.45, 0.6, 0.1), M.inkLine, 0, 5.9, side * 5.55);
  }
  for (const x of [-7, 0.2, 7]) add(g, rbox(0.8, 5.8, 11.4, 0.2), M.ironDark, x, 8.3, 0);        // iron bands
  add(g, rbox(6.6, 0.9, 10.6, 0.3), M.paintCanvas, 4, 11.4, 0);                                 // the cab's team roof
  add(g, rbox(7, 0.4, 11, 0.1), M.inkLine, 4, 11.05, 0);                                        // its ink hem
  add(g, rbox(0.6, 2.2, 8.6, 0.2), M.canvasDark, 7.4, 9.9, 0, 0, 0, -0.35);                     // the windscreen's canvas drop
  // the net reel behind the cab: a fat drum of pale rope wider than the box, pale timber discs at its ends, floats in two rows
  add(g, cyl(3.4, 3.4, 13.4, 18), M.rope, -3.6, 13, 0, Math.PI / 2);
  for (const side of [-1, 1]) { add(g, cyl(3.9, 3.9, 0.9, 18), M.timberPale, -3.6, 13, side * 7.1, Math.PI / 2); add(g, cyl(1, 1, 1.6, 8), M.ironDark, -3.6, 13, side * 7.4, Math.PI / 2); }
  for (const [dx, dy] of [[-1.6, 3.1], [1.6, 3.1]]) for (let z = -5.5; z <= 5.5; z += 1.83) add(g, sph(0.72, 8, 6), M.canvas, -3.6 + dx, 13 + dy, z); // the cork floats
  for (let k = 0; k < 6; k++) add(g, torus(3.5, 0.17, 18), M.oilskin, -3.6, 13, -5.4 + k * 2.16, 0, 0, k * 0.4);  // the twine seen round the drum
  for (const dz of [-4.5, -1.5, 1.5, 4.5]) limb(g, [-7.6, 12.4, dz], [-8.6, 5.8, dz], 0.18, M.rope);      // the mesh hanging down the tail
  for (const y of [11, 9.2, 7.4]) limp(g, y, M);
  for (let k = 0; k < 4; k++) add(g, sph(0.5, 8, 6), M.canvas, -8.8, 5.8, -4.5 + k * 3);         // the floats on its hem
  // the twin flak mount on the cab roof: a pintle, one cradle, two fat tubes well apart, angled up ahead
  add(g, cyl(1, 1.2, 1.6, 10), M.ironDark, 3.6, 12.6, 0);
  const mt = grp(); mt.position.set(3.6, 13.9, 0); mt.rotation.z = 0.9; g.add(mt);
  add(mt, rbox(3.4, 2, 7.2, 0.4), M.ironDark, 0.4, 0, 0);
  add(mt, rbox(1.6, 1.2, 7.6, 0.3), M.paintCanvas, 1.4, 1.5, 0);                                 // a team strap over the cradle
  for (const side of [-1, 1]) barrel(mt, M, -0.8, 8.4, 1.15, 1, 0, side * 2.5);
  add(mt, cyl(0.35, 0.35, 5.6, 6), M.timber, 5.6, 0.8, 0, Math.PI / 2);                          // a timber spreader between the tubes
  add(g, rbox(1.8, 1.6, 2.2, 0.4), M.oilskin, 0.8, 12.3, 0);                                     // the gunner's seat behind it
  return g;
}
/** One horizontal strand of the net's hanging mesh at height `y`, sagging a little outward as it goes down. */
function limp(g, y, M) { const x = -7.8 - (12.4 - y) * 0.14; limb(g, [x, y, -5], [x, y, 5], 0.18, M.rope); }
