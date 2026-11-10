// The Expedition's buildings after the Data centre (the re-theme's buildings family, 2026-11-10; not in the atlas:
// retheme.js renders them by filter). Stelian's rule: modern components, medieval materials. Timber (dark oak frames,
// weathered planks), cool grey stone footings, rope and canvas, with cables, panels, fans and neutral white LEDs
// added; no concrete, no containers. Team on flags, cloths, hi-vis vests, blankets, light strips and thin trim between
// ink lines, never a roof or deck slab. Each building on its own patch of trodden earth, no two the same shape. Same
// conventions as models.js: game units (a tile is 32), y up, +z south (to the camera).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { torus } from './harbour.js';
import { cone } from './vael.js';
import { oct } from './kingdom.js';
import { led, traveller, boardTex } from './expedition.js';
import { earth, brace } from './kingdom-buildings.js';
import { polishTextures } from './polish.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
/** The family's few extra materials, added to an Expedition set once; with `M.polish` (polish.js `polishMats` marks
 *  the set) they take the recipe too: the board walls and the notice board on the 1x course texture (`hiBoard`, as the
 *  slice's deck), folds in the tent canvas, tight glints on the ramp, the core's frame and the mast's wire. */
export function ebMats(M) {
  if (M.planks) return M;
  M.planks = std({ color: 0x929088, map: boardTex, roughness: 0.95, metalness: 0 });                                    // weathered board walls: a warm grey, matte, horizontal boards (round 3: even vertical ribs read as corrugated steel)
  M.board = std({ color: 0xc4c0b6, map: boardTex, roughness: 0.95 });                                            // a notice board's pale planks
  M.paper = std({ color: 0xd8d4c8, roughness: 0.95 });                                                          // notices pinned up
  M.blanket = M.paintCloth;                                                                                    // team blankets on the cots
  M.vest = M.paintCloth;                                                                                       // hi-vis vests: the team colour itself (the Mercenary's)
  M.wire = std({ color: 0x9a9ea2, metalness: 0.8, roughness: 0.4 });                                            // the mast's wire and antennas, pale steel
  M.core = std({ color: 0x3a3e44, metalness: 0.7, roughness: 0.3 });                                            // the Portal's imported core, dark machined metal
  M.ramp = std({ color: 0xb8bcc0, metalness: 0.5, roughness: 0.45 });                                            // the Portal's pale steel ramp and platform edge
  M.canvasGrey = std({ color: 0x8e908a, map: M.canvas.map, roughness: 0.94 });                                     // grey canvas: the Recruiting post's tent (round 3: the tan one was the side's one warm roof)
  M.litGlass = std({ color: 0x7a96a4, emissive: 0x4e6a78, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.2 }); // the Lab's glass front, lit from inside (the blind test: dark glass made it a troop building)
  M.screen = std({ color: 0xe4f0f4, emissive: 0xd4e8f0, emissiveIntensity: 2.2 });                                  // a glowing screen or bench top, cool white (never orange: seat 0 is gold)
  M.tank = std({ color: 0xa8acb0, metalness: 0.7, roughness: 0.4 });                                                // the Bunkhouse's water tank, pale steel
  M.tentCanvas = std({ color: 0x747670, map: M.canvas.map, roughness: 0.94 });                                     // the tent's canvas, a step darker than canvasGrey: under the polish's key a mid grey went near-white on the slopes
  if (M.polish) {
    const X = polishTextures(), set = (m, o) => { Object.assign(m, o); m.needsUpdate = true; };
    set(M.planks, { map: X.hiBoard, bumpMap: X.board, bumpScale: 1.4 });                                       // the boards' seams drawn for 1x (the walls keep their mid grey under the lighter shingles: the slice's split)
    set(M.board, { map: X.hiBoard, bumpMap: X.board, bumpScale: 1.0 });
    set(M.canvasGrey, { bumpMap: X.fold, bumpScale: 0.6 });
    set(M.ramp, { roughness: 0.28, envMapIntensity: 2.4, bumpMap: X.scuff, bumpScale: 0.4 });                   // one bright line along the ramp's treads under the key
    set(M.core, { roughness: 0.25, envMapIntensity: 2.4, bumpMap: X.scuff, bumpScale: 0.3 });
    set(M.wire, { roughness: 0.3, envMapIntensity: 2.4 });
    set(M.tank, { roughness: 0.25, envMapIntensity: 2.4, bumpMap: X.scuff, bumpScale: 0.4 });
    set(M.tentCanvas, { bumpMap: X.fold, bumpScale: 0.6 });
  }
  return M;
}
/** A pitched canvas tent on the ground (ridge along x): the canvas prism down to a dark hem, a ridge pole showing past
 *  both ends, a pair of crossed poles at each end, pegs along the eaves, a dark entrance up the south slope with its flap
 *  rolled at the foot. (The blind test read the Recruiting post's tent on a ridge pole over a deck, with its rafters and
 *  guys, as a scaffolded rig: this is one closed tent shape.) `y0` is the ground's top (the earth plate's). */
function tent(g, M, X, Z, L, Wd, R, y0 = 1.6) {
  const s = new THREE.Shape([new THREE.Vector2(-Wd / 2, 0), new THREE.Vector2(Wd / 2, 0), new THREE.Vector2(0, R)]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }); geo.translate(0, 0, -L / 2); geo.rotateY(Math.PI / 2); geo.computeVertexNormals();
  const uv = geo.attributes.uv, p = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 16, (p.getY(i) + p.getZ(i)) / 16);
  add(g, geo, M.tentCanvas, X, y0, Z);
  add(g, rbox(L + 0.6, 0.7, Wd + 0.8, 0.1), M.inkLine, X, y0 + 0.2, Z);                                                      // the dark hem along the ground
  add(g, rbox(L + 1.0, 1.4, 1.8, 0.3), M.oak, X, y0 + R + 0.5, Z);                                                            // a dark ridge board (at 40 degrees both slopes are lit: the ridge must draw the pitch)
  add(g, cyl(0.8, 0.8, L + 6, 8), M.oak, X, y0 + R + 0.9, Z, 0, 0, Math.PI / 2);                                             // the ridge pole, showing past both ends
  for (const k of [-0.34, 0.34]) for (const sz of [-1, 1]) add(g, rbox(0.6, 0.3, Math.hypot(Wd / 2, R) - 1, 0.05), M.inkLine, X + k * L, y0 + R / 2 + 0.25, Z + sz * Wd / 4, sz * Math.atan2(R, Wd / 2), 0, 0); // two canvas seams down each slope
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) limb(g, [X + sx * (L / 2 + 0.6), y0, Z + sz * (Wd / 2 + 1.5)], [X + sx * (L / 2 + 0.6), y0 + R + 2.0, Z - sz * 1.0], 0.7, M.oak); // crossed poles at each end
  for (const k of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) add(g, cyl(0.5, 0.6, 2.4, 6), M.oak, X + k * (L / 2 - 2), y0 + 0.8, Z + sz * (Wd / 2 + 2.4), 0.3 * sz, 0, 0); // pegs
  const th = Math.atan2(R, Wd / 2), nz = Math.sin(th) * 0.4, ny = Math.cos(th) * 0.4;                                          // the south slope's pitch; a hair proud of it along its normal
  add(g, plate([[-5.5, 0], [5.5, 0], [0, -11]], 0.3, 0.05), M.inkLine, X + 2, y0 + ny, Z + Wd / 2 + nz, th, 0, 0);               // the entrance: a dark triangle up the slope
  add(g, cyl(1.3, 1.3, 13, 10), M.tentCanvas, X + 2, y0 + 1.3, Z + Wd / 2 + 1.0, 0, 0, Math.PI / 2);                            // its flap rolled at the foot
}
/** A steel gutter along an eave from (x0, y, z) `L` long (along x) with a down pipe at its `end` (-1 west, 1 east):
 *  a lit line under the key at 2x, as the slice's hall took. */
function gutter(g, M, x, y, z, L, end, yFoot = 3.4) {
  add(g, cyl(0.55, 0.55, L, 8), M.steel, x, y, z, 0, 0, Math.PI / 2);
  limb(g, [x + end * L / 2, y, z], [x + end * L / 2, yFoot, z], 0.5, M.steel);
}

/** A short oak post. */
const post = (g, M, x, z, h, r = 0.9) => add(g, cyl(r, r + 0.15, h, 8), M.oak, x, h / 2, z);
/** A plank-walled timber hut on a stone footing along x: `W` x `D`, walls `H` tall, a silver plank gable roof `R` high,
 *  oak corner posts, an ink eave line. Returns nothing; the caller adds doors and gear. */
function hut(g, M, X, Z, W, D, H, R) {
  add(g, rbox(W + 2.6, 2.6, D + 2.6, 0.4), M.stone, X, 1.8, Z);
  add(g, rbox(W, H, D, 0.4), M.planks, X, H / 2 + 2, Z);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(1.8, H + 0.6, 1.8, 0.3), M.oak, X + sx * (W / 2 - 0.3), H / 2 + 2.2, Z + sz * (D / 2 - 0.3));
  add(g, rbox(W + 0.8, 1.3, 1.2, 0.2), M.oak, X, H + 1.6, Z + D / 2 + 0.2);
  gableX(g, M, X, Z, W + 5, D + 6, R, H + 2);
}
/** A gable roof along x (ridge along x) of silver planks with a ridge board and an ink eave line. */
function gableX(g, M, X, Z, L, Wd, R, y0) {
  const s = new THREE.Shape([new THREE.Vector2(-Wd / 2, 0), new THREE.Vector2(Wd / 2, 0), new THREE.Vector2(0, R)]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }); geo.translate(0, 0, -L / 2); geo.rotateY(Math.PI / 2); geo.computeVertexNormals();
  const uv = geo.attributes.uv, p = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 16, (p.getY(i) + p.getZ(i)) / 16);
  add(g, geo, M.roofDark, X, y0, Z);
  add(g, rbox(L + 0.6, 1.4, 1.6, 0.3), M.oak, X, y0 + R + 0.4, Z);
  add(g, rbox(L + 0.4, 0.6, Wd + 0.4, 0.1), M.inkLine, X, y0 - 0.1, Z);
}
/** A flag on an oak mast: team cloth between ink hems, facing the camera. */
function flag(g, M, x, y0, z, h, w, d) {
  add(g, cyl(0.7, 0.9, h, 8), M.oak, x, y0 + h / 2, z); add(g, rbox(1.2, 1.2, 1.2, 0.3), M.joint, x, y0 + h + 0.4, z);
  add(g, plate([[0, 0], [w, 0], [w, d], [w * 0.5, d - 1.2], [0, d]], 0.4, 0.1), M.paintCloth, x + 0.4, y0 + h - 0.8, z, Math.PI / 2, 0, 0);
  add(g, rbox(w + 0.4, 0.4, 0.5, 0.05), M.inkLine, x + 0.4 + w / 2, y0 + h - 0.8, z + 0.1); add(g, rbox(0.4, 0.4, d + 0.2, 0.05), M.inkLine, x + 0.4, y0 + h - 0.8, z + d / 2);
}
/** A team cloth hung on a south face at (x, y, z): the cloth between ink hems on an oak rod. */
function cloth(g, M, x, y, z, w, h) {
  const p = grp(); p.position.set(x, y, z); g.add(p);
  add(p, rbox(w, h, 0.5, 0.1), M.paintCloth, 0, -h / 2, 0); add(p, rbox(w + 0.4, 0.5, 0.6, 0.05), M.inkLine, 0, -0.2, 0); add(p, rbox(w + 0.4, 0.5, 0.6, 0.05), M.inkLine, 0, -h + 0.2, 0);
  add(p, cyl(0.4, 0.4, w + 2, 8), M.oak, 0, 0.3, 0.2, 0, 0, Math.PI / 2);
}
/** A solar panel of dark glass on an oak frame, tilted to the south. */
function solar(g, M, x, z, w, d, h = 5) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) post(g, M, x + sx * (w / 2 - 1), z + sz * (d / 2 - 1), sz < 0 ? h + 2.4 : h, 0.6);
  add(g, rbox(w, 0.8, d, 0.2), M.glass, x, h + 1.6, z, 0.38, 0, 0); add(g, rbox(w + 0.4, 0.4, d + 0.4, 0.1), M.joint, x, h + 1.2, z, 0.38, 0, 0);
  for (const sx of [-w / 6, w / 6]) add(g, rbox(0.5, 0.9, d + 0.2, 0.1), M.steel, x + sx, h + 1.7, z, 0.38, 0, 0);
}
/** A cable from a to b, drawn thick, sagging a little. */
function cable(g, M, a, b, r = 0.45) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.08, (a[2] + b[2]) / 2];
  limb(g, a, m, r, M.cable); limb(g, m, b, r, M.cable);
}
/** A rack: a charcoal server cabinet with thin team light strips down its south door and a LED on top. */
function rack(g, M, x, y, z) {
  add(g, rbox(6.0, 10, 6.2, 0.4), M.rackSide, x, y + 5, z);
  add(g, rbox(5.4, 8.8, 0.6, 0.1), M.panelDark, x, y + 5, z + 3.1);
  for (const dx of [-1.8, 1.8]) add(g, rbox(0.5, 8.4, 0.5, 0.1), M.paintLED, x + dx, y + 5, z + 3.4);
  led(g, M, 0.3, x, y + 8.6, z + 3.6);
}
/** A cot: a timber frame on short legs, a team blanket over it between ink hems, a pale pillow. */
function cot(g, M, x, z, ry = 0) {
  const c = grp(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
  for (const [dx, dz] of [[-5, -2.4], [5, -2.4], [-5, 2.4], [5, 2.4]]) add(c, cyl(0.5, 0.5, 3, 6), M.oak, dx, 1.5, dz);
  add(c, rbox(12, 1.0, 6, 0.3), M.oak, 0, 3.2, 0);
  add(c, rbox(10.5, 1.8, 6.6, 0.6), M.blanket, 0.8, 4.3, 0); add(c, rbox(10.8, 0.4, 6.8, 0.05), M.inkLine, 0.8, 3.6, 0); add(c, rbox(0.5, 2.0, 6.8, 0.05), M.inkLine, 6.0, 4.3, 0);
  add(c, rbox(2.4, 1.2, 4.6, 0.5), M.canvasLocal, -4.5, 4.2, 0);
}

/** A two-tier bunk bed, its length along z (end-on to the camera): oak posts and frames, a mattress each with a pale
 *  pillow at the head (north) and a team blanket down to the foot, a ladder at the foot. The ground's top is 1.6. */
function bunk(g, M, x, z) {
  const b = grp(); b.position.set(x, 1.6, z); g.add(b);
  for (const [dx, dz] of [[-3.2, -6.2], [3.2, -6.2], [-3.2, 6.2], [3.2, 6.2]]) add(b, rbox(0.9, 11.5, 0.9, 0.2), M.oak, dx, 5.75, dz);
  for (const y of [2.6, 7.8]) {
    add(b, rbox(6.8, 0.8, 12.8, 0.2), M.oak, 0, y, 0);
    add(b, rbox(6.0, 1.4, 11.8, 0.4), M.canvasLocal, 0, y + 1.0, 0);                                                                     // the mattress
    add(b, rbox(5.6, 1.1, 8.6, 0.4), M.blanket, 0, y + 1.7, 1.6); for (const dz of [-2.7, 5.9]) add(b, rbox(5.8, 0.3, 0.6, 0.05), M.inkLine, 0, y + 2.05, dz); // the team blanket, hems at head and foot
    add(b, rbox(4.6, 1.3, 2.8, 0.5), M.paper, 0, y + 2.2, -4.3);                                                                          // the pillow, pale
  }
  for (const dx of [-1.2, 1.2]) limb(b, [dx, 0.4, 6.9], [dx, 10.4, 6.9], 0.4, M.oak); for (let y = 2; y < 10; y += 2) limb(b, [-1.2, y, 6.9], [1.2, y, 6.9], 0.35, M.oak); // the ladder at the foot
}
/** A washing line from `a` to `b` (a sagging rope) with clothes pegged along it, each hung facing along the line: shirts (a
 *  body and two sleeves) and trousers (a waist and two legs) in fatigues grey, tan and white, and two team hi-vis vests. */
function laundry(g, M, a, b) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1.0, (a[2] + b[2]) / 2];
  limb(g, a, m, 0.3, M.rope); limb(g, m, b, 0.3, M.rope);
  const ry = -Math.atan2(b[2] - a[2], b[0] - a[0]);
  [['shirt', M.uniform], ['trousers', M.hose], ['vest', M.vest], ['shirt', M.paper], ['vest', M.vest]].forEach(([kind, mat], k) => {
    const t = 0.14 + k * 0.18, p = grp(); p.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t); p.rotation.y = ry; g.add(p);
    if (kind === 'shirt') { add(p, rbox(4.0, 4.6, 0.5, 0.3), mat, 0, -2.5, 0); for (const sx of [-2.6, 2.6]) add(p, rbox(1.4, 2.2, 0.5, 0.3), mat, sx, -1.4, 0); }
    else if (kind === 'trousers') { add(p, rbox(4.0, 1.4, 0.5, 0.2), mat, 0, -0.8, 0); for (const sx of [-1.1, 1.1]) add(p, rbox(1.7, 5.0, 0.5, 0.3), mat, sx, -4.0, 0); }
    else { add(p, rbox(4.2, 5.2, 0.6, 0.4), mat, 0, -2.8, 0); add(p, rbox(3.6, 0.6, 0.65, 0.05), M.hivis, 0, -2.6, 0); for (const y of [-0.3, -5.3]) add(p, rbox(4.4, 0.4, 0.65, 0.05), M.inkLine, 0, y, 0); }
    for (const sx of [-1.4, 1.4]) add(p, rbox(0.6, 1.2, 0.7, 0.1), M.oak, sx, 0.2, 0);                                                     // pegs
  });
}
/** A three-legged stool; its seat is at 4.9. */
const stool = (g, M, x, z) => { add(g, cyl(1.6, 1.4, 1.0, 10), M.oak, x, 4.4, z); for (const a of [0.5, 2.6, 4.7]) add(g, cyl(0.4, 0.5, 3.4, 6), M.oak, x + Math.cos(a) * 1.1, 2.9, z + Math.sin(a) * 1.1); };
/** A small seated figure on a seat whose top is at y, facing `ry` (0 is +x): legs forward under the table, hands on it, a
 *  cap; `top` its tunic or jacket. A static prop at well under unit size, never a unit (the PM): seated, neutral, at the table. */
function seated(g, M, x, y, z, ry, top, cap) {
  const f = grp(); f.position.set(x, y, z); f.rotation.y = ry; g.add(f);
  add(f, rbox(3.2, 4.6, 4.2, 1.0), top, 0, 2.6, 0);
  for (const sz of [-1.1, 1.1]) { limb(f, [0.6, 0.4, sz], [3.4, 0.4, sz], 0.95, M.hose); limb(f, [3.4, 0.4, sz], [3.4, -3.2, sz], 0.85, M.hose); add(f, rbox(2.2, 1.0, 1.6, 0.4), M.leather, 3.9, -3.6, sz); }
  for (const sz of [-2.2, 2.2]) limb(f, [0.8, 4.2, sz], [3.6, 3.0, sz * 0.7], 0.85, top);
  add(f, sph(1.6, 12, 10), M.skin, 0.3, 6.2, 0); add(f, sph(1.75, 12, 8), cap, 0.1, 6.7, 0).scale.set(1, 0.6, 1);
}

/** Bunkhouse (population, 2x2): where the crew sleeps. A long timber bunkhouse of weathered boards in a dark oak frame on a
 *  stone footing under a low shingle roof, a wide solar array on its south slope, a lantern (white LED) hung from the eave
 *  over the door with its cable down to a battery box, a pale steel water tank on an oak frame at the east end; before it,
 *  in the open, two bunk beds end-on to the camera (two tiers each, pale pillows at the head, team blankets, a ladder at
 *  the foot) and a washing line of clothes from the house's corner to a pole; two flags, a cloth on the west gable, boots
 *  by the door, barrels. No deck, counter, valance or awning (the re-test: a row of cots on a boardwalk under a valance
 *  read as a hiring post or a saloon). From the camera: a grey roof with a dark glass slab, a white light, two bunks with
 *  team blankets and pale pillows, washing on a line, a pale tank. */
export function bunkhouse(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-31, -24], [26, -30], [31, -2], [27, 28], [-22, 30], [-31, 6]]);
  const X = -2, Z = -8, W = 58, D = 20, H = 8, SZ = Z + D / 2;                                                                       // long and low; SZ its south face
  hut(g, M, X, Z, W, D, H, 4.5);
  // the modern parts on the camera side: the solar array, the lantern over the door, its cable to a battery box, the tank
  add(g, rbox(28, 0.8, 9, 0.2), M.glass, X + 6, H + 4.4, Z + 5.6, 0.38, 0, 0); add(g, rbox(28.4, 0.4, 9.4, 0.1), M.joint, X + 6, H + 4.1, Z + 5.6, 0.38, 0, 0); for (const dx of [-9.4, 0, 9.4]) add(g, rbox(0.5, 0.9, 9.2, 0.1), M.steel, X + 6 + dx, H + 4.5, Z + 5.6, 0.38, 0, 0);
  add(g, rbox(5, 7, 1.0, 0.3), M.oak, X - 10, 5.5, SZ + 0.6); add(g, rbox(5.6, 7.6, 0.5, 0.1), M.inkLine, X - 10, 5.5, SZ + 0.4);        // the door
  for (const x of [-22, 2, 12, 22]) { add(g, rbox(3.6, 2.6, 0.6, 0.1), M.glass, X + x, 7.2, SZ + 0.5); add(g, rbox(4.2, 3.2, 0.4, 0.1), M.oak, X + x, 7.2, SZ + 0.3); } // a row of small windows
  add(g, rbox(3.0, 1.8, 2.4, 0.3), M.joint, X - 10, H + 0.2, SZ + 3.6); led(g, M, 1.1, X - 10, H - 1.1, SZ + 4.0);                        // the lantern, hung from the eave over the door
  cable(g, M, [X - 4, H + 5.6, Z + 10.2], [X - 10, H + 1.0, SZ + 3.6]); cable(g, M, [X - 10, H + 1.0, SZ + 3.6], [X - 27, 5.0, SZ + 6]);
  add(g, rbox(4.6, 3.6, 3.6, 0.4), M.panelDark, X - 27, 3.4, SZ + 6.5); led(g, M, 0.4, X - 27, 5.6, SZ + 8.3);                             // the battery box
  const TK = X + W / 2 + 3.4, TZ = Z + 4;                                                                                            // the water tank on an oak frame at the east end (inside the footprint), a pipe and a tap
  for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) post(g, M, TK + dx, TZ + dz, 7, 0.7);
  add(g, cyl(3.3, 3.3, 7, 14), M.tank, TK, 10.5, TZ); for (const y of [7.3, 13.7]) add(g, cyl(3.45, 3.45, 0.5, 14), M.joint, TK, y, TZ); add(g, cyl(1.2, 1.2, 0.8, 8), M.joint, TK, 14.3, TZ);
  limb(g, [TK, 7.6, TZ + 3.3], [TK - 1.5, 4.4, TZ + 10], 0.45, M.steel); add(g, rbox(1.4, 1.2, 1.4, 0.2), M.steel, TK - 1.5, 4.4, TZ + 10.4);
  // the beds, in the open before the house: two bunks end-on to the camera, pale pillows at the head, team blankets, ladders
  bunk(g, M, X - 17, SZ + 10); bunk(g, M, X - 1, SZ + 10.5);
  // the washing line from the house's south-east corner to a pole: shirts and trousers in fatigues grey, tan and white, two team vests
  const PX = X + 9, PZ = SZ + 16;
  add(g, cyl(0.8, 0.9, 12, 8), M.oak, PX, 7.6, PZ);
  laundry(g, M, [X + W / 2 - 0.5, H + 1.4, SZ + 0.4], [PX, 13.4, PZ]);
  for (const [x, z] of [[X - 7.5, SZ + 3.2], [X - 5.2, SZ + 2.9]]) add(g, rbox(1.6, 1.2, 3, 0.4), M.boot, x, 2.2, z);                  // boots by the door
  flag(g, M, X + W / 2 + 1, H + 2, Z - 2, 18, 22, 14);
  flag(g, M, X - W / 2 + 2, H + 6.5, Z, 14, 16, 11);                                                                                  // a second flag on the ridge's west end
  cloth(g, M, X - W / 2 - 0.6, H + 1.0, Z + 2, 8, 9);                                                                                 // a cloth hung on the west gable's end post
  for (const [x, z] of [[X + 20, SZ + 6], [X + 24, SZ + 10]]) { add(g, cyl(2.2, 2.4, 5, 12), M.oakPale, x, 4.1, z); for (const y of [2.8, 5.6]) add(g, torus(2.45, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); }
  if (M.polish) { // secondary detail: a steel gutter along the eave with a down pipe at the east end by the tank, oak sills under the windows
    gutter(g, M, X, H + 2.5, SZ + 3.6, W + 5, 1, 3.4);
    for (const x of [-22, 2, 12, 22]) add(g, rbox(4.6, 0.6, 1.2, 0.1), M.oak, X + x, 5.5, SZ + 0.7);
  }
  return g;
}

/** Recruiting post (Mercenary, Veteran; 2x2): where the locals sign on. One pitched canvas tent on the ground (its ridge
 *  along x, the entrance in the south slope, a ridge pole and crossed end poles, pegs); up front, big, a notice board of
 *  pale planks facing the camera with papers pinned under a small shingle hood and a rack of five hi-vis vests in the team
 *  colour itself (the Mercenary's) facing the camera; between them a table under a team cloth with a tablet and a form,
 *  the recruiter seated behind it and one local seated before it (small, seated, no team: static props at the table,
 *  never units); a tall flag, a second flag, a team banner from the ridge pole's end, crates. From the camera: a grey canvas
 *  tent with a dark door, a pale board and a row of team vests before it, two figures at a table, two flags. */
export function recruitingPost(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-30, -20], [20, -30], [31, 2], [22, 28], [-24, 31], [-31, 8]]);
  const X = -2, Z = -8, L = 34, Wd = 24, R = 14, F = Z + Wd / 2;                                                                    // F: the tent's south foot
  tent(g, M, X, Z, L, Wd, R);
  cloth(g, M, X + L / 2 + 2.6, R + 1.8, Z + 0.6, 7, 10);                                                                             // a team banner hung from the ridge pole's east end
  flag(g, M, X - L / 2 - 2.6, 1.6, Z - 2, 28, 18, 12);                                                                               // the tall flag at the west end
  flag(g, M, X + L / 2 + 2.6, 1.6, Z - Wd / 2 - 3, 20, 14, 10);                                                                       // a second at the north-east
  // the notice board, big and up front at the south-west: pale planks facing the camera on two posts, papers pinned, a header, a hood
  const BX = X - 18, BZ = F + 12;
  for (const dx of [-9.5, 9.5]) post(g, M, BX + dx, BZ, 19, 1.0);
  add(g, rbox(20, 13, 1.4, 0.2), M.board, BX, 10.5, BZ);
  for (const [dx, y, w, h] of [[-6.5, 13, 4.2, 4.4], [-0.5, 14, 4.8, 3.4], [5.5, 12.6, 3.8, 4.2], [-3.5, 7.5, 5.2, 2.8], [3.5, 6.8, 3.2, 3.2], [7.5, 8.2, 2.4, 2.4]]) add(g, rbox(w, h, 0.5, 0.05), M.paper, BX + dx, y, BZ + 0.9);
  add(g, rbox(18, 2.8, 0.4, 0.05), M.paper, BX, 18.6, BZ + 0.95); add(g, rbox(18.2, 0.3, 0.45, 0.02), M.inkLine, BX, 20.1, BZ + 1.0);
  { const r = add(g, rbox(22, 0.8, 5.5, 0.2), M.roofDark, BX, 20.8, BZ - 1.3); r.rotation.x = 0.3; }
  // the vest rack, big and up front at the south-east: a steel rail on two posts, five hi-vis vests in the team colour facing the camera
  const VX = X + 18, VZ = F + 12;
  for (const dx of [-12, 12]) post(g, M, VX + dx, VZ, 15, 1.0); add(g, cyl(0.5, 0.5, 26, 6), M.steel, VX, 14.6, VZ, 0, 0, Math.PI / 2);
  for (let k = 0; k < 5; k++) { const x = VX - 10 + k * 5; add(g, rbox(4.4, 7.4, 1.2, 0.5), M.vest, x, 10.4, VZ); for (const y of [14.1, 6.7]) add(g, rbox(4.6, 0.4, 1.3, 0.05), M.inkLine, x, y, VZ); add(g, rbox(3.6, 0.7, 1.3, 0.05), M.hivis, x, 10.0, VZ); add(g, cyl(0.5, 0.5, 1.2, 6), M.steel, x, 14.3, VZ); }
  // the table before the entrance: oak under a team cloth, a tablet and a form; the recruiter seated behind it (fatigues, a dark cap)
  // and one local seated before it (tan tunic): small seated props at the table, no team colour
  const TX = X + 2, TZ = F + 6.5;
  add(g, rbox(11, 1.0, 6, 0.2), M.oak, TX, 6.0, TZ); for (const [dx, dz] of [[-4.5, -2.2], [4.5, -2.2], [-4.5, 2.2], [4.5, 2.2]]) add(g, rbox(1.1, 4.4, 1.1, 0.2), M.oak, TX + dx, 3.6, TZ + dz);
  add(g, rbox(11.4, 0.6, 6.4, 0.2), M.paintCloth, TX, 6.7, TZ); add(g, rbox(11.8, 0.3, 6.8, 0.05), M.inkLine, TX, 6.45, TZ);
  add(g, rbox(3.4, 0.4, 2.4, 0.1), M.glass, TX + 2.5, 7.2, TZ + 0.5); add(g, rbox(3.0, 0.25, 2.0, 0.1), M.visor, TX + 2.5, 7.4, TZ + 0.5);
  add(g, rbox(2.6, 0.5, 2.0, 0.1), M.paper, TX - 3, 7.2, TZ - 0.5, 0, 0.3, 0);
  for (const [dz, ry, top, cap] of [[-5.6, -Math.PI / 2, M.uniform, M.armour], [5.6, Math.PI / 2, M.canvasLocal, M.hose]]) { stool(g, M, TX, TZ + dz); seated(g, M, TX, 4.9, TZ + dz, ry, top, cap); }
  for (let k = 0; k < 3; k++) add(g, rbox(4.2, 3.8, 4.2, 0.4), M.oakPale, X + L / 2 + 6 + (k % 2) * 4.6, 3.6 + Math.floor(k / 2) * 3.8, Z + 6 + (k % 2) * 1.2); // crates
  if (M.polish) { // secondary detail: brackets on the vest rail, iron bands on the board's posts, a clipboard on the table
    for (const sx of [-1, 1]) add(g, rbox(0.9, 1.8, 1.2, 0.1), M.joint, VX + sx * 12, 14.2, VZ);
    for (const dx of [-9.5, 9.5]) for (const y of [5, 16]) add(g, torus(1.1, 0.2, 10), M.joint, BX + dx, y, BZ, Math.PI / 2, 0, 0);
    add(g, rbox(2.4, 0.35, 1.8, 0.05), M.paper, TX + 0.2, 7.2, TZ - 1.6, 0, -0.2, 0);
  }
  return g;
}

/** Factory (Buggy, Rover, Drone; 3x3): machines are built here. A timber barn along x on a stone footing (plank walls
 *  in a dark oak frame, a silver plank gable roof with a louvred vent), a wide door open on its south side (both
 *  leaves slid back) showing a dark inside with a LED strip; in the yard before it the robot arm on a plinth (grey steel,
 *  team pads on its joints, a white work light at its wrist) bent over a Buggy's bare chassis on trestles; east, under
 *  an open lean-to, the 3D printer: a tall oak-and-steel frame with a dark glass front and a lit bed; a cable run to a
 *  solar rack; drums, a parts crate, a team banner over the door and a flag on the gable. From the camera: a long grey
 *  roof over a wide black doorway, a bent grey arm with team pads in front, a glass box beside. */
export function factory(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-47, -40], [44, -46], [48, 10], [40, 46], [-30, 47], [-47, 20]]);
  const X = -6, Z = -20, W = 76, D = 34, H = 16;
  hut(g, M, X, Z, W, D, H, 11);
  for (const x of [-24, -8, 8, 24]) add(g, rbox(1.6, H, 1.2, 0.2), M.oak, X + x, H / 2 + 2, Z + D / 2 + 0.3);                      // frame posts on the south face
  add(g, rbox(W + 0.4, 1.2, 1.2, 0.2), M.oak, X, 9, Z + D / 2 + 0.3);                                                                 // the rail
  // the wide door: a dark opening 26 across, its two leaves slid back along the wall, a team banner over it
  add(g, rbox(26, H - 3.6, 0.8, 0.2), M.inkLine, X + 2, (H - 3.6) / 2 + 2, Z + D / 2 + 0.5);
  add(g, rbox(26, 0.6, 2.2, 0.1), M.led, X + 2, H - 2.2, Z + D / 2 + 0.6);                                                            // a white light strip inside the lintel: the bay is lit
  for (const sx of [-1, 1]) { add(g, rbox(13, H - 3, 1.2, 0.3), M.planks, X + 2 + sx * 20.5, (H - 3) / 2 + 2, Z + D / 2 + 1.2); add(g, rbox(13.4, 0.8, 1.4, 0.1), M.oak, X + 2 + sx * 20.5, H - 0.8, Z + D / 2 + 1.2); add(g, rbox(13.4, 0.8, 1.4, 0.1), M.oak, X + 2 + sx * 20.5, 2.6, Z + D / 2 + 1.2); }
  add(g, rbox(27, 1.4, 1.6, 0.3), M.steel, X + 2, H - 0.4, Z + D / 2 + 1.8);                                                            // the door's rail
  for (const sx of [-1, 1]) { add(g, rbox(2.4, H - 3.6, 0.8, 0.1), M.paint, X + 2 + sx * 14.0, (H - 3.6) / 2 + 2, Z + D / 2 + 0.9); add(g, rbox(3.0, H - 3.2, 0.5, 0.05), M.inkLine, X + 2 + sx * 14.0, (H - 3.6) / 2 + 2, Z + D / 2 + 0.7); } // team trim on the door's jambs (wider since the awning went)
  add(g, rbox(30, 2.4, 0.8, 0.1), M.paint, X + 2, H - 1.4, Z + D / 2 + 1.0); add(g, rbox(30.4, 3.0, 0.5, 0.05), M.inkLine, X + 2, H - 1.4, Z + D / 2 + 0.8);                           // and along its head
  cloth(g, M, X + 2, H + 1.6, Z + D / 2 + 2.6, 26, 7);
  add(g, rbox(W + 5, 2.4, 0.6, 0.1), M.paintCloth, X, H + 0.7, Z + D / 2 + 3.5); for (const y of [H + 2.0, H - 0.6]) add(g, rbox(W + 5.4, 0.3, 0.7, 0.05), M.inkLine, X, y, Z + D / 2 + 3.5); // a team stripe along the eave's fascia (the awning's share moved here and to bigger flags)
  { const d = grp(); d.position.set(X - 14, H + 2 + 11 - 5, Z); g.add(d); add(d, rbox(10, 6, 8, 0.4), M.planks, 0, 3, 0); add(d, rbox(11, 0.8, 9.4, 0.2), M.roofDark, 0, 6.4, 0); for (let k = 0; k < 3; k++) add(d, rbox(0.8, 0.6, 7, 0.1), M.joint, 0, 1.6 + k * 1.4, 4.2, 0.5, 0, 0); } // a louvred vent on the ridge
  // the vehicle bay: a Buggy's bare chassis on trestles straddling the open doorway, the robot arm on its plinth beside it at
  // 1.5x bent over it, a white work lamp over the bay, two cable drums (the blind test, 3 of 4: the striped awning over the
  // yard made it a market stall or tavern, so it is gone, and the machine stands in the doorway where the eye lands)
  const AX = X - 15, AZ = Z + D / 2 + 9;
  add(g, rbox(9, 3, 9, 0.4), M.stone, AX, 3.5, AZ); add(g, cyl(3.4, 3.8, 2.4, 12), M.joint, AX, 6.2, AZ);
  add(g, rbox(3.0, 1.6, 2.6, 0.3), M.joint, X + 2, H + 0.6, Z + D / 2 + 2.6); led(g, M, 1.0, X + 2, H - 0.6, Z + D / 2 + 3.2);       // the work lamp over the bay, white
  for (const [x, z] of [[X - 27, Z + D / 2 + 20], [X - 21, Z + D / 2 + 24]]) { add(g, cyl(3.0, 3.0, 2.4, 14), M.oakPale, x, 3.6 + 1.6, z, 0, 0, Math.PI / 2); add(g, cyl(2.1, 2.1, 2.8, 12), M.cable, x, 3.6 + 1.6, z, 0, 0, Math.PI / 2); } // cable drums
  { const a = grp(); a.position.set(AX, 7.2, AZ); a.rotation.y = 0.42; a.scale.setScalar(1.5); g.add(a);
    add(a, cyl(2.2, 2.2, 3, 12), M.paleSteel, 0, 1.2, 0); limb(a, [0, 2, 0], [-3, 14, 0], 1.6, M.paleSteel); add(a, sph(2.2, 10, 8), M.joint, -3, 14, 0);
    add(a, cyl(2.4, 2.4, 2.0, 12), M.paint, -3, 14, 0, 0, 0, Math.PI / 2); add(a, torus(2.4, 0.3, 14), M.inkLine, -3, 14, -1.0); add(a, torus(2.4, 0.3, 14), M.inkLine, -3, 14, 1.0); // a team pad on the elbow between ink rings
    limb(a, [-3, 14, 0], [8, 10, 2], 1.3, M.paleSteel); add(a, sph(1.7, 10, 8), M.joint, 8, 10, 2);
    limb(a, [8, 10, 2], [11, 5, 3], 1.0, M.paleSteel); add(a, rbox(3, 2.2, 2.4, 0.4), M.joint, 11.6, 4.2, 3.2); led(a, M, 0.7, 12.4, 3.4, 4.2);
    add(a, rbox(1.2, 3.4, 3.2, 0.2), M.paint, 2.5, 12.6, 1.0, 0, 0, 0.35); add(a, rbox(1.3, 0.3, 3.4, 0.05), M.inkLine, 1.9, 14.3, 1.0, 0, 0, 0.35); add(a, rbox(1.3, 0.3, 3.4, 0.05), M.inkLine, 3.1, 11.0, 1.0, 0, 0, 0.35); } // a team band on the forearm
  { const c = grp(); c.position.set(X + 3, 0, Z + D / 2 + 1.5); g.add(c);                                                              // the chassis on two trestles, half out of the doorway
    for (const dx of [-7, 7]) { for (const sx of [-1, 1]) limb(c, [dx + sx * 3, 0.5, 4], [dx, 6, 0], 0.7, M.oak); limb(c, [dx, 6, 0], [dx, 6, 0.1], 0.1, M.oak); }
    add(c, rbox(20, 1.6, 8, 0.6), M.trim, 0, 7.2, 0); for (const dz of [-2.4, 2.4]) add(c, rbox(16, 0.8, 1.0, 0.2), M.steel, 0, 8.2, dz);
    add(c, rbox(14, 1.0, 0.5, 0.1), M.paint, 0, 7.4, 4.1); add(c, rbox(14.4, 0.3, 0.55, 0.05), M.inkLine, 0, 8.0, 4.1); add(c, rbox(14.4, 0.3, 0.55, 0.05), M.inkLine, 0, 6.8, 4.1); // a team stripe along its flank, the Buggy's
    add(c, rbox(5, 2.4, 6, 0.6), M.panelDark, -5, 8.8, 0); add(c, rbox(3, 1.0, 2.6, 0.4), M.paint, 1, 8.6, -1.6); add(c, rbox(3.2, 0.3, 2.8, 0.05), M.inkLine, 1, 9.2, -1.6); // its battery pack and one team seat pad, fitted
    for (const [dx, dz] of [[-6, -5.4], [6, -5.4]]) { add(c, cyl(3.4, 3.4, 2.6, 16), M.tyre, dx, 7.2, dz, Math.PI / 2, 0, 0); add(c, cyl(1.7, 1.7, 2.7, 10), M.paleSteel, dx, 7.2, dz, Math.PI / 2, 0, 0); if (M.polish) add(c, torus(1.1, 0.2, 12), M.joint, dx, 7.2, dz - 1.45); } } // (polish: the Buggy's bolt rings on the hubs)
  // the 3D printer under an open lean-to east of the door: a tall frame, a dark glass front, a lit bed, a spool
  const PX = X + 30, PZ = Z + D / 2 + 14;
  for (const [dx, dz] of [[-8, -6], [8, -6], [-8, 7], [8, 7]]) post(g, M, PX + dx, PZ + dz, dz < 0 ? 22 : 18, 0.9);
  { const r = add(g, rbox(20, 1.0, 17, 0.2), M.roofDark, PX, 21, PZ + 0.5); r.rotation.x = 0.22; add(g, rbox(20.4, 0.5, 0.9, 0.1), M.inkLine, PX, 19.2, PZ + 8.2); }
  add(g, rbox(10, 12, 9, 0.5), M.panelDark, PX, 9, PZ - 1); add(g, rbox(8.6, 8.4, 0.8, 0.2), M.glass, PX, 10.4, PZ + 3.6); add(g, rbox(9.4, 9.2, 0.5, 0.1), M.inkLine, PX, 10.4, PZ + 3.4);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(1.2, 12.4, 1.2, 0.2), M.steel, PX + sx * 5, 9, PZ - 1 + sz * 4.5);
  add(g, rbox(8, 0.6, 7, 0.1), M.led, PX, 4.6, PZ - 1); add(g, rbox(1.4, 1.4, 2.4, 0.2), M.joint, PX, 13.6, PZ + 2); led(g, M, 0.5, PX, 12.6, PZ + 3.2);
  add(g, cyl(2.2, 2.2, 1.6, 14), M.paint, PX + 6.6, 14.4, PZ - 3, Math.PI / 2, 0, 0); add(g, torus(2.2, 0.3, 14), M.inkLine, PX + 6.6, 14.4, PZ - 2.1); add(g, torus(2.2, 0.3, 14), M.inkLine, PX + 6.6, 14.4, PZ - 3.9); // a spool of team filament
  solar(g, M, X + W / 2 - 4, Z + D / 2 + 30, 20, 11, 4); cable(g, M, [X + W / 2 - 4, 10, Z + D / 2 + 25], [PX + 6, 15, PZ - 7]);
  flag(g, M, X - W / 2 - 1, H + 2, Z, 24, 26, 18); flag(g, M, X + W / 2 + 1, H + 2, Z - 6, 20, 22, 14);                               // (bigger since the awning went: the floor is 0.12)
  cloth(g, M, X + W / 2 - 14, H + 1.4, Z + D / 2 + 1.6, 9, 11); cloth(g, M, X - W / 2 + 10, H + 1.4, Z + D / 2 + 1.6, 9, 11);                 // cloths hung from the eave either side of the door
  add(g, rbox(20, 2.6, 0.5, 0.1), M.paintCloth, PX, 18.4, PZ + 8.6); for (const y of [19.6, 17.2]) add(g, rbox(20.4, 0.4, 0.6, 0.05), M.inkLine, PX, y, PZ + 8.6); // a team valance along the lean-to's eave
  for (const [x, z] of [[X - 34, Z + D / 2 + 26], [X - 29, Z + D / 2 + 30]]) { add(g, cyl(2.4, 2.6, 5, 12), M.panelDark, x, 4.5, z); add(g, torus(2.6, 0.25, 12), M.inkLine, x, 6, z, Math.PI / 2, 0, 0); }
  for (let k = 0; k < 4; k++) add(g, rbox(4.4, 4, 4.4, 0.4), M.oakPale, X + W / 2 - 8 + (k % 2) * 4.8, 4 + Math.floor(k / 2) * 4, Z - 2 + (k % 2) * 1.2 + D / 2 + 4);
  add(g, rbox(11, 0.8, 7, 0.3), M.paintCloth, X + W / 2 - 5.6, 10.3, Z + D / 2 + 2.6); add(g, rbox(11.4, 0.3, 7.4, 0.05), M.inkLine, X + W / 2 - 5.6, 9.9, Z + D / 2 + 2.6); // a team tarp over the parts crates
  if (M.polish) { // secondary detail: a gutter along the south eave with a down pipe at the west end, knee braces at the outer frame posts, steel rollers on the door's rail, a cable up the robot arm, bolt rings on the chassis' hubs (above)
    gutter(g, M, X, H + 2.5, Z + D / 2 + 3.5, W + 5, -1, 3.5);
    for (const x of [-24, 24]) { brace(g, M, X + x, H - 2.6, Z + D / 2 + 0.3, -4, 3.4); brace(g, M, X + x, H - 2.6, Z + D / 2 + 0.3, 4, 3.4); }
    for (const sx of [-1, 1]) for (const dx of [-5, 5]) add(g, rbox(1.6, 1.3, 1.5, 0.3), M.steel, X + 2 + sx * 20.5 + dx, H + 0.3, Z + D / 2 + 1.8);
    cable(g, M, [AX + 3.6, 6.4, AZ + 3.4], [AX - 2.2, 20.4, AZ + 1.6], 0.4);
  }
  return g;
}

/** Lab (upgrades, 2x2): a timber workshop with a glass front: dark glass panes in an oak frame across its whole south
 *  face under a silver plank roof, screens glinting inside, a bench with instruments; on the roof a dish antenna and two
 *  whip antennas with LEDs, a small weather vane; a solar rack beside it and a cable; team: a flag, a banner across the
 *  glass front's lintel, a cloth on the east gable. From the camera: a grey roof over a dark glass wall with pale
 *  glints, a dish and two thin antennas above. */
export function lab(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-31, -22], [24, -30], [31, 6], [20, 30], [-26, 29], [-30, 2]]);
  const X = -4, Z = -6, W = 40, D = 24, H = 14;
  add(g, rbox(W + 2.6, 2.6, D + 2.6, 0.4), M.stone, X, 1.8, Z);
  add(g, rbox(W, H, D - 2, 0.4), M.planks, X, H / 2 + 2, Z - 1);                                                                     // the body, its south face set back behind the glass
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(1.8, H + 0.6, 1.8, 0.3), M.oak, X + sx * (W / 2 - 0.3), H / 2 + 2.2, Z + sz * (D / 2 - 0.3));
  // the glass front, lit from inside: panes of glowing glass in an oak frame, big screens glowing behind them (the blind
  // test, 2 of 4: dark glass under a dark solar roof read as a troop building)
  add(g, rbox(W - 2, H - 2, 0.8, 0.1), M.litGlass, X, H / 2 + 2, Z + D / 2 - 0.2);
  for (const x of [-12, -4, 4, 12]) add(g, rbox(1.2, H - 1.6, 1.2, 0.2), M.oak, X + x, H / 2 + 2, Z + D / 2 + 0.2);
  add(g, rbox(W - 1.6, 1.2, 1.2, 0.2), M.oak, X, 8.6, Z + D / 2 + 0.2);                                                              // the transom
  for (const [x, y, w, h] of [[-8.5, 11.2, 6.4, 4.2], [8, 11.4, 6.6, 4.4], [-1, 5.6, 5.4, 3.0], [11, 5.4, 4.0, 2.6]]) add(g, rbox(w, h, 0.5, 0.1), M.screen, X + x, y, Z + D / 2 - 0.65); // screens behind the glass, glowing
  for (const [x, y, w, h] of [[-8.5, 11.2, 6.4, 4.2], [8, 11.4, 6.6, 4.4]]) { add(g, rbox(w + 0.5, 0.4, 0.5, 0.05), M.inkLine, X + x, y + h / 2 + 0.1, Z + D / 2 - 0.6); add(g, rbox(w + 0.5, 0.4, 0.5, 0.05), M.inkLine, X + x, y - h / 2 - 0.1, Z + D / 2 - 0.6); } // their dark bezels
  cloth(g, M, X, H + 1.6, Z + D / 2 + 1.0, W - 6, 5);                                                                              // the team banner across the lintel
  // the roof: flat planks with a low parapet, carrying one tilted row of solar glass at the back (two rows made the roof a dark lid)
  add(g, rbox(W + 3, 1.2, D + 3, 0.2), M.roofDark, X, H + 2.4, Z - 1); add(g, rbox(W + 3.4, 0.6, D + 3.4, 0.1), M.inkLine, X, H + 1.9, Z - 1);
  for (const sx of [-1, 1]) add(g, rbox(1.4, 2.4, D + 3, 0.2), M.oak, X + sx * (W / 2 + 0.8), H + 3.6, Z - 1); add(g, rbox(W + 3, 2.4, 1.4, 0.2), M.oak, X, H + 3.6, Z - 1 - D / 2 - 0.8);
  for (const dz of [-6]) { add(g, rbox(W - 10, 0.8, 8.5, 0.2), M.glass, X - 3, H + 5.6, Z - 1 + dz, 0.5, 0, 0); add(g, rbox(W - 9.6, 0.4, 8.9, 0.1), M.joint, X - 3, H + 5.3, Z - 1 + dz, 0.5, 0, 0); for (const x of [-W / 4, W / 4 - 6]) add(g, rbox(0.5, 0.9, 8.7, 0.1), M.steel, X - 3 + x, H + 5.7, Z - 1 + dz, 0.5, 0, 0); }
  // antennas on the roof: a dish on a short mast, two whips with LEDs, a vane
  const RY = H + 3;
  add(g, cyl(0.9, 1.1, 14, 8), M.oak, X + W / 2 - 3, RY + 6, Z - D / 2 + 2); add(g, cyl(4.6, 4.6, 0.6, 18), M.steel, X + W / 2 - 1.5, RY + 13, Z - D / 2 + 3.6, 0.9, 0, -0.4); add(g, cyl(0.35, 0.35, 3.4, 6), M.joint, X + W / 2 - 0.6, RY + 13.9, Z - D / 2 + 4.6, 0.9, 0, -0.4);
  for (const [x, h] of [[-W / 2 + 3, 20], [-W / 2 + 9, 14]]) { add(g, cyl(0.6, 0.7, h, 6), M.wire, X + x, RY + h / 2, Z - D / 2 + 2); led(g, M, 0.6, X + x, RY + h + 0.4, Z - D / 2 + 2); }
  add(g, cyl(0.5, 0.5, 6, 6), M.steel, X, RY + 3, Z - D / 2 + 2); add(g, plate([[0, -1.2], [4, 0], [0, 1.2]], 0.3, 0.05), M.paleSteel, X + 0.2, RY + 5.6, Z - D / 2 + 2, 0, 0, 0); // a vane
  solar(g, M, X - W / 2 - 8, Z + 8, 10, 12, 4); cable(g, M, [X - W / 2 - 8, 10, Z + 3], [X - W / 2 + 1, H + 2, Z - 4]);
  flag(g, M, X + W / 2 + 2, 2, Z - D / 2 - 2, 28, 18, 12);
  cloth(g, M, X + W / 2 + 0.6, H + 1.4, Z - 6, 8, 12);
  cable(g, M, [X + W / 2 - 3, RY + 12, Z - D / 2 + 2], [X + W / 2 + 4, 4, Z + 4]);
  // the work bench before the glass front: an oak bench with a glowing top (a light table), a microscope, two flasks and an
  // instrument box on it, a team cloth down its front, a stool (the PM: screens, a dish and a glowing bench, so it reads as a lab)
  const BX = X + 3, BZ = Z + D / 2 + 8;
  add(g, rbox(15, 1.0, 6, 0.2), M.oak, BX, 6.0, BZ); for (const [dx, dz] of [[-6.5, -2.2], [6.5, -2.2], [-6.5, 2.2], [6.5, 2.2]]) add(g, rbox(1.2, 4.4, 1.2, 0.2), M.oak, BX + dx, 3.6, BZ + dz);
  add(g, rbox(14, 0.5, 5.2, 0.1), M.screen, BX, 6.75, BZ); add(g, sph(7, 8, 6), M.ledHalo, BX, 7, BZ).scale.set(1.1, 0.35, 0.6);     // the glowing top and its glow
  add(g, cyl(0.6, 0.6, 3.6, 8), M.steel, BX - 4, 8.8, BZ - 0.5, 0.4, 0, 0); add(g, rbox(2.4, 0.6, 1.8, 0.2), M.joint, BX - 4, 7.3, BZ); add(g, sph(0.9, 8, 6), M.joint, BX - 4.2, 10.6, BZ - 1.2); // a microscope
  for (const dx of [1.5, 3.5]) { add(g, cyl(0.7, 1.1, 2.2, 8), M.glass, BX + dx, 8.1, BZ + 0.8); add(g, cyl(0.3, 0.3, 1.2, 6), M.glass, BX + dx, 9.6, BZ + 0.8); } // flasks
  add(g, rbox(2.6, 2.0, 2.2, 0.3), M.panelDark, BX + 5.5, 8.0, BZ - 1); add(g, rbox(1.8, 0.3, 1.4, 0.1), M.visor, BX + 5.5, 9.05, BZ - 1); // an instrument box with a small screen
  add(g, rbox(14.6, 3.6, 0.5, 0.1), M.paintCloth, BX, 4.2, BZ + 3.2); for (const y of [5.9, 2.5]) add(g, rbox(15, 0.4, 0.6, 0.05), M.inkLine, BX, y, BZ + 3.2); // the team cloth down the bench's front
  add(g, cyl(1.6, 1.4, 1.0, 10), M.oak, BX + 9.5, 4.4, BZ + 1); for (const a of [0.5, 2.6, 4.7]) add(g, cyl(0.4, 0.5, 3.4, 6), M.oak, BX + 9.5 + Math.cos(a) * 1.1, 2.9, BZ + 1 + Math.sin(a) * 1.1); // a stool
  if (M.polish) { // secondary detail: a steel ladder up the east wall to the roof, a down pipe at the south-west corner, steel bands on the dish's mast, a steel coping on the parapet's south edge
    const LX = X + W / 2 + 1.3, LZ = Z + 8;
    for (const dz of [-1.5, 1.5]) limb(g, [LX, 3.2, LZ + dz], [LX, H + 5.2, LZ + dz], 0.4, M.steel);
    for (let y = 5; y < H + 5; y += 2.6) limb(g, [LX, y, LZ - 1.5], [LX, y, LZ + 1.5], 0.35, M.steel);
    limb(g, [X - W / 2 - 1.0, H + 1.6, Z + D / 2 + 1.0], [X - W / 2 - 1.0, 3.4, Z + D / 2 + 1.0], 0.5, M.steel);
    for (const y of [RY + 2, RY + 9]) add(g, torus(1.1, 0.25, 10), M.steel, X + W / 2 - 3, y, Z - D / 2 + 2, Math.PI / 2, 0, 0);
    add(g, rbox(W + 3.4, 0.6, 1.0, 0.1), M.steel, X, H + 3.1, Z - 1 + D / 2 + 1.4);
  }
  return g;
}

/** Radio tower (defence; 2x2): a small home-built kit the Bots put up quickly near the fight (Stelian: modest and
 *  light, not a fortification, and at once "their tower" out on the map): a lattice mast of timber and wire, four oak
 *  legs leaning in, cross-braced with pale wire, guyed with ropes to stakes, on four stone pads; a platform half-way up carrying the small turret
 *  (`radioTurret`, the turning head); at the top a cluster of antennas (dipoles, a small dish) with a white LED, and a
 *  small wind rotor on a stub (its own power); a team band wrapped round the mast's waist between ink lines, a flag at
 *  the top, a cable down to a battery box with a LED at the foot. From the camera: a tall tapering dark lattice with a
 *  team band, a wider platform half-way, a thin crown of antennas; the base's longest shadow. */
export const MAST_H = 44, DECK_Y = 21;
export function radioTower(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-20, -16], [16, -21], [22, 2], [14, 22], [-18, 20], [-23, 2]]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(5, 3.0, 5, 0.4), M.stone, sx * 8.5, 2.4, sz * 8.5);
  const leg = (t) => 8.5 - 5.5 * t, legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of legs) limb(g, [sx * 8.5, 3, sz * 8.5], [sx * leg(1), MAST_H, sz * leg(1)], 1.1, M.oak);
  for (let k = 0; k < 5; k++) {                                                                                                       // rings of braces and wire crosses
    const t = k / 5, t2 = (k + 1) / 5, y = 3 + (MAST_H - 3) * t, y2 = 3 + (MAST_H - 3) * t2, r = leg(t), r2 = leg(t2);
    for (const [[ax, az], [bx, bz]] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      limb(g, [ax * r, y, az * r], [bx * r, y, bz * r], 0.55, M.oak);
      limb(g, [ax * r, y, az * r], [bx * r2, y2, bz * r2], 0.4, M.wire); limb(g, [bx * r, y, bz * r], [ax * r2, y2, az * r2], 0.4, M.wire);
    }
  }
  // the team band wrapped round the waist, the platform for the turret, the guys
  add(g, cyl(leg(0.46) + 3.2, leg(0.46) + 3.6, 3.4, 12), M.paintCloth, 0, DECK_Y - 2.4, 0); for (const y of [DECK_Y - 4.0, DECK_Y - 0.8]) add(g, cyl(leg(0.46) + 3.7, leg(0.46) + 3.7, 0.5, 12), M.inkLine, 0, y, 0); // a team skirt under the platform between ink rings
  add(g, cyl(leg(0.8) + 1.2, leg(0.66) + 1.2, 6, 12), M.paintCloth, 0, 3 + (MAST_H - 3) * 0.73, 0); for (const t of [0.655, 0.805]) add(g, cyl(leg(t) + 1.4, leg(t) + 1.4, 0.6, 12), M.inkLine, 0, 3 + (MAST_H - 3) * t, 0); // a team band wrapped round the mast above it
  add(g, rbox(2 * leg(0.46) + 6, 1.4, 2 * leg(0.46) + 6, 0.3), M.deck, 0, DECK_Y, 0); add(g, rbox(2 * leg(0.46) + 6.4, 0.5, 2 * leg(0.46) + 6.4, 0.1), M.inkLine, 0, DECK_Y - 0.9, 0);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4, r = leg(0.46) + 2.8; limb(g, [Math.cos(a) * r, DECK_Y + 0.7, Math.sin(a) * r], [Math.cos(a) * r, DECK_Y + 4.5, Math.sin(a) * r], 0.5, M.steel); }
  for (const a of [0.6, 2.2, 3.9, 5.5]) { const r = leg(0.75); limb(g, [Math.cos(a) * r * 0.9, 3 + (MAST_H - 3) * 0.75, Math.sin(a) * r * 0.9], [Math.cos(a) * 22, 1.5, Math.sin(a) * 20], 0.35, M.rope); add(g, cyl(0.6, 0.8, 3, 6), M.oak, Math.cos(a) * 22, 1.6, Math.sin(a) * 20, 0.2, 0, 0); }
  // the crown: a cap, two dipoles, a small dish, the rotor on a stub, a LED and a flag
  add(g, rbox(2 * leg(1) + 2, 1.6, 2 * leg(1) + 2, 0.3), M.joint, 0, MAST_H + 0.6, 0);
  add(g, cyl(0.7, 0.8, 14, 6), M.wire, 0, MAST_H + 7, 0); led(g, M, 0.8, 0, MAST_H + 14.4, 0);
  for (const sx of [-1, 1]) add(g, cyl(0.5, 0.5, 7, 6), M.wire, sx * 2.4, MAST_H + 6 + sx * 2, 0, 0, 0, Math.PI / 2 + sx * 0.1);                  // dipole elements
  add(g, cyl(3.4, 3.4, 0.5, 16), M.steel, 2.6, MAST_H + 3.6, 3.0, 0.9, 0, -0.5); add(g, cyl(0.3, 0.3, 2.6, 6), M.joint, 3.2, MAST_H + 4.2, 3.8, 0.9, 0, -0.5);
  { const w = grp(); w.position.set(-3.2, MAST_H + 9, -2); w.rotation.y = -0.4; g.add(w); add(w, cyl(0.6, 0.6, 3, 6), M.steel, -1, 0, 0, 0, 0, Math.PI / 2); add(w, sph(1.0, 8, 6), M.joint, 0.6, 0, 0);
    for (let k = 0; k < 3; k++) add(w, rbox(0.5, 6.2, 1.2, 0.2), M.paleSteel, 0.9, 2.6, 0, k * Math.PI * 2 / 3 + 0.3, 0, 0).position.set(0.9 + 0, Math.cos(k * Math.PI * 2 / 3 + 0.3) * 3.0, -Math.sin(k * Math.PI * 2 / 3 + 0.3) * 3.0);
    add(w, plate([[0, -1.4], [4, -0.4], [4, 0.4], [0, 1.4]], 0.3, 0.05), M.paleSteel, -1, 0, 0, Math.PI / 2, 0, 0); }                            // the wind rotor and its tail
  flag(g, M, leg(1) + 0.4, MAST_H, -leg(1), 10, 14, 10);
  cable(g, M, [leg(1), MAST_H, leg(1)], [13, 5, 12]); add(g, rbox(6, 3.6, 4.4, 0.5), M.panelDark, 13, 3.8, 12); led(g, M, 0.4, 13, 6.0, 14.2);     // the battery box
  if (M.polish) { // secondary detail: bolt plates where the braces meet the legs, turnbuckles on the guys, a steel hub ring on the rotor, a steel cap on the battery box's cable gland
    for (let k = 0; k <= 5; k++) { const t = k / 5, y = 3 + (MAST_H - 3) * t, r = leg(t); for (const [sx, sz] of legs) add(g, rbox(1.5, 1.5, 1.5, 0.3), M.joint, sx * r, y, sz * r); }
    for (const a of [0.6, 2.2, 3.9, 5.5]) { const r = leg(0.75), A = [Math.cos(a) * r * 0.9, 3 + (MAST_H - 3) * 0.75, Math.sin(a) * r * 0.9], B = [Math.cos(a) * 22, 1.5, Math.sin(a) * 20], at = (t) => A.map((v, i) => v + (B[i] - v) * t); limb(g, at(0.74), at(0.84), 0.6, M.steel); }
    add(g, torus(1.3, 0.22, 12), M.steel, -3.2 + Math.cos(-0.4) * 0.6, MAST_H + 9, -2 - Math.sin(-0.4) * 0.6, 0, -0.4 + Math.PI / 2, 0);
    add(g, cyl(0.8, 0.8, 1.0, 8), M.steel, 13, 5.9, 12);
  }
  return g;
}
/** The Radio tower's turret (the turning head, 16 facings): a small pod on a yoke on the platform: a charcoal housing
 *  with a team pad on each flank between ink lines, a short twin barrel ahead (drawn thick) and a sensor LED; no shadow
 *  of its own. */
export function radioTurret(M) {
  ebMats(M); const g = grp(), Y = DECK_Y + 0.7;
  add(g, cyl(2.0, 2.4, 2.6, 12), M.joint, 0, Y + 1.3, 0); add(g, rbox(3.6, 1.4, 5.4, 0.4), M.steel, 0, Y + 3.0, 0);
  const pod = grp(); pod.position.set(0, Y + 5.0, 0); g.add(pod);
  add(pod, rbox(7, 4, 5.6, 1.2), M.panelDark, 0, 0, 0);
  for (const sz of [-1, 1]) { add(pod, rbox(4.6, 2.2, 0.6, 0.2), M.paint, -0.4, 0, sz * 3.0); add(pod, rbox(4.9, 0.3, 0.7, 0.05), M.inkLine, -0.4, 1.3, sz * 3.0); add(pod, rbox(4.9, 0.3, 0.7, 0.05), M.inkLine, -0.4, -1.3, sz * 3.0); }
  for (const dz of [-1.3, 1.3]) add(pod, cyl(0.9, 0.9, 9, 8), M.steel, 6.5, 0.4, dz, 0, 0, Math.PI / 2);
  add(pod, rbox(2.2, 1.6, 2.2, 0.3), M.joint, 1.5, 2.6, 0); led(pod, M, 0.6, 2.7, 2.6, 0);
  if (M.polish) { // secondary detail: a bolt ring on the yoke, a cable from the pod down to the deck
    add(g, torus(2.2, 0.25, 14), M.joint, 0, Y + 2.65, 0, Math.PI / 2, 0, 0);
    limb(g, [-2.4, Y + 4.4, 1.8], [-3.6, Y + 0.4, 2.8], 0.35, M.cable);
  }
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return g;
}

/** Portal (Marine; 2x2): where the people from the future arrive. Not a ring, a gate or magic, and (round 3) not a
 *  hoist: one cue, a **lit arrival platform people step off**. A raised octagonal platform of stone and boards (r 22,
 *  5 high) with a pale steel edge, a wide pale steel ramp (18 across, 20 long, treads, rails) down to the camera with a
 *  row of white landing LEDs along each rail; two charcoal figures with no team colour at 0.8 of unit scale walking down the ramp
 *  towards the camera (part of the building, not units); the imported core standing on a stone pedestal at the platform's north edge, a squared dark
 *  cabinet in a steel frame with a glass front and white light bars (a device, not a figure); over the platform a light timber gantry (two posts and a beam, no load hanging)
 *  carrying two floodlight bars that light the pad; cables from the core to the lights and to batteries and a solar
 *  rack beside; a team banner hung from each gantry post, two flags. From the camera: a wide pale ramp with two
 *  figures on it leading up to a lit grey platform with a dark drum behind, white dots down both sides. */
export function portal(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-31, -24], [24, -31], [31, 0], [26, 30], [-20, 31], [-31, 10]], 0.75, 2);
  const PX = 0, PZ = -6, R = 22, PY = 5;
  add(g, plate(oct(R + 1, 0.35).map(([x, z]) => [x + PX, z + PZ]), PY, 0.6), M.stone, 0, 0, 0);                       // the platform: a stone octagon
  add(g, plate(oct(R, 0.35).map(([x, z]) => [x + PX, z + PZ]), 1.2, 0.3), M.deck, 0, PY, 0);                           // boarded on top
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8, r = R + 0.4; add(g, rbox(2 * r * Math.tan(Math.PI / 8) - 0.6, 1.2, 1.2, 0.2), M.ramp, PX + Math.cos(a) * r * Math.cos(Math.PI / 8), PY + 1.4, PZ + Math.sin(a) * r * Math.cos(Math.PI / 8), 0, -a - Math.PI / 2, 0); } // its pale steel edge
  for (let k = 0; k < 9; k++) add(g, rbox(0.5, 0.2, 2 * R - 3 - Math.abs(k - 4) * 5, 0.05), M.joint, PX + (k - 4) * 4.8, PY + 1.3, PZ); // the boards' seams
  // the ramp: pale steel, wide, down from the platform's south edge to the ground, treads and rails, landing LEDs along the rails
  const RW = 18, RL = 20, RZ0 = PZ + R * Math.cos(Math.PI / 8) - 1, slope = Math.atan2(PY + 1.2, RL);
  { const r = add(g, rbox(RW, 0.9, RL + 1, 0.2), M.ramp, PX, (PY + 1.2) / 2 + 0.3, RZ0 + RL / 2); r.rotation.x = -slope; }
  for (let k = 0; k < 7; k++) { const t = (k + 0.5) / 7; add(g, rbox(RW - 1, 0.3, 0.7, 0.05), M.joint, PX, (PY + 1.2) * (1 - t) + 0.9, RZ0 + RL * t, -slope, 0, 0); }
  for (const sx of [-1, 1]) {
    const x = PX + sx * (RW / 2 + 0.3);
    for (const t of [0.05, 0.5, 0.95]) add(g, cyl(0.5, 0.5, 4, 6), M.steel, x, (PY + 1.2) * (1 - t) + 2.6, RZ0 + RL * t);
    limb(g, [x, PY + 1.2 + 4.4, RZ0 + RL * 0.05], [x, 4.4, RZ0 + RL * 0.95], 0.45, M.steel);
    for (let k = 0; k < 5; k++) { const t = 0.1 + k * 0.2; led(g, M, 0.55, x, (PY + 1.2) * (1 - t) + 1.2, RZ0 + RL * t); }                                   // landing lights
  }
  // two arrivals stepping off with their cases, facing the camera: travellers (expedition.js), unarmed, in plain fatigues
  // with no team (the blind test read the armed charcoal Marines as seated gunners and the building as a defence tower)
  const N = { ...M, paint: M.uniform, paintCloth: M.uniform };                                                                                                 // the arrivals' materials: no team (round 4: team at unit scale read as real units)
  for (const [dx, t, f] of [[-4.6, 0.22, 0], [4.8, 0.7, 1]]) { const m = traveller(N, f); m.position.set(PX + dx, (PY + 1.2) * (1 - t) + 0.9, RZ0 + RL * t); m.rotation.y = -Math.PI / 2 - 0.08 * Math.sign(dx); m.scale.multiplyScalar(1.12); g.add(m); } // two figures walking down with cases (frames 0 and 1), about 0.8 of unit scale: part of the building
  // the core on its pedestal at the north edge: a dark machined cylinder with LED rings, ribs, a lit crown
  const CX = PX, CZ = PZ - R + 7, CY = PY + 1.2;
  add(g, rbox(13, 3, 10, 0.4), M.stone, CX, CY + 1.5, CZ);
  add(g, rbox(12, 12, 9, 0.6), M.core, CX, CY + 9, CZ);                                                                                      // the core: a squared cabinet in a steel frame (round 4: the drum read as a third helmeted figure)
  for (const [dx, dz] of [[-6.2, -4.7], [6.2, -4.7], [-6.2, 4.7], [6.2, 4.7]]) add(g, rbox(1.4, 13.2, 1.4, 0.2), M.steel, CX + dx, CY + 9, CZ + dz);
  for (const y of [CY + 3.0, CY + 15.2]) add(g, rbox(13.4, 1.2, 10.4, 0.2), M.steel, CX, y, CZ);
  add(g, rbox(9, 8, 0.8, 0.2), M.glass, CX, CY + 9.5, CZ + 4.8); add(g, rbox(9.6, 8.6, 0.4, 0.1), M.inkLine, CX, CY + 9.5, CZ + 4.6);          // a dark glass front
  for (const dx of [-3.6, 0, 3.6]) add(g, rbox(0.8, 7, 0.5, 0.1), M.led, CX + dx, CY + 9.5, CZ + 5.3);                                           // three white light bars on it
  add(g, sph(6.5, 10, 8), M.ledHalo, CX, CY + 9.5, CZ + 5.4);
  add(g, rbox(8, 0.6, 5, 0.2), M.screen, CX, CY + 15.9, CZ - 1); add(g, rbox(8.6, 0.4, 5.6, 0.1), M.joint, CX, CY + 15.5, CZ - 1);     // a lit panel on top (the two upright vents with lights read as gun barrels: the blind test)
  // the gantry: two oak posts west and east of the platform, a beam over it, two floodlight bars shining down, banners on the posts
  const GH = 30;
  for (const sx of [-1, 1]) { const x = PX + sx * (R + 3); add(g, cyl(1.3, 1.5, GH, 8), M.oak, x, GH / 2, PZ); limb(g, [x, 6, PZ + 8], [x, 16, PZ], 0.8, M.oak); limb(g, [x, 6, PZ - 8], [x, 16, PZ], 0.8, M.oak); add(g, rbox(2.2, 2.2, 2.2, 0.3), M.joint, x, GH + 0.8, PZ); }
  add(g, rbox(2 * (R + 3) + 2, 1.6, 1.6, 0.3), M.oak, PX, GH + 0.4, PZ);
  for (const dx of [-10, 10]) { add(g, rbox(7, 1.4, 2.4, 0.3), M.joint, PX + dx, GH - 1.2, PZ + 1.6); for (const k of [-2, 0, 2]) led(g, M, 0.6, PX + dx + k, GH - 2.1, PZ + 2.2); } // the floodlight bars
  for (const sx of [-1, 1]) cloth(g, M, PX + sx * (R + 3), GH - 3, PZ + 1.6, 10, 17);                                    // a team banner hung on each post (bigger: the figures carry no team now)
  for (const sx of [-1, 1]) flag(g, M, PX + sx * (R + 3), GH, PZ - 1, 10, 16, 11);
  // cables, batteries and a solar rack east, a bench
  cable(g, M, [CX + 5, CY + 14, CZ], [PX + R + 3, GH - 2, PZ - 1], 0.45);
  const BX = PX + R + 8, BZ = PZ + 10;
  cable(g, M, [CX + 5.4, CY + 4, CZ + 2], [BX - 2, 5, BZ - 2], 0.5);
  for (let k = 0; k < 2; k++) add(g, rbox(5, 4.4, 4, 0.5), M.panelDark, BX + k * 5.6 - 2.8, 4.2, BZ + k * 0.6); led(g, M, 0.4, BX - 2.8, 6.6, BZ + 2.2);
  solar(g, M, BX + 1, BZ + 12, 12, 9, 4); cable(g, M, [BX + 1, 7.5, BZ + 8], [BX, 6, BZ + 2]);
  add(g, rbox(8, 1.0, 2.6, 0.2), M.oak, PX - R - 6, 4.4, PZ + 14); for (const dx of [-3, 3]) add(g, rbox(1.2, 2.2, 2.2, 0.2), M.oak, PX - R - 6 + dx, 3.4, PZ + 14);
  if (M.polish) { // secondary detail: steel knobs on the ramp's rail posts (a glint each), bolts on the core's frame, a kick plate at the ramp's foot, a cable drum by the batteries
    for (const sx of [-1, 1]) for (const t of [0.05, 0.5, 0.95]) add(g, sph(0.75, 8, 6), M.steel, PX + sx * (RW / 2 + 0.3), (PY + 1.2) * (1 - t) + 4.7, RZ0 + RL * t);
    for (const dx of [-6.2, 6.2]) for (const y of [CY + 3.0, CY + 15.2]) add(g, sph(0.6, 8, 6), M.steel, CX + dx, y, CZ + 5.3);
    add(g, rbox(RW + 0.8, 1.0, 1.8, 0.2), M.ramp, PX, 1.3, RZ0 + RL + 0.6);
    add(g, cyl(2.4, 2.4, 2.0, 12), M.oakPale, BX - 7, 3.2, BZ + 5, 0, 0, Math.PI / 2); add(g, cyl(1.6, 1.6, 2.3, 10), M.cable, BX - 7, 3.2, BZ + 5, 0, 0, Math.PI / 2);
  }
  return g;
}
