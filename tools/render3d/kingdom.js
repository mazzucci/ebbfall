// The kingdom (the re-theme's medieval people, standing in for the Harbour in the comparison picture; not in the
// game's atlas: tools/art/retheme-compare.mjs renders it by filter through retheme.js). Stone, timber, cloth and steel:
// a kingdom thing is a darker body (stone, oak, wool) with pale steel on top and team colour on cloth between dark
// hems, so in greyscale it keeps the Harbour's order against the Expedition's pale panels. Tall and spiky (towers,
// cones, lances, pennants), matte, no lights. Three palettes, same shapes (`makeKingdomMats(tc, v)`): A sandstone and
// clay tiles with bright steel, B granite and slate with blackened iron, C a timber keep with thatch. Stelian's list
// (2026-11-10, the roster locked): the Villager (tunic, pickaxe, a load), the Guard (a long spear, a shield), the Knight (horse, lance, banner),
// the Castle (keep, towers, battlements, a banner). Same conventions as models.js: game units, units face +x, y up,
// +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './models.js';
import { makeMats } from './materials.js';
import { lathe, torus } from './harbour.js';
import { cone } from './vael.js';
import { polishMats } from './polish.js';

// ---------------- textures (light bases: the material colour darkens them) ----------------
export function tex(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 17; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Ashlar: courses of squared blocks, each its own tone, mortar lines between, a few chips. */
export const ashlarTex = tex(256, (g, n) => {
  g.fillStyle = '#d6d0c4'; g.fillRect(0, 0, n, n); seed = 17;
  for (let y = 0; y < n; y += 32) { const o = (y / 32) % 2 ? 24 : 0; for (let x = -48; x < n; x += 48) { const v = 196 + rnd() * 50; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x + o, y, 48, 32); } }
  for (let i = 0; i < 2600; i++) { const v = 170 + rnd() * 80; g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(60,52,44,0.75)'; g.lineWidth = 2.2;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(n, y + 0.5); g.stroke(); const o = (y / 32) % 2 ? 24 : 0; for (let x = o; x < n + 48; x += 48) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 32); g.stroke(); } }
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 2.5); g.lineTo(n, y + 2.5); g.stroke(); }
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(70,60,50,${0.08 + rnd() * 0.14})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 3 + rnd() * 12, 2 + rnd() * 6, rnd() * 3, 0, 7); g.fill(); }
}, { repeat: 2 });
export const ashlarBump = tex(256, (g, n) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); g.strokeStyle = '#404040'; g.lineWidth = 2.2;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(n, y + 0.5); g.stroke(); const o = (y / 32) % 2 ? 24 : 0; for (let x = o; x < n + 48; x += 48) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 32); g.stroke(); } }
}, { srgb: false, repeat: 2 });
/** Clay tiles: rows of short tiles, each with a dark lower edge and a lit crown. */
const tileTex = tex(128, (g, n) => {
  g.fillStyle = '#d8c8b8'; g.fillRect(0, 0, n, n); seed = 29;
  for (let y = 0; y < n; y += 12) { const o = (y / 12) % 2 ? 6 : 0; for (let x = -12; x < n; x += 12) { const v = 190 + rnd() * 50; g.fillStyle = `rgb(${v},${v - 20},${v - 40})`; g.fillRect(x + o, y, 12, 12); g.fillStyle = 'rgba(50,30,20,0.7)'; g.fillRect(x + o, y + 10, 12, 2); g.fillStyle = 'rgba(255,240,220,0.25)'; g.fillRect(x + o + 1, y + 1, 10, 2); g.fillStyle = 'rgba(50,30,20,0.4)'; g.fillRect(x + o, y, 1, 12); } }
}, { repeat: 3 });
/** Slates: broad thin slabs in overlapping rows, cool grey, each its own tone. */
const slateTex = tex(128, (g, n) => {
  g.fillStyle = '#c8ccd2'; g.fillRect(0, 0, n, n); seed = 37;
  for (let y = 0; y < n; y += 16) { const o = (y / 16) % 2 ? 12 : 0; for (let x = -24; x < n; x += 24) { const v = 170 + rnd() * 60; g.fillStyle = `rgb(${v - 6},${v - 2},${v + 4})`; g.fillRect(x + o, y, 24, 16); g.fillStyle = 'rgba(20,24,30,0.75)'; g.fillRect(x + o, y + 14, 24, 2); g.fillRect(x + o, y, 1, 16); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + o + 1, y + 1, 22, 1); } }
}, { repeat: 3 });
/** Thatch: bundles of straw combed downward, darker bands where the courses lap. */
export const thatchTex = tex(128, (g, n) => {
  g.fillStyle = '#d8c89c'; g.fillRect(0, 0, n, n); seed = 43;
  for (let i = 0; i < 900; i++) { const v = 150 + rnd() * 100, x = rnd() * n, y = rnd() * n; g.strokeStyle = `rgba(${v},${v - 20},${v - 60},0.5)`; g.lineWidth = 0.8 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + 6 + rnd() * 12); g.stroke(); }
  for (let y = 40; y < n + 40; y += 40) { g.fillStyle = 'rgba(70,50,20,0.35)'; g.fillRect(0, y - 4, n, 4); g.fillStyle = 'rgba(255,240,200,0.2)'; g.fillRect(0, y, n, 2); }
}, { repeat: 3 });
/** Planks: upright boards with dark seams, grain and a nail here and there. */
export const plankTex = tex(128, (g, n) => {
  g.fillStyle = '#d2bc96'; g.fillRect(0, 0, n, n); seed = 53;
  for (let x = 0; x < n; x += 16) { const v = 180 + rnd() * 50; g.fillStyle = `rgb(${v},${v - 18},${v - 50})`; g.fillRect(x, 0, 16, n); }
  for (let i = 0; i < 70; i++) { const x = rnd() * n; g.strokeStyle = `rgba(80,50,20,${0.12 + rnd() * 0.3})`; g.lineWidth = 0.6 + rnd(); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 4 - 2, n / 3, x + rnd() * 4 - 2, 2 * n / 3, x + rnd() * 2 - 1, n); g.stroke(); }
  g.fillStyle = 'rgba(40,25,10,0.85)'; for (let x = 0; x < n; x += 16) g.fillRect(x, 0, 2, n);
  g.fillStyle = 'rgba(30,30,30,0.7)'; for (let x = 8; x < n; x += 16) for (const y of [20, 100]) { g.beginPath(); g.arc(x, y + (x % 32 ? 6 : 0), 1.4, 0, 7); g.fill(); }
}, { repeat: 2 });
export const plankBump = tex(128, (g, n) => { g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); g.fillStyle = '#404040'; for (let x = 0; x < n; x += 16) g.fillRect(x, 0, 2, n); }, { srgb: false, repeat: 2 });
/** Wicker: the dosser's weave. */
const wickerTex = tex(64, (g, n) => { g.fillStyle = '#d8c090'; g.fillRect(0, 0, n, n); g.fillStyle = 'rgba(60,40,10,0.35)'; for (let y = 0; y < n; y += 6) g.fillRect(0, y, n, 2); g.fillStyle = 'rgba(60,40,10,0.25)'; for (let x = 0; x < n; x += 10) for (let y = 0; y < n; y += 12) g.fillRect(x + (y % 24 ? 5 : 0), y, 2, 12); }, { repeat: 4 });
/** Trodden earth: dry, uneven, a few stones and darker damp patches; the ground under both peoples' main buildings. */
export const earthTex = tex(256, (g, n) => {
  g.fillStyle = '#d8ccb8'; g.fillRect(0, 0, n, n); seed = 61;
  for (let i = 0; i < 7000; i++) { const v = 150 + rnd() * 100; g.fillStyle = `rgba(${v},${v - 10},${v - 30},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 2); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(60,45,30,${0.06 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 24, 3 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 40; i++) { const v = 120 + rnd() * 60; g.fillStyle = `rgba(${v},${v - 5},${v - 15},0.7)`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 1.5 + rnd() * 2.5, 1 + rnd() * 1.6, rnd() * 3, 0, 7); g.fill(); }
}, { repeat: 2 });

// ---------------- the palettes ----------------
/** The kingdom's palette: Stelian picked B, slate (2026-11-10): slate-grey ashlar, slate roofs, blackened iron, grey
 *  wool, dark oak; the units' heads pale (linen, steel) so the side reads by its heads. (A, sandstone and clay, and
 *  C, timber and thatch, were the comparison's other options; dropped.) */
export const KINGDOM_PALETTES = {
  B: { name: 'slate grey and slate', wall: 0x80828a, wallTex: 'ashlar', roof: 0x4e545c, roofTex: 'slate', timber: 0x50402c, steel: 0x9aa0a8, steelMetal: 0.85, steelRough: 0.4, mail: 0x565a60, tunic: 0x8c887e, wicker: 0xa89060, hose: 0x34302e, leather: 0x2e2622, plinth: 0x62646a, horse: 0x42342c, earth: 0x5c5a54 },
};
const ROOF_TEX = { tile: tileTex, slate: slateTex, thatch: thatchTex };
/** The kingdom's materials for a palette `v`, over the Harbour's set (its team canvas, ink, rope, brass and timber
 *  grain are reused: `paintCanvas` is the team cloth, `inkLine` the hem either side of it). */
export function makeKingdomMats(tc, v = 'B', polish = false) {
  const P = KINGDOM_PALETTES[v], M = makeMats(tc), std = (o) => new THREE.MeshStandardMaterial(o);
  M.wall = P.wallTex === 'plank' ? std({ color: P.wall, map: plankTex, bumpMap: plankBump, bumpScale: 1.2, roughness: 0.85 }) : std({ color: P.wall, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.9 });
  M.wallDark = M.wall.clone(); M.wallDark.color.multiplyScalar(0.72);
  M.plinth = std({ color: P.plinth, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });
  M.roof = std({ color: P.roof, map: ROOF_TEX[P.roofTex], roughness: P.roofTex === 'slate' ? 0.6 : 0.9, metalness: P.roofTex === 'slate' ? 0.15 : 0 });
  M.oak = std({ color: P.timber, map: M.timber.map, roughness: 0.82 });
  M.haft = std({ color: 0x9a6a3c, map: M.timber.map, roughness: 0.78 });                                           // a hand-held shaft (the spear, the lance): a warm medium brown, two steps above the oak, so a prop a few px wide reads over the grass and the unit's shadow (the legibility pass, 2026-11-11)
  M.steel = std({ color: P.steel, metalness: P.steelMetal, roughness: P.steelRough });
  M.mail = std({ color: P.mail, map: M.sandbag.map, metalness: 0.7, roughness: 0.55 });
  M.tunic = std({ color: P.tunic, map: M.canvas.map, roughness: 0.92 });
  M.wicker = std({ color: P.wicker, map: wickerTex, roughness: 0.95 });
  M.hose = std({ color: P.hose, roughness: 0.9 });
  M.leather = std({ color: P.leather, roughness: 0.6, metalness: 0.1 });
  M.skin = std({ color: 0xc89a74, roughness: 0.8 });
  M.linen = std({ color: 0xd8d0bc, map: M.canvas.map, roughness: 0.92 });                                          // pale linen: the Villager's coif (the kingdom's heads are pale)
  M.gold = std({ color: 0xf0c850, metalness: 0.6, roughness: 0.35 });                                               // coins: a light yellow (seat 0 is blue now; gold is the coins' alone)
  M.glint = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });                                    // a white glint on a heap
  M.horse = std({ color: P.horse, roughness: 0.75 });
  M.horseDark = std({ color: 0x241810, roughness: 0.85 });                                                        // mane, tail, hooves
  M.earth = std({ color: P.earth, map: earthTex, roughness: 1 });                                                 // trodden earth under the castle
  M.path = std({ color: 0x7e7c74, map: earthTex, roughness: 1 });                                                  // the worn path, paler grey
  M.yard = std({ color: 0x6a6c70, map: M.flagstone.map, bumpMap: M.flagstone.bumpMap, bumpScale: 1, roughness: 0.9 }); // the yard: grey flagstones
  M.cloth = M.paintCanvas;                                                                                       // the team cloth, between `inkLine` hems
  M.clothPale = std({ color: 0xd8d0ba, map: M.canvas.map, roughness: 0.9 });                                       // the pavilion's pale stripes
  M.quoin = std({ color: 0x9c9ea6, roughness: 0.9 });                                                             // dressed corner stones, a step lighter than the ashlar (the polish's quoins)
  return polish ? polishMats(M, 'kg') : M;                                                                        // (polish.js: texture on the flat materials and `M.polish` for the models' secondary detail)
}

// ---------------- helpers ----------------
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
/** A gable roof: a triangular prism along z, `w` wide, `h` high, `len` long, its ridge at y = h. */
export const gable = (w, h, len) => memo(`gb${w},${h},${len}`, () => { const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]); const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); g.computeVertexNormals(); return boxUV(g); });
/** A ring of wall between two outlines, `h` tall. */
export const ringPlate = (outer, inner, h) => memo(`rp${JSON.stringify([outer, inner, h])}`, () => { const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z))); s.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z)))); const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return boxUV(g); });
export const sq = (r) => [[-r, -r], [r, -r], [r, r], [-r, r]];
export const oct = (r, k = 0.42) => { const c = r * k; return [[-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c]]; };
/** Merlons along a wall's top from (x0, z0) to (x1, z1): a tooth every `step`. */
export function crenels(g, M, x0, z0, x1, z1, y, step = 5.2, w = 2.6, t = 2.2) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / step), a = Math.atan2(z1 - z0, x1 - x0);
  for (let k = 0; k <= n; k++) { const u = k / Math.max(1, n); add(g, rbox(w, 2.4, t, 0.3), M, x0 + (x1 - x0) * u, y + 1.2, z0 + (z1 - z0) * u, 0, -a, 0); }
}
/** Merlons round a round tower's top. */
export function roundCrenels(g, M, x, z, r, y, n = 10) {
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; add(g, rbox(2.2, 2.2, 1.8, 0.3), M, x + Math.cos(a) * r, y + 1.1, z + Math.sin(a) * r, 0, -a, 0); }
}
/** The polish's quoins: dressed stones up a corner at (x, z) from y0 to y1, long and short faces alternating. */
export function quoins(g, M, x, z, y0, y1, step = 3.0, a = 2.6, b = 1.5, t = 1.2) {
  for (let y = y0, k = 0; y < y1; y += step, k++) add(g, rbox(k % 2 ? a : b, step * 0.8, k % 2 ? b : a, 0.15), M.quoin, x, y + step * 0.4, z);
}
/** A hanging team cloth on a wall face: the cloth between two ink hems, hung from a pole with knobs. The group's -x
 *  side is against the wall; `ry` turns it to the face. */
export function hanging(g, M, x, y, z, w, h, ry = 0) {
  const p = grp(); p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
  add(p, rbox(0.5, h, w, 0.1), M.cloth, 0, -h / 2, 0);
  add(p, rbox(0.6, 0.5, w + 0.3, 0.05), M.inkLine, 0, -0.2, 0); add(p, rbox(0.6, 0.5, w + 0.3, 0.05), M.inkLine, 0, -h + 0.2, 0);
  add(p, cyl(0.4, 0.4, w + 2, 8), M.oak, 0.2, 0.3, 0, Math.PI / 2, 0, 0);
}
/** A pennant on a staff: a team triangle, a plate turned to face the camera. */
export function pennant(g, M, x, y, z, h = 14, L = 9) {
  add(g, cyl(0.7, 0.8, h, 6), M.oak, x, y + h / 2, z); add(g, sph(0.9, 8, 6), M.steel, x, y + h + 0.3, z);
  add(g, plate([[0, -2.2], [L, -0.5], [L, 0.5], [0, 2.2]], 0.4, 0.1), M.cloth, x + 0.3, y + h - 0.6, z, Math.PI / 2, 0, 0);
}
/** A square banner flying from a staff: team cloth between ink hems, a plate facing the camera. */
export function banner(g, M, x, y, z, h, w, d) {
  add(g, cyl(0.8, 0.9, h, 6), M.oak, x, y + h / 2, z); add(g, sph(1.0, 8, 6), M.steel, x, y + h + 0.4, z);
  add(g, plate([[0, 0], [w, 0], [w, d], [w * 0.5, d - 1.5], [0, d]], 0.4, 0.1), M.cloth, x + 0.4, y + h - 0.8, z, Math.PI / 2, 0, 0);
  add(g, rbox(w + 0.4, 0.4, 0.5, 0.05), M.inkLine, x + 0.4 + w / 2, y + h - 0.8, z + 0.1);
  add(g, rbox(0.4, 0.4, d + 0.2, 0.05), M.inkLine, x + 0.4, y + h - 0.8, z + d / 2);
}

/** A figure in a tunic and hose: legs by frame (two strides), the body group `body` to hang gear on; the head at
 *  y 13.5. The tunic's skirt flares to `skirt`. Shared with the Expedition's Mercenary (a local). */
export function figure(M, f, { tunic = M.tunic, hose = M.hose, skirt = 4.0 } = {}) {
  const g = grp(), st = [3.2, -3.2][f % 2];
  for (const side of [-1, 1]) {
    const z = side * 2.1, s = st * side;
    add(g, rbox(3.4, 1.5, 2.2, 0.6), M.leather, s + 0.5, 0.75, z);                           // a boot
    limb(g, [0, 6.4, z], [s * 0.55, 3.4, z * 1.05], 1.2, hose);
    limb(g, [s * 0.55, 3.4, z * 1.05], [s, 1.3, z], 1.05, hose);
  }
  const b = grp(); g.add(b);
  add(b, cyl(3.2, skirt, 3.6, 12), tunic, 0, 7.4, 0);                                        // the tunic's skirt
  add(b, rbox(5.0, 6.0, 6.6, 1.5), tunic, 0, 10.3, 0);                                        // the torso
  add(b, rbox(5.2, 0.8, 6.8, 0.3), M.leather, 0, 8.3, 0);                                     // belt
  add(b, sph(2.0, 16, 12), M.skin, 0.3, 13.5, 0);                                             // head
  return Object.assign(g, { body: b });
}

/** Villager (worker, sim r 9, scale 0.95): the one that carries: a wicker basket slung low on the back at the hip,
 *  below the shoulders, heaped with gold coins (the units family: the slice's heap at the shoulders read as a hard hat
 *  over the head; now the pale coif stands clear above it), the head in a pale linen coif (a snug cap; the kingdom's
 *  heads are pale, each its own shape), two team straps over the shoulders down to the basket, team hose, a team cape
 *  at the shoulders, a plain tunic; a short pick held low in the right hand, its bright head near the ground ahead.
 *  From the camera: a pale small dome, a gold heap low behind and below it, a short bright bar low ahead; in grey, no
 *  steel disc and no long bar. Frames 0-1 the walk. */
export function villager(M, f) {
  const g = figure(M, f, { hose: M.cloth }), b = g.body; b.rotation.z = -0.16;
  add(b, sph(2.3, 14, 10), M.linen, 0.2, 13.7, 0).scale.set(1, 0.95, 1);                          // the head in a pale linen coif: a snug cap, no brim (the Guard's is the wide steel disc)
  add(b, cyl(2.3, 2.3, 0.3, 14), M.inkLine, 0.2, 12.6, 0);                                       // its edge
  add(b, sph(1.5, 12, 10), M.skin, 1.7, 13.2, 0).scale.set(0.8, 0.9, 0.9);                       // the face
  add(b, cyl(2.5, 3.6, 2.0, 14), M.cloth, 0.1, 12.0, 0);                                        // the cape at the shoulders, team
  add(b, cyl(3.7, 3.8, 0.4, 14), M.inkLine, 0.1, 11.0, 0); add(b, cyl(2.6, 2.6, 0.35, 14), M.inkLine, 0.1, 13.0, 0); // its hems
  // the basket: wicker, slung low on the back at the hip (its top under the shoulders), heaped with gold coins
  const sk = grp(); sk.position.set(-4.4, 6.6, 0.4); sk.rotation.set(0, -0.3, 0.2); b.add(sk);    // (below the head: the slice's judge read a heap at the shoulders as a gold-headed man)
  add(sk, cyl(3.4, 2.6, 5.2, 12), M.wicker, 0, 0, 0);                                             // the basket's body
  add(sk, torus(3.4, 0.45, 16), M.oak, 0, 2.6, 0, Math.PI / 2, 0, 0);                             // its oak rim
  add(sk, cyl(3.5, 3.5, 0.4, 16), M.inkLine, 0, 1.9, 0);                                          // a dark line under the rim
  add(sk, sph(3.1, 14, 10), M.gold, 0, 2.9, 0).scale.set(1, 0.55, 1);                             // the load: a heap of gold coins out of the basket's mouth, the worker's loud cue
  add(sk, torus(3.0, 0.3, 18), M.inkLine, 0, 2.9, 0, Math.PI / 2, 0, 0).scale.set(1, 1.1, 1);      // a dark rim round it
  add(sk, sph(0.5, 8, 6), M.glint, 0.6, 4.4, -0.6); add(sk, sph(0.35, 8, 6), M.glint, -1.2, 4.2, 1.2); // white glints
  for (const [x, z] of [[0.9, 1.4], [-1.6, 1.0], [-0.2, -1.6], [1.4, -0.8]]) add(sk, cyl(0.9, 0.9, 0.35, 10), M.gold, x, 4.5, z, 0.3, x, 0.2);
  for (const z of [-2.0, 2.0]) {                                                                 // the straps over the shoulders, down to the basket
    add(b, rbox(4.8, 0.9, 1.5, 0.2), M.cloth, -0.2, 13.0, z, 0, 0, -0.1);
    add(b, rbox(5.0, 1.0, 1.8, 0.1), M.inkLine, -0.2, 12.75, z, 0, 0, -0.1);
    add(b, rbox(0.9, 4.0, 1.5, 0.2), M.cloth, 2.5, 10.8, z); add(b, rbox(1.0, 4.2, 1.8, 0.1), M.inkLine, 2.35, 10.8, z);
    add(b, rbox(0.9, 4.6, 1.5, 0.2), M.cloth, -2.7, 10.2, z, 0, 0, -0.25); add(b, rbox(1.0, 4.8, 1.8, 0.1), M.inkLine, -2.85, 10.2, z, 0, 0, -0.25);
  }
  // the left hand up on a strap; the right arm down, the pick held low and ahead, its bright head near the ground
  limb(b, [0.6, 11, -3.6], [2.6, 11.6, -2.6], 1.15, M.cloth); add(b, sph(0.9, 8, 6), M.skin, 2.9, 11.6, -2.5);
  limb(b, [0.6, 11, 3.6], [2.6, 7.0, 3.9], 1.15, M.cloth); add(b, sph(0.9, 8, 6), M.skin, 2.8, 6.6, 3.9);
  const pk = grp(); pk.position.set(2.8, 6.4, 4.0); pk.rotation.z = -1.25; b.add(pk);             // the haft, down and ahead
  add(pk, cyl(0.8, 0.9, 7.5, 8), M.oak, 0, 3.0, 0);
  add(pk, rbox(7.0, 1.6, 1.6, 0.3), M.steel, 0, 6.6, 0);                                        // the head, bright, across the haft
  add(pk, cone(0.8, 2.6, 8), M.steel, 4.6, 6.6, 0, 0, 0, -Math.PI / 2);                         // its point, down ahead
  add(pk, rbox(1.8, 2.2, 1.3, 0.3), M.steel, -4.2, 6.6, 0);                                     // its flat end
  if (M.polish) { // secondary detail: a buckle, a hip pouch, ink cuffs at the wrists, a leather grip on the haft, a second weave band on the basket
    add(b, rbox(1.3, 1.1, 0.5, 0.1), M.steel, 2.75, 8.3, 0);
    add(b, rbox(1.4, 1.9, 1.8, 0.4), M.leather, 1.0, 7.2, -3.7);
    add(b, sph(1.25, 8, 6), M.inkLine, 2.45, 11.6, -2.6); add(b, sph(1.25, 8, 6), M.inkLine, 2.6, 7.2, 3.9);
    add(pk, cyl(0.98, 0.98, 2.0, 8), M.leather, 0, 1.0, 0);
    add(sk, torus(2.8, 0.3), M.oak, 0, -1.6, 0, Math.PI / 2, 0, 0);
  }
  g.scale.setScalar(0.95);
  return g;
}

/** Guard (line infantry, sim r 10-11, scale 1.08; "Spearman" until the names were final): a spearman under a steel kettle hat (the pale disc from above,
 *  a dark line under its brim, no cloth on it), a team surcoat over mail between ink hems, mail sleeves, a round team
 *  shield with an ink rim and a steel boss on the left arm, its face turned up and to the camera, and the signature:
 *  a long spear in the right hand angled up ahead, an oak shaft with a bright steel leaf head, reaching well past the
 *  body at both ends. From the camera: a pale disc, a team disc beside it, a long thin bar angled up. Frames 0-1 the
 *  march. */
export function guard(M, f) {
  const g = figure(M, f, { tunic: M.tunic, skirt: 4.2 }), b = g.body;                          // (an undyed surcoat: the PM's rule, no torso slab; the team is sleeves, hem, shield)
  add(b, cyl(4.1, 4.4, 1.6, 12), M.cloth, 0, 6.2, 0); add(b, cyl(4.2, 4.2, 0.4, 12), M.inkLine, 0, 7.1, 0); add(b, cyl(4.45, 4.45, 0.45, 12), M.inkLine, 0, 5.4, 0); // a team hem band on the skirt
  add(b, rbox(5.3, 0.4, 6.9, 0.1), M.inkLine, 0, 13.1, 0);                                    // the collar's edge
  add(b, sph(2.2, 14, 10), M.mail, 0.3, 13.4, 0);                                             // the mail coif
  add(b, sph(1.4, 12, 10), M.skin, 1.6, 13.1, 0).scale.set(0.8, 0.9, 0.9);                    // the face
  const hat = grp(); hat.position.set(0.3, 14.9, 0); b.add(hat);                              // the kettle hat
  add(hat, lathe([[0, 0], [4.2, 0], [4.3, 0.4], [3.1, 0.75], [2.95, 2.5], [1.9, 3.4], [0, 3.7]]), M.steel, 0, 0, 0);
  add(hat, cyl(4.3, 4.3, 0.35, 24), M.inkLine, 0, -0.15, 0);                                  // the dark line under the brim
  add(hat, torus(3.05, 0.22, 20), M.inkLine, 0, 0.75, 0, Math.PI / 2, 0, 0);                  // a dark seam at the crown's foot
  // the shield on the left arm, its face tilted up and towards the camera (south)
  const sh = grp(); sh.position.set(1.0, 10.2, -4.4); sh.rotation.set(-Math.PI / 2 + 0.9, 0.3, 0.1); b.add(sh);
  add(sh, cyl(4.6, 4.6, 0.7, 24), M.oak, 0, 0, 0);                                            // the board, big
  add(sh, cyl(4.1, 4.1, 0.5, 24), M.cloth, 0, 0.3, 0);                                        // the team face
  add(sh, torus(4.35, 0.4, 24), M.inkLine, 0, 0.35, 0, Math.PI / 2, 0, 0);                    // the ink rim
  add(b, rbox(2.8, 5.0, 4.6, 0.6), M.cloth, -3.9, 10.4, 0); add(b, rbox(3.0, 0.4, 4.8, 0.1), M.inkLine, -3.9, 13.0, 0); add(b, rbox(3.0, 0.4, 4.8, 0.1), M.inkLine, -3.9, 7.8, 0); // a team pack on the back
  add(sh, sph(1.0, 10, 8), M.steel, 0, 0.5, 0);                                               // the boss
  limb(b, [0.6, 11, -3.6], [1.2, 9.8, -4.0], 1.2, M.cloth);                                    // team sleeves (the family trait; the Guard keeps more team than the Villager)
  // the spear in the right hand, angled up ahead: an oak shaft 26 long, a steel socket and leaf head, a ferrule
  const sp = grp(); sp.position.set(0.8, 10.0, 3.4); sp.rotation.z = 0.7; b.add(sp);
  add(sp, cyl(1.05, 1.05, 26, 8), M.haft, 5.0, 0, 0, 0, 0, Math.PI / 2);                      // (the shaft in warm haft brown, 3.2 px wide at zoom 1.0 (0.85, 2.6 px, in dark oak until the legibility pass): the PM's rule, nothing important under 2 CSS px)
  add(sp, cyl(1.2, 1.2, 1.6, 8), M.steel, 18.2, 0, 0, 0, 0, Math.PI / 2);                     // the socket
  add(sp, cone(1.6, 5.4, 8), M.steel, 21.5, 0, 0, 0, 0, -Math.PI / 2).scale.set(1, 1, 0.5);   // the leaf head
  add(sp, cyl(1.2, 1.1, 1.4, 8), M.steel, -8.4, 0, 0, 0, 0, Math.PI / 2);                     // the butt's ferrule
  limb(b, [0.6, 11, 3.6], [2.6, 10.6, 3.6], 1.2, M.cloth); add(b, sph(0.9, 8, 6), M.skin, 2.9, 10.5, 3.5);
  if (M.polish) { // secondary detail: a buckle, a sword in a scabbard at the left hip, leather bindings on the spear (round 2 dropped the rim studs: not found at 4x)
    add(b, rbox(1.3, 1.1, 0.5, 0.1), M.steel, 2.75, 8.3, 0);
    add(b, cyl(0.5, 0.4, 7, 6), M.leather, -1.6, 5.6, -3.4, 0.3, 0, 0.55); add(b, rbox(2.2, 0.45, 0.5, 0.1), M.steel, -0.3, 8.9, -3.5); add(b, sph(0.5, 8, 6), M.steel, 0.2, 9.4, -3.5);
    add(sp, cyl(1.25, 1.25, 2.2, 8), M.leather, 15.6, 0, 0, 0, 0, Math.PI / 2); add(sp, cyl(1.25, 1.25, 2.6, 8), M.leather, 3.8, 0, 0, 0, 0, Math.PI / 2);
  }
  g.scale.setScalar(1.08);
  return g;
}

/** Knight (the signature unit, a fast raider, sim r 13-14, heavy class): a rider on a horse in a team caparison
 *  (the cloth over the horse's body down to its knees, an ink hem at its foot), a great helm of steel with a team
 *  plume, a team surcoat, a round team shield on the left side, and a long lance in the right hand angled up ahead
 *  with a team pennon flying near its point. From the camera: a long dark body under a team cloth, four legs, a
 *  bright helm up top, a long bar ahead with a flag on it: mounted, never a man on foot. Frames 0-1 the gallop. */
export function knight(M, f) {
  const g = grp(), st = f % 2 ? -1 : 1;
  // the horse: a barrel body, a rising neck, a head down ahead, four legs in stride, a tail
  const h = grp(); g.add(h);
  add(h, rbox(16, 7.5, 6.2, 2.6), M.horse, -1, 10.5, 0);                                      // the body
  add(h, sph(3.4, 12, 10), M.horse, -8.6, 10.6, 0).scale.set(0.9, 1, 1);                      // the rump
  limb(h, [5.5, 11.5, 0], [10.5, 17.5, 0], 2.2, M.horse);                                     // the neck
  add(h, rbox(5.4, 3.2, 2.8, 1.0), M.horse, 13.0, 17.4, 0, 0, 0, -0.35);                      // the head, down ahead
  add(h, rbox(1.6, 1.4, 2.4, 0.5), M.horseDark, 15.2, 16.4, 0);                               // the muzzle
  for (const z of [-1.1, 1.1]) add(h, cone(0.6, 1.8, 6), M.horseDark, 11.4, 19.8, z);          // ears
  for (let k = 0; k < 5; k++) add(h, rbox(1.6, 1.4, 2.0, 0.6), M.horseDark, 6.2 + k * 1.1, 14.6 + k * 1.1, 0); // the mane along the neck
  limb(h, [-10.5, 11.5, 0], [-13.5, 4.5, 0.6], 0.9, M.horseDark);                              // the tail
  for (const [x, side, fore] of [[5, -1, 1], [5, 1, 1], [-7, -1, 0], [-7, 1, 0]]) {            // the legs: fore and hind pairs in opposite swing
    const z = side * 2.4, s = (fore ? 1 : -1) * st * side * 2.4;
    limb(h, [x, 8.5, z], [x + s * 0.6, 4.4, z], 1.3, M.horse);
    limb(h, [x + s * 0.6, 4.4, z], [x + s * 1.3, 0.9, z], 1.0, M.horse);
    add(h, rbox(1.8, 1.2, 1.9, 0.4), M.horseDark, x + s * 1.3, 0.6, z);                        // a hoof
  }
  // the caparison: team cloth over the body down the flanks, an ink hem at its foot, a leather saddle over it
  add(h, rbox(16.6, 6.4, 7.4, 1.4), M.tunic, -1, 9.2, 0);                                      // the caparison, undyed wool (no body slab)
  add(h, rbox(16.8, 2.0, 7.6, 0.3), M.cloth, -1, 7.1, 0);                                      // its team border band
  add(h, rbox(16.9, 0.5, 7.7, 0.1), M.inkLine, -1, 8.2, 0); add(h, rbox(16.9, 0.5, 7.7, 0.1), M.inkLine, -1, 6.0, 0);
  add(h, rbox(7.5, 1.8, 7.8, 0.6), M.leather, 0.5, 14.1, 0);                                  // the saddle
  add(h, rbox(7.8, 0.4, 8.0, 0.1), M.inkLine, 0.5, 13.3, 0);                                  // its ink edge over the cloth
  // the rider: legs down the flanks, a team surcoat over mail, a steel great helm with a team plume
  const r = grp(); r.position.set(0.5, 14.8, 0); g.add(r);
  for (const side of [-1, 1]) { limb(r, [0.5, 2, side * 3.2], [1.8, -3.6, side * 4.6], 1.1, M.mail); add(r, rbox(2.6, 1.2, 1.6, 0.4), M.leather, 2.8, -4.0, side * 4.7); }
  add(r, rbox(4.8, 6.0, 6.0, 1.4), M.tunic, 0, 4.4, 0);                                       // the surcoat, undyed
  for (const z of [-2.4, 2.4]) { add(r, rbox(5.0, 1.6, 1.4, 0.3), M.cloth, 0, 7.4, z); add(r, rbox(5.2, 0.3, 1.6, 0.1), M.inkLine, 0, 8.3, z); add(r, rbox(5.2, 0.3, 1.6, 0.1), M.inkLine, 0, 6.5, z); } // team shoulder pads
  add(r, cyl(2.8, 2.8, 4.2, 14), M.steel, 0.2, 9.6, 0);                                       // the great helm, big and pale: the rider's head reads
  add(r, cyl(2.4, 2.4, 0.4, 14), M.inkLine, 0.2, 8.5, 0);                                     // its dark seam at the chin
  add(r, rbox(2.2, 0.5, 2.0, 0.1), M.inkLine, 1.6, 9.6, 0);                                   // the eye slit
  add(r, sph(1.6, 10, 8), M.steel, 0.2, 11.9, 0);                                              // the helm's crown
  add(r, cone(1.0, 4.0, 8), M.cloth, -2.0, 12.0, 0, 0, 0, 1.1);                                // the team plume, flying back
  // the shield on the left side, its face out and a little up
  const sh = grp(); sh.position.set(0.8, 4.0, -4.3); sh.rotation.set(-Math.PI / 2 + 1.25, 0, 0); r.add(sh);
  add(sh, cyl(3.6, 3.6, 0.6, 20), M.oak, 0, 0, 0); add(sh, cyl(3.1, 3.1, 0.4, 20), M.cloth, 0, 0.3, 0);
  add(sh, torus(3.35, 0.35, 20), M.inkLine, 0, 0.35, 0, Math.PI / 2, 0, 0); add(sh, sph(0.9, 8, 6), M.steel, 0, 0.5, 0);
  limb(r, [0, 6, -3], [1.2, 4.4, -4.0], 1.1, M.mail);
  // the lance: couched in the right hand, angled up ahead, an oak shaft with a steel point and a team pennon
  const ln = grp(); ln.position.set(2.0, 4.8, 3.6); ln.rotation.z = 0.42; r.add(ln);
  add(ln, cyl(1.2, 1.5, 24, 8), M.haft, 6.6, 0, 0, 0, 0, Math.PI / 2);                         // (24 long; 3.4 to 4.2 px wide at zoom 1.0 in warm haft brown; 0.95 to 1.2 in dark oak until the legibility pass)
  add(ln, cyl(1.9, 1.3, 2.4, 10), M.leather, -2.4, 0, 0, 0, 0, Math.PI / 2);                   // the grip's vamplate
  add(ln, cone(1.3, 3.6, 8), M.steel, 20.0, 0, 0, 0, 0, -Math.PI / 2);                        // the point
  const pn = add(ln, plate([[0, -2.6], [9, -0.8], [9, 0.8], [0, 2.6]], 0.35, 0.08), M.cloth, 20.6, 0.3, 0.2, Math.PI / 2, 0, 0); pn.rotation.z = -0.42 + 0.1; // the pennon at the lance's tip, hung level so it faces the camera
  add(ln, rbox(0.4, 0.4, 5.4, 0.05), M.inkLine, 20.6, 0.4, 0.2);                             // its ink edge at the staff
  limb(r, [0, 6, 3], [2.0, 4.8, 3.6], 1.1, M.mail); add(r, sph(0.9, 8, 6), M.mail, 2.2, 4.8, 3.7);
  if (M.polish) { // secondary detail: the bridle and reins, a breast strap and girth, saddle pommel and cantle, stirrups, the helm's cross, bands on the lance
    add(h, torus(1.9, 0.28), M.leather, 13.9, 17.0, 0, 0, Math.PI / 2, -0.35);                   // the noseband
    for (const z of [-1.4, 1.4]) { limb(h, [12.2, 18.8, z], [13.5, 16.5, z * 1.1], 0.26, M.leather); limb(h, [14.4, 16.7, z], [2.2, 19.0, z * 2.6], 0.3, M.leather); } // the headstall, the reins back to the hands
    for (const z of [-3.9, 3.9]) limb(h, [3.5, 13.4, z], [7.7, 10.8, 0], 0.4, M.leather);        // the breast strap
    add(h, rbox(2.0, 7.2, 8.0, 0.2), M.leather, 0.5, 9.4, 0);                                     // the girth
    add(h, rbox(1.2, 2.2, 5.0, 0.4), M.leather, -2.9, 15.3, 0); add(h, rbox(1.0, 1.4, 3.0, 0.3), M.leather, 3.9, 15.2, 0); // cantle and pommel
    for (const side of [-1, 1]) add(r, torus(0.95, 0.22), M.steel, 2.8, -4.0, side * 4.9);       // stirrups
    add(r, rbox(1.0, 2.6, 0.5, 0.1), M.inkLine, 2.8, 9.9, 0); add(r, rbox(1.0, 0.45, 2.4, 0.1), M.inkLine, 2.8, 9.7, 0); // the helm's cross
    for (const x of [-0.8, 4.2]) add(ln, cyl(1.6, 1.6, 0.8, 8), M.ironDark, x, 0, 0, 0, 0, Math.PI / 2);
  }
  return g;
}

/** Castle (the main building, 4x4; the slice, round 3): towers and battlements as Stelian asked, off the
 *  Age-of-Empires square-fort template by proportion and plan: a tall narrow keep at the north-west with one great
 *  round tower rising from its south-east corner under the one big cone (slate, a team band at its foot) flying the great banner; a
 *  curtain wall round the yard with a round tower at two corners only (north-east, south-west), flat battlemented
 *  tops; the gatehouse off-centre on the south wall, two cone-roofed towers (slate, team bands at their feet); a great hall along the
 *  east wall; a grey flagstone yard with a cart, crates, a well; grey-brown trodden earth and a path. Slate and dark
 *  iron throughout; team only on the bands at the three cones' feet, the flags and narrow banners (the great banner, the towers'
 *  banners and pennants, four narrow banners down the keep's face, banners on the yard's north wall, the gate's
 *  banner and shields): no cloth slabs, no tents, awnings or canopies. */
export function castle(M) {
  const g = grp(), R = 56, T = 6;
  add(g, plate(oct(62), 2.2, 0.8), M.earth, 0, 0, 0).userData.ground = true;                   // trodden earth, grey-brown (`ground`: the polish's contact shadow treats it as the ground, so nothing rings it)
  add(g, plate(sq(R - T + 0.5), 0.8, 0.3), M.yard, 0, 2.2, 0);                                   // the yard, grey flagstones
  const GX = 16, GZ = R - T / 2;                                                                 // the gate, off-centre to the east
  add(g, plate([[GX - 6, 50], [GX + 6, 50], [GX + 7, 63], [GX - 7, 63]], 0.6, 0.2), M.path, 0, 2.0, 0).userData.ground = true; // the worn path out of the gate
  add(g, plate([[GX - 7, 2], [GX + 7, 4], [GX + 8, 50], [GX - 8, 50]], 0.5, 0.2), M.path, 0, 3.1, 0); // and across the yard
  // the curtain wall: a ring of ashlar with a walk and merlons
  add(g, ringPlate(sq(R + 1.5), sq(R - T - 1.5), 2.6), M.plinth, 0, 1.5, 0);
  add(g, ringPlate(sq(R), sq(R - T), 13), M.wall, 0, 2, 0);
  add(g, ringPlate(sq(R + 0.6), sq(R - T - 0.6), 1.2), M.plinth, 0, 15, 0);
  for (const [x0, z0, x1, z1] of [[-R, -R, R, -R], [R, -R, R, R], [R, R, -R, R], [-R, R, -R, -R]]) crenels(g, M.wall, x0 * 0.985, z0 * 0.985, x1 * 0.985, z1 * 0.985, 16.2);
  // two corner towers only (north-east, south-west), round, battlemented flat tops, a banner on each
  for (const [dx, dz] of [[1, -1], [-1, 1]]) {
    const x = dx * (R - 1), z = dz * (R - 1);
    add(g, cyl(7.6, 8.2, 26, 16), M.wall, x, 15, z); add(g, cyl(8.4, 8.4, 1.2, 16), M.plinth, x, 28.4, z);
    add(g, cyl(7.0, 7.0, 0.6, 16), M.wallDark, x, 29.0, z);
    roundCrenels(g, M.wall, x, z, 7.6, 29.2);
    banner(g, M, x, 29.6, z, 14, 14, 9);
  }
  // the keep at the north-west: tall and narrow, a square tower of slate with a parapet, four narrow team banners
  // down its south face between ink hems, arrow slits, an oak door; its great round tower at the south-east
  // corner, taller still, under the one big cone in team cloth, the great banner on top
  const KX = -22, KZ = -22, KW = 26, KH = 58;
  add(g, rbox(KW + 4, 4, KW + 4, 0.6), M.plinth, KX, 3, KZ);
  add(g, rbox(KW, KH, KW, 0.8), M.wall, KX, KH / 2 + 3, KZ);
  add(g, rbox(KW + 1.5, 1.5, KW + 1.5, 0.3), M.plinth, KX, KH + 3.5, KZ);
  for (const [x0, z0, x1, z1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) crenels(g, M.wall, KX + x0 * (KW / 2 - 1), KZ + z0 * (KW / 2 - 1), KX + x1 * (KW / 2 - 1), KZ + z1 * (KW / 2 - 1), KH + 4.2, 4.6, 2.2, 2);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1]]) { const x = KX + dx * KW / 2, z = KZ + dz * KW / 2; add(g, cyl(3.2, 3.6, KH + 7, 12), M.wallDark, x, KH / 2 + 4.5, z); roundCrenels(g, M.wall, x, z, 3.1, KH + 8.2, 6); } // three small bartizans
  for (const x of [-9, -3, 3, 9]) hanging(g, M, KX + x, KH - 2, KZ + KW / 2 + 0.5, 5.0, 40, -Math.PI / 2); // four narrow banners down the south face
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1]]) pennant(g, M, KX + dx * KW / 2, KH + 8.4, KZ + dz * KW / 2, 9, 8); // pennants on the bartizans
  for (const [x, y] of [[-10, 46], [10, 46], [0, 30]]) add(g, rbox(1.6, 5, 0.8, 0.2), M.inkLine, KX + x, y, KZ + KW / 2 + 0.3); // arrow slits
  add(g, rbox(6, 9, 1.2, 0.4), M.oak, KX, 7.5, KZ + KW / 2 + 0.6); for (const y of [5, 9.5]) add(g, rbox(6.4, 0.5, 0.4, 0.1), M.ironDark, KX, y, KZ + KW / 2 + 1.3); // the door
  const TX = KX + KW / 2 + 2, TZ = KZ + KW / 2 + 2, TH = 76;                                     // the great tower
  add(g, cyl(8.4, 9.2, TH, 20), M.wall, TX, TH / 2 + 3, TZ);
  for (const y of [24, 48]) add(g, cyl(9.2, 9.2, 1.2, 20), M.plinth, TX, y, TZ);                 // string courses
  add(g, cyl(9.4, 9.4, 1.4, 20), M.plinth, TX, TH + 3.6, TZ);
  add(g, cone(10, 15, 20), M.roof, TX, TH + 11.5, TZ); add(g, torus(9.8, 0.4, 20), M.inkLine, TX, TH + 4.3, TZ, Math.PI / 2, 0, 0); // the one big cone: slate (the buildings family: a team cone read as a team slab)
  add(g, cyl(8.1, 9.6, 2.4, 20), M.cloth, TX, TH + 5.6, TZ); add(g, torus(8.15, 0.3, 20), M.inkLine, TX, TH + 6.8, TZ, Math.PI / 2, 0, 0); // with a team band at its foot between ink rings
  banner(g, M, TX, TH + 19, TZ, 16, 22, 14);                                                    // the great banner, over everything (bigger: the flags carry the team now)
  for (const [a, y] of [[0.3, 36], [-0.4, 58], [0.9, 50]]) add(g, rbox(1.4, 5, 0.8, 0.2), M.inkLine, TX + Math.cos(a + Math.PI / 2) * 9.0, y, TZ + Math.sin(a + Math.PI / 2) * 9.0, 0, -a - Math.PI / 2, 0); // slits on the south side
  // the great hall along the east wall: slate walls under a slate gable along z, a chimney; windows and a door south
  const HX = 36, HZ = -4, HW = 22, HL = 56, HH = 14;
  add(g, rbox(HW + 3, 3, HL + 3, 0.5), M.plinth, HX, 2.5, HZ);
  add(g, rbox(HW, HH, HL, 0.6), M.wall, HX, HH / 2 + 2, HZ);
  add(g, gable(HW + 4, 13, HL + 4), M.roof, HX, HH + 2, HZ);
  add(g, rbox(1.6, 1.6, HL + 5, 0.4), M.oak, HX, HH + 15.2, HZ);
  add(g, rbox(4, 10, 4, 0.4), M.wallDark, HX + 6, HH + 14, HZ - 16); add(g, rbox(4.6, 1, 4.6, 0.2), M.plinth, HX + 6, HH + 19.4, HZ - 16);
  for (const x of [-7, 7]) add(g, rbox(3, 5, 0.8, 0.3), M.inkLine, HX + x, 9, HZ + HL / 2 + 0.3);
  add(g, rbox(6, 9, 1.0, 0.4), M.oak, HX, 6.5, HZ + HL / 2 + 0.6);
  hanging(g, M, HX, HH + 12, HZ + HL / 2 + 0.6, 10, 14, -Math.PI / 2);                            // a banner on the gable
  banner(g, M, HX, HH + 15.8, HZ - 20, 10, 9, 6);                                                 // a flag on the hall's ridge
  // the gatehouse, off-centre on the south wall: two round towers under team-cloth cones, the gate between, a team
  // banner over the arch, shields on the towers
  for (const x of [GX - 10, GX + 10]) {
    add(g, cyl(5.6, 6.2, 26, 16), M.wall, x, 15, GZ); add(g, cyl(6.4, 6.4, 1.2, 16), M.plinth, x, 28.4, GZ);
    add(g, cone(6.3, 9.4, 16), M.roof, x, 33.6, GZ); add(g, torus(6.1, 0.3, 16), M.inkLine, x, 29.2, GZ, Math.PI / 2, 0, 0); add(g, sph(0.8, 8, 6), M.steel, x, 38.6, GZ); // slate cones
    add(g, cyl(5.2, 6.0, 1.8, 16), M.cloth, x, 30.1, GZ); add(g, torus(5.25, 0.25, 16), M.inkLine, x, 31.0, GZ, Math.PI / 2, 0, 0);                              // a team band at each cone's foot
    add(g, cyl(2.8, 2.8, 0.5, 18), M.cloth, x, 11, GZ + 6.6, Math.PI / 2, 0, 0);                  // a shield
    add(g, torus(2.8, 0.35, 18), M.inkLine, x, 11, GZ + 6.65); add(g, sph(0.7, 8, 6), M.steel, x, 11, GZ + 7.0);
  }
  add(g, rbox(9, 20, T + 2, 0.5), M.wall, GX, 12, GZ);
  add(g, rbox(6, 9, 1.2, 0.4), M.oak, GX, 6.5, GZ + T / 2 + 1.2);
  for (const y of [4.5, 7.5, 10.5]) add(g, rbox(6.4, 0.5, 0.4, 0.1), M.ironDark, GX, y, GZ + T / 2 + 1.9);
  add(g, rbox(8.6, 10, 0.6, 0.15), M.cloth, GX, 17.4, GZ + T / 2 + 1.3);                          // the banner over the arch
  add(g, rbox(9.0, 0.5, 0.7, 0.05), M.inkLine, GX, 22.6, GZ + T / 2 + 1.3); add(g, rbox(9.0, 0.5, 0.7, 0.05), M.inkLine, GX, 12.2, GZ + T / 2 + 1.3);
  pennant(g, M, -R + 1, 16.2, R - 1, 10, 8); pennant(g, M, R - 1, 16.2, R - 1, 10, 8);             // pennants at the wall's south corners
  // the yard: banners on the north wall's inner face, a cart, crates, a well, barrels, a spear rack
  for (const x of [-6, 8, 22, 36]) hanging(g, M, x, 15.0, -R + T + 0.6, 12, 14, Math.PI / 2);
  for (const x of [-40, -24, 34, 46]) banner(g, M, x, 16.2, R - 3, 10, 14, 10);                     // flags on the south wall's walk, facing the camera
  const ct = grp(); ct.position.set(-30, 3, 26); ct.rotation.y = 0.5; g.add(ct);
  add(ct, rbox(13, 3.2, 8, 0.4), M.oak, 0, 4.4, 0);
  for (const z of [-4.5, 4.5]) { add(ct, cyl(3.4, 3.4, 0.9, 16), M.oak, 0, 3.4, z, Math.PI / 2, 0, 0); add(ct, torus(3.4, 0.35, 16), M.ironDark, 0, 3.4, z); }
  for (const x of [-3.5, 0, 3.5]) add(ct, sph(2.2, 10, 8), M.canvasDark, x, 7.2, (x / 3.5) * 1.4).scale.set(1, 0.8, 1);
  for (const z of [-2.8, 2.8]) add(ct, cyl(0.5, 0.5, 10, 6), M.oak, 10, 2.2, z, 0, 0, -1.2);
  for (const [x, z] of [[-12, 36], [-6, 40], [-9, 44], [-2, 36]]) add(g, rbox(3, 2.8, 3, 0.3), M.oak, x, 4.4, z);
  add(g, cyl(4.2, 4.6, 3.2, 14), M.plinth, 6, 3.6, 24); add(g, cyl(3.2, 3.2, 0.4, 14), M.oilskin, 6, 5.4, 24);
  for (const z of [-3, 3]) add(g, cyl(0.5, 0.5, 9, 6), M.oak, 6, 9.5, 24 + z); add(g, gable(9, 3, 4), M.roof, 6, 14, 24);
  for (const [x, z] of [[-44, 8], [-39, 12], [-41.5, 15]]) { add(g, cyl(2.4, 2.6, 5, 12), M.oak, x, 5.5, z); for (const y of [4.2, 7]) add(g, torus(2.65, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); }
  for (let k = 0; k < 6; k++) add(g, cyl(0.5, 0.5, 17, 6), M.oak, 14 + k * 2.1, 11.5, -40 - (k % 2), 0.1, 0, (k % 2 ? 1 : -1) * 0.1);
  for (let k = 0; k < 6; k++) add(g, cone(0.8, 2.6, 6), M.steel, 14 + k * 2.1, 20.8, -40 - (k % 2));
  if (M.polish) { // secondary detail: quoins at the hall's, gate's and bare wall corners, a string course and sills on the keep, corbel flares under the
    // towers' tops, buttresses on the hall, a portcullis in the gate, finials on the hall's ridge (round 2 dropped the door hinges and handles: not found at 4x)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) quoins(g, M, HX + sx * HW / 2, HZ + sz * HL / 2, 3, HH + 1.5);
    for (const sx of [-1, 1]) quoins(g, M, GX + sx * 4.5, GZ + 4.0, 3, 21, 3.0, 2.2, 1.3);
    quoins(g, M, -R, -R, 2.5, 15); quoins(g, M, R, R, 2.5, 15);
    add(g, rbox(KW + 1.2, 1.2, KW + 1.2, 0.2), M.plinth, KX, 32, KZ);
    for (const [x, y] of [[-10, 46], [10, 46], [0, 30]]) { add(g, rbox(2.6, 0.7, 1.0, 0.1), M.plinth, KX + x, y - 2.9, KZ + KW / 2 + 0.4); add(g, rbox(2.8, 0.7, 1.0, 0.1), M.plinth, KX + x, y + 2.9, KZ + KW / 2 + 0.4); }
    add(g, cyl(9.8, 9.0, 1.6, 20), M.plinth, TX, TH + 2.2, TZ);
    for (const [dx, dz] of [[1, -1], [-1, 1]]) add(g, cyl(8.6, 7.8, 1.4, 16), M.plinth, dx * (R - 1), 27.2, dz * (R - 1));
    for (const x of [GX - 10, GX + 10]) add(g, cyl(6.6, 5.9, 1.2, 16), M.plinth, x, 27.3, GZ);
    for (const x of [-9.5, 9.5]) { add(g, rbox(2.6, 11, 2.4, 0.3), M.wall, HX + x, 7.5, HZ + HL / 2 + 1.0); add(g, rbox(2.8, 1.0, 2.8, 0.2), M.plinth, HX + x, 13.3, HZ + HL / 2 + 1.0); }
    for (const z of [-18, 0, 18]) for (const sx of [-1, 1]) { add(g, rbox(2.4, 11, 2.6, 0.3), M.wall, HX + sx * (HW / 2 + 1.0), 7.5, HZ + z); add(g, rbox(2.8, 1.0, 2.8, 0.2), M.plinth, HX + sx * (HW / 2 + 1.0), 13.3, HZ + z); }
    for (const x of [-2.1, -0.7, 0.7, 2.1]) add(g, rbox(0.45, 9.6, 0.45, 0.1), M.ironDark, GX + x, 6.8, GZ + T / 2 + 2.2);
    for (const y of [3.5, 6.5, 9.5]) add(g, rbox(6.4, 0.45, 0.45, 0.1), M.ironDark, GX, y, GZ + T / 2 + 2.2);
    for (const sz of [-1, 1]) add(g, sph(0.9, 8, 6), M.steel, HX, HH + 15.6, HZ + sz * (HL / 2 + 2.6));
  }
  return g;
}
