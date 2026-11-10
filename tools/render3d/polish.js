// The re-theme's polish (a style test on the slice's eight pieces, 2026-11-10; Stelian: "more polished, more detail,
// less like drawings"). Three layers, every one an option the atlas never sees: (1) `finishPolish`, the finish with a
// depth pass behind it: ambient occlusion in creases and where parts meet, a soft contact shadow on the ground round
// each piece (the hard cast shadow kept, its edge feathered a pixel), a lit rim on the edges that face the sun
// (up-left on screen), ink only where a nearer part ends against a farther one and lighter on the silhouette, 6-bit
// banding (the 5-bit steps showed on the AO's gradients); (2) `polishMats`, material texture on the flat materials
// (brushed and scuffed steel, leather grain, hide, cloth folds, plank grain, slate and shingle courses, panel seams)
// as bump maps mostly, so the colours and values the style sheet fixes do not move; (3) the models' own secondary
// detail, added under `M.polish` in kingdom.js and expedition.js (buckles, straps, bindings, quoins, lintels, cable
// runs...), only at a scale that survives 1x. scene.js `shoot(..., { polish })` runs (1); retheme.js passes `polish`
// to the mats for (2) and (3). `POLISH` holds every setting of (1); pass an object as `polish` to override any.
import * as THREE from 'three';

export const POLISH = {
  ao: { radius: 10, range: 1.5, bias: 0.3, maxH: 16, strength: 1.0 }, // occlusion between parts: a step of `range` view units darkens fully, fading out by maxH
  contact: { radius: 16, range: 2, bias: 0.3, maxH: 12, strength: 1.0 }, // the soft shadow on the ground round each piece
  rim: { gain: 0.45, bias: 1.0 },  // the lit edge: a model pixel whose up or left neighbour is farther by `bias` or is the sky
  ink: { edge: 0.68, step: 0.82, stepBias: 1.2, lum: 0.95 }, // silhouette ink (0.45 in the plain finish), ink behind a nearer part, and the plain finish's luminance ink (0.8), nearly off
  feather: 110,                    // the hard shadow's outermost pixel's alpha (150 inside)
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
  const P = opts && typeof opts === 'object' ? { ...POLISH, ...opts } : POLISH;
  const { width: w, height: h, data: d } = img, src = new Uint8ClampedArray(d), N = w * h;
  const lum = (i) => 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
  const model = new Uint8Array(N), shadow = new Uint8Array(N);
  for (let p = 0; p < N; p++) { const i = p * 4; if (!src[i + 3]) continue; if (isShadow(src, i)) shadow[p] = 1; else if (src[i + 3] >= 40) model[p] = 1; }
  // occlusion fields: the model's, and the ground's contact shadow
  const DA = disc(P.ao.radius), DC = disc(P.contact.radius);
  let ao = new Float32Array(N), ct = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (model[p]) ao[p] = occlusion(z, w, h, x, y, DA, P.ao);
    else if (z[p] !== Infinity) ct[p] = occlusion(z, w, h, x, y, DC, P.contact);
  }
  if (P.blur) ao = blur3(ao, w, h, model);
  const zAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? Infinity : z[y * w + x];
  const mAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && model[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4, a = src[i + 3];
    if (!model[p]) { // the ground: the hard shadow (feathered at its edge) over the soft contact shadow
      const soft = Math.min(0.75, P.contact.strength * ct[p]);
      let alpha = 0;
      if (shadow[p] && a >= 64) { const edge = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => { const q = ny * w + nx; return nx < 0 || ny < 0 || nx >= w || ny >= h || (!model[q] && !shadow[q]); }); alpha = edge ? P.feather : 150; }
      alpha = Math.max(alpha, Math.round(soft * 255));
      if (a && a < 40 && !shadow[p]) { // an anti-aliased edge of the model over the soft shadow
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
      const soft = Math.min(0.75, P.contact.strength * (ct[p] || 0)), A = a / 255 + soft * (1 - a / 255);
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
  const metal = (m) => { if (!m) return; m.map = X.brushed; m.bumpMap = X.scuff; m.bumpScale = 0.6; m.roughness = Math.min(0.5, m.roughness + 0.05); m.envMapIntensity = 1.8; m.needsUpdate = true; }; // (brighter glints: the room light is 0.22 on everything else)
  bump(M.paintCanvas, X.fold, 1.2); bump(M.cloth, X.fold, 1.2); bump(M.paintCloth, X.fold, 1.2);
  if (side === 'kg') {
    metal(M.steel);
    M.leather.map = X.leather; M.leather.needsUpdate = true; bump(M.leather, X.scuff, 0.25);
    M.horse.map = X.hide; M.horse.needsUpdate = true; M.horseDark.map = X.hide; M.horseDark.needsUpdate = true;
    bump(M.tunic, X.fold, 1.0); bump(M.hose, X.fold, 0.8); bump(M.linen, X.fold, 0.6); bump(M.clothPale, X.fold, 1.0);
    bump(M.oak, X.grain, 0.8); bump(M.timber, X.grain, 0.8); bump(M.timberPale, X.grain, 0.8);
    bump(M.wall, M.wall.bumpMap, 2.2); bump(M.wallDark, M.wallDark.bumpMap, 2.2); bump(M.plinth, M.plinth.bumpMap, 2.0);
    bump(M.roof, X.slate, 1.6); bump(M.yard, M.yard.bumpMap, 1.6);
    bump(M.mail, X.scuff, 0.3); bump(M.wicker, X.fold, 0.4);
    M.gold.roughness = 0.3; M.gold.bumpMap = X.scuff; M.gold.bumpScale = 0.2; M.gold.envMapIntensity = 1.6; M.gold.needsUpdate = true;
  } else {
    bump(M.panel, X.shell, 1.4); bump(M.panelDark, X.shell, 1.4); bump(M.paint, X.shell, 1.0);
    bump(M.trim, X.scuff, 0.3); bump(M.joint, X.scuff, 0.25);
    metal(M.steel); metal(M.paleSteel); metal(M.brightSteel);
    bump(M.uniform, X.fold, 0.9); bump(M.camo, X.fold, 0.8); bump(M.armour, X.scuff, 0.6); bump(M.gun, X.scuff, 0.5); bump(M.hose, X.fold, 0.45);
    M.leather.map = X.leather; M.leather.needsUpdate = true;
    bump(M.wall, M.wall.bumpMap, 2.2); bump(M.wallPale, M.wallPale.bumpMap, 2.4); bump(M.stone, M.stone.bumpMap, 1.8);
    bump(M.roofDark, X.shingle, 1.6); bump(M.deck, X.board, 1.4);
    bump(M.oak, X.grain, 0.8); bump(M.oakPale, X.grain, 0.8); bump(M.timber, X.grain, 0.8);
    bump(M.canvasLocal, X.fold, 0.6);
    M.gold.roughness = 0.3; M.gold.bumpMap = X.scuff; M.gold.bumpScale = 0.2; M.gold.envMapIntensity = 1.6; M.gold.needsUpdate = true;
  }
  M.polish = true;
  return M;
}
