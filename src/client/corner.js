// Sound and full screen, always in reach: the top bar's pair in a game, the screen's corner (#corner, top right) over
// every menu page, the lobby and every card over the game (pause, leave, end, How to play); style.css shows one pair
// or the other, never both. One setting each: the sound (remembered on this device) and full screen, which on iPad and
// iPhone is the Home Screen app's: there the button opens a card that says how (screen.js `pageFullscreenWorks`).
import { $ } from './ui.js';
import { audio, sfx, soundToggled } from './audio.js';
import { icon, setIconButton } from './icons.js';
import { store } from './store.js';
import { isFull, toggleFullscreen, canGoFullscreen, homeScreenOnly } from './screen.js';

/** The sound on or off, from either pair: saved, and both pairs say so. */
function toggleSound() {
  audio.muted = !audio.muted; store.set('muted', audio.muted ? '1' : '0');
  syncSound(); soundToggled(); if (!audio.muted) sfx('select');
}
function syncSound() {
  const on = !audio.muted, title = on ? 'Sound (on)' : 'Sound (off)';
  setIconButton($('btnSound'), on ? 'sound' : 'mute', on ? 'SOUND ON' : 'SOUND OFF', on ? 'SOUND OFF' : 'SOUND ON');
  $('cornerSound').innerHTML = icon(on ? 'sound' : 'mute');
  for (const b of [$('btnSound'), $('cornerSound')]) { b.title = title; b.setAttribute('aria-pressed', String(on)); }
}

/** Full screen in or out; on iPad and iPhone, the card that tells how. */
function fullScreenButton() {
  sfx('select');
  if (homeScreenOnly) showHomeTip(); else toggleFullscreen();
}
function syncFull() {
  const on = isFull(), title = on ? 'Leave full screen' : 'Full screen';
  setIconButton($('btnFull'), on ? 'unfull' : 'full', on ? 'EXIT FULL' : 'FULL SCREEN', on ? 'FULL SCREEN' : 'EXIT FULL');
  $('cornerFull').innerHTML = icon(on ? 'unfull' : 'full');
  for (const b of [$('btnFull'), $('cornerFull')]) {
    b.hidden = !canGoFullscreen && !homeScreenOnly && !on; // (a Home Screen app is full screen already)
    b.title = title; b.setAttribute('aria-label', title); b.setAttribute('aria-pressed', String(on));
  }
}

/** The Add to Home Screen card (the full-screen button here, and INSTALL: offline.js); closed, the focus goes back to
 *  the button that opened it. */
let opener = null;
export function showHomeTip() { opener = document.activeElement; $('homeTip').hidden = false; $('btnHomeTipOk').focus(); }
const hideHomeTip = () => { $('homeTip').hidden = true; if (opener?.isConnected && opener.offsetParent !== null) opener.focus(); opener = null; };

/** `overlay-open` on the root while any screen or card is up (style.css: the corner then, the top bar's pair otherwise). */
function watchScreens() {
  const sync = () => document.documentElement.classList.toggle('overlay-open', !!document.querySelector('.screen:not([hidden])'));
  new MutationObserver(sync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  sync();
}

/** A menu page or the lobby taller than the screen scrolls under the corner: `tall` on it moves its content out from
 *  under it (style.css; narrower or lower content is no shorter, so it stays tall until it would fit anyway). */
function watchTall() {
  const cards = [...document.querySelectorAll('.card.menu')];
  const check = () => { for (const c of cards) c.classList.toggle('tall', c.scrollHeight > c.clientHeight + 1); };
  const ro = new ResizeObserver(check);
  for (const c of cards) { ro.observe(c); for (const ch of c.children) ro.observe(ch); }
}

/** Wire both pairs and the Home Screen card. */
export function initCorner() {
  if (store.get('muted') === '1') audio.muted = true;
  for (const b of [$('btnSound'), $('cornerSound')]) b.addEventListener('click', toggleSound);
  for (const b of [$('btnFull'), $('cornerFull')]) b.addEventListener('click', fullScreenButton);
  document.addEventListener('fullscreenchange', syncFull); document.addEventListener('webkitfullscreenchange', syncFull);
  syncSound(); syncFull();
  $('btnHomeTipOk').addEventListener('click', hideHomeTip);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('homeTip').hidden) { e.preventDefault(); e.stopImmediatePropagation(); hideHomeTip(); } }, true);
  watchScreens(); watchTall();
}
