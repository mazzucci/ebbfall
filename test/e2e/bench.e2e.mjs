// The device test (?bench, src/client/bench.js) end to end: the card, START, the 8-seat game fast-forwarded and
// measured (shortened here: &secs=5 from 0:30), the report built and POSTed through a local relay (relay/server.mjs,
// another origin: the preflight for real), its code on the card, and the same report read back by that code.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, browserContext, baseUrl, PHONE } from './harness.mjs';
import { startRelay } from '../../relay/server.mjs';

let relay;
before(async () => { await start(); relay = startRelay({ port: 0 }); await relay.ready; });
after(async () => { await relay.close(); await stop(); });

test('?bench plays its game, measures it, and sends the report for a code', { timeout: 240000 }, async () => {
  const ctx = await browserContext(PHONE);
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await p.goto(`${baseUrl()}?bench&secs=5&at=30&relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.body.dataset.bench === 'ready', null, { timeout: 60000 });
    assert.ok(await p.locator('#bench').isVisible(), 'the card');
    assert.ok(!(await p.locator('#start').isVisible()), 'not the menu');
    assert.match(await p.locator('#bench').textContent(), /nothing about you/);
    await p.locator('#benchGo').tap();
    await p.waitForFunction(() => ['sent', 'failed', 'unsent'].includes(document.body.dataset.bench), null, { timeout: 200000 });
    const { report, code, state, card } = await p.evaluate(() => ({ ...window.endfallBench, state: document.body.dataset.bench, card: document.getElementById('bench').textContent }));
    assert.equal(state, 'sent', card);
    assert.match(code, /^PERF-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    assert.ok(card.includes(code), 'the code on the card');

    assert.equal(report.result, 'done');
    assert.deepEqual([report.setup.seats, report.setup.size, report.setup.ai, report.setup.from, report.setup.secs], [8, 128, 'Medium', 30, 5]);
    assert.equal(report.prep.ticks, 30 * 30 - 1, 'fast-forwarded to 0:30 (the last tick through the mirror)');
    const s = report.summary;
    assert.ok(s.secs >= 5 && s.frames > 0 && s.fps > 0, JSON.stringify(s));
    for (const k of ['frameMs', 'sim', 'sync', 'other', 'render', 'hud', 'work']) for (const q of ['avg', 'p50', 'p95', 'p99', 'max']) assert.equal(typeof s[k][q], 'number', `${k}.${q}`);
    assert.ok(s.frameMs.p50 <= s.frameMs.p95 && s.frameMs.p95 <= s.frameMs.max);
    assert.ok(s.sim.avg > 0 && s.render.avg > 0, 'the sim and the drawing were timed');
    assert.ok(s.ticks > 0 && s.gameSpeed > 0);
    assert.ok(s.units.max > 8 * 4 && s.bldgs.max >= 8, 'eight seats on the field');
    assert.ok(s.refreshHz > 0);
    for (const k of ['ua', 'cores', 'dpr', 'screen', 'viewport', 'canvas', 'gpu', 'refreshHz']) assert.ok(k in report.device, k);
    assert.ok(report.device.gpu?.renderer, 'the WebGL renderer');
    assert.equal(report.timeline.t.length, report.timeline.fps.length);
    assert.ok(report.timeline.t.length >= 4, 'a line a second');
    assert.equal(report.frames.iv.length, s.frames, 'every frame of a short run kept raw');
    assert.ok(JSON.stringify(report).length < 64 * 1024);

    // Read back by its code, as we would: the same report.
    const got = await (await fetch(`http://localhost:${relay.port}/bench/${code}`)).json();
    assert.equal(got.code, code);
    assert.deepEqual(got.report, report);
    // The game is over: not on the player's record, and the page is still well.
    assert.equal(await p.evaluate(() => Object.keys(localStorage).filter(k => /record/i.test(k)).map(k => localStorage[k]).join('')), '');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
