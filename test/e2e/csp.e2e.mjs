// The site's Content-Security-Policy (site/cache.js CSP) against a real journey: the harness serves every file with the
// site's headers (harness.mjs TEST_CSP), and this walks the menu, the service worker and a reload under it, a
// single-player game for a few minutes of game time with the help sheet, a room opened on the relay, the bench's report
// to it, the challenge's embedded plan link, the device check and the voice lab, and every docs page with the home's
// clip playing. Every violation the browser reports (a securitypolicyviolation event in any frame, or the console's
// CSP message) is collected, and there must be none: while the header is report-only nothing is blocked, so this is
// what says the policy can be enforced.
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, anyHere, board, DESKTOP } from './harness.mjs';
import { startRelay } from '../../relay/server.mjs';

let relay;
before(async () => { await start(); if (!(await anyHere())) return; relay = startRelay({ port: 0 }); await relay.ready; }); // (none of its tests in this shard: no relay)
after(async () => { await relay?.close(); await stop(); });

const PAGES = ['docs/', 'docs/how-to-play/', 'docs/kingdom/', 'docs/expedition/', 'docs/about/'];

/** A context that collects every CSP violation of its pages, their frames and their workers' console. */
async function watched(device = DESKTOP) {
  const ctx = await browserContext(device), seen = [];
  await ctx.exposeBinding('cspViolation', ({ frame }, v) => seen.push({ ...v, page: frame.url() }));
  await ctx.addInitScript(() => addEventListener('securitypolicyviolation', (e) => window.cspViolation?.({ directive: e.violatedDirective, blocked: e.blockedURI, source: `${e.sourceFile}:${e.lineNumber}`, sample: e.sample })));
  const csp = /Content.Security.Policy|Refused to/i;
  ctx.on('console', (m) => { if (csp.test(m.text())) seen.push({ console: m.text(), page: m.location()?.url }); });
  ctx.on('page', (p) => p.on('worker', (w) => w.on('console', (m) => { if (csp.test(m.text())) seen.push({ console: m.text(), worker: w.url() }); })));
  return { ctx, seen };
}

const report = (seen) => seen.map(v => JSON.stringify(v)).join('\n');

test('the CSP: no violation across the menu, the service worker, a game, the help sheet, a room, the bench, the plan link, the docs and the clip', { engines: true, timeout: 600000 }, async () => {
  const { ctx, seen } = await watched(), embed = await watched();
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  try {
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));

    // The menu, and the service worker installed; then a reload, the page now served through it.
    await p.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await p.evaluate(() => navigator.serviceWorker?.ready);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    assert.ok(await p.evaluate(() => !!navigator.serviceWorker?.controller), 'the page under the service worker');

    // A single-player game: a few minutes of it, drawn, and the help sheet opened and closed.
    await p.locator('#btnSolo').click();
    await board(p).diff(1, 1);
    await p.locator('#btnStart').click();
    await p.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { timeout: 60000 });
    for (let i = 0; i < 6; i++) { await p.evaluate(() => endfall.skip(30)); await p.waitForTimeout(500); }
    await p.locator('#btnHelp').click();
    await p.locator('#helpSheet').waitFor({ state: 'visible' });
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    assert.ok(await p.evaluate(() => endfall.G.tick) >= 180 * 30, 'three minutes played');

    // A room on the relay: MULTIPLAYER, a name, NEW ROOM, its code shown.
    await p.goto(`${baseUrl()}?${relayQ}`, { waitUntil: 'networkidle' });
    await p.locator('#btnOnline').click();
    await p.locator('#onlineName').fill('Ann');
    await p.locator('#btnNewRoom').click();
    await p.waitForFunction(() => /^[A-Z]{3}-[A-Z]{3}$/.test(document.getElementById('roomShow').textContent), null, { timeout: 30000 });

    // The bench: a short run, its report posted to the relay.
    await p.goto(`${baseUrl()}?bench&secs=3&at=0&${relayQ}`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.body.dataset.bench === 'ready', null, { timeout: 60000 });
    await p.locator('#benchGo').click();
    await p.waitForFunction(() => ['sent', 'failed', 'unsent'].includes(document.body.dataset.bench), null, { timeout: 200000 });
    assert.equal(await p.evaluate(() => document.body.dataset.bench), 'sent', 'the report reached the relay');

    // The challenge's link, embedded as its page embeds it (a same-origin frame: claude/challenge/page; its own context,
    // where no service worker answers for the host page the route serves; the host says hello until the game is ready).
    const host = `${baseUrl()}csp-host.html`, game = `${baseUrl()}?embed=1&plan=1.w14&watch=1&seed=4242`;
    await embed.ctx.route(host, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><iframe id="f" src="${game}" style="width:1200px;height:700px;border:0"></iframe>
      <script>window.got = []; const f = document.getElementById('f'), to = location.origin;
      addEventListener('message', (e) => { if (e.source === f.contentWindow) got.push(e.data); });
      const hi = setInterval(() => { if (got.some(m => m.type === 'ebbfall:ready')) clearInterval(hi); else f.contentWindow.postMessage({ type: 'ebbfall:hello', v: 1 }, to); }, 300);</script>` }));
    const e = await embed.ctx.newPage();
    e.on('pageerror', x => errors.push(x.message));
    await e.goto(host);
    await e.waitForFunction(() => got.some(m => m.type === 'ebbfall:ready'), null, { timeout: 60000 });
    const frame = e.frames().find(f => f !== e.mainFrame());
    await frame.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await frame.locator('#btnStart').click();
    await e.waitForFunction(() => got.some(m => m.type === 'ebbfall:start'), null, { timeout: 60000 });
    await frame.evaluate(() => endfall.skip(125));
    await e.waitForFunction(() => got.some(m => m.type === 'ebbfall:checkin'), null, { timeout: 20000 });
    await e.waitForTimeout(500);

    // The device check and the voice lab: pages of the site too.
    await p.goto(`${baseUrl()}selftest.html`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => ['ok', 'bad'].includes(document.getElementById('verdict').className), null, { timeout: 120000 });
    assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(13, 17, 23)', 'the device check: its stylesheet');
    await p.goto(`${baseUrl()}voice-lab.html`, { waitUntil: 'networkidle' });

    // Every docs page; on the home, the clip scrolled into view and playing.
    for (const path of PAGES) {
      await p.goto(baseUrl() + path, { waitUntil: 'networkidle' });
      assert.equal(await p.evaluate(() => getComputedStyle(document.body).overflowX), 'hidden', `${path}: its stylesheet`);
    }
    await p.goto(baseUrl() + 'docs/', { waitUntil: 'networkidle' });
    await p.locator('.clip video').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => { const v = document.querySelector('.clip video'); return v.readyState >= 2 && !v.controls; }, null, { timeout: 30000 });

    assert.deepEqual(errors, [], 'no page errors');
    const all = [...seen, ...embed.seen];
    assert.equal(all.length, 0, `CSP violations:\n${report(all)}`);
  } catch (e) {
    if (seen.length + embed.seen.length) e.message += `\nCSP violations so far:\n${report([...seen, ...embed.seen])}`;
    throw e;
  } finally {
    await ctx.close(); await embed.ctx.close();
  }
});
