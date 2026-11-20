// The site on Cloudflare as it is deployed: the files served by the assets with no Worker (test/cloudflare-assets.mjs:
// wrangler.toml's html_handling = "auto-trailing-slash", and the _headers file the deploy writes), and the Worker
// (site/worker.js) only for what is not a file. The game's page (every link into it: ?room=, ?vs=, ?seed=), the docs'
// folders and the other pages are files, with the security headers and their cache headers: they stay up when a
// Workers spending limit blocks the Worker. The pages' other spellings sent to their canonical addresses; what is not a
// file (a page load goes to the game, a missing script is a 404); www and http sent to https://ebbfall.com/; a room's
// card address (/r/CODE) and a challenge's (/vs/CODE) with their own cards; the feedback form's POST /api/feedback the
// Worker's (test/site-feedback.test.js has the rest); the docs' videos the Worker's first (run_worker_first), answered
// with byte ranges (206, 416, Accept-Ranges), which the assets do not serve and Safari needs; the CSP's reports; Cloudflare's analytics beacon written into every page at
// deploy, only with a token (site/build.mjs); the config the site runs with. With dist/ built: every file the service
// worker stores and every page is served by the assets, never the Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import worker from '../site/worker.js';
import { CACHE, CSP, SECURITY, CSP_HEADER, CSP_REPORT, cacheControl, headersFile, servedAt } from '../site/cache.js';
import { CARD_SCRIPT } from '../site/preview.js';
import { FEEDBACK_PATH } from '../site/feedback.js';
import { beacon, withBeacon, pages } from '../site/beacon.js';
import { MEDIA_PATH, MEDIA_RULE, parseRange } from '../site/media.js';
import { resolve, parseHeaders, headersFor, workerFirstRules, workerFirst, assetsBinding } from './cloudflare-assets.mjs';

const ORIGIN = 'https://ebbfall.com';
const NAVIGATE = { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html,application/xhtml+xml' };
const RULES = parseHeaders(headersFile());
const FILES = new Set(['/index.html', '/selftest.html', '/voice-lab.html', '/sw.js', '/manifest.webmanifest', '/assets/index-Bx1y2z3w.js',
  '/assets/endfall_sim_bg-ClB66k65.wasm', '/art/atlas-0.png', '/robots.txt', '/sitemap.xml', '/og.png', '/llms.txt',
  '/docs/index.html', '/docs/kingdom/index.html', '/docs/how-to-play/index.html', '/docs/img/sprites/core-336.webp', '/docs/media/trailer.mp4',
  '/docs/media/controls/touch-group.mp4', '/docs/media/controls/touch-group.webp']);
const WORKER_FIRST = workerFirstRules(readFileSync(new URL('../site/wrangler.toml', import.meta.url), 'utf8'));
/** The docs' videos' bytes, as the assets hold them (1000 bytes: byte i is i % 251), for the Worker's ASSETS binding. */
const VIDEO = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
const ENV = { ASSETS: assetsBinding((p) => (p.startsWith(MEDIA_PATH) && FILES.has(p) ? VIDEO : null), () => 'video/mp4') };

/**
 * A request to the deployed site: the assets first (a file: 200 with its _headers; another spelling of a page: 307),
 * then the Worker; the Worker first for what wrangler.toml's run_worker_first names (the docs' videos). `{ via }`: 'assets' or 'worker'; `blocked`: the Worker answers as a tripped limit (1103).
 */
async function site(path, { headers = {}, method = 'GET', host = ORIGIN, files = FILES, blocked = false } = {}) {
  const url = new URL(path, host);
  const route = (method === 'GET' || method === 'HEAD') && !workerFirst(WORKER_FIRST, url.pathname) ? resolve(url.pathname, (p) => files.has(p)) : null;
  if (route?.file) return { via: 'assets', file: route.file, res: new Response(method === 'HEAD' ? null : route.file, { headers: headersFor(RULES, url.pathname) }) };
  if (route?.redirect) return { via: 'assets', res: new Response(null, { status: 307, headers: { Location: route.redirect + url.search } }) };
  if (blocked) return { via: 'worker', res: new Response('error code: 1103', { status: 500 }) };
  return { via: 'worker', res: await worker.fetch(new Request(url, { method, headers }), ENV) };
}

test("the game's page, every link into it, the docs and the other pages: files, served with no Worker, with every security header", async () => {
  const pagesAt = [['/', '/index.html'], ['/?room=WGNJKL', '/index.html'], ['/?vs=1.8.5.ky.h00v12v22v32', '/index.html'], ['/?seed=7&relay=wss://x', '/index.html'],
    ['/?bench', '/index.html'], ['/docs/', '/docs/index.html'], ['/docs/kingdom/', '/docs/kingdom/index.html'], ['/docs/how-to-play/', '/docs/how-to-play/index.html'],
    ['/selftest', '/selftest.html'], ['/voice-lab', '/voice-lab.html']];
  for (const [path, file] of pagesAt) {
    const r = await site(path, { headers: NAVIGATE, blocked: true });
    assert.equal(r.via, 'assets', `${path}: no Worker`);
    assert.equal(r.res.status, 200, path);
    assert.equal(r.file, file, path);
    for (const [k, v] of Object.entries(SECURITY)) assert.equal(r.res.headers.get(k), v, `${path}: ${k}`);
  }
  for (const path of ['/', '/?room=WGNJKL', '/selftest', '/voice-lab', '/sw.js', '/manifest.webmanifest']) {
    assert.equal((await site(path)).res.headers.get('Cache-Control'), 'no-cache', `${path}: checked on every load`);
  }
  assert.equal((await site('/docs/kingdom/')).res.headers.get('Cache-Control'), null, "the docs: Cloudflare's default (revalidated)");
});

test("a page's other spellings are sent to its canonical address (307), the query kept; files at their own paths", async () => {
  for (const [from, to] of [['/index.html', '/'], ['/index.html?room=WGNJKL', '/?room=WGNJKL'], ['/selftest.html', '/selftest'], ['/voice-lab.html', '/voice-lab'],
    ['/docs', '/docs/'], ['/docs/kingdom', '/docs/kingdom/'], ['/docs/kingdom?x=1', '/docs/kingdom/?x=1'], ['/docs/kingdom/index.html', '/docs/kingdom/'], ['/docs/kingdom/index', '/docs/kingdom/'], ['/docs.html', '/docs/'], ['/index', '/'], ['/selftest/', '/selftest'], ['/selftest/index.html', '/selftest']]) {
    const r = await site(from, { headers: NAVIGATE, blocked: true });
    assert.equal(r.via, 'assets', from);
    assert.equal(r.res.status, 307, from);
    assert.equal(r.res.headers.get('Location'), to, from);
  }
  for (const path of ['/robots.txt', '/sitemap.xml', '/og.png', '/llms.txt', '/docs/img/sprites/core-336.webp', '/art/atlas-0.png']) {
    const r = await site(path, { blocked: true });
    assert.equal(r.file, path, path);
  }
});

test("hashed build output is kept for good; anything else keeps Cloudflare's default", async () => {
  for (const path of ['/assets/index-Bx1y2z3w.js', '/assets/endfall_sim_bg-ClB66k65.wasm']) {
    assert.equal((await site(path)).res.headers.get('Cache-Control'), 'public, max-age=31536000, immutable', path);
  }
  assert.equal((await site('/art/atlas-0.png')).res.headers.get('Cache-Control'), null);
});

test('not a file, the Worker: a page load goes to the game (its query kept), a missing script or image is a plain 404', async () => {
  for (const [path, to] of [['/nope', '/'], ['/old/page.html?room=ABCD', '/?room=ABCD'], ['/docs/nope/', '/'], ['/r/', '/'], ['/r/ABCDFG', '/'], ['/r/WGNJKL/x', '/']]) {
    const r = await site(path, { headers: NAVIGATE });
    assert.equal(r.via, 'worker', path);
    assert.equal(r.res.status, 302, path);
    assert.equal(r.res.headers.get('Location'), ORIGIN + to, path);
  }
  for (const path of ['/assets/index-0ld0ld00.js', '/art/missing.png', '/_headers', '/docs/img/nope.webp']) {
    const { res } = await site(path, { headers: { Accept: '*/*', 'Sec-Fetch-Mode': 'no-cors' } });
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(res.headers.get('Content-Type'), /html/, `${path}: never the game's HTML in place of a file`);
    assert.equal(res.headers.get('Cache-Control'), 'no-store', path);
  }
});

test('www.ebbfall.com and plain http: the Worker sends what is not a file to https://ebbfall.com/; the game\'s page sends itself', async () => {
  for (const from of ['https://www.ebbfall.com/nope?room=ABCD', 'http://ebbfall.com/nope?room=ABCD', 'http://www.ebbfall.com/nope?room=ABCD']) {
    const res = await worker.fetch(new Request(from, { headers: NAVIGATE }));
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('Location'), 'https://ebbfall.com/nope?room=ABCD', from);
  }
  assert.equal((await worker.fetch(new Request('http://127.0.0.1:8787/nope', { headers: NAVIGATE }))).status, 302, 'wrangler dev and other hosts: as they are');
  // The page itself is a file there too: its first script sends it on before anything is stored.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), first = html.match(/<script>([^\n]*?)<\/script>/)[1];
  assert.ok(first.startsWith("if (location.hostname === 'www.ebbfall.com' || (location.hostname === 'ebbfall.com' && location.protocol === 'http:')) location.replace('https://ebbfall.com' + location.pathname + location.search + location.hash);"), first.slice(0, 120));
  for (const [href, to] of [['https://www.ebbfall.com/?room=WGNJKL#x', 'https://ebbfall.com/?room=WGNJKL#x'], ['http://ebbfall.com/', 'https://ebbfall.com/'], ['https://ebbfall.com/', null], ['http://127.0.0.1:4173/', null]]) {
    const u = new URL(href);
    let went = null;
    new Function('location', 'addEventListener', 'window', first)({ hostname: u.hostname, protocol: u.protocol, pathname: u.pathname, search: u.search, hash: u.hash, replace: (x) => { went = x; } }, () => {}, {});
    assert.equal(went, to, href);
  }
});

const content = (html, key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];

test("a room's card address (/r/CODE, SHARE LINK): the Worker's page with the room's own card, on to the room by a script", async () => {
  for (const path of ['/r/WGNJKL', '/r/wgnjkl', '/r/WGN-JKL', '/r/wgn%20jkl', '/r/WGNJKL/']) {
    const { via, res } = await site(path, { headers: NAVIGATE }), html = await res.text();
    assert.equal(via, 'worker', path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('Content-Type'), /^text\/html/);
    assert.equal(res.headers.get('Cache-Control'), 'no-cache');
    for (const k of ['og:title', 'twitter:title']) assert.equal(content(html, k), 'Join my Ebbfall game: room WGN-JKL', `${path} ${k}`);
    for (const k of ['og:description', 'twitter:description']) assert.equal(content(html, k), 'Tap to join the room and play with me in your browser: free, nothing to install.');
    assert.equal(content(html, 'og:url'), 'https://ebbfall.com/r/WGNJKL', "the card's own address, the code alone");
    assert.equal(content(html, 'og:image'), 'https://ebbfall.com/og.png', "the site's image");
    assert.equal(content(html, 'robots'), 'noindex');
    assert.ok(html.includes(`<script>${CARD_SCRIPT}</script>`), 'on to the room');
    assert.ok(html.includes('<a href="/?room=WGNJKL">'), 'and a link');
    assert.doesNotMatch(html, /http-equiv/i, "no refresh: a crawler that follows one would show the game page's card");
    for (const [k, v] of Object.entries(SECURITY)) assert.equal(res.headers.get(k), v, `${path}: ${k}`);
  }
  // The script, run at the card's address: the game's page for the room.
  for (const [path, to] of [['/r/WGNJKL', '/?room=WGNJKL'], ['/r/wgn-jkl/', '/?room=wgn-jkl']]) {
    let went = null;
    new Function('location', CARD_SCRIPT)({ pathname: path, hash: '', replace: (x) => { went = x; } });
    assert.equal(went, to, path);
  }
  const hash = `'sha256-${createHash('sha256').update(CARD_SCRIPT).digest('base64')}'`;
  assert.ok(CSP['script-src'].includes(hash), `the CSP allows the card's script by its hash: ${hash}`);
  const head = await site('/r/WGNJKL', { method: 'HEAD' });
  assert.equal(head.res.status, 200);
  assert.equal(await head.res.text(), '');
  assert.equal((await site('/r/WGNJKL', { method: 'POST' })).res.status, 404, 'another method: not found');
  for (const bad of ['/r/%3Cscript%3E', '/r/WGNJKLX', '/r/ABCDFG', '/r/%E0%A4%A', '/r/' + 'B'.repeat(500)]) {
    const { res } = await site(bad, { headers: NAVIGATE });
    assert.equal(res.status, 302, `${bad}: not a room, the game`);
    assert.doesNotMatch(await res.text(), /script/, bad);
  }
});

test("a challenge's card address (/vs/CODE, SHARE after a victory): the Worker's page with the challenge's own card, on to /?vs= by the same script", async () => {
  const code = '1.8.5.ky.h00v12v22v32';
  for (const path of [`/vs/${code}`, `/vs/${code}/`]) {
    const { via, res } = await site(path, { headers: NAVIGATE }), html = await res.text();
    assert.equal(via, 'worker', path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('Content-Type'), /^text\/html/);
    assert.equal(res.headers.get('Cache-Control'), 'no-cache');
    for (const k of ['og:title', 'twitter:title']) assert.equal(content(html, k), 'Can you beat this? 1 vs 3 Hard AIs on Iron Compass', `${path} ${k}`);
    for (const k of ['og:description', 'twitter:description']) assert.equal(content(html, k), 'Kingdom vs Expedition · won in 12:34 · free, in your browser');
    assert.equal(content(html, 'og:url'), `https://ebbfall.com/vs/${code}`, "the card's own address");
    assert.equal(content(html, 'og:image'), 'https://ebbfall.com/og.png');
    assert.equal(content(html, 'robots'), 'noindex');
    assert.ok(html.includes(`<script>${CARD_SCRIPT}</script>`), "on to the challenge, the room's script");
    assert.ok(html.includes(`<a href="/?vs=${code}">`), 'and a link');
    for (const [k, v] of Object.entries(SECURITY)) assert.equal(res.headers.get(k), v, `${path}: ${k}`);
  }
  for (const [path, to] of [[`/vs/${code}`, `/?vs=${code}`], [`/vs/${code}/`, `/?vs=${code}`]]) {
    let went = null;
    new Function('location', CARD_SCRIPT)({ pathname: path, hash: '#x', replace: (x) => { went = x; } });
    assert.equal(went, `${to}#x`, path);
  }
  assert.equal((await site(`/vs/${code}`, { method: 'HEAD' })).res.status, 200);
  assert.equal((await site(`/vs/${code}`, { method: 'POST' })).res.status, 404, 'another method: not found');
  for (const bad of ['/vs/', '/vs/2.8.5.ky.h00v12v22v32', '/vs/1.8.5.KY.h00v12v22v32', `/vs/${code}.`, `/vs/${code}/x`, '/vs/%3Cscript%3E', `/vs/${code.replace(/\./g, '%2E')}`, '/vs/' + '1'.repeat(500)]) {
    const { res } = await site(bad, { headers: NAVIGATE });
    assert.equal(res.status, 302, `${bad}: not a challenge, the game`);
  }
  // The plain link, old or off the site, is a file: the game's page with the site's card, no Worker.
  assert.equal((await site(`/?vs=${code}`, { headers: NAVIGATE, blocked: true })).via, 'assets');
});

test("the feedback form's POST /api/feedback is not a file: the Worker's (which answers it: test/site-feedback.test.js)", async () => {
  const r = await site(FEEDBACK_PATH, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' } });
  assert.equal(r.via, 'worker');
  assert.equal(r.res.status, 400, 'an empty body: refused, by the endpoint');
  assert.equal((await site(FEEDBACK_PATH, { method: 'POST', blocked: true })).res.status, 500, 'a tripped limit: 1103 (the form offers the address to write to)');
  assert.equal((await site(FEEDBACK_PATH)).via, 'worker', 'a GET too: not a file');
});

test("the docs' videos: the Worker's, whole with Accept-Ranges, or the byte range asked for (206), as Safari needs to play them", async () => {
  const get = (path, headers = {}, method = 'GET') => site(path, { headers, method });
  const bytes = async (r) => [...new Uint8Array(await r.res.arrayBuffer())];
  // No range: the whole file, saying ranges are served.
  let r = await get('/docs/media/trailer.mp4');
  assert.equal(r.via, 'worker', 'run_worker_first');
  assert.equal(r.res.status, 200);
  assert.equal(r.res.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(r.res.headers.get('Content-Type'), 'video/mp4');
  assert.equal(r.res.headers.get('Content-Length'), '1000');
  assert.equal(r.res.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate', "Cloudflare's default, as for the docs' other files");
  assert.match(r.res.headers.get('ETag'), /^"[0-9a-f]{32}"$/);
  for (const [k, v] of Object.entries(SECURITY)) assert.equal(r.res.headers.get(k), v, k);
  assert.deepEqual(await bytes(r), [...VIDEO]);
  // Safari's first probe, then the usual spellings: 206 with exactly those bytes.
  for (const [range, start, end] of [['bytes=0-1', 0, 1], ['bytes=100-199', 100, 199], ['bytes=900-', 900, 999], ['bytes=-100', 900, 999], ['bytes=990-5000', 990, 999], ['bytes=-5000', 0, 999], ['bytes=999-999', 999, 999]]) {
    r = await get('/docs/media/controls/touch-group.mp4', { Range: range });
    assert.equal(r.res.status, 206, range);
    assert.equal(r.res.headers.get('Content-Range'), `bytes ${start}-${end}/1000`, range);
    assert.equal(r.res.headers.get('Content-Length'), String(end - start + 1), range);
    assert.equal(r.res.headers.get('Accept-Ranges'), 'bytes', range);
    assert.equal(r.res.headers.get('Content-Type'), 'video/mp4', range);
    for (const [k, v] of Object.entries(SECURITY)) assert.equal(r.res.headers.get(k), v, `${range}: ${k}`);
    assert.deepEqual(await bytes(r), [...VIDEO.slice(start, end + 1)], range);
  }
  // Past the end, inverted, a zero suffix: 416, the size said.
  for (const range of ['bytes=1000-', 'bytes=5000-6000', 'bytes=200-100', 'bytes=-0']) {
    r = await get('/docs/media/trailer.mp4', { Range: range });
    assert.equal(r.res.status, 416, range);
    assert.equal(r.res.headers.get('Content-Range'), 'bytes */1000', range);
  }
  // What Cloudflare ignores (another unit, several ranges, not a range): the whole file.
  for (const range of ['items=0-1', 'bytes=0-1,5-6', 'bytes=x-y', 'bytes=-', 'bytes=0-99999999999999999']) {
    r = await get('/docs/media/trailer.mp4', { Range: range });
    assert.equal(r.res.status, 200, range);
    assert.equal((await bytes(r)).length, 1000, range);
  }
  // HEAD: the headers alone; a range's too.
  r = await get('/docs/media/trailer.mp4', {}, 'HEAD');
  assert.equal(r.res.status, 200);
  assert.equal(r.res.headers.get('Content-Length'), '1000');
  assert.equal(r.res.headers.get('Accept-Ranges'), 'bytes');
  assert.equal((await bytes(r)).length, 0);
  r = await get('/docs/media/trailer.mp4', { Range: 'bytes=0-1' }, 'HEAD');
  assert.equal(r.res.status, 206);
  assert.equal(r.res.headers.get('Content-Range'), 'bytes 0-1/1000');
  // If-Range: the file's ETag keeps the range; another (the file changed) gets the whole file. If-None-Match: 304.
  const etag = (await get('/docs/media/trailer.mp4')).res.headers.get('ETag');
  assert.equal((await get('/docs/media/trailer.mp4', { Range: 'bytes=0-1', 'If-Range': etag })).res.status, 206);
  assert.equal((await get('/docs/media/trailer.mp4', { Range: 'bytes=0-1', 'If-Range': '"stale"' })).res.status, 200);
  r = await get('/docs/media/trailer.mp4', { 'If-None-Match': etag });
  assert.equal(r.res.status, 304);
  assert.equal(r.res.headers.get('X-Content-Type-Options'), 'nosniff');
  // No such video: 404; a POST: refused.
  assert.equal((await get('/docs/media/nope.mp4')).res.status, 404);
  assert.equal((await get('/docs/media/trailer.mp4', {}, 'POST')).res.status, 405);
  // The docs' other files stay the assets', with no Worker.
  for (const path of ['/docs/', '/docs/img/sprites/core-336.webp', '/docs/media/controls/touch-group.webp']) assert.equal((await get(path)).via, 'assets', path);
  // A tripped Workers limit takes the videos, never their posters.
  assert.equal((await site('/docs/media/trailer.mp4', { blocked: true })).res.status, 500);
  assert.equal((await site('/docs/media/controls/touch-group.webp', { blocked: true })).res.status, 200);
});

test('parseRange: one range, as Cloudflare reads it', () => {
  assert.deepEqual(parseRange('bytes=0-1', 10), { start: 0, end: 1 });
  assert.deepEqual(parseRange(' bytes=5- ', 10), { start: 5, end: 9 });
  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.equal(parseRange('bytes=10-', 10), 'unsatisfiable');
  assert.equal(parseRange('bytes=0-1', 0), 'unsatisfiable', 'an empty file');
  assert.equal(parseRange('bytes=-1', 0), 'unsatisfiable');
  assert.equal(parseRange(null, 10), null);
  assert.equal(parseRange('bytes=1-2,3-4', 10), null);
});

test("a tripped Workers limit (1103) takes a room's card address and the CSP's reports, never a file", async () => {
  assert.equal((await site('/r/WGNJKL', { blocked: true })).res.status, 500);
  assert.equal((await site(CSP_REPORT, { method: 'POST', blocked: true })).via, 'worker');
  for (const path of ['/', '/?room=WGNJKL', '/docs/', '/docs/kingdom/', '/sw.js', '/assets/index-Bx1y2z3w.js']) assert.equal((await site(path, { blocked: true })).via, 'assets', path);
});

test('a CSP report: logged (2 KB at most) and answered 204, never stored or served; anything but a POST is not found', async () => {
  const logged = [], log = console.log;
  console.log = (...a) => logged.push(a.join(' '));
  try {
    const body = JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'eval', pad: 'x'.repeat(5000) } });
    const res = await worker.fetch(new Request(ORIGIN + CSP_REPORT, { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body }));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get(CSP_HEADER), SECURITY[CSP_HEADER], 'the security headers too');
    assert.equal(logged.length, 1);
    assert.ok(logged[0].startsWith('csp-report {"csp-report":{"violated-directive":"script-src"') && logged[0].length <= 'csp-report '.length + 2048, logged[0].slice(0, 80));
  } finally { console.log = log; }
  assert.equal((await worker.fetch(new Request(ORIGIN + CSP_REPORT))).status, 404, 'a GET');
});

test('security headers: nosniff, the referrer policy, the device powers and the CSP, on every file (_headers) and every Worker answer', async () => {
  const policy = SECURITY['Permissions-Policy'];
  for (const powers of ['fullscreen=(self)', 'autoplay=(self)', 'web-share=(self)', 'clipboard-write=(self)', 'camera=()', 'microphone=()', 'geolocation=()', 'payment=()']) assert.ok(policy.split(', ').includes(powers), powers);
  for (const path of ['/', '/docs/kingdom/', '/art/atlas-0.png', '/r/BCDFGH', '/nope.js', '/nope']) {
    const { res } = await site(path, { headers: NAVIGATE });
    for (const [k, v] of Object.entries(SECURITY)) assert.equal(res.headers.get(k), v, `${path}: ${k}`);
  }
  const text = headersFile(), all = text.slice(0, text.indexOf('\n/', 1) + 1);
  assert.ok(all.startsWith('/*\n'), 'a rule for every path, first');
  for (const [k, v] of Object.entries(SECURITY)) assert.ok(all.includes(`\n  ${k}: ${v}\n`), k);
  assert.equal(text.match(/Content-Security-Policy/g).length, 1, 'the CSP once, for every path');
  assert.ok(!/X-Frame-Options/.test(text), "framing: the CSP's frame-ancestors only");
});

test("the Worker's module exports its handler and its Durable Object's class only (the Workers runtime refuses anything else)", async () => {
  assert.deepEqual(Object.keys(await import('../site/worker.js')).sort(), ['FeedbackBudget', 'default'], 'and the Durable Object class its binding names (wrangler.toml)');
});

test('the _headers file: the cache table at the addresses the pages are served at', () => {
  const text = headersFile(), rules = [...text.matchAll(/^(\/\S*)\n {2}Cache-Control: (.+)$/gm)].map(m => [m[1], m[2]]);
  assert.deepEqual(rules, CACHE);
  assert.equal(cacheControl('/assets/x-12345678.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControl('/art/atlas.json'), null);
  // Every page the build makes (vite.config.js's inputs) is checked on every load, where it is served.
  const inputs = [...readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8').matchAll(/'([\w-]+\.html)'/g)].map(m => m[1]);
  assert.ok(inputs.length >= 3, inputs.join());
  for (const p of inputs) assert.equal(cacheControl(servedAt(p)), 'no-cache', p);
  assert.deepEqual(['index.html', 'selftest.html', 'docs/index.html', 'docs/kingdom/index.html', 'sw.js'].map(servedAt), ['/', '/selftest', '/docs/', '/docs/kingdom/', '/sw.js']);
});

test('wrangler.toml: dist/ as the assets, the pages at their canonical addresses, the Worker before no file but the docs\' videos, ebbfall.com and www as routes', () => {
  const toml = readFileSync(new URL('../site/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^main = "worker\.js"$/m);
  assert.match(toml, /^directory = "\.\.\/dist"$/m);
  assert.match(toml, /^binding = "ASSETS"$/m);
  assert.match(toml, /^html_handling = "auto-trailing-slash"$/m);
  assert.match(toml, /^not_found_handling = "none"$/m, "what is not a file: the Worker (a room's card, the reports, not found)");
  assert.deepEqual(workerFirstRules(toml), [MEDIA_RULE], 'the Worker before one kind of file only, the docs\' videos: the pages and the posters stay up when the Worker is blocked');
  assert.match(toml, /\{ pattern = "ebbfall\.com\/\*", zone_name = "ebbfall\.com" \}/);
  assert.match(toml, /\{ pattern = "www\.ebbfall\.com\/\*", zone_name = "ebbfall\.com" \}/);
  assert.doesNotMatch(toml, /custom_domain/, 'routes over the proxied records: a custom domain needs the records gone first');
  assert.doesNotMatch(toml, /relay\.ebbfall\.com/, "the relay's domain is the relay Worker's");
  assert.match(toml, /^workers_dev = false/m);
  // The feedback form's bindings: the email to one address only, ours; a minute's limit per address, its namespace not
  // the relay's; the budget object, its class exported by worker.js.
  assert.match(toml, /\[\[send_email\]\]\nname = "FEEDBACK_EMAIL"\ndestination_address = "contact@ebbfall\.com"\n/);
  assert.match(toml, /\[\[ratelimits\]\]\nname = "FEEDBACK_LIMIT"\nnamespace_id = "1101"\nsimple = \{ limit = 2, period = 60 \}/);
  const relay = readFileSync(new URL('../relay/wrangler.toml', import.meta.url), 'utf8');
  const ids = (t) => [...t.matchAll(/^namespace_id = "(\d+)"$/gm)].map(m => m[1]);
  assert.ok(ids(toml).length && ids(toml).every(id => !ids(relay).includes(id)), 'namespace ids are the account\'s: none the relay\'s');
  assert.match(toml, /\[\[durable_objects\.bindings\]\]\nname = "FEEDBACK_BUDGET"\nclass_name = "FeedbackBudget"/);
  assert.match(toml, /new_sqlite_classes = \["FeedbackBudget"\]/);
});

test("Cloudflare's analytics beacon: written at the end of a page's body with a token, once; none without one or with a malformed one", () => {
  const page = '<!doctype html><title>x</title><body><p>hi</p></body></html>';
  const tag = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"abc123DEF"}'></script>`;
  assert.equal(beacon('abc123DEF'), tag);
  assert.equal(withBeacon(page, 'abc123DEF'), `<!doctype html><title>x</title><body><p>hi</p>${tag}</body></html>`);
  assert.equal(withBeacon(withBeacon(page, 'abc123DEF'), 'abc123DEF'), withBeacon(page, 'abc123DEF'), 'twice: once');
  assert.equal(withBeacon(withBeacon(page, 'old'), 'new'), withBeacon(page, 'new'), 'another token: replaced');
  for (const t of [undefined, '', 'x"><script>', 'a b']) assert.equal(withBeacon(withBeacon(page, 'old'), t), page, String(t));
  assert.ok(CSP['script-src'].includes('https://static.cloudflareinsights.com'), "the CSP allows the beacon's script");
  assert.ok(CSP['connect-src'].includes('https://cloudflareinsights.com'), 'and its reports');
});

const dist = new URL('../dist/', import.meta.url);
const built = existsSync(new URL('sw.js', dist));
test('with dist/ built: every file the service worker stores and every page is served by the assets, never the Worker', { skip: !built && 'dist/ not built' }, async () => {
  const root = fileURLToPath(dist);
  const has = (p) => { try { return !p.endsWith('/') && existsSync(new URL(`.${decodeURI(p)}`, dist)); } catch { return false; } };
  const files = JSON.parse(readFileSync(new URL('sw.js', dist), 'utf8').match(/^const FILES = (.*);$/m)[1]);
  for (const f of files) {
    let route = resolve(new URL(f, `${ORIGIN}/`).pathname, has);
    if (route?.redirect) route = resolve(route.redirect, has); // (the service worker stores what the redirect serves: tools/offline/sw.js)
    assert.ok(route?.file, `${f}: a file`);
    assert.equal(route.file, f === './' ? '/index.html' : `/${f}`, f);
  }
  const all = pages(root).map(p => relative(root, p).split('\\').join('/'));
  assert.ok(all.includes('index.html') && all.includes('docs/kingdom/index.html') && all.includes('selftest.html'), all.join());
  for (const f of all) assert.deepEqual(resolve(servedAt(f), has), { file: `/${f}` }, `${f}: served at ${servedAt(f)}`);
  // The files for crawlers and link previews are built too, and left out of the offline store.
  for (const f of ['robots.txt', 'sitemap.xml', 'og.png', 'llms.txt', 'docs/index.html', 'docs/kingdom/index.html']) {
    assert.ok(existsSync(new URL(f, dist)), f);
    assert.ok(!files.includes(f), `${f}: not stored for offline play`);
  }
  assert.ok(!files.some(f => f.startsWith('docs/')), 'nothing of the docs stored for offline play');
  const page = readFileSync(new URL('index.html', dist), 'utf8');
  for (const tag of ['<meta property="og:image" content="https://ebbfall.com/og.png">', '<meta property="og:url" content="https://ebbfall.com/">', '<link rel="canonical" href="https://ebbfall.com/">', '<script type="application/ld+json">']) {
    assert.ok(page.includes(tag), tag);
  }
});

test("with dist/ built: the deploy's build step writes the beacon into every page (the game's, every docs page, the others) with a token, and none without", { skip: !built && 'dist/ not built' }, () => {
  const copy = mkdtempSync(join(tmpdir(), 'endfall-site-'));
  try {
    cpSync(fileURLToPath(dist), copy, { recursive: true, filter: (src) => !/\.(png|webp|wasm|mp4|webm|woff2|js|map|css|json)$/.test(src) });
    const run = (token) => execFileSync(process.execPath, [fileURLToPath(new URL('../site/build.mjs', import.meta.url)), copy], { env: { ...process.env, CF_ANALYTICS_TOKEN: token ?? '' }, encoding: 'utf8' });
    const all = pages(copy);
    assert.ok(all.length >= 8 && all.some(p => p.includes(join('docs', 'kingdom'))), `${all.length} pages`);
    run('tok3n_A-1');
    for (const p of all) {
      const html = readFileSync(p, 'utf8');
      assert.equal(html.split(beacon('tok3n_A-1')).length - 1, 1, `${relative(copy, p)}: the beacon once`);
      assert.ok(html.indexOf(beacon('tok3n_A-1')) < html.lastIndexOf('</body>'), `${relative(copy, p)}: in the body`);
    }
    run('tok3n_A-1');
    for (const p of all) assert.equal(readFileSync(p, 'utf8').split('cloudflareinsights').length - 1, 1, `${relative(copy, p)}: run twice, still once`);
    run(undefined);
    for (const p of all) assert.doesNotMatch(readFileSync(p, 'utf8'), /cloudflareinsights/, `${relative(copy, p)}: no token, no beacon`);
    assert.equal(readFileSync(join(copy, '_headers'), 'utf8'), headersFile(), '_headers written');
  } finally { rmSync(copy, { recursive: true, force: true }); }
  assert.doesNotMatch(readFileSync(new URL('index.html', dist), 'utf8'), /cloudflareinsights/, "the build job's dist/ as it was tested: no beacon");
});
