// The field under the menu's first page (index.html's <picture class="scene"> in the shore, public/menu/,
// tools/menu-art.mjs): the right image per size class, under the premise line, the buttons where they are without it,
// the page's floor when the image never comes, the two upper tide lines and the stones gone and the lowest line kept,
// the drift stopped under reduced motion, and no band at all on a screen too short for one.
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
/** The field as the page shows it: its image, whether it came and is shown, its box, its drift, the shore's lines left. */
const field = (page) => page.evaluate(() => {
  const p = document.querySelector('#menuHome .scene'), i = p.querySelector('img'), cs = getComputedStyle(p), r = p.getBoundingClientRect();
  const lines = [...document.querySelectorAll('#menuHome .shore svg')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.getAttribute('class') || 'stones');
  return { src: i.currentSrc.split('/').pop(), loaded: i.complete && i.naturalWidth > 0, shown: cs.display !== 'none', top: r.top, animation: cs.animationName, lines, floor: getComputedStyle(document.querySelector('#menuHome .shore')).backgroundImage.startsWith('radial-gradient') };
});

for (const [label, device, file] of SIZES) {
  test(`the field on a ${label}: ${file}, under the premise line, the buttons unmoved, the floor without it`, async () => {
    const a = await open(device);
    const f = await field(a.page), play = await rect(a.page, '#btnSolo'), tag = await rect(a.page, '#menuTag');
    assert.equal(f.src, file);
    assert.ok(f.loaded && f.shown, 'the image came and is shown');
    assert.ok(f.top >= tag[1] + tag[3], `the band's top (${f.top}) under the premise line (${tag[1] + tag[3]})`);
    assert.deepEqual(f.lines, ['tide t3'], 'only the lowest tide line stays over the field');
    assert.equal(f.animation, 'ebb', 'the band drifts');
    // Without the band (a thing of the shore, under the page): the buttons do not move, the floor shows.
    const bare = await a.page.evaluate(() => { document.querySelector('#menuHome .scene').remove(); const r = document.getElementById('btnSolo').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
    assert.deepEqual(bare, play, 'PLAY where it is without the band');
    const b = await open(device, { block: true });
    const g = await field(b.page);
    assert.ok(!g.loaded, 'the image did not come');
    assert.ok(g.floor, "the shore's floor shows");
    assert.deepEqual(await rect(b.page, '#btnSolo'), play, 'PLAY where it is with the image blocked');
    assert.deepEqual([a.errors, b.errors], [[], []]);
    await a.ctx.close(); await b.ctx.close();
  });
}

test('reduced motion stops the field\'s drift', async () => {
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } }, { reduced: true });
  const f = await field(page);
  assert.ok(f.loaded && f.shown);
  assert.equal(f.animation, 'none');
  await ctx.close();
});

test('a screen too short for the band shows none: the shore as it was', async () => {
  const { ctx, page, errors } = await open({ ...PHONE, viewport: { width: 568, height: 320 } });
  const f = await field(page);
  assert.ok(!f.shown, 'no band');
  assert.deepEqual(f.lines, ['tide t1', 'tide t2', 'tide t3', 'stones'], 'the three tide lines and the stones');
  assert.deepEqual(errors, []);
  await ctx.close();
});
