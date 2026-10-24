// The Vael: concept models for Endfall's second race. Same conventions as tools/render3d/models.js: game units
// (1 tile = 32), units face +x, y up, +z south. Materials: ivory ceramic shell, black glass, lavender ether light;
// the team colour goes on glazed panels and floating rings. Nothing here has legs or wheels: everything hovers,
// so the cast shadow sits a little apart from the body (a cheap "alien" tell at phone size).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './tools/render3d/models.js';
import { TEAM_COLORS, TEAM_LIGHT } from './tools/render3d/materials.js';

// ---------------- materials ----------------
function canvasTex(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Ivory shell: faint grown-ceramic grain and thin curved seams, no rivets, no rust. */
const glyph = canvasTex(256, (g, n) => {
  g.fillStyle = '#ececea'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 2500; i++) { const v = 215 + rnd() * 40; g.fillStyle = `rgba(${v},${v - 2},${v - 8},0.35)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(60,50,80,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(rnd() * n, rnd() * n, 30 + rnd() * 90, rnd() * 6, rnd() * 6 + 1.2); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(rnd() * n, rnd() * n, 30 + rnd() * 90, rnd() * 6, rnd() * 6 + 0.8); g.stroke(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,100,160,${0.05 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 24, 3 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); }
}, { repeat: 2 });
const glyphBump = canvasTex(256, (g, n) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#484848'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(rnd() * n, rnd() * n, 30 + rnd() * 90, rnd() * 6, rnd() * 6 + 1.2); g.stroke(); }
}, { srgb: false, repeat: 2 });

export const ETHER = 0xc6b4ff;
export function makeVaelMats(team) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    shell: std({ color: 0xe9e3d3, map: glyph, bumpMap: glyphBump, bumpScale: 0.6, metalness: 0.25, roughness: 0.38 }),
    shellPlain: std({ color: 0xe4ded0, metalness: 0.25, roughness: 0.4 }),
    bone: std({ color: 0xc9c2b2, metalness: 0.2, roughness: 0.5 }),                       // undersides, shaded parts
    ring: std({ color: 0xf6f1e6, metalness: 0.6, roughness: 0.22 }),                      // polished floating rings
    glass: std({ color: 0x17121f, metalness: 0.55, roughness: 0.12 }),                    // black glass
    glassBlade: std({ color: 0x241a33, metalness: 0.7, roughness: 0.1 }),
    gem: std({ color: 0x3b2d70, emissive: 0x8a74e0, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.15, flatShading: true }), // crystal lit from within
    ether: std({ color: 0x4a3a8a, emissive: 0xb3a0ff, emissiveIntensity: 1.45, roughness: 0.2 }),
    etherSoft: std({ color: 0x3a2d6e, emissive: 0xa88cf0, emissiveIntensity: 0.85, roughness: 0.3 }),
    core: std({ color: 0xffffff, emissive: 0xe8dcff, emissiveIntensity: 2.2 }),
    glaze: std({ color: TEAM_COLORS[team], map: glyph, bumpMap: glyphBump, bumpScale: 0.4, metalness: 0.3, roughness: 0.28 }),
    glazePlain: std({ color: TEAM_COLORS[team], metalness: 0.3, roughness: 0.3 }),
    glazeLight: std({ color: 0x222222, emissive: TEAM_LIGHT[team], emissiveIntensity: 2.8 }),
    pad: std({ color: 0x1b1626, emissive: 0x7a62c8, emissiveIntensity: 0.32, roughness: 0.6 }),  // glowing ground pads
  };
}

// ---------------- helpers ----------------
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
/** Octahedron stretched along y: the Vael crystal. */
export const crystal = (r, k = 2) => memo(`cr${r},${k}`, () => { const g = new THREE.OctahedronGeometry(r, 0); g.scale(1, k, 1); return g; });
export const cone = (r, h, seg = 16) => memo(`co${r},${h},${seg}`, () => boxUV(new THREE.ConeGeometry(r, h, seg)));
export const torus = (r, t, arc = Math.PI * 2, seg = 48) => memo(`to${r},${t},${arc},${seg}`, () => new THREE.TorusGeometry(r, t, 10, seg, arc));
/** Horizontal ring (a torus lying flat) at height y, optional arc starting at angle a0 (radians, around y). */
export function ring(parent, r, t, mat, y, { arc = Math.PI * 2, a0 = 0, seg = 48, tilt = 0 } = {}) {
  const m = add(parent, torus(r, t, arc, seg), mat, 0, y, 0);
  m.rotation.set(Math.PI / 2 + tilt, 0, 0); m.rotateZ(-a0);
  return m;
}
/** A surface of revolution from (radius, y) pairs, bottom to top. */
export function lathe(pts, seg = 24) {
  return memo(`la${JSON.stringify(pts)},${seg}`, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    g.computeVertexNormals(); return boxUV(g);
  });
}
/** Three-lobed plinth outline (top view) of radius r. */
const tri = (r, k = 0.55) => { const p = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = r * (1 - k * 0.5 + k * 0.5 * Math.cos(3 * a)); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };

// ---------------- units ----------------

/** Lumen (worker): a floating ivory droplet, black-glass belly, a lavender eye; two pebbles orbit it. */
export function lumen(M, f) {
  const g = grp(), b = grp(); b.position.y = 7 + (f % 2) * 0.8;
  add(b, sph(5, 20, 14), M.shell, 0, 0, 0).scale.set(1.25, 0.95, 1);
  add(b, cone(4.2, 9, 14), M.shell, -8.5, 0.4, 0, 0, 0, Math.PI / 2);                    // tail, apex at -x
  add(b, sph(4.6, 18, 12), M.glass, 0.4, -1.4, 0).scale.set(1.2, 0.7, 0.95);             // belly
  add(b, rbox(1.4, 1.8, 4, 0.5), M.ether, 5.6, 0.4, 0);                                   // eye slit
  add(b, sph(1.3, 10, 8), M.ether, 0.8, -3.6, 0);                                         // lift core under the belly
  const fin = add(b, rbox(8.5, 4.6, 1.2, 0.5), M.glaze, -3, 5, 0); fin.rotation.z = 0.35;
  for (const side of [-1, 1]) add(b, rbox(3.2, 0.8, 3, 0.3), M.glaze, -1, 1.6, side * 4.8, 0, 0, side * 0.3); // side vanes
  for (const side of [-1, 1]) {
    const a = (f % 2) * 0.8 + side * Math.PI / 2 + 0.6;
    add(b, sph(1.1, 10, 8), M.ring, Math.cos(a) * 8, 1.5 + side * 0.8, Math.sin(a) * 8);  // orbiting pebbles
  }
  g.add(b); return g;
}

/** Scythe (melee): a tall hovering knight, a tapering skirt instead of legs, two black-glass crescent blades. */
export function scythe(M, f) {
  const g = grp(), b = grp(); b.position.y = (f % 2) * 0.7;
  add(b, cone(4.2, 10, 16), M.bone, 0, 7.5, 0, Math.PI);                                 // skirt, apex down at y 2.5
  add(b, torus(3.8, 0.7, Math.PI * 2, 28), M.glass, 0, 12.4, 0, Math.PI / 2);            // waist ring
  add(b, rbox(5, 8.5, 6, 2), M.shell, 0, 16.5, 0);                                       // torso
  add(b, rbox(1.6, 7, 5.4, 0.6), M.glaze, 2.7, 17, 0);                                   // chest glaze
  add(b, rbox(1, 3.4, 1, 0.3), M.ether, 3.4, 17, 0);                                     // chest light
  for (const side of [-1, 1]) {
    add(b, sph(2.7, 14, 10), M.ring, -0.4, 21, side * 4.2);                              // shoulders
    add(b, rbox(3.6, 1.4, 4.4, 0.6), M.glaze, -0.6, 23.2, side * 4.4, side * 0.5, 0, 0); // pauldron glaze
    const arm = grp(); arm.position.set(0.5, 20, side * 4.6); arm.rotation.y = side * ((f % 2) ? -0.25 : 0.1);
    limb(arm, [0, 0, 0], [5, -4, side * 1.5], 1.2, M.shell);
    // crescent blade: a thin black-glass plate sweeping forward and out, with an ether edge line
    const bl = grp(); bl.position.set(5, -4, side * 1.5);
    const pts = [[0, 0], [4.5, side * -1.3], [9, side * -0.9], [12.5, side * 1.8], [10, side * 4], [5.5, side * 2.7], [1.5, side * 2.3]];
    add(bl, plate(pts, 1.1, 0.3), M.glassBlade, 0, -0.5, 0);
    add(bl, plate(pts.map(([x, z]) => [x * 0.7 + 2, z * 0.5 + side * -0.8]), 1.5, 0.2), M.ether, 0, -0.6, 0);
    arm.add(bl); b.add(arm);
  }
  add(b, sph(1.9, 14, 10), M.shell, 0.8, 25.2, 0).scale.set(1.35, 1, 0.9);               // head
  add(b, rbox(1, 0.8, 2.8, 0.3), M.ether, 3, 25.2, 0);                                   // visor slit
  add(b, rbox(0.7, 4.5, 1.3, 0.3), M.glaze, -0.8, 27.6, 0, 0, 0, 0.5);                   // crest
  g.add(b); return g;
}

/** Prism (ranged, ground and air): an ivory ring carrying a floating black crystal with a lavender heart. */
export function prism(M, f) {
  const g = grp(), b = grp(); b.position.y = 11 + (f % 2) * 0.8;
  ring(b, 10, 1.7, M.ring, 0, { seg: 44 });
  for (let k = 0; k < 3; k++) ring(b, 10, 1.9, M.glaze, 0.1, { arc: Math.PI / 3, a0: k / 3 * Math.PI * 2 + 0.3 + (f % 2) * 0.15 });
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 6; add(b, rbox(3, 4.5, 1.2, 0.4), M.shell, Math.cos(a) * 9.5, -3.2, Math.sin(a) * 9.5, 0, -a, 0); } // fins under the ring
  const c = grp(); c.position.set(0.5, 2.5, 0); c.rotation.set(0, (f % 2) * 0.5 + 0.4, -0.12);
  add(c, crystal(5.4, 1.9), M.gem);
  add(c, crystal(5.6, 0.25), M.glaze, 0, 0, 0);                                           // thin team belt through the crystal
  b.add(c);
  add(b, sph(1.3, 10, 8), M.ether, 0.5, 15, 0);                                           // tip light
  add(b, sph(1.8, 12, 9), M.ether, 11.2, 0.3, 0);                                         // the emitter on the ring's bow
  add(b, rbox(3.2, 1.2, 3.4, 0.4), M.shell, 9.2, 1.2, 0);
  g.add(b); return g;
}

/** Monolith (siege): a leaning ivory slab with a glowing fissure, floating over a black-glass disc, three shards orbit. */
export function monolith(M, f) {
  const g = grp(), b = grp(); b.position.y = (f % 2) * 0.6;
  add(b, cyl(14, 16.5, 3.5, 28), M.glass, 0, 5.5, 0);                                     // disc (hovering)
  ring(b, 16, 1.4, M.ring, 7);
  add(b, cyl(6, 9, 3, 20), M.bone, 0, 8.5, 0);
  const slab = grp(); slab.position.set(0, 9.5, 0); slab.rotation.z = -0.2;
  add(slab, rbox(13, 27, 10, 2.2), M.shell, 0, 13.5, 0);
  add(slab, rbox(1.2, 19, 2.4, 0.4), M.ether, 6.7, 13, 0);                                 // fissure on the front face
  add(slab, rbox(1.2, 2.4, 7, 0.4), M.ether, 6.7, 22.5, 0);
  add(slab, rbox(13.6, 3.6, 10.6, 0.8), M.glaze, 0, 21.5, 0);                              // team band
  add(slab, rbox(9, 2.4, 7, 1), M.glass, 0.6, 28, 0);                                      // cap
  add(slab, sph(1.5, 10, 8), M.core, 7, 25, 0);                                            // muzzle light
  b.add(slab);
  for (const side of [-1, 1]) add(b, rbox(5, 13, 2.4, 0.8), M.bone, -4, 16, side * 8, 0, side * 0.45, 0); // side wings
  for (let k = 0; k < 3; k++) {                                                             // orbiting shards
    const a = k / 3 * Math.PI * 2 + (f % 2) * 0.35 + 0.5, r = 17.5;
    const s = grp(); s.position.set(Math.cos(a) * r, 14 + Math.sin(a * 2) * 2, Math.sin(a) * r); s.rotation.z = 0.2;
    add(s, crystal(2.4, 1.8), M.gem);
    b.add(s);
  }
  g.add(b); return g;
}

/** Shrike (flyer): a swept crescent wing, ivory above, black glass beneath, team wingtips, a lit trailing edge. */
export function shrike(M, f) {
  const g = grp(), b = grp(); b.position.y = 20;
  const flex = (f % 2) ? 0.1 : -0.08;
  for (const side of [-1, 1]) {
    const w = grp(); w.rotation.x = -side * flex;
    const pts = [[12, 0], [7, side * 6], [0, side * 12], [-9, side * 19], [-11, side * 17], [-5, side * 9], [-1, side * 3], [-1, 0]];
    add(w, plate(pts, 2.6, 0.7), M.shell, 0, 0, 0);
    add(w, plate(pts.map(([x, z]) => [x * 0.92 - 0.3, z * 0.92]), 1.6, 0.4), M.glass, 0, -1.2, 0);
    add(w, rbox(5, 1.2, 4, 0.4), M.glaze, -7.5, 2.4, side * 14.5, 0, -side * 0.75, 0);    // wingtip glaze
    add(w, rbox(12, 0.6, 1.1, 0.3), M.ether, -5, 1.1, side * 10, 0, -side * 0.75, 0);     // trailing-edge light
    b.add(w);
  }
  add(b, sph(3.4, 16, 12), M.shell, 3, 1.6, 0).scale.set(1.7, 0.85, 1);                  // pod
  add(b, sph(1.6, 12, 9), M.glass, 7.6, 1.6, 0).scale.set(1.2, 0.8, 0.9);                // nose glass
  add(b, sph(0.8, 8, 6), M.ether, 8.8, 1.7, 0);
  add(b, rbox(7, 1, 2, 0.4), M.glaze, -1, 4.2, 0);                                        // dorsal glaze
  add(b, sph(1.2, 10, 8), M.ether, -6, 0.6, 0);                                           // drive light at the tail
  g.add(b); return g;
}

/** Halo (support): a thin team-coloured ring around a bright lavender heart; mends shields nearby. */
export function halo(M, f) {
  const g = grp(), b = grp(); b.position.y = 13 + (f % 2) * 0.8;
  ring(b, 7, 1.1, M.glazePlain, 0, { seg: 40, tilt: (f % 2) ? 0.18 : -0.12 });
  add(b, sph(2.6, 16, 12), M.ether, 0, 0, 0);
  add(b, sph(1.2, 10, 8), M.core, 0, 0, 0);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - Math.PI / 2; add(b, rbox(2.6, 1.6, 2.2, 0.5), M.shell, Math.cos(a) * 7, 0.6, Math.sin(a) * 7, 0, -a, 0); }
  g.add(b); return g;
}

export const VAEL_UNITS = {
  // r: farthest reach from the centre at any facing, h: height (same meaning as UNIT_MODELS)
  lumen: { build: lumen, frames: 2, r: 13, h: 20 },
  scythe: { build: scythe, frames: 2, r: 20, h: 30 },
  prism: { build: prism, frames: 2, r: 15, h: 29 },
  monolith: { build: monolith, frames: 2, r: 22, h: 40 },
  shrike: { build: shrike, frames: 2, r: 22, h: 26 },
  halo: { build: halo, frames: 2, r: 10, h: 18 },
};

// ---------------- buildings ----------------

/** Conflux (core, 4x4): an ivory dish, three petals leaning over a tall black crystal, a floating ring. */
export function conflux(M) {
  const g = grp();
  add(g, plate(tri(64, 0.25), 5, 1.5), M.shell, 0, 0, 0);
  add(g, cyl(44, 50, 6, 48), M.shell, 0, 8, 0);
  ring(g, 40, 1.6, M.glass, 11.5, { seg: 64 });
  add(g, cyl(10, 24, 0.6, 48), M.pad, 0, 11.4, 0);                                          // glowing inner floor
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, p = grp(); p.position.set(Math.cos(a) * 40, 11, Math.sin(a) * 40); p.rotation.y = -a;
    const lean = grp(); lean.rotation.z = 0.22; p.add(lean);
    add(lean, rbox(6.5, 34, 20, 3), M.shell, 0, 17, 0);
    add(lean, rbox(1.2, 24, 14, 1), M.glaze, -3.4, 17, 0);                                   // inner face glaze
    add(lean, rbox(1.2, 20, 1.4, 0.4), M.ether, -3.9, 18, 0);                                // light seam
    add(lean, rbox(5.5, 3, 21, 1), M.glaze, 0.3, 34.5, 0);                                   // petal cap (team)
    g.add(p);
  }
  const c = grp(); c.position.y = 42; c.rotation.y = 0.4;
  add(c, crystal(13, 2.3), M.gem); add(c, crystal(13.6, 0.25), M.glaze);
  g.add(c);
  add(g, sph(2.6, 14, 10), M.core, 0, 72, 0);
  ring(g, 31, 2.4, M.ring, 50, { seg: 72 });
  for (let k = 0; k < 3; k++) ring(g, 31, 2.7, M.glaze, 50.1, { arc: Math.PI / 4, a0: k / 3 * Math.PI * 2 - 0.4, seg: 72 });
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; add(g, sph(1.6, 10, 8), M.ether, Math.cos(a) * 57, 6.2, Math.sin(a) * 57); }
  add(g, rbox(24, 4, 5, 1.2), M.glass, 0, 7.5, 50);                                          // south gate
  add(g, rbox(20, 1.4, 1.4, 0.4), M.ether, 0, 10, 52);
  return g;
}

/** Spire (supply + power, 2x2): a tall ivory needle with a black-glass waist, a floating team ring, a lit tip. */
export function spire(M) {
  const g = grp();
  add(g, plate(tri(28, 0.5), 3, 1), M.shell, 0, 0, 0);
  add(g, cyl(20, 20, 0.6, 36), M.pad, 0, 3.2, 0);                                            // the power field's heart
  ring(g, 14, 1.5, M.glass, 4.6, { seg: 40 });
  add(g, lathe([[0.1, 0], [9, 0], [8.5, 6], [6, 22], [3.8, 36], [4.6, 42], [2.4, 56], [0.8, 70], [0, 72]], 20), M.shell, 0, 4, 0);
  add(g, cyl(4.2, 6.2, 12, 20), M.glass, 0, 34, 0);                                          // waist
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; add(g, rbox(0.9, 20, 0.9, 0.3), M.ether, Math.cos(a) * 7.6, 16, Math.sin(a) * 7.6, 0, -a, 0); }
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 3, p = grp(); p.position.set(Math.cos(a) * 15, 4, Math.sin(a) * 15); p.rotation.y = -a; p.rotation.z = 0.5; add(p, rbox(3, 16, 7, 1), M.bone, 0, 7, 0); add(p, rbox(1.2, 10, 4, 0.5), M.glaze, 1.9, 8, 0); g.add(p); }
  ring(g, 11, 1.6, M.glaze, 46, { seg: 44 });
  ring(g, 13.5, 0.7, M.ring, 58, { seg: 44, tilt: 0.25 });
  add(g, sph(2.6, 14, 10), M.ether, 0, 76, 0);
  add(g, sph(1.3, 10, 8), M.core, 0, 76, 0);
  return g;
}

/** Siphon (on a vent, 2x2): three ivory petals cupping the vent, a glass collar, the ether column rising through. */
export function siphon(M) {
  const g = grp();
  ring(g, 26, 3, M.shell, 2.5, { seg: 48 });
  ring(g, 18, 2, M.glass, 5.5, { seg: 48 });
  add(g, cyl(5, 7, 36, 18), M.etherSoft, 0, 22, 0);                                          // ether column
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, p = grp(); p.position.set(Math.cos(a) * 21, 4, Math.sin(a) * 21); p.rotation.y = -a;
    const lean = grp(); lean.rotation.z = 0.55; p.add(lean);
    add(lean, rbox(5, 30, 13, 2.5), M.shell, 0, 15, 0);
    add(lean, rbox(1.2, 20, 8, 1), M.glaze, -2.6, 15, 0);
    add(lean, sph(1.6, 10, 8), M.ether, 0, 30.5, 0);
    g.add(p);
  }
  ring(g, 11, 1.4, M.ring, 42, { seg: 40 });
  add(g, sph(3.2, 14, 10), M.ether, 0, 44, 0);
  add(g, rbox(10, 8, 10, 2), M.shell, 24, 5, -22); add(g, rbox(10.6, 1.4, 10.6, 0.4), M.glaze, 24, 9.4, -22); // condenser
  return g;
}

/** Kiln (production, 3x3): a low ivory ellipsoid hull, a black warp mouth to the south over a lit pad, two horns. */
export function kiln(M) {
  const g = grp();
  add(g, plate(tri(50, 0.18), 4, 1.2), M.shell, 0, 0, 0);
  const d = add(g, sph(30, 40, 24), M.shell, 0, 6, -6); d.scale.set(1.15, 0.56, 0.85);
  const b = add(g, cyl(30.5, 30.5, 4, 48), M.glass, 0, 8, -6); b.scale.set(1.15, 1, 0.85);
  const r1 = add(g, torus(26, 1.7, Math.PI * 2, 56), M.glaze, 0, 14, -6); r1.rotation.x = Math.PI / 2; r1.scale.set(1.15, 0.85, 1);
  add(g, rbox(26, 13, 8, 2.5), M.glass, 0, 11, 20);                                          // warp mouth
  add(g, rbox(22, 2, 1.6, 0.5), M.ether, 0, 11.5, 24.4);
  add(g, rbox(2, 12, 1.6, 0.5), M.ether, 0, 11.5, 24.4);
  add(g, cyl(13, 13, 0.6, 36), M.pad, 0, 4.4, 36);                                           // the pad units arrive on
  ring(g, 13.5, 0.8, M.ring, 4.7, { seg: 36 }).position.z = 36;
  for (const side of [-1, 1]) {
    add(g, cyl(1.4, 4.2, 28, 12), M.shell, side * 15, 26, -22, -0.35, 0, side * 0.3);         // horns
    add(g, sph(1.7, 10, 8), M.ether, side * 19, 38.5, -27);
  }
  add(g, rbox(14, 2.4, 5, 0.8), M.glaze, -4, 23.2, -6);                                       // crest
  add(g, sph(2, 12, 9), M.ether, 4, 23.6, -6);
  for (const side of [-1, 1]) add(g, sph(1.3, 10, 8), M.ether, side * 20, 6.2, 38);
  return g;
}

/** Ward (defence, 2x2): three ivory claws holding a floating black crystal; it fires from the crystal. */
export function ward(M) {
  const g = grp();
  add(g, plate(tri(30, 0.45), 3, 1), M.shell, 0, 0, 0);
  add(g, cyl(19, 19, 0.6, 36), M.pad, 0, 3.2, 0);
  ring(g, 17, 1.6, M.glass, 4.6, { seg: 40 });
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, x = Math.cos(a), z = Math.sin(a);
    limb(g, [x * 17, 3, z * 17], [x * 7, 30, z * 7], 2.3, M.shell);
    add(g, rbox(3.6, 4, 3.6, 0.8), M.glaze, x * 11.5, 17, z * 11.5, 0, -a, 0);
    add(g, sph(1.8, 10, 8), M.ring, x * 7, 30, z * 7);
  }
  const c = grp(); c.position.y = 36; c.rotation.y = 0.5;
  add(c, crystal(7.5, 1.7), M.gem); add(c, crystal(7.9, 0.3), M.glaze);
  g.add(c);
  add(g, sph(1.6, 10, 8), M.core, 0, 47.5, 0);
  return g;
}

/** Loom (tech, 2x2): a black-glass drum under a ring of ivory needles, threads of light between them. */
export function loom(M) {
  const g = grp();
  add(g, plate(tri(30, 0.3), 3, 1), M.shell, 0, 0, 0);
  add(g, cyl(20, 23, 10, 36), M.glass, 0, 8, 0);
  ring(g, 21.5, 1.5, M.glaze, 12, { seg: 48 });
  add(g, cyl(14, 20, 4, 36), M.shell, 0, 15, 0);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, x = Math.cos(a) * 15, z = Math.sin(a) * 15;
    add(g, cone(2.4, 22, 10), M.shell, x, 28, z);
    const nx = Math.cos(a + Math.PI / 3 * 2) * 15, nz = Math.sin(a + Math.PI / 3 * 2) * 15;
    limb(g, [x, 34, z], [nx, 34, nz], 0.35, M.ether);                                        // threads
  }
  add(g, crystal(4.5, 1.8), M.gem, 0, 30, 0);
  add(g, sph(1.4, 10, 8), M.core, 0, 37, 0);
  return g;
}

/** Zenith (air production, 3x3): a tall split tower with a floating launch ring between its halves. */
export function zenith(M) {
  const g = grp();
  add(g, plate(tri(50, 0.2), 4, 1.2), M.shell, 0, 0, 0);
  add(g, cyl(30, 34, 5, 48), M.glass, 0, 6.5, 0);
  for (const side of [-1, 1]) {
    const p = grp(); p.position.set(side * 20, 9, 0); p.rotation.z = 0;
    add(p, lathe([[0.1, 0], [11, 0], [9, 18], [6, 40], [2.5, 58], [0, 60]], 18), M.shell, 0, 0, 0);
    add(p, rbox(1.2, 26, 1.2, 0.4), M.ether, -side * 6.6, 26, 0);
    add(p, sph(2, 12, 9), M.ether, 0, 61, 0);
    g.add(p);
  }
  ring(g, 20, 2.2, M.ring, 40, { seg: 56, tilt: 0 });
  for (let k = 0; k < 2; k++) ring(g, 20, 2.5, M.glaze, 40.1, { arc: Math.PI / 2.2, a0: k * Math.PI + 0.9, seg: 56 });
  add(g, cyl(12, 12, 0.6, 36), M.pad, 0, 9.4, 0);
  add(g, rbox(44, 2, 3, 0.8), M.glaze, 0, 9.2, 34);
  for (const side of [-1, 1]) add(g, sph(1.4, 10, 8), M.ether, side * 36, 6.2, 34);
  return g;
}

export const VAEL_BUILDINGS = {
  // [footprint tiles, builder, height]
  conflux: [4, conflux, 80],
  spire: [2, spire, 80],
  siphon: [2, siphon, 50],
  kiln: [3, kiln, 42],
  ward: [2, ward, 50],
  loom: [2, loom, 40],
  zenith: [3, zenith, 72],
};
