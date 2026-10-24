// Battle-awareness and selection helpers: "under attack" alerts (toast, sound, minimap ping, jump with Space or the
// ⚠ chip), the idle-harvester and whole-army chips in the top bar, double-click "all of this type on screen", control-group tabs
// (tap to recall, long-press or Ctrl+click to save), and the pause menu.
import { G, UNITS, BUILDINGS } from '../engine/index.js';
import { $, ui, setHint, updateHud, toast, myFaction } from './hud.js';
import { sfx } from './audio.js';
import { centerOn, ping, clearPings, cam, view } from './gl/render.js';
import { portrait, setIconButton } from './icons.js';

export const alerts = { last: null };
const ALERT_SHOWN = 10000; // ms the ⚠ chip stays after an attack

/** The sim reported an attack on something of ours. */
export function onAttacked(e) {
  alerts.last = { x: e.x, y: e.y, t: performance.now() };
  ping(e.x, e.y);
  // A fight you are looking at needs no siren; the ping and the ⚠ chip still mark it.
  const onScreen = e.x >= cam.x && e.x <= cam.x + view.w / cam.zoom && e.y >= cam.y && e.y <= cam.y + view.h / cam.zoom;
  if (!onScreen) { toast(e.building ? 'Your base is under attack!' : 'Your units are under attack!', true, true); sfx('alert'); }
  updateTools();
}
export function jumpToAlert() { if (alerts.last) centerOn(alerts.last.x, alerts.last.y); else toast('No recent attacks'); }
/** Forget alerts and pings from a previous game. */
export function resetTools() { ui.box = false; $('btnBox')?.classList.remove('on'); alerts.last = null; clearPings(); lit.clear(); idleIndex = 0; groupsKey = ''; $('pause').hidden = true; updateTools(); }

function choose(list) { ui.sel = list; ui.mode = null; ui.place = null; setHint(); updateHud(); if (list.length) sfx('select', { unit: list.find(e => e.kind === 'unit')?.type }); }
const centre = (list) => { const c = list.reduce((a, e) => ({ x: a.x + e.x / list.length, y: a.y + e.y / list.length }), { x: 0, y: 0 }); centerOn(c.x, c.y); };

let idleIndex = 0;
const idleHarvesters = () => G.units.filter(u => u.team === G.me && u.d.worker && u.task.t === 'idle');
const army = () => G.units.filter(u => u.team === G.me && !u.d.worker);

/** Select the next idle harvester and look at it. */
export function selectIdle() {
  const idle = idleHarvesters(); if (!idle.length) { toast(`No idle ${UNITS[myFaction().worker].name}s`); return; }
  const u = idle[idleIndex++ % idle.length]; choose([u]); centerOn(u.x, u.y);
}
/** Select every combat unit. */
export function selectArmy() { const a = army(); if (!a.length) { toast('No army yet'); return; } choose(a); }
/** Select all of our units of the same type that are on screen (double-click / double-tap). */
export function selectSameType(u, add = false) {
  const x1 = cam.x + view.w / cam.zoom, y1 = cam.y + view.h / cam.zoom;
  const same = G.units.filter(o => o.team === G.me && o.type === u.type && o.x >= cam.x && o.x <= x1 && o.y >= cam.y && o.y <= y1);
  choose(add ? [...new Set([...ui.sel.filter(e => !e.dead && e.kind === 'unit'), ...same])] : same);
}

// ---- control groups ----
export function saveGroup(k) {
  const sel = ui.sel.filter(e => e.team === G.me && !e.dead);
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
/** The group tab being pressed (kept outside the element: tabs are rebuilt when counts change). */
const press = { k: 0, held: false, timer: 0 };
let groupsKey = '';
/** Our buildings that need power, and whether they had it: one going dark pings the minimap (the toast says which). */
const lit = new Map();
function watchPower() {
  for (const b of G.bldgs) {
    if (b.team !== G.me || !b.done || !b.d.needsPower) continue;
    if (lit.get(b.id) && !b.powered) ping(b.x, b.y);
    lit.set(b.id, b.powered);
  }
}

/** Refresh button counts, the alert chip and the group tabs (called with the HUD). */
export function updateTools() {
  watchPower();
  const idle = idleHarvesters().length, a = army().length;
  const wk = myFaction().worker, pic = $('btnIdle').querySelector('.pic'); // the player's race's worker
  if (pic.dataset.k !== wk) {
    pic.dataset.k = wk; pic.innerHTML = portrait('unit', wk, 24);
    const n = UNITS[wk].name; $('btnIdle').title = `Idle ${n}s: select the next one (.)`; $('btnIdle').setAttribute('aria-label', `Idle ${n}s`);
  }
  const ak = myFaction().buildBasic.map(k => BUILDINGS[k].trains[0]).find(Boolean) || wk, apic = $('btnArmy').querySelector('.pic'); // the race's first soldier
  if (apic.dataset.k !== ak) { apic.dataset.k = ak; apic.innerHTML = portrait('unit', ak, 24); }
  $('btnIdle').querySelector('b').textContent = idle; $('btnIdle').classList.toggle('warn', idle > 0); $('btnIdle').classList.toggle('zero', !idle);
  $('btnArmy').querySelector('b').textContent = a; $('btnArmy').classList.toggle('zero', !a);
  $('btnAlert').hidden = !(alerts.last && performance.now() - alerts.last.t < ALERT_SHOWN);
  const tabs = [];
  // Saved groups only, and none on touch screens (empty tabs there were tapped by mistake instead of the map).
  if (!touch) for (let k = 1; k <= 9; k++) { const n = (ui.groups[k] || []).filter(e => !e.dead).length; if (n) tabs.push([k, n]); }
  const key = JSON.stringify(tabs);
  if (key === groupsKey) return; groupsKey = key;
  const box = $('groups'); box.innerHTML = '';
  for (const [k, n] of tabs) {
    const b = document.createElement('button'); b.className = 'tb grp' + (n ? '' : ' empty'); b.dataset.k = k;
    b.innerHTML = `<span>${k}</span>${n ? `<b>${n}</b>` : ''}`; b.title = n ? `Group ${k}: tap to select, long-press to replace` : `Long-press to save the selection as group ${k}`;
    b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); clearTimeout(press.timer); press.k = k; press.held = false; press.timer = setTimeout(() => { press.held = true; saveGroup(k); }, 500); });
    const cancel = () => clearTimeout(press.timer);
    b.addEventListener('pointerup', cancel); b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (!press.held) { clearTimeout(press.timer); press.held = true; press.k = k; saveGroup(k); } });
    b.addEventListener('click', (ev) => {
      if (press.held && press.k === k) { press.held = false; return; } // the release after a long-press (even on a rebuilt tab)
      if (ev.ctrlKey || ev.metaKey) saveGroup(k); else if (!recallGroup(k)) toast('Long-press (or Ctrl+click) to save the selection here');
    });
    box.appendChild(b);
  }
}

export function initTools() {
  setIconButton($('btnPause'), 'pause', 'PAUSE');
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
