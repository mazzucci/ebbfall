// The relay Worker's front door (relay/worker.js is its entry module, docs/MULTIPLAYER.md, Security): GET /version, the
// device test's reports, and every WebSocket to its room's Durable Object (?room=CODE, or ?new=1 to open a room), past
// the Origin check and the limits, per address (CF-Connecting-IP, an IPv6 /64), checked before any room's object is
// woken: opening a room, the CREATE_LIMIT binding (a minute's), then the limits object (an hour's, and everyone's);
// joining by code, the JOIN_LIMIT binding (a point a join, MISS_COST in all for one that finds no room). The numbers
// are relay/limits.js's (wrangler.toml's bindings: a test keeps them equal). A refusal is a socket that says `error
// {code: 'limit'}` and closes: a page cannot read the HTTP status a WebSocket was refused with (it sees only a failed
// connection, and would retry), and the player must be told to wait. A binding or the limits object failing: the
// request goes on (the limits must never be what takes multiplayer down).
import { benchRequest } from './bench.js';
import { versionRequest } from './version.js';
import { addressKey, KEY_HEADER, MISS_COST, SAY } from './limits.js';
import { newCode as makeCode, parseCode, oldCode } from '../src/net/roomcode.js';

export const ROOM_IDLE_MS = 10 * 60 * 1000; // a room nobody has been in this long is free for a new one with its code
const TRIES = 8; // codes tried for a new room

const random = () => crypto.getRandomValues(new Uint32Array(1))[0];
const newCode = () => makeCode(random);
const allowed = (req, env) => !env.ORIGINS || env.ORIGINS.split(',').includes(req.headers.get('Origin'));

/** The platform's WebSocket pair and upgrade response (replaced by fakes in the tests). */
export const CLOUDFLARE = {
  pair: () => Object.values(new WebSocketPair()),
  respond: (client) => new Response(null, { status: 101, webSocket: client }),
};

/** A binding's verdict for `key` (`points` of it): false only when it says no (none bound, or an error: yes). */
async function within(binding, key, points = 1) {
  if (!binding) return true;
  try { return (await Promise.all(Array.from({ length: points }, () => binding.limit({ key })))).every(r => r.success); } catch { return true; }
}

/** The Worker, on a platform (Cloudflare's; the tests' fakes). */
export function relay(platform = CLOUDFLARE) {
  /** A socket that says one error and closes (no room's object woken). */
  const refuse = (code, msg) => {
    const [client, ws] = platform.pair();
    ws.accept(); send(ws, { t: 'error', code, msg }); try { ws.close(1000); } catch { /* closed */ }
    return platform.respond(client);
  };
  return {
    async fetch(req, env) {
      const version = versionRequest(req, env.RELAY_BUILD);
      if (version) return version;
      const ip = req.headers.get('CF-Connecting-IP') || '';
      const bench = await benchRequest(req, { origins: env.ORIGINS, ip, store: (r) => env.ROOMS.get(env.ROOMS.idFromName('bench')).fetch(r) });
      if (bench) return bench;
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Ebbfall relay: WebSocket only', { status: 426 });
      if (!allowed(req, env)) return new Response('Not from here', { status: 403 });
      const q = new URL(req.url).searchParams, key = addressKey(ip);
      const room = (code, isNew) => env.ROOMS.get(env.ROOMS.idFromName(code))
        .fetch(new Request(`https://room/?code=${code}${isNew ? '&new=1' : ''}`, { headers: req.headers }));
      if (q.get('new')) {
        if (!(await within(env.CREATE_LIMIT, key))) return refuse('limit', SAY.minute);
        const no = await budget(env, key);
        if (no) return refuse('limit', no);
        for (let i = 0; i < TRIES; i++) {
          const res = await room(newCode(), true);
          if (res.status !== 409) return res; // (409: that code is in use, another one)
        }
        return new Response('No free room code', { status: 503 });
      }
      const typed = q.get('room') || '';
      // (a code of the first format comes from a client from before PROTO 6, whose hello the room would refuse anyway:
      // told to update now, rather than "no room")
      if (oldCode(typed)) return refuse('update', 'Ebbfall has an update. Tap UPDATE to get it');
      if (!(await within(env.JOIN_LIMIT, key))) return refuse('limit', SAY.minute);
      const code = parseCode(typed), res = code ? await room(code, false) : null;
      if (res && res.status !== 404) return res;
      await within(env.JOIN_LIMIT, key, MISS_COST - 1); // (no such room: a guess's price)
      return refuse('noroom', 'No room with that code');
    },
  };
}

/** The limits object's word on a room from `key`: '' (go on; also when it cannot be asked), or what to say. */
async function budget(env, key) {
  try {
    const res = await env.ROOMS.get(env.ROOMS.idFromName('limits')).fetch(new Request('https://limits/', { method: 'POST', headers: { [KEY_HEADER]: key } }));
    return res.status === 429 ? await res.text() : '';
  } catch { return ''; }
}

export function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* closed meanwhile */ } }
