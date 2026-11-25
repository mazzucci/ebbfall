// The game's art in the browser (src/client/gl/artload.js): what is asked for (the index's files, never the older
// atlas's pages, whatever the link says), the loading line while a start waits for it, a file that fails (RETRY, then the
// game), and the HUD's portraits. The files: public/art/new/.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const ix = JSON.parse(readFileSync(new URL('../../public/art/new/index.json', import.meta.url), 'utf8'));
/** A page (the service worker blocked: a request is the page's own) with the art's requests listed. */
async function open(device, query = '') {
  const ctx = await browserContext({ ...device, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [], asked = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { const p = new URL(r.url()).pathname; if (p.includes('/art/')) asked.push(p.slice(p.indexOf('/art/') + 5)); });
  const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
  return { ctx, page, errors, asked, press, go: () => page.goto(baseUrl() + query, { waitUntil: 'domcontentloaded' }) };
}
const playing = (page) => page.waitForFunction(() => window.endfall && endfall.G.units.length > 0 && document.getElementById('start').hidden, null, { timeout: 90000 });

for (const [name, device, query] of [['a desktop', DESKTOP, '?seed=4242&map=4'], ['a landscape phone', PHONE, '?seed=4242&map=4'], ['an old link (?art=new)', DESKTOP, '?seed=4242&map=4&art=new']]) {
  test(`${name}: the menu and a game ask for the art's files, each once, and for nothing of the older atlas`, { timeout: 180000 }, async () => {
    const { ctx, page, errors, asked, press, go } = await open(device, query);
    try {
      await go();
      await page.waitForFunction(() => !!window.endfall, null, { timeout: 90000 });
      await press('#btnSolo'); await press('#btnStart'); await playing(page);
      await page.evaluate(() => { endfall.skip(20); endfall.draw(); });
      await page.waitForTimeout(300);
      assert.deepEqual(asked.filter(p => /atlas/.test(p)), [], 'no atlas page');
      assert.deepEqual(asked.slice().sort(), ['index.json', ...Object.keys(ix.bytes)].map(f => 'new/' + f).sort());
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

for (const [name, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE], ['a portrait phone', { ...PHONE, viewport: { width: 390, height: 844 } }]]) {
  test(`${name}: START before the art is in shows how much has come, in MB, over its button; a file that cannot be fetched asks for RETRY, and the game then starts`, { timeout: 180000 }, async () => {
    const { ctx, page, errors, press, go } = await open(device, '?seed=4242&map=4');
    try {
      let broken = true, refused = 0;
      await page.route(/unit-3\.webp$/, (r) => { if (!broken) return r.continue(); refused++; return r.abort(); });
      await go();
      await page.locator('#btnSolo').waitFor();
      await press('#btnSolo'); await page.locator('#menuSolo').waitFor();
      assert.ok(await page.locator('#loadLine').isHidden(), 'nothing while nothing waits');
      await press('#btnStart');
      const line = page.locator('#loadLine');
      await line.waitFor({ timeout: 5000 });
      await page.waitForFunction(() => /^Loading the game: [\d.]+ of 9\.\d MB$|could not be fetched/.test(document.querySelector('#loadLine span').textContent), null, { timeout: 20000 });
      const all = () => page.evaluate(() => { const b = document.querySelector('#loadLine').getBoundingClientRect(), s = document.querySelector('#btnStart').getBoundingClientRect(); return { seen: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth && document.elementFromPoint(b.left + 20, b.top + 10)?.closest('#loadLine') !== null, over: b.bottom <= s.top + 1 }; });
      assert.deepEqual(await all(), { seen: true, over: true }, 'whole on the screen, over the button');
      await page.waitForFunction(() => /could not be fetched/.test(document.querySelector('#loadLine span').textContent), null, { timeout: 60000 });
      assert.equal(refused, 4, 'tried four times');
      assert.ok(await page.evaluate(() => { const p = document.querySelector('#loadLine progress'); return p.value > p.max * 0.5 && p.value < p.max; }), 'the rest is in, and kept');
      assert.deepEqual(await all(), { seen: true, over: true }, 'RETRY is on the screen');
      assert.ok(await page.locator('#btnStart').isDisabled(), 'START still waits');
      broken = false;
      await press('#loadLine button');
      await playing(page);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

// The HUD's portraits (render.js `portrait`) are cut by the frame's own paint. Every unit and building, at every size the
// HUD draws one (the Miners line 22, the tutorial 26, the group's tiles 28 and 42 to 46, the selected one 44 and 76 to 84,
// a button's details 72): no solid pixel (the art box's own measure, alpha over 110) on the square's outer ring.
test('no portrait is cut off at its square\'s edge, at any size the HUD uses', { timeout: 240000 }, async () => {
  const units = Object.keys(ix.groups.unit.unitTops), bldgNames = Object.keys(ix.groups.bldg.looks).map(t => `bldg_${t}`);
  const SIZES = [22, 26, 28, 42, 44, 46, 72, 76, 84];
  const { ctx, page, errors, press, go } = await open(DESKTOP, '?seed=4242&map=4');
  try {
    await go(); await page.waitForFunction(() => !!window.endfall, null, { timeout: 90000 });
    await press('#btnSolo'); await press('#btnStart'); await playing(page);
    const res = await page.evaluate(async ([units, bldgNames, SIZES]) => {
      const bldgs = Object.keys(endfall.engine.BUILDINGS).filter(t => bldgNames.includes(`bldg_${t}`)), bad = [], none = [];
      for (const [kind, types] of [['unit', units], ['bldg', bldgs], ['node', ['gold']]]) for (const type of types) for (const size of SIZES) {
        const src = /src="([^"]+)"/.exec(endfall.portrait(kind, type, size, 0))?.[1];
        if (!src) { none.push(`${type} ${size}`); continue; }
        const im = new Image(); im.src = src; await im.decode();
        const n = im.naturalWidth, c = document.createElement('canvas'); c.width = c.height = n;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, n, n).data; let solid = 0, edge = 0;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 110) { solid++; if (!x || !y || x === n - 1 || y === n - 1) edge++; }
        if (edge || solid < n * n * 0.05) bad.push(`${kind} ${type} at ${size}: ${edge} solid px on the edge, ${solid} in all`);
      }
      return { bldgs: bldgs.length, bad, none };
    }, [units, bldgNames, SIZES]);
    assert.deepEqual([units.length, res.bldgs], [15, 17], 'every unit and building');
    assert.deepEqual([res.none, res.bad, errors], [[], [], []]);
  } finally { await ctx.close(); }
});
