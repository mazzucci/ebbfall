// Top bar, selection panel and command card. Also owns the client-side selection and command mode.
import { G, UNITS, BUILDINGS, FACTIONS, UPGRADES, UP_DMG, effectLevel, fmt, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, research, cancelResearch, dist } from '../engine/index.js';
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
  for (const t of [...m.children]) if (t.textContent === msg) t.remove(); // the same message again replaces itself (no storm), fresh
  d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = msg; m.appendChild(d);
  while (m.children.length > 4) m.removeChild(m.firstChild);
  setTimeout(() => d.remove(), 3300);
  if (bad && !silent) sfx('error');
}

export const playerSel = () => ui.sel.filter(e => e.team === G.me && !e.dead);

/** Harvesters currently working on building b. */
export const buildersOf = (b) => G.units.filter(u => u.task.t === 'build' && u.task.b === b);

export const ROMAN = ['', 'I', 'II', 'III'];

/** A few words on a building's state (the panel's bars show how far along it is): construction, research, training. */
export function bldgStatus(b) {
  if (!b.done) return b.planted ? 'Growing' : buildersOf(b).length ? 'Constructing' : 'Paused: no builder';
  if (b.d.needsPower && !b.powered) return `Unpowered: build a ${BUILDINGS[FACTIONS[G.factions[b.team]]?.power]?.name ?? 'power source'} near it`; // (the owner's race)
  if (b.research) { const u = UPGRADES[b.research.type], lv = G.upgrades[G.me][b.research.type] + 1; return 'Researching ' + u.name + ' ' + ROMAN[lv]; }
  if (b.queue.length) return 'Training ' + UNITS[b.queue[0]].name + (b.queue.length > 1 ? ' +' + (b.queue.length - 1) : '');
  if (b.team === G.me && repairersOf(b).length) return 'Repairing';
  if (b.d.onVent && b.vent) return b.vent.amount > 0 ? `${b.vent.amount} ether left` : 'Vent depleted: a trickle of ether';
  return '';
}

let cardKey = '', selKey = '';
export function invalidateCard() { cardKey = ''; }

export function updateHud() {
  const [s, e] = G.res[G.me], [su, sc] = G.sup[G.me];
  $('rShard').textContent = s; $('rEther').textContent = e; $('rSupply').textContent = su + '/' + sc;
  $('resSup').classList.toggle('low', su >= sc); $('clock').textContent = fmt(G.time);
  renderUpgrades(); watchSites();
  ui.sel = ui.sel.filter(x => !x.dead);
  renderSelection();
  buildCard();
}

/** A figure in the panel: an icon, the base value and, in gold, what upgrades add. */
const stat = (ico, v, bonus, title) => `<span class="st" title="${title}" aria-label="${title}: ${v}${bonus ? ' plus ' + bonus : ''}">${icon(ico)}<b>${v}</b>${bonus ? `<em>+${bonus}</em>` : ''}</span>`;
/** What a unit or turret can do in a fight, in as few numbers as possible: damage (ground, air) and armor. */
function fightStats(x) {
  const up = G.upgrades[x.team], bonus = (UP_DMG[x.type] || 0) * effectLevel(up, 'weapons');
  let h = '';
  if (x.d.dmg && !x.d.worker) h += stat('dmg', x.d.dmg, bonus, 'Damage against ground');
  if (x.d.dmgAir) h += stat('air', x.d.dmgAir, bonus, 'Damage against flyers');
  if (x.d.heal) h += stat('heal', x.d.heal, 0, 'Heals infantry (per second)');
  h += stat('armor', x.d.armor || 0, x.kind === 'unit' ? effectLevel(up, 'armor') : 0, 'Armor');
  return h;
}

/** The research a building is doing: the upgrade, its level (pips for I-III) and a bar. */
function researchModule(b) {
  const k = b.research.type, lv = G.upgrades[b.team][k] + 1;
  return `<div class="rs" title="Researching ${UPGRADES[k].name} ${ROMAN[lv]}">${icon(k)}<div class="rb"><div class="rt">${UPGRADES[k].name} <b>${ROMAN[lv]}</b><span class="pips">${[1, 2, 3].map(i => `<i class="${i < lv ? 'done' : i === lv ? 'now' : ''}"></i>`).join('')}</span></div><div class="bar res"><i></i></div></div></div>`;
}

let modKey = '';
const touchUi = matchMedia('(pointer: coarse)').matches;
const compactMq = matchMedia('(max-width: 620px), (max-height: 500px) and (orientation: landscape) and (pointer: coarse)');
/** The selection console: portrait, name and a few words, a health bar, then one module (fight figures, research,
 * the production queue, construction, or the tiles of a group). Rebuilt only when what it shows changes, so its
 * buttons survive between frames; bars and numbers update in place. */
function renderSelection() {
  const sel = ui.sel, info = $('info'), name = $('selName'), sub = $('selSub'), mod = $('mod'), grp = $('group');
  const life = (f, cur, max, color = '', sh = 0, maxsh = 0) => { // (small phones drop the "/max")
    $('life').hidden = false; $('hpFill').style.width = (f * 100) + '%'; $('hpFill').style.background = color;
    $('shBar').hidden = !maxsh; if (maxsh) $('shFill').style.width = (sh / maxsh * 100) + '%'; // the Vael's shields, over the hull
    const t = max ? `${cur}<span class="mx">/${max}</span>` : String(cur); if ($('hpNum').innerHTML !== t) $('hpNum').innerHTML = t;
  };
  const module = (key, html) => { if (modKey !== key) { modKey = key; mod.innerHTML = html; } };
  info.classList.toggle('empty', !sel.length); grp.hidden = sel.length < 2;
  if (!sel.length) {
    name.textContent = 'Nothing selected'; sub.textContent = touchUi ? 'Tap a unit or a building' : 'Click a unit or drag a box'; $('life').hidden = true; $('selPor').innerHTML = ''; selKey = '';
    module('', ''); grp.innerHTML = ''; grp.dataset.k = '';
  } else if (sel.length === 1 && sel[0].kind === 'node') {
    // A resource field: what is left and who works it.
    const n = sel[0], ether = n.type === 'ether';
    name.textContent = ether ? 'Ether vent' : 'Shard field';
    if (selKey !== 'node' + n.id) { selKey = 'node' + n.id; $('selPor').innerHTML = portrait('node', n.type, 44); }
    sub.textContent = ether && !n.extractor ? `Build ${aName(BUILDINGS[myFaction().ether].name)} on it to mine` : ether && n.amount <= 0 ? 'Depleted: only a trickle of ether' : `${n.amount} ${ether ? 'ether' : 'shards'} left`;
    life(n.max ? n.amount / n.max : 0, n.amount, 0, `var(--${ether ? 'ether' : 'shard'})`);
    const working = G.units.filter(u => u.team === G.me && u.task.t === 'gather' && u.task.node === n).length; // one mines at a time, the rest come and go
    module('node' + working, `<span class="st" title="${UNITS[myFaction().worker].name}s working it" aria-label="${UNITS[myFaction().worker].name}s working it: ${working}">${portrait('unit', myFaction().worker, 22)}<b>${working}</b></span>`);
  } else if (sel.length === 1) {
    const x = sel[0], own = x.team === G.me;
    name.textContent = x.d.name;
    if (selKey !== 'one' + x.id) { selKey = 'one' + x.id; $('selPor').innerHTML = portrait(x.kind, x.type, 44, x.team); }
    // (research and training: the module below names what and shows how far)
    sub.textContent = !own ? 'Enemy' : x.kind === 'unit' ? taskName(x) : x.done && x.research ? 'Researching' : x.done && x.queue.length ? 'Training' : bldgStatus(x);
    life(x.hp / x.maxhp, Math.ceil(x.hp), x.maxhp, '', x.sh, x.maxsh);
    if (x.kind === 'bldg' && own && !x.done) {
      module('build' + x.id, '<div class="bar build"><i></i></div>');
      mod.querySelector('i').style.width = (x.progress * 100) + '%';
    } else if (x.kind === 'bldg' && own && x.research) {
      module('res' + x.id + x.research.type + G.upgrades[x.team][x.research.type], researchModule(x));
      mod.querySelector('.res i').style.width = (x.research.prog * 100) + '%';
    } else if (x.kind === 'bldg' && own && x.queue.length) {
      module('q' + x.id, '<div id="queue" class="q" role="group" aria-label="Production queue (tap a unit to cancel it)"></div>');
      renderQueue($('queue'), x, 30);
    } else if (x.kind === 'unit' || x.d.dmg || x.d.dmgAir) {
      const h = fightStats(x); module('f' + h, h);
    } else module('', '');
  } else {
    const counts = {}; for (const x of sel) counts[x.d.name] = (counts[x.d.name] || 0) + 1;
    name.textContent = sel.length + ' units'; $('selPor').innerHTML = ''; selKey = ''; module('', '');
    sub.textContent = Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ');
    $('life').hidden = true;
    if (compactMq.matches) { // small screens: one tile per type, with its count and the group's health
      const types = [...new Set(sel.map(x => x.type))], gk = 't' + types.join() + sel.length;
      if (grp.dataset.k !== gk) {
        grp.dataset.k = gk;
        grp.innerHTML = types.map(t => { const n = sel.filter(x => x.type === t).length; return `<div class="gi gt" title="${n} ${UNITS[t].name}">${portrait('unit', t, 26)}<b>${n}</b><i></i></div>`; }).join('');
      }
      types.forEach((t, i) => { const g = sel.filter(x => x.type === t), f = g.reduce((a, x) => a + x.hp, 0) / g.reduce((a, x) => a + x.maxhp, 0); grp.children[i].lastChild.style.width = (f * 100) + '%'; });
      return;
    }
    const shown = sel.slice(0, 24), gk = shown.map(x => x.id).join();
    if (grp.dataset.k !== gk) { // rebuild the tiles only when the selection changes; hp bars update in place
      grp.dataset.k = gk;
      grp.innerHTML = shown.map(x => `<div class="gi" title="${x.d.name}">${portrait(x.kind, x.type, 26, x.team)}<b>${x.d.hot}</b><i></i></div>`).join('');
    }
    shown.forEach((x, i) => { grp.children[i].lastChild.style.width = (x.hp / x.maxhp * 100) + '%'; });
  }
}

/** Top bar: upgrade levels, and research under way as a ring filling round its icon (whatever is selected). */
function renderUpgrades() {
  const up = G.upgrades[G.me], el = $('upg');
  let key = '', html = '';
  for (const k of Object.keys(UPGRADES)) {
    const r = G.bldgs.find(b => b.team === G.me && b.research?.type === k), lv = up[k] + (r ? 1 : 0);
    if (!lv) continue;
    key += k + lv + (r ? 'r' : '');
    html += `<span class="up${r ? ' on' : ''}" data-k="${k}" title="${UPGRADES[k].name} ${ROMAN[lv]}${r ? ' (researching)' : ''}" aria-label="${UPGRADES[k].name} ${ROMAN[lv]}${r ? ' (researching)' : ''}">${r ? '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5"/><circle class="p" cx="12" cy="12" r="10.5" pathLength="100"/></svg>' : ''}${icon(k)}<b>${ROMAN[lv]}</b></span>`;
  }
  el.hidden = !key;
  if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = html; }
  for (const b of G.bldgs) if (b.team === G.me && b.research) { const p = el.querySelector(`[data-k="${b.research.type}"] .p`); if (p) p.style.strokeDasharray = `${b.research.prog * 100} 100`; }
}

function taskName(u) {
  const T = u.task;
  if (T.t === 'gather') return T.phase === 'return' ? 'Returning cargo' : T.phase === 'mine' ? 'Mining' : T.phase === 'wait' ? 'Waiting to mine' : 'Moving to mine';
  if (T.t === 'build') return 'Constructing'; if (T.t === 'repair') return 'Repairing'; if (T.t === 'attack') return 'Attacking'; if (T.t === 'amove') return 'Attack-moving';
  if (T.t === 'move') return 'Moving'; if (T.t === 'hold') return 'Holding position'; return 'Idle';
}

/**
 * The command card: three buttons a row (big enough for a thumb), fixed slots (slot = row * 3 + column) so a command
 * keeps its place. No Stop or Move buttons: a tap on the ground moves, Hold stops (their keys still work: `hidden`
 * items have a key but no button). Units have Deselect in the last slot; a building or field is let go with a tap on
 * the ground. An armed order's own button
 * turns into its Cancel, so the card never grows a row. The Build list has a basic and an advanced page.
 */
const COLS = 3;
/** "an Ether Rig", "a Siphon". */
export const aName = (name) => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name;
/** The player's side (faction data: worker, headquarters, Build list pages). */
export const myFaction = () => FACTIONS[G.factions[G.me]] || FACTIONS.humans;
/** Which button an armed order belongs to (it becomes that order's Cancel). */
const ARMED_BY = { attack: 'attack', gather: 'gather', repair: 'repair', rally: 'rally', place: 'build' };
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
    const canShoot = units.some(u => u.d.dmg > 0 || u.d.dmgAir > 0); // (no Attack for an Observer or Medics)
    const orders = [...(canShoot ? [{ id: 'attack', label: 'Attack', key: 'A', icon: 'attack' }] : []), { id: 'hold', label: 'Hold', key: 'H', icon: 'hold' }];
    const work = [{ id: 'build', label: 'Build', key: 'B', icon: 'build' }, { id: 'gather', label: 'Gather', key: 'G', icon: 'gather' }, { id: 'repair', label: 'Repair', key: 'R', icon: 'repair', tip: 'Then tap a damaged building. Costs a share of its price as it heals.' }].filter(it => it.id !== 'repair' || myFaction().repairs); // the Vael regenerate shields instead
    if (onlyWorkers) { work.forEach((it, i) => at(i, it)); orders.forEach((it, i) => at(COLS + i, it)); }
    else { orders.forEach((it, i) => at(i, it)); if (workers) work.forEach((it, i) => at(COLS + i, it)); }
    // Let go of units (a tap on the ground would move them): the last slot of the card.
    at(Math.ceil((Math.max(...items.map(i => i.slot)) + 2) / COLS) * COLS - 1, { id: 'deselect', label: 'Deselect', key: 'Esc', cancel: true, icon: 'x' });
    hidden({ id: 'move', label: 'Move', key: 'M', icon: 'move' }); hidden({ id: 'stop', label: 'Stop', key: 'S', icon: 'stop' });
  } else if (bl.length === 1) {
    const b = bl[0];
    if (!b.done && !b.planted && !buildersOf(b).length) at(0, { id: 'resume', label: 'Resume', key: 'R', icon: 'resume', tip: `Send the nearest ${UNITS[myFaction().worker].name} to finish construction` });
    if (!b.done) at(2, { id: 'cancelb', label: 'Cancel', key: 'X', cancel: true, icon: 'x', tip: 'Cancel construction (75% refund)' });
    const trains = b.done ? b.d.trains || [] : [];
    trains.forEach((t, i) => {
      const d = UNITS[t], missing = d.req && !G.bldgs.some(o => o.team === G.me && o.type === d.req && o.done);
      at(i, { id: 't_' + t, label: d.name, key: d.hot, cost: d.cost, locked: !!missing, por: ['unit', t], tip: d.desc });
    });
    if (trains.length) at(trains.length, { id: 'rally', label: 'Rally', key: 'R', icon: 'rally', tip: 'Then tap where new units should go' });
    if (b.done && b.d.researches.length) {
      b.d.researches.forEach((k, i) => {
        const u = UPGRADES[k];
        const lv = G.upgrades[G.me][k] + 1, elsewhere = G.bldgs.some(o => o.team === G.me && o.research && o.research.type === k);
        if (lv > 3) return;
        at(i, { id: 'r_' + k, label: u.name + ' ' + ROMAN[lv], key: u.hot, cost: u.cost[lv - 1], dis: !!b.research || elsewhere, icon: k, tip: u.desc + ` ${u.time[lv - 1]} s.` });
      });
      if (b.research) at(2, { id: 'cancelr', label: 'Cancel', key: 'C', cancel: true, icon: b.research.type, badge: true, tip: 'Cancel the research (full refund)' });
    }
    // Always in the same place on a building that trains (greyed out with nothing queued), so the card keeps its shape.
    if (trains.length) {
      const last = b.queue[b.queue.length - 1];
      at(5, { id: 'cancelq', label: 'Cancel', key: 'X', cancel: true, dis: !last, ...(last ? { por: ['unit', last], badge: true } : { icon: 'x' }), tip: 'Cancel the last unit in the queue (refund)' });
    }
  }
  // An armed order: its button becomes Cancel (Esc), lit, in the same place.
  const armedId = ARMED_BY[ui.mode], armedAt = items.find(i => i.id === armedId && !i.hidden);
  if (armedAt) {
    Object.assign(armedAt, { id: 'esc', label: 'Cancel', key: 'Esc', cancel: true, active: true, icon: 'back', por: null, cost: null, tip: 'Cancel the order' });
    for (let i = items.length - 1; i >= 0; i--) if (items[i].id.startsWith('cancel')) items.splice(i, 1); // one Cancel at a time (Deselect stays)
  }
  for (const it of items) if (it.cost && !canAfford(G.me, it.cost)) { // greyed out, but a tap says what is short
    const [sh, et] = G.res[G.me];
    it.poor = true;
    it.tip = (it.tip ? it.tip + ' ' : '') + (sh < it.cost[0] ? `Not enough shards (needs ${it.cost[0]}).` : `Not enough ether (needs ${it.cost[1]}).`);
  }
  return items.sort((p, q) => p.slot - q.slot);
}

function buildCard() {
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
 * A building's production queue in the selection console: a progress bar and one button per unit; a click or tap
 * cancels that unit (full refund).
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
{ const el = $('mod'); if (el) { el.addEventListener('click', queueClick); el.addEventListener('pointerdown', ev => ev.stopPropagation()); } }

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
  if (id === 'deselect') { ui.sel = []; ui.mode = null; ui.place = null; ui.box = false; setBox(); setHint(); updateHud(); return; }
  if (id === 'esc' && ui.mode === 'build2') { ui.mode = 'build'; return; } // Esc on the advanced page: back to the basic one
  if (id === 'esc') { if (ui.box) ui.box = false; else if (ui.mode || ui.place) { ui.mode = null; ui.place = null; } else { ui.sel = []; updateHud(); } setBox(); setHint(); return; }
  if (id === 'stop') { units.forEach(stopUnit); ui.mode = null; return; }
  if (id === 'hold') { units.forEach(holdUnit); ui.mode = null; return; }
  if (id === 'move' || id === 'attack' || id === 'gather' || id === 'rally' || id === 'repair') { ui.mode = id; ui.place = null; setHint(); return; }
  if (id === 'build' || id === 'build1') { ui.mode = 'build'; return; }
  if (id === 'build2') { ui.mode = 'build2'; return; }
  if (id.startsWith('b_')) {
    const k = id.slice(2);
    if (!hasReq(G.me, k)) { toast('Requires ' + BUILDINGS[BUILDINGS[k].req].name, true); return; }
    if (!canAfford(G.me, BUILDINGS[k].cost)) { toast('Not enough ' + (G.res[G.me][0] < BUILDINGS[k].cost[0] ? 'shards' : 'ether'), true); return; }
    ui.place = { type: k, tx: -99, ty: -99 }; ui.mode = 'place'; ui.box = false; setBox(); setHint(); return;
  }
  if (id.startsWith('t_')) { const b = bl[0]; if (!b) return; const err = queueUnit(b, id.slice(2)); if (err) toast(err, true); else sfx('build'); return; }
  if (id === 'resume') {
    const b = bl[0]; if (!b || b.done) return;
    const hs = G.units.filter(u => u.team === G.me && u.d.worker).sort((p, q) => (p.task.t === 'build') - (q.task.t === 'build') || dist(p, b) - dist(q, b));
    if (!hs.length) { toast(`No ${UNITS[myFaction().worker].name} to build it`, true); return; }
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
  const h = $('hint'), c = touchUi ? 'Tap' : 'Click';
  h.textContent = ui.place ? `${c} to place ` + BUILDINGS[ui.place.type].name + (touchUi ? '' : ' (Esc cancels)') : ui.box ? 'Drag to select a group' : ui.mode === 'attack' ? `Attack-move: ${c.toLowerCase()} a target or the ground` : ui.mode === 'move' ? `${c} where to move` : ui.mode === 'gather' ? `${c} a shard field or Ether Rig`
    : ui.mode === 'rally' ? `${c} where new units should gather` : ui.mode === 'repair' ? `${c} a damaged building to repair` : '';
}

/** A site of ours that loses its last builder says so (once): a thumb easily pulls a builder off without noticing. */
const siteHadBuilder = new Map();
function watchSites() {
  for (const b of G.bldgs) {
    if (b.team !== G.me || b.done) { siteHadBuilder.delete(b.id); continue; }
    const has = buildersOf(b).length > 0;
    if (siteHadBuilder.get(b.id) && !has && !b.planted) toast(`${b.d.name} paused: no builder (select it and tap Resume)`, true);
    siteHadBuilder.set(b.id, has);
  }
  for (const id of siteHadBuilder.keys()) if (!G.bldgs.some(b => b.id === id)) siteHadBuilder.delete(id);
}
