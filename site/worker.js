// Ebbfall's site on Cloudflare: a Worker with static assets (wrangler.toml) serving the built game, dist/. Cloudflare
// serves the files itself, with the cache headers of dist/_headers (written by build.mjs from cache.js, before every
// deploy); this Worker runs only for the game's page (/ and /index.html, `run_worker_first`) and for whatever is not a
// file. Served at exact paths, as GitHub Pages serves them (html_handling = "none": no redirect from /selftest.html to
// /selftest, which the service worker could not answer a page load with). It answers ebbfall.com and www.ebbfall.com
// (wrangler.toml's custom domains): www and plain http go to https://ebbfall.com/, the game's one origin (its service
// worker, its saved settings). Thin on purpose: the next step adds link previews to the game's page (`page`).

import { cacheControl } from './cache.js';

/** The game's address: www.ebbfall.com, and http, are sent here (as GitHub Pages did). */
const CANONICAL = 'ebbfall.com';

function withCache(res, path) {
  const cc = cacheControl(path);
  if (!cc) return res;
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', cc);
  return out;
}

/**
 * The game's page, for every link into the game (/, ?room=, ?bench, ?seed=, ...). Link previews go here: the next step
 * answers a room's, a challenge's or a replay's link with its own Open Graph tags (og:title, og:description, og:image),
 * through the same HTMLRewriter, keyed on `url.searchParams`.
 *
 * Cloudflare Web Analytics: with CF_ANALYTICS_TOKEN (a var, from the repo variable of that name: CI's deploy) the page
 * carries the beacon, a deferred cross-origin script (the service worker leaves it to the network: offline it does not
 * load, and nothing else needs it). Unset by default: the zone's automatic injection may already add it at the edge
 * (docs/MULTIPLAYER.md, Hosting), and both at once would count every visit twice.
 */
function page(req, res, url, env) {
  const token = env.CF_ANALYTICS_TOKEN;
  if (!token || !/^[\w-]+$/.test(token) || !res.ok) return res;
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>`;
  return new HTMLRewriter().on('body', { element: (e) => e.append(beacon, { html: true }) }).transform(res);
}

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
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const res = await env.ASSETS.fetch(new Request(new URL(path, url), req));
    if (res.status === 404) return notFound(req, url);
    return path === '/index.html' ? page(req, withCache(res, path), url, env) : withCache(res, path);
  },
};
