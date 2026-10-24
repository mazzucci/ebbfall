// Entry point: wires the sim (Rust/WASM via src/engine) to the client, runs the fixed-step loop, handles start/end screens.
import './style.css';
import * as engine from './engine/index.js';
import { G, DT, PLAYER, TILE, idx, resetGame, step, fmt, setResources } from './engine/index.js';
import { resize, render, renderTerrain, centerOn, boom, sparkAt, healFx, cam, view, toWorld, ALLY, FOE, ZOOM_MIN } from './client/gl/render.js';
import { $, ui, toast, updateHud, setHint, invalidateCard, cardItems } from './client/hud.js';
import { bindInput, camKeys, input, stopGlide } from './client/input.js';
import { sfx, audio, soundToggled } from './client/audio.js';
import { fx, burst, hit, updateFx } from './client/fx.js';
import { initTools, updateTools, onAttacked, initPause, paused, resetTools } from './client/tools.js';
import { setIconButton } from './client/icons.js';
import { initMenu, showMenu, soundChanged, menu, MAP_KINDS } from './client/menu.js';
import { initScreen, initLeaveDialog, armLeaveGuard, disarmLeaveGuard } from './client/screen.js';

audio.view = () => ({ x: cam.x, y: cam.y, w: view.w / cam.zoom, h: view.h / cam.zoom }); // sounds are placed by the camera
/** Sounds of things in the fog are not heard (the player cannot see them either). */
const seen = (e) => G.vis[idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE))] > 0;

let started = false;
const overlay = () => !$('start').hidden || !$('leave').hidden || !$('help').hidden || !$('splash').hidden;
const running = () => started && !overlay() && !paused() && !G.over;
input.enabled = () => started && !overlay() && !paused();

/** Start a game on the map and against the opponent chosen in the menu. */
function newGame() {
  $('help').hidden = true;
  resetGame(menu.seed, menu.diff, menu.kind, menu.side);
  ui.sel = []; ui.groups = {}; ui.mode = null; ui.place = null; fx.list = []; invalidateCard(); resetTools(); stopGlide();
  renderTerrain();
  // Start zoomed all the way out over the base, to see as much as possible; the wheel or a pinch zooms in.
  cam.zoom = ZOOM_MIN; const core = G.bldgs.find(b => b.team === PLAYER); centerOn(core.x + 40, core.y);
  $('end').hidden = true; $('start').hidden = true; started = true; setHint();
  toast('Mine shards. Build a Depot before supply caps.');
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
    else if (e.t === 'burst') { burst(e.x, e.y, e.r, e.team === PLAYER ? ALLY : FOE, Math.ceil(e.n / 2)); boom(e.x, e.y, e.r); if (seen(e)) sfx('boom', e); }
    else if (e.t === 'hit') { hit(e.x, e.y, e.big); sparkAt(e.x, e.y, e.big); if (seen(e)) sfx('hit', e); }
    else if (e.t === 'fire') sfx(e.w, e);
    else if (e.t === 'heal') healFx(e.x, e.y, e.tx, e.ty);
    else if (e.t === 'attacked') onAttacked(e);
  }
  G.events.length = 0;
}

function endGame() {
  const win = G.winner === PLAYER;
  $('result').textContent = win ? 'VICTORY' : 'DEFEAT'; $('result').className = win ? 'win' : 'lose';
  $('endSub').textContent = win ? 'The enemy base is rubble after ' + fmt(G.time) + '.' : 'Your base fell after ' + fmt(G.time) + '.';
  $('endMap').innerHTML = `<b>${menu.name}</b>: ${MAP_KINDS[menu.kind].story}`; // the map's secret, told at the end
  const S = G.stats;
  $('endStats').innerHTML = `<span>Units trained <b>${S.built}</b></span><span>Units lost <b>${S.lost}</b></span><span>Enemies killed <b>${S.killed}</b></span><span>Structures razed <b>${S.razed}</b></span>`;
  $('end').hidden = false; sfx(win ? 'done' : 'boom'); disarmLeaveGuard();
}

// ---- screens ----
$('btnAgain').addEventListener('click', () => { $('end').hidden = true; started = false; showMenu(); }); // back to the menu: a new map, or the same opponent again
initScreen(); initLeaveDialog(); initTools();
initPause({ onResume: () => {}, onRestart: () => newGame(), onQuit: () => { disarmLeaveGuard(); quitToTitle(); } });
const syncSound = () => { setIconButton($('btnSound'), audio.muted ? 'mute' : 'sound', audio.muted ? 'SOUND OFF' : 'SOUND ON'); $('btnSound').title = audio.muted ? 'Sound (off)' : 'Sound (on)'; $('btnSound').setAttribute('aria-pressed', String(!audio.muted)); };
$('btnSound').addEventListener('click', () => { audio.muted = !audio.muted; syncSound(); soundChanged(); soundToggled(); if (!audio.muted) sfx('select'); });
initMenu({ onStart: newGame, onSound: syncSound });
$('btnHelp').addEventListener('click', () => { $('help').hidden = false; $('btnHelpClose').focus(); }); // the game waits while it is open

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
  if (started) render(ui.sel, ui.place);
  hudTimer += el; if (hudTimer > 0.12) { hudTimer = 0; if (started) { updateHud(); updateTools(); } }
  requestAnimationFrame(loop);
}

new ResizeObserver(resize).observe(document.getElementById('stage'));
// A handle for debugging in the console and for scripted playtests (single player: nothing here is secret).
window.endfall = { G, map: engine.map, ui, cam, zoomMin: ZOOM_MIN, toWorld, centerOn, setResources, engine, cardItems, skip: (seconds) => { for (let i = 0; i < seconds * 30 && !G.over; i++) step(DT); } };
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
