// Canvas 2D renderer: terrain is pre-painted once per map; entities, fog, overlays every frame.
import { G, map, idx, TILE, MW, MH, WW, WH, PLAYER, ENEMY, BUILDINGS, clamp, mulberry, canPlace, visibleEnt } from '../engine/index.js';
import { fx } from './fx.js';
import { drag } from './input.js';

export const cv = document.getElementById('game'), ctx = cv.getContext('2d');
export const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
export const view = { w: 800, h: 500, dpr: 1 };
export const cam = { x: 0, y: 0 };

const terrain = document.createElement('canvas'); terrain.width = WW; terrain.height = WH;
const thumb = document.createElement('canvas'); thumb.width = MW; thumb.height = MH;
const fogCv = document.createElement('canvas'); fogCv.width = MW; fogCv.height = MH;
const fogCtx = fogCv.getContext('2d'); const fogImg = fogCtx.createImageData(MW, MH);

export const ALLY = '#f5a524', ALLY2 = '#ffd27a', FOE = '#e2457a', FOE2 = '#ff8bb0';
const teamCol = t => t === PLAYER ? ALLY : FOE, teamCol2 = t => t === PLAYER ? ALLY2 : FOE2;

export function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  view.w = Math.max(200, r.width | 0); view.h = Math.max(160, r.height | 0); view.dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = view.w * view.dpr; cv.height = view.h * view.dpr; clampCam();
}
export function clampCam() { cam.x = clamp(cam.x, 0, Math.max(0, WW - view.w)); cam.y = clamp(cam.y, 0, Math.max(0, WH - view.h)); }
export function centerOn(x, y) { cam.x = x - view.w / 2; cam.y = y - view.h / 2; clampCam(); }

export function renderTerrain() {
  const t = terrain.getContext('2d'), th = thumb.getContext('2d'); const rnd = mulberry(G.seed * 7 + 3);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y), s = map.shade[i]; const X = x * TILE, Y = y * TILE;
    if (map.rock[i]) {
      const up = y > 0 && !map.rock[idx(x, y - 1)];
      t.fillStyle = `hsl(${215 + s * 10},${12 + s * 6}%,${22 + s * 10}%)`; t.fillRect(X, Y, TILE, TILE);
      t.fillStyle = 'rgba(255,255,255,0.06)'; for (let k = 0; k < 3; k++) t.fillRect(X + rnd() * 26, Y + rnd() * 26, 4 + rnd() * 8, 2 + rnd() * 3);
      if (up) { t.fillStyle = 'rgba(220,230,255,0.18)'; t.fillRect(X, Y, TILE, 3); }
      if (y < MH - 1 && !map.rock[idx(x, y + 1)]) { t.fillStyle = 'rgba(0,0,0,0.35)'; t.fillRect(X, Y + TILE - 4, TILE, 4); }
      th.fillStyle = '#3b4556';
    } else {
      const l = 14 + s * 9;
      t.fillStyle = `hsl(${212 + s * 14},${16 + s * 8}%,${l}%)`; t.fillRect(X, Y, TILE, TILE);
      t.fillStyle = `rgba(255,255,255,${0.025 + s * 0.03})`; for (let k = 0; k < 2; k++) t.fillRect(X + rnd() * 30, Y + rnd() * 30, 2, 2);
      if (rnd() < 0.08) { t.strokeStyle = 'rgba(0,0,0,0.25)'; t.lineWidth = 1; t.beginPath(); t.moveTo(X + rnd() * 32, Y + rnd() * 32); t.lineTo(X + rnd() * 32, Y + rnd() * 32); t.stroke(); }
      th.fillStyle = `hsl(214,18%,${l + 4}%)`;
    }
    th.fillRect(x, y, 1, 1);
  }
  t.strokeStyle = 'rgba(0,0,0,0.12)'; t.lineWidth = 1;
  for (let x = 0; x <= MW; x++) { t.beginPath(); t.moveTo(x * TILE + 0.5, 0); t.lineTo(x * TILE + 0.5, WH); t.stroke(); }
  for (let y = 0; y <= MH; y++) { t.beginPath(); t.moveTo(0, y * TILE + 0.5); t.lineTo(WW, y * TILE + 0.5); t.stroke(); }
}

function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }

function drawNode(c, n, t) {
  if (n.type === 'shard') {
    const k = 0.6 + 0.4 * Math.min(1, n.amount / 1500);
    c.save(); c.translate(n.x, n.y);
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 22); g.addColorStop(0, 'rgba(79,209,197,0.35)'); g.addColorStop(1, 'rgba(79,209,197,0)'); c.fillStyle = g; c.fillRect(-22, -22, 44, 44);
    for (const [ox, oy, s, r] of [[-6, 3, 9, 0.3], [5, 4, 8, -0.4], [0, -5, 11, 0.1]]) {
      c.save(); c.translate(ox, oy); c.rotate(r); c.scale(k, k);
      c.fillStyle = '#4fd1c5'; poly(c, [[0, -s], [s * 0.6, 0], [0, s * 0.8], [-s * 0.6, 0]]); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; poly(c, [[0, -s], [s * 0.6, 0], [0, -s * 0.2]]); c.fill(); c.restore();
    }
    c.restore();
  } else {
    c.save(); c.translate(n.x, n.y); const p = 0.5 + 0.5 * Math.sin(t * 2 + n.x);
    const g = c.createRadialGradient(0, 0, 4, 0, 0, 30); g.addColorStop(0, `rgba(167,139,250,${0.5 + 0.3 * p})`); g.addColorStop(1, 'rgba(167,139,250,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64);
    c.fillStyle = '#2a2140'; c.beginPath(); c.arc(0, 0, 22, 0, 7); c.fill(); c.strokeStyle = '#5b4a8a'; c.lineWidth = 3; c.stroke();
    c.fillStyle = `rgba(200,180,255,${0.5 + 0.4 * p})`; c.beginPath(); c.arc(0, 0, 8 + 4 * p, 0, 7); c.fill(); c.restore();
  }
}

function drawUnit(c, u) {
  c.save(); c.translate(u.x, u.y);
  const col = u.flash > 0 ? '#ffffff' : teamCol(u.team), col2 = teamCol2(u.team), dark = '#0d1117';
  c.lineWidth = 1.5; c.strokeStyle = dark;
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(1, 3, u.r * 0.95, u.r * 0.55, 0, 0, 7); c.fill();
  c.rotate(u.face);
  if (u.type === 'harvester') {
    c.fillStyle = col; poly(c, [[8, -4], [8, 4], [-6, 7], [-9, 0], [-6, -7]]); c.fill(); c.stroke();
    c.fillStyle = '#1b2230'; c.fillRect(-2, -3, 6, 6); c.fillStyle = col2; c.fillRect(6, -6, 4, 12);
    if (u.carry) { c.fillStyle = u.carryType === 'ether' ? '#a78bfa' : '#4fd1c5'; c.beginPath(); c.arc(-5, 0, 3.5, 0, 7); c.fill(); }
  } else if (u.type === 'trooper') {
    c.fillStyle = col; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#1b2230'; c.beginPath(); c.arc(-1, 0, 3.2, 0, 7); c.fill(); c.fillStyle = col2; c.fillRect(2, -1.5, 11, 3); c.fillStyle = dark; c.fillRect(10, -1, 4, 2);
  } else {
    c.fillStyle = col; poly(c, [[12, -7], [14, 0], [12, 7], [-8, 11], [-13, 0], [-8, -11]]); c.fill(); c.stroke();
    c.fillStyle = '#1b2230'; c.fillRect(-7, -6, 8, 12); c.fillStyle = col2; c.fillRect(2, -6, 16, 3); c.fillRect(2, 3, 16, 3);
    c.fillStyle = dark; c.fillRect(15, -6, 5, 3); c.fillRect(15, 3, 5, 3); c.fillStyle = col2; c.beginPath(); c.arc(0, 0, 4, 0, 7); c.fill();
  }
  c.restore();
}

function drawBuilding(c, b, t) {
  const X = b.tx * TILE, Y = b.ty * TILE, W = b.w * TILE, H = b.h * TILE;
  const col = b.flash > 0 ? '#ffffff' : teamCol(b.team), col2 = teamCol2(b.team);
  const base = b.team === PLAYER ? '#3a3222' : '#3a2230', base2 = b.team === PLAYER ? '#56492d' : '#57303f';
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(X + 3, Y + 4, W, H);
  c.fillStyle = base; c.fillRect(X + 2, Y + 2, W - 4, H - 4); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(X + 3, Y + 3, W - 6, H - 6);
  c.fillStyle = base2; c.fillRect(X + 7, Y + 7, W - 14, H - 14);
  const cx = X + W / 2, cy = Y + H / 2; c.save(); c.translate(cx, cy);
  if (!b.done) {
    c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 2;
    for (let k = -H; k < W; k += 10) { c.beginPath(); c.moveTo(-W / 2 + k + 6, -H / 2 + 6); c.lineTo(-W / 2 + k + H - 6, H / 2 - 6); c.stroke(); }
    c.fillStyle = 'rgba(10,14,20,0.8)'; c.fillRect(-W / 2 + 8, H / 2 - 14, W - 16, 8); c.fillStyle = col; c.fillRect(-W / 2 + 9, H / 2 - 13, (W - 18) * b.progress, 6);
    c.restore(); return;
  }
  switch (b.type) {
    case 'core': {
      c.strokeStyle = col2; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, W * 0.28, 0, 7); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, W * 0.12, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3); c.beginPath(); c.arc(0, 0, W * 0.05, 0, 7); c.fill(); c.globalAlpha = 1;
      for (let k = 0; k < 4; k++) { c.save(); c.rotate(k * Math.PI / 2); c.fillStyle = col2; c.fillRect(W * 0.34, -5, W * 0.1, 10); c.restore(); }
      break;
    }
    case 'depot': { c.fillStyle = col2; c.fillRect(-W * 0.3, -H * 0.3, W * 0.6, H * 0.18); c.fillRect(-W * 0.3, -H * 0.05, W * 0.6, H * 0.18); c.fillRect(-W * 0.3, H * 0.2, W * 0.6, H * 0.12); break; }
    case 'extractor': { c.strokeStyle = col2; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, W * 0.3, 0, 7); c.stroke(); c.fillStyle = '#a78bfa'; c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); c.beginPath(); c.arc(0, 0, W * 0.17, 0, 7); c.fill(); c.globalAlpha = 1; break; }
    case 'barracks': { c.fillStyle = '#141a24'; c.fillRect(-W * 0.15, H * 0.05, W * 0.3, H * 0.4); c.fillStyle = col2; c.fillRect(-W * 0.35, -H * 0.35, W * 0.7, H * 0.1); c.fillRect(-W * 0.35, -H * 0.2, W * 0.2, H * 0.12); c.fillRect(W * 0.15, -H * 0.2, W * 0.2, H * 0.12); break; }
    case 'forge': {
      c.fillStyle = '#141a24'; c.fillRect(-W * 0.3, -H * 0.3, W * 0.6, H * 0.6);
      c.fillStyle = col2; poly(c, [[-W * 0.2, -H * 0.15], [W * 0.2, -H * 0.15], [W * 0.1, H * 0.05], [W * 0.12, H * 0.2], [-W * 0.12, H * 0.2], [-W * 0.1, H * 0.05]]); c.fill();
      c.fillStyle = '#ffb545'; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); c.fillRect(-W * 0.06, -H * 0.1, W * 0.12, H * 0.06); c.globalAlpha = 1; break;
    }
    case 'turret': {
      c.fillStyle = '#141a24'; c.beginPath(); c.arc(0, 0, W * 0.3, 0, 7); c.fill();
      c.rotate(b.aim || 0); c.fillStyle = col2; c.fillRect(0, -4, W * 0.5, 8); c.fillStyle = '#0d1117'; c.fillRect(W * 0.4, -3, W * 0.12, 6);
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, W * 0.16, 0, 7); c.fill(); break;
    }
  }
  c.restore();
}

function hpBar(c, x, y, w, hp, max) {
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x, y, w, 5);
  const f = hp / max; c.fillStyle = f > 0.6 ? '#5ad67d' : f > 0.3 ? '#ffb545' : '#ff5a5a'; c.fillRect(x + 1, y + 1, (w - 2) * f, 3);
}

function updateFogImage() {
  const d = fogImg.data;
  for (let i = 0; i < MW * MH; i++) { d[i * 4] = 5; d[i * 4 + 1] = 7; d[i * 4 + 2] = 11; d[i * 4 + 3] = G.vis[i] ? 0 : G.explored[i] ? 135 : 255; }
  fogCtx.putImageData(fogImg, 0, 0);
}

/** sel: the client's current selection; place: pending building placement or null. */
export function render(sel, place) {
  const t = G.time; const { w: VW, h: VH, dpr: DPR } = view;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH); ctx.save(); ctx.translate(-cam.x, -cam.y);
  ctx.drawImage(terrain, cam.x, cam.y, VW, VH, cam.x, cam.y, VW, VH);
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + VW + m && y > cam.y - m && y < cam.y + VH + m;
  for (const n of map.nodes) if (inView(n.x, n.y, 40) && G.explored[idx(n.tx, n.ty)]) drawNode(ctx, n, t);
  for (const b of G.bldgs) {
    if (!inView(b.x, b.y, b.r + 20)) continue;
    if (b.team === ENEMY && !visibleEnt(b)) { let ex = false; for (let y = 0; y < b.h && !ex; y++) for (let x = 0; x < b.w; x++) if (G.explored[idx(b.tx + x, b.ty + y)]) { ex = true; break; } if (!ex) continue; }
    if (b.rally && sel.includes(b)) {
      ctx.strokeStyle = 'rgba(245,165,36,0.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.rally.x, b.rally.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ALLY; ctx.beginPath(); ctx.arc(b.rally.x, b.rally.y, 4, 0, 7); ctx.fill();
    }
    if (sel.includes(b)) { ctx.strokeStyle = b.team === PLAYER ? 'rgba(90,214,125,0.9)' : 'rgba(255,90,90,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(b.tx * TILE - 1, b.ty * TILE - 1, b.w * TILE + 2, b.h * TILE + 2); }
    drawBuilding(ctx, b, t);
    if (sel.includes(b) || b.hp < b.maxhp) hpBar(ctx, b.tx * TILE + 4, b.ty * TILE - 8, b.w * TILE - 8, b.hp, b.maxhp);
  }
  for (const u of G.units) {
    if (!inView(u.x, u.y, 30) || (u.team === ENEMY && !visibleEnt(u))) continue;
    if (sel.includes(u)) { ctx.strokeStyle = u.team === PLAYER ? 'rgba(90,214,125,0.95)' : 'rgba(255,90,90,0.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(u.x, u.y + 3, u.r + 4, (u.r + 4) * 0.6, 0, 0, 7); ctx.stroke(); }
    drawUnit(ctx, u);
    if (sel.includes(u) || u.hp < u.maxhp) hpBar(ctx, u.x - u.r - 2, u.y - u.r - 10, u.r * 2 + 4, u.hp, u.maxhp);
  }
  for (const p of G.projs) {
    if (p.team === ENEMY && !G.vis[idx(clamp((p.x / TILE) | 0, 0, MW - 1), clamp((p.y / TILE) | 0, 0, MH - 1))]) continue;
    const a = Math.atan2(p.ay - p.y, p.ax - p.x); const len = p.type === 'shell' ? 6 : 9;
    ctx.strokeStyle = p.type === 'shell' ? '#ffb545' : '#fff4c2'; ctx.lineWidth = p.type === 'shell' ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  for (const f of fx.list) {
    const k = 1 - f.t / f.life; ctx.globalAlpha = k;
    if (f.ring) { ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, 8 + 18 * (1 - k), (8 + 18 * (1 - k)) * 0.6, 0, 0, 7); ctx.stroke(); }
    else { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + k), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  updateFogImage(); ctx.imageSmoothingEnabled = true; ctx.drawImage(fogCv, 0, 0, MW, MH, 0, 0, WW, WH);
  if (place) {
    const d = BUILDINGS[place.type]; const ok = canPlace(place.type, place.tx, place.ty, PLAYER);
    ctx.fillStyle = ok ? 'rgba(90,214,125,0.3)' : 'rgba(255,90,90,0.3)'; ctx.fillRect(place.tx * TILE, place.ty * TILE, d.w * TILE, d.h * TILE);
    ctx.strokeStyle = ok ? '#5ad67d' : '#ff5a5a'; ctx.lineWidth = 2; ctx.strokeRect(place.tx * TILE + 1, place.ty * TILE + 1, d.w * TILE - 2, d.h * TILE - 2);
  }
  ctx.restore();
  if (drag.box) {
    const x = Math.min(drag.sx, drag.cx), y = Math.min(drag.sy, drag.cy), w = Math.abs(drag.cx - drag.sx), h = Math.abs(drag.cy - drag.sy);
    ctx.strokeStyle = 'rgba(90,214,125,0.9)'; ctx.fillStyle = 'rgba(90,214,125,0.08)'; ctx.lineWidth = 1; ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  renderMinimap();
}

function renderMinimap() {
  const S = mm.width / WW, c = mctx; c.imageSmoothingEnabled = false; c.clearRect(0, 0, mm.width, mm.height); c.drawImage(thumb, 0, 0, mm.width, mm.height);
  for (const n of map.nodes) if (G.explored[idx(n.tx, n.ty)]) { c.fillStyle = n.type === 'shard' ? '#4fd1c5' : '#a78bfa'; c.fillRect(n.x * S - 1.5, n.y * S - 1.5, 3, 3); }
  for (const b of G.bldgs) { if (b.team === ENEMY && !G.explored[idx(b.tx, b.ty)]) continue; c.fillStyle = teamCol(b.team); c.fillRect(b.tx * TILE * S, b.ty * TILE * S, Math.max(2, b.w * TILE * S), Math.max(2, b.h * TILE * S)); }
  for (const u of G.units) { if (u.team === ENEMY && !visibleEnt(u)) continue; c.fillStyle = u.team === PLAYER ? (u.type === 'harvester' ? ALLY2 : ALLY) : FOE; c.fillRect(u.x * S - 1, u.y * S - 1, 2.2, 2.2); }
  c.drawImage(fogCv, 0, 0, mm.width, mm.height);
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; c.strokeRect(cam.x * S + 0.5, cam.y * S + 0.5, view.w * S, view.h * S);
}
