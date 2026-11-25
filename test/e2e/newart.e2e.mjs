// The new look's switch (?art=new, src/client/gl/newart.js): nothing of it is asked for without it; with it and nothing
// built, a missing page or a broken index, the game is today's, with no error; and the same link plays the same game with
// and without it (?seed=, ?map=), so two tabs side by side show the same place. The packs are public/art/new/.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, start, stop, browserContext, baseUrl, DESKTOP } from './harness.mjs';

before(start);
after(stop);

async function play(query, routes = {}) {
  const ctx = await browserContext({ ...DESKTOP, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [], asked = [], warnings = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' && /new art/.test(m.text())) warnings.push(m.text()); });
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
  return { asked, errors, warnings, hash };
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
  const groups = JSON.parse(readFileSync(new URL('../../public/art/new/index.json', import.meta.url), 'utf8')).groups;
  for (const [g, { pages }] of Object.entries(groups)) for (const page of pages) assert.ok(p.asked.some(a => a.endsWith('/' + page)), `${g}: ${page} (${p.asked})`);
  assert.deepEqual(p.warnings, [], 'no group left out');
});

// The HUD's portraits (render.js `portrait`) of the new look's frames are cut by their paint: the frame-based cut is
// tuned to today's frames, and cut the new, larger figures off at a square's edge. Every unit and building of the packs,
// at every size the HUD draws one (the Miners line 22, the tutorial 26, the group's tiles 28 and 42 to 46, the selected
// one 44 and 76 to 84, a button's details 72), both ways it is asked for: no solid pixel (the art box's own measure,
// alpha over 110) on the square's outer ring. A kind the packs do not hold keeps today's portrait, to the byte.
test('with ?art=new no portrait of a new frame is cut off at its square\'s edge, at any size the HUD uses; a kind still on today\'s frames keeps today\'s portrait', { timeout: 240000 }, async () => {
  const dir = new URL('../../public/art/new/', import.meta.url), groups = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')).groups;
  const units = Object.keys(groups.unit.unitTops), bldgNames = groups.bldg.pages.flatMap(p => Object.keys(JSON.parse(readFileSync(new URL(p, dir), 'utf8')).frames));
  const SIZES = [22, 26, 28, 42, 44, 46, 72, 76, 84];
  const open = async (query) => {
    const ctx = await browserContext({ ...DESKTOP, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(baseUrl() + query, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').click(); await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden, null, { timeout: 60000 });
    return { ctx, page, errors };
  };
  const still = ['medic', 'halo'].filter(k => !units.includes(k)); // (trained nowhere, in no pack: today's frames under the switch too)
  const cut = (page, list) => page.evaluate((list) => list.map(([kind, type, size]) => endfall.portrait(kind, type, size, 0)), list);
  const a = await open('?seed=4242&map=4&art=new');
  const res = await a.page.evaluate(async ([units, bldgNames, SIZES]) => {
    const bldgs = Object.keys(endfall.engine.BUILDINGS).filter(t => bldgNames.includes(`bldg_${t}`)), bad = [], none = [];
    for (const [kind, types] of [['unit', units], ['bldg', bldgs]]) for (const type of types) for (const size of SIZES) for (const box of [false, true]) {
      const src = /src="([^"]+)"/.exec(endfall.portrait(kind, type, size, 0, box))?.[1];
      if (!src) { none.push(`${type} ${size}`); continue; }
      const im = new Image(); im.src = src; await im.decode();
      const n = im.naturalWidth, c = document.createElement('canvas'); c.width = c.height = n;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, n, n).data; let solid = 0, edge = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 110) { solid++; if (!x || !y || x === n - 1 || y === n - 1) edge++; }
      if (edge || solid < n * n * 0.05) bad.push(`${kind} ${type} at ${size}${box ? ' (box)' : ''}: ${edge} solid px on the edge, ${solid} in all`);
    }
    return { bldgs: bldgs.length, bad, none };
  }, [units, bldgNames, SIZES]);
  const newWay = await cut(a.page, still.map(k => ['unit', k, 72]));
  await a.ctx.close();
  assert.deepEqual([units.length, res.bldgs], [15, 17], 'the packs\' units and buildings');
  assert.deepEqual([res.none, res.bad, a.errors], [[], [], []]);
  const b = await open('?seed=4242&map=4');
  const today = await cut(b.page, still.map(k => ['unit', k, 72]));
  await b.ctx.close();
  assert.ok(still.length && today.every(h => /src="data:/.test(h)), 'kinds on today\'s frames to compare');
  assert.deepEqual(newWay, today, 'a kind on today\'s frames: the same portrait with the switch');
});
