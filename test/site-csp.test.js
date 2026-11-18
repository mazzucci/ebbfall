// The site's Content-Security-Policy (site/cache.js CSP): the policy itself (no unsafe-inline or unsafe-eval anywhere,
// every directive the review asked for, the relay and the beacon it names the ones the code uses), and the pages it
// governs: no <style> block, style="" attribute or inline event handler in any of them, and every inline script with
// its hash in script-src (index.html's error log; JSON-LD is data, not script). With dist/ built (CI runs this again
// after the build), every page of the build, the docs' too. The browser's own word on it: test/e2e/csp.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP, CSP_HEADER, RELAY_HOST, SECURITY, cspValue } from '../site/cache.js';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const hash = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

/** Every inline script that runs (no src; no type, or a JavaScript one: not JSON-LD), as its text. */
function inlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs))
    .filter(([, attrs]) => { const t = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase(); return !t || t === 'text/javascript' || t === 'module'; })
    .map(([, , body]) => body);
}

/** What the policy would refuse in a page's markup (`modules`: inline module scripts allowed, Vite bundles them). */
function check(name, html, { modules = false } = {}) {
  assert.ok(!/<style\b/i.test(html), `${name}: no <style> block (a stylesheet file instead)`);
  assert.ok(!/<[a-z][^>]*\sstyle\s*=/i.test(html), `${name}: no style="" attribute (a class instead)`);
  assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(html), `${name}: no inline event handler`);
  for (const body of inlineScripts(modules ? html.replace(/<script\b[^>]*type=["']?module[^>]*>[\s\S]*?<\/script>/gi, '') : html)) {
    assert.ok(CSP['script-src'].includes(hash(body)), `${name}: an inline script without its hash in script-src (site/cache.js): ${hash(body)} for ${body.slice(0, 80)}`);
  }
}

test('the policy: every directive, nothing unsafe but WebAssembly, framing by the site and loopback only', () => {
  for (const d of ['default-src', 'script-src', 'connect-src', 'img-src', 'media-src', 'style-src', 'font-src', 'worker-src', 'manifest-src', 'frame-ancestors', 'base-uri', 'form-action', 'object-src']) assert.ok(CSP[d]?.length, d);
  const all = Object.values(CSP).flat();
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", '*', 'http:', 'https:']) assert.ok(!all.includes(bad), bad);
  assert.ok(CSP['script-src'].includes("'wasm-unsafe-eval'"), 'the sim is WebAssembly');
  assert.deepEqual(CSP['style-src'], ["'self'"]);
  assert.deepEqual(CSP['object-src'], ["'none'"]);
  assert.deepEqual(CSP['frame-ancestors'], ["'self'", 'http://127.0.0.1:*', 'http://localhost:*'], 'the challenge page on loopback embeds the game');
  assert.equal(SECURITY[CSP_HEADER], cspValue(), 'the header carries the policy');
  assert.equal(cspValue().split('; ').length, Object.keys(CSP).length);
});

test("the relay and the beacon the policy names are the ones the code uses", () => {
  assert.match(read('relay/wrangler.toml'), new RegExp(`pattern = "${RELAY_HOST.replace(/\./g, '\\.')}", custom_domain = true`), "the relay's custom domain");
  assert.ok(read('.github/workflows/ci.yml').includes(`'wss://${RELAY_HOST}/'`), "CI's default RELAY_URL");
  assert.ok(CSP['connect-src'].includes(`wss://${RELAY_HOST}`), 'its websocket');
  assert.ok(CSP['connect-src'].includes(`https://${RELAY_HOST}`), "the bench's report (bench.js: the relay's address over https)");
  const beacon = read('site/worker.js').match(/src="(https:\/\/[^/"]+)\/beacon\.min\.js"/)[1];
  assert.ok(CSP['script-src'].includes(beacon), 'the analytics beacon');
  assert.ok(CSP['connect-src'].includes('https://cloudflareinsights.com'), "the beacon's reports");
});

test('the pages as written: no inline style or handler, every inline script hashed', () => {
  check('index.html', read('index.html'));
  check('selftest.html', read('selftest.html'), { modules: true });
  check('voice-lab.html', read('voice-lab.html'));
  assert.equal(inlineScripts(read('index.html')).length, 1, "index.html: one inline script, the error log (a second: hash it, or a file)");
});

const dist = fileURLToPath(new URL('dist/', root));
const htmlIn = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? htmlIn(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));
test('with dist/ built: every page of the build, the docs too', { skip: !existsSync(join(dist, 'index.html')) && 'dist/ not built' }, () => {
  const pages = htmlIn(dist);
  assert.ok(pages.some(p => p.endsWith(join('docs', 'kingdom', 'index.html'))), 'the docs are there');
  for (const p of pages) check(p.slice(dist.length), readFileSync(p, 'utf8'));
  assert.ok(existsSync(join(dist, 'docs', 'docs.css')) && existsSync(join(dist, 'docs', 'docs.js')), "the docs' stylesheet and script");
});
