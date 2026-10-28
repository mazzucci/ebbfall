// Install and offline. The first page has one button for both: INSTALL until the game is installed, then PLAY OFFLINE.
// INSTALL opens the browser's own prompt where it offers one (Chrome and Edge, on Android and desktop:
// `beforeinstallprompt`), or the Add to Home Screen card where that is the way (iPad and iPhone: corner.js); it shows
// on the About page and in the pause card (alone or online) too, every `.install` button, one handler. PLAY OFFLINE
// (the first page once installed, or where nothing can install; always on the About page) asks the service worker
// (tools/offline/sw.js) how much of the game it has stored, which also fetches what is missing, and says so until it
// is all there. Never a prompt or a card the player did not tap for.
import { $ } from './hud.js';
import { standalone, homeScreenOnly } from './screen.js';
import { showHomeTip } from './corner.js';

let offer = null, installed = standalone; // the browser's install offer, kept for the tap; installed: the app, or once it is
/** How INSTALL installs here: the browser's prompt, the Home Screen card, or none (installed, or no way to). */
const installWay = () => (installed ? null : offer ? 'prompt' : homeScreenOnly ? 'card' : null);
function showInstall() {
  const way = installWay();
  for (const b of document.querySelectorAll('.install')) b.hidden = !way;
  const home = $('btnInstall'); if (!home) return;
  home.textContent = way ? 'INSTALL' : 'PLAY OFFLINE';
  home.title = way ? 'Install Ebbfall as an app: its own icon, full screen, plays offline' : 'Is the whole game saved on this device, to play with no connection?';
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; showInstall(); }); // (our button, not the browser's banner)
addEventListener('appinstalled', () => { offer = null; installed = true; showInstall(); });

/** Ask a service worker how much of its build it has stored: {version, total, stored[, error]}, or null (no answer). */
function ask(worker, ms) {
  return new Promise((resolve) => {
    const ch = new MessageChannel(), t = setTimeout(() => { ch.port1.close(); resolve(null); }, ms);
    ch.port1.onmessage = (e) => { clearTimeout(t); ch.port1.close(); resolve(e.data); };
    try { worker.postMessage({ t: 'offline' }, [ch.port2]); } catch { clearTimeout(t); resolve(null); }
  });
}
const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

/** What is stored for offline play: {state: 'ready' | 'partial' | 'none'} with the worker's answer, or 'unavailable'
 *  (no service worker here: an old browser, private mode, storage blocked, or the dev server). The newest worker is
 *  asked (one installing: how far it got; a newer one waiting: the version that loads next); on a first visit the
 *  page may not have registered one yet: wait for it a moment. */
export async function offlineStatus(ms = 4000) {
  const sw = navigator.serviceWorker;
  if (!sw || !window.isSecureContext) return { state: 'unavailable' };
  const any = (r) => r && (r.active || r.installing || r.waiting);
  let reg = await sw.getRegistration().catch(() => null);
  if (!any(reg)) reg = await within(sw.ready, ms);
  // The working copy first (the active worker: what plays offline now); with none yet (a first visit), the one
  // installing. A newer build on its way is only mentioned.
  const worker = reg && (reg.active || reg.installing || reg.waiting);
  if (!worker) return { state: 'unavailable' };
  const s = await ask(worker, ms);
  if (!s) return { state: 'none' }; // (no answer in time: a worker busy installing, or one from before this check)
  if (s.error) return { state: 'unavailable', ...s };
  const newer = !!(reg.active && (reg.installing || reg.waiting));
  return { state: s.stored >= s.total ? 'ready' : 'partial', newer, ...s };
}

/** The sentence PLAY OFFLINE shows for a status (`build`: this page's version). */
export function offlineText(s, build) {
  if (s.state === 'unavailable') return "Offline play isn't available in this browser.";
  if (s.state === 'none') return 'Saving for offline…';
  if (s.state === 'partial') return `Saving for offline… ${Math.floor((100 * s.stored) / s.total)}%`;
  return `Ready to play offline: everything is saved on this device ✓${s.version !== build ? ` (version ${s.version}: it loads next time)` : ''}${s.newer ? ' A newer version is on its way.' : ''}`;
}

/** PLAY OFFLINE: ask, and while it is still saving (each ask fetches what is missing) ask again: for a minute at most,
 *  and not once the page is hidden or the menu is gone (a game started). */
async function playOffline(btn, msg, build) {
  btn.disabled = true; msg.textContent = 'Checking…';
  const until = performance.now() + 60000, away = () => document.hidden || $('start').hidden;
  try {
    for (;;) {
      const s = await offlineStatus();
      msg.textContent = offlineText(s, build);
      if (s.state === 'ready' || s.state === 'unavailable' || away()) break;
      if (performance.now() > until) { msg.textContent += ' Stay online a moment and tap again.'; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally { btn.disabled = false; }
}

/** Wire INSTALL and PLAY OFFLINE (`build`: the version the About page shows). */
export function initOffline(build) {
  showInstall();
  const install = async () => {
    if (installWay() === 'card') { showHomeTip(); return; }
    const e = offer; if (!e) return;
    try { await e.prompt(); await e.userChoice; } catch { /* already used, or not allowed */ }
    if (offer === e) offer = null; // (an offer prompts once; the browser may make another later)
    showInstall();
  };
  for (const b of document.querySelectorAll('.install')) b.addEventListener('click', install);
  const home = $('btnInstall'), about = $('btnOffline');
  home.addEventListener('click', () => (installWay() ? install() : playOffline(home, $('homeOfflineMsg'), build)));
  about.addEventListener('click', () => playOffline(about, $('offlineMsg'), build));
}
