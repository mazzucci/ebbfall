// Vite plugin: after a build, writes dist/sw.js, a service worker that stores every file of the game (except source
// maps) so Endfall runs with no connection once it has been opened (or added to the home screen). The cache name is a
// hash of the file list and contents: a new build installs a new cache and drops the old one.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

function files(dir, root = dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, root) : [relative(root, p).split(sep).join('/')];
  });
}

export function offline() {
  let outDir = 'dist';
  return {
    name: 'endfall-offline',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const list = files(outDir).filter(f => !f.endsWith('.map') && f !== 'sw.js').sort();
      const h = createHash('sha256');
      for (const f of list) { h.update(f); h.update(readFileSync(join(outDir, f))); }
      const src = readFileSync(new URL('./sw.js', import.meta.url), 'utf8')
        .replace('__VERSION__', h.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(['./', ...list]));
      writeFileSync(join(outDir, 'sw.js'), src);
    },
  };
}
