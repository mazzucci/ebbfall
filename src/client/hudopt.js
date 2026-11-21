// PROTOTYPE ONLY (branch hud-options, an options round, no PR): which desktop HUD option the page shows, from the URL.
//   ?hud=1  the Console: one docked band across the bottom, the top bar's pieces on its shoulders
//   ?hud=2  the Corners: today's floating panels, scaled and filled for a monitor
//   ?hud=3  the Sidebar: one column at the right, led by a large minimap
//   &marks=N  with it: that option's selection mark and health bar instead of the layout's own
// No ?hud: main as shipped. Each option also turns on the stand-in for the pending edge-to-edge map (`e2e` on the
// root: src/hud-options.css). A shipped option would drop this file and the switch: its rules would be the rules.
export const HUD = Math.max(0, Math.min(3, +new URLSearchParams(location.search).get('hud') || 0));
if (HUD) document.documentElement.classList.add('e2e', 'hud-' + HUD);
/** Which option's selection mark and health bar the map draws (render.js): its own option's, or ?marks=N with ?hud=M
 *  to pair one option's layout with another's marks (the recommendation is such a pair: ?hud=2&marks=1). */
export const MARKS = HUD ? Math.max(1, Math.min(3, +new URLSearchParams(location.search).get('marks') || HUD)) : 0;
/** The options' desktop layouts: a mouse and a window at least 1100 px wide (hud-options.css has the same query). */
export const deskMq = matchMedia('(min-width: 1100px) and (min-height: 560px) and (pointer: fine)');
export const hudDesk = () => HUD > 0 && deskMq.matches;
/** The options' unit of size (hud-options.css `--u`): 1 px at 1440 x 810, 0.9 at 1280 x 720, 1.33 at 1920 x 1080. */
export const hudU = () => Math.max(0.9, Math.min(1.4, innerWidth / 1440, innerHeight / 810));
/** A portrait's size (CSS px): `base` as shipped, `big` (in the options' units) on an option's desktop layout. */
export const porSize = (base, big) => (hudDesk() ? Math.round(big * hudU()) : base);
