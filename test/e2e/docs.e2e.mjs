// The docs microsite (tools/docs) and the game's ways into it: the first page's footer line (Learn more: the docs home,
// in a new tab; the old buttons gone), the in-game ? and its help sheet (the game keeps running; Esc and the close
// button; the pause card's HOW TO PLAY), and every docs page with JavaScript off, listing every unit and building from
// the data, at phone width without a sideways scroll, its tabs (Home first) and buttons a finger's size, its bar slim
// in landscape; How to play's touch table: a gesture's loop on demand through its row's ? (nothing of it fetched before
// the tap, one open at a time, the ? again closes it).
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const PORTRAIT = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const PAGES = ['docs/', 'docs/how-to-play/', 'docs/kingdom/', 'docs/expedition/', 'docs/about/'];

for (const [name, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE], ['a portrait phone', PORTRAIT]]) {
  test(`the first page on ${name}: Learn more in its footer line, opening the docs home in a new tab, its Home tab current; no ABOUT or HOW TO PLAY button or link`, { engines: true }, async () => {
    const ctx = await browserContext(device), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      assert.equal(await page.locator('#btnHowTo, #btnAbout, #menuAbout, #help, #linkHowTo, #linkAbout, #menuLinks .sep').count(), 0, 'the old buttons, pages and links are gone');
      const a = page.locator('#linkDocs');
      assert.ok(await a.isVisible(), 'Learn more shown');
      assert.equal(await a.textContent(), 'Learn more');
      assert.equal(await a.getAttribute('href'), './docs/', 'the docs home, not an inner page: its clip and Start here cards');
      assert.equal(await a.getAttribute('target'), '_blank', 'a new tab: an installed app keeps the game');
      assert.match(await a.getAttribute('rel'), /noopener/);
      const b = await a.boundingBox();
      assert.ok(b.y + b.height <= device.viewport.height && b.x >= 0 && b.x + b.width <= device.viewport.width, `Learn more on screen: ${JSON.stringify(b)}`);
      assert.deepEqual(await page.locator('#menuLinks a').allTextContents(), ['Learn more', 'Send feedback'], 'Learn more, and a quiet second link (test/e2e/feedback.e2e.mjs)');
      // Under the row of buttons, above the build stamp.
      const [row, links, stamp] = await Promise.all(['#btnOptions', '#menuLinks', '#buildStamp'].map(s => page.locator(s).boundingBox()));
      assert.ok(links.y >= row.y + row.height - 1 && (stamp.y >= links.y + links.height - 1 || (stamp.x >= links.x + links.width - 1 && Math.abs(stamp.y + stamp.height / 2 - links.y - links.height / 2) < 4)), 'under the buttons, the stamp after it (beside it on a short phone on its side)');
      assert.match(await page.locator('#buildStamp').getAttribute('data-build'), /^[0-9a-f]{12}$/, 'the version, on the stamp');
      const [popup] = await Promise.all([ctx.waitForEvent('page'), device.hasTouch ? a.tap() : a.click()]);
      await popup.waitForLoadState();
      assert.match(popup.url(), /\/docs\/$/);
      assert.equal(await popup.locator('h1').textContent(), 'Ebbfall');
      assert.equal(await popup.locator('.tabs a[aria-current="page"]').innerText(), 'HOME', 'the Home tab says where you are');
      assert.equal(await popup.locator('.brand').innerText().then(t => t.replace(/\s+/g, ' ')), 'Ebbfall FIELD MANUAL', 'the wordmark and its tag');
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
      if (path === 'docs/how-to-play/') {
        // The touch table reads whole, its gestures' ? buttons hidden (they would do nothing), their boxes empty.
        assert.equal(await page.locator('table.touch tbody tr').count(), 13, `${path}: every touch row`);
        assert.equal(await page.locator('button.see').count(), 7, `${path}: the seven buttons in the page`);
        assert.equal(await page.locator('button.see').evaluateAll(bs => bs.filter(b => b.offsetParent || getComputedStyle(b).display !== 'none').length), 0, `${path}: none shown without scripts`);
        assert.equal(await page.locator('.gesture video, .gesture img').count(), 0, `${path}: no loop in the page`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}: no sideways scroll at 360`);
      assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main .lede')).fontSize) >= 16 && [...document.querySelectorAll('main > p:not([class]), main > ul:not([class]) > li')].every(e => parseFloat(getComputedStyle(e).fontSize) >= 16)), `${path}: body text 16 px or more`);
      // The top bar: its tabs scroll inside it, never off the page; tabs, PLAY and the footer's links a finger's size.
      const bar = await page.locator('.top').boundingBox();
      assert.ok(bar.width <= 360 && bar.height <= 97, `${path}: the bar fits (an upright phone: the tabs on a row of their own): ${JSON.stringify(bar)}`);
      // Five tabs, Home first (so a phone sees the docs have a home), the page's own marked; the wordmark says what this is.
      assert.deepEqual(await page.locator('.tabs a').evaluateAll(as => as.map(a => a.innerText)), ['HOME', 'HOW TO PLAY', 'KINGDOM', 'EXPEDITION', 'ABOUT'], `${path}: the tabs`);
      assert.equal(await page.locator('.tabs a[aria-current="page"]').getAttribute('href'), '/' + path, `${path}: its tab current`);
      assert.equal(await page.locator('.brand').innerText().then(t => t.replace(/\s+/g, ' ')), 'Ebbfall FIELD MANUAL', `${path}: the wordmark and its tag`);
      // Every tab whole inside the bar: none cut off mid-word.
      const cut = await page.locator('.tabs a').evaluateAll(as => { const n = as[0].parentElement.getBoundingClientRect(); return as.filter(a => { const r = a.getBoundingClientRect(); return r.left < n.left - 1 || r.right > n.right + 1 || a.scrollWidth > a.clientWidth + 1; }).map(a => a.innerText); });
      assert.deepEqual(cut, [], `${path}: every tab whole`);
      for (const [sel, w, h] of [['.tabs a', 48, 48], ['.top .play', 44, 40], ['footer a', 44, 40]]) {
        const small = await page.locator(sel).evaluateAll((as, [w, h]) => as.map(a => a.getBoundingClientRect()).filter(r => r.height < h || r.width < w).length, [w, h]);
        assert.equal(small, 0, `${path}: ${sel} big enough to tap (${w}x${h})`);
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

for (const [name, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE], ['a portrait phone', { ...PORTRAIT, viewport: { width: 390, height: 844 } }]]) {
  test(`How to play's touch table on ${name}: a row's ? opens its loop under the row's words and plays it, nothing of it fetched before; another row's ? closes the first; the ? again closes it`, { chromium: 'H.264 playback; the other engines have no loop to play' }, async () => {
    const ctx = await browserContext(device), page = await ctx.newPage();
    const press = (loc) => (device.hasTouch ? loc.tap() : loc.click());
    const requested = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    const loops = () => requested.filter(u => /\/docs\/media\/controls\/touch-[\w-]+\.(mp4|webp)$/.test(u));
    try {
      await page.goto(`${baseUrl()}docs/how-to-play/`, { waitUntil: 'networkidle' });
      // The phone's controls before the desktop's; the loop (the one video) opens them.
      const order = await page.locator('main h2').evaluateAll(hs => hs.map(h => h.id));
      assert.deepEqual(order.slice(0, 3), ['goal', 'phone', 'desktop'], 'the goal, then the phone, then the desktop');
      assert.equal(await page.locator('video').count(), 1, 'one video in the page: the loop');
      assert.deepEqual(loops(), [], 'nothing of a gesture fetched on load');
      // Seven ? buttons, one per row with a loop, each a 44 px target drawing a 32 px circle, labeled for its row.
      const buttons = page.locator('button.see');
      assert.equal(await buttons.count(), 7);
      const sizes = await buttons.evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(), c = b.firstElementChild.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(c.width), Math.round(c.height), b.getAttribute('aria-expanded'), b.getAttribute('aria-label'), b.closest('tr').firstElementChild.textContent]; }));
      for (const [w, h, cw, ch, expanded, label, row] of sizes) {
        assert.ok(w >= 44 && h >= 44 && cw === 32 && ch === 32, `a 44 px target, 32 px drawn: ${JSON.stringify([w, h, cw, ch])}`);
        assert.equal(expanded, 'false'); assert.equal(label, `Show how: ${row}`);
      }
      const group = page.locator('tr', { has: page.locator('td:first-child', { hasText: /^Select a group$/ }) }).locator('button.see');
      const groupBox = page.locator('#see-touch-group');
      assert.ok(await groupBox.isHidden() && await groupBox.evaluate(e => e.childElementCount === 0), 'its box empty and hidden');
      // The tap: the box opens under the row's words with the video, which plays; its label the gesture's; the file and
      // its poster fetched now, and only this gesture's.
      await group.scrollIntoViewIfNeeded();
      await press(group);
      assert.equal(await group.getAttribute('aria-expanded'), 'true');
      const video = groupBox.locator('video');
      assert.equal(await video.count(), 1, 'the video made on the tap');
      assert.equal(await video.getAttribute('aria-label'), 'Ebbfall on a phone: press and hold until the ring fills, then drag a box to select a group');
      assert.equal(await video.getAttribute('src'), '/docs/media/controls/touch-group.mp4');
      assert.equal(await video.getAttribute('poster'), '/docs/media/controls/touch-group.webp');
      assert.ok(await video.evaluate(v => v.muted && v.loop && !v.controls), 'muted, looping, no controls');
      await page.waitForFunction(() => { const v = document.querySelector('#see-touch-group video'); return v && !v.paused && v.currentTime > 0.3; }, null, { timeout: 15000 });
      const [bb, rb, wb] = await Promise.all([groupBox.boundingBox(), group.locator('xpath=ancestor::tr[1]').boundingBox(), group.locator('xpath=ancestor::td[1]').boundingBox()]);
      assert.ok(bb.y > wb.y + 20, 'under the row\'s words');
      // (a narrow phone: the row's full width; wider, a landscape phone too: at most 480 px, in the How column)
      if (device.viewport.width <= 640) assert.ok(Math.abs(bb.x - rb.x) <= 1 && Math.abs(bb.width - rb.width) <= 1, `the row's full width on a phone: ${JSON.stringify([bb, rb])}`);
      else assert.ok(bb.width <= 480 && bb.x >= wb.x, `at most 480 px wide, in the How column: ${JSON.stringify(bb)}`);
      assert.deepEqual([...new Set(loops())].sort(), ['/docs/media/controls/touch-group.mp4', '/docs/media/controls/touch-group.webp'], 'this gesture\'s file and poster, nothing else');
      // Another row's ?: the first closes (its box empty again, its video gone), the second opens and plays.
      const select = page.locator('tr', { has: page.locator('td:first-child', { hasText: /^Select$/ }) }).locator('button.see');
      await press(select);
      assert.equal(await group.getAttribute('aria-expanded'), 'false'); assert.equal(await select.getAttribute('aria-expanded'), 'true');
      assert.ok(await groupBox.isHidden() && await groupBox.evaluate(e => e.childElementCount === 0), 'the first closed and emptied');
      assert.equal(await page.locator('.gesture video').count(), 1, 'one open at a time');
      await page.waitForFunction(() => { const v = document.querySelector('#see-touch-select video'); return v && !v.paused && v.currentTime > 0.3; }, null, { timeout: 15000 });
      // The ? again: closed, nothing playing.
      await press(select);
      assert.equal(await select.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('.gesture video').count(), 0, 'closed');
      assert.equal(await page.locator('[aria-expanded="true"]').count(), 0, 'none open');
      assert.deepEqual([...new Set(loops())].sort(), ['/docs/media/controls/touch-group.mp4', '/docs/media/controls/touch-group.webp', '/docs/media/controls/touch-select.mp4', '/docs/media/controls/touch-select.webp'], 'the two gestures tapped, nothing else');
    } finally { await ctx.close(); }
  });
}

test('How to play under reduced motion: the loop still, and a row\'s ? shows the gesture\'s poster with the video\'s controls, not playing', { chromium: 'H.264 playback; the other engines have no loop to play' }, async () => {
  const ctx = await browserContext({ ...PHONE, reducedMotion: 'reduce' }), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}docs/how-to-play/`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('figure.clip video').evaluate(v => v.paused && !v.controls), 'the loop still, its poster over it');
    const group = page.locator('tr', { has: page.locator('td:first-child', { hasText: /^Select a group$/ }) }).locator('button.see');
    await group.scrollIntoViewIfNeeded(); await group.tap();
    const video = page.locator('#see-touch-group video');
    assert.equal(await video.count(), 1);
    assert.ok(await video.evaluate(v => v.paused && v.controls && v.getAttribute('poster') === '/docs/media/controls/touch-group.webp' && v.preload === 'none'), 'the poster with controls, the person chooses to play');
    await page.waitForTimeout(1000);
    assert.ok(await video.evaluate(v => v.paused && v.currentTime === 0), 'still not playing');
  } finally { await ctx.close(); }
});

test('a portrait phone: the Kingdom at a glance fits a 390x844 screen (the Ledger, at most 700 px); the top bar opaque on every page, upright and on its side, its five tabs 48 px at 360x800, 390x844 and 844x390', { engines: true }, async () => {
  const ctx = await browserContext({ ...PORTRAIT, viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}docs/kingdom/`, { waitUntil: 'load' });
    const h = (await page.locator('figure.tree').boundingBox()).height;
    assert.ok(h <= 700, `the Kingdom's glance ${Math.round(h)} px tall at 390x844`);
    assert.equal(await page.locator('figure.tree .tier').count(), 3, 'three tiers: the start, after a Barracks, after a Blacksmith');
    for (const size of [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(size);
      for (const path of PAGES) {
        await page.goto(baseUrl() + path, { waitUntil: 'load' });
        const bg = await page.locator('.top').evaluate(e => getComputedStyle(e).backgroundColor);
        const m = bg.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/);
        assert.ok(m && (m[4] === undefined || +m[4] === 1), `${path} at ${size.width}x${size.height}: the bar opaque (${bg})`);
        assert.equal(bg, await page.evaluate(() => getComputedStyle(document.body).backgroundColor), `${path}: the bar in the page's own color`);
        // Every tab a finger's size and whole; on screen, but on a 320 px phone, where the row scrolls sideways instead
        // of squeezing them; the bar two rows upright (96 px), one on its side (48 px).
        const tabs = await page.locator('.tabs a').evaluateAll(as => as.map(a => { const r = a.getBoundingClientRect(); return [a.innerText, Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.right), a.scrollWidth <= a.clientWidth + 1]; }));
        assert.equal(tabs.length, 5, `${path}: five tabs`);
        const scrolls = await page.locator('.tabs').evaluate(e => e.scrollWidth > e.clientWidth + 1);
        assert.equal(scrolls, size.width < 350, `${path} at ${size.width}x${size.height}: the row scrolls only under 350 px`);
        assert.deepEqual(tabs.filter(([, w, h, l, r, whole]) => w < 48 || h < 48 || !whole || (!scrolls && (l < 0 || r > size.width))), [], `${path} at ${size.width}x${size.height}: every tab at least 48x48, whole and on screen: ${JSON.stringify(tabs)}`);
        assert.ok((await page.locator('.top').boundingBox()).height <= (size.width > size.height ? 49 : 97), `${path} at ${size.width}x${size.height}: the bar no taller than before`);
      }
    }
  } finally { await ctx.close(); }
});
