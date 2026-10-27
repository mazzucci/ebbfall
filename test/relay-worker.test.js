// The Cloudflare relay (relay/worker.js) in Node, with fake WebSocket pairs and a fake Durable Object namespace (with
// storage, and eviction): a room opened and joined through the Worker, a game started and its turns ticking, leaving,
// a reconnect replacing a live socket, no such room, a taken code, no free code, an evicted lobby coming back (and an
// evicted game not), oversize messages, and what is not a WebSocket or not from the game's pages. Then the device
// test's reports (relay/bench.js): stored and read back by code, only from the game's pages, size, JSON, rate, expiry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { RoomObject } from '../relay/worker.js';
import { PROTO } from '../relay/room.js';
import { BenchStore, memoryStorage, BENCH_MAX, BENCH_TTL, BENCH_PER_MIN } from '../relay/bench.js';

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
/** A fake object's storage (a Durable Object's API over a Map). */
const storage = memoryStorage;
/** A fake namespace: one RoomObject per name, made on first use, its storage kept when it is evicted. */
function env(extra = {}) {
  const objects = new Map(), stores = new Map();
  const get = (n) => {
    if (!stores.has(n)) stores.set(n, storage());
    if (!objects.has(n)) objects.set(n, new RoomObject({ storage: stores.get(n) }, null, platform));
    return objects.get(n);
  };
  return { objects, evict: (n) => objects.delete(n), ...extra, ROOMS: { idFromName: (n) => n, get } };
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

test('an evicted lobby comes back empty for a late friend; an evicted game does not', async () => {
  const e = env();
  const { a, code } = await opened(e);
  a.close(); e.evict(code); // (the host went to a messaging app; Cloudflare dropped the empty room)
  const b = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(b, hello('Bo'));
  assert.equal(got(b, 'seat')[0]?.seat, 0, 'the lobby again, with this friend in it');
  const a2 = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(a2, hello('Ann'));
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
const post = (body, origin = 'https://ebbfall.com') => new Request('https://relay.ebbfall.com/bench', { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) } });
const get = (code) => new Request(`https://relay.ebbfall.com/bench/${code}`);
const REPORT = { v: 1, summary: { fps: 58.2, frameMs: { p95: 21.4 } }, device: { cores: 8 } };

test('a report: POSTed from the game, a code back, read by that code (GET needs no Origin)', async () => {
  const e = env({ ORIGINS });
  const res = await worker.fetch(post(JSON.stringify(REPORT)), e);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://ebbfall.com', 'the page may read the answer');
  const { code } = await res.json();
  assert.match(code, /^PERF-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  for (const c of [code, code.toLowerCase(), code.slice(5)]) {
    const r = await worker.fetch(get(c), e);
    assert.equal(r.status, 200, c);
    const got = await r.json();
    assert.equal(got.code, code); assert.deepEqual(got.report, REPORT);
    assert.ok(Math.abs(Date.parse(got.received) - Date.now()) < 5000);
  }
  assert.ok(e.objects.has('bench') && e.objects.size === 1, 'one object keeps the reports; no room opened');
  assert.equal((await worker.fetch(get('PERF-QQQQ'), e)).status, 404, 'no such report');
  assert.equal((await worker.fetch(get('PERF-AB1'), e)).status, 404, 'not a code');
  assert.equal((await worker.fetch(new Request('https://relay.ebbfall.com/'), e)).status, 426, 'the rooms are still WebSocket only');
});

test('reports only from the game\'s pages; a preflight for them', async () => {
  const e = env({ ORIGINS });
  assert.equal((await worker.fetch(post('{}', 'https://evil.example'), e)).status, 403);
  assert.equal((await worker.fetch(post('{}', null), e)).status, 403, 'no Origin (not a browser page)');
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

test('a report: 64 KB at most, JSON, an object', async () => {
  const e = env({ ORIGINS });
  const pad = (n) => JSON.stringify({ x: 'x'.repeat(n - 8) }); // (n bytes of JSON)
  assert.equal(pad(1000).length, 1000);
  assert.equal((await worker.fetch(post(pad(BENCH_MAX)), e)).status, 201, '64 KB: taken');
  assert.equal((await worker.fetch(post(pad(BENCH_MAX + 1)), e)).status, 413, 'a byte more: too large');
  const big = new Request('https://relay.ebbfall.com/bench', { method: 'POST', body: pad(200 * 1024), headers: { Origin: 'https://ebbfall.com', 'Content-Length': String(200 * 1024) } });
  assert.equal((await worker.fetch(big, e)).status, 413, 'a large length is refused before reading');
  for (const body of ['{"fps": 6', 'not json', '[1,2]', 'null', '42', '']) assert.equal((await worker.fetch(post(body), e)).status, 400, body);
});

test('reports: ten a minute, and gone after a week', async () => {
  let now = Date.UTC(2026, 9, 27);
  const st = storage(), store = new BenchStore(st, () => now);
  const codes = [];
  for (let i = 0; i < BENCH_PER_MIN; i++) { const r = await store.post('{"n":' + i + '}'); assert.equal(r.status, 201); codes.push((await r.json()).code.slice(5)); }
  assert.equal((await store.post('{}')).status, 429, 'the eleventh in a minute');
  now += 61 * 1000;
  assert.equal((await store.post('{}')).status, 201, 'a minute later');
  assert.equal((await store.get(codes[0])).status, 200);
  now += BENCH_TTL - 61 * 1000 - 1;
  assert.equal((await store.get(codes[0])).status, 200, 'still there just before a week');
  now += 1;
  assert.equal((await store.get(codes[0])).status, 404, 'a week: gone');
  assert.ok(st.map.has('r:' + codes[0]), 'still stored until a sweep');
  await store.post('{}'); // (a new report sweeps the old ones)
  for (const c of codes) assert.ok(!st.map.has('r:' + c), 'swept');
  assert.equal([...st.map.keys()].filter(k => k.startsWith('r:')).length, 2, 'the newer two stay');
});
