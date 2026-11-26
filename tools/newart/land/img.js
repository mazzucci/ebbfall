// Plain pixel arithmetic for the land's builder (Node, no canvas): images are `{ w, h, data }`, RGBA 8 bits, not
// premultiplied. Every step is integer or exact float arithmetic on the decoded bytes: the same input, the same output.

export const blank = (w, h) => ({ w, h, data: new Uint8Array(w * h * 4) });

/** Key a sheet's flat magenta background out, in place (the still's own key, nano-test/scene-flat.mjs): how far red
 *  and blue stand over green is how much background a pixel is; the spill left in the edges is pulled back to green. */
export function keyMagenta(img, { lo = 14, span = 60, red = 14, blue = 2 } = {}) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], q = Math.min(r, b) - g;
    if (q > lo) d[i + 3] = Math.max(0, Math.min(255, Math.round(255 * (1 - (q - lo) / span))));
    if (q > 0) { d[i] = Math.min(r, g + red); d[i + 2] = Math.min(b, g + blue); }
  }
  return img;
}

/** Key a flat green background out, in place (the still's own key for the buildings): how far green stands over red
 *  and blue; the spill in the edges pulled back. */
export function keyGreen(img) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], q = g - Math.max(r, b);
    if (q > 22) d[i + 3] = Math.max(0, Math.min(255, Math.round(255 * (1 - (q / Math.max(60, g) - 0.14) / 0.28))));
    if (q > 0 && b < g * 0.85) d[i + 1] = Math.min(g, Math.max(r, b) + 4);
  }
  return img;
}

/** The separate things on a keyed sheet: connected parts of its solid pixels (alpha from `solid`), joined across gaps
 *  of `gap` px (a tree's loose twigs are its own), each of at least `min` px, in reading order by rows of the sheet:
 *  `[{ x, y, w, h, area, mask }]`, `mask` a byte per pixel of the box (1: this part's). Labeled at half size. */
export function parts(img, { solid = 90, gap = 6, min = 3000 } = {}) {
  const W = img.w >> 1, H = img.h >> 1, a = new Uint8Array(W * H), d = img.data, g = Math.max(1, gap >> 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) m = Math.max(m, d[((y * 2 + dy) * img.w + x * 2 + dx) * 4 + 3]);
    a[y * W + x] = m >= solid ? 1 : 0;
  }
  const lab = new Int32Array(W * H), out = [], stack = [];
  for (let p = 0; p < W * H; p++) {
    if (lab[p] || !a[p]) continue;
    const n = out.length + 1; let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;
    lab[p] = n; stack.push(p);
    while (stack.length) {
      const q = stack.pop(), x = q % W, y = (q - x) / W; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let oy = -g; oy <= g; oy++) for (let ox = -g; ox <= g; ox++) {
        const u = x + ox, v = y + oy; if (u < 0 || v < 0 || u >= W || v >= H) continue;
        const z = v * W + u; if (!lab[z] && a[z]) { lab[z] = n; stack.push(z); }
      }
    }
    out.push({ n, x: x0 * 2, y: y0 * 2, w: (x1 - x0 + 1) * 2, h: (y1 - y0 + 1) * 2, area: area * 4 });
  }
  const kept = out.filter(p => p.area >= min);
  // (reading order: rows of the sheet by the parts' vertical overlap, then left to right)
  kept.sort((p, q) => p.y - q.y);
  const rows = [];
  for (const p of kept) { const r = rows.find(r => p.y < r.y1 - (r.y1 - r.y0) * 0.5); if (r) { r.list.push(p); r.y1 = Math.max(r.y1, p.y + p.h); } else rows.push({ y0: p.y, y1: p.y + p.h, list: [p] }); }
  const order = rows.flatMap(r => r.list.sort((p, q) => p.x - q.x));
  for (const p of order) {
    p.mask = new Uint8Array(p.w * p.h);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (lab[((p.y + y) >> 1) * W + ((p.x + x) >> 1)] === p.n) p.mask[y * p.w + x] = 1;
  }
  return order;
}

/** One part of a sheet as an image of its own: its box, other parts' pixels cleared. */
export function cut(img, p) {
  const o = blank(p.w, p.h);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (!p.mask[y * p.w + x]) continue;
    const s = ((p.y + y) * img.w + p.x + x) * 4, t = (y * p.w + x) * 4;
    o.data[t] = img.data[s]; o.data[t + 1] = img.data[s + 1]; o.data[t + 2] = img.data[s + 2]; o.data[t + 3] = img.data[s + 3];
  }
  return o;
}

/** An image at `k` of its size (k <= 1, or a little over): each new pixel the area average of what it covers, colors
 *  weighted by alpha. `wrap`: the picture tiles, so nothing is special at its edges (the same arithmetic either way:
 *  boxes never cross the edge when the new size divides the old). */
export function scale(img, k, w = Math.max(1, Math.round(img.w * k)), h = Math.max(1, Math.round(img.h * k))) {
  const o = blank(w, h), fx = img.w / w, fy = img.h / h, d = img.data;
  for (let y = 0; y < h; y++) {
    const y0 = y * fy, y1 = (y + 1) * fy;
    for (let x = 0; x < w; x++) {
      const x0 = x * fx, x1 = (x + 1) * fx;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let v = Math.floor(y0); v < Math.min(img.h, Math.ceil(y1)); v++) {
        const wy = Math.min(v + 1, y1) - Math.max(v, y0);
        for (let u = Math.floor(x0); u < Math.min(img.w, Math.ceil(x1)); u++) {
          const wt = wy * (Math.min(u + 1, x1) - Math.max(u, x0)), s = (v * img.w + u) * 4, al = d[s + 3] * wt;
          r += d[s] * al; g += d[s + 1] * al; b += d[s + 2] * al; a += al; n += wt;
        }
      }
      const t = (y * w + x) * 4;
      if (a > 0) { o.data[t] = Math.round(r / a); o.data[t + 1] = Math.round(g / a); o.data[t + 2] = Math.round(b / a); o.data[t + 3] = Math.round(a / n); }
    }
  }
  return o;
}

/** The box of an image's pixels with alpha over `min`: `{ x0, y0, x1, y1 }` inclusive, or null. */
export function box(img, min = 128) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** The solid span of row `y`: `[first, last]` x with alpha over `min`, or null. */
export function span(img, y, min = 128) {
  let a = -1, b = -1;
  for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > min) { if (a < 0) a = x; b = x; }
  return a < 0 ? null : [a, b];
}

/** A box blur of one channel plane (Float32Array w x h), `r` px each way, twice (near a Gaussian). */
export function blur(p, w, h, r) {
  if (r < 1) return p;
  const pass = (src, horiz) => {
    const out = new Float32Array(w * h), n = horiz ? w : h, m = horiz ? h : w;
    for (let j = 0; j < m; j++) {
      let s = 0; const at = (i) => src[horiz ? j * w + i : i * w + j];
      for (let i = -r; i <= r; i++) s += at(Math.max(0, Math.min(n - 1, i)));
      for (let i = 0; i < n; i++) { out[horiz ? j * w + i : i * w + j] = s / (2 * r + 1); s += at(Math.min(n - 1, i + r + 1)) - at(Math.max(0, i - r)); }
    }
    return out;
  };
  let q = p; for (let k = 0; k < 2; k++) q = pass(pass(q, true), false);
  return q;
}

/** Draw `src` over `dst` at (x, y), alpha over alpha. */
export function over(dst, src, x, y) {
  for (let v = 0; v < src.h; v++) for (let u = 0; u < src.w; u++) {
    const X = x + u, Y = y + v; if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue;
    const s = (v * src.w + u) * 4, t = (Y * dst.w + X) * 4, sa = src.data[s + 3] / 255; if (!sa) continue;
    const da = dst.data[t + 3] / 255, oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) dst.data[t + c] = Math.round((src.data[s + c] * sa + dst.data[t + c] * da * (1 - sa)) / oa);
    dst.data[t + 3] = Math.round(oa * 255);
  }
}

/** Colors carried out under the transparent pixels round the paint, `n` px far, in place: a filtered or lossy edge
 *  then mixes with the paint's own color, never with black. */
export function bleed(img, n = 6) {
  const { w, h, data: d } = img; let known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  for (let k = 0; k < n; k++) {
    const next = known.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (known[i]) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !known[Y * w + X]) continue;
        const s = (Y * w + X) * 4; r += d[s]; g += d[s + 1]; b += d[s + 2]; c++;
      }
      if (c) { d[i * 4] = Math.round(r / c); d[i * 4 + 1] = Math.round(g / c); d[i * 4 + 2] = Math.round(b / c); next[i] = 1; }
    }
    known = next;
  }
  return img;
}

/** Shelf-pack `items` (`{ img }`) into a page `width` px wide with `gap` px between: sets each one's `x`, `y`; returns
 *  the page's height. Tallest first, ties in the order given. */
export function pack(items, width, gap) {
  const order = items.map((it, i) => [it, i]).sort((a, b) => b[0].img.h - a[0].img.h || a[1] - b[1]);
  let x = gap, y = gap, row = 0;
  for (const [it] of order) {
    if (x + it.img.w + gap > width) { x = gap; y += row + gap; row = 0; }
    if (it.img.w + 2 * gap > width) throw new Error('pack: a piece is wider than the page');
    it.x = x; it.y = y; x += it.img.w + gap; row = Math.max(row, it.img.h);
  }
  return y + row + gap;
}
