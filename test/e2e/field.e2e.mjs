// The field under the menu's first page (index.html's <picture class="scene"> in the backdrop, public/menu/,
// tools/menu-art.mjs): the right image per size class, under the premise line, the buttons where they are without it,
// the plain dark floor when the image never comes, no tide line and no drift anywhere on the menu, the band under the
// other menu pages too, no band at all on a screen too short for one, and in every engine the band fading into the floor
// (an opaque image: Safari drew the old alpha fade as opaque).
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

/** The size classes and the image each picks (index.html's sources, in their order: upright, a short landscape, 21:9). */
const SIZES = [
  ['desktop', { viewport: { width: 1440, height: 900 } }, 'menu-desktop.webp'],
  ['small desktop', DESKTOP, 'menu-desktop.webp'],
  ['21:9 desktop', { viewport: { width: 2560, height: 1080 } }, 'menu-wide.webp'],
  ['landscape phone', PHONE, 'menu-landscape.webp'],
  ['upright phone', { ...PHONE, viewport: { width: 390, height: 844 } }, 'menu-portrait.webp'],
];

async function open(device, { block = false, reduced = false } = {}) {
  const ctx = await browserContext({ ...device, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (block) await ctx.route('**/menu/*.webp', (route) => route.abort()); // (the image never comes: a slow network, a blocker)
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall && document.fonts.status === 'loaded', null, { timeout: 60000 });
  return { ctx, page, errors };
}
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }, sel);
/** The plain dark floor under the menu (style.css's --panel): no gradient, no glow. */
const FLOOR = 'rgb(18, 26, 37)';
/** The field as the page shows it: its image, whether it came and is shown, its box, its animation, what else the
 *  backdrop draws (an svg: a tide line or the stones of old), and its floor (a plain color, no image). */
const field = (page, at = '#menuHome') => page.evaluate((at) => {
  const p = document.querySelector(`${at} .scene`), i = p.querySelector('img'), cs = getComputedStyle(p), r = p.getBoundingClientRect(), bd = getComputedStyle(document.querySelector(`${at} .backdrop`));
  return { src: i.currentSrc.split('/').pop(), loaded: i.complete && i.naturalWidth > 0, shown: cs.display !== 'none', top: r.top, bottom: r.bottom, left: r.left, animation: cs.animationName,
    svgs: document.querySelectorAll(`${at} .backdrop svg`).length, floor: [bd.backgroundColor, bd.backgroundImage], anims: document.getAnimations().length };
}, at);

for (const [label, device, file] of SIZES) {
  test(`the field on a ${label}: ${file}, under the premise line, the buttons unmoved, the floor without it`, async () => {
    const a = await open(device);
    const f = await field(a.page), play = await rect(a.page, '#btnSolo'), tag = await rect(a.page, '#menuTag');
    assert.equal(f.src, file);
    assert.ok(f.loaded && f.shown, 'the image came and is shown');
    assert.ok(f.top >= tag[1] + tag[3], `the band's top (${f.top}) under the premise line (${tag[1] + tag[3]})`);
    assert.equal(f.svgs, 0, 'no tide line, no stones');
    assert.equal(f.animation, 'none', 'the band stands still');
    assert.equal(f.anims, 0, 'nothing on the first page animates');
    assert.deepEqual(f.floor, [FLOOR, 'none'], 'a plain dark floor');
    // Without the band (a thing of the backdrop, under the page): the buttons do not move, the floor shows.
    const bare = await a.page.evaluate(() => { document.querySelector('#menuHome .scene').remove(); const r = document.getElementById('btnSolo').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
    assert.deepEqual(bare, play, 'PLAY where it is without the band');
    const b = await open(device, { block: true });
    const g = await field(b.page);
    assert.ok(!g.loaded, 'the image did not come');
    assert.deepEqual(g.floor, [FLOOR, 'none'], 'the plain dark floor shows');
    assert.deepEqual(await rect(b.page, '#btnSolo'), play, 'PLAY where it is with the image blocked');
    assert.deepEqual([a.errors, b.errors], [[], []]);
    await a.ctx.close(); await b.ctx.close();
  });
}

/** The band as the screen shows it, the page's content hidden: its top row (one pixel in) and a row in its lower part,
 *  sampled across the screen, each pixel's largest channel difference from the floor; and the image's lowest alpha as
 *  this engine decodes it. */
async function fade(page) {
  await page.evaluate(() => { for (const e of document.querySelectorAll('#menuHome > :not(.backdrop), #corner')) e.style.visibility = 'hidden'; });
  const box = await page.evaluate(() => { const r = document.querySelector('#menuHome .scene').getBoundingClientRect(); return { top: Math.ceil(Math.max(0, r.top)), bottom: Math.floor(Math.min(innerHeight, r.bottom)), w: innerWidth }; });
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: box.w, height: box.bottom }, scale: 'css' });
  return page.evaluate(async ({ b64, box }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const floor = [18, 26, 37], row = (y) => { const d = g.getImageData(0, y, img.width, 1).data, out = []; for (let x = 4; x < img.width - 4; x += 8) out.push(Math.max(...[0, 1, 2].map((k) => Math.abs(d[x * 4 + k] - floor[k])))); return out; };
    const top = row(box.top + 1), low = row(Math.round(box.top + (box.bottom - box.top) * 0.8));
    const s = document.querySelector('#menuHome .scene img'), t = new OffscreenCanvas(s.naturalWidth, s.naturalHeight), tg = t.getContext('2d'); tg.drawImage(s, 0, 0);
    const a = tg.getImageData(0, 0, t.width, t.height).data; let minAlpha = 255; for (let i = 3; i < a.length; i += 4) minAlpha = Math.min(minAlpha, a[i]);
    return { topMax: Math.max(...top), lowMean: low.reduce((p, v) => p + v, 0) / low.length, minAlpha };
  }, { b64: png.toString('base64'), box });
}

// Safari on iPad and iPhone drew the images' old alpha fade as opaque: a hard-edged band (test/menu-art.test.js keeps
// the files opaque). Here, in every engine, the band as shown: its top row is the floor, its lower part is the field.
for (const [label, device] of [['iPad, landscape', { viewport: { width: 1180, height: 820 }, hasTouch: true }], ['iPad, upright', { viewport: { width: 820, height: 1180 }, hasTouch: true }], ['upright phone', { ...PHONE, viewport: { width: 390, height: 844 } }]]) {
  test(`the field on an ${label} fades into the floor: its top row is the floor's color, an opaque image, the field below`, { engines: true }, async () => {
    const { ctx, page, errors } = await open(device);
    const f = await fade(page);
    assert.equal(f.minAlpha, 255, 'the image is opaque: the fade is baked into the floor\'s color');
    assert.ok(f.topMax <= 6, `the band's top row is the floor (largest channel difference ${f.topMax})`);
    assert.ok(f.lowMean >= 12, `the field shows in the band's lower part (mean difference from the floor ${f.lowMean.toFixed(1)})`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('the band under the other menu pages too: Single player and Multiplayer, at the foot of the screen, no tide line', async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
  await page.locator('#btnSolo').click();
  for (const at of ['#menuSolo', '#onlineJoin']) {
    if (at === '#onlineJoin') { await page.locator('#btnSoloBack').click(); await page.locator('#btnOnline').click(); }
    await page.locator(at).waitFor();
    const f = await field(page, at);
    assert.ok(f.shown && f.loaded, `${at}: the band is shown`);
    assert.deepEqual([Math.round(f.left), Math.round(f.bottom)], [-20, 908], `${at}: the band at the foot of the screen`);
    assert.equal(f.svgs, 0, `${at}: no tide line, no stones`);
    assert.deepEqual(f.floor, [FLOOR, 'none'], `${at}: the plain dark floor`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a screen too short for the band shows none: the plain floor', async () => {
  const { ctx, page, errors } = await open({ ...PHONE, viewport: { width: 568, height: 320 } });
  const f = await field(page);
  assert.ok(!f.shown, 'no band');
  assert.equal(f.svgs, 0, 'no tide line, no stones');
  assert.deepEqual(f.floor, [FLOOR, 'none'], 'the plain dark floor');
  assert.deepEqual(errors, []);
  await ctx.close();
});
