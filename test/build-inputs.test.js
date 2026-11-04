// The build stamp names the last commit that changed what ships (vite.config.js `SHIPPED`): a path missing from that
// list would let a real game update go out under an older stamp, and an installed copy would look up to date when it
// is not. So the production build runs here (in memory, nothing written) with a plugin that sees every file it reads,
// and each must lie under a listed path. public/ is copied as is: its files are covered by the 'public' entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { SHIPPED } from '../vite.config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const wasm = existsSync(resolve(root, 'src/engine/pkg/endfall_sim_bg.wasm'));
const under = (rel) => SHIPPED.some(p => rel === p || rel.startsWith(p + '/'));

test('every file the production build reads lies under a path in SHIPPED', { skip: !wasm && !process.env.ENDFALL_REQUIRE_WASM && 'no WASM built (npm run build:wasm)' }, async () => {
  const read = new Set();
  const spy = {
    name: 'shipped-spy',
    enforce: 'pre',
    load(id) { read.add(id); return null; },
    transformIndexHtml: { order: 'pre', handler(html, ctx) { read.add(ctx.filename); return html; } },
  };
  await build({ root, logLevel: 'silent', plugins: [spy], build: { write: false, emptyOutDir: false } });
  const files = [...read]
    .map(id => id.split('?')[0])
    .filter(id => id.startsWith(root) && !id.includes(`${sep}node_modules${sep}`)) // (node_modules: package-lock.json)
    .map(id => relative(root, id).split(sep).join('/'));
  assert.ok(files.length > 20 && files.includes('src/main.js') && files.includes('index.html'), `the build was seen: ${files.length} files`);
  const outside = files.filter(f => !under(f));
  assert.deepEqual(outside, [], 'files the build reads outside SHIPPED (add their path to vite.config.js)');
});
