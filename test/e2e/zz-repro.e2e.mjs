// TEMP diagnosis (to be removed before merge): the CSP sweep's docs step in WebKit, many times, timed, with what is
// still in flight when a load does not settle.
import { before, after } from 'node:test';
import { test, start, stop, browserContext, baseUrl, DESKTOP, ENGINE } from './harness.mjs';

before(start); after(stop);
const N = +(process.env.N || 12);
const log = (s) => process.stderr.write(`repro (${ENGINE}): ${s}\n`);
const PAGES = ['docs/', 'docs/how-to-play/', 'docs/kingdom/', 'docs/expedition/', 'docs/about/', 'docs/feedback/'];
const bounded = (p, ms) => Promise.race([p.then(() => 'done', (e) => `threw ${e.message.split('\n')[0]}`), new Promise(r => setTimeout(() => r('HUNG'), ms))]);

test('repro: the docs step, many times', { engines: true, skip: ENGINE === 'webkit' ? false : 'webkit only', timeout: 1500000 }, async () => {
  const t0 = Date.now();
  for (let i = 0; i < N && Date.now() - t0 < 1200000; i++) {
    const ctx = await browserContext(DESKTOP), p = await ctx.newPage();
    const open = new Map();
    ctx.on('request', r => open.set(r, Date.now()));
    ctx.on('requestfinished', r => open.delete(r)); ctx.on('requestfailed', r => open.delete(r));
    const inflight = () => [...open].map(([r, t]) => `${r.url().replace(baseUrl(), '/')} (${r.resourceType()}, ${Date.now() - t} ms)`).join(', ') || 'none';
    const video = () => bounded(p.evaluate(() => { const v = document.querySelector('.clip video'); return v ? JSON.stringify({ rs: v.readyState, ns: v.networkState, err: v.error?.code, paused: v.paused, src: v.currentSrc }) : 'no video'; }).then(s => log(`${i} video ${s}`)), 5000);
    try {
      await p.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
      const sw = await p.evaluate(() => Promise.race([navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false, new Promise(r => setTimeout(() => r(false), 30000))]));
      if (sw) await p.reload({ waitUntil: 'networkidle' });
      log(`${i} sw ${sw} controlled ${await p.evaluate(() => !!navigator.serviceWorker?.controller)}`);
      await p.goto(`${baseUrl()}voice-lab.html`, { waitUntil: 'networkidle' });
      for (const path of [...PAGES, 'docs/']) {
        const t = Date.now();
        const r = await bounded(p.goto(baseUrl() + path, { waitUntil: 'networkidle', timeout: 30000 }), 60000);
        log(`${i} ${path} ${r} ${Date.now() - t} ms${r === 'done' ? '' : `; in flight: ${inflight()}`}`);
        if (r !== 'done') { await video(); break; }
        if (path === 'docs/') await video();
      }
      const t = Date.now();
      const r = await bounded(p.locator('.clip video').scrollIntoViewIfNeeded({ timeout: 10000 }).then(() => p.waitForFunction(() => { const v = document.querySelector('.clip video'); return v.readyState >= 2 && !v.controls; }, null, { timeout: 30000 })), 60000);
      log(`${i} clip ${r} ${Date.now() - t} ms`);
      if (r !== 'done') await video();
    } finally {
      const t = Date.now();
      log(`${i} close ${await bounded(ctx.close(), 30000)} ${Date.now() - t} ms`);
    }
  }
});
