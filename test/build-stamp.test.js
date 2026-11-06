// The build stamp (vite.config.js): the commit and its date baked into the build for the first page's stamp and
// About, and <meta name="build"> with the full hash in the page's head, which CI's deploy reads back from the live
// site (a deploy that did not take turns main red).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import config from '../vite.config.js';

const c = config({ mode: 'production' });

test('the build carries its commit and the commit\'s date', () => {
  const commit = JSON.parse(c.define.__COMMIT__), date = JSON.parse(c.define.__COMMIT_DATE__);
  assert.match(commit, /^([0-9a-f]{40}|dev)$/, 'the full hash, or dev without git');
  if (commit !== 'dev') assert.ok(!Number.isNaN(new Date(date).getTime()), `the commit's date: ${date}`);
});

test('the page\'s head gets <meta name="build"> with that commit', () => {
  const meta = c.plugins.flat().find(p => p && p.name === 'endfall-build-meta');
  assert.ok(meta, 'the plugin is in the build');
  const html = meta.transformIndexHtml('<!doctype html><html><head><title>Ebbfall</title></head><body></body></html>');
  const commit = JSON.parse(c.define.__COMMIT__);
  assert.match(html, new RegExp(`<meta name="build" content="${commit}">\\s*</head>`), html);
  assert.equal((html.match(/name="build"/g) || []).length, 1, 'once');
});

const dist = new URL('../dist/index.html', import.meta.url);
test('with dist/ built: its index.html has the meta tag with a hex hash', { skip: !existsSync(dist) && 'dist/ not built' }, () => {
  assert.match(readFileSync(dist, 'utf8'), /<meta name="build" content="([0-9a-f]{40}|dev)">/);
});
