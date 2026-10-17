// Resources, buildings and effects.
import { Sprite, shade, image, hash2 } from './raster.js';
import { RAMPS, TEAMS, OUTLINE } from './palette.js';

const T = 32;
const teamRamps = (team) => ({ ...RAMPS, team: TEAMS[team].team, trim: TEAMS[team].trim });

// ---------- resources ----------

/** Shard field: a cluster of faceted crystals; stage 0 is full, 3 nearly mined out. 32x32. */
function shardField(stage) {
  const s = new Sprite(T, T).frame(16, 18);
  const crystals = [[-6, 2, 4, 9, -0.25], [5, 3, 3.5, 8, 0.3], [0, -1, 4.5, 12, 0.05], [-2, 6, 3, 6, -0.5], [7, -3, 2.5, 6, 0.6]];
  s.ellipse(0, 4, 11, 6, 'dark', 0.5);
  crystals.slice(0, 5 - stage).forEach(([x, y, w, h, lean]) => {
    const k = 1 - stage * 0.12, tip = [x + lean * h, y - h * k];
    s.poly([[x - w * k, y], tip, [x, y + 2]], 'shard', 3 + h / 3);          // lit facet
    s.poly([[x, y + 2], tip, [x + w * k, y]], 'shard', 2 + h / 4);          // shaded facet
  });
  return shade(s, RAMPS, { outline: OUTLINE });
}

/** Ether vent: a rocky ring around a glowing well; 4 frames of swirl. 64x64. */
function etherVent(f) {
  const s = new Sprite(64, 64).frame(32, 32);
  s.ring(0, 0, 18, 27, 'ventRim', 2);
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + 0.3; s.circle(Math.cos(a) * 23, Math.sin(a) * 23, 4.5 + hash2(k, 1, 5) * 2, 'ventRim', 3, 1.5); }
  s.circle(0, 0, 18, 'dark', 0.2);
  for (let k = 0; k < 3; k++) {
    const a0 = k / 3 * Math.PI * 2 + f / 4 * Math.PI * 2 / 3;
    for (let t = 0; t < 1; t += 0.04) { const a = a0 + t * 2.4, r = 4 + t * 11; s.circle(Math.cos(a) * r, Math.sin(a) * r, 1.6 - t * 0.6, 'ether', 1, 0); }
  }
  s.circle(0, 0, 4 + (f % 2), 'ether', 1.5);
  return shade(s, RAMPS, { outline: OUTLINE, flat: ['ether'], noOutline: ['ether', 'dark'] });
}

// ---------- buildings (top-down with a south wall for depth) ----------

/** A raised block: roof polygon plus a darker south wall `wall` px tall. */
function block(s, x, y, w, h, mat, ht, wall = 5) {
  s.rect(x, y + h - wall, w, wall, 'plate', ht * 0.5);
  s.rect(x, y, w, h - wall, mat, ht);
}

function core(s) {
  s.poly([[12, 4], [116, 4], [124, 12], [124, 116], [116, 124], [12, 124], [4, 116], [4, 12]], 'concrete', 1);
  for (const [x, y] of [[8, 8], [104, 8], [8, 104], [104, 104]]) { s.rect(x, y, 16, 16, 'plate', 2.5); s.rect(x + 4, y + 4, 8, 8, 'trim', 4); }
  s.rect(10, 60, 108, 8, 'hazard', 1.3); s.rect(60, 10, 8, 108, 'hazard', 1.3);
  s.circle(64, 64, 40, 'plate', 3, 3);
  s.circle(64, 64, 34, 'team', 5, 6);
  s.ring(64, 64, 22, 26, 'trim', 9);
  s.circle(64, 64, 14, 'steel', 10, 3);
  s.circle(64, 64, 7, 'light', 13);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; s.rect(64 + Math.cos(a) * 36 - 4, 64 + Math.sin(a) * 36 - 4, 8, 8, 'steel', 6); }
}
function depot(s) {
  s.rect(3, 3, 58, 58, 'concrete', 1);
  block(s, 7, 7, 50, 20, 'team', 4); s.rect(9, 9, 46, 3, 'trim', 4.5);
  block(s, 7, 30, 24, 26, 'plate', 4); block(s, 34, 30, 23, 26, 'team', 3);
  s.rect(10, 34, 18, 2, 'steel', 4.2); s.rect(10, 40, 18, 2, 'steel', 4.2);
}
function extractor(s) {
  s.ring(32, 32, 20, 29, 'plate', 2);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; s.line(32, 32, 32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28, 5, 'steel', 3); }
  s.circle(32, 32, 15, 'team', 4, 3);
  s.circle(32, 32, 9, 'dark', 5);
  s.circle(32, 32, 6, 'ether', 6);
  s.rect(46, 6, 12, 14, 'trim', 4); s.rect(48, 8, 8, 4, 'glass', 5);
}
function barracks(s) {
  s.rect(3, 3, 90, 90, 'concrete', 1);
  block(s, 8, 10, 80, 60, 'team', 5, 8);
  s.rect(8, 10, 80, 6, 'trim', 6); s.rect(46, 16, 4, 46, 'plate', 6);
  s.rect(36, 62, 24, 8, 'dark', 2.5);                 // door
  for (let k = 0; k < 3; k++) s.rect(14 + k * 8, 22, 5, 30, 'plate', 5.5);
  for (let k = 0; k < 3; k++) s.rect(62 + k * 8, 22, 5, 30, 'plate', 5.5);
  s.rect(8, 76, 80, 6, 'hazard', 1.2);
}
function forge(s) {
  s.rect(3, 3, 90, 90, 'concrete', 1);
  block(s, 6, 8, 84, 70, 'plate', 5, 9);
  s.rect(10, 12, 76, 10, 'team', 6.5);
  s.circle(26, 44, 12, 'steel', 7, 3); s.circle(26, 44, 6, 'dark', 8);        // chimneys
  s.circle(70, 44, 12, 'steel', 7, 3); s.circle(70, 44, 6, 'dark', 8);
  s.rect(38, 30, 20, 30, 'team', 6); s.rect(42, 40, 12, 8, 'fire', 7);
  s.rect(34, 69, 28, 9, 'fire', 2);                   // furnace mouth
  s.rect(6, 82, 84, 5, 'hazard', 1.2);
}
function turretBase(s) {
  s.rect(4, 4, 56, 56, 'concrete', 1);
  s.circle(32, 32, 24, 'plate', 2.5, 3);
  s.ring(32, 32, 18, 22, 'team', 3.5);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; s.rect(32 + Math.cos(a) * 20 - 3, 32 + Math.sin(a) * 20 - 3, 6, 6, 'hazard', 3); }
}
/** Turret head facing +x, rotated into 16 facings. 40x40. */
function turretHead(s) {
  s.rect(2, -5, 15, 4, 'barrel', 6); s.rect(2, 1, 15, 4, 'barrel', 6);
  s.rect(14, -5, 4, 4, 'steel', 6.2); s.rect(14, 1, 4, 4, 'steel', 6.2);
  s.circle(0, 0, 9, 'team', 5, 3);
  s.rect(-6, -3, 6, 6, 'trim', 7.5);
  s.rect(2, -2, 3, 4, 'glass', 8);
}

export const BUILDING_ART = { core: [4, core], depot: [2, depot], extractor: [2, extractor], barracks: [3, barracks], forge: [3, forge], turret: [2, turretBase] };

/** Foundation plate for a footprint of n tiles: concrete, hazard corners. */
function foundation(n) {
  const s = new Sprite(n * T, n * T).frame(0, 0), W = n * T;
  s.rect(3, 3, W - 6, W - 6, 'concrete', 1);
  for (const [x, y] of [[3, 3], [W - 11, 3], [3, W - 11], [W - 11, W - 11]]) s.rect(x, y, 8, 8, 'hazard', 1.5);
  return shade(s, RAMPS, { outline: OUTLINE });
}
/** Scaffold overlay (girders and poles), drawn over a building under construction. */
function scaffold(n) {
  const s = new Sprite(n * T, n * T).frame(0, 0), W = n * T;
  for (let k = 6; k < W - 4; k += 14) { s.line(k, 4, k, W - 4, 2, 'steel', 9); s.line(4, k, W - 4, k, 2, 'steel', 9); }
  s.line(6, 6, W - 6, W - 6, 2, 'hazard', 9.5); s.line(W - 6, 6, 6, W - 6, 2, 'hazard', 9.5);
  return shade(s, RAMPS, { outline: OUTLINE });
}
/** Rubble left where a building fell. */
function rubble(n) {
  const s = new Sprite(n * T, n * T).frame(0, 0), W = n * T;
  s.rect(4, 4, W - 8, W - 8, 'dark', 0.5);
  for (let k = 0; k < n * n * 6; k++) {
    const x = 6 + hash2(k, n, 3) * (W - 12), y = 6 + hash2(k, n, 4) * (W - 12), r = 2 + hash2(k, n, 5) * 4;
    s.circle(x, y, r, k % 3 ? 'plate' : 'concrete', 1 + r / 2, 1);
  }
  return shade(s, RAMPS, { outline: OUTLINE });
}

export function buildingSprites() {
  const out = [];
  for (const [type, [n, draw]] of Object.entries(BUILDING_ART)) for (let team = 0; team < 2; team++) {
    const s = new Sprite(n * T, n * T).frame(0, 0); draw(s);
    out.push({ name: `bldg_${type}_${team}`, img: shade(s, teamRamps(team), { outline: OUTLINE, flat: ['fire', 'light', 'ether'] }), anchor: { x: 0, y: 0 } });
  }
  for (let team = 0; team < 2; team++) for (let dir = 0; dir < 16; dir++) {
    const s = new Sprite(40, 40).frame(20, 20, dir / 16 * Math.PI * 2); turretHead(s);
    out.push({ name: `turret_head_${team}_${dir}`, img: shade(s, teamRamps(team), { outline: OUTLINE }), anchor: { x: 0.5, y: 0.5 } });
  }
  for (const n of [2, 3, 4]) {
    out.push({ name: `foundation_${n}`, img: foundation(n), anchor: { x: 0, y: 0 } });
    out.push({ name: `scaffold_${n}`, img: scaffold(n), anchor: { x: 0, y: 0 } });
    out.push({ name: `rubble_${n}`, img: rubble(n), anchor: { x: 0, y: 0 } });
  }
  return out;
}

export function resourceSprites() {
  const out = [];
  for (let st = 0; st < 4; st++) out.push({ name: `shard_${st}`, img: shardField(st), anchor: { x: 0.5, y: 0.5 } });
  for (let f = 0; f < 4; f++) out.push({ name: `vent_${f}`, img: etherVent(f), anchor: { x: 0.5, y: 0.5 } });
  return out;
}

// ---------- effects ----------
const C = (s) => { const n = parseInt(s.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const FIRE = RAMPS.fire.map(C), SMOKE = RAMPS.smoke.map(C);

/** Explosion: flash → fireball → smoke, `n` frames of size px. Pixel-quantised, ragged by hash noise. */
function explosion(size, n, f, seed) {
  const t = f / (n - 1), R = size / 2;
  return image(size, size, (x, y) => {
    const dx = x + 0.5 - R, dy = y + 0.5 - R, d = Math.hypot(dx, dy) / R, a = Math.atan2(dy, dx);
    const rag = 0.82 + 0.18 * Math.sin(a * 5 + seed) * Math.cos(a * 3 - seed) + hash2(x >> 1, y >> 1, seed + f, 0) * 0.12;
    const fireR = (0.25 + 0.65 * Math.min(1, t * 2.2)) * rag, smokeR = (0.45 + 0.55 * t) * rag;
    if (t < 0.85 && d < fireR * (1 - t * 0.9)) { const k = Math.max(0, Math.min(4, Math.floor((1 - d / fireR) * 5 - t * 4 + (f === 0 ? 2 : 0)))); return [...FIRE[k], 255]; }
    if (t > 0.2 && d < smokeR && d > fireR * (1 - t) * 0.6) { const k = hash2(x, y, seed, 0) > 0.5 ? 2 : 1; const al = Math.round(255 * Math.max(0, 1 - t) * 0.9); return al > 30 ? [...SMOKE[k + (d < smokeR * 0.6 ? 1 : 0)], al] : [0, 0, 0, 0]; }
    return [0, 0, 0, 0];
  });
}
function puff(f) { // 16x16 smoke puff for chimneys and damaged buildings
  const t = f / 3, R = 8;
  return image(16, 16, (x, y) => { const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R; const r = 0.4 + t * 0.55; if (d > r) return [0, 0, 0, 0]; const k = d < r * 0.5 ? 3 : 2; return [...SMOKE[k], Math.round(200 * (1 - t))]; });
}
function flash(f) { // 16x16 muzzle flash, star-shaped
  return image(16, 16, (x, y) => { const dx = Math.abs(x + 0.5 - 8), dy = Math.abs(y + 0.5 - 8), r = 7 - f * 2; if (dx + dy * 3 < r || dy + dx * 3 < r * 0.7) return [...FIRE[Math.min(4, 4 - f + (dx + dy < 2 ? 1 : 0))], 255]; return [0, 0, 0, 0]; });
}
function spark(f) {
  return image(8, 8, (x, y) => { const dx = Math.abs(x + 0.5 - 4), dy = Math.abs(y + 0.5 - 4); const r = 1 + f; return (dx < 0.6 && dy < r) || (dy < 0.6 && dx < r) ? [...FIRE[4 - f], 255] : [0, 0, 0, 0]; });
}
/** Smooth radial light for additive glow (not pixel art on purpose). */
function light() { return image(64, 64, (x, y) => { const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32; const a = Math.max(0, 1 - d) ** 2; return [255, 255, 255, Math.round(255 * a)]; }); }
function bolt() { return image(12, 4, (x, y) => { const c = y === 1 || y === 2; const tail = x / 11; return c ? [255, 244, 194, Math.round(255 * tail)] : x > 6 ? [255, 210, 120, Math.round(120 * tail)] : [0, 0, 0, 0]; }); }
function shell() { const s = new Sprite(8, 8).frame(4, 4); s.circle(0, 0, 2.5, 'fire', 2, 1); return shade(s, RAMPS, { outline: OUTLINE, flat: ['fire'] }); }
function ring(r, color) { // selection ring, flattened ellipse
  const W = r * 2 + 4, H = Math.round(r * 1.2) + 4, c = C(color);
  return image(W, H, (x, y) => { const v = ((x + 0.5 - W / 2) / r) ** 2 + ((y + 0.5 - H / 2) / (r * 0.6)) ** 2; return v <= 1.0 && v >= 0.72 ? [...c, 255] : [0, 0, 0, 0]; });
}
function flag(f) { const s = new Sprite(16, 20).frame(0, 0); s.rect(3, 2, 2, 17, 'steel', 2); const w = [0, 1, 0, -1][f]; s.poly([[5, 2], [14, 4 + w], [5, 9]], 'hazard', 3); return shade(s, RAMPS, { outline: OUTLINE }); }

export function effectSprites() {
  const out = [];
  for (let f = 0; f < 8; f++) out.push({ name: `boom_big_${f}`, img: explosion(64, 8, f, 3), anchor: { x: 0.5, y: 0.5 } });
  for (let f = 0; f < 6; f++) out.push({ name: `boom_small_${f}`, img: explosion(28, 6, f, 7), anchor: { x: 0.5, y: 0.5 } });
  for (let f = 0; f < 4; f++) out.push({ name: `puff_${f}`, img: puff(f), anchor: { x: 0.5, y: 0.5 } });
  for (let f = 0; f < 3; f++) out.push({ name: `flash_${f}`, img: flash(f), anchor: { x: 0.5, y: 0.5 } });
  for (let f = 0; f < 4; f++) out.push({ name: `spark_${f}`, img: spark(f), anchor: { x: 0.5, y: 0.5 } });
  for (let f = 0; f < 4; f++) out.push({ name: `flag_${f}`, img: flag(f), anchor: { x: 0.2, y: 0.95 } });
  out.push({ name: 'light', img: light(), anchor: { x: 0.5, y: 0.5 } });
  out.push({ name: 'bolt', img: bolt(), anchor: { x: 1, y: 0.5 } });
  out.push({ name: 'shell', img: shell(), anchor: { x: 0.5, y: 0.5 } });
  for (const r of [12, 18, 26]) { out.push({ name: `sel_${r}_0`, img: ring(r, '#5ad67d'), anchor: { x: 0.5, y: 0.5 } }); out.push({ name: `sel_${r}_1`, img: ring(r, '#ff5a5a'), anchor: { x: 0.5, y: 0.5 } }); }
  return out;
}
