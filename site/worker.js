// Ebbfall's site on Cloudflare: a Worker with static assets (wrangler.toml) serving the built game, dist/. Cloudflare
// serves every file itself, the game's page (/), the docs (/docs/kingdom/) and the other pages (/selftest) among them,
// with the cache and security headers of dist/_headers (written by build.mjs from cache.js, before every deploy; the
// analytics beacon is written into the page there too). So the game, the docs and single player need no Worker at all:
// a tripped Workers spending limit (error 1103 for every Worker request) leaves them up. This Worker runs only for what
// is not a file (html_handling = "auto-trailing-slash": / is index.html, /docs/kingdom/ that folder's index.html,
// /selftest.html is sent to /selftest), and answers: a room's card address (`/r/CODE`, SHARE LINK in a room: preview.js),
// a challenge's (`/vs/CODE`, SHARE after a victory: preview.js), the docs' feedback form (POST /api/feedback, mailed
// to contact@ebbfall.com: feedback.js, with its counter, the Durable Object FeedbackBudget), the CSP's reports, www and plain http sent on to https://ebbfall.com/ (wrangler.toml's routes, over the proxied
// records; the game's one origin, its service worker, its saved settings: index.html's first script sends a page served
// as a file there on too), and anything else, not found. One kind of file runs it first: the docs' videos (MEDIA_PATH,
// wrangler.toml run_worker_first), answered with byte ranges, which the assets do not serve and Safari needs (media.js).

import { SECURITY, CSP_REPORT } from './cache.js';
import { ORIGIN, ROOM_PATH, VS_PATH, roomCode, roomPage, challengeCode, challengePage } from './preview.js';
import { FEEDBACK_PATH, feedback } from './feedback.js';
import { MEDIA_PATH, media } from './media.js';

export { FeedbackBudget } from './feedback.js'; // (a Durable Object class: the Workers runtime takes it from the entry module)

/** The game's address: www.ebbfall.com, and http, are sent here (as GitHub Pages did). */
const CANONICAL = new URL(ORIGIN).hostname;

const plain404 = () => new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * Not a file. A page load (a mistyped or old link) goes to the game, its query kept (?room=ABCD); anything else (a
 * script, an image: say a stale page's) is a plain 404, never the game's HTML in place of a file.
 */
function notFound(req, url) {
  const navigate = req.headers.get('Sec-Fetch-Mode') === 'navigate' || (req.headers.get('Accept') || '').includes('text/html');
  if (navigate && (req.method === 'GET' || req.method === 'HEAD')) {
    return new Response(null, { status: 302, headers: { Location: new URL('/' + url.search, url).href, 'Cache-Control': 'no-store' } });
  }
  return plain404();
}

/**
 * A room's card address, `/r/CODE` (SHARE LINK in a room): a small page with the room's own card for a chat's link
 * preview, which sends a browser on to the room (preview.js roomPage). Not a valid code: not found (a page load: the
 * game). Online play needs the relay, a Worker too, so this is the one link that a tripped limit takes down with it;
 * the room's plain link, `/?room=CODE`, is a file (with the site's card).
 */
function room(req, url) {
  return cardPage(req, url, roomPage(roomCode(url.pathname)));
}

/**
 * A challenge's card address, `/vs/CODE` (SHARE after a victory, on the site): the same, with the challenge's own card
 * ("Can you beat this?"), on to `/?vs=CODE` (preview.js challengePage). The plain link, `/?vs=CODE`, is a file (with the
 * site's card), and every old link still opens the challenge.
 */
function vs(req, url) {
  return cardPage(req, url, challengePage(challengeCode(url.pathname)));
}

/** A card page's answer (`page`: its HTML, or null for an address that names no room or challenge: not found). */
function cardPage(req, url, page) {
  if (!page || (req.method !== 'GET' && req.method !== 'HEAD')) return notFound(req, url);
  return new Response(req.method === 'HEAD' ? null : page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

/**
 * A browser's report of what the CSP refused (cache.js CSP_REPORT; report-uri's JSON or the Reporting API's): logged, at
 * most 2 KB of it, for the Worker's logs (wrangler tail), and answered 204. Nothing is kept.
 */
async function cspReport(req) {
  if (req.method !== 'POST') return plain404();
  const body = await req.text().catch(() => '');
  console.log(`csp-report ${body.slice(0, 2048)}`);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/** `res` with the SECURITY headers (a copy: a response's headers may be immutable). */
function secure(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(req, env) { return secure(await answer(req, env || {})); },
};

/** The response for `req` (never a file but a video: Cloudflare served the others), before the SECURITY headers. */
async function answer(req, env) {
  const url = new URL(req.url);
  if (url.hostname === 'www.' + CANONICAL || (url.hostname === CANONICAL && url.protocol === 'http:')) {
    return new Response(null, { status: 301, headers: { Location: `https://${CANONICAL}${url.pathname}${url.search}` } });
  }
  if (url.pathname.startsWith(MEDIA_PATH)) return media(req, env);
  if (url.pathname === CSP_REPORT) return cspReport(req);
  if (url.pathname === FEEDBACK_PATH) return feedback(req, env, url);
  if (url.pathname.startsWith(ROOM_PATH)) return room(req, url);
  if (url.pathname.startsWith(VS_PATH)) return vs(req, url);
  return notFound(req, url);
}
