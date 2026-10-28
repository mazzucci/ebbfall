// The game in an ordinary browser tab, its bars on screen (not full screen, not the Home Screen app): an iPad's Safari
// (its bars take some 90 px) and a phone's, landscape and upright. One design for every device, laid out by the
// viewport's size: the HUD and every card's buttons inside the screen (a card taller than it scrolls inside itself),
// the page never scrolls, the map fills the room, and it all fits again when the bars collapse mid-game.
// Run: npm run build && npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, newGame, browserContext, baseUrl } from './harness.mjs';

before(start);
after(stop);

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const touch = (w, h, ua) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...(ua ? { userAgent: ua } : {}) });
// [label, the tab with its bars, the tab once they collapse]
const TABS = [
  ['iPad landscape', touch(1180, 730, IPAD_UA), { width: 1180, height: 820 }],
  ['iPad upright', touch(820, 1100, IPAD_UA), { width: 820, height: 1180 }],
  ['phone landscape', touch(844, 340), { width: 844, height: 390 }],
  ['phone upright', touch(412, 800), { width: 412, height: 915 }],
];

/** The page is not scrolled and cannot be: nothing reaches past the viewport. */
const pageStill = (page) => page.evaluate(() => {
  const s = document.scrollingElement;
  return { x: scrollX, y: scrollY, over: s.scrollHeight - innerHeight, wide: s.scrollWidth - innerWidth };
});
/** Every visible control of `scope` that is not wholly inside the viewport, once scrolled into view (a card that does
 *  not fit scrolls). */
async function outside(page, scope) {
  const n = await page.locator(`${scope} :is(button,input):visible`).count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const el = page.locator(`${scope} :is(button,input):visible`).nth(i);
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox(), v = page.viewportSize();
    if (b && (b.x < -0.5 || b.y < -0.5 || b.x + b.width > v.width + 0.5 || b.y + b.height > v.height + 0.5)) out.push(`${await el.evaluate(e => e.id || e.textContent.trim().slice(0, 16))} ${JSON.stringify(b)}`);
  }
  return out;
}
/** The game's screen fits the viewport: the map fills the room under the top bar, the HUD's pieces inside. */
async function gameFits(d, what) {
  const got = await d.eval(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e || e.offsetParent === null || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    const cv = document.getElementById('game');
    const hud = document.getElementById('hud'), band = getComputedStyle(hud).position !== 'fixed' ? r('hud') : null; // (a narrow screen: the panels in a band below the map)
    return { vw: innerWidth, vh: innerHeight, stage: r('stage'), band, top: r('top'), canvas: [cv.clientWidth, cv.clientHeight], stageBox: [document.getElementById('stage').clientWidth, document.getElementById('stage').clientHeight],
      parts: Object.fromEntries(['top', 'minimap', 'info', 'cmd', 'btnBox', 'btnHome', 'btnPause', 'btnSound'].map(id => [id, r(id)]).filter(([, b]) => b)) };
  });
  for (const [id, [l, t, rt, b]] of Object.entries(got.parts)) assert.ok(l >= -0.5 && t >= -0.5 && rt <= got.vw + 0.5 && b <= got.vh + 0.5, `${what}: #${id} inside ${got.vw}x${got.vh}: ${[l, t, rt, b].map(Math.round)}`);
  const [l, t, r, b] = got.stage;
  const floor = got.band ? got.band[1] : got.vh; // (the band's top, or the screen's bottom)
  assert.ok(l <= 16 && r >= got.vw - 16 && b >= floor - 16 && b <= floor + 0.5 && t <= got.parts.top[3] + 12 && (!got.band || got.band[3] >= got.vh - 16), `${what}: the map fills the room: ${got.stage.map(Math.round)} in ${got.vw}x${got.vh}${got.band ? `, the band ${got.band.map(Math.round)}` : ''}`);
  assert.ok(Math.abs(got.canvas[0] - got.stageBox[0]) <= 2 && Math.abs(got.canvas[1] - got.stageBox[1]) <= 2, `${what}: the canvas fills the stage: ${got.canvas} vs ${got.stageBox}`);
  assert.deepEqual(await pageStill(d.page), { x: 0, y: 0, over: 0, wide: 0 }, `${what}: the page does not scroll`);
}
const frames = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150)))));

for (const [label, device, collapsed] of TABS) {
  test(`${label} in a browser tab (${device.viewport.width}x${device.viewport.height}): the menus, the game and its cards fit, and fit again when the bars collapse`, async () => {
    // The menu's pages and the lobby: every button reachable and inside the screen; the page still.
    const ctx = await browserContext(device), page = await ctx.newPage();
    await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('(a tab)')); });
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
      const tap = (sel) => page.locator(sel).tap();
      for (const [open, scope, back] of [[null, '#menuHome'], ['#btnSolo', '#menuSolo', '#btnSoloBack'], ['#btnAbout', '#menuAbout', '#btnAboutBack'], ['#btnHowTo', '#help', '#btnHelpClose'], ['#btnOnline', '#online', '#btnOnlineBack']]) {
        if (open) await tap(open);
        assert.deepEqual(await outside(page, scope), [], `${label}, ${scope}: the buttons inside the screen`);
        assert.deepEqual(await pageStill(page), { x: 0, y: 0, over: 0, wide: 0 }, `${label}, ${scope}: the page does not scroll`);
        if (back) await tap(back);
      }
    } finally { await ctx.close(); }

    // A tab, not full screen: START's ask is turned down (as a browser may), so the bars stay.
    const d = await newGame(device, 1, 4242, { ai: false, init: () => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('(a tab)')); } });
    try {
      const s = await d.state(), core = s.bldgs.find(b => b.team === 0 && b.type === 'core');
      await d.clickEntity(core.id); // (the console and the command card up)
      await d.page.locator('#cmd button').first().waitFor();
      await gameFits(d, `${label}, the game`);
      // A drag on the map pans it, never the page.
      const st = await d.page.locator('#stage').boundingBox();
      await d.page.touchscreen.tap(st.x + st.width / 2, st.y + st.height / 3);
      await d.page.mouse.wheel(0, 400);
      assert.deepEqual(await pageStill(d.page), { x: 0, y: 0, over: 0, wide: 0 }, `${label}: a wheel does not scroll the page`);
      // The bars collapse (or come back): the layout follows, the middle of the map stays the middle.
      const mid = () => d.eval(() => { const v = endfall.view, c = endfall.cam; return [c.x + v.w / 2 / c.zoom, c.y + v.h / 2 / c.zoom]; });
      const before = await mid();
      for (const size of [collapsed, device.viewport]) {
        await d.page.setViewportSize(size); await frames(d.page);
        await gameFits(d, `${label}, resized to ${size.width}x${size.height}`);
        const after = await mid();
        assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 40, `${label}: the map's middle stays: ${before.map(Math.round)} -> ${after.map(Math.round)}`);
      }
      // The cards over the game: their buttons inside the screen.
      await d.page.locator('#btnPause').tap();
      assert.deepEqual(await outside(d.page, '#pause'), [], `${label}: the pause card's buttons`);
      await d.page.locator('#btnPauseHelp').tap();
      assert.deepEqual(await outside(d.page, '#help'), [], `${label}: How to play's`);
      await d.page.locator('#btnHelpClose').tap(); await d.page.locator('#btnResume').tap();
      await d.eval(() => {
        const c = endfall.G.bldgs.find(b => b.team !== endfall.G.me && b.d.hq); endfall.engine.debugSetHp(c.id, 5);
        for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(0, 'trooper', c.x + i * 20, c.y + 90);
      });
      for (let i = 0; i < 30 && !(await d.eval(() => endfall.G.over)); i++) await d.skip(2);
      await d.page.locator('#end').waitFor({ state: 'visible', timeout: 10000 });
      assert.deepEqual(await outside(d.page, '#end'), [], `${label}: the end card's buttons`);
      await d.page.setViewportSize(collapsed); await frames(d.page);
      assert.deepEqual(await outside(d.page, '#end'), [], `${label}: and once the bars collapse`);
      assert.deepEqual(await pageStill(d.page), { x: 0, y: 0, over: 0, wide: 0 });
      assert.ok(await d.page.locator('#homeTip').isHidden(), 'the Home Screen card never opens by itself');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}
