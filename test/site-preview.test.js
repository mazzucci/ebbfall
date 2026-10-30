// What a shared link shows (site/preview.js) and the head every visit and crawler gets (index.html): a room's link
// gets its own card only for a code the relay could have made (hostile, overlong or vowel-bearing codes get the site's
// card, and nothing of the query reaches the page but the code), the card's fields land on tags index.html has, the
// head's title, description, canonical, Open Graph and X tags and structured data, the preview image (public/og.png:
// 1200x630, small), robots.txt and sitemap.xml, and that none of those is stored for offline play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ORIGIN, ROOM_ALPHABET, ROOM_LETTERS, roomCode, preview, edits, TAGS } from '../site/preview.js';
import { WEB_ONLY, offline } from '../tools/offline/plugin.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const at = (q) => new URL(`${ORIGIN}/${q}`);
const html = read('index.html');
const head = html.slice(0, html.indexOf('</head>'));
/** The content of index.html's <meta> with this property or name (exactly one such tag). */
function meta(key) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/g)].map(m => m[0]).filter(t => t.includes(`property="${key}"`) || t.includes(`name="${key}"`));
  assert.equal(tags.length, 1, `one <meta> for ${key}`);
  return tags[0].match(/content="([^"]*)"/)[1];
}

test("a room's code: the relay's four letters only, upper-cased as the client reads it", () => {
  const code = (q) => roomCode(new URLSearchParams(q));
  assert.equal(code('room=WGNJ'), 'WGNJ');
  assert.equal(code('room=wgnj'), 'WGNJ', 'lower case, as the client takes it');
  assert.equal(code('join=WGNJ'), 'WGNJ', 'the links before ?room=');
  assert.equal(code('room=WGNJ&join=BCDF'), 'WGNJ', '?room= first, as the client');
  for (const bad of ['', 'room=', 'room=WGN', 'room=WGNJX', 'room=WGNJWGNJ', 'room=ABCD', 'room=WGN1', 'room=WG-J', 'room=%20WGNJ',
    'room=%3Cscript%3E', 'room=<script>alert(1)</script>', 'room=WGNJ%22', 'room=W%22NJ', 'room=%C3%9FGNJ', 'room=' + 'B'.repeat(5000), 'seed=7', 'bench']) {
    assert.equal(code(bad), null, bad);
  }
});

test("a room's link has a card of its own: which room, the canonical page with the room as its url", () => {
  assert.deepEqual(preview(at('?room=WGNJ')), {
    title: 'Join my Ebbfall game: room WGNJ',
    description: 'Tap to join the room and play with me in your browser: free, nothing to install.',
    url: 'https://ebbfall.com/?room=WGNJ',
  });
  assert.equal(preview(at('?room=wgnj&relay=wss://x.example/')).url, 'https://ebbfall.com/?room=WGNJ', 'only the room: no other parameter');
  assert.equal(preview(at('?join=WGNJ')).title, 'Join my Ebbfall game: room WGNJ');
  assert.equal(preview(at('index.html?room=WGNJ')).url, 'https://ebbfall.com/?room=WGNJ');
});

test("anything else keeps the site's card: hostile, overlong and unknown links reflect nothing", () => {
  for (const q of ['', '?seed=7', '?bench', '?room=<script>', '?room=%3Cscript%3Ealert(1)%3C/script%3E', '?room=WGNJX', '?room=ABCD',
    '?room="onload="x', '?join=WGN%00', '?room=' + 'Z'.repeat(1000)]) {
    assert.equal(preview(at(q)), null, q);
  }
  // Whatever the link, a card's text is plain: no markup, quotes or entities to escape.
  for (const code of ['BCDF', 'ZZZZ', 'WGNJ']) for (const v of Object.values(preview(at(`?room=${code}`)))) assert.match(v, /^[^<>&"'\u0000-\u001f]*$/);
});

test("the room alphabet is the relay's (every place that makes a code)", () => {
  assert.equal(ROOM_LETTERS, 4);
  for (const f of ['relay/worker.js', 'relay/server.mjs', 'relay/bench.js']) {
    assert.equal(read(f).match(/const ALPHABET = '([A-Z]+)'/)[1], ROOM_ALPHABET, f);
  }
  assert.match(read('relay/worker.js'), /Array\.from\(\{ length: 4 \}/, 'four letters a room');
  assert.match(read('src/client/online.js'), /\.slice\(0, 4\)/, 'the client reads four');
});

test("a card's fields go to tags index.html has, one each", () => {
  const card = preview(at('?room=WGNJ'));
  const e = edits(card);
  assert.equal(e.length, Object.values(TAGS).flat().length);
  for (const [sel, content] of e) {
    const [, attr, key] = sel.match(/^meta\[(property|name)="([^"]+)"\]$/);
    assert.ok(head.includes(`<meta ${attr}="${key}"`), sel);
    meta(key);
    assert.ok(Object.values(card).includes(content));
  }
  assert.deepEqual(edits(null), []);
  assert.deepEqual(edits({ title: 'T' }).map(([s]) => s), TAGS.title);
});

test("index.html's head: title, description, canonical, Open Graph and X cards, the app's metas unchanged", () => {
  const title = head.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(title, 'Ebbfall: a free browser RTS in the 1998 mold');
  const description = meta('description');
  assert.ok(description.length >= 70 && description.length <= 160, `a description of search-result length: ${description.length}`);
  assert.match(head, /<link rel="canonical" href="https:\/\/ebbfall\.com\/">/);
  assert.equal(meta('og:type'), 'website');
  assert.equal(meta('og:site_name'), 'Ebbfall');
  assert.equal(meta('og:title'), title);
  assert.equal(meta('og:description'), description);
  assert.equal(meta('og:url'), `${ORIGIN}/`);
  assert.equal(meta('og:image'), `${ORIGIN}/og.png`);
  assert.equal(meta('og:image:type'), 'image/png');
  assert.ok(meta('og:image:alt').length > 20);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('twitter:title'), title);
  assert.equal(meta('twitter:description'), description);
  assert.equal(meta('twitter:image'), meta('og:image'));
  assert.equal(meta('twitter:image:alt'), meta('og:image:alt'));
  assert.match(meta('viewport'), /user-scalable=no/, 'the app metas as they were');
  assert.equal(meta('apple-mobile-web-app-title'), 'Ebbfall');
  assert.equal(meta('theme-color'), '#0b0f16');
});

test('structured data: a free web game, single player and multiplayer, nothing it does not have', () => {
  const ld = JSON.parse(head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.deepEqual(ld['@type'], ['VideoGame', 'WebApplication']);
  assert.equal(ld.name, 'Ebbfall');
  assert.equal(ld.url, `${ORIGIN}/`);
  assert.equal(ld.image, meta('og:image'));
  assert.equal(ld.description, meta('description'));
  assert.equal(ld.genre, 'Real-time strategy');
  assert.equal(ld.gamePlatform, 'Web browser');
  assert.equal(ld.operatingSystem, 'Any');
  assert.deepEqual(ld.playMode, ['https://schema.org/SinglePlayer', 'https://schema.org/MultiPlayer']);
  assert.equal(ld.offers.price, '0');
  assert.equal(ld.numberOfPlayers.maxValue, 8, "the most players a game seats (src/client/maps.js MAX_PLAYERS)");
  for (const k of ['aggregateRating', 'review', 'contentRating']) assert.ok(!(k in ld), `no ${k}: nothing made up`);
});

test('the preview image: a 1200x630 PNG as the head says, small enough for every app', () => {
  const png = readFileSync(new URL('../public/og.png', import.meta.url));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), +meta('og:image:width'));
  assert.equal(png.readUInt32BE(20), +meta('og:image:height'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.ok(png.length < 300 * 1024, `${Math.round(png.length / 1024)} KB`);
});

test('robots.txt lets everything be crawled and names the sitemap; the sitemap lists the game', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \S/m);
  assert.match(robots, new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
  const sitemap = read('public/sitemap.xml');
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]), [`${ORIGIN}/`]);
});

test('the files for crawlers and previews are not stored for offline play (the build\'s service worker leaves them out)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'endfall-sw-'));
  try {
    for (const f of ['index.html', 'og.png', 'robots.txt', 'sitemap.xml', 'icon.svg']) writeFileSync(join(dir, f), f);
    const plugin = offline();
    plugin.configResolved({ build: { outDir: dir }, define: {} });
    plugin.closeBundle();
    const files = JSON.parse(readFileSync(join(dir, 'sw.js'), 'utf8').match(/^const FILES = (.*);$/m)[1]);
    assert.deepEqual(files, ['./', 'icon.svg', 'index.html']);
    assert.deepEqual([...WEB_ONLY].sort(), ['og.png', 'robots.txt', 'sitemap.xml']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
