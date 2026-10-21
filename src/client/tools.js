// Battle-awareness and selection helpers: "under attack" alerts (toast, sound, minimap ping, jump with Space or the
// ⚠ chip), idle-harvester and whole-army buttons, double-click "all of this type on screen", control-group tabs
// (tap to recall, long-press or Ctrl+click to save), and the pause menu.
import { G, PLAYER } from '../engine/index.js';
import { $, ui, setHint, updateHud, toast } from './hud.js';
import { sfx } from './audio.js';
import { centerOn, ping, cam, view } from './gl/render.js';

export const alerts = { last: null };
const ALERT_SHOWN = 10000; // ms the ⚠ chip stays after an attack

/** The sim reported an attack on something of ours. */
export function onAttacked(e) {
  alerts.last = { x: e.x, y: e.y, t: performance.now() };
  toast(e.building ? 'Your base is under attack!' : 'Your units are under attack!', true, true);
  sfx('alert'); ping(e.x, e.y);
  updateTools();
}
export function jumpToAlert() { if (alerts.last) centerOn(alerts.last.x, alerts.last.y); }

function choose(list) { ui.sel = list; ui.mode = null; ui.place = null; setHint(); updateHud(); if (list.length) sfx('select'); }
const centre = (list) => { const c = list.reduce((a, e) => ({ x: a.x + e.x / list.length, y: a.y + e.y / list.length }), { x: 0, y: 0 }); centerOn(c.x, c.y); };

let idleIndex = 0;
const idleHarvesters = () => G.units.filter(u => u.team === PLAYER && u.type === 'harvester' && u.task.t === 'idle');
const army = () => G.units.filter(u => u.team === PLAYER && u.type !== 'harvester');

/** Select the next idle harvester and look at it. */
export function selectIdle() {
  const idle = idleHarvesters(); if (!idle.length) { toast('No idle Harvesters'); return; }
  const u = idle[idleIndex++ % idle.length]; choose([u]); centerOn(u.x, u.y);
}
/** Select every combat unit. */
export function selectArmy() { const a = army(); if (!a.length) { toast('No army yet'); return; } choose(a); }
/** Select all of our units of the same type that are on screen (double-click / double-tap). */
export function selectSameType(u) {
  const x1 = cam.x + view.w / cam.zoom, y1 = cam.y + view.h / cam.zoom;
  choose(G.units.filter(o => o.team === PLAYER && o.type === u.type && o.x >= cam.x && o.x <= x1 && o.y >= cam.y && o.y <= y1));
}

// ---- control groups ----
export function saveGroup(k) {
  const sel = ui.sel.filter(e => e.team === PLAYER && !e.dead);
  if (!sel.length) { toast('Select something first, then save it to a group'); return; }
  ui.groups[k] = sel.slice(); toast('Group ' + k + ' saved'); updateTools();
}
export function recallGroup(k, forceCentre = false) {
  const g = (ui.groups[k] || []).filter(e => !e.dead);
  if (!g.length) return false;
  const again = ui.lastGroup === k && performance.now() - ui.lastGroupT < 400;
  choose(g.slice());
  if (forceCentre || again) centre(g);
  ui.lastGroup = k; ui.lastGroupT = performance.now();
  return true;
}

const touch = matchMedia('(pointer: coarse)').matches;
let groupsKey = '';
/** Refresh button counts, the alert chip and the group tabs (called with the HUD). */
export function updateTools() {
  const idle = idleHarvesters().length, a = army().length;
  $('btnIdle').querySelector('b').textContent = idle; $('btnIdle').classList.toggle('warn', idle > 0);
  $('btnArmy').querySelector('b').textContent = a;
  $('btnAlert').hidden = !(alerts.last && performance.now() - alerts.last.t < ALERT_SHOWN);
  const tabs = [];
  for (let k = 1; k <= 9; k++) { const n = (ui.groups[k] || []).filter(e => !e.dead).length; if (n || (touch && k <= 4)) tabs.push([k, n]); }
  const key = JSON.stringify(tabs);
  if (key === groupsKey) return; groupsKey = key;
  const box = $('groups'); box.innerHTML = '';
  for (const [k, n] of tabs) {
    const b = document.createElement('button'); b.className = 'tb grp' + (n ? '' : ' empty'); b.dataset.k = k;
    b.innerHTML = `<span>${k}</span>${n ? `<b>${n}</b>` : ''}`; b.title = n ? `Group ${k}: tap to select, long-press to replace` : `Long-press to save the selection as group ${k}`;
    let timer = 0, held = false;
    b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); held = false; timer = setTimeout(() => { held = true; saveGroup(k); }, 500); });
    const cancel = () => clearTimeout(timer);
    b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
    b.addEventListener('click', (ev) => { if (held) return; if (ev.ctrlKey || ev.metaKey) saveGroup(k); else if (!recallGroup(k)) toast('Long-press (or Ctrl+click) to save the selection here'); });
    box.appendChild(b);
  }
}

export function initTools() {
  for (const [id, fn] of [['btnIdle', selectIdle], ['btnArmy', selectArmy], ['btnAlert', jumpToAlert]]) {
    $(id).addEventListener('pointerdown', ev => ev.stopPropagation());
    $(id).addEventListener('click', fn);
  }
  updateTools();
}

// ---- pause ----
export const paused = () => !$('pause').hidden;
export function initPause({ onRestart, onQuit, onResume }) {
  $('btnResume').addEventListener('click', () => { $('pause').hidden = true; onResume(); });
  $('btnRestart').addEventListener('click', () => { $('pause').hidden = true; onRestart(); });
  $('btnQuit').addEventListener('click', () => { $('pause').hidden = true; onQuit(); });
  $('btnPause').addEventListener('click', () => togglePause());
}
export function togglePause() { $('pause').hidden = !$('pause').hidden; if (!$('pause').hidden) $('btnResume').focus(); }
