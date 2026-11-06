// The Vael's units on the new look (STYLE.md, "Vael units"): pale pearl on an ink core, one small deeplight each.
// Step 1's family: the Needle (scythe), the Tender (halo), the Conch (monolith), the Undertow (umbra, with its lurk
// pose), the Petrel (shrike) and the Argonaut (sovereign). The Glint and the Lens stay in vael2.js. Same conventions:
// game units, units face +x, y up, +z south; everything hovers, the shadow beneath says how high. Shape language:
// fighters are blades and discs, support a flower, heavies spirals; the Undertow is the one ink-dark Vael.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate } from './models.js';
import { ring, lathe, coil, cone } from './vael.js';
import { deeplight } from './vael2.js';

// ---- the family's own materials: the Tender's aqua light (the one Vael light that is not violet) ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const halo = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  const A = {
    aqua: std({ color: 0x1c7a70, emissive: 0x3ee0c8, emissiveIntensity: 1.9, roughness: 0.2 }),                     // the Tender's light
    aquaCore: std({ color: 0xd0fff8, emissive: 0xe4fffa, emissiveIntensity: 1.1 }),                                   // its white heart
    aquaHalo1: halo(0x48e0c8, 0.18), aquaHalo2: halo(0x3cc8b4, 0.09), aquaHalo3: halo(0x30b0a0, 0.045),
  };
  FAM.set(M, A); return A;
}
/** The Tender's aqua light: the deeplight's shape in aqua. */
function aqualight(parent, M, r, x, y, z) {
  const A = fam(M);
  add(parent, sph(r, 10, 8), A.aqua, x, y, z);
  add(parent, sph(r * 0.62, 8, 6), A.aquaCore, x, y, z);
  add(parent, sph(r * 1.7, 10, 8), A.aquaHalo1, x, y, z);
  add(parent, sph(r * 2.5, 10, 8), A.aquaHalo2, x, y, z);
  add(parent, sph(r * 3.4, 10, 8), A.aquaHalo3, x, y, z);
}
const scaled = (pts, kx, kz, dx = 0) => pts.map(([x, z]) => [x * kx + dx, z * kz]);
/** A plate and, under it, the same outline a hair wider in `edge`: a thin rim shows round the plate. */
function rimmed(parent, pts, depth, mat, edge, y, grow = 0.6) {
  add(parent, plate(pts, depth, Math.min(0.5, depth * 0.3)), mat, 0, y, 0);
  add(parent, plate(pts.map(([x, z]) => { const l = Math.hypot(x, z) || 1; return [x + x / l * grow, z + z / l * grow]; }), depth * 0.6, 0.2), edge, 0, y - depth * 0.1, 0);
}

/** Needle (melee): a slim pale blade, point first: a leaf of pearl 22 long and 5 wide with a ridge down its back, an
 *  ink keel beneath; the hilt is the team glaze (the aft third, between ink seams) and at the stern the eye of the
 *  needle, a pearl loop with the one deeplight in it. Never the Glint's round drop: a long slim shape at 18 px. */
export function needle(M, f) {
  const g = grp(), b = grp(); b.position.y = 6 + (f % 2) * 0.6; b.rotation.z = -0.05;
  const blade = [[11, 0], [7, -1.3], [1, -2.4], [-5, -2.6], [-9, -2.1], [-10.5, -1.1], [-10.5, 1.1], [-9, 2.1], [-5, 2.6], [1, 2.4], [7, 1.3]];
  add(b, plate(blade, 1.5, 0.45), M.shellLight, 0, -0.7, 0);                                  // the blade
  add(b, plate(scaled(blade, 0.9, 0.42, -0.6), 1.1, 0.35), M.shell, 0, 0.6, 0);               // the ridge down its back
  add(b, plate(scaled(blade, 0.86, 0.78, -0.9), 1.3, 0.35), M.ink, 0, -2, 0);                 // the ink keel beneath
  add(b, rbox(9, 2.2, 0.9, 0.3), M.ink, -3.5, -2.9, 0);                                       // a deeper keel fin under the aft
  add(b, plate([[-3.2, -2.95], [-8.6, -2.6], [-8.6, 2.6], [-3.2, 2.95]], 1.2, 0.3), M.glaze, 0, 0.75, 0); // the hilt: team glaze over the aft third
  add(b, rbox(0.5, 1.5, 5.3, 0.1), M.inkSeam, -3.1, 0.9, 0); add(b, rbox(0.5, 1.5, 4.6, 0.1), M.inkSeam, -8.7, 0.9, 0); // ink seams either side of it
  add(b, rbox(5.6, 0.3, 0.5, 0.1), M.inkSeam, -5.9, 2, 2.75); add(b, rbox(5.6, 0.3, 0.5, 0.1), M.inkSeam, -5.9, 2, -2.75); // and along its flanks
  const eye = grp(); eye.position.set(-12, 0.6, 0); b.add(eye);
  add(eye, new THREE.TorusGeometry(1.9, 0.55, 8, 20), M.ring, 0, 0, 0, 0, Math.PI / 2, 0);   // the eye of the needle, upright across the stern
  deeplight(eye, M, 1.05, 0, 0, 0);                                                           // the one light, in the eye
  g.add(b); return g;
}

/** Tender (support, a detector): a flower of pearl round an aqua light: six broad outer petals open wide (the
 *  scalloped pale outline), a team ring where they root (glaze on each petal's root between ink seams, and a band
 *  round the ink calyx beneath), an inner cup of three lighter petals round the light. Not the Lens's dark disc with
 *  a bright centre, not the Glint's solid drop: petals, and the one Vael light that is aqua. */
export function tender(M, f) {
  const g = grp(), b = grp(); b.position.y = 7 + (f % 2) * 0.7;
  add(b, lathe([[0, -3.4], [2.6, -3.1], [4.1, -1.8], [4.6, -0.2], [4.3, 0.6]], 24), M.ink, 0, 0, 0);   // the calyx: an ink cup beneath
  add(b, cyl(4.75, 4.55, 1.3, 24), M.glaze, 0, -1, 0);                                        // the team band round it
  add(b, cyl(4.85, 4.85, 0.35, 24), M.inkSeam, 0, -0.2, 0); add(b, cyl(4.7, 4.7, 0.35, 24), M.inkSeam, 0, -1.8, 0);
  const leaf = (l, w) => [[0, -w * 0.3], [l * 0.3, -w * 0.5], [l * 0.7, -w * 0.45], [l * 0.92, -w * 0.2], [l, 0], [l * 0.92, w * 0.2], [l * 0.7, w * 0.45], [l * 0.3, w * 0.5], [0, w * 0.3]];
  for (let k = 0; k < 6; k++) {                                                               // the outer petals
    const a = k / 6 * Math.PI * 2 + Math.PI / 6 + (f % 2) * 0.04, p = grp();
    p.position.set(Math.cos(a) * 2.6, 0.4, Math.sin(a) * 2.6); p.rotation.set(0, -a, 0); p.rotateZ(0.42); b.add(p);
    add(p, plate(leaf(6.6, 4.4), 0.9, 0.3), M.shell, 0, -0.45, 0);
    add(p, plate(leaf(2.9, 3.6).map(([x, z]) => [x + 0.2, z]), 0.6, 0.15), M.glaze, 0, 0.35, 0);   // team on its root
    add(p, rbox(0.4, 0.9, 3.2, 0.1), M.inkSeam, 3.2, 0.45, 0);                               // the ink seam at the root's end
    add(p, rbox(0.4, 0.9, 2.4, 0.1), M.inkSeam, 0.1, 0.45, 0);                               // and at the cup
    add(p, plate(leaf(1.4, 1.1).map(([x, z]) => [x + 2.4, z]), 0.4, 0.1), M.shellDeep, 0, 0.95, 0);   // its crease
  }
  for (let k = 0; k < 3; k++) {                                                               // the inner cup: three steeper, lighter petals round the light
    const a = k / 3 * Math.PI * 2 + Math.PI / 2, p = grp();
    p.position.set(Math.cos(a) * 1.3, 1.1, Math.sin(a) * 1.3); p.rotation.set(0, -a, 0); p.rotateZ(0.95); b.add(p);
    add(p, plate(leaf(3.8, 3), 0.7, 0.2), M.shellLight, 0, -0.35, 0);
  }
  add(b, cyl(2.2, 1.6, 1, 16), M.ring, 0, 1, 0);                                              // the cup's pearl lip
  add(b, cyl(1.5, 1.5, 0.5, 16), M.inkSeam, 0, 1.5, 0);                                       // an ink socket
  aqualight(b, M, 1.35, 0, 2.3, 0);                                                           // the aqua light
  g.add(b); return g;
}

/** Conch (siege, heavy): a spiral shell standing on its ink: a pearl coil of two and a half whorls climbing to the
 *  apex, the mouth an ink aperture facing the bow with the deeplight deep in it (the muzzle); a team ridge coiling
 *  along the whorls' shoulder between ink seams; an ink disc beneath it all. The biggest ground Vael: round from
 *  above, a spiral, never the Argonaut's long barge. */
export function conch(M, f) {
  const g = grp(), b = grp(); b.position.y = 3 + (f % 2) * 0.5;
  add(b, cyl(9.5, 10.5, 2, 32), M.ink, 0, 0, 0);                                              // the ink disc it rides on
  ring(b, 10.4, 0.55, M.shellDark, 0.9, { seg: 40 });                                         // its pearl lip
  const H = { cx: -1.5, turns: 2.4, r0: 6.8, r1: 0.7, y0: 6.2, y1: 17, a0: 0 }, T0 = 5.8, T1 = 1;
  add(b, coil(H, T0, T1, 120, 16), M.shell, 0, 0, 0);                                         // the shell
  add(b, coil({ ...H, r0: H.r0 + T0 * 0.4, r1: H.r1 + T1 * 0.4, y0: H.y0 + T0 * 0.62, y1: H.y1 + T1 * 0.62, t0: 0.06, t1: 0.95 }, T0 * 0.46, T1 * 0.46, 120, 10), M.glaze, 0, 0, 0); // the team ridge along the whorls' shoulder
  for (const k of [0.44, 0.9]) add(b, coil({ ...H, r0: H.r0 + T0 * k * 0.72, r1: H.r1 + T1 * k * 0.72, y0: H.y0 + T0 * k, y1: H.y1 + T1 * k, t0: 0.06, t1: 0.95 }, T0 * 0.1, T1 * 0.1, 120, 8), M.inkSeam, 0, 0, 0); // ink seams either side of it
  add(b, sph(T1 * 1.4, 10, 8), M.ring, H.cx + Math.cos(H.turns * Math.PI * 2) * H.r1, H.y1 + 0.2, -Math.sin(H.turns * Math.PI * 2) * H.r1); // the apex
  const mouth = grp(); mouth.position.set(H.cx + H.r0 + 1.2, H.y0, 0); b.add(mouth);           // the mouth: an ink aperture facing the bow
  add(mouth, sph(T0 * 0.98, 16, 12), M.shell, -1, 0, 0);
  add(mouth, cyl(T0 * 0.8, T0 * 0.6, 3.5, 20), M.ink, 2.2, 0, 0, 0, 0, -Math.PI / 2);
  add(mouth, new THREE.TorusGeometry(T0 * 0.84, 0.75, 8, 28), M.glaze, 3.4, 0, 0, 0, Math.PI / 2, 0); // its lip, team glaze, facing the bow
  add(mouth, new THREE.TorusGeometry(T0 * 0.98, 0.3, 8, 28), M.inkSeam, 3, 0, 0, 0, Math.PI / 2, 0); add(mouth, new THREE.TorusGeometry(T0 * 0.66, 0.3, 8, 28), M.inkSeam, 4, 0, 0, 0, Math.PI / 2, 0); // ink seams outside and inside it
  deeplight(mouth, M, 1.5, 2.6, 0, 0);                                                        // the light deep in the mouth
  g.add(b); return g;
}

/** Undertow (the lurker): the one ink-dark Vael, a low blade of black glass with a thin pearl edge and the team
 *  glaze on its hilt (between ink seams), one small deeplight at the pommel. Frames 0-1: gliding on its edge, point
 *  first, the blade upright and low over the ground; frame 2: lying flat on the ground as it lurks (UNIT_POSE in
 *  look.js; the sim's `cloaked` picks it). Never the Needle: dark where the Needle is pale, and lower. */
export function undertow(M, f) {
  const g = grp(), b = grp(), flat = f === 2;
  const blade = [[10.5, 0], [6, -1.4], [0, -2.5], [-5.5, -2.8], [-8.5, -2.2], [-9.5, -1], [-9.5, 1], [-8.5, 2.2], [-5.5, 2.8], [0, 2.5], [6, 1.4]];
  const s = grp(); b.add(s);                                                                  // the blade: built flat (its outline in the ground plane), canted on its edge to glide
  rimmed(s, blade, 1.4, M.ink, M.ring, 0, 0.55);
  add(s, plate(scaled(blade, 0.92, 0.5, -0.4), 0.9, 0.3), M.ink, 0, 1.25, 0);                // the spine
  const hilt = [[-3.4, -3.1], [-8.8, -2.6], [-8.8, 2.6], [-3.4, 3.1]];
  add(s, plate(hilt, 1.3, 0.3), M.glaze, 0, 1, 0); add(s, plate(hilt, 1.1, 0.3), M.glaze, 0, -1.1, 0);   // the hilt: team glaze, both faces
  for (const y of [1.2, -0.9]) { add(s, rbox(0.5, 1.6, 5.6, 0.1), M.inkSeam, -3.3, y, 0); add(s, rbox(0.5, 1.6, 4.6, 0.1), M.inkSeam, -8.9, y, 0); } // ink seams either side of it
  add(s, rbox(5.4, 2.8, 2.8, 0.7), M.glaze, -6.1, 0.7, 0);                                     // the grip: a team block round the hilt, seen in every pose
  add(s, rbox(0.5, 3.1, 3.1, 0.2), M.inkSeam, -3.5, 0.7, 0); add(s, rbox(0.5, 3.1, 3.1, 0.2), M.inkSeam, -8.7, 0.7, 0); // its ink ends
  add(s, rbox(1.2, 1.8, 1.8, 0.4), M.ring, -10.3, 0.7, 0);                                    // the pommel
  deeplight(s, M, 0.85, -11.2, 0.7, 0);                                                       // the one light, at the pommel
  if (flat) b.position.y = 0.6;
  else { s.rotation.x = 0.85; b.position.y = 3.3 + (f % 2) * 0.5; b.rotation.z = 0.06; }       // canted: the face leans to the south, the lower edge low over the ground
  g.add(b); return g;
}

/** Petrel (flyer): swept pearl wings, a crescent from above, its shadow well offset on the ground (it flies at 20):
 *  two wings swept back and out from a small pod, pearl on top, ink beneath, team glaze on both tips between ink
 *  seams and a team cap on the pod's back, the one deeplight at the tail. One frame: a glider (UNIT_FPS 0). */
export function petrel(M) {
  const g = grp(), b = grp(); b.position.y = 20; b.rotation.z = 0.1;
  for (const side of [-1, 1]) {
    const w = grp(); w.rotation.x = side * 0.14; b.add(w);
    const pts = [[4.5, 0], [1.5, side * 4], [-5, side * 10], [-9.5, side * 14.2], [-10.8, side * 13.6], [-8.2, side * 8.4], [-4.8, side * 3.4], [-3.2, 0]];
    add(w, plate(pts, 1.6, 0.5), M.shellLight, 0, 0, 0);                                      // the wing
    add(w, plate(scaled(pts, 0.94, 0.94, -0.2), 1, 0.3), M.ink, 0, -1.1, 0);                 // ink beneath
    add(w, plate([[-5.6, side * 9.8], [-9.6, side * 14.4], [-11, side * 13.6], [-8.6, side * 8.6]], 1.2, 0.3), M.glaze, 0, 0.6, 0); // the team tip
    add(w, rbox(0.5, 1.4, 3.2, 0.1), M.inkSeam, -7.2, 0.8, side * 9.4, 0, -side * 0.8, 0);  // its ink seam
  }
  add(b, sph(2.9, 16, 12), M.shell, 1, 0.6, 0).scale.set(1.9, 0.75, 1);                       // the pod
  add(b, sph(2.4, 14, 10), M.ink, 0.4, -0.6, 0).scale.set(1.9, 0.6, 0.9);                     // its ink belly
  add(b, sph(1.7, 12, 10), M.glaze, -0.6, 1.9, 0).scale.set(1.5, 0.5, 1);                     // the team cap on its back
  add(b, sph(2.05, 12, 10), M.inkSeam, -0.6, 1.65, 0).scale.set(1.5, 0.45, 1);                // its ink seam
  add(b, sph(1.2, 10, 8), M.inkSeam, -4.8, 0.4, 0);                                           // the tail socket
  deeplight(b, M, 1, -5.4, 0.4, 0);                                                           // the light at the tail
  g.add(b); return g;
}

/** Argonaut (the capital, a detector): a coiled shell barge low over the ground: a long pearl hull, bow at +x, an ink
 *  underside; a coiled shell (two whorls, apex up) over the stern, its mouth opening onto the deck, a team ridge
 *  coiling along it; the deck well team glaze between pearl gunwales with ink hems; at the bow a lantern, a pearl
 *  cage with the one deeplight in it. Four frames: a slow bob (UNIT_FPS 4). Long, never the Conch's round spiral. */
export function argonaut(M, f) {
  const g = grp(), b = grp(); const ph = f / 4 * Math.PI * 2; b.position.y = 4 + 0.5 + 0.5 * Math.sin(ph); b.rotation.z = 0.03 * Math.cos(ph);
  const hull = [[19, 0], [16.5, -5], [10, -8.6], [0, -10], [-10, -9.4], [-16, -6], [-18, 0], [-16, 6], [-10, 9.4], [0, 10], [10, 8.6], [16.5, 5]];
  add(b, plate(hull, 3.6, 1), M.shell, 0, 0, 0);                                              // the hull
  add(b, plate(scaled(hull, 0.9, 0.84, -0.6), 2, 0.6), M.ink, 0, -1.8, 0);                   // its ink underside
  add(b, plate(scaled(hull, 0.93, 0.9, -0.4), 1, 0.3), M.shellLight, 0, 3.4, 0);             // the gunwale deck
  add(b, plate([[11, 0], [9, -4.6], [2, -6.4], [-5, -6.2], [-7.5, -4], [-7.5, 4], [-5, 6.2], [2, 6.4], [9, 4.6]], 1, 0.3), M.glaze, 0, 3.7, 0); // the deck well: team glaze
  add(b, plate([[11.6, 0], [9.4, -5.1], [2, -6.9], [-5.2, -6.7], [-8.1, -4.3], [-8.1, 4.3], [-5.2, 6.7], [2, 6.9], [9.4, 5.1]], 0.5, 0.1), M.inkSeam, 0, 3.55, 0); // its ink hem
  const H = { cx: -10, turns: 2.1, r0: 4.6, r1: 0.5, y0: 6.6, y1: 15, a0: 0 }, T0 = 4.4, T1 = 0.8;
  add(b, coil(H, T0, T1, 110, 14), M.shell, 0, 0, 0);                                         // the coiled shell over the stern
  add(b, coil({ ...H, r0: H.r0 + T0 * 0.45, r1: H.r1 + T1 * 0.45, y0: H.y0 + T0 * 0.6, y1: H.y1 + T1 * 0.6, t0: 0.1, t1: 0.95 }, T0 * 0.3, T1 * 0.3, 110, 10), M.glaze, 0, 0, 0); // its team ridge
  for (const k of [0.56, 0.86]) add(b, coil({ ...H, r0: H.r0 + T0 * k * 0.72, r1: H.r1 + T1 * k * 0.72, y0: H.y0 + T0 * k, y1: H.y1 + T1 * k, t0: 0.1, t1: 0.95 }, T0 * 0.09, T1 * 0.09, 110, 8), M.inkSeam, 0, 0, 0);
  add(b, sph(T0 * 0.98, 16, 12), M.shell, H.cx + H.r0 + 0.6, H.y0, 0);                        // the mouth, opening onto the deck
  add(b, cyl(T0 * 0.72, T0 * 0.55, 2.4, 18), M.ink, H.cx + H.r0 + 3.4, H.y0, 0, 0, 0, -Math.PI / 2);
  add(b, sph(T1 * 1.5, 10, 8), M.ring, H.cx + Math.cos(H.turns * Math.PI * 2) * H.r1, H.y1 + 0.2, -Math.sin(H.turns * Math.PI * 2) * H.r1); // the apex
  const lan = grp(); lan.position.set(14.5, 3.9, 0); b.add(lan);                              // the lantern at the bow
  add(lan, cyl(1.6, 2, 1.2, 12), M.shellDark, 0, 0.6, 0);                                     // its foot
  add(lan, cyl(0.5, 0.5, 5, 8), M.ring, 0, 3.4, 0);                                           // the post
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; add(lan, rbox(0.4, 4, 0.4, 0.1), M.inkSeam, Math.cos(a) * 2.2, 7.6, Math.sin(a) * 2.2); } // the cage
  add(lan, cyl(2.6, 2.6, 0.6, 12), M.inkSeam, 0, 5.6, 0); add(lan, cone(2.9, 1.6, 12), M.shell, 0, 10.2, 0);   // its floor and pearl hood
  deeplight(lan, M, 1.5, 0, 7.6, 0);                                                          // the lantern's light
  add(b, rbox(5, 1.2, 1.2, 0.4), M.ring, 19.5, 2.4, 0);                                       // the bowsprit
  g.add(b); return g;
}
