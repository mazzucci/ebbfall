// Entry point: wires the sim (Rust/WASM via src/engine) to the client, runs the fixed-step loop, handles start/end screens.
import './style.css';
import * as engine from './engine/index.js';
import { G, DT, TILE, BUILDINGS, idx, resetGame, step, fmt, setResources, armyLog } from './engine/index.js';
import { resize, render, renderTerrain, centerOn, ping, boom, sparkAt, healFx, castFx, cam, view, toWorld, ALLY, FOE, ZOOM_MIN } from './client/gl/render.js';
import { updateHud, invalidateCard, cardItems, myFaction, aName } from './client/hud.js';
import { $, ui, toast, setHint, setSelection } from './client/ui.js';
import { bindInput, camKeys, input, stopGlide } from './client/input.js';
import { sfx, audio, soundToggled } from './client/audio.js';
import { fx, burst, hit, updateFx } from './client/fx.js';
import { initTools, updateTools, onAttacked, initPause, paused, togglePause, resetTools } from './client/tools.js';
import { setIconButton } from './client/icons.js';
import { initMenu, showMenu, soundChanged, recordResult, setup, menu, MAP_KINDS } from './client/menu.js';
import { startTutorial, updateTutorial } from './client/tutorial.js';
import { armyChart } from './client/chart.js';
import { initScreen, initLeaveDialog, armLeaveGuard, disarmLeaveGuard, upright, blockedUpright } from './client/screen.js';

audio.view = () => ({ x: cam.x, y: cam.y, w: view.w / cam.zoom, h: view.h / cam.zoom }); // sounds are placed by the camera
/** Sounds of things in the fog are not heard (the player cannot see them either). */
const seen = (e) => G.vis[idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE))] > 0;

let started = false;
const overlay = () => !$('start').hidden || !$('leave').hidden || !$('help').hidden || !$('splash').hidden || !$('end').hidden;
const running = () => started && !overlay() && !paused() && !G.over && !blockedUpright();
input.enabled = () => started && !overlay() && !paused() && !blockedUpright();

/** Whether to show the player's power fields: a race with them, and a power building (or one that needs power)
 * selected, or the Build list open, so the rule is visible before a placement fails. */
function showPower() {
  if (!myFaction().power) return false;
  return ui.mode === 'build' || ui.mode === 'build2' || !!ui.place || ui.sel.some(e => e.kind === 'bldg' && e.team === G.me && (e.d.power > 0 || e.d.needsPower));
}

/** Start a game on the map and against the opponent chosen in the menu. */
function newGame() {
  $('help').hidden = true;
  const g = setup(); // (the menu's choices, or the guided first game's)
  resetGame(g.seed, g.diff, g.kind, g.side, g.race, g.enemyRace);
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
function quitToTitle() {
  started = false; $('pause').hidden = true; $('end').hidden = true; $('help').hidden = true; showMenu();
}

/** Turn sim events into client effects. */
function drainEvents() {
  for (const e of G.events) {
    if (e.t === 'sfx') sfx(e.name);
    else if (e.t === 'toast') toast(e.msg, e.bad);
    else if (e.t === 'ping') ping(e.x, e.y); // (something of ours finished, or needs a look)
    else if (e.t === 'burst') { burst(e.x, e.y, e.r, e.team === G.me ? ALLY : FOE, Math.ceil(e.n / 2)); boom(e.x, e.y, e.r); if (seen(e)) sfx('boom', e); }
    else if (e.t === 'hit') { hit(e.x, e.y, e.big); sparkAt(e.x, e.y, e.big); if (seen(e)) sfx('hit', e); }
    else if (e.t === 'fire') sfx(e.w, e);
    else if (e.t === 'cast') { sfx(e.ability, e); castFx(e.x, e.y, e.ability); }
    else if (e.t === 'heal') healFx(e.x, e.y, e.tx, e.ty, e.mend);
    else if (e.t === 'attacked') onAttacked(e);
  }
  G.events.length = 0;
}

function endGame() {
  setSelection([]); updateHud(); // (a console frozen mid-"Training" would sit under the result)
  const win = G.winner === G.me;
  $('result').textContent = win ? 'VICTORY' : 'DEFEAT'; $('result').className = win ? 'win' : 'lose';
  $('endSub').textContent = G.conceded === G.me ? 'You conceded after ' + fmt(G.time) + '.' : G.conceded >= 0 ? 'The enemy conceded after ' + fmt(G.time) + '.'
    : G.bldgs.some(b => b.team === 1 - G.winner) ? (win ? 'The enemy had nothing left to fight with after ' : 'Nothing left to fight with after ') + fmt(G.time) + '.' // (out with buildings standing)
    : win ? 'The enemy base is rubble after ' + fmt(G.time) + '.' : 'Your base fell after ' + fmt(G.time) + '.';
  $('endMap').innerHTML = `<b>${setup().name}</b>: ${MAP_KINDS[setup().kind].story}`; // the map's secret, told at the end
  const S = G.stats[G.me];
  $('endStats').innerHTML = `<span>Units trained <b>${S.built}</b></span><span>Units lost <b>${S.lost}</b></span><span>Enemies killed <b>${S.killed}</b></span><span>Structures razed <b>${S.razed}</b></span>`;
  // Both armies over the game (the enemy's revealed now), and the result on this device's record.
  const chart = armyChart(armyLog(G.me), armyLog(1 - G.me));
  $('endChart').innerHTML = chart; $('endKey').hidden = !chart;
  $('end').hidden = false; $('btnRematch').focus(); sfx(win ? 'done' : 'boom'); disarmLeaveGuard();
  if (!menu.tutorial) recordResult(win, G.factions[G.me], G.diff); // (after the card is up; a guided game is not counted)
}

// ---- screens ----
$('btnAgain').addEventListener('click', () => { $('end').hidden = true; started = false; showMenu(); }); // back to the menu: a new map, or the same opponent again
$('btnRematch').addEventListener('click', () => { sfx('select'); newGame(); }); // the same map, seed, races and difficulty
initScreen(); initLeaveDialog(); initTools();
// Turned upright mid-game: pause (the rotate card covers the screen), so turning back shows Resume, not a game that ran on.
let pausedUpright = false;
upright.addEventListener('change', () => { if (blockedUpright() && started && !overlay() && !paused() && !G.over) { togglePause(); pausedUpright = true; } });
// Choosing to play upright anyway resumes a game the turn paused (one tap, not two).
$('btnUpright').addEventListener('click', () => { if (pausedUpright && paused()) togglePause(); pausedUpright = false; });
initPause({ onResume: () => {}, onRestart: () => newGame(), onQuit: () => { disarmLeaveGuard(); quitToTitle(); }, onConcede: () => engine.concede() });
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
    acc += el; let n = 0;
    while (acc >= DT && n++ < 5) { step(DT); acc -= DT; }
    if (acc > DT * 5) acc = 0;
    drainEvents();
  }
  // Checked every frame, not only while running: the game can end between frames too.
  if (started && G.over && !ended) { ended = true; drainEvents(); endGame(); }
  if (!G.over) ended = false;
  updateFx(el);
  if (started) render(ui.sel, ui.place, showPower());
  hudTimer += el; if (hudTimer > 0.12) { hudTimer = 0; if (started) { updateHud(); updateTools(); updateTutorial(); } }
  requestAnimationFrame(loop);
}

new ResizeObserver(resize).observe(document.getElementById('stage'));
// A handle for debugging in the console and for scripted playtests (single player: nothing here is secret).
window.endfall = { G, map: engine.map, ui, cam, view, zoomMin: ZOOM_MIN, toWorld, centerOn, setResources, engine, cardItems, skip: (seconds) => { for (let i = 0; i < seconds * 30 && !G.over; i++) step(DT); } };
bindInput(); resize(); requestAnimationFrame(loop);

// Offline: the built game registers its service worker (dist/sw.js, see tools/offline), which keeps every file so
// Endfall opens and plays without a connection once it has been loaded.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => { /* not available (file://, private mode) */ });
  if (document.readyState === 'complete') register(); else addEventListener('load', register); // (the WASM start may finish after load)
  // A new version installed while the game is open: on the menu, switch to it at once; in a game, say so (it loads
  // next time) rather than interrupt.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // the first install, not an update
    if (!$('start').hidden) location.reload(); else toast('A new version of Endfall is ready: it loads next time you open the game');
  });
}
