// The new look's switch (?art=new, src/client/gl/newart.js): nothing of it is asked for without it; with it and nothing
// built, a missing page or a broken index, the game is today's, with no error; and the same link plays the same game with
// and without it (?seed=, ?map=), so two tabs side by side show the same place. The packs are public/art/new/.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, DESKTOP } from './harness.mjs';

before(start);
after(stop);

async function play(query, routes = {}) {
  const ctx = await browserContext({ ...DESKTOP, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [], asked = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { const p = new URL(r.url()).pathname; if (p.includes('/art/new/')) asked.push(p); });
  for (const [u, o] of Object.entries(routes)) await page.route(new RegExp(u), r => r.fulfill(o));
  await page.goto(baseUrl() + query, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  await page.locator('#btnSolo').click(); await page.locator('#btnStart').click();
  await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden, null, { timeout: 60000 });
  // (the AI left on, whole games alike: each hash at a tick both games reach by fixed steps, the page's own loop not
  // between, so however many ticks passed before this call does not show)
  const hash = await page.evaluate(() => { const a = []; for (const t of [900, 1200]) { if (endfall.G.tick > t) throw new Error(`already at tick ${endfall.G.tick}`); while (endfall.G.tick < t) endfall.skip(1 / 30); a.push(endfall.engine.stateHash() >>> 0); } return { a }; });
  await page.waitForTimeout(300);
  await ctx.close();
  return { asked, errors, hash };
}
const json = (o) => ({ contentType: 'application/json', body: JSON.stringify(o) });

test('without ?art=new nothing of the new look is asked for', { timeout: 120000 }, async () => {
  const p = await play('?seed=4242&map=4');
  assert.deepEqual([p.asked, p.errors], [[], []]);
});

test('with it and no index, a missing page or a broken index: today\'s art, no error', { timeout: 240000 }, async () => {
  for (const [what, routes] of [['no index', { 'art/new/index\\.json': { status: 404, body: '' } }], ['a missing page', { 'art/new/index\\.json': json({ groups: { bldg: { pages: ['nope.json'] }, land: {}, x: null } }) }], ['an index that is not JSON', { 'art/new/index\\.json': { contentType: 'application/json', body: '<html>' } }]]) {
    const p = await play('?seed=4242&map=4&art=new', routes);
    assert.deepEqual(p.errors, [], what);
    assert.ok(p.asked.length >= 1, `${what}: the index was asked for`);
  }
});

test('the same link plays the same game with and without ?art=new', { timeout: 180000 }, async () => {
  const a = await play('?seed=4242&map=4'), b = await play('?seed=4242&map=4&art=new');
  assert.deepEqual(a.hash.a, b.hash.a, 'state hashes');
});

test('with it, the packs that are there load, with no error and no failed request', { timeout: 180000 }, async () => {
  const p = await play('?seed=4242&map=4&art=new');
  assert.deepEqual(p.errors, []);
  assert.ok(p.asked.some(f => f.endsWith('/bldg-0.webp')), `the buildings' page: ${p.asked}`);
});
