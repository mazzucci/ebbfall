// Full screen, landscape lock and the "leave the game?" guard (back swipe/button, Backspace, closing the tab).
import { $ } from './ui.js';
import { setIconButton } from './icons.js';

const root = document.documentElement;
const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
export const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
export const touchDevice = matchMedia('(pointer: coarse)').matches;
export const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
/** A tap can take the page full screen here (not on iPhone Safari, and not needed when launched from the home screen). */
export const canGoFullscreen = canFullscreen && !standalone;

/** Go full screen (must run inside a user gesture) and try to lock landscape; failures are fine. */
export async function enterFullscreen() {
  if (!canFullscreen || isFull()) return;
  try { await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen()); } catch { return; }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not supported or not allowed */ }
}
/** Leave full screen if in it (failures are fine). */
export async function exitFullscreen() {
  if (!isFull()) return;
  try { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); } catch { /* ignore */ }
}
async function toggleFullscreen() {
  if (!isFull()) return enterFullscreen();
  try { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); } catch { /* ignore */ }
}

/** Wire the full-screen button and the iPhone tip. (No "turn your phone" card: the tap that starts goes full screen,
 *  which locks landscape where the browser can.) */
export function initScreen() {
  const btn = $('btnFull');
  if (!canFullscreen || standalone) btn.hidden = true;
  btn.addEventListener('click', toggleFullscreen);
  const sync = () => { setIconButton(btn, isFull() ? 'unfull' : 'full', isFull() ? 'EXIT FULL' : 'FULL SCREEN'); btn.title = isFull() ? 'Leave full screen' : 'Full screen'; };
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync); sync();
  // iPhone Safari has no full-screen API for pages; a home-screen web app opens full screen instead.
  if (!canFullscreen && touchDevice && !standalone) $('iosTip').hidden = false;
}

// ---- leave guard ----
let armed = false, onLeave = () => {}, onAsk = () => {}, onResume = () => {};

/**
 * Arm while a game is in progress. A back swipe/button pops the history entry pushed here, which opens the
 * leave dialog instead of leaving; Backspace opens it too; reloading or closing the tab asks via the browser
 * (except on iOS Safari, which never fires beforeunload).
 */
export function armLeaveGuard(handlers) {
  ({ onLeave, onAsk, onResume } = handlers);
  if (armed) return;
  armed = true;
  if (history.state?.endfall !== 'game') history.pushState({ endfall: 'game' }, ''); // adopt, never stack
}
export function disarmLeaveGuard() {
  if (!armed) return;
  armed = false;
  if (history.state && history.state.endfall === 'game') history.back();
}
export function askLeave() { if (armed) { $('leave').hidden = false; onAsk(); $('btnStay').focus(); } }

// A guard entry left over from before a reload or tab restore: drop it (armed is false, so the popstate is ignored).
if (history.state?.endfall === 'game') history.back();

addEventListener('popstate', () => {
  if (!armed) return;
  // The back gesture already consumed our entry: put it back so the next one is caught too, then ask.
  history.pushState({ endfall: 'game' }, '');
  askLeave();
});
addEventListener('beforeunload', (e) => { if (armed) { e.preventDefault(); e.returnValue = ''; } });

export function initLeaveDialog() {
  $('btnStay').addEventListener('click', () => { $('leave').hidden = true; onResume(); });
  $('btnLeave').addEventListener('click', () => { $('leave').hidden = true; disarmLeaveGuard(); onLeave(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('leave').hidden) { e.preventDefault(); $('btnStay').click(); } });
}
