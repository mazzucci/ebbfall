// The game clock in the top bar (src/client/clock.js): the game's time, m:ss, from the sim's ticks: there at the start,
// follows a fast-forward, stands still while the game is paused; on a desktop and a landscape phone, clear of gold,
// POP and the buttons.
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
      const [top, clk, sup, full] = await Promise.all(['#top', '#resClock', '#resSup', '#btnFull'].map(box));
      assert.ok(clk.x >= sup.x + sup.width && clk.x + clk.width <= full.x, `between POP and the buttons: ${JSON.stringify({ clk, sup, full })}`);
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
