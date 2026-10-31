// What the command card holds for the selection: its buttons in fixed slots, each with its key (the controls scheme's:
// controls.js). Pure state, no DOM (card.js draws the buttons; test/cards.test.js reads every card the game can show).
import { G, UNITS, BUILDINGS, UPGRADES, ABILITIES, FACTIONS, hasReq, canAfford, unlockOf } from '../engine/index.js';
import { ui, playerSel, armedButton } from './ui.js';
import { keyed } from './controls.js';

/** The player's side (faction data: worker, headquarters, Build list pages). */
export const myFaction = () => FACTIONS[G.factions[G.me]] || FACTIONS.humans;
/** Harvesters currently working on building b. */
export const buildersOf = (b) => G.units.filter(u => u.task.t === 'build' && u.task.b === b);
export const ROMAN = ['', 'I', 'II', 'III'];

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
/** Which of `units` a tap on ability `k` is for. A toggle's button names what a tap does, not the state: while any of
 *  the selection's units with it is off, the button turns those on (Deploy) and leaves the others be; once all of
 *  them are on (or settling in), it turns them all off (Undeploy). The sim flips each unit it is sent
 *  (World::cast_group), so the card sends only the units its button names. A one-shot is for all of them. */
export function abilityTargets(units, k) {
  if (!ABILITIES[k].toggle) return { on: true, units };
  const have = units.filter(u => (UNITS[u.type].abilities || []).includes(k)), off = have.filter(u => u.mode !== k);
  return off.length ? { on: true, units: off } : { on: false, units: have };
}
/** The selection's abilities, one button each (in table order): greyed while none of the units it is for can use it.
 *  A toggle reads as the action a tap takes (`abilityTargets`); a timed one (Stim, Cloak) is lit while any of them is
 *  under it. No countdowns: a button comes back when it is ready. */
function abilityItems(units) {
  return Object.keys(ABILITIES).filter(k => units.some(u => (UNITS[u.type].abilities || []).includes(k))).map(k => {
    const a = ABILITIES[k], have = units.filter(u => UNITS[u.type].abilities.includes(k)), tech = unlockOf(k);
    if (tech && !G.upgrades[G.me][tech]) { // not researched yet: locked, and where to research it
      const at = Object.values(BUILDINGS).find(d => (d.researches || []).includes(tech));
      return { id: 'a_' + k, label: a.name, key: a.hot, icon: k, locked: true, tip: `${a.desc} Research ${UPGRADES[tech].name} at the ${at?.name ?? 'tech building'} first.` };
    }
    const { on, units: to } = abilityTargets(have, k), off = !on && a.off; // (a toggle's other side: its name, icon and words)
    return { id: 'a_' + k, label: off ? off.name : a.name, key: a.hot, icon: off ? off.icon : k, dis: !to.some(u => canUse(u, k)), active: have.some(u => u.boost === k), tip: off ? off.desc : a.desc };
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
    const abilities = abilityItems(units);
    if (onlyWorkers) { work.forEach((it, i) => at(i, it)); orders.forEach((it, i) => at(COLS + i, it)); }
    else {
      orders.forEach((it, i) => at(i, it));
      // Workers in an army: their row. Where the army's abilities need the room (the card keeps its three rows), Build
      // stays and Gather and Repair give way (their keys still work in CLASSIC; a tap on a field or a damaged
      // building still gathers or repairs).
      const room = COLS * 3 - 1 - orders.length - abilities.length; // (the last slot: Deselect)
      if (workers) work.forEach((it, i) => i < Math.max(1, room) ? at(COLS + i, it) : hidden(it));
    }
    abilities.forEach((it, i) => at(orders.length + i, it)); // after the orders, on their row
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
      // Fixed slots: a research building's own row holds two researches and Cancel, the techs go below. A factory's one
      // tech sits after its units and Rally, and while it researches its button becomes the Cancel (the card keeps its
      // shape; the queue's Cancel keeps its own slot). A finished tech leaves its slot empty.
      const slots = trains.length ? [trains.length + 1] : [0, 1, 3, 4, 5], busy = researching(bl);
      const cancelr = busy && { id: 'cancelr', label: 'Cancel', key: 'C', cancel: true, icon: busy.research.type, badge: true, tip: 'Cancel the research (full refund)' };
      b.d.researches.forEach((k, i) => {
        const u = UPGRADES[k];
        const lv = G.upgrades[G.me][k] + 1, elsewhere = G.bldgs.some(o => o.team === G.me && o.research && o.research.type === k);
        if (trains.length && busy?.research.type === k) { at(slots[i] ?? i, cancelr); return; }
        if (lv > u.levels) return;
        at(slots[i] ?? i, { id: 'r_' + k, label: (u.short || u.name) + (u.levels > 1 ? ' ' + ROMAN[lv] : ''), key: u.hot, cost: u.cost[lv - 1], dis: bl.every(o => o.research) || elsewhere, icon: k, tip: u.desc + ` ${u.time[lv - 1]} s.` }); // (any idle one of the selection takes it)
      });
      if (busy && !trains.length) at(2, cancelr);
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
  return keyed(items.sort((p, q) => p.slot - q.slot));
}

/** Of several buildings of a kind: the powered one with the shortest queue (then the most progress, then by id). */
export const leastBusy = (bs) => bs.slice().sort((p, q) => (p.d.needsPower && !p.powered) - (q.d.needsPower && !q.powered) || p.queue.length - q.queue.length || q.prog - p.prog || p.id - q.id)[0];
/** The first of them researching (what a research Cancel shows and cancels). */
export const researching = (bs) => bs.find(o => o.research);
/** The one with the longest queue (a Cancel takes its last unit). */
export const mostBusy = (bs) => bs.slice().sort((p, q) => q.queue.length - p.queue.length || p.id - q.id)[0];

