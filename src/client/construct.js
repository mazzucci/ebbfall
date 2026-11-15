// Construction you can read (Notion: "PRD: construction you can read"): how an unfinished building looks until it is
// done, the half second in which it comes into full color, a builder at work, and the words on the cards. Plain numbers
// and curves, no PixiJS: the renderer (gl/render.js BldgObj, UnitObj) and the HUD read them, the tests pin them.
// Everything here is cosmetic, on the renderer's clock: nothing feeds the sim.

/** The Kingdom's site is raw until done: its rising slices desaturated (saturation `sat` of full, brightness kept), a
 *  touch warm (`warm`: an RGB offset, 0..1 of full scale, fading to 0 with the rest), its seat paint hidden (the
 *  scaffold's cloth says whose it is). The reveal stops at `cap` of the art's height (7 of its 8 slices), so the roof
 *  or crown is missing until the building stands. */
export const RAW = { sat: 0.3, warm: [0.035, 0.015, -0.02], stages: 8, cap: 7 };
/** The Expedition's site: a cold cyan hologram (`tint`), at most `alphaMax` opaque, shimmering at `hz` by ± `shimmer`;
 *  its bud never fainter than `budMin`; no seat paint. (0xa0ecff at first: gray-teal over grass at 0.6, the review.) */
export const HOLO = { tint: 0x86f0ff, alphaMax: 0.6, hz: 6, shimmer: 0.05, budMin: 0.5 };
/** While a site is unfinished its construction bar takes the hp bar's place over it, taller; the hp bar shows only if
 *  the site has taken damage. */
export const BUILD_BAR = { h: 7, color: 0xf5a524 };

/** The done moment (Stelian: subtle and elegant, not flashy): `life` s in all, then nothing. The body comes into full
 *  color and paint over `color` s; scaffold, bud and foundation fade out over `strip` s, a step ahead of it; the Kingdom's roof slice over
 *  `roof`; the Expedition's working ring over `ring`, its heads over `heads`, its lights from 0 to `glowPeak` x between
 *  `glowUp` s, then back to 1 by `life`. The Kingdom's dust: one small puff per two tiles of width along the front edge
 *  at `puffAt` s. */
export const DONE = { life: 0.5, color: 0.5, strip: 0.4, roof: 0.3, ring: 0.3, heads: 0.3, glowUp: [0.15, 0.3], glowPeak: 1.25, puffAt: 0.05 };
/** The Kingdom's done puffs: the hit dust (look.js HIT_DUST) at the smaller melee puff's scale, faint, drifting up. */
export const DONE_PUFF = { scale: 1.0, fade: 0.35, life: 0.8, vy: -14 };

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInQuad = (t) => t * t;
const unit = (t) => Math.max(0, Math.min(1, t));

/** How many of the Kingdom's 8 slices a site at `progress` (0..1) shows: 1 to 7, never the last until done. */
export const rawStage = (progress) => Math.max(1, Math.min(RAW.cap, Math.ceil(progress * RAW.cap)));

/** A color matrix (PixiJS ColorMatrixFilter's 4x5, offsets 0..1) for the Kingdom's body at `k` (0: raw, 1: full color):
 *  saturation from RAW.sat to 1 about the luminance, brightness kept, the warm offset fading to 0. */
export function rawMatrix(k) {
  const s = RAW.sat + (1 - RAW.sat) * unit(k), o = 1 - unit(k), lr = 0.2126, lg = 0.7152, lb = 0.0722;
  const row = (own, off) => [lr * (1 - s) + (own === 0 ? s : 0), lg * (1 - s) + (own === 1 ? s : 0), lb * (1 - s) + (own === 2 ? s : 0), 0, off * o];
  return [...row(0, RAW.warm[0]), ...row(1, RAW.warm[1]), ...row(2, RAW.warm[2]), 0, 0, 0, 1, 0];
}

/** The Expedition's ghost: its opacity at `progress` (fainter until a Bot has begun, more solid as it grows, never over
 *  HOLO.alphaMax), shimmering at `now` (s, the renderer's clock). */
export const holoAlpha = (progress, now) => Math.min(HOLO.alphaMax, progress > 0 ? 0.22 + 0.6 * progress : 0.15) + HOLO.shimmer * Math.sin(now * HOLO.hz * 2 * Math.PI);
/** The Expedition's bud: it opens as the shell inside grows, never below HOLO.budMin. */
export const budAlpha = (progress) => Math.max(HOLO.budMin, 1 - 0.75 * progress);

/** Mix of two 0xRRGGBB colors, `k` of the way from `a` to `b`. */
export function mixColor(a, b, k) {
  const m = (s) => Math.round((a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * unit(k));
  return m(16) << 16 | m(8) << 8 | m(0);
}

/** The done moment `t` s after the building stood: each part's share (0..1). `color`: the body's way to full color and
 *  paint; `strip`: what is left of scaffold, bud and foundation; `roof`: the Kingdom's roof slice; `ring`: what is left
 *  of the Expedition's working ring; `heads`: its portal and dish heads; `glow`: a light's strength as a multiple of its
 *  normal (the Expedition's rises past it, `glowPeak`, and settles; the Kingdom's follows `color`). `over` once it is
 *  done with (t >= DONE.life). */
export function doneAt(t, vael = false) {
  const color = easeOutCubic(unit(t / DONE.color));
  const [g0, g1] = DONE.glowUp;
  const glow = !vael ? color : t < g0 ? 0 : t < g1 ? DONE.glowPeak * (t - g0) / (g1 - g0) : DONE.glowPeak - (DONE.glowPeak - 1) * easeOutCubic(unit((t - g1) / (DONE.life - g1)));
  return {
    color,
    strip: 1 - easeOutCubic(unit(t / DONE.strip)), // (ahead of the paint: no half-faded plank over the new colors)
    roof: 1 - (1 - unit(t / DONE.roof)) ** 2, // (ease-out)
    ring: 1 - easeInQuad(unit(t / DONE.ring)),
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
  weld: { scale: 0.32, tint: 0xe4f4ff, life: 0.05, light: 0xbfe6ff, lightScale: 0.12, lift: 6 },
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
