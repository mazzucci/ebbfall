// PROTOTYPE ONLY (branch hud-options, an options round, no PR): which desktop HUD option the page shows, from the URL.
//   ?hud=1  the Console: one docked band across the bottom, the top bar's pieces on its shoulders
//   ?hud=2  the Corners: today's floating panels, scaled and filled for a monitor
//   ?hud=3  the Sidebar: one column at the right, led by a large minimap
// No ?hud: main as shipped. Each option also turns on the stand-in for the pending edge-to-edge map (`e2e` on the
// root: src/hud-options.css). A shipped option would drop this file and the switch: its rules would be the rules.
export const HUD = Math.max(0, Math.min(3, +new URLSearchParams(location.search).get('hud') || 0));
if (HUD) document.documentElement.classList.add('e2e', 'hud-' + HUD);
/** The options' desktop layouts: a mouse and a window at least 1100 px wide (hud-options.css has the same query). */
export const deskMq = matchMedia('(min-width: 1100px) and (min-height: 560px) and (pointer: fine)');
export const hudDesk = () => HUD > 0 && deskMq.matches;
