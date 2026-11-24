// The projection trial (src/client/gl/proj.js): the round trip and the draw order at both angles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProj, parseIso, TURN, SQUASH } from '../src/client/gl/proj.js';

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} against ${b}`);
for (const q of ['34,0.512', '45,0.5', '1']) {
  const p = makeProj(parseIso(q));
  test(`iso=${q}: world to plane and back, up, the area`, () => {
    for (const [x, y] of [[0, 0], [2048, 0], [0, 2048], [1728.5, 333.25], [-64, 9000]]) {
      const b = p.from(p.X(x, y), p.Y(x, y)); near(b.x, x, 'x'); near(b.y, y, 'y');
      const u = p.up(x, y, 37); near(p.X(u.x, u.y), p.X(x, y), 'up keeps X'); near(p.Y(u.x, u.y), p.Y(x, y) - 37, 'up lifts Y');
      const s = p.shift(x, y, 5, -9); near(p.X(s.x, s.y), p.X(x, y) + 5, 'shift X'); near(p.Y(s.x, s.y), p.Y(x, y) - 9, 'shift Y');
    }
    near(p.X(1, 0) * p.Y(0, 1) - p.X(0, 1) * p.Y(1, 0), p.area, 'determinant');
    for (let f = -3; f < 3; f += 0.1) { const a = p.face(f); near(Math.atan2(p.Y(Math.cos(f), Math.sin(f)), p.X(Math.cos(f), Math.sin(f))), a, 'face'); }
  });
  test(`iso=${q}: a unit beside a square footprint sorts in front of the two near walls and behind the two far ones`, () => {
    const x0 = 320, n = 128, mid = p.depth(x0 + n / 2, x0 + n / 2);
    for (let t = 0; t <= n; t += 8) {
      assert.ok(p.depth(x0 + t, x0 + n + 2) > mid && p.depth(x0 + n + 2, x0 + t) > mid, 'front ' + t);
      assert.ok(p.depth(x0 + t, x0 - 2) < mid && p.depth(x0 - 2, x0 + t) < mid, 'behind ' + t);
    }
  });
}
test('iso off: the same numbers', () => {
  const p = makeProj(parseIso(null));
  assert.equal(p.on, false); assert.equal(p.X(3.3, 4.4), 3.3); assert.equal(p.Y(3.3, 4.4), 4.4); assert.deepEqual(p.from(7, 8), { x: 7, y: 8 }); assert.deepEqual(p.up(7, 8, 3), { x: 7, y: 5 });
  assert.equal(parseIso('x'), null); assert.equal(parseIso('0'), null); assert.deepEqual(parseIso('1'), { turn: TURN, squash: SQUASH });
});
