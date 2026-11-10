// The re-theme's polish (a style test on the slice's eight pieces, 2026-11-10; Stelian: "more polished, more detail,
// less like drawings"). Three layers, every one an option the atlas never sees: (1) `finishPolish`, the finish with a
// depth pass behind it and its own lights (round 2: a stronger key against less fill, so every piece has a lit and a
// dark side at 1x): ambient occlusion in creases and where parts meet, a crisp dark contact ellipse under whatever
// stands on the ground, on the sun's lee side only (round 1's soft all-round shadow ringed the buildings like a
// sticker's glow; a building's earth plate is marked `userData.ground` and counts as ground), the hard cast shadow
// kept crisp, a lit rim on the edges that face the sun (up-left on screen), ink only where a nearer part ends against
// a farther one and lighter on the silhouette, 6-bit banding; (2) `polishMats`, high-contrast course textures on
// stone, slate, shingle and board (so the courses survive 1x), roofs pushed apart from walls by value, tighter and
// brighter speculars on steel, gold and glass, and bump texture on the flat materials; (3) the models' own secondary
// detail under `M.polish` in kingdom.js and expedition.js, only what reads at 2x (tack, bindings, quoins, buttresses,
// fan rings, cables...). scene.js `shoot(..., { polish })` runs (1); retheme.js passes `polish` to the mats for (2)
// and (3). `POLISH` holds every setting of (1); pass an object as `polish` to override any.
import * as THREE from 'three';

export const POLISH = {
  lights: { sun: 5.4, hemi: 0.12, env: 0.10, rim: 1.0, fill: 1.3 }, // the key against less fill (the atlas: 4.6, 0.28, 0.22, 1.5, no fill); `fill` from the south-west, so a thing's camera side has a lit and a dark half
  ao: { radius: 10, range: 1.5, bias: 0.3, maxH: 16, strength: 1.0 }, // occlusion between parts: a step of `range` view units darkens fully, fading out by maxH
  contact: { radius: 5, squash: 0.7, hMin: 0.15, hMax: 3.5, lee: -1, alpha: 120 }, // a crisp dark ellipse (radius px, squashed to the ground's foreshortening) under every part that stands on the ground (its pixels between hMin and hMax game units up), on the sun's lee side only (dx + dy >= lee: the sun is north-west)
  rim: { gain: 0.45, bias: 1.0 },  // the lit edge: a model pixel whose up or left neighbour is farther by `bias` or is the sky
  ink: { edge: 0.68, step: 0.82, stepBias: 1.2, lum: 0.95 }, // silhouette ink (0.45 in the plain finish), ink behind a nearer part, and the plain finish's luminance ink (0.8), nearly off
  band: 4,                         // the banding step: 6 bits (the plain finish's 8 is 5 bits)
  blur: true,                      // a 3x3 blur on the occlusion before it is applied
};

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const isShadow = (d, i) => d[i + 3] <= 180 && d[i] < 24 && d[i + 1] < 24 && d[i + 2] < 24;
/** Sample offsets on two rings (8 + 8 directions, paired with their opposites) of radius r. */
function disc(r) {
  const out = [];
  for (const [k, n] of [[0.5, 8], [1, 8]]) for (let j = 0; j < n; j++) { const a = (j + (k === 1 ? 0.5 : 0)) / n * Math.PI * 2; out.push([Math.round(Math.cos(a) * r * k), Math.round(Math.sin(a) * r * k), k === 1 ? 0.6 : 1]); }
  return out;
}
/** Occlusion of pixel (x, y) from the depth field: for each sample direction the pair of opposite samples is compared
 *  with the centre (`2 zc - z+ - z-`: zero on any plane, however it slopes, positive in a crease or behind a step), so
 *  flat faces at a grazing angle do not darken themselves. A sky sample (Infinity) makes the pair one-sided. Returns
 *  0..1 before `strength`. */
function occlusion(z, w, h, x, y, D, { range, bias, maxH }) {
  const zc = z[y * w + x]; let occ = 0, n = 0;
  const at = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= w || ny >= h ? undefined : z[ny * w + nx]; };
  for (const [dx, dy, wt] of D) {
    const zp = at(dx, dy), zm = at(-dx, -dy);
    if (zp === undefined || zm === undefined) continue; // (a pair cut by the cell's edge says nothing: a one-sided test on the sloping ground darkened the cell's border)
    n += wt;
    let c;
    if (zp === Infinity && zm === Infinity) continue;
    else if (zp === Infinity) c = zc - zm; else if (zm === Infinity) c = zc - zp; else c = 2 * zc - zp - zm;
    if (c <= bias) continue;
    occ += wt * Math.min(1, c / range) * (c < range ? 1 : Math.max(0, (maxH - c) / (maxH - range)));
  }
  return n ? occ / n : 0;
}

/**
 * The polished finish: `img` the render (RGBA, straight alpha), `z` its view depth per pixel (scene.js depthPass;
 * Infinity for the sky), `opts` overrides of POLISH. Model pixels get occlusion, a lit rim, ink and banding; the ground
 * gets the hard shadow (feathered) plus a soft contact shadow where parts stand or meet it.
 */
export function finishPolish(img, z, opts) {
  const P = opts && typeof opts === 'object' ? { ...POLISH, ...opts } : POLISH, sinE = P.sinElev ?? Math.sin(40 * Math.PI / 180);
  const { width: w, height: h, data: d } = img, src = new Uint8ClampedArray(d), N = w * h;
  const lum = (i) => 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
  const model = new Uint8Array(N), shadow = new Uint8Array(N);
  for (let p = 0; p < N; p++) { const i = p * 4; if (!src[i + 3]) continue; if (isShadow(src, i)) shadow[p] = 1; else if (src[i + 3] >= 40) model[p] = 1; }
  // the model's occlusion field
  const DA = disc(P.ao.radius);
  let ao = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (model[p]) ao[p] = occlusion(z, w, h, x, y, DA, P.ao); }
  if (P.blur) ao = blur3(ao, w, h, model);
  // the contact shadow: the ground plane's depth is linear in y (fitted on the ground pixels), so every model pixel has a
  // height over the ground under it ((zg - z) sin elev); pixels of parts that stand on the ground stamp a crisp dark
  // ellipse round themselves on the sun's lee side
  let sy = 0, sz = 0, syy = 0, syz = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (model[p] || z[p] === Infinity) continue; sy += y; sz += z[p]; syy += y * y; syz += y * z[p]; n++; }
  const b = n > 1 ? (n * syz - sy * sz) / Math.max(1e-9, n * syy - sy * sy) : 0, a = n ? (sz - b * sy) / n : 0;
  const contact = new Uint8Array(N), C = P.contact, R = C.radius, RY = Math.max(1, Math.round(R * C.squash));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!model[p] || z[p] === Infinity) continue;
    const hp = (a + b * y - z[p]) * sinE; if (hp <= C.hMin || hp >= C.hMax) continue;
    for (let dy = -RY; dy <= RY; dy++) for (let dx = -R; dx <= R; dx++) {
      if ((dx * dx) / (R * R) + (dy * dy) / (RY * RY) > 1 || dx + dy < C.lee) continue;
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx; if (!model[q]) contact[q] = 1;
    }
  }
  const zAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? Infinity : z[y * w + x];
  const mAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && model[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4, a = src[i + 3];
    if (!model[p]) { // the ground: the hard shadow, crisp, over the contact ellipse
      const soft = contact[p] ? C.alpha / 255 : 0;
      let alpha = shadow[p] && a >= 64 ? 150 : 0;
      alpha = Math.max(alpha, Math.round(soft * 255));
      if (a && a < 40 && !shadow[p]) { // an anti-aliased edge of the model over the contact shadow
        const A = a / 255 + soft * (1 - a / 255); if (A > 0) for (let c = 0; c < 3; c++) d[i + c] = Math.round(src[i + c] * (a / 255) / A); d[i + 3] = Math.round(A * 255); continue;
      }
      d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = alpha; continue;
    }
    const zc = z[p];
    let k = 1 - P.ao.strength * ao[p], edgeSky = 0, edgeLit = 0;
    for (const [nx, ny, lit] of [[x - 1, y, 1], [x + 1, y, 0], [x, y - 1, 1], [x, y + 1, 0]]) {
      if (!mAt(nx, ny)) { if (lit) edgeLit++; else edgeSky++; continue; }
      const j = (ny * w + nx) * 4, zn = zAt(nx, ny);
      if (zc - zn > P.ink.stepBias) k = Math.min(k, P.ink.step);              // a nearer part ends here: ink in its lee
      else if (Math.abs(lum(j) - lum(i)) > 0.22 * Math.max(lum(i), 30) && lum(j) > lum(i)) k = Math.min(k, P.ink.lum);
    }
    if (edgeSky) k = Math.min(k, P.ink.edge);                                                 // the silhouette's lower and right edges: ink
    else if (edgeLit || zAt(x, y - 1) - zc > P.rim.bias || zAt(x - 1, y) - zc > P.rim.bias) k *= 1 + P.rim.gain; // its upper and left edges, and any edge raised over what is behind it: lit
    for (let c = 0; c < 3; c++) { const v = 255 * smooth(0.03, 0.97, Math.min(255, src[i + c] * k) / 255); d[i + c] = Math.min(255, Math.round(v / P.band) * P.band + P.band / 2); }
    if (a < 128) { // an anti-aliased edge over the contact shadow
      const soft = contact[p] ? C.alpha / 255 : 0, A = a / 255 + soft * (1 - a / 255);
      if (soft > 0) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * (a / 255) / A);
      d[i + 3] = Math.round(A * 255);
    } else d[i + 3] = 255;
  }
}
function blur3(f, w, h, mask) {
  const o = new Float32Array(f.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!mask[p]) continue; let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny * w + nx; if (!mask[q]) continue; const wt = dx || dy ? 1 : 2; s += f[q] * wt; n += wt; }
    o[p] = n ? s / n : f[p];
  }
  return o;
}

// ---------------- material texture (light bases; bump maps keep the style sheet's colours) ----------------
function canvasTex(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let T = null;
/** The textures, made once on first use (the page's canvas is needed). Every repeat is on boxUV's 16 game units. */
export function polishTextures() {
  if (T) return T;
  const bumpBase = (g, n) => { g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); };
  T = {
    /** Brushed steel: faint streaks along x, a few darker scuffs across them, two pale wipes. */
    brushed: canvasTex(128, (g, n) => {
      g.fillStyle = '#e2e2e2'; g.fillRect(0, 0, n, n); seed = 11;
      for (let i = 0; i < 400; i++) { const y = rnd() * n, v = 180 + rnd() * 75; g.strokeStyle = `rgba(${v},${v},${v + 4},0.5)`; g.lineWidth = 0.6 + rnd() * 0.8; g.beginPath(); g.moveTo(0, y); g.lineTo(n, y + rnd() * 2 - 1); g.stroke(); }
      for (let i = 0; i < 10; i++) { const x = rnd() * n, y = rnd() * n, a = rnd() * 3; g.strokeStyle = `rgba(70,72,76,${0.25 + rnd() * 0.3})`; g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (8 + rnd() * 16), y + Math.sin(a) * (8 + rnd() * 16)); g.stroke(); }
      for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 10 + rnd() * 20, 4 + rnd() * 6, rnd() * 3, 0, 7); g.fill(); }
    }, { repeat: 2 }),
    /** Scuffs: a bump map of short dents and scratches for worn metal and composite. */
    scuff: canvasTex(128, (g, n) => {
      bumpBase(g, n); seed = 13;
      for (let i = 0; i < 24; i++) { const x = rnd() * n, y = rnd() * n, a = rnd() * 3; g.strokeStyle = `rgba(${rnd() > 0.5 ? 40 : 200},${rnd() > 0.5 ? 40 : 200},${rnd() > 0.5 ? 40 : 200},0.6)`; g.lineWidth = 1 + rnd() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (6 + rnd() * 14), y + Math.sin(a) * (6 + rnd() * 14)); g.stroke(); }
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(60,60,60,0.5)'; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 2 + rnd() * 3, 1.5 + rnd() * 2, rnd() * 3, 0, 7); g.fill(); }
    }, { srgb: false, repeat: 2 }),
    /** Leather: a fine grain with a few creases, slightly mottled. */
    leather: canvasTex(64, (g, n) => {
      g.fillStyle = '#dcd4cc'; g.fillRect(0, 0, n, n); seed = 17;
      for (let i = 0; i < 1800; i++) { const v = 170 + rnd() * 80; g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.35)`; g.fillRect(rnd() * n, rnd() * n, 1, 1); }
      for (let i = 0; i < 8; i++) { const x = rnd() * n, y = rnd() * n; g.strokeStyle = `rgba(60,45,35,${0.25 + rnd() * 0.3})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rnd() * 10 - 5, y + rnd() * 10, x + rnd() * 16 - 8, y + 8 + rnd() * 10); g.stroke(); }
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(80,60,45,${0.06 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 10, 4 + rnd() * 8, rnd() * 3, 0, 7); g.fill(); }
    }, { repeat: 4 }),
    /** Hide: big soft mottles and a few downward hair streaks, for the horse. */
    hide: canvasTex(128, (g, n) => {
      g.fillStyle = '#dcd6d0'; g.fillRect(0, 0, n, n); seed = 19;
      for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,250,245' : '90,70,55'},${0.08 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 12 + rnd() * 24, 8 + rnd() * 16, rnd() * 3, 0, 7); g.fill(); }
      for (let i = 0; i < 160; i++) { const x = rnd() * n, y = rnd() * n, v = 150 + rnd() * 100; g.strokeStyle = `rgba(${v},${v - 12},${v - 24},0.3)`; g.lineWidth = 0.6 + rnd() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 2 - 1, y + 6 + rnd() * 10); g.stroke(); }
    }, { repeat: 2 }),
    /** Cloth folds: a bump map of soft vertical bands (four folds per repeat), so hanging and wrapped cloth catches the light in folds. */
    fold: canvasTex(64, (g, n) => {
      bumpBase(g, n);
      for (let x = 0; x < n; x++) { const v = 128 + 38 * Math.sin(x / n * Math.PI * 8) + 10 * Math.sin(x / n * Math.PI * 22 + 1); g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; g.fillRect(x, 0, 1, n); }
      seed = 23; for (let i = 0; i < 30; i++) { const v = 90 + rnd() * 80; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 3 + rnd() * 8, 8 + rnd() * 14, rnd() * 0.4 - 0.2, 0, 7); g.fill(); }
    }, { srgb: false, repeat: 2 }),
    /** Wood grain: a bump map of long streaks along x (planks and hafts run along their length). */
    grain: canvasTex(128, (g, n) => {
      bumpBase(g, n); seed = 29;
      for (let i = 0; i < 90; i++) { const y = rnd() * n, v = 60 + rnd() * 140; g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(n / 3, y + rnd() * 5 - 2.5, 2 * n / 3, y + rnd() * 5 - 2.5, n, y + rnd() * 3 - 1.5); g.stroke(); }
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(50,50,50,0.7)'; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 2 + rnd() * 2, 1.2 + rnd(), 0, 0, 7); g.fill(); } // knots
    }, { srgb: false, repeat: 2 }),
    /** Slate courses: a bump map on the slate texture's rows (16 px rows, 24 px slabs, staggered). */
    slate: canvasTex(128, (g, n) => {
      bumpBase(g, n); g.fillStyle = '#404040';
      for (let y = 0; y < n; y += 16) { const o = (y / 16) % 2 ? 12 : 0; g.fillRect(0, y + 14, n, 2); for (let x = -24; x < n; x += 24) g.fillRect(x + o, y, 1.5, 16); }
      g.fillStyle = '#b0b0b0'; for (let y = 0; y < n; y += 16) g.fillRect(0, y, n, 1);
    }, { srgb: false, repeat: 3 }),
    /** Shingle courses: a bump map on the shingle texture's rows (12 px rows, 16 px shingles, staggered). */
    shingle: canvasTex(128, (g, n) => {
      bumpBase(g, n); g.fillStyle = '#404040';
      for (let y = 0; y < n; y += 12) { const o = (y / 12) % 2 ? 8 : 0; g.fillRect(0, y + 10, n, 2); for (let x = -16; x < n + 16; x += 16) g.fillRect(x + o, y, 1.4, 12); }
      g.fillStyle = '#b0b0b0'; for (let y = 0; y < n; y += 12) g.fillRect(0, y, n, 1);
    }, { srgb: false, repeat: 3 }),
    /** Panel seams: a bump map on the composite shell's seams (the same lines as shellTex) with its fasteners. */
    shell: canvasTex(256, (g, n) => {
      bumpBase(g, n); g.strokeStyle = '#484848'; g.lineWidth = 2.5;
      for (const p of [0, 96, 160]) { g.beginPath(); g.moveTo(p + 0.5, 0); g.lineTo(p + 0.5, n); g.stroke(); } for (const p of [0, 64, 192]) { g.beginPath(); g.moveTo(0, p + 0.5); g.lineTo(n, p + 0.5); g.stroke(); }
      g.fillStyle = '#c8c8c8'; for (const [x, y] of [[8, 8], [88, 8], [168, 8], [8, 56], [88, 56], [8, 184], [168, 184], [248, 120]]) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
    }, { srgb: false, repeat: 2 }),
    /** Round 2's course textures, drawn for 1x: the same patterns as kingdom.js ashlarTex / slateTex and
     *  expedition.js shingleTex / boardTex with a wider tone spread between the pieces and mortar, seams and lower
     *  edges twice as dark and wide, each piece's lit upper edge brighter. */
    hiAshlar: canvasTex(256, (g, n) => {
      g.fillStyle = '#d6d0c4'; g.fillRect(0, 0, n, n); seed = 17;
      for (let y = 0; y < n; y += 32) { const o = (y / 32) % 2 ? 24 : 0; for (let x = -48; x < n; x += 48) { const v = 176 + rnd() * 76; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x + o, y, 48, 32); } }
      for (let i = 0; i < 2600; i++) { const v = 160 + rnd() * 90; g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 2); }
      g.strokeStyle = 'rgba(34,30,28,0.95)'; g.lineWidth = 3.5;
      for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(n, y + 0.5); g.stroke(); const o = (y / 32) % 2 ? 24 : 0; for (let x = o; x < n + 48; x += 48) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 32); g.stroke(); } }
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5;
      for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 3); g.lineTo(n, y + 3); g.stroke(); }
      for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(70,60,50,${0.08 + rnd() * 0.14})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 3 + rnd() * 12, 2 + rnd() * 6, rnd() * 3, 0, 7); g.fill(); }
    }, { repeat: 2 }),
    hiSlate: canvasTex(128, (g, n) => {
      g.fillStyle = '#c8ccd2'; g.fillRect(0, 0, n, n); seed = 37;
      for (let y = 0; y < n; y += 16) { const o = (y / 16) % 2 ? 12 : 0; for (let x = -24; x < n; x += 24) { const v = 150 + rnd() * 90; g.fillStyle = `rgb(${v - 6},${v - 2},${v + 4})`; g.fillRect(x + o, y, 24, 16); g.fillStyle = 'rgba(14,16,20,0.92)'; g.fillRect(x + o, y + 13, 24, 3); g.fillRect(x + o, y, 1.8, 16); g.fillStyle = 'rgba(255,255,255,0.32)'; g.fillRect(x + o + 1.8, y + 1, 22, 1.5); } }
    }, { repeat: 3 }),
    hiShingle: canvasTex(128, (g, n) => {
      g.fillStyle = '#aeaaa2'; g.fillRect(0, 0, n, n); seed = 73;
      for (let y = 0; y < n; y += 12) { const o = (y / 12) % 2 ? 8 : 0; for (let x = -16; x < n + 16; x += 16) { const v = 120 + rnd() * 90; g.fillStyle = `rgb(${v + 4},${v},${v - 6})`; g.fillRect(x + o, y, 16, 12); g.fillStyle = 'rgba(18,16,14,0.95)'; g.fillRect(x + o, y + 9.5, 16, 2.5); g.fillRect(x + o, y, 1.8, 12); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + o + 1.8, y + 0.5, 14, 1.5); } }
      for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(60,56,50,${0.06 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 4 + rnd() * 10, 2 + rnd() * 5, rnd() * 3, 0, 7); g.fill(); }
    }, { repeat: 3 }),
    hiBoard: canvasTex(128, (g, n) => { // (boardTex's draw sequence, with darker, wider seams and a brighter lit edge)
      g.fillStyle = '#b4aea2'; g.fillRect(0, 0, n, n); seed = 67;
      for (let y = 0; y < n;) {
        const h = Math.min(n - y, 9 + rnd() * 9), v = 130 + rnd() * 80; g.fillStyle = `rgb(${v + 6},${v},${v - 8})`; g.fillRect(0, y, n, h);
        for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(60,56,50,${0.12 + rnd() * 0.25})`; g.lineWidth = 0.6 + rnd(); g.beginPath(); const y0 = y + 1 + rnd() * (h - 2); g.moveTo(0, y0); g.bezierCurveTo(n / 3, y0 + rnd() * 3 - 1.5, 2 * n / 3, y0 + rnd() * 3 - 1.5, n, y0 + rnd() - 0.5); g.stroke(); }
        if (rnd() < 0.75) { const x = rnd() * n; g.fillStyle = 'rgba(20,18,16,0.95)'; g.fillRect(x, y, 3, h); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 3, y, 1.5, h); }
        if (rnd() < 0.3) { g.fillStyle = 'rgba(50,44,38,0.6)'; g.beginPath(); g.ellipse(rnd() * n, y + h / 2, 1.6 + rnd() * 1.2, 1 + rnd(), 0, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(16,14,12,0.96)'; g.fillRect(0, y + h - 3.2, n, 3.2);
        g.fillStyle = 'rgba(255,255,255,0.34)'; g.fillRect(0, y, n, 1.5);
        y += h;
      }
    }, { repeat: 2 }),
    /** Boards: a bump map of the weathered boards' seams (horizontal, uneven rows). */
    board: canvasTex(128, (g, n) => {
      bumpBase(g, n); seed = 67; g.fillStyle = '#383838';
      for (let y = 0; y < n;) { // (boardTex's draw sequence, so the seams fall on its rows)
        const h = Math.min(n - y, 9 + rnd() * 9); rnd(); for (let k = 0; k < 6; k++) for (let j = 0; j < 6; j++) rnd();
        if (rnd() < 0.75) rnd(); if (rnd() < 0.3) { rnd(); rnd(); rnd(); }
        g.fillRect(0, y + h - 2.4, n, 2.4); g.fillStyle = '#b0b0b0'; g.fillRect(0, y, n, 1); g.fillStyle = '#383838'; y += h;
      }
    }, { srgb: false, repeat: 2 }),
  };
  return T;
}

/** Puts material texture on a people's set `M` in place (bump maps, a brushed map on steel, grain on leather and hide)
 *  and marks it `polish` so the models add their secondary detail. `side` is 'kg' or 'ex'. */
export function polishMats(M, side) {
  const X = polishTextures(), bump = (m, map, scale) => { if (!m) return; m.bumpMap = map; m.bumpScale = scale; m.needsUpdate = true; };
  const metal = (m, rough = 0.22) => { if (!m) return; m.map = X.brushed; m.bumpMap = X.scuff; m.bumpScale = 0.5; m.roughness = rough; m.envMapIntensity = 2.4; m.needsUpdate = true; }; // (a tight bright glint under the key light; the room light is 0.10 on everything else)
  const courses = (m, map, color) => { if (!m) return; m.map = map; if (color !== undefined) m.color.setHex(color); m.needsUpdate = true; };
  bump(M.paintCanvas, X.fold, 1.2); bump(M.cloth, X.fold, 1.2); bump(M.paintCloth, X.fold, 1.2);
  if (side === 'kg') {
    metal(M.steel);
    M.leather.map = X.leather; M.leather.needsUpdate = true; bump(M.leather, X.scuff, 0.25);
    M.horse.map = X.hide; M.horse.needsUpdate = true; M.horseDark.map = X.hide; M.horseDark.needsUpdate = true;
    bump(M.tunic, X.fold, 1.0); bump(M.hose, X.fold, 0.8); bump(M.linen, X.fold, 0.6); bump(M.clothPale, X.fold, 1.0);
    bump(M.oak, X.grain, 0.8); bump(M.timber, X.grain, 0.8); bump(M.timberPale, X.grain, 0.8);
    courses(M.wall, X.hiAshlar); courses(M.wallDark, X.hiAshlar); courses(M.plinth, X.hiAshlar);           // the courses drawn for 1x
    bump(M.wall, M.wall.bumpMap, 2.2); bump(M.wallDark, M.wallDark.bumpMap, 2.2); bump(M.plinth, M.plinth.bumpMap, 2.0);
    courses(M.roof, X.hiSlate, 0x545a62); bump(M.roof, X.slate, 1.6);                                     // slate half a step lighter: under the stronger key the sun-lit slates part from the fill-lit walls (a darker slate sank into them)
    bump(M.yard, M.yard.bumpMap, 1.6);
    bump(M.mail, X.scuff, 0.3); bump(M.wicker, X.fold, 0.4);
    M.gold.roughness = 0.25; M.gold.bumpMap = X.scuff; M.gold.bumpScale = 0.2; M.gold.envMapIntensity = 2.0; M.gold.needsUpdate = true;
  } else {
    bump(M.panel, X.shell, 1.4); bump(M.panelDark, X.shell, 1.4); bump(M.paint, X.shell, 1.0);
    bump(M.trim, X.scuff, 0.3); bump(M.joint, X.scuff, 0.25);
    metal(M.steel, 0.25); metal(M.paleSteel, 0.25); metal(M.brightSteel, 0.2);
    M.glass.envMapIntensity = 2.5; M.glass.needsUpdate = true; M.visor.envMapIntensity = 2.0; M.visor.needsUpdate = true;
    bump(M.uniform, X.fold, 0.9); bump(M.camo, X.fold, 0.8); bump(M.armour, X.scuff, 0.6); bump(M.gun, X.scuff, 0.5); bump(M.hose, X.fold, 0.45);
    M.leather.map = X.leather; M.leather.needsUpdate = true;
    courses(M.wall, X.hiAshlar); courses(M.wallPale, X.hiAshlar); courses(M.stone, X.hiAshlar);
    bump(M.wall, M.wall.bumpMap, 2.2); bump(M.wallPale, M.wallPale.bumpMap, 2.4); bump(M.stone, M.stone.bumpMap, 1.8);
    courses(M.roofDark, X.hiShingle, 0xaaaca8); bump(M.roofDark, X.shingle, 1.6);                         // shingles a step lighter: pale roofs over mid walls, further apart
    courses(M.deck, X.hiBoard); bump(M.deck, X.board, 1.4);
    bump(M.oak, X.grain, 0.8); bump(M.oakPale, X.grain, 0.8); bump(M.timber, X.grain, 0.8);
    bump(M.canvasLocal, X.fold, 0.6);
    M.gold.roughness = 0.25; M.gold.bumpMap = X.scuff; M.gold.bumpScale = 0.2; M.gold.envMapIntensity = 2.0; M.gold.needsUpdate = true;
  }
  M.polish = true;
  return M;
}
