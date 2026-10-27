// The relay's room (relay/room.js) with fake connections and a fake clock: the lobby, the start, the clock (only once
// everyone has loaded), its bundles, bad input and caps, acks at a real cadence over a jittery link, a seat away and
// back, a reconnect that resumes, a seat that leaves, a stall, hash checkpoints; and the Node server over real sockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, PROTO, TURN_MS, DELAY, CHECK_EVERY, PAUSE_MS, PAUSES } from '../relay/room.js';
import { PAUSES as NET_PAUSES } from '../src/net/net.js';

/** A room with fake connections that record what they are sent (and whether they were kicked). */
function room(seats = 2) {
  const inbox = new Map();
  const r = new Room({ code: 'ABCD', seats, seed: 7, send: (c, m) => inbox.get(c).push(m), kick: (c) => { c.kicked = true; } });
  const conn = (name) => { const c = { name }; inbox.set(c, []); return c; };
  const got = (c, t) => inbox.get(c).filter(m => m.t === t);
  const clear = () => { for (const l of inbox.values()) l.length = 0; };
  return { r, conn, got, clear };
}
const hello = (extra = {}) => ({ proto: PROTO, name: 'Ann', ...extra });
/** A started game, both seats loaded, the clock running from t = 0. */
const started = () => {
  const x = room(); const a = x.conn('a'), b = x.conn('b');
  x.r.connect(a, hello()); x.r.connect(b, hello({ name: 'Bo' }));
  x.r.receive(a, { t: 'ready', ready: true }); x.r.receive(b, { t: 'ready', ready: true });
  x.r.receive(a, { t: 'loaded' }); x.r.receive(b, { t: 'loaded' });
  x.r.tick(0);
  return { ...x, a, b };
};
/** Both seats ack the turn the clock is at, every `every` turns, up to `ms`. */
const play = (r, conns, from, ms, every = 3) => {
  for (let t = from; t <= ms; t += TURN_MS) {
    r.tick(t);
    if (Math.round(t / TURN_MS) % every === 0) for (const c of conns) r.receive(c, { t: 'ack', turn: r.turn });
  }
};

test('the lobby seats players, and the game starts when everyone is ready', () => {
  const { r, conn, got } = room();
  const a = conn('a'), b = conn('b'), c = conn('c');
  assert.equal(r.connect(a, hello()), 0);
  assert.equal(got(a, 'seat')[0].room, 'ABCD');
  assert.equal(r.connect(a, hello()), -1, 'a second hello on one connection is ignored');
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

test('a seat freed in the lobby is a fresh seat; an old client is told to update', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello()); r.receive(b, { t: 'race', race: 'vael' });
  r.close(b);
  const b2 = conn('b2'); r.connect(b2, hello());
  assert.equal(got(b2, 'lobby').at(-1).seats[1].race, 'humans');
  const old = conn('old'); assert.equal(r.connect(old, { proto: 0 }), -1);
  assert.equal(got(old, 'error')[0].code, 'update');
});

test('the clock waits until everyone has loaded, then closes a turn every 100 ms', () => {
  const { r, conn, got, clear } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello());
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  r.receive(a, { t: 'loaded' }); clear();
  r.tick(0); r.tick(5000);
  assert.equal(got(a, 'turn').length, 0, 'no turns while a phone still loads');
  assert.equal(got(a, 'away').length, 0, 'and no one is away for it');
  r.receive(b, { t: 'loaded' });
  r.tick(5000); r.receive(b, { t: 'orders', w: [3, 7] }); r.receive(a, { t: 'orders', w: [4, 9] });
  r.receive(a, { t: 'orders', w: [0, 1, NaN, 2] }); // (dropped: not a number)
  r.tick(5000 + TURN_MS * 2);
  const turns = got(a, 'turn');
  assert.deepEqual(turns.map(t => t.n), [DELAY, DELAY + 1, DELAY + 2], 'three turns in 200 ms from the start');
  assert.deepEqual(turns[0].o, [], 'the turn closed at once (before the orders came) is empty');
  assert.deepEqual(turns[1].o, [[1, [3, 7]], [0, [4, 9]]], 'the next carries the orders, as they came');
  assert.deepEqual(got(b, 'turn'), turns, 'the same bundles to everyone');
});

test('orders are capped per seat per turn', () => {
  const { r, a, got, clear } = started(); clear();
  for (let i = 0; i < 20; i++) r.receive(a, { t: 'orders', w: [3, i] });
  r.receive(a, { t: 'orders', w: new Array(5000).fill(1) });
  r.tick(TURN_MS);
  const o = got(a, 'turn').flatMap(t => t.o);
  assert.equal(o.length, 10, 'ten messages a turn at most');
});

test('acks every few turns over a jittery link never send anyone away', () => {
  const { r, a, b, got } = started();
  // (a link of 120 +- 60 ms one way: acks arrive late and bunched; the relay must not count that as gone)
  let seed = 3; const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const pending = [];
  for (let t = 0; t <= 600000; t += 20) {
    r.tick(t);
    if (t % (3 * TURN_MS) === 0) for (const c of [a, b]) pending.push({ c, at: t + 60 + rand() * 120, turn: Math.max(0, r.turn - 2) });
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= t) { r.receive(pending[i].c, { t: 'ack', turn: pending[i].turn }); pending.splice(i, 1); }
  }
  assert.equal(got(a, 'away').length, 0, 'ten minutes, nobody away');
  assert.ok(r.turn > 5900, 'and the clock ran');
});

test('a seat that drops is waited for, comes back where it left off, and is back once caught up', () => {
  const { r, a, b, conn, got, clear } = started();
  play(r, [a, b], 0, 1000);
  const before = r.turn; clear();
  r.close(b);
  r.tick(1100); r.tick(3000);
  assert.equal(got(a, 'away')[0].seat, 1);
  assert.equal(r.turn, before, 'the clock stops while a seat is away');
  // Back on a new connection with its token: every turn from the next one it expects.
  const token = r.seats[1].token, b2 = conn('b2'), next = before - 1;
  assert.equal(r.connect(b2, hello({ token, next })), 1);
  assert.equal(got(b2, 'start')[0].from, next);
  assert.deepEqual(got(b2, 'turn').map(t => t.n), r.log.filter(t => t.n >= next).map(t => t.n));
  r.receive(b2, { t: 'ack', turn: r.turn });
  r.tick(3100);
  assert.equal(got(a, 'back')[0].seat, 1);
  play(r, [a, b2], 3200, 4000);
  assert.ok(r.turn > before, 'the clock runs again');
});

test('a second screen takes the seat over, and the first is closed', () => {
  const { r, a, conn, got } = started();
  const token = r.seats[0].token, a2 = conn('a2');
  assert.equal(r.connect(a2, hello({ token, next: 0 })), 0);
  assert.equal(got(a, 'error')[0].code, 'replaced');
  assert.ok(a.kicked);
});

test('a seat away longer than its budget leaves: a concede in the log, and nothing more from it', () => {
  const { r, a, b, got } = started();
  for (let t = 1; t <= 66; t++) { r.tick(t * 1000); r.receive(a, { t: 'ack', turn: r.turn }); }
  assert.equal(got(a, 'left')[0].seat, 1);
  r.receive(b, { t: 'orders', w: [3, 1] }); // (a seat that left is not heard)
  play(r, [a], 66000, 67000);
  const fromB = r.log.flatMap(t => t.o.filter(([s]) => s === 1).map(([, w]) => w));
  assert.deepEqual(fromB, [[18]], 'its concede is an order like any other, and the only one');
});

test('one sim build per room: another build is told to update, the same one joins', () => {
  const { r, conn, got } = room();
  const a = conn('a'), b = conn('b'), c = conn('c');
  assert.equal(r.connect(a, hello({ build: 'aaaa11112222' })), 0);
  assert.equal(r.connect(b, hello({ build: 'bbbb11112222' })), -1);
  assert.equal(got(b, 'error')[0].code, 'version');
  assert.equal(r.connect(c, hello({ build: 'aaaa11112222' })), 1, 'the same build: a seat');
  assert.deepEqual(got(a, 'notice').map(m => m.code), ['version'], 'the seated are told someone on another build was turned away');
});

test('a room whose seats have all left takes a new build (an opener reloading into an update keeps its room)', () => {
  const { r, conn } = room();
  const a = conn('a'), a2 = conn('a2'), b = conn('b');
  r.connect(a, hello({ build: 'old000000000' }));
  r.close(a); // (the update's reload)
  assert.equal(r.connect(a2, hello({ build: 'new000000000' })), 0, 'the opener, back on the new build');
  assert.equal(r.connect(b, hello({ build: 'new000000000' })), 1, 'and a friend on it');
});

test('a seat coming back with its token is checked against the others, not itself', () => {
  const { r, conn, got } = room();
  const a = conn('a'), a2 = conn('a2'), b = conn('b');
  r.connect(a, hello({ build: 'aaaa' }));
  r.connect(b, hello({ build: 'aaaa' }));
  const token = got(a, 'seat')[0].token;
  r.close(a);
  assert.equal(r.connect(a2, hello({ build: 'bbbb', token })), -1, 'its friend is on another build: refused');
  assert.equal(r.connect(a2, hello({ build: 'aaaa', token })), 0, 'the same build: its own seat back');
});

test('a rematch: once every seat wants one, the room is a lobby again (same seats), and a new game starts afresh', () => {
  const { r, a, b, got, clear } = started();
  play(r, [a, b], 0, 1000);
  const first = got(a, 'start')[0].setup;
  r.receive(a, { t: 'rematch', want: true });
  assert.deepEqual(got(b, 'rematch').at(-1).seats, [true, false], 'the other side is told who wants one');
  assert.equal(r.phase, 'game', 'not until everyone wants it');
  clear();
  r.receive(b, { t: 'rematch', want: true });
  assert.equal(r.phase, 'lobby');
  const lobby = got(a, 'lobby').at(-1);
  assert.deepEqual(lobby.seats.map(s => [s.name, s.ready, s.here]), [['Ann', false, true], ['Bo', false, true]], 'the same seats, nobody ready');
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  const second = got(a, 'start').at(-1);
  assert.ok(second && second.setup.seed !== undefined, 'a new game');
  assert.equal(second.from, 0);
  assert.equal(r.log.length, DELAY, 'a fresh log (its first turns only)');
  assert.ok(first);
});

test('once every game is over the clock stops and nobody is away; a seat gone that long has left', () => {
  const { r, a, b, got, clear } = started();
  play(r, [a, b], 0, 1000);
  r.receive(a, { t: 'over' });
  assert.equal(r.phase, 'game', 'one side still playing: the clock runs');
  r.receive(b, { t: 'over' });
  assert.equal(r.phase, 'over');
  clear();
  r.tick(10000); // (long after: no acks at all)
  assert.equal(got(a, 'turn').length, 0, 'no turns any more');
  assert.equal(got(a, 'away').length, 0, 'nobody away');
  r.close(b); r.tick(20000);
  assert.equal(got(a, 'left').length, 0, 'gone a while: not yet left');
  r.tick(10000 + 31000);
  assert.equal(got(a, 'left')[0]?.seat, 1, 'gone past the grace: left');
});

test('a rematch request made while the other side was away still counts when it comes back', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 500);
  for (const c of [a, b]) r.receive(c, { t: 'over' });
  const token = got(b, 'seat')[0].token;
  r.receive(b, { t: 'rematch', want: true });
  r.close(b);
  r.receive(a, { t: 'rematch', want: true });
  assert.equal(r.phase, 'over', 'one side not here: no lobby yet');
  const b2 = { name: 'b2' };
  const sent = [];
  r.send = ((send) => (c, m) => { if (c === b2) sent.push(m); else send(c, m); })(r.send);
  r.connect(b2, hello({ name: 'Bo', token }));
  assert.equal(r.phase, 'lobby', 'back: everyone wants it, so the lobby');
  assert.ok(sent.some(m => m.t === 'lobby'));
});

test('leaving after the game: the others are told at once', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 500);
  for (const c of [a, b]) r.receive(c, { t: 'over' });
  r.receive(b, { t: 'leave' }); r.close(b);
  assert.equal(got(a, 'left')[0]?.seat, 1);
});

test('a pause stops the clock for everyone until the seat that paused resumes it, or its five minutes run out; three a game per seat', () => {
  const { r, a, b, got, clear } = started();
  play(r, [a, b], 0, 1000);
  r.receive(b, { t: 'pause' });
  assert.deepEqual(got(a, 'start')[0].left, [PAUSES, PAUSES], 'the start says the pauses each seat has');
  assert.equal(NET_PAUSES, PAUSES, 'the client counts the same');
  assert.deepEqual([got(a, 'pause')[0].seat, got(a, 'pause')[0].left], [1, [3, 2]], 'everyone told who paused, and the pauses left');
  clear(); const turn = r.turn;
  play(r, [a, b], 1100, 20000);
  assert.equal(r.turn, turn, 'no turns while paused');
  assert.equal(got(a, 'away').length, 0, 'nobody away for it');
  r.receive(a, { t: 'resume' });
  assert.equal(got(b, 'resume').length, 0, 'the other side cannot end it');
  play(r, [a, b], 20100, 20500);
  assert.equal(r.turn, turn, 'still paused');
  r.receive(b, { t: 'resume' });
  assert.equal(got(a, 'resume')[0]?.seat, 1, 'who paused ends it, when ready');
  play(r, [a, b], 20600, 21000);
  assert.ok(r.turn > turn, 'the clock runs again');
  // Its five minutes run out on its own.
  r.receive(b, { t: 'pause' }); clear();
  play(r, [a, b], 21100, 21000 + PAUSE_MS + 500);
  assert.equal(got(a, 'resume')[0]?.seat, -1, 'time ran out');
  // A third, then no more for that seat.
  r.receive(b, { t: 'pause' }); r.receive(b, { t: 'resume' });
  clear(); r.receive(b, { t: 'pause' });
  assert.equal(got(a, 'pause').length, 0, 'three a game');
  r.receive(a, { t: 'pause' });
  assert.equal(got(b, 'pause')[0]?.seat, 0, 'the other side still has its own');
});

test('a seat gone during a long pause is not counted away for it (its phone slept): the budget counts from the resume', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 500);
  r.receive(a, { t: 'pause' });
  r.close(b); // (b's phone sleeps through the pause)
  for (let t = 600; t <= 600 + 4 * 60000; t += 1000) { r.tick(t); r.receive(a, { t: 'ack', turn: r.turn }); }
  assert.equal(got(a, 'left').length, 0, 'four minutes away during a pause: still in the game');
  r.receive(a, { t: 'resume' });
  for (let t = 600 + 4 * 60000; t <= 600 + 4 * 60000 + 30000; t += 1000) { r.tick(t); r.receive(a, { t: 'ack', turn: r.turn }); }
  assert.equal(got(a, 'left').length, 0, 'and its budget is whole after the resume');
});

test('a seat back during a pause is told; a seat that leaves ends its own pause', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 500);
  const token = got(b, 'seat')[0].token;
  r.receive(a, { t: 'pause' });
  r.close(b);
  const b2 = { name: 'b2' }, sent = [];
  r.send = ((send) => (c, m) => { if (c === b2) sent.push(m); else send(c, m); })(r.send);
  r.connect(b2, hello({ name: 'Bo', token, next: 0 }));
  assert.ok(sent.some(m => m.t === 'pause' && m.seat === 0 && m.ms > 0), 'back: told of the pause and its time left');
  assert.deepEqual(sent.find(m => m.t === 'start').left, [2, 3], 'and of the pauses left (a reloaded page knows them before the next pause)');
  r.receive(a, { t: 'leave' });
  assert.equal(r.hold, null, 'its pause went with it');
});

test('no rematch with a seat that left', () => {
  const { r, a, b } = started();
  play(r, [a, b], 0, 500);
  r.receive(b, { t: 'leave' }); r.close(b);
  r.receive(a, { t: 'rematch', want: true });
  assert.equal(r.phase, 'game');
});

test('a seat that leaves concedes at once: no waiting for it', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 1000);
  r.receive(b, { t: 'leave' }); r.close(b);
  assert.equal(got(a, 'left')[0].seat, 1);
  play(r, [a], 1100, 1400);
  assert.ok(r.log.some(t => t.o.some(([s, w]) => s === 1 && w[0] === 18)), 'its concede is in the next turn');
  assert.equal(got(a, 'away').length, 0, 'nobody waited for it');
});

test('a stall closes a few turns, not a burst, and blames no one', () => {
  const { r, a, b, got, clear } = started();
  play(r, [a, b], 0, 1000); clear();
  r.tick(3000); // (the relay's own event loop stalled 2 s)
  assert.ok(got(a, 'turn').length <= 6, `a few turns at once (${got(a, 'turn').length})`);
  r.receive(a, { t: 'ack', turn: r.turn }); r.receive(b, { t: 'ack', turn: r.turn });
  r.tick(3100);
  assert.equal(got(a, 'away').length, 0);
});

test('hashes are compared at checkpoints, whenever each seat gets there', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 10000);
  const cp = CHECK_EVERY * 3;
  r.receive(a, { t: 'ack', turn: cp + 3, check: { turn: cp, hash: 111 } });
  r.receive(b, { t: 'ack', turn: cp + 7, check: { turn: cp, hash: 111 } });
  assert.equal(got(a, 'desync').length, 0);
  assert.equal(r.seats[0].hashes.size, 0, 'a passed checkpoint is forgotten');
  r.receive(a, { t: 'ack', turn: cp + 13, check: { turn: cp + CHECK_EVERY, hash: 5 } });
  r.receive(b, { t: 'ack', turn: cp + 18, check: { turn: cp + CHECK_EVERY, hash: 6 } });
  assert.equal(got(a, 'desync')[0].turn, cp + CHECK_EVERY);
  assert.equal(r.phase, 'over');
});

test('pings are answered, and a stranger is ignored', () => {
  const { r, a, got } = started();
  r.receive(a, { t: 'ping', id: 4 });
  assert.equal(got(a, 'pong')[0].id, 4);
  r.receive({ name: 'stranger' }, { t: 'orders', w: [1] }); // (not seated: nothing happens, nothing throws)
});

test('the Node relay: open a room, join it by code, play turns over real sockets, survive a bad client', async () => {
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
    a.say({ t: 'loaded' }); b.say({ t: 'loaded' });
    b.say({ t: 'orders', w: [3, 42] });
    const withOrders = await a.until(m => m.t === 'turn' && m.o.length);
    assert.deepEqual(withOrders.o, [[1, [3, 42]]]);
    await b.until(m => m.t === 'turn' && m.n === withOrders.n);
    // A client that sends more than the relay takes: it is dropped, and the relay goes on.
    const bad = await open(`room=${seat.room}`);
    const closed = new Promise(res => { bad.ws.onclose = res; });
    bad.ws.send('x'.repeat(70 * 1024));
    await closed;
    const later = await a.until(m => m.t === 'turn' && m.n > withOrders.n + 3);
    assert.ok(later, 'the relay is still up');
    const nope = await open('room=ZZZZ'); assert.equal((await nope.until(m => m.t === 'error')).code, 'noroom');
    for (const x of [a, b]) x.ws.close();
  } finally { await relay.close(); }
});
