// The game clock in the top bar (#rClock): the game's elapsed time, m:ss, read from the sim's time (G.time, its ticks),
// not the wall clock, so it stops while the game is paused and follows fast-forward; online it is the shared game's
// time. main.js calls `updateClock` with the rest of the HUD, a few times a second; the text is written only when it
// changes (once a second at most). `clock` is the format the pause card uses too.
import { G, fmt } from '../engine/index.js';
import { $ } from './ui.js';

/** A clock as said in the game: 4:12, 12:30 (fmt's 04:12 without the leading zero). */
export const clock = (sec) => fmt(sec).replace(/^0(?=\d:)/, '');

let shown = '';
/** Show the game's time in the top bar, if the shown text changes. */
export function updateClock() {
  const text = clock(G.time);
  if (text === shown) return;
  shown = text; $('rClock').textContent = text;
}
