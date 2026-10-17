// Terrain tiles (32x32) for a dual grid: each drawn tile sits between four map tiles and is chosen by which of
// its corners are rock (bit 1 = top-left, 2 = top-right, 4 = bottom-left, 8 = bottom-right), so cliff edges
// join up seamlessly. Ground noise is periodic over 32 px so every tile seams with every other.
import { image, hash2, vnoise } from './raster.js';
import { GROUND, ROCK } from './palette.js';

const T = 32;
const rgb = (s) => { const n = parseInt(s.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255, 255]; };
const G = GROUND.map(rgb), R = ROCK.map(rgb);
const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)).concat(255);

/** Ground colour at a pixel: low-contrast periodic noise plus sparse dither speckles. */
function ground(x, y) {
  const n = vnoise(x, y, 4, 9, 8);
  let k = n < 0.22 ? 1 : n > 0.8 ? 3 : 2;
  const h = hash2(x, y, 17, T);
  if (h > 0.99) k = 4; else if (h < 0.015) k = 0; else if (h > 0.93) k = 3;
  return G[k];
}

/** Interior-only decals for ground variants, so they never touch tile edges. */
function decal(variant, x, y) {
  if (variant === 0) return null;
  const r = (k) => hash2(variant, k, 101);
  // pebbles
  for (let p = 0; p < 2 + variant % 3; p++) {
    const cx = 6 + r(p * 3) * 20, cy = 6 + r(p * 3 + 1) * 20, rad = 1.2 + r(p * 3 + 2) * 1.6;
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d <= rad) return x + y < cx + cy - 0.5 ? G[4] : G[3];
    if (d <= rad + 1 && y + 0.5 > cy) return G[0];
  }
  // a crack on some variants
  if (variant % 3 === 2) {
    const x0 = 5 + r(20) * 8, y0 = 6 + r(21) * 6, x1 = 18 + r(22) * 8, y1 = 18 + r(23) * 8;
    const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2)));
    const px = x0 + (x1 - x0) * t + Math.sin(t * 9 + variant) * 1.5, py = y0 + (y1 - y0) * t;
    if (Math.abs(x + 0.5 - px) < 0.6 && Math.abs(y + 0.5 - py) < 1) return G[0];
  }
  return null;
}

export function groundTile(variant) { return image(T, T, (x, y) => decal(variant, x, y) || ground(x, y)); }

/** Rockness in [0,1] at a pixel of a dual tile with corner mask `m`, roughened by periodic noise. */
/** The noise fades out toward tile edges, so where an edge crosses a tile border it sits exactly where the
 *  corners put it and any variant of one tile joins any variant of its neighbour. */
function rockness(m, x, y, variant) {
  const c = [m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1];
  const u = Math.max(0, Math.min(1, (x + 0.5) / T)), v = Math.max(0, Math.min(1, (y + 0.5) / T));
  const b = c[0] * (1 - u) * (1 - v) + c[1] * u * (1 - v) + c[2] * (1 - u) * v + c[3] * u * v;
  const win = Math.min(1, Math.sin(Math.PI * u) * 2.2) * Math.min(1, Math.sin(Math.PI * v) * 2.2);
  return b + win * ((vnoise(x, y, 7, 41 + variant * 13, 0) - 0.5) * 0.42 + (vnoise(x, y, 3, 43 + variant * 13, 0) - 0.5) * 0.14);
}

const FACE = 6; // cliff face height in px

export function rockTile(m, variant = 0) {
  const isRock = (x, y) => m === 15 ? true : m === 0 ? false : rockness(m, x, y, variant) > 0.5;
  return image(T, T, (x, y) => {
    if (!isRock(x, y)) {
      // contact shadow on the ground just south and east of a cliff
      let shade = 0;
      for (let d = 1; d <= 3; d++) if (y - d >= 0 && isRock(x, y - d)) { shade = Math.max(shade, 0.55 - d * 0.12); }
      if (x - 1 >= 0 && isRock(x - 1, y)) shade = Math.max(shade, 0.25);
      const g = decal(variant, x, y) || ground(x, y);
      return shade ? mix(g, [6, 9, 14], shade) : g;
    }
    let below = 0; for (let d = 1; d <= FACE; d++) if (y + d < T && !isRock(x, y + d)) { below = d; break; }
    if (below) { // south-facing cliff: darker, with vertical strata and a lit lip at the top
      const strata = hash2(x, 0, 57 + variant, T) > 0.6 ? 1 : 0;
      if (below === FACE) return R[2];
      return R[Math.max(0, (below > FACE / 2 ? 1 : 0) + strata - (below === 1 ? 1 : 0))];
    }
    if (y === 0 ? false : !isRock(x, y - 1)) return R[5];          // north rim catches the light
    if (x > 0 && !isRock(x - 1, y)) return R[4];
    if (x < T - 1 && !isRock(x + 1, y)) return R[1];
    // plateau top: mottled, with darker pits
    const n = vnoise(x, y, 8, 61, 4) * 0.75 + vnoise(x, y, 3, 63, 0) * 0.25;
    if (hash2(x, y, 67 + variant, T) > 0.985) return R[2];
    return R[n < 0.3 ? 2 : n < 0.78 ? 3 : 4];
  });
}

export function terrainSprites() {
  const out = [];
  for (let v = 0; v < 6; v++) out.push({ name: `ground_${v}`, img: groundTile(v), anchor: { x: 0, y: 0 } });
  for (let m = 1; m < 16; m++) for (let v = 0; v < 3; v++) out.push({ name: `rock_${m}_${v}`, img: rockTile(m, v), anchor: { x: 0, y: 0 } });
  return out;
}
