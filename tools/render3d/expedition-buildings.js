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
  M.block = std({ color: 0x5a5e66, metalness: 0.3, roughness: 0.55 });                                              // its charcoal composite body, clean (no shell seams: the neon draws the seams; 0x3a3e44 went near-black under the finish, its faces being in the sun's shade)
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
// a separate part, as the Radio tower's turret (`radioTurret`, RT_HEADS): `turbineRotor` / `windFarmRotor` build the
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
/** A turbine's mast at (x, z): a stone footing, a tapered pale pole `H` tall (radius `r` at the foot), a replaced
 *  darker section lashed with rope (patched), rungs down its south face, a team band round its waist between ink
 *  rings, the nacelle at the top yawed `yaw` (its rotor faces local +z, the camera's side), a cyan light on its tail.
 *  The hub (the rotor's seat) is at (x, 3 + H, z) plus the nacelle's nose. Returns the hub's world position. */
function turbineMast(g, M, x, z, H, r, yaw, polish) {
  const TOP = 3 + H, k = r / 2.2;
  add(g, rbox(6 * r, 3, 6 * r, 0.5), M.stone, x, 1.5, z);
  add(g, cyl(r * 0.55, r, H, 12), M.pole, x, 3 + H / 2, z);
  add(g, cyl(r * 0.78 + 0.25, r * 0.86 + 0.25, H * 0.12, 12), M.panelDark, x, 3 + H * 0.36, z);                                   // a replaced section, darker
  for (const t of [0.31, 0.41]) add(g, torus(r * 0.84 + 0.3, 0.3 * k, Math.PI * 2, 24), M.rope, x, 3 + H * t, z, Math.PI / 2, 0, 0); // lashed with rope
  add(g, cyl(r * 0.72 + 0.4, r * 0.76 + 0.4, H * 0.08, 12), M.paintCloth, x, 3 + H * 0.56, z); for (const t of [0.515, 0.605]) add(g, cyl(r * 0.76 + 0.5, r * 0.76 + 0.5, 0.5, 12), M.inkLine, x, 3 + H * t, z); // the team band between ink rings
  for (let y = 7; y < TOP - 4; y += 4 * k) limb(g, [x - 1.1 * k, y, z + r * 0.9], [x + 1.1 * k, y, z + r * 0.9], 0.28 * k, M.steel);    // rungs
  const n = grp(); n.position.set(x, TOP, z); n.rotation.y = yaw; g.add(n);
  add(n, rbox(4.6 * k, 4.2 * k, 9.5 * k, 1.0 * k), M.panelDark, 0, 1.0 * k, -1.2 * k);                                           // the nacelle, its nose to local +z
  add(n, rbox(4.0 * k, 1.0 * k, 7.5 * k, 0.3 * k), M.paleSteel, 0, 3.4 * k, -1.2 * k);                                           // a pale lid
  add(n, cyl(1.5 * k, 1.5 * k, 2.4 * k, 12), M.steel, 0, 1.0 * k, 4.2 * k, Math.PI / 2, 0, 0);                                     // the shaft's collar
  cyanLed(n, M, 0.55 * k, 0, 1.4 * k, -6.2 * k);                                                                                  // the tail light
  if (polish) { add(n, rbox(1.2 * k, 0.8 * k, 1.2 * k, 0.2), M.joint, 0, 3.9 * k, -4.5 * k); cable(g, M, [x + Math.sin(yaw) * -2, TOP - 1, z + Math.cos(yaw) * -2], [x - r * 0.9, 3 + H * 0.5, z - r * 0.4], 0.3 * k); }
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
/** The battery box with its cyan light, a cable drum and a jerrycan: the turbines' kit on the ground. */
function powerKit(g, M, x, z) {
  add(g, rbox(7, 4.2, 5, 0.5), M.panelDark, x, 3.7, z); add(g, rbox(7.4, 0.5, 5.4, 0.05), M.inkLine, x, 5.5, z); cyanLed(g, M, 0.5, x + 2.2, 4.4, z + 2.7); // the battery box, a cyan light on its face
  add(g, cyl(2.6, 2.6, 2.2, 14), M.oakPale, x + 7.5, 4.2, z - 1, 0, 0, Math.PI / 2); add(g, cyl(1.8, 1.8, 2.5, 12), M.cable, x + 7.5, 4.2, z - 1, 0, 0, Math.PI / 2); // a cable drum
  add(g, rbox(2.4, 3.4, 1.6, 0.3), M.panelDark, x - 5.5, 3.3, z + 1); add(g, rbox(1.0, 0.6, 0.6, 0.1), M.joint, x - 5.5, 5.3, z + 1);                       // a jerrycan
}
const TURBINE_H = 56, TURBINE_R = 2.6, TURBINE_YAW = -0.5, TURBINE_L = 20;
/** The Wind turbine (the Power source; 2x2, replacing the Cabin: the sim key `spire`): one tall turbine. A pale
 *  tapered pole 56 tall on a stone footing, guyed with three ropes to stakes, a darker replaced section lashed with
 *  rope, rungs, a team band round its waist; the nacelle at the top turned a little west of the camera so the rotor
 *  disc shows, a cyan tail light; at the foot the battery box with a cyan light, a cable from the pole, a cable drum,
 *  a jerrycan; the team flag on a short mast. The rotor is `turbineRotor` (the turning head). From the camera: a tall
 *  thin pale pole with a three-blade star on top, a flag and a box at its foot. */
export function windTurbine(M) {
  ebMats(M); turbineMats(M); const g = grp();
  earth(g, M, [[-22, -16], [16, -22], [23, 0], [16, 22], [-16, 23], [-23, 2]], 0.8, 2);
  turbineMast(g, M, 0, 0, TURBINE_H, TURBINE_R, TURBINE_YAW, M.polish);
  for (const a of [0.9, 2.9, 5.0]) { const A = [Math.cos(a) * 1.8, 3 + TURBINE_H * 0.7, Math.sin(a) * 1.8], B = [Math.cos(a) * 21, 1.5, Math.sin(a) * 19]; limb(g, A, B, 0.3, M.rope); add(g, cyl(0.6, 0.8, 3, 6), M.oak, B[0], 1.6, B[2], 0.2, 0, 0); } // the guys
  powerKit(g, M, 11, 11); cable(g, M, [1.5, 5.5, 1.8], [8.5, 5.6, 9.5], 0.4);
  flag(g, M, -13, 1.6, -11, 24, 16, 11);
  if (M.polish) for (const a of [0.9, 2.9, 5.0]) { const A = [Math.cos(a) * 1.8, 3 + TURBINE_H * 0.7, Math.sin(a) * 1.8], B = [Math.cos(a) * 21, 1.5, Math.sin(a) * 19], at = (t) => A.map((v, i) => v + (B[i] - v) * t); limb(g, at(0.78), at(0.88), 0.55, M.steel); } // turnbuckles on the guys
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
  for (const [x, z, yaw] of FARM) { turbineMast(g, M, x, z, FARM_H, FARM_R, yaw, M.polish); cable(g, M, [x + 1, 5, z + 1], [15, 5.6, 11], 0.35); }
  powerKit(g, M, 16, 12);
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
function dishGeo(R, d, t, seg = 28) {
  const pts = [], n = 12;
  for (let i = 0; i <= n; i++) { const r = R * i / n; pts.push(new THREE.Vector2(r, d * (r / R) ** 2)); }
  pts.push(new THREE.Vector2(R + t * 0.6, d + t * 0.4));
  for (let i = n; i >= 0; i--) { const r = R * i / n; pts.push(new THREE.Vector2(r + (i ? t * 0.6 : 0), d * (r / R) ** 2 - t)); }
  return new THREE.LatheGeometry(pts.reverse(), seg); // (reversed: the lathe's normals follow the profile's direction, and the bowl's face must light from inside)
}
const DISH_R = 26, DISH_D = 7.5, DISH_TILT = 0.38;
/** The Uplink (3x3, unarmed; the sim key `uplink`: "Talks to the satellite we brought along."): a wide, squat
 *  satellite dish on a low equipment base. The dish (r 26, a tile and a half across) a matte pale-grey paraboloid
 *  tilted 22 degrees towards the camera on a steel yoke over a short pedestal on a stone plinth, so the bowl shows its
 *  depth (the sun shades its north-west wall), dark ribs across its face, a dark rim with a team arc on its lower edge
 *  between ink arcs and four small cyan marker lights, two oak struts bracing its back to the ground (improvised), the
 *  feed horn on three thin struts at its focus with a cyan ring and light looking into the bowl; north-west of it the
 *  equipment hut: a low board hut under a gable, a rack panel under a cyan strip and a dark door with a lit lintel on
 *  its south face, a team cloth beside the door, a cyan status light on its ridge; cables from the horn to the pedestal
 *  and from the pedestal to the hut, a team band round the pedestal, a solar panel, a cable drum, two flags. Low and wide
 *  where the Radio tower is thin and tall. From the camera: a big pale bowl with a dark rim and cyan dots, a small grey
 *  hut behind it to the left, two flags. The ribs, struts and horn cast no shadow (their streaks across the bowl were
 *  noise at 1x). */
export function uplink(M) {
  ebMats(M); turbineMats(M); const g = grp();
  earth(g, M, [[-46, -36], [30, -46], [47, -8], [44, 40], [-20, 47], [-46, 24]], 0.85, 2);
  // the equipment hut, north-west
  const HX = -22, HZ = -14, HW = 34, HD = 18, HH = 10;
  hut(g, M, HX, HZ, HW, HD, HH, 4.5);
  add(g, rbox(14, 5.6, 1.0, 0.25), M.rackPanel, HX - 7, 6.6, HZ + HD / 2 + 0.5); add(g, rbox(15, 1.1, 1.0, 0.2), M.neon, HX - 7, 10.2, HZ + HD / 2 + 0.6); add(g, rbox(16, 3.2, 1.6, 0.4), M.neonHalo, HX - 7, 10.2, HZ + HD / 2 + 0.7); // a rack panel in the south face under a cyan strip
  add(g, rbox(5.4, 8.2, 1.0, 0.3), M.inkLine, HX + 11, 6.1, HZ + HD / 2 + 0.5); add(g, rbox(6, 0.8, 1.0, 0.2), M.neon, HX + 11, 10.5, HZ + HD / 2 + 0.7);  // the door, a lit lintel
  cloth(g, M, HX + 4, HH + 1.2, HZ + HD / 2 + 0.9, 6, 7);                                                                                 // a team cloth beside the door
  cyanLed(g, M, 0.8, HX + HW / 2 - 3, HH + 2 + 4.5 + 1.8, HZ);                                                                             // a status light on the ridge
  // the dish on its pedestal, centre-south: low
  const DX = 10, DZ = 12, PY = 12;
  add(g, rbox(16, 3.4, 16, 0.5), M.stone, DX, 1.7, DZ);
  add(g, cyl(3.2, 3.8, PY - 3.4, 14), M.steel, DX, 3.4 + (PY - 3.4) / 2, DZ);
  add(g, cyl(3.9, 4.0, 3.0, 14), M.paint, DX, 7.5, DZ); for (const y of [5.8, 9.2]) add(g, cyl(4.2, 4.2, 0.5, 14), M.inkLine, DX, y, DZ); // the team band round the pedestal
  for (const sx of [-1, 1]) add(g, rbox(1.6, 7, 4, 0.3), M.steel, DX + sx * 3.4, PY + 2.5, DZ);                                           // the yoke's cheeks
  add(g, cyl(1.2, 1.2, 9, 10), M.joint, DX, PY + 4, DZ, 0, 0, Math.PI / 2);                                                             // the trunnion
  const d = grp(); d.position.set(DX, PY + 4, DZ); d.rotation.x = DISH_TILT; g.add(d);                                                  // the dish, tilted towards the camera
  add(d, dishGeo(DISH_R, DISH_D, 0.9), M.blade, 0, 0, 0);
  add(d, torus(DISH_R + 0.5, 0.9, Math.PI * 2, 48), M.dishBack, 0, DISH_D + 0.1, 0, Math.PI / 2, 0, 0);                                  // the rim
  const q = grp(); d.add(q);                                                                                                           // the parts over the bowl that cast no shadow
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; for (const [t0, t1] of [[0.12, 0.55], [0.55, 0.98]]) limb(q, [Math.cos(a) * DISH_R * t0, DISH_D * t0 * t0 + 0.3, Math.sin(a) * DISH_R * t0], [Math.cos(a) * DISH_R * t1, DISH_D * t1 * t1 + 0.3, Math.sin(a) * DISH_R * t1], 0.26, M.dishBack); } // ribs across the face
  { const a0 = Math.PI / 2 - 0.5, arc = 1.0; add(d, torus(DISH_R + 0.5, 1.15, arc, 16), M.paint, 0, DISH_D + 0.1, 0, Math.PI / 2, 0, a0); for (const r of [DISH_R - 0.9, DISH_R + 1.9]) add(d, torus(r, 0.35, arc + 0.06, 16), M.inkLine, 0, DISH_D + 0.1, 0, Math.PI / 2, 0, a0 - 0.03); } // a team arc on the lower (south) rim, between ink arcs
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) cyanLed(q, M, 0.8, Math.cos(a) * (DISH_R + 0.5), DISH_D + 1.0, -Math.sin(a) * (DISH_R + 0.5)); // marker lights on the rim
  add(d, cyl(2.4, 1.8, 3, 12), M.joint, 0, -1.8, 0);                                                                                   // the back's boss on the trunnion
  for (const sx of [-1, 1]) limb(g, [DX + sx * 14, PY + 4 + 3.5, DZ - 14], [DX + sx * 19, 1.5, DZ - 24], 0.75, M.oak);                     // oak struts bracing the back to the ground
  const F = DISH_R * DISH_R / (4 * DISH_D);                                                                                              // the focus, up the axis
  const horn = grp(); horn.position.set(0, F, 0); q.add(horn);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 2; limb(q, [Math.cos(a) * DISH_R * 0.92, DISH_D * 0.85, Math.sin(a) * DISH_R * 0.92], [Math.cos(a) * 1.2, F - 1.5, Math.sin(a) * 1.2], 0.35, M.steel); } // the horn's struts
  add(horn, rbox(3.4, 4.2, 3.4, 0.5), M.panelDark, 0, 0.4, 0); add(horn, torus(1.7, 0.45, Math.PI * 2, 20), M.neon, 0, -1.9, 0, Math.PI / 2, 0, 0); cyanLed(horn, M, 1.2, 0, -2.4, 0); // the feed horn, a cyan ring and light looking into the bowl
  q.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  cable(g, M, [DX + 2, PY + 6, DZ + 2], [DX + 3.6, 3.6, DZ + 2], 0.35); cable(g, M, [DX - 3.6, 4, DZ - 2], [HX + HW / 2 + 0.6, 5, HZ + 3], 0.45);
  solar(g, M, 36, -14, 14, 10, 4); cable(g, M, [36, 8, -10], [DX + 3, 4, DZ - 6], 0.4);
  add(g, cyl(2.8, 2.8, 2.2, 14), M.oakPale, -30, 4.4, 26, 0, 0, Math.PI / 2); add(g, cyl(2.0, 2.0, 2.5, 12), M.cable, -30, 4.4, 26, 0, 0, Math.PI / 2); // a cable drum, south-west
  flag(g, M, HX - HW / 2 - 3, 1.6, HZ - HD / 2 - 3, 36, 22, 15); flag(g, M, 40, 1.6, -26, 28, 16, 11);
  if (M.polish) { // secondary detail: bolt rings on the yoke, a steel cap on the pedestal, steel feet on the struts, a gutter on the hut
    for (const sx of [-1, 1]) add(g, torus(1.6, 0.25, 12), M.steel, DX + sx * 4.3, PY + 4, DZ, 0, Math.PI / 2, 0);
    add(g, cyl(4.0, 4.0, 1.0, 14), M.paleSteel, DX, PY - 0.2, DZ);
    for (const sx of [-1, 1]) add(g, rbox(2.4, 1.2, 2.4, 0.3), M.joint, DX + sx * 19, 1.6, DZ - 24);
    gutter(g, M, HX, HH + 2.4, HZ + HD / 2 + 3.2, HW + 5, 1, 3.2);
  }
  return g;
}
