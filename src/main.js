// Entry point: wires the sim (Rust/WASM via src/engine) to the client, runs the fixed-step loop, handles start/end screens.
import './style.css';
import * as engine from './engine/index.js';
import { G, DT, TILE, UNITS, BUILDINGS, idx, resetGame, step, fmt, setResources, armyLog, lostTo, startReplay, replayEnd } from './engine/index.js';
import { resize, render, renderTerrain, centerOn, ping, boom, sparkAt, healFx, castFx, cam, view, toWorld, ALLY, FOE, ZOOM_MIN } from './client/gl/render.js';
import { updateHud, invalidateCard, cardItems, myFaction, aName } from './client/hud.js';
import { $, ui, toast, setHint, setSelection } from './client/ui.js';
import { bindInput, camKeys, input, stopGlide } from './client/input.js';
import { sfx, audio, soundToggled } from './client/audio.js';
import { fx, burst, hit, updateFx } from './client/fx.js';
import { initTools, updateTools, onAttacked, initPause, paused, togglePause, resetTools } from './client/tools.js';
import { setIconButton, portrait } from './client/icons.js';
import { initMenu, showMenu, soundChanged, recordResult, setup, menu, MAP_KINDS } from './client/menu.js';
import { startTutorial, updateTutorial } from './client/tutorial.js';
import { armyChart } from './client/chart.js';
import { resetSightings, noteSightings, seenLine } from './client/scout.js';
import { initScreen, initLeaveDialog, armLeaveGuard, disarmLeaveGuard } from './client/screen.js';

audio.view = () => ({ x: cam.x, y: cam.y, w: view.w / cam.zoom, h: view.h / cam.zoom }); // sounds are placed by the camera
/** Sounds of things in the fog are not heard (the player cannot see them either). */
const seen = (e) => G.vis[idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE))] > 0;

let started = false;
const overlay = () => !$('start').hidden || !$('leave').hidden || !$('help').hidden || !$('splash').hidden || !$('end').hidden;
const running = () => started && !overlay() && !paused() && !G.over;
input.enabled = () => started && !overlay() && !paused();

/** Whether to show the player's power fields: a race with them, and a power building (or one that needs power)
 * selected, or the Build list open, so the rule is visible before a placement fails. */
function showPower() {
  if (!myFaction().power) return false;
  return ui.mode === 'build' || ui.mode === 'build2' || !!ui.place || ui.sel.some(e => e.kind === 'bldg' && e.team === G.me && (e.d.power > 0 || e.d.needsPower));
}

/** Start a game on the map and against the opponent chosen in the menu. */
function newGame() {
  $('help').hidden = true; stopWatching(); ended = false;
  const g = setup(); // (the menu's choices, or the guided first game's)
  resetGame(g.seed, g.diff, g.kind, g.side, g.race, g.enemyRace);
  audio.voice = G.factions[G.me]; // (the announcer speaks in this side's race's voice)
  resetSightings();
  setSelection([]); ui.groups = {}; fx.list = []; invalidateCard(); resetTools(); stopGlide();
  renderTerrain();
  // Start zoomed all the way out over the base, to see as much as possible; the wheel or a pinch zooms in.
  cam.zoom = ZOOM_MIN; const core = G.bldgs.find(b => b.team === G.me); centerOn(core.x + 40, core.y);
  $('end').hidden = true; $('start').hidden = true; started = true; setHint();
  startTutorial(menu.tutorial); // (the guided first game's checklist replaces the opening tip)
  if (!menu.tutorial) toast(`Mine shards. Build ${aName(BUILDINGS[myFaction().supply].name)} before supply caps.`);
  armLeaveGuard({ onAsk: () => {}, onResume: () => { last = performance.now(); }, onLeave: quitToTitle });
}

/** Leave the current game for the title screen (the next back gesture then really leaves the page). */
/** Leaving (or restarting) a game in progress gives it up: a defeat on this device's record (the pause card says so). */
function giveUp() { if (started && !G.over && !menu.tutorial && !ui.watching) recordResult(false, G.factions[G.me], G.diff); }
function quitToTitle() {
  giveUp(); stopWatching();
  started = false; $('pause').hidden = true; $('end').hidden = true; $('help').hidden = true; showMenu();
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
  const pic = (t, k) => portrait(t, k, 22, 1 - G.me);
  // (only what this side can train: advice it can act on)
  const f = myFaction(), mine = new Set([...f.buildBasic, ...f.buildAdvanced].flatMap(b => BUILDINGS[b].trains || []).concat(BUILDINGS[f.hq].trains || []));
  const worst = top[0], beats = worst[1] === 'unit' ? (UNITS[worst[2]].weak || []).filter(k => mine.has(k)) : [];
  el.innerHTML = `Most of your losses: to ${top.map(([n, t, k]) => `${pic(t, k)}${name(t, k)} (${n})`).join(' and ')}.` +
    (beats.length ? ` ${beats.slice(0, 2).map(k => name('unit', k)).join(' and ')} beat ${name('unit', worst[2])}.` : '');
}

function endGame() {
  setSelection([]); updateHud(); // (a console frozen mid-"Training" would sit under the result)
  const win = G.winner === G.me;
  $('result').textContent = win ? 'VICTORY' : 'DEFEAT'; $('result').className = win ? 'win' : 'lose';
  $('endSub').textContent = G.conceded === G.me ? 'You conceded after ' + fmt(G.time) + '.' : G.conceded >= 0 ? 'The enemy conceded after ' + fmt(G.time) + '.'
    : G.bldgs.some(b => b.team !== G.winner) ? (win ? 'The enemy had nothing left to fight with after ' : 'Nothing left to fight with after ') + fmt(G.time) + '.' // (out with buildings standing)
    : win ? 'The enemy base is rubble after ' + fmt(G.time) + '.' : 'Your base fell after ' + fmt(G.time) + '.';
  $('endMap').innerHTML = `<b>${setup().name}</b>: ${MAP_KINDS[setup().kind].story}`; // the map's secret, told at the end
  const S = G.stats[G.me];
  $('endStats').innerHTML = `<span>Units trained <b>${S.built}</b></span><span>Units lost <b>${S.lost}</b></span><span>Enemies killed <b>${S.killed}</b></span><span>Structures razed <b>${S.razed}</b></span>`;
  whatBeatYou();
  const seen = seenLine(-1, 'You saw: ', ''); $('endSeen').innerHTML = seen; $('endSeen').hidden = !seen; // (their army as far as it was scouted)
  // Both armies over the game (the enemy's revealed now), and the result on this device's record.
  const chart = armyChart(armyLog(G.me), armyLog(1 - G.me));
  $('endChart').innerHTML = chart; $('endKey').hidden = !chart;
  $('btnWatch').hidden = menu.tutorial; // (the guided game's hold is not in the log)
  $('end').hidden = false; $('btnRematch').focus(); sfx(win ? 'done' : 'boom'); disarmLeaveGuard();
  if (!menu.tutorial) recordResult(win, G.factions[G.me], G.diff); // (after the card is up; a guided game is not counted)
}

// ---- screens ----
$('btnAgain').addEventListener('click', () => { $('end').hidden = true; started = false; showMenu(); }); // back to the menu: a new map, or the same opponent again
$('btnRematch').addEventListener('click', () => { sfx('select'); newGame(); }); // the same map, seed, races and difficulty
initScreen(); initLeaveDialog(); initTools();
initPause({ onResume: () => {}, onRestart: () => { giveUp(); newGame(); }, onQuit: () => { disarmLeaveGuard(); quitToTitle(); } });
const syncSound = () => { setIconButton($('btnSound'), audio.muted ? 'mute' : 'sound', audio.muted ? 'SOUND OFF' : 'SOUND ON'); $('btnSound').title = audio.muted ? 'Sound (off)' : 'Sound (on)'; $('btnSound').setAttribute('aria-pressed', String(!audio.muted)); };
$('btnSound').addEventListener('click', () => { audio.muted = !audio.muted; syncSound(); soundChanged(); soundToggled(); if (!audio.muted) sfx('select'); });
initMenu({ onStart: newGame, onSound: syncSound });
$('btnPauseHelp').addEventListener('click', () => { $('help').hidden = false; $('btnHelpClose').focus(); }); // How to play, over the pause menu

// ---- loop ----
let last = performance.now(), acc = 0, hudTimer = 0, ended = false;
function loop(now) {
  const el = Math.min(0.1, (now - last) / 1000); last = now;
  if (input.enabled()) camKeys(el);
  if (running()) {
    const speed = ui.watching || 1; // (a replay plays faster)
    acc += el * speed; let n = 0;
    const done = () => ui.watching && (G.over || G.tick > replayEnd()); // (a replay stops where the game ended: its last tick's orders, then over)
    while (acc >= DT && n++ < 5 * speed && !done()) { step(DT); acc -= DT; }
    if (acc > DT * 5 * speed) acc = 0;
    drainEvents();
    if (!ui.watching) noteSightings(); // (a replay shows both sides: not what this side scouted)
  }
  // Checked every frame, not only while running: the game can end between frames too. A replay ends where the game
  // did, back on the end card (the result is on record already).
  if (ui.watching) { if (G.over || G.tick > replayEnd()) doneWatching(); }
  else if (started && G.over && !ended) { ended = true; drainEvents(); endGame(); } // (once a game: `ended` resets in newGame)
  updateFx(el);
  if (started) render(ui.sel, ui.place, showPower());
  hudTimer += el; if (hudTimer > 0.12) { hudTimer = 0; if (started) { updateHud(); updateTools(); updateTutorial(); } }
  requestAnimationFrame(loop);
}

new ResizeObserver(resize).observe(document.getElementById('stage'));
// A handle for debugging in the console and for scripted playtests (single player: nothing here is secret).
window.endfall = { G, map: engine.map, ui, cam, view, zoomMin: ZOOM_MIN, toWorld, centerOn, setResources, engine, cardItems, skip: (seconds) => { for (let i = 0; i < seconds * 30 && !G.over; i++) { step(DT); noteSightings(); } } };
bindInput(); resize(); requestAnimationFrame(loop);

// Offline: the built game registers its service worker (dist/sw.js, see tools/offline), which keeps every file so
// Ebbfall opens and plays without a connection once it has been loaded.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => { /* not available (file://, private mode) */ });
  if (document.readyState === 'complete') register(); else addEventListener('load', register); // (the WASM start may finish after load)
  // A new version installed while the game is open: on the menu, switch to it at once; in a game, say so (it loads
  // next time) rather than interrupt.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // the first install, not an update
    if (!$('start').hidden) location.reload(); else toast('A new version of Ebbfall is ready: it loads next time you open the game');
  });
}
