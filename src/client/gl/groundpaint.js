// The ground options' overlay tiles (a prototype behind ?ground=N, see groundplan.js), painted per pixel when a map
// loads: nothing to download. Pure (no DOM: gl/render.js puts the pixels in a canvas). Each overlay ground (worn dirt,
// a straw meadow, clover, flat slabs of bedrock) is a set of tiles on the terrain's own corner-mask dual grid (bit 1
// TL, 2 TR, 4 BL, 8 BR: which of a cell's four tiles the ground covers), drawn over the grass tile with its own alpha.
// As tools/art/terrain3.js does for the rock: the edge's noise is periodic over a tile and shared by every variant, so
// an edge leaving one tile continues into the next, and a variant's own marks fade out before the tile's rim.

export const OT = 64, GUTTER = 2, CELL = OT + 2 * GUTTER, VARIANTS = 3;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** A hash of a pixel or cell, periodic with period p (0: not), and value noise over cells of sx x sy pixels. */
function ph(x, y, seed, p = 0) {
  if (p) { x = ((x % p) + p) % p; y = ((y % p) + p) % p; }
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function pn(x, y, sx, sy, seed) { // (periodic over the tile: OT / sx by OT / sy cells)
  const fx = x / sx, fy = y / sy, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi, px = OT / sx, py = OT / sy;
  const w = (a, b) => { a = ((a % px) + px) % px; b = ((b % py) + py) % py; return ph(a, b, seed); };
  const s = (t) => t * t * (3 - 2 * t), a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v);
}
/** A value per pixel of the tile, worked out once and read back periodically (what does not depend on the mask or the
 *  variant is the same in all 45 tiles of a ground: the edge's wobble, the stones, the grain). */
function per(fn) {
  const a = new Float32Array(OT * OT); for (let y = 0; y < OT; y++) for (let x = 0; x < OT; x++) a[y * OT + x] = fn(x, y);
  return (x, y) => a[(((y % OT) + OT) % OT) * OT + (((x % OT) + OT) % OT)];
}
/** How far inside the overlay a pixel of mask m's tile is: the corners blended, the shared wobble added; its 0.5 the edge. */
function edge(seed) {
  const wob = per((x, y) => (pn(x, y, 16, 16, seed) - 0.5) * 0.34 + (pn(x, y, 4, 4, seed + 2) - 0.5) * 0.12);
  return (m, x, y) => {
    const u = clamp01((x + 0.5) / OT), v = clamp01((y + 0.5) / OT);
    return (m & 1) * (1 - u) * (1 - v) + ((m >> 1) & 1) * u * (1 - v) + ((m >> 2) & 1) * (1 - u) * v + ((m >> 3) & 1) * u * v + wob(x, y);
  };
}
/** A variant's own blobs: `count` soft dots of radius about r px, kept off the tile's rim; 0-1 at a pixel. */
function dots(x, y, vs, count, r) {
  let best = 0;
  for (let k = 0; k < count; k++) {
    const cx = 12 + ph(k, 1, vs) * 40, cy = 12 + ph(k, 2, vs) * 40, rr = r * (0.7 + ph(k, 3, vs) * 0.7), dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    best = Math.max(best, 1 - Math.sqrt(dx * dx + dy * dy) / rr);
  }
  return clamp01(best * 2.5);
}

/** The stone (or tuft, or leaf) a pixel belongs to, on a jittered grid of S px cells (periodic over the tile): how far
 *  it is from the stone's rim (`rim`, px), the stone's own draw (`id`, 0-1) and the pixel's place from its middle. */
function cellAt(x, y, S, seed, squash) {
  const cx0 = Math.floor(x / S), cy0 = Math.floor(y / S), P = OT / S;
  let d1 = 99, d2 = 99, id = 0, ox = 0, oy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = cx0 + i, cy = cy0 + j, px = (cx + 0.5 + (ph(cx, cy, seed, P) - 0.5) * 0.7) * S, py = (cy + 0.5 + (ph(cx, cy, seed + 2, P) - 0.5) * 0.7) * S;
    const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.sqrt(dx * dx + dy * dy * squash);
    if (d < d1) { d2 = d1; d1 = d; id = ph(cx, cy, seed + 4, P); ox = dx; oy = dy; } else if (d < d2) d2 = d;
  }
  return { rim: d2 - d1, d: d1, id, ox, oy };
}
function cells(S, seed, squash = 1.5) {
  const a = []; for (let y = 0; y < OT; y++) for (let x = 0; x < OT; x++) a.push(cellAt(x, y, S, seed, squash));
  return (x, y) => a[(((y % OT) + OT) % OT) * OT + (((x % OT) + OT) % OT)];
}

// The colors: tools/art/terrain3.js's own (the marks' dusty tan warmed toward the buildings' worn ground, the straw
// green, the hill's grays), so the overlays are of the family.
const DIRT = [140, 122, 86], DIRT_DARK = [110, 94, 64], DIRT_WORN = [160, 142, 104], PEBBLE = [150, 144, 128];
const STRAW = [124, 124, 66], STRAW_LIT = [158, 152, 90], STRAW_DARK = [98, 106, 56];
const CLOVER = [48, 88, 50], CLOVER_LIT = [64, 106, 58];
const SLAB = [150, 141, 118], SLAB_LIT = [170, 161, 137], SLAB_DARK = [120, 112, 92], SEAM = [70, 84, 50];
const CRAG = [140, 138, 130], CRAG_LIT = [168, 166, 156], CRAG_DARK = [112, 110, 103], CRAG_FACE = [36, 34, 32], CRAG_FACE2 = [78, 74, 68], CRACK = [62, 60, 56];

/** Each ground's painter: called once, it works out what all its tiles share and returns the pixel's function:
 *  [r, g, b, alpha 0-1] for mask m, variant v at (x, y). */
const PAINT = {
  // Worn dirt: a track's or a yard's. Bare in its middle (paler where most trodden), its rim eaten by the grass in
  // grains, a pebble or two and a tuft of grass left standing.
  dirt() {
    const inside = edge(211), grainAt = per((x, y) => ph(x >> 1, y >> 1, 215, OT / 2)), nAt = per((x, y) => pn(x, y, 8, 8, 221) * 0.55 + pn(x, y, 4, 4, 223) * 0.25 + ph(x, y, 225, OT) * 0.2);
    return (m, v, x, y) => {
      const e = inside(m, x, y), grain = grainAt(x, y), vs = 700 + m * 7 + v;
      let c = mix(mix(DIRT_DARK, DIRT, nAt(x, y)), DIRT_WORN, smooth(0.8, 1.05, e) * 0.55);
      if (ph(x >> 1, y >> 1, vs + 5, OT / 2) > 0.986) c = mix(c, PEBBLE, 0.55);
      const tuft = e > 0.4 ? dots(x, y, vs, 2, 5) * (0.5 + grain * 0.5) : 0;
      return [c[0], c[1], c[2], smooth(0.45, 0.61, e + (grain - 0.5) * 0.12) * 0.84 * (1 - tuft * 0.9)];
    };
  },
  // A straw meadow: tufts of dry grass leaning one way over a pale wash, thinning out at the patch's rim (the rim is
  // tufts, not a line: no edge to follow from tile to tile).
  straw() {
    const inside = edge(311), layers = [321, 341].map(seed => [cells(16, seed, 1), per((x, y) => (pn(x + y, y, 2, 8, seed + 9) - 0.5) * 0.8)]), washAt = per((x, y) => (pn(x, y, 8, 8, 331) - 0.5) * 0.3);
    return (m, v, x, y) => {
      const e = inside(m, x, y);
      let blade = 0, lit = 0;
      for (const [cellOf, streak] of layers) { // (two layers of clumps, each some 14 px long: a stand of dry grass, not a stipple)
        const t = cellOf(x, y), along = t.ox * 0.45 - t.oy * 0.9, across = t.ox * 0.9 + t.oy * 0.45, r = 0.8 + t.id * 0.6;
        const b = clamp01((1 - (along * along) / (62 * r) - (across * across) / (13 * r)) * 2.2) * smooth(0.5, 0.64, e + (t.id - 0.5) * 0.7);
        if (b > blade) { blade = b; lit = clamp01(0.5 + along / 12 + streak(x, y)); }
      }
      const wash = smooth(0.4, 0.78, e + washAt(x, y)) * 0.5;
      const c = mix(STRAW, mix(STRAW_DARK, STRAW_LIT, lit), blade);
      return [c[0], c[1], c[2], Math.max(wash, blade * 0.84)];
    };
  },
  // Clover: soft round clumps in a deeper, cooler green, thinning out the same way (low in contrast: a dark mass, not dots).
  clover() {
    const inside = edge(411), cellOf = cells(16, 421, 1), washAt = per((x, y) => (pn(x, y, 8, 8, 431) - 0.5) * 0.3);
    return (m, v, x, y) => {
      const e = inside(m, x, y), t = cellOf(x, y), r = 5.5 + t.id * 3;
      const leaf = clamp01((r - t.d) / 3) * smooth(0.5, 0.64, e + (t.id - 0.5) * 0.7);
      const wash = smooth(0.4, 0.78, e + washAt(x, y)) * 0.62;
      const c = mix(CLOVER, mix(CLOVER_LIT, CLOVER, clamp01(t.d / r - 0.1)), leaf);
      return [c[0], c[1], c[2], Math.max(wash, leaf * 0.74)];
    };
  },
  // Flat slabs of bedrock, flush with the grass: no lip, no face, no shadow (a hill has all three), grass in the seams,
  // the slabs thinning out to the patch's rim.
  slab() {
    const inside = edge(511), cellOf = cells(16, 521), mossAt = per((x, y) => (pn(x, y, 4, 4, 531) - 0.5) * 0.12);
    return (m, v, x, y) => {
      const e = inside(m, x, y), t = cellOf(x, y);
      const there = smooth(0.56, 0.64, e + (t.id - 0.5) * 0.7) * smooth(2.2, 4, t.rim);
      if (there <= 0) return [0, 0, 0, 0];
      let c = mix(SLAB_DARK, SLAB, 0.4 + t.id * 0.6);
      c = mix(c, SLAB_LIT, clamp01((-t.ox - t.oy) / 14) * 0.6); c = mix(c, SLAB_DARK, clamp01((t.ox + t.oy) / 14) * 0.45);
      c = mix(c, SEAM, (1 - smooth(4, 5.8, t.rim)) * 0.5 + mossAt(x, y));
      return [c[0], c[1], c[2], there * 0.93];
    };
  },
  // A hill's upper tier, on its inside tiles only: a higher shelf of larger slabs with the hill's own lit north rim and
  // dark south face, so a wide hill has a shape on top and its cobbles do not run on unbroken.
  crag() {
    const inside = edge(611), cellOf = cells(16, 621, 1.2), faceAt = per((x, y) => pn(x, y, 4, 4, 641) * 0.8);
    return (m, v, x, y) => {
      const e = inside(m, x, y);
      if (e < 0.5) { // under the shelf's south edge: its face, lit rock then dark, then a short shadow
        if (inside(m, x, y - 6) >= 0.5) return [...mix(CRAG_FACE2, CRAG_FACE, faceAt(x, y)), 0.96];
        if (inside(m, x, y - 12) >= 0.5) return [...CRAG_FACE, 0.95];
        return inside(m, x - 2, y - 18) >= 0.5 ? [20, 20, 18, 0.4] : [0, 0, 0, 0];
      }
      const t = cellOf(x, y);
      let c = mix(CRAG_DARK, CRAG, 0.35 + t.id * 0.65);
      c = mix(c, CRAG_LIT, clamp01((-t.ox - t.oy) / 16) * 0.5); c = mix(c, CRACK, (1 - smooth(1.2, 2.6, t.rim)) * 0.75);
      if (inside(m, x, y - 4) < 0.5 || inside(m, x - 3, y) < 0.5) c = mix(c, CRAG_LIT, 0.75); // the lit rim, north and west
      else if (inside(m, x + 3, y) < 0.5) c = mix(c, CRAG_DARK, 0.6);
      return [c[0], c[1], c[2], 0.97];
    };
  },
};

/** The tiles of ground `kind` ('dirt', 'straw', 'clover', 'slab' or 'crag'): `{ w, h, data }` RGBA, and `frame(m, v)`: the
 *  [x, y] of mask m's variant v in it (OT x OT pixels, a gutter of the tile's own continuation round each). */
export function overlayTiles(kind) {
  const w = 15 * CELL, h = VARIANTS * CELL, data = new Uint8ClampedArray(w * h * 4), paint = PAINT[kind]();
  for (let m = 1; m <= 15; m++) for (let v = 0; v < VARIANTS; v++) for (let y = -GUTTER; y < OT + GUTTER; y++) for (let x = -GUTTER; x < OT + GUTTER; x++) {
    const [r, g, b, a] = paint(m, v, x, y), o = ((v * CELL + GUTTER + y) * w + (m - 1) * CELL + GUTTER + x) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = Math.round(clamp01(a) * 255);
  }
  return { w, h, data, frame: (m, v) => [(m - 1) * CELL + GUTTER, v * CELL + GUTTER] };
}
