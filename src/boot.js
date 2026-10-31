// Entry point: the menu first. The menu's pages, the lobby, INSTALL and SAVE OFFLINE (menu.js, online.js, offline.js)
// and the sound and full screen (corner.js: the screen's corner and the top bar's pair) are wired as soon as this small
// graph is in, so they work before the game has loaded, and if it cannot; nothing here imports the
// renderer. The game (main.js: the renderer and its art, the loop) loads behind the menu, and the sim's WASM with it
// (src/engine starts it on import). What starts a game waits for it: START GAME and FIRST GAME read LOADING… (the
// lobby's READY too: online.js), and RELOAD if it could not load.
import './style.css';
import { $, toast, LOAD_FAILED } from './client/ui.js';
import { initCorner } from './client/corner.js';
import { initMenu, pendingChallenge } from './client/menu.js';
import { initOnline, reloadUrl } from './client/online.js';
import { registered } from './client/offline.js';

// ?bench: the device test plays a game of its own (main.js loads src/client/bench.js), with its own card: no menu.
const BENCH = new URLSearchParams(location.search).has('bench');
if (BENCH) $('start').hidden = true;

/** main.js's `game` once it has loaded (null before); `failed` once it could not. */
let game = null, failed = false;
const loading = import('./main.js').then(m => (game = m.game));

const STARTS = ['btnStart', 'btnFirst', 'btnFirstHome'], labels = new Map();
/** The start buttons read `text`, disabled if `off`; no text: their own labels, and state, again (START GAME is the
 *  menu's to disable too: everyone on one side). */
function startButtons(text, off) {
  for (const b of STARTS.map($)) {
    if (text && !labels.has(b)) labels.set(b, { html: b.innerHTML, disabled: b.disabled });
    if (text) { b.textContent = text; b.disabled = off; } else if (labels.has(b)) { b.innerHTML = labels.get(b).html; b.disabled = labels.get(b).disabled; labels.delete(b); }
  }
}
/** A start waiting for the game to load (its `go`), or null. */
let pending = null;
/** Start a game: at once once the game has loaded; before, the start buttons read LOADING… until it has, then it
 *  starts. A game that could not load: the buttons read RELOAD, and reload. */
function play(go) {
  if (failed) { location.reload(); return; }
  if (game) { go(game); return; }
  pending = go; startButtons('LOADING…', true);
}
// Any other tap in the menu meanwhile (BACK, another choice; the corner's sound and full screen are not the menu's)
// calls the waiting start off: a game starts as it was asked for, or not at all.
$('start').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (pending && b && !STARTS.includes(b.id)) { pending = null; startButtons(null, false); }
}, true);
loading.then((g) => { const go = pending; pending = null; startButtons(null, false); go?.(g); }, (e) => {
  failed = true; pending = null; startButtons('RELOAD', false); console.error(e);
  const p = document.createElement('p'); p.className = 'tip'; p.id = 'loadFailed'; p.textContent = LOAD_FAILED; // (on the menu's card: a toast would be under it)
  $('start').querySelector('.card').appendChild(p);
});

initCorner();
initMenu({ onStart: BENCH ? () => {} : () => play(g => g.newGame()) });
initOnline({ game: loading });

/** Where a reload lands: online.js's answer (a room's link, the lobby's), else a challenge still to play (menu.js:
 *  its link left the address once read), else this page. */
const here = () => { const url = reloadUrl(); return url === location.href ? pendingChallenge() || url : url; };

// Offline: the built game registers its service worker (dist/sw.js, see tools/offline), which keeps every file so
// Ebbfall opens and plays without a connection once it has been loaded. Registered once the game's load is over (its
// install fetches every file again: not while the game's own load still needs the connection), loaded or not.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => registered(navigator.serviceWorker.register('./sw.js').catch(() => null)); // (null: not available, file:// or private mode; SAVE OFFLINE says so)
  loading.catch(() => {}).then(() => { if (document.readyState === 'complete') register(); else addEventListener('load', register); });
  // A new version installed while the game is open: out of a game (the menu, the lobby: back into its room), switch to
  // it at once (online, friends must share a version); in a game, say so (it loads next time) rather than interrupt.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // the first install, not an update
    if (!game?.started()) location.replace(here()); else toast('A new version of Ebbfall is ready: it loads next time you open the game');
  });
}
