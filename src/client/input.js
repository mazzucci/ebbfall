// Mouse, touch, keyboard and minimap input. Translates gestures into selection changes and sim commands.
// Touch: tap selects or commands, one finger pans (a flick glides), two fingers pan and pinch-zoom, SELECT + drag
// draws a box; the minimap grows under the finger and moves the view by the finger's travel.
import { G, map, idx, TILE, WW, WH, PLAYER, ENEMY, BUILDINGS, dist, visibleEnt, moveTo, attackMove, attackEnt, startGather, startBuild, repair, placeBuilding, formation, setRally, canHit } from '../engine/index.js';
import { $, ui, playerSel, toast, setHint, setBox, doCommand, cardItems, invalidateCard, updateHud } from './hud.js';
import { sfx } from './audio.js';
import { marker } from './fx.js';
import { askLeave } from './screen.js';
import { selectIdle, selectArmy, selectSameType, jumpToAlert, saveGroup, recallGroup, togglePause, paused } from './tools.js';

/** The radio voice for an order or selection: the first unit's type. */
const voice = (list) => ({ unit: list.find(e => e.kind === 'unit')?.type });

/** Double-click / double-tap on one of our units selects all of that type on screen. */
let lastPick = { id: 0, t: 0, dbl: false };
/** A box was drawn while SELECT was held down. */
let boxDone = false;
/** `at` is the input event's own timestamp, so a slow frame between the two clicks does not break the double. */
function selectOrDouble(hit, add, at = performance.now()) {
  const own = hit.kind === 'unit' && hit.team === PLAYER, again = own && lastPick.id === hit.id && at - lastPick.t < 400;
  if (again && lastPick.dbl) { lastPick.t = at; return; }            // a third quick click keeps the group
  if (again) { selectSameType(hit, add); lastPick = { id: hit.id, t: at, dbl: true }; return; }
  lastPick = { id: hit.id, t: at, dbl: false };
  select([hit], add);
}
import { cv, mm, cam, view, clampCam, centerOn, toWorld, zoomAt, flashTarget, ALLY, FOE, UNIT_SCALE, AIR_LIFT } from './gl/render.js';
/** Where a unit appears on screen (flyers are drawn above the ground point they occupy). */
const shown = (u) => (u.d.air ? { x: u.x, y: u.y - AIR_LIFT } : u);

export const drag = { down: false, box: false, pan: false, quiet: false, sx: 0, sy: 0, cx: 0, cy: 0, shift: false, ptype: 'mouse' };
/** Camera glide after a one-finger flick, in world px per second; a touch stops it. */
const fling = { vx: 0, vy: 0, samples: [], caught: false };
const FLING_MIN = 40;
/** Stop the glide (a new game, the pause menu). */
export function stopGlide() { fling.vx = fling.vy = 0; fling.samples = []; }
/** Show the SELECT button's state and the hint. */
function boxButton() { setBox(); setHint(); }
const pointers = new Map(); let pan = null; const edge = { x: 0, y: 0 }; const keys = {};
/** Set by main.js: whether input should reach the game right now. */
export const input = { enabled: () => true };

function canvasPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }

/** What is under (wx, wy): the nearest unit within reach (generous for fingers), else a building, else a node. */
function pick(wx, wy) {
  const reach = drag.ptype === 'touch' ? 16 : 6, p = { x: wx, y: wy };
  let best = null, bd = Infinity;
  for (const u of G.units) { if (u.team === ENEMY && !visibleEnt(u)) continue; const d = dist(shown(u), p) - u.r * UNIT_SCALE; if (d <= reach && d < bd) { bd = d; best = u; } }
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
  ui.mode = null; ui.place = null; setHint(); if (list.length) sfx('select', voice(list));
  updateHud(); // the command card must match the selection right away, not on the next HUD tick
}

function boxSelect(x0, y0, x1, y1, add) {
  const a = toWorld(Math.min(x0, x1), Math.min(y0, y1)), b = toWorld(Math.max(x0, x1), Math.max(y0, y1));
  const us = G.units.filter(u => { const r = u.r * UNIT_SCALE, s = shown(u); return u.team === PLAYER && s.x >= a.x - r && s.x <= b.x + r && s.y >= a.y - r && s.y <= b.y + r; });
  if (us.length) { select(us, add); return; }
  const bs = G.bldgs.filter(bb => bb.team === PLAYER && bb.x >= a.x && bb.x <= b.x && bb.y >= a.y && bb.y <= b.y);
  if (bs.length) select([bs[0]], false); else if (!add) { ui.sel = []; ui.mode = null; }
}

/** One of our finished buildings that has lost hp: harvesters sent to it repair it. */
const damaged = (e) => e && e.kind === 'bldg' && e.team === PLAYER && e.done && e.maxhp - e.hp >= 1;

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

/**
 * On touch, once harvesters have a job (gather, build, repair) let go of them: the next tap on the map is then just a
 * tap, not "walk here", and the job carries on. The target's blink confirms the order. With a mouse, right-click is
 * the order and left-click selects, so the selection stays.
 */
function releaseWorkers(units) {
  if (drag.ptype !== 'touch' || !units.length || !units.every(u => u.type === 'harvester')) return;
  ui.sel = []; ui.mode = null; ui.place = null; setHint(); updateHud();
}

/** Right-click / tap-on-ground semantics: context-sensitive order for the selection. */
function commandAt(wx, wy) {
  const sel = playerSel(); if (!sel.length) return;
  const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const hit = pick(wx, wy), vent = ventOf(hit);
  let job = false; // harvesters were given work
  if (bl.length && !units.length) { for (const b of bl) if (b.d.trains?.length) setRally(b, wx, wy, hit && hit.kind === 'node' ? hit : null); marker(wx, wy, ALLY); sfx('move', voice(units)); ui.mode = null; setHint(); return; }
  if (hit && hit.kind !== 'node' && hit.team === ENEMY) { for (const u of units) if (canHit(u, hit)) attackEnt(u, hit); else moveTo(u, hit.x, hit.y); marker(hit.x, hit.y, FOE); sfx('attack', voice(units)); }
  else if ((hit && hit.kind === 'node') || vent) {
    const node = vent || hit, bare = node.type === 'ether' && !ventOf(node.extractor); // a vent needs a finished extractor (the sim says so)
    for (const u of units) if (u.type === 'harvester') startGather(u, node); else moveTo(u, wx, wy);
    marker(wx, wy, vent ? '#a78bfa' : '#4fd1c5'); sfx('move', voice(units));
    if (!bare && units.some(u => u.type === 'harvester')) { flashTarget(vent ? hit : node, true); job = true; }
  }
  else if (hit && hit.kind === 'bldg' && hit.team === PLAYER && !hit.done && units.some(u => u.type === 'harvester')) { for (const u of units) if (u.type === 'harvester') startBuild(u, hit); marker(wx, wy, ALLY); flashTarget(hit); sfx('move', voice(units)); job = true; }
  else if (damaged(hit) && units.some(u => u.type === 'harvester')) { for (const u of units) if (u.type === 'harvester') repair(u, hit); else moveTo(u, wx, wy); marker(wx, wy, ALLY); flashTarget(hit); sfx('move', voice(units)); job = true; }
  else { formation(units, wx, wy); marker(wx, wy, '#5ad67d'); sfx('move', voice(units)); }
  ui.mode = null; setHint();
  if (job) releaseWorkers(units);
}

function leftAction(wx, wy, add, at) {
  if (G.over) return;
  const sel = playerSel(), units = sel.filter(x => x.kind === 'unit');
  if (ui.place) {
    const p = ui.place;
    const builder = units.filter(u => u.type === 'harvester').sort((a, b) => dist(a, { x: p.tx * TILE, y: p.ty * TILE }) - dist(b, { x: p.tx * TILE, y: p.ty * TILE }))[0];
    const err = placeBuilding(PLAYER, p.type, p.tx, p.ty, builder);
    if (err) toast(err, true);
    else {
      sfx('build');
      // On touch, back to the building list (another one is a tap away; a tap on the map just closes it).
      if (!add) { ui.place = null; ui.mode = drag.ptype === 'touch' ? 'build' : null; setHint(); updateHud(); }
    }
    return;
  }
  if (ui.mode === 'attack') {
    const hit = pick(wx, wy);
    if (hit && hit.kind !== 'node' && hit.team === ENEMY) { for (const u of units) if (canHit(u, hit)) attackEnt(u, hit); else attackMove(u, hit.x, hit.y); marker(hit.x, hit.y, FOE); } else { for (const u of units) attackMove(u, wx, wy); marker(wx, wy, FOE); }
    sfx('attack', voice(units)); ui.mode = null; setHint(); return;
  }
  if (ui.mode === 'repair') {
    const hit = pick(wx, wy);
    if (damaged(hit)) { for (const u of units) if (u.type === 'harvester') repair(u, hit); marker(hit.x, hit.y, ALLY); flashTarget(hit); sfx('move', voice(units)); ui.mode = null; releaseWorkers(units); setHint(); return; }
    else toast(hit && hit.kind === 'bldg' && hit.team === PLAYER ? 'That building is not damaged' : 'Choose one of your damaged buildings', true);
    ui.mode = null; setHint(); return;
  }
  if (ui.mode === 'move' || ui.mode === 'gather' || ui.mode === 'rally') { commandAt(wx, wy); return; }
  const hit = pick(wx, wy);
  if (hit && hit.kind !== 'node') selectOrDouble(hit, add, at);
  else if (hit && !add) select([hit]); // a resource field: shows what is left (right-click gathers)
  else if (!add) { ui.sel = []; ui.mode = null; updateHud(); }
}

/** Single-finger tap: select own things, otherwise command the current selection. */
function touchTap(wx, wy, at) {
  if (G.over) return;
  if (ui.place || ui.mode) { leftAction(wx, wy, false); return; }
  const sel = playerSel(), units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const hit = pick(wx, wy);
  if (hit && hit.kind !== 'node' && hit.team === PLAYER) {
    if (bl.length && !units.length && hit.kind === 'bldg' && !hit.done) { select([hit]); return; }
    // (A damaged building is still selected by a tap: on touch, repairs go through the Repair button.)
    if (units.some(u => u.type === 'harvester') && hit.kind === 'bldg' && (!hit.done || ventOf(hit))) { commandAt(wx, wy); return; }
    selectOrDouble(hit, false, at); return;
  }
  if (units.length) { commandAt(wx, wy); return; }
  // A building selected and a tap elsewhere: let go of it (rally points are set with the Rally button on touch).
  if (hit) select([hit]); else { ui.sel = []; ui.mode = null; setHint(); updateHud(); }
}

export function bindInput() {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  // Any touch anywhere (the map, a button, the minimap) catches a gliding camera, like a spinning list.
  window.addEventListener('pointerdown', () => { fling.caught = !!(fling.vx || fling.vy); stopGlide(); }, true);
  cv.addEventListener('pointerdown', ev => {
    if (!input.enabled()) return;
    cv.setPointerCapture(ev.pointerId); const p = canvasPos(ev); pointers.set(ev.pointerId, p); drag.ptype = ev.pointerType;
    if (ev.pointerType === 'touch') { if (pointers.size === 2) { drag.down = false; drag.box = false; drag.pan = false; const [a, b] = [...pointers.values()]; pan = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; return; } if (pointers.size > 2) return; }
    if (ev.button === 2) { const w = toWorld(p.x, p.y); if (ui.place || ui.mode) { ui.place = null; ui.mode = null; setHint(); return; } commandAt(w.x, w.y); return; }
    if (ev.button !== 0) return;
    // A touch that stops a gliding camera does nothing else.
    drag.quiet = ev.pointerType === 'touch' && fling.caught;
    // The touch-down point is the first glide sample: a quick flick may arrive as a single (coalesced) move.
    fling.samples = [{ t: ev.timeStamp, x: p.x, y: p.y }];
    drag.down = true; drag.box = false; drag.pan = false; drag.sx = drag.cx = p.x; drag.sy = drag.cy = p.y; drag.shift = ev.shiftKey;
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
    if (drag.down) {
      const px = drag.cx, py = drag.cy; drag.cx = p.x; drag.cy = p.y;
      if (!drag.box && !drag.pan && Math.hypot(p.x - drag.sx, p.y - drag.sy) > (ev.pointerType === 'touch' ? 10 : 5)) {
        // Touch: one finger pans the map unless SELECT is armed (then it draws a box); a mouse always draws a box.
        if (ev.pointerType === 'touch' && !ui.box && !ui.place) drag.pan = true; else drag.box = !ui.place && (!ui.mode || ui.box);
      }
      if (drag.pan) {
        cam.x -= (p.x - px) / cam.zoom; cam.y -= (p.y - py) / cam.zoom; clampCam();
        fling.samples.push({ t: ev.timeStamp, x: p.x, y: p.y }); while (fling.samples.length > 2 && ev.timeStamp - fling.samples[0].t > 120) fling.samples.shift();
      }
    }
    if (ev.pointerType === 'mouse') { const m = 14; edge.x = p.x < m ? -1 : p.x > view.w - m ? 1 : 0; edge.y = p.y < m ? -1 : p.y > view.h - m ? 1 : 0; }
  });
  const endPointer = ev => {
    const p = canvasPos(ev); pointers.delete(ev.pointerId); if (pointers.size < 2) pan = null;
    if (!drag.down) return; drag.down = false;
    if (!input.enabled()) { drag.box = false; drag.pan = false; return; }
    if (drag.pan) { // let go mid-swipe: the camera glides on
      drag.pan = false;
      const a = fling.samples[0], b = fling.samples[fling.samples.length - 1], dt = b && a ? (b.t - a.t) / 1000 : 0;
      // Lifted while still moving (a pause before lifting means "stop here").
      if (dt > 0.01 && ev.timeStamp - b.t < 120) { fling.vx = -(b.x - a.x) / dt / cam.zoom; fling.vy = -(b.y - a.y) / dt / cam.zoom; }
      fling.samples = []; return;
    }
    if (drag.box) {
      drag.box = false; boxSelect(drag.sx, drag.sy, p.x, p.y, drag.shift);
      if (ui.box === 'held') boxDone = true; // a quick hold-and-box must not leave SELECT armed on release
      if (ui.box === 'once') { ui.box = false; boxButton(); }
      return;
    }
    if (drag.quiet) return;
    const w = toWorld(p.x, p.y);
    if (ui.place) Object.assign(ui.place, placeTile(ui.place.type, w.x, w.y));
    if (ev.pointerType === 'touch') touchTap(w.x, w.y, ev.timeStamp); else leftAction(w.x, w.y, ev.shiftKey, ev.timeStamp);
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', ev => { pointers.delete(ev.pointerId); pan = null; drag.down = false; drag.box = false; drag.pan = false; });
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
    if (cmd) { const units = playerSel().filter(x => x.kind === 'unit'); if (units.length) { if (ui.mode === 'attack') units.forEach(u => attackMove(u, wx, wy)); else formation(units, wx, wy); marker(wx, wy, '#5ad67d'); sfx('move', voice(units)); ui.mode = null; setHint(); } return; }
    centerOn(wx, wy);
  };
  mm.addEventListener('contextmenu', e => e.preventDefault());
  // A finger is too blunt to aim at the view box on a small minimap: on touch the minimap grows while held, a drag
  // moves the view by the finger's travel (wherever it started), and only a quick tap jumps.
  let mmTouch = null;
  const mmEnd = () => { mmDown = false; if (mmTouch) { if (!mmTouch.moved) centerOn(mmTouch.wx, mmTouch.wy); mmTouch = null; mm.classList.remove('big'); } };
  mm.addEventListener('pointerdown', ev => {
    if (!input.enabled()) return; mm.setPointerCapture(ev.pointerId);
    if (ev.button === 2 || ui.mode === 'attack' || ui.mode === 'move') { mmAt(ev, true); return; }
    if (ev.pointerType === 'touch') {
      // Layout size, not the on-screen box: the minimap may still be shrinking back from the last touch.
      const r = mm.getBoundingClientRect(), w = mm.clientWidth, h = mm.clientHeight;
      mmTouch = { sx: ev.clientX, sy: ev.clientY, x0: cam.x, y0: cam.y, moved: false, wx: (ev.clientX - r.left) / w * WW, wy: (ev.clientY - (r.bottom - h)) / h * WH };
      mm.classList.add('big'); return;
    }
    mmDown = true; mmAt(ev, false);
  });
  mm.addEventListener('pointermove', ev => {
    if (mmTouch) {
      const dx = ev.clientX - mmTouch.sx, dy = ev.clientY - mmTouch.sy;
      if (!mmTouch.moved && Math.hypot(dx, dy) > 6) mmTouch.moved = true;
      if (mmTouch.moved) { const r = mm.getBoundingClientRect(); cam.x = mmTouch.x0 + dx / r.width * WW; cam.y = mmTouch.y0 + dy / r.height * WH; clampCam(); }
      return;
    }
    if (mmDown) mmAt(ev, false);
  });
  mm.addEventListener('pointerup', mmEnd); mm.addEventListener('pointercancel', () => { if (mmTouch) mmTouch.moved = true; mmEnd(); });

  // SELECT (touch screens): hold it and drag a box with the other hand, or tap it to arm one box drag. Shown on any
  // device with a touch screen (also touch laptops), and as soon as a finger touches the map.
  const bx = $('btnBox');
  if (bx) {
    if (matchMedia('(any-pointer: coarse)').matches) bx.hidden = false;
    cv.addEventListener('pointerdown', ev => { if (ev.pointerType === 'touch') bx.hidden = false; });
    let downAt = 0, viaPointer = false;
    bx.addEventListener('pointerdown', ev => { ev.stopPropagation(); ev.preventDefault(); viaPointer = true; downAt = ev.timeStamp; boxDone = false; ui.box = ui.box ? false : 'held'; boxButton(); });
    bx.addEventListener('pointerup', ev => { if (ui.box === 'held') ui.box = !boxDone && ev.timeStamp - downAt <= 350 ? 'once' : false; boxButton(); });
    bx.addEventListener('pointercancel', () => { ui.box = false; boxButton(); });
    bx.addEventListener('click', () => { if (viaPointer) { viaPointer = false; return; } ui.box = ui.box ? false : 'once'; boxButton(); }); // keyboard
    bx.addEventListener('contextmenu', ev => ev.preventDefault());
  }

  window.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'INPUT') return;
    const k = ev.key; keys[k.toLowerCase()] = true;
    if (!$('help').hidden) { if (k === 'Escape') { $('help').hidden = true; ev.preventDefault(); } return; } // Help on top: Esc closes it
    if (paused() && (k === 'p' || k === 'P' || k === 'Escape')) { togglePause(); ev.preventDefault(); return; }
    if (!input.enabled()) return;
    if (/^[1-9]$/.test(k)) {
      if (ev.ctrlKey || ev.metaKey) { saveGroup(+k); ev.preventDefault(); } else recallGroup(+k, ev.shiftKey);
      return;
    }
    if (k === ' ') { jumpToAlert(); ev.preventDefault(); return; }
    if (k === '.') { selectIdle(); return; }
    if (k === 'p' || k === 'P') { stopGlide(); togglePause(); return; }
    if (k === 'Escape') { doCommand('esc'); return; }
    if (k === 'Backspace') { askLeave(); ev.preventDefault(); return; }
    if (k === 'Home') { const c = G.bldgs.find(b => b.team === PLAYER && b.type === 'core'); if (c) centerOn(c.x, c.y); ev.preventDefault(); return; }
    const items = cardItems(); const it = items.find(i => i.key.toLowerCase() === k.toLowerCase() && i.key !== 'Esc');
    if (it && !it.dis && !ev.ctrlKey && !ev.metaKey) { doCommand(it.id); invalidateCard(); ev.preventDefault(); return; }
    if (!it && (k === 'q' || k === 'Q')) selectArmy();
  });
  window.addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false; });
}

/** Arrow keys / WASD (when nothing is selected), mouse edge scrolling and the touch glide. */
export function camKeys(dt) {
  if (fling.vx || fling.vy) {
    cam.x += fling.vx * dt; cam.y += fling.vy * dt; clampCam();
    const k = Math.exp(-3.2 * dt); fling.vx *= k; fling.vy *= k;
    if (Math.hypot(fling.vx, fling.vy) < FLING_MIN) fling.vx = fling.vy = 0;
  }
  let dx = 0, dy = 0; const free = !playerSel().length; // a selected enemy or field leaves WASD to the camera
  if (keys.arrowleft || (keys.a && free)) dx -= 1; if (keys.arrowright || (keys.d && free)) dx += 1;
  if (keys.arrowup || (keys.w && free)) dy -= 1; if (keys.arrowdown || (keys.s && free)) dy += 1;
  if (drag.ptype === 'mouse' && !drag.down) { dx += edge.x; dy += edge.y; }
  if (dx || dy) { cam.x += dx * 620 * dt / cam.zoom; cam.y += dy * 620 * dt / cam.zoom; clampCam(); }
}
