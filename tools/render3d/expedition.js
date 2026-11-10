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
/** Urban camouflage: two or three grey tones in big soft blotches (fine pixel camo turns to noise at 20-30 px); the
 *  blotches tile at the edges. The material's colour darkens the light base. */
const camoTex = tex(128, (g, n) => {
  g.fillStyle = '#b4b8b4'; g.fillRect(0, 0, n, n); seed = 131;
  for (let i = 0; i < 16; i++) {
    const x = rnd() * n, y = rnd() * n, rx = 13 + rnd() * 12, ry = 9 + rnd() * 9, a = rnd() * 3; g.fillStyle = i % 3 ? (i % 3 === 1 ? '#7a7e7c' : '#d8dcd8') : '#5a5e5c';
    for (const [dx, dy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) { g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, a, 0, 7); g.fill(); }
  }
}, { repeat: 1 });
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
export const EXPEDITION_LOOK = { name: 'charcoal kit', panel: 0x62665f, panelDark: 0x44484a, edge: 0x2a2c2e, metal: 0.3, rough: 0.6, canvas: 0x8a8068, wall: 0x8c9096, frame: 0x3e3226, uniform: 0x6e7268, armour: 0x383a3e };
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
  M.wall = std({ color: P.wall, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });            // warm fieldstone (the castle's is cool slate)
  M.roofDark = std({ color: 0x9a948a, map: plankTex, bumpMap: plankBump, bumpScale: 1.0, roughness: 0.9 });        // the hall's roof: weathered silver-grey planks (round 3: the dark roof dominated)
  M.wallPale = std({ color: 0xaeb2b6, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });      // the pale stone gable ends that face the camera
  M.stone = std({ color: 0x6e6458, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });         // a footing course of darker stone
  M.earth = std({ color: 0x66563c, map: earthTex, roughness: 1 });                                                  // trodden earth, the grass's dirt
  M.deck = std({ color: 0x7a6448, map: plankTex, bumpMap: plankBump, bumpScale: 0.8, roughness: 0.9 });            // a plank floor
  M.gold = std({ color: 0xf0c850, metalness: 0.6, roughness: 0.35 });                                               // coins: a light yellow, gold is the coins' alone
  M.glint = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });
  M.uniform = std({ color: P.uniform, roughness: 0.9 });                                                            // fatigues
  M.armour = std({ color: P.armour, roughness: 0.65, metalness: 0.15 });                                             // helmets, caps, knee pads, pouches: near black
  M.gun = std({ color: 0x1e1f23, metalness: 0.6, roughness: 0.4 });
  M.gunTan = std({ color: 0xa8acb0, roughness: 0.6, metalness: 0.3 });                                              // a rifle's furniture: the Marine's pale mark
  M.skin = std({ color: 0xc89a74, roughness: 0.8 });
  M.boot = std({ color: 0x1e1a18, roughness: 0.8 });
  M.camo = std({ color: 0x9a9e98, map: camoTex, roughness: 0.9 });                                                   // the Marine's urban camouflage: grey-charcoal blotches (Stelian: camouflage, slimmer)
  M.tyrePale = std({ color: 0x8e908a, map: M.rubber.map, roughness: 0.9, metalness: 0.05 });                          // the Buggy's big pale wheels (the units family: the Buggy must part from the Bot in a crowd)
  M.brightSteel = std({ color: 0xc8ccd0, metalness: 0.6, roughness: 0.35 });                                           // the Buggy's bull bar: its brightest element
  M.hose = std({ color: 0x5e5648, roughness: 0.9 });                                                                 // a local's rough trousers (the Mercenary, the Veteran)
  M.leather = std({ color: 0x2e2622, roughness: 0.6, metalness: 0.1 });                                              // a local's boots and belts
  M.rotor = std({ color: 0x2a2c30, metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.55 });              // a spinning rotor's disc
  return M;
}

/** A small cool LED with a soft halo. */
function led(parent, M, r, x, y, z) {
  add(parent, sph(r, 8, 6), M.led, x, y, z); add(parent, sph(r * 2.2, 8, 6), M.ledHalo, x, y, z);
}
/** A team panel: a flat team plate `w` x `d` lying in xz, `t` thick, inside an ink trim a hair proud of it. */
function teamPlate(parent, M, w, t, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const p = grp(); p.position.set(x, y, z); p.rotation.set(rx, ry, rz); parent.add(p);
  add(p, rbox(w + 0.6, t * 0.8, d + 0.6, 0.15), M.inkLine, 0, -t * 0.1, 0);
  add(p, rbox(w, t, d, 0.25), M.paint, 0, 0.02, 0);
  return p;
}

/** Bot (the worker, sim r 9): a flat wheeled box with a small arm, as Stelian's list says: a charcoal shell wider
 *  than tall and low (the units family: flatter and lower still, so it parts from the taller Buggy in a crowd) on four
 *  wheels out at its corners with pale hubs (its pale mark), a team stripe round its flanks inside dark trim, a cool
 *  LED strip at the bow; a big shallow tray over most of its back with a flat layer of gold coins (the worker's loud
 *  load, a tray, not a ball); out of the bow a short steel arm ending in a pale scoop held low ahead. A low, wide
 *  machine, never a man on a cart. From the camera: a wide low rounded rectangle, a gold tray on nearly all of its back,
 *  pale wheels at its corners, a short grey arm ahead. Frames 0-1: the arm bobs. */
export function utilityBot(M, f) {
  const g = grp(), b = grp(); g.add(b);
  add(b, rbox(15, 2.4, 12.0, 1.0), M.panel, 0, 2.7, 0);                                       // the shell: wider than tall, low
  add(b, rbox(15.4, 0.8, 12.4, 0.4), M.trim, 0, 1.6, 0);                                       // the dark skirt
  for (const [x, z] of [[-5.2, -6.3], [5.2, -6.3], [-5.2, 6.3], [5.2, 6.3]]) {                 // wheels out at the corners, pale hubs: the Bot's pale mark
    add(b, cyl(2.0, 2.0, 1.8, 16), M.tyre, x, 2.0, z, Math.PI / 2, 0, 0);
    add(b, cyl(1.2, 1.2, 1.9, 10), M.paleSteel, x, 2.0, z, Math.PI / 2, 0, 0);
  }
  add(b, rbox(15.2, 1.4, 12.2, 0.3), M.paint, 0, 2.6, 0); add(b, rbox(15.3, 0.3, 12.3, 0.1), M.inkLine, 0, 3.4, 0); add(b, rbox(15.3, 0.3, 12.3, 0.1), M.inkLine, 0, 1.8, 0); // the team stripe round the flanks between trims
  add(b, rbox(1.0, 0.9, 10.0, 0.3), M.joint, 7.4, 3.8, 0); add(b, rbox(1.1, 0.5, 10.2, 0.1), M.paint, 7.4, 4.4, 0); add(b, rbox(1.2, 0.2, 10.4, 0.05), M.inkLine, 7.4, 4.7, 0); // the light bar at the bow, its guard team
  for (const z of [-3.4, 0, 3.4]) led(b, M, 0.5, 8.0, 3.8, z);
  add(b, cyl(0.7, 0.7, 5.0, 8), M.joint, -6.8, 6.2, 5.2);                                       // an antenna (thin props drawn twice their thickness)
  add(b, plate([[0, -2.4], [7, -0.6], [7, 0.6], [0, 2.4]], 0.3, 0.1), M.paintCloth, -6.5, 8.4, 5.2, Math.PI / 2, 0, 0); // a team pennant on it
  add(b, rbox(1.2, 1.4, 12.0, 0.3), M.paint, 7.9, 2.2, 0); add(b, rbox(1.3, 0.3, 12.2, 0.1), M.inkLine, 7.9, 3.0, 0); add(b, rbox(1.3, 0.3, 12.2, 0.1), M.inkLine, 7.9, 1.4, 0); // the front bumper, team between trims
  // the tray: big, shallow and flat over most of the back, a flat layer of coins in it inside a dark rim
  const tr = grp(); tr.position.set(-1.4, 3.9, 0); b.add(tr);
  add(tr, rbox(10.6, 1.2, 11.0, 0.3), M.panelDark, 0, 0.6, 0);
  add(tr, rbox(10.8, 0.4, 11.2, 0.1), M.inkLine, 0, 1.2, 0);                                    // its rim
  add(tr, rbox(9.8, 0.5, 10.2, 0.2), M.gold, 0, 1.35, 0);                                       // the coins, a flat gold layer
  add(tr, rbox(10.2, 0.3, 10.6, 0.1), M.inkLine, 0, 1.3, 0);                                    // a dark rim under its edge
  add(tr, sph(0.5, 8, 6), M.glint, 2.0, 1.9, -2.4); add(tr, sph(0.4, 8, 6), M.glint, -2.4, 1.85, 3.0); add(tr, sph(0.35, 8, 6), M.glint, 0.4, 1.9, 0.6); // white glints
  for (const [x, z] of [[3.0, 2.8], [-2.6, -3.4], [0.6, 0.2], [-3.4, 3.8], [3.4, -2.0], [0.2, -4.4], [-0.8, 4.2], [2.0, -4.0]]) add(tr, cyl(0.9, 0.9, 0.35, 10), M.gold, x, 1.75, z, (x - z) * 0.1, x, 0.1);
  // the arm: a turret on the bow, a steel upper arm and forearm reaching ahead and down to a scoop, held low
  const arm = grp(); arm.position.set(5.8, 3.9, 0); b.add(arm);
  add(arm, cyl(1.3, 1.5, 1.2, 12), M.joint, 0, 0, 0);
  const bob = (f % 2) * 0.5;
  limb(arm, [0, 0.5, 0], [2.4, 2.4 - bob, 0], 0.85, M.steel);
  add(arm, sph(1.0, 10, 8), M.joint, 2.4, 2.4 - bob, 0);
  limb(arm, [2.4, 2.4 - bob, 0], [5.8, -0.6, 0], 0.75, M.steel);
  add(arm, rbox(2.6, 1.6, 4.0, 0.3), M.paleSteel, 6.6, -1.2, 0, 0, 0, -0.5);                    // the scoop, pale
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

/** Buggy (the fast raider, light vehicle, sim r 12-13): an electric off-road buggy, long and now tall in the ride
 *  (the units family: in a crowd it mushed with the Bot into dark boxes with pale bits): a charcoal tub held high on
 *  four big pale wheels (pale tyres and paler hubs, the biggest pale marks on the side), team stripes along the doors
 *  and the body's top edges inside dark trim, a low steel roll cage over the two seats, two cool LED headlights, the
 *  bull bar out ahead in bright steel (its brightest element), a battery pack behind the seats, a tall whip antenna
 *  flying a team flag high over the cage. From the camera: a dark tub up on four pale discs with a bright bar at its
 *  nose and a flag high over it: a vehicle, never a figure, a block or the flat Bot. Frames 0-1: the hubs' marks turn. */
export function buggy(M, f) {
  const g = grp(), b = grp(); b.position.y = 5.2; g.add(b);                                     // (the ride height: the tub's floor at 4, over the Bot's whole shell)
  add(b, rbox(22, 2.2, 10, 0.9), M.trim, 0, 0, 0);                                             // the chassis tub
  add(b, rbox(21.2, 1.2, 9.4, 0.5), M.panel, 0, 1.5, 0);                                       // the body panel over it, charcoal (no team slab)
  add(b, rbox(7.0, 1.2, 8.8, 0.5), M.panel, 7.2, 2.3, 0, 0, 0, -0.1);                            // the bonnet, sloping down ahead
  add(b, rbox(4.0, 0.4, 3.0, 0.2), M.paleSteel, 7.4, 3.0, 0, 0, 0, -0.1);                        // a pale panel mark on the bonnet
  for (const z of [-5.0, 5.0]) { add(b, rbox(18, 2.0, 0.6, 0.1), M.paint, -1, 1.4, z); add(b, rbox(18.2, 0.25, 0.65, 0.05), M.inkLine, -1, 2.5, z); add(b, rbox(18.2, 0.25, 0.65, 0.05), M.inkLine, -1, 0.3, z); } // a team stripe along each door, between trims
  for (const z of [-5.0, 5.0]) { add(b, rbox(16, 0.5, 1.2, 0.1), M.paint, -1, 2.3, z * 0.86); add(b, rbox(16.2, 0.2, 1.4, 0.05), M.inkLine, -1, 2.5, z * 0.86); } // and along the body's top edges
  for (const z of [-2.8, 2.8]) led(b, M, 0.6, 11.0, 2.6, z);                                     // the headlights, white
  add(b, rbox(5.6, 2.2, 7.6, 0.6), M.panelDark, -7.6, 2.4, 0);                                  // the battery pack behind the seats
  for (const z of [-1.9, 1.9]) { add(b, rbox(3.0, 1.2, 3.0, 0.5), M.paint, -1.4, 2.4, z); add(b, rbox(1.0, 3.2, 3.0, 0.5), M.paint, -3.0, 4.0, z); add(b, rbox(1.1, 0.3, 3.2, 0.05), M.inkLine, -3.0, 5.7, z); } // two seats with team pads
  for (const [x, z] of [[-7.0, -6.6], [7.0, -6.6], [-7.0, 6.6], [7.0, 6.6]]) {                 // the wheels: big and pale, out past the tub, their bottoms on the ground
    add(b, cyl(4.6, 4.6, 3.2, 20), M.tyrePale, x, -0.6, z, Math.PI / 2, 0, 0);
    add(b, cyl(2.5, 2.5, 3.3, 12), M.paleSteel, x, -0.6, z, Math.PI / 2, 0, 0);
    add(b, rbox(3.6, 0.6, 3.4, 0.1), M.joint, x, -0.6, z, Math.PI / 2, (f % 2) * 0.6, 0);         // a spoke mark that turns by frame
    add(b, rbox(3.6, 0.9, 3.0, 0.3), M.joint, x, 0.2, z * 0.78);                                 // the wishbone out to it
  }
  // the roll cage, low: four tubes up from the tub to a roof frame, a charcoal roof panel on it
  const cage = M.steel;
  for (const [x, z] of [[-5.0, -3.6], [1.2, -3.6], [-5.0, 3.6], [1.2, 3.6]]) limb(b, [x, 1.4, z], [x * 0.92, 6.6, z * 0.9], 0.45, cage);
  for (const z of [-3.2, 3.2]) limb(b, [-4.6, 6.6, z], [1.1, 6.6, z], 0.45, cage);
  for (const x of [-4.6, 1.1]) limb(b, [x, 6.6, -3.2], [x, 6.6, 3.2], 0.45, cage);
  add(b, rbox(5.6, 0.4, 6.4, 0.2), M.panelDark, -1.75, 6.9, 0);                                 // the roof panel, charcoal
  add(b, rbox(1.0, 1.0, 7.0, 0.3), M.joint, 1.3, 7.3, 0); add(b, rbox(1.1, 0.5, 7.2, 0.1), M.paint, 1.3, 8.0, 0); add(b, rbox(1.2, 0.2, 7.4, 0.05), M.inkLine, 1.3, 8.3, 0); // the light bar on the cage's front edge, its guard team
  for (const z of [-2.4, -0.8, 0.8, 2.4]) led(b, M, 0.42, 1.7, 7.4, z);
  add(b, cyl(0.5, 0.55, 13, 6), M.joint, -4.6, 13.0, -3.2); add(b, plate([[0, -3.2], [10, -0.9], [10, 0.9], [0, 3.2]], 0.3, 0.1), M.paintCloth, -4.3, 19.0, -3.2, Math.PI / 2, 0, 0); // the team flag, high on a tall whip over the cage
  // the bull bar ahead, bright steel (the brightest thing on the machine); the antenna; a spare wheel on the back
  const bar = M.brightSteel;
  limb(b, [13.8, 0.6, -5.2], [13.8, 0.6, 5.2], 0.75, bar); limb(b, [13.8, 3.4, -4.4], [13.8, 3.4, 4.4], 0.75, bar);
  for (const z of [-4.2, 0, 4.2]) limb(b, [13.8, -0.6, z], [13.8, 4.6, z], 0.65, bar);
  for (const z of [-3.2, 3.2]) limb(b, [10.8, 1.6, z], [13.8, 1.8, z], 0.45, M.steel);           // its stays back to the chassis
  add(b, cyl(0.6, 0.6, 7, 6), M.joint, -9.6, 6, 3.6);                                            // the whip antenna, drawn thick
  add(b, rbox(1.2, 1.6, 10.4, 0.3), M.paint, -11.4, 1.0, 0); add(b, rbox(1.3, 0.3, 10.6, 0.1), M.inkLine, -11.4, 1.9, 0); add(b, rbox(1.3, 0.3, 10.6, 0.1), M.inkLine, -11.4, 0.1, 0); // the rear bumper, team between trims
  add(b, cyl(2.8, 2.8, 1.6, 16), M.tyrePale, -12.6, 3.6, 0, 0, 0, Math.PI / 2); add(b, cyl(1.4, 1.4, 1.8, 10), M.paleSteel, -12.6, 3.6, 0, 0, 0, Math.PI / 2);
  return g;
}

/** Marine (the signature unit, line class, sim r 10-11, scale 1.08): a slim modern soldier (Stelian: "a lot slimmer",
 *  "camouflage style uniform"): the Guard's build, grey-charcoal urban camouflage in big soft blotches (woodland green
 *  would vanish on the grass), a fitted charcoal plate carrier with two small pouches, a small pack, a dark rounded
 *  helmet with goggles pushed up whose lenses are the one white LED, and a slim dark rifle held level across the
 *  body. Team on one shoulder pad and one armband only (round 3's pads, bands and pack strip read as a team torso
 *  from behind). No block torso, no pale or oversized gun (the judge read the white gun as plasma and the block as
 *  StarCraft, Warhammer or Lego). From the camera: a dark dot with a white glint over a slim mottled grey figure with
 *  a short dark level bar and one team square at the shoulder. Frames 0-1 the march. */
export function marine(M, f) {
  const g = grp(), st = [3.2, -3.2][f % 2];
  for (const side of [-1, 1]) {                                                                 // the Guard's stance and build
    const z = side * 2.1, s = st * side;
    add(g, rbox(3.4, 1.5, 2.2, 0.6), M.boot, s + 0.5, 0.75, z);
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, z * 1.05], 1.2, M.uniform);                             // the legs in charcoal fatigues (pale camo legs under a dark top inverted the rule: the judge)
    limb(g, [s * 0.55, 3.4, z * 1.05], [s, 1.3, z], 1.05, M.uniform);
    add(g, sph(1.65, 8, 6), M.paint, s * 0.6 + 0.3, 3.7, z * 1.05).scale.set(1.2, 1, 0.95);      // team knee pads, bulky as tactical ones are (the PM: the floor is reached with the pack, pads and armband)
    add(g, torus(1.35, 0.28, 10), M.inkLine, s * 0.6 + 0.3, 3.7, z * 1.05 + side * 1.1);           // their ink rims
  }
  const b = grp(); g.add(b);
  add(b, rbox(4.8, 6.0, 6.4, 1.5), M.camo, 0, 10.3, 0);                                        // the torso, camouflage fatigues
  add(b, rbox(5.0, 4.0, 5.6, 0.5), M.camo, 0.5, 10.5, 0);                                      // a fitted plate carrier, slim, in the same camouflage (a charcoal one made the unit a black lump from above)
  add(b, rbox(5.2, 0.35, 5.8, 0.1), M.inkLine, 0.5, 12.6, 0); add(b, rbox(5.2, 0.35, 5.8, 0.1), M.inkLine, 0.5, 8.4, 0);
  for (const z of [-1.2, 1.2]) add(b, rbox(1.2, 1.5, 1.3, 0.3), M.armour, 3.0, 9.6, z);          // two magazine pouches on the chest
  add(b, rbox(5.0, 0.8, 6.6, 0.3), M.leather, 0, 7.4, 0);                                       // the belt
  add(b, rbox(2.6, 4.8, 4.8, 0.7), M.camo, -3.4, 10.6, 0);                                      // a small pack, camouflage
  add(b, rbox(2.8, 1.8, 5.0, 0.2), M.paint, -3.4, 12.3, 0); add(b, rbox(3.0, 0.25, 5.2, 0.05), M.inkLine, -3.4, 11.35, 0); add(b, rbox(3.0, 0.25, 5.2, 0.05), M.inkLine, -3.4, 13.25, 0); // one team strip across the pack's top (the judge: packs are allowed; one strip is not a team back)
  add(b, rbox(1.2, 2.0, 1.0, 0.3), M.joint, -4.4, 9.4, -2.0); add(b, cyl(0.6, 0.6, 7, 6), M.joint, -4.4, 13.8, -2.0); // a radio and its antenna, drawn thick
  add(b, rbox(4.2, 2.4, 4.0, 0.6), M.paint, 0.3, 13.6, 3.7); add(b, rbox(4.4, 0.3, 4.2, 0.1), M.inkLine, 0.3, 12.35, 3.7); add(b, rbox(4.4, 0.3, 4.2, 0.1), M.inkLine, 0.3, 14.85, 3.7); // the one team shoulder pad, a big pauldron between ink lines
  add(b, cyl(1.7, 1.7, 3.0, 10), M.paint, 1.0, 10.2, -3.9, 0.3, 0, 0.4); for (const dy of [-1.6, 1.6]) add(b, cyl(1.75, 1.75, 0.3, 10), M.inkLine, 1.0 - dy * 0.39, 10.2 + dy * 0.92, -3.9 - dy * 0.28, 0.3, 0, 0.4); // the one team armband, wide, between ink rings
  add(b, sph(1.7, 12, 10), M.skin, 0.9, 13.3, 0).scale.set(0.8, 0.95, 0.9);                    // the face
  add(b, sph(2.7, 16, 12), M.armour, 0.1, 14.2, 0).scale.set(1, 0.85, 1);                      // the helmet, dark, rounded
  add(b, cyl(2.8, 2.8, 0.4, 16), M.inkLine, 0.1, 13.1, 0);                                     // its rim line
  add(b, rbox(2.4, 1.6, 4.8, 0.4), M.joint, 1.7, 15.1, 0);                                     // the goggles, pushed up on the helmet
  add(b, rbox(1.2, 1.3, 4.6, 0.2), M.led, 2.6, 15.2, 0); add(b, sph(2.6, 8, 6), M.ledHalo, 2.8, 15.2, 0).scale.set(0.5, 0.5, 1); // their lenses: the one white LED, big enough for 1x, with a halo
  add(b, rbox(0.4, 0.8, 5.6, 0.1), M.joint, 0.2, 15.1, 0);                                      // their strap
  // the rifle: slim and dark, held level across the body ahead of the chest (the barrel drawn twice its thickness)
  const gun = grp(); gun.position.set(3.4, 9.6, 0); gun.rotation.set(0, 0.3, 0.04); b.add(gun);
  add(gun, rbox(3.6, 1.6, 1.3, 0.4), M.gun, -3.2, 0, 0);                                        // the stock
  add(gun, rbox(4.0, 1.9, 1.5, 0.4), M.gun, 0.3, 0, 0);                                         // the receiver
  add(gun, rbox(1.1, 2.4, 1.0, 0.3), M.gun, 0.3, -1.9, 0);                                      // the magazine
  add(gun, rbox(1.0, 1.4, 1.0, 0.2), M.gun, -1.2, -1.3, 0);                                     // the grip
  add(gun, rbox(1.4, 0.8, 0.9, 0.2), M.joint, 0.4, 1.3, 0);                                     // the sight
  add(gun, rbox(5.4, 1.5, 1.4, 0.4), M.gun, 5.0, 0, 0);                                         // the handguard
  add(gun, cyl(0.65, 0.65, 3.6, 8), M.gun, 9.4, 0.15, 0, 0, 0, Math.PI / 2);                     // the barrel
  limb(b, [0.6, 11.4, 3.6], [2.4, 9.4, 1.6], 1.1, M.camo); add(b, sph(0.85, 8, 6), M.armour, 2.6, 9.2, 1.4);  // the trigger hand, gloved
  limb(b, [0.6, 11.4, -3.6], [5.8, 9.8, -1.2], 1.1, M.camo); add(b, sph(0.85, 8, 6), M.armour, 6.2, 9.8, -1.0); // the fore hand on the handguard
  g.scale.setScalar(1.08);
  return g;
}

/** Data centre (the main building, 4x4; the slice, round 3): a hall that runs north-south, so its pale stone gable
 *  end faces the camera with the three big cooling fans set into it (dark grilles, pale blades, lit hubs: the
 *  hero), an oak door under them and a team banner over it; cool slate-country stone walls lined with dark oak
 *  framing (posts, rails, braces), a weathered grey plank roof (lightened: the dark roof dominated) with a louvred
 *  ventilation gable on it; along the east side a lower lean-to wing with its roof open as bare rafters over two
 *  rows of charcoal server racks with thin team light strips; a cable tray with a team lip from the gable to an oak
 *  mast with a dish and the company flag; a second flag by the door; cloths hung from the wing's eave; a solar rack
 *  of dark glass, crates, barrels, a trough; two travellers. Team on flags, banners, cloths, the racks' strips and
 *  the tray's lip only. Trodden earth hugging the building. */
export function dataCentre(M) {
  const g = grp();
  const HX = -14, HZ = -8, HW = 44, HL = 96, HH = 16, RH = 9, SZ = HZ + HL / 2;                    // the hall along z, a low pitch; SZ its south gable
  const WX = HX + HW / 2 + 16, WZ = HZ - 6, WW = 32, WL = 56, WH = 11;                             // the rack wing east of it
  add(g, plate(oct(60, 0.3).map(([x, z]) => [x * 0.95 + HX + 10, z * 0.92 + HZ + 2]), 2.2, 0.8), M.earth, 0, 0, 0); // trodden earth, hugging the building
  // the hall: footing, slate-country walls, the pale gable ends, the oak framing lines, a weathered plank roof
  add(g, rbox(HW + 4, 3, HL + 4, 0.5), M.stone, HX, 3, HZ);
  add(g, rbox(HW, HH, HL, 0.6), M.wall, HX, HH / 2 + 3, HZ);
  for (const sz of [-1, 1]) add(g, gable(HW + 0.6, RH, 2.4), M.wallPale, HX, HH + 3, HZ + sz * (HL / 2 - 1.2));  // the pale stone gables, the south one to the camera
  add(g, rbox(HW + 1.4, RH + HH + 0.4, 1.2, 0.2), M.wallPale, HX, (RH + HH) / 2 + 3, SZ + 0.3).scale.set(1, 1, 1); // (the south end wall's full face, pale)
  for (const x of [-18, -6, 6, 18]) for (const z of [-1, 1]) add(g, rbox(1.8, HH + 0.4, 1.4, 0.3), M.oak, HX + x, HH / 2 + 3, HZ + z * (HW / 2 + 0.3));
  for (let k = 0; k <= 6; k++) add(g, rbox(1.4, HH + 0.4, 1.8, 0.3), M.oak, HX + HW / 2 + 0.3, HH / 2 + 3, HZ - HL / 2 + k * HL / 6);   // posts down the east wall
  for (const y of [9, 15]) add(g, rbox(1.2, 1.3, HL + 1, 0.3), M.oak, HX + HW / 2 + 0.4, y, HZ);                                        // its rails
  for (let k = 0; k < 6; k += 2) for (const d of [-1, 1]) add(g, rbox(1.0, 1.2, 14.5, 0.2), M.oak, HX + HW / 2 + 0.8, 12, HZ - HL / 2 + (k + 0.5) * HL / 6, d * 0.42, 0, 0); // braces
  for (const x of [-16, 16]) add(g, rbox(1.6, RH + HH + 0.6, 1.4, 0.3), M.oak, HX + x, (RH + HH) / 2 + 3, SZ + 1.0);                  // framing on the south gable
  for (const y of [8.5, 15.5]) add(g, rbox(HW + 0.4, 1.3, 1.3, 0.3), M.oak, HX, y, SZ + 1.1);
  add(g, rbox(1.3, 1.2, 1.3, 0.3), M.oak, HX, HH + RH + 2.4, SZ + 1.1);
  add(g, gable(HW + 6, RH, HL + 6), M.roofDark, HX, HH + 3.4, HZ);
  for (let k = 1; k < 8; k++) for (const sx of [-1, 1]) add(g, rbox(21.5, 0.5, 0.8, 0.1), M.oak, HX + sx * 11.5, HH + 3.4 + RH - 11.5 * Math.tan(Math.atan2(RH, (HW + 6) / 2)) + 0.5, HZ - HL / 2 + k * HL / 8, 0, 0, sx * Math.atan2(RH, (HW + 6) / 2)); // batten lines
  add(g, rbox(1.8, 1.8, HL + 7, 0.4), M.oak, HX, HH + 3.4 + RH + 0.6, HZ);                        // the ridge beam
  { const d = grp(); d.position.set(HX + 11, HH + 3.4 + RH - 6, HZ + 14); g.add(d);              // the ventilation gable on the east slope: a louvred dormer
    add(d, rbox(10, 7, 9, 0.4), M.wallPale, 0, 3.5, 0); add(d, gable(11, 4.5, 10), M.roofDark, 0, 7, 0, 0, Math.PI / 2, 0);
    for (let k = 0; k < 4; k++) add(d, rbox(0.8, 0.6, 7, 0.1), M.joint, 5.2, 1.8 + k * 1.3, 0, 0, 0, 0.5); }
  // the fans in the south gable: three big round housings, dark grilles, pale blades, lit hubs; the door under them, a banner over it
  for (let k = 0; k < 3; k++) {
    const fan = grp(); fan.position.set(HX - 13 + k * 13, HH + 6, SZ + 1.6); fan.rotation.x = Math.PI / 2; g.add(fan);
    add(fan, cyl(5.6, 5.6, 2.0, 20), M.joint, 0, 0.6, 0);
    add(fan, cyl(5.0, 5.0, 0.4, 20), M.panelDark, 0, 1.5, 0);
    for (let j = 0; j < 6; j++) add(fan, rbox(9.6, 0.25, 0.5, 0.1), M.joint, 0, 1.75, 0, 0, j * Math.PI / 6, 0);
    for (let j = 0; j < 3; j++) add(fan, rbox(8.8, 0.4, 2.0, 0.3), M.white, 0, 1.9, 0, 0, j * Math.PI / 3 + 0.2, 0);
    led(fan, M, 0.9, 0, 2.2, 0);
  }
  add(g, rbox(7, 10, 1.2, 0.4), M.oak, HX, 8, SZ + 1.4); for (const y of [5, 10.5]) add(g, rbox(7.4, 0.5, 0.4, 0.1), M.ironDark, HX, y, SZ + 2.1); // the door
  add(g, rbox(7.8, 11, 0.5, 0.1), M.inkLine, HX, 8.3, SZ + 1.2);
  for (const x of [-18, 18]) { add(g, rbox(2.6, 3.2, 1.0, 0.2), M.glass, HX + x, 10, SZ + 1.4); add(g, rbox(3.2, 3.8, 0.5, 0.1), M.inkLine, HX + x, 10, SZ + 1.2); } // windows
  { const p = grp(); p.position.set(HX, HH + 2.4, SZ + 2.4); g.add(p); add(p, rbox(0.6, 8, 11, 0.1), M.paintCloth, 0, -4, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 11.4, 0.05), M.inkLine, 0, -0.2, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 11.4, 0.05), M.inkLine, 0, -7.8, 0, 0, Math.PI / 2, 0); add(p, cyl(0.4, 0.4, 13, 8), M.oak, 0, 0.3, 0.2, 0, 0, Math.PI / 2); } // the team banner over the door
  add(g, torus(1.4, 0.4, 20), M.joint, HX - 9, HH + RH - 2, SZ + 1.6); add(g, sph(0.6, 8, 6), M.joint, HX - 9, HH + RH - 2, SZ + 1.6); // the mark, high on the gable
  // the rack wing east: a low lean-to of stone, its roof bare rafters over two rows of racks; cloths hung from its eave
  add(g, rbox(WW + 4, 3, WL + 4, 0.5), M.stone, WX, 3, WZ);
  add(g, rbox(WW, WH, WL, 0.6), M.wall, WX, WH / 2 + 3, WZ);
  add(g, rbox(WW - 2, 1.0, WL - 2, 0.3), M.deck, WX, WH + 3.0, WZ);
  for (let k = 0; k <= 4; k++) add(g, rbox(1.6, WH + 0.4, 1.4, 0.3), M.oak, WX + WW / 2 + 0.3, WH / 2 + 3, WZ - WL / 2 + k * WL / 4);
  for (let k = 0; k <= 6; k++) add(g, rbox(WW + 4, 1.3, 1.3, 0.3), M.oak, WX, WH + 3.4 + 4 - 0, WZ - WL / 2 + k * WL / 6, 0, 0, 0.16); // rafters, leaning up to the hall
  for (const x of [-10, 4, 16]) add(g, rbox(1.0, 1.0, WL + 4, 0.2), M.oak, WX + x, WH + 3.4 + 4 - (x + 0) * 0.16, WZ); // purlins
  for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) {
    const x = WX - 8 + row * 15, z = WZ - WL / 2 + 6 + k * 10.5;
    add(g, rbox(6.0, 10, 6.2, 0.4), M.rackSide, x, WH + 3.5 + 5, z);
    add(g, rbox(0.6, 8.8, 5.4, 0.1), M.panelDark, x + 3.1, WH + 3.5 + 5, z);                      // its east face, the door
    add(g, rbox(0.5, 8.4, 0.5, 0.1), M.paintLED, x + 3.4, WH + 3.5 + 5, z - 1.8);                  // a thin team light strip
    add(g, rbox(0.5, 8.4, 0.5, 0.1), M.paintLED, x + 3.4, WH + 3.5 + 5, z + 1.8);
    led(g, M, 0.3, x + 3.6, WH + 3.5 + 8.6, z);
  }
  for (const x of [-10, 0, 10]) { const p = grp(); p.position.set(WX + x, WH + 2.6, WZ + WL / 2 + 1.4); g.add(p); add(p, rbox(0.6, 10, 9, 0.1), M.paintCloth, 0, -5, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 8.4, 0.05), M.inkLine, 0, -0.2, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 8.4, 0.05), M.inkLine, 0, -9.8, 0, 0, Math.PI / 2, 0); add(p, cyl(0.4, 0.4, 10, 8), M.oak, 0, 0.3, 0.2, 0, 0, Math.PI / 2); } // company cloths hung down the wing's south wall, facing the camera
  for (const x of [-12, 12]) { const p = grp(); p.position.set(HX + x, HH + 2.0, SZ + 2.4); g.add(p); add(p, rbox(0.6, 10, 9, 0.1), M.paintCloth, 0, -5, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 9.4, 0.05), M.inkLine, 0, -0.2, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 9.4, 0.05), M.inkLine, 0, -9.8, 0, 0, Math.PI / 2, 0); add(p, cyl(0.4, 0.4, 11, 8), M.oak, 0, 0.3, 0.2, 0, 0, Math.PI / 2); } // and two on the gable either side of the door
  // the cable tray along the gable's foot with a team lip, the mast with the dish and the company flag, a second flag by the door
  add(g, rbox(HW + 20, 1.2, 1.6, 0.3), M.joint, HX + 10, 2.6 + 3.2, SZ + 3.2);
  add(g, rbox(HW + 20, 0.4, 1.9, 0.1), M.paint, HX + 10, 6.6, SZ + 3.2); add(g, rbox(HW + 20.4, 0.2, 2.1, 0.05), M.inkLine, HX + 10, 6.9, SZ + 3.2);
  const MX = WX + 6, MZ = SZ + 8;
  add(g, cyl(0.8, 1.2, 44, 8), M.oak, MX, 24, MZ); add(g, rbox(1.4, 1.4, 1.4, 0.3), M.joint, MX, 46.5, MZ);
  add(g, cyl(3.6, 3.6, 0.5, 16), M.steel, MX + 1.6, 42, MZ + 1.0, 0.9, 0, -0.5); add(g, cyl(0.3, 0.3, 3, 6), M.joint, MX + 2.4, 42.6, MZ + 1.8, 0.9, 0, -0.5);
  add(g, plate([[0, 0], [28, 0], [28, 20], [14, 16.5], [0, 20]], 0.4, 0.1), M.paintCloth, MX + 0.5, 26, MZ, Math.PI / 2, 0, 0); // the company flag, big
  add(g, rbox(28.4, 0.4, 0.5, 0.05), M.inkLine, MX + 14.7, 26, MZ + 0.1); add(g, rbox(0.4, 0.4, 20.2, 0.05), M.inkLine, MX + 0.5, 26, MZ + 10.1);
  led(g, M, 0.6, MX, 47.6, MZ);
  limb(g, [HX + 10, HH + 3.4 + RH + 1.2, HZ + 10], [MX, 45, MZ], 0.35, M.cable);
  limb(g, [MX, 20, MZ], [MX + 10, 7, MZ + 14], 0.4, M.cable);
  add(g, cyl(0.5, 0.6, 34, 6), M.oak, HX - 26, 19, SZ + 10); add(g, plate([[0, 0], [24, 0], [24, 16], [12, 13], [0, 16]], 0.4, 0.1), M.paintCloth, HX - 25.6, 30, SZ + 10, Math.PI / 2, 0, 0); add(g, rbox(24.4, 0.4, 0.5, 0.05), M.inkLine, HX - 13.4, 30, SZ + 10.1); // a second flag by the door
  const sr = grp(); sr.position.set(MX + 10, 2, MZ + 14); g.add(sr);                             // the solar rack: dark glass on an oak frame
  for (const z of [-5, 5]) for (const x of [-11, 11]) add(sr, cyl(0.6, 0.7, z < 0 ? 8 : 4, 6), M.oak, x, z < 0 ? 4 : 2, z);
  add(sr, rbox(28, 0.8, 12, 0.2), M.glass, 0, 6.2, 0, 0.42, 0, 0);
  for (const x of [-4.7, 4.7]) add(sr, rbox(0.5, 0.9, 12.2, 0.1), M.steel, x, 6.3, 0, 0.42, 0, 0);
  add(sr, rbox(28.4, 0.4, 12.4, 0.1), M.joint, 0, 5.8, 0, 0.42, 0, 0);
  for (let k = 0; k < 6; k++) add(g, rbox(4.6, 4.2, 4.6, 0.4), M.oakPale, HX - 34 + (k % 3) * 5.2, 4.3 + Math.floor(k / 3) * 4.2, SZ - 10 + (k % 2) * 1.5); // crates
  for (const [x, z] of [[HX - 36, SZ + 4], [HX - 31, SZ + 8], [HX - 34, SZ + 12]]) { add(g, cyl(2.4, 2.6, 5, 12), M.oakPale, x, 4.5, z); for (const y of [3.2, 6]) add(g, torus(2.65, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); }
  add(g, rbox(14, 3.6, 6, 0.4), M.stone, WX, 3.8, WZ + WL / 2 + 12); add(g, rbox(12.4, 0.6, 4.6, 0.2), M.glass, WX, 5.5, WZ + WL / 2 + 12); // a trough
  for (const [x, z, ry2] of [[HX + 8, SZ + 7, 0.6], [HX - 8, SZ + 12, -2.4]]) { const t = traveller(M, 0); t.position.set(x, 2.2, z); t.rotation.y = ry2; t.scale.setScalar(0.9); g.add(t); }
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
