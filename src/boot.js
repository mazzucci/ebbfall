// Entry point: the menu first. The menu's pages, the lobby, INSTALL and CHECK OFFLINE (menu.js, online.js, offline.js)
// and the top bar's sound and full-screen buttons are wired as soon as this small graph is in; nothing here imports the
// renderer. The game (main.js: the renderer and its art, the loop) loads behind the menu, and the sim's WASM with it
// (src/engine starts it on import). What starts a game waits for it: its button reads LOADING… until the game can start.
import './style.css';
import { $, toast } from './client/ui.js';
import { audio, sfx, soundToggled } from './client/audio.js';
import { setIconButton } from './client/icons.js';
import { initScreen } from './client/screen.js';
import { initMenu, showMenu, soundChanged } from './client/menu.js';
import { initOnline } from './client/online.js';

/** main.js's `game` once it has loaded (null before). */
let game = null;
const loading = import('./main.js').then(m => (game = m.game));
loading.catch(e => toast(`The game could not load: ${e.message}. Reload the page to try again`, true));

/** Start a game: at once once the game has loaded; before, the start buttons read LOADING… until it has, then it
 *  starts. Meanwhile the menu takes no taps (no second start, no other choices than those this game was started with). */
const STARTS = ['btnStart', 'btnFirst', 'btnFirstHome'];
function play(go) {
  if (game) { go(game); return; }
  const bs = STARTS.map($).filter(b => !b.disabled), was = bs.map(b => b.innerHTML);
  for (const b of bs) { b.disabled = true; b.textContent = 'LOADING…'; }
  $('start').inert = true;
  loading.then(go, () => toast('The game could not load: reload the page to try again', true))
    .finally(() => { $('start').inert = false; bs.forEach((b, i) => { b.disabled = false; b.innerHTML = was[i]; }); });
}

const syncSound = () => { setIconButton($('btnSound'), audio.muted ? 'mute' : 'sound', audio.muted ? 'SOUND OFF' : 'SOUND ON'); $('btnSound').title = audio.muted ? 'Sound (off)' : 'Sound (on)'; $('btnSound').setAttribute('aria-pressed', String(!audio.muted)); };
$('btnSound').addEventListener('click', () => { audio.muted = !audio.muted; syncSound(); soundChanged(); soundToggled(); if (!audio.muted) sfx('select'); });
initScreen();
initMenu({ onStart: () => play(g => g.newGame()), onSound: syncSound });
// (only a game calls quit, room, pause, resume and rematch: the game has loaded by then)
initOnline({
  game: loading, start: (...a) => game.newOnlineGame(...a), leave: showMenu, quit: () => game?.quitToTitle(),
  room: () => game?.room(), pause: () => game?.pause(), resume: (s) => game?.resume(s), rematch: (they, iWant) => game?.rematch(they, iWant),
});
