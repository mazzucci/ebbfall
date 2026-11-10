// The Expedition's units after the slice (the units family, 2026-11-10; not in the game's atlas: retheme.js renders
// them by filter): the Mercenary (the Recruiting post's ranged line, a hired local), the Veteran (its heavy top tier),
// the Rover (the Factory's artillery: black-powder rockets on an electric cart) and the Drone (the Factory's fast low
// flyer). The slice's rules (expedition.js, target/art-review/slice/notes.md): charcoal kit, dark rounded heads,
// neutral white LEDs, one pale mark per unit, team on stripes, pads, packs, bumpers and rotor guards between ink
// trims, never a body slab; the Mercenary's hi-vis vest is the team colour itself (the PM). Same conventions as
// models.js: game units, units face +x, y up, +z south.
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { torus } from './harbour.js';
import { figure } from './kingdom.js';

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
/** A slim modern rifle along local +x: a dark receiver, stock, magazine and grip, the barrel drawn twice its thickness. */
function rifle(parent, M, x, y, z, ry = 0, { len = 14, heavy = false } = {}) {
  const gun = grp(); gun.position.set(x, y, z); gun.rotation.set(0, ry, 0.04); parent.add(gun);
  const k = heavy ? 1.35 : 1;
  add(gun, rbox(3.6 * k, 1.6 * k, 1.3 * k, 0.4), M.gun, -3.2 * k, 0, 0);                        // the stock
  add(gun, rbox(4.0 * k, 1.9 * k, 1.5 * k, 0.4), M.gun, 0.3 * k, 0, 0);                         // the receiver
  if (heavy) add(gun, cyl(1.9, 1.9, 1.6, 14), M.joint, 0.6, -1.6, 0, 0, 0, Math.PI / 2);          // a drum magazine
  else add(gun, rbox(1.1, 2.4, 1.0, 0.3), M.gun, 0.3, -1.9, 0);                                 // the magazine
  add(gun, rbox(1.0, 1.4, 1.0, 0.2), M.gun, -1.2 * k, -1.3 * k, 0);                             // the grip
  add(gun, rbox(1.4, 0.8, 0.9, 0.2), M.joint, 0.4, 1.3 * k, 0);                                 // the sight
  const hl = len - 9 * k;
  add(gun, rbox(hl, 1.5 * k, 1.4 * k, 0.4), M.gun, 2.3 * k + hl / 2, 0, 0);                      // the handguard
  add(gun, cyl(0.65 * k, 0.65 * k, 3.6, 8), M.gun, 2.3 * k + hl + 1.6, 0.15, 0, 0, 0, Math.PI / 2); // the barrel
  return gun;
}

/** Mercenary (ranged line, a hired local, sim r 10-11, scale 1.06): a local in rough clothes (a dulled canvas tunic,
 *  dark trousers, leather boots) wearing the company's hi-vis vest, which is the team colour itself between ink hems
 *  with two pale reflective bands (the PM: so it never reads as the gold seat or a neutral hi-vis), a slim modern
 *  rifle held level across the body, a dark peaked cap (Expedition heads are dark; the Villager's pale coif parts
 *  from it in grey), a satchel on the hip. From the camera: a dark small head over a team vest with two pale lines and
 *  a short dark level bar; no helmet, no goggles, no camouflage: not the Marine. Frames 0-1 the step. */
export function mercenary(M, f) {
  const g = figure({ ...M, tunic: M.canvasLocal, hose: M.hose }, f, { skirt: 3.8 }), b = g.body;
  add(b, rbox(5.8, 5.0, 7.6, 0.5), M.paintCloth, 0.2, 10.6, 0);                                  // the hi-vis vest: the team itself, big
  add(b, rbox(6.0, 0.35, 7.8, 0.1), M.inkLine, 0.2, 13.15, 0); add(b, rbox(6.0, 0.35, 7.8, 0.1), M.inkLine, 0.2, 8.05, 0); // its hems
  for (const y of [9.3, 11.3]) add(b, rbox(6.0, 0.5, 7.8, 0.1), M.hivis, 0.2, y, 0);              // two thin reflective bands round it, pale grey
  for (const z of [-2.4, 2.4]) { add(b, rbox(5.4, 1.2, 1.6, 0.2), M.paintCloth, 0.2, 13.4, z); add(b, rbox(5.6, 0.3, 1.8, 0.05), M.inkLine, 0.2, 14.05, z); } // its team shoulders over the coat
  add(b, rbox(5.2, 0.8, 6.8, 0.3), M.leather, 0, 7.7, 0);                                        // the belt
  add(b, rbox(2.2, 2.6, 3.2, 0.5), M.canvasLocal, -2.4, 7.2, 3.6);                                // a satchel on the hip
  add(b, sph(1.7, 12, 10), M.skin, 0.9, 13.3, 0).scale.set(0.8, 0.95, 0.9);                     // the face
  add(b, sph(2.4, 14, 10), M.armour, 0.1, 14.3, 0).scale.set(1, 0.7, 1);                        // the cap, dark
  add(b, cyl(2.5, 2.5, 0.35, 14), M.inkLine, 0.1, 13.5, 0);                                     // its band
  add(b, rbox(2.6, 0.4, 3.4, 0.15), M.armour, 2.4, 13.8, 0, 0, 0, -0.2);                        // its peak
  rifle(b, M, 3.6, 8.8, 0, 0.3);                                                                 // the rifle, level across the body, held low so the vest shows
  limb(b, [0.6, 11.4, 3.6], [2.6, 8.6, 1.6], 1.1, M.canvasLocal); add(b, sph(0.85, 8, 6), M.skin, 2.8, 8.4, 1.4);  // the trigger hand
  limb(b, [0.6, 11.4, -3.6], [6.0, 9.0, -1.2], 1.1, M.canvasLocal); add(b, sph(0.85, 8, 6), M.skin, 6.4, 9.0, -1.0); // the fore hand
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
    add(b, sph(2.8, 12, 10), M.paleSteel, 0.3, 13.4, z * 0.92).scale.set(1, 0.7, 1);              // (pale steel: the heavy's pale mark, big)
    add(b, cyl(2.9, 2.9, 0.3, 14), M.inkLine, 0.3, 12.4, z * 0.92);
    band(b, M, 2.1, 3.2, 0.6, 10.2, z, 0.3 * Math.sign(z), 0, 0.3);
  }
  add(b, sph(1.9, 12, 10), M.skin, 1.0, 14.4, 0).scale.set(0.8, 0.95, 0.9);                     // the face
  add(b, sph(3.0, 16, 12), M.armour, 0.2, 15.3, 0).scale.set(1, 0.85, 1);                       // the helmet, dark and big
  add(b, cyl(3.1, 3.1, 0.4, 16), M.inkLine, 0.2, 14.1, 0);                                      // its rim
  add(b, rbox(1.0, 1.0, 4.6, 0.2), M.led, 2.6, 14.5, 0);                                        // the visor LED, white
  // the riot shield on the left arm: a tall dark glass plate in a pale steel frame with a team band across its top
  const sh = grp(); sh.position.set(2.0, 9.0, -5.8); sh.rotation.set(0, 0.25, 0); b.add(sh);
  add(sh, rbox(1.0, 11, 7.6, 0.4), M.panel, 0, 1.0, 0);                                           // (charcoal composite over a dark glass slit: smoked glass read as a black slab)
  add(sh, rbox(1.1, 2.2, 6.2, 0.2), M.glass, 0.05, 0.4, 0);                                       // the view slit
  add(sh, rbox(1.2, 11.4, 0.7, 0.1), M.paleSteel, 0, 1.0, -3.8); add(sh, rbox(1.2, 11.4, 0.7, 0.1), M.paleSteel, 0, 1.0, 3.8); // the frame's pale uprights
  add(sh, rbox(1.2, 0.7, 8.0, 0.1), M.paleSteel, 0, 6.6, 0); add(sh, rbox(1.2, 0.7, 8.0, 0.1), M.paleSteel, 0, -4.4, 0);
  add(sh, rbox(1.3, 3.2, 7.0, 0.1), M.paint, 0.1, 3.4, 0); add(sh, rbox(1.4, 0.3, 7.2, 0.05), M.inkLine, 0.1, 5.15, 0); add(sh, rbox(1.4, 0.3, 7.2, 0.05), M.inkLine, 0.1, 1.65, 0); // the team band, wide
  add(sh, rbox(1.3, 2.4, 7.0, 0.1), M.paint, 0.1, -2.6, 0); add(sh, rbox(1.4, 0.3, 7.2, 0.05), M.inkLine, 0.1, -1.3, 0); add(sh, rbox(1.4, 0.3, 7.2, 0.05), M.inkLine, 0.1, -3.9, 0); // and a second, low
  add(sh, rbox(1.4, 3.0, 3.0, 0.3), M.joint, -0.8, 0.5, 0);                                      // the grip block behind
  limb(b, [0.6, 11.8, -4.4], [1.2, 9.6, -5.4], 1.35, M.canvasLocal);                             // the shield arm
  // the heavy gun across the body, in the right hand, resting on the shield's edge
  rifle(b, M, 3.8, 9.8, 0.2, 0.35, { len: 17, heavy: true });
  limb(b, [0.6, 11.8, 4.4], [2.8, 9.6, 2.4], 1.35, M.canvasLocal); add(b, sph(1.0, 8, 6), M.armour, 3.0, 9.4, 2.2);
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
  return g;
}
