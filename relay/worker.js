// The relay on Cloudflare (docs/MULTIPLAYER.md, M3d): a Worker that sends each WebSocket to its room's Durable Object,
// one object per room code, which runs relay/room.js's rules (the same as relay/server.mjs's, which is the Node
// adapter). A client connects to wss://host/?room=CODE (or ?new=1 to open a room) and says hello. Config and deploy:
// relay/wrangler.toml.
import { Room, TURN_MS } from './room.js';

const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // (no vowels: no words; no look-alikes)
const MAX_MSG = 64 * 1024;
const HELLO_MS = 10000; // a connection that has not said hello by then is closed
const ROOM_IDLE_MS = 10 * 60 * 1000; // a room nobody has been in this long is free for a new one with its code
const TRIES = 8; // codes tried for a new room

const random = () => crypto.getRandomValues(new Uint32Array(1))[0];
const newCode = () => Array.from({ length: 4 }, () => ALPHABET[random() % ALPHABET.length]).join('');
const allowed = (req, env) => !env.ORIGINS || env.ORIGINS.split(',').includes(req.headers.get('Origin'));

export default {
  async fetch(req, env) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Ebbfall relay: WebSocket only', { status: 426 });
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

/** A room's Durable Object: its Room, its connections, and the clock while anyone is connected. */
export class RoomObject {
  constructor(state, env, platform = CLOUDFLARE) {
    this.platform = platform; this.room = null; this.conns = new Set(); this.timer = null; this.lastUsed = 0;
  }

  async fetch(req) {
    const q = new URL(req.url).searchParams;
    if (q.get('new')) {
      if (this.room && (this.conns.size || Date.now() - this.lastUsed < ROOM_IDLE_MS)) return new Response('Taken', { status: 409 });
      this.room = new Room({ code: q.get('code'), send, kick, seed: random() });
    }
    const [client, ws] = this.platform.pair();
    ws.accept();
    this.attach(ws);
    return this.platform.respond(client);
  }

  attach(ws) {
    const room = this.room;
    if (!room) { send(ws, { t: 'error', code: 'noroom', msg: 'No such room' }); kick(ws); return; }
    this.conns.add(ws); this.lastUsed = Date.now();
    if (!this.timer) this.timer = setInterval(() => room.tick(Date.now()), TURN_MS / 4);
    let seated = false;
    const silent = setTimeout(() => { if (!seated) kick(ws); }, HELLO_MS);
    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data.length > MAX_MSG) { kick(ws); return; }
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      this.lastUsed = Date.now();
      if (!seated) { seated = room.connect(ws, msg) >= 0; if (!seated) kick(ws); return; }
      room.receive(ws, msg);
    });
    const gone = () => {
      if (!this.conns.delete(ws)) return;
      clearTimeout(silent); room.close(ws); this.lastUsed = Date.now();
      if (!this.conns.size) { clearInterval(this.timer); this.timer = null; } // (nobody here: the clock waits)
    };
    ws.gone = gone; // (a kick cleans up at once: closing a socket from this side need not fire its close event)
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }
}

function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* closed meanwhile */ } }
function kick(ws) { try { ws.close(1000); } catch { /* closed already */ } ws.gone?.(); }
