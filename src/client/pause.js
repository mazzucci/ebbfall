// The pause card (the top bar's PAUSE, or P). What it is depends on the game:
// - alone (or the guided game) it pauses: BACK TO GAME, HOW TO PLAY, RESTART, LEAVE GAME (leaving gives the game up);
// - in a replay: BACK TO REPLAY, DONE (back to the end card);
// - online it is a menu and the game goes on under it (only the relay can stop a shared clock): BACK TO GAME, HOW TO
//   PLAY, LEAVE GAME, and PAUSE FOR EVERYONE while this side has pauses left. A room pause (docs/MULTIPLAYER.md) shows
//   the card on every side, with who paused and the time left; only the one who paused can end it early (RESUME: the
//   others see whose pause it is, greyed), and once it is over the card closes for those who did not open it.
// Opening it leaves full screen (the player may be off to another app); BACK TO GAME (and a replay's DONE) goes back
// into it if it was on, unless the player has left it with the full-screen button since (screen.js). A pause someone
// else called leaves this side's full screen alone.
// While the card is up the game's sound is paused (audio.js `holdSound`: effects, the wind, the voice), and the corner
// has no sound button (corner.js); closing it brings the sound back. The sound setting itself is not touched. Online and
// in a replay too, though the game may go on under the card: the card covers it, so it is not heard either.
import { G, fmt } from '../engine/index.js';
import { $, ui, toast } from './ui.js';
import { sfx, holdSound } from './audio.js';
import { seenLately } from './scout.js';
import { online, who, Who, ifYouLeave } from './online.js';
import { isFull, enterFullscreen, exitFullscreen } from './screen.js';

/** mine: the player opened the card (not a room pause); wasFull: full screen was on when they did. */
const card = { mine: false, wasFull: false, timer: 0 };
let onRestart = () => {}, onQuit = () => {}, onDone = () => {};

/** Whether the card is up (input waits; alone, the game too). */
export const paused = () => !$('pause').hidden;
const mine = () => online.hold?.seat === online.seat;

export function initPause(h) {
  ({ onRestart, onQuit, onDone } = h);
  $('btnResume').addEventListener('click', () => {
    if (!online.hold) { closePause(true); return; }
    if (mine()) { online.net?.resume(); backToFull(); } // (the card closes when the relay says the pause is over)
  });
  $('btnPauseAll').addEventListener('click', () => { sfx('select'); online.net?.pause(); });
  $('btnRestart').addEventListener('click', () => { closePause(true); onRestart(); });
  $('btnQuit').addEventListener('click', () => { closePause(false); onQuit(); });
  $('btnPauseDone').addEventListener('click', () => { closePause(true); onDone(); }); // (back to the end card: full screen again if it was on)
  $('btnPause').addEventListener('click', () => togglePause());
}

/** PAUSE or P: open the card, or close it (not while a room pause holds everyone: RESUME ends that). */
export function togglePause() {
  if (paused()) { if (!online.hold) closePause(true); return; }
  card.mine = true; card.wasFull = isFull();
  if (card.wasFull) exitFullscreen();
  openCard();
}

function openCard() {
  $('pause').hidden = false; holdSound(true);
  const seen = ui.watching ? '' : seenLately(); // (the clock and the scouting report live here, not on screen; a replay shows both sides)
  $('pauseSeen').innerHTML = seen; $('pauseSeen').hidden = !seen;
  render();
  clearInterval(card.timer); card.timer = setInterval(render, 500); // (online the clock runs on: so does the card's)
  $('btnResume').focus();
}

/** Close the card; `back`: to the game, so into full screen again if it was on when the player paused. */
export function closePause(back = false) {
  if (back) backToFull();
  $('pause').hidden = true; clearInterval(card.timer); card.timer = 0; card.mine = false; card.wasFull = false;
  holdSound(false); // (inside BACK TO GAME's click or P's key, the sound comes back at once, iOS too)
}
function backToFull() { if (card.wasFull) enterFullscreen(); card.wasFull = false; }

/** A room pause began (or this side, back, is told of it): every side shows the card, in its paused state (silently:
 *  the card pauses the sound). */
export function roomPaused() { if (G.over) return; if (paused()) render(); else { card.mine = false; card.wasFull = false; openCard(); } }
/** The room pause is over (`seat` resumed it; -1: its time ran out): the card closes for whoever did not open it (and
 *  for the one who resumed it), or is the menu again. */
export function roomResumed(seat) {
  if (!paused()) return;
  if (!card.mine || seat === online.seat) closePause(); else render();
  if (seat !== online.seat && seat > -2) toast(seat < 0 ? 'The pause is over: back to the game' : 'Back to the game'); // (-2: the room says no pause (a rejoin) or the game cannot go on)
}

const left = () => online.left[online.seat] ?? 0;
/** A clock as said on the card: 4:12 (fmt's 04:12 without the leading zero). */
const clock = (sec) => fmt(sec).replace(/^0(?=\d:)/, '');
const remains = (ms) => clock(Math.ceil(Math.max(0, ms) / 1000));

/** Fill the card for the state the game is in. */
function render() {
  const watching = !!ui.watching, net = online.playing, hold = net ? online.hold : null;
  const heading = net && !hold ? 'Menu' : 'Paused';
  $('pause').querySelector('h2').textContent = heading; $('pause').querySelector('.card').setAttribute('aria-label', heading);
  $('pauseTime').textContent = hold ? `${mine() ? 'You paused' : `Paused by ${Who(hold.seat)}`} · ${remains(hold.until - performance.now())} left`
    : watching ? `${clock(G.time)} into the replay.` : net ? `${clock(G.time)} in. The game goes on while this is open.`
      : `${clock(G.time)} into the game. Leaving or restarting gives it up.`;
  const resume = $('btnResume');
  resume.textContent = !hold ? (watching ? 'BACK TO REPLAY' : 'BACK TO GAME') : mine() ? 'RESUME' : `${who(hold.seat).toUpperCase()}'S PAUSE`;
  resume.disabled = !!hold && !mine(); // (theirs to end: no RESUME that does nothing)
  resume.title = !hold ? '' : mine() ? 'End your pause: the game goes on for everyone' : `${Who(hold.seat)} ends the pause, or it runs out`;
  const all = $('btnPauseAll');
  all.hidden = !net || !!hold || left() <= 0;
  all.innerHTML = `PAUSE FOR EVERYONE<small>${left()} left</small>`; all.setAttribute('aria-label', `Pause for everyone, ${left()} left`);
  $('btnPauseHelp').hidden = watching;
  $('btnRestart').hidden = net || watching; // (a shared game cannot be restarted by one side)
  $('btnQuit').hidden = watching;
  $('btnQuit').title = net ? `Back to the menu: ${ifYouLeave()}` : 'Back to the menu: the game counts as lost';
  $('btnPauseDone').hidden = !watching;
  // Three buttons: the first across the card, two below (no hole); two or four: a row or two of two.
  const shown = [...$('pause').querySelectorAll('.pausegrid button')].filter(b => !b.hidden).length;
  $('pause').querySelector('.pausegrid').classList.toggle('odd', shown % 2 === 1);
}
