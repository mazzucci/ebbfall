// Play a friend (docs/MULTIPLAYER.md): the lobby card and the glue between the network layer (src/net/net.js) and the
// game. Mobile-first and few words: open a room (a 4-letter code to share, or a link) or join one, pick a race (the
// first seat also picks the map), ready. The button is shown only where a relay is known: `?relay=ws://...`, the
// build's VITE_RELAY_URL, or the dev machine's own (port 8788) when the page comes from it.
import { Net } from '../net/net.js';
import { liveGame } from '../engine/index.js';
import { $, toast } from './ui.js';
import { sfx } from './audio.js';
import { MAPS } from './menu.js';

const params = new URLSearchParams(location.search);
const local = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(location.hostname);
/** Where the relay is, or null (no online play from this page). */
export const relayUrl = () => params.get('relay') || import.meta.env?.VITE_RELAY_URL || (local ? `ws://${location.hostname}:8788/` : null);

const store = { get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } } };

/** The online game, while there is one: its Net, this side's seat and the room's setup. */
export const online = { net: null, seat: -1, setup: null, playing: false, names: [] };
let onStart = () => {}, onLeave = () => {};

/** Wire the lobby: `start(setup, seat)` begins the game; `leave()` goes back to the menu. */
export function initOnline({ start, leave }) {
  onStart = start; onLeave = leave;
  $('btnOnline').hidden = !relayUrl();
  $('btnOnline').addEventListener('click', () => { sfx('select'); openLobby(); });
  $('btnNewRoom').addEventListener('click', () => { sfx('select'); connect(''); });
  $('btnJoinRoom').addEventListener('click', () => { const c = $('roomCode').value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) { sfx('select'); connect(c); } else status('Type the 4-letter code'); });
  $('roomCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoinRoom').click(); });
  $('btnOnlineBack').addEventListener('click', () => { sfx('select'); stopOnline(); $('online').hidden = true; onLeave(); });
  $('btnOnlineReady').addEventListener('click', () => { sfx('select'); online.ready = !online.ready; online.net?.ready(online.ready); });
  $('btnShare').addEventListener('click', share);
  for (const b of $('onlineRace').querySelectorAll('button')) b.addEventListener('click', () => { sfx('select'); online.net?.race(b.dataset.race); });
  $('onlineName').value = store.get('name') || '';
  // A shared link (?join=CODE): straight to that room.
  const join = params.get('join');
  if (join && relayUrl()) { openLobby(); connect(join.toUpperCase()); }
}

function openLobby() { $('start').hidden = true; $('online').hidden = false; $('onlineJoin').hidden = false; $('onlineRoom').hidden = true; $('btnOnlineReady').hidden = true; status(''); }
function status(s) { $('onlineStatus').textContent = s; }
const name = () => { const n = $('onlineName').value.trim().slice(0, 16); if (n) store.set('name', n); return n || 'Player'; };

function connect(room) {
  stopOnline();
  status(room ? `Joining ${room}…` : 'Opening a room…');
  online.ready = false;
  online.net = new Net({
    url: relayUrl(), room, name: name(), game: () => (online.playing ? liveGame() : null),
    on: {
      seat: (m) => { online.seat = m.seat; $('onlineJoin').hidden = true; $('onlineRoom').hidden = false; $('btnOnlineReady').hidden = false; $('roomShow').textContent = m.room; status(m.seat === 0 ? 'Share the code with a friend' : ''); },
      lobby: renderLobby,
      start: (setup, seat) => { online.setup = setup; online.names = setup.names; online.playing = true; $('online').hidden = true; onStart(setup, seat); online.net.loaded(); },
      away: (s) => { if (s !== online.seat) toast(`Waiting for ${online.names[s] || 'the other player'}…`, true, true); },
      back: (s) => { if (s !== online.seat) toast(`${online.names[s] || 'The other player'} is back`); },
      left: (s) => { if (s !== online.seat) toast(`${online.names[s] || 'The other player'} left the game`, true, true); },
      desync: () => toast('The game went out of sync: it cannot go on', true),
      error: (m) => { status(m.msg); if (!online.playing) { $('onlineJoin').hidden = false; $('onlineRoom').hidden = true; $('btnOnlineReady').hidden = true; } },
      status: (s) => { if (online.playing && s === 'reconnecting') toast('Connection lost: reconnecting…', true, true); },
    },
  });
}

function renderLobby(m) {
  $('seatList').innerHTML = m.seats.map((s, i) => `<div class="seat${i === online.seat ? ' me' : ''}"><b>${esc(s.name || '…')}</b><span>${s.race.toUpperCase()}</span><span class="${s.ready ? 'ok' : ''}">${!s.here ? 'away' : s.ready ? 'READY' : ''}</span></div>`).join('');
  const me = m.seats[online.seat];
  if (me) {
    for (const b of $('onlineRace').querySelectorAll('button')) { const on = b.dataset.race === me.race; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    online.ready = me.ready; $('btnOnlineReady').textContent = me.ready ? 'NOT READY' : 'READY';
  }
  // The map: the first seat picks; everyone sees it.
  const maps = $('onlineMaps');
  maps.innerHTML = MAPS.map((mp, i) => `<button class="ib${i === m.map ? ' on' : ''}" data-i="${i}"${online.seat === 0 ? '' : ' disabled'}>${mp.name.toUpperCase()}</button>`).join('');
  if (online.seat === 0) for (const b of maps.querySelectorAll('button')) b.addEventListener('click', () => { sfx('select'); online.net?.map(+b.dataset.i); });
  status(m.seats.every(s => s.here) ? (m.seats.every(s => s.ready) ? 'Starting…' : 'Ready when you are') : 'Waiting for a friend to join');
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function share() {
  const code = $('roomShow').textContent, url = `${location.origin}${location.pathname}?join=${code}${params.get('relay') ? `&relay=${encodeURIComponent(params.get('relay'))}` : ''}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Ebbfall', text: `Play me in Ebbfall: room ${code}`, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied'); }
  } catch { /* cancelled */ }
}

/** The map an online setup plays: a fixed one's layout, or the room's seed for the random one (a character from it). */
export function onlineMap(setup, kinds) {
  const m = MAPS[setup.map] || MAPS[0];
  return m.random ? { seed: setup.seed, kind: setup.seed % kinds } : { seed: m.seed, kind: m.kind };
}

/** Leave the online game (or the lobby) for good. */
export function stopOnline() { online.net?.close(); Object.assign(online, { net: null, seat: -1, setup: null, playing: false, ready: false }); }
