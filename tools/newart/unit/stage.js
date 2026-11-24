// The browser side of build.mjs: a lit three.js stage and an orthographic camera, one frame of a unit at a time with
// its team mask, its cast shadow and its dark edge baked in. After the article folder's units3d/stage-flat.js (the
// stage the other units' frames are made on), so a Guard rendered here stands among them: the game's own camera (40
// degrees, the ground square on screen, heights drawn 1.19 times), 16 facings at equal ground angles, a bright early
// afternoon (a strong, slightly warm sun from the upper left, a soft fill on the camera's side), the shadow in the new
// look's cool dark blue (tools/newart/tone.mjs SHADOW). Its own: the size, the shadow and the edge are in game px, so
// a page at any scale is the same picture, sharper; the shadow is the model's silhouette laid on the ground (crisp at
// any scale); `tone` can put the pack curve on the body for a model lit the old, overcast way (not both).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { tone } from '/tone.mjs';

export const FACINGS = 16;
/** The model's turn for facing k: the ground angle k * 22.5 degrees, clockwise on screen from east, as the client
 *  picks a facing from a heading (render.js UnitObj: round(face / 2 pi * 16)) and as tools/render3d turns today's. */
export const yaw = (k) => -k / FACINGS * Math.PI * 2;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.setClearColor(0, 0);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3;
const sun = new THREE.DirectionalLight(0xfff0d8, 4.4); sun.position.set(-0.38 * 300, 300, -0.12 * 300);   // upper left: its shadow 0.4 of a height along the ground, right and a little down
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 800 });
const hemi = new THREE.HemisphereLight(0xb8d0ff, 0x56663a, 0.85);                                          // a blue sky over grass: the shade is cool
const fill = new THREE.DirectionalLight(0xfff2e0, 1.3); fill.position.set(-160, 110, 260);                 // the camera's side of things, lit softly from the front left
const rim = new THREE.DirectionalLight(0xa8c8ff, 0.5); rim.position.set(200, 90, -80);
scene.add(sun, sun.target, hemi, fill, rim);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);

/** The view (build.mjs VIEW): `Z` page px per game px, `px` the 2x-sprite px a model unit is drawn across (units3d's
 *  `scale`), `elev` the camera's height (degrees), `square` the game's convention (the ground kept square, heights
 *  stretched by cot) or the true projection (ground depth x sin, heights x cos), `SS` the supersampling, `shadow`,
 *  `edge` and `tone`. */
let V = null, P = 1, SIN = 0.5, GROUND = 0.5, RISE = 1;
export function setup(view) {
  V = view; const e = view.elev * Math.PI / 180; SIN = Math.sin(e);
  GROUND = view.square ? 1 : SIN;                        // screen px of depth per px of width on the ground
  RISE = view.square ? Math.cos(e) / SIN : Math.cos(e);  // screen px of rise per px of width
  P = view.Z / 2 * view.px;                              // page px per model unit, across
  camera.position.set(0, 1000 * SIN, 1000 * Math.cos(e)); camera.lookAt(0, 0, 0);
}

function grab(w, h) {
  renderer.render(scene, camera);
  const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(renderer.domElement, 0, 0, w, h); return c;
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const flat = [new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false })];
const dark = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide, toneMapped: false, depthTest: false });
/** The pixels of a canvas cut to its content (alpha over `min`): { x, y, w, h, data } in the cell, or null if empty. */
function cut(c, min = 0) {
  const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) out.set(d.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * tw * 4);
  let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return { x: x0, y: y0, w: tw, h: th, data: btoa(s) };
}

/** Shoot `obj` into a cell of game px { w, h, ax, ay } (the ground point at ax, ay): { img, mask, edge } with img and
 *  mask cut to their content in the cell's page px (`cut`), `edge` whether the frame touches the cell's border. The
 *  frame has its shadow and its dark edge baked under it; the mask holds the finished pixels of the team surfaces
 *  (material.userData.team), which the client multiplies by the seat's paint and draws over. */
export function shoot(obj, cell) {
  const Z = V.Z, w = Math.round(cell.w * Z), h = Math.round(cell.h * Z), ax = cell.ax * Z, ay = cell.ay * Z;
  scene.add(obj); obj.updateMatrixWorld(true);
  obj.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  const up = V.square ? SIN : 1; // (square: the frustum squashed so the ground stays square, as today's scene.js)
  Object.assign(camera, { left: -ax / P, right: (w - ax) / P, top: ay / P * up, bottom: -(h - ay) / P * up }); camera.updateProjectionMatrix();
  renderer.setSize(w * V.SS, h * V.SS, false);
  const body = grab(w, h);
  // the mask pass: team surfaces white, everything else black, unlit
  const saved = []; obj.traverse(o => { if (o.isMesh) { saved.push([o, o.material]); const m = Array.isArray(o.material) ? o.material[0] : o.material; o.material = flat[m.userData.team ? 1 : 0]; } });
  const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  const pass = grab(w, h).getContext('2d').getImageData(0, 0, w, h).data;
  // the shadow pass: the model laid on the ground along the sun (a shear), flat. On screen the shadow of a point
  // lies `len` of its drawn height away, along `dir`.
  let shade = null;
  if (V.shadow) {
    const S = V.shadow, n = Math.hypot(...S.dir), a = S.len * RISE * S.dir[0] / n, b = S.len * RISE * S.dir[1] / n / GROUND;
    const lay = new THREE.Group(); lay.matrixAutoUpdate = false; lay.matrix.set(1, a, 0, 0, 0, 0.0005, 0, 0, 0, b, 1, 0, 0, 0, 0, 1);
    scene.remove(obj); lay.add(obj); scene.add(lay); lay.updateMatrixWorld(true);
    scene.overrideMaterial = dark; shade = grab(w, h); scene.overrideMaterial = null;
    scene.remove(lay); lay.remove(obj);
  } else scene.remove(obj);
  renderer.toneMapping = tm; for (const [o, m] of saved) o.material = m;
  const bd = body.getContext('2d').getImageData(0, 0, w, h), md = new ImageData(w, h);
  for (let i = 0; i < pass.length; i += 4) { const al = Math.round(pass[i] / 255 * bd.data[i + 3]); if (al < 4) continue; md.data.set([bd.data[i], bd.data[i + 1], bd.data[i + 2], al], i); }
  const mask = canvas(w, h); mask.getContext('2d').putImageData(md, 0, 0);
  // the frame: the shadow, the dark edge, then the body in the pack's light (the mask above keeps the render's own)
  const img = canvas(w, h), g = img.getContext('2d', { willReadFrequently: true });
  if (shade) {
    const sg = shade.getContext('2d'); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = V.shadow.color; sg.fillRect(0, 0, w, h);
    g.filter = `blur(${V.shadow.soft * Z}px)`; g.globalAlpha = V.shadow.alpha; g.drawImage(shade, 0, 0); g.filter = 'none'; g.globalAlpha = 1;
  }
  if (V.edge) { // a thin dark edge, soft: pale and brown bodies against grass and earth
    const E = V.edge, edge = canvas(w, h), eg = edge.getContext('2d'), o = E.px * Z; eg.filter = `blur(${E.soft * Z}px)`;
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) eg.drawImage(body, dx, dy);
    eg.filter = 'none'; eg.globalCompositeOperation = 'source-in'; eg.fillStyle = E.color; eg.fillRect(0, 0, w, h);
    g.globalAlpha = E.alpha; g.drawImage(edge, 0, 0); g.globalAlpha = 1;
  }
  if (V.tone) { tone(bd.data); body.getContext('2d').putImageData(bd, 0, 0); }
  g.drawImage(body, 0, 0);
  const ci = cut(img, 2), cm = cut(mask, 0);
  return { img: ci, mask: cm, edge: !ci || ci.x === 0 || ci.y === 0 || ci.x + ci.w === w || ci.y + ci.h === h };
}
