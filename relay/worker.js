// The relay on Cloudflare (Notion: Multiplayer design, Hosting): a Worker that sends each WebSocket to its room's Durable Object,
// one object per room code (on the WebSocket Hibernation API: RoomObject), which runs relay/room.js's rules (the same as relay/server.mjs's, which is the Node
// adapter). A client connects to wss://host/?room=CODE (or ?new=1 to open a room) and says hello. Config and deploy:
// relay/wrangler.toml. Also the device test's reports over HTTP (relay/bench.js): POST /bench, GET /bench/<CODE>, kept
// by one more object of the same class, named 'bench'; and the rooms' limits (relay/limits.js), one more, 'limits'
// (room codes are six capitals: never those names). And GET /version (relay/version.js): its protocol and the build CI
// deployed (the RELAY_BUILD var), which CI reads before deploying.
//
// The Worker's front door (the codes, the limits, which object a request goes to) is relay/edge.js; this file is the
// entry module, which may export only handlers and classes.
import { Room, TURN_MS, MAX_SEATS, QUIET_SAY, QUIET_CLOSE } from './room.js';
import { BenchStore } from './bench.js';
import { Limits, addressKey, messageBucket, MSG_CLOSE, LEASE_MS, BEAT_MS, LEASE_SLACK, MSG_REPORT, ROOM_HEADER, HOLD_HEADER, MSGS_HEADER, CLAIM_HEADER, END_HEADER } from './limits.js';
import { relay, CLOUDFLARE, send, ROOM_IDLE_MS } from './edge.js';

export default relay();

const HELLO_MS = 10000; // a connection that has not said hello by then is closed
const MAX_MSG = 64 * 1024;
const SAVE_MS = 1000; // storage writes of a room's record at most this often (the last change is always written)
const random = () => crypto.getRandomValues(new Uint32Array(1))[0];
const newId = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), x => x.toString(36)).join('');

/** A socket's side of the room. Its attachment (`att`, kept by the runtime with the socket through a hibernation, at
 *  most 2 KB): its id, the address it came from, when it connected, whether its hello seated it, the token of its seat,
 *  that seat's ready and build, when the room was last active, and `gone` once this side is done with it. Its message
 *  bucket is not kept: a hibernation takes ten seconds without a message on any socket, which fills every bucket. */
class Conn {
  constructor(ws, att) { this.ws = ws; this.att = att; this.sent = JSON.stringify(att); this.take = messageBucket(); this.silent = null; }
  send(data) { this.ws.send(data); }
}

/** A room's Durable Object: its Room and its connections, on the WebSocket Hibernation API: the runtime keeps the sockets
 *  (`state.acceptWebSocket`) and calls `webSocketMessage`, `webSocketClose` and `webSocketError`, and once nothing has
 *  happened for a few seconds and no timer is pending it may drop the object from memory with its sockets still open
 *  (no duration billed meanwhile); the next event makes a new object, which `wake`s: the room from its record, each
 *  socket back on its seat by its attachment (`Room.rebind`). So a timer runs only while it must: the turn clock while a
 *  game runs and anyone is connected (a lockstep game needs its 100 ms turns; no hibernation then), a hello's ten
 *  seconds, a second's wait for a record's write. Everything else a lobby, or a room whose game is over, waits for is
 *  the object's one alarm (`schedule`: the first of a held seat's hold running out, an over game's grace, the room
 *  going quiet, Room.due; with nobody connected, the record's end): no clock, nothing billed while nobody does anything.
 *
 *  The record in storage (the code; when it was last used and active; whether it counts in everyone's rooms; whether its
 *  game started; the lobby itself, Room.keep: its seats with their spots, teams, names, races, tokens and addresses,
 *  the addresses the host barred, the AI seats and their levels, the map; or a game that is over, Room.keepOver: its
 *  seats and setup, not its turns) brings the room back after a hibernation, and an evicted lobby (its sockets gone with
 *  a reset or a deploy) as it was: a seat held for a player who switched apps (relay/room.js, LOBBY_HOLD_MS) is still
 *  theirs, and an empty lobby comes back for a friend who joins late. A ready, a seat's build and the last activity
 *  live in the sockets' attachments (they go with the socket; no storage write for a ready). The record is written when
 *  it changes, at most once a SAVE_MS (the last change always, and at once when the last socket closes), and deleted by
 *  the alarm once the room has been empty ROOM_IDLE_MS. A game in progress is not kept: an evicted or redeployed one is
 *  over (its players are told the room is gone). A room quiet for QUIET_MS (relay/room.js: a lobby, or a game that is
 *  over) is closed: everyone told so, its sockets closed with QUIET_CLOSE, its record deleted. A join to a code with no
 *  room is answered 404, with no socket: the Worker tells the player and counts the miss (relay/edge.js). The objects
 *  named 'bench' and 'limits' are no rooms: one keeps the device test's reports (relay/bench.js BenchStore), the other
 *  counts rooms opened and codes missed (relay/limits.js Limits, in memory) and keeps the spend ceiling (its Ceiling, in
 *  its storage): a room holds a slot there from its opening (the lease the Worker reserved, claimed at once) until it is
 *  forgotten, renewed by `tell` (each BEAT_MS while its game's clock runs; else to its next alarm and LEASE_SLACK beyond,
 *  so a hibernated lobby needs no word), with its messages; a room that dies without a word holds it only to the end of
 *  its lease. A room tells it once, when its first hello
 *  seats someone (`counted`, in the record; a lobby kept from before it was a field was counted when it was new): a
 *  room nobody sits in costs everyone's budget nothing. */
export class RoomObject {
  constructor(state, env, platform = CLOUDFLARE) {
    this.state = state; this.env = env; this.platform = platform; this.storage = state?.storage;
    this.room = null; this.conns = new Set(); this.byWs = new WeakMap(); this.byId = new Map(); this.timer = null;
    this.lastUsed = 0; this.counted = true; this.phase = null; // (the phase the record was last brought up to date for)
    this.saved = ''; this.savedAt = 0; this.saveTimer = null; // (the record last written, when; a write waiting)
    this.alarmAt = null; this.awake = false; this.waking = null;
    this.code = null; this.heldUntil = 0; this.claim = ''; this.msgs = 0; // (the spend ceiling: `tell`)
  }

  /** No timer pending: the runtime may hibernate this object (the tests' fake runtime asserts it before it does). */
  get hibernatable() { return !this.timer && !this.saveTimer && [...this.conns].every(c => !c.silent); }

  async fetch(req) {
    const host = new URL(req.url).hostname;
    if (host === 'bench') return (this.bench ||= new BenchStore(this.storage)).fetch(req); // (the reports' object)
    if (host === 'limits') return (this.limits ||= new Limits(undefined, this.storage)).fetch(req); // (the rooms' limits' object: in memory, the spend ceiling in storage)
    await this.wake();
    const q = new URL(req.url).searchParams, code = q.get('code'), now = Date.now();
    this.msgs += 20; // (a request costs twenty messages: relay/limits.js MSGS_PER_ROOM_HOUR)
    const saved = this.room ? null : await this.storage?.get('room');
    const recent = saved && now - saved.used < ROOM_IDLE_MS;
    if (q.get('new')) {
      const inUse = this.room ? this.conns.size || now - this.lastUsed < ROOM_IDLE_MS : recent;
      if (inUse) return new Response('Taken', { status: 409 });
      this.open(code);
      this.claim = q.get('lease') || ''; this.heldUntil = 0; this.tell(LEASE_MS); // (its slot: the lease its opening reserved, now its code's)
    } else if (!this.room && recent && !saved.started) this.open(code, saved.lobby); // (an evicted lobby: back, its seats held)
    if (!this.room) return new Response('No room', { status: 404 }); // (the Worker says so, and counts the miss)
    const [client, ws] = this.platform.pair();
    this.accept(ws, addressKey(req.headers.get('CF-Connecting-IP') || ''));
    return this.platform.respond(client);
  }

  /** A new room, or a kept lobby back (its record checked: 2 to MAX_SEATS seats, each an object; anything else, or a
   *  record that does not restore (Room.restore: a spot twice, none at 0), is an empty lobby). */
  open(code, kept) {
    const now = Date.now(), room = (n) => new Room({ code, seats: n, send, kick: (c, k) => this.kick(c, k), seed: random(), now });
    const seats = Array.isArray(kept?.seats) ? kept.seats.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
    this.room = room(2);
    if (seats.length >= 2 && seats.length <= MAX_SEATS) {
      try { const r = room(seats.length); if (r.restore({ ...kept, seats }, now)) this.room = r; } catch { /* a bad record: an empty lobby */ }
    }
    this.phase = 'lobby'; this.saved = ''; this.counted = !!kept; this.code = code;
  }

  /** Back in memory (a new object: after a hibernation, an eviction, or for the first time): the room from its record
   *  (a lobby that is recent or still has sockets; a game that is over) and every socket the runtime kept, each on its
   *  seat by its attachment. Once per object; null once awake (the handlers then run at once, in order). */
  wake() {
    if (this.awake) return null;
    return (this.waking ||= this.load().catch((e) => { this.waking = null; throw e; })); // (a failed read: the next event tries again)
  }
  async load() {
    const [rec, alarm] = await Promise.all([this.storage?.get('room'), this.storage?.getAlarm?.()]);
    const now = Date.now(), sockets = this.state?.getWebSockets?.() || [];
    this.alarmAt = alarm ?? null; this.lastUsed = Math.max(this.lastUsed, Number(rec?.used) || 0);
    if (typeof rec?.code === 'string') this.code = rec.code; // (also a game's, gone: its slot given back when the record goes)
    if (rec && !rec.started && (sockets.length || now - rec.used < ROOM_IDLE_MS)) this.open(rec.code, rec.lobby);
    else if (rec?.over) {
      const r = new Room({ code: rec.code, send, kick: (c, k) => this.kick(c, k), seed: random(), now });
      try { if (r.restoreOver(rec.over, now)) { this.room = r; this.phase = 'over'; } } catch { /* a bad record: no room */ }
    }
    if (this.room) {
      this.counted = rec.counted ?? true;
      this.saved = JSON.stringify({ started: rec.started, counted: rec.counted, lobby: rec.lobby, over: rec.over });
      this.room.active = Number(rec.active) || Number(rec.used) || now;
    }
    this.awake = true;
    for (const ws of sockets) this.adopt(ws);
    if (this.conns.size) this.lastUsed = now;
    for (const c of this.conns) if (this.room) this.room.active = Math.max(this.room.active, Number(c.att.active) || 0); // (a ready, a race: no write, but in every socket's attachment)
    if (!this.room) { for (const c of [...this.conns]) this.drop(c, 'The room is gone: this game is over'); return; } // (a game in progress, or a record gone: nothing to come back to)
    if (this.room.phase !== 'game') this.room.tick(now); // (a hold that ran out meanwhile: over)
    for (const c of this.conns) {
      if (c.att.seated) continue;
      const left = c.att.at + HELLO_MS - now; // (a hello's time, from when it connected)
      if (left <= 0) this.kick(c); else c.silent = setTimeout(() => { c.silent = null; if (!c.att.seated) this.kick(c); }, left);
    }
    this.after();
  }
  /** A socket the runtime kept, back in this object (its attachment says what it was; one this side was done with, or
   *  one without an attachment, stays out). Returns its Conn, or null. */
  adopt(ws) {
    let att = null;
    try { att = ws.deserializeAttachment?.(); } catch { /* none */ }
    if (!att || typeof att !== 'object' || att.gone || typeof att.id !== 'string') return null;
    const c = new Conn(ws, att);
    this.conns.add(c); this.byWs.set(ws, c); this.byId.set(att.id, c);
    if (att.seated) this.room?.rebind(c, att.token, att);
    return c;
  }
  /** The Conn of a socket an event came on (by the socket, else by its attachment's id: the runtime may hand the same
   *  socket over as another object), adopted if this object has not seen it yet. */
  connOf(ws) {
    const c = this.byWs.get(ws);
    if (c) return c;
    let id = null;
    try { id = ws.deserializeAttachment?.()?.id; } catch { /* none */ }
    const k = id && this.byId.get(id);
    if (k) { k.ws = ws; this.byWs.set(ws, k); return k; }
    return this.adopt(ws);
  }

  /** Someone sat in the room: the first time since it was opened new, the limits object counts it in everyone's (not
   *  waited for; a failure counts nothing). */
  seated() {
    if (this.counted) return;
    this.counted = true;
    const ns = this.env?.ROOMS;
    try { ns?.get(ns.idFromName('limits')).fetch(new Request('https://limits/seated', { method: 'POST' })).catch(() => {}); } catch { /* not counted */ }
  }
  /** The record as it would be written now, but for its times (null in a game: only that it started). */
  record() {
    const r = this.room, lobby = r.phase === 'lobby';
    return JSON.stringify({ started: !lobby, counted: this.counted, lobby: lobby ? r.keep() : null, over: r.phase === 'over' ? r.keepOver() : null });
  }
  /** Keep the room's record: only if it changed, at most once a SAVE_MS (a trailing write for the last change). */
  save() {
    if (this.saveTimer) return; // (the waiting write takes the latest state)
    const wait = this.savedAt + SAVE_MS - Date.now();
    if (wait > 0) { this.saveTimer = setTimeout(() => { this.saveTimer = null; this.write(); }, wait); return; }
    this.write();
  }
  /** Write now (a waiting write is done with). */
  write() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    const room = this.room; if (!room) return;
    const rec = this.record();
    if (rec === this.saved) return;
    this.saved = rec; this.savedAt = Date.now();
    this.storage?.put('room', { code: room.code, used: Date.now(), active: room.active, ...JSON.parse(rec) }).catch(() => { this.saved = ''; }); // (failed: written again with the next change)
    // (a record always has its alarm, so none outlives its room: also when the object is reset with people in it, and
    // `gone` never runs)
    this.schedule(true);
  }

  /** After every event: the clock on or off for the phase; outside a game, the record kept if it changed, the sockets'
   *  attachments brought up to date, and the alarm set for what is due next. */
  after() {
    const room = this.room; if (!room) return;
    const keep = this.counted; // (a room nobody has sat in keeps no record, and sets no alarm)
    if (room.phase !== this.phase) { this.phase = room.phase; if (keep) this.save(); } // (a game started: no lobby to bring back; over, or a rematch's lobby: one again)
    this.clock();
    if (room.phase === 'game') return;
    if (keep && this.record() !== this.saved) this.save();
    this.sync();
    this.schedule();
  }
  /** The turn clock: only while a game runs and anyone is connected (at once, then every quarter turn). */
  clock() {
    const on = this.room?.phase === 'game' && this.conns.size > 0;
    if (on && !this.timer) {
      const room = this.room; room.tick(Date.now()); this.beat();
      this.timer = setInterval(() => { room.tick(Date.now()); this.beat(); if (room.phase !== 'game') this.after(); }, TURN_MS / 4);
    } else if (!on && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  /** Each socket's attachment as the room has it now (written only when it changed). */
  sync() {
    const r = this.room;
    for (const c of this.conns) {
      const s = c.att.seated ? r.seats.find(x => x.conn === c) : null;
      const att = { ...c.att, token: s?.token || '', ready: !!s?.ready, build: s?.build || '', active: r.active };
      const j = JSON.stringify(att);
      if (j === c.sent) continue;
      c.att = att; c.sent = j;
      try { c.ws.serializeAttachment?.(att); } catch { /* closed meanwhile */ }
    }
  }
  /** When the alarm should next go off (ms; Infinity: never): in a game, ROOM_IDLE_MS from now (the clock is the
   *  game's; the alarm only keeps the record from outliving the room, and sets itself again while it is in use); with
   *  someone connected, what the room has due (Room.due: a hold, a grace, the room going quiet); with nobody, the
   *  record's end. */
  deadline() {
    const r = this.room;
    if (r?.phase === 'game') return Date.now() + ROOM_IDLE_MS;
    if (r && this.conns.size) return r.due();
    return this.lastUsed ? this.lastUsed + ROOM_IDLE_MS : Infinity;
  }
  /** Set the alarm for the deadline (`setAlarm`), and hold the room's slot in the spend ceiling until it goes off, and
   *  LEASE_SLACK beyond: a hibernated room says nothing until then. */
  schedule(force = false) {
    this.setAlarm(force);
    if (this.alarmAt !== null) this.holdTo(this.alarmAt + LEASE_SLACK);
  }
  /** Set the alarm for the deadline: when it is sooner than the one set (one set sooner sets the next itself when it
   *  goes off), or always (`force`: a write, the alarm's own run). */
  setAlarm(force = false) {
    if (!force && !this.counted) return; // (a room nobody has sat in: nothing due but a hello, a timer's)
    const t = this.deadline();
    if (!Number.isFinite(t) || (!force && this.alarmAt !== null && this.alarmAt <= t)) return;
    this.alarmAt = t;
    this.storage?.setAlarm?.(t)?.catch?.(() => { this.alarmAt = null; });
  }
  /** The alarm: what was due is done (a hold, a grace: Room.tick); a quiet room is closed; a room empty ROOM_IDLE_MS (by
   *  its last use, in memory or in its record) goes, its record with it (its code is free; nothing of it, names, tokens
   *  or barred addresses, is kept); anything else sets the alarm again for what is due next. */
  async alarm() {
    this.alarmAt = null;
    await this.wake();
    const now = Date.now(), room = this.room;
    if (room && room.phase !== 'game') room.tick(now);
    if (room && this.conns.size && room.idle(now)) { await this.shut(); return; }
    if (!this.conns.size) {
      const rec = await this.storage?.get('room');
      const last = Math.max(this.lastUsed, Number(rec?.used) || 0);
      if (now - last >= ROOM_IDLE_MS) { await this.forget(); return; }
      this.lastUsed = last;
    }
    this.after(); this.schedule(true);
  }
  /** A quiet room closes: everyone told why, every socket closed (QUIET_CLOSE), the record and the alarm gone. */
  async shut() {
    for (const c of [...this.conns]) this.drop(c, QUIET_SAY, QUIET_CLOSE);
    await this.forget();
  }
  /** A word to the limits object about this room's slot in the spend ceiling (relay/limits.js Ceiling, a lease charged
   *  ahead): held `hold` ms from now, with the messages since the last word (and, the first time, the lease its opening
   *  reserved), or given back (`end`). Not waited for; a word lost: the lease runs out by itself, paid to its end. */
  tell(hold, end = false) {
    const ns = this.env?.ROOMS, code = this.code;
    if (!code) return;
    this.heldUntil = end ? 0 : Math.max(this.heldUntil, Date.now() + hold);
    const headers = { [ROOM_HEADER]: code, [HOLD_HEADER]: String(Math.max(0, Math.round(hold))), [MSGS_HEADER]: String(this.msgs) };
    if (this.claim) headers[CLAIM_HEADER] = this.claim;
    if (end) headers[END_HEADER] = '1';
    this.msgs = 0; this.claim = '';
    try { ns?.get(ns.idFromName('limits')).fetch(new Request('https://limits/beat', { method: 'POST', headers })).catch(() => {}); } catch { /* not told */ }
  }
  /** The slot held at least until `end` (a word only when the lease held ends sooner; after a wake, the first is sent:
   *  what was held is not kept). */
  holdTo(end) { if (end > this.heldUntil) this.tell(end - Date.now()); }
  /** A game's clock: the slot renewed, LEASE_MS ahead, every BEAT_MS. */
  beat() { if (Date.now() + LEASE_MS - BEAT_MS >= this.heldUntil) this.tell(LEASE_MS); }

  /** The room gone from memory and storage (its slot in the spend ceiling given back). */
  async forget() {
    this.tell(0, true); this.code = null;
    clearTimeout(this.saveTimer); this.saveTimer = null; clearInterval(this.timer); this.timer = null;
    this.room = null; this.saved = ''; this.phase = null; this.lastUsed = 0;
    await this.storage?.deleteAll?.();
    await this.storage?.deleteAlarm?.()?.catch?.(() => {});
  }
  /** A socket out of a room that is not there (any more): told so, closed, and done with. */
  drop(c, msg, code = 1000) {
    send(c, { t: 'error', code: 'noroom', msg });
    this.done(c);
    try { c.ws.close(code, code === QUIET_CLOSE ? 'Room closed' : undefined); } catch { /* closed already */ }
  }
  /** This side is done with a socket: out of the object, its attachment marked so (a wake leaves it out). */
  done(c) {
    if (!this.conns.delete(c)) return false;
    clearTimeout(c.silent); c.silent = null; this.byWs.delete(c.ws); this.byId.delete(c.att.id);
    c.att = { ...c.att, gone: true };
    try { c.ws.serializeAttachment?.(c.att); } catch { /* closed already */ }
    return true;
  }

  /** A connection from address `from` (its key: a host's REMOVE bars it from the room, relay/room.js), accepted for
   *  hibernation. */
  accept(ws, from = '') {
    const now = Date.now(), att = { id: newId(), from, at: now, seated: false, token: '', ready: false, build: '', active: 0 };
    this.state.acceptWebSocket(ws);
    try { ws.serializeAttachment?.(att); } catch { /* kept in memory only */ }
    const c = new Conn(ws, att);
    this.conns.add(c); this.byWs.set(ws, c); this.byId.set(att.id, c); this.lastUsed = now;
    this.holdTo(now + HELLO_MS + LEASE_SLACK); // (a room nobody sat in has no alarm: its slot to the hello's time)
    if (this.room.phase !== 'game') this.room.tick(now); // (a hold that ran out while nobody was here is over before anyone is seated)
    c.silent = setTimeout(() => { c.silent = null; if (!c.att.seated) this.kick(c); }, HELLO_MS);
    this.clock(); // (a game's clock, at once, if it waited for someone)
  }
  /** The runtime's events, each after a wake if the object is new (in order: a second event waits for the same wake). */
  webSocketMessage(ws, data) { const w = this.wake(); if (w) return w.then(() => this.message(ws, data)); this.message(ws, data); }
  webSocketClose(ws) { const w = this.wake(); if (w) return w.then(() => this.closed(ws)); this.closed(ws); }
  webSocketError(ws) { return this.webSocketClose(ws); }
  message(ws, data) {
    const c = this.connOf(ws), room = this.room;
    if (!c) { try { ws.close(1000); } catch { /* closed */ } return; } // (one this side is done with)
    if (!room) { this.drop(c, 'The room is gone: this game is over'); return; }
    if (typeof data !== 'string' || data.length > MAX_MSG) { this.kick(c); return; }
    if (!c.take()) { this.kick(c, MSG_CLOSE); return; } // (a flood: the client reconnects by itself, relay/limits.js)
    if (++this.msgs >= MSG_REPORT) this.tell(0); // (a flood is charged as it comes: relay/limits.js MSGS_PER_ROOM_HOUR)
    let msg; try { msg = JSON.parse(data); } catch { return; }
    const now = Date.now(); this.lastUsed = now;
    if (room.phase !== 'game') room.tick(now); // (no clock outside a game: the room's time brought up to now)
    if (!c.att.seated) {
      if (room.connect(c, msg, c.att.from) < 0) { this.kick(c); return; }
      c.att = { ...c.att, seated: true }; clearTimeout(c.silent); c.silent = null;
      this.seated();
    } else room.receive(c, msg);
    this.after();
  }
  closed(ws) {
    const c = this.connOf(ws);
    try { ws.close(1000); } catch { /* closed already */ } // (the closing handshake, where the runtime does not answer it itself)
    if (c) this.gone(c);
  }
  /** A connection is gone (closed by its client, or kicked): its seat held or away (Room.close). */
  gone(c) {
    if (!this.done(c)) return;
    const room = this.room; if (!room) return;
    const now = Date.now();
    if (room.phase !== 'game') room.tick(now);
    room.close(c); this.lastUsed = now;
    this.after();
    if (!this.conns.size && this.saveTimer) this.write(); // (nobody here: the record now, and goes once idle long enough)
    if (!this.conns.size) this.schedule();
    if (!this.conns.size && !this.counted) this.tell(0, true); // (a room nobody sat in, left: its slot free)
  }
  /** Close a connection (the clean-up after the room's own call has finished: Room.connect kicks a replaced socket
   *  mid-way; closing a socket from this side need not fire its close event). */
  kick(c, code = 1000) {
    try { if (code === MSG_CLOSE) c.ws.close(code, 'Too many messages'); else c.ws.close(code); } catch { /* closed already */ }
    queueMicrotask(() => this.gone(c));
  }
}
