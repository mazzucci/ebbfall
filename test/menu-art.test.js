// The field under the menu's first page (public/menu/menu-<class>.webp, tools/menu-art.mjs) is opaque: its top fade is
// baked into the floor's color, not into transparency. Safari on iPhone and iPad (Apple's image decoder, iOS 26) drew
// these WebPs' alpha as opaque, so the band showed a hard top edge and no fade, while every other browser faded it; the
// browser tests cannot see that (Playwright's WebKit decodes WebP with libwebp), so the files are checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../public/menu/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.webp'));

/** A WebP's chunks (RIFF): [{ id, data }]. */
function chunks(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const out = [];
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), n = buf.readUInt32LE(o + 4);
    out.push({ id, data: buf.subarray(o + 8, o + 8 + n) });
    o += 8 + n + (n & 1);
  }
  return out;
}

test('the menu field images are there: one per size class', () => {
  assert.deepEqual(files.sort(), ['menu-desktop.webp', 'menu-landscape.webp', 'menu-portrait.webp', 'menu-wide.webp']);
});

for (const f of files) {
  test(`${f} has no alpha channel: the fade is baked into the floor's color (Safari drew the alpha as opaque)`, () => {
    const cs = chunks(readFileSync(new URL(f, dir)));
    const ids = cs.map((c) => c.id);
    assert.ok(!ids.includes('ALPH'), `${f}: no ALPH chunk (${ids.join(' ')})`);
    const x = cs.find((c) => c.id === 'VP8X');
    if (x) assert.equal(x.data[0] & 0x10, 0, `${f}: the VP8X alpha flag is clear`);
    const l = cs.find((c) => c.id === 'VP8L');
    if (l) assert.equal((l.data[4] >> 4) & 1, 0, `${f}: a lossless image without its alpha bit`);
    assert.ok(ids.includes('VP8 ') || ids.includes('VP8L'), `${f}: an image chunk`);
  });
}
