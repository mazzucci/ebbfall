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
  const token = beaconToken(env);
  if (!token || !res.ok) return res;
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>`;
  return new HTMLRewriter().on('body', { element: (e) => e.append(beacon, { html: true }) }).transform(res);
}

/** CF_ANALYTICS_TOKEN when the Worker adds the beacon (and only a well-formed one), else null. */
const beaconToken = (env) => (env.CF_ANALYTICS_TOKEN && /^[\w-]+$/.test(env.CF_ANALYTICS_TOKEN) ? env.CF_ANALYTICS_TOKEN : null);

/**
 * The page with the beacon is another page than the file: its ETag gets RUM at the end, so that a browser's copy from
 * before the token was set is not answered 304 (it would go on without the beacon), and the If-None-Match it sends back
 * loses it again before the assets compare it with the file's (a tag without it is a copy without the beacon: dropped).
 */
const RUM = '-rum';
/** If-None-Match as the assets should see it: only the tags with RUM (copies with the beacon), RUM taken off. */
const untagged = (inm) => inm.split(',').map(t => t.trim()).filter(t => t.endsWith(`${RUM}"`)).map(t => t.slice(0, -RUM.length - 1) + '"').join(', ');
function tagged(res) {
  const etag = res.headers.get('ETag');
  if (!etag) return res;
  const out = new Response(res.body, res);
  out.headers.set('ETag', etag.replace(/"$/, `${RUM}"`));
  return out;
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
    const path = url.pathname === '/' ? '/index.html' : url.pathname, rum = path === '/index.html' && !!beaconToken(env);
    const headers = new Headers(req.headers);
    if (rum && headers.has('If-None-Match')) {
      const inm = untagged(headers.get('If-None-Match'));
      if (inm) headers.set('If-None-Match', inm); else headers.delete('If-None-Match');
    }
    const res = await env.ASSETS.fetch(new Request(new URL(path, url), { method: req.method, headers }));
    if (res.status === 404) return notFound(req, url);
    if (path !== '/index.html') return withCache(res, path);
    return page(req, rum ? tagged(withCache(res, path)) : withCache(res, path), url, env);
  },
};
