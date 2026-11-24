// The new look's light (tools/newart/tone.mjs): the curve lifts the midtones, keeps white from clipping and leaves alpha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tone } from '../tools/newart/tone.mjs';

const one = (r, g, b, a = 255) => [...tone(Uint8ClampedArray.from([r, g, b, a]))];
test('black stays near black, white stays white, gray lifts, alpha is untouched', () => {
  assert.deepEqual(one(0, 0, 0), [0, 0, 0, 255]);
  const w = one(255, 255, 255); assert.ok(w.slice(0, 3).every(v => v >= 250), String(w));
  const m = one(110, 110, 110); assert.ok(m.slice(0, 3).every(v => v > 130 && v < 190), String(m));
  assert.equal(one(60, 90, 40, 17)[3], 17);
});
test('a darker gray is never lighter than a lighter one (the roll-off keeps order)', () => {
  let last = -1; for (let x = 0; x < 256; x++) { const v = one(x, x, x)[1]; assert.ok(v >= last, `${x}: ${v} after ${last}`); last = v; }
});
