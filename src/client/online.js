// Multiplayer (docs/MULTIPLAYER.md): the lobby card and the glue between the network layer (src/net/net.js) and the
// game. Mobile-first and few words: open a room (a 4-letter code to share, or a link) or join one, pick a race (or
// RANDOM: drawn when the game starts, alike on every client, src/engine/util.js seatRaces), ready. The room's host (the
// first seat) also picks the players (2 to 4: the room's seats), the teams for four, the map (one that seats them) and
// gives open seats to the AI (its race, and one difficulty for every AI seat); a friend may move to an open seat (the
// teams are by seat: the first two against the last two). The menu's MULTIPLAYER is shown only where a relay is known:
// `?relay=ws://...`, the build's VITE_RELAY_URL, or the dev machine's own (port 8788) when the page comes from it.
import { Net, PAUSES } from '../net/net.js';
import { liveGame, seatRaces, FACTIONS } from '../engine/index.js';
import { $, toast } from './ui.js';
import { sfx } from './audio.js';
import { mapButtons } from './menu.js';
import { fitMap } from './maps.js';
import { SEAT_COLORS } from './look.js';
import { touchDevice, enterFullscreen } from './screen.js';

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

const store = { get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } } };

/** The online game, while there is one: its Net, this side's seat and the room's setup; a room pause (`hold`: who
 *  called it and when it runs out, by this page's clock) and the pauses each seat has left. */
export const online = { baked: BAKED_RELAY, net: null, seat: -1, setup: null, playing: false, names: [], rematch: false, gone: new Set(), hold: null, left: [] };
let onStart = () => {}, onLeave = () => {}, onQuit = () => {}, onRoom = () => {}, onRematch = () => {}, onPause = () => {}, onResume = () => {};
const waitingFor = new Set(); // seats the game waits for

/** Wire the lobby: `start(setup, seat)` begins the game; `leave()` goes back to the menu from the lobby, `quit()`
 *  from a game that cannot go on; `pause()` / `resume(seat)` a room pause begins (or is told again) / ends. */
export function initOnline({ start, leave, quit, room, rematch, pause, resume }) {
  onStart = start; onLeave = leave; onQuit = quit; onRoom = room; onRematch = rematch; onPause = pause; onResume = resume;
  $('btnNetMenu').addEventListener('click', () => { sfx('select'); onQuit(); });
  $('btnOnline').hidden = !relayUrl();
  $('btnOnline').addEventListener('click', () => { sfx('select'); openLobby(); });
  // (opening or joining a room stays out of full screen: the host's next step is sharing the link from another app;
  // READY's tap goes full screen, so the game starts in it, as the menu's START GAME does)
  $('btnNewRoom').addEventListener('click', () => { sfx('select'); connect(''); });
  $('btnJoinRoom').addEventListener('click', () => { const c = $('roomCode').value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) { sfx('select'); connect(c); } else status('Type the 4-letter code'); });
  $('roomCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoinRoom').click(); });
  $('btnOnlineBack').addEventListener('click', () => { sfx('select'); stopOnline(); $('online').hidden = true; onLeave(); });
  $('btnOnlineReady').addEventListener('click', () => { sfx('select'); online.ready = !online.ready; if (online.ready) enterFullscreen(); online.net?.ready(online.ready); });
  $('btnShare').addEventListener('click', share);
  $('btnOnlineReload').addEventListener('click', reloadNewest);
  for (const b of $('onlineRace').querySelectorAll('button')) b.addEventListener('click', () => { sfx('select'); online.net?.race(b.dataset.race); });
  // The host's: the players (the map follows: one that seats them), the teams for four, the AI seats' difficulty.
  for (const b of $('onlinePlayers').querySelectorAll('button')) b.addEventListener('click', () => { if (online.seat !== 0) return; sfx('select'); const k = +b.dataset.n; if (lobbyState?.seats.some((s, i) => i >= k && !s.ai && (s.here || s.name))) { status('Someone sits in a seat that would go'); return; } online.net?.seats(k, fitMap(lobbyState?.map ?? 0, k)); });
  for (const b of $('onlineTeams').querySelectorAll('button')) b.addEventListener('click', () => { if (online.seat !== 0) return; sfx('select'); online.net?.teams(b.dataset.teams === '2v2' ? [0, 0, 1, 1] : null); });
  for (const b of $('onlineDiff').querySelectorAll('button')) b.addEventListener('click', () => { if (online.seat !== 0) return; sfx('select'); online.net?.diff(+b.dataset.d); });
  // A seat's own buttons (rendered with the seats): the host's + AI / × on an open or AI seat and an AI's race, and a
  // friend's SIT HERE on an open seat.
  $('seatList').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const seat = +b.dataset.seat, act = b.dataset.act; sfx('select');
    if (act === 'ai') online.net?.ai(seat, true);
    else if (act === 'open') online.net?.ai(seat, false);
    else if (act === 'race') online.net?.ai(seat, true, NEXT_RACE[lobbyState?.seats[seat]?.race] || 'random');
    else if (act === 'sit') online.net?.sit(seat);
  });
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
function status(s) { $('onlineStatus').textContent = s; }
const name = () => { const n = $('onlineName').value.trim().slice(0, 16); if (n) store.set('name', n); return n || 'Player'; };

function connect(room) {
  stopOnline();
  status(room ? `Joining ${room}…` : 'Opening a room…');
  online.ready = false; $('roomShow').textContent = ''; $('seatList').innerHTML = ''; $('btnOnlineReload').hidden = true; // (no last room's code or seats)
  joining = room;
  online.net = new Net({
    url: relayUrl(), room, name: name(), build: SIM_BUILD, token: room ? seatToken.get(room) : null, game: () => (online.playing ? liveGame() : null),
    on: {
      seat: (m) => { online.seat = m.seat; seatToken.set(m.room, m.token); $('onlineJoin').hidden = true; $('onlineRoom').hidden = false; $('btnOnlineReady').hidden = false; $('roomShow').textContent = m.room; status(''); }, // (the lobby that follows says what to do)
      lobby: (m) => { if (online.playing) backToRoom(); renderLobby(m); },
      rematch: (wants) => { online.wants = wants; onRematch(theyWant(), !!wants[online.seat]); },
      notice: (m) => { if (m.code === 'version' && !online.playing) { status('A friend\'s Ebbfall didn\'t match yours. Tap UPDATE to update; you keep this room'); $('btnOnlineReload').hidden = false; } },
      start: (setup, seat, m) => { online.rematch = false; online.wants = []; online.dead = false; online.gone.clear(); online.setup = setup; online.playing = true; $('online').hidden = true;
        online.names = setup.names.map((n, s) => (setup.ai?.[s] ? 'the AI' : n)); // (an AI seat is "the AI" in every line that names a seat)
        online.hold = null; online.left = Array.isArray(m?.left) ? m.left : setup.names.map(() => PAUSES);
        // (a RANDOM seat drawn from the room's seed, alike on every client: here, in a file the build hash covers)
        onStart(setup, seat, seatRaces(setup.races, setup.seed, Object.keys(FACTIONS))); online.net.loaded(); },
      away: (s) => { if (s !== online.seat) { waitingFor.add(s); waitLine(); } },
      back: (s) => { if (waitingFor.delete(s)) { waitLine(); toast(`${Who(s)} is back`); } },
      left: (s) => { if (s !== online.seat) { online.gone.add(s); waitingFor.delete(s); waitLine(); toast(`${Who(s)} left the game`, true, true); onRematch(false, false); } },
      // A room pause: the relay's clock stops for everyone (who paused, its time left); it ends when they resume it, or
      // its time runs out (seat -1).
      pause: (m) => { if (!online.playing) return; online.hold = { seat: m.seat, until: performance.now() + Math.max(0, m.ms || 0) }; online.left = m.left; waitLine(); onPause(); },
      resume: (s) => { if (!online.hold) return; online.hold = null; waitLine(); onResume(s); },
      desync: () => fatal('Out of sync: the game cannot go on'),
      error: (m) => {
        if (online.playing) { fatal(m.code === 'noroom' ? 'The room is gone: this game is over' : String(m.msg || 'The connection was lost')); return; }
        status(m.code === 'version' ? 'Your Ebbfall and your friend\'s don\'t match. Tap UPDATE, then JOIN again' : String(m.msg || ''));
        $('onlineJoin').hidden = false; $('onlineRoom').hidden = true; $('btnOnlineReady').hidden = true; $('btnOnlineReload').hidden = m.code !== 'version' && m.code !== 'update'; // (another build: UPDATE)
      },
      status: (s) => {
        if (s === 'online') waitingFor.clear(); // (seated again: the relay tells who is still away next)
        if (online.playing) { reconnecting = s === 'reconnecting'; waitLine(); }
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
let reconnecting = false, over = '';
/** The one line under the top bar: what the game waits for, or why it is over (with the way back to the menu). */
function waitLine() {
  // (a room pause says itself, on the pause card: nobody is waited for meanwhile)
  const text = over || (reconnecting ? 'Reconnecting…' : waitingFor.size && !online.hold ? `Waiting for ${[...waitingFor].map(who).join(', ')}…` : '');
  $('netWait').hidden = !text; $('netWait').firstChild.textContent = text; $('btnNetMenu').hidden = !over;
}
/** The game cannot go on (a desync, this screen replaced by another): say so, stop, and offer the menu. */
function fatal(msg) {
  over = msg; online.dead = true; online.net?.close();
  if (online.hold) { online.hold = null; onResume(-2); } // (no pause any more: the card closes unless the player opened it, so the reason shows)
  waitLine(); sfx('error'); onRematch(false, false);
}
/** Whether someone else in the room wants a rematch. */
export const theyWant = () => (online.wants || []).some((w, s) => w && s !== online.seat);

/** After a game, the room again (a rematch): the same seats, ready again. */
function backToRoom() {
  online.playing = false; online.setup = null; online.ready = false; online.rematch = false; online.hold = null;
  waitingFor.clear(); reconnecting = false; over = ''; waitLine();
  onRoom();
  $('online').hidden = false; $('onlineJoin').hidden = true; $('onlineRoom').hidden = false; $('btnOnlineReady').hidden = false; $('btnOnlineReload').hidden = true;
}
/** The end card's REMATCH, online: want another game in this room (again: not any more). */
export function wantRematch() { online.rematch = !online.rematch; online.net?.rematch(online.rematch); return online.rematch; }

/** The last lobby the relay sent (the host's buttons read it). */
let lobbyState = null;
const NEXT_RACE = { humans: 'vael', vael: 'random', random: 'humans' };
const dot = (i) => `<i class="dot" style="background:#${SEAT_COLORS[i % SEAT_COLORS.length].toString(16).padStart(6, '0')}"></i>`;
/** Light the button of `box` whose `key` data is `value`; `locked`: shown, not chosen (not the host's). */
function radio(box, key, value, locked) {
  for (const b of box.querySelectorAll('button')) { const on = b.dataset[key] === String(value); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.disabled = locked && !on; }
}

function renderLobby(m) {
  lobbyState = m;
  const host = online.seat === 0, n = m.seats.length;
  // A seat nobody has taken yet (no name, not here, not the AI's): an open seat; the host may give it to the AI, a
  // friend may move there. An AI seat: its race (the host taps it for the next) and, for the host, × to open it again.
  const open = (s) => !s.ai && !s.here && !s.name;
  const cell = (s, i) => {
    if (s.ai) {
      const race = esc(String(s.race || 'random').toUpperCase());
      return `<div class="seat ai">${dot(i)}<b>AI</b>${host ? `<button class="ib" data-act="race" data-seat="${i}" title="Its race (tap for the next)">${race}</button><button class="ib x" data-act="open" data-seat="${i}" title="An open seat again" aria-label="Remove the AI">×</button>` : `<span>${race}</span><span></span>`}</div>`;
    }
    if (open(s)) {
      const act = host ? `<button class="ib" data-act="ai" data-seat="${i}" title="The AI plays this seat">+ AI</button>` : online.seat > 0 ? `<button class="ib" data-act="sit" data-seat="${i}" title="Take this seat (the teams are by seat)">SIT HERE</button>` : '';
      return `<div class="seat open">${dot(i)}<b>open seat</b>${act || '<span></span>'}<span></span></div>`;
    }
    return `<div class="seat${i === online.seat ? ' me' : ''}">${dot(i)}<b>${esc(s.name || '…')}</b><span>${esc(String(s.race || '').toUpperCase())}</span><span class="${s.ready ? 'ok' : ''}">${!s.here ? 'AWAY' : s.ready ? 'READY' : ''}</span></div>`;
  };
  // Two against two: the first two seats against the last two, a row each.
  const vs = n === 4 && Array.isArray(m.teams) && m.teams[0] === m.teams[1] && m.teams[2] === m.teams[3] && m.teams[0] !== m.teams[2];
  const cells = m.seats.map(cell);
  if (vs) cells.splice(2, 0, '<div class="vs">VS</div>');
  $('seatList').innerHTML = cells.join('');
  $('seatList').classList.toggle('many', n > 2);
  const me = m.seats[online.seat];
  if (me) {
    radio($('onlineRace'), 'race', me.race, false);
    online.ready = me.ready; $('btnOnlineReady').textContent = me.ready ? 'NOT READY' : 'READY';
  }
  // The host's choices; everyone sees them (and whose pick the map is).
  radio($('onlinePlayers'), 'n', n, !host);
  $('onlineTeams').hidden = n !== 4;
  radio($('onlineTeams'), 'teams', vs ? '2v2' : 'ffa', !host);
  $('onlineAi').hidden = !m.seats.some(s => s.ai);
  radio($('onlineDiff'), 'd', m.diff ?? 1, !host);
  $('onlineMapNote').textContent = host ? '' : `${m.seats[0]?.name || 'your friend'}'s pick`; // (the joiner: who chooses)
  mapButtons($('onlineMaps'), n, fitMap(m.map, n), host ? (i) => online.net?.map(i) : null);
  const people = m.seats.filter(s => !s.ai);
  const gone = people.filter(s => !s.here && !open(s)).map(s => s.name || 'your friend');
  status(!host && open(m.seats[0]) ? 'The host left: SIT HERE on the first seat to pick' : m.seats.some(open) ? (host ? `Send a friend the link${n > 2 ? ', or add the AI' : ''}, then wait here` : 'Waiting for players…') : gone.length ? `Waiting for ${gone.join(', ')}…` : people.every(s => s.ready) ? 'Starting…' : 'Ready when you are');
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
};

async function share() {
  const code = $('roomShow').textContent, url = joinLink(code);
  try {
    if (navigator.share) await navigator.share({ title: 'Ebbfall', text: `Play me in Ebbfall: room ${code}`, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied'); }
  } catch { /* cancelled */ }
}

/** Leave the online game (or the lobby) for good. */
export function stopOnline() { if (!online.net?.leaving) online.net?.close(); waitingFor.clear(); reconnecting = false; over = ''; waitLine(); Object.assign(online, { net: null, seat: -1, setup: null, playing: false, ready: false, names: [], rematch: false, wants: [], dead: false, hold: null, left: [] }); online.gone.clear(); }
