// A tiny software rasterizer for pixel art. Shapes are filled by testing pixel centres (no anti-aliasing),
// each pixel stores a material and a height, and shade() turns that into colours with a fixed top-left light,
// so a sprite drawn at any rotation is lit the same way. Pure JS: runs in Node, no canvas needed.

export class Sprite {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.mat = new Array(w * h).fill(null); // material name or null (empty)
    this.ht = new Float32Array(w * h);      // height above ground, for lighting
    this.alpha = new Float32Array(w * h).fill(1);
    this.t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; // affine transform for shape coordinates
  }
  /** Rotate by `ang` around (cx, cy), shape coordinates then relative to that centre. */
  frame(cx, cy, ang = 0) { const c = Math.cos(ang), s = Math.sin(ang); this.t = { a: c, b: s, c: -s, d: c, e: cx, f: cy }; return this; }
  xf(x, y) { const t = this.t; return [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f]; }
  inv(px, py) { const t = this.t, det = t.a * t.d - t.b * t.c, x = px - t.e, y = py - t.f; return [(t.d * x - t.c * y) / det, (-t.b * x + t.a * y) / det]; }
  put(x, y, mat, h, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x; this.mat[i] = mat; this.ht[i] = h; this.alpha[i] = alpha;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.mat[y * this.w + x]; }
  height(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h || !this.mat[y * this.w + x] ? 0 : this.ht[y * this.w + x]; }

  /** Fill pixels whose centre satisfies inside(localX, localY); height may be a number or fn(lx, ly). */
  fill(bounds, inside, mat, h, alpha) {
    const [x0, y0, x1, y1] = bounds;
    for (let py = Math.max(0, Math.floor(y0)); py <= Math.min(this.h - 1, Math.ceil(y1)); py++)
      for (let px = Math.max(0, Math.floor(x0)); px <= Math.min(this.w - 1, Math.ceil(x1)); px++) {
        const [lx, ly] = this.inv(px + 0.5, py + 0.5);
        if (inside(lx, ly)) this.put(px, py, mat, typeof h === 'function' ? h(lx, ly) : h, alpha);
      }
    return this;
  }
  bbox(pts) { const P = pts.map(([x, y]) => this.xf(x, y)); return [Math.min(...P.map(p => p[0])) - 1, Math.min(...P.map(p => p[1])) - 1, Math.max(...P.map(p => p[0])) + 1, Math.max(...P.map(p => p[1])) + 1]; }

  poly(pts, mat, h = 1, alpha) {
    const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    return this.fill(this.bbox(pts), inside, mat, h, alpha);
  }
  rect(x, y, w, h, mat, ht = 1, alpha) { return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], mat, ht, alpha); }
  /** Ellipse; `dome` > 0 bulges the height toward the centre so it shades like a rounded surface. */
  ellipse(cx, cy, rx, ry, mat, h = 1, dome = 0, alpha) {
    const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const ht = dome ? (x, y) => h + dome * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2)) : h;
    return this.fill(this.bbox([[cx - rx, cy - ry], [cx + rx, cy - ry], [cx + rx, cy + ry], [cx - rx, cy + ry]]), inside, mat, ht, alpha);
  }
  circle(cx, cy, r, mat, h, dome, alpha) { return this.ellipse(cx, cy, r, r, mat, h, dome, alpha); }
  ring(cx, cy, r0, r1, mat, h = 1, alpha) {
    const inside = (x, y) => { const d = Math.hypot(x - cx, y - cy); return d >= r0 && d <= r1; };
    return this.fill(this.bbox([[cx - r1, cy - r1], [cx + r1, cy - r1], [cx + r1, cy + r1], [cx - r1, cy + r1]]), inside, mat, h, alpha);
  }
  /** A thick line segment with square ends. */
  line(x0, y0, x1, y1, width, mat, h = 1, alpha) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L * width / 2, ny = dx / L * width / 2;
    return this.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], mat, h, alpha);
  }
  /** Erase pixels (screen space) matching a predicate. */
  erase(pred) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (pred(x, y)) this.mat[y * this.w + x] = null; return this; }
}

const hex = (s) => { const n = parseInt(s.slice(1), 16); return s.length > 7 ? [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255] : [n >> 16, (n >> 8) & 255, n & 255, 255]; };

/**
 * Turn materials into RGBA. `ramps` maps a material name to colours from dark to light (hex strings); the middle
 * entry is the base tone. Light comes from the top-left: a pixel higher than its up-left neighbour steps up the
 * ramp, higher than its down-right neighbour steps down. Materials listed in `flat` skip lighting.
 * Empty pixels touching filled ones get `outline` (if given); `glow` materials ignore the outline.
 */
export function shade(spr, ramps, { outline = '#0b0f16', flat = [], noOutline = [], patterns = PATTERNS, ao = true } = {}) {
  const { w, h } = spr, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = spr.mat[y * w + x]; if (!m) continue;
    const ramp = ramps[m]; if (!ramp) throw new Error('no ramp for material ' + m);
    let k = (ramp.length - 1) >> 1;
    if (!flat.includes(m) && ramp.length > 1) {
      const hh = spr.ht[y * w + x];
      const up = hh - spr.height(x - 1, y - 1), dn = hh - spr.height(x + 1, y + 1);
      if (up > 0.35) k++; if (up > 2.5) k++;
      if (dn > 0.35) k--; if (dn > 2.5) k--;
      if (ao && up <= 0.35) { // ambient occlusion: tucked in next to something taller
        let occ = false;
        for (let dy = -2; dy <= 2 && !occ; dy++) for (let dx = -2; dx <= 2; dx++) if (spr.height(x + dx, y + dy) > hh + 1.5) { occ = true; break; }
        if (occ) k--;
      }
      if (patterns[m]) k += patterns[m](x, y);
      k = Math.max(0, Math.min(ramp.length - 1, k));
    }
    const c = hex(ramp[k]), o = (y * w + x) * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = Math.round(c[3] * spr.alpha[y * w + x]);
  }
  if (outline) {
    const oc = hex(outline);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (spr.mat[y * w + x]) continue;
      const n = [spr.get(x - 1, y), spr.get(x + 1, y), spr.get(x, y - 1), spr.get(x, y + 1)];
      if (n.some(m => m && !noOutline.includes(m))) { const o = (y * w + x) * 4; out[o] = oc[0]; out[o + 1] = oc[1]; out[o + 2] = oc[2]; out[o + 3] = oc[3]; }
    }
  }
  return { w, h, data: out };
}

/** Surface detail per material, as ramp steps added at a pixel (screen space, so it does not rotate). */
export const PATTERNS = {
  hazard: (x, y) => (((x + y) >> 2) & 1 ? -1 : 0),
  concrete: (x, y) => (x % 16 === 0 || y % 16 === 0 ? -1 : hash2(x, y, 5) > 0.92 ? 1 : hash2(x, y, 6) > 0.94 ? -1 : 0),
  plate: (x, y) => (x % 12 === 0 || y % 10 === 0 ? -1 : (x % 12 === 2 && y % 10 === 2) ? 1 : 0),
  team: (x, y) => (y % 16 === 15 ? -1 : hash2(x, y, 9) > 0.96 ? 1 : 0),
  ventRim: (x, y) => (hash2(x, y, 11) > 0.8 ? 1 : hash2(x, y, 12) > 0.85 ? -1 : 0),
};

/** An image made directly from a per-pixel function returning [r, g, b, a] (0-255). */
export function image(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); const o = (y * w + x) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3]; }
  return { w, h, data };
}

/** Deterministic hash noise in [0, 1) for integer coordinates; `p` makes it periodic (tileable). */
export function hash2(x, y, seed = 0, p = 0) {
  if (p) { x = ((x % p) + p) % p; y = ((y % p) + p) % p; }
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, periodic with period `p` (in cells of `scale` pixels) when p > 0. */
export function vnoise(x, y, scale, seed = 0, p = 0) {
  const fx = x / scale, fy = y / scale, xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi;
  const s = (t) => t * t * (3 - 2 * t), a = hash2(xi, yi, seed, p), b = hash2(xi + 1, yi, seed, p), c = hash2(xi, yi + 1, seed, p), d = hash2(xi + 1, yi + 1, seed, p);
  return a + (b - a) * s(tx) + (c - a) * s(ty) + (a - b - c + d) * s(tx) * s(ty);
}
