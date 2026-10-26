// The relay's room: a pure state machine (no sockets, no timers: the adapter calls `connect`, `receive`, `close` and
// `tick(now)`), so the Node server and the Cloudflare Durable Object run the same rules and the tests drive it with a
// fake clock. Design: docs/MULTIPLAYER.md. The relay keeps the clock: it closes a turn (3 ticks, 100 ms) on its own
// timer, stamps the orders it has into the turn `delay` ahead, and sends that turn's bundle to everyone. It never
// looks inside an order (the clients decode them) and never needs to know the game's build (clients compare hashes).

export const PROTO = 1; // the protocol's version: a client of another version is told to update
export const TURN_MS = 100;
export const TICKS_PER_TURN = 3;
export const DELAY = 2; // turns between an order arriving and the turn it runs on
const ACK_LAG = 10; // turns a seat may fall behind the clock before the room waits for it
const AWAY_BUDGET_MS = 60000; // per seat, per game: how long the others wait for it in all
const MAX_ORDER_WORDS = 4096; // numbers in one orders message
const MAX_NAME = 16;

/** A room of `seats` players. `send(conn, msg)` delivers a message to one connection (the adapter's). */
export class Room {
  constructor({ code, seats = 2, send, seed = 1 }) {
    this.code = code; this.send = send; this.rng = seed >>> 0 || 1;
    // away: ms of its budget used up; awaySince: when it went away (0: here)
    this.seats = Array.from({ length: seats }, () => ({ conn: null, token: null, name: '', race: 'humans', ready: false, acked: -1, hashes: new Map(), away: 0, awaySince: 0, left: false }));
    this.phase = 'lobby'; // lobby, game, over
    this.map = 0; this.turn = 0; this.log = []; this.inbox = []; this.next = 0; this.paused = false; this.now = 0;
  }

  /** A connection says hello. Returns its seat, or -1 (it was told why). */
  connect(conn, hello) {
    if (hello?.proto !== PROTO) { this.send(conn, { t: 'error', code: 'update', msg: 'A new version of Ebbfall is out: update to play' }); return -1; }
    // Back with its token: the same seat (after a dropped connection or a reload).
    let seat = hello.token ? this.seats.findIndex(s => s.token === hello.token) : -1;
    if (seat < 0) {
      if (this.phase !== 'lobby') { this.send(conn, { t: 'error', code: 'started', msg: 'That game has started' }); return -1; }
      seat = this.seats.findIndex(s => !s.token);
      if (seat < 0) { this.send(conn, { t: 'error', code: 'full', msg: 'That room is full' }); return -1; }
      this.seats[seat].token = this.token();
    }
    const s = this.seats[seat];
    if (s.conn && s.conn !== conn) this.send(s.conn, { t: 'error', code: 'replaced', msg: 'Playing on another screen' });
    s.conn = conn; s.name = String(hello.name || `Player ${seat + 1}`).slice(0, MAX_NAME);
    this.send(conn, { t: 'seat', seat, token: s.token, room: this.code, proto: PROTO });
    if (this.phase === 'lobby') this.lobby();
    else {
      // Back in a game: everything since the last turn it ran, then on as before.
      const from = Math.max(0, (hello.lastTurn ?? -1) + 1);
      this.send(conn, { t: 'start', setup: this.setup, delay: DELAY, resume: from });
      for (const b of this.log) if (b.n >= from) this.send(conn, { t: 'turn', ...b });
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
    if (this.phase !== 'game') return;
    if (msg.t === 'orders' && Array.isArray(msg.w) && msg.w.length <= MAX_ORDER_WORDS && msg.w.every(Number.isFinite)) this.inbox.push([seat, msg.w]);
    else if (msg.t === 'ack' && Number.isInteger(msg.turn)) {
      s.acked = Math.max(s.acked, msg.turn);
      if (s.awaySince && s.conn && this.turn - s.acked <= ACK_LAG) this.back(seat);
      if (Number.isInteger(msg.hash)) { s.hashes.set(msg.turn, msg.hash); this.compare(msg.turn); }
    }
  }

  /** A connection is gone. */
  close(conn) {
    const seat = this.seats.findIndex(s => s.conn === conn);
    if (seat < 0) return;
    const s = this.seats[seat]; s.conn = null;
    if (this.phase === 'lobby') { s.token = null; s.ready = false; this.lobby(); } // (a lobby seat is freed)
    else if (this.phase === 'game') this.away(seat);
  }

  /** The clock: close every turn due by `now` (ms). */
  tick(now) {
    this.now = now;
    if (this.phase !== 'game') return;
    if (this.next === 0) this.next = now;
    // A seat that is gone or far behind: the room waits for it, within its budget for the game.
    this.seats.forEach((s, i) => {
      if (s.left) return;
      if (!s.awaySince && (!s.conn || this.turn - s.acked > ACK_LAG + DELAY)) this.away(i);
      if (s.awaySince && s.away + (now - s.awaySince) > AWAY_BUDGET_MS) this.leave(i);
    });
    this.paused = this.seats.some(s => s.awaySince && !s.left);
    if (this.paused) { this.next = now + TURN_MS; return; }
    while (now >= this.next && this.phase === 'game') { this.closeTurn(); this.next += TURN_MS; }
  }

  // ---- inside ----
  token() { return Array.from({ length: 4 }, () => (this.rand() >>> 0).toString(36)).join(''); }
  rand() { let t = (this.rng += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; } // (Mulberry32)
  each(msg) { for (const s of this.seats) if (s.conn) this.send(s.conn, msg); }
  lobby() { this.each({ t: 'lobby', map: this.map, seats: this.seats.map(s => ({ name: s.name, race: s.race, ready: s.ready, here: !!s.conn })) }); }
  start() {
    this.phase = 'game';
    this.setup = { seed: this.rand() % 1000000 + 1, map: this.map, side: this.rand() % 2, races: this.seats.map(s => s.race), names: this.seats.map(s => s.name) };
    this.each({ t: 'start', setup: this.setup, delay: DELAY, resume: 0 });
    for (let n = 0; n < DELAY; n++) this.bundle(n, []); // (the first turns can have no orders)
    this.turn = 0;
  }
  closeTurn() {
    const n = this.turn + DELAY, orders = this.inbox; this.inbox = [];
    this.bundle(n, orders);
    this.turn++;
  }
  bundle(n, o) { const b = { n, o }; this.log.push(b); this.each({ t: 'turn', ...b }); }
  away(seat) { const s = this.seats[seat]; if (s.awaySince || s.left) return; s.awaySince = this.now || 1; this.each({ t: 'away', seat }); }
  back(seat) { const s = this.seats[seat]; if (!s.awaySince) return; s.away += (this.now || 0) - s.awaySince; s.awaySince = 0; this.each({ t: 'back', seat }); }
  leave(seat) {
    const s = this.seats[seat]; s.left = true; s.awaySince = 0;
    this.inbox.push([seat, [18]]); // (Concede, as an order in the log: replays and rejoins see it)
    this.each({ t: 'left', seat });
  }
  compare(turn) {
    const hs = this.seats.filter(s => !s.left).map(s => s.hashes.get(turn));
    if (hs.some(h => h === undefined)) return;
    if (hs.some(h => h !== hs[0])) { this.phase = 'over'; this.each({ t: 'desync', turn }); }
    for (const s of this.seats) s.hashes.delete(turn);
  }
}
