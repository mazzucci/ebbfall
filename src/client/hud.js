// Top bar and selection panel (the UI state is in ui.js, the command card in card.js).
import { shownBldgs } from './memory.js';
import { G, UNITS, BUILDINGS, UPGRADES, UP_DMG, QUEUE_MAX, effectLevel, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, research, cancelResearch, dist, visibleEnt, enemies } from '../engine/index.js';
import { plural } from '../engine/util.js';
/** Harvesters repairing building `b`. */
const repairersOf = (b) => G.units.filter(u => u.task.t === 'repair' && u.task.b === b);
import { sfx } from './audio.js';
import { icon } from './icons.js';
import { portrait } from './gl/render.js';
import { $, ui, toast, playerSel, touchUi, setBox, setHint, clearMode, setSelection } from './ui.js';
import { buildCard, invalidateCard, cardItems, doCommand, holdForDetail } from './card.js';
import { myFaction, buildersOf, ROMAN } from './cards.js';
export { myFaction, buildersOf, ROMAN }; // (the card's own helpers: cards.js)
export { invalidateCard, cardItems, doCommand }; // (the card lives in card.js)
export { $, ui, toast, playerSel, setBox, setHint, clearMode, setSelection }; // (the state lives in ui.js)

/** A few words on a building's state (the panel's bars show how far along it is): construction, research, training. */
export function bldgStatus(b) {
  if (!b.done) return buildersOf(b).length ? 'Constructing' : 'Paused: no builder';
  if (b.research) { const u = UPGRADES[b.research.type], lv = G.upgrades[G.me][b.research.type] + 1; return 'Researching ' + u.name + (u.levels > 1 ? ' ' + ROMAN[lv] : ''); }
  if (b.queue.length) return 'Training ' + UNITS[b.queue[0]].name + (b.queue.length > 1 ? ' +' + (b.queue.length - 1) : '');
  if (b.team === G.me && repairersOf(b).length) return 'Repairing';
  if (b.d.pays && b.done) return `${BUILDINGS[b.type].doing} gold: 1 every 2 s`;
  return '';
}

let selKey = '';

export function updateHud() {
  // Placing with no worker of ours selected (it died): nothing would build it, and a touch card would have no Cancel.
  if (ui.place && !playerSel().some(e => e.kind === 'unit' && e.d.worker)) clearMode();
  const [s] = G.res[G.me], [su, sc] = G.sup[G.me];
  $('rShard').textContent = s; $('rSupply').textContent = su + '/' + sc;
  $('resSup').classList.toggle('low', su >= sc);
  watchSites();
  ui.sel = ui.sel.filter(x => !x.dead && (x.kind === 'node' || x.team === G.me || !enemies(G.me, x.team) || x.ghost || visibleEnt(x))); // (an enemy that slips out of sight is let go; a remembered building, picked in the fog, stays; a field stays)
  renderSelection();
  buildCard();
}

/** A figure in the panel: an icon, the base value and, in gold, what upgrades add. */
const stat = (ico, v, bonus, title) => `<span class="st" title="${title}" aria-label="${title}: ${v}${bonus ? ' plus ' + bonus : ''}">${icon(ico)}<b>${v}</b>${bonus ? `<em>+${bonus}</em>` : ''}</span>`;
/** What a unit or turret can do in a fight, in as few numbers as possible: damage (ground, air) and armor. */
function fightStats(x) {
  const up = G.upgrades[x.team], bonus = (UP_DMG[x.type] || 0) * effectLevel(up, 'weapons');
  let h = '';
  const wp = x.d.weapon, light = x.d.light;
  if (light) { // a siege gun: both guns, the one it fires now first (Deployed, or the light gun on its tracks)
    const guns = [[wp, bonus, 'Settled: splash gun damage against ground'], [light, (light.upDmg || 0) * effectLevel(up, 'weapons'), 'On the move: light gun damage against ground']];
    for (const [g, b, t] of x.mode ? guns : guns.reverse()) h += stat('dmg', g.dmg, b, t);
  } else if (wp?.dmg && !x.d.worker) h += stat('dmg', wp.dmg, bonus, 'Damage against ground');
  if (wp?.dmgAir) h += stat('air', wp.dmgAir, bonus, 'Damage against flyers');
  if (x.d.heal) h += stat('heal', x.d.heal, 0, x.d.mend ? 'Mends nacre, then hull (per second)' : 'Heals infantry (per second)');
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
 * the production queue (a factory's research beside it), construction, or the tiles of a group). Rebuilt only when
 * what it shows changes, so its buttons survive between frames; bars and numbers update in place. */
function renderSelection() {
  if (!stripBound) { stripBound = true; bindStrip(); bindPortrait(); }
  const sel = ui.sel, info = $('info'), name = $('selName'), sub = $('selSub'), mod = $('mod'), grp = $('group');
  const life = (f, cur, max, color = '', sh = 0, maxsh = 0) => { // (small phones drop the "/max")
    $('life').hidden = false; $('hpFill').style.width = (f * 100) + '%'; $('hpFill').style.background = color;
    $('shBar').hidden = !maxsh; if (maxsh) $('shFill').style.width = (sh / maxsh * 100) + '%'; // the Vael's shields, over the hull
    // The Vael: one figure, hull and shields together (the two bars still show which is which).
    const [c, m] = maxsh ? [cur + Math.round(sh), max + maxsh] : [cur, max];
    const t = m ? `${c}<span class="mx">/${m}</span>` : String(c); if ($('hpNum').innerHTML !== t) $('hpNum').innerHTML = t;
  };
  // The name, and in its title in full (on the narrowest console a very long one may end in an ellipsis).
  const named = (t) => { if (name.textContent !== t) name.textContent = t; if (name.title !== t) name.title = t; };
  const module = (key, html) => { if (modKey !== key) { modKey = key; mod.innerHTML = html; } };
  info.classList.toggle('empty', !sel.length); grp.hidden = sel.length < 2;
  // What one unit or building is for: a short line under its health bar (`what`) where it fits whole, else none; its
  // full description on the portrait (hover, or a long press). Measured again only when what it holds or the room
  // changes (the selection, the module, the window): the line is tried, and gives way if it is cut.
  const one = sel.length === 1 && sel[0].kind !== 'node' ? sel[0] : null;
  if (!one) whatLine(info, null); // (one unit or building: once its module is in place, below)
  if (!sel.length) {
    named('Nothing selected'); sub.textContent = touchUi ? 'Tap a unit or a building' : 'Click a unit or drag a box'; $('life').hidden = true; $('selPor').innerHTML = ''; selKey = '';
    module('', ''); grp.innerHTML = ''; grp.dataset.k = '';
  } else if (sel.length === 1 && sel[0].kind === 'node') {
    // A gold mine (what is left and who works it), or a mine shaft (none since the re-theme: an Excavator or a Siphon on
    // it digs by itself; who holds a shaft: what this side may see of it, an enemy's as last seen: memory.js)
    const n = sel[0], seep = n.type === 'ether', on = seep && shownBldgs().find(b => b.vent === n), rig = on ? BUILDINGS[on.type] : BUILDINGS[myFaction().market];
    named(seep ? 'Gold seam' : 'Gold mine');
    if (selKey !== 'node' + n.id) { selKey = 'node' + n.id; $('selPor').innerHTML = portrait('node', n.type, 44); }
    sub.textContent = seep ? (on ? `${aName(rig.name).replace(/^a/, 'A')} ${rig.verb} gold here by itself` : `Build ${aName(rig.name)} on it: it ${rig.verb} gold by itself`) : n.amount > 0 ? `${n.amount} gold left` : 'Empty: no gold left';
    if (seep) $('life').hidden = true; else life(n.max ? n.amount / n.max : 0, n.amount, 0, 'var(--shard)');
    const working = G.units.filter(u => u.team === G.me && u.task.t === 'gather' && u.task.node === n).length; // inside, waiting, and coming and going
    module('node' + working, `<span class="st" title="${plural(UNITS[myFaction().worker].name)} working it" aria-label="${plural(UNITS[myFaction().worker].name)} working it: ${working}">${portrait('unit', myFaction().worker, 22)}<b>${working}</b></span>`);
  } else if (sel.length === 1) {
    const x = sel[0], own = x.team === G.me;
    named(x.d.name);
    if (selKey !== 'one' + x.id) { selKey = 'one' + x.id; $('selPor').innerHTML = portrait(x.kind, x.type, 44, x.team); }
    // (research and training: the module below names what and shows how far)
    sub.textContent = !own ? (enemies(G.me, x.team) ? 'Enemy' : 'Ally') : x.kind === 'unit' ? taskName(x) : x.done && x.research ? (x.d.trains?.length ? bldgStatus(x) : 'Researching') : x.done && x.queue.length ? 'Training' : bldgStatus(x);
    life(x.hp / x.maxhp, Math.ceil(x.hp), x.maxhp, '', x.sh, x.maxsh);
    if (x.kind === 'bldg' && own && !x.done) {
      module('build' + x.id, '<div class="bar build"><i></i></div>');
      mod.querySelector('i').style.width = (x.progress * 100) + '%';
    } else if (x.kind === 'bldg' && own && x.d.trains?.length && !x.queue.length && !x.research) {
      module('', ''); // (idle: no empty slots; the room is its line's, under the health bar (Stelian, Nov 11))
    } else if (x.kind === 'bldg' && own && x.d.trains?.length) {
      // Its slots while it trains or researches. A factory that also researches keeps a tile beside them for its
      // research (empty room when there is none), so a research starting or ending moves nothing either.
      const rs = x.d.researches?.length ? '<div id="qres" class="rq"></div>' : '';
      module('q' + x.id, '<div id="queue" class="q" role="group" aria-label="Production queue (tap a unit to cancel it)"></div>' + rs);
      renderQueue($('queue'), x, 30);
      if (rs) renderQueueResearch($('qres'), x);
    } else if (x.kind === 'bldg' && own && x.research) {
      module('res' + x.id + x.research.type + G.upgrades[x.team][x.research.type], researchModule(x));
      mod.querySelector('.res i').style.width = (x.research.prog * 100) + '%';
    } else if (x.kind === 'unit' || x.d.weapon) {
      const h = fightStats(x); module('f' + h, h);
    } else module('', '');
    whatLine(info, x);
  } else {
    const counts = {}; for (const x of sel) counts[x.d.name] = (counts[x.d.name] || 0) + 1;
    named(sel.length + (sel.every(x => x.kind === 'bldg') ? ' buildings' : ' units')); $('selPor').innerHTML = ''; selKey = ''; module('', '');
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
let whatFit = '';
/** The kind's line for `one` (null: none), measured again only when what it holds or the room changes (the selection,
 *  its module, the window). */
function whatLine(info, one) {
  const what = $('selWhat'), text = one?.d.what || '', key = (one ? one.id : '') + '|' + modKey + '|' + innerWidth + 'x' + innerHeight;
  if (what.textContent !== text) what.textContent = text;
  if (key !== whatFit) { whatFit = key; fitWhat(info, what); }
  portraitTip(one);
}
/** Shows the kind's line if it fits whole (no cut word, nothing pushed out of the console), else hides it. */
function fitWhat(info, what) {
  info.classList.remove('nowhat');
  info.classList.toggle('nowhat', !!what.textContent && (what.scrollWidth > what.clientWidth + 1 || info.scrollHeight > info.clientHeight + 1));
}
/** The full description of one selected unit or building: hover on the portrait with a mouse (its title, as a command
 *  button's), a long press on a touch screen (the command card's details panel, card.js). */
function portraitTip(one) {
  const por = $('selPor'), t = one ? `${one.d.name}: ${one.d.desc}` : '';
  if (por.title !== t) por.title = t;
}
let porBound = false;
function bindPortrait() {
  if (porBound) return; porBound = true;
  holdForDetail($('selPor'), () => { const one = ui.sel.length === 1 && ui.sel[0].kind !== 'node' ? ui.sel[0] : null; return one && { id: '@por', label: one.d.name, tip: one.d.desc }; }, $('info'));
}

function taskName(u) {
  const T = u.task;
  if (u.mode === 'deploy') return u.swap > 0 ? 'Deploying' : 'Deployed'; // (firing or not: a deployed tank shells what it can)
  if (T.t === 'gather') return T.phase === 'return' ? 'Returning cargo' : T.phase === 'mine' ? 'Mining' : T.phase === 'wait' ? 'Waiting to mine' : 'Moving to mine';
  if (T.t === 'build') return 'Constructing'; if (T.t === 'repair') return 'Repairing'; if (T.t === 'attack') return 'Attacking'; if (T.t === 'amove') return 'Attack-moving';
  if (u.swap > 0) return 'Packing up';
  if (T.t === 'move') return 'Moving'; if (T.t === 'hold') return 'Holding position'; if (T.t === 'flee') return 'Running for cover'; return 'Idle';
}

export const aName = (name) => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name;
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
/** The research of a building that also trains, beside its queue (a slim line over it on small phones): the tech's
 *  icon and its own bar, the name in the tooltip (and in the few words above, where there is room). Cancelled from
 *  the card, like any research. */
function renderQueueResearch(box, b) {
  const r = b.research, key = r ? r.type + G.upgrades[b.team][r.type] : '';
  if (box.dataset.k !== key) {
    box.dataset.k = key; box.classList.toggle('idle', !r);
    const u = r && UPGRADES[r.type], lv = r && G.upgrades[b.team][r.type] + 1, name = r ? u.name + (u.levels > 1 ? ' ' + ROMAN[lv] : '') : '';
    box.title = r ? 'Researching ' + name : ''; box.setAttribute('aria-label', box.title);
    box.innerHTML = (r ? icon(r.type) : '<span class="ico"></span>') + '<div class="bar res"><i></i></div>';
  }
  box.querySelector('.res i').style.width = (r ? r.prog * 100 : 0) + '%';
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
    if (siteHadBuilder.get(b.id) && !has) toast(`${b.d.name} paused: no builder (select it and tap Resume)`, true);
    siteHadBuilder.set(b.id, has);
  }
  for (const id of siteHadBuilder.keys()) if (!G.bldgs.some(b => b.id === id)) siteHadBuilder.delete(id);
}
