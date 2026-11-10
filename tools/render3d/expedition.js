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
  M.visor = std({ color: 0xb8ecf8, emissive: 0x6ac0d8, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.15 });   // a goggle's glint, a screen
  M.hivis = std({ color: 0xe8e8e0, emissive: 0x606060, emissiveIntensity: 0.3, roughness: 0.5 });                      // reflective bands: the brightest cloth on a figure
  M.roofDark = std({ color: 0x4a3a2a, map: plankTex, bumpMap: plankBump, bumpScale: 1.0, roughness: 0.9 });          // the hall's roof: dark weathered planks
  M.paintOak = team(std({ color: tc.paint, map: M.timber.map, roughness: 0.8, metalness: 0.05 }));                    // the hall's frame painted in the company's colour
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
  M.wall = std({ color: 0x8e8a80, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });          // grey fieldstone (round 3: walls that read as walls)
  M.stone = std({ color: 0x7e7a70, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });         // a footing course of darker stone
  M.earth = std({ color: 0x66563c, map: earthTex, roughness: 1 });                                                  // trodden earth, the grass's dirt (round 3: a pale plate read as a deck)
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

/** Bot (the worker, sim r 9; "Utility bot" in the first brief, back in the picture in round 3): a flat wheeled box with a small arm, as Stelian's list says: a low rounded shell on
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
  add(b, sph(2.7, 16, 12), M.white, 0.1, 14.4, 0).scale.set(1, 0.7, 1);                        // the hard hat
  add(b, cyl(3.1, 3.1, 0.5, 18), M.white, 0.1, 13.5, 0);                                       // its brim
  add(b, cyl(3.2, 3.2, 0.3, 18), M.inkLine, 0.1, 13.2, 0);                                     // the dark line under it
  led(b, M, 0.5, 2.8, 14.2, 0);                                                                // the headlamp
  // the case: carried out to the left side in one hand, a bright white block with a team lid band, a tablet on it
  const cs = grp(); cs.position.set(1.0, 5.6, -6.6); cs.rotation.y = 0.1; b.add(cs);
  add(cs, rbox(9.0, 5.4, 4.2, 0.9), M.white, 0, 0, 0);
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
  for (const [x, z] of [[-5.2, -6.6], [5.2, -6.6], [-5.2, 6.6], [5.2, 6.6]]) {                 // the wheels: oversize knobbly tyres on dark hubs, well out past the body so four dark discs show from above
    add(b, cyl(4.2, 4.2, 3.2, 18), M.rubber, x, 1.0, z, Math.PI / 2, 0, 0);
    add(b, cyl(2.0, 2.0, 3.3, 10), M.joint, x, 1.0, z, Math.PI / 2, 0, 0);
    add(b, rbox(3.0, 0.5, 3.4, 0.1), M.steel, x, 1.0, z, Math.PI / 2, (f % 2) * 0.6, 0);         // a spoke mark that turns by frame
    add(b, rbox(4.0, 1.0, 3.0, 0.3), M.joint, x, 1.4, z * 0.78);                                 // the wishbone out to it
  }
  // the roll cage: four tubes up from the tub to a roof frame, a cross bar, the light bar on its front edge
  const cage = M.steel;
  for (const [x, z] of [[-3.6, -3.8], [3.0, -3.8], [-3.6, 3.8], [3.0, 3.8]]) limb(b, [x, 1.6, z], [x * 0.9, 8.2, z * 0.9], 0.45, cage);
  for (const z of [-3.4, 3.4]) limb(b, [-3.2, 8.2, z], [2.7, 8.2, z], 0.45, cage);
  for (const x of [-3.2, 2.7]) limb(b, [x, 8.2, -3.4], [x, 8.2, 3.4], 0.45, cage);
  teamPlate(b, M, 6.2, 0.5, 7.0, -0.25, 8.6, 0);                                              // a team roof panel on the cage
  for (const z of [-1.9, 1.9]) add(b, rbox(0.6, 3.4, 2.6, 0.2), M.paint, -1.2, 4.6, z);           // the seat backs, team
  add(b, rbox(1.0, 1.0, 7.4, 0.3), M.joint, 3.0, 8.9, 0);                                       // the light bar's housing
  for (const z of [-2.6, -0.9, 0.9, 2.6]) led(b, M, 0.42, 3.4, 9.0, z);                            // its lamps
  // the bull bar ahead, steel tube; a whip antenna; a spare wheel on the back
  limb(b, [12.2, 1.4, -5.4], [12.2, 1.4, 5.4], 0.6, cage); limb(b, [12.2, 4.0, -4.2], [12.2, 4.0, 4.2], 0.6, cage); // the bull bar, out past the bonnet
  for (const z of [-4.2, 4.2]) limb(b, [12.2, 0.2, z], [12.2, 4.8, z], 0.5, cage);
  for (const z of [-3.4, 3.4]) limb(b, [8.6, 2.2, z], [12.2, 2.4, z], 0.45, cage);              // its stays back to the chassis
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
  for (const side of [-1, 1]) {                                                                 // a wide stance (round 3)
    const z = side * 2.1, s = st * side, zf = side * 3.4;
    add(g, rbox(3.6, 1.6, 2.3, 0.6), M.boot, s + 0.6, 0.8, zf);
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, zf * 0.95], 1.25, M.uniform);
    limb(g, [s * 0.55, 3.4, zf * 0.95], [s, 1.3, zf], 1.1, M.uniform);
    add(g, sph(1.0, 8, 6), M.armour, s * 0.6, 3.6, zf * 0.95).scale.set(1.1, 1, 0.9);           // a knee pad
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
  add(b, sph(0.5, 8, 6), M.white, 2.9, 15.5, -0.8);                                             // a highlight on the lens
  add(b, rbox(0.4, 0.8, 5.6, 0.1), M.joint, 0.2, 15.1, 0);                                      // their strap
  // the rifle: short, held level across the body ahead of the chest; a pale handguard and stock so the bar reads
  const gun = grp(); gun.position.set(3.6, 9.6, 0); gun.rotation.set(0, 0.3, 0.04); b.add(gun); // (thicker and a little longer since round 3: a two-pixel bar at 1x)
  add(gun, rbox(3.6, 2.2, 2.2, 0.5), M.gunTan, -3.4, 0, 0);                                     // the stock
  add(gun, rbox(4.0, 2.6, 2.4, 0.4), M.gun, 0.4, 0, 0);                                         // the receiver
  add(gun, rbox(1.4, 3.0, 1.3, 0.3), M.gun, 0.4, -2.2, 0);                                      // the magazine
  add(gun, rbox(1.1, 1.5, 1.1, 0.2), M.gun, -1.2, -1.4, 0);                                     // the grip
  add(gun, rbox(1.6, 1.0, 1.1, 0.2), M.gun, 0.6, 1.6, 0);                                       // the sight
  add(gun, rbox(4.6, 2.0, 2.1, 0.5), M.gunTan, 4.6, 0, 0);                                      // the handguard
  add(gun, cyl(0.7, 0.7, 3.4, 8), M.gun, 8.4, 0.2, 0, 0, 0, Math.PI / 2);                       // the barrel
  limb(b, [0.6, 11.4, 3.6], [2.4, 9.4, 1.8], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 2.6, 9.2, 1.6);  // the trigger hand, gloved
  limb(b, [0.6, 11.4, -3.6], [6.0, 9.8, -1.4], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 6.4, 9.8, -1.2); // the fore hand on the handguard
  g.scale.setScalar(1.08);
  return g;
}

/** Data centre (the main building, 4x4): round 3's rebuild (the judge read round 2's as a market stall: a pale deck,
 *  a team roof slab, an awning). A long hall of grey fieldstone on a stone footing: a solid south wall with a door
 *  and small windows, stone gables at both ends up to the ridge, the oak frame's posts and rails painted in the
 *  company's colour (team on small vertical pieces), under a dark plank roof. The roof's east third is open: two
 *  rows of server racks stand inside on a plank floor, dark slotted fronts, team lids. Three big cooling fans are set
 *  into the closed roof's south slope, each a dark housing with a lit ring and hub: the fans are the lights. Cables
 *  in a team-trimmed tray along the south eave run to an oak mast with a dish and a team banner at the east end, and
 *  down to a solar rack of dark glass. Team also on the door, a cloth hung from the eave by the door, the hard cases
 *  under a small awning, a tarp over the crates: the sixth, spread, no slab. Trodden earth, a stone footing, crates,
 *  barrels, a trough (Stelian's rule: modern components, medieval materials; no concrete, no deck). */
export function dataCentre(M) {
  const g = grp();
  add(g, plate(oct(62).map(([x, z]) => [x, z * 0.82]), 2.2, 0.8), M.earth, 0, 0, 0);               // trodden earth, a little less deep than wide
  const HX = -2, HZ = -8, HL = 108, HW = 34, HH = 14, RH = 11, OPEN = 34, SZ = HZ + HW / 2;        // (OPEN: the roof's east part, open; SZ: the south face)
  add(g, rbox(HL + 4, 3, HW + 4, 0.5), M.stone, HX, 3, HZ);                                      // the footing course
  add(g, rbox(HL, HH, HW, 0.6), M.wall, HX, HH / 2 + 3, HZ);                                     // fieldstone walls
  for (const sx of [-1, 1]) add(g, gable(HW + 1, RH, 1.8), M.wall, HX + sx * (HL / 2 - 0.9), HH + 3, HZ, 0, Math.PI / 2, 0); // stone gable ends up to the ridge
  add(g, rbox(HL - 2, 1.0, HW - 2, 0.3), M.deck, HX, HH + 3.0, HZ);                                // the plank floor seen through the open roof (a loft)
  // the frame, painted: posts every 13.5 on the long faces, two rails, the wall plate; the door and the windows on the south face
  for (let k = 0; k <= 8; k++) for (const z of [-1, 1]) add(g, rbox(1.8, HH + 0.6, 1.5, 0.3), M.paintOak, HX - HL / 2 + k * 13.5, HH / 2 + 3, HZ + z * (HW / 2 + 0.4));
  for (const z of [-1, 1]) for (const y of [8, 13]) add(g, rbox(HL + 1, 1.3, 1.3, 0.3), M.paintOak, HX, y, HZ + z * (HW / 2 + 0.5));
  for (let k = 0; k <= 8; k++) for (const z of [-1, 1]) for (const y of [8, 13]) add(g, rbox(2.2, 0.5, 1.7, 0.1), M.inkLine, HX - HL / 2 + k * 13.5, y + (y > 10 ? 0.9 : -0.9), HZ + z * (HW / 2 + 0.4)); // ink at the joints
  add(g, rbox(HL + 2, 1.6, HW + 1.6, 0.4), M.paintOak, HX, HH + 3.8, HZ);                         // the wall plate, painted too
  add(g, rbox(HL + 2.4, 0.3, HW + 2.0, 0.1), M.inkLine, HX, HH + 3.0, HZ);                        // ink under it
  add(g, rbox(6.6, 9.4, 1.0, 0.3), M.paint, HX - 33.5, 7.7, SZ + 0.9);                             // the door, painted team
  add(g, rbox(7.4, 10.2, 0.6, 0.1), M.inkLine, HX - 33.5, 8.1, SZ + 0.6);                          // its frame, ink
  for (const x of [-47, -20, -6.5, 7]) { add(g, rbox(2.6, 3.2, 1.0, 0.2), M.glass, HX + x, 10.5, SZ + 0.8); add(g, rbox(3.2, 3.8, 0.5, 0.1), M.inkLine, HX + x, 10.5, SZ + 0.6); } // small windows, dark glass in ink frames
  // the roof: dark planks over the west part, both slopes; a ridge beam the whole length; bare rafters over the open east part
  const slope = Math.atan2(RH, (HW + 6) / 2), ry = HH + 4.6, sy = (z) => ry + RH - Math.abs(z) * Math.tan(slope);
  const WL = HL - OPEN, WX = HX - HL / 2 + WL / 2;
  add(g, gable(HW + 6, RH, WL), M.roofDark, WX, ry, HZ, 0, Math.PI / 2, 0);
  for (let k = 1; k < 7; k++) for (const s of [-1, 1]) add(g, rbox(0.8, 0.5, 21, 0.1), M.oak, WX - WL / 2 + k * WL / 7, sy(10.2) + 0.5, HZ + s * 10.2, s * slope, 0, 0); // batten lines on the planks
  add(g, rbox(HL + 1, 1.8, 1.8, 0.4), M.oak, HX, ry + RH + 0.6, HZ);                              // the ridge beam
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) add(g, rbox(1.3, 1.3, 21.5, 0.3), M.oak, HX + HL / 2 - 4 - k * 9, sy(10.2) + 0.2, HZ + s * 10.2, s * slope, 0, 0); // the open part's bare rafters
  add(g, gable(HW + 6, RH, 2), M.oak, WX + WL / 2 + 1, ry, HZ, 0, Math.PI / 2, 0);                 // the truss where the planks end
  // the racks inside the open part: two rows of four, dark slotted fronts south, a team lid each
  for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) {
    const x = HX + HL / 2 - 6 - k * 8, z = HZ - 8 + row * 13;
    add(g, rbox(5.6, 11.5, 5.6, 0.4), M.rackSide, x, HH + 3.5 + 5.75, z);
    add(g, rbox(5.2, 10.8, 0.6, 0.1), M.rack, x, HH + 3.5 + 5.75, z + 2.9);                        // the slotted front
    teamPlate(g, M, 5.0, 0.6, 5.0, x, HH + 3.5 + 11.8, z);                                       // the team lid
  }
  // the fans: three set into the closed roof's south slope, each a dark housing, a lit ring, pale blades, a lit hub: the lights
  for (let k = 0; k < 3; k++) {
    const x = WX - 22 + k * 22, z = HZ + 7.5, fan = grp(); fan.position.set(x, sy(7.5) + 0.9, z); fan.rotation.x = slope; g.add(fan);
    add(fan, cyl(7.0, 7.0, 3.2, 20), M.joint, 0, 1.6, 0); add(fan, cyl(7.1, 7.1, 1.6, 20), M.paint, 0, 1.4, 0); add(fan, cyl(7.15, 7.15, 0.3, 20), M.inkLine, 0, 2.35, 0); add(fan, cyl(7.15, 7.15, 0.3, 20), M.inkLine, 0, 0.45, 0); // a team band round the housing
    add(fan, cyl(6.3, 6.3, 0.4, 20), M.glass, 0, 3.3, 0);                                         // the grille, dark
    add(fan, torus(6.6, 0.6, 24), M.led, 0, 3.4, 0, Math.PI / 2, 0, 0);                           // the lit ring
    add(fan, torus(6.6, 1.4, 24), M.ledHalo, 0, 3.4, 0, Math.PI / 2, 0, 0);
    for (let j = 0; j < 4; j++) add(fan, rbox(11.6, 0.4, 1.8, 0.2), M.white, 0, 3.6, 0, 0, j * Math.PI / 4 + 0.3, 0); // the blades
    led(fan, M, 1.2, 0, 3.9, 0);                                                                   // the hub
  }
  // the cable tray along the south eave, team-trimmed; the bundle down the east post to the mast and the solar rack
  add(g, rbox(HL - 4, 1.4, 1.6, 0.3), M.joint, HX, HH + 2.0, SZ + 1.8);
  add(g, rbox(HL - 4, 0.5, 1.9, 0.1), M.paint, HX, HH + 2.9, SZ + 1.8); add(g, rbox(HL - 3.6, 0.25, 2.1, 0.05), M.inkLine, HX, HH + 3.25, SZ + 1.8); // its team lip over an ink line
  add(g, cyl(0.6, 0.6, HH, 8), M.cable, HX + HL / 2 + 1.6, HH / 2 + 2, SZ + 1.6);
  const MX = HX + HL / 2 + 7, MZ = HZ + 8;
  add(g, cyl(0.8, 1.2, 42, 8), M.oak, MX, 23, MZ); add(g, rbox(1.4, 1.4, 1.4, 0.3), M.joint, MX, 44.5, MZ);
  add(g, cyl(3.6, 3.6, 0.5, 16), M.white, MX + 1.6, 40, MZ + 1.0, 0.9, 0, -0.5); add(g, cyl(0.3, 0.3, 3, 6), M.joint, MX + 2.4, 40.6, MZ + 1.8, 0.9, 0, -0.5); // the dish
  add(g, plate([[0, 0], [14, 0], [14, 10], [7, 8.2], [0, 10]], 0.4, 0.1), M.paint, MX + 0.5, 34, MZ, Math.PI / 2, 0, 0); // the company banner on the mast
  add(g, rbox(14.4, 0.4, 0.5, 0.05), M.inkLine, MX + 7.7, 34, MZ + 0.1); add(g, rbox(0.4, 0.4, 10.2, 0.05), M.inkLine, MX + 0.5, 34, MZ + 5.1);
  add(g, cyl(0.5, 0.6, 22, 6), M.oak, HX - HL / 2 - 4, 13, HZ + 2); add(g, plate([[0, 0], [10, 0], [10, 7], [5, 5.6], [0, 7]], 0.4, 0.1), M.paint, HX - HL / 2 - 3.6, 23, HZ + 2, Math.PI / 2, 0, 0); add(g, rbox(10.4, 0.4, 0.5, 0.05), M.inkLine, HX - HL / 2 + 1.6, 23, HZ + 2.1); // a second banner on a pole at the west end
  led(g, M, 0.6, MX, 45.6, MZ);
  limb(g, [HX + 20, ry + RH + 1.2, HZ], [MX, 43, MZ], 0.35, M.cable);                             // the cable from the ridge to the mast top
  limb(g, [MX, 20, MZ], [42, 7, 32], 0.4, M.cable); limb(g, [42, 7, 32], [HX + 40, 3, SZ + 2], 0.4, M.cable);
  const sr = grp(); sr.position.set(42, 2, 32); g.add(sr);                                        // the solar rack in the yard: dark glass on an oak frame
  for (const z of [-5, 5]) for (const x of [-11, 11]) add(sr, cyl(0.6, 0.7, z < 0 ? 8 : 4, 6), M.oak, x, z < 0 ? 4 : 2, z);
  add(sr, rbox(28, 0.8, 12, 0.2), M.glass, 0, 6.2, 0, 0.42, 0, 0);
  for (const x of [-4.7, 4.7]) add(sr, rbox(0.5, 0.9, 12.2, 0.1), M.white, x, 6.3, 0, 0.42, 0, 0);
  add(sr, rbox(28.4, 0.4, 12.4, 0.1), M.joint, 0, 5.8, 0, 0.42, 0, 0);
  // a team cloth hung from the eave beside the door; a small awning over the cases east of the door; crates, barrels, a trough
  for (const x of [HX - 22, HX + 20, HX + 46]) { const p = grp(); p.position.set(x, HH + 1.6, SZ + 1.2); g.add(p); add(p, rbox(0.6, 11, 12, 0.1), M.paintCloth, 0, -5.5, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 12.4, 0.05), M.inkLine, 0, -0.2, 0, 0, Math.PI / 2, 0); add(p, rbox(0.6, 0.5, 12.4, 0.05), M.inkLine, 0, -10.8, 0, 0, Math.PI / 2, 0); add(p, cyl(0.4, 0.4, 14, 8), M.oak, 0, 0.3, 0.2, 0, 0, Math.PI / 2); } // company cloths hung from the eave
  for (const x of [HX - 8, HX + 10]) for (const z of [SZ + 3, SZ + 13]) add(g, cyl(0.6, 0.7, 9, 6), M.oak, x, 6.5, z);
  { const p = grp(); p.position.set(HX + 1, 10.6, SZ + 8); p.rotation.x = 0.14; g.add(p); add(p, rbox(26.6, 0.4, 11.6, 0.1), M.inkLine, 0, -0.1, 0); add(p, rbox(26, 0.6, 11, 0.2), M.paintCloth, 0, 0.1, 0); } // the small awning
  for (let k = 0; k < 5; k++) { const cs = grp(); cs.position.set(HX - 6 + (k % 3) * 7, 3.6 + Math.floor(k / 3) * 4.6, SZ + 6 + (k % 2) * 3); cs.rotation.y = (k % 2) * 0.25; g.add(cs); add(cs, rbox(7, 4.4, 5.4, 0.9), M.paint, 0, 2.2, 0); add(cs, rbox(7.3, 0.4, 5.7, 0.1), M.inkLine, 0, 2.2, 0); add(cs, rbox(7.3, 0.4, 5.7, 0.1), M.inkLine, 0, 4.3, 0); } // hard cases
  for (let k = 0; k < 6; k++) add(g, rbox(4.6, 4.2, 4.6, 0.4), M.oakPale, HX + 28 + (k % 3) * 5.2, 4.3 + Math.floor(k / 3) * 4.2, SZ + 8 + (k % 2) * 1.5); // crates
  teamPlate(g, M, 20, 0.6, 9, HX + 33, 11.2, SZ + 8.5, 0, 0, 0.06);                               // a team tarp over them
  for (const [x, z] of [[-50, 28], [-45, 32], [-48, 36]]) { add(g, cyl(2.4, 2.6, 5, 12), M.oakPale, x, 4.5, z); for (const y of [3.2, 6]) add(g, torus(2.65, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); } // barrels
  add(g, rbox(14, 3.6, 6, 0.4), M.stone, -42, 3.8, 44); add(g, rbox(12.4, 0.6, 4.6, 0.2), M.glass, -42, 5.5, 44); // a stone trough of water
  for (const x of [44, 52]) for (const z of [-40, -34]) add(g, rbox(3.2, 2.4, 2.4, 0.4), M.stone, x, 3.4, z);     // spare stone
  for (let k = 0; k < 4; k++) add(g, rbox(16, 1.2, 2.4, 0.3), M.oakPale, 36, 3.2 + k * 1.2, 46 - k * 0.3);       // stacked planks
  for (const [x, z, ry] of [[HX - 40, SZ + 7, 0.6], [HX - 28, SZ + 10, -2.4]]) { const t = traveller(M, 0); t.position.set(x, 2.2, z); t.rotation.y = ry; t.scale.setScalar(0.9); g.add(t); } // two of the travellers who run the base, at the door
  // the sign board with the mark, over the door
  add(g, rbox(9, 4.5, 0.8, 0.3), M.deck, HX - 33.5, 15.2, SZ + 1.0);
  add(g, torus(1.4, 0.4, 20), M.joint, HX - 35.5, 15.2, SZ + 1.5); add(g, sph(0.6, 8, 6), M.joint, HX - 35.5, 15.2, SZ + 1.5);
  add(g, rbox(3.2, 0.6, 0.4, 0.1), M.joint, HX - 31.6, 15.7, SZ + 1.5); add(g, rbox(3.2, 0.6, 0.4, 0.1), M.joint, HX - 31.6, 14.7, SZ + 1.5);
  return g;
}

/** The gold deposit (`rt_coins`): heaps of coins where today's salt sits, loose coins round them, on a dark footing of
 *  earth: the resource both peoples dig. */
export function coins(M) {
  const g = grp(), gold = new THREE.MeshStandardMaterial({ color: 0xd8a838, metalness: 0.7, roughness: 0.5 }), goldDark = new THREE.MeshStandardMaterial({ color: 0x8a6420, metalness: 0.6, roughness: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 });
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
