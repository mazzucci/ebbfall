// The Expedition (the re-theme's stranded 2026 tech company, standing in for the Vael in the comparison picture; not in
// the atlas: retheme.js renders it by filter). Stelian's rule (2026-11-10): modern components, medieval materials.
// Only small things came through time (bots, drones, electronics, a few tools and weapons: the Traveller's and the
// Marine's kit, the Buggy); everything big is built on site from local timber, stone, rope and canvas, with cables,
// LEDs, panels and fans added. No concrete, no containers, no roads, no fuel. The side parts from the kingdom by its
// modern parts: flat rounded shells, panels, fans, cables, small cool lights (the only lights in the picture), team
// paint on panels between dark trim; its hall is lower, longer and flatter than the castle. Three finishes on one set
// of shapes (`makeExpeditionMats(tc, v)`), the units included (round 2's judge: the options barely differed): A
// limewash and pale canvas (off-white composite bots, a limewashed stone hall under pale canvas, grey-tan fatigues);
// B olive canvas and dark timber (olive bots, grey fieldstone in a dark oak frame under olive canvas, olive
// fatigues); C black iron and timber (black bots with aluminium edges, fieldstone in an oak frame under tarred black
// canvas, charcoal fatigues). Same conventions as models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { makeMats, team } from './materials.js';
import { torus } from './harbour.js';
import { cone } from './vael.js';
import { tex, ashlarTex, ashlarBump, plankTex, plankBump, earthTex, gable, oct } from './kingdom.js';

let seed = 71; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Composite shell: a pale panel with faint seams, a few fasteners, dust streaks and scuffs; patched here and there. */
const shellTex = tex(256, (g, n) => {
  g.fillStyle = '#e4e2dc'; g.fillRect(0, 0, n, n); seed = 71;
  for (let i = 0; i < 3000; i++) { const v = 190 + rnd() * 60; g.fillStyle = `rgba(${v},${v - 2},${v - 8},0.25)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(40,40,44,0.6)'; g.lineWidth = 1.5;
  for (const p of [0, 96, 160]) { g.beginPath(); g.moveTo(p + 0.5, 0); g.lineTo(p + 0.5, n); g.stroke(); } for (const p of [0, 64, 192]) { g.beginPath(); g.moveTo(0, p + 0.5); g.lineTo(n, p + 0.5); g.stroke(); }
  g.fillStyle = 'rgba(30,30,34,0.6)'; for (const [x, y] of [[8, 8], [88, 8], [168, 8], [8, 56], [88, 56], [8, 184], [168, 184], [248, 120]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,90,60,${0.05 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 2 + rnd() * 5, 8 + rnd() * 26, 0, 0, 7); g.fill(); } // dust streaks, down
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(60,55,50,${0.15 + rnd() * 0.25})`; g.fillRect(rnd() * n, rnd() * n, 3 + rnd() * 14, 1 + rnd() * 2); } // scuffs
  g.fillStyle = 'rgba(140,130,110,0.35)'; g.fillRect(100, 70, 50, 40); g.fillRect(20, 200, 40, 30);                 // patches of another shade
}, { repeat: 2 });
/** Wattle and daub: limewashed panels, hairline cracks, a damp foot. */
const daubTex = tex(128, (g, n) => {
  g.fillStyle = '#ece6d8'; g.fillRect(0, 0, n, n); seed = 83;
  for (let i = 0; i < 3000; i++) { const v = 200 + rnd() * 55; g.fillStyle = `rgba(${v},${v - 4},${v - 14},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(90,80,60,0.35)'; g.lineWidth = 0.8;
  for (let i = 0; i < 8; i++) { const x = rnd() * n, y = rnd() * n; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 20 - 10, y + 10 + rnd() * 20); g.stroke(); }
  for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(110,95,70,${0.05 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 16, 4 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); }
}, { repeat: 2 });
/** A rack's front: a column of dark slots with a tiny lit dot each. */
const rackTex = tex(64, (g, n) => {
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, n, n);
  for (let y = 4; y < n; y += 8) { g.fillStyle = '#1c1d20'; g.fillRect(6, y, n - 12, 5); g.fillStyle = '#2c2e32'; g.fillRect(8, y + 1, n - 16, 1); }
});

/** The Expedition's one look (the slice, round 2, 2026-11-10): charcoal kit. Charcoal composite shells with dark
 *  edging (lifted from black: the slice's first judge saw black blobs with team rectangles), charcoal helmets and
 *  caps a shade darker than the bodies, fatigues a shade lighter, no white bodies: each unit carries one small pale
 *  mark instead (a helmet LED, headlights, pale wheels, a pale weapon); team on each unit's largest panel. The hall
 *  of the cool grey stone of slate country in a dark oak frame under dark planks. */
export const EXPEDITION_LOOK = { name: 'charcoal kit', panel: 0x62665f, panelDark: 0x44484a, edge: 0x2a2c2e, metal: 0.3, rough: 0.6, canvas: 0x8a8068, wall: 0x80828a, frame: 0x3e3226, uniform: 0x6e7268, armour: 0x383a3e };
export const EXPEDITION_PALETTES = { A: EXPEDITION_LOOK };
/** The Expedition's materials, over the Harbour's set (its timber, rope, ink and canvas weave are reused). `paint` is
 *  the team: paint on a panel, matte, between `inkLine` trim. */
export function makeExpeditionMats(tc) {
  const P = EXPEDITION_LOOK, M = makeMats(tc), std = (o) => new THREE.MeshStandardMaterial(o);
  M.panel = std({ color: P.panel, map: shellTex, metalness: P.metal, roughness: P.rough });                        // the shells, weathered
  M.panelDark = std({ color: P.panelDark, map: shellTex, metalness: P.metal, roughness: P.rough + 0.1 });          // undersides, patches, housings
  M.trim = std({ color: P.edge, roughness: 0.6, metalness: 0.2 });                                                 // the shells' edging, joints, wheel arches
  M.joint = std({ color: 0x2a2c30, roughness: 0.7, metalness: 0.2 });                                                // dark joints
  M.steel = std({ color: 0x70767c, metalness: 0.85, roughness: 0.35 });                                             // bare steel: arms, cages
  M.paleSteel = std({ color: 0xa8acb0, metalness: 0.7, roughness: 0.4 });                                            // the pale marks: a bull bar, a weapon's furniture, wheel hubs (pale grey, not white)
  M.tyre = std({ color: 0x4a4c4a, map: M.rubber.map, roughness: 0.9, metalness: 0.05 });                            // tyres lighter than the body
  M.white = std({ color: 0xe2e0da, metalness: 0.1, roughness: 0.6 });                                                // the fans' blades and rings only
  M.glass = std({ color: 0x10161e, metalness: 0.7, roughness: 0.12 });                                             // dark glass: solar panels, windows
  M.visor = std({ color: 0xd8dcd8, emissive: 0x909890, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.15 });   // a goggle's glint, a screen: neutral
  M.hivis = std({ color: 0x9a9c94, roughness: 0.5 });                                                               // reflective bands, dull in daylight
  M.led = std({ color: 0xf4f6f4, emissive: 0xf0f4f0, emissiveIntensity: 3.0 });                                     // a small light, neutral white (the PM; never orange: seat 0 is gold)
  M.ledHalo = new THREE.MeshBasicMaterial({ color: 0xe8ece8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
  M.paint = team(std({ color: tc.paint, map: shellTex, metalness: 0.2, roughness: 0.55 }));                         // the team: paint on panels
  M.paintCloth = team(std({ color: tc.paint, map: M.canvas.map, roughness: 0.9, metalness: 0.02 }));                // the team on canvas: flags, banners
  M.paintLED = team(std({ color: tc.paint, emissive: tc.paint, emissiveIntensity: 0.8 }), 0.7);                    // thin team light strips on the racks
  M.paintOak = team(std({ color: tc.paint, map: M.timber.map, roughness: 0.8, metalness: 0.05 }));                  // (kept for the frame; unused since the slice)
  M.rack = std({ color: 0x8a8c90, map: rackTex, metalness: 0.4, roughness: 0.5 });                                 // a server rack's slotted front
  M.rackSide = std({ color: 0x3e4044, metalness: 0.5, roughness: 0.45 });
  M.cable = std({ color: 0x15161a, roughness: 0.6, metalness: 0.1 });
  M.canvasLocal = std({ color: P.canvas, map: M.canvas.map, roughness: 0.92 });                                     // the locals' canvas, dulled
  M.oak = std({ color: P.frame, map: M.timber.map, roughness: 0.85 });                                              // the hall's frame, dark oak
  M.oakPale = std({ color: 0x7a5e40, map: M.timber.map, roughness: 0.85 });
  M.wall = std({ color: P.wall, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });            // the castle's own slate-grey ashlar (the buildings family: the judge saw no stone)
  M.roofDark = std({ color: 0x847f76, map: plankTex, bumpMap: plankBump, bumpScale: 1.0, roughness: 0.9 });        // the roofs: weathered grey planks, a step down from round 3's silver (the buildings family: six pale roofs read alike and were the brightest planes)
  M.wallPale = std({ color: 0xaeb2b6, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });      // the pale stone gable ends that face the camera
  M.stone = std({ color: 0x6e6458, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });         // a footing course of darker stone
  M.earth = std({ color: 0x5c5a54, map: earthTex, roughness: 1 });                                                  // trodden earth, grey-brown as the castle's (the warm brown read as dirt under no building)
  M.deck = std({ color: 0x7a6448, map: plankTex, bumpMap: plankBump, bumpScale: 0.8, roughness: 0.9 });            // a plank floor
  M.gold = std({ color: 0xf0c850, metalness: 0.6, roughness: 0.35 });                                               // coins: a light yellow, gold is the coins' alone
  M.glint = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });
  M.uniform = std({ color: P.uniform, roughness: 0.9 });                                                            // fatigues
  M.armour = std({ color: P.armour, roughness: 0.65, metalness: 0.15 });                                             // helmets, caps, knee pads, pouches: near black
  M.gun = std({ color: 0x1e1f23, metalness: 0.6, roughness: 0.4 });
  M.gunTan = std({ color: 0xa8acb0, roughness: 0.6, metalness: 0.3 });                                              // a rifle's furniture: the Marine's pale mark
  M.skin = std({ color: 0xc89a74, roughness: 0.8 });
  M.boot = std({ color: 0x1e1a18, roughness: 0.8 });
  return M;
}

/** A small cool LED with a soft halo. */
export function led(parent, M, r, x, y, z) {
  add(parent, sph(r, 8, 6), M.led, x, y, z); add(parent, sph(r * 2.2, 8, 6), M.ledHalo, x, y, z);
}
/** A team panel: a flat team plate `w` x `d` lying in xz, `t` thick, inside an ink trim a hair proud of it. */
export function teamPlate(parent, M, w, t, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const p = grp(); p.position.set(x, y, z); p.rotation.set(rx, ry, rz); parent.add(p);
  add(p, rbox(w + 0.6, t * 0.8, d + 0.6, 0.15), M.inkLine, 0, -t * 0.1, 0);
  add(p, rbox(w, t, d, 0.25), M.paint, 0, 0.02, 0);
  return p;
}

/** Bot (the worker, sim r 9): a flat wheeled box with a small arm, as Stelian's list says: a charcoal shell wider
 *  than tall on four wheels out at its corners with pale hubs (its pale mark), the team deck over its back inside
 *  dark trim, a cool LED strip at the bow; a shallow tray on the stern with a flat layer of gold coins (the worker's
 *  loud load, a tray, not a ball); out of the bow a short steel arm ending in a pale scoop held low ahead. A low, wide
 *  machine, never a man on a cart. From the camera: a wide rounded rectangle with a team middle, a gold tray on its
 *  back, pale wheels at its corners, a short grey arm ahead. Frames 0-1: the arm bobs. */
export function utilityBot(M, f) {
  const g = grp(), b = grp(); g.add(b);
  add(b, rbox(14, 3.0, 11.0, 1.2), M.panel, 0, 3.3, 0);                                       // the shell: wider than tall
  add(b, rbox(14.4, 1.0, 11.4, 0.5), M.trim, 0, 2.0, 0);                                       // the dark skirt
  for (const [x, z] of [[-4.6, -5.8], [4.6, -5.8], [-4.6, 5.8], [4.6, 5.8]]) {                 // wheels out at the corners, pale hubs: the Bot's pale mark
    add(b, cyl(2.3, 2.3, 1.8, 16), M.tyre, x, 2.3, z, Math.PI / 2, 0, 0);
    add(b, cyl(1.3, 1.3, 1.9, 10), M.paleSteel, x, 2.3, z, Math.PI / 2, 0, 0);
  }
  add(b, rbox(8.0, 0.4, 9.6, 0.2), M.panelDark, 2.0, 4.9, 0);                                   // the deck, charcoal (no team slab: the PM)
  for (const z of [-4.3, 4.3]) { add(b, rbox(8.2, 0.5, 1.4, 0.1), M.paint, 2.0, 5.1, z); add(b, rbox(8.4, 0.2, 1.6, 0.05), M.inkLine, 2.0, 5.3, z); } // team stripes along the deck's edges
  add(b, rbox(14.2, 2.0, 11.2, 0.3), M.paint, 0, 3.0, 0); add(b, rbox(14.3, 0.3, 11.3, 0.1), M.inkLine, 0, 4.1, 0); add(b, rbox(14.3, 0.3, 11.3, 0.1), M.inkLine, 0, 1.9, 0); // the team stripe round the flanks between trims
  add(b, rbox(1.0, 1.0, 9.0, 0.3), M.joint, 7.0, 4.6, 0); add(b, rbox(1.1, 0.5, 9.2, 0.1), M.paint, 7.0, 5.3, 0); add(b, rbox(1.2, 0.2, 9.4, 0.05), M.inkLine, 7.0, 5.6, 0); // the light bar at the bow, its guard team
  for (const z of [-3.2, 0, 3.2]) led(b, M, 0.5, 7.6, 4.6, z);
  add(b, cyl(0.7, 0.7, 6.0, 8), M.joint, -6.0, 7.6, 4.6);                                       // an antenna (thin props drawn twice their thickness)
  add(b, plate([[0, -2.4], [7, -0.6], [7, 0.6], [0, 2.4]], 0.3, 0.1), M.paintCloth, -5.7, 10.2, 4.6, Math.PI / 2, 0, 0); // a team pennant on it
  add(b, rbox(1.2, 1.4, 11.0, 0.3), M.paint, 7.4, 2.4, 0); add(b, rbox(1.3, 0.3, 11.2, 0.1), M.inkLine, 7.4, 3.2, 0); add(b, rbox(1.3, 0.3, 11.2, 0.1), M.inkLine, 7.4, 1.6, 0); // the front bumper, team between trims
  // the tray on the stern: shallow and wide, a flat layer of coins in it
  const tr = grp(); tr.position.set(-3.6, 4.8, 0); b.add(tr);
  add(tr, rbox(6.6, 1.6, 10.2, 0.3), M.panelDark, 0, 0.8, 0);
  add(tr, rbox(6.8, 0.4, 10.4, 0.1), M.inkLine, 0, 1.6, 0);                                     // its rim
  add(tr, rbox(5.8, 0.6, 9.4, 0.2), M.gold, 0, 1.75, 0);                                        // the coins, a flat gold layer
  add(tr, rbox(6.2, 0.3, 9.8, 0.1), M.inkLine, 0, 1.72, 0);                                     // a dark rim under its edge
  add(tr, sph(0.5, 8, 6), M.glint, 1.0, 2.5, -2.0); add(tr, sph(0.4, 8, 6), M.glint, -1.4, 2.4, 2.6); // white glints
  for (const [x, z] of [[1.6, 2.4], [-1.4, -3.0], [0.4, 0.2], [-1.8, 3.6], [1.9, -1.8], [0.2, -4.0]]) add(tr, cyl(0.9, 0.9, 0.35, 10), M.gold, x, 2.2, z, (x - z) * 0.1, x, 0.1);
  // the arm: a turret on the bow, a steel upper arm and forearm reaching ahead and down to a scoop
  const arm = grp(); arm.position.set(5.4, 4.8, 0); b.add(arm);
  add(arm, cyl(1.4, 1.6, 1.4, 12), M.joint, 0, 0, 0);
  const bob = (f % 2) * 0.5;
  limb(arm, [0, 0.6, 0], [2.6, 3.0 - bob, 0], 0.9, M.steel);
  add(arm, sph(1.1, 10, 8), M.joint, 2.6, 3.0 - bob, 0);
  limb(arm, [2.6, 3.0 - bob, 0], [6.0, 0.0, 0], 0.8, M.steel);
  add(arm, rbox(2.6, 1.6, 4.0, 0.3), M.paleSteel, 6.8, -0.6, 0, 0, 0, -0.5);                    // the scoop, pale
  return g;
}

/** Robot dog (line infantry, sim r 10-11): four legs, low and quick, as the list says: a rounded shell 12 long on four
 *  short splayed legs of two segments each (dark joints, pale shins), the knees out past the shell so four legs show
 *  from the camera in every facing, a rounded sensor head of its own at the bow (a dome with a glinting visor band
 *  and two small antennas: round 2's judge read the block head as Boston Dynamics' Spot), a team saddle panel on the
 *  back inside black trim, team sleeves on the thighs. From the camera: a low pale oval with a team middle and legs
 *  out either side: a quadruped, never a figure. Frames 0-1 the trot (diagonal pairs). */
export function robotDog(M, f) {
  const g = grp(), st = f % 2 ? -1 : 1;
  const b = grp(); b.position.y = 5.8; g.add(b);
  add(b, rbox(12, 3.4, 5.0, 1.6), M.panel, 0, 0, 0);                                           // the shell
  add(b, rbox(12.4, 1.0, 5.4, 0.4), M.trim, 0, -1.6, 0);                                       // its belly plate, the finish's edging
  teamPlate(b, M, 7.2, 0.6, 3.6, -0.8, 1.95, 0);                                               // the saddle panel
  add(b, rbox(2.0, 1.6, 2.2, 0.4), M.panelDark, -4.8, 1.6, 0);                                 // a module on the rump
  add(b, cyl(0.4, 0.4, 3.6, 6), M.joint, -5.4, 3.6, 0.8);                                      // an antenna
  // the head: a dome on a short neck, a visor band round its front, two small antennas, a LED under the chin
  add(b, cyl(1.2, 1.4, 1.6, 10), M.joint, 6.2, 0.6, 0, 0, 0, -0.5);                            // the neck
  add(b, sph(2.3, 14, 10), M.panel, 7.6, 1.4, 0).scale.set(1.1, 0.85, 1);                       // the dome
  add(b, cyl(2.45, 2.45, 0.9, 16), M.visor, 7.6, 1.3, 0).scale.set(1.1, 1, 1);                 // the visor band, a glint
  add(b, cyl(2.5, 2.5, 0.25, 16), M.inkLine, 7.6, 1.85, 0).scale.set(1.1, 1, 1); add(b, cyl(2.5, 2.5, 0.25, 16), M.inkLine, 7.6, 0.75, 0).scale.set(1.1, 1, 1);
  for (const z of [-1.2, 1.2]) add(b, cyl(0.25, 0.25, 2.4, 6), M.joint, 6.8, 3.6, z, 0.3 * Math.sign(z), 0, 0.3); // antennas
  led(b, M, 0.5, 9.2, 0.2, 0);
  // the legs: hips at the shell's corners, short thighs out and down, knees past the shell, shins down to round feet
  for (const [x, side, fore] of [[4.2, -1, 1], [4.2, 1, 1], [-4.2, -1, 0], [-4.2, 1, 0]]) {
    const z = side * 2.4, sw = (fore ? 1 : -1) * st * 1.4, kx = x + sw, kz = side * 4.4;
    add(b, cyl(0.9, 0.9, 1.4, 10), M.joint, x, -0.8, z, Math.PI / 2, 0, 0);                     // the hip joint
    limb(b, [x, -0.8, z], [kx, -3.0, kz], 0.95, M.paint);                                        // the thigh, team
    add(b, sph(1.0, 8, 6), M.inkLine, kx, -3.0, kz);                                             // the knee, ink: the thigh's hem
    limb(b, [kx, -3.0, kz], [x - sw * 0.4, -5.2, side * 3.4], 0.75, M.panel);                    // the shin, pale
    add(b, sph(0.85, 8, 6), M.rubber, x - sw * 0.4, -5.3, side * 3.4);                           // the foot
  }
  return g;
}

/** Traveller (the worker, sim r 9, scale 0.95): a person from the future who builds: practical work clothes, a white
 *  hard hat with a small headlamp LED, a team work vest with reflective hi-vis bands between ink hems, a tool belt
 *  with pouches, boots, a scanner in the right hand, and the worker's big cue: a bright white hard case carried out
 *  to the left side (round 3: out to the side as a bright block) with a team band and a tablet on its lid. From the
 *  camera: a white disc with a white block beside it: a worker, not the dark-helmeted Marine nor the Villager. */
export function traveller(M, f) {
  const g = grp(), st = [3.2, -3.2][f % 2];
  for (const side of [-1, 1]) {                                                                 // team work trousers (the company's colours, as the vest)
    const z = side * 2.1, s = st * side;
    add(g, rbox(3.4, 1.5, 2.2, 0.6), M.boot, s + 0.5, 0.75, z);
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, z * 1.05], 1.2, M.paint);
    limb(g, [s * 0.55, 3.4, z * 1.05], [s, 1.3, z], 1.05, M.paint);
  }
  const b = grp(); g.add(b); b.rotation.z = -0.08;
  add(b, rbox(5.0, 6.2, 6.6, 1.5), M.uniform, 0, 10.2, 0);                                     // the jacket
  add(b, rbox(5.6, 4.2, 7.2, 0.6), M.paint, 0.1, 10.6, 0);                                     // the work vest, team
  add(b, rbox(5.9, 0.5, 7.5, 0.1), M.inkLine, 0.1, 12.8, 0); add(b, rbox(5.9, 0.5, 7.5, 0.1), M.inkLine, 0.1, 8.4, 0); // its hems
  add(b, rbox(5.8, 0.9, 7.4, 0.1), M.hivis, 0.1, 10.6, 0);                                      // a reflective band round it: hi-vis
  for (const z of [-2.2, 2.2]) add(b, rbox(5.8, 4.4, 0.8, 0.1), M.hivis, 0.1, 10.6, z);          // and two over the shoulders
  add(b, rbox(5.4, 1.0, 7.0, 0.3), M.joint, 0, 7.6, 0);                                        // the tool belt
  for (const [x, z] of [[-2.6, 2.2], [-2.6, -2.2], [1.8, -3.4]]) add(b, rbox(1.6, 2.2, 1.6, 0.4), M.armour, x, 6.8, z); // its pouches
  add(b, cyl(0.5, 0.5, 4.5, 8), M.steel, -2.4, 6.2, 3.6, 0.3, 0, 0.2);                          // a hammer's handle in the belt
  add(b, sph(1.8, 12, 10), M.skin, 0.8, 13.3, 0).scale.set(0.85, 1, 0.9);                      // the head
  add(b, sph(2.7, 16, 12), M.armour, 0.1, 14.4, 0).scale.set(1, 0.7, 1);                       // a dark cap (the slice: no white on the Expedition)
  add(b, cyl(3.1, 3.1, 0.5, 18), M.armour, 0.1, 13.5, 0);                                      // its brim
  add(b, cyl(3.2, 3.2, 0.3, 18), M.inkLine, 0.1, 13.2, 0);                                     // the dark line under it
  led(b, M, 0.5, 2.8, 14.2, 0);                                                                // the headlamp
  // the case: carried out to the left side in one hand, a bright white block with a team lid band, a tablet on it
  const cs = grp(); cs.position.set(1.0, 5.6, -6.6); cs.rotation.y = 0.1; b.add(cs);
  add(cs, rbox(9.0, 5.4, 4.2, 0.9), M.panelDark, 0, 0, 0);
  add(cs, rbox(9.3, 1.6, 4.5, 0.2), M.paint, 0, 1.4, 0); add(cs, rbox(9.4, 0.3, 4.6, 0.05), M.inkLine, 0, 2.3, 0); add(cs, rbox(9.4, 0.3, 4.6, 0.05), M.inkLine, 0, 0.5, 0); // the team band under the lid, between ink lines
  teamPlate(cs, M, 8.2, 0.5, 3.4, 0, 2.9, 0);                                                   // the team lid
  add(cs, rbox(3.6, 0.4, 2.2, 0.1), M.glass, 1.4, 3.3, 0); add(cs, rbox(3.2, 0.2, 1.8, 0.1), M.visor, 1.4, 3.5, 0); // the tablet on the lid
  add(cs, rbox(2.4, 0.8, 1.2, 0.3), M.joint, -3.0, 3.0, 0);                                     // the handle
  limb(b, [0.6, 11, -3.6], [0.8, 8.0, -6.2], 1.1, M.paint); add(b, sph(0.9, 8, 6), M.armour, 0.8, 7.8, -6.4); // the left hand on the handle; team sleeves
  limb(b, [0.6, 11, 3.6], [3.2, 9.2, 2.4], 1.1, M.paint); add(b, sph(0.9, 8, 6), M.armour, 3.5, 9.0, 2.2);  // the right hand holding a scanner ahead
  add(b, rbox(2.2, 1.2, 1.4, 0.3), M.joint, 4.6, 9.2, 2.0); add(b, rbox(1.4, 0.3, 1.0, 0.1), M.visor, 4.6, 9.9, 2.0);
  g.scale.setScalar(0.95);
  return g;
}

/** Buggy (the fast raider, light vehicle, sim r 12-13): an electric off-road buggy, long and low (longer than tall,
 *  longer than wide): a charcoal tub with the team body panel and bonnet inside dark trim, four big tyres lighter
 *  than the body with pale hubs, a low steel roll cage over the two seats with a team roof panel, two cool LED
 *  headlights on the bonnet, a pale grey bull bar out ahead (its pale mark), a battery pack behind the seats, a
 *  whip antenna. From the camera: a long rectangle with four grey wheels, two lights and a pale bar at its front: a
 *  vehicle, never a figure or a block. Frames 0-1: the hubs' marks turn. */
export function buggy(M, f) {
  const g = grp(), b = grp(); b.position.y = 3.0; g.add(b);
  add(b, rbox(22, 2.2, 10, 0.9), M.trim, 0, 0, 0);                                             // the chassis tub
  add(b, rbox(21.2, 1.2, 9.4, 0.5), M.panel, 0, 1.5, 0);                                       // the body panel over it, charcoal (no team slab)
  add(b, rbox(7.0, 1.2, 8.8, 0.5), M.panel, 7.2, 2.3, 0, 0, 0, -0.1);                            // the bonnet, sloping down ahead
  add(b, rbox(4.0, 0.4, 3.0, 0.2), M.paleSteel, 7.4, 3.0, 0, 0, 0, -0.1);                        // a pale panel mark on the bonnet
  for (const z of [-5.0, 5.0]) { add(b, rbox(18, 2.0, 0.6, 0.1), M.paint, -1, 1.4, z); add(b, rbox(18.2, 0.25, 0.65, 0.05), M.inkLine, -1, 2.5, z); add(b, rbox(18.2, 0.25, 0.65, 0.05), M.inkLine, -1, 0.3, z); } // a team stripe along each door, between trims
  for (const z of [-5.0, 5.0]) { add(b, rbox(16, 0.5, 1.2, 0.1), M.paint, -1, 2.3, z * 0.86); add(b, rbox(16.2, 0.2, 1.4, 0.05), M.inkLine, -1, 2.5, z * 0.86); } // and along the body's top edges
  for (const z of [-2.8, 2.8]) led(b, M, 0.6, 11.0, 2.6, z);                                     // the headlights, white
  add(b, rbox(5.6, 2.2, 7.6, 0.6), M.panelDark, -7.6, 2.4, 0);                                  // the battery pack behind the seats
  for (const z of [-1.9, 1.9]) { add(b, rbox(3.0, 1.2, 3.0, 0.5), M.paint, -1.4, 2.4, z); add(b, rbox(1.0, 3.2, 3.0, 0.5), M.paint, -3.0, 4.0, z); add(b, rbox(1.1, 0.3, 3.2, 0.05), M.inkLine, -3.0, 5.7, z); } // two seats with team pads
  for (const [x, z] of [[-7.0, -6.4], [7.0, -6.4], [-7.0, 6.4], [7.0, 6.4]]) {                 // the wheels: big tyres lighter than the body, pale hubs, out past the tub
    add(b, cyl(3.8, 3.8, 3.0, 18), M.tyre, x, 0.8, z, Math.PI / 2, 0, 0);
    add(b, cyl(1.9, 1.9, 3.1, 10), M.paleSteel, x, 0.8, z, Math.PI / 2, 0, 0);
    add(b, rbox(2.8, 0.5, 3.2, 0.1), M.joint, x, 0.8, z, Math.PI / 2, (f % 2) * 0.6, 0);         // a spoke mark that turns by frame
    add(b, rbox(3.6, 0.9, 2.8, 0.3), M.joint, x, 1.2, z * 0.78);                                 // the wishbone out to it
  }
  // the roll cage, low: four tubes up from the tub to a roof frame, a team roof panel on it
  const cage = M.steel;
  for (const [x, z] of [[-5.0, -3.6], [1.2, -3.6], [-5.0, 3.6], [1.2, 3.6]]) limb(b, [x, 1.4, z], [x * 0.92, 6.6, z * 0.9], 0.45, cage);
  for (const z of [-3.2, 3.2]) limb(b, [-4.6, 6.6, z], [1.1, 6.6, z], 0.45, cage);
  for (const x of [-4.6, 1.1]) limb(b, [x, 6.6, -3.2], [x, 6.6, 3.2], 0.45, cage);
  add(b, rbox(5.6, 0.4, 6.4, 0.2), M.panelDark, -1.75, 6.9, 0);                                 // the roof panel, charcoal
  add(b, rbox(1.0, 1.0, 7.0, 0.3), M.joint, 1.3, 7.3, 0); add(b, rbox(1.1, 0.5, 7.2, 0.1), M.paint, 1.3, 8.0, 0); add(b, rbox(1.2, 0.2, 7.4, 0.05), M.inkLine, 1.3, 8.3, 0); // the light bar on the cage's front edge, its guard team
  for (const z of [-2.4, -0.8, 0.8, 2.4]) led(b, M, 0.42, 1.7, 7.4, z);
  add(b, cyl(0.5, 0.5, 8, 6), M.joint, -4.6, 10.6, -3.2); add(b, plate([[0, -3.0], [9, -0.8], [9, 0.8], [0, 3.0]], 0.3, 0.1), M.paintCloth, -4.3, 14.2, -3.2, Math.PI / 2, 0, 0); // a team flag on the cage
  // the bull bar ahead, pale steel; the antenna; a spare wheel on the back
  const bar = M.paleSteel;
  limb(b, [13.6, 1.2, -5.0], [13.6, 1.2, 5.0], 0.6, bar); limb(b, [13.6, 3.6, -4.0], [13.6, 3.6, 4.0], 0.6, bar);
  for (const z of [-4.0, 4.0]) limb(b, [13.6, 0.2, z], [13.6, 4.4, z], 0.5, bar);
  for (const z of [-3.2, 3.2]) limb(b, [10.8, 2.0, z], [13.6, 2.2, z], 0.45, M.steel);           // its stays back to the chassis
  add(b, cyl(0.6, 0.6, 7, 6), M.joint, -9.6, 6, 3.6);                                            // the whip antenna, drawn thick
  add(b, rbox(1.2, 1.6, 10.4, 0.3), M.paint, -11.4, 1.0, 0); add(b, rbox(1.3, 0.3, 10.6, 0.1), M.inkLine, -11.4, 1.9, 0); add(b, rbox(1.3, 0.3, 10.6, 0.1), M.inkLine, -11.4, 0.1, 0); // the rear bumper, team between trims
  add(b, cyl(2.6, 2.6, 1.6, 16), M.tyre, -12.6, 3.4, 0, 0, 0, Math.PI / 2); add(b, cyl(1.3, 1.3, 1.8, 10), M.paleSteel, -12.6, 3.4, 0, 0, 0, Math.PI / 2);
  return g;
}

/** Marine (the signature unit, line class, sim r 10-11, scale 1.08): a modern elite soldier from the future, the
 *  iconic silhouette: a dark rounded helmet with goggles pushed up on it (a glint), a team plate carrier over
 *  fatigues, pouches, knee pads, boots, a big backpack with a radio antenna, and a short rifle held level across the
 *  body (round 2's judge: angled up and long, it read as another spearman). No insignia, no bulk: a man, not a suit.
 *  From the camera: a dark disc with a pale glint beside a team rectangle (carrier and pack) with a short level bar
 *  across it: a rectangle, not a dot with a stick. Frames 0-1 the march. */
export function marine(M, f) {
  const g = grp(), st = [3.2, -3.2][f % 2];
  for (const side of [-1, 1]) {                                                                 // a wide stance (round 3)
    const z = side * 2.1, s = st * side, zf = side * 3.4;
    add(g, rbox(3.6, 1.6, 2.3, 0.6), M.boot, s + 0.6, 0.8, zf);
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, zf * 0.95], 1.25, M.uniform);
    limb(g, [s * 0.55, 3.4, zf * 0.95], [s, 1.3, zf], 1.1, M.uniform);
    add(g, sph(1.1, 8, 6), M.paint, s * 0.6, 3.6, zf * 0.95).scale.set(1.1, 1, 0.9);            // a team knee pad
  }
  const b = grp(); g.add(b);
  add(b, rbox(5.0, 6.4, 6.6, 1.5), M.uniform, 0, 10.2, 0);                                     // the torso
  add(b, rbox(5.4, 4.6, 6.2, 0.6), M.armour, 0.4, 10.4, 0);                                    // a slim plate carrier, charcoal (no torso slab: the PM; the block read as a space suit)
  add(b, rbox(5.6, 0.4, 6.4, 0.1), M.inkLine, 0.4, 12.8, 0); add(b, rbox(5.6, 0.4, 6.4, 0.1), M.inkLine, 0.4, 8.0, 0);
  for (const z of [-3.6, 3.6]) { add(b, rbox(3.2, 1.8, 3.2, 0.5), M.paint, 0.4, 13.4, z); add(b, rbox(3.4, 0.3, 3.4, 0.1), M.inkLine, 0.4, 12.4, z); } // team shoulder pads
  for (const z of [-1.8, 0, 1.8]) add(b, rbox(1.4, 1.8, 1.4, 0.3), M.armour, 3.0, 9.6, z);       // magazine pouches on the chest
  add(b, rbox(5.2, 0.9, 7.0, 0.3), M.armour, 0, 7.2, 0);                                        // the belt
  // the backpack: big and square on the back, a team lid plate inside ink trim, a bedroll under it, the antenna
  add(b, rbox(4.4, 7.0, 7.0, 0.9), M.armour, -4.6, 10.6, 0);
  add(b, rbox(3.6, 0.4, 6.2, 0.2), M.armour, -4.6, 14.2, 0);                                    // its lid, charcoal
  add(b, rbox(1.4, 7.2, 3.0, 0.2), M.paint, -6.9, 10.6, 0); add(b, rbox(1.5, 0.3, 3.2, 0.05), M.inkLine, -6.9, 14.3, 0); add(b, rbox(1.5, 0.3, 3.2, 0.05), M.inkLine, -6.9, 6.9, 0); // a team strip down the pack's back
  add(b, rbox(3.8, 1.2, 7.2, 0.2), M.paint, -4.6, 14.5, 0); add(b, rbox(4.0, 0.2, 7.4, 0.05), M.inkLine, -4.6, 13.85, 0); // and a team band round the pack's top
  add(b, cyl(1.2, 1.2, 6.6, 10), M.uniform, -4.8, 6.6, 0, Math.PI / 2, 0, 0);                   // the bedroll
  add(b, rbox(1.4, 2.4, 1.2, 0.3), M.joint, -6.0, 9.6, -2.4);                                   // a radio
  add(b, cyl(0.6, 0.6, 8, 6), M.joint, -6.0, 14.8, -2.4);                                       // its antenna, drawn thick
  add(b, sph(1.7, 12, 10), M.skin, 0.9, 13.3, 0).scale.set(0.8, 0.95, 0.9);                    // the face
  add(b, sph(2.7, 16, 12), M.armour, 0.1, 14.2, 0).scale.set(1, 0.85, 1);                      // the helmet, dark, rounded
  add(b, cyl(2.8, 2.8, 0.4, 16), M.inkLine, 0.1, 13.1, 0);                                     // its rim line
  add(b, rbox(2.2, 1.3, 4.4, 0.4), M.joint, 1.6, 15.0, 0);                                     // the goggles, pushed up on the helmet
  add(b, rbox(1.0, 0.9, 4.0, 0.2), M.led, 2.4, 15.1, 0);                                       // their lenses: a white visor LED, so the head parts from the body
  add(b, rbox(0.4, 0.8, 5.6, 0.1), M.joint, 0.2, 15.1, 0);                                      // their strap
  // the rifle: short, held level across the body ahead of the chest; a pale handguard and stock so the bar reads
  const gun = grp(); gun.position.set(3.6, 9.6, 0); gun.rotation.set(0, 0.3, 0.04); b.add(gun); // (level across the body; the pale furniture is the Marine's pale mark, a two-pixel bar at 1x)
  add(gun, rbox(4.2, 2.2, 2.2, 0.5), M.gunTan, -3.8, 0, 0);                                     // the stock, pale
  add(gun, rbox(4.0, 2.6, 2.4, 0.4), M.gun, 0.4, 0, 0);                                         // the receiver
  add(gun, rbox(1.4, 3.0, 1.3, 0.3), M.gun, 0.4, -2.2, 0);                                      // the magazine
  add(gun, rbox(1.1, 1.5, 1.1, 0.2), M.gun, -1.2, -1.4, 0);                                     // the grip
  add(gun, rbox(1.6, 1.0, 1.1, 0.2), M.gun, 0.6, 1.6, 0);                                       // the sight
  add(gun, rbox(6.4, 2.0, 2.1, 0.5), M.gunTan, 5.5, 0, 0);                                      // the handguard, long and pale
  add(gun, cyl(1.0, 1.0, 3.4, 8), M.paleSteel, 10.2, 0.2, 0, 0, 0, Math.PI / 2);                // the barrel, pale, drawn thick
  limb(b, [0.6, 11.4, 3.6], [2.4, 9.4, 1.8], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 2.6, 9.2, 1.6);  // the trigger hand, gloved
  limb(b, [0.6, 11.4, -3.6], [6.0, 9.8, -1.4], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 6.4, 9.8, -1.2); // the fore hand on the handguard
  for (const z of [-3.9, 3.9]) add(b, cyl(1.35, 1.35, 1.4, 10), M.paint, 1.2, 11.2, z, 0.3, 0, 0.4);                 // team armbands
  g.scale.setScalar(1.08);
  return g;
}

/** Data centre (the main building, 4x4; the slice, round 3; the buildings family's fixes): a hall running north-south
 *  so its pale stone gable faces the camera with the three big cooling fans set into it (dark grilles, pale blades, lit
 *  hubs: the hero, bigger now in a taller gable), an oak door under them and the one team banner over it; walls of the
 *  castle's own slate-grey ashlar, taller, with only the corner posts and a wall plate of dark oak lining them (the
 *  judge saw no stone under the framing), a weathered silver plank roof on a shorter hall with a louvred dormer; the
 *  east wing a lean-to of the same stone under a closed plank roof (the bare rafters read as unfinished), and the
 *  server racks out on a plank deck south of it in the open, charcoal with thin team light strips and a LED each; the
 *  company flag on the one mast with the dish, a cable tray with a team lip, cloths on the wing's south wall; a solar
 *  rack, crates, barrels, a trough; two travellers. Grey-brown trodden earth hugging the building. */
export function dataCentre(M) {
  const g = grp();
  const HX = -14, HZ = -4, HW = 42, HL = 64, HH = 20, RH = 12, SZ = HZ + HL / 2;                   // the hall along z; SZ its south gable
  const WX = HX + HW / 2 + 15, WZ = HZ - 10, WW = 30, WL = 44, WH = 12;                             // the wing east of it
  add(g, plate([[-58, -46], [50, -52], [62, -10], [58, 46], [10, 56], [-50, 50], [-60, 10]].map(([x, z]) => [x + 4, z + 2]), 2.0, 0.8), M.earth, 0, 0, 0); // trodden earth, hugging the building
  // the hall: footing, slate-grey ashlar walls, the pale gable ends, a weathered plank roof
  add(g, rbox(HW + 4, 3, HL + 4, 0.5), M.stone, HX, 3, HZ);
  add(g, rbox(HW, HH, HL, 0.6), M.wall, HX, HH / 2 + 3, HZ);
  for (const sz of [-1, 1]) add(g, gable(HW + 0.6, RH, 2.4), M.wallPale, HX, HH + 3, HZ + sz * (HL / 2 - 1.2));  // the pale stone gables, the south one to the camera
  add(g, rbox(HW + 1.4, HH + 0.4, 1.2, 0.2), M.wallPale, HX, HH / 2 + 3, SZ + 0.3);                                 // (the south end wall's full face, pale)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(2.0, HH + 0.4, 2.0, 0.3), M.oak, HX + sx * (HW / 2 + 0.2), HH / 2 + 3, HZ + sz * (HL / 2 + 0.2)); // corner posts
  add(g, rbox(HW + 2.4, 1.4, 1.4, 0.3), M.oak, HX, HH + 2.6, SZ + 1.0);                                              // the wall plate on the south face
  add(g, rbox(HW - 2, 2.6, 0.5, 0.1), M.paintCloth, HX, HH + 0.4, SZ + 1.4); for (const y of [HH + 1.9, HH - 1.1]) add(g, rbox(HW - 1.6, 0.4, 0.6, 0.05), M.inkLine, HX, y, SZ + 1.4); // a team valance under the wall plate
  add(g, rbox(1.3, RH + 0.6, 1.3, 0.3), M.oak, HX, HH + 3 + RH / 2, SZ + 1.1);                                       // the king post up the gable
  add(g, gable(HW + 6, RH, HL + 6), M.roofDark, HX, HH + 3.4, HZ);
  add(g, rbox(1.8, 1.8, HL + 7, 0.4), M.oak, HX, HH + 3.4 + RH + 0.6, HZ);                        // the ridge beam
  { const d = grp(); d.position.set(HX + 11, HH + 3.4 + RH - 7, HZ + 8); g.add(d);               // the ventilation dormer on the east slope
    add(d, rbox(10, 7, 9, 0.4), M.wallPale, 0, 3.5, 0); add(d, gable(11, 4.5, 10), M.roofDark, 0, 7, 0, 0, Math.PI / 2, 0);
    for (let k = 0; k < 4; k++) add(d, rbox(0.8, 0.6, 7, 0.1), M.joint, 5.2, 1.8 + k * 1.3, 0, 0, 0, 0.5); }
  // the fans in the south gable: three big round housings, dark grilles, pale blades, lit hubs; the door under the middle one, the banner over it
  for (let k = 0; k < 3; k++) {
    const fan = grp(); fan.position.set(HX - 14 + k * 14, HH - 1, SZ + 1.6); fan.rotation.x = Math.PI / 2; g.add(fan);
    add(fan, cyl(6.8, 6.8, 2.0, 24), M.joint, 0, 0.6, 0);
    add(fan, cyl(6.1, 6.1, 0.4, 24), M.panelDark, 0, 1.5, 0);
    for (let j = 0; j < 6; j++) add(fan, rbox(11.8, 0.25, 0.5, 0.1), M.joint, 0, 1.75, 0, 0, j * Math.PI / 6, 0);
    for (let j = 0; j < 3; j++) add(fan, rbox(10.8, 0.4, 2.4, 0.3), M.white, 0, 1.9, 0, 0, j * Math.PI / 3 + 0.2, 0);
    led(fan, M, 1.0, 0, 2.2, 0);
  }
  add(g, rbox(7, 8, 1.2, 0.4), M.oak, HX, 7, SZ + 1.4); for (const y of [4.5, 9]) add(g, rbox(7.4, 0.5, 0.4, 0.1), M.ironDark, HX, y, SZ + 2.1); // the door
  add(g, rbox(7.8, 9, 0.5, 0.1), M.inkLine, HX, 7.3, SZ + 1.2);
  for (const x of [-18, 18]) { add(g, rbox(2.6, 3.2, 1.0, 0.2), M.glass, HX + x, 7, SZ + 1.4); add(g, rbox(3.2, 3.8, 0.5, 0.1), M.inkLine, HX + x, 7, SZ + 1.2); } // windows
  { const p = grp(); p.position.set(HX, HH + 2.0, SZ + 2.4); g.add(p); add(p, rbox(0.6, 9, 16, 0.1), M.paintCloth, 0, -4.5, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 16.4, 0.05), M.inkLine, 0, -0.2, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 16.4, 0.05), M.inkLine, 0, -8.8, 0, 0, Math.PI / 2, 0); add(p, cyl(0.4, 0.4, 18, 8), M.oak, 0, 0.3, 0.2, 0, 0, Math.PI / 2); } // the one team banner, over the door
  // the wing east: a lean-to of the same stone under a closed plank roof sloping down to the east, its own oak posts
  add(g, rbox(WW + 4, 3, WL + 4, 0.5), M.stone, WX, 3, WZ);
  add(g, rbox(WW, WH, WL, 0.6), M.wall, WX, WH / 2 + 3, WZ);
  for (const [sx, sz] of [[1, -1], [1, 1]]) add(g, rbox(1.8, WH + 0.4, 1.8, 0.3), M.oak, WX + sx * (WW / 2 + 0.2), WH / 2 + 3, WZ + sz * (WL / 2 + 0.2));
  { const r = add(g, rbox(WW + 5, 1.2, WL + 5, 0.2), M.roofDark, WX, WH + 3 + 3.2, WZ); r.rotation.z = 0.2; add(g, rbox(1.2, 0.5, WL + 5.4, 0.1), M.inkLine, WX + (WW + 5) / 2, WH + 3 + 3.2 - (WW + 5) / 2 * 0.2 - 0.3, WZ); }
  for (const x of [-10, 0, 10]) { const p = grp(); p.position.set(WX + x, WH + 2.4, WZ + WL / 2 + 1.4); g.add(p); add(p, rbox(0.6, 13, 9, 0.1), M.paintCloth, 0, -6.5, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 9.4, 0.05), M.inkLine, 0, -0.2, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 9.4, 0.05), M.inkLine, 0, -12.8, 0, 0, Math.PI / 2, 0); add(p, cyl(0.4, 0.4, 10, 8), M.oak, 0, 0.3, 0.2, 0, 0, Math.PI / 2); } // company cloths hung on the wing's south wall
  // the racks: out on a plank deck south of the wing, a row facing the camera, a cable tray behind them with a team lip
  const DX = WX, DZ = WZ + WL / 2 + 12;
  add(g, rbox(WW + 2, 1.2, 14, 0.2), M.deck, DX, 2.8, DZ);
  for (let k = 0; k < 4; k++) {
    const x = DX - 12 + k * 8, z = DZ;
    add(g, rbox(6.0, 10, 6.2, 0.4), M.rackSide, x, 3.4 + 5, z);
    add(g, rbox(5.4, 8.8, 0.6, 0.1), M.paint, x, 3.4 + 5, z + 3.1); add(g, rbox(5.8, 9.2, 0.4, 0.1), M.inkLine, x, 3.4 + 5, z + 2.9); // its south face, a team-painted door in ink trim (as the slice's round 2)
    for (const dx of [-1.8, 1.8]) add(g, rbox(0.5, 8.4, 0.5, 0.1), M.paintLED, x + dx, 3.4 + 5, z + 3.4);               // thin team light strips
    led(g, M, 0.3, x, 3.4 + 8.6, z + 3.6);
  }
  add(g, rbox(WW + 2, 1.2, 1.6, 0.3), M.joint, DX, 5.4, DZ - 5.2); add(g, rbox(WW + 2, 0.4, 1.9, 0.1), M.paint, DX, 6.2, DZ - 5.2); add(g, rbox(WW + 2.4, 0.2, 2.1, 0.05), M.inkLine, DX, 6.5, DZ - 5.2); // the tray, its lip team
  limb(g, [DX - 14, 5.4, DZ - 5.2], [HX + HW / 2 + 0.5, 9, SZ - 6], 0.45, M.cable);
  // the mast with the dish and the company flag (the one flag), the solar rack, stores, two travellers
  const MX = WX + 10, MZ = DZ + 12;
  add(g, cyl(0.8, 1.2, 44, 8), M.oak, MX, 24, MZ); add(g, rbox(1.4, 1.4, 1.4, 0.3), M.joint, MX, 46.5, MZ);
  add(g, cyl(3.6, 3.6, 0.5, 16), M.steel, MX + 1.6, 42, MZ + 1.0, 0.9, 0, -0.5); add(g, cyl(0.3, 0.3, 3, 6), M.joint, MX + 2.4, 42.6, MZ + 1.8, 0.9, 0, -0.5);
  add(g, plate([[0, 0], [26, 0], [26, 18], [13, 15], [0, 18]], 0.4, 0.1), M.paintCloth, MX + 0.5, 27, MZ, Math.PI / 2, 0, 0); // the company flag
  add(g, rbox(26.4, 0.4, 0.5, 0.05), M.inkLine, MX + 13.7, 27, MZ + 0.1); add(g, rbox(0.4, 0.4, 18.2, 0.05), M.inkLine, MX + 0.5, 27, MZ + 9.1);
  led(g, M, 0.6, MX, 47.6, MZ);
  limb(g, [HX + 10, HH + 3.4 + RH + 1.2, HZ + 10], [MX, 45, MZ], 0.35, M.cable);
  const sr = grp(); sr.position.set(HX - 30, 2, SZ + 8); g.add(sr);                              // the solar rack west of the door: dark glass on an oak frame
  for (const z of [-5, 5]) for (const x of [-9, 9]) add(sr, cyl(0.6, 0.7, z < 0 ? 8 : 4, 6), M.oak, x, z < 0 ? 4 : 2, z);
  add(sr, rbox(24, 0.8, 12, 0.2), M.glass, 0, 6.2, 0, 0.42, 0, 0); add(sr, rbox(24.4, 0.4, 12.4, 0.1), M.joint, 0, 5.8, 0, 0.42, 0, 0);
  for (const x of [-4, 4]) add(sr, rbox(0.5, 0.9, 12.2, 0.1), M.steel, x, 6.3, 0, 0.42, 0, 0);
  for (let k = 0; k < 4; k++) add(g, rbox(4.6, 4.2, 4.6, 0.4), M.oakPale, HX - 38 + (k % 2) * 5.2, 4.3 + Math.floor(k / 2) * 4.2, SZ - 12 + (k % 2) * 1.5); // crates
  for (const [x, z] of [[HX - 40, SZ + 2], [HX - 35, SZ - 2]]) { add(g, cyl(2.4, 2.6, 5, 12), M.oakPale, x, 4.5, z); for (const y of [3.2, 6]) add(g, torus(2.65, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); }
  add(g, rbox(12, 3.6, 6, 0.4), M.stone, HX + 30, 3.8, SZ + 22); add(g, rbox(10.4, 0.6, 4.6, 0.2), M.glass, HX + 30, 5.5, SZ + 22); // a trough
  for (const [x, z, ry2] of [[HX + 10, SZ + 9, 0.6], [HX - 10, SZ + 14, -2.4]]) { const t = traveller(M, 0); t.position.set(x, 2.2, z); t.rotation.y = ry2; t.scale.setScalar(0.9); g.add(t); }
  return g;
}

/** The gold deposit (`rt_coins`): heaps of coins where today's salt sits, loose coins round them, on a dark footing of
 *  earth: the resource both peoples dig. */
export function coins(M) {
  const g = grp(), gold = new THREE.MeshStandardMaterial({ color: 0xf0c850, metalness: 0.6, roughness: 0.4 }), goldDark = new THREE.MeshStandardMaterial({ color: 0x9a7428, metalness: 0.6, roughness: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }); void M;
  seed = 97;
  // Stelian (round 3): a rocky outcrop with gold showing, not heaps of coins: grey rock lumps, flat-shaded, with veins
  // and nuggets of gold on their lit tops and faces, a few loose nuggets at their feet
  const rock = new THREE.MeshStandardMaterial({ color: 0x7c7870, roughness: 0.9, flatShading: true }), rockDark = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.95, flatShading: true });
  for (const [x, z, r, h] of [[0, 0, 9, 11], [-12, 6, 6.5, 7], [11, -5, 6, 8], [4, 12, 4.5, 5], [-6, -10, 4.5, 5]]) {
    add(g, cyl(r * 1.1, r * 1.25, 0.6, 9), dark, x, 0.3, z);
    const m = add(g, new THREE.DodecahedronGeometry(r, 0), rock, x, h * 0.45, z, rnd() * 0.6, rnd() * 3, rnd() * 0.5); m.scale.set(1, h / r * 0.55, 0.9);
    add(g, new THREE.DodecahedronGeometry(r * 0.6, 0), rockDark, x + r * 0.5, h * 0.3, z + r * 0.3, rnd(), rnd() * 3, 0).scale.set(1, 0.6, 1);
    for (let k = 0; k < 5 + r; k++) {                                                            // nuggets and vein pieces of gold on the top and the south face
      const a = rnd() * 6.3, d = rnd() * r * 0.7, y = h * 0.5 + rnd() * h * 0.35, s2 = 0.9 + rnd() * 1.2;
      add(g, rbox(s2 * 1.6, s2 * 0.7, s2, 0.15), k % 3 ? gold : goldDark, x + Math.cos(a) * d, y, z + Math.abs(Math.sin(a)) * d * 0.8, (rnd() - 0.5), rnd() * 3, (rnd() - 0.5));
    }
  }
  for (let k = 0; k < 12; k++) { const a = rnd() * 6.3, d = 10 + rnd() * 12; add(g, rbox(1.4, 0.8, 1.1, 0.15), gold, Math.cos(a) * d, 0.5, Math.sin(a) * d * 0.8, 0, rnd() * 3, 0); }
  return g;
}
