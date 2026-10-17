// Image and noise helpers for the painted parts of the art (terrain, effects). Pure JS: runs in Node.

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
