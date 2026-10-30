// The controls of a mouse and a keyboard, two schemes (CONTROLS on the OPTIONS card: options.js):
// - CLASSIC (the default): the arrow keys and the screen's edge move the map (W A S D too while nothing is selected),
//   and a command's key is its own letter (A attack-move, B build, T Trooper, ...);
// - WASD: W A S D always move the map, whatever is selected, and the command card's buttons take their keys by where
//   they sit (GRID): the same slot, the same key, on every card. The keys that are not commands stay: Ctrl+1–9 and
//   1–9 (groups), Shift (five, or keep placing), Space (the last alert), Esc, P (pause), Q (the whole army: so not in
//   the grid), . and , (idle workers, an idle factory), Home. Keys on no button (Stop S, Move M, the other Build
//   page's buildings) have none in WASD: Hold is on the card, a right-click moves.
// Holding the middle button and dragging moves the map in both (input.js).
// Offered only where the primary pointer is fine (a capability, not a device: the one design); on a touch screen
// nothing changes and nothing shows. Remembered on the device (store.js: endfall.controls), applied at once.
import { store } from './store.js';

/** The WASD scheme's key for each card slot (slot = row * 3 + column, the card's three columns): a card row on a
 *  keyboard row, the three keys just right of the W A S D cluster (E R T beside W, F G H beside D, C V B below them). */
export const GRID = ['E', 'R', 'T', 'F', 'G', 'H', 'C', 'V', 'B'];
/** The keys that move the map in the WASD scheme. */
export const PAN = ['W', 'A', 'S', 'D'];
/** What each scheme is called on its chip, and its one line under the chips (OPTIONS). */
export const SCHEMES = {
  classic: { chip: 'CLASSIC', line: 'Arrows or the screen edge move the map; letters are shortcuts.' },
  wasd: { chip: 'WASD', line: 'WASD moves the map; shortcuts E R T · F G H · C V B by position.' },
};

/** Whether this device gets the choice: its primary pointer is fine (a mouse, a trackpad), so a keyboard is likely. */
const FINE = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
export const offered = () => FINE;
let chosen = store.get('controls') === 'wasd' ? 'wasd' : 'classic';
/** The scheme in force: the chosen one where it is offered, CLASSIC elsewhere. */
export const scheme = () => (FINE && chosen === 'wasd' ? 'wasd' : 'classic');
export const wasd = () => scheme() === 'wasd';

const listeners = [];
/** Call `fn` whenever the scheme changes (the command card draws its keys again). */
export const onControls = (fn) => { listeners.push(fn); };
export function setScheme(s) {
  if (!SCHEMES[s] || s === chosen) return;
  chosen = s; store.set('controls', s);
  for (const fn of listeners) fn(s);
}

/** A card's items with the keys of scheme `s`: in WASD each button its slot's GRID key (a slot past the grid: none),
 *  and an item with no button (`hidden`) none; CLASSIC leaves each its own letter. */
export function keyed(items, s = scheme()) {
  if (s === 'wasd') for (const it of items) it.key = it.hidden ? '' : GRID[it.slot] ?? '';
  return items;
}
