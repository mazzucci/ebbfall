// What the command card holds for the selection: its buttons in fixed slots, each with its key (the controls scheme's:
// controls.js). Pure state, no DOM (card.js draws the buttons; test/cards.test.js reads every card the game can show).
import { G, UNITS, BUILDINGS, UPGRADES, ABILITIES, FACTIONS, hasReq, canAfford, unlockOf, upgradeDesc, poolMax, liveGame } from '../engine/index.js';
import { ui, playerSel, armedButton } from './ui.js';
import { keyed } from './controls.js';

/** The player's side (faction data: worker, headquarters, Build list pages). */
export const myFaction = () => FACTIONS[G.factions[G.me]] || FACTIONS.humans;
/** Mine's icon, by the selected workers' people: the Expedition's Bots drill the gold, the Kingdom's Villagers swing a pickaxe. */
const mineIcon = (units) => (units.some(u => u.d.worker && u.type === FACTIONS.vael.worker) ? 'gatherDrill' : 'gather');
/** Harvesters currently working on building b. */
export const buildersOf = (b) => G.units.filter(u => u.task.t === 'build' && u.task.b === b);
export const ROMAN = ['', 'I', 'II', 'III'];
/** A research's name at `lv` (1..3): its level's own name if it has one (the Kingdom's Trade), else its name and the
 *  level's numeral; `short`: the button's. */
export const upName = (u, lv, short = false) => {
  const own = (u.level_names || [])[lv - 1];
  if (own) return own[short ? 1 : 0];
  return (short && u.short || u.name) + (u.levels > 1 ? ' ' + ROMAN[lv] : '');
};

/**
 * The command card: three buttons a row (big enough for a thumb), fixed slots (slot = row * 3 + column) so a command
 * keeps its place. No Stop or Move buttons: a tap on the ground moves, Hold stops (their keys still work: `hidden`
 * items have a key but no button). Units have Deselect in the last slot; a building or field is let go with a tap on
 * the ground. An armed order's own button
 * turns into its Cancel, so the card never grows a row. The Build list has a basic and an advanced page.
 */
const COLS = 3;
/** The fixed slots (Stelian, Nov 12: an action never shifts): Back on a Build page and the queue's Cancel in the
 *  bottom-right corner, Rally in the middle of the second row on every building that has it. */
const CORNER = 5, RALLY = 4;
/** Where a building's researches start: after the top row when it trains (its units have that row: three at most),
 *  else in the first slot. */
const researchFrom = (trains) => (trains ? COLS : 0);

/** The Build pages' slots this game (Stelian, Nov 12): a building keeps the slot it was first shown in and a newly
 *  opened one takes the first free slot, so nothing on a page ever moves (one that closes again leaves its slot
 *  empty, and gets it back when it opens). Per seat and page, forgotten when a new game starts (a new WASM game). */
const pages = { game: null, slots: new Map() };
function pageSlots(page) {
  if (pages.game !== liveGame()) { pages.game = liveGame(); pages.slots.clear(); }
  const k = G.me + ':' + page;
  if (!pages.slots.has(k)) pages.slots.set(k, new Map());
  return pages.slots.get(k);
}
/** Button `id`'s slot on a Build page (`slots`: its memory): the one it had, else the first free one but Back's. */
function pageSlot(slots, id) {
  if (!slots.has(id)) {
    const taken = new Set(slots.values());
    let s = 0;
    while (s === CORNER || taken.has(s)) s++;
    slots.set(id, s);
  }
  return slots.get(id);
}
/** Whether unit `u` could use ability `k` now (it has it, it is ready, it is not settling in or packing up). */
function canUse(u, k) {
  const slot = (UNITS[u.type].abilities || []).indexOf(k);
  return slot >= 0 && u.abCd[slot] <= 0 && u.swap <= 0; // (a cost it cannot pay is refused by the sim, with a toast)
}
/** The selection's abilities, one button each (in table order), packed (`pos`: its place among those shown): one
 *  still waiting for its tech is left out (its key does nothing), so players find it once researched. Grayed while none
 *  of its units can use it. No countdowns: a button comes back when it is ready. An automatic ability (Deploy) has no
 *  button. */
function abilityItems(units) {
  return Object.keys(ABILITIES).filter(k => !ABILITIES[k].auto && units.some(u => (UNITS[u.type].abilities || []).includes(k))).map((k) => {
    const a = ABILITIES[k], have = units.filter(u => UNITS[u.type].abilities.includes(k)), tech = unlockOf(k);
    if (tech && !G.upgrades[G.me][tech]) return null; // (waiting for its tech: hidden)
    return { id: 'a_' + k, label: a.name, key: a.hot, icon: k, dis: !have.some(u => canUse(u, k)), tip: a.desc };
  }).filter(Boolean).map((it, pos) => ({ ...it, pos }));
}

/** Why the sim would refuse unit `t` for want of places now (its words, crates/endfall-sim/src/world/orders.rs
 *  `pool_full`), or '' when there is room: the button's tooltip says it before the tap does. */
export function placesTip(t) {
  const d = UNITS[t], f = myFaction();
  const [used, cap] = (d.pool === 'hired' ? G.hired : G.sup)[G.me] || [0, 0];
  if (used + (d.supply || 0) <= cap) return '';
  const max = cap >= poolMax(d.pool); // (each pool's own maximum: the Expedition's Power and hired places apart)
  if (d.pool === 'hired') return max ? 'Hired at maximum.' : 'No free places: build another Recruiting post.';
  if (f.power) return max ? 'Power at maximum.' : `Not enough Power: build a ${BUILDINGS[f.supply].name}.`;
  return '';
}

/** A building's requirement depth: 0 with none, 1 when it needs a building with none, and so on. */
const depth = (k) => {
  const d = BUILDINGS[k];
  return d.req ? 1 + depth(d.req) : 0;
};
/** The Build list's two pages for side `f`: the sim's lists, with every defense (a building that fights and trains
 *  nothing: the Watchtower, the Sentry mast) on the basic page, after its own buildings, so it opens there before
 *  Advanced (Stelian, Nov 13). A fixed layout: a defense is on the basic page from the start of a game. */
export function buildPages(f) {
  const defense = (k) => !!BUILDINGS[k].weapon && !BUILDINGS[k].trains?.length;
  return { basic: [...f.buildBasic.filter(k => !defense(k)), ...[...f.buildBasic, ...f.buildAdvanced].filter(defense)], advanced: f.buildAdvanced.filter(k => !defense(k)) };
}
/** A Build list page in the order its buildings unlock: by requirement depth, the page's own order breaking ties. */
const byUnlock = (page) => page.map((k, i) => [k, i, depth(k)]).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map(([k]) => k);

export function cardItems() {
  const sel = playerSel();
  if (!sel.length) return []; // a field or an enemy: nothing to command
  const units = sel.filter(x => x.kind === 'unit'), bl = sel.filter(x => x.kind === 'bldg'); const items = [];
  const at = (slot, it) => { while (items.some(i => i.slot === slot)) slot++; it.slot = slot; items.push(it); }; // never two in a slot
  // Packing (Stelian, Nov 11 and 12): buttons of a type (units, researches, orders, abilities) go from their first free
  // slot, with no gap among them; the actions (Back, Rally, Deselect, a Cancel) keep their own slot, never shifted.
  const next = (it) => at(0, it);
  const hidden = (it) => items.push({ ...it, hidden: true, slot: -1 });
  const bldgItem = (k) => {
    const d = BUILDINGS[k];
    return { id: 'b_' + k, label: d.short || d.name.split(' ').pop(), key: d.hot, cost: d.cost, por: ['bldg', k], tip: d.desc };
  };
  // What its requirement does not allow yet is left out and its key does nothing (owner, 2026-11-03: players find the
  // tech tree out as it opens); the open ones take the first free slots, in the order they unlock when several open at
  // once (Stelian, Nov 11: no empty slots), and keep them for the game (Nov 12: a newly opened building is appended and
  // never moves the others).
  const open = (k) => hasReq(G.me, k);
  const back = { id: 'esc', label: 'Back', key: 'Esc', cancel: true, icon: 'back' };
  if (units.length && (ui.mode === 'build' || ui.mode === 'build2')) {
    const { basic, advanced } = buildPages(myFaction()), adv = ui.mode === 'build2', page = adv ? advanced : basic, slots = pageSlots(adv ? 'build2' : 'build');
    const kept = (it) => at(pageSlot(slots, it.id), it);
    at(CORNER, adv ? { ...back, id: 'build1' } : back); // (Back first: it keeps the bottom-right slot on both pages)
    byUnlock(page).filter(open).forEach(k => kept(bldgItem(k)));
    (adv ? basic : advanced).filter(open).forEach(k => hidden(bldgItem(k))); // B then K still builds a Workshop from the keyboard
    // Advanced only once something on it can be built (the Barracks or the Recruiting post stands), in the first free
    // slot then (after the basic page's four: slot 4, the second row's middle; the defense opens with it and comes first).
    if (!adv && advanced.some(open)) kept({ id: 'build2', label: 'Advanced', key: 'V', icon: 'advanced', tip: advanced.filter(open).map(k => BUILDINGS[k].name).join(', ') });
  } else if (units.length) {
    const workers = units.some(u => u.d.worker), onlyWorkers = units.every(u => u.d.worker);
    const canShoot = units.some(u => u.d.weapon); // (no Attack for an Observer or Medics)
    const orders = [...(canShoot ? [{ id: 'attack', label: 'Attack', key: 'A', icon: 'attack' }] : []), { id: 'hold', label: 'Hold', key: 'H', icon: 'hold' }];
    const work = [{ id: 'build', label: 'Build', key: 'B', icon: 'build' }, { id: 'gather', label: 'Mine', key: 'G', icon: mineIcon(units), tip: 'Then tap a gold mine: they dig its gold and carry it home.' }, { id: 'repair', label: 'Repair', key: 'R', icon: 'repair', tip: 'Then tap a damaged building. Costs a share of its price as it heals.' }].filter(it => it.id !== 'repair' || myFaction().repairs); // (both peoples repair buildings now; kept for one that does not)
    const abilities = abilityItems(units);
    // Every button ability the selection has, hidden ones too: the room they take, so the card keeps its shape (Deselect
    // in its place) when a tech lands.
    const span = Object.keys(ABILITIES).filter(k => !ABILITIES[k].auto && units.some(u => (UNITS[u.type].abilities || []).includes(k))).length;
    if (onlyWorkers) { work.forEach(next); orders.forEach(next); abilities.forEach(next); }
    else {
      orders.forEach(next); abilities.forEach(next); // (the orders, then the abilities shown, packed)
      // Workers in an army: after them. Where the army's abilities need the room (the card keeps its three rows), Build
      // stays and Mine and Repair give way (their keys still work in CLASSIC; a tap on a field or a damaged
      // building still gathers or repairs).
      const room = COLS * 3 - 1 - orders.length - span; // (the last slot: Deselect)
      if (workers) work.forEach((it, i) => i < Math.max(1, room) ? next(it) : hidden(it));
    }
    // Let go of units (a tap on the ground would move them): the last slot of the card.
    at(Math.ceil((Math.max(orders.length + span - 1, ...items.map(i => i.slot)) + 2) / COLS) * COLS - 1, { id: 'deselect', label: 'Deselect', key: 'Esc', cancel: true, icon: 'x' });
    hidden({ id: 'move', label: 'Move', key: 'M', icon: 'move' }); hidden({ id: 'stop', label: 'Stop', key: 'S', icon: 'stop' });
  } else if (bl.length === 1 || (bl.length && bl.every(o => o.done && o.type === bl[0].type))) {
    // One building, or several finished ones of a kind (a double-tap): their shared card, shown for the one with the
    // shortest queue (where a unit goes next).
    const b = bl.length === 1 ? bl[0] : leastBusy(bl);
    if (!b.done && !buildersOf(b).length) at(0, { id: 'resume', label: 'Resume', key: 'R', icon: 'resume', tip: `Send the nearest ${UNITS[myFaction().worker].name} to finish construction` });
    if (!b.done) at(2, { id: 'cancelb', label: 'Cancel', key: 'X', cancel: true, icon: 'x', tip: 'Cancel construction (75% refund)' });
    const trains = b.done ? b.d.trains || [] : [];
    // Its actions first, in their fixed slots: Rally in the middle of the second row, the queue's Cancel in the corner
    // (always there on a building that trains, grayed out with nothing queued, so the card keeps its shape).
    if (trains.length) {
      at(RALLY, { id: 'rally', label: 'Rally', key: 'R', icon: 'rally', tip: 'Then tap where new units should go' });
      const last = mostBusy(bl).queue.at(-1);
      at(CORNER, { id: 'cancelq', label: 'Cancel', key: 'X', cancel: true, dis: !last, ...(last ? { por: ['unit', last], badge: true } : { icon: 'x' }), tip: 'Cancel the last unit in the queue (refund)' });
    }
    // The units it can train now, packed from the first slot (the top row: three at most) in the order they unlock (as
    // the Build page: by requirement depth, the table's order breaking ties), so a newly unlocked unit comes last and
    // moves none of the others; one whose building is missing is left out (its key does nothing).
    const unitDepth = (t) => (UNITS[t].req ? 1 + depth(UNITS[t].req) : 0);
    const shown = trains.map((t, i) => [t, i, unitDepth(t)]).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map(([t]) => t)
      .filter(t => { const d = UNITS[t]; return !d.req || G.bldgs.some(o => o.team === G.me && o.type === d.req && o.done); });
    shown.forEach(t => { const d = UNITS[t], why = placesTip(t); at(0, { id: 't_' + t, label: d.name, key: d.hot, cost: d.cost, por: ['unit', t], tip: d.desc + (why ? ' ' + why : '') }); }); // (the hover title and the long-press; a refusal for want of places said there too)
    if (b.done && b.d.researches.length) {
      // The researches packed among themselves, finished ones left out: from the first slot, or the second row's left on
      // a building that trains (so a unit unlocked moves none of them). While one runs, its own button becomes the
      // Cancel, in its place: nothing else moves between idle and busy, so a key or a second tap meant for another
      // research never cancels this one.
      const busy = researching(bl);
      const from = researchFrom(trains.length), place = (it) => at(from, it);
      const cancelr = busy && { id: 'cancelr', label: 'Cancel', key: 'C', cancel: true, icon: busy.research.type, badge: true, tip: 'Cancel the research (full refund)' };
      b.d.researches.forEach((k) => {
        const u = UPGRADES[k];
        const lv = G.upgrades[G.me][k] + 1, elsewhere = G.bldgs.some(o => o.team === G.me && o.research && o.research.type === k);
        if (busy?.research.type === k) { place(cancelr); return; }
        if (lv > u.levels) return;
        place({ id: 'r_' + k, label: upName(u, lv, true), key: u.hot, cost: u.cost[lv - 1], dis: bl.every(o => o.research) || elsewhere, icon: k, tip: (u.level_names?.length ? upName(u, lv) + ': ' : '') + upgradeDesc(k, myFaction()) + ` ${u.time[lv - 1]} s.` }); // (any idle one of the selection takes it)
      });
    }
  }
  // An armed order: its button becomes Cancel (Esc), lit, in the same place.
  const armedId = armedButton(), armedAt = items.find(i => i.id === armedId && !i.hidden);
  if (armedAt) {
    Object.assign(armedAt, { id: 'esc', label: 'Cancel', key: 'Esc', cancel: true, active: true, icon: 'back', por: null, cost: null, tip: 'Cancel the order' });
    // One live Cancel at a time (Deselect stays); the queue's keeps its slot, grayed out, so the card keeps its shape.
    for (let i = items.length - 1; i >= 0; i--) if (items[i].id === 'cancelq') items[i].dis = true; else if (items[i].id.startsWith('cancel')) items.splice(i, 1);
  }
  for (const it of items) if (it.cost && !canAfford(G.me, it.cost)) { // grayed out, but a tap says what is short
    it.poor = true;
    it.tip = (it.tip ? it.tip + ' ' : '') + `Not enough gold (needs ${it.cost[0]}).`;
  }
  return keyed(items.sort((p, q) => p.slot - q.slot));
}

/** Of several buildings of a kind: the one with the shortest queue (then the most progress, then by id). */
export const leastBusy = (bs) => bs.slice().sort((p, q) => p.queue.length - q.queue.length || q.prog - p.prog || p.id - q.id)[0];
/** The first of them researching (what a research Cancel shows and cancels). */
export const researching = (bs) => bs.find(o => o.research);
/** The one with the longest queue (a Cancel takes its last unit). */
export const mostBusy = (bs) => bs.slice().sort((p, q) => q.queue.length - p.queue.length || p.id - q.id)[0];

