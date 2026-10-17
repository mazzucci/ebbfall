// Small helpers shared by sim and client. Nothing here touches the DOM or global state.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => a + (b - a) * t;

export const fmt = (s) => {
  s = Math.floor(s);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/** Seeded PRNG (mulberry32). Deterministic across engines: integer math only. */
export function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise with three octaves, built from a seeded permutation. */
export function makeNoise(rnd) {
  const P = new Uint8Array(512);
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [P[i], P[j]] = [P[j], P[i]];
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const h = (x, y) => P[(P[x & 255] + y) & 255] / 255;
  const sm = (t) => t * t * (3 - 2 * t);
  const val = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), fx), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), fx), fy);
  };
  return (x, y) => 0.6 * val(x, y) + 0.3 * val(x * 2.1 + 7, y * 2.1 + 3) + 0.1 * val(x * 4.3 + 11, y * 4.3 + 5);
}
