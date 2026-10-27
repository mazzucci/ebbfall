// Entry point: wires the sim (Rust/WASM via src/engine) to the client, runs the fixed-step loop, handles start/end screens.
import './style.css';
import * as engine from './engine/index.js';
import { G, DT, TILE, UNITS, BUILDINGS, idx, resetGame, resetGameForSeat, resetGameSeats, step, fmt, setResources, armyLog, lostTo, startReplay, replayEnd, foes, enemies } from './engine/index.js';
import { resize, render, renderTerrain, centerOn, ping, boom, sparkAt, healFx, castFx, cam, view, toWorld, ALLY, FOE, ZOOM_MIN, teamLayers, seatTint } from './client/gl/render.js';
import { updateHud, invalidateCard, cardItems, myFaction, aName } from './client/hud.js';
import { $, ui, toast, setHint, setSelection } from './client/ui.js';
import { bindInput, camKeys, input, stopGlide } from './client/input.js';
import { sfx, audio, soundToggled } from './client/audio.js';
import { fx, burst, hit, updateFx } from './client/fx.js';
import { initTools, updateTools, onAttacked, resetTools } from './client/tools.js';
import { initPause, paused, closePause, roomPaused, roomResumed } from './client/pause.js';
import { setIconButton, portrait } from './client/icons.js';
import { initMenu, showMenu, soundChanged, recordResult, guidedDone, setup, menu } from './client/menu.js';
import { MAP_KINDS, onlineMap, teamList } from './client/maps.js';
import { startTutorial, updateTutorial } from './client/tutorial.js';
import { armyChart } from './client/chart.js';
import { resetSightings, noteSightings, seenLine } from './client/scout.js';
import { initScreen, initLeaveDialog, armLeaveGuard, disarmLeaveGuard } from './client/screen.js';
import { initOnline, online, stopOnline, reloadUrl, wantRematch, theyWant, wantLine, ifYouLeave, Who } from './client/online.js';

audio.view = () => ({ x: cam.x, y: cam.y, w: view.w / cam.zoom, h: view.h / cam.zoom }); // sounds are placed by the camera
/** Sounds of things in the fog are not heard (the player cannot see them either). */
const seen = (e) => G.vis[idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE))] > 0;

let started = false;
const overlay = () => !$('start').hidden || !$('leave').hidden || !$('help').hidden || !$('end').hidden;
// (an online game runs on under the menu, the help and the leave dialog: only the relay stops a shared game)
const running = () => started && !G.over && (online.playing || (!overlay() && !paused()));
input.enabled = () => started && !overlay() && !paused();

/** Whether to show the player's power fields: a race with them, and a power building (or one that needs power)
 * selected, or the Build list open, so the rule is visible before a placement fails. */
function showPower() {
  if (!myFaction().power) return false;
  return ui.mode === 'build' || ui.mode === 'build2' || !!ui.place || ui.sel.some(e => e.kind === 'bldg' && e.team === G.me && (e.d.power > 0 || e.d.needsPower));
}

/** Start a game on the map and against the opponent chosen in the menu: one AI (the duel, as always), or two to seven,
 *  each for itself or, for four, six and eight, in even teams (seat 0, this player, with an AI or more). */
function newGame() {
  const g = setup(); // (the menu's choices, or the guided first game's)
  stopOnline();
  if (g.players > 2) begin(() => resetGameSeats(g.seed, g.diff, g.kind, g.side, [g.race, ...g.enemyRaces], teamList(g.players, g.teams), [false, ...g.enemyRaces.map(() => true)], 0, g.size));
  else begin(() => resetGame(g.seed, g.diff, g.kind, g.side, g.race, g.enemyRace));
}

/** An online game: the room's setup, from this side's seat (online.js); its AI seats run in every client's game. */
function newOnlineGame(setup, seat, races) {
  const m = onlineMap(setup);
  menu.tutorial = false;
  // (races: a RANDOM seat already drawn, online.js)
  begin(() => resetGameForSeat(m.seed, m.kind, setup.side, races, seat, { teams: setup.teams || [], ai: setup.ai || [], diff: setup.diff ?? 1, size: m.size }));
}

function begin(reset) {
  $('help').hidden = true; stopWatching(); ended = false; outSaid = false;
  reset();
  audio.voice = G.factions[G.me]; // (the announcer speaks in this side's race's voice)
  resetSightings();
  setSelection([]); ui.groups = {}; fx.list = []; invalidateCard(); resetTools(); stopGlide();
  renderTerrain();
  // Start zoomed all the way out over the base, to see as much as possible; the wheel or a pinch zooms in.
  cam.zoom = ZOOM_MIN; const core = G.bldgs.find(b => b.team === G.me); centerOn(core.x + 40, core.y);
  $('end').hidden = true; $('start').hidden = true; started = true; setHint();
  startTutorial(menu.tutorial); // (the guided first game's checklist replaces the opening tip)
  if (!menu.tutorial) toast(`Mine shards. Build ${aName(BUILDINGS[myFaction().supply].name)} before supply caps.`);
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
  if (started && !G.over && !menu.tutorial && !ui.watching) recordResult(false, G.factions[G.me], G.diff);
}
function quitToTitle() {
  const solo = !online.playing && !menu.tutorial;
  giveUp(); stopWatching(); stopOnline(); // (a leaving Net closes itself once its leave is out)
  started = false; closePause(); $('end').hidden = true; $('help').hidden = true; showMenu(solo ? 'menuSolo' : 'menuHome');
}

// ---- replays: the game just played, again from its first tick, both sides in view, at a few speeds ----
const SPEEDS = [1, 2, 4, 8];
function clearScene() { setSelection([]); ui.groups = {}; fx.list = []; invalidateCard(); resetTools(); stopGlide(); }
function watch() {
  if (!startReplay()) { toast('This game cannot be watched again', true); return; }
  ui.watching = 4; audio.quiet = true; document.body.classList.add('replay'); $('replayBar').hidden = false; $('end').hidden = true;
  clearScene(); renderTerrain(); speedLabel();
  const core = G.bldgs.find(b => b.team === G.me); if (core) centerOn(core.x + 40, core.y);
}
function stopWatching() { ui.watching = 0; audio.quiet = false; document.body.classList.remove('replay'); $('replayBar').hidden = true; }
/** The replay ran out (or DONE): back to the end card, which still says how the game went. */
function doneWatching() { stopWatching(); clearScene(); updateHud(); $('end').hidden = false; $('btnWatch').focus(); }
function speedLabel() { $('btnSpeed').textContent = ui.watching + '×'; }
$('btnWatch').addEventListener('click', () => { sfx('select'); watch(); });
$('btnSpeed').addEventListener('click', () => { ui.watching = SPEEDS[(SPEEDS.indexOf(ui.watching) + 1) % SPEEDS.length]; speedLabel(); });
$('btnReplayDone').addEventListener('click', doneWatching);

/** Turn sim events into client effects. */
function drainEvents() {
  for (const e of G.events) {
    if (e.t === 'sfx') sfx(e.name);
    else if (e.t === 'toast') { if (!ui.watching) toast(e.msg, e.bad); } // (a replay shows the game, not its news)
    else if (e.t === 'ping') { if (!ui.watching) ping(e.x, e.y); } // (something of ours finished, or needs a look)
    else if (e.t === 'burst') { burst(e.x, e.y, e.r, e.team === G.me ? ALLY : FOE, Math.ceil(e.n / 2)); boom(e.x, e.y, e.r); if (seen(e)) sfx('boom', e); }
    else if (e.t === 'hit') { hit(e.x, e.y, e.big); sparkAt(e.x, e.y, e.big); if (seen(e)) sfx('hit', e); }
    else if (e.t === 'fire') sfx(e.w, e);
    else if (e.t === 'cast') { sfx(e.ability, e); castFx(e.x, e.y, e.ability); }
    else if (e.t === 'heal') healFx(e.x, e.y, e.tx, e.ty, e.mend);
    else if (e.t === 'attacked') { if (!ui.watching) onAttacked(e); }
  }
  G.events.length = 0;
}

/** The end card's one line on what killed most of this side's units, and what beats the worst of them: where a
 *  player learns the counters (detail on demand, on the screen built for it). */
function whatBeatYou() {
  const kinds = [...Object.keys(UNITS).map(k => ['unit', k]), ...Object.keys(BUILDINGS).map(k => ['bldg', k])];
  const top = lostTo(G.me).map((n, i) => [n, ...kinds[i]]).filter(([n]) => n > 0).sort((p, q) => q[0] - p[0]).slice(0, 2);
  const el = $('endWhy'); el.hidden = !top.length; if (!top.length) return;
  const name = (t, k) => (t === 'unit' ? UNITS : BUILDINGS)[k].name + 's';
  const pic = (t, k) => portrait(t, k, 22, foes()[0]); // (in an enemy's colours)
  // (only what this side can train: advice it can act on)
  const f = myFaction(), mine = new Set([...f.buildBasic, ...f.buildAdvanced].flatMap(b => BUILDINGS[b].trains || []).concat(BUILDINGS[f.hq].trains || []));
  const worst = top[0], beats = worst[1] === 'unit' ? (UNITS[worst[2]].weak || []).filter(k => mine.has(k)) : [];
  el.innerHTML = `Most of your losses: to ${top.map(([n, t, k]) => `${pic(t, k)}${name(t, k)} (${n})`).join(' and ')}.` +
    (beats.length ? ` ${beats.slice(0, 2).map(k => name('unit', k)).join(' and ')} beat ${name('unit', worst[2])}.` : '');
}

/** This side's allies (the other seats of its team). */
const allies = () => G.teams.map((_, s) => s).filter(s => s !== G.me && !enemies(G.me, s));
/** This side's game is over: the game is, or every seat of its team is out (a free-for-all goes on without it). */
const myGameOver = () => G.over || (G.out[G.me] && allies().every(s => G.out[s]));
/** The end card's line under the result. */
function endLine(win) {
  const after = ' after ' + fmt(G.time) + '.';
  const mine = allies();
  if (mine.length) { // (a team game: the team's result; online, the friends on it by name)
    const names = online.playing ? mine.map(s => online.names[s]).filter(n => n && n !== 'the AI') : [];
    return `Your team ${win ? 'wins' : 'lost'}${names.length ? ` with ${names.join(' and ')}` : ''}` + after;
  }
  if (G.teams.length > 2) { // (free for all: nobody in particular beat this side, nor lost to it)
    return (win ? 'The last one standing' : G.out[G.me] && G.conceded === G.me ? 'You conceded' : G.bldgs.some(b => b.team === G.me) ? 'Nothing left to fight with' : 'Your base fell') + after;
  }
  // A duel: online, the other side has a name (a friend's, as typed in the lobby). "Conceded" is said only of an enemy.
  const them = online.playing ? online.names[foes()[0]] || '' : '';
  return G.conceded === G.me ? (them ? `You conceded to ${them}` : 'You conceded') + after : G.conceded >= 0 ? `${them || 'The enemy'} conceded` + after
    : G.bldgs.some(b => G.teams[b.team] !== G.winner) ? (win ? `${them || 'The enemy'} had nothing left to fight with` : 'Nothing left to fight with') + after // (out with buildings standing)
    : win ? (them ? `${them}'s base is rubble` : 'The enemy base is rubble') + after : (them ? `Your base fell to ${them}` : 'Your base fell') + after;
}

function endGame() {
  closePause(); setSelection([]); updateHud(); // (a console frozen mid-"Training" would sit under the result)
  const win = G.over && G.winner === G.teams[G.me]; // (the winner is a team; out of a game that goes on: lost)
  $('result').textContent = win ? 'VICTORY' : 'DEFEAT'; $('result').className = win ? 'win' : 'lose';
  $('endSub').textContent = endLine(win);
  const map = online.playing ? onlineMap(online.setup) : setup();
  $('endMap').innerHTML = `<b>${map.name}</b>: ${MAP_KINDS[map.kind].story}`; // the map's secret, told at the end
  const S = G.stats[G.me];
  $('endStats').innerHTML = `<span>Units trained <b>${S.built}</b></span><span>Units lost <b>${S.lost}</b></span><span>Enemies killed <b>${S.killed}</b></span><span>Structures razed <b>${S.razed}</b></span>`;
  whatBeatYou();
  const seen = seenLine(-1, 'You saw: ', ''); $('endSeen').innerHTML = seen; $('endSeen').hidden = !seen; // (their army as far as it was scouted)
  // Both armies over the game (the enemy's revealed now), and the result on this device's record.
  const chart = armyChart(armyLog(G.me), foes().map(armyLog).reduce((sum, l) => l.map((v, i) => v + (sum[i] || 0)), [])); // (the enemies together)
  $('endChart').innerHTML = chart; $('endKey').hidden = !chart;
  const fs = foes(); $('endKey').querySelector('.foe').textContent = fs.length > 1 ? 'Enemy armies' : online.playing ? `${Who(fs[0])}'s army` : 'Enemy army';
  $('btnAgain').textContent = online.playing ? 'LEAVE ROOM' : 'NEW GAME'; // (online: this room, and its rematch, are left)
  $('btnAgain').title = online.playing ? 'Back to the menu: out of this room' : 'Back to the menu, for another map or opponent';
  $('btnWatch').hidden = menu.tutorial || online.playing; // (the guided game's hold is not in the log; an online game is watched later)
  if (online.playing) online.net?.over(); // (the relay stops the clock once both games are over)
  rematchButton(theyWant(), online.rematch);
  $('end').hidden = false; $('btnRematch').focus(); sfx(win ? 'done' : 'boom'); disarmLeaveGuard();
  if (!online.playing && !menu.tutorial) recordResult(win, G.factions[G.me], G.diff); // (after the card is up; a guided game is not counted; online games are not on the vs-AI record)
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
$('btnRematch').addEventListener('click', () => { sfx('select'); if (online.playing) rematchButton(theyWantRematch, wantRematch()); else newGame(); }); // the same map, seed, races and difficulty; online, another game in the room
initScreen(); initLeaveDialog(); initTools();
initPause({ onRestart: () => { giveUp(); newGame(); }, onQuit: () => { disarmLeaveGuard(); quitToTitle(); }, onDone: doneWatching });
const syncSound = () => { setIconButton($('btnSound'), audio.muted ? 'mute' : 'sound', audio.muted ? 'SOUND OFF' : 'SOUND ON'); $('btnSound').title = audio.muted ? 'Sound (off)' : 'Sound (on)'; $('btnSound').setAttribute('aria-pressed', String(!audio.muted)); };
$('btnSound').addEventListener('click', () => { audio.muted = !audio.muted; syncSound(); soundChanged(); soundToggled(); if (!audio.muted) sfx('select'); });
initMenu({ onStart: newGame, onSound: syncSound });
initOnline({
  start: newOnlineGame, leave: showMenu, quit: quitToTitle,
  room: () => { $('end').hidden = true; started = false; }, // (a rematch: from the end card back to the room)
  pause: roomPaused, resume: roomResumed, // (a room pause: the pause card on every side)
  rematch: (they, iWant) => {
    if ($('end').hidden) return; // (the end card reads the room's wishes when it comes up)
    if (they && !theyWantRematch && !iWant) toast(wantLine());
    rematchButton(they, iWant);
  },
});
// Online, a phone puts a hidden page to sleep (and its socket with it): on coming back, make sure the socket lives.
// A hidden desktop tab gets no frames, so its turns run from a slow timer instead.
document.addEventListener('visibilitychange', () => { if (!document.hidden) online.net?.wake(); });
setInterval(() => {
  if (!document.hidden || !online.playing || !started) return;
  const waiting = online.net.pump(); // (also after the game: heartbeats, for a rematch)
  if (G.over) return;
  for (let i = 0; i < waiting && step(DT); i++) online.net.ticked();
  drainEvents();
}, 250);
$('btnPauseHelp').addEventListener('click', () => { $('help').hidden = false; $('btnHelpClose').focus(); }); // How to play, over the pause menu

// ---- loop ----
let last = performance.now(), acc = 0, hudTimer = 0, ended = false, outSaid = false;
function loop(now) {
  const el = Math.min(0.1, (now - last) / 1000); last = now;
  if (input.enabled()) camKeys(el);
  if (running()) {
    const speed = ui.watching || 1; // (a replay plays faster)
    acc += el * speed; let n = 0;
    const done = () => ui.watching && (G.over || G.tick > replayEnd()); // (a replay stops where the game ended: its last tick's orders, then over)
    // Online: the relay's turns in, our orders out; behind by more than a few ticks, run faster to catch up.
    const waiting = online.playing ? online.net.pump() : 0, max = waiting > 9 ? 30 : 5 * speed;
    while ((acc >= DT || n < waiting - 9) && n++ < max && !done()) {
      if (!step(DT)) { acc = Math.min(acc, DT); break; } // (its turn is not in yet)
      acc = Math.max(0, acc - DT); if (online.playing) online.net.ticked(); // (catch-up steps are not charged to the clock)
    }
    if (acc > DT * 5 * speed) acc = 0;
    drainEvents();
    if (!ui.watching) noteSightings(); // (a replay shows both sides: not what this side scouted)
  }
  // Checked every frame, not only while running: the game can end between frames too. A replay ends where the game
  // did, back on the end card (the result is on record already).
  if (online.playing && G.over) online.net?.pump(); // (the game is over, the room is not: still here, for a rematch)
  if (ui.watching) { if (G.over || G.tick > replayEnd()) doneWatching(); }
  else if (started && !ended && myGameOver()) { ended = true; drainEvents(); endGame(); } // (once a game: `ended` resets in newGame)
  else if (started && !ended && G.out[G.me] && !outSaid) { outSaid = true; toast('You are out: your team fights on', true, true); } // (an ally still in: watch it)
  updateFx(el);
  if (started) render(ui.sel, ui.place, showPower());
  hudTimer += el; if (hudTimer > 0.12) { hudTimer = 0; if (started) { updateHud(); updateTools(); updateTutorial(); } }
  requestAnimationFrame(loop);
}

new ResizeObserver(resize).observe(document.getElementById('stage'));
// A handle for debugging in the console and for scripted playtests (single player: nothing here is secret).
window.endfall = { G, map: engine.map, ui, cam, view, zoomMin: ZOOM_MIN, toWorld, centerOn, setResources, engine, cardItems, online, teamLayers, seatTint, skip: (seconds) => { for (let i = 0; i < seconds * 30 && !G.over; i++) { step(DT); noteSightings(); } } };
bindInput(); resize(); requestAnimationFrame(loop);

// Offline: the built game registers its service worker (dist/sw.js, see tools/offline), which keeps every file so
// Ebbfall opens and plays without a connection once it has been loaded.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => { /* not available (file://, private mode) */ });
  if (document.readyState === 'complete') register(); else addEventListener('load', register); // (the WASM start may finish after load)
  // A new version installed while the game is open: out of a game (the menu, the lobby: back into its room), switch to
  // it at once (online, friends must share a version); in a game, say so (it loads next time) rather than interrupt.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // the first install, not an update
    if (!started) location.replace(reloadUrl()); else toast('A new version of Ebbfall is ready: it loads next time you open the game');
  });
}
