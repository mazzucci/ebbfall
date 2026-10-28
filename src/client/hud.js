// Top bar and selection panel (the UI state is in ui.js, the command card in card.js).
import { G, UNITS, BUILDINGS, FACTIONS, UPGRADES, UP_DMG, QUEUE_MAX, effectLevel, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, research, cancelResearch, dist, visibleEnt, enemies } from '../engine/index.js';
/** Harvesters repairing building `b`. */
const repairersOf = (b) => G.units.filter(u => u.task.t === 'repair' && u.task.b === b);
import { sfx } from './audio.js';
import { icon } from './icons.js';
import { portrait } from './gl/render.js';
import { $, ui, toast, playerSel, touchUi, setBox, setHint, clearMode, setSelection } from './ui.js';
import { buildCard, invalidateCard, cardItems, doCommand } from './card.js';
export { invalidateCard, cardItems, doCommand }; // (the card lives in card.js)
export { $, ui, toast, playerSel, setBox, setHint, clearMode, setSelection }; // (the state lives in ui.js)

/** Harvesters currently working on building b. */
export const buildersOf = (b) => G.units.filter(u => u.task.t === 'build' && u.task.b === b);

export const ROMAN = ['', 'I', 'II', 'III'];

/** A few words on a building's state (the panel's bars show how far along it is): construction, research, training. */
export function bldgStatus(b) {
  if (!b.done) {
    if (b.planted) return 'Growing';
    const warp = warps(b.team), busy = buildersOf(b).length; // (a warp-in site waits for a worker to plant it)
    return warp ? (busy ? 'Being planted' : 'Not planted yet') : busy ? 'Constructing' : 'Paused: no builder';
  }
  if (b.d.needsPower && !b.powered) return `Unpowered: build a ${BUILDINGS[FACTIONS[G.factions[b.team]]?.power]?.name ?? 'power source'} near it`; // (the owner's race)
  if (b.research) { const u = UPGRADES[b.research.type], lv = G.upgrades[G.me][b.research.type] + 1; return 'Researching ' + u.name + (u.levels > 1 ? ' ' + ROMAN[lv] : ''); }
  if (b.queue.length) return 'Training ' + UNITS[b.queue[0]].name + (b.queue.length > 1 ? ' +' + (b.queue.length - 1) : '');
  if (b.team === G.me && repairersOf(b).length) return 'Repairing';
  if (b.d.onVent && b.vent) return b.vent.amount > 0 ? `${b.vent.amount} ether left` : 'Vent depleted: a trickle of ether';
  return '';
}

let selKey = '';

export function updateHud() {
  // Placing with no worker of ours selected (it died): nothing would build it, and a touch card would have no Cancel.
  if (ui.place && !playerSel().some(e => e.kind === 'unit' && e.d.worker)) clearMode();
  const [s, e] = G.res[G.me], [su, sc] = G.sup[G.me];
  $('rShard').textContent = s; $('rEther').textContent = e; $('rSupply').textContent = su + '/' + sc;
  $('resSup').classList.toggle('low', su >= sc);
  watchSites();
  ui.sel = ui.sel.filter(x => !x.dead && (x.team === G.me || x.kind !== 'unit' || visibleEnt(x))); // (an enemy that slips out of sight or detection is let go)
  renderSelection();
  buildCard();
}

/** A figure in the panel: an icon, the base value and, in gold, what upgrades add. */
const stat = (ico, v, bonus, title) => `<span class="st" title="${title}" aria-label="${title}: ${v}${bonus ? ' plus ' + bonus : ''}">${icon(ico)}<b>${v}</b>${bonus ? `<em>+${bonus}</em>` : ''}</span>`;
/** What a unit or turret can do in a fight, in as few numbers as possible: damage (ground, air) and armor. */
function fightStats(x) {
  const up = G.upgrades[x.team], bonus = (UP_DMG[x.type] || 0) * effectLevel(up, 'weapons');
  let h = '';
  const wp = x.d.weapon;
  if (wp?.dmg && !x.d.worker) h += stat('dmg', wp.dmg, bonus, 'Damage against ground');
  if (wp?.dmgAir) h += stat('air', wp.dmgAir, bonus, 'Damage against flyers');
  if (x.d.heal) h += stat('heal', x.d.heal, 0, x.d.mend ? 'Mends shields (per second)' : 'Heals infantry (per second)');
  h += stat('armor', x.d.armor || 0, x.kind === 'unit' ? effectLevel(up, 'armor') : 0, 'Armor');
  return h;
}

/** The research a building is doing: the upgrade, its level (pips for I-III; a one-level tech has none) and a bar. */
function researchModule(b) {
  const k = b.research.type, u = UPGRADES[k], lv = G.upgrades[b.team][k] + 1, name = u.levels > 1 ? `${u.name} ${ROMAN[lv]}` : u.name;
  const pips = u.levels > 1 ? `<span class="pips">${Array.from({ length: u.levels }, (_, j) => j + 1).map(i => `<i class="${i < lv ? 'done' : i === lv ? 'now' : ''}"></i>`).join('')}</span>` : '';
  const shown = u.levels > 1 ? `${u.name} <b>${ROMAN[lv]}</b>` : u.name;
  return `<div class="rs" title="Researching ${name}">${icon(k)}<div class="rb"><div class="rt">${shown}${pips}</div><div class="bar res"><i></i></div></div></div>`;
}

let modKey = '';
const compactMq = matchMedia('(max-width: 620px), (max-height: 500px) and (orientation: landscape) and (pointer: coarse)');
/** The selection console: portrait, name and a few words, a health bar, then one module (fight figures, research,
 * the production queue, construction, or the tiles of a group). Rebuilt only when what it shows changes, so its
 * buttons survive between frames; bars and numbers update in place. */
function renderSelection() {
  if (!stripBound) { stripBound = true; bindStrip(); }
  const sel = ui.sel, info = $('info'), name = $('selName'), sub = $('selSub'), mod = $('mod'), grp = $('group');
  const life = (f, cur, max, color = '', sh = 0, maxsh = 0) => { // (small phones drop the "/max")
    $('life').hidden = false; $('hpFill').style.width = (f * 100) + '%'; $('hpFill').style.background = color;
    $('shBar').hidden = !maxsh; if (maxsh) $('shFill').style.width = (sh / maxsh * 100) + '%'; // the Vael's shields, over the hull
    // The Vael: one figure, hull and shields together (the two bars still show which is which).
    const [c, m] = maxsh ? [cur + Math.round(sh), max + maxsh] : [cur, max];
    const t = m ? `${c}<span class="mx">/${m}</span>` : String(c); if ($('hpNum').innerHTML !== t) $('hpNum').innerHTML = t;
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
    sub.textContent = !own ? (enemies(G.me, x.team) ? 'Enemy' : 'Ally') : x.kind === 'unit' ? taskName(x) : x.done && x.research ? 'Researching' : x.done && x.queue.length ? 'Training' : bldgStatus(x);
    life(x.hp / x.maxhp, Math.ceil(x.hp), x.maxhp, '', x.sh, x.maxsh);
    if (x.kind === 'bldg' && own && !x.done) {
      module('build' + x.id, '<div class="bar build"><i></i></div>');
      mod.querySelector('i').style.width = (x.progress * 100) + '%';
    } else if (x.kind === 'bldg' && own && x.research) {
      module('res' + x.id + x.research.type + G.upgrades[x.team][x.research.type], researchModule(x));
      mod.querySelector('.res i').style.width = (x.research.prog * 100) + '%';
    } else if (x.kind === 'bldg' && own && x.d.trains?.length) { // (its slots even when idle: nothing moves as it fills)
      module('q' + x.id, '<div id="queue" class="q" role="group" aria-label="Production queue (tap a unit to cancel it)"></div>');
      renderQueue($('queue'), x, 30);
    } else if (x.kind === 'unit' || x.d.weapon) {
      const h = fightStats(x); module('f' + h, h);
    } else module('', '');
  } else {
    const counts = {}; for (const x of sel) counts[x.d.name] = (counts[x.d.name] || 0) + 1;
    name.textContent = sel.length + (sel.every(x => x.kind === 'bldg') ? ' buildings' : ' units'); $('selPor').innerHTML = ''; selKey = ''; module('', '');
    sub.textContent = Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ');
    $('life').hidden = true;
    if (compactMq.matches) { // small screens: one tile per type, with its count and the group's health
      const types = [...new Set(sel.map(x => x.type))], gk = 't' + types.join() + sel.length;
      if (grp.dataset.k !== gk) {
        grp.dataset.k = gk;
        grp.innerHTML = types.map(t => { const g = sel.filter(x => x.type === t); return `<div class="gi gt" data-t="${t}" title="${g.length} ${g[0].d.name}: tap to keep only these, hold to drop them">${portrait(g[0].kind, t, 26)}<b>${g.length}</b><i></i></div>`; }).join(''); // (units or buildings)
      }
      types.forEach((t, i) => { const g = sel.filter(x => x.type === t), f = g.reduce((a, x) => a + x.hp, 0) / g.reduce((a, x) => a + x.maxhp, 0); grp.children[i].lastChild.style.width = (f * 100) + '%'; });
      return;
    }
    const shown = sel.slice(0, 24), gk = shown.map(x => x.id).join();
    if (grp.dataset.k !== gk) { // rebuild the tiles only when the selection changes; hp bars update in place
      grp.dataset.k = gk;
      grp.innerHTML = shown.map(x => `<div class="gi" data-id="${x.id}" title="${x.d.name}: click for it alone, Shift+click to drop it">${portrait(x.kind, x.type, 26, x.team)}<b>${x.d.hot}</b><i></i></div>`).join('');
    }
    shown.forEach((x, i) => { grp.children[i].lastChild.style.width = (x.hp / x.maxhp * 100) + '%'; });
  }
}

// ---- the tile strip: narrowing a selection without the box ----
// A type tile (phones): a tap keeps only that type, a long-press drops it. A unit tile (wider screens): a click keeps
// that unit alone, Shift+click drops it (and on a touch screen a long-press drops its type).
const strip = { timer: 0, held: false };
function narrow(keep) { const next = ui.sel.filter(keep); if (next.length && next.length < ui.sel.length) { setSelection(next); updateHud(); sfx('select'); } }
function tileOf(ev) { return ev.target.closest?.('#group .gi'); }
function bindStrip() {
  const grp = $('group');
  grp.addEventListener('pointerdown', ev => {
    const tile = tileOf(ev); if (!tile) return;
    ev.stopPropagation(); clearTimeout(strip.timer); strip.held = false;
    if (ev.pointerType !== 'touch') return; // (a long-press is a finger's: a slow mouse click is still a click)
    const t = tile.dataset.t || ui.sel.find(x => String(x.id) === tile.dataset.id)?.type;
    strip.timer = setTimeout(() => { strip.held = true; narrow(x => x.type !== t); }, 450);
  });
  for (const e of ['pointerup', 'pointerleave', 'pointercancel']) grp.addEventListener(e, () => clearTimeout(strip.timer));
  grp.addEventListener('contextmenu', ev => { if (tileOf(ev)) ev.preventDefault(); });
  grp.addEventListener('click', ev => {
    const tile = tileOf(ev); if (!tile) return;
    if (strip.held) { strip.held = false; return; } // (the release after a long-press)
    if (tile.dataset.t) narrow(x => x.type === tile.dataset.t);
    else if (ev.shiftKey) narrow(x => String(x.id) !== tile.dataset.id);
    else narrow(x => String(x.id) === tile.dataset.id);
  });
}
let stripBound = false;

function taskName(u) {
  const T = u.task;
  if (u.warp > 0) return 'Warping in'; // (before any order it was given meanwhile)
  if (T.t === 'gather') return T.phase === 'return' ? 'Returning cargo' : T.phase === 'mine' ? 'Mining' : T.phase === 'wait' ? 'Waiting to mine' : 'Moving to mine';
  if (T.t === 'build') return warps(u.team) ? 'Planting' : 'Constructing'; if (T.t === 'repair') return 'Repairing'; if (T.t === 'attack') return 'Attacking'; if (T.t === 'amove') return 'Attack-moving';
  if (u.mode === 'entrench') return u.swap > 0 ? 'Digging in' : 'Entrenched'; if (u.swap > 0) return 'Packing up';
  if (T.t === 'move') return 'Moving'; if (T.t === 'hold') return 'Holding position'; if (T.t === 'flee') return 'Running for cover'; return 'Idle';
}

export const aName = (name) => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name;
/** Whether `team`'s race warps its buildings in (a worker plants a site, which then grows by itself). */
const warps = (team) => !!FACTIONS[G.factions[team]]?.warp;
/** The player's side (faction data: worker, headquarters, Build list pages). */
export const myFaction = () => FACTIONS[G.factions[G.me]] || FACTIONS.humans;
/**
 * A building's production queue in the selection console: one slot per unit it can hold, filled from the left (the
 * one in training first), the free ones as empty outlines, so the queue keeps its width; a progress bar underneath.
 * A click or tap on a unit cancels it (full refund).
 */
function renderQueue(box, b, size = 26) {
  if (!box) return;
  const q = b.queue, key = b.id + ':' + q.join();
  if (box.dataset.k !== key) {
    box.dataset.k = key; box.classList.toggle('idle', !q.length);
    box.innerHTML = '<div class="bar prod"><i></i></div>' + q.map((t, i) =>
      `<button class="qi" data-i="${i}" data-t="${t}" title="Cancel ${UNITS[t].name}${i ? '' : ' (in training)'}: full refund" aria-label="Cancel ${UNITS[t].name}${i ? '' : ' (in training)'}">${portrait('unit', t, size)}<span class="x" aria-hidden="true"></span></button>`).join('') +
      '<span class="qe" aria-hidden="true"></span>'.repeat(Math.max(0, QUEUE_MAX - q.length));
  }
  box.querySelector('.prod i').style.width = (q.length ? b.prog * 100 : 0) + '%';
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

/** A site of ours that loses its last builder says so (once): a thumb easily pulls a builder off without noticing. */
const siteHadBuilder = new Map();
function watchSites() {
  for (const b of G.bldgs) {
    if (b.team !== G.me || b.done) { siteHadBuilder.delete(b.id); continue; }
    const has = buildersOf(b).length > 0;
    if (siteHadBuilder.get(b.id) && !has && !b.planted) toast(myFaction().warp ? `${b.d.name} not planted (select it and tap Plant)` : `${b.d.name} paused: no builder (select it and tap Resume)`, true);
    siteHadBuilder.set(b.id, has);
  }
  for (const id of siteHadBuilder.keys()) if (!G.bldgs.some(b => b.id === id)) siteHadBuilder.delete(id);
}
