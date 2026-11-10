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

export const EXPEDITION_PALETTES = {
  A: { name: 'limewash and pale canvas', panel: 0xc8c3b6, panelDark: 0x8c877e, edge: 0x34363c, metal: 0.12, rough: 0.72, canvas: 0xcfc2a4, wall: 0xcfc6b4, frame: 0x7a5a3a, uniform: 0xa09a86, armour: 0x3a3c40 },
  B: { name: 'olive canvas and dark timber', panel: 0x7e8464, panelDark: 0x565a44, edge: 0x2a2c26, metal: 0.18, rough: 0.75, canvas: 0x7e8058, wall: 0xa8a294, frame: 0x3e2c1c, uniform: 0x6e7452, armour: 0x2e3028 },
  C: { name: 'black iron and timber', panel: 0x2a2c2e, panelDark: 0x1c1d20, edge: 0xb6babe, metal: 0.6, rough: 0.45, canvas: 0x3a3836, wall: 0x9a948a, frame: 0x6a4c30, uniform: 0x3c3e42, armour: 0x1c1d20 },
};
/** The Expedition's materials for a finish `v`, over the Harbour's set (its timber, rope, ink and canvas weave are
 *  reused). `paint` is the team: paint on a panel, matte, between `inkLine` trim. `edge` is the shells' edging (dark
 *  rubber in A and B, bare aluminium in C), `canvas` the locals' canvas as the finish dyes it, `frame` the oak frame. */
export function makeExpeditionMats(tc, v = 'A') {
  const P = EXPEDITION_PALETTES[v], M = makeMats(tc), std = (o) => new THREE.MeshStandardMaterial(o);
  M.panel = std({ color: P.panel, map: shellTex, metalness: P.metal, roughness: P.rough });                        // the modern shells, weathered
  M.panelDark = std({ color: P.panelDark, map: shellTex, metalness: P.metal, roughness: P.rough + 0.1 });          // undersides, patches, housings
  M.trim = std({ color: P.edge, roughness: 0.6, metalness: P.edge > 0x808080 ? 0.8 : 0.2 });                        // the shells' edging, joints, wheel arches
  M.joint = std({ color: 0x34363c, roughness: 0.7, metalness: 0.2 });                                                // dark joints, whatever the finish
  M.white = std({ color: 0xe2e0da, metalness: 0.1, roughness: 0.6 });                                                // the Bot's arm: white, so it reads as an arm
  M.steel = std({ color: 0xb0b4b8, metalness: 0.85, roughness: 0.35 });
  M.glass = std({ color: 0x10161e, metalness: 0.7, roughness: 0.12 });                                             // dark glass: solar panels, the racks' bay
  M.visor = std({ color: 0x9ad8ea, emissive: 0x3a8090, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.2 });    // a goggle's glint, the dog's visor
  M.led = std({ color: 0xd8f8ff, emissive: 0xa8f0ff, emissiveIntensity: 3.0 });                                     // a small cool light (never orange: seat 0 is gold)
  M.ledHalo = new THREE.MeshBasicMaterial({ color: 0x90e8ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  M.paint = team(std({ color: tc.paint, map: shellTex, metalness: 0.2, roughness: 0.55 }));                         // the team: paint on panels
  M.paintCloth = team(std({ color: tc.paint, map: M.canvas.map, roughness: 0.9, metalness: 0.02 }));                // the team on canvas (the awning, the roof section)
  M.rack = std({ color: 0x8a8c90, map: rackTex, metalness: 0.4, roughness: 0.5 });                                 // a server rack's slotted front
  M.rackSide = std({ color: 0x4a4c50, metalness: 0.5, roughness: 0.45 });
  M.cable = std({ color: 0x15161a, roughness: 0.6, metalness: 0.1 });
  M.canvasLocal = std({ color: P.canvas, map: M.canvas.map, roughness: 0.92 });                                     // the locals' canvas, as the finish dyes it
  M.oak = std({ color: P.frame, map: M.timber.map, roughness: 0.85 });                                              // the hall's frame
  M.oakPale = std({ color: 0x8a6a46, map: M.timber.map, roughness: 0.85 });
  M.wall = std({ color: P.wall, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });            // fieldstone, limewashed in A
  M.stone = std({ color: 0x7e7a70, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });         // a footing course of darker stone
  M.earth = std({ color: 0x7e6e54, map: earthTex, roughness: 1 });
  M.deck = std({ color: 0x9a805c, map: plankTex, bumpMap: plankBump, bumpScale: 0.8, roughness: 0.9 });            // a timber boardwalk, the hall's floor
  M.gold = std({ color: 0xe0b040, metalness: 0.95, roughness: 0.32 });
  M.uniform = std({ color: P.uniform, roughness: 0.9 });                                                            // the Marine's fatigues
  M.armour = std({ color: P.armour, roughness: 0.65, metalness: 0.15 });                                             // helmet, knee pads, pouches: dark
  M.gun = std({ color: 0x1e1f23, metalness: 0.6, roughness: 0.4 });
  M.gunTan = std({ color: 0xb09a74, roughness: 0.7 });                                                              // a rifle's furniture, pale enough to read
  M.skin = std({ color: 0xc89a74, roughness: 0.8 });
  M.boot = std({ color: 0x2a2622, roughness: 0.8 });
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

/** Bot (the worker, sim r 9; "Utility bot" in the first brief): a flat wheeled box with a small arm, as Stelian's list says: a low rounded shell on
 *  four fat wheels in dark arches, a team deck panel on its back inside black trim, a tiny cool LED strip at the bow;
 *  out of the bow a short jointed arm whose gripper holds the worker's load well ahead: a tote heaped with gold
 *  coins, wider than the arm and as wide as the shell (the big load the worker owns, as the Rigger's sack). A patch
 *  of another shade on one flank, a lashed bundle of sand canvas on the stern: it has been repaired. From the camera:
 *  a pale rounded rectangle with a team middle, a square gold-topped box ahead of it. Frames 0-1: the arm bobs. */
export function utilityBot(M, f) {
  const g = grp(), b = grp(); g.add(b);
  add(b, rbox(12, 3.6, 8.6, 1.4), M.panel, 0, 3.6, 0);                                        // the shell
  add(b, rbox(12.4, 1.2, 9.0, 0.5), M.trim, 0, 2.2, 0);                                       // the dark skirt
  for (const [x, z] of [[-3.8, -4.6], [3.8, -4.6], [-3.8, 4.6], [3.8, 4.6]]) {                 // wheels in arches
    add(b, cyl(2.2, 2.2, 1.6, 16), M.rubber, x, 2.2, z, Math.PI / 2, 0, 0);
    add(b, cyl(1.1, 1.1, 1.7, 10), M.panelDark, x, 2.2, z, Math.PI / 2, 0, 0);                 // the hub
  }
  teamPlate(b, M, 10.6, 0.6, 7.6, -0.4, 5.6, 0);                                               // the team deck over the whole back
  add(b, rbox(12.2, 1.2, 8.8, 0.3), M.paint, 0, 3.4, 0); add(b, rbox(12.3, 0.3, 8.9, 0.1), M.inkLine, 0, 4.1, 0); add(b, rbox(12.3, 0.3, 8.9, 0.1), M.inkLine, 0, 2.75, 0); // a team band round the flanks between trims
  add(b, rbox(2.2, 1.0, 2.4, 0.3), M.panelDark, -4.6, 6.2, 2.4);                               // a hatch
  add(b, rbox(3.2, 2.2, 1.2, 0.3), M.panelDark, 4.2, 4.0, -4.9);                               // a patch on the flank, another shade
  add(b, sph(2.0, 10, 8), M.canvasLocal, -5.4, 6.4, -2.2).scale.set(1.1, 0.6, 0.9);            // a canvas bundle lashed on the stern
  add(b, torus(1.6, 0.18, 12), M.rope, -5.2, 6.1, -1.8, 0, 0.6, 0);
  for (const z of [-2.6, 0, 2.6]) led(b, M, 0.45, 6.1, 4.2, z);                                  // the LED strip at the bow
  add(b, cyl(0.6, 0.6, 4.5, 8), M.trim, -4.8, 7.6, 3.4);                                        // an antenna
  // the arm: a turret on the bow, an upper arm and a forearm reaching ahead and down, a gripper on the tote
  const arm = grp(); arm.position.set(4.0, 5.4, 0); b.add(arm);
  add(arm, cyl(1.6, 1.8, 1.4, 12), M.steel, 0, 0, 0);
  const bob = (f % 2) * 0.5;
  limb(arm, [0, 0.6, 0], [3.0, 4.0 - bob, 0], 1.1, M.white);                                    // the upper arm, white
  add(arm, sph(1.3, 10, 8), M.steel, 3.0, 4.0 - bob, 0);                                        // the elbow, steel
  limb(arm, [3.0, 4.0 - bob, 0], [6.4, 1.8, 0], 1.0, M.white);                                  // the forearm
  add(arm, sph(1.1, 10, 8), M.steel, 6.4, 1.8, 0);                                              // the wrist
  for (const s of [-1, 1]) limb(arm, [6.4, 1.8, 0], [7.6, -0.2, s * 2.6], 0.6, M.steel);         // the gripper's fingers on the tote
  // the load: a tote of coins held ahead, as wide as the shell
  const tote = grp(); tote.position.set(10.4, 0, 0); tote.rotation.y = 0.12; b.add(tote);
  add(tote, rbox(6.4, 4.8, 7.0, 0.5), M.panelDark, 0, 2.6, 0);
  add(tote, rbox(6.6, 0.5, 7.2, 0.1), M.inkLine, 0, 4.9, 0);                                     // its rim
  add(tote, sph(3.2, 14, 10), M.gold, 0, 5.0, 0).scale.set(1, 0.45, 1.05);                      // the coins heaped over the rim
  for (const [x, z] of [[1.2, 1.4], [-1.4, -1.0], [0.3, -2.2]]) add(tote, cyl(0.85, 0.85, 0.3, 10), M.gold, x, 6.2, z, (x - z) * 0.2, x, 0.25);
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

/** Traveller (the worker, sim r 9, scale 0.95): a person from the future who builds: practical work clothes in the
 *  finish's colour, a white hard hat with a small headlamp LED, a team work vest between ink hems, a tool belt with
 *  pouches, boots, and the worker's big cue carried in front with both hands: a wide team hard case (the flat rounded
 *  shape of the Expedition's kit) with a tablet clipped on its lid. From the camera: a white disc behind a team
 *  rectangle wider than the body: a worker, not the dark-helmeted Marine nor the hooded Villager. Frames 0-1 the walk. */
export function traveller(M, f) {
  const g = grp(), st = [3.2, -3.2][f % 2];
  for (const side of [-1, 1]) {
    const z = side * 2.1, s = st * side;
    add(g, rbox(3.4, 1.5, 2.2, 0.6), M.boot, s + 0.5, 0.75, z);
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, z * 1.05], 1.2, M.uniform);
    limb(g, [s * 0.55, 3.4, z * 1.05], [s, 1.3, z], 1.05, M.uniform);
  }
  const b = grp(); g.add(b); b.rotation.z = -0.08;
  add(b, rbox(5.0, 6.2, 6.6, 1.5), M.uniform, 0, 10.2, 0);                                     // the jacket
  add(b, rbox(5.6, 4.2, 7.2, 0.6), M.paint, 0.1, 10.6, 0);                                     // the work vest, team
  add(b, rbox(5.9, 0.5, 7.5, 0.1), M.inkLine, 0.1, 12.8, 0); add(b, rbox(5.9, 0.5, 7.5, 0.1), M.inkLine, 0.1, 8.4, 0); // its hems
  add(b, rbox(5.4, 1.0, 7.0, 0.3), M.joint, 0, 7.6, 0);                                        // the tool belt
  for (const [x, z] of [[-2.6, 2.2], [-2.6, -2.2], [1.8, -3.4]]) add(b, rbox(1.6, 2.2, 1.6, 0.4), M.armour, x, 6.8, z); // its pouches
  add(b, cyl(0.5, 0.5, 4.5, 8), M.steel, -2.4, 6.2, 3.6, 0.3, 0, 0.2);                          // a hammer's handle in the belt
  add(b, sph(1.8, 12, 10), M.skin, 0.8, 13.3, 0).scale.set(0.85, 1, 0.9);                      // the head
  add(b, sph(2.7, 16, 12), M.white, 0.1, 14.4, 0).scale.set(1, 0.7, 1);                        // the hard hat
  add(b, cyl(3.1, 3.1, 0.5, 18), M.white, 0.1, 13.5, 0);                                       // its brim
  add(b, cyl(3.2, 3.2, 0.3, 18), M.inkLine, 0.1, 13.2, 0);                                     // the dark line under it
  led(b, M, 0.5, 2.8, 14.2, 0);                                                                // the headlamp
  // the case: carried ahead with both hands, wide, a team lid inside ink trim, a tablet clipped on it
  const cs = grp(); cs.position.set(5.6, 8.0, 0); b.add(cs);
  add(cs, rbox(5.0, 4.6, 9.0, 0.9), M.paint, 0, 0, 0);
  add(cs, rbox(5.3, 0.4, 9.3, 0.1), M.inkLine, 0, 1.4, 0); add(cs, rbox(5.3, 0.4, 9.3, 0.1), M.inkLine, 0, -1.9, 0);
  add(cs, rbox(3.4, 0.5, 4.6, 0.2), M.glass, 0.4, 2.45, -1.2);                                  // the tablet on the lid
  add(cs, rbox(3.0, 0.2, 4.2, 0.1), M.visor, 0.4, 2.7, -1.2);                                   // its screen's glint
  for (const z of [-3.6, 3.6]) add(cs, rbox(1.6, 0.8, 1.2, 0.3), M.joint, 0, 2.6, z);             // latches
  for (const side of [-1, 1]) { limb(b, [0.6, 11, side * 3.6], [4.2, 9.6, side * 4.2], 1.1, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 4.6, 9.4, side * 4.3); } // both hands on the case's ends
  g.scale.setScalar(0.95);
  return g;
}

/** Buggy (the fast raider, light vehicle, sim r 12-13): an electric off-road buggy, low and wide: a flat chassis
 *  with team body panels (bonnet and flanks) between ink trim, four big knobbly tyres standing out at the corners,
 *  a tubular roll cage over the two seats, a light bar of cool LEDs across the cage's top, a bull bar of steel tube
 *  ahead, a small battery pack behind the seats, a whip antenna. From the camera: a wide rectangle with four dark
 *  wheels at its corners, bars over it, a lit strip: a vehicle, never a figure or an animal. Frames 0-1: the tyres
 *  turn (the hubs' marks). */
export function buggy(M, f) {
  const g = grp(), b = grp(); b.position.y = 3.2; g.add(b);
  add(b, rbox(17, 2.4, 10, 0.9), M.trim, 0, 0, 0);                                             // the chassis tub, the finish's edging
  teamPlate(b, M, 16.2, 1.4, 9.4, 0, 1.6, 0);                                                  // the body panel over it, team, an ink rim round it
  teamPlate(b, M, 6.4, 1.6, 8.8, 5.2, 2.9, 0, 0, 0, -0.12);                                     // the bonnet, team, sloping down ahead
  add(b, rbox(6.2, 2.6, 7.6, 0.6), M.panelDark, -5.6, 2.8, 0);                                  // the battery pack behind the seats
  add(b, rbox(1.4, 1.0, 1.0, 0.2), M.joint, -5.2, 4.4, -2.4); led(b, M, 0.35, -5.2, 4.9, -2.4);  // its charge light
  for (const z of [-1.9, 1.9]) { add(b, rbox(3.0, 1.4, 3.0, 0.5), M.armour, -0.2, 2.6, z); add(b, rbox(1.2, 4.0, 3.0, 0.5), M.armour, -1.9, 4.6, z); } // two seats
  for (const [x, z] of [[-4.4, -4.8], [4.4, -4.8], [-4.4, 4.8], [4.4, 4.8]]) {                 // the wheels: big knobbly tyres on dark hubs, out at the corners
    add(b, cyl(3.3, 3.3, 2.6, 18), M.rubber, x, 0.1, z, Math.PI / 2, 0, 0);
    add(b, cyl(1.7, 1.7, 2.7, 10), M.joint, x, 0.1, z, Math.PI / 2, 0, 0);
    add(b, rbox(2.4, 0.5, 2.8, 0.1), M.steel, x, 0.1, z, Math.PI / 2, (f % 2) * 0.6, 0);         // a spoke mark that turns by frame
    add(b, rbox(4.0, 1.0, 1.4, 0.3), M.joint, x, 1.6, z * 0.72);                                 // the wishbone
  }
  // the roll cage: four tubes up from the tub to a roof frame, a cross bar, the light bar on its front edge
  const cage = M.steel;
  for (const [x, z] of [[-3.6, -3.8], [3.0, -3.8], [-3.6, 3.8], [3.0, 3.8]]) limb(b, [x, 1.6, z], [x * 0.9, 8.2, z * 0.9], 0.45, cage);
  for (const z of [-3.4, 3.4]) limb(b, [-3.2, 8.2, z], [2.7, 8.2, z], 0.45, cage);
  for (const x of [-3.2, 2.7]) limb(b, [x, 8.2, -3.4], [x, 8.2, 3.4], 0.45, cage);
  limb(b, [-3.2, 8.2, -3.4], [2.7, 8.2, 3.4], 0.3, cage);                                       // the roof's cross brace
  add(b, rbox(1.0, 1.0, 7.4, 0.3), M.joint, 3.0, 8.9, 0);                                       // the light bar's housing
  for (const z of [-2.6, -0.9, 0.9, 2.6]) led(b, M, 0.42, 3.4, 9.0, z);                            // its lamps
  // the bull bar ahead, steel tube; a whip antenna; a spare wheel on the back
  limb(b, [9.6, 1.4, -4.2], [9.6, 1.4, 4.2], 0.5, cage); limb(b, [9.6, 3.6, -3.2], [9.6, 3.6, 3.2], 0.5, cage);
  for (const z of [-3.2, 3.2]) limb(b, [9.6, 0.2, z], [9.6, 4.2, z], 0.45, cage);
  for (const z of [-3.2, 3.2]) limb(b, [8.4, 2.0, z], [9.6, 2.0, z], 0.4, cage);
  add(b, cyl(0.2, 0.2, 8, 6), M.joint, -8.2, 7, 3.6);
  add(b, cyl(2.6, 2.6, 1.6, 16), M.rubber, -9.2, 3.4, 0, 0, 0, Math.PI / 2); add(b, cyl(1.3, 1.3, 1.8, 10), M.joint, -9.2, 3.4, 0, 0, 0, Math.PI / 2);
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
  for (const side of [-1, 1]) {
    const z = side * 2.1, s = st * side;
    add(g, rbox(3.6, 1.6, 2.3, 0.6), M.boot, s + 0.6, 0.8, z);
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, z * 1.05], 1.25, M.uniform);
    limb(g, [s * 0.55, 3.4, z * 1.05], [s, 1.3, z], 1.1, M.uniform);
    add(g, sph(1.0, 8, 6), M.armour, s * 0.6, 3.6, z * 1.1).scale.set(1.1, 1, 0.9);              // a knee pad
  }
  const b = grp(); g.add(b);
  add(b, rbox(5.0, 6.4, 6.6, 1.5), M.uniform, 0, 10.2, 0);                                     // the torso
  add(b, rbox(5.8, 4.8, 7.4, 0.8), M.paint, 0.2, 10.4, 0);                                     // the plate carrier, team, proud of the torso all round
  add(b, rbox(6.1, 0.5, 7.7, 0.1), M.inkLine, 0.2, 12.9, 0); add(b, rbox(6.1, 0.5, 7.7, 0.1), M.inkLine, 0.2, 7.9, 0); // its ink trims
  for (const z of [-1.8, 0, 1.8]) add(b, rbox(1.4, 1.8, 1.4, 0.3), M.armour, 3.0, 9.6, z);       // magazine pouches on the chest
  add(b, rbox(5.2, 0.9, 7.0, 0.3), M.armour, 0, 7.2, 0);                                        // the belt
  // the backpack: big and square on the back, a team lid plate inside ink trim, a bedroll under it, the antenna
  add(b, rbox(4.4, 7.0, 7.0, 0.9), M.armour, -4.6, 10.6, 0);
  teamPlate(b, M, 3.6, 0.5, 6.2, -4.6, 14.2, 0);                                               // its lid
  add(b, cyl(1.2, 1.2, 6.6, 10), M.uniform, -4.8, 6.6, 0, Math.PI / 2, 0, 0);                   // the bedroll
  add(b, rbox(1.4, 2.4, 1.2, 0.3), M.joint, -6.0, 9.6, -2.4);                                   // a radio
  add(b, cyl(0.25, 0.25, 8, 6), M.joint, -6.0, 14.8, -2.4);                                     // its antenna
  add(b, sph(1.7, 12, 10), M.skin, 0.9, 13.3, 0).scale.set(0.8, 0.95, 0.9);                    // the face
  add(b, sph(2.7, 16, 12), M.armour, 0.1, 14.2, 0).scale.set(1, 0.85, 1);                      // the helmet, dark, rounded
  add(b, cyl(2.8, 2.8, 0.4, 16), M.inkLine, 0.1, 13.1, 0);                                     // its rim line
  add(b, rbox(2.2, 1.3, 4.4, 0.4), M.joint, 1.6, 15.0, 0);                                     // the goggles, pushed up on the helmet
  add(b, rbox(1.0, 0.9, 4.0, 0.2), M.visor, 2.4, 15.1, 0);                                     // their lenses: the glint
  add(b, rbox(0.4, 0.8, 5.6, 0.1), M.joint, 0.2, 15.1, 0);                                      // their strap
  // the rifle: short, held level across the body ahead of the chest; a pale handguard and stock so the bar reads
  const gun = grp(); gun.position.set(3.4, 9.6, 0); gun.rotation.set(0, 0.25, 0.05); b.add(gun);
  add(gun, rbox(3.2, 1.6, 1.6, 0.4), M.gunTan, -3.0, 0, 0);                                     // the stock
  add(gun, rbox(3.6, 2.0, 1.8, 0.3), M.gun, 0.2, 0, 0);                                         // the receiver
  add(gun, rbox(1.2, 2.8, 1.1, 0.3), M.gun, 0.2, -1.8, 0);                                      // the magazine
  add(gun, rbox(1.0, 1.4, 1.0, 0.2), M.gun, -1.2, -1.2, 0);                                     // the grip
  add(gun, rbox(1.4, 0.9, 1.0, 0.2), M.gun, 0.4, 1.3, 0);                                       // the sight
  add(gun, rbox(3.6, 1.4, 1.5, 0.4), M.gunTan, 3.6, 0, 0);                                      // the handguard
  add(gun, cyl(0.45, 0.45, 2.4, 8), M.gun, 6.4, 0.2, 0, 0, 0, Math.PI / 2);                     // the barrel, short
  limb(b, [0.6, 11.4, 3.6], [2.4, 9.4, 1.8], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 2.6, 9.2, 1.6);  // the trigger hand, gloved
  limb(b, [0.6, 11.4, -3.6], [6.0, 9.8, -1.4], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 6.4, 9.8, -1.2); // the fore hand on the handguard
  g.scale.setScalar(1.08);
  return g;
}

/** Data centre (the main building, 4x4): round 2's redo (the judge read the first as "a clean white composite box
 *  with a chiller bank on a deck"). A long fieldstone hall in an oak frame (posts, rails and X-braces dark on pale
 *  stone, so the frame reads at 1x) on a stone footing, lower, longer and flatter than the castle, under a pitched
 *  canvas roof whose east half is open to the sky: inside, two rows of server racks on a plank floor, each a slotted
 *  front and a team lid with a small light, their LEDs the hall's glow. Three round cooling fans are set into the
 *  west half's south slope (dark housings, pale rings and blades) and two extractor fans into the south wall; cables
 *  run along the eave to an oak mast with a dish and a light at the east end, and down to a solar rack of dark glass
 *  in the yard; a team canvas awning on oak posts shades the boardwalk at the west door; team hard cases, barrels,
 *  a stone trough, a small wind rotor. The mark (a ring and a dot) on a plank sign board. On trodden earth with a
 *  stone footing (Stelian's rule: modern components, medieval materials; no concrete). Team: the roof's west half
 *  canvas (both slopes, between ink hems), the awning, the racks' lids, the cases, a tarp over the spare stone. */
export function dataCentre(M) {
  const g = grp();
  add(g, plate(oct(62), 2.2, 0.8), M.earth, 0, 0, 0);                                            // trodden earth
  const HX = -2, HZ = -10, HL = 108, HW = 34, HH = 13, RH = 10, OPEN = 10;                        // (OPEN: the roof's east half starts here)
  add(g, rbox(HL + 4, 3, HW + 4, 0.5), M.stone, HX, 3, HZ);                                      // the footing course
  add(g, rbox(HL, HH, HW, 0.6), M.wall, HX, HH / 2 + 3, HZ);                                     // fieldstone walls
  add(g, rbox(HL - 2, 1.2, HW - 2, 0.3), M.deck, HX, HH + 2.8, HZ);                               // the plank floor, seen through the open roof (a loft floor)
  // the oak frame on the long faces: posts every 13.5, two rails, an X-brace in every other bay; the wall plate
  for (let k = 0; k <= 8; k++) for (const z of [-1, 1]) add(g, rbox(1.8, HH + 0.6, 1.5, 0.3), M.oak, HX - HL / 2 + k * 13.5, HH / 2 + 3, HZ + z * (HW / 2 + 0.4));
  for (const z of [-1, 1]) for (const y of [7.5, 12.5]) add(g, rbox(HL + 1, 1.4, 1.3, 0.3), M.oak, HX, y, HZ + z * (HW / 2 + 0.5));
  for (let k = 0; k < 8; k += 2) for (const d of [-1, 1]) add(g, rbox(14.2, 1.2, 1.0, 0.2), M.oak, HX - HL / 2 + (k + 0.5) * 13.5, 9.5, HZ + HW / 2 + 0.9, 0, 0, d * 0.46); // X-braces on the south face
  add(g, rbox(HL + 2, 2.0, HW + 1.6, 0.4), M.oak, HX, HH + 4.0, HZ);                              // the wall plate
  // the roof: a pitched gable along x over the west half only; the east half open, its rafters bare
  const slope = Math.atan2(RH, (HW + 6) / 2), ry = HH + 4.8, sy = (z) => ry + RH - Math.abs(z) * Math.tan(slope);
  const WL = HL / 2 + OPEN, WX = HX - HL / 2 + WL / 2;                                             // the west half's length and centre
  add(g, gable(HW + 6, RH, WL + 2), M.canvasLocal, WX, ry, HZ, 0, Math.PI / 2, 0);
  add(g, rbox(WL, 0.5, 20.5, 0.15), M.paintCloth, WX, sy(-10.2) + 0.9, HZ - 10.2, -slope, 0, 0); add(g, rbox(WL + 0.6, 0.35, 21.1, 0.1), M.inkLine, WX, sy(-10.2) + 0.5, HZ - 10.2, -slope, 0, 0); // team canvas over the north slope, between ink hems
  add(g, rbox(WL, 0.5, 8.5, 0.15), M.paintCloth, WX, sy(16.5) + 0.9, HZ + 16.5, slope, 0, 0); add(g, rbox(WL + 0.6, 0.35, 9.1, 0.1), M.inkLine, WX, sy(16.5) + 0.5, HZ + 16.5, slope, 0, 0); // and team bands along the south slope's eave and ridge; its canvas stays pale between, the fans on it
  add(g, rbox(WL, 0.5, 5.5, 0.15), M.paintCloth, WX, sy(2.8) + 0.9, HZ + 2.8, slope, 0, 0); add(g, rbox(WL + 0.6, 0.35, 6.1, 0.1), M.inkLine, WX, sy(2.8) + 0.5, HZ + 2.8, slope, 0, 0);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) add(g, cyl(0.3, 0.3, 21, 6), M.rope, WX - WL / 2 + 4 + k * (WL - 8) / 5, sy(10.2) + 1.6, HZ + s * 10.2, Math.PI / 2 + s * slope, 0, 0); // lashings
  for (let k = 0; k < 3; k++) for (const d of [-1, 1]) add(g, rbox(14.2, 1.2, 1.0, 0.2), M.oak, HX + HL / 2 - OPEN - 8 - k * 13.5 + 0, 9.5, HZ + HW / 2 + 1.0, 0, 0, d * 0.46); // (braces again where the panels go, so the frame shows between them)
  for (const x of [HX + HL / 2 - OPEN - 7, HX + HL / 2 - OPEN - 21, HX + HL / 2 - OPEN - 35]) { add(g, rbox(10.6, 7.6, 0.8, 0.3), M.paint, x, 11.3, HZ + HW / 2 + 1.3); add(g, rbox(11.2, 8.2, 0.5, 0.1), M.inkLine, x, 11.3, HZ + HW / 2 + 1.0); } // team panels bolted to the frame under the open roof
  add(g, rbox(HL + 4, 1.8, 1.8, 0.4), M.oak, HX, ry + RH + 0.6, HZ);                              // the ridge beam, the whole length
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) add(g, rbox(1.2, 1.2, 21.5, 0.3), M.oak, HX + HL / 2 - OPEN - 3 - k * 9, sy(10.2) + 0.2, HZ + s * 10.2, s * slope, 0, 0); // the open half's bare rafters
  add(g, gable(HW + 6, RH, 2), M.oak, WX + WL / 2 + 1.5, ry, HZ, 0, Math.PI / 2, 0);              // the gable truss where the canvas ends
  // the racks inside the open half: two rows of five, slotted fronts south, a team lid with a light on each
  for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) {
    const x = HX + HL / 2 - OPEN - 6 - k * 8.5, z = HZ - 8 + row * 12;
    add(g, rbox(5.4, 11, 5.6, 0.4), M.rackSide, x, HH + 3.4 + 5.5, z);
    add(g, rbox(5.0, 10.4, 0.6, 0.1), M.rack, x, HH + 3.4 + 5.5, z + 2.9);                        // the slotted front
    teamPlate(g, M, 4.6, 0.5, 4.8, x, HH + 3.4 + 11.2, z);                                       // the lid
    led(g, M, 0.4, x + 1.4, HH + 3.4 + 11.8, z + 1.4);
    for (let j = 0; j < 3; j++) led(g, M, 0.3, x - 1.6 + j * 1.2, HH + 3.4 + 3 + j * 2.4, z + 3.3); // LEDs down the front
  }
  // the fans: three round housings set into the west half's south slope; two extractor fans in the south wall
  for (let k = 0; k < 3; k++) {
    const x = WX - 16 + k * 16, z = HZ + 8, fan = grp(); fan.position.set(x, sy(8) + 0.9, z); fan.rotation.x = slope; g.add(fan);
    add(fan, cyl(6.4, 6.4, 3.0, 20), M.joint, 0, 1.5, 0);
    add(fan, cyl(5.8, 5.8, 0.4, 20), M.glass, 0, 3.1, 0);                                         // the grille, dark
    add(fan, torus(6.1, 0.55, 24), M.white, 0, 3.2, 0, Math.PI / 2, 0, 0);                         // the pale ring
    for (let j = 0; j < 4; j++) add(fan, rbox(10.8, 0.4, 1.6, 0.2), M.white, 0, 3.4, 0, 0, j * Math.PI / 4 + 0.3, 0); // the blades
    add(fan, cyl(1.4, 1.4, 0.8, 10), M.joint, 0, 3.5, 0);
  }
  for (const x of [HX - 44, HX - 20]) { const fan = grp(); fan.position.set(x, 9.5, HZ + HW / 2 + 1.2); fan.rotation.x = Math.PI / 2; g.add(fan); add(fan, cyl(3.4, 3.4, 1.6, 16), M.joint, 0, 0, 0); add(fan, cyl(3.0, 3.0, 0.4, 16), M.glass, 0, 0.9, 0); for (let j = 0; j < 3; j++) add(fan, rbox(5.6, 0.3, 1.0, 0.1), M.white, 0, 1.1, 0, 0, j * Math.PI / 3, 0); } // wall fans
  // the west door and the awning over the boardwalk, on oak posts; hard cases and barrels under it
  add(g, rbox(7, 9, 1.2, 0.4), M.oak, HX - 38, 7.5, HZ + HW / 2 + 0.8);
  add(g, rbox(92, 1.6, 18, 0.3), M.deck, HX - 4, 2.8, HZ + HW / 2 + 11);                           // the boardwalk
  const AX = HX - 30;
  for (const x of [AX - 22, AX + 22]) for (const z of [HZ + HW / 2 + 8, HZ + HW / 2 + 20]) add(g, cyl(0.7, 0.8, 10, 6), M.oak, x, 7.5, z);
  { const p = grp(); p.position.set(AX, 11.6, HZ + HW / 2 + 14.5); p.rotation.x = 0.12; g.add(p); add(p, rbox(50.6, 0.4, 15.6, 0.1), M.inkLine, 0, -0.1, 0); add(p, rbox(50, 0.6, 15, 0.2), M.paintCloth, 0, 0.1, 0); for (const x of [-12, 0, 12]) add(p, rbox(0.5, 0.5, 15.6, 0.1), M.rope, x, 0.5, 0); } // the awning, team canvas inside an ink hem, low and shallow so the stone and the frame show over it
  for (let k = 0; k < 5; k++) { const cs = grp(); cs.position.set(AX + 4 + (k % 3) * 8, 3.6 + Math.floor(k / 3) * 4.6, HZ + HW / 2 + 13 + (k % 2) * 2); cs.rotation.y = (k % 2) * 0.25; g.add(cs); add(cs, rbox(8, 4.4, 6, 0.9), M.paint, 0, 2.2, 0); add(cs, rbox(8.3, 0.4, 6.3, 0.1), M.inkLine, 0, 2.2, 0); add(cs, rbox(8.3, 0.4, 6.3, 0.1), M.inkLine, 0, 4.3, 0); for (const z of [-1.8, 1.8]) add(cs, rbox(1.4, 0.6, 1.0, 0.2), M.joint, 0, 4.6, z); } // hard cases
  for (const [x, z] of [[-50, 36], [-45, 40], [-48, 44]]) { add(g, cyl(2.4, 2.6, 5, 12), M.oakPale, x, 4.5, z); for (const y of [3.2, 6]) add(g, torus(2.65, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); } // barrels
  // the sign board with the mark, over the door
  add(g, rbox(10, 5, 0.8, 0.3), M.deck, HX - 24, 15.5, HZ + HW / 2 + 1.0);
  add(g, torus(1.6, 0.45, 20), M.joint, HX - 26, 15.5, HZ + HW / 2 + 1.5); add(g, sph(0.7, 8, 6), M.joint, HX - 26, 15.5, HZ + HW / 2 + 1.5);
  add(g, rbox(3.4, 0.7, 0.4, 0.1), M.joint, HX - 21.8, 16.1, HZ + HW / 2 + 1.5); add(g, rbox(3.4, 0.7, 0.4, 0.1), M.joint, HX - 21.8, 14.9, HZ + HW / 2 + 1.5);
  // the mast at the east end: an oak pole with a dish and a light, cables from the ridge to it and down to the solar rack
  const MX = HX + HL / 2 + 6, MZ = HZ + 6;
  add(g, cyl(0.8, 1.2, 40, 8), M.oak, MX, 22, MZ); add(g, rbox(1.4, 1.4, 1.4, 0.3), M.joint, MX, 42.5, MZ);
  add(g, cyl(3.6, 3.6, 0.5, 16), M.white, MX + 1.6, 38, MZ + 1.0, 0.9, 0, -0.5); add(g, cyl(0.3, 0.3, 3, 6), M.joint, MX + 2.4, 38.6, MZ + 1.8, 0.9, 0, -0.5); // the dish, tilted south-east
  led(g, M, 0.6, MX, 43.6, MZ);
  limb(g, [HX + 10, ry + RH + 1.2, HZ], [MX, 41, MZ], 0.35, M.cable);                             // the cable from the ridge to the mast top
  limb(g, [MX, 20, MZ], [40, 7, 34], 0.4, M.cable); limb(g, [40, 7, 34], [HX + 30, 3, HZ + HW / 2 + 2], 0.4, M.cable); // and down to the solar rack and the hall
  add(g, rbox(HL - 6, 0.9, 0.9, 0.3), M.cable, HX, HH + 2.2, HZ + HW / 2 + 1.6);                   // the bundle along the south eave
  const sr = grp(); sr.position.set(40, 2, 34); g.add(sr);                                        // the solar rack in the yard: three dark panels tilted south on an oak frame
  for (const z of [-5, 5]) for (const x of [-11, 11]) add(sr, cyl(0.6, 0.7, z < 0 ? 8 : 4, 6), M.oak, x, z < 0 ? 4 : 2, z);
  add(sr, rbox(28, 0.8, 12, 0.2), M.glass, 0, 6.2, 0, 0.42, 0, 0);
  for (const x of [-4.7, 4.7]) add(sr, rbox(0.5, 0.9, 12.2, 0.1), M.white, x, 6.3, 0, 0.42, 0, 0);
  add(sr, rbox(28.4, 0.4, 12.4, 0.1), M.joint, 0, 5.8, 0, 0.42, 0, 0);
  const wm = grp(); wm.position.set(-50, 2, -46); g.add(wm);                                      // a small wind rotor on an oak mast, north-west
  add(wm, cyl(0.7, 1.0, 30, 8), M.oak, 0, 15, 0); add(wm, rbox(3.2, 2.0, 2.0, 0.6), M.white, 0.8, 30.6, 0);
  for (let k = 0; k < 3; k++) add(wm, rbox(0.8, 8, 1.4, 0.3), M.white, 2.4, 30.6 + 4 * Math.cos(k * 2.094 + 0.4), 4 * Math.sin(k * 2.094 + 0.4), k * 2.094 + 0.4, 0, 0);
  add(g, rbox(14, 3.6, 6, 0.4), M.stone, -46, 3.8, 48); add(g, rbox(12.4, 0.6, 4.6, 0.2), M.glass, -46, 5.5, 48); // a stone trough of water
  for (const x of [48, 56]) for (const z of [-50, -44]) add(g, rbox(3.2, 2.4, 2.4, 0.4), M.stone, x, 3.4, z);     // spare stone
  teamPlate(g, M, 16, 0.6, 9, 52, 7.0, -47, 0, 0, 0.08); for (const x of [46, 58]) add(g, cyl(0.4, 0.5, 5, 6), M.oak, x, 4.5, -47); // a team tarp over it
  for (let k = 0; k < 4; k++) add(g, rbox(16, 1.2, 2.4, 0.3), M.oakPale, 40, 3.2 + k * 1.2, 52 - k * 0.3);       // stacked planks
  for (const x of [-46, -20, 6, 32]) led(g, M, 0.45, HX + x, HH + 3.0, HZ + HW / 2 + 2.6);         // a string of lamps along the eave
  return g;
}

/** The gold deposit (`rt_coins`): heaps of coins where today's salt sits, loose coins round them, on a dark footing of
 *  earth: the resource both peoples dig. */
export function coins(M) {
  const g = grp(), gold = new THREE.MeshStandardMaterial({ color: 0xd8a838, metalness: 0.7, roughness: 0.5 }), goldDark = new THREE.MeshStandardMaterial({ color: 0x8a6420, metalness: 0.6, roughness: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 });
  seed = 97;
  for (const [x, z, r] of [[0, 0, 9], [-12, 6, 6.5], [11, -5, 5.5], [4, 12, 4.5], [-6, -10, 4]]) {
    add(g, cyl(r * 1.1, r * 1.25, 0.6, 14), dark, x, 0.3, z);
    add(g, cyl(r * 0.55, r * 0.95, r * 0.5, 14), goldDark, x, r * 0.25 + 0.3, z);                 // the heap's core, dark gold
    for (let k = 0; k < 10 + r * 3; k++) {                                                       // coins piled over it, each its own tilt
      const a = rnd() * 6.3, d = Math.sqrt(rnd()) * r * 0.95, y = 0.5 + Math.max(0, r * 0.5 * (1 - (d / r) ** 2) * 1.1);
      add(g, cyl(1.1, 1.1, 0.35, 10), gold, x + Math.cos(a) * d, y, z + Math.sin(a) * d * 0.9, (rnd() - 0.5) * 0.9, rnd() * 3, (rnd() - 0.5) * 0.9);
    }
  }
  for (let k = 0; k < 14; k++) { const a = rnd() * 6.3, d = 10 + rnd() * 12; add(g, cyl(1.0, 1.0, 0.3, 10), gold, Math.cos(a) * d, 0.3, Math.sin(a) * d * 0.8, 0, rnd() * 3, 0); }
  return g;
}
