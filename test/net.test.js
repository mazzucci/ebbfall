// Multiplayer end to end in Node: the Node relay, two clients (src/net/net.js) each with its own WASM Game in lockstep.
// Random orders from both with one socket dropped mid-game: both worlds must be the same on every tick they both ran,
// the orders must have changed them, and the relay must see no desync. Then a phone's life: a page suspended for
// longer than the away limit (the other side must not be blamed, the game goes on), the page coming back while a
// reconnect is pending (one socket, nothing closed), and orders given while the socket is down (not lost). And rooms
// of three, four and eight with AI seats (M4): every client runs the AI alike; and one whose sides the start arranges
// (a person's game seat not its lobby spot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { startRelay } from '../relay/server.mjs';
import { Net } from '../src/net/net.js';
import { seatRaces } from '../src/engine/util.js';
import { onlineMap } from '../src/client/maps.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';

let sim, FACTIONS, UNIT, BLDG;
async function load() {
  if (sim) return;
  sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  const data = (await import(new URL('data.js', pkg))).default;
  FACTIONS = data.factions; UNIT = data.schema.unit; BLDG = data.schema.bldg;
}
/** The ids of a client's own units, or seat `seat`'s (the room's seed is random: so are the ids). */
function own(c, seat = c.seat) {
  const U = c.g.units(), n = UNIT.length, id = UNIT.indexOf('id'), team = UNIT.indexOf('team'), out = [];
  for (let o = 0; o < U.length; o += n) if (U[o + team] === seat) out.push(U[o + id]);
  return out;
}
/** Whether seat `seat` has done anything of its own: more units than its start, or something in training. */
function busy(c, seat) {
  const B = c.g.buildings(), n = BLDG.length, team = BLDG.indexOf('team'), q = BLDG.indexOf('queue_len');
  for (let o = 0; o < B.length; o += n) if (B[o + team] === seat && B[o + q] > 0) return true;
  return own(c, seat).length > 4;
}
const fi = (k) => Math.max(0, Object.keys(FACTIONS).indexOf(k));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
/** The room's game for a seat, as main.js and src/engine/core.js's resetGameForSeat build it (its map and size, a RANDOM
 *  seat drawn from the seed, the teams, the AI seats each at its own level). */
const game = (setup, seat) => {
  const m = onlineMap(setup), r = seatRaces(setup.races, setup.seed, Object.keys(FACTIONS)), any = setup.ai.some(a => a);
  return sim.Game.withSeats(m.seed, any ? setup.diff : 1, m.kind, setup.side, Uint32Array.from(r.map(fi)), Uint8Array.from(setup.teams), Uint8Array.from(setup.ai), seat, m.size,
    any && setup.diffs?.length === r.length ? Uint8Array.from(setup.diffs) : undefined);
};

/** A relay, two clients in one room, started (`host(net)`: the host's lobby choices first). Each client: its Net, its
 *  Game, the hash of every tick it ran. */
async function match(relayOpts = {}, host = () => {}) {
  await load();
  const relay = startRelay({ port: 0, ...relayOpts }); await relay.ready;
  const url = `ws://localhost:${relay.port}/`, events = [];
  const client = (name, room) => new Promise(res => {
    const c = { g: null, hashes: new Map(), seat: -1, name, paused: false };
    c.net = new Net({
      url, room, name, game: () => c.g,
      on: {
        seat: (m) => { c.seat = m.seat; res(c); },
        start: (setup, seat) => { c.lobbySeat = c.seat; c.seat = seat; c.setup = setup; c.g = game(setup, seat); c.g.startLockstep(); c.net.loaded(); }, // (seat: its game seat, the lobby's spot no more)
        away: (s) => events.push(`${name} away ${s}`), back: (s) => events.push(`${name} back ${s}`),
        desync: (t) => events.push(`${name} desync ${t}`), error: (m) => events.push(`${name} error ${m.code}`),
      },
    });
  });
  const a = await client('Ann'), b = await client('Bo', a.net.room);
  b.net.race('vael'); host(a.net); await wait(100);
  a.net.ready(); b.net.ready();
  /** Run both clients' frames for `ms` (a paused client runs nothing: a suspended page); `each(elapsed)` per frame. */
  const run = async (ms, each = () => {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      for (const c of [a, b]) {
        if (!c.g || c.paused) continue;
        const waiting = c.net.pump();
        for (let i = 0; i < Math.min(30, waiting) && c.g.canStep(); i++) { c.g.step(); c.net.ticked(); c.hashes.set(c.g.tick(), c.g.stateHash()); }
      }
      each(Date.now() - t0);
      await wait(15);
    }
  };
  const same = () => {
    const common = [...a.hashes.keys()].filter(t => b.hashes.has(t));
    for (const t of common) assert.equal(a.hashes.get(t), b.hashes.get(t), `the same world at tick ${t}`);
    return common;
  };
  /** The hash an order-free game of the same setup has at `tick` (to tell that orders changed the world). */
  const idle = (tick) => { const g = game(a.setup, 0); while (g.tick() < tick) g.step(); return g.stateHash(); };
  const done = async () => { a.net.close(); b.net.close(); await relay.close(); };
  return { relay, a, b, run, same, idle, events, done };
}

test('two clients play through the relay, one drops and comes back, and their worlds stay the same', { skip, timeout: 60000 }, async () => {
  const m = await match({ latency: 30, jitter: 40 });
  const { a, b } = m;
  try {
    let seed = 9; const rand = (n) => (seed = (seed * 1103515245 + 12345) >>> 0) % n;
    let dropped = false;
    await m.run(8000, (el) => {
      for (const c of [a, b]) {
        if (!c.g || rand(4)) continue;
        const ids = own(c); // (now and then another's or a dead id: the sim refuses those)
        c.g.moveTo(rand(5) ? ids[rand(ids.length)] : 1 + rand(400), 200 + rand(1600), 200 + rand(1600));
      }
      if (!dropped && el > 3000) { dropped = true; b.net.ws.close(); } // (b's socket dies mid-game)
    });
    assert.ok(a.g && b.g, 'both games started');
    const common = m.same();
    assert.ok(common.length > 150, `both ran the game (${a.g.tick()} / ${b.g.tick()} ticks)`);
    const last = Math.max(...common);
    assert.notEqual(a.hashes.get(last), m.idle(last), 'the orders reached both games and changed them');
    assert.deepEqual(m.events.filter(e => /desync/.test(e)), [], 'the relay saw no desync');
    assert.ok(dropped && b.g.tick() > 3 * 45, 'b came back and went on after its socket died');
  } finally { await m.done(); }
});

test('a page suspended longer than the away limit: the waiting side is not blamed, and the game goes on', { skip, timeout: 60000 }, async () => {
  const m = await match();
  const { a, b } = m;
  try {
    await m.run(1500);
    b.paused = true; const open = b.net.open; b.net.open = () => {}; b.net.ws.close(); // (suspended: no frames, no socket)
    await m.run(5000);
    b.paused = false; b.net.open = open; b.net.wake();
    const at = a.g.tick();
    await m.run(3000);
    assert.ok(!m.events.includes('Bo away 0'), `the side that stayed was never away (${m.events})`);
    assert.ok(a.g.tick() > at + 45 && b.g.tick() > at + 45, `the game went on (${at} -> ${a.g.tick()} / ${b.g.tick()})`);
    m.same();
  } finally { await m.done(); }
});

test('the page comes back while a reconnect is pending: one socket, the game goes on', { skip, timeout: 60000 }, async () => {
  const m = await match();
  const { a, b } = m;
  try {
    let woke = false;
    await m.run(4000, (el) => {
      if (el > 1500 && !b.dropped) { b.dropped = true; b.net.ws.close(); }
      if (b.dropped && !woke && b.net.ws === null) { woke = true; b.net.wake(); } // (the retry is armed: visible again)
    });
    assert.ok(woke && !b.net.closed, 'still connected');
    assert.ok(!m.events.some(e => /error/.test(e)), `no error (${m.events})`);
    assert.ok(b.g.tick() > 90, `the game went on (${b.g.tick()})`);
    m.same();
  } finally { await m.done(); }
});

test('orders given while the socket is down are sent when it is back, not lost', { skip, timeout: 60000 }, async () => {
  const m = await match();
  const { b } = m;
  try {
    await m.run(1000);
    const open = b.net.open; b.net.open = () => {}; b.net.ws.close();
    await m.run(300);
    const ids = own(b); assert.ok(ids.length > 0);
    for (const id of ids) b.g.moveTo(id, 1800, 1800); // (the only orders of the game)
    await m.run(300);
    b.net.open = open; b.net.wake();
    await m.run(3000);
    const common = m.same(), last = Math.max(...common);
    assert.notEqual(m.a.hashes.get(last), m.idle(last), 'the orders reached both games');
  } finally { await m.done(); }
});

// The lobby on a fake socket and clock: a Net that holds a seat keeps reconnecting (the relay holds the seat for its
// token) until the relay would no longer hold it, one that never got a seat gives up, and a lobby leave is confirmed
// (said again after a half-open socket lost it).
/** A fake relay connection for the lobby: up or down (a socket opened while down closes at once); seated on hello. */
function fakeRelay() {
  const r = { up: true, deaf: false, made: [], hellos: [], said: [] }; // (deaf: the socket is half-open, what is sent is lost)
  r.WS = class {
    constructor(url) {
      this.url = url; this.readyState = 0; r.made.push(this);
      setTimeout(() => { if (this.readyState) return; if (r.up) { this.readyState = 1; this.onopen?.(); } else { this.readyState = 3; this.onclose?.(); } }, 10);
    }
    send(d) {
      const m = JSON.parse(d);
      if (r.deaf) return;
      r.said.push(m.t);
      if (m.t === 'ping') this.onmessage?.({ data: JSON.stringify({ t: 'pong', id: m.id }) });
      if (m.proto) { r.hellos.push(m); this.onmessage?.({ data: JSON.stringify({ t: 'seat', seat: 0, token: m.token || 'tok', room: 'ABCD', proto: m.proto }) }); }
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  };
  return r;
}

test('a lobby Net that holds a seat keeps reconnecting past the lobby\'s tries, and gets its seat back with its token', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = fakeRelay(), errors = [], statuses = [];
  const net = new Net({ url: 'ws://relay/', name: 'Ann', game: () => null, WebSocket: r.WS, on: { error: (m) => errors.push(m.code), status: (s) => statuses.push(s) } });
  t.mock.timers.tick(20);
  assert.equal(net.seat, 0); assert.equal(net.token, 'tok');
  r.up = false; net.ws.close(); // (the phone switched apps: the socket is gone, and stays so a while)
  for (let i = 0; i < 60; i++) t.mock.timers.tick(1000); // (a minute)
  assert.ok(r.made.length > 4 + 8, `it kept trying (${r.made.length} sockets)`);
  assert.deepEqual(errors, [], 'no "Can\'t connect"'); assert.ok(!net.closed);
  assert.ok(r.made.length < 60 / 4 + 10, `the backoff is capped, not a storm (${r.made.length} in a minute)`);
  const before = r.made.length;
  net.wake(); // (the page is in view again: now, not after the backoff)
  assert.equal(r.made.length, before + 1);
  r.up = true; t.mock.timers.tick(20);
  assert.equal(r.hellos.at(-1).token, 'tok', 'back with its token');
  assert.equal(net.seat, 0); assert.equal(statuses.at(-1), 'online');
  net.close();
});

test('a lobby Net that never got a seat gives up after a few tries: the relay cannot be reached', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = fakeRelay(), errors = [];
  r.up = false;
  const net = new Net({ url: 'ws://relay/', room: 'ABCD', name: 'Bo', token: 'stale', game: () => null, WebSocket: r.WS, on: { error: (m) => errors.push(m.code) } });
  for (let i = 0; i < 30; i++) t.mock.timers.tick(1000);
  assert.deepEqual(errors, ['unreachable']); assert.ok(net.closed);
  assert.equal(r.made.length, 5, 'the first try and four more');
});

test('a lobby Net that holds a seat gives up once the relay would no longer hold it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const r = fakeRelay(), errors = [];
  const net = new Net({ url: 'ws://relay/', name: 'Ann', game: () => null, WebSocket: r.WS, on: { error: (m) => errors.push(m.code) } });
  t.mock.timers.tick(20);
  r.up = false; net.ws.close();
  for (let i = 0; i < 4 * 60; i++) t.mock.timers.tick(1000);
  assert.deepEqual(errors, [], 'four minutes: still trying');
  for (let i = 0; i < 2 * 60; i++) t.mock.timers.tick(1000);
  assert.deepEqual(errors, ['unreachable'], 'past the hold: the seat is gone, so is the room for it');
  assert.ok(net.closed);
});

test('a lobby leave is confirmed by a pong; on a half-open socket it is said again once reconnected, then the Net closes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = fakeRelay();
  let net = new Net({ url: 'ws://relay/', name: 'Ann', game: () => null, WebSocket: r.WS });
  t.mock.timers.tick(20);
  net.leave();
  assert.deepEqual(r.said.slice(-2), ['leave', 'ping']);
  assert.ok(net.closed, 'the pong came: closed');
  // The same on a socket that looks open but is dead: no pong, so a new socket, the leave again, its pong.
  r.said.length = 0;
  net = new Net({ url: 'ws://relay/', name: 'Ann', game: () => null, WebSocket: r.WS });
  t.mock.timers.tick(20);
  r.deaf = true; net.leave(); r.deaf = false;
  assert.ok(!net.closed, 'no pong yet: still open');
  const made = r.made.length;
  t.mock.timers.tick(2000); // (PONG_MS)
  t.mock.timers.tick(250); // (the first retry)
  assert.equal(r.made.length, made + 1, 'a new socket');
  t.mock.timers.tick(20);
  assert.deepEqual(r.said.filter(x => x !== undefined), ['leave', 'ping'], 'the leave said again on it (after its hello), and confirmed');
  assert.equal(r.hellos.at(-1).token, 'tok', 'back with its token');
  assert.ok(net.closed);
});

test('three seats, one the AI\'s: both clients run its game alike, and the AI plays', { skip, timeout: 60000 }, async () => {
  const m = await match({ latency: 20, jitter: 30 }, (net) => { net.add(2, true, 'vael'); net.map(4); });
  const { a, b } = m;
  try {
    let seed = 5; const rand = (n) => (seed = (seed * 1103515245 + 12345) >>> 0) % n;
    await m.run(9000, () => { for (const c of [a, b]) if (c.g && !rand(5)) { const ids = own(c); c.g.moveTo(ids[rand(ids.length)], 300 + rand(2400), 300 + rand(2400)); } });
    assert.deepEqual([a.setup.ai, a.setup.teams, a.g.mapW()], [[0, 0, 1], [0, 1, 2], 96], 'an AI seat, each its own team, on 96x96');
    const common = m.same();
    assert.ok(common.length > 150, `both ran the game (${a.g.tick()} / ${b.g.tick()} ticks)`);
    assert.ok(busy(a, 2), 'the AI plays: it trains');
    assert.deepEqual(m.events.filter(e => /desync|away/.test(e)), [], 'no desync, and nobody away (the AI seat least of all)');
  } finally { await m.done(); }
});

test('two people against two AIs at different levels (Easy and Brutal): one side, every client the same game', { skip, timeout: 60000 }, async () => {
  // (the host moves the friend to its side, then adds the two AIs on the other, each at its own level)
  const m = await match({}, (net) => { net.side(1, 0); net.add(1, true, 'humans', 0); net.add(1, true, 'vael', 3); net.map(5); });
  const { a, b } = m;
  try {
    await m.run(6000, () => { for (const c of [a, b]) if (c.g && c.g.tick() % 90 === 1) { const ids = own(c); c.g.moveTo(ids[0], 1500, 1500); } });
    assert.deepEqual([a.setup.ai, a.setup.teams, a.setup.diffs, a.setup.diff, a.g.mapW()], [[0, 0, 1, 1], [0, 0, 1, 1], [0, 0, 0, 3], 3, 96]);
    assert.deepEqual([2, 3].map(s => [a.g.diffOf(s), b.g.diffOf(s)]), [[0, 0], [3, 3]], 'each AI at its own level, in both games');
    assert.ok(m.same().length > 100, 'both ran it, the same world on every tick');
    assert.ok(busy(b, 2) && busy(b, 3), 'the AIs play');
    assert.deepEqual(m.events.filter(e => /desync/.test(e)), [], 'no desync');
  } finally { await m.done(); }
});

test('a side arranged at the start: Bo at spot 1 plays game seat 2, beside his partner at spot 2 (setup.spots), in both games', { skip, timeout: 60000 }, async () => {
  // (spots: Ann 0 and an AI at 3 on one side, Bo 1 and an AI at 2 on the other: the game's seats Ann, AI 3 | Bo, AI 2)
  const m = await match({}, (net) => { net.add(1, true, 'humans', 1); net.add(0, true, 'vael', 2); net.map(4); });
  const { a, b } = m;
  try {
    await m.run(5000, () => { if (b.g && !b.moved && b.g.tick() > 30) { b.moved = true; for (const id of own(b)) b.g.moveTo(id, 1500, 1500); } }); // (Bo's orders only)
    assert.deepEqual([a.setup.teams, a.setup.spots, a.setup.names, a.setup.ai], [[0, 0, 1, 1], [0, 3, 1, 2], ['Ann', '', 'Bo', ''], [0, 1, 0, 1]]);
    assert.deepEqual([a.lobbySeat, a.seat, b.lobbySeat, b.seat, a.net.seat, b.net.seat], [0, 0, 1, 2, 0, 2], 'Bo plays the game seat his start named');
    assert.deepEqual([1, 3].map(s => [a.g.diffOf(s), b.g.diffOf(s)]), [[2, 2], [1, 1]], 'each AI at its level, in its game seat');
    const common = m.same(), last = Math.max(...common);
    assert.ok(common.length > 100, 'both ran it, the same world on every tick');
    assert.ok(own(b).length > 0 && own(b).every(id => own(a, 2).includes(id)), 'Bo\'s units are game seat 2\'s in both games');
    assert.notEqual(a.hashes.get(last), m.idle(last), 'Bo\'s orders reached both games');
    assert.deepEqual(m.events.filter(e => /desync|away/.test(e)), [], 'no desync, nobody away');
  } finally { await m.done(); }
});

test('eight seats, two people and six AIs (M4 2e): four pairs on 128x128, every client the same game, every AI at work', { skip, timeout: 60000 }, async () => {
  const m = await match({}, (net) => { net.side(1, 0); for (let s = 2; s < 8; s++) net.add(s >> 1, true, s % 3 === 0 ? 'vael' : 'random', s % 4); net.map(8); });
  const { a, b } = m;
  try {
    await m.run(6000, () => { for (const c of [a, b]) if (c.g && c.g.tick() % 90 === 1) { const ids = own(c); c.g.moveTo(ids[0], 2000, 2000); } });
    assert.deepEqual([a.setup.ai, a.setup.teams, a.g.mapW(), a.setup.races.length], [[0, 0, 1, 1, 1, 1, 1, 1], [0, 0, 1, 1, 2, 2, 3, 3], 128, 8]);
    assert.ok(m.same().length > 100, `both ran it (${a.g.tick()} / ${b.g.tick()} ticks)`);
    for (let s = 2; s < 8; s++) assert.ok(busy(b, s), `the AI of seat ${s} plays`);
    assert.deepEqual(m.events.filter(e => /desync|away/.test(e)), [], 'no desync, nobody away');
  } finally { await m.done(); }
});
