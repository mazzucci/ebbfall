// Multiplayer end to end in Node: the Node relay, two clients (src/net/net.js) each with its own WASM Game in lockstep.
// Random orders from both with one socket dropped mid-game: both worlds must be the same on every tick they both ran,
// the orders must have changed them, and the relay must see no desync. Then a phone's life: a page suspended for
// longer than the away limit (the other side must not be blamed, the game goes on), the page coming back while a
// reconnect is pending (one socket, nothing closed), and orders given while the socket is down (not lost).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { startRelay } from '../relay/server.mjs';
import { Net } from '../src/net/net.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';

let sim, FACTIONS, UNIT;
async function load() {
  if (sim) return;
  sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  const data = (await import(new URL('data.js', pkg))).default;
  FACTIONS = data.factions; UNIT = data.schema.unit;
}
/** The ids of a client's own units (the room's seed is random: so are the ids). */
function own(c) {
  const U = c.g.units(), n = UNIT.length, id = UNIT.indexOf('id'), team = UNIT.indexOf('team'), out = [];
  for (let o = 0; o < U.length; o += n) if (U[o + team] === c.seat) out.push(U[o + id]);
  return out;
}
const fi = (k) => Math.max(0, Object.keys(FACTIONS).indexOf(k));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const game = (setup, seat) => sim.Game.forSeat(setup.seed, setup.map, setup.side, fi(setup.races[0]), fi(setup.races[1]), seat);

/** A relay, two clients in one room, started. Each client: its Net, its Game, the hash of every tick it ran. */
async function match(relayOpts = {}) {
  await load();
  const relay = startRelay({ port: 0, ...relayOpts }); await relay.ready;
  const url = `ws://localhost:${relay.port}/`, events = [];
  const client = (name, room) => new Promise(res => {
    const c = { g: null, hashes: new Map(), seat: -1, name, paused: false };
    c.net = new Net({
      url, room, name, game: () => c.g,
      on: {
        seat: (m) => { c.seat = m.seat; res(c); },
        start: (setup, seat) => { c.setup = setup; c.g = game(setup, seat); c.g.startLockstep(); c.net.loaded(); },
        away: (s) => events.push(`${name} away ${s}`), back: (s) => events.push(`${name} back ${s}`),
        desync: (t) => events.push(`${name} desync ${t}`), error: (m) => events.push(`${name} error ${m.code}`),
      },
    });
  });
  const a = await client('Ann'), b = await client('Bo', a.net.room);
  b.net.race('vael'); await wait(100);
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
