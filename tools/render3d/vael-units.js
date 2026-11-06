// The Vael's units on the new look (STYLE.md, "Vael units"): pale pearl on an ink core, one small deeplight each.
// Step 1's family: the Needle (scythe), the Tender (halo), the Conch (monolith), the Undertow (umbra, with its lurk
// pose), the Petrel (shrike) and the Argonaut (sovereign). The Glint and the Lens stay in vael2.js. Same conventions:
// game units, units face +x, y up, +z south; everything hovers, the shadow beneath says how high. Shape language:
// fighters are blades and discs, support a flower, heavies spirals; the Undertow is the one ink-dark Vael.
// Round 1's blind test read a slim leaf as a boat's hull, a small pointed flower as a star, a dark leaf as a Kite and a
// barge with a big coil as a Conch: so the Needle is a sickle, the Tender a round cup of petals, the Undertow a rimmed
// and lit blade and the Argonaut long with a small coil.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { lathe, coil, cone } from './vael.js';
import { deeplight } from './vael2.js';

// ---- the family's own materials: the Tender's aqua light (the one Vael light that is not violet) ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const halo = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  const A = {
    aqua: std({ color: 0x0a5a4c, emissive: 0x12b898, emissiveIntensity: 1.0, roughness: 0.25 }),                     // the Tender's light: aqua through and through (round 3: x 1.25 of 0x18d8b4 clipped to white at 1x, a white star)
    aquaGlass: new THREE.MeshPhysicalMaterial({ color: 0x1f8c7a, emissive: 0x0a4a40, emissiveIntensity: 1, roughness: 0.3, clearcoat: 0.8 }), // the Tender's inner petals: aqua glass round the light, so its heart is a broad aqua eye
    aquaCore: std({ color: 0x9cf4e4, emissive: 0xa8fff0, emissiveIntensity: 0.9 }),                                   // its pale heart, aqua-white, small
    aquaHalo1: halo(0x30e0c0, 0.26), aquaHalo2: halo(0x28c4ac, 0.12), aquaHalo3: halo(0x20ac98, 0.06),
    inkMatte: std({ color: 0x0e0c14, metalness: 0.2, roughness: 0.62 }),                                              // the Undertow's black glass: matte, so a canted face takes no sheen from the rim light
  };
  FAM.set(M, A); return A;
}
/** The Tender's aqua light: a big aqua bead with a small heart (the aqua must survive the heart at 1x), its halos kept
 *  close (r 3 since round 3: a wide halo would wash the petals). */
function aqualight(parent, M, r, x, y, z) {
  const A = fam(M);
  add(parent, sph(r, 16, 12), A.aqua, x, y, z);
  add(parent, sph(r * 0.3, 8, 6), A.aquaCore, x, y + r * 0.3, z + r * 0.5);
  add(parent, sph(r * 1.4, 12, 10), A.aquaHalo2, x, y, z);
  add(parent, sph(r * 2, 12, 10), A.aquaHalo3, x, y, z);
}
const scaled = (pts, kx, kz, dx = 0) => pts.map(([x, z]) => [x * kx + dx, z * kz]);
/** A band between two arcs about C (top view): radius `ro(t)` outside and `ri(t)` inside, t from a0 to a1. */
function arcBand(C, a0, a1, ro, ri, n = 16) {
  const pts = [], at = (t, r) => { const a = a0 + (a1 - a0) * t; return [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]; };
  for (let i = 0; i <= n; i++) pts.push(at(i / n, ro(i / n)));
  for (let i = n; i >= 0; i--) pts.push(at(i / n, ri(i / n)));
  return pts;
}
/** A petal: an ellipse rooted at the origin, `l` long along +x, `w` wide; `k` narrows it towards the tip (a point). */
const petal = (l, w, n = 14, k = 0) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = l / 2 - Math.cos(a) * l / 2; p.push([x, Math.sin(a) * w / 2 * (1 - k * x / l)]); } return p; };

/** Needle (melee): a sickle, point first, all pale: a pearl blade curved on an arc (R 13, 110 degrees, 4.8 wide at
 *  the hilt drawn to a keen point), a lighter ridge along its outer edge and only a hairline of ink along the inner
 *  one (round 2's ink spine made it a dark sliver, the Undertow), a pearl keel beneath; a team band across the
 *  blade's heel and a team handle trailing from it, both between ink seams; at the handle's end the eye of the
 *  needle, a pearl loop with the one deeplight in it. A pale curved blade, never a boat's hull or the Glint's drop. */
export function needle(M, f) {
  const g = grp(), b = grp(); b.position.y = 6 + (f % 2) * 0.6;
  const C = [-1.5, -7.2], A0 = 2.18, A1 = 0.26, R = 13, w = (t) => 4.8 * (1 - t) ** 0.7;    // the arc: the hilt at A0 (aft, south-west), the tip at A1 (ahead, north-east)
  add(b, plate(arcBand(C, A0, A1, () => R, (t) => R - w(t)), 1.4, 0.45), M.shell, 0, -0.7, 0);                // the blade
  add(b, plate(arcBand(C, A0, A1 + 0.04, () => R - 0.3, (t) => R - w(t) * 0.55 - 0.3), 0.9, 0.3), M.shellLight, 0, 0.3, 0); // its lighter ridge along the outer edge
  add(b, plate(arcBand(C, A0, A1 + 0.1, (t) => R - w(t) + 0.45, (t) => R - w(t) - 0.05, 14), 0.9, 0.1), M.inkSeam, 0, 0.35, 0);   // a hairline of ink along the inner edge
  add(b, plate(arcBand(C, A0, A1 + 0.08, () => R - 0.6, (t) => R - w(t) + 0.4), 1.2, 0.3), M.shellDark, 0, -1.9, 0);   // the keel beneath, pearl in shade
  add(b, plate(arcBand(C, A0 + 0.02, A0 - 0.5, () => R + 0.1, (t) => R - w(t * 0.2) - 0.2, 6), 1, 0.3), M.glaze, 0, 0.5, 0); // the team band across the heel
  for (const a of [A0 - 0.5, A0 + 0.02]) add(b, plate(arcBand(C, a + 0.03, a - 0.03, () => R + 0.2, () => R - 5.2, 2), 1.1, 0.1), M.inkSeam, 0, 0.6, 0); // ink seams either side
  const ha = A0, hx = C[0] + Math.cos(ha) * (R - 2.4), hz = C[1] + Math.sin(ha) * (R - 2.4), dx = -Math.sin(ha), dz = Math.cos(ha); // the handle: tangent, trailing aft from the heel
  limb(b, [hx, 0, hz], [hx + dx * 5.6, 0, hz + dz * 5.6], 1.25, M.glaze);
  limb(b, [hx + dx * 0.2, 0, hz + dz * 0.2], [hx + dx * 0.8, 0, hz + dz * 0.8], 1.4, M.inkSeam);
  limb(b, [hx + dx * 5.2, 0, hz + dz * 5.2], [hx + dx * 5.8, 0, hz + dz * 5.8], 1.4, M.inkSeam);
  const eye = grp(); eye.position.set(hx + dx * 7.4, 0, hz + dz * 7.4); eye.rotation.y = -Math.atan2(dz, dx); b.add(eye);
  add(eye, new THREE.TorusGeometry(1.9, 0.55, 8, 20), M.ring, 0, 0, 0, 0, Math.PI / 2, 0);   // the eye of the needle, upright across the handle's end
  deeplight(eye, M, 1.05, 0, 0, 0);                                                           // the one light, in the eye
  g.add(b); return g;
}

/** A round petal (top view): narrow at its root (the origin), its broad end a circle of radius `w`/2 at the tip, `l` long
 *  along +x: from above a row of them is a scalloped rosette, notched between round lobes, never a star's points. */
const roundPetal = (l, w, root = 0.3, n = 18) => {
  const r = w / 2, cx = l - r, p = [[0, -w * root / 2]];
  for (let i = 0; i <= n; i++) { const a = -Math.PI * 0.62 + Math.PI * 1.24 * i / n; p.push([cx + Math.cos(a) * r, Math.sin(a) * r]); }
  p.push([0, w * root / 2]); return p;
};
/** A round petal's tip (top view): the part of its end circle (centre `cx` on the x axis, radius `r`) beyond a chord
 *  `cut` behind the centre. */
const tipCap = (cx, r, cut, n = 18) => { const f = Math.acos(-cut / r), p = []; for (let i = 0; i <= n; i++) { const a = -f + 2 * f * i / n; p.push([cx + Math.cos(a) * r, Math.sin(a) * r]); } return p; };
/** Tender (support, a detector): a flower of pearl round a big aqua heart, 23 across (about 2.6x the Glint's
 *  footprint): six broad round petals cupped up round the heart, notched between their lobes (round 3: six narrow
 *  pointed petals read as a star, a sparkle, the Glint), each petal's tip team glaze behind an ink seam, an ink calyx
 *  beneath with a team band round it; the heart a cup of five small aqua-glass petals round the aqua light, inside an
 *  ink ring: a broad aqua eye in every seat, the one Vael light that is aqua, a mender, not a weapon. */
export function tender(M, f) {
  const g = grp(), b = grp(), A = fam(M); b.position.y = 7 + (f % 2) * 0.7;
  add(b, lathe([[0, -3.6], [2.8, -3.3], [4.4, -1.9], [5, -0.2], [4.7, 0.6]], 24), M.ink, 0, 0, 0);   // the calyx: an ink cup beneath
  add(b, cyl(5.15, 4.95, 1.4, 24), M.glaze, 0, -1.1, 0);                                      // the team band round it
  add(b, cyl(5.25, 5.25, 0.35, 24), M.inkSeam, 0, -0.25, 0); add(b, cyl(5.1, 5.1, 0.35, 24), M.inkSeam, 0, -1.95, 0);
  for (let k = 0; k < 6; k++) {                                                               // the petals: six, broad and round, cupped up, 23 across
    const a = k / 6 * Math.PI * 2 + Math.PI / 6 + (f % 2) * 0.04, p = grp(), team = k % 2 === 0;   // (team: every other petal)
    p.position.set(Math.cos(a) * 1.8, 0.4, Math.sin(a) * 1.8); p.rotation.set(0, -a, 0); p.rotateZ(0.34); b.add(p);
    add(p, plate(roundPetal(10, 6.8), 1, 0.35), M.shell, 0, -0.5, 0);
    // every other petal in team glaze inside an ink seam (round 3: two opposite team petals made a bar through the
    // light at 1x, a bow or an insect; alternate petals show each lobe apart in every facing)
    if (team) { add(p, plate(scaled(roundPetal(9.2, 6.0), 1, 1, 0.6), 0.6, 0.15), M.glaze, 0, 0.4, 0); add(p, plate(scaled(roundPetal(9.7, 6.5), 1, 1, 0.2), 0.3, 0.1), M.inkSeam, 0, 0.3, 0); }
    else { add(p, plate(scaled(roundPetal(8.6, 5.4), 1, 1, 1), 0.4, 0.15), M.shellLight, 0, 0.35, 0); add(p, plate(scaled(petal(5, 0.9, 14, 0.5), 1, 1, 3.2), 0.4, 0.1), M.shellDeep, 0, 0.55, 0); } // a lighter face, a vein down its middle
  }
  add(b, cyl(4.6, 3.4, 0.8, 24), M.inkSeam, 0, 1.0, 0);                                        // an ink ring under the heart: the seam between the pearl and the aqua
  for (let k = 0; k < 5; k++) {                                                               // the inner cup: five small round petals of aqua glass round the light
    const a = k / 5 * Math.PI * 2, p = grp();
    p.position.set(Math.cos(a) * 1.2, 1.5, Math.sin(a) * 1.2); p.rotation.set(0, -a, 0); p.rotateZ(0.7); b.add(p);
    add(p, plate(roundPetal(3.8, 2.9, 0.5), 0.6, 0.2), A.aquaGlass, 0, -0.3, 0);
  }
  aqualight(b, M, 2.4, 0, 3.4, 0);                                                            // the aqua light, big, in the cup
  g.add(b); return g;
}

/** Conch (siege, heavy): a spiral shell standing on its ink: a pearl coil of two and a half whorls climbing to the
 *  apex, the mouth an ink aperture facing the bow with the deeplight deep in it (the muzzle); a team ridge coiling
 *  along the whorls' shoulder between ink seams and a team lip round the mouth; an ink disc beneath it all with a
 *  lit pearl rim. The biggest ground Vael: round from above, a spiral, never the Argonaut's long barge. */
export function conch(M, f) {
  const g = grp(), b = grp(); b.position.y = 3 + (f % 2) * 0.5;
  add(b, cyl(9.5, 10.5, 2, 32), M.ink, 0, 0, 0);                                              // the ink disc it rides on
  add(b, new THREE.TorusGeometry(10.3, 0.7, 8, 40), M.ring, 0, 1, 0, Math.PI / 2, 0, 0);     // its pearl rim, lit on the front
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

/** Undertow (the lurker): the one ink-dark Vael, a low curved blade: a pearl plate (the rim, a full unit wide all
 *  round) with the black glass inset in it, a curved leading edge drawn to a point, a team hilt on both faces and a
 *  slim team grip, the deeplight at the pommel. Frames 0-1: gliding canted on its edge, point first, low over the
 *  ground, a thin line of deeplight along the leading edge and the tail light bright; frame 2: lying flat on the
 *  ground as it lurks (UNIT_POSE in look.js, shown while the snapshot's `cloaked` is set), the same blade kept dark:
 *  no edge light, the tail light small. Never the Needle: dark where the Needle is pale, and lower. */
export function undertow(M, f) {
  const g = grp(), b = grp(), flat = f === 2;
  const blade = [[10.5, 0], [7.5, -1.6], [3, -2.9], [-2.5, -3.5], [-7, -3.2], [-9.5, -2], [-9.5, 2], [-7, 3.2], [-2.5, 3.5], [3, 2.9], [7.5, 1.6]]; // a leaf with a swept leading edge
  const s = grp(); b.add(s);                                                                  // the blade: built flat (its outline in the ground plane), canted on its edge to glide
  add(s, plate(blade, 0.6, 0.2), M.ring, 0, -0.3, 0);                                         // the pearl plate: thin, so from the edge the blade is ink and from above its rim a line
  const A = fam(M);
  add(s, plate(scaled(blade, 0.96, 0.86, -0.1), 1.5, 0.35), A.inkMatte, 0, 0.1, 0);          // the black glass inset in it, top (matte: no sheen on the canted face)
  add(s, plate(scaled(blade, 0.96, 0.86, -0.1), 1.2, 0.35), A.inkMatte, 0, -1.5, 0);         // and beneath
  const hilt = [[-3.4, -2.6], [-8.8, -2.3], [-8.8, 2.3], [-3.4, 2.6]];
  add(s, plate(hilt, 1.1, 0.3), M.glaze, 0, 0.9, 0); add(s, plate(hilt, 1, 0.3), M.glaze, 0, -1.3, 0);   // the hilt: team glaze, both faces
  for (const y of [1.1, -1.1]) { add(s, rbox(0.5, 1.6, 4.8, 0.1), M.inkSeam, -3.3, y, 0); add(s, rbox(0.5, 1.6, 4.2, 0.1), M.inkSeam, -8.9, y, 0); } // ink seams either side of it
  add(s, rbox(5.4, 2.4, 2.4, 0.6), M.glaze, -6.1, 0.4, 0);                                     // the grip: a slim team block round the hilt
  add(s, rbox(0.5, 2.7, 2.7, 0.2), M.inkSeam, -3.5, 0.4, 0); add(s, rbox(0.5, 2.7, 2.7, 0.2), M.inkSeam, -8.7, 0.4, 0); // its ink ends
  add(s, rbox(1.2, 1.8, 1.8, 0.4), M.ring, -10.3, 0.4, 0);                                    // the pommel
  if (flat) { b.position.y = 0.6; deeplight(s, M, 0.7, -11.1, 0.4, 0); add(s, sph(0.55, 8, 6), M.glaze, -10.3, 1.4, 0); } // lurking: dark, the tail light small, a team dot on the pommel
  else {
    s.rotation.x = 0.7; b.position.y = 3.3 + (f % 2) * 0.5; b.rotation.z = 0.06;              // canted: the face leans to the south, the lower edge low over the ground
    deeplight(s, M, 1.2, -11.4, 0.4, 0);                                                       // the tail light, bright
    for (let i = 0; i < 4; i++) {                                                             // the leading edge lit: a thin line of deeplight down the swept edge
      const [x0, z0] = blade[i], [x1, z1] = blade[i + 1];
      limb(s, [x0, 0.9, z0 * 0.95], [x1, 0.9, z1 * 0.95], 0.28, M.deeplight); limb(s, [x0, 0.9, z0 * 0.95], [x1, 0.9, z1 * 0.95], 0.7, M.deepHalo1);
    }
  }
  g.add(b); return g;
}

/** Petrel (flyer): swept pearl wings, a crescent from above, its shadow well offset on the ground (it flies at 20):
 *  two wings swept back and out from a small pod, pearl on top, ink beneath, team glaze on both tips behind a full
 *  ink seam across the wing and a team cap on the pod's back, the one deeplight at the tail. One frame: a glider
 *  (UNIT_FPS 0). */
export function petrel(M) {
  const g = grp(), b = grp(); b.position.y = 20; b.rotation.z = 0.1;
  for (const side of [-1, 1]) {
    const w = grp(); w.rotation.x = side * 0.14; b.add(w);
    // a gull's wing: the curve only at the root (the leading edge bowed forward, the trailing edge hollowed), the outer
    // wing straight and swept to the tip (a crescent all along read as the Needle's sickle at phone size)
    const bez = (P, n) => { const o = []; for (let i = 0; i < n; i++) { const t = i / n, u = 1 - t; o.push([u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0], side * (u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1])]); } return o; };
    const pts = [...bez([[4.5, 0], [6, 6.5], [-2.2, 9.6]], 6), [-9.5, side * 15.2], [-11.2, side * 15.4], [-11.8, side * 14.2], [-7.6, side * 9.4], ...bez([[-7.6, 9.4], [-5.4, 4.6], [-3.4, 0]], 6)];
    add(w, plate(pts, 1.6, 0.5), M.shellLight, 0, 0, 0);                                      // the wing
    add(w, plate(scaled(pts, 0.94, 0.94, -0.2), 1, 0.3), M.ink, 0, -1.1, 0);                 // ink beneath
    add(w, plate([[-4.3, side * 11.2], [-9.5, side * 15.2], [-11.2, side * 15.4], [-11.8, side * 14.2], [-8.3, side * 10.2]], 1.2, 0.3), M.glaze, 0, 0.6, 0); // the team tip
    add(w, plate([[-3.7, side * 10.5], [-4.9, side * 11.9], [-8.8, side * 10.6], [-7.8, side * 9.4]], 1.5, 0.1), M.inkSeam, 0, 0.5, 0); // the ink seam across the wing where the glaze begins
  }
  add(b, sph(3.1, 16, 12), M.shell, 0.5, 1.4, 0).scale.set(2.1, 0.8, 1);                      // the body: a pearl hull 13 long riding above the wings, so it is a bird, not a blade
  add(b, sph(2.6, 14, 10), M.ink, 0, 0, 0).scale.set(2.1, 0.6, 0.9);                          // its ink belly
  add(b, sph(2.2, 14, 10), M.shellLight, 4.2, 2, 0).scale.set(1, 0.7, 0.8);                   // the head, forward
  add(b, sph(2.3, 12, 10), M.glaze, -0.8, 2.9, 0).scale.set(1.9, 0.5, 1.1);                   // the team cap on its back, most of the body's top (the pale body costs team share)
  add(b, sph(2.65, 12, 10), M.inkSeam, -0.8, 2.65, 0).scale.set(1.9, 0.45, 1.1);              // its ink seam
  add(b, sph(1.3, 10, 8), M.inkSeam, -6.2, 1.2, 0);                                           // the tail socket
  deeplight(b, M, 1, -6.9, 1.2, 0);                                                           // the light at the tail
  g.add(b); return g;
}

/** Argonaut (the capital, a detector): a coiled shell barge low over the ground, long before anything else: a pearl
 *  hull 44 long and 17 wide, bow at +x, an ink underside, pearl shell ridges along both gunwales; a small coiled shell
 *  over the stern, its mouth opening onto the deck, a team ridge coiling along it; the deck well a low team dome
 *  with an ink hem; at the bow a lantern: a big deeplight under a pearl hood on a short post, no cage. Four frames:
 *  a slow bob (UNIT_FPS 4). Long and low, never the Conch's round spiral; the lantern a light, never a gun. */
export function argonaut(M, f) {
  const g = grp(), b = grp(); const ph = f / 4 * Math.PI * 2; b.position.y = 4 + 0.5 + 0.5 * Math.sin(ph); b.rotation.z = 0.03 * Math.cos(ph);
  const hull = [[23, 0], [20, -4.4], [12, -7.4], [0, -8.5], [-12, -8], [-19, -5.4], [-21.5, 0], [-19, 5.4], [-12, 8], [0, 8.5], [12, 7.4], [20, 4.4]];
  add(b, plate(hull, 3.6, 1), M.shell, 0, 0, 0);                                              // the hull
  add(b, plate(scaled(hull, 0.9, 0.84, -0.6), 2, 0.6), M.ink, 0, -1.8, 0);                   // its ink underside
  add(b, plate(scaled(hull, 0.94, 0.9, -0.3), 1, 0.3), M.shellLight, 0, 3.4, 0);             // the gunwale deck
  for (const side of [-1, 1]) for (const [x, l] of [[8, 16], [-8, 12]]) add(b, rbox(l, 0.9, 1.1, 0.4), M.ring, x, 4.3, side * 6.4, 0, side * 0.06, 0); // shell ridges along the gunwales
  add(b, sph(1, 24, 16), M.glaze, 2, 3.5, 0).scale.set(12.6, 1.5, 6.3);                       // the deck well: a low team dome
  add(b, sph(1, 24, 16), M.inkSeam, 2, 3.3, 0).scale.set(13.2, 1.3, 6.8);                     // its ink hem
  add(b, rbox(22, 0.7, 0.8, 0.3), M.ring, 2, 4.9, 0); add(b, rbox(0.8, 0.7, 11, 0.3), M.ring, 4, 4.9, 0); // a pearl fold down the dome's length and a rib across it: not a flat oval
  add(b, cyl(2.2, 2.4, 1.2, 14), M.glaze, 17.5, 4.5, 0); add(b, cyl(2.5, 2.5, 0.35, 14), M.inkSeam, 17.5, 5.2, 0); // the lantern's team foot ring, seamed
  const H = { cx: -13, turns: 2.1, r0: 3.6, r1: 0.45, y0: 6, y1: 12.5, a0: 0 }, T0 = 3.4, T1 = 0.7;
  add(b, coil(H, T0, T1, 110, 14), M.shell, 0, 0, 0);                                         // the coiled shell over the stern, small
  add(b, coil({ ...H, r0: H.r0 + T0 * 0.4, r1: H.r1 + T1 * 0.4, y0: H.y0 + T0 * 0.62, y1: H.y1 + T1 * 0.62, t0: 0.1, t1: 0.95 }, T0 * 0.44, T1 * 0.44, 110, 10), M.glaze, 0, 0, 0); // its team ridge
  for (const k of [0.44, 0.9]) add(b, coil({ ...H, r0: H.r0 + T0 * k * 0.72, r1: H.r1 + T1 * k * 0.72, y0: H.y0 + T0 * k, y1: H.y1 + T1 * k, t0: 0.1, t1: 0.95 }, T0 * 0.1, T1 * 0.1, 110, 8), M.inkSeam, 0, 0, 0);
  add(b, sph(T0 * 0.98, 16, 12), M.shell, H.cx + H.r0 + 0.5, H.y0, 0);                        // the mouth, opening onto the deck
  add(b, cyl(T0 * 0.72, T0 * 0.55, 2, 18), M.ink, H.cx + H.r0 + 2.8, H.y0, 0, 0, 0, -Math.PI / 2);
  add(b, sph(T1 * 1.5, 10, 8), M.ring, H.cx + Math.cos(H.turns * Math.PI * 2) * H.r1, H.y1 + 0.2, -Math.sin(H.turns * Math.PI * 2) * H.r1); // the apex
  const lan = grp(); lan.position.set(17.5, 3.9, 0); b.add(lan);                              // the lantern at the bow
  add(lan, cyl(1.5, 1.9, 1, 12), M.shellDark, 0, 0.5, 0);                                     // its foot
  add(lan, cyl(0.55, 0.55, 3.2, 8), M.ring, 0, 2.4, 0);                                       // a short post
  add(lan, cyl(1.5, 1.5, 0.5, 12), M.inkSeam, 0, 4.1, 0);                                     // an ink socket
  deeplight(lan, M, 2, 0, 5.6, 0);                                                            // the lantern's light, big
  add(lan, cone(2.6, 1.5, 12), M.shell, 0, 8.4, 0);                                           // a pearl hood above it, clear of the light
  add(b, rbox(4, 1, 1, 0.4), M.ring, 23.5, 2.4, 0);                                           // the bowsprit
  g.add(b); return g;
}
