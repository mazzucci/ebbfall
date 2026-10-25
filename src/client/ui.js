// Client-side UI state: what the local player has selected, which order is armed (and the hint that says so),
// toasts. No DOM builders here (hud.js and card.js draw), so input.js and tools.js can share the state cheaply.
import { G, BUILDINGS, FACTIONS } from '../engine/index.js';
import { sfx } from './audio.js';

export const $ = (id) => document.getElementById(id);

/** Client-only UI state: what the local player has selected and which command is armed. */
export const ui = { sel: [], mode: null, place: null, groups: {}, lastGroup: null, lastGroupT: 0, box: false }; // box: SELECT armed ('held' / 'once')

/** Show a message; `bad` styles it red (and plays the error sound unless `silent`). */
export function toast(msg, bad, silent) {
  const m = $('msg'); const d = document.createElement('div');
  for (const t of [...m.children]) if (t.textContent === msg) t.remove(); // the same message again replaces itself (no storm), fresh
  d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = msg; m.appendChild(d);
  // Two at most (news, not a dashboard): the oldest goes first, an alert last.
  while (m.children.length > 2) (m.querySelector('.toast:not(.bad)') || m.firstChild).remove();
  setTimeout(() => d.remove(), 3300);
  if (bad && !silent) sfx('error');
}

/** The selection, minus what is not ours or is gone. */
export const playerSel = () => ui.sel.filter(e => e.team === G.me && !e.dead);

export const touchUi = matchMedia('(pointer: coarse)').matches;

/**
 * Orders armed from the command card that wait for a tap or click on the map. Each says which card button it
 * belongs to (that button turns into its Cancel), the hint shown while armed, and whether a tap on the minimap fires
 * it. What a tap does is in input.js (`armedTap`). `ui.mode` is one of these keys, or a Build page ('build',
 * 'build2'), or 'place' while a building is being placed.
 */
export const ARMED = {
  attack: { button: 'attack', minimap: true, hint: (c) => `Attack-move: ${c.toLowerCase()} a target or the ground` },
  move: { button: 'move', minimap: true, hint: (c) => `${c} where to move` },
  gather: { button: 'gather', hint: (c) => `${c} a shard field or ${BUILDINGS[(FACTIONS[G.factions[G.me]] || FACTIONS.humans).ether].name}` },
  rally: { button: 'rally', hint: (c) => `${c} where new units should gather` },
  repair: { button: 'repair', hint: (c) => `${c} a damaged building to repair` },
};

/** The card button the armed order (or placement) belongs to, if any. */
export const armedButton = () => (ui.place ? 'build' : ARMED[ui.mode]?.button);

/** Reflect ui.box on the SELECT button (input.js arms it; Esc and placement clear it). */
export function setBox() { const b = $('btnBox'); if (b) { b.classList.toggle('on', !!ui.box); b.setAttribute('aria-pressed', String(!!ui.box)); } }

/** The line above the card that says what a tap will do now. */
export function setHint() {
  const h = $('hint'), c = touchUi ? 'Tap' : 'Click';
  h.textContent = ui.place ? (touchUi ? `Pick a location for the ${BUILDINGS[ui.place.type].name}: green builds, red cannot` : `Click to place the ${BUILDINGS[ui.place.type].name} (Esc cancels)`)
    : ui.box ? 'Drag to select a group' : ARMED[ui.mode]?.hint(c) ?? '';
}

/** Disarm: no order waiting for a tap, nothing being placed. */
export function clearMode() { ui.mode = null; ui.place = null; setHint(); }

/** Select `list` (and disarm). The caller redraws the HUD (updateHud) when it needs to at once. */
export function setSelection(list) { ui.sel = list; clearMode(); }
