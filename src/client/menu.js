// The start menu, a page of its own: first the two modes (single player, multiplayer: online.js's lobby, where a relay
// is known), How to play, About (a page: who made it, the source, the version, PLAY OFFLINE), INSTALL (PLAY OFFLINE
// once installed; both: offline.js) and the record (and FIRST GAME, until a first game is over on this device);
// the single-player page holds the game against the AI (the board: eight fixed spots, you and one to seven AIs, each
// seat's race and side and each AI's level, seats.js; the map, any that seats them, from a list; the guided first game;
// START GAME goes full screen on a touch screen). The sound and full screen are the screen's corner (corner.js).
// The menu always opens on its first page (a join link opens the lobby instead; a challenge link, the single-player
// page).
// The maps (maps.js): fixed ones with made-up names and hidden characters (the default is the standard map, the
// others are surprises to discover in play), and a random map generated each time; the end screen tells the story.
// The board (races, sides, levels) and the map are remembered on this device. A challenge link (`?vs=`, SHARE after a
// victory: challenge.js) opens the single-player page on its setup, its seed and starts too, with a line that says so;
// it is not remembered: the player's own saved setup is back on the next visit, and the first change to the board or
// the map makes the setup theirs (saved, as every change is) and the challenge an ordinary game.
import { mapPreview, ready } from '../engine/index.js';
import { $ } from './ui.js';
import { sfx } from './audio.js';
import { enterFullscreen } from './screen.js';
import { store } from './store.js';
import { initOffline } from './offline.js';
import { initOptions } from './options.js';
import { MAPS, RANDOM_KINDS, MAX_PLAYERS, mapName, mapNoteOf, fits, fitMap, mapLabel, seatsOf, teamList } from './maps.js';
import { PARAM, decode, encode, fromSetup, mapOf, line } from './challenge.js';
import { RACES, startSetup, legacyRows, oneTeam, validRows, seatColor, seatName, newAi, canRemove, sideChoices, sideColor, filled, firstEmpty, tokenEl, emptySpot, seatSheet, sheetDialog, narrow } from './seats.js';


/** `board`: the eight spots, null when empty, you in spot 0, the AIs in others ({ race ('random' too), side number
 *  `team`, an AI's `diff` }); `players`: how many (2 to 8). Drawn at START GAME, in seat order (seats.js `arrange`: your
 *  side first, you first): `races` (a RANDOM one drawn), `ai`, `teams` (an id per seat, empty: free for all), `diffs`
 *  (each AI's; empty: all at `diff`), `diff`, the hardest AI's (the record's), and `spots`, each seat's spot (its
 *  colour); `race`, `enemyRace`: seat 0's and seat 1's (a duel's two). */
export const menu = { challenge: null, tutorial: false, diff: 0, seed: MAPS[0].seed, kind: 0, map: 0, name: MAPS[0].name, size: MAPS[0].size, side: 0, race: 'humans', enemyRace: 'humans', board: [], players: 2, races: ['humans', 'humans'], ai: [false, true], teams: [], diffs: [], spots: [] };
/** A race for this game: the one chosen, or either at random. */
const draw = (k) => (k === 'random' ? RACES[Math.random() < 0.5 ? 0 : 1] : k);
/** ?seed=N in the URL plays a random-slot map of that seed, standard character (tests use it). */
const urlSeed = new URLSearchParams(location.search).get('seed');

/** Pick map `i` (remembered); the random one draws a new seed and a hidden character each time it is chosen or played.
 *  (A challenge's map, seed and starts are its own: picking one makes the setup the player's.) */
function choose(i) {
  const m = MAPS[i];
  menu.challenge = null; menu.map = i; menu.size = m.size; store.set('map', String(i));
  // Where the seats sit round the map's starts, drawn each game (?seed= keeps it fixed): on a two-start map, which of
  // the two bases is ours (as always); more starts, any turn of the ring (the sim takes it modulo).
  menu.side = urlSeed !== null ? 0 : seatsOf(i) === 2 ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() * 2 ** 32) >>> 0;
  if (!m.random) Object.assign(menu, { seed: m.seed, kind: m.kind, name: m.name });
  else if (urlSeed !== null) Object.assign(menu, { seed: (+urlSeed) >>> 0, kind: m.kind ?? 0, name: mapName((+urlSeed) >>> 0) });
  else { const seed = (Math.random() * 1e9) >>> 0; Object.assign(menu, { seed, kind: m.kind ?? Math.floor(Math.random() * RANDOM_KINDS), name: mapName(seed) }); }
}

/** The map list into `sel` (a <select>): every map, its name and the players it seats ("Iron Compass · up to 8"), those
 *  with fewer starts than `players` there but not to be chosen; `on` chosen; `pick(i)` when another is. The options are
 *  made again only when the players change (a lobby arriving while the list is open leaves it open). */
export function mapSelect(sel, players, on, pick) {
  if (sel.dataset.players !== String(players) || sel.options.length !== MAPS.length) {
    sel.replaceChildren(...MAPS.map((m, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = mapLabel(i); o.disabled = !fits(i, players); return o; }));
    sel.dataset.players = String(players);
  }
  if (sel.value !== String(on)) sel.value = String(on);
  sel.onchange = () => { sfx('select'); pick(+sel.value); };
}
function renderMaps() {
  mapSelect($('mapSel'), menu.players, menu.map, (i) => {
    choose(i); renderMaps();
    // (a map with a line of its own, the Shore's: said in the footer a moment)
    mapNote = MAPS[i].line ? mapNoteOf(i) : ''; clearTimeout(noteTimer); renderNote();
    if (mapNote) noteTimer = setTimeout(() => { mapNote = ''; renderNote(); }, 6000);
  });
  drawPreview($('mapPreview'), menu.map, menu.seed, menu.kind);
}

// The board: eight fixed spots (seats.js), YOU in the first, an AI in any other, each with its colour (its own in the
// game), its race, level and side; the lowest empty spot a dashed + AI (a new AI on a side of its own), the rest faint.
// A token opens its seat's sheet: race, an AI's level and side, REMOVE (not the last enemy). Nothing on the board moves
// when a player comes, goes or changes side. Everyone on one side: START GAME waits, and says why. More players than
// the map has starts: the smallest map that seats them instead, said in the note a moment.
const defaultRows = () => { // (the menu before the board saved these; new players start on Easy)
  const players = +store.get('players'), num = (k) => (store.get(k) === null ? null : +store.get(k));
  return legacyRows({ race: store.get('race'), enemy: store.get('enemy'), diff: num('diff'), players, teams: teamList(players, store.get('teams')) }, MAX_PLAYERS);
};
let editing = -1, sheet = null, mapNote = '', noteTimer = 0; // (the seat whose sheet is open; the dialog it opens in; the map's note)
function setBoard(board) {
  if (menu.challenge) { menu.challenge = null; store.set('map', String(menu.map)); } // (the setup is the player's now: its map too)
  menu.board = board; menu.players = filled(board).length; store.set('seats', JSON.stringify(board));
  if (!fits(menu.map, menu.players)) {
    choose(fitMap(menu.map, menu.players)); renderMaps();
    mapNote = mapNoteOf(menu.map); clearTimeout(noteTimer); noteTimer = setTimeout(() => { mapNote = ''; renderNote(); }, 4000); // (Map: Dust Quarter (up to 4))
  } else renderMaps(); // (the list: which maps seat them)
  renderSeats(); showFirstGame(); sfx('select');
}
/** The footer's note: the map just changed, why START GAME waits, or the challenge it plays. */
function renderNote() { $('soloNote').textContent = mapNote || (oneTeam(menu.board) ? 'Everyone is on one side' : menu.challenge ? line(menu.challenge) : ''); }
/** A spot's player as the board shows it (seats.js `tokenEl`'s view). */
const viewOf = (board, i) => ({ name: seatName(i), race: board[i].race, diff: i ? board[i].diff : null, side: board[i].team, sideColor: sideColor(board, board[i].team), me: !i });
function renderSeats() {
  const board = menu.board, box = $('soloBoard'), short = narrow.matches, free = firstEmpty(board);
  const focus = document.activeElement?.closest?.('#soloBoard') ? document.activeElement.dataset.k : null; // (kept on a redraw)
  const add = () => { // (the focus goes to the new token)
    const had = box.contains(document.activeElement); setBoard(board.map((r, i) => (i === free ? newAi(board) : r)));
    if (had) box.querySelector(`[data-k="tok${free}"]`)?.focus();
  };
  box.replaceChildren(...board.map((r, i) => (r ? tokenEl(viewOf(board, i), seatColor(i), { short, on: i === editing, onOpen: () => openSheet(i), k: `tok${i}` })
    : emptySpot(i === free ? [{ label: '+ SEAT', title: 'A computer player on a side of its own', k: 'add', on: add }] : []))));
  if (focus) box.querySelector(`[data-k="${focus}"]`)?.focus();
  $('btnStart').disabled = oneTeam(board);
  renderNote(); renderSheet();
}
function openSheet(i) { editing = i; renderSeats(); sfx('select'); $('soloSheet').querySelector('.chips .on')?.focus(); }
function closeSheet(focusOn = editing) {
  if (editing < 0) return;
  editing = -1; renderSeats();
  ($('soloBoard').querySelector(`[data-k="tok${focusOn}"]`) || $('btnStart')).focus();
}
/** The open seat's sheet (none: closed), redrawn after each change with the focus where it was. */
function renderSheet() {
  sheet ||= sheetDialog($('soloSheet'));
  const i = editing, board = menu.board;
  if (i < 0 || !board[i]) { sheet.close(); return; }
  const host = $('soloSheet'), focus = host.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const set = (k, v) => setBoard(board.map((r, j) => (j === i ? { ...r, [k]: v } : r))), r = board[i];
  sheet.show(seatSheet(viewOf(board, i), seatColor(i), {
    sub: i ? 'computer player' : 'your seat', team: r.team, sides: sideChoices(board), onDone: () => closeSheet(),
    onRace: (v) => set('race', v), onSide: (v) => set('team', v), ...(i ? { onDiff: (v) => set('diff', v) } : {}),
    buttons: canRemove(board, i) ? [{ label: 'REMOVE', title: `Remove ${seatName(i)}`, k: 'remove', ghost: true, on: () => { editing = -1; setBoard(board.map((q, j) => (j === i ? null : q))); ($('soloBoard').querySelector('[data-k="add"]') || $('btnStart')).focus(); } }] : [],
  }), () => closeSheet());
  if (focus) (host.querySelector(`[data-k="${focus}"]`) || host.querySelector(`[data-k^="${focus.split(':')[0]}:"].on`) || host.querySelector('[data-k="done"]')).focus();
}
narrow.addEventListener?.('change', () => { if (menu.board.length) renderSeats(); });

// A map's thumbnail at its size: rock, fields, vents and every start (a Random map: a question mark). The canvas is
// drawn a pixel per tile (64 or 96 across) and shown at one size. The sim draws the map: until its WASM is in (the menu
// comes first, src/boot.js), a plain ground, the map drawn when it is.
const PREVIEW = ['#2a3442', '#7d8796', '#4fd1c5', '#a78bfa', '#f5a524', '#3f6f7e', '#1f3a63']; // (ground, rock, shards, vents, starts, shallows, deep water)
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

export function initMenu({ onStart }) {
  // The first page's shore under the other menu pages too (owner, 2026-11-03), each copy with ids of its own.
  for (const id of ['menuSolo', 'menuAbout', 'onlineJoin', 'onlineRoom']) {
    const shore = $('menuHome').querySelector('.shore').cloneNode(true);
    for (const el of shore.querySelectorAll('[id]')) {
      const was = el.id; el.id = `${was}-${id}`;
      for (const r of shore.querySelectorAll(`[fill="url(#${was})"],[stroke="url(#${was})"]`)) for (const a of ['fill', 'stroke']) if (r.getAttribute(a) === `url(#${was})`) r.setAttribute(a, `url(#${el.id})`);
    }
    $(id).appendChild(shore);
  }
  // The board (remembered on this device; a setup that is not a good one: you and an AI), and the map (the last one
  // chosen, if it seats them; else the smallest that does; ?seed=: a random one).
  let saved = null; try { saved = JSON.parse(store.get('seats')); } catch { /* none, or not ours */ }
  menu.board = validRows(saved, MAX_PLAYERS) || defaultRows(); menu.players = filled(menu.board).length;
  const last = store.get('map') === null ? -1 : +store.get('map');
  choose(fitMap(urlSeed !== null ? MAPS.findIndex(m => m.random) : last, menu.players));
  takeChallenge(); renderMaps(); renderSeats(); showFirstGame();
  $('btnFirstHome').addEventListener('click', () => { sfx('select'); enterFullscreen(); menu.tutorial = true; onStart(); });
  $('btnStart').addEventListener('click', () => { // each game draws our starting base (a random map, RANDOM races: one per seat)
    if (oneTeam(menu.board)) return;
    sfx('select'); enterFullscreen(); menu.tutorial = false; if (!menu.challenge) choose(menu.map); // (a challenge: its own seed and starts)
    Object.assign(menu, startSetup(menu.board, draw)); // (the record counts a game at its hardest AI's level: `diff`)
    menu.race = menu.races[0]; menu.enemyRace = menu.races[1]; onStart();
  });
  // The pages: single player opens its own, BACK returns to the first (multiplayer: online.js).
  $('btnSolo').addEventListener('click', () => { sfx('select'); page('menuSolo'); });
  $('btnSoloBack').addEventListener('click', () => { sfx('select'); page('menuHome'); });
  $('btnAbout').addEventListener('click', () => { sfx('select'); page('menuAbout'); });
  $('btnAboutBack').addEventListener('click', () => { sfx('select'); page('menuHome'); });
  const build = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : 'dev';
  $('buildId').textContent = build; // (vite.config.js: the one online play compares)
  showStamp();
  initOffline(build); // INSTALL, then PLAY OFFLINE (offline.js)
  $('btnHowTo').addEventListener('click', openHelp);
  $('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
  initOptions(); // OPTIONS, here and on the pause card (options.js)
}

/** A challenge link (`?vs=CODE`): its setup on the single-player page, the line saying so, nothing saved; the
 *  parameter leaves the address once read (good or not: a code that is not a good one is the plain menu). */
function takeChallenge() {
  const q = new URLSearchParams(location.search);
  if (!q.has(PARAM)) return;
  const c = decode(q.get(PARAM));
  q.delete(PARAM); history.replaceState(history.state, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`);
  if (!c) return;
  const m = mapOf(c);
  Object.assign(menu, { challenge: c, board: c.spots.map(r => r && { ...r }), players: filled(c.spots).length, map: c.map, size: m.size, seed: m.seed, kind: m.kind, name: m.name, side: c.side });
  page('menuSolo');
}
/** The challenge of the game just won in `secs` (the menu's setup, as START GAME seated it), or null (the guided game). */
export const wonChallenge = (secs) => (menu.tutorial ? null : fromSetup(menu, secs));
/** Where a reload should land while a challenge is set (the player has not changed it): its link (an update of the game
 *  reloads the menu: src/boot.js), else ''. */
export function pendingChallenge() {
  if (!menu.challenge) return '';
  const q = new URLSearchParams(location.search); q.set(PARAM, encode(menu.challenge)); // (the address's other parameters kept: ?seed=, ?relay=)
  return `${location.origin}${location.pathname}?${q}${location.hash}`;
}

/** The game to start: the menu's choices, or the guided first game's own (Easy, the first map, Humans against Humans). */
export function setup() {
  if (!menu.tutorial) return { ...menu };
  const m = MAPS[0];
  return { ...menu, diff: 0, seed: m.seed, kind: m.kind, name: m.name, size: m.size, side: 0, race: 'humans', enemyRace: 'humans', players: 2, races: ['humans', 'humans'], ai: [false, true], teams: [], diffs: [], spots: [] };
}

/** Show one page of the menu: `menuHome` (the first), `menuSolo` or `menuAbout`. */
function page(id) { for (const p of document.querySelectorAll('#start .page')) p.hidden = p.id !== id; }
/** Back to the menu (after a game, quitting, or the lobby's BACK): its first page, with the last choices. */
/** Back to the menu: its first page, or `at` (after a game against the AI: the single player page, one tap from the next). */
export function showMenu(at = 'menuHome') { renderMaps(); renderSeats(); showFirstGame(); page(at); $('start').hidden = false; }

// The player's record on this device, per race and difficulty: [won, lost] (the race played: a Random one's draw).
// Kept, not shown (owner, 2026-11-04: the first page shows the game, not a tally): FIRST GAME's rule reads it.
const records = () => { try { const r = JSON.parse(store.get('record')); return r && typeof r === 'object' ? r : {}; } catch { return {}; } };
const tally = (r, k) => Array.isArray(r[k]) && r[k].length === 2 ? r[k].map(n => +n || 0) : [0, 0]; // (whatever else is stored)
/** Count a finished game for the race and difficulty it was played at. */
export function recordResult(win, race, diff) {
  const r = records(), k = `${race}:${diff}`, [w, l] = tally(r, k);
  r[k] = win ? [w + 1, l] : [w, l + 1]; store.set('record', JSON.stringify(r));
}
/** The guided first game was played to its end (FIRST GAME then leaves the first page). */
export function guidedDone() { store.set('guided', '1'); }
/** FIRST GAME on the first page for a newcomer: nobody has finished a game on this device yet (none on the record, no
 *  guided one). */
function showFirstGame() {
  const r = records();
  $('btnFirstHome').hidden = store.get('guided') === '1' || Object.keys(r).some(k => tally(r, k).some(n => n > 0));
}

/** The build stamp at the foot of the first page: the last game update (vite.config.js: the newest commit that changed
 *  what ships, not a docs or CI one) and its date, in the player's own locale and time zone ("Updated Nov 4, 2026 ·
 *  b8f7b2d"; "dev" without git): an old copy (a cache) tells itself from the latest deployment. About has it beside the
 *  Version (the sim's build, which online play compares). */
function showStamp() {
  const commit = typeof __COMMIT__ === 'string' ? __COMMIT__ : 'dev', short = commit === 'dev' ? 'dev' : commit.slice(0, 7);
  const at = typeof __COMMIT_DATE__ === 'string' && __COMMIT_DATE__ ? new Date(__COMMIT_DATE__) : null;
  const date = at && !Number.isNaN(at.getTime()) ? at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  $('buildStamp').textContent = short === 'dev' || !date ? 'dev' : `Updated ${date} · ${short}`;
  $('buildStamp').title = short === 'dev' || !date ? '' : `The last game update: ${date}, commit ${short}`;
  $('buildCommit').textContent = short;
}

/** How to play, from the menu or the pause card: at its top (focusing BACK, at the bottom of a scrolling card, used to
 *  open it scrolled to the end). */
export function openHelp() {
  $('help').hidden = false;
  $('btnHelpClose').focus({ preventScroll: true });
  $('help').querySelector('.card').scrollTop = 0;
}
