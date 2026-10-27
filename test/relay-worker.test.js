// The Cloudflare relay (relay/worker.js) in Node, with fake WebSocket pairs and a fake Durable Object namespace (with
// storage, and eviction): a room opened and joined through the Worker, a game started and its turns ticking, leaving,
// a reconnect replacing a live socket, no such room, a taken code, no free code, an evicted lobby coming back (its held
// seats too; an evicted game not), oversize messages, and what is not a WebSocket or not from the game's pages. Then the
// device test's reports (relay/bench.js): stored and read back by code, only from the game's pages, size, JSON, a known
// kind, limits per address and in all (by the minute, by the UTC day), expiry and the sweep of a backlog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { RoomObject } from '../relay/worker.js';
import { PROTO, LOBBY_HOLD_MS } from '../relay/room.js';
import { BenchStore, memoryStorage, BENCH_MAX, BENCH_TTL, BENCH_PER_MIN, BENCH_PER_DAY, BENCH_IP_PER_MIN, BENCH_IP_PER_DAY, BENCH_IP_GETS_PER_MIN } from '../relay/bench.js';

/** A connected pair of fake sockets: what one sends, the other's listeners get. */
function pair() {
  const end = () => ({
    listeners: {}, got: [], closed: false,
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    emit(t, e) { for (const f of this.listeners[t] || []) f(e); },
    accept() {},
    send(data) { if (this.closed) throw new Error('closed'); this.other.emit('message', { data }); },
    close() { if (this.closed) return; this.closed = this.other.closed = true; this.other.emit('close', {}); },
  });
  const a = end(), b = end(); a.other = b; b.other = a;
  a.addEventListener('message', (m) => a.got.push(JSON.parse(m.data))); // (the client's end keeps what it is sent)
  return [a, b];
}
const platform = { pair, respond: (client) => ({ status: 101, webSocket: client }) };
/** A fake object's storage (a Durable Object's API over a Map), counting its writes and keeping its alarm. */
const storage = () => {
  const m = memoryStorage(), s = Object.assign(m, { puts: 0, alarm: 0 }), put = m.put;
  return Object.assign(s, { async put(k, v) { s.puts++; return put(k, v); }, async setAlarm(t) { s.alarm = t; }, async deleteAll() { m.map.clear(); } });
};
/** A fake namespace: one RoomObject per name, made on first use, its storage kept when it is evicted. */
function env(extra = {}) {
  const objects = new Map(), stores = new Map();
  const get = (n) => {
    if (!stores.has(n)) stores.set(n, storage());
    if (!objects.has(n)) objects.set(n, new RoomObject({ storage: stores.get(n) }, null, platform));
    return objects.get(n);
  };
  return { objects, stores, evict: (n) => objects.delete(n), ...extra, ROOMS: { idFromName: (n) => n, get } };
}
const upgrade = (query, origin = 'https://ebbfall.com') => new Request(`https://relay.ebbfall.com/?${query}`, { headers: { Upgrade: 'websocket', Origin: origin } });
const say = (ws, msg) => ws.send(JSON.stringify(msg));
const got = (ws, t) => ws.got.filter(m => m.t === t);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
/** Open a room through the Worker: its first socket (seated) and its code. */
async function opened(e, name = 'Ann') {
  const a = (await worker.fetch(upgrade('new=1'), e)).webSocket;
  say(a, { t: 'hello', proto: PROTO, name });
  return { a, code: got(a, 'seat')[0].room };
}
const hello = (name) => ({ t: 'hello', proto: PROTO, name });

test('a room through the Worker: open, join by code, start, turns tick, leaving concedes, the clock stops when empty', async () => {
  const e = env();
  const a = (await worker.fetch(upgrade('new=1'), e)).webSocket;
  say(a, hello('Ann'));
  const code = got(a, 'seat')[0]?.room;
  assert.match(code, /^[A-Z]{4}$/);
  const b = (await worker.fetch(upgrade(`room=${code.toLowerCase()}`), e)).webSocket;
  try {
    say(b, hello('Bo'));
    assert.equal(got(b, 'seat')[0].seat, 1, 'the second seat, in the same room');
    for (const c of [a, b]) say(c, { t: 'ready', ready: true });
    assert.equal(got(a, 'start').length, 1); assert.equal(got(b, 'start').length, 1);
    for (const c of [a, b]) say(c, { t: 'loaded' });
    await wait(450);
    assert.ok(got(a, 'turn').length >= 3, `the clock runs (${got(a, 'turn').length} turns)`);
    say(b, { t: 'leave' }); b.close();
    assert.equal(got(a, 'left')[0]?.seat, 1);
    await wait(250);
    assert.ok(got(a, 'turn').some(t => t.o.some(([s, w]) => s === 1 && w[0] === 18)), 'its concede in a turn');
  } finally { a.close(); b.close(); }
  const obj = e.objects.get(code);
  assert.equal(obj.conns.size, 0); assert.equal(obj.timer, null, 'nobody connected: no clock');
});

test('no such room: told so, and closed', async () => {
  for (const q of ['room=QQQQ', 'room=', 'room=AB1']) {
    const c = (await worker.fetch(upgrade(q), env())).webSocket;
    assert.equal(got(c, 'error')[0]?.code, 'noroom', q);
    assert.ok(c.closed);
  }
});

test('a code in use is not given again; an idle one is', async () => {
  const o = new RoomObject({ storage: storage() }, null, platform);
  const first = await o.fetch(new Request('https://room/?code=BCDF&new=1'));
  assert.equal(first.status, 101);
  assert.equal((await o.fetch(new Request('https://room/?code=BCDF&new=1'))).status, 409, 'someone is in it');
  first.webSocket.close();
  assert.equal((await o.fetch(new Request('https://room/?code=BCDF&new=1'))).status, 409, 'just left: kept a while for a rejoin');
  o.lastUsed = Date.now() - 11 * 60 * 1000;
  assert.equal((await o.fetch(new Request('https://room/?code=BCDF&new=1'))).status, 101, 'idle: a new room');
  for (const c of o.conns) c.other.close(); // (the players hang up)
  assert.equal(o.timer, null);
});

test('a reconnect that replaces a live socket keeps its seat, in the lobby and in a game', async () => {
  const e = env();
  const { a, code } = await opened(e);
  const token = got(a, 'seat')[0].token;
  const a2 = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(a2, { t: 'hello', proto: PROTO, name: 'Ann', token });
  await wait(0);
  assert.equal(got(a, 'error')[0]?.code, 'replaced');
  assert.equal(got(a2, 'seat')[0]?.seat, 0, 'the same seat');
  say(a2, { t: 'race', race: 'vael' });
  assert.equal(got(a2, 'lobby').at(-1).seats[0].race, 'vael', 'and it is that seat: its choices count');
  const b = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(b, hello('Bo'));
  assert.equal(got(b, 'seat')[0]?.seat, 1, 'the other seat is still free');
  for (const c of [a2, b]) say(c, { t: 'ready', ready: true });
  for (const c of [a2, b]) say(c, { t: 'loaded' });
  const b2 = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(b2, { t: 'hello', proto: PROTO, token: got(b, 'seat')[0].token, next: 0 });
  await wait(0);
  assert.equal(got(a2, 'away').length, 0, 'no one is away for a replaced socket');
  for (const c of [a2, b2]) c.close();
});

test('no free code: told so', async () => {
  const taken = { fetch: async () => new Response('Taken', { status: 409 }) };
  const e = { ROOMS: { idFromName: (n) => n, get: () => taken } };
  assert.equal((await worker.fetch(upgrade('new=1'), e)).status, 503);
});

test('an evicted lobby comes back as it was: the host\'s seat held (name, token), a late friend takes the next, the host\'s token seat 0', async () => {
  const e = env();
  const { a, code } = await opened(e);
  const token = got(a, 'seat')[0].token;
  say(a, { t: 'race', race: 'vael' }); say(a, { t: 'seats', n: 3, map: 4 }); say(a, { t: 'ai', seat: 2, on: true });
  a.close(); // (the host went to a messaging app to send the code)
  await wait(0);
  const kept = await e.stores.get(code).get('room');
  assert.deepEqual(kept.lobby.seats.map(s => [s.name, s.race, s.token, s.ai]), [['Ann', 'vael', token, false], ['', 'humans', null, false], ['', 'random', null, true]], 'the lobby kept, with its tokens');
  assert.ok(!('conn' in kept.lobby.seats[0]), 'no connections kept');
  e.evict(code); // (Cloudflare dropped the empty room)
  const b = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(b, hello('Bo'));
  assert.equal(got(b, 'seat')[0]?.seat, 1, 'the friend: the next seat, not the host\'s');
  let l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(s => [s.name, s.race, s.here, s.ai]), [['Ann', 'vael', false, false], ['Bo', 'humans', true, false], ['', 'random', false, true]], 'Ann AWAY, the AI seat as it was');
  assert.equal(l.map, 4);
  const a2 = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(a2, { t: 'hello', proto: PROTO, name: 'Ann', token });
  assert.deepEqual([got(a2, 'seat')[0]?.seat, got(a2, 'seat')[0]?.room], [0, code], 'the host\'s token: seat 0, the same room');
  l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.map(s => [s.name, s.here]), [['Ann', true], ['Bo', true], ['', false]]);
  for (const c of [a2, b]) say(c, { t: 'ready', ready: true });
  await wait(0);
  assert.equal(got(b, 'start').length, 1);
  for (const c of [a2, b]) c.close();
  e.evict(code); // (a deploy, or an eviction, mid-game)
  const c = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  assert.equal(got(c, 'error')[0]?.code, 'noroom', 'a game is not brought back');
  const n = await e.ROOMS.get(code).fetch(new Request(`https://room/?code=${code}&new=1`));
  assert.equal(n.status, 409, 'its code is not given to a new room while recent');
});

test('an evicted empty lobby comes back for a late friend; a hold that ran out while evicted is over', async () => {
  const e = env();
  const { a, code } = await opened(e);
  say(a, { t: 'leave' }); a.close(); // (the host gave the seat up)
  e.evict(code);
  const b = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(b, hello('Bo'));
  assert.equal(got(b, 'seat')[0]?.seat, 0, 'the lobby again, with this friend in it');
  const token = got(b, 'seat')[0].token;
  b.close(); await wait(0);
  // Bo's seat is held; the record says since when. Long enough ago, and the hold is over by the next visit.
  const store = e.stores.get(code), kept = await store.get('room');
  assert.equal(kept.lobby.seats[0].token, token);
  kept.lobby.seats[0].goneSince = Date.now() - LOBBY_HOLD_MS - 1000; await store.put('room', kept);
  e.evict(code);
  const c = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(c, hello('Cy'));
  assert.equal(got(c, 'seat')[0]?.seat, 0, 'the seat is open again');
  assert.deepEqual(got(c, 'lobby').at(-1).seats.map(s => s.name), ['Cy', '']);
  c.close();
});

test('the record is written when it changes, at most once a second (the last change too), not on every message or fetch', async () => {
  const e = env();
  const { a, code } = await opened(e);
  const store = e.stores.get(code);
  await wait(0);
  const first = store.puts;
  assert.equal(first, 1, 'the new room: one write');
  for (let i = 0; i < 1000; i++) say(a, { t: 'ready', ready: i % 2 === 0 }); // (no change to the record)
  for (let i = 0; i < 1000; i++) say(a, { t: 'race', race: i % 2 ? 'vael' : 'humans' });
  await wait(0);
  assert.equal(store.puts, first, 'within the second: nothing more yet');
  await wait(1100);
  assert.equal(store.puts, first + 1, 'then one trailing write');
  assert.equal((await store.get('room')).lobby.seats[0].race, 'vael', 'with the last change');
  const b = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket; // (a fetch that says nothing: no write)
  await wait(0);
  assert.equal(store.puts, first + 1);
  say(a, { t: 'race', race: 'humans' });
  a.close(); b.close(); await wait(0);
  assert.equal(store.puts, first + 2, 'the last socket gone: written at once');
  assert.ok(!(await store.get('room')).lobby.seats[0].here, 'its seat held, away');
  assert.ok(store.alarm > Date.now(), 'an alarm set to forget the room once idle');
});

test('an idle room\'s alarm deletes its record: the code is free, the room gone', async () => {
  const e = env();
  const { a, code } = await opened(e);
  a.close(); await wait(0);
  await e.objects.get(code).alarm();
  assert.equal(await e.stores.get(code).get('room'), undefined);
  const c = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  assert.equal(got(c, 'error')[0]?.code, 'noroom');
  e.evict(code);
  assert.equal((await e.ROOMS.get(code).fetch(new Request(`https://room/?code=${code}&new=1`))).status, 101, 'free for a new room');
  for (const x of e.objects.get(code).conns) x.other.close();
});

test('a stored record of a bad shape comes back as an empty lobby, never a broken room', async () => {
  const bad = [
    { seats: [{ name: 'Solo', token: 't1' }] }, // (one seat: one player could start alone)
    { seats: Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, token: `t${i}` })) },
    { seats: [null, null] }, { seats: 'xx' }, { seats: [[], 5] }, 5, null,
    { seats: [{ name: 'Ann', token: 't0' }, { name: 'Bo', token: 7 }], map: 'x', diff: 99, teams: [0, 0] },
  ];
  for (const lobby of bad) {
    const st = storage(); await st.put('room', { code: 'BCDF', used: Date.now(), started: false, lobby });
    const o = new RoomObject({ storage: st }, null, platform);
    const c = (await o.fetch(new Request('https://room/?code=BCDF'))).webSocket;
    say(c, hello('Cy'));
    const seats = o.room.seats;
    assert.ok(seats.length >= 2 && seats.length <= 8, `${JSON.stringify(lobby)}: ${seats.length} seats`);
    assert.ok(got(c, 'seat').length === 1, `${JSON.stringify(lobby)}: a seat`);
    if (lobby?.map === 'x') assert.deepEqual([seats.map(s => s.name), got(c, 'seat')[0].seat, o.room.map, o.room.diff, o.room.teams], [['Ann', 'Cy'], 1, 0, 1, null], 'the good parts kept (Ann held), the bad dropped (Bo, no token: open)');
    else assert.equal(got(c, 'seat')[0].seat, 0, `${JSON.stringify(lobby)}: an empty lobby`);
    c.close();
  }
});

test('oversize or binary messages close the connection; the room goes on', async () => {
  const e = env();
  const a = (await worker.fetch(upgrade('new=1'), e)).webSocket;
  say(a, hello('Ann'));
  const code = got(a, 'seat')[0].room;
  const b = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  b.send('x'.repeat(65 * 1024));
  assert.ok(b.closed, 'oversize: closed');
  const c = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  c.other.emit('message', { data: new ArrayBuffer(8) });
  assert.ok(c.closed, 'binary: closed');
  assert.ok(!a.closed);
  await wait(0); // (a kick's clean-up runs once the call that kicked has finished)
  assert.equal(e.objects.get(code).conns.size, 1);
  a.close();
});

test('only WebSockets, only from the game\'s pages when ORIGINS is set', async () => {
  assert.equal((await worker.fetch(new Request('https://relay.ebbfall.com/'), env())).status, 426);
  const e = env({ ORIGINS: 'https://ebbfall.com,http://localhost:5173' });
  assert.equal((await worker.fetch(upgrade('new=1', 'https://evil.example'), e)).status, 403);
  const ok = await worker.fetch(upgrade('new=1'), e);
  assert.equal(ok.status, 101);
  ok.webSocket.close();
});

// ---- the device test's reports ----
const ORIGINS = 'https://ebbfall.com,http://localhost:5173';
let addr = 0; // (each request from an address of its own unless a test says otherwise: the per-address limits apart)
const post = (body, origin = 'https://ebbfall.com', ip = `10.0.0.${++addr}`) => new Request('https://relay.ebbfall.com/bench', { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}) } });
const get = (code, ip = `10.1.0.${++addr}`) => new Request(`https://relay.ebbfall.com/bench/${code}`, { headers: { 'CF-Connecting-IP': ip } });
const REPORT = { v: 1, kind: 'ebbfall-bench', summary: { fps: 58.2, frameMs: { p95: 21.4 } }, device: { cores: 8 } };
const CODE = /^PERF-[BCDFGHJKLMNPQRSTVWXZ]{6}$/;
const DAY = 86400000;
/** A store on a fake clock (`at.now`). */
const clocked = (now = Date.UTC(2026, 9, 27, 12)) => { const at = { now }, st = storage(); return { at, st, store: new BenchStore(st, () => at.now) }; };

test('a report: POSTed from the game, a code back, read by that code (GET needs no Origin)', async () => {
  const e = env({ ORIGINS });
  const res = await worker.fetch(post(JSON.stringify(REPORT)), e);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://ebbfall.com', 'the page may read the answer');
  const { code } = await res.json();
  assert.match(code, CODE);
  for (const c of [code, code.toLowerCase(), code.slice(5)]) {
    const r = await worker.fetch(get(c), e);
    assert.equal(r.status, 200, c);
    assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
    const got = await r.json();
    assert.equal(got.code, code); assert.deepEqual(got.report, REPORT);
    assert.ok(Math.abs(Date.parse(got.received) - Date.now()) < 5000);
  }
  assert.ok(e.objects.has('bench') && e.objects.size === 1, 'one object keeps the reports; no room opened');
  assert.equal((await worker.fetch(get('PERF-QQQQQQ'), e)).status, 404, 'no such report');
  assert.equal((await worker.fetch(get('PERF-BCDF'), e)).status, 404, 'a four-letter code (the first format): not a code now');
  assert.equal((await worker.fetch(new Request('https://relay.ebbfall.com/'), e)).status, 426, 'the rooms are still WebSocket only');
});

test('reports only from the game\'s pages; a preflight for them', async () => {
  const e = env({ ORIGINS });
  assert.equal((await worker.fetch(post(JSON.stringify(REPORT), 'https://evil.example'), e)).status, 403);
  assert.equal((await worker.fetch(post(JSON.stringify(REPORT), null), e)).status, 403, 'no Origin (not a browser page)');
  const pre = await worker.fetch(new Request('https://relay.ebbfall.com/bench', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } }), e);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.match(pre.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  const bad = await worker.fetch(new Request('https://relay.ebbfall.com/bench', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), e);
  assert.equal(bad.status, 403);
  assert.equal((await worker.fetch(new Request('https://relay.ebbfall.com/bench', { method: 'PUT', body: '{}', headers: { Origin: 'https://ebbfall.com' } }), e)).status, 405);
  assert.equal(e.objects.size, 0, 'nothing reached the store');
});

test('a report: 64 KB at most, JSON, an object of a known kind and version', async () => {
  const e = env({ ORIGINS });
  const head = JSON.stringify({ v: 1, kind: 'ebbfall-bench', x: '' }).length;
  const pad = (n) => JSON.stringify({ v: 1, kind: 'ebbfall-bench', x: 'x'.repeat(n - head) }); // (n bytes of JSON)
  assert.equal(pad(1000).length, 1000);
  assert.equal((await worker.fetch(post(pad(BENCH_MAX)), e)).status, 201, '64 KB: taken');
  assert.equal((await worker.fetch(post(pad(BENCH_MAX + 1)), e)).status, 413, 'a byte more: too large');
  const big = new Request('https://relay.ebbfall.com/bench', { method: 'POST', body: pad(200 * 1024), headers: { Origin: 'https://ebbfall.com', 'Content-Length': String(200 * 1024) } });
  assert.equal((await worker.fetch(big, e)).status, 413, 'a large length is refused before reading');
  for (const body of ['{"fps": 6', 'not json', '[1,2]', 'null', '42', '', '{}', '{"v":1}', '{"kind":"ebbfall-bench"}', '{"kind":"ebbfall-bench","v":2}', '{"kind":"other","v":1}']) {
    assert.equal((await worker.fetch(post(body), e)).status, 400, body);
  }
});

test('reports: two a minute and ten a day from an address (an IPv6 /64), whatever its Origin says', async () => {
  const e = env({ ORIGINS }), body = JSON.stringify(REPORT), ip = '203.0.113.7';
  for (let i = 0; i < BENCH_IP_PER_MIN; i++) assert.equal((await worker.fetch(post(body, undefined, ip), e)).status, 201);
  assert.equal((await worker.fetch(post(body, undefined, ip), e)).status, 429, 'a third in the minute');
  assert.equal((await worker.fetch(post(body, undefined, '203.0.113.8'), e)).status, 201, 'another address');
  const v6 = (n) => `2001:db8:1:2:${n}::1`; // (one line's /64: one address)
  assert.equal((await worker.fetch(post(body, undefined, v6(1)), e)).status, 201);
  assert.equal((await worker.fetch(post(body, undefined, v6(2)), e)).status, 201);
  assert.equal((await worker.fetch(post(body, undefined, v6(3)), e)).status, 429, 'the same /64');
  assert.equal((await worker.fetch(post(body, undefined, '2001:db8:1:3::1'), e)).status, 201, 'another /64');
  // The day, on a clock: ten, then none until the next UTC day.
  const { at, store } = clocked();
  for (let i = 0; i < BENCH_IP_PER_DAY; i++) { assert.equal((await store.post(body, ip)).status, 201, `report ${i + 1}`); at.now += 31000; }
  at.now += 60000;
  assert.equal((await store.post(body, ip)).status, 429, 'an eleventh today');
  assert.equal((await store.post(body, 'other')).status, 201, 'others still may');
  at.now = Math.ceil(at.now / DAY) * DAY; // (midnight UTC)
  assert.equal((await store.post(body, ip)).status, 201, 'the next day');
});

test('reads: thirty a minute from an address', async () => {
  const { at, store } = clocked();
  const code = (await (await store.post(JSON.stringify(REPORT), 'a')).json()).code.slice(5);
  for (let i = 0; i < BENCH_IP_GETS_PER_MIN; i++) assert.equal((await store.get(code, 'b')).status, 200);
  assert.equal((await store.get(code, 'b')).status, 429);
  assert.equal((await store.get(code, 'c')).status, 200, 'another address');
  at.now += 60000;
  assert.equal((await store.get(code, 'b')).status, 200, 'a minute later');
});

test('reports in all: ten a minute and 500 a UTC day, from any number of addresses', async () => {
  const { at, store } = clocked(Date.UTC(2026, 9, 27, 0, 30));
  let ip = 0;
  for (let i = 0; i < BENCH_PER_MIN; i++) assert.equal((await store.post('{}', `x${++ip}`)).status, 201);
  assert.equal((await store.post('{}', `x${++ip}`)).status, 429, 'the eleventh in a minute');
  at.now += 61000;
  for (let i = BENCH_PER_MIN; i < BENCH_PER_DAY; i++) { assert.equal((await store.post('{}', `x${++ip}`)).status, 201, `report ${i + 1}`); at.now += 6100; }
  assert.equal((await store.post('{}', `x${++ip}`)).status, 429, 'the day is full');
  at.now = Math.ceil(at.now / DAY) * DAY - 1;
  assert.equal((await store.post('{}', `x${++ip}`)).status, 429, 'until midnight UTC');
  at.now += 1;
  assert.equal((await store.post('{}', `x${++ip}`)).status, 201, 'a new day');
});

test('reports are gone after a week, and a backlog is swept 40 at a time', async () => {
  const { at, st, store } = clocked();
  const codes = [];
  for (let i = 0; i < 100; i++) { codes.push((await (await store.post('{"n":' + i + '}', `y${i}`)).json()).code.slice(5)); at.now += 6100; }
  const reports = () => [...st.map.keys()].filter(k => k.startsWith('r:')).length;
  assert.equal(reports(), 100);
  at.now = Date.UTC(2026, 9, 27, 12) + BENCH_TTL - 1;
  assert.equal((await store.get(codes[0], 'z')).status, 200, 'still there just before a week');
  at.now += 1;
  assert.equal((await store.get(codes[0], 'z')).status, 404, 'a week: gone');
  assert.ok(st.map.has('r:' + codes[0]), 'still stored until a sweep');
  at.now += 7 * DAY; // (all 100 are old now)
  await store.post('{}', 'w1');
  assert.equal(reports(), 100 - 40 + 1, 'a new report sweeps 40');
  await store.post('{}', 'w2'); await store.post('{}', 'w3');
  assert.equal(reports(), 3, 'three posts: the backlog is gone, the new ones stay');
  assert.ok(codes.every(c => !st.map.has('r:' + c)) && ![...st.map.keys()].some(k => k.startsWith('t:') && k.split(':')[2] === codes[99]));
});
