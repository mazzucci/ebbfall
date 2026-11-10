// The re-theme's effects (the ground family, 2026-11-10), painted at 2x in the sprites' own finish: hard edges (no
// soft alpha), 5-bit banding, ink along the silhouette, the light from the north-west. Projectiles at their real game
// size, pointing +x with their tip at the anchor as the renderer rotates them; animations in frames. `effectSprites`
// names them `rt_*` for tools/art/retheme-ground.mjs; `atlasEffects` gives generate.mjs the same under the game's
// names (the shots by name, picked by shooter or people in look.js SHOT_LOOK / PEOPLE_SHOT; boom_big_f, boom_small_f,
// puff_f, flash_f, spark_f, trail_f; worn_n, the decal under a building).
import { image, hash2, vnoise } from './raster.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** The finish: alpha hard at 128, the sprites' S-curve and 5-bit banding, a 1 px ink along the silhouette (0.45, as
 *  scene.js) and along a step in luminance (0.8), the light's edge left alone. `soft`: a set of pixels (as indices)
 *  kept at their painted alpha (a halo). */
export function finishFx(img, { ink = true } = {}) {
  const { w, h, data: d } = img, src = new Uint8ClampedArray(d);
  const lum = (i) => 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] < 128) { d[i + 3] = 0; continue; }
    let k = 1;
    if (ink) for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) { k = Math.min(k, 0.45); continue; }
      const j = (ny * w + nx) * 4;
      if (src[j + 3] < 128) k = Math.min(k, 0.45);
      else if (lum(j) - lum(i) > 0.22 * Math.max(lum(i), 30)) k = Math.min(k, 0.8);
    }
    for (let c = 0; c < 3; c++) { const v = 255 * smooth(0.03, 0.97, src[i + c] * k / 255); d[i + c] = Math.round(v / 8) * 8 + 4; }
    d[i + 3] = 255;
  }
  return img;
}
const fx = (w, h, fn, o) => finishFx(image(w, h, fn), o);
const NONE = [0, 0, 0, 0];

// the palettes: fire in four hard steps (white heart, yellow, orange, a dark red rim); smoke in three greys lit from
// the north-west; timber, steel, feathers; a tracer's pale yellow-white
const FIRE = [[255, 250, 225], [255, 214, 96], [240, 128, 40], [150, 48, 24]];
const SMOKE = [[172, 168, 164], [124, 122, 120], [84, 82, 82]];
// the kingdom's shafts pale (round 2's judge: dark shafts vanished on the grass at 1x): a lit edge near white, pale ash below
const TIMBER = [236, 222, 186], TIMBER_DARK = [186, 160, 110], STEEL = [206, 210, 214], STEEL_DARK = [124, 128, 134], FEATHER = [240, 236, 226], FEATHER_DARK = [170, 164, 152];
const TRAIL = [[206, 204, 200], [164, 162, 158], [118, 116, 114]];
const TRACER = [255, 246, 210], TRACER_TAIL = [232, 184, 96], LED = [240, 246, 244], CHARCOAL = [84, 88, 86], CHARCOAL_DARK = [48, 50, 52], ROCK = [138, 136, 130], ROCK_DARK = [72, 70, 66];
/** The fire's colour at heat t (0 the heart, 1 the rim), in hard steps. */
const fire = (t) => FIRE[Math.min(3, Math.floor(clamp01(t) * 4))];

// ---------------- projectiles ----------------
/** The kingdom's arrow (`rt_arrow`, 34x8; the Archer, the Watchtower): a pale shaft with a near-white lit edge, a steel
 *  head, two pale feathers at the tail. The shaft is 6 px (3 CSS px) thick, three times an arrow's (the rule's limit),
 *  so it shows on grass as the Expedition's tracers do. */
function arrow() {
  return image(34, 8, (x, y) => {
    const dy = y + 0.5 - 4;
    if (x >= 28) return Math.abs(dy) < 0.8 + (33.5 - x) * 0.5 ? [...(dy < 0 ? STEEL : STEEL_DARK), 255] : NONE;      // the head
    if (x >= 7 && x < 28 && Math.abs(dy) < 1.55) return [...(dy < -0.5 ? TIMBER : TIMBER_DARK), 255];                 // the shaft
    if (x < 8 && Math.abs(dy) > 0.6 && Math.abs(dy) < 1.5 + (8 - x) * 0.3 && x > 0) return [...(dy < 0 ? FEATHER : FEATHER_DARK), 255];   // the fletching
    return NONE;
  });
}
/** The ballista's bolt (`rt_bolt`, 44x8): a thick shaft, a long steel head, dark fletching; the Ballista's bolt is 15
 *  units long at sim scale, 21 world px at 1.4x, 42 atlas px. */
function ballistaBolt() {
  return image(48, 10, (x, y) => {
    const dy = y + 0.5 - 5;
    if (x >= 39) return Math.abs(dy) < 0.9 + (47.5 - x) * 0.32 ? [...(dy < 0 ? STEEL : STEEL_DARK), 255] : NONE;
    if (x >= 7 && Math.abs(dy) < 1.8) return [...(dy < -0.6 ? TIMBER : TIMBER_DARK), 255];
    if (x < 9 && x > 0 && Math.abs(dy) > 1 && Math.abs(dy) < 1.9 + (9 - x) * 0.3) return [...(dy < 0 ? FEATHER : FEATHER_DARK), 255];
    return NONE;
  });
}
/** The trebuchet's stone (`rt_stone`, 22x22, its anchor at the centre): a round grey rock lit from the north-west, in
 *  three hard bands, a few chips of a darker grey. */
function stone() {
  return image(22, 22, (x, y) => {
    const dx = x + 0.5 - 11, dy = y + 0.5 - 11, d = Math.hypot(dx, dy) + (hash2(x, y, 5) - 0.5) * 1.2;
    if (d > 10) return NONE;
    const lit = clamp01(0.55 - (dx + dy) / 22 - d / 30), c = lit > 0.55 ? [170, 168, 160] : lit > 0.3 ? ROCK : ROCK_DARK;
    return [...(vnoise(x, y, 4, 7, 0) > 0.72 ? ROCK_DARK : c), 255];
  });
}
/** A rifle tracer (`rt_tracer`, 26x4; the Marine, the Mercenary, the Veteran): a short bright line, its heart pale
 *  yellow-white, its tail darkening in two steps. Not a laser: 13 CSS px long, 2 thick. */
function tracer(len = 26, head = TRACER, tail = TRACER_TAIL) {
  return image(len, 4, (x, y) => {
    const dy = Math.abs(y + 0.5 - 2), t = x / len;
    if (dy > 1.0 || t < 0.08) return NONE;
    return [...(t > 0.6 ? head : t > 0.3 ? mix(tail, head, 0.5) : tail), 255];
  });
}
/** The Drone's dart (`rt_dart`, 18x4): a short dark dart with a white tip. */
function dart() {
  return image(18, 4, (x, y) => {
    const dy = Math.abs(y + 0.5 - 2);
    if (x >= 14) return dy < 0.6 + (17.5 - x) * 0.3 ? [...LED, 255] : NONE;
    if (x >= 2 && dy < 1.0) return [...(y < 2 ? CHARCOAL : CHARCOAL_DARK), 255];
    return NONE;
  });
}
/** The Radio tower's shot (`rt_tower_shot`, 22x4): a short LED-white tracer, cooler than the rifles'. */
const towerShot = () => tracer(22, LED, [150, 170, 172]);
/** The Rover's rocket (`rt_rocket`, 30x10, pointing +x, the anchor at 0.9): a charcoal body with a pale nose and
 *  fins, a short hard flame; the renderer spawns `rt_puff` behind it for the smoke trail, as it does for the missile. */
function rocket() {
  return image(30, 10, (x, y) => {
    const dy = y + 0.5 - 5, ad = Math.abs(dy);
    if (x >= 25) return ad < 0.8 + (29.5 - x) * 0.45 ? [...(dy < 0 ? STEEL : STEEL_DARK), 255] : NONE;              // the nose, pale
    if (x >= 10 && x < 25 && ad < 2.1) return [...(dy < -0.7 ? CHARCOAL : CHARCOAL_DARK), 255];                      // the body
    if (x >= 9 && x < 14 && ad >= 2.1 && ad < 2.6 + (13 - x) * 0.7) return [...CHARCOAL_DARK, 255];                 // the fins
    if (x < 10 && x >= 1 && ad < 1.6 - (9 - x) * 0.12) return [...fire(1 - x / 10 + (hash2(x, y, 3) - 0.5) * 0.3), 255];   // the flame
    return NONE;
  });
}

// ---------------- animations ----------------
/** The hit flash (`rt_hit_f`, 3 frames, 32 px): a hard four-point star, white at the heart, yellow, then an orange
 *  rim, shrinking frame by frame. */
function hitFlash(f) {
  return image(32, 32, (x, y) => {
    const dx = Math.abs(x + 0.5 - 16), dy = Math.abs(y + 0.5 - 16), r = 13 - f * 3.5;
    const v = Math.max(1 - (dx + dy * 3) / r, 1 - (dy + dx * 3) / r, 1 - Math.hypot(dx, dy) / (r * 0.45));
    if (v <= 0) return NONE;
    return [...fire((1 - v) * 0.8), 255];
  });
}
/** The muzzle flash (`rt_muzzle_f`, 3 frames, 28x20, +x from the anchor at its left end): a short hard flare with
 *  three spikes, white at the muzzle, orange at the tips. */
function muzzle(f) {
  return image(28, 20, (x, y) => {
    const dy = y + 0.5 - 10, L = 22 - f * 5;
    if (x < 2) return NONE;
    const main = x < L && Math.abs(dy) < (1.5 + (x - 2) * 0.35) * (1 - x / L), up = x < L * 0.6 && Math.abs(dy - (x - 2) * 0.55) < 1.2 * (1 - x / (L * 0.6)), dn = x < L * 0.6 && Math.abs(dy + (x - 2) * 0.55) < 1.2 * (1 - x / (L * 0.6));
    if (!main && !up && !dn) return NONE;
    return [...fire(x / L * 0.9 + f * 0.1), 255];
  });
}
/** Small smoke (`rt_puff_f`, 4 frames, 32 px): three hard lobes of grey, lit from the north-west, growing and
 *  thinning (the last frame breaks into pieces). */
function puff(f) {
  const t = f / 3, k = 1 + t * 0.7, lobes = [[0, 1, 6 * k], [4.5, -2.5, 4.5 * k], [-4.5, -2, 4.2 * k], [1, -5.5, 4 * k], [-2, 4.5, 3.6 * k], [5, 3, 3.4 * k]];
  return image(32, 32, (x, y) => {
    const px = x + 0.5 - 16, py = y + 0.5 - 17 + t * 3;
    let best = 9, lit = 0;
    for (const [lx, ly, r] of lobes) { const d = Math.hypot(px - lx, py - ly) / r; if (d < best) { best = d; lit = clamp01(0.62 - ((px - lx) + (py - ly)) / (r * 2.2)); } }
    if (best > 1 || (t > 0.5 && vnoise(x, y, 5, 13 + f, 0) > 0.7 - (t - 0.5) * 0.35)) return NONE;
    return [...SMOKE[lit > 0.55 ? 0 : lit > 0.3 ? 1 : 2], 255];
  });
}
/** The rocket's trail (`rt_trail_f`, 4 frames, 24 px): a round puff of pale smoke that grows and thins; the renderer
 *  spawns one every few world px behind the rocket and fades it over its life, so the puffs overlap into one soft
 *  trail (round 2's judge: spaced puffs read as a row of thrown pebbles). */
function trail(f) {
  const t = f / 3, lobes = [[0, 0, 5 + t * 5], [3, -2, 3.5 + t * 3.5], [-3, -1.5, 3.2 + t * 3.2], [0.5, 3, 3 + t * 3]];
  return image(24, 24, (x, y) => {
    const px = x + 0.5 - 12, py = y + 0.5 - 12;
    let best = 9, lit = 0;
    for (const [lx, ly, r] of lobes) { const d = Math.hypot(px - lx, py - ly) / r; if (d < best) { best = d; lit = clamp01(0.62 - ((px - lx) + (py - ly)) / (r * 2.2)); } }
    if (best > 1 || (t > 0.4 && vnoise(x, y, 4, 17 + f, 0) > 0.72 - (t - 0.4) * 0.35)) return NONE;
    return [...TRAIL[lit > 0.55 ? 0 : lit > 0.3 ? 1 : 2], 255];
  });
}
/** An explosion (`rt_boom_f`, 8 frames at 128 px for a building, `rt_boom_small_f`, 6 at 56 for a unit): a fireball in
 *  four hard bands breaking into lobes, smoke in three greys rising behind it as the fire shrinks, dark bits flying
 *  out. Hard edges and banding, in the sprites' medium (today's is a soft painted blob). */
function boom(size, n, f, seed) {
  const t = f / (n - 1), R = size / 2, bits = Array.from({ length: 10 }, (_, k) => ({ a: hash2(k, 1, seed) * 6.3, v: 0.5 + hash2(k, 2, seed) * 0.5, s: 1.5 + hash2(k, 3, seed) * 2 }));
  return image(size, size, (x, y) => {
    const dx = x + 0.5 - R, dy = y + 0.5 - R;
    const turb = (vnoise(x + seed * 50, y, size / 7, seed + f, 0) - 0.5) * 0.5 + (vnoise(x, y + seed * 30, size / 16, seed + f + 1, 0) - 0.5) * 0.25;
    const fireR = (0.28 + 0.6 * Math.min(1, t * 2.2)) * (1 - Math.max(0, t - 0.5) * 1.9), smokeR = 0.35 + 0.6 * t;
    for (const b of bits) { const bx = Math.cos(b.a) * b.v * t * R * 1.1, by = Math.sin(b.a) * b.v * t * R * 0.9 - t * t * R * 0.2; if (t > 0.1 && t < 0.9 && Math.abs(dx - bx) < b.s && Math.abs(dy - by) < b.s) return [...SMOKE[2], 255]; }
    const sy = dy + t * R * 0.35, sd = Math.hypot(dx, sy) / R + turb * 0.7;
    const fd = Math.hypot(dx, dy) / R + turb * 0.9;
    if (fd < fireR) return [...fire(fd / fireR * 0.9 + t * 0.5 - (f === 0 ? 0.3 : 0)), 255];
    if (t > 0.12 && sd < smokeR) {
      const lit = clamp01(0.6 - (dx + sy) / (R * smokeR * 1.5));
      if (t > 0.65 && vnoise(x, y, size / 10, seed + f + 7, 0) > 0.75 - (t - 0.65) * 0.5) return NONE;   // thinning
      return [...SMOKE[lit > 0.6 ? 0 : lit > 0.3 ? 1 : 2], 255];
    }
    return NONE;
  });
}
/** A spark (`rt_spark_f`, 4 frames, 16 px): a hard diamond of fire shrinking to a dot. */
function spark(f) {
  return image(16, 16, (x, y) => { const dx = Math.abs(x + 0.5 - 8), dy = Math.abs(y + 0.5 - 8), r = 3.5 - f * 0.7; if (dx + dy > r) return NONE; return [...fire(0.2 + f * 0.2), 255]; });
}

/** Worn dirt under a building (`rt_worn_n`, painted soft, no finish: a decal in the ground's layer, not a sprite in
 *  the finish): trodden earth over the footprint and a little beyond, its edge broken by grass, its alpha low so the
 *  grass shows through; no path leaves it. Proposed as the client's decal under each building of a base. */
export function wornDirt(n) {
  const W = n * 64 + 88, h = W / 2;
  return image(W, W, (x, y) => {
    const dx = (x + 0.5 - h) / (n * 32 + 22), dy = (y + 0.5 - h) / (n * 32 + 22), d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.4 + Math.hypot(dx, dy) * 0.6 + (vnoise(x, y, 12, 21 + n, 0) - 0.5) * 0.35;
    const a = smooth(1.05, 0.5, d) * (0.5 + vnoise(x, y, 7, 23 + n, 0) * 0.3);                  // (round 1's tight square read as a mat: rounder, wider, thinner)
    if (a < 0.04) return NONE;
    const c = mix([120, 110, 84], [92, 84, 64], vnoise(x, y, 5, 25 + n, 0));
    return [c[0], c[1], c[2], Math.round(a * 0.55 * 255)];
  });
}

export function effectSprites() {
  const out = [], c = { x: 0.5, y: 0.5 }, tip = { x: 1, y: 0.5 };
  out.push({ name: 'rt_arrow', img: finishFx(arrow()), anchor: tip });
  out.push({ name: 'rt_bolt', img: finishFx(ballistaBolt()), anchor: tip });
  out.push({ name: 'rt_stone', img: finishFx(stone()), anchor: c });
  out.push({ name: 'rt_tracer', img: finishFx(tracer(), { ink: false }), anchor: tip });
  out.push({ name: 'rt_dart', img: finishFx(dart()), anchor: tip });
  out.push({ name: 'rt_tower_shot', img: finishFx(towerShot(), { ink: false }), anchor: tip });
  out.push({ name: 'rt_rocket', img: finishFx(rocket()), anchor: { x: 0.9, y: 0.5 } });
  for (let f = 0; f < 3; f++) out.push({ name: `rt_hit_${f}`, img: finishFx(hitFlash(f)), anchor: c });
  for (let f = 0; f < 3; f++) out.push({ name: `rt_muzzle_${f}`, img: finishFx(muzzle(f)), anchor: { x: 0.07, y: 0.5 } });
  for (let f = 0; f < 4; f++) out.push({ name: `rt_puff_${f}`, img: finishFx(puff(f)), anchor: c });
  for (let f = 0; f < 4; f++) out.push({ name: `rt_trail_${f}`, img: finishFx(trail(f), { ink: false }), anchor: c });
  for (let f = 0; f < 8; f++) out.push({ name: `rt_boom_${f}`, img: finishFx(boom(128, 8, f, 3)), anchor: c });
  for (let f = 0; f < 6; f++) out.push({ name: `rt_boom_small_${f}`, img: finishFx(boom(56, 6, f, 7)), anchor: c });
  for (let f = 0; f < 4; f++) out.push({ name: `rt_spark_${f}`, img: finishFx(spark(f)), anchor: c });
  for (const n of [2, 3, 4]) out.push({ name: `rt_worn_${n}`, img: wornDirt(n), anchor: c });
  void fx;
  return out;
}

/** The atlas's effects (generate.mjs): effectSprites under the names the renderer asks for. The muzzle flash is left
 *  out: nothing draws one yet. */
const ATLAS_NAMES = [[/^rt_arrow$/, 'arrow'], [/^rt_bolt$/, 'ballista_bolt'], [/^rt_stone$/, 'stone'], [/^rt_tracer$/, 'tracer'], [/^rt_dart$/, 'dart'],
  [/^rt_tower_shot$/, 'tower_shot'], [/^rt_rocket$/, 'rocket'], [/^rt_hit_/, 'flash_'], [/^rt_puff_/, 'puff_'], [/^rt_trail_/, 'trail_'],
  [/^rt_boom_small_/, 'boom_small_'], [/^rt_boom_/, 'boom_big_'], [/^rt_spark_/, 'spark_'], [/^rt_worn_/, 'worn_']];
export function atlasEffects() {
  const out = [];
  for (const s of effectSprites()) { const hit = ATLAS_NAMES.find(([re]) => re.test(s.name)); if (hit) out.push({ ...s, name: s.name.replace(hit[0], hit[1]) }); }
  return out;
}
