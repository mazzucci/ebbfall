// The lobby's QR code (src/client/qr.js): drawn, then read back with a decoder (jsQR, a dev dependency), as a phone's
// camera would: the exact link, at error correction M, with a quiet zone. The SVG itself is read back too, its
// rectangles painted onto a pixel grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { qrModules, qrSvg, qrImage, LEVEL, QUIET } from '../src/client/qr.js';

const LINKS = [
  'https://ebbfall.com/?room=ABCD', // (today's four letters)
  'https://ebbfall.com/?room=QWERTY', // (six, as rooms will have)
  'http://localhost:5173/?room=ZXCVBN',
  'http://192.168.1.23:5173/?room=ABCDEF&relay=ws%3A%2F%2F192.168.1.23%3A8788%2F', // (a LAN game with its relay)
  'https://some-machine.tail1234.ts.net/endfall/?room=MNBVCX&relay=wss%3A%2F%2Fsome-machine.tail1234.ts.net%3A8788%2F',
];

/** A grid of modules (true: dark) as an RGBA image, `px` pixels a module, with `quiet` light modules round it. */
function image(grid, px = 4, quiet = QUIET) {
  const n = grid.length + 2 * quiet, w = n * px, data = new Uint8ClampedArray(w * w * 4).fill(255);
  grid.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
      const i = (((y + quiet) * px + dy) * w + (x + quiet) * px + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }));
  return { data, w };
}
const read = ({ data, w }) => jsQR(data, w, w, { inversionAttempts: 'dontInvert' });

/** The SVG's modules: its viewBox's size and every `M x y h w v1 h-w z` rectangle painted on a grid (quiet zone included). */
function svgGrid(svg) {
  const size = Number(svg.match(/viewBox="0 0 (\d+) \1"/)[1]);
  assert.match(svg, new RegExp(`<rect width="${size}" height="${size}" fill="#fff"/>`), 'a white ground under the whole code');
  const grid = Array.from({ length: size }, () => Array(size).fill(false));
  const d = svg.match(/<path d="([^"]*)" fill="#000"\/>/)[1];
  for (const [, x, y, w, back] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    assert.equal(w, back);
    for (let i = 0; i < Number(w); i++) grid[Number(y)][Number(x) + i] = true;
  }
  assert.equal(d.replace(/M\d+ \d+h\d+v1h-\d+z/g, ''), '', 'only rectangles');
  return grid;
}

/** The error correction level the code says it has (its format information, beside the top-left finder). */
function level(grid) {
  const n = grid.length, bit = (r, c) => (grid[r][c] ? 1 : 0);
  let bits = 0;
  for (let c = 0; c <= 5; c++) bits = bits << 1 | bit(8, c); // bits 14..9
  bits = bits << 1 | bit(8, 7); bits = bits << 1 | bit(8, 8); bits = bits << 1 | bit(7, 8); // 8, 7, 6
  for (let r = 5; r >= 0; r--) bits = bits << 1 | bit(r, 8); // 5..0
  assert.ok(n >= 21);
  return ['M', 'L', 'H', 'Q'][((bits ^ 0b101010000010010) >> 13) & 3];
}

test('the room\'s link reads back exactly, from the modules and from the SVG, at error correction M', () => {
  assert.equal(LEVEL, 'M');
  for (const url of LINKS) {
    const grid = qrModules(url);
    assert.equal(level(grid), 'M', `${url}: level M`);
    for (const px of [3, 6]) assert.equal(read(image(grid, px))?.data, url, `${url} at ${px} px a module`);
    const svg = svgGrid(qrSvg(url));
    assert.equal(svg.length, grid.length + 2 * QUIET, 'four light modules round the code');
    assert.ok(svg.slice(0, QUIET).every(r => r.every(v => !v)) && svg.every(r => r.slice(0, QUIET).every(v => !v)), 'the quiet zone is light');
    assert.deepEqual(svg.slice(QUIET, -QUIET).map(r => r.slice(QUIET, -QUIET)), grid, 'the SVG draws the same modules');
    assert.equal(read(image(svg, 4, 0))?.data, url, `${url} from the SVG`);
  }
});

test('a short link stays a small code (big modules on a phone\'s screen): a room\'s link on the site is version 3 at most', () => {
  for (const url of LINKS.slice(0, 2)) assert.ok(qrModules(url).length <= 29, `${url}: ${qrModules(url).length} modules a side`);
});

test('the image is an SVG data address (no network)', () => {
  const src = qrImage(LINKS[1]);
  assert.match(src, /^data:image\/svg\+xml,/);
  assert.equal(decodeURIComponent(src.slice('data:image/svg+xml,'.length)), qrSvg(LINKS[1]));
});
