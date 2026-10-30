// The OPTIONS card: this device's settings, a row each (OPTIONS below: a setting is one more entry there). It opens from
// the menu's first page and from the pause card (over it: the game stays paused, and the corner keeps the pause card's
// rule, full screen only); BACK or Esc returns to whichever opened it. Its buttons show only where some setting applies
// to this device: today only CONTROLS, for a mouse and a keyboard, so none on a touch screen. While it is up the page
// under it is inert (ui.js `modalCards`), as under How to play.
import { $, modalCards } from './ui.js';
import { chipRow } from './seats.js';
import { SCHEMES, scheme, setScheme, offered } from './controls.js';

/** The settings: `applies()` on this device, the row's label, its choices ([key, chip text, title?]), the chosen key,
 *  `pick(key)`, and the line under the chips (what the chosen one does). */
const OPTIONS = [
  { name: 'controls', label: 'CONTROLS', applies: offered, choices: () => Object.entries(SCHEMES).map(([k, v]) => [k, v.chip]),
    value: scheme, pick: setScheme, line: () => SCHEMES[scheme()].line },
];

/** Whether this device has anything to set (the OPTIONS buttons show only then). */
export const anyOptions = () => OPTIONS.some(o => o.applies());

/** Draw the rows; `focus`: the name of the row whose lit chip takes the focus (its chips are made anew). */
function render(focus = '') {
  const list = $('optionsList'); list.replaceChildren();
  for (const o of OPTIONS.filter(o => o.applies())) {
    const row = document.createElement('div'); row.className = 'setting';
    const opt = document.createElement('div'); opt.className = 'opt';
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = o.label;
    const chips = chipRow(o.choices(), o.value(), o.label[0] + o.label.slice(1).toLowerCase(), (k) => { o.pick(k); render(o.name); }, { name: o.name });
    opt.append(lbl, chips);
    const line = document.createElement('div'); line.className = 'line'; line.textContent = o.line();
    row.append(opt, line); list.appendChild(row);
    if (focus === o.name) chips.querySelector('[aria-checked="true"]')?.focus();
  }
}

let opener = null;
export const optionsOpen = () => !$('options').hidden;
function openOptions() {
  opener = document.activeElement; render();
  $('options').hidden = false;
  ($('optionsList').querySelector('[aria-checked="true"]') || $('btnOptionsClose')).focus();
}
let settle = () => {};
function closeOptions() {
  $('options').hidden = true; settle(); // (the page under it out of `inert` now, so the focus can go back)
  if (opener?.isConnected && opener.offsetParent !== null) opener.focus(); opener = null;
}

/** Wire the card and its two buttons (the menu's and the pause card's). */
export function initOptions() {
  settle = modalCards(['help', 'options']); // (How to play too: Tab stays in the card)
  for (const id of ['btnOptions', 'btnPauseOptions']) { const b = $(id); b.hidden = !anyOptions(); b.addEventListener('click', openOptions); }
  $('btnOptionsClose').addEventListener('click', closeOptions);
  // Esc closes it, before anything under it (the pause card) sees the key.
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && optionsOpen()) { e.preventDefault(); e.stopImmediatePropagation(); closeOptions(); } }, true);
}
