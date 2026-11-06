// Harbour buildings (STYLE.md, "Harbour buildings"): the seven after the Lighthouse (harbour.js, step 0, the
// reference). Dark tarred hulls, timber and iron under pale canvas, on a slate quay; team canvas between ink seams on
// at least a sixth of what the camera sees, never a flat shape on the ground. Each has a roof silhouette of its own from
// above: the Windmast's dark mast through three square sails framed in tar, the Pump's pump jack (an A-frame, a
// nodding beam, a small horse-head over a pool of brine, team counterweights), the Crew Hall's long dark gable with a
// shade along its wall over a drill yard with a flag, the Workshop's dark iron slope with a pale vent beside a short
// pale derrick, the Slipway's sharp-bowed open hull on a slip into water, the Lookout's tripod tower with a crow's
// nest (the gun turns on it, a sprite apart), the Loft's launch deck with Kites parked on it beside a hangar tent. Big roofs are weathered cloth that sags
// between supports (`sagQuad`) with worn hems (`wornHem`), never flat fills. Same conventions as models.js: game units
// (1 tile = 32), buildings centred on their footprint, y up, +z south; the camera looks from the south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './models.js';
import { lathe, torus } from './harbour.js';

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const oct = (r, k = 0.42) => { const c = r * k; return [[-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c]]; };
/** A gable roof: a prism along x (`len`), `w` wide, `h` to the ridge, its base at y 0. */
const gable = (len, w, h) => memo(`gb${len},${w},${h}`, () => {
  const s = new THREE.Shape([new THREE.Vector2(w / 2, 0), new THREE.Vector2(-w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-len / 2, 0, 0); g.computeVertexNormals(); return boxUV(g);
});
/** An open-ended cylinder (a dodger, a ring): `cyl` is capped, and a cap over an open nest hid its deck. */
const tube = (rt, rb, h, seg = 28) => memo(`tu${rt},${rb},${h},${seg}`, () => boxUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true)));
/** A cylinder from point a to point b (a pole, a line, a brace). */
function pole(parent, a, b, r, mat, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const m = new THREE.Mesh(memo(`po${r},${len.toFixed(2)},${seg}`, () => boxUV(new THREE.CylinderGeometry(r, r, len, seg))), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m); return m;
}
/** A point `t` of the way from a to b. */
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** A cloth patch over four corners (a, b one edge, the eave; c, d the far edge, the ridge, so a-b-c-d go round; c = d
 *  makes a triangle), sagging `sag` in from its outward face between `bays` supports along a-b and towards the middle
 *  from the eave to the ridge, the whole lifted `lift` off the corners' plane: lit cloth, never a flat fill. */
function sagQuad(a, b, c, d, bays = 1, sag = 1, lift = 0) {
  const V = (p) => new THREE.Vector3(...p), A = V(a), B = V(b), C = V(c), D = V(d);
  const n = B.clone().sub(A).cross(D.clone().sub(A)).normalize(); if (n.y < 0) n.negate();
  const NU = 8 * bays, NV = 8, pos = [], idx = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const u = i / NU, v = j / NV, e = A.clone().lerp(B, u), r = D.clone().lerp(C, u), p = e.lerp(r, v);
    p.addScaledVector(n, lift - sag * Math.abs(Math.sin(Math.PI * u * bays)) * Math.sin(Math.PI * Math.min(1, v * 1.15)) ** 0.7);
    pos.push(p.x, p.y, p.z);
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const q = j * (NU + 1) + i; idx.push(q, q + 1, q + NU + 1, q + 1, q + NU + 2, q + NU + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx); g.computeVertexNormals(); return boxUV(g);
}
/** A worn hem along p-q: dark lengths of uneven thickness, end to end (a cloth's edge, mended), `r` its mean radius. */
function wornHem(parent, p, q, r, mat) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), n = Math.max(2, Math.round(len / 4.5)), W = [1, 0.7, 1.25, 0.85, 1.1, 0.75, 1.3, 0.95];
  for (let k = 0; k < n; k++) pole(parent, lerp3(p, q, k / n), lerp3(p, q, (k + 1) / n), r * W[k % W.length], mat, 6);
}

/** The family's own materials, made once per material set: the seep's brine (dark, no light: salt carries none), a salt
 *  pan's crust, a hull's inside, two-sided canvas for sails and dodgers seen from both faces, the Workshop's sparks. */
function bldgMats(M) {
  if (M.brine) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.brine = std({ color: 0x3a4a50, roughness: 0.12, metalness: 0.35 });                                        // the well's brine: grey-green with a wet sheen, no light (a band above the ground, not a blot)
  M.saltPan = std({ color: 0xd8d4c6, roughness: 0.9, metalness: 0, flatShading: true });                        // the pan's salt crust, pale by itself
  M.tarIn = std({ color: 0x3a3632, map: M.tar.map, roughness: 0.7, metalness: 0.2, side: THREE.BackSide });    // a hull's inside, seen through its open top
  M.canvas2 = std({ color: 0xd4ccb6, map: M.canvas.map, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  M.canvasDark2 = std({ color: 0x8f8872, map: M.canvas.map, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  M.paintCanvas2 = M.paintCanvas.clone(); M.paintCanvas2.side = THREE.DoubleSide; M.paintCanvas2.userData.team = 1; // team canvas seen from both faces (a dodger's inside, a sail)
  M.paintWorn = M.paintCanvas2.clone(); M.paintWorn.color.multiplyScalar(0.8); M.paintWorn.userData.team = 1;   // weathered team canvas for the big roofs: a band below fresh paint, so a white seat's roof is no flat white plane
  M.inkLine2 = std({ color: 0x08080a, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  M.tar2 = M.tar.clone(); M.tar2.side = THREE.DoubleSide;                                                       // tar seen from both faces (a tent's sod-cloth, the Slipway's hull)
  M.tarIn2 = M.tarIn.clone(); M.tarIn2.side = THREE.DoubleSide;                                                 // a hull's inside, both faces
  M.kiteCloth = std({ color: 0xc6bc9e, map: M.canvas.map, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });  // the Loft's kites: Harbour cream, a band below pale canvas, never the Vael's pearl
  M.spark = std({ color: 0xffb890, emissive: 0xff6a28, emissiveIntensity: 3.2, toneMapped: false });          // the Workshop's sparks: orange specks over the anvil
  M.hearth = std({ color: 0x3a0500, emissive: 0xff2a08, emissiveIntensity: 1.5 });                            // the hearth's glow, small, orange-red (yellow merged with the gold seat)
  return M;
}

/** A team canvas sheet (`w` along x, `d` along z) with its ink hem just beneath it, tilted by rx, rz. */
function tarp(g, M, w, d, x, y, z, rx = 0, rz = 0, mat = M.paintCanvas) {
  add(g, rbox(w, 0.8, d, 0.3), mat, x, y, z, rx, 0, rz);
  add(g, rbox(w + 0.5, 0.35, d + 0.5, 0.1), M.inkLine, x, y - 0.5, z, rx, 0, rz);
}
/** Mooring posts along a quay's edge, their tops painted team (the family's trait on the quay, from the Lighthouse). */
function posts(g, M, list) {
  for (const [x, z] of list) { add(g, rbox(2.4, 2.4, 2.4, 0.3), M.slate, x, 5, z); add(g, rbox(2.5, 0.6, 2.5, 0.1), M.paintCanvas, x, 6.4, z); add(g, rbox(2.6, 0.25, 2.6, 0.05), M.inkLine, x, 6.0, z); }
}
/** Crates stacked `n` high under a lashed team tarp, as on the Lighthouse's quay. */
function crates(g, M, x, z, n, y0 = 4) {
  for (let k = 0; k < n; k++) { add(g, rbox(10 - k * 1.5, 5, 10 - k * 1.5, 0.4), M.timber, x + k * 0.8, y0 + 2.5 + k * 5, z - k * 0.6); add(g, rbox(10.3 - k * 1.5, 0.8, 10.3 - k * 1.5, 0.2), M.ironDark, x + k * 0.8, y0 + 2.5 + k * 5, z - k * 0.6); }
  const tx = x + (n - 1) * 0.8, tz = z - (n - 1) * 0.6, ty = y0 + 0.5 + n * 5;
  add(g, rbox(13, 1, 13, 0.5), M.paintCanvas, tx, ty, tz); add(g, rbox(13.3, 0.4, 13.3, 0.2), M.inkLine, tx, ty - 0.7, tz);
  for (const dz of [-3, 3]) add(g, rbox(0.5, 1.4, 12.4, 0.15), M.rope, tx + dz, ty + 0.1, tz);
}
/** A tarred cask with two iron hoops, standing. */
function barrel(g, M, x, z, y0 = 4, r = 2.8, h = 6.5) {
  add(g, cyl(r, r * 0.9, h, 14), M.tar, x, y0 + h / 2, z);
  for (const y of [0.25, 0.75]) add(g, cyl(r + 0.25, r + 0.25, 0.7, 14), M.ironDark, x, y0 + h * y, z);
  add(g, cyl(r - 0.4, r - 0.4, 0.4, 14), M.timber, x, y0 + h + 0.1, z);
}
/** A pale canvas salt sack, tied with a team cord (the Rigger's), leaning. */
function sack(g, M, x, z, y0 = 4, ry = 0) {
  const s = grp(); s.position.set(x, y0, z); s.rotation.y = ry; g.add(s);
  add(s, sph(3.2, 14, 10), M.canvas, 0, 3.4, 0).scale.set(1, 1.15, 0.9);
  add(s, sph(1.8, 10, 8), M.canvas, 0.6, 7.4, 0).scale.set(0.9, 0.7, 0.9);
  add(s, cyl(1.7, 1.9, 0.7, 12), M.paintCanvas, 0.5, 6.6, 0); add(s, cyl(1.95, 1.95, 0.25, 12), M.inkLine, 0.5, 6.2, 0); add(s, cyl(1.95, 1.95, 0.25, 12), M.inkLine, 0.5, 7.0, 0);
}
/** A team pennant on a pole's top: a tapered flag flying to the east, its ink hem. */
function pennant(g, M, x, y, z, len = 12, h = 4.5) {
  add(g, plate([[0, -h], [len, -h * 0.3], [len, h * 0.3], [0, h]], 0.5, 0.15), M.paintCanvas2, x, y, z, -Math.PI / 2, 0, 0);
  add(g, rbox(0.5, h * 2 + 0.6, 0.9, 0.1), M.inkLine2, x + 0.1, y, z); for (const s of [-1, 1]) add(g, rbox(len, 0.5, 0.9, 0.1), M.inkLine2, x + len / 2, y + s * h * 0.65, z, 0, 0, -s * Math.atan2(h * 0.7, len));
}

/** A square sail's cloth between v0 and v1 (0 the head, 1 the foot): a trapezoid `wt` wide at the head, `wb` at the foot,
 *  `h` deep, hanging down from its origin (the head yard's centre) and bellied `bulge` towards +z, its edges straight. */
const sailGeo = (wt, wb, h, bulge, v0 = 0, v1 = 1) => memo(`sa${wt},${wb},${h},${bulge},${v0},${v1}`, () => {
  const NU = 10, NV = 6, pos = [], idx = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const u = i / NU, v = v0 + (v1 - v0) * j / NV, w = wt + (wb - wt) * v;
    pos.push((u - 0.5) * w, -v * h, bulge * Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.setIndex(idx); g.computeVertexNormals(); return boxUV(g);
});
/** One square sail on its yard, ship-fashion, hung from (0, y, z) of `rig`: team canvas framed all round in tar (the
 *  yard across the head with its yardarm bands, tarred bolt-ropes down both leeches and along the foot), bellied south
 *  away from the camera, hung on the mast's far side so the dark mast runs down its face, leaning foot-south (`lean`). */
function squareSail(rig, M, y, z, wt, wb, h, lean = 0.12) {
  const s = grp(); s.position.set(0, y, z); s.rotation.x = -lean; rig.add(s);
  add(s, sailGeo(wt, wb, h, -1.1), M.paintCanvas2, 0, 0, 0);                                                    // the cloth, team, bellied away (north)
  add(s, cyl(1.2, 1.2, wt + 11, 10), M.tar, 0, 0.6, 0.6, 0, 0, Math.PI / 2);                                     // the yard, tarred, its ends well past the cloth
  for (const sx of [-1, 1]) add(s, cyl(1.45, 1.45, 1.4, 10), M.ironDark, sx * (wt / 2 + 4.6), 0.6, 0.6, 0, 0, Math.PI / 2); // its yardarm bands
  for (const sx of [-1, 1]) pole(s, [sx * wt / 2, 0, 0], [sx * wb / 2, -h, 0], 0.8, M.tar, 8);                   // the leeches' bolt-ropes, tarred
  pole(s, [-wb / 2, -h, 0], [wb / 2, -h, 0], 0.8, M.tar, 8);                                                       // the foot's
  for (const sx of [-1, 1]) pole(s, [sx * wb / 2, -h, 0], [sx * (wb / 2 + 3), -h - 5, 0.5], 0.3, M.rope).userData.noShadow = true; // the sheets, down from the clews
  return s;
}

/** Windmast (depot, 2x2): a square tarred store with a timber deck on top, two team canvas doors on its south face; out
 *  of it a tarred ship's mast (to 75, iron bands) carrying three square sails, ship-fashion, one over another and
 *  narrowing upward (a course, a topsail, a topgallant), hung on the mast's far side so the dark mast runs down their
 *  faces: team canvas bellied away, framed all round in tar, on tarred yards whose ends reach well past the cloth; a
 *  small top over the course, a team pennant at the truck. Casks under a team lean-to south, crates under tarps, a coil,
 *  posts. From above: a dark mast through a stack of three framed trapezoids, yard ends out to the sides; nothing
 *  radial (round 2's rotor read as propellers; round 3's sails hid the mast and read as a pagoda roof). */
export function windmast(M) {
  bldgMats(M);
  const g = grp();
  add(g, plate(oct(29), 4, 1.2), M.flagstone, 0, 0, 0);
  posts(g, M, [[-26, 24], [-10, 27], [10, 27], [26, 24]]);
  // the store
  add(g, rbox(30, 13, 28, 0.8), M.tar, 0, 10.5, -2);
  for (const x of [-10, 0, 10]) add(g, rbox(1.2, 13, 28.4, 0.3), M.tar, x, 10.5, -2);                            // tarred ribs
  add(g, rbox(31, 1.6, 29, 0.4), M.ironDark, 0, 4.8, -2);                                                     // plinth band
  add(g, rbox(32, 1.6, 30, 0.4), M.timber, 0, 17.6, -2);                                                      // the deck
  for (let x = -12; x <= 12; x += 6) add(g, rbox(0.6, 0.4, 29, 0.1), M.oilskin, x, 18.5, -2);                    // plank seams
  add(g, rbox(6, 1.2, 6, 0.3), M.timber, -10, 19, 6); add(g, rbox(6.3, 0.5, 6.3, 0.1), M.ironDark, -10, 19.1, 6);  // a hatch
  for (const x of [-7.5, 7.5]) { add(g, rbox(10.5, 10, 0.8, 0.3), M.paintCanvas, x, 9.2, 12.4); add(g, rbox(11.5, 11, 0.5, 0.1), M.inkLine, x, 9.2, 12.1); } // team canvas doors, south, in ink frames
  add(g, rbox(0.8, 10, 1, 0.2), M.inkLine, 0, 9.2, 12.5);
  // the mast
  const MZ = -6, TOP = 75;
  add(g, cyl(1.8, 2.5, TOP - 18, 10), M.tar, 0, 18 + (TOP - 18) / 2, MZ);                                     // the mast, tarred: a dark line down the sails' faces
  for (const y of [24, 31, 43, 47, 59, 63]) add(g, cyl(2.5, 2.5, 1.1, 10), M.ironDark, 0, y, MZ);                // iron bands, two over each sail
  add(g, rbox(8, 1, 6, 0.3), M.timber, 0, 39.5, MZ + 0.5); add(g, rbox(8.4, 0.5, 6.4, 0.1), M.ironDark, 0, 39, MZ + 0.5); // the top, over the course's yard
  add(g, sph(0.8, 8, 6), M.brass, 0, TOP + 0.8, MZ);                                                          // the truck (a tip)
  pennant(g, M, 0.3, TOP - 2.5, MZ, 9, 2.6);                                                                   // a team pennant
  // the three sails, braced a little to the wind, one over another
  const rig = grp(); rig.position.set(0, 0, MZ - 3.4); rig.rotation.y = 0.18; g.add(rig);
  squareSail(rig, M, 35, 0, 28, 31, 10.5);                                                                     // the course
  squareSail(rig, M, 51.5, 0, 22, 25, 9.5);                                                                     // the topsail
  squareSail(rig, M, 67, 0, 16, 19, 8);                                                                         // the topgallant
  // the lean-to south of the store: casks under team canvas
  for (const [x, z] of [[-10, 21], [-2, 21], [6, 21]]) barrel(g, M, x, z);
  for (const x of [-15, 11]) add(g, cyl(0.7, 0.7, 12, 8), M.timber, x, 10, 24.5);
  tarp(g, M, 28, 10, -2, 16.2, 22.5, 0.14, 0);
  add(g, rbox(0.6, 1.4, 10.4, 0.2), M.rope, -2, 16.9, 22.5, 0.14);                                               // a rope seam over it
  crates(g, M, -22, -18, 2); crates(g, M, 22, 16, 2);
  add(g, torus(3.2, 1.1, 20), M.rope, 21, 5.1, -18, Math.PI / 2, 0, 0);
  sack(g, M, -24, -2, 4, 0.4);
  return g;
}

/** A vertical profile: a `plate` outline given as [x, up] points, standing in the xy plane, `t` thick about z 0. */
const profile = (pts, t, bevel = 0.3) => memo(`pf${JSON.stringify(pts)},${t},${bevel}`, () => { const g = plate(pts, t, bevel).clone(); g.rotateX(-Math.PI / 2); g.translate(0, 0, t / 2); return g; });
/** Points round an arc about (cx, cy), radius r, from angle a0 to a1 (radians), n steps. */
const arc = (cx, cy, r, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
/** An irregular blob's outline round (0, 0), radius r, its wobble fixed. */
const blob = (r, ph = 0) => Array.from({ length: 28 }, (_, i) => { const a = i / 28 * Math.PI * 2, k = 1 + 0.1 * Math.sin(3 * a + ph) + 0.06 * Math.sin(5 * a + 2 * ph); return [Math.cos(a) * r * k, Math.sin(a) * r * k * 0.85]; });

/** Pump (extractor, 2x2): round 3's pump jack, the nodding donkey, along x on an iron skid, cleared at 1x. A tarred
 *  A-frame (the samson post, two A's astride) carries a timber walking beam on its saddle, nodding: tilted 0.42, its east
 *  end down over the well, its west end up. At the east end a small horse-head (r 8, timber cheeks in an iron face) hangs
 *  the bridle and the rod straight down into the wellhead; at the west end the pitman arms come up from two cranks on
 *  the gearbox, each carrying a heavy counterweight painted team behind an ink rim. The well: an iron casing standing in
 *  a spreading pool of brine (wet, a sheen, no light) on a pale salt crust, a flow line north to a salt pan. An engine
 *  house north-west under a team tarp, a team windbreak behind the pan. No sacks, crates or casks. (Round 2's pale level
 *  beam read as a telescope; round 4's big pale horse-head as a dial or a wheel.) */
export function pump(M) {
  bldgMats(M);
  const g = grp();
  add(g, plate(oct(30), 4, 1.2), M.flagstone, 0, 0, 0);
  posts(g, M, [[-27, 24], [-12, 27], [27, 24]]);
  // the well, east: a pool of brine on a salt crust, the casing standing in it
  const WX = 16.5, WZ = 0;
  add(g, plate(blob(12.5), 0.9, 0.3), M.saltPan, WX - 1, 4, WZ + 4);                                             // the crust
  add(g, plate(blob(10.6, 0.9), 1.1, 0.3), M.brine, WX - 1, 4.1, WZ + 4.4);                                    // the brine, spreading south
  add(g, torus(3.4, 0.35, 20), M.saltPan, WX, 5.3, WZ, Math.PI / 2, 0, 0);                                         // a ripple of salt round the casing
  add(g, cyl(2, 2, 5, 12), M.ironDark, WX, 7, WZ);                                                              // the casing, down into the well
  for (const y of [5.6, 9.4]) add(g, cyl(2.8, 2.8, 0.9, 12), M.ironDark, WX, y, WZ);                             // its flanges
  add(g, cyl(1.5, 1.8, 2.4, 10), M.ironDark, WX, 11, WZ);                                                       // the stuffing box
  add(g, cyl(1.1, 1.1, 5, 8), M.ironDark, WX, 7.6, WZ - 3, Math.PI / 2, 0, 0);                                   // the tee
  pole(g, [WX, 7.6, WZ - 5.4], [WX - 1, 6.2, -14], 1, M.ironDark);                                              // the flow line, north to the salt pan
  // the skid and the samson post
  add(g, rbox(34, 2, 7, 0.4), M.ironDark, -5, 5, 0);
  const PV = [-1, 31, 0];
  for (const sz of [-1, 1]) {
    for (const x of [-9, 7]) pole(g, [x, 5.5, sz * 4.2], [PV[0], PV[1] - 1.5, sz * 2.6], 1.5, M.tar);
    pole(g, [-6.4, 14, sz * 3.7], [4.4, 14, sz * 3.7], 0.7, M.timber);                                              // a tie across each A
  }
  add(g, rbox(4, 3, 7, 0.4), M.ironDark, PV[0], PV[1] - 1, PV[2]);                                               // the saddle bearing
  // the walking beam, nodding: east end down over the well
  const TILT = -0.42, beam = grp(); beam.position.set(...PV); beam.rotation.z = TILT; g.add(beam);
  add(beam, rbox(30, 4.2, 3.2, 0.5), M.timber, -2, 2.1, 0);                                                     // the beam, timber: a mid value, not cream
  for (const x of [-14, -8, 4]) add(beam, rbox(1, 4.6, 3.6, 0.2), M.ironDark, x, 2.1, 0);                         // iron straps
  add(beam, rbox(4, 4.9, 3.9, 0.3), M.ironDark, 0, 2.1, 0);                                                     // the centre bearing's strap
  // the horse-head: a small quadrant whose face is an arc, timber cheeks inside an iron face (round 4's big pale one read as a dial)
  const HC = [12, -4], HR = 8;
  add(beam, profile([[9.6, 4.2], ...arc(HC[0], HC[1], HR, 0.86, -Math.PI / 2, 16), [9.6, -4 - HR]], 3.4), M.ironDark, 0, 0, 0);
  add(beam, profile([[10, 3.7], ...arc(HC[0], HC[1], HR - 1.1, 0.84, -Math.PI / 2, 16), [10, -4 - HR + 1.1]], 4.2), M.timber, 0, 0, 0);
  // the bridle: from the arc's foremost point straight down to the carrier bar, the rod on into the stuffing box
  const c = Math.cos(TILT), sn = Math.sin(TILT), HX = PV[0] + HC[0] * c - HC[1] * sn + HR, HY = PV[1] + HC[0] * sn + HC[1] * c;
  for (const dz of [-1.3, 1.3]) pole(g, [HX, HY, dz], [HX, 16.5, dz], 0.3, M.ironDark).userData.noShadow = true;
  add(g, rbox(2, 1.2, 4, 0.3), M.ironDark, HX, 16, 0);                                                          // the carrier bar
  pole(g, [HX, 16, 0], [WX, 12, WZ], 0.55, M.ironDark).userData.noShadow = true;                                 // the polished rod, down into the well
  // the tail: the equaliser across the beam's west end, pitman arms down to the cranks, counterweights painted team
  const TX = PV[0] - 16 * c, TY = PV[1] - 16 * sn, SH = [-16, 16.5];                                               // the beam's tail; the crank shaft
  add(g, rbox(2.4, 2, 11, 0.4), M.ironDark, TX, TY, 0);
  add(g, rbox(9, 11, 7, 0.6), M.ironDark, -16, 10.5, 0);                                                         // the gearbox
  add(g, cyl(1.4, 1.4, 15, 10), M.ironDark, SH[0], SH[1], 0, Math.PI / 2, 0, 0);                                 // the crank shaft
  const PIN = [SH[0] + 2.4, SH[1] + 5];
  for (const sz of [-1, 1]) {
    const z = sz * 6.6, cw = grp(); cw.position.set(SH[0], SH[1], z); g.add(cw);
    add(cw, profile([[-1.4, -1.4], [PIN[0] - SH[0] + 1, PIN[1] - SH[1] - 0.6], [PIN[0] - SH[0] + 0.2, PIN[1] - SH[1] + 1.2], [-1.6, 1.2]], 1.6), M.ironDark, 0, 0, 0); // the crank arm
    add(cw, profile([...arc(0, 0, 12.6, 3.4, 5.0, 14), ...arc(0, 0, 2.6, 5.0, 3.4, 6)], 1.8, 0.2), M.inkLine, 0, 0, 0); // the counterweight's ink rim
    add(cw, profile([...arc(0, 0, 12, 3.45, 4.95, 14), ...arc(0, 0, 3.2, 4.95, 3.45, 6)], 2.6, 0.4), M.paintCanvas, 0, 0, 0);   // the counterweight, team paint
    pole(g, [PIN[0], PIN[1], z], [TX + 0.2, TY, sz * 5.2], 0.9, M.ironDark);                                     // the pitman arm
  }
  // the engine house, north-west: tarred, a team tarp roof, its exhaust
  const EX = -15, EZ = -15;
  add(g, rbox(18, 10, 13, 0.8), M.tar, EX, 9, EZ);
  add(g, rbox(18.6, 1.4, 13.6, 0.3), M.ironDark, EX, 4.7, EZ);
  tarp(g, M, 25, 19, EX, 15.6, EZ, 0.18, 0);
  for (const x of [-7, 0, 7]) add(g, rbox(0.6, 1.4, 19.2, 0.2), M.rope, EX + x, 16.3, EZ, 0.18);
  add(g, rbox(4, 6.5, 1, 0.3), M.oilskin, EX + 4, 8, EZ + 6.8);                                                 // its door
  add(g, cyl(1.1, 1.1, 8, 8), M.ironDark, EX - 6, 20, EZ - 3); add(g, cyl(1.8, 1.1, 1.3, 8), M.ironDark, EX - 6, 24.5, EZ - 3);
  pole(g, [EX + 9, 9, EZ + 4], [-16, 9.5, -3.5], 0.9, M.ironDark);                                               // the drive shaft to the gearbox
  // the salt pan north-east, the flow line running into it
  add(g, rbox(15, 2, 11, 0.4), M.slate, 14, 5, -17);
  add(g, rbox(13, 0.8, 9, 0.3), M.saltPan, 14, 6.2, -17);
  for (const x of [-4.5, 9, 22.5]) add(g, cyl(0.8, 0.8, 19, 8), M.timber, x, 13.5, -25.5);                          // a windbreak behind it: team canvas on posts
  add(g, rbox(27, 14, 0.6, 0.2), M.paintCanvas2, 9, 13.5, -25.2); for (const y of [6.3, 20.7]) add(g, rbox(27.4, 0.5, 0.9, 0.1), M.inkLine2, 9, y, -25.2);
  return g;
}

/** Crew Hall (barracks, 3x3): soldiers live and drill here. A long tarred shed along x under one plain gable: the near
 *  (south) slope weathered team canvas (`paintWorn`) with a gentle sag and worn dark hems, no battens or bays; the far
 *  slope dark tar, a tarred ridge beam raised over it, a stove pipe; plain walls, two doors and small shuttered windows
 *  under a shallow shade along the south wall. In front, the drill yard: a pale gravel square with a timber kerb, two
 *  straw cross-post dummies (tan, low in contrast, no shadow: never a squad of white hats) and, at its corner, the tall flagstaff with
 *  the team flag; a row of round pale targets on posts east, a rifle rack, a bell. From above: a long two-tone bar, a
 *  sand square with a flag. (Step 2's testers took the battened roof's bays and the yard for boat
 *  slips.) */
export function crewHall(M) {
  bldgMats(M);
  const g = grp();
  add(g, plate(oct(43), 4, 1.2), M.flagstone, 0, 0, 0);
  posts(g, M, [[-38, 34], [-24, 41], [-8, 41], [8, 41], [24, 41], [38, 34]]);
  const L = 80, W = 26, ZC = -12, H = 15, RH = 10, RW = W + 4;                                                // the shed's length, width, centre z, wall height, roof rise and width
  add(g, rbox(L, H, W, 0.8), M.tar, 0, 4 + H / 2, ZC);
  add(g, rbox(L + 1, 1.6, W + 1, 0.4), M.ironDark, 0, 4.8, ZC);                                                // plinth band
  add(g, gable(L + 4, RW, RH), M.tar, 0, 4 + H, ZC);                                                           // the gable roof, tarred: the far slope stays dark
  add(g, rbox(L + 5, 2.6, 2.6, 0.5), M.tar, 0, 4 + H + RH + 0.8, ZC);                                          // the ridge beam, tarred and raised: dark, its shadow down the near slope
  const a = Math.atan2(RH, RW / 2), ny = Math.cos(a), nz = Math.sin(a);                                       // the south slope: its angle and normal
  { // team canvas over the near slope, one gentle sag (no bays), a worn ink hem all round
    const o = 2.1, X = (L + 4) / 2, e = [0, 4 + H + ny * o, ZC + RW / 2 + nz * o], r = [0, 4 + H + RH + ny * o, ZC + nz * o];
    add(g, sagQuad([-X, e[1], e[2]], [X, e[1], e[2]], [X, r[1], r[2]], [-X, r[1], r[2]], 1, 1.4), M.paintWorn, 0, 0, 0);
    wornHem(g, [-X - 0.4, e[1] - 0.2, e[2] + 0.3], [X + 0.4, e[1] - 0.2, e[2] + 0.3], 0.95, M.inkLine);              // the eave, dark and mended
    wornHem(g, [-X, r[1] + 0.2, r[2]], [X, r[1] + 0.2, r[2]], 0.7, M.inkLine);
    for (const sx of [-1, 1]) wornHem(g, [sx * X, e[1], e[2]], [sx * X, r[1], r[2]], 0.7, M.inkLine);
  }
  add(g, cyl(1.3, 1.3, 9, 8), M.ironDark, -30, 4 + H + RH + 3, ZC - 5); add(g, cyl(2.1, 1.3, 1.4, 8), M.ironDark, -30, 4 + H + RH + 8, ZC - 5); // stove pipe, on the far slope
  for (const x of [-16, 16]) add(g, rbox(7, 9, 1.2, 0.4), M.oilskin, x, 8.5, ZC + W / 2 + 0.6);                   // two doors in the south wall
  for (const x of [-30, -4, 4, 30]) add(g, rbox(3.4, 3, 1, 0.3), M.canvasDark, x, 12, ZC + W / 2 + 0.6);          // small shuttered windows
  { // a shallow shade along the south wall under the gable's eave: old sailcloth (a mid value) on posts, so the wall is no black band
    const z0 = ZC + W / 2 + 0.4, d = 8, drop = 2.4, sl = Math.atan2(drop, d);
    add(g, rbox(L - 4, 0.7, Math.hypot(d, drop), 0.25), M.canvasDark, 0, 15 - drop / 2, z0 + d / 2, sl, 0, 0);
    add(g, rbox(L - 3.6, 0.3, Math.hypot(d, drop) + 0.4, 0.1), M.oilskin, 0, 15 - drop / 2 - 0.45, z0 + d / 2, sl, 0, 0);
    add(g, rbox(L - 3.4, 1.2, 1.2, 0.3), M.timber, 0, 15 - drop, z0 + d);                                        // its front rail
    for (let x = -36; x <= 36; x += 18) add(g, cyl(0.6, 0.6, 15 - drop - 4, 8), M.timber, x, 4 + (15 - drop - 4) / 2, z0 + d); // posts
  }
  // the drill yard: a pale gravel square, a timber kerb, two ranks of straw drill-men
  const DX = -14, DZ = 25, DW = 46, DD = 22;
  add(g, rbox(DW, 0.6, DD, 0.2), M.sandbag, DX, 4.3, DZ);                                                   // packed sand
  for (const [w, d, x, z] of [[DW + 1.6, 1.4, 0, -DD / 2], [DW + 1.6, 1.4, 0, DD / 2], [1.4, DD, -DW / 2, 0], [1.4, DD, DW / 2, 0]]) add(g, rbox(w, 1.2, d, 0.3), M.timber, DX + x, 4.6, DZ + z);
  // straw cross-post dummies, set about the yard a little unevenly: a post and a crossbar, a straw body and a tan sack
  // head; straw-tan, low in contrast and casting no shadow, so the yard reads as a training ground, never as a squad
  const straw = M.straw ??= new THREE.MeshStandardMaterial({ color: 0x9c8658, roughness: 1, metalness: 0 });
  for (const [x, z, ry] of [[-25, 20, 0.2], [-16, 21.5, -0.3], [-6, 19.5, 0.1], [3, 21, 0.4], [-22, 29.5, -0.2], [-12, 30.5, 0.3], [-3, 29, -0.1], [5, 30.5, 0.25]]) {
    const d = grp(); d.position.set(DX + 14 + x, 4.6, z); d.rotation.y = ry; g.add(d);
    add(d, cyl(0.45, 0.55, 6, 6), M.timber, 0, 3, 0);                                                         // the post
    add(d, rbox(4.4, 0.6, 0.6, 0.15), M.timber, 0, 4.4, 0);                                                   // the crossbar
    add(d, rbox(2, 2.4, 1.4, 0.5), straw, 0, 3.6, 0);                                                         // the straw body
    add(d, sph(1.15, 8, 6), straw, 0, 6.3, 0).scale.set(1, 0.85, 0.9);                                        // the sack head, tan
    d.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  }
  // the flagstaff at the drill yard's corner, the team flag flying east
  add(g, rbox(4, 2, 4, 0.4), M.slate, DX + DW / 2 + 4, 5, DZ - DD / 2 + 2);
  add(g, cyl(0.75, 1, 44, 8), M.timber, DX + DW / 2 + 4, 26, DZ - DD / 2 + 2); add(g, sph(0.9, 8, 6), M.brass, DX + DW / 2 + 4, 48.5, DZ - DD / 2 + 2);
  pennant(g, M, DX + DW / 2 + 4.3, 43, DZ - DD / 2 + 2, 18, 6);
  // targets east: round pale butts on posts, facing the yard; a rifle rack; a bell by the door
  for (const x of [24, 31, 38]) { add(g, cyl(0.5, 0.5, 8, 6), M.timber, x, 8, 14); add(g, cyl(2.6, 2.6, 0.8, 16), M.canvas, x, 11, 14.6, Math.PI / 2 - 0.25, 0, 0); add(g, cyl(1.1, 1.1, 0.9, 12), M.inkLine, x, 11.1, 15, Math.PI / 2 - 0.25, 0, 0); }
  for (let k = 0; k < 6; k++) pole(g, [22 + k * 2.4, 6, 30], [22.6 + k * 2.4, 16, 27.6], 0.42, M.ironDark);        // rifles in a rack
  add(g, rbox(16, 1.2, 1.2, 0.3), M.timber, 28, 11.5, 28.5); add(g, rbox(16, 1.2, 1.2, 0.3), M.timber, 28, 5, 30);
  add(g, rbox(1.4, 12, 1.4, 0.3), M.timber, -40, 10, 6); add(g, rbox(1.4, 12, 1.4, 0.3), M.timber, -34, 10, 6); add(g, rbox(8, 1.4, 1.4, 0.3), M.timber, -37, 16.4, 6);
  add(g, lathe([[0, 0], [1.2, 0], [2.4, 1.2], [2.6, 3.4], [1.4, 4.2], [0, 4.4]], 14), M.brass, -37, 11.6, 6);     // the bell (brass, a small thing)
  crates(g, M, 36, 34, 1);
  return g;
}

/** Workshop (forge, 2x2): round 3's smithy, cleared at 1x: open-sided under a dark corrugated iron roof on timber
 *  posts, a louvred vent along it with a pale cap, a square iron stack at its north-west corner; a team canvas awning
 *  along its open south side; the forge out in the yard, its hearth glowing orange-red with sparks over the anvil; a
 *  short pale timber derrick west of the smithy, its boom up over the quay with a team-wrapped bale on the hook. From
 *  above: a dark ribbed square with a pale ridge and a team strip at its foot, a pale mast and a short boom. (Round 4's
 *  long jib past the footprint, its bale hanging, read as a pump jack or a well-sweep with a bucket.) */
export function workshop(M) {
  bldgMats(M);
  const g = grp();
  add(g, plate(oct(27), 4, 1.2), M.flagstone, 0, 0, 0);
  posts(g, M, [[-24, 22], [24, 22], [24, -21]]);
  const SX = 3, SZ = -6, SW = 34, SD = 28, HN = 25, HS = 19;                                                  // the smithy: centre, width, depth, north and south heights
  add(g, rbox(SW, HN - 5, 1.6, 0.4), M.tar, SX, 4 + (HN - 5) / 2, SZ - SD / 2);                                // the north wall
  add(g, rbox(SW + 1, 1.6, SD + 1, 0.4), M.ironDark, SX, 4.8, SZ);                                             // plinth band
  for (const sx of [-1, 1]) for (const dz of [-SD / 2 + 1, 1, SD / 2 - 1]) add(g, cyl(1.3, 1.3, (dz > 0 ? HS : HN) - 5, 8), M.timber, SX + sx * (SW / 2 - 1.5), 4 + ((dz > 0 ? HS : HN) - 5) / 2, SZ + dz); // the posts
  const tilt = Math.atan2(HN - HS, SD), RY = 4 + (HN + HS) / 2 - 1.4;
  add(g, rbox(SW + 5, 1.2, SD + 5, 0.3), M.ironDark, SX, RY, SZ, tilt, 0, 0);                                   // the iron roof, one slope down to the south
  for (let x = -16; x <= 16; x += 4) add(g, rbox(1, 0.7, SD + 4.6, 0.2), M.ironDark, SX + x, RY + 0.8, SZ, tilt, 0, 0); // its corrugations, lit ridges and small shadows
  add(g, rbox(SW + 5.4, 1.6, 1.6, 0.4), M.timber, SX, RY - (SD / 2 + 2.5) * Math.sin(tilt) - 0.3, SZ + (SD / 2 + 2.5) * Math.cos(tilt), 0, 0, 0); // the eave beam, south
  { // a louvred vent along the roof, its louvres and its cap pale timber: the dark roof keeps a pale ridge in grey
    const mz = SZ - 3, my = RY + 3 * Math.tan(tilt) + 0.6, ML = SW - 6;
    add(g, rbox(ML, 4.4, 6, 0.3), M.tar, SX + 1, my + 2.2, mz);
    for (let k = 0; k < 3; k++) add(g, rbox(ML - 0.6, 0.7, 1.2, 0.15), M.timberPale, SX + 1, my + 1 + k * 1.3, mz + 3.2, -0.5, 0, 0); // louvres, south
    add(g, gable(ML + 2, 9, 2.6), M.timberPale, SX + 1, my + 4.4, mz);                                            // the cap, pale
    add(g, rbox(ML + 2.4, 0.9, 0.9, 0.2), M.ironDark, SX + 1, my + 7.1, mz);                                       // its ridge strap
  }
  add(g, rbox(6, 32, 6, 0.6), M.ironDark, SX - SW / 2 + 5, 4 + 16 + 6, SZ - SD / 2 + 5);                        // the square stack, through the roof
  add(g, rbox(6.4, 5, 6.4, 0.3), M.paintCanvas, SX - SW / 2 + 5, 36, SZ - SD / 2 + 5); for (const y of [33.3, 38.7]) add(g, rbox(6.7, 0.5, 6.7, 0.1), M.inkLine, SX - SW / 2 + 5, y, SZ - SD / 2 + 5); // a team wrap round it
  add(g, rbox(7.4, 1.6, 7.4, 0.4), M.slate, SX - SW / 2 + 5, 4 + 32 + 6.2, SZ - SD / 2 + 5);                      // its soot cap
  add(g, rbox(4.4, 0.8, 4.4, 0.2), M.oilskin, SX - SW / 2 + 5, 4 + 32 + 7.3, SZ - SD / 2 + 5);                    // its mouth
  // the awning along the open south side: team canvas on posts under the eave, the bench and the bars under it
  const AZ = SZ + SD / 2 + 6.5;
  for (const x of [-18, 0, 18]) add(g, cyl(0.8, 0.8, 11, 8), M.timber, SX + x, 9.5, AZ + 6);
  tarp(g, M, SW + 5, 13, SX, 15.4, AZ, 0.2, 0);
  for (const x of [-12, 12]) add(g, rbox(0.6, 1.4, 13.2, 0.2), M.rope, SX + x, 16.1, AZ, 0.2);
  // the forge out in the yard, south of the awning, where the sky sees it: the hearth glowing, the anvil, sparks over it
  const FX = SX - 6, FZ = AZ + 12;
  add(g, rbox(10, 7.5, 7, 0.5), M.slate, FX, 7.7, FZ);
  add(g, cyl(3.4, 3.4, 0.8, 14), M.hearth, FX, 11.6, FZ);                                                     // the hearth's bed, seen from above
  add(g, rbox(6, 3, 1.2, 0.3), M.hearth, FX, 8.2, FZ + 3.6);                                                   // its mouth, south
  add(g, cyl(1.4, 1.6, 6, 8), M.ironDark, FX - 3, 14, FZ - 1.5); add(g, rbox(3, 1, 3, 0.2), M.slate, FX - 3, 17.3, FZ - 1.5); // a hood and short flue over it
  add(g, rbox(2.6, 3.8, 2.6, 0.3), M.ironDark, FX + 9, 5.9, FZ); add(g, rbox(6.5, 2, 2.8, 0.5), M.ironDark, FX + 9, 8.8, FZ); // the anvil on its block
  for (const [x, y, z] of [[FX + 10, 11.5, FZ - 1], [FX + 7.4, 12.8, FZ + 1.4], [FX + 11.8, 14, FZ + 1], [FX + 8.4, 10.4, FZ - 2], [FX + 13, 12, FZ - 1.4]]) add(g, sph(0.55, 6, 5), M.spark, x, y, z); // sparks
  barrel(g, M, FX + 16, FZ - 2, 4, 2.6, 6);                                                                   // the quench tub
  // the derrick, west: a pale timber mast guyed, a heavy pale boom up over the yard, a team-wrapped bale on the hook
  const MX = -18, MZ = 2, MT = 50;
  add(g, cyl(2.2, 2.8, MT - 4, 10), M.timberPale, MX, 4 + (MT - 4) / 2, MZ);
  for (const y of [18, 32, 44]) add(g, cyl(2.7, 2.7, 1, 10), M.ironDark, MX, y, MZ);
  add(g, cyl(3, 2.4, 2.4, 10), M.ironDark, MX, MT + 0.6, MZ); add(g, sph(0.8, 8, 6), M.brass, MX, MT + 2.4, MZ);  // the cap and its brass finial
  const TIP = [MX + 10, 36, MZ + 20];
  pole(g, [MX, 8, MZ], TIP, 2, M.timberPale);                                                                 // the boom, up to the south-east
  for (const t of [0.3, 0.6]) pole(g, lerp3([MX, 8, MZ], TIP, t - 0.02), lerp3([MX, 8, MZ], TIP, t + 0.02), 2.3, M.ironDark); // its iron bands
  pole(g, [MX, MT - 1, MZ], TIP, 0.4, M.ironDark).userData.noShadow = true;                                    // the topping cable
  pole(g, TIP, [TIP[0], 22, TIP[2]], 0.45, M.ironDark).userData.noShadow = true;                               // the chain
  add(g, torus(1.4, 0.4, 12), M.ironDark, TIP[0], 21, TIP[2], 0, 0, 0);                                         // the hook ring
  add(g, rbox(11, 8, 8, 1.2), M.paintCanvas, TIP[0], 16, TIP[2], 0.08, 0.3, 0.05);                               // the bale, team canvas
  for (const y of [12.7, 19.3]) add(g, rbox(11.4, 0.5, 8.4, 0.1), M.inkLine, TIP[0], y, TIP[2], 0.08, 0.3, 0.05);  // its ink hems
  for (const dz of [-2.5, 2.5]) add(g, rbox(0.6, 8.4, 8.6, 0.1), M.rope, TIP[0] + dz, 16, TIP[2], 0.08, 0.3, 0.05); // roped
  for (const [a, b] of [[[MX, MT - 2, MZ], [MX - 6, 5, MZ - 22]], [[MX, MT - 2, MZ], [MX - 7, 5, MZ + 20]]]) pole(g, a, b, 0.3, M.rope).userData.noShadow = true; // guys
  add(g, cyl(2.6, 2.6, 6, 12), M.timber, MX + 5, 7, MZ + 12, 0, 0, Math.PI / 2); add(g, rbox(1, 6, 1, 0.2), M.ironDark, MX + 1.5, 7, MZ + 12); add(g, rbox(1, 6, 1, 0.2), M.ironDark, MX + 8.5, 7, MZ + 12); // the winch drum
  crates(g, M, -18, -17, 2);
  return g;
}

/** A boat's hull, lengthwise along z (stern -z, bow +z), its gunwale at y about 0: `L` long, `B` the half-beam, `D` deep,
 *  a transom stern and a sharp bow (the half-breadth runs to 0 at the stem), the sheer rising forward; the part of each
 *  section between angles p0 and p1 (-pi/2 the port gunwale, 0 the keel, pi/2 starboard), scaled `k` about the hull's
 *  axis (an inner skin, an outer band). */
const hullB = (t, B) => B * (t < 0.42 ? 0.78 + 0.22 * Math.sin(t / 0.42 * Math.PI / 2) : 1 - ((t - 0.42) / 0.58) ** 1.7);
const hullSheer = (t) => 3.2 * t ** 2.5 + 0.8 * (1 - t) ** 3;
const hullGeo = (L, B, D, p0 = -Math.PI / 2, p1 = Math.PI / 2, k = 1) => memo(`hu${L},${B},${D},${p0},${p1},${k}`, () => {
  const NS = 32, NJ = 14, pos = [], idx = [];
  for (let i = 0; i <= NS; i++) for (let j = 0; j <= NJ; j++) {
    const t = i / NS, ph = p0 + (p1 - p0) * j / NJ, b = hullB(t, B) * k, d = D * (1 - 0.2 * t ** 3) * k;
    pos.push(b * Math.sin(ph), hullSheer(t) - d * Math.abs(Math.cos(ph)) ** 0.7, -L / 2 + t * L);
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NJ; j++) { const q = i * (NJ + 1) + j; idx.push(q, q + 1, q + NJ + 1, q + 1, q + NJ + 2, q + NJ + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx); g.computeVertexNormals(); return boxUV(g);
});
/** The hull's line at section angle ph (pi/2 the starboard gunwale), from stern to bow, as points (scaled k). */
const hullLine = (L, B, D, ph, k = 1, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return new THREE.Vector3(hullB(t, B) * k * Math.sin(ph), hullSheer(t) - D * (1 - 0.2 * t ** 3) * k * Math.abs(Math.cos(ph)) ** 0.7, -L / 2 + t * L); });

/** Slipway (factory, 3x3): a boat is built here. A stone slip inclined down to the south, running into a strip of dark
 *  water at the quay's edge, two pale timber ways on dark sleepers; on them, on keel blocks and shores, the largest
 *  shape: an open tarred hull (56 long) with a sharp bow pointing down the slip and a transom stern, its pale gunwale
 *  outlining the boat, pale ribs across its dark inside, a team strake along each side under an ink seam, a pale stem
 *  post; a capstan at the slip's stone head with its line to the stern. East, a low open lean-to (the mould loft) under
 *  one slope of weathered team canvas, falling away from the slip, planks stacked beneath. No sheer legs and no peaked
 *  roof (step 2's testers took them for a steeple and a hall, and the Loft is a deck beside a peaked tent). */
export function slipway(M) {
  bldgMats(M);
  const g = grp();
  add(g, plate(oct(43), 4, 1.2), M.flagstone, 0, 0, 0);
  posts(g, M, [[-40, -28], [40, 30], [-26, 41]]);
  // the slip: stone, inclined from its head (north, 14 up) down to the quay's south edge and into the water
  const RX = -8, RW = 34, Z0 = -40, Z1 = 42, lift = 10, slope = Math.atan2(lift, Z1 - Z0), yt = (z) => 4 + lift * (Z1 - z) / (Z1 - Z0), ZC = (Z0 + Z1) / 2;
  add(g, rbox(RW, 2.4, Math.hypot(Z1 - Z0, lift), 0.4), M.slate, RX, yt(ZC) - 1.2, ZC, slope, 0, 0);
  add(g, rbox(RW + 6, lift + 2, 6, 0.5), M.slate, RX, 4 + (lift + 2) / 2 - 1, Z0 - 3);                          // the stone head
  add(g, rbox(RW + 6.4, 0.6, 6.4, 0.2), M.slateLit, RX, 4 + lift + 1.3, Z0 - 3);
  for (let z = Z0 + 4; z < Z1; z += 7) add(g, rbox(RW - 6, 0.9, 2, 0.2), M.tar, RX, yt(z) + 0.4, z, slope, 0, 0);   // sleepers, dark
  for (const sx of [-1, 1]) add(g, rbox(2.6, 1.4, Z1 - Z0, 0.3), M.timberPale, RX + sx * 6.5, yt(ZC) + 1.3, ZC, slope, 0, 0); // the ways, pale
  // the water at the slip's foot: dark, wet, a pale line of foam where the slip goes in
  add(g, rbox(RW + 10, 0.8, 9, 0.3), M.brine, RX, 4.5, 41);
  add(g, rbox(RW + 2, 0.5, 1, 0.2), M.saltPan, RX, 5, 37.2);
  // the hull, bow down the slip
  const L = 56, B = 12, D = 8, HZ = 1, HY = yt(HZ) + 2 + 3 + D - 0.6;
  for (const z of [-20, -8, 4, 16]) for (const sx of [-1, 1]) add(g, rbox(4, 3, 4, 0.4), M.timber, RX + sx * 4.5, yt(HZ + z) + 3.3, HZ + z, slope, 0, 0); // keel blocks on the ways
  const hull = grp(); hull.position.set(RX, HY, HZ); hull.rotation.x = slope; g.add(hull);
  add(hull, hullGeo(L, B, D), M.tar2, 0, 0, 0);                                                                // the planking, tarred
  add(hull, hullGeo(L, B, D, -Math.PI / 2, Math.PI / 2, 0.95), M.tarIn2, 0, 0.15, 0);                          // its dark inside
  for (const sd of [-1, 1]) {
    add(hull, hullGeo(L, B, D, sd > 0 ? Math.PI / 2 - 0.4 : -Math.PI / 2, sd > 0 ? Math.PI / 2 : -Math.PI / 2 + 0.4, 1.035), M.paintCanvas2, 0, 0, 0); // the team strake
    add(hull, hullGeo(L, B, D, sd > 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.4, sd > 0 ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.5, 1.03), M.inkLine2, 0, 0, 0); // its ink seam
  }
  { // the transom, the gunwale round the sheer (pale: it outlines the boat), ribs across the open inside, the keel, the stem
    const sec = Array.from({ length: 15 }, (_, j) => { const ph = -Math.PI / 2 + Math.PI * j / 14; return new THREE.Vector2(hullB(0, B) * Math.sin(ph), hullSheer(0) - D * Math.abs(Math.cos(ph)) ** 0.7); });
    const tr = add(hull, new THREE.ShapeGeometry(new THREE.Shape(sec)), M.tar2, 0, 0, -L / 2); tr.userData.noShadow = false;
    const port = hullLine(L, B, D, -Math.PI / 2), star = hullLine(L, B, D, Math.PI / 2);
    const rim = [...port, ...star.slice(0, -1).reverse()].map(v => v.clone().setY(v.y + 0.4));
    add(hull, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 160, 0.95, 6, true), M.timberPale, 0, 0, 0);
    for (const t of [0.14, 0.28, 0.42, 0.56, 0.7, 0.82]) {
      const z = -L / 2 + t * L, b = hullB(t, B) * 0.93, d = D * (1 - 0.2 * t ** 3) * 0.93;
      const pts = Array.from({ length: 13 }, (_, j) => { const ph = -Math.PI / 2 + Math.PI * j / 12; return new THREE.Vector3(b * Math.sin(ph), hullSheer(t) + 0.2 - d * Math.abs(Math.cos(ph)) ** 0.7, z); });
      add(hull, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.5, 5), M.timberPale, 0, 0, 0);
    }
    add(hull, rbox(1.6, 2, L - 2, 0.4), M.timber, 0, -D + 0.2, 0);                                              // the keel
    pole(hull, [0, -D * 0.6, L / 2 - 0.5], [0, hullSheer(1) + 3.2, L / 2 + 1.2], 0.9, M.timberPale, 8);           // the stem post, standing at the bow
    pole(hull, [0, -D * 0.8, -L / 2], [0, hullSheer(0) + 1.5, -L / 2 - 0.6], 0.8, M.timber, 8);                   // the sternpost
  }
  for (const sx of [-1, 1]) for (const z of [-14, 0, 14]) pole(g, [RX + sx * (B + 6), yt(HZ + z) + 0.5, HZ + z], [RX + sx * (B - 0.5), HY - 3.5 - z * Math.tan(slope), HZ + z], 0.8, M.timber); // shores
  // the capstan at the slip's head, its line down to the stern
  add(g, cyl(2.4, 2.8, 4, 12), M.timber, RX, 4 + lift + 3.6, Z0 - 3); add(g, cyl(2.9, 2.9, 0.8, 12), M.ironDark, RX, 4 + lift + 5.4, Z0 - 3);
  for (let k = 0; k < 2; k++) add(g, rbox(11, 0.8, 0.8, 0.2), M.timber, RX, 4 + lift + 5, Z0 - 3, 0, k * Math.PI / 2, 0);
  pole(g, [RX, 4 + lift + 4, Z0 - 1], [RX, HY + hullSheer(0), HZ - L / 2 * Math.cos(slope)], 0.35, M.rope).userData.noShadow = true;
  // the mould loft east: an open lean-to, one slope of weathered team canvas falling away from the slip, planks beneath
  const X0 = 13, X1 = 41, ZN = -26, ZS = 20, YH = 20, YL = 11;
  for (const z of [ZN + 1, (ZN + ZS) / 2, ZS - 1]) add(g, cyl(1, 1, YH - 4, 8), M.timber, X0 + 1, 4 + (YH - 4) / 2, z);
  add(g, rbox(1.4, YL - 4, ZS - ZN, 0.3), M.tar, X1 - 1, 4 + (YL - 4) / 2, (ZN + ZS) / 2);                      // its back wall, tarred
  add(g, rbox(2.2, 2.2, ZS - ZN + 2, 0.4), M.tar, X0 + 0.5, YH + 0.4, (ZN + ZS) / 2);                             // the high plate, tarred: a dark edge
  add(g, sagQuad([X0, YH + 1.3, ZS], [X0, YH + 1.3, ZN], [X1, YL + 1.3, ZN], [X1, YL + 1.3, ZS], 3, 1.2), M.paintWorn, 0, 0, 0);
  for (const [p, q] of [[[X0, YH + 1.1, ZS], [X0, YH + 1.1, ZN]], [[X1, YL + 1.1, ZN], [X1, YL + 1.1, ZS]], [[X0, YH + 1.1, ZS], [X1, YL + 1.1, ZS]], [[X0, YH + 1.1, ZN], [X1, YL + 1.1, ZN]]]) wornHem(g, p, q, 0.85, M.inkLine);
  for (let k = 0; k < 4; k++) add(g, rbox(16, 1.4, 34, 0.2), k % 2 ? M.timberPale : M.timber, (X0 + X1) / 2 + 2, 4.9 + k * 1.5, (ZN + ZS) / 2 + 1, 0, 0.02 * k, 0); // planks stacked under it
  crates(g, M, 31, 31, 1); barrel(g, M, 23, 33, 4, 2.4, 5.5); crates(g, M, -36, 30, 2);
  add(g, torus(3.2, 1.1, 20), M.rope, -34, 5.1, -18, Math.PI / 2, 0, 0);
  return g;
}

/** Lookout (turret base, 2x2): a tall tripod of tarred poles lashed with rope on a stone footing, a team canvas screen
 *  lashed round its waist between ink hems, a ladder up the south leg, cross braces; the crow's nest at y 48, a tarred tub
 *  with iron hoops, a team canvas skirt hung beneath it, a team dodger over its whole wall, its deck dark (the gun,
 *  `lookoutGun`, stands on it), a pennant; crates under a tarp at the foot. Tall and thin with a long shadow: a tower,
 *  not a drum (round 1's nest at 36 on thin legs read as a squat tank). */
const NEST_Y = 48;
export function lookout(M) {
  bldgMats(M);
  const g = grp();
  add(g, plate(oct(20), 4, 1.2), M.flagstone, 0, 0, 0);
  posts(g, M, [[-17, 15], [17, 15], [0, 19]]);
  add(g, cyl(11.5, 13, 5, 24), M.slate, 0, 6.5, 0);
  add(g, torus(12.1, 0.4, 32), M.slateLit, 0, 8.9, 0, Math.PI / 2, 0, 0);
  const legs = [Math.PI / 2, Math.PI / 2 + Math.PI * 2 / 3, Math.PI / 2 + Math.PI * 4 / 3].map(a => [[Math.cos(a) * 11, 8, Math.sin(a) * 11], [Math.cos(a) * 4.6, NEST_Y + 2, Math.sin(a) * 4.6]]);
  for (const [a, b] of legs) {
    pole(g, a, b, 2.2, M.tar);
    for (const t of [0.1, 0.8]) pole(g, lerp3(a, b, t - 0.02), lerp3(a, b, t + 0.02), 2.8, M.rope);              // lashings
  }
  for (const t of [0.22, 0.5, 0.78]) for (let k = 0; k < 3; k++) pole(g, lerp3(...legs[k], t), lerp3(...legs[(k + 1) % 3], t), 0.8, M.timber); // braces
  { // a team canvas screen lashed round the tower's waist, outside the legs, between ink hems
    const r = (t) => 11 + (4.6 - 11) * t + 2.4, y = (t) => 8 + (NEST_Y - 6) * t, T0 = 0.38, T1 = 0.54;
    add(g, tube(r(T1), r(T0), y(T1) - y(T0)), M.paintCanvas2, 0, (y(T0) + y(T1)) / 2, 0);
    for (const t of [T0, T1]) add(g, tube(r(t) + 0.2, r(t) + 0.2, 0.7), M.inkLine2, 0, y(t), 0);
  }
  const [la, lb] = legs[0];                                                                                   // the ladder, up the south leg's face
  for (const dx of [-1.8, 1.8]) pole(g, [la[0] + dx, la[1], la[2] + 2.6], [lb[0] + dx, lb[1], lb[2] + 2.6], 0.45, M.timber);
  for (let t = 0.05; t < 1; t += 0.07) { const p = lerp3(la, lb, t); add(g, rbox(4, 0.5, 0.5, 0.1), M.timber, p[0], p[1], p[2] + 2.6); }
  // the nest, and the canvas skirt hung beneath it
  add(g, cyl(10.2, 6.8, 8.4, 28), M.paintCanvas, 0, NEST_Y - 4.2, 0);                                           // the skirt
  add(g, cyl(7, 7, 0.5, 28), M.inkLine, 0, NEST_Y - 8.3, 0); add(g, cyl(10.4, 10.4, 0.5, 28), M.inkLine, 0, NEST_Y - 0.1, 0);
  add(g, lathe([[0, 0], [8.6, 0], [9.6, 1], [10.2, 5.6], [9.6, 6.2], [8.8, 6.2], [8.2, 1.6], [0, 1.6]], 28), M.tar, 0, NEST_Y, 0); // a shallow tub: the camera sees into it
  for (const y of [1.4, 5.9]) add(g, tube(10.3, 10.3, 0.9), M.ironDark, 0, NEST_Y + y, 0);                       // hoops (open rings: a capped one was a lid over the nest)
  add(g, tube(10.45, 10.55, 5.4), M.paintCanvas2, 0, NEST_Y + 3.3, 0);                                           // the dodger round the rim, the tub's whole wall, open: the camera sees into the nest
  for (const y of [0.6, 6.0]) add(g, tube(10.7, 10.7, 0.55), M.inkLine2, 0, NEST_Y + y, 0);
  add(g, cyl(8.4, 8.4, 0.4, 28), M.oilskin, 0, NEST_Y + 1.7, 0);                                                 // the deck, dark: the gun shows on it, not a pale face
  for (let x = -6; x <= 6; x += 3) add(g, rbox(0.5, 0.3, 2 * Math.sqrt(64 - x * x), 0.1), M.tar, x, NEST_Y + 2, 0); // its planks' seams
  add(g, cyl(0.6, 0.6, 13, 8), M.timber, 0, NEST_Y + 14, -8); pennant(g, M, 0, NEST_Y + 18.5, -8, 9, 3);        // a staff with a pennant at the rim
  crates(g, M, 11, 11, 2); barrel(g, M, -12, 11, 4, 2.4, 5.5);
  return g;
}
/** The Lookout's gun (turret_head), facing +x: a heavy iron swivel gun (36, angled up 0.2) on a pivot post in the nest,
 *  its long barrel served pale twice so it reads far past the rim, a brass muzzle bead; the breech wrapped in team canvas
 *  between ink rings, a team powder chest behind the gunner's place. No dome or hood (round 2's hood read as a ball on a
 *  tripod). Drawn over the base, no shadow of its own. */
export function lookoutGun(M) {
  bldgMats(M);
  const g = grp(), Y = NEST_Y + 1.9;
  add(g, cyl(1.8, 2.1, 5, 10), M.ironDark, 0, Y + 2.5, 0);                                                     // the pivot post
  add(g, rbox(4, 1.6, 6.4, 0.4), M.ironDark, 0, Y + 5.2, 0);                                                   // the yoke
  const gun = grp(); gun.position.set(0, Y + 6.6, 0); gun.rotation.z = 0.2; g.add(gun);
  add(gun, cyl(2, 2.7, 36, 14), M.ironDark, 13, 0, 0, 0, 0, Math.PI / 2);                                      // the barrel, tapering to the muzzle
  add(gun, cyl(3.1, 3.1, 6, 14), M.paintCanvas, -4.2, 0, 0, 0, 0, Math.PI / 2);                                 // the breech, team canvas
  for (const x of [-7.4, -1]) add(gun, cyl(3.3, 3.3, 0.6, 14), M.inkLine, x, 0, 0, 0, 0, Math.PI / 2);
  add(gun, sph(2.6, 12, 8), M.ironDark, -7.6, 0, 0);                                                           // the cascabel
  for (const [x, w] of [[12, 4], [22, 6]]) add(gun, cyl(2.75 - x * 0.02, 2.75 - x * 0.02, w, 14), M.canvas, x, 0, 0, 0, 0, Math.PI / 2); // pale servings along the barrel
  add(gun, cyl(2.4, 2.4, 1.6, 14), M.ironDark, 29.6, 0, 0, 0, 0, Math.PI / 2);                                  // the muzzle swell
  add(gun, cyl(2.1, 2.1, 0.8, 14), M.brass, 30.6, 0, 0, 0, 0, Math.PI / 2);                                     // the muzzle bead
  add(gun, rbox(3, 2.4, 1.2, 0.3), M.timber, 1, 3, 0);                                                         // the sight block
  add(g, rbox(5.6, 3.4, 7, 0.5), M.paintCanvas, -6.4, Y + 1.7, 0);                                               // the powder chest, team canvas over it
  add(g, rbox(6, 0.4, 7.4, 0.1), M.inkLine, -6.4, Y + 3.5, 0); add(g, rbox(6, 0.4, 7.4, 0.1), M.inkLine, -6.4, Y + 0.2, 0);
  add(g, rbox(0.6, 3.6, 7.6, 0.1), M.rope, -6.4, Y + 1.7, 0);
  return g;
}

/** A Kite, the Harbour's flyer, as the Loft keeps it: a triangle sail on a light frame, nose to -z (local), lying on
 *  its chocks: Harbour cream cloth (`kiteCloth`) at the nose, a team band across the trailing edge behind an ink seam,
 *  an ink hem; timber leading-edge spars, a spine and a cross spar over it, a small keel pod under it; wider than long (a
 *  wing, not a pennant); scaled `k`. */
function parkedKite(parent, M, x, y, z, ry, k = 1.15, rx = 0) {
  const t = grp(); t.position.set(x, y, z); t.rotation.set(rx, ry, 0); t.scale.setScalar(k); parent.add(t);
  add(t, plate([[0, -10], [9.2, 1.6], [-9.2, 1.6]], 0.5, 0.12), M.kiteCloth, 0, 0, 0);                         // the nose, cream
  add(t, plate([[9.6, 2.1], [13.5, 7], [-13.5, 7], [-9.6, 2.1]], 0.5, 0.12), M.paintCanvas2, 0, 0, 0);         // the trailing band, team
  add(t, rbox(19.4, 0.5, 0.7, 0.1), M.inkLine2, 0, 0.3, 1.85);                                                  // the seam between
  add(t, rbox(27.4, 0.5, 0.7, 0.1), M.inkLine2, 0, 0.3, 7.2);                                                   // the hem
  for (const sx of [-1, 1]) pole(t, [0, 0.7, -10.4], [sx * 13.9, 0.7, 7.2], 0.45, M.timber, 6);                  // the leading edges
  pole(t, [0, 0.8, -10.6], [0, 0.8, 8.4], 0.45, M.timber, 6);                                                     // the spine
  pole(t, [-11, 0.8, 4], [11, 0.8, 4], 0.4, M.timber, 6);                                                         // the cross spar
  add(t, rbox(2.2, 2.4, 5, 0.6), M.tar, 0, -0.6, -1);                                                            // the keel pod under the spine
  for (const sx of [-1, 1]) add(t, rbox(1.4, 1.6, 3, 0.2), M.timber, sx * 6, -0.8, 3);                            // the chocks under it
  return t;
}
/** Loft (airfield, 3x3): where the Kites are kept and launched. A broad raised launch deck (44 x 40, at y 20) on tarred
 *  trestles braced cross-wise, a stair up from the quay, a rail on its west and north edges; two Kites parked on it nose
 *  east, tethered to cleats, a small windsock at its north-east corner; east of it the hangar: a tent along z, no walls,
 *  a tarred sod-cloth at its foot, weathered team canvas above sagging between rafter lines, worn hems, a tarred ridge
 *  pole raised on forked poles, open to the south where a third Kite's nose shows from its dark inside; guy lines.
 *  Crates, casks, a winch with a line up to the deck. From above: a planked square carrying two pale deltas, and a tent;
 *  no mast (round 2's mast with kites read as the Windmast). */
export function loft(M) {
  bldgMats(M);
  const g = grp();
  add(g, plate(oct(43), 4, 1.2), M.flagstone, 0, 0, 0);
  posts(g, M, [[-40, 28], [-26, 41], [26, 41], [40, 28]]);
  // the launch deck on its trestles
  const DX = -17, DZ = -9, DW = 44, DD = 40, DY = 20;
  for (const x of [-DW / 2 + 2, -7, 7, DW / 2 - 2]) for (const z of [-DD / 2 + 2, 0, DD / 2 - 2]) add(g, rbox(2.6, DY - 4, 2.6, 0.4), M.tar, DX + x, 4 + (DY - 4) / 2, DZ + z);
  for (const z of [-DD / 2 + 2, DD / 2 - 2]) for (const [x0, x1] of [[-DW / 2 + 2, -7], [-7, 7], [7, DW / 2 - 2]]) for (const sy of [1, -1]) pole(g, [DX + x0, sy > 0 ? 5 : DY - 2, DZ + z + 1.3], [DX + x1, sy > 0 ? DY - 2 : 5, DZ + z + 1.3], 0.6, M.timber); // cross braces
  add(g, rbox(DW + 1, 2, DD + 1, 0.4), M.tar, DX, DY - 0.6, DZ);                                                  // the deck's frame
  add(g, rbox(DW, 1.2, DD, 0.3), M.timber, DX, DY + 0.6, DZ);                                                     // its planking
  for (let z = -DD / 2 + 4; z < DD / 2; z += 4) add(g, rbox(DW - 0.4, 0.3, 0.4, 0.1), M.oilskin, DX, DY + 1.25, DZ + z); // plank seams (along the launch)
  for (const z of [-DD / 2 + 1, DD / 2 - 1]) add(g, rbox(DW, 0.6, 1.4, 0.2), M.ironDark, DX, DY + 1.3, DZ + z);         // launch rails' edge strips
  // a rail on the west and north edges
  for (const z of [-DD / 2 + 1, -6, 8]) add(g, cyl(0.5, 0.5, 6, 6), M.timber, DX - DW / 2 + 0.8, DY + 4, DZ + z);
  add(g, rbox(1, 1, DD - 2, 0.2), M.timber, DX - DW / 2 + 0.8, DY + 6.8, DZ);
  for (const x of [-12, 0, 12]) add(g, cyl(0.5, 0.5, 6, 6), M.timber, DX + x, DY + 4, DZ - DD / 2 + 0.8);
  add(g, rbox(DW - 2, 1, 1, 0.2), M.timber, DX, DY + 6.8, DZ - DD / 2 + 0.8);
  // the stair up from the quay, south-west
  const SXs = DX - 14, sz0 = DZ + DD / 2, sz1 = sz0 + 18;
  for (const dx of [-3.4, 3.4]) pole(g, [SXs + dx, DY + 1, sz0], [SXs + dx, 5, sz1], 0.8, M.tar);
  for (let k = 1; k < 8; k++) { const t = k / 8; add(g, rbox(6.4, 0.6, 2, 0.2), M.timber, SXs, DY + 1 - (DY - 4) * t, sz0 + 18 * t); }
  // two Kites parked on the deck, noses east, tethered to cleats
  const KY = DY + 2.7;
  parkedKite(g, M, DX - 8, KY, DZ - 8.5, -Math.PI / 2 + 0.35, 1.08);
  parkedKite(g, M, DX + 7, KY, DZ + 7.5, -Math.PI / 2 - 0.25, 1.08);
  for (const [x, z] of [[DX - 19, DZ - 12], [DX - 5, DZ + 10.5]]) {
    add(g, rbox(2.4, 1.2, 1.4, 0.3), M.ironDark, x, DY + 1.8, z);                                                 // a cleat
    pole(g, [x, DY + 2, z], [x + 3, KY + 0.6, z], 0.22, M.rope).userData.noShadow = true;                         // the tether, to the kite's tail
  }
  // the windsock on a short staff at the deck's north-east corner
  add(g, cyl(0.45, 0.6, 11, 6), M.timber, DX + DW / 2 - 2, DY + 6.5, DZ - DD / 2 + 2);
  const ws = grp(); ws.position.set(DX + DW / 2 - 2, DY + 11.5, DZ - DD / 2 + 2); ws.rotation.set(0, -0.5, -1.25); g.add(ws);
  for (let k = 0; k < 3; k++) add(ws, tube(1.9 - k * 0.42, 2.3 - k * 0.42, 2.6, 12), k % 2 ? M.canvas2 : M.paintCanvas2, 0, 1.6 + k * 2.6, 0);
  add(ws, tube(2.4, 2.4, 0.4, 12), M.ironDark, 0, 0.2, 0);
  // the hangar: a tent of team canvas along z, no walls, open to the south
  const HX = 26, HZ = -4, HW = 28, HL = 40, HH = 24;
  add(g, rbox(HW - 2, 0.4, HL, 0.1), M.oilskin, HX, 4.3, HZ);                                                   // the floor, dark
  add(g, profile([[-HW / 2 + 1, 0], [HW / 2 - 1, 0], [0, HH - 1]], 0.6, 0.1), M.tar, HX, 4, HZ - HL / 2 + 0.5); // the back cloth, tarred (the north end)
  for (const sx of [-1, 1]) { // a slope: a tarred sod-cloth at its foot, team canvas above sagging between rafter lines, worn hems
    const at = (t, z) => [HX + sx * HW / 2 * (1 - t), 4 + HH * t, z], T0 = 0.17, N = HZ - HL / 2 - 0.5, S = HZ + HL / 2 + 0.5;
    add(g, sagQuad(at(0, S), at(0, N), at(T0, N), at(T0, S), 1, 0), M.tar2, 0, 0, 0);
    add(g, sagQuad(at(T0, S), at(T0, N), at(1, N), at(1, S), 4, 1.6, 0.2), M.paintWorn, 0, 0, 0);
    wornHem(g, at(T0, S), at(T0, N), 0.8, M.inkLine2);                                                             // the canvas's foot, dark and mended
    for (const z of [S, N]) wornHem(g, at(T0, z), at(1, z), 0.6, M.inkLine2);                                      // its ends
    for (let k = 1; k < 4; k++) { const z = S + (N - S) * k / 4; pole(g, [at(T0, z)[0] + sx * 0.7, at(T0, z)[1] + 0.4, z], [HX, 4 + HH + 0.6, z], 0.45, M.rope, 6); } // lines over it at the rafters, their shadows across
    for (const z of [-HL / 2 + 4, HL / 2 - 4]) pole(g, [HX + sx * (HW / 2 + 7), 4.5, HZ + z], [HX + sx * HW / 2, 6, HZ + z], 0.25, M.rope).userData.noShadow = true; // guy lines
  }
  add(g, cyl(1.4, 1.4, HL + 6, 8), M.tar, HX, 4 + HH + 1.2, HZ, Math.PI / 2, 0, 0);                               // the ridge pole, tarred and raised: dark, its shadow on the east slope
  for (const z of [-HL / 2 - 2, HL / 2 + 2]) for (const sx of [-1, 1]) pole(g, [HX + sx * 3, 4, HZ + z], [HX, 4 + HH + 1.2, HZ + z], 0.7, M.timber); // forked poles at each end
  parkedKite(g, M, HX, 6.8, HZ + 14, Math.PI, 1.0);                                                              // the third Kite, its nose out of the mouth
  // the yard: a winch with its line up to the deck, crates, casks
  add(g, cyl(3, 3, 8, 14), M.timber, 2, 7.4, 30, 0, 0, Math.PI / 2); add(g, cyl(3.1, 3.1, 5, 14), M.rope, 2, 7.4, 30, 0, 0, Math.PI / 2);
  for (const x of [-4.8, 4.8]) add(g, rbox(1.2, 7, 1.2, 0.2), M.ironDark, 2 + x, 7, 30);
  pole(g, [2, 10, 29], [DX + DW / 2 - 1, DY + 1.5, DZ + DD / 2 - 1], 0.25, M.rope).userData.noShadow = true;
  crates(g, M, -34, 30, 2); crates(g, M, 36, 26, 1); barrel(g, M, 18, 32); barrel(g, M, 24, 34, 4, 2.4, 5.5);
  return g;
}
