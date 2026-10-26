// The network side of a multiplayer game (docs/MULTIPLAYER.md): one WebSocket to the relay. It joins or opens a room,
// follows the lobby, and once the game starts it carries the game's orders out and the relay's turns in. The turns
// go to the game strictly in order (a turn that arrives early waits for the gap before it); the game runs a tick only
// once its turn is in (the `Game`'s lockstep: crates/endfall-sim/src/lockstep.rs). Every few turns it acks the last
// turn run, with the state hash at the latest checkpoint. When the socket drops it reconnects and resumes from the
// next turn it expects; when the page comes back into view it checks the socket is still alive.
//
// It does not own the game: `game()` returns the current lockstep `Game` (or null before the start), so the same class
// serves the browser (one game, through src/engine) and the tests (several games in one process).

export const PROTO = 1;
const TICKS_PER_TURN = 3;
const ACK_EVERY = 3; // turns
const CHECK_EVERY = 10; // turns between hash checkpoints (relay/room.js)
const RETRY_MS = [250, 500, 1000, 2000, 4000]; // between reconnect attempts (the last repeats)
const PONG_MS = 2000;
const TRAIL = 300; // ticks of state hashes kept // a socket that does not answer a ping in this long is taken for dead

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
  constructor({ url, room = '', name, game, on = {}, WebSocket: WS = globalThis.WebSocket, token = null }) {
    Object.assign(this, { url, room, name, game, on, WS, token });
    this.seat = -1; this.setup = null; this.turns = new Map(); this.acked = -1; this.checks = new Map();
    this.trail = new Map(); // tick -> state hash, the last TRAIL ticks (a desync's first diverging tick is in it)
    this.retries = 0; this.closed = false; this.ws = null; this.pingId = 0; this.pongTimer = null;
    this.open();
  }

  // ---- the socket ----
  open() {
    const q = this.room ? `room=${encodeURIComponent(this.room)}` : 'new=1';
    const ws = new this.WS(`${this.url}${this.url.includes('?') ? '&' : '?'}${q}`); this.ws = ws;
    ws.onopen = () => {
      this.retries = 0; this.acked = -1; // (back: ack at once, the relay waits for it)
      this.say({ proto: PROTO, name: this.name, token: this.token, next: this.setup ? this.game()?.nextTurn() ?? 0 : undefined });
      this.status('online');
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.message(m); };
    ws.onclose = () => { if (this.ws === ws) this.dropped(); };
    ws.onerror = () => {}; // (close follows)
  }
  say(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  dropped() {
    this.ws = null; clearTimeout(this.pongTimer);
    if (this.closed) return;
    this.status('reconnecting');
    const wait = RETRY_MS[Math.min(this.retries++, RETRY_MS.length - 1)];
    setTimeout(() => { if (!this.closed) this.open(); }, wait);
  }
  status(s) { this.on.status?.(s); }
  /** The page is in view again (phones suspend hidden pages and their sockets): make sure the socket still works. */
  wake() {
    if (this.closed) return;
    if (!this.ws || this.ws.readyState > 1) { if (!this.ws) this.open(); return; }
    const id = ++this.pingId; this.say({ t: 'ping', id });
    clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => { if (this.pingId === id) { const ws = this.ws; this.ws = null; try { ws.close(); } catch { /* gone */ } this.dropped(); } }, PONG_MS);
  }
  /** Give the game up (the relay concedes for this seat at once) and leave. */
  leave() { this.say({ t: 'leave' }); setTimeout(() => this.close(), 300); }
  /** Leave for good. */
  close() { this.closed = true; clearTimeout(this.pongTimer); try { this.ws?.close(); } catch { /* gone */ } }

  // ---- the lobby ----
  race(race) { this.say({ t: 'race', race }); }
  map(map) { this.say({ t: 'map', map }); }
  ready(ready = true) { this.say({ t: 'ready', ready }); }
  /** The game is set up (the clock may start). */
  loaded() { this.say({ t: 'loaded' }); }

  // ---- messages ----
  message(m) {
    switch (m.t) {
      case 'seat': this.seat = m.seat; this.token = m.token; this.room = m.room; this.on.seat?.(m); break;
      case 'lobby': this.on.lobby?.(m); break;
      case 'start':
        if (!this.setup) { this.setup = m.setup; this.on.start?.(m.setup, this.seat); } // (a resume re-sends it)
        break;
      case 'turn': this.turns.set(m.n, m.o); break;
      case 'away': case 'back': case 'left': this.on[m.t]?.(m.seat); break;
      case 'desync': this.on.desync?.(m.turn); break;
      case 'error': this.on.error?.(m); if (['update', 'full', 'started', 'noroom', 'replaced'].includes(m.code)) this.close(); break;
      case 'pong': if (m.id === this.pingId) clearTimeout(this.pongTimer); break;
    }
  }

  // ---- each frame ----
  /** Send the game's new orders, give it every turn that has arrived in order, and ack. Returns how many turns are
   *  waiting to run (the client runs faster to catch up when it is behind). */
  pump() {
    const g = this.game();
    if (!g || !this.setup) return 0;
    const out = g.takeOrders();
    if (out.length) this.say({ t: 'orders', w: Array.from(out) });
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
    const done = Math.floor(g.tick() / TICKS_PER_TURN) - 1; // (the last turn fully run)
    if (done < 0 || done - this.acked < ACK_EVERY) return;
    this.acked = done;
    const msg = { t: 'ack', turn: done };
    if (this.checks.size) {
      const cp = Math.max(...this.checks.keys());
      msg.check = { turn: cp, hash: this.checks.get(cp) };
      this.checks.clear();
    }
    this.say(msg);
  }
}
