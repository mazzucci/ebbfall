// The relay's room: a pure state machine (no sockets, no timers: the adapter calls `connect`, `receive`, `close` and
// `tick(now)`), so the Node server and the Cloudflare Durable Object run the same rules and the tests drive it with a
// fake clock. Design: docs/MULTIPLAYER.md. The relay keeps the clock: once every seat has loaded the game it closes a
// turn (3 ticks, 100 ms) on its own timer, puts the orders it has into the turn `DELAY` ahead, and sends that turn's
// bundle to everyone. It never looks inside an order (the clients decode them) and never needs to know the game's
// build (clients compare hashes).
//
// The protocol (client -> relay): hello {proto, name, token?, next?} (next: the next turn the client expects, when it
// comes back), race {race}, map {map}, ready {ready}, loaded {} (the game is set up: the clock may start), orders
// {w: numbers}, ack {turn, check?: {turn, hash}} (every few turns: the last turn run, and the state hash at the last
// checkpoint turn, a multiple of CHECK_EVERY), ping {id}. Relay -> client: seat, lobby, start {setup, delay, from},
// turn {n, o: [[seat, words], ...]} (its orders run on tick n * 3), away/back/left {seat}, desync {turn}, error
// {code, msg}, pong {id}.

export const PROTO = 1; // the protocol's version: a client of another version is told to update
export const TURN_MS = 100;
export const TICKS_PER_TURN = 3;
export const DELAY = 2; // turns between an order arriving and the turn it runs on
export const CHECK_EVERY = 10; // turns between hash checkpoints
const AWAY_AFTER_MS = 3000; // no ack for this long and a seat is away (the room waits for it)
const BACK_LAG = 10; // an away seat is back once its acks are this close to the clock
const AWAY_BUDGET_MS = 60000; // per seat, per game: how long the others wait for it in all
const CATCH_UP = 5; // turns the clock closes at once after a stall at most (it does not blame anyone for it)
const MAX_ORDER_WORDS = 4096; // numbers a seat may send in one turn
const MAX_ORDER_MSGS = 10; // orders messages a seat may send in one turn
const MAX_NAME = 16;

/** A room of `seats` players. `send(conn, msg)` delivers a message to one connection; `kick(conn)` closes one. */
export class Room {
  constructor({ code, seats = 2, send, kick = () => {}, seed = 1 }) {
    this.code = code; this.send = send; this.kick = kick; this.rng = seed >>> 0 || 1;
    this.seats = Array.from({ length: seats }, () => this.empty());
    this.phase = 'lobby'; // lobby, game, over
    this.map = 0; this.turn = 0; this.log = []; this.inbox = []; this.next = 0; this.paused = false; this.now = 0;
    this.running = false; // (the clock: once every seat has loaded)
  }

  /** A connection says hello. Returns its seat, or -1 (it was told why). */
  connect(conn, hello) {
    if (hello?.proto !== PROTO) { this.send(conn, { t: 'error', code: 'update', msg: 'A new version of Ebbfall is out: update to play' }); return -1; }
    if (this.seats.some(s => s.conn === conn)) return -1; // (a second hello on one connection)
    // Back with its token: the same seat (after a dropped connection or a reload).
    let seat = typeof hello.token === 'string' ? this.seats.findIndex(s => s.token && s.token === hello.token) : -1;
    if (seat < 0) {
      if (this.phase !== 'lobby') { this.send(conn, { t: 'error', code: 'started', msg: 'That game has started' }); return -1; }
      seat = this.seats.findIndex(s => !s.token);
      if (seat < 0) { this.send(conn, { t: 'error', code: 'full', msg: 'That room is full' }); return -1; }
      this.seats[seat].token = token();
    }
    const s = this.seats[seat];
    if (s.conn) { this.send(s.conn, { t: 'error', code: 'replaced', msg: 'Playing on another screen' }); this.kick(s.conn); }
    s.conn = conn; s.lastAck = this.now;
    if (this.phase === 'lobby') s.name = String(hello.name || `Player ${seat + 1}`).slice(0, MAX_NAME);
    this.send(conn, { t: 'seat', seat, token: s.token, room: this.code, proto: PROTO });
    if (this.phase === 'lobby') this.lobby();
    else {
      // Back in a game: every turn from the next one it expects, then on as before, and who else is away or gone.
      const from = Number.isInteger(hello.next) && hello.next >= 0 ? hello.next : 0;
      this.send(conn, { t: 'start', setup: this.setup, delay: DELAY, from });
      for (const b of this.log) if (b.n >= from) this.send(conn, { t: 'turn', ...b });
      this.seats.forEach((x, i) => { if (x.left) this.send(conn, { t: 'left', seat: i }); else if (x.awaySince && i !== seat) this.send(conn, { t: 'away', seat: i }); });
      // (it is back once its acks show it has caught up)
    }
    return seat;
  }

  /** A message from a connection (already parsed JSON). */
  receive(conn, msg) {
    const seat = this.seats.findIndex(s => s.conn === conn);
    if (seat < 0 || !msg || typeof msg !== 'object') return;
    const s = this.seats[seat];
    if (msg.t === 'ping') { this.send(conn, { t: 'pong', id: msg.id }); return; }
    if (this.phase === 'lobby') {
      if (msg.t === 'race' && typeof msg.race === 'string') { s.race = msg.race.slice(0, 16); s.ready = false; this.lobby(); }
      else if (msg.t === 'map' && seat === 0 && Number.isInteger(msg.map) && msg.map >= 0 && msg.map < 16) { this.map = msg.map; this.seats.forEach(x => { x.ready = false; }); this.lobby(); }
      else if (msg.t === 'ready') { s.ready = !!msg.ready; this.lobby(); if (this.seats.every(x => x.conn && x.ready)) this.start(); }
      return;
    }
    if (this.phase !== 'game' || s.left) return; // (a seat that left is not heard)
    if (msg.t === 'loaded') { s.loaded = true; s.lastAck = this.now; return; }
    if (msg.t === 'orders') {
      if (!Array.isArray(msg.w) || !msg.w.every(Number.isFinite)) return;
      if (s.turnMsgs >= MAX_ORDER_MSGS || s.turnWords + msg.w.length > MAX_ORDER_WORDS) return; // (too much this turn)
      s.turnMsgs++; s.turnWords += msg.w.length;
      this.inbox.push([seat, msg.w]);
    } else if (msg.t === 'ack' && Number.isInteger(msg.turn)) {
      s.acked = Math.max(s.acked, Math.min(msg.turn, this.turn + DELAY)); // (no further than turns that exist)
      s.lastAck = this.now; s.loaded = true;
      if (s.awaySince && this.turn - s.acked <= BACK_LAG) this.back(seat);
      const c = msg.check;
      if (c && Number.isInteger(c.turn) && c.turn % CHECK_EVERY === 0 && Number.isInteger(c.hash)) { s.hashes.set(c.turn, c.hash); this.compare(c.turn); }
    }
  }

  /** A connection is gone. */
  close(conn) {
    const seat = this.seats.findIndex(s => s.conn === conn);
    if (seat < 0) return;
    const s = this.seats[seat]; s.conn = null;
    if (this.phase === 'lobby') { this.seats[seat] = this.empty(); this.lobby(); } // (a lobby seat is freed)
    else if (this.phase === 'game') this.away(seat);
  }

  /** The clock: close every turn due by `now` (ms). */
  tick(now) {
    this.now = now;
    if (this.phase !== 'game') return;
    if (!this.running) {
      // (the clock starts once every seat has its game set up, so a slow phone's load costs no one anything)
      if (!this.seats.every(s => s.loaded)) return;
      this.running = true; this.next = now;
      for (const s of this.seats) s.lastAck = now;
    }
    // A seat silent too long, or gone: the room waits for it, within its budget for the game.
    this.seats.forEach((s, i) => {
      if (s.left) return;
      if (!s.awaySince && (!s.conn || now - s.lastAck > AWAY_AFTER_MS)) this.away(i);
      if (s.awaySince && s.away + (now - s.awaySince) > AWAY_BUDGET_MS) this.leave(i);
    });
    this.paused = this.seats.some(s => s.awaySince && !s.left);
    if (this.paused) { this.next = now + TURN_MS; return; }
    if (now - this.next > CATCH_UP * TURN_MS) this.next = now - CATCH_UP * TURN_MS; // (a stall: a few turns, not a burst)
    while (now >= this.next && this.phase === 'game') { this.closeTurn(); this.next += TURN_MS; }
  }

  // ---- inside ----
  empty() {
    // away: ms of its budget used up; awaySince: when it went away (0: here)
    return { conn: null, token: null, name: '', race: 'humans', ready: false, loaded: false, acked: -1, lastAck: 0, hashes: new Map(), away: 0, awaySince: 0, left: false, turnMsgs: 0, turnWords: 0 };
  }
  rand() { let t = (this.rng += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; } // (Mulberry32: the setup's seed and side)
  each(msg) { for (const s of this.seats) if (s.conn) this.send(s.conn, msg); }
  lobby() { this.each({ t: 'lobby', map: this.map, seats: this.seats.map(s => ({ name: s.name, race: s.race, ready: s.ready, here: !!s.conn })) }); }
  start() {
    this.phase = 'game';
    this.setup = { seed: this.rand() % 1000000 + 1, map: this.map, side: this.rand() % 2, races: this.seats.map(s => s.race), names: this.seats.map(s => s.name) };
    this.each({ t: 'start', setup: this.setup, delay: DELAY, from: 0 });
    for (let n = 0; n < DELAY; n++) this.bundle(n, []); // (the first turns can have no orders)
    this.turn = 0;
  }
  closeTurn() {
    const n = this.turn + DELAY, orders = this.inbox; this.inbox = [];
    for (const s of this.seats) { s.turnMsgs = 0; s.turnWords = 0; }
    this.bundle(n, orders);
    this.turn++;
  }
  bundle(n, o) { const b = { n, o }; this.log.push(b); this.each({ t: 'turn', ...b }); }
  away(seat) { const s = this.seats[seat]; if (s.awaySince || s.left) return; s.awaySince = this.now || 1; this.each({ t: 'away', seat }); }
  back(seat) { const s = this.seats[seat]; if (!s.awaySince) return; s.away += Math.max(0, this.now - s.awaySince); s.awaySince = 0; this.each({ t: 'back', seat }); }
  leave(seat) {
    const s = this.seats[seat]; s.left = true; s.awaySince = 0;
    this.inbox.push([seat, [18]]); // (Concede, as an order in the log: replays and rejoins see it)
    this.each({ t: 'left', seat });
  }
  compare(turn) {
    const here = this.seats.filter(s => !s.left);
    const hs = here.map(s => s.hashes.get(turn));
    if (hs.some(h => h === undefined)) return;
    if (hs.some(h => h !== hs[0])) { this.phase = 'over'; this.each({ t: 'desync', turn }); }
    // (checkpoints every seat has passed are done with)
    for (const s of this.seats) for (const t of s.hashes.keys()) if (t <= turn) s.hashes.delete(t);
  }
}

/** A seat token nobody can guess (it takes a seat back). */
function token() {
  const b = new Uint32Array(4); globalThis.crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(36)).join('');
}
