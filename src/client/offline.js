// Install and offline, on the menu: INSTALL on the first page, only where the browser offers to install the game as an
// app (Chrome and Edge, on Android and desktop: `beforeinstallprompt`) and not once installed (iPhone Safari has its
// Add to Home Screen tip instead, screen.js); CHECK OFFLINE on the About page, which asks the service worker
// (tools/offline/sw.js) how much of the game it has stored and says it plainly.
import { $ } from './hud.js';
import { standalone } from './screen.js';

let offer = null; // the browser's install offer, kept for the tap
const showInstall = () => { const b = $('btnInstall'); if (b) b.hidden = !offer || standalone; };
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; showInstall(); }); // (our button, not the browser's banner)
addEventListener('appinstalled', () => { offer = null; showInstall(); });

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

/** The sentence CHECK OFFLINE shows for a status (`build`: this page's version). */
export function offlineText(s, build) {
  if (s.state === 'unavailable') return "Offline play isn't available in this browser.";
  if (s.state === 'none') return 'Not yet. Stay online a moment and check again.';
  if (s.state === 'partial') return `Not yet: ${s.stored} of ${s.total} files stored. Stay online a moment and check again.`;
  return `Ready to play offline: all ${s.total} files stored. Version ${s.version}${s.version !== build ? ' (new: it loads next time)' : ''}.${s.newer ? ' A newer version is on its way.' : ''}`;
}

/** Wire INSTALL and CHECK OFFLINE (`build`: the version the About page shows). */
export function initOffline(build) {
  showInstall();
  $('btnInstall').addEventListener('click', async () => {
    const e = offer; if (!e) return;
    try { await e.prompt(); await e.userChoice; } catch { /* already used, or not allowed */ }
    if (offer === e) offer = null; // (an offer prompts once; the browser may make another later)
    showInstall();
  });
  const msg = $('offlineMsg'), btn = $('btnOffline');
  btn.addEventListener('click', async () => {
    btn.disabled = true; msg.textContent = 'Checking…';
    try { msg.textContent = offlineText(await offlineStatus(), build); } finally { btn.disabled = false; }
  });
}
