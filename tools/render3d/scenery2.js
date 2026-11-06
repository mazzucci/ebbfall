// The scenery of the drained seabed (STYLE.md "The ground and the scenery"), under the names the client places
// (src/client/scenery.js): what stood in the sea and what the ebb left. Solid props stand on the reef plateaus, which
// nothing walks on; flat ones lie on the open ground and are walked over. All are centred on their anchor; `v` picks
// a variant and seeds the shapes. The names are the old props' (kept so the client and the scatter stay as they are):
//   boulders_* a heap of shells, spire_* pilings, ruin_* a boat's ribs, wreck_* a hull on its side;
//   crater_0 an anchor in the sand, crater_1 a tide pool, debris_* flotsam.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { makeMats, GOLD } from './materials.js';
import { torus, cone } from './vael.js';
import { GMATS } from './ground.js';

let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const std = (o) => new THREE.MeshStandardMaterial(o);
const H = makeMats(GOLD);
/** The scenery's materials: shells grey-tan and two bands under the units' pale tops (white is the Vael's and the
 *  salt's: round 1's 0x8a8375 still rendered near white and a heap read as a cluster of Vael units), weathered timber,
 *  rust, old rope and stained sailcloth (the Harbour's own rope and canvas are pale on purpose, for its units; on the
 *  ground they read as white rings and sheets). The Harbour's tar and iron come from materials.js. */
export const SMATS = {
  shell: std({ color: 0x5a4a3a, roughness: 0.8, metalness: 0.02 }),                            // brown, dull, rounded (round 3: grey-white pieces read as salt)
  shellInner: std({ color: 0x4a3a32, roughness: 0.6, metalness: 0.05 }),
  shellDark: std({ color: 0x3a3028, roughness: 0.8, metalness: 0.05 }),
  pebble: std({ color: 0x3e352c, roughness: 0.9, metalness: 0 }),
  rope: std({ color: 0x6e6048, roughness: 0.95, metalness: 0 }),                                // old rope, wet and dark
  sail: std({ color: 0x5e584c, roughness: 0.95, metalness: 0 }),                                // sailcloth stained by the sea
  cork: std({ color: 0x5c4a36, roughness: 0.95, metalness: 0 }),
  pool: std({ color: 0x131a22, roughness: 0.6, metalness: 0 }),                                // a tide pool: a dull grey-blue film, under the seep's brine in value and hue (round 4's mint teal read as a seep)
  drift: std({ color: 0x6c6252, roughness: 0.9, metalness: 0 }),                              // weathered timber, silver-grey
  driftDark: std({ color: 0x4e463c, roughness: 0.9, metalness: 0 }),
  rust: std({ color: 0x4a3a30, roughness: 0.9, metalness: 0.25 }),
  barnacle: std({ color: 0x8c887c, roughness: 1, metalness: 0, flatShading: true }),
  kelp: std({ color: 0x2a2219, roughness: 0.8, metalness: 0 }),                              // brown-black, as the ground's kelp (never green)
};
const M = SMATS, G = GMATS;
const stone = (r) => new THREE.DodecahedronGeometry(r, 0);
/** A half-cylinder shell (a boat's hull, keel up) with its axis along x, open side down. */
const hullGeo = (r, len, seg = 20) => { const g = new THREE.CylinderGeometry(r, r * 0.92, len, seg, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2); g.computeVertexNormals(); return g; };

/** A clam shell lying on the sand: a flattened half-dome, ribbed, with a dark hinge. `r` 3-7. */
function clam(g, r, x, z, rot, mat = M.shell) {
  const c = grp(); c.position.set(x, 0, z); c.rotation.y = rot;
  add(c, new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, 0.2, 0).scale.set(1, 0.36, 0.85);
  for (let k = -2; k <= 2; k++) add(c, rbox(r * 1.6, 0.3, 0.35, 0.1), mat, 0, r * 0.36 - Math.abs(k) * r * 0.05, k * r * 0.3, 0, 0, k * 0.1); // ribs
  add(c, rbox(r * 0.5, 0.6, r * 0.5, 0.2), M.shellDark, -r * 0.9, 0.3, 0);                      // the hinge
  g.add(c); return c;
}
/** A whelk: three whorls along a tilted axis and a point. */
function whelk(g, r, x, z, rot, mat = M.shell) {
  const c = grp(); c.position.set(x, r * 0.9, z); c.rotation.set(0, rot, 0.22);
  for (let k = 0; k < 3; k++) add(c, sph(r * (1 - k * 0.28), 12, 9), mat, -k * r * 0.75, k * r * 0.12, 0).scale.set(1.1, 0.95, 1);
  add(c, cone(r * 0.45, r * 1.2, 10), mat, -r * 2.5, r * 0.4, 0, 0, 0, Math.PI / 2);
  add(c, sph(r * 0.5, 8, 6), M.shellInner, r * 0.75, -r * 0.3, 0).scale.set(0.8, 0.6, 1);     // the mouth
  g.add(c); return c;
}

/** A heap of shells left by the ebb (`boulders_*`): clams and whelks lying down, brown and dark, small, a few in a pile
 *  with rounded pebbles (never white, never unit-sized: round 1's read as a cluster of Vael units; nothing grey-white or
 *  angular and upright: round 3's read like the salt's crystals). */
export function shellHeap(v) {
  const g = grp(); s = 101 + v * 17;
  const n = 4 + v;
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, d = k ? 4 + rnd() * 8 : 0, r = (k ? 3 + rnd() * 2.5 : 5.5 + rnd() * 1.5) * 0.62, dark = k % 2 === 1;
    if (k % 2) whelk(g, r * 0.8, Math.cos(a) * d, Math.sin(a) * d, rnd() * 6, dark ? M.shellDark : M.shell);
    else clam(g, r, Math.cos(a) * d, Math.sin(a) * d, rnd() * 6, dark ? M.shellDark : M.shell);
  }
  for (let k = 0; k < 4; k++) { const a = rnd() * Math.PI * 2, d = 6 + rnd() * 8; add(g, sph(1.3 + rnd() * 1.1, 10, 8), M.pebble, Math.cos(a) * d, 0.4, Math.sin(a) * d).scale.set(1, 0.45, 0.8); } // brown pebbles, rounded (no angular stones: those read as crystals)
  return g;
}

/** Pilings (`spire_*`): the posts of a jetty that is gone, leaning, a tar line and a barnacle crust where the tide
 *  stood, their tops split; a cross beam and a loose rope between two of them. */
export function pilings(v) {
  const g = grp(); s = 211 + v * 23;
  const n = 4 + v * 2, tops = [];
  for (let k = 0; k < n; k++) {
    const x = (k % 2 ? 4 : -4) + (k >> 1) * 7 - (n >> 2) * 7, z = (k % 2 ? -5 : 5) + (rnd() - 0.5) * 4, h = 20 + rnd() * 12, lean = (rnd() - 0.5) * 0.16, leanZ = (rnd() - 0.5) * 0.16;
    const p = grp(); p.position.set(x, 0, z); p.rotation.set(leanZ, 0, lean); g.add(p);
    add(p, cyl(2.1, 2.5, h, 10), M.drift, 0, h / 2, 0);
    add(p, cyl(2.2, 2.55, h * 0.3, 10), H.tar, 0, h * 0.15, 0);                                  // the tar line: the lower third, wet
    add(p, cyl(2.5, 2.4, 1.6, 10), M.barnacle, 0, h * 0.32, 0);                                  // the barnacle crust at the tide line
    add(p, cyl(0.9, 2.1, 2.4, 6), M.driftDark, 0, h + 1, 0);                                     // the split top
    tops.push([x + Math.sin(lean) * h, h, z - Math.sin(leanZ) * h]);
  }
  if (v) { const [a, b] = [tops[1], tops[2]]; limb(g, [a[0], a[1] - 4, a[2]], [b[0], b[1] - 2, b[2]], 1.1, M.drift); }   // a cross beam still lashed on
  limb(g, [tops[0][0], tops[0][1] - 2, tops[0][2]], [tops[n - 1][0], 4, tops[n - 1][2] + 3], 0.35, M.rope);            // a rope fallen from one to the foot of another
  for (let k = 0; k < 4; k++) { const a = rnd() * Math.PI * 2, d = 8 + rnd() * 8; add(g, stone(1.5 + rnd() * 1.5), G.slate, Math.cos(a) * d, 0.6, Math.sin(a) * d, rnd(), rnd(), 0).scale.y = 0.6; }
  return g;
}

/** A boat's ribs (`ruin_*`): a keel on the sand and the frames that stood on it, most of them broken short; v 1
 *  half buried, fewer ribs, the stem post standing. */
export function ribs(v) {
  const g = grp(); s = 307 + v * 29;
  const L = v ? 34 : 44, n = v ? 5 : 7;
  add(g, rbox(L, 2.4, 2.6, 0.5), H.tar, 0, 1.2, 0);                                              // the keel
  add(g, cyl(1.2, 1.6, v ? 16 : 10, 8), M.drift, L / 2 - 1, (v ? 8 : 5), 0, 0, 0, -0.35);         // the stem post
  for (let k = 0; k < n; k++) for (const side of [-1, 1]) {
    const x = -L / 2 + 5 + k * (L - 10) / (n - 1), full = 12 + rnd() * 4, h = rnd() < 0.45 ? full : 4 + rnd() * 6, broken = h < full - 1;
    const pts = [[x, 1.2, 0], [x, h * 0.45, side * (h * 0.45)], [x, h * 0.85, side * (h * 0.7)], [x, h, side * (h * 0.8)]];     // a frame: a curve rising and bowing out
    for (let i = 1; i < pts.length; i++) limb(g, pts[i - 1], pts[i], 1.0, broken && i === pts.length - 1 ? M.driftDark : M.drift);
  }
  for (let k = 0; k < 3; k++) add(g, rbox(6 + rnd() * 6, 0.8, 2.4, 0.2), M.drift, (rnd() - 0.5) * L, 0.4, (rnd() - 0.5) * 22, 0, rnd() * 3, 0); // planks fallen off
  for (let k = 0; k < 2; k++) clam(g, 2.5 + rnd(), (rnd() - 0.5) * L, (rnd() - 0.5) * 24, rnd() * 6);
  return g;
}

/** A hull on its side (`wreck_*`): a tarred boat rolled over and half buried, its keel to the sky, a broken mast across
 *  it with a scrap of canvas, slate and shells at its foot. v 1 lies the other way, deeper in the sand. */
export function hullWreck(v) {
  const g = grp(); s = 503 + v * 37;
  const boat = grp(); boat.rotation.set(v ? -1.15 : 1.05, v ? 2.6 : -0.45, 0); boat.position.y = v ? 1.5 : 3; g.add(boat);
  add(boat, hullGeo(9, 34), H.tar, 0, 0, 0);                                                     // the hull
  add(boat, rbox(36, 2.2, 2.2, 0.6), M.driftDark, 0, 9.4, 0);                                    // the keel
  for (const z of [-8.6, 8.6]) add(boat, rbox(34, 1.4, 1.4, 0.4), M.drift, 0, 0.2, z);            // the gunwales
  for (const x of [-10, 0, 10]) add(boat, rbox(1.2, 9.5, 18, 0.3), H.ironDark, x, 0.4, 0).scale.set(1, 1, 1.02); // iron straps over the planking
  add(boat, cone(8.6, 6, 20), H.tar, 19, 0, 0, 0, 0, -Math.PI / 2).scale.set(1, 1, 1);            // the stem
  if (!v) {
    add(g, cyl(1.1, 1.4, 30, 8), M.drift, -4, 6, 6, 0.25, 0, 1.15);                               // the mast, fallen across
    add(g, rbox(12, 0.4, 9, 0.2), M.sail, 4, 5.5, 8, 0.1, 0.5, -0.4);                           // a scrap of sail hanging from it
    add(g, rbox(12.2, 0.3, 0.8, 0.1), H.inkLine, 4, 4.6, 11.5, 0.1, 0.5, -0.4);
  } else add(g, torus(3, 0.9, Math.PI * 2, 16), M.rope, 14, 0.9, -10, Math.PI / 2);                 // a coil of its line
  for (let k = 0; k < 4; k++) { const a = rnd() * Math.PI * 2, d = 14 + rnd() * 8; add(g, stone(1.6 + rnd() * 1.8), k % 2 ? G.slate : G.slateWet, Math.cos(a) * d, 0.6, Math.sin(a) * d, rnd(), rnd(), 0).scale.y = 0.6; }
  for (let k = 0; k < 2; k++) clam(g, 2.5 + rnd() * 1.5, (rnd() - 0.5) * 36, 12 + rnd() * 6, rnd() * 6);
  return g;
}

/** An anchor in the sand (`crater_0`): an admiralty anchor lying flat, its chain trailing off; walked over. */
export function anchorProp(v) {
  const g = grp(); s = 401 + v * 31;
  const a = grp(); a.rotation.y = 0.5; g.add(a);
  add(a, rbox(26, 2, 2, 0.6), H.ironDark, 0, 1, 0);                                              // the shank
  add(a, torus(3, 0.7, Math.PI * 2, 18), H.ironDark, 15.5, 1, 0, Math.PI / 2);                     // the ring
  add(a, rbox(2.2, 2.2, 18, 0.5), M.drift, 10, 1.1, 0);                                          // the stock, timber
  for (const side of [-1, 1]) {                                                                  // the arms and their flukes
    limb(a, [-12, 1, 0], [-15, 1, side * 6], 1.1, H.ironDark); limb(a, [-15, 1, side * 6], [-11, 1, side * 11.5], 1.1, H.ironDark);
    add(a, rbox(5, 1, 3.6, 0.2), M.rust, -9.5, 1, side * 11.5, 0, side * 0.5, 0);
  }
  add(a, sph(1.8, 8, 6), H.ironDark, -13, 1, 0).scale.y = 0.6;                                     // the crown
  let x = 19, z = 0.8; for (let k = 0; k < 8; k++) { add(g, torus(1.5, 0.45, Math.PI * 2, 10), k % 2 ? H.ironDark : M.rust, x * Math.cos(0.5) - z * Math.sin(0.5), 0.6 + (k % 2) * 0.5, x * Math.sin(0.5) + z * Math.cos(0.5), k % 2 ? Math.PI / 2 : 0, k % 2 ? 0 : 0.5 + k * 0.08); x += 2.3; z += 1.1 + k * 0.2; } // the chain
  for (let k = 0; k < 2; k++) clam(g, 2 + rnd(), (rnd() - 0.5) * 30, (rnd() - 0.5) * 20, rnd() * 6);
  return g;
}

/** A tide pool (`crater_1`): a small film of dull grey-blue water left in a hollow of the slate, lobed and long, no rim
 *  and no rings, darker than the seep's brine so it is never taken for one (round 1's dark disc in a pale rim read as a brine seep; a wet slate shelf round it read as a rim too); stones
 *  half in it, kelp drying at one end; walked over. */
export function tidePool(v) {
  const g = grp(); s = 431 + v * 31;
  const lobes = [[0, 0, 11, 6.5], [9, 3, 7, 5], [-9, -2, 6.5, 4.5], [3, -4, 5, 3.5]].map(l => l.map(v => v * 0.62)); // small: a film
  // One outline for the water, so no seam between lobes draws an arc: the furthest
  // reach of the lobes along each ray from the centre.
  const outline = (grow) => { const sh = new THREE.Shape(); for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let best = 0; for (const [x, z, rx, rz] of lobes) for (let t = 0; t < 24; t += 0.25) if (((dx * t - x) / (rx + grow)) ** 2 + ((dz * t - z) / (rz + grow)) ** 2 <= 1) best = Math.max(best, t); k ? sh.lineTo(dx * best, -dz * best) : sh.moveTo(dx * best, -dz * best); } const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2); return geo; };
  add(g, outline(0), M.pool, 0, 0.4, 0);                                                         // the water, one level
  for (let k = 0; k < 5; k++) { const [x, z, rx, rz] = lobes[k % 4], a = rnd() * Math.PI * 2; add(g, stone(1.3 + rnd() * 1.4), k % 2 ? G.slate : G.slateWet, x + Math.cos(a) * rx * 0.95, 0.4, z + Math.sin(a) * rz * 0.95, rnd(), rnd(), 0).scale.y = 0.55; } // stones half in it
  for (let k = 0; k < 3; k++) add(g, rbox(6 + rnd() * 4, 0.35, 1.8 + rnd(), 0.2), M.kelp, -11 - rnd() * 3, 0.4, -2 + k * 2.2 + rnd(), 0, (rnd() - 0.5) * 0.8, 0); // kelp drying at its west end
  clam(g, 1.8, 9, -4, 1.1, M.shellDark);
  return g;
}

/** Flotsam (`debris_*`): planks and a broken oar, a cork float, a coil of rope, a scrap of net (v 1); walked over. */
export function flotsam(v) {
  const g = grp(); s = 601 + v * 41;
  for (let k = 0; k < 3 + v; k++) add(g, rbox(8 + rnd() * 7, 0.8, 2.2 + rnd(), 0.2), k % 2 ? M.drift : H.tar, (rnd() - 0.5) * 30, 0.5, (rnd() - 0.5) * 22, 0, rnd() * 3, (rnd() - 0.5) * 0.2);
  const oa = rnd() * 3, ox = (rnd() - 0.5) * 16, oz = (rnd() - 0.5) * 16;
  add(g, cyl(0.6, 0.6, 16, 8), M.drift, ox, 0.6, oz, 0, oa, Math.PI / 2);                        // the oar's loom
  add(g, rbox(7, 0.5, 3.2, 0.3), M.driftDark, ox + Math.cos(oa) * 10, 0.5, oz - Math.sin(oa) * 10, 0, oa, 0); // its blade
  add(g, cyl(1.6, 1.6, 2.4, 12), M.cork, (rnd() - 0.5) * 26, 1.2, (rnd() - 0.5) * 20, 0, 0, Math.PI / 2); // a cork float
  add(g, torus(2.6, 0.8, Math.PI * 2, 16), M.rope, (rnd() - 0.5) * 24, 0.8, (rnd() - 0.5) * 18, Math.PI / 2);   // a coil
  if (v) { const nx = (rnd() - 0.5) * 16, nz = (rnd() - 0.5) * 14, na = rnd() * 3; for (let i = -2; i <= 2; i++) { limb(g, [nx + Math.cos(na) * i * 2.4 - Math.sin(na) * 6, 0.4, nz + Math.sin(na) * i * 2.4 + Math.cos(na) * 6], [nx + Math.cos(na) * i * 2.4 + Math.sin(na) * 6, 0.4, nz + Math.sin(na) * i * 2.4 - Math.cos(na) * 6], 0.18, M.rope); limb(g, [nx - Math.cos(na) * 6 - Math.sin(na) * i * 2.4, 0.4, nz - Math.sin(na) * 6 + Math.cos(na) * i * 2.4], [nx + Math.cos(na) * 6 - Math.sin(na) * i * 2.4, 0.4, nz + Math.sin(na) * 6 + Math.cos(na) * i * 2.4], 0.18, M.rope); } } // a scrap of net
  for (let k = 0; k < 2; k++) clam(g, 1.8 + rnd(), (rnd() - 0.5) * 30, (rnd() - 0.5) * 22, rnd() * 6, k ? M.shell : M.shellDark);
  return g;
}

/** [name, model, radius (game units), height]: what the client may place, by where it may stand; the names and the
 *  counts are the old props', so the scatter (scenery.js) lands the same props on the same tiles. */
export const SCENERY = {
  rock: [['boulders_0', () => shellHeap(0), 22, 10], ['boulders_1', () => shellHeap(1), 24, 10], ['boulders_2', () => shellHeap(2), 26, 10],
    ['spire_0', () => pilings(0), 22, 36], ['spire_1', () => pilings(1), 26, 36], ['ruin_0', () => ribs(0), 28, 20], ['ruin_1', () => ribs(1), 26, 22],
    ['wreck_0', () => hullWreck(0), 30, 22], ['wreck_1', () => hullWreck(1), 30, 16]],
  ground: [['crater_0', () => anchorProp(0), 28, 4], ['crater_1', () => tidePool(1), 24, 4],
    ['debris_0', () => flotsam(0), 24, 4], ['debris_1', () => flotsam(1), 26, 4]],
};
