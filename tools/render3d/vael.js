// The Vael's look (v3: v1's identity with alien realism), now the materials and shape helpers of the older Expedition
// models (vael2.js, vael-units.js, vael-buildings.js: the Medic's model and fitTints' references; `ring`, `lathe`) and the
// shapes some of the re-theme's models share (`cone`, `torus`). Same conventions as tools/render3d/models.js:
// game units (1 tile = 32), units face +x, y up, +z south. A polished alien artifact, not a weathered machine: pearl
// ceramic with a clearcoat sheen and clean hairline seams, engraved channels and inlaid light lines; black glass;
// vivid team glaze with a faint iridescence; violet light wrapped in translucent halos so the glow falls off instead
// of sitting flat (the Medic's mending light alone is pale aqua, so a healer never reads as a weapon).
import * as THREE from 'three';
import { add, boxUV } from './models.js';
import { NEUTRAL, team } from './materials.js';
import { VP } from './vael-palette.js';

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
/** The same seams on the color map and the bump map: curved hairline panel seams, a few engraved channels and
 *  inlaid light lines. Clean: no grime, rivets or chips. */
function seamMarks(g, n, { seam, groove, inlay, light, seamW = 1.8 }) {
  seed = 41; g.lineCap = 'round';
  const arcs = []; for (let i = 0; i < 12; i++) arcs.push([rnd() * n, rnd() * n, 50 + rnd() * 110, rnd() * 6, 0.5 + rnd() * 1.6]);
  g.strokeStyle = seam; g.lineWidth = seamW; for (const [x, y, r, a, l] of arcs) { g.beginPath(); g.arc(x, y, r, a, a + l); g.stroke(); }
  g.strokeStyle = light; g.lineWidth = 0.8; for (const [x, y, r, a, l] of arcs) { g.beginPath(); g.arc(x, y, r + 1.4, a + 0.03, a + l - 0.03); g.stroke(); }
  g.strokeStyle = groove; g.lineWidth = 3; for (let i = 0; i < 5; i++) { const [x, y, r, a, l] = arcs[i]; g.beginPath(); g.arc(x, y, r * 0.86, a + 0.1, a + l * 0.7); g.stroke(); } // engraved channels
  g.strokeStyle = inlay; g.lineWidth = 0.9; for (let i = 0; i < 5; i++) { const [x, y, r, a, l] = arcs[i]; g.beginPath(); g.arc(x, y, r * 0.86, a + 0.14, a + l * 0.66); g.stroke(); }   // light inlaid in the channel
  g.strokeStyle = seam; g.lineWidth = 1.4; for (let i = 0; i < 8; i++) { const x = rnd() * n, y = rnd() * n, a = (rnd() * 4 | 0) * Math.PI / 4 + 0.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (20 + rnd() * 60), y + Math.sin(a) * (20 + rnd() * 60)); g.stroke(); }
}
/** The shell's color map in the palette's colors (vael-palette.js): a faint grain, a mottling of aged ivory and the
 *  dark seams. */
const shellTex = (T) => canvasTex(256, (g, n) => {
  const [g0, gk, gb] = T.grain, [[mr, mg, mb], ma, mk, mn] = T.mottle;
  g.fillStyle = T.base; g.fillRect(0, 0, n, n);
  seed = 7; for (let i = 0; i < 1800; i++) { const v = g0 + rnd() * gk; g.fillStyle = `rgba(${v},${v},${v + gb},0.25)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2); } // faint grain
  for (let i = 0; i < mn; i++) { g.fillStyle = `rgba(${mr},${mg},${mb},${ma + rnd() * mk})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 20 + rnd() * 50, 10 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); } // mottling
  seamMarks(g, n, T);
}, { repeat: 2 });
const pearl = shellTex(VP.tex);
/** The team glaze's map: the same marks in neutral grays, so the team mask carries no hue of the shell's. */
const glazeMap = shellTex(VP.glazeTex);
const pearlBump = canvasTex(256, (g, n) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  seamMarks(g, n, { seam: '#3c3c3c', groove: '#505050', inlay: '#6a6a6a', light: '#a8a8a8' });
}, { srgb: false, repeat: 2 });

// ---------------- materials ----------------
export function makeVaelMats(tc = NEUTRAL) {
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const ceramic = (color, extra = {}) => phys({ color, map: pearl, bumpMap: pearlBump, bumpScale: 1.1, metalness: 0.1, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.22, sheen: 0.15, sheenColor: VP.sheen, sheenRoughness: 0.6, ...VP.ceramic, ...extra });
  const team_ = tc.paint;
  // translucent additive shells around lights: the glow's falloff
  const halo = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  const [dl, dc, [h1, h2, h3]] = [VP.deeplight, VP.deepCore, VP.deepHalo];
  return {
    // the shell (vael-palette.js): bone, a warm off-white aged to ivory, horn-brown beneath
    shell: ceramic(VP.shell),                                                                   // the body
    shellLight: ceramic(VP.shellLight, { bumpScale: 0.8 }),                                     // top plates
    shellDark: ceramic(VP.shellDark, { roughness: 0.58, clearcoat: 0.3, ...VP.shellDarkExtra }), // undersides, recesses
    shellDeep: ceramic(VP.shellDeep, { roughness: 0.7, clearcoat: 0.1, ...VP.shellDeepExtra }),  // crevices and channels
    ring: ceramic(VP.ring, { roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12, metalness: 0.2, ...VP.ringExtra }),
    glass: phys({ color: 0x17121f, metalness: 0.5, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glaze: team(phys({ color: team_, map: glazeMap, bumpMap: pearlBump, bumpScale: 0.4, metalness: 0.2, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, iridescence: 0.35, iridescenceIOR: 1.4 })),
    // The new look (STYLE.md): bone shells on an ink core, "deeplight" (the lantern light, small) for the few lights.
    ink: phys({ color: VP.ink, metalness: 0.45, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06 }),            // the ink core: black glass
    inkSeam: std({ color: VP.inkSeam, metalness: 0.3, roughness: 0.5 }),                                                    // ink edges round team glaze
    deeplight: std({ color: dl[0], emissive: dl[1], emissiveIntensity: dl[2], roughness: 0.2 }),                       // a small light
    deepCore: std({ color: dc[0], emissive: dc[1], emissiveIntensity: dc[2] }),                                       // its white heart
    deepWhite: std({ color: 0xffffff, emissive: VP.deepWhite, emissiveIntensity: 4, toneMapped: false }),                     // a light's brightest center
    deepHalo1: halo(h1, 0.18), deepHalo2: halo(h2, 0.09), deepHalo3: halo(h3, 0.045),
    pool: std({ color: VP.pool[0], emissive: VP.pool[1], emissiveIntensity: VP.pool[2], metalness: 0.5, roughness: 0.08 }),           // a pool of deeplight: dim, broad
    poolDeep: std({ color: VP.poolDeep[0], emissive: VP.poolDeep[1], emissiveIntensity: VP.poolDeep[2], metalness: 0.5, roughness: 0.05 }),
  };
}

// ---------------- helpers ----------------
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
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
