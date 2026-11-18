// The docs microsite (tools/docs) and the game's ways into it: the first page's footer line (How to play · About, in a
// new tab; the old buttons gone), the in-game ? and its help sheet (the game keeps running; Esc and the close button;
// the pause card's HOW TO PLAY), and every docs page with JavaScript off, listing every unit and building from the
// data, at phone width without a sideways scroll, its tabs and buttons a finger's size, its bar slim in landscape.
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const PORTRAIT = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const PAGES = ['docs/', 'docs/how-to-play/', 'docs/kingdom/', 'docs/expedition/', 'docs/about/'];

for (const [name, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE], ['a portrait phone', PORTRAIT]]) {
  test(`the first page on ${name}: How to play and About in its footer line, opening the docs in a new tab; no ABOUT or HOW TO PLAY button`, { engines: true }, async () => {
    const ctx = await browserContext(device), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      assert.equal(await page.locator('#btnHowTo, #btnAbout, #menuAbout, #help').count(), 0, 'the old buttons and pages are gone');
      for (const [id, href, text] of [['#linkHowTo', './docs/how-to-play/', 'How to play'], ['#linkAbout', './docs/about/', 'About']]) {
        const a = page.locator(id);
        assert.ok(await a.isVisible(), `${text} shown`);
        assert.equal(await a.textContent(), text);
        assert.equal(await a.getAttribute('href'), href);
        assert.equal(await a.getAttribute('target'), '_blank', 'a new tab: an installed app keeps the game');
        assert.match(await a.getAttribute('rel'), /noopener/);
        const b = await a.boundingBox();
        assert.ok(b.y + b.height <= device.viewport.height && b.x >= 0 && b.x + b.width <= device.viewport.width, `${text} on screen: ${JSON.stringify(b)}`);
      }
      // Under the row of buttons, above the build stamp.
      const [row, links, stamp] = await Promise.all(['#btnOptions', '#menuLinks', '#buildStamp'].map(s => page.locator(s).boundingBox()));
      assert.ok(links.y >= row.y + row.height - 1 && (stamp.y >= links.y + links.height - 1 || (stamp.x >= links.x + links.width - 1 && Math.abs(stamp.y + stamp.height / 2 - links.y - links.height / 2) < 4)), 'under the buttons, the stamp after it (beside it on a short phone on its side)');
      assert.match(await page.locator('#buildStamp').getAttribute('data-build'), /^[0-9a-f]{12}$/, 'the version, on the stamp');
      const [popup] = await Promise.all([ctx.waitForEvent('page'), device.hasTouch ? page.locator('#linkHowTo').tap() : page.locator('#linkHowTo').click()]);
      await popup.waitForLoadState();
      assert.match(popup.url(), /\/docs\/how-to-play\/$/);
      assert.equal(await popup.locator('h1').textContent(), 'How to play');
      assert.ok(await page.locator('#menuHome').isVisible(), 'the game stays where it was');
    } finally { await ctx.close(); }
  });
}

for (const [name, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE]]) {
  test(`the ? in the top bar on ${name}: the help sheet in the stage's corner, the game running on; closed by Esc, its button or the ?; the pause card's HOW TO PLAY opens it`, { engines: true }, async () => {
    const d = await newGame(device);
    const press = (sel) => (d.touch ? d.page.locator(sel).tap() : d.page.locator(sel).click());
    try {
      const help = d.page.locator('#btnHelp');
      assert.ok(await help.isVisible(), 'the ?');
      const [clock, q, full] = await Promise.all(['#resClock', '#btnHelp', '#btnFull'].map(s => d.page.locator(s).boundingBox()));
      assert.ok(q.x >= clock.x + clock.width && (!full || q.x + q.width <= full.x), 'between the clock and FULL SCREEN');
      assert.equal(Math.round(q.width), 32, 'a 32 px button');
      await press('#btnHelp');
      const sheet = d.page.locator('#helpSheet');
      assert.ok(await sheet.isVisible(), 'the sheet opens');
      assert.equal(await help.getAttribute('aria-expanded'), 'true');
      const [s, stage] = await Promise.all([sheet.boundingBox(), d.page.locator('#stage').boundingBox()]);
      assert.ok(s.x + s.width <= stage.x + stage.width + 1 && s.y >= stage.y - 1 && s.y + s.height <= stage.y + stage.height + 1, 'inside the stage');
      assert.ok(s.x + s.width > stage.x + stage.width - 20 && s.y < stage.y + 20, "in its top-right corner");
      const lines = await sheet.locator(d.touch ? '.lines.touch li' : '.lines.desk li').evaluateAll(ls => ls.filter(l => l.offsetParent).length);
      assert.equal(lines, 4, 'the controls in four lines, for this pointer');
      assert.match(await d.page.locator('#helpGoal').textContent(), /^Mine gold, raise Cottages for population/);
      assert.equal(await d.page.locator('#helpRun').textContent(), 'The game keeps running.');
      assert.equal(await sheet.evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(18, 26, 37)', 'opaque');
      const guide = d.page.locator('#helpGuide');
      assert.equal(await guide.getAttribute('href'), './docs/how-to-play/');
      assert.equal(await guide.getAttribute('target'), '_blank');
      // The game runs on under it.
      const t0 = await d.eval(() => endfall.G.tick);
      await d.page.waitForFunction((t) => endfall.G.tick > t + 15, t0, { timeout: 15000 });
      assert.ok(await d.page.locator('#pause').isHidden(), 'not paused');
      if (!d.touch) {
        await d.page.keyboard.press('Escape');
        assert.ok(await sheet.isHidden(), 'Esc closes it');
        await press('#btnHelp');
      }
      await press('#btnHelpClose');
      assert.ok(await sheet.isHidden(), 'its close button');
      assert.equal(await help.getAttribute('aria-expanded'), 'false');
      await press('#btnHelp'); await press('#btnHelp');
      assert.ok(await sheet.isHidden(), 'the ? again closes it');
      // From the pause card: the same sheet, over it; closed, the pause card again.
      await press('#btnPause'); await press('#btnPauseHelp');
      assert.ok(await sheet.isVisible() && await d.page.locator('#pause').isVisible(), 'over the pause card');
      assert.equal(await d.page.locator('#helpRun').textContent(), 'The game is paused.', 'it says the game is paused');
      assert.ok(+(await d.page.locator('#pause .card').evaluate(e => getComputedStyle(e).opacity)) < 0.5, 'the pause card dimmed under it');
      await press('#btnHelpClose');
      assert.ok(await sheet.isHidden() && await d.page.locator('#pause').isVisible(), 'back to the pause card');
      await press('#btnResume');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

test('every docs page with JavaScript off: whole, every unit and building of the data listed, at 360 px with no sideways scroll, finger-sized tabs and buttons, a slim bar in landscape', { engines: true }, async () => {
  const ctx = await browserContext({ ...PORTRAIT, javaScriptEnabled: false }), page = await ctx.newPage();
  const land = await browserContext({ ...PHONE, javaScriptEnabled: false }), lp = await land.newPage();
  try {
    for (const path of PAGES) {
      const res = await page.goto(baseUrl() + path, { waitUntil: 'load' });
      assert.equal(res.status(), 200, path);
      assert.equal(await page.locator('h1').count(), 1, `${path}: its heading`);
      assert.ok((await page.locator('main').textContent()).length > 400, `${path}: its text, without scripts`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}: no sideways scroll at 360`);
      assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main .lede')).fontSize) >= 16 && [...document.querySelectorAll('main > p:not([class]), main > ul:not([class]) > li')].every(e => parseFloat(getComputedStyle(e).fontSize) >= 16)), `${path}: body text 16 px or more`);
      // The top bar: its tabs scroll inside it, never off the page; tabs, PLAY and the footer's links a finger's size.
      const bar = await page.locator('.top').boundingBox();
      assert.ok(bar.width <= 360 && bar.height <= 97, `${path}: the bar fits (an upright phone: the tabs on a row of their own): ${JSON.stringify(bar)}`);
      // Every tab whole inside the bar: none cut off mid-word.
      const cut = await page.locator('.tabs a').evaluateAll(as => { const n = as[0].parentElement.getBoundingClientRect(); return as.filter(a => { const r = a.getBoundingClientRect(); return r.left < n.left - 1 || r.right > n.right + 1 || a.scrollWidth > a.clientWidth + 1; }).map(a => a.innerText); });
      assert.deepEqual(cut, [], `${path}: every tab whole`);
      for (const sel of ['.tabs a', '.top .play', 'footer a']) {
        const small = await page.locator(sel).evaluateAll(as => as.map(a => a.getBoundingClientRect()).filter(r => r.height < 40 || r.width < 44).length);
        assert.equal(small, 0, `${path}: ${sel} big enough to tap`);
      }
      await lp.goto(baseUrl() + path, { waitUntil: 'load' });
      assert.ok((await lp.locator('.top').boundingBox()).height <= 49, `${path}: the bar at most 48 px in landscape`);
    }
    // What each page must list, from the game's own tables (the built game, as the browser tests have no sim of their own).
    const game = await browserContext(DESKTOP), gp = await game.newPage();
    await gp.goto(baseUrl(), { waitUntil: 'networkidle' }); await gp.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const ROSTER = await gp.evaluate(() => [['humans', 'kingdom'], ['vael', 'expedition']].map(([race, slug]) => {
      const { FACTIONS, BUILDINGS } = endfall.engine, f = FACTIONS[race], buildings = [...new Set([f.hq, ...f.buildBasic, ...f.buildAdvanced])];
      return { slug, buildings, units: buildings.flatMap(b => BUILDINGS[b].trains || []) };
    }));
    await game.close();
    assert.equal(ROSTER.length, 2);
    for (const r of ROSTER) {
      await page.goto(`${baseUrl()}docs/${r.slug}/`, { waitUntil: 'load' });
      const listed = await page.locator('[data-kind]').evaluateAll(es => es.map(e => e.dataset.kind));
      assert.deepEqual([...listed].sort(), [...r.buildings, ...r.units].sort(), `${r.slug}: every building and unit`);
      const imgs = await page.locator('.roster img').evaluateAll(is => is.map(i => i.alt));
      assert.equal(imgs.length, listed.length, `${r.slug}: a picture each`);
      // On a 390 px phone a unit's description takes the row's width, not a narrow column beside its plate.
      await page.setViewportSize({ width: 390, height: 844 });
      const narrow = await page.locator('.unit .desc').evaluateAll(ds => ds.map(d => [d.dataset.of, Math.round(d.getBoundingClientRect().width)]).filter(([, w]) => w < 250));
      assert.deepEqual(narrow, [], `${r.slug}: unit descriptions at least 250 px wide at 390`);
      await page.setViewportSize(PORTRAIT.viewport);
    }
    // The links between the pages, and back to the game.
    await page.goto(baseUrl() + 'docs/', { waitUntil: 'load' });
    await page.locator('.tabs a', { hasText: 'The Kingdom' }).tap();
    await page.waitForURL(/\/docs\/kingdom\/$/);
    assert.equal(await page.locator('.tabs a[aria-current="page"]').innerText(), 'KINGDOM', 'the tab says where you are (its short word on a phone)');
  } finally { await ctx.close(); await land.close(); }
});

test('a portrait phone: the Kingdom at a glance fits a 390x844 screen (the Ledger, at most 700 px); the top bar opaque on every page, upright and on its side', { engines: true }, async () => {
  const ctx = await browserContext({ ...PORTRAIT, viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}docs/kingdom/`, { waitUntil: 'load' });
    const h = (await page.locator('figure.tree').boundingBox()).height;
    assert.ok(h <= 700, `the Kingdom's glance ${Math.round(h)} px tall at 390x844`);
    assert.equal(await page.locator('figure.tree .tier').count(), 3, 'three tiers: the start, after a Barracks, after a Blacksmith');
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      for (const path of PAGES) {
        await page.goto(baseUrl() + path, { waitUntil: 'load' });
        const bg = await page.locator('.top').evaluate(e => getComputedStyle(e).backgroundColor);
        const m = bg.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/);
        assert.ok(m && (m[4] === undefined || +m[4] === 1), `${path} at ${size.width}x${size.height}: the bar opaque (${bg})`);
        assert.equal(bg, await page.evaluate(() => getComputedStyle(document.body).backgroundColor), `${path}: the bar in the page's own color`);
      }
    }
  } finally { await ctx.close(); }
});
