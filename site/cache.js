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

/**
 * Headers every response carries, the Worker's and the files': no type sniffing, a referrer that is only the origin to
 * another site, and none of the device's powers the game does not use. It uses full screen (screen.js), sound that
 * starts on a tap (audio.js: autoplay), the share sheet and the clipboard (share.js, online.js: a room's link); never
 * a camera, a microphone, the location, the motion sensors, payment, USB or screen capture. No CSP and no framing rule
 * yet (a later change).
 */
export const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), autoplay=(self), camera=(), clipboard-write=(self), display-capture=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), web-share=(self)',
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
