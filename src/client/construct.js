// Construction you can read (Notion: "PRD: construction you can read"): how an unfinished building looks until it is
// done, the half second in which it comes into full color, a builder at work, and the words on the cards. Plain numbers
// and curves, no PixiJS: the renderer (gl/render.js BldgObj, UnitObj) and the HUD read them, the tests pin them.
// Everything here is cosmetic, on the renderer's clock: nothing feeds the sim.

/** A site (its building's outline on the ground is `base`: newArt.bldg `looks`; both peoples): the building's own picture, revealed from the bottom up in `rows` slices to `cap`
 *  of its height, its seat paint with it; above that line the rest gray (saturation `sat`) at `alpha`, so the whole can be
 *  told from the first second and nothing reads finished before the done moment. Under it, by people:
 *  - the Kingdom's (`kg`): a plain low timber frame round its foot (`frameOf`): posts `post` px tall, `rail` up the rail
 *    between them, a small flag in the seat's color on its side posts (`color`, its `edge` darker);
 *  - the Expedition's (`ex`, Stelian, Nov 25: a bare white frame looked off, worst on the Portal): a low white slab of its
 *    outline's shape (`slabOf`), flat on the ground under everything, `h` px thick, and the seat's color round its corners
 *    (`mark` px along each edge, `bar` px wide). */
export const REVEAL = { rows: 64, cap: 0.9, sat: 0, alpha: 0.45, post: 11, rail: 7, kg: { color: 0xa8743c, edge: 0x4a2f17 },
  ex: { grow: 6, least: 0.36, h: 4, top: 0xe6e3dc, side: 0xa3a4a8, seam: 0xc3c2be, edge: 0x565a62, mark: 11, bar: 3 } };
/** The Expedition's slab under an outline `base` on a footprint `n` tiles wide: the outline `grow` px larger each way east
 *  and west (its shape kept), its half width at least `least` of the footprint's (a turbine's foot is a few px). */
export function slabOf(base, n, tile = 32) {
  const { grow, least } = REVEAL.ex, xs = base.map(p => p[0]), ys = base.map(p => p[1]), mid = (a) => (Math.min(...a) + Math.max(...a)) / 2, cx = mid(xs), cy = mid(ys);
  const half = (Math.max(...xs) - Math.min(...xs)) / 2, k = Math.max(half + grow, least * n * tile) / half;
  return base.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}
/** The slab's marks: at each corner of its outline `pts` (a round one: at four points of it) the line along its edge, `mark`
 *  px to either side of the corner, `inset` of the way in from the edge. */
export function slabMarks(pts, inset = 0.9) {
  const n = pts.length, c = [0, 1].map(i => pts.reduce((t, p) => t + p[i], 0) / n), at = (i) => pts[((i % n) + n) % n].map((v, k) => c[k] + (v - c[k]) * inset);
  const toward = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.min(0.45, REVEAL.ex.mark / d); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  if (n <= 6) return pts.map((_, i) => [toward(at(i), at(i - 1)), at(i), toward(at(i), at(i + 1))]);
  const step = n / 4; return [0, 1, 2, 3].map(q => [-1, 0, 1].map(o => at(Math.round(q * step) + o)));
}
/** How many of REVEAL.rows a site at `progress` (0..1) shows in color. */
export const revealRows = (progress) => Math.max(1, Math.min(Math.round(REVEAL.rows * REVEAL.cap), Math.round(unit(progress) * REVEAL.cap * REVEAL.rows)));
/** A color matrix (PixiJS ColorMatrixFilter's 4x5, offsets 0..1): saturation from REVEAL.sat at `k` 0 to 1 at `k` 1. */
export const revealMatrix = (k) => satMatrix(REVEAL.sat + (1 - REVEAL.sat) * unit(k));
/** The frame round an outline `base` ([x, y] points about the footprint's middle, in order round it): its points as the
 *  back half (north of the line through its side corners, drawn under the body) and the front half (over it), each from
 *  one side corner to the other, and the two side corners. */
export function frameOf(base) {
  const n = base.length, l = base.reduce((a, p, i) => (p[0] < base[a][0] ? i : a), 0), r = base.reduce((a, p, i) => (p[0] > base[a][0] ? i : a), 0);
  const walk = (from, to) => { const out = [base[from]]; for (let i = from; i !== to;) { i = (i + 1) % n; out.push(base[i]); } return out; };
  const a = walk(l, r), b = walk(r, l).reverse(), mid = (h) => h.reduce((t, p) => t + p[1], 0) / h.length;
  return mid(a) > mid(b) ? { front: a, back: b, sides: [base[l], base[r]] } : { front: b, back: a, sides: [base[l], base[r]] };
}
/** While a site is unfinished its construction bar takes the hp bar's place over it, taller; the hp bar shows only if
 *  the site has taken damage. */
export const BUILD_BAR = { h: 7, color: 0xf5a524 };

/** The done moment (Stelian: subtle and elegant, not flashy): `life` s in all, then nothing. The body comes into full
 *  color and paint over `color` s; scaffold, gantry, ghost and foundation fade out over `strip` s, a step ahead of it; the
 *  missing top (the Kingdom's roof slice, the Expedition's top tenth) over `roof`; the Expedition's heads over `heads`,
 *  its lights from 0 to `glowPeak` x between `glowUp` s, then back to 1 by `life`. The Kingdom's dust: one small puff
 *  per two tiles of width along the front edge at `puffAt` s. */
export const DONE = { life: 0.5, color: 0.5, strip: 0.4, roof: 0.3, heads: 0.3, glowUp: [0.15, 0.3], glowPeak: 1.25, puffAt: 0.05 };
/** The Kingdom's done puffs: the hit dust (look.js HIT_DUST) at the smaller melee puff's scale, faint, drifting up. */
export const DONE_PUFF = { scale: 1.0, fade: 0.35, life: 0.8, vy: -14 };

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInQuad = (t) => t * t;
const unit = (t) => Math.max(0, Math.min(1, t));

/** The color matrix of saturation `s` about the luminance, brightness kept. */
function satMatrix(s) {
  const lr = 0.2126, lg = 0.7152, lb = 0.0722, row = (own) => [lr * (1 - s) + (own === 0 ? s : 0), lg * (1 - s) + (own === 1 ? s : 0), lb * (1 - s) + (own === 2 ? s : 0), 0, 0];
  return [...row(0), ...row(1), ...row(2), 0, 0, 0, 1, 0];
}

/** The done moment `t` s after the building stood: each part's share (0..1). `color`: the body's way to full color and
 *  paint; `strip`: what is left of scaffold, gantry, ghost and foundation; `roof`: the missing top coming in (the
 *  Kingdom's roof slice, the Expedition's top tenth); `heads`: the Expedition's portal and dish heads; `glow`: a light's
 *  strength as a multiple of its normal (the Expedition's rises past it, `glowPeak`, and settles; the Kingdom's follows
 *  `color`). `over` once it is done with (t >= DONE.life). */
export function doneAt(t, vael = false) {
  const color = easeOutCubic(unit(t / DONE.color));
  const [g0, g1] = DONE.glowUp;
  const glow = !vael ? color : t < g0 ? 0 : t < g1 ? DONE.glowPeak * (t - g0) / (g1 - g0) : DONE.glowPeak - (DONE.glowPeak - 1) * easeOutCubic(unit((t - g1) / (DONE.life - g1)));
  return {
    color,
    strip: 1 - easeOutCubic(unit(t / DONE.strip)), // (ahead of the paint: no half-faded plank over the new colors)
    roof: 1 - (1 - unit(t / DONE.roof)) ** 2, // (ease-out)
    heads: unit(t / DONE.heads),
    glow,
    over: t >= DONE.life,
  };
}
/** Where the Kingdom's done puffs rise, world px: one per two tiles of the footprint's width (at least one), evenly
 *  along its front (south) edge. */
export function donePuffs(b, tile = 32) {
  const n = Math.max(1, Math.ceil(b.w / 2)), y = (b.ty + b.h) * tile - 2;
  return Array.from({ length: n }, (_, i) => ({ x: b.tx * tile + (i + 0.5) * b.w * tile / n, y }));
}

/** A site's hp as the sim raises it with its progress, had nothing hit it (crates/endfall-sim/src/world/spawn.rs: a
 *  site starts at a tenth of its hp, at least 10; construction.rs adds 0.9 of it over the build). */
export const siteHp = (b) => Math.min(b.maxhp, Math.max(b.maxhp * 0.1, 10) + 0.9 * b.maxhp * b.progress);
/** Whether a site has taken damage: below the hp its progress gives it, or its shields down. */
export const siteHurt = (b) => b.hp < siteHp(b) - 1 || (b.maxsh > 0 && b.sh < b.maxsh - 0.5);

/** A builder at work: a strike every `every` s (each builder's phase from its id), its body nudged `nudge` px towards
 *  the site for `nudgeFrames` frames, an effect of `life` s and a soft knock heard on screen only. */
export const WORK = { every: 0.55, nudge: 1.5, nudgeFrames: 2, life: 0.2, reach: 14 };
/** The count of strikes builder `id` has struck by `now` (s, the renderer's clock): a new strike when it goes up. */
export const strikeCount = (id, now) => Math.floor(now / WORK.every + (id * 0.618) % 1);
/** Where a builder's strike lands: the contact point on its site's nearest edge (the footprint 4 px in, as a melee
 *  blow on a building finds it, gl/render.js meleeHit), and which way the site is from the builder. */
export function strikeAt(u, b, tile = 32) {
  const x = Math.min(Math.max(u.x, b.tx * tile + 4), (b.tx + b.w) * tile - 4), y = Math.min(Math.max(u.y, b.ty * tile + 4), (b.ty + b.h) * tile - 4);
  let dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
  if (d < 1) { dx = b.x - u.x; dy = b.y - u.y; d = Math.max(1, Math.hypot(dx, dy)); } // (standing on its edge: towards the middle)
  return { x, y, dx: dx / d, dy: dy / d };
}
/** A builder's strike effects: the Kingdom's pale glint and a puff of dust that reads at 1x, the Expedition's weld
 *  spark a small bright white-blue core (about 4-5 css px at the phone's zoom) gone in a frame or two. */
export const STRIKE_FX = {
  glint: { scale: 0.7, tint: 0xfff6e0, life: 0.2, lift: 8 },
  dust: { scale: 1.5, fade: 0.9, life: 0.45, drift: 10, vy: -8 },
  weld: { anim: 'glint', scale: 0.45, tint: 0xcfeaff, life: 0.05, light: 0xbfe6ff, lightScale: 0.14, lift: 6 }, // (the glint's star is 6 world px across)
};
/** Whether a builder stands in reach of its site: the gap from it to the footprint's nearest point within its radius
 *  and WORK.reach px (the sim's: within its radius and 8 px, settled; a little slack for the frames between ticks). */
export function atSite(u, b, tile = 32) {
  const cx = Math.min(Math.max(u.x, b.tx * tile), (b.tx + b.w) * tile), cy = Math.min(Math.max(u.y, b.ty * tile), (b.ty + b.h) * tile);
  return Math.hypot(cx - u.x, cy - u.y) <= u.r + WORK.reach;
}

/** How far along a site is, in whole percent: rounded down, so it says 100% only once it stands. */
export const pct = (progress) => Math.max(0, Math.min(99, Math.floor(progress * 100)));
/** The builder's line: "Constructing Barracks, 61%". */
export const builderLine = (b) => (b ? `Constructing ${b.d.name}, ${pct(b.progress)}%` : 'Constructing');
/** The site's line: "Constructing, 61%", or "Paused at 61%" while nobody builds it (its kind's line below then says
 *  `NO_BUILDER`). */
export const siteLine = (b, building) => (building ? `Constructing, ${pct(b.progress)}%` : `Paused at ${pct(b.progress)}%`);
export const NO_BUILDER = 'No builder';
/** The toast when a site of ours is left with no builder: "Barracks paused at 90%". */
export const pausedToast = (b) => `${b.d.name} paused at ${pct(b.progress)}%`;
/** At most one paused toast a site in this many seconds (game time). */
export const PAUSED_GAP = 60;
