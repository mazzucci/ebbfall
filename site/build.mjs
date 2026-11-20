// Wrangler's build step (wrangler.toml [build]), before every deploy or dev run, on the built game (dist/, from the build
// job): writes dist/_headers, the cache and security headers of the files Cloudflare serves (every page: no Worker runs
// for them), from cache.js; and, with CF_ANALYTICS_TOKEN in the environment (CI's deploy: the repo variable of that
// name), Cloudflare Web Analytics' beacon into every page of dist/ (the game's, the docs', the device check's and the
// voice lab's: beacon.js `pages`), so a visit to any of them is counted. Not part of `npm run build`: it is Cloudflare's
// configuration, not a file of the game (the service worker would store _headers), and the build job's dist/ (the one
// the browser tests ran) stays as it was tested, without the beacon.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { headersFile } from './cache.js';
import { withBeacon, pages } from './beacon.js';

const dist = process.argv[2] ? pathToFileURL(`${resolve(process.argv[2])}/`) : new URL('../dist/', import.meta.url); // (another folder: the tests')
const page = new URL('index.html', dist);
if (!existsSync(page)) {
  console.error('site/build.mjs: dist/ has no index.html: run `npm run build` at the repo root first.');
  process.exit(1);
}
writeFileSync(new URL('_headers', dist), headersFile());
const token = process.env.CF_ANALYTICS_TOKEN;
let carrying = 0;
const all = pages(fileURLToPath(dist));
for (const file of all) {
  const html = readFileSync(file, 'utf8'), out = withBeacon(html, token);
  if (out !== html) writeFileSync(file, out);
  if (/cloudflareinsights/.test(out)) carrying++;
}
console.log(`site/build.mjs: dist/_headers written; the analytics beacon in ${carrying} of ${all.length} pages`);
