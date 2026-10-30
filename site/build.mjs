// Wrangler's build step (wrangler.toml [build]), before every deploy or dev run: writes dist/_headers, the cache headers
// of the files Cloudflare serves without the Worker, from the Worker's own table (cache.js). Not part of
// `npm run build`: it is Cloudflare's configuration, not a file of the game (the service worker would store it).
import { existsSync, writeFileSync } from 'node:fs';
import { headersFile } from './cache.js';

const dist = new URL('../dist/', import.meta.url);
if (!existsSync(new URL('index.html', dist))) {
  console.error('site/build.mjs: dist/ has no index.html: run `npm run build` at the repo root first.');
  process.exit(1);
}
writeFileSync(new URL('_headers', dist), headersFile());
