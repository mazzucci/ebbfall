// SHARE after a victory and the challenge link it shares (src/client/share.js, challenge.js, menu.js): the end card
// offers SHARE after a win against the AI only (not the guided first game) and fits on small screens with it; on a
// desktop with no share sheet it copies the link (LINK COPIED in the button, then SHARE again), with one it shares the
// link with a line made from the setup, and a cancelled sheet says nothing; the link opens the single-player page on
// that setup (board, map, its seed and starts), a line saying so, the address cleaned, nothing saved until the player
// changes something, and START plays the same game; a link that is not a good one opens the plain menu.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, board, browserContext, baseUrl, DESKTOP } from './harness.mjs';
import { encode } from '../../src/client/challenge.js';
import { MAPS } from '../../src/client/maps.js';

before(start);
after(stop);

/** A page of the game at `query`, once it has loaded; its errors collected. */
async function open(query = '', device = DESKTOP, { init = null, permissions = [] } = {}) {
  const ctx = await browserContext(device);
  if (permissions.length) await ctx.grantPermissions(permissions, { origin: new URL(baseUrl()).origin });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl() + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  return { ctx, page, errors };
}
/** The game as it starts: each seat's race and team, the map's size, every Core where it stands. */
const startOf = (page) => page.evaluate(() => ({ races: endfall.G.factions.slice(), teams: endfall.G.teams.slice(), w: endfall.map.w,
  cores: endfall.G.bldgs.filter(b => b.d.hq).map(b => [b.team, b.x, b.y]).sort((p, q) => p[0] - q[0]) }));
/** Win at once: the AIs stopped, each enemy Core nearly down with our Troopers beside it. */
async function win(page) {
  await page.evaluate(() => {
    endfall.engine.disableAi();
    for (const c of endfall.G.bldgs.filter(b => b.d.hq && b.team !== endfall.G.me)) {
      endfall.engine.debugSetHp(c.id, 5);
      for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(endfall.G.me, 'trooper', c.x + i * 20, c.y + 90);
    }
  });
  for (let i = 0; i < 40 && !(await page.evaluate(() => endfall.G.over)); i++) await page.evaluate(() => endfall.skip(2));
  await page.locator('#end').waitFor({ state: 'visible', timeout: 10000 });
}
/** Every visible button of the end card not wholly on screen (scrolled into view: a card taller than the screen
 *  scrolls). */
async function offScreen(page) {
  const out = [], all = page.locator('#end button:visible');
  for (let i = 0; i < await all.count(); i++) {
    const el = all.nth(i); await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox(), v = page.viewportSize();
    if (!b || b.x < -0.5 || b.y < -0.5 || b.x + b.width > v.width + 0.5 || b.y + b.height > v.height + 0.5) out.push(`${await el.textContent()} ${JSON.stringify(b)}`);
  }
  return out;
}

test('SHARE after a victory: the link copied, or shared with its line; it opens the same game, ready to START', { chromium: 'the clipboard, by permission' }, async () => {
  // No share sheet here (a desktop's): SHARE copies.
  const a = await open('', DESKTOP, { init: () => { delete Navigator.prototype.share; }, permissions: ['clipboard-read', 'clipboard-write'] });
  const b2 = await browserContext(DESKTOP);
  try {
    const { page } = a, sb = board(page);
    await page.locator('#btnSolo').click();
    // You against two AIs (a Brutal Vael, a Hard Human), on a random 96x96 map: a seed and a character of its own.
    await sb.add(); await sb.race(1, 'vael'); await sb.diff(1, 3); await sb.diff(2, 2);
    const random96 = MAPS.findIndex(m => m.random && m.size === 96);
    await page.selectOption('#mapSel', String(random96));
    assert.doesNotMatch(await page.locator('#soloNote').textContent(), /CHALLENGE/, 'no challenge line on an ordinary setup');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    const first = await startOf(page);
    await win(page);
    assert.equal(await page.locator('#result').textContent(), 'VICTORY');
    assert.ok(await page.locator('#btnShareWin').isVisible(), 'SHARE after a victory');
    assert.equal(await page.locator('#btnShareWin').textContent(), 'SHARE');
    const secs = await page.evaluate(() => Math.max(1, Math.round(endfall.G.time)));
    // The end card fits with it, whatever the screen.
    for (const size of [[667, 375], [844, 390], [412, 915], [568, 320]]) {
      await page.setViewportSize({ width: size[0], height: size[1] });
      assert.deepEqual(await offScreen(page), [], `the end card's buttons on ${size.join('x')}`);
    }
    await page.setViewportSize(DESKTOP.viewport);
    // Copied: the button says so, then SHARE again.
    await page.locator('#btnShareWin').click();
    await page.waitForFunction(() => document.getElementById('btnShareWin').textContent === 'LINK COPIED', null, { timeout: 5000 });
    const url = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(url, new RegExp(`^${baseUrl().replace(/[.?]/g, '\\$&')}\\?vs=1\\.[0-9a-z.]+[0-9a-z]$`), url);
    await page.waitForFunction(() => document.getElementById('btnShareWin').textContent === 'SHARE', null, { timeout: 5000 });
    // A share sheet (a phone's): the link and a line made from the setup.
    await page.evaluate(() => { window.shared = []; navigator.share = async (d) => { window.shared.push(d); }; });
    await page.locator('#btnShareWin').click();
    await page.waitForFunction(() => window.shared.length === 1);
    const shared = await page.evaluate(() => window.shared[0]);
    assert.equal(shared.url, url);
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    assert.match(shared.text, new RegExp(`^I beat 2 AIs up to Brutal on [A-Z][a-z]+ [A-Z][a-z]+ in ${clock} in Ebbfall\\. Can you\\?$`), shared.text);
    assert.match(shared.title, /^Can you beat this\? 1 vs 2 AIs up to Brutal on /);
    assert.equal(await page.locator('#btnShareWin').textContent(), 'SHARE', 'shared: nothing to say');
    // The sheet closed without sharing: nothing said, nothing copied.
    await page.evaluate(() => navigator.clipboard.writeText('before'));
    await page.evaluate(() => { navigator.share = async () => { throw new DOMException('cancelled', 'AbortError'); }; });
    await page.locator('#btnShareWin').click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#btnShareWin').textContent(), 'SHARE');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'before');
    assert.deepEqual(a.errors, []);

    // The link, on another device (nothing saved there): the single-player page on that setup, its line, the address clean.
    const page2 = await b2.newPage(), errors2 = [];
    page2.on('pageerror', e => errors2.push(e.message));
    await page2.goto(url, { waitUntil: 'networkidle' });
    await page2.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    assert.ok(await page2.locator('#menuSolo').isVisible(), 'the single-player page');
    assert.equal(await page2.locator('#soloNote').textContent(), `CHALLENGE · won in ${clock} · beat it`);
    assert.equal(await page2.evaluate(() => location.search), '', 'the address cleaned');
    assert.equal(await page2.locator('#mapSel').inputValue(), String(random96));
    const sb2 = board(page2);
    assert.deepEqual(await sb2.spots(), ['YOU', 'AI 1', 'AI 2', '+', '', '', '', '']);
    const tokens = (p) => p.$$eval('#soloBoard .tok', ts => ts.map(t => t.getAttribute('aria-label').split(':')[0])); // (name, race, level, side)
    assert.deepEqual(await tokens(page2), await tokens(page), 'the same board as the winner\'s');
    const own = [null, '0']; // (what a first visit saves: no board, the first map)
    assert.deepEqual(await page2.evaluate(() => [localStorage.getItem('endfall.seats'), localStorage.getItem('endfall.map')]), own, 'nothing of the challenge saved');
    // START: the same game (the same map, races, sides and starts).
    await page2.locator('#btnStart').click();
    await page2.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    assert.deepEqual(await startOf(page2), first, 'the same start');
    assert.deepEqual(await page2.evaluate(() => [localStorage.getItem('endfall.seats'), localStorage.getItem('endfall.map')]), own, 'a challenge played is not saved over the player\'s own setup');
    assert.deepEqual(errors2, []);
  } finally { await a.ctx.close(); await b2.close(); }
});

test('a challenge link opens its setup; a change makes it the player\'s; a bad link opens the plain menu', { engines: true }, async () => {
  const code = encode({ map: MAPS.findIndex(m => m.name === 'Dust Quarter'), side: 2, secs: 754, spots: [{ race: 'vael', team: 0 }, null, { race: 'humans', team: 1, diff: 3 }, { race: 'vael', team: 1, diff: 1 }] });
  const g = await open(`?vs=${code}&seed=7`);
  try {
    const { page } = g;
    assert.ok(await page.locator('#menuSolo').isVisible());
    assert.equal(await page.locator('#soloNote').textContent(), 'CHALLENGE · won in 12:34 · beat it');
    assert.equal(await page.evaluate(() => location.search), '?seed=7', 'only the challenge leaves the address');
    assert.deepEqual(await board(page).spots(), ['YOU', '+', 'AI 2', 'AI 3', '', '', '', '']);
    assert.deepEqual(await board(page).sides(), [['YOU'], ['AI 2', 'AI 3']]);
    assert.equal(await page.locator('#mapSel').inputValue(), String(MAPS.findIndex(m => m.name === 'Dust Quarter')));
    // A change: the challenge is over (no line), the setup the player's (saved, its map too).
    await board(page).diff(3, 2);
    assert.equal(await page.locator('#soloNote').textContent(), '');
    const saved = await page.evaluate(() => [JSON.parse(localStorage.getItem('endfall.seats')), localStorage.getItem('endfall.map')]);
    assert.deepEqual(saved[0].slice(0, 4), [{ race: 'vael', team: 0 }, null, { race: 'humans', team: 1, diff: 3 }, { race: 'vael', team: 1, diff: 2 }]);
    assert.equal(saved[1], String(MAPS.findIndex(m => m.name === 'Dust Quarter')));
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
  for (const bad of ['2.4.2.ky.v00xh13v11', `${code}x`, `${code}.`, '%3Cscript%3Ealert(1)%3C%2Fscript%3E', '1.0.0.ky.h00v03']) {
    const b = await open(`?vs=${bad}`);
    try {
      assert.ok(await b.page.locator('#menuHome').isVisible(), `${bad}: the first page`);
      assert.equal(await b.page.evaluate(() => location.search), '', `${bad}: the address cleaned`);
      await b.page.locator('#btnSolo').click();
      assert.equal(await b.page.locator('#soloNote').textContent(), '', `${bad}: no challenge`);
      assert.deepEqual(await board(b.page).spots(), ['YOU', 'AI 1', '+', '', '', '', '', ''], `${bad}: the plain board`);
      assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  }
});

test('no SHARE after the guided first game', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { first: true });
  try {
    await win(d.page);
    assert.equal(await d.page.locator('#result').textContent(), 'VICTORY');
    assert.ok(await d.page.locator('#btnShareWin').isHidden(), 'a guided game is not a challenge');
  } finally { await d.close(); }
});
