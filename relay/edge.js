// The relay Worker's front door (relay/worker.js is its entry module, Notion: Multiplayer design, Security): GET /version, the
// device test's reports, and every WebSocket to its room's Durable Object (?room=CODE, or ?new=1 to open a room), past
// the Origin check and the limits, per address (CF-Connecting-IP, an IPv6 /64, and its /48), checked before any room's
// object is woken: opening a room, the CREATE_LIMIT and CREATE_WIDE_LIMIT bindings (a minute's), then the limits
// object (the spend ceiling's rooms at once and month's room-hours, then an hour's, and everyone's: a room counts
// there once its first hello seats someone, relay/worker.js; the ceiling's lease reserved for it goes with it); joining
// by code, the JOIN_LIMIT and JOIN_WIDE_LIMIT bindings (a point a join, MISS_COST in all for one that finds no room),
// then, only while the limits object says the relay is being scanned, its word on the network (relay/limits.js
// MissWatch). Misses are tallied here, per isolate, and reported to the limits object in batches (`Misses`). The numbers
// are relay/limits.js's (wrangler.toml's bindings: a test keeps them equal). A refusal is a socket that says `error
// {code: 'limit'}` and closes: a page cannot read the HTTP status a WebSocket was refused with (it sees only a failed
// connection, and would retry), and the player must be told to wait. A binding or the limits object failing: the
// request goes on (the limits must never be what takes multiplayer down).
import { benchRequest } from './bench.js';
import { versionRequest } from './version.js';
import { addressKey, wideKey, netKey, KEY_HEADER, MISSES_HEADER, SCAN_HEADER, LEASE_HEADER, MISS_COST, MISS_FLUSH_MS, MISS_BATCH, MINUTE, SAY } from './limits.js';
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

/** An address's verdict from a binding and its wide one (`wide` '': none): false if either says no (the wide one not
 *  asked once the first has). */
const bothWithin = async (binding, key, wideBinding, wide, points = 1) =>
  (await within(binding, key, points)) && (!wide || await within(wideBinding, wide, points));

/** A request to the limits object (`path`, headers); null when it cannot be asked. */
async function limitsObject(env, path, headers) {
  try { return await env.ROOMS.get(env.ROOMS.idFromName('limits')).fetch(new Request(`https://limits${path}`, { method: 'POST', headers })); } catch { return null; }
}

/** An isolate's misses: tallied, and sent to the limits object at the first miss MISS_FLUSH_MS after the last report (a
 *  typo now and then costs no round trip of its own; a scan, one report an isolate a few seconds); what it answers, the
 *  relay being scanned or not, kept. During a scan, every lookup asks the limits object first (a network it refused is
 *  refused here for the rest of the minute, without asking again), and every miss is reported at once with its
 *  network. `now` the clock. */
export class Misses {
  constructor(now = () => Date.now()) { this.now = now; this.scanning = false; this.pending = 0; this.since = 0; this.barred = new Map(); }
  heard(res) {
    if (res?.headers.has(SCAN_HEADER)) this.scanning = res.headers.get(SCAN_HEADER) === '1';
    if (!this.scanning) this.barred.clear();
    return res;
  }
  /** May network `net` look a code up (yes when not scanning, or when the limits object cannot be asked)? */
  async look(env, net) {
    if (!this.scanning) return true;
    if ((this.barred.get(net) ?? -Infinity) > this.now()) return false;
    const res = this.heard(await limitsObject(env, '/look', { [KEY_HEADER]: net }));
    if (res?.status !== 429) return true;
    if (this.barred.size >= 5000) this.barred.clear(); // (a brake, not a ledger: the limits object still knows)
    this.barred.set(net, this.now() + MINUTE);
    return false;
  }
  /** A code from network `net` found no room. Returns the report to wait for, if one is sent. */
  miss(env, net) {
    if (this.scanning) return this.report(env, 1, net);
    if (!this.pending) this.since = this.now();
    this.pending++;
    if (this.now() - this.since < MISS_FLUSH_MS && this.pending < MISS_BATCH) return null;
    const n = this.pending; this.pending = 0;
    return this.report(env, n, '');
  }
  async report(env, n, net) {
    this.heard(await limitsObject(env, '/miss', { [MISSES_HEADER]: String(n), ...(net ? { [KEY_HEADER]: net } : {}) }));
  }
}

/** The Worker, on a platform (Cloudflare's; the tests' fakes); `now` the misses' clock. */
export function relay(platform = CLOUDFLARE, now) {
  const misses = new Misses(now);
  /** A socket that says one error and closes (no room's object woken). */
  const refuse = (code, msg) => {
    const [client, ws] = platform.pair();
    ws.accept(); send(ws, { t: 'error', code, msg }); try { ws.close(1000); } catch { /* closed */ }
    return platform.respond(client);
  };
  return {
    async fetch(req, env, ctx) {
      const version = versionRequest(req, env.RELAY_BUILD);
      if (version) return version;
      const ip = req.headers.get('CF-Connecting-IP') || '';
      const bench = await benchRequest(req, { origins: env.ORIGINS, ip, store: (r) => env.ROOMS.get(env.ROOMS.idFromName('bench')).fetch(r) });
      if (bench) return bench;
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Ebbfall relay: WebSocket only', { status: 426 });
      if (!allowed(req, env)) return new Response('Not from here', { status: 403 });
      const q = new URL(req.url).searchParams, key = addressKey(ip), wide = wideKey(key);
      const room = (code, isNew, lease = '') => env.ROOMS.get(env.ROOMS.idFromName(code))
        .fetch(new Request(`https://room/?code=${code}${isNew ? '&new=1' : ''}${lease ? `&lease=${encodeURIComponent(lease)}` : ''}`, { headers: req.headers }));
      if (q.get('new')) {
        if (!(await bothWithin(env.CREATE_LIMIT, key, env.CREATE_WIDE_LIMIT, wide))) return refuse('limit', SAY.minute);
        const { no, lease } = await budget(env, key);
        if (no) return refuse('limit', no); // (SAY.full past the spend ceiling: a client of PROTO 7 shows the words)
        for (let i = 0; i < TRIES; i++) {
          const res = await room(newCode(), true, lease);
          if (res.status !== 409) return res; // (409: that code is in use, another one)
        }
        return new Response('No free room code', { status: 503 });
      }
      const typed = q.get('room') || '';
      // (a code of the first format comes from a client from before PROTO 7, whose hello the room would refuse anyway:
      // told to update now, rather than "no room")
      if (oldCode(typed)) return refuse('update', 'Ebbfall has an update. Tap UPDATE to get it');
      if (!(await bothWithin(env.JOIN_LIMIT, key, env.JOIN_WIDE_LIMIT, wide))) return refuse('limit', SAY.minute);
      if (!(await misses.look(env, netKey(key)))) { // (a scan: this network has missed its share; priced as a guess)
        await Promise.all([within(env.JOIN_LIMIT, key, MISS_COST - 1), wide && within(env.JOIN_WIDE_LIMIT, wide, MISS_COST - 1)]);
        return refuse('limit', SAY.minute);
      }
      const code = parseCode(typed), res = code ? await room(code, false) : null;
      if (res && res.status !== 404) return res;
      await Promise.all([within(env.JOIN_LIMIT, key, MISS_COST - 1), wide && within(env.JOIN_WIDE_LIMIT, wide, MISS_COST - 1)]); // (no such room: a guess's price)
      const report = misses.miss(env, netKey(key));
      if (report) { if (ctx?.waitUntil) ctx.waitUntil(report); else await report; } // (the player is told now; the report after)
      return refuse('noroom', 'No room with that code');
    },
  };
}

/** The limits object's word on a room from `key`: `no` '' (go on; also when it cannot be asked) with the `lease` the
 *  spend ceiling reserved for it (the room claims it: relay/limits.js Ceiling), or `no` what to say. */
async function budget(env, key) {
  try {
    const res = await limitsObject(env, '/open', { [KEY_HEADER]: key });
    if (res?.status === 429) return { no: await res.text(), lease: '' };
    return { no: '', lease: res?.headers.get(LEASE_HEADER) || '' };
  } catch { return { no: '', lease: '' }; }
}

export function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* closed meanwhile */ } }
