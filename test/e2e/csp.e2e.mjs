// The site's Content-Security-Policy (site/cache.js CSP) against real journeys: the harness serves every file with the
// site's headers (harness.mjs TEST_CSP), and these walk the menu, the service worker and a reload under it, a
// single-player game for a few minutes of game time with the help sheet, a room opened on the relay, the bench's report
// to it, the challenge's embedded plan link, the device check and the voice lab, and every docs page with the home's
// trailer played and How to play's loop playing. Every violation the browser reports (a securitypolicyviolation event
// in any frame, or the console's CSP message) is collected, and there must be none: the policy is enforced, so a
// violation is something of the site the browser refused (the rest of the suite runs under it too: a refused file or
// script also breaks its scenario).
// Each surface is a test of its own, in a context of its own, the service worker installed first where the engine has
// one (as a visitor's pages are served), so a failure names its surface and a stuck page in one cannot spend the
// others' time. (All of them as one sweep timed out at 600 s in WebKit on CI about one run in five, always on the
// first docs page, whose load never settled, after the game, the bench and a live embedded game had run in the same
// browser; the docs alone, many times over in WebKit on CI, settled within a second each time.)
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, anyHere, board, DESKTOP, ENGINE, playByHand } from './harness.mjs';
import { startRelay } from '../../relay/server.mjs';

let relay;
before(async () => { await start(); if (!(await anyHere())) return; relay = startRelay({ port: 0 }); await relay.ready; }); // (none of its tests in this shard: no relay)
after(async () => { await relay?.close(); await stop(); });

const PAGES = ['docs/', 'docs/how-to-play/', 'docs/kingdom/', 'docs/expedition/', 'docs/about/', 'docs/feedback/'];
const relayQ = () => `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;

/** Where a journey is, on stderr (a timeout in a slow engine then says which step). */
const step = (what) => process.stderr.write(`csp e2e (${ENGINE}): ${what}\n`);
const report = (seen) => seen.map(v => JSON.stringify(v)).join('\n');

/**
 * A journey in a context that collects every CSP violation of its pages, their frames and their workers' console, and
 * every page error: `fn(ctx)` runs, then there must be none of either. A failure says what was still loading (a page
 * whose load never settles names the request that holds it) and the violations so far. The context is closed after,
 * the close bounded: a page stuck in the engine must not hang the file past its failure.
 */
async function journey(fn, device = DESKTOP) {
  const ctx = await browserContext(device), seen = [], errors = [], open = new Map();
  await ctx.exposeBinding('cspViolation', ({ frame }, v) => seen.push({ ...v, page: frame.url() }));
  await ctx.addInitScript(() => addEventListener('securitypolicyviolation', (e) => window.cspViolation?.({ directive: e.violatedDirective, blocked: e.blockedURI, source: `${e.sourceFile}:${e.lineNumber}`, sample: e.sample })));
  const csp = /Content.Security.Policy|Refused to/i;
  ctx.on('console', (m) => { if (csp.test(m.text())) seen.push({ console: m.text(), page: m.location()?.url }); });
  ctx.on('page', (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('worker', (w) => w.on('console', (m) => { if (csp.test(m.text())) seen.push({ console: m.text(), worker: w.url() }); }));
  });
  ctx.on('request', (r) => open.set(r, Date.now()));
  ctx.on('requestfinished', (r) => open.delete(r));
  ctx.on('requestfailed', (r) => open.delete(r));
  const inflight = () => [...open].map(([r, t]) => `${r.url().replace(baseUrl(), '/')} (${r.resourceType()}, ${Date.now() - t} ms)`).join(', ') || 'nothing';
  try {
    await fn(ctx);
    assert.deepEqual(errors, [], 'no page errors');
    assert.equal(seen.length, 0, `CSP violations:\n${report(seen)}`);
  } catch (e) {
    e.message += `\nstill loading: ${inflight()}`;
    if (seen.length && !e.message.includes('CSP violations:')) e.message += `\nCSP violations so far:\n${report(seen)}`;
    throw e;
  } finally {
    const closed = await Promise.race([ctx.close().then(() => true), new Promise(r => setTimeout(() => r(false), 30000))]);
    if (!closed) step('its context did not close within 30 s');
  }
}

/** A page of `ctx` on the menu, the service worker installed and the page reloaded under it, where the engine gives
 *  one (WebKit in CI's container may not: then the journey without it); `sw`: whether it did. */
async function underWorker(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  const sw = await p.evaluate(() => Promise.race([navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false, new Promise(r => setTimeout(() => r(false), 60000))]));
  if (sw || ENGINE === 'chromium') {
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  }
  return { p, sw };
}

test('the CSP: no violation on the menu, the service worker installed and the page reloaded under it', { engines: true, timeout: 180000 }, () => journey(async (ctx) => {
  step('menu and service worker');
  const { p, sw } = await underWorker(ctx);
  if (sw || ENGINE === 'chromium') assert.ok(await p.evaluate(() => !!navigator.serviceWorker?.controller), 'the page under the service worker');
}));

test('the CSP: no violation in a single-player game of a few minutes, the help sheet opened and closed', { engines: true, timeout: 180000 }, () => journey(async (ctx) => {
  const { p } = await underWorker(ctx);
  step('single-player game');
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
}));

test('the CSP: no violation opening a room on the relay', { engines: true, timeout: 180000 }, () => journey(async (ctx) => {
  const { p } = await underWorker(ctx);
  step('room on the relay');
  // MULTIPLAYER, a name, NEW ROOM, its code shown.
  await p.goto(`${baseUrl()}?${relayQ()}`, { waitUntil: 'networkidle' });
  await p.locator('#btnOnline').click();
  await p.locator('#onlineName').fill('Ann');
  await p.locator('#btnNewRoom').click();
  await p.waitForFunction(() => /^[A-Z]{3}-[A-Z]{3}$/.test(document.getElementById('roomShow').textContent), null, { timeout: 30000 });
}));

test('the CSP: no violation in the bench, its report posted to the relay', { engines: true, timeout: 360000 }, () => journey(async (ctx) => {
  const { p } = await underWorker(ctx);
  step('bench');
  // A short run, its report posted to the relay.
  await p.goto(`${baseUrl()}?bench&secs=3&at=0&${relayQ()}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.body.dataset.bench === 'ready', null, { timeout: 60000 });
  await p.locator('#benchGo').click();
  await p.waitForFunction(() => ['sent', 'failed', 'unsent'].includes(document.body.dataset.bench), null, { timeout: 200000 });
  assert.equal(await p.evaluate(() => document.body.dataset.bench), 'sent', 'the report reached the relay');
}));

test('the CSP: no violation in the challenge\'s plan link, embedded as its page embeds it', { engines: true, timeout: 180000 }, () => journey(async (ctx) => {
  // A same-origin frame (claude/challenge/page), in a context with no service worker to answer for the host page the
  // route serves; the host says hello until the game is ready.
  step('challenge embed');
  const host = `${baseUrl()}csp-host.html`, game = `${baseUrl()}?embed=1&plan=1.w14&watch=1&seed=4242`;
  await ctx.route(host, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><iframe id="f" src="${game}" style="width:1200px;height:700px;border:0"></iframe>
    <script>window.got = []; const f = document.getElementById('f'), to = location.origin;
    addEventListener('message', (e) => { if (e.source === f.contentWindow) got.push(e.data); });
    const hi = setInterval(() => { if (got.some(m => m.type === 'ebbfall:ready')) clearInterval(hi); else f.contentWindow.postMessage({ type: 'ebbfall:hello', v: 1 }, to); }, 300);</script>` }));
  const e = await ctx.newPage();
  await e.goto(host);
  await e.waitForFunction(() => got.some(m => m.type === 'ebbfall:ready'), null, { timeout: 60000 });
  const frame = e.frames().find(f => f !== e.mainFrame());
  await frame.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  await frame.locator('#btnStart').click();
  await e.waitForFunction(() => got.some(m => m.type === 'ebbfall:start'), null, { timeout: 60000 });
  await frame.evaluate(() => endfall.skip(125));
  await e.waitForFunction(() => got.some(m => m.type === 'ebbfall:checkin'), null, { timeout: 20000 });
  await e.waitForTimeout(500);
}));

test('the CSP: no violation on the device check and the voice lab', { engines: true, timeout: 240000 }, () => journey(async (ctx) => {
  const { p } = await underWorker(ctx);
  step('device check');
  await p.goto(`${baseUrl()}selftest.html`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => ['ok', 'bad'].includes(document.getElementById('verdict').className), null, { timeout: 120000 });
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(13, 17, 23)', 'the device check: its stylesheet');
  step('voice lab');
  await p.goto(`${baseUrl()}voice-lab.html`, { waitUntil: 'networkidle' });
}));

test('the CSP: no violation on every docs page, the home\'s trailer playing', { engines: true, timeout: 240000 }, () => journey(async (ctx) => {
  const { p } = await underWorker(ctx);
  for (const path of PAGES) {
    step(`docs: ${path}`);
    await p.goto(baseUrl() + path, { waitUntil: 'networkidle' });
    assert.equal(await p.evaluate(() => getComputedStyle(document.body).overflowX), 'hidden', `${path}: its stylesheet`);
  }
  // On the home, the trailer scrolled into view and played by hand (the browser's controls); How to play's loop playing
  // by itself.
  step('docs: the trailer');
  await p.goto(baseUrl() + 'docs/', { waitUntil: 'networkidle' });
  await p.locator('#trailer video').scrollIntoViewIfNeeded();
  await playByHand(p, '#trailer video');
  await p.waitForFunction(() => document.querySelector('#trailer video').readyState >= 2, null, { timeout: 30000 });
  step('docs: a controls loop');
  await p.goto(baseUrl() + 'docs/how-to-play/', { waitUntil: 'networkidle' });
  await p.locator('.clip video').first().scrollIntoViewIfNeeded();
  await p.waitForFunction(() => { const v = document.querySelector('.clip video'); return v.readyState >= 2 && !v.controls; }, null, { timeout: 30000 });
}));
