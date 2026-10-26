// Determinism across engines: the device check page (selftest.html) plays the golden games in Chromium, Firefox and
// WebKit, each with its own JavaScript and WebAssembly engine, and every one must compute exactly the reference
// hashes (src/engine/golden.js). Firefox and WebKit run when installed (`npx playwright-core install --with-deps
// firefox webkit`); CI sets ENDFALL_ENGINES=1, so there a missing engine fails instead of skipping.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { firefox, webkit } from 'playwright-core';
import { start, stop, browserContext, baseUrl } from './harness.mjs';
import { GOLDEN } from '../../src/engine/golden.js';

before(start);
after(stop);

async function check(ctx) {
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`${baseUrl()}selftest.html`, { timeout: 30000 });
  await p.waitForFunction(() => document.body.dataset.result, null, { timeout: 120000 });
  const [result, verdict, lines] = await p.evaluate(() => [document.body.dataset.result, document.getElementById('verdict').textContent, [...document.querySelectorAll('#games li')].map(l => l.textContent)]);
  assert.deepEqual(errors, []);
  assert.equal(result, 'pass', `${verdict}\n${lines.join('\n')}`);
  assert.equal(lines.length, GOLDEN.length);
}

test('Chromium computes the golden games exactly', { timeout: 180000 }, async () => {
  const ctx = await browserContext({ viewport: { width: 390, height: 844 } });
  try { await check(ctx); } finally { await ctx.close(); }
});

for (const [name, engine] of [['Firefox', firefox], ['WebKit', webkit]]) {
  test(`${name} computes the golden games exactly`, { timeout: 180000 }, async (t) => {
    let browser;
    try { browser = await engine.launch({ timeout: 60000 }); }
    catch (e) {
      if (process.env.ENDFALL_ENGINES) throw e;
      t.skip(`${name} is not installed here`); return;
    }
    try { await check(await browser.newContext()); } finally { await browser.close(); }
  });
}
