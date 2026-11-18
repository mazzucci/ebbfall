// The group-selection hint on touch: a player tapping fighters one by one (PICKS of them within WINDOW ms) is told,
// once, how to take many at a time (SELECT and a box, a double-tap, ARMY), and the buttons it names pulse while it
// shows. Seen once, it waits AGAIN games before it may come back. A client nudge: nothing of the sim changes.
import { $, toast } from './ui.js';
import { store } from './store.js';

/** Single taps on different fighters of ours that call for the hint, and the time they must fall within (ms). */
export const PICKS = 3, WINDOW = 8000; // (8 s: a tap to select and a tap to order, three times over)
/** Games started on this device since the hint last showed before it may show again. */
export const AGAIN = 3;
/** How long it stays up (ms): longer than a toast, it has three things to say. */
const SHOW_MS = 8000;
export const GROUP_HINT = 'Many units? Hold SELECT and drag a box · double-tap a unit for all of its type · ARMY selects every fighter';

/** Recent single picks this game: [{ id, at }]; `off` in the guided first game (its own step teaches the same). */
let picks = [], off = false;
const num = (k) => { const s = store.get(k), v = Number(s); return s !== null && s !== '' && Number.isFinite(v) ? v : null; }; // (none stored: null, not Number(null)'s 0)

/** A game starts: one more on this device's count (endfall.games), and no picks carried over. `guided`: the guided
 *  first game, where the hint stays quiet (its checklist has a step for SELECT and ARMY; the hint's one showing is
 *  kept for a later game). */
export function groupHintGame(guided = false) {
  picks = []; off = guided;
  store.set('games', String((num('games') ?? 0) + 1));
}

/** After a tap on the map changed the selection to `sel` (the event's time `at`): count a lone fighter of ours, forget
 *  the count on a group (the player knows the way), and show the hint when due. */
export function notePick(sel, at) {
  if (off) return;
  if (sel.length > 1) { picks = []; return; }
  const u = sel[0];
  if (!u || u.kind !== 'unit' || u.d.worker) return;
  picks = picks.filter(p => at - p.at < WINDOW && p.id !== u.id);
  picks.push({ id: u.id, at });
  if (picks.length < PICKS) return;
  picks = [];
  const games = num('games') ?? 0, last = num('groupHint');
  if (last !== null && games - last < AGAIN) return;
  store.set('groupHint', String(games));
  toast(GROUP_HINT, false, true, 'tip', SHOW_MS);
  for (const id of ['btnBox', 'btnArmy']) { const b = $(id); b.classList.add('nudge'); setTimeout(() => b.classList.remove('nudge'), SHOW_MS); }
}
