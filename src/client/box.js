// The game's box (span-cap prototype, behind ?box=WxH): on a very large window the game stops growing at a maximum CSS
// size and sits centered, its aspect at most ASPECT_MAX, on the menu's floor with a thin frame line. #app is the box:
// style.css (html.boxed) gives it a transform, so the HUD, the menus and every other fixed layer inside it are laid out
// in it, not at the window's corners; the stage inside it is what render.js resize() reads, so view.w and view.h are
// the box's. The size is a 16:9 one (2560x1440): its height is the cap, and a wider window may widen the box at that
// height up to ASPECT_MAX (a 21:9 monitor gets no bars; a 32:9 one is pillarboxed).
const q = new URLSearchParams(location.search).get('box');
const m = q && /^(\d+)x(\d+)$/.exec(q);
/** Wider than this is pillarboxed: 2.4, not 21/9 = 2.333, so that a 3440x1440 monitor (sold as 21:9, really 2.39) and
 *  a 2560x1080 one (2.37) fill their screens. */
export const ASPECT_MAX = 2.4;
const MAX_H = m ? +m[2] : 0;

/** The box (CSS px) for a window of w x h: the window's aspect, capped; no taller than MAX_H; never larger than it. */
export function boxFor(w, h) {
  const a = Math.min(w / h, ASPECT_MAX), bh = Math.min(h, MAX_H || h, w / a);
  return { w: Math.round(bh * a), h: Math.round(bh) };
}

function fit() {
  const root = document.documentElement, b = boxFor(innerWidth, innerHeight), boxed = b.w < innerWidth || b.h < innerHeight;
  root.classList.toggle('boxed', boxed);
  root.style.setProperty('--box-w', boxed ? `${b.w}px` : '100vw');
  root.style.setProperty('--box-h', boxed ? `${b.h}px` : '100dvh');
}
if (m) { fit(); addEventListener('resize', fit); }

/** The rectangle the fixed layers are laid out in (viewport px): the box, or the window. */
export function layerRect() {
  const r = document.documentElement.classList.contains('boxed') ? document.getElementById('app').getBoundingClientRect() : null;
  return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
}
