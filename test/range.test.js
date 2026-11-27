// The range's circles (src/client/range.js): in range by the sim's rule (exact distance, the edge included), and the
// outline of their union as arcs, none inside another circle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inRange, unionArcs } from '../src/client/range.js';

const TAU = Math.PI * 2;
const length = (arcs) => arcs.reduce((n, [, , r, a, b]) => n + r * (b - a), 0);
/** Points along the arcs, each `step` px. */
const along = (arcs, step = 2) => arcs.flatMap(([x, y, r, a, b]) => Array.from({ length: Math.ceil(r * (b - a) / step) + 1 }, (_, i) => { const t = a + (b - a) * Math.min(1, i * step / (r * (b - a))); return [x + Math.cos(t) * r, y + Math.sin(t) * r]; }));

test('in range: within a circle by exact distance, its edge included, never just past it', () => {
  const c = [{ x: 100, y: 100, r: 576 }];
  assert.ok(inRange(c, 100 + 576, 100), 'on the edge');
  assert.ok(!inRange(c, 100 + 576.01, 100), 'just past it');
  assert.ok(inRange(c, 100 + 400, 100 + 400), 'inside, off the axes');
  assert.ok(!inRange([], 0, 0), 'no source, no range');
  assert.ok(inRange([...c, { x: 2000, y: 100, r: 384 }], 1700, 100), 'in either circle');
});

test('the outline: one circle is a whole turn; two apart are two; one inside another adds nothing', () => {
  assert.deepEqual(unionArcs([{ x: 0, y: 0, r: 10 }]).map(a => a[4] - a[3]), [TAU]);
  assert.equal(unionArcs([{ x: 0, y: 0, r: 10 }, { x: 100, y: 0, r: 10 }]).length, 2);
  const nested = unionArcs([{ x: 0, y: 0, r: 100 }, { x: 20, y: 0, r: 30 }]);
  assert.equal(nested.length, 1); assert.equal(nested[0][2], 100);
  const twice = unionArcs([{ x: 5, y: 5, r: 50 }, { x: 5, y: 5, r: 50 }]);
  assert.equal(twice.length, 1, 'a second copy of a circle is drawn once');
  assert.deepEqual(unionArcs([]), []);
});

test('the outline of overlapping circles is their union\'s edge: on the edge of one, inside none, as long as it should be', () => {
  const cs = [{ x: 0, y: 0, r: 576 }, { x: 700, y: 0, r: 384 }, { x: 300, y: 500, r: 384 }];
  const arcs = unionArcs(cs);
  for (const [x, y] of along(arcs)) assert.ok(!cs.some(c => Math.hypot(c.x - x, c.y - y) < c.r - 1e-6), `(${x.toFixed(1)}, ${y.toFixed(1)}) lies inside no circle`);
  // Two equal circles a radius apart: each loses a third of its turn to the other.
  const pair = unionArcs([{ x: 0, y: 0, r: 60 }, { x: 60, y: 0, r: 60 }]);
  assert.ok(Math.abs(length(pair) - 2 * 60 * (TAU - TAU / 3)) < 1e-6, `the pair's outline: ${length(pair)}`);
  // An arc across angle 0 is one arc: the left circle of the pair keeps one arc, from 60 to 300 degrees.
  assert.equal(pair.filter(a => a[0] === 0).length, 1);
});
