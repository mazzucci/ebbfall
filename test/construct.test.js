// Construction you can read (src/client/construct.js; Notion: "PRD: construction you can read"): the unfinished looks,
// the done moment's curves and timings, a builder's strikes, and the words on the cards and the toast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILDINGS } from '../src/engine/constants.js';
import { BUILD_BAR, DONE, DONE_PUFF, WORK, doneAt, donePuffs, easeOutCubic, easeInQuad, siteHp, siteHurt, strikeCount, strikeAt, atSite, STRIKE_FX, NO_BUILDER, pct, builderLine, siteLine, pausedToast, PAUSED_GAP, REVEAL, revealRows, revealMatrix, frameOf as siteFrame, slabOf, slabMarks } from '../src/client/construct.js';

const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('the designer\'s numbers', () => {
  assert.equal(BUILD_BAR.h, 7, 'the construction bar, taller than the 4 px hp bar');
  assert.deepEqual([DONE.life, DONE.color, DONE.strip, DONE.roof, DONE.heads], [0.5, 0.5, 0.4, 0.3, 0.3], '0.5 s in all');
  assert.deepEqual([DONE.glowUp, DONE.glowPeak, DONE.puffAt], [[0.15, 0.3], 1.25, 0.05]);
  assert.deepEqual([DONE_PUFF.fade, DONE_PUFF.life, DONE_PUFF.vy], [0.35, 0.8, -14], 'the dust: faint, 0.8 s, up at 14 px/s');
  assert.deepEqual([WORK.every, WORK.nudge, WORK.nudgeFrames, WORK.life], [0.55, 1.5, 2, 0.2]);
  assert.equal(PAUSED_GAP, 60, 'once per site per minute');
});

test('the done moment: 0.5 s, ease-out color, what the site stood on a step ahead, then over', () => {
  assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1); near(easeOutCubic(0.5), 0.875, 'ease-out cubic');
  assert.equal(easeInQuad(0.5), 0.25);
  const s = doneAt(0);
  assert.deepEqual([s.color, s.strip, s.roof, s.heads, s.over], [0, 1, 0, 0, false], 't = 0: still the site\'s look');
  const q = doneAt(0.25);
  near(q.color, 0.875, 'a quarter second: mostly in color'); near(q.strip, (1 - 0.25 / 0.4) ** 3, 'the scaffold nearly gone');
  near(q.roof, 1 - (1 - 0.25 / 0.3) ** 2, 'the roof nearly in'); assert.equal(q.over, false);
  const e = doneAt(0.5);
  assert.deepEqual([e.color, e.strip, e.roof, e.heads, e.over], [1, 0, 1, 1, true], 't = 0.5: done with');
  assert.equal(doneAt(0.4).strip, 0, 'the scaffold gone by 0.4 s');
  for (let t = 0; t <= 0.5; t += 0.01) assert.ok(doneAt(t).strip <= 1 - doneAt(t).color + 1e-12, `the scaffold ahead of the paint at ${t}`);
  assert.ok(doneAt(0.26).strip < 0.06, 'next to nothing left of it at 0.26 s (no half-faded plank over the banner)');
  for (let t = 0; t < 0.5; t += 0.01) assert.ok(doneAt(t).color <= doneAt(t + 0.01).color + 1e-12, 'never back');
  // The Expedition's lights: dark until 0.15 s, up to 1.25x by 0.30 s, settling to 1x by 0.50 s.
  assert.equal(doneAt(0.1, true).glow, 0); near(doneAt(0.3, true).glow, 1.25, 'the peak'); near(doneAt(0.5, true).glow, 1, 'settled');
  near(doneAt(0.225, true).glow, 0.625, 'linear on the way up');
  near(doneAt(0.25).glow, doneAt(0.25).color, 'the Kingdom\'s glow follows the color');
});

test('the Kingdom\'s done dust: one puff per two tiles along the front edge', () => {
  assert.equal(donePuffs({ tx: 10, ty: 10, w: 2, h: 2 }).length, 1);
  assert.equal(donePuffs({ tx: 10, ty: 10, w: 3, h: 3 }).length, 2);
  assert.equal(donePuffs({ tx: 10, ty: 10, w: 4, h: 4 }).length, 2);
  const p = donePuffs({ tx: 10, ty: 10, w: 4, h: 3 });
  assert.ok(p.every(q => q.y > 12 * 32 && q.y <= 13 * 32 && q.x > 320 && q.x < 448), 'along the south edge, inside the width');
});

test('a site has taken damage only below the hp its progress gives it', () => {
  const site = (progress, hp, maxhp = 1000) => ({ progress, hp, maxhp, sh: 0, maxsh: 0 });
  near(siteHp(site(0, 0)), 100, 'a tenth at the start'); near(siteHp(site(0.5, 0)), 550, 'plus 0.9 of it over the build');
  near(siteHp(site(0, 0, 50)), 10, 'at least 10');
  assert.equal(siteHurt(site(0.5, 550)), false, 'a growing site is not hurt');
  assert.equal(siteHurt(site(0.5, 500)), true, 'hit');
  assert.equal(siteHurt({ ...site(0.5, 550), sh: 10, maxsh: 50 }), true, 'shields down');
});

test('a builder strikes about twice a second, each from its own phase', () => {
  const strikes = (id) => { let n = 0, last = strikeCount(id, 0); for (let t = 0; t <= 11; t += 1 / 60) { const c = strikeCount(id, t); if (c !== last) n++; last = c; } return n; };
  for (const id of [1, 2, 17, 300]) assert.equal(strikes(id), 20, `builder ${id}: 20 strikes in 11 s`);
  const first = (id) => { for (let t = 0; ; t += 0.001) if (strikeCount(id, t) !== strikeCount(id, 0)) return t; };
  assert.notEqual(Math.round(first(1) * 100), Math.round(first(2) * 100), 'two builders do not strike in step');
  // Where: the contact point on the nearest edge (the footprint 4 px in).
  const b = { x: 208, y: 208, r: 48, tx: 5, ty: 5, w: 3, h: 3 }, u = { x: 200, y: 280, r: 8 };
  const p = strikeAt(u, b);
  near(p.x, 200, 'in line with the builder'); near(p.y, 252, 'on the south wall'); near(p.dy, -1, 'towards the site');
  assert.equal(atSite({ x: 200, y: 256 + 10, r: 8 }, b), true, 'at the south edge');
  assert.equal(atSite({ x: 200, y: 256 + 40, r: 8 }, b), false, 'too far to work');
});

test('the cards and the toast say how far along, rounded down', () => {
  const rax = { d: { name: 'Barracks' }, progress: 0.614 };
  assert.equal(builderLine(rax), 'Constructing Barracks, 61%');
  assert.equal(siteLine(rax, true), 'Constructing, 61%');
  assert.equal(siteLine(rax, false), 'Paused at 61%', 'short: the kind\'s line under it says why');
  assert.equal(NO_BUILDER, 'No builder');
  assert.equal(pausedToast({ ...rax, progress: 0.9 }), 'Barracks paused at 90%');
  assert.equal(pct(0.999), 99, 'never 100% before it stands'); assert.equal(pct(0), 0);
  assert.equal(builderLine(null), 'Constructing');
});

test('the strike effects read: the weld a small bright core gone in a frame or two, the dust bigger and fuller', () => {
  assert.ok(STRIKE_FX.weld.life <= 0.06, 'one frame or two');
  // (the glint's star is 6 world px across: 4-5 css px at the phone's zoom of 1.75; white-blue, not the Kingdom's warm)
  const core = 6 * STRIKE_FX.weld.scale * 1.75;
  assert.equal(STRIKE_FX.weld.anim, 'glint'); assert.ok((STRIKE_FX.weld.tint & 255) === 0xff && (STRIKE_FX.weld.tint >> 16) < 0xe0, 'white-blue');
  assert.ok(core >= 4 && core <= 5.5, `core ${core} css px`);
  assert.ok(STRIKE_FX.dust.scale >= 1.4 && STRIKE_FX.dust.fade >= 0.85, 'the dust reads at 1x');
});

test('the knock is a sound of its own, next to the hit, with a gap', () => {
  const src = readFileSync(new URL('../src/client/audio.js', import.meta.url), 'utf8');
  assert.match(src, /\n {2}knock: \(b, t\) =>/, 'a knock recipe');
  assert.match(src, /GAP = \{ knock: \d+/, 'never more than one at a time');
});

test('the new look\'s site: in color to 90% of its height until done, the rest gray; its frame goes from side corner to side corner', () => {
  assert.equal(revealRows(0), 1); assert.equal(revealRows(1), Math.round(REVEAL.rows * REVEAL.cap)); assert.ok(revealRows(0.99) < REVEAL.rows);
  let last = 0; for (let p = 0; p <= 1; p += 0.01) { const k = revealRows(p); assert.ok(k >= last); last = k; }
  const gray = revealMatrix(0); assert.deepEqual(gray.slice(0, 5), gray.slice(5, 10)); assert.deepEqual(revealMatrix(1).slice(0, 5).map(v => Math.round(v * 1e9) / 1e9), [1, 0, 0, 0, 0]);
  for (const base of [[[-60, 8], [20, 40], [60, 8], [-20, -24]], [[60, 8], [-20, -24], [-60, 8], [20, 40]], Array.from({ length: 24 }, (_, i) => [30 * Math.cos(i * Math.PI / 12), 15 * Math.sin(i * Math.PI / 12)])]) {
    const f = siteFrame(base), mean = (h) => h.reduce((t, p) => t + p[1], 0) / h.length;
    for (const h of [f.front, f.back]) assert.deepEqual([h[0], h.at(-1)], f.sides, 'each half joins the side corners');
    assert.ok(f.sides[0][0] < f.sides[1][0] && mean(f.front) > mean(f.back), 'left and right; the front half the nearer one');
    assert.equal(new Set([...f.front, ...f.back]).size, base.length, 'every point in one half');
  }
});

test('the Expedition\'s slab: its outline a little larger, never smaller than a third of the footprint each way; its marks at the corners', () => {
  const hall = [[-38, 4.2], [11.7, 20], [38, 3.8], [-11.7, -12]], ring = (r) => Array.from({ length: 24 }, (_, i) => [r * Math.cos(i * Math.PI / 12), 4 + r * 0.5 * Math.sin(i * Math.PI / 12)]);
  const half = (p) => Math.max(...p.map(q => q[0])); const s = slabOf(hall, 2);
  assert.ok(Math.abs(half(s) - 38 - REVEAL.ex.grow) < 1e-9 && s.length === 4, 'grown');
  assert.ok(Math.abs(half(slabOf(ring(8.6), 2)) - REVEAL.ex.least * 64) < 1e-6, 'a turbine\'s foot still gets a slab');
  const m = slabMarks(s); assert.equal(m.length, 4); for (const l of m) assert.equal(l.length, 3);
  assert.ok(slabMarks(slabOf(ring(28), 2)).length === 4 && slabMarks(s).flat().every(([x, y]) => Math.abs(x) <= half(s) && Number.isFinite(y)), 'on the slab');
});
