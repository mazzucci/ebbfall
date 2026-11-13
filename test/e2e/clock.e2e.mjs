// The top bar's game clock (src/client/clock.js): the game's time, m:ss, from the sim's ticks: there at the start,
// follows a fast-forward, stands still while the game is paused; on a desktop and a landscape phone, clear of gold,
// POP and the buttons. And the command card's height: two rows at least (src/style.css), the same for a card of one
// row of buttons as for one of two.
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const shown = (d) => d.page.locator('#rClock').textContent();
/** The clock the game's time should read (m:ss). */
const expected = (d) => d.eval(() => { const s = Math.floor(endfall.G.time); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; });

for (const [name, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE]]) {
  test(`the top bar's clock shows the game time on ${name}, follows a fast-forward and stops while paused`, { engines: true }, async () => {
    const d = await newGame(device);
    try {
      assert.ok(await d.page.locator('#rClock').isVisible(), 'the clock is in the top bar');
      assert.match(await shown(d), /^0:0\d$/, 'it starts at 0:0x');
      // In the bar, on one line, clear of POP and the full-screen button, inside the bar.
      const box = async (sel) => d.page.locator(sel).boundingBox();
      const [top, clk, sup, btn] = await Promise.all(['#top', '#resClock', '#resSup', '#top .ib.icon:visible >> nth=0'].map(box)); // (the first button shown: no full screen on some phones)
      assert.ok(clk.x >= sup.x + sup.width && clk.x + clk.width <= btn.x, `between POP and the buttons: ${JSON.stringify({ clk, sup, btn })}`);
      assert.ok(clk.y >= top.y && clk.y + clk.height <= top.y + top.height, `inside the bar: ${JSON.stringify({ clk, top })}`);

      assert.ok(await d.skipUntil(() => endfall.G.time >= 125, null, { seconds: 140, step: 1 }), 'fast-forwarded past 2:05');
      await d.page.waitForFunction(() => /^2:\d\d$/.test(document.getElementById('rClock').textContent), null, { timeout: 5000 });
      assert.equal(await shown(d), await expected(d), 'the clock reads the game time');

      await (d.touch ? d.page.locator('#btnPause').tap() : d.page.locator('#btnPause').click());
      assert.ok(await d.page.locator('#pause').isVisible(), 'paused');
      await d.page.waitForTimeout(300); // (the HUD's last update before the card)
      const t0 = await shown(d);
      await d.page.waitForTimeout(2200);
      assert.equal(await shown(d), t0, 'the clock stands still while paused');
      assert.equal(t0, await expected(d));
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

/** Build `type` with the `i`-th worker through the UI and fast-forward until it stands (the Expedition's). */
async function buildAndFinish(d, hotkey, type, i) {
  const s = await d.state(), hq = s.bldgs.find(b => b.team === 0 && b.type === 'conflux');
  const spot = await d.findSpot(type, { tx: hq.tx + 1, ty: hq.ty + 1 });
  const w = s.units.filter(u => u.team === 0 && u.type === 'lumen')[i];
  await d.buildWithUI(hotkey, type, spot.tx, spot.ty, w.id);
  const b = (await d.state()).bldgs.find(b => b.team === 0 && b.type === type);
  assert.ok(b, `${type} placed`);
  assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(x => x.id === id)?.done, b.id, { seconds: 120 }), `${type} done`);
  return b;
}
/** Select building `id` by a click or tap; the command card's height and its buttons' rows once it shows. */
async function cardOf(d, id) {
  for (let i = 0; i < 8 && !(await d.selection()).some(e => e.id === id); i++) { if (i) await d.page.waitForTimeout(200); await d.clickEntity(id); }
  await d.page.waitForFunction(() => document.querySelectorAll('#cmd button').length > 0, null, { timeout: 5000 });
  await d.page.waitForTimeout(300); // (the HUD's next update)
  return d.page.evaluate(() => ({
    height: Math.round(document.getElementById('cmd').getBoundingClientRect().height),
    rows: new Set([...document.querySelectorAll('#cmd button')].map(b => Math.round(b.getBoundingClientRect().top))).size,
  }));
}

for (const [name, device] of [['a desktop', DESKTOP], ['a landscape phone', PHONE]]) {
  test(`the command card keeps its height on ${name}: one row of buttons or two`, async () => {
    const d = await newGame(device, 1, 4242, { ai: false, race: 'vael' });
    try {
      await d.grant(4000, 0);
      await buildAndFinish(d, 'i', 'siphon', 0);
      const lab = await buildAndFinish(d, 'g', 'loom', 1);
      const hq = (await d.state()).bldgs.find(b => b.team === 0 && b.type === 'conflux');
      const two = await cardOf(d, hq.id), one = await cardOf(d, lab.id);
      assert.equal(two.rows, 2, 'the Data center: two rows of buttons');
      assert.equal(one.rows, 1, 'the Lab: one row of buttons');
      assert.equal(one.height, two.height, `the card as tall for one row as for two: ${JSON.stringify({ one, two })}`);
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}
