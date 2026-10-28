// Entry point: the menu first. The menu's pages, the lobby, INSTALL and CHECK OFFLINE (menu.js, online.js, offline.js)
// and the top bar's sound and full-screen buttons are wired as soon as this small graph is in; nothing here imports the
// renderer. The game (main.js: the renderer and its art, the loop) loads behind the menu, and the sim's WASM with it
// (src/engine starts it on import). What starts a game waits for it: START GAME and FIRST GAME read LOADING… (the
// lobby's READY too: online.js), and RELOAD if it could not load.
import './style.css';
import { $, toast, LOAD_FAILED } from './client/ui.js';
import { audio, sfx, soundToggled } from './client/audio.js';
import { setIconButton } from './client/icons.js';
import { initScreen } from './client/screen.js';
import { initMenu, soundChanged } from './client/menu.js';
import { initOnline, reloadUrl } from './client/online.js';

// ?bench: the device test plays a game of its own (main.js loads src/client/bench.js), with its own card: no menu.
const BENCH = new URLSearchParams(location.search).has('bench');
if (BENCH) $('start').hidden = true;

/** main.js's `game` once it has loaded (null before); `failed` once it could not. */
let game = null, failed = false;
const loading = import('./main.js').then(m => (game = m.game));

const STARTS = ['btnStart', 'btnFirst', 'btnFirstHome'], labels = new Map();
/** The start buttons read `text`, disabled if `off`; no text: their own labels again. */
function startButtons(text, off) {
  for (const b of STARTS.map($)) {
    if (text && !labels.has(b)) labels.set(b, b.innerHTML);
    b.disabled = off; if (text) b.textContent = text; else if (labels.has(b)) b.innerHTML = labels.get(b);
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
// Any other tap in the menu meanwhile (BACK, another choice; not the corner's sound and full screen) calls the waiting
// start off: a game starts as it was asked for, or not at all.
$('start').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (pending && b && !STARTS.includes(b.id) && !b.closest('.corner')) { pending = null; startButtons(null, false); }
}, true);
loading.then((g) => { const go = pending; pending = null; startButtons(null, false); go?.(g); }, (e) => {
  failed = true; pending = null; startButtons('RELOAD', false); console.error(e);
  const p = document.createElement('p'); p.className = 'tip'; p.id = 'loadFailed'; p.textContent = LOAD_FAILED; // (on the menu's card: a toast would be under it)
  $('start').querySelector('.card').appendChild(p);
});

const syncSound = () => { setIconButton($('btnSound'), audio.muted ? 'mute' : 'sound', audio.muted ? 'SOUND OFF' : 'SOUND ON', audio.muted ? 'SOUND ON' : 'SOUND OFF'); $('btnSound').title = audio.muted ? 'Sound (off)' : 'Sound (on)'; $('btnSound').setAttribute('aria-pressed', String(!audio.muted)); };
$('btnSound').addEventListener('click', () => { audio.muted = !audio.muted; syncSound(); soundChanged(); soundToggled(); if (!audio.muted) sfx('select'); });
initScreen();
initMenu({ onStart: BENCH ? () => {} : () => play(g => g.newGame()), onSound: syncSound });
initOnline({ game: loading });

// Offline: the built game registers its service worker (dist/sw.js, see tools/offline), which keeps every file so
// Ebbfall opens and plays without a connection once it has been loaded. Registered once the game's load is over (its
// install fetches every file again: not while the game's own load still needs the connection), loaded or not.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => { /* not available (file://, private mode) */ });
  loading.catch(() => {}).then(() => { if (document.readyState === 'complete') register(); else addEventListener('load', register); });
  // A new version installed while the game is open: out of a game (the menu, the lobby: back into its room), switch to
  // it at once (online, friends must share a version); in a game, say so (it loads next time) rather than interrupt.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // the first install, not an update
    if (!game?.started()) location.replace(reloadUrl()); else toast('A new version of Ebbfall is ready: it loads next time you open the game');
  });
}
