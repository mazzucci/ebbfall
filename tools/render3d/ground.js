// The ground family (STYLE.md "The ground and the scenery"): the salt field, the brine seep, and construction and
// wrecks for both peoples. Same conventions as models.js: game units (1 tile = 32), y up, +z south; buildings and
// fields are centred on their footprint. The scenery props are in scenery2.js.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, limb } from './models.js';
import { torus } from './vael.js';

let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const std = (o) => new THREE.MeshStandardMaterial(o);
/** The ground's own materials, shared with the scenery (scenery2.js): wet slate. The salt works' own are `W` below.
 *  Salt carries no light. */
export const GMATS = {
  slate: std({ color: 0x343a40, roughness: 0.8, metalness: 0.1, flatShading: true }),
  slateWet: std({ color: 0x272c31, roughness: 0.45, metalness: 0.15, flatShading: true }),
};
/** A flat, uneven patch (no round plinth: round 2's read as tokens or coins): an outline of radius R wobbling by `amp`,
 *  squashed to `sq` in depth, `h` thick, its phase `ph`; `edge(a)` gives its radius at angle a. */
const wob = (R, amp, ph) => (a) => R * (1 + amp * (0.13 * Math.sin(3 * a + ph) + 0.08 * Math.sin(5 * a + ph * 1.7) + 0.05 * Math.sin(9 * a + ph * 2.3)));
function patch(edge, sq, h, bevel = 0) {
  const sh = new THREE.Shape();
  for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 2, r = edge(a) - bevel, x = Math.cos(a) * r, z = Math.sin(a) * r * sq; k ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
  const geo = new THREE.ExtrudeGeometry(sh, bevel ? { depth: h, bevelEnabled: true, bevelThickness: bevel * 0.6, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 } : { depth: h, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2); geo.computeVertexNormals(); return geo;
}
/** A grain for salt (a heap's colour and bump): fine speckle, light and dark, seeded; tiled. */
function grainTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), img = g.createImageData(128, 128); let q = 977;
  const r = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 128 * 128; i++) { const v = color ? 210 + (r() - 0.5) * 80 + (r() < 0.08 ? -60 : 0) : 128 + (r() - 0.5) * 220; img.data.set([v, v, v, 255], i * 4); }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3); if (color) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const G = GMATS;
/** The rubble's dull stand-ins for the peoples' pale materials: dead buildings' cloth and pearl, greyed by the fall. */
const RM = { rope: std({ color: 0x6e6048, roughness: 0.95, metalness: 0 }), sail: std({ color: 0x45413a, roughness: 0.95, metalness: 0 }), pearlDull: std({ color: 0x48464a, roughness: 0.75, metalness: 0.05, flatShading: true }), pearlDark: std({ color: 0x323134, roughness: 0.75, metalness: 0.05, flatShading: true }) };

// ---------------- resources ----------------
// The salt works (STYLE.md "The salt works", since the step-2 note that the faceted crystal clumps in an arc read as a
// mineral line and the green pool as a geyser): a field is a salt pan, drawn by the client under the field's nodes
// (src/client/gl/ground.js saltPans), with a heap of raked salt on each node; a seep is a brine spring, rust-ochre brine
// in white salt terraces.
const W = {
  heap: std({ color: 0x8a867e, map: grainTexture(true), bumpMap: grainTexture(false), bumpScale: 3.5, roughness: 1, metalness: 0 }), // salt: grained, white in the light, grey in its own shade, under the units' tops
  heapWet: std({ color: 0x6c6a64, roughness: 0.8, metalness: 0 }),                              // a heap's damp foot
  terrace: std({ color: 0x504e49, roughness: 0.9, metalness: 0 }),                             // the spring's salt terraces: smooth shaded, lit rims over shadowed steps
  ochre: std({ color: 0x3e2c22, roughness: 0.9, metalness: 0 }),                                // crust stained by the iron in the brine, a dull red-brown
  brine: std({ color: 0x51392a, roughness: 0.15, metalness: 0.1 }),                             // iron brine: a deep red-brown, wet and glossy (round 1's ochre read as the Harbour's orange, as fire)
  welling: std({ color: 0x33241a, roughness: 0.15, metalness: 0.1 }),
  glint: std({ color: 0x9a8a78, roughness: 0.2, metalness: 0 }),                                // the wet glint on the brine, small and still                           // where it wells up
  bubble: std({ color: 0x5e3c2c, roughness: 0.2, metalness: 0.2 }),                             // a bubble of brine, a lighter red-brown
};

/** A heap of salt, the shape of a salt-works pile: a smooth cone, straight-sided at the angle salt rests at, its top
 *  rounded (or cut flat where it has been worked, `cut` the top's share of R), barely lumpy (never faceted: faceted
 *  uprights read as crystals). Radius R, height H, its lumps seeded by `seed`. */
function saltHeap(g, R, H, x, z, seed, cut = 0, scoop = 0) {
  const prof = [new THREE.Vector2(R * 1.06, 0)];
  for (let k = 0; k <= 10; k++) { const t = k / 10, r = R * (1 - t) + R * cut * t, y = H * t; prof.push(new THREE.Vector2(Math.max(0.01, r), y - (cut ? 0 : H * 0.06 * t ** 6))); }
  if (cut) prof.push(new THREE.Vector2(0.01, H));
  const geo = new THREE.LatheGeometry(prof, 32), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {                                                     // a little uneven round its sides
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i), a = Math.atan2(pz, px), t = py / H;
    let k = 1 + 0.035 * Math.sin(a * 4 + seed) + 0.02 * Math.sin(a * 7 + seed * 2.3 + py * 0.3);
    if (scoop) k *= 1 - scoop * Math.max(0, Math.cos(a - 0.6)) ** 3 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7;   // a scoop dug out of its south-east face: a hollow, its rim lit
    pos.setXYZ(i, px * k, py, pz * k);
  }
  geo.computeVertexNormals();
  add(g, geo, W.heap, x, 0.3, z);
  add(g, patch(wob(R * 1.25, 1.2, seed), 0.85, 0.3), W.heapWet, x, 0, z);                  // its spilt, damp foot on the pan
}

/** A salt field's node (`shard_0..3`): a heap of raked salt on the pan, readable from full to nearly worked out by its
 *  shape: 0 a tall heap and a second beside it; 1 one heap, lower; 2 a low spread mound, raked flat; 3 a scraped wet
 *  hollow in the crust with a pale broken rim and two lumps left. The pan itself is the client's (gl/ground.js). */
export function saltField(stage, M = G) {
  const g = grp(); s = 31;
  if (stage === 0) { saltHeap(g, 9, 15, -1, -1, 0.7); saltHeap(g, 4.2, 6.5, 8, 5, 2.1); }   // a tall cone and a small one
  else if (stage === 1) saltHeap(g, 8.5, 10, 0, 0, 1.3, 0, 0.7);                           // one, a scoop dug out of its face
  else if (stage === 2) {
    const g2 = grp(); g2.rotation.y = 0.5; g.add(g2);                                       // a long, low ridge of raked salt
    const r2 = grp(); r2.scale.set(2.2, 1, 0.62); g2.add(r2); saltHeap(r2, 6, 5.5, 0, 0, 2.6);
    for (const side of [-1, 1]) for (let k = 1; k <= 2; k++) add(g2, rbox(22 - k * 5, 0.25, 0.35, 0.1), W.heapWet, 0, 5.5 - k * 1.7, side * k * 1.2, side * 0.45, 0, 0);   // rake grooves along its flanks
  } else {
    const pit = wob(9, 1.2, 0.7);
    add(g, patch(pit, 0.8, 0.25), M.slateWet, 0, 0, 0);                                     // the scraped hollow, wet slate
    for (let k = 0; k < 14; k++) {                                                          // the crust's broken rim round it, pale, a gap here and there
      if (k % 5 === 4) continue;
      const a = k / 14 * Math.PI * 2 + (rnd() - 0.5) * 0.25, w = 2 + rnd() * 2.2, r = pit(a) - 0.8;
      add(g, rbox(w, 0.7 + rnd() * 0.6, 1.4 + rnd(), 0.25), W.terrace, Math.cos(a) * r, 0.4, Math.sin(a) * r * 0.8, (rnd() - 0.5) * 0.2, -a + Math.PI / 2, (rnd() - 0.5) * 0.2);
    }
    saltHeap(g, 2.4, 2, -3, 2, 5.1); saltHeap(g, 1.8, 1.5, 4, -2, 6.2);                       // two lumps left
  }
  return g;
}

/** The brine seep (`vent_0..3`, an animation): a brine spring. Rust-ochre brine wells up in a pool held by white salt
 *  terraces that step down round it, the brine's iron staining a tongue of crust where it spills; slate stones at no
 *  even spacing. No green, no plume, no rings, no light (round 2's black disc and rings read as a Vael unit, round 4's
 *  green pool as a geyser). The frames: bubbles at a few places, each swelling and slumping flat in turn. */
export function brineSeep(f, M = G) {
  const g = grp(); s = 51;
  const sq = 0.82, t1 = wob(26, 1.1, 1.3), t2 = wob(21, 1.2, 2.1), t3 = wob(17, 1.0, 0.4), pool = wob(14, 1.2, 2.9);
  add(g, patch(wob(13, 1.6, 0.9), 0.55, 0.3), W.ochre, 14, 0, 12);                          // the spill: a rust tongue of crust to the south-east
  add(g, patch(t1, sq, 1.2, 1.4), W.terrace, 0, 0, 0);                                     // the terraces, stepping up to the pool: rounded rims, steps in shadow
  add(g, patch(wob(16, 1.3, 1.7), 0.6, 0.06), W.ochre, 8, 2.05, 7);                         // the stain where the brine runs down over them
  add(g, patch(t2, sq, 1.2, 1.4), W.terrace, -0.5, 2, -0.5);
  add(g, patch(t3, sq, 1.2, 1.4), W.terrace, -1, 4, -1);
  add(g, patch(pool, sq, 0.3), W.brine, -1, 5.75, -1);                                      // the brine, in the top terrace's rim
  add(g, patch(wob(4.5, 1.0, 0.4), 0.8, 0.12), W.welling, -3, 6.05, 0);                    // where it wells up, off centre
  add(g, patch(wob(2.2, 0.8, 1.9), 0.45, 0.05), W.glint, -8, 6.07, -5); add(g, patch(wob(1.2, 0.8, 0.9), 0.5, 0.05), W.glint, -5.5, 6.07, -7);   // the wet glint, still
  for (let k = 0; k < 5; k++) {                                                             // slate stones: two together, the rest strays
    const a = k < 2 ? 3.6 + rnd() * 0.4 : rnd() * Math.PI * 2, r = t1(a) * (0.98 + rnd() * 0.2), sz = 1.4 + rnd() * 2;
    add(g, new THREE.DodecahedronGeometry(sz), k % 2 ? M.slate : M.slateWet, Math.cos(a) * r, sz * 0.3, Math.sin(a) * r * sq, rnd(), rnd(), rnd()).scale.y = 0.55;
  }
  const sites = [[-3, 0, 1.3], [4, -4, 0.9], [-8, -4, 0.8], [3, 5, 1], [-6, 6, 0.7]];       // bubbles: each site its own phase and size
  sites.forEach(([x, z, k], i) => {
    const ph = (f + i * 3) % 4;
    if (ph === 0) add(g, sph(0.7 * k, 10, 8), W.bubble, x, 6.15, z).scale.set(1, 0.6, 1);
    else if (ph === 1) add(g, sph(1.3 * k, 12, 8), W.bubble, x, 6.25, z).scale.set(1, 0.7, 1);
    else if (ph === 2) add(g, patch(wob(1.8 * k, 1.5, i), 1, 0.06), W.bubble, x, 6.07, z);  // slumped: a flat slick, no ring
  });
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
