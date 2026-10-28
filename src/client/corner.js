// Sound and full screen, always in reach: the top bar's pair in a game, the screen's corner (#corner, top right) over
// every menu page, the lobby and every card over the game (pause, leave, end, How to play); style.css shows one pair
// or the other, never both. One setting each: the sound (remembered on this device) and full screen, which on iPad and
// iPhone is the Home Screen app's: there the button opens a card that says how (screen.js `pageFullscreenWorks`).
import { $ } from './hud.js';
import { audio, sfx, soundToggled } from './audio.js';
import { icon, setIconButton } from './icons.js';
import { store } from './store.js';
import { isFull, toggleFullscreen, canGoFullscreen, homeScreenOnly, homeScreenDevice } from './screen.js';

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

function showHomeTip() { $('homeTip').hidden = false; $('btnHomeTipOk').focus(); }
const hideHomeTip = () => { $('homeTip').hidden = true; };

/** Wire both pairs and the Home Screen card (and the first page's iPhone tip). */
export function initCorner() {
  if (store.get('muted') === '1') audio.muted = true;
  for (const b of [$('btnSound'), $('cornerSound')]) b.addEventListener('click', toggleSound);
  for (const b of [$('btnFull'), $('cornerFull')]) b.addEventListener('click', fullScreenButton);
  document.addEventListener('fullscreenchange', syncFull); document.addEventListener('webkitfullscreenchange', syncFull);
  syncSound(); syncFull();
  $('homeTipDevice').textContent = homeScreenDevice;
  $('btnHomeTipOk').addEventListener('click', hideHomeTip);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('homeTip').hidden) { e.preventDefault(); e.stopImmediatePropagation(); hideHomeTip(); } }, true);
  if (homeScreenOnly && homeScreenDevice === 'iPhone') $('iosTip').hidden = false; // (iPhone: said on the first page too)
}
