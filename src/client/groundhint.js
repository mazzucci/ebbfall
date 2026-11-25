// The right-click hint, with a mouse set to RIGHT CLICK ONLY (MOUSE, controls.js): a left click on empty ground keeps the
// selection and orders nothing, so a player with units selected who clicks there is told how they move, TIMES times on
// this device at most. A client nudge: nothing of the sim changes.
import { toast } from './ui.js';
import { store } from './store.js';
import { watching } from './claude.js';

/** How many times a device shows it, ever. */
export const TIMES = 3;
/** How long it stays up (ms). Clicks meanwhile neither show it again nor count: three quick clicks are one lesson. */
const SHOW_MS = 4500;
export const GROUND_HINT = 'Right-click to move or attack';

/** Times shown as this page knows (a device that remembers nothing stops there too), and when the last one goes. */
let shown = 0, until = 0;

/** The empty ground was left-clicked with units selected: the hint, when due (not in a watched game: no orders there). */
export function groundHint() {
  const now = performance.now();
  shown = Math.max(shown, Number(store.get('groundHint')) || 0);
  if (shown >= TIMES || now < until || watching()) return;
  shown++; until = now + SHOW_MS;
  store.set('groundHint', String(shown));
  toast(GROUND_HINT, false, true, 'tip', SHOW_MS);
}
