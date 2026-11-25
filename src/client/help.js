// The in-game help sheet (index.html #helpSheet): the ? in the top bar opens it in the stage's top-right corner, and so
// does the pause card's HOW TO PLAY (over the card). The controls in four lines (a mouse's, or touch's: style.css shows
// one set by the pointer), the goal in one (in the player's people's words), and a link to the docs' full guide, in a
// new tab (an installed app does not leave the game). The game keeps running under it: it is not one of the screens
// that stop the clock (main.js `overlay`), and the map takes clicks around it.
import { $ } from './ui.js';
import { leftOrders } from './controls.js';

/** The goal line for a people (`grid`: the Expedition's, which builds Substations for the grid). */
export const goalLine = (grid) => (grid
  ? "Mine thorium for energy, raise Substations for the grid, and bring down the enemy's base before their waves bring down yours."
  : "Mine gold, raise Cottages for population, and bring down the enemy's base before their waves bring down yours.");

export const helpOpen = () => !$('helpSheet').hidden;

/** Open the sheet (`grid`: the player's people's goal; `paused`: from the pause card, which says so); the focus on its
 *  close button when asked. */
export function openHelp(grid = false, focus = true, paused = false) {
  $('helpGoal').textContent = goalLine(grid);
  $('helpRun').textContent = paused ? 'The game is paused.' : 'The game keeps running.';
  $('helpSheet').classList.toggle('rightonly', !leftOrders()); // (the MOUSE setting's words: style.css)
  $('helpSheet').hidden = false;
  $('btnHelp').setAttribute('aria-expanded', 'true');
  if (focus) $('btnHelpClose').focus({ preventScroll: true });
}

export function closeHelp() {
  const had = $('helpSheet').contains(document.activeElement);
  $('helpSheet').hidden = true;
  $('btnHelp').setAttribute('aria-expanded', 'false');
  if (had) $('btnHelp').focus({ preventScroll: true });
}

/** Wire the ? (a toggle), the close button and the pause card's HOW TO PLAY. `grid()`: whether the player plays the
 *  Expedition. */
export function initHelp(grid) {
  $('btnHelp').addEventListener('click', () => (helpOpen() ? closeHelp() : openHelp(grid())));
  $('btnHelpClose').addEventListener('click', closeHelp);
  $('btnPauseHelp').addEventListener('click', () => openHelp(grid(), true, true));
}
