// Multiplayer end to end in Node: the Node relay, two clients (src/net/net.js) each with its own WASM Game in lockstep,
// random orders from both, one client's socket dropped mid-game (it reconnects and resumes). Both worlds must be the
// same on every tick they both ran, and the relay must see no desync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { startRelay } from '../relay/server.mjs';
import { Net } from '../src/net/net.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');

test('two clients play through the relay, one drops and comes back, and their worlds stay the same', { skip: !built && 'WASM not built', timeout: 60000 }, async () => {
  const sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  const FACTIONS = (await import(new URL('data.js', pkg))).default.factions;
  const fi = (k) => Math.max(0, Object.keys(FACTIONS).indexOf(k));
  const relay = startRelay({ port: 0, latency: 30, jitter: 40 }); await relay.ready;
  const url = `ws://localhost:${relay.port}/`;
  const desyncs = [];
  /** A client: its Net, its Game once the game starts, and the hash of every tick it ran. */
  const client = (name, room) => new Promise(res => {
    const c = { g: null, hashes: new Map(), seat: -1 };
    c.net = new Net({
      url, room, name, game: () => c.g,
      on: {
        seat: (m) => { c.seat = m.seat; res(c); },
        start: (setup, seat) => {
          c.g = sim.Game.forSeat(setup.seed, setup.map, setup.side, fi(setup.races[0]), fi(setup.races[1]), seat);
          c.g.startLockstep(); c.net.loaded();
        },
        desync: (t) => desyncs.push(t),
      },
    });
  });
  try {
    const a = await client('Ann');
    const b = await client('Bo', a.net.room);
    b.net.race('vael');
    await new Promise(r => setTimeout(r, 100));
    a.net.ready(); b.net.ready();
    let seed = 9; const rand = (n) => (seed = (seed * 1103515245 + 12345) >>> 0) % n;
    let dropped = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      for (const c of [a, b]) {
        if (!c.g) continue;
        const waiting = c.net.pump();
        for (let i = 0; i < Math.min(30, waiting) && c.g.canStep(); i++) {
          c.g.step(); c.net.ticked();
          c.hashes.set(c.g.tick(), c.g.stateHash());
        }
        if (rand(4) === 0) {
          // A move for a random id (only the seat's own units obey: the sim checks).
          c.g.moveTo(1 + rand(60), 200 + rand(1600), 200 + rand(1600));
        }
      }
      if (!dropped && Date.now() - t0 > 3000) { dropped = true; b.net.ws.close(); } // (b's socket dies mid-game)
      await new Promise(r => setTimeout(r, 15));
    }
    assert.ok(a.g && b.g, 'both games started');
    const common = [...a.hashes.keys()].filter(t => b.hashes.has(t));
    assert.ok(common.length > 150, `both ran the game (${a.g.tick()} / ${b.g.tick()} ticks)`);
    for (const t of common) assert.equal(a.hashes.get(t), b.hashes.get(t), `the same world at tick ${t}`);
    assert.deepEqual(desyncs, [], 'the relay saw no desync');
    assert.ok(dropped && b.g.tick() > 3 * 45, 'b came back and went on after its socket died');
  } finally { await relay.close(); }
});
