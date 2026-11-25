// The site's headers (Notion: Multiplayer design, Hosting): the files' cache headers and the security headers every
// response carries, the files Cloudflare serves alone through dist/_headers (build.mjs) and the Worker's own (worker.js:
// what is not a file). A module of its own: a Worker's entry module may export only handlers.

/**
 * Cache-Control by the address a file is served at (Cloudflare matches _headers against the request's path, and serves
 * the pages at their canonical addresses: wrangler.toml html_handling, index.html at /, selftest.html at /selftest).
 * Vite's output in assets/ is named by its content: kept for good. The pages, the service worker and the manifest are
 * checked on every load (no-cache: a 304 when unchanged), so a deploy is seen at once and the service worker's update
 * finds the new build (tools/offline/sw.js asks the host for each file it stores, a 304 where the browser has it, and boot.js switches to a new
 * version when it is installed). The link preview's image is kept a day (a chat app or a crawler asks for it with every
 * card it draws; it changes with the art, rarely). Anything else (art/, the icons, the docs): Cloudflare's own default,
 * revalidated every time as well (`public, max-age=0, must-revalidate`, with an ETag).
 */
export const CACHE = [
  ['/assets/*', 'public, max-age=31536000, immutable'],
  ['/', 'no-cache'],
  ['/selftest', 'no-cache'],
  ['/voice-lab', 'no-cache'],
  ['/sw.js', 'no-cache'],
  ['/manifest.webmanifest', 'no-cache'],
  ['/og.png', 'public, max-age=86400'],
];

/** The address Cloudflare serves a page of dist/ at (html_handling = "auto-trailing-slash"): index.html at its folder
 *  (/, /docs/kingdom/), any other .html without its extension (/selftest); any other file at its own path. */
export const servedAt = (file) => (file === 'index.html' || file.endsWith('/index.html') ? `/${file.slice(0, -'index.html'.length)}` : `/${file.replace(/\.html$/, '')}`);

/** Where browsers send the policy's violation reports (worker.js answers them and logs each, short). */
export const CSP_REPORT = '/csp-report';

/** The published relay's host (relay/wrangler.toml's custom domain; CI's RELAY_URL, baked into the build). */
export const RELAY_HOST = 'relay.ebbfall.com';

/**
 * The Content-Security-Policy, directive by directive: what the site's pages may load and run, each source the one
 * thing that needs it. Scripts: the site's own files, WebAssembly (the sim), the one inline script of index.html (the
 * page's origin check and error log, by its hash: test/site-csp.test.js checks every inline script of the built pages
 * has one here), the one of a room's or a challenge's card page (site/preview.js CARD_SCRIPT, on to the game's page) and Cloudflare Web
 * Analytics' beacon (build.mjs `beacon`, written into index.html at deploy, or the zone's own injection), never eval (PixiJS runs on its
 * eval-free polyfills: gl/render.js imports pixi.js/unsafe-eval) nor any other inline script. Connections: the site,
 * the relay (its websocket, and https for the bench's report, bench.js), the beacon's reports and data: (PixiJS's
 * worker probes createImageBitmap on a data: PNG); the site includes the docs' feedback form's POST (site/feedback.js). Images: the site's
 * files, data: (the page's icon) and blob: (textures); media: the docs' clip. Styles and fonts: the site's own files
 * only, no <style> block or style="" attribute in any page (the docs' are classes in their stylesheet: tools/docs);
 * scripts still set an element's style through the CSSOM, which a policy does not govern. Workers: the service worker,
 * and PixiJS's image decoders (blob: workers). Framing: the site itself and a loopback page (the Claude challenge's
 * page, claude/challenge/, embeds the game). Reports: to CSP_REPORT, by both the old directive and the Reporting API
 * (Reporting-Endpoints below), so a refusal on a player's device reaches the Worker's logs.
 */
export const CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'", "'sha256-eTFFCJaHNJbfy3UVnqjXQWHE3gXUWU3wY8kNv9vSwVU='", "'sha256-CSABZqiwwT9jm4APBFe+Q35/+VMiIcIzPgirR5zacko='", 'https://static.cloudflareinsights.com'],
  'connect-src': ["'self'", 'data:', `wss://${RELAY_HOST}`, `https://${RELAY_HOST}`, 'https://cloudflareinsights.com'],
  'img-src': ["'self'", 'data:', 'blob:'],
  'media-src': ["'self'", 'blob:'],
  'style-src': ["'self'"],
  'font-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'frame-ancestors': ["'self'", 'http://127.0.0.1:*', 'http://localhost:*'],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
  'report-uri': [CSP_REPORT],
  'report-to': ['csp'],
};

/** The policy as a header's value (`csp`: CSP, or a copy with more sources, as the e2e tests' server adds its relay). */
export const cspValue = (csp = CSP) => Object.entries(csp).map(([k, v]) => [k, ...v].join(' ')).join('; ');

/** Enforced: a browser refuses what the policy does not allow (and reports it). It was report-only first (#338), with
 *  no violation found on the live site in Chromium, Firefox or WebKit. */
export const CSP_HEADER = 'Content-Security-Policy';

/**
 * Headers every response carries, the Worker's and the files': no type sniffing, a referrer that is only the origin to
 * another site, none of the device's powers the game does not use, and the CSP. It uses full screen (screen.js), sound
 * that starts on a tap (audio.js: autoplay), the share sheet and the clipboard (share.js, online.js: a room's link);
 * never a camera, a microphone, the location, the motion sensors, payment, USB or screen capture.
 */
export const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), autoplay=(self), camera=(), clipboard-write=(self), display-capture=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()', // (sharing, the Web Share API, is the page's own by default: naming `web-share` only made Chromium log "Unrecognized feature" on every page)
  [CSP_HEADER]: cspValue(),
  'Reporting-Endpoints': `csp="${CSP_REPORT}"`,
};

/** The Cache-Control CACHE gives `path`, or null (the asset's own). */
export function cacheControl(path) {
  const rule = CACHE.find(([p]) => (p.endsWith('/*') ? path.startsWith(p.slice(0, -1)) : path === p));
  return rule ? rule[1] : null;
}

/** SECURITY for every path, then CACHE, as a _headers file (Cloudflare's format: a path, then its headers indented), for
 *  the files served directly. */
export function headersFile() {
  const all = `/*\n${Object.entries(SECURITY).map(([k, v]) => `  ${k}: ${v}\n`).join('')}`; // (Cloudflare adds every rule a path matches)
  return all + CACHE.map(([p, v]) => `${p}\n  Cache-Control: ${v}\n`).join('');
}
