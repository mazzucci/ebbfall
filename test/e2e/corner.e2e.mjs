// Sound and full screen always in reach (src/client/corner.js): the screen's corner over every menu page, the lobby and
// every card over the game, the top bar's pair in a game with nothing over it; never both, never over a card's
// content. On iPad and iPhone the page never goes full screen: the button says how to add Ebbfall to the Home Screen.
// Run: npm run build && npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const PORTRAIT = { ...PHONE, viewport: { width: 412, height: 915 } };
const SMALL = { ...PHONE, viewport: { width: 667, height: 375 } };
const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/151.0.7922.57 Mobile/15E148 Safari/604.1' };
const IPAD_SAFARI = { ...IPAD, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15' };
/** iPadOS Safari says Macintosh, with five touch points (an emulated touch screen has one). */
const TOUCH_POINTS = () => { Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => 5 }); };
const IPHONE = { ...PHONE, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' };

/** Counts the page's asks for full screen (stood in for: a headless browser's real one resizes the page under the test). */
const COUNT_FULL = () => {
  window.fsAsked = 0;
  Element.prototype.requestFullscreen = function () { window.fsAsked++; return Promise.reject(new Error('(headless)')); };
};
/** A browser with no full-screen API for pages (iPhone). */
const NO_FULL = () => {
  window.fsAsked = 0;
  for (const k of ['requestFullscreen', 'webkitRequestFullscreen']) delete Element.prototype[k];
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
};

async function open(device, ...inits) {
  const ctx = await browserContext(device);
  for (const init of inits.length ? inits : [COUNT_FULL]) await ctx.addInitScript(init);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  const press = (sel) => (device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click());
  const shown = (sel) => page.locator(sel).isVisible();
  return { ctx, page, errors, press, shown, close: () => ctx.close() };
}

/** What overlaps the corner: the controls of what is on screen (and, for a card over the game, the card itself). */
const underCorner = (page, scope, card = '') => page.evaluate(([scope, card]) => {
  const c = document.getElementById('corner').getBoundingClientRect();
  const hit = (r) => r.width > 0 && r.height > 0 && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top;
  const els = [...document.querySelectorAll(`${scope} :is(button,a,input,select,canvas,h1,h2,[role=radio])`)].filter(e => e.offsetParent !== null && !e.hidden);
  const box = (e) => { if (!/^H\d$/.test(e.tagName)) return e.getBoundingClientRect(); const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); }; // (a heading: its words, not its line)
  const got = els.filter(e => hit(box(e))).map(e => e.id || e.textContent.trim().slice(0, 20));
  if (card && hit(document.querySelector(card).getBoundingClientRect())) got.push(`the card ${card}`);
  return { got, corner: [c.left, c.top, c.width, c.height].map(Math.round) };
}, [scope, card]);

/** The corner is up, one pair on screen, a finger wide each, clear of `scope`'s controls (and `card`). */
async function cornerOn(o, what, scope, card = '') {
  assert.ok(await o.shown('#corner') && await o.shown('#cornerSound') && await o.shown('#cornerFull'), `${what}: the corner's sound and full screen`);
  for (const id of ['cornerSound', 'cornerFull']) {
    const b = await o.page.locator(`#${id}`).boundingBox();
    assert.ok(b.width >= 40 && b.height >= 40, `${what}: #${id} a finger wide: ${JSON.stringify(b)}`);
  }
  const v = o.page.viewportSize(), c = await o.page.locator('#corner').boundingBox();
  assert.ok(c.x + c.width > v.width - 20 && c.y < 20, `${what}: top right: ${JSON.stringify(c)}`);
  assert.deepEqual(await o.page.$$eval('#top :is(#btnFull,#btnSound)', bs => bs.filter(b => b.checkVisibility({ visibilityProperty: true })).map(b => b.id)), [], `${what}: not the top bar's pair too`);
  const u = await underCorner(o.page, scope, card);
  assert.deepEqual(u.got, [], `${what}: nothing under the corner ${u.corner}`);
}
async function topBarOn(o, what) {
  assert.ok(await o.page.locator('#corner').isHidden(), `${what}: no corner`);
  assert.ok(await o.shown('#btnSound') && await o.shown('#btnFull'), `${what}: the top bar's pair`);
}

for (const [label, device] of [['desktop', DESKTOP], ['phone', PHONE], ['portrait', PORTRAIT], ['small phone', SMALL]]) {
  test(`${label}: the corner on every menu page, the lobby and every card over the game; the top bar's pair in the game`, async () => {
    const o = await open(device);
    const { page, press, shown } = o;
    try {
      // The menu's pages and the lobby.
      await cornerOn(o, 'home', '#menuHome');
      await press('#btnAbout'); await cornerOn(o, 'about', '#menuAbout');
      await press('#btnAboutBack'); await press('#btnHowTo'); await cornerOn(o, 'how to play (the menu\'s)', '#help', '#help .card');
      await press('#btnHelpClose'); await press('#btnOnline'); await cornerOn(o, 'the lobby', '#online');
      await press('#btnOnlineBack'); await press('#btnSolo'); await cornerOn(o, 'single player', '#menuSolo');
      // In the game: the top bar's own.
      await press('#btnStart');
      await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
      await page.evaluate(() => endfall.engine.disableAi());
      await topBarOn(o, 'a game');
      // The pause card, How to play over it, the leave card.
      await press('#btnPause'); await cornerOn(o, 'the pause card', '#pause', '#pause .card');
      const bar = await underCorner(page, '#top');
      assert.deepEqual(bar.got.filter(id => /^res/.test(id)), [], 'the top bar\'s figures clear of the corner');
      await press('#btnPauseHelp'); await cornerOn(o, 'how to play (the pause card\'s)', '#help', '#help .card');
      await press('#btnHelpClose'); await press('#btnResume'); await topBarOn(o, 'back to the game');
      await page.keyboard.press('Backspace'); await page.locator('#leave').waitFor();
      await cornerOn(o, 'the leave card', '#leave', '#leave .card');
      await press('#btnStay'); await topBarOn(o, 'kept playing');
      // The end card (a short game: the enemy's Core nearly down, our Troopers beside it).
      await page.evaluate(() => {
        const c = endfall.G.bldgs.find(b => b.team !== endfall.G.me && b.d.hq); endfall.engine.debugSetHp(c.id, 5);
        for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(0, 'trooper', c.x + i * 20, c.y + 90);
      });
      for (let i = 0; i < 30 && !(await page.evaluate(() => endfall.G.over)); i++) await page.evaluate(() => endfall.skip(2));
      const why = await page.evaluate(() => JSON.stringify({ over: endfall.G.over, t: endfall.G.time, core: endfall.G.bldgs.filter(b => b.d.hq).map(b => [b.team, b.hp, b.x, b.y]), tr: endfall.G.units.filter(u => u.type === 'trooper').map(u => [u.team, u.x, u.y, u.task.t]) }));
      await page.locator('#end').waitFor({ state: 'visible', timeout: 10000 }).catch(() => assert.fail(`the end card: ${why}`));
      await cornerOn(o, 'the end card', '#end', '#end .card');
      // Sound from the corner: one setting with the top bar's, remembered.
      await press('#cornerSound');
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'false', 'sound off from the corner');
      assert.equal(await page.evaluate(() => localStorage.getItem('endfall.muted')), '1', 'remembered');
      await press('#btnRematch');
      await page.waitForFunction(() => !endfall.G.over && document.getElementById('end').hidden);
      await topBarOn(o, 'the rematch');
      assert.equal(await page.locator('#btnSound').getAttribute('aria-pressed'), 'false', 'the top bar says off too');
      await press('#btnSound');
      assert.equal(await page.evaluate(() => localStorage.getItem('endfall.muted')), '0');
      await press('#btnPause');
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'true', 'the top bar\'s setting in the corner');
      await press('#btnQuit');
      await page.locator('#start').waitFor();
      await press('#cornerSound');
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'false', 'off after a reload');
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  });
}

test('desktop and Android: full screen in and out from the corner; PAUSE leaves it, BACK TO GAME restores it; the player\'s choice to leave wins until the button again', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const o = await open(device, () => {
      window.fsAsked = 0;
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (window.fs ? document.documentElement : null) });
      Element.prototype.requestFullscreen = async function () { window.fs = true; window.fsAsked++; document.dispatchEvent(new Event('fullscreenchange')); };
      document.exitFullscreen = async () => { window.fs = false; document.dispatchEvent(new Event('fullscreenchange')); };
      window.systemExit = () => { window.fs = false; document.dispatchEvent(new Event('fullscreenchange')); }; // (Esc, the system's gesture)
    });
    const { page, press } = o;
    const fs = () => page.evaluate(() => `${!!window.fs},${window.fsAsked}`);
    const startGame = async () => { await press('#btnStart'); await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden); };
    try {
      const btn = page.locator('#cornerFull');
      assert.equal(await btn.getAttribute('aria-label'), 'Full screen');
      await press('#btnSolo'); await startGame();
      assert.equal(await fs(), 'true,1', 'START goes full screen');
      assert.equal(await page.locator('#btnFull').getAttribute('aria-label'), 'Leave full screen', 'the top bar\'s says so');
      await press('#btnPause');
      assert.equal(await fs(), 'false,1', 'PAUSE leaves it');
      assert.equal(await btn.getAttribute('aria-label'), 'Full screen', 'the corner says so');
      await press('#btnResume');
      assert.equal(await fs(), 'true,2', 'BACK TO GAME: in again, as it was');
      // Out with the button: the player's choice.
      await press('#btnFull');
      assert.equal(await fs(), 'false,2', 'out with the top bar\'s button');
      await press('#btnPause'); await press('#btnResume');
      assert.equal(await fs(), 'false,2', 'BACK TO GAME leaves it out');
      await press('#btnPause'); await press('#btnQuit'); await startGame();
      assert.equal(await fs(), 'false,2', 'and so does START');
      // The button again: in, and the automatic entries are back.
      await press('#btnFull');
      assert.equal(await fs(), 'true,3', 'in with the button');
      await press('#btnPause'); await press('#btnResume');
      assert.equal(await fs(), 'true,4', 'BACK TO GAME restores it again');
      // Out by the system (Esc, the gesture): the player's choice too.
      await page.evaluate(() => window.systemExit());
      await press('#btnPause'); await press('#btnResume');
      assert.equal(await fs(), 'false,4', 'a system exit: BACK TO GAME leaves it out');
      await press('#btnPause'); await press('#btnQuit'); await startGame();
      assert.equal(await fs(), 'false,4', 'START too');
      await press('#btnPause'); await press('#btnQuit');
      await press('#cornerFull');
      assert.equal(await fs(), 'true,5', 'the corner\'s button clears it');
      await press('#cornerFull'); await press('#cornerFull');
      assert.equal(await fs(), 'true,6', 'out and in from the corner');
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  }
});

test('iPad (Safari and Chrome): the page never goes full screen; the button says how to add Ebbfall to the Home Screen', async () => {
  for (const device of [IPAD, IPAD_SAFARI]) {
    const o = await open(device, COUNT_FULL, TOUCH_POINTS);
    const { page, press, shown } = o;
    try {
      assert.ok(await page.locator('#iosTip').isHidden(), 'not the iPhone\'s line');
      await cornerOn(o, 'home', '#menuHome');
      await press('#cornerFull');
      assert.ok(await shown('#homeTip'), 'the Home Screen card');
      assert.match(await page.locator('#homeTip').textContent(), /For full screen on iPad, add Ebbfall to your Home Screen: tap Share\s*, then Add to Home Screen\. It opens as an app, full screen, and works offline\./);
      await cornerOn(o, 'the Home Screen card', '#homeTip', '#homeTip .card');
      await press('#btnHomeTipOk');
      assert.ok(await page.locator('#homeTip').isHidden(), 'OK closes it');
      await press('#btnSolo'); await press('#btnStart');
      await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
      assert.equal(await page.evaluate(() => window.fsAsked), 0, 'START does not ask for full screen');
      await topBarOn(o, 'a game');
      await press('#btnFull');
      assert.ok(await shown('#homeTip') && await shown('#corner'), 'the top bar\'s button: the same card, the corner over it');
      const t = await page.evaluate(() => endfall.G.time); await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => endfall.G.time), t, 'the game waits while it is open');
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#homeTip').isHidden() && await page.locator('#pause').isHidden(), 'Esc closes it (and opens nothing else)');
      await press('#btnPause'); await press('#btnResume');
      assert.equal(await page.evaluate(() => window.fsAsked), 0, 'nor BACK TO GAME');
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  }
  // Opened from the Home Screen: full screen already, so no button; the sound still there.
  const o = await open(IPAD, () => { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); });
  try {
    assert.ok(await o.shown('#cornerSound') && await o.page.locator('#cornerFull').isHidden(), 'the Home Screen app: sound only');
    await o.press('#btnSolo'); await o.press('#btnStart');
    await o.page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    assert.ok(await o.shown('#btnSound') && await o.page.locator('#btnFull').isHidden(), 'in the game too');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('iPhone (no full-screen API): the button opens the same card, and the first page keeps its line', async () => {
  const o = await open(IPHONE, NO_FULL);
  const { page, press, shown } = o;
  try {
    assert.ok(await shown('#iosTip'), 'the first page\'s iPhone line');
    await cornerOn(o, 'home', '#menuHome');
    await press('#cornerFull');
    assert.match(await page.locator('#homeTip').textContent(), /For full screen on iPhone, add Ebbfall to your Home Screen/);
    await press('#btnHomeTipOk');
    await press('#btnSolo'); await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    await topBarOn(o, 'a game');
    await press('#btnFull');
    assert.ok(await shown('#homeTip'), 'from the top bar too');
    await press('#btnHomeTipOk');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});
