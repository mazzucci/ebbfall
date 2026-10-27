// Full screen, landscape lock and the "leave the game?" guard (back swipe/button, Backspace, closing the tab). The
// buttons that go full screen and out of it are corner.js's.
import { $ } from './hud.js';

const root = document.documentElement, ua = navigator.userAgent;
const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
export const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
export const touchDevice = matchMedia('(pointer: coarse)').matches;
export const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
// Whether the page's own full screen (the Fullscreen API) works for a game here. Not in WebKit on iPad (Safari, and
// every iPad browser, WebKit underneath; iPadOS Safari says Macintosh, with touch): in a page's full screen tapped a
// lot it asks "exit full screen? the website may be showing a fake keyboard" or leaves by itself, a guard against
// phishing that a page cannot turn off. Not on iPhone: no API for pages. There, full screen is the Home Screen app's.
// (A capability, not a layout: the top bar and the corner are the same everywhere.)
const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const ios = ipad || /iPhone|iPod/.test(ua);
export const pageFullscreenWorks = canFullscreen && !ios;
/** The full-screen button opens the Add to Home Screen card instead (not in the Home Screen app: full screen already). */
export const homeScreenOnly = !standalone && (ios || (!canFullscreen && touchDevice));
/** The device the card names. */
export const homeScreenDevice = ipad ? 'iPad' : 'iPhone';
/** The full-screen button goes in and out (not needed when launched from the home screen). */
export const canGoFullscreen = pageFullscreenWorks && !standalone;

/** Go full screen (must run inside a user gesture) and try to lock landscape; failures are fine. */
export async function enterFullscreen() {
  if (!pageFullscreenWorks || isFull()) return;
  try { await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen()); } catch { return; }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not supported or not allowed */ }
}
/** Leave full screen if in it (failures are fine). */
export async function exitFullscreen() {
  if (!isFull()) return;
  try { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); } catch { /* ignore */ }
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
