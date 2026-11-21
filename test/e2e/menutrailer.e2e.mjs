// The trailer on the menu's first page (index.html #menuTrailer and #trailerDlg, src/client/trailer.js, style.css): its
// poster, a still with a play button, framed above the buttons, beside them on a phone on its side, with both big
// buttons on screen and no scrolling; nothing of the video asked for before the tap; on the tap the dialog plays it
// with its sound (a muted game too) and the browser's controls, from the Worker's byte ranges; paused for good on CLOSE,
// on a hidden tab, on a link followed, and let go of when a game starts; offline it says it needs a connection; no
// poster, no empty frame; the page the same whether it is `tall` or not (corner.js), PLAY OFFLINE's answer fitting too.
// (Its files and the page's markup: test/menu-trailer.test.js. The field under it: field.e2e.mjs.)
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, site, DESKTOP, PHONE, notIn, ENGINE } from './harness.mjs';

before(start);
after(stop);

const TRAILER = '/docs/media/ebbfall-trailer.mp4';

async function open(device, { route = null, url = '?seed=4242' } = {}) {
  const ctx = await browserContext(device);
  if (route) await ctx.route(route, (r) => r.abort());
  const page = await ctx.newPage(), errors = [], asked = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // (every request for the trailer, from any page of the context: the page's own, and its media loader's)
  ctx.on('request', (r) => { if (new URL(r.url()).pathname === TRAILER) asked.push(r.headers().range || 'whole'); });
  await page.goto(baseUrl() + url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.endfall && document.fonts.status === 'loaded', null, { timeout: 60000 });
  return { ctx, page, errors, asked, press: (sel) => (device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click()) };
}
/** The first page as laid out: the poster's box, the buttons, the card's scroll. */
const layout = (page) => page.evaluate(() => {
  const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const img = document.getElementById('menuTrailerPoster'), card = document.querySelector('#start .card.menu');
  return { box: r('menuTrailer'), solo: r('btnSolo'), online: r('btnOnline'), tutorial: r('btnTutorial'), foot: r('menuFoot'), tag: r('menuTag'), vw: innerWidth, vh: innerHeight,
    poster: { src: img.currentSrc.split('/').pop(), loaded: img.complete && img.naturalWidth > 0 }, scroll: card.scrollHeight - card.clientHeight, tall: card.classList.contains('tall') };
});
/** The trailer's video as the page has it. */
const video = (page) => page.evaluate(() => {
  const v = document.getElementById('trailerVideo');
  return { open: document.getElementById('trailerDlg').open, paused: v.paused, t: v.currentTime, muted: v.muted, volume: v.volume, loop: v.loop, autoplay: v.autoplay, inline: v.playsInline, controls: v.controls, src: v.getAttribute('src'), error: v.error?.code ?? null };
});
const playing = (page) => page.waitForFunction(() => { const v = document.getElementById('trailerVideo'); return document.getElementById('trailerDlg').open && !v.paused && v.currentTime > 0.3; }, null, { timeout: 30000 });
const inView = (b, l) => b.x >= 0 && b.y >= 0 && b.r <= l.vw + 0.5 && b.b <= l.vh + 0.5;
/** The dialog's parts as laid out: the video, CLOSE and the credit, each whole on screen. */
const dialogLayout = (page) => page.evaluate(() => {
  const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  return { video: r('trailerVideo'), close: r('trailerClose'), credit: r('trailerCredit'), vw: innerWidth, vh: innerHeight };
});

for (const [w, h] of [[844, 390], [667, 375], [568, 320], [844, 340]]) {
  test(`a phone on its side, ${w}x${h}: the trailer's poster beside the buttons, both big buttons whole on screen, nothing scrolls`, { engines: w === 844 && h === 390 }, async () => {
    const { ctx, page, errors } = await open({ ...PHONE, viewport: { width: w, height: h } });
    try {
      const l = await layout(page), what = JSON.stringify(l);
      assert.ok(inView(l.solo, l) && inView(l.online, l), `SINGLE PLAYER and MULTIPLAYER whole on screen: ${what}`);
      assert.ok(l.solo.h >= 60 && l.online.h >= 60 && l.solo.w >= 200, `big: ${what}`);
      assert.ok(l.scroll <= 1 && !l.tall, `the page does not scroll: ${what}`);
      assert.ok(inView(l.tutorial, l) && inView(l.foot, l), `the small row and the footer line on screen too: ${what}`);
      assert.ok(l.poster.loaded, 'the poster came');
      assert.ok(Math.abs(l.box.w / l.box.h - 2) < 0.02, `the frame's shape, 2:1: ${what}`);
      assert.ok(l.box.w >= 280, `a poster worth looking at (above the buttons it would be 240 px wide at best): ${l.box.w}`);
      assert.ok(l.box.r <= l.solo.x && l.box.y >= l.tag.b - 1 && Math.abs(l.box.y - l.solo.y) <= 1, `beside the buttons, on their left, under the line: ${what}`);
      assert.ok(l.online.y >= l.solo.b && l.tutorial.y >= l.online.b && Math.abs(l.online.x - l.solo.x) <= 1, `the modes one over the other, the small row under them: ${what}`);
      assert.ok(l.foot.y >= Math.max(l.box.b, l.tutorial.b) - 1, `the footer line under both: ${what}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

for (const [name, device] of [['an upright phone, 390x844', { ...PHONE, viewport: { width: 390, height: 844 } }], ['a desktop, 1440x900', { viewport: { width: 1440, height: 900 } }], ['a big desktop, 2560x1440', { viewport: { width: 2560, height: 1440 } }], ['a small desktop, 1280x720', DESKTOP]]) {
  test(`${name}: the trailer's poster framed above the buttons, in their column, the page from its top, nothing scrolls`, async () => {
    const { ctx, page, errors } = await open(device);
    try {
      const l = await layout(page), what = JSON.stringify(l);
      assert.ok(l.poster.loaded, 'the poster came');
      assert.equal(l.poster.src, 'trailer.jpg');
      assert.ok(Math.abs(l.box.w / l.box.h - 2) < 0.02, `2:1: ${what}`);
      assert.ok(l.box.y >= l.tag.b - 1 && l.box.b <= l.solo.y, `under the line, above the buttons: ${what}`);
      assert.ok(l.box.x >= l.solo.x - 1 && l.box.r <= l.online.r + 1 && Math.abs((l.box.x + l.box.r) / 2 - l.vw / 2) <= 1, `in the buttons' column, centered: ${what}`);
      assert.ok(l.box.w <= 1000 + 1, `never past 1000 px: ${l.box.w}`);
      assert.ok(l.tag.y < 200, `the page from its top (not centered): the line at ${l.tag.y}`);
      for (const b of [l.solo, l.online, l.tutorial, l.foot]) assert.ok(inView(b, l), `on screen: ${what}`);
      assert.ok(l.scroll <= 1, `the page does not scroll: ${what}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('nothing of the trailer before the tap (reduced motion too); the tap plays it in the dialog with its sound, a muted game or not, the browser\'s controls, no loop, from the Worker\'s byte ranges; CLOSE pauses it and it stays paused', { engines: true, skip: notIn(['firefox'], 'its build has no H.264 decoder') }, async () => {
  site.worker.length = 0;
  const { ctx, page, errors, asked, press } = await open({ ...PHONE, reducedMotion: 'reduce' });
  try {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    assert.deepEqual([asked, (await video(page)).src, (await video(page)).open], [[], null, false], 'no request, no source, the dialog shut');
    assert.ok(await page.locator('#menuTrailerPoster').isVisible() && await page.locator('#menuTrailer .play').isVisible(), 'the poster and its play button');
    // The game muted (the corner's button): the trailer keeps its own sound, a choice made with a tap.
    await press('#cornerSound');
    assert.equal(await page.evaluate(() => endfall.status().muted), true, 'the game muted');
    await press('#menuTrailer');
    await playing(page);
    const v = await video(page);
    assert.deepEqual([v.muted, v.volume > 0, v.loop, v.autoplay, v.inline, v.controls, v.src, v.error], [false, true, false, false, true, true, `.${TRAILER}`, null], JSON.stringify(v));
    assert.ok(asked.length >= 1, 'asked for once tapped');
    if (ENGINE === 'chromium') assert.ok(asked.every(r => r !== 'whole'), `by byte range: ${asked}`); // (WebKit's media loader does not show its headers here; its ranges: docs.e2e.mjs, by a video playing on)
    assert.ok(site.worker.includes(`GET ${TRAILER}`), 'the Worker answers it (site/media.js)');
    // The dialog fits: the video, CLOSE and the credit whole on screen.
    const d = await dialogLayout(page);
    for (const k of ['video', 'close', 'credit']) assert.ok(inView(d[k], d), `${k} on screen: ${JSON.stringify(d)}`);
    assert.ok(Math.abs(d.video.w / d.video.h - 16 / 9) < 0.02 && d.video.h >= 200, `the video at 16:9, large: ${JSON.stringify(d.video)}`);
    await press('#trailerClose');
    await page.waitForFunction(() => !document.getElementById('trailerDlg').open && document.getElementById('trailerVideo').paused);
    const at = (await video(page)).t;
    await page.waitForTimeout(1200);
    assert.deepEqual([(await video(page)).paused, (await video(page)).t], [true, at], 'paused, and it stays so');
    assert.deepEqual([errors, await page.evaluate(() => endfall.status().errors)], [[], []]);
  } finally { await ctx.close(); }
});

test('the trailer pauses for good when the tab hides and when its credit\'s link is followed; a game started (START GAME) lets go of it; nothing asked for after', { skip: notIn(['firefox'], 'its build has no H.264 decoder') }, async () => {
  const { ctx, page, errors, asked, press } = await open(DESKTOP);
  const hide = (hidden) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  try {
    await press('#menuTrailer');
    await playing(page);
    await hide(true);
    await page.waitForFunction(() => document.getElementById('trailerVideo').paused);
    await hide(false);
    await page.waitForTimeout(1000);
    assert.equal((await video(page)).paused, true, 'back in view: still paused');
    // Played again by hand, then the credit's link (a new tab): paused.
    await page.locator('#trailerVideo').evaluate(v => v.play());
    await playing(page);
    const [tab] = await Promise.all([ctx.waitForEvent('page'), page.locator('#trailerCredit a').click()]);
    await page.waitForFunction(() => document.getElementById('trailerVideo').paused);
    await tab.close();
    await page.waitForTimeout(800);
    assert.equal((await video(page)).paused, true, 'still paused');
    // CLOSE, Single player, START GAME: the game lets go of the trailer (no source), the dialog shut.
    await press('#trailerClose');
    await press('#btnSolo');
    const start = await page.locator('#btnStart').boundingBox(), vp = page.viewportSize();
    assert.ok(start && start.y >= 0 && start.y + start.height <= vp.height, `START GAME on screen: ${JSON.stringify(start)}`);
    await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    await page.waitForFunction(() => !document.getElementById('trailerVideo').hasAttribute('src'));
    const v = await video(page), n = asked.length;
    assert.deepEqual([v.open, v.paused, v.src], [false, true, null], 'in a game: no source, paused, shut');
    await page.waitForTimeout(1500);
    assert.equal(asked.length, n, 'nothing more of it asked for in the game');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the trailer never comes (offline: it is web-only): the dialog says it needs a connection; the poster never comes: no empty frame, the buttons in its place', { engines: true }, async () => {
  if (ENGINE === 'chromium') { // (WebKit's media loader is not the test's to cut off; Firefox's build plays no H.264)
    const a = await open(DESKTOP, { route: `**${TRAILER}` });
    try {
      await a.press('#menuTrailer');
      await a.page.locator('#trailerNote').waitFor({ state: 'visible', timeout: 20000 });
      assert.equal(await a.page.locator('#trailerNote').textContent(), 'The trailer needs a connection.');
      assert.deepEqual(a.errors, []);
    } finally { await a.ctx.close(); }
  }
  const b = await open(DESKTOP, { route: '**/menu/trailer.jpg' });
  try {
    await b.page.waitForFunction(() => document.getElementById('menuTrailer').hidden);
    const l = await b.page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { box: r('menuTrailer').height, tag: r('menuTag').bottom, solo: r('btnSolo').top }; });
    assert.equal(l.box, 0, 'no frame');
    assert.ok(l.solo - l.tag < 40, `the buttons right under the line: ${JSON.stringify(l)}`);
    assert.deepEqual(b.errors, []);
  } finally { await b.ctx.close(); }
  // On a phone on its side: the plain column it was (the two modes side by side across the page), not a column left empty.
  const c = await open(PHONE, { route: '**/menu/trailer.jpg' });
  try {
    await c.page.waitForFunction(() => document.getElementById('menuTrailer').hidden);
    const l = await layout(c.page), what = JSON.stringify(l);
    assert.ok(Math.abs(l.solo.y - l.online.y) <= 1 && l.online.x >= l.solo.r && l.solo.x < 80 && l.online.r > l.vw - 80, `the modes side by side, across the page: ${what}`);
    assert.ok(l.tutorial.y >= l.solo.b && inView(l.foot, l) && l.scroll <= 1, `the small row under them, the page fits: ${what}`);
    assert.deepEqual(c.errors, []);
  } finally { await c.ctx.close(); }
});

test('the first page is the same page whether it scrolls or not (`tall`, corner.js, moves nothing: no flip between two layouts), and fits with PLAY OFFLINE\'s answer under the buttons: the poster gives it the room', async () => {
  for (const [w, h] of [[844, 390], [844, 340], [667, 375], [1280, 720], [1024, 660], [390, 844]]) {
    const { ctx, page, errors } = await open({ ...(Math.min(w, h) < 500 ? PHONE : {}), viewport: { width: w, height: h } });
    try {
      const rects = () => page.evaluate(() => ['menuTrailer', 'btnSolo', 'btnOnline', 'btnTutorial', 'menuFoot'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }));
      const before = await rects();
      await page.evaluate(() => document.querySelector('#start .card.menu').classList.add('tall'));
      assert.deepEqual(await rects(), before, `${w}x${h}: nothing moves when the page is tall`);
      await page.evaluate(() => document.querySelector('#start .card.menu').classList.remove('tall'));
      // PLAY OFFLINE's answer (set-up: its longest line), then a few frames: the page fits, and stays as it is.
      await page.evaluate(() => { document.getElementById('homeOfflineMsg').textContent = 'Ready to play offline: everything is saved on this device ✓'; });
      const seen = await page.evaluate(() => new Promise((done) => {
        const c = document.querySelector('#start .card.menu'), out = []; let n = 0;
        const step = () => { out.push([c.classList.contains('tall'), c.scrollHeight - c.clientHeight, Math.round(document.getElementById('menuTrailer').getBoundingClientRect().width)]); if (++n < 12) requestAnimationFrame(step); else done(out); };
        requestAnimationFrame(() => requestAnimationFrame(step));
      }));
      assert.ok(seen.every(([tall, over]) => !tall && over <= 1), `${w}x${h}: with the answer the page fits, never tall: ${JSON.stringify(seen)}`);
      assert.equal(new Set(seen.map(s => s[2])).size, 1, `${w}x${h}: the poster one size, frame after frame: ${JSON.stringify(seen)}`);
      const l = await layout(page);
      assert.ok(inView(l.solo, l) && inView(l.online, l) && inView(l.foot, l) && l.box.w >= 240, `${w}x${h}: the buttons and the footer on screen, the poster still worth a look: ${JSON.stringify(l)}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});
