// The kingdom's units after the slice (the units family, 2026-11-10; not in the game's atlas: retheme.js renders them
// by filter): the Archer (the Barracks' ranged line, hits flyers), the Rider (the Stables' light cavalry), the
// Ballista (the Workshop's giant crossbow, flyers and ground), the Trebuchet (the Workshop's long-range siege, with its
// travelling and set-up poses) and the Balloon (the kingdom's one flyer, unarmed, long sight). The slice's rules
// (kingdom.js, target/art-review/slice/notes.md): a mid-dark body of oak, wool, horse and mail under a pale head of
// linen or steel, each kind its own head shape and one big prop; team on cloth between ink hems, never a whole
// surcoat; thin props drawn two to three times their thickness. Same conventions as models.js: game units, units
// face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { lathe, torus } from './harbour.js';
import { cone } from './vael.js';
import { tex, figure, pennant } from './kingdom.js';
import { polishTextures } from './polish.js';

let seed = 211; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Patched balloon cloth: pale canvas panels with seams, a few darker patches sewn on (the patches neutral). */
const patchTex = tex(128, (g, n) => {
  g.fillStyle = '#d8d0bc'; g.fillRect(0, 0, n, n); seed = 211;
  for (let i = 0; i < 1200; i++) { const v = 190 + rnd() * 50; g.fillStyle = `rgba(${v},${v - 6},${v - 18},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(70,60,50,0.5)'; g.lineWidth = 1.5; for (const x of [0, 43, 86]) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, n); g.stroke(); }
  for (const [x, y, w, h] of [[12, 20, 22, 18], [60, 70, 18, 26], [96, 10, 24, 16], [30, 96, 28, 20]]) { g.fillStyle = 'rgba(120,104,80,0.75)'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(50,40,30,0.8)'; g.setLineDash([2, 2]); g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); g.setLineDash([]); }
}, { repeat: 1 });

// ---- the family's own materials over the kingdom's set ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const A = {
    horseLight: std({ color: 0x8a6e4e, roughness: 0.75 }),                                      // the Rider's horse: a bay, lighter than the Knight's dark hide
    patched: std({ color: 0xcfc8b4, map: patchTex, roughness: 0.92 }),                            // the Balloon's envelope: patched pale canvas
    rope: M.rope,
  };
  if (M.polish) { // the polish pass (polish.js polishMats does the kingdom's set; these are the family's own): hide on the bay, folds on the patched canvas
    const X = polishTextures();
    A.horseLight.map = X.hide; A.horseLight.needsUpdate = true;
    A.patched.bumpMap = X.fold; A.patched.bumpScale = 0.8; A.patched.needsUpdate = true;
  }
  FAM.set(M, A); return A;
}

/** A cart wheel with its axle along z: an oak disc inside a dark iron tyre, a steel hub, spokes turning with `turn`. */
function wheel(g, M, r, x, y, z, turn = 0) {
  add(g, cyl(r - 0.3, r - 0.3, 1.2, 16), M.oak, x, y, z, Math.PI / 2, 0, 0);
  add(g, torus(r - 0.25, 0.5, 20), M.ironDark, x, y, z);
  add(g, cyl(0.9, 0.9, 1.7, 10), M.steel, x, y, z, Math.PI / 2, 0, 0);
  for (let k = 0; k < 3; k++) add(g, rbox(0.5, (r - 0.8) * 2, 0.4, 0.1), M.leather, x, y, z + (z > 0 ? 0.7 : -0.7), 0, 0, k * Math.PI / 3 + turn);
}
/** A team band round a cylinder between two ink rings (the hems the finish's ink needs). */
function band(g, M, r, h, x, y, z, rx = 0, ry = 0, rz = 0) {
  const p = grp(); p.position.set(x, y, z); p.rotation.set(rx, ry, rz); g.add(p);
  add(p, cyl(r, r, h, 12), M.cloth, 0, 0, 0);
  add(p, cyl(r + 0.05, r + 0.05, 0.35, 12), M.inkLine, 0, h / 2, 0); add(p, cyl(r + 0.05, r + 0.05, 0.35, 12), M.inkLine, 0, -h / 2, 0);
  return p;
}

/** Archer (ranged line infantry, sim r 10-11, scale 1.04): a bowman in a padded coat (undyed wool quilted with dark
 *  cords), a pale linen hood whose point hangs back (its own head shape: not the Villager's snug dome nor the Guard's
 *  steel disc), a tall bow held up in the left hand ahead of the body with the string drawn back to the cheek (a
 *  curved arc, never the Guard's straight bar), a quiver on the right hip with arrows fletched in team cloth, a team
 *  baldric across the chest, team hem and sleeves. From the camera: a pale pointed hood, a tall arc ahead, a team
 *  sash; no shield, no long spear. Frames 0-1 the step. */
export function archer(M, f) {
  const g = figure(M, f, { tunic: M.tunic, skirt: 4.0 }), b = g.body;
  for (const y of [9.0, 10.4, 11.8]) add(b, rbox(5.15, 0.3, 6.75, 0.05), M.leather, 0, y, 0);  // the coat's quilting cords
  add(b, cyl(4.0, 4.2, 1.4, 12), M.cloth, 0, 6.3, 0); add(b, cyl(4.1, 4.1, 0.35, 12), M.inkLine, 0, 7.1, 0); add(b, cyl(4.25, 4.25, 0.4, 12), M.inkLine, 0, 5.55, 0); // a team hem band on the skirt
  add(b, rbox(5.4, 1.4, 7.2, 0.2), M.cloth, 0.2, 10.6, 0, 0.55, 0, 0);                        // the baldric across the chest, team, from the right shoulder to the left hip
  add(b, rbox(5.5, 0.3, 7.4, 0.05), M.inkLine, 0.2, 11.35, 0, 0.55, 0, 0); add(b, rbox(5.5, 0.3, 7.4, 0.05), M.inkLine, 0.2, 9.85, 0, 0.55, 0, 0);
  // the hood: pale linen over the head, a cowl over the shoulders, its point hanging back
  add(b, cyl(3.4, 2.5, 2.4, 12), M.linen, -0.2, 12.4, 0);                                       // the cowl
  add(b, cyl(3.5, 3.5, 0.35, 12), M.inkLine, -0.2, 11.2, 0);                                    // its hem
  add(b, sph(2.4, 14, 10), M.linen, 0.1, 13.8, 0).scale.set(1, 1.05, 1);                        // the hood over the head
  add(b, cone(1.5, 4.4, 10), M.linen, -2.6, 14.2, 0, 0, 0, 1.45);                               // its point, hanging back
  add(b, sph(1.5, 12, 10), M.skin, 1.8, 13.3, 0).scale.set(0.75, 0.9, 0.9);                     // the face in its opening
  add(b, torus(1.7, 0.3, 14), M.inkLine, 1.9, 13.4, 0, 0, Math.PI / 2, 0).scale.set(1, 1.1, 1);  // the opening's dark edge
  // the quiver on the right hip, tilted back, arrows out of its mouth with team fletching
  const qv = grp(); qv.position.set(-2.2, 7.6, 3.2); qv.rotation.set(0, 0, -0.45); b.add(qv);
  add(qv, cyl(1.3, 1.1, 6.0, 10), M.leather, 0, 0, 0);
  band(qv, M, 1.4, 1.6, 0, 1.6, 0);                                                            // a team band round it
  for (const [x, z] of [[0.4, 0.3], [-0.4, -0.4], [0.1, 0.6]]) { add(qv, cyl(0.3, 0.3, 5.0, 6), M.oak, x, 4.6, z); add(qv, rbox(1.3, 1.6, 0.4, 0.1), M.cloth, x, 6.8, z); add(qv, rbox(0.4, 1.6, 1.3, 0.1), M.cloth, x, 6.8, z); }
  // the bow: tall, held up ahead in the left hand, its arc bulging ahead (+x), the string drawn to the cheek
  const BR = 7.2, GX = 4.6, GY = 11.0, GZ = -0.6, bw = grp(); bw.position.set(GX - BR, GY, GZ); b.add(bw);
  add(bw, torus(BR, 1.05, 28, 2.3), M.timberPale, 0, 0, 0, 0, 0, -1.15);                        // the stave: an arc of 2.3 rad centred on +x, light timber, drawn three times its thickness (the judge: a hair-thin dark arc on a dark coat)
  for (const s of [-1, 1]) add(bw, sph(1.0, 8, 6), M.steel, BR * Math.cos(1.15), s * BR * Math.sin(1.15), 0); // steel nocks at the tips
  add(bw, cyl(1.25, 1.25, 2.6, 8), M.leather, BR, 0, 0);                                        // the grip
  const tip = (s) => [BR * Math.cos(1.15), s * BR * Math.sin(1.15), 0], hand = [BR - 4.2, 0.6, 1.2];
  limb(bw, tip(1), hand, 0.3, M.rope); limb(bw, hand, tip(-1), 0.3, M.rope);                     // the string, drawn back (drawn thick)
  add(bw, cyl(0.3, 0.3, 11.0, 6), M.oak, BR - 1.0, 0.3, 0.6, 0, 0, Math.PI / 2);                  // the arrow on the string
  add(bw, cone(0.5, 1.6, 6), M.steel, BR + 5.2, 0.3, 0.6, 0, 0, -Math.PI / 2);                   // its head
  limb(b, [0.6, 11.2, -3.4], [GX - 0.6, GY, GZ], 1.15, M.cloth); add(b, sph(0.85, 8, 6), M.skin, GX - 0.4, GY, GZ);  // the bow arm, a team sleeve
  limb(b, [0.6, 11.2, 3.4], [GX - 4.2, 11.6, 0.8], 1.15, M.cloth); add(b, sph(0.85, 8, 6), M.skin, GX - 4.4, 11.6, 0.6); // the drawing arm, back to the cheek
  if (M.polish) { // secondary detail (the polish pass, what reads at 2x): a belt buckle, a leather bracer on the bow arm, ink cuffs at the wrists, leather bindings on the stave's limbs, a steel ring at the quiver's foot
    add(b, rbox(1.3, 1.1, 0.5, 0.1), M.steel, 2.75, 8.3, 0);
    limb(b, [2.47, 11.09, -1.86], [3.39, 11.04, -1.1], 1.3, M.leather);                           // the bracer on the bow arm's forearm
    add(b, sph(1.25, 8, 6), M.inkLine, 3.66, 11.02, -0.88); add(b, sph(1.25, 8, 6), M.inkLine, 0.42, 11.55, 1.11);
    for (const s of [-1, 1]) add(bw, cyl(1.3, 1.3, 1.6, 8), M.leather, BR * Math.cos(0.8), s * BR * Math.sin(0.8), 0, 0, 0, s * 0.8); // bindings where the limbs meet the grip's riser
    add(qv, cyl(1.3, 1.3, 0.8, 10), M.steel, 0, -2.2, 0);
  }
  g.scale.setScalar(1.04);
  return g;
}

/** Rider (light cavalry, the fast raider, sim r 13, heavy class by size, light by look): a lean rider on a lighter
 *  horse than the Knight's: a bay hide, a slim barrel, long legs in a long stride, no caparison, a short team saddle
 *  cloth with ink hems; the rider in a tunic and hose with a pale open steel helm (a skullcap over a bare face: the
 *  Knight's is the closed great helm), a team cape at the shoulders, a short spear held up in the right hand point up
 *  (half the lance's length, no pennon) and two javelins in a case by the saddle. From the camera: a slim pale horse
 *  with legs flying, a small pale cap, a short upright bar: quick and light, never the Knight's dark caparisoned
 *  mass under a flag. Frames 0-1 the gallop. */
export function rider(M, f) {
  const A = fam(M), g = grp(), st = f % 2 ? -1 : 1;
  const h = grp(); g.add(h);
  add(h, rbox(13.5, 5.6, 4.6, 2.0), A.horseLight, -0.5, 11.2, 0);                               // the body, slim
  add(h, sph(2.7, 12, 10), A.horseLight, -7.0, 11.4, 0).scale.set(0.9, 1, 1);                   // the rump
  limb(h, [4.8, 12.2, 0], [9.6, 18.4, 0], 1.7, A.horseLight);                                    // the neck, high
  add(h, rbox(4.8, 2.6, 2.2, 0.8), A.horseLight, 11.8, 18.2, 0, 0, 0, -0.45);                    // the head, up and ahead
  add(h, rbox(1.4, 1.2, 1.9, 0.4), M.horseDark, 13.8, 17.0, 0);                                 // the muzzle
  for (const z of [-0.9, 0.9]) add(h, cone(0.5, 1.6, 6), M.horseDark, 10.4, 20.4, z);            // ears
  for (let k = 0; k < 5; k++) add(h, rbox(1.3, 1.1, 1.4, 0.4), M.horseDark, 5.6 + k * 1.0, 14.8 + k * 1.2, 0); // the mane
  limb(h, [-8.8, 12.0, 0], [-13.4, 6.0, 0.4], 0.7, M.horseDark);                                 // the tail, flying
  for (const [x, side, fore] of [[4.4, -1, 1], [4.4, 1, 1], [-5.8, -1, 0], [-5.8, 1, 0]]) {      // the legs: long and thin, a long stride
    const z = side * 1.8, s = (fore ? 1 : -1) * st * side * 3.4;
    limb(h, [x, 9.6, z], [x + s * 0.6, 4.8, z], 1.0, A.horseLight);
    limb(h, [x + s * 0.6, 4.8, z], [x + s * 1.5, 0.9, z], 0.75, A.horseLight);
    add(h, rbox(1.5, 1.0, 1.5, 0.3), M.horseDark, x + s * 1.5, 0.5, z);                          // a hoof
  }
  // the saddle: a short team cloth with ink hems under a leather saddle (no caparison: the Rider is light)
  add(h, rbox(7.0, 0.6, 6.2, 0.2), M.cloth, 0.3, 14.1, 0); add(h, rbox(7.2, 0.3, 6.4, 0.05), M.inkLine, 0.3, 13.75, 0); add(h, rbox(7.2, 0.3, 6.4, 0.05), M.inkLine, 0.3, 14.45, 0);
  for (const side of [-1, 1]) { add(h, rbox(8.6, 3.2, 0.5, 0.15), M.cloth, 0.3, 11.2, side * 2.55); add(h, rbox(8.8, 0.35, 0.55, 0.05), M.inkLine, 0.3, 12.9, side * 2.55); add(h, rbox(8.8, 0.35, 0.55, 0.05), M.inkLine, 0.3, 9.5, side * 2.55); } // a short caparison: team flaps down the flanks between ink hems (the Knight's reaches its knees)
  add(h, rbox(0.6, 2.4, 5.2, 0.15), M.cloth, 6.2, 12.4, 0, 0, 0, -0.3); add(h, rbox(0.65, 0.3, 5.4, 0.05), M.inkLine, 6.0, 13.6, 0, 0, 0, -0.3); add(h, rbox(0.65, 0.3, 5.4, 0.05), M.inkLine, 6.4, 11.2, 0, 0, 0, -0.3); // a team breast band
  add(h, rbox(5.0, 1.4, 5.0, 0.5), M.leather, 0.3, 14.9, 0);
  for (const side of [-1, 1]) { limb(h, [0.3, 14.4, side * 2.6], [0.6, 8.6, side * 3.2], 0.35, M.leather); add(h, rbox(1.6, 0.6, 1.4, 0.2), M.steel, 0.6, 8.4, side * 3.2); } // stirrup leathers and stirrups
  const jc = grp(); jc.position.set(-3.8, 12.8, -2.6); jc.rotation.set(0, 0, 0.45); h.add(jc);    // the javelin case by the saddle
  add(jc, cyl(1.1, 0.9, 5.0, 8), M.leather, 0, 0, 0); band(jc, M, 1.2, 1.2, 0, 1.4, 0);
  for (const z of [-0.4, 0.4]) { add(jc, cyl(0.35, 0.35, 8.0, 6), M.oak, z, 5.0, z); add(jc, cone(0.6, 1.8, 6), M.steel, z, 9.8, z); }
  // the rider: hose down the flanks, a tunic, a team cape, an open steel helm over a bare face
  const r = grp(); r.position.set(0.3, 15.6, 0); g.add(r);
  for (const side of [-1, 1]) limb(r, [0.4, 1.6, side * 2.6], [0.8, -3.6, side * 3.4], 1.0, M.hose);
  add(r, rbox(4.2, 5.6, 5.4, 1.3), M.tunic, 0, 4.2, 0);                                        // the tunic
  add(r, rbox(4.4, 0.7, 5.6, 0.2), M.leather, 0, 1.8, 0);                                       // the belt
  const bk = grp(); bk.position.set(-2.9, 4.4, -0.6); bk.rotation.set(0, 0, Math.PI / 2 - 0.3); r.add(bk); // a small team buckler slung on the back, its face up and back
  add(bk, cyl(2.6, 2.6, 0.5, 18), M.oak, 0, 0, 0); add(bk, cyl(2.2, 2.2, 0.4, 18), M.cloth, 0, 0.25, 0); add(bk, torus(2.4, 0.3, 18), M.inkLine, 0, 0.3, 0, Math.PI / 2, 0, 0); add(bk, sph(0.6, 8, 6), M.steel, 0, 0.5, 0);
  add(r, cyl(2.4, 3.6, 2.2, 12), M.cloth, -0.4, 6.4, 0); add(r, cyl(3.7, 3.7, 0.35, 12), M.inkLine, -0.4, 5.3, 0); add(r, cyl(2.5, 2.5, 0.3, 12), M.inkLine, -0.4, 7.5, 0); // the team cape at the shoulders between hems
  add(r, sph(1.7, 12, 10), M.skin, 0.9, 8.2, 0).scale.set(0.85, 0.95, 0.9);                    // the face, bare
  add(r, lathe([[0, 0], [2.3, 0], [2.4, 0.3], [2.2, 1.6], [1.4, 2.6], [0, 3.0]]), M.steel, 0.1, 8.0, 0); // the open helm: a steel skullcap, pale
  add(r, cyl(2.4, 2.4, 0.35, 16), M.inkLine, 0.1, 7.85, 0);                                    // its rim line over the brow
  add(r, rbox(1.2, 2.0, 0.6, 0.1), M.steel, 2.3, 7.4, 0);                                      // the nasal bar
  // the short spear in the right hand, held up, point up (half the lance; the Knight's is couched ahead with a pennon)
  const sp = grp(); sp.position.set(1.6, 4.0, 3.2); sp.rotation.z = -0.35; r.add(sp);
  add(sp, cyl(0.8, 0.8, 14, 8), M.oak, 0, 3.0, 0);                                             // (drawn twice its thickness)
  add(sp, cyl(0.95, 0.95, 1.2, 8), M.steel, 0, 10.2, 0); add(sp, cone(1.3, 4.0, 8), M.steel, 0, 12.8, 0); // the socket and head
  limb(r, [0, 6, 2.8], [1.6, 4.6, 3.2], 1.0, M.cloth); add(r, sph(0.85, 8, 6), M.skin, 1.6, 4.4, 3.3); // the spear arm, a team sleeve
  limb(r, [0, 6, -2.8], [3.0, 5.0, -1.2], 1.0, M.cloth); add(r, sph(0.85, 8, 6), M.skin, 3.2, 5.0, -1.0); // the rein hand
  limb(h, [3.4, 15.6, -1.0], [12.6, 17.6, -0.6], 0.3, M.leather);                                 // the rein
  if (M.polish) { // secondary detail (the polish pass): the bridle (a noseband and headstall) and the second rein, a girth over the flaps, a crupper to the rump, a belt buckle, ink cuffs, leather bindings on the spear
    add(h, torus(1.5, 0.26), M.leather, 12.9, 17.7, 0, 0, Math.PI / 2, -0.45);                      // the noseband
    for (const z of [-1.2, 1.2]) limb(h, [10.6, 19.3, z], [12.6, 17.7, z], 0.3, M.leather);          // the headstall, from behind the ears
    limb(h, [3.4, 15.6, -1.0], [12.6, 17.6, 0.8], 0.3, M.leather);                                   // the second rein, to the same hand
    add(h, rbox(1.2, 5.8, 5.9, 0.2), M.leather, 0.3, 11.3, 0);                                       // the girth, over the flaps
    limb(h, [-2.2, 14.8, 0], [-7.0, 14.3, 0], 0.3, M.leather);                                       // the crupper
    add(r, rbox(1.3, 1.1, 0.5, 0.1), M.steel, 2.3, 1.8, 0);
    add(r, sph(1.1, 8, 6), M.inkLine, 1.36, 4.81, 3.14); add(r, sph(1.1, 8, 6), M.inkLine, 2.55, 5.15, -1.44);
    add(sp, cyl(0.95, 0.95, 2.0, 8), M.leather, 0, 8.4, 0); add(sp, cyl(0.95, 0.95, 2.4, 8), M.leather, 0, 1.8, 0);
  }
  return g;
}

/** Ballista (the Workshop's giant crossbow on wheels, sim r 14; shoots flyers and ground): a low oak carriage on four
 *  cart wheels, a pedestal and a long stock angled up ahead, two wide bow arms swept back from a head frame with the
 *  torsion skeins wrapped in team cloth between ink rings, a thick string, a long steel bolt lying along the stock
 *  with team fletching at its tail, a winch at the rear with a team cloth cover, a crewman at the winch. From the
 *  camera: a low cart with a long bar up ahead and two wide arms across it, a team mark at each arm's root. Frames
 *  0-1 the roll (the wheels turn). */
export function ballista(M, f) {
  const A = fam(M), g = grp(), turn = (f % 2) * 0.5;
  for (const z of [-3.8, 3.8]) add(g, rbox(15, 1.6, 1.6, 0.3), M.oak, 0, 2.6, z);               // the carriage's beams
  for (const x of [-5.5, 5.5]) { add(g, rbox(1.6, 1.4, 9.0, 0.3), M.oak, x, 2.6, 0); add(g, cyl(0.6, 0.6, 12.4, 8), M.ironDark, x, 2.2, 0, Math.PI / 2, 0, 0); } // the axles
  for (const [x, z] of [[-5.5, -5.6], [5.5, -5.6], [-5.5, 5.6], [5.5, 5.6]]) wheel(g, M, 2.4, x, 2.4, z, turn + x * 0.1);
  add(g, cyl(2.0, 2.6, 3.4, 10), M.oak, -0.5, 5.0, 0);                                        // the pedestal
  add(g, cyl(1.2, 1.2, 1.6, 10), M.steel, -0.5, 6.9, 0);                                        // the swivel
  const st = grp(); st.position.set(-0.5, 7.4, 0); st.rotation.z = 0.28; g.add(st);              // the stock, angled up ahead
  add(st, rbox(19, 1.8, 2.2, 0.3), M.timberPale, 2.0, 0.6, 0);                                  // the stock in light timber, so the long crossbow line reads at 1x (the judge)
  add(st, rbox(19.2, 0.5, 0.8, 0.1), M.ironDark, 2.0, 1.55, 0);                                 // its slot's iron lips
  add(st, rbox(3.2, 3.0, 3.6, 0.3), M.oak, 9.6, 1.4, 0);                                        // the head frame
  for (const s of [-1, 1]) {                                                                    // the bow arms, swept back from the head, the skeins wrapped in team cloth
    band(st, M, 1.6, 4.4, 9.6, 1.8, s * 2.8);
    limb(st, [9.6, 1.6, s * 3.2], [6.4, 2.0, s * 10.5], 0.75, M.oak);
    add(st, sph(0.7, 8, 6), M.steel, 6.4, 2.0, s * 10.5);                                        // steel tips
  }
  limb(st, [6.4, 2.0, -10.5], [-3.0, 1.8, 0], 0.4, A.rope); limb(st, [-3.0, 1.8, 0], [6.4, 2.0, 10.5], 0.4, A.rope); // the string, drawn back to the nut
  add(st, cyl(0.7, 0.7, 15, 8), M.timberPale, 3.8, 2.3, 0, 0, 0, Math.PI / 2);                   // the bolt, long, along the stock, light timber (drawn thick)
  add(st, cone(0.9, 2.6, 8), M.steel, 12.6, 2.1, 0, 0, 0, -Math.PI / 2);                         // its head
  add(st, rbox(2.6, 1.8, 0.35, 0.05), M.cloth, -2.6, 2.1, 0); add(st, rbox(2.6, 0.35, 1.8, 0.05), M.cloth, -2.6, 2.1, 0); // the team fletching
  add(st, rbox(2.8, 0.3, 0.5, 0.05), M.inkLine, -2.6, 3.05, 0); add(st, rbox(2.8, 0.3, 0.5, 0.05), M.inkLine, -2.6, 1.15, 0);
  add(st, cyl(1.1, 1.1, 4.0, 10), M.oak, -6.2, 1.2, 0, Math.PI / 2, 0, 0);                        // the winch drum at the rear
  for (const s of [-1, 1]) add(st, rbox(0.5, 3.0, 0.5, 0.1), M.ironDark, -6.2, 1.2, s * 2.4, 0, 0, s * 0.6); // its handles
  add(st, rbox(4.6, 1.2, 5.6, 0.2), M.cloth, -6.2, 2.7, 0); add(st, rbox(4.8, 0.3, 5.8, 0.05), M.inkLine, -6.2, 2.05, 0); add(st, rbox(4.8, 0.3, 5.8, 0.05), M.inkLine, -6.2, 3.35, 0); // a team cloth over the winch
  // the crewman behind the winch: a small figure in a tunic and a pale coif, bent to the handles
  const c = grp(); c.position.set(-7.6, 2.6, -2.4); c.rotation.set(0, 0, 0.3); c.scale.setScalar(0.8); g.add(c);
  add(c, cyl(2.2, 2.8, 5.4, 10), M.tunic, 0, 2.7, 0); add(c, sph(1.6, 12, 10), M.linen, 0.6, 6.6, 0); add(c, sph(1.0, 10, 8), M.skin, 1.6, 6.4, 0).scale.set(0.8, 0.9, 0.9);
  limb(c, [0.6, 5.0, -1.6], [2.8, 4.6, -0.8], 0.8, M.cloth); limb(c, [0.6, 5.0, 1.6], [2.8, 4.6, 0.8], 0.8, M.cloth);
  pennant(g, M, -7.5, 3.4, 3.8, 9, 7);                                                          // a pennant at the rear corner
  if (M.polish) { // secondary detail (the polish pass): hub rings on the wheels, iron bands round the stock, iron brackets at the carriage's corners, a steel ratchet wheel on the winch, leather bindings at the bow arms' roots
    for (const [x, z] of [[-5.5, -5.6], [5.5, -5.6], [-5.5, 5.6], [5.5, 5.6]]) add(g, torus(0.75, 0.15), M.ironDark, x, 2.4, z + Math.sign(z) * 0.9);
    for (const x of [-4.0, 6.5]) add(st, rbox(0.8, 2.3, 2.5, 0.1), M.ironDark, x, 0.7, 0);
    for (const [x, z] of [[-5.5, -3.8], [5.5, -3.8], [-5.5, 3.8], [5.5, 3.8]]) add(g, rbox(2.2, 1.9, 2.2, 0.1), M.ironDark, x, 2.6, z);
    add(st, cyl(1.6, 1.6, 0.4, 12), M.steel, -6.2, 1.2, -2.15, Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) limb(st, [9.12, 1.66, s * 4.3], [8.54, 1.73, s * 5.61], 0.95, M.leather);
  }
  return g;
}

/** Trebuchet (the Workshop's long-range siege, sim r 20): a tall oak A-frame on a wheeled base, a long throwing arm
 *  pivoted at its apex with a counterweight box at the short end (team cloth over it) and a sling of rope and team
 *  cloth at the long end, a pennant at the apex, a team hanging between the frame's legs. Frames 0-1 travelling
 *  (the wheels turn: the arm down along the frame, the counterweight hanging under its short end, the sling tucked),
 *  2 half set, 3 set up (today's siege deploy, look.js UNIT_POSE): the arm cocked back and down to the ground with
 *  the sling laid out ahead of it, the counterweight hoisted high, braces staked out. From the camera the tallest
 *  thing on the ground: a tall timber triangle with a long bar and a box in the air; nothing low. */
export function trebuchet(M, f) {
  const A = fam(M), g = grp(), st = f < 2 ? 0 : f - 1, turn = (f % 2) * 0.5;                 // 0 travelling, 1 half, 2 set up
  const H = 17, ang = [0.18, 0.6, 1.0][st];                                                  // the arm's angle below level (the long end down and back)
  for (const z of [-4.6, 4.6]) add(g, rbox(24, 1.8, 1.8, 0.3), M.oak, 0, 2.6, z);               // the base beams along x
  for (const x of [-9, 0, 9]) add(g, rbox(1.8, 1.6, 11.0, 0.3), M.oak, x, 2.6, 0);               // cross beams
  for (const [x, z] of [[-8.5, -6.2], [8.5, -6.2], [-8.5, 6.2], [8.5, 6.2]]) wheel(g, M, 2.6, x, 2.6, z, turn + x * 0.1);
  for (const z of [-3.8, 3.8]) {                                                                // the A-frame: two trestles, each two legs meeting at the apex, a brace across
    limb(g, [-6.5, 3.2, z], [0, H, z], 0.95, M.oak); limb(g, [6.5, 3.2, z], [0, H, z], 0.95, M.oak);
    add(g, rbox(7.2, 0.9, 0.9, 0.2), M.oak, 0, 9.6, z);
  }
  add(g, cyl(0.8, 0.8, 9.6, 10), M.steel, 0, H, 0, Math.PI / 2, 0, 0);                             // the axle at the apex
  for (const z of [-3.8, 3.8]) add(g, rbox(2.2, 2.6, 1.2, 0.3), M.oak, 0, H - 0.4, z);           // its bearings
  add(g, rbox(0.5, 6.2, 8.2, 0.1), M.cloth, 0, 6.5, 0, 0, Math.PI / 2, 0); add(g, rbox(0.5, 0.4, 8.6, 0.05), M.inkLine, 0, 9.7, 0, 0, Math.PI / 2, 0); add(g, rbox(0.5, 0.4, 8.6, 0.05), M.inkLine, 0, 3.3, 0, 0, Math.PI / 2, 0); // a team hanging between the legs, facing the camera
  pennant(g, M, 0, H + 1.4, -3.8, 9, 7);                                                        // the pennant at the apex
  if (st === 2) for (const s of [-1, 1]) { limb(g, [s * 7, 2.4, 0], [s * 14, 0.4, 0], 0.6, M.oak); add(g, rbox(1.2, 2.4, 1.2, 0.2), M.ironDark, s * 14, 1.0, 0); } // braces staked out when set up
  // the arm: pivoted at the apex, the long end (20) back and down, the short end (6) ahead with the counterweight
  const arm = grp(); arm.position.set(0, H, 0); arm.rotation.z = ang; g.add(arm);
  add(arm, rbox(26, 2.4, 2.4, 0.4), M.timberPale, -7, 0, 0);                                    // the beam, from -20 to +6, in light timber against the frame's dark oak so the tall bar shows (the judge: set up, it read as a tent cart)
  add(arm, rbox(5, 3.2, 3.2, 0.4), M.timberPale, -1, 0, 0);                                     // thick at the pivot
  for (const x of [-19.6, 5.4]) add(arm, cyl(0.9, 0.9, 2.4, 8), M.ironDark, x, 0, 0, Math.PI / 2, 0, 0); // iron pins at the ends
  const cw = grp(); cw.position.set(5.6, 0, 0); cw.rotation.z = -ang; arm.add(cw);               // the counterweight hangs plumb from the short end
  add(cw, rbox(5.6, 5.6, 5.6, 0.4), M.timberPale, 0, -4.4, 0);                                  // the box, light timber
  add(cw, rbox(5.9, 3.4, 5.9, 0.2), M.cloth, 0, -3.2, 0); add(cw, rbox(6.1, 0.4, 6.1, 0.05), M.inkLine, 0, -1.3, 0); add(cw, rbox(6.1, 0.4, 6.1, 0.05), M.inkLine, 0, -5.1, 0); // a team cloth cover round it between ink hems
  add(cw, rbox(6.0, 0.6, 6.0, 0.1), M.ironDark, 0, -6.9, 0);                                      // an iron band at its foot
  // the sling: two ropes from the long end to a team pouch; tucked up when travelling, laid out ahead when set up
  const tip = [-19.6, 0, 0], toLocal = (wx, wy) => [wx * Math.cos(ang) + (wy - H) * Math.sin(ang), -wx * Math.sin(ang) + (wy - H) * Math.cos(ang)]; // a world point in the arm's frame
  if (st === 2) {
    const tw = [-19.6 * Math.cos(ang), H - 19.6 * Math.sin(ang)], P = toLocal(tw[0] + 8.5, 1.2);  // the pouch on the ground ahead of the tip
    for (const z of [-1.0, 1.0]) limb(arm, tip, [P[0], P[1], z], 0.35, A.rope);
    add(arm, rbox(4.0, 1.2, 3.0, 0.4), M.cloth, P[0], P[1], 0, 0, 0, -ang); add(arm, rbox(4.2, 0.3, 3.2, 0.05), M.inkLine, P[0], P[1] - 0.6, 0, 0, 0, -ang);
    add(arm, sph(1.2, 10, 8), M.plinth, P[0], P[1] + 0.6, 0);                                     // the stone in it
  } else {
    for (const z of [-0.8, 0.8]) limb(arm, tip, [tip[0] + 3.0, -3.6, z], 0.35, A.rope);
    add(arm, rbox(3.2, 1.2, 2.6, 0.4), M.cloth, tip[0] + 3.2, -4.0, 0); add(arm, rbox(3.4, 0.3, 2.8, 0.05), M.inkLine, tip[0] + 3.2, -4.7, 0);
  }
  // a crewman at the windlass on the base's front, a pale coif
  const c = grp(); c.position.set(9.2, 3.4, 2.8); c.rotation.set(0, 0.6, 0.2); c.scale.setScalar(0.8); g.add(c);
  add(c, cyl(2.2, 2.8, 5.4, 10), M.tunic, 0, 2.7, 0); add(c, sph(1.6, 12, 10), M.linen, 0.5, 6.6, 0); add(c, sph(1.0, 10, 8), M.skin, 1.5, 6.4, 0).scale.set(0.8, 0.9, 0.9);
  add(g, cyl(0.9, 0.9, 7.0, 10), M.oak, 9.6, 5.2, -1.6, Math.PI / 2, 0, 0);                        // the windlass
  for (const [x, z] of [[-8, 2], [-6, -3], [-3, 4]]) add(g, sph(1.3, 10, 8), M.plinth, x, 4.4, z);  // stones stacked on the base
  if (M.polish) { // secondary detail (the polish pass): hub rings on the wheels, iron bands round the arm, corner irons on the counterweight box, iron straps where the legs meet the base and plates over the bearings, rope wound on the windlass
    for (const [x, z] of [[-8.5, -6.2], [8.5, -6.2], [-8.5, 6.2], [8.5, 6.2]]) add(g, torus(0.75, 0.15), M.ironDark, x, 2.6, z + Math.sign(z) * 0.9);
    for (const x of [-15, -9, 3.6]) add(arm, rbox(0.9, 2.8, 2.8, 0.1), M.ironDark, x, 0, 0);
    for (const [x, z] of [[-2.85, -2.85], [2.85, -2.85], [-2.85, 2.85], [2.85, 2.85]]) add(cw, rbox(0.9, 1.7, 0.9, 0.1), M.ironDark, x, -6.0, z);
    for (const [x, z] of [[-6.5, -3.8], [6.5, -3.8], [-6.5, 3.8], [6.5, 3.8]]) add(g, rbox(2.0, 1.4, 1.6, 0.1), M.ironDark, x, 3.4, z);
    for (const z of [-3.8, 3.8]) add(g, rbox(2.4, 0.5, 1.4, 0.1), M.ironDark, 0, H + 1.1, z);
    for (const z of [-3.6, -3.0, -2.4]) add(g, torus(1.15, 0.3, 10), A.rope, 9.6, 5.2, z);
  }
  return g;
}

/** Balloon (the kingdom's one flyer, unarmed and slow, long sight; sim r 14, flies at 30): a patched cloth balloon
 *  (pale canvas panels, neutral darker patches, three team gores between ink seams), a rope net and a neck of old
 *  canvas, a wicker basket hung on four ropes with a lookout in a pale coif and a team pennant, two sandbags. Flies
 *  high, its shadow a round blot well off to the south-east (the sun from the north-west), like today's flyers. From
 *  the camera: a big pale ball with team stripes over a small basket, far above its shadow; nothing on the kingdom's
 *  ground is round and pale. One frame: a drifter (look.js UNIT_FPS 0). */
export function balloon(M) {
  const A = fam(M), g = grp(), FY = 30, b = grp(); b.position.y = FY; g.add(b);
  const R = 8.2, env = add(b, sph(R, 24, 18), A.patched, 0, 0, 0); env.scale.set(1, 1.12, 1);     // the envelope
  for (let k = 0; k < 3; k++) {                                                                   // three team gores between ink seams
    const a = k * Math.PI * 2 / 3 + 0.4, d = 0.62;
    add(b, new THREE.SphereGeometry(R + 0.05, 8, 16, a - d / 2, d, 0.35, 2.3), M.cloth, 0, 0, 0).scale.set(1, 1.12, 1);
    for (const e of [a - d / 2 - 0.07, a + d / 2]) add(b, new THREE.SphereGeometry(R + 0.07, 2, 16, e, 0.07, 0.35, 2.3), M.inkLine, 0, 0, 0).scale.set(1, 1.12, 1);
  }
  add(b, torus(R * 0.98, 0.25, 32), A.rope, 0, 1.6, 0, Math.PI / 2, 0, 0); add(b, torus(R * 0.82, 0.25, 32), A.rope, 0, -4.6, 0, Math.PI / 2, 0, 0); // the net's hoops
  add(b, sph(1.6, 10, 8), M.oak, 0, R * 1.12 + 0.6, 0);                                           // the crown's valve cap
  add(b, cyl(2.6, 1.6, 3.2, 12), M.canvasDark, 0, -R * 1.12 - 0.8, 0);                            // the neck of old canvas
  add(b, torus(1.7, 0.4, 14), M.oak, 0, -R * 1.12 - 2.4, 0, Math.PI / 2, 0, 0);                   // the load ring
  const BY = -17.6;                                                                                // the basket, hung well under
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) limb(b, [x * 0.5, -R * 1.12 - 2.4, z * 0.5], [x, BY + 1.6, z], 0.3, A.rope);
  add(b, rbox(5.2, 3.6, 5.2, 0.8), M.wicker, 0, BY, 0);                                           // the basket
  add(b, rbox(5.6, 0.7, 5.6, 0.2), M.oak, 0, BY + 1.9, 0);                                        // its rim
  add(b, rbox(5.5, 0.9, 5.5, 0.1), M.cloth, 0, BY + 0.6, 0); add(b, rbox(5.6, 0.25, 5.6, 0.05), M.inkLine, 0, BY + 1.15, 0); add(b, rbox(5.6, 0.25, 5.6, 0.05), M.inkLine, 0, BY + 0.05, 0); // a team band round it between ink lines
  add(b, cyl(1.5, 1.8, 2.0, 10), M.tunic, 0.4, BY + 2.6, 0); add(b, sph(1.5, 12, 10), M.linen, 0.5, BY + 4.4, 0); add(b, sph(0.95, 10, 8), M.skin, 1.5, BY + 4.2, 0).scale.set(0.8, 0.9, 0.9); // the lookout, a pale coif
  add(b, cyl(0.9, 0.9, 3.4, 8), M.leather, 2.4, BY + 4.6, 0.6, 0, 0, -1.1);                       // a spyglass, raised
  for (const z of [-3.0, 3.0]) add(b, sph(0.9, 8, 6), M.canvasDark, -2.4, BY - 0.6, z).scale.set(1, 1.3, 1); // sandbags hung outside
  pennant(b, M, -2.4, BY + 1.9, -2.4, 7, 6);                                                      // a team pennant on the basket's corner
  if (M.polish) { // secondary detail (the polish pass): the net (a third hoop and four meridian ropes down the envelope to the load ring), oak posts at the basket's corners and an oak band at its foot, rope rings on the sandbags
    add(b, torus(R * 0.97, 0.3, 32), A.rope, 0, -1.6, 0, Math.PI / 2, 0, 0);
    const rAt = (y) => R * Math.sqrt(Math.max(0, 1 - (y / 1.12 / R) ** 2)) + 0.15;              // the envelope's radius at a height, a hair proud
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.95, ys = [7.0, 4.6, 1.6, -1.6, -4.6, -7.0], P = ys.map(y => [rAt(y) * Math.cos(a), y, rAt(y) * Math.sin(a)]);
      P.push([1.8 * Math.cos(a), -R * 1.12 - 2.4, 1.8 * Math.sin(a)]);                           // down to the load ring
      for (let i = 0; i + 1 < P.length; i++) limb(b, P[i], P[i + 1], 0.35, A.rope);
    }
    for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) add(b, rbox(0.7, 3.8, 0.7, 0.1), M.oak, x, BY, z);
    add(b, rbox(5.5, 0.5, 5.5, 0.1), M.oak, 0, BY - 1.6, 0);
    for (const z of [-3.0, 3.0]) add(b, torus(0.65, 0.2, 10), A.rope, -2.4, BY - 0.2, z, Math.PI / 2, 0, 0);
  }
  return g;
}
