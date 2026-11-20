// Cloudflare Web Analytics' beacon in every page of the site (build.mjs, at deploy: the game's, the docs', the others): a deferred cross-origin script (the CSP
// allows its host: cache.js), from CF_ANALYTICS_TOKEN, the repo variable of that name (a public token: the page shows it
// to every visitor; kept in the repo's configuration, not in its source). The service worker leaves the beacon to the
// network: offline it does not load, and nothing else needs it. Unset by default: the zone's automatic injection may
// already add it at the edge (Notion: Multiplayer design, Hosting), and both at once would count every visit twice.
// test/site-worker.test.js tests it.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every HTML page under the folder `dir` (dist/), as paths. */
export const pages = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(d => d.isFile() && d.name.endsWith('.html')).map(d => join(d.parentPath ?? d.path, d.name)).sort();

/** The beacon's tag for `token`. */
export const beacon = (token) => `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>`;

/** A beacon tag as written by `beacon` (any token), to replace: build.mjs may run more than once on the same dist/. */
const WRITTEN = /<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token":"[\w-]*"\}'><\/script>/g;

/** `html` with the beacon for `token` at the end of its body, once (a beacon written before replaced), or with none
 *  when the token is unset or malformed (anything but letters, digits, _ and -: it goes into the page). */
export function withBeacon(html, token) {
  const bare = html.replace(WRITTEN, '');
  if (!token || !/^[\w-]+$/.test(token)) return bare;
  const at = bare.lastIndexOf('</body>');
  if (at < 0) throw new Error('site/beacon.js: the page has no </body>');
  return bare.slice(0, at) + beacon(token) + bare.slice(at);
}
