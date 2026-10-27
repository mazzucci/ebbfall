// The relay's room: a pure state machine (no sockets, no timers: the adapter calls `connect`, `receive`, `close` and
// `tick(now)`), so the Node server and the Cloudflare Durable Object run the same rules and the tests drive it with a
// fake clock. Design: docs/MULTIPLAYER.md. The relay keeps the clock: once every seat has loaded the game it closes a
// turn (3 ticks, 100 ms) on its own timer, puts the orders it has into the turn `DELAY` ahead, and sends that turn's
// bundle to everyone. It never looks inside an order (the clients decode them); it only checks that every seat has the
// same sim build (an opaque string from the client), and the clients compare hashes.
//
// The protocol (client -> relay): hello {proto, name, build?, token?, next?} (build: the client's sim build, which
// every seat holding a place must share, or their games would differ; next: the next turn the client expects, when it comes back), race {race}, map {map}, ready {ready},
// and from the host (seat 0) in the lobby: seats {n, map?} (the room's seat count, 2 to MAX_SEATS: a seat a person
// holds is never dropped), ai {seat, on, race?} (an open seat played by the AI, or open again; its race), diff {diff}
// (the AI seats' difficulty), teams {teams} (a team per seat, or null: each its own); sit {seat} (a person other than
// the host moves to an open seat); loaded {} (the game is set up: the clock may start), orders
// {w: numbers}, pause {} (stops the clock for everyone: PAUSES a game per seat, PAUSE_MS each at most), resume {} (the
// seat that paused ends its pause), leave {} (gives the game up now; in the lobby: gives the seat up now), over {} (its game has ended), rematch {want} (after a game: another,
// in this room), ack {turn, check?: {turn, hash}} (every few turns: the last turn run, and the state hash at the last
// checkpoint turn, a multiple of CHECK_EVERY), ping {id}. Relay -> client: seat, lobby {map, diff, teams, seats: [{name,
// race, ready, here, ai}]}, start {setup: {seed, map, side, races, names, teams, ai, diff}, delay, from, left: [pauses left per seat]},
// turn {n, o: [[seat, words], ...]} (its orders run on tick n * 3), away/back/left {seat}, desync {turn}, error
// {code, msg}, pause {seat, ms, left: [pauses left per seat]} / resume {seat} (-1: its time ran out), rematch {seats: [wants]} (who wants another game; once all do, a lobby follows), notice {code: 'version'} (to the seated: someone on another build was turned away), pong {id}.
//
// The lobby holds a seat whose connection is gone (a phone that switched apps to send the code, a reload): the seat
// stays its player's (name, race, token, the host's role), away (`here: false`) and not ready, for LOBBY_HOLD_MS; its
// token takes it back, a newcomer takes only a truly open seat, and the room cannot start while it is away. After the
// hold the seat is open again. A seat given up on purpose (leave) is open at once. `keep()` / `restore()`: the lobby as
// a record (seats, tokens, choices; no connections), for an adapter that may lose its memory (relay/worker.js).
//
// AI seats (M4): a seat the host gives to the AI has no connection. Every client runs that seat's AI in its own game
// (the sim's `ai_seats`: deterministic, from the setup's `ai` list), so the relay never waits for it (no load, no acks,
// never away), it sends nothing, and it needs no ready; it has no say in a rematch or a hash check.

export const PROTO = 3; // (2: hello carries the sim build; 3: seat counts, AI seats, teams) // the protocol's version: a client of another version is told to update
export const TURN_MS = 100;
export const TICKS_PER_TURN = 3;
export const DELAY = 2; // turns between an order arriving and the turn it runs on
export const CHECK_EVERY = 10; // turns between hash checkpoints
const AWAY_AFTER_MS = 3000; // no ack for this long and a seat is away (the room waits for it)
const BACK_LAG = 10; // an away seat is back once its acks are this close to the clock
const AWAY_BUDGET_MS = 60000; // per seat, per game: how long the others wait for it in all
export const LOBBY_HOLD_MS = 5 * 60000; // a lobby seat whose connection is gone stays its player's this long
const CATCH_UP = 5; // turns the clock closes at once after a stall at most (it does not blame anyone for it)
const MAX_ORDER_WORDS = 4096; // numbers a seat may send in one turn
const MAX_ORDER_MSGS = 10; // orders messages a seat may send in one turn
const MAX_NAME = 16;
const OVER_GRACE_MS = 30000; // once a game is over, a seat whose connection is gone this long has left the room
export const PAUSES = 3; // pauses a seat may call in a game
export const PAUSE_MS = 5 * 60000; // a pause's length at most (the seat that called it may end it sooner)
export const MAX_SEATS = 8; // seats a room may have (the most a map seats: 128x128, eight starts)
const DIFFS = 4; // the AI's difficulties (0 Easy to 3 Brutal)

/** A room of `seats` players. `send(conn, msg)` delivers a message to one connection; `kick(conn)` closes one. */
export class Room {
  constructor({ code, seats = 2, send, kick = () => {}, seed = 1, onLobby = () => {} }) {
    this.code = code; this.send = send; this.kick = kick; this.rng = seed >>> 0 || 1;
    this.onLobby = onLobby; // (told after every change to the lobby: an adapter may keep it, `keep()`)
    this.seats = Array.from({ length: seats }, () => this.empty());
    this.phase = 'lobby'; // lobby, game, over
    this.map = 0; this.diff = 1; this.teams = null; this.turn = 0; this.log = []; this.inbox = []; this.next = 0; this.paused = false; this.now = 0;
    this.running = false; // (the clock: once every seat has loaded)
    this.hold = null; // a pause a seat called: { seat, until }
  }

  /** A connection says hello. Returns its seat, or -1 (it was told why). */
  connect(conn, hello) {
    if (hello?.proto !== PROTO) { this.send(conn, { t: 'error', code: 'update', msg: 'Ebbfall has an update. Tap UPDATE to get it' }); return -1; }
    if (this.seats.some(s => s.conn === conn)) return -1; // (a second hello on one connection)
    // One sim build per room: that of the seats holding a place (a seat given up frees the room for another build).
    // Another build would compute another game (out of sync at once): it is turned away, and the seated are told.
    const build = typeof hello.build === 'string' ? hello.build.slice(0, 64) : '';
    // (in the lobby, a held seat that is away is checked when it comes back: a newcomer is not turned away for it)
    const mine = typeof hello.token === 'string' ? this.seats.find(s => s.token && s.token === hello.token) : null;
    const other = this.seats.find(s => s.token && s !== mine && (s.conn || this.phase !== 'lobby'));
    if (other && other.build !== build) {
      this.send(conn, { t: 'error', code: 'version', msg: 'Your Ebbfall and your friend\'s don\'t match' });
      this.each({ t: 'notice', code: 'version' });
      return -1;
    }
    // Back with its token: the same seat (after a dropped connection or a reload).
    let seat = typeof hello.token === 'string' ? this.seats.findIndex(s => s.token && s.token === hello.token) : -1;
    if (seat < 0) {
      if (this.phase !== 'lobby') { this.send(conn, { t: 'error', code: 'started', msg: 'That game has started' }); return -1; }
      seat = this.seats.findIndex(s => !s.token && !s.ai); // (a held seat, away, is not open)
      if (seat < 0) { this.send(conn, { t: 'error', code: 'full', msg: 'That room is full' }); return -1; }
      this.seats[seat].token = token();
    }
    const s = this.seats[seat];
    s.build = build;
    if (s.conn) { this.send(s.conn, { t: 'error', code: 'replaced', msg: 'This room is open on another screen' }); this.kick(s.conn); }
    s.conn = conn; s.lastAck = this.now;
    if (this.phase === 'lobby') { s.goneSince = 0; s.name = String(hello.name || `Player ${seat + 1}`).slice(0, MAX_NAME); } // (a held seat: back)
    this.send(conn, { t: 'seat', seat, token: s.token, room: this.code, proto: PROTO });
    if (this.phase === 'lobby') this.lobby();
    else {
      // Back in a game: every turn from the next one it expects, then on as before, and who else is away or gone.
      const from = Number.isInteger(hello.next) && hello.next >= 0 ? hello.next : 0;
      this.send(conn, { t: 'start', setup: this.setup, delay: DELAY, from, left: this.pausesLeft() });
      for (const b of this.log) if (b.n >= from) this.send(conn, { t: 'turn', ...b });
      this.seats.forEach((x, i) => { if (x.left) this.send(conn, { t: 'left', seat: i }); else if (x.awaySince && i !== seat) this.send(conn, { t: 'away', seat: i }); });
      // (it is back once its acks show it has caught up)
      s.goneSince = 0;
      this.send(conn, this.hold ? this.pauseMsg() : { t: 'resume', seat: -2 }); // (told whether a pause is on: one may have ended while it was gone)
      if (this.seats.some(x => x.rematch)) this.rematchState(); // (who wants a rematch; perhaps everyone, now it is back)
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
      else if (msg.t === 'map' && seat === 0 && validMap(msg.map)) { this.map = msg.map; this.unready(); }
      else if (msg.t === 'seats' && seat === 0) this.resize(msg.n, msg.map);
      else if (msg.t === 'ai' && seat === 0) this.aiSeat(msg);
      else if (msg.t === 'diff' && seat === 0 && Number.isInteger(msg.diff) && msg.diff >= 0 && msg.diff < DIFFS) { this.diff = msg.diff; this.unready(); }
      else if (msg.t === 'teams' && seat === 0 && (msg.teams === null || validTeams(msg.teams, this.seats.length))) { this.teams = msg.teams && [...msg.teams]; this.unready(); }
      else if (msg.t === 'sit' && seat > 0) this.sit(seat, msg.seat);
      else if (msg.t === 'leave') { this.seats[seat] = this.empty(); this.lobby(); } // (given up on purpose: open at once, no hold)
      else if (msg.t === 'ready') { s.ready = !!msg.ready; this.lobby(); if (this.seats.every(x => x.ai || (x.conn && x.ready))) this.start(); }
      return;
    }
    if (msg.t === 'leave' && this.phase !== 'lobby') { this.leave(seat); return; } // (its player left the game, or the room after it: no waiting for it)
    if (msg.t === 'rematch' && this.phase !== 'lobby' && !s.left) { s.rematch = !!msg.want; this.rematchState(); return; }
    // Its game is over (the clients know; the relay does not): once every seat's is, the clock stops and nobody is
    // away any more, only here or gone (a rematch waits for the seats still here).
    if (msg.t === 'over' && this.phase === 'game' && !s.left) {
      s.over = true; if (s.awaySince) this.back(seat); // (out and watching: nobody waits for it)
      if (this.seats.every(x => x.ai || x.left || x.over)) { this.phase = 'over'; this.hold = null; for (const x of this.seats) if (x.awaySince) this.back(this.seats.indexOf(x)); }
      return;
    }
    if (this.phase !== 'game' || s.left) return; // (a seat that left is not heard)
    if (msg.t === 'pause') {
      if (this.hold || !this.running || s.over || s.pauses >= PAUSES) return;
      s.pauses++; this.hold = { seat, until: this.now + PAUSE_MS };
      for (const x of this.seats) if (x.awaySince) { x.away += Math.max(0, this.now - x.awaySince); x.awaySince = this.now; } // (away before the pause: counted; during it: not)
      this.each(this.pauseMsg()); return;
    }
    if (msg.t === 'resume') { if (this.hold?.seat === seat) this.unhold(seat); return; } // (only who paused: when they are ready)
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
    if (this.phase === 'lobby') { s.ready = false; s.goneSince = this.now || 1; this.lobby(); } // (a lobby seat is held, away, LOBBY_HOLD_MS)
    else if (this.phase === 'game') this.away(seat);
    else if (!s.left) s.goneSince = this.now || 1; // (over: back within the grace, or gone)
  }

  /** The clock: close every turn due by `now` (ms). */
  tick(now) {
    this.now = now;
    if (this.phase === 'lobby') { this.release(now); return; }
    if (this.phase === 'over') { this.seats.forEach((s, i) => { if (!s.conn && !s.left && s.goneSince && now - s.goneSince > OVER_GRACE_MS) this.leave(i); }); return; }
    if (this.phase !== 'game') return;
    if (!this.running) {
      // (the clock starts once every seat has its game set up, so a slow phone's load costs no one anything)
      if (!this.seats.every(s => s.ai || s.loaded)) return;
      this.running = true; this.next = now;
      for (const s of this.seats) s.lastAck = now;
    }
    // A seat silent too long, or gone: the room waits for it, within its budget for the game.
    this.seats.forEach((s, i) => {
      if (s.left || s.ai || s.over) return; // (an AI seat runs in every client's game; a seat whose game is over (out of a free-for-all) watches: neither is waited for)
      if (!s.awaySince && (!s.conn || now - s.lastAck > AWAY_AFTER_MS)) this.away(i);
      if (s.awaySince && !this.hold && s.away + (now - s.awaySince) > AWAY_BUDGET_MS) this.leave(i); // (a pause's time is nobody's)
    });
    if (this.hold && now >= this.hold.until) this.unhold(-1); // (time's up)
    this.paused = !!this.hold || this.seats.some(s => s.awaySince && !s.left && !s.over);
    if (this.paused) { this.next = now + TURN_MS; return; }
    if (now - this.next > CATCH_UP * TURN_MS) this.next = now - CATCH_UP * TURN_MS; // (a stall: a few turns, not a burst)
    while (now >= this.next && this.phase === 'game') { this.closeTurn(); this.next += TURN_MS; }
  }

  // ---- inside ----
  empty() {
    // away: ms of its budget used up; awaySince: when it went away (0: here)
    return { ai: false, conn: null, token: null, build: '', rematch: false, over: false, goneSince: 0, pauses: 0, name: '', race: 'humans', ready: false, loaded: false, acked: -1, lastAck: 0, hashes: new Map(), away: 0, awaySince: 0, left: false, turnMsgs: 0, turnWords: 0 };
  }
  rand() { let t = (this.rng += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; } // (Mulberry32: the setup's seed and side)
  each(msg) { for (const s of this.seats) if (s.conn) this.send(s.conn, msg); }
  lobby() { this.each({ t: 'lobby', map: this.map, diff: this.diff, teams: this.teams, seats: this.seats.map(s => ({ name: s.name, race: s.race, ready: s.ready, here: !!s.conn, ai: s.ai })) }); this.onLobby(); }
  /** The lobby's held seats whose hold has run out are open again. */
  release(now) {
    let freed = false;
    this.seats.forEach((s, i) => { if (s.token && !s.conn && s.goneSince && now - s.goneSince > LOBBY_HOLD_MS) { this.seats[i] = this.empty(); freed = true; } });
    if (freed) this.lobby();
  }
  /** The lobby as a record (seats with their tokens, the host's choices; no connections, nobody ready). */
  keep() {
    return { map: this.map, diff: this.diff, teams: this.teams, seats: this.seats.map(s => ({ name: s.name, race: s.race, token: s.token, ai: s.ai, goneSince: s.goneSince })) };
  }
  /** A kept lobby back (the room was lost from memory, at `now`): its seats held, away, from when they went (now, for
   *  one that was here: its connection went with the memory). */
  restore(k, now) {
    if (!k || !Array.isArray(k.seats) || k.seats.length < 2 || k.seats.length > MAX_SEATS) return;
    this.now = now;
    this.seats = k.seats.map(x => Object.assign(this.empty(), {
      name: String(x.name || '').slice(0, MAX_NAME), race: String(x.race || 'humans').slice(0, 16), ai: !!x.ai,
      token: !x.ai && typeof x.token === 'string' ? x.token : null,
    }));
    this.seats.forEach((s, i) => { if (s.token) s.goneSince = Number(k.seats[i].goneSince) || now; });
    if (validMap(k.map)) this.map = k.map;
    if (Number.isInteger(k.diff) && k.diff >= 0 && k.diff < DIFFS) this.diff = k.diff;
    this.teams = validTeams(k.teams, this.seats.length) ? [...k.teams] : null;
  }
  /** A change to the game's setup: everyone ready again (they agree to the new one). */
  unready() { for (const x of this.seats) x.ready = false; this.lobby(); }
  /** The host sets the seat count: seats added open, seats dropped from the end only if no person holds them (AI
   *  seats go with them); the teams back to each seat its own; the map with it (the client knows which fit). */
  resize(n, map) {
    if (!Number.isInteger(n) || n < 2 || n > MAX_SEATS || n === this.seats.length) return;
    if (this.seats.slice(n).some(s => s.token)) return;
    this.seats.length = Math.min(n, this.seats.length);
    while (this.seats.length < n) this.seats.push(this.empty());
    this.teams = null;
    if (validMap(map)) this.map = map;
    this.unready();
  }
  /** The host gives an open seat to the AI (`on`; `race` its race, RANDOM by default), changes an AI seat's race, or
   *  opens it again. Never the host's own seat, nor one a person holds. */
  aiSeat({ seat, on, race }) {
    const s = Number.isInteger(seat) && seat > 0 ? this.seats[seat] : null;
    if (!s || s.token) return;
    if (on === false) { if (s.ai) this.seats[seat] = this.empty(); }
    else Object.assign(s, { ai: true, name: '', race: typeof race === 'string' ? race.slice(0, 16) : s.ai ? s.race : 'random' });
    this.unready();
  }
  /** A person (not the host) moves to an open seat, taking its place, race and name along (to seat 0 only if the host
   *  has left: it is the host then). */
  sit(from, to) {
    const t = Number.isInteger(to) && to >= 0 ? this.seats[to] : null;
    if (!t || t.token || t.ai) return;
    const s = this.seats[from];
    this.seats[to] = s; this.seats[from] = this.empty();
    this.send(s.conn, { t: 'seat', seat: to, token: s.token, room: this.code, proto: PROTO });
    this.unready();
  }
  start() {
    this.phase = 'game';
    const n = this.seats.length;
    // (two seats draw as they always did: the seed, then which of two starts; more turn round the map's starts, any
    // number: the sim takes it modulo)
    this.setup = { seed: this.rand() % 1000000 + 1, map: this.map, side: n === 2 ? this.rand() % 2 : this.rand(), races: this.seats.map(s => s.race), names: this.seats.map(s => s.name),
      teams: this.teams || this.seats.map((_, i) => i), ai: this.seats.map(s => (s.ai ? 1 : 0)), diff: this.diff };
    this.each({ t: 'start', setup: this.setup, delay: DELAY, from: 0, left: this.pausesLeft() });
    for (let n = 0; n < DELAY; n++) this.bundle(n, []); // (the first turns can have no orders)
    this.turn = 0;
  }
  /** A pause: who called it, how long it has left, and every seat's pauses left. */
  pauseMsg() { return { t: 'pause', seat: this.hold.seat, ms: Math.max(0, this.hold.until - this.now), left: this.pausesLeft() }; }
  pausesLeft() { return this.seats.map(s => PAUSES - s.pauses); }
  unhold(by) {
    this.hold = null; this.each({ t: 'resume', seat: by });
    for (const s of this.seats) if (s.awaySince) s.awaySince = this.now; // (away during the pause: its budget counts from now)
  }
  /** Who wants another game, told to all; once every seat does (all still here: a seat that left ends it), the room
   *  is a lobby again: the same seats, races and map, nobody ready. */
  rematchState() {
    this.each({ t: 'rematch', seats: this.seats.map(s => !!s.rematch) });
    if (!this.seats.every(s => s.ai || (s.conn && !s.left && s.rematch))) return;
    Object.assign(this, { phase: 'lobby', turn: 0, log: [], inbox: [], next: 0, paused: false, running: false, setup: null, hold: null });
    for (const s of this.seats) Object.assign(s, { ready: false, loaded: false, acked: -1, lastAck: this.now, hashes: new Map(), away: 0, awaySince: 0, rematch: false, over: false, goneSince: 0, pauses: 0, turnMsgs: 0, turnWords: 0 });
    this.lobby();
  }
  closeTurn() {
    const n = this.turn + DELAY, orders = this.inbox; this.inbox = [];
    for (const s of this.seats) { s.turnMsgs = 0; s.turnWords = 0; }
    this.bundle(n, orders);
    this.turn++;
  }
  bundle(n, o) { const b = { n, o }; this.log.push(b); this.each({ t: 'turn', ...b }); }
  away(seat) { const s = this.seats[seat]; if (s.awaySince || s.left || s.over) return; // (a seat whose game is over is not waited for)
    s.awaySince = this.now || 1; this.each({ t: 'away', seat }); }
  back(seat) { const s = this.seats[seat]; if (!s.awaySince) return; if (!this.hold) s.away += Math.max(0, this.now - s.awaySince); s.awaySince = 0; this.each({ t: 'back', seat }); } // (back during a pause: its time is nobody's)
  leave(seat) {
    const s = this.seats[seat]; if (s.left) return; s.left = true; s.awaySince = 0;
    this.inbox.push([seat, [18]]); // (Concede, as an order in the log: replays and rejoins see it)
    this.each({ t: 'left', seat });
    if (this.hold && (this.hold.seat === seat || this.seats.filter(x => !x.left && !x.ai).length < 2)) this.unhold(seat); // (its pause goes with it; one seat left: nothing to wait for)
  }
  compare(turn) {
    const here = this.seats.filter(s => !s.left && !s.ai);
    const hs = here.map(s => s.hashes.get(turn));
    if (hs.some(h => h === undefined)) return;
    if (hs.some(h => h !== hs[0])) { this.phase = 'over'; this.hold = null; this.each({ t: 'desync', turn }); }
    // (checkpoints every seat has passed are done with)
    for (const s of this.seats) for (const t of s.hashes.keys()) if (t <= turn) s.hashes.delete(t);
  }
}

/** A map's index (the client's list: which maps fit the seats is its business). */
const validMap = (m) => Number.isInteger(m) && m >= 0 && m < 16;
/** A team per seat, each below the number of seats, at least two teams (the sim's rule, World::set_teams). */
const validTeams = (t, n) => Array.isArray(t) && t.length === n && t.every(x => Number.isInteger(x) && x >= 0 && x < n) && t.some(x => x !== t[0]);

/** A seat token nobody can guess (it takes a seat back). */
function token() {
  const b = new Uint32Array(4); globalThis.crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(36)).join('');
}
