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
import { oct, gable, tex } from './kingdom.js';
import { led, traveller, boardTex } from './expedition.js';
import { earth, brace } from './kingdom-buildings.js';
import { polishTextures } from './polish.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
/** A rack panel's face: four slot rows per 16 game units (boxUV's repeat), each a dark slot with a lit top edge and a
 *  cyan dot at its left end; drawn bold enough that a panel 14 units tall still shows rows at 1x. */
const rackPanelTex = tex(64, (g, n) => {
  g.fillStyle = '#4e535a'; g.fillRect(0, 0, n, n);
  for (let y = 2; y < n; y += 16) { g.fillStyle = '#1a1c20'; g.fillRect(4, y, n - 8, 10); g.fillStyle = '#6a7078'; g.fillRect(4, y, n - 8, 1.5); g.fillStyle = '#2c3036'; g.fillRect(6, y + 3, n - 12, 5); g.fillStyle = '#30e4ff'; g.fillRect(7, y + 4, 4, 3); g.fillStyle = '#18a0b8'; g.fillRect(14, y + 5, 2, 2); }
});
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
  M.wool = std({ color: 0x6e6a5c, map: M.canvas.map, roughness: 0.95 });                                           // the bunks' blankets, grey-khaki wool (the two-tester check: team blankets end-on read as a queue of figures at 1x)
  M.bedroll = std({ color: 0xbcb4a2, map: M.canvas.map, roughness: 0.95 });                                        // a big pale bedroll
  M.armyCanvas = std({ color: 0x8c8870, map: M.canvas.map, roughness: 0.94 });                                     // the Tent's army canvas, a light dusty khaki (the olive read as golden spikes)
  // the Data center's (2026-11-11, Stelian's brief: a server hall with a rack-light glow, the glow cyan neon, apart from seat 0's royal blue)
  M.block = std({ color: 0x6a6e76, metalness: 0.3, roughness: 0.55 });                                              // its charcoal composite body, clean (no shell seams: the neon draws the seams; 0x3a3e44 went near-black under the finish, its faces being in the sun's shade; 0x5a5e66 until the consistency pass of 2026-11-11, a step lighter since)
  M.rackPanel = std({ color: 0x6a7078, map: rackPanelTex, metalness: 0.4, roughness: 0.5 });                        // a rack panel: slot rows with a cyan dot each
  M.neon = std({ color: 0x000000, emissive: 0x00d4ff, emissiveIntensity: 0.9 });                                    // the cyan neon: edges, seams, LED strips, the chip's die and traces (never team; the emissive alone, no red at all: lit cyan paint under the finish's rim and S-curve went to white)
  M.neonCore = std({ color: 0x000000, emissive: 0x80e8ff, emissiveIntensity: 1.3 });                                // the die's hot centre, a paler cyan
  M.neonHalo = new THREE.MeshBasicMaterial({ color: 0x18d0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }); // the glow round the neon
  M.chip = std({ color: 0x16181c, metalness: 0.4, roughness: 0.35 });                                               // the chip's package, dark epoxy
  if (M.polish) {
    const X = polishTextures(), set = (m, o) => { Object.assign(m, o); m.needsUpdate = true; };
    set(M.planks, { map: X.hiBoard, bumpMap: X.board, bumpScale: 1.4 });                                       // the boards' seams drawn for 1x (the walls keep their mid grey under the lighter shingles: the slice's split)
    set(M.board, { map: X.hiBoard, bumpMap: X.board, bumpScale: 1.0 });
    set(M.canvasGrey, { bumpMap: X.fold, bumpScale: 0.6 });
    set(M.ramp, { roughness: 0.28, envMapIntensity: 2.4, bumpMap: X.scuff, bumpScale: 0.4 });                   // one bright line along the ramp's treads under the key
    set(M.core, { roughness: 0.25, envMapIntensity: 2.4, bumpMap: X.scuff, bumpScale: 0.3 });
    set(M.wire, { roughness: 0.3, envMapIntensity: 2.4 });
    set(M.tank, { roughness: 0.25, envMapIntensity: 2.4, bumpMap: X.scuff, bumpScale: 0.4 });
    set(M.armyCanvas, { bumpMap: X.fold, bumpScale: 0.7 });
    set(M.block, { bumpMap: X.scuff, bumpScale: 0.25, envMapIntensity: 1.6 });
    set(M.chip, { roughness: 0.25, envMapIntensity: 2.0 });
  }
  return M;
}
/** A big modern tunnel tent, side-on: its length along x, so the long rounded canvas wall faces the camera. A half-buried
 *  canvas cylinder (the lower half under the earth) over dark hoops, a dark hem at the ground, a dark door in the south
 *  wall with a team band over it between ink lines, the flap swung open on a cot in the doorway, guy lines from the hoops'
 *  feet to stakes; the door's parts scale with the radius. The ground's top is 1.6. (The last check: three narrow ridge
 *  tents end-on at 40 degrees were thin triangles, "spikes like crops or drills"; this is rounded, side-on, and big.) */
function tunnelTent(g, M, x, z, L, r, doorX, hoops, flapOpen = true) {
  const t = grp(); t.position.set(x, 1.6, z); g.add(t); const k = r / 8;
  add(t, cyl(r, r, L, 32), M.armyCanvas, 0, 0.2, 0, 0, 0, Math.PI / 2).scale.set(0.9, 1, 1);                               // the canvas tunnel (local x is world y after the turn: squashed to 0.9 r tall)
  add(t, rbox(L + 0.8, 0.5, 2 * r + 0.8, 0.1), M.inkLine, 0, 0.15, 0);                                                     // the dark hem at the ground
  for (const dx of hoops) add(t, torus(r + 0.35, 0.4, Math.PI, 32), M.joint, dx, 0.2, 0, 0, Math.PI / 2, 0).scale.set(1, 0.9, 1); // the hoops, dark modern poles
  add(t, rbox(7 * k, 5.6 * k, 1.8, 0.3), M.inkLine, doorX, 2.8 * k, r - 1.6 * k);                                            // the door, a dark opening in the south wall
  add(t, rbox(5.4 * k, 0.8, 5.6 * k, 0.2), M.oak, doorX - 0.4, 0.5, r - 1.3 * k); add(t, rbox(5 * k, 2.0, 5.2 * k, 0.6), M.bedroll, doorX - 0.4, 1.9, r - 1.3 * k); add(t, rbox(3.6 * k, 1.0, 1.8 * k, 0.4), M.paper, doorX - 0.4, 2.6, r - 3.6 * k); // a cot in the doorway: frame, pale bedding, a pillow
  if (flapOpen) add(t, rbox(6.6 * k, 5.4 * k, 0.5, 0.3), M.armyCanvas, doorX + 6.0 * k, 2.9 * k, r + 0.2, 0, -0.55, 0);      // the flap swung open to the east
  add(t, rbox(8 * k, 2.2, 0.6, 0.1), M.paintCloth, doorX, 6.2 * k, r - 3.6 * k); for (const y of [7.4 * k, 5.0 * k]) add(t, rbox(8.4 * k, 0.3, 0.7, 0.05), M.inkLine, doorX, y, r - 3.6 * k); // the team band over the door, between ink lines
  for (const dx of hoops) for (const sz of [-1, 1]) { const b = [dx + 1.5 * sz, 0, sz * (r + 4.5)]; limb(t, [dx, 2.4, sz * (r - 0.3)], b, 0.25, M.rope); add(t, cyl(0.4, 0.5, 2.2, 6), M.oak, b[0], 0.7, b[2], sz * 0.35, 0, 0); } // guy lines to stakes
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

/** The Tent (population, 2x2; the code name stays bunkhouse): one big modern tunnel tent in dusty khaki canvas filling
 *  the footprint, side-on with its long rounded wall to the camera, five dark hoops and guy lines to stakes, a dark door in
 *  that wall with a team band over it and the flap swung open on a cot; a white LED lantern on a pole at the door, a small
 *  solar panel leaning on a crate with its cable to the lantern, crates and a jerrycan; the team flag on a tall pole;
 *  trodden earth under it all (`ground`). Stelian: "a single tent so it is big enough to recognize". From the camera: one
 *  long rounded khaki tent with a dark door and a team stripe, a white light, a flag. */
export function bunkhouse(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-31, -26], [26, -31], [31, -4], [28, 27], [-20, 30], [-31, 8]], 0.8, 2);
  tunnelTent(g, M, 0, -1, 52, 12, 5, [-20, -10, 0, 10, 20], true);
  add(g, cyl(0.6, 0.7, 10, 8), M.oak, 14, 6.6, 15); add(g, rbox(2.8, 2.8, 2.8, 0.3), M.joint, 14, 11.6, 15); led(g, M, 1.2, 14, 11.6, 16.5); // the lantern on a pole at the door
  add(g, rbox(4.4, 4, 4.4, 0.4), M.oakPale, 25, 3.6, 17); add(g, rbox(7, 0.6, 5, 0.2), M.glass, 25, 6.8, 15.5, 0.9, 0, 0); add(g, rbox(7.4, 0.3, 5.4, 0.1), M.joint, 25, 6.5, 15.3, 0.9, 0, 0); // a solar panel leaning on a crate
  cable(g, M, [25, 7.2, 17.5], [14, 10.6, 15], 0.4);
  for (let k = 0; k < 2; k++) add(g, rbox(4.2, 3.8, 4.2, 0.4), M.oakPale, -27 + k * 4.6, 3.5, 17 + k * 1.2);                 // crates
  add(g, rbox(2.4, 3.4, 1.6, 0.3), M.panelDark, -17, 3.3, 19); add(g, rbox(1.0, 0.6, 0.6, 0.1), M.joint, -17, 5.3, 19);     // a jerrycan
  flag(g, M, -29, 1.6, -22, 26, 28, 20);                                                                                   // the team flag on a tall pole
  if (M.polish) { // secondary detail: steel ferrules where the hoops meet the ground, a strap round the jerrycan, bolt heads on the panel's frame
    for (const dx of [-20, -10, 0, 10, 20]) for (const sz of [-1, 1]) add(g, cyl(0.6, 0.6, 1.2, 8), M.steel, dx, 2.2, -1 + sz * 12.3);
    add(g, rbox(2.6, 0.5, 1.8, 0.05), M.inkLine, -17, 3.8, 19);
    for (const dx of [-3, 3]) add(g, sph(0.45, 6, 4), M.steel, 25 + dx, 7.3, 14.8);
  }
  return g;
}

/** Recruiting post (Mercenary, Veteran; 2x2): where the locals sign on. A timber booth of the Expedition's grey boards on a
 *  stone footing: a board back wall and two long sides (a real hut's depth), oak posts carrying a high board canopy (high so the recruiter
 *  under it stays in the 40-degree camera's view), a plank counter across the open front with a tablet and a form, the
 *  recruiter seated behind it and one local seated before it (small seated props, no team, never units); up front, big,
 *  the notice board of pale planks facing the camera with papers pinned under a small hood, and the rack of five hi-vis
 *  vests in the team colour itself (the Mercenary's); two flags, a team cloth down the counter's front, crates. No canvas:
 *  the Tent is the camp now. From the camera: a small grey board booth with a counter, a pale board and a row of team
 *  vests before it, two figures at the counter, two flags. */
export function recruitingPost(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-30, -20], [20, -30], [31, 2], [22, 28], [-24, 31], [-31, 8]]);
  const X = -2, Z = -12, W = 26, D = 22, H = 12, CZ = Z + D / 2;                                                                   // the booth; CZ its open front (the depth pass, 2026-11-11: 12 deep and 10 tall it read as one wall under a canopy at its angle; 22 deep and 12 tall its east wall shows)
  add(g, rbox(W + 2.6, 2.4, D + 2.6, 0.4), M.stone, X, 1.6, Z);
  add(g, rbox(W, H, 1.2, 0.3), M.planks, X, H / 2 + 2, Z - D / 2 + 0.6);                                                             // the back wall
  for (const sx of [-1, 1]) add(g, rbox(1.2, H, D - 4, 0.3), M.planks, X + sx * (W / 2 - 0.6), H / 2 + 2, Z - 2);                     // short side walls
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(1.8, sz > 0 ? 16 : 14, 1.8, 0.3), M.oak, X + sx * (W / 2 - 0.3), (sz > 0 ? 16 : 14) / 2 + 2, Z + sz * (D / 2 - 0.3)); // posts, taller at the front
  { const r = add(g, rbox(W + 6, 1.0, D + 8, 0.2), M.roofDark, X, 17.6, Z + 0.5); r.rotation.x = 0.1; add(g, rbox(W + 6.4, 0.6, 0.9, 0.1), M.inkLine, X, 16.7, Z + D / 2 + 4.4); add(g, rbox(W + 6, 1.2, 1.4, 0.3), M.oak, X, 18.4, Z + 0.5); } // the board canopy, sloping back, with its ridge board
  add(g, rbox(W - 2, 5, 2.6, 0.3), M.planks, X, 4.5, CZ - 0.5); add(g, rbox(W - 1.4, 0.9, 3.4, 0.2), M.oak, X, 7.4, CZ - 0.5);         // the counter
  add(g, rbox(W - 3, 3.6, 0.5, 0.1), M.paintCloth, X, 4.6, CZ + 1.3); for (const y of [6.5, 2.7]) add(g, rbox(W - 2.6, 0.4, 0.6, 0.05), M.inkLine, X, y, CZ + 1.3); // a team cloth down the counter's front
  add(g, rbox(3.4, 0.4, 2.4, 0.1), M.glass, X + 4, 8.1, CZ - 0.5); add(g, rbox(3.0, 0.25, 2.0, 0.1), M.visor, X + 4, 8.3, CZ - 0.5);   // a tablet on the counter
  add(g, rbox(2.6, 0.5, 2.0, 0.1), M.paper, X - 4, 8.1, CZ - 0.8, 0, 0.3, 0);                                                        // a form
  stool(g, M, X, CZ - 5.5); seated(g, M, X, 4.9, CZ - 5.5, -Math.PI / 2, M.uniform, M.armour);                                      // the recruiter behind the counter, facing the camera
  stool(g, M, X + 1, CZ + 6); seated(g, M, X + 1, 4.9, CZ + 6, Math.PI / 2, M.canvasLocal, M.hose);                                 // a local before it
  // the notice board, big and up front at the south-west: pale planks facing the camera on two posts, papers pinned, a header, a hood
  const BX = X - 17, BZ = CZ + 13;                                                                                                   // (the last check: the board and rack about twice the size, so they and the vests are the whole front and no hut shows)
  for (const dx of [-13, 13]) post(g, M, BX + dx, BZ, 27, 1.1);
  add(g, rbox(27, 21, 1.4, 0.2), M.board, BX, 13.5, BZ);
  for (const [dx, y, w, h] of [[-9, 19.5, 5.6, 5.2], [-2.5, 20.2, 5.4, 4.2], [4, 19, 5.8, 5.4], [10, 20, 3.8, 3.6], [-9.5, 12.6, 5.2, 4.2], [-3, 12, 6.2, 4.6], [4, 12.8, 4.6, 3.8], [9.5, 12.2, 4.2, 4.4], [-7, 6.4, 6.0, 3.0], [2, 6.0, 5.0, 3.2], [8.5, 6.6, 3.4, 2.6]]) add(g, rbox(w, h, 0.5, 0.05), M.paper, BX + dx, y, BZ + 0.9);
  add(g, rbox(25, 3.2, 0.4, 0.05), M.paper, BX, 25.0, BZ + 0.95); add(g, rbox(25.2, 0.3, 0.45, 0.02), M.inkLine, BX, 26.7, BZ + 1.0);
  { const r = add(g, rbox(29, 0.8, 6, 0.2), M.roofDark, BX, 27.4, BZ - 1.4); r.rotation.x = 0.3; }
  // the vest rack, big and up front at the south-east: a steel rail on two posts, five hi-vis vests in the team colour facing the camera
  const VX = X + 18, VZ = CZ + 13;
  for (const dx of [-14, 14]) post(g, M, VX + dx, VZ, 23, 1.1); add(g, cyl(0.55, 0.55, 30, 6), M.steel, VX, 22.6, VZ, 0, 0, Math.PI / 2);
  for (let k = 0; k < 6; k++) { const x = VX - 11.5 + k * 4.6; add(g, rbox(4.2, 11.6, 1.2, 0.5), M.vest, x, 16.2, VZ); for (const y of [22.0, 10.4]) add(g, rbox(4.4, 0.4, 1.3, 0.05), M.inkLine, x, y, VZ); for (const y of [13.4, 17.4]) add(g, rbox(3.6, 0.9, 1.3, 0.05), M.hivis, x, y, VZ); add(g, cyl(0.5, 0.5, 1.2, 6), M.steel, x, 22.3, VZ); }
  flag(g, M, X - W / 2 - 2, 1.6, Z - D / 2 - 2, 28, 18, 12); flag(g, M, X + W / 2 + 2, 1.6, Z - D / 2 - 2, 22, 14, 10);                 // flags at the booth's back corners
  for (let k = 0; k < 3; k++) add(g, rbox(4.2, 3.8, 4.2, 0.4), M.oakPale, X + W / 2 + 4 + (k % 2) * 4.6, 3.6 + Math.floor(k / 2) * 3.8, Z + (k % 2) * 1.2); // crates
  if (M.polish) { // secondary detail: knee braces from the front posts to the canopy, brackets on the vest rail, iron bands on the board's posts, a clipboard on the counter
    for (const sx of [-1, 1]) brace(g, M, X + sx * (W / 2 - 0.3), 14.2, Z + D / 2 - 0.3, -sx * 4, 2.8);
    for (const sx of [-1, 1]) add(g, rbox(0.9, 1.8, 1.2, 0.1), M.joint, VX + sx * 14, 22.2, VZ);
    for (const dx of [-13, 13]) for (const y of [5, 23]) add(g, torus(1.2, 0.2, 10), M.joint, BX + dx, y, BZ, Math.PI / 2, 0, 0);
    add(g, rbox(2.4, 0.35, 1.8, 0.05), M.paper, X + 0.5, 8.1, CZ - 2.0, 0, -0.2, 0);
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

// ---- the Data center (the Expedition's main building, 4x4; the code names stay hall / conflux), 2026-11-11 ----
// Stelian's brief: a server hall with a rack-light glow, the glow cyan neon (bright, saturated, apart from the kingdom's
// royal blue), LED strips and rack panels; a big microchip motif on the roof, readable at 1x; team on flags and trim only;
// nothing in front (no crates, no props); and, as an option, a clean dark block with the neon on its edges and seams,
// rack-panel faces and the chip glowing on top, about Castle height. Both were drawn and rendered small; the pick is the
// one retheme.js RT_BUILDINGS.ex.hall names (the other stays for the record, in tools/art/retheme-datacenter.mjs's picture).
/** A face of rack panels on a wall `L` long and `H` tall (local x along the face, +z out of it; `ry` turns the group so
 *  +z is the face's normal): a dark skirting band, rows of rack panels between dark mullions, a cyan LED strip over
 *  each row with a soft halo. `rows` are [y0, h] pairs; `cols` the bay count. */
function rackFace(g, M, x, y0, z, ry, L, rows, cols, skirt = 9) {
  const f = grp(); f.position.set(x, y0, z); f.rotation.y = ry; g.add(f);
  add(f, rbox(L - 1, skirt, 1.0, 0.2), M.trim, 0, skirt / 2, 0.4);                                                   // the skirting band
  const m = 5, bw = (L - 2 * m) / cols;
  for (const [ry0, rh] of rows) {
    for (let k = 0; k < cols; k++) add(f, rbox(bw - 2.6, rh, 1.0, 0.25), M.rackPanel, -L / 2 + m + bw * (k + 0.5), ry0 + rh / 2, 0.5);
    for (let k = 0; k <= cols; k++) add(f, rbox(1.4, rh + 1.2, 1.3, 0.2), M.trim, -L / 2 + m + bw * k, ry0 + rh / 2, 0.55);        // the mullions
    add(f, rbox(L - 2 * m + 1.2, 0.8, 1.0, 0.2), M.neon, 0, ry0 + rh + 1.0, 0.6); add(f, rbox(L - 2 * m + 2.4, 2.8, 1.4, 0.4), M.neonHalo, 0, ry0 + rh + 1.0, 0.7); // the LED strip over the row, and its glow
  }
  return f;
}
/** The microchip motif, lying flat with its centre at (x, y, z): a dark square package with rows of pale steel pins out
 *  of all four sides, a glowing cyan die in the middle with a hot centre, cyan traces from the die to each side's pins,
 *  a soft halo over it all. `s` is the package's side. From the camera: a dark square fringed with pale teeth and a
 *  cyan square glowing in its middle, lines running out of it. */
function microchip(g, M, x, y, z, s) {
  const c = grp(); c.position.set(x, y, z); g.add(c);
  add(c, rbox(s, 2.6, s, 0.4), M.chip, 0, 1.3, 0);
  const n = 9, step = (s - 8) / (n - 1), pin = 6.0;
  for (let k = 0; k < n; k++) { const u = -(s - 8) / 2 + k * step; for (const sg of [-1, 1]) { add(c, rbox(2.2, 1.0, pin, 0.2), M.paleSteel, u, 0.9, sg * (s / 2 + pin / 2 - 1)); add(c, rbox(pin, 1.0, 2.2, 0.2), M.paleSteel, sg * (s / 2 + pin / 2 - 1), 0.9, u); } } // the pins, all four sides
  const d = s * 0.42, t = (s / 2 - d / 2) - 1.0;                                                                     // the die's side; a trace's length from its edge to the package's
  add(c, rbox(d, 1.6, d, 0.3), M.neon, 0, 3.3, 0); add(c, rbox(d * 0.4, 0.6, d * 0.4, 0.2), M.neonCore, 0, 4.3, 0);
  for (const u of [-0.32, -0.16, 0, 0.16, 0.32].map(v => v * d)) for (const sg of [-1, 1]) { add(c, rbox(t, 0.5, 1.0, 0.1), M.neon, sg * (d / 2 + t / 2), 2.9, u); add(c, rbox(1.0, 0.5, t, 0.1), M.neon, u, 2.9, sg * (d / 2 + t / 2)); } // the traces
  add(c, sph(d * 0.8, 10, 8), M.neonHalo, 0, 3.4, 0).scale.set(1.3, 0.3, 1.3);
  return c;
}
/** A neon rail (an edge or a seam): a thin bright bar from a to b with its halo. */
function neonRail(g, M, a, b, r = 0.55) { limb(g, a, b, r, M.neon); limb(g, a, b, r * 2.4, M.neonHalo); }

/** Data center, option A, the block (`dataBlock`): a clean charcoal block 100 x 94 and 64 tall on a dark stone course,
 *  cyan neon along its vertical edges and the roof's edges, rack panels in three rows of five bays on the south and
 *  east faces (the camera's) with a cyan LED strip over each row, a dark door with a lit lintel in the south face, a
 *  team trim band round the top between ink lines, and the microchip lying flat over most of the roof, its die glowing;
 *  two team flags on masts at the south corners hanging over the face. No yard, nothing in front. From the camera: a
 *  dark block edged in cyan with glowing lines across it, a chip glowing on its lid, two flags. */
export function dataBlock(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-56, -50], [50, -56], [58, -8], [54, 50], [6, 58], [-50, 54], [-59, 4]], 1, 2);
  const W = 100, D = 94, H = 64, Y0 = 3, TOP = Y0 + H;
  add(g, rbox(W + 6, Y0, D + 6, 0.5), M.stone, 0, Y0 / 2, 0);
  add(g, rbox(W, H, D, 1.0), M.block, 0, Y0 + H / 2, 0);
  const ROWS = [[10.5, 13.5], [25.5, 13.5], [40.5, 11.5]];
  rackFace(g, M, 0, Y0, D / 2, 0, W, ROWS, 5); rackFace(g, M, W / 2, Y0, 0, Math.PI / 2, D, ROWS, 5);
  add(g, rbox(8, 9, 1.6, 0.3), M.inkLine, 0, Y0 + 4.5, D / 2 + 0.6); add(g, rbox(9, 0.7, 1.2, 0.2), M.neon, 0, Y0 + 9.4, D / 2 + 0.9); // the door, a lit lintel
  add(g, rbox(W + 1.0, 2.6, D + 1.0, 0.1), M.paint, 0, Y0 + 55.4, 0); for (const y of [Y0 + 53.9, Y0 + 56.9]) add(g, rbox(W + 1.2, 0.5, D + 1.2, 0.05), M.inkLine, 0, y, 0); // the team trim band, between ink lines
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) neonRail(g, M, [sx * W / 2, Y0 + 0.5, sz * D / 2], [sx * W / 2, TOP + 0.3, sz * D / 2]); // the vertical edges
  for (const sz of [-1, 1]) neonRail(g, M, [-W / 2, TOP + 0.3, sz * D / 2], [W / 2, TOP + 0.3, sz * D / 2]); for (const sx of [-1, 1]) neonRail(g, M, [sx * W / 2, TOP + 0.3, -D / 2], [sx * W / 2, TOP + 0.3, D / 2]); // the roof's edges
  microchip(g, M, 0, TOP, 0, 56);
  flag(g, M, -W / 2 - 2.6, Y0, D / 2 + 2.6, 78, 28, 18); flag(g, M, W / 2 + 2.6, Y0, D / 2 + 2.6, 70, 24, 16);
  return g;
}

/** Data center, option B, the server hall (`serverHall`): a long low charcoal hall 108 x 62 and 30 tall under a flat
 *  roof, its south face open across the middle (a bay 60 wide, 20 tall) on a row of six racks inside, each lit by two
 *  cyan strips, the bay's ceiling glowing; rack panels either side of the bay, cyan LED strips along the lintel and the
 *  eave, a team trim band on the parapet between ink lines; the microchip lying flat on the roof, its die glowing; two
 *  team flags on masts at the north corners, above the roof. Nothing in front. From the camera: a long dark box with a
 *  glowing opening full of racks, a chip on its roof, two flags. */
export function serverHall(M) {
  ebMats(M); const g = grp();
  earth(g, M, [[-62, -42], [56, -50], [64, -4], [60, 44], [4, 52], [-54, 48], [-65, 6]], 1, 2);
  const W = 108, D = 62, H = 30, Y0 = 3, TOP = Y0 + H, BW = 60, BH = 20, BD = 12;
  add(g, rbox(W + 6, Y0, D + 6, 0.5), M.stone, 0, Y0 / 2, 0);
  add(g, rbox(W, H, D - BD, 1.0), M.block, 0, Y0 + H / 2, -BD / 2);                                                  // the hall behind the bay's depth
  for (const sx of [-1, 1]) add(g, rbox((W - BW) / 2, H, BD + 0.2, 0.6), M.block, sx * (W + BW) / 4, Y0 + H / 2, D / 2 - BD / 2); // the walls either side of the bay
  add(g, rbox(BW + 2, H - BH, BD + 0.2, 0.4), M.block, 0, Y0 + BH + (H - BH) / 2, D / 2 - BD / 2);                      // over the bay
  add(g, rbox(BW, 0.8, BD, 0.2), M.deck, 0, Y0 + 0.4, D / 2 - BD / 2);                                                // the bay's floor
  add(g, rbox(BW - 2, 1.0, BD - 2, 0.3), M.neonHalo, 0, Y0 + BH - 0.8, D / 2 - BD / 2);                                // the bay's ceiling glow
  add(g, rbox(BW, 0.8, 1.0, 0.2), M.neon, 0, Y0 + BH - 0.6, D / 2 - BD + 0.6);                                        // a strip along the back of the ceiling
  for (let k = 0; k < 6; k++) { // the racks inside: charcoal cabinets, slotted fronts, two cyan strips and a LED each
    const x = -25 + k * 10, z = D / 2 - BD + 4.5;
    add(g, rbox(7.4, 17, 7, 0.4), M.rackSide, x, Y0 + 8.5, z); add(g, rbox(6.4, 15.6, 0.8, 0.2), M.rackPanel, x, Y0 + 8.6, z + 3.6);
    for (const dx of [-2.4, 2.4]) add(g, rbox(0.7, 15, 0.6, 0.1), M.neon, x + dx, Y0 + 8.6, z + 3.9);
    add(g, rbox(6.8, 16, 1.2, 0.3), M.neonHalo, x, Y0 + 8.6, z + 4.2);
    led(g, M, 0.35, x, Y0 + 16.4, z + 3.9);
  }
  for (const sx of [-1, 1]) rackFace(g, M, sx * (W + BW) / 4, Y0, D / 2, 0, (W - BW) / 2, [[6, 10], [18, 8]], 1, 5);     // panels either side of the bay
  add(g, rbox(BW + 4, 0.9, 1.2, 0.2), M.neon, 0, Y0 + BH + 0.8, D / 2 + 0.7); add(g, rbox(BW + 6, 3, 1.4, 0.4), M.neonHalo, 0, Y0 + BH + 0.8, D / 2 + 0.8); // the lintel strip
  for (const sx of [-1, 1]) add(g, rbox(1.6, BH + 1, 1.6, 0.3), M.trim, sx * (BW / 2 + 0.8), Y0 + BH / 2, D / 2 + 0.4); // the bay's jambs
  neonRail(g, M, [-W / 2, TOP + 0.3, D / 2], [W / 2, TOP + 0.3, D / 2]); for (const sx of [-1, 1]) neonRail(g, M, [sx * W / 2, TOP + 0.3, -D / 2], [sx * W / 2, TOP + 0.3, D / 2]); // the eave's edges
  for (const sx of [-1, 1]) neonRail(g, M, [sx * W / 2, Y0 + 0.5, D / 2], [sx * W / 2, TOP + 0.3, D / 2]);              // the front corners
  add(g, rbox(W + 1.0, 2.4, D + 1.0, 0.1), M.paint, 0, TOP + 1.6, 0); for (const y of [TOP + 0.3, TOP + 2.9]) add(g, rbox(W + 1.2, 0.5, D + 1.2, 0.05), M.inkLine, 0, y, 0); // the parapet, the team trim band
  microchip(g, M, 0, TOP + 3.0, -3, 44);
  flag(g, M, -W / 2 - 2.6, Y0, -D / 2 - 2.6, 56, 28, 18); flag(g, M, W / 2 + 2.6, Y0, -D / 2 - 2.6, 50, 24, 16);
  return g;
}

// ---- A1 (2026-11-11): the Wind turbine (the Power source, 2x2, replacing the Cabin) and the Uplink (3x3, unarmed) ----
// The Expedition's recipe, as the Data center's: paler materials, dark glass, small cyan lights (never orange), team in
// flags and trim only, a fixed angle (retheme.js BLDG_YAW) inside the footprint's spill rule. The turbines' rotors are
// a separate part, as the Radio tower's turret (harbour.js `torus` is (r, t, seg, arc), unlike vael.js's) (`radioTurret`, RT_HEADS): `turbineRotor` / `windFarmRotor` build the
// blades alone at a phase, so the client can spin them later; the masts (`windTurbine`, `windFarm`) carry no blades.
/** A small cyan light with its halo (the Data center's neon). */
function cyanLed(g, M, r, x, y, z) { add(g, sph(r, 8, 6), M.neon, x, y, z); add(g, sph(r * 2.4, 8, 6), M.neonHalo, x, y, z); }
/** The turbines' own materials, once per set: a matte pale composite for the blades and the dish (M.white is the
 *  fans'; pale steel went grey under the finish on a thin pole). */
function turbineMats(M) {
  if (M.blade) return M;
  M.blade = std({ color: 0xa4a8a6, metalness: 0.1, roughness: 0.75 });                                              // the blades and the dish's face: pale composite, matte (0xd4d6d2 blew out to flat white under the finish)
  M.pole = std({ color: 0xb4b8ba, metalness: 0.5, roughness: 0.4 });                                                // the pole: pale steel, a shade darker than the blades
  M.dishBack = std({ color: 0x6a6e70, metalness: 0.4, roughness: 0.6 });                                            // the dish's back and ribs
  if (M.polish) { Object.assign(M.pole, { envMapIntensity: 2.0 }); M.pole.needsUpdate = true; }
  return M;
}
/** A turbine's mast at (x, z): a tapered pale pole `H` tall (radius `r` at the foot) going straight into the ground
 *  on a flared foot, one smooth tone (round 4, Stelian: no rings, bolts, bands or pattern on it), the nacelle at the
 *  top yawed `yaw` (its rotor faces local +z, the camera's side), a cyan light on its tail. The hub (the rotor's seat)
 *  is at (x, 3 + H, z) plus the nacelle's nose. Returns the hub's world position. */
function turbineMast(g, M, x, z, H, r, yaw, polish) {
  const TOP = 3 + H, k = r / 2.2;
  add(g, cyl(r + 0.6, r + 1.2, 3.2, 12), M.pole, x, 1.6, z);                                                             // the flared foot
  add(g, cyl(r * 0.55, r, H, 12), M.pole, x, 3 + H / 2, z);
  const n = grp(); n.position.set(x, TOP, z); n.rotation.y = yaw; g.add(n);
  add(n, rbox(4.6 * k, 4.2 * k, 9.5 * k, 1.0 * k), M.panelDark, 0, 1.0 * k, -1.2 * k);                                           // the nacelle, its nose to local +z
  add(n, rbox(4.0 * k, 1.0 * k, 7.5 * k, 0.3 * k), M.paleSteel, 0, 3.4 * k, -1.2 * k);                                           // a pale lid
  add(n, cyl(1.5 * k, 1.5 * k, 2.4 * k, 12), M.steel, 0, 1.0 * k, 4.2 * k, Math.PI / 2, 0, 0);                                     // the shaft's collar
  cyanLed(n, M, 0.55 * k, 0, 1.4 * k, -6.2 * k);                                                                                  // the tail light
  return [x + Math.sin(yaw) * 5.4 * k, TOP + 1.0 * k, z + Math.cos(yaw) * 5.4 * k];
}
/** A rotor at `hub`, its axis yawed `yaw` (facing local +z), turned `phase` about the axis: a nose cone and three
 *  tapered pale blades `L` long (the whole rotor turns together, so one `phase` spins all of it). No shadow. */
function rotor(g, M, hub, L, yaw, phase) {
  const w = L / 17, r = grp(); r.position.set(...hub); r.rotation.y = yaw; g.add(r);
  add(r, cyl(1.7 * w, 1.9 * w, 2.0 * w, 12), M.joint, 0, 0, 0.6 * w, Math.PI / 2, 0, 0);
  add(r, cone(1.5 * w, 3.2 * w, 12), M.paleSteel, 0, 0, 3.0 * w, Math.PI / 2, 0, 0);
  const s = grp(); s.position.set(0, 0, 1.4 * w); s.rotation.z = phase; r.add(s);
  const blade = plate([[0, -1.2 * w], [L * 0.22, -2.1 * w], [L, -0.7 * w], [L, 0.6 * w], [L * 0.22, 2.1 * w], [0, 1.2 * w]], 0.8 * w, 0.15 * w); // (wide: at 1x a thin blade is a thread, the first check)
  for (let k = 0; k < 3; k++) { const b = grp(); b.rotation.z = k * Math.PI * 2 / 3 + Math.PI / 2; s.add(b); add(b, blade, M.blade, 0, 0, 0, Math.PI / 2, 0, 0); }
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return r;
}
const TURBINE_H = 56, TURBINE_R = 2.6, TURBINE_YAW = -0.5, TURBINE_L = 20;
/** The Wind turbine (the Power source; 2x2, replacing the Cabin: the sim key `spire`): one tall turbine. A pale
 *  tapered pole 56 tall in one smooth tone going straight into the grass (rounds 2 to 4, Stelian: no footing, earth
 *  plate, guy ropes, battery box, cable, rings, rungs or band; a detail too small to understand reads as clutter); the
 *  nacelle at the top turned a little west of the camera so the rotor disc shows, a cyan tail light; the team flag on
 *  a short mast (the only team). The rotor is `turbineRotor` (the turning head). From the camera: a tall thin pale
 *  pole with a three-blade star on top and a flag. */
export function windTurbine(M) {
  ebMats(M); turbineMats(M); const g = grp();
  turbineMast(g, M, 0, 0, TURBINE_H, TURBINE_R, TURBINE_YAW, M.polish);
  flag(g, M, -13, 0, -11, 24, 16, 11);
  return g;
}
/** The Wind turbine's rotor at `phase` (0 to 2 pi / 3: three blades repeat every third of a turn), the turning head
 *  over `windTurbine`: no shadow of its own. */
export function turbineRotor(M, phase = 0) {
  ebMats(M); turbineMats(M); const g = grp();
  const k = TURBINE_R / 2.2;
  rotor(g, M, [Math.sin(TURBINE_YAW) * 5.4 * k, 3 + TURBINE_H + 1.0 * k, Math.cos(TURBINE_YAW) * 5.4 * k], TURBINE_L, TURBINE_YAW, phase);
  return g;
}
/** The wind farm (the other option for the Power source; 2x2): three small turbines on one pad, each pole 26 tall with
 *  blades 8 long, their nacelles turned a little differently, on a shared earth plate with the battery box, cables to
 *  it, a flag. The rotors are `windFarmRotor`. */
const FARM = [[-11, -9, -0.5, 0], [12, -5, -0.3, 0.8], [-2, 11, -0.65, 1.5]], FARM_H = 26, FARM_R = 1.6, FARM_L = 10;
export function windFarm(M) {
  ebMats(M); turbineMats(M); const g = grp();
  earth(g, M, [[-22, -16], [16, -22], [23, 0], [16, 22], [-16, 23], [-23, 2]], 0.8, 2);
  for (const [x, z, yaw] of FARM) turbineMast(g, M, x, z, FARM_H, FARM_R, yaw, M.polish);
  flag(g, M, -15, 1.6, 4, 20, 14, 10);
  return g;
}
export function windFarmRotor(M, phase = 0) {
  ebMats(M); turbineMats(M); const g = grp();
  const k = FARM_R / 2.2;
  for (const [x, z, yaw, dp] of FARM) rotor(g, M, [x + Math.sin(yaw) * 5.4 * k, 3 + FARM_H + 1.0 * k, z + Math.cos(yaw) * 5.4 * k], FARM_L, yaw, phase + dp);
  return g;
}

/** A dish: a paraboloid shell of radius `R`, `d` deep, `t` thick, its vertex at the origin opening up (+y). */
function dishGeo(R, d, t, seg = 64) {
  const pts = [], n = 20; // (fine: at 28 segments the finish inked the facets as radial lines across the bowl)
  for (let i = 0; i <= n; i++) { const r = R * i / n; pts.push(new THREE.Vector2(r, d * (r / R) ** 2)); }
  pts.push(new THREE.Vector2(R + t * 0.6, d + t * 0.4));
  for (let i = n; i >= 0; i--) { const r = R * i / n; pts.push(new THREE.Vector2(r + (i ? t * 0.6 : 0), d * (r / R) ** 2 - t)); }
  return new THREE.LatheGeometry(pts.reverse(), seg); // (reversed: the lathe's normals follow the profile's direction, and the bowl's face must light from inside)
}
const DISH_R = 36, DISH_D = 10.5, DISH_TILT = 0.82, DISH_TURN = -0.35, DISH_ELBOW = 27;
/** The Uplink (3x3, unarmed; the sim key `uplink`: "Talks to the satellite we brought along."): a satellite dish on
 *  its stand, nothing else (Stelian's corrections: the face-on dish showed a grey blob in the middle; the hut, struts
 *  and props were clutter; round 3: bigger, filling the 3x3, and the dish a separate part). The base (`uplink`): a
 *  round steel base plate, a column up the footprint's centre, the elbow at its top, a small cyan light, one standing
 *  team flag (the team colour, nowhere else). The dish (`uplinkDish`, the turning head, RT_HEADS `uplinkhead`, with
 *  its shadow): the yoke on the elbow, the back boss, the bowl (r 36, as wide as the footprint and a bit more, in the
 *  air) seen near profile, three-quarter, aimed up and to the right at the sky (its axis 47 degrees from vertical
 *  towards +x, turned 20 degrees towards the camera at frame 0), so the silhouette is the bowl's curve, the rim's
 *  thickness and the feed arm with its horn sticking out of the bowl, as the dish emoji: one pale tone shaded by its
 *  curve alone (no ribs, nothing casting on it), a dark rim, a bent feed arm from the lower rim to the focus with a
 *  small horn and a cyan light looking into the bowl. The head's 16 frames pan the dish about the column, so the
 *  client can give it a slow pan. From the camera: a big pale bowl on a post tipped up to the right with an arm out of
 *  it, a flag. */
export function uplink(M) {
  ebMats(M); turbineMats(M); const g = grp();
  add(g, cyl(10, 11, 2.6, 24), M.steel, 0, 1.3, 0); add(g, cyl(10.4, 10.4, 0.5, 24), M.inkLine, 0, 0.3, 0);               // the base plate
  add(g, cyl(3.4, 4.2, DISH_ELBOW - 2 - 2.6, 14), M.steel, 0, 2.6 + (DISH_ELBOW - 2 - 2.6) / 2, 0);                        // the column
  add(g, sph(4.6, 14, 10), M.joint, 0, DISH_ELBOW, 0);                                                                   // the elbow
  cyanLed(g, M, 0.7, 6.5, 2.2, 8.4);                                                                                     // a small light on the base plate's rim
  flag(g, M, 26, 0, 34, 28, 18, 12);                                                                                       // the one team flag, front-right, its cloth inside the footprint
  if (M.polish) add(g, torus(4.4, 0.35, 14), M.paleSteel, 0, 3.6, 0, Math.PI / 2, 0, 0);                      // a collar on the column
  return g;
}
/** The Uplink's dish, the turning head: built at its frame-0 turn (DISH_TURN); retheme.js turns it about the vertical
 *  for the other frames (a pan about the column). With its shadow (RT_HEADS `shadow`): a bowl this big without one
 *  would float. */
export function uplinkDish(M) {
  ebMats(M); turbineMats(M); const g = grp();
  const o = grp(); o.rotation.y = DISH_TURN; g.add(o);
  for (const sz of [-1, 1]) add(o, rbox(3.8, 7, 1.6, 0.3), M.paleSteel, 0, DISH_ELBOW + 1.5, sz * 4.2);                    // the yoke's cheeks on the elbow
  const d = grp(); d.position.set(Math.sin(DISH_TILT) * 5, DISH_ELBOW + Math.cos(DISH_TILT) * 5, 0); d.rotation.z = -DISH_TILT; o.add(d); // the dish, its vertex 5 up the axis from the elbow, tilted up to the right
  add(d, cyl(2.8, 3.6, 5.5, 12), M.joint, 0, -2.6, 0);                                                                  // the back boss, down to the elbow
  add(d, dishGeo(DISH_R, DISH_D, 1.2), M.blade, 0, 0, 0).userData.noReceive = true;                                   // (the bowl receives no cast shadow: at its grazing angles the shadow map striped it with radial lines)
  add(d, torus(DISH_R + 0.5, 1.4, 64), M.dishBack, 0, DISH_D + 0.1, 0, Math.PI / 2, 0, 0);                  // the rim, thick
  const F = DISH_R * DISH_R / (4 * DISH_D), q = grp(); d.add(q);                                                         // the feed arm and horn (no shadow on the bowl)
  limb(q, [DISH_R * 0.9, DISH_D * 0.82, 0], [DISH_R * 0.62, F * 0.55, 0], 0.9, M.steel); limb(q, [DISH_R * 0.62, F * 0.55, 0], [2.0, F - 2, 0], 0.9, M.steel); // the bent arm from the lower rim (+x side) to the focus
  add(q, rbox(4.2, 5.0, 4.2, 0.6), M.panelDark, 0, F + 0.6, 0); add(q, torus(2.0, 0.5, 20), M.neon, 0, F - 2.2, 0, Math.PI / 2, 0, 0); cyanLed(q, M, 1.2, 0, F - 2.8, 0); // the horn, its cyan ring and light looking into the bowl
  q.traverse(m => { if (m.isMesh) m.userData.noShadow = true; });
  return g;
}

// ---- the Sentry gun (defence, 2x2; the sim key `ward`, today's Radio tower's slot and its turning head `ward_head`;
// Stelian, 2026-11-11: a small, low, armored gun turret on a short base, the barrel the turning part, pale metal with
// orange-and-white accents, team on a small flag only, low and squat against the tall turbines and the Kingdom's stone
// Watchtower; round 3: bigger, much lighter, the band and the barrel clear at 1x, no small details). `radioTower` /
// `radioTurret` above stay for the record; retheme.js draws these under `radio`.
/** The pale armor and the hazard colours: aviation orange, yellower than seat 7's red-orange (0xe5553a) and apart from
 *  seat 1 (0xe0386e); the Lab's dome glass and the Portal's gate light (below). */
function sentryMats(M) {
  if (M.hazOrange) return M;
  M.hazOrange = std({ color: 0xf08a1c, roughness: 0.6, metalness: 0.1 });
  M.hazWhite = std({ color: 0xe6e4de, roughness: 0.6, metalness: 0.1 });
  M.paleArmor = std({ color: 0xd4d6d2, roughness: 0.6, metalness: 0.25 });                                              // pale grey armor plate and the Lab's white modules
  M.domeGlass = new THREE.MeshPhysicalMaterial({ color: 0x3a5a66, transparent: true, opacity: 0.42, roughness: 0.12, metalness: 0.1, depthWrite: false }); // the Lab's dome: see-through dark glass over the glow
    M.gateSheet = std({ color: 0x9c8cff, emissive: 0xa090ff, emissiveIntensity: 1.4 });                                   // the Portal's sheet of light: a light violet (paler, the white swirl on it did not read)
  M.gatePool = std({ color: 0x5a48e0, emissive: 0x6a56ff, emissiveIntensity: 1.0 });                                    // the ring's pool of light, a deeper violet (seen at a slant, it needs the saturation)
  M.gateGround = new THREE.MeshBasicMaterial({ color: 0x6a56ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }); // the soft glow on the ground before the gate
  M.gateWhite = std({ color: 0xffffff, emissive: 0xf6f2ff, emissiveIntensity: 2.0 });                                   // its white core
  M.gateCore = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.0 });                                    // its brighter ripples
  M.gateViolet = std({ color: 0x241c90, emissive: 0x5a4cff, emissiveIntensity: 1.6 });                                  // its edge: an indigo-leaning violet (hue 245 in the material, about 255 rendered: the finish's curve clips blue and pushes a redder violet towards magenta), apart from seat 3 (277) and seat 6 (311)
  M.gateHalo = new THREE.MeshBasicMaterial({ color: 0x6a56ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
  if (M.polish) { Object.assign(M.paleArmor, { envMapIntensity: 1.6 }); M.paleArmor.needsUpdate = true; }
  return M;
}
const SENTRY_TOP = 11.5, SENTRY_K = 1.25; // the drum's top: the head sits here; the whole gun's scale (base and head alike)
/** The Sentry gun's base: a round steel base plate (r 18), a short wide drum of grey metal (r 15.8, 9.5 tall; round
 *  4, Stelian: more metal, less white, fewer layers, so it is no layered cake) with a thick orange-and-white hazard
 *  band round its middle between ink rings, the bearing on top, a small team flag on a short mast at its north-west.
 *  The gun (`sentryGunHead`) turns on top. From the camera: a low grey drum with an orange-white ring, a long dark
 *  gun on it, a small flag. */
export function sentryGun(M) {
  ebMats(M); sentryMats(M); const g = grp(); g.scale.setScalar(SENTRY_K);                                             // (the consistency pass: 1.25x, about the Watchtower's weight on its 2x2)
  add(g, cyl(17.5, 18.5, 2.0, 28), M.steel, 0, 1.0, 0); add(g, cyl(18.7, 18.7, 0.5, 28), M.inkLine, 0, 0.25, 0);          // the base plate
  add(g, cyl(14.4, 15.8, 9.5, 28), M.paleSteel, 0, 2.0 + 4.75, 0);                                                       // the armor drum, grey metal
  for (let k = 0; k < 12; k++) add(g, torus(15.3, 1.5, 6, Math.PI / 6 - 0.015), k % 2 ? M.hazWhite : M.hazOrange, 0, 6.4, 0, Math.PI / 2, 0, k * Math.PI / 6); // the hazard band
  for (const y of [4.5, 8.3]) add(g, torus(15.5, 0.4, 40), M.inkLine, 0, y, 0, Math.PI / 2, 0, 0);                        // between ink rings
  add(g, cyl(8.5, 8.5, 1.2, 20), M.joint, 0, SENTRY_TOP + 0.3, 0);                                                        // the bearing
  flag(g, M, -16, 0, -15, 20, 12, 8);                                                                                    // a small team flag
  return g;
}
/** The Sentry gun's head (the turning part, 16 facings, no shadow): a squat grey-metal housing on the bearing, a long
 *  thick dark barrel ahead (+x) with a pale muzzle brake, an orange stripe along each flank between ink lines, a cyan
 *  sensor light on top. The barrel reaches 34 ahead of the axis. */
export function sentryGunHead(M) {
  ebMats(M); sentryMats(M); const g = grp(), Y = SENTRY_TOP; g.scale.setScalar(SENTRY_K);
  add(g, rbox(14, 7.5, 11, 1.4), M.paleSteel, -1, Y + 4.2, 0);                                                            // the housing
  for (const sz of [-1, 1]) { add(g, rbox(9, 2.4, 0.8, 0.2), M.hazOrange, -1.5, Y + 4.0, sz * 5.6); for (const dy of [-1.5, 1.5]) add(g, rbox(9.4, 0.4, 0.9, 0.05), M.inkLine, -1.5, Y + 4.0 + dy, sz * 5.6); } // the orange stripes
  add(g, cyl(2.8, 2.8, 6, 14), M.joint, 8, Y + 4.2, 0, 0, 0, Math.PI / 2);                                                // the mantlet
  add(g, cyl(1.9, 1.9, 24, 12), M.gun, 21, Y + 4.2, 0, 0, 0, Math.PI / 2);                                                // the barrel, long and dark against the pale housing
  add(g, cyl(2.4, 2.4, 3.4, 12), M.paleSteel, 33.5, Y + 4.2, 0, 0, 0, Math.PI / 2);                                       // the muzzle brake
  add(g, rbox(2.6, 1.8, 2.6, 0.4), M.joint, -1, Y + 8.8, 0); cyanLed(g, M, 0.8, -1, Y + 10.2, 0);                          // the sensor light on top
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return g;
}

// ---- the Lab (upgrades, 2x2; the sim key `loom`, today `lab` above, which read as a house): Stelian's round 3, his
// pick of two options: a white research module with a big glass dome showing a cyan glow (the other, three glowing
// tanks beside a module, was not drawn). No small clutter; team on a flag and a trim band only; no earth plate.
/** The white module: a rounded pale box `W` x `D`, 13 tall, at (x, z), a dark door in its south face, a team trim band
 *  round its top between ink lines. */
function whiteModule(g, M, x, z, W, D) {
  add(g, rbox(W, 13, D, 2.5), M.paleArmor, x, 6.5, z);
  add(g, rbox(6, 8, 1.2, 0.3), M.inkLine, x + 2, 4, z + D / 2);                                                          // the door
  add(g, rbox(W + 0.6, 2.2, D + 0.6, 0.3), M.paint, x, 10.6, z); for (const y of [9.3, 11.9]) add(g, rbox(W + 0.8, 0.5, D + 0.8, 0.1), M.inkLine, x, y, z); // the team trim band
}
/** The Lab, the dome (`labDome`): the white module (38 x 36) under a big see-through glass dome (r 18) on a pale
 *  ring, three pale meridian ribs, a cyan glow inside it (a core and two halos); a flag. From the camera: a white box
 *  with a dark glass dome on it glowing cyan in the middle, a flag. */
export function labDome(M) {
  ebMats(M); sentryMats(M); const g = grp();
  whiteModule(g, M, 0, 1, 38, 36);
  const R = 18;                                                                                                        // (round 4: 14 -> 18, the dome fills the 2x2)
  add(g, torus(R + 0.4, 1.0, 56), M.paleSteel, 0, 13, 0, Math.PI / 2, 0, 0);                                            // the dome's ring
  add(g, sph(6, 16, 12), M.neonCore, 0, 18.5, 0); add(g, sph(11.5, 16, 12), M.neonHalo, 0, 18, 0); add(g, sph(16, 16, 12), M.neonHalo, 0, 16, 0); // the glow inside
  add(g, new THREE.SphereGeometry(R, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), M.domeGlass, 0, 13, 0);                   // the dome
  for (const a of [0, Math.PI / 3, 2 * Math.PI / 3]) add(g, torus(R + 0.2, 0.7, 40, Math.PI), M.paleSteel, 0, 13, 0, 0, a, 0); // meridian ribs
  flag(g, M, -23, 0, -17, 32, 16, 11);
  return g;
}

// ---- the Portal (Marine; 2x2; the sim key `eclipse`, today `portal` above): Stelian's rounds 3 and 4, an energy gate,
// not a ring: two tall metal pylons with a vertical sheet of glowing light between them, a doorway of energy, the only
// tall rectangle in the base; the glow mostly white with a strong violet edge; no platform; team on a flag and the
// pylons' foot bands. The light is a separate part (`gateLight`, the head, RT_HEADS `gatehead`, `spin: 1`: its 16
// frames turn a slow swirl, a vortex, inside the gate), so the client can animate it. Round 4's three options, side by
// side in the pictures: (1) the wide gate (`energyGate`), (2) the gate with a curved accelerator tube behind it feeding
// one pylon (`energyGateTube`), (3) an oval accelerator ring lying flat with the swirl in its hollow (`acceleratorRing`,
// its swirl `ringSwirl`).
const GATE_X = 15, GATE_H = 52, GATE_W = 24, GATE_Y0 = 3, GATE_Y1 = 49;
/** The gate's frame (`energyGate`): two pylons of pale armor (5 x 52 x 6; round 4: taller and wider apart) standing
 *  straight in the ground at x +-15, a dark cap with a small cyan light on each, a dark steel sill between their
 *  feet, a team band round each foot between ink lines, the team flag on a mast at the north-west. */
export function energyGate(M) {
  ebMats(M); sentryMats(M); const g = grp();
  for (const sx of [-1, 1]) {
    const x = sx * GATE_X;
    add(g, rbox(5.2, GATE_H, 6.2, 1.0), M.paleArmor, x, GATE_H / 2, 0);
    add(g, rbox(6.2, 3.0, 7.2, 0.5), M.joint, x, GATE_H + 1.4, 0); cyanLed(g, M, 0.8, x, GATE_H + 3.4, 0);              // the cap and its light
    add(g, rbox(5.8, 3.2, 6.8, 0.3), M.paint, x, 5.5, 0); for (const y of [3.7, 7.3]) add(g, rbox(6.0, 0.5, 7.0, 0.1), M.inkLine, x, y, 0); // the team band round the foot
    add(g, rbox(1.2, GATE_H - 8, 1.2, 0.2), M.joint, x - sx * 2.9, GATE_H / 2 + 1, 0);                                   // the inner edge's dark rail, the sheet's seat
  }
  add(g, rbox(2 * GATE_X - 4, 1.6, 4.0, 0.4), M.joint, 0, 0.8, 0);                                                      // the sill
  flag(g, M, -GATE_X - 6, 0, -12, 30, 16, 11);
  return g;
}
/** A swirl of light in the xy plane about the origin, facing +z, `r` wide, turned `phase`: three spiral arms of white
 *  segments widening outward over a pale violet disc, a white core at the centre, a violet halo. The vortex. */
function swirl(g, M, r, phase, disc = M.gateSheet) {
  const v = grp(); v.rotation.z = phase; g.add(v);
  add(v, cyl(r, r, 0.5, 32), disc, 0, 0, 0, Math.PI / 2, 0, 0);                                                          // the violet disc
  for (let arm = 0; arm < 3; arm++) for (let k = 0; k < 7; k++) {
    const t = k / 6, th = arm * Math.PI * 2 / 3 + t * 3.2, rho = r * (0.2 + 0.75 * t), w = 2.6 - 1.4 * t;
    add(v, rbox(rho * 0.5 + 1.5, w, 0.7, 0.3), k < 3 ? M.gateCore : M.gateWhite, Math.cos(th) * rho, Math.sin(th) * rho, 0.3, 0, 0, th + Math.PI / 2 + 0.35);
  }
  add(v, sph(r * 0.22, 16, 12), M.gateCore, 0, 0, 0.4).scale.set(1, 1, 0.4);                                              // the white core
  add(v, cyl(r * 1.25, r * 1.25, 0.8, 32), M.gateHalo, 0, 0, 0.2, Math.PI / 2, 0, 0);                                     // the halo
  return v;
}
/** The gate's light (`gateLight`, the head at `phase`): a vertical sheet of pale violet light between the pylons (24 x
 *  46, facing the camera) with the swirl turning in its middle (r 11), a wide strong violet edge all round it, a violet
 *  halo, and a soft violet glow lying on the ground in front. No shadow. */
export function gateLight(M, phase = 0) {
  ebMats(M); sentryMats(M); const g = grp(), H = GATE_Y1 - GATE_Y0, cy = (GATE_Y0 + GATE_Y1) / 2;
  add(g, rbox(GATE_W, H, 0.6, 0.2), M.gateSheet, 0, cy, 0);                                                              // the sheet, pale violet-white
  const sw = grp(); sw.position.set(0, cy, 0.5); g.add(sw); swirl(sw, M, 11, phase);                                      // the vortex
  for (const sx of [-1, 1]) add(g, rbox(2.0, H + 2.4, 0.9, 0.3), M.gateViolet, sx * (GATE_W / 2 + 0.6), cy, 0);          // the violet edge, wide
  for (const sy of [-1, 1]) add(g, rbox(GATE_W + 3.2, 1.8, 0.9, 0.3), M.gateViolet, 0, cy + sy * (H / 2 + 0.6), 0);
  add(g, rbox(GATE_W + 7, H + 7, 1.4, 0.8), M.gateHalo, 0, cy, 0);                                                      // the halo
  add(g, sph(1, 24, 12), M.gateGround, 0, 0.4, 12).scale.set(20, 0.3, 12); add(g, sph(1, 24, 12), M.gateGround, 0, 0.5, 9).scale.set(13, 0.3, 7); // the glow on the ground in front, soft
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return g;
}
/** A thick curved accelerator tube: a slice of a big ring (R 26, tube r 4.5, `arc` radians) lying level at height `y`
 *  with its centre at (cx, cz), from angle `a0`: a smooth white cylinder with three dark steel magnet bands and a
 *  cyan light on each, two short legs to the ground. Silver and white, no blue (seat 0). */
function acceleratorTube(g, M, cx, y, cz, R, a0, arc) {
  const t = grp(); t.position.set(cx, y, cz); t.rotation.x = Math.PI / 2; t.rotation.z = a0; g.add(t);                   // (lying flat: the torus's xy plane to xz)
  add(t, torus(R, 4.5, 24, arc), M.paleArmor, 0, 0, 0);
  for (const f of [0.2, 0.5, 0.8]) { const a = arc * f, b = grp(); b.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); b.rotation.z = a; t.add(b);
    add(b, cyl(5.2, 5.2, 2.2, 20), M.steel, 0, 0, 0, 0, 0, Math.PI / 2); cyanLed(b, M, 0.7, 0, 0, -5.6); }                 // a magnet band, its light on top (local -z is up once the tube lies flat)
  for (const f of [0.15, 0.85]) { const a = a0 + arc * f, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R; add(g, cyl(1.4, 1.6, y - 2, 10), M.steel, x, (y - 2) / 2 + 0.5, z); } // the legs
  for (const f of [0, 1]) { const a = arc * f; add(t, cyl(5.0, 5.0, 2.0, 20), M.steel, Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a + Math.PI / 2); } // the end flanges
}
/** The gate with the accelerator tube (`energyGateTube`): the gate, and a slice of a big ring curving away from the
 *  east pylon's back to the north-east, behind and beside the gate where the camera sees it (straight behind, the
 *  sheet hid it), as a collider's magnets feeding the gate. */
export function energyGateTube(M) {
  const g = energyGate(M);
  acceleratorTube(g, M, GATE_X + 26, 9, -1, 26, Math.PI, 1.2);
  return g;
}
const RING_R = 22, RING_T = 4, RING_SX = 1.25, RING_SZ = 0.85;
/** The oval accelerator ring (`acceleratorRing`): a large flat oval ring tube lying on the ground (R 22 stretched
 *  1.25 x 0.85, tube r 4: 65 x 44 across, inside the 2x2), white, with eight dark steel magnet bands and a cyan light
 *  on each, and the swirl (`ringSwirl`, the head) glowing violet in its hollow, where the Marines appear; a team flag
 *  on a short mast outside the ring. */
export function acceleratorRing(M) {
  ebMats(M); sentryMats(M); const g = grp();
  const r = grp(); r.position.set(0, RING_T, 0); r.scale.set(RING_SX, 1, RING_SZ); g.add(r);
  add(r, torus(RING_R, RING_T, 64), M.paleArmor, 0, 0, 0, Math.PI / 2, 0, 0);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8, b = grp(); b.position.set(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R); b.rotation.y = -a; r.add(b);
    add(b, cyl(4.7, 4.7, 2.2, 20), M.steel, 0, 0, 0, 0, 0, Math.PI / 2); cyanLed(b, M, 0.7, 0, 5.1, 0); }                 // a magnet band and its light
  flag(g, M, -30, 0, 22, 24, 14, 10);
  return g;
}
/** The ring's swirl (`ringSwirl`, the head at `phase`): the vortex lying flat in the ring's hollow (r 15), turning
 *  about the vertical, with its violet halo. No shadow. */
export function ringSwirl(M, phase = 0) {
  ebMats(M); sentryMats(M); const g = grp();
  const f = grp(); f.position.set(0, 1.0, 0); f.rotation.x = -Math.PI / 2; f.scale.set(RING_SX * 0.95, RING_SZ * 0.95, 1); g.add(f); // (the xy swirl laid flat, stretched to the oval)
  swirl(f, M, 15, phase, M.gatePool);
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return g;
}

// ---- the Portal as a landing spot (Marine; 2x2; the sim key `eclipse`, the name stays "Portal"): Stelian, after
// rejecting the energy gate, its tube and the oval ring (kept above for the record). A square landing pad with
// markings (`landingPad`), and on it a squat generic VTOL dropship (`dropship`, the head, RT_HEADS `padhead`, `spin: 1`
// with its shadow: its 16 frames are lift heights, frame 0 landed, so the client can lift it off and land it later;
// not modelled on any game's or film's ship). Clean white and grey metal with cyan lights, team on a flag only, no
// clutter, no earth plate.
const PAD = 50, PAD_Y = 1.8, SHIP_YAW = -0.42, SHIP_LIFT = 36, SHIP_SCALE = 1.3;
/** The landing pad: a square plate of pale armor (50 x 50, 1.8 thick) straight on the grass, a dark border line and
 *  a dark landing circle (r 13) marked on it, a dark corner mark at each corner, a cyan light at each corner, the
 *  team flag on a mast at the north-west corner. From the camera: a pale square with a dark ring, four cyan dots, a
 *  flag, the ship on it. */
export function landingPad(M) {
  ebMats(M); sentryMats(M); const g = grp(), h = PAD / 2;
  add(g, rbox(PAD, PAD_Y, PAD, 0.5), M.paleArmor, 0, PAD_Y / 2, 0);
  for (const sx of [-1, 1]) { add(g, rbox(1.4, 0.3, PAD - 2, 0.05), M.joint, sx * (h - 2.2), PAD_Y + 0.1, 0); add(g, rbox(PAD - 2, 0.3, 1.4, 0.05), M.joint, 0, PAD_Y + 0.1, sx * (h - 2.2)); } // the border line
  add(g, torus(13, 0.8, 56), M.joint, 0, PAD_Y + 0.1, 0, Math.PI / 2, 0, 0);                                            // the landing circle
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(g, rbox(7, 0.3, 1.6, 0.05), M.joint, sx * (h - 6.5), PAD_Y + 0.1, sz * (h - 5.5)); add(g, rbox(1.6, 0.3, 7, 0.05), M.joint, sx * (h - 5.5), PAD_Y + 0.1, sz * (h - 6.5)); cyanLed(g, M, 0.8, sx * (h - 1.8), PAD_Y + 0.6, sz * (h - 1.8)); } // corner marks and lights
  flag(g, M, -h - 3, 0, -h + 2, 30, 16, 11);
  return g;
}
/** The dropship (the head at `phase`, lifted `phase / 2 pi` of 36 units): a squat VTOL, a stubby white fuselage (22 x
 *  7 x 11) with a rounded nose and a dark glass cockpit, a dark belly, two stub wings each ending in a fat ducted fan
 *  (r 5.5) with a dark rotor disc and a cyan light on its rim, a tail fin with a cyan light, four short legs; turned
 *  24 degrees on the pad so it shows three-quarter. Shot with its shadow (it lands on the pad). */
export function dropship(M, phase = 0) {
  ebMats(M); sentryMats(M); const g = grp();
  const sh = grp(); sh.position.set(0, PAD_Y + phase / (Math.PI * 2) * SHIP_LIFT, 0); sh.rotation.y = SHIP_YAW; sh.scale.setScalar(SHIP_SCALE); g.add(sh); // (1.3: at 1x the first ship was a small blob on its pad)
  add(sh, rbox(22, 7, 11, 2.5), M.paleArmor, 0, 6.5, 0);                                                                // the fuselage
  add(sh, sph(5.6, 20, 14), M.paleArmor, 10.5, 6.5, 0).scale.set(1.15, 0.62, 1.0);                                       // the nose
  add(sh, rbox(6.5, 2.6, 7.5, 1.0), M.glass, 8.5, 8.6, 0);                                                                // the cockpit glass
  add(sh, rbox(19, 2.2, 9.4, 0.6), M.panelDark, -0.5, 3.0, 0);                                                            // the dark belly
  for (const sz of [-1, 1]) {
    add(sh, rbox(10, 1.4, 8, 0.4), M.paleSteel, -2, 7.4, sz * 9.5);                                                       // the stub wing
    add(sh, cyl(5.5, 5.5, 3.4, 24), M.paleArmor, -2, 7.4, sz * 14.5); add(sh, cyl(4.4, 4.4, 3.6, 24), M.joint, -2, 7.4, sz * 14.5); // the ducted fan: the duct, its dark throat
    add(sh, cyl(4.2, 4.2, 0.6, 20), M.rotor, -2, 7.8, sz * 14.5); add(sh, sph(1.2, 10, 8), M.steel, -2, 8.2, sz * 14.5);    // the rotor disc and hub
    cyanLed(sh, M, 0.6, 2.8, 8.6, sz * 14.5);                                                                            // a light on the duct's rim, forward
  }
  add(sh, rbox(5, 5.5, 1.2, 0.4), M.paleArmor, -10, 11.5, 0); cyanLed(sh, M, 0.6, -12.2, 13.6, 0);                       // the tail fin and its light
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sh, cyl(0.55, 0.7, 3.4, 8), M.steel, sx * 7, 1.7, sz * 3.6);    // the legs
  return g;
}

// ---- the Recruiting post (Mercenary, Veteran; 2x2; the sim key `siphon`, today `recruitingPost` above): Stelian's
// three options, side by side in the pictures: (a) a peaked canvas tent (`postTent`), (b) a local wooden house taken
// over by the Expedition, a tavern with a crossed-swords sign, a corrugated patch and a cyan work lamp (`postTavern`),
// (c) a plain small wooden house with the sign (`postHouse`). Team on a small flag only, no props, no earth plate.
/** A ridge tent: a triangular prism `L` long along z, `W` wide, `H` tall, of grey canvas sloping to the ground, an ink
 *  hem, a dark open door in its south end with the flap folded back, at (x, z) turned `ry`. */
function ridgeTent(g, M, x, z, L, W, H, ry = 0) {
  const t = grp(); t.position.set(x, 0, z); t.rotation.y = ry; g.add(t);
  const sh = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, H)]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false }); geo.translate(0, 0, -L / 2); geo.computeVertexNormals();
  const uv = geo.attributes.uv, p = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 16, p.getY(i) / 16);
  add(t, geo, M.canvasGrey, 0, 0.2, 0);
  add(t, rbox(W + 1.0, 0.5, L + 0.8, 0.1), M.inkLine, 0, 0.2, 0);                                                      // the hem at the ground
  add(t, cyl(0.5, 0.5, L + 2, 8), M.joint, 0, H + 0.2, 0, Math.PI / 2, 0, 0);                                           // the ridge pole
  add(t, plate([[-W * 0.17, 0], [W * 0.17, 0], [0, -H * 0.62]], 0.6, 0.1), M.inkLine, 0, 0.3, L / 2 + 0.2, Math.PI / 2, 0, 0); // the open door, dark (a triangle stood up on the south end)
  add(t, plate([[0, 0], [W * 0.17, 0], [W * 0.1, -H * 0.5]], 0.5, 0.1), M.canvasGrey, W * 0.17, 0.3, L / 2 + 0.6, Math.PI / 2, 0.5, 0); // the flap folded back
}
/** A hanging sign: a bracket out of a wall at (x, y, z) facing +z, a pale board hanging from it with two crossed dark
 *  swords. */
function swordsSign(g, M, x, y, z, k = 1) {
  const sg = grp(); sg.position.set(x, y, z); sg.scale.setScalar(k); g.add(sg);
  limb(sg, [0, 0, 0], [0, 0, 5], 0.4, M.joint); limb(sg, [0, -2.5, 0], [0, 0, 5], 0.3, M.joint);
  add(sg, rbox(10, 8.5, 0.6, 0.2), M.board, 0, -5, 4.4); add(sg, rbox(10.4, 0.5, 0.7, 0.05), M.inkLine, 0, -0.9, 4.4); add(sg, rbox(10.4, 0.5, 0.7, 0.05), M.inkLine, 0, -9.1, 4.4);
  for (const a of [Math.PI / 4, -Math.PI / 4]) { add(sg, rbox(9.2, 1.3, 0.5, 0.1), M.joint, 0, -5, 4.8, 0, 0, a); add(sg, rbox(3.4, 1.0, 0.5, 0.1), M.paleSteel, -Math.cos(a) * 3.2, -5 - Math.sin(a) * 3.2, 4.9, 0, 0, a + Math.PI / 2); } // two crossed swords with pale guards (big: a small sign was a tiny detail at 1x; `k` scales it)
}
/** (a) The tent: a big ridge tent (36 long, 30 wide, 24 tall, its door to the camera), a smaller one beside it to the
 *  east, turned a little, a small team flag on the big one's peak. */
export function postTent(M) {
  ebMats(M); const g = grp();
  ridgeTent(g, M, -6, 0, 36, 30, 24, 0);
  ridgeTent(g, M, 21, -10, 20, 16, 13, 0.35);
  flag(g, M, -6, 24.2, -16, 9, 11, 7);
  return g;
}
/** (b) The tavern: a plank hut (34 x 24, 14 tall) under its grey plank gable, a corrugated steel patch on the south
 *  slope, a dark door with a cyan work lamp beside it, the crossed-swords sign hanging over the door, a small team flag
 *  on the ridge's west end. */
export function postTavern(M) {
  ebMats(M); sentryMats(M); const g = grp();
  const W = 50, D = 22, H = 14, R = 9;                                                                                 // (Stelian's pick, longer: a long hall, apart from the Cottage at 1x)
  hut(g, M, 0, 0, W, D, H, R);
  { const Wd = D + 6, a = Math.atan2(R, Wd / 2), t = 0.6; const px = 7, py = H + 2 + R * (1 - t) + 0.6, pz = (Wd / 2) * t;  // the patch on the south slope, 0.6 of the way up
    add(g, rbox(12, 0.7, 8, 0.1), M.paleSteel, px, py, pz, -a, 0, 0); for (const dx of [-4, -1.3, 1.3, 4]) add(g, rbox(0.6, 0.5, 8.2, 0.05), M.steel, px + dx, py + 0.3, pz, -a, 0, 0); }
  add(g, rbox(7, 9.5, 1.0, 0.3), M.inkLine, -8, 6.7, D / 2 + 0.5);                                                       // the door
  add(g, rbox(2.4, 1.8, 1.6, 0.3), M.joint, 2, 11.5, D / 2 + 0.8); cyanLed(g, M, 1.0, 2, 10.8, D / 2 + 2.0);              // the work lamp
  swordsSign(g, M, -8, H + 2.4, D / 2 + 0.4, 1.5);                                                                       // the sign, bigger
  flag(g, M, -W / 2 - 2.5 + 2, H + 2 + R, 0, 12, 14, 9);
  return g;
}
/** (c) The small house: a plank hut (26 x 20, 12 tall) under its gable, a dark door, the crossed-swords sign over it, a
 *  small team flag on the ridge. */
export function postHouse(M) {
  ebMats(M); sentryMats(M); const g = grp();
  const W = 26, D = 20, H = 12, R = 8;
  hut(g, M, 0, 0, W, D, H, R);
  add(g, rbox(6, 9, 1.0, 0.3), M.inkLine, -4, 6.5, D / 2 + 0.5);
  swordsSign(g, M, -4, H + 1.6, D / 2 + 0.4);
  flag(g, M, W / 2 - 1, H + 2 + R, 0, 10, 12, 8);
  return g;
}

// ---- the Factory (Buggy, Rover, Drone; 3x3; the sim key `kiln`, today `factory` above): Stelian's round: a metal
// hangar in the new style, white and grey metal with cyan lights, a big roll-up door, a large cog on the roof as its
// icon; no clutter, team on a flag only, no earth plate.
/** A big cog standing upright (in the xy plane, facing +z) at (x, y, z): a grey steel disc with twelve teeth and a
 *  dark hub ring with a cyan light in its middle. */
function cog(g, M, x, y, z, r) {
  const c = grp(); c.position.set(x, y, z); g.add(c);
  add(c, cyl(r, r, 2.6, 32), M.steel, 0, 0, 0, Math.PI / 2, 0, 0);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; add(c, rbox(r * 0.3, r * 0.26, 2.6, 0.3), M.steel, Math.cos(a) * (r + r * 0.12), Math.sin(a) * (r + r * 0.12), 0, 0, 0, a); }
  add(c, torus(r * 0.42, r * 0.09, 32), M.joint, 0, 0, 1.4); cyanLed(c, M, r * 0.14, 0, 0, 1.6);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; add(c, rbox(r * 0.28, r * 0.28, 2.8, 0.2), M.joint, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 0, 0, 0, a); } // four lightening holes
}
/** The hangar (`hangar`): a white metal hall 70 x 46 and 26 tall under a grey barrel roof (r 23) with three dark ribs,
 *  a big dark roll-up door in the south face (34 x 20, pale slat lines, a cyan strip over it), a cyan light at each
 *  roof corner, the big cog (r 11) standing on the roof's crown facing the camera, the team flag on a mast at the
 *  north-west corner. From the camera: a white box with a round grey roof, a wide dark door, a cog on top, a flag. */
export function hangar(M) {
  ebMats(M); sentryMats(M); const g = grp();
  const W = 70, D = 46, H = 26, R = D / 2;
  add(g, rbox(W, H, D, 2.0), M.paleArmor, 0, H / 2, 0);
  add(g, cyl(R, R, W + 2, 32), M.paleSteel, 0, H, 0, 0, 0, Math.PI / 2);                                                  // the barrel roof (its lower half inside the hall)
  for (const x of [-W / 3, 0, W / 3]) add(g, torus(R + 0.3, 0.7, 24, Math.PI), M.joint, x, H, 0, 0, Math.PI / 2, 0);     // the ribs
  for (const sx of [-1, 1]) add(g, cyl(R + 0.4, R + 0.4, 1.4, 32), M.paleArmor, sx * (W / 2 + 0.4), H, 0, 0, 0, Math.PI / 2).scale.set(1, 1, 1); // the end walls' arches
  add(g, rbox(W + 1.2, 1.6, D + 1.2, 0.2), M.inkLine, 0, H - 0.4, 0);                                                    // the eave line
  add(g, rbox(34, 20, 1.2, 0.3), M.panelDark, 2, 11, D / 2 + 0.5);                                                       // the roll-up door
  for (let k = 1; k < 6; k++) add(g, rbox(33, 0.5, 0.6, 0.05), M.paleSteel, 2, 1 + k * 3.3, D / 2 + 1.1);                  // its slats
  add(g, rbox(36, 1.2, 1.2, 0.2), M.neon, 2, 21.8, D / 2 + 0.9); add(g, rbox(37, 3.4, 1.8, 0.4), M.neonHalo, 2, 21.8, D / 2 + 1.0); // the strip over the door
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyanLed(g, M, 0.8, sx * (W / 2 - 1.5), H + 1.2, sz * (D / 2 - 1.5)); // the roof corners' lights
  cog(g, M, 0, H + R + 9, 0, 11);
  flag(g, M, -W / 2 - 3, 0, -D / 2 - 3, 44, 20, 14);
  return g;
}

// ---- the Factory as a warehouse (`warehouse`; Stelian, after the hangar: too metallic and round): a boxy rectangular
// building with a flat low roof and wide loading-bay doors, painted panels in off-white with cyan lights, the cog lying
// flat on the roof as a big emblem drawn as the chip is on the Data center's roof; no clutter, team on a flag only.
/** The big cog lying flat with its centre at (x, y, z): a grey steel disc with twelve teeth, four lightening holes, a
 *  dark hub ring and a cyan light in the middle with a halo (the Data center's chip, in a cog). */
function cogFlat(g, M, x, y, z, r) {
  const c = grp(); c.position.set(x, y, z); g.add(c);
  add(c, cyl(r, r, 2.4, 36), M.steel, 0, 1.2, 0);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; add(c, rbox(r * 0.3, 2.4, r * 0.26, 0.3), M.steel, Math.cos(a) * (r + r * 0.12), 1.2, Math.sin(a) * (r + r * 0.12), 0, -a, 0); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; add(c, rbox(r * 0.28, 2.8, r * 0.28, 0.2), M.joint, Math.cos(a) * r * 0.62, 1.2, Math.sin(a) * r * 0.62, 0, -a, 0); }
  add(c, torus(r * 0.4, r * 0.08, 36), M.joint, 0, 2.5, 0, Math.PI / 2, 0, 0); add(c, cyl(r * 0.3, r * 0.3, 0.8, 24), M.neon, 0, 2.6, 0); add(c, cyl(r * 0.14, r * 0.14, 1.0, 16), M.neonCore, 0, 3.0, 0);
  add(c, sph(r * 0.8, 12, 8), M.neonHalo, 0, 2.6, 0).scale.set(1, 0.25, 1);
}
export function warehouse(M) {
  ebMats(M); sentryMats(M); const g = grp();
  if (!M.panelPaint) M.panelPaint = std({ color: 0xd2d4ce, roughness: 0.8, metalness: 0.05 });                          // painted panels, off-white, matte (no chrome)
  const W = 72, D = 46, H = 24;
  add(g, rbox(W, H, D, 1.2), M.panelPaint, 0, H / 2, 0);
  add(g, rbox(W + 1.6, 2.4, D + 1.6, 0.3), M.paleSteel, 0, H + 0.6, 0); add(g, rbox(W + 2, 0.5, D + 2, 0.1), M.inkLine, 0, H - 0.3, 0); // the low parapet and the eave line
  for (const x of [-24, -12, 0, 12, 24]) { add(g, rbox(0.8, H - 2, 0.6, 0.1), M.steel, x, H / 2, D / 2 + 0.4); } // panel seams on the south face
  for (const z of [-15, 0, 15]) add(g, rbox(0.6, H - 2, 0.8, 0.1), M.steel, W / 2 + 0.4, H / 2, z);                     // and the east
  for (const x of [-18, 14]) {                                                                                           // two wide loading-bay doors, dark, slatted, a cyan strip over each
    add(g, rbox(24, 16, 1.2, 0.3), M.panelDark, x, 8.5, D / 2 + 0.5);
    for (let k = 1; k < 5; k++) add(g, rbox(23, 0.5, 0.6, 0.05), M.paleSteel, x, 0.5 + k * 3.2, D / 2 + 1.1);
    add(g, rbox(26, 1.2, 1.2, 0.2), M.neon, x, 17.6, D / 2 + 0.9); add(g, rbox(27, 3.4, 1.8, 0.4), M.neonHalo, x, 17.6, D / 2 + 1.0);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyanLed(g, M, 0.9, sx * (W / 2 - 2), H + 2.6, sz * (D / 2 - 2));      // the roof corners' lights
  cogFlat(g, M, 2, H + 1.8, -2, 16);
  flag(g, M, -W / 2 - 3, 0, -D / 2 - 3, 44, 20, 14);
  return g;
}

// ---- the Portal as an arrival platform (`platform`) with a troop transport (`transport`, the head `platformhead`,
// lift frames with its shadow; Stelian, after the helipad: not a helipad, no H, no ducted fans; Marines and others
// arrive here): a dark platform with bold pale circle and chevron markings, turned 20 degrees in the model (its ship
// turns with it; the head cannot be fitted, so the plate is sized for its turn), and on it a pale ship with a clear
// shape from above (a fuselage, short swept wings, two engines, a tail), its rear ramp lowered towards the camera so
// people walk out. Team on a flag only.
const PLAT = 46, PLAT_Y = 2.0, PLAT_YAW = -20 * Math.PI / 180, SHIP2_YAW = 0.7, SHIP2_LIFT = 36;
export function platform(M) {
  ebMats(M); sentryMats(M); const g = grp(), h = PLAT / 2;
  const p = grp(); p.rotation.y = PLAT_YAW; g.add(p);
  add(p, rbox(PLAT, PLAT_Y, PLAT, 0.5), M.panelDark, 0, PLAT_Y / 2, 0);
  add(p, rbox(PLAT + 0.6, 0.5, PLAT + 0.6, 0.1), M.inkLine, 0, 0.3, 0);
  add(p, torus(16, 1.3, 56), M.paleArmor, 0, PLAT_Y + 0.1, 0, Math.PI / 2, 0, 0);                                        // the bold circle
  for (const t of [0, 1]) for (const sx of [-1, 1]) add(p, rbox(9, 0.5, 2.2, 0.1), M.paleArmor, sx * 4.2 + (t ? 0 : 0), PLAT_Y + 0.1, -h + 4 + t * 5 + sx * 0, 0, sx * 0.75, 0); // two chevrons at the north edge, pointing in
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyanLed(p, M, 0.9, sx * (h - 2), PLAT_Y + 0.6, sz * (h - 2));        // corner lights
  flag(g, M, -h - 2, 0, -h + 4, 32, 16, 11);
  return g;
}
export function transport(M, phase = 0) {
  ebMats(M); sentryMats(M); const g = grp();
  const sh = grp(); sh.position.set(0, PLAT_Y + phase / (Math.PI * 2) * SHIP2_LIFT, 0); sh.rotation.y = PLAT_YAW + SHIP2_YAW; g.add(sh);
  const L = 36, Wd = 11, Hh = 8;
  add(sh, rbox(L, Hh, Wd, 2.8), M.paleArmor, 0, 3.5 + Hh / 2, 0);                                                        // the fuselage
  add(sh, cone(Wd / 2 * 0.95, 9, 16), M.paleArmor, L / 2 + 3.5, 3.5 + Hh / 2, 0, 0, 0, -Math.PI / 2).scale.set(1, 1, Hh / Wd); // the nose
  add(sh, rbox(6, 2.2, 6, 0.8), M.glass, L / 2 - 4, 3.5 + Hh - 0.4, 0);                                                   // the cockpit glass
  for (const sz of [-1, 1]) {
    add(sh, plate([[0, 0], [-10, 0], [-16, sz * 12], [-11, sz * 12]], 1.6, 0.3), M.paleArmor, 2, 3.5 + Hh / 2, sz * (Wd / 2 - 0.5)); // a short swept wing (a plate, top view)
    add(sh, cyl(2.8, 2.8, 11, 16), M.steel, -8, 3.5 + Hh / 2 + 0.6, sz * (Wd / 2 + 9), 0, 0, Math.PI / 2); cyanLed(sh, M, 0.8, -14, 3.5 + Hh / 2 + 0.6, sz * (Wd / 2 + 9)); // an engine, its light aft
  }
  add(sh, rbox(6, 6, 1.4, 0.4), M.paleArmor, -L / 2 + 4, 3.5 + Hh + 2.5, 0); cyanLed(sh, M, 0.7, -L / 2 + 2, 3.5 + Hh + 5.6, 0); // the tail fin
  { const ramp = add(sh, rbox(9, 0.8, Wd - 2, 0.2), M.paleSteel, -L / 2 - 4.2, 2.2, 0); ramp.rotation.z = 0.32;             // the rear ramp, lowered to the platform
    add(sh, rbox(Wd - 2.4, Hh - 2, 0.6, 0.2), M.inkLine, -L / 2 + 0.2, 3.5 + Hh / 2 - 0.5, 0, 0, Math.PI / 2, 0); }         // the dark hold behind it
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sh, cyl(0.6, 0.8, 3.6, 8), M.steel, sx * 10, 1.8, sz * 3.4);      // the legs
  return g;
}

// ---- the Portal as a black-hole vortex (`vortex`, with its spiral the head `vortexhead`; Stelian, the final round,
// after the platform): a flat dark disc lying on the ground, 2x2 and round (no turn), a thin bright cyan edge, and in
// it a cyan spiral turning inward (the head, `spin: 1`: 16 frames of one turn; the spin says portal, not pit); no
// pylons, no props; team on a small flag only.
const VORTEX_R = 27;
export function vortex(M) {
  ebMats(M); sentryMats(M); const g = grp();
  if (!M.hole) M.hole = std({ color: 0x08080c, roughness: 0.95, metalness: 0 });                                           // the hole: matte near-black
  add(g, cyl(VORTEX_R, VORTEX_R + 0.8, 1.2, 64), M.hole, 0, 0.6, 0);
  add(g, torus(VORTEX_R + 0.4, 0.7, 64), M.neon, 0, 1.3, 0, Math.PI / 2, 0, 0); add(g, torus(VORTEX_R + 0.4, 1.6, 64), M.neonHalo, 0, 1.3, 0, Math.PI / 2, 0, 0); // the thin bright edge and its halo
  flag(g, M, -VORTEX_R - 1, 0, -VORTEX_R + 6, 22, 12, 8);
  return g;
}
/** The vortex's spiral (the head at `phase`): three cyan arms spiralling inward over the dark disc, bright and wide at
 *  the rim, thinner and dimmer towards a dark centre, turning with the phase; a soft cyan halo over the middle. */
export function vortexSpin(M, phase = 0) {
  ebMats(M); sentryMats(M); const g = grp();
  const v = grp(); v.position.set(0, 1.4, 0); v.rotation.y = -phase; g.add(v);
  for (let arm = 0; arm < 3; arm++) for (let k = 0; k < 11; k++) {
    const t = k / 10, th = arm * Math.PI * 2 / 3 + t * 4.2, rho = VORTEX_R * (0.92 - 0.74 * t), w = 2.8 - 2.0 * t, len = rho * 0.42 + 1.5;
    add(v, rbox(len, 0.5, w, 0.2), t < 0.75 ? M.neon : M.neonCore, Math.cos(th) * rho, 0, Math.sin(th) * rho, 0, -(th + Math.PI / 2) - 0.45, 0);
  }
  add(v, cyl(VORTEX_R * 0.5, VORTEX_R * 0.5, 0.6, 32), M.neonHalo, 0, 0.3, 0);                                                // the halo over the middle
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return g;
}
