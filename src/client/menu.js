// The start menu: opponent, one of three maps, sound; the phone's "tap to play" splash (that first tap enters full
// screen, so the browser's full-screen notice shows over the menu, not the battle); and the How to play card.
// Three fixed maps with made-up names and hidden characters (MapKind in the sim; the default is the standard map, the
// others are surprises to discover in play), and a random map generated each time; the end screen tells the story.
// Difficulty and sound are remembered on this device.
import { mulberry } from '../engine/index.js';
import { $ } from './hud.js';
import { audio, sfx, soundToggled } from './audio.js';
import { touchDevice, enterFullscreen, canGoFullscreen } from './screen.js';

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
export const menu = { diff: 0, seed: MAPS[0].seed, kind: 0, map: 0, name: MAPS[0].name, side: 0, race: 'humans' };
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
}

/** Reflect audio.muted on the menu and the top bar. */
let syncSound = () => {};
function soundLabel() { const on = !audio.muted; $('btnMenuSound').textContent = on ? 'ON' : 'OFF'; $('btnMenuSound').setAttribute('aria-pressed', String(on)); $('btnMenuSound').classList.toggle('on', on); }

export function initMenu({ onStart, onSound }) {
  syncSound = onSound;
  const saved = +store.get('diff');
  menu.diff = store.get('diff') !== null && [0, 1, 2].includes(saved) ? saved : 0; // new players start on Easy
  if (store.get('muted') === '1') audio.muted = true;
  const diffs = document.querySelectorAll('#diff .ib');
  const showDiff = () => diffs.forEach(x => { const on = +x.dataset.d === menu.diff; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  diffs.forEach(b => b.addEventListener('click', () => { menu.diff = +b.dataset.d; store.set('diff', menu.diff); showDiff(); }));
  showDiff();
  // The player's race (remembered on this device).
  menu.race = ['humans', 'vael'].includes(store.get('race')) ? store.get('race') : 'humans';
  const races = document.querySelectorAll('#race .ib');
  const showRace = () => races.forEach(x => { const on = x.dataset.race === menu.race; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  races.forEach(b => b.addEventListener('click', () => { menu.race = b.dataset.race; store.set('race', menu.race); showRace(); sfx('select'); }));
  showRace();
  choose(urlSeed !== null ? MAPS.length - 1 : 0); renderMaps();
  $('btnMenuSound').addEventListener('click', () => { audio.muted = !audio.muted; store.set('muted', audio.muted ? '1' : '0'); soundLabel(); syncSound(); soundToggled(); if (!audio.muted) sfx('select'); });
  soundLabel(); syncSound();
  $('btnStart').addEventListener('click', () => { sfx('select'); if (touchDevice) enterFullscreen(); choose(menu.map); onStart(); }); // each game draws our starting base (and a random map is new)
  $('btnHowTo').addEventListener('click', () => { $('help').hidden = false; $('btnHelpClose').focus(); });
  $('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
  // Phones: a first screen whose tap goes full screen, then the menu. (On iPhone Safari a page cannot go full
  // screen; the menu shows the Add to Home Screen tip instead.)
  if (touchDevice && canGoFullscreen) {
    $('splash').hidden = false;
    $('btnPlay').addEventListener('click', () => { enterFullscreen(); $('splash').hidden = true; });
  }
}

/** Back to the menu (after a game, or quitting), with the last choices. */
export function showMenu() { renderMaps(); $('start').hidden = false; }
/** The top bar's sound button changed the setting: keep the menu and the saved choice in step. */
export function soundChanged() { store.set('muted', audio.muted ? '1' : '0'); soundLabel(); }
