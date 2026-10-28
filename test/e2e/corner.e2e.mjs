// Sound and full screen always in reach (src/client/corner.js): the screen's corner over every menu page, the lobby and
// every card over the game, the top bar's pair in a game with nothing over it; never both, never over a card's
// content. On iPad and iPhone the page never goes full screen: the button says how to add Ebbfall to the Home Screen.
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import { launchChromium, GL_ARGS } from '../../tools/chromium.mjs';
import assert from 'node:assert/strict';
import { test, ENGINE, start, stop, browserContext, baseUrl, board, DESKTOP, PHONE, notIn, IPHONE as IPHONE_PROFILE } from './harness.mjs';

before(start);
after(stop);

const PORTRAIT = { ...PHONE, viewport: { width: 412, height: 915 } };
const SMALL = { ...PHONE, viewport: { width: 667, height: 375 } };
const TINY = { ...PHONE, viewport: { width: 568, height: 320 } };
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

/** What overlaps the corner: the controls of what is on screen (and, for a card over the game, the card itself), at
 *  every scroll of a card taller than the screen (its top, its bottom and between). */
const underCorner = (page, scope, card = '') => page.evaluate(([scope, card]) => {
  const c = document.getElementById('corner').getBoundingClientRect();
  const hit = (r) => r.width > 0 && r.height > 0 && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top;
  const box = (e) => { if (!/^H\d$/.test(e.tagName)) return e.getBoundingClientRect(); const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); }; // (a heading: its words, not its line)
  const got = new Set();
  const look = () => {
    const els = [...document.querySelectorAll(`${scope} :is(button,a,input,select,canvas,h1,h2,[role=radio])`)].filter(e => e.offsetParent !== null && !e.hidden);
    for (const e of els) if (hit(box(e))) got.add(e.id || e.textContent.trim().slice(0, 20));
    if (card && hit(document.querySelector(card).getBoundingClientRect())) got.add(`the card ${card}`);
  };
  const scrollers = [...document.querySelectorAll('.card')].filter(e => e.offsetParent !== null && e.scrollHeight > e.clientHeight + 1);
  look();
  for (const sc of scrollers) {
    for (let y = 0; y <= sc.scrollHeight - sc.clientHeight + sc.clientHeight / 3; y += sc.clientHeight / 3) { sc.scrollTop = y; look(); }
    sc.scrollTop = 0;
  }
  return { got: [...got], corner: [c.left, c.top, c.width, c.height].map(Math.round), scrolled: scrollers.length };
}, [scope, card]);

/** The corner is up, one pair on screen, a finger wide each, clear of `scope`'s controls (and `card`). `sound: false`:
 *  the pause card's corner, full screen without the sound button (the card pauses the sound itself). */
async function cornerOn(o, what, scope, card = '', { sound = true } = {}) {
  assert.ok(await o.shown('#corner') && await o.shown('#cornerFull'), `${what}: the corner's full screen`);
  assert.equal(await o.shown('#cornerSound'), sound, `${what}: ${sound ? 'the corner\'s sound' : 'no sound button'}`);
  for (const id of sound ? ['cornerSound', 'cornerFull'] : ['cornerFull']) {
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

for (const [label, device] of [['desktop', DESKTOP], ['phone', PHONE], ['portrait', PORTRAIT], ['small phone', SMALL], ['smallest phone', TINY]]) {
  test(`${label}: the corner on every menu page, the lobby and every card over the game; the top bar's pair in the game`, { engines: device === DESKTOP }, async () => {
    const o = await open(device);
    const { page, press, shown } = o;
    try {
      // The menu's pages and the lobby.
      await cornerOn(o, 'home', '#menuHome');
      await press('#btnAbout'); await cornerOn(o, 'about', '#menuAbout');
      await press('#btnAboutBack'); await press('#btnHowTo'); await cornerOn(o, 'how to play (the menu\'s)', '#help', '#help .card');
      await press('#btnHelpClose'); await press('#btnOnline'); await cornerOn(o, 'the lobby', '#online');
      // The join page says how it works, in two lines at most, and fits.
      const how = await page.locator('#onlineHow').evaluate(e => ({ shown: e.offsetParent !== null, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)), fits: e.closest('.card').scrollHeight <= e.closest('.card').clientHeight + 1 }));
      assert.deepEqual(how, { shown: true, lines: how.lines, fits: true }, 'how it works: shown, the page fits');
      assert.ok(how.lines <= 2, `how it works in ${how.lines} lines`);
      await press('#btnOnlineBack'); await press('#btnSolo'); await cornerOn(o, 'single player', '#menuSolo');
      // In the game: the top bar's own.
      await press('#btnStart');
      await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
      await page.evaluate(() => endfall.engine.disableAi());
      await topBarOn(o, 'a game');
      // The pause card, How to play over it, the leave card.
      await press('#btnPause'); await cornerOn(o, 'the pause card', '#pause', '#pause .card', { sound: false });
      const bar = await underCorner(page, '#top');
      assert.deepEqual(bar.got.filter(id => /^res/.test(id)), [], 'the top bar\'s figures clear of the corner');
      await press('#btnPauseHelp'); await cornerOn(o, 'how to play (the pause card\'s)', '#help', '#help .card', { sound: false }); // (still paused)
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
      await press('#btnPause'); await press('#btnQuit');
      await page.locator('#start').waitFor();
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'true', 'the top bar\'s setting in the corner');
      await press('#cornerSound');
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'false', 'off after a reload');
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  });
}

test('desktop and Android: full screen in and out from the corner; PAUSE leaves it, BACK TO GAME restores it; leaving with the button wins until the button again, a system exit does not', { skip: notIn(['webkit'], IPHONE_PROFILE) }, async () => {
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
      // Out by the system (Esc, the back gesture, the page in the background): not a choice.
      await page.evaluate(() => window.systemExit());
      await press('#btnPause'); await press('#btnResume');
      assert.equal(await fs(), 'false,4', 'a system exit: not full screen when paused, so not after either');
      await press('#btnPause'); await press('#btnQuit'); await startGame();
      assert.equal(await fs(), 'true,5', 'but START goes back in');
      await press('#btnPause'); // (out: PAUSE's own exit)
      await press('#cornerFull');
      assert.equal(await fs(), 'true,6', 'in from the corner, over the pause card');
      await press('#cornerFull');
      assert.equal(await fs(), 'false,6', 'and out with it: a choice');
      await press('#btnQuit'); await startGame();
      assert.equal(await fs(), 'false,6', 'START leaves it out');
      await press('#btnPause'); await press('#btnQuit');
      await press('#cornerFull');
      assert.equal(await fs(), 'true,7', 'the corner\'s button clears it');
      await startGame();
      assert.equal(await fs(), 'true,7', 'START: in already');
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  }
});

test('iPad (Safari and Chrome): the page never goes full screen; the button says how to add Ebbfall to the Home Screen', async () => {
  for (const device of [IPAD, IPAD_SAFARI]) {
    const o = await open(device, COUNT_FULL, TOUCH_POINTS);
    const { page, press, shown } = o;
    try {
      await cornerOn(o, 'home', '#menuHome');
      await press('#cornerFull');
      assert.ok(await shown('#homeTip'), 'the Home Screen card');
      assert.match(await page.locator('#homeTip').textContent(), /Add to Home Screen\s*Add Ebbfall to your Home Screen: tap Share\s*, then Add to Home Screen\. It opens as an app, full screen, and plays offline\./);
      await cornerOn(o, 'the Home Screen card', '#homeTip', '#homeTip .card');
      await press('#btnHomeTipOk');
      assert.ok(await page.locator('#homeTip').isHidden(), 'OK closes it');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'cornerFull', 'the focus back on the button that opened it');
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

test('iPhone (no full-screen API): the button opens the same card; no line of its own on the first page', async () => {
  const o = await open(IPHONE, NO_FULL);
  const { page, press, shown } = o;
  try {
    assert.equal(await page.locator('#iosTip').count(), 0, 'one design: INSTALL and the card say it');
    await cornerOn(o, 'home', '#menuHome');
    await press('#cornerFull');
    assert.match(await page.locator('#homeTip').textContent(), /Add Ebbfall to your Home Screen: tap Share/);
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

/** Full screen stood in for (a headless browser's real one resizes the page under the test), and an exit by the system. */
const FAKE_FULL = () => {
  window.fsAsked = 0;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (window.fs ? document.documentElement : null) });
  Element.prototype.requestFullscreen = async function () { window.fs = true; window.fsAsked++; document.dispatchEvent(new Event('fullscreenchange')); };
  document.exitFullscreen = async () => { window.fs = false; document.dispatchEvent(new Event('fullscreenchange')); };
  window.systemExit = () => { window.fs = false; document.dispatchEvent(new Event('fullscreenchange')); };
};

test('a replay: PAUSE leaves full screen, DONE goes back in to the end card; REMATCH goes full screen as START does', { skip: notIn(['webkit'], IPHONE_PROFILE) }, async () => {
  const o = await open(PHONE, FAKE_FULL);
  const { page, press } = o;
  const fs = () => page.evaluate(() => `${!!window.fs},${window.fsAsked}`);
  try {
    await press('#btnSolo'); await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    assert.equal(await fs(), 'true,1');
    await page.evaluate(() => { endfall.skip(5); endfall.engine.concede(); }); // (a short game: a replay of it, untouched by set-up calls)
    await page.locator('#end').waitFor({ state: 'visible', timeout: 10000 });
    await press('#btnWatch');
    await page.locator('#replayBar').waitFor();
    await press('#btnPause');
    assert.ok(await page.locator('#btnPauseDone').isVisible());
    assert.equal(await fs(), 'false,1', 'PAUSE leaves it');
    await press('#btnPauseDone');
    await page.locator('#end').waitFor();
    assert.equal(await fs(), 'true,2', 'DONE: back to the end card, full screen again');
    await page.evaluate(() => window.systemExit());
    await press('#btnRematch');
    await page.waitForFunction(() => !endfall.G.over && document.getElementById('end').hidden);
    assert.equal(await fs(), 'true,3', 'REMATCH goes back in (a system exit is no choice)');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('an installed app: the button where it can do something (a standalone window), not where the app is full screen already', async () => {
  const mode = (m) => new Function(`const q = window.matchMedia.bind(window); window.matchMedia = (s) => (/display-mode/.test(s) ? { matches: ${m === 'fullscreen' ? '/fullscreen/.test(s)' : '/standalone/.test(s)'}, media: s, addEventListener() {}, removeEventListener() {} } : q(s));`);
  for (const [m, shown] of [['standalone', true], ['fullscreen', false]]) {
    const o = await open(PHONE, FAKE_FULL, mode(m));
    try {
      assert.equal(await o.shown('#cornerFull'), shown, `display-mode ${m}`);
      if (shown) { await o.press('#cornerFull'); assert.equal(await o.page.evaluate(() => window.fs), true, 'and it goes full screen'); }
      assert.ok(await o.shown('#cornerSound'));
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  }
});

test('single player\'s board, from the top of the page, with two and with eight players (eight sides, then four against four) clear of the corner on small phones (scrolled too)', async () => {
  for (const device of [TINY, SMALL, PORTRAIT]) {
    const o = await open(device);
    try {
      const seats = board(o.page);
      await o.press('#btnSolo');
      await cornerOn(o, `${device.viewport.width}x${device.viewport.height}, a duel`, '#menuSolo');
      for (let n = 3; n <= 8; n++) await seats.add();
      await cornerOn(o, `${device.viewport.width}x${device.viewport.height}, eight sides`, '#menuSolo');
      for (const [i, t] of [[1, 0], [2, 0], [3, 0], [5, 4], [6, 4], [7, 4]]) await seats.side(i, t);
      await cornerOn(o, `${device.viewport.width}x${device.viewport.height}, four against four`, '#menuSolo');
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  }
});

test('the pause card pauses the sound: no sound button in its corner (full screen stays), the audio suspended while it is up and running after BACK TO GAME, P, Esc, RESTART or LEAVE GAME; the sound setting untouched; a replay\'s too', { engines: true }, async (t) => {
  const o = await open(DESKTOP);
  // (Esc, RESTART and LEAVE GAME below too)
  const { page, press, shown } = o;
  // (headless Chromium has a stand-in audio device; WebKit and Firefox here may have none: their context never runs,
  // "Failed to start the audio device", and only the card's side is checked there)
  let device = true;
  const audio = async (want, what) => {
    if (!device) return;
    await page.waitForFunction((w) => endfall.status().audio === w, want, { timeout: 5000 })
      .catch(async () => assert.fail(`${what}: the audio ${await page.evaluate(() => endfall.status().audio)}, not ${want}`));
  };
  const setting = () => page.evaluate(() => [endfall.status().muted, localStorage.getItem('endfall.muted')]);
  try {
    await press('#btnSolo'); await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden); // (the AI on: a game a replay can show)
    if (ENGINE !== 'chromium') device = await page.waitForFunction(() => endfall.status().audio === 'running', null, { timeout: 5000 }).then(() => true, () => false);
    if (!device) t.diagnostic(`no audio device in this ${ENGINE}: the audio's state not checked`);
    await audio('running', 'a game started by a click');
    const before = await setting();
    await press('#btnPause');
    assert.ok(await shown('#cornerFull') && !(await shown('#cornerSound')), 'the corner: full screen, no sound button');
    await audio('suspended', 'the pause card up');
    assert.deepEqual(await setting(), before, 'the sound setting untouched');
    await press('#btnResume');
    await audio('running', 'BACK TO GAME');
    assert.ok(await shown('#btnSound'), 'the top bar\'s sound button again');
    await page.keyboard.press('p'); await audio('suspended', 'P');
    await page.keyboard.press('p'); await audio('running', 'P again');
    assert.deepEqual(await setting(), before, 'the sound setting still untouched');
    // Muted, the card does not switch the sound on, nor off for good.
    await press('#btnSound');
    await press('#btnPause'); await press('#btnResume');
    assert.deepEqual(await setting(), [true, '1'], 'still off after the card');
    await press('#btnSound'); await audio('running', 'switched on again');
    assert.deepEqual(await setting(), [false, '0']);
    // Every way off the card brings the sound back: Esc, RESTART, LEAVE GAME.
    await press('#btnPause'); await audio('suspended', 'the card again');
    await page.keyboard.press('Escape'); await page.locator('#pause').waitFor({ state: 'hidden' });
    await audio('running', 'Esc');
    await press('#btnPause'); await audio('suspended', 'the card again');
    await press('#btnRestart'); await page.waitForFunction(() => endfall.G.time < 1 && document.getElementById('pause').hidden);
    await audio('running', 'RESTART');
    await press('#btnPause'); await audio('suspended', 'the card again');
    await press('#btnQuit'); await page.locator('#start').waitFor();
    await audio('running', 'LEAVE GAME');
    assert.ok(await shown('#cornerSound'), 'the menu\'s corner has its sound button');
    assert.deepEqual(await setting(), [false, '0'], 'the setting untouched by them all');
    await press('#btnStart'); // (LEAVE GAME goes back to the single-player page)
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    // A replay's pause card: the same.
    await page.evaluate(() => { endfall.skip(5); endfall.engine.concede(); });
    await page.locator('#end').waitFor({ state: 'visible', timeout: 10000 });
    assert.ok(await shown('#cornerSound'), 'the end card has its sound button');
    await press('#btnWatch'); await page.locator('#replayBar').waitFor();
    await press('#btnPause');
    assert.ok(!(await shown('#cornerSound')), 'a replay\'s pause card: no sound button');
    await audio('suspended', 'a replay\'s pause card');
    await press('#btnResume'); await audio('running', 'BACK TO REPLAY');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('under a strict autoplay policy, nothing opens the sound before the first click, and the clicks get it running (no script touches the page first: an evaluate would count as the user\'s activation)', { chromium: 'the --autoplay-policy switch is Chromium\'s' }, async () => {
  const browser = await launchChromium([...GL_ARGS, '--autoplay-policy=user-gesture-required']);
  try {
    const ctx = await browser.newContext(DESKTOP);
    await ctx.addInitScript(COUNT_FULL);
    // Every AudioContext the page makes, logged as it is made: its state and whether the user had acted yet; then its states.
    // (The log is the guard: Chromium's headless shell starts a context made before any gesture 'running' even under this
    // policy, so the state alone would not catch a context opened too early.)
    await ctx.addInitScript(() => {
      const log = window.audioLog = [], A = window.AudioContext;
      window.AudioContext = class extends A {
        constructor(...a) {
          super(...a);
          log.push({ made: this.state, active: navigator.userActivation.hasBeenActive });
          this.addEventListener('statechange', () => log.push({ state: this.state }));
        }
      };
    });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
    await page.locator('#btnSolo').click(); // (the first thing that touches the page)
    await page.locator('#btnStart').click();
    await page.locator('#start').waitFor({ state: 'hidden', timeout: 60000 });
    await page.locator('#btnPause').waitFor();
    await page.waitForFunction(() => endfall.status().audio === 'running', null, { timeout: 5000 })
      .catch(async () => assert.fail(`the clicks did not get the sound running: ${JSON.stringify(await page.evaluate(() => [endfall.status().audio, window.audioLog]))}`));
    const log = await page.evaluate(() => window.audioLog);
    assert.equal(log.filter(e => 'made' in e).length, 1, `one context: ${JSON.stringify(log)}`);
    assert.equal(log[0].active, true, `made only once the user had acted: ${JSON.stringify(log)}`);
    // The pause card under the same policy: suspended, and running again after BACK TO GAME.
    await page.locator('#btnPause').click();
    await page.waitForFunction(() => endfall.status().audio === 'suspended', null, { timeout: 5000 });
    await page.locator('#btnResume').click();
    await page.waitForFunction(() => endfall.status().audio === 'running', null, { timeout: 5000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
