// The docs and the game together, on the built site (dist/: the docs are built with the game): `?first` (the docs'
// "Start the guided first game") starts the guided game and leaves the address; the first page's footer opens the docs;
// the docs' pages fit a phone held either way and a desktop (nothing wider than the screen), work without JavaScript,
// and their links into the game land in it.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const PORTRAIT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

test('?first starts the guided first game (once the game has loaded) and leaves the address', { engines: true, timeout: 120000 }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(`${baseUrl()}?first`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0 && document.getElementById('start').hidden, null, { timeout: 60000, polling: 250 });
      await page.waitForFunction(() => /1\/6/.test(document.getElementById('tut').textContent), null, { timeout: 30000, polling: 250 }); // (polled on a timer: a software-drawn frame may take seconds)
      assert.ok(await page.locator('#tut').isVisible(), 'the checklist');
      assert.equal(await page.evaluate(() => location.search), '', 'the parameter left the address (a reload opens the menu)');
      assert.deepEqual(await page.evaluate(() => [endfall.G.factions, endfall.G.diff]), [['humans', 'humans'], 0], 'the guided game: Humans on Easy');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('?first next to a room\'s link: the room wins, no game starts', { timeout: 60000 }, async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}?room=WGNJ&first=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => endfall.G.units.length), 0, 'no guided game');
    assert.doesNotMatch(await page.evaluate(() => location.search), /first/, 'the parameter left the address all the same');
  } finally { await ctx.close(); }
});

test('the docs fit a phone either way up and a desktop, with no script; the footer opens them, the docs link back into the game', { engines: true, timeout: 120000 }, async () => {
  for (const device of [PORTRAIT, PHONE, DESKTOP]) {
    const ctx = await browserContext({ ...device, javaScriptEnabled: false }), page = await ctx.newPage();
    try {
      for (const path of ['docs/', 'docs/about/', 'docs/how-to-play/', 'docs/races/vael/', 'docs/units/siegeTank/', 'docs/buildings/factory/', 'docs/tech/']) {
        const res = await page.goto(baseUrl() + path);
        assert.equal(res.status(), 200, path);
        assert.ok(await page.locator('main h1').isVisible(), `${path}: its heading`);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(over <= 0, `${device.viewport.width}x${device.viewport.height} ${path}: ${over} px wider than the screen`);
        const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.loading !== 'lazy').map(i => i.src));
        assert.deepEqual(broken, [], `${path}: every image loads`);
      }
    } finally { await ctx.close(); }
  }
  // The game's first page: its footer's links open the docs in a tab of their own; there, "Start the guided first game"
  // lands in the game.
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    const [docs] = await Promise.all([ctx.waitForEvent('page'), page.locator('#docsLink').click()]);
    await docs.waitForLoadState();
    assert.equal(new URL(docs.url()).pathname, '/docs/');
    assert.equal(await docs.locator('main h1').textContent(), 'Play your way');
    await docs.locator('main a[href="/?first"]').first().click();
    await docs.waitForFunction(() => window.endfall && endfall.G.units.length > 0 && document.getElementById('start').hidden, null, { timeout: 60000, polling: 250 });
  } finally { await ctx.close(); }
});
