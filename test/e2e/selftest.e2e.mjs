// Determinism across engines: the device check page (selftest.html) plays the golden games, and the engine under test
// (ENDFALL_ENGINE: Chromium by default, WebKit or Firefox, each with its own JavaScript and WebAssembly engine) must
// compute exactly the reference hashes (src/engine/golden.js). CI runs it in all three, and WebKit on an ARM Mac.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, browserContext, baseUrl, ENGINE_NAME } from './harness.mjs';
import { GOLDEN } from '../../src/engine/golden.js';

before(start);
after(stop);

test(`${ENGINE_NAME} computes the golden games exactly`, { timeout: 180000, engines: true }, async () => {
  const ctx = await browserContext({ viewport: { width: 390, height: 844 } });
  try {
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${baseUrl()}selftest.html`, { timeout: 30000 });
    await p.waitForFunction(() => document.body.dataset.result, null, { timeout: 120000 });
    const [result, verdict, lines] = await p.evaluate(() => [document.body.dataset.result, document.getElementById('verdict').textContent, [...document.querySelectorAll('#games li')].map(l => l.textContent)]);
    assert.deepEqual(errors, []);
    assert.equal(result, 'pass', `${verdict}\n${lines.join('\n')}`);
    assert.equal(lines.length, GOLDEN.length);
  } finally { await ctx.close(); }
});
