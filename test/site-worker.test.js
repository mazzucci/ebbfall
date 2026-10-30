// The site's Worker on Cloudflare (site/worker.js) in Node, with a fake ASSETS binding serving files at their exact
// paths (wrangler.toml's html_handling = "none"): the game's page for / and every link into it (?room=, ?bench), the
// other pages, the cache headers (hashed assets for good; the pages, the service worker and the manifest checked every
// time), what is not a file (a page load goes to the game, a missing script is a 404), www and http sent to
// https://ebbfall.com/, a room's link with its own card (with or without the beacon) and an ETag that never keeps a stale
// card, Cloudflare's analytics beacon only with a token, the _headers file the deploy writes, and the config it runs
// with. With dist/ built: every file the service worker stores is served, as is, and so are robots.txt, the sitemap and
// the preview image.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import worker from '../site/worker.js';
import { CACHE, cacheControl, headersFile } from '../site/cache.js';

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', wasm: 'application/wasm', png: 'image/png', webmanifest: 'application/manifest+json', json: 'application/json', css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };
/** A fake ASSETS binding over `files` (path -> body): Cloudflare's default headers, 404 for anything else. */
const assets = (files) => ({
  seen: [],
  async fetch(req) {
    const path = new URL(req.url).pathname;
    this.seen.push(path);
    if (!(path in files)) return new Response('', { status: 404 });
    if (req.headers.get('If-None-Match') === '"e"') return new Response(null, { status: 304, headers: { ETag: '"e"' } });
    const body = req.method === 'HEAD' ? null : files[path];
    return new Response(body, { headers: { 'Content-Type': TYPES[path.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: '"e"' } });
  },
});
const FILES = {
  '/index.html': '<!doctype html><title>Ebbfall</title><body><canvas></canvas></body>',
  '/selftest.html': 'selftest', '/voice-lab.html': 'voice lab', '/sw.js': 'sw', '/manifest.webmanifest': '{}',
  '/assets/index-Bx1y2z3w.js': 'js', '/assets/endfall_sim_bg-ClB66k65.wasm': 'wasm', '/art/atlas-0.png': 'png',
  '/robots.txt': 'User-agent: *', '/sitemap.xml': '<urlset/>', '/og.png': 'png',
};
const ORIGIN = 'https://ebbfall.com';
const get = (path, headers = {}, method = 'GET', env = {}, files = FILES) => worker.fetch(new Request(ORIGIN + path, { method, headers }), { ASSETS: assets(files), ...env });
const NAVIGATE = { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html,application/xhtml+xml' };

/**
 * HTMLRewriter (the Workers runtime's, not Node's), as far as the Worker uses it, on the text: <meta> tags by an
 * attribute's value (setAttribute) and the body (append). Anything else it is asked fails the test.
 */
class FakeRewriter {
  handlers = [];
  on(sel, handler) { this.handlers.push([sel, handler]); return this; }
  transform(res) {
    const done = res.text().then((html) => {
      for (const [sel, { element }] of this.handlers) {
        const m = sel.match(/^meta\[(property|name)="([^"]+)"\]$/);
        if (m) {
          html = html.replace(/<meta\b[^>]*>/g, (tag) => {
            if (!tag.includes(` ${m[1]}="${m[2]}"`)) return tag;
            element({ setAttribute: (a, v) => { assert.doesNotMatch(v, /[<>&"]/, 'plain text'); tag = tag.replace(new RegExp(` ${a}="[^"]*"`), ` ${a}="${v}"`); } });
            return tag;
          });
        } else if (sel === 'body') {
          let added = '';
          element({ append: (h, o) => { assert.deepEqual(o, { html: true }); added += h; } });
          html = html.replace('</body>', `${added}</body>`);
        } else assert.fail(`FakeRewriter: ${sel}`);
      }
      return html;
    });
    return { text: () => done };
  }
}
globalThis.HTMLRewriter = FakeRewriter;

test("the game's page for / and every link into it, checked on every load", async () => {
  for (const path of ['/', '/index.html', '/?bench', '/?room=ABCD', '/?seed=7&relay=wss://x']) {
    const res = await get(path, NAVIGATE);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), FILES['/index.html'], path);
    assert.match(res.headers.get('Content-Type'), /^text\/html/, path);
    assert.equal(res.headers.get('Cache-Control'), 'no-cache', path);
    assert.equal(res.headers.get('ETag'), '"e"', `${path}: the asset's ETag kept (a 304 when unchanged)`);
  }
  assert.equal((await get('/', {}, 'HEAD')).status, 200);
});

test('the other pages, the service worker and the manifest: served at their paths, checked on every load', async () => {
  for (const path of ['/selftest.html', '/voice-lab.html', '/sw.js', '/manifest.webmanifest']) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), FILES[path], path);
    assert.equal(res.headers.get('Cache-Control'), 'no-cache', path);
  }
});

test("hashed build output is kept for good; anything else keeps Cloudflare's default", async () => {
  for (const path of ['/assets/index-Bx1y2z3w.js', '/assets/endfall_sim_bg-ClB66k65.wasm']) {
    const res = await get(path);
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=31536000, immutable', path);
  }
  assert.equal((await get('/assets/endfall_sim_bg-ClB66k65.wasm')).headers.get('Content-Type'), 'application/wasm');
  assert.equal((await get('/art/atlas-0.png')).headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
});

test('not a file: a page load goes to the game (its query kept), a missing script or image is a plain 404', async () => {
  for (const [path, to] of [['/nope', '/'], ['/old/page.html?room=ABCD', '/?room=ABCD'], ['/selftest', '/']]) {
    const res = await get(path, NAVIGATE);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('Location'), ORIGIN + to, path);
  }
  for (const path of ['/assets/index-0ld0ld00.js', '/art/missing.png', '/_headers']) {
    const res = await get(path, { Accept: '*/*', 'Sec-Fetch-Mode': 'no-cors' });
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(res.headers.get('Content-Type'), /html/, `${path}: never the game's HTML in place of a file`);
    assert.equal(res.headers.get('Cache-Control'), 'no-store', path);
  }
});

test('www.ebbfall.com and plain http go to https://ebbfall.com/, path and query kept: the game has one origin', async () => {
  for (const from of ['https://www.ebbfall.com/?room=ABCD', 'http://ebbfall.com/?room=ABCD', 'http://www.ebbfall.com/?room=ABCD']) {
    const res = await worker.fetch(new Request(from, { headers: NAVIGATE }), { ASSETS: assets(FILES) });
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('Location'), 'https://ebbfall.com/?room=ABCD', from);
  }
  const local = await worker.fetch(new Request('http://127.0.0.1:8787/'), { ASSETS: assets(FILES) });
  assert.equal(local.status, 200, 'wrangler dev and other hosts are served as they are');
});

test("Cloudflare's analytics beacon: in the game's page only with a token (a deferred script), never by default", async () => {
  const plain = await (await get('/')).text();
  assert.doesNotMatch(plain, /cloudflareinsights/);
  const html = await (await get('/?seed=7', NAVIGATE, 'GET', { CF_ANALYTICS_TOKEN: 'abc123DEF' })).text();
  assert.ok(html.endsWith(`<canvas></canvas><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"abc123DEF"}'></script></body>`), html);
  assert.doesNotMatch(await (await get('/selftest.html', {}, 'GET', { CF_ANALYTICS_TOKEN: 'abc' })).text(), /cloudflareinsights/, 'the game\'s page only');
  assert.doesNotMatch(await (await get('/', {}, 'GET', { CF_ANALYTICS_TOKEN: 'x"><script>' })).text(), /cloudflareinsights/, 'a malformed token adds nothing');
  // The page with the beacon has an ETag of its own (its bytes'): a copy from before the token is not kept (a 304), its own is.
  const env = { CF_ANALYTICS_TOKEN: 'abc' };
  const tag = (await get('/', {}, 'GET', env)).headers.get('ETag');
  assert.match(tag, /^"p-[0-9a-f]{16}"$/);
  assert.equal((await get('/', { 'If-None-Match': '"e"' }, 'GET', env)).status, 200, 'a copy without the beacon');
  const again = await get('/', { 'If-None-Match': tag }, 'GET', env);
  assert.equal(again.status, 304, 'a copy with it');
  assert.equal(again.headers.get('ETag'), tag);
  assert.equal(again.headers.get('Cache-Control'), 'no-cache');
  assert.notEqual((await get('/', {}, 'GET', { CF_ANALYTICS_TOKEN: 'other' })).headers.get('ETag'), tag, 'another token, another page');
  assert.equal((await get('/', { 'If-None-Match': '"e"' })).status, 304, 'no token: the file\'s own ETag');
  assert.equal((await get('/sw.js', {}, 'GET', env)).headers.get('ETag'), '"e"', 'the page only');
});

/** The game's real page, as the assets serve it (its head is what the cards rewrite). */
const PAGE = { ...FILES, '/index.html': readFileSync(new URL('../index.html', import.meta.url), 'utf8') };
const content = (html, key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))[1];

test("a room's link: its own card in the og: and twitter: tags, with or without the beacon; the rest of the page as it is", async () => {
  for (const env of [{}, { CF_ANALYTICS_TOKEN: 'abc' }]) {
    for (const q of ['?room=WGNJ', '?room=wgnj', '?join=WGNJ', '?room=WGNJ&relay=wss://x.example/']) {
      const res = await get('/' + q, NAVIGATE, 'GET', env, PAGE), html = await res.text();
      assert.equal(res.status, 200, q);
      assert.match(res.headers.get('Content-Type'), /^text\/html/);
      assert.equal(res.headers.get('Cache-Control'), 'no-cache');
      for (const k of ['og:title', 'twitter:title']) assert.equal(content(html, k), 'Join my Ebbfall game: room WGNJ', `${q} ${k}`);
      for (const k of ['og:description', 'twitter:description']) assert.equal(content(html, k), 'Tap to join the room and play with me in your browser: free, nothing to install.');
      assert.equal(content(html, 'og:url'), 'https://ebbfall.com/?room=WGNJ');
      assert.equal(content(html, 'og:image'), 'https://ebbfall.com/og.png', 'the site\'s image');
      assert.match(html, /<link rel="canonical" href="https:\/\/ebbfall\.com\/">/, 'the canonical page stays the game');
      assert.match(html, /<title>Ebbfall: a free browser RTS in the 1998 mold<\/title>/, 'the tab\'s title as it was');
      assert.equal(/cloudflareinsights/.test(html), !!env.CF_ANALYTICS_TOKEN, 'the beacon with a token only');
      // Only the card's tags changed.
      const strip = (h) => h.replace(/<meta (?:property|name)="(?:og|twitter):(?:title|description|url)" content="[^"]*">/g, '').replace(/<script defer src="https:\/\/static\.cloudflareinsights[^<]*<\/script>/, '');
      assert.equal(strip(html), strip(PAGE['/index.html']), q);
    }
  }
});

test("hostile or unknown links get the site's card, and nothing of their query in the page", async () => {
  for (const q of ['?room=%3Cscript%3Ealert(1)%3C/script%3E', '?room=<script>', '?room=WGNJX', '?room=ABCD', '?join="onload="x', '?seed=7']) {
    const res = await get('/' + q, NAVIGATE, 'GET', {}, PAGE), html = await res.text();
    assert.equal(html, PAGE['/index.html'], `${q}: the file as it is`);
    assert.equal(res.headers.get('ETag'), '"e"', `${q}: the file's own ETag`);
  }
});

test("a room's page has its own ETag: a 304 only for that card's bytes, never a stale card", async () => {
  const res = await get('/?room=WGNJ', NAVIGATE, 'GET', {}, PAGE), tag = res.headers.get('ETag');
  assert.match(tag, /^"p-[0-9a-f]{16}"$/);
  assert.notEqual(tag, '"e"', "not the file's: the file's tag does not say which card");
  const again = await get('/?room=WGNJ', { ...NAVIGATE, 'If-None-Match': tag }, 'GET', {}, PAGE);
  assert.equal(again.status, 304);
  assert.equal(again.headers.get('ETag'), tag);
  assert.equal(await again.text(), '');
  assert.equal((await get('/?room=WGNJ', { 'If-None-Match': `W/${tag}` }, 'GET', {}, PAGE)).status, 304, 'weakened by the edge: still the same bytes');
  assert.equal((await get('/?room=WGNJ', { 'If-None-Match': `"x", ${tag}` }, 'GET', {}, PAGE)).status, 304, 'one of a list');
  assert.equal((await get('/?room=WGNJ', { 'If-None-Match': '"e"' }, 'GET', {}, PAGE)).status, 200, 'a copy of the plain page');
  const other = await get('/?room=BCDF', { 'If-None-Match': tag }, 'GET', {}, PAGE);
  assert.equal(other.status, 200, 'another room, another card');
  assert.notEqual(other.headers.get('ETag'), tag);
  assert.equal((await get('/?room=WGNJ', { 'If-None-Match': tag }, 'GET', { CF_ANALYTICS_TOKEN: 'abc' }, PAGE)).status, 200, 'the beacon since: another page');
  // The page changed (a deploy): another tag for the same link.
  const changed = { ...PAGE, '/index.html': PAGE['/index.html'].replace('<canvas id="game">', '<canvas id="game" data-x>') };
  assert.notEqual((await get('/?room=WGNJ', {}, 'GET', {}, changed)).headers.get('ETag'), tag);
  // HEAD: the headers alone.
  const h = await get('/?room=WGNJ', {}, 'HEAD', {}, PAGE);
  assert.equal(h.status, 200);
  assert.equal(h.headers.get('ETag'), tag);
  assert.equal(await h.text(), '');
});

test('robots.txt, the sitemap and the preview image are files: served as they are, never the game or a 404', async () => {
  for (const path of ['/robots.txt', '/sitemap.xml', '/og.png']) {
    const res = await get(path, { Accept: '*/*' });
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), FILES[path], path);
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate', `${path}: Cloudflare's own (revalidated)`);
  }
});

test("the Worker's module exports its handler only (the Workers runtime refuses anything else)", async () => {
  assert.deepEqual(Object.keys(await import('../site/worker.js')), ['default']);
});

test('the _headers file the deploy writes says what the Worker does, for the files Cloudflare serves alone', () => {
  const text = headersFile(), rules = [...text.matchAll(/^(\/\S*)\n {2}Cache-Control: (.+)$/gm)].map(m => [m[1], m[2]]);
  assert.deepEqual(rules, CACHE);
  assert.equal(cacheControl('/assets/x-12345678.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControl('/art/atlas.json'), null);
  // Every page the build makes (vite.config.js's inputs) is checked on every load.
  const inputs = [...readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8').matchAll(/'([\w-]+\.html)'/g)].map(m => m[1]);
  assert.ok(inputs.length >= 3, inputs.join());
  for (const p of inputs) assert.equal(cacheControl('/' + p), 'no-cache', p);
});

test('wrangler.toml: dist/ as the assets, exact paths, the Worker first only for the page, ebbfall.com and www as routes', () => {
  const toml = readFileSync(new URL('../site/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^main = "worker\.js"$/m);
  assert.match(toml, /^directory = "\.\.\/dist"$/m);
  assert.match(toml, /^binding = "ASSETS"$/m);
  assert.match(toml, /^html_handling = "none"$/m);
  assert.match(toml, /^run_worker_first = \["\/", "\/index\.html"\]$/m);
  assert.match(toml, /\{ pattern = "ebbfall\.com\/\*", zone_name = "ebbfall\.com" \}/);
  assert.match(toml, /\{ pattern = "www\.ebbfall\.com\/\*", zone_name = "ebbfall\.com" \}/);
  assert.doesNotMatch(toml, /custom_domain/, 'routes over the proxied records: a custom domain needs the records gone first');
  assert.doesNotMatch(toml, /relay\.ebbfall\.com/, "the relay's domain is the relay Worker's");
  assert.match(toml, /^workers_dev = false/m);
});

const dist = new URL('../dist/', import.meta.url);
test('with dist/ built: every file the service worker stores is served as it is, with no redirect', { skip: !existsSync(new URL('sw.js', dist)) && 'dist/ not built' }, async () => {
  const files = JSON.parse(readFileSync(new URL('sw.js', dist), 'utf8').match(/^const FILES = (.*);$/m)[1]);
  const disk = { async fetch(req) { const p = new URL(req.url).pathname.slice(1); return existsSync(new URL(p, dist)) && p ? new Response(readFileSync(new URL(p, dist))) : new Response('', { status: 404 }); } };
  for (const f of files) {
    const res = await worker.fetch(new Request(new URL(f, 'https://ebbfall-site.example.workers.dev/')), { ASSETS: disk });
    assert.equal(res.status, 200, f);
    const want = readFileSync(new URL(f === './' ? 'index.html' : f, dist));
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(want), f);
  }
  // The files for crawlers and link previews are built too, and left out of the offline store.
  for (const f of ['robots.txt', 'sitemap.xml', 'og.png']) {
    assert.ok(existsSync(new URL(f, dist)), f);
    assert.ok(!files.includes(f), `${f}: not stored for offline play`);
  }
  // The head as built: the cards' tags and their absolute URLs as written (Vite leaves them alone).
  const built = readFileSync(new URL('index.html', dist), 'utf8');
  for (const tag of ['<meta property="og:image" content="https://ebbfall.com/og.png">', '<meta property="og:url" content="https://ebbfall.com/">', '<link rel="canonical" href="https://ebbfall.com/">', '<script type="application/ld+json">']) {
    assert.ok(built.includes(tag), tag);
  }
});
