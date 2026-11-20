// The site with its Worker blocked, as a tripped Workers spending limit leaves it (Cloudflare's error 1103 for every
// Worker request: harness.mjs `site.blocked`): the game's page (/, and a room's plain link), the docs home and a docs
// page load from the files alone, with the site's security headers, and a single-player game starts through the menu
// and plays; the service worker installs (every file it stores is a file); no page error, no failed request, and
// nothing reaches the Worker but the docs' videos (the one kind of file it answers, with byte ranges: site/media.js),
// which fail, their posters (files) left in their place. The deployed routing itself: test/site-worker.test.js.
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, browserContext, baseUrl, site, DESKTOP, ENGINE } from './harness.mjs';

before(async () => { await start(); site.blocked = true; });
after(stop);

/** A docs video (the Worker's: blocked, it fails, as it would on the site). */
const VIDEO = /\/docs\/media\/.*\.mp4$/;
/** A page that records its errors, failed requests and error responses (but a docs video's). */
async function watched(ctx) {
  const p = await ctx.newPage(), problems = [];
  p.on('pageerror', e => problems.push(`error: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !VIDEO.test(m.location()?.url || '')) problems.push(`console: ${m.text()}`); });
  p.on('requestfailed', r => { if (!/cloudflareinsights/.test(r.url()) && !VIDEO.test(r.url())) problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`); });
  p.on('response', r => { if (r.status() >= 400 && !VIDEO.test(r.url())) problems.push(`${r.status()}: ${r.url()}`); });
  return { p, problems };
}

test('Workers blocked (1103): the game\'s page, the docs and a single-player game load from the files alone, with no error', { engines: true, timeout: 300000 }, async () => {
  site.worker.length = 0;
  const ctx = await browserContext(DESKTOP);
  try {
    const { p, problems } = await watched(ctx);
    // Each page loaded in full before the next (a navigation away aborts what is still loading, and some engines say so).
    for (const [path, title] of [['', /^Ebbfall: a classic RTS/], ['?room=WGNJKL', /^Ebbfall: a classic RTS/], ['docs/', /Ebbfall/], ['docs/kingdom/', /Kingdom/], ['docs/kingdom', /Kingdom/]]) {
      const res = await p.goto(baseUrl() + path, { waitUntil: 'networkidle' });
      assert.equal(res.status(), 200, path);
      assert.match(await p.title(), title, path);
      const h = await res.allHeaders();
      for (const k of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) assert.ok(h[k], `${path}: ${k}`);
      if (!path.startsWith('docs')) await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 }); // (the game loaded, behind the menu)
      else await p.evaluate(() => Promise.all([...document.images].map(i => (i.loading = 'eager', i.decode().catch(() => {}))))); // (every image, the lazy ones too)
    }
    // The game's page: loaded, and its service worker installed from the files (Chromium; elsewhere if it has one).
    await p.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const sw = await p.evaluate(() => Promise.race([navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false, new Promise(r => setTimeout(() => r(false), 60000))]));
    if (ENGINE === 'chromium') assert.ok(sw, 'the service worker installed');
    if (sw) {
      await p.reload({ waitUntil: 'networkidle' });
      await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
      assert.ok(await p.evaluate(() => !!navigator.serviceWorker?.controller), 'the page under the service worker');
      // A page stored through a redirect (selftest.html, served at /selftest) opens from the cache, not a redirect.
      const res = await p.goto(`${baseUrl()}selftest.html`, { waitUntil: 'load' });
      assert.equal(res.status(), 200);
      assert.ok(res.fromServiceWorker(), 'the device check, from the service worker');
    }
    assert.deepEqual(problems, [], problems.join('\n'));
  } finally { await ctx.close(); }

  // A single-player game through the menu (SINGLE PLAYER, START GAME), half a minute of it.
  const d = await newGame(DESKTOP, 1);
  try {
    await d.eval(() => endfall.skip(30));
    const s = await d.state();
    assert.ok(s.units.length > 0 && !s.over, 'the game runs');
    assert.deepEqual(d.errors, [], d.errors.join('\n'));
  } finally { await d.close(); }
  assert.deepEqual(site.worker.filter(r => !VIDEO.test(r)), [], 'nothing reached the Worker but the docs\' videos');
});
