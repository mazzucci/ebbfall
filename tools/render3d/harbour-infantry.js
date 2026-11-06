// Harbour infantry (STYLE.md, "Harbour infantry"): sailors in tar oilskin coats under round canvas hats, team canvas on
// the sleeves and a band round the crown. The Rigger (harvester) and the Picket (trooper, with its dug-in state) from
// step 0; the Harpooner (lancer) and the Mender (medic) from step 1. Each kind owns an outline from above at 18 px:
// the Rigger a figure ahead of a barrow, the Picket a pale disc with a slim rifle angled up, the Harpooner a thick
// level harpoon gun as long as the body with a rope coil behind the hat, the Mender a cream satchel at the hip, a lamp
// held up ahead and no gun at all. Same conventions as models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { lathe, torus } from './harbour.js';

/** The family's own materials, made once per material set (`M`): the Mender's ash coat and dark satchel, its small
 *  lamp, a wetter sandbag. */
function infantryMats(M) {
  if (M.ash) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.ash = std({ color: 0xaaa696, map: M.canvas.map, roughness: 0.92, metalness: 0 });                   // the Mender's coat: ash sailcloth, a band below the hat's pale canvas, far above tar
  M.sailDark = std({ color: 0x6e6a60, map: M.canvas.map, roughness: 0.95, metalness: 0 });              // the Mender's satchel: dark old sailcloth, so the team cross and its ink stand off it in every seat
  M.lampSmall = std({ color: 0xfff6dc, emissive: 0xffe9b0, emissiveIntensity: 3.2 });                  // the Mender's hand lamp (r 0.9): warm, dimmer than the Lighthouse's, not team
  M.lampSmallHalo = new THREE.MeshBasicMaterial({ color: 0xffc870, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
  M.sandbagDark = std({ color: 0x5a5448, map: M.sandbag.map, roughness: 1, metalness: 0 });                  // one wetter bag in the dug-in ring, so the bags part
  return M;
}

/** A sailor in a tar oilskin coat: legs by frame (two strides), or kneeling (`kneel`: the right knee down, the left
 *  foot forward); the body lowered to `drop`. Returns the group; the head sits at y 13.6 - drop. */
function sailor(M, f, { kneel = false, coat = M.tar } = {}) {
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
  add(b, cyl(3.3, 4.1, 3.6, 12), coat, 0, 7.4, 0);                                             // the coat's flared skirt
  add(b, rbox(5.2, 6.2, 6.8, 1.6), coat, 0, 10.4, 0);                                           // the coat
  add(b, rbox(5.4, 0.9, 7, 0.3), M.ironDark, 0, 8.4, 0);                                        // belt
  add(b, rbox(2, 2.2, 1.4, 0.4), M.ironDark, 2.6, 8.4, 0.2);                                    // buckle pouch
  add(b, sph(2.1, 16, 12), M.oilskin, 0.2, 13.5, 0);                                            // head (hood up)
  add(b, sph(1.6, 12, 10), M.canvasDark, 1.2, 13.3, 0).scale.set(0.8, 0.9, 0.9);               // the face, in the hood's shade
  return Object.assign(g, { body: b });
}

/** The family's round canvas hat on a body `b`: a pale brim and crown, the team band round the crown between two black
 *  ink rings, a dark line under the brim. `brim`, `crown` radii and the crown's height shape each kind's disc. */
function hat(M, b, { brim = 4.4, crown = 3.1, h = 4.05, band = 1.9 } = {}) {
  const g = grp(); g.position.set(0.2, 14.6, 0); b.add(g);
  const top = h - 1.05, k = crown / 3.1;
  add(g, lathe([[0, 0], [brim, 0], [brim, 0.5], [crown + 0.1, 0.65], [crown, top], [crown - 0.7 * k, top + 0.6], [1 * k, h - 0.1], [0, h]]), M.canvas, 0, 0, 0);
  add(g, cyl(brim + 0.05, brim + 0.05, 0.3, 24), M.canvasDark, 0, 0.1, 0);                      // the brim's underside
  add(g, cyl(brim + 0.1, brim + 0.1, 0.3, 24), M.inkLine, 0, -0.1, 0);                         // a dark line under the brim
  const y0 = 0.9 + band / 2;
  add(g, cyl(crown + 0.15, crown + 0.15, band, 20), M.paintCanvas, 0, y0, 0);                   // team band round the crown
  add(g, cyl(crown + 0.25, crown + 0.25, 0.5, 20), M.inkLine, 0, 0.9, 0); add(g, cyl(crown + 0.25, crown + 0.25, 0.5, 20), M.inkLine, 0, y0 + band / 2 + 0.2, 0); // black ink rings above and below it
  return g;
}

/** Rigger (worker): the smallest Harbour figure, upright, in a pale canvas cap, a big pale salt sack over the right
 *  shoulder on its back (salt is what it gathers), tied with a team cord, and a short pick held low in the left hand
 *  (a short tool, never a shaft that could read as a rifle); team sleeves, a team yoke on the free shoulder and a
 *  team apron. From above a small pale cap with a big pale lump beside and behind it on a dark body: not the
 *  Picket's disc and bar, not the Mender's whole pale coat. The hand-barrow of step 0 is gone: beside the upright
 *  kinds its low dark cart made the Rigger read as a figure lying low. Frames: 0-1 the march. */
export function rigger(M, f) {
  infantryMats(M);
  const g = sailor(M, f), b = g.body;
  add(b, cyl(2.5, 2.7, 1.3, 14), M.canvas, 0.2, 15.4, 0);                                       // a pale canvas cap, small: the head shows beside the sack
  add(b, cyl(2.65, 2.65, 0.8, 14), M.paintCanvas, 0.2, 14.6, 0);                                 // its team band
  add(b, cyl(2.75, 2.75, 0.3, 14), M.inkLine, 0.2, 14.1, 0); add(b, cyl(2.75, 2.75, 0.3, 14), M.inkLine, 0.2, 15.05, 0);
  add(b, rbox(2, 0.4, 3, 0.15), M.oilskin, 2.6, 15.2, 0);                                       // its peak
  for (const side of [-1, 1]) add(b, rbox(3.6, 1.3, 3.4, 0.7), M.paintCanvas, -0.2, 13.1, side * 3.6, side * 0.35, 0, 0); // the yoke over the shoulders (team)
  add(b, rbox(5.2, 0.4, 7.4, 0.1), M.inkLine, -0.2, 12.4, 0);
  add(b, rbox(0.6, 5.2, 4.4, 0.3), M.paintCanvas, 2.7, 9.6, 0);                                  // the apron over the coat's front (team)
  add(b, rbox(0.7, 0.4, 4.6, 0.1), M.inkLine, 2.75, 12.3, 0); add(b, rbox(0.7, 0.4, 4.6, 0.1), M.inkLine, 2.75, 6.9, 0);
  // the salt sack: a fat pale sack on the back, its neck bunched up by the shoulder, tied round the middle with a
  // team band and at the neck with a team cord, each between ink rings
  const sack = add(b, sph(3.4, 16, 12), M.canvas, -4.0, 8.6, 0); sack.scale.set(0.9, 1.35, 1);       // low on the back: its top under the cap in every facing
  add(b, sph(2.2, 12, 10), M.canvas, -2.8, 13.0, 0).scale.set(0.9, 0.75, 1);                     // the bunched neck
  add(b, cyl(2.0, 2.1, 0.9, 14), M.paintCanvas, -2.9, 12.3, 0);                                   // the cord (team)
  add(b, cyl(2.2, 2.2, 0.3, 14), M.inkLine, -2.9, 11.75, 0); add(b, cyl(2.2, 2.2, 0.3, 14), M.inkLine, -2.9, 12.85, 0);
  add(b, cyl(3.3, 3.4, 1.4, 16), M.paintCanvas, -4.0, 8.2, 0).scale.set(0.92, 1, 1.02);           // the band round the middle (team)
  add(b, cyl(3.45, 3.45, 0.35, 16), M.inkLine, -4.0, 7.35, 0).scale.set(0.92, 1, 1.02); add(b, cyl(3.45, 3.45, 0.35, 16), M.inkLine, -4.0, 9.05, 0).scale.set(0.92, 1, 1.02);
  // the right arm up, holding the sack's neck over the shoulder; the left arm down with the pick held low, its head ahead
  limb(b, [0.6, 11, 3.6], [-1.4, 12.4, 1.8], 1.15, M.paintCanvas);
  add(b, sph(0.9, 8, 6), M.oilskin, -1.8, 12.9, 1.4);
  limb(b, [0.6, 11, -3.6], [2.4, 7.4, -3.4], 1.15, M.paintCanvas);
  add(b, sph(0.9, 8, 6), M.oilskin, 2.6, 6.9, -3.3);
  add(b, cyl(0.42, 0.42, 5, 8), M.timber, 3.2, 6.2, -3.3, 0, 0, -1.2);                            // a short handle, down and ahead
  add(b, rbox(1.1, 1.2, 4.4, 0.3), M.canvas, 5.4, 5.4, -3.3);                                    // the pick's head, across, crusted pale with salt so it reads on the dark ground
  for (const side of [-1, 1]) add(b, new THREE.ConeGeometry(0.5, 1.6, 6), M.brass, 5.4, 5.4, -3.3 + side * 2.9, side * Math.PI / 2, 0, 0);
  g.scale.setScalar(0.95);
  return g;
}

/** Picket (line infantry): a sailor under a round canvas hat, pale brim and crown, the team band round the crown
 *  between two black ink rings; team canvas sleeves and a narrow team pack on the back; a slim rifle, its stock and
 *  muzzle wrapped in pale canvas round a thin dark barrel (pale timber was seat 0's own hue, and the rifle vanished
 *  on it), held close and angled up ahead: from above a pale disc with a thin bar. The plain rifleman: beside the
 *  Harpooner its rifle is thin and short and it carries no coil. Frames: 0-1 the march, 2 going to ground
 *  (kneeling, a few sandbags laid ahead), 3 dug in (one course of separate bags round the front, the rifle angled up
 *  over them, never along them; a team groundsheet spread behind). */
export function picket(M, f) {
  infantryMats(M);
  const st = f < 2 ? 0 : f - 1, kneel = st > 0;                                                  // 0 marching, 1 settling, 2 dug in
  const g = sailor(M, f, { kneel }), b = g.body;
  hat(M, b);
  add(b, rbox(2.6, 5.4, 4.2, 0.6), M.paintCanvas, -3.8, 10.6, 0);                                // a narrow pack on the back (team): the figure stays slim
  add(b, rbox(2.8, 0.4, 4.4, 0.1), M.inkLine, -3.8, 13.3, 0); add(b, rbox(2.8, 0.4, 4.4, 0.1), M.inkLine, -3.8, 7.9, 0);
  add(b, rbox(2.9, 0.5, 1.4, 0.15), M.rope, -3.8, 11.6, 0);                                      // its strap
  add(b, rbox(0.8, 2.2, 1.6, 0.3), M.ironDark, -5.2, 9.2, 1.2);                                  // water can
  // arms (team canvas sleeves) and the rifle: a canvas-wrapped stock, a slim iron barrel, a canvas-wrapped muzzle, a brass bead
  const ry = kneel ? 9.2 : 9.8;
  const gun = grp(); gun.position.set(2.4, ry, 0.6); gun.rotation.z = kneel ? 0.3 : 0.4; b.add(gun); // the muzzle up ahead, close to the body, never a level barrel out to the side
  add(gun, rbox(7.5, 1.6, 1.7, 0.5), M.canvas, 0.8, 0, 0);                                       // stock, wrapped in pale canvas
  add(gun, rbox(1.2, 1.9, 1.9, 0.2), M.ironDark, 4.9, 0, 0);                                     // lock
  add(gun, cyl(0.62, 0.62, 9.8, 8), M.ironDark, 9.5, 0.3, 0, 0, 0, Math.PI / 2);                 // barrel
  add(gun, cyl(0.8, 0.8, 2.6, 8), M.canvas, 12.6, 0.3, 0, 0, 0, Math.PI / 2);                    // a canvas wrap at the muzzle: the tip reads on the dark ground in every seat
  add(gun, rbox(1, 2.2, 1, 0.3), M.oilskin, -1.2, -1.2, 0);                                      // grip
  add(gun, sph(0.55, 8, 6), M.brass, 14.5, 0.3, 0);
  limb(b, [0.6, 11, 3.6], [3.6, ry - 0.2, 1.4], 1.1, M.paintCanvas);
  limb(b, [0.6, 11, -3.6], [kneel ? 7.2 : 6.4, kneel ? ry + 1.6 : ry + 1.8, 0.4], 1.1, M.paintCanvas);
  // the cover: separate wet sandbags laid round the front, low, with gaps between them (a wall under the rifle merged
  // with it into one thick bar); three while settling, a crescent of six dug in; the groundsheet behind
  if (st) {
    const R = 7.4, n = st === 2 ? 6 : 3;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * 0.6 + (k + (st === 2 ? 0 : 1.5)) * (Math.PI * 1.2 / 5), x = Math.cos(a) * R, z = Math.sin(a) * R;
      add(g, rbox(2.4, 1.9, 2.9, 0.9), k === 2 ? M.sandbagDark : M.sandbag, x, 0.95, z, 0, -a, 0);   // one wetter bag, so the bags part
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

/** Harpooner (lancer): a sailor under a low-crowned hat, standing tall with the harpoon gun shouldered and angled
 *  up ahead (a level gun made the figure read as lying prone): a timber butt behind the shoulder, a thick tube
 *  served with pale canvas, an iron muzzle ring, the harpoon's pale shaft out of it with a cork float on the line
 *  near the tip and a brass head with barbs. A small coil of tan rope with a dark eye hangs low at the right hip,
 *  smaller than the hat (behind the hat it read as a second head). From above: a pale disc, a pale shaft rising
 *  ahead with a dot (the float) and a barbed tip, a small ring at the hip. Team: the sleeves, the hat band, the pack,
 *  the grip and the breech wrap, each between ink rings. Frames: 0-1 the march. */
export function harpooner(M, f) {
  infantryMats(M);
  const g = sailor(M, f), b = g.body;
  hat(M, b, { brim: 4.5, crown: 3.0, h: 4.3, band: 2.7 });                                          // a lower crown than the Picket's, a wide band
  add(b, rbox(3.2, 5.2, 5.2, 0.7), M.paintCanvas, -4.0, 10.4, 0);                                // the pack (team)
  add(b, rbox(3.4, 0.4, 5.4, 0.1), M.inkLine, -4.0, 13.05, 0); add(b, rbox(3.4, 0.4, 5.4, 0.1), M.inkLine, -4.0, 7.75, 0);
  add(b, torus(2.0, 0.75, 24), M.rope, -1.4, 7.4, 4.2, 0.9, 0, 0.3);                             // the coil, low at the right hip, tilted so it shows as a ring from above and from the side
  add(b, cyl(1.3, 1.3, 0.5, 12), M.inkLine, -1.4, 7.4, 4.2, 0.9, 0, 0.3);                         // its dark eye
  add(b, rbox(0.5, 1.6, 0.5, 0.1), M.oilskin, -1.4, 9.3, 3.6);                                    // the strap it hangs by
  // the harpoon gun: on the right shoulder, angled up ahead; its line runs back down to the coil
  const gun = grp(); gun.position.set(0.8, 11.6, 2.9); gun.rotation.z = 0.52; b.add(gun);
  add(gun, rbox(6, 2.2, 2.2, 0.6), M.timber, -3.6, -0.6, 0);                                     // the butt, behind the shoulder
  add(gun, rbox(4, 2.5, 2.5, 0.3), M.paintCanvas, -2.3, -0.6, 0);                                // the grip, team canvas
  add(gun, rbox(0.4, 2.7, 2.7, 0.1), M.inkLine, -4.4, -0.6, 0); add(gun, rbox(0.4, 2.7, 2.7, 0.1), M.inkLine, -0.2, -0.6, 0);
  add(gun, cyl(1.3, 1.3, 11, 12), M.canvas, 5.6, 0, 0, 0, 0, Math.PI / 2);                       // the tube, served with pale canvas
  add(gun, cyl(1.45, 1.45, 5.6, 12), M.paintCanvas, 3.3, 0, 0, 0, 0, Math.PI / 2);               // team canvas over the breech, half the tube
  for (const x of [0.3, 6.3]) add(gun, cyl(1.6, 1.6, 0.8, 12), M.inkLine, x, 0, 0, 0, 0, Math.PI / 2); // its ink rings, wide enough to part a white seat from the pale tube at 1x
  add(gun, cyl(1.8, 1.8, 1.4, 14), M.ironDark, 11.5, 0, 0, 0, 0, Math.PI / 2);                   // the iron muzzle ring
  const far = [];                                                                                 // the shaft, float and head: no cast shadow (scene.js `noShadow`), so the raised gun's shadow stays short
  far.push(add(gun, cyl(0.6, 0.6, 7.5, 8), M.canvas, 15.2, 0, 0, 0, 0, Math.PI / 2));            // the harpoon's shaft, pale, out of the tube
  far.push(add(gun, sph(1.15, 10, 8), M.canvasDark, 16.4, 0.9, 0));                               // the cork float on the line, near the tip
  far.push(add(gun, sph(0.7, 8, 6), M.canvas, 16.7, 1.2, 0.3));                                   // its lit top
  far.push(add(gun, new THREE.ConeGeometry(1.0, 3.2, 8), M.brass, 20.2, 0, 0, 0, 0, -Math.PI / 2)); // the head: brass, a tip only
  for (const side of [-1, 1]) far.push(add(gun, rbox(2, 0.45, 1, 0.1), M.brass, 18, 0, side * 0.95, 0, side * 0.65, 0)); // barbs
  for (const m of far) m.userData.noShadow = true;
  add(gun, rbox(1.2, 1.6, 1.6, 0.3), M.ironDark, 0.2, -1.5, 0);                                  // the trigger block
  add(gun, cyl(0.3, 0.3, 5.5, 6), M.rope, 13.4, 1.1, 0.3, 0, 0, Math.PI / 2);                    // the line along the shaft to the shank
  limb(b, [0.4, 10.2, 3.2], [-1.4, 8.4, 4.4], 0.3, M.rope);                                        // the line down to the coil
  limb(b, [0.6, 11, 3.6], [5.4, 13.8, 3], 1.4, M.paintCanvas);                                   // the fore hand, up under the tube
  add(b, sph(1, 8, 6), M.oilskin, 5.7, 14.1, 2.9);
  limb(b, [0.6, 11, -3.6], [0.4, 10.2, 1.2], 1.4, M.paintCanvas);                                // the rear hand, at the grip across the chest
  add(b, sph(1, 8, 6), M.oilskin, 0.3, 10.2, 1.6);
  g.scale.setScalar(1.08);
  return g;
}

/** Mender (medic, unarmed): the palest-bodied Harbour human: an ash sailcloth coat (a band below the hat, which
 *  stays the pale top; cream put the white seat's straps and cross at the coat's own value) under the round hat with
 *  a tall crown, a broad satchel of dark sailcloth high on the back with a team cross on its flap and its back face between
 *  ink edges, two team straps over the shoulders, a small warm hand lamp in a brass cage carried low in the right
 *  hand at the hip, the left hand on the strap; team sleeves, the hat band and a team hem round the coat's skirt.
 *  From above a pale disc on an ash figure, a dark square with a cross behind the hat and one small warm dot low
 *  at its side: no long bar, no sack on a dark body. The one Harbour unit that is pale-bodied (a satchel alone read
 *  as a Rigger's pack), and the one light on Harbour infantry (r 1, not team). Frames: 0-1 the march. */
export function mender(M, f) {
  infantryMats(M);
  const g = sailor(M, f, { coat: M.ash }), b = g.body;
  hat(M, b, { brim: 4.1, crown: 2.9, h: 5.0, band: 2.6 });                                        // a narrower brim, a tall crown
  add(b, cyl(3.9, 4.3, 2.0, 12), M.paintCanvas, 0, 6.3, 0);                                      // the coat's hem bound in team canvas
  add(b, cyl(3.95, 4.1, 0.4, 12), M.inkLine, 0, 7.45, 0); add(b, cyl(4.3, 4.4, 0.4, 12), M.inkLine, 0, 5.2, 0);
  add(b, rbox(5.4, 1.0, 7.0, 0.3), M.inkLine, 0, 8.4, 0);                                         // the belt, ink on the pale coat
  // the satchel: old sailcloth, high on the back, its flap over the top, a team cross on the flap and the back face
  const sx = -4.1, sy = 11.6;
  add(b, rbox(3.0, 6.0, 7.2, 0.7), M.sailDark, sx, sy, 0);
  add(b, rbox(3.3, 1.8, 7.5, 0.5), M.sailDark, sx, sy + 2.4, 0);                                  // the flap
  add(b, rbox(3.4, 0.35, 7.6, 0.1), M.inkLine, sx, sy + 1.4, 0);                                  // its dark edge
  add(b, rbox(3.5, 0.35, 7.7, 0.1), M.inkLine, sx, sy - 3.0, 0);                                  // an ink line at its foot
  for (const [w, d] of [[3.6, 1.1], [1.1, 3.6]]) {                                                 // the cross on top, team between ink edges
    add(b, rbox(w + 0.7, 0.3, d + 0.7, 0.05), M.inkLine, sx, sy + 3.3, 0);
    add(b, rbox(w, 0.4, d, 0.05), M.paintCanvas, sx, sy + 3.45, 0);
  }
  for (const [w, d] of [[3.4, 1.0], [1.0, 3.4]]) {                                                 // and on the back face
    add(b, rbox(0.3, w + 0.7, d + 0.7, 0.05), M.inkLine, sx - 1.55, sy - 0.3, 0);
    add(b, rbox(0.4, w, d, 0.05), M.paintCanvas, sx - 1.65, sy - 0.3, 0);
  }
  for (const z of [-2.2, 2.2]) {                                                                   // two straps over the shoulders (team), between ink hems
    add(b, rbox(5.2, 0.9, 1.6, 0.2), M.paintCanvas, -0.4, 13.0, z, 0, 0, -0.12);
    add(b, rbox(5.4, 1.0, 1.9, 0.1), M.inkLine, -0.4, 12.8, z, 0, 0, -0.12);
    add(b, rbox(0.9, 4.6, 1.6, 0.2), M.paintCanvas, 2.7, 10.4, z);                                 // down the chest
    add(b, rbox(1.0, 4.8, 1.9, 0.1), M.inkLine, 2.55, 10.4, z);
  }
  // the left hand on the strap; the right arm down, the lamp in its hand low at the hip, ahead
  limb(b, [0.6, 11, -3.6], [3.2, 10.4, -2.4], 1.25, M.paintCanvas);
  add(b, sph(0.95, 8, 6), M.oilskin, 3.5, 10.3, -2.3);
  limb(b, [0.6, 11, 3.6], [3.0, 7.6, 3.6], 1.25, M.paintCanvas);
  add(b, sph(0.95, 8, 6), M.oilskin, 3.2, 7.2, 3.6);
  const lx = 3.6, ly = 5.4, lz = 3.8;
  add(b, torus(0.5, 0.15, 10), M.brass, lx, ly + 2.1, lz);                                        // the ring it hangs by, from the hand
  add(b, cyl(1.2, 1.0, 0.5, 10), M.brass, lx, ly + 1.4, lz);                                      // its cap
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; add(b, rbox(0.25, 2.6, 0.25, 0.08), M.ironDark, lx + Math.cos(a) * 1.1, ly, lz + Math.sin(a) * 1.1); } // the cage
  add(b, sph(1.0, 10, 8), M.lampSmall, lx, ly, lz);                                               // the lamp
  add(b, sph(0.5, 8, 6), M.lampCore, lx + 0.3, ly + 0.2, lz + 0.6);                               // its white core, on the south face
  add(b, sph(1.7, 10, 8), M.lampSmallHalo, lx, ly, lz);
  add(b, cyl(1.2, 1.3, 0.5, 10), M.brass, lx, ly - 1.4, lz);                                      // its foot
  g.scale.setScalar(1.08);
  return g;
}
