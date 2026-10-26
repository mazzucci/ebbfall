// Play a friend, end to end in two browsers: a local relay (relay/server.mjs, with latency and jitter), one player
// opens a room from the menu, the other joins by the shared link, both ready up, and the game runs in lockstep in both.
// One gives orders; both worlds must be the same on every tick they both ran (the network layer's hash trail), and
// leaving concedes: the other side wins.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';
import { startRelay } from '../../relay/server.mjs';

let relay;
before(async () => { await start(); relay = startRelay({ port: 0, latency: 40, jitter: 60 }); await relay.ready; });
after(async () => { await relay.close(); await stop(); });

async function page(device, query) {
  const ctx = await browserContext(device), p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${baseUrl()}?${query}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  const tap = (sel) => device.hasTouch ? p.locator(sel).tap() : p.locator(sel).click();
  if (device.hasTouch && await p.locator('#btnPlay').isVisible()) await tap('#btnPlay');
  return { ctx, p, errors, tap };
}

test('two players: open a room, join by its link, ready, play in lockstep, and leaving concedes', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(DESKTOP, relayQ);
  try {
    assert.ok(await a.p.locator('#btnOnline').isVisible(), 'PLAY A FRIEND on the menu when a relay is known');
    await a.tap('#btnOnline');
    await a.p.locator('#onlineName').fill('Ann');
    await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    // The friend opens the shared link on a phone: straight into the room.
    const b = await page(PHONE, `${relayQ}&join=${code}`);
    try {
      await a.p.waitForFunction(() => document.querySelectorAll('#seatList .seat').length === 2 && !/away/.test(document.getElementById('seatList').textContent));
      await b.tap('#onlineRace [data-race="vael"]');
      await a.p.waitForFunction(() => /VAEL/.test(document.getElementById('seatList').textContent));
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 30, null, { timeout: 20000 });
      assert.deepEqual(await a.p.evaluate(() => endfall.G.factions), ['humans', 'vael']);
      assert.deepEqual(await b.p.evaluate(() => [endfall.G.me, endfall.G.factions]), [1, ['humans', 'vael']], 'the friend plays the second seat');
      // Ann sends a harvester off (set-up through the engine: the lobby and the lockstep are what is tested).
      const id = await a.p.evaluate(() => { const h = endfall.G.units.find(u => u.team === endfall.G.me && u.d.worker); endfall.engine.moveTo(h, h.x + 300, h.y + 200); return h.id; });
      const at = (x) => x.p.evaluate((id) => { const u = endfall.G.units.find(u => u.id === id); return [Math.round(u.x), Math.round(u.y)]; }, id);
      const before = await at(b);
      await a.p.waitForTimeout(4000);
      const trail = (x) => x.p.evaluate(() => [...endfall.online.net.trail]);
      const [ta, tb] = [new Map(await trail(a)), new Map(await trail(b))];
      const common = [...ta.keys()].filter(t => tb.has(t));
      assert.ok(common.length > 60, `both ran the same stretch (${common.length} ticks in common)`);
      for (const t of common) assert.equal(ta.get(t), tb.get(t), `the same world at tick ${t}`);
      assert.notDeepEqual(await at(b), before, "Ann's order ran in the friend's game too");
      // The friend stalls (no acks): Ann's screen says who it waits for. Ann drops offline meanwhile, the friend comes
      // back unseen, Ann reconnects: the line must not stay up.
      await b.p.evaluate(() => { endfall.online.net.ackIfDue = () => {}; });
      await a.p.waitForFunction(() => /Waiting for/.test(document.getElementById('netWait').textContent) && !document.getElementById('netWait').hidden, null, { timeout: 10000 });
      await a.p.evaluate(() => { const n = endfall.online.net; n._open = n.open; n.open = () => {}; n.ws.close(); });
      await a.p.waitForTimeout(500);
      await b.p.evaluate(() => { delete endfall.online.net.ackIfDue; });
      await b.p.waitForTimeout(1500);
      await a.p.evaluate(() => { const n = endfall.online.net; n.open = n._open; n.open(); });
      await a.p.waitForFunction(() => document.getElementById('netWait').hidden, null, { timeout: 8000 });
      // Ann leaves: a concede; the friend wins. Ann is told nothing about her own leaving.
      await a.p.evaluate(() => { document.getElementById('btnPause').click(); });
      const toasts = new Set();
      await a.p.exposeFunction('sawToast', (t) => toasts.add(t));
      await a.p.evaluate(() => new MutationObserver(() => { for (const t of document.querySelectorAll('#msg .toast')) window.sawToast(t.textContent); }).observe(document.getElementById('msg'), { childList: true }));
      await a.tap('#btnQuit');
      await b.p.locator('#end').waitFor({ state: 'visible', timeout: 15000 });
      const card = await b.p.evaluate(() => [document.getElementById('result').textContent, document.getElementById('btnWatch').hidden, document.getElementById('btnRematch').hidden]);
      // Straight into a new room from the end card (quickly: within the old game's clean-up delay), which must not
      // close the new room.
      await b.p.evaluate(() => { for (const id of ['btnAgain', 'btnOnline', 'btnNewRoom']) document.getElementById(id).click(); });
      assert.deepEqual(card, ['VICTORY', true, true], 'the friend wins; no watch or rematch online (yet)');
      await b.p.waitForFunction((old) => { const c = document.getElementById('roomShow').textContent; return /^[A-Z]{4}$/.test(c) && c !== old; }, code);
      const code2 = await b.p.locator('#roomShow').textContent();
      assert.notEqual(code2, code);
      await b.p.waitForTimeout(2500);
      assert.ok(await b.p.evaluate(() => !!endfall.online.net && !endfall.online.net.closed), 'the new room is still open');
      assert.ok(await a.p.locator('#start').isVisible(), 'Ann is back on the menu');
      assert.deepEqual([...toasts].filter(t => /left/.test(t)), [], 'no news of her own leaving');
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});
