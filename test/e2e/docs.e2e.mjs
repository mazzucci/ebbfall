// The docs microsite (tools/docs) and the game's ways into it: the first page's footer line (Learn more: the docs home,
// in a new tab; the old buttons gone), the in-game ? and its help sheet (the game keeps running; Esc and the close
// button; the pause card's HOW TO PLAY), and every docs page with JavaScript off, listing every unit and building from
// the data, at phone width without a sideways scroll, its tabs (Home first) and buttons a finger's size, its bar slim
// in landscape; How to play's controls tables: a gesture's loop on demand through its row's ? (nothing of it fetched before
// the tap, one open at a time, the ? again closes it); the docs' videos playing on past their loop, with the byte ranges
// the site's Worker serves (WebKit refuses a whole file for one).
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, browserContext, baseUrl, notIn, site, ENGINE, DESKTOP, PHONE } from './harness.mjs';

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
      assert.deepEqual(await page.locator('#menuLinks a').allTextContents(), ['Learn more', 'Send feedback'], 'Learn more, and a quiet second link (test/e2e/feedback.e2e.mjs); no link to a trailer (it plays on the page: menutrailer.e2e.mjs)');
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
      const u = await d.eval(() => Math.max(0.9, Math.min(1.1, innerWidth / 1440, innerHeight / 810))); // (style.css --u)
      assert.equal(Math.round(q.width), d.touch ? 32 : Math.round(40 * u), 'a 32 px button; 40 units with the desktop HUD, as its other buttons');
      await press('#btnHelp');
      const sheet = d.page.locator('#helpSheet');
      assert.ok(await sheet.isVisible(), 'the sheet opens');
      assert.equal(await help.getAttribute('aria-expanded'), 'true');
      const [s, stage, bar] = await Promise.all([sheet.boundingBox(), d.page.locator('#stage').boundingBox(), d.page.locator('#top').boundingBox()]);
      assert.ok(s.x + s.width <= stage.x + stage.width + 1 && s.y >= stage.y - 1 && s.y + s.height <= stage.y + stage.height + 1, 'inside the stage');
      assert.ok(s.x + s.width > stage.x + stage.width - 20 && s.y >= bar.y + bar.height && s.y < bar.y + bar.height + 20, "in its top-right corner, under the top bar (a desktop's stage is the window: the bar floats over it)");
      const lines = await sheet.locator(d.touch ? '.lines.touch li' : '.lines.desk li').evaluateAll(ls => ls.filter(l => l.offsetParent).length);
      assert.equal(lines, d.touch ? 4 : 5, "the controls in a pointer's lines: a mouse's five, touch's four");
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
        // The touch table reads whole.
        assert.equal(await page.locator('table.touch').first().locator('tbody tr').count(), 8, `${path}: every touch row`);
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

test('How to play\'s two loops, the phone\'s and the desktop\'s: each plays only while in view; scrolled to one, the other is paused', { chromium: 'H.264 playback; the other engines have no loop to play' }, async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}docs/how-to-play/`, { waitUntil: 'networkidle' });
    const loops = page.locator('figure.clip video');
    assert.deepEqual(await loops.evaluateAll(vs => vs.map(v => v.getAttribute('src'))), ['/docs/media/controls/controls-loop.mp4', '/docs/media/controls/desktop-loop.mp4']);
    const state = () => loops.evaluateAll(vs => vs.map(v => (v.paused ? 'paused' : 'playing')));
    await loops.first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const v = document.querySelectorAll('figure.clip video')[0]; return !v.paused && v.currentTime > 0.3; }, null, { timeout: 15000 });
    assert.deepEqual(await state(), ['playing', 'paused'], 'at the phone section: its loop plays, the desktop\'s waits');
    await loops.nth(1).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const vs = document.querySelectorAll('figure.clip video'); return vs[0].paused && !vs[1].paused && vs[1].currentTime > 0.3; }, null, { timeout: 15000 });
    assert.deepEqual(await state(), ['paused', 'playing'], 'at the desktop section: its loop plays, the phone\'s paused');
    assert.ok(await loops.nth(1).evaluate(v => v.nextElementSibling.hidden), 'the desktop loop\'s poster gone once it plays');
    await loops.first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const vs = document.querySelectorAll('figure.clip video'); return !vs[0].paused && vs[1].paused; }, null, { timeout: 15000 });
    assert.deepEqual(await state(), ['playing', 'paused'], 'back up: the phone\'s plays again, the desktop\'s paused');
  } finally { await ctx.close(); }
});

test('How to play under reduced motion: the loops still, their posters over them', { chromium: 'H.264 playback; the other engines have no loop to play' }, async () => {
  const ctx = await browserContext({ ...PHONE, reducedMotion: 'reduce' }), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}docs/how-to-play/`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('figure.clip video').evaluateAll(vs => vs.length === 2 && vs.every(v => v.paused && !v.controls)), 'both loops still, their posters over them');
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

// Safari plays a video only from a server that answers its byte ranges with 206: Cloudflare's assets answer every
// range with the whole file, 200, so the site's Worker serves the docs' videos (site/media.js, wrangler.toml
// run_worker_first), as this server does. WebKit checks it: its first request for a video has no range, but at the
// loop's end it asks again for the rest from the first frame (bytes=1761-), and a whole 200 there stops the video
// ("Received unexpected 200 HTTP status code for range request"): so each video is sent near its end, and must play
// on past the loop. Firefox:
// Playwright's build plays no H.264.
test('the docs\' videos play on past their loop, served with byte ranges by the Worker: the home\'s trailer, How to play\'s loop', { engines: true, skip: notIn(['firefox'], 'its build has no H.264 decoder') }, async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  site.worker.length = 0;
  /** `sel`'s video playing, then (`wrap`) sent half a second before its end: it must loop and play on, with no error. */
  const loops = async (sel, wrap = true) => {
    await page.waitForFunction((s) => { const v = document.querySelector(s); return v && !v.paused && v.currentTime > 0.3; }, sel, { timeout: 20000 });
    if (!wrap) return assert.equal(await page.evaluate((s) => document.querySelector(s).error, sel), null, `${sel}: no error`);
    await page.evaluate((s) => { const v = document.querySelector(s); v.dataset.wrapped = ''; v.addEventListener('timeupdate', function on() { if (v.currentTime < 1) { v.dataset.wrapped = '1'; v.removeEventListener('timeupdate', on); } }); v.currentTime = v.duration - 0.5; }, sel);
    await page.waitForFunction((s) => { const v = document.querySelector(s); if (v.error) throw new Error(v.error.message); return v.dataset.wrapped && !v.paused && v.currentTime > 0.5; }, sel, { timeout: 20000 });
    assert.equal(await page.evaluate((s) => document.querySelector(s).error, sel), null, `${sel}: no error`);
  };
  try {
    await page.goto(`${baseUrl()}docs/`, { waitUntil: 'load' });
    await page.locator('figure.clip video').scrollIntoViewIfNeeded();
    await loops('figure.clip video');
    await page.goto(`${baseUrl()}docs/how-to-play/`, { waitUntil: 'load' });
    await page.locator('figure.clip video').first().scrollIntoViewIfNeeded();
    await loops('figure.clip video');
    for (const p of ['/docs/media/trailer.mp4', '/docs/media/controls/controls-loop.mp4']) assert.ok(site.worker.includes(`GET ${p}`), `${p}: the Worker's (${site.worker})`);
    assert.ok(!site.worker.some(r => r.endsWith('.webp')), 'the posters the assets\'');
  } finally { await ctx.close(); }
});

test('the docs\' top bar between a phone and a desktop (641 to 820 px wide, where ABOUT sat under PLAY): all five tabs on the bar, the row not scrolling, on one 48 px row', { engines: true }, async () => {
  const ctx = await browserContext({ viewport: { width: 734, height: 412 } }), page = await ctx.newPage();
  try {
    for (const width of [641, 667, 700, 719, 720, 734, 768, 820, 821, 900]) {
      await page.setViewportSize({ width, height: 412 });
      for (const path of ['docs/', 'docs/expedition/']) {
        await page.goto(baseUrl() + path, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const got = await page.evaluate(() => {
          const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width), Math.round(b.height)]; }, t = document.querySelector('.tabs');
          return { tabs: r(t), scrolls: t.scrollWidth > t.clientWidth + 1, play: r(document.querySelector('.top .play')), a: [...t.querySelectorAll('a')].map(a => [a.innerText, ...r(a)]), bar: Math.round(document.querySelector('.top').getBoundingClientRect().height) };
        });
        const what = `${path} at ${width} px: ${JSON.stringify(got)}`;
        assert.deepEqual(got.a.map(a => a[0].replace(/^THE /, '')), ['HOME', 'HOW TO PLAY', 'KINGDOM', 'EXPEDITION', 'ABOUT'], what);
        assert.ok(!got.scrolls, `the row does not scroll: ${what}`);
        // (the row's last 14 px fade out, a cue for a row that scrolls: no tab may end in them)
        for (const [name, l, rr, w, h] of got.a) assert.ok(l >= got.tabs[0] && rr <= got.tabs[1] - 14 && rr < got.play[0] && w >= 48 && h >= 48, `${name} whole on the bar, clear of PLAY, a finger's size: ${what}`);
        assert.ok(got.bar <= 49 && got.play[1] <= width, `one slim row, PLAY on it: ${what}`);
      }
    }
  } finally { await ctx.close(); }
});
