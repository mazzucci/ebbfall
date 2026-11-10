// The Expedition (the re-theme's stranded 2026 tech company, standing in for the Vael in the comparison picture; not in
// the atlas: retheme.js renders it by filter). Stelian's rule (2026-11-10): modern components, medieval materials.
// Only small things came through time (bots, drones, electronics, a few tools and weapons: the Utility bot, the Robot
// dog, the Marine's kit); everything big is built on site from local timber, stone, rope and canvas, with cables,
// LEDs, panels and fans added. No concrete, no containers, no roads, no fuel. The side parts from the kingdom by its
// modern parts: flat rounded shells, panels, fans, cables, small cool lights (the only lights in the picture), team
// paint on panels between dark trim; its buildings are paler than the kingdom's stone. Three finishes on one set of
// shapes (`makeExpeditionMats(tc, v)`): A weathered off-white composite with a timber-framed, limewashed hall under
// canvas; B olive panels with sand canvas tops and a hall of pale planks under canvas; C bare aluminium and black with
// a hall of pale fieldstone under silvered planks. Same conventions as models.js: game units, units face +x, y up, +z south.
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
  A: { name: 'weathered composite', panel: 0xc8c3b6, panelDark: 0x8c877e, trim: 0x34363c, canvas: 0xc4b48e, metal: 0.12, rough: 0.72, wall: 'daub', roof: 'canvas', uniform: 0xa09a86, armour: 0x6a6660 },
  B: { name: 'olive panels and sand canvas', panel: 0x7e8464, panelDark: 0x565a44, trim: 0x2a2c26, canvas: 0xd2c29c, metal: 0.18, rough: 0.75, wall: 'plank', roof: 'canvas', uniform: 0x6e7452, armour: 0x4a4e3c },
  C: { name: 'aluminium and black', panel: 0xb6babe, panelDark: 0x262829, trim: 0x1a1b1e, canvas: 0xa09c90, metal: 0.78, rough: 0.38, wall: 'stone', roof: 'plank', uniform: 0x3c3e42, armour: 0x242528 },
};
/** The Expedition's materials for a finish `v`, over the Harbour's set (its timber, rope, ink and canvas weave are
 *  reused). `paint` is the team: paint on a panel, matte, between `inkLine` trim. */
export function makeExpeditionMats(tc, v = 'A') {
  const P = EXPEDITION_PALETTES[v], M = makeMats(tc), std = (o) => new THREE.MeshStandardMaterial(o);
  M.panel = std({ color: P.panel, map: shellTex, metalness: P.metal, roughness: P.rough });                        // the modern shells, weathered
  M.panelDark = std({ color: P.panelDark, map: shellTex, metalness: P.metal, roughness: P.rough + 0.1 });          // undersides, patches, housings
  M.trim = std({ color: P.trim, roughness: 0.75, metalness: 0.2 });                                                // rubber edges, joints, wheel arches
  M.glass = std({ color: 0x10161e, metalness: 0.7, roughness: 0.12 });                                             // dark glass: solar panels, visors, sensor eyes
  M.led = std({ color: 0xd8f8ff, emissive: 0xa8f0ff, emissiveIntensity: 3.0 });                                     // a small cool light (never orange: seat 0 is gold)
  M.ledHalo = new THREE.MeshBasicMaterial({ color: 0x90e8ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  M.paint = team(std({ color: tc.paint, map: shellTex, metalness: 0.2, roughness: 0.55 }));                         // the team: paint on panels
  M.rack = std({ color: 0x8a8c90, map: rackTex, metalness: 0.4, roughness: 0.5 });                                 // a server rack's slotted front
  M.rackSide = std({ color: 0x4a4c50, metalness: 0.5, roughness: 0.45 });
  M.cable = std({ color: 0x15161a, roughness: 0.6, metalness: 0.1 });
  M.canvasLocal = std({ color: P.canvas, map: M.canvas.map, roughness: 0.92 });                                     // the locals' sand canvas
  M.oak = std({ color: 0x5e452c, map: M.timber.map, roughness: 0.85 });
  M.oakPale = std({ color: 0x8a6a46, map: M.timber.map, roughness: 0.85 });
  M.wall = P.wall === 'daub' ? std({ color: 0xd8d0bc, map: daubTex, roughness: 0.95 }) : P.wall === 'plank' ? std({ color: 0xc4b494, map: plankTex, bumpMap: plankBump, bumpScale: 1.0, roughness: 0.88 }) : std({ color: 0xb4ae9e, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });
  M.roofLocal = P.roof === 'canvas' ? std({ color: 0xc8baa0, map: M.canvas.map, roughness: 0.93 }) : std({ color: 0xaaa69a, map: plankTex, bumpMap: plankBump, bumpScale: 1.0, roughness: 0.9 }); // (C's planks silvered by weather: the hall stays the paler side)
  M.stone = std({ color: 0x8a8478, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });         // a footing course of local stone
  M.earth = std({ color: 0x7e6e54, map: earthTex, roughness: 1 });
  M.deck = std({ color: 0x9a805c, map: plankTex, bumpMap: plankBump, bumpScale: 0.8, roughness: 0.9 });            // a timber boardwalk
  M.gold = std({ color: 0xe0b040, metalness: 0.95, roughness: 0.32 });
  M.uniform = std({ color: P.uniform, roughness: 0.9 });                                                            // the Marine's fatigues
  M.armour = std({ color: P.armour, roughness: 0.7, metalness: 0.1 });                                              // helmet, knee pads, pouches
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

/** Utility bot (worker, sim r 9): a flat wheeled box with a small arm, as Stelian's list says: a low rounded shell on
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
  add(arm, cyl(1.6, 1.8, 1.4, 12), M.panelDark, 0, 0, 0);
  const bob = (f % 2) * 0.5;
  limb(arm, [0, 0.6, 0], [3.0, 3.6 - bob, 0], 0.9, M.panel);                                    // the upper arm
  add(arm, sph(1.1, 10, 8), M.trim, 3.0, 3.6 - bob, 0);                                         // the elbow
  limb(arm, [3.0, 3.6 - bob, 0], [6.2, 1.6, 0], 0.8, M.panel);                                  // the forearm
  for (const s of [-1, 1]) limb(arm, [6.2, 1.6, 0], [7.4, -0.2, s * 2.4], 0.5, M.trim);          // the gripper's fingers on the tote
  // the load: a tote of coins held ahead, as wide as the shell
  const tote = grp(); tote.position.set(10.4, 0, 0); tote.rotation.y = 0.12; b.add(tote);
  add(tote, rbox(6.4, 4.8, 7.0, 0.5), M.panelDark, 0, 2.6, 0);
  add(tote, rbox(6.6, 0.5, 7.2, 0.1), M.inkLine, 0, 4.9, 0);                                     // its rim
  add(tote, sph(3.2, 14, 10), M.gold, 0, 5.0, 0).scale.set(1, 0.45, 1.05);                      // the coins heaped over the rim
  for (const [x, z] of [[1.2, 1.4], [-1.4, -1.0], [0.3, -2.2]]) add(tote, cyl(0.85, 0.85, 0.3, 10), M.gold, x, 6.2, z, (x - z) * 0.2, x, 0.25);
  return g;
}

/** Robot dog (line infantry, sim r 10-11): four legs, low and quick, as the list says: a rounded shell 12 long on four
 *  splayed legs of two segments each (dark joints, pale shins), the knees out past the shell so four legs show from
 *  the camera in every facing, a sensor head block at the bow with one dark glass eye and a cool LED, a team saddle
 *  panel on the back inside black trim, team sleeves on the thighs. From the camera: a low pale oval with a team
 *  middle and legs out either side: a quadruped, never a figure. Frames 0-1 the trot (diagonal pairs). */
export function robotDog(M, f) {
  const g = grp(), st = f % 2 ? -1 : 1;
  const b = grp(); b.position.y = 7.2; g.add(b);
  add(b, rbox(12, 3.4, 5.0, 1.6), M.panel, 0, 0, 0);                                           // the shell
  add(b, rbox(12.4, 1.0, 5.4, 0.4), M.trim, 0, -1.6, 0);                                       // its dark belly plate
  teamPlate(b, M, 7.2, 0.6, 3.6, -0.8, 1.95, 0);                                               // the saddle panel
  add(b, rbox(2.0, 1.6, 2.2, 0.4), M.panelDark, -4.8, 1.6, 0);                                 // a module on the rump
  add(b, cyl(0.4, 0.4, 3.6, 6), M.trim, -5.4, 3.6, 0.8);                                       // an antenna
  // the head: a block at the bow, a glass eye, a LED under it
  add(b, rbox(3.6, 2.8, 3.8, 0.9), M.panelDark, 6.6, 0.4, 0);
  add(b, rbox(1.2, 1.6, 2.6, 0.3), M.glass, 8.3, 0.7, 0);                                      // the eye
  led(b, M, 0.5, 8.6, -0.6, 0);
  // the legs: hips at the shell's corners, thighs out and down, knees past the shell, shins down to round feet
  for (const [x, side, fore] of [[4.2, -1, 1], [4.2, 1, 1], [-4.2, -1, 0], [-4.2, 1, 0]]) {
    const z = side * 2.4, sw = (fore ? 1 : -1) * st * 1.6, kx = x + sw, kz = side * 4.6;
    add(b, cyl(0.9, 0.9, 1.4, 10), M.trim, x, -0.8, z, Math.PI / 2, 0, 0);                      // the hip joint
    limb(b, [x, -0.8, z], [kx, -3.6, kz], 0.95, M.paint);                                        // the thigh, team
    add(b, sph(1.0, 8, 6), M.inkLine, kx, -3.6, kz);                                             // the knee, ink: the thigh's hem
    limb(b, [kx, -3.6, kz], [x - sw * 0.4, -6.6, side * 3.4], 0.75, M.panel);                    // the shin, pale
    add(b, sph(0.85, 8, 6), M.rubber, x - sw * 0.4, -6.7, side * 3.4);                           // the foot
  }
  return g;
}

/** Marine (the signature unit, line class, sim r 10-11, scale 1.08): a modern elite soldier from the future, the
 *  iconic silhouette: a rounded helmet with goggles pushed up on it, a plate carrier (team, between ink trims) over
 *  fatigues, pouches, knee pads, boots, a pack, and a rifle held across the chest angled up ahead (a dark receiver and
 *  barrel, a pale handguard and stock so the bar reads, a magazine down). No insignia, no bulk: a man, not a suit.
 *  From the camera: a round dark helmet with a pale goggle band, a team torso, a long thin bar angled up ahead,
 *  wider than the Robot dog is tall. Frames 0-1 the march. */
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
  add(b, rbox(2.8, 4.8, 5.0, 0.8), M.armour, -3.8, 10.6, 0);                                   // the pack
  add(b, rbox(1.2, 3.0, 1.2, 0.3), M.trim, -4.6, 9.4, -2.0);                                   // a bottle on it
  add(b, cyl(0.25, 0.25, 6, 6), M.trim, -4.4, 14.4, 2.2);                                      // a radio antenna
  add(b, sph(1.7, 12, 10), M.skin, 0.9, 13.3, 0).scale.set(0.8, 0.95, 0.9);                    // the face
  add(b, sph(2.6, 16, 12), M.paint, 0.1, 14.2, 0).scale.set(1, 0.85, 1);                       // the helmet, rounded, in a team cover
  add(b, cyl(2.7, 2.7, 0.4, 16), M.inkLine, 0.1, 13.1, 0);                                     // its rim line
  add(b, rbox(2.6, 1.2, 4.0, 0.4), M.glass, 1.6, 14.9, 0);                                     // the goggles, pushed up on the helmet
  add(b, rbox(0.4, 0.8, 5.4, 0.1), M.trim, 0.2, 15.0, 0);                                      // their strap
  add(b, rbox(1.4, 1.0, 1.0, 0.3), M.trim, 2.4, 15.8, 0);                                      // a mount on the brow
  // the rifle: across the chest, angled up ahead, longer than the Picket's; a pale handguard and stock so the bar reads
  const gun = grp(); gun.position.set(2.6, 9.6, 0.8); gun.rotation.z = 0.5; b.add(gun);
  add(gun, rbox(5.0, 1.6, 1.6, 0.4), M.gunTan, -3.4, 0, 0);                                     // the stock
  add(gun, rbox(4.6, 2.0, 1.8, 0.3), M.gun, 1.0, 0, 0);                                         // the receiver
  add(gun, rbox(1.4, 3.6, 1.2, 0.3), M.gun, 0.6, -2.2, 0);                                      // the magazine
  add(gun, rbox(1.0, 1.6, 1.0, 0.2), M.gun, -1.4, -1.4, 0);                                     // the grip
  add(gun, rbox(1.4, 1.0, 1.0, 0.2), M.gun, 1.2, 1.4, 0);                                       // the sight
  add(gun, rbox(6.4, 1.4, 1.5, 0.4), M.gunTan, 6.4, 0, 0);                                      // the handguard
  add(gun, cyl(0.45, 0.45, 5.6, 8), M.gun, 12.2, 0.2, 0, 0, 0, Math.PI / 2);                    // the barrel
  add(gun, cyl(0.7, 0.7, 1.4, 8), M.gun, 15.2, 0.2, 0, 0, 0, Math.PI / 2);                      // the muzzle device
  limb(b, [0.6, 11.4, 3.6], [3.4, 9.0, 1.6], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 3.6, 8.8, 1.5); // the trigger hand, gloved
  limb(b, [0.6, 11.4, -3.6], [6.6, 11.6, 0.4], 1.15, M.uniform); add(b, sph(0.9, 8, 6), M.armour, 6.9, 11.8, 0.5);  // the fore hand on the handguard
  g.scale.setScalar(1.08);
  return g;
}

/** Data centre (the main building, 4x4): a server hall built on site of local timber and stone, the modern kit
 *  bolted on: a long low hall (oak frame on a stone footing, the walls limewashed daub / pale planks / fieldstone by
 *  finish) under a low roof (canvas or planks) carrying five big round cooling fans in a row and a pair of dark solar
 *  panels; its south side open between the posts, the server racks standing inside in a row, each a slotted dark
 *  front with a column of cool LEDs, team side panels; cables in a bundle along the eave and down to a timber rack of
 *  solar panels in the yard and a small wind rotor on an oak mast; a team canvas awning over the timber boardwalk at
 *  the door, team panels on the racks, a team canvas section lashed over the roof's east end, team hard cases
 *  stacked; a small fictional logo (a ring and a dot) on the sign board over the opening. On trodden earth with a
 *  stone footing (no concrete: Stelian's rule). Lights: LEDs only, cool, small, the one side with lights. */
export function dataCentre(M) {
  const g = grp();
  add(g, plate(oct(62), 2.2, 0.8), M.earth, 0, 0, 0);                                            // trodden earth
  // the hall: a stone footing, walls in an oak frame, a low gable roof along x
  const HX = -4, HZ = -14, HL = 100, HW = 40, HH = 18, RH = 9, BX = HX - 26, AX = HX + 24; // (BX: the open bay's centre, west; AX: the awning's, east)
  add(g, rbox(HL + 4, 3, HW + 4, 0.5), M.stone, HX, 3, HZ);                                      // the footing course
  add(g, rbox(HL, HH, HW, 0.6), M.wall, HX, HH / 2 + 3, HZ);                                     // the walls
  for (let x = -HL / 2; x <= HL / 2; x += 12.5) for (const z of [-1, 1]) add(g, rbox(1.6, HH + 0.4, 1.4, 0.3), M.oak, HX + x, HH / 2 + 3, HZ + z * (HW / 2 + 0.3)); // the frame's posts
  for (const z of [-1, 1]) for (const y of [9, 15]) add(g, rbox(HL + 1, 1.3, 1.2, 0.3), M.oak, HX, y, HZ + z * (HW / 2 + 0.4)); // its rails
  add(g, rbox(HL + 1, 1.8, HW + 1.2, 0.4), M.oak, HX, HH + 3.6, HZ);                              // the wall plate
  // the south bay: an opening between posts, the racks inside in a row, lit
  add(g, rbox(44, 13, 1.6, 0.3), M.trim, BX, 10, HZ + HW / 2 + 0.2);                               // the dark of the open bay
  for (let k = 0; k < 5; k++) {
    const x = BX - 16 + k * 8, z = HZ + HW / 2 - 4.5;
    add(g, rbox(5.6, 12, 6, 0.4), M.rackSide, x, 10, z);
    add(g, rbox(5.2, 11.4, 0.6, 0.1), M.rack, x, 10, z + 3.1);                                   // the slotted front
    teamPlate(g, M, 0.6, 5.0, 10.6, x + 3.0, 10, z - 0.6, 0, 0, Math.PI / 2);                     // a team side panel
    for (let j = 0; j < 4; j++) led(g, M, 0.35, x - 1.6 + (j % 2) * 1.2, 6 + j * 2.6, z + 3.5);   // a column of LEDs
  }
  add(g, rbox(44, 1.4, 2.2, 0.3), M.oak, BX, 17, HZ + HW / 2 + 0.6);                               // the lintel over the bay
  // team cladding panels bolted over the frame on the east half of the south face, between ink trims
  for (const x of [AX - 15, AX, AX + 15]) { add(g, rbox(13.6, 10.6, 0.8, 0.3), M.paint, x, 10.5, HZ + HW / 2 + 0.9); add(g, rbox(14.2, 11.2, 0.5, 0.1), M.inkLine, x, 10.5, HZ + HW / 2 + 0.6); }
  // the sign board over the cladding: a pale plank with the mark, a ring and a dot
  add(g, rbox(10, 5, 0.8, 0.3), M.deck, AX, 19.5, HZ + HW / 2 + 0.9);
  add(g, torus(1.6, 0.45, 20), M.trim, AX - 2, 19.5, HZ + HW / 2 + 1.4); add(g, sph(0.7, 8, 6), M.trim, AX - 2, 19.5, HZ + HW / 2 + 1.4);
  add(g, rbox(3.4, 0.7, 0.4, 0.1), M.trim, AX + 2.2, 20.1, HZ + HW / 2 + 1.4); add(g, rbox(3.4, 0.7, 0.4, 0.1), M.trim, AX + 2.2, 18.7, HZ + HW / 2 + 1.4);
  // the roof: a low gable, both slopes seen from the camera; its ridge beam; on the south slope five cooling fans in
  // a row and two solar panels; a team canvas section lashed over the east end
  add(g, gable(HW + 6, RH, HL + 6), M.roofLocal, HX, HH + 4.4, HZ, 0, Math.PI / 2, 0);
  add(g, rbox(HL + 7, 1.6, 1.6, 0.4), M.oak, HX, HH + 4.4 + RH + 0.4, HZ);
  const slope = Math.atan2(RH, (HW + 6) / 2), sy = (z) => HH + 4.4 + RH - Math.abs(z) * Math.tan(slope);
  for (let k = 0; k < 5; k++) {                                                                  // the fans: a dark housing, a pale ring, four pale blades over a dark grille, a hub
    const x = HX - 38 + k * 16, z = HZ + 9, y = sy(9) + 0.5, fan = grp(); fan.position.set(x, y, z); fan.rotation.x = slope; g.add(fan);
    add(fan, cyl(6.2, 6.2, 3.2, 20), M.trim, 0, 1.6, 0);
    add(fan, cyl(5.6, 5.6, 0.4, 20), M.glass, 0, 3.3, 0);                                         // the grille, dark
    add(fan, torus(5.9, 0.5, 24), M.panel, 0, 3.4, 0, Math.PI / 2, 0, 0);                          // the pale ring
    for (let j = 0; j < 4; j++) add(fan, rbox(10.4, 0.4, 1.8, 0.2), M.panel, 0, 3.6, 0, 0, j * Math.PI / 4 + 0.3, 0); // the blades
    add(fan, cyl(1.4, 1.4, 0.8, 10), M.panelDark, 0, 3.7, 0);
  }
  for (const x of [HX + 28, HX + 40]) add(g, rbox(10, 0.7, 14, 0.2), M.glass, x, sy(-4) + 0.6, HZ - 4, -slope * 0.5 + 0.35, 0, 0); // solar panels on the north side of the ridge, tilted south
  const tp = grp(); tp.position.set(HX + 36, 0, HZ); g.add(tp);                                   // the team canvas over the roof's east end, both slopes
  for (const s of [-1, 1]) { add(tp, rbox(30, 0.6, 24, 0.2), M.paint, 0, sy(11.5) + 0.9, s * 11.5, s * slope, 0, 0); add(tp, rbox(30.6, 0.4, 24.6, 0.1), M.inkLine, 0, sy(11.5) + 0.5, s * 11.5, s * slope, 0, 0); }
  for (const x of [-12, 0, 12]) for (const s of [-1, 1]) add(tp, cyl(0.3, 0.3, 25, 6), M.rope, x, sy(11.5) + 1.5, s * 11.5, Math.PI / 2 + s * slope, 0, 0); // lashings over it
  const tn = grp(); tn.position.set(HX - 28, 0, HZ); g.add(tn);                                   // and a second over the north slope's west end
  add(tn, rbox(34, 0.6, 20, 0.2), M.paint, 0, sy(-12) + 0.9, -12, -slope, 0, 0); add(tn, rbox(34.6, 0.4, 20.6, 0.1), M.inkLine, 0, sy(-12) + 0.5, -12, -slope, 0, 0);
  for (const x of [-12, 0, 12]) add(tn, cyl(0.3, 0.3, 21, 6), M.rope, x, sy(-12) + 1.5, -12, Math.PI / 2 - slope, 0, 0);
  // cables: a bundle along the south eave, down the east post, out to the solar rack and the rotor
  add(g, rbox(HL - 10, 1.0, 1.0, 0.3), M.cable, HX, HH + 2.6, HZ + HW / 2 + 1.6);
  add(g, cyl(0.6, 0.6, HH, 8), M.cable, HX + HL / 2 - 2, HH / 2 + 2, HZ + HW / 2 + 1.6);
  for (const [x0, z0, x1, z1] of [[HX + HL / 2 - 2, HZ + HW / 2 + 2, 40, 30], [40, 30, 50, 44], [HX + HL / 2 - 2, HZ + HW / 2 + 2, -46, 44]]) limb(g, [x0, 2.6, z0], [x1, 2.6, z1], 0.5, M.cable);
  // the solar rack in the yard: three dark panels tilted south on an oak frame; the wind rotor on an oak mast
  const sr = grp(); sr.position.set(40, 2, 30); g.add(sr);
  for (const z of [-5, 5]) for (const x of [-11, 11]) add(sr, cyl(0.6, 0.7, z < 0 ? 8 : 4, 6), M.oak, x, z < 0 ? 4 : 2, z);
  add(sr, rbox(28, 0.8, 12, 0.2), M.glass, 0, 6.2, 0, 0.42, 0, 0);
  for (const x of [-4.7, 4.7]) add(sr, rbox(0.5, 0.9, 12.2, 0.1), M.panel, x, 6.3, 0, 0.42, 0, 0);
  add(sr, rbox(28.4, 0.4, 12.4, 0.1), M.trim, 0, 5.8, 0, 0.42, 0, 0);
  const wm = grp(); wm.position.set(50, 2, 44); g.add(wm);
  add(wm, cyl(0.8, 1.2, 34, 8), M.oak, 0, 17, 0); add(wm, rbox(3.6, 2.2, 2.2, 0.6), M.panel, 0.8, 34.6, 0);
  for (let k = 0; k < 3; k++) add(wm, rbox(0.9, 9, 1.6, 0.3), M.panel, 2.6, 34.6 + 4.5 * Math.cos(k * 2.094 + 0.4), 4.5 * Math.sin(k * 2.094 + 0.4), k * 2.094 + 0.4, 0, 0);
  led(g, M, 0.6, 50, 37.4, 44);
  // the boardwalk and the team awning at the bay, on oak posts; hard cases under it; barrels and a stone water trough
  add(g, rbox(92, 1.6, 20, 0.3), M.deck, HX, 2.8, HZ + HW / 2 + 12);                               // the boardwalk along the south side
  for (const x of [AX - 22, AX + 22]) for (const z of [HZ + HW / 2 + 4, HZ + HW / 2 + 20]) add(g, cyl(0.7, 0.8, 16, 6), M.oak, x, 10.6, z);
  teamPlate(g, M, 50, 0.7, 19, AX, 18.6, HZ + HW / 2 + 12, 0.1, 0, 0);                             // the awning, team canvas, inside an ink hem
  for (const x of [AX - 12, AX, AX + 12]) add(g, rbox(0.5, 0.5, 18.6, 0.1), M.rope, x, 18.9, HZ + HW / 2 + 12, 0.1, 0, 0);
  for (let k = 0; k < 5; k++) { const cs = grp(); cs.position.set(AX - 14 + (k % 3) * 8, 3.6 + Math.floor(k / 3) * 4.6, HZ + HW / 2 + 14 + (k % 2) * 2); cs.rotation.y = (k % 2) * 0.25; g.add(cs); add(cs, rbox(8, 4.4, 6, 0.9), M.paint, 0, 2.2, 0); add(cs, rbox(8.3, 0.4, 6.3, 0.1), M.inkLine, 0, 2.2, 0); add(cs, rbox(8.3, 0.4, 6.3, 0.1), M.inkLine, 0, 4.3, 0); for (const z of [-1.8, 1.8]) add(cs, rbox(1.4, 0.6, 1.0, 0.2), M.trim, 0, 4.6, z); } // hard cases
  for (const [x, z] of [[-48, 34], [-43, 38], [-46, 42]]) { add(g, cyl(2.4, 2.6, 5, 12), M.oak, x, 4.5, z); for (const y of [3.2, 6]) add(g, torus(2.65, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); } // barrels
  add(g, rbox(14, 3.6, 6, 0.4), M.stone, -48, 3.8, 50); add(g, rbox(12.4, 0.6, 4.6, 0.2), M.glass, -48, 5.5, 50); // a stone trough of water
  for (const x of [-52, -42]) for (const z of [-54, -50]) add(g, rbox(3.2, 2.4, 2.4, 0.4), M.stone, x, 3.4, z);  // spare stone
  for (let k = 0; k < 4; k++) add(g, rbox(16, 1.2, 2.4, 0.3), M.oakPale, 44, 3.2 + k * 1.2, -50 - k * 0.3);     // stacked planks
  teamPlate(g, M, 16, 0.6, 9, -47, 7.0, -52, 0, 0, 0.08); for (const x of [-53, -41]) add(g, cyl(0.4, 0.5, 5, 6), M.oak, x, 4.5, -52); // a team tarp over the spare stone
  for (const x of [-48, -22, 4, 30]) led(g, M, 0.5, HX + x, HH + 2.2, HZ + HW / 2 + 2.4);         // a string of lamps along the eave
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
