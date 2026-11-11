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
import { polishMats } from './polish.js';

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
/** Weathered boards: horizontal boards of uneven width with dark shadow seams between them, grain, a joint or an end
 *  here and there, a knot or two, on a warm-grey base, matte (buildings round 3: the first grey planks were even
 *  vertical ribs and read as corrugated steel, so containers; these must read as timber: cooler than the kingdom's
 *  brown, warmer and darker than that silver). */
export const boardTex = tex(128, (g, n) => {
  g.fillStyle = '#b4aea2'; g.fillRect(0, 0, n, n); seed = 67;
  for (let y = 0; y < n;) {
    const h = Math.min(n - y, 9 + rnd() * 9), v = 148 + rnd() * 60; g.fillStyle = `rgb(${v + 6},${v},${v - 8})`; g.fillRect(0, y, n, h);
    for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(60,56,50,${0.12 + rnd() * 0.25})`; g.lineWidth = 0.6 + rnd(); g.beginPath(); const y0 = y + 1 + rnd() * (h - 2); g.moveTo(0, y0); g.bezierCurveTo(n / 3, y0 + rnd() * 3 - 1.5, 2 * n / 3, y0 + rnd() * 3 - 1.5, n, y0 + rnd() - 0.5); g.stroke(); }
    if (rnd() < 0.75) { const x = rnd() * n; g.fillStyle = 'rgba(30,28,26,0.85)'; g.fillRect(x, y, 2.2, h); g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 2.2, y, 1, h); } // a board's end
    if (rnd() < 0.3) { g.fillStyle = 'rgba(50,44,38,0.6)'; g.beginPath(); g.ellipse(rnd() * n, y + h / 2, 1.6 + rnd() * 1.2, 1 + rnd(), 0, 0, 7); g.fill(); } // a knot
    g.fillStyle = 'rgba(26,24,22,0.92)'; g.fillRect(0, y + h - 2.4, n, 2.4);                                                         // the shadow seam under the board
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, y, n, 1);                                                                   // its lit top edge
    y += h;
  }
}, { repeat: 2 });
/** Shingles: staggered courses of short weathered shingles, each with a dark lower edge and side seams, matte. */
export const shingleTex = tex(128, (g, n) => {
  g.fillStyle = '#aeaaa2'; g.fillRect(0, 0, n, n); seed = 73;
  for (let y = 0; y < n; y += 12) { const o = (y / 12) % 2 ? 8 : 0; for (let x = -16; x < n + 16; x += 16) { const v = 140 + rnd() * 60; g.fillStyle = `rgb(${v + 4},${v},${v - 6})`; g.fillRect(x + o, y, 16, 12); g.fillStyle = 'rgba(26,24,22,0.9)'; g.fillRect(x + o, y + 10, 16, 2); g.fillRect(x + o, y, 1.4, 12); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x + o + 1.4, y + 0.5, 14, 1); } }
  for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(60,56,50,${0.06 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 4 + rnd() * 10, 2 + rnd() * 5, rnd() * 3, 0, 7); g.fill(); }
}, { repeat: 3 });
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
export function makeExpeditionMats(tc, polish = false) {
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
  M.oakPale = std({ color: 0x6e6a60, map: M.timber.map, roughness: 0.85 });                                          // crates and barrels: grey weathered timber
  M.wall = std({ color: P.wall, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.92 });            // the castle's own slate-grey ashlar (the buildings family: the judge saw no stone)
  M.roofDark = std({ color: 0x9a9c9a, map: shingleTex, roughness: 0.96, metalness: 0 });                                 // the roofs: weathered grey shingles, matte (round 3: ribbed pale planks read as corrugated steel)
  M.wallPale = std({ color: 0xb4b6ba, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.8, roughness: 0.92 });      // the lighter ashlar of the faces to the camera (in the north-west sun's shade, so a step lighter to read as stone)
  M.stone = std({ color: 0x6e6458, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });         // a footing course of darker stone
  M.earth = std({ color: 0x5c5a54, map: earthTex, roughness: 1 });                                                  // trodden earth, grey-brown as the castle's (the warm brown read as dirt under no building)
  M.deck = std({ color: 0x8c8880, map: boardTex, roughness: 0.95, metalness: 0 });                                        // a board floor, weathered grey
  M.gold = std({ color: 0xf0c850, metalness: 0.6, roughness: 0.35 });                                               // coins: a light yellow, gold is the coins' alone
  M.glint = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });
  M.uniform = std({ color: P.uniform, roughness: 0.9 });                                                            // fatigues
  M.armour = std({ color: P.armour, roughness: 0.65, metalness: 0.15 });                                             // helmets, caps, knee pads, pouches: near black
  M.gun = std({ color: 0x5e6268, metalness: 0.6, roughness: 0.4 });                                                 // gunmetal, a mid grey (0x1e1f23, near-black, until the legibility pass of 2026-11-11: the rifles vanished into the dark kit and the shadow)
  M.gunTan = std({ color: 0xa8acb0, roughness: 0.6, metalness: 0.3 });                                              // a rifle's furniture: the Marine's pale mark
  M.skin = std({ color: 0xc89a74, roughness: 0.8 });
  M.boot = std({ color: 0x1e1a18, roughness: 0.8 });
  M.camo = std({ color: 0x9a9e98, map: camoTex, roughness: 0.9 });                                                   // the Marine's urban camouflage: grey-charcoal blotches (Stelian: camouflage, slimmer)
  M.tyrePale = std({ color: 0x8e908a, map: M.rubber.map, roughness: 0.9, metalness: 0.05 });                          // the Buggy's big pale wheels (the units family: the Buggy must part from the Bot in a crowd)
  M.brightSteel = std({ color: 0xc8ccd0, metalness: 0.6, roughness: 0.35 });                                           // the Buggy's bull bar: its brightest element
  M.hose = std({ color: 0x5e5648, roughness: 0.9 });                                                                 // a local's rough trousers (the Mercenary, the Veteran)
  M.leather = std({ color: 0x2e2622, roughness: 0.6, metalness: 0.1 });                                              // a local's boots and belts
  M.rotor = std({ color: 0x2a2c30, metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.55 });              // a spinning rotor's disc
  return polish ? polishMats(M, 'ex') : M;                                                                         // (polish.js: texture on the flat materials and `M.polish` for the models' secondary detail)
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
  if (M.polish) { // secondary detail: bolt rings on the hubs, a cable from the arm's turret into the shell, the tray's handles, a sensor dome (round 2 dropped the stern's vent slots)
    for (const [x, z] of [[-5.2, -6.3], [5.2, -6.3], [-5.2, 6.3], [5.2, 6.3]]) add(b, torus(0.75, 0.15), M.joint, x, 2.0, z + Math.sign(z) * 1.0);
    limb(b, [5.0, 4.3, -2.2], [2.6, 4.1, -5.2], 0.3, M.cable);
    for (const x of [-5.6, 5.6]) add(tr, rbox(0.6, 0.6, 2.6, 0.2), M.joint, x, 1.2, 0);
    add(b, sph(0.8, 8, 6), M.joint, 6.6, 4.5, -4.2);
  }
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
  if (M.polish) { // secondary detail: bolt rings on the hubs, headrests, stays from the cage to the battery pack, a tow hook (round 2 dropped the door seams and the pack's grille)
    for (const [x, z] of [[-7.0, -6.6], [7.0, -6.6], [-7.0, 6.6], [7.0, 6.6]]) add(b, torus(1.6, 0.22), M.joint, x, -0.6, z + Math.sign(z) * 1.75);
    for (const z of [-1.9, 1.9]) add(b, rbox(1.2, 1.4, 2.2, 0.4), M.panelDark, -3.2, 6.1, z);
    for (const z of [-3.2, 3.2]) limb(b, [-4.6, 6.6, z], [-7.8, 3.6, z * 1.1], 0.4, M.steel);
    add(b, rbox(1.2, 0.8, 1.0, 0.3), M.steel, -12.2, 0.9, -3.0);
  }
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
  add(b, rbox(4.6, 2.6, 4.4, 0.6), M.paint, 0.3, 13.6, 3.7); add(b, rbox(4.8, 0.3, 4.6, 0.1), M.inkLine, 0.3, 12.25, 3.7); add(b, rbox(4.8, 0.3, 4.6, 0.1), M.inkLine, 0.3, 14.95, 3.7); // the one team shoulder pad, a big pauldron between ink lines (a hair bigger since the legibility pass: the bolder rifle's pixels took the share under the floor)
  add(b, cyl(1.9, 1.9, 3.0, 10), M.paint, 1.0, 10.2, -3.9, 0.3, 0, 0.4); for (const dy of [-1.6, 1.6]) add(b, cyl(1.95, 1.95, 0.3, 10), M.inkLine, 1.0 - dy * 0.39, 10.2 + dy * 0.92, -3.9 - dy * 0.28, 0.3, 0, 0.4); // the one team armband, wide, between ink rings
  add(b, sph(1.7, 12, 10), M.skin, 0.9, 13.3, 0).scale.set(0.8, 0.95, 0.9);                    // the face
  add(b, sph(2.7, 16, 12), M.armour, 0.1, 14.2, 0).scale.set(1, 0.85, 1);                      // the helmet, dark, rounded
  add(b, cyl(2.8, 2.8, 0.4, 16), M.inkLine, 0.1, 13.1, 0);                                     // its rim line
  add(b, rbox(2.4, 1.6, 4.8, 0.4), M.joint, 1.7, 15.1, 0);                                     // the goggles, pushed up on the helmet
  add(b, rbox(1.2, 1.3, 4.6, 0.2), M.led, 2.6, 15.2, 0); add(b, sph(2.6, 8, 6), M.ledHalo, 2.8, 15.2, 0).scale.set(0.5, 0.5, 1); // their lenses: the one white LED, big enough for 1x, with a halo
  add(b, rbox(0.4, 0.8, 5.6, 0.1), M.joint, 0.2, 15.1, 0);                                      // their strap
  // the rifle: slim, in mid gunmetal, held level across the body ahead of the chest (the legibility pass: the barrel
  // and handguard 2.6-2.9 px wide at zoom 1.0, 2.0-2.3 until then; the receiver 3.3 px tall)
  const gun = grp(); gun.position.set(3.4, 9.6, 0); gun.rotation.set(0, 0.3, 0.04); b.add(gun);
  add(gun, rbox(3.6, 1.9, 1.6, 0.4), M.gun, -3.2, 0, 0);                                        // the stock
  add(gun, rbox(4.0, 2.2, 1.8, 0.4), M.gun, 0.3, 0, 0);                                         // the receiver
  add(gun, rbox(1.3, 2.6, 1.2, 0.3), M.gun, 0.3, -2.0, 0);                                      // the magazine
  add(gun, rbox(1.2, 1.6, 1.2, 0.2), M.gun, -1.2, -1.4, 0);                                     // the grip
  add(gun, rbox(1.6, 0.9, 1.1, 0.2), M.joint, 0.4, 1.5, 0);                                     // the sight
  add(gun, rbox(5.4, 1.9, 1.8, 0.4), M.gun, 5.0, 0, 0);                                         // the handguard
  add(gun, cyl(0.9, 0.9, 3.6, 8), M.gun, 9.4, 0.15, 0, 0, 0, Math.PI / 2);                       // the barrel
  limb(b, [0.6, 11.4, 3.6], [2.4, 9.4, 1.6], 1.1, M.camo); add(b, sph(0.85, 8, 6), M.armour, 2.6, 9.2, 1.4);  // the trigger hand, gloved
  limb(b, [0.6, 11.4, -3.6], [5.8, 9.8, -1.2], 1.1, M.camo); add(b, sph(0.85, 8, 6), M.armour, 6.2, 9.8, -1.0); // the fore hand on the handguard
  if (M.polish) { // secondary detail: the pack's shoulder straps down the chest, elbow pads, a canteen and a drop pouch, a band round the helmet
    for (const z of [-1.8, 1.8]) add(b, rbox(0.8, 3.2, 1.0, 0.3), M.armour, 3.05, 11.8, z, 0, 0, -0.25);
    add(b, sph(1.2, 8, 6), M.armour, 3.7, 10.4, -2.2); add(b, sph(1.15, 8, 6), M.armour, 1.5, 10.4, 2.7); // (the fore arm's pad past the armband, which it must not cover)
    add(b, cyl(0.9, 0.9, 1.9, 8), M.armour, -1.8, 6.8, 3.5); add(b, cyl(0.4, 0.4, 0.4, 6), M.joint, -1.8, 7.95, 3.5);
    add(g, rbox(1.3, 2.0, 1.4, 0.3), M.armour, st * 0.25 + 0.8, 5.0, 3.1);
    add(b, torus(2.72, 0.2), M.joint, 0.1, 14.3, 0, Math.PI / 2, 0, 0);
  }
  g.scale.setScalar(1.08);
  return g;
}

// The Data center's model moved to expedition-buildings.js on 2026-11-11 (`dataBlock`, Stelian's redraw: the server
// hall with its rack-light glow became a dark block with cyan neon and a chip on its lid; `serverHall` the option not taken).

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
