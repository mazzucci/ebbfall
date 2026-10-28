// The start menu, a page of its own: first the two modes (single player, multiplayer: online.js's lobby, where a relay
// is known), How to play, About (a page: who made it, the source, the version, CHECK OFFLINE), INSTALL where the
// browser offers it (both: offline.js) and the record (and FIRST GAME, until a first game is over on this device);
// the single-player page holds the game against the AI (the seat list: you and one to seven AIs, each seat's race and
// team and each AI's difficulty, seats.js; the maps that seat them; the guided first game; START GAME goes full
// screen). In the top-right corner of every page (and the lobby's): the sound, one setting with the game's top bar; while full screen, a button that leaves it. The menu always opens on its first page (a join link opens the lobby instead).
// The maps (maps.js): fixed ones with made-up names and hidden characters (the default is the standard map, the
// others are surprises to discover in play), and a random map generated each time; the end screen tells the story.
// The seats (races, teams, difficulties) and sound are remembered on this device.
import { mapPreview, DIFF, ready } from '../engine/index.js';
import { $ } from './ui.js';
import { audio, sfx, soundToggled } from './audio.js';
import { enterFullscreen, exitFullscreen, isFull, canGoFullscreen } from './screen.js';
import { icon } from './icons.js';
import { initOffline } from './offline.js';
import { MAPS, MAP_KINDS, MAX_PLAYERS, mapName, mapsFor, fitMap, badge, teamsFor, teamList } from './maps.js';
import { RACES, arrange, startSetup, legacyRows, oneTeam, freeTeam, compact, validRows, seatColor, seatName, newAi, canRemove, sidesOf, enemyLevel, raceTitle, tokenEl, sideBox, newSide, seatSheet, sheetDialog } from './seats.js';

const store = { get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } } };

/** `rows`: the seat list, you first, then the AIs ({ race ('random' too), team number, an AI's `diff` }); `players`:
 *  how many (2 to 8). Drawn at START GAME, in seat order (seats.js `arrange`: your team first, you first): `races`
 *  (a RANDOM one drawn), `ai`, `teams` (an id per seat, empty: free for all), `diffs` (each AI's; empty: all at `diff`)
 *  and `diff`, the hardest AI's (the record's); `race`, `enemyRace`: seat 0's and seat 1's (a duel's two). */
export const menu = { tutorial: false, diff: 0, seed: MAPS[0].seed, kind: 0, map: 0, name: MAPS[0].name, size: MAPS[0].size, side: 0, race: 'humans', enemyRace: 'humans', rows: [], players: 2, races: ['humans', 'humans'], ai: [false, true], teams: [], diffs: [] };
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
}

// The sides board: a panel per side (YOUR SIDE first, in gold; then ENEMIES, or SIDE 2, SIDE 3... when there are
// several), its seats as tokens (seats.js) with + ALLY / + AI among them (up to three sides; with more, + SIDE adds
// and the sheet moves) and a dashed + SIDE strip after the sides while there is room (eight players). A token opens its seat's sheet: race, an AI's difficulty and side, REMOVE (not
// the last enemy). Each token's band is the colour the seat will have (the game seats the rows by side: `arrange`).
// Everyone on one side: START GAME waits, and says why.
const defaultRows = () => { // (the menu before the board saved these; new players start on Easy)
  const players = +store.get('players'), num = (k) => (store.get(k) === null ? null : +store.get(k));
  return legacyRows({ race: store.get('race'), enemy: store.get('enemy'), diff: num('diff'), players, teams: teamList(players, store.get('teams')) }, MAX_PLAYERS);
};
/** Where room is short (a phone): the race's short name on a token. */
const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 900px), (max-height: 500px)') : { matches: false, addEventListener() {} };
let editing = -1, sheet = null; // (the seat whose sheet is open; the dialog it opens in)
function setRows(rows) {
  const resized = rows.length !== menu.rows.length;
  menu.rows = rows; menu.players = rows.length; store.set('seats', JSON.stringify(rows));
  if (resized) { choose(fitMap(menu.map, menu.players)); renderMaps(); }
  renderSeats(); showRecord(); sfx('select');
}
/** A row as the board shows it (seats.js `tokenEl`'s view). */
const viewOf = (rows, i, side) => ({ name: seatName(rows, i), race: rows[i].race, diff: i ? rows[i].diff : null, side, me: !i });
function renderSeats() {
  const rows = menu.rows, { order } = arrange(rows), box = $('soloBoard'), sides = sidesOf(rows), short = narrow.matches, room = rows.length < MAX_PLAYERS;
  const focus = document.activeElement?.closest?.('#soloBoard') ? document.activeElement.dataset.k : null; // (kept on a redraw)
  const add = (team) => { // (the focus stays on the button; with the eighth seat it goes, and the new token has it)
    const had = box.contains(document.activeElement); setRows([...rows, newAi(rows, team)]);
    if (had && !box.contains(document.activeElement)) box.querySelector(`[data-k="tok${rows.length}"]`)?.focus();
  };
  box.replaceChildren(...sides.map(({ team, name, label }, k) => sideBox(name,
    rows.map((r, i) => i).filter(i => rows[i].team === team).map(i => tokenEl(viewOf(rows, i, label), seatColor(order.indexOf(i)), { short, on: i === editing, onOpen: () => openSheet(i), k: `tok${i}` })),
    { me: !k, label, adds: room && sides.length < 4 ? [{ label: k ? '+ AI' : '+ ALLY', title: k ? 'Another AI on this side' : 'An AI on your side', k: `add${k}`, on: () => add(team) }] : [] })),
  ...(room ? [newSide(() => add(freeTeam(rows)))] : []));
  box.classList.toggle('many', sides.length > 3); // (four sides or more wrap)
  if (focus) box.querySelector(`[data-k="${focus}"]`)?.focus();
  const one = oneTeam(rows);
  $('btnStart').disabled = one; $('soloNote').textContent = one ? 'Everyone is on one side' : '';
  renderSheet();
}
function openSheet(i) { editing = i; renderSeats(); sfx('select'); $('soloSheet').querySelector('.chips .on')?.focus(); }
function closeSheet(focusOn = editing) {
  if (editing < 0) return;
  editing = -1; renderSeats();
  ($('soloBoard').querySelector(`[data-k="tok${focusOn}"]`) || $('soloBoard').querySelector(`[data-k="tok${focusOn - 1}"]`) || $('btnStart')).focus();
}
/** The open seat's sheet (none: closed), redrawn after each change with the focus where it was. */
function renderSheet() {
  sheet ||= sheetDialog($('soloSheet'));
  const i = editing, rows = menu.rows;
  if (i < 0 || i >= rows.length) { sheet.close(); return; }
  const host = $('soloSheet'), focus = host.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const set = (k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))), r = rows[i], { order } = arrange(rows), sides = sidesOf(rows);
  const move = (team) => setRows(compact(rows.map((q, j) => (j === i ? { ...q, team } : q))));
  const alone = rows.filter(q => q.team === r.team).length === 1;
  sheet.show(seatSheet(viewOf(rows, i, ''), seatColor(order.indexOf(i)), {
    sub: i ? 'computer player' : 'your seat', team: r.team, sides, onDone: () => closeSheet(),
    onRace: (v) => set('race', v), ...(i ? { onDiff: (v) => set('diff', v), onSide: move, newSide: alone ? null : () => move(freeTeam(rows)) } : {}),
    buttons: canRemove(rows, i) ? [{ label: 'REMOVE', title: `Remove ${seatName(rows, i)}`, k: 'remove', ghost: true, on: () => { editing = -1; setRows(compact(rows.filter((_, j) => j !== i))); ($('soloBoard').querySelector(`[data-k="tok${i - 1}"]`) || $('btnStart')).focus(); } }] : [],
  }), () => closeSheet());
  if (focus) (host.querySelector(`[data-k="${focus}"]`) || host.querySelector(`[data-k^="${focus.split(':')[0]}:"].on`) || host.querySelector('[data-k="done"]')).focus();
}
narrow.addEventListener?.('change', () => { if (menu.rows.length) renderSeats(); });

/** What each choice of teams means, on its button, in the lobby (by seat). */
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
  if (store.get('muted') === '1') audio.muted = true;
  // The seats (remembered on this device; a setup that is not a good one: you and an AI), and the maps that seat them.
  let saved = null; try { saved = JSON.parse(store.get('seats')); } catch { /* none, or not ours */ }
  menu.rows = validRows(saved, MAX_PLAYERS) || defaultRows(); menu.players = menu.rows.length;
  choose(urlSeed !== null ? mapsFor(menu.players).find(i => MAPS[i].random) : mapsFor(menu.players)[0]); renderMaps(); renderSeats(); showRecord();
  for (const b of document.querySelectorAll('.msound')) b.addEventListener('click', () => { audio.muted = !audio.muted; store.set('muted', audio.muted ? '1' : '0'); soundLabel(); syncSound(); soundToggled(); if (!audio.muted) sfx('select'); });
  soundLabel(); syncSound();
  for (const b of [$('btnFirst'), $('btnFirstHome')]) b.addEventListener('click', () => { sfx('select'); enterFullscreen(); menu.tutorial = true; onStart(); });
  $('btnStart').addEventListener('click', () => { // each game draws our starting base (a random map, RANDOM races: one per seat)
    if (oneTeam(menu.rows)) return;
    sfx('select'); enterFullscreen(); menu.tutorial = false; choose(menu.map);
    Object.assign(menu, startSetup(menu.rows, draw)); // (the record counts a game at its hardest AI's level: `diff`)
    menu.race = menu.races[0]; menu.enemyRace = menu.races[1]; onStart();
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
  if (!menu.tutorial) return { ...menu };
  const m = MAPS[0];
  return { ...menu, diff: 0, seed: m.seed, kind: m.kind, name: m.name, size: m.size, side: 0, race: 'humans', enemyRace: 'humans', players: 2, races: ['humans', 'humans'], ai: [false, true], teams: [], diffs: [] };
}

/** Show one page of the menu: `menuHome` (the first), `menuSolo` or `menuAbout`. */
function page(id) { for (const p of document.querySelectorAll('#start .page')) p.hidden = p.id !== id; }
/** Back to the menu (after a game, quitting, or the lobby's BACK): its first page, with the last choices. */
/** Back to the menu: its first page, or `at` (after a game against the AI: the single player page, one tap from the next). */
export function showMenu(at = 'menuHome') { renderMaps(); renderSeats(); showRecord(); page(at); $('start').hidden = false; }

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
/** The record for your seat's race (Random: both) at the hardest AI's difficulty, on the first page (nothing before a
 *  first game); FIRST GAME there too for a newcomer: nobody has finished a game on this device yet (none on the record,
 *  no guided one). */
function showRecord() {
  const r = records(), you = menu.rows[0]?.race || 'humans', diff = menu.rows.length ? enemyLevel(menu.rows) : 0; // (the level a game is counted at)
  $('btnFirstHome').hidden = store.get('guided') === '1' || Object.keys(r).some(k => tally(r, k).some(n => n > 0));
  const [w, l] = (you === 'random' ? RACES : [you]).map(k => tally(r, `${k}:${diff}`)).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
  const level = DIFF[diff]?.name || '';
  $('record').textContent = w + l ? `${level}: ${w} won · ${l} lost` : '';
  $('record').title = w + l ? `Your record ${you === 'random' ? 'with either race' : `as the ${raceTitle(you)}`} on ${level}` : '';
}
/** The top bar's sound button changed the setting: keep the menu and the saved choice in step. */
export function soundChanged() { store.set('muted', audio.muted ? '1' : '0'); soundLabel(); }
