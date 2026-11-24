// What a shared link shows (site/preview.js) and the head every visit and crawler gets (index.html): every link to the
// game's page is a file with the site's card; a room's card address (/r/CODE, what SHARE LINK gives on the site) gets
// the room's own card only for a code the relay could have made (hostile, overlong or vowel-bearing codes get none, and
// nothing of the address reaches the page but the code), on the site's image as index.html says it, and goes on to
// the room by one script; a challenge's (/vs/CODE, SHARE after a victory on the site) the same, for exactly a code the
// game makes, its words made from the code's values; the head's title, description, canonical, Open Graph and X tags and structured data, the
// preview image (public/og.png: 1200x630, small), robots.txt, and that none of those (nor the docs, the sitemap,
// llms.txt) is stored for offline play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ORIGIN, ROOM_ALPHABET, ROOM_LETTERS, SITE_CARD, CARD_SCRIPT, VS_PATH, roomCode, roomCard, roomPage, challengeCode, challengeCard, challengePage } from '../site/preview.js';
import { SITE, shareLink } from '../src/net/roomcode.js';
import { WEB_ONLY, offline } from '../tools/offline/plugin.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html');
const head = html.slice(0, html.indexOf('</head>'));
/** The content of index.html's <meta> with this property or name (exactly one such tag). */
function meta(key) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/g)].map(m => m[0]).filter(t => t.includes(`property="${key}"`) || t.includes(`name="${key}"`));
  assert.equal(tags.length, 1, `one <meta> for ${key}`);
  return tags[0].match(/content="([^"]*)"/)[1];
}

test("a room's code in its card address (/r/CODE): the relay's six letters only, read as the client reads them", () => {
  assert.equal(roomCode('/r/WGNJKL'), 'WGNJKL');
  assert.equal(roomCode('/r/wgnjkl'), 'WGNJKL', 'lower case, as the client takes it');
  assert.equal(roomCode('/r/WGN-JKL'), 'WGNJKL', 'as it is shown');
  assert.equal(roomCode('/r/wgn%20jkl'), 'WGNJKL', 'with a space');
  assert.equal(roomCode('/r/WGNJKL/'), 'WGNJKL', 'a trailing slash');
  for (const bad of ['', '/', '/r/', '/r/WGN', '/r/WGNJ', '/r/BCDF', '/r/WGNJK', '/r/WGNJKLX', '/r/ABCDFG', '/r/WGNJK1', '/r/WG.NJKL', '/r/WGN_JKL',
    '/r/%3Cscript%3E', '/r/<script>alert(1)</script>', '/r/WGNJKL%22', '/r/W%22NJKL', '/r/%C3%9FGNJKL', '/r/%E0%A4%A', '/r/WGNJKL/x', '/r/x/WGNJKL',
    '/r/' + 'B'.repeat(5000), '/r/' + '-'.repeat(40) + 'WGNJKL', '/WGNJKL', '/room/WGNJKL', '/?room=WGNJKL', null, 7]) {
    assert.equal(roomCode(bad), null, String(bad).slice(0, 60));
  }
});

test("a room's card: which room, the card's own address as its url, the game's page for the room to go on to", () => {
  assert.deepEqual(roomCard('WGNJKL'), {
    title: 'Join my Ebbfall game: room WGN-JKL',
    description: 'Tap to join the room and play with me in your browser: free, nothing to install.',
    url: 'https://ebbfall.com/r/WGNJKL',
    go: '/?room=WGNJKL',
  });
  assert.equal(roomCard('wgn-jkl').url, 'https://ebbfall.com/r/WGNJKL');
  for (const bad of ['', 'ABCDFG', 'WGNJKLX', '<script>', null]) { assert.equal(roomCard(bad), null, String(bad)); assert.equal(roomPage(bad), null, String(bad)); }
  // Whatever the link, a card's text is plain: no markup, quotes or entities to escape.
  for (const code of ['BCDFGH', 'ZZZZZZ', 'WGNJKL', 'wgn-jkl']) for (const v of Object.values(roomCard(code))) assert.match(v, /^[^<>&"'\u0000-\u001f]*$/);
});

test("SHARE LINK in a room: the card address on the site, the game's page with ?room= anywhere else (no Worker there)", () => {
  assert.equal(SITE, ORIGIN);
  assert.equal(shareLink('WGNJKL', 'https://ebbfall.com', 'https://ebbfall.com/?room=WGNJKL'), 'https://ebbfall.com/r/WGNJKL');
  for (const origin of ['http://127.0.0.1:5173', 'http://192.168.1.4:5173', 'https://www.ebbfall.com', 'http://ebbfall.com']) {
    assert.equal(shareLink('WGNJKL', origin, `${origin}/?room=WGNJKL`), `${origin}/?room=WGNJKL`, origin);
  }
  assert.match(read('src/client/online.js'), /shareLink\(code, location\.origin, joinLink\(code\)\)/, 'online.js shares it');
});

test("the room's card page: the room's card on the site's image, one script on to the room, nothing of the address but the code", () => {
  const page = roomPage('wgn-jkl');
  const tag = (key) => { const m = page.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`, 'g')); assert.equal(m?.length, 1, key); return m[0].match(/content="([^"]*)"/)[1]; };
  for (const k of ['og:title', 'twitter:title']) assert.equal(tag(k), 'Join my Ebbfall game: room WGN-JKL');
  for (const k of ['og:description', 'twitter:description', 'description']) assert.equal(tag(k), 'Tap to join the room and play with me in your browser: free, nothing to install.');
  assert.equal(tag('og:url'), 'https://ebbfall.com/r/WGNJKL');
  // The site's card fields, as index.html says them.
  for (const k of ['og:site_name', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:image', 'twitter:image:alt']) assert.equal(tag(k), meta(k), k);
  assert.deepEqual(Object.values(SITE_CARD), ['og:site_name', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt'].map(meta));
  assert.equal(tag('robots'), 'noindex', 'not a page to index: the game is');
  assert.ok(page.includes(`<script>${CARD_SCRIPT}</script>`));
  assert.equal(page.match(/<script/g).length, 1);
  assert.doesNotMatch(page, /wgn/, 'the code as the card writes it, not as the link did');
});

test("a challenge's code in its card address (/vs/CODE): exactly a code the game makes, nothing decoded or tidied", () => {
  const code = '1.8.5.ky.h00v12v22v32';
  assert.equal(VS_PATH, '/vs/');
  assert.equal(challengeCode(`/vs/${code}`), code);
  assert.equal(challengeCode(`/vs/${code}/`), code, 'a trailing slash');
  assert.equal(challengeCode('/vs/1.0.1.4z.v00h12'), '1.0.1.4z.v00h12');
  for (const bad of ['', '/', '/vs/', `/vs/${code}.`, `/vs/${code.toUpperCase()}`, `/vs/${code.replace(/\./g, '%2E')}`, `/vs/ ${code}`, `/vs/${code}/x`, `/vs/x/${code}`,
    '/vs/2.8.5.ky.h00v12v22v32', '/vs/1.8.5.ky.h00v12v22v3', '/vs/1.99.5.ky.h00v12', '/vs/<script>', '/vs/%3Cscript%3E', `/vs/${code}%22`, '/vs/' + '1.'.repeat(3000), `/VS/${code}`, `/?vs=${code}`, `/r/${code}`, null, 7]) {
    assert.equal(challengeCode(bad), null, String(bad).slice(0, 60));
  }
});

test("a challenge's card and page: its words from the code's values, its card address as its url, on to /?vs= by the room's script", () => {
  const code = '1.8.5.ky.h00v12v22v32';
  assert.deepEqual(challengeCard(code), {
    title: 'Can you beat this? 1 vs 3 Hard AIs on Iron Compass',
    description: 'Kingdom vs Expedition · won in 12:34 · free, in your browser',
    url: `https://ebbfall.com/vs/${code}`,
    go: `/?vs=${code}`,
  });
  for (const bad of ['', '2.8.5.ky.h00v12v22v32', '<script>', null]) { assert.equal(challengeCard(bad), null, String(bad)); assert.equal(challengePage(bad), null, String(bad)); }
  const page = challengePage(code);
  const tag = (key) => page.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))[1];
  for (const k of ['og:title', 'twitter:title']) assert.equal(tag(k), 'Can you beat this? 1 vs 3 Hard AIs on Iron Compass');
  assert.equal(tag('og:url'), `https://ebbfall.com/vs/${code}`);
  for (const k of ['og:site_name', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:image', 'twitter:image:alt']) assert.equal(tag(k), meta(k), k);
  assert.equal(tag('robots'), 'noindex');
  assert.ok(page.includes(`<script>${CARD_SCRIPT}</script>`));
  assert.equal(page.match(/<script/g).length, 1);
  // The one script, at either address: the game's page with the code (the Worker serves it only for a valid one).
  for (const [path, to] of [['/r/WGNJKL', '/?room=WGNJKL'], [`/vs/${code}`, `/?vs=${code}`]]) {
    let went = null;
    new Function('location', CARD_SCRIPT)({ pathname: path, hash: '', replace: (x) => { went = x; } });
    assert.equal(went, to, path);
  }
  assert.match(read('src/client/share.js'), /link\(won, location\.origin, location\.pathname\)/, "share.js shares challenge.js's link (the card address on the site: test/challenge.test.js)");
});

test("the room codes: one module makes, reads and shows them for the relay, the lobby and the cards", () => {
  assert.equal(ROOM_LETTERS, 6); assert.equal(ROOM_ALPHABET, 'BCDFGHJKLMNPQRSTVWXZ');
  for (const f of ['relay/edge.js', 'relay/server.mjs', 'relay/bench.js', 'src/client/online.js']) {
    assert.match(read(f), /from '\.\.\/(?:src\/)?net\/roomcode\.js'/, `${f} uses src/net/roomcode.js`);
    assert.doesNotMatch(read(f), /const ALPHABET = /, `${f} has no alphabet of its own`);
  }
});

test("index.html's head: title, description, canonical, Open Graph and X cards, the app's metas unchanged", () => {
  const title = head.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(title, 'Ebbfall: a classic RTS, a kingdom against time travelers, free in your browser');
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

test('robots.txt lets everything be crawled and names the sitemap (the docs build writes it: test/docs.test.js)', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \S/m);
  assert.match(robots, new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
  assert.match(robots, /docs/, 'its comment names the docs as pages to index');
});

test('the files for crawlers and previews are not stored for offline play (the build\'s service worker leaves them out)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'endfall-sw-'));
  try {
    for (const f of ['index.html', 'og.png', 'robots.txt', 'sitemap.xml', 'llms.txt', 'icon.svg', 'docsy.txt']) writeFileSync(join(dir, f), f);
    mkdirSync(join(dir, 'docs', 'kingdom'), { recursive: true });
    mkdirSync(join(dir, 'art', 'new'), { recursive: true });
    for (const f of ['docs/index.html', 'docs/kingdom/index.html', 'art/atlas.json', 'art/new/index.json', 'art/new/bldg-0.webp']) writeFileSync(join(dir, f), f);
    const plugin = offline();
    plugin.configResolved({ build: { outDir: dir }, define: {} });
    plugin.closeBundle();
    const files = JSON.parse(readFileSync(join(dir, 'sw.js'), 'utf8').match(/^const FILES = (.*);$/m)[1]);
    assert.deepEqual(files, ['./', 'art/atlas.json', 'docsy.txt', 'icon.svg', 'index.html'], 'the docs and the new look\'s packs left out, not a file named like them');
    assert.deepEqual([...WEB_ONLY].sort(), ['art/new/', 'docs/', 'llms.txt', 'og.png', 'robots.txt', 'sitemap.xml']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
