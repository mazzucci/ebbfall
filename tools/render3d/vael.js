// The Vael, Endfall's second race (v3 look: v1's identity with alien realism). Same conventions as
// tools/render3d/models.js: game units (1 tile = 32), units face +x, y up, +z south. A polished alien artifact, not
// a weathered machine: pearl ceramic with a clearcoat sheen and clean hairline seams, engraved channels and inlaid
// light lines; black glass; vivid team glaze with a faint iridescence; small violet crystals wrapped in translucent
// halos so the glow falls off instead of sitting flat (the Halo's mending light alone is pale aqua, so a healer never
// reads as a weapon). Plates are layered (a lighter top plate over a darker underside) so crevices read as ambient
// occlusion. Everything hovers; three-fold symmetry, crescents and rings.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './models.js';
import { NEUTRAL, team } from './materials.js';

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
/** The same seams on the colour map and the bump map: curved hairline panel seams, a few engraved channels and
 *  inlaid light lines. Clean: no grime, rivets or chips. */
function seamMarks(g, n, { seam, groove, inlay, light }) {
  seed = 41; g.lineCap = 'round';
  const arcs = []; for (let i = 0; i < 12; i++) arcs.push([rnd() * n, rnd() * n, 50 + rnd() * 110, rnd() * 6, 0.5 + rnd() * 1.6]);
  g.strokeStyle = seam; g.lineWidth = 1.8; for (const [x, y, r, a, l] of arcs) { g.beginPath(); g.arc(x, y, r, a, a + l); g.stroke(); }
  g.strokeStyle = light; g.lineWidth = 0.8; for (const [x, y, r, a, l] of arcs) { g.beginPath(); g.arc(x, y, r + 1.4, a + 0.03, a + l - 0.03); g.stroke(); }
  g.strokeStyle = groove; g.lineWidth = 3; for (let i = 0; i < 5; i++) { const [x, y, r, a, l] = arcs[i]; g.beginPath(); g.arc(x, y, r * 0.86, a + 0.1, a + l * 0.7); g.stroke(); } // engraved channels
  g.strokeStyle = inlay; g.lineWidth = 0.9; for (let i = 0; i < 5; i++) { const [x, y, r, a, l] = arcs[i]; g.beginPath(); g.arc(x, y, r * 0.86, a + 0.14, a + l * 0.66); g.stroke(); }   // light inlaid in the channel
  g.strokeStyle = seam; g.lineWidth = 1.4; for (let i = 0; i < 8; i++) { const x = rnd() * n, y = rnd() * n, a = (rnd() * 4 | 0) * Math.PI / 4 + 0.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (20 + rnd() * 60), y + Math.sin(a) * (20 + rnd() * 60)); g.stroke(); }
}
const pearl = canvasTex(256, (g, n) => {
  g.fillStyle = '#ecebe8'; g.fillRect(0, 0, n, n);
  seed = 7; for (let i = 0; i < 1800; i++) { const v = 225 + rnd() * 30; g.fillStyle = `rgba(${v},${v},${v - 4},0.25)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2); } // faint grain
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(190,180,215,${0.04 + rnd() * 0.06})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 20 + rnd() * 50, 10 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); } // pearly mottling
  seamMarks(g, n, { seam: 'rgba(45,38,60,0.8)', groove: 'rgba(70,62,90,0.5)', inlay: 'rgba(180,160,255,0.75)', light: 'rgba(255,255,255,0.55)' });
}, { repeat: 2 });
const pearlBump = canvasTex(256, (g, n) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  seamMarks(g, n, { seam: '#3c3c3c', groove: '#505050', inlay: '#6a6a6a', light: '#a8a8a8' });
}, { srgb: false, repeat: 2 });

// ---------------- materials ----------------
export function makeVaelMats(tc = NEUTRAL) {
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const ceramic = (color, extra = {}) => phys({ color, map: pearl, bumpMap: pearlBump, bumpScale: 1.1, metalness: 0.1, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.22, sheen: 0.15, sheenColor: 0xd8ccff, sheenRoughness: 0.6, ...extra });
  const team_ = tc.paint;
  // translucent additive shells around crystals and lights: the glow's falloff
  const halo = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  return {
    shell: ceramic(0xcbc2b1),                                                                   // pearl ceramic: reads 0xd8cfbf after the sheen
    shellLight: ceramic(0xdad2c2, { bumpScale: 0.8 }),                                          // top plates
    shellDark: ceramic(0xa39a8b, { roughness: 0.58, clearcoat: 0.3 }),                          // undersides, recesses
    shellDeep: ceramic(0x7e766c, { roughness: 0.7, clearcoat: 0.1 }),                           // crevices and channels
    ring: ceramic(0xd6cfc0, { roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12, metalness: 0.2 }),
    glass: phys({ color: 0x17121f, metalness: 0.5, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glassBlade: phys({ color: 0x221a30, metalness: 0.7, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glaze: team(phys({ color: team_, map: pearl, bumpMap: pearlBump, bumpScale: 0.4, metalness: 0.2, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, iridescence: 0.35, iridescenceIOR: 1.4 })),
    glazePlain: team(phys({ color: team_, metalness: 0.2, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12, iridescence: 0.3 })),
    gem: std({ color: 0x2a2254, emissive: 0x7260cc, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.15, flatShading: true }),
    gemCore: std({ color: 0x5a4aa0, emissive: 0xb8a8ff, emissiveIntensity: 0.95, roughness: 0.2 }),
    ether: std({ color: 0x4a3a8a, emissive: 0xa894f0, emissiveIntensity: 0.95, roughness: 0.25 }),
    etherSoft: std({ color: 0x3a2d6e, emissive: 0x9a84e8, emissiveIntensity: 0.7, roughness: 0.3 }),
    core: std({ color: 0xd8ccff, emissive: 0xe0d4ff, emissiveIntensity: 0.95 }),
    halo1: halo(0x8f78ee, 0.16), halo2: halo(0x7a62e0, 0.09), halo3: halo(0x6a52d0, 0.045),
    // the Halo's mending light: pearly white with a soft aqua falloff, apart from the violet of crystals and weapons
    mend: std({ color: 0x1e9a86, emissive: 0x34ccb4, emissiveIntensity: 0.55, roughness: 0.3 }),
    mendCore: std({ color: 0xc8fff6, emissive: 0xd8fff8, emissiveIntensity: 0.95 }),
    mendLine: std({ color: 0x4ab8a8, emissive: 0x74f0dc, emissiveIntensity: 1.4, roughness: 0.25 }),
    mendHalo1: halo(0x6ce8d0, 0.26), mendHalo2: halo(0x50d0b8, 0.13), mendHalo3: halo(0x40b8a0, 0.06),
    pad: std({ color: 0x241c3a, emissive: 0x6e5ac4, emissiveIntensity: 0.3, roughness: 0.55 }),
    padHalo: halo(0x7a62e0, 0.1),
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
/** A crystal with its glow: the faceted gem, a bright core and two translucent halos for the falloff. */
export function gem(parent, M, r, k, x = 0, y = 0, z = 0) {
  add(parent, crystal(r, k), M.gem, x, y, z);
  add(parent, crystal(r * 0.45, k * 1.05), M.gemCore, x, y, z);
  add(parent, crystal(r * 1.2, k * 1.04), M.halo1, x, y, z);
  add(parent, crystal(r * 1.45, k * 1.06), M.halo2, x, y, z);
  add(parent, crystal(r * 1.8, k * 1.08), M.halo3, x, y, z);
}
/** A small light with a soft halo. */
export function lamp(parent, M, r, x, y, z, mat = M.ether) {
  add(parent, sph(r, 10, 8), mat, x, y, z);
  add(parent, sph(r * 1.6, 10, 8), M.halo1, x, y, z);
  add(parent, sph(r * 2.3, 10, 8), M.halo2, x, y, z);
  add(parent, sph(r * 3.2, 10, 8), M.halo3, x, y, z);
}
/** A thin engraved channel with an inlaid light line (clean surface detail on big plates). */
function inlay(parent, M, w, d, x, y, z, ry = 0) {
  add(parent, rbox(w, 0.5, d + 0.8, 0.15), M.shellDeep, x, y, z, 0, ry, 0);
  add(parent, rbox(w * 0.9, 0.6, d * 0.35, 0.1), M.ether, x, y + 0.1, z, 0, ry, 0);
}
/** A helix round the y axis at x = cx: `turns` turns from radius r0 to r1 (geometric), y0 to y1, over t0..t1 of the
 *  whole; -z is north so the turns run clockwise seen from above. */
class Helix extends THREE.Curve {
  constructor(o) { super(); Object.assign(this, { cx: 0, a0: 0, t0: 0, t1: 1 }, o); }
  getPoint(t, v = new THREE.Vector3()) {
    const u = this.t0 + (this.t1 - this.t0) * t, a = this.a0 + u * this.turns * Math.PI * 2, r = this.r0 * (this.r1 / this.r0) ** u;
    return v.set(this.cx + Math.cos(a) * r, this.y0 + (this.y1 - this.y0) * u, -Math.sin(a) * r);
  }
}
/** A coiled shell: a tube along a helix whose radius tapers from tube0 to tube1 (geometrically, over the whole helix). */
export function coil(o, tube0, tube1, seg = 96, rad = 16) {
  return memo(`coil${JSON.stringify([o, tube0, tube1, seg, rad])}`, () => {
    const path = new Helix(o), g = new THREE.TubeGeometry(path, seg, 1, rad, false), p = g.attributes.position, P = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const t = path.getUtoTmapping(i / seg), u = path.t0 + (path.t1 - path.t0) * t, k = tube0 * (tube1 / tube0) ** u; path.getPoint(t, P); // (the tube samples the path by arc length)
      for (let j = 0; j <= rad; j++) { const n = i * (rad + 1) + j; p.setXYZ(n, P.x + (p.getX(n) - P.x) * k, P.y + (p.getY(n) - P.y) * k, P.z + (p.getZ(n) - P.z) * k); }
    }
    g.computeVertexNormals(); return boxUV(g);
  });
}
/** Three-lobed plinth outline (top view) of radius r. */
const tri = (r, k = 0.55) => { const p = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = r * (1 - k * 0.5 + k * 0.5 * Math.cos(3 * a)); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
/** A plinth: a darker base plate, a pearl step with a bevel, a glass ring and a soft pad. */
function plinth(g, M, r, { pad = r * 0.62, lobes = 0.4 } = {}) {
  add(g, plate(tri(r, lobes), 2.4, 0.8), M.shellDark, 0, 0, 0);
  add(g, plate(tri(r * 0.84, lobes), 2.2, 0.9), M.shell, 0, 2, 0);
  ring(g, r * 0.6, 0.8, M.glass, 4.3, { seg: 48 });
  add(g, cyl(pad, pad, 0.5, 40), M.pad, 0, 4.4, 0);
  add(g, cyl(pad * 1.25, pad * 1.25, 0.3, 40), M.padHalo, 0, 4.6, 0);
}

// ---------------- units ----------------

/** Lumen (worker): a floating pearl droplet, a lighter back plate, black-glass belly, a lavender eye and lift core. */
export function lumen(M, f) {
  const g = grp(), b = grp(); b.position.y = 7 + (f % 2) * 0.8;
  add(b, sph(5, 20, 14), M.shell, 0, 0, 0).scale.set(1.25, 0.95, 1);
  add(b, sph(5, 20, 14), M.shellLight, -0.4, 0.8, 0).scale.set(0.95, 0.7, 0.86);          // back plate
  add(b, cone(4.2, 9, 14), M.shell, -8.5, 0.4, 0, 0, 0, Math.PI / 2);                     // tail, apex at -x
  add(b, sph(4.6, 18, 12), M.glass, 0.4, -1.4, 0).scale.set(1.2, 0.7, 0.95);              // belly
  add(b, torus(4.95, 0.3, Math.PI * 2, 24), M.shellDeep, -1.4, 0, 0, 0, Math.PI / 2, 0);  // seam between the halves
  add(b, rbox(1.4, 1.8, 4, 0.5), M.gemCore, 5.6, 0.4, 0);                                  // eye slit
  add(b, rbox(1.4, 1.9, 4.6, 0.5), M.halo1, 5.7, 0.4, 0);
  lamp(b, M, 1.2, 0.8, -3.6, 0);                                                           // lift core under the belly
  add(b, rbox(8.5, 4.6, 1.2, 0.5), M.glaze, -3, 5, 0).rotation.z = 0.35;                   // fin
  add(b, rbox(5, 0.5, 0.6, 0.15), M.ether, -2.6, 6, 0).rotation.z = 0.35;                  // inlaid line on the fin
  for (const side of [-1, 1]) {
    add(b, rbox(3.4, 0.9, 3.2, 0.3), M.glaze, -1, 1.6, side * 4.8, 0, 0, side * 0.3);     // side vanes
    const a = (f % 2) * 0.8 + side * Math.PI / 2 + 0.6;
    add(b, sph(1.1, 10, 8), M.ring, Math.cos(a) * 8, 1.5 + side * 0.8, Math.sin(a) * 8);  // orbiting pebbles
  }
  g.add(b); return g;
}

/** Scythe (melee): a tall hovering knight; a tapering skirt, layered chest plates, two black-glass crescent blades. */
export function scythe(M, f) {
  const g = grp(), b = grp(); b.position.y = (f % 2) * 0.7;
  add(b, cone(4.2, 10, 16), M.shellDark, 0, 7.5, 0, Math.PI);                              // skirt, apex down at y 2.5
  add(b, cone(3.6, 6, 16), M.shell, 0, 9.6, 0, Math.PI);                                   // outer skirt plate
  lamp(b, M, 0.9, 0, 2.6, 0);                                                              // lift light at the apex
  add(b, torus(3.8, 0.7, Math.PI * 2, 28), M.glass, 0, 12.4, 0, Math.PI / 2);              // waist ring
  add(b, rbox(5, 8.5, 6, 1.6), M.shellDark, 0, 16.5, 0);                                   // torso core
  add(b, rbox(4.2, 5.2, 6.6, 1), M.shellLight, 0.6, 18.6, 0);                              // breastplate
  add(b, rbox(5.4, 3, 6.4, 0.8), M.shell, 0, 13.9, 0);                                     // lower plate
  add(b, rbox(1.4, 6, 4.4, 0.6), M.glaze, 2.9, 17, 0);                                     // chest glaze
  add(b, rbox(0.8, 3.2, 0.8, 0.3), M.gemCore, 3.7, 17, 0);                                 // chest light
  add(b, rbox(1, 3.6, 1.2, 0.3), M.halo1, 3.8, 17, 0);
  for (const side of [-1, 1]) {
    add(b, sph(2.7, 14, 10), M.ring, -0.4, 21, side * 4.2);                                // shoulders
    add(b, rbox(3.8, 1.3, 4.4, 0.6), M.glaze, -0.6, 23.3, side * 4.4, side * 0.5, 0, 0);   // pauldron glaze
    add(b, rbox(2.6, 0.5, 0.6, 0.15), M.ether, -0.6, 23.9, side * 4.4, side * 0.5, 0, 0);  // inlaid line
    const arm = grp(); arm.position.set(0.5, 20, side * 4.6); arm.rotation.y = side * ((f % 2) ? -0.25 : 0.1);
    limb(arm, [0, 0, 0], [5, -4, side * 1.5], 1.2, M.shell);
    add(arm, sph(1.4, 10, 8), M.ring, 5, -4, side * 1.5);                                  // wrist joint
    const bl = grp(); bl.position.set(5, -4, side * 1.5);
    const pts = [[0, 0], [4.5, side * -1.3], [9, side * -0.9], [12.5, side * 1.8], [10, side * 4], [5.5, side * 2.7], [1.5, side * 2.3]];
    add(bl, plate(pts, 1.1, 0.3), M.glassBlade, 0, -0.5, 0);
    add(bl, plate(pts.map(([x, z]) => [x * 0.7 + 2, z * 0.5 + side * -0.8]), 1.5, 0.2), M.ether, 0, -0.6, 0); // light channel
    add(bl, plate(pts.map(([x, z]) => [x * 0.75 + 1.8, z * 0.6 + side * -0.8]), 1.9, 0.2), M.halo1, 0, -0.7, 0);
    arm.add(bl); b.add(arm);
  }
  add(b, sph(1.9, 14, 10), M.shellLight, 0.8, 25.2, 0).scale.set(1.35, 1, 0.9);            // head
  add(b, rbox(1, 0.7, 2.8, 0.3), M.gemCore, 3, 25.2, 0);                                   // visor slit
  add(b, rbox(0.7, 4.5, 1.3, 0.3), M.glaze, -0.8, 27.6, 0, 0, 0, 0.5);                     // crest
  g.add(b); return g;
}

/** Prism (ranged, ground and air): a pearl ring with team arcs carrying a floating violet crystal in a glass cradle. */
export function prism(M, f) {
  const g = grp(), b = grp(); b.position.y = 11 + (f % 2) * 0.8;
  ring(b, 10, 1.7, M.ring, 0, { seg: 44 });
  ring(b, 10, 1.1, M.shellDark, -1.1, { seg: 44 });                                         // darker underside
  ring(b, 10, 0.35, M.shellDeep, 1.55, { seg: 44 });                                        // top seam
  for (let k = 0; k < 3; k++) ring(b, 10, 1.9, M.glaze, 0.1, { arc: Math.PI / 3, a0: k / 3 * Math.PI * 2 + 0.3 + (f % 2) * 0.15 });
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 6; add(b, rbox(3, 4.5, 1.2, 0.4), M.shell, Math.cos(a) * 9.5, -3.2, Math.sin(a) * 9.5, 0, -a, 0); add(b, rbox(2.2, 2.6, 1.6, 0.3), M.shellLight, Math.cos(a) * 9.7, -2.6, Math.sin(a) * 9.7, 0, -a, 0); } // fins, plated
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.9; limb(b, [Math.cos(a) * 9, 0.6, Math.sin(a) * 9], [Math.cos(a) * 2.6, 3.2, Math.sin(a) * 2.6], 0.5, M.glass); } // cradle arms
  const c = grp(); c.position.set(0.5, 3.2, 0); c.rotation.set(0, (f % 2) * 0.5 + 0.4, -0.12);
  gem(c, M, 4.2, 1.9);
  add(c, crystal(4.5, 0.22), M.glaze);                                                     // team belt through the crystal
  b.add(c);
  lamp(b, M, 0.8, 0.5, 13.2, 0, M.core);                                                   // tip light
  add(b, rbox(3.2, 1.2, 3.4, 0.4), M.shell, 9.2, 1.2, 0);                                  // emitter housing on the bow
  lamp(b, M, 1.4, 11.4, 0.6, 0);
  g.add(b); return g;
}

/** Monolith (siege): a leaning pearl slab with a lit fissure over a black-glass disc; three shards orbit it. */
export function monolith(M, f) {
  const g = grp(), b = grp(); b.position.y = (f % 2) * 0.6;
  add(b, cyl(14, 16.5, 3.5, 28), M.glass, 0, 5.5, 0);                                      // disc (hovering)
  ring(b, 16, 1.4, M.ring, 7);
  ring(b, 12, 0.5, M.ether, 7.4, { seg: 40 });                                             // inlaid light ring on the disc
  ring(b, 12, 0.9, M.halo1, 7.4, { seg: 40 });
  add(b, cyl(6, 9, 3, 20), M.shellDark, 0, 8.5, 0);
  const slab = grp(); slab.position.set(0, 9.5, 0); slab.rotation.z = -0.2;
  add(slab, rbox(13, 27, 10, 1.6), M.shell, 0, 13.5, 0);
  for (const side of [-1, 1]) add(slab, rbox(10.5, 19, 1.4, 0.5), M.shellLight, -0.4, 13, side * 5.5);   // side plates
  add(slab, rbox(13.4, 0.5, 10.4, 0.15), M.shellDeep, 0, 23, 0);                            // seam under the band
  add(slab, rbox(3, 22, 7.6, 0.6), M.shellDark, 6.1, 13, 0);                                // recessed front channel
  add(slab, rbox(1, 19, 1.2, 0.3), M.ether, 7.1, 13, 0);                                    // the fissure
  add(slab, rbox(1.4, 20, 2.4, 0.3), M.halo1, 7.2, 13, 0);
  add(slab, rbox(1.8, 21, 4, 0.3), M.halo2, 7.3, 13, 0);
  add(slab, rbox(13.6, 3.4, 10.6, 0.6), M.glaze, 0, 21.5, 0);                               // team band
  add(slab, rbox(9, 2.4, 7, 0.8), M.glass, 0.6, 28, 0);                                     // cap
  lamp(slab, M, 1.2, 7, 25, 0, M.core);                                                     // muzzle light
  b.add(slab);
  for (const side of [-1, 1]) { add(b, rbox(5, 13, 2.4, 0.6), M.shellDark, -4, 16, side * 8, 0, side * 0.45, 0); add(b, rbox(3.6, 10, 1.2, 0.4), M.shell, -4, 16.5, side * 8.9, 0, side * 0.45, 0); } // side wings, plated
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + (f % 2) * 0.35 + 0.5, r = 17.5;
    const s = grp(); s.position.set(Math.cos(a) * r, 14 + Math.sin(a * 2) * 2, Math.sin(a) * r); s.rotation.z = 0.2;
    gem(s, M, 2.2, 1.8);
    b.add(s);
  }
  g.add(b); return g;
}

/** Shrike (flyer): a swept crescent wing of layered pearl plates, black glass beneath, team wingtips, a lit trailing edge. */
export function shrike(M, f) {
  const g = grp(), b = grp(); b.position.y = 20;
  const flex = (f % 2) ? 0.1 : -0.08;
  for (const side of [-1, 1]) {
    const w = grp(); w.rotation.x = -side * flex;
    const pts = [[12, 0], [7, side * 6], [0, side * 12], [-9, side * 19], [-11, side * 17], [-5, side * 9], [-1, side * 3], [-1, 0]];
    add(w, plate(pts, 2.6, 0.7), M.shell, 0, 0, 0);
    add(w, plate(pts.map(([x, z]) => [x * 0.92 - 0.3, z * 0.92]), 1.6, 0.4), M.glass, 0, -1.2, 0);
    add(w, plate([[8.5, side * 1], [4, side * 5.5], [-3, side * 11], [-6.5, side * 9.5], [-2.5, side * 3.5], [2, side * 0.5]], 1, 0.35), M.shellLight, 0, 2.6, 0); // root plate
    add(w, rbox(9, 0.4, 0.9, 0.1), M.shellDeep, -3.5, 2.75, side * 11.5, 0, -side * 0.75, 0); // seam between plates
    add(w, rbox(5, 1.3, 4, 0.4), M.glaze, -7.5, 2.4, side * 14.5, 0, -side * 0.75, 0);      // wingtip glaze
    add(w, rbox(3.2, 0.5, 0.6, 0.15), M.ether, -7.5, 3.1, side * 14.5, 0, -side * 0.75, 0); // inlaid line on the tip
    add(w, rbox(11, 0.6, 1, 0.3), M.ether, -5, 1.1, side * 10, 0, -side * 0.75, 0);         // trailing-edge light
    add(w, rbox(11.5, 1, 2, 0.4), M.halo1, -5, 1.1, side * 10, 0, -side * 0.75, 0);
    b.add(w);
  }
  add(b, sph(3.4, 16, 12), M.shell, 3, 1.6, 0).scale.set(1.7, 0.85, 1);                    // pod
  add(b, sph(3.1, 16, 12), M.shellLight, 2.4, 2.5, 0).scale.set(1.35, 0.6, 0.8);           // pod top plate
  add(b, sph(1.6, 12, 9), M.glass, 7.6, 1.6, 0).scale.set(1.2, 0.8, 0.9);                  // canopy
  lamp(b, M, 0.7, 8.8, 1.7, 0);
  add(b, rbox(7, 1, 2, 0.4), M.glaze, -1, 4.2, 0);                                          // dorsal glaze
  add(b, rbox(5, 0.5, 0.5, 0.15), M.ether, -1, 4.8, 0);
  lamp(b, M, 1.1, -6.4, 0.6, 0);                                                            // drive light at the tail
  g.add(b); return g;
}

/** Halo (support): a pearl lotus open round a pale aqua mending light, a thin black-glass halo tilted above it. Team
 *  glaze on the outer petals' tips and a band round the calyx. A solid cup with a white-aqua heart, unlike the
 *  Prism's open ring round a violet crystal. Kept low and wide so the portrait (cut round the ground point) frames it. */
export function halo(M, f) {
  const g = grp(), b = grp(); b.position.y = 13 + (f % 2) * 0.8;
  // the calyx: a shallow pearl bowl, darker beneath, a team band round its rim, over its lift light
  add(b, lathe([[0, -3], [2.6, -2.7], [4.2, -1.4], [4.8, 0.2], [4.4, 1]], 24), M.shellDark, 0, 0, 0);
  ring(b, 4.6, 0.55, M.glazePlain, 0.3, { seg: 32 });                                      // team band
  add(b, cyl(4.1, 4.5, 0.7, 24), M.shell, 0, 1, 0);                                        // rim
  add(b, cyl(3.3, 3.3, 0.4, 24), M.glass, 0, 1.4, 0);                                      // black-glass cup
  lamp(b, M, 0.9, 0, -3.6, 0);
  // petals in two tiers of three: the outer ones broad, open wide and tipped with team glaze; the inner ones
  // lighter and steeper, cupping the light
  const leaf = (l, w) => [[0, 0], [l * 0.22, -w * 0.4], [l * 0.55, -w * 0.5], [l * 0.85, -w * 0.3], [l, 0], [l * 0.85, w * 0.3], [l * 0.55, w * 0.5], [l * 0.22, w * 0.4]];
  for (let k = 0; k < 6; k++) {
    const outer = k % 2 === 0, a = k / 6 * Math.PI * 2 + Math.PI / 2, r0 = outer ? 4.2 : 3;
    const p = grp(); p.position.set(Math.cos(a) * r0, outer ? 0.6 : 1.3, Math.sin(a) * r0);
    p.rotation.set(0, -a, 0); p.rotateZ(outer ? 0.5 : 0.7);                                 // lean out from the rim
    add(p, plate(leaf(outer ? 6.5 : 4.4, outer ? 4.2 : 2.8), 0.8, 0.25), outer ? M.shell : M.shellLight, 0, -0.4, 0);
    if (outer) {
      add(p, plate(leaf(3, 2.6).map(([x, z]) => [x + 3.5, z]), 0.5, 0.15), M.glaze, 0, 0.3, 0);    // team tip
      add(p, rbox(2.6, 0.4, 0.5, 0.12), M.mendLine, 1.9, 0.45, 0);                          // inlaid light line
    }
    b.add(p);
  }
  // the mending light at the heart, and its soft falloff over the petals
  add(b, sph(2.8, 16, 12), M.mend, 0, 2.8, 0); add(b, sph(1.1, 10, 8), M.mendCore, 0, 3.2, 0);
  add(b, sph(3.8, 14, 10), M.mendHalo1, 0, 2.8, 0); add(b, sph(5.4, 14, 10), M.mendHalo2, 0, 2.8, 0); add(b, sph(7.4, 14, 10), M.mendHalo3, 0, 2.8, 0);
  // the halo: a thin black-glass ring with a light inlaid, hung over the heart and tilted, so it reads as a halo
  // from every facing (never the Prism's flat ring), nodding a little between frames
  const tilt = 0.5 + ((f % 2) ? 0.07 : -0.07);
  ring(b, 4.6, 0.34, M.glass, 5.8, { seg: 40, tilt });
  ring(b, 4.6, 0.2, M.mendLine, 5.95, { seg: 40, tilt });
  ring(b, 4.6, 0.6, M.mendHalo1, 5.95, { seg: 40, tilt });
  g.add(b); return g;
}

/** Sovereign: the Vael capital barge. A broad pearl hull gliding low over the ground, a coiled ceramic shell (a
 *  tapering tube wound round a stern axis) climbing to a crystal apex, and at its bow a great violet lens in a
 *  black-glass cradle, from which the beam fires (the sim starts the bolt at the unit's centre; the lens is the visual
 *  muzzle). Team glaze as a ridge spiralling along the shell, on the vane tips and the brow, and as arcs on the lift
 *  ring. Four frames: a slow bob, and the lift ring's arcs and lamps turn a third of a turn over the cycle. No legs: it
 *  hovers lower than the Halo, its shadow right beneath it, so it reads as a heavy ground unit, never a flyer. */
export function sovereign(M, f) {
  const g = grp(), b = grp();
  const F = 4, ph = f / F * Math.PI * 2, bob = 0.6 + 0.6 * Math.sin(ph); b.position.y = 7 + bob;
  // the hull: a teardrop barge, wide at the stern, drawn to a prow at +x; a lighter deck plate, a darker underside
  const hull = [[22, 0], [19, -6], [12, -12], [0, -16.5], [-12, -15.5], [-20, -10], [-23, 0], [-20, 10], [-12, 15.5], [0, 16.5], [12, 12], [19, 6]];
  add(b, plate(hull, 5.5, 1.6), M.shell, 0, 0, 0);
  add(b, plate(hull.map(([x, z]) => [x * 0.88 - 1, z * 0.84]), 2.2, 0.8), M.shellDark, 0, -1.8, 0);        // underside
  add(b, plate(hull.map(([x, z]) => [x * 0.9 - 1.2, z * 0.86]), 1.2, 0.5), M.shellLight, 0, 5.3, 0);       // deck plate
  add(b, lathe([[0, -5], [7, -4.2], [11, -1.5], [12, 0]], 24), M.glass, -5, 0, 0);                         // black-glass keel
  // the lift ring under the rim: a glass ring with three team arcs and three lamps that turn with the frames
  ring(b, 17.5, 1.3, M.glass, -1.2, { seg: 56 });
  for (let k = 0; k < 3; k++) {
    const a0 = k / 3 * Math.PI * 2 + ph / 3 + 0.4;
    ring(b, 17.5, 1.6, M.glazePlain, -1.1, { arc: Math.PI / 4, a0, seg: 56 });
    const a = a0 + Math.PI / 8; lamp(b, M, 1.1, Math.cos(a) * 15, -3.2, -Math.sin(a) * 15);
  }
  // the shell: a tapering tube coiled round a stern axis, the body whorl low and fat with its mouth at the bow, the
  // spire sinking into it as it climbs to the apex crystal; a team ridge along the whorls' shoulder and a lit seam in
  // the crevice between them
  const H = { cx: -6, turns: 1.9, r0: 10.5, r1: 1.3, y0: 13, y1: 23.5 }, T0 = 8.5, T1 = 1.4;
  add(b, coil(H, T0, T1), M.shell, 0, 0, 0);
  add(b, sph(T0 * 0.98, 16, 12), M.shell, H.cx + H.r0, H.y0, 0);                                            // the mouth, closed
  add(b, rbox(3, 2.4, 13, 0.6), M.glass, -21.2, 2.8, 0); add(b, rbox(1.2, 0.8, 10, 0.3), M.ether, -22.6, 2.8, 0); add(b, rbox(1.6, 1.6, 11, 0.4), M.halo1, -22.7, 2.8, 0); // the stern drive slot
  add(b, coil({ ...H, r0: H.r0 + T0 * 0.5, r1: H.r1 + T1 * 0.5, y0: H.y0 + T0 * 0.62, y1: H.y1 + T1 * 0.62, t0: 0.04, t1: 0.93 }, T0 * 0.34, T1 * 0.34, 96, 10), M.glaze, 0, 0, 0); // team ridge
  add(b, coil({ ...H, r0: H.r0 - T0 * 0.55, r1: H.r1 - T1 * 0.55, y0: H.y0 + T0 * 0.75, y1: H.y1 + T1 * 0.75, t0: 0.08, t1: 0.9 }, 0.5, 0.25, 96, 8), M.ether, 0, 0, 0);          // lit seam
  add(b, coil({ ...H, r0: H.r0 - T0 * 0.55, r1: H.r1 - T1 * 0.55, y0: H.y0 + T0 * 0.75, y1: H.y1 + T1 * 0.75, t0: 0.08, t1: 0.9 }, 1, 0.5, 96, 8), M.halo1, 0, 0, 0);
  gem(b, M, 2.4, 2.2, H.cx + Math.cos(H.turns * Math.PI * 2) * H.r1, H.y1 + 2.6, -Math.sin(H.turns * Math.PI * 2) * H.r1); // the apex crystal
  // the bow: the body's neck flowing from the shell's aperture onto the prow, a team brow, and the lens in its cradle
  add(b, sph(5.5, 18, 12), M.shellLight, 10, 6.4, 0).scale.set(1.5, 0.55, 1.1);
  add(b, rbox(5, 1.2, 7, 0.4), M.glaze, 12, 9.2, 0);                                                        // brow
  add(b, rbox(3.6, 0.5, 0.6, 0.15), M.ether, 12, 9.9, 0);
  const lens = grp(); lens.position.set(19, 7.2, 0); lens.rotation.z = -Math.PI / 2;                       // crystal along +x
  gem(lens, M, 4, 2.2);
  add(lens, crystal(3.9, 0.3), M.glass);                                                                   // glass belt
  b.add(lens);
  add(b, torus(4.5, 0.6, Math.PI * 2, 28), M.glass, 17, 7.2, 0, 0, Math.PI / 2, 0);                        // the cradle's ring
  for (const side of [-1, 1]) limb(b, [14, 6.2, side * 5.5], [17, 7.2, side * 3.6], 0.55, M.glass);
  lamp(b, M, 1.6, 26, 7.2, 0, M.core);                                                                   // the muzzle
  // eye vanes flanking the lens, and the side vanes: swept pearl fins with team tips and a lit edge
  for (const side of [-1, 1]) {
    add(b, plate([[6, side * 7], [16, side * 8.5], [19, side * 6], [12, side * 5], [6, side * 5]], 1.2, 0.3), M.glass, 0, 6.6, 0);
    const v = grp(); v.position.set(-6, 5.2, side * 15.5); v.rotation.x = side * 0.22;
    const pts = [[8, 0], [2, side * 6], [-8, side * 9], [-14, side * 7.5], [-10, side * 3], [-6, 0]];
    add(v, plate(pts, 1.8, 0.5), M.shell, 0, 0, 0);
    add(v, plate([[-6, side * 6.5], [-9, side * 8.4], [-13, side * 7.3], [-10, side * 4.5]], 1.2, 0.3), M.glaze, 0, 1.2, 0); // team tip
    add(v, rbox(10, 0.5, 0.6, 0.15), M.ether, -4, 1.9, side * 5.2, 0, -side * 0.5, 0);                     // lit edge
    b.add(v);
  }
  g.add(b); return g;
}

export const VAEL_UNITS = {
  lumen: { build: lumen, frames: 2, r: 14, h: 20 },
  scythe: { build: scythe, frames: 2, r: 20, h: 30 },
  prism: { build: prism, frames: 2, r: 15, h: 29 },
  monolith: { build: monolith, frames: 2, r: 22, h: 40 },
  shrike: { build: shrike, frames: 2, r: 22, h: 26 },
  halo: { build: halo, frames: 2, r: 10, h: 28 }, // (h: headroom, so the portrait, cut round the ground point, keeps the ring)
  sovereign: { build: sovereign, frames: 4, r: 28, h: 38 },
};

// ---------------- buildings ----------------

/** Conflux (core, 4x4): a tiered pearl dish, a black-glass moat, three plated petals (N / ESE / WSW) leaning over
 *  a violet crystal, a floating ring with team arcs, inlaid light lines across the dish. */
export function conflux(M) {
  const g = grp();
  add(g, plate(tri(64, 0.25), 4, 1.5), M.shellDark, 0, 0, 0);
  add(g, plate(tri(58, 0.25), 3, 1.4), M.shell, 0, 3.5, 0);
  add(g, cyl(44, 50, 6, 48), M.shell, 0, 9, 0);
  add(g, cyl(42, 44, 1.2, 48), M.shellLight, 0, 12.4, 0);
  ring(g, 40, 1.6, M.glass, 12.6, { seg: 64 });
  add(g, cyl(10, 26, 0.6, 48), M.pad, 0, 12.5, 0);
  add(g, cyl(10, 30, 0.3, 48), M.padHalo, 0, 12.8, 0);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; inlay(g, M, 10, 1.4, Math.cos(a) * 52, 6.6, Math.sin(a) * 52, -a); } // inlaid lines on the dish
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, p = grp(); p.position.set(Math.cos(a) * 40, 11.5, Math.sin(a) * 40); p.rotation.y = -a;
    const lean = grp(); lean.rotation.z = 0.22; p.add(lean);
    add(lean, rbox(6.5, 34, 20, 2.2), M.shell, 0, 17, 0);
    add(lean, rbox(3.5, 27, 15, 1.2), M.shellLight, 2.6, 16, 0);                                 // outer plate
    add(lean, rbox(3.9, 0.5, 15.4, 0.15), M.shellDeep, 2.6, 16, 0);                               // seam
    add(lean, rbox(1.2, 24, 14, 1), M.glaze, -3.4, 17, 0);                                       // inner face glaze
    add(lean, rbox(1, 18, 0.8, 0.3), M.ether, -4.1, 18, 0);                                      // light seam
    add(lean, rbox(1.2, 19, 1.8, 0.3), M.halo1, -4.2, 18, 0);
    add(lean, rbox(5.5, 3, 21, 0.8), M.glaze, 0.3, 34.5, 0);                                     // petal cap
    add(lean, rbox(5.9, 0.6, 21.4, 0.2), M.ring, 0.3, 36.3, 0);
    g.add(p);
  }
  const c = grp(); c.position.y = 40; c.rotation.y = 0.4;
  gem(c, M, 8.2, 2.3); add(c, crystal(8.7, 0.25), M.glaze);
  g.add(c);
  add(g, cyl(5, 8, 6, 12), M.glass, 0, 15, 0);                                                   // crystal socket
  lamp(g, M, 1.8, 0, 63, 0, M.core);
  ring(g, 31, 2.2, M.ring, 46, { seg: 72 });
  ring(g, 31, 1.2, M.shellDark, 44.6, { seg: 72 });
  for (let k = 0; k < 3; k++) ring(g, 31, 2.5, M.glaze, 46.1, { arc: Math.PI / 4, a0: k / 3 * Math.PI * 2 - 0.4, seg: 72 });
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; lamp(g, M, 1.3, Math.cos(a) * 56, 6.2, Math.sin(a) * 56); }
  add(g, rbox(24, 4, 5, 1), M.glass, 0, 7.5, 50);                                                // south gate
  add(g, rbox(20, 1, 1.2, 0.3), M.ether, 0, 9.8, 52); add(g, rbox(21, 1.6, 2.4, 0.3), M.halo1, 0, 9.8, 52);
  return g;
}

/** Spire (supply + power, 2x2): a tall pearl needle, a black-glass waist, a floating team ring, a lit tip. */
export function spire(M) {
  const g = grp();
  plinth(g, M, 28, { pad: 18, lobes: 0.5 });
  add(g, lathe([[0.1, 0], [9, 0], [8.5, 6], [6, 22], [3.8, 36], [4.6, 42], [2.4, 56], [0.8, 70], [0, 72]], 20), M.shell, 0, 4, 0);
  add(g, lathe([[0.1, 0], [7.2, 0], [6.4, 6], [4.6, 15], [0.1, 15.5]], 20), M.shellLight, 0, 10, 0);        // upper plate over the base
  for (const [y, r] of [[9.8, 7.3], [24, 5.5]]) ring(g, r, 0.35, M.shellDeep, y, { seg: 24 });               // seams
  add(g, cyl(4.2, 6.2, 12, 20), M.glass, 0, 34, 0);                                                          // waist
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; add(g, rbox(0.7, 16, 0.7, 0.3), M.ether, Math.cos(a) * 7.4, 16, Math.sin(a) * 7.4, 0, -a, 0); add(g, rbox(1.1, 16.5, 1.4, 0.3), M.halo1, Math.cos(a) * 7.5, 16, Math.sin(a) * 7.5, 0, -a, 0); }
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 3, p = grp(); p.position.set(Math.cos(a) * 15, 4, Math.sin(a) * 15); p.rotation.y = -a; p.rotation.z = 0.5; add(p, rbox(3, 16, 7, 0.8), M.shellDark, 0, 7, 0); add(p, rbox(2, 12, 5.4, 0.6), M.shell, 0.8, 7.5, 0); add(p, rbox(1.2, 10, 4, 0.5), M.glaze, 1.9, 8, 0); g.add(p); }
  ring(g, 11, 1.6, M.glaze, 46, { seg: 44 });
  ring(g, 11, 0.8, M.shellDark, 44.8, { seg: 44 });
  ring(g, 13.5, 0.7, M.ring, 58, { seg: 44, tilt: 0.25 });
  gem(g, M, 2.4, 1.6, 0, 77, 0);
  return g;
}

/** Siphon (on a vent, 2x2): three plated pearl petals cupping the vent, a glass collar, the ether column rising through. */
export function siphon(M) {
  const g = grp();
  ring(g, 26, 3, M.shell, 2.5, { seg: 48 });
  ring(g, 26, 0.4, M.shellDeep, 5.4, { seg: 48 });
  ring(g, 18, 2, M.glass, 5.5, { seg: 48 });
  add(g, cyl(5, 7, 36, 18), M.etherSoft, 0, 22, 0);                                                 // ether column
  add(g, cyl(6.5, 8.5, 36, 18), M.halo2, 0, 22, 0);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, p = grp(); p.position.set(Math.cos(a) * 21, 4, Math.sin(a) * 21); p.rotation.y = -a;
    const lean = grp(); lean.rotation.z = 0.55; p.add(lean);
    add(lean, rbox(5, 30, 13, 1.8), M.shell, 0, 15, 0);
    add(lean, rbox(2.6, 23, 9.5, 1), M.shellLight, 2, 14, 0);
    add(lean, rbox(1.2, 20, 8, 1), M.glaze, -2.6, 15, 0);
    add(lean, rbox(1, 14, 0.7, 0.2), M.ether, -3.2, 15, 0);
    lamp(lean, M, 1.3, 0, 30.5, 0);
    g.add(p);
  }
  ring(g, 11, 1.4, M.ring, 42, { seg: 40 });
  gem(g, M, 2.8, 1.4, 0, 44, 0);
  add(g, rbox(10, 8, 10, 1.6), M.shell, 24, 5, -22); add(g, rbox(8.5, 1.4, 8.5, 0.5), M.shellLight, 24, 9.4, -22); add(g, rbox(10.6, 1.2, 10.6, 0.3), M.glaze, 24, 8.4, -22); // condenser
  return g;
}

/** Kiln (production, 3x3): a low pearl dome of two plates with a glass band and team hoop, an obsidian warp
 *  mouth to the south over a lit pad, two horns, a crest. */
export function kiln(M) {
  const g = grp();
  add(g, plate(tri(50, 0.18), 3, 1.2), M.shellDark, 0, 0, 0);
  add(g, plate(tri(45, 0.18), 2.6, 1.2), M.shell, 0, 2.6, 0);
  add(g, sph(30, 40, 24), M.shell, 0, 6, -6).scale.set(1.15, 0.56, 0.85);
  add(g, sph(26.5, 40, 24), M.shellLight, 0, 9.8, -6).scale.set(1.06, 0.5, 0.78);                 // upper plate
  add(g, cyl(30.5, 30.5, 4, 48), M.glass, 0, 8, -6).scale.set(1.15, 1, 0.85);
  const hoop = (r, t, mat, y) => { const m = add(g, torus(r, t, Math.PI * 2, 56), mat, 0, y, -6); m.rotation.x = Math.PI / 2; m.scale.set(1.15, 0.85, 1); };
  hoop(26, 1.7, M.glaze, 14); hoop(20.5, 0.35, M.shellDeep, 18.2); hoop(22.5, 0.6, M.ether, 16.6); hoop(22.5, 1.1, M.halo1, 16.6);
  add(g, rbox(26, 13, 8, 1.8), M.glass, 0, 11, 20);                                                 // warp mouth
  add(g, rbox(28, 14.5, 2, 0.8), M.shell, 0, 11, 17);                                               // mouth frame
  add(g, rbox(22, 1.2, 1, 0.4), M.ether, 0, 11.5, 24.4); add(g, rbox(1.2, 10, 1, 0.4), M.ether, 0, 11.5, 24.4);
  add(g, rbox(23, 2, 2, 0.4), M.halo1, 0, 11.5, 24.6); add(g, rbox(2, 11, 2, 0.4), M.halo1, 0, 11.5, 24.6);
  add(g, cyl(13, 13, 0.6, 36), M.pad, 0, 4.4, 36);                                                 // the pad units arrive on
  add(g, cyl(16, 16, 0.3, 36), M.padHalo, 0, 4.7, 36);
  ring(g, 13.5, 0.8, M.ring, 4.7, { seg: 36 }).position.z = 36;
  for (const side of [-1, 1]) {
    add(g, cyl(1.4, 4.2, 28, 12), M.shell, side * 15, 26, -22, -0.35, 0, side * 0.3);               // horns
    add(g, cyl(0.9, 3.2, 18, 12), M.shellLight, side * 16.6, 32, -24, -0.35, 0, side * 0.3);
    lamp(g, M, 1.4, side * 19, 38.5, -27);
  }
  add(g, rbox(14, 2.4, 5, 0.6), M.glaze, -4, 23.2, -6);                                             // crest
  add(g, rbox(9, 0.5, 0.6, 0.15), M.ether, -4, 24.6, -6);
  gem(g, M, 2, 1.4, 4, 24.4, -6);
  for (const side of [-1, 1]) lamp(g, M, 1, side * 20, 6.2, 38);
  return g;
}

/** Ward (defence, 2x2): three plated pearl claws holding a floating violet crystal over a plinth. */
export function ward(M) {
  const g = grp();
  plinth(g, M, 30, { pad: 17, lobes: 0.45 });
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 - Math.PI / 2, x = Math.cos(a), z = Math.sin(a);
    limb(g, [x * 17, 3, z * 17], [x * 7, 30, z * 7], 2.3, M.shell);
    limb(g, [x * 16.5, 6, z * 16.5], [x * 8.5, 25, z * 8.5], 1.5, M.shellLight);                   // outer plate
    add(g, rbox(6, 4, 6, 1), M.shellDark, x * 17, 4.5, z * 17, 0, -a, 0);                            // claw root
    add(g, rbox(3.6, 4, 3.6, 0.6), M.glaze, x * 11.5, 17, z * 11.5, 0, -a, 0);
    add(g, rbox(2.6, 0.5, 0.6, 0.15), M.ether, x * 11.8, 19.2, z * 11.8, 0, -a, 0);
    add(g, sph(1.8, 10, 8), M.ring, x * 7, 30, z * 7);
  }
  const c = grp(); c.position.y = 36; c.rotation.y = 0.5;
  gem(c, M, 5.4, 1.7); add(c, crystal(5.8, 0.3), M.glaze);
  g.add(c);
  return g;
}

/** Loom (tech, 2x2): a black-glass drum under a ring of pearl needles with threads of light between them. */
export function loom(M) {
  const g = grp();
  plinth(g, M, 30, { pad: 14, lobes: 0.3 });
  add(g, cyl(20, 23, 10, 36), M.glass, 0, 9, 0);
  ring(g, 21.5, 1.5, M.glaze, 13, { seg: 48 });
  add(g, cyl(14, 20, 4, 36), M.shell, 0, 16, 0);
  add(g, cyl(11, 14, 2, 36), M.shellLight, 0, 19, 0);
  ring(g, 14.2, 0.3, M.shellDeep, 18.2, { seg: 36 });
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, x = Math.cos(a) * 15, z = Math.sin(a) * 15;
    add(g, cone(2.4, 22, 10), M.shell, x, 29, z);
    add(g, cone(1.6, 14, 10), M.shellLight, x + Math.cos(a) * 0.6, 32, z + Math.sin(a) * 0.6);
    const nx = Math.cos(a + Math.PI / 3 * 2) * 15, nz = Math.sin(a + Math.PI / 3 * 2) * 15;
    limb(g, [x, 35, z], [nx, 35, nz], 0.3, M.ether);
    limb(g, [x, 35, z], [nx, 35, nz], 0.7, M.halo1);
  }
  gem(g, M, 4.2, 1.8, 0, 31, 0);
  return g;
}

/** Zenith (air production, 3x3): two pearl towers east and west with light seams, a floating launch ring between. */
export function zenith(M) {
  const g = grp();
  add(g, plate(tri(50, 0.2), 3, 1.2), M.shellDark, 0, 0, 0);
  add(g, plate(tri(45, 0.2), 2.6, 1.2), M.shell, 0, 2.6, 0);
  add(g, cyl(30, 34, 5, 48), M.glass, 0, 7, 0);
  for (const side of [-1, 1]) {
    const p = grp(); p.position.set(side * 20, 9, 0);
    add(p, lathe([[0.1, 0], [11, 0], [9, 18], [6, 40], [2.5, 58], [0, 60]], 18), M.shell, 0, 0, 0);
    add(p, lathe([[0.1, 0], [8.5, 0], [6.5, 16], [0.1, 17]], 18), M.shellLight, 0, 12, 0);          // plate collar
    ring(p, 8.9, 0.3, M.shellDeep, 11.5, { seg: 24 });
    add(p, rbox(1, 24, 1, 0.4), M.ether, -side * 6.4, 27, 0);
    add(p, rbox(1.5, 25, 2, 0.4), M.halo1, -side * 6.5, 27, 0);
    gem(p, M, 1.8, 1.5, 0, 61, 0);
    g.add(p);
  }
  ring(g, 20, 2.2, M.ring, 40, { seg: 56 });
  ring(g, 20, 1.2, M.shellDark, 38.6, { seg: 56 });
  for (let k = 0; k < 2; k++) ring(g, 20, 2.5, M.glaze, 40.1, { arc: Math.PI / 2.2, a0: k * Math.PI + 0.9, seg: 56 });
  add(g, cyl(12, 12, 0.6, 36), M.pad, 0, 9.9, 0);
  add(g, cyl(15, 15, 0.3, 36), M.padHalo, 0, 10.2, 0);
  add(g, rbox(44, 2, 3, 0.6), M.glaze, 0, 9.2, 34);
  add(g, rbox(30, 0.5, 0.6, 0.15), M.ether, 0, 10.4, 34);
  for (const side of [-1, 1]) lamp(g, M, 1.1, side * 36, 6.2, 34);
  return g;
}

export const VAEL_BUILDINGS = {
  conflux: [4, conflux, 70],
  spire: [2, spire, 82],
  siphon: [2, siphon, 50],
  kiln: [3, kiln, 42],
  ward: [2, ward, 50],
  loom: [2, loom, 42],
  zenith: [3, zenith, 72],
};
