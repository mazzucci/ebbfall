// Limits on opening and joining rooms (docs/MULTIPLAYER.md, Security), and the counter behind them and the device
// test's (relay/bench.js): sliding windows per key, in memory (a restart forgets them: a brake, not a ledger). Pure, no
// platform: the Worker (relay/worker.js) and the Node relay (relay/server.mjs) share the numbers and the counter.
//
// On Cloudflare the per-address minute is the Workers Rate Limiting bindings' (wrangler.toml [[ratelimits]]: no storage,
// no Durable Object, counted where the request lands, approximate), checked before any room's object is woken; what
// they cannot count (an address's hour, and everyone's rooms, which no one Cloudflare location sees whole) one Durable
// Object counts, `limits`, an `OpenBudget`, asked once per room opened (never on a join). The Node relay counts all of
// it here (`RoomLimits`), for every address but this machine's own.

export const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** Rooms opened per address: a minute's (the CREATE_LIMIT binding) and an hour's (the limits object). */
export const OPEN_PER_MIN = 5, OPEN_PER_HOUR = 30;
/** Rooms opened by everyone (the limits object): a backstop on what a crowd of addresses can cost. */
export const ROOMS_PER_MIN = 30, ROOMS_PER_HOUR = 600;
/** Joins by code per address, a minute (the JOIN_LIMIT binding): JOIN_POINTS points; a join costs 1, one that finds no
 *  room MISS_COST in all (the guess's signal): 10 misses a minute, or 40 joins that find their room (a reconnect is one). */
export const JOIN_POINTS = 40, MISS_COST = 4;
/** What a refused player is told (error `limit`). */
export const SAY = {
  minute: 'Too many tries: wait a minute and try again',
  hour: 'Too many new rooms from here: try again in an hour',
  busy: 'Lots of rooms are opening right now: wait a minute and try again',
};
/** The header a request to the limits object carries its address in. */
export const KEY_HEADER = 'X-Limit-Key';
const MAX_KEYS = 5000; // (past this many, the keys with nothing in their windows are forgotten)

/** The key an address counts under: an IPv6 address by its /64 (one line's: a provider hands out a /64 or more), an
 *  IPv4 one (also IPv4-mapped IPv6, as Node reports it) as is. */
export function addressKey(ip) {
  const a = String(ip || '').trim().toLowerCase().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  if (!a.includes(':')) return a;
  const [head, tail] = a.split('::');
  const h = head ? head.split(':') : [], t = tail === undefined ? null : tail ? tail.split(':') : [];
  const groups = t ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '') || '0').join(':');
}

/** At most `max` in any `ms` for each rule, per key; `now()` the clock (a fake one in the tests). */
export class Limiter {
  constructor(rules, now = () => Date.now()) {
    this.rules = rules; this.now = now; this.span = Math.max(...rules.map(r => r.ms)); this.keys = new Map();
  }
  /** A key's times within the longest window, oldest first. */
  times(key, now) {
    if (this.keys.size > MAX_KEYS) for (const [k, t] of this.keys) if (!t.length || now - t[t.length - 1] >= this.span) this.keys.delete(k);
    let t = this.keys.get(key);
    if (!t) this.keys.set(key, t = []);
    while (t.length && now - t[0] >= this.span) t.shift();
    return t;
  }
  /** The rule `n` more for `key` would break now (nothing counted), or null. */
  check(key, n = 1) {
    const now = this.now(), t = this.times(key, now);
    return this.rules.find(r => { let k = t.length; while (k > 0 && now - t[k - 1] < r.ms) k--; return t.length - k + n > r.max; }) || null;
  }
  /** Count `n` for `key`, now. */
  count(key, n = 1) { const now = this.now(), t = this.times(key, now); for (let i = 0; i < n; i++) t.push(now); }
  /** Count `n` for `key` if no rule forbids it: true (counted), else false. */
  take(key, n = 1) { if (this.check(key, n)) return false; this.count(key, n); return true; }
}

/** A Rate Limiting binding's `limit({key})` over a Limiter: `limit` a `period` (s). The Node relay's stand-in, and the
 *  tests'. */
export function rateLimit(limit, period, now) {
  const l = new Limiter([{ ms: period * 1000, max: limit }], now);
  return { limit: async ({ key }) => ({ success: l.take(key) }) };
}

/** What the bindings cannot count: an address's rooms in an hour, and everyone's (a minute's, an hour's). On
 *  Cloudflare the Durable Object named `limits` (`fetch`); in Node, part of RoomLimits. */
export class OpenBudget {
  constructor(now) {
    this.ips = new Limiter([{ ms: HOUR, max: OPEN_PER_HOUR }], now);
    this.all = new Limiter([{ ms: MINUTE, max: ROOMS_PER_MIN }, { ms: HOUR, max: ROOMS_PER_HOUR }], now);
  }
  /** A room from address `key`: '' (counted), or what to tell the player (nothing counted). */
  open(key) {
    if (this.ips.check(key)) return SAY.hour;
    if (this.all.check('')) return SAY.busy;
    this.ips.count(key); this.all.count('');
    return '';
  }
  /** The limits object's one request (relay/worker.js): POST, the address in KEY_HEADER; 204, or 429 with what to say. */
  async fetch(req) {
    const no = this.open(req.headers.get(KEY_HEADER) || '');
    return no ? new Response(no, { status: 429 }) : new Response(null, { status: 204 });
  }
}

/** Every room limit in one place, in memory (the Node relay): opening (a minute's, then OpenBudget) and joining. */
export class RoomLimits {
  constructor(now) {
    this.opens = new Limiter([{ ms: MINUTE, max: OPEN_PER_MIN }], now);
    this.joins = new Limiter([{ ms: MINUTE, max: JOIN_POINTS }], now);
    this.budget = new OpenBudget(now);
  }
  /** A room from `key`: '' (counted), or what to say. */
  open(key) { return this.opens.take(key) ? this.budget.open(key) : SAY.minute; }
  /** A join from `key` may try a code (a point counted). */
  join(key) { return this.joins.take(key); }
  /** Its code found no room: the rest of a miss's cost. */
  miss(key) { this.joins.count(key, MISS_COST - 1); }
}
