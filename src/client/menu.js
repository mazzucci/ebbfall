// The start menu, a page of its own: first the two modes (single player, multiplayer: online.js's lobby, where a relay
// is known), How to play, About (a page: who made it, the source, the version, CHECK OFFLINE), INSTALL where the
// browser offers it (both: offline.js) and the record (and FIRST GAME, until a first game is over on this device);
// the single-player page holds the game against the AI (opponent, your race and the enemies', the players: you and one
// to seven AIs, free for all or, for four, six and eight, even teams of you and AIs against AIs; the maps that seat them;
// the guided first game; START GAME goes full screen). In the top-right corner of every page (and the lobby's): the
// sound, one setting with the game's top bar; while full screen, a button that leaves it. The menu always opens on its first page (a join link opens the lobby instead).
// The maps (maps.js): fixed ones with made-up names and hidden characters (the default is the standard map, the
// others are surprises to discover in play), and a random map generated each time; the end screen tells the story.
// Difficulty, races, players, teams and sound are remembered on this device.
import { mapPreview, DIFF, ready } from '../engine/index.js';
import { $ } from './ui.js';
import { audio, sfx, soundToggled } from './audio.js';
import { enterFullscreen, exitFullscreen, isFull, canGoFullscreen } from './screen.js';
import { icon } from './icons.js';
import { initOffline } from './offline.js';
import { MAPS, MAP_KINDS, MAX_PLAYERS, mapName, mapsFor, fitMap, badge, teamsFor } from './maps.js';

const store = { get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } } };

/** `you`, `enemy`: the races chosen ('random' too); `race`, `enemyRace`: this game's, drawn at START GAME (`enemyRaces`:
 *  every AI's, each drawn for itself); `players`: 2 to 8, you and the AIs; `teams`: 'ffa', or a split the players are
 *  offered (maps.js `teamsFor`: '2v2' for four, seats 0 and 1, you and an AI, against 2 and 3, neighbours on the map;
 *  '3v3' for six; '4v4' and '2v2v2v2' for eight); a split another number of players has plays free for all. */
export const menu = { tutorial: false, diff: 0, seed: MAPS[0].seed, kind: 0, map: 0, name: MAPS[0].name, size: MAPS[0].size, side: 0, you: 'humans', race: 'humans', enemy: 'humans', enemyRace: 'humans', enemyRaces: ['humans'], players: 2, teams: 'ffa' };
const RACES = ['humans', 'vael'];
/** The teams chosen, if the players are offered them; else free for all. */
const teamsOf = (players, teams) => (teamsFor(players).includes(teams) ? teams : 'ffa');
/** A race for this game: the one chosen, or either at random. */
const draw = (k) => (k === 'random' ? RACES[Math.random() < 0.5 ? 0 : 1] : k);
/** ?seed=N in the URL plays a random-slot map of that seed, standard character (tests use it). */
const urlSeed = new URLSearchParams(location.search).get('seed');

/** Pick map `i`; the random one draws a new seed and a hidden character each time it is chosen or played. */
function choose(i) {
  const m = MAPS[i];
  menu.map = i; menu.size = m.size;
  // Where the seats sit round the map's starts, drawn each game (?seed= keeps it fixed): two seats, which of the two
  // bases is ours (as always); more, any turn of the ring (the sim takes it modulo).
  menu.side = urlSeed !== null ? 0 : menu.players === 2 ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() * 2 ** 32) >>> 0;
  if (!m.random) Object.assign(menu, { seed: m.seed, kind: m.kind, name: m.name });
  else if (urlSeed !== null) Object.assign(menu, { seed: (+urlSeed) >>> 0, kind: 0, name: mapName((+urlSeed) >>> 0) });
  else { const seed = (Math.random() * 1e9) >>> 0; Object.assign(menu, { seed, kind: Math.floor(Math.random() * MAP_KINDS.length), name: mapName(seed) }); }
}

/** The map buttons for `players` into `box`: those that seat them, the chosen one (`on`) lit, each with its badge (when
 *  there is one: maps.js `badge`); `pick(i)` when one is tapped (none: shown, not chosen: the lobby's guests). */
export function mapButtons(box, players, on, pick) {
  box.innerHTML = '';
  for (const i of mapsFor(players)) {
    const m = MAPS[i], b = document.createElement('button'), lit = i === on, up = badge(i, players);
    b.className = 'ib map' + (lit ? ' on' : '') + (m.random ? ' random' : ''); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(lit));
    b.textContent = m.name.toUpperCase(); b.dataset.map = i;
    if (up) { const t = document.createElement('small'); t.className = 'up'; t.textContent = up; b.appendChild(t); }
    if (m.random) b.title = 'A new map every time';
    if (pick) b.addEventListener('click', () => { pick(i); sfx('select'); }); else b.disabled = true;
    box.appendChild(b);
  }
}
function renderMaps() {
  mapButtons($('maps'), menu.players, menu.map, (i) => { choose(i); renderMaps(); });
  drawPreview($('mapPreview'), menu.map, menu.seed, menu.kind);
  // The players and, for four, six and eight, the teams.
  for (const b of document.querySelectorAll('#players .ib')) { const on = +b.dataset.n === menu.players; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
  teamButtons($('teams'), menu.players, teamsOf(menu.players, menu.teams), (k) => { menu.teams = k; store.set('teams', k); renderMaps(); }, SOLO_TEAMS);
}

/** What each choice of teams means, on its button: in single player (you are seat 0), and in the lobby (by seat). */
const SOLO_TEAMS = { ffa: 'Each for itself', '2v2': 'You and an AI against two: allies start side by side', '3v3': 'You and two AIs against three', '4v4': 'You and three AIs against four', '2v2v2v2': 'Four pairs: you and an AI against three pairs of AIs' };
export const ROOM_TEAMS = { ffa: 'Each for itself', '2v2': 'The first two seats against the last two: allies start side by side', '3v3': 'The first three seats against the last three', '4v4': 'The first four seats against the last four', '2v2v2v2': 'Four pairs, in seat order' };
const picks = new WeakMap(); // (each box's current pick: the buttons outlive a render)
/** The teams `players` may choose from into `box` (hidden when free for all is all there is), `on` lit; `pick(k)` when
 *  one is tapped (none: shown, not chosen: the lobby's guests). */
export function teamButtons(box, players, on, pick, titles) {
  const keys = teamsFor(players);
  box.hidden = keys.length < 2; picks.set(box, pick);
  if (box.dataset.keys !== keys.join()) {
    box.dataset.keys = keys.join(); box.innerHTML = '';
    for (const k of keys) {
      const b = document.createElement('button');
      b.className = 'ib'; b.dataset.teams = k; b.setAttribute('role', 'radio'); b.textContent = k === 'ffa' ? 'FREE FOR ALL' : k; b.title = titles[k];
      b.addEventListener('click', () => { const p = picks.get(box); if (p) { p(k); sfx('select'); } });
      box.appendChild(b);
    }
  }
  for (const b of box.querySelectorAll('.ib')) { const lit = b.dataset.teams === on; b.classList.toggle('on', lit); b.setAttribute('aria-checked', String(lit)); b.disabled = !pick && !lit; }
}

// A map's thumbnail at its size: rock, fields, vents and every start (a Random map: a question mark). The canvas is
// drawn a pixel per tile (64 or 96 across) and shown at one size. The sim draws the map: until its WASM is in (the menu
// comes first, src/boot.js), a plain ground, the map drawn when it is.
const PREVIEW = ['#2a3442', '#7d8796', '#4fd1c5', '#a78bfa', '#f5a524'];
let simReady = false;
ready.then(() => { simReady = true; if (!$('start').hidden) renderMaps(); }, () => {});
export function drawPreview(cv, i, seed, kind) {
  const g = cv.getContext('2d'), m = MAPS[i], n = m.size;
  cv.width = n; cv.height = n;
  if (!simReady && !m.random) { g.fillStyle = PREVIEW[0]; g.fillRect(0, 0, n, n); return; }
  if (m.random) {
    g.fillStyle = PREVIEW[0]; g.fillRect(0, 0, n, n);
    g.fillStyle = '#8294aa'; g.font = `bold ${n * 0.6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', n / 2, n / 2 + 2);
    cv.title = 'A new map every time'; return;
  }
  const tiles = mapPreview(seed, kind, n), img = g.createImageData(n, n);
  const rgb = PREVIEW.map(h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)));
  for (let t = 0; t < tiles.length; t++) img.data.set([...rgb[tiles[t]], 255], t * 4);
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
  // The players (you and the AIs) and, for four, six and eight, the teams: the maps follow (those that seat them).
  const n = +store.get('players');
  menu.players = Number.isInteger(n) && n >= 2 && n <= MAX_PLAYERS ? n : 2;
  menu.teams = store.get('teams') || 'ffa'; // (a split for other players than these plays free for all: teamsOf)
  for (const b of document.querySelectorAll('#players .ib')) b.addEventListener('click', () => { menu.players = +b.dataset.n; store.set('players', menu.players); choose(fitMap(menu.map, menu.players)); renderMaps(); sfx('select'); });
  choose(urlSeed !== null ? mapsFor(menu.players).find(i => MAPS[i].random) : mapsFor(menu.players)[0]); renderMaps();
  for (const b of document.querySelectorAll('.msound')) b.addEventListener('click', () => { audio.muted = !audio.muted; store.set('muted', audio.muted ? '1' : '0'); soundLabel(); syncSound(); soundToggled(); if (!audio.muted) sfx('select'); });
  soundLabel(); syncSound();
  for (const b of [$('btnFirst'), $('btnFirstHome')]) b.addEventListener('click', () => { sfx('select'); enterFullscreen(); menu.tutorial = true; onStart(); });
  $('btnStart').addEventListener('click', () => { // each game draws our starting base (a random map, random races: one per AI)
    sfx('select'); enterFullscreen(); menu.tutorial = false; choose(menu.map); menu.race = draw(menu.you);
    menu.enemyRaces = Array.from({ length: menu.players - 1 }, () => draw(menu.enemy)); menu.enemyRace = menu.enemyRaces[0]; onStart();
  });
  // The pages: single player opens its own, BACK returns to the first (multiplayer: online.js).
  $('btnSolo').addEventListener('click', () => { sfx('select'); page('menuSolo'); });
  $('btnSoloBack').addEventListener('click', () => { sfx('select'); page('menuHome'); });
  $('btnAbout').addEventListener('click', () => { sfx('select'); page('menuAbout'); });
  $('btnAboutBack').addEventListener('click', () => { sfx('select'); page('menuHome'); });
  const build = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : 'dev';
  $('buildId').textContent = build; // (vite.config.js: the one online play compares)
  initOffline(build); // INSTALL (where the browser offers it), About's CHECK OFFLINE
  $('btnHowTo').addEventListener('click', () => { $('help').hidden = false; $('btnHelpClose').focus(); });
  // Full screen (START GAME, FIRST GAME and the lobby's READY enter it): a corner button beside the sound's goes in and
  // out, where a page can (not iPhone Safari, not a home-screen app, already full screen). (A page cannot close its own
  // tab; leaving full screen gives the browser's own controls back.)
  const fs = $('btnUnfull');
  const syncFs = () => {
    const on = isFull(); fs.hidden = !canGoFullscreen && !on;
    fs.innerHTML = icon(on ? 'unfull' : 'full'); fs.title = on ? 'Leave full screen' : 'Full screen';
    fs.setAttribute('aria-label', fs.title); fs.setAttribute('aria-pressed', String(on));
  };
  fs.addEventListener('click', () => { sfx('select'); (isFull() ? exitFullscreen : enterFullscreen)(); });
  document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs); syncFs();
  $('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
}

/** The game to start: the menu's choices, or the guided first game's own (Easy, the first map, Humans against Humans). */
export function setup() {
  if (!menu.tutorial) return { ...menu, teams: teamsOf(menu.players, menu.teams) };
  const m = MAPS[0];
  return { ...menu, diff: 0, seed: m.seed, kind: m.kind, name: m.name, size: m.size, side: 0, race: 'humans', enemyRace: 'humans', enemyRaces: ['humans'], players: 2, teams: 'ffa' };
}

/** Show one page of the menu: `menuHome` (the first), `menuSolo` or `menuAbout`. */
function page(id) { for (const p of document.querySelectorAll('#start .page')) p.hidden = p.id !== id; }
/** Back to the menu (after a game, quitting, or the lobby's BACK): its first page, with the last choices. */
/** Back to the menu: its first page, or `at` (after a game against the AI: the single player page, one tap from the next). */
export function showMenu(at = 'menuHome') { renderMaps(); showRecord(); page(at); $('start').hidden = false; }

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
