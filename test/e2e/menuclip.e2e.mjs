// The gameplay clip on the menu's first page (index.html #menuClip, src/client/menuclip.js, style.css): framed above the
// buttons, beside them on a phone on its side, with both big buttons on screen and no scrolling; the poster first, the
// video made only once the game has loaded (its art too), never under reduced motion or Save-Data; paused off the first
// page, let go of when the menu is left (the lobby, a game); the poster alone when the clip never comes, no frame when
// the poster does not; the page the same whether it is `tall` or not (corner.js), PLAY OFFLINE's answer fitting too.
// (Its files and the page's markup: test/menu-clip.test.js. The field under it: field.e2e.mjs.)
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, site, DESKTOP, PHONE, notIn, ENGINE } from './harness.mjs';

before(start);
after(stop);

const CLIP = '/docs/media/trailer.mp4';
/** Before any of the page's scripts: note each <video> the page makes, and what had happened by then (the document
 *  loaded, the game in: main.js sets window.endfall when it has run, and it runs once the renderer's art and the sim are
 *  in; the atlas pages fetched). */
const NOTE_VIDEO = () => {
  window.clipMade = [];
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) if (n.tagName === 'VIDEO') {
      // (a resource's entry is there once its response has ended: the atlas pages fetched by now, by name)
      const pages = new Set(performance.getEntriesByType('resource').map(e => e.name.match(/\/art\/(atlas-\d+\.webp)$/)?.[1]).filter(Boolean));
      window.clipMade.push({ in: n.parentNode.id, ready: document.readyState, game: !!window.endfall, pages: [...pages].sort() });
    }
  }).observe(document, { childList: true, subtree: true });
};
/** A browser that asked for less data (Save-Data: navigator.connection.saveData). */
const SAVE_DATA = () => { Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g' }) }); };

async function open(device, { inits = [NOTE_VIDEO], route = null, url = '?seed=4242' } = {}) {
  const ctx = await browserContext(device);
  for (const i of inits) await ctx.addInitScript(i);
  if (route) await ctx.route(route, (r) => r.abort());
  const page = await ctx.newPage(), errors = [], asked = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (new URL(r.url()).pathname === CLIP) asked.push(r.headers().range || 'whole'); });
  await page.goto(baseUrl() + url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.endfall && document.fonts.status === 'loaded', null, { timeout: 60000 });
  return { ctx, page, errors, asked, press: (sel) => (device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click()) };
}
/** The first page as laid out: the clip's box and its poster, the buttons, the card's scroll. */
const layout = (page) => page.evaluate(() => {
  const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const img = document.getElementById('menuClipPoster'), card = document.querySelector('#start .card.menu');
  return { clip: r('menuClip'), solo: r('btnSolo'), online: r('btnOnline'), tutorial: r('btnTutorial'), foot: r('menuFoot'), tag: r('menuTag'), vw: innerWidth, vh: innerHeight,
    poster: { src: img.currentSrc.split('/').pop(), loaded: img.complete && img.naturalWidth > 0 }, scroll: card.scrollHeight - card.clientHeight, tall: card.classList.contains('tall') };
});
/** The clip's video as the page has it: null without one. */
const video = (page) => page.evaluate(() => {
  const v = document.querySelector('#menuClip video'), box = document.getElementById('menuClip');
  return v ? { paused: v.paused, t: v.currentTime, muted: v.muted, loop: v.loop, inline: v.playsInline, controls: v.controls, src: v.getAttribute('src'), on: box.classList.contains('on'), opacity: getComputedStyle(v).opacity, error: v.error?.code ?? null } : null;
});
const playing = (page) => page.waitForFunction(() => { const v = document.querySelector('#menuClip video'); return v && !v.paused && v.currentTime > 0.2 && document.getElementById('menuClip').classList.contains('on'); }, null, { timeout: 30000 });
const inView = (b, l) => b.x >= 0 && b.y >= 0 && b.r <= l.vw + 0.5 && b.b <= l.vh + 0.5;

for (const [w, h] of [[844, 390], [667, 375], [568, 320], [844, 340]]) {
  test(`a phone on its side, ${w}x${h}: the clip beside the buttons, both big buttons whole on screen, nothing scrolls`, { engines: w === 844 && h === 390 }, async () => {
    const { ctx, page, errors } = await open({ ...PHONE, viewport: { width: w, height: h } });
    try {
      const l = await layout(page), what = JSON.stringify(l);
      assert.ok(inView(l.solo, l) && inView(l.online, l), `SINGLE PLAYER and MULTIPLAYER whole on screen: ${what}`);
      assert.ok(l.solo.h >= 60 && l.online.h >= 60 && l.solo.w >= 200, `big: ${what}`);
      assert.ok(l.scroll <= 1 && !l.tall, `the page does not scroll: ${what}`);
      assert.ok(inView(l.tutorial, l) && inView(l.foot, l), `the small row and the footer line on screen too: ${what}`);
      assert.ok(l.poster.loaded, 'the poster came');
      assert.ok(Math.abs(l.clip.w / l.clip.h - 2) < 0.02, `the clip's shape, 2:1: ${what}`);
      assert.ok(l.clip.w >= 280, `a clip worth looking at (above the buttons it would be 240 px wide at best): ${l.clip.w}`);
      assert.ok(l.clip.r <= l.solo.x && l.clip.y >= l.tag.b - 1 && Math.abs(l.clip.y - l.solo.y) <= 1, `beside the buttons, on their left, under the line: ${what}`);
      assert.ok(l.online.y >= l.solo.b && l.tutorial.y >= l.online.b && Math.abs(l.online.x - l.solo.x) <= 1, `the modes one over the other, the small row under them: ${what}`);
      assert.ok(l.foot.y >= Math.max(l.clip.b, l.tutorial.b) - 1, `the footer line under both: ${what}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

for (const [name, device, file] of [['an upright phone, 390x844', { ...PHONE, viewport: { width: 390, height: 844 } }, 'clip-720.webp'], ['a desktop, 1440x900', { viewport: { width: 1440, height: 900 } }, 'clip-720.webp'], ['a big desktop, 2560x1440', { viewport: { width: 2560, height: 1440 } }, 'clip-1280.webp'], ['a small desktop, 1280x720', DESKTOP, 'clip-720.webp']]) {
  test(`${name}: the clip framed above the buttons, in their column, the page from its top, nothing scrolls`, async () => {
    const { ctx, page, errors } = await open(device);
    try {
      const l = await layout(page), what = JSON.stringify(l);
      assert.ok(l.poster.loaded, 'the poster came');
      assert.equal(l.poster.src, file, 'the poster no larger than the clip is shown');
      assert.ok(Math.abs(l.clip.w / l.clip.h - 2) < 0.02, `2:1: ${what}`);
      assert.ok(l.clip.y >= l.tag.b - 1 && l.clip.b <= l.solo.y, `under the line, above the buttons: ${what}`);
      assert.ok(l.clip.x >= l.solo.x - 1 && l.clip.r <= l.online.r + 1 && Math.abs((l.clip.x + l.clip.r) / 2 - l.vw / 2) <= 1, `in the buttons' column, centered: ${what}`);
      assert.ok(l.clip.w <= 1000 + 1, `never past the clip's own 1000 px: ${l.clip.w}`);
      assert.ok(l.tag.y < 200, `the page from its top (not centered): the line at ${l.tag.y}`);
      for (const b of [l.solo, l.online, l.tutorial, l.foot]) assert.ok(inView(b, l), `on screen: ${what}`);
      assert.ok(l.scroll <= 1, `the page does not scroll: ${what}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('the clip never delays the menu: the page has the poster and no video until the game is in (its art too), then one, after the load event; it plays muted and looped over the poster, with no controls, from the Worker\'s byte ranges', { engines: true, skip: notIn(['firefox'], 'its build has no H.264 decoder') }, async () => {
  site.worker.length = 0;
  const { ctx, page, errors, asked } = await open(PHONE);
  try {
    await playing(page);
    const made = await page.evaluate(() => window.clipMade), v = await video(page);
    assert.equal(made.length, 1, `one video, made by the script: ${JSON.stringify(made)}`);
    assert.deepEqual([made[0].in, made[0].ready, made[0].game], ['menuClip', 'complete', true], 'made in the clip\'s box, after the page\'s load event, with the game in');
    const atlas = await page.evaluate(async () => (await (await fetch('art/atlas.json')).json()).pages.map(p => p.replace(/\.json$/, '.webp')).sort());
    assert.ok(atlas.length >= 2, `the atlas has its pages: ${atlas}`);
    assert.deepEqual(made[0].pages, atlas, 'every atlas page had been fetched by then');
    assert.deepEqual([v.muted, v.loop, v.inline, v.controls, v.src, v.error], [true, true, true, false, `.${CLIP}`, null]);
    assert.ok(asked.length >= 1, 'asked for');
    if (ENGINE === 'chromium') assert.ok(asked.every(r => r !== 'whole'), `by byte range: ${asked}`); // (WebKit's media loader does not show its headers here; its ranges: docs.e2e.mjs, by the video playing on)
    assert.ok(site.worker.includes(`GET ${CLIP}`), 'the Worker answers it (site/media.js)');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#menuClip video')).opacity === '1');
    assert.ok(await page.locator('#menuClipPoster').isVisible(), 'the poster stays under it');
    // No inline style, nothing the site's policy refuses.
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#menuClip video').getAttribute('style'), endfall.status().errors]), [null, []]);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the clip plays only on the first page: paused on Single player, on again after BACK; the lobby and a game started let go of it; back on the first page it is made again', { skip: notIn(['firefox'], 'its build has no H.264 decoder') }, async () => {
  const { ctx, page, errors, press } = await open(DESKTOP);
  try {
    await playing(page);
    await press('#btnSolo');
    await page.waitForFunction(() => document.querySelector('#menuClip video')?.paused === true);
    assert.ok(await page.locator('#menuSolo').isVisible(), 'Single player: the clip waits');
    await press('#btnSoloBack');
    await playing(page);
    assert.equal((await page.evaluate(() => window.clipMade)).length, 1, 'the same video: paused, not made again');
    // The lobby (the menu left, on the way to a game): let go of; BACK: made again.
    await press('#btnOnline');
    await page.locator('#onlineJoin').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('video'));
    await press('#btnOnlineBack');
    await playing(page);
    assert.equal((await page.evaluate(() => window.clipMade)).length, 2, 'back from the lobby: made again');
    await press('#btnSolo'); await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    await page.waitForFunction(() => !document.querySelector('#menuClip video'));
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('video').length, document.getElementById('menuClip').classList.contains('on')]), [0, false], 'in a game: no video anywhere, the box as it began');
    await press('#btnPause'); await press('#btnQuit'); await press('#btnSoloBack');
    await playing(page);
    assert.equal((await page.evaluate(() => window.clipMade)).length, 3, 'back on the first page: made again');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

for (const [name, device, inits] of [['reduced motion', { ...PHONE, reducedMotion: 'reduce' }, [NOTE_VIDEO]], ['Save-Data', PHONE, [NOTE_VIDEO, SAVE_DATA]]]) {
  test(`${name}: the poster alone, no video made and nothing of the clip asked for`, { engines: true }, async () => {
    const { ctx, page, errors, asked } = await open(device, { inits });
    try {
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(4000); // (past the idle moment the video would have been made in: 3 s at most)
      const l = await layout(page);
      assert.ok(l.poster.loaded && await page.locator('#menuClipPoster').isVisible(), 'the poster shows');
      assert.deepEqual([await page.evaluate(() => window.clipMade), await video(page), asked], [[], null, []], 'no video, no request');
      // The other menu pages and back: still none.
      await page.locator('#btnSolo').tap(); await page.locator('#btnSoloBack').tap();
      await page.waitForTimeout(500);
      assert.deepEqual([await video(page), asked], [null, []]);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('the clip never comes (offline: it is the docs\', web-only): the poster stays, the video is let go of and not asked for again; no poster either: no empty frame, the buttons in its place', { engines: true }, async () => {
  const a = await open(DESKTOP, { route: `**${CLIP}` });
  try {
    // (a browser with no H.264 decoder, Firefox's build here, is not asked to play it at all: no video, no request;
    // WebKit's media loader is not the test's to cut off, so there the clip comes and this half says nothing)
    const can = await a.page.evaluate(() => !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'));
    if (ENGINE !== 'webkit') {
      if (can) await a.page.waitForFunction(() => window.clipMade.length === 1 && !document.querySelector('#menuClip video'), null, { timeout: 30000 });
      else await a.page.waitForTimeout(4000);
      assert.ok(await a.page.locator('#menuClipPoster').isVisible() && !(await a.page.locator('#menuClip').evaluate(e => e.classList.contains('on'))), 'the poster, as at first');
      const asked = a.asked.length;
      assert.ok(can ? asked >= 1 : asked === 0, `it was asked for where it can play: ${asked}`);
      await a.press('#btnSolo'); await a.press('#btnSoloBack');
      await a.page.waitForTimeout(800);
      assert.deepEqual([(await a.page.evaluate(() => window.clipMade)).length, a.asked.length], [can ? 1 : 0, asked], 'not tried again');
      assert.deepEqual(a.errors, []);
    }
  } finally { await a.ctx.close(); }
  const b = await open(DESKTOP, { route: '**/menu/clip-*.webp' });
  try {
    await b.page.waitForFunction(() => document.getElementById('menuClip').hidden);
    const l = await b.page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { clip: r('menuClip').height, tag: r('menuTag').bottom, solo: r('btnSolo').top }; });
    assert.equal(l.clip, 0, 'no frame');
    assert.ok(l.solo - l.tag < 40, `the buttons right under the line: ${JSON.stringify(l)}`);
    assert.deepEqual(b.errors, []);
  } finally { await b.ctx.close(); }
  // On a phone on its side: the plain column it was (the two modes side by side across the page), not a column left empty.
  const c = await open(PHONE, { route: '**/menu/clip-*.webp' });
  try {
    await c.page.waitForFunction(() => document.getElementById('menuClip').hidden);
    const l = await layout(c.page), what = JSON.stringify(l);
    assert.ok(Math.abs(l.solo.y - l.online.y) <= 1 && l.online.x >= l.solo.r && l.solo.x < 80 && l.online.r > l.vw - 80, `the modes side by side, across the page: ${what}`);
    assert.ok(l.tutorial.y >= l.solo.b && inView(l.foot, l) && l.scroll <= 1, `the small row under them, the page fits: ${what}`);
    assert.deepEqual(c.errors, []);
  } finally { await c.ctx.close(); }
});

test('the first page is the same page whether it scrolls or not (`tall`, corner.js, moves nothing: no flip between two layouts), and fits with PLAY OFFLINE\'s answer under the buttons: the clip gives it the room', async () => {
  for (const [w, h] of [[844, 390], [844, 340], [667, 375], [1280, 720], [1024, 660], [390, 844]]) {
    const { ctx, page, errors } = await open({ ...(Math.min(w, h) < 500 ? PHONE : {}), viewport: { width: w, height: h } });
    try {
      const rects = () => page.evaluate(() => ['menuClip', 'btnSolo', 'btnOnline', 'btnTutorial', 'menuFoot'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }));
      const before = await rects();
      await page.evaluate(() => document.querySelector('#start .card.menu').classList.add('tall'));
      assert.deepEqual(await rects(), before, `${w}x${h}: nothing moves when the page is tall`);
      await page.evaluate(() => document.querySelector('#start .card.menu').classList.remove('tall'));
      // PLAY OFFLINE's answer (set-up: its longest line), then a few frames: the page fits, and stays as it is.
      await page.evaluate(() => { document.getElementById('homeOfflineMsg').textContent = 'Ready to play offline: everything is saved on this device ✓'; });
      const seen = await page.evaluate(() => new Promise((done) => {
        const c = document.querySelector('#start .card.menu'), out = []; let n = 0;
        const step = () => { out.push([c.classList.contains('tall'), c.scrollHeight - c.clientHeight, Math.round(document.getElementById('menuClip').getBoundingClientRect().width)]); if (++n < 12) requestAnimationFrame(step); else done(out); };
        requestAnimationFrame(() => requestAnimationFrame(step));
      }));
      assert.ok(seen.every(([tall, over]) => !tall && over <= 1), `${w}x${h}: with the answer the page fits, never tall: ${JSON.stringify(seen)}`);
      assert.equal(new Set(seen.map(s => s[2])).size, 1, `${w}x${h}: the clip one size, frame after frame: ${JSON.stringify(seen)}`);
      const l = await layout(page);
      assert.ok(inView(l.solo, l) && inView(l.online, l) && inView(l.foot, l) && l.clip.w >= 240, `${w}x${h}: the buttons and the footer on screen, the clip still a clip: ${JSON.stringify(l)}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});
