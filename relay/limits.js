// Limits on opening and joining rooms (Notion: Multiplayer design, Security), and the counter behind them and the device
// test's (relay/bench.js): sliding windows per key, in memory (a restart forgets them: a brake, not a ledger). Pure, no
// platform: the Worker (relay/worker.js) and the Node relay (relay/server.mjs) share the numbers and the counter.
//
// An address counts twice: by its own key (an IPv6 /64, an IPv4 address) and, for IPv6, by its /48 too (`wideKey`: a
// site's, which hands out its /64s for free; a household or an office lives in one, so its numbers are a few /64s').
// On Cloudflare the per-address minute is the Workers Rate Limiting bindings' (wrangler.toml [[ratelimits]]: no storage,
// no Durable Object, counted where the request lands, approximate), checked before any room's object is woken; what
// they cannot count one Durable Object counts, `limits` (`Limits`): an address's hour, everyone's rooms (an
// `OpenBudget`: asked once per room opened, told once when its first hello seats someone, so a room nobody sat in costs
// everyone nothing), and everyone's misses (a `MissWatch`: codes that found no room, from every address, reported by
// each Worker isolate in batches, so a miss costs no round trip of its own; past SCAN_MISSES the relay is being scanned,
// and for SCAN_HOLD_MS a network may miss only SCAN_NET_MISSES a minute, asked before each lookup while it lasts). The
// Node relay counts all of it here (`RoomLimits`), for every address but this machine's own.

export const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** Rooms opened per address: a minute's (the CREATE_LIMIT binding) and an hour's (the limits object). */
export const OPEN_PER_MIN = 5, OPEN_PER_HOUR = 30;
/** Rooms opened per IPv6 /48 (four /64s' worth): a minute's (the CREATE_WIDE_LIMIT binding) and an hour's (the limits
 *  object). */
export const WIDE_OPEN_PER_MIN = 20, WIDE_OPEN_PER_HOUR = 120;
/** Rooms opened by everyone (the limits object), counted once someone sits in them: a backstop on what a crowd of
 *  addresses can cost. */
export const ROOMS_PER_MIN = 30, ROOMS_PER_HOUR = 600;
/** Joins by code per address, a minute (the JOIN_LIMIT binding): JOIN_POINTS points; a join costs 1, one that finds no
 *  room MISS_COST in all (the guess's signal): 10 misses a minute, or 40 joins that find their room (a reconnect is one). */
export const JOIN_POINTS = 40, MISS_COST = 4;
/** Joins by code per IPv6 /48, a minute (the JOIN_WIDE_LIMIT binding), at the same prices: 40 misses, or 160 joins. */
export const WIDE_JOIN_POINTS = 160;
/** Everyone's misses: SCAN_MISSES in SCAN_WINDOW_MS is a scan (real players miss a stale link or a typo now and then:
 *  a handful an hour; one /48 at its limit gets there in three minutes), which lasts until SCAN_HOLD_MS after the
 *  count was last that high; while it does, a network (an IPv6 /48, an IPv4 address) may miss SCAN_NET_MISSES a minute
 *  (a typo or two, then the right code, still looks up), and its next lookup is refused until its minute is up. A
 *  link's code finds its room: never refused for others' misses. */
export const SCAN_MISSES = 120, SCAN_WINDOW_MS = 5 * MINUTE, SCAN_HOLD_MS = 30 * MINUTE, SCAN_NET_MISSES = 3;
/** A Worker isolate's misses go to the limits object in one report at most once a MISS_FLUSH_MS (at the first miss
 *  after that long), at most MISS_BATCH in one; during a scan each at once, with its network. */
export const MISS_FLUSH_MS = 5000, MISS_BATCH = 1000;
/** What a refused player is told (error `limit`). */
export const SAY = {
  minute: 'Too many tries: wait a minute and try again',
  hour: 'Too many new rooms from here: try again in an hour',
  busy: 'Lots of rooms are opening right now: wait a minute and try again',
};
/** The headers of a request to the limits object: its address's key; a report's misses; the answer's scan (1 or 0). */
export const KEY_HEADER = 'X-Limit-Key', MISSES_HEADER = 'X-Misses', SCAN_HEADER = 'X-Scan';
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

/** The wider key an address also counts under, from its key (addressKey's): an IPv6 /64's /48 (`2001:db8:1/48`), or ''
 *  (an IPv4 address: no wider tier). */
export function wideKey(key) {
  const g = String(key || '').split(':');
  return g.length === 4 ? `${g.slice(0, 3).join(':')}/48` : '';
}
/** The network a miss counts against during a scan: an address's /48, or the address (IPv4). */
export const netKey = (key) => wideKey(key) || key;

/** At most `max` in any `ms` for each rule, per key; `now()` the clock (a fake one in the tests). */
export class Limiter {
  constructor(rules, now = () => Date.now()) {
    this.rules = rules; this.now = now; this.span = Math.max(...rules.map(r => r.ms)); this.keys = new Map(); this.swept = now();
  }
  /** A key's times within the longest window, oldest first. The keys with nothing in it are forgotten once a window
   *  (an address is held at most two windows after its last try), or at once when there are many. */
  times(key, now) {
    if (this.keys.size > MAX_KEYS || now - this.swept >= this.span) {
      this.swept = now;
      for (const [k, t] of this.keys) if (!t.length || now - t[t.length - 1] >= this.span) this.keys.delete(k);
    }
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

/** What the bindings cannot count about rooms: an address's (and its /48's) rooms in an hour, and everyone's (a minute's,
 *  an hour's), counted once someone sits in them. Part of Limits (on Cloudflare, the object named `limits`) and of
 *  RoomLimits (Node). */
export class OpenBudget {
  constructor(now) {
    this.ips = new Limiter([{ ms: HOUR, max: OPEN_PER_HOUR }], now);
    this.wide = new Limiter([{ ms: HOUR, max: WIDE_OPEN_PER_HOUR }], now);
    this.all = new Limiter([{ ms: MINUTE, max: ROOMS_PER_MIN }, { ms: HOUR, max: ROOMS_PER_HOUR }], now);
  }
  /** A room from address `key`: '' (counted for the address and its /48; everyone's waits for a seat), or what to tell
   *  the player (nothing counted). */
  open(key) {
    const w = wideKey(key);
    if (this.ips.check(key) || (w && this.wide.check(w))) return SAY.hour;
    if (this.all.check('')) return SAY.busy;
    this.ips.count(key); if (w) this.wide.count(w);
    return '';
  }
  /** A room's first hello seated someone: it counts in everyone's. */
  seated() { this.all.count(''); }
}

/** Everyone's misses (codes that found no room), and while they say the relay is being scanned, each network's. Part of
 *  Limits and of RoomLimits. */
export class MissWatch {
  constructor(now = () => Date.now()) {
    this.now = now; this.until = -Infinity; // (a scan lasts until then)
    this.buckets = []; // (everyone's misses by the 10 seconds, [start, count], oldest first: a scan's millions cost a few numbers)
    this.nets = new Limiter([{ ms: MINUTE, max: SCAN_NET_MISSES }], now);
  }
  /** Is the relay being scanned? */
  get scanning() { return this.now() < this.until; }
  /** Everyone's misses in the last SCAN_WINDOW_MS (to the 10 seconds). */
  get count() {
    const now = this.now();
    while (this.buckets.length && now - this.buckets[0][0] >= SCAN_WINDOW_MS) this.buckets.shift();
    return this.buckets.reduce((sum, b) => sum + b[1], 0);
  }
  /** `n` misses (from network `net`, if known: counted against it while a scan lasts). Returns `scanning`. */
  miss(n = 1, net = '') {
    n = Math.min(Math.max(0, Math.floor(n) || 0), MISS_BATCH);
    const at = this.now() - this.now() % 10000, last = this.buckets.at(-1);
    if (last?.[0] === at) last[1] += n; else this.buckets.push([at, n]);
    if (this.count >= SCAN_MISSES) this.until = this.now() + SCAN_HOLD_MS;
    if (net && this.scanning) this.nets.count(net);
    return this.scanning;
  }
  /** May network `net` look a code up (always, but during a scan once it has missed its share this minute)? */
  look(net) { return !this.scanning || !this.nets.check(net); }
}

/** The limits object (relay/worker.js, the Durable Object named `limits`; in memory): POST /open (a room from the address
 *  in KEY_HEADER: 204, or 429 with what to say), /seated (204), /miss (MISSES_HEADER misses, from the network in
 *  KEY_HEADER if any: 204) and /look (the network in KEY_HEADER: 204, or 429); /miss and /look answer whether the relay
 *  is being scanned in SCAN_HEADER. */
export class Limits {
  constructor(now) { this.budget = new OpenBudget(now); this.misses = new MissWatch(now); }
  async fetch(req) {
    const path = new URL(req.url).pathname, key = req.headers.get(KEY_HEADER) || '';
    const scan = (status) => new Response(status === 429 ? SAY.minute : null, { status, headers: { [SCAN_HEADER]: this.misses.scanning ? '1' : '0' } });
    if (path === '/seated') { this.budget.seated(); return new Response(null, { status: 204 }); }
    if (path === '/miss') { this.misses.miss(Number(req.headers.get(MISSES_HEADER)), key); return scan(204); }
    if (path === '/look') return scan(this.misses.look(key) ? 204 : 429);
    const no = this.budget.open(key);
    return no ? new Response(no, { status: 429 }) : new Response(null, { status: 204 });
  }
}

/** Every room limit in one place, in memory (the Node relay): opening (a minute's, then OpenBudget; everyone's counted at
 *  the first seat) and joining (a minute's, then MissWatch). */
export class RoomLimits {
  constructor(now) {
    this.opens = new Limiter([{ ms: MINUTE, max: OPEN_PER_MIN }], now);
    this.wideOpens = new Limiter([{ ms: MINUTE, max: WIDE_OPEN_PER_MIN }], now);
    this.joins = new Limiter([{ ms: MINUTE, max: JOIN_POINTS }], now);
    this.wideJoins = new Limiter([{ ms: MINUTE, max: WIDE_JOIN_POINTS }], now);
    this.budget = new OpenBudget(now);
    this.misses = new MissWatch(now);
  }
  /** A room from `key`: '' (counted), or what to say. */
  open(key) {
    const w = wideKey(key);
    if (this.opens.check(key) || (w && this.wideOpens.check(w))) return SAY.minute;
    this.opens.count(key); if (w) this.wideOpens.count(w);
    return this.budget.open(key);
  }
  /** A room opened from a counted address seated its first player. */
  seated() { this.budget.seated(); }
  /** A join from `key` may try a code (a point counted). */
  join(key) {
    const w = wideKey(key);
    if (this.joins.check(key) || (w && this.wideJoins.check(w))) return false;
    this.joins.count(key); if (w) this.wideJoins.count(w);
    if (this.misses.look(netKey(key))) return true;
    this.joins.count(key, MISS_COST - 1); if (w) this.wideJoins.count(w, MISS_COST - 1); // (refused in a scan: priced as a guess)
    return false;
  }
  /** Its code found no room: the rest of a miss's cost, and everyone's count. */
  miss(key) {
    const w = wideKey(key);
    this.joins.count(key, MISS_COST - 1); if (w) this.wideJoins.count(w, MISS_COST - 1);
    this.misses.miss(1, netKey(key));
  }
}
