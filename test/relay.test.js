// The relay's room (relay/room.js) with fake connections and a fake clock: the lobby, the start, the clock (only once
// everyone has loaded), its bundles, bad input and caps, acks at a real cadence over a jittery link, a seat away and
// back, a reconnect that resumes, a seat that leaves, a stall, hash checkpoints, a lobby seat held for a player whose
// connection went; and the Node server over real sockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, PROTO, TURN_MS, DELAY, CHECK_EVERY, PAUSE_MS, PAUSES, MAX_SEATS, LOBBY_HOLD_MS } from '../relay/room.js';
import { PAUSES as NET_PAUSES } from '../src/net/net.js';
import { fits } from '../src/client/maps.js';

/** A room with fake connections that record what they are sent (and whether they were kicked). */
function room(seats = 2) {
  const inbox = new Map();
  const r = new Room({ code: 'ABCD', seats, seed: 7, send: (c, m) => inbox.get(c).push(m), kick: (c) => { c.kicked = true; } });
  const conn = (name) => { const c = { name }; inbox.set(c, []); return c; };
  const got = (c, t) => inbox.get(c).filter(m => m.t === t), all = (c) => inbox.get(c);
  const clear = () => { for (const l of inbox.values()) l.length = 0; };
  return { r, conn, got, all, clear };
}
const hello = (extra = {}) => ({ proto: PROTO, name: 'Ann', ...extra });
/** A lobby's seats (by spot, MAX_SEATS long, null for an empty spot): the filled ones, in spot order. */
const filled = (l) => l.seats.filter(Boolean);
/** A lobby's teams by spot, as long as the board is filled up to its last seat (`n` spots). */
const teamsOf = (l, n = filled(l).length) => l.teams.slice(0, n);
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

test('a name is required: trimmed, cut to 16, and a newcomer with none (empty, blank, missing, not a string) turned away; a seat back by its token keeps its name', () => {
  const { r, conn, got } = room();
  for (const name of ['', '   ', undefined, null, 42, { a: 1 }]) {
    const c = conn('c');
    assert.equal(r.connect(c, { proto: PROTO, name }), -1, `${JSON.stringify(name)}: no seat`);
    assert.deepEqual(got(c, 'error').map(m => m.code), ['name'], `${JSON.stringify(name)}: told why`);
  }
  assert.ok(r.seats.every(s => !s.token), 'nobody seated, no seat held');
  const a = conn('a'), b = conn('b');
  assert.equal(r.connect(a, hello({ name: '  Ann  ' })), 0);
  assert.equal(r.connect(b, hello({ name: 'Bartholomew the Bold' })), 1);
  assert.deepEqual(got(b, 'lobby').at(-1).seats.slice(0, 2).map(s => s.name), ['Ann', 'Bartholomew the'], 'trimmed, then cut to 16 (and trimmed again)');
  const b2 = conn('b2');
  assert.equal(r.connect(b2, { proto: PROTO, token: got(b, 'seat')[0].token }), 1, 'back with its token and no name: its seat');
  assert.equal(got(b2, 'lobby').at(-1).seats[1].name, 'Bartholomew the', 'its name kept');
});

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
  assert.deepEqual(l.seats.map(s => s && [s.name, s.race]), [['Ann', 'humans'], ['Bo', 'vael'], ...Array(MAX_SEATS - 2).fill(null)], 'the board: a seat per spot, an empty spot null');
  assert.deepEqual(l.teams, [0, 1, ...Array(MAX_SEATS - 2).fill(null)], 'and a team per spot');
  assert.equal(l.map, 2);
  r.receive(a, { t: 'map', map: 99 }); r.receive(a, { t: 'map', map: -1 }); r.receive(a, { t: 'map', map: '4' });
  assert.equal(r.map, 2, 'no such map: refused');
  r.receive(a, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby');
  r.receive(b, { t: 'ready', ready: true });
  assert.equal(r.phase, 'game');
  const s = got(a, 'start')[0];
  assert.deepEqual(s.setup.races, ['humans', 'vael']);
  assert.equal(s.setup.map, 2);
  assert.deepEqual(got(b, 'start')[0].setup, s.setup, 'everyone gets the same setup');
  assert.deepEqual([s.seat, got(b, 'start')[0].seat, s.setup.spots], [0, 1, [0, 1]], 'and its game seat; the spots each played from');
  assert.deepEqual(got(a, 'turn').map(t => t.n), [...Array(DELAY).keys()], 'the first turns are sent empty');
  assert.equal(r.connect(conn('late'), hello()), -1, 'no one joins a game that has started');
});

test('a seat given up in the lobby is a fresh seat; an old client is told to update', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello()); r.receive(b, { t: 'race', race: 'vael' });
  r.receive(b, { t: 'leave' }); r.close(b);
  const b2 = conn('b2'); r.connect(b2, hello());
  assert.equal(got(b2, 'lobby').at(-1).seats[1].race, 'humans');
  for (const proto of [0, 3]) { const old = conn('old'); assert.equal(r.connect(old, { proto, name: 'Old' }), -1); assert.equal(got(old, 'error')[0].code, 'update', `PROTO ${proto}: told to update`); }
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

test('before the clock, an away seat says whether its game is set up; an early "over" is not heard', () => {
  const { r, a, b, got } = loading();
  r.tick(3100);
  assert.deepEqual(got(a, 'away').map(m => [m.seat, m.loading]), [[1, true]], 'still loading');
  r.receive(b, { t: 'over' }); // (no game is over before the clock: a buggy or hostile client)
  r.receive(b, { t: 'loaded' }); r.tick(3200);
  assert.ok(r.running, 'the clock runs: the "over" did not stop it');
  assert.equal(r.phase, 'game');
  const x = room(3); const [p, q, s] = ['p', 'q', 's'].map(x.conn);
  for (const k of [p, q, s]) x.r.connect(k, hello());
  for (const k of [p, q, s]) x.r.receive(k, { t: 'ready', ready: true }); // (ready once all are in: a newcomer readies everyone again)
  x.r.receive(p, { t: 'loaded' }); x.r.receive(q, { t: 'loaded' }); x.r.tick(0); x.r.close(q); x.r.tick(100);
  assert.deepEqual(x.got(p, 'away').map(m => [m.seat, m.loading]), [[1, false]], 'set up, then gone: away, not loading');
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
  assert.deepEqual(filled(lobby).map(s => [s.name, s.ready, s.here]), [['Ann', false, true], ['Bo', false, true]], 'the same seats, nobody ready');
  assert.equal(got(a, 'seat').length + got(b, 'seat').length, 0, 'their spots their game seats: nobody told a new one');
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
  assert.deepEqual([s.teams, s.ai, s.diffs, s.diff, s.spots], [[0, 1], [0, 0], [0, 0], 1, [0, 1]]);
  assert.deepEqual([filled(got(a, 'lobby').at(-1)).length, teamsOf(got(a, 'lobby').at(-1))], [2, [0, 1]], 'two seats, each its own side');
});

test('the host adds seats (at the lowest empty spot, open or the AI\'s, on a side; MAX_SEATS at most) and drops open and AI seats (their spot empty), never a person\'s, never below two', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(b, { t: 'add', team: 1, ai: true }); r.receive(b, { t: 'drop', seat: 1 }); // (not the host's)
  assert.equal(r.seats.length, 2);
  r.receive(a, { t: 'ready', ready: true });
  r.receive(a, { t: 'add', team: 0, ai: false }); // (an open seat for a friend, on the host's side)
  let l = got(b, 'lobby').at(-1);
  assert.deepEqual([filled(l).length, teamsOf(l)], [3, [0, 1, 0]], 'three seats, the new one at spot 2, on the host\'s side: nobody moved');
  assert.deepEqual(got(b, 'seat').map(m => m.seat), [1], 'Bo told his spot once, when he sat');
  assert.ok(filled(l).every(x => !x.ready), 'everyone ready again for the new setup');
  r.receive(a, { t: 'add', team: 5, ai: true, race: 'vael', diff: 3 }); // (a team no seat has: a side of its own)
  l = got(b, 'lobby').at(-1);
  assert.deepEqual([teamsOf(l), l.seats[3].ai, l.seats[3].race, l.seats[3].diff], [[0, 1, 0, 5], true, 'vael', 3], 'an AI at spot 3 on a side of its own, its number as given');
  for (const bad of [{ team: -1 }, { team: 2.5 }, { team: '1' }, { team: MAX_SEATS }]) r.receive(a, { t: 'add', ai: true, ...bad });
  assert.equal(r.seats.length, 4, 'a bad side refused');
  r.receive(a, { t: 'add', team: 1, ai: true, race: 7, diff: 9 });
  assert.deepEqual([r.bySpot(4).race, r.bySpot(4).diff], ['random', 1], 'a bad race or level: RANDOM on Medium');
  while (r.seats.length < MAX_SEATS) r.receive(a, { t: 'add', team: 1, ai: true });
  r.receive(a, { t: 'add', team: 1, ai: true });
  assert.equal(r.seats.length, MAX_SEATS, `${MAX_SEATS} seats at most`);
  const c = conn('c'); assert.equal(r.connect(c, hello({ name: 'Cy' })), 2, 'a third joins the open seat (spot 2, on the host\'s side)');
  // Drops: never spot 0, never a person (here, or held for one away); the spot empty, nobody else moves.
  for (const seat of [0, 1, 9, '3', -1]) r.receive(a, { t: 'drop', seat });
  assert.equal(r.seats.length, MAX_SEATS, 'not the host, not a person, not a spot that is not there');
  r.close(c); r.receive(a, { t: 'drop', seat: 2 });
  assert.equal(r.bySpot(2).name, 'Cy', 'nor a held seat (its player away)');
  r.receive(a, { t: 'drop', seat: 3 });
  l = got(b, 'lobby').at(-1);
  assert.deepEqual([l.seats[3], l.teams[3], filled(l).length, l.seats[4].ai, got(b, 'seat').length], [null, null, MAX_SEATS - 1, true, 1], 'spot 3 empty; nobody moved, nobody told');
  r.receive(a, { t: 'add', team: 4, ai: false });
  assert.deepEqual([r.bySpot(3)?.team, r.seats.length], [4, MAX_SEATS], 'a seat more takes the lowest empty spot');
  r.receive(a, { t: 'free', seat: 2 }); r.receive(a, { t: 'drop', seat: 2 }); // (Cy's seat freed, then dropped)
  assert.deepEqual([r.bySpot(2), r.bySpot(1).name, got(b, 'seat').length], [undefined, 'Bo', 1], 'Bo stays at spot 1');
  for (const k of [3, 4, 5, 6, 7]) r.receive(a, { t: 'drop', seat: k });
  assert.deepEqual(r.seats.map(x => [x.spot, x.name]), [[0, 'Ann'], [1, 'Bo']]);
  r.receive(b, { t: 'leave' }); r.receive(a, { t: 'ai', seat: 1, on: true }); r.receive(a, { t: 'drop', seat: 1 });
  assert.deepEqual([r.seats.length, r.bySpot(1).ai], [2, true], 'two seats at least');
  assert.equal(r.connect(conn('d'), hello()), -1, 'full');
});

test('the host moves anyone between sides: nobody moves, the team numbers as given, a held seat kept; one side does not start; the start arranges the game\'s seats, each told its own', () => {
  const { r, conn, got, clear } = room(); const a = conn('a'), b = conn('b'), c = conn('c');
  r.tick(1000);
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'add', team: 0, ai: true, race: 'vael', diff: 2 }); // (Ann and an AI against Bo)
  r.receive(a, { t: 'add', team: 1, ai: false });
  r.connect(c, hello({ name: 'Cy' }));
  const names = () => r.seats.map(x => x.name || (x.ai ? 'AI' : ''));
  const teams = () => teamsOf(got(a, 'lobby').at(-1), 4);
  assert.deepEqual([names(), teams()], [['Ann', 'Bo', 'AI', 'Cy'], [0, 1, 0, 1]], 'the spots in the order they were taken');
  r.receive(b, { t: 'side', seat: 1, team: 0 }); // (not the host's)
  assert.equal(r.bySpot(1).team, 1);
  for (const [seat, team] of [[9, 0], [1, -1], [1, MAX_SEATS], [1, 0.5], ['1', 0], [5, 0]]) r.receive(a, { t: 'side', seat, team });
  assert.deepEqual(teams(), [0, 1, 0, 1], 'a bad spot or side refused');
  const bo = r.bySpot(1).token, cy = r.bySpot(3).token;
  r.close(c); clear(); // (Cy away: the seat held for her)
  r.receive(a, { t: 'side', seat: 1, team: 0 }); r.receive(a, { t: 'side', seat: 2, team: 1 }); // (Bo to Ann's side, the AI to Cy's)
  const l = got(a, 'lobby').at(-1);
  assert.deepEqual([names(), teams()], [['Ann', 'Bo', 'AI', 'Cy'], [0, 0, 1, 1]], 'only the sides change');
  assert.equal(got(b, 'seat').length, 0, 'nobody moved, nobody told');
  assert.deepEqual([l.seats[2].race, l.seats[2].diff], ['vael', 2], 'the AI as it was');
  assert.deepEqual([r.bySpot(3).token, l.seats[3].here, l.seats[3].name], [cy, false, 'Cy'], 'Cy\'s held seat as it was, away');
  r.receive(a, { t: 'side', seat: 1, team: 6 });
  assert.deepEqual(teams(), [0, 6, 1, 1], 'Bo on a side of his own: its number as given (no renumbering in the lobby)');
  r.receive(a, { t: 'side', seat: 0, team: 1 }); // (the host joins the AI and Cy: still spot 0)
  assert.deepEqual([names(), teams(), got(a, 'seat').length], [['Ann', 'Bo', 'AI', 'Cy'], [1, 6, 1, 1], 0]);
  // Cy comes back with her token: her seat, at its spot.
  const c2 = conn('c2'); assert.equal(r.connect(c2, hello({ name: 'Cy', token: cy })), 3, 'the held seat taken back at its spot');
  // Everyone on one side: allowed in the lobby (the host passes through it), but no start.
  r.receive(a, { t: 'side', seat: 1, team: 1 });
  assert.deepEqual(teams(), [1, 1, 1, 1]);
  for (const x of [a, b, c2]) r.receive(x, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby', 'nobody to fight: no start');
  // Ann and Cy against Bo and the AI: the start puts each side's seats together, Ann's side first, each in spot order.
  r.receive(a, { t: 'side', seat: 1, team: 4 }); r.receive(a, { t: 'side', seat: 2, team: 4 });
  for (const x of [a, b, c2]) r.receive(x, { t: 'ready', ready: true });
  assert.equal(r.phase, 'game', 'two sides: the start');
  const st = got(a, 'start')[0].setup;
  assert.deepEqual([st.names, st.teams, st.spots], [['Ann', 'Cy', 'Bo', ''], [0, 0, 1, 1], [0, 3, 1, 2]], 'the game\'s seats arranged, the teams numbered from 0, the spot of each');
  assert.deepEqual([a, b, c2].map(x => got(x, 'start')[0].seat), [0, 2, 1], 'each told its game seat in its start');
  assert.deepEqual([got(b, 'seat').length, got(c2, 'seat').map(m => m.seat)], [0, [3]], 'and no seat message for it');
  // Back mid-game with its token: its game seat, in the seat message and the start.
  r.close(b); const b2 = conn('b2');
  assert.equal(r.connect(b2, hello({ name: 'Bo', token: bo, next: 0 })), 2);
  assert.deepEqual([got(b2, 'seat')[0].seat, got(b2, 'start')[0].seat], [2, 2]);
});

test('a guest who sits in an open seat takes its spot and side; the spot it left is an open seat on its old side', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'add', team: 0, ai: false }); // (Ann and an open seat, spot 2, against Bo)
  assert.equal(got(b, 'seat').length, 1, 'Bo did not move');
  r.receive(b, { t: 'sit', seat: 2 });
  const l = got(a, 'lobby').at(-1);
  assert.deepEqual([filled(l).map(x => x.name), teamsOf(l)], [['Ann', '', 'Bo'], [0, 1, 0]], 'Bo at spot 2 on Ann\'s side; spot 1 open on the other');
  assert.equal(got(b, 'seat').at(-1).seat, 2, 'and told his spot');
});
test('a player out of a free-for-all who closes the page holds nobody up (its game is over: it watches)', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b'), c = conn('c');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'add', team: 2, ai: false }); r.connect(c, hello({ name: 'Cy' }));
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

test('a race is humans, vael or random: anything else is refused, from a person, the host\'s AI, an added seat or a kept record', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  for (const race of ['x', 'HUMANS', '', 7, null, 'humans '.repeat(3)]) r.receive(b, { t: 'race', race });
  assert.equal(r.seats[1].race, 'humans', 'a person\'s: kept');
  r.receive(b, { t: 'race', race: 'random' });
  assert.equal(got(a, 'lobby').at(-1).seats[1].race, 'random');
  r.receive(a, { t: 'add', team: 1, ai: true, race: 'x' });
  assert.equal(r.seats[2].race, 'random', 'an added AI: RANDOM');
  r.receive(a, { t: 'ai', seat: 2, on: true, race: 'vael' }); r.receive(a, { t: 'ai', seat: 2, on: true, race: '<b>' });
  assert.equal(r.seats[2].race, 'vael', 'the AI\'s: kept');
  const y = room(); y.r.restore({ seats: [{ name: 'Ann', token: 't0', race: 'x' }, { ai: true, race: 'zerg' }] }, 100);
  assert.deepEqual(y.r.seats.map(s => s.race), ['humans', 'random'], 'a kept record\'s: the default');
});

test('`ai` needs `on`; a change that changes nothing tells nobody and readies nobody again', () => {
  const { r, conn, got, clear } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'add', team: 1, ai: true, race: 'vael', diff: 2 });
  r.receive(b, { t: 'ready', ready: true }); clear();
  for (const m of [{ seat: 2 }, { seat: 2, on: 1 }, { seat: 2, on: 'yes', diff: 0 }, { seat: 2, on: true, race: 'vael', diff: 2 }, { seat: 2, on: true }, { seat: 1, on: false }])
    r.receive(a, { t: 'ai', ...m });
  assert.deepEqual([got(b, 'lobby').length, r.seats[1].ready, r.seats[2].race, r.seats[2].diff], [0, true, 'vael', 2], 'nothing told, Bo still ready');
  r.receive(a, { t: 'ai', seat: 2, on: true, diff: 3 });
  assert.deepEqual([got(b, 'lobby').length, r.seats[1].ready], [1, false], 'a change: told, ready again');
});

test('someone new in the lobby readies everyone again (they agree to the new line-up); a held seat back does not', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b'), c = conn('c');
  r.tick(1000);
  r.connect(a, hello()); r.receive(a, { t: 'add', team: 1, ai: false });
  r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby', '(a seat is open)');
  r.connect(c, hello({ name: 'Cy' }));
  assert.deepEqual(filled(got(a, 'lobby').at(-1)).map(s => s.ready), [false, false, false], 'Cy joins: ready again');
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  const token = got(c, 'seat')[0].token; r.close(c);
  const c2 = conn('c2'); r.connect(c2, hello({ name: 'Cy', token }));
  assert.deepEqual(filled(got(a, 'lobby').at(-1)).map(s => s.ready), [true, true, false], 'Cy back on her own seat: the others stay ready');
});

test('a stale SIT HERE (the host moved the seat to another side meanwhile): not taken on another side than the one seen', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.receive(a, { t: 'add', team: 0, ai: true });
  r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'add', team: 2, ai: false }); r.receive(a, { t: 'add', team: 3, ai: false });
  // Ann | Bo | AI | open (side 2) | open (side 3): Bo taps spot 3 on side 2; meanwhile the host moves it to side 3.
  assert.deepEqual([teamsOf(got(b, 'lobby').at(-1)), got(b, 'seat').at(-1).seat], [[0, 1, 0, 2, 3], 1]);
  r.receive(a, { t: 'side', seat: 3, team: 3 });
  r.receive(b, { t: 'sit', seat: 3, team: 2 });
  assert.equal(got(b, 'seat').at(-1).seat, 1, 'stale: the seat is on another side now, not taken');
  r.receive(b, { t: 'sit', seat: 0, team: 0 }); r.receive(b, { t: 'sit', seat: 2, team: 0 });
  assert.equal(got(b, 'seat').at(-1).seat, 1, 'nor a seat that is not open (the host\'s, the AI\'s)');
  r.receive(b, { t: 'sit', seat: 3, team: 3 }); // (tapped again on the board the lobby redrew)
  assert.deepEqual([got(b, 'seat').at(-1).seat, r.bySpot(3).name, r.bySpot(3).team, r.bySpot(1).name, r.bySpot(1).team], [3, 'Bo', 3, '', 1], 'the seat on the side he saw: taken; his old spot open, on his old side');
  r.receive(b, { t: 'sit', seat: 1 }); // (no side: an open seat anywhere, as before)
  assert.equal(got(b, 'seat').at(-1).seat, 1);
  r.receive(b, { t: 'sit', seat: 6 }); // (an empty spot: no seat there to take)
  assert.deepEqual([got(b, 'seat').at(-1).seat, r.seats.length], [1, 5]);
});

test('property: random lobbies keep their invariants (a seat keeps its spot but for its own sit; spots, tokens and connections unique; each connection told its number; keep/restore alike; the map seats the room; a start has two sides, its seats arranged; a rematch puts them back)', () => {
  let seed = 20261028; const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  const pick = (xs) => xs[rnd(xs.length)];
  for (let iter = 1; iter <= 300; iter++) {
    const told = new Map(), kicked = [];
    const send = (c, m) => { if (m.t === 'seat' || m.t === 'start') told.set(c, m.seat); };
    const r = new Room({ code: 'ABCD', send, kick: (c) => kicked.push(c), seed: iter });
    let now = 1000, nconn = 0;
    r.tick(now);
    const conns = [];
    const join = (name, token) => { const c = { id: ++nconn }; if (r.connect(c, { proto: PROTO, name, token }) >= 0) conns.push(c); };
    /** The invariants, after `what`; `was`: each record's spot before it, `sitter` the one record that may have moved. */
    const check = (what, was = null, sitter = null) => {
      const seats = r.seats, n = seats.length, spots = seats.map(s => s.spot), lobby = r.phase === 'lobby';
      const why = `room ${iter}, after ${what}: `;
      assert.ok(n >= 2 && n <= MAX_SEATS, `${why}${n} seats`);
      assert.ok(spots.every(k => Number.isInteger(k) && k >= 0 && k < MAX_SEATS) && new Set(spots).size === n && spots.includes(0), `${why}spots ${spots}`);
      for (const s of seats) if (was?.has(s) && s !== sitter) assert.equal(s.spot, was.get(s), `${why}a seat moved`);
      assert.ok(fits(r.map, n), `${why}map ${r.map} for ${n} seats`);
      const cs = seats.filter(s => s.conn).map(s => s.conn), ts = seats.filter(s => s.token).map(s => s.token);
      assert.ok(new Set(cs).size === cs.length && new Set(ts).size === ts.length, `${why}a connection or token twice`);
      seats.forEach((s, i) => { if (s.conn) assert.equal(told.get(s.conn), lobby ? s.spot : i, `${why}a connection told another number`); });
      assert.ok(seats.every(s => ['humans', 'vael', 'random'].includes(s.race) && !(s.ai && (s.token || s.conn)) && Number.isInteger(s.team) && s.team >= 0 && s.team < MAX_SEATS), `${why}a race, a team, an AI with a person`);
      if (lobby) {
        assert.deepEqual(spots, [...spots].sort((x, y) => x - y), `${why}the seats in spot order`);
        const y = new Room({ code: 'X', send: () => {} }); assert.ok(y.restore(JSON.parse(JSON.stringify(r.keep())), now));
        const row = (s) => [s.spot, s.name, s.ai, s.team, s.diff, s.token, s.race];
        assert.deepEqual(y.seats.map(row), seats.map(row), `${why}keep/restore`);
        assert.equal(y.map, r.map, `${why}keep/restore's map`);
      } else {
        const { teams, spots: order } = r.setup, board = [...seats].sort((x, y) => x.spot - y.spot), keys = [...new Set(board.map(s => s.team))];
        assert.ok(new Set(teams).size > 1, `${why}a start with one side`);
        assert.deepEqual(order, spots, `${why}setup.spots: the game seats' spots`);
        assert.deepEqual(order, keys.flatMap(t => board.filter(s => s.team === t).map(s => s.spot)), `${why}the game's seats arranged`);
        assert.ok(order[0] === 0 && teams.every((t, i) => (i ? t === teams[i - 1] || t === teams[i - 1] + 1 : t === 0)), `${why}each team one run, numbered in order, spot 0's first`);
        seats.forEach((s, i) => assert.deepEqual([teams[i], r.setup.ai[i], r.setup.diffs[i]], [keys.indexOf(s.team), s.ai ? 1 : 0, s.ai ? s.diff : 0], `${why}the setup`));
      }
    };
    join('Ann'); check('the host');
    for (let step = 0; step < 40; step++) {
      const h = r.bySpot(0).conn, mine = (c) => r.seats.find(s => s.conn === c);
      const g = pick(conns.filter(c => c !== h && mine(c)));
      const t = rnd(MAX_SEATS), s = rnd(MAX_SEATS + 1), op = rnd(18);
      const what = ['side', 'side', 'add', 'add', 'drop', 'drop', 'ai', 'free', 'join', 'join', 'sit', 'close', 'close host', 'back', 'leave', 'hold over', 'ready', 'race'][op];
      const was = new Map(r.seats.map(x => [x, x.spot])), sitter = op === 10 && g ? mine(g) : null;
      if (op < 2) { if (h) r.receive(h, { t: 'side', seat: s, team: t }); }
      else if (op < 4) { if (h) r.receive(h, { t: 'add', team: t, ai: !!(s % 2), race: pick(['vael', 'random', 'x']), diff: rnd(5) }); }
      else if (op < 6) { if (h) r.receive(h, { t: 'drop', seat: s }); }
      else if (op === 6) { if (h) r.receive(h, { t: 'ai', seat: s, on: pick([true, false, undefined]), diff: rnd(4) }); }
      else if (op === 7) { if (h) r.receive(h, { t: 'free', seat: s }); }
      else if (op < 10) join(`P${nconn + 1}`);
      else if (op === 10) { // (half the time at an open seat, perhaps on the side it is on)
        const open = r.seats.filter(q => !q.token && !q.ai), o = open.length && rnd(2) ? pick(open) : null;
        if (g) r.receive(g, { t: 'sit', seat: o ? o.spot : s, team: pick([undefined, t, o?.team]) });
      }
      else if (op === 11) { if (g) r.close(g); }
      else if (op === 12) { if (h) r.close(h); }
      else if (op === 13) { const x = pick(r.seats.filter(q => q.token)); if (x) { join(x.name, x.token); for (const k of kicked.splice(0)) r.close(k); } }
      else if (op === 14) { if (g) r.receive(g, { t: 'leave' }); }
      else if (op === 15) { now += LOBBY_HOLD_MS + 1; r.tick(now); }
      else if (op === 16) { for (const x of r.seats) if (x.conn) r.receive(x.conn, { t: 'ready', ready: true }); }
      else if (g) r.receive(g, { t: 'race', race: pick(['vael', 'x']) });
      check(what, was, sitter);
      if (r.phase === 'lobby') continue;
      // A start: the game played to its end, a rematch, and the board as it was.
      const people = r.seats.filter(x => !x.ai).map(x => x.conn), before = new Map(r.seats.map(x => [x, x.spot]));
      for (const c of people) r.receive(c, { t: 'loaded' });
      r.tick(now);
      for (const c of people) r.receive(c, { t: 'over' });
      for (const c of people) r.receive(c, { t: 'rematch', want: true });
      assert.equal(r.phase, 'lobby', `room ${iter}: a rematch`);
      check('a rematch', before);
    }
  }
});
test('AI seats: the host fills open seats, each at its own level; no connection, never waited for, never away, nothing from them; the start carries teams, AI and levels; a rematch puts everyone back on their spots', () => {
  const { r, conn, got, all, clear } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'add', team: 0, ai: false }); r.receive(a, { t: 'add', team: 1, ai: false }); r.receive(a, { t: 'map', map: 4 });
  assert.deepEqual([r.seats.map(x => x.name), r.seats.map(x => x.team)], [['Ann', 'Bo', '', ''], [0, 1, 0, 1]]);
  r.receive(b, { t: 'ai', seat: 2, on: true }); // (not the host's)
  assert.ok(!r.bySpot(2).ai);
  r.receive(a, { t: 'ai', seat: 2, on: true });
  r.receive(a, { t: 'ai', seat: 3, on: true, race: 'vael', diff: 3 });
  r.receive(a, { t: 'ai', seat: 1, on: true }); // (a person's seat)
  r.receive(a, { t: 'ai', seat: 0, on: true }); // (the host's own)
  let l = got(b, 'lobby').at(-1);
  assert.deepEqual(filled(l).map(x => [x.ai, x.race, x.diff]), [[false, 'humans', 1], [false, 'humans', 1], [true, 'random', 1], [true, 'vael', 3]], 'RANDOM on Medium unless told');
  r.receive(a, { t: 'ai', seat: 2, race: 'humans' }); // (no `on`: nothing)
  assert.equal(r.bySpot(2).race, 'random', '`ai` without `on` changes nothing');
  r.receive(a, { t: 'ai', seat: 2, on: true, race: 'humans' }); // (an AI seat's race: its level kept)
  r.receive(a, { t: 'ai', seat: 2, on: true, diff: 0 }); // (its level: its race kept)
  r.receive(a, { t: 'ai', seat: 2, on: true, diff: 4 }); r.receive(a, { t: 'ai', seat: 2, on: true, diff: 1.5 }); // (no such level)
  r.receive(a, { t: 'ai', seat: 3, on: false }); r.receive(a, { t: 'ai', seat: 3, on: true, race: 'vael', diff: 2 }); // (open again, then the AI's again)
  assert.deepEqual(r.seats.map(x => [x.ai, x.race, x.diff, x.team]), [[false, 'humans', 1, 0], [false, 'humans', 1, 1], [true, 'humans', 0, 0], [true, 'vael', 2, 1]]);
  assert.equal(r.connect(conn('c'), hello()), -1, 'nobody takes an AI seat');
  // Ready: the people only.
  r.receive(a, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby');
  r.receive(b, { t: 'ready', ready: true });
  assert.equal(r.phase, 'game');
  const s = got(a, 'start')[0].setup;
  assert.deepEqual([s.races, s.names, s.teams, s.spots, s.ai, s.diffs, s.diff, s.map], [['humans', 'humans', 'humans', 'vael'], ['Ann', '', 'Bo', ''], [0, 0, 1, 1], [0, 2, 1, 3], [0, 1, 0, 1], [0, 0, 0, 2], 2, 4], 'the game\'s seats by side, Ann\'s first; each AI at its own level; diff the hardest');
  assert.deepEqual([got(a, 'start')[0].seat, got(b, 'start')[0].seat], [0, 2], 'Bo plays game seat 2');
  assert.ok(Number.isInteger(s.side) && s.side >= 0, 'any turn of the seats round the starts');
  // The clock starts once the people have loaded, and runs on their acks: the AI seats are never waited for.
  r.receive(a, { t: 'loaded' }); r.receive(b, { t: 'loaded' }); r.tick(0); clear();
  play(r, [a, b], 0, 20000);
  assert.equal(got(a, 'away').length, 0, 'nobody away, the AI seats least of all');
  assert.ok(r.turn > 190, 'the clock ran');
  assert.ok(r.log.every(t => t.o.every(([seat]) => seat === 0 || seat === 2)), 'no orders from an AI seat');
  r.receive(b, { t: 'orders', w: [3, 1] }); play(r, [a, b], 20100, 20500);
  assert.ok(r.log.some(t => t.o.some(([seat, w]) => seat === 2 && w[1] === 1)), 'Bo\'s orders under his game seat');
  // Hash checks among the people; the game is over once theirs are.
  const cp = Math.floor(r.turn / CHECK_EVERY) * CHECK_EVERY;
  r.receive(a, { t: 'ack', turn: r.turn, check: { turn: cp, hash: 5 } }); r.receive(b, { t: 'ack', turn: r.turn, check: { turn: cp, hash: 5 } });
  assert.equal(got(a, 'desync').length, 0);
  r.receive(a, { t: 'over' }); r.receive(b, { t: 'over' });
  assert.equal(r.phase, 'over');
  // A rematch: the people want one; the AI seats stay the AI's, at their levels; everyone back on their spot and side.
  clear();
  r.receive(a, { t: 'rematch', want: true }); r.receive(b, { t: 'rematch', want: true });
  assert.equal(r.phase, 'lobby');
  l = got(a, 'lobby').at(-1);
  assert.deepEqual([filled(l).map(x => [x.ai, x.diff]), teamsOf(l)], [[[false, 1], [false, 1], [true, 0], [true, 2]], [0, 1, 0, 1]]);
  assert.deepEqual([got(a, 'seat').length, got(b, 'seat').map(m => m.seat)], [0, [1]], 'Bo told his spot again (Ann\'s number did not change)');
  const order = all(b).map(m => m.t);
  assert.ok(order.indexOf('seat') < order.indexOf('lobby'), 'before the lobby');
});

test('eight seats (M4 2e): two people and six AI seats, four against four, then four pairs; the people alone are waited for', () => {
  const { r, conn, got, clear } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  assert.equal(MAX_SEATS, 8);
  for (let k = 0; k < 6; k++) r.receive(a, { t: 'add', team: k < 3 ? 0 : 1, ai: true, race: k % 2 ? 'vael' : 'humans', diff: k % 4 });
  const l = got(b, 'lobby').at(-1);
  assert.deepEqual([filled(l).length, filled(l).filter(x => x.ai).length, l.teams, l.map], [8, 6, [0, 1, 0, 0, 0, 1, 1, 1], 8], 'every spot taken; the map grew to one that seats them');
  assert.deepEqual(got(b, 'seat').map(m => m.seat), [1], 'Bo where he sat');
  assert.equal(r.connect(conn('c'), hello({ name: 'Cy' })), -1, 'every seat taken: full');
  // Four pairs, each side a number of its own (kept in the lobby; the game numbers them 0 to 3).
  for (const [seat, team] of [[3, 1], [4, 6], [6, 6], [5, 7], [7, 7]]) r.receive(a, { t: 'side', seat, team });
  assert.deepEqual(got(a, 'lobby').at(-1).teams, [0, 1, 0, 1, 6, 7, 6, 7]);
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  const s = got(a, 'start')[0].setup;
  assert.deepEqual([s.teams, s.spots, s.ai.filter(Boolean).length, s.races.length, s.names.length], [[0, 0, 1, 1, 2, 2, 3, 3], [0, 2, 1, 3, 4, 6, 5, 7], 6, 8, 8]);
  assert.deepEqual([got(b, 'start')[0].seat, s.names[2], s.ai[2]], [2, 'Bo', 0], 'Bo at game seat 2, beside his partner');
  assert.deepEqual(s.diffs.filter((_, i) => s.ai[i]).sort(), [0, 0, 1, 1, 2, 3], 'each AI\'s level');
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
  r.receive(a, { t: 'add', team: 2, ai: true });
  r.receive(a, { t: 'ready', ready: true }); r.receive(b, { t: 'ready', ready: true });
  r.receive(a, { t: 'loaded' }); r.receive(b, { t: 'loaded' }); r.tick(0);
  play(r, [a, b], 0, 1000);
  r.receive(a, { t: 'pause' });
  assert.ok(r.hold);
  r.receive(b, { t: 'leave' });
  assert.equal(r.hold, null, 'one person left: nothing to wait for');
  assert.equal(got(a, 'left')[0].seat, 1);
});

test('a friend moves to an open seat (taking its side); not the host, not to a held or AI seat', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'add', team: 2, ai: false }); r.receive(a, { t: 'add', team: 3, ai: true });
  const token = r.seats[1].token;
  r.receive(b, { t: 'sit', seat: 3 }); // (the AI's)
  r.receive(b, { t: 'sit', seat: 0 }); // (the host's)
  r.receive(a, { t: 'sit', seat: 2 }); // (the host stays the host)
  assert.equal(r.seats[1].token, token);
  r.receive(b, { t: 'sit', seat: 2 });
  assert.equal(got(b, 'seat').at(-1).seat, 2, 'told its new seat');
  assert.equal(r.seats[2].token, token, 'its token with it');
  const l = got(a, 'lobby').at(-1);
  assert.deepEqual(filled(l).map(x => x.name), ['Ann', '', 'Bo', '']);
  assert.deepEqual(teamsOf(l), [0, 1, 2, 3], 'Bo on the side of the seat he took (spot 2); the spot he left open, on his old one');
  assert.equal(r.connect(conn('c'), hello({ name: 'Cy' })), 1, 'the seat it left is open');
  // The host leaves the lobby: its seat is open, and whoever moves there is the host.
  r.receive(a, { t: 'leave' }); r.close(a);
  r.receive(b, { t: 'sit', seat: 0 });
  assert.equal(r.seats[0].token, token);
  r.receive(b, { t: 'ai', seat: 3, on: true, diff: 0 });
  assert.equal(r.seats[3].diff, 0, 'the new host picks');
});

test('the lobby holds a seat whose connection went: away, not ready, a newcomer takes an open seat, the token takes it back; open again after the hold', () => {
  const { r, conn, got } = room(3); const a = conn('a'), b = conn('b'), c = conn('c');
  r.tick(1000);
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(b, { t: 'race', race: 'vael' }); r.receive(b, { t: 'ready', ready: true });
  const token = got(b, 'seat')[0].token;
  r.close(b); // (Bo's phone switched apps)
  let l = got(a, 'lobby').at(-1);
  assert.deepEqual(filled(l).map(s => [s.name, s.race, s.ready, s.here]), [['Ann', 'humans', false, true], ['Bo', 'vael', false, false], ['', 'humans', false, false]], 'its seat: its name and race, away, not ready');
  assert.equal(r.connect(c, hello({ name: 'Cy' })), 2, 'a newcomer takes the open seat, not the held one');
  assert.equal(r.connect(conn('d'), hello({ name: 'Di' })), -1, 'and then the room is full');
  r.tick(1000 + LOBBY_HOLD_MS - 1000);
  const b2 = conn('b2');
  assert.equal(r.connect(b2, hello({ name: 'Bo', token })), 1, 'its token takes it back');
  assert.equal(got(b2, 'seat')[0].token, token);
  l = got(a, 'lobby').at(-1);
  assert.deepEqual(filled(l).map(s => [s.name, s.race, s.here]), [['Ann', 'humans', true], ['Bo', 'vael', true], ['Cy', 'humans', true]], 'here again, as it was');
  // Gone again, longer than the hold: the seat is open for anyone (and the old token is no one's).
  r.close(b2);
  r.tick(2 * LOBBY_HOLD_MS);
  assert.equal(r.seats[1].token, token, 'held until the hold runs out');
  r.tick(2 * LOBBY_HOLD_MS + LOBBY_HOLD_MS + 1);
  l = got(a, 'lobby').at(-1);
  assert.deepEqual(l.seats[1], { name: '', race: 'humans', ready: false, here: false, ai: false, diff: 1 }, 'open again, told to the room');
  const b3 = conn('b3');
  assert.equal(r.connect(b3, hello({ name: 'Bo', token })), 1, 'back too late: a fresh seat');
  assert.notEqual(got(b3, 'seat')[0].token, token);
});

test('the host away in the lobby: the room waits for it (no new host, no start while a held seat is away); AI seats are as they were', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b'), c = conn('c');
  r.tick(0);
  r.connect(a, hello()); r.receive(a, { t: 'add', team: 2, ai: false }); r.receive(a, { t: 'add', team: 3, ai: true, race: 'vael' });
  const token = got(a, 'seat')[0].token;
  r.receive(a, { t: 'ready', ready: true });
  r.close(a); // (the host went to send the code)
  r.connect(b, hello({ name: 'Bo' })); r.connect(c, hello({ name: 'Cy' }));
  assert.deepEqual([got(b, 'seat')[0].seat, got(c, 'seat')[0].seat], [1, 2], 'the friends take the open seats, not the host\'s');
  r.receive(b, { t: 'sit', seat: 0 });
  assert.equal(r.seats[0].token, token, 'nobody moves to the host\'s held seat');
  r.receive(b, { t: 'ai', seat: 3, on: true, diff: 0 }); r.receive(b, { t: 'side', seat: 3, team: 0 }); r.receive(b, { t: 'add', team: 0, ai: true });
  assert.deepEqual([r.seats[3].diff, r.seats[3].team, r.seats.length], [1, 3, 4], 'nor picks for the host');
  let l = got(b, 'lobby').at(-1);
  assert.deepEqual(filled(l).map(s => [s.name, s.here, s.ai]), [['Ann', false, false], ['Bo', true, false], ['Cy', true, false], ['', false, true]], 'the host AWAY; the AI seat as it was');
  r.receive(b, { t: 'ready', ready: true }); r.receive(c, { t: 'ready', ready: true });
  assert.equal(r.phase, 'lobby', 'no start while the host is away');
  r.tick(LOBBY_HOLD_MS / 2);
  assert.ok(r.seats[3].ai && r.seats[3].race === 'vael', 'the AI seat is not held, nor freed');
  const a2 = conn('a2');
  assert.equal(r.connect(a2, hello({ token })), 0, 'the host back: seat 0');
  l = got(b, 'lobby').at(-1);
  assert.deepEqual(filled(l).map(s => [s.name, s.ready, s.here]), [['Ann', false, true], ['Bo', true, true], ['Cy', true, true], ['', false, false]], 'here, not ready');
  r.receive(a2, { t: 'ai', seat: 3, on: true, diff: 2 });
  assert.equal(r.seats[3].diff, 2, 'still the host');
  for (const x of [a2, b, c]) r.receive(x, { t: 'ready', ready: true }); // (ready again for the new difficulty)
  assert.equal(r.phase, 'game', 'everyone ready: the start');
  assert.deepEqual(got(a2, 'start')[0].setup.ai, [0, 0, 0, 1]);
});

test('the host gone longer than the hold: its seat is open, and a friend may take it (the new host)', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.tick(0);
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.close(a); r.tick(LOBBY_HOLD_MS + 2);
  assert.deepEqual(got(b, 'lobby').at(-1).seats[0], { name: '', race: 'humans', ready: false, here: false, ai: false, diff: 1 });
  r.receive(b, { t: 'sit', seat: 0 });
  assert.equal(got(b, 'seat').at(-1).seat, 0, 'the friend is the host now');
});

test('a lobby kept and restored (an adapter that lost its memory): the seats held, on their spots and sides, the AIs at their levels; their tokens take them back', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.tick(5000);
  r.connect(a, hello()); r.receive(a, { t: 'add', team: 2, ai: true, diff: 3 }); r.receive(a, { t: 'map', map: 4 });
  r.receive(a, { t: 'race', race: 'vael' });
  r.connect(b, hello({ name: 'Bo' })); r.receive(a, { t: 'side', seat: 1, team: 0 }); // (Bo on Ann's side, against the AIs)
  r.receive(a, { t: 'add', team: 2, ai: true, race: 'humans', diff: 0 });
  const token = got(a, 'seat')[0].token, bo = got(b, 'seat').at(-1).token;
  r.close(a); r.close(b);
  const kept = JSON.parse(JSON.stringify(r.keep()));
  assert.ok(!JSON.stringify(kept).includes('conn'), 'no connections kept');
  const y = room(); y.r.restore(kept, 9000);
  assert.deepEqual(y.r.seats.map(s => [s.spot, s.name, s.race, !!s.token, s.ai, s.diff, s.team]), [[0, 'Ann', 'vael', true, false, 1, 0], [1, 'Bo', 'humans', true, false, 1, 0], [2, '', 'random', false, true, 3, 2], [3, '', 'humans', false, true, 0, 2]], 'the seats, their spots, sides and levels');
  assert.deepEqual([y.r.seats[0].goneSince, y.r.map, y.r.phase], [5000, 4, 'lobby']);
  const a2 = y.conn('a2'); assert.equal(y.r.connect(a2, hello({ token })), 0, 'the token: its own seat');
  const b2 = y.conn('b2'); assert.equal(y.r.connect(b2, hello({ token: bo })), 1);
  assert.deepEqual(teamsOf(y.got(a2, 'lobby').at(-1)), [0, 0, 2, 2]);
  y.r.tick(5000 + LOBBY_HOLD_MS + 1);
  assert.equal(y.r.seats[0].token, token, 'here: not freed');
  for (const x of [a2, b2]) y.r.receive(x, { t: 'ready', ready: true });
  assert.deepEqual([y.got(a2, 'start')[0].setup.diffs, y.got(a2, 'start')[0].setup.teams], [[0, 0, 3, 0], [0, 0, 1, 1]], 'each AI at the level it had');
});

test('keep() is a v5 record (a spot and a team per seat, holes kept); restore checks one: unique spots, the host\'s spot 0, teams in range, the map fitted', () => {
  const { r, conn } = room(3); const a = conn('a');
  r.connect(a, hello());
  r.receive(a, { t: 'add', team: 5, ai: true, race: 'vael', diff: 2 }); r.receive(a, { t: 'drop', seat: 1 });
  const k = JSON.parse(JSON.stringify(r.keep())), seat = { name: '', race: 'humans', token: null, ai: false, diff: 1, goneSince: 0 };
  assert.deepEqual(k, { v: 5, map: 4, seats: [{ ...seat, spot: 0, team: 0, name: 'Ann', token: r.seats[0].token }, { ...seat, spot: 2, team: 2 }, { ...seat, spot: 3, team: 5, race: 'vael', ai: true, diff: 2 }] });
  const y = room(); assert.ok(y.r.restore(k, 100));
  const a2 = y.conn('a2'); y.r.connect(a2, hello({ token: k.seats[0].token }));
  const l = y.got(a2, 'lobby').at(-1);
  assert.deepEqual([l.seats.map(s => s && (s.ai ? 'AI' : s.name)), l.teams], [['Ann', null, '', 'AI', null, null, null, null], [0, null, 2, 5, null, null, null, null]], 'the spots and teams as they were');
  const bad = (seats) => room().r.restore({ v: 5, seats }, 100);
  assert.ok(!bad([{ spot: 0 }, { spot: 0 }]), 'a spot twice');
  assert.ok(!bad([{ spot: 1 }, { spot: 2 }]), 'no host\'s spot');
  assert.ok(!bad([{ spot: 0 }, { spot: MAX_SEATS }]) && !bad([{ spot: 0 }, { spot: '1' }]) && !bad([{ spot: 0 }, {}]), 'a spot out of range, or none');
  const z = room(); z.r.restore({ v: 5, seats: [{ spot: 0, team: 3 }, { spot: 4, team: 9 }] }, 100);
  assert.deepEqual(z.r.seats.map(s => [s.spot, s.team]), [[0, 0], [4, 4]], 'a team out of range: each its own, its spot\'s number');
  const w = room(); w.r.restore({ v: 5, map: 1, seats: [{ spot: 5, team: 1, ai: true }, { spot: 0, team: 1 }, { spot: 2, team: 0 }] }, 100);
  assert.deepEqual([w.r.seats.map(s => [s.spot, s.team]), w.r.map], [[[0, 1], [2, 0], [5, 1]], 4], 'in spot order; a two-start map for three: the first that seats them');
});

test('a lobby kept by the relay before the board\'s spots (PROTO 4: teams by seat; 3: a room-wide difficulty, no teams) comes back with a spot per seat', () => {
  const y = room();
  y.r.restore({ map: 8, diff: 2, teams: null, seats: [{ name: 'Ann', token: 't0', goneSince: 1 }, { ai: true, race: 'vael' }, { name: '', token: null, ai: false }] }, 100);
  assert.deepEqual(y.r.seats.map(s => [s.spot, s.name, s.ai, s.diff, s.team]), [[0, 'Ann', false, 1, 0], [1, '', true, 2, 1], [2, '', false, 1, 2]], 'each its own side; the AI at the room\'s level');
  assert.equal(y.r.map, 8);
  const z = room();
  z.r.restore({ map: 4, diff: 3, teams: [0, 1, 1, 0], seats: [{ name: 'Ann', token: 't0' }, { ai: true }, { ai: true, diff: 0 }, {}] }, 100);
  assert.deepEqual(z.r.seats.map(s => [s.spot, s.name, s.ai, s.diff, s.team]), [[0, 'Ann', false, 1, 0], [1, '', true, 3, 1], [2, '', true, 0, 1], [3, '', false, 1, 0]], 'spot = seat, its team; a level of its own kept');
  const w = room();
  w.r.restore({ map: 3, teams: [0, 9], seats: [{ name: 'Ann', token: 't0' }, { ai: true, diff: 7 }] }, 100);
  assert.deepEqual([w.r.seats.map(s => [s.diff, s.team]), w.r.map], [[[1, 0], [1, 1]], 3], 'bad teams: each its own; a bad level: Medium');
  const v = room();
  v.r.restore({ map: 2, teams: [0, 1, 2, 3, 4], seats: Array.from({ length: 5 }, () => ({ ai: true })) }, 100);
  assert.equal(v.r.map, 8, 'five seats on a two-start map: the first that seats them');
});

test('the room\'s map always seats it: a map short of starts refused, a seat added past the map\'s starts takes the smallest that has them (a random map stays random)', () => {
  const { r, conn, got } = room(); const a = conn('a'), b = conn('b');
  r.connect(a, hello()); r.connect(b, hello({ name: 'Bo' }));
  r.receive(a, { t: 'map', map: 3 }); // (64x64's random map)
  r.receive(a, { t: 'add', team: 2, ai: true });
  assert.equal(got(b, 'lobby').at(-1).map, 7, 'three seats: 96x96\'s random map, told in the lobby');
  r.receive(a, { t: 'map', map: 1 });
  assert.equal(r.map, 7, 'a two-start map for three: refused');
  r.receive(a, { t: 'map', map: 9 }); // (128x128: starts to spare)
  r.receive(a, { t: 'add', team: 3, ai: true }); r.receive(a, { t: 'add', team: 4, ai: true });
  assert.equal(r.map, 9, 'a map with starts to spare stays');
  for (const k of [4, 3, 2]) r.receive(a, { t: 'drop', seat: k });
  assert.equal(r.map, 9, 'and stays when seats go (a duel on an eight-start map)');
  r.receive(a, { t: 'map', map: 0 }); r.receive(a, { t: 'add', team: 2, ai: true });
  assert.equal(r.map, 4, 'a fixed map: the first of the size that seats them');
  assert.equal(new Room({ code: 'X', seats: 5, send: () => {} }).map, 8, 'a new room of five: a map that seats them');
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
  assert.deepEqual(got(c, 'lobby').at(-1).seats[1], { name: '', race: 'humans', ready: false, here: false, ai: false, diff: 1 }, 'open at once, told to all');
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
