// Effects at 2x resolution, painted with smooth gradients (explosions, smoke, muzzle flash, sparks, projectiles,
// selection rings, the light blob and the rally flag). Names match what the renderer asks for; `harpoon` and `beam`
// (the ground family) wait for the renderer to pick a projectile's art by its shooter.
import { image, hash2, vnoise } from './raster.js';
import { VP } from '../render3d/vael-palette.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (stops, t) => { t = clamp01(t); for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], k = (t - t0) / (t1 - t0); return c0.map((v, j) => lerp(v, c1[j], k)); } return stops[stops.length - 1][1]; };
const FIRE = [[0, [255, 255, 235]], [0.25, [255, 214, 110]], [0.5, [255, 130, 40]], [0.75, [190, 50, 20]], [1, [80, 20, 10]]];

/** Fireball → smoke over n frames; size px square. */
function explosion(size, n, f, seed) {
  const t = f / (n - 1), R = size / 2;
  return image(size, size, (x, y) => {
    const dx = x + 0.5 - R, dy = y + 0.5 - R, d = Math.hypot(dx, dy) / R;
    const turb = (vnoise(x + seed * 50, y, size / 6, seed, 0) - 0.5) * 0.5 + (vnoise(x, y + seed * 30, size / 14, seed + 1, 0) - 0.5) * 0.25;
    const fireR = (0.3 + 0.55 * Math.min(1, t * 2.4)) * (1 - Math.max(0, t - 0.55) * 1.6);
    const smokeR = 0.4 + 0.55 * t;
    let out = [0, 0, 0, 0];
    const sd = d + turb * 0.6;
    if (t > 0.15 && sd < smokeR) { // smoke behind
      const a = clamp01((smokeR - sd) * 4) * (1 - t) * 0.85, v = 40 + turb * 60 + (1 - d) * 30;
      out = [v, v * 1.02, v * 1.08, a * 255];
    }
    const fd = d + turb * 0.8;
    if (fd < fireR) {
      const heat = clamp01(fd / fireR * 0.8 + t * 0.7 - (f === 0 ? 0.4 : 0)), c = ramp(FIRE, heat), a = clamp01((fireR - fd) * 6);
      const A = out[3] / 255, B = a; out = [c[0] * B + out[0] * (1 - B), c[1] * B + out[1] * (1 - B), c[2] * B + out[2] * (1 - B), (B + A * (1 - B)) * 255];
    }
    return out.map(Math.round);
  });
}
function puff(f) { const t = f / 3, R = 16; return image(32, 32, (x, y) => { const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R + (vnoise(x, y, 5, 3 + f, 0) - 0.5) * 0.35; const r = 0.45 + t * 0.5; if (d > r) return [0, 0, 0, 0]; const v = 70 + (1 - d / r) * 40; return [v, v, v * 1.05, Math.round(clamp01((r - d) * 5) * 190 * (1 - t))]; }); }
function flash(f) { return image(32, 32, (x, y) => { const dx = Math.abs(x + 0.5 - 16), dy = Math.abs(y + 0.5 - 16), r = 14 - f * 4; const v = Math.max(0, 1 - (dx + dy * 2.6) / r, 1 - (dy + dx * 2.6) / (r * 0.75), 1 - Math.hypot(dx, dy) / (r * 0.5)); if (v <= 0) return [0, 0, 0, 0]; const c = ramp(FIRE, 1 - v); return [c[0], c[1], c[2], Math.round(clamp01(v * 1.6) * 255)]; }); }
function spark(f) { return image(16, 16, (x, y) => { const dx = Math.abs(x + 0.5 - 8), dy = Math.abs(y + 0.5 - 8), r = 2 + f * 1.5; const v = Math.max(0, 1 - dx / r - dy * 1.4, 1 - dy / r - dx * 1.4, 1 - Math.hypot(dx, dy) / 2.4); if (v <= 0) return [0, 0, 0, 0]; const c = ramp(FIRE, 0.15 + f * 0.15); return [c[0], c[1], c[2], Math.round(clamp01(v) * 255 * (1 - f * 0.18))]; }); }
function light() { return image(128, 128, (x, y) => { const d = Math.hypot(x + 0.5 - 64, y + 0.5 - 64) / 64; const a = Math.max(0, 1 - d) ** 2; return [255, 255, 255, Math.round(255 * a)]; }); }
function bolt() { return image(24, 8, (x, y) => { const t = x / 23, dy = Math.abs(y + 0.5 - 4); const core = clamp01(1 - dy / 1.6) * t, glow = clamp01(1 - dy / 4) * t * 0.6; return [255, 240 - (1 - core) * 40, 190 - (1 - core) * 90, Math.round(Math.max(core, glow) * 255)]; }); }
function missile() { // 20x8 rocket with a hot tail, pointing +x
  return image(20, 8, (x, y) => { const dy = Math.abs(y + 0.5 - 4); if (x >= 8 && dy < 1.6) return x > 17 ? [240, 240, 240, 255] : [150, 156, 166, 255]; if (x < 8 && dy < 2.6 - (8 - x) * 0.25) { const c = ramp(FIRE, 1 - x / 8); return [c[0], c[1], c[2], Math.round(255 * x / 8)]; } return [0, 0, 0, 0]; });
}
/** The Harpooner's harpoon (`harpoon`, 36x10, pointing +x, its tip at the anchor): a dark iron shaft, a brass barbed
 *  head, and the pale line paying out behind it with a sag. For the coder to wire by the shooter's kind (look.js). */
function harpoon() {
  return image(36, 10, (x, y) => {
    const cy = 5, dy = y + 0.5 - cy;
    if (x >= 30 && Math.abs(dy) < 1.2 + (35 - x) * 0.25) return x >= 33 ? [196, 150, 60, 255] : [150, 112, 44, 255];        // the brass head
    if (x >= 27 && x < 31 && Math.abs(dy) > 1 && Math.abs(dy) < 2.4 + (31 - x) * 0.3) return [120, 92, 40, 255];            // the barbs
    if (x >= 10 && x < 30 && Math.abs(dy) < 1.1) return dy < -0.3 ? [84, 86, 90, 255] : [38, 40, 44, 255];                    // the shaft, a lit edge
    const sag = Math.sin((x / 10) * Math.PI / 2) * 2.2;                                                                   // the line: from the shaft's butt back and down
    if (x < 11 && Math.abs(dy - (2.2 - sag)) < 0.7) return [200, 180, 140, Math.round(255 * (0.4 + x / 18))];
    return [0, 0, 0, 0];
  });
}
/** The Lens's beam (`beam`, 40x8, +x, its head at the anchor): a lance of deeplight, a cream heart in a sheath of the
 *  Vael's lantern light (tools/render3d/vael-palette.js), fading to the tail. For the coder to wire by the shooter's kind (look.js). */
function beam() {
  return image(40, 8, (x, y) => {
    const t = Math.min(1, x / 30), dy = Math.abs(y + 0.5 - 4), core = clamp01(1 - dy / 1.1) * t, sheath = clamp01(1 - dy / 3.2) * t * 0.7;
    if (core <= 0 && sheath <= 0) return [0, 0, 0, 0];
    const k = Math.max(core, sheath);
    const { sheath: s, heart: h } = VP.beam;
    return [Math.round(lerp(s[0], h[0], core)), Math.round(lerp(s[1], h[1], core)), Math.round(lerp(s[2], h[2], core)), Math.round(k * 255)];
  });
}
function heal(f) { // 24x24 green sparkle for healing
  return image(24, 24, (x, y) => { const dx = Math.abs(x + 0.5 - 12), dy = Math.abs(y + 0.5 - 12), r = 4 + f * 3; const v = Math.max(0, 1 - Math.hypot(dx, dy) / r) * (1 - f * 0.25), plus = (dx < 1.2 && dy < r) || (dy < 1.2 && dx < r) ? 1 : 0; const a = Math.max(v * 0.6, plus * (1 - f * 0.3)); return [120, 255, 160, Math.round(a * 255)]; });
}
function shell() { return image(16, 16, (x, y) => { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); const a = clamp01(1 - (d - 3) / 4); const c = ramp(FIRE, d / 7); return [c[0], c[1], c[2], Math.round(a * 255)]; }); }
function ring(r, rgb) { const W = r * 4 + 8, H = Math.round(r * 2.4) + 8; return image(W, H, (x, y) => { const v = Math.hypot((x + 0.5 - W / 2) / (r * 2), (y + 0.5 - H / 2) / (r * 1.2)); const a = clamp01(1 - Math.abs(v - 0.92) * r * 2 / 2.2); return [...rgb, Math.round(a * 240)]; }); }
function flag(f) {
  return image(32, 40, (x, y) => {
    if (x >= 6 && x < 9 && y >= 4 && y < 38) return x === 6 ? [190, 196, 206, 255] : [110, 116, 126, 255];
    const w = Math.sin((x - 9) / 5 + f * 1.57) * 1.6, top = 4 + w, bot = 18 + w * 0.6, len = 18 - (y - top) * 0.15;
    if (x >= 9 && x < 9 + len && y >= top && y < bot) { const sh = 0.75 + 0.25 * Math.sin((x - 9) / 5 + f * 1.57 + 1); return [240 * sh, 180 * sh, 40 * sh, 255].map(Math.round); }
    return [0, 0, 0, 0];
  });
}

export function effectSprites() {
  const out = [], c = { x: 0.5, y: 0.5 };
  for (let f = 0; f < 8; f++) out.push({ name: `boom_big_${f}`, img: explosion(128, 8, f, 3), anchor: c });
  for (let f = 0; f < 6; f++) out.push({ name: `boom_small_${f}`, img: explosion(56, 6, f, 7), anchor: c });
  for (let f = 0; f < 4; f++) out.push({ name: `puff_${f}`, img: puff(f), anchor: c });
  for (let f = 0; f < 3; f++) out.push({ name: `flash_${f}`, img: flash(f), anchor: c });
  for (let f = 0; f < 4; f++) out.push({ name: `spark_${f}`, img: spark(f), anchor: c });
  for (let f = 0; f < 4; f++) out.push({ name: `flag_${f}`, img: flag(f), anchor: { x: 0.2, y: 0.95 } });
  out.push({ name: 'light', img: light(), anchor: c });
  out.push({ name: 'bolt', img: bolt(), anchor: { x: 1, y: 0.5 } });
  out.push({ name: 'shell', img: shell(), anchor: c });
  out.push({ name: 'missile', img: missile(), anchor: { x: 0.9, y: 0.5 } });
  for (let f = 0; f < 3; f++) out.push({ name: `heal_${f}`, img: heal(f), anchor: c });
  out.push({ name: 'harpoon', img: harpoon(), anchor: { x: 1, y: 0.5 } });
  out.push({ name: 'beam', img: beam(), anchor: { x: 1, y: 0.5 } });
  for (const r of [12, 18, 26]) { out.push({ name: `sel_${r}_0`, img: ring(r, [90, 214, 125]), anchor: c }); out.push({ name: `sel_${r}_1`, img: ring(r, [255, 90, 90]), anchor: c }); }
  return out;
}
