// The relay's room (relay/room.js) with fake connections and a fake clock: the lobby, the start, the turn clock and
// its bundles, bad input, a seat away and back, a reconnect that resumes, a seat that leaves, a desync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, PROTO, TURN_MS, DELAY } from '../relay/room.js';

/** A room with two fake connections that record what they are sent. */
function room(seats = 2) {
  const inbox = new Map();
  const r = new Room({ code: 'ABCD', seats, seed: 7, send: (c, m) => inbox.get(c).push(m) });
  const conn = (name) => { const c = { name }; inbox.set(c, []); return c; };
  const got = (c, t) => inbox.get(c).filter(m => m.t === t);
  const clear = () => { for (const l of inbox.values()) l.length = 0; };
  return { r, conn, got, clear };
}
const hello = (extra = {}) => ({ proto: PROTO, name: 'Ann', ...extra });
const started = () => {
  const x = room(); const a = x.conn('a'), b = x.conn('b');
  x.r.connect(a, hello()); x.r.connect(b, hello({ name: 'Bo' }));
  x.r.receive(a, { t: 'ready', ready: true }); x.r.receive(b, { t: 'ready', ready: true });
  return { ...x, a, b };
};

test('the lobby seats players, and the game starts when everyone is ready', () => {
  const { r, conn, got } = room();
  const a = conn('a'), b = conn('b'), c = conn('c');
  assert.equal(r.connect(a, hello()), 0);
  assert.equal(got(a, 'seat')[0].room, 'ABCD');
  assert.equal(r.connect(b, hello({ name: 'Bo' })), 1);
  assert.equal(r.connect(c, hello()), -1, 'a third is refused');
  assert.equal(got(c, 'error')[0].code, 'full');
  r.receive(b, { t: 'race', race: 'vael' });
  r.receive(a, { t: 'map', map: 2 });
  r.receive(b, { t: 'map', map: 5 }); // (only the first seat picks the map)
  const l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(s => [s.name, s.race]), [['Ann', 'humans'], ['Bo', 'vael']]);
  assert.equal(l.map, 2);
  r.receive(a, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby');
  r.receive(b, { t: 'ready', ready: true });
  assert.equal(r.phase, 'game');
  const s = got(a, 'start')[0];
  assert.deepEqual(s.setup.races, ['humans', 'vael']);
  assert.equal(s.setup.map, 2);
  assert.deepEqual(got(b, 'start')[0].setup, s.setup, 'everyone gets the same setup');
  assert.deepEqual(got(a, 'turn').map(t => t.n), [...Array(DELAY).keys()], 'the first turns are sent empty');
  assert.equal(r.connect(conn('late'), hello()), -1, 'no one joins a game that has started');
});

test('an old client is told to update', () => {
  const { r, conn, got } = room(); const a = conn('a');
  assert.equal(r.connect(a, { proto: 0 }), -1);
  assert.equal(got(a, 'error')[0].code, 'update');
});

test('the relay keeps the clock: a turn every 100 ms, orders stamped DELAY turns ahead, in the order they came', () => {
  const { r, a, b, got, clear } = started(); clear();
  r.tick(1000);
  r.receive(b, { t: 'orders', w: [3, 7] });
  r.receive(a, { t: 'orders', w: [4, 9] });
  r.receive(a, { t: 'orders', w: [0, 1, NaN, 2] }); // (dropped: not a number)
  r.receive(a, { t: 'orders', w: new Array(5000).fill(1) }); // (dropped: too long)
  r.tick(1000 + TURN_MS * 3 - 1);
  const turns = got(a, 'turn');
  assert.deepEqual(turns.map(t => t.n), [DELAY, DELAY + 1, DELAY + 2], 'three turns closed in 300 ms');
  assert.deepEqual(turns[0].o, [], 'the turn closed at once (before the orders came) is empty');
  assert.deepEqual(turns[1].o, [[1, [3, 7]], [0, [4, 9]]], 'the next carries the orders, as they came');
  assert.deepEqual(turns[2].o, []);
  assert.deepEqual(got(b, 'turn'), turns, 'the same bundles to everyone');
});

test('a seat that drops is waited for, comes back where it left off, and is back once caught up', () => {
  const { r, a, b, conn, got, clear } = started();
  r.tick(0);
  for (let t = 0; t <= 10; t++) { r.tick(t * TURN_MS); r.receive(a, { t: 'ack', turn: r.turn }); r.receive(b, { t: 'ack', turn: r.turn }); }
  const before = r.turn; clear();
  r.close(b);
  r.tick(1100); r.tick(3000);
  assert.equal(got(a, 'away')[0].seat, 1);
  assert.equal(r.turn, before, 'the clock stops while a seat is away');
  // Back on a new connection with its token: everything after the last turn it ran.
  const token = r.seats[1].token, b2 = conn('b2');
  assert.equal(r.connect(b2, hello({ token, lastTurn: before - 2 })), 1);
  assert.deepEqual(got(b2, 'turn').map(t => t.n), r.log.filter(t => t.n >= before - 1).map(t => t.n));
  r.receive(b2, { t: 'ack', turn: r.turn + DELAY });
  r.tick(3100);
  assert.equal(got(a, 'back')[0].seat, 1);
  r.tick(3500);
  assert.ok(r.turn > before, 'the clock runs again');
});

test('a seat away longer than its budget leaves: a concede in the log', () => {
  const { r, a, b, got } = started();
  r.tick(0); r.close(b);
  for (let t = 1; t <= 62; t++) r.tick(t * 1000);
  assert.equal(got(a, 'left')[0].seat, 1);
  r.tick(70000);
  const withConcede = r.log.find(t => t.o.some(([s, w]) => s === 1 && w[0] === 18));
  assert.ok(withConcede, 'its concede is an order like any other');
});

test('hashes that differ end the game', () => {
  const { r, a, b, got } = started();
  r.tick(0);
  r.receive(a, { t: 'ack', turn: 30, hash: 111 });
  r.receive(b, { t: 'ack', turn: 30, hash: 111 });
  assert.equal(got(a, 'desync').length, 0);
  r.receive(a, { t: 'ack', turn: 60, hash: 5 });
  r.receive(b, { t: 'ack', turn: 60, hash: 6 });
  assert.equal(got(a, 'desync')[0].turn, 60);
  assert.equal(r.phase, 'over');
});

test('pings are answered, and a stranger is ignored', () => {
  const { r, a, got } = started();
  r.receive(a, { t: 'ping', id: 4 });
  assert.equal(got(a, 'pong')[0].id, 4);
  r.receive({ name: 'stranger' }, { t: 'orders', w: [1] }); // (not seated: nothing happens, nothing throws)
});

test('the Node relay: open a room, join it by code, play turns over real sockets', async () => {
  const { startRelay } = await import('../relay/server.mjs');
  const relay = startRelay({ port: 0 }); await relay.ready;
  const open = (query) => new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${relay.port}/?${query}`), got = [];
    ws.onmessage = (e) => got.push(JSON.parse(e.data));
    ws.onopen = () => res({ ws, got, say: (m) => ws.send(JSON.stringify(m)), until: (pred, ms = 3000) => new Promise((ok, no) => {
      const t0 = Date.now(); const poll = () => { const m = got.find(pred); if (m) ok(m); else if (Date.now() - t0 > ms) no(new Error('timed out: ' + JSON.stringify(got.slice(-3)))); else setTimeout(poll, 10); }; poll();
    }) });
    ws.onerror = rej;
  });
  try {
    const a = await open('new=1'); a.say({ proto: PROTO, name: 'Ann' });
    const seat = await a.until(m => m.t === 'seat');
    const b = await open(`room=${seat.room.toLowerCase()}`); b.say({ proto: PROTO, name: 'Bo' });
    assert.equal((await b.until(m => m.t === 'seat')).seat, 1);
    a.say({ t: 'ready', ready: true }); b.say({ t: 'ready', ready: true });
    const sa = await a.until(m => m.t === 'start'), sb = await b.until(m => m.t === 'start');
    assert.deepEqual(sa.setup, sb.setup);
    b.say({ t: 'orders', w: [3, 42] });
    const withOrders = await a.until(m => m.t === 'turn' && m.o.length);
    assert.deepEqual(withOrders.o, [[1, [3, 42]]]);
    await b.until(m => m.t === 'turn' && m.n === withOrders.n);
    const nope = await open('room=ZZZZ'); assert.equal((await nope.until(m => m.t === 'error')).code, 'noroom');
    for (const x of [a, b]) x.ws.close();
  } finally { await relay.close(); }
});
