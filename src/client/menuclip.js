// The gameplay clip on the menu's first page (index.html #menuClip): the docs home's clip, a dozen seconds of Drones
// against a Watchtower, muted and looped over its poster. A glimpse of the game for someone who has just landed; it
// never delays the menu:
//   - the page holds the poster only (an <img>, the game's own copy: public/menu/clip-*.webp, tools/menu-clip.mjs), no
//     <video>: nothing of the clip is fetched or decoded while the menu and the game load;
//   - the video is made here, and only once the game is in: `ready` is boot.js's `loading`, the import of main.js,
//     which ends when the sim's WASM and the renderer's art are in (gl/render.js awaits atlas.json, every atlas page
//     and its decoded copy at its top level), loaded or failed; then the page's load event; then an idle moment;
//   - never where less was asked for: reduced motion, Save-Data, a 2g connection. The poster stays;
//   - it plays only while the first page is on screen (another menu page, another tab: paused), and a game started
//     lets go of it (its decoder and its buffer are the game's to have); back on the menu it is made again;
//   - a play() refused (iOS Low Power Mode) or a file that never comes (offline: the clip is the docs', web-only,
//     tools/offline/plugin.mjs): the poster stays, and it is not asked for again.
// The clip is the docs' file, served with byte ranges by the site's Worker (site/media.js). No inline style (the site's
// CSP): the fade is style.css's (#menuClip.on).
import { $ } from './ui.js';

/** The clip (tools/docs/shots.json `trailer.file`: test/menu-clip.test.js keeps the two the same). */
export const CLIP_SRC = './docs/media/trailer.mp4';

/** Whether this browser asked for less: no moving pictures, or less data. */
export const wantsLess = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');

/** Wire the first page's clip. `ready`: a promise that settles when the game has loaded (or could not). */
export function initMenuClip({ ready }) {
  const box = $('menuClip'), poster = $('menuClipPoster');
  if (!box || !poster) return;
  // No poster (its file missing): no empty frame; the buttons take its room.
  const gone = () => { box.hidden = true; };
  if (poster.complete && !poster.naturalWidth) gone(); else poster.addEventListener('error', gone, { once: true });
  if (wantsLess()) return;
  const idle = (f) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 300));
  const loaded = new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
  Promise.resolve(ready).catch(() => {}).then(() => loaded).then(() => idle(() => watch(box)));
}

/** Play the clip in `box` while it is on screen; let go of it when the menu is (a game). */
function watch(box) {
  let v = null, seen = false, failed = false;
  const drop = () => { if (!v) return; v.pause(); v.removeAttribute('src'); v.load(); v.remove(); v = null; box.classList.remove('on'); };
  const make = () => {
    v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true; v.tabIndex = -1;
    for (const a of ['muted', 'playsinline']) v.setAttribute(a, ''); // (as attributes too: iOS reads them)
    v.setAttribute('aria-hidden', 'true'); // (the poster under it carries the words)
    v.addEventListener('playing', () => box.classList.add('on'), { once: true });
    v.addEventListener('error', () => { failed = true; drop(); }, { once: true });
    v.src = CLIP_SRC; box.appendChild(v);
  };
  const sync = () => {
    if (seen && !document.hidden && !box.hidden) { if (failed) return; if (!v) make(); v.play().catch(() => {}); }
    else if (v) { if ($('start').hidden) drop(); else v.pause(); }
  };
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; sync(); }).observe(box);
  else seen = true;
  document.addEventListener('visibilitychange', sync);
  sync();
}
