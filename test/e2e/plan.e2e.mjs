// Play against Claude (src/client/plan.js, claude.js, claude/PROTOCOL.md): a plan link opens the single-player page with
// a line saying so, the address cleaned, and START plays the AI seat on Hard with the plan; `&watch=1` plays the plan
// against the built-in Hard with every seat's sight; a bad code opens the plain menu; and a page that embeds the game
// at a loopback origin gets a check-in, sends a delta that the game applies with its line for the player shown as text,
// and a bad message changes nothing.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, DESKTOP } from './harness.mjs';

before(start);
after(stop);

/** A page of the game at `query`, once it has loaded; its errors collected. */
async function open(query) {
  const ctx = await browserContext(DESKTOP);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl() + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  return { ctx, page, errors };
}

test('a plan link plays the AI seat with the plan on Hard; watch plays it against Hard; a bad code is the plain menu', async () => {
  const g = await open('?plan=1.m20.w14.o5m&seed=7');
  try {
    const { page } = g;
    assert.ok(await page.locator('#menuSolo').isVisible(), 'the single-player page');
    assert.equal(await page.locator('#soloNote').textContent(), "CLAUDE'S PLAN · the AI plays it");
    assert.equal(await page.evaluate(() => location.search), '', 'the plan and its game seed leave the address');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.equal(await page.evaluate(() => endfall.engine.planCode(1)), '1.w14.o5m.m20', 'the AI seat plays the plan');
    assert.equal(await page.evaluate(() => endfall.engine.diffOf(1)), 2, 'on Hard');
    assert.equal(await page.evaluate(() => endfall.engine.planCode(0)), '', 'not ours');
    await page.evaluate(() => endfall.skip(20));
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
  const w = await open('?plan=1.f5m&watch=1');
  try {
    const { page } = w;
    assert.equal(await page.locator('#soloNote').textContent(), "WATCH · Claude's plan vs Hard");
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.equal(await page.evaluate(() => endfall.engine.planCode(0)), '1.f5m', 'the plan on seat 0');
    assert.deepEqual(await page.evaluate(() => [endfall.engine.diffOf(0), endfall.engine.diffOf(1)]), [2, 2], 'two Hard AIs');
    await page.evaluate(() => endfall.skip(180));
    assert.ok(await page.evaluate(() => endfall.G.bldgs.filter(b => b.team === 0).length > 3), 'the plan seat plays');
    assert.deepEqual(w.errors, []);
  } finally { await w.ctx.close(); }
  for (const bad of ['1.w14.w14', '2.w14', '%3Cscript%3E', '1.xattack']) {
    const b = await open(`?plan=${bad}`);
    try {
      assert.ok(await b.page.locator('#menuHome').isVisible(), `${bad}: the first page`);
      assert.equal(await b.page.evaluate(() => location.search), '', `${bad}: the address cleaned`);
      await b.page.locator('#btnSolo').click();
      assert.equal(await b.page.locator('#soloNote').textContent(), '', `${bad}: no plan`);
      assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  }
});

test('an embedding page gets check-ins and steers the plan seat with deltas; a bad message changes nothing', async () => {
  const ctx = await browserContext(DESKTOP);
  // (the host page at the game's own loopback origin, served by the route below: the plugin's page is on loopback too;
  // a host on another port is blocked here by Chromium's local network access checks, a test browser's own limit)
  const host = `${baseUrl()}claude-host.html`;
  const game = `${baseUrl()}?embed=1&plan=1.w14&watch=1&seed=4242`;
  await ctx.route(host, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0">
    <iframe id="f" src="${game}" style="width:1200px;height:700px;border:0"></iframe>
    <script>
      window.got = [];
      const f = document.getElementById('f'), to = new URL(${JSON.stringify(game)}).origin;
      addEventListener('message', (e) => { if (e.source === f.contentWindow && e.origin === to) got.push(e.data); });
      window.send = (m) => f.contentWindow.postMessage(m, to);
      const hi = setInterval(() => { if (got.some(m => m.type === 'ebbfall:ready')) clearInterval(hi); else send({ type: 'ebbfall:hello', v: 1 }); }, 300);
    </script></body>` }));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(host);
    await page.waitForFunction(() => got.some(m => m.type === 'ebbfall:ready'), null, { timeout: 60000 });
    const ready = await page.evaluate(() => got.find(m => m.type === 'ebbfall:ready'));
    assert.deepEqual([ready.plan, ready.seed, ready.mode], ['1.w14', 4242, 'watch']);
    const frame = page.frames().find(f => f !== page.mainFrame());
    await frame.waitForFunction(() => !!window.endfall);
    // A delta before any game: answered ok:false at once, not left to time out.
    const answers = () => page.evaluate(() => got.filter(m => m.type === 'ebbfall:applied'));
    await page.evaluate(() => send({ type: 'ebbfall:delta', v: 1, code: '1.m20' }));
    await page.waitForFunction(() => got.some(m => m.type === 'ebbfall:applied'));
    assert.deepEqual((await answers()).map(a => [a.ok, a.error]), [[false, 'No planned game is running']]);
    await frame.locator('#btnStart').click();
    await page.waitForFunction(() => got.some(m => m.type === 'ebbfall:start'));
    const startMsg = await page.evaluate(() => got.find(m => m.type === 'ebbfall:start'));
    assert.equal(startMsg.seat, 0);
    assert.equal(startMsg.me, null, 'watching');
    assert.equal(startMsg.seed, 4242, 'the link\'s game seed');
    // Two game-minutes: a check-in, with the plan in force and seat 0's own state.
    await frame.evaluate(() => endfall.skip(125));
    await page.waitForFunction(() => got.some(m => m.type === 'ebbfall:checkin'), null, { timeout: 20000 });
    const c = await page.evaluate(() => got.find(m => m.type === 'ebbfall:checkin'));
    assert.equal(c.digest.plan, '1.w14');
    assert.ok(c.digest.you.workers > 0 && c.digest.enemy.in_sight, JSON.stringify(c.digest).slice(0, 300));
    // Messages that are not the protocol's: ignored (nothing applied, nothing answered).
    for (const bad of [{ type: 'ebbfall:delta', v: 2, code: '1.m20' }, { type: 'ebbfall:delta', v: 1, code: '1.m20', extra: true }, 'ebbfall:delta']) {
      await page.evaluate((m) => send(m), bad);
    }
    // Well formed but not a delta code, or a line that is not text: answered ok:false with why, nothing applied.
    for (const bad of [{ type: 'ebbfall:delta', v: 1, code: '1.w14.w14' }, { type: 'ebbfall:delta', v: 1, code: '1.m20', say: 'a\u0000b' }]) {
      await page.evaluate((m) => send(m), bad);
    }
    await page.waitForFunction(() => got.filter(m => m.type === 'ebbfall:applied').length >= 3);
    await page.waitForTimeout(300);
    const refused = (await answers()).slice(1);
    assert.equal(refused.length, 2, 'only the well-formed ones answered');
    assert.ok(refused.every(a => a.ok === false && /delta code|line for the player/.test(a.error)), JSON.stringify(refused));
    assert.equal(await frame.evaluate(() => endfall.engine.planCode(0)), '1.w14', 'nothing changed');
    // A delta: applied at once, answered, and its line shown as text.
    await page.evaluate(() => send({ type: 'ebbfall:delta', v: 1, code: '1.m20.xmass', say: '<b>Massing</b> now.' }));
    await page.waitForFunction(() => got.some(m => m.type === 'ebbfall:applied' && m.ok));
    const a = await page.evaluate(() => got.find(m => m.type === 'ebbfall:applied' && m.ok));
    assert.equal(a.ok, true);
    assert.equal(a.plan, '1.w14.m20');
    assert.equal(await frame.evaluate(() => endfall.engine.planCode(0)), '1.w14.m20');
    assert.equal(await frame.locator('#msg .toast.claude').last().textContent(), 'Claude: <b>Massing</b> now.', 'text, never HTML');
    // A watched game nobody wins ends at 30 game-minutes: the end message says timeout (the game skipped there).
    await frame.evaluate(() => { endfall.engine.disableAi(); });
    for (let i = 0; i < 40 && !(await page.evaluate(() => got.some(m => m.type === 'ebbfall:end'))); i++) {
      await frame.evaluate(() => endfall.skip(Math.max(1, Math.min(120, 1800.5 - endfall.G.time))));
      await page.waitForTimeout(50);
    }
    const end = await page.evaluate(() => got.find(m => m.type === 'ebbfall:end'));
    assert.equal(end?.result, 'timeout', JSON.stringify(end ?? null).slice(0, 200));
    assert.equal(end.summary.result.how, 'unfinished');
    assert.equal(await frame.locator('#result').textContent(), 'TIME');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
