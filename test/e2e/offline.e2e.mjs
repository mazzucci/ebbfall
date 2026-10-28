// Install and offline on the built game (src/client/offline.js, tools/offline/sw.js): the menu's INSTALL appears only
// when the browser offers to install (a `beforeinstallprompt`, simulated here) and is gone once installed; the About
// page's CHECK OFFLINE hears from the service worker that the whole game is stored (or that offline play is not
// available, where service workers are blocked); the manifest's app icons are served at the sizes they claim.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

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

for (const [name, device] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`INSTALL shows only while the browser offers it, prompts on a tap and goes once installed (${name})`, { timeout: 120000 }, async () => {
    const { ctx, page, errors, press } = await open(device);
    try {
      const btn = page.locator('#btnInstall');
      assert.equal(await btn.isVisible(), false, 'hidden by default');
      assert.equal(await offer(page), true);
      assert.equal(await btn.isVisible(), true, 'shown when offered');
      await press('#btnInstall');
      await page.waitForFunction(() => window.prompted === 1);
      assert.equal(await btn.isVisible(), true, 'still there while the prompt is open');
      await page.evaluate(() => window.choose({ outcome: 'dismissed' }));
      await btn.waitFor({ state: 'hidden' }); // an offer prompts once
      assert.equal(await offer(page), true);
      await btn.waitFor({ state: 'visible' }); // the browser offers again
      await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
      await btn.waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('CHECK OFFLINE on the About page: the whole game is stored, the version the page shows', { timeout: 120000, engines: true }, async () => {
  const { ctx, page, errors, press } = await open(PHONE);
  try {
    await press('#btnAbout');
    const build = (await page.locator('#buildId').textContent()).trim();
    const total = await page.evaluate(async () => { const s = await (await fetch('sw.js')).text(); return JSON.parse(s.match(/const FILES = (\[.*\]);/)[1]).length; });
    let text = '';
    for (let i = 0; i < 30 && !text.startsWith('Ready'); i++) { // (the service worker installs from the test server: ask until it is done)
      if (i) await page.waitForTimeout(1000);
      await press('#btnOffline');
      await page.waitForFunction(() => !document.getElementById('btnOffline').disabled, null, { timeout: 20000 });
      text = await page.locator('#offlineMsg').textContent();
    }
    assert.equal(text, `Ready to play offline: all ${total} files stored. Version ${build}.`);
    const fits = await page.evaluate(() => { const c = document.querySelector('#start .card.menu'); return c.scrollHeight <= c.clientHeight; });
    assert.ok(fits, 'the About page fits without scrolling');
    // A file goes missing from the store (as if the install had been cut short): not ready, and how far it got.
    await page.evaluate(async () => { const c = await caches.open((await caches.keys()).find(k => k.startsWith('endfall-'))); await c.delete('index.html'); });
    await press('#btnOffline');
    await page.waitForFunction(() => document.getElementById('offlineMsg').textContent.startsWith('Not yet'), null, { timeout: 20000 });
    assert.equal(await page.locator('#offlineMsg').textContent(), `Not yet: ${total - 1} of ${total} files stored. Stay online a moment and check again.`);
    // Checking again finds it stored again (asking fetched what was missing; the refetch may take a moment).
    text = '';
    for (let i = 0; i < 20 && !text.startsWith('Ready'); i++) {
      if (i) await page.waitForTimeout(500);
      await press('#btnOffline');
      await page.waitForFunction(() => !document.getElementById('btnOffline').disabled, null, { timeout: 20000 });
      text = await page.locator('#offlineMsg').textContent();
    }
    assert.match(text, /^Ready/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('CHECK OFFLINE where service workers are blocked: not available in this browser', { timeout: 120000 }, async () => {
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
