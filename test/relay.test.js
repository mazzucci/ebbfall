// The relay's room (relay/room.js) with fake connections and a fake clock: the lobby, the start, the clock (only once
// everyone has loaded), its bundles, bad input and caps, acks at a real cadence over a jittery link, a seat away and
// back, a reconnect that resumes, a seat that leaves, a stall, hash checkpoints, a lobby seat held for a player whose
// connection went; and the Node server over real sockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, PROTO, TURN_MS, DELAY, CHECK_EVERY, PAUSE_MS, PAUSES, MAX_SEATS, LOBBY_HOLD_MS } from '../relay/room.js';
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

test('a seat given up in the lobby is a fresh seat; an old client is told to update', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello()); r.receive(b, { t: 'race', race: 'vael' });
  r.receive(b, { t: 'leave' }); r.close(b);
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
  r.tick(0); r.tick(2000);
  assert.equal(got(a, 'turn').length, 0, 'no turns while a phone still loads');
  assert.equal(got(a, 'away').length, 0, 'and a quick load is nobody\'s business');
  r.tick(5000);
  assert.deepEqual(got(a, 'away').map(m => m.seat), [1], 'a slow one is waited for, by name');
  r.receive(b, { t: 'loaded' });
  assert.deepEqual(got(a, 'back').map(m => m.seat), [1], 'and back once it has loaded');
  r.tick(5000); r.receive(b, { t: 'orders', w: [3, 7] }); r.receive(a, { t: 'orders', w: [4, 9] });
  r.receive(a, { t: 'orders', w: [0, 1, NaN, 2] }); // (dropped: not a number)
  r.tick(5000 + TURN_MS * 2);
  const turns = got(a, 'turn');
  assert.deepEqual(turns.map(t => t.n), [DELAY, DELAY + 1, DELAY + 2], 'three turns in 200 ms from the start');
  assert.deepEqual(turns[0].o, [], 'the turn closed at once (before the orders came) is empty');
  assert.deepEqual(turns[1].o, [[1, [3, 7]], [0, [4, 9]]], 'the next carries the orders, as they came');
  assert.deepEqual(got(b, 'turn'), turns, 'the same bundles to everyone');
});

/** A started game whose second seat has not loaded (the first has), the clock not running yet, at t = 0. */
const loading = () => {
  const x = room(); const a = x.conn('a'), b = x.conn('b');
  x.r.connect(a, hello()); x.r.connect(b, hello({ name: 'Bo' }));
  x.r.receive(a, { t: 'ready', ready: true }); x.r.receive(b, { t: 'ready', ready: true });
  x.r.receive(a, { t: 'loaded' }); x.r.tick(0);
  return { ...x, a, b };
};
const concededBy = (r, seat) => r.log.some(t => t.o.some(([s, w]) => s === seat && w[0] === 18));

test('a seat that never loads is conceded once its budget is spent, and the others play on', () => {
  const { r, a, got } = loading();
  r.tick(3000); assert.equal(got(a, 'away').length, 0, 'a few seconds to load: nobody waits for it by name');
  r.tick(3100); assert.deepEqual(got(a, 'away').map(m => m.seat), [1], 'then it is waited for, by name');
  r.tick(63000); assert.equal(got(a, 'left').length, 0, 'within its budget');
  r.tick(63200); assert.equal(got(a, 'left')[0].seat, 1, 'given up for it after the away budget');
  assert.ok(r.running, 'the clock runs');
  play(r, [a], 63300, 64000);
  assert.ok(concededBy(r, 1), 'its concede is in the log');
  assert.ok(got(a, 'turn').some(t => t.n > DELAY), 'turns for the seat still in');
});

test('a seat gone before it loaded is away at once, and conceded after its budget', () => {
  const { r, a, b, got } = loading();
  r.close(b); r.tick(100);
  assert.deepEqual(got(a, 'away').map(m => m.seat), [1], 'away at once: no connection');
  r.tick(59000); assert.equal(got(a, 'left').length, 0, 'within its budget: still waited for');
  r.tick(61000); assert.equal(got(a, 'left')[0].seat, 1);
  play(r, [a], 61100, 62000);
  assert.ok(concededBy(r, 1));
});

test('a seat that leaves before it loaded holds nobody up: the clock starts, its concede first', () => {
  const { r, a, b, got } = loading();
  r.receive(b, { t: 'leave' }); r.close(b);
  assert.equal(got(a, 'left')[0].seat, 1);
  play(r, [a], 100, 600);
  assert.ok(r.running, 'the clock runs at once');
  assert.ok(concededBy(r, 1), 'its concede is in the first turn');
  assert.equal(got(a, 'away').length, 0, 'nobody waited for it');
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
  const { r, conn, got } = room();
  const a = conn('a'), a2 = conn('a2'), b = conn('b');
  r.connect(a, hello({ build: 'old000000000' }));
  const token = got(a, 'seat')[0].token;
  r.close(a); // (the update's reload)
  assert.equal(r.connect(a2, hello({ build: 'new000000000', token })), 0, 'the opener, back on the new build');
  assert.equal(r.connect(b, hello({ build: 'new000000000' })), 1, 'and a friend on it');
});

test('in the lobby a held seat\'s build is checked when it comes back, not against a newcomer', () => {
  const { r, conn, got } = room();
  const a = conn('a'), a2 = conn('a2'), b = conn('b');
  r.connect(a, hello({ build: 'old000000000' }));
  const token = got(a, 'seat')[0].token;
  r.close(a); // (away on an old build: the friend, on a new one, is not turned away for it)
  assert.equal(r.connect(b, hello({ build: 'new000000000' })), 1);
  assert.equal(r.connect(a2, hello({ build: 'old000000000', token })), -1, 'back on the old build: told to update');
  assert.equal(got(a2, 'error')[0].code, 'version');
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

test('back during the pause, then a short hiccup after the resume: still in (a pause\'s time is nobody\'s)', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 500);
  r.receive(a, { t: 'pause' });
  for (let t = 600; t <= 600 + 120000; t += 1000) { r.tick(t); r.receive(b, { t: 'ack', turn: r.turn }); } // (Ann's tab hidden two minutes: no acks)
  r.receive(a, { t: 'ack', turn: r.turn }); // (back, still paused)
  r.receive(a, { t: 'resume' });
  for (let t = 121600; t <= 121600 + 20000; t += 1000) { r.tick(t); r.receive(b, { t: 'ack', turn: r.turn }); if (t < 121600 + 10000) r.receive(a, { t: 'ack', turn: r.turn }); }
  assert.equal(got(b, 'left').length, 0, 'a ten-second hiccup after a long pause does not concede');
});

test('time away before a pause still counts (a pause does not refund it)', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 500);
  r.close(b);
  for (let t = 600; t <= 50600; t += 1000) r.tick(t), r.receive(a, { t: 'ack', turn: r.turn });
  r.receive(a, { t: 'pause' }); r.tick(50700); r.receive(a, { t: 'resume' });
  for (let t = 50800; t <= 70800; t += 1000) r.tick(t), r.receive(a, { t: 'ack', turn: r.turn });
  assert.equal(got(a, 'left')[0]?.seat, 1, 'gone 50 s, then 20 s more: out');
});

test('a rejoin is always told whether a pause is on; no pause from a seat whose game is over; the last seat standing is not kept paused', () => {
  const { r, a, b, got } = started();
  play(r, [a, b], 0, 500);
  const token = got(b, 'seat')[0].token;
  r.receive(b, { t: 'pause' }); r.close(b); r.tick(600);
  r.receive(b, { t: 'resume' }); // (from a closed connection: nothing)
  r.tick(600 + PAUSE_MS + 100); // (the pause ran out while b was gone)
  const b2 = { name: 'b2' }, sent = [];
  r.send = ((send) => (c, m) => { if (c === b2) sent.push(m); else send(c, m); })(r.send);
  r.connect(b2, hello({ name: 'Bo', token, next: 0 }));
  assert.ok(sent.some(m => m.t === 'resume' && m.seat === -2), 'no pause on: told so (its card must not stay up)');
  r.receive(a, { t: 'over' });
  r.receive(a, { t: 'pause' });
  assert.equal(r.hold, null, 'a seat whose game is over cannot pause the others');
  r.receive(b2, { t: 'pause' });
  assert.ok(r.hold, 'b pauses');
  r.receive(a, { t: 'leave' });
  assert.equal(r.hold, null, 'one seat left: no pause to wait out');
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

test('a two-seat room is as it was: the same draws for the setup, each seat its own team, no AI', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  const s = got(a, 'start')[0].setup;
  // (the seed and side the relay drew before seat counts, with the room's seed 7)
  assert.deepEqual({ seed: s.seed, map: s.map, side: s.side, races: s.races, names: s.names }, { seed: 271533, map: 0, side: 0, races: ['humans', 'humans'], names: ['Ann', 'Bo'] });
  assert.deepEqual([s.teams, s.ai, s.diff], [[0, 1], [0, 0], 1]);
  assert.equal(got(a, 'lobby').at(-1).seats.length, 2);
});

test('the host sets the seat count, 2 to MAX_SEATS: a seat a person holds is never dropped, the teams go back to each its own', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(b, { t: 'seats', n: 4 }); // (not the host's)
  assert.equal(r.seats.length, 2);
  r.receive(a, { t: 'ready', ready: true });
  r.receive(a, { t: 'seats', n: 4, map: 4 });
  const l = got(b, 'lobby').at(-1);
  assert.equal(l.seats.length, 4, 'four seats');
  assert.equal(l.map, 4, 'with a map that seats them');
  assert.ok(l.seats.every(x => !x.ready), 'everyone ready again for the new setup');
  for (const n of [1, MAX_SEATS + 1, 2.5, '3']) { r.receive(a, { t: 'seats', n }); assert.equal(r.seats.length, 4, `${n} seats refused`); }
  r.receive(a, { t: 'teams', teams: [0, 0, 1, 1] });
  assert.deepEqual(got(b, 'lobby').at(-1).teams, [0, 0, 1, 1]);
  const c = conn('c'); assert.equal(r.connect(c, hello({ name: 'Cy' })), 2, 'a third joins the next open seat');
  r.receive(a, { t: 'seats', n: 2 });
  assert.equal(r.seats.length, 4, 'not while a person holds a seat that would go');
  r.receive(a, { t: 'seats', n: 3 });
  assert.equal(r.seats.length, 3, 'an empty seat goes');
  assert.equal(got(c, 'lobby').at(-1).teams, null, 'the teams: each its own again');
  assert.equal(r.connect(conn('d'), hello()), -1, 'full');
});

test('a player out of a free-for-all who closes the page holds nobody up (its game is over: it watches)', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b'), c = conn('c');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'seats', n: 3 }); r.connect(c, hello({ name: 'Cy' }));
  for (const x of [a, b, c]) r.receive(x, { t: 'ready', ready: true });
  for (const x of [a, b, c]) r.receive(x, { t: 'loaded' });
  r.tick(0);
  for (let t = 0; t <= 1000; t += TURN_MS) { r.tick(t); for (const x of [a, b, c]) r.receive(x, { t: 'ack', turn: r.turn }); }
  r.receive(c, { t: 'over' }); r.close(c); // (Cy is out: the DEFEAT card, then the phone locked)
  const turn = r.turn;
  for (let t = 1100; t <= 31100; t += TURN_MS) { r.tick(t); for (const x of [a, b]) r.receive(x, { t: 'ack', turn: r.turn }); }
  assert.ok(r.turn > turn + 250, `the others play on (${r.turn - turn} turns in 30 s)`);
  assert.equal(got(a, 'away').filter(m => m.seat === 2).length, 0, 'nobody waits for it');
});

test('AI seats: the host fills open seats; no connection, never waited for, never away, nothing from them; the start carries teams, AI and difficulty', () => {
  const { r, conn, got, clear } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'seats', n: 4, map: 4 });
  r.receive(b, { t: 'ai', seat: 2, on: true }); // (not the host's)
  assert.ok(!r.seats[2].ai);
  r.receive(a, { t: 'ai', seat: 2, on: true });
  r.receive(a, { t: 'ai', seat: 3, on: true, race: 'vael' });
  r.receive(a, { t: 'ai', seat: 1, on: true }); // (a person's seat)
  r.receive(a, { t: 'ai', seat: 0, on: true }); // (the host's own)
  let l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(x => [x.ai, x.race]), [[false, 'humans'], [false, 'humans'], [true, 'random'], [true, 'vael']]);
  r.receive(a, { t: 'ai', seat: 2, race: 'humans' }); // (an AI seat's race)
  r.receive(a, { t: 'ai', seat: 3, on: false }); r.receive(a, { t: 'ai', seat: 3, on: true, race: 'vael' }); // (open again, then the AI's again)
  assert.deepEqual(r.seats.map(x => x.ai), [false, false, true, true]);
  assert.equal(r.connect(conn('c'), hello()), -1, 'nobody takes an AI seat');
  r.receive(a, { t: 'diff', diff: 3 }); r.receive(a, { t: 'diff', diff: 9 });
  r.receive(a, { t: 'teams', teams: [0, 0, 0, 0] }); r.receive(a, { t: 'teams', teams: [0, 1] }); r.receive(a, { t: 'teams', teams: [0, 0, 4, 4] }); // (one team; another length; ids too high)
  r.receive(a, { t: 'teams', teams: [0, 1, 1, 0] });
  l = got(b, 'lobby').at(-1);
  assert.deepEqual([l.diff, l.teams], [3, [0, 1, 1, 0]]);
  // Ready: the people only.
  r.receive(a, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby');
  r.receive(b, { t: 'ready', ready: true });
  assert.equal(r.phase, 'game');
  const s = got(a, 'start')[0].setup;
  assert.deepEqual([s.races, s.names, s.teams, s.ai, s.diff, s.map], [['humans', 'humans', 'humans', 'vael'], ['Ann', 'Bo', '', ''], [0, 1, 1, 0], [0, 0, 1, 1], 3, 4]);
  assert.ok(Number.isInteger(s.side) && s.side >= 0, 'any turn of the seats round the starts');
  // The clock starts once the people have loaded, and runs on their acks: the AI seats are never waited for.
  r.receive(a, { t: 'loaded' }); r.receive(b, { t: 'loaded' }); r.tick(0); clear();
  play(r, [a, b], 0, 20000);
  assert.equal(got(a, 'away').length, 0, 'nobody away, the AI seats least of all');
  assert.ok(r.turn > 190, 'the clock ran');
  assert.ok(r.log.every(t => t.o.every(([seat]) => seat < 2)), 'no orders from an AI seat');
  // Hash checks among the people; the game is over once theirs are.
  const cp = Math.floor(r.turn / CHECK_EVERY) * CHECK_EVERY;
  r.receive(a, { t: 'ack', turn: r.turn, check: { turn: cp, hash: 5 } }); r.receive(b, { t: 'ack', turn: r.turn, check: { turn: cp, hash: 5 } });
  assert.equal(got(a, 'desync').length, 0);
  r.receive(a, { t: 'over' }); r.receive(b, { t: 'over' });
  assert.equal(r.phase, 'over');
  // A rematch: the people want one; the AI seats stay the AI's.
  r.receive(a, { t: 'rematch', want: true }); r.receive(b, { t: 'rematch', want: true });
  assert.equal(r.phase, 'lobby');
  assert.deepEqual(got(a, 'lobby').at(-1).seats.map(x => x.ai), [false, false, true, true]);
});

test('eight seats (M4 2e): two people and six AI seats, four against four; the people alone are waited for', () => {
  const { r, conn, got, clear } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  assert.equal(MAX_SEATS, 8);
  r.receive(a, { t: 'seats', n: 8, map: 8 });
  assert.equal(r.seats.length, 8, 'eight seats');
  for (let s = 2; s < 8; s++) r.receive(a, { t: 'ai', seat: s, on: true, race: s % 2 ? 'vael' : 'humans' });
  r.receive(a, { t: 'teams', teams: [0, 0, 0, 0, 1, 1, 1, 1] });
  const l = got(b, 'lobby').at(-1);
  assert.deepEqual([l.seats.length, l.seats.filter(x => x.ai).length, l.teams, l.map], [8, 6, [0, 0, 0, 0, 1, 1, 1, 1], 8]);
  assert.equal(r.connect(conn('c'), hello({ name: 'Cy' })), -1, 'every seat taken: full');
  r.receive(a, { t: 'teams', teams: [0, 0, 1, 1, 2, 2, 3, 3] });
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  const s = got(a, 'start')[0].setup;
  assert.deepEqual([s.teams, s.ai, s.races.length, s.names.length], [[0, 0, 1, 1, 2, 2, 3, 3], [0, 0, 1, 1, 1, 1, 1, 1], 8, 8]);
  r.receive(a, { t: 'loaded' }); r.receive(b, { t: 'loaded' }); r.tick(0); clear();
  play(r, [a, b], 0, 5000);
  assert.ok(r.turn > 45, 'the clock ran on the people\'s acks');
  assert.equal(got(a, 'away').length, 0, 'no AI seat is waited for');
  r.receive(a, { t: 'over' }); r.receive(b, { t: 'over' });
  assert.equal(r.phase, 'over', 'over once the people\'s games are');
});

test('a person who leaves a game with AI seats: one person left, a pause ends; the AI seats are not counted in', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'seats', n: 3, map: 4 }); r.receive(a, { t: 'ai', seat: 2, on: true });
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  r.receive(a, { t: 'loaded' }); r.receive(b, { t: 'loaded' }); r.tick(0);
  play(r, [a, b], 0, 1000);
  r.receive(a, { t: 'pause' });
  assert.ok(r.hold);
  r.receive(b, { t: 'leave' });
  assert.equal(r.hold, null, 'one person left: nothing to wait for');
  assert.equal(got(a, 'left')[0].seat, 1);
});

test('a friend moves to an open seat (the teams are by seat); not the host, not to a held or AI seat', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'seats', n: 4, map: 4 }); r.receive(a, { t: 'ai', seat: 3, on: true });
  const token = r.seats[1].token;
  r.receive(b, { t: 'sit', seat: 3 }); // (the AI's)
  r.receive(b, { t: 'sit', seat: 0 }); // (the host's)
  r.receive(a, { t: 'sit', seat: 2 }); // (the host stays the host)
  assert.equal(r.seats[1].token, token);
  r.receive(b, { t: 'sit', seat: 2 });
  assert.equal(got(b, 'seat').at(-1).seat, 2, 'told its new seat');
  assert.equal(r.seats[2].token, token, 'its token with it');
  const l = got(a, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(x => x.name), ['Ann', '', 'Bo', '']);
  assert.equal(r.connect(conn('c'), hello({ name: 'Cy' })), 1, 'the seat it left is open');
  // The host leaves the lobby: its seat is open, and whoever moves there is the host.
  r.receive(a, { t: 'leave' }); r.close(a);
  r.receive(b, { t: 'sit', seat: 0 });
  assert.equal(r.seats[0].token, token);
  r.receive(b, { t: 'diff', diff: 0 });
  assert.equal(r.diff, 0, 'the new host picks');
});

test('the lobby holds a seat whose connection went: away, not ready, a newcomer takes an open seat, the token takes it back; open again after the hold', () => {
  const { r, conn, got } = room(3); const a = conn('a'), b = conn('b'), c = conn('c');
  r.tick(1000);
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(b, { t: 'race', race: 'vael' }); r.receive(b, { t: 'ready', ready: true });
  const token = got(b, 'seat')[0].token;
  r.close(b); // (Bo's phone switched apps)
  let l = got(a, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(s => [s.name, s.race, s.ready, s.here]), [['Ann', 'humans', false, true], ['Bo', 'vael', false, false], ['', 'humans', false, false]], 'its seat: its name and race, away, not ready');
  assert.equal(r.connect(c, hello({ name: 'Cy' })), 2, 'a newcomer takes the open seat, not the held one');
  assert.equal(r.connect(conn('d'), hello({ name: 'Di' })), -1, 'and then the room is full');
  r.tick(1000 + LOBBY_HOLD_MS - 1000);
  const b2 = conn('b2');
  assert.equal(r.connect(b2, hello({ name: 'Bo', token })), 1, 'its token takes it back');
  assert.equal(got(b2, 'seat')[0].token, token);
  l = got(a, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(s => [s.name, s.race, s.here]), [['Ann', 'humans', true], ['Bo', 'vael', true], ['Cy', 'humans', true]], 'here again, as it was');
  // Gone again, longer than the hold: the seat is open for anyone (and the old token is no one's).
  r.close(b2);
  r.tick(2 * LOBBY_HOLD_MS);
  assert.equal(r.seats[1].token, token, 'held until the hold runs out');
  r.tick(2 * LOBBY_HOLD_MS + LOBBY_HOLD_MS + 1);
  l = got(a, 'lobby').at(-1);
  assert.deepEqual(l.seats[1], { name: '', race: 'humans', ready: false, here: false, ai: false }, 'open again, told to the room');
  const b3 = conn('b3');
  assert.equal(r.connect(b3, hello({ name: 'Bo', token })), 1, 'back too late: a fresh seat');
  assert.notEqual(got(b3, 'seat')[0].token, token);
});

test('the host away in the lobby: the room waits for it (no new host, no start while a held seat is away); AI seats are as they were', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b'), c = conn('c');
  r.tick(0);
  r.connect(a, hello()); r.receive(a, { t: 'seats', n: 4, map: 4 }); r.receive(a, { t: 'ai', seat: 3, on: true, race: 'vael' });
  const token = got(a, 'seat')[0].token;
  r.receive(a, { t: 'ready', ready: true });
  r.close(a); // (the host went to send the code)
  r.connect(b, hello({ name: 'Bo' })); r.connect(c, hello({ name: 'Cy' }));
  assert.deepEqual([got(b, 'seat')[0].seat, got(c, 'seat')[0].seat], [1, 2], 'the friends take the open seats, not the host\'s');
  r.receive(b, { t: 'sit', seat: 0 });
  assert.equal(r.seats[0].token, token, 'nobody moves to the host\'s held seat');
  r.receive(b, { t: 'diff', diff: 0 });
  assert.equal(r.diff, 1, 'nor picks for the host');
  let l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(s => [s.name, s.here, s.ai]), [['Ann', false, false], ['Bo', true, false], ['Cy', true, false], ['', false, true]], 'the host AWAY; the AI seat as it was');
  r.receive(b, { t: 'ready', ready: true }); r.receive(c, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby', 'no start while the host is away');
  r.tick(LOBBY_HOLD_MS / 2);
  assert.ok(r.seats[3].ai && r.seats[3].race === 'vael', 'the AI seat is not held, nor freed');
  const a2 = conn('a2');
  assert.equal(r.connect(a2, hello({ token })), 0, 'the host back: seat 0');
  l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(s => [s.name, s.ready, s.here]), [['Ann', false, true], ['Bo', true, true], ['Cy', true, true], ['', false, false]], 'here, not ready');
  r.receive(a2, { t: 'diff', diff: 2 });
  assert.equal(r.diff, 2, 'still the host');
  for (const x of [a2, b, c]) r.receive(x, { t: 'ready', ready: true }); // (ready again for the new difficulty)
  assert.equal(r.phase, 'game', 'everyone ready: the start');
  assert.deepEqual(got(a2, 'start')[0].setup.ai, [0, 0, 0, 1]);
});

test('the host gone longer than the hold: its seat is open, and a friend may take it (the new host)', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.tick(0);
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.close(a); r.tick(LOBBY_HOLD_MS + 2);
  assert.deepEqual(got(b, 'lobby').at(-1).seats[0], { name: '', race: 'humans', ready: false, here: false, ai: false });
  r.receive(b, { t: 'sit', seat: 0 });
  assert.equal(got(b, 'seat').at(-1).seat, 0, 'the friend is the host now');
});

test('a lobby kept and restored (an adapter that lost its memory): the seats held, their tokens take them back', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.tick(5000);
  r.connect(a, hello()); r.receive(a, { t: 'seats', n: 3, map: 4 }); r.receive(a, { t: 'ai', seat: 2, on: true }); r.receive(a, { t: 'diff', diff: 3 });
  r.receive(a, { t: 'race', race: 'vael' });
  const token = got(a, 'seat')[0].token;
  r.close(a);
  const kept = JSON.parse(JSON.stringify(r.keep()));
  assert.ok(!JSON.stringify(kept).includes('conn'), 'no connections kept');
  const y = room(); y.r.restore(kept, 9000);
  assert.deepEqual(y.r.seats.map(s => [s.name, s.race, !!s.token, s.ai, s.goneSince]), [['Ann', 'vael', true, false, 5000], ['', 'humans', false, false, 0], ['', 'random', false, true, 0]]);
  assert.deepEqual([y.r.map, y.r.diff, y.r.phase], [4, 3, 'lobby']);
  const c = y.conn('c'); assert.equal(y.r.connect(c, hello({ name: 'Cy' })), 1, 'a newcomer: the open seat');
  const a2 = y.conn('a2'); assert.equal(y.r.connect(a2, hello({ token })), 0, 'the token: its own seat');
  y.r.tick(5000 + LOBBY_HOLD_MS + 1);
  assert.equal(y.r.seats[0].token, token, 'here: not freed');
});

test('the host frees a held seat whose player is away (back on another browser, without its token); nothing else', () => {
  const { r, conn, got } = room(3); const a = conn('a'), b = conn('b'), c = conn('c');
  r.tick(0);
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' })); r.connect(c, hello({ name: 'Cy' }));
  r.receive(a, { t: 'free', seat: 1 }); // (Bo is here)
  assert.ok(r.seats[1].conn, 'not a seat whose player is here');
  r.close(b);
  const b2 = conn('b2');
  assert.equal(r.connect(b2, hello({ name: 'Bo' })), -1, 'Bo, on another browser: the room is full');
  assert.deepEqual([got(b2, 'error')[0].code, got(b2, 'error')[0].msg], ['full', 'That room is full: a seat is kept a few minutes for a player who stepped away'], 'and told why');
  r.receive(c, { t: 'free', seat: 1 }); // (not the host's call)
  assert.ok(r.seats[1].token);
  r.receive(a, { t: 'free', seat: 0 }); r.receive(a, { t: 'free', seat: 9 }); r.receive(a, { t: 'free', seat: '1' });
  assert.ok(r.seats[0].conn && r.seats[1].token);
  r.receive(a, { t: 'free', seat: 1 });
  assert.deepEqual(got(c, 'lobby').at(-1).seats[1], { name: '', race: 'humans', ready: false, here: false, ai: false }, 'open at once, told to all');
  const b3 = conn('b3'); assert.equal(r.connect(b3, hello({ name: 'Bo' })), 1, 'Bo sits again');
  r.receive(a, { t: 'ai', seat: 2, on: false }); r.receive(a, { t: 'free', seat: 2 }); // (Cy is here: neither frees it)
  assert.ok(r.seats[2].conn);
  const d = conn('d'); assert.equal(r.connect(d, hello()), -1);
  assert.equal(got(d, 'error')[0].msg, 'That room is full', 'nobody held away: the plain line');
});

test('a lobby leave is confirmed: a ping right after it is answered, the seat open', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(b, { t: 'leave' }); r.receive(b, { t: 'ping', id: 7 });
  assert.equal(got(b, 'pong')[0]?.id, 7);
  assert.equal(r.seats[1].token, null);
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
