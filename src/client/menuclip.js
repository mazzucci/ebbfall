// The gameplay clip on the menu's first page (index.html #menuClip): the docs home's clip, a dozen seconds of Drones
// against a Watchtower, muted and looped over its poster. A glimpse of the game for someone who has just landed; it
// never delays the menu:
//   - the page holds the poster only (an <img>, the game's own copy: public/menu/clip-*.webp, tools/menu-clip.mjs), no
//     <video>: nothing of the clip is fetched or decoded while the menu and the game load;
//   - the video is made here, and only once the game is in: `ready` is boot.js's `loading`, the import of main.js,
//     which ends when the sim's WASM and the renderer's art are in (gl/render.js awaits atlas.json, every atlas page
//     and its decoded copy at its top level), loaded or failed; then the page's load event; then an idle moment;
//   - never where less was asked for (reduced motion, Save-Data, a 2g connection), nor where the browser cannot play
//     it (no H.264 decoder). The poster stays;
//   - it plays only while the first page is on screen (Single player's page, another tab: paused), and leaving the
//     menu lets go of it (a game, the lobby on the way to one: its decoder and its buffer are the game's to have);
//     back on the first page it is made again;
//   - a play() the browser refuses (iOS Low Power Mode) or a file that never comes (offline: the clip is the docs',
//     web-only, tools/offline/plugin.mjs): the poster stays, the video is let go of and not asked for again.
// The clip is the docs' file, served with byte ranges by the site's Worker (site/media.js). No inline style (the site's
// CSP): the fade is style.css's (#menuClip.on).
import { $ } from './ui.js';

/** The clip (tools/docs/shots.json `trailer.file`: test/menu-clip.test.js keeps the two the same). */
export const CLIP_SRC = './docs/media/trailer.mp4';

/** The clip's kind (tools/docs/shots.mjs encodes H.264 High, level 4.0): a browser that cannot play it is not asked to. */
const CLIP_TYPE = 'video/mp4; codecs="avc1.640028"';
/** Whether this browser asked for less: no moving pictures, or less data. */
export const wantsLess = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');

/** Wire the first page's clip. `ready`: a promise that settles when the game has loaded (or could not). */
export function initMenuClip({ ready }) {
  const box = $('menuClip'), poster = $('menuClipPoster');
  if (!box || !poster) return;
  // No poster (its file missing): no empty frame; the buttons take its room (style.css `noclip`: the plain column).
  const gone = () => { box.hidden = true; $('menuHome').classList.add('noclip'); };
  if (poster.complete && !poster.naturalWidth) gone(); else poster.addEventListener('error', gone, { once: true });
  if (wantsLess() || !document.createElement('video').canPlayType(CLIP_TYPE)) return;
  const idle = (f) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 300));
  const loaded = new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
  Promise.resolve(ready).catch(() => {}).then(() => loaded).then(() => idle(() => watch(box)));
}

/** Play the clip in `box` while it is on screen; let go of it when the menu is left (a game, the lobby). */
function watch(box) {
  let v = null, seen = false, failed = false;
  const give = () => { failed = true; drop(); }; // (it cannot play here: the poster stays)
  const drop = () => { if (!v) return; v.pause(); v.removeAttribute('src'); v.load(); v.remove(); v = null; box.classList.remove('on'); };
  const make = () => {
    v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true; v.tabIndex = -1;
    for (const a of ['muted', 'playsinline']) v.setAttribute(a, ''); // (as attributes too: iOS reads them)
    v.setAttribute('aria-hidden', 'true'); // (the poster under it carries the words)
    v.addEventListener('playing', () => box.classList.add('on'), { once: true });
    v.addEventListener('error', (e) => { if (e.target === v) give(); }, { once: true });
    v.src = CLIP_SRC; box.appendChild(v);
  };
  const sync = () => {
    if (seen && !document.hidden && !box.hidden && !$('start').hidden) {
      if (failed) return;
      if (!v) make();
      const mine = v;
      mine.play().catch((e) => { if (e?.name === 'NotAllowedError' && mine === v) give(); }); // (refused; an AbortError is our own pause)
    } else if (v) { if ($('start').hidden) drop(); else v.pause(); }
  };
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; sync(); }).observe(box);
  else seen = true;
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe($('start'), { attributes: true, attributeFilter: ['hidden'] }); // (a game started from another menu page: the box was out of view already, the observer above says nothing)
  sync();
}
