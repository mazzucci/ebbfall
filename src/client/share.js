// The end card's SHARE, after a victory against the AI (not online, not the guided game): the challenge link of the
// game just won (challenge.js; its card in a chat: site/preview.js), through the device's share sheet where it has one
// (phones), else copied to the clipboard, the button itself saying LINK COPIED a moment. No image of its own: the
// link's card is the picture.
import { $ } from './ui.js';
import { sfx } from './audio.js';
import { card, link, shareText } from './challenge.js';

const LABEL = 'SHARE';
let won = null, timer = 0;

/** SHARE on the end card for challenge `c`; null hides it. */
export function showShare(c) {
  const b = $('btnShareWin');
  won = c; b.hidden = !c; clearTimeout(timer); b.textContent = LABEL;
}
export function initShare() { $('btnShareWin').addEventListener('click', share); }

async function share() {
  if (!won) return;
  sfx('select');
  const url = link(won, location.origin, location.pathname);
  if (navigator.share) {
    try { await navigator.share({ title: card(won).title, text: shareText(won), url }); return; } catch (e) {
      if (e?.name === 'AbortError') return; // (the sheet closed without sharing: nothing to say)
    } // (refused, or nothing to share it with: copied instead)
  }
  try { await navigator.clipboard.writeText(url); say('LINK COPIED'); } catch { say('COPY FAILED'); }
}
/** The button says `text` a moment, then SHARE again. */
function say(text) {
  const b = $('btnShareWin');
  b.textContent = text; clearTimeout(timer); timer = setTimeout(() => { b.textContent = LABEL; }, 2000);
}
