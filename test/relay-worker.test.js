// The Cloudflare relay (relay/worker.js) in Node, with fake WebSocket pairs and a fake Durable Object namespace: a room
// opened and joined through the Worker, a game started and its turns ticking, leaving, no such room, a taken code,
// oversize messages, and what is not a WebSocket or not from the game's pages.
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
/** A fake namespace: one RoomObject per name, made on first use. */
function env(extra = {}) {
  const objects = new Map();
  return {
    objects, ...extra,
    ROOMS: { idFromName: (n) => n, get: (n) => { if (!objects.has(n)) objects.set(n, new RoomObject(null, null, platform)); return objects.get(n); } },
  };
}
const upgrade = (query, origin = 'https://ebbfall.com') => new Request(`https://relay.ebbfall.com/?${query}`, { headers: { Upgrade: 'websocket', Origin: origin } });
const say = (ws, msg) => ws.send(JSON.stringify(msg));
const got = (ws, t) => ws.got.filter(m => m.t === t);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
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
  const o = new RoomObject(null, null, platform);
  const first = await o.fetch(new Request('https://room/?code=BCDF&new=1'));
  assert.equal(first.status, 101);
  assert.equal((await o.fetch(new Request('https://room/?code=BCDF&new=1'))).status, 409, 'someone is in it');
  first.webSocket.close();
  assert.equal((await o.fetch(new Request('https://room/?code=BCDF&new=1'))).status, 409, 'just left: kept a while for a rejoin');
  o.lastUsed = Date.now() - 11 * 60 * 1000;
  assert.equal((await o.fetch(new Request('https://room/?code=BCDF&new=1'))).status, 101, 'idle: a new room');
  for (const c of o.conns) c.close();
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
