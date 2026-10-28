// The guided first game: a short checklist over the map, one step at a time, driven by what is on the field (no
// timers, no numbers beyond a count). Each step pulses the button it wants. Race-neutral: kinds come from the faction.
import { G, UNITS, BUILDINGS, holdWaves } from '../engine/index.js';

/** The longest the opponent waits for the guided player (s): the sim's HOLD_WAVES_MAX. */
const HOLD_WAVES = 360;
import { $, ui, toast } from './ui.js';
import { myFaction } from './hud.js';
import { portrait } from './gl/render.js';
import { sfx } from './audio.js';
import { alerts } from './tools.js';

const tut = { on: false, step: 0, start: 0, since: 0 };
const mine = (type) => G.units.filter(u => u.team === G.me && u.type === type).length;
const built = (type) => G.bldgs.some(b => b.team === G.me && b.type === type && b.done);

/** The steps for the player's race: [line, portrait, the buttons to pulse, done?]. */
function steps() {
  const f = myFaction(), hq = BUILDINGS[f.hq], worker = UNITS[f.worker];
  const rax = f.buildBasic.find(k => (BUILDINGS[k].trains || []).some(t => !UNITS[t].worker)), soldier = BUILDINGS[rax].trains[0];
  const calm = () => alerts.last && alerts.last.t > tut.since && performance.now() - alerts.last.t > 20000;
  return [
    { text: `Select your ${hq.name}, then train two ${worker.name}s`, por: ['unit', f.worker], want: ['t_' + f.worker], done: () => mine(f.worker) >= tut.start + 2 },
    { text: `Select a ${worker.name}: Build a ${BUILDINGS[f.supply].name}`, por: ['bldg', f.supply], want: ['build', 'b_' + f.supply], done: () => built(f.supply) },
    { text: `Build a ${BUILDINGS[rax].name}`, por: ['bldg', rax], want: ['build', 'b_' + rax], done: () => built(rax) },
    { text: `Train 6 ${UNITS[soldier].name}s at the ${BUILDINGS[rax].name}`, por: ['unit', soldier], want: ['t_' + soldier], done: () => mine(soldier) >= 6 },
    { text: 'The enemy is coming: hold your base', por: ['unit', soldier], want: [], done: () => calm() || G.time - tut.stepAt > 150 },
    { text: 'Tap the soldier in the top bar (your army), then Attack the enemy base', por: ['bldg', f.hq], want: ['army', 'attack'], done: () => G.over && G.winner === G.teams[G.me] },
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
  $('tut').innerHTML = `<span class="pic">${portrait(s.por[0], s.por[1], 26)}</span><span class="t">${s.text}</span><b>${tut.step + 1}/6</b>`;
}

function clearPulse() { for (const el of document.querySelectorAll('.pulse')) el.classList.remove('pulse'); }

/** Each HUD tick: advance when a step is done, and pulse what the current step wants. */
export function updateTutorial() {
  if (!tut.on) return;
  if (G.over) { tut.on = false; $('tut').hidden = true; clearPulse(); return; } // (won or lost before the last step)
  // The opponent's patience runs out at HOLD_WAVES s whatever the step: a word, once, so it is no surprise.
  if (!tut.warned && tut.step < 4 && G.time > HOLD_WAVES - 20) { tut.warned = true; toast('The enemy is gathering to attack: get some soldiers ready!', true); }
  const all = steps();
  while (tut.step < all.length && all[tut.step].done()) {
    tut.step++; tut.stepAt = G.time; sfx('done');
    if (tut.step === 4) { holdWaves(false); tut.since = performance.now(); } // the army is ready: let them come
    if (tut.step === all.length) { tut.on = false; $('tut').hidden = true; clearPulse(); return; }
    show();
  }
  clearPulse();
  for (const w of all[tut.step].want) {
    const el = w === 'army' ? $('btnArmy') : document.querySelector(`#cmd button[data-id="${w}"]`);
    if (el && !(w === 'build' && ui.mode)) el.classList.add('pulse');
  }
}
