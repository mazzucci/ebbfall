// Entry point: wires the sim (Rust/WASM via src/engine) to the client, runs the fixed-step loop, handles start/end screens.
import './style.css';
import { G, DT, PLAYER, resetGame, step, fmt, setResources } from './engine/index.js';
import { resize, render, renderTerrain, centerOn, boom, sparkAt, cam, toWorld, ALLY, FOE } from './client/gl/render.js';
import { $, ui, toast, updateHud, setHint, invalidateCard } from './client/hud.js';
import { bindInput, camKeys, input } from './client/input.js';
import { sfx, audio } from './client/audio.js';
import { fx, burst, hit, updateFx } from './client/fx.js';
import { initScreen, initLeaveDialog, enterFullscreen, armLeaveGuard, disarmLeaveGuard, touchDevice } from './client/screen.js';

let started = false;
const running = () => started && $('start').hidden && $('leave').hidden && !G.over;
input.enabled = () => started && $('start').hidden && $('leave').hidden;

function newGame() {
  const seed = (Math.random() * 1e9) | 0;
  resetGame(seed, ui.diff ?? 1);
  ui.sel = []; ui.groups = {}; ui.mode = null; ui.place = null; fx.list = []; invalidateCard();
  renderTerrain();
  const core = G.bldgs.find(b => b.team === PLAYER); centerOn(core.x + 40, core.y);
  $('end').hidden = true; $('start').hidden = true; started = true; setHint();
  toast('Mine shards. Build a Depot before supply caps.');
  armLeaveGuard({ onAsk: () => {}, onResume: () => { last = performance.now(); }, onLeave: quitToTitle });
}

/** Leave the current game for the title screen (the next back gesture then really leaves the page). */
function quitToTitle() {
  started = false; $('end').hidden = true; $('start').hidden = false; $('btnStart').textContent = 'START GAME';
}

/** Turn sim events into client effects. */
function drainEvents() {
  for (const e of G.events) {
    if (e.t === 'sfx') sfx(e.name);
    else if (e.t === 'toast') toast(e.msg, e.bad);
    else if (e.t === 'burst') { burst(e.x, e.y, e.r, e.team === PLAYER ? ALLY : FOE, Math.ceil(e.n / 2)); boom(e.x, e.y, e.r); }
    else if (e.t === 'hit') { hit(e.x, e.y, e.big); sparkAt(e.x, e.y, e.big); }
  }
  G.events.length = 0;
}

function endGame() {
  const win = G.winner === PLAYER;
  $('result').textContent = win ? 'VICTORY' : 'DEFEAT'; $('result').className = win ? 'win' : 'lose';
  $('endSub').textContent = win ? 'The enemy base is rubble after ' + fmt(G.time) + '.' : 'Your base fell after ' + fmt(G.time) + '.';
  const S = G.stats;
  $('endStats').innerHTML = `<span>Units trained <b>${S.built}</b></span><span>Units lost <b>${S.lost}</b></span><span>Enemies killed <b>${S.killed}</b></span><span>Structures razed <b>${S.razed}</b></span>`;
  $('end').hidden = false; sfx(win ? 'done' : 'boom'); disarmLeaveGuard();
}

// ---- screens ----
ui.diff = 1;
document.querySelectorAll('#diff .ib').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#diff .ib').forEach(x => x.classList.remove('on')); b.classList.add('on'); ui.diff = +b.dataset.d; }));
$('btnStart').addEventListener('click', () => { sfx('select'); if (touchDevice) enterFullscreen(); if ($('btnStart').textContent === 'RESUME') { $('start').hidden = true; last = performance.now(); } else newGame(); });
$('btnAgain').addEventListener('click', () => { if (touchDevice) enterFullscreen(); newGame(); });
initScreen(); initLeaveDialog();
$('btnSound').addEventListener('click', () => { audio.muted = !audio.muted; $('btnSound').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON'; if (!audio.muted) sfx('select'); });
$('btnHelp').addEventListener('click', () => { $('start').hidden = false; $('btnStart').textContent = started ? 'RESUME' : 'START GAME'; });

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
    if (G.over && !ended) { ended = true; endGame(); }
    if (!G.over) ended = false;
  }
  updateFx(el);
  if (started) render(ui.sel, ui.place);
  hudTimer += el; if (hudTimer > 0.12) { hudTimer = 0; if (started) updateHud(); }
  requestAnimationFrame(loop);
}

new ResizeObserver(resize).observe(document.getElementById('stage'));
// A handle for debugging in the console and for scripted playtests (single player: nothing here is secret).
window.endfall = { G, ui, cam, toWorld, centerOn, setResources };
bindInput(); resize(); requestAnimationFrame(loop);
