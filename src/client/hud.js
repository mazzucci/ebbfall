// Top bar and selection panel (the UI state is in ui.js, the command card in card.js).
import { G, UNITS, BUILDINGS, UPGRADES, UP_DMG, QUEUE_MAX, effectLevel, hasReq, canAfford, queueUnit, cancelQueue, stopUnit, holdUnit, startBuild, cancelConstruction, research, cancelResearch, dist, visibleEnt, enemies, FACTIONS, TRADE_RATE } from '../engine/index.js';
import { plural } from '../engine/util.js';
/** Harvesters repairing building `b`. */
const repairersOf = (b) => G.units.filter(u => u.task.t === 'repair' && u.task.b === b);
import { sfx } from './audio.js';
import { icon, glyph } from './icons.js';
import { portrait } from './gl/render.js';
import { $, ui, toast, playerSel, touchUi, setBox, setHint, clearMode, setSelection } from './ui.js';
import { buildCard, invalidateCard, cardItems, doCommand, holdForDetail } from './card.js';
import { myFaction, moneyDot, buildersOf, ROMAN, upName } from './cards.js';
import { builderLine, siteLine, pausedToast, PAUSED_GAP, NO_BUILDER, pct } from './construct.js';
export { myFaction, buildersOf, ROMAN }; // (the card's own helpers: cards.js)
export { invalidateCard, cardItems, doCommand }; // (the card lives in card.js)
export { $, ui, toast, playerSel, setBox, setHint, clearMode, setSelection }; // (the state lives in ui.js)

/** A few words on a building's state (the panel's bars show how far along it is): construction, research, training. */
export function bldgStatus(b) {
  if (!b.done) return siteLine(b, buildersOf(b).length > 0); // ("Constructing, 61%" or "Paused at 61%: no builder")
  if (b.research) { const u = UPGRADES[b.research.type], lv = G.upgrades[G.me][b.research.type] + 1; return 'Researching ' + upName(u, lv); }
  if (b.queue.length) return (b.d.training || 'Training') + ' ' + UNITS[b.queue[0]].name + (b.queue.length > 1 ? ' +' + (b.queue.length - 1) : '');
  if (b.team === G.me && repairersOf(b).length) return 'Repairing';
  // (a Market, raised by its side's Trade, or a Wind turbine: what it pays, in its side's money)
  if (b.d.pays && b.done) { const rate = b.d.pays * TRADE_RATE[Math.min(effectLevel(G.upgrades[b.team], 'trade'), 2)]; return `${BUILDINGS[b.type].doing} ${FACTIONS[G.factions[b.team]]?.money || 'gold'}: 1 every ${Math.round(10 / rate) / 10} s`; }
  return '';
}

let selKey = '';
/** The desktop HUD (style.css, its last block: a mouse, a window at least 1100 x 560 px) and its unit of size (`--u`
 *  there: 1 px at 1440 x 810, 0.9 to 1.4). */
const deskMq = matchMedia('(min-width: 1100px) and (min-height: 560px) and (pointer: fine)');
const hudU = () => Math.max(0.9, Math.min(1.4, innerWidth / 1440, innerHeight / 810));
/** A portrait's size (CSS px): `base`, or `big` units on the desktop HUD. */
const porSize = (base, big) => (deskMq.matches ? Math.round(big * hudU()) : base);

export function updateHud() {
  // Placing with no worker of ours selected (it died): nothing would build it, and a touch card would have no Cancel.
  if (ui.place && !playerSel().some(e => e.kind === 'unit' && e.d.worker)) clearMode();
  if (ui.place) setHint(); // (the ghost has moved: why a red spot is refused)
  topBar();
  watchSites();
  ui.sel = ui.sel.filter(x => !x.dead && (x.kind === 'node' || x.team === G.me || !enemies(G.me, x.team) || x.ghost || visibleEnt(x))); // (an enemy that slips out of sight is let go; a remembered building, picked in the fog, stays; a field stays)
  renderSelection();
  buildCard();
}

/** The top bar's figures: the Kingdom's gold and population, or the Expedition's energy (a bolt) and grid. A figure at
 *  its cap pulses. */
function topBar() {
  const [s] = G.res[G.me], [su, sc] = G.sup[G.me], ex = !!myFaction().grid;
  const put = (id, v) => { const e = $(id); if (e.textContent !== v) e.textContent = v; };
  put('rShard', String(s)); put('rSupply', su + '/' + sc); put('lSupply', ex ? 'GRID' : 'POP');
  const title = ex ? 'Grid' : 'Population'; if ($('resSup').title !== title) $('resSup').title = title;
  const money = ex ? 'Energy' : 'Gold'; if ($('resShard').title !== money) { $('resShard').title = money; $('resShard').querySelector('.dot').className = moneyDot(); }
  $('resSup').classList.toggle('low', su + (UNITS[myFaction().worker]?.supply || 1) > sc); // (full: not even a worker fits, the smallest a side trains)
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
  if (x.d.heal) h += stat('heal', x.d.heal, 0, x.d.mend ? 'Mends shields, then hull (per second)' : 'Heals infantry (per second)');
  h += stat('armor', x.d.armor || 0, x.kind === 'unit' ? effectLevel(up, 'armor') : 0, 'Armor');
  return h;
}

/** The research a building is doing: the upgrade, its level (pips for I-III; a one-level tech has none) and a bar. */
function researchModule(b) {
  const k = b.research.type, u = UPGRADES[k], lv = G.upgrades[b.team][k] + 1, name = upName(u, lv);
  const pips = u.levels > 1 ? `<span class="pips">${Array.from({ length: u.levels }, (_, j) => j + 1).map(i => `<i class="${i < lv ? 'done' : i === lv ? 'now' : ''}"></i>`).join('')}</span>` : '';
  const shown = u.level_names?.[lv - 1] ? upName(u, lv) : u.levels > 1 ? `${u.name} <b>${ROMAN[lv]}</b>` : u.name;
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
    $('shBar').hidden = !maxsh; if (maxsh) $('shFill').style.width = (sh / maxsh * 100) + '%'; // shields, over the hull (none since the re-theme)
    // A shielded unit: one figure, hull and shields together (the two bars still show which is which).
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
    // A gold mine: what is left and who works it.
    const n = sel[0];
    const ore = myFaction().ore || 'gold';
    named(ore[0].toUpperCase() + ore.slice(1) + ' mine');
    const ps = porSize(44, 76); if (selKey !== 'node' + n.id + ps) { selKey = 'node' + n.id + ps; $('selPor').innerHTML = portrait('node', n.type, ps); }
    sub.textContent = n.amount > 0 ? `${n.amount} ${ore} left` : `Empty: no ${ore} left`;
    life(n.max ? n.amount / n.max : 0, n.amount, 0, 'var(--gold)');
    // (our own miners inside it now, of the most our workers fit: "Miners 5 / 8"; the arc's UPDATE 6)
    const inside = G.units.filter(u => u.team === G.me && u.inside && u.task.node === n).length, cap = UNITS[myFaction().worker].mineCap;
    module('node' + inside, `<span class="st" title="Miners inside it now, of the most it fits" aria-label="Miners ${inside} of ${cap}">${portrait('unit', myFaction().worker, 22)}<b>Miners ${inside} / ${cap}</b></span>`);
  } else if (sel.length === 1) {
    const x = sel[0], own = x.team === G.me;
    named(x.d.name);
    const ps = porSize(44, 76); if (selKey !== 'one' + x.id + ps) { selKey = 'one' + x.id + ps; $('selPor').innerHTML = portrait(x.kind, x.type, ps, x.team); }
    // (research and training: the module below names what and shows how far)
    sub.textContent = !own ? (enemies(G.me, x.team) ? 'Enemy' : 'Ally') : x.kind === 'unit' ? taskName(x) : x.done && x.research ? (x.d.trains?.length ? bldgStatus(x) : 'Researching') : x.done && x.queue.length ? x.d.training || 'Training' : bldgStatus(x);
    // (construction's words carry a percentage: they keep their room, the name gives way first)
    sub.classList.toggle('keep', own && (x.kind === 'unit' ? x.task.t === 'build' : !x.done));
    life(x.hp / x.maxhp, Math.ceil(x.hp), x.maxhp, '', x.sh, x.maxsh);
    if (x.kind === 'bldg' && own && !x.done) {
      // (the percentage beside the bar shows only where the words above are hidden: small phones)
      module('build' + x.id, '<div class="bar build"><i></i></div><span class="pct" aria-hidden="true"></span>');
      mod.querySelector('i').style.width = (x.progress * 100) + '%';
      const p = pct(x.progress) + '%', el = mod.querySelector('.pct'); if (el.textContent !== p) el.textContent = p;
    } else if (x.kind === 'bldg' && own && x.d.trains?.length && !x.queue.length && !x.research) {
      module('', ''); // (idle: no empty slots; the room is its line's, under the health bar (Stelian, Nov 11))
    } else if (x.kind === 'bldg' && own && x.d.trains?.length) {
      // Its slots while it trains or researches. A factory that also researches keeps a tile beside them for its
      // research (empty room when there is none), so a research starting or ending moves nothing either.
      const rs = x.d.researches?.length ? '<div id="qres" class="rq"></div>' : '';
      module('q' + x.id, '<div id="queue" class="q" role="group" aria-label="Production queue (tap a unit to cancel it)"></div>' + rs);
      renderQueue($('queue'), x);
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
    // The tiles in kind order (the roster's: Guards before Archers, units before buildings), then by id: a mixed group
    // reads as runs of a type, and a tile keeps its place while the selection stands. Each tile's sprite is cut to its
    // own box (`portrait` with `box`), and its bar takes the world's health colors (`data-h`: mid under 60%, low under 30%).
    const sorted = sel.slice().sort(byKind);
    const bar = (tile, f) => { tile.lastChild.style.width = (f * 100) + '%'; const h = f > 0.6 ? '' : f > 0.3 ? 'mid' : 'low'; if (tile.dataset.h !== h) tile.dataset.h = h; };
    if (compactMq.matches) { // small screens: one tile per type, with its count and the group's health
      const types = [...new Set(sorted.map(x => x.type))], gk = 't' + types.join() + sel.length;
      if (grp.dataset.k !== gk) {
        grp.dataset.k = gk;
        grp.innerHTML = types.map(t => { const g = sorted.filter(x => x.type === t); return `<div class="gi gt" data-t="${t}" title="${g.length} ${g[0].d.name}: tap to keep only these, hold to drop them">${portrait(g[0].kind, t, 28, G.me, true)}<b>${g.length}</b><i></i></div>`; }).join(''); // (units or buildings)
      }
      types.forEach((t, i) => { const g = sorted.filter(x => x.type === t); bar(grp.children[i], g.reduce((a, x) => a + x.hp, 0) / g.reduce((a, x) => a + x.maxhp, 0)); });
      return;
    }
    const ts = porSize(28, 42), shown = sorted.slice(0, 24), gk = shown.map(x => x.id).join() + ':' + ts;
    if (grp.dataset.k !== gk) { // rebuild the tiles only when the selection changes; hp bars update in place
      grp.dataset.k = gk;
      grp.innerHTML = shown.map(x => `<div class="gi" data-id="${x.id}" title="${x.d.name}: click for it alone, Shift+click to drop it">${portrait(x.kind, x.type, ts, x.team, true)}<b>${x.d.hot}</b><i></i></div>`).join('');
    }
    shown.forEach((x, i) => bar(grp.children[i], x.hp / x.maxhp));
  }
}
/** The roster's order of kinds (units, then buildings, as the sim numbers them), for the group grid's tiles. */
const KIND_ORDER = new Map([...Object.keys(UNITS), ...Object.keys(BUILDINGS)].map((k, i) => [k, i]));
const byKind = (a, b) => (KIND_ORDER.get(a.type) ?? 1e9) - (KIND_ORDER.get(b.type) ?? 1e9) || a.id - b.id;

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
  // (an own site nobody builds: "No builder" in its kind's place, under "Paused at 61%")
  const paused = one?.kind === 'bldg' && one.team === G.me && !one.done && !buildersOf(one).length;
  const what = $('selWhat'), text = paused ? NO_BUILDER : one?.d.what || '', key = (one ? one.id : '') + '|' + text + '|' + modKey + '|' + innerWidth + 'x' + innerHeight;
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
  if (T.t === 'build') return builderLine(T.b); // ("Constructing Barracks, 61%") if (T.t === 'repair') return 'Repairing'; if (T.t === 'attack') return 'Attacking'; if (T.t === 'amove') return 'Attack-moving';
  if (u.swap > 0) return 'Packing up';
  if (T.t === 'move') return 'Moving'; if (T.t === 'hold') return 'Holding position'; if (T.t === 'flee') return 'Running for cover'; return 'Idle';
}

export const aName = (name) => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name;
/** The time a unit in training still needs, as the queue's first slot shows it: "42s", or "1:42" from a minute up. */
export function timeLeft(b) {
  const s = b.queue.length ? Math.max(0, Math.ceil((1 - b.prog) * UNITS[b.queue[0]].build)) : 0;
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}
/**
 * A building's production queue in the selection console: one slot per unit it can hold, filled from the left with
 * the symbol of the button that queued it (symbols for what is ordered, sprites for what exists) (the
 * one in training first, the time it still needs on it: a slow one, the Android's two minutes, never looks stuck),
 * the free ones as empty outlines, so the queue keeps its width; a progress bar underneath.
 * A click or tap on a unit cancels it (full refund).
 */
function renderQueue(box, b) {
  if (!box) return;
  const q = b.queue, key = b.id + ':' + q.join();
  const now = b.d.training ? ` (${b.d.training.toLowerCase()})` : ' (in training)'; // (the Portal: teleporting)
  if (box.dataset.k !== key) {
    box.dataset.k = key; box.classList.toggle('idle', !q.length);
    box.innerHTML = '<div class="bar prod"><i></i></div>' + q.map((t, i) =>
      `<button class="qi" data-i="${i}" data-t="${t}" title="Cancel ${UNITS[t].name}${i ? '' : now}: full refund" aria-label="Cancel ${UNITS[t].name}${i ? '' : now}">${glyph(t)}<span class="x" aria-hidden="true"></span>${i ? '' : '<span class="left" aria-hidden="true"></span>'}</button>`).join('') +
      '<span class="qe" aria-hidden="true"></span>'.repeat(Math.max(0, QUEUE_MAX - q.length));
  }
  box.querySelector('.prod i').style.width = (q.length ? b.prog * 100 : 0) + '%';
  const left = box.querySelector('.qi .left');
  if (left) { const t = timeLeft(b); if (left.textContent !== t) left.textContent = t; }
}
/** The research of a building that also trains, beside its queue (a slim line over it on small phones): the tech's
 *  icon and its own bar, the name in the tooltip (and in the few words above, where there is room). Cancelled from
 *  the card, like any research. */
function renderQueueResearch(box, b) {
  const r = b.research, key = r ? r.type + G.upgrades[b.team][r.type] : '';
  if (box.dataset.k !== key) {
    box.dataset.k = key; box.classList.toggle('idle', !r);
    const u = r && UPGRADES[r.type], lv = r && G.upgrades[b.team][r.type] + 1, name = r ? upName(u, lv) : '';
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

/** A site of ours that loses its last builder says so ("Barracks paused at 90%"): a thumb easily pulls a builder off
 *  without noticing. At most once a site a minute (game time), no confirm step. */
const siteHadBuilder = new Map(), pausedSaid = new Map();
function watchSites() {
  for (const b of G.bldgs) {
    if (b.team !== G.me || b.done) { siteHadBuilder.delete(b.id); pausedSaid.delete(b.id); continue; }
    const has = buildersOf(b).length > 0;
    if (siteHadBuilder.get(b.id) && !has && !(G.time - (pausedSaid.get(b.id) ?? -Infinity) < PAUSED_GAP)) { toast(pausedToast(b), true, false, 'paused'); pausedSaid.set(b.id, G.time); }
    siteHadBuilder.set(b.id, has);
  }
  for (const id of siteHadBuilder.keys()) if (!G.bldgs.some(b => b.id === id)) { siteHadBuilder.delete(id); pausedSaid.delete(id); }
}
