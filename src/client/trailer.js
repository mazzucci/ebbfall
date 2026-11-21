// The trailer on the menu's first page (index.html #menuTrailer and #trailerDlg; style.css): a still poster, the King's
// card, with a play button, in the frame above the buttons (beside them on a phone on its side). A still, not a moving
// clip: the menu's field under the page shows the same armies, and a moving picture over it competed with it. A tap
// opens the trailer in a dialog over the page and plays it there, with its sound and the browser's controls:
//   - nothing of the video is in the page before that tap: the page holds the poster (public/menu/trailer.jpg, the
//     game's own file, in the offline cache); the <video> is made on the first tap, its words from the dialog's frame
//     (data-title, data-label), and only then given its source. (A <video> in the markup, even with no source, made
//     Firefox fetch the page's backdrop twice on a reload under the service worker and cancel one: static.e2e.mjs.)
//   - it never plays by itself (no autoplay, so reduced motion and Save-Data need nothing more) and never loops: it
//     stops on its end card;
//   - its sound is its own, not the game's: a muted game does not mute it (the player chose to play it, with a tap) and
//     it goes through no WebAudio context (audio.js's wind and clicks are untouched);
//   - it pauses, and never starts again by itself, when the dialog closes (CLOSE, Esc, a tap outside it), when the tab
//     is hidden or left, when a link is followed (the music's credit), and when the first page is left (a game started
//     from any button, the tutorial, a game that starts over the socket, another menu page, the lobby); a game started
//     lets go of its source (its decoder and its buffer are the game's to have);
//   - offline (the video is web-only: tools/offline/plugin.mjs, docs/) it says it needs a connection.
// The file is served with byte ranges by the site's Worker (site/media.js, /docs/media/*.mp4): Safari plays a video
// only from a server that answers a range with 206. No inline style (the site's CSP).
import { $ } from './ui.js';

/** The trailer (public/docs/media/: the Worker's byte ranges; web-only, never in the offline cache). */
export const TRAILER_SRC = './docs/media/ebbfall-trailer.mp4';
/** Its poster, the frame's still: the video's too, shown while it starts. */
const POSTER = './menu/trailer.jpg';

/** Wire the first page's trailer. */
export function initTrailer() {
  const box = $('menuTrailer'), poster = $('menuTrailerPoster'), dlg = $('trailerDlg'), frame = $('trailerFrame'), note = $('trailerNote');
  if (!box || !dlg || !frame) return;
  // No poster (its file missing): no empty frame; the buttons take its room (style.css `notrailer`: the plain column).
  const gone = () => { box.hidden = true; $('menuHome').classList.add('notrailer'); };
  if (poster) { if (poster.complete && !poster.naturalWidth) gone(); else poster.addEventListener('error', gone, { once: true }); }

  let v = null;
  /** The video, made once: controls, inline, nothing fetched until its source is set. */
  const make = () => {
    v = document.createElement('video');
    v.id = 'trailerVideo'; v.width = 1280; v.height = 720; v.controls = true; v.playsInline = true; v.preload = 'none';
    v.setAttribute('playsinline', ''); // (as an attribute too: iOS reads it)
    v.title = frame.dataset.title; v.setAttribute('aria-label', frame.dataset.label); v.poster = POSTER;
    v.addEventListener('error', () => { if (v.hasAttribute('src')) { note.hidden = false; v.removeAttribute('src'); } });
    $('trailerClose').after(v);
  };
  const pause = () => { if (v && !v.paused) v.pause(); };
  const release = () => { pause(); if (v?.hasAttribute('src')) { v.removeAttribute('src'); v.load(); } };
  const close = () => { if (dlg.open) dlg.close(); };
  box.addEventListener('click', () => {
    note.hidden = true;
    if (!dlg.open) dlg.showModal();
    if (!v) make();
    if (!v.hasAttribute('src')) v.src = TRAILER_SRC;
    v.play().catch(() => {}); // (refused, iOS Low Power Mode: the controls are there to press)
  });
  $('trailerClose').addEventListener('click', close);
  dlg.addEventListener('close', pause); // (CLOSE, Esc)
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // (a tap on the scrim, outside the video)
  // Hidden or left, a link followed: paused, and it stays so.
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('pagehide', pause);
  document.addEventListener('click', (e) => { if (e.target.closest?.('a[href]')) pause(); }, true);
  // The first page left: a game started (from any button, or over the socket: the menu's screen hidden) lets go of the
  // source; another menu page or the lobby closes the dialog (paused).
  const left = () => {
    if ($('start').hidden) { close(); release(); } else if ($('menuHome').hidden) close();
  };
  new MutationObserver(left).observe($('start'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(left).observe($('menuHome'), { attributes: true, attributeFilter: ['hidden'] });
}
