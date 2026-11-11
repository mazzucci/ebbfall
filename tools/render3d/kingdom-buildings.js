// The kingdom's buildings after the Castle (the re-theme's buildings family, 2026-11-10; not in the atlas: retheme.js
// renders them by filter). Palette B (kingdom.js): slate-grey ashlar, slate roofs, dark oak, blackened iron, thatch on
// the Cottage only; team on cloth, flags and banners between ink hems, never on stone, slate or ground. Each building
// sits on its own patch of trodden earth, no two the same shape, no pale deck or plinth. Same conventions as models.js:
// game units (a tile is 32), y up, +z south (to the camera). Footprints: 2x2 is 64 across, 3x3 is 96.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { torus } from './harbour.js';
import { cone } from './vael.js';
import { gable, oct, tex, thatchTex, crenels, roundCrenels, hanging, pennant, banner, figure, quoins } from './kingdom.js';
import { polishTextures } from './polish.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
/** The polish's thatch, drawn for 1x as polish.js's `hiShingle` is: courses of staggered straw bundles, each its own
 *  tone, a dark wide lap band and a lit edge on each course, the straw combed along the slope. The Cottage's gable
 *  takes boxUV's (x, z) on its slopes, so the texture's x runs up the slope and its y along the ridge: the courses are
 *  drawn as columns (constant x) so they run along the ridge, and the bundles stagger along it. (The judge on the
 *  first pass: bands drawn as rows ran up the slope as vertical stripes, corrugated board. The one roof without a
 *  course texture in polish.js; made here, in the family's file.) */
let hiThatch = null;
const hiThatchTex = () => hiThatch ??= tex(128, (g, n) => {
  let seed = 43; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#c4c0ac'; g.fillRect(0, 0, n, n);                                                                                   // (a cool base: under the polish's stronger key and south-west fill a warm base went orange at 1x, rounds 1 and 2)
  const C = 32, B = 24;                                                                                                                // a course 32 wide (up the slope), its bundles 24 long along the ridge, staggered half a bundle every course
  for (let x = 0; x < n; x += C) { const o = (x / C) % 2 ? B / 2 : 0; for (let y = -B; y < n + B; y += B) { const v = 140 + rnd() * 90; g.fillStyle = `rgb(${v + 4},${v},${v - 24})`; g.fillRect(x, y + o, C, B); g.fillStyle = 'rgba(60,50,30,0.45)'; g.fillRect(x, y + o + B - 1.5, C, 1.5); } }   // the bundles, a faint seam between them
  for (let i = 0; i < 700; i++) { const v = 120 + rnd() * 120, x = rnd() * n, y = rnd() * n; g.strokeStyle = `rgba(${v},${v - 10},${v - 36},0.5)`; g.lineWidth = 0.8 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + rnd() * 12, y + (rnd() - 0.5) * 2); g.stroke(); }                                  // the straw, combed along the slope
  for (let x = 0; x < n; x += C) { g.fillStyle = 'rgba(36,30,18,0.78)'; g.fillRect(x + C - 6, 0, 6, n); g.fillStyle = 'rgba(236,232,220,0.3)'; g.fillRect(x, 0, 2.5, n); }                           // each course's dark lap and lit edge
}, { repeat: 3 });
/** The family's few extra materials, added to a kingdom set once; with `M.polish` (polish.js `polishMats` marks the
 *  set) they take the recipe too: the thatch's courses redrawn for 1x, the horses' hide, glints on the anvil and the
 *  trough's water. */
export function kbMats(M) {
  if (M.thatch) return M;
  M.tan = std({ color: 0x9a7650, map: M.canvas.map, roughness: 0.92 });                        // the Market awnings' tan stripes: a warm brown (hue 30, dull), apart from seat 7's red-orange and seat 1's red
  M.thatch = std({ color: 0x6e6448, map: thatchTex, roughness: 0.95 });                       // thatch, a dull grey-brown straw (the Cottage's roof only; never orange beside the coins' gold)
  M.straw = std({ color: 0x9c8658, roughness: 0.95 });                                       // hay and straw: tan, never the coins' yellow
  M.hearth = std({ color: 0x2a0804, emissive: 0xe8300c, emissiveIntensity: 1.3 });           // the Blacksmith's ember: red-orange, small (round 3: a yellow glow read as the Market's gold)
  M.coals = std({ color: 0x1c1816, roughness: 1 });                                            // dark coals round it
  M.water = std({ color: 0x1a2228, metalness: 0.6, roughness: 0.15 });                       // a trough's water
  M.iron = M.ironDark;
  M.anvil = std({ color: 0xb4b8bc, metalness: 0.35, roughness: 0.5 });                       // the Blacksmith's anvil: pale, not mirror steel (round 2: it did not read)
  M.horsePale = std({ color: 0x66503a, roughness: 0.75 });                                   // the stable's horses, a lighter bay so their heads read out of the dark stalls
  if (M.polish) {
    const X = polishTextures();
    M.thatch.map = hiThatchTex(); M.thatch.color.setHex(0x5e5a48); M.thatch.needsUpdate = true;   // the courses drawn for 1x; the colour a step cooler than the plain 0x6e6448 (the judge: 0x665e48 was the one warm hue on the kingdom base), a dull grey straw under the polish's key, never orange beside the coins' gold
    M.straw.bumpMap = X.fold; M.straw.bumpScale = 0.5; M.straw.needsUpdate = true;
    M.horsePale.map = X.hide; M.horsePale.needsUpdate = true;
    M.anvil.roughness = 0.3; M.anvil.envMapIntensity = 2.0; M.anvil.bumpMap = X.scuff; M.anvil.bumpScale = 0.3; M.anvil.needsUpdate = true; // one glint on the anvil's face under the key
    M.water.envMapIntensity = 2.5; M.water.needsUpdate = true;                                                                           // the trough's water as the slice's glass
  }
  return M;
}
/** A knee brace from a post to the plate over it: the timber-frame read at 2x (the slice's hall took the same). */
export function brace(g, M, x, y, z, dx, dy, r = 0.6) { limb(g, [x + dx, y, z], [x, y + dy, z], r, M.oak); }
/** A steel finial on a ridge's end: a glint under the key, as on the slice's hall. */
export const finial = (g, M, x, y, z) => add(g, sph(0.9, 8, 6), M.steel, x, y, z);

/** A building's patch of trodden earth: `pts` the outline, scaled by `k` round its centre and nudged south (the first
 *  pass had every building on a brown plate the size of its footprint: identical plinths). Marked `ground` for the
 *  polish (polish.js): the contact shadow treats it as the ground itself, so nothing rings it. */
export function earth(g, M, pts, k = 0.7, dz = 4) {
  const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cz = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  add(g, plate(pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k + dz]), 1.6, 0.8), M.earth, 0, 0, 0).userData.ground = true;
}
/** Smoke out of a stack: puffs rising and swelling, drifting north-east (away from the camera, so nothing is hidden). */
/** An oak door with two iron bands, on a face at (x, y, z) looking +z (`ry` turns it). */
function door(g, M, x, y, z, w = 6, h = 9, ry = 0) {
  const d = grp(); d.position.set(x, y, z); d.rotation.y = ry; g.add(d);
  add(d, rbox(w + 1.2, h + 1, 0.5, 0.1), M.inkLine, 0, h / 2, 0); add(d, rbox(w, h, 1.0, 0.3), M.oak, 0, h / 2, 0.3);
  for (const yy of [h * 0.3, h * 0.72]) add(d, rbox(w + 0.4, 0.5, 0.4, 0.1), M.ironDark, 0, yy, 0.9);
}
/** A shuttered window: a dark pane in an oak frame. */
function window_(g, M, x, y, z, w = 3, h = 4, ry = 0) {
  const d = grp(); d.position.set(x, y, z); d.rotation.y = ry; g.add(d);
  add(d, rbox(w + 1, h + 1, 0.5, 0.1), M.oak, 0, 0, 0); add(d, rbox(w, h, 0.6, 0.1), M.inkLine, 0, 0, 0.2);
}
/** A horse's head and neck over a stall's half-door, looking +z. */
function horseHead(g, M, x, y, z, ry = 0) {
  const h = grp(); h.position.set(x, y, z); h.rotation.y = ry; g.add(h);
  limb(h, [0, 0, -4], [0, 7, 1], 2.4, M.horsePale);                                          // the neck, rising forward
  add(h, rbox(3.2, 3.6, 6.0, 1.0), M.horsePale, 0, 7.2, 4.0, 0.35, 0, 0);                      // the head, down a little
  add(h, rbox(2.6, 1.6, 1.8, 0.5), M.horseDark, 0, 6.0, 6.6);                                 // the muzzle
  for (const sx of [-1.2, 1.2]) add(h, cone(0.7, 2.0, 6), M.horseDark, sx, 9.6, 2.6);         // ears
  for (let k = 0; k < 4; k++) add(h, rbox(2.0, 1.4, 1.6, 0.6), M.horseDark, 0, 3.2 + k * 1.3, -2.6 + k * 1.1); // the mane
}
/** A horse standing (the knight's, without rider or caparison, in the lighter bay), facing +x. */
function horse(g, M, x, z, ry = 0) {
  const h = grp(); h.position.set(x, 0, z); h.rotation.y = ry; g.add(h);
  add(h, rbox(16, 7.5, 6.2, 2.6), M.horsePale, -1, 10.5, 0); add(h, sph(3.4, 12, 10), M.horsePale, -8.6, 10.6, 0).scale.set(0.9, 1, 1);
  limb(h, [5.5, 11.5, 0], [10.5, 17.5, 0], 2.2, M.horsePale); add(h, rbox(5.4, 3.2, 2.8, 1.0), M.horsePale, 13.0, 17.4, 0, 0, 0, -0.35);
  add(h, rbox(1.6, 1.4, 2.4, 0.5), M.horseDark, 15.2, 16.4, 0); for (const sz of [-1.1, 1.1]) add(h, cone(0.6, 1.8, 6), M.horseDark, 11.4, 19.8, sz);
  for (let k = 0; k < 5; k++) add(h, rbox(1.6, 1.4, 2.0, 0.6), M.horseDark, 6.2 + k * 1.1, 14.6 + k * 1.1, 0);
  limb(h, [-10.5, 11.5, 0], [-13.5, 4.5, 0.6], 0.9, M.horseDark);
  for (const [lx, side] of [[5, -1], [5, 1], [-7, -1], [-7, 1]]) { const lz = side * 2.4; limb(h, [lx, 8.5, lz], [lx, 4.4, lz], 1.3, M.horsePale); limb(h, [lx, 4.4, lz], [lx, 0.9, lz], 1.0, M.horsePale); add(h, rbox(1.8, 1.2, 1.9, 0.4), M.horseDark, lx, 0.6, lz); }
}
/** A hay bale. */
const bale = (g, M, x, y, z, ry = 0) => { add(g, rbox(6, 4, 4.4, 0.8), M.straw, x, y + 2, z, 0, ry, 0); for (const d of [-1.6, 1.6]) add(g, rbox(6.2, 0.4, 0.5, 0.1), M.rope, x, y + 2, z + d, 0, ry, 0); };
/** A rack of spears leaning in a timber frame. */
function spearRack(g, M, x, z, n = 6, ry = 0) {
  const r = grp(); r.position.set(x, 0, z); r.rotation.y = ry; g.add(r);
  for (const dx of [-n * 1.05, n * 1.05]) add(r, cyl(0.7, 0.7, 12, 6), M.oak, dx, 8, 0);
  add(r, rbox(n * 2.1 + 2, 0.9, 1.0, 0.2), M.oak, 0, 13, 0);
  for (let k = 0; k < n; k++) { const dx = (k - (n - 1) / 2) * 2.1; add(r, cyl(0.55, 0.55, 18, 6), M.oak, dx, 11, 0.6 + (k % 2) * 0.6, 0.08, 0, (k % 2 ? 1 : -1) * 0.06); add(r, cone(0.9, 2.8, 6), M.steel, dx, 21, 0.6 + (k % 2) * 0.6); }
}
/** A round team shield hung on a face looking +z. */
function shield(g, M, x, y, z, r = 3.0, ry = 0) {
  const s = grp(); s.position.set(x, y, z); s.rotation.y = ry; g.add(s);
  add(s, cyl(r + 0.3, r + 0.3, 0.6, 18), M.oak, 0, 0, 0, Math.PI / 2, 0, 0); add(s, cyl(r, r, 0.5, 18), M.cloth, 0, 0, 0.3, Math.PI / 2, 0, 0);
  add(s, torus(r, 0.35, 18), M.inkLine, 0, 0, 0.5); add(s, sph(0.7, 8, 6), M.steel, 0, 0, 0.7);
}
/** A stone chimney stack with a cap (no baked smoke since 2026-11-11: the client puffs from the cap while the building
 *  works, look.js BLDG_LOOK `smoke`; its points are measured on the cap's top, y0 + h + 1.5). */
function chimney(g, M, x, y0, z, h, w = 4.6) {
  add(g, rbox(w, h, w, 0.3), M.wallDark, x, y0 + h / 2, z); add(g, rbox(w + 1.2, 1.2, w + 1.2, 0.2), M.plinth, x, y0 + h + 0.4, z);
  add(g, rbox(w - 1.4, 0.8, w - 1.4, 0.1), M.inkLine, x, y0 + h + 1.1, z);
}

/** Cottage (population, 2x2): a low wide house (Stelian, the final round: today's read too narrow and boxy): slate-grey
 *  ashlar walls 44 long and 24 deep, only 11 tall, its long side to the camera, under a big steep thatched roof 20
 *  high that dominates (the kingdom's one thatch: this is where people live), a stone chimney at the east gable, an
 *  oak door and two shuttered windows on the south face; at -20 the south wall, the east gable wall and the roof all
 *  show. Team: the flag at the ridge's west end and a thin strip along the south eave. From the camera: a big brown
 *  roof over a low grey wall, a chimney at one end, a flag. */
export function cottage(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-34, -22], [26, -31], [35, 2], [28, 30], [-26, 29], [-35, 6]]);
  const X = -2, Z = -2, W = 44, D = 24, H = 11, G = 20;
  add(g, rbox(W + 2.4, 2.6, D + 2.4, 0.4), M.plinth, X, 1.8, Z);
  add(g, rbox(W, H, D, 0.5), M.wall, X, H / 2 + 2, Z);
  for (const x of [-14, 0, 14]) add(g, rbox(1.2, H + 0.2, 1.0, 0.2), M.oak, X + x, H / 2 + 2, Z + D / 2 + 0.3);    // oak posts in the south face
  add(g, rbox(W + 0.6, 1.3, 1.0, 0.2), M.oak, X, H + 1.6, Z + D / 2 + 0.3);                                       // the wall plate
  add(g, gable(D + 8, G, W + 6), M.thatch, X, H + 2, Z, 0, Math.PI / 2, 0);                                        // the thatch: big, steep, overhanging
  add(g, cyl(2.0, 2.0, W + 6.4, 10), M.thatch, X, H + 2 + G, Z, 0, 0, Math.PI / 2);                                // the rounded ridge
  add(g, rbox(W + 6.6, 0.6, D + 8.4, 0.1), M.inkLine, X, H + 1.9, Z);                                               // the dark eave line
  chimney(g, M, X + W / 2 - 4, 2, Z - 3, H + G + 4, 5.0);
  door(g, M, X - 7, 2.2, Z + D / 2 + 0.6, 5.5, 8.5);
  window_(g, M, X + 7, 7.5, Z + D / 2 + 0.6); window_(g, M, X + 18, 7.5, Z + D / 2 + 0.6, 2.8, 3.4);
  banner(g, M, X - W / 2 - 1, H + 2 + G + 2, Z, 12, 14, 10);                                                       // the team flag at the ridge's west end
  add(g, rbox(W + 6.6, 1.4, 0.5, 0.1), M.cloth, X, H + 0.9, Z + D / 2 + 4.4); for (const y of [H + 1.7, H + 0.1]) add(g, rbox(W + 7, 0.4, 0.6, 0.05), M.inkLine, X, y, Z + D / 2 + 4.4); // a thin team strip along the south eave
  if (M.polish) { // secondary detail (the recipe's): quoins up the four corners, a stone lintel over the door and sills under the windows, a string course round the stack
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) quoins(g, M, X + sx * W / 2, Z + sz * D / 2, 3, H + 1.2, 2.8, 2.4, 1.4);
    add(g, rbox(7.6, 1.2, 1.4, 0.2), M.plinth, X - 7, 11.4, Z + D / 2 + 0.7);
    add(g, rbox(4.2, 0.7, 1.2, 0.1), M.plinth, X + 7, 5.1, Z + D / 2 + 0.8); add(g, rbox(4.0, 0.7, 1.2, 0.1), M.plinth, X + 18, 5.4, Z + D / 2 + 0.8);
    add(g, rbox(6.0, 1.0, 6.0, 0.2), M.plinth, X + W / 2 - 4, H + G + 1, Z - 3);
  }
  return g;
}

/** Barracks (Guard, Archer; 3x3): soldiers come out of here. A long timber-framed hall on a stone footing along x
 *  under a slate roof, its south side open as a loggia on oak posts where the weapon racks stand (spears, team shields
 *  hung on the back wall, a bow rack); in front the drill yard, a square of packed earth in a timber kerb with three
 *  straw dummies on posts and a pell; the tall flagstaff with a team banner at the yard's corner; two narrow team
 *  banners on the hall's gable. From the camera: a grey slate roof over a row of posts, a spiky rack, team discs,
 *  a flag over a square of bare earth. */
export function barracks(M) {
  kbMats(M); const g = grp();
  earth(g, M, oct(48, 0.3).map(([x, z]) => [x * 1.0, z * 0.92 + 2]), 0.75, 2);
  const X = -2, Z = -18, W = 62, D = 26, H = 14;
  add(g, rbox(W + 3, 2.6, D + 3, 0.4), M.plinth, X, 1.8, Z);
  add(g, rbox(W, H, D - 8, 0.5), M.wall, X, H / 2 + 2, Z - 4);                                                   // the hall's closed back
  for (let k = 0; k <= 6; k++) add(g, rbox(1.8, H + 1, 1.8, 0.3), M.oak, X - W / 2 + 1.5 + k * (W - 3) / 6, H / 2 + 2.5, Z + D / 2 - 1); // the loggia's posts
  add(g, rbox(W + 1, 1.6, 1.8, 0.3), M.oak, X, H + 2.6, Z + D / 2 - 1);
  for (const x of [-20, 0, 20]) add(g, rbox(1.4, H, 1.4, 0.2), M.oak, X + x, H / 2 + 2, Z - 4 + (D - 8) / 2 + 0.4);  // frame lines on the back wall's face
  add(g, gable(D + 6, 11, W + 5), M.roof, X, H + 3, Z, 0, Math.PI / 2, 0);
  add(g, rbox(W + 5.4, 1.6, 1.6, 0.4), M.oak, X, H + 14.2, Z);                                                   // the ridge beam
  add(g, rbox(W + 5.4, 0.6, D + 6.4, 0.1), M.inkLine, X, H + 2.9, Z);                                             // the eave line
  chimney(g, M, X - W / 2 + 6, 2, Z - 6, H + 16, 4.2);
  add(g, rbox(W + 1, 1.6, 0.5, 0.1), M.cloth, X, H + 1.2, Z + D / 2 + 1.4); for (const y of [H + 2.2, H + 0.2]) add(g, rbox(W + 1.4, 0.4, 0.6, 0.05), M.inkLine, X, y, Z + D / 2 + 1.4); // a thin team valance along the eave between ink lines (the pass: no hung banners, shields or spear racks)
  door(g, M, X + 2, 2.2, Z - 4 + (D - 8) / 2 + 0.6, 6, 9);
  // the drill yard south: packed earth in a timber kerb, three straw dummies and a pell
  const YX = 2, YZ = 22, YW = 54, YD = 28;
  add(g, plate([[YX - YW / 2, YZ - YD / 2], [YX + YW / 2, YZ - YD / 2], [YX + YW / 2, YZ + YD / 2], [YX - YW / 2, YZ + YD / 2]], 1.2, 0.3), M.path, 0, 1.6, 0).userData.ground = true; // (`ground`: the polish's contact shadow must not ring the yard)
  for (const [a, b] of [[[YX - YW / 2, YZ - YD / 2], [YX + YW / 2, YZ - YD / 2]], [[YX - YW / 2, YZ + YD / 2], [YX + YW / 2, YZ + YD / 2]], [[YX - YW / 2, YZ - YD / 2], [YX - YW / 2, YZ + YD / 2]], [[YX + YW / 2, YZ - YD / 2], [YX + YW / 2, YZ + YD / 2]]]) limb(g, [a[0], 3.0, a[1]], [b[0], 3.0, b[1]], 0.9, M.oak);
  banner(g, M, YX + YW / 2 - 2, 2.4, YZ - YD / 2 + 2, 42, 20, 14);                                                 // the flagstaff at the yard's corner (the pass: no dummies, pell or crates: the yard is bare)
  if (M.polish) { // secondary detail: knee braces from the loggia's posts to the plate (the timber-frame read), steel finials on the ridge, an iron band on the pell, a string course on the stack
    for (let k = 0; k <= 6; k++) { const px = X - W / 2 + 1.5 + k * (W - 3) / 6; if (k > 0) brace(g, M, px, H - 1.6, Z + D / 2 - 1, -5, 3.6); if (k < 6) brace(g, M, px, H - 1.6, Z + D / 2 - 1, 5, 3.6); }
    for (const sx of [-1, 1]) finial(g, M, X + sx * ((W + 5.4) / 2 + 0.3), H + 14.6, Z);
    add(g, rbox(5.2, 1.0, 5.2, 0.2), M.plinth, X - W / 2 + 6, H + 10, Z - 6);
  }
  return g;
}

/** Blacksmith (upgrades, 2x2): a stone smithy open to the south on oak posts, its slate lean-to roof sloping down to the
 *  back, a square stone stack at its west end; under the roof the forge, a hearth of dark stone glowing
 *  orange-red (the kingdom's one warm light, small) under a hood, the anvil on an oak block in front, a quench trough
 *  of dark water, hammers and tongs on the post, horseshoes on the wall; a team cloth hung on the stack and a team
 *  banner on the gable. From the camera: a grey roof, a dark open front with a small orange glow and a pale anvil. */
export function blacksmith(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-31, -26], [28, -30], [32, 12], [20, 30], [-18, 31], [-32, 8]]);
  const X = -2, Z = -6, W = 34, D = 24, H = 13;
  add(g, rbox(W + 2.6, 2.6, D + 2.6, 0.4), M.plinth, X, 1.8, Z);
  add(g, rbox(W, H, 1.6, 0.4), M.wall, X, H / 2 + 2, Z - D / 2 + 0.8);                                            // the back wall
  for (const sx of [-1, 1]) add(g, rbox(1.6, H, D * 0.55, 0.4), M.wall, X + sx * (W / 2 - 0.8), H / 2 + 2, Z - D * 0.22); // side walls, half-way to the front
  for (const x of [-W / 2 + 1, -W / 6, W / 6, W / 2 - 1]) add(g, rbox(1.8, H + 5, 1.8, 0.3), M.oak, X + x, H / 2 + 4.5, Z + D / 2 - 1); // front posts, taller than the back wall
  add(g, rbox(W + 1, 1.6, 1.8, 0.3), M.oak, X, H + 6.6, Z + D / 2 - 1);
  // the roof: one slate slope, high at the front over the posts, down to the back wall; an ink eave line
  { const r = add(g, rbox(W + 6, 1.2, D + 7, 0.2), M.roof, X, H + 4.9, Z - 0.5); r.rotation.x = -0.2; }
  add(g, rbox(W + 6.4, 0.7, 0.9, 0.1), M.inkLine, X, H + 7.6, Z + D / 2 + 2.9);
  chimney(g, M, X - W / 2 + 4, 2, Z - D / 2 + 5, H + 16, 5.4);
  // the forge: a hearth of dark stone, the glow, the hood; the anvil on its block in front
  const FZ = Z + D / 2 + 7;                                                                                           // the forge out in the yard before the posts (round 2: under the roof the glow is hidden from a 40-degree camera, as anything deeper than its height / 0.84)
  add(g, rbox(10, 6, 7, 0.4), M.wallDark, X + 8, 5, FZ); add(g, rbox(8.4, 1.4, 5.6, 0.3), M.coals, X + 8, 8.6, FZ); add(g, sph(2.6, 10, 8), M.coals, X + 8, 9.4, FZ).scale.set(1.3, 0.6, 1); add(g, sph(1.5, 10, 8), M.hearth, X + 8.4, 10.3, FZ + 0.4); // the hearth: dark coals heaped, a small red-orange ember on top, open to the sky
  add(g, cyl(1.6, 1.8, 12, 8), M.ironDark, X + 8, 11, FZ - 4.2); add(g, cyl(2.0, 2.0, 1.0, 8), M.ironDark, X + 8, 17.2, FZ - 4.2); // an iron flue behind it (its smoke the client's, while the smith works)
  add(g, cyl(2.8, 3.2, 4.5, 10), M.oak, X - 6, 4.2, Z + D / 2 + 6);                                                   // the anvil out in the yard before the posts, on its block
  add(g, rbox(8.0, 2.8, 3.2, 0.6), M.anvil, X - 6, 7.8, Z + D / 2 + 6); add(g, cone(1.3, 3.2, 8), M.anvil, X - 0.6, 7.8, Z + D / 2 + 6, 0, 0, -Math.PI / 2); // pale
  banner(g, M, X + W / 2 + 2, H + 7, Z - 2, 14, 16, 11);                                                              // the team flag on the gable (the pass: no hammer, trough, horseshoes, bar stock, stack cloth or eave banner)
  add(g, rbox(W + 6, 1.4, 0.5, 0.1), M.cloth, X, H + 6.4, Z + D / 2 + 3.3); for (const y of [H + 7.2, H + 5.6]) add(g, rbox(W + 6.4, 0.4, 0.6, 0.05), M.inkLine, X, y, Z + D / 2 + 3.3); // a thin team strip along the eave
  if (M.polish) { // secondary detail: quoins up the side walls' and back wall's corners, knee braces from the front posts to the plate, a hammer and tongs hung on the west post, a string course on the stack
    for (const [sx, z] of [[-1, Z - D / 2], [1, Z - D / 2], [-1, Z + 1.3], [1, Z + 1.3]]) quoins(g, M, X + sx * W / 2, z, 3, H + 1, 2.8, 2.4, 1.4);
    for (const x of [-W / 2 + 1, -W / 6, W / 6, W / 2 - 1]) { if (x > -W / 2 + 1) brace(g, M, X + x, H + 2.6, Z + D / 2 - 1, -4.5, 3.4); if (x < W / 2 - 1) brace(g, M, X + x, H + 2.6, Z + D / 2 - 1, 4.5, 3.4); }
    add(g, rbox(6.0, 1.0, 6.0, 0.2), M.plinth, X - W / 2 + 4, H + 10, Z - D / 2 + 5);
  }
  return g;
}

/** Workshop (Ballista, Trebuchet, Balloon; 3x3): an open yard of trodden earth and timber where engines are built:
 *  a half-built trebuchet frame (two oak A-frames, a cross axle, the beam not yet hung) on the yard's east, a sawhorse
 *  and timber stacks, a folded balloon (pale canvas heaped with a team band) and its wicker basket with team cloth on
 *  its rim on the west, a lifting pole (a gin) with a rope; a small slate-roofed shed at the back for tools; a flag on
 *  the gin, a team cloth on the shed. From the camera: bare timber triangles beside a pale heap and a basket, a small
 *  grey roof behind. */
export function workshop(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-47, -40], [40, -46], [47, -10], [44, 40], [-20, 46], [-46, 30]]);
  // the tool shed at the north-west: a small stone shed under a slate gable along x
  const SX = -26, SZ = -30, SW = 32, SD = 20, SH = 12;
  add(g, rbox(SW + 2, 2.4, SD + 2, 0.4), M.plinth, SX, 1.8, SZ); add(g, rbox(SW, SH, SD, 0.5), M.wall, SX, SH / 2 + 2, SZ);
  add(g, gable(SD + 5, 9, SW + 4), M.roof, SX, SH + 2, SZ, 0, Math.PI / 2, 0); add(g, rbox(SW + 4.4, 1.4, 1.4, 0.3), M.oak, SX, SH + 11.2, SZ);
  add(g, rbox(SW + 4.4, 0.6, SD + 5.4, 0.1), M.inkLine, SX, SH + 1.9, SZ);
  door(g, M, SX + 4, 2.2, SZ + SD / 2 + 0.6, 7, 9);
  // the trebuchet frame, half built: two A-frames of oak along z with a cross axle, pegs, a ladder leaning on one
  const TX = 22, TZ = 4;
  for (const dz of [-9, 9]) { for (const sx of [-1, 1]) limb(g, [TX + sx * 11, 2, TZ + dz], [TX, 32, TZ + dz], 1.4, M.oak); limb(g, [TX - 7, 14, TZ + dz], [TX + 7, 14, TZ + dz], 1.0, M.oak); }
  limb(g, [TX, 31, TZ - 10.5], [TX, 31, TZ + 10.5], 1.3, M.oak);                                                   // the axle
  for (const dz of [-9, 9]) add(g, sph(1.6, 8, 6), M.ironDark, TX, 31.5, TZ + dz);
  for (const sx of [-1, 1]) add(g, rbox(6, 2.4, 22, 0.4), M.oak, TX + sx * 10, 2.8, TZ);                            // the sills
  add(g, rbox(22, 2.6, 2.6, 0.5), M.oak, TX - 4, 3.5, TZ + 22, 0, 0.3, 0);                                           // the beam waiting on the ground
  // the gin: a lifting pole with a rope and a team flag
  add(g, cyl(1.0, 1.3, 44, 8), M.oak, -2, 24, -2, 0.12, 0, 0.08); limb(g, [-2, 44, -2], [TX, 33, TZ], 0.4, M.rope); limb(g, [-2, 44, -2], [-26, 2, 30], 0.4, M.rope);
  banner(g, M, 1.4, 44, -5.4, 10, 18, 12);
  // the folded balloon and its basket, west: pale canvas heaped in folds with a team band between ink hems, a wicker
  // basket with team cloth round its rim, two sandbags, coiled rope
  const BX = -24, BZ = 16;
  add(g, sph(11, 16, 10), M.canvas, BX, 3.6, BZ).scale.set(1.3, 0.42, 1); add(g, sph(8, 14, 8), M.canvas, BX - 3, 6.2, BZ - 2).scale.set(1.2, 0.5, 1);
  add(g, sph(5.5, 12, 8), M.canvasDark, BX + 7, 5.2, BZ + 4).scale.set(1.2, 0.5, 1);
  add(g, torus(9.4, 1.1, 24), M.cloth, BX, 6.0, BZ, Math.PI / 2, 0, 0).scale.set(1.3, 1, 1);                      // a thin team band round the heap (the pass: thin trim, no sandbags, rope, ladder, stacks, tarp, sawhorse or log)
  for (const r of [8.2, 10.6]) add(g, torus(r, 0.35, 24), M.inkLine, BX, 6.0 + (r > 9 ? -0.4 : 0.3), BZ, Math.PI / 2, 0, 0).scale.set(1.3, 1, 1);
  add(g, cyl(5.2, 4.4, 7, 12), M.wicker, BX + 20, 5.5, BZ + 12); add(g, cyl(5.6, 5.6, 1.4, 12), M.cloth, BX + 20, 9.6, BZ + 12);
  for (const y of [8.8, 10.4]) add(g, torus(5.65, 0.3, 24), M.inkLine, BX + 20, y, BZ + 12, Math.PI / 2, 0, 0);
  if (M.polish) { // secondary detail: quoins on the shed, finials on its ridge, rope lashings at the A-frames' apexes and iron caps on the axle's ends, a steel pulley on the gin
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) quoins(g, M, SX + sx * SW / 2, SZ + sz * SD / 2, 3, SH + 1, 2.8, 2.4, 1.4);
    for (const sx of [-1, 1]) finial(g, M, SX + sx * ((SW + 4.4) / 2 + 0.3), SH + 11.6, SZ);
    for (const dz of [-9, 9]) add(g, torus(1.8, 0.5, 12), M.rope, TX, 31, TZ + dz);
    for (const dz of [-11.0, 11.0]) add(g, cyl(1.7, 1.7, 1.0, 10), M.ironDark, TX, 31, TZ + dz, Math.PI / 2, 0, 0);
    add(g, cyl(1.3, 1.3, 0.9, 12), M.steel, -1.2, 44.6, -1.8, Math.PI / 2, 0, 0.3);
  }
  return g;
}

/** Watchtower (defence, 2x2): a tall round tower of slate-grey ashlar on a square plinth, string courses, arrow slits,
 *  a tall team banner down its south face; at the top a wider archer's platform: an oak hoarding on brackets, a
 *  battlemented stone parapet, a pennant staff; the archer (`watchtowerArcher`, the turning head) stands on it. An oak
 *  door at the foot, a brazier beside it. From the camera: a tall grey column with a team stripe, a wider crown on top,
 *  the longest shadow in the base. */
export const TOWER_H = 50;
export function watchtower(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-24, -18], [20, -24], [26, 6], [16, 26], [-20, 24], [-28, 4]]);
  add(g, rbox(26, 4, 26, 0.6), M.plinth, 0, 3, 0); add(g, rbox(22, 1.6, 22, 0.3), M.plinth, 0, 5.6, 0);
  add(g, cyl(8.6, 10.2, TOWER_H, 20), M.wall, 0, TOWER_H / 2 + 5, 0);
  for (const y of [20, 36]) add(g, cyl(9.6 - y * 0.03, 9.6 - y * 0.03, 1.2, 20), M.plinth, 0, y, 0);              // string courses
  for (const [a, y] of [[0, 30], [0.5, 44], [-0.5, 18]]) add(g, rbox(1.4, 5, 0.8, 0.2), M.inkLine, Math.sin(a) * 9.0, y, Math.cos(a) * 9.0, 0, a, 0); // arrow slits, south
  // the archer's platform: oak brackets, a hoarding floor wider than the tower, a stone parapet with merlons
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; limb(g, [Math.cos(a) * 8.4, TOWER_H - 4, Math.sin(a) * 8.4], [Math.cos(a) * 12.4, TOWER_H + 3.6, Math.sin(a) * 12.4], 0.9, M.oak); }
  add(g, cyl(13, 12.2, 1.8, 20), M.oak, 0, TOWER_H + 4.6, 0);
  add(g, cyl(13.2, 13.2, 3.6, 20), M.wallDark, 0, TOWER_H + 7.2, 0); add(g, cyl(11.6, 11.6, 0.6, 20), M.yard, 0, TOWER_H + 9.0, 0); // the parapet and the deck
  add(g, cyl(13.5, 13.5, 1.6, 20), M.cloth, 0, TOWER_H + 7.2, 0); for (const y of [TOWER_H + 6.3, TOWER_H + 8.1]) add(g, cyl(13.6, 13.6, 0.4, 20), M.inkLine, 0, y, 0); // a thin team band round the parapet between ink rings (the pass: the tall banner down the face is gone; team is the band and the flag)
  roundCrenels(g, M.wall, 0, 0, 12.6, TOWER_H + 9.2, 12);
  add(g, cone(5.6, 6, 12), M.roof, 0, TOWER_H + 13, -5, 0, 0, 0); add(g, cyl(2.6, 2.6, 6, 8), M.wallDark, 0, TOWER_H + 9, -5); // a small slate hood over the stair head, north
  banner(g, M, 8.6, TOWER_H + 9.6, -7, 14, 14, 10);
  door(g, M, 0, 5, 10.4, 5, 8); add(g, cyl(2.2, 1.6, 3, 10), M.ironDark, 12, 5.6, 14); add(g, sph(1.6, 8, 6), M.ironDark, 12, 7.4, 14); // a brazier, cold (the kingdom's one warm light is the Blacksmith's)
  for (const [x, z] of [[-14, 16], [-18, 12]]) add(g, rbox(3, 2.8, 3, 0.3), M.oak, x, 3.5, z);
  if (M.polish) { // secondary detail: a corbel flare under the hoarding, sills and lintels on the slits, quoins up the plinth's corners, a steel finial on the stair hood
    add(g, cyl(10.8, 9.0, 1.8, 20), M.plinth, 0, TOWER_H - 4.9, 0);
    for (const [a, y] of [[0, 30], [0.5, 44], [-0.5, 18]]) for (const dy of [-3.1, 3.1]) add(g, rbox(2.6, 0.7, 1.0, 0.1), M.plinth, Math.sin(a) * 9.3, y + dy, Math.cos(a) * 9.3, 0, a, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) quoins(g, M, sx * 13, sz * 13, 1.2, 5.2, 2.0, 2.4, 1.4);
    finial(g, M, 0, TOWER_H + 16.2, -5);
  }
  return g;
}
/** The Watchtower's archer (the turning head, 16 facings): a figure in a pale linen hood on the platform, a longbow
 *  held out ahead (its stave drawn thick), an arrow nocked, a team cape and a quiver; no shadow of its own. */
export function watchtowerArcher(M) {
  kbMats(M); const g = grp(), f = figure(M, 0), b = f.body; f.position.set(0, TOWER_H + 9.3, 0); f.rotation.y = 0; g.add(f);
  add(b, sph(2.4, 14, 10), M.linen, 0.1, 13.9, 0).scale.set(1, 1.1, 1); add(b, cone(1.6, 2.8, 8), M.linen, -1.2, 16.4, 0, 0, 0, 0.5); // the pointed hood, pale
  add(b, cyl(2.5, 2.5, 0.3, 14), M.inkLine, 0.1, 12.6, 0); add(b, sph(1.4, 10, 8), M.skin, 1.7, 13.4, 0).scale.set(0.8, 0.9, 0.9);
  add(b, cyl(2.4, 4.0, 5, 12), M.cloth, -0.6, 10.2, 0); add(b, cyl(4.1, 4.1, 0.4, 12), M.inkLine, -0.6, 7.8, 0); add(b, cyl(2.5, 2.5, 0.35, 12), M.inkLine, -0.6, 12.6, 0); // a team cape
  add(b, cyl(1.1, 1.1, 7, 8), M.leather, -3.2, 10.5, 1.6, 0.3, 0, 0.2); for (const z of [1.0, 2.2]) add(b, cone(0.5, 1.6, 6), M.steel, -4.2, 14.4, z); // the quiver with arrows
  const bow = grp(); bow.position.set(5.4, 10.6, 0); b.add(bow);
  add(bow, torus(7.5, 0.75, 20, Math.PI * 0.9), M.oak, 0, 0, 0, 0, 0, Math.PI / 2 - Math.PI * 0.45);             // the stave, an arc facing +x
  limb(bow, [-0.9, 7.2, 0], [-0.9, -7.2, 0], 0.3, M.rope);                                                          // the string
  add(bow, cyl(0.35, 0.35, 11, 6), M.oak, 4.0, 0, 0, 0, 0, Math.PI / 2); add(bow, cone(0.7, 1.6, 6), M.steel, 10, 0, 0, 0, 0, -Math.PI / 2); // the arrow
  limb(b, [0.6, 11, -3.6], [5.0, 10.6, -0.6], 1.15, M.cloth); limb(b, [0.6, 11, 3.6], [2.8, 10.8, 1.4], 1.15, M.cloth);
  if (M.polish) { // secondary detail (the Guard's): a steel buckle, a leather bracer on the bow arm, a leather binding at the bow's grip
    add(b, rbox(1.3, 1.1, 0.5, 0.1), M.steel, 2.75, 8.3, 0); add(b, sph(1.35, 8, 6), M.leather, 3.9, 10.7, -1.3);
    add(bow, cyl(1.0, 1.0, 2.4, 8), M.leather, 0, 0, 0, 0, 0, Math.PI / 2 - Math.PI * 0.45);
  }
  f.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return g;
}

/** Stables (Rider, Knight; needs a Market; 3x3): a long timber stable along x on a stone footing, its slate roof low,
 *  the south side a row of stalls with oak half-doors, three horses' heads out over them, hay in a rack and bales by
 *  the door; a paddock of post-and-rail fence to the east with a horse's trough and a mounting block; a team caparison
 *  and saddle cloths hung on the rail to air, a team banner on the gable, pennants at the paddock's corners. From the
 *  camera: a low long grey roof over a row of dark doors with horse heads, a fence beside, team cloths on it. */
export function stables(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-47, -36], [46, -44], [47, 20], [40, 46], [-30, 44], [-47, 10]]);
  const X = -10, Z = -14, W = 70, D = 24, H = 11;
  add(g, rbox(W + 3, 2.4, D + 3, 0.4), M.plinth, X, 1.6, Z);
  add(g, rbox(W, H, D, 0.5), M.wall, X, H / 2 + 2, Z - 1);
  for (let k = 0; k <= 5; k++) add(g, rbox(1.8, H + 0.4, 1.4, 0.3), M.oak, X - W / 2 + k * W / 5, H / 2 + 2, Z + D / 2 - 0.4); // the stall posts
  add(g, rbox(W + 0.6, 1.4, 1.4, 0.3), M.oak, X, H + 2.3, Z + D / 2 - 0.4);
  for (let k = 0; k < 5; k++) {                                                                                      // the stalls: half-doors, a horse's head out of three
    const x = X - W / 2 + (k + 0.5) * W / 5;
    add(g, rbox(W / 5 - 3, 6, 1.0, 0.3), M.oak, x, 5, Z + D / 2 + 0.2); add(g, rbox(W / 5 - 2.6, 0.5, 0.4, 0.1), M.ironDark, x, 7.6, Z + D / 2 + 0.8);
    add(g, rbox(W / 5 - 3, H - 6.5, 0.6, 0.1), M.inkLine, x, H - 1.5, Z + D / 2 - 0.2);                                  // the dark opening over the door
    if (k === 0 || k === 2 || k === 4) horseHead(g, M, x + (k === 2 ? -1 : 1), 5.5, Z + D / 2 - 1.6, (k - 2) * 0.15);
  }
  add(g, gable(D + 6, 9, W + 5), M.roof, X, H + 2.4, Z - 1, 0, Math.PI / 2, 0); add(g, rbox(W + 5.4, 1.4, 1.4, 0.3), M.oak, X, H + 11.6, Z - 1);
  add(g, rbox(W + 5.4, 0.6, D + 6.4, 0.1), M.inkLine, X, H + 2.3, Z - 1);
  banner(g, M, X - W / 2 + 2, H + 11.8, Z - 1, 14, 16, 11);                                                           // the team flag on the gable (the pass: no hung banners, bales or hay rack)
  add(g, rbox(W + 5.4, 1.4, 0.5, 0.1), M.cloth, X, H + 1.6, Z - 1 + D / 2 + 3.4); for (const y of [H + 2.4, H + 0.8]) add(g, rbox(W + 5.8, 0.4, 0.6, 0.05), M.inkLine, X, y, Z - 1 + D / 2 + 3.4); // a thin team strip along the eave
  // the paddock east: post-and-rail, team cloths over the south rail, a trough, a mounting block
  const PX = 34, PZ = 18, PW = 24, PD = 34;
  const posts = [[PX - PW / 2, PZ - PD / 2], [PX + PW / 2, PZ - PD / 2], [PX + PW / 2, PZ + PD / 2], [PX - PW / 2, PZ + PD / 2]];
  posts.forEach((p, k) => { const q = posts[(k + 1) % 4]; add(g, cyl(0.9, 1.0, 8, 6), M.oak, p[0], 5, p[1]); for (const t of [0.5]) { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; add(g, cyl(0.8, 0.9, 8, 6), M.oak, m[0], 5, m[1]); void t; } for (const y of [4.4, 7.6]) limb(g, [p[0], y, p[1]], [q[0], y, q[1]], 0.5, M.oak); });
  horse(g, M, PX + 1, PZ + 1, -0.5);                                                                                  // a horse standing in the paddock (round 2: the Stables and the Barracks read alike)
  if (M.polish) { // secondary detail: knee braces from the stall posts to the plate, finials on the ridge, an iron-hooped bucket by the trough, iron hinge straps on the half-doors
    for (let k = 0; k <= 5; k++) { const px = X - W / 2 + k * W / 5; if (k > 0) brace(g, M, px, H - 1.4, Z + D / 2 - 0.4, -4.2, 3.4); if (k < 5) brace(g, M, px, H - 1.4, Z + D / 2 - 0.4, 4.2, 3.4); }
    for (const sx of [-1, 1]) finial(g, M, X + sx * ((W + 5.4) / 2 + 0.3), H + 12.0, Z - 1);
    for (let k = 0; k < 5; k++) { const x = X - W / 2 + (k + 0.5) * W / 5; add(g, rbox(W / 5 - 2.6, 0.5, 0.4, 0.1), M.ironDark, x, 3.4, Z + D / 2 + 0.8); }
  }
  return g;
}

/** Market (income, 2x2): money comes from here. Three stalls of oak round a small cobbled square: two under striped
 *  awnings (pale canvas and team cloth in alternate strips over oak poles, no slab) and one under a small slate roof;
 *  on their counters cloth bolts, loaves and pots; sacks of grain heaped by the stalls, a hand cart, barrels; at the
 *  centre the counting table with an open iron-bound coin chest heaped with gold (the one gold on the building: its
 *  cue), a scale and a ledger; a tall team banner on a staff. From the camera: two striped awnings and a grey roof round
 *  a small bright gold square, sacks about. */
export function market(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-31, -26], [26, -31], [31, 2], [28, 29], [-20, 31], [-31, 14]]);
  add(g, plate(oct(20, 0.35), 1.0, 0.3), M.yard, 2, 1.8, 4).userData.ground = true;                                               // the cobbled square (`ground` for the polish: no contact ring round it)
  const stall = (x, z, ry, w, roof) => {
    const s = grp(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
    for (const [dx, dz] of [[-w / 2, -4], [w / 2, -4], [-w / 2, 5], [w / 2, 5]]) add(s, cyl(0.8, 0.9, dz > 0 ? 12 : 14, 8), M.oak, dx, dz > 0 ? 7 : 8, dz);
    add(s, rbox(w, 5, 7, 0.4), M.oak, 0, 4.5, 1); add(s, rbox(w + 0.6, 0.8, 8, 0.2), M.oak, 0, 7.4, 1);                           // the counter
    if (roof === 'slate') { const r = add(s, rbox(w + 4, 1.0, 13, 0.2), M.roof, 0, 13.6, 0.5); r.rotation.x = 0.16; add(s, rbox(w + 4.4, 0.5, 0.8, 0.1), M.inkLine, 0, 12.6, 6.8); }
    else {                                                                                                                       // a striped awning: alternate strips of pale canvas and team cloth, an ink hem at its front and back
      const n = Math.round(w / 3.2), sw = (w + 3) / n;                                                                          // a striped awning: alternate strips of cream canvas and tan (the final round: the stripes back, in neutral colours, never team or red), an ink hem at its front and back
      for (let k = 0; k < n; k++) { const r = add(s, rbox(sw, 0.5, 13, 0.1), k % 2 ? M.tan : M.canvas, -(w + 3) / 2 + sw * (k + 0.5), 13.2, 0.5); r.rotation.x = 0.18; }
      for (const dz of [6.9, -5.9]) add(s, rbox(w + 3.4, 0.6, 0.7, 0.1), M.inkLine, 0, 13.2 - dz * 0.18 - 0.1, dz);
      add(s, rbox(w + 3, 1.6, 0.5, 0.1), M.cloth, 0, 11.0, 7.0); add(s, rbox(w + 3.4, 0.4, 0.6, 0.05), M.inkLine, 0, 10.1, 7.0); // the thin team hem along the front
      if (M.polish) for (const dx of [-w / 2, w / 2]) add(s, sph(0.8, 8, 6), M.steel, dx, 13.5, 5);                               // (polish) steel knobs on the front poles: a glint each
    }
    return s;
  };
  const a = stall(-16, -8, 0.5, 16, 'awning'); const b = stall(18, -4, -0.6, 14, 'awning'); const c = stall(-4, -22, 0, 18, 'slate');
  void a; void b;                                                                                                                  // (the pass: no goods on the counters)
  // the counting table at the centre: an open iron-bound chest heaped with gold, a scale, a ledger
  const TX = 2, TZ = 6;
  add(g, rbox(12, 1.0, 7, 0.3), M.oak, TX, 6.2, TZ); for (const [dx, dz] of [[-5, -2.5], [5, -2.5], [-5, 2.5], [5, 2.5]]) add(g, rbox(1.2, 4.6, 1.2, 0.2), M.oak, TX + dx, 3.6, TZ + dz);
  add(g, rbox(7, 4, 5, 0.4), M.oak, TX - 1.5, 8.7, TZ); for (const dy of [7.4, 10.2]) add(g, rbox(7.4, 0.5, 5.4, 0.1), M.ironDark, TX - 1.5, dy, TZ);
  add(g, rbox(7, 0.8, 5, 0.3), M.oak, TX - 1.5, 12.4, TZ - 3.2, -1.2, 0, 0);                                                        // the lid, open and leaning back
  add(g, sph(3.2, 12, 8), M.gold, TX - 1.5, 10.6, TZ).scale.set(1, 0.5, 0.7); add(g, torus(3.1, 0.3, 18), M.inkLine, TX - 1.5, 10.9, TZ, Math.PI / 2, 0, 0).scale.set(1, 0.72, 1);
  add(g, sph(0.45, 8, 6), M.glint, TX - 0.6, 12.0, TZ + 0.6); add(g, sph(0.35, 8, 6), M.glint, TX - 2.6, 11.8, TZ - 0.8);
  for (const [dx, dz] of [[2.6, 1.4], [3.8, -0.8], [1.6, -2.2]]) add(g, cyl(0.8, 0.8, 0.3, 10), M.gold, TX + dx, 6.9, TZ + dz, 0.2, dx, 0);
  banner(g, M, 24, 2, -20, 30, 20, 14);                                                                                            // the tall team flag (the pass: no scale, sacks, cart or barrels)
  if (M.polish) { // secondary detail: iron corner straps on the coin chest, a ledger on the table, knee braces under the slate stall's roof (the awnings' knobs and the cart's hubs are above)
    for (const [dx, dz] of [[-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]]) add(g, rbox(0.7, 4.2, 0.7, 0.1), M.ironDark, TX - 1.5 + dx, 8.7, TZ + dz);
    for (const dx of [-9, 9]) brace(c, M, dx, 11.4, -4, -Math.sign(dx) * 3.2, 2.2);
  }
  return g;
}

// ---- the Cottage, two options (the last art round: the wide one read as a single wall segment): (a) a square house
// with a hip roof and a chimney, two walls showing at -20; (b) a round thatched hut with a cone roof. Team on the
// flag and a thin eave strip. ----
export function cottageHip(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-30, -22], [22, -30], [31, 2], [24, 30], [-24, 28], [-31, 4]]);
  const X = -2, Z = -2, W = 30, D = 30, H = 13, R = 16;
  add(g, rbox(W + 2.4, 2.6, D + 2.4, 0.4), M.plinth, X, 1.8, Z);
  add(g, rbox(W, H, D, 0.5), M.wall, X, H / 2 + 2, Z);
  for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1]]) add(g, rbox(1.2, H + 0.2, 1.2, 0.2), M.oak, X + sx * (W / 2 - 0.4), H / 2 + 2, Z + sz * (D / 2 - 0.4)); // oak corner posts
  add(g, rbox(W + 0.6, 1.3, D + 0.6, 0.2), M.oak, X, H + 1.6, Z);                                                   // the wall plate
  add(g, cone((W + 7) / 2 * Math.SQRT2, R, 4), M.thatch, X, H + 2 + R / 2, Z, 0, Math.PI / 4, 0);                   // the hip roof: a thatched pyramid over all four walls
  add(g, rbox(W + 7.4, 0.6, D + 7.4, 0.1), M.inkLine, X, H + 1.9, Z);                                                // the dark eave line
  chimney(g, M, X + W / 2 - 4, 2, Z - 6, H + 10, 4.6);
  M.candle ??= std({ color: 0xffd890, emissive: 0xffc060, emissiveIntensity: 1.3, roughness: 0.6 });                   // a candle-lit window pane, warm yellow (the last batch; small, never a surface)
  M.doorPale ??= std({ color: 0xa88a60, map: M.timber.map, roughness: 0.8 });                                         // the door in pale timber, so it shows against the dark wall
  add(g, rbox(8.4, 11, 0.6, 0.1), M.inkLine, X - 8, 7.5, Z + D / 2 + 0.4); add(g, rbox(7, 10, 1.2, 0.3), M.doorPale, X - 8, 7, Z + D / 2 + 0.6); for (const y of [4.5, 9.5]) add(g, rbox(7.2, 0.7, 0.4, 0.1), M.ironDark, X - 8, y, Z + D / 2 + 1.3); // a clear door: pale timber in an ink frame, two iron bands
  add(g, rbox(6.4, 5.4, 0.6, 0.1), M.inkLine, X + 5, 8.5, Z + D / 2 + 0.4); add(g, rbox(5.4, 4.4, 0.8, 0.1), M.candle, X + 5, 8.5, Z + D / 2 + 0.7); add(g, rbox(0.6, 4.6, 0.9, 0.05), M.ironDark, X + 5, 8.5, Z + D / 2 + 1.0); add(g, rbox(5.6, 0.6, 0.9, 0.05), M.ironDark, X + 5, 8.5, Z + D / 2 + 1.0); // a window in the middle of the front, candle-lit, with a dark cross of mullions
  window_(g, M, X + W / 2 + 0.6, 8.5, Z - 4, 3, 4, Math.PI / 2);                                                     // a window on the east wall too: two walls show at -20
  banner(g, M, X, H + 2 + R - 1, Z, 14, 14, 10);                                                                     // the team flag at the peak
  add(g, rbox(W + 7.4, 1.4, 0.5, 0.1), M.cloth, X, H + 0.9, Z + D / 2 + 3.9); for (const y of [H + 1.7, H + 0.1]) add(g, rbox(W + 7.8, 0.4, 0.6, 0.05), M.inkLine, X, y, Z + D / 2 + 3.9); // a thin team strip along the south eave
  if (M.polish) { for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) quoins(g, M, X + sx * W / 2, Z + sz * D / 2, 3, H + 1.2, 2.8, 2.4, 1.4); add(g, rbox(9, 1.2, 1.4, 0.2), M.plinth, X - 8, 12.8, Z + D / 2 + 0.7); }
  return g;
}
export function cottageRound(M) {
  kbMats(M); const g = grp();
  earth(g, M, [[-29, -21], [21, -29], [30, 2], [22, 29], [-22, 27], [-30, 4]]);
  const RW = 16, H = 12, RR = 21, RH = 17;
  add(g, cyl(RW + 1.4, RW + 1.8, 2.6, 24), M.plinth, 0, 1.3, 0);
  add(g, cyl(RW, RW, H, 24), M.wall, 0, H / 2 + 2, 0);
  add(g, torus(RW + 0.3, 0.7, 24), M.oak, 0, H + 1.8, 0, Math.PI / 2, 0, 0);                                        // the wall plate ring
  add(g, cone(RR, RH, 24), M.thatch, 0, H + 2 + RH / 2, 0);                                                          // the cone roof of thatch
  add(g, torus(RR + 0.2, 0.4, 24), M.inkLine, 0, H + 2.0, 0, Math.PI / 2, 0, 0);                                      // the dark eave line
  add(g, cyl(1.2, 1.4, 4, 8), M.wallDark, 0, H + 2 + RH + 1.5, 0); add(g, sph(1.0, 8, 6), M.plinth, 0, H + 2 + RH + 3.6, 0); // a finial post at the peak
  chimney(g, M, 11, 2, -8, H + 12, 4.0);                                                                             // a chimney through the roof's north-east
  door(g, M, 0, 2.2, RW - 0.4, 5.5, 8.5); window_(g, M, RW - 0.4, 8.5, 5, 3, 4, Math.PI / 2 * 0); window_(g, M, -RW + 0.4, 8.5, 5, 3, 4, Math.PI);
  banner(g, M, 3, H + 2 + RH + 2, -3, 12, 14, 10);                                                                   // the team flag beside the peak
  add(g, cyl(RR + 0.5, RR + 0.5, 1.4, 24), M.cloth, 0, H + 1.2, 0); for (const y of [H + 2.0, H + 0.4]) add(g, cyl(RR + 0.7, RR + 0.7, 0.4, 24), M.inkLine, 0, y, 0); // a thin team band round the eave between ink rings
  return g;
}
