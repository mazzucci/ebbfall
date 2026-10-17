// Offline sprite renderer: a lit three.js scene and a camera that frames one model at a time.
// Projection: an orthographic camera south of the model at ELEV degrees, with the frustum squashed so the ground
// stays square on screen (1 game unit = S px). Heights then appear scaled by cot(ELEV): you see roofs and the
// south faces, like the pre-rendered sprites of late-90s RTS games.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const ELEV = 55 * Math.PI / 180;
export const S = 2;          // output pixels per game unit (art is drawn at twice the game's resolution)
const SS = 2;                // supersampling factor before downscaling
export const LIFT = Math.cos(ELEV) / Math.sin(ELEV); // screen px of rise per unit of height (per game unit)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

export const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const sun = new THREE.DirectionalLight(0xfff0d8, 4.6);
sun.position.set(-120, 300, -90); // from the north-west, high
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.3; sun.shadow.radius = 1;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xa9c3ee, 0x2a241c, 0.28));
const rim = new THREE.DirectionalLight(0x9fc4ff, 1.5);
rim.position.set(160, 90, 140); // from the south-east: separates edges from the ground
scene.add(rim);

const catcher = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.65 }));
catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true;
scene.add(catcher);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
const out = document.createElement('canvas');
const octx = out.getContext('2d', { willReadFrequently: true });

/**
 * Render `obj` (already in the scene graph or not) into a w x h px RGBA image.
 * The ground point (gx, gz) lands at pixel (ax, ay). Shadow on the ground included unless `shadow` is false.
 */
export function shoot(obj, { w, h, ax, ay, gx = 0, gz = 0, shadow = true }) {
  scene.add(obj);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  catcher.visible = shadow;
  // Frustum in ground units around the anchor: left/right are plain, up/down are scaled by sin(ELEV).
  const L = ax / S, R = (w - ax) / S, U = ay / S, D = (h - ay) / S, sn = Math.sin(ELEV);
  camera.left = -L; camera.right = R; camera.top = U * sn; camera.bottom = -D * sn;
  camera.position.set(gx, 1000 * sn, gz + 1000 * Math.cos(ELEV));
  camera.lookAt(gx, 0, gz);
  camera.updateProjectionMatrix();
  sun.target.position.set(gx, 0, gz); sun.position.set(gx - 120, 300, gz - 90);
  const r = Math.max(w, h) / S;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 1200 });
  sun.shadow.camera.updateProjectionMatrix();
  renderer.setSize(w * SS, h * SS, false);
  renderer.render(scene, camera);
  out.width = w; out.height = h;
  octx.clearRect(0, 0, w, h); octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  octx.drawImage(renderer.domElement, 0, 0, w, h);
  scene.remove(obj);
  const img = octx.getImageData(0, 0, w, h);
  finish(img);
  return img;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The catcher draws pure black at opacity 0.65 (alpha ≈ 166); anti-aliased model edges are coloured or more opaque.
const isShadow = (d, i) => d[i + 3] <= 180 && d[i] < 24 && d[i + 1] < 24 && d[i + 2] < 24;
/**
 * The late-90s render look: hard cast shadows, dark ink along silhouettes and sharp internal edges, a contrast
 * S-curve and 5-bit-per-channel banding (like an 8-bit render, without pixel-art chunkiness).
 */
function finish(img) {
  const { width: w, height: h, data: d } = img, src = new Uint8ClampedArray(d);
  const lum = (i) => 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = src[i + 3];
    if (!a) continue;
    if (isShadow(src, i)) { // shadow on the ground: a hard dark shape
      if (a < 64) { d[i + 3] = 0; continue; }
      d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 150; continue;
    }
    let k = 1;
    const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) { k = Math.min(k, 0.45); continue; }
      const j = (ny * w + nx) * 4;
      if (src[j + 3] < 40 || isShadow(src, j)) k = Math.min(k, 0.45);
      else if (Math.abs(lum(j) - lum(i)) > 0.22 * Math.max(lum(i), 30) && lum(j) > lum(i)) k = Math.min(k, 0.8);
    }
    for (let c = 0; c < 3; c++) { const v = 255 * smooth(0.03, 0.97, src[i + c] * k / 255); d[i + c] = Math.round(v / 8) * 8 + 4; }
    d[i + 3] = a < 128 ? a : 255;
  }
}
