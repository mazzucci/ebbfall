// Ebbfall's site on Cloudflare: a Worker with static assets (wrangler.toml) serving the built game, dist/. Cloudflare
// serves the files itself, with the cache headers of dist/_headers (written by build.mjs from cache.js, before every
// deploy); this Worker runs only for the game's page (/ and /index.html, `run_worker_first`) and for whatever is not a
// file. Served at exact paths, as GitHub Pages serves them (html_handling = "none": no redirect from /selftest.html to
// /selftest, which the service worker could not answer a page load with). It answers ebbfall.com and www.ebbfall.com
// (wrangler.toml's routes, over the proxied records): www and plain http go to https://ebbfall.com/, the game's one
// origin (its service worker, its saved settings). The game's page gets a shared link's own card (preview.js: a
// room's) and, with a token, the analytics beacon (`page`). The docs (/docs/, tools/docs) are files too; the Worker
// answers their folder addresses (/docs/units/trooper/ is that folder's index.html) and their own 404 (`docs`).

import { cacheControl } from './cache.js';
import { ORIGIN, preview, edits } from './preview.js';

/** The game's address: www.ebbfall.com, and http, are sent here (as GitHub Pages did). */
const CANONICAL = new URL(ORIGIN).hostname;

function withCache(res, path) {
  const cc = cacheControl(path);
  if (!cc) return res;
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', cc);
  return out;
}

/**
 * The game's page, for every link into the game (/, ?room=, ?bench, ?seed=, ...): index.html, with the link's own card
 * (preview.js: a room's link says which room, in its og: and twitter: tags) and the analytics beacon written in by
 * HTMLRewriter; with neither, the file as it is.
 *
 * Cloudflare Web Analytics: with CF_ANALYTICS_TOKEN (a var, from the repo variable of that name: CI's deploy) the page
 * carries the beacon, a deferred cross-origin script (the service worker leaves it to the network: offline it does not
 * load, and nothing else needs it). Unset by default: the zone's automatic injection may already add it at the edge
 * (docs/MULTIPLAYER.md, Hosting), and both at once would count every visit twice.
 *
 * ETag: the file's own (and the assets' 304) only for the file as it is. A rewritten page is another document than the
 * file, and which one depends on the link (the room's code), the token and this Worker's code (the cards' wording), not
 * on the file alone: a tag derived from the file's would let a browser keep a copy that no longer matches (a 304 for a
 * card reworded by a deploy that left index.html alone, or for a page from before the token). So a rewritten page is
 * built whole (the file fetched unconditionally, about 25 KB) and its tag is a hash of the bytes sent: a 304 exactly
 * when the browser holds those bytes, whatever changed. Crawlers rarely revalidate; browsers do, on every load
 * (no-cache), and get their 304 as before.
 */
async function page(req, url, env) {
  const card = preview(url), token = beaconToken(env);
  const file = (method, headers) => env.ASSETS.fetch(new Request(new URL('/index.html', url), { method, headers }));
  if ((!card && !token) || (req.method !== 'GET' && req.method !== 'HEAD')) { // (any other method: the assets' answer, as for any file)
    const res = await file(req.method, req.headers);
    return res.status === 404 ? notFound(req, url) : withCache(res, '/index.html');
  }
  const headers = new Headers(req.headers);
  for (const h of ['If-None-Match', 'If-Modified-Since', 'Range', 'If-Range']) headers.delete(h); // (the whole file, always: it is rewritten and hashed)
  const res = await file('GET', headers);
  if (res.status === 404) return notFound(req, url);
  if (!res.ok) return withCache(res, '/index.html');
  let rw = new HTMLRewriter();
  for (const [sel, content] of edits(card)) rw = rw.on(sel, { element: (e) => e.setAttribute('content', content) });
  if (token) rw = rw.on('body', { element: (e) => e.append(beacon(token), { html: true }) });
  const body = await rw.transform(res).text();
  const out = new Headers(res.headers);
  for (const h of ['Content-Length', 'Content-Encoding', 'Last-Modified']) out.delete(h); // (another body: the edge sizes and compresses it)
  out.set('ETag', await etagOf(body));
  out.set('Cache-Control', cacheControl('/index.html'));
  if (matches(req.headers.get('If-None-Match'), out.get('ETag'))) return new Response(null, { status: 304, headers: out });
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: out });
}

/** CF_ANALYTICS_TOKEN when the Worker adds the beacon (and only a well-formed one), else null. */
const beaconToken = (env) => (env.CF_ANALYTICS_TOKEN && /^[\w-]+$/.test(env.CF_ANALYTICS_TOKEN) ? env.CF_ANALYTICS_TOKEN : null);
const beacon = (token) => `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>`;

/** A strong ETag of a page's bytes (SHA-256, 16 hex digits: `"p-..."`, never one of the assets' tags). */
async function etagOf(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `"p-${[...d.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('')}"`;
}
/** Whether If-None-Match names `etag` (`*`, or a list; compared weakly, as RFC 9110 asks: the edge may weaken a tag). */
const matches = (inm, etag) => !!inm && (inm.trim() === '*' || inm.split(',').some(t => t.trim().replace(/^W\//, '') === etag));

/**
 * Not a file. A page load (a mistyped or old link) goes to the game, its query kept (?room=ABCD); anything else (a
 * script, an image: say a stale page's) is a plain 404, never the game's HTML in place of a file.
 */
function notFound(req, url) {
  const navigate = req.headers.get('Sec-Fetch-Mode') === 'navigate' || (req.headers.get('Accept') || '').includes('text/html');
  if (navigate && (req.method === 'GET' || req.method === 'HEAD')) {
    return new Response(null, { status: 302, headers: { Location: new URL('/' + url.search, url).href, 'Cache-Control': 'no-store' } });
  }
  return missing();
}
const missing = () => new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * The docs (tools/docs: dist/docs/), which link to folders (/docs/units/trooper/): with html_handling "none" the
 * assets serve exact files only, so a folder's address is not a file and comes here; it gets the folder's index.html
 * (/docs, and a folder without its slash, are sent to the address with it, as a folder's relative links need). Any
 * other /docs/ address is the docs' own 404 page, with a 404 status: a mistyped or old docs link (a unit renamed) is
 * shown where it went wrong, with links back into the docs, rather than the game's redirect (which would drop a reader
 * who came for the docs onto the game's menu with no word of why). Requests that are not page loads (an image) get the
 * plain 404, as anywhere.
 */
async function docs(req, url, env) {
  const asset = (path, method = req.method) => env.ASSETS.fetch(new Request(new URL(path, url), { method, headers: req.headers }));
  const path = url.pathname;
  if (path.endsWith('/')) {
    const res = await asset(path + 'index.html');
    if (res.status !== 404) return withCache(res, path + 'index.html');
  } else if (!/\.\w+$/.test(path) && (await asset(path + '/index.html', 'HEAD')).ok) {
    return new Response(null, { status: 301, headers: { Location: new URL(path + '/' + url.search, url).href, 'Cache-Control': 'no-store' } });
  } else {
    const res = await asset(path); // (a file: here only in tests and wrangler dev; Cloudflare serves files itself)
    if (res.status !== 404) return withCache(res, path);
  }
  const navigate = req.headers.get('Sec-Fetch-Mode') === 'navigate' || (req.headers.get('Accept') || '').includes('text/html');
  if (!navigate || (req.method !== 'GET' && req.method !== 'HEAD')) return notFound(req, url);
  const page = await env.ASSETS.fetch(new Request(new URL('/docs/404.html', url), { method: 'GET' }));
  if (!page.ok) return missing(); // (a build without the docs' 404 page: still a 404, never the game)
  return new Response(req.method === 'HEAD' ? null : page.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname === 'www.' + CANONICAL || (url.hostname === CANONICAL && url.protocol === 'http:')) {
      return new Response(null, { status: 301, headers: { Location: `https://${CANONICAL}${url.pathname}${url.search}` } });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return page(req, url, env);
    if (url.pathname === '/docs') return new Response(null, { status: 301, headers: { Location: new URL('/docs/' + url.search, url).href, 'Cache-Control': 'no-store' } });
    if (url.pathname.startsWith('/docs/')) return docs(req, url, env);
    const res = await env.ASSETS.fetch(new Request(new URL(url.pathname, url), { method: req.method, headers: req.headers }));
    return res.status === 404 ? notFound(req, url) : withCache(res, url.pathname);
  },
};
