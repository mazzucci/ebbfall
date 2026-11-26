// The rally flag's red (src/client/gl/rallyflag.js): an order's mark, never to be taken for a seat's flag, so clear of
// every seat's color, the two reds (the rose, the orange-red) above all. (Its shape and its ring tell it apart too.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEAT_COLORS } from '../src/client/look.js';
import { RALLY_RED, RALLY_EDGE } from '../src/client/gl/rallyflag.js';

/** CIE Lab of an sRGB color (D65). */
function lab(c) {
  const [r, g, b] = [c >> 16, c >> 8 & 255, c & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const apart = (p, q) => Math.hypot(...lab(p).map((v, i) => v - lab(q)[i]));

test('the rally flag is red, under a dark outline, and apart from every seat\'s color', () => {
  const [r, g, b] = [RALLY_RED >> 16, RALLY_RED >> 8 & 255, RALLY_RED & 255];
  assert.ok(r > 180 && g < 40 && b < 50, `red: ${[r, g, b]}`);
  assert.ok(lab(RALLY_EDGE)[0] < 10, 'its outline dark');
  for (const [seat, c] of SEAT_COLORS.entries()) assert.ok(apart(RALLY_RED, c) > 15, `seat ${seat}'s color: ${apart(RALLY_RED, c).toFixed(1)}`);
});
