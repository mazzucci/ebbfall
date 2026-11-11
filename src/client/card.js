// The command card's buttons (what they hold: cards.js), the long-press details on touch, and what a button does
// (doCommand).
import { G, UNITS, BUILDINGS, castAbility, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, research, cancelResearch, dist } from '../engine/index.js';
import { $, ui, toast, playerSel, ARMED, setBox, setHint, clearMode, setSelection } from './ui.js';
import { updateHud } from './hud.js';
import { cardItems, myFaction, leastBusy, researching, mostBusy } from './cards.js';
import { onControls } from './controls.js';
import { sfx, say } from './audio.js';
import { icon } from './icons.js';
import { statsHtml } from './stats.js';
import { portrait } from './gl/render.js';

let cardKey = '';
export function invalidateCard() { cardKey = ''; }
export { cardItems };
// A new controls scheme (controls.js) puts other keys on the buttons: drawn again at once.
onControls(() => { cardKey = ''; buildCard(); });

export function buildCard() {
  const items = cardItems().filter(i => !i.hidden);
  if (press.held && press.held[0] !== '@' && !items.some(i => i.id === press.held)) hideDetail(); // the held button is gone (selection changed; '@': held off the card)
  const key = JSON.stringify(items.map(i => [i.id, i.dis, i.active, i.label, i.slot, i.poor, i.tip, i.por, i.key]));
  if (key === cardKey) return; cardKey = key;
  const c = $('cmd'); c.innerHTML = '';
  const slots = items.length ? items[items.length - 1].slot + 1 : 0;
  for (let s = 0, k = 0; s < slots; s++) {
    const it = items[k]?.slot === s ? items[k++] : null;
    if (!it) { const gap = document.createElement('div'); gap.className = 'cb gap'; c.appendChild(gap); continue; }
    const b = document.createElement('button');
    b.className = 'cb' + (it.active ? ' active' : '') + (it.cancel ? ' cancel' : '') + (it.poor ? ' poor' : '') + (it.badge ? ' badge' : '');
    b.dataset.id = it.id; // (the guided first game points at buttons by it)
    if (it.id === shaking.id && performance.now() < shaking.until) { b.classList.add('refused'); b.addEventListener('animationend', () => b.classList.remove('refused')); }
    b.disabled = !!it.dis;
    b.title = it.label + (it.key ? ` (${it.key})` : '') + (it.tip ? ': ' + it.tip : '');
    const pic = it.por ? portrait(it.por[0], it.por[1], 26) : it.icon ? icon(it.icon) : '';
    b.innerHTML = (it.key ? `<span class="k">${it.key}</span>` : '') + `<span class="l">${it.label}</span>${pic}` + (it.cost ? `<span class="c"><span class="s"${it.cost[0] ? ` title="${it.cost[0]} gold"><i class="dot shard"></i>${it.cost[0]}` : '>'}</span></span>` : '');
    b.addEventListener('pointerdown', ev => {
      ev.stopPropagation(); clearTimeout(press.timer); press.held = '';
      if (ev.pointerType === 'touch') press.timer = setTimeout(() => { press.held = it.id; showDetail(it); }, 450);
    });
    b.addEventListener('pointerleave', () => clearTimeout(press.timer)); // slid off before the details showed
    b.addEventListener('contextmenu', ev => ev.preventDefault()); // (the long-press menu of the browser)
    b.addEventListener('click', ev => {
      if (press.held === it.id) { press.held = ''; return; } // a long-press shows the details; it does not press the button
      hideDetail(); doCommand(it.id, ev.shiftKey ? 5 : 1); cardKey = ''; updateHud(); // immediate feedback, even on slow frames
    });
    c.appendChild(b);
  }
}

// ---- long-press on a command button (touch): what it is, what it costs, its stats (stats.js), what it needs ----
const press = { timer: 0, held: '', hide: 0 };
function showDetail(it, anchor = $('cmd')) {
  // (over the card, right-aligned; or over another anchor, left-aligned: the selection console's portrait)
  const box = $('cmdInfo'), r = anchor.getBoundingClientRect(), left = anchor !== $('cmd'); // (the card survives rebuilds; its buttons may not)
  const cost = it.cost ? `<span class="c">${it.cost[0] ? `<i class="dot shard"></i>${it.cost[0]}` : ''}</span>` : '';
  clearTimeout(press.hide);
  box.hidden = false; // shown first, then filled, so screen readers announce it
  if (left) { box.style.left = r.left + 'px'; box.style.right = ''; } else { box.style.right = (innerWidth - r.right) + 'px'; box.style.left = ''; }
  box.style.bottom = (innerHeight - r.top + 6) + 'px';
  const kind = /^[tb]_/.test(it.id) ? it.id.slice(2) : ''; // (a unit to train or a building to place: its stats)
  box.innerHTML = `<b>${it.label}</b>${cost}${kind ? statsHtml(kind) : ''}<span class="d">${it.tip || ''}</span>`;
  // Wide enough for the stat rows on one line each; wider still, up to the screen's width, while it is too tall for
  // the room above the card (a short landscape phone and a long description).
  const room = Math.max(220, left ? innerWidth - r.left - 8 : r.right - 8);
  for (const w of [300, 380, 480, room]) { box.style.maxWidth = Math.min(Math.max(w, r.width), room) + 'px'; if (box.getBoundingClientRect().top >= 4) break; }
  const top = box.getBoundingClientRect().top; // still too tall (the smallest phones): lowered over the card's top edge
  if (top < 4) box.style.bottom = (innerHeight - r.top + 6 - (4 - top)) + 'px';
}
/** A long press (touch) on `el` shows `item()`'s details over `anchor`, as on a command button; a mouse has its title.
 *  (`item().id` starts with '@': it is not a button, so the card's rebuilds leave its panel be.) */
export function holdForDetail(el, item, anchor) {
  el.addEventListener('pointerdown', ev => {
    clearTimeout(press.timer); press.held = '';
    if (ev.pointerType === 'touch') press.timer = setTimeout(() => { const it = item(); if (it) { press.held = it.id; showDetail(it, anchor); } }, 450);
  });
  el.addEventListener('pointerleave', () => clearTimeout(press.timer));
  el.addEventListener('contextmenu', ev => ev.preventDefault());
}
function hideDetail() { clearTimeout(press.hide); $('cmdInfo').hidden = true; }
// Wherever the finger lifts (the button may have been rebuilt under it), the panel goes a moment later.
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, () => {
  clearTimeout(press.timer);
  if (press.held) { clearTimeout(press.hide); press.hide = setTimeout(hideDetail, 1200); setTimeout(() => { press.held = ''; }, 400); } // (after the click it swallows)
}, true);

/** A refused button press. Short of salt, or an ability that is already on or not ready: the button
 *  itself shakes (its cost flashes) with the error sound, no toast over the game (the long-press detail says what is
 *  short; a lit ability button says it is on). Anything else (supply blocked, "Requires …": a decision to make) is
 *  a toast; so is a refusal for a button not on the card (a hotkey). The shake rides through card rebuilds
 *  (`shaking`): the rebuilt button carries it. */
let shaking = { id: '', until: 0 };
function refuse(id, err) {
  if (!/^Not enough| is already on$| is not ready$/.test(err) || !document.querySelector(`#cmd [data-id="${id}"]`)) { toast(err, true); return; }
  sfx('error');
  if (/^Not enough gold/.test(err)) say('gold'); // (the announcer says what is short)
  shaking = { id, until: performance.now() + 400 };
  cardKey = ''; buildCard(); // (now, whichever path pressed it: a fresh button starts the shake from the top)
}

export function doCommand(id, times = 1) {
  const sel = playerSel(); const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg');
  if (id === 'deselect') { setSelection([]); ui.box = false; setBox(); updateHud(); return; }
  if (id === 'esc' && ui.mode === 'build2') { ui.mode = 'build'; return; } // Esc on the advanced page: back to the basic one
  if (id === 'esc') { if (ui.box) ui.box = false; else if (ui.mode || ui.place) clearMode(); else { ui.sel = []; updateHud(); } setBox(); setHint(); return; }
  if (id === 'stop') { units.forEach(stopUnit); clearMode(); return; }
  if (id === 'hold') { units.forEach(holdUnit); clearMode(); return; }
  if (ARMED[id]) { ui.mode = id; ui.place = null; setHint(); return; } // armed: the next tap on the map gives the order
  if (id === 'build' || id === 'build1') { ui.mode = 'build'; return; }
  if (id === 'build2') { ui.mode = 'build2'; return; }
  if (id.startsWith('b_')) {
    const k = id.slice(2);
    if (!hasReq(G.me, k)) { const r = BUILDINGS[k].req; toast('Requires ' + (r ? BUILDINGS[r].name : 'the satellite'), true); return; }
    if (BUILDINGS[k].perHq) { // (one a finished Castle, sites counted: as the sim's `hq_room`, so no ghost for a placement it refuses)
      const mine = G.bldgs.filter(b => b.team === G.me), hqs = mine.filter(b => b.d.hq && b.done).length;
      if (mine.filter(b => b.type === k).length >= hqs) { refuse(id, `One ${BUILDINGS[k].name} per ${mine.find(b => b.d.hq)?.d.name ?? 'headquarters'}`); return; }
    }
    if (!canAfford(G.me, BUILDINGS[k].cost)) { refuse(id, 'Not enough gold'); return; }
    ui.place = { type: k, tx: -99, ty: -99 }; ui.mode = 'place'; ui.box = false; setBox(); setHint(); return; // (no ghost until the pointer is over the map)
  }
  if (id.startsWith('a_')) { const k = id.slice(2), err = castAbility(units, k); if (err) refuse(id, err); return; } // (the cast event plays its sound; a toggle: the units its button names)
  if (id.startsWith('t_')) { // (`times`: Shift queues five, spread over the selected factories as it goes)
    let queued = 0;
    for (let i = 0; i < times; i++) {
      const b = bl.length && leastBusy(bl); if (!b) break;
      const err = queueUnit(b, id.slice(2)); if (err) { if (!queued || !/full$/.test(err)) refuse(id, err); break; } // (silent only at the queue's cap)
      queued++;
    }
    if (queued) sfx('build');
    return;
  }
  if (id === 'resume') {
    const b = bl[0]; if (!b || b.done) return;
    const hs = G.units.filter(u => u.team === G.me && u.d.worker).sort((p, q) => (p.task.t === 'build') - (q.task.t === 'build') || dist(p, b) - dist(q, b));
    if (!hs.length) { toast(`No ${UNITS[myFaction().worker].name} to build it`, true); return; }
    startBuild(hs[0], b); sfx('move'); return;
  }
  if (id.startsWith('r_')) { const b = bl.find(o => !o.research) || bl[0]; if (!b) return; const e = research(b, id.slice(2)); if (e) refuse(id, e); else sfx('build'); return; }
  if (id === 'cancelr') { const b = researching(bl); if (b) cancelResearch(b); return; }
  if (id === 'cancelb') { const b = bl[0]; if (b && !b.done) { cancelConstruction(b); ui.sel = []; sfx('select'); } return; }
  if (id === 'cancelq') { const b = bl.length && mostBusy(bl); if (b && b.queue.length) cancelQueue(b, b.queue.length - 1); }
}

