// The Cloudflare relay (relay/worker.js) in Node, with fake WebSocket pairs and a fake Durable Object namespace (with
// storage, and eviction): a room opened and joined through the Worker, a game started and its turns ticking, leaving,
// a reconnect replacing a live socket, no such room, a taken code, no free code, an evicted lobby coming back (and an
// evicted game not), oversize messages, and what is not a WebSocket or not from the game's pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { RoomObject } from '../relay/worker.js';
import { PROTO } from '../relay/room.js';

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
/** A fake object's storage. */
const storage = () => { const m = new Map(); return { async get(k) { return m.get(k); }, async put(k, v) { m.set(k, v); } }; };
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
