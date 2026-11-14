// The game: wires the sim (Rust/WASM via src/engine) to the client, runs the fixed-step loop, handles start/end screens.
// Loaded by src/boot.js behind the menu (the renderer waits for its art, and the sim for its WASM, below); the menu and
// the lobby call in through `game`.
import * as engine from './engine/index.js';
import { G, DT, TILE, BUILDINGS, idx, resetGame, resetGameForSeat, resetGameSeats, step, advance, mirror, fmt, setResources, foes, enemies, FACTIONS } from './engine/index.js';
import { resize, render, renderTerrain, centerOn, ping, boom, sparkAt, healFx, castFx, muzzleFx, cam, view, toWorld, nearView, ALLY, FOE, ZOOM_MIN, startZoom, teamLayers, drawOrder, effectsShown, rangeShown, unitTop, bldgArtTop, seatTint, spotTint } from './client/gl/render.js';
import { updateHud, invalidateCard, cardItems, myFaction, aName } from './client/hud.js';
import { $, ui, toast, setHint, setSelection } from './client/ui.js';
import { bindInput, camKeys, input, stopGlide } from './client/input.js';
import { sfx, audio, audioState } from './client/audio.js';
import { fx, burst, hit, updateFx } from './client/fx.js';
import { initTools, updateTools, onAttacked, resetTools } from './client/tools.js';
import { resetMemory } from './client/memory.js';
import { initPause, paused, closePause, roomPaused, roomResumed } from './client/pause.js';
import { updateClock } from './client/clock.js';
import { showMenu, recordResult, guidedDone, setup, menu, wonChallenge, openHelp } from './client/menu.js';
import { initShare, showShare } from './client/share.js';
import { MAP_KINDS, onlineMap } from './client/maps.js';
import { levelOf } from './engine/util.js';
import { setSpots, MUZZLE_SMOKE } from './client/look.js';
import { startTutorial, updateTutorial } from './client/tutorial.js';
import { initLeaveDialog, armLeaveGuard, disarmLeaveGuard, enterFullscreen, isFull, pageFullscreenWorks } from './client/screen.js';
import { online, stopOnline, wantRematch, theyWant, wantLine, ifYouLeave } from './client/online.js';

await engine.ready; // (the WASM: loading since src/boot.js imported the engine, alongside the art)

audio.view = () => ({ x: cam.x, y: cam.y, w: view.w / cam.zoom, h: view.h / cam.zoom }); // sounds are placed by the camera
/** Sounds of things in the fog are not heard (the player cannot see them either). */
const seen = (e) => G.vis[idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE))] > 0;

let started = false;
// The device test (?bench: src/client/bench.js, loaded only then) plays a game of its own through `begin`, on nobody's
// record, and times the loop's phases while `probe.on`.
const BENCH = new URLSearchParams(location.search).has('bench');
const probe = { on: false, lap() {} };
const overlay = () => !$('start').hidden || !$('leave').hidden || !$('help').hidden || !$('options').hidden || !$('end').hidden || !$('homeTip').hidden;
// (an online game runs on under the menu, the help and the leave dialog: only the relay stops a shared game)
const running = () => started && !G.over && (online.playing || (!overlay() && !paused()));
input.enabled = () => started && !overlay() && !paused();

/** Start a game on the map and against the opponents chosen in the menu: one AI (the duel, as always), or two to seven,
 *  each for itself or in teams (the seats in team order, this player seat 0), each AI at its own difficulty. */
function newGame() {
  const g = setup(); // (the menu's choices, or the guided first game's)
  stopOnline();
  setSpots(g.spots); // (each player in its spot's color)
  if (g.players > 2) begin(() => resetGameSeats(g.seed, g.diff, g.kind, g.side, g.races, g.teams, g.ai, 0, g.size, g.diffs));
  else begin(() => resetGame(g.seed, g.diff, g.kind, g.side, g.race, g.enemyRace, g.size));
}

/** An online game: the room's setup, from this side's seat (online.js); its AI seats run in every client's game. */
function newOnlineGame(setup, seat, races) {
  const m = onlineMap(setup);
  menu.tutorial = false; setSpots(setup.spots); // (each player in its spot's color: the room's setup says, alike on every client)
  // (races: a RANDOM seat already drawn, online.js)
  begin(() => resetGameForSeat(m.seed, m.kind, setup.side, races, seat, { teams: setup.teams || [], ai: setup.ai || [], diff: levelOf(setup.diff ?? 1), diffs: (setup.diffs || []).map(levelOf), size: m.size })); // (a Hard of Nov 11 to 13, 3: today's, 2; alike on every client)
}

function begin(reset) {
  $('help').hidden = true; $('options').hidden = true; ended = false; outSaid = false;
  reset();
  audio.voice = G.factions[G.me]; // (the announcer speaks in this side's race's voice)
  setSelection([]); ui.groups = {}; fx.list = []; invalidateCard(); resetTools(); resetMemory(); stopGlide();
  renderTerrain();
  // Start over the base: a phone at 1 (the units read), a desktop all the way out; the wheel or a pinch zooms.
  cam.zoom = startZoom(); const core = G.bldgs.find(b => b.team === G.me); centerOn(core.x + 40, core.y);
  $('end').hidden = true; $('start').hidden = true; started = true; setHint();
  startTutorial(menu.tutorial); // (the guided first game's checklist replaces the opening tip)
  // (the Expedition has no population: a grid for everything it runs, from its Substations)
  if (!menu.tutorial) toast(myFaction().grid ? `Mine thorium for energy. Build ${aName(BUILDINGS[myFaction().supply].name)} to expand the grid: energy builds things; the grid keeps them running.`
    : `Mine gold. Build ${aName(BUILDINGS[myFaction().supply].name)} before your population is full.`);
  armLeaveGuard({ onAsk: leaveLine, onResume: () => { last = performance.now(); }, onLeave: quitToTitle });
}
/** The leave dialog's line: alone the game waits and leaving loses it; online it goes on (unless a room pause holds
 *  it), and leaving hands it to the others. */
function leaveLine() {
  $('leaveSub').textContent = !online.playing ? 'The game is paused. If you leave, this game is lost.'
    : `${online.hold ? 'The game is paused' : 'The game goes on'}. If you leave, ${ifYouLeave()}.`;
}

/** Leave the current game for the title screen (the next back gesture then really leaves the page). */
/** Leaving (or restarting) a game in progress gives it up: a defeat on this device's record (the pause card says so). */
function giveUp() {
  if (online.playing) { if (started && !G.over) online.net?.leave(); return; } // (an online game: the relay concedes for us at once; not on the vs-AI record)
  if (started && !G.over && !menu.tutorial && !BENCH) recordResult(false, G.factions[G.me], G.diff);
}
function quitToTitle() {
  const solo = !online.playing && !menu.tutorial;
  giveUp(); stopOnline(); // (a leaving Net closes itself once its leave is out)
  started = false; closePause(); $('end').hidden = true; $('help').hidden = true; $('options').hidden = true; showMenu(solo ? 'menuSolo' : 'menuHome');
}

/** A shot fired (the shooter stands at the event's spot): a kind with muzzle smoke (look.js MUZZLE_SMOKE, the Cannon)
 *  leaves its puff. */
function muzzle(e) {
  if (!nearView(e.x, e.y)) return;
  const u = G.units.find(u => Math.abs(u.x - e.x) < 1 && Math.abs(u.y - e.y) < 1);
  if (u && MUZZLE_SMOKE[u.type]) muzzleFx(e.x, e.y, u.face, MUZZLE_SMOKE[u.type]);
}
/** Turn sim events into client effects. */
function drainEvents() {
  for (const e of G.events) {
    if (e.t === 'sfx') sfx(e.name);
    else if (e.t === 'toast') toast(e.msg, e.bad);
    else if (e.t === 'ping') ping(e.x, e.y); // (something of ours finished, or needs a look)
    else if (e.t === 'burst') { if (nearView(e.x, e.y)) burst(e.x, e.y, e.r, e.team === G.me ? ALLY : FOE, Math.ceil(e.n / 2)); boom(e.x, e.y, e.r, G.factions[e.team]); if (seen(e)) sfx('boom', e); } // (particles on screen only)
    else if (e.t === 'hit') { if (nearView(e.x, e.y)) hit(e.x, e.y, e.big); sparkAt(e.x, e.y, e.big); if (seen(e)) sfx('hit', e); }
    else if (e.t === 'fire') { sfx(e.w, e); muzzle(e); }
    else if (e.t === 'cast') { sfx(e.ability, e); castFx(e.x, e.y, e.ability); }
    else if (e.t === 'heal') healFx(e.x, e.y, e.tx, e.ty, e.mend);
    else if (e.t === 'attacked') onAttacked(e);
  }
  G.events.length = 0;
}

/** This side's allies (the other seats of its team). */
const allies = () => G.teams.map((_, s) => s).filter(s => s !== G.me && !enemies(G.me, s));
/** This side's game is over: the game is, or every seat of its team is out (a free-for-all goes on without it). */
const myGameOver = () => G.over || (G.out[G.me] && allies().every(s => G.out[s]));
/** The end card's line under the result: what ended the game, in the sim's words (`G.outWhy`: a seat's last
 *  building fell, or it had nothing left to fight with and no gold to train more, or it conceded). */
function endLine(win) {
  const after = ' after ' + fmt(G.time) + '.';
  const mine = allies();
  if (mine.length) { // (a team game: the team's result; online, the friends on it by name)
    const names = online.playing ? mine.map(s => online.names[s]).filter(n => n && n !== 'the AI') : [];
    return `Your team ${win ? 'wins' : 'lost'}${names.length ? ` with ${names.join(' and ')}` : ''}` + after;
  }
  // (then ' after mm:ss.'; in each side's money: the Expedition's energy)
  const myWhy = G.outWhy[G.me], helpless = (s) => `nothing left to fight with, and no ${FACTIONS[G.factions[s]]?.money || 'gold'} to train more,`;
  if (G.teams.length > 2) { // (free for all, or alone against a team or several: nobody in particular beat this side, nor lost to it)
    return (win ? 'The last one standing' : myWhy === 'conceded' ? 'You conceded' : myWhy === 'helpless' ? `You had ${helpless(G.me)}` : 'Your last building fell') + after;
  }
  // A duel: online, the other side has a name (a friend's, as typed in the lobby). "Conceded" is said only of an enemy.
  const them = online.playing ? online.names[foes()[0]] || '' : '';
  if (G.conceded === G.me) return (them ? `You conceded to ${them}` : 'You conceded') + after;
  if (G.conceded >= 0) return `${them || 'The enemy'} conceded` + after;
  if (win) return (G.outWhy[foes()[0]] === 'helpless' ? `${them || 'The enemy'} had ${helpless(foes()[0])}` : `${them ? them + "'s" : 'Their'} last building fell`) + after;
  return (myWhy === 'helpless' ? `You had ${helpless(G.me)}` : `Your last building fell${them ? ' to ' + them : ''}`) + after;
}

function endGame() {
  closePause(); setSelection([]); updateHud(); // (a console frozen mid-"Training" would sit under the result)
  const win = G.over && G.winner === G.teams[G.me]; // (the winner is a team; out of a game that goes on: lost)
  $('result').textContent = win ? 'VICTORY' : 'DEFEAT'; $('result').className = win ? 'win' : 'lose';
  $('endSub').textContent = endLine(win);
  const map = online.playing ? onlineMap(online.setup) : setup();
  $('endMap').innerHTML = `<b>${map.name}</b>: ${MAP_KINDS[map.kind].story}`; // the map's secret, told at the end
  $('btnAgain').textContent = online.playing ? 'LEAVE ROOM' : 'NEW GAME'; // (online: this room, and its rematch, are left)
  $('btnAgain').title = online.playing ? 'Back to the menu: out of this room' : 'Back to the menu, for another map or opponent';
  showShare(win && !online.playing && !BENCH ? wonChallenge(G.time) : null); // (a victory against the AI: its challenge link)
  if (online.playing) online.net?.over(); // (the relay stops the clock once both games are over)
  rematchButton(theyWant(), online.rematch);
  $('end').hidden = false; $('btnRematch').focus(); sfx(win ? 'done' : 'boom'); disarmLeaveGuard();
  if (!online.playing && !menu.tutorial && !BENCH) recordResult(win, G.factions[G.me], G.diff); // (after the card is up; a guided game is not counted; online games are not on the vs-AI record)
  if (!online.playing && menu.tutorial) guidedDone(); // (a newcomer no more: FIRST GAME leaves the menu's first page)
}
/** The end card's REMATCH: alone, the same game again; online, another in the same room once the others want it too
 *  (`theyWant`: someone else does; `iWant`: this side asked), and none once someone has left. */
let theyWantRematch = false;
function rematchButton(theyWant, iWant) {
  const b = $('btnRematch'); theyWantRematch = theyWant;
  b.hidden = online.playing && (online.gone.size > 0 || online.dead);
  b.textContent = !online.playing ? 'REMATCH' : iWant ? 'WAITING…' : theyWant ? 'REMATCH?' : 'REMATCH';
  b.classList.toggle('on', online.playing && theyWant && !iWant); // (they asked: the button calls)
  b.classList.toggle('wait', online.playing && iWant); // (asked: a quiet button, a tap takes it back)
  b.title = !online.playing ? 'The same map and opponent again' : iWant ? 'Tap again to take it back' : 'Another game in this room, once everyone wants one';
}

// ---- screens ----
$('btnAgain').addEventListener('click', () => { const solo = !online.playing && !menu.tutorial; $('end').hidden = true; started = false; if (online.playing) online.net?.leave(); stopOnline(); showMenu(solo ? 'menuSolo' : 'menuHome'); }); // back to the menu: a new map, or the same opponent again (online: the room is left, and the friend told)
$('btnRematch').addEventListener('click', () => { sfx('select'); if (online.playing) rematchButton(theyWantRematch, wantRematch()); else { enterFullscreen(); newGame(); } }); // (alone: full screen again on a touch screen, as START; online, READY does) the same map, seed, races and difficulty; online, another game in the room
initLeaveDialog(); initTools(); initShare();
initPause({ onRestart: () => { giveUp(); newGame(); }, onQuit: () => { disarmLeaveGuard(); quitToTitle(); } });
/** What the menu (menu.js) and the lobby (online.js) call, through src/boot.js, once this module has loaded. */
export const game = {
  newGame, newOnlineGame, quitToTitle, started: () => started, // (in a game: a new version waits, src/boot.js)
  room: () => { $('end').hidden = true; started = false; }, // (a rematch: from the end card back to the room)
  pause: roomPaused, resume: roomResumed, // (a room pause: the pause card on every side)
  rematch: (they, iWant) => {
    if ($('end').hidden) return; // (the end card reads the room's wishes when it comes up)
    if (they && !theyWantRematch && !iWant) toast(wantLine());
    rematchButton(they, iWant);
  },
};
// Online, a hidden desktop tab gets no frames, so its turns run from a slow timer instead (online.js wakes the socket of
// a page that comes back into view).
setInterval(() => {
  if (!document.hidden || !online.playing || !started) return;
  const waiting = online.net.pump(); // (also after the game: heartbeats, for a rematch)
  if (G.over) return;
  for (let i = 0; i < waiting && advance(); i++) online.net.ticked(); // (mirrored once, below)
  drainEvents();
}, 250);
$('btnPauseHelp').addEventListener('click', openHelp); // How to play, over the pause menu (at its top)

// ---- loop ----
let last = performance.now(), acc = 0, hudTimer = 0, ended = false, outSaid = false, drawn = -Infinity;
function loop(now) {
  if (probe.on) probe.lap('start', now);
  const el = Math.min(0.1, (now - last) / 1000); last = now;
  if (input.enabled()) camKeys(el);
  if (running()) {
    acc += el; let n = 0;
    // Online: the relay's turns in, our orders out; behind by more than a few ticks, run faster to catch up.
    const waiting = online.playing ? online.net.pump() : 0, max = waiting > 9 ? 30 : 5;
    while ((acc >= DT || n < waiting - 9) && n++ < max) {
      if (!advance()) { acc = Math.min(acc, DT); break; } // (its turn is not in yet; the client's mirror of the world catches up once, after the steps)
      acc = Math.max(0, acc - DT); if (online.playing) online.net.ticked(); // (catch-up steps are not charged to the clock)
    }
    if (acc > DT * 5) acc = 0;
    mirror(); // (this frame's ticks into G, once)
    if (probe.on) probe.lap('steps');
    drainEvents();
  }
  // Checked every frame, not only while running: the game can end between frames too.
  if (online.playing && G.over) online.net?.pump(); // (the game is over, the room is not: still here, for a rematch)
  if (started && !ended && myGameOver()) { ended = true; drainEvents(); endGame(); } // (once a game: `ended` resets in newGame)
  else if (started && !ended && G.out[G.me] && !outSaid) { outSaid = true; toast('You are out: your team fights on', true, true); } // (an ally still in: watch it)
  updateFx(el);
  if (probe.on) probe.lap('events');
  // At most 60 frames a second (a 120 Hz phone would draw every frame twice as often for nothing: the world moves 30
  // times a second), and 20 under a card that stops the game (pause, leave, help, end).
  const draw = started && now - drawn >= (running() ? 12 : 50);
  if (draw) { drawn = now; render(ui.sel, ui.place); }
  if (probe.on) probe.lap('render', draw);
  hudTimer += el; if (hudTimer > 0.12) { hudTimer = 0; if (started) { updateHud(); updateClock(); updateTools(); updateTutorial(); } }
  if (probe.on) probe.lap('end');
  requestAnimationFrame(loop);
}

new ResizeObserver(resize).observe(document.getElementById('stage'));
// A handle for debugging in the console and for scripted playtests (single player: nothing here is secret).
window.endfall = { G, map: engine.map, ui, cam, view, zoomMin: ZOOM_MIN, startZoom: startZoom(), toWorld, centerOn, setResources, engine, cardItems, online, teamLayers, drawOrder, effects: effectsShown, rangeShown, unitTop, bldgArtTop, seatTint, spotTint, skip: (seconds) => { for (let i = 0; i < seconds * 30 && !G.over; i++) step(DT); },
  // What a device check reads back (tools/devices, the cross-engine e2e): sound, full screen, the page's errors.
  // `fullscreenEnabled`: whether the page may go full screen at all (the browser's word: not on iPhone Safari);
  // `pageFullscreen`: whether the game takes it there (screen.js `pageFullscreenWorks`: not on iPad or iPhone).
  status: () => ({ audio: audioState(), muted: audio.muted, fullscreen: isFull(), fullscreenEnabled: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled), pageFullscreen: pageFullscreenWorks, errors: (window.endfallErrors || []).slice() }) };
bindInput(); resize(); requestAnimationFrame(loop);
if (BENCH) import('./client/bench.js').then(b => b.initBench(probe, { begin, running, started: () => started, stop: () => { started = false; disarmLeaveGuard(); } }))
  .catch(e => toast(`The device test could not load: ${e.message}`, true)); // (the menu stays: the game itself works)
