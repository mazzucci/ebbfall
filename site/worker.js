// Ebbfall's site on Cloudflare: a Worker with static assets (wrangler.toml) serving the built game, dist/. Cloudflare
// serves the files itself, with the cache headers of dist/_headers (written by build.mjs from cache.js, before every
// deploy); this Worker runs only for the game's page (/ and /index.html, `run_worker_first`) and for whatever is not a
// file. Served at exact paths, as GitHub Pages serves them (html_handling = "none": no redirect from /selftest.html to
// /selftest, which the service worker could not answer a page load with). It answers ebbfall.com and www.ebbfall.com
// (wrangler.toml's routes, over the proxied records): www and plain http go to https://ebbfall.com/, the game's one
// origin (its service worker, its saved settings). The game's page gets a shared link's own card (preview.js: a
// room's) and, with a token, the analytics beacon (`page`).

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
  if (!card && !token) {
    const res = await file(req.method, req.headers);
    return res.status === 404 ? notFound(req, url) : withCache(res, '/index.html');
  }
  const headers = new Headers(req.headers);
  headers.delete('If-None-Match'); headers.delete('If-Modified-Since');
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
  return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname === 'www.' + CANONICAL || (url.hostname === CANONICAL && url.protocol === 'http:')) {
      return new Response(null, { status: 301, headers: { Location: `https://${CANONICAL}${url.pathname}${url.search}` } });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return page(req, url, env);
    const res = await env.ASSETS.fetch(new Request(new URL(url.pathname, url), { method: req.method, headers: req.headers }));
    return res.status === 404 ? notFound(req, url) : withCache(res, url.pathname);
  },
};
