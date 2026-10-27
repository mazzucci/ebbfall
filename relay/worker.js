// The relay on Cloudflare (docs/MULTIPLAYER.md, M3d): a Worker that sends each WebSocket to its room's Durable Object,
// one object per room code, which runs relay/room.js's rules (the same as relay/server.mjs's, which is the Node
// adapter). A client connects to wss://host/?room=CODE (or ?new=1 to open a room) and says hello. Config and deploy:
// relay/wrangler.toml. Also the device test's reports over HTTP (relay/bench.js): POST /bench, GET /bench/<CODE>, kept
// by one more object of the same class, named 'bench' (room codes are four capitals: never that name).
import { Room, TURN_MS, MAX_SEATS } from './room.js';
import { benchRequest, BenchStore } from './bench.js';

const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // (no vowels: no words; no look-alikes)
const MAX_MSG = 64 * 1024;
const HELLO_MS = 10000; // a connection that has not said hello by then is closed
const ROOM_IDLE_MS = 10 * 60 * 1000; // a room nobody has been in this long is free for a new one with its code
const TRIES = 8; // codes tried for a new room
const SAVE_MS = 1000; // storage writes of a room's record at most this often (the last change is always written)

const random = () => crypto.getRandomValues(new Uint32Array(1))[0];
const newCode = () => Array.from({ length: 4 }, () => ALPHABET[random() % ALPHABET.length]).join('');
const allowed = (req, env) => !env.ORIGINS || env.ORIGINS.split(',').includes(req.headers.get('Origin'));

export default {
  async fetch(req, env) {
    const bench = await benchRequest(req, { origins: env.ORIGINS, ip: req.headers.get('CF-Connecting-IP') || '', store: (r) => env.ROOMS.get(env.ROOMS.idFromName('bench')).fetch(r) });
    if (bench) return bench;
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Ebbfall relay: WebSocket only', { status: 426 });
    if (!allowed(req, env)) return new Response('Not from here', { status: 403 });
    const q = new URL(req.url).searchParams;
    const room = (code, isNew) => env.ROOMS.get(env.ROOMS.idFromName(code))
      .fetch(new Request(`https://room/?code=${code}${isNew ? '&new=1' : ''}`, { headers: req.headers }));
    if (q.get('new')) {
      for (let i = 0; i < TRIES; i++) {
        const res = await room(newCode(), true);
        if (res.status !== 409) return res; // (409: that code is in use, another one)
      }
      return new Response('No free room code', { status: 503 });
    }
    const code = (q.get('room') || '').toUpperCase();
    return room(/^[A-Z]{4}$/.test(code) ? code : 'NONE', false); // (no such room: told so over the socket)
  },
};

/** The platform's WebSocket pair and upgrade response (replaced by fakes in the tests). */
const CLOUDFLARE = {
  pair: () => Object.values(new WebSocketPair()),
  respond: (client) => new Response(null, { status: 101, webSocket: client }),
};

/** A room's Durable Object: its Room, its connections, and the clock while anyone is connected. The Room lives in
 *  memory, and Cloudflare evicts an object a minute or two after its last socket closes; a record in storage (the code,
 *  when it was last used, whether its game started, and the lobby itself: its seats with their names, races and tokens,
 *  the AI seats, the map, the teams, the difficulty; Room.keep) brings an evicted lobby back as it was: a seat held for
 *  a player who switched apps (relay/room.js, LOBBY_HOLD_MS) is still theirs, and an empty lobby comes back for a friend
 *  who joins late. The record is written when it changes (a ready toggle does not change it), at most once a SAVE_MS
 *  (the last change always, and at once when the last socket closes), and deleted by an alarm once the room has been
 *  empty ROOM_IDLE_MS. A game is not kept: an evicted or redeployed one is over (its players are told the room is
 *  gone). The object named 'bench' is no room: it keeps the device test's reports (relay/bench.js BenchStore). */
export class RoomObject {
  constructor(state, env, platform = CLOUDFLARE) {
    this.platform = platform; this.storage = state?.storage; this.room = null; this.conns = new Set(); this.timer = null;
    this.lastUsed = 0; this.started = false;
    this.saved = ''; this.savedAt = 0; this.saveTimer = null; // (the record last written, when; a write waiting)
  }

  async fetch(req) {
    if (new URL(req.url).hostname === 'bench') return (this.bench ||= new BenchStore(this.storage)).fetch(req); // (the reports' object)
    const q = new URL(req.url).searchParams, code = q.get('code');
    const saved = this.room ? null : await this.storage?.get('room');
    const recent = saved && Date.now() - saved.used < ROOM_IDLE_MS;
    if (q.get('new')) {
      const inUse = this.room ? this.conns.size || Date.now() - this.lastUsed < ROOM_IDLE_MS : recent;
      if (inUse) return new Response('Taken', { status: 409 });
      this.open(code);
    } else if (!this.room && recent && !saved.started) this.open(code, saved.lobby); // (an evicted lobby: back, its seats held)
    const [client, ws] = this.platform.pair();
    ws.accept();
    this.attach(ws);
    return this.platform.respond(client);
  }

  /** A new room, or a kept lobby back (its record checked: 2 to MAX_SEATS seats, each an object; anything else, or a
   *  record that does not restore, is an empty lobby). */
  open(code, kept) {
    const room = (n) => new Room({ code, seats: n, send, kick, seed: random(), onLobby: () => this.save() });
    const seats = Array.isArray(kept?.seats) ? kept.seats.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
    this.room = room(2);
    if (seats.length >= 2 && seats.length <= MAX_SEATS) {
      try { const r = room(seats.length); if (r.restore({ ...kept, seats }, Date.now())) this.room = r; } catch { /* a bad record: an empty lobby */ }
    }
    this.started = false; this.saved = '';
  }
  /** Keep the room's record: only if it changed, at most once a SAVE_MS (a trailing write for the last change). */
  save() {
    if (this.saveTimer) return; // (the waiting write takes the latest state)
    const wait = this.savedAt + SAVE_MS - Date.now();
    if (wait > 0) { this.saveTimer = setTimeout(() => { this.saveTimer = null; this.write(); }, wait); return; }
    this.write();
  }
  /** Write now (a waiting write is done with). */
  write() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    const room = this.room; if (!room) return;
    const lobby = room.phase === 'lobby', rec = JSON.stringify({ started: !lobby, lobby: lobby ? room.keep() : null });
    if (rec === this.saved) return;
    this.saved = rec; this.savedAt = Date.now();
    this.storage?.put('room', { code: room.code, used: Date.now(), ...JSON.parse(rec) }).catch(() => { this.saved = ''; }); // (failed: written again with the next change)
  }
  /** The room has been empty ROOM_IDLE_MS: its record goes (its code is free), and the room with it. */
  async alarm() {
    if (this.conns.size) return; // (someone came back: a new alarm when they leave)
    clearTimeout(this.saveTimer); this.saveTimer = null;
    this.room = null; this.saved = '';
    await this.storage?.deleteAll?.();
  }

  attach(ws) {
    const room = this.room;
    if (!room) { send(ws, { t: 'error', code: 'noroom', msg: 'No room with that code' }); kick(ws); return; }
    this.conns.add(ws); this.lastUsed = Date.now();
    if (!this.timer) { room.tick(Date.now()); this.timer = setInterval(() => room.tick(Date.now()), TURN_MS / 4); } // (at once: a hold that ran out while nobody was here is over before anyone is seated)
    let seated = false;
    const silent = setTimeout(() => { if (!seated) kick(ws); }, HELLO_MS);
    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data.length > MAX_MSG) { kick(ws); return; }
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      this.lastUsed = Date.now();
      if (!seated) { seated = room.connect(ws, msg) >= 0; if (!seated) kick(ws); return; }
      room.receive(ws, msg);
      if (this.started !== (room.phase !== 'lobby')) { this.started = room.phase !== 'lobby'; this.save(); } // (a game: no lobby to bring back; a rematch's lobby: one again)
    });
    const gone = () => {
      if (!this.conns.delete(ws)) return;
      clearTimeout(silent); room.close(ws); this.lastUsed = Date.now();
      if (!this.conns.size) { // (nobody here: the clock waits, the record is written now, and goes once idle long enough)
        clearInterval(this.timer); this.timer = null;
        if (this.saveTimer) this.write();
        this.storage?.setAlarm?.(Date.now() + ROOM_IDLE_MS)?.catch?.(() => {});
      }
    };
    ws.gone = gone; // (a kick cleans up at once: closing a socket from this side need not fire its close event)
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }
}

function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* closed meanwhile */ } }
// (the clean-up after the room's own call has finished: Room.connect kicks a replaced socket mid-way)
function kick(ws) { try { ws.close(1000); } catch { /* closed already */ } queueMicrotask(() => ws.gone?.()); }
