// The Vael's buildings on the new look (STYLE.md, "Vael buildings"): pale pearl shells on an ink core, a few small
// blue-violet deeplights, team glaze between ink seams. Step 1's family: the Sunpetal (spire), the Siphon (siphon),
// the Cradle (kiln), the Glasshouse (loom), the Anemone (ward), the Gyre (zenith) and the Darkwater (eclipse); the
// Tidewell (conflux) stays in vael2.js and is the reference. Same conventions: game units (1 tile = 32), y up, +z
// south (towards the camera); a building's anchor is its footprint's centre. Each building owns a roof from above:
// a five-petal flower open to the sky, a conch lying over a shaft's mouth, a half-open shell, a ribbed dome, a star of
// tentacles with lit tips, a widening spiral ribbon, a dark pool in a crown of arms; the Tidewell is a ring with
// pylons. No ring of alternating glaze bands anywhere (the Tidewell's read as a lifebuoy): team glaze is one band,
// a sleeve, a cap or a patch, each between ink seams.
// The camera looks down at 55 degrees from the south: a face shows when its normal points up or south; a plate
// leaning towards the camera shows only its edge (its back faces down), so petals and lids open past the view angle.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './models.js';
import { torus, lathe } from './vael.js';
import { deeplight } from './vael2.js';
import { shaftPit, squareHole } from './ground.js';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
// ---- the family's own material: dark glass, a shade bluer than the ink core, for faces and panes ----
const FAM = new WeakMap();
function fam(M) {
  if (FAM.has(M)) return FAM.get(M);
  const A = {
    darkGlass: new THREE.MeshPhysicalMaterial({ color: 0x16142c, metalness: 0.5, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }), // the Glasshouse's panes
    petalGlass: new THREE.MeshPhysicalMaterial({ color: 0x1c1840, emissive: 0x0e0c22, emissiveIntensity: 0.5, metalness: 0.35, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: 0x8c80d8 }), // the Sunpetal's faces: deep violet glass with a light sweep, never flat black
    violetWater: new THREE.MeshStandardMaterial({ color: 0x3a2e74, emissive: 0x241a58, emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.3 }), // the Cradle's basin: deep violet, never black
    bud: new THREE.MeshPhysicalMaterial({ color: 0x6a5aa8, emissive: 0x2c2060, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35, clearcoat: 0.8, sheen: 0.8, sheenColor: 0xe8e0ff }), // the Cradle's bud: violet under a pearl sheen
    mouth: new THREE.MeshStandardMaterial({ color: 0x1a1830, emissive: 0x201c48, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 }), // the Anemone's mouth: dark violet, lit from within
  };
  FAM.set(M, A); return A;
}
/** Three-lobed plinth outline (top view) of radius r, as the Tidewell's. */
const tri = (r, k = 0.55) => { const p = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = r * (1 - k * 0.5 + k * 0.5 * Math.cos(3 * a)); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
/** The family's plinth: a darker base plate and a pearl step, three-lobed. */
function plinth(g, M, r, k = 0.3) {
  add(g, plate(tri(r, k), 4, 1.5), M.shellDark, 0, 0, 0);
  add(g, plate(tri(r * 0.9, k), 3, 1.4), M.shell, 0, 3.5, 0);
}
/** A team band round a drum between two ink seams: radius r (a little over the drum's), height h, centred on y. */
function skirt(g, M, r, h, y, seg = 36) {
  add(g, cyl(r, r + 0.3, h, seg), M.glaze, 0, y, 0);
  add(g, cyl(r + 0.25, r + 0.45, 0.7, seg), M.inkSeam, 0, y + h / 2 + 0.2, 0);
  add(g, cyl(r + 0.35, r + 0.55, 0.7, seg), M.inkSeam, 0, y - h / 2 - 0.2, 0);
}
/** A flat team ring between two ink seams (a rim, a collar's top), radius r, width w, at height y. */
function hoop(g, M, r, w, y, seg = 48) {
  add(g, torus(r, w / 2, Math.PI * 2, seg), M.glaze, 0, y, 0, Math.PI / 2, 0, 0);
  add(g, torus(r + w / 2 + 0.25, 0.35, Math.PI * 2, seg), M.inkSeam, 0, y + 0.1, 0, Math.PI / 2, 0, 0);
  add(g, torus(r - w / 2 - 0.25, 0.35, Math.PI * 2, seg), M.inkSeam, 0, y + 0.1, 0, Math.PI / 2, 0, 0);
}
/** A petal outline rooted at the origin, `l` long along +x and `w` wide; `k` narrows it towards the tip. */
const petal = (l, w, n = 16, k = 0) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = l / 2 - Math.cos(a) * l / 2; p.push([x, Math.sin(a) * w / 2 * (1 - k * x / l)]); } return p; };
/** An outline stood upright in a group: [u, h] points (u across, h up) extruded `depth` towards local -z; the outer
 *  face at z = 0 faces local +z. */
const upright = (parent, pts, depth, bevel, mat, z = 0) => add(parent, plate(pts, depth, bevel), mat, 0, 0, z, -Math.PI / 2, 0, 0);
/** A flat ribbon along a helix round the y axis (`turns` from radius r0 to r1, geometric or linear with `lin`, y0 to y1, from angle a0),
 *  `w0` to `w1` wide across the radius and `t` thick; four strips with hard edges, so its top face takes the light. */
function ribbon(H, w0, w1, t, seg = 120) {
  return memo(`rib${JSON.stringify([H, w0, w1, t, seg])}`, () => {
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, a = H.a0 + u * H.turns * Math.PI * 2, r = H.lin ? H.r0 + (H.r1 - H.r0) * u : H.r0 * (H.r1 / H.r0) ** u, hw = w0 * (w1 / w0) ** u / 2;
      const P = [Math.cos(a) * r, H.y0 + (H.y1 - H.y0) * u, -Math.sin(a) * r], R = [Math.cos(a), 0, -Math.sin(a)];
      const c = (sr, sy) => [P[0] + R[0] * sr * hw, P[1] + sy * t / 2, P[2] + R[2] * sr * hw];
      const TO = c(1, 1), TI = c(-1, 1), BI = c(-1, -1), BO = c(1, -1);
      for (const [p, q] of [[TO, TI], [TI, BI], [BI, BO], [BO, TO]]) pos.push(...p, ...q);        // top, inner side, bottom, outer side
    }
    for (let i = 0; i < seg; i++) for (let s = 0; s < 4; s++) { const p = i * 8 + s * 2, q = p + 1, r = p + 8, w = q + 8; idx.push(p, q, r, q, w, r); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const ix = g.getIndex(); for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i); ix.setX(i, ix.getX(i + 1)); ix.setX(i + 1, a); } g.computeVertexNormals(); } // the top face must face up
    return boxUV(g);
  });
}

/** Glasshouse (tech, 2x2): a dome of dark glass in pearl ribs on an ink drum: eight pearl meridians and one hoop
 *  over the glass, a pearl crown with the one deeplight on it; a team band round the dome's foot and a team skirt
 *  round the drum, between ink seams, team caps on three pearl buttresses. From above: a round ribbed dome, convex
 *  and dark between pale ribs; the Darkwater beside it is open and concave. */
export function glasshouse(M) {
  const g = grp(), A = fam(M);
  plinth(g, M, 29, 0.3);
  add(g, cyl(21.5, 24.5, 9, 40), M.ink, 0, 7.5, 0);                                             // the ink drum
  skirt(g, M, 24.9, 5.4, 6.6, 40);                                                             // the team skirt
  add(g, torus(21.8, 1.4, Math.PI * 2, 48), M.ring, 0, 12, 0, Math.PI / 2, 0, 0);              // the pearl cornice the dome sits on
  const dome = add(g, sph(20.5, 36, 24), A.darkGlass, 0, 12, 0); dome.scale.set(1, 0.82, 1);     // the dome: dark glass
  add(g, cyl(20.8, 21.6, 4.6, 40), M.glaze, 0, 15.1, 0);                                         // the team band round its foot
  add(g, cyl(21.1, 21.5, 0.6, 40), M.inkSeam, 0, 17.6, 0);
  for (let k = 0; k < 4; k++) {                                                                 // eight pearl meridians (four half rings)
    const m = add(g, torus(20.9, 1.15, Math.PI, 40), M.ring, 0, 12, 0); m.rotation.y = k / 4 * Math.PI; m.scale.set(1, 0.82, 1);
  }
  add(g, torus(20.9 * Math.cos(0.72), 0.95, Math.PI * 2, 48), M.ring, 0, 12 + 20.5 * 0.82 * Math.sin(0.72), 0, Math.PI / 2, 0, 0); // one hoop, two thirds up
  add(g, cyl(2.8, 3.6, 2.6, 16), M.ring, 0, 29.6, 0);                                           // the crown
  add(g, sph(1.6, 10, 8), M.inkSeam, 0, 31.4, 0);                                               // its ink socket
  deeplight(g, M, 1.2, 0, 32.4, 0);                                                            // the one light
  for (let k = 0; k < 3; k++) {                                                                 // three pearl buttresses leaning on the drum
    const a = k / 3 * Math.PI * 2 + Math.PI / 6, p = grp(); p.position.set(Math.cos(a) * 26, 4, Math.sin(a) * 26); p.rotation.y = -a; g.add(p);
    add(p, rbox(7, 13, 10.5, 1.2), M.glaze, 0, 6.5, 0, 0, 0, 0.35);                                // leaning in, team glaze
    add(p, rbox(7.4, 0.6, 10.9, 0.15), M.inkSeam, 0.6, 1.2, 0, 0, 0, 0.35);                       // an ink seam at its foot
    add(p, rbox(5.6, 2.2, 9, 0.6), M.ring, -2.2, 13.2, 0, 0, 0, 0.35);                          // a pearl cap
    add(p, rbox(6, 0.5, 9.4, 0.15), M.inkSeam, -1.9, 12, 0, 0, 0, 0.35);
  }
  return g;
}

/** A curved tentacle: capsule segments along the points `pts`, radius tapering r0 to r1; `glaze` marks the segments
 *  (by index) sleeved in team glaze between ink seams. */
function tentacle(g, M, pts, r0, r1, glazed = []) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const r = r0 + (r1 - r0) * i / n, team = glazed.includes(i);
    limb(g, pts[i], pts[i + 1], team ? r * 1.12 : r, team ? M.glaze : M.shell);
    if (team) { add(g, sph(r * 1.22, 10, 8), M.inkSeam, ...pts[i]); add(g, sph(r * 1.18, 10, 8), M.inkSeam, ...pts[i + 1]); }
  }
}

/** Sunpetal (supply, 2x2): a flower open to the sky: five broad rounded pearl petals spaced evenly round an ink
 *  core, each splayed well past the view angle so its inner face shows from above: violet glass with a light sweep
 *  in a pearl rim, a team band across the face at its root between ink seams; a team skirt round the core; the one
 *  deeplight on the pistil at the heart. Nothing pointed: round tips, no wedges. The Anemone beside it is thin
 *  curling tentacles, not petals. */
export function sunpetal(M) {
  const g = grp(), A = fam(M);
  plinth(g, M, 27, 0.35);
  add(g, cyl(9, 12.5, 14, 28), M.ink, 0, 11, 0);                                               // the ink core
  skirt(g, M, 12.9, 6.2, 8.4, 28);                                                             // the team skirt round it
  add(g, cyl(9.4, 9.4, 1, 28), M.shellDark, 0, 18.3, 0);                                       // the cup's floor, pearl in shade
  add(g, torus(9.2, 1.3, Math.PI * 2, 5), M.glaze, 0, 18.9, 0, Math.PI / 2, 0, -Math.PI / 2);    // the hub: a pentagonal team ring, a corner to each petal
  add(g, torus(9.2, 1.7, Math.PI * 2, 5), M.inkSeam, 0, 18.4, 0, Math.PI / 2, 0, -Math.PI / 2);  // its ink seam beneath
  add(g, cyl(1.6, 2.4, 9, 12), M.ring, 0, 22.5, 0);                                            // the pistil
  add(g, sph(2.2, 10, 8), M.inkSeam, 0, 27.4, 0);                                              // its ink socket
  deeplight(g, M, 1.9, 0, 28.6, 0);                                                            // the one light, at the heart
  const blade = petal(27, 21, 20, 0.08).map(([x, z]) => [z, x]);                                // a rounded petal, [across, up]
  const face = petal(14.5, 14, 18, 0.08).map(([x, z]) => [z, x + 11.6]);                           // its glass face, inside a pearl rim
  for (let k = 0; k < 5; k++) {                                                                // five, evenly spaced: one to the north
    const a = -Math.PI / 2 + k / 5 * Math.PI * 2, p = grp();
    p.position.set(Math.cos(a) * 8.5, 17.5, Math.sin(a) * 8.5); p.rotation.y = Math.PI / 2 - a; // local +z points outward
    const lean = grp(); lean.rotation.x = 1.0; p.add(lean);                                      // splayed past the view angle: its face to the sky
    upright(lean, blade, 2.4, 0.7, M.shell);                                                     // the petal, pearl
    upright(lean, face, 0.5, 0.1, A.petalGlass, -2.6);                                           // the violet glass face
    upright(lean, [[-8.6, 3.2], [8.6, 3.2], [8.8, 10.4], [-8.8, 10.4]], 0.6, 0.1, M.glaze, -2.7);      // the team band across the face above the hub, even in width
    upright(lean, [[-8.6, 2.4], [8.6, 2.4], [8.6, 3.2], [-8.6, 3.2]], 0.7, 0.1, M.inkSeam, -2.8);      // ink seams either side
    upright(lean, [[-8.9, 10.4], [8.9, 10.4], [9, 11.3], [-9, 11.3]], 0.7, 0.1, M.inkSeam, -2.8);
    upright(lean, [[-0.6, 9.5], [0.6, 9.5], [0.4, 25.5], [-0.4, 25.5]], 0.5, 0.1, M.shellLight, 0.4); // a lighter midrib up the back
    g.add(p);
  }
  return g;
}

/** A three-lobed plate (`tri` outline) with a square hole through it (the Siphon's plinth over the shaft's mouth). */
const holedTri = (r, k, depth, bevel, hole) => memo(`htri${r},${k},${depth},${bevel},${hole}`, () => {
  const sh = new THREE.Shape(tri(r, k).map(([x, z]) => new THREE.Vector2(x, -z))); sh.holes.push(squareHole(...hole));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.1, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, bevel, 0);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 16, uv.getY(i) / 16); return geo;
});
/** A band round a three-lobed outline: `w` thick inward from radius r, `h` tall, its foot at y 0. */
const triBand = (r, k, w, h) => memo(`tband${r},${k},${w},${h}`, () => {
  const sh = new THREE.Shape(tri(r, k).map(([x, z]) => new THREE.Vector2(x, -z))); sh.holes.push(new THREE.Path(tri(r - w, k).map(([x, z]) => new THREE.Vector2(x, -z)).reverse()));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 12 }); geo.rotateX(-Math.PI / 2); return boxUV(geo);
});
/** Siphon (economy, on a mine shaft, 2x2): a great pearl whorl, a moon-shell, that has settled on the shaft and drinks
 *  the last damp brine from the salt beds below. A low pearl dome on the family's three-lobed plinth, one dark groove
 *  spiralling from its rim in to its apex (the shell's read from above), a team cap on the apex in an ink seam; to the
 *  south-west its aperture, the lip lifted and flared in a thick pearl roll (a team band on its flare between ink seams)
 *  over the shaft's square dark mouth, the ink core in the gap under it and the one deeplight where it drinks; a team
 *  band round the plinth's foot. The mouth shows beside it, the shaft's own dark (ground.js `shaftPit`); no liquid, no green. Nothing
 *  stands up or points out (round 1 of the shaft: the upright straw read as a gun turret to all four testers). */
export function siphon(M) {
  const g = grp(), MX = -5, MZ = 9, MW = 15;                                                   // the shaft's mouth through the plinth
  add(g, holedTri(27, 0.25, 4, 1.5, [MX, MZ, MW / 2 + 1.5]), M.shellDeep, 0, 0, 0);            // the plinth, open over the mouth, a shade darker than the family's so the pale whorl is the read
  add(g, holedTri(24.3, 0.25, 3, 1.4, [MX, MZ, MW / 2 + 1.4]), M.shellDark, 0, 3.5, 0);
  add(g, triBand(28.9, 0.25, 1.0, 2.0), M.glaze, 0, 1.0, 0);                                    // a team band round the plinth's foot, between ink seams
  for (const y of [0.5, 3.0]) add(g, triBand(29.1, 0.25, 1.3, 0.5), M.inkSeam, 0, y, 0);
  shaftPit(g, MX, 6.5, MZ, MW);                                                                // the shaft going down, dark
  for (const [w, d, x, z] of [[MW + 3.4, 1.6, 0, MW / 2 + 0.8], [1.6, MW + 3.4, -MW / 2 - 0.8, 0], [1.6, MW + 3.4, MW / 2 + 0.8, 0]]) add(g, rbox(w, 1.3, d, 0.6), M.ring, MX + x, 6.9, MZ + z); // a pearl lip round it, the near edge lit
  // the whorl: a low pearl moon-shell dome settled on the plinth, a spiral groove from its rim in to its apex
  const C = [4, 6.5, -4], R = 15, H = 9.5, dome = (r) => H * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
  add(g, new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.shell, ...C).scale.set(1, H / R, 1);
  const TH = Math.asin(11.5 / R);                                                                // the body whorl's outer turn, team: a skirt round the dome's foot between ink seams
  add(g, new THREE.SphereGeometry(R + 0.15, 40, 6, 0, Math.PI * 2, TH, Math.PI / 2 - TH), M.glaze, ...C).scale.set(1, H / R, 1);
  add(g, torus(11.6, 0.5, Math.PI * 2, 48), M.inkSeam, C[0], C[1] + H * Math.cos(TH) + 0.1, C[2], Math.PI / 2, 0, 0);
  add(g, torus(R + 0.3, 0.55, Math.PI * 2, 48), M.inkSeam, C[0], C[1] + 0.4, C[2], Math.PI / 2, 0, 0);
  const spiral = (r0, turns, a0, dr = 0) => { const pts = []; for (let i = 0; i <= 96; i++) { const t = i / 96, a = a0 + t * turns * Math.PI * 2, r = r0 * Math.exp(-2.1 * t); pts.push(new THREE.Vector3(C[0] + Math.cos(a) * r, C[1] + dome(r) + dr, C[2] + Math.sin(a) * r)); } return new THREE.CatmullRomCurve3(pts); };
  add(g, new THREE.TubeGeometry(spiral(10.6, 1.9, 2.4, 0.15), 160, 0.75, 6), M.shellDeep, 0, 0, 0);   // the suture: one groove spiralling in, the shell's read
  add(g, new THREE.TubeGeometry(spiral(9.2, 1.9, 2.4, 0.35), 160, 0.6, 6), M.shellLight, 0, 0, 0);  // the whorl's lit shoulder beside it
  { const ar = 10.6 * Math.exp(-2.1), ax = C[0] + Math.cos(2.4 + 1.9 * Math.PI * 2) * ar * 0.5, az = C[2] + Math.sin(2.4 + 1.9 * Math.PI * 2) * ar * 0.5;   // the apex: a team cap in an ink seam
    add(g, new THREE.SphereGeometry(4.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glaze, ax, C[1] + H - 1.1, az).scale.set(1, 0.55, 1);
    add(g, torus(4.65, 0.45, Math.PI * 2, 32), M.inkSeam, ax, C[1] + H - 1.1, az, Math.PI / 2, 0, 0); }
  // the aperture, south-west over the mouth: the shell's lip lifted and flared, the ink core under it, a team band on it
  const LA = 2.36, lip = grp(); lip.position.set(C[0], C[1] + 1.2, C[2]); lip.rotation.y = -(LA - 1.1); g.add(lip);  // (the arc runs from LA - 1.1 to LA + 1.1)
  add(lip, torus(R + 0.6, 2.2, 2.2, 40), M.ring, 0, 0, 0, Math.PI / 2, 0, 0).scale.set(1, 1, 0.8);            // the lip, a thick pearl roll
  add(lip, torus(R + 3.1, 1.2, 2.2, 40), M.glaze, 0, 0.3, 0, Math.PI / 2, 0, 0);                            // its flare, team
  for (const r of [R + 1.7, R + 4.5]) add(lip, torus(r, 0.42, 2.2, 40), M.inkSeam, 0, 0.5, 0, Math.PI / 2, 0, 0);
  add(lip, new THREE.CylinderGeometry(R - 0.5, R - 0.5, 1.6, 40, 1, true, Math.PI / 2 - 2.2, 2.2), Object.assign(M.inkMatte ??= M.inkSeam.clone(), {}), 0, -0.4, 0); // the ink core in the gap beneath it
  deeplight(g, M, 1.3, C[0] + Math.cos(LA) * (R + 6), C[1] - 0.5, C[2] + Math.sin(LA) * (R + 6));   // the one light, where it drinks, over the dark
  return g;
}

/** Cradle (trains the line, 3x3): a scallop shell with something growing in it: a fan-shaped bowl, its flat hinge
 *  a team bar across the north, pearl flutes splaying from the hinge across the bowl's floor to a ridged rim wall
 *  (a knob on each ridge); the basin deep violet water (`violetWater`, never black); in it one big bud, violet
 *  under a pearl sheen with a pearl crown and a faint glow, and one deeplight at its foot. From above: a pale fan
 *  of ribs on violet, a bud at its heart; the Darkwater beside it is a flat ink pool with low thin arms. */
export function cradle(M) {
  const g = grp(), A = fam(M);
  plinth(g, M, 40, 0.2);
  const C = [0, 4], R = 30, A0 = -0.5, A1 = Math.PI + 0.5, N = 15, HZ = C[1] - 31, HW = 15;        // the fan: an arc of 237 degrees round C, closed to the north by a flat hinge 30 wide
  const fan = (k) => { const p = []; for (let i = 0; i <= 28; i++) { const a = A0 + (A1 - A0) * i / 28; p.push([C[0] + Math.cos(a) * R * k, C[1] + Math.sin(a) * R * k]); } p.push([-HW * k, C[1] + (HZ - C[1]) * k], [HW * k, C[1] + (HZ - C[1]) * k]); return p; };
  add(g, plate(fan(1.06), 5, 1), M.shellDark, 0, 4, 0);                                          // the bowl's floor, pearl in shade
  add(g, plate(fan(0.97), 1.2, 0.3), A.violetWater, 0, 8.6, 0);                                  // the basin: deep violet water
  for (let i = 0; i < 9; i++) {                                                                  // the flutes: pearl ribs splaying from the hinge across the floor to the rim
    const a = A0 + 0.15 + (A1 - A0 - 0.3) * i / 8, x0 = 0, z0 = HZ + 3, x1 = C[0] + Math.cos(a) * (R - 1.5), z1 = C[1] + Math.sin(a) * (R - 1.5);
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
    add(g, rbox(len, 1.6, 2.2, 0.6), M.shell, (x0 + x1) / 2, 9.6, (z0 + z1) / 2, 0, ry, 0);
  }
  add(g, torus(R, 3.2, A1 - A0, 48), M.shell, C[0], 12.2, C[1], Math.PI / 2, 0, A0);              // the rim wall round the arc
  add(g, torus(R - 0.4, 1.4, A1 - A0, 48), M.glaze, C[0], 15.4, C[1], Math.PI / 2, 0, A0);         // a team hoop along its crest
  add(g, torus(R + 1.4, 0.4, A1 - A0, 48), M.inkSeam, C[0], 15.3, C[1], Math.PI / 2, 0, A0); add(g, torus(R - 2.2, 0.4, A1 - A0, 48), M.inkSeam, C[0], 15.3, C[1], Math.PI / 2, 0, A0); // ink seams either side of it
  add(g, torus(R + 1.2, 2.4, A1 - A0, 48), M.glaze, C[0], 6.8, C[1], Math.PI / 2, 0, A0);         // the team band round the wall's foot
  add(g, torus(R + 1.8, 0.5, A1 - A0, 48), M.inkSeam, C[0], 9.4, C[1], Math.PI / 2, 0, A0);
  add(g, torus(R + 1.8, 0.5, A1 - A0, 48), M.inkSeam, C[0], 4.4, C[1], Math.PI / 2, 0, A0);
  for (let i = 0; i < N; i++) {                                                                  // the wall's ridges, leaning out, a knob on each
    const a = A0 + (A1 - A0) * (i + 0.5) / N, f = grp(); f.position.set(C[0] + Math.cos(a) * (R + 2.4), 11, C[1] + Math.sin(a) * (R + 2.4)); f.rotation.y = -a; g.add(f);
    add(f, rbox(2.6, 9.5, 3, 0.9), M.shellLight, 0, 0, 0, 0, 0, -0.22);
    add(f, sph(1.7, 10, 8), M.ring, -1.2, 5.4, 0);
  }
  for (const side of [-1, 1]) {                                                                  // the straight edges from the arc's ends to the hinge, team-capped
    const ax = C[0] + Math.cos(A0) * R * side, az = C[1] + Math.sin(A0) * R, bx = side * HW, bz = HZ, ry = -Math.atan2(bz - az, bx - ax), len = Math.hypot(bx - ax, bz - az);
    add(g, rbox(len, 9, 3.4, 1.2), M.shell, (ax + bx) / 2, 10.5, (az + bz) / 2, 0, ry, 0);
    add(g, rbox(len, 2.2, 3.8, 0.5), M.glaze, (ax + bx) / 2, 15.2, (az + bz) / 2, 0, ry, 0); add(g, rbox(len + 0.2, 0.5, 4, 0.2), M.inkSeam, (ax + bx) / 2, 13.9, (az + bz) / 2, 0, ry, 0);
  }
  add(g, rbox(2 * HW + 4, 11, 8, 2), M.glaze, 0, 9.5, HZ - 1);                                   // the hinge: a flat team bar across the north
  add(g, rbox(2 * HW + 4.4, 0.6, 8.4, 0.2), M.inkSeam, 0, 4.3, HZ - 1); add(g, rbox(2 * HW + 4.4, 0.6, 8.4, 0.2), M.inkSeam, 0, 14.9, HZ - 1);
  add(g, rbox(2 * HW, 2.2, 6, 0.7), M.ink, 0, 16, HZ - 1); add(g, rbox(2 * HW - 6, 1.2, 4, 0.5), M.ring, 0, 17.6, HZ - 1); // an ink cap, a pearl ridge
  const bud = grp(); bud.position.set(-2, 10, 3); g.add(bud);                                   // the bud: big, an egg standing in the water
  add(bud, sph(8, 20, 16), A.bud, 0, 6, 0).scale.set(1, 1.3, 1);                                 // violet under a pearl sheen
  add(bud, sph(6.6, 18, 14), M.shellLight, 0, 11.2, 0).scale.set(1, 1.05, 1);                    // its pearl crown, the top half
  add(bud, sph(10.5, 14, 10), M.deepHalo2, 0, 6, 0).scale.set(1, 1.2, 1);                        // a faint glow round it
  add(bud, cyl(4.6, 5.2, 1.4, 16), M.glaze, 0, 17.6, 0); add(bud, cyl(5.3, 5.3, 0.5, 16), M.inkSeam, 0, 16.7, 0); add(bud, sph(2.4, 10, 8), M.ring, 0, 18.9, 0); // a team collar under a pearl tip
  deeplight(g, M, 1.5, 8, 10.6, 11);                                                             // the one light, at the bud's foot
  return g;
}

/** Anemone (defence, 2x2): an anemone that stings: a fat ink column on a pearl foot, a pearl oral disc with a team
 *  rim round a dark violet mouth lit from within, and five soft pearl tentacles curling out, up and in from the
 *  disc, each tapering to a blue-violet tip (deeplight, never a pale bulb); a tall team collar round the column, a
 *  hoop on the foot, a team sleeve on each tentacle's middle, all between ink seams. Low and curled, so its
 *  shadows stay short. From above: five curling arms with violet tips round a pale disc: nothing like petals. */
export function anemone(M) {
  const g = grp(), A = fam(M);
  plinth(g, M, 27, 0.4);
  add(g, lathe([[0, 0], [16, 0], [15, 2.5], [12.5, 5], [11.5, 8]], 32), M.shell, 0, 6.5, 0);     // the pearl foot
  hoop(g, M, 13.6, 2.6, 9.6, 36);                                                               // a team hoop round its slope
  add(g, cyl(10.5, 12.5, 13, 28), M.ink, 0, 17, 0);                                            // the ink column
  skirt(g, M, 12.2, 6.4, 15, 28);                                                              // the team collar
  add(g, cyl(12.5, 10.5, 3, 28), M.shell, 0, 24.5, 0);                                         // the oral disc
  hoop(g, M, 11.3, 3.2, 26, 36);                                                               // its team rim
  add(g, cyl(7, 7.5, 1.4, 20), A.mouth, 0, 26.4, 0);                                           // the mouth: dark violet, lit from within
  add(g, torus(4.2, 0.5, Math.PI * 2, 24), M.shellDeep, 0, 27.1, 0, Math.PI / 2, 0, 0);         // a faint pearl ring in it
  for (let k = 0; k < 5; k++) {                                                                 // five tentacles, one to the north, curling out, up and in
    const a = -Math.PI / 2 + k / 5 * Math.PI * 2, x = Math.cos(a), z = Math.sin(a), t = Math.sin(k * 2.1) * 0.6;
    const P = [[10, 26], [15.5, 27.5], [20, 30.5], [22.5, 35], [21.5, 39.5 + t], [18.5, 42 + t]].map(([r, y]) => [x * r, y, z * r]);
    tentacle(g, M, P, 2.6, 1.3, [1, 2]);
    add(g, sph(2, 12, 10), M.deeplight, ...P[5]);                                              // the stinging tip: blue-violet, no white heart
    add(g, sph(3.2, 10, 8), M.deepHalo1, ...P[5]); add(g, sph(4.6, 10, 8), M.deepHalo2, ...P[5]);
  }
  return g;
}

/** Gyre (trains flyers, 3x3): a tall spiral open to the sky: a cone of coil, a flat pearl rail winding two turns up
 *  and inward from a wide base turn to a tight top turn, tapering as it climbs, a team stripe along its outer
 *  edge between ink seams so the turns part; a short ink core inside its foot, the top end to the south under a
 *  deeplight; a team skirt round the base drum. From above: a spiral narrowing to its centre, the only coil. */
export function gyre(M) {
  const g = grp();
  plinth(g, M, 43, 0.2);
  add(g, cyl(13, 17, 10, 36), M.ink, 0, 9, 0);                                                 // the base drum
  skirt(g, M, 17.3, 7, 8.6, 36);
  add(g, cyl(5, 8, 24, 20), M.ink, 0, 26, 0);                                                  // a short ink core the coil winds up round
  add(g, torus(6.4, 0.5, Math.PI * 2, 24), M.shellDeep, 0, 30, 0, Math.PI / 2, 0, 0);
  const H = { a0: -Math.PI / 2, turns: 2, r0: 38, r1: 10, y0: 14, y1: 56, lin: true };          // the helix: two turns, wide at the foot, tight at the top; both ends to the south
  add(g, ribbon(H, 9.5, 4.5, 2.4), M.shell, 0, 0, 0);                                          // the rail
  add(g, ribbon({ ...H, r0: H.r0 + 2.7, r1: H.r1 + 1.2 }, 4.2, 2.2, 2.9), M.glaze, 0, 0, 0);    // the team stripe along its outer edge
  add(g, ribbon({ ...H, r0: H.r0 + 0.4, r1: H.r1 - 0.05 }, 0.6, 0.5, 3.1), M.inkSeam, 0, 0, 0);  // the ink seam inside it (its outer edge is the rail's)
  const ex = Math.cos(H.a0) * H.r1, ez = -Math.sin(H.a0) * H.r1;                                 // the rail's top end
  add(g, sph(3.2, 14, 10), M.ring, ex, H.y1, ez).scale.set(1.2, 0.7, 1.2);                       // a pearl knob ends it
  add(g, sph(2.2, 10, 8), M.inkSeam, ex, H.y1 + 3.4, ez); deeplight(g, M, 1.7, ex, H.y1 + 4.7, ez); // the light at the end
  for (const u of [0.18, 0.42, 0.7]) {                                                          // pearl struts from the plinth up to the rail's underside
    const a = H.a0 + u * H.turns * Math.PI * 2, r = H.r0 + (H.r1 - H.r0) * u, y = H.y0 + (H.y1 - H.y0) * u;
    limb(g, [Math.cos(a) * (r + 1), 6, -Math.sin(a) * (r + 1)], [Math.cos(a) * r, y - 1.2, -Math.sin(a) * r], 1.5, M.shellDark);
  }
  return g;
}

/** Darkwater (the lurker's building, 2x2): the dark pool: a flat, wide, still pool of ink (`poolDeep`, the darkest
 *  thing in it) filling a low basin, four thin pearl arms rising at its rim on the diagonals and leaning outward,
 *  low, with the pool open between them; a team band round the basin, a sleeve on each arm and its root block,
 *  between ink seams; the one deeplight sunk at the centre, dim. Nothing enclosed: the pool is the signature. */
export function darkwater(M) {
  const g = grp();
  plinth(g, M, 28, 0.3);
  add(g, cyl(24.5, 26.5, 7, 40), M.ink, 0, 4.5, 0);                                             // the basin, low and wide
  skirt(g, M, 26.9, 5.8, 4.2, 40);                                                             // the team band round it
  add(g, cyl(23.4, 23.4, 0.6, 40), M.poolDeep, 0, 8, 0);                                       // the ink pool, wide and still
  add(g, torus(24, 1.1, Math.PI * 2, 48), M.shellDark, 0, 8.1, 0, Math.PI / 2, 0, 0);          // a thin rim, pearl in shade
  for (let k = 0; k < 4; k++) {                                                                 // the arms, at the diagonals: thin, low, leaning out
    const a = Math.PI / 4 + k / 2 * Math.PI, x = Math.cos(a), z = Math.sin(a);
    const P = [[24, 8.5], [26, 15], [29.5, 20.5], [32, 23.5]].map(([r, y]) => [x * r, y, z * r]);
    limb(g, P[0], P[1], 2.2, M.shell);
    limb(g, P[1], P[2], 2.1, M.glaze);                                                         // the team sleeve
    add(g, sph(2.4, 10, 8), M.inkSeam, ...P[1]); add(g, sph(2.3, 10, 8), M.inkSeam, ...P[2]);  // ink seams either end of it
    limb(g, P[2], P[3], 1.7, M.shell);
    add(g, sph(2, 10, 8), M.ring, ...P[3]);                                                    // the tip
    add(g, rbox(8, 3.6, 9.5, 1), M.glaze, x * 24.5, 9.8, z * 24.5, 0, -a, 0);                  // its root on the rim, team glaze
    add(g, rbox(8.4, 0.5, 9.9, 0.15), M.inkSeam, x * 24.5, 8.1, z * 24.5, 0, -a, 0);           // an ink seam under it
  }
  deeplight(g, M, 1.2, 0, 8.3, 0);                                                             // the one light, sunk in the ink
  return g;
}
