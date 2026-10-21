// Mouse, touch, keyboard and minimap input. Translates gestures into selection changes and sim commands.
import { G, map, idx, TILE, WW, WH, PLAYER, ENEMY, BUILDINGS, dist, visibleEnt, moveTo, attackMove, attackEnt, startGather, startBuild, placeBuilding, formation, setRally } from '../engine/index.js';
import { ui, playerSel, toast, setHint, doCommand, cardItems, invalidateCard, updateHud } from './hud.js';
import { sfx } from './audio.js';
import { marker } from './fx.js';
import { askLeave } from './screen.js';
import { cv, mm, cam, view, clampCam, centerOn, toWorld, zoomAt, ALLY, FOE, UNIT_SCALE } from './gl/render.js';

export const drag = { down: false, box: false, sx: 0, sy: 0, cx: 0, cy: 0, shift: false, ptype: 'mouse' };
const pointers = new Map(); let pan = null; const edge = { x: 0, y: 0 }; const keys = {};
/** Set by main.js: whether input should reach the game right now. */
export const input = { enabled: () => true };

function canvasPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }

/** What is under (wx, wy): the nearest unit within reach (generous for fingers), else a building, else a node. */
function pick(wx, wy) {
  const reach = drag.ptype === 'touch' ? 16 : 6, p = { x: wx, y: wy };
  let best = null, bd = Infinity;
  for (const u of G.units) { if (u.team === ENEMY && !visibleEnt(u)) continue; const d = dist(u, p) - u.r * UNIT_SCALE; if (d <= reach && d < bd) { bd = d; best = u; } }
  if (best) return best;
  for (const b of G.bldgs) { if (wx >= b.tx * TILE && wx < (b.tx + b.w) * TILE && wy >= b.ty * TILE && wy < (b.ty + b.h) * TILE) { if (b.team === ENEMY && !G.explored[idx(b.tx, b.ty)]) continue; return b; } }
  for (const n of map.nodes) { if (G.explored[idx(n.tx, n.ty)] && dist(n, { x: wx, y: wy }) <= n.r + 6) return n; }
  return null;
}

function select(list, add) {
  if (!add) ui.sel = [];
  for (const e of list) if (!ui.sel.includes(e)) ui.sel.push(e);
  if (ui.sel.length > 1 && ui.sel.some(e => e.team === PLAYER)) ui.sel = ui.sel.filter(e => e.team === PLAYER);
  if (ui.sel.length > 1 && ui.sel.some(e => e.kind === 'unit')) ui.sel = ui.sel.filter(e => e.kind === 'unit');
  ui.mode = null; ui.place = null; setHint(); if (list.length) sfx('select');
  updateHud(); // the command card must match the selection right away, not on the next HUD tick
}

function boxSelect(x0, y0, x1, y1, add) {
  const a = toWorld(Math.min(x0, x1), Math.min(y0, y1)), b = toWorld(Math.max(x0, x1), Math.max(y0, y1));
  const us = G.units.filter(u => { const r = u.r * UNIT_SCALE; return u.team === PLAYER && u.x >= a.x - r && u.x <= b.x + r && u.y >= a.y - r && u.y <= b.y + r; });
  if (us.length) { select(us, add); return; }
  const bs = G.bldgs.filter(bb => bb.team === PLAYER && bb.x >= a.x && bb.x <= b.x && bb.y >= a.y && bb.y <= b.y);
  if (bs.length) select([bs[0]], false); else if (!add) { ui.sel = []; ui.mode = null; }
}

/** The vent under one of our finished extractors: clicking the extractor means "mine ether here". */
const ventOf = (e) => e && e.kind === 'bldg' && e.team === PLAYER && e.type === 'extractor' && e.done ? e.vent : null;

/** Top-left tile for placing `type` with the cursor at (wx, wy); extractors snap onto a nearby free vent. */
function placeTile(type, wx, wy) {
  const d = BUILDINGS[type];
  if (d.onVent) {
    let best = null, bd = 72;
    for (const n of map.nodes) if (n.type === 'ether' && !n.extractor) { const dd = dist(n, { x: wx, y: wy }); if (dd < bd) { bd = dd; best = n; } }
    if (best) return { tx: best.tx, ty: best.ty };
  }
  return { tx: Math.round(wx / TILE - d.w / 2), ty: Math.round(wy / TILE - d.h / 2) };
}

/** Right-click / tap-on-ground semantics: context-sensitive order for the selection. */
function commandAt(wx, wy) {
  const sel = playerSel(); if (!sel.length) return;
  const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const hit = pick(wx, wy), vent = ventOf(hit);
  if (bl.length && !units.length) { for (const b of bl) if (b.d.trains) setRally(b, wx, wy, hit && hit.kind === 'node' ? hit : null); marker(wx, wy, ALLY); sfx('move'); ui.mode = null; setHint(); return; }
  if (hit && hit.kind !== 'node' && hit.team === ENEMY) { for (const u of units) attackEnt(u, hit); marker(hit.x, hit.y, FOE); sfx('attack'); }
  else if ((hit && hit.kind === 'node') || vent) { const node = vent || hit; for (const u of units) if (u.type === 'harvester') startGather(u, node); else moveTo(u, wx, wy); marker(wx, wy, vent ? '#a78bfa' : '#4fd1c5'); sfx('move'); }
  else if (hit && hit.kind === 'bldg' && hit.team === PLAYER && !hit.done && units.some(u => u.type === 'harvester')) { for (const u of units) if (u.type === 'harvester') startBuild(u, hit); marker(wx, wy, ALLY); sfx('move'); }
  else { formation(units, wx, wy); marker(wx, wy, '#5ad67d'); sfx('move'); }
  ui.mode = null; setHint();
}

function leftAction(wx, wy, add) {
  if (G.over) return;
  const sel = playerSel(), units = sel.filter(x => x.kind === 'unit');
  if (ui.place) {
    const p = ui.place;
    const builder = units.filter(u => u.type === 'harvester').sort((a, b) => dist(a, { x: p.tx * TILE, y: p.ty * TILE }) - dist(b, { x: p.tx * TILE, y: p.ty * TILE }))[0];
    const err = placeBuilding(PLAYER, p.type, p.tx, p.ty, builder);
    if (err) toast(err, true); else { sfx('build'); if (!add) { ui.place = null; ui.mode = null; setHint(); } }
    return;
  }
  if (ui.mode === 'attack') {
    const hit = pick(wx, wy);
    if (hit && hit.kind !== 'node' && hit.team === ENEMY) { for (const u of units) attackEnt(u, hit); marker(hit.x, hit.y, FOE); } else { for (const u of units) attackMove(u, wx, wy); marker(wx, wy, FOE); }
    sfx('attack'); ui.mode = null; setHint(); return;
  }
  if (ui.mode === 'move' || ui.mode === 'gather' || ui.mode === 'rally') { commandAt(wx, wy); return; }
  const hit = pick(wx, wy);
  if (hit && hit.kind !== 'node') select([hit], add); else if (!add) { ui.sel = []; ui.mode = null; updateHud(); }
}

/** Single-finger tap: select own things, otherwise command the current selection. */
function touchTap(wx, wy) {
  if (G.over) return;
  if (ui.place || ui.mode) { leftAction(wx, wy, false); return; }
  const sel = playerSel(), units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const hit = pick(wx, wy);
  if (hit && hit.kind !== 'node' && hit.team === PLAYER) {
    if (bl.length && !units.length && hit.kind === 'bldg' && !hit.done) { select([hit]); return; }
    if (units.some(u => u.type === 'harvester') && hit.kind === 'bldg' && (!hit.done || ventOf(hit))) { commandAt(wx, wy); return; }
    select([hit]); return;
  }
  if (units.length || bl.length) { commandAt(wx, wy); return; }
  if (hit && hit.kind !== 'node') select([hit]); else { ui.sel = []; updateHud(); }
}

export function bindInput() {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', ev => {
    if (!input.enabled()) return;
    cv.setPointerCapture(ev.pointerId); const p = canvasPos(ev); pointers.set(ev.pointerId, p); drag.ptype = ev.pointerType;
    if (ev.pointerType === 'touch') { if (pointers.size === 2) { drag.down = false; drag.box = false; const [a, b] = [...pointers.values()]; pan = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; return; } if (pointers.size > 2) return; }
    if (ev.button === 2) { const w = toWorld(p.x, p.y); if (ui.place || ui.mode) { ui.place = null; ui.mode = null; setHint(); return; } commandAt(w.x, w.y); return; }
    if (ev.button !== 0) return;
    drag.down = true; drag.box = false; drag.sx = drag.cx = p.x; drag.sy = drag.cy = p.y; drag.shift = ev.shiftKey;
  });
  cv.addEventListener('pointermove', ev => {
    const p = canvasPos(ev); if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, p);
    if (pan && pointers.size >= 2) {
      // Two fingers: pan with the midpoint, pinch to zoom around it.
      const [a, b] = [...pointers.values()]; const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
      cam.x -= (c.x - pan.x) / cam.zoom; cam.y -= (c.y - pan.y) / cam.zoom; clampCam();
      if (pan.d > 20 && c.d > 20) zoomAt(c.d / pan.d, c.x, c.y);
      pan = c; return;
    }
    if (ui.place) { const w = toWorld(p.x, p.y); Object.assign(ui.place, placeTile(ui.place.type, w.x, w.y)); }
    if (drag.down) { drag.cx = p.x; drag.cy = p.y; if (!drag.box && Math.hypot(p.x - drag.sx, p.y - drag.sy) > (ev.pointerType === 'touch' ? 10 : 5)) drag.box = !ui.place && !ui.mode; }
    if (ev.pointerType === 'mouse') { const m = 14; edge.x = p.x < m ? -1 : p.x > view.w - m ? 1 : 0; edge.y = p.y < m ? -1 : p.y > view.h - m ? 1 : 0; }
  });
  const endPointer = ev => {
    const p = canvasPos(ev); pointers.delete(ev.pointerId); if (pointers.size < 2) pan = null;
    if (!drag.down) return; drag.down = false;
    if (!input.enabled()) { drag.box = false; return; }
    if (drag.box) { drag.box = false; boxSelect(drag.sx, drag.sy, p.x, p.y, drag.shift); return; }
    const w = toWorld(p.x, p.y);
    if (ui.place) Object.assign(ui.place, placeTile(ui.place.type, w.x, w.y));
    if (ev.pointerType === 'touch') touchTap(w.x, w.y); else leftAction(w.x, w.y, ev.shiftKey);
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', ev => { pointers.delete(ev.pointerId); pan = null; drag.down = false; drag.box = false; });
  cv.addEventListener('pointerleave', () => { edge.x = 0; edge.y = 0; });
  // Wheel pans; Ctrl+wheel (and trackpad pinch, which arrives as Ctrl+wheel) zooms around the cursor.
  cv.addEventListener('wheel', ev => {
    ev.preventDefault();
    if (ev.ctrlKey) { const p = canvasPos(ev), d = Math.max(-25, Math.min(25, ev.deltaMode ? ev.deltaY * 25 : ev.deltaY)); zoomAt(Math.exp(-d * 0.01), p.x, p.y); return; }
    cam.x += ev.deltaX / cam.zoom; cam.y += ev.deltaY / cam.zoom; clampCam();
  }, { passive: false });

  // Minimap: left drag scrolls, right click (or armed move/attack) orders.
  let mmDown = false;
  const mmAt = (ev, cmd) => {
    const r = mm.getBoundingClientRect(); const wx = (ev.clientX - r.left) / r.width * WW, wy = (ev.clientY - r.top) / r.height * WH;
    if (cmd) { const units = playerSel().filter(x => x.kind === 'unit'); if (units.length) { if (ui.mode === 'attack') units.forEach(u => attackMove(u, wx, wy)); else formation(units, wx, wy); marker(wx, wy, '#5ad67d'); sfx('move'); ui.mode = null; setHint(); } return; }
    centerOn(wx, wy);
  };
  mm.addEventListener('contextmenu', e => e.preventDefault());
  mm.addEventListener('pointerdown', ev => { if (!input.enabled()) return; mm.setPointerCapture(ev.pointerId); if (ev.button === 2 || ui.mode === 'attack' || ui.mode === 'move') { mmAt(ev, true); return; } mmDown = true; mmAt(ev, false); });
  mm.addEventListener('pointermove', ev => { if (mmDown) mmAt(ev, false); });
  mm.addEventListener('pointerup', () => mmDown = false); mm.addEventListener('pointercancel', () => mmDown = false);

  window.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'INPUT') return;
    const k = ev.key; keys[k.toLowerCase()] = true;
    if (!input.enabled()) return;
    if (/^[1-9]$/.test(k)) {
      if (ev.ctrlKey || ev.metaKey) { ui.groups[k] = playerSel().slice(); toast('Group ' + k + ' set'); ev.preventDefault(); }
      else {
        const g = (ui.groups[k] || []).filter(e => !e.dead);
        if (g.length) {
          ui.sel = g.slice();
          if (ev.shiftKey || (ui.lastGroup === k && performance.now() - ui.lastGroupT < 400)) { const c = g.reduce((a, e) => ({ x: a.x + e.x / g.length, y: a.y + e.y / g.length }), { x: 0, y: 0 }); centerOn(c.x, c.y); }
          ui.lastGroup = k; ui.lastGroupT = performance.now(); ui.mode = null; ui.place = null; setHint(); updateHud();
        }
      }
      return;
    }
    if (k === 'Escape') { doCommand('esc'); return; }
    if (k === 'Backspace') { askLeave(); ev.preventDefault(); return; }
    if (k === 'Home') { const c = G.bldgs.find(b => b.team === PLAYER && b.type === 'core'); if (c) centerOn(c.x, c.y); ev.preventDefault(); return; }
    const items = cardItems(); const it = items.find(i => i.key.toLowerCase() === k.toLowerCase() && i.key !== 'Esc');
    if (it && !it.dis && !ev.ctrlKey && !ev.metaKey) { doCommand(it.id); invalidateCard(); ev.preventDefault(); }
  });
  window.addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false; });
}

/** Arrow keys / WASD (when nothing is selected) and mouse edge scrolling. */
export function camKeys(dt) {
  let dx = 0, dy = 0; const free = !ui.sel.length;
  if (keys.arrowleft || (keys.a && free)) dx -= 1; if (keys.arrowright || (keys.d && free)) dx += 1;
  if (keys.arrowup || keys.w) dy -= 1; if (keys.arrowdown || (keys.s && free)) dy += 1;
  if (drag.ptype === 'mouse' && !drag.down) { dx += edge.x; dy += edge.y; }
  if (dx || dy) { cam.x += dx * 620 * dt / cam.zoom; cam.y += dy * 620 * dt / cam.zoom; clampCam(); }
}
