// The Cloudflare relay (relay/worker.js) in Node, with fake WebSocket pairs and a fake Durable Object namespace (with
// storage, and eviction): a room opened and joined through the Worker, a game started and its turns ticking, leaving,
// a reconnect replacing a live socket, no such room, a taken code, no free code, an evicted lobby coming back (its held
// seats too; an evicted game not), oversize messages, and what is not a WebSocket or not from the game's pages; GET
// /version (the protocol, and the build CI deployed, which it reads before deploying the relay or the site). Then the
// device test's reports (relay/bench.js): stored and read back by code, only from the game's pages, size, JSON, a known
// kind, limits per address and in all (by the minute, by the day), expiry and the sweep of a backlog. And the rooms'
// codes and limits (src/net/roomcode.js, relay/limits.js, relay/edge.js): six letters, read as typed or shown, a code of
// the first format told to update; opening rooms per address (a minute's, an hour's) and in all, joins per address (a
// miss costs more: a guesser is stopped, and learns nothing once stopped), on a fake clock; the bindings as wrangler.toml
// declares them; a limit that cannot be asked lets the request go on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import entry, { RoomObject } from '../relay/worker.js';
import { relay } from '../relay/edge.js';
import { PROTO, LOBBY_HOLD_MS } from '../relay/room.js';
import { readFileSync } from 'node:fs';
import { rateLimit, OpenBudget, Limiter, addressKey, SAY, OPEN_PER_MIN, OPEN_PER_HOUR, ROOMS_PER_MIN, ROOMS_PER_HOUR, JOIN_POINTS, MISS_COST, MINUTE, HOUR } from '../relay/limits.js';
import { ALPHABET, newCode, showCode } from '../src/net/roomcode.js';
import { PROTO as CLIENT_PROTO } from '../src/net/net.js';
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
const worker = relay(platform); // (relay/worker.js's default export is relay() on Cloudflare's own sockets)
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
const upgrade = (query, origin = 'https://ebbfall.com', ip = '') => new Request(`https://relay.ebbfall.com/?${query}`, { headers: { Upgrade: 'websocket', Origin: origin, ...(ip ? { 'CF-Connecting-IP': ip } : {}) } });
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
  assert.match(code, new RegExp(`^[${ALPHABET}]{6}$`));
  const b = (await worker.fetch(upgrade(`room=${showCode(code).toLowerCase()}`), e)).webSocket; // (as shown, in lower case: BCD-fgh)
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

test('no such room: told so, and closed; a code of the first format (four letters): told to update, no object woken', async () => {
  for (const q of ['room=QQQQQQ', 'room=', 'room=AB1', 'room=BCDFGHJ', 'x=1']) {
    const e = env(), c = (await worker.fetch(upgrade(q), e)).webSocket;
    assert.deepEqual(got(c, 'error').map(m => [m.code, m.msg]), [['noroom', 'No room with that code']], q);
    assert.ok(c.closed);
    assert.equal(e.objects.size, q === 'room=QQQQQQ' ? 1 : 0, `${q}: a room's object only for a code it could be`);
    assert.equal([...e.stores.values()].reduce((n, st) => n + st.puts + st.map.size, 0), 0, `${q}: nothing stored`);
  }
  for (const q of ['room=BCDF', 'room=bcdf']) {
    const e = env(), c = (await worker.fetch(upgrade(q), e)).webSocket;
    assert.deepEqual(got(c, 'error').map(m => m.code), ['update'], `${q}: an old client, told to update (its hello would be)`);
    assert.ok(c.closed); assert.equal(e.objects.size, 0);
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
  say(a, { t: 'race', race: 'vael' }); say(a, { t: 'add', team: 2, ai: false }); say(a, { t: 'map', map: 4 }); say(a, { t: 'ai', seat: 2, on: true, diff: 3 });
  a.close(); // (the host went to a messaging app to send the code)
  await wait(0);
  const kept = await e.stores.get(code).get('room');
  assert.deepEqual(kept.lobby.seats.map(s => [s.spot, s.name, s.race, s.token, s.ai]), [[0, 'Ann', 'vael', token, false], [1, '', 'humans', null, false], [2, '', 'random', null, true]], 'the lobby kept, with its spots and tokens');
  assert.equal(kept.lobby.v, 5, 'a record of PROTO 5\'s shape');
  assert.ok(!('conn' in kept.lobby.seats[0]), 'no connections kept');
  e.evict(code); // (Cloudflare dropped the empty room)
  const b = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(b, hello('Bo'));
  assert.equal(got(b, 'seat')[0]?.seat, 1, 'the friend: the next seat, not the host\'s');
  let l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.slice(0, 4).map(s => s && [s.name, s.race, s.here, s.ai]), [['Ann', 'vael', false, false], ['Bo', 'humans', true, false], ['', 'random', false, true], null], 'Ann AWAY, the AI seat as it was, each at its spot');
  assert.deepEqual([l.map, l.seats[2].diff, l.teams.slice(0, 4)], [4, 3, [0, 1, 2, null]], 'the map, the AI\'s level, the sides');
  const a2 = (await worker.fetch(upgrade(`room=${code}`), e)).webSocket;
  say(a2, { t: 'hello', proto: PROTO, name: 'Ann', token });
  assert.deepEqual([got(a2, 'seat')[0]?.seat, got(a2, 'seat')[0]?.room], [0, code], 'the host\'s token: seat 0, the same room');
  l = got(b, 'lobby').at(-1);
  assert.deepEqual(l.seats.filter(Boolean).map(s => [s.name, s.here]), [['Ann', true], ['Bo', true], ['', false]]);
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
  assert.deepEqual(got(c, 'lobby').at(-1).seats.filter(Boolean).map(s => s.name), ['Cy', '']);
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
    { v: 5, seats: [{ spot: 0, name: 'Ann', token: 't0' }, { spot: 0, name: 'Bo', token: 't1' }] }, { v: 5, seats: [{ spot: 1, name: 'Ann', token: 't0' }, { spot: 2 }] }, // (a spot twice; no host's spot)
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
    if (lobby?.map === 'x') assert.deepEqual([seats.map(s => s.name), got(c, 'seat')[0].seat, o.room.map, seats.map(s => s.team)], [['Ann', 'Cy'], 1, 0, [0, 0]], 'the good parts kept (Ann held, the one side), the bad dropped (Bo, no token: open; the map)');
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

test('GET /version: the protocol and the build CI deployed, from anywhere, never cached; the client speaks that protocol', async () => {
  assert.equal(CLIENT_PROTO, PROTO, 'src/net/net.js and relay/room.js agree (CI publishes the site only when the live relay says this PROTO)');
  const e = env({ ORIGINS: 'https://ebbfall.com', RELAY_BUILD: '0123456789abcdef' });
  assert.equal(PROTO, 6, 'PROTO 6: six-letter codes, the limits, the host\'s remove (a client of 5 is told to update)');
  assert.equal(typeof entry.fetch, 'function', 'the entry module\'s Worker');
  const res = await worker.fetch(new Request('https://relay.ebbfall.com/version'), e); // (no Origin: curl in CI)
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await res.json(), { proto: PROTO, build: '0123456789abcdef' });
  assert.deepEqual(await (await worker.fetch(new Request('https://relay.ebbfall.com/version'), env())).json(), { proto: PROTO, build: null }, 'deployed without a build (by hand): null, so CI deploys');
  assert.equal((await worker.fetch(new Request('https://relay.ebbfall.com/version', { method: 'POST', body: 'x' }), e)).status, 405);
  assert.equal((await worker.fetch(new Request('https://relay.ebbfall.com/version/x'), e)).status, 426, 'only that path');
  assert.equal(e.objects.size, 0, 'no object woken');
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

test('reports: two a minute and ten in 24 hours from an address (an IPv6 /64), whatever its Origin says', async () => {
  const e = env({ ORIGINS }), body = JSON.stringify(REPORT), ip = '203.0.113.7';
  for (let i = 0; i < BENCH_IP_PER_MIN; i++) assert.equal((await worker.fetch(post(body, undefined, ip), e)).status, 201);
  assert.equal((await worker.fetch(post(body, undefined, ip), e)).status, 429, 'a third in the minute');
  assert.equal((await worker.fetch(post(body, undefined, '203.0.113.8'), e)).status, 201, 'another address');
  const v6 = (n) => `2001:db8:1:2:${n}::1`; // (one line's /64: one address)
  assert.equal((await worker.fetch(post(body, undefined, v6(1)), e)).status, 201);
  assert.equal((await worker.fetch(post(body, undefined, v6(2)), e)).status, 201);
  assert.equal((await worker.fetch(post(body, undefined, v6(3)), e)).status, 429, 'the same /64');
  assert.equal((await worker.fetch(post(body, undefined, '2001:db8:1:3::1'), e)).status, 201, 'another /64');
  // The day, on a clock (relay/limits.js Limiter: 24 hours from the first): ten, then none until a day after the first.
  const { at, store } = clocked(), first = at.now;
  for (let i = 0; i < BENCH_IP_PER_DAY; i++) { assert.equal((await store.post(body, ip)).status, 201, `report ${i + 1}`); at.now += 31000; }
  at.now += 60000;
  const no = await store.post(body, ip);
  assert.deepEqual([no.status, (await no.json()).error], [429, 'Too many reports from here today'], 'an eleventh');
  assert.equal((await store.post(body, 'other')).status, 201, 'others still may');
  at.now = first + DAY - 1;
  assert.equal((await store.post(body, ip)).status, 429, 'not yet a day');
  at.now = first + DAY;
  assert.equal((await store.post(body, ip)).status, 201, 'a day after the first');
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

// ---- the rooms' limits ----
/** An environment with the rate limiting bindings and the limits object on one fake clock (`at.now`). */
function limited(now = Date.UTC(2026, 9, 31, 12)) {
  const at = { now }, clock = () => at.now;
  const e = env({ CREATE_LIMIT: rateLimit(OPEN_PER_MIN, 60, clock), JOIN_LIMIT: rateLimit(JOIN_POINTS, 60, clock) });
  e.ROOMS.get('limits').limits = new OpenBudget(clock);
  return { at, e };
}
const errorOf = (ws) => got(ws, 'error')[0];
/** Open a room from `ip`: its code, or the error it was refused with. */
async function openFrom(e, ip) {
  const ws = (await worker.fetch(upgrade('new=1', undefined, ip), e)).webSocket;
  if (ws.closed) return errorOf(ws);
  say(ws, hello('Ann'));
  const seat = got(ws, 'seat')[0]; ws.close();
  return seat ? seat.room : errorOf(ws);
}

test('the bindings are wrangler.toml\'s, with relay/limits.js\'s numbers', () => {
  const toml = readFileSync(new URL('../relay/wrangler.toml', import.meta.url), 'utf8');
  const binding = (name) => toml.match(new RegExp(`name = "${name}"[^\\n]*\\nnamespace_id = "(\\d+)"\\nsimple = \\{ limit = (\\d+), period = (\\d+) \\}`));
  const create = binding('CREATE_LIMIT'), join = binding('JOIN_LIMIT');
  assert.ok(create && join, 'both declared');
  assert.deepEqual([Number(create[2]), Number(create[3])], [OPEN_PER_MIN, 60]);
  assert.deepEqual([Number(join[2]), Number(join[3])], [JOIN_POINTS, 60]);
  assert.notEqual(create[1], join[1], 'a namespace each');
});

test('opening rooms: five a minute from an address (an IPv6 /64), whatever its Origin says; others may; a minute later again', async () => {
  const { at, e } = limited();
  for (let i = 0; i < OPEN_PER_MIN; i++) assert.match(await openFrom(e, '198.51.100.1'), /^[A-Z]{6}$/, `room ${i + 1}`);
  const objects = e.objects.size;
  const no = await openFrom(e, '198.51.100.1');
  assert.deepEqual([no.code, no.msg], ['limit', 'Too many tries: wait a minute and try again'], 'a sixth: told to wait, over the socket (a page cannot read an HTTP status)');
  assert.equal(e.objects.size, objects, 'no room\'s object woken');
  assert.match(await openFrom(e, '198.51.100.2'), /^[A-Z]{6}$/, 'another address');
  for (let i = 0; i < OPEN_PER_MIN; i++) assert.match(await openFrom(e, `2001:db8:5:6:${i}::1`), /^[A-Z]{6}$/);
  assert.equal((await openFrom(e, '2001:db8:5:6:ffff::9')).code, 'limit', 'the same /64');
  at.now += 60000;
  assert.match(await openFrom(e, '198.51.100.1'), /^[A-Z]{6}$/, 'a minute later');
});

test('opening rooms: thirty an hour from an address, and everyone\'s thirty a minute and 600 an hour (the limits object)', async () => {
  const at = { now: 0 }, b = new OpenBudget(() => at.now);
  for (let i = 0; i < OPEN_PER_HOUR; i++) { assert.equal(b.open('a'), '', `room ${i + 1}`); at.now += 61000; }
  assert.equal(b.open('a'), SAY.hour, 'the 31st in the hour');
  assert.equal(b.open('b'), '', 'another address');
  at.now = HOUR + 1; // (the first room an hour old)
  assert.equal(b.open('a'), '', 'an hour after its first');
  const all = new OpenBudget(() => at.now); at.now = 10 * HOUR;
  for (let i = 0; i < ROOMS_PER_MIN; i++) assert.equal(all.open(`x${i}`), '');
  assert.equal(all.open('fresh'), SAY.busy, 'everyone\'s minute is full: a new address too');
  assert.equal(all.ips.check('fresh'), null, 'nothing counted for the refused');
  at.now += MINUTE;
  let n = ROOMS_PER_MIN;
  while (n < ROOMS_PER_HOUR) { for (let i = 0; i < ROOMS_PER_MIN && n < ROOMS_PER_HOUR; i++, n++) assert.equal(all.open(`y${n}`), '', `room ${n + 1}`); at.now += MINUTE; }
  assert.equal(all.open('late'), SAY.busy, 'everyone\'s hour is full');
  at.now = 11 * HOUR;
  assert.equal(all.open('late'), '', 'an hour later');
  // Through the Worker: the limits object's word, told over the socket.
  const { at: t, e } = limited();
  const l = e.ROOMS.get('limits').limits;
  for (let i = 0; i < ROOMS_PER_MIN; i++) assert.match(await openFrom(e, `192.0.2.${i}`), /^[A-Z]{6}$/);
  assert.deepEqual(await openFrom(e, '192.0.2.200'), { t: 'error', code: 'limit', msg: SAY.busy });
  t.now += MINUTE;
  assert.match(await openFrom(e, '192.0.2.200'), /^[A-Z]{6}$/);
  assert.equal(l.all.keys.get('').length, ROOMS_PER_MIN + 1, 'one object counts everyone');
});

test('joining: a join costs a point, one that finds no room four: ten misses a minute, then nothing more is learned (a live room refused too)', async () => {
  const { at, e } = limited();
  const code = await openFrom(e, '198.51.100.7');
  const join = async (c, ip) => { const ws = (await worker.fetch(upgrade(`room=${c}`, undefined, ip), e)).webSocket; const err = errorOf(ws); ws.close(); return err?.code || 'live'; };
  const guesser = '203.0.113.66', misses = JOIN_POINTS / MISS_COST;
  assert.equal(misses, 10);
  for (let i = 0; i < misses; i++) assert.equal(await join(newCode(() => i * 7 + 3), guesser), 'noroom', `guess ${i + 1}`);
  const objects = e.objects.size;
  assert.equal(await join('QQQQQQ', guesser), 'limit', 'an eleventh guess');
  assert.equal(await join(code, guesser), 'limit', 'the live room too: a guesser past the limit cannot tell a hit from a miss');
  assert.equal(e.objects.size, objects, 'no room\'s object woken');
  for (let i = 0; i < JOIN_POINTS; i++) assert.equal(await join(code, '198.51.100.8'), 'live', `a friend\'s join ${i + 1} (a reconnect is one)`);
  assert.equal(await join(code, '198.51.100.8'), 'limit', 'forty a minute');
  at.now += 60000;
  assert.equal(await join(code, guesser), 'live', 'a minute later');
  assert.equal(await join('BCDF', guesser), 'update', 'a code of the first format: told to update, never counted');
});

test('a limit that cannot be asked (a binding or the limits object failing) lets the request go on', async () => {
  const broken = { limit: async () => { throw new Error('down'); } };
  const e = env({ CREATE_LIMIT: broken, JOIN_LIMIT: broken });
  const limits = e.ROOMS.get('limits'); limits.fetch = async () => { throw new Error('overloaded'); };
  const code = await openFrom(e, '198.51.100.9');
  assert.match(code, /^[A-Z]{6}$/);
  const ws = (await worker.fetch(upgrade(`room=${code}`, undefined, '198.51.100.9'), e)).webSocket;
  say(ws, hello('Bo'));
  assert.equal(got(ws, 'seat')[0]?.seat, 1);
  ws.close();
});

test('the host\'s REMOVE through the Worker: the address the stranger came from (CF-Connecting-IP, its /64) is not let in again', async () => {
  const e = env();
  const a = (await worker.fetch(upgrade('new=1', undefined, '198.51.100.20'), e)).webSocket;
  say(a, hello('Ann'));
  const code = got(a, 'seat')[0].room;
  const x = (await worker.fetch(upgrade(`room=${code}`, undefined, '2001:db8:9:9::1'), e)).webSocket;
  say(x, hello('Eve'));
  assert.equal(got(x, 'seat')[0].seat, 1);
  say(a, { t: 'remove', seat: 1 });
  assert.equal(errorOf(x)?.code, 'removed'); assert.ok(x.closed);
  const x2 = (await worker.fetch(upgrade(`room=${code}`, undefined, '2001:db8:9:9:abcd::2'), e)).webSocket;
  say(x2, hello('Eve'));
  assert.equal(errorOf(x2)?.code, 'removed', 'the same /64');
  const b = (await worker.fetch(upgrade(`room=${code}`, undefined, '198.51.100.21'), e)).webSocket;
  say(b, hello('Bo'));
  assert.equal(got(b, 'seat')[0]?.seat, 1, 'a friend takes the seat');
  for (const c of [a, b]) c.close();
});

test('addresses: an IPv6 address counts by its /64 however written, an IPv4 one (or IPv4-mapped) as is; the counter forgets idle keys', () => {
  assert.equal(addressKey('203.0.113.5'), '203.0.113.5');
  assert.equal(addressKey('::ffff:203.0.113.5'), '203.0.113.5');
  for (const a of ['2001:db8:1:2::1', '2001:0db8:0001:0002:ffff::', '2001:DB8:1:2:3:4:5:6']) assert.equal(addressKey(a), '2001:db8:1:2', a);
  assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0');
  assert.equal(addressKey('::1'), '0:0:0:0');
  assert.equal(addressKey(''), ''); assert.equal(addressKey(undefined), '');
  const at = { now: 0 }, l = new Limiter([{ ms: MINUTE, max: 2 }, { ms: HOUR, max: 3 }], () => at.now);
  assert.ok(l.take('k') && l.take('k')); assert.equal(l.check('k').ms, MINUTE);
  at.now += MINUTE; assert.ok(l.take('k')); assert.equal(l.check('k').ms, HOUR);
  assert.equal(l.check('k', 0), null, 'nothing more asked: nothing broken');
  for (let i = 0; i < 5100; i++) l.take(`a${i}`);
  at.now += 2 * HOUR; l.take('new');
  assert.ok(l.keys.size < 10, `idle keys forgotten (${l.keys.size})`);
});
