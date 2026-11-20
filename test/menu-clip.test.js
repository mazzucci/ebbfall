// The gameplay clip on the menu's first page (index.html #menuClip, src/client/menuclip.js): its poster is the game's
// own copy of the docs' (public/menu/clip-*.webp, tools/menu-clip.mjs), so an installed copy with no connection shows
// it (the docs are web-only); the page holds the poster alone, never the video; the clip is the docs' file. The page
// itself, in a browser: test/e2e/menuclip.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { webOnly } from '../tools/offline/plugin.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url));
const shots = JSON.parse(read('tools/docs/shots.json')), clip = shots.trailer, poster = shots[clip.poster];
const html = read('index.html').toString(), css = read('src/style.css').toString(), js = read('src/client/menuclip.js').toString();

/** A WebP's chunk ids and, from its VP8 frame header, its size. */
function webp(buf) {
  assert.equal(buf.toString('ascii', 0, 4) + buf.toString('ascii', 8, 12), 'RIFFWEBP');
  const ids = []; let size = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), n = buf.readUInt32LE(o + 4);
    ids.push(id);
    if (id === 'VP8 ') size = [buf.readUInt16LE(o + 8 + 6) & 0x3fff, buf.readUInt16LE(o + 8 + 8) & 0x3fff];
    o += 8 + n + (n & 1);
  }
  return { ids, size };
}

test("the menu's posters: the docs' 720 px poster byte for byte and a 1280 px one, the clip's shape, opaque", () => {
  const small = read('public/menu/clip-720.webp'), mid = read('public/menu/clip-1280.webp');
  assert.ok(small.equals(read(`public/docs/img/shots/${poster.files.phone}`)), "clip-720.webp is the docs' poster (a clip recorded again: node tools/menu-clip.mjs)");
  assert.deepEqual([webp(small).size, webp(mid).size], [[720, 360], [1280, 640]]);
  assert.equal(clip.w / clip.h, 2, 'the clip is 2:1, as its posters');
  for (const [name, f] of [['clip-720.webp', small], ['clip-1280.webp', mid]]) assert.ok(!webp(f).ids.includes('ALPH'), `${name}: no alpha`);
  assert.ok(mid.length < 100 * 1024 && small.length < 50 * 1024, `small files: ${Math.round(small.length / 1024)} and ${Math.round(mid.length / 1024)} KB`);
});

test('the first page holds the poster alone: an image of the clip\'s shape with the clip\'s words, no video, nothing of the mp4', () => {
  const img = html.match(/<div class="clip" id="menuClip"><img id="menuClipPoster" ([^>]*)><\/div>/);
  assert.ok(img, 'the poster in #menuClip, and nothing else there');
  const attr = (k) => img[1].match(new RegExp(`(?:^| )${k}="([^"]*)"`))?.[1];
  assert.equal(attr('src'), 'menu/clip-720.webp');
  assert.equal(attr('srcset'), 'menu/clip-720.webp 720w, menu/clip-1280.webp 1280w');
  assert.deepEqual([attr('width'), attr('height')], [String(clip.w), String(clip.h)], "the clip's size: the box keeps its shape while the poster loads");
  assert.equal(attr('alt'), poster.alt, "the docs' words for the clip");
  assert.ok(attr('sizes'), 'sizes: a phone at 2x takes the 720 px poster, not the larger');
  assert.ok(!/<video\b/.test(html) && !html.includes('.mp4'), 'no video and no mp4 in the page: menuclip.js makes it');
  // Between the premise line and the buttons.
  assert.ok(html.indexOf('id="menuTag"') < html.indexOf('id="menuClip"') && html.indexOf('id="menuClip"') < html.indexOf('id="btnSolo"'));
});

test("the clip is the docs' file, web-only; its posters are the game's, in the offline cache", () => {
  assert.match(js, new RegExp(`export const CLIP_SRC = '\\./docs/media/${clip.file.replace('.', '\\.')}';`), 'menuclip.js plays the docs\' clip');
  assert.ok(existsSync(new URL(`../public/docs/media/${clip.file}`, import.meta.url)));
  assert.ok(webOnly(`docs/media/${clip.file}`), 'the clip is not in the offline cache (a byte range is the browser\'s anyway: tools/offline/sw.js)');
  for (const f of ['menu/clip-720.webp', 'menu/clip-1280.webp']) assert.ok(!webOnly(f), `${f} is in the offline cache: no empty frame offline`);
});

test('less asked for, less done: the module checks reduced motion and Save-Data before it makes a video, and the stylesheet has no inline style to need', () => {
  assert.match(js, /prefers-reduced-motion: reduce/); assert.match(js, /saveData/);
  assert.ok(!/\.style\b|setAttribute\('style'/.test(js), 'no style set from the script: the fade is a class (#menuClip.on)');
  assert.match(css, /#menuClip video\{opacity:0;transition:opacity \.5s\} #menuClip\.on video\{opacity:1\}/);
});

test('Watch the trailer is in the footer line but hidden (until the new trailer is live); the three-link rules wait for it', () => {
  assert.match(html, /<a id="linkTrailer" href="\.\/docs\/#trailer" target="_blank" rel="noopener" hidden>Watch the trailer<\/a>/);
  assert.equal((css.match(/#menuFoot:has\(#linkTrailer:not\(\[hidden\]\)\)/g) || []).length, 4, 'the narrow screens\' three-link rules apply only while it shows');
});
