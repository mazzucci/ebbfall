// The network side of a multiplayer game (docs/MULTIPLAYER.md): one WebSocket to the relay. It joins or opens a room,
// follows the lobby, and once the game starts it carries the game's orders out and the relay's turns in. The turns
// go to the game strictly in order (a turn that arrives early waits for the gap before it); the game runs a tick only
// once its turn is in (the `Game`'s lockstep: crates/endfall-sim/src/lockstep.rs). Every few turns it acks the last
// turn run, with the state hash at the latest checkpoint. When the socket drops it reconnects and resumes from the
// next turn it expects; when the page comes back into view it checks the socket is still alive.
//
// It does not own the game: `game()` returns the current lockstep `Game` (or null before the start), so the same class
// serves the browser (one game, through src/engine) and the tests (several games in one process).

export const PROTO = 2;
const TICKS_PER_TURN = 3;
const ACK_EVERY = 3; // turns
const CHECK_EVERY = 10; // turns between hash checkpoints (relay/room.js)
const RETRY_MS = [250, 500, 1000, 2000, 4000]; // between reconnect attempts (the last repeats)
const PONG_MS = 2000; // a socket that does not answer a ping in this long is taken for dead
const BEAT_MS = 1000; // an ack at least this often, even with no new turn run (a stalled game is not an away seat)
const LOBBY_TRIES = 4; // failed connections before the lobby says the relay cannot be reached
const TRAIL = 300; // ticks of state hashes kept

export class Net {
  /**
   * @param {object} o
   * @param {string} o.url the relay (ws://host:port/)
   * @param {string} [o.room] a room code to join; none opens a new room
   * @param {string} o.name the player's name
   * @param {() => object|null} o.game the current lockstep Game (takeOrders, receiveTurn, nextTurn, tick, stateHash)
   * @param {object} [o.on] callbacks: seat, lobby, start, away, back, left, desync, error, status
   * @param {typeof WebSocket} [o.WebSocket]
   */
  constructor({ url, room = '', name, build = '', game, on = {}, WebSocket: WS = globalThis.WebSocket, token = null }) {
    Object.assign(this, { url, room, name, build, game, on, WS, token });
    this.seat = -1; this.setup = null; this.turns = new Map(); this.acked = -1; this.checks = new Map();
    this.trail = new Map(); // tick -> state hash, the last TRAIL ticks (a desync's first diverging tick is in it)
    this.retries = 0; this.closed = false; this.ws = null; this.pingId = 0; this.pongTimer = null; this.retryTimer = null;
    this.ackedAt = 0; this.next = 0; this.queue = []; this.leaving = false; // (orders and a leave wait here while the socket is down)
    this.open();
  }

  // ---- the socket ----
  open() {
    clearTimeout(this.retryTimer); this.retryTimer = null;
    const old = this.ws; this.ws = null;
    if (old) { old.onclose = old.onmessage = null; try { old.close(); } catch { /* gone */ } } // (one socket at a time)
    const q = this.room ? `room=${encodeURIComponent(this.room)}` : 'new=1';
    const ws = new this.WS(`${this.url}${this.url.includes('?') ? '&' : '?'}${q}`); this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.acked = -1; // (back: ack at once, the relay waits for it)
      this.say({ proto: PROTO, name: this.name, build: this.build, token: this.token, next: this.setup ? this.game()?.nextTurn() ?? this.next : undefined });
    };
    ws.onmessage = (e) => { if (this.ws !== ws) return; let m; try { m = JSON.parse(e.data); } catch { return; } if (m && typeof m === 'object') this.message(m); };
    ws.onclose = () => { if (this.ws === ws) this.dropped(); };
    ws.onerror = () => {}; // (close follows)
  }
  say(m) { if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(m)); return true; } return false; }
  /** Say it now, or as soon as the socket is back and seated (orders, a leave: they must not be lost). */
  sayOrKeep(m) { if (this.closed) return; if (this.seat < 0 || this.queue.length || !this.say(m)) this.queue.push(m); }
  dropped() {
    this.ws = null; this.seat = this.setup ? this.seat : -1; clearTimeout(this.pongTimer);
    if (this.closed) return;
    // The lobby gives up after a few tries (nothing is lost yet); a game keeps trying (the relay waits for it).
    if (!this.setup && this.retries >= LOBBY_TRIES) { this.on.error?.({ code: 'unreachable', msg: 'Can\'t connect. Check your Internet and try again' }); this.close(); return; }
    this.status('reconnecting');
    const wait = RETRY_MS[Math.min(this.retries++, RETRY_MS.length - 1)];
    this.retryTimer = setTimeout(() => { if (!this.closed) this.open(); }, wait);
  }
  status(s) { this.on.status?.(s); }
  /** The page is in view again (phones suspend hidden pages and their sockets): make sure the socket still works. */
  wake() {
    if (this.closed) return;
    if (!this.ws || this.ws.readyState > 1) { this.open(); return; } // (a pending retry: now instead)
    if (this.ws.readyState !== 1) return; // (connecting: its own open or close will tell)
    const id = ++this.pingId; this.say({ t: 'ping', id });
    clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => { if (this.pingId === id) { const ws = this.ws; this.ws = null; try { ws.close(); } catch { /* gone */ } this.dropped(); } }, PONG_MS);
  }
  /** Give the game up (the relay concedes for this seat at once) and leave: once it is said, or after a few seconds. */
  leave() {
    if (this.closed) return;
    this.leaving = true; this.on = {}; // (whoever made it has moved on: nothing more is told)
    this.sayOrKeep({ t: 'leave' });
    if (!this.ws) this.open(); // (offline: try now, not after the backoff)
    setTimeout(() => this.close(), this.queue.length ? 15000 : 300);
  }
  /** Leave for good. */
  close() {
    this.closed = true; clearTimeout(this.pongTimer); clearTimeout(this.retryTimer);
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onclose = ws.onmessage = null; try { ws.close(); } catch { /* gone */ } }
  }
  /** Forget the last game (a rematch's lobby): its setup, turns, acks and hashes, and orders not sent. */
  again() {
    this.setup = null; this.ended = false; this.turns.clear(); this.checks.clear(); this.trail.clear();
    this.acked = -1; this.ackedAt = 0; this.next = 0; this.queue = this.queue.filter(m => m.t !== 'orders');
  }
  flush() {
    while (this.queue.length && this.say(this.queue[0])) this.queue.shift();
    if (this.leaving && !this.queue.length) setTimeout(() => this.close(), 300);
  }

  // ---- the lobby ----
  race(race) { this.say({ t: 'race', race }); }
  map(map) { this.say({ t: 'map', map }); }
  ready(ready = true) { this.say({ t: 'ready', ready }); }
  /** After a game: want another in this room (or not any more). */
  rematch(want) { this.sayOrKeep({ t: 'rematch', want }); }
  /** This side's game has ended (the relay stops the clock once every side's has; acks then count the turns in). */
  over() { if (!this.ended) { this.ended = true; this.sayOrKeep({ t: 'over' }); } }
  /** The game is set up (the clock may start). */
  loaded() { this.say({ t: 'loaded' }); }

  // ---- messages ----
  message(m) {
    switch (m.t) {
      case 'seat':
        this.seat = m.seat; this.token = m.token; this.room = m.room; this.retries = 0;
        this.status('online'); this.on.seat?.(m); this.flush(); break;
      case 'lobby':
        if (!Array.isArray(m.seats)) break;
        if (this.setup) this.again(); // (a rematch: the room is a lobby again)
        this.on.lobby?.(m); break;
      case 'rematch': if (Array.isArray(m.seats)) this.on.rematch?.(m.seats); break;
      case 'start':
        if (!this.setup) { this.setup = m.setup; this.on.start?.(m.setup, this.seat); } // (a resume re-sends it)
        break;
      case 'turn': if (validTurn(m)) this.turns.set(m.n, m.o); break;
      case 'away': case 'back': case 'left': this.on[m.t]?.(m.seat); break;
      case 'desync': this.on.desync?.(m.turn); break;
      case 'error': this.on.error?.(m); if (['update', 'version', 'full', 'started', 'noroom', 'replaced'].includes(m.code)) this.close(); break;
      case 'notice': this.on.notice?.(m); break;
      case 'pong': if (m.id === this.pingId) clearTimeout(this.pongTimer); break;
    }
  }

  // ---- each frame ----
  /** Send the game's new orders, give it every turn that has arrived in order, and ack. Returns how many turns are
   *  waiting to run (the client runs faster to catch up when it is behind). */
  pump() {
    const g = this.game();
    if (!g || !this.setup) return 0;
    this.next = g.nextTurn(); // (for a hello once the game is gone: a leaving Net needs no replay)
    const out = g.takeOrders();
    if (out.length) this.sayOrKeep({ t: 'orders', w: Array.from(out) });
    for (let n = g.nextTurn(); this.turns.has(n); n++) {
      const o = this.turns.get(n); this.turns.delete(n);
      const seats = Uint8Array.from(o.map(e => e[0])), lens = Uint32Array.from(o.map(e => e[1].length));
      const words = Float64Array.from(o.flatMap(e => e[1]));
      if (!g.receiveTurn(n, seats, lens, words)) break;
    }
    this.ackIfDue(g);
    return Math.max(0, g.nextTurn() * TICKS_PER_TURN - g.tick());
  }

  /** Call after each tick the game runs: at a checkpoint (turn k, a multiple of CHECK_EVERY: the world at tick k*3,
   *  when every turn before k has run) it notes the state hash, for the next ack. */
  ticked() {
    const g = this.game(); if (!g) return;
    const t = g.tick(), h = g.stateHash() | 0;
    this.trail.set(t, h); this.trail.delete(t - TRAIL);
    if (t % (CHECK_EVERY * TICKS_PER_TURN) === 0) this.checks.set(t / TICKS_PER_TURN, h);
  }

  ackIfDue(g) {
    const done = this.ended ? g.nextTurn() - 1 : Math.floor(g.tick() / TICKS_PER_TURN) - 1; // (the last turn fully run; over: the last one in)
    const now = Date.now();
    if (done - this.acked < ACK_EVERY && now - this.ackedAt < BEAT_MS) return;
    if (this.seat < 0) return; // (not seated again yet)
    this.acked = Math.max(this.acked, done); this.ackedAt = now;
    const msg = { t: 'ack', turn: done };
    if (this.checks.size) {
      const cp = Math.max(...this.checks.keys());
      msg.check = { turn: cp, hash: this.checks.get(cp) };
      this.checks.clear();
    }
    this.say(msg);
  }
}

/** A relay's turn is `{n, o: [[seat, [numbers...]], ...]}`; anything else is not fed to the game. */
function validTurn(m) {
  return Number.isInteger(m.n) && m.n >= 0 && Array.isArray(m.o) &&
    m.o.every(e => Array.isArray(e) && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < 256 && Array.isArray(e[1]) && e[1].every(w => typeof w === 'number'));
}
