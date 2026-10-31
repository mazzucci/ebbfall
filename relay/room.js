// The relay's room: a pure state machine (no sockets, no timers: the adapter calls `connect`, `receive`, `close` and
// `tick(now)`), so the Node server and the Cloudflare Durable Object run the same rules and the tests drive it with a
// fake clock. Design: docs/MULTIPLAYER.md. The relay keeps the clock: once every seat has loaded the game it closes a
// turn (3 ticks, 100 ms) on its own timer, puts the orders it has into the turn `DELAY` ahead, and sends that turn's
// bundle to everyone. It never looks inside an order (the clients decode them); it only checks that every seat has the
// same sim build (an opaque string from the client), and the clients compare hashes.
//
// The protocol (client -> relay): hello {proto, name, build?, token?, next?} (name: trimmed, 16 characters at most; a newcomer without one refused with error `name`; build: the client's sim build, which
// every seat holding a place must share, or their games would differ; next: the next turn the client expects, when it comes back), race {race} (humans, vael or random), map {map}, ready {ready},
// and from the host (spot 0) in the lobby, every `seat` there a spot: ai {seat, on, race?, diff?} (on true: an open seat
// played by the AI; false: open again; its race and difficulty, 0-3), side {seat, team} (that spot's seat to team `team`,
// 0 to MAX_SEATS-1: a number no seat has is a side of its own), add {team, ai, race?, diff?} (a seat more at the lowest
// empty spot, on `team`, MAX_SEATS at most: open for a friend, or the AI's), drop {seat} (an open or AI seat goes, its
// spot empty: never spot 0, never a person's, never below two), free {seat} (a held seat whose player is away is open
// again: they came back on another browser or device, without its token), remove {seat} (a person goes, here or away:
// told `error {code: 'removed'}`, the seat open again, and their address may not join the room again: a stranger who
// guessed the code); sit {seat, team?} (a person other than the
// host moves to an open seat, taking its spot and side; team: the side it saw the seat on, refused if it is on another);
// loaded {} (the game is set up: the clock may start), orders
// {w: numbers}, pause {} (stops the clock for everyone: PAUSES a game per seat, PAUSE_MS each at most), resume {} (the
// seat that paused ends its pause), leave {} (gives the game up now; in the lobby: gives the seat up now), over {} (its game has ended), rematch {want} (after a game: another,
// in this room), ack {turn, check?: {turn, hash}} (every few turns: the last turn run, and the state hash at the last
// checkpoint turn, a multiple of CHECK_EVERY), ping {id} (answered even after a lobby leave: the leaver's
// confirmation that its leave arrived). Relay -> client: seat {seat, token, room, proto} (in the lobby its spot: on
// joining, after a sit, and after a game when its game seat was another; in a game its game seat), lobby {map, teams,
// seats} (each MAX_SEATS long, by spot, null for an empty one: a team, and {name, race, ready, here, ai, diff}), start
// {seat (its game seat), setup: {seed, map, side, races, names, teams, spots, ai, diffs, diff} (a list per game seat:
// spots, the spot each sat in), delay, from, left: [pauses left per seat]},
// turn {n, o: [[seat, words], ...]} (its orders run on tick n * 3), away {seat, loading} (loading: before the clock, its
// game not set up yet), back/left {seat}, desync {turn}, error
// {code, msg} (from the adapter before any hello: noroom, limit (too many tries: wait), update (a code of the first
// format)), pause {seat, ms, left: [pauses left per seat]} / resume {seat} (-1: its time ran out), rematch {seats: [wants]} (who wants another game; once all do, a lobby follows), notice {code: 'version'} (to the seated: someone on another build was turned away), pong {id}.
//
// The board's spots (PROTO 5): in the lobby every seat keeps its spot (0 to MAX_SEATS-1, the host's 0; `this.seats` in
// spot order, holes where a spot is empty) and its team as the host set it, so nobody's token moves while the sides
// change; only a person's own sit moves it. The game's seats are arranged when it starts (`start`): each team one run of
// consecutive seats (the sim seats allies side by side only so: map.rs team_starts), spot 0's team first, then the teams
// in the order they first appear by spot, each team's seats in spot order, the teams numbered 0, 1, ... in that order;
// in a game a seat's number is its game seat (`this.seats` in that order), and a rematch's lobby puts them back on
// their spots (a connection whose number changes told its spot first). The room's map always seats the room: a map
// that does not is refused, and a seat added past the map's starts takes the smallest that does (maps.js fitMap).
//
// The lobby holds a seat whose connection is gone (a phone that switched apps to send the code, a reload): the seat
// stays its player's (name, race, token, the host's role), away (`here: false`) and not ready, for LOBBY_HOLD_MS; its
// token takes it back, a newcomer takes only a truly open seat, and the room cannot start while it is away. After the
// hold the seat is open again (on its spot and side), or at once when the host frees it (free) or its player gives it up (leave).
// `keep()` / `restore()`: the lobby as a record (seats with their spots, teams, tokens, races, AI levels; the map; no
// connections), for an adapter that may lose its memory (relay/worker.js).
//
// AI seats (M4): a seat the host gives to the AI has no connection. Every client runs that seat's AI in its own game
// (the sim's `ai_seats`: deterministic, from the setup's `ai` list), so the relay never waits for it (no load, no acks,
// never away), it sends nothing, and it needs no ready; it has no say in a rematch or a hash check.

import { MAPS, fits, fitMap } from '../src/client/maps.js';

export const PROTO = 6; // (2: hello carries the sim build; 3: seat counts, AI seats, teams; 4: the sides board: side, add, drop, a level per AI seat; 5: fixed spots, arranged at the start; 6: six-letter codes (src/net/roomcode.js), the limits' error `limit`, the host's remove) // the protocol's version: a client of another version is told to update
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
    this.seats = Array.from({ length: seats }, (_, i) => this.empty(i, i)); // (spots 0 to seats-1, each its own team)
    this.phase = 'lobby'; // lobby, game, over
    this.map = fitMap(0, seats); this.turn = 0; this.log = []; this.inbox = []; this.next = 0; this.paused = false; this.now = 0;
    this.running = false; this.loadFrom = 0; // (the clock: once every seat has loaded, from loadFrom on)
    this.hold = null; // a pause a seat called: { seat, until }
    this.barred = new Set(); // addresses the host removed someone from (their key, relay/limits.js addressKey): not let in again
  }

  /** A connection says hello, from address `addr` (its key; '' unknown). Returns its seat (in the lobby its spot), or
   *  -1 (it was told why). */
  connect(conn, hello, addr = '') {
    if (hello?.proto !== PROTO) { this.send(conn, { t: 'error', code: 'update', msg: 'Ebbfall has an update. Tap UPDATE to get it' }); return -1; }
    if (this.seats.some(s => s.conn === conn)) return -1; // (a second hello on one connection)
    // One sim build per room: that of the seats holding a place (a seat given up frees the room for another build).
    // Another build would compute another game (out of sync at once): it is turned away, and the seated are told.
    const build = typeof hello.build === 'string' ? hello.build.slice(0, 64) : '';
    // (in the lobby, a held seat that is away is checked when it comes back: a newcomer is not turned away for it)
    const mine = typeof hello.token === 'string' ? this.seats.find(s => s.token && s.token === hello.token) : null;
    // A name to show the others: trimmed, MAX_NAME at most. A newcomer without one is turned away (the client asks for
    // one first); a seat back with its token and none keeps the name it had.
    const name = typeof hello.name === 'string' ? hello.name.trim().slice(0, MAX_NAME).trim() : '';
    if (!name && !mine) { this.send(conn, { t: 'error', code: 'name', msg: 'Enter your name' }); return -1; }
    const other = this.seats.find(s => s.token && s !== mine && (s.conn || this.phase !== 'lobby'));
    if (other && other.build !== build) {
      this.send(conn, { t: 'error', code: 'version', msg: 'Your Ebbfall and your friend\'s don\'t match' });
      this.each({ t: 'notice', code: 'version' });
      return -1;
    }
    // Back with its token: the same seat (after a dropped connection or a reload).
    let seat = typeof hello.token === 'string' ? this.seats.findIndex(s => s.token && s.token === hello.token) : -1;
    const newcomer = seat < 0;
    if (newcomer && addr && this.barred.has(addr)) { this.send(conn, { t: 'error', code: 'removed', msg: 'The host removed you from this room' }); return -1; }
    if (seat < 0) {
      if (this.phase !== 'lobby') { this.send(conn, { t: 'error', code: 'started', msg: 'That game has started' }); return -1; }
      seat = this.seats.findIndex(s => !s.token && !s.ai); // (a held seat, away, is not open)
      if (seat < 0) {
        const held = this.phase === 'lobby' && this.seats.some(s => s.token && !s.conn);
        this.send(conn, { t: 'error', code: 'full', msg: held ? 'That room is full: a seat is kept a few minutes for a player who stepped away' : 'That room is full' });
        return -1;
      }
      this.seats[seat].token = token(); // (the lowest open spot: the seats are in spot order)
    }
    const s = this.seats[seat];
    s.build = build; s.from = addr;
    if (s.conn) { this.send(s.conn, { t: 'error', code: 'replaced', msg: 'This room is open on another screen' }); this.kick(s.conn); }
    s.conn = conn; s.lastAck = this.now;
    if (this.phase === 'lobby') { s.goneSince = 0; s.name = name || s.name; } // (a held seat: back)
    this.tell(s);
    if (this.phase === 'lobby') { if (newcomer) this.unready(); else this.lobby(); return s.spot; } // (someone new: the others ready again for the new line-up)
    // Back in a game: every turn from the next one it expects, then on as before, and who else is away or gone.
    const from = Number.isInteger(hello.next) && hello.next >= 0 ? hello.next : 0;
    this.send(conn, { t: 'start', seat, setup: this.setup, delay: DELAY, from, left: this.pausesLeft() });
    for (const b of this.log) if (b.n >= from) this.send(conn, { t: 'turn', ...b });
    this.seats.forEach((x, i) => { if (x.left) this.send(conn, { t: 'left', seat: i }); else if (x.awaySince && i !== seat) this.send(conn, this.awayMsg(i)); });
    // (it is back once its acks show it has caught up)
    s.goneSince = 0;
    this.send(conn, this.hold ? this.pauseMsg() : { t: 'resume', seat: -2 }); // (told whether a pause is on: one may have ended while it was gone)
    if (this.seats.some(x => x.rematch)) this.rematchState(); // (who wants a rematch; perhaps everyone, now it is back)
    return this.num(s);
  }

  /** A message from a connection (already parsed JSON). */
  receive(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'ping') { this.send(conn, { t: 'pong', id: msg.id }); return; } // (also to a connection whose seat was given up: its leave arrived)
    const seat = this.seats.findIndex(s => s.conn === conn);
    if (seat < 0) return;
    const s = this.seats[seat];
    if (this.phase === 'lobby') {
      const host = s.spot === 0; // (the seats a lobby message names are spots)
      if (msg.t === 'race' && RACES.includes(msg.race)) { s.race = msg.race; s.ready = false; this.lobby(); }
      else if (msg.t === 'map' && host && fits(msg.map, this.seats.length)) { this.map = msg.map; this.unready(); } // (a map without a start for every seat: refused)
      else if (msg.t === 'ai' && host) this.aiSeat(msg);
      else if (msg.t === 'side' && host) this.side(msg.seat, msg.team);
      else if (msg.t === 'add' && host) this.add(msg);
      else if (msg.t === 'drop' && host) this.drop(msg.seat);
      else if (msg.t === 'sit' && !host) this.sit(s, msg.seat, msg.team);
      else if (msg.t === 'free' && host) this.free(msg.seat);
      else if (msg.t === 'remove' && host) this.remove(msg.seat);
      else if (msg.t === 'leave') { this.open(s); this.lobby(); } // (given up on purpose: open at once, no hold, on its spot and side)
      else if (msg.t === 'ready') { s.ready = !!msg.ready; this.lobby(); if (this.seats.every(x => x.ai || (x.conn && x.ready)) && new Set(this.seats.map(x => x.team)).size > 1) this.start(); } // (everyone on one side: nobody to fight, no start)
      return;
    }
    if (msg.t === 'leave' && this.phase !== 'lobby') { this.leave(seat); return; } // (its player left the game, or the room after it: no waiting for it)
    if (msg.t === 'rematch' && this.phase !== 'lobby' && !s.left) { s.rematch = !!msg.want; this.rematchState(); return; }
    // Its game is over (the clients know; the relay does not): once every seat's is, the clock stops and nobody is
    // away any more, only here or gone (a rematch waits for the seats still here).
    if (msg.t === 'over' && this.phase === 'game' && !s.left && this.running) { // (no game can be over before the clock: a client that says so is not heard)
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
    if (msg.t === 'loaded') { s.loaded = true; s.lastAck = this.now; if (s.awaySince && !this.running) this.back(seat); return; } // (waited for while it loaded: here now)
    if (msg.t === 'orders') {
      if (!Array.isArray(msg.w) || !msg.w.every(Number.isFinite)) return;
      if (s.turnMsgs >= MAX_ORDER_MSGS || s.turnWords + msg.w.length > MAX_ORDER_WORDS) return; // (too much this turn)
      s.turnMsgs++; s.turnWords += msg.w.length;
      this.inbox.push([seat, msg.w]);
    } else if (msg.t === 'ack' && Number.isInteger(msg.turn)) {
      s.acked = Math.max(s.acked, Math.min(msg.turn, this.turn + DELAY)); // (no further than turns that exist)
      s.lastAck = this.now; s.loaded = true;
      if (s.awaySince && (!this.running || this.turn - s.acked <= BACK_LAG)) this.back(seat);
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
      // The clock starts once every seat has its game set up (or has left). A seat still loading after AWAY_AFTER_MS,
      // or gone before it loaded, is away (the others are told whom they wait for), within its budget for the game:
      // a seat that never loads is conceded, and the others play on.
      this.seats.forEach((s, i) => {
        if (s.ai || s.left || s.loaded) return;
        if (!s.awaySince && (!s.conn || now - this.loadFrom > AWAY_AFTER_MS)) this.away(i);
        if (s.awaySince && s.away + (now - s.awaySince) > AWAY_BUDGET_MS) this.leave(i);
      });
      if (!this.seats.every(s => s.ai || s.left || s.loaded)) return;
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
  /** An open seat at spot `spot`, on team `team` (the lobby's number for its side, as the host set it). */
  empty(team, spot) {
    // away: ms of its budget used up; awaySince: when it went away (0: here); diff: an AI seat's level (0 Easy to 3 Brutal)
    return { spot, team, diff: 1, ai: false, conn: null, from: '', token: null, build: '', rematch: false, over: false, goneSince: 0, pauses: 0, name: '', race: 'humans', ready: false, loaded: false, acked: -1, lastAck: 0, hashes: new Map(), away: 0, awaySince: 0, left: false, turnMsgs: 0, turnWords: 0 };
  }
  rand() { let t = (this.rng += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; } // (Mulberry32: the setup's seed and side)
  each(msg) { for (const s of this.seats) if (s.conn) this.send(s.conn, msg); }
  /** A seat's number: in the lobby its spot, in a game its game seat (its index). */
  num(s) { return this.phase === 'lobby' ? s.spot : this.seats.indexOf(s); }
  /** Tell a seat's connection its number (and its token, the room). */
  tell(s) { this.send(s.conn, { t: 'seat', seat: this.num(s), token: s.token, room: this.code, proto: PROTO }); }
  /** The lobby's seat at spot `spot`, if any (`spot` from a client: anything). */
  bySpot(spot) { return Number.isInteger(spot) ? this.seats.find(s => s.spot === spot) : undefined; }
  /** The lowest spot no seat has. */
  freeSpot() { let k = 0; while (this.bySpot(k)) k++; return k; }
  /** Seat `s` open again, on its spot and side (a new record: nothing of its player's stays). */
  open(s) { this.seats[this.seats.indexOf(s)] = this.empty(s.team, s.spot); }
  /** The seats back in spot order (after a change of spots, or a game). */
  sortBySpot() { this.seats.sort((a, b) => a.spot - b.spot); }
  /** The room's map seats the room: else the smallest that does (maps.js fitMap; a random one stays random). */
  fitRoom() { this.map = fitMap(this.map, this.seats.length); }
  lobby() {
    const at = (f) => Array.from({ length: MAX_SEATS }, (_, k) => { const s = this.bySpot(k); return s ? f(s) : null; });
    this.each({ t: 'lobby', map: this.map, teams: at(s => s.team), seats: at(s => ({ name: s.name, race: s.race, ready: s.ready, here: !!s.conn, ai: s.ai, diff: s.diff })) });
    this.onLobby();
  }
  /** The lobby's held seats whose hold has run out are open again. */
  release(now) {
    const out = this.seats.filter(s => s.token && !s.conn && s.goneSince && now - s.goneSince > LOBBY_HOLD_MS);
    for (const s of out) this.open(s);
    if (out.length) this.lobby();
  }
  /** The lobby as a record (seats with their spots, teams, tokens and levels, the host's choices; no connections,
   *  nobody ready). `v`: the record's shape (PROTO 5's; before it, none). */
  keep() {
    return { v: 5, map: this.map, seats: this.seats.map(s => ({ spot: s.spot, team: s.team, name: s.name, race: s.race, token: s.token, ai: s.ai, diff: s.diff, goneSince: s.goneSince })) };
  }
  /** A kept lobby back (the room was lost from memory, at `now`): its seats held, away, from when they went (now, for
   *  one that was here: its connection went with the memory), on their spots and teams (each its own, its spot's
   *  number, if they are not a good list); its map, or the smallest that seats them. A record of PROTO 4 (no `v`:
   *  the seats dense, spot = index, `teams` a team per seat) or 3 (a room-wide `diff`, `teams` null) comes back as it
   *  was. A record whose spots are not unique, or have no host's spot 0, does not. */
  restore(k, now) {
    if (!k || !Array.isArray(k.seats) || k.seats.length < 2 || k.seats.length > MAX_SEATS || !k.seats.every(x => x && typeof x === 'object')) return false;
    const n = k.seats.length, v5 = k.v === 5;
    const spots = v5 ? k.seats.map(x => x.spot) : k.seats.map((_, i) => i);
    if (!spots.every(validSpot) || new Set(spots).size !== n || !spots.includes(0)) return false;
    const given = v5 ? k.seats.map(x => x.team) : k.teams;
    const teams = v5 ? (given.every(validSpot) ? given : spots) : validTeams(given, n) ? given : spots;
    this.now = now;
    const race = (x, or) => (RACES.includes(x.race) ? x.race : or);
    this.seats = k.seats.map((x, i) => Object.assign(this.empty(teams[i], spots[i]), x.ai ? { ai: true, race: race(x, 'random'), diff: validDiff(x.diff) ? x.diff : validDiff(k.diff) ? k.diff : 1 } // (an AI seat; a held one; else open)
      : typeof x.token === 'string' && x.token ? { token: x.token.slice(0, 64), name: String(x.name || '').slice(0, MAX_NAME), race: race(x, 'humans') } : {}));
    this.seats.forEach((s, i) => { if (s.token) s.goneSince = Math.min(Number(k.seats[i].goneSince) || now, now); }); // (never later than now: a hold runs out)
    this.sortBySpot();
    if (validMap(k.map)) this.map = k.map;
    this.fitRoom();
    return true;
  }
  /** A change to the game's setup: everyone ready again (they agree to the new one). */
  unready() { for (const x of this.seats) x.ready = false; this.lobby(); }
  /** The host gives the open seat at spot `seat` to the AI (`on`; `race` its race, RANDOM by default; `diff` its level,
   *  Medium by default), changes an AI seat's race or level, or opens it again (on its spot and side). Never the host's
   *  own seat, nor one a person holds. */
  aiSeat({ seat, on, race, diff }) {
    const s = seat !== 0 ? this.bySpot(seat) : null;
    if (!s || s.token) return;
    if (on === false) {
      if (!s.ai) return; // (nothing to change: no one ready again, nothing told)
      this.open(s);
    } else if (on === true) {
      const next = { race: RACES.includes(race) ? race : s.ai ? s.race : 'random', diff: validDiff(diff) ? diff : s.ai ? s.diff : 1 };
      if (s.ai && s.race === next.race && s.diff === next.diff) return;
      Object.assign(s, { ai: true, name: '' }, next);
    } else return;
    this.unready();
  }
  /** The host moves the seat at spot `seat` (anyone's: its own, a person's, the AI's, an open one) to team `team`; a
   *  team no seat has is a side of its own. Nobody moves: its token keeps its spot, and the team keeps its number (the
   *  clients show SIDE team + 1; the game's teams are numbered at the start). */
  side(seat, team) {
    const s = this.bySpot(seat);
    if (!s || !validSpot(team) || s.team === team) return;
    s.team = team; this.unready();
  }
  /** The host adds a seat at the lowest empty spot, on team `team` (a number no seat has: a side of its own), open for
   *  a friend or the AI's (`ai`, its `race` and `diff` as `ai` takes them), MAX_SEATS at most. A map without a start
   *  for it gives way to the smallest that has (`fitRoom`: the lobby's `map` says so). */
  add({ team, ai, race, diff }) {
    if (this.seats.length >= MAX_SEATS || !validSpot(team)) return;
    const s = this.empty(team, this.freeSpot());
    if (ai) Object.assign(s, { ai: true, race: RACES.includes(race) ? race : 'random', diff: validDiff(diff) ? diff : 1 });
    this.seats.push(s); this.sortBySpot(); this.fitRoom(); this.unready();
  }
  /** The host drops an open or AI seat (never spot 0, never one a person holds, never below two seats): its spot is
   *  empty, nobody else moves. */
  drop(seat) {
    const s = seat !== 0 ? this.bySpot(seat) : null;
    if (!s || s.token || this.seats.length <= 2) return;
    this.seats.splice(this.seats.indexOf(s), 1); this.unready();
  }
  /** The host frees the held seat at spot `seat`, whose player is away (back on another browser, without its token,
   *  they can sit again): open at once, not after the hold. Never a seat whose player is here, nor an AI seat. */
  free(seat) {
    const s = seat !== 0 ? this.bySpot(seat) : null;
    if (!s || !s.token || s.conn) return;
    this.open(s); this.lobby();
  }
  /** The host removes the person at spot `seat` (here or away; never spot 0, never an AI or open seat): they are told
   *  so and closed, the seat is open again (its spot and side), and their address may not join this room again (a
   *  stranger who guessed the code; their token went with the seat). */
  remove(seat) {
    const s = seat !== 0 ? this.bySpot(seat) : null;
    if (!s || !s.token) return;
    if (s.from) this.barred.add(s.from);
    if (s.conn) { this.send(s.conn, { t: 'error', code: 'removed', msg: 'The host removed you from this room' }); this.kick(s.conn); }
    this.open(s); this.unready();
  }
  /** A person (`s`, not the host) moves to the open seat at spot `to`, taking its spot and side, its race and name
   *  along (to spot 0 only if the host has left: it is the host then); the spot it left is an open seat, on its side,
   *  and it is told its new spot. `team`, when given, is the side the person saw the seat on: a seat that is now on
   *  another side (the host moved it meanwhile), or not open, is not taken (the lobby that follows shows where things
   *  are). */
  sit(s, to, team) {
    const t = this.bySpot(to);
    if (!t || t.token || t.ai || (Number.isInteger(team) && t.team !== team)) return;
    const left = this.empty(s.team, s.spot);
    this.seats[this.seats.indexOf(s)] = left; this.seats[this.seats.indexOf(t)] = Object.assign(s, { spot: t.spot, team: t.team });
    this.tell(s);
    this.unready();
  }
  /** The game's seats: each team one run of consecutive seats, spot 0's team first, then the teams in the order they
   *  first appear by spot, each team's seats in spot order (seats.js `arrange`, by spot); the teams numbered 0, 1, ...
   *  in that order (`teams`, the setup's). The records keep their lobby's spots and teams for a rematch. */
  arrange() {
    const keys = [...new Set(this.seats.map(s => s.team))]; // (the seats are in spot order: spot 0's first)
    this.seats = keys.flatMap(t => this.seats.filter(s => s.team === t));
    return this.seats.map(s => keys.indexOf(s.team));
  }
  start() {
    this.phase = 'game'; this.loadFrom = this.now; // (the seats load from now: tick waits for them)
    const teams = this.arrange(), n = this.seats.length; // (from here on a seat's number is its game seat)
    // (two seats draw as they always did: the seed, then which of two starts; more turn round the map's starts, any
    // number: the sim takes it modulo)
    // (diffs: each seat's level, 0 for a person; diff: the hardest AI's, Medium with none)
    const diffs = this.seats.map(s => (s.ai ? s.diff : 0)), ais = this.seats.filter(s => s.ai);
    this.setup = { seed: this.rand() % 1000000 + 1, map: this.map, side: n === 2 ? this.rand() % 2 : this.rand(), races: this.seats.map(s => s.race), names: this.seats.map(s => s.name),
      teams, ai: this.seats.map(s => (s.ai ? 1 : 0)), diffs, diff: ais.length ? Math.max(...ais.map(s => s.diff)) : 1, spots: this.seats.map(s => s.spot) };
    this.seats.forEach((s, seat) => { if (s.conn) this.send(s.conn, { t: 'start', seat, setup: this.setup, delay: DELAY, from: 0, left: this.pausesLeft() }); });
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
   *  is a lobby again: the same seats, races and map, nobody ready, each seat back on its spot and side (a connection
   *  whose game seat was another number told its spot first). */
  rematchState() {
    this.each({ t: 'rematch', seats: this.seats.map(s => !!s.rematch) });
    if (!this.seats.every(s => s.ai || (s.conn && !s.left && s.rematch))) return;
    Object.assign(this, { phase: 'lobby', turn: 0, log: [], inbox: [], next: 0, paused: false, running: false, setup: null, hold: null });
    for (const s of this.seats) Object.assign(s, { ready: false, loaded: false, acked: -1, lastAck: this.now, hashes: new Map(), away: 0, awaySince: 0, rematch: false, over: false, goneSince: 0, pauses: 0, turnMsgs: 0, turnWords: 0 });
    const was = new Map(this.seats.map((s, i) => [s, i]));
    this.sortBySpot();
    for (const s of this.seats) if (s.conn && was.get(s) !== s.spot) this.tell(s);
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
    s.awaySince = this.now || 1; this.each(this.awayMsg(seat)); }
  /** A seat is away (`loading`: its game is not set up yet, before the clock runs). */
  awayMsg(seat) { return { t: 'away', seat, loading: !this.running && !this.seats[seat].loaded }; }
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

/** A map's index (maps.js MAPS). */
const validMap = (m) => Number.isInteger(m) && m >= 0 && m < MAPS.length;
/** A spot, or a lobby's team number: 0 to MAX_SEATS-1. */
const validSpot = (k) => Number.isInteger(k) && k >= 0 && k < MAX_SEATS;
/** A team per seat, each below the number of seats (a record of PROTO 3 or 4; one team is a lobby's, not a game's:
 *  `ready` starts two or more). */
const validTeams = (t, n) => Array.isArray(t) && t.length === n && t.every(x => Number.isInteger(x) && x >= 0 && x < n);
/** The races a seat may be (RANDOM: drawn when the game starts, alike on every client). */
const RACES = ['humans', 'vael', 'random'];
/** An AI's level: 0 Easy to 3 Brutal. */
const validDiff = (d) => Number.isInteger(d) && d >= 0 && d < DIFFS;

/** A seat token nobody can guess (it takes a seat back). */
function token() {
  const b = new Uint32Array(4); globalThis.crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(36)).join('');
}
