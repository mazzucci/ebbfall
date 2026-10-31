// Vite plugin: after a build, writes dist/sw.js, a service worker that stores every file of the game (except source
// maps and WEB_ONLY) so Ebbfall runs with no connection once it has been opened (or added to the home screen). The cache
// name is a hash of the file list and contents: a new build installs a new cache and drops the old one.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

function files(dir, root = dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, root) : [relative(root, p).split(sep).join('/')];
  });
}

/** The service worker's source for a cache `version`, the game's `build` (the About page's version) and its files. */
export function swSource(version, build, list) {
  return readFileSync(new URL('./sw.js', import.meta.url), 'utf8')
    .replace('__VERSION__', () => version)
    .replace('__BUILD__', () => build)
    .replace('__FILES__', () => JSON.stringify(list));
}

/** Files for search engines, link previews and readers, not the game's: not stored for offline play (og.png, the link
 *  preview's image, is a fifth of the download the game needs; the docs, tools/docs, are a site of their own, online
 *  only). An entry ending in / is a folder: everything in it. */
export const WEB_ONLY = ['og.png', 'robots.txt', 'sitemap.xml', 'llms.txt', 'docs/', 'docs-img/'];
/** Whether a file of dist/ (its path there, `docs/index.html`) is WEB_ONLY. */
export const webOnly = (f) => WEB_ONLY.some(w => (w.endsWith('/') ? f.startsWith(w) : f === w));

export function offline() {
  let outDir = 'dist', build = 'dev';
  return {
    name: 'endfall-offline',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
      try { build = JSON.parse(c.define?.__SIM_BUILD__ ?? '"dev"'); } catch { /* keep 'dev' */ } // (vite.config.js)
    },
    closeBundle() {
      const list = files(outDir).filter(f => !f.endsWith('.map') && f !== 'sw.js' && !webOnly(f)).sort();
      const h = createHash('sha256');
      for (const f of list) { h.update(f); h.update(readFileSync(join(outDir, f))); }
      writeFileSync(join(outDir, 'sw.js'), swSource(h.digest('hex').slice(0, 12), build, ['./', ...list]));
    },
  };
}
