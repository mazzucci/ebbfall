// Battle-awareness and selection helpers: "under attack" alerts (toast, sound, minimap ping, jump with Space or the
// ⚠ chip), the idle-harvester and whole-army chips in the top bar, double-click "all of this type on screen", control-group tabs
// (tap to recall, long-press or Ctrl+click to save), and the pause menu.
import { G, UNITS, BUILDINGS, TILE, visibleEnt } from '../engine/index.js';
import { updateHud, myFaction } from './hud.js';
import { $, ui, toast, setSelection } from './ui.js';
import { sfx } from './audio.js';
import { centerOn, ping, clearPings, cam, view } from './gl/render.js';
import { portrait, setIconButton } from './icons.js';

export const alerts = { last: null, list: [], at: 0 };
const ALERT_SHOWN = 10000; // ms the ⚠ chip stays after an attack
const ALERT_KEPT = 60000; // ms an attacked spot stays in the Space / chip cycle

/** The sim reported an attack on something of ours. */
export function onAttacked(e) {
  alerts.last = { x: e.x, y: e.y, t: performance.now() };
  // The last three places attacked (a new spot more than 8 tiles from the others), newest first: the chip cycles them.
  alerts.list = [alerts.last, ...alerts.list.filter(a => Math.hypot(a.x - e.x, a.y - e.y) > 8 * TILE)].slice(0, 3); alerts.at = 0;
  ping(e.x, e.y);
  // A fight you are looking at needs no siren; the ping and the ⚠ chip still mark it.
  const onScreen = e.x >= cam.x && e.x <= cam.x + view.w / cam.zoom && e.y >= cam.y && e.y <= cam.y + view.h / cam.zoom;
  if (!onScreen) { toast(e.building ? 'Your base is under attack!' : 'Your units are under attack!', true, true); sfx('alert'); }
  updateTools();
}
/** Look at the latest attack; again, the one before (up to three), then round again. */
export function jumpToAlert() {
  alerts.list = alerts.list.filter(a => performance.now() - a.t < ALERT_KEPT); // (old news drops out)
  if (!alerts.list.length) { toast('No recent attacks'); return; }
  const a = alerts.list[alerts.at++ % alerts.list.length]; centerOn(a.x, a.y);
}
/** Look at our headquarters (the first one, the main). */
export function goHome() {
  const c = G.bldgs.find(b => b.team === G.me && b.d.hq) || G.bldgs.find(b => b.team === G.me); // (no headquarters left: any building)
  if (c) centerOn(c.x, c.y); else toast('No base left');
}
/** Forget alerts and pings from a previous game. */
export function resetTools() { ui.box = false; $('btnBox')?.classList.remove('on'); alerts.last = null; alerts.list = []; alerts.at = 0; clearPings(); lit.clear(); capitals.clear(); idleIndex = 0; prodIndex = 0; groupsKey = ''; $('pause').hidden = true; updateTools(); }

function choose(list) { setSelection(list); updateHud(); if (list.length) sfx('select', { unit: list.find(e => e.kind === 'unit')?.type }); }
const centre = (list) => { const c = list.reduce((a, e) => ({ x: a.x + e.x / list.length, y: a.y + e.y / list.length }), { x: 0, y: 0 }); centerOn(c.x, c.y); };

let idleIndex = 0;
const idleHarvesters = () => G.units.filter(u => u.team === G.me && u.d.worker && u.task.t === 'idle');
const army = () => G.units.filter(u => u.team === G.me && !u.d.worker);
/** Our finished factories (they train more than workers) with nothing queued, and the power to train. */
const idleFactories = () => G.bldgs.filter(b => b.team === G.me && b.done && !b.queue.length && (b.d.trains || []).some(t => !UNITS[t].worker) && !(b.d.needsPower && !b.powered));
let prodIndex = 0;
/** Select the next idle factory and look at it. */
export function selectIdleFactory() {
  const idle = idleFactories(); if (!idle.length) { toast('No idle factory'); return; }
  const b = idle[prodIndex++ % idle.length]; choose([b]); centerOn(b.x, b.y);
}

/** Select the next idle harvester and look at it. */
export function selectIdle() {
  const idle = idleHarvesters(); if (!idle.length) { toast(`No idle ${UNITS[myFaction().worker].name}s`); return; }
  const u = idle[idleIndex++ % idle.length]; choose([u]); centerOn(u.x, u.y);
}
/** Select every combat unit; a second tap within a second also looks at them. */
let armyAt = 0;
export function selectArmy() {
  const a = army(); if (!a.length) { toast('No army'); return; }
  const again = performance.now() - armyAt < 1000; armyAt = performance.now();
  choose(a); if (again) centre(a);
}
/** Select all of our units of the same type that are on screen (double-click / double-tap); on a finished building,
 *  all our finished buildings of its type on screen (several factories train as one: the card fills the shortest queue). */
export function selectSameType(e, add = false) {
  const x1 = cam.x + view.w / cam.zoom, y1 = cam.y + view.h / cam.zoom;
  const onScreen = (o) => o.x >= cam.x && o.x <= x1 && o.y >= cam.y && o.y <= y1;
  const shows = (b) => b.tx * TILE < x1 && (b.tx + b.w) * TILE > cam.x && b.ty * TILE < y1 && (b.ty + b.h) * TILE > cam.y; // (any part of it)
  if (e.kind === 'bldg') { choose(e.done ? G.bldgs.filter(o => o.team === G.me && o.type === e.type && o.done && shows(o)) : [e]); return; }
  const same = G.units.filter(o => o.team === G.me && o.type === e.type && onScreen(o));
  choose(add ? [...new Set([...ui.sel.filter(x => !x.dead && x.kind === 'unit'), ...same])] : same);
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

/** Capital units announced this game, by "<team>:<kind>": the first of each kind gets a word (and the enemy's a siren). */
const capitals = new Set();
function watchCapitals() {
  for (const u of G.units) {
    if (!u.d.capital || (u.team !== G.me && !visibleEnt(u))) continue;
    const key = u.team + ':' + u.type; if (capitals.has(key)) continue;
    capitals.add(key);
    if (u.team === G.me) toast(`${u.d.name} ready`);
    else { toast(`Enemy ${u.d.name} sighted!`, true, true); sfx('alert'); ping(u.x, u.y); }
  }
}

/** Refresh button counts, the alert chip and the group tabs (called with the HUD). */
export function updateTools() {
  watchPower(); watchCapitals();
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
  const pk = myFaction().buildBasic.find(k => (BUILDINGS[k].trains || []).some(t => !UNITS[t].worker)), ppic = $('btnProd').querySelector('.pic'); // the race's main factory
  if (pk && ppic.dataset.k !== pk) { ppic.dataset.k = pk; ppic.innerHTML = portrait('bldg', pk, 24); }
  const factories = G.bldgs.some(b => b.team === G.me && b.done && (b.d.trains || []).some(t => !UNITS[t].worker)), idleF = idleFactories().length;
  $('btnProd').hidden = !factories; $('btnProd').querySelector('b').textContent = idleF; $('btnProd').classList.toggle('zero', !idleF);
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
  setIconButton($('btnHome'), 'home', 'HOME');
  for (const [id, fn] of [['btnIdle', selectIdle], ['btnArmy', selectArmy], ['btnProd', selectIdleFactory], ['btnAlert', jumpToAlert], ['btnHome', goHome]]) {
    $(id).addEventListener('pointerdown', ev => ev.stopPropagation());
    $(id).addEventListener('click', fn);
  }
  updateTools();
}

// ---- pause ----
export const paused = () => !$('pause').hidden;
/** Puts CONCEDE back from its "tap again" question (whenever the pause card closes). */
let disarmConcede = () => {};
export function initPause({ onRestart, onQuit, onResume, onConcede }) {
  // Concede asks once: the first tap turns the button into a question for a few seconds, the second gives up.
  const cb = $('btnConcede'); let armed = 0;
  disarmConcede = () => { clearTimeout(armed); armed = 0; cb.textContent = 'CONCEDE'; cb.classList.remove('warn'); };
  const disarm = () => disarmConcede();
  cb.addEventListener('click', () => {
    if (!armed) { cb.textContent = 'GIVE UP? TAP AGAIN'; cb.classList.add('warn'); armed = setTimeout(disarm, 4000); return; }
    disarm(); $('pause').hidden = true; onConcede();
  });
  $('btnResume').addEventListener('click', disarm);
  $('btnResume').addEventListener('click', () => { $('pause').hidden = true; onResume(); });
  $('btnRestart').addEventListener('click', () => { disarm(); $('pause').hidden = true; onRestart(); });
  $('btnQuit').addEventListener('click', () => { disarm(); $('pause').hidden = true; onQuit(); });
  $('btnPause').addEventListener('click', () => togglePause());
}
export function togglePause() { disarmConcede(); $('pause').hidden = !$('pause').hidden; if (!$('pause').hidden) $('btnResume').focus(); }
