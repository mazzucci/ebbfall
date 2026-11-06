// The Harbour air (STYLE.md, "Harbour air"): triangles and sails, a dark hull or frame under pale canvas, every flyer's
// shadow offset on the ground as the Vael's Petrel casts its. Step 1's family: the Kite (raider), the Spyglass
// (observer) and the Windjammer (bastion). Same conventions as harbour.js: game units, units face +x, y up, +z south;
// the sun is from the north-west, so a thing flying at height y lands its shadow 0.4 y east and 0.3 y south of it.
// Each has one frame: a glider (look.js UNIT_FPS 0; the client's swell moves it).
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import * as THREE from 'three';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const scaled = (pts, kx, kz, dx = 0) => pts.map(([x, z]) => [x * kx + dx, z * kz]);
/** A gore of a sphere: the part between two meridians (`phi0`, `dphi`) and two parallels, off the crown and the foot. */
const gore = (r, phi0, dphi, t0 = 0.3, t1 = 2.55) => memo(`go${r},${phi0},${dphi},${t0},${t1}`, () => new THREE.SphereGeometry(r, 10, 12, phi0, dphi, t0, t1 - t0));

// ---- the family's own materials: lit canvas, the top of a sail where the sun hits it (a plain cream fill read flat) ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const lit = M.canvas.clone(); lit.color.set(0xf2ecdc);
  const A = { canvasLit: lit };
  FAM.set(M, A); return A;
}

/** A delta sail of pale canvas on a tarred frame: the apex `l` ahead of the yard (the local origin, at x 0), the yard
 *  `w` to either side; the frame on top of the cloth, where the camera sees it, all tarred dark: a spine from the apex
 *  to the yard (`spine`), the yard, a spar down each leading edge. `pitch` lifts the apex (the sail flies nose up).
 *  Two cuts: `hem` deep, a team canvas hem along the trailing edge behind an ink seam, a lit patch at the apex (`lit`);
 *  or `half`: the sail in two panels split by the keel, the starboard one team canvas, an ink seam along the keel,
 *  the panels folded up to the tips by `dihedral` so one takes the sun and the other its shade, canvas worn darker
 *  along the port panel's edges. Returns the group (its origin at the yard's middle). */
function sail(parent, M, l, w, { x = 0, y = 0, z = 0, pitch = 0, spine = true, hem = 0, lit = false, half = false, dihedral = 0 } = {}) {
  const s = grp(); s.position.set(x, y, z); s.rotation.z = pitch; parent.add(s);
  const at = (xx) => w * (l - xx) / l;                                                         // the half-span at x
  if (half) {
    for (const side of [-1, 1]) {
      const h = grp(); h.rotation.x = -side * dihedral; s.add(h);                             // each panel folded up towards its tip
      add(h, plate([[l, 0], [0, 0], [0, side * w]], 0.7, 0.22), side > 0 ? M.paintCanvas : M.canvasShade, 0, 0, 0); // (the pale panel a band below pale canvas: seat 6's white panel parts from it in grey)
      if (side < 0) {                                                                         // wear along the pale panel's edges: canvas in shade
        add(h, plate([[l - 1.2, 0], [0.4, side * (w - 1.5)], [0.4, side * w], [l, 0]], 0.3, 0.1), M.canvasDark, 0, 0.5, 0);
        add(h, plate([[0, side * w], [0, 0], [1.1, 0], [1.1, side * at(1.1)]], 0.3, 0.1), M.canvasDark, 0, 0.5, 0);
      }
    }
    add(s, rbox(l + 0.8, 0.4, 1.7, 0.1), M.inkLine, l / 2 - 0.2, 0.6, 0);                     // the ink seam along the keel, showing either side of the spine
  } else {
    add(s, plate([[l, 0], [0, -w], [0, w]], 0.7, 0.22), M.canvas, 0, 0, 0);                   // the cloth
    if (lit) add(s, plate([[l - 0.5, 0], [l * 0.42, -at(l * 0.42) * 0.86], [l * 0.42, at(l * 0.42) * 0.86]], 0.3, 0.1), fam(M).canvasLit, 0, 0.5, 0); // the sun on its top
    if (hem) {
      add(s, plate([[hem, -at(hem)], [0, -w], [0, w], [hem, at(hem)]], 0.5, 0.14), M.paintCanvas, 0, 0.5, 0); // the team hem along the trailing edge
      add(s, plate([[hem + 0.5, -at(hem + 0.5)], [hem, -at(hem)], [hem, at(hem)], [hem + 0.5, at(hem + 0.5)]], 0.5, 0.1), M.inkLine, 0, 0.55, 0); // its ink seam
    }
  }
  if (spine) add(s, rbox(l + 0.8, 0.9, 0.9, 0.3), M.oilskin, l / 2 - 0.2, 0.9, 0);           // the spine (tarred: timber read as brass beside gold paint)
  add(s, rbox(1, 1, 2 * w + 1, 0.35), M.tar, 0, 0.7, 0);                                      // the yard
  for (const side of [-1, 1]) limb(s, [l, 1, 0], [0.2, 1, side * w], 0.34, M.oilskin);         // the leading-edge spars
  return s;
}

/** Kite (line flyer, the raider): one triangle sail on a light frame, flying nose up at 17, its two panels folded up
 *  to the tips (one takes the sun, the other its shade), the starboard panel team canvas behind an ink seam along the
 *  keel (round 2: a hem alone scored low on team colour); a tarred pod slung well below it on a bridle with a lookout
 *  and a bolt-thrower at its bow, and a kite's tail: a line trailing aft and down with three team bows on it. From
 *  above a filled triangle, point first, half pale and half team, with a dotted tail: never the Petrel's gull (a body
 *  between two swept wings). Team: the starboard panel, the bows, the pod's flanks. */
export function kite(M) {
  const g = grp(), b = grp(); b.position.y = 17; g.add(b);
  sail(b, M, 18, 9.5, { x: -7, pitch: 0.14, half: true, dihedral: 0.22 });                   // the sail: apex at x 11, the yard at -7
  const PX = 5.5;                                                                              // the pod, a small tarred hull 7 under the sail, hung forward so its dark bow shows under the apex from the camera
  add(b, rbox(7.5, 2.8, 3.4, 1.1), M.tar, PX, -7, 0);
  add(b, rbox(2.6, 1.7, 2.4, 0.7), M.tar, PX + 4.3, -7.2, 0);                                  // its bow
  for (const side of [-1, 1]) {                                                                // team flanks between ink lines (team beyond the sail)
    add(b, rbox(5, 1.4, 0.5, 0.15), M.paintCanvas, PX, -6.9, side * 1.8);
    for (const y of [-6.05, -7.75]) add(b, rbox(5.2, 0.3, 0.6, 0.1), M.inkLine, PX, y, side * 1.8);
  }
  add(b, sph(1.3, 12, 10), M.oilskin, PX - 2, -5.3, 0);                                        // the lookout, hood up
  add(b, rbox(5.6, 0.9, 0.9, 0.3), M.timberPale, PX + 4.6, -5.9, 0);                           // the bolt-thrower's stock, forward over the bow
  add(b, rbox(0.5, 0.5, 5.6, 0.2), M.ironDark, PX + 6.6, -5.9, 0);                             // its bow
  add(b, sph(0.5, 8, 6), M.brass, PX + 7.7, -5.9, 0);                                          // a brass bead at the tip
  for (const side of [-1, 1]) limb(b, [-7, 0.6, side * 9.4], [PX - 2.4, -5.7, side * 1.6], 0.22, M.oilskin); // the bridle: from the yard's ends
  limb(b, [10.6, 2.5, 0], [PX + 2.5, -5.6, 0], 0.22, M.oilskin);                               // and from the apex
  const T0 = [-7.6, -0.2, 0], T1 = [-17.5, -4.6, 0];                                          // the tail: a line aft and down
  limb(b, T0, T1, 0.28, M.rope);
  for (const t of [0.3, 0.6, 0.9]) {                                                           // three team bows on it, each over an ink tie
    const x = T0[0] + (T1[0] - T0[0]) * t, y = T0[1] + (T1[1] - T0[1]) * t;
    add(b, rbox(1.1, 0.5, 3, 0.15), M.paintCanvas, x, y + 0.1, 0);
    add(b, rbox(1.4, 0.3, 3.3, 0.1), M.inkLine, x, y - 0.25, 0);
  }
  return g;
}

/** Spyglass (the flying scout, the observer): a small airship. A cigar-shaped canvas envelope (13 long, 6.6 across,
 *  nose at +x) with three team stripes along its length (top and both flanks) between ink seams and a rope girdle;
 *  dark fins at the stern; a tarred gondola slung under it along its length on struts, a lookout in it and a short
 *  thick dark telescope out of its bow, angled down and to starboard so it breaks the silhouette in every facing, a
 *  brass bead at its tip only. Flies at 26, the highest Harbour thing, its shadow a cigar far from it. Smaller than
 *  the Kite, no sails and no hull on top: not the Windjammer. (Rounds 1-2: a pale ball read as a figure's head.) */
export function spyglass(M) {
  const g = grp(), b = grp(); b.position.y = 26; g.add(b);
  const R = 3.3, K = 2, along = (m) => { m.scale.set(1, K, 1); m.rotation.z = -Math.PI / 2; return m; }; // a sphere's pole axis laid along +x, stretched to a cigar
  along(add(b, sph(R, 20, 24), M.canvas, 0, 0, 0));                                             // the envelope
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) {                                            // team stripes along its length: the top and both upper flanks (phi 0 is the top once laid along), between ink seams
    const d = 0.45;
    along(add(b, gore(R + 0.06, a - d / 2, d, 0.35, 2.75), M.paintCanvas, 0, 0, 0));
    for (const e of [a - d / 2 - 0.08, a + d / 2]) along(add(b, gore(R + 0.08, e, 0.08, 0.35, 2.75), M.inkLine, 0, 0, 0));
  }
  add(b, new THREE.TorusGeometry(R + 0.1, 0.2, 6, 28), M.rope, -1, 0, 0, 0, Math.PI / 2, 0);   // a rope girdle round the waist
  add(b, sph(0.5, 8, 6), M.ironDark, R * K + 0.1, 0, 0);                                        // the nose cap
  for (const side of [-1, 1]) add(b, rbox(2.8, 0.4, 2.6, 0.12), M.canvasDark, -5.2, 0, side * 3.1); // the stern fins: two out to the sides, canvas in shade (mid value, so they show on the dark ground)
  add(b, rbox(2.8, 2.4, 0.4, 0.12), M.oilskin, -5.2, 2.8, 0);                                   // and one up
  const GT = -5.6;                                                                             // the gondola's top: a gap of 2.3 under the belly, struts across it
  for (const [x, sz] of [[2.2, 1], [2.2, -1], [-2.2, 1], [-2.2, -1]]) limb(b, [x, -R + 0.2, sz * 0.6], [x, GT, sz * 1.1], 0.2, M.oilskin);
  add(b, rbox(7.2, 2.3, 2.8, 0.5), M.tar, 0.4, GT - 1.15, 0);                                  // the gondola, a tarred block along the length
  add(b, rbox(7.4, 0.35, 3, 0.1), M.ironDark, 0.4, GT - 0.05, 0);                              // its iron rim
  add(b, rbox(4, 1, 0.45, 0.12), M.paintCanvas, -0.2, GT - 1.2, 1.5);                          // a team panel on its south flank, between ink lines
  for (const y of [GT - 0.55, GT - 1.85]) add(b, rbox(4.2, 0.25, 0.5, 0.08), M.inkLine, -0.2, y, 1.5);
  add(b, sph(1.05, 12, 10), M.oilskin, -1.2, GT + 0.5, 0);                                      // the lookout, hood up
  const A = [3.4, GT - 0.4, 0.4], B = [8.2, GT - 2.2, 3.2], at = (t) => A.map((v, i) => v + (B[i] - v) * t); // the telescope: out of the bow, down and to starboard
  limb(b, at(0), at(0.86), 0.7, M.oilskin);                                                    // the leather tube
  limb(b, at(0.86), at(1), 0.85, M.brass);                                                     // the brass bead at its end, the only brass
  return g;
}

/** Windjammer (the capital, the bastion): three delta sails over a flying hull, the biggest Harbour shape: a tarred
 *  hull 44 long, bow at +x, an iron bilge beneath, iron gunwales; three masts, each with a sail pitched nose up from
 *  its yard, lit at its top, its team hem aft; a team awning over the quarterdeck and a team-topped forecastle block
 *  at the bow with the cannon on it; rigging from the mastheads to the bow and the stern, a team pennant on the main
 *  mast; a small stern lantern. Flies at 24. From above a long dark boat under three pale triangles in a row, its
 *  shadow a ship on the ground. */
export function windjammer(M) {
  const g = grp(), b = grp(); b.position.y = 24; g.add(b);
  const hull = [[22, 0], [19.5, -3.8], [12, -6.6], [-4, -7.8], [-17, -7.2], [-21, -4.6], [-21, 4.6], [-17, 7.2], [-4, 7.8], [12, 6.6], [19.5, 3.8]];
  add(b, plate(hull, 5, 1.1), M.tar, 0, 0, 0);                                                 // the hull, tar
  add(b, plate(scaled(hull, 0.9, 0.84, -0.4), 3, 0.7), M.ironDark, 0, -2.6, 0);               // the iron bilge beneath
  add(b, plate(scaled(hull, 1.02, 1.06), 0.9, 0.2), M.ironDark, 0, 2, 0);                     // the wale, an iron band round the hull's side
  add(b, plate(scaled(hull, 0.9, 0.78, -0.4), 0.6, 0.15), M.oilskin, 0, 4.6, 0);              // the deck well, in shade
  const rail = (pts, h, d, mat, y) => {                                                        // boxes laid along a polyline
    for (let i = 1; i < pts.length; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], l = Math.hypot(x1 - x0, z1 - z0); add(b, rbox(l + 0.4, h, d, 0.12), mat, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, -Math.atan2(z1 - z0, x1 - x0), 0); }
  };
  for (const side of [-1, 1]) rail([[-20, side * 4.6], [-17, side * 7.2], [-4, side * 7.8], [12, side * 6.6], [19.5, side * 3.8]], 0.8, 1.2, M.ironDark, 5.3); // iron gunwales (round 2: team rails outlined the whole hull pale in seat 6)
  for (const xm of [11, -1, -13]) {                                                            // three masts, each its sail
    add(b, cyl(0.5, 0.75, 16, 10), M.tar, xm, 12.5, 0);                                         // (tarred, not timber: pale timber read as brass beside gold paint)
    add(b, cyl(0.7, 0.7, 0.6, 8), M.ironDark, xm, 20.6, 0);                                     // the truck
    sail(b, M, 9.5, 10, { x: xm - 3, y: 6.4, pitch: 0.5, spine: false, hem: 2.6, lit: true });  // the yard 3 aft of the mast; no spine: a clean pale triangle, the sun on its top
  }
  for (const [p, q] of [[[11, 20.6, 0], [23.5, 5.6, 0]], [[11, 20.6, 0], [-1, 20.6, 0]], [[-1, 20.6, 0], [-13, 20.6, 0]], [[-13, 20.6, 0], [-21.5, 7, 0]]]) limb(b, p, q, 0.2, M.rope); // stays
  add(b, rbox(4.4, 1.6, 0.3, 0.1), M.paintCanvas, -3.3, 20.9, 0); add(b, rbox(4.6, 0.25, 0.35, 0.1), M.inkLine, -3.3, 20, 0); // the pennant on the main mast, an ink hem
  add(b, rbox(6.5, 2.2, 11.5, 0.6), M.tar, -17.3, 6.1, 0);                                     // the quarterdeck
  for (const [x, z] of [[-14.4, -5], [-14.4, 5], [-20.2, -4], [-20.2, 4]]) add(b, cyl(0.35, 0.35, 3.2, 6), M.oilskin, x, 8.8, z); // its awning's posts
  add(b, rbox(7.8, 0.6, 12.8, 0.2), M.paintCanvas, -17.3, 10.6, 0);                            // the team awning over it
  add(b, rbox(8.6, 0.3, 13.6, 0.1), M.inkLine, -17.3, 10.25, 0);                               // the ink seam round it, 0.4 proud all round (1 px at 2x)
  add(b, rbox(6, 2.4, 8.6, 0.5), M.tar, 16.6, 6.2, 0);                                         // the forecastle, a block at the bow
  add(b, rbox(6.3, 0.6, 8.9, 0.2), M.paintCanvas, 16.6, 7.7, 0);                               // its team canvas top
  add(b, rbox(6.5, 0.25, 9.1, 0.1), M.inkLine, 16.6, 7.3, 0);                                  // its ink hem
  add(b, rbox(3.6, 0.8, 0.8, 0.3), M.tar, 23.6, 5.2, 0);                                       // the bowsprit
  add(b, rbox(2.6, 1.4, 3.2, 0.4), M.timber, 17.5, 8.6, 0);                                    // the bow cannon's carriage, on the forecastle
  add(b, cyl(0.8, 0.95, 7, 10), M.ironDark, 19.5, 9.5, 0, 0, 0, Math.PI / 2);                  // the cannon
  add(b, sph(0.55, 8, 6), M.brass, 23.1, 9.5, 0);                                              // its muzzle bead
  add(b, cyl(0.3, 0.3, 3.4, 6), M.oilskin, -21.6, 7.4, 0);                                     // the stern lantern's post
  add(b, sph(0.8, 10, 8), M.white, -21.6, 9.4, 0);                                             // the one small light
  return g;
}
