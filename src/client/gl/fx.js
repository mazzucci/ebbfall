// The effects, the shots and the light, painted in code: fire and smoke, flashes, sparks and glints, a gun's flame, dust,
// what flies (an arrow, a bolt, a cannonball, a rocket, a tracer) and the soft blob every light is. Round and soft-edged,
// no ink outline, their colors those of a bright afternoon: beside the painted land and units the older pixel frames
// with their dark outlines were the last drawings on the field. One small canvas holds them all (`paintFx`), so they
// are one texture and batch as one; each frame keeps the world size and the anchor its older one had, so every scale,
// tint and offset the look's tables give (look.js) still means what it meant.

/** Texture px a world px. */
export const FX_K = 3;
/** Clear world px round every frame on the canvas (mip levels 0 and 1 clean). */
const GAP = 2;

const rgba = (c, a) => `rgba(${c},${a.toFixed(3)})`;
/** A round, soft blob: `c` 'r,g,b', solid `a` at its middle, gone at `r`; `core` of its radius is nearly solid. */
function blob(g, x, y, r, c, a = 1, core = 0.35) {
  const q = g.createRadialGradient(x, y, 0, x, y, r);
  q.addColorStop(0, rgba(c, a)); q.addColorStop(core, rgba(c, a * 0.86)); q.addColorStop(core + (1 - core) * 0.55, rgba(c, a * 0.32)); q.addColorStop(1, rgba(c, 0));
  g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}
/** The same, flattened to `ry` (a ray, a flame, a streak), turned by `rot`. */
function oval(g, x, y, rx, ry, c, a = 1, core = 0.35, rot = 0) { g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx); blob(g, 0, 0, rx, c, a, core); g.restore(); }
/** A four-pointed star of light: a round middle and two crossed rays. */
function star(g, x, y, r, ray, c, a) { blob(g, x, y, r, c, a, 0.4); oval(g, x, y, ray, ray * 0.16, c, a * 0.9, 0.2); oval(g, x, y, ray, ray * 0.16, c, a * 0.9, 0.2, Math.PI / 2); }
/** A straight, round-ended stroke. */
function line(g, x0, y0, x1, y1, w, style) { g.strokeStyle = style; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
/** A filled shape through `pts`. */
function trace(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
function shape(g, pts, style) { g.fillStyle = style; trace(g, pts); g.fill(); }

/** A small seeded stream (the same picture on every machine: nothing here is drawn from the clock or Math.random). */
const stream = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A ragged, closed outline round (x, y): its radius `r` broken by five waves of noise, coarse to fine (`rough` of it),
 *  with `tongues` short flames of uneven length (up to `reach` of r), each a narrow, leaning lick, at uneven angles.
 *  `rnd`: its stream. Returns its points. */
function ragged(rnd, x, y, r, rough, tongues = 0, reach = 0) {
  const W = [[2, 0.3], [3, 0.4], [5, 0.3], [11, 0.2], [17, 0.15]].map(([n, k]) => [n, k * rough, rnd() * 6.28]), pts = [], N = 96;
  const T = Array.from({ length: tongues }, (_, i) => [(i + rnd()) / tongues * 6.283, reach * (0.2 + rnd() * 0.8), 0.16 + rnd() * 0.16, (rnd() - 0.5) * 0.5]);
  for (let i = 0; i < N; i++) {
    const a = i / N * 6.283; let k = 1, lean = 0; for (const [n, v, ph] of W) k += v * Math.sin(n * a + ph);
    for (const [ta, len, wide, to] of T) { const d = Math.abs(((a - ta + 9.4248) % 6.283) - 3.1416); if (d < wide) { const v = (1 - d / wide) ** 1.6; k += len * v; lean += to * v * len; } }
    pts.push([x + Math.cos(a + lean) * r * k, y + Math.sin(a + lean) * r * k]);
  }
  return pts;
}
/** A ragged patch of fire: its outline filled from `inner` at (cx, cy) out to `outer`, with a little of its own glow. */
function fire(g, pts, cx, cy, r, inner, outer, a = 1) {
  const q = g.createRadialGradient(cx, cy, 0, cx, cy, r); q.addColorStop(0, rgba(inner, a)); q.addColorStop(0.28, rgba(inner, a)); q.addColorStop(0.8, rgba(outer, a)); q.addColorStop(1, rgba(outer, a * 0.92));
  g.save(); g.shadowColor = rgba(outer, 0.7 * a); g.shadowBlur = 1.2 * FX_K; shape(g, pts, q); g.restore();
}
/** A puff of smoke, lumpy: lobes of uneven size round (x, y), its dark underside first, then each lobe's gray, then the
 *  sunlit shoulders, small and to the upper left. Soft, with no bright point on it: smoke, not a ball of metal. `gray`
 *  (PALE_SMOKE or MID_SMOKE): its lobes' gray and its sunlit shoulders'. */
const PALE_SMOKE = ['146,141,136', '218,212,203'], MID_SMOKE = ['118,113,108', '170,165,158'];
function puff(g, rnd, x, y, r, a, [mid, lit] = PALE_SMOKE) {
  const t = rnd() * 6.283, L = Array.from({ length: 6 }, (_, i) => { const q = t + (i + (rnd() - 0.5) * 0.7) * 1.047, d = r * (0.42 + rnd() * 0.26); return [x + Math.cos(q) * d, y + Math.sin(q) * d * 0.9, r * (0.34 + rnd() * 0.22)]; });
  blob(g, x, y, r * 0.8, '84,78,76', a, 0.6);
  for (const [lx, ly, lr] of L) blob(g, lx + lr * 0.14, ly + lr * 0.22, lr * 1.12, '78,73,71', a * 0.9, 0.62);
  for (const [lx, ly, lr] of L) blob(g, lx - lr * 0.12, ly - lr * 0.16, lr * 0.92, mid, a * 0.8, 0.5);
  for (const [lx, ly, lr] of L) { const up = Math.max(0, (x - lx + (y - ly) * 1.2) / r + 0.45); if (up > 0) blob(g, lx - lr * 0.22, ly - lr * 0.26, lr * 0.8, lit, a * Math.min(0.85, 0.3 + up * 0.55), 0.4); }
}
/** Bits thrown out of a blast: `n` small dark ones (and a bright one in three) between `r0` and `r1` from (x, y). */
function bits(g, rnd, x, y, r0, r1, n) {
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = r0 + rnd() * (r1 - r0), s = 0.45 + rnd() * 0.5; blob(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, s * (i % 3 === 2 ? 1.5 : 1.25), i % 3 === 2 ? HOT : '38,32,30', 0.95, 0.6); }
}

const WHITE = '255,252,238', HOT = '255,232,150', FLAME = '255,168,62', EMBER = '226,92,34';
/** Where a cloud's three lobes sit, of its spread (the smoke puff's own, gl/puff.js). */
const LOBES = [[-0.7, 0.25], [0.75, 0.35], [0.05, -0.75]];
/** A cloud: its lobes `spread` apart, each `r` wide, the shade below and the sunlit side up and to the left. */
function cloud(g, x, y, spread, r, shade, lit, a) {
  for (const [lx, ly] of LOBES) blob(g, x + lx * spread, y + ly * spread + r * 0.12, r, shade, a * 0.85, 0.45);
  for (const [lx, ly] of LOBES) blob(g, x + lx * spread - r * 0.16, y + ly * spread - r * 0.18, r * 0.72, lit, a * 0.8, 0.45);
}

/**
 * Every frame: its name, its box in world px, its anchor (of the box), and its painter `(g, w, h)`, the context's
 * origin at the box's corner, a world px a unit. The animations' frames are `<name>_<f>`.
 */
export const FX = [];
const one = (name, w, h, ax, ay, paint) => FX.push({ name, w, h, ax, ay, paint });
const anim = (name, n, w, h, ax, ay, paint) => { for (let f = 0; f < n; f++) one(`${name}_${f}`, w, h, ax, ay, (g) => paint(g, f)); };
/** The animations by name: their frames' names in order (what the art's index gave before). */
export const FX_ANIMS = { boom_small: 6, boom_small_b: 6, boom_small_c: 6, flash: 3, spark: 4, glint: 3, muzzle: 3, trail: 4 };
/** The fire's three castings (the same six frames from three seeds): the renderer plays one of them for each blast,
 *  so two side by side do not match. */
export const BOOMS = ['boom_small', 'boom_small_b', 'boom_small_c'];

// The light: white, falling off as the square of what is left of its radius (the older blob's own profile, measured:
// every light's size and strength in the look's tables was tuned on it).
one('light', 64, 64, 0.5, 0.5, (g) => {
  const q = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let i = 0; i <= 16; i++) { const t = i / 16; q.addColorStop(t, rgba('255,255,255', 0.976 * (1 - t) * (1 - t))); }
  g.fillStyle = q; g.fillRect(0, 0, 64, 64);
});
// A shell's or a machine's fire, a ragged burst: a white-hot flash with short tongues; the burst opening, its core off
// center, bits thrown out; the fire breaking up into soot (another shape, not the same one smaller); then lumps of
// smoke, two or three over each other, lit from the upper left and dark below, thinning as they rise.
BOOMS.forEach((name, v) => anim(name, 6, 28, 28, 0.5, 0.5, (g, f) => {
  const rnd = stream(977 * (v + 1) + 31 * f), x = 14, y = 14, ox = (rnd() - 0.5) * 2.4, oy = (rnd() - 0.5) * 2.4; // (the core's place, off the middle)
  if (f === 0) {
    blob(g, x, y, 9.5, FLAME, 0.55); fire(g, ragged(rnd, x, y, 4.6, 0.22, 6, 0.9), x + ox, y + oy, 7.5, HOT, FLAME); fire(g, ragged(rnd, x + ox * 0.6, y + oy * 0.6, 2.7, 0.2, 5, 0.6), x + ox, y + oy, 4, WHITE, HOT);
  } else if (f === 1) {
    blob(g, x, y, 12.5, EMBER, 0.45); fire(g, ragged(rnd, x, y, 7.4, 0.24, 7, 0.62), x + ox, y + oy, 12, FLAME, '206,70,28');
    fire(g, ragged(rnd, x + ox * 0.5, y + oy * 0.5, 4.9, 0.26, 6, 0.5), x + ox, y + oy, 7, HOT, FLAME); fire(g, ragged(rnd, x + ox, y + oy, 2.4, 0.25, 5, 0.5), x + ox, y + oy, 3.4, WHITE, HOT);
    bits(g, rnd, x, y, 8, 11.5, 4);
  } else if (f === 2) { // (torn open: three patches of fire thrown apart the hottest off to one side, soot rolling in where they part)
    const t = rnd() * 6.283; blob(g, x, y, 13.5, EMBER, 0.4);
    fire(g, ragged(rnd, x, y, 7.6, 0.4, 7, 0.6), x + ox, y + oy, 13, '226,92,34', '150,42,24');
    const P = [0, 2, 4.1].map((q, i) => [x + Math.cos(t + q) * (4 + rnd() * 1.4), y + Math.sin(t + q) * (3.6 + rnd() * 1.4), [5.8, 4.4, 3][i]]);
    for (const [px, py, r] of P) fire(g, ragged(rnd, px, py, r, 0.34, 4, 0.5), px, py, r * 1.5, HOT, FLAME);
    puff(g, rnd, x + Math.cos(t + 3.1) * 5.6, y + Math.sin(t + 3.1) * 5.4, 3.8, 0.85);
    fire(g, ragged(rnd, P[0][0], P[0][1], 2.3, 0.34, 4, 0.5), P[0][0], P[0][1], 3.4, WHITE, HOT);
    bits(g, rnd, x, y, 9.5, 13, 7);
  } else if (f === 3) { // (breaking up: soot rolling over the fire from one side, the fire torn into two patches)
    const a = rnd() * 6.283, sx = Math.cos(a), sy = Math.sin(a);
    fire(g, ragged(rnd, x - sx * 2.2, y - sy * 2.2, 7.2, 0.34, 5, 0.42), x - sx * 3, y - sy * 3, 10, FLAME, '176,52,24');
    puff(g, rnd, x + sx * 4.4, y + sy * 4.4 - 1, 5.6, 0.92, MID_SMOKE); puff(g, rnd, x + sx * 1.2 - sy * 4.6, y + sy * 1.2 + sx * 4.6, 4.2, 0.9, MID_SMOKE);
    fire(g, ragged(rnd, x - sx * 3.4 + sy * 1.6, y - sy * 3.4 - sx * 1.6, 3.6, 0.36, 4, 0.5), x - sx * 3.6, y - sy * 3.6, 5, HOT, FLAME);
    fire(g, ragged(rnd, x + sx * 0.8 - sy * 1.2, y + sy * 0.8 + sx * 1.2 + 2.2, 2.1, 0.4, 3, 0.5), x + sx, y + sy + 2, 3, FLAME, EMBER, 0.95);
    bits(g, rnd, x, y, 10, 13.5, 5);
  } else {
    const n = f === 4 ? 3 : 2 + (v % 2), a = f === 4 ? 0.92 : 0.76, up = f === 4 ? 0.8 : 1.4;
    const P = Array.from({ length: n }, (_, i) => [x + (rnd() - 0.5) * 8, y - up + (i - (n - 1) / 2) * 2.8 + (rnd() - 0.5) * 3, (f === 4 ? 5.6 : 6.2) + rnd() * 1.8]).sort((p, q) => q[1] - p[1]); // (the lowest first: the upper ones over it)
    for (const [px, py, r] of P) puff(g, rnd, px, py, r * 0.95, a, MID_SMOKE); // (mid-gray and a little larger, so the blast still reads as it ends)
    if (f === 4) blob(g, x + ox, y + 2.6 + oy * 0.5, 2.6, EMBER, 0.7);
  }
}));
// A flash: a warm star of light, shrinking.
anim('flash', 3, 16, 16, 0.5, 0.5, (g, f) => {
  const [r, ray, a] = [[4.6, 7.6, 1], [3.6, 5.8, 0.85], [2.4, 3.4, 0.6]][f];
  blob(g, 8, 8, r * 1.5, FLAME, a * 0.5); star(g, 8, 8, r, ray, HOT, a * 0.9); blob(g, 8, 8, r * 0.55, WHITE, a, 0.55);
});
// Dust and thin smoke (tinted by what raises it): a pale cloud, spreading and thinning.
anim('trail', 4, 12, 12, 0.5, 0.5, (g, f) => {
  const [spread, r, a] = [[1.3, 2.3, 0.9], [1.8, 2.9, 0.74], [2.2, 3.5, 0.52], [2.5, 3.9, 0.28]][f];
  cloud(g, 6, 6, spread, r, '208,208,212', '252,252,250', a);
});
// A gun's flame, from its base at the mouth: a bright tongue, dying back.
anim('muzzle', 3, 14, 10, 0.07, 0.5, (g, f) => {
  const s = [1, 0.72, 0.44][f], a = [1, 0.9, 0.7][f];
  oval(g, 1 + 6 * s, 5, 6.4 * s, 3.2 * s, FLAME, 0.85 * a, 0.3); oval(g, 1 + 3.6 * s, 5, 4 * s, 2 * s, HOT, 0.95 * a, 0.4); oval(g, 1 + 2 * s, 5, 2.2 * s, 1.1 * s, WHITE, a, 0.5);
});
// A stone ball: dull iron, the sun a small bright point on its upper left, no rim.
one('cannonball', 8, 8, 0.5, 0.5, (g) => {
  const q = g.createRadialGradient(3.1, 3, 0.2, 4, 4, 3.3);
  q.addColorStop(0, 'rgba(150,154,162,1)'); q.addColorStop(0.35, 'rgba(92,96,104,1)'); q.addColorStop(0.86, 'rgba(44,46,52,1)'); q.addColorStop(1, 'rgba(44,46,52,0)');
  g.fillStyle = q; g.fillRect(0, 0, 8, 8); blob(g, 3, 2.9, 1.1, '236,240,246', 0.95, 0.5);
});
// Steel's glint: a white star, then a point.
/** The glint's frames: its heart's radius, its rays' reach (world px; none: a point) and how solid. */
export const GLINT = [[1.5, 3.8, 1], [1.2, 2.6, 0.9], [1.1, 0, 0.7]];
anim('glint', GLINT.length, 8, 8, 0.5, 0.5, (g, f) => { const [r, ray, a] = GLINT[f]; if (ray) star(g, 4, 4, r, ray, '255,255,255', a); else blob(g, 4, 4, r * 1.4, '255,255,255', a, 0.5); });
// A spark: a point of fire, white to red as it dies.
anim('spark', 4, 8, 8, 0.5, 0.5, (g, f) => {
  const [r, c, a] = [[1.5, WHITE, 1], [1.3, HOT, 0.95], [1.1, FLAME, 0.85], [0.9, EMBER, 0.6]][f];
  blob(g, 4, 4, r * 2.2, f < 2 ? HOT : FLAME, a * 0.4); blob(g, 4, 4, r, c, a, 0.6);
});
// What flies, its tip at the box's right end (a rocket's a little in from it), drawn level. Each but the rocket and the
// ball has a thin dark edge round it (`edged`): on the pale worn dirt a tan shaft or a streak of light alone was lost.
const UNDER = 'rgba(22,24,30,0.4)';
/** A shot of wood and steel, its thin dark edge under it: a shaft from x0 to
 *  x1 `w` thick, its lit top line, then its `head` (lit half first) and its `vanes`. `y`: its middle. */
function edged(g, y, x0, x1, w, head, vanes) {
  line(g, x0, y + 0.1, x1, y + 0.1, w + 1, UNDER); g.lineWidth = 0.9; g.lineJoin = 'round';
  for (const pts of [head, vanes]) { trace(g, pts); g.stroke(); }
  line(g, x0, y, x1, y, w, 'rgb(148,104,58)'); line(g, x0, y - w * 0.2, x1, y - w * 0.2, w * 0.42, 'rgb(212,168,108)');
  shape(g, head, 'rgb(186,194,206)'); shape(g, head.slice(0, 3), 'rgb(234,239,246)'); shape(g, vanes, 'rgba(236,231,217,0.96)');
}
one('ballista_bolt', 24, 5, 1, 0.5, (g) => edged(g, 2.5, 3, 20, 1.9, [[18.6, 2.5], [17.6, 0.55], [24, 2.5], [17.6, 4.45]], [[0.8, 0.55], [5.4, 1.6], [5.4, 3.4], [0.8, 4.45], [2.1, 2.5]]));
one('rocket', 15, 5, 0.9, 0.5, (g) => {
  oval(g, 2.2, 2.5, 3, 1.5, FLAME, 0.9, 0.3); oval(g, 2.8, 2.5, 1.7, 0.9, WHITE, 0.95, 0.5);
  line(g, 4.6, 2.5, 11.6, 2.5, 2.5, 'rgb(74,78,88)'); line(g, 4.8, 1.9, 11.4, 1.9, 0.9, 'rgb(150,156,168)');
  shape(g, [[14.8, 2.5], [11.4, 1.1], [11.4, 3.9]], 'rgb(236,238,242)'); shape(g, [[3.4, 0.4], [6, 1.6], [6, 3.4], [3.4, 4.6]], 'rgb(52,55,62)');
});
one('arrow', 17, 4, 1, 0.5, (g) => edged(g, 2, 2.6, 14.2, 1.4, [[13.6, 2], [12.8, 0.5], [17, 2], [12.8, 3.5]], [[0.6, 0.5], [4.2, 1.2], [4.2, 2.8], [0.6, 3.5], [1.6, 2]]));
/** A streak of light: bright at its tip, fading down its tail, a thin dark edge round it. */
function streak(g, w, c) {
  const fade = (c, at, top) => { const q = g.createLinearGradient(0, 0, w, 0); q.addColorStop(0, rgba(c, 0)); q.addColorStop(0.45, rgba(c, at)); q.addColorStop(1, rgba(c, top)); return q; };
  line(g, 1.2, 1.15, w - 1.1, 1.15, 2, fade('22,24,30', 0.36, 0.42)); line(g, 0.7, 1, w - 0.8, 1, 1.1, fade(c, 0.92, 1));
  blob(g, w - 1.1, 1, 0.95, '255,255,255', 1, 0.6);
}
one('tracer', 13, 3, 1, 1 / 3, (g) => streak(g, 13, '255,244,196'));    // (a row taller than the older frame, for the edge under it: its line still on the anchor)
one('tower_shot', 11, 3, 1, 1 / 3, (g) => streak(g, 11, '224,244,255'));

/** Where each frame lies on the canvas (world px): shelves, tallest first; and the canvas's size. */
export function layFx(width = 168) {
  const order = FX.map((f, i) => i).sort((a, b) => FX[b].h - FX[a].h || FX[b].w - FX[a].w || a - b), at = new Array(FX.length);
  let x = GAP, y = GAP, row = 0;
  for (const i of order) { const { w, h } = FX[i]; if (x + w + GAP > width) { x = GAP; y += row + GAP; row = 0; } at[i] = { x, y }; x += w + GAP; row = Math.max(row, h); }
  return { at, w: width, h: y + row + GAP };
}
/** The canvas with every frame painted on it (FX_K px a world px), and each frame's place: `{ canvas, frames: { name:
 *  { x, y, w, h, ax, ay } } }` in world px. `doc`: the document to make the canvas in. */
export function paintFx(doc = document) {
  const lay = layFx(), c = doc.createElement('canvas'); c.width = lay.w * FX_K; c.height = lay.h * FX_K;
  const g = c.getContext('2d'), frames = {};
  FX.forEach((f, i) => {
    const { x, y } = lay.at[i];
    g.save(); g.setTransform(FX_K, 0, 0, FX_K, x * FX_K, y * FX_K); g.beginPath(); g.rect(0, 0, f.w, f.h); g.clip(); f.paint(g, f.w, f.h); g.restore();
    frames[f.name] = { x, y, w: f.w, h: f.h, ax: f.ax, ay: f.ay };
  });
  return { canvas: c, frames };
}
