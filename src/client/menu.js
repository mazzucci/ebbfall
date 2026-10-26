// The start menu, a page of its own: first the two modes (single player, multiplayer: online.js's lobby, where a relay
// is known), How to play, About (a page: who made it, the source, the version) and the record (and FIRST GAME, until a
// first game is over on this device); the single-player page holds the game against the AI (opponent, your race and
// the enemy's, one of three maps, the guided first game; START GAME goes full screen). In the top-right corner of
// every page (and the lobby's): the sound, one setting with the game's top bar; while full screen, a button that
// leaves it. The menu always opens on its first page (a join link opens the lobby instead).
// Three fixed maps with made-up names and hidden characters (MapKind in the sim; the default is the standard map, the
// others are surprises to discover in play), and a random map generated each time; the end screen tells the story.
// Difficulty and sound are remembered on this device.
import { mulberry, mapPreview, DUEL_MW as MW, DUEL_MH as MH, DIFF } from '../engine/index.js';
import { $ } from './hud.js';
import { audio, sfx, soundToggled } from './audio.js';
import { enterFullscreen, exitFullscreen } from './screen.js';
import { icon } from './icons.js';

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
/** `you`, `enemy`: the races chosen ('random' too); `race`, `enemyRace`: this game's, drawn at START GAME. */
export const menu = { tutorial: false, diff: 0, seed: MAPS[0].seed, kind: 0, map: 0, name: MAPS[0].name, side: 0, you: 'humans', race: 'humans', enemy: 'humans', enemyRace: 'humans' };
const RACES = ['humans', 'vael'];
/** A race for this game: the one chosen, or either at random. */
const draw = (k) => (k === 'random' ? RACES[Math.random() < 0.5 ? 0 : 1] : k);
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

/** Reflect audio.muted on the menu's and the lobby's sound icons and the top bar. */
let syncSound = () => {};
function soundLabel() {
  const on = !audio.muted;
  for (const b of document.querySelectorAll('.msound')) { b.innerHTML = icon(on ? 'sound' : 'mute'); b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Sound (on)' : 'Sound (off)'; }
}

export function initMenu({ onStart, onSound }) {
  syncSound = onSound;
  const saved = +store.get('diff');
  menu.diff = store.get('diff') !== null && Number.isInteger(saved) && saved >= 0 && saved < DIFF.length ? saved : 0; // new players start on Easy
  if (store.get('muted') === '1') audio.muted = true;
  const diffs = document.querySelectorAll('#diff .ib');
  const showDiff = () => diffs.forEach(x => { const on = +x.dataset.d === menu.diff; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  diffs.forEach(b => b.addEventListener('click', () => { menu.diff = +b.dataset.d; store.set('diff', menu.diff); showDiff(); showRecord(); }));
  showDiff();
  // The player's race (remembered on this device; Random draws one each game).
  menu.you = [...RACES, 'random'].includes(store.get('race')) ? store.get('race') : 'humans';
  const races = document.querySelectorAll('#race .ib');
  const showRace = () => races.forEach(x => { const on = x.dataset.race === menu.you; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  races.forEach(b => b.addEventListener('click', () => { menu.you = b.dataset.race; store.set('race', menu.you); showRace(); showRecord(); sfx('select'); }));
  showRace(); showRecord();
  // The opponent's race (Random draws one each game).
  menu.enemy = [...RACES, 'random'].includes(store.get('enemy')) ? store.get('enemy') : 'humans';
  const foes = document.querySelectorAll('#enemy .ib');
  const showEnemy = () => foes.forEach(x => { const on = x.dataset.race === menu.enemy; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  foes.forEach(b => b.addEventListener('click', () => { menu.enemy = b.dataset.race; store.set('enemy', menu.enemy); showEnemy(); sfx('select'); }));
  showEnemy();
  choose(urlSeed !== null ? MAPS.length - 1 : 0); renderMaps();
  for (const b of document.querySelectorAll('.msound')) b.addEventListener('click', () => { audio.muted = !audio.muted; store.set('muted', audio.muted ? '1' : '0'); soundLabel(); syncSound(); soundToggled(); if (!audio.muted) sfx('select'); });
  soundLabel(); syncSound();
  for (const b of [$('btnFirst'), $('btnFirstHome')]) b.addEventListener('click', () => { sfx('select'); enterFullscreen(); menu.tutorial = true; onStart(); });
  $('btnStart').addEventListener('click', () => { sfx('select'); enterFullscreen(); menu.tutorial = false; choose(menu.map); menu.race = draw(menu.you); menu.enemyRace = draw(menu.enemy); onStart(); }); // each game draws our starting base (a random map, random races)
  // The pages: single player opens its own, BACK returns to the first (multiplayer: online.js).
  $('btnSolo').addEventListener('click', () => { sfx('select'); page('menuSolo'); });
  $('btnSoloBack').addEventListener('click', () => { sfx('select'); page('menuHome'); });
  $('btnAbout').addEventListener('click', () => { sfx('select'); page('menuAbout'); });
  $('btnAboutBack').addEventListener('click', () => { sfx('select'); page('menuHome'); });
  $('buildId').textContent = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : 'dev'; // (vite.config.js: the one online play compares)
  $('btnHowTo').addEventListener('click', () => { $('help').hidden = false; $('btnHelpClose').focus(); });
  // Full screen (a phone's PLAY enters it): a corner button leaves it, there only while it is on. (A page cannot
  // close its own tab; leaving full screen gives the browser's own controls back.)
  const unfull = () => { $('btnUnfull').hidden = !document.fullscreenElement && !document.webkitFullscreenElement; };
  $('btnUnfull').addEventListener('click', () => { sfx('select'); exitFullscreen(); });
  document.addEventListener('fullscreenchange', unfull); document.addEventListener('webkitfullscreenchange', unfull); unfull();
  $('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
}

/** The game to start: the menu's choices, or the guided first game's own (Easy, the first map, Humans against Humans). */
export function setup() {
  if (!menu.tutorial) return menu;
  const m = MAPS[0];
  return { ...menu, diff: 0, seed: m.seed, kind: m.kind, name: m.name, side: 0, race: 'humans', enemyRace: 'humans' };
}

/** Show one page of the menu: `menuHome` (the first), `menuSolo` or `menuAbout`. */
function page(id) { for (const p of document.querySelectorAll('#start .page')) p.hidden = p.id !== id; }
/** Back to the menu (after a game, quitting, or the lobby's BACK): its first page, with the last choices. */
export function showMenu() { renderMaps(); showRecord(); page('menuHome'); $('start').hidden = false; }

// The player's record on this device, per race and difficulty: [won, lost] (the race played: a Random one's draw).
const records = () => { try { const r = JSON.parse(store.get('record')); return r && typeof r === 'object' ? r : {}; } catch { return {}; } };
const tally = (r, k) => Array.isArray(r[k]) && r[k].length === 2 ? r[k].map(n => +n || 0) : [0, 0]; // (whatever else is stored)
/** Count a finished game for the race and difficulty it was played at. */
export function recordResult(win, race, diff) {
  const r = records(), k = `${race}:${diff}`, [w, l] = tally(r, k);
  r[k] = win ? [w + 1, l] : [w, l + 1]; store.set('record', JSON.stringify(r));
}
/** The guided first game was played to its end (FIRST GAME then leaves the first page). */
export function guidedDone() { store.set('guided', '1'); }
/** The record for the chosen race (Random: both) and difficulty, on the first page (nothing before a first game); FIRST
 *  GAME there too for a newcomer: nobody has finished a game on this device yet (none on the record, no guided one). */
function showRecord() {
  const r = records();
  $('btnFirstHome').hidden = store.get('guided') === '1' || Object.keys(r).some(k => tally(r, k).some(n => n > 0));
  const [w, l] = (menu.you === 'random' ? RACES : [menu.you]).map(k => tally(r, `${k}:${menu.diff}`)).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
  const level = DIFF[menu.diff]?.name || '';
  $('record').textContent = w + l ? `${level}: ${w} won · ${l} lost` : '';
  $('record').title = w + l ? `Your record ${menu.you === 'random' ? 'with either race' : `as the ${menu.you === 'vael' ? 'Vael' : 'Humans'}`} on ${level}` : '';
}
/** The top bar's sound button changed the setting: keep the menu and the saved choice in step. */
export function soundChanged() { store.set('muted', audio.muted ? '1' : '0'); soundLabel(); }
