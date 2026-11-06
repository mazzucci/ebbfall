// Harbour infantry (STYLE.md, "Harbour infantry"): sailors in tar oilskin coats, team canvas on the sleeves. The
// Rigger (harvester) and the Picket (trooper, with its dug-in state) from step 0; the Harpooner (lancer) and the
// Mender (medic) from step 1. Each kind owns a signature bigger than its hat, read at 18 px, every figure upright: the
// Rigger the smallest, a dark cap and a fat pale sack slung across its back; the Picket a pale round hat and a thin
// rifle angled up, dug in inside a ring of pale sandbags; the Harpooner the longest gun in the infantry, past the body
// at both ends, a drum of pale line on it; the Mender an ash coat and a big cream satchel with a dark cross, a lamp
// held low and no gun at all. Same conventions as models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { lathe, torus } from './harbour.js';

/** The family's own materials, made once per material set (`M`): the Mender's ash coat and pale satchel, its small
 *  lamp, the dug-in Picket's pale sandbags, the Harpooner's pale line. */
function infantryMats(M) {
  if (M.ash) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.ash = std({ color: 0xaaa696, map: M.canvas.map, roughness: 0.92, metalness: 0 });                   // the Mender's coat: ash sailcloth, a band below the hat's pale canvas, far above tar
  M.satchel = std({ color: 0xe8e0c8, map: M.canvas.map, roughness: 0.9, metalness: 0 });               // the Mender's satchel: cream canvas, the palest cloth on a Harbour figure, never team, so the dark cross reads on it in every seat
  M.lampSmall = std({ color: 0xfff6dc, emissive: 0xffe9b0, emissiveIntensity: 3.2 });                  // the Mender's hand lamp (r 1): warm, dimmer than the Lighthouse's, not team
  M.lampSmallHalo = new THREE.MeshBasicMaterial({ color: 0xffc870, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
  M.sandbagPale = std({ color: 0xd2c8aa, map: M.sandbag.map, roughness: 1, metalness: 0 });            // the dug-in ring: pale burlap, so the ring reads on dark ground in every seat
  M.sandbagShade = std({ color: 0xa79d82, map: M.sandbag.map, roughness: 1, metalness: 0 });           // every third bag a band darker, so the bags part
  M.ropePale = std({ color: 0xd9c9a0, bumpMap: M.rope.bumpMap, bumpScale: 1.2, roughness: 0.95, metalness: 0 }); // the Harpooner's line, wound pale on its gun
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

/** Rigger (worker): the smallest Harbour figure and the one that carries things: a fat pale salt sack across both
 *  shoulders behind the head, wider than the body, its bunched ends drooping either side, tied with two team cords;
 *  both hands up holding it, the body leant forward under the load. A dark tar cap with a team band (no pale hat:
 *  the sack is its one pale mass, so it never reads as the others' white hat). Team sleeves, cap band, cords and an
 *  apron. From above a fat pale bar across the body behind a small dark head: not a disc, not a bar ahead. The
 *  hand-barrow of step 0 is gone (a low dark cart read as a figure lying low). Frames: 0-1 the march. */
export function rigger(M, f) {
  infantryMats(M);
  const g = sailor(M, f), b = g.body;
  b.rotation.z = -0.14;                                                                           // leant forward under the load
  add(b, sph(2.55, 14, 10), M.oilskin, 0.3, 15.0, 0).scale.set(1, 0.62, 1);                     // a dark tar cap, close on the head
  add(b, cyl(2.6, 2.65, 1.0, 14), M.paintCanvas, 0.3, 14.7, 0);                                   // its team band
  add(b, cyl(2.72, 2.72, 0.3, 14), M.inkLine, 0.3, 14.1, 0); add(b, cyl(2.72, 2.72, 0.3, 14), M.inkLine, 0.3, 15.25, 0);
  add(b, rbox(1.8, 0.4, 3, 0.15), M.oilskin, 2.7, 14.4, 0);                                       // its peak
  add(b, rbox(0.6, 5.2, 4.4, 0.3), M.paintCanvas, 2.7, 9.6, 0);                                   // the apron over the coat's front (team)
  add(b, rbox(0.7, 0.4, 4.6, 0.1), M.inkLine, 2.75, 12.3, 0); add(b, rbox(0.7, 0.4, 4.6, 0.1), M.inkLine, 2.75, 6.9, 0);
  // the salt sack across the shoulders, behind the head: a fat pale bolster wider than the body, its ends bunched
  // and drooping, two team cords round it between ink rings
  add(b, rbox(3.4, 5.6, 6.6, 0.8), M.paintCanvas, -2.9, 10.0, 0);                                  // a team waistcoat's back, under the load
  add(b, rbox(3.6, 0.4, 6.8, 0.1), M.inkLine, -2.9, 7.3, 0);
  const sk = grp(); sk.position.set(-3.1, 14.8, 0); sk.rotation.y = -0.5; b.add(sk);                // slung across the back over the left shoulder, its left end forward: a slant in every facing
  add(sk, sph(3.0, 18, 12), M.canvas, 0, 0, 0).scale.set(1, 0.9, 1.9);
  add(sk, sph(1.9, 12, 10), M.canvas, -0.4, 1.6, 1.2).scale.set(1, 0.8, 1.4);                     // a lump of salt in it, so the sack is lumpy, not a cigar
  for (const side of [-1, 1]) {
    add(sk, sph(2.3, 12, 10), M.canvas, -0.1, -2.0, side * 5.6).scale.set(1, 1.15, 0.9);           // a bunched end, draped down
    add(sk, cyl(3.05, 3.05, 1.3, 16), M.paintCanvas, 0, 0, side * 3.2, Math.PI / 2, 0, 0).scale.set(1, 1, 0.9); // a cord (team)
    for (const dz of [-0.82, 0.82]) add(sk, cyl(3.15, 3.15, 0.3, 16), M.inkLine, 0, 0, side * 3.2 + dz, Math.PI / 2, 0, 0).scale.set(1, 1, 0.9);
  }
  // the left hand up on the sack's forward end over the shoulder; the right arm down, the hand on a short pick at the hip
  limb(b, [0.6, 11, -3.6], [0.2, 14.0, -4.4], 1.2, M.paintCanvas);
  add(b, sph(0.9, 8, 6), M.oilskin, 0.0, 14.5, -4.5);
  limb(b, [0.6, 11, 3.6], [1.8, 7.6, 3.9], 1.2, M.paintCanvas);
  add(b, sph(0.9, 8, 6), M.oilskin, 2.0, 7.1, 3.9);
  add(b, cyl(0.42, 0.42, 4.6, 8), M.timber, 3.4, 6.5, 3.9, 0, 0, -1.2);                           // a short handle, down and ahead
  add(b, rbox(1.0, 1.1, 3.8, 0.3), M.canvas, 5.4, 5.7, 3.9);                                      // the pick's head, across, crusted pale with salt
  for (const side of [-1, 1]) add(b, new THREE.ConeGeometry(0.45, 1.4, 6), M.brass, 5.4, 5.7, 3.9 + side * 2.5, side * Math.PI / 2, 0, 0);
  g.scale.setScalar(0.95);
  return g;
}

/** Picket (line infantry): a sailor under a round canvas hat, pale brim and crown, the team band round the crown
 *  between two black ink rings; team canvas sleeves and a narrow team pack on the back; a slim rifle, its stock and
 *  muzzle wrapped in pale canvas round a thin dark barrel (pale timber was seat 0's own hue, and the rifle vanished
 *  on it), held close and angled up ahead: from above a pale disc with a thin bar. The plain rifleman: beside the
 *  Harpooner its rifle is thin and short and it carries no coil. Frames: 0-1 the march, 2 going to ground
 *  (kneeling, the first pale sandbags laid round the front), 3 dug in (kneeling inside a whole ring of pale sandbags,
 *  a gap at the back; the rifle angled up over them; a team groundsheet inside the ring behind). The ring is the
 *  state's signature: brown bags vanished on the seabed and the dug-in Picket read as a Mender or a Harpooner. */
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
  // the cover: pale sandbags laid end to end round the figure, low, small gaps between them; five round the front
  // while settling, a ring of eleven dug in (the twelfth place, behind, left open); every third bag darker
  if (st) {
    const R = 8.4, N = 12, list = st === 2 ? [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11] : [10, 11, 0, 1, 2];
    for (const k of list) {
      const a = k / N * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      add(g, rbox(2.1, 2.0, 3.7, 0.9), k % 3 === 1 ? M.sandbagShade : M.sandbagPale, x, 1.0, z, 0, -a, 0);
      add(g, rbox(2.3, 0.3, 3.9, 0.1), M.inkLine, x, 0.15, z, 0, -a, 0);                          // its dark foot on the ground, so each bag stands off the sand
    }
    if (st === 2) {
      add(g, cyl(6.4, 6.4, 0.5, 28), M.paintCanvas, 0, 0.25, 0);                                     // the groundsheet, a whole disc inside the ring
      add(g, cyl(6.8, 6.8, 0.35, 28), M.inkLine, 0, 0.17, 0);
    }
  }
  g.scale.setScalar(1.08);
  return g;
}

/** Harpooner (lancer): a sailor under a low-crowned hat, standing tall with the harpoon gun shouldered and angled
 *  up ahead (a level gun made the figure read as lying prone). The gun is the longest thing in the infantry, past
 *  the body at both ends: a long timber butt well behind the back, a thick tube served with pale canvas, a fat drum
 *  of pale line wound round the tube ahead of the hands between ink rings, an iron muzzle ring, the harpoon's thick
 *  pale shaft out of it with a cork float near the tip and a big brass head with barbs. From above: a pale disc on a
 *  long thick pale bar with a knot in it, a barbed tip. Team: the sleeves, the hat band, the pack, the grip and the
 *  breech wrap, each between ink rings. Frames: 0-1 the march. */
export function harpooner(M, f) {
  infantryMats(M);
  const g = sailor(M, f), b = g.body;
  hat(M, b, { brim: 4.5, crown: 3.0, h: 4.3, band: 2.7 });                                          // a lower crown than the Picket's, a wide band
  add(b, rbox(3.2, 5.2, 5.2, 0.7), M.paintCanvas, -4.0, 10.4, 0);                                // the pack (team)
  add(b, rbox(3.4, 0.4, 5.4, 0.1), M.inkLine, -4.0, 13.05, 0); add(b, rbox(3.4, 0.4, 5.4, 0.1), M.inkLine, -4.0, 7.75, 0);
  // the harpoon gun: on the right shoulder, angled up ahead
  const A = 0.46, gun = grp(); gun.position.set(0.4, 11.4, 3.0); gun.rotation.z = A; b.add(gun);
  add(gun, rbox(7.4, 2.4, 2.4, 0.7), M.paintCanvas, -7.6, -0.4, 0);                              // the long butt, out behind the back, wrapped in team canvas
  for (const x of [-4.6, -10.3]) add(gun, rbox(0.4, 2.6, 2.6, 0.1), M.inkLine, x, -0.4, 0);
  add(gun, rbox(1.8, 2.8, 2.8, 0.4), M.ironDark, -11.2, -0.4, 0);                                // its iron heel
  add(gun, rbox(3.6, 2.9, 2.9, 0.4), M.paintCanvas, -2.4, -0.3, 0);                              // the grip, team canvas
  add(gun, rbox(0.4, 3.1, 3.1, 0.1), M.inkLine, -4.3, -0.3, 0); add(gun, rbox(0.4, 3.1, 3.1, 0.1), M.inkLine, -0.5, -0.3, 0);
  add(gun, rbox(1.2, 1.8, 1.8, 0.3), M.ironDark, -1.6, -1.9, 0);                                 // the trigger block
  add(gun, cyl(1.75, 1.75, 14, 14), M.canvas, 6.4, 0, 0, 0, 0, Math.PI / 2);                     // the tube, thick, served with pale canvas
  add(gun, cyl(1.9, 1.9, 4.6, 14), M.paintCanvas, 1.8, 0, 0, 0, 0, Math.PI / 2);                 // team canvas over the breech
  for (const x of [-0.4, 4.1]) add(gun, cyl(2.05, 2.05, 0.8, 14), M.inkLine, x, 0, 0, 0, 0, Math.PI / 2); // its ink rings
  // the line: a fat drum of pale rope wound round the tube ahead of the breech, turn by turn, between ink rings
  for (let k = 0; k < 5; k++) add(gun, torus(2.45, 0.62, 16), M.ropePale, 5.6 + k * 1.05, 0, 0, 0, Math.PI / 2, 0);
  for (const x of [4.75, 10.65]) add(gun, cyl(3.0, 3.0, 0.5, 16), M.inkLine, x, 0, 0, 0, 0, Math.PI / 2);
  add(gun, cyl(2.15, 2.15, 1.6, 14), M.ironDark, 13.4, 0, 0, 0, 0, Math.PI / 2);                 // the iron muzzle ring
  const far = [];                                                                                 // the shaft, float and head: no cast shadow (scene.js `noShadow`), so the raised gun's shadow stays short
  far.push(add(gun, cyl(0.8, 0.8, 10, 8), M.canvas, 19, 0, 0, 0, 0, Math.PI / 2));               // the harpoon's shaft, thick and pale, out of the tube
  far.push(add(gun, cyl(0.25, 0.25, 9.6, 6), M.ropePale, 18.6, 1.0, 0, 0, 0, Math.PI / 2));      // the line along it to the shank
  far.push(add(gun, sph(1.3, 10, 8), M.canvasDark, 20.6, 1.1, 0));                               // the cork float on the line, near the tip
  far.push(add(gun, new THREE.ConeGeometry(1.45, 4.6, 8), M.brass, 26.2, 0, 0, 0, 0, -Math.PI / 2)); // the head: brass, a tip only
  for (const side of [-1, 1]) far.push(add(gun, rbox(2.6, 0.55, 1.2, 0.1), M.brass, 23.6, 0, side * 1.25, 0, side * 0.65, 0)); // barbs
  for (const m of far) m.userData.noShadow = true;
  limb(b, [0.6, 11, 3.6], [3.8, 12.4, 3.2], 1.4, M.paintCanvas);                                 // the fore hand, up under the tube behind the drum
  add(b, sph(1, 8, 6), M.oilskin, 4.1, 12.6, 3.1);
  limb(b, [0.6, 11, -3.6], [-1.3, 9.5, 1.8], 1.4, M.paintCanvas);                                // the rear hand, at the grip across the chest
  add(b, sph(1, 8, 6), M.oilskin, -1.5, 9.5, 2.2);
  g.scale.setScalar(1.08);
  return g;
}

/** Mender (medic, unarmed): the palest-bodied Harbour human: an ash sailcloth coat under the round hat with a tall
 *  crown and a narrow brim, and on its back the kind's signature, a big cream canvas satchel (never team) with a
 *  dark cross on its lid, its back and both ends, inside an ink hem, so a cross shows in every facing; two team straps
 *  over the shoulders, a team hem round the coat's skirt, team sleeves and the hat band; a small warm hand lamp in a
 *  brass cage carried low in the right hand at the hip. From above a pale disc beside a pale square with a dark
 *  cross, one small warm dot at its side: no long bar, no bolster across the shoulders. The one light on Harbour
 *  infantry (r 1, not team). Frames: 0-1 the march. */
export function mender(M, f) {
  infantryMats(M);
  const g = sailor(M, f, { coat: M.ash }), b = g.body;
  hat(M, b, { brim: 3.8, crown: 2.8, h: 5.0, band: 2.6 });                                        // a narrow brim, a tall crown
  add(b, cyl(3.85, 4.3, 2.8, 12), M.paintCanvas, 0, 6.7, 0);                                     // the coat's hem bound in team canvas
  add(b, cyl(3.95, 4.0, 0.4, 12), M.inkLine, 0, 8.25, 0); add(b, cyl(4.3, 4.4, 0.4, 12), M.inkLine, 0, 5.2, 0);
  add(b, rbox(5.4, 1.0, 7.0, 0.3), M.inkLine, 0, 8.4, 0);                                         // the belt, ink on the pale coat
  // the satchel: cream canvas, big and square on the back, an ink hem round its lid and foot; a dark cross on every face that shows
  const sx = -5.2, sy = 11.0, D = 5.0, H = 7.0, W = 7.6, top = sy + H / 2;
  add(b, rbox(D, H, W, 0.7), M.satchel, sx, sy, 0);
  add(b, rbox(D + 0.3, 0.4, W + 0.3, 0.1), M.inkLine, sx, sy - H / 2 + 0.3, 0);                    // an ink hem at its foot
  add(b, rbox(D + 0.3, 0.35, W + 0.3, 0.1), M.inkLine, sx, top - 1.3, 0);                          // and at the lid's edge
  const T = 1.8, L = 4.6;                                                                         // the cross: arm width, arm length
  for (const [w, d] of [[L, T], [T, L]]) add(b, rbox(w, 0.3, d, 0.05), M.inkLine, sx, top + 0.05, 0); // on the lid
  for (const [h, d] of [[L, T], [T, L]]) add(b, rbox(0.3, h, d, 0.05), M.inkLine, sx - D / 2 - 0.05, sy - 0.5, 0); // on the back
  for (const side of [-1, 1]) for (const [w, h] of [[L * 0.8, T], [T, L * 0.8]]) add(b, rbox(w, h, 0.3, 0.05), M.inkLine, sx, sy - 0.5, side * (W / 2 + 0.05)); // on both ends
  for (const z of [-2.0, 2.0]) {                                                                   // two straps over the shoulders (team), between ink hems
    add(b, rbox(4.4, 0.9, 1.6, 0.2), M.paintCanvas, 0.2, 13.0, z, 0, 0, -0.12);
    add(b, rbox(4.6, 1.0, 1.9, 0.1), M.inkLine, 0.2, 12.8, z, 0, 0, -0.12);
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
