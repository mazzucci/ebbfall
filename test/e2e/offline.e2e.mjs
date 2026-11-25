// PLAY OFFLINE on the built game (src/client/offline.js, tools/offline/sw.js): the install offer where the browser makes
// one (a `beforeinstallprompt`, simulated here; the prompt on a tap) or where the Home Screen is the way (the card), on
// the first page and the pause card, always under that name; otherwise and once installed it hears from the service
// worker that the whole game is saved (saving it first if need be; or that offline play is not available, where
// service workers are blocked); the manifest's app icons are served at the sizes they claim.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test, start, stop, browserContext, baseUrl, site, ENGINE, DESKTOP, PHONE } from './harness.mjs';

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

/** The first page's button, PLAY OFFLINE whatever it does, is at the install offer or the offline check: its title says
 *  which, leading with playing offline (it changes on its own when an offer comes or goes). */
const offers = async (page, offer) => {
  await page.waitForFunction((o) => document.getElementById('btnInstall').title.startsWith('Play Ebbfall offline: add it') === o, offer, { timeout: 10000 });
  assert.equal(await page.locator('#btnInstall').textContent(), 'PLAY OFFLINE', 'the same name either way');
};
/** PLAY OFFLINE pressed (`sel`): every line it shows on the way, once it is done (it asks again while still saving). */
async function playOffline(page, press, sel, msg) {
  await page.evaluate((msg) => { window.seen = []; new MutationObserver(() => window.seen.push(document.getElementById(msg).textContent)).observe(document.getElementById(msg), { childList: true, characterData: true, subtree: true }); }, msg);
  await press(sel);
  await page.waitForFunction((sel) => !document.querySelector(sel).disabled, sel, { timeout: 90000 });
  return page.evaluate(() => window.seen);
}

for (const [name, device] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`the first page: PLAY OFFLINE makes the browser's install offer while there is one (its prompt on a tap), the offline check otherwise and once installed (${name})`, { timeout: 120000 }, async () => {
    const { ctx, page, errors, press } = await open(device);
    try {
      const btn = page.locator('#btnInstall');
      assert.ok(await btn.isVisible());
      await offers(page, false); // (no offer, no Home Screen to add to: the offline check)
      assert.equal(await offer(page), true);
      await offers(page, true);
      await press('#btnInstall');
      await page.waitForFunction(() => window.prompted === 1);
      await offers(page, true); // (still the offer while the prompt is open)
      await page.evaluate(() => window.choose({ outcome: 'dismissed' }));
      await offers(page, false); // an offer prompts once
      assert.equal(await offer(page), true);
      await offers(page, true); // the browser offers again
      await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
      await offers(page, false);
      const sc = await page.locator('#start .card.menu').evaluate(e => [e.scrollHeight, e.clientHeight]);
      assert.ok(sc[0] <= sc[1] + 1, `the first page fits: ${sc}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('iPhone and iPad (no install prompt): PLAY OFFLINE opens the Add to Home Screen card, never by itself', { timeout: 120000 }, async () => {
  for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1']) {
    const { ctx, page, errors, press } = await open(PHONE, { userAgent: ua });
    try {
      await offers(page, true);
      await page.waitForTimeout(500);
      assert.ok(await page.locator('#homeTip').isHidden(), 'no card by itself');
      await press('#btnInstall');
      assert.ok(await page.locator('#homeTip').isVisible(), 'the card');
      assert.match(await page.locator('#homeTip').textContent(), /Add Ebbfall to your Home Screen: tap Share\s*, then Add to Home Screen\. It opens as an app, full screen, and plays offline\./);
      await press('#btnHomeTipOk');
      assert.ok(await page.locator('#homeTip').isHidden(), 'OK closes it');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('PLAY OFFLINE in the pause card too while there is an offer, one for all; none in the installed app', { timeout: 180000 }, async () => {
  const { ctx, page, errors, press } = await open(PHONE);
  try {
    assert.equal(await page.locator('.install:visible').count(), 0, 'no offer: none in the pause card');
    assert.equal(await offer(page), true);
    await offers(page, true);
    await press('#btnSolo'); await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    await press('#btnPause');
    assert.ok(await page.locator('#btnPauseInstall').isVisible(), 'in the pause card');
    assert.equal(await page.locator('#btnPauseInstall').textContent(), 'PLAY OFFLINE');
    assert.match(await page.locator('#btnPauseInstall').getAttribute('title'), /^Play Ebbfall offline: add it/);
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
    await offers(p, false);
    const seen = await playOffline(p, (sel) => p.locator(sel).tap(), '#btnInstall', 'homeOfflineMsg');
    assert.equal(seen.at(-1), 'Ready to play offline: everything is saved on this device ✓', `the installed app: ready (${seen.join(' | ')})`);
    assert.equal(await p.locator('.install:visible').count(), 0, 'installed: none in the pause card');
  } finally { await app.close(); }
});

test('PLAY OFFLINE on the first page (nothing to install): saving, then everything saved; a file gone missing is saved again', { timeout: 180000, engines: true }, async () => {
  const { ctx, page, errors, press } = await open(PHONE);
  try {
    assert.equal(await page.locator('#btnInstall').textContent(), 'PLAY OFFLINE');
    const total = await page.evaluate(async () => { const s = await (await fetch('sw.js')).text(); return JSON.parse(s.match(/const FILES = (\[.*\]);/)[1]).length; });
    let seen = await playOffline(page, press, '#btnInstall', 'homeOfflineMsg'); // (the service worker installs from the test server: it asks until it is done)
    assert.equal(seen.at(-1), 'Ready to play offline: everything is saved on this device ✓', seen.join(' | '));
    const fits = await page.evaluate(() => { const c = document.querySelector('#start .card.menu'); return c.scrollHeight <= c.clientHeight; });
    assert.ok(fits, 'the first page fits without scrolling');
    // A file goes missing from the store (as if the install had been cut short): saving, how far, then saved again.
    await page.evaluate(async () => { const c = await caches.open((await caches.keys()).find(k => k.startsWith('endfall-'))); await c.delete('index.html'); });
    seen = await playOffline(page, press, '#btnInstall', 'homeOfflineMsg');
    assert.ok(seen.includes(`Saving for offline… ${Math.floor((100 * (total - 1)) / total)}%`), `how far: ${seen.join(' | ')}`);
    assert.equal(seen.at(-1), 'Ready to play offline: everything is saved on this device ✓', seen.join(' | '));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

/** Wait until the service worker's cache `name` (any of the game's, '') is the only one (the old one goes as the new
 *  worker takes over, its own whole) and no worker is on its way; its name and each file's sha256, by its address's path. */
async function stored(page, name = '') {
  const ready = () => page.evaluate(async (name) => {
    const ks = (await caches.keys()).filter(k => k.startsWith('endfall-')), r = await navigator.serviceWorker.getRegistration();
    return ks.length === 1 && ks[0].includes(name) && !!r?.active && !r.installing && !r.waiting; // (its state not asked: WebKit goes on saying 'activating' after the page moves to the new version)
  }, name).catch(() => false); // (the page may be moving on to the new version)
  for (const end = Date.now() + 120000; !(await ready());) { assert.ok(Date.now() < end, 'the service worker installed'); await new Promise(r => setTimeout(r, 250)); }
  await page.waitForLoadState('networkidle');
  return page.evaluate(async () => {
    const name = (await caches.keys()).find(k => k.startsWith('endfall-')), c = await caches.open(name), files = {};
    for (const req of await c.keys()) files[new URL(req.url).pathname] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await c.match(req)).arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
    return { name, files };
  });
}

test('a first visit downloads each file once (the service worker\'s copy a 304), a second nothing, and an update only what it changed, its cache holding its own files alone', { timeout: 180000, engines: true }, async () => {
  const dist = (f) => readFileSync(process.env.ENDFALL_DIST ? `${process.env.ENDFALL_DIST}/${f}` : new URL(`../../dist/${f}`, import.meta.url));
  const sent = () => site.sent.splice(0), sum = (l) => l.reduce((n, [, , b]) => n + b, 0);
  sent();
  const { ctx, page } = await open(DESKTOP);
  try {
    const first = await stored(page), one = sent(), list = JSON.parse(dist('sw.js').toString().match(/const FILES = (\[.*\]);/)[1]);
    assert.ok(list.length > 20 && Object.keys(first.files).length >= list.length - 1, `every file stored: ${Object.keys(first.files).length} of ${list.length}`); // (./ and / are one address)
    const twice = Object.entries(Object.groupBy(one.filter(([, s]) => s === 200), ([p]) => p)).filter(([, l]) => l.length > 1 && l[0][2] > 2000).map(([p, l]) => `${p} ${l.length}x`);
    // (Playwright's WebKit keeps no HTTP cache the worker can read: there every file is sent again, and only what is
    // stored is checked)
    const cached = ENGINE !== 'webkit';
    if (cached) assert.deepEqual(twice.filter(p => p.startsWith('/art/')), [], 'no art sent twice');
    // A second visit: from the store.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const two = sent();
    assert.ok(sum(two) < 20000, `a second visit sends next to nothing: ${JSON.stringify(two.filter(([, , b]) => b))}`);
    // A deploy changes one art file and one script (as hashed names do, its page with it): the new worker installs.
    const art = list.filter(f => /^art\/.*\.webp$/.test(f)).sort((a, b) => dist(a).length - dist(b).length)[0];
    const page1 = Buffer.concat([dist('index.html'), Buffer.from('<!-- the next build -->\n')]), art1 = Buffer.concat([dist(art), Buffer.from('\n')]);
    site.deployed = new Map([['/index.html', page1], [`/${art}`, art1], ['/sw.js', Buffer.from(dist('sw.js').toString().replace(/endfall-[0-9a-f]{12}/, 'endfall-00000000beef'))]]);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); }).catch(() => {}); // (the page may move on to the new version before the answer comes back, in Firefox with a larger file; `stored` waits for the new one)
    const next = await stored(page, '00000000beef'), three = sent();
    const sha = (b) => createHash('sha256').update(b).digest('hex');
    assert.equal(next.files['/'], sha(page1), 'the new build\'s page');
    assert.equal(next.files[`/${art}`], sha(art1), 'its art');
    for (const f of list.filter(f => !['./', 'index.html', art].includes(f))) assert.equal(next.files[`/${f}`] ?? next.files[`/${f.replace(/\.html$/, '')}`], sha(dist(f)), `${f}: the deployed bytes`);
    if (cached) assert.ok(sum(three) < sum(one) / 10, `an update sends little: ${sum(three)} bytes, the first visit ${sum(one)}`);
    const body = three.filter(([p, s]) => s === 200 && p.startsWith('/art/')).map(([p]) => p);
    if (cached) assert.deepEqual([...new Set(body)], [`/${art}`], 'of the art, only the changed file was sent');
  } finally { site.deployed = null; await ctx.close(); }
});

test('PLAY OFFLINE where service workers are blocked: not available in this browser', { timeout: 120000 }, async () => {
  const { ctx, page, press } = await open(DESKTOP, { serviceWorkers: 'block' });
  try {
    await offers(page, false);
    await press('#btnInstall');
    await page.waitForFunction(() => !document.getElementById('btnInstall').disabled, null, { timeout: 20000 });
    assert.equal(await page.locator('#homeOfflineMsg').textContent(), "Offline play isn't available in this browser.");
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
