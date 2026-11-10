// The kingdom (the re-theme's medieval people, standing in for the Harbour in the comparison picture; not in the
// game's atlas: tools/art/retheme-compare.mjs renders it by filter through retheme.js). Stone, timber, cloth and steel:
// a kingdom thing is a darker body (stone, oak, wool) with pale steel on top and team colour on cloth between dark
// hems, so in greyscale it keeps the Harbour's order against the Company's pale composite. Three palettes, same shapes
// (`makeKingdomMats(tc, v)`): A sandstone and clay tiles with bright steel, B granite and slate with blackened iron,
// C a timber keep with thatch. Same conventions as models.js: game units, units face +x, y up, +z south.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './models.js';
import { makeMats, team } from './materials.js';
import { lathe, torus } from './harbour.js';
import { cone } from './vael.js';

// ---------------- textures (light bases: the material colour darkens them) ----------------
function tex(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 17; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Ashlar: courses of squared blocks, each its own tone, mortar lines between, a few chips. */
const ashlarTex = tex(256, (g, n) => {
  g.fillStyle = '#d6d0c4'; g.fillRect(0, 0, n, n); seed = 17;
  for (let y = 0; y < n; y += 32) { const o = (y / 32) % 2 ? 24 : 0; for (let x = -48; x < n; x += 48) { const v = 196 + rnd() * 50; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x + o, y, 48, 32); } }
  for (let i = 0; i < 2600; i++) { const v = 170 + rnd() * 80; g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(60,52,44,0.75)'; g.lineWidth = 2.2;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(n, y + 0.5); g.stroke(); const o = (y / 32) % 2 ? 24 : 0; for (let x = o; x < n + 48; x += 48) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 32); g.stroke(); } }
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 2.5); g.lineTo(n, y + 2.5); g.stroke(); }
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(70,60,50,${0.08 + rnd() * 0.14})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 3 + rnd() * 12, 2 + rnd() * 6, rnd() * 3, 0, 7); g.fill(); }
}, { repeat: 2 });
const ashlarBump = tex(256, (g, n) => {
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
const thatchTex = tex(128, (g, n) => {
  g.fillStyle = '#d8c89c'; g.fillRect(0, 0, n, n); seed = 43;
  for (let i = 0; i < 900; i++) { const v = 150 + rnd() * 100, x = rnd() * n, y = rnd() * n; g.strokeStyle = `rgba(${v},${v - 20},${v - 60},0.5)`; g.lineWidth = 0.8 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + 6 + rnd() * 12); g.stroke(); }
  for (let y = 40; y < n + 40; y += 40) { g.fillStyle = 'rgba(70,50,20,0.35)'; g.fillRect(0, y - 4, n, 4); g.fillStyle = 'rgba(255,240,200,0.2)'; g.fillRect(0, y, n, 2); }
}, { repeat: 3 });
/** Planks: upright boards with dark seams, grain and a nail here and there. */
const plankTex = tex(128, (g, n) => {
  g.fillStyle = '#d2bc96'; g.fillRect(0, 0, n, n); seed = 53;
  for (let x = 0; x < n; x += 16) { const v = 180 + rnd() * 50; g.fillStyle = `rgb(${v},${v - 18},${v - 50})`; g.fillRect(x, 0, 16, n); }
  for (let i = 0; i < 70; i++) { const x = rnd() * n; g.strokeStyle = `rgba(80,50,20,${0.12 + rnd() * 0.3})`; g.lineWidth = 0.6 + rnd(); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 4 - 2, n / 3, x + rnd() * 4 - 2, 2 * n / 3, x + rnd() * 2 - 1, n); g.stroke(); }
  g.fillStyle = 'rgba(40,25,10,0.85)'; for (let x = 0; x < n; x += 16) g.fillRect(x, 0, 2, n);
  g.fillStyle = 'rgba(30,30,30,0.7)'; for (let x = 8; x < n; x += 16) for (const y of [20, 100]) { g.beginPath(); g.arc(x, y + (x % 32 ? 6 : 0), 1.4, 0, 7); g.fill(); }
}, { repeat: 2 });
const plankBump = tex(128, (g, n) => { g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); g.fillStyle = '#404040'; for (let x = 0; x < n; x += 16) g.fillRect(x, 0, 2, n); }, { srgb: false, repeat: 2 });
/** Wicker: the dosser's weave. */
const wickerTex = tex(64, (g, n) => { g.fillStyle = '#d8c090'; g.fillRect(0, 0, n, n); g.fillStyle = 'rgba(60,40,10,0.35)'; for (let y = 0; y < n; y += 6) g.fillRect(0, y, n, 2); g.fillStyle = 'rgba(60,40,10,0.25)'; for (let x = 0; x < n; x += 10) for (let y = 0; y < n; y += 12) g.fillRect(x + (y % 24 ? 5 : 0), y, 2, 12); }, { repeat: 4 });

// ---------------- the palettes ----------------
/** A: warm sandstone, clay tiles, oak, bright steel, undyed linen. B: dark granite, slate, blackened iron, grey wool.
 *  C: a timber keep (oak planks on a stone plinth), thatch, bright steel, brown wool. */
export const KINGDOM_PALETTES = {
  A: { name: 'sandstone and clay', wall: 0xb09468, wallTex: 'ashlar', roof: 0xa05238, roofTex: 'tile', timber: 0x7a5536, steel: 0xb8bcc2, steelMetal: 0.92, steelRough: 0.3, mail: 0x6e7278, tunic: 0xc4b898, wicker: 0xc8aa70, hose: 0x5a3e2a, leather: 0x4a3222, plinth: 0x8a7a62 },
  B: { name: 'granite and slate', wall: 0x5c5e62, wallTex: 'ashlar', roof: 0x3a3e46, roofTex: 'slate', timber: 0x463622, steel: 0x6c7076, steelMetal: 0.85, steelRough: 0.42, mail: 0x4a4e54, tunic: 0x7c786e, wicker: 0xa89060, hose: 0x2e2a28, leather: 0x2a2220, plinth: 0x46484c },
  C: { name: 'timber and thatch', wall: 0x7a5636, wallTex: 'plank', roof: 0xb09460, roofTex: 'thatch', timber: 0x5a4028, steel: 0xb8bcc2, steelMetal: 0.92, steelRough: 0.3, mail: 0x6e7278, tunic: 0x8a6a48, wicker: 0xb89a60, hose: 0x3a2c22, leather: 0x3a2818, plinth: 0x6a6a64 },
};
const ROOF_TEX = { tile: tileTex, slate: slateTex, thatch: thatchTex };
/** The kingdom's materials for a palette `v`, over the Harbour's set (its team canvas, ink, rope, brass and timber
 *  grain are reused: `paintCanvas` is the team cloth, `inkLine` the hem either side of it). */
export function makeKingdomMats(tc, v = 'A') {
  const P = KINGDOM_PALETTES[v], M = makeMats(tc), std = (o) => new THREE.MeshStandardMaterial(o);
  M.wall = P.wallTex === 'plank' ? std({ color: P.wall, map: plankTex, bumpMap: plankBump, bumpScale: 1.2, roughness: 0.85 }) : std({ color: P.wall, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.4, roughness: 0.9 });
  M.wallDark = M.wall.clone(); M.wallDark.color.multiplyScalar(0.72);
  M.plinth = std({ color: P.plinth, map: ashlarTex, bumpMap: ashlarBump, bumpScale: 1.2, roughness: 0.92 });
  M.roof = std({ color: P.roof, map: ROOF_TEX[P.roofTex], roughness: P.roofTex === 'slate' ? 0.6 : 0.9, metalness: P.roofTex === 'slate' ? 0.15 : 0 });
  M.oak = std({ color: P.timber, map: M.timber.map, roughness: 0.82 });
  M.steel = std({ color: P.steel, metalness: P.steelMetal, roughness: P.steelRough });
  M.mail = std({ color: P.mail, map: M.sandbag.map, metalness: 0.7, roughness: 0.55 });
  M.tunic = std({ color: P.tunic, map: M.canvas.map, roughness: 0.92 });
  M.wicker = std({ color: P.wicker, map: wickerTex, roughness: 0.95 });
  M.hose = std({ color: P.hose, roughness: 0.9 });
  M.leather = std({ color: P.leather, roughness: 0.6, metalness: 0.1 });
  M.skin = std({ color: 0xc89a74, roughness: 0.8 });
  M.gold = std({ color: 0xe0b040, metalness: 0.95, roughness: 0.32 });
  M.cobble = std({ color: 0x5c5a54, map: M.flagstone.map, bumpMap: M.flagstone.bumpMap, bumpScale: 1, roughness: 0.9 });
  M.cloth = M.paintCanvas;                                                                                       // the team cloth, between `inkLine` hems
  M.clothPale = std({ color: 0xd8d0ba, map: M.canvas.map, roughness: 0.9 });                                       // the pavilion's pale stripes
  return M;
}

// ---------------- helpers ----------------
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
/** A gable roof: a triangular prism along z, `w` wide, `h` high, `len` long, its ridge at y = h. */
const gable = (w, h, len) => memo(`gb${w},${h},${len}`, () => { const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]); const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); g.computeVertexNormals(); return boxUV(g); });
/** A ring of wall between two outlines, `h` tall. */
const ringPlate = (outer, inner, h) => memo(`rp${JSON.stringify([outer, inner, h])}`, () => { const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z))); s.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z)))); const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return boxUV(g); });
const sq = (r) => [[-r, -r], [r, -r], [r, r], [-r, r]];
/** Merlons along a wall's top from (x0, z0) to (x1, z1): a tooth every `step`. */
function crenels(g, M, x0, z0, x1, z1, y, step = 5.2, w = 2.6, t = 2.2) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / step), a = Math.atan2(z1 - z0, x1 - x0);
  for (let k = 0; k <= n; k++) { const u = k / Math.max(1, n); add(g, rbox(w, 2.4, t, 0.3), M, x0 + (x1 - x0) * u, y + 1.2, z0 + (z1 - z0) * u, 0, -a, 0); }
}
/** A hanging team cloth on a wall face: the cloth between two ink hems, hung from a pole with knobs. */
function hanging(g, M, x, y, z, w, h, ry = 0) {
  const p = grp(); p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
  add(p, rbox(0.5, h, w, 0.1), M.cloth, 0, -h / 2, 0);
  add(p, rbox(0.6, 0.5, w + 0.3, 0.05), M.inkLine, 0, -0.2, 0); add(p, rbox(0.6, 0.5, w + 0.3, 0.05), M.inkLine, 0, -h + 0.2, 0);
  add(p, cyl(0.4, 0.4, w + 2, 8), M.oak, 0.2, 0.3, 0, Math.PI / 2, 0, 0);
}
/** A pennant on a staff: a team triangle flying south, edge-on to nothing (a plate turned to face the camera). */
function pennant(g, M, x, y, z, h = 14, L = 9) {
  add(g, cyl(0.35, 0.45, h, 6), M.oak, x, y + h / 2, z); add(g, sph(0.6, 8, 6), M.steel, x, y + h + 0.3, z);
  add(g, plate([[0, -2.2], [L, -0.5], [L, 0.5], [0, 2.2]], 0.4, 0.1), M.cloth, x + 0.3, y + h - 0.6, z, Math.PI / 2, 0, 0);
}

/** A figure in a tunic and hose: legs by frame (two strides), the body group `body` to hang gear on; the head at
 *  y 13.5. The tunic's skirt flares to `skirt`. */
function figure(M, f, { tunic = M.tunic, hose = M.hose, skirt = 4.0 } = {}) {
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

/** Peasant (worker, sim r 9, scale 0.95): the one that carries: a tall wicker dosser on the back heaped with gold
 *  coins, two team straps over the shoulders, a team hood with a short cape over a plain tunic, a team tabard down
 *  the front, a short spade in the right hand, the body leant forward under the load. From above: a round pale
 *  basket with a yellow top beside a small team head. Frames 0-1 the walk. */
export function peasant(M, f) {
  const g = figure(M, f), b = g.body; b.rotation.z = -0.12;
  // the hood: team cloth over the head, a short cape to the shoulders, ink hems at the face and the cape's edge
  add(b, sph(2.5, 16, 12), M.cloth, 0.1, 13.7, 0).scale.set(0.95, 1.0, 1.0);
  add(b, cyl(2.6, 3.7, 2.4, 14), M.cloth, 0.1, 11.9, 0);                                      // the cape
  add(b, cyl(3.8, 3.9, 0.4, 14), M.inkLine, 0.1, 10.7, 0);                                    // its hem
  add(b, sph(1.45, 12, 10), M.skin, 1.5, 13.3, 0).scale.set(0.8, 0.9, 0.9);                   // the face in the hood's opening
  add(b, torus(1.5, 0.25, 14), M.inkLine, 1.9, 13.3, 0, 0, Math.PI / 2, 0);                   // the opening's ink edge
  // the tabard down the front, team between ink hems
  add(b, rbox(0.6, 5.2, 4.0, 0.2), M.cloth, 2.6, 9.4, 0);
  add(b, rbox(0.7, 0.4, 4.3, 0.1), M.inkLine, 2.65, 12.1, 0); add(b, rbox(0.7, 0.4, 4.3, 0.1), M.inkLine, 2.65, 6.7, 0);
  // the dosser: a tall wicker basket on the back, its rim bound in oak, heaped with coins; two team straps over the shoulders
  const bk = grp(); bk.position.set(-4.0, 11.6, 0); bk.rotation.z = 0.18; b.add(bk);
  add(bk, cyl(3.3, 2.5, 7.6, 14), M.wicker, 0, 0, 0);
  add(bk, torus(3.3, 0.4, 16), M.oak, 0, 3.8, 0, Math.PI / 2, 0, 0);                          // the rim
  add(bk, torus(2.9, 0.3, 16), M.oak, 0, 0.4, 0, Math.PI / 2, 0, 0);                          // a hoop
  add(bk, sph(3.0, 14, 10), M.gold, 0, 4.0, 0).scale.set(1, 0.42, 1);                         // the coins heaped over the rim
  for (const [x, z] of [[1.4, 1.2], [-1.0, -1.6], [0.4, -0.2]]) add(bk, cyl(0.9, 0.9, 0.3, 10), M.gold, x, 5.3, z, (x - z) * 0.2, x, 0.2);
  for (const z of [-2.0, 2.0]) {                                                             // the straps
    add(b, rbox(4.6, 0.9, 1.5, 0.2), M.cloth, -0.2, 13.0, z, 0, 0, -0.1);
    add(b, rbox(4.8, 1.0, 1.8, 0.1), M.inkLine, -0.2, 12.75, z, 0, 0, -0.1);
    add(b, rbox(0.9, 4.0, 1.5, 0.2), M.cloth, 2.5, 10.8, z); add(b, rbox(1.0, 4.2, 1.8, 0.1), M.inkLine, 2.35, 10.8, z);
  }
  // the left hand up on a strap; the right arm down with a short spade, its blade pale steel low ahead
  limb(b, [0.6, 11, -3.6], [2.6, 11.6, -2.6], 1.15, M.tunic); add(b, sph(0.9, 8, 6), M.skin, 2.9, 11.6, -2.5);
  limb(b, [0.6, 11, 3.6], [2.2, 7.4, 3.9], 1.15, M.tunic); add(b, sph(0.9, 8, 6), M.skin, 2.4, 7.0, 3.9);
  add(b, cyl(0.4, 0.4, 5.4, 8), M.oak, 3.6, 5.6, 4.0, 0, 0, -0.9);                            // the handle, down and ahead
  add(b, rbox(2.0, 0.5, 2.6, 0.15), M.steel, 5.6, 3.1, 4.1, 0, 0, 0.5);                       // the blade
  g.scale.setScalar(0.95);
  return g;
}

/** Man-at-arms (line infantry, sim r 10-11, scale 1.08): a spearman under a steel kettle hat (the pale disc from
 *  above, a dark line under its brim, no cloth on it), a team surcoat over mail between ink hems, mail sleeves, a
 *  round team shield with an ink rim and a steel boss on the left arm, tilted up so its face shows from above, a
 *  long spear angled up ahead in the right hand: an oak shaft with a steel leaf head. From above: a pale disc, a
 *  team disc beside it, a long thin bar. Frames 0-1 the march. */
export function manAtArms(M, f) {
  const g = figure(M, f, { tunic: M.cloth, skirt: 4.2 }), b = g.body;
  add(b, cyl(4.3, 4.4, 0.45, 12), M.inkLine, 0, 5.65, 0);                                     // the surcoat's hem
  add(b, rbox(5.3, 0.4, 6.9, 0.1), M.inkLine, 0, 13.1, 0);                                    // its collar's edge
  add(b, sph(2.2, 14, 10), M.mail, 0.3, 13.4, 0);                                             // the mail coif
  add(b, sph(1.4, 12, 10), M.skin, 1.6, 13.1, 0).scale.set(0.8, 0.9, 0.9);                    // the face
  const hat = grp(); hat.position.set(0.3, 14.9, 0); b.add(hat);                              // the kettle hat
  add(hat, lathe([[0, 0], [4.2, 0], [4.3, 0.4], [3.1, 0.75], [2.95, 2.5], [1.9, 3.4], [0, 3.7]]), M.steel, 0, 0, 0);
  add(hat, cyl(4.3, 4.3, 0.35, 24), M.inkLine, 0, -0.15, 0);                                  // the dark line under the brim
  add(hat, torus(3.05, 0.22, 20), M.inkLine, 0, 0.75, 0, Math.PI / 2, 0, 0);                  // a dark seam at the crown's foot
  // the shield on the left arm, its face tilted up and out
  const sh = grp(); sh.position.set(0.8, 10.4, -4.4); sh.rotation.x = -Math.PI / 2 + 1.0; sh.rotation.z = 0.15; b.add(sh);
  add(sh, cyl(3.9, 3.9, 0.7, 24), M.oak, 0, 0, 0);                                            // the board
  add(sh, cyl(3.4, 3.4, 0.5, 24), M.cloth, 0, 0.3, 0);                                        // the team face
  add(sh, torus(3.65, 0.38, 24), M.inkLine, 0, 0.35, 0, Math.PI / 2, 0, 0);                   // the ink rim
  add(sh, sph(1.0, 10, 8), M.steel, 0, 0.5, 0);                                               // the boss
  limb(b, [0.6, 11, -3.6], [1.2, 9.8, -4.0], 1.15, M.mail);
  // the spear in the right hand, angled up ahead: an oak shaft, a steel leaf head
  const sp = grp(); sp.position.set(0.8, 10.0, 3.4); sp.rotation.z = 0.78; b.add(sp);
  add(sp, cyl(0.42, 0.42, 24, 8), M.oak, 4.5, 0, 0, 0, 0, Math.PI / 2);
  add(sp, cyl(0.6, 0.6, 1.2, 8), M.steel, 16.4, 0, 0, 0, 0, Math.PI / 2);                     // the socket
  add(sp, cone(1.0, 4.4, 8), M.steel, 19.2, 0, 0, 0, 0, -Math.PI / 2).scale.set(1, 1, 0.45);  // the leaf head
  add(sp, cyl(0.6, 0.5, 1.0, 8), M.steel, -7.8, 0, 0, 0, 0, Math.PI / 2);                     // the butt's ferrule
  limb(b, [0.6, 11, 3.6], [2.6, 10.6, 3.6], 1.15, M.mail); add(b, sph(0.9, 8, 6), M.skin, 2.9, 10.5, 3.5);
  g.scale.setScalar(1.08);
  return g;
}

/** Keep (the main building, 4x4): a square stone keep with corner turrets and a pyramid roof at the north-west, a
 *  great hall under a gable roof at the north-east, a crenellated curtain wall round a cobbled yard, a gatehouse of
 *  two round towers on the south wall, and in the yard a round pavilion and a long marquee in team cloth with pale
 *  stripes, hangings down the keep's south and east faces, pennants, shields on the gate, a cart of coin sacks, a
 *  well, barrels and hay. Team: the tents, the hangings, the pennants, the gate's banner and shields, the cart's
 *  cover, all between ink hems; the roofs are stone's and timber's own colours. */
export function keep(M) {
  const g = grp(), R = 58, T = 7;
  add(g, plate(sq(R - T + 0.5).map(([x, z]) => [x, z]), 2.5, 0.8), M.cobble, 0, 0, 0);          // the cobbled yard
  // the curtain wall: a ring of ashlar with a walk and merlons, the plinth a step out
  add(g, ringPlate(sq(R + 1.5), sq(R - T - 1.5), 2.2), M.plinth, 0, 0, 0);
  add(g, ringPlate(sq(R), sq(R - T), 12), M.wall, 0, 0, 0);
  add(g, ringPlate(sq(R + 0.6), sq(R - T - 0.6), 1.2), M.plinth, 0, 12, 0);                     // the walk's coping
  for (const [x0, z0, x1, z1] of [[-R, -R, R, -R], [R, -R, R, R], [R, R, -R, R], [-R, R, -R, -R]]) crenels(g, M.wall, x0 * 0.985, z0 * 0.985, x1 * 0.985, z1 * 0.985, 13.2);
  // the keep at the north-west: a square tower, corner turrets, a parapet, a pyramid roof, a hanging on two faces
  const KX = -24, KZ = -22, KW = 36, KH = 44;
  add(g, rbox(KW + 4, 4, KW + 4, 0.6), M.plinth, KX, 2, KZ);
  add(g, rbox(KW, KH, KW, 0.8), M.wall, KX, KH / 2 + 2, KZ);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {                                // the corner turrets
    add(g, cyl(4.2, 4.6, KH + 6, 14), M.wallDark, KX + dx * KW / 2, KH / 2 + 4, KZ + dz * KW / 2);
    add(g, cone(5.2, 7, 14), M.roof, KX + dx * KW / 2, KH + 10.5, KZ + dz * KW / 2);
    add(g, sph(0.7, 8, 6), M.steel, KX + dx * KW / 2, KH + 14.2, KZ + dz * KW / 2);
  }
  add(g, rbox(KW + 1.5, 1.5, KW + 1.5, 0.3), M.plinth, KX, KH + 2.5, KZ);                       // the parapet's string course
  for (const [x0, z0, x1, z1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) crenels(g, M.wall, KX + x0 * (KW / 2 - 4.5), KZ + z0 * (KW / 2 - 1), KX + x1 * (KW / 2 - 4.5), KZ + z1 * (KW / 2 - 1), KH + 3.2, 5, 2.4, 2);
  add(g, cone(KW * 0.6, 16, 4), M.roof, KX, KH + 11, KZ, 0, Math.PI / 4, 0);                   // the pyramid roof
  add(g, cyl(0.5, 0.6, 7, 6), M.oak, KX, KH + 22, KZ); add(g, sph(0.8, 8, 6), M.steel, KX, KH + 25.6, KZ);
  pennant(g, M, KX, KH + 19, KZ, 10, 9);
  for (const [x, z] of [[KX - 8, KZ + KW / 2 + 0.1], [KX + 8, KZ + KW / 2 + 0.1], [KX + KW / 2 + 0.1, KZ + 6]]) add(g, rbox(2.2, 6, 0.8, 0.2), M.inkLine, x, 30, z, 0, x > KX + KW / 2 - 1 ? Math.PI / 2 : 0, 0); // arrow slits
  hanging(g, M, KX + KW / 2 + 0.5, KH - 2, KZ - 6, 14, 26);                                       // the hanging down the east face
  hanging(g, M, KX, KH - 2, KZ + KW / 2 + 0.5, 16, 26, -Math.PI / 2);                              // and the south face
  add(g, rbox(7, 10, 1.2, 0.4), M.oak, KX, 7, KZ + KW / 2 + 0.6);                                 // the keep's door
  // the great hall at the north-east: stone walls under a steep gable roof along z, a chimney, a lean-to porch
  const HX = 26, HZ = -20, HW = 28, HL = 50, HH = 16;
  add(g, rbox(HW + 3, 3, HL + 3, 0.5), M.plinth, HX, 1.5, HZ);
  add(g, rbox(HW, HH, HL, 0.6), M.wall, HX, HH / 2 + 1, HZ);
  add(g, gable(HW + 4, 14, HL + 4), M.roof, HX, HH + 1, HZ);
  add(g, rbox(1.6, 1.6, HL + 5, 0.4), M.oak, HX, HH + 15.2, HZ);                                 // the ridge beam
  for (const z of [-18, -6, 6, 18]) add(g, rbox(HW + 4.6, 1.0, 1.0, 0.2), M.oak, HX, HH + 0.9, HZ + z); // the eaves' tie beams
  add(g, rbox(4, 10, 4, 0.4), M.wallDark, HX + 9, HH + 14, HZ - 14); add(g, rbox(4.6, 1, 4.6, 0.2), M.plinth, HX + 9, HH + 19.4, HZ - 14); // the chimney
  for (const x of [-9, -3, 3, 9]) add(g, rbox(3, 5, 0.8, 0.3), M.inkLine, HX + x, 10, HZ + HL / 2 + 0.3);    // windows on the south gable's wall
  add(g, rbox(6, 9, 1.0, 0.4), M.oak, HX - 6, 5.5, HZ + HL / 2 + 0.6);                           // the hall's door
  // the gatehouse on the south wall: two round towers flanking the gate, a team banner over the arch, shields hung
  const GZ = R - T / 2;
  for (const x of [-11, 11]) { add(g, cyl(6, 6.6, 22, 16), M.wall, x, 11, GZ); add(g, cyl(6.8, 6.8, 1.2, 16), M.plinth, x, 22.2, GZ); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; add(g, rbox(2.2, 2.2, 1.8, 0.3), M.wall, x + Math.cos(a) * 6, 23.6, GZ + Math.sin(a) * 6, 0, -a, 0); } }
  add(g, rbox(12, 20, T + 2, 0.5), M.wall, 0, 10, GZ);                                           // the gate's block
  add(g, rbox(7, 9, 1.2, 0.4), M.oak, 0, 4.5, GZ + T / 2 + 1.2);                                 // the gate, oak
  for (const y of [2.5, 5.5, 8.5]) add(g, rbox(7.4, 0.5, 0.4, 0.1), M.ironDark, 0, y, GZ + T / 2 + 1.9);  // its iron bands
  add(g, rbox(9, 7, 0.6, 0.15), M.cloth, 0, 15.5, GZ + T / 2 + 1.3);                             // the banner over the arch
  add(g, rbox(9.4, 0.5, 0.7, 0.05), M.inkLine, 0, 19.2, GZ + T / 2 + 1.3); add(g, rbox(9.4, 0.5, 0.7, 0.05), M.inkLine, 0, 11.8, GZ + T / 2 + 1.3);
  for (const x of [-11, 11]) {                                                                   // a shield on each tower's south face
    add(g, cyl(2.8, 2.8, 0.5, 18), M.cloth, x, 14, GZ + 6.7, Math.PI / 2, 0, 0);
    add(g, torus(2.8, 0.35, 18), M.inkLine, x, 14, GZ + 6.75); add(g, sph(0.7, 8, 6), M.steel, x, 14, GZ + 7.1);
    pennant(g, M, x, 24.5, GZ, 10, 8);
  }
  // the yard: a round pavilion and a long marquee in team cloth with pale stripes, a well, a cart of coin sacks,
  // barrels, a hay stack, a rack of spears
  const pav = grp(); pav.position.set(-30, 0, 26); g.add(pav);                                  // the pavilion
  add(pav, cyl(10, 10.5, 7, 24), M.cloth, 0, 5.5, 0);
  add(pav, cyl(10.7, 10.7, 0.5, 24), M.inkLine, 0, 9.1, 0); add(pav, cyl(10.7, 10.7, 0.5, 24), M.inkLine, 0, 2.2, 0);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; add(pav, rbox(0.4, 7, 2.6, 0.1), k % 2 ? M.clothPale : M.cloth, Math.cos(a) * 10.3, 5.5, Math.sin(a) * 10.3, 0, -a, 0); }
  add(pav, cone(11.4, 9, 24), M.cloth, 0, 13.6, 0);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(pav, rbox(11.4, 0.4, 1.6, 0.1), M.clothPale, Math.cos(a) * 5.7, 13.65, Math.sin(a) * 5.7, 0, -a, -0.67).scale.set(1, 1, 1); } // pale gores
  add(pav, cyl(0.4, 0.4, 5, 6), M.oak, 0, 20, 0); add(pav, plate([[0, -1.6], [5, -0.4], [5, 0.4], [0, 1.6]], 0.3, 0.1), M.cloth, 0.3, 21.8, 0, Math.PI / 2, 0, 0);
  const mq = grp(); mq.position.set(16, 0, 28); g.add(mq);                                       // the marquee
  add(mq, rbox(34, 6, 18, 0.4), M.cloth, 0, 4, 0);
  add(mq, rbox(34.4, 0.5, 18.4, 0.1), M.inkLine, 0, 7.1, 0); add(mq, rbox(34.4, 0.5, 18.4, 0.1), M.inkLine, 0, 1.3, 0);
  add(mq, gable(19.5, 8, 35), M.cloth, 0, 7.3, 0, 0, Math.PI / 2, 0);
  for (const x of [-12, -4, 4, 12]) add(mq, rbox(2.4, 8.6, 20.6, 0.1), M.clothPale, x, 7.3, 0).scale.set(1, 1, 0.98); // pale stripes over the ridge
  add(mq, rbox(36, 0.5, 20, 0.1), M.inkLine, 0, 7.4, 0);                                            // the ink hem under the roof's eave
  add(mq, rbox(1.4, 1.4, 36.5, 0.3), M.oak, 0, 15.3, 0);                                            // the ridge pole
  for (const x of [-17.5, 17.5]) for (const z of [-9, 9]) add(mq, cyl(0.4, 0.5, 8, 6), M.oak, x, 4, z);
  // the well: a stone ring with a timber frame and a bucket
  add(g, cyl(4.2, 4.6, 3.2, 14), M.plinth, 8, 1.6, 2); add(g, cyl(3.2, 3.2, 0.4, 14), M.oilskin, 8, 3.4, 2);
  for (const z of [-3, 3]) add(g, cyl(0.5, 0.5, 9, 6), M.oak, 8, 7.5, 2 + z); add(g, gable(9, 3, 4), M.roof, 8, 12, 2);
  add(g, cyl(0.5, 0.5, 6.5, 6), M.oak, 8, 10.5, 2, Math.PI / 2, 0, 0); add(g, cyl(1.1, 0.9, 1.8, 10), M.ironDark, 8, 6.8, 2);
  // the cart: an oak cart on two wheels, coin sacks under a team cover, its shafts resting on the ground
  const ct = grp(); ct.position.set(-34, 0, -2); ct.rotation.y = 0.5; g.add(ct);
  add(ct, rbox(13, 3.2, 8, 0.4), M.oak, 0, 4.4, 0);
  for (const z of [-4.5, 4.5]) { add(ct, cyl(3.4, 3.4, 0.9, 16), M.oak, 0, 3.4, z, Math.PI / 2, 0, 0); add(ct, torus(3.4, 0.35, 16), M.ironDark, 0, 3.4, z); }
  for (const x of [-3.5, 0, 3.5]) add(ct, sph(2.2, 10, 8), M.canvas, x, 7.2, (x / 3.5) * 1.4).scale.set(1, 0.8, 1); // the sacks
  add(ct, rbox(12.6, 0.8, 7.8, 0.4), M.cloth, 0, 8.4, 0); add(ct, rbox(13, 0.4, 8.2, 0.1), M.inkLine, 0, 7.9, 0);    // the cover over them
  for (const z of [-2.8, 2.8]) add(ct, cyl(0.5, 0.5, 10, 6), M.oak, 10, 2.2, z, 0, 0, -1.2);                          // the shafts down
  // barrels, a hay stack, spears in a rack, a stair to the walk
  for (const [x, z] of [[38, 24], [43, 28], [40.5, 31]]) { add(g, cyl(2.4, 2.6, 5, 12), M.oak, x, 2.5, z); for (const y of [1.2, 4]) add(g, torus(2.65, 0.25, 12), M.ironDark, x, y, z, Math.PI / 2, 0, 0); }
  add(g, cone(7, 9, 12), M.roof, 42, 4.5, 12).scale.set(1, 1, 0.9); add(g, cyl(6.2, 6.6, 1.6, 12), M.oak, 42, 0.8, 12); // the hay
  for (let k = 0; k < 6; k++) add(g, cyl(0.3, 0.3, 17, 6), M.oak, -44 + k * 2.1, 8.5, 42 - (k % 2), 0.1, 0, (k % 2 ? 1 : -1) * 0.1);
  for (let k = 0; k < 6; k++) add(g, cone(0.6, 2.4, 6), M.steel, -44 + k * 2.1, 17.8, 42 - (k % 2));
  for (let k = 0; k < 6; k++) add(g, rbox(5, 2, 2, 0.2), M.plinth, R - T - 3, 1 + k * 2, 30 - k * 2.2);           // the stair
  return g;
}
