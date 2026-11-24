// The new look's switch (?art=new, src/client/gl/newart.js): nothing of it is asked for without it; with it and nothing
// built, a missing page or a broken index, the game is today's, with no error; and the same link plays the same game with
// and without it (?seed=, ?map=), so two tabs side by side show the same place. (The packs themselves are not in the repo.)
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
  const hash = await page.evaluate(() => { endfall.engine.disableAi(); const a = []; for (let t = 0; t < 5; t++) { endfall.skip(2); a.push(endfall.engine.stateHash() >>> 0); } return { seed: endfall.map.seed ?? null, start: endfall.G.bldgs.length, a }; });
  await page.waitForTimeout(300);
  await ctx.close();
  return { asked, errors, hash };
}
const json = (o) => ({ contentType: 'application/json', body: JSON.stringify(o) });

test('without ?art=new nothing of the new look is asked for', { timeout: 120000 }, async () => {
  const p = await play('?seed=4242&map=4');
  assert.deepEqual([p.asked, p.errors], [[], []]);
});

test('with it and nothing built, a missing page or a broken index: today\'s art, no error', { timeout: 240000 }, async () => {
  for (const [what, routes] of [['nothing built', {}], ['a missing page', { 'art/new/index\\.json': json({ groups: { bldg: { pages: ['nope.json'] }, land: {}, x: null } }) }], ['an index that is not JSON', { 'art/new/index\\.json': { contentType: 'application/json', body: '<html>' } }]]) {
    const p = await play('?seed=4242&map=4&art=new', routes);
    assert.deepEqual(p.errors, [], what);
    assert.ok(p.asked.length >= 1, `${what}: the index was asked for`);
  }
});

test('the same link plays the same game with and without ?art=new', { timeout: 180000 }, async () => {
  const a = await play('?seed=4242&map=4'), b = await play('?seed=4242&map=4&art=new');
  assert.deepEqual(a.hash.a, b.hash.a, 'state hashes');
  assert.equal(a.hash.start, b.hash.start);
});
