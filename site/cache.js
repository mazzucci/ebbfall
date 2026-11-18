// The site's cache headers (Notion: Multiplayer design, Hosting), one table for both ways a file is served: the Worker's
// responses (worker.js) and the files Cloudflare serves alone, through dist/_headers (build.mjs). A module of its own:
// a Worker's entry module may export only handlers.

/**
 * Cache-Control by path. Vite's output in assets/ is named by its content: kept for good. The pages, the service
 * worker and the manifest are checked on every load (no-cache: a 304 when unchanged), so a deploy is seen at once and
 * the service worker's update finds the new build (tools/offline/sw.js stores each file fetched past the HTTP cache, and
 * boot.js switches to a new version when it is installed). Anything else (art/, the icons): Cloudflare's own default,
 * revalidated every time as well (`public, max-age=0, must-revalidate`, with an ETag).
 */
export const CACHE = [
  ['/assets/*', 'public, max-age=31536000, immutable'],
  ['/index.html', 'no-cache'],
  ['/selftest.html', 'no-cache'],
  ['/voice-lab.html', 'no-cache'],
  ['/sw.js', 'no-cache'],
  ['/manifest.webmanifest', 'no-cache'],
];

/** The published relay's host (relay/wrangler.toml's custom domain; CI's RELAY_URL, baked into the build). */
export const RELAY_HOST = 'relay.ebbfall.com';

/**
 * The Content-Security-Policy, directive by directive: what the site's pages may load and run, each source the one
 * thing that needs it. Scripts: the site's own files, WebAssembly (the sim), the one inline script of index.html (the
 * page's error log, by its hash: test/site-csp.test.js checks every inline script of the built pages has one here) and
 * Cloudflare Web Analytics' beacon (worker.js `beacon`, or the zone's own injection), never eval (PixiJS runs on its
 * eval-free polyfills: gl/render.js imports pixi.js/unsafe-eval) nor any other inline script. Connections: the site,
 * the relay (its websocket, and https for the bench's report, bench.js) and the beacon's reports. Images: the site's
 * files, data: (the page's icon) and blob: (textures); media: the docs' clip. Styles and fonts: the site's own files
 * only, no <style> block or style="" attribute in any page (the docs' are classes in their stylesheet: tools/docs);
 * scripts still set an element's style through the CSSOM, which a policy does not govern. Workers: the service worker,
 * and PixiJS's image decoders (blob: workers). Framing: the site itself and a loopback page (the Claude challenge's
 * page, claude/challenge/, embeds the game).
 */
export const CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'", "'sha256-L7tP3IQG4uAOrWbLJ0fJ8qGdXfMgFQ8Ya7VsjdY+12Q='", 'https://static.cloudflareinsights.com'],
  'connect-src': ["'self'", `wss://${RELAY_HOST}`, `https://${RELAY_HOST}`, 'https://cloudflareinsights.com'],
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
};

/** The policy as a header's value (`csp`: CSP, or a copy with more sources, as the e2e tests' server adds its relay). */
export const cspValue = (csp = CSP) => Object.entries(csp).map(([k, v]) => [k, ...v].join(' ')).join('; ');

/** Report-only for now: a browser reports what the policy would block (in its console), and blocks nothing. */
export const CSP_HEADER = 'Content-Security-Policy-Report-Only';

/**
 * Headers every response carries, the Worker's and the files': no type sniffing, a referrer that is only the origin to
 * another site, none of the device's powers the game does not use, and the CSP. It uses full screen (screen.js), sound
 * that starts on a tap (audio.js: autoplay), the share sheet and the clipboard (share.js, online.js: a room's link);
 * never a camera, a microphone, the location, the motion sensors, payment, USB or screen capture.
 */
export const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), autoplay=(self), camera=(), clipboard-write=(self), display-capture=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), web-share=(self)',
  [CSP_HEADER]: cspValue(),
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
