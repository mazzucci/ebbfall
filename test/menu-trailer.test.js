// The trailer on the menu's first page (index.html #menuTrailer and #trailerDlg, src/client/trailer.js): the page holds
// its poster (the game's own file, in the offline cache) and a video with no source, played only on a tap, with its
// sound and controls, never by itself and never looped; the music's credit under it; the file served with byte ranges
// by the site's Worker and never in the offline cache. The page itself, in a browser: test/e2e/menutrailer.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { webOnly } from '../tools/offline/plugin.mjs';
import { MEDIA_PATH, MEDIA_RULE } from '../site/media.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url));
const html = read('index.html').toString(), css = read('src/style.css').toString(), js = read('src/client/trailer.js').toString();
const SRC = js.match(/export const TRAILER_SRC = '\.\/([^']+)';/)?.[1];
const TAG = 'A classic real-time strategy game, free in your browser, on a phone or a desktop. Nothing to install, no account.';
const CC = 'https://creativecommons.org/licenses/by/4.0/';

test('the first page says what the game is: the line under the name, and the page\'s descriptions the same words', () => {
  assert.ok(html.includes(`<div class="tag" id="menuTag">${TAG}</div>`), 'the line');
  for (const k of ['name="description"', 'property="og:description"', 'name="twitter:description"']) assert.ok(html.includes(`<meta ${k} content="${TAG}">`), k);
  assert.ok(html.includes(`"description": "${TAG}",`), 'the VideoGame\'s description');
  assert.ok(!html.includes('time travel was first attempted'), 'the story is the trailer\'s now');
});

test('the poster: a button with a play mark and words naming the game, the game\'s own still between the line and the buttons', () => {
  const b = html.match(/<button type="button" id="menuTrailer" ([^>]*)><img id="menuTrailerPoster" ([^>]*)><span class="play" aria-hidden="true"><i><\/i>WATCH THE TRAILER<\/span><\/button>/);
  assert.ok(b, 'the button, its poster and its play mark');
  assert.match(b[1], /aria-haspopup="dialog"/);
  assert.match(b[1], /aria-label="Watch the Ebbfall trailer, 40 seconds, with sound"/);
  assert.match(b[2], /^src="menu\/trailer\.jpg" width="1280" height="720" alt="" /, 'the poster, its size (the box keeps its shape while it loads), decorative (the button carries the words)');
  assert.ok(html.indexOf('id="menuTag"') < html.indexOf('id="menuTrailer"') && html.indexOf('id="menuTrailer"') < html.indexOf('id="btnSolo"'), 'between the line and the buttons');
  const poster = read('public/menu/trailer.jpg');
  assert.deepEqual([poster[0], poster[1]], [0xff, 0xd8], 'a JPEG');
  assert.ok(poster.length < 150 * 1024, `small: ${Math.round(poster.length / 1024)} KB`);
  assert.ok(!webOnly('menu/trailer.jpg'), 'in the offline cache: no empty frame offline');
});

test('the dialog: the video with no source (nothing fetched before the tap), preload none, controls, inline, never autoplayed, muted or looped; the credit word for word under it, its license a link', () => {
  const d = html.match(/<dialog id="trailerDlg" class="trailer" aria-label="The Ebbfall trailer">([\s\S]*?)<\/dialog>/)?.[1];
  assert.ok(d, 'the dialog');
  const v = d.match(/<video ([^>]*)><\/video>/)?.[1];
  assert.ok(v, 'one video, empty');
  assert.ok(!/\ssrc=/.test(` ${v}`) && !html.includes('.mp4') && !/<source\b/.test(d), 'no source in the page: trailer.js sets it on the tap');
  for (const a of ['controls', 'playsinline', 'preload="none"', 'poster="menu/trailer.jpg"', 'width="1280" height="720"']) assert.ok(v.includes(a), a);
  for (const not of ['autoplay', 'muted', 'loop']) assert.doesNotMatch(` ${v} `, new RegExp(`\\s${not}[\\s=]`), not);
  assert.match(v, /title="Ebbfall trailer: [^"]+"/);
  assert.match(v, /aria-label="The Ebbfall trailer: time travelers from 2047 are stranded in a medieval kingdom in 1447 with no way home\. They need its mines, the King won't abide it, and their armies fight\. By day 675 they are still here\."/);
  assert.ok(d.includes(`<p class="credit" id="trailerCredit">Strength of the Titans Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 / <a href="${CC}" target="_blank" rel="noopener license">${CC}</a> (edited)</p>`), 'the credit');
  assert.match(d, /<button type="button" class="ib x" id="trailerClose" aria-label="Close the trailer">CLOSE<\/button>/);
  assert.match(d, /<p class="note" id="trailerNote" role="status" hidden>The trailer needs a connection\.<\/p>/);
});

test('the script plays it only on a tap, with its sound, and pauses it for good when the dialog closes, the tab hides or a link is followed; a game started lets go of it', () => {
  assert.match(js, /box\.addEventListener\('click', \(\) => \{[\s\S]*?v\.src = TRAILER_SRC;[\s\S]*?v\.play\(\)/, 'the source set and played on the tap');
  assert.equal((js.match(/\.play\(\)/g) || []).length, 1, 'played in one place only: the tap');
  assert.doesNotMatch(js, /\.muted\s*=|\.loop\s*=|\.autoplay|'autoplay'|'muted'|'loop'/, 'its sound on, no loop, no autoplay');
  assert.match(js, /dlg\.addEventListener\('close', pause\)/);
  assert.match(js, /visibilitychange', \(\) => \{ if \(document\.hidden\) pause\(\); \}/);
  assert.match(js, /addEventListener\('pagehide', pause\)/);
  assert.match(js, /closest\?\.\('a\[href\]'\)\) pause\(\)/);
  assert.match(js, /if \(\$\('start'\)\.hidden\) \{ close\(\); release\(\); \}/, 'a game started, from a button or over the socket: let go of');
  assert.doesNotMatch(js, /\.style\b|setAttribute\('style'/, 'no inline style (the site\'s CSP)');
  assert.doesNotMatch(js, /from '\.\/audio\.js'|gameSound|new AudioContext|createMediaElementSource/, 'its sound its own: not the game\'s setting, no WebAudio');
  assert.match(css, /dialog\.trailer\[open\]\{display:flex/);
});

test('the file: the trailer, served with byte ranges by the Worker (Safari needs 206), web-only (never precached), small enough', () => {
  assert.equal(SRC, 'docs/media/ebbfall-trailer.mp4');
  assert.ok(`/${SRC}`.startsWith(MEDIA_PATH) && MEDIA_RULE === `${MEDIA_PATH}*.mp4` && SRC.endsWith('.mp4'), 'under the Worker\'s rule (site/media.js, wrangler.toml run_worker_first)');
  assert.ok(webOnly(SRC), 'not in the offline cache (tools/offline/plugin.mjs WEB_ONLY: docs/)');
  assert.ok(existsSync(new URL(`../public/${SRC}`, import.meta.url)));
  const f = read(`public/${SRC}`);
  assert.ok(f.length < 8 * 1024 * 1024, `under 8 MB: ${Math.round(f.length / 1024)} KB`);
  assert.equal(f.toString('ascii', 4, 8), 'ftyp', 'an MP4');
  assert.ok(f.indexOf('moov') < f.indexOf('mdat'), 'its index first (faststart): it plays before it has all come');
});
