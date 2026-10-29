// Full screen, landscape lock and the "leave the game?" guard (back swipe/button, Backspace, closing the tab). The
// buttons that go full screen and out of it are corner.js's.
import { $ } from './ui.js';

const root = document.documentElement, ua = navigator.userAgent;
const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
export const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
export const touchDevice = matchMedia('(pointer: coarse)').matches;
/** Opened as an installed app (the Home Screen's, or a browser's install). */
export const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
/** Opened full screen already: an installed app that runs full screen (manifest.webmanifest asks for it). */
const appFull = matchMedia('(display-mode: fullscreen)').matches || !!navigator.standalone;
// Whether the page's own full screen (the Fullscreen API) works for a game here. Not in WebKit on iPad (Safari, and
// every iPad browser, WebKit underneath; iPadOS Safari says Macintosh, with touch): in a page's full screen tapped a
// lot it asks "exit full screen? the website may be showing a fake keyboard" or leaves by itself, a guard against
// phishing that a page cannot turn off. Not on iPhone: no API for pages. There, full screen is the Home Screen app's.
// (A capability, not a layout: the top bar and the corner are the same everywhere.)
const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const ios = ipad || /iPhone|iPod/.test(ua);
export const pageFullscreenWorks = canFullscreen && !ios;
/** Page full screen does not work here, and the browser can add the game to the Home Screen (iPad, iPhone; not once
 *  added): the full-screen button and INSTALL open the card that says how. */
export const homeScreenOnly = ios && !standalone;
/** The full-screen button goes in and out (not in an app that opened full screen). */
export const canGoFullscreen = pageFullscreenWorks && !appFull;

// The player's choice wins: leaving full screen with the full-screen button means no automatic entry (START, FIRST
// GAME, REMATCH, READY, BACK TO GAME) for the rest of the visit, until the button goes full screen again. Kept in
// memory only. Any other exit (PAUSE's own, Esc, the system's back gesture, the page going to the background) is not a
// choice: the next automatic entry goes back in.
let declined = false;

async function goFull() {
  try { await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen()); } catch { return; }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not supported or not allowed */ }
}
const goOut = async () => { try { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); } catch { /* ignore */ } };
// The automatic entries (START, FIRST GAME, REMATCH, READY, the device test's START) are for a touch screen, where the
// browser's bars take room the game needs. With a mouse (a desktop or laptop: room enough, and Esc belongs to the game,
// not to leaving full screen) they do nothing; the full-screen button still goes in. (By the input, not the device.)
const autoFull = touchDevice;
/** Go full screen, unless the player chose to leave it or there is a mouse (must run inside a user gesture; failures
 *  are fine). `restore`: back to the full screen a pause left (BACK TO GAME), whatever the input. */
export async function enterFullscreen({ restore = false } = {}) {
  if (!pageFullscreenWorks || declined || isFull() || (!autoFull && !restore)) return;
  await goFull();
}
/** Leave full screen if in it, on the game's account (PAUSE: not the player's choice; failures are fine). */
export async function exitFullscreen() { if (isFull()) await goOut(); }
/** The full-screen button: in (which clears a choice to stay out), or out (the player's choice). */
export async function toggleFullscreen() {
  if (isFull()) { declined = true; await goOut(); return; }
  declined = false;
  if (pageFullscreenWorks) await goFull();
}

// ---- the page in a browser tab ----
// The layout is the dynamic viewport (style.css: 100dvh), so the browser's bars coming and going, a rotation, split
// view or Slide Over resize the stage (main.js watches it). The page itself never scrolls: if the browser moved it
// anyway (a rotation, the keyboard of a field just closed), put it back, and keep the pinch of the page's zoom off it
// (WebKit's gesture events: the map has its own pinch).
const settle = () => { if ((scrollX || scrollY) && !document.activeElement?.matches('input, textarea')) scrollTo(0, 0); };
for (const [t, on] of [['resize', window], ['orientationchange', window], ['resize', window.visualViewport], ['scroll', window]]) on?.addEventListener(t, settle, { passive: true });
document.addEventListener('focusout', () => setTimeout(settle, 100));
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

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
