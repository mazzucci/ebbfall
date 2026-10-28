// The browser tests take `test` from their harness (test/e2e/harness.mjs), never from node:test: the harness's `test`
// is what keeps WebKit and Firefox to the cross-engine subset (CI's engines job, which publishing waits for) and skips
// the Chromium-only scenarios there. A file that took node:test's own would run in full in every engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('./e2e/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.e2e.mjs'));
/** The names a file imports from `from`, as written (`a as b` counts as `a`). */
const imported = (src, from) => [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)]
  .filter(m => m[2] === from).flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));

test('there are browser tests to check', () => assert.ok(files.length >= 5, files.join(', ')));

for (const f of files) {
  test(`${f} takes test from the harness, not from node:test`, () => {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!imported(src, 'node:test').includes('test'), `${f}: import { test } from './harness.mjs' (node:test's runs every scenario in WebKit and Firefox)`);
    assert.ok(!/import\s+\*\s+as\s+\w+\s+from\s*['"]node:test['"]|import\s+\w+\s+from\s*['"]node:test['"]/.test(src), `${f}: no default or namespace import of node:test (its test would bypass the harness)`);
    if (/^\s*test\(/m.test(src)) assert.ok(imported(src, './harness.mjs').includes('test'), `${f} declares tests: import { test } from './harness.mjs'`);
  });
}
