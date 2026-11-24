// The desktop review's switches (a prototype: branch desktop-review, not for main as it is). Off by default: the game
// without them is today's.
//   ?span=N   the desktop's START_SPAN (gl/render.js startZoom): the world px a window shows across when a game
//             starts; 900 is today's, 1200 and 1500 the candidates (any whole number from 600 to 2400).
//   ?hud=1|2  the desktop HUD's unit `--u` capped at 1.0 (1) or 1.1 (2) where today's grows to 1.4, with the review's
//             size table (style.css, its last block, under :root[data-hud]); 0 or nothing: today's HUD.
// Both only matter with a mouse (the desktop's start zoom, the desktop HUD's media query): a phone or a tablet reads
// neither. `setHud` and `review.span` can be set again on a running page (window.endfall.review: tools/view-capture.mjs
// shoots every variant of one staged game).
const q = new URLSearchParams(location.search);
const CAPS = { 0: 1.4, 1: 1, 2: 1.1 };
const span = Math.round(+q.get('span'));
export const review = { span: span >= 600 && span <= 2400 ? span : 900, hud: 0 };
/** The HUD variant: 0 today's, 1 or 2 the capped ones; the root's data-hud attribute is what the style sheet reads. */
export function setHud(n) {
  review.hud = +n === 1 || +n === 2 ? +n : 0;
  if (review.hud) document.documentElement.dataset.hud = String(review.hud); else delete document.documentElement.dataset.hud;
}
/** The most `--u` grows to (hud.js hudU repeats the style sheet's clamp). */
export const hudCap = () => CAPS[review.hud];
setHud(q.get('hud'));
