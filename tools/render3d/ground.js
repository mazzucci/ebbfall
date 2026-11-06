// The ground family (STYLE.md "The ground and the scenery"): the salt field, the mine shaft, and construction and
// wrecks for both peoples. Same conventions as models.js: game units (1 tile = 32), y up, +z south; buildings and
// fields are centred on their footprint. The scenery props are in scenery2.js.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { torus } from './vael.js';

let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const std = (o) => new THREE.MeshStandardMaterial(o);
/** The ground's own materials, shared with the scenery (scenery2.js): wet slate, and the salt field's: salt a pale warm
 *  white-grey, the palest thing on the ground but under the units' pale tops (the PM's note at gate A, and round 2's
 *  judge: 0xc2bdae still peaked at 251, as bright as a unit's highlight), the crust, the brine of a mined-out pit. The
 *  shaft's own are `SH` below. Salt carries no light. */
export const GMATS = {
  slate: std({ color: 0x343a40, roughness: 0.8, metalness: 0.1, flatShading: true }),
  slateWet: std({ color: 0x272c31, roughness: 0.45, metalness: 0.15, flatShading: true }),
  salt: std({ color: 0x76716a, emissive: 0x332e27, roughness: 0.95, metalness: 0.02, flatShading: true }), // halite: white on its lit tops, pale grey in shade (the faint emissive is its translucency: the sky's blue made the shaded faces slate), never green or teal
  saltWet: std({ color: 0x716d66, emissive: 0x25221d, roughness: 0.7, metalness: 0.05, flatShading: true }),  // a wet face, a little greyer
  crust: std({ color: 0x46433d, roughness: 0.95, metalness: 0, flatShading: true }),            // the salt crust over slate (a pale bed made the whole field a pale plate)
  brine: std({ color: 0x1a2226, roughness: 0.12, metalness: 0.35, flatShading: false }),        // still brine in a mined-out pit
  apron: std({ color: 0x4d4c49, roughness: 0.95, metalness: 0, flatShading: true }),            // the salt field's bed: a pale grey-white crust, wider than the crystals
};
/** A flat, uneven patch (no round plinth: round 2's read as tokens or coins): an outline of radius R wobbling by `amp`,
 *  squashed to `sq` in depth, `h` thick, its phase `ph`; `edge(a)` gives its radius at angle a. */
const wob = (R, amp, ph) => (a) => R * (1 + amp * (0.13 * Math.sin(3 * a + ph) + 0.08 * Math.sin(5 * a + ph * 1.7) + 0.05 * Math.sin(9 * a + ph * 2.3)));
function patch(edge, sq, h, bevel = 0, hole = null) {
  const sh = new THREE.Shape();
  for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 2, r = edge(a) - bevel, x = Math.cos(a) * r, z = Math.sin(a) * r * sq; k ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
  if (hole) sh.holes.push(squareHole(...hole));
  const geo = new THREE.ExtrudeGeometry(sh, bevel ? { depth: h, bevelEnabled: true, bevelThickness: bevel * 0.6, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 } : { depth: h, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2); geo.computeVertexNormals(); return geo;
}
/** A square hole for a shape (the shaft's mouth through what lies round it): centre (x, z), half-width `r`. */
export const squareHole = (x, z, r) => new THREE.Path([[x - r, -z - r], [x - r, -z + r], [x + r, -z + r], [x + r, -z - r]].map(([u, v]) => new THREE.Vector2(u, v)));
const G = GMATS;
/** The rubble's dull stand-ins for the peoples' pale materials: dead buildings' cloth and pearl, greyed by the fall. */
const RM = { rope: std({ color: 0x6e6048, roughness: 0.95, metalness: 0 }), sail: std({ color: 0x45413a, roughness: 0.95, metalness: 0 }), pearlDull: std({ color: 0x48464a, roughness: 0.75, metalness: 0.05, flatShading: true }), pearlDark: std({ color: 0x323134, roughness: 0.75, metalness: 0.05, flatShading: true }) };

// ---------------- resources ----------------
// The salt field (STYLE.md "The salt works"): salt crystal clusters on a pale crust apron, in four stages. The mine
// shaft: an old square mouth going down to the rock salt under the seabed, in a timber collar (no liquid anywhere).
/** The shaft's own materials: its dark mouth (the one thing darker than the ground), the trodden spoil round it. */
const SH = {
  mouth: new THREE.MeshBasicMaterial({ color: 0x000000 }),                                     // the dark going down: no sheen, no light, the darkest thing on screen
  deep: std({ color: 0x0c0b0a, roughness: 1, metalness: 0 }),                                  // the far wall, deeper
  rock: std({ color: 0x1e1b18, roughness: 1, metalness: 0, flatShading: true }),               // the rock under the seabed, in shade
  lining: std({ color: 0x2c2620, roughness: 0.95, metalness: 0 }),                             // the shaft's timber lining at its top, in shade
  ladder: std({ color: 0x5a4c3c, roughness: 0.9, metalness: 0 }),
  beam: std({ color: 0x847d71, roughness: 0.88, metalness: 0 }),                               // the collar's timbers: old, weathered grey-brown (the Harbour's own timber read orange)
  spoil: std({ color: 0x3e3b36, roughness: 1, metalness: 0 }),                                 // dry dug earth round the mouth, the ground's value or a touch over (round 1's darker blot read as a puddle of tar)
  rim: std({ color: 0xa69c8a, roughness: 0.85, metalness: 0 }),                               // the near edge's worn lip, lit: where the mouth begins
};

/** A salt field (`shard_0..3`), readable from full to nearly mined out by its shape, not only its size:
 *  0 full: nine tall clusters of halite cubes, stacked and tilted, on a crust bed over wet slate, a spill of loose cubes;
 *  1 worked: four lower clusters, the crust dug through to the slate in places;
 *  2 low: no standing crystals, a flat salt crust broken into slabs over the bed, a few loose cubes;
 *  3 nearly gone: a bare dark pit of wet slate and a pale broken rim of salt round it, two cubes left. */
export function saltField(stage, M = G) {
  const g = grp(); s = 31;
  const edge = wob(17, 1.0, 0.7), sq = 0.8;                                                 // the field's own uneven edge: a wide apron of crust
  for (let k = 0; k < 4; k++) { const a = rnd() * Math.PI * 2, r = edge(a) * (0.9 + rnd() * 0.25); add(g, new THREE.DodecahedronGeometry(1 + rnd() * 1.6), M.slate, Math.cos(a) * r, 0.5, Math.sin(a) * r * sq, rnd(), rnd(), 0).scale.y = 0.55; } // slate chips round it
  const cubes = (r, h) => { const c = grp(); add(c, rbox(r * 1.3, h, r * 1.2, 0.15), M.salt, 0, h / 2, 0); add(c, rbox(r * 0.85, h * 0.8, r * 0.9, 0.12), M.saltWet, r * 0.5, h * 0.72, -r * 0.3, 0.2, 0.5, 0.1); add(c, rbox(r * 0.7, h * 0.55, r * 0.7, 0.1), M.salt, -r * 0.45, h * 0.95, r * 0.35, 0.1, 0.9, -0.15); return c; };
  const clusters = [[-6, 2, 3.2, 12, -0.2, 0.15], [5, 3, 2.8, 10, 0.25, -0.2], [0, -2, 3.6, 14, 0.05, 0.1], [-2, 6, 2.4, 8, -0.3, 0.3], [7, -4, 2.1, 7.5, 0.3, -0.15], [-8, -4, 2, 6.5, -0.3, -0.3],
    [10, 2, 2, 7, 0.3, 0.1], [-10, 3, 1.8, 6, -0.35, 0.1], [3, -7, 2.2, 8.5, 0.1, -0.3]];
  const loose = (n, y = 1.2) => { for (let k = 0; k < n; k++) add(g, rbox(1.2, 1.2, 1.2, 0.1), M.salt, (rnd() - 0.5) * 22, y, (rnd() - 0.5) * 15, (rnd() - 0.5), rnd() * 3, (rnd() - 0.5)); };
  if (stage < 2) {
    add(g, patch(edge, sq, 0.8), M.apron, 0, 0, 0);                                         // the crust apron, its edge uneven
    add(g, patch(wob(9, 1.3, 2.2), 0.8, 0.3), M.crust, 1, 0.8, 1);                         // darker crust where the crystals grow
    const keep = stage ? [clusters[2], clusters[0], clusters[1], clusters[3]] : clusters, k = stage ? 0.72 : 1;
    keep.forEach(([x, z, r, h, lx, lz]) => { const c = cubes(r * k, h * k); c.position.set(x, 0.8, z); c.rotation.set(lz, rnd() * 3, -lx); g.add(c); });
    loose(stage ? 5 : 8);
    if (stage) for (let k = 0; k < 3; k++) add(g, rbox(3 + rnd() * 3, 0.6, 2 + rnd() * 2, 0.2), M.slateWet, 6 - k * 8 + rnd() * 2, 0.9, 5 - k * 3, 0, rnd() * 3, 0); // dug through to the slate
  } else if (stage === 2) {
    add(g, patch(edge, sq, 0.5), M.apron, 0, 0, 0);                                         // the apron, worn
    add(g, patch(wob(10, 1.3, 1.1), 0.8, 0.2), M.slateWet, 0, 0.5, 0);                     // wet slate between the slabs
    for (let k = 0; k < 11; k++) {                                                          // the crust in flat slabs, a little tilted, cracks between
      const a = k / 11 * Math.PI * 2 + rnd() * 0.3, d = k < 3 ? 2 + rnd() * 3 : 7 + rnd() * 3, w = 4 + rnd() * 2.5;
      add(g, rbox(w, 0.9 + rnd() * 0.4, w * (0.6 + rnd() * 0.3), 0.3), k % 4 === 2 ? M.salt : k % 2 ? M.saltWet : M.crust, Math.cos(a) * d, 0.9, Math.sin(a) * d * sq, (rnd() - 0.5) * 0.18, rnd() * 3, (rnd() - 0.5) * 0.18);
    }
    loose(4, 1.6);
  } else {
    const pit = wob(13, 1.2, 0.7);
    add(g, patch(pit, sq, 0.3), M.slateWet, 0, 0, 0);                                       // the pit: bare wet slate
    add(g, patch(wob(7, 1.6, 2.1), 0.7, 0.2), M.brine, 1, 0.3, 0.5);                        // a film of brine in its bottom
    for (let k = 0; k < 16; k++) {                                                          // the rim: the crust's last broken edge, uneven, a gap here and there
      if (k % 6 === 5) continue;
      const a = k / 16 * Math.PI * 2 + (rnd() - 0.5) * 0.25, w = 2.2 + rnd() * 2.6, r = pit(a) - 1.2;
      add(g, rbox(w, 0.8 + rnd() * 0.8, 1.5 + rnd() * 1.2, 0.25), k % 4 === 1 ? M.saltWet : M.apron, Math.cos(a) * r, 0.6, Math.sin(a) * r * sq, (rnd() - 0.5) * 0.2, -a + Math.PI / 2, (rnd() - 0.5) * 0.2);
    }
    add(g, rbox(1.6, 1.6, 1.6, 0.12), M.salt, -3, 0.9, 2, 0.3, 0.6, 0.2); add(g, rbox(1.2, 1.2, 1.2, 0.1), M.saltWet, 4, 0.7, -2.5, -0.2, 1.2, 0.1); // two cubes left
  }
  return g;
}

/** The shaft below the ground at a mouth `w` across centred at (x, y, z): its far wall, as deep as the camera sees
 *  through the mouth, a thin lining band, rock in shade, then black. Shared by the collar and the Siphon's mouth. */
export function shaftPit(g, x, y, z, w) {
  const D = w * Math.tan(55 * Math.PI / 180), zN = z - w / 2;
  const bands = [[0, 1.6, SH.lining], [1.6, 4, SH.rock], [4, 8, SH.deep], [8, D + 2, SH.mouth]];      // the far wall, top down: a thin lining, rock in shade, darker, black
  for (const [t, u, mat] of bands) add(g, rbox(w + 1, u - t, 1, 0.05), mat, x, y - (t + u) / 2, zN - 0.5);
  for (const sx of [-1, 1]) add(g, rbox(1, D, 1, 0.05), SH.mouth, x + sx * (w / 2 + 0.5), y - D / 2, zN);   // (the side walls' far corners, black)
}
/** The mine shaft's collar and mouth, square, centred at (x, y, z) on the ground at y: the shaft itself, its far wall
 *  going down below the ground as deep as the camera sees through the mouth (1.43 times its width at 55 degrees), lined
 *  with timber at the top and falling to black, a ladder down it; round it two courses of squared timbers laid
 *  log-cabin fashion into one square box (`courses` 1: a single ring of four), `w` the mouth's width. Below the ground only the far wall
 *  is built: the camera sees nothing else of the shaft. `M`: makeMats (iron; nothing team). Shared by the free shaft
 *  (`mineShaft`) and the Excavator over it. */
export function shaftCollar(g, M, x = 0, y = 0, z = 0, w = 20, courses = 2) {
  if (!SH.beam.map) for (const m of [SH.beam, SH.ladder, SH.lining, SH.rim]) { m.map = M.timber.map; m.needsUpdate = true; }  // (the Harbour's timber grain)
  const b = 5, h = 3.4, o = w / 2 + b / 2, L = w + b * 2, zN = z - w / 2;                    // (L: the beams stop at the box's corners: round 2's ends past them read as ladder rails)
  shaftPit(g, x, y, z, w);
  for (const sx of [-1, 1]) add(g, rbox(0.6, 20, 0.6, 0.2), SH.ladder, x + sx * 2.1, y - 4, zN + 1.1);     // a slim ladder down the far wall
  for (let k = 0; k < 6; k++) add(g, rbox(4.4, 0.45, 0.45, 0.1), SH.ladder, x, y + 4.6 - k * 3, zN + 1.2);
  for (const [c, rot] of [[0, 0], [1, Math.PI / 2]]) for (const s of [-1, 1]) {
    const one = courses === 1, yy = y + h / 2 + (one ? 0 : c * h);                           // two courses (x-beams below, z-beams above), or one ring of four
    const len = one && c ? w : c ? L - 0.4 : L;
    add(g, rbox(len, h, b, 0.8), SH.beam, x + (rot ? s * o : 0), yy, z + (rot ? 0 : s * o), 0, rot + s * 0.01 * (c + 1), 0);
  }
  const top = y + (courses === 1 ? h : 2 * h);
  add(g, rbox(w + 0.6, 0.7, 1.4, 0.3), SH.rim, x, y + h + 0.2, z + w / 2 + 0.8);                 // the near edge's worn lip, lit (the depth's first cue)
  for (const [sx, sz] of [[-1, -1], [1, 1]]) add(g, rbox(1.8, 1.2, 1.8, 0.2), M.ironDark, x + sx * o, top + 0.3, z + sz * o); // two iron dogs at the corners
}

/** The mine shaft (`vent_0..3`): an old entrance going down to the beds of rock salt under the seabed, a square dark
 *  mouth in a heavy timber collar on a low apron of dug spoil, two big stones beside it. A few big forms that read at a
 *  phone's 64 px; no liquid, no light, no rope or windlass (a well), nothing team (it is neutral ground). The four
 *  frames are the same: it no longer bubbles. `M`: makeMats (timber, iron). */
export function mineShaft(f, M) {
  const g = grp(); s = 51;
  add(g, patch(wob(28, 1.0, 1.3), 0.86, 0.7, 0.5, [0, -1, 13.5]), SH.spoil, 0, 0, 0);       // the spoil: dry dug earth, low and shallow, its edge uneven, open over the mouth
  add(g, patch(wob(12, 1.4, 2.6), 0.6, 0.9, 0.6), SH.spoil, 14, 0.4, 11);                    // a low heap of it to the south-east
  shaftCollar(g, M, 0, 0.7, -1, 24);
  for (const [x, z, sz] of [[-21, 10, 3.6], [19, -14, 2.8]]) add(g, new THREE.DodecahedronGeometry(sz), G.slate, x, sz * 0.4, z, rnd(), rnd(), rnd()).scale.y = 0.6; // two big stones
  return g;
}

// ---------------- construction and wrecks ----------------
/** The Harbour's foundation (`foundation_n`): a sill of timber beams pegged into the sand round the site, a string line
 *  on the pegs, flagstones laid at one corner and a stack of planks waiting. `M`: makeMats (seat 0's gold). */
export function foundation(n, M) {
  const g = grp(), W = n * 32 - 6, h = W / 2; s = 71 + n;
  for (const [x, z, rot] of [[0, -h, 0], [0, h, 0], [-h, 0, Math.PI / 2], [h, 0, Math.PI / 2]]) add(g, rbox(W, 2.2, 2.6, 0.5), M.timber, x, 1.1, z, 0, rot, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(g, rbox(3.4, 1.2, 3.4, 0.3), M.ironDark, x * h, 2.4, z * h);                                   // iron corner straps
    add(g, cyl(0.55, 0.7, 5, 8), M.timber, x * (h - 4), 2.5, z * (h - 4));                             // a peg
  }
  for (const [x, z, rot] of [[0, -(h - 4), 0], [0, h - 4, 0], [-(h - 4), 0, Math.PI / 2], [h - 4, 0, Math.PI / 2]]) add(g, rbox(W - 8, 0.25, 0.25, 0.1), M.rope, x, 4.6, z, 0, rot, 0); // the string line
  for (let k = 0; k < 2 + n; k++) add(g, rbox(6, 1, 6, 0.3), M.slate, -h + 6 + (k % 2) * 7, 0.5, h - 6 - Math.floor(k / 2) * 7); // flagstones laid at the south-west corner
  for (let k = 0; k < 3; k++) add(g, rbox(14, 1, 3, 0.3), M.timber, h - 10, 0.5 + k * 1.1, -h + 5 + k * 0.3, 0, (k - 1) * 0.06, 0); // a stack of planks
  return g;
}
/** The Harbour's scaffold (`scaffold_n`): timber poles lashed with rope, two ledgers, rope braces, pale canvas hung
 *  on the north and east sides with an ink hem, a gold pennant on one pole. Drawn without a shadow (main.js). */
export function scaffold(n, M) {
  const g = grp(), W = n * 32 - 8, h = W / 2, H = 10 + n * 6; s = 81 + n;
  const poles = [];
  for (let x = -h; x <= h + 0.1; x += W / Math.max(2, n)) for (const z of [-h, h]) { poles.push([x, z], [z, x]); }
  for (const [x, z] of poles) {
    add(g, cyl(0.9, 1.1, H + 2, 8), M.timber, x, (H + 2) / 2, z, (rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.04);
    add(g, torus(1.25, 0.3, Math.PI * 2, 12), M.rope, x, H - 0.6, z, Math.PI / 2);                      // a lashing at the top ledger
  }
  for (const y of [H * 0.5, H]) for (const [x, z, rot] of [[0, -h, 0], [0, h, 0], [-h, 0, Math.PI / 2], [h, 0, Math.PI / 2]]) add(g, rbox(W + 2, 1.2, 1.2, 0.4), M.timber, x, y, z, 0, rot, 0);
  for (const [x, z] of [[-h, 0], [h, 0]]) limb(g, [x, 1, -h], [x, H * 0.95, h], 0.3, M.rope);           // rope braces, east and west
  for (const [x, z] of [[0, -h], [0, h]]) limb(g, [-h, 1, z], [h, H * 0.95, z], 0.3, M.rope);
  const sheet = (x, z, rot, w) => {                                                                     // a canvas sheet hung from the top ledger, an ink hem at its foot
    add(g, rbox(w, H * 0.42, 0.4, 0.15), M.canvas, x, H * 0.77, z, 0, rot, 0);
    add(g, rbox(w + 0.2, 0.7, 0.5, 0.1), M.inkLine, x, H * 0.56, z, 0, rot, 0);
  };
  sheet(0, -h - 0.4, 0, W * 0.72); sheet(h + 0.4, 0, Math.PI / 2, W * 0.55);
  add(g, rbox(0.5, 3.2, 4.5, 0.1), M.paintCanvas, h, H + 3.8, -h - 2.2);                                 // the pennant
  add(g, rbox(0.6, 0.4, 4.7, 0.1), M.inkLine, h, H + 2.1, -h - 2.2);
  return g;
}
/** The Harbour's rubble (`rubble_n`): broken tarred planks and splintered timber, bent iron bands, a torn canvas
 *  scrap, flagstones thrown up, a coil of rope: the wreck of a hull-roofed building. */
export function rubble(n, M) {
  const g = grp(), W = n * 32 - 8; s = 91 + n;
  for (let k = 0; k < n * n * 4; k++) {
    const L = 5 + rnd() * (6 + n * 2), x = (rnd() - 0.5) * W, z = (rnd() - 0.5) * W;
    add(g, rbox(L, 1, 2.2 + rnd() * 1.5, 0.25), k % 3 === 2 ? M.timber : M.tar, x, 0.6 + rnd() * 1.6, z, (rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.3);
  }
  for (let k = 0; k < n + 1; k++) { const x = (rnd() - 0.5) * W * 0.8, z = (rnd() - 0.5) * W * 0.8; add(g, torus(3 + rnd() * 2, 0.4, Math.PI * (0.8 + rnd() * 0.7), 20), M.ironDark, x, 1.2, z, Math.PI / 2 - (rnd() - 0.5) * 0.6, rnd() * 3, 0); } // bent bands
  for (let k = 0; k < n - 1; k++) { const x = (rnd() - 0.5) * W * 0.7, z = (rnd() - 0.5) * W * 0.7, a = rnd() * 3; add(g, rbox(9 + rnd() * 6, 0.5, 7 + rnd() * 4, 0.3), RM.sail, x, 0.4, z, 0.08, a, -0.06); } // torn sailcloth, dirtied grey (white squares read as confetti)
  for (let k = 0; k < n * 2; k++) add(g, rbox(4 + rnd() * 3, 1, 4 + rnd() * 2, 0.3), M.slate, (rnd() - 0.5) * W, 0.5, (rnd() - 0.5) * W, 0, rnd() * 3, (rnd() - 0.5) * 0.4);
  add(g, torus(2.4, 0.8, Math.PI * 2, 16), RM.rope, (rnd() - 0.5) * W * 0.6, 0.8, (rnd() - 0.5) * W * 0.6, Math.PI / 2);
  return g;
}
/** The Vael's bud (`bud_n`): a closed pearl bud on a three-lobed ink plinth, the building growing inside it; five
 *  petals closing over an ink core, a small deeplight at the tip. For the coder to wire in place of the warp ghost. */
export function bud(n, M) {
  const g = grp(), R = n * 6.5, H = 8 + n * 7;
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.5; add(g, sph(R * 0.62, 18, 12), M.ink, Math.cos(a) * R * 0.45, 0.6, Math.sin(a) * R * 0.45).scale.set(1, 0.22, 1); } // the plinth's three lobes
  add(g, sph(R * 0.55, 18, 12), M.ink, 0, H * 0.42, 0).scale.set(1, H * 0.42 / (R * 0.55) * 0.9, 1);   // the ink core
  for (let k = 0; k < 5; k++) {                                                                        // the petals, closing over it
    const a = k / 5 * Math.PI * 2, p = grp(); p.position.set(Math.cos(a) * R * 0.5, 2, Math.sin(a) * R * 0.5); p.rotation.y = -a; p.rotation.z = 0.32;
    add(p, sph(R * 0.46, 16, 12), k % 2 ? M.shellLight : M.shell, 0, H * 0.5, 0).scale.set(0.55, H * 0.5 / (R * 0.46), 1);
    add(p, sph(R * 0.2, 10, 8), M.shellDark, 0, H * 0.08, 0).scale.set(0.6, 0.5, 1.2);                   // a dark heel at the plinth
    g.add(p);
    const q = grp(); q.position.set(Math.cos(a + Math.PI / 5) * R * 0.52, 2, Math.sin(a + Math.PI / 5) * R * 0.52); q.rotation.y = -(a + Math.PI / 5); q.rotation.z = 0.3; // an ink seam where two petals meet
    add(q, sph(R * 0.44, 10, 8), M.inkSeam, 0, H * 0.48, 0).scale.set(0.12, H * 0.46 / (R * 0.44), 0.5);
    g.add(q);
  }
  add(g, sph(R * 0.14, 10, 8), M.deeplight, 0, H * 0.98, 0);                                            // the light at the tip
  add(g, sph(R * 0.08, 8, 6), M.deepCore, 0, H * 1.0, 0);
  add(g, sph(R * 0.26, 10, 8), M.deepHalo1, 0, H * 0.98, 0);
  return g;
}
/** The Vael's rubble (`rubble_vael_n`): pearl shards and chunks of ink glass over a dim pool where a shell stood. */
export function rubbleVael(n, M) {
  const g = grp(), W = n * 32 - 8; s = 111 + n;
  add(g, cyl(W * 0.14, W * 0.17, 0.6, 24), M.poolDeep, 0, 0.3, 0).scale.set(1, 1, 0.8);                // the pool, small: a dim eye, not a black disc
  for (let k = 0; k < n * n * 2; k++) {
    const sz = 5 + rnd() * (4 + n * 1.5), x = (rnd() - 0.5) * W, z = (rnd() - 0.5) * W;
    if (k % 3 === 0) add(g, new THREE.DodecahedronGeometry(sz * 0.4), M.ink, x, sz * 0.2, z, rnd(), rnd() * 3, rnd()).scale.y = 0.6;
    else add(g, rbox(sz, 0.8, sz * (0.5 + rnd() * 0.6), 0.2), k % 3 === 1 ? RM.pearlDull : RM.pearlDark, x, 0.6 + rnd() * 1.2, z, (rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.4); // shards: greyed pearl, fewer and larger (white chips read as confetti)
  }
  for (let k = 0; k < n; k++) { const sz = 5 + rnd() * 4; add(g, new THREE.SphereGeometry(sz, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), RM.pearlDull, (rnd() - 0.5) * W * 0.6, 0.4, (rnd() - 0.5) * W * 0.6, 0.5 + rnd(), rnd() * 3, 0).scale.y = 0.6; } // a broken dome, its underside up
  return g;
}
