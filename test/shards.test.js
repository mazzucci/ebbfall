// The e2e shards (test/e2e/shards.mjs, ENDFALL_SHARD=i/n): every test in exactly one shard for any n, the same split
// every time, the shards balanced by the measured times, and a test missing from the table placed all the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { loadTimes, plan, assigner, defaultWeight } from './e2e/shards.mjs';

const times = loadTimes();
const tableTests = Object.entries(times).flatMap(([file, t]) => Object.keys(t).map(name => [file, name]));

/** Every shard's tests, as the harness picks them: each file's assigner asked in registration order, once per shard. */
function split(tests, n, table = times) {
  const shards = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const next = new Map();
    for (const [file, name] of tests) {
      if (!next.has(file)) next.set(file, assigner(table, n, file));
      if (next.get(file)(name) === i) shards[i].push(`${file}\t${name}`);
    }
  }
  return shards;
}
const coversOnce = (shards, tests) => {
  const all = shards.flat();
  assert.equal(all.length, tests.length, 'as many picks as tests');
  assert.deepEqual([...all].sort(), tests.map(([f, n]) => `${f}\t${n}`).sort(), 'each test once');
};

test('the table is plain: every e2e file it names exists, every time a positive number of seconds', () => {
  const files = new Set(readdirSync(new URL('./e2e/', import.meta.url)).filter(f => f.endsWith('.e2e.mjs')));
  assert.ok(tableTests.length > 50, 'a table of the suite');
  for (const [file, t] of Object.entries(times)) {
    assert.ok(files.has(file), `${file} is an e2e file`);
    for (const [name, s] of Object.entries(t)) assert.ok(Number.isFinite(s) && s > 0, `${file}: ${name}: ${s}`);
  }
});

test('n = 1 to 6: every test of the table in exactly one shard, and the shards within one long test of each other', () => {
  for (let n = 1; n <= 6; n++) {
    const shards = split(tableTests, n);
    coversOnce(shards, tableTests);
    const { loads } = plan(times, n), longest = Math.max(...tableTests.map(([f, name]) => times[f][name]));
    assert.ok(Math.max(...loads) - Math.min(...loads) <= longest + 1e-9, `n = ${n}: ${loads.map(l => l.toFixed(0)).join(', ')}`);
  }
});

test('the split is deterministic: the same for the same table, whatever order its files and tests were written in', () => {
  const reversed = Object.fromEntries(Object.entries(times).reverse().map(([f, t]) => [f, Object.fromEntries(Object.entries(t).reverse())]));
  for (let n = 1; n <= 6; n++) {
    assert.deepEqual(plan(times, n), plan(times, n));
    assert.deepEqual(plan(reversed, n).shard, plan(times, n).shard, `n = ${n}`);
  }
});

test('equal times go by file, then name: the first into the first shard', () => {
  const table = { 'b.e2e.mjs': { x: 5, a: 5 }, 'a.e2e.mjs': { z: 5 } };
  assert.deepEqual(plan(table, 3).shard, { 'a.e2e.mjs': { z: 0 }, 'b.e2e.mjs': { a: 1, x: 2 } });
});

test('a test missing from the table weighs the median and lands in exactly one shard, the lightest; the others stay', () => {
  const extra = [['gameplay.e2e.mjs', 'a brand-new scenario'], ['gameplay.e2e.mjs', 'another one'], ['new.e2e.mjs', 'a new file\'s test']];
  const tests = [...tableTests, ...extra];
  for (let n = 1; n <= 6; n++) {
    const shards = split(tests, n);
    coversOnce(shards, tests);
    const before = split(tableTests, n);
    shards.forEach((s, i) => assert.deepEqual(s.filter(t => !extra.some(([f, name]) => t === `${f}\t${name}`)), before[i], `n = ${n}: the table's tests where they were`));
  }
  const { loads } = plan(times, 4), next = assigner(times, 4, 'gameplay.e2e.mjs');
  const lightest = loads.indexOf(Math.min(...loads));
  assert.equal(next('a brand-new scenario'), lightest, 'the first new test into the lightest shard');
  const after = loads.map((l, i) => l + (i === lightest ? defaultWeight(times) : 0));
  assert.equal(next('another one'), after.indexOf(Math.min(...after)), 'the next into the lightest with the first counted');
  assert.equal(assigner({}, 3, 'x.e2e.mjs')('t'), 0, 'an empty table: shard 1');
  assert.equal(defaultWeight({ f: { a: 1, b: 9, c: 4 } }), 4, 'the median');
});

test('every e2e test the files register now is in the table or placed by the median; the split covers them all', () => {
  const dir = new URL('./e2e/', import.meta.url);
  const tests = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.e2e.mjs')).sort()) {
    const out = execFileSync(process.execPath, [new URL(file, dir).pathname], { env: { ...process.env, ENDFALL_E2E_LIST: '1', ENDFALL_SHARD: '' }, encoding: 'utf8' });
    for (const line of out.split('\n')) if (line.startsWith('ENDFALL_E2E_TEST ')) tests.push(JSON.parse(line.slice('ENDFALL_E2E_TEST '.length)));
  }
  assert.ok(tests.length > 50, 'the files listed their tests');
  for (const n of [1, 4, 6]) coversOnce(split(tests, n), tests);
});
