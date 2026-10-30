// The OPTIONS card: this device's settings, a row each (OPTIONS below: a setting is one more entry there). It opens from
// the menu's first page and from the pause card (over it: the game stays paused, and the corner keeps the pause card's
// rule, full screen only); BACK or Esc returns to whichever opened it. Its buttons show only where some setting applies
// to this device: NAME applies everywhere, so always (CONTROLS, for a mouse and a keyboard, only where `(pointer: fine)`).
// While it is up the page under it is inert (ui.js `modalCards`), as under How to play. Opening it never focuses a text
// field (a phone's keyboard would pop up): the first lit chip takes the focus, or BACK; a field only on a tap.
import { $, modalCards } from './ui.js';
import { chipRow } from './seats.js';
import { SCHEMES, scheme, setScheme, offered } from './controls.js';
import { MAX_NAME, playerName } from './store.js';
import { touchDevice } from './screen.js';

/** The settings, each `applies()` on this device, a row `label`, the line under it, and either chips (`choices`:
 *  [key, chip text, title?], the chosen key `value()`, `pick(key)`; the line says what the chosen one does) or a text
 *  `field` ({ get, set, max, placeholder, autocomplete }: shown as `get()`, kept with `set` on change or blur). */
const OPTIONS = [
  { name: 'name', label: 'NAME', applies: () => true, line: () => 'What the others see in multiplayer',
    field: { get: playerName.get, set: playerName.set, max: MAX_NAME, placeholder: 'Your name', autocomplete: 'nickname' } },
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
    const title = o.label[0] + o.label.slice(1).toLowerCase();
    const ctl = o.field ? textField(o, title) : chipRow(o.choices(), o.value(), title, (k) => { o.pick(k); render(o.name); }, { name: o.name });
    opt.append(lbl, ctl);
    const line = document.createElement('div'); line.className = 'line'; line.textContent = o.line();
    row.append(opt, line); list.appendChild(row);
    if (focus === o.name && !o.field) ctl.querySelector('[aria-checked="true"]')?.focus();
  }
}
/** A setting's text field: its stored value, kept on change or blur (and when the card closes); Enter keeps it too
 *  and, on a touch screen, puts the keyboard away. */
function textField(o, title) {
  const f = document.createElement('input');
  Object.assign(f, { id: `opt-${o.name}`, maxLength: o.field.max, placeholder: o.field.placeholder, autocomplete: o.field.autocomplete, value: o.field.get(), spellcheck: false });
  f.setAttribute('aria-label', title); f.dataset.k = o.name;
  const keep = () => o.field.set(f.value);
  f.addEventListener('change', keep); f.addEventListener('blur', keep);
  f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { keep(); if (touchDevice) f.blur(); } });
  return f;
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
  $('optionsList').querySelectorAll('input').forEach(f => f.dispatchEvent(new Event('change'))); // (Esc or BACK with a field still focused)
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
