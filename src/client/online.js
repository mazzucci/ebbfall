// Multiplayer (docs/MULTIPLAYER.md): the lobby card and the glue between the network layer (src/net/net.js) and the
// game. Mobile-first and few words: open a room (a 4-letter code to share, or a link) or join one, pick a race (or
// RANDOM: drawn when the game starts, alike on every client, src/engine/util.js seatRaces; the first seat also picks
// the map), ready. The menu's MULTIPLAYER is shown only where a relay is known: `?relay=ws://...`, the build's
// VITE_RELAY_URL, or the dev machine's own (port 8788) when the page comes from it.
import { Net } from '../net/net.js';
import { liveGame } from '../engine/index.js';
import { $, toast } from './ui.js';
import { sfx } from './audio.js';
import { MAPS, mapName } from './menu.js';
import { touchDevice, enterFullscreen } from './screen.js';

const params = new URLSearchParams(location.search);
// (this machine, a LAN, or a Tailscale network)
const local = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|[\w-]+(\.[\w-]+)*\.ts\.net)$/.test(location.hostname);
/** Where the relay is, or null (no online play from this page). `?relay=` only on a dev machine or a LAN (a link
 *  must not send players on the real site to someone else's relay). */
export const relayUrl = () => ((local || import.meta.env?.DEV) && params.get('relay')) || import.meta.env?.VITE_RELAY_URL || (local ? `ws://${location.hostname}:8788/` : null);

/** This build's sim (vite.config.js): a room's seats must share it. */
const SIM_BUILD = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : '';
/** The link that opens room `code` (with this page's test relay, if any). */
const joinLink = (code) => `${location.origin}${location.pathname}?join=${code}${params.get('relay') ? `&relay=${encodeURIComponent(params.get('relay'))}` : ''}`;
/** Where a reload should land: back in the lobby's room, if there is one and no game is on; else this page. */
export const reloadUrl = () => { const code = online.net?.room || joining; return code && !online.playing ? joinLink(code) : location.href; };

const store = { get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } } };

/** The online game, while there is one: its Net, this side's seat and the room's setup. */
export const online = { net: null, seat: -1, setup: null, playing: false, names: [], rematch: false, gone: new Set() };
let onStart = () => {}, onLeave = () => {}, onQuit = () => {}, onRoom = () => {}, onRematch = () => {};
const waitingFor = new Set(); // seats the game waits for

/** Wire the lobby: `start(setup, seat)` begins the game; `leave()` goes back to the menu from the lobby, `quit()`
 *  from a game that cannot go on. */
export function initOnline({ start, leave, quit, room, rematch }) {
  onStart = start; onLeave = leave; onQuit = quit; onRoom = room; onRematch = rematch;
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
  $('onlineName').value = store.get('name') || '';
  // A shared link (?join=CODE): straight to that room.
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
      start: (setup, seat) => { online.rematch = false; online.wants = []; online.dead = false; online.gone.clear(); online.setup = setup; online.names = setup.names; online.playing = true; $('online').hidden = true; onStart(setup, seat); online.net.loaded(); },
      away: (s) => { if (s !== online.seat) { waitingFor.add(s); waitLine(); } },
      back: (s) => { if (waitingFor.delete(s)) { waitLine(); toast(`${Who(s)} is back`); } },
      left: (s) => { if (s !== online.seat) { online.gone.add(s); waitingFor.delete(s); waitLine(); toast(`${Who(s)} left the game`, true, true); onRematch(false, false); } },
      desync: () => fatal('Out of sync: the game cannot go on'),
      error: (m) => {
        if (online.playing) { fatal(m.code === 'noroom' ? 'The game server restarted: this game is over' : String(m.msg || 'The connection was lost')); return; }
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

const who = (s) => online.names[s] || 'your friend';
const Who = (s) => who(s).replace(/^./, c => c.toUpperCase()); // (at the start of a line)
let reconnecting = false, over = '';
/** The one line under the top bar: what the game waits for, or why it is over (with the way back to the menu). */
function waitLine() {
  const text = over || (reconnecting ? 'Connection lost: reconnecting…' : waitingFor.size ? `Waiting for ${[...waitingFor].map(who).join(', ')}…` : '');
  $('netWait').hidden = !text; $('netWait').firstChild.textContent = text; $('btnNetMenu').hidden = !over;
}
/** The game cannot go on (a desync, this screen replaced by another): say so, stop, and offer the menu. */
function fatal(msg) { over = msg; online.dead = true; online.net?.close(); waitLine(); sfx('error'); onRematch(false, false); }
/** Whether someone else in the room wants a rematch. */
export const theyWant = () => (online.wants || []).some((w, s) => w && s !== online.seat);

/** After a game, the room again (a rematch): the same seats, ready again. */
function backToRoom() {
  online.playing = false; online.setup = null; online.ready = false; online.rematch = false;
  waitingFor.clear(); reconnecting = false; over = ''; waitLine();
  onRoom();
  $('online').hidden = false; $('onlineJoin').hidden = true; $('onlineRoom').hidden = false; $('btnOnlineReady').hidden = false; $('btnOnlineReload').hidden = true;
}
/** The end card's REMATCH, online: want another game in this room (again: not any more). */
export function wantRematch() { online.rematch = !online.rematch; online.net?.rematch(online.rematch); return online.rematch; }

function renderLobby(m) {
  // A seat nobody has taken yet (no name, not here): an open seat, nothing more.
  const open = (s) => !s.here && !s.name;
  $('seatList').innerHTML = m.seats.map((s, i) => open(s) ? '<div class="seat open"><b>open seat</b><span></span><span></span></div>'
    : `<div class="seat${i === online.seat ? ' me' : ''}"><b>${esc(s.name || '…')}</b><span>${esc(String(s.race || '').toUpperCase())}</span><span class="${s.ready ? 'ok' : ''}">${!s.here ? 'AWAY' : s.ready ? 'READY' : ''}</span></div>`).join('');
  const me = m.seats[online.seat];
  if (me) {
    for (const b of $('onlineRace').querySelectorAll('button')) { const on = b.dataset.race === me.race; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    online.ready = me.ready; $('btnOnlineReady').textContent = me.ready ? 'NOT READY' : 'READY';
  }
  // The map: the first seat picks; everyone sees it (and whose pick it is).
  $('onlineMapLbl').textContent = online.seat === 0 ? 'MAP' : `MAP (${m.seats[0]?.name || 'your friend'}'s pick)`;
  const maps = $('onlineMaps');
  maps.innerHTML = MAPS.map((mp, i) => `<button class="ib${i === m.map ? ' on' : ''}" data-i="${i}"${online.seat === 0 ? '' : ' disabled'}>${mp.name.toUpperCase()}</button>`).join('');
  if (online.seat === 0) for (const b of maps.querySelectorAll('button')) b.addEventListener('click', () => { sfx('select'); online.net?.map(+b.dataset.i); });
  const gone = m.seats.filter(s => !s.here && !open(s)).map(s => s.name || 'your friend');
  status(m.seats.some(open) ? 'Send a friend the link, then wait here' : gone.length ? `Waiting for ${gone.join(', ')}…` : m.seats.every(s => s.ready) ? 'Starting…' : 'Ready when you are');
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
  location.replace(joinLink(code));
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

/** The map an online setup plays: a fixed one's layout, or the room's seed for the random one (a character from it). */
export function onlineMap(setup, kinds) {
  const m = MAPS[setup.map] || MAPS[0];
  return m.random ? { seed: setup.seed, kind: setup.seed % kinds, name: mapName(setup.seed) } : { seed: m.seed, kind: m.kind, name: m.name };
}

/** Leave the online game (or the lobby) for good. */
export function stopOnline() { if (!online.net?.leaving) online.net?.close(); waitingFor.clear(); reconnecting = false; over = ''; waitLine(); Object.assign(online, { net: null, seat: -1, setup: null, playing: false, ready: false, names: [], rematch: false, wants: [], dead: false }); online.gone.clear(); }
