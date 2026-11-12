// An older machine look (STYLE.md, "Harbour machines"): a dark tarred hull under pale canvas, timber and rope in small
// amounts. One remains: the Breakwater (vanguard, a walking hull with its beached state), a fitTints reference
// (main.js). Same conventions as models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { torus } from './harbour.js';

const scaled = (pts, kx, kz, dx = 0) => pts.map(([x, z]) => [x * kx + dx, z * kz]);

/** Breakwater (vanguard, heavy): a boat's hull walking on four iron legs, its stem ahead: a tarred hull with plank
 *  seams, iron straps across it and an iron gunwale, the bow and stern decks bare tar so the dark hull and the point
 *  show in every facing; a canvas tarp humped over midships only (the pale top), ribbed on rope hoops with a seam
 *  along its ridge and a dark hem, pale forward and team aft of an ink bar; a team strake along both hull
 *  sides between ink lines and the aft deck painted team inside an ink seam; a short splash mortar on the stem. The
 *  legs are dark iron with team knee caps and team-topped foot pads (pale shins read as a second pale mass in
 *  gray). Frames 0-1 the walk (diagonal pairs stride), 2 settling (the hull coming down, the spades swinging out),
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
