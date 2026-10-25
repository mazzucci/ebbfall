// HUD icons: simple line drawings (24x24, stroked in the current text colour) for commands and the top bar, and
// sprite portraits of units and buildings cut from the art atlas.
import { artIcon } from './gl/render.js';
import { G } from '../engine/index.js';

const P = {
  move: 'M5 19 19 5M9 5h10v10',
  stop: 'M7 4h10l3 3v10l-3 3H7l-3-3V7z',
  attack: 'M12 5a7 7 0 1 0 .01 0M12 2v6M12 16v6M2 12h6M16 12h6',
  hold: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z',
  gather: 'M12 3 6 10l6 11 6-11zM6 10h12M10 10l2 11 2-11',
  build: 'M13 7l4 4M4 20l8.5-8.5M10 5l3-2 8 8-2 3z',
  rally: 'M6 21V4M6 4h11l-3 4 3 4H6',
  repair: 'M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4 16.4 7.6 20l6.3-6.3A4.5 4.5 0 0 0 20 9.5l-2.6 2.6-2.9-.5-.5-2.9L16.6 6a4.5 4.5 0 0 0-2.1-2z',
  back: 'M10 6 4 12l6 6M4 12h16',
  x: 'M6 6l12 12M18 6 6 18',
  resume: 'M8 5v14l11-7z',
  weapons: 'M5 19 16 8M13 5h6v6M7 14l3 3M5 5v4M3 7h4',
  dmg: 'M19 5v4L9.5 18.5l-4-4L15 5zM7.5 16.5 4 20M6 13l5 5',
  air: 'M12 3c1 1 1.5 2.5 1.5 4.5v3l7 4v2l-7-2v3.5l2.5 2V21L12 20l-4 1v-1l2.5-2v-3.5l-7 2v-2l7-4v-3C10.5 5.5 11 4 12 3z',
  heal: 'M12 5v14M5 12h14',
  armor: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6zM12 9v6M9 12h6',
  stim: 'M13 2 5 14h6l-2 8 8-12h-6z',
  speed: 'M5 6l6 6-6 6M12 6l6 6-6 6',
  entrench: 'M4 18h16M6 18v-4h12v4M9 14V9h6v5M12 9V4',
  blink: 'M4 12h9M10 8l4 4-4 4M17 6v12M20 9v6',
  overcharge: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M14 2l1 4-4-1',
  shields: 'M12 3a9 9 0 1 0 0.01 0M12 7a5 5 0 1 0 0.01 0M12 3v4M21 12h-4M12 21v-4M3 12h4',
  full: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  unfull: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  pause: 'M8 5v14M16 5v14',
  home: 'M3 11 12 4l9 7M5 9.5V20h5v-6h4v6h5V9.5',
  help: 'M12 3a9 9 0 1 0 .01 0M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
};

/** Give a top-bar button an icon and a label (the label shows on wide screens only). */
export function setIconButton(el, name, label) { el.innerHTML = icon(name) + `<span class="t">${label}</span>`; }

/** Inline SVG markup for a line icon. */
// A tech shows the icon of what it gives.
Object.assign(P, { entrenching: P.entrench, overchargeCore: P.overcharge, afterburners: P.speed, slipstream: P.speed });
export const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`;

/** An <img> portrait of a unit type, building type or resource field ('node': 'shard' / 'ether'), or ''. In `team`'s
 * colours: this client's own seat unless told otherwise. */
export function portrait(kind, type, size = 26, team = G.me) {
  const url = kind === 'unit' ? artIcon(`${type}_${team}_2_0`, size, 2.1) // unit frames carry room for the shadow
    : kind === 'node' ? artIcon(type === 'ether' ? 'vent_0' : 'shard_0', size, 1.2) : artIcon(`bldg_${type}_${team}`, size, 1.1);
  return url ? `<img class="por" src="${url}" alt="" width="${size}" height="${size}">` : '';
}
