// The gold mine (the re-theme, 2026-11-11): one mine per gold field, neutral (no team mask), 3x3 tiles, in three
// stages, drawn to a 2x2 footprint (MINE_N; centered on a 3x3 field if the rules keep one). A timber-framed adit cut into the south face of a rough gray outcrop, the yard before it with rails, an ore
// cart and a spoil heap; gold shows as a few big veins in the rock and the ore in the cart, never as loose shiny piles.
// `full`: two broad veins either side of the portal and a jagged one over its brow, nuggets on the crags, straight timbers,
// a loaded cart, a lantern on the lintel; `low`: one vein and a dark band, a nugget, the lintel sagging and a post
// leaning, the cart with gray rock, dug hollows and spoil in the yard; `empty`: no gold, the portal boarded over, its
// lintel broken and the cap beam fallen, rock spilled out of the mouth, the cart tipped off the rails. Same conventions
// as country.js: game units (a tile is 32), y up, +z south (to the camera), centered on the footprint. The gold, earth,
// iron and glint are the country's (country.js `countryMats`: plain or polished with the render); the rock and timber
// are the mine's own (`mineMats`: round 1 drew the country's rock, whose lit crags went near white under the polish's
// key and read as a heap of pale crystals, and its fresh timber, which went orange and counted as gold).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { cone } from './vael.js';
import { countryMats } from './country.js';
import { polishTextures } from './polish.js';

export const MINE_STAGES = ['full', 'low', 'empty'];
/** The cell's height (game units): the outcrop's top over the ground. */
export const MINE_H = 28;
/** The footprint in tiles: drawn to 2x2 (Stelian, 2026-11-11: smaller than the Castle, a mid-size building's width);
 *  on a 3x3 field the same art sits centered. The model is built at the 3x3 round's size and scaled by MINE_SCALE. */
export const MINE_N = 2;
export const MINE_SCALE = 0.66;
let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const std = (o) => new THREE.MeshStandardMaterial(o);
const ground = (m) => { m.userData.ground = true; return m; };
/** A crag: an icosahedron whose vertices are pushed in and out by up to `k` of the radius (its own seed, so the same
 *  call draws the same rock), flat-shaded by the material: broken rock, not a pebble (round 1's dodecahedra). */
const crags = new Map();
function crag(r, seed, k = 0.22) {
  const key = `${r},${seed},${k}`;
  if (!crags.has(key)) {
    let t = seed; const r2 = () => ((t = (t * 16807) % 2147483647) / 2147483647);
    const geo = new THREE.IcosahedronGeometry(r, 1).toNonIndexed(), p = geo.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) { // (the same vertex comes back in every face it is on: push it the same way each time)
      const kx = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(kx)) seen.set(kx, 1 - k + r2() * 2 * k);
      const f = seen.get(kx); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
    }
    geo.computeVertexNormals(); crags.set(key, geo);
  }
  return crags.get(key);
}
/** A flat uneven patch (country.js's): an outline of radius R wobbling by `amp`, squashed to `sq`, `h` thick. */
const wob = (R, amp, ph) => (a) => R * (1 + amp * (0.13 * Math.sin(3 * a + ph) + 0.08 * Math.sin(5 * a + ph * 1.7) + 0.05 * Math.sin(9 * a + ph * 2.3)));
function patch(edge, sq, h) {
  const sh = new THREE.Shape();
  for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 2, r = edge(a), x = Math.cos(a) * r, z = Math.sin(a) * r * sq; k ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2); geo.computeVertexNormals(); return geo;
}

const MM = { plain: null, polish: null };
/** The mine's own materials over the country's set `C`: its rock (a dark gray, so a lit crag lands mid-gray under the
 *  polish's key and the gold stands off it), the portal's weathered oak (gray-brown, matte: never orange beside the
 *  gold), the sleepers' tarred timber, gray boards, the cart's iron, the unlit black of the adit, the tunnel's shaded
 *  floor, a lantern. Made once per finish. */
function mineMats(C) {
  const key = C.polish ? 'polish' : 'plain';
  if (MM[key]) return MM[key];
  const M = {
    rock: std({ color: 0x4c4b47, roughness: 0.92, metalness: 0.02, flatShading: true }),
    rockDark: std({ color: 0x33322f, roughness: 0.95, metalness: 0.02, flatShading: true }),
    rockPale: std({ color: 0x5e5d58, roughness: 0.88, metalness: 0.02, flatShading: true }),
    timber: std({ color: 0x5c5044, roughness: 1, metalness: 0 }),
    timberDark: std({ color: 0x3a3228, roughness: 1, metalness: 0 }),
    board: std({ color: 0x6a645a, roughness: 1, metalness: 0 }),
    tub: std({ color: 0x56585c, roughness: 0.6, metalness: 0.5 }),
    mouth: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    tunnel: std({ color: 0x24211e, roughness: 1, flatShading: true }),
    lamp: std({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 1.8 }),
  };
  if (C.polish) {
    const X = polishTextures(), bump = (m, map, k) => { m.bumpMap = map; m.bumpScale = k; m.needsUpdate = true; };
    for (const k of ['rock', 'rockDark', 'rockPale']) bump(M[k], X.scuff, 0.7);
    for (const k of ['timber', 'timberDark', 'board']) { bump(M[k], X.grain, 0.8); M[k].envMapIntensity = 0; }
    bump(M.tub, X.scuff, 0.5); M.tub.envMapIntensity = 1.2;
  }
  return MM[key] = M;
}

/** A vein of gold set into a rock face looking +z: a rounded bar `w` wide, `len` long, turned by `rz` in the face. */
function vein(g, mat, x, y, z, w, len, rz, ry = 0) { add(g, rbox(w, len, 2.6, 0.7), mat, x, y, z, 0.1, ry, rz); }
/** A nugget with its glint, on a lit top. */
function nugget(g, C, x, y, z, r) {
  add(g, crag(r, 500 + Math.round(x * 7 + z * 3), 0.3), C.gold, x, y, z, rnd(), rnd() * 3, rnd());
  add(g, sph(r * 0.3, 6, 4), C.glint, x - r * 0.35, y + r * 0.6, z - r * 0.3);
}
/** An ore cart on the rails at (x, z): a riveted iron tub on four wheels; `load` fills it, 'gold' ore or gray 'rock';
 *  `tip` lays it on its side off the rails (the empty mine's). */
function cart(g, C, M, x, z, load, tip = false) {
  const c = grp(); c.position.set(x, tip ? 4.2 : 2.0, z); c.rotation.set(tip ? 0.3 : 0, tip ? 0.5 : 0, tip ? 1.35 : 0); g.add(c);
  add(c, rbox(12, 7, 9, 0.8), M.tub, 0, 3.5, 0);
  for (const y of [1.0, 6.2]) add(c, rbox(12.6, 0.8, 9.6, 0.1), C.iron, 0, y, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(c, cyl(1.9, 1.9, 1.0, 10), C.iron, sx * 6.4, -0.1, sz * 3.0, 0, 0, Math.PI / 2);
  if (load === 'gold') { for (let k = 0; k < 7; k++) { const a = rnd() * 6.3, d = rnd() * 3.4, r = 1.8 + rnd() * 1.0; add(c, crag(r, 600 + k, 0.3), k % 4 === 3 ? C.goldDark : C.gold, Math.cos(a) * d, 7.0 + rnd() * 1.2, Math.sin(a) * d * 0.7, rnd(), rnd(), rnd()); } add(c, crag(2.6, 611, 0.3), C.gold, 0.4, 9.2, -0.3, 0.3, 0.8, 0.2); add(c, sph(0.7, 6, 4), C.glint, -0.3, 10.6, -1.0); add(c, sph(0.5, 6, 4), C.glint, 3.0, 8.6, 1.6); }
  else if (load === 'rock') { for (let k = 0; k < 6; k++) { const a = rnd() * 6.3, d = rnd() * 3.4, r = 1.6 + rnd() * 1.0; add(c, crag(r, 620 + k, 0.3), k % 2 ? M.rock : M.rockDark, Math.cos(a) * d, 6.6 + rnd() * 0.8, Math.sin(a) * d * 0.7, rnd(), rnd(), rnd()); } }
}
/** A heap of spoil at (x, z): dark dug earth with gray rock chips down its slopes, `r` across. */
function spoil(g, C, M, x, z, r, h) {
  add(g, cone(r, h, 12), C.earthDark, x, h / 2 - 0.2, z, 0, rnd() * 3, 0).scale.z = 0.8;
  for (let k = 0; k < 4; k++) { const a = rnd() * 6.3, d = (0.3 + rnd() * 0.55) * r, y = Math.max(0.6, h * (1 - d / r) * 0.9); add(g, crag(1.3 + rnd() * 1.3, 700 + k + Math.round(x), 0.3), k % 2 ? M.rock : M.rockDark, x + Math.cos(a) * d, y, z + Math.sin(a) * d * 0.8, rnd(), rnd() * 3, rnd()).scale.y = 0.7; } // (dark chips: round 2's pale ones read as flower heads at 0.75)
}

/** The gold mine (`rt_mine_<stage>`; the game's `mine_<stage>`), `stage` one of MINE_STAGES or its index. */
export function goldMine(stage) {
  const st = typeof stage === 'number' ? stage : MINE_STAGES.indexOf(stage), C = countryMats(), M = mineMats(C), g = grp(); s = 811 + st * 13;
  const FULL = st === 0, LOW = st === 1, EMPTY = st === 2;
  // the apron: trodden earth round the whole, a darker worn strip from the mouth down the rails (ground: nothing rings it)
  ground(add(g, patch(wob(49, 1.0, 1.3 + st), 0.84, 0.3), C.earth, 0, 0.02, 2));
  ground(add(g, patch(wob(9, 1.2, 2.2), 2.6, 0.2), C.earthDark, 0, 0.34, 24));
  // ---- the outcrop: a flat-faced slab of rock holding the portal, crags piled behind and to either side (the crown
  // behind the slab, the flanks lower), dark crags in the creases, a pale one on top, scree at the foot ----
  const R = (r, seed, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { const m = add(g, crag(r, seed), mat, x, y, z, rx, ry, rz); m.scale.set(sx, sy, sz); return m; };
  add(g, rbox(58, 27, 22, 2.5), M.rock, 0, 11.5, -7, -0.1, 0, 0);                                                   // the face slab, its south face a cliff for the portal
  const CR = (r, seed, mat, x, y, z, sx, sy, sz, rx, ry, rz) => { const m = add(g, crag(r, seed, 0.3), mat, x, y, z, rx, ry, rz); m.scale.set(sx, sy, sz); return m; }; // (the crown's crags, rougher)
  CR(20, 11, M.rock, -9, 19, -24, 1.2, 0.78, 1.0, 0.1, 0.5, 0.05);                                                   // the crown, off to the west
  CR(11, 12, M.rockPale, -4, 29, -24, 1.0, 0.6, 0.9, 0.3, 1.9, 0.1);
  CR(9, 31, M.rock, 12, 25, -20, 1.0, 0.8, 0.9, 0.5, 2.6, -0.3);                                                     // a spur east of it
  R(13, 13, M.rockDark, -26, 12, -30, 1.1, 0.8, 1.0, 0.4, 1.1, 0.2);
  R(15, 14, M.rock, 25, 15, -27, 1.0, 0.85, 1.0, 0.3, 2.4, 0);
  R(14, 15, M.rock, -32, 8, -10, 1.0, 0.68, 0.95, 0.2, 2.9, 0.15);                                                    // the west flank, low
  R(10, 16, M.rockDark, -41, 4.5, 4, 1.0, 0.7, 1.0, 0.6, 0.8, 0);
  R(19, 17, M.rock, 31, 12, -13, 1.0, 0.75, 0.95, 0.1, 1.7, -0.1);                                                   // the east flank, taller
  R(10, 18, M.rockDark, 43, 4.5, -1, 1.0, 0.7, 1.0, 0.3, 2.2, 0);
  R(7, 19, M.rock, 40, 3, 13, 1.0, 0.65, 1.0, 0.5, 0.4, 0.2);                                                        // a boulder on the yard's edge
  for (let k = 0; k < 9; k++) { const x = (k < 5 ? -1 : 1) * (20 + rnd() * 24), z = 9 + rnd() * 7, r = 1.6 + rnd() * 2.2; R(r, 20 + k, k % 3 ? M.rock : M.rockDark, x, r * 0.5, z, 1, 0.65, 1, rnd(), rnd() * 3, rnd()); } // scree
  // ---- the portal: the black of the adit just behind the frame (unlit), a strip of tunnel floor leading in, posts
  // and a lintel of weathered oak, a cap beam cribbed over the lintel, wing walls of two beams either side ----
  const MW = 32, MH = 19, PZ = 9, PX = MW / 2 + 2.4, PH = MH + 4;                                                    // (the mouth a size up for the 2x2 scale: two Villagers still go in abreast)                                                     // the mouth's width and height; the frame's plane, its posts' x and height
  add(g, rbox(MW + 2, PH + 1, 14, 0.5), M.mouth, 0, (PH + 1) / 2 - 0.5, PZ - 2.2 - 7);                                // the black, its front at the frame's back, up to the lintel
  add(g, rbox(MW + 1, 0.8, 5, 0.1), M.tunnel, 0, 0.4, PZ - 0.5);                                                      // the tunnel's floor, from the frame in
  if (EMPTY) { for (let k = 0; k < 7; k++) { const x = (rnd() - 0.5) * MW, r = 2.4 + rnd() * 2.6; R(r, 40 + k, k % 2 ? M.rock : M.rockDark, x, r * 0.6, PZ - 4 + rnd() * 12, 1, 1, 1, rnd(), rnd() * 3, rnd()); } } // the roof has come down: rock spilled out of the mouth
  const postL = add(g, rbox(4.2, PH, 4.2, 0.5), M.timber, -PX, PH / 2, PZ);
  const postR = add(g, rbox(4.2, PH, 4.2, 0.5), M.timber, PX, PH / 2, PZ);
  if (LOW) { postR.rotation.z = -0.08; postR.position.x += 0.8; }
  if (EMPTY) { postL.rotation.z = 0.17; postL.position.x -= 1.8; postL.position.y -= 0.6; }
  if (!EMPTY) {
    const lintel = add(g, rbox(MW + 12, 4.2, 4.6, 0.5), M.timber, 0, PH + 1.8, PZ);
    if (LOW) { lintel.rotation.z = 0.06; lintel.position.y -= 1.4; lintel.rotation.x = 0.1; }                       // sagging
    add(g, rbox(MW + 4, 3.6, 4.6, 0.5), M.timber, LOW ? -2 : 0, PH + 5.6, PZ - 1.4, 0, 0, LOW ? -0.05 : 0);          // the cap beam, stepped back
    // the lantern: a bracket out of the lintel and a small warm lamp
    add(g, rbox(0.8, 0.8, 3.6, 0.1), C.iron, -10, PH + 2.2, PZ + 3.6); add(g, cyl(1.0, 1.0, 2.4, 8), C.iron, -10, PH + 1.2, PZ + 5.2); add(g, sph(1.4, 8, 6), M.lamp, -10, PH + 0.9, PZ + 5.2);
  } else {
    add(g, rbox(20, 4.2, 4.6, 0.5), M.timber, -9, PH + 0.8, PZ, 0, 0, 0.34);                                          // the lintel broken: its west half hangs, its east half lies in the rubble
    add(g, rbox(18, 4.2, 4.6, 0.5), M.timber, 15, 3.4, PZ + 9, 0.2, 0.4, 0.55);
    add(g, rbox(26, 3.6, 4.6, 0.5), M.timber, 3, 2.6, PZ + 15, 0.1, -0.3, 0.1);                                       // the cap beam fallen into the yard
    add(g, rbox(18, 3.4, 4.6, 0.5), M.timber, -18, 7.5, PZ + 4, 0.5, 0.2, 1.1);                                       // another leaning on the post
    for (const [y, rz] of [[4.5, 0.05], [9.5, -0.08], [14.5, 0.12]]) add(g, rbox(MW + 5, 2.8, 1.0, 0.2), M.board, 0.5, y, PZ + 2.0, 0, 0, rz); // boarded over, the boards nailed askew
    add(g, rbox(2.4, MH - 2, 1.0, 0.2), M.board, -5, MH / 2 - 1, PZ + 2.4, 0, 0, 0.3);
  }
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) add(g, rbox(6, 3.2, 4.0, 0.5), M.timber, sx * (PX + 4.6), 1.6 + k * 3.3, PZ - 0.4 - k * 0.3, 0, 0, (rnd() - 0.5) * 0.04); // the wing walls
  // ---- the gold: a few big shapes, never flecks (round 1's veins of 4 vanished at 1x); glints on the lit tops ----
  const FZ = 4.6; // (the slab's south face, at the veins' height)
  /** The vein over the slab's brow: three jagged segments in a line, sunk into the rock (round 2's one straight bar lay on
   *  the rock like a label), `k` their length and thickness. */
  const brow = (mat, k) => { for (const [x, y, len, rz] of [[-7, 26.6, 15, 0.18], [5, 28.4, 14, -0.22], [16, 26.8, 11, 0.3]]) add(g, rbox(len * k, 6.0 * k, 3.6, 0.9), mat, x, y, -5.2 + (y - 27) * 0.1, 0.45, 0.12, rz); };
  if (FULL) {
    vein(g, C.gold, -24.5, 16, FZ, 7.5, 19, 0.28); vein(g, C.gold, -21, 8.5, FZ - 0.4, 4.2, 7, -0.5);                    // down the face west of the portal, a branch off it
    vein(g, C.gold, 25, 15, FZ, 7.0, 17, -0.38); vein(g, C.gold, 22.5, 23, FZ - 0.6, 3.8, 6, 0.4);                 // and east of it
    brow(C.gold, 1);
    add(g, rbox(9, 3.6, 3.6, 0.9), C.goldDark, -18, 25.4, -5.4, 0.45, -0.2, -0.12);
    vein(g, C.goldDark, -33, 10, 2.4, 4.2, 9, 0.3, 0.35);                                                             // on the west flank's face
    nugget(g, C, -11, 31.5, -25, 3.6); nugget(g, C, 30, 24.5, -14, 3.2); nugget(g, C, -31, 17, -12, 3.0); nugget(g, C, 2, 34.5, -22, 2.8);
    nugget(g, C, -37, 1.4, 14, 1.6); nugget(g, C, 24, 1.3, 12, 1.5);                                                  // two at the foot by the scree
    cart(g, C, M, 0, 27, 'gold');
  } else if (LOW) {
    vein(g, C.gold, 25, 12, FZ, 6.0, 10, -0.38);                                                                     // what is left: one vein, a dark worked band and a nugget
    brow(C.goldDark, 0.7);
    nugget(g, C, 30, 24.5, -14, 2.6);
    cart(g, C, M, 0, 27, 'rock');
    spoil(g, C, M, 31, 30, 11, 6.5);
    for (let k = 0; k < 3; k++) ground(add(g, patch(wob(4 + rnd() * 1.5, 1.3, rnd() * 6), 0.8, 0.3), C.earthDark, -26 + k * 8 + rnd() * 3, 0.1, 30 + rnd() * 8)); // dug hollows in the yard
  } else {
    cart(g, C, M, -19, 34, null, true);
    spoil(g, C, M, 31, 30, 12, 7);
    spoil(g, C, M, -34, 25, 8, 4.5);
  }
  // ---- the rails from the mouth to the footprint's south edge, on sleepers ----
  for (let z = PZ + 3; z < 46; z += 5) if (!(EMPTY && (z === PZ + 23 || z === PZ + 33))) add(g, rbox(14, 1.0, 2.2, 0.2), M.timberDark, 0, 0.5, z, 0, (rnd() - 0.5) * (EMPTY ? 0.2 : 0.03), 0);
  for (const sx of [-1, 1]) add(g, rbox(1.0, 1.0, 36, 0.1), C.iron, sx * 5.0, 1.4, PZ + 19, 0, 0, 0);
  if (!FULL) spoil(g, C, M, -31, 35, 9, 5);                                                                            // (the full mine's yard is swept: its spoil is in the cart)
  if (C.polish) { // secondary detail: iron straps on the posts, pegs through the wing walls, a pick and a shovel leaning on the east post, a pale stone step at the mouth
    for (const sx of [-1, 1]) for (const y of [5, 14]) add(g, rbox(4.6, 0.9, 0.5, 0.1), C.iron, sx * PX + (EMPTY && sx < 0 ? -1.8 + (y - 10) * 0.17 : 0), y, PZ + 2.2, 0, 0, EMPTY && sx < 0 ? 0.17 : 0);
    for (const sx of [-1, 1]) for (const x of [-1.8, 1.8]) add(g, cyl(0.5, 0.5, 1.2, 6), C.iron, sx * (PX + 4.6) + x, 7.2, PZ - 1.0);
    if (!EMPTY) { limb(g, [PX + 4.5, 0.4, PZ + 7], [PX + 3.2, 12, PZ + 2.6], 0.5, M.timberDark); add(g, rbox(4.0, 1.2, 1.2, 0.3), C.iron, PX + 3.1, 12.2, PZ + 2.5, 0, 0, 0.3); limb(g, [PX + 7.5, 0.4, PZ + 6], [PX + 5.8, 11, PZ + 2.8], 0.5, M.timberDark); add(g, rbox(2.4, 3.0, 0.5, 0.2), C.iron, PX + 7.7, 1.7, PZ + 6.4, 0.5, 0, 0); }
    add(g, rbox(MW + 6, 1.0, 3.8, 0.2), M.rockPale, 0, 0.5, PZ + 2.8);
  }
  g.scale.setScalar(MINE_SCALE);
  return g;
}
