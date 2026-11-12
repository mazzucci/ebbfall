// An older Expedition unit look (STYLE.md, "Vael units"): pale pearl on an ink core, one small deeplight each. Two
// remain: `needle` (a sickle; a fitTints reference, main.js) and `tender` (a round cup of petals: the Halo, a healer
// the sim keeps but trains nowhere). `glint` stays in vael2.js. Same conventions: game units, units face +x, y up, +z
// south; everything hovers, the shadow beneath says how high.
import * as THREE from 'three';
import { grp, add, cyl, sph, plate, limb } from './models.js';
import { lathe, coil } from './vael.js';
import { deeplight } from './vael2.js';
import { VP } from './vael-palette.js';

// ---- the family's own materials (colors: vael-palette.js): the Tender's mending light, apart from the weapons' ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const halo = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  const A = {
    aqua: std({ color: VP.mend.light[0], emissive: VP.mend.light[1], emissiveIntensity: VP.mend.light[2], roughness: 0.25 }),                     // the Tender's light: aqua through and through (round 3: x 1.25 of 0x18d8b4 clipped to white at 1x, a white star)
    aquaGlass: new THREE.MeshPhysicalMaterial({ color: VP.mend.glass[0], emissive: VP.mend.glass[1], emissiveIntensity: 1, roughness: 0.3, clearcoat: 0.8 }), // the Tender's inner petals: aqua glass round the light, so its heart is a broad aqua eye
    aquaCore: std({ color: VP.mend.core[0], emissive: VP.mend.core[1], emissiveIntensity: 0.9 }),                                   // its pale heart, aqua-white, small
    aquaHalo2: halo(VP.mend.halo[0], 0.12), aquaHalo3: halo(VP.mend.halo[1], 0.06),
    inkMatte: std({ color: VP.inkMatte, metalness: 0.2, roughness: 0.62 }),                                              // the Undertow's black glass: matte, so a canted face takes no sheen from the rim light
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
/** A round petal's tip (top view): the part of its end circle (center `cx` on the x axis, radius `r`) beyond a chord
 *  `cut` behind the center. */
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
