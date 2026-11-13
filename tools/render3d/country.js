// The countryside's ground family (the re-theme, 2026-11-10; STYLE.md's draft rules in the review's notes): the gold
// outcrop in four stages and four variants, the scenery props under the names src/client/scenery.js places, and
// construction and rubble for each people (the kingdom in timber and stone, the Expedition in planks, stone, cable
// and a hoist). Same conventions as models.js: game units (1 tile = 32), y up, +z south; fields and sites centered
// on their footprint. Not in the atlas: retheme.js renders it by filter (`rt_*` names) for
// tools/art/retheme-ground.mjs; the build step gives these the game's names (shard_k_v, doodad_*, foundation_n, ...).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { torus, cone } from './vael.js';
import { ashlarTex, ashlarBump, earthTex } from './kingdom.js';
import { polishTextures } from './polish.js';

let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const std = (o) => new THREE.MeshStandardMaterial(o);
const lump = (r) => new THREE.DodecahedronGeometry(r, 0);
/** The countryside's own materials: gray rock, the gold (the coins' light yellow, white glints, a darker shade in the
 *  veins' shadow), earth, leaves and bark, fieldstone, a puddle, flowers. Nothing team, nothing lit but the glints.
 *  `countryPolish(true)` swaps in the polished copy (`polishCountryMats`); the plain set is never changed. */
export const CMATS = {
  rock: std({ color: 0x6e6c66, roughness: 0.9, metalness: 0.02, flatShading: true }),                 // (round 1: 0x86847e lit near white and read as pale crystals beside the gold)
  rockDark: std({ color: 0x4a4844, roughness: 0.95, metalness: 0.02, flatShading: true }),
  rockPale: std({ color: 0x9a988e, roughness: 0.85, metalness: 0.02, flatShading: true }),
  gold: std({ color: 0xf0c850, metalness: 0.6, roughness: 0.35, flatShading: true }),
  goldDark: std({ color: 0xb48c2c, metalness: 0.6, roughness: 0.5, flatShading: true }),
  glint: std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7 }),
  foot: std({ color: 0x2e2a24, roughness: 1, metalness: 0, flatShading: true }),                // a dark footing under each lump
  earth: std({ color: 0x66604f, map: earthTex, roughness: 1 }),                                  // dug earth: the dirt's color
  earthDark: std({ color: 0x3e3a32, roughness: 1, flatShading: true }),                          // a dug hollow
  pit: std({ color: 0x1a1816, roughness: 1 }),                                                   // the mined-out pit's bottom
  leaf: std({ color: 0x38602a, roughness: 0.9 }),                                                 // (the art polish, 2026-11-13: smooth, a step darker; flat-shaded facets read as a cartoon)
  leafLight: std({ color: 0x4e7a34, roughness: 0.9 }),
  leafDark: std({ color: 0x24401c, roughness: 0.95 }),
  bark: std({ color: 0x4a3826, roughness: 0.95 }),
  barkLight: std({ color: 0x7a6248, roughness: 0.9 }),                                           // a cut trunk's rings
  fieldstone: std({ color: 0x7c7466, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 }),   // a ruin's old warm fieldstone (not the kingdom's slate; round 1's pale gray vanished on the hill)
  fieldstoneDark: std({ color: 0x58524a, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.0, roughness: 0.92 }),
  moss: std({ color: 0x5c7a42, roughness: 0.95, flatShading: true }),
  water: std({ color: 0x3c4a56, roughness: 0.2, metalness: 0.35 }),                                // a puddle: dull gray-blue, a little sky in it
  mud: std({ color: 0x4e4a40, roughness: 1 }),
  flower: std({ color: 0xd4ccb4, roughness: 0.85 }),                                               // cream, a notch under linen
  pebble: std({ color: 0x78766e, roughness: 0.9, flatShading: true }),
  timberFresh: std({ color: 0x9c7e56, roughness: 0.82 }),                                          // fresh-cut building timber (the kingdom's oak is dark, the scaffold must read against the grass)
  timberGrey: std({ color: 0x8c7e68, roughness: 0.85 }),                                           // the Expedition's scaffold: weathered timber the locals brought (round 1's Harbor timber went near black)
  postWhite: std({ color: 0xdcdedb, metalness: 0.3, roughness: 0.5 }),                             // the Expedition's scaffold since the art polish (2026-11-13): white steel posts
  strip: std({ color: 0x000000, emissive: 0x00d4ff, emissiveIntensity: 0.9 }),                      // its cyan strip light (the Data center's neon)
  stripHalo: new THREE.MeshBasicMaterial({ color: 0x18d0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  mortar: std({ color: 0xb0aca0, roughness: 1 }),
  clothDull: std({ color: 0x4a4740, roughness: 0.95 }),                                            // a dead building's cloth, grayed
  iron: std({ color: 0x3a3c40, metalness: 0.6, roughness: 0.5 }),                                   // a cart's tyres, pegs (defined always, used by the polish)
  soot: std({ color: 0x2e2a26, roughness: 1 }),                                                     // the scorched ground under rubble (the polish)
};
/** The polish's scorched ground under a heap of rubble: a cluster of small lobed patches of soot with its own random
 *  draws (the heap's layout stays), overlapping into one broken, ragged patch about `R` across (the judge on the first
 *  pass: one wobbly patch read as a hard-edged mud puddle). Marked ground. */
function sootPatch(g, C, R, seed) {
  let t = seed; const r2 = () => ((t = (t * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 7; k++) {
    const a = r2() * 6.3, d = k ? (0.2 + r2() * 0.4) * R : 0, rr = (k ? 0.2 + r2() * 0.18 : 0.42) * R;
    ground(add(g, patch(wob(rr, 1.8, r2() * 6), 0.8, 0.25 + k * 0.01), C.soot, Math.cos(a) * d, 0, Math.sin(a) * d * 0.8));
  }
}
let POLISHED = null;
/** The polished copy of CMATS (the slice's recipe, polish.js: the same textures and the same numbers): gold at the
 *  coins' tight bright glint (roughness 0.25, env x2, a scuff bump), scuffs on the rock, grain on bark and timber, the
 *  fieldstone's courses redrawn for 1x (`hiAshlar`, as the walls), a glint on the puddle. Colors do not move. */
function polishCountryMats() {
  const X = polishTextures(), P = {}, bump = (m, map, k) => { m.bumpMap = map; m.bumpScale = k; m.needsUpdate = true; };
  for (const [k, m] of Object.entries(CMATS)) P[k] = m.clone();
  for (const k of ['gold', 'goldDark']) { P[k].roughness = 0.25; P[k].envMapIntensity = 2.0; bump(P[k], X.scuff, 0.2); }
  for (const k of ['rock', 'rockDark', 'rockPale', 'pebble']) bump(P[k], X.scuff, 0.7);
  bump(P.bark, X.grain, 0.8); bump(P.barkLight, X.grain, 0.6); bump(P.timberFresh, X.grain, 0.8); bump(P.timberGrey, X.grain, 0.8);
  for (const [k, c] of [['timberFresh', 0x5e4a30], ['timberGrey', 0x5e564a]]) { P[k].color.setHex(c); P[k].roughness = 1; P[k].metalness = 0; P[k].envMapIntensity = 0; } // the scaffolds' and sills' timber three steps darker and matte (no specular, no environment) under the polish: thin poles are all lit edge under its key, fill and rim gain, and the plain timber went to a luminance of 200 (cream), then read as glossy copper and chromed pipe (the judge); matte wood, like the hall's timber
  for (const k of ['fieldstone', 'fieldstoneDark']) { P[k].map = X.hiAshlar; bump(P[k], ashlarBump, 2.0); }
  P.water.roughness = 0.15; P.water.envMapIntensity = 2.5; P.water.needsUpdate = true;
  P.polish = true;
  return P;
}
const cm = (on) => (on ? (POLISHED ??= polishCountryMats()) : CMATS);
let CM = CMATS;
/** Picks the plain or the polished country materials for the gold and the scenery (retheme.js calls it with the
 *  render's `polish`); the sites follow their people's set (`K.polish` / `E.polish`). */
export function countryPolish(on) { CM = cm(!!on); }
/** The country's current set (plain or polished, as `countryPolish` left it): the mine (mine.js) draws with it. */
export const countryMats = () => CM;
/** A flat uneven patch (ground.js's): an outline of radius R wobbling by `amp`, squashed to `sq`, `h` thick. */
const wob = (R, amp, ph) => (a) => R * (1 + amp * (0.13 * Math.sin(3 * a + ph) + 0.08 * Math.sin(5 * a + ph * 1.7) + 0.05 * Math.sin(9 * a + ph * 2.3)));
/** Marks a mesh as the ground itself (an earth plate, a hollow, a puddle): the polish's contact shadow (scene.js
 *  `depthPass`) leaves it out of the depth, so nothing rings it and what stands on it still casts its ellipse. */
const ground = (m) => { m.userData.ground = true; return m; };
function patch(edge, sq, h) {
  const sh = new THREE.Shape();
  for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 2, r = edge(a), x = Math.cos(a) * r, z = Math.sin(a) * r * sq; k ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2); geo.computeVertexNormals(); return geo;
}

// ---------------- the gold ----------------
/** The outcrops' four variants, each its own lumps `[x, z, r, h]` (one tile is 32 across), turn and seed, as the
 *  old fields': 0 one big lump among five, 1 a spread of medium ones, 2 a low bed of small ones, 3 two tall and a few small. */
const GOLD_VARIANTS = [
  { turn: 0, seed: 31, cl: [[0, -2, 7.5, 11], [-11, 4, 5, 6.5], [10, 5, 5, 7], [-4, 10, 3.8, 4.5], [8, -9, 4, 5]] },
  { turn: 1.9, seed: 47, cl: [[-8, -2, 5.5, 7.5], [5, -6, 5.5, 8], [7, 6, 5, 6.5], [-3, 8, 4.2, 5], [-13, 7, 3.4, 4]] },
  { turn: 4.1, seed: 59, cl: [[-9, 0, 4.2, 4.5], [-2, 5, 4.4, 5], [4, -2, 4.6, 5.5], [10, 4, 3.8, 4], [1, -9, 3.6, 4], [-10, -8, 3.2, 3.5], [11, -5, 3.2, 3.5]] },
  { turn: 0.8, seed: 73, cl: [[-4, 1, 6.5, 12], [5, -3, 6, 10.5], [-11, -6, 3.6, 4.5], [10, 6, 3.8, 5], [1, 10, 3.4, 4]] },
];
export const GOLD_VARIANT_COUNT = GOLD_VARIANTS.length;
/** One lump of gray rock with gold in it: a flat-shaded lump on a dark foot, a thick vein in one piece over its top
 *  and down its south face (one big gold shape at phone size, not flecks: the slice's outcrop read as a gray rock
 *  with yellow flecks), nuggets on the lit top with a white glint each. `k` scales the gold (a worked lump has less). */
function goldLump(r, h, k = 1) {
  const c = grp();
  add(c, cyl(r * 1.05, r * 1.25, 0.7, 9), CM.foot, 0, 0.25, 0);
  const m = add(c, lump(r), CM.rock, 0, h * 0.5, 0, rnd() * 0.4 - 0.2, rnd() * 3, rnd() * 0.3 - 0.15); m.scale.set(1, h / r * 0.62, 0.92);
  add(c, lump(r * 0.55), CM.rockDark, -r * 0.45, h * 0.28, r * 0.4, rnd(), rnd() * 3, 0).scale.set(1, 0.7, 1);
  if (k > 0) {
    const g = grp(); g.rotation.y = (rnd() - 0.5) * 0.8; c.add(g);
    add(g, rbox(r * 1.5 * k, h * 0.32, r * 0.8, 0.3), CM.gold, 0, h * 0.84, r * 0.05, 0.25, 0, 0.1);                  // the cap vein over the top: the big gold shape
    add(g, rbox(r * 0.75 * k, h * 0.7, r * 0.45, 0.25), CM.gold, r * 0.15, h * 0.42, r * 0.62, 0.45, 0, 0);           // the vein down the south face
    add(g, rbox(r * 0.5 * k, h * 0.36, r * 0.35, 0.2), CM.goldDark, -r * 0.5, h * 0.38, r * 0.55, 0.4, 0.3, 0);       // its shaded side
    for (let i = 0; i < 2 + Math.round(r * 0.5 * k); i++) {                                                            // nuggets on the lit top, a glint each
      const a = rnd() * 6.3, d = rnd() * r * 0.55, nr = (1.1 + rnd() * 0.9) * Math.min(1, k + 0.3);
      add(g, lump(nr), CM.gold, Math.cos(a) * d, h * 0.95 + nr * 0.3, Math.sin(a) * d * 0.8 - r * 0.1, rnd(), rnd(), rnd());
      add(g, sph(nr * 0.32, 6, 4), CM.glint, Math.cos(a) * d - nr * 0.35, h * 0.95 + nr * 0.85, Math.sin(a) * d * 0.8 - r * 0.1 - nr * 0.3);
    }
  }
  return c;
}
/** A gold outcrop (`rt_gold_<stage>_<v>`; the game's `shard_k` / `shard_k_v`): gray rock with gold showing, readable
 *  from full to mined out by its shape. 0 full: the variant's lumps, veins and nuggets, loose nuggets round them;
 *  1 worked: the larger half of the lumps, lower, the veins thinner, two dug hollows; 2 low: no standing lump, broken
 *  slabs of rock over dug earth, a few nuggets left in the soil; 3 nearly gone: a dark pit in a broken rim of rock,
 *  one nugget. No apron of their own (the client's bed goes under a clump); a dark foot under each lump. */
export function goldField(stage, v = 0) {
  const g = grp(), V = GOLD_VARIANTS[v % GOLD_VARIANTS.length]; s = V.seed;
  const body = grp(); body.rotation.y = V.turn; g.add(body);
  const loose = (n, spread) => { for (let k = 0; k < n; k++) { const nr = 0.8 + rnd() * 0.7; add(body, lump(nr), CM.gold, (rnd() - 0.5) * spread, nr * 0.5, (rnd() - 0.5) * spread * 0.8, rnd(), rnd() * 3, rnd()); } };
  if (stage < 2) {
    const big = [...V.cl].sort((a, b) => b[3] - a[3]), keep = stage ? big.slice(0, Math.ceil(big.length / 2)) : V.cl, k = stage ? 0.78 : 1;
    keep.forEach(([x, z, r, h]) => { const c = goldLump(r * k * 1.25, h * k * 1.3, stage ? 0.6 : 1); c.position.set(x * 1.35, 0, z * 1.35); c.rotation.y = rnd() * 3; body.add(c); });
    loose(stage ? 3 : 5, 32);
    if (stage) for (let j = 0; j < 2; j++) ground(add(body, patch(wob(4 + rnd() * 1.5, 1.3, rnd() * 6), 0.8, 0.4), CM.earthDark, 8 - j * 15 + rnd() * 3, 0.05, 6 - j * 11));   // dug hollows
  } else if (stage === 2) {
    ground(add(body, patch(wob(11, 1.2, 1.1 + v), 0.8, 0.35), CM.earth, 0, 0.05, 0));                                  // dug earth where the lumps stood
    ground(add(body, patch(wob(5, 1.5, 2 + v), 0.8, 0.3), CM.earthDark, 2, 0.4, -1));
    const n = 6 + (v % 2) * 2;
    for (let k = 0; k < n; k++) {                                                                                      // broken slabs of rock, a little tilted
      const a = k / n * Math.PI * 2 + rnd() * 0.4, d = k < 2 ? 2 + rnd() * 2 : 6 + rnd() * 4, w = 3.5 + rnd() * 2.5;
      add(body, rbox(w, 1 + rnd() * 0.8, w * (0.6 + rnd() * 0.3), 0.3), k % 3 ? CM.rock : CM.rockDark, Math.cos(a) * d, 0.6, Math.sin(a) * d * 0.8, (rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3);
    }
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.3, d = 2 + rnd() * 6, nr = 1 + rnd() * 0.6; add(body, lump(nr), CM.gold, Math.cos(a) * d, nr * 0.5, Math.sin(a) * d * 0.8, rnd(), rnd(), rnd()); add(body, sph(nr * 0.3, 6, 4), CM.glint, Math.cos(a) * d - nr * 0.3, nr * 1.05, Math.sin(a) * d * 0.8 - nr * 0.3); }
  } else {
    const pit = wob(10, 1.2, 0.7 + v * 1.3);
    ground(add(body, patch(pit, 0.8, 0.3), CM.earthDark, 0, 0, 0));
    ground(add(body, patch(wob(6, 1.6, 2.1 + v), 0.75, 0.2), CM.pit, 1, 0.3, 0.5));                                    // the pit's dark bottom
    for (let k = 0; k < 11; k++) {                                                                                     // the rim: broken rock, a gap here and there
      if (k % 5 === (v + 3) % 5) continue;
      const a = k / 11 * Math.PI * 2 + (rnd() - 0.5) * 0.25, w = 2.5 + rnd() * 2.5, r = pit(a) - 0.5;
      add(body, rbox(w, 1 + rnd() * 1.2, 1.6 + rnd() * 1.2, 0.3), k % 3 === 1 ? CM.rockDark : CM.rock, Math.cos(a) * r, 0.6, Math.sin(a) * r * 0.8, (rnd() - 0.5) * 0.2, -a + Math.PI / 2, (rnd() - 0.5) * 0.2);
    }
    add(body, lump(1.1), CM.gold, -3, 0.6, 3, 0.3, 0.6, 0.2); add(body, sph(0.35, 6, 4), CM.glint, -3.3, 1.3, 2.7);  // one nugget left
  }
  return g;
}

// ---------------- the scenery ----------------
/** A single tree (`boulders_v`, solid): a trunk with roots and a crown of flat-shaded leaf balls, the top one lit.
 *  0 a round oak, 1 a tall narrow one, 2 a lopsided one forked at the base. */
export function tree(v) {
  const g = grp(); s = 101 + v * 17;
  const H = v === 1 ? 14 : 10, R = v === 1 ? 6 : 8.5;
  const trunk = (x, z, h, lean) => { add(g, cyl(1.2, 1.9, h, 8), CM.bark, x, h / 2, z, 0, 0, lean); for (let k = 0; k < 3; k++) { const a = k / 3 * 6.3 + 0.4; limb(g, [x, 1, z], [x + Math.cos(a) * 3.2, 0.2, z + Math.sin(a) * 3.2], 0.55, CM.bark); } };
  trunk(0, 0, H, 0); if (v === 2) trunk(2.5, 1.5, H * 0.8, -0.3);
  const balls = v === 1 ? [[0, H + 2, 0, R], [0, H + 8, 0, R * 0.85], [0, H + 13, 0, R * 0.6], [-2, H + 5, 1, R * 0.7], [2, H + 9, -1, R * 0.6]]
    : v === 2 ? [[-1, H + 3, 0, R], [5, H + 1, 2, R * 0.75], [2, H + 7, -1, R * 0.8], [-5, H + 5, -2, R * 0.65], [1, H + 10, 1, R * 0.55]]
      : [[0, H + 4, 0, R], [-5, H + 2, 2, R * 0.75], [5, H + 3, -2, R * 0.75], [1, H + 9, 1, R * 0.7], [-2, H + 6, -5, R * 0.6]];
  balls.forEach(([x, y, z, r], k) => add(g, sph(r * 1.08, 14, 10), k === balls.length - 1 || (k === 3) ? CM.leafLight : k % 2 ? CM.leaf : CM.leafDark, x, y, z, rnd() * 3, rnd() * 3, 0)); // (round, smooth balls a little bigger, so they merge into one canopy: the art polish)
  return g;
}
/** A rock spire (`spire_v`, solid): stacked lumps of gray rock narrowing to a pale top, leaning a little, a smaller
 *  one beside it and scree at the foot. */
export function spire(v) {
  const g = grp(); s = 211 + v * 23;
  const tower = (x, z, h, lean, n) => { const p = grp(); p.position.set(x, 0, z); p.rotation.set(0, rnd() * 3, lean); g.add(p); for (let k = 0; k < n; k++) { const t = k / (n - 1), r = (5.5 - t * 3.2) * (h / 26); add(p, lump(r), k === n - 1 ? CM.rockPale : k % 2 ? CM.rock : CM.rockDark, (rnd() - 0.5) * 1.5, t * h, (rnd() - 0.5) * 1.5, rnd(), rnd() * 3, rnd() * 0.3).scale.y = 0.75; } };
  tower(0, 0, v ? 30 : 24, 0.08, 5); tower(v ? -8 : 7, v ? 4 : -3, v ? 14 : 12, -0.15, 3);
  for (let k = 0; k < 6; k++) { const a = rnd() * 6.3, d = 6 + rnd() * 7; add(g, lump(1.2 + rnd() * 1.4), k % 2 ? CM.rock : CM.rockDark, Math.cos(a) * d, 0.7, Math.sin(a) * d * 0.8, rnd(), rnd(), 0).scale.y = 0.6; }
  return g;
}
/** A ruined wall (`ruin_v`, solid): an L of old fieldstone two courses high, its top broken in steps, a doorway gap
 *  (v 1), fallen blocks and moss at its foot. */
export function ruinWall(v) {
  const g = grp(); s = 307 + v * 29;
  const seg = (x0, z0, x1, z1, h, mat = CM.fieldstone) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0); add(g, rbox(L, h, 3.6, 0.3), mat, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0, -a, 0); };
  seg(-12, -6, 2, -6, 7); seg(2, -6, 8, -6, 4.5, CM.fieldstoneDark); if (!v) seg(8, -6, 13, -6, 7.5); else seg(10, -6, 13, -6, 6);
  seg(-12, -6, -12, 6, 5.5); if (v) seg(-12, 6, -4, 8, 3.5, CM.fieldstoneDark);
  for (let k = 0; k < 5; k++) add(g, rbox(3 + rnd() * 2, 2 + rnd(), 2.4, 0.3), k % 2 ? CM.fieldstone : CM.fieldstoneDark, -6 + rnd() * 16, 1, -1 + rnd() * 8, 0, rnd() * 3, (rnd() - 0.5) * 0.4);   // fallen blocks
  for (let k = 0; k < 3; k++) add(g, sph(1.6 + rnd(), 7, 5), CM.moss, -10 + rnd() * 20, 0.3, -4 + rnd() * 2).scale.y = 0.35;
  add(g, sph(2.2, 7, 5), CM.moss, -11.5, 5.5, -2).scale.set(0.6, 0.5, 1);                                              // moss on the wall's top
  return g;
}
/** An old cart (`wreck_v`, solid): a plank bed on an axle between two big spoked wheels, its shafts down on the
 *  ground; v 1 tipped on its side, a wheel off and leaning on it. */
export function cart(v) {
  const g = grp(); s = 503 + v * 37;
  const wheel = (p, x, y, z, rx, rz) => {
    const w = grp(); w.position.set(x, y, z); w.rotation.set(rx, 0, rz); p.add(w); add(w, torus(5.2, 0.8, Math.PI * 2, 20), CM.bark, 0, 0, 0, 0, Math.PI / 2, 0); add(w, cyl(1.2, 1.2, 1.6, 8), CM.barkLight, 0, 0, 0, 0, 0, Math.PI / 2); for (let k = 0; k < 6; k++) add(w, rbox(0.7, 9.6, 0.7, 0.2), CM.barkLight, 0, 0, 0, k / 6 * Math.PI, 0, 0);
    if (CM.polish) { add(w, torus(5.9, 0.42, Math.PI * 2, 24), CM.iron, 0, 0, 0, 0, Math.PI / 2, 0); add(w, cyl(0.55, 0.55, 2.4, 8), CM.iron, 0, 0, 0, 0, 0, Math.PI / 2); } // secondary detail: an iron tyre round the rim and a hub pin
  };
  const body = grp(); g.add(body);
  if (!v) { body.position.y = 5.8; body.rotation.y = 0.5; }
  else { body.position.set(0, 4.5, 0); body.rotation.set(1.25, 0.3, 0); }
  add(body, rbox(16, 1, 9, 0.3), CM.bark, 0, 0, 0);                                                                     // the bed
  for (const z of [-4.2, 4.2]) add(body, rbox(16, 3, 0.8, 0.2), CM.barkLight, 0, 1.8, z);                                // the sides, slatted
  for (const x of [-5, 0, 5]) for (const z of [-4.2, 4.2]) add(body, rbox(1, 3.4, 1, 0.2), CM.bark, x, 2, z);
  add(body, rbox(1.2, 1.2, 12, 0.3), CM.bark, 0, -1, 0);                                                                // the axle
  if (!v) { wheel(body, 0, -0.3, -6.6, 0, 0); wheel(body, 0, -0.3, 6.6, 0, 0); for (const z of [-3, 3]) limb(body, [8, -0.5, z], [19, -5.5, z], 0.55, CM.barkLight); }   // the shafts, down to the ground
  else { wheel(body, 0, -0.3, 6.6, 0, 0); wheel(g, 9, 2.5, 6, 0.4, 1.1); for (const z of [-3, 3]) limb(body, [8, -0.5, z], [17, -2, z], 0.55, CM.barkLight); }
  for (let k = 0; k < 3; k++) add(g, rbox(5 + rnd() * 3, 0.6, 1.6, 0.2), CM.barkLight, (rnd() - 0.5) * 20, 0.3, 6 + rnd() * 6, 0, rnd() * 3, 0);   // planks fallen off
  return g;
}
/** A stump (`crater_0`, flat): a cut trunk with its rings pale, roots, chips; walked over. */
export function stump(v) {
  const g = grp(); s = 401 + v * 31;
  add(g, cyl(3.2, 3.9, 2.8, 10), CM.bark, 0, 1.4, 0);
  add(g, cyl(3.0, 3.0, 0.4, 10), CM.barkLight, 0, 2.9, 0);
  for (let k = 0; k < 2; k++) add(g, torus(1 + k * 1.1, 0.12, Math.PI * 2, 16), CM.bark, 0, 3.12, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.3 + 0.6; limb(g, [0, 0.8, 0], [Math.cos(a) * 5.5, 0.15, Math.sin(a) * 5.5], 0.6, CM.bark); }
  for (let k = 0; k < 3; k++) add(g, rbox(2 + rnd() * 1.5, 0.5, 1 + rnd(), 0.15), CM.barkLight, (rnd() - 0.5) * 16, 0.25, (rnd() - 0.5) * 12, 0, rnd() * 3, 0);   // chips
  return g;
}
/** A puddle (`crater_1`, flat): a lobed film of dull gray-blue water in a mud hollow, two stones at its edge, no
 *  rim and no rings; walked over. */
export function puddle(v) {
  const g = grp(); s = 431 + v * 31;
  const lobes = [[0, 0, 8, 5], [6, 2, 5, 3.6], [-6, -1.5, 4.5, 3.2], [2, -3, 3.6, 2.6]];
  const outline = (grow, y) => { const sh = new THREE.Shape(); for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let best = 0; for (const [x, z, rx, rz] of lobes) for (let t = 0; t < 16; t += 0.2) if (((dx * t - x) / (rx + grow)) ** 2 + ((dz * t - z) / (rz + grow)) ** 2 <= 1) best = Math.max(best, t); k ? sh.lineTo(dx * best, -dz * best) : sh.moveTo(dx * best, -dz * best); } const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0); return geo; };
  ground(add(g, outline(1.6, 0.25), CM.mud, 0, 0, 0));
  ground(add(g, outline(0, 0.4), CM.water, 0, 0, 0));
  for (let k = 0; k < 2; k++) { const [x, z, rx, rz] = lobes[k], a = rnd() * 6.3; add(g, lump(1.3 + rnd()), CM.pebble, x + Math.cos(a) * rx, 0.5, z + Math.sin(a) * rz, rnd(), rnd(), 0).scale.y = 0.55; }
  return g;
}
/** A flower patch (`debris_0`, flat): a few cream flower heads over leaf tufts, spread wide and low; walked over. */
export function flowers(v) {
  const g = grp(); s = 601 + v * 41;
  for (let k = 0; k < 8 + v * 2; k++) {
    const x = (rnd() - 0.5) * 24, z = (rnd() - 0.5) * 18;
    add(g, sph(1.3 + rnd() * 0.6, 7, 5), k % 2 ? CM.leaf : CM.leafDark, x, 0.3, z).scale.y = 0.45;
    add(g, sph(0.75, 6, 4), CM.flower, x + 0.3, 1.5, z - 0.2);
    if (k % 3 === 0) add(g, sph(0.6, 6, 4), CM.flower, x - 1.1, 1.3, z + 0.8);
  }
  return g;
}
/** A small stone pile (`debris_1`, flat): rounded gray stones heaped low with a few pebbles; walked over. */
export function stonePile(v) {
  const g = grp(); s = 651 + v * 43;
  for (let k = 0; k < 6 + v; k++) { const a = rnd() * 6.3, d = k ? 2 + rnd() * 3.5 : 0, r = k ? 1.3 + rnd() * 0.9 : 2.3; add(g, lump(r), k % 3 ? CM.rock : CM.rockDark, Math.cos(a) * d, r * 0.5, Math.sin(a) * d * 0.8, rnd(), rnd() * 3, rnd()).scale.y = 0.7; }
  for (let k = 0; k < 4; k++) { const a = rnd() * 6.3, d = 5 + rnd() * 5; add(g, sph(0.8 + rnd() * 0.5, 7, 5), CM.pebble, Math.cos(a) * d, 0.3, Math.sin(a) * d * 0.8).scale.y = 0.5; }
  return g;
}
/** [name, model, radius (game units), height]: the props under the old names (the client's scatter stays as it is). */
export const RT_SCENERY = {
  rock: [['boulders_0', () => tree(0), 14, 30], ['boulders_1', () => tree(1), 12, 36], ['boulders_2', () => tree(2), 16, 30],
    ['spire_0', () => spire(0), 16, 32], ['spire_1', () => spire(1), 16, 38], ['ruin_0', () => ruinWall(0), 18, 12], ['ruin_1', () => ruinWall(1), 18, 12],
    ['wreck_0', () => cart(0), 22, 14], ['wreck_1', () => cart(1), 20, 16]],
  ground: [['crater_0', () => stump(0), 12, 5], ['crater_1', () => puddle(1), 14, 3], ['debris_0', () => flowers(0), 16, 3], ['debris_1', () => stonePile(1), 12, 4]],
};

// ---------------- construction and rubble ----------------
/** A string line on pegs round a site `h` from its center (the Harbor's), the pegs in `peg` and the line in `rope`. */
function stringLine(g, h, peg, rope) {
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, cyl(0.55, 0.7, 5, 8), peg, x * (h - 4), 2.5, z * (h - 4));
  for (const [x, z, rot] of [[0, -(h - 4), 0], [0, h - 4, 0], [-(h - 4), 0, Math.PI / 2], [h - 4, 0, Math.PI / 2]]) add(g, rbox((h - 4) * 2, 0.25, 0.25, 0.1), rope, x, 4.6, z, 0, rot, 0);
}
/** Scaffold poles round a site: `n` bays a side, lashed with rope at the top ledger, two ledgers, rope braces. With
 *  `polish`, the lashings at the middle ledger too and a ladder leaning on the south face (the polish's secondary
 *  detail: at 2x a scaffold with a ladder is a scaffold). */
function poles(g, n, W, H, timber, rope, polish = false) {
  const h = W / 2, ps = [];
  for (let x = -h; x <= h + 0.1; x += W / Math.max(2, n)) for (const z of [-h, h]) ps.push([x, z], [z, x]);
  for (const [x, z] of ps) { add(g, cyl(rope ? 0.9 : 1.1, rope ? 1.1 : 1.1, H + 2, 8), timber, x, (H + 2) / 2, z, rope ? (rnd() - 0.5) * 0.04 : 0, 0, rope ? (rnd() - 0.5) * 0.04 : 0); if (rope) { add(g, torus(1.25, 0.3, Math.PI * 2, 12), rope, x, H - 0.6, z, Math.PI / 2); if (polish) add(g, torus(1.25, 0.3, Math.PI * 2, 12), rope, x, H * 0.5 + 0.9, z, Math.PI / 2); } } // (no rope: the Expedition's steel posts, straight and bare)
  for (const y of [H * 0.5, H]) for (const [x, z, rot] of [[0, -h, 0], [0, h, 0], [-h, 0, Math.PI / 2], [h, 0, Math.PI / 2]]) add(g, rbox(W + 2, 1.2, 1.2, 0.4), timber, x, y, z, 0, rot, 0);
  if (polish) ladder(g, h * 0.45, h + 4.5, h + 0.6, H + 1.5, timber);                                                     // (the art polish, 2026-11-13: the diagonal rope braces went, both peoples')
  return h;
}
/** A ladder from the ground at (x, z0) leaning to the top ledger at (x, z1, y1): two rails and a rung every 3 units. */
function ladder(g, x, z0, z1, y1, timber) {
  for (const dx of [-1.3, 1.3]) limb(g, [x + dx, 0.2, z0], [x + dx, y1, z1], 0.4, timber);
  const n = Math.floor(y1 / 3); for (let k = 1; k <= n; k++) { const t = k / (n + 0.5); add(g, rbox(3.0, 0.5, 0.5, 0.15), timber, x, y1 * t, z0 + (z1 - z0) * t); }
}
/** A team cloth hung from the top ledger on the north side, facing the camera (round 1's on the east side was
 *  edge-on from the south and gave no share), `len` long along x, `h` tall, between two ink hems. */
function hungCloth(g, M, x, y, z, len, h) {
  add(g, rbox(len, h, 0.5, 0.15), M.cloth === M.paintCanvas ? M.cloth : M.paintCloth, x, y, z);   // (the kingdom's team cloth, or the Expedition's team canvas: makeMats' plain `cloth` is the Harbour's dark one)
  add(g, rbox(len + 0.2, 0.6, 0.6, 0.1), M.inkLine, x, y + h / 2 + 0.2, z);
  add(g, rbox(len + 0.2, 0.6, 0.6, 0.1), M.inkLine, x, y - h / 2 - 0.2, z);
}
/** A team pennant on a pole's top (the art polish: 8 x 4.6, a flag; the hung banner went). */
function pennant(g, M, x, y, z) {
  add(g, rbox(8, 4.6, 0.5, 0.1), M.cloth === M.paintCanvas ? M.cloth : M.paintCloth, x + 4.1, y + 2.4, z);
  add(g, rbox(8.2, 0.4, 0.6, 0.1), M.inkLine, x + 4.1, y, z); add(g, rbox(8.2, 0.4, 0.6, 0.1), M.inkLine, x + 4.1, y + 4.8, z);
}

/** The kingdom's foundation (`rt_kg_foundation_n`): a sill of fresh-cut timber pegged round the site, stone footings
 *  at the corners and the first course of ashlar laid along the south side, a string line, a pile of cut blocks, a
 *  mortar tub and a stack of planks. `K`: makeKingdomMats. */
export function foundationKg(n, K) {
  const g = grp(), W = n * 32 - 6, h = W / 2, C = cm(K.polish); s = 71 + n;
  for (const [x, z, rot] of [[0, -h, 0], [0, h, 0], [-h, 0, Math.PI / 2], [h, 0, Math.PI / 2]]) add(g, rbox(W, 2.2, 2.6, 0.5), C.timberFresh, x, 1.1, z, 0, rot, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(5, 3, 5, 0.3), K.plinth, x * h, 1.5, z * h);
  for (let k = 0; k < n * 2 + 1; k++) add(g, rbox(5, 2.4, 3.2, 0.3), K.wall, -h + 6 + k * 5.6, 3.4, h, 0, 0, 0);          // the first course, south
  stringLine(g, h, C.timberFresh, K.rope);
  for (let k = 0; k < 2 + n; k++) add(g, rbox(5, 2.6, 4, 0.3), k % 2 ? K.wall : K.wallDark, h - 7 + (k % 2) * 3 - 1.5, 1.3 + Math.floor(k / 2) * 2.7, -h + 7 + (k % 2) * 1.5, 0, (rnd() - 0.5) * 0.3, 0);   // cut blocks piled
  add(g, cyl(3, 2.6, 3, 10), K.oak, -h + 8, 1.5, -h + 7); add(g, cyl(2.6, 2.6, 0.4, 10), C.mortar, -h + 8, 3.1, -h + 7);   // the mortar tub
  for (let k = 0; k < 3; k++) add(g, rbox(12, 1, 3, 0.3), C.timberFresh, 0, 0.5 + k * 1.1, h - 7 + k * 0.3, 0, (k - 1) * 0.05, 0);
  if (K.polish) { // secondary detail: the second course begun at the west end (three blocks, staggered), iron pegs through the sills at the corners
    for (let k = 0; k < 3; k++) add(g, rbox(5, 2.4, 3.2, 0.3), k % 2 ? K.wallDark : K.wall, -h + 8.8 + k * 5.6, 5.8, h, 0, 0, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, cyl(0.5, 0.5, 4.4, 8), C.iron, x * (h - 4.6), 2.2, z * h);
  }
  return g;
}
/** The kingdom's scaffold (`rt_kg_scaffold_n`): fresh timber poles lashed with rope, two ledgers, rope braces, a plank
 *  walk on the top ledger north and east, a team cloth hung on the east side and a team pennant. No shadow. */
export function scaffoldKg(n, K) {
  const g = grp(), W = n * 32 - 8, H = 10 + n * 6, C = cm(K.polish); s = 81 + n;
  const h = poles(g, n, W, H, C.timberFresh, K.rope, !!K.polish);                                                        // (polish: the middle lashings and a ladder on the south face)
  add(g, rbox(W * 0.72, 0.6, 3.6, 0.1), C.timberFresh, 0, H + 0.9, -h + 1.2); add(g, rbox(3.6, 0.6, W * 0.55, 0.1), C.timberFresh, h - 1.2, H + 0.9, 0);   // the plank walk
  pennant(g, K, -h, H + 2.1, -h); pennant(g, K, h - 8.2, H + 2.1, -h);                                                   // (the art polish: two pennants carry the team; the hung cloth over the rising building went)
  return g;
}
/** The kingdom's rubble (`rt_kg_rubble_n`): tumbled ashlar, broken oak beams, slates thrown down, a stub of wall still
 *  standing, a bent iron band and a grayed scrap of cloth: the wreck of a stone-and-timber building. */
export function rubbleKg(n, K) {
  const g = grp(), W = n * 32 - 8, C = cm(K.polish); s = 91 + n;
  const sp = () => (rnd() + rnd() - 1) * W * 0.46;                                                                        // heaped towards the middle (round 1's even spread read as confetti)
  if (K.polish) sootPatch(g, C, W * 0.44, 977 + n);                                                                      // secondary detail: the scorched ground under the heap (ground: the contact shadow does not ring it)
  add(g, rbox(8 + n * 2, 4 + n, 3.4, 0.3), K.wall, -W * 0.22, 2 + n / 2, -W * 0.2, 0, 0.3, 0);                            // the stub of wall still standing
  add(g, rbox(2.6, 2.4, 3.4, 0.3), K.wall, -W * 0.22 - 3, 4.5 + n, -W * 0.2 + 1, 0, 0.3, 0);
  add(g, rbox(5 + n, 2.6, 3.4, 0.3), K.wall, W * 0.2, 1.3, W * 0.15, 0, -0.5, 0);                                         // a length of fallen wall
  for (let k = 0; k < n * n + 4; k++) add(g, rbox(4.5 + rnd() * 3.5, 2.4 + rnd() * 1.6, 3.5 + rnd() * 2.5, 0.3), k % 3 ? K.wall : K.wallDark, sp(), 1.2 + rnd() * 2, sp(), (rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.4);
  for (let k = 0; k < n + 2; k++) { const L = 8 + rnd() * (6 + n * 2); add(g, rbox(L, 1.8, 2, 0.3), K.oak, sp(), 1.5 + rnd() * 2.5, sp(), (rnd() - 0.5) * 0.6, rnd() * 3, (rnd() - 0.5) * 0.5); }
  for (let k = 0; k < n + 2; k++) add(g, rbox(6 + rnd() * 3, 0.6, 5 + rnd() * 2, 0.2), K.roof, sp(), 0.5 + rnd() * 2, sp(), (rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
  add(g, torus(3, 0.4, Math.PI * 1.3, 20), K.ironDark, sp() * 0.6, 1.2, sp() * 0.6, Math.PI / 2 - 0.3, rnd() * 3, 0);
  for (let k = 0; k < n - 1; k++) add(g, rbox(7 + rnd() * 4, 0.5, 5 + rnd() * 3, 0.3), C.clothDull, sp() * 0.7, 0.4, sp() * 0.7, 0.08, rnd() * 3, -0.06);
  return g;
}
/** The Expedition's foundation (`rt_ex_foundation_n`): a stone footing laid round the site, planks laid as a floor
 *  over joists on the north half, two cable drums, a crate and a coil of cable, a string line. `E`: makeExpeditionMats. */
export function foundationEx(n, E) {
  const g = grp(), W = n * 32 - 6, h = W / 2; s = 171 + n;
  for (const [x, z, rot] of [[0, -h, 0], [0, h, 0], [-h, 0, Math.PI / 2], [h, 0, Math.PI / 2]]) add(g, rbox(W, 2.4, 3, 0.3), E.stone, x, 1.2, z, 0, rot, 0);
  for (let k = 0; k < 3; k++) add(g, rbox(W - 6, 1.4, 1.6, 0.2), E.oak, 0, 1.2, -h + 5 + k * (h - 6) / 2);                   // joists
  for (let k = 0; k < Math.floor((W - 8) / 3.6) * 0.6; k++) add(g, rbox(3.2, 0.7, h - 6, 0.1), E.deck, -h + 5 + k * 3.6, 2.25, -h / 2 - 0.5);   // the planks laid so far
  stringLine(g, h, E.timber, E.rope);
  const drum = (x, z, up) => { const d = grp(); d.position.set(x, up ? 2.6 : 4.2, z); d.rotation.set(up ? 0 : Math.PI / 2, 0, up ? 0 : 0.4); g.add(d); for (const y of [-2.4, 2.4]) add(d, cyl(4.2, 4.2, 0.6, 14), E.oakPale, 0, y, 0); add(d, cyl(3.4, 3.4, 4.4, 14), E.cable, 0, 0, 0); };
  drum(h - 7, h - 7, true); drum(-h + 7, h - 8, false);
  add(g, rbox(6, 5, 6, 0.4), E.panelDark, h - 7, 2.5, -h + 8, 0, 0.3, 0); add(g, rbox(6.2, 0.8, 0.8, 0.1), E.paleSteel, h - 7, 3.6, -h + 8, 0, 0.3, 0);   // the crate, a pale strap
  add(g, torus(2.6, 0.7, Math.PI * 2, 16), E.cable, 0, 0.7, h - 6, Math.PI / 2);
  if (E.polish) { // secondary detail: a surveyor's tripod by the south-west corner (steel legs, a dark instrument box), steel rims on the upright drum
    const [tx, tz] = [-h + 9, h - 2]; for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.5; limb(g, [tx, 9.5, tz], [tx + Math.cos(a) * 3.2, 0.2, tz + Math.sin(a) * 3.2], 0.45, E.paleSteel); }
    add(g, rbox(2.4, 1.8, 2.4, 0.3), E.panelDark, tx, 10.4, tz, 0, 0.4, 0);
    for (const y of [0.5, 4.7]) add(g, torus(4.25, 0.3, Math.PI * 2, 20), E.paleSteel, h - 7, y, h - 7, Math.PI / 2);
  }
  return g;
}
/** The Expedition's scaffold (`rt_ex_scaffold_n`): timber poles lashed with rope, two ledgers, a plank walk, and a
 *  hoist at one corner: a tall mast with a jib, a steel pulley, a cable down to a crate on the hook; a team flag on
 *  the mast, a team cloth hung on the east side. No shadow. */
export function scaffoldEx(n, E) {
  const g = grp(), W = n * 32 - 8, H = 10 + n * 6, C = cm(E.polish); s = 181 + n;
  const h = poles(g, n, W, H, C.postWhite, null, !!E.polish);                                                             // white steel posts and ledgers, no lashings (the art polish, 2026-11-13: the wooden scaffold with its hoist, cables and crate went; polish: a ladder on the south face)
  add(g, rbox(W * 0.72, 0.6, 3.6, 0.1), E.deck, 0, H + 0.9, -h + 1.2);                                                   // the plank walk
  add(g, rbox(W + 2, 0.7, 0.7, 0.2), C.strip, 0, H + 0.95, h + 0.9); add(g, rbox(W + 2.4, 1.8, 1.8, 0.4), C.stripHalo, 0, H + 0.95, h + 0.9); // the strip light along the south ledger, cyan
  for (const x of [-h, h]) { add(g, rbox(0.7, 0.7, W * 0.6, 0.2), C.strip, x + (x < 0 ? -0.9 : 0.9), H + 0.95, 0); add(g, rbox(1.8, 1.8, W * 0.6, 0.4), C.stripHalo, x + (x < 0 ? -0.9 : 0.9), H + 0.95, 0); } // and along the east and west ledgers
  pennant(g, E, -h, H + 2.1, -h); pennant(g, E, h - 8.2, H + 2.1, -h);                                                   // two team pennants on the north posts
  return g;
}
/** The Expedition's rubble (`rt_ex_rubble_n`): broken planks, a bent panel or two, loops of cable, a drum on its side,
 *  a split crate and the footing's stones: the wreck of a plank-and-stone building with its kit. */
export function rubbleEx(n, E) {
  const g = grp(), W = n * 32 - 8, C = cm(E.polish); s = 191 + n;
  const sp = () => (rnd() + rnd() - 1) * W * 0.46;                                                                        // heaped towards the middle
  if (E.polish) { // secondary detail: the scorched ground under the heap (ground), a twisted strip of pale steel
    sootPatch(g, C, W * 0.44, 1777 + n);
    add(g, rbox(7 + n, 0.5, 0.7, 0.1), E.paleSteel, W * 0.12, 1.6, -W * 0.1, 0.3, 0.8, 0.5);
  }
  for (let k = 0; k < n * n * 2 + 2; k++) { const L = 7 + rnd() * (6 + n * 2); add(g, rbox(L, 1, 2.8 + rnd(), 0.2), k % 3 ? E.deck : E.oak, sp(), 0.6 + rnd() * 2, sp(), (rnd() - 0.5) * 0.6, rnd() * 3, (rnd() - 0.5) * 0.4); }
  for (let k = 0; k < n; k++) {                                                                                           // bent panels: two halves hinged at an angle, a pale edge strip, so a panel reads as a panel and not a plank
    const p = grp(); p.position.set(sp() * 0.8, 2.2 + rnd(), sp() * 0.8); p.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.3); g.add(p);
    add(p, rbox(6 + rnd() * 2, 0.7, 7 + rnd() * 3, 0.25), E.panelDark, -3, 0, 0, 0, 0, 0.55); add(p, rbox(6 + rnd() * 2, 0.7, 7 + rnd() * 3, 0.25), E.panel, 3, 0, 0, 0, 0, -0.35);
    add(p, rbox(0.6, 0.8, 7.5, 0.1), E.paleSteel, -5.6, 1.6, 0, 0, 0, 0.55);
  }
  for (let k = 0; k < n + 1; k++) add(g, torus(2.8 + rnd() * 2, 0.5, Math.PI * (0.9 + rnd() * 0.8), 20), E.cable, sp() * 0.8, 0.8, sp() * 0.8, Math.PI / 2 - (rnd() - 0.5) * 0.5, rnd() * 3, 0);   // cable, thick enough to read as a loop
  const d = grp(); d.position.set(sp() * 0.5, 3.5, sp() * 0.5); d.rotation.set(Math.PI / 2, 0, rnd()); g.add(d); for (const y of [-2.2, 2.2]) add(d, cyl(3.6, 3.6, 0.6, 14), E.oakPale, 0, y, 0); add(d, cyl(3, 3, 4, 14), E.cable, 0, 0, 0);
  add(g, rbox(5, 4, 2.6, 0.3), E.panelDark, sp() * 0.6, 1.5, sp() * 0.6, 0.3, rnd() * 3, 0.5);                            // the crate's halves
  for (let k = 0; k < n + 2; k++) add(g, rbox(5 + rnd() * 3, 2.4, 3.2, 0.3), E.stone, sp(), 1.2, sp(), 0, rnd() * 3, (rnd() - 0.5) * 0.4);
  return g;
}
export const RT_SITES = { kg: { foundation: foundationKg, scaffold: scaffoldKg, rubble: rubbleKg }, ex: { foundation: foundationEx, scaffold: scaffoldEx, rubble: rubbleEx } };
void cone;
