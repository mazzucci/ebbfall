// Top bar, selection panel and command card. Also owns the client-side selection and command mode.
import { G, PLAYER, UNITS, BUILDINGS, BUILD_ORDER, fmt, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, dist } from '../engine/index.js';
import { sfx } from './audio.js';

export const $ = (id) => document.getElementById(id);

/** Client-only UI state: what the local player has selected and which command is armed. */
export const ui = { sel: [], mode: null, place: null, groups: {}, lastGroup: null, lastGroupT: 0 };

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

/** One line describing a building's state: construction (and whether it is paused) or what it is training. */
export function bldgStatus(b) {
  if (!b.done) return 'Constructing ' + Math.round(b.progress * 100) + '%' + (buildersOf(b).length ? '' : ' (paused: no builder)');
  if (b.queue.length) return 'Training ' + UNITS[b.queue[0]].name + ' ' + Math.round(b.prog * 100) + '%' + (b.queue.length > 1 ? ' +' + (b.queue.length - 1) : '');
  return '';
}

let cardKey = '';
export function invalidateCard() { cardKey = ''; }

export function updateHud() {
  const [s, e] = G.res[PLAYER], [su, sc] = G.sup[PLAYER];
  $('rShard').textContent = s; $('rEther').textContent = e; $('rSupply').textContent = su + '/' + sc;
  $('resSup').classList.toggle('low', su >= sc); $('clock').textContent = fmt(G.time);
  ui.sel = ui.sel.filter(x => !x.dead);
  const sel = ui.sel, name = $('selName'), sub = $('selSub'), stats = $('stats'), q = $('queue'), grp = $('group'), hb = $('hpBar');
  if (!sel.length) {
    name.textContent = 'Nothing selected'; sub.textContent = 'Click a unit or drag a box'; hb.hidden = true;
    stats.innerHTML = ''; q.innerHTML = ''; grp.innerHTML = ''; $('selMiniName').textContent = ''; $('selMiniHp').textContent = '';
  } else if (sel.length === 1) {
    const x = sel[0];
    name.textContent = x.d.name;
    sub.textContent = x.team === PLAYER ? (x.kind === 'unit' ? taskName(x) : bldgStatus(x)) : 'Enemy';
    hb.hidden = false; $('hpFill').style.width = (x.hp / x.maxhp * 100) + '%';
    let st = `<span>HP <b>${Math.ceil(x.hp)}/${x.maxhp}</b></span><span>Armor <b>${x.d.armor || 0}</b></span>`;
    if (x.d.dmg || x.d.dmgAir) st += `<span>Damage <b>${x.d.dmg || '–'}${x.d.dmgAir ? ' / air ' + x.d.dmgAir : ''}</b></span><span>Range <b>${x.d.range}</b></span>`;
    if (x.d.heal) st += `<span>Heals <b>${x.d.heal}/s</b></span>`;
    if (x.kind === 'unit' && x.carry) st += `<span>Carrying <b>${x.carry} ${x.carryType}</b></span>`;
    stats.innerHTML = st;
    q.innerHTML = x.kind === 'bldg' && x.queue.length ? `<div class="bar prod" style="flex:1 1 100%"><i style="width:${x.prog * 100}%"></i></div>` + x.queue.map(t => `<div class="qi" title="${UNITS[t].name}">${UNITS[t].hot}</div>`).join('') : '';
    grp.innerHTML = '';
    $('selMiniName').textContent = x.d.name;
    $('selMiniHp').textContent = (x.kind === 'bldg' && x.team === PLAYER && bldgStatus(x)) || Math.ceil(x.hp) + '/' + x.maxhp;
  } else {
    const counts = {}; for (const x of sel) counts[x.d.name] = (counts[x.d.name] || 0) + 1;
    name.textContent = sel.length + ' units'; sub.textContent = Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ');
    hb.hidden = true; stats.innerHTML = ''; q.innerHTML = '';
    grp.innerHTML = sel.slice(0, 24).map(x => `<div class="gi" title="${x.d.name}">${x.d.hot}<i style="width:${x.hp / x.maxhp * 100}%"></i></div>`).join('');
    $('selMiniName').textContent = sel.length + ' units'; $('selMiniHp').textContent = sub.textContent;
  }
  buildCard();
}

function taskName(u) {
  const T = u.task;
  if (T.t === 'gather') return T.phase === 'return' ? 'Returning cargo' : T.phase === 'mine' ? 'Mining' : T.phase === 'wait' ? 'Waiting to mine' : 'Moving to mine';
  if (T.t === 'build') return 'Constructing'; if (T.t === 'attack') return 'Attacking'; if (T.t === 'amove') return 'Attack-moving';
  if (T.t === 'move') return 'Moving'; if (T.t === 'hold') return 'Holding position'; return 'Idle';
}

export function cardItems() {
  const sel = playerSel(); if (!sel.length) return [];
  const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const items = [];
  if (units.length) {
    if (ui.mode === 'build') {
      for (const k of BUILD_ORDER) { const d = BUILDINGS[k]; items.push({ id: 'b_' + k, label: d.name.replace('Command ', '').replace('Supply ', '').replace('Ether ', '').replace('Sentinel ', '').replace('War ', ''), key: d.hot, cost: d.cost, dis: !hasReq(PLAYER, k), tip: d.desc + (d.req ? ' Requires ' + BUILDINGS[d.req].name + '.' : '') }); }
      items.push({ id: 'esc', label: 'Back', key: 'Esc', cancel: true });
    } else {
      items.push({ id: 'move', label: 'Move', key: 'M' }, { id: 'stop', label: 'Stop', key: 'S' }, { id: 'attack', label: 'Attack', key: 'A', active: ui.mode === 'attack' }, { id: 'hold', label: 'Hold', key: 'H' });
      if (units.some(u => u.type === 'harvester')) items.push({ id: 'gather', label: 'Gather', key: 'G' }, { id: 'build', label: 'Build', key: 'B' });
      items.push({ id: 'esc', label: 'Deselect', key: 'Esc', cancel: true });
    }
  } else if (bl.length === 1) {
    const b = bl[0];
    if (!b.done && !buildersOf(b).length) items.push({ id: 'resume', label: 'Resume', key: 'R', tip: 'Send the nearest Harvester to finish construction' });
    if (!b.done) items.push({ id: 'cancelb', label: 'Cancel', key: 'X', cancel: true, tip: 'Cancel construction (75% refund)' });
    if (b.done && b.d.trains) for (const t of b.d.trains) {
      const d = UNITS[t], missing = d.req && !G.bldgs.some(o => o.team === PLAYER && o.type === d.req && o.done);
      items.push({ id: 't_' + t, label: d.name, key: d.hot, cost: d.cost, dis: !!missing, tip: d.desc + (missing ? ' Requires ' + BUILDINGS[d.req].name + '.' : '') });
    }
    if (b.queue.length) items.push({ id: 'cancelq', label: 'Cancel last', key: 'X', cancel: true });
    if (b.done && b.d.trains) items.push({ id: 'rally', label: 'Rally', key: 'R', active: ui.mode === 'rally', tip: 'Then click where new units should go' });
    items.push({ id: 'esc', label: 'Deselect', key: 'Esc', cancel: true });
  } else items.push({ id: 'esc', label: 'Deselect', key: 'Esc', cancel: true });
  return items;
}

function buildCard() {
  const items = cardItems(); const key = JSON.stringify(items.map(i => [i.id, i.dis, i.active, i.label]));
  if (key === cardKey) return; cardKey = key;
  const c = $('cmd'); c.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'cb' + (it.active ? ' active' : '') + (it.cancel ? ' cancel' : ''); b.disabled = !!it.dis; b.title = it.tip || '';
    b.innerHTML = `<span class="k">${it.key}</span><span>${it.label}</span>` + (it.cost ? `<span class="c">${it.cost[0] ? `<span class="s">${it.cost[0]}</span>` : ''}${it.cost[1] ? `<span class="e">${it.cost[1]}</span>` : ''}</span>` : '');
    b.addEventListener('pointerdown', ev => ev.stopPropagation());
    b.addEventListener('click', () => { doCommand(it.id); cardKey = ''; updateHud(); }); // immediate feedback, even on slow frames
    c.appendChild(b);
  }
}

export function doCommand(id) {
  const sel = playerSel(); const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg');
  if (id === 'esc') { if (ui.mode || ui.place) { ui.mode = null; ui.place = null; } else { ui.sel = []; updateHud(); } setHint(); return; }
  if (id === 'stop') { units.forEach(stopUnit); ui.mode = null; return; }
  if (id === 'hold') { units.forEach(holdUnit); ui.mode = null; return; }
  if (id === 'move' || id === 'attack' || id === 'gather' || id === 'rally') { ui.mode = id; ui.place = null; setHint(); return; }
  if (id === 'build') { ui.mode = 'build'; return; }
  if (id.startsWith('b_')) {
    const k = id.slice(2);
    if (!hasReq(PLAYER, k)) { toast('Requires ' + BUILDINGS[BUILDINGS[k].req].name, true); return; }
    if (!canAfford(PLAYER, BUILDINGS[k].cost)) { toast('Not enough ' + (G.res[PLAYER][0] < BUILDINGS[k].cost[0] ? 'shards' : 'ether'), true); return; }
    ui.place = { type: k, tx: -99, ty: -99 }; ui.mode = 'place'; setHint(); return;
  }
  if (id.startsWith('t_')) { const b = bl[0]; if (!b) return; const err = queueUnit(b, id.slice(2)); if (err) toast(err, true); else sfx('build'); return; }
  if (id === 'resume') {
    const b = bl[0]; if (!b || b.done) return;
    const hs = G.units.filter(u => u.team === PLAYER && u.type === 'harvester').sort((p, q) => (p.task.t === 'build') - (q.task.t === 'build') || dist(p, b) - dist(q, b));
    if (!hs.length) { toast('No Harvester to build it', true); return; }
    startBuild(hs[0], b); sfx('move'); return;
  }
  if (id === 'cancelb') { const b = bl[0]; if (b && !b.done) { cancelConstruction(b); ui.sel = []; sfx('select'); } return; }
  if (id === 'cancelq') { const b = bl[0]; if (b && b.queue.length) cancelQueue(b, b.queue.length - 1); }
}

export function setHint() {
  const h = $('hint');
  h.textContent = ui.mode === 'attack' ? 'Attack-move: click a target or the ground' : ui.mode === 'move' ? 'Click where to move' : ui.mode === 'gather' ? 'Click a shard field or extractor'
    : ui.mode === 'rally' ? 'Click where new units should gather' : ui.place ? 'Click to place ' + BUILDINGS[ui.place.type].name + ' (Esc cancels)' : '';
}
