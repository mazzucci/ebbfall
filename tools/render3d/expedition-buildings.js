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
import { led, marine, boardTex } from './expedition.js';
import { earth } from './kingdom-buildings.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
/** The family's few extra materials, added to an Expedition set once. */
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
  return M;
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

/** Bunkhouse (population, 2x2): a long timber bunkhouse of weathered planks in a dark oak frame on a stone footing,
 *  under a low silver plank roof, with a porch along the south side where the crew sleeps out in the warm: three cots
 *  with team blankets under the eave, a lantern (a white LED in a glass box) on the porch post, boots by the door, a
 *  small solar panel on the roof's south slope wired to the lantern, a flag at the gable. From the camera: a grey roof
 *  with a dark glass square, a row of team blankets along its foot, one small white light. */
export function bunkhouse(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-31, -24], [26, -30], [31, -2], [27, 28], [-22, 30], [-31, 6]]);
  const X = -2, Z = -8, W = 58, D = 20, H = 8;                                                                       // long and low (round 2: its own roof form)
  hut(g, M, X, Z, W, D, H, 4.5);
  add(g, rbox(14, 0.8, 9, 0.2), M.glass, X + 10, H + 2 + 2.4, Z + 5.6, 0.38, 0, 0); add(g, rbox(14.4, 0.4, 9.4, 0.1), M.joint, X + 10, H + 2 + 2.1, Z + 5.6, 0.38, 0, 0); // the solar panel on the south slope
  add(g, rbox(5, 7, 1.0, 0.3), M.oak, X - 10, 5.5, Z + D / 2 + 0.6); add(g, rbox(5.6, 7.6, 0.5, 0.1), M.inkLine, X - 10, 5.5, Z + D / 2 + 0.4); // the door
  for (const x of [-22, 2, 12, 22]) { add(g, rbox(3.6, 2.6, 0.6, 0.1), M.glass, X + x, 7.2, Z + D / 2 + 0.5); add(g, rbox(4.2, 3.2, 0.4, 0.1), M.oak, X + x, 7.2, Z + D / 2 + 0.3); } // a row of small windows
  // the porch: a plank floor on the south side under a lean-to of planks on oak posts
  const PZ = Z + D / 2 + 8, PW = W + 2;
  add(g, rbox(PW, 1.2, 15, 0.2), M.deck, X, 2.6, PZ);
  for (const x of [-PW / 2 + 1, -PW / 4, 0, PW / 4, PW / 2 - 1]) post(g, M, X + x, PZ + 1.5, H + 0.4, 1.0);
  { const r = add(g, rbox(PW + 2, 1.0, 10, 0.2), M.roofDark, X, H + 2.6, PZ - 2.5); r.rotation.x = 0.14; add(g, rbox(PW + 2.4, 0.5, 0.9, 0.1), M.inkLine, X, H + 1.9, PZ + 2.4); } // a narrow porch roof: the cots stand half out in the open (round 2: they were hidden under it)
  add(g, rbox(PW + 2, 2.4, 0.5, 0.1), M.paintCloth, X, H + 0.8, PZ + 2.6); for (const y of [H + 2.1, H - 0.5]) add(g, rbox(PW + 2.4, 0.4, 0.6, 0.05), M.inkLine, X, y, PZ + 2.6); // a team valance along the porch's eave
  cot(g, M, X - 20, PZ + 3.5, 0.1); cot(g, M, X - 6, PZ + 4, -0.08); cot(g, M, X + 8, PZ + 3.5, 0.05); cot(g, M, X + 22, PZ + 3.9, -0.05);
  add(g, rbox(2.4, 3.0, 2.4, 0.3), M.joint, X - PW / 2 + 1, H - 0.4, PZ + 1.5); add(g, rbox(1.6, 2.2, 1.6, 0.2), M.led, X - PW / 2 + 1, H - 0.4, PZ + 1.5); // the lantern on the porch post
  add(g, sph(3.2, 8, 6), M.ledHalo, X - PW / 2 + 1, H - 0.4, PZ + 1.5);
  cable(g, M, [X + 10, H + 5, Z + 9], [X - PW / 2 + 1, H + 1.4, PZ + 1.5]);
  for (const [x, z] of [[X - 14, PZ + 8.5], [X - 11.6, PZ + 8.2]]) add(g, rbox(1.6, 1.2, 3, 0.4), M.boot, x, 3.8, z);          // boots by the door
  flag(g, M, X + W / 2 + 1, H + 2, Z - 2, 18, 18, 12);
  cloth(g, M, X + W / 2 + 0.6, H + 1.0, Z + 2, 8, 9);
  cloth(g, M, X - PW / 2 + 8, H + 0.2, PZ + 1.9, 11, 8);                                                                        // a team windbreak hung between the porch's west posts                                                                         // a cloth hung on the east gable's end post
  for (const [x, z] of [[-26, 18], [-22, 23]]) { add(g, cyl(2.2, 2.4, 5, 12), M.oakPale, x, 4.5, z); for (const y of [3.2, 6]) add(g, torus(2.45, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); }
  return g;
}

/** Recruiting post (Mercenary, Veteran; 2x2): where the locals sign on. An open timber booth on oak posts under a
 *  silver plank lean-to, a counter across its front with a tablet on it, a tall notice board beside it (pale planks
 *  pinned with papers), a rack of hi-vis vests in the team colour (the Mercenary's: the colour itself), a bench, a
 *  small solar lamp on a pole (a dark glass panel over a white LED), a flag, a queue post with a rope. From the camera:
 *  a small grey roof over a pale board and a row of team vests, one light on a pole. */
export function recruitingPost(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-30, -20], [20, -30], [31, 2], [22, 28], [-24, 31], [-31, 8]]);
  const X = -6, Z = -8, W = 32, D = 18, H = 12;
  add(g, rbox(W + 2, 2.2, D + 2, 0.4), M.stone, X, 1.6, Z);
  add(g, rbox(W, 1.0, D, 0.2), M.deck, X, 2.9, Z);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) post(g, M, X + sx * (W / 2 - 1), Z + sz * (D / 2 - 1), H, 1.0);
  add(g, rbox(W, H - 3, 1.0, 0.3), M.planks, X, (H - 3) / 2 + 3.4, Z - D / 2 + 0.8);                                             // the back wall
  // the roof: a canvas tent over a ridge pole, sagging between the poles, dull local canvas (round 2: its own roof form, not a plank slab)
  add(g, cyl(0.9, 0.9, W + 8, 8), M.oak, X, H + 7, Z - 2, 0, 0, Math.PI / 2); for (const sx of [-1, 1]) post(g, M, X + sx * (W / 2 + 3), Z - 2, H + 7, 1.0);
  for (const sz of [-1, 1]) { const r = add(g, rbox(W + 8, 0.6, 13.5, 0.1), M.canvasGrey, X, H + 4.2, Z - 2 + sz * 6.2); r.rotation.x = -sz * 0.45; }
  for (const sz of [-1, 1]) for (const k of [-1, 0, 1]) { const r = add(g, rbox(2.2, 0.5, 14, 0.1), M.oak, X + k * (W + 8) / 3.2, H + 4.0, Z - 2 + sz * 6.2); r.rotation.x = -sz * 0.45; } // rafters showing through
  add(g, rbox(W + 8.4, 0.6, 0.9, 0.1), M.inkLine, X, H + 1.4, Z + 10.4); add(g, rbox(W + 8.4, 0.6, 0.9, 0.1), M.inkLine, X, H + 1.4, Z - 14.4);                            // the canvas's dark hems
  for (const sx of [-1, 1]) for (const dz of [-14, 10]) { limb(g, [X + sx * (W / 2 + 3), H + 1.6, Z + dz], [X + sx * (W / 2 + 9), 1, Z + dz + Math.sign(dz) * 4], 0.3, M.rope); } // guy ropes
  add(g, rbox(W - 4, 4, 2.4, 0.3), M.planks, X, 5, Z + D / 2 - 2); add(g, rbox(W - 3.6, 0.8, 3, 0.2), M.oak, X, 7.3, Z + D / 2 - 2);  // the counter
  add(g, rbox(W - 5, 3.4, 0.5, 0.1), M.paintCloth, X, 5.0, Z + D / 2 - 0.5); for (const y of [6.8, 3.2]) add(g, rbox(W - 4.6, 0.4, 0.6, 0.05), M.inkLine, X, y, Z + D / 2 - 0.5); // a team cloth draped down the counter's front
  add(g, rbox(W + 8, 2.0, 0.5, 0.1), M.paintCloth, X, H - 0.2, Z + 10.6); for (const y of [H + 0.9, H - 1.3]) add(g, rbox(W + 8.4, 0.4, 0.6, 0.05), M.inkLine, X, y, Z + 10.6); // a narrow team valance along the canvas's eave
  flag(g, M, X + W / 2 + 3, H + 7, Z - 2, 12, 12, 8);                                                                                                      // a second flag on the ridge pole's east post
  add(g, rbox(3.4, 0.4, 2.2, 0.1), M.glass, X + 6, 7.9, Z + D / 2 - 2, 0, 0, 0); add(g, rbox(3.0, 0.25, 1.8, 0.1), M.visor, X + 6, 8.1, Z + D / 2 - 2);        // a tablet on the counter
  for (let k = 0; k < 4; k++) {                                                                                                       // hi-vis vests hung on a rail at the back: team cloth with pale bands
    const x = X - 10 + k * 5.2; add(g, rbox(4.6, 6.4, 1.2, 0.5), M.vest, x, 10.4, Z - D / 2 + 2.4); add(g, rbox(4.8, 0.4, 1.3, 0.05), M.inkLine, x, 13.6, Z - D / 2 + 2.4); add(g, rbox(4.8, 0.4, 1.3, 0.05), M.inkLine, x, 7.2, Z - D / 2 + 2.4);
    add(g, rbox(3.7, 0.6, 1.3, 0.05), M.hivis, x, 10.2, Z - D / 2 + 2.4); add(g, cyl(0.6, 0.6, 1.2, 6), M.steel, x, 13.4, Z - D / 2 + 2.4);
  }
  add(g, cyl(0.5, 0.5, W - 6, 6), M.steel, X - 2, 13.6, Z - D / 2 + 2.4, 0, 0, Math.PI / 2);                                       // the rail
  // the notice board east of the booth: pale planks on two posts, papers pinned to it, a small roof over it
  const BX = X + W / 2 + 10, BZ = Z + 2;
  for (const dz of [-6, 6]) post(g, M, BX, BZ + dz, 16, 0.9);
  add(g, rbox(1.6, 11, 14, 0.2), M.board, BX, 9.5, BZ);
  for (const [dz, y, w, h] of [[-4, 11, 3.2, 3.6], [0.5, 12, 3.6, 2.8], [4, 10, 2.8, 3.4], [-1.5, 7, 4.2, 2.2], [3.5, 6.2, 2.4, 2.6]]) add(g, rbox(0.5, h, w, 0.05), M.paper, BX + 0.9, y, BZ + dz);
  add(g, rbox(0.4, 3.0, 12, 0.05), M.paper, BX + 0.95, 15.8, BZ); add(g, rbox(0.45, 0.3, 12.2, 0.02), M.inkLine, BX + 1.0, 17.4, BZ);                      // the board's header: a pale notice (round 3: a team header made the top half a team block) // a team header strip
  { const r = add(g, rbox(4.6, 0.8, 17, 0.2), M.roofDark, BX, 17, BZ); r.rotation.z = 0.3; }
  // the solar lamp on a pole, a bench, the queue rope, a flag
  const LX = X + 6, LZ = Z + D / 2 + 12;
  post(g, M, LX, LZ, 20, 0.8); add(g, rbox(5, 0.5, 4, 0.1), M.glass, LX, 20.8, LZ, 0.4, 0, 0); add(g, rbox(5.4, 0.3, 4.4, 0.05), M.joint, LX, 20.5, LZ, 0.4, 0, 0);
  add(g, rbox(2.2, 1.6, 2.2, 0.3), M.joint, LX, 18.2, LZ); led(g, M, 0.9, LX, 17.2, LZ);
  add(g, rbox(10, 1.0, 3, 0.2), M.oak, X - 10, 4.4, LZ); for (const dx of [-4, 4]) add(g, rbox(1.4, 2.2, 2.6, 0.2), M.oak, X - 10 + dx, 3.4, LZ);  // a bench
  for (const x of [X - 14, X - 4, X + 6]) post(g, M, x, LZ + 6, 6, 0.6);
  limb(g, [X - 14, 5.5, LZ + 6], [X - 4, 4.6, LZ + 6], 0.3, M.rope); limb(g, [X - 4, 5.5, LZ + 6], [X + 6, 4.6, LZ + 6], 0.3, M.rope);
  flag(g, M, X - W / 2 - 2, 2, Z - D / 2 + 2, 26, 18, 12);
  for (let k = 0; k < 3; k++) add(g, rbox(4.2, 3.8, 4.2, 0.4), M.oakPale, X + W / 2 + 10 + (k % 2) * 4.6, 4 + Math.floor(k / 2) * 3.8, Z + 16 + (k % 2) * 1.2);
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
  add(g, rbox(26, 0.6, 2.2, 0.1), M.paintLED, X + 2, H - 2.2, Z + D / 2 + 0.6);                                                       // a light strip inside the lintel
  for (const sx of [-1, 1]) { add(g, rbox(13, H - 3, 1.2, 0.3), M.planks, X + 2 + sx * 20.5, (H - 3) / 2 + 2, Z + D / 2 + 1.2); add(g, rbox(13.4, 0.8, 1.4, 0.1), M.oak, X + 2 + sx * 20.5, H - 0.8, Z + D / 2 + 1.2); add(g, rbox(13.4, 0.8, 1.4, 0.1), M.oak, X + 2 + sx * 20.5, 2.6, Z + D / 2 + 1.2); }
  add(g, rbox(27, 1.4, 1.6, 0.3), M.steel, X + 2, H - 0.4, Z + D / 2 + 1.8);                                                            // the door's rail
  for (const sx of [-1, 1]) { add(g, rbox(1.6, H - 3.6, 0.8, 0.1), M.paint, X + 2 + sx * 13.6, (H - 3.6) / 2 + 2, Z + D / 2 + 0.9); add(g, rbox(2.2, H - 3.2, 0.5, 0.05), M.inkLine, X + 2 + sx * 13.6, (H - 3.6) / 2 + 2, Z + D / 2 + 0.7); } // team trim on the door's jambs
  add(g, rbox(29, 1.6, 0.8, 0.1), M.paint, X + 2, H - 1.5, Z + D / 2 + 1.0); add(g, rbox(29.4, 2.2, 0.5, 0.05), M.inkLine, X + 2, H - 1.5, Z + D / 2 + 0.8);                           // and along its head
  cloth(g, M, X + 2, H + 1.6, Z + D / 2 + 2.6, 26, 7);
  { const d = grp(); d.position.set(X - 14, H + 2 + 11 - 5, Z); g.add(d); add(d, rbox(10, 6, 8, 0.4), M.planks, 0, 3, 0); add(d, rbox(11, 0.8, 9.4, 0.2), M.roofDark, 0, 6.4, 0); for (let k = 0; k < 3; k++) add(d, rbox(0.8, 0.6, 7, 0.1), M.joint, 0, 1.6 + k * 1.4, 4.2, 0.5, 0, 0); } // a louvred vent on the ridge
  // the yard: the robot arm on its plinth bent over a bare chassis on trestles
  const AX = X - 10, AZ = Z + D / 2 + 16;
  add(g, rbox(8, 3, 8, 0.4), M.stone, AX, 3.5, AZ); add(g, cyl(2.6, 3.0, 2.4, 12), M.joint, AX, 6.2, AZ);
  for (const [dx, dz] of [[-12, -4], [12, -4], [-12, 12], [12, 12]]) post(g, M, AX + dx, AZ + dz, dz < 0 ? 24 : 21, 0.9);                 // the arm's bay: a team canvas awning on four poles, open all round
  for (let k = 0; k < 7; k++) { const r = add(g, rbox(27 / 7, 0.6, 18, 0.1), k % 2 ? M.paintCloth : M.canvasLocal, AX - 13.5 + (k + 0.5) * 27 / 7, 22.6, AZ + 4); r.rotation.x = 0.16; } // the awning: striped canvas, local and team alternate (round 2: a team slab)
  for (const dz of [-8.8, 8.8]) add(g, rbox(27.4, 0.5, 0.7, 0.05), M.inkLine, AX, 22.6 - dz * 0.16, AZ + 4 + dz); for (const dx of [-13.6, 13.6]) add(g, rbox(0.6, 0.5, 18.2, 0.05), M.inkLine, AX + dx, 22.6, AZ + 4, 0.16, 0, 0);
  { const a = grp(); a.position.set(AX, 7.2, AZ); a.rotation.y = 0.5; g.add(a);
    add(a, cyl(2.2, 2.2, 3, 12), M.paleSteel, 0, 1.2, 0); limb(a, [0, 2, 0], [-3, 14, 0], 1.6, M.paleSteel); add(a, sph(2.2, 10, 8), M.joint, -3, 14, 0);
    add(a, cyl(2.4, 2.4, 2.0, 12), M.paint, -3, 14, 0, 0, 0, Math.PI / 2); add(a, torus(2.4, 0.3, 14), M.inkLine, -3, 14, -1.0); add(a, torus(2.4, 0.3, 14), M.inkLine, -3, 14, 1.0); // a team pad on the elbow between ink rings
    limb(a, [-3, 14, 0], [8, 10, 2], 1.3, M.paleSteel); add(a, sph(1.7, 10, 8), M.joint, 8, 10, 2);
    limb(a, [8, 10, 2], [11, 5, 3], 1.0, M.paleSteel); add(a, rbox(3, 2.2, 2.4, 0.4), M.joint, 11.6, 4.2, 3.2); led(a, M, 0.7, 12.4, 3.4, 4.2);
    add(a, rbox(1.2, 3.4, 3.2, 0.2), M.paint, 2.5, 12.6, 1.0, 0, 0, 0.35); add(a, rbox(1.3, 0.3, 3.4, 0.05), M.inkLine, 1.9, 14.3, 1.0, 0, 0, 0.35); add(a, rbox(1.3, 0.3, 3.4, 0.05), M.inkLine, 3.1, 11.0, 1.0, 0, 0, 0.35); } // a team band on the forearm
  { const c = grp(); c.position.set(AX + 16, 0, AZ + 4); c.rotation.y = -0.2; g.add(c);                                                 // the chassis on two trestles
    for (const dx of [-7, 7]) { for (const sx of [-1, 1]) limb(c, [dx + sx * 3, 0.5, 4], [dx, 6, 0], 0.7, M.oak); limb(c, [dx, 6, 0], [dx, 6, 0.1], 0.1, M.oak); }
    add(c, rbox(20, 1.6, 8, 0.6), M.trim, 0, 7.2, 0); for (const dz of [-2.4, 2.4]) add(c, rbox(16, 0.8, 1.0, 0.2), M.steel, 0, 8.2, dz);
    for (const [dx, dz] of [[-6, -5.4], [6, -5.4]]) { add(c, cyl(3.4, 3.4, 2.6, 16), M.tyre, dx, 7.2, dz, Math.PI / 2, 0, 0); add(c, cyl(1.7, 1.7, 2.7, 10), M.paleSteel, dx, 7.2, dz, Math.PI / 2, 0, 0); } }
  // the 3D printer under an open lean-to east of the door: a tall frame, a dark glass front, a lit bed, a spool
  const PX = X + 30, PZ = Z + D / 2 + 14;
  for (const [dx, dz] of [[-8, -6], [8, -6], [-8, 7], [8, 7]]) post(g, M, PX + dx, PZ + dz, dz < 0 ? 22 : 18, 0.9);
  { const r = add(g, rbox(20, 1.0, 17, 0.2), M.roofDark, PX, 21, PZ + 0.5); r.rotation.x = 0.22; add(g, rbox(20.4, 0.5, 0.9, 0.1), M.inkLine, PX, 19.2, PZ + 8.2); }
  add(g, rbox(10, 12, 9, 0.5), M.panelDark, PX, 9, PZ - 1); add(g, rbox(8.6, 8.4, 0.8, 0.2), M.glass, PX, 10.4, PZ + 3.6); add(g, rbox(9.4, 9.2, 0.5, 0.1), M.inkLine, PX, 10.4, PZ + 3.4);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(1.2, 12.4, 1.2, 0.2), M.steel, PX + sx * 5, 9, PZ - 1 + sz * 4.5);
  add(g, rbox(8, 0.6, 7, 0.1), M.led, PX, 4.6, PZ - 1); add(g, rbox(1.4, 1.4, 2.4, 0.2), M.joint, PX, 13.6, PZ + 2); led(g, M, 0.5, PX, 12.6, PZ + 3.2);
  add(g, cyl(2.2, 2.2, 1.6, 14), M.paint, PX + 6.6, 14.4, PZ - 3, Math.PI / 2, 0, 0); add(g, torus(2.2, 0.3, 14), M.inkLine, PX + 6.6, 14.4, PZ - 2.1); add(g, torus(2.2, 0.3, 14), M.inkLine, PX + 6.6, 14.4, PZ - 3.9); // a spool of team filament
  solar(g, M, X + W / 2 - 4, Z + D / 2 + 30, 20, 11, 4); cable(g, M, [X + W / 2 - 4, 10, Z + D / 2 + 25], [PX + 6, 15, PZ - 7]);
  flag(g, M, X - W / 2 - 1, H + 2, Z, 24, 24, 16); flag(g, M, X + W / 2 + 1, H + 2, Z - 6, 20, 18, 12);
  cloth(g, M, X + W / 2 - 14, H + 1.4, Z + D / 2 + 1.6, 9, 11); cloth(g, M, X - W / 2 + 10, H + 1.4, Z + D / 2 + 1.6, 9, 11);                 // cloths hung from the eave either side of the door
  add(g, rbox(20, 2.6, 0.5, 0.1), M.paintCloth, PX, 18.4, PZ + 8.6); for (const y of [19.6, 17.2]) add(g, rbox(20.4, 0.4, 0.6, 0.05), M.inkLine, PX, y, PZ + 8.6); // a team valance along the lean-to's eave
  for (const [x, z] of [[X - 34, Z + D / 2 + 26], [X - 29, Z + D / 2 + 30]]) { add(g, cyl(2.4, 2.6, 5, 12), M.panelDark, x, 4.5, z); add(g, torus(2.6, 0.25, 12), M.inkLine, x, 6, z, Math.PI / 2, 0, 0); }
  for (let k = 0; k < 4; k++) add(g, rbox(4.4, 4, 4.4, 0.4), M.oakPale, X + W / 2 - 8 + (k % 2) * 4.8, 4 + Math.floor(k / 2) * 4, Z - 2 + (k % 2) * 1.2 + D / 2 + 4);
  add(g, rbox(11, 0.8, 7, 0.3), M.paintCloth, X + W / 2 - 5.6, 10.3, Z + D / 2 + 2.6); add(g, rbox(11.4, 0.3, 7.4, 0.05), M.inkLine, X + W / 2 - 5.6, 9.9, Z + D / 2 + 2.6); // a team tarp over the parts crates
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
  // the glass front: panes of dark glass in an oak frame, screens glinting behind them
  add(g, rbox(W - 2, H - 2, 0.8, 0.1), M.glass, X, H / 2 + 2, Z + D / 2 - 0.2);
  for (const x of [-12, -4, 4, 12]) add(g, rbox(1.2, H - 1.6, 1.2, 0.2), M.oak, X + x, H / 2 + 2, Z + D / 2 + 0.2);
  add(g, rbox(W - 1.6, 1.2, 1.2, 0.2), M.oak, X, 8.6, Z + D / 2 + 0.2);                                                              // the transom
  for (const [x, y, w, h] of [[-8.5, 11, 5, 3.2], [8, 11.5, 5.6, 3.4], [0, 5.5, 4, 2.4]]) add(g, rbox(w, h, 0.4, 0.1), M.visor, X + x, y, Z + D / 2 - 0.7); // screens behind the glass
  cloth(g, M, X, H + 1.6, Z + D / 2 + 1.0, W - 6, 5);                                                                              // the team banner across the lintel
  // the roof: flat planks with a low parapet, carrying a solar array of dark glass in two tilted rows (round 2: its own roof form)
  add(g, rbox(W + 3, 1.2, D + 3, 0.2), M.roofDark, X, H + 2.4, Z - 1); add(g, rbox(W + 3.4, 0.6, D + 3.4, 0.1), M.inkLine, X, H + 1.9, Z - 1);
  for (const sx of [-1, 1]) add(g, rbox(1.4, 2.4, D + 3, 0.2), M.oak, X + sx * (W / 2 + 0.8), H + 3.6, Z - 1); add(g, rbox(W + 3, 2.4, 1.4, 0.2), M.oak, X, H + 3.6, Z - 1 - D / 2 - 0.8);
  for (const dz of [-6, 5]) { add(g, rbox(W - 4, 0.8, 8.5, 0.2), M.glass, X, H + 5.6, Z - 1 + dz, 0.5, 0, 0); add(g, rbox(W - 3.6, 0.4, 8.9, 0.1), M.joint, X, H + 5.3, Z - 1 + dz, 0.5, 0, 0); for (const x of [-W / 4, 0, W / 4]) add(g, rbox(0.5, 0.9, 8.7, 0.1), M.steel, X + x, H + 5.7, Z - 1 + dz, 0.5, 0, 0); }
  // antennas on the roof: a dish on a short mast, two whips with LEDs, a vane
  const RY = H + 3;
  add(g, cyl(0.9, 1.1, 14, 8), M.oak, X + W / 2 - 3, RY + 6, Z - D / 2 + 2); add(g, cyl(4.6, 4.6, 0.6, 18), M.steel, X + W / 2 - 1.5, RY + 13, Z - D / 2 + 3.6, 0.9, 0, -0.4); add(g, cyl(0.35, 0.35, 3.4, 6), M.joint, X + W / 2 - 0.6, RY + 13.9, Z - D / 2 + 4.6, 0.9, 0, -0.4);
  for (const [x, h] of [[-W / 2 + 3, 20], [-W / 2 + 9, 14]]) { add(g, cyl(0.6, 0.7, h, 6), M.wire, X + x, RY + h / 2, Z - D / 2 + 2); led(g, M, 0.6, X + x, RY + h + 0.4, Z - D / 2 + 2); }
  add(g, cyl(0.5, 0.5, 6, 6), M.steel, X, RY + 3, Z - D / 2 + 2); add(g, plate([[0, -1.2], [4, 0], [0, 1.2]], 0.3, 0.05), M.paleSteel, X + 0.2, RY + 5.6, Z - D / 2 + 2, 0, 0, 0); // a vane
  solar(g, M, X - W / 2 - 8, Z + 8, 10, 12, 4); cable(g, M, [X - W / 2 - 8, 10, Z + 3], [X - W / 2 + 1, H + 2, Z - 4]);
  flag(g, M, X + W / 2 + 2, 2, Z - D / 2 - 2, 28, 18, 12);
  cloth(g, M, X + W / 2 + 0.6, H + 1.4, Z - 6, 8, 12);
  cable(g, M, [X + W / 2 - 3, RY + 12, Z - D / 2 + 2], [X + W / 2 + 4, 4, Z + 4]);
  add(g, rbox(10, 3.6, 4, 0.3), M.oak, X + 6, 3.8, Z + D / 2 + 7); add(g, rbox(11, 0.7, 5, 0.3), M.paintCloth, X + 6, 5.9, Z + D / 2 + 7); add(g, rbox(11.4, 0.3, 5.4, 0.05), M.inkLine, X + 6, 5.5, Z + D / 2 + 7); add(g, rbox(2.4, 2.4, 2.4, 0.3), M.panelDark, X + 3, 6.8, Z + D / 2 + 7); add(g, cyl(1.2, 1.2, 2.4, 10), M.glass, X + 8, 6.8, Z + D / 2 + 7); // a bench outside with gear
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
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return g;
}

/** Portal (Marine; 2x2): where the people from the future arrive. Not a ring, a gate or magic, and (round 3) not a
 *  hoist: one cue, a **lit arrival platform people step off**. A raised octagonal platform of stone and boards (r 22,
 *  5 high) with a pale steel edge, a wide pale steel ramp (18 across, 20 long, treads, rails) down to the camera with a
 *  row of white landing LEDs along each rail; two Marines at the game's unit scale (1.4) stepping off down the ramp
 *  towards the camera; the imported core standing on a stone pedestal at the platform's north edge, a dark machined
 *  cylinder with white LED rings; over the platform a light timber gantry (two posts and a beam, no load hanging)
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
  // two Marines stepping off, at the game's unit scale, facing the camera
  for (const [dx, t, f] of [[-4.6, 0.22, 0], [4.8, 0.7, 1]]) { const m = marine(M, f); m.position.set(PX + dx, (PY + 1.2) * (1 - t) + 0.9, RZ0 + RL * t); m.rotation.y = -Math.PI / 2 - 0.08 * Math.sign(dx); m.scale.multiplyScalar(1.4); g.add(m); }
  // the core on its pedestal at the north edge: a dark machined cylinder with LED rings, ribs, a lit crown
  const CX = PX, CZ = PZ - R + 7, CY = PY + 1.2;
  add(g, rbox(13, 3, 10, 0.4), M.stone, CX, CY + 1.5, CZ);
  add(g, cyl(5.0, 5.4, 12, 16), M.core, CX, CY + 9, CZ); add(g, cyl(5.6, 5.6, 1.2, 16), M.joint, CX, CY + 3.4, CZ); add(g, cyl(5.6, 5.6, 1.2, 16), M.joint, CX, CY + 15.2, CZ);
  for (const y of [CY + 6, CY + 9.5, CY + 13]) { add(g, torus(5.3, 0.45, 32), M.led, CX, y, CZ, Math.PI / 2, 0, 0); add(g, torus(5.3, 1.1, 32), M.ledHalo, CX, y, CZ, Math.PI / 2, 0, 0); }
  for (let k = 0; k < 6; k++) add(g, rbox(1.4, 11, 1.4, 0.2), M.panelDark, CX + Math.cos(k * Math.PI / 3) * 5.4, CY + 9, CZ + Math.sin(k * Math.PI / 3) * 5.4);
  led(g, M, 1.0, CX, CY + 16.4, CZ);
  // the gantry: two oak posts west and east of the platform, a beam over it, two floodlight bars shining down, banners on the posts
  const GH = 30;
  for (const sx of [-1, 1]) { const x = PX + sx * (R + 3); add(g, cyl(1.3, 1.5, GH, 8), M.oak, x, GH / 2, PZ); limb(g, [x, 6, PZ + 8], [x, 16, PZ], 0.8, M.oak); limb(g, [x, 6, PZ - 8], [x, 16, PZ], 0.8, M.oak); add(g, rbox(2.2, 2.2, 2.2, 0.3), M.joint, x, GH + 0.8, PZ); }
  add(g, rbox(2 * (R + 3) + 2, 1.6, 1.6, 0.3), M.oak, PX, GH + 0.4, PZ);
  for (const dx of [-10, 10]) { add(g, rbox(7, 1.4, 2.4, 0.3), M.joint, PX + dx, GH - 1.2, PZ + 1.6); for (const k of [-2, 0, 2]) led(g, M, 0.6, PX + dx + k, GH - 2.1, PZ + 2.2); } // the floodlight bars
  for (const sx of [-1, 1]) cloth(g, M, PX + sx * (R + 3), GH - 3, PZ + 1.6, 7, 12);                                     // a team banner hung on each post
  for (const sx of [-1, 1]) flag(g, M, PX + sx * (R + 3), GH, PZ - 1, 9, 12, 9);
  // cables, batteries and a solar rack east, a bench
  cable(g, M, [CX + 5, CY + 14, CZ], [PX + R + 3, GH - 2, PZ - 1], 0.45);
  const BX = PX + R + 8, BZ = PZ + 10;
  cable(g, M, [CX + 5.4, CY + 4, CZ + 2], [BX - 2, 5, BZ - 2], 0.5);
  for (let k = 0; k < 2; k++) add(g, rbox(5, 4.4, 4, 0.5), M.panelDark, BX + k * 5.6 - 2.8, 4.2, BZ + k * 0.6); led(g, M, 0.4, BX - 2.8, 6.6, BZ + 2.2);
  solar(g, M, BX + 1, BZ + 12, 12, 9, 4); cable(g, M, [BX + 1, 7.5, BZ + 8], [BX, 6, BZ + 2]);
  add(g, rbox(8, 1.0, 2.6, 0.2), M.oak, PX - R - 6, 4.4, PZ + 14); for (const dx of [-3, 3]) add(g, rbox(1.2, 2.2, 2.2, 0.2), M.oak, PX - R - 6 + dx, 3.4, PZ + 14);
  return g;
}
