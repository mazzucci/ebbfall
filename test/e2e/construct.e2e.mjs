// Construction you can read (src/client/construct.js; Notion: "PRD: construction you can read"), through the real UI:
// a site looks unfinished until done (the Kingdom's raw and roofless, the Expedition's a cyan hologram) under a build
// bar in the hp bar's place, both cards say how far along it is, a builder strikes while it works, a site left with no
// builder toasts once, and a finished building comes into full color over half a second. Run: npm run build && npm
// run test:e2e (or this file alone: node --test test/e2e/construct.e2e.mjs).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { HOLO, RAW, BUILD_BAR } from '../../src/client/construct.js';
import { test, start, stop, newGame, until, DESKTOP, PHONE } from './harness.mjs';

const SMALL = { ...PHONE, viewport: { width: 667, height: 375 } }; // (iPhone SE class: the console hides its status line)

before(start);
after(stop);

/** Place `type` with the first worker through the UI, next to the headquarters; returns the site's id and the worker. */
async function placeSite(d, hotkey, type) {
  await d.grant(2000, 0);
  const s = await d.state(), hq = s.bldgs.find(b => b.team === 0), w = s.units.find(u => u.team === 0 && u.type === (hq.type === 'core' ? 'harvester' : 'lumen'));
  const spot = await d.findSpot(type, { tx: hq.tx + 2, ty: hq.ty + 2 });
  await d.buildWithUI(hotkey, type, spot.tx, spot.ty, w.id);
  const site = (await d.state()).bldgs.find(b => b.team === 0 && b.type === type && !b.done);
  assert.ok(site, `the ${type} placed`);
  return { id: site.id, w: w.id };
}
/** How the renderer draws building `id` now (endfall.sites: read-only). */
const drawn = (d, id) => d.eval((id) => endfall.sites().bldgs.find(o => o.id === id), id);
/** Select unit `id` by clicking it until it, not the site it stands on, is the selection. */
async function pick(d, id) {
  for (let i = 0; i < 10; i++) { await d.clickEntity(id); if ((await d.selection()).some(e => e.id === id)) return; await d.page.waitForTimeout(200); }
  assert.fail(`unit ${id} could not be selected`);
}
/** Watch building `id` frame by frame (in the page, real time) until its done moment has played: each frame's look. */
const watchDone = (d, id, ms = 8000) => d.eval(([id, ms]) => new Promise(resolve => {
  const seen = [], t0 = performance.now();
  const tick = () => {
    const o = endfall.sites().bldgs.find(x => x.id === id);
    if (o) seen.push({ look: o.look, fadeT: o.fadeT, paint: o.paint, sat: o.sat, tint: o.tint, alpha: o.alpha, roof: o.roof, height: o.height, fullHeight: o.fullHeight, scaffold: o.scaffold, bars: o.bars.map(b => b.bar) });
    const fadedAndDone = seen.some(s => s.look === 'fade') && seen.at(-1)?.look === 'full';
    if (fadedAndDone || performance.now() - t0 > ms) resolve(seen); else requestAnimationFrame(tick);
  };
  tick();
}), [id, ms]);

test('a Kingdom site reads unfinished: raw, roofless, its build bar on top; both cards say how far; a builder strikes', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const { id, w } = await placeSite(d, 'c', 'barracks');
    assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(b => b.id === id)?.progress >= 0.5, id, { step: 1 / 30 }), 'half built');
    const b = (await d.state()).bldgs.find(x => x.id === id);
    await d.centerOn(b.x, b.y);
    await d.page.waitForTimeout(300);
    const o = await drawn(d, id);
    assert.equal(o.look, 'raw', 'the Kingdom\'s raw site');
    assert.ok(Math.abs(o.sat - RAW.sat) < 1e-6, `desaturated: ${o.sat}`);
    assert.equal(o.paint, 0, 'no seat paint on the body (the scaffold\'s cloth says whose it is)');
    assert.ok(o.scaffold === 1 && o.height < o.fullHeight * 0.9, `inside its scaffold, the top of it missing (${o.height} of ${o.fullHeight})`);
    assert.deepEqual(o.bars.map(r => [r.bar, r.h]), [['build', BUILD_BAR.h]], 'the build bar in the hp bar\'s place, taller; no hp bar while undamaged');
    // A builder at work strikes now and then (the renderer's clock: real time).
    await d.page.waitForFunction((w) => (endfall.sites().strikes[w] || 0) >= 2, w, { timeout: 10000 });
    // The builder's card, then the site's.
    await pick(d, w);
    assert.match(await d.hudText('#selSub', /Constructing Barracks/), /^Constructing Barracks, \d+%$/, 'the builder\'s card');
    await d.clickEntity(id);
    assert.match(await d.hudText('#selSub', /Constructing/), /^Constructing, \d+%$/, 'the site\'s card');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('pulled off, a site toasts once ("Barracks paused at N%") and no more within the minute; then it comes into color', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const { id, w } = await placeSite(d, 'c', 'barracks');
    assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(b => b.id === id)?.progress >= 0.85, id, { step: 1 / 30 }), 'nearly built');
    const b = (await d.state()).bldgs.find(x => x.id === id);
    const pullOff = async () => { await pick(d, w); await d.rightClickWorld(b.x - 200, b.y + 120); };
    const paused = async () => (await d.toasts()).filter(t => /paused at/.test(t));
    await pullOff();
    await until(d, async () => (await paused()).length > 0, { seconds: 10, step: 0.2, what: 'the paused toast' });
    assert.deepEqual((await paused()).map(t => t.replace(/\d+%/, 'N%')), ['Barracks paused at N%'], 'once, with the site\'s name');
    const pct = +(await paused())[0].match(/(\d+)%/)[1];
    const at = (await d.state()).bldgs.find(x => x.id === id).progress;
    assert.equal(pct, Math.floor(at * 100), 'the percentage it stopped at');
    await d.clickEntity(id);
    assert.match(await d.hudText('#selSub', /Paused/), new RegExp(`^Paused at ${pct}%$`), 'the site\'s card');
    assert.equal(await d.hudText('#selWhat', /No builder/), 'No builder', 'and why, in the kind\'s line');
    // Resumed and pulled off again within the minute: no second toast.
    await d.pressCard('Resume');
    await until(d, async () => (await d.state()).units.find(u => u.id === w)?.task === 'build' && (await d.state()).bldgs.find(x => x.id === id).progress > at + 0.01, { seconds: 20, step: 0.5, what: 'the builder back at work' });
    await d.page.waitForFunction(() => !document.querySelector('#msg .toast'), null, { timeout: 8000 }); // (the first toast gone)
    await pullOff();
    await d.page.waitForTimeout(800); await d.skip(1);
    assert.equal((await d.state()).units.find(u => u.id === w).task !== 'build', true, 'pulled off again');
    assert.deepEqual(await paused(), [], 'at most once a site a minute');
    // Resumed again, it finishes while we watch: the done moment, then full color.
    await d.clickEntity(id); await d.pressCard('Resume');
    await d.centerOn(b.x, b.y);
    assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(b => b.id === id)?.progress >= 0.97, id, { step: 1 / 30, seconds: 60 }), 'almost done');
    const seen = await watchDone(d, id);
    const fade = seen.filter(s => s.look === 'fade'), last = seen.at(-1);
    assert.ok(fade.length > 0, `the done moment played: ${JSON.stringify(seen.slice(-3))}`);
    assert.ok(fade.some(s => s.paint > 0 && s.paint < 1 && s.sat > RAW.sat && s.sat < 1), 'part way into color and paint');
    assert.ok(fade.every(s => !s.bars.includes('build')), 'the build bar gone at t = 0');
    assert.ok(fade.every(s => s.fadeT < 0.5 + 1e-9), 'half a second at most');
    assert.equal(last.look, 'full');
    assert.deepEqual([last.paint, last.sat, last.roof, last.scaffold, last.height], [1, 1, 0, 0, last.fullHeight], 'full color and paint, the whole building, no scaffold');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('an Expedition site is a cold cyan hologram in a bud; its Bot\'s card says how far; it fades into full color', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false, race: 'vael' });
  try {
    const { id, w } = await placeSite(d, 'i', 'siphon');
    assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(b => b.id === id)?.progress >= 0.6, id, { step: 1 / 30 }), 'over half built');
    const b = (await d.state()).bldgs.find(x => x.id === id);
    await d.centerOn(b.x, b.y);
    await d.page.waitForTimeout(300);
    const o = await drawn(d, id);
    assert.equal(o.look, 'holo');
    assert.equal(o.tint, HOLO.tint, 'cold cyan');
    assert.ok(o.alpha <= HOLO.alphaMax + HOLO.shimmer + 1e-9, `never solid: ${o.alpha}`);
    assert.equal(o.paint, 0, 'no seat paint');
    assert.ok(o.scaffold >= HOLO.budMin, 'the bud at least half there');
    assert.deepEqual(o.bars.map(r => r.bar), ['build']);
    await pick(d, w);
    assert.match(await d.hudText('#selSub', /Constructing/), /^Constructing Recruiting post, \d+%$/, 'the Bot\'s card');
    await d.eval(() => { endfall.ui.sel = []; });
    assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(b => b.id === id)?.progress >= 0.97, id, { step: 1 / 30, seconds: 60 }), 'almost done');
    const seen = await watchDone(d, id);
    const fade = seen.filter(s => s.look === 'fade'), last = seen.at(-1);
    assert.ok(fade.some(s => s.tint !== HOLO.tint && s.tint !== 0xffffff && s.alpha > HOLO.alphaMax && s.alpha < 1), `on its way from cyan to white: ${JSON.stringify(fade.slice(0, 3))}`);
    assert.equal(last.look, 'full');
    assert.deepEqual([last.tint, last.alpha, last.paint, last.scaffold], [0xffffff, 1, 1, 0], 'solid, painted, no bud');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

/** The console's status line as shown: its text, whether it shows, and whether it shows whole (no ellipsis). */
const statusLine = (d) => d.page.$eval('#selSub', (e) => ({ text: e.textContent, shown: e.offsetWidth > 0 && getComputedStyle(e).display !== 'none', whole: e.scrollWidth <= e.clientWidth + 1 }));
for (const [name, device] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${name}: the percentage shows whole on every card, for the longest building name (Recruiting post)`, async () => {
    const d = await newGame(device, 1, 4242, { ai: false, race: 'vael' });
    try {
      const { id, w } = await placeSite(d, 'i', 'siphon');
      assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(b => b.id === id)?.progress >= 0.9, id, { step: 1 / 30 }), 'nearly built');
      const whole = async (re, what) => {
        await d.hudText('#selSub', re);
        const l = await statusLine(d);
        assert.ok(l.shown && l.whole && re.test(l.text), `${what}: ${JSON.stringify(l)}`);
      };
      await pick(d, w);
      await whole(/^Constructing Recruiting post, \d+%$/, 'the Bot\'s card');
      await d.eval(() => { endfall.ui.sel = []; }); // (a tap on the site with the Bot selected would order it there)
      await d.clickEntity(id);
      await whole(/^Constructing, \d+%$/, 'the site\'s card');
      // Pulled off: "Paused at N%", and "No builder" in the kind's line.
      await d.eval(() => { endfall.ui.sel = []; });
      await pick(d, w);
      const b = (await d.state()).bldgs.find(x => x.id === id);
      if (d.touch) await d.clickWorld(b.x - 200, b.y + 120); else await d.rightClickWorld(b.x - 200, b.y + 120);
      await until(d, async () => (await d.state()).units.find(u => u.id === w)?.task !== 'build', { seconds: 10, step: 0.2, what: 'the Bot pulled off' });
      await d.eval(() => { endfall.ui.sel = []; });
      await d.clickEntity(id);
      await whole(/^Paused at \d+%$/, 'the paused site\'s card');
      assert.equal(await d.hudText('#selWhat', /No builder/), 'No builder');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

// Small phones (landscape up to 720 px) hide the console's status line, and with it the site's percentage: a small
// label beside the build bar says it there instead (in the bar's orange), and only there.
for (const [name, device, shown] of [['small phone', SMALL, true], ['phone', PHONE, false]]) {
  test(`${name}: a site's card ${shown ? 'shows' : 'has no'} percentage beside its build bar`, async () => {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      const { id } = await placeSite(d, 'c', 'barracks');
      assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(b => b.id === id)?.progress >= 0.4, id, { step: 1 / 30 }), 'under way');
      await d.eval(() => { endfall.ui.sel = []; });
      await d.clickEntity(id);
      await d.page.locator('#mod > .bar.build').waitFor({ timeout: 5000 });
      const look = () => d.page.evaluate(() => {
        const p = document.querySelector('#mod > .pct'), bar = document.querySelector('#mod > .bar.build'), info = document.querySelector('#info'), sub = document.querySelector('#selSub');
        const r = (e) => e.getBoundingClientRect(), pr = r(p), br = r(bar), ir = r(info);
        return { text: p.textContent, shown: p.offsetWidth > 0, sub: sub.offsetWidth > 0, color: getComputedStyle(p).color, fill: getComputedStyle(bar.querySelector('i')).backgroundColor,
          beside: pr.left >= br.right - 1 && Math.abs((pr.top + pr.bottom) / 2 - (br.top + br.bottom) / 2) < 8, inside: pr.left >= ir.left && pr.right <= ir.right + 1 && pr.top >= ir.top && pr.bottom <= ir.bottom + 1 };
      });
      if (shown) {
        await d.page.waitForFunction(() => /^\d+%$/.test(document.querySelector('#mod > .pct')?.textContent), null, { timeout: 5000 });
        const l = await look(), prog = (await d.state()).bldgs.find(b => b.id === id).progress;
        assert.ok(l.shown && !l.sub, `the label shows, the status line does not: ${JSON.stringify(l)}`);
        assert.ok(Math.abs(parseInt(l.text) - Math.floor(prog * 100)) <= 2, `how far along it is: ${l.text} at ${prog}`);
        assert.equal(l.color, l.fill, 'in the build bar\'s orange');
        assert.ok(l.beside && l.inside, `beside the bar, inside the console: ${JSON.stringify(l)}`);
      } else {
        const l = await look();
        assert.ok(!l.shown && l.sub, `the status line says it, no label: ${JSON.stringify(l)}`);
      }
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}
