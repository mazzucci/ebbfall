// The command card: the buttons for what is selected (orders, the Build pages, training, research), the long-press
// details on touch, and what a button does (doCommand).
import { G, UNITS, BUILDINGS, UPGRADES, ABILITIES, castAbility, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, research, cancelResearch, dist } from '../engine/index.js';
import { $, ui, toast, playerSel, ARMED, armedButton, setBox, setHint, clearMode, setSelection } from './ui.js';
import { updateHud, myFaction, buildersOf, ROMAN } from './hud.js';
import { sfx } from './audio.js';
import { icon, portrait } from './icons.js';

let cardKey = '';
export function invalidateCard() { cardKey = ''; }

/**
 * The command card: three buttons a row (big enough for a thumb), fixed slots (slot = row * 3 + column) so a command
 * keeps its place. No Stop or Move buttons: a tap on the ground moves, Hold stops (their keys still work: `hidden`
 * items have a key but no button). Units have Deselect in the last slot; a building or field is let go with a tap on
 * the ground. An armed order's own button
 * turns into its Cancel, so the card never grows a row. The Build list has a basic and an advanced page.
 */
const COLS = 3;
/** Whether unit `u` could use ability `k` now (it has it, it is ready, it is not digging in or packing up). */
function canUse(u, k) {
  const slot = (UNITS[u.type].abilities || []).indexOf(k);
  return slot >= 0 && u.abCd[slot] <= 0 && u.swap <= 0 && !(u.warp > 0); // (a cost it cannot pay is refused by the sim, with a toast)
}
/** The selection's abilities, one button each (in table order): greyed while none of their units can use it, lit while a
 *  toggle is on for all of them. No countdowns: a button comes back when it is ready. */
function abilityItems(units) {
  return Object.keys(ABILITIES).filter(k => units.some(u => (UNITS[u.type].abilities || []).includes(k))).map(k => {
    const a = ABILITIES[k], have = units.filter(u => UNITS[u.type].abilities.includes(k));
    return { id: 'a_' + k, label: a.name, key: a.hot, icon: k, dis: !have.some(u => canUse(u, k)), active: a.toggle && have.every(u => u.mode === k), tip: a.desc };
  });
}

export function cardItems() {
  const sel = playerSel();
  if (!sel.length) return []; // a field or an enemy: nothing to command
  const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const items = [];
  const at = (slot, it) => { while (items.some(i => i.slot === slot)) slot++; it.slot = slot; items.push(it); }; // never two in a slot
  const hidden = (it) => items.push({ ...it, hidden: true, slot: -1 });
  const bldgItem = (k) => {
    const d = BUILDINGS[k];
    return { id: 'b_' + k, label: d.short || d.name.split(' ').pop(), key: d.hot, cost: d.cost, locked: !hasReq(G.me, k), por: ['bldg', k], tip: d.desc };
  };
  const back = { id: 'esc', label: 'Back', key: 'Esc', cancel: true, icon: 'back' };
  if (units.length && (ui.mode === 'build' || ui.mode === 'build2')) {
    const f = myFaction(), adv = ui.mode === 'build2', page = adv ? f.buildAdvanced : f.buildBasic;
    page.forEach((k, i) => at(i, bldgItem(k)));
    (adv ? f.buildBasic : f.buildAdvanced).forEach(k => hidden(bldgItem(k))); // B then F still builds a Foundry from the keyboard
    if (!adv) at(4, { id: 'build2', label: 'Advanced', key: 'V', icon: 'build', tip: f.buildAdvanced.map(k => BUILDINGS[k].name).join(', ') });
    at(5, adv ? { ...back, id: 'build1' } : back);
  } else if (units.length) {
    const workers = units.some(u => u.d.worker), onlyWorkers = units.every(u => u.d.worker);
    const canShoot = units.some(u => u.d.weapon); // (no Attack for an Observer or Medics)
    const orders = [...(canShoot ? [{ id: 'attack', label: 'Attack', key: 'A', icon: 'attack' }] : []), { id: 'hold', label: 'Hold', key: 'H', icon: 'hold' }];
    const work = [{ id: 'build', label: 'Build', key: 'B', icon: 'build' }, { id: 'gather', label: 'Gather', key: 'G', icon: 'gather' }, { id: 'repair', label: 'Repair', key: 'R', icon: 'repair', tip: 'Then tap a damaged building. Costs a share of its price as it heals.' }].filter(it => it.id !== 'repair' || myFaction().repairs); // the Vael regenerate shields instead
    if (onlyWorkers) { work.forEach((it, i) => at(i, it)); orders.forEach((it, i) => at(COLS + i, it)); }
    else { orders.forEach((it, i) => at(i, it)); if (workers) work.forEach((it, i) => at(COLS + i, it)); }
    abilityItems(units).forEach((it, i) => at(orders.length + i, it)); // after the orders, on their row
    // Let go of units (a tap on the ground would move them): the last slot of the card.
    at(Math.ceil((Math.max(...items.map(i => i.slot)) + 2) / COLS) * COLS - 1, { id: 'deselect', label: 'Deselect', key: 'Esc', cancel: true, icon: 'x' });
    hidden({ id: 'move', label: 'Move', key: 'M', icon: 'move' }); hidden({ id: 'stop', label: 'Stop', key: 'S', icon: 'stop' });
  } else if (bl.length === 1 || (bl.length && bl.every(o => o.done && o.type === bl[0].type))) {
    // One building, or several finished ones of a kind (a double-tap): their shared card, shown for the one with the
    // shortest queue (where a unit goes next).
    const b = bl.length === 1 ? bl[0] : leastBusy(bl);
    if (!b.done && !b.planted && !buildersOf(b).length) at(0, { id: 'resume', label: myFaction().warp ? 'Plant' : 'Resume', key: 'R', icon: 'resume', tip: `Send the nearest ${UNITS[myFaction().worker].name} to ${myFaction().warp ? 'plant it' : 'finish construction'}` });
    if (!b.done) at(2, { id: 'cancelb', label: 'Cancel', key: 'X', cancel: true, icon: 'x', tip: 'Cancel construction (75% refund)' });
    const trains = b.done ? b.d.trains || [] : [];
    trains.forEach((t, i) => {
      const d = UNITS[t], missing = d.req && !G.bldgs.some(o => o.team === G.me && o.type === d.req && o.done);
      at(i, { id: 't_' + t, label: d.name, key: d.hot, cost: d.cost, locked: !!missing, por: ['unit', t], tip: d.desc, strong: d.strong, weak: d.weak });
    });
    if (trains.length) at(trains.length, { id: 'rally', label: 'Rally', key: 'R', icon: 'rally', tip: 'Then tap where new units should go' });
    if (b.done && b.d.researches.length) {
      b.d.researches.forEach((k, i) => {
        const u = UPGRADES[k];
        const lv = G.upgrades[G.me][k] + 1, elsewhere = G.bldgs.some(o => o.team === G.me && o.research && o.research.type === k);
        if (lv > 3) return;
        at(i, { id: 'r_' + k, label: u.name + ' ' + ROMAN[lv], key: u.hot, cost: u.cost[lv - 1], dis: bl.every(o => o.research) || elsewhere, icon: k, tip: u.desc + ` ${u.time[lv - 1]} s.` }); // (any idle one of the selection takes it)
      });
      const busy = researching(bl);
      if (busy) at(2, { id: 'cancelr', label: 'Cancel', key: 'C', cancel: true, icon: busy.research.type, badge: true, tip: 'Cancel the research (full refund)' });
    }
    // A dark building (no power field) trains and researches nothing: its buttons say so.
    if (b.done && b.d.needsPower && !b.powered) for (const it of items) if (/^[tr]_/.test(it.id)) Object.assign(it, { dis: true, tip: (it.tip || '') + ` Unpowered: build a ${BUILDINGS[myFaction().power]?.name ?? 'power source'} near it.` });
    // Always in the same place on a building that trains (greyed out with nothing queued), so the card keeps its shape.
    if (trains.length) {
      const last = mostBusy(bl).queue.at(-1);
      at(5, { id: 'cancelq', label: 'Cancel', key: 'X', cancel: true, dis: !last, ...(last ? { por: ['unit', last], badge: true } : { icon: 'x' }), tip: 'Cancel the last unit in the queue (refund)' });
    }
  }
  // An armed order: its button becomes Cancel (Esc), lit, in the same place.
  const armedId = armedButton(), armedAt = items.find(i => i.id === armedId && !i.hidden);
  if (armedAt) {
    Object.assign(armedAt, { id: 'esc', label: 'Cancel', key: 'Esc', cancel: true, active: true, icon: 'back', por: null, cost: null, tip: 'Cancel the order' });
    // One live Cancel at a time (Deselect stays); the queue's keeps its slot, greyed out, so the card keeps its shape.
    for (let i = items.length - 1; i >= 0; i--) if (items[i].id === 'cancelq') items[i].dis = true; else if (items[i].id.startsWith('cancel')) items.splice(i, 1);
  }
  for (const it of items) if (it.cost && !canAfford(G.me, it.cost)) { // greyed out, but a tap says what is short
    const [sh, et] = G.res[G.me];
    it.poor = true;
    it.tip = (it.tip ? it.tip + ' ' : '') + (sh < it.cost[0] ? `Not enough shards (needs ${it.cost[0]}).` : `Not enough ether (needs ${it.cost[1]}).`);
  }
  return items.sort((p, q) => p.slot - q.slot);
}

export function buildCard() {
  const items = cardItems().filter(i => !i.hidden);
  if (press.held && !items.some(i => i.id === press.held)) hideDetail(); // the held button is gone (selection changed)
  const key = JSON.stringify(items.map(i => [i.id, i.dis, i.locked, i.active, i.label, i.slot, i.poor, i.tip, i.por]));
  if (key === cardKey) return; cardKey = key;
  const c = $('cmd'); c.innerHTML = '';
  const slots = items.length ? items[items.length - 1].slot + 1 : 0;
  for (let s = 0, k = 0; s < slots; s++) {
    const it = items[k]?.slot === s ? items[k++] : null;
    if (!it) { const gap = document.createElement('div'); gap.className = 'cb gap'; c.appendChild(gap); continue; }
    const b = document.createElement('button');
    b.className = 'cb' + (it.active ? ' active' : '') + (it.cancel ? ' cancel' : '') + (it.poor ? ' poor' : '') + (it.locked ? ' locked' : '') + (it.badge ? ' badge' : '');
    b.dataset.id = it.id; // (the guided first game points at buttons by it)
    b.disabled = !!it.dis; if (it.locked) b.setAttribute('aria-disabled', 'true'); // locked: tappable, it explains what is missing
    b.title = `${it.label} (${it.key})` + (it.tip ? ': ' + it.tip : '') + vsText(it);
    const pic = it.por ? portrait(it.por[0], it.por[1], 26) : it.icon ? icon(it.icon) : '';
    b.innerHTML = `<span class="k">${it.key}</span><span class="l">${it.label}</span>${pic}` + (it.cost ? `<span class="c"><span class="s"${it.cost[0] ? ` title="${it.cost[0]} shards"><i class="dot shard"></i>${it.cost[0]}` : '>'}</span><span class="e"${it.cost[1] ? ` title="${it.cost[1]} ether"><i class="dot ether"></i>${it.cost[1]}` : '>'}</span></span>` : '');
    b.addEventListener('pointerdown', ev => {
      ev.stopPropagation(); clearTimeout(press.timer); press.held = '';
      if (ev.pointerType === 'touch') press.timer = setTimeout(() => { press.held = it.id; showDetail(it); }, 450);
    });
    b.addEventListener('pointerleave', () => clearTimeout(press.timer)); // slid off before the details showed
    b.addEventListener('contextmenu', ev => ev.preventDefault()); // (the long-press menu of the browser)
    b.addEventListener('click', () => {
      if (press.held === it.id) { press.held = ''; return; } // a long-press shows the details; it does not press the button
      hideDetail(); doCommand(it.id); cardKey = ''; updateHud(); // immediate feedback, even on slow frames
    });
    c.appendChild(b);
  }
}

// ---- long-press on a command button (touch): what it is, what it costs, what it needs ----
const press = { timer: 0, held: '', hide: 0 };
function showDetail(it) {
  const box = $('cmdInfo'), r = $('cmd').getBoundingClientRect(); // (the card survives rebuilds; its buttons may not)
  const cost = it.cost ? `<span class="c">${it.cost[0] ? `<i class="dot shard"></i>${it.cost[0]}` : ''} ${it.cost[1] ? `<i class="dot ether"></i>${it.cost[1]}` : ''}</span>` : '';
  clearTimeout(press.hide);
  box.hidden = false; // shown first, then filled, so screen readers announce it
  box.style.right = (innerWidth - r.right) + 'px'; box.style.bottom = (innerHeight - r.top + 6) + 'px'; box.style.maxWidth = Math.max(220, r.width) + 'px';
  const vs = (label, kinds) => kinds?.length ? `<span class="vs">${label}${kinds.map(k => portrait('unit', k, 22)).join('')}<span class="sr">: ${names(kinds)}</span></span>` : '';
  box.innerHTML = `<b>${it.label}</b>${cost}<span class="d">${it.tip || ''}</span>` + (it.strong || it.weak ? `<span class="vsr">${vs('Strong against', it.strong)}${vs('Weak against', it.weak)}</span>` : '');
}
/** A fighter's counters in words, for a mouse's tooltip. */
const vsText = (it) => (it.strong?.length ? ` Strong against ${names(it.strong)}.` : '') + (it.weak?.length ? ` Weak against ${names(it.weak)}.` : '');
const names = (ks) => ks.map(k => UNITS[k].name + 's').join(' and ');
function hideDetail() { clearTimeout(press.hide); $('cmdInfo').hidden = true; }
// Wherever the finger lifts (the button may have been rebuilt under it), the panel goes a moment later.
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, () => {
  clearTimeout(press.timer);
  if (press.held) { clearTimeout(press.hide); press.hide = setTimeout(hideDetail, 1200); setTimeout(() => { press.held = ''; }, 400); } // (after the click it swallows)
}, true);

/** Of several buildings of a kind: the powered one with the shortest queue (then the most progress, then by id). */
const leastBusy = (bs) => bs.slice().sort((p, q) => (p.d.needsPower && !p.powered) - (q.d.needsPower && !q.powered) || p.queue.length - q.queue.length || q.prog - p.prog || p.id - q.id)[0];
/** The first of them researching (what a research Cancel shows and cancels). */
const researching = (bs) => bs.find(o => o.research);
/** The one with the longest queue (a Cancel takes its last unit). */
const mostBusy = (bs) => bs.slice().sort((p, q) => q.queue.length - p.queue.length || p.id - q.id)[0];

export function doCommand(id) {
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
    if (!hasReq(G.me, k)) { toast('Requires ' + BUILDINGS[BUILDINGS[k].req].name, true); return; }
    if (!canAfford(G.me, BUILDINGS[k].cost)) { toast('Not enough ' + (G.res[G.me][0] < BUILDINGS[k].cost[0] ? 'shards' : 'ether'), true); return; }
    ui.place = { type: k, tx: -99, ty: -99 }; ui.mode = 'place'; ui.box = false; setBox(); setHint(); return;
  }
  if (id.startsWith('a_')) { const err = castAbility(units, id.slice(2)); if (err) toast(err, true); return; } // (the cast event plays its sound)
  if (id.startsWith('t_')) { const b = bl.length && leastBusy(bl); if (!b) return; const err = queueUnit(b, id.slice(2)); if (err) toast(err, true); else sfx('build'); return; }
  if (id === 'resume') {
    const b = bl[0]; if (!b || b.done) return;
    const hs = G.units.filter(u => u.team === G.me && u.d.worker).sort((p, q) => (p.task.t === 'build') - (q.task.t === 'build') || dist(p, b) - dist(q, b));
    if (!hs.length) { toast(`No ${UNITS[myFaction().worker].name} to build it`, true); return; }
    startBuild(hs[0], b); sfx('move'); return;
  }
  if (id.startsWith('r_')) { const b = bl.find(o => !o.research) || bl[0]; if (!b) return; const e = research(b, id.slice(2)); if (e) toast(e, true); else sfx('build'); return; }
  if (id === 'cancelr') { const b = researching(bl); if (b) cancelResearch(b); return; }
  if (id === 'cancelb') { const b = bl[0]; if (b && !b.done) { cancelConstruction(b); ui.sel = []; sfx('select'); } return; }
  if (id === 'cancelq') { const b = bl.length && mostBusy(bl); if (b && b.queue.length) cancelQueue(b, b.queue.length - 1); }
}

