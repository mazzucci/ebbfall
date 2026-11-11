// The Expedition's units after the slice (the units family, 2026-11-10; not in the game's atlas: retheme.js renders
// them by filter): the Mercenary (the Recruiting post's ranged line, a hired local), the Veteran (its heavy top tier),
// the Rover (the Factory's artillery: black-powder rockets on an electric cart) and the Drone (the Factory's fast low
// flyer). The slice's rules (expedition.js, target/art-review/slice/notes.md): charcoal kit, dark rounded heads,
// neutral white LEDs, one pale mark per unit, team on stripes, pads, packs, bumpers and rotor guards between ink
// trims, never a body slab; the Mercenary's hi-vis vest is the team colour itself (the PM). Same conventions as
// models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { torus } from './harbour.js';
import { figure } from './kingdom.js';

// ---- the family's own materials over the Expedition's set ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const A = {
    reflect: new THREE.MeshStandardMaterial({ color: 0xe4e6e0, metalness: 0.55, roughness: 0.2, envMapIntensity: 2.0 }), // the Mercenary's reflective tape: pale and glossy, so it catches the key and reads as hi-vis (expedition.js's `hivis` is dull in daylight)
  };
  FAM.set(M, A); return A;
}

/** A small cool LED with a soft halo (as expedition.js). */
function led(parent, M, r, x, y, z) {
  add(parent, sph(r, 8, 6), M.led, x, y, z); add(parent, sph(r * 2.2, 8, 6), M.ledHalo, x, y, z);
}
/** A team band round a cylinder between two ink rings. */
function band(g, M, r, h, x, y, z, rx = 0, ry = 0, rz = 0) {
  const p = grp(); p.position.set(x, y, z); p.rotation.set(rx, ry, rz); g.add(p);
  add(p, cyl(r, r, h, 12), M.paint, 0, 0, 0);
  add(p, cyl(r + 0.05, r + 0.05, 0.35, 12), M.inkLine, 0, h / 2, 0); add(p, cyl(r + 0.05, r + 0.05, 0.35, 12), M.inkLine, 0, -h / 2, 0);
  return p;
}
/** A slim modern rifle along local +x: a mid-gunmetal receiver, stock, magazine and grip, the barrel and handguard
 *  2.7-2.9 px wide at zoom 1.0 (the legibility pass of 2026-11-11: 2.0-2.3 and near-black until then); `scope` puts a
 *  scope tube with a glass lens on the receiver in place of the sight and lengthens the magazine (the Mercenary's, after
 *  the blind test read it as a long gun on a medieval soldier). */
function rifle(parent, M, x, y, z, ry = 0, { len = 14, heavy = false, scope = false } = {}) {
  const gun = grp(); gun.position.set(x, y, z); gun.rotation.set(0, ry, 0.04); parent.add(gun);
  const k = heavy ? 1.35 : 1;
  add(gun, rbox(3.6 * k, 1.9 * k, 1.6 * k, 0.4), M.gun, -3.2 * k, 0, 0);                        // the stock
  add(gun, rbox(4.0 * k, 2.2 * k, 1.8 * k, 0.4), M.gun, 0.3 * k, 0, 0);                         // the receiver
  if (heavy) add(gun, cyl(1.9, 1.9, 1.6, 14), M.joint, 0.6, -1.6, 0, 0, 0, Math.PI / 2);          // a drum magazine
  else if (scope) add(gun, rbox(1.4, 3.2, 1.3, 0.3), M.gun, 0.4, -2.4, 0, 0, 0, 0.22);           // a long curved magazine
  else add(gun, rbox(1.3, 2.6, 1.2, 0.3), M.gun, 0.3, -2.0, 0);                                 // the magazine
  add(gun, rbox(1.2, 1.6, 1.2, 0.2), M.gun, -1.2 * k, -1.4 * k, 0);                             // the grip
  if (scope) { add(gun, rbox(1.0, 0.9, 1.0, 0.1), M.joint, 0.4, 1.4, 0); add(gun, cyl(0.85, 0.85, 3.4, 10), M.joint, 0.6, 2.3, 0, 0, 0, Math.PI / 2); add(gun, cyl(0.9, 0.9, 0.4, 10), M.glass, 2.4, 2.3, 0, 0, 0, Math.PI / 2); } // the scope: a mount, a tube over the receiver, a glass lens ahead
  else add(gun, rbox(1.6, 0.9, 1.1, 0.2), M.joint, 0.4, 1.5 * k, 0);                            // the sight
  const hl = len - 9 * k;
  add(gun, rbox(hl, 1.9 * k, 1.8 * k, 0.4), M.gun, 2.3 * k + hl / 2, 0, 0);                      // the handguard
  add(gun, cyl(0.9 * k, 0.9 * k, 3.6, 8), M.gun, 2.3 * k + hl + 1.6, 0.15, 0, 0, 0, Math.PI / 2); // the barrel
  return gun;
}

/** Mercenary (ranged line, a hired local, sim r 10-11, scale 1.06; "Sellsword" in the words PR): a local in rough
 *  clothes (dark trousers and leather boots, canvas shirt sleeves) under the company's kit, which must be the read
 *  (the whole-set blind test: all four testers saw "a soldier in a medieval tunic with a long gun", the kingdom's):
 *  a big hi-vis vest, the team colour itself between ink hems, with bright reflective tape that catches the light
 *  (two bands round the body, a strip over each shoulder, a strip down the front and back on each side: the vest's
 *  pattern), a headset (a band over the cap to ear cups) and a radio on the belt with its antenna, and a modern rifle
 *  held level across the body, dark, with a scope and a long magazine. A dark peaked cap (Expedition heads are dark;
 *  the Villager's pale coif parts from it in grey), a satchel on the hip; no tunic skirt under the vest (the trousers
 *  run up to it). From the camera: a dark small head over a big team vest barred with pale glossy lines and a dark
 *  level bar with a scope; no helmet, no goggles, no camouflage: not the Marine. Frames 0-1 the step. */
export function mercenary(M, f) {
  const A = fam(M), g = figure({ ...M, tunic: M.hose, hose: M.hose }, f, { skirt: 3.3 }), b = g.body; // (the figure's tunic in the trousers' dark cloth, straight: under the vest nothing reads as a tunic's skirt)
  add(b, rbox(6.2, 5.6, 8.0, 0.5), M.paintCloth, 0.2, 10.5, 0);                                  // the hi-vis vest: the team itself, big
  add(b, rbox(6.4, 0.35, 8.2, 0.1), M.inkLine, 0.2, 13.35, 0); add(b, rbox(6.4, 0.35, 8.2, 0.1), M.inkLine, 0.2, 7.65, 0); // its hems
  for (const y of [9.0, 11.5]) add(b, rbox(6.5, 0.8, 8.3, 0.1), A.reflect, 0.2, y, 0);           // two reflective bands round it, pale and glossy
  for (const z of [-2.5, 2.5]) {
    add(b, rbox(5.6, 1.4, 1.8, 0.2), M.paintCloth, 0.2, 13.5, z); add(b, rbox(5.8, 0.3, 2.0, 0.05), M.inkLine, 0.2, 14.25, z); // its team shoulders over the shirt
    add(b, rbox(5.9, 1.4, 0.7, 0.1), A.reflect, 0.2, 13.55, z);                                  // a reflective strip over each shoulder
    add(b, rbox(6.5, 5.3, 0.7, 0.1), A.reflect, 0.2, 10.5, z);                                   // and down the front and back, through the bands: the vest's pattern
  }
  add(b, rbox(5.2, 0.8, 6.8, 0.3), M.leather, 0, 7.3, 0);                                        // the belt
  add(b, rbox(2.2, 2.6, 3.2, 0.5), M.canvasLocal, -2.4, 7.0, 3.6);                                // a satchel on the hip
  add(b, rbox(1.3, 2.0, 1.1, 0.3), M.joint, -3.6, 7.6, -1.6); add(b, cyl(0.5, 0.5, 6.5, 6), M.joint, -3.6, 11.6, -1.6); // the radio on the belt's back and its antenna (drawn thick)
  add(b, sph(1.7, 12, 10), M.skin, 0.9, 13.3, 0).scale.set(0.8, 0.95, 0.9);                     // the face
  add(b, sph(2.4, 14, 10), M.armour, 0.1, 14.3, 0).scale.set(1, 0.7, 1);                        // the cap, dark
  add(b, cyl(2.5, 2.5, 0.35, 14), M.inkLine, 0.1, 13.5, 0);                                     // its band
  add(b, rbox(2.6, 0.4, 3.4, 0.15), M.armour, 2.4, 13.8, 0, 0, 0, -0.2);                        // its peak
  add(b, torus(2.55, 0.3, 16, Math.PI), M.joint, 0.1, 13.6, 0, 0, Math.PI / 2, 0);              // the headset: a band over the cap
  for (const z of [-2.5, 2.5]) add(b, sph(0.8, 8, 6), M.joint, 0.1, 13.5, z);                     // to an ear cup each side
  const gun = rifle(b, M, 3.8, 9.3, 0, 0.3, { len: 16, scope: true });                           // the rifle, level across the body over the vest's lower band: dark, a scope on top, a long magazine under
  limb(b, [0.6, 11.4, 3.6], [2.8, 9.0, 1.6], 1.1, M.canvasLocal); add(b, sph(0.85, 8, 6), M.skin, 3.0, 8.9, 1.4);  // the trigger hand
  limb(b, [0.6, 11.4, -3.6], [6.4, 9.5, -1.2], 1.1, M.canvasLocal); add(b, sph(0.85, 8, 6), M.skin, 6.8, 9.5, -1.0); // the fore hand
  if (M.polish) { // secondary detail (the polish pass, what reads at 2x): a belt buckle, a pouch on the other hip, ink cuffs at the wrists, a sling under the rifle (the satchel's diagonal strap across the vest went with the blind test's fix: nothing crosses the vest)
    add(b, rbox(1.3, 1.1, 0.5, 0.1), M.steel, 2.75, 7.3, 0);
    add(b, rbox(1.4, 1.9, 1.8, 0.4), M.leather, 1.0, 6.8, -3.6);
    add(b, sph(1.2, 8, 6), M.inkLine, 2.47, 9.36, 1.9); add(b, sph(1.2, 8, 6), M.inkLine, 5.7, 9.73, -1.49);
    limb(gun, [-4.6, -0.7, 0.2], [-0.8, -3.4, 0.4], 0.32, M.leather); limb(gun, [-0.8, -3.4, 0.4], [5.0, -0.6, 0.2], 0.32, M.leather);
  }
  g.scale.setScalar(1.06);
  return g;
}

/** Veteran (the heavy top tier, an experienced mercenary, sim r 13, scale 1.2): a burly local in mixed plate and
 *  modern body armour: a wide torso in a charcoal carrier over a canvas coat, steel pauldrons (local plate) over team
 *  pads on both upper arms, steel greaves, a dark helmet with a white visor LED, a big riot shield of dark glass on
 *  the left arm with a pale steel rim and a team band across it between ink lines, and a heavy gun with a drum
 *  magazine and a thick barrel across the body; a team pack strip and knee pads. Wide and big on screen: clearly
 *  heavier than the Marine and the Mercenary. From the camera: a wide dark figure with a big dark square beside it
 *  and a thick bar across; a team stripe on the square. Frames 0-1 the march. */
export function veteran(M, f) {
  const g = grp(), st = [3.0, -3.0][f % 2];
  for (const side of [-1, 1]) {                                                                  // a wide stance, heavy legs in dark trousers with steel greaves
    const z = side * 2.8, s = st * side;
    add(g, rbox(4.0, 1.7, 2.6, 0.6), M.boot, s + 0.6, 0.85, z);
    limb(g, [0, 6.6, z], [s * 0.55, 3.6, z * 1.05], 1.5, M.hose);
    limb(g, [s * 0.55, 3.6, z * 1.05], [s, 1.4, z], 1.35, M.steel);                             // greaves
    add(g, sph(1.3, 8, 6), M.paint, s * 0.6, 3.8, z * 1.05).scale.set(1.1, 1, 0.9);              // team knee pads
    add(g, torus(1.1, 0.25, 10), M.inkLine, s * 0.6, 3.8, z * 1.05 + (side > 0 ? 0.9 : -0.9), 0, 0, 0); // their ink rims
  }
  const b = grp(); g.add(b);
  add(b, rbox(6.0, 6.6, 8.2, 1.8), M.canvasLocal, 0, 10.4, 0);                                  // the torso: a canvas coat, wide
  add(b, rbox(6.4, 3.8, 6.6, 0.6), M.armour, 0.4, 10.4, 0);                                     // the plate carrier, charcoal, the canvas coat showing round it
  add(b, rbox(6.6, 0.35, 6.8, 0.1), M.inkLine, 0.4, 12.4, 0); add(b, rbox(6.6, 0.35, 6.8, 0.1), M.inkLine, 0.4, 8.4, 0);
  add(b, rbox(2.4, 2.2, 2.0, 0.3), M.steel, 3.4, 10.6, 0);                                      // a steel breastplate piece, local plate
  add(b, rbox(6.4, 1.0, 8.4, 0.3), M.leather, 0, 7.4, 0);                                       // the belt
  add(b, rbox(3.0, 5.6, 6.0, 0.8), M.armour, -4.2, 10.6, 0);                                    // the pack
  add(b, rbox(1.2, 5.4, 3.6, 0.2), M.paint, -5.8, 10.6, 0); add(b, rbox(1.3, 0.3, 3.8, 0.05), M.inkLine, -5.8, 13.4, 0); add(b, rbox(1.3, 0.3, 3.8, 0.05), M.inkLine, -5.8, 7.8, 0); // a team strip down the pack
  add(b, rbox(3.2, 1.4, 6.2, 0.2), M.paint, -4.2, 13.6, 0); add(b, rbox(3.4, 0.25, 6.4, 0.05), M.inkLine, -4.2, 12.85, 0); add(b, rbox(3.4, 0.25, 6.4, 0.05), M.inkLine, -4.2, 14.35, 0); // and a team band round the pack's top, seen from above
  for (const z of [-4.6, 4.6]) {                                                                 // steel pauldrons over team pads on the upper arms
    add(b, sph(2.6, 12, 10), M.panelDark, 0.3, 13.3, z * 0.92).scale.set(1, 0.7, 1);              // (dark, matte: pale pauldrons beside the helmet read as a kettle hat, and polished steel caught the sky; the shield's frame is the pale mark)
    add(b, cyl(2.7, 2.7, 0.3, 14), M.inkLine, 0.3, 12.4, z * 0.92);
    band(b, M, 2.1, 3.2, 0.6, 10.2, z, 0.3 * Math.sign(z), 0, 0.3);
  }
  add(b, sph(1.9, 12, 10), M.skin, 1.0, 14.4, 0).scale.set(0.8, 0.95, 0.9);                     // the face
  add(b, sph(3.0, 16, 12), M.armour, 0.2, 15.3, 0).scale.set(1, 0.85, 1);                       // the helmet, dark and big
  add(b, cyl(3.1, 3.1, 0.4, 16), M.inkLine, 0.2, 14.1, 0);                                      // its rim
  add(b, rbox(1.0, 1.0, 4.6, 0.2), M.led, 2.6, 14.5, 0);                                        // the visor LED, white
  // the riot shield on the left arm: a tall dark glass plate in a pale steel frame with a team band across its top
  const sh = grp(); sh.position.set(2.0, 9.4, -5.8); sh.rotation.set(0, 0.25, 0.7); b.add(sh);   // (leaned back 0.7 rad so its face shows from the camera at every facing: upright it was a sliver edge-on)
  add(sh, rbox(1.0, 11, 7.6, 0.4), M.panel, 0, 1.0, 0);                                           // (charcoal composite over a dark glass slit: smoked glass read as a black slab)
  add(sh, rbox(1.1, 2.2, 6.2, 0.2), M.glass, 0.05, 0.4, 0);                                       // the view slit
  add(sh, rbox(1.2, 11.4, 0.7, 0.1), M.paleSteel, 0, 1.0, -3.8); add(sh, rbox(1.2, 11.4, 0.7, 0.1), M.paleSteel, 0, 1.0, 3.8); // the frame's pale uprights
  add(sh, rbox(1.2, 0.7, 8.0, 0.1), M.paleSteel, 0, 6.6, 0); add(sh, rbox(1.2, 0.7, 8.0, 0.1), M.paleSteel, 0, -4.4, 0);
  for (const y of [3.7, -1.7]) { add(sh, rbox(1.3, 3.4, 7.0, 0.1), M.paint, 0.1, y, 0); add(sh, rbox(1.4, 0.3, 7.2, 0.05), M.inkLine, 0.1, y + 1.8, 0); add(sh, rbox(1.4, 0.3, 7.2, 0.05), M.inkLine, 0.1, y - 1.8, 0); } // two wide team bands over more than half the face, between ink lines (the Guard's shield)
  add(sh, rbox(1.4, 3.0, 3.0, 0.3), M.joint, -0.8, 0.5, 0);                                      // the grip block behind
  limb(b, [0.6, 11.8, -4.4], [1.2, 9.6, -5.4], 1.35, M.canvasLocal);                             // the shield arm
  // the heavy gun across the body, in the right hand, resting on the shield's edge
  const gun = rifle(b, M, 3.8, 9.8, 0.2, 0.35, { len: 17, heavy: true });
  limb(b, [0.6, 11.8, 4.4], [2.8, 9.6, 2.4], 1.35, M.canvasLocal); add(b, sph(1.0, 8, 6), M.armour, 3.0, 9.4, 2.2);
  if (M.polish) { // secondary detail (the polish pass): the pack's straps down the carrier's front, a belt buckle, leather straps from the pauldrons over the coat's shoulders, steel bolts at the shield frame's corners, a team band round the gun's drum between ink rings (the units notes' second team piece on the gun side, where facing 0 shows no shield; no ink cuffs: the heavy's arms are short, and cuffs landed on the upper-arm team bands)
    for (const z of [-2.2, 2.2]) add(b, rbox(0.9, 3.4, 1.1, 0.3), M.joint, 3.5, 10.9, z, 0, 0, -0.2);  // (joint, darker than the charcoal carrier, as the Marine's armour straps are darker than its camo)
    add(b, rbox(1.4, 1.2, 0.6, 0.1), M.steel, 3.3, 7.4, 0);
    for (const z of [-2.6, 2.6]) add(b, rbox(1.0, 0.6, 2.4, 0.1), M.leather, 0.6, 13.85, z);
    for (const [y, z] of [[6.6, -3.8], [6.6, 3.8], [-4.4, -3.8], [-4.4, 3.8]]) add(sh, sph(0.55, 8, 6), M.steel, 0.65, y, z);
    add(gun, torus(1.9, 0.4, 16), M.paint, 0.6, -1.6, 0, 0, Math.PI / 2, 0); for (const dx of [-0.55, 0.55]) add(gun, torus(1.95, 0.2, 16), M.inkLine, 0.6 + dx, -1.6, 0, 0, Math.PI / 2, 0);
  }
  g.scale.setScalar(1.2);
  return g;
}

/** Rover (artillery, long range, sim r 16): a modern electric cart carrying a local rocket battery: a charcoal tub up
 *  on four pale wheels (the Buggy's kind), a team stripe along each side and team bumpers between trims, a small open
 *  cab at the bow with a screen and two white headlights, and behind it an oak rack holding six black-powder rockets
 *  in canvas-wrapped timber tubes, angled up ahead, their paper noses pale (the pale mark); a rope coil, a battery
 *  pack, a whip antenna. From the camera: a long dark cart with a bank of thick tubes pointing up and ahead over it:
 *  never the Buggy's open cage or the Bot's flat tray. Frames 0-1 the roll (the hubs' marks turn). */
export function rover(M, f) {
  const g = grp(), b = grp(); b.position.y = 5.0; g.add(b);
  add(b, rbox(24, 2.4, 11, 0.9), M.trim, 0, 0, 0);                                              // the chassis tub
  add(b, rbox(23.2, 1.2, 10.4, 0.5), M.panel, 0, 1.6, 0);                                       // the body panel, charcoal
  for (const z of [-5.5, 5.5]) { add(b, rbox(20, 2.4, 0.6, 0.1), M.paint, 0, 1.2, z); add(b, rbox(20.2, 0.25, 0.65, 0.05), M.inkLine, 0, 2.5, z); add(b, rbox(20.2, 0.25, 0.65, 0.05), M.inkLine, 0, -0.1, z); } // the team stripe along each side
  for (const [x, z] of [[-7.5, -7.0], [7.5, -7.0], [-7.5, 7.0], [7.5, 7.0]]) {                   // the wheels: big and pale
    add(b, cyl(4.4, 4.4, 3.0, 20), M.tyrePale, x, -0.6, z, Math.PI / 2, 0, 0);
    add(b, cyl(2.4, 2.4, 3.1, 12), M.paleSteel, x, -0.6, z, Math.PI / 2, 0, 0);
    add(b, rbox(3.4, 0.6, 3.2, 0.1), M.joint, x, -0.6, z, Math.PI / 2, (f % 2) * 0.6, 0);
    add(b, rbox(3.6, 0.9, 3.2, 0.3), M.joint, x, 0.2, z * 0.8);
  }
  for (const x of [13.0, -13.0]) { add(b, rbox(1.4, 2.2, 11.6, 0.3), M.paint, x, 0.8, 0); add(b, rbox(1.5, 0.3, 11.8, 0.1), M.inkLine, x, 2.0, 0); add(b, rbox(1.5, 0.3, 11.8, 0.1), M.inkLine, x, -0.4, 0); } // team bumpers, front and rear, tall
  // the cab at the bow: a low screen, a seat with a driver, two headlights
  add(b, rbox(0.8, 3.0, 7.0, 0.3), M.glass, 8.6, 3.6, 0, 0, 0, -0.3); add(b, rbox(1.0, 3.3, 7.3, 0.1), M.joint, 8.4, 3.6, 0, 0, 0, -0.3);
  for (const z of [-3.2, 3.2]) led(b, M, 0.6, 12.2, 2.4, z);
  add(b, rbox(3.0, 1.0, 3.0, 0.4), M.paint, 5.4, 2.6, 0); add(b, rbox(1.0, 3.0, 3.0, 0.4), M.paint, 4.0, 4.0, 0); add(b, rbox(1.1, 0.3, 3.2, 0.05), M.inkLine, 4.0, 5.6, 0); // the seat, a team pad
  add(b, cyl(1.6, 1.9, 2.4, 10), M.uniform, 5.6, 4.2, 0); add(b, sph(1.4, 12, 10), M.armour, 5.8, 6.2, 0).scale.set(1, 0.85, 1); led(b, M, 0.35, 7.0, 6.3, 0); // the driver: a dark helmet with a lamp
  // the rocket rack: an oak frame over the back, six tubes angled up ahead, pale paper noses
  const rk = grp(); rk.position.set(-4.0, 2.2, 0); rk.rotation.z = 0.5; b.add(rk);
  for (const z of [-4.2, 0, 4.2]) for (const y of [0, 2.6]) {
    add(rk, cyl(1.15, 1.15, 12, 10), M.canvasLocal, 0, 2.0 + y, z, 0, 0, Math.PI / 2);           // a canvas-wrapped timber tube
    add(rk, cyl(1.25, 1.25, 1.2, 10), M.joint, -4.5, 2.0 + y, z, 0, 0, Math.PI / 2); add(rk, cyl(1.25, 1.25, 1.2, 10), M.joint, 4.5, 2.0 + y, z, 0, 0, Math.PI / 2); // iron hoops
    band(rk, M, 1.3, 2.6, 1.6, 2.0 + y, z, 0, 0, Math.PI / 2);                                     // a team cloth band round each tube between ink rings
    add(rk, cyl(0.9, 0.5, 2.0, 10), M.paleSteel, 6.9, 2.0 + y, z, 0, 0, -Math.PI / 2);          // the rocket's nose, pale
  }
  for (const x of [-4.5, 4.5]) { add(rk, rbox(1.2, 7.0, 10.4, 0.3), M.oak, x, 2.6, 0); }         // the rack's oak frames
  for (const z of [-5.9, 5.9]) { add(rk, rbox(8.6, 4.4, 0.5, 0.15), M.paintCloth, 0, 1.6, z); add(rk, rbox(8.8, 0.35, 0.55, 0.05), M.inkLine, 0, 3.95, z); add(rk, rbox(8.8, 0.35, 0.55, 0.05), M.inkLine, 0, -0.75, z); } // team cloths laced down the rack's flanks between ink hems (the battery's covers)
  for (const z of [-5.6, 5.6]) add(rk, rbox(10.0, 1.0, 1.0, 0.3), M.paleSteel, 0, 5.6, z);        // and pale steel rails
  for (const z of [-5.5, 5.5]) { add(b, rbox(18, 0.5, 1.2, 0.1), M.paint, -1, 2.4, z * 0.86); add(b, rbox(18.2, 0.2, 1.4, 0.05), M.inkLine, -1, 2.6, z * 0.86); } // team stripes along the body's top edges (the Buggy's)
  for (const [x, z] of [[-9.0, -3.4], [-9.0, 3.4], [-2.0, -3.4], [-2.0, 3.4]]) limb(b, [x, 2.2, z], [x + 1.6, 6.4, z], 0.5, M.steel); // steel struts holding the rack
  add(b, rbox(5.0, 2.4, 8.0, 0.5), M.panelDark, -9.5, 3.2, 0);                                   // the battery pack at the stern
  add(b, torus(1.6, 0.5, 14), M.rope, -9.5, 4.8, 3.0, Math.PI / 2, 0, 0);                        // a rope coil on it
  add(b, cyl(0.5, 0.55, 9, 6), M.joint, -11.0, 7.0, -4.4);                                       // a whip antenna
  if (M.polish) { // secondary detail (the polish pass): bolt rings on the hubs (the Buggy's), two team cargo straps over the rocket tubes between ink edges (the company's straps; they keep the share at the floor, which the rings' pixels would have taken it under), a cable from the battery pack up to the rack, a tow hook at the bow
    for (const [x, z] of [[-7.5, -7.0], [7.5, -7.0], [-7.5, 7.0], [7.5, 7.0]]) add(b, torus(1.55, 0.22), M.joint, x, -0.6, z + Math.sign(z) * 1.6);
    for (const x of [-2.6, 3.5]) { add(rk, rbox(1.4, 0.5, 11.0, 0.1), M.inkLine, x, 5.85, 0); add(rk, rbox(0.9, 0.6, 11.0, 0.1), M.paintCloth, x, 5.95, 0); }
    limb(b, [-7.6, 4.5, 2.4], [-5.6, 5.4, 3.0], 0.3, M.cable);
    add(b, rbox(1.2, 0.8, 1.0, 0.3), M.steel, 13.9, 0.4, -3.0);
  }
  return g;
}

/** Drone (the fast low flyer, harasses ground and air; sim r 11, flies at 19, just over head height): a quadcopter: a
 *  small charcoal body with a white LED at its nose and a camera pod under it (a dark ball with a glass lens and a
 *  lamp), four arms out to four rotors under dark hubs, each rotor a pale pair of blades on a dark disc inside a
 *  team rotor guard ring over an ink ring, two skids. Low, so its shadow sits close under it (the Balloon's is far
 *  off). From the camera: a small dark cross with four team rings and a close shadow; nothing on the ground is a
 *  ring. Frames 0-1 the rotors turn. */
export function drone(M, f) {
  const g = grp(), FY = 19, b = grp(); b.position.y = FY; g.add(b);
  add(b, rbox(5.0, 1.8, 3.8, 0.7), M.panel, 0, 0, 0);                                            // the body
  add(b, rbox(4.0, 0.5, 3.0, 0.2), M.panelDark, 0, 1.0, 0);                                      // its top hatch
  led(b, M, 0.5, 2.7, 0.2, 0);                                                                   // the nose light
  add(b, sph(1.3, 10, 8), M.joint, 1.0, -1.6, 0);                                                // the camera pod
  add(b, cyl(0.7, 0.7, 0.6, 10), M.glass, 2.2, -1.6, 0, 0, 0, Math.PI / 2); led(b, M, 0.3, 1.2, -2.6, 0); // its lens and lamp
  for (const z of [-1.6, 1.6]) { limb(b, [1.6, -0.9, z], [1.6, -2.6, z * 1.1], 0.3, M.joint); limb(b, [-1.6, -0.9, z], [-1.6, -2.6, z * 1.1], 0.3, M.joint); add(b, rbox(5.0, 0.4, 0.5, 0.15), M.joint, 0, -2.8, z * 1.1); } // the skids
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {                                  // four arms to four rotors
    const x = sx * 4.6, z = sz * 4.6;
    limb(b, [sx * 2.2, 0.2, sz * 1.6], [x, 0.4, z], 0.5, M.joint);
    add(b, cyl(0.9, 1.0, 1.4, 10), M.joint, x, 0.6, z);                                            // the motor
    add(b, cyl(3.2, 3.2, 0.2, 20), M.rotor, x, 1.3, z);                                            // the rotor's disc, a blur
    add(b, rbox(6.2, 0.25, 0.9, 0.1), M.paleSteel, x, 1.4, z, 0, (f % 2) * 0.8 + sx * sz * 0.4, 0); // the two blades, pale (the pale mark)
    add(b, torus(3.5, 0.5, 24), M.inkLine, x, 1.0, z, Math.PI / 2, 0, 0);                         // the guard's ink ring, under
    add(b, torus(3.5, 0.4, 24), M.paint, x, 1.25, z, Math.PI / 2, 0, 0);                          // the team rotor guard over it
    add(b, torus(3.0, 0.15, 24), M.inkLine, x, 1.35, z, Math.PI / 2, 0, 0);                        // and an inner ink ring
  }
  add(b, cyl(0.5, 0.5, 3.0, 6), M.joint, -2.2, 2.0, 0);                                           // an antenna (drawn thick)
  if (M.polish) { // secondary detail (the polish pass): a battery pack strapped on the hatch, three struts from each motor out to its guard ring, a dark hub cap over each rotor
    add(b, rbox(2.6, 0.9, 2.2, 0.3), M.panelDark, -1.0, 1.7, 0); add(b, rbox(0.7, 1.0, 2.5, 0.1), M.joint, -1.0, 1.75, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * 4.6, z = sz * 4.6, t0 = Math.atan2(sz, sx);
      for (const d of [0, 2.1, -2.1]) limb(b, [x, 0.9, z], [x + 3.3 * Math.cos(t0 + d), 1.2, z + 3.3 * Math.sin(t0 + d)], 0.4, M.joint);
      add(b, sph(0.55, 8, 6), M.joint, x, 1.55, z);
    }
  }
  return g;
}
