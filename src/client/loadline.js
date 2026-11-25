// The loading line: while a start waits for the game (START GAME, TUTORIAL; the lobby until READY is there; the device
// test's page), a bar with how much of the art is in, in MB, from its first byte (gl/artload.js), in the page just over
// the row of buttons it is for. The art could not be fetched: what to do, and RETRY, wherever the player is in the menu.
import { $ } from './ui.js';
import { art, onArt, retryArt } from './gl/artload.js';

const mb = (n) => (n / 1e6).toFixed(1);
const el = document.createElement('div');
let wanted = false, alone = false, over = false;
/** The row of the page on screen the line goes over: single player's, the lobby's, else the first page's. */
const row = () => (!$('online').hidden ? $('online').querySelector('.row.foot') : !$('menuSolo').hidden ? $('menuSolo').querySelector(':scope > .row') : $('menuHome').querySelector(':scope > .row'));
/** Show the line while something waits for the game (`on`), or only if the art failed. */
export function loadLine(on) { wanted = on; draw(art); }
/** The game's load is over (loaded, or it could not): nothing to show any more. */
export function loadOver() { over = true; loadLine(false); }
function draw(a) {
  const lobby = !$('online').hidden && !$('btnOnlineReady').hidden; // (a room: READY waits)
  const show = !over && (a.failed || (wanted && (alone || !$('start').hidden)) || lobby);
  el.hidden = !show; if (!show) return;
  const r = alone ? null : row(), fresh = r ? r.previousElementSibling !== el : el.parentElement !== document.body;
  if (fresh) { if (r) r.before(el); else document.body.append(el); }
  el.classList.toggle('failed', a.failed);
  el.querySelector('span').textContent = a.failed ? 'Part of the game could not be fetched. Check your connection, then:'
    : a.ready ? 'Almost there…' : a.total ? `Loading the game: ${mb(a.done)} of ${mb(a.total)} MB` : 'Loading the game…';
  const p = el.querySelector('progress');
  if (a.total) { p.max = a.total; p.value = a.done; } else p.removeAttribute('value'); // (no total yet: a bar that only moves)
  el.querySelector('button').hidden = !a.failed;
  if (fresh) el.scrollIntoView({ block: 'nearest' });
}
/** Wire it up. `page`: the page has no menu (?bench): the line on the page itself. */
export function initLoadLine(page = false) {
  alone = page; el.id = 'loadLine'; el.hidden = true; el.classList.toggle('alone', page);
  el.innerHTML = '<span role="status"></span><progress></progress><button type="button" class="ib" hidden>RETRY</button>';
  el.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); retryArt(); });
  onArt(draw);
  for (const id of ['menuHome', 'menuSolo', 'online', 'start', 'btnOnlineReady']) new MutationObserver(() => draw(art)).observe($(id), { attributes: true, attributeFilter: ['hidden'] }); // (it moves with the pages)
}
