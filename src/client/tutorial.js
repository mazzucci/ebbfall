// The guided first game: a short checklist over the map, one step at a time, driven by what is on the field (no
// timers, no numbers beyond a count). Each step pulses the button it wants. Race-neutral: kinds come from the faction.
import { G, UNITS, BUILDINGS, TILE, holdWaves, enemies } from '../engine/index.js';
import { plural } from '../engine/util.js';

/** The longest the opponent waits for the guided player (s): the sim's HOLD_WAVES_MAX. */
const HOLD_WAVES = 360;
import { $, ui, toast } from './ui.js';
import { myFaction, aName } from './hud.js';
import { portrait } from './gl/render.js';
import { sfx } from './audio.js';
import { alerts } from './tools.js';

const tut = { on: false, step: 0, start: 0, since: 0 };
const mine = (type) => G.units.filter(u => u.team === G.me && u.type === type).length;
const built = (type) => G.bldgs.some(b => b.team === G.me && b.type === type && b.done);
/** How near (px) an enemy fighter must come to one of the player's buildings to be at the base. */
const AT_BASE = 12 * TILE;
/** Whether an enemy fighter (not a worker) is at the player's base: within AT_BASE of one of its buildings, seen or
 *  not (a wave just out of sight must not end the step; the guided opponent keeps its few fighters at home). */
const enemyAtBase = () => {
  const mineB = G.bldgs.filter(b => b.team === G.me);
  return G.units.some(u => enemies(G.me, u.team) && !u.d.worker && mineB.some(b => Math.hypot(u.x - b.x, u.y - b.y) < AT_BASE));
};

/** The step after which the opponent may come (the army is trained): its index in `steps()`. */
const ARMY = 5;

/** The steps for the player's race: [line, portrait, the buttons to pulse (or a function of the moment), done?]. Mine,
 *  population, an Excavator (the Vael: a Siphon), the barracks, a line and its anti-air (as many line units as fit
 *  under the first cap: six of a 1-population kind, three of a 2-population one), hold, then spend the bank on more of
 *  the line up to an army of `goal` and attack (the sim keeps the guided game's opponent small: World::guided_hold). */
function steps() {
  const f = myFaction(), hq = BUILDINGS[f.hq], worker = UNITS[f.worker], pump = BUILDINGS[f.ether];
  const rax = f.buildBasic.find(k => (BUILDINGS[k].trains || []).some(t => !UNITS[t].worker));
  const [soldier, aa] = BUILDINGS[rax].trains, n = Math.max(3, Math.floor(6 / (UNITS[soldier].supply || 1)));
  const goal = n + 4, army = () => G.units.filter(u => u.team === G.me && !u.d.worker).length;
  const calm = () => alerts.last && alerts.last.t > tut.since && performance.now() - alerts.last.t > 20000;
  return [
    { text: `Select your ${hq.name}, then train a ${worker.name}, and another once you have ${UNITS[f.worker].cost[0]} salt again`, por: ['unit', f.worker], want: ['t_' + f.worker], done: () => mine(f.worker) >= tut.start + 2 },
    { text: `Select a ${worker.name}: Build a ${BUILDINGS[f.supply].name} (population: every unit needs some)`, por: ['bldg', f.supply], want: ['build', 'b_' + f.supply], done: () => built(f.supply) },
    { text: `Build ${aName(pump.name)} on a mine shaft: it ${pump.verb} salt by itself`, por: ['bldg', f.ether], want: ['build', 'b_' + f.ether], done: () => built(f.ether) },
    { text: `Build a ${BUILDINGS[rax].name}`, por: ['bldg', rax], want: ['build', 'b_' + rax], done: () => built(rax) },
    { text: `Train ${n} ${plural(UNITS[soldier].name)} and 2 ${plural(UNITS[aa].name)} at the ${BUILDINGS[rax].name}`, por: ['unit', soldier], want: ['t_' + soldier, 't_' + aa], done: () => mine(soldier) >= n && mine(aa) >= 2 },
    // (over once no enemy fighter is at the base: after the attack has quietened down, or after 150 s for an enemy
    // that never comes; never while one is still there)
    { text: 'The enemy is coming: hold your base', por: ['unit', soldier], want: [], done: () => !enemyAtBase() && (calm() || G.time - tut.stepAt > 150) },
    { text: `Spend your salt on ${plural(UNITS[soldier].name)} (an army of ${goal}), then select it (ARMY or Q) and Attack their base`, por: ['unit', soldier], want: () => (army() < goal ? ['t_' + soldier] : ['attack']), done: () => G.over && G.winner === G.teams[G.me] },
  ];
}

/** Start the checklist for a new game (or turn it off). Holds the opponent's first wave until the army is ready. */
export function startTutorial(on) {
  Object.assign(tut, { on, step: 0, start: 0, since: 0, stepAt: 0, warned: false });
  $('tut').hidden = !on; clearPulse();
  if (!on) return;
  holdWaves(true);
  tut.start = G.units.filter(u => u.team === G.me && u.d.worker).length;
  show();
}

function show() {
  const s = steps()[tut.step];
  $('tut').innerHTML = `<span class="pic">${portrait(s.por[0], s.por[1], 26)}</span><span class="t">${s.text}</span><b>${tut.step + 1}/${steps().length}</b>`;
}

function clearPulse() { for (const el of document.querySelectorAll('.pulse')) el.classList.remove('pulse'); }

/** Each HUD tick: advance when a step is done, and pulse what the current step wants. */
export function updateTutorial() {
  if (!tut.on) return;
  if (G.over) { tut.on = false; $('tut').hidden = true; clearPulse(); return; } // (won or lost before the last step)
  // The opponent's patience runs out at HOLD_WAVES s whatever the step: a word, once, so it is no surprise.
  if (!tut.warned && tut.step < ARMY && G.time > HOLD_WAVES - 20) { tut.warned = true; toast('The enemy is gathering to attack: get some soldiers ready!', true); }
  const all = steps();
  while (tut.step < all.length && all[tut.step].done()) {
    tut.step++; tut.stepAt = G.time; sfx('done');
    if (tut.step === ARMY) { holdWaves(false); tut.since = performance.now(); } // the army is ready: let them come
    if (tut.step === all.length) { tut.on = false; $('tut').hidden = true; clearPulse(); return; }
    show();
  }
  clearPulse();
  const want = all[tut.step].want;
  for (const w of typeof want === 'function' ? want() : want) {
    const el = document.querySelector(`#cmd button[data-id="${w}"]`);
    if (el && !(w === 'build' && ui.mode)) el.classList.add('pulse');
  }
}
