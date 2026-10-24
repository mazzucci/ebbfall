// The Vael: concept models for Endfall's second race (v2, realism pass). Same conventions as
// tools/render3d/models.js: game units (1 tile = 32), units face +x, y up, +z south. Materials: mid-tone bone
// ceramic with crackle, chipped edges, soot and faint runes; dark bronze and obsidian trim; black glass; small,
// soft violet crystals. Team colour is a desaturated glaze kept to bands and accents. Everything hovers and uses
// three-fold symmetry, crescents and rings; shells are layered plates with recessed seams, ribs and vents so the
// 55-degree camera and the ink finish have edges to bite on, like the human plating.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './tools/render3d/models.js';
import { TEAM_COLORS } from './tools/render3d/materials.js';

// ---------------- textures ----------------
function canvasTex(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** A random crack: a jittered polyline from (x, y) in direction a, with a few short branches. */
function crack(g, x, y, a, len, branch = true) {
  g.beginPath(); g.moveTo(x, y);
  for (let k = 0; k < len; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 4; y += Math.sin(a) * 4; g.lineTo(x, y); if (branch && rnd() < 0.12) crack(g, x, y, a + (rnd() < 0.5 ? 1 : -1) * 0.9, 2 + rnd() * 5, false); }
  g.stroke();
}
/** Seams, crackle and chips drawn from one rnd sequence so the colour map and the bump map agree. */
function marks(g, n, { seam, edge, hair, chip }) {
  g.lineCap = 'round';
  const arcs = []; for (let i = 0; i < 9; i++) arcs.push([rnd() * n, rnd() * n, 40 + rnd() * 90, rnd() * 6, rnd() * 1.4 + 0.6]);
  g.strokeStyle = seam; g.lineWidth = 2.2; for (const [x, y, r, a, l] of arcs) { g.beginPath(); g.arc(x, y, r, a, a + l); g.stroke(); }
  g.strokeStyle = edge; g.lineWidth = 1; for (const [x, y, r, a, l] of arcs) { g.beginPath(); g.arc(x, y, r + 2, a + 0.05, a + l - 0.05); g.stroke(); }
  g.strokeStyle = hair; g.lineWidth = 0.9; for (let i = 0; i < 26; i++) crack(g, rnd() * n, rnd() * n, rnd() * 6.3, 6 + rnd() * 14);
  g.fillStyle = chip; for (let i = 0; i < 40; i++) { const x = rnd() * n, y = rnd() * n, r = 1 + rnd() * 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r * 2, y + r * 0.6); g.lineTo(x + r, y + r * 2); g.closePath(); g.fill(); }
}
/** Bone ceramic: grain, curved seams with a chipped light edge, hairline crackle, soot in recesses, faint runes.
 *  Light base so it multiplies the material colour, like materials.js `panel`. */
const crackle = canvasTex(256, (g, n) => {
  seed = 23;
  g.fillStyle = '#dcd6ca'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 4000; i++) { const v = 170 + rnd() * 85; g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,80,70,${0.05 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 8 + rnd() * 26, 4 + rnd() * 12, rnd() * 3, 0, 7); g.fill(); } // dust and soot
  seed = 99; marks(g, n, { seam: 'rgba(40,32,30,0.75)', edge: 'rgba(255,250,240,0.45)', hair: 'rgba(50,40,40,0.55)', chip: 'rgba(60,50,48,0.5)' });
  g.strokeStyle = 'rgba(70,58,80,0.45)'; g.lineWidth = 1.2;                                               // faint carved runes in rows
  for (let i = 0; i < 7; i++) { const x0 = rnd() * (n - 40), y0 = rnd() * n; for (let k = 0; k < 5; k++) { const x = x0 + k * 7; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 3, y0 + 5); if (rnd() < 0.5) g.lineTo(x + 5, y0 + 1); g.stroke(); } }
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(30,25,25,${0.08 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 2 + rnd() * 5, 6 + rnd() * 18, rnd() * 3, 0, 7); g.fill(); } // soot streaks
}, { repeat: 2 });
const crackleBump = canvasTex(256, (g, n) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  seed = 99; marks(g, n, { seam: '#2a2a2a', edge: '#c8c8c8', hair: '#383838', chip: '#4a4a4a' });
}, { srgb: false, repeat: 2 });
/** Dark bronze with a brushed grain and verdigris spots. */
const bronzeTex = canvasTex(128, (g, n) => {
  g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 1500; i++) { const v = 150 + rnd() * 100; g.fillStyle = `rgba(${v},${v - 10},${v - 30},0.35)`; g.fillRect(rnd() * n, rnd() * n, 3 + rnd() * 9, 1); }
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(90,140,120,${0.1 + rnd() * 0.2})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 2 + rnd() * 6, 2 + rnd() * 4, 0, 0, 7); g.fill(); }
}, { repeat: 3 });

// ---------------- materials ----------------
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
export function makeVaelMats(team) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glazeCol = mix(TEAM_COLORS[team], 0x7a7470, 0.3);
  return {
    shell: std({ color: 0xa69e8f, map: crackle, bumpMap: crackleBump, bumpScale: 1.0, metalness: 0.45, roughness: 0.48 }),
    shellDark: std({ color: 0x857d70, map: crackle, bumpMap: crackleBump, bumpScale: 0.9, metalness: 0.45, roughness: 0.55 }), // undersides, inner plates
    shellLight: std({ color: 0xb6ae9f, map: crackle, bumpMap: crackleBump, bumpScale: 0.8, metalness: 0.4, roughness: 0.45 }), // top plates that catch the key light
    bone: std({ color: 0x8c8477, metalness: 0.3, roughness: 0.6 }),
    ring: std({ color: 0xb3ab9c, map: crackle, bumpMap: crackleBump, bumpScale: 0.5, metalness: 0.65, roughness: 0.3 }),      // polished floating rings
    bronze: std({ color: 0x5c4630, map: bronzeTex, metalness: 0.9, roughness: 0.38 }),
    bronzeDark: std({ color: 0x3a2c1e, metalness: 0.85, roughness: 0.45 }),
    obsidian: std({ color: 0x16121c, metalness: 0.6, roughness: 0.22 }),
    glass: std({ color: 0x1a1522, metalness: 0.55, roughness: 0.15 }),
    glassBlade: std({ color: 0x1f1829, metalness: 0.75, roughness: 0.12 }),
    soot: std({ color: 0x2f2a27, roughness: 0.95, metalness: 0.1 }),                                       // contact zones, vents
    gem: std({ color: 0x241e3a, emissive: 0x5a4a98, emissiveIntensity: 0.38, metalness: 0.55, roughness: 0.2, flatShading: true }),
    gemBright: std({ color: 0x322a5c, emissive: 0x8070c8, emissiveIntensity: 0.7, metalness: 0.45, roughness: 0.2, flatShading: true }),
    ether: std({ color: 0x3a2d6e, emissive: 0x9a86e0, emissiveIntensity: 0.95, roughness: 0.3 }),
    etherSoft: std({ color: 0x2c2254, emissive: 0x8a74d0, emissiveIntensity: 0.6, roughness: 0.4 }),
    core: std({ color: 0xe0d8f0, emissive: 0xd4c6ff, emissiveIntensity: 1.3 }),
    glaze: std({ color: glazeCol, map: crackle, bumpMap: crackleBump, bumpScale: 0.6, metalness: 0.45, roughness: 0.4 }),
    glazePlain: std({ color: glazeCol, metalness: 0.4, roughness: 0.42 }),
    pad: std({ color: 0x2a2438, map: crackle, bumpMap: crackleBump, bumpScale: 0.6, emissive: 0x4a3a7a, emissiveIntensity: 0.14, roughness: 0.8, metalness: 0.2 }),
  };
}

// ---------------- helpers ----------------
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
export const crystal = (r, k = 2) => memo(`cr${r},${k}`, () => { const g = new THREE.OctahedronGeometry(r, 0); g.scale(1, k, 1); return g; });
export const cone = (r, h, seg = 16) => memo(`co${r},${h},${seg}`, () => boxUV(new THREE.ConeGeometry(r, h, seg)));
export const torus = (r, t, arc = Math.PI * 2, seg = 48) => memo(`to${r},${t},${arc},${seg}`, () => new THREE.TorusGeometry(r, t, 10, seg, arc));
export function ring(parent, r, t, mat, y, { arc = Math.PI * 2, a0 = 0, seg = 48, tilt = 0 } = {}) {
  const m = add(parent, torus(r, t, arc, seg), mat, 0, y, 0);
  m.rotation.set(Math.PI / 2 + tilt, 0, 0); m.rotateZ(-a0);
  return m;
}
export function lathe(pts, seg = 24) {
  return memo(`la${JSON.stringify(pts)},${seg}`, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    g.computeVertexNormals(); return boxUV(g);
  });
}
/** n small boxes around a circle (ribs, studs, vents); each faces outward. */
export function studs(parent, n, r, y, mat, [w, h, d] = [1.6, 1.2, 1.6], a0 = 0) {
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + a0; add(parent, rbox(w, h, d, Math.min(0.4, w / 3)), mat, Math.cos(a) * r, y, Math.sin(a) * r, 0, -a, 0); }
}
/** A recessed seam: a thin dark groove box. */
const groove = (parent, w, h, d, x, y, z, ry, mat) => add(parent, rbox(w, h, d, 0.2), mat, x, y, z, 0, ry, 0);
/** Three-lobed plinth outline (top view) of radius r. */
const tri = (r, k = 0.55) => { const p = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = r * (1 - k * 0.5 + k * 0.5 * Math.cos(3 * a)); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
/** A tiered plinth: dark base plate, bone step, bronze trim ring, a dim pad in the middle, studs on the step. */
function plinth(g, M, r, { pad = r * 0.62, lobes = 0.4 } = {}) {
  add(g, plate(tri(r, lobes), 2.6, 0.8), M.shellDark, 0, 0, 0);
  add(g, plate(tri(r * 0.86, lobes), 2.4, 0.8), M.shell, 0, 2.2, 0);
  ring(g, r * 0.66, 0.9, M.bronze, 4.7, { seg: 48 });
  add(g, cyl(pad, pad, 0.5, 40), M.pad, 0, 4.7, 0);
  studs(g, 9, r * 0.78, 4.4, M.bronzeDark, [2.4, 1, 1.4]);
}

// ---------------- units ----------------

/** Lumen (worker): a hovering bone droplet with bronze bands, an obsidian belly and a small violet eye. */
export function lumen(M, f) {
  const g = grp(), b = grp(); b.position.y = 7 + (f % 2) * 0.8;
  add(b, sph(5, 20, 14), M.shell, 0, 0, 0).scale.set(1.25, 0.95, 1);
  add(b, sph(5.1, 20, 14), M.shellLight, -0.3, 0.6, 0).scale.set(0.9, 0.75, 0.86);          // upper plate
  add(b, cone(4.2, 9, 14), M.shellDark, -8.5, 0.4, 0, 0, 0, Math.PI / 2);                   // tail, apex at -x
  add(b, cyl(1.2, 1.2, 1.4, 10), M.bronze, -13, 0.4, 0, 0, 0, Math.PI / 2);                 // tail tip
  add(b, sph(4.6, 18, 12), M.obsidian, 0.4, -1.4, 0).scale.set(1.2, 0.7, 0.95);             // belly
  for (const x of [-4.5, 1.5]) { const r = add(b, torus(4.9, 0.45, Math.PI * 2, 24), M.bronze, x, 0, 0); r.rotation.y = Math.PI / 2; } // bands
  add(b, rbox(1.2, 1.4, 3.2, 0.4), M.gemBright, 5.8, 0.4, 0);                               // eye slit
  add(b, rbox(1.6, 0.8, 4.2, 0.3), M.bronzeDark, 5.4, 1.3, 0);                              // brow
  add(b, sph(1.1, 10, 8), M.ether, 0.8, -3.6, 0);                                           // lift core under the belly
  add(b, cyl(1.6, 1.6, 0.6, 12), M.soot, 0.8, -3.9, 0);
  add(b, rbox(8.5, 4.6, 1.2, 0.5), M.glaze, -3, 5, 0).rotation.z = 0.35;                    // fin
  add(b, rbox(8.9, 0.8, 1.6, 0.3), M.bronzeDark, -3, 5, 0).rotation.z = 0.35;              // fin spine
  for (const side of [-1, 1]) {
    add(b, rbox(3.4, 0.9, 3.2, 0.3), M.glaze, -1, 1.6, side * 4.8, 0, 0, side * 0.3);      // side vanes
    add(b, rbox(1.2, 0.6, 1.4, 0.2), M.soot, -3.6, 2.4, side * 2.6);                        // vents
    const a = (f % 2) * 0.8 + side * Math.PI / 2 + 0.6;
    add(b, sph(1, 10, 8), M.bronze, Math.cos(a) * 8, 1.5 + side * 0.8, Math.sin(a) * 8);    // orbiting pebbles
  }
  g.add(b); return g;
}

/** Scythe (melee): a tall hovering knight; ribbed skirt, layered chest plates, bronze-spined crescent blades. */
export function scythe(M, f) {
  const g = grp(), b = grp(); b.position.y = (f % 2) * 0.7;
  add(b, cone(4.2, 10, 16), M.shellDark, 0, 7.5, 0, Math.PI);                               // skirt, apex down at y 2.5
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; add(b, rbox(0.7, 8, 0.9, 0.2), M.bronze, Math.cos(a) * 2.6, 7.8, Math.sin(a) * 2.6, 0, -a, 0); } // ribs
  add(b, sph(1, 10, 8), M.ether, 0, 2.6, 0);                                                // lift light at the apex
  add(b, torus(3.9, 0.7, Math.PI * 2, 28), M.bronze, 0, 12.4, 0, Math.PI / 2);              // waist ring
  add(b, rbox(5, 8.5, 6, 2), M.shell, 0, 16.5, 0);                                          // torso
  add(b, rbox(5.6, 3.2, 6.6, 1), M.shellDark, 0, 14, 0);                                    // lower plate
  add(b, rbox(3.6, 5, 6.8, 1), M.shellLight, 0.6, 18.4, 0);                                 // upper plate
  groove(b, 5.8, 0.5, 6.8, 0, 16, 0, 0, M.soot);                                            // seam between plates
  add(b, rbox(1.4, 5.5, 4.2, 0.6), M.glaze, 2.9, 17, 0);                                    // chest glaze
  add(b, rbox(0.8, 2.6, 0.8, 0.3), M.gemBright, 3.6, 17, 0);                                // chest light
  add(b, rbox(2.4, 1.2, 1.6, 0.3), M.soot, -2.8, 19.5, 0);                                  // back vent
  for (const side of [-1, 1]) {
    add(b, sph(2.7, 14, 10), M.shell, -0.4, 21, side * 4.2);                                // shoulders
    add(b, torus(2.5, 0.45, Math.PI * 2, 20), M.bronze, -0.4, 21.6, side * 4.3, Math.PI / 2 + side * 0.4); // shoulder rim
    add(b, rbox(3.6, 1.2, 4.2, 0.6), M.glaze, -0.6, 23.4, side * 4.4, side * 0.5, 0, 0);    // pauldron glaze
    const arm = grp(); arm.position.set(0.5, 20, side * 4.6); arm.rotation.y = side * ((f % 2) ? -0.25 : 0.1);
    limb(arm, [0, 0, 0], [5, -4, side * 1.5], 1.2, M.shellDark);
    add(arm, sph(1.4, 10, 8), M.bronze, 5, -4, side * 1.5);                                 // wrist joint
    const bl = grp(); bl.position.set(5, -4, side * 1.5);
    const pts = [[0, 0], [4.5, side * -1.3], [9, side * -0.9], [12.5, side * 1.8], [10, side * 4], [5.5, side * 2.7], [1.5, side * 2.3]];
    add(bl, plate(pts, 1.1, 0.3), M.glassBlade, 0, -0.5, 0);
    add(bl, plate(pts.map(([x, z]) => [x * 0.8 + 1, z * 0.45 + side * 0.9]), 1.6, 0.25), M.bronze, 0, -0.6, 0); // spine
    add(bl, rbox(6, 0.5, 0.5, 0.2), M.ether, 8, 0.6, side * -0.2, 0, side * 0.35, 0);       // edge light
    arm.add(bl); b.add(arm);
  }
  add(b, sph(1.9, 14, 10), M.shell, 0.8, 25.2, 0).scale.set(1.35, 1, 0.9);                  // head
  add(b, rbox(1, 0.7, 2.6, 0.3), M.gemBright, 3, 25.2, 0);                                  // visor slit
  add(b, rbox(0.7, 4.5, 1.3, 0.3), M.glaze, -0.8, 27.6, 0, 0, 0, 0.5);                      // crest
  add(b, rbox(0.9, 4.9, 0.5, 0.2), M.bronzeDark, -0.8, 27.6, 0, 0, 0, 0.5);
  g.add(b); return g;
}

/** Prism (ranged, ground and air): a segmented bone ring with bronze knuckles carrying a small violet crystal in a cradle. */
export function prism(M, f) {
  const g = grp(), b = grp(); b.position.y = 11 + (f % 2) * 0.8;
  ring(b, 10, 1.7, M.ring, 0, { seg: 44 });
  ring(b, 10, 1.1, M.obsidian, -1.2, { seg: 44 });                                           // dark underside ring
  for (let k = 0; k < 3; k++) ring(b, 10, 1.9, M.glaze, 0.1, { arc: Math.PI / 4, a0: k / 3 * Math.PI * 2 + 0.4 + (f % 2) * 0.15 });
  studs(b, 6, 10, 1.4, M.bronze, [2.4, 1.6, 2.6], 0.2);                                      // knuckles
  studs(b, 6, 10, 1.8, M.soot, [0.8, 0.5, 1.2], 0.2 + Math.PI / 6);                          // vents between them
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 6; add(b, rbox(3, 4.5, 1.2, 0.4), M.shellDark, Math.cos(a) * 9.5, -3.2, Math.sin(a) * 9.5, 0, -a, 0); add(b, rbox(1.2, 1.6, 1.4, 0.3), M.bronze, Math.cos(a) * 9.5, -5.6, Math.sin(a) * 9.5, 0, -a, 0); } // fins
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.9; limb(b, [Math.cos(a) * 9, 0.6, Math.sin(a) * 9], [Math.cos(a) * 2.6, 3.4, Math.sin(a) * 2.6], 0.55, M.bronze); } // cradle arms
  const c = grp(); c.position.set(0.5, 3.4, 0); c.rotation.set(0, (f % 2) * 0.5 + 0.4, -0.12);
  add(c, crystal(4.2, 1.9), M.gem);
  add(c, crystal(4.5, 0.22), M.bronzeDark);                                                  // belt through the crystal
  b.add(c);
  add(b, sph(0.9, 10, 8), M.core, 0.5, 12.8, 0);                                             // tip light
  add(b, rbox(3.4, 1.4, 3.6, 0.5), M.shell, 9.4, 1.3, 0);                                    // emitter housing on the bow
  add(b, cyl(0.9, 1.1, 2.4, 10), M.bronze, 11.4, 1.3, 0, 0, 0, Math.PI / 2);
  add(b, sph(1, 10, 8), M.ether, 12.6, 1.3, 0);
  g.add(b); return g;
}

/** Monolith (siege): a leaning plated slab with a bronze-framed fissure over a ribbed obsidian disc; three shards orbit. */
export function monolith(M, f) {
  const g = grp(), b = grp(); b.position.y = (f % 2) * 0.6;
  add(b, cyl(14, 16.5, 3.5, 28), M.obsidian, 0, 5.5, 0);                                     // disc (hovering)
  ring(b, 16, 1.4, M.ring, 7);
  studs(b, 12, 15.2, 7.4, M.bronze, [1.4, 1, 3], 0.1);                                       // rim ribs
  add(b, cyl(6, 9, 3, 20), M.bone, 0, 8.5, 0);
  ring(b, 8.5, 0.6, M.bronze, 9.6, { seg: 28 });
  const slab = grp(); slab.position.set(0, 9.5, 0); slab.rotation.z = -0.2;
  add(slab, rbox(13, 27, 10, 2.2), M.shell, 0, 13.5, 0);
  for (const side of [-1, 1]) add(slab, rbox(11, 20, 1.6, 0.6), M.shellLight, -0.3, 13, side * 5.6);        // side plates
  for (const y of [6, 13, 20]) groove(slab, 13.4, 0.5, 10.4, 0, y, 0, 0, M.soot);                           // seams
  add(slab, rbox(3.4, 22, 8, 0.8), M.shellDark, 6.2, 13, 0);                                 // recessed front channel
  add(slab, rbox(3.6, 23, 2.6, 0.5), M.bronzeDark, 6.3, 13, 0);                              // fissure frame
  add(slab, rbox(1, 19, 1.2, 0.3), M.ether, 7.2, 13, 0);                                     // the fissure
  add(slab, rbox(13.6, 3, 10.6, 0.8), M.glaze, 0, 22, 0);                                    // team band
  add(slab, rbox(9, 2.4, 7, 1), M.obsidian, 0.6, 28, 0);                                     // cap
  add(slab, rbox(4, 1.2, 1.4, 0.3), M.soot, -4, 27.5, 2.5); add(slab, rbox(4, 1.2, 1.4, 0.3), M.soot, -4, 27.5, -2.5); // cap vents
  add(slab, sph(1.1, 10, 8), M.core, 7, 25, 0);                                              // muzzle light
  b.add(slab);
  for (const side of [-1, 1]) { add(b, rbox(5, 13, 2.4, 0.8), M.shellDark, -4, 16, side * 8, 0, side * 0.45, 0); add(b, rbox(5.2, 1.4, 2.8, 0.4), M.bronze, -4, 22.8, side * 8, 0, side * 0.45, 0); } // side wings
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + (f % 2) * 0.35 + 0.5, r = 17.5;
    const s = grp(); s.position.set(Math.cos(a) * r, 14 + Math.sin(a * 2) * 2, Math.sin(a) * r); s.rotation.z = 0.2;
    add(s, crystal(2, 1.8), M.gem); add(s, crystal(2.2, 0.2), M.bronzeDark);
    b.add(s);
  }
  g.add(b); return g;
}

/** Shrike (flyer): a swept crescent wing of layered bone plates, bronze leading edges, obsidian canopy and belly. */
export function shrike(M, f) {
  const g = grp(), b = grp(); b.position.y = 20;
  const flex = (f % 2) ? 0.1 : -0.08;
  for (const side of [-1, 1]) {
    const w = grp(); w.rotation.x = -side * flex;
    const pts = [[12, 0], [7, side * 6], [0, side * 12], [-9, side * 19], [-11, side * 17], [-5, side * 9], [-1, side * 3], [-1, 0]];
    add(w, plate(pts, 2.6, 0.7), M.shell, 0, 0, 0);
    add(w, plate(pts.map(([x, z]) => [x * 0.92 - 0.3, z * 0.92]), 1.6, 0.4), M.obsidian, 0, -1.2, 0);
    add(w, plate([[8, side * 1], [4, side * 5], [-2, side * 9.5], [-5, side * 8], [-2, side * 3.5], [2, side * 0.5]], 1.2, 0.4), M.shellLight, 0, 2.6, 0); // root plate
    add(w, rbox(11, 0.9, 1.2, 0.3), M.bronze, 4.5, 2.1, side * 6.5, 0, -side * 0.78, 0);    // leading-edge strip
    add(w, rbox(5, 1.3, 4, 0.4), M.glaze, -7.5, 2.4, side * 14.5, 0, -side * 0.75, 0);      // wingtip glaze
    add(w, rbox(5.4, 0.5, 0.6, 0.2), M.bronzeDark, -7.5, 2.6, side * 14.5, 0, -side * 0.75, 0);
    add(w, rbox(9, 0.5, 0.8, 0.2), M.ether, -5, 1, side * 10, 0, -side * 0.75, 0);          // trailing-edge light
    for (const k of [3, 6]) add(w, rbox(1.6, 0.5, 0.8, 0.2), M.soot, -3 + k * 0.2, 2.7, side * k, 0, -side * 0.75, 0); // vents
    b.add(w);
  }
  add(b, sph(3.4, 16, 12), M.shell, 3, 1.6, 0).scale.set(1.7, 0.85, 1);                    // pod
  add(b, sph(3.2, 16, 12), M.shellLight, 2.4, 2.4, 0).scale.set(1.3, 0.6, 0.8);
  add(b, sph(1.6, 12, 9), M.obsidian, 7.6, 1.6, 0).scale.set(1.2, 0.8, 0.9);               // canopy
  add(b, torus(1.5, 0.25, Math.PI * 2, 16), M.bronze, 6.4, 1.6, 0, 0, Math.PI / 2, 0);     // canopy rim
  add(b, sph(0.6, 8, 6), M.ether, 8.8, 1.7, 0);
  add(b, rbox(7, 1, 2, 0.4), M.glaze, -1, 4.2, 0);                                          // dorsal glaze
  add(b, rbox(7.4, 0.5, 0.6, 0.2), M.bronzeDark, -1, 4.5, 0);
  add(b, cyl(1.4, 1.8, 2.4, 12), M.bronzeDark, -6.2, 0.8, 0, 0, 0, Math.PI / 2);           // drive nozzle
  add(b, sph(0.9, 10, 8), M.ether, -7.2, 0.8, 0);
  g.add(b); return g;
}

/** Halo (support): a thin team ring with bronze knuckles around a small bright heart. */
export function halo(M, f) {
  const g = grp(), b = grp(); b.position.y = 13 + (f % 2) * 0.8;
  const tilt = (f % 2) ? 0.18 : -0.12;
  ring(b, 7, 1.1, M.glazePlain, 0, { seg: 40, tilt });
  ring(b, 7, 0.7, M.obsidian, -0.9, { seg: 40, tilt });
  add(b, sph(2.2, 16, 12), M.gemBright, 0, 0, 0);
  add(b, sph(0.9, 10, 8), M.core, 0, 0, 0);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - Math.PI / 2; add(b, rbox(2.8, 1.8, 2.4, 0.5), M.shell, Math.cos(a) * 7, 0.6, Math.sin(a) * 7, 0, -a, 0); add(b, rbox(1.2, 0.8, 1.2, 0.2), M.bronze, Math.cos(a) * 7, 1.9, Math.sin(a) * 7, 0, -a, 0); limb(b, [Math.cos(a) * 6, 0, Math.sin(a) * 6], [Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2], 0.35, M.bronzeDark); }
  g.add(b); return g;
}

export const VAEL_UNITS = {
  lumen: { build: lumen, frames: 2, r: 14, h: 20 },
  scythe: { build: scythe, frames: 2, r: 20, h: 30 },
  prism: { build: prism, frames: 2, r: 15, h: 29 },
  monolith: { build: monolith, frames: 2, r: 22, h: 40 },
  shrike: { build: shrike, frames: 2, r: 22, h: 26 },
  halo: { build: halo, frames: 2, r: 10, h: 18 },
};

// ---------------- buildings ----------------

/** Conflux (core, 4x4): a tiered bone dish with a bronze-trimmed obsidian moat, three plated petals at N / ESE /
 *  WSW leaning over a violet crystal, a floating ring with team arcs, pipes and service pods on the dish. */
export function conflux(M) {
  const g = grp();
  add(g, plate(tri(64, 0.25), 4, 1.5), M.shellDark, 0, 0, 0);
  add(g, plate(tri(58, 0.25), 3, 1.2), M.shell, 0, 3.5, 0);
  studs(g, 12, 60, 4.4, M.bronzeDark, [3, 1.2, 2.4], 0.26);
  add(g, cyl(44, 50, 6, 48), M.shell, 0, 9, 0);
  ring(g, 47, 0.8, M.bronze, 12.2, { seg: 64 });
  ring(g, 40, 1.6, M.obsidian, 12, { seg: 64 });
  add(g, cyl(10, 24, 0.6, 48), M.pad, 0, 11.9, 0);
  studs(g, 24, 36, 12.3, M.bronzeDark, [1.2, 0.8, 2.2], 0.1);                                   // grating around the pad
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, p = grp(); p.position.set(Math.cos(a) * 40, 11.5, Math.sin(a) * 40); p.rotation.y = -a;
    const lean = grp(); lean.rotation.z = 0.22; p.add(lean);
    add(lean, rbox(6.5, 34, 20, 3), M.shell, 0, 17, 0);
    add(lean, rbox(4, 26, 16, 1.5), M.shellLight, 2.4, 16, 0);                                   // outer plate
    for (const y of [9, 18, 27]) groove(lean, 7, 0.5, 20.4, 0, y, 0, 0, M.soot);
    add(lean, rbox(1.2, 24, 14, 1), M.glaze, -3.4, 17, 0);                                       // inner face glaze
    add(lean, rbox(1.4, 25, 1.2, 0.3), M.bronzeDark, -3.9, 17, 0);
    add(lean, rbox(1, 16, 0.8, 0.3), M.ether, -4.1, 18, 0);                                      // light seam
    add(lean, rbox(5.5, 3, 21, 1), M.glaze, 0.3, 34.5, 0);                                       // petal cap
    add(lean, rbox(6, 1, 21.6, 0.3), M.bronze, 0.3, 36, 0);
    for (const z of [-6, 0, 6]) add(lean, rbox(2.4, 1.2, 3, 0.3), M.soot, 3.6, 30, z);           // cap vents
    g.add(p);
    limb(g, [Math.cos(a) * 48, 12.5, Math.sin(a) * 48], [Math.cos(a) * 58, 6, Math.sin(a) * 58], 1.3, M.bronze); // feed pipes
    add(g, rbox(6, 5, 6, 1), M.shellDark, Math.cos(a + 0.35) * 52, 8.5, Math.sin(a + 0.35) * 52, 0, -a, 0); // service pods
  }
  const c = grp(); c.position.y = 40; c.rotation.y = 0.4;
  add(c, crystal(8.5, 2.3), M.gem); add(c, crystal(9, 0.25), M.bronzeDark);
  g.add(c);
  add(g, cyl(5, 8, 6, 12), M.bronze, 0, 15, 0);                                                  // crystal socket
  add(g, sph(1.8, 14, 10), M.core, 0, 63, 0);
  ring(g, 31, 2.2, M.ring, 46, { seg: 72 });
  ring(g, 31, 1.2, M.obsidian, 44.6, { seg: 72 });
  for (let k = 0; k < 3; k++) ring(g, 31, 2.5, M.glaze, 46.1, { arc: Math.PI / 4, a0: k / 3 * Math.PI * 2 - 0.4, seg: 72 });
  studs(g, 9, 31, 47.4, M.bronze, [2.2, 1.4, 3], 0.15);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; add(g, sph(1.2, 10, 8), M.ether, Math.cos(a) * 55, 5.8, Math.sin(a) * 55); add(g, cyl(1.5, 1.5, 1.6, 8), M.bronzeDark, Math.cos(a) * 55, 4.8, Math.sin(a) * 55); }
  add(g, rbox(24, 4, 5, 1.2), M.obsidian, 0, 7.5, 50);                                           // south gate
  add(g, rbox(26, 1.4, 5.6, 0.4), M.bronze, 0, 10, 50);
  add(g, rbox(20, 0.8, 1, 0.3), M.ether, 0, 9, 52.4);
  return g;
}

/** Spire (supply + power, 2x2): a tall bone needle in bronze collars, an obsidian waist, a floating team ring, a lit tip. */
export function spire(M) {
  const g = grp();
  plinth(g, M, 28, { pad: 18, lobes: 0.5 });
  add(g, lathe([[0.1, 0], [9, 0], [8.5, 6], [6, 22], [3.8, 36], [4.6, 42], [2.4, 56], [0.8, 70], [0, 72]], 20), M.shell, 0, 4, 0);
  for (const [y, r] of [[8, 8.6], [20, 6.6], [45, 4.2]]) ring(g, r, 0.7, M.bronze, y, { seg: 24 });     // collars
  add(g, cyl(4.2, 6.2, 12, 20), M.obsidian, 0, 34, 0);                                                 // waist
  studs(g, 6, 5.4, 34, M.bronzeDark, [1, 8, 1.2]);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; add(g, rbox(0.7, 16, 0.7, 0.3), M.ether, Math.cos(a) * 7.4, 16, Math.sin(a) * 7.4, 0, -a, 0); }
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 3, p = grp(); p.position.set(Math.cos(a) * 15, 4, Math.sin(a) * 15); p.rotation.y = -a; p.rotation.z = 0.5; add(p, rbox(3, 16, 7, 1), M.shellDark, 0, 7, 0); add(p, rbox(1.2, 10, 4, 0.5), M.glaze, 1.9, 8, 0); add(p, rbox(3.4, 1, 7.4, 0.3), M.bronze, 0, 15, 0); g.add(p); }
  ring(g, 11, 1.5, M.glaze, 46, { seg: 44 });
  ring(g, 11, 0.9, M.obsidian, 44.8, { seg: 44 });
  studs(g, 6, 11, 46.8, M.bronze, [1.6, 1.2, 2.2]);
  ring(g, 13.5, 0.6, M.bronze, 58, { seg: 44, tilt: 0.25 });
  add(g, sph(2, 14, 10), M.gemBright, 0, 76, 0);
  add(g, sph(0.9, 10, 8), M.core, 0, 76, 0);
  return g;
}

/** Siphon (on a vent, 2x2): three plated petals cupping the vent, bronze collars, the ether column, a condenser. */
export function siphon(M) {
  const g = grp();
  ring(g, 26, 3, M.shell, 2.5, { seg: 48 });
  ring(g, 26, 1.2, M.bronze, 4.6, { seg: 48 });
  studs(g, 12, 26, 5, M.bronzeDark, [2, 1, 2.6], 0.2);
  ring(g, 18, 2, M.obsidian, 5.5, { seg: 48 });
  add(g, cyl(5, 7, 36, 18), M.etherSoft, 0, 22, 0);                                                    // ether column
  for (const y of [12, 24, 36]) ring(g, 6.2 - y * 0.03, 0.6, M.bronze, y, { seg: 20 });
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, p = grp(); p.position.set(Math.cos(a) * 21, 4, Math.sin(a) * 21); p.rotation.y = -a;
    const lean = grp(); lean.rotation.z = 0.55; p.add(lean);
    add(lean, rbox(5, 30, 13, 2.5), M.shell, 0, 15, 0);
    add(lean, rbox(3, 22, 10, 1.2), M.shellLight, 1.8, 14, 0);
    for (const y of [8, 16, 24]) groove(lean, 5.4, 0.5, 13.4, 0, y, 0, 0, M.soot);
    add(lean, rbox(1.2, 20, 8, 1), M.glaze, -2.6, 15, 0);
    add(lean, rbox(5.4, 1, 13.4, 0.3), M.bronze, 0, 30, 0);
    add(lean, sph(1.2, 10, 8), M.ether, 0, 31, 0);
    g.add(p);
  }
  ring(g, 11, 1.4, M.ring, 42, { seg: 40 });
  add(g, sph(2.6, 14, 10), M.gemBright, 0, 44, 0);
  add(g, rbox(10, 8, 10, 2), M.shellDark, 24, 5, -22); add(g, rbox(10.6, 1.4, 10.6, 0.4), M.glaze, 24, 9.4, -22); // condenser
  add(g, cyl(2.5, 2.5, 6, 12), M.bronze, 24, 13, -22); add(g, rbox(2, 2, 3, 0.4), M.soot, 24, 16, -22);
  limb(g, [20, 4, -18], [12, 4, -10], 1.2, M.bronze);
  return g;
}

/** Kiln (production, 3x3): a ribbed bone dome with bronze hoops, a recessed obsidian warp mouth to the south over a
 *  lit pad, two collared horns, a crest and roof vents. */
export function kiln(M) {
  const g = grp();
  add(g, plate(tri(50, 0.18), 3, 1.2), M.shellDark, 0, 0, 0);
  add(g, plate(tri(45, 0.18), 2.6, 1), M.shell, 0, 2.6, 0);
  studs(g, 12, 47, 3.6, M.bronzeDark, [2.6, 1, 2.2], 0.2);
  add(g, sph(30, 40, 24), M.shell, 0, 6, -6).scale.set(1.15, 0.56, 0.85);
  add(g, sph(27, 40, 24), M.shellLight, 0, 9.5, -6).scale.set(1.05, 0.5, 0.78);                       // upper plate layer
  add(g, cyl(30.5, 30.5, 4, 48), M.obsidian, 0, 8, -6).scale.set(1.15, 1, 0.85);
  const hoop = (r, t, mat, y) => { const m = add(g, torus(r, t, Math.PI * 2, 56), mat, 0, y, -6); m.rotation.x = Math.PI / 2; m.scale.set(1.15, 0.85, 1); };
  hoop(30.8, 0.8, M.bronze, 10.2); hoop(26, 1.7, M.glaze, 14); hoop(17, 0.8, M.bronze, 20);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; add(g, rbox(1.4, 1.2, 8, 0.3), M.bronzeDark, Math.cos(a) * 24 * 1.15, 16.8, -6 + Math.sin(a) * 24 * 0.85, 0, -a + Math.PI / 2, 0); } // ribs
  for (const z of [-16, -10]) add(g, rbox(6, 1.2, 2.6, 0.4), M.soot, 10, 21.6, z);                     // roof vents
  add(g, rbox(26, 13, 8, 2.5), M.obsidian, 0, 11, 20);                                                  // warp mouth
  add(g, rbox(28, 14.5, 2, 0.8), M.shellDark, 0, 11, 17);                                               // mouth frame
  add(g, rbox(27, 1.6, 9, 0.5), M.bronze, 0, 18.4, 20);
  add(g, rbox(22, 1.2, 1, 0.4), M.ether, 0, 11.5, 24.4);
  add(g, rbox(1.2, 10, 1, 0.4), M.ether, 0, 11.5, 24.4);
  add(g, cyl(13, 13, 0.6, 36), M.pad, 0, 4.4, 36);                                                     // the pad units arrive on
  ring(g, 13.5, 0.8, M.bronze, 4.7, { seg: 36 }).position.z = 36;
  for (const side of [-1, 1]) {
    add(g, cyl(1.4, 4.2, 28, 12), M.shell, side * 15, 26, -22, -0.35, 0, side * 0.3);                   // horns
    for (const t of [0.3, 0.6]) add(g, cyl(4.2 - t * 2.4, 4.2 - t * 2.4, 1.2, 12), M.bronze, side * (15 + t * 8), 12 + t * 28, -22 - t * 9.5, -0.35, 0, side * 0.3);
    add(g, sph(1.2, 10, 8), M.ether, side * 19, 38.5, -27);
  }
  add(g, rbox(14, 2.4, 5, 0.8), M.glaze, -4, 23.2, -6);                                                 // crest
  add(g, rbox(14.6, 0.8, 5.6, 0.3), M.bronze, -4, 24.6, -6);
  add(g, sph(1.6, 12, 9), M.gemBright, 4, 23.6, -6);
  for (const side of [-1, 1]) { add(g, sph(1, 10, 8), M.ether, side * 20, 6.2, 38); add(g, cyl(1.3, 1.3, 1.4, 8), M.bronzeDark, side * 20, 5.2, 38); }
  return g;
}

/** Ward (defence, 2x2): three bronze-knuckled bone claws holding a violet crystal over a tiered plinth. */
export function ward(M) {
  const g = grp();
  plinth(g, M, 30, { pad: 17, lobes: 0.45 });
  ring(g, 17, 1.6, M.obsidian, 5.6, { seg: 40 });
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, x = Math.cos(a), z = Math.sin(a);
    limb(g, [x * 17, 3, z * 17], [x * 7, 30, z * 7], 2.3, M.shell);
    limb(g, [x * 16, 5, z * 16], [x * 8.5, 24, z * 8.5], 1.4, M.shellLight);                            // outer plate on the claw
    add(g, rbox(6, 5, 6, 1.2), M.shellDark, x * 17, 5, z * 17, 0, -a, 0);                                // claw root
    add(g, rbox(3.6, 4, 3.6, 0.8), M.glaze, x * 11.5, 17, z * 11.5, 0, -a, 0);
    add(g, rbox(4, 0.8, 4, 0.3), M.bronze, x * 11.5, 19.3, z * 11.5, 0, -a, 0);
    add(g, sph(1.8, 10, 8), M.bronze, x * 7, 30, z * 7);
    add(g, rbox(1.4, 0.8, 2, 0.3), M.soot, x * 14, 10, z * 14, 0, -a, 0);
  }
  const c = grp(); c.position.y = 36; c.rotation.y = 0.5;
  add(c, crystal(5.4, 1.8), M.gem); add(c, crystal(5.8, 0.3), M.bronzeDark);
  g.add(c);
  add(g, sph(1.1, 10, 8), M.core, 0, 46.5, 0);
  return g;
}

/** Loom (tech, 2x2): a bronze-banded obsidian drum under a ring of bone needles with threads of light. */
export function loom(M) {
  const g = grp();
  plinth(g, M, 30, { pad: 14, lobes: 0.3 });
  add(g, cyl(20, 23, 10, 36), M.obsidian, 0, 9, 0);
  studs(g, 12, 21.5, 7, M.bronzeDark, [1.2, 6, 1.6], 0.2);
  ring(g, 21.5, 1.5, M.glaze, 13, { seg: 48 });
  ring(g, 21.5, 0.7, M.bronze, 14.6, { seg: 48 });
  add(g, cyl(14, 20, 4, 36), M.shell, 0, 16, 0);
  add(g, cyl(11, 14, 2, 36), M.shellLight, 0, 19, 0);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, x = Math.cos(a) * 15, z = Math.sin(a) * 15;
    add(g, cone(2.4, 22, 10), M.shell, x, 29, z);
    add(g, cyl(2.6, 2.6, 1.2, 10), M.bronze, x, 22, z);
    const nx = Math.cos(a + Math.PI / 3 * 2) * 15, nz = Math.sin(a + Math.PI / 3 * 2) * 15;
    limb(g, [x, 35, z], [nx, 35, nz], 0.3, M.ether);
  }
  add(g, crystal(4, 1.8), M.gem, 0, 31, 0);
  add(g, sph(1, 10, 8), M.core, 0, 38, 0);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.5; add(g, rbox(3, 2, 3, 0.4), M.soot, Math.cos(a) * 17, 18.4, Math.sin(a) * 17, 0, -a, 0); } // vents
  return g;
}

/** Zenith (air production, 3x3): two collared bone towers east and west, a floating launch ring between them. */
export function zenith(M) {
  const g = grp();
  add(g, plate(tri(50, 0.2), 3, 1.2), M.shellDark, 0, 0, 0);
  add(g, plate(tri(45, 0.2), 2.6, 1), M.shell, 0, 2.6, 0);
  studs(g, 12, 47, 3.6, M.bronzeDark, [2.6, 1, 2.2], 0.2);
  add(g, cyl(30, 34, 5, 48), M.obsidian, 0, 7, 0);
  ring(g, 32.5, 0.9, M.bronze, 9.6, { seg: 64 });
  for (const side of [-1, 1]) {
    const p = grp(); p.position.set(side * 20, 9, 0);
    add(p, lathe([[0.1, 0], [11, 0], [9, 18], [6, 40], [2.5, 58], [0, 60]], 18), M.shell, 0, 0, 0);
    for (const [y, r] of [[6, 10.2], [18, 9], [34, 6.8], [48, 4.4]]) ring(p, r, 0.7, M.bronze, y, { seg: 24 });
    add(p, rbox(1, 24, 1, 0.4), M.ether, -side * 6.4, 27, 0);
    for (const dz of [-3, 3]) add(p, rbox(1.4, 2.4, 2, 0.3), M.soot, -side * 7.6, 13, dz);
    add(p, sph(1.5, 12, 9), M.gemBright, 0, 61, 0);
    g.add(p);
  }
  ring(g, 20, 2.2, M.ring, 40, { seg: 56 });
  ring(g, 20, 1.2, M.obsidian, 38.6, { seg: 56 });
  for (let k = 0; k < 2; k++) ring(g, 20, 2.5, M.glaze, 40.1, { arc: Math.PI / 2.2, a0: k * Math.PI + 0.9, seg: 56 });
  studs(g, 8, 20, 41.6, M.bronze, [2, 1.4, 2.8], 0.3);
  add(g, cyl(12, 12, 0.6, 36), M.pad, 0, 9.9, 0);
  add(g, rbox(44, 2, 3, 0.8), M.glaze, 0, 9.2, 34);
  add(g, rbox(44.6, 0.7, 3.4, 0.3), M.bronze, 0, 10.5, 34);
  for (const side of [-1, 1]) { add(g, sph(1.1, 10, 8), M.ether, side * 36, 6.2, 34); add(g, rbox(8, 6, 8, 1.2), M.shellDark, side * 34, 6, -30); add(g, rbox(8.4, 1, 8.4, 0.3), M.bronze, side * 34, 9.4, -30); }
  return g;
}

export const VAEL_BUILDINGS = {
  conflux: [4, conflux, 70],
  spire: [2, spire, 80],
  siphon: [2, siphon, 50],
  kiln: [3, kiln, 42],
  ward: [2, ward, 50],
  loom: [2, loom, 42],
  zenith: [3, zenith, 72],
};
