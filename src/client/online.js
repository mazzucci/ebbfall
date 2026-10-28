// Multiplayer (docs/MULTIPLAYER.md): the lobby page and the glue between the network layer (src/net/net.js) and the
// game. Mobile-first and few words: open a room (a 4-letter code to share, or a link) or join one; then the room is the
// single-player page's board (seats.js): eight fixed spots, a token per seat, each with its side as a tag. A person is a
// token with their name (a crown on the host's, a green check once ready, AWAY while the relay holds the seat for them),
// an AI the single-player AI token (its race, its level as pips), an open seat a dashed OPEN SEAT for the next friend to
// join. Your own token opens a sheet with your race (RANDOM: drawn when the game starts, alike on every client,
// src/engine/util.js seatRaces). The room's host (spot 0) opens any token: puts anyone on any side, sets an AI's race
// and level, shares, fills (GIVE TO AI) or removes an open seat, frees an AWAY one; fills the lowest empty spot with an
// AI or an open seat (+ AI, + SEAT), eight seats at most; and picks the map (any that seats the room). A guest sees the
// same board, read-only but their own token, SIT HERE on an open seat, and the map as one line. A seat keeps its spot
// (and its colour, in the game too) whatever its side; the relay seats the sides together only when the game starts.
// READY is a lit toggle; the room's code is the title, SHARE LINK beside it (the big button while the host has a seat
// open). The menu's MULTIPLAYER is shown only where a relay is known: `?relay=ws://...`, the build's VITE_RELAY_URL, or
// the dev machine's own (port 8788) when the page comes from it.
import { Net, PAUSES } from '../net/net.js';
import { liveGame, seatRaces, FACTIONS, ready as simReady } from '../engine/index.js';
import { $, toast, LOAD_FAILED } from './ui.js';
import { sfx } from './audio.js';
import { mapSelect, drawPreview, showMenu } from './menu.js';
import { MAPS, MAX_PLAYERS, fitMap, mapLabel } from './maps.js';
import { filled, freeTeam, firstEmpty, sideChoices, sideColor, seatColor, raceTitle, tokenEl, emptySpot, seatSheet, sheetDialog, narrow } from './seats.js';
import { touchDevice, enterFullscreen } from './screen.js';
import { store } from './store.js';

const params = new URLSearchParams(location.search);
// (this machine, a LAN, or a Tailscale network)
const local = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|[\w-]+(\.[\w-]+)*\.ts\.net)$/.test(location.hostname);
/** Where the relay is, or null (no online play from this page). `?relay=` only on a dev machine or a LAN (a link
 *  must not send players on the real site to someone else's relay). */
/** The relay this build was made with (VITE_RELAY_URL: the published game's), or ''. */
export const BAKED_RELAY = import.meta.env?.VITE_RELAY_URL || '';
export const relayUrl = () => ((local || import.meta.env?.DEV) && params.get('relay')) || BAKED_RELAY || (local ? `ws://${location.hostname}:8788/` : null);

/** This build's sim (vite.config.js): a room's seats must share it. */
const SIM_BUILD = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : '';
/** The link that opens room `code` (with this page's test relay, if any). */
const joinLink = (code) => `${location.origin}${location.pathname}?join=${code}${params.get('relay') ? `&relay=${encodeURIComponent(params.get('relay'))}` : ''}`;
/** The multiplayer page again (after an update, with no room yet). */
const lobbyLink = () => `${location.origin}${location.pathname}?online=1${params.get('relay') ? `&relay=${encodeURIComponent(params.get('relay'))}` : ''}`;
/** Where a reload should land: back in the lobby's room, if there is one and no game is on; else this page. */
export const reloadUrl = () => { const code = online.net?.room || joining; return online.playing ? location.href : code ? joinLink(code) : !$('online').hidden ? lobbyLink() : location.href; };


/** The online game, while there is one: its Net, this side's seat and the room's setup; a room pause (`hold`: who
 *  called it and when it runs out, by this page's clock) and the pauses each seat has left. */
export const online = { baked: BAKED_RELAY, net: null, seat: -1, setup: null, playing: false, names: [], rematch: false, gone: new Set(), hold: null, left: [] };
/** The game (main.js `game`): `loading`, its promise (src/boot.js); `game` once it has loaded; `failed` if it could not. */
let loading = Promise.reject(new Error('not wired')), game = null, failed = false;
loading.catch(() => {});
const waitingFor = new Set(), loadingSeats = new Set(); // seats the game waits for; those of them whose game is not set up yet

/** Wire the lobby. `game`: a promise of main.js's `game` (src/boot.js loads it behind the menu), through which a game
 *  starts (`newOnlineGame`) and ends (`quitToTitle`), a rematch's room comes back (`room`), a room pause begins and
 *  ends (`pause`, `resume`) and the end card hears who wants a rematch (`rematch`). READY waits for it. */
export function initOnline({ game: g }) {
  loading = g;
  g.then(x => { game = x; readyButton(); }, () => { failed = true; readyButton(); if (online.seat >= 0) status(LOAD_FAILED); });
  $('btnNetMenu').addEventListener('click', () => { sfx('select'); game?.quitToTitle(); });
  $('btnOnline').hidden = !relayUrl();
  $('btnOnline').addEventListener('click', () => { sfx('select'); openLobby(); });
  // (opening or joining a room stays out of full screen: the host's next step is sharing the link from another app;
  // READY's tap goes full screen, so the game starts in it, as the menu's START GAME does)
  $('btnNewRoom').addEventListener('click', () => { sfx('select'); connect(''); });
  $('btnJoinRoom').addEventListener('click', () => { const c = $('roomCode').value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) { sfx('select'); connect(c); } else status('Type the 4-letter code'); });
  $('roomCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoinRoom').click(); });
  $('btnOnlineBack').addEventListener('click', () => { sfx('select'); stopOnline(); $('online').hidden = true; showMenu(); });
  // READY once the game has loaded (a room's start must find it ready: the relay's clock waits for every seat); a game
  // that could not load: RELOAD.
  $('btnOnlineReady').addEventListener('click', () => {
    if (failed) { location.replace(reloadUrl()); return; }
    if (!game) return;
    sfx('select'); online.ready = !online.ready; if (online.ready) enterFullscreen(); online.net?.ready(online.ready); readyButton();
  });
  // Online, a phone puts a hidden page to sleep (and its socket with it): on coming back, make sure the socket lives.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) online.net?.wake(); });
  $('btnShare').addEventListener('click', share);
  $('btnOnlineReload').addEventListener('click', reloadNewest);
  holdTaps();
  narrow.addEventListener?.('change', () => { if (lobbyState) renderLobby(lobbyState); }); // (a token's race, short or not)
  simReady.then(() => { preview = ''; if (lobbyState) renderLobby(lobbyState); }, () => {}); // (the map's thumbnail, once the sim can draw it)
  $('onlineName').value = store.get('name') || '';
  // A shared link (?join=CODE): straight to that room.
  // After UPDATE with no room yet (?online=1): straight back to the multiplayer page.
  if (params.get('online') !== null) { params.delete('online'); history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`); if (relayUrl()) openLobby(); }
  const join = params.get('join');
  if (join) { params.delete('join'); history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`); } // (a reload later is not a join again)
  // A shared link (?join=CODE): the join form, the code filled in, a name to type first.
  if (join && relayUrl()) invited(join.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4));
}

function invited(code) {
  openLobby();
  $('roomCode').value = code; $('btnJoinRoom').classList.add('big');
  status(`You're invited to room ${code}: ${$('onlineName').value.trim() ? 'tap JOIN' : 'type your name, then JOIN'}`); // (a name remembered: one tap)
  if (!touchDevice) $('onlineName').focus();
}
function openLobby() { $('btnJoinRoom').classList.remove('big'); $('start').hidden = true; $('online').hidden = false; $('onlineJoin').hidden = false; $('onlineRoom').hidden = true; $('btnOnlineReady').hidden = true; $('btnOnlineReload').hidden = true; status(''); }
/** Out of the room (an error, a start, BACK): its sheet closed, its board forgotten. */
function leaveRoom() { lobbyState = null; owed = null; owedSeat = null; editing = -1; lastMap = null; mapNote = ''; clearTimeout(noteTimer); sheet?.close(); }
/** This side's seat in the room (the relay's `seat`): the first one, back after a reconnect, or another mid-lobby (the
 *  seats renumbered: an open sheet follows its seat). The lobby that follows says what to do; a first seat clears the
 *  joining line meanwhile. */
function takeSeat(m) {
  const first = online.seat < 0;
  if (editing >= 0 && editing === online.seat) editing = m.seat;
  online.seat = m.seat; seatToken.set(m.room, m.token);
  $('onlineJoin').hidden = true; $('onlineRoom').hidden = false; $('btnOnlineReady').hidden = false; readyButton(); $('roomShow').textContent = m.room;
  if (first || failed) status(failed ? LOAD_FAILED : '');
}
function status(s) { $('onlineStatus').textContent = s; }
const name = () => { const n = $('onlineName').value.trim().slice(0, 16); if (n) store.set('name', n); return n || 'Player'; };

function connect(room) {
  stopOnline();
  status(room ? `Joining ${room}…` : 'Opening a room…');
  online.ready = false; $('roomShow').textContent = ''; $('onlineBoard').replaceChildren(); leaveRoom(); $('btnOnlineReload').hidden = true; // (no last room's code or seats)
  joining = room;
  online.net = new Net({
    url: relayUrl(), room, name: name(), build: SIM_BUILD, token: room ? seatToken.get(room) : null, game: () => (online.playing ? liveGame() : null),
    on: {
      // (also mid-lobby: the host moved this seat to another side, and the relay renumbered the seats; held with the
      // lobby that follows while a tap is under way: holdTaps)
      // (a seat that moved mid-lobby waits for the lobby the relay sends right after it: this side's seat and the board
      // it reads change together, never one ahead of the other; and neither under a finger: holdTaps)
      seat: (m) => { if (online.seat >= 0 && !online.setup) owedSeat = m; else takeSeat(m); },
      lobby: (m) => { if (online.playing) backToRoom(); if (held) owed = m; else showLobby(m); },
      rematch: (wants) => { online.wants = wants; game?.rematch(theyWant(), !!wants[online.seat]); },
      notice: (m) => { if (m.code === 'version' && !online.playing) { status('A friend\'s Ebbfall didn\'t match yours. Tap UPDATE to update; you keep this room'); $('btnOnlineReload').hidden = false; } },
      // The game has loaded (READY waits for it); a start that finds it still loading (a seat taken back after a
      // reload) begins once it has, the lobby up meanwhile: the room's news meanwhile (who left, a pause, who wants a
      // rematch: the relay tells a rejoin right after the start) is kept for it. BACK before then gives the game up
      // (stopOnline): the relay concedes for this seat and nobody waits. A game that could not load keeps the seat
      // (the Net closed, its token kept: the relay waits within its budget), RELOAD back into the room. A RANDOM seat is
      // drawn from the room's seed, alike on every client: here, in a file the build hash covers.
      start: (setup, seat, m) => {
        online.rematch = false; online.wants = []; online.dead = false; online.gone.clear(); online.setup = setup;
        online.seat = seat; owedSeat = null; // (the game's seat: the relay seats the sides together at the start)
        online.names = setup.names.map((n, s) => (setup.ai?.[s] ? 'the AI' : n)); // (an AI seat is "the AI" in every line that names a seat)
        online.hold = null; online.left = Array.isArray(m?.left) ? m.left : setup.names.map(() => PAUSES);
        editing = -1; sheet?.close(); // (the lobby stays up while the game loads, its sheet closed)
        const net = online.net;
        loading.then((g) => {
          if (online.net !== net) return;
          online.playing = true; $('online').hidden = true;
          g.newOnlineGame(setup, seat, seatRaces(setup.races, setup.seed, Object.keys(FACTIONS))); net.loaded();
          if (online.hold) g.pause(); // (a room pause on already: its card)
          slowLoad = false; clearTimeout(slowTimer); slowTimer = setTimeout(() => { slowLoad = true; waitLine(); }, 1500); // (no turns yet: the others still load)
          waitLine();
        }, () => {
          if (online.net !== net) return;
          joining = net.room || joining; net.close(); online.net = null; // (RELOAD: reloadUrl, back into this room with the seat's token)
          status(LOAD_FAILED); readyButton();
        });
      },
      clock: () => waitLine(), // (the relay's clock runs: everyone has loaded)
      away: (s, m) => { if (s !== online.seat) { waitingFor.add(s); if (m?.loading) loadingSeats.add(s); else loadingSeats.delete(s); waitLine(); } },
      back: (s) => { loadingSeats.delete(s); if (waitingFor.delete(s)) { waitLine(); if (online.playing) toast(`${Who(s)} is back`); } },
      left: (s) => { if (s !== online.seat) { online.gone.add(s); waitingFor.delete(s); loadingSeats.delete(s); waitLine(); if (online.playing) toast(`${Who(s)} left the game`, true, true); game?.rematch(false, false); } }, // (not over the lobby of a game still loading: the game says it)
      // A room pause: the relay's clock stops for everyone (who paused, its time left); it ends when they resume it, or
      // its time runs out (seat -1).
      // (heard while the game still loads: kept, and its card opens once the game is up)
      pause: (m) => { if (!online.setup) return; online.hold = { seat: m.seat, until: performance.now() + Math.max(0, m.ms || 0) }; online.left = m.left; waitLine(); if (online.playing) game?.pause(); },
      resume: (s) => { if (!online.hold) return; online.hold = null; waitLine(); if (online.playing) game?.resume(s); },
      desync: () => fatal('Out of sync: the game cannot go on'),
      error: (m) => {
        if (online.playing) { fatal(m.code === 'noroom' ? 'The room is gone: this game is over' : String(m.msg || 'The connection was lost')); return; }
        status(m.code === 'version' ? 'Your Ebbfall and your friend\'s don\'t match. Tap UPDATE, then JOIN again' : String(m.msg || ''));
        leaveRoom(); $('onlineJoin').hidden = false; $('onlineRoom').hidden = true; $('btnOnlineReady').hidden = true; $('btnOnlineReload').hidden = m.code !== 'version' && m.code !== 'update'; // (another build: UPDATE)
      },
      status: (s) => {
        if (s === 'online') { waitingFor.clear(); loadingSeats.clear(); } // (seated again: the relay tells who is still away next)
        if (online.playing) { reconnecting = s === 'reconnecting'; waitLine(); }
        else if (s === 'reconnecting' && online.seat >= 0) status('Reconnecting…'); // (the room keeps this seat meanwhile; its lobby says the rest)
      },
    },
  });
}

/** A seat's name as typed in the lobby (or "your friend"); `Who` at the start of a line. */
export const who = (s) => online.names[s] || 'your friend';
export const Who = (s) => who(s).replace(/^./, c => c.toUpperCase());
/** Seats named for a line: "Bo", "Bo and Cy", or "3 players"; `many`: say "want", not "wants". */
const named = (seats) => ({ text: seats.length === 1 ? Who(seats[0]) : seats.length === 2 ? `${Who(seats[0])} and ${who(seats[1])}` : `${seats.length} players`, many: seats.length > 1 });
/** The other seats still in the game. */
const others = () => online.names.map((_, s) => s).filter(s => s !== online.seat && !online.gone.has(s));
/** What leaving does to the game: "Bo wins" with one other still in; with more, this side is only out. */
export const ifYouLeave = () => { const o = others(); return o.length === 1 ? `${Who(o[0])} wins` : "you're out"; };
/** Who wants a rematch, as a line ("Bo wants a rematch"), or '' (nobody else). */
export const wantLine = () => { const s = (online.wants || []).map((w, i) => (w && i !== online.seat ? i : -1)).filter(i => i >= 0); if (!s.length) return ''; const n = named(s); return `${n.text} ${n.many ? 'want' : 'wants'} a rematch`; };
let reconnecting = false, over = '', slowLoad = false, slowTimer = 0;
/** The one line under the top bar: what the game waits for, or why it is over (with the way back to the menu). Until
 *  the relay's clock runs, the others are still loading: whom the relay names (a seat away), or after a moment, all. */
function waitLine() {
  // (a room pause says itself, on the pause card: nobody is waited for meanwhile)
  const loads = online.playing && !online.net?.running;
  const text = over || (reconnecting ? 'Reconnecting…' : waitingFor.size && !online.hold ? `Waiting for ${[...waitingFor].map(s => who(s) + (loadingSeats.has(s) ? ' to load' : '')).join(', ')}…` : loads && slowLoad ? 'Waiting for the others to load…' : '');
  $('netWait').hidden = !text; $('netWait').firstChild.textContent = text; $('btnNetMenu').hidden = !over;
}
/** The game cannot go on (a desync, this screen replaced by another): say so, stop, and offer the menu. */
function fatal(msg) {
  over = msg; online.dead = true; online.net?.close();
  if (online.hold) { online.hold = null; game?.resume(-2); } // (no pause any more: the card closes unless the player opened it, so the reason shows)
  waitLine(); sfx('error'); game?.rematch(false, false);
}
/** Whether someone else in the room wants a rematch. */
export const theyWant = () => (online.wants || []).some((w, s) => w && s !== online.seat);

/** After a game, the room again (a rematch): the same seats, ready again. */
function backToRoom() {
  online.playing = false; online.setup = null; online.ready = false; online.rematch = false; online.hold = null;
  waitingFor.clear(); loadingSeats.clear(); reconnecting = false; over = ''; slowLoad = false; clearTimeout(slowTimer); waitLine();
  game?.room();
  $('online').hidden = false; $('onlineJoin').hidden = true; $('onlineRoom').hidden = false; $('btnOnlineReady').hidden = false; $('btnOnlineReload').hidden = true;
}
/** The end card's REMATCH, online: want another game in this room (again: not any more). */
export function wantRematch() { online.rematch = !online.rematch; online.net?.rematch(online.rematch); return online.rematch; }

// ---- The room: the board ----
/** The last lobby the relay sent: `{ map, teams, seats }`, a team and a seat per spot (null: an empty spot), each seat
 *  `{ name, race, ready, here, ai, diff }`. */
let lobbyState = null;
let editing = -1, sheet = null, preview = '', mapNote = '', noteTimer = 0, lastMap = null; // (the spot whose sheet is open; the dialog it opens in; the map drawn; the map's note)
/** A tap's events go to the element it began on: a board or sheet redrawn under a finger (a lobby arriving mid-tap:
 *  someone else's change, or the answer to the last chip) would lose the tap. The relay's lobby waits (`owed`) while
 *  a pointer is down in the lobby, until its click (or a moment after the finger lifts, or its cancel, or at most
 *  1.5 s); a new seat number (`owedSeat`) waits with it. */
let held = 0, taps = 0, owed = null, owedSeat = null; // (held: the tap under way, by number; none 0: an earlier tap's timers cannot end a later one's hold)
function holdTaps() {
  const done = (t) => {
    if (!held || t !== held) return;
    held = 0;
    if (owed) { const m = owed; owed = null; showLobby(m); }
  };
  const box = $('online');
  box.addEventListener('pointerdown', () => { const t = held = ++taps; setTimeout(() => done(t), 1500); }, true);
  box.addEventListener('pointercancel', () => done(held), true);
  box.addEventListener('pointerup', () => { const t = held; setTimeout(() => done(t), 400); }, true);
  box.addEventListener('click', () => { const t = held; setTimeout(() => done(t)); }, true);
}
/** A lobby from the relay: the seat it sent before it first (`owedSeat`: a sit moved this side), then the board. */
function showLobby(m) {
  if (owedSeat) { const s = owedSeat; owedSeat = null; takeSeat(s); }
  renderLobby(m);
}
/** A seat nobody has taken (no name, not here, not the AI's): open for a friend. */
const isOpen = (s) => !!s && !s.ai && !s.here && !s.name;
/** An AI seat's name: AI and its spot's number (as single player's). */
const aiName = (i) => `AI ${i}`;
/** The lobby as seats.js reads a board: a `{ team, race, diff }` per spot, null when empty. */
const boardOf = (m) => m.seats.map((s, i) => (s ? { team: m.teams[i], race: s.race, diff: s.diff, ai: s.ai } : null));
/** The seats in the room. */
const seated = (m) => m.seats.filter(Boolean);
/** A new AI: on a side of its own, as the room's last AI (race, level), else RANDOM on Medium. */
function aiFor(m) {
  const b = boardOf(m), like = filled(b).map(i => b[i]).filter(r => r.ai).at(-1) || { race: 'random', diff: 1 };
  return { race: like.race, diff: like.diff ?? 1, team: freeTeam(b) };
}
/** A seat as its token shows it (seats.js `tokenEl`'s view): YOU, a person's name, AI n or an open seat; its side; the
 *  host's crown; ready, AWAY; who may open it (`ro`: nobody here); what a tap says. */
function viewOf(m, i) {
  const s = m.seats[i], me = online.seat, host = me === 0, open = isOpen(s), side = m.teams[i], sideCol = sideColor(boardOf(m), side);
  if (s.ai) return { name: aiName(i), race: s.race, diff: s.diff ?? 1, side, sideColor: sideCol, ro: !host, tip: 'Race, level, side' };
  if (open) return { name: '', open: true, host: i === 0, side, sideColor: sideCol, act: host ? '' : 'SIT HERE', tip: host ? 'Share the link, give it to the AI, or move it' : 'Take this seat' };
  const mine = i === me;
  return { name: mine ? 'YOU' : s.name || '…', race: s.race, diff: null, side, sideColor: sideCol, me: mine, host: i === 0, ready: s.ready && s.here, away: !s.here, ro: !mine && !host, tip: mine ? 'Race, side' : 'Side' };
}

function renderLobby(m) {
  lobbyState = m;
  const me = online.seat, host = me === 0, mine = m.seats[me];
  if (!mine || !Array.isArray(m.teams) || m.teams.length !== m.seats.length) return; // (a lobby of another shape: nothing to draw)
  const n = seated(m).length;
  online.ready = !!mine.ready; readyButton();
  // The board: eight spots; the host's + AI / + SEAT in the lowest empty one.
  const box = $('onlineBoard'), short = narrow.matches, free = host && n < MAX_PLAYERS ? firstEmpty(m.seats) : -1;
  const focus = document.activeElement?.closest?.('#onlineBoard') ? document.activeElement.dataset.k : null; // (kept on a redraw)
  const add = (ai) => { const like = aiFor(m); online.net?.add(like.team, ai, like.race, like.diff); };
  const token = (i) => {
    const s = m.seats[i], v = viewOf(m, i);
    const t = tokenEl(v, isOpen(s) ? '' : seatColor(i), { short, on: i === editing, onOpen: v.ro ? null : () => tap(i), k: `tok${i}` });
    if (!host || s.ai || isOpen(s) || s.here || i === 0) return t;
    // (a held seat whose player is away: × frees it at once, as FREE SEAT in its sheet)
    const pair = document.createElement('div'), x = document.createElement('button');
    pair.className = 'pair'; x.className = 'ib x'; x.textContent = '×'; x.dataset.k = `free${i}`;
    x.title = `Free ${s.name || 'this'}'s seat (they stepped away)`; x.setAttribute('aria-label', `Free ${s.name || 'this'}'s seat`);
    x.addEventListener('click', () => { sfx('select'); online.net?.free(i); });
    pair.append(t, x);
    return pair;
  };
  box.replaceChildren(...m.seats.map((s, i) => (s ? token(i) : emptySpot(i === free ? [
    { label: '+ AI', title: 'An AI on a side of its own', k: 'addai', on: () => { sfx('select'); add(true); } },
    { label: '+ SEAT', title: 'An open seat for a friend, on a side of its own', k: 'addseat', on: () => { sfx('select'); add(false); } },
  ] : []))));
  if (focus) box.querySelector(`[data-k="${focus}"]`)?.focus();
  // The title row: SHARE LINK the big button while the host has a seat open.
  const open = seated(m).filter(isOpen).length;
  $('btnShare').classList.toggle('big', host && open > 0);
  // The map: the host's list (any map that seats the room) and its thumbnail; a guest's one line, whose pick it is. A
  // seat more than the map's starts: the relay moved to the smallest map that seats them, said a moment.
  const map = fitMap(m.map, n);
  if (lastMap && lastMap.map !== map && n > lastMap.n) {
    mapNote = `Map: ${mapLabel(map).replace(' · ', ' (')})`; clearTimeout(noteTimer); // (Map: Dust Quarter (up to 4))
    noteTimer = setTimeout(() => { mapNote = ''; if (lobbyState) status(lobbyLine(lobbyState)); }, 4000);
  }
  lastMap = { map, n };
  $('onlineMaps').hidden = !host; $('onlineMapLine').hidden = host;
  if (host) mapSelect($('onlineMapSel'), n, map, (i) => online.net?.map(i));
  else { $('onlineMapName').textContent = MAPS[map].name.toUpperCase(); $('onlineMapNote').textContent = `${m.seats[0]?.name || 'your friend'}'s pick`; }
  if (preview !== String(map)) { preview = String(map); drawPreview($('onlinePreview'), map, MAPS[map].seed, MAPS[map].kind); }
  status(lobbyLine(m));
  renderSheet();
}
/** The one line of what the room waits for (the footer's note); a moment after the map changed by itself, that. */
function lobbyLine(m) {
  const host = online.seat === 0, all = seated(m), open = all.filter(isOpen).length;
  const gone = all.filter(s => !s.ai && !isOpen(s) && !s.here).map(s => s.name || 'your friend');
  if (failed) return LOAD_FAILED;
  if (mapNote) return mapNote;
  if (!host && isOpen(m.seats[0])) return 'The host left: SIT HERE on the first seat to pick';
  if (new Set(m.teams.filter((t, i) => m.seats[i])).size < 2) return 'Nobody to fight';
  if (open && (host || !gone.length)) return host ? `${open > 1 ? `${open} seats are` : 'A seat is'} open: share the link, or give ${open > 1 ? 'them' : 'it'} to the AI` : 'Waiting for players…';
  if (gone.length) return `Waiting for ${gone.join(', ')}…`;
  return all.every(s => s.ai || s.ready) ? 'Starting…' : 'Ready when you are';
}
/** A token tapped: a guest's tap on an open seat moves there; else its sheet. */
function tap(i) {
  const m = lobbyState;
  if (!m || online.setup) return; // (a game has started: the board is only shown while it loads)
  if (online.seat !== 0 && i !== online.seat && isOpen(m.seats[i])) { sfx('select'); online.net?.sit(i, m.teams[i]); return; }
  editing = i; sfx('select'); renderLobby(m); $('onlineSheet').querySelector('.chips .on, [data-k="share"]')?.focus();
}
function closeSheet(focusOn = editing) {
  if (editing < 0) return;
  editing = -1; renderLobby(lobbyState);
  ($('onlineBoard').querySelector(`[data-k="tok${focusOn}"]`) || $('btnOnlineReady')).focus();
}
/** The open seat's sheet (none: closed), redrawn with every lobby, the focus where it was. Yours: your race (the host:
 *  your side too). The host's on an AI: its race, level and side, OPEN FOR A FRIEND, REMOVE; on an open seat: SHARE
 *  LINK, GIVE TO AI, its side, REMOVE; on another person: their side, FREE SEAT while they are away. READY is not here. */
function renderSheet() {
  sheet ||= sheetDialog($('onlineSheet'));
  const m = lobbyState, i = editing, me = online.seat, host = me === 0;
  if (!m || i < 0 || !m.seats[i] || (!host && i !== me)) { editing = -1; sheet.close(); return; }
  const dlg = $('onlineSheet'), focus = dlg.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const s = m.seats[i], mine = i === me, open = isOpen(s), team = m.teams[i], n = seated(m).length;
  const remove = { label: 'REMOVE', title: `Remove ${open ? 'the open seat' : aiName(i)}`, k: 'remove', ghost: true, on: () => { online.net?.drop(i); closeSheet(); } };
  const name = open ? 'OPEN SEAT' : s.ai ? aiName(i) : mine ? 'YOU' : s.name || '…';
  sheet.show(seatSheet({ name, race: s.race, diff: s.diff ?? 1 }, seatColor(i), {
    sub: open ? 'for a friend' : s.ai ? 'computer player' : mine ? 'your seat' : `${raceTitle(s.race)} · ${s.ready && s.here ? 'ready' : s.here ? 'not ready' : 'away'}`,
    info: open ? 'The first friend to open the link takes this seat.' : '',
    team, sides: sideChoices(boardOf(m)), onDone: () => closeSheet(),
    onRace: mine ? (r) => online.net?.race(r) : s.ai && host ? (r) => online.net?.ai(i, true, r) : null,
    onDiff: s.ai && host ? (d) => online.net?.ai(i, true, undefined, d) : null,
    onSide: host ? (t) => online.net?.side(i, t) : null,
    buttons: !host ? [] : open ? [
      { label: 'SHARE LINK', title: 'Share the link to this room', k: 'share', big: true, on: share },
      { label: 'GIVE TO AI', title: 'The AI plays this seat', k: 'giveai', ghost: true, on: () => { const like = aiFor(m); online.net?.ai(i, true, like.race, like.diff); } },
      ...(n > 2 && i > 0 ? [remove] : []),
    ] : s.ai ? [
      { label: 'OPEN FOR A FRIEND', title: 'An open seat again, for a friend', k: 'open', ghost: true, on: () => online.net?.ai(i, false) },
      ...(n > 2 ? [remove] : []),
    ] : !mine && !s.here ? [{ label: 'FREE SEAT', title: `${s.name || 'They'} stepped away: open the seat now`, k: 'free', ghost: true, on: () => online.net?.free(i) }] : [],
  }), () => closeSheet());
  if (focus) (dlg.querySelector(`[data-k="${focus}"]`) || dlg.querySelector(`[data-k^="${focus.split(':')[0]}:"].on`) || dlg.querySelector('[data-k="done"]'))?.focus();
}
/** READY: LOADING… until the game has loaded, RELOAD if it could not; a lit toggle (✓ READY) once ready; the big
 *  button unless a seat is open; nothing to start while everyone is on one side. */
function readyButton() {
  const b = $('btnOnlineReady'), m = lobbyState, lit = !failed && !!game && !!online.ready;
  const one = !!m && new Set(m.teams.filter((t, i) => m.seats[i])).size < 2, open = !!m && m.seats.some(isOpen);
  b.disabled = !failed && (!game || one);
  b.textContent = failed ? 'RELOAD' : !game ? 'LOADING…' : lit ? '✓ READY' : 'READY';
  b.classList.toggle('lit', lit); b.classList.toggle('big', failed || !open); b.setAttribute('aria-pressed', String(lit));
  b.title = failed ? '' : lit ? 'Ready (tap to take it back)' : 'Ready: the game starts once everyone is';
}

let joining = '';
/** Reload into the newest build and back to the room. A new build being installed: wait for it (main.js reloads into
 *  the room when it takes over); none: reload now (another build may already be cached). */
async function reloadNewest() {
  sfx('select');
  const code = online.net?.room || joining;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    if (reg?.installing || reg?.waiting) {
      status('Updating…'); $('btnOnlineReload').hidden = true;
      if (code) joining = code; // (where main.js's reload lands: reloadUrl)
      return;
    }
  } catch { /* no service worker: a plain reload */ }
  location.replace(code ? joinLink(code) : lobbyLink());
}
/** This tab's seat token per room (a reload, or an update's switch-over, takes the same seat back). */
const seatToken = {
  get: (room) => { try { return sessionStorage.getItem('endfall.seat.' + room); } catch { return null; } },
  set: (room, t) => { try { sessionStorage.setItem('endfall.seat.' + room, t); } catch { /* private mode */ } },
  del: (room) => { try { sessionStorage.removeItem('endfall.seat.' + room); } catch { /* private mode */ } },
};

async function share() {
  const code = $('roomShow').textContent, url = joinLink(code);
  try {
    if (navigator.share) await navigator.share({ title: 'Ebbfall', text: `Play me in Ebbfall: room ${code}`, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied'); }
  } catch { /* cancelled */ }
}

/** Leave the online game (or the lobby) for good. Out of a lobby: the seat is given up (the relay would hold it a while
 *  for a player who only switched apps). */
export function stopOnline() {
  const net = online.net;
  if (net && !net.leaving) { if (online.playing) net.close(); else if (!net.closed) { net.leave(); if (net.room) seatToken.del(net.room); } } // (given up: a quick rejoin is a new seat, not a fight over this one)
  leaveRoom();
  waitingFor.clear(); loadingSeats.clear(); reconnecting = false; over = ''; slowLoad = false; clearTimeout(slowTimer); waitLine(); Object.assign(online, { net: null, seat: -1, setup: null, playing: false, ready: false, names: [], rematch: false, wants: [], dead: false, hold: null, left: [] }); online.gone.clear();
}
