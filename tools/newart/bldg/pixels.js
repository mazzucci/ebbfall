// Pictures to sprites, plain arithmetic on RGBA floats (no canvas, so the same on every machine): the green key, the
// team paint taken out into a mask, the downscale, the ground shadow. An image here is { w, h, d } with d a Float32Array
// of straight (not premultiplied) RGBA, 0..255. tools/newart/bldg/build.mjs holds every tuned number.

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const median = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1] ?? 0; };
export const image = (w, h) => ({ w, h, d: new Float32Array(w * h * 4) });

/** The background's color (the median of the picture's border) and how green it is (g over the larger of r and b; the
 *  `low` share of the border's, so a background in several greens is background all over). */
function background({ w, h, d }, low = 0.1) {
  const ch = [[], [], []], g = [];
  for (let k = 0; k < w; k += 3) for (const [x, y] of [[k, 2], [k, h - 3], [2, k], [w - 3, k]]) {
    const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) ch[c].push(d[i + c]);
    g.push(d[i + 1] - Math.max(d[i], d[i + 2]));
  }
  g.sort((a, b) => a - b);
  return { rgb: ch.map(median), green: g[Math.floor(g.length * low)] };
}

/**
 * The green background keyed out of `im`, in place. Every pixel is read as background showing through by the share
 * `t` its greenness is of the background's: at an edge that is its coverage, and the background is taken out of its color.
 * What the border does not reach (glass one sees the background through) keeps at least `glass` of its opacity: a
 * tinted pane, not a hole.
 */
export function keyGreen(im, { edge = [0.07, 0.72], glass = 0.8, low } = {}) {
  const { w, h, d } = im, bg = background(im, low), n = w * h, t = new Float32Array(n), out = new Uint8Array(n);
  for (let q = 0, i = 0; q < n; q++, i += 4) t[q] = clamp((d[i + 1] - Math.max(d[i], d[i + 2])) / bg.green);
  // What the border reaches through background, and 3 px of edge beyond it.
  const stack = []; const push = (q) => { if (!out[q] && t[q] > 0.6) { out[q] = 1; stack.push(q); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) { const q = stack.pop(), x = q % w; if (x) push(q - 1); if (x < w - 1) push(q + 1); if (q >= w) push(q - w); if (q < n - w) push(q + w); }
  grow(out, w, h, 3);
  for (let q = 0, i = 0; q < n; q++, i += 4) {
    const s = t[q], a = out[q] ? 1 - smooth(edge[0], edge[1], s) : s > 0.85 ? 0 : Math.max(glass, 1 - s);
    if (s > 0.02 && s < 0.97) for (let c = 0; c < 3; c++) d[i + c] = clamp((d[i + c] - s * bg.rgb[c]) / (1 - s), 0, 255);
    const lim = Math.max(d[i], d[i + 2]); if (d[i + 1] > lim) d[i + 1] = lim + (d[i + 1] - lim) * 0.15; // (no green left over)
    d[i + 3] = a * 255;
  }
  return bg;
}
/** A 0/1 map grown by `r` px (4-neighbors, r times). */
function grow(m, w, h, r) {
  for (let k = 0; k < r; k++) { const s = m.slice(); for (let q = 0; q < m.length; q++) if (!s[q]) { const x = q % w; if ((x && s[q - 1]) || (x < w - 1 && s[q + 1]) || (q >= w && s[q - w]) || (q < m.length - w && s[q + w])) m[q] = 1; } }
}

/**
 * The magenta player color taken out of `im` (in place: neutral there, no pink edge) and returned as the team mask:
 * white paint shaded as the picture's is, its full paint at `level` (today's masks are about 230), the paint's share as
 * its opacity. `shade`: [[x0, k]...] in picture px: from x0 on the paint is k as bright (a flat band round a corner).
 */
export function takePaint(im, { level = 240, shade = [] } = {}) {
  const { w, h, d } = im, n = w * h, m = image(w, h), s = new Float32Array(n), P = [[], [], []];
  const sat = (i) => { const r = d[i], g = d[i + 1], b = d[i + 2]; return r < 40 ? 0 : Math.min((r - g) / r / 0.85, b > g ? (b - g) / r / 0.28 : 0); };
  for (let q = 0, i = 0; q < n; q++, i += 4) { s[q] = d[i + 3] > 40 ? sat(i) : 0; if (s[q] > 0.97 && q % 7 === 0) for (let c = 0; c < 3; c++) P[c].push(d[i + c]); }
  const p = P.map(median); // (the picture's paint)
  const near = new Uint8Array(n); for (let q = 0; q < n; q++) near[q] = s[q] > 0.6 ? 1 : 0;
  grow(near, w, h, 4); // (the paint and the edge the JPEG's color smeared it into)
  for (let q = 0, i = 0; q < n; q++, i += 4) {
    if (!near[q]) { // (the paint's pink light on what is round it: warm or gray as the rest)
      const g = d[i + 1]; if (d[i + 2] > g && d[i] > d[i + 2]) { d[i + 2] = g; d[i] = Math.min(d[i], g * 1.16 + 4); }
      continue;
    }
    // Its share: whole where it is as saturated as the paint (dark folds too), else what of the paint explains its color.
    const r = d[i], g = d[i + 1], b = d[i + 2], lin = Math.min((r - g) / (p[0] - p[1]), b > g ? (b - g) / (p[2] - p[1]) : 0);
    const a = Math.max(smooth(0.6, 0.85, s[q]), clamp(lin)), k = a < 0.08 ? 0 : a;
    const x = q % w, sh = shade.reduce((v, [x0, f]) => (x >= x0 ? f : v), 1);
    const L = clamp((r / p[0]) * level * sh, 30, 255), gray = k > 0.85 ? L : clamp((Math.min(g, b) - k * Math.min(p[1], p[2])) / (1 - k), 0, 255);
    for (let c = 0; c < 3; c++) { d[i + c] = k > 0.85 ? L * 0.85 : k > 0 ? gray : Math.min(r, Math.max(g, b) + 14) * (c === 0) + (c === 1 ? g : 0) + (c === 2 ? b : 0); m.d[i + c] = L; }
    m.d[i + 3] = k * d[i + 3];
  }
  return m;
}

/** `im` drawn into a w x h frame at scale `s`, the picture's (px, py) on the frame's (fx, fy): each frame px is the mean of
 *  the picture's under it (premultiplied), then sharpened by `sharp`. */
export function fit(im, s, px, py, fx, fy, w, h, sharp = 0) {
  const pass = (src, sw, sh, dw, s0, o0) => { // rows of sw -> dw, then turned, so twice is both ways
    const out = new Float32Array(dw * sh * 4);
    for (let x = 0; x < dw; x++) {
      const a = (x - o0) / s0, b = (x + 1 - o0) / s0, i0 = Math.max(0, Math.floor(a)), i1 = Math.min(sw - 1, Math.ceil(b) - 1);
      for (let i = i0; i <= i1; i++) { const f = (Math.min(b, i + 1) - Math.max(a, i)) * s0; if (f > 0) for (let y = 0; y < sh; y++) { const p = (y * sw + i) * 4, q = (x * sh + y) * 4; for (let c = 0; c < 4; c++) out[q + c] += src[p + c] * f; } }
    }
    return out;
  };
  const pre = new Float32Array(im.d.length);
  for (let i = 0; i < pre.length; i += 4) { const a = im.d[i + 3] / 255; for (let c = 0; c < 3; c++) pre[i + c] = im.d[i + c] * a; pre[i + 3] = im.d[i + 3]; }
  const m = pass(pass(pre, im.w, im.h, w, s, fx - px * s), im.h, w, h, s, fy - py * s); // (m: h-major again after two turns)
  const out = image(w, h);
  for (let i = 0; i < m.length; i += 4) { const a = m[i + 3] / 255; out.d[i + 3] = m[i + 3]; if (a > 0.002) for (let c = 0; c < 3; c++) out.d[i + c] = m[i + c] / a; }
  return sharp ? sharpen(out, sharp) : out;
}
/** An unsharp mask of the colors (its neighbors' mean, only those as solid). */
function sharpen(im, k) {
  const { w, h, d } = im, out = { w, h, d: d.slice() };
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4; if (d[i + 3] < 200) continue;
    for (let c = 0; c < 3; c++) { let s = 0, n = 0; for (const o of [-4, 4, -w * 4, w * 4]) if (d[i + o + 3] >= 200) { s += d[i + o + c]; n++; } if (n) out.d[i + c] = clamp(d[i + c] + k * (d[i + c] - s / n), 0, 255); }
  }
  return out;
}

/** A single channel blurred by a box of `r` px each way, `n` times (near a Gaussian). */
export function blur(a, w, h, r, n = 2) {
  for (let k = 0; k < n; k++) for (const [len, count, step, jump] of [[w, h, 1, w], [h, w, w, 1]]) {
    const o = new Float32Array(a.length);
    for (let j = 0; j < count; j++) { let s = 0; const at = (i) => (i < 0 || i >= len ? 0 : a[j * jump + i * step]); for (let i = -r; i <= r; i++) s += at(i); for (let i = 0; i < len; i++) { o[j * jump + i * step] = s / (2 * r + 1); s += at(i + r + 1) - at(i - r); } }
    a = o;
  }
  return a;
}
/** The picture's lit parts glow a little on what is round them: `lit(r, g, b)` (0..1) picks them, blurred by `r` px and
 *  added at `k` in their own color, inside the body only. In place. */
export function bloom(im, lit, r, k) {
  const { w, h, d } = im, ch = [0, 1, 2].map(() => new Float32Array(w * h));
  for (let q = 0, i = 0; q < w * h; q++, i += 4) { const l = d[i + 3] > 128 ? lit(d[i], d[i + 1], d[i + 2]) : 0; for (let c = 0; c < 3; c++) ch[c][q] = d[i + c] * l; }
  const b = ch.map(a => blur(a, w, h, r, 3));
  for (let q = 0, i = 0; q < w * h; q++, i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp(d[i + c] + b[c][q] * k, 0, 255);
}

/** The convex hull of points [x, y]. */
function hull(p) {
  p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), half = (q) => { const o = []; for (const a of q) { while (o.length > 1 && cross(o[o.length - 2], o[o.length - 1], a) <= 0) o.pop(); o.push(a); } o.pop(); return o; };
  return [...half(p), ...half(p.reverse())];
}
/** Coverage (0..1) of convex polygons, 4 x 4 samples a px. */
export function cover(polys, w, h) {
  const a = new Float32Array(w * h);
  for (const pts of polys) {
    const P = hull(pts), x0 = Math.max(0, Math.floor(Math.min(...P.map(p => p[0])))), x1 = Math.min(w - 1, Math.ceil(Math.max(...P.map(p => p[0])))), y0 = Math.max(0, Math.floor(Math.min(...P.map(p => p[1])))), y1 = Math.min(h - 1, Math.ceil(Math.max(...P.map(p => p[1]))));
    const inside = (x, y) => { for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; if ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) < 0) return 0; } return 1; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { let n = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) n += inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4); a[y * w + x] = Math.max(a[y * w + x], n / 16); }
  }
  return a;
}
/** The shadow (0..1 a px) of `im`'s silhouette standing on the row `line`: a px `h` rows above it falls `dx h` east and
 *  `dy h` south of its foot; 3 x 3 samples a px. */
export function silhouette(im, line, dx, dy) {
  const { w, h, d } = im, a = new Float32Array(w * h);
  const at = (x, y) => { const i = Math.floor(x), j = Math.floor(y); return i < 0 || j < 0 || i >= w || j >= h ? 0 : d[(j * w + i) * 4 + 3] > 127 ? 1 : 0; };
  for (let y = Math.max(0, Math.floor(line)); y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const g = y + (j + 0.5) / 3 - line; if (g > 0) n += at(x + (i + 0.5) / 3 - g / dy * dx, line - g / dy); }
    a[y * w + x] = n / 9;
  }
  return a;
}
/** `im` over `color` ('#rrggbb') of opacity `a` (0..1 a px). */
export function overShadow(im, a, color) {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)), out = image(im.w, im.h);
  for (let q = 0, i = 0; q < a.length; q++, i += 4) { const k = im.d[i + 3] / 255, t = k + a[q] * (1 - k); out.d[i + 3] = t * 255; if (t > 0) for (let c = 0; c < 3; c++) out.d[i + c] = (im.d[i + c] * k + rgb[c] * a[q] * (1 - k)) / t; }
  return out;
}
/** The 8-bit pixels of `im`, the color carried `n` px out under the clear ones (no dark fringe when a mipmap or a filter
 *  reads them). */
export function bytes(im, n = 6) {
  const { w, h } = im, d = im.d.slice();
  for (let k = 0; k < n; k++) { const s = d.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (s[i + 3] >= 0.5 || s[i] + s[i + 1] + s[i + 2] > 0) continue; let c = 0; const m = [0, 0, 0]; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const j = (Y * w + X) * 4; if (s[j] + s[j + 1] + s[j + 2] > 0) { c++; for (let q = 0; q < 3; q++) m[q] += s[j + q]; } } if (c) for (let q = 0; q < 3; q++) d[i + q] = m[q] / c; } }
  return { w, h, data: Uint8Array.from(d, v => Math.round(clamp(v, 0, 255))) };
}
/** The box of `im` (or a channel) above `min` opacity: [x0, y0, x1, y1], or null. */
export function box({ w, h, d }, min = 2) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
/** Cut [x0, y0, x1, y1] (inclusive) out of `im`. */
export function crop(im, [x0, y0, x1, y1]) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = image(w, h);
  for (let y = 0; y < h; y++) out.d.set(im.d.subarray(((y + y0) * im.w + x0) * 4, ((y + y0) * im.w + x0 + w) * 4), y * w * 4);
  return out;
}
