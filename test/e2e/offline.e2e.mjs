// Install and offline on the built game (src/client/offline.js, tools/offline/sw.js): INSTALL where the browser offers
// it (a `beforeinstallprompt`, simulated here; the prompt on a tap) or where the Home Screen is the way (the card), on
// the first page, About and the pause card; PLAY OFFLINE otherwise and once installed, which hears from the service
// worker that the whole game is saved (saving it first if need be; or that offline play is not available, where
// service workers are blocked); the manifest's app icons are served at the sizes they claim.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

async function open(device, opts = {}) {
  const ctx = await browserContext({ ...device, ...opts }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  const press = (sel) => (device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click());
  return { ctx, page, errors, press };
}

/** The browser offers to install: a `beforeinstallprompt` whose prompt() is counted (userChoice: when `choose` runs). */
const offer = (page) => page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  window.prompted = 0;
  e.prompt = async () => { window.prompted++; };
  e.userChoice = new Promise(r => { window.choose = r; });
  dispatchEvent(e);
  return e.defaultPrevented; // (the game shows its own button instead of the browser's banner)
});

/** The first page's button reads `label` (it changes on its own when an offer comes or goes). */
const reads = (page, label) => page.waitForFunction((l) => document.getElementById('btnInstall').textContent === l, label, { timeout: 10000 });
/** PLAY OFFLINE pressed (`sel`): every line it shows on the way, once it is done (it asks again while still saving). */
async function playOffline(page, press, sel, msg) {
  await page.evaluate((msg) => { window.seen = []; new MutationObserver(() => window.seen.push(document.getElementById(msg).textContent)).observe(document.getElementById(msg), { childList: true, characterData: true, subtree: true }); }, msg);
  await press(sel);
  await page.waitForFunction((sel) => !document.querySelector(sel).disabled, sel, { timeout: 90000 });
  return page.evaluate(() => window.seen);
}

for (const [name, device] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`the first page: INSTALL while the browser offers it (its prompt on a tap), PLAY OFFLINE otherwise and once installed (${name})`, { timeout: 120000 }, async () => {
    const { ctx, page, errors, press } = await open(device);
    try {
      const btn = page.locator('#btnInstall');
      assert.ok(await btn.isVisible());
      await reads(page, 'PLAY OFFLINE'); // (no offer, no Home Screen to add to: the offline check)
      assert.equal(await offer(page), true);
      await reads(page, 'INSTALL');
      await press('#btnInstall');
      await page.waitForFunction(() => window.prompted === 1);
      assert.equal(await btn.textContent(), 'INSTALL', 'still INSTALL while the prompt is open');
      await page.evaluate(() => window.choose({ outcome: 'dismissed' }));
      await reads(page, 'PLAY OFFLINE'); // an offer prompts once
      assert.equal(await offer(page), true);
      await reads(page, 'INSTALL'); // the browser offers again
      await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
      await reads(page, 'PLAY OFFLINE');
      const sc = await page.locator('#start .card.menu').evaluate(e => [e.scrollHeight, e.clientHeight]);
      assert.ok(sc[0] <= sc[1] + 1, `the first page fits: ${sc}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('iPhone and iPad (no install prompt): INSTALL opens the Add to Home Screen card, never by itself', { timeout: 120000 }, async () => {
  for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1']) {
    const { ctx, page, errors, press } = await open(PHONE, { userAgent: ua });
    try {
      await reads(page, 'INSTALL');
      await page.waitForTimeout(500);
      assert.ok(await page.locator('#homeTip').isHidden(), 'no card by itself');
      await press('#btnInstall');
      assert.ok(await page.locator('#homeTip').isVisible(), 'the card');
      assert.match(await page.locator('#homeTip').textContent(), /Add Ebbfall to your Home Screen: tap Share\s*, then Add to Home Screen\. It opens as an app, full screen, and plays offline\./);
      await press('#btnHomeTipOk');
      await press('#btnAbout');
      assert.ok(await page.locator('#btnAboutInstall').isVisible() && await page.locator('#btnOffline').isVisible(), 'About: INSTALL and PLAY OFFLINE');
      await press('#btnAboutInstall');
      assert.ok(await page.locator('#homeTip').isVisible(), 'the same card from About');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('INSTALL on the About page and in the pause card too, one offer for all; none in the installed app', { timeout: 180000 }, async () => {
  const { ctx, page, errors, press } = await open(PHONE);
  try {
    assert.equal(await page.locator('.install:visible').count(), 0, 'no offer: no INSTALL anywhere');
    assert.equal(await offer(page), true);
    await press('#btnAbout');
    assert.ok(await page.locator('#btnAboutInstall').isVisible(), 'on the About page');
    await press('#btnAboutBack'); await press('#btnSolo'); await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    await press('#btnPause');
    assert.ok(await page.locator('#btnPauseInstall').isVisible(), 'in the pause card');
    await press('#btnPauseInstall');
    await page.waitForFunction(() => window.prompted === 1);
    await page.evaluate(() => window.choose({ outcome: 'accepted' }));
    await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
    await page.locator('#btnPauseInstall').waitFor({ state: 'hidden' });
    assert.ok(await page.locator('#pause').isVisible(), 'the card stays');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
  // Opened as the installed app: an offer (a browser may still make one) shows nothing.
  const app = await browserContext(PHONE);
  try {
    await app.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); });
    const p = await app.newPage();
    await p.goto(baseUrl(), { waitUntil: 'networkidle' }); await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    assert.equal(await offer(p), true);
    await reads(p, 'PLAY OFFLINE');
    const seen = await playOffline(p, (sel) => p.locator(sel).tap(), '#btnInstall', 'homeOfflineMsg');
    assert.equal(seen.at(-1), 'Ready to play offline: everything is saved on this device ✓', `the installed app: ready (${seen.join(' | ')})`);
    await p.locator('#btnAbout').tap();
    assert.equal(await p.locator('.install:visible').count(), 0, 'installed: no INSTALL');
  } finally { await app.close(); }
});

test('PLAY OFFLINE on the About page: saving, then everything saved; a file gone missing is saved again', { timeout: 180000 }, async () => {
  const { ctx, page, errors, press } = await open(PHONE);
  try {
    await press('#btnAbout');
    assert.equal(await page.locator('#btnOffline').textContent(), 'PLAY OFFLINE');
    const total = await page.evaluate(async () => { const s = await (await fetch('sw.js')).text(); return JSON.parse(s.match(/const FILES = (\[.*\]);/)[1]).length; });
    let seen = await playOffline(page, press, '#btnOffline', 'offlineMsg'); // (the service worker installs from the test server: it asks until it is done)
    assert.equal(seen.at(-1), 'Ready to play offline: everything is saved on this device ✓', seen.join(' | '));
    const fits = await page.evaluate(() => { const c = document.querySelector('#start .card.menu'); return c.scrollHeight <= c.clientHeight; });
    assert.ok(fits, 'the About page fits without scrolling');
    // A file goes missing from the store (as if the install had been cut short): saving, how far, then saved again.
    await page.evaluate(async () => { const c = await caches.open((await caches.keys()).find(k => k.startsWith('endfall-'))); await c.delete('index.html'); });
    seen = await playOffline(page, press, '#btnOffline', 'offlineMsg');
    assert.ok(seen.includes(`Saving for offline… ${Math.floor((100 * (total - 1)) / total)}%`), `how far: ${seen.join(' | ')}`);
    assert.equal(seen.at(-1), 'Ready to play offline: everything is saved on this device ✓', seen.join(' | '));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('PLAY OFFLINE where service workers are blocked: not available in this browser', { timeout: 120000 }, async () => {
  const { ctx, page, press } = await open(DESKTOP, { serviceWorkers: 'block' });
  try {
    await press('#btnAbout');
    await press('#btnOffline');
    await page.waitForFunction(() => !document.getElementById('btnOffline').disabled, null, { timeout: 20000 });
    assert.equal(await page.locator('#offlineMsg').textContent(), "Offline play isn't available in this browser.");
  } finally { await ctx.close(); }
});

test('the manifest names PNG app icons of 192 and 512 pixels and a maskable one, served at those sizes', { timeout: 60000 }, async () => {
  const { ctx, page } = await open(DESKTOP);
  try {
    const icons = await page.evaluate(async () => {
      const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
      return Promise.all(m.icons.map(async (i) => {
        const img = new Image(); img.src = new URL(i.src, document.baseURI).href; await img.decode();
        return { ...i, got: `${img.naturalWidth}x${img.naturalHeight}` };
      }));
    });
    const png = icons.filter(i => i.type === 'image/png');
    for (const i of png) assert.equal(i.got, i.sizes, i.src);
    assert.ok(png.some(i => i.sizes === '192x192' && i.purpose === 'any'));
    assert.ok(png.some(i => i.sizes === '512x512' && i.purpose === 'any'));
    assert.ok(png.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  } finally { await ctx.close(); }
});
