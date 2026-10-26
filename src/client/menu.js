// The start menu (a page of its own: opponent, race, one of three maps, sound, Exit game); the phone's "tap to play"
// splash (that first tap enters full screen and so locks landscape, and the browser's full-screen notice shows over
// the menu, not the battle); and the How to play card.
// Three fixed maps with made-up names and hidden characters (MapKind in the sim; the default is the standard map, the
// others are surprises to discover in play), and a random map generated each time; the end screen tells the story.
// Difficulty and sound are remembered on this device.
import { mulberry, mapPreview, DUEL_MW as MW, DUEL_MH as MH, DIFF } from '../engine/index.js';
import { $ } from './hud.js';
import { audio, sfx, soundToggled } from './audio.js';
import { touchDevice, enterFullscreen, exitFullscreen, canGoFullscreen, standalone } from './screen.js';

const store = { get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } } };

/** Map characters, in the sim's MapKind order, with the story the end screen tells. */
export const MAP_KINDS = [
  { story: 'Old mining country: balanced fields and winding passes.' }, // Standard
  { story: 'The crystal here ran ten times deeper than anywhere else.' }, // DeepFields
  { story: 'An ether storm: vents everywhere, each three times as rich.' }, // EtherStorm
  { story: 'Open plains: barely any rock to hide behind, so the attacks came fast.' }, // OpenPlains
  { story: 'A labyrinth of rock and narrow passes, made for holding chokepoints.' }, // Labyrinth
  { story: 'Picked nearly clean long ago: small fields, expand or starve.' }, // Barren
];

/** The maps: always the same layout (like the maps of 1998), plus a random one generated each time. */
export const MAPS = [
  { name: 'Ashen Basin', seed: 4242, kind: 0 },
  { name: 'Glass Reach', seed: 1998, kind: 1 },
  { name: 'Cinder Divide', seed: 2077, kind: 4 },
  { name: 'Random', random: true },
];
export const menu = { tutorial: false, diff: 0, seed: MAPS[0].seed, kind: 0, map: 0, name: MAPS[0].name, side: 0, race: 'humans', enemy: 'humans', enemyRace: 'humans' };
/** ?seed=N in the URL plays a random-slot map of that seed, standard character (tests use it). */
const urlSeed = new URLSearchParams(location.search).get('seed');

/** Pick map `i`; the random one draws a new seed and a hidden character each time it is chosen or played. */
function choose(i) {
  const m = MAPS[i];
  menu.map = i;
  menu.side = urlSeed !== null ? 0 : Math.random() < 0.5 ? 0 : 1; // which of the map's two bases is ours: drawn each game (?seed= keeps it fixed)
  if (!m.random) Object.assign(menu, { seed: m.seed, kind: m.kind, name: m.name });
  else if (urlSeed !== null) Object.assign(menu, { seed: (+urlSeed) >>> 0, kind: 0, name: mapName((+urlSeed) >>> 0) });
  else { const seed = (Math.random() * 1e9) >>> 0; Object.assign(menu, { seed, kind: Math.floor(Math.random() * MAP_KINDS.length), name: mapName(seed) }); }
}

const FIRST = ['Ashen', 'Glass', 'Hollow', 'Iron', 'Sunken', 'Cinder', 'Pale', 'Shattered', 'Silent', 'Rust', 'Frozen', 'Amber', 'Broken', 'Ember', 'Grey', 'Last'];
const SECOND = ['Basin', 'Ridge', 'Reach', 'Mesa', 'Hollows', 'Expanse', 'Crossing', 'Wastes', 'Divide', 'Plateau', 'Gorge', 'Flats', 'Rim', 'Fields', 'Shelf', 'Sink'];
/** A name for a map, the same every time for its seed. */
export function mapName(seed) { const r = mulberry(seed ^ 0x5bd1e995); return FIRST[Math.floor(r() * FIRST.length)] + ' ' + SECOND[Math.floor(r() * SECOND.length)]; }

function renderMaps() {
  const box = $('maps'); box.innerHTML = '';
  MAPS.forEach((m, i) => {
    const b = document.createElement('button'), on = i === menu.map;
    b.className = 'ib map' + (on ? ' on' : '') + (m.random ? ' random' : ''); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on));
    b.textContent = m.name.toUpperCase(); b.dataset.map = i;
    if (m.random) b.title = 'A new map every time';
    b.addEventListener('click', () => { choose(i); renderMaps(); sfx('select'); });
    box.appendChild(b);
  });
  drawPreview();
}

// The chosen map's thumbnail: rock, fields, vents and the two starts (a Random map: a question mark).
const PREVIEW = ['#2a3442', '#7d8796', '#4fd1c5', '#a78bfa', '#f5a524'];
function drawPreview() {
  const cv = $('mapPreview'), g = cv.getContext('2d'), m = MAPS[menu.map];
  cv.width = MW; cv.height = MH;
  if (m.random) {
    g.fillStyle = PREVIEW[0]; g.fillRect(0, 0, MW, MH);
    g.fillStyle = '#8294aa'; g.font = `bold ${MH * 0.6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', MW / 2, MH / 2 + 2);
    cv.title = 'A new map every time'; return;
  }
  const tiles = mapPreview(menu.seed, menu.kind), img = g.createImageData(MW, MH);
  const rgb = PREVIEW.map(h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)));
  for (let i = 0; i < tiles.length; i++) img.data.set([...rgb[tiles[i]], 255], i * 4);
  g.putImageData(img, 0, 0);
  cv.title = m.name;
}

/** Reflect audio.muted on the menu and the top bar. */
let syncSound = () => {};
function soundLabel() { const on = !audio.muted; $('btnMenuSound').textContent = on ? 'ON' : 'OFF'; $('btnMenuSound').setAttribute('aria-pressed', String(on)); $('btnMenuSound').classList.toggle('on', on); }

export function initMenu({ onStart, onSound }) {
  syncSound = onSound;
  const saved = +store.get('diff');
  menu.diff = store.get('diff') !== null && Number.isInteger(saved) && saved >= 0 && saved < DIFF.length ? saved : 0; // new players start on Easy
  if (store.get('muted') === '1') audio.muted = true;
  const diffs = document.querySelectorAll('#diff .ib');
  const showDiff = () => diffs.forEach(x => { const on = +x.dataset.d === menu.diff; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  diffs.forEach(b => b.addEventListener('click', () => { menu.diff = +b.dataset.d; store.set('diff', menu.diff); showDiff(); showRecord(); }));
  showDiff();
  // The player's race (remembered on this device).
  menu.race = ['humans', 'vael'].includes(store.get('race')) ? store.get('race') : 'humans';
  const races = document.querySelectorAll('#race .ib');
  const showRace = () => races.forEach(x => { const on = x.dataset.race === menu.race; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  races.forEach(b => b.addEventListener('click', () => { menu.race = b.dataset.race; store.set('race', menu.race); showRace(); showRecord(); sfx('select'); }));
  showRace(); showRecord();
  // The opponent's race (Random draws one each game).
  menu.enemy = ['humans', 'vael', 'random'].includes(store.get('enemy')) ? store.get('enemy') : 'humans';
  const foes = document.querySelectorAll('#enemy .ib');
  const showEnemy = () => foes.forEach(x => { const on = x.dataset.race === menu.enemy; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  foes.forEach(b => b.addEventListener('click', () => { menu.enemy = b.dataset.race; store.set('enemy', menu.enemy); showEnemy(); sfx('select'); }));
  showEnemy();
  choose(urlSeed !== null ? MAPS.length - 1 : 0); renderMaps();
  $('btnMenuSound').addEventListener('click', () => { audio.muted = !audio.muted; store.set('muted', audio.muted ? '1' : '0'); soundLabel(); syncSound(); soundToggled(); if (!audio.muted) sfx('select'); });
  soundLabel(); syncSound();
  $('btnFirst').addEventListener('click', () => { sfx('select'); if (touchDevice) enterFullscreen(); menu.tutorial = true; onStart(); });
  $('btnStart').addEventListener('click', () => { sfx('select'); if (touchDevice) enterFullscreen(); menu.tutorial = false; choose(menu.map); menu.enemyRace = menu.enemy === 'random' ? (Math.random() < 0.5 ? 'humans' : 'vael') : menu.enemy; onStart(); }); // each game draws our starting base (a random map, a random enemy race)
  $('btnHowTo').addEventListener('click', () => { $('help').hidden = false; $('btnHelpClose').focus(); });
  // Exit: a browser lets a page close itself only in some cases (a tab a script opened, or one with nothing to go
  // back to); otherwise it leaves full screen and says how to close it, in place of the tagline (the menu keeps its size).
  $('btnExit').addEventListener('click', () => {
    sfx('select'); window.close();
    setTimeout(() => { if (!window.closed) { exitFullscreen(); $('menuTag').textContent = standalone ? 'You can close the app now.' : 'You can close this tab now.'; } }, 250);
  });
  $('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
  // Phones: a first screen whose tap goes full screen, then the menu. (On iPhone Safari a page cannot go full
  // screen; the menu shows the Add to Home Screen tip instead.)
  if (touchDevice && canGoFullscreen) {
    $('splash').hidden = false;
    $('btnPlay').addEventListener('click', () => { enterFullscreen(); $('splash').hidden = true; });
  }
}

/** The game to start: the menu's choices, or the guided first game's own (Easy, the first map, Humans against Humans). */
export function setup() {
  if (!menu.tutorial) return menu;
  const m = MAPS[0];
  return { ...menu, diff: 0, seed: m.seed, kind: m.kind, name: m.name, side: 0, race: 'humans', enemyRace: 'humans' };
}

/** Back to the menu (after a game, or quitting), with the last choices. */
export function showMenu() { renderMaps(); showRecord(); $('start').hidden = false; }

// The player's record on this device, per race and difficulty: [won, lost].
const records = () => { try { const r = JSON.parse(store.get('record')); return r && typeof r === 'object' ? r : {}; } catch { return {}; } };
const tally = (r, k) => Array.isArray(r[k]) && r[k].length === 2 ? r[k].map(n => +n || 0) : [0, 0]; // (whatever else is stored)
/** Count a finished game for the race and difficulty it was played at. */
export function recordResult(win, race, diff) {
  const r = records(), k = `${race}:${diff}`, [w, l] = tally(r, k);
  r[k] = win ? [w + 1, l] : [w, l + 1]; store.set('record', JSON.stringify(r));
}
/** The record for the chosen race and difficulty, beside START (nothing before a first game). */
function showRecord() {
  const [w, l] = tally(records(), `${menu.race}:${menu.diff}`);
  $('record').textContent = w + l ? `${w} won · ${l} lost` : '';
  $('record').title = w + l ? `Your record as the ${menu.race === 'vael' ? 'Vael' : 'Humans'} at this difficulty` : '';
}
/** The top bar's sound button changed the setting: keep the menu and the saved choice in step. */
export function soundChanged() { store.set('muted', audio.muted ? '1' : '0'); soundLabel(); }
