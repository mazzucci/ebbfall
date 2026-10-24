// Top bar, selection panel and command card. Also owns the client-side selection and command mode.
import { G, PLAYER, UNITS, BUILDINGS, BUILD_ORDER, UPGRADES, UP_DMG, fmt, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, research, cancelResearch, dist } from '../engine/index.js';
/** Harvesters repairing building `b`. */
const repairersOf = (b) => G.units.filter(u => u.task.t === 'repair' && u.task.b === b);
import { sfx } from './audio.js';
import { icon, portrait } from './icons.js';

export const $ = (id) => document.getElementById(id);

/** Client-only UI state: what the local player has selected and which command is armed. */
export const ui = { sel: [], mode: null, place: null, groups: {}, lastGroup: null, lastGroupT: 0, box: false }; // box: SELECT armed ('held' / 'once')

/** Show a message; `bad` styles it red (and plays the error sound unless `silent`). */
export function toast(msg, bad, silent) {
  const m = $('msg'); const d = document.createElement('div');
  d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = msg; m.appendChild(d);
  while (m.children.length > 4) m.removeChild(m.firstChild);
  setTimeout(() => d.remove(), 3300);
  if (bad && !silent) sfx('error');
}

export const playerSel = () => ui.sel.filter(e => e.team === PLAYER && !e.dead);

/** Harvesters currently working on building b. */
export const buildersOf = (b) => G.units.filter(u => u.task.t === 'build' && u.task.b === b);

export const ROMAN = ['', 'I', 'II', 'III'];

/** One line describing a building's state: construction (and whether it is paused) or what it is training. */
export function bldgStatus(b) {
  if (!b.done) return 'Constructing ' + Math.round(b.progress * 100) + '%' + (buildersOf(b).length ? '' : ' (paused: no builder)');
  if (b.research) { const u = UPGRADES[b.research.type], lv = G.upgrades[PLAYER][b.research.type] + 1; return 'Researching ' + u.name + ' ' + ROMAN[lv] + ' ' + Math.round(b.research.prog * 100) + '%' + (b.queue.length ? ' · training' : ''); }
  if (b.queue.length) return 'Training ' + UNITS[b.queue[0]].name + ' ' + Math.round(b.prog * 100) + '%' + (b.queue.length > 1 ? ' +' + (b.queue.length - 1) : '');
  if (b.team === PLAYER && repairersOf(b).length) return 'Repairing';
  if (b.type === 'extractor' && b.vent) return b.vent.amount > 0 ? `${b.vent.amount} ether left` : 'Vent depleted: a trickle of ether';
  return '';
}

let cardKey = '', selKey = '';
export function invalidateCard() { cardKey = ''; }

export function updateHud() {
  const [s, e] = G.res[PLAYER], [su, sc] = G.sup[PLAYER];
  $('rShard').textContent = s; $('rEther').textContent = e; $('rSupply').textContent = su + '/' + sc;
  $('resSup').classList.toggle('low', su >= sc); $('clock').textContent = fmt(G.time);
  const up = G.upgrades[PLAYER]; $('upg').hidden = !(up.weapons || up.armor);
  $('upg').innerHTML = `<span title="Weapons">W<b>${ROMAN[up.weapons] || '0'}</b></span><span title="Armor">A<b>${ROMAN[up.armor] || '0'}</b></span>`;
  ui.sel = ui.sel.filter(x => !x.dead);
  const sel = ui.sel, name = $('selName'), sub = $('selSub'), stats = $('stats'), q = $('queue'), grp = $('group'), hb = $('hpBar');
  if (!sel.length) {
    name.textContent = 'Nothing selected'; sub.textContent = 'Click a unit or drag a box'; hb.hidden = true; $('selPor').innerHTML = ''; selKey = '';
    stats.innerHTML = ''; renderQueue(q, null); renderQueue($('selQueue'), null); grp.innerHTML = ''; grp.dataset.k = ''; $('selMiniName').textContent = ''; $('selMiniHp').textContent = '';
  } else if (sel.length === 1 && sel[0].kind === 'node') {
    // A resource field: what is left and who mines it.
    const n = sel[0], ether = n.type === 'ether', left = ether ? 'ether' : 'shards';
    name.textContent = ether ? 'Ether vent' : 'Shard field';
    if (selKey !== 'node' + n.id) { selKey = 'node' + n.id; $('selPor').innerHTML = portrait('node', n.type, 34); }
    sub.textContent = ether && !n.extractor ? 'Build an Ether Extractor on it to mine' : ether && n.amount <= 0 ? 'Depleted: only a trickle of ether' : `${n.amount} ${left} left`;
    hb.hidden = false; $('hpFill').style.width = (n.max ? n.amount / n.max * 100 : 0) + '%'; $('hpFill').style.background = `var(--${ether ? 'ether' : 'shard'})`;
    stats.innerHTML = `<span>Left <b>${n.amount}</b></span><span>Harvesters <b>${n.miners}</b></span>`;
    renderQueue(q, null); renderQueue($('selQueue'), null); grp.innerHTML = ''; grp.dataset.k = '';
    $('selMiniName').textContent = name.textContent; $('selMiniHp').textContent = `${n.amount} left`;
  } else if (sel.length === 1) {
    const x = sel[0];
    name.textContent = x.d.name;
    if (selKey !== 'one' + x.id) { selKey = 'one' + x.id; $('selPor').innerHTML = portrait(x.kind, x.type, 34, x.team); }
    sub.textContent = x.team === PLAYER ? (x.kind === 'unit' ? taskName(x) : bldgStatus(x)) : 'Enemy';
    hb.hidden = false; $('hpFill').style.width = (x.hp / x.maxhp * 100) + '%'; $('hpFill').style.background = '';
    let st = `<span>HP <b>${Math.ceil(x.hp)}/${x.maxhp}</b></span><span>Armor <b>${x.d.armor || 0}</b></span>`;
    const up = G.upgrades[x.team] || { weapons: 0, armor: 0 }, bonus = (UP_DMG[x.type] || 0) * up.weapons, plus = bonus ? `+${bonus}` : '';
    if (x.d.dmg || x.d.dmgAir) st += `<span>Damage <b>${x.d.dmg ? x.d.dmg + plus : '–'}${x.d.dmgAir ? ' / air ' + x.d.dmgAir + plus : ''}</b></span><span>Range <b>${x.d.range}</b></span>`;
    if (x.kind === 'unit' && up.armor) st = st.replace(`Armor <b>${x.d.armor || 0}</b>`, `Armor <b>${x.d.armor || 0}+${up.armor}</b>`);
    if (x.d.heal) st += `<span>Heals <b>${x.d.heal}/s</b></span>`;
    if (x.kind === 'unit') st += `<span>Sight <b>${x.d.sight}</b></span>`;
    if (x.kind === 'unit' && x.carry) st += `<span>Carrying <b>${x.carry} ${x.carryType}</b></span>`;
    stats.innerHTML = st;
    const own = x.kind === 'bldg' && x.team === PLAYER;
    renderQueue(q, own ? x : null, 26); renderQueue($('selQueue'), own ? x : null, 28);
    grp.innerHTML = ''; grp.dataset.k = '';
    $('selMiniName').textContent = x.d.name;
    $('selMiniHp').textContent = (x.kind === 'bldg' && x.team === PLAYER && bldgStatus(x)) || Math.ceil(x.hp) + '/' + x.maxhp;
  } else {
    const counts = {}; for (const x of sel) counts[x.d.name] = (counts[x.d.name] || 0) + 1;
    name.textContent = sel.length + ' units'; $('selPor').innerHTML = ''; selKey = ''; renderQueue(q, null); renderQueue($('selQueue'), null);
    sub.textContent = Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ');
    hb.hidden = true; stats.innerHTML = '';
    const shown = sel.slice(0, 24), gk = shown.map(x => x.id).join();
    if (grp.dataset.k !== gk) { // rebuild the tiles only when the selection changes; hp bars update in place
      grp.dataset.k = gk;
      grp.innerHTML = shown.map(x => `<div class="gi" title="${x.d.name}">${portrait(x.kind, x.type, 26, x.team)}<b>${x.d.hot}</b><i></i></div>`).join('');
    }
    shown.forEach((x, i) => { grp.children[i].lastChild.style.width = (x.hp / x.maxhp * 100) + '%'; });
    $('selMiniName').textContent = sel.length + ' units'; $('selMiniHp').textContent = sub.textContent;
  }
  buildCard();
}

function taskName(u) {
  const T = u.task;
  if (T.t === 'gather') return T.phase === 'return' ? 'Returning cargo' : T.phase === 'mine' ? 'Mining' : T.phase === 'wait' ? 'Waiting to mine' : 'Moving to mine';
  if (T.t === 'build') return 'Constructing'; if (T.t === 'repair') return 'Repairing'; if (T.t === 'attack') return 'Attacking'; if (T.t === 'amove') return 'Attack-moving';
  if (T.t === 'move') return 'Moving'; if (T.t === 'hold') return 'Holding position'; return 'Idle';
}

/**
 * The command card: up to 4 x 3 fixed slots (slot = row * 4 + column), so a command keeps its place. Back /
 * Deselect is always the last slot of the card, cancels sit just left of it. A Harvester-only selection leads
 * with Build and Gather; anything with soldiers leads with the common orders.
 */
export function cardItems() {
  const sel = playerSel();
  if (!sel.length) return ui.sel.length ? [{ id: 'esc', label: 'Deselect', key: 'Esc', cancel: true, icon: 'x', slot: 0 }] : []; // a field or an enemy
  const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const items = [];
  const at = (slot, it) => { while (items.some(i => i.slot === slot)) slot++; it.slot = slot; items.push(it); }; // never two in a slot
  const armed = ui.mode && ui.mode !== 'build'; // Esc disarms an order first
  const esc = (label, icn = 'x') => {
    if (armed) { label = 'Cancel'; icn = 'back'; }
    const rows = Math.max(2, Math.ceil((Math.max(-1, ...items.map(i => i.slot)) + 2) / 4));
    at(rows * 4 - 1, { id: 'esc', label, key: 'Esc', cancel: true, icon: icn });
  };
  if (units.length) {
    if (ui.mode === 'build') {
      BUILD_ORDER.forEach((k, i) => {
        const d = BUILDINGS[k];
        at(i, { id: 'b_' + k, label: d.name.split(' ').pop(), key: d.hot, cost: d.cost, locked: !hasReq(PLAYER, k), por: ['bldg', k], tip: d.desc + (d.req && !d.desc.includes('Requires') ? ' Requires ' + BUILDINGS[d.req].name + '.' : '') });
      });
      esc('Back', 'back');
    } else {
      const workers = units.some(u => u.type === 'harvester'), onlyWorkers = units.every(u => u.type === 'harvester');
      const orders = [{ id: 'move', label: 'Move', key: 'M', icon: 'move' }, { id: 'stop', label: 'Stop', key: 'S', icon: 'stop' }, { id: 'attack', label: 'Attack', key: 'A', active: ui.mode === 'attack', icon: 'attack' }, { id: 'hold', label: 'Hold', key: 'H', icon: 'hold' }];
      const work = [{ id: 'build', label: 'Build', key: 'B', icon: 'build' }, { id: 'gather', label: 'Gather', key: 'G', active: ui.mode === 'gather', icon: 'gather' }, { id: 'repair', label: 'Repair', key: 'R', active: ui.mode === 'repair', icon: 'repair', tip: 'Then click a damaged building. Costs a share of its price as it heals.' }];
      // (no Attack for a selection that cannot shoot: an Observer, Medics)
      const armed = units.some(u => u.d.dmg > 0 || u.d.dmgAir > 0);
      const ord = armed ? orders : orders.filter(o => o.id !== 'attack');
      const list = onlyWorkers ? [...work, ...ord] : workers ? [...ord, ...work] : ord;
      list.forEach((it, i) => at(i, it));
      esc('Deselect');
    }
  } else if (bl.length === 1) {
    const b = bl[0];
    if (!b.done && !buildersOf(b).length) at(0, { id: 'resume', label: 'Resume', key: 'R', icon: 'resume', tip: 'Send the nearest Harvester to finish construction' });
    if (!b.done) at(6, { id: 'cancelb', label: 'Cancel', key: 'X', cancel: true, icon: 'x', tip: 'Cancel construction (75% refund)' });
    if (b.done && b.d.trains?.length) b.d.trains.forEach((t, i) => {
      const d = UNITS[t], missing = d.req && !G.bldgs.some(o => o.team === PLAYER && o.type === d.req && o.done);
      at(i, { id: 't_' + t, label: d.name, key: d.hot, cost: d.cost, locked: !!missing, por: ['unit', t], tip: d.desc + (missing && !d.desc.includes('Requires') ? ' Requires ' + BUILDINGS[d.req].name + '.' : '') });
    });
    if (b.done && b.type === 'forge') {
      const after = b.d.trains ? b.d.trains.length : 0; // research follows the units on the first row
      Object.entries(UPGRADES).forEach(([k, u], i) => {
        const lv = G.upgrades[PLAYER][k] + 1, elsewhere = G.bldgs.some(o => o.team === PLAYER && o.research && o.research.type === k);
        if (lv > 3) return;
        at(after + i, { id: 'r_' + k, label: u.name + ' ' + ROMAN[lv], key: u.hot, cost: [u.cost[lv - 1], u.cost[lv - 1]], dis: !!b.research || elsewhere, icon: k, tip: u.desc + ` ${u.time[lv - 1]} s.` });
      });
      if (b.research) at(5, { id: 'cancelr', label: 'Cancel', key: 'C', cancel: true, icon: b.research.type, badge: true, tip: 'Cancel the research (full refund)' });
    }
    if (b.queue.length) at(6, { id: 'cancelq', label: 'Cancel', key: 'X', cancel: true, por: ['unit', b.queue[b.queue.length - 1]], badge: true, tip: 'Cancel the last unit in the queue (refund)' });
    if (b.done && b.d.trains?.length) at(4, { id: 'rally', label: 'Rally', key: 'R', active: ui.mode === 'rally', icon: 'rally', tip: 'Then click where new units should go' });
    esc('Deselect');
  } else esc('Deselect');
  for (const it of items) if (it.cost && !canAfford(PLAYER, it.cost)) { // greyed out, but a tap says what is short
    const [sh, et] = G.res[PLAYER];
    it.poor = true;
    it.tip = (it.tip ? it.tip + ' ' : '') + (sh < it.cost[0] ? `Not enough shards (needs ${it.cost[0]}).` : `Not enough ether (needs ${it.cost[1]}).`);
  }
  return items.sort((p, q) => p.slot - q.slot);
}

function buildCard() {
  const items = cardItems();
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
    b.disabled = !!it.dis; if (it.locked) b.setAttribute('aria-disabled', 'true'); // locked: tappable, it explains what is missing
    b.title = `${it.label} (${it.key})` + (it.tip ? ': ' + it.tip : '');
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

/**
 * A building's production queue: a progress bar and one button per unit; a click or tap cancels that unit (full
 * refund). Used by the selection panel and, on phones, by the strip under the selection label.
 */
function renderQueue(box, b, size = 26) {
  if (!box) return;
  const key = b && b.queue.length ? b.id + ':' + b.queue.join() : '';
  if (box.dataset.k !== key) {
    box.dataset.k = key;
    box.innerHTML = key ? '<div class="bar prod"><i></i></div>' + b.queue.map((t, i) =>
      `<button class="qi" data-i="${i}" data-t="${t}" title="Cancel ${UNITS[t].name}${i ? '' : ' (in training)'}: full refund" aria-label="Cancel ${UNITS[t].name}${i ? '' : ' (in training)'}">${portrait('unit', t, size)}<span class="x" aria-hidden="true"></span></button>`).join('') : '';
  }
  if (key) box.querySelector('.prod i').style.width = (b.prog * 100) + '%';
}
function queueClick(ev) {
  const q = ev.target.closest('.qi'); if (!q) return;
  ev.stopPropagation();
  const b = playerSel().find(x => x.kind === 'bldg'); if (!b) return;
  // The queue may have moved on since it was drawn (the unit in training finished): cancel the unit that was tapped.
  const i = +q.dataset.i, t = q.dataset.t, at = b.queue[i] === t ? i : b.queue[i - 1] === t ? i - 1 : -1;
  if (at >= 0) { cancelQueue(b, at); sfx('select'); }
  updateHud();
}
for (const id of ['queue', 'selQueue']) { const el = $(id); if (el) { el.addEventListener('click', queueClick); el.addEventListener('pointerdown', ev => ev.stopPropagation()); } }

// ---- long-press on a command button (touch): what it is, what it costs, what it needs ----
const press = { timer: 0, held: '', hide: 0 };
function showDetail(it) {
  const box = $('cmdInfo'), r = $('cmd').getBoundingClientRect(); // (the card survives rebuilds; its buttons may not)
  const cost = it.cost ? `<span class="c">${it.cost[0] ? `<i class="dot shard"></i>${it.cost[0]}` : ''} ${it.cost[1] ? `<i class="dot ether"></i>${it.cost[1]}` : ''}</span>` : '';
  clearTimeout(press.hide);
  box.hidden = false; // shown first, then filled, so screen readers announce it
  box.style.right = (innerWidth - r.right) + 'px'; box.style.bottom = (innerHeight - r.top + 6) + 'px'; box.style.maxWidth = Math.max(220, r.width) + 'px';
  box.innerHTML = `<b>${it.label}</b>${cost}<span class="d">${it.tip || ''}</span>`;
}
function hideDetail() { clearTimeout(press.hide); $('cmdInfo').hidden = true; }
// Wherever the finger lifts (the button may have been rebuilt under it), the panel goes a moment later.
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, () => {
  clearTimeout(press.timer);
  if (press.held) { clearTimeout(press.hide); press.hide = setTimeout(hideDetail, 1200); setTimeout(() => { press.held = ''; }, 400); } // (after the click it swallows)
}, true);

export function doCommand(id) {
  const sel = playerSel(); const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg');
  if (id === 'esc') { if (ui.box) ui.box = false; else if (ui.mode || ui.place) { ui.mode = null; ui.place = null; } else { ui.sel = []; updateHud(); } setBox(); setHint(); return; }
  if (id === 'stop') { units.forEach(stopUnit); ui.mode = null; return; }
  if (id === 'hold') { units.forEach(holdUnit); ui.mode = null; return; }
  if (id === 'move' || id === 'attack' || id === 'gather' || id === 'rally' || id === 'repair') { ui.mode = id; ui.place = null; setHint(); return; }
  if (id === 'build') { ui.mode = 'build'; return; }
  if (id.startsWith('b_')) {
    const k = id.slice(2);
    if (!hasReq(PLAYER, k)) { toast('Requires ' + BUILDINGS[BUILDINGS[k].req].name, true); return; }
    if (!canAfford(PLAYER, BUILDINGS[k].cost)) { toast('Not enough ' + (G.res[PLAYER][0] < BUILDINGS[k].cost[0] ? 'shards' : 'ether'), true); return; }
    ui.place = { type: k, tx: -99, ty: -99 }; ui.mode = 'place'; ui.box = false; setBox(); setHint(); return;
  }
  if (id.startsWith('t_')) { const b = bl[0]; if (!b) return; const err = queueUnit(b, id.slice(2)); if (err) toast(err, true); else sfx('build'); return; }
  if (id === 'resume') {
    const b = bl[0]; if (!b || b.done) return;
    const hs = G.units.filter(u => u.team === PLAYER && u.type === 'harvester').sort((p, q) => (p.task.t === 'build') - (q.task.t === 'build') || dist(p, b) - dist(q, b));
    if (!hs.length) { toast('No Harvester to build it', true); return; }
    startBuild(hs[0], b); sfx('move'); return;
  }
  if (id.startsWith('r_')) { const b = bl[0]; if (!b) return; const e = research(b, id.slice(2)); if (e) toast(e, true); else sfx('build'); return; }
  if (id === 'cancelr') { const b = bl[0]; if (b) cancelResearch(b); return; }
  if (id === 'cancelb') { const b = bl[0]; if (b && !b.done) { cancelConstruction(b); ui.sel = []; sfx('select'); } return; }
  if (id === 'cancelq') { const b = bl[0]; if (b && b.queue.length) cancelQueue(b, b.queue.length - 1); }
}

/** Reflect ui.box on the SELECT button (input.js arms it; Esc and placement clear it here). */
export function setBox() { const b = $('btnBox'); if (b) { b.classList.toggle('on', !!ui.box); b.setAttribute('aria-pressed', String(!!ui.box)); } }

export function setHint() {
  const h = $('hint');
  h.textContent = ui.place ? 'Click to place ' + BUILDINGS[ui.place.type].name + ' (Esc cancels)' : ui.box ? 'Drag to select a group' : ui.mode === 'attack' ? 'Attack-move: click a target or the ground' : ui.mode === 'move' ? 'Click where to move' : ui.mode === 'gather' ? 'Click a shard field or extractor'
    : ui.mode === 'rally' ? 'Click where new units should gather' : ui.mode === 'repair' ? 'Click a damaged building to repair' : '';
}
