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
function shape(g, pts, style) { g.fillStyle = style; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }

/** A small seeded stream (the same picture on every machine: nothing here is drawn from the clock or Math.random). */
const stream = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A ragged, closed outline round (x, y): its radius `r` broken by three waves of noise (`rough` of it), with `tongues`
 *  short spikes of uneven length (up to `reach` of r) at uneven angles. `rnd`: its stream. Returns its points. */
function ragged(rnd, x, y, r, rough, tongues = 0, reach = 0) {
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], T = Array.from({ length: tongues }, (_, i) => [(i + 0.2 + rnd() * 0.6) / tongues * 6.283, reach * (0.35 + rnd() * 0.65), 0.1 + rnd() * 0.08]);
  const pts = [], N = 56;
  for (let i = 0; i < N; i++) {
    const a = i / N * 6.283; let k = 1 + rough * (0.5 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(9 * a + ph[2]));
    for (const [ta, len, wide] of T) { const d = Math.abs(((a - ta + 9.4248) % 6.283) - 3.1416); if (d < wide) k += len * (1 - d / wide); }
    pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]);
  }
  return pts;
}
/** A ragged patch of fire: its outline filled from `inner` at (cx, cy) out to `outer`, with a little of its own glow. */
function fire(g, pts, cx, cy, r, inner, outer, a = 1) {
  const q = g.createRadialGradient(cx, cy, 0, cx, cy, r); q.addColorStop(0, rgba(inner, a)); q.addColorStop(0.28, rgba(inner, a)); q.addColorStop(0.8, rgba(outer, a)); q.addColorStop(1, rgba(outer, a * 0.92));
  g.save(); g.shadowColor = rgba(outer, 0.7 * a); g.shadowBlur = 1.2 * FX_K; shape(g, pts, q); g.restore();
}
/** A puff of smoke: a lump with two smaller ones on its rim, so its outline is a cloud's and not a ball's. */
function puff(g, rnd, x, y, r, a) {
  const t = rnd() * 6.283; lump(g, x + Math.cos(t) * r * 0.62, y + Math.sin(t) * r * 0.62, r * 0.58, a); lump(g, x + Math.cos(t + 2.4) * r * 0.6, y + Math.sin(t + 2.4) * r * 0.6, r * 0.5, a); lump(g, x, y, r, a);
  lump(g, x + Math.cos(t + 4.3) * r * 0.5 - r * 0.1, y + Math.sin(t + 4.3) * r * 0.5 - r * 0.1, r * 0.46, a * 0.9);
}
/** A lump of smoke: a ball lit from the upper left, darker below and to the right, its rim soft but there. */
function lump(g, x, y, r, a) {
  const q = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r);
  q.addColorStop(0, rgba('232,228,220', a)); q.addColorStop(0.42, rgba('168,163,158', a)); q.addColorStop(0.8, rgba('92,86,84', a * 0.95)); q.addColorStop(1, rgba('70,64,62', 0));
  g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}
/** Bits thrown out of a blast: `n` small dark ones (and a bright one in three) between `r0` and `r1` from (x, y). */
function bits(g, rnd, x, y, r0, r1, n) {
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = r0 + rnd() * (r1 - r0), s = 0.45 + rnd() * 0.5; blob(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, s * (i % 3 === 2 ? 1.5 : 1.25), i % 3 === 2 ? HOT : '38,32,30', 0.95, 0.6); }
}

const WHITE = '255,252,238', HOT = '255,232,150', FLAME = '255,168,62', EMBER = '226,92,34', SOOT = '74,66,62', SMOKE = '124,120,118', PALE = '206,202,196';
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
  } else if (f === 2) {
    blob(g, x, y, 13.5, EMBER, 0.4); fire(g, ragged(rnd, x, y, 8.8, 0.26, 7, 0.5), x + ox, y + oy, 13.5, FLAME, '170,48,24');
    fire(g, ragged(rnd, x + ox * 0.7, y + oy * 0.7, 5.6, 0.3, 6, 0.45), x + ox, y + oy, 8, HOT, FLAME); fire(g, ragged(rnd, x + ox * 1.3, y + oy * 1.3, 2.5, 0.3, 4, 0.5), x + ox * 1.3, y + oy * 1.3, 3.4, WHITE, HOT);
    bits(g, rnd, x, y, 9.5, 13, 6);
  } else if (f === 3) { // (breaking up: soot rolling over the fire from one side, the fire torn into two patches)
    const a = rnd() * 6.283, sx = Math.cos(a), sy = Math.sin(a);
    fire(g, ragged(rnd, x - sx * 2.2, y - sy * 2.2, 7.2, 0.34, 5, 0.42), x - sx * 3, y - sy * 3, 10, FLAME, '176,52,24');
    puff(g, rnd, x + sx * 4.4, y + sy * 4.4 - 1, 5.6, 0.92); puff(g, rnd, x + sx * 1.2 - sy * 4.6, y + sy * 1.2 + sx * 4.6, 4.2, 0.9);
    fire(g, ragged(rnd, x - sx * 3.4 + sy * 1.6, y - sy * 3.4 - sx * 1.6, 3.6, 0.36, 4, 0.5), x - sx * 3.6, y - sy * 3.6, 5, HOT, FLAME);
    fire(g, ragged(rnd, x + sx * 0.8 - sy * 1.2, y + sy * 0.8 + sx * 1.2 + 2.2, 2.1, 0.4, 3, 0.5), x + sx, y + sy + 2, 3, FLAME, EMBER, 0.95);
    bits(g, rnd, x, y, 10, 13.5, 5);
  } else {
    const n = f === 4 ? 3 : 2 + (v % 2), a = f === 4 ? 0.9 : 0.6, up = f === 4 ? 0.8 : 2.4;
    const P = Array.from({ length: n }, (_, i) => [x + (rnd() - 0.5) * 9, y - up + (i - (n - 1) / 2) * 3.4 + (rnd() - 0.5) * 3, (f === 4 ? 5.6 : 6.2) + rnd() * 1.8]).sort((p, q) => q[1] - p[1]); // (the lowest first: the upper ones over it)
    for (const [px, py, r] of P) puff(g, rnd, px, py, r * 0.86, a);
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
  const [spread, r, a] = [[0.8, 2.7, 0.9], [1.4, 3.3, 0.74], [1.9, 3.9, 0.52], [2.3, 4.4, 0.28]][f];
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
// ball has a thin dark edge under it (`UNDER`): on the pale worn dirt a tan shaft or a streak of light alone was lost.
const UNDER = 'rgba(22,24,30,0.4)';
one('ballista_bolt', 24, 5, 1, 0.5, (g) => {
  line(g, 3, 2.9, 20.5, 2.9, 2.2, UNDER); shape(g, [[24, 2.9], [18.2, 0.5], [18.2, 4.9]], UNDER);
  line(g, 3, 2.5, 20, 2.5, 1.8, 'rgb(150,112,72)'); line(g, 3, 2.1, 20, 2.1, 0.8, 'rgb(206,170,122)');
  shape(g, [[24, 2.5], [18.4, 0.5], [19.6, 2.5], [18.4, 4.5]], 'rgb(196,202,212)'); shape(g, [[24, 2.5], [18.4, 0.5], [19.6, 2.5]], 'rgb(234,238,244)');
  shape(g, [[0.6, 0.4], [5.4, 1.7], [5.4, 3.3], [0.6, 4.6], [2, 2.5]], 'rgba(232,226,210,0.95)');
});
one('rocket', 15, 5, 0.9, 0.5, (g) => {
  oval(g, 2.2, 2.5, 3, 1.5, FLAME, 0.9, 0.3); oval(g, 2.8, 2.5, 1.7, 0.9, WHITE, 0.95, 0.5);
  line(g, 4.6, 2.5, 11.6, 2.5, 2.5, 'rgb(74,78,88)'); line(g, 4.8, 1.9, 11.4, 1.9, 0.9, 'rgb(150,156,168)');
  shape(g, [[14.8, 2.5], [11.4, 1.1], [11.4, 3.9]], 'rgb(236,238,242)'); shape(g, [[3.4, 0.4], [6, 1.6], [6, 3.4], [3.4, 4.6]], 'rgb(52,55,62)');
});
one('arrow', 17, 4, 1, 0.5, (g) => {
  line(g, 2.5, 2.35, 14.8, 2.35, 1.5, UNDER); shape(g, [[17, 2.3], [13.2, 0.6], [13.2, 4]], UNDER);
  line(g, 2.5, 2, 14.5, 2, 1.2, 'rgb(150,116,78)'); line(g, 2.5, 1.75, 14.5, 1.75, 0.55, 'rgb(214,180,132)');
  shape(g, [[17, 2], [13.4, 0.6], [14.2, 2], [13.4, 3.4]], 'rgb(214,220,228)');
  shape(g, [[0.5, 0.4], [4.2, 1.4], [4.2, 2.6], [0.5, 3.6], [1.5, 2]], 'rgba(240,238,228,0.95)');
});
/** A streak of light: bright at its tip, fading down its tail, a thin dark edge under it. */
function streak(g, w, c) {
  const d = g.createLinearGradient(0, 0, w, 0); d.addColorStop(0, 'rgba(22,24,30,0)'); d.addColorStop(0.5, 'rgba(22,24,30,0.3)'); d.addColorStop(1, 'rgba(22,24,30,0.4)');
  g.strokeStyle = d; g.lineWidth = 1.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.8, 1.35); g.lineTo(w - 0.8, 1.35); g.stroke();
  const q = g.createLinearGradient(0, 0, w, 0); q.addColorStop(0, rgba(c, 0)); q.addColorStop(0.5, rgba(c, 0.75)); q.addColorStop(1, rgba(c, 1));
  g.strokeStyle = q; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0.6, 1); g.lineTo(w - 0.9, 1); g.stroke();
  blob(g, w - 1.2, 1, 1.25, '255,255,255', 1, 0.6);
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
