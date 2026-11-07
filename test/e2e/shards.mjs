// The e2e shards (ENDFALL_SHARD=i/n), balanced by measured time: times.json holds each test's seconds on CI (by file,
// then test name; tools/e2e-times.mjs refreshes it from green runs), and every test of the table goes, longest first, into
// the shard with the least time so far (ties: the lowest shard; equal times in file, then name order). A test missing
// from the table (a new one) weighs the table's median and goes, in its file's registration order, into the shard least
// loaded by then (the table's loads and its own file's new tests before it). Every shard of every file computes the same
// split, so each test lands in exactly one shard, the same one every run, and a file run alone runs that shard's part.
// Pure: no node:test, no browser (test/shards.test.js).
import { readFileSync } from 'node:fs';

/** The committed table: { 'file.e2e.mjs': { 'test name': seconds } }. */
export const loadTimes = () => JSON.parse(readFileSync(new URL('./times.json', import.meta.url), 'utf8'));

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // (code units: the same in every locale)
const lightest = (loads) => loads.reduce((best, l, i) => (l < loads[best] ? i : best), 0);

/** The weight of a test the table does not name: the table's median (1 s for an empty table). */
export function defaultWeight(times) {
  const all = Object.values(times).flatMap(t => Object.values(t)).sort((a, b) => a - b);
  return all.length ? all[all.length >> 1] : 1;
}

/** The table's tests over n shards: `shard` maps file -> name -> shard index (from 0); `loads` each shard's seconds. */
export function plan(times, n) {
  const tests = Object.entries(times).flatMap(([file, t]) => Object.entries(t).map(([name, s]) => ({ file, name, s })));
  tests.sort((a, b) => b.s - a.s || cmp(a.file, b.file) || cmp(a.name, b.name));
  const loads = new Array(n).fill(0), shard = {};
  for (const { file, name, s } of tests) {
    const i = lightest(loads);
    loads[i] += s;
    (shard[file] ??= {})[name] = i;
  }
  return { shard, loads };
}

/**
 * The shard of each test of one file, asked in its registration order: `next(name)` gives its shard index (from 0). A
 * test of the table keeps the table's shard; one missing goes into the shard least loaded by then.
 */
export function assigner(times, n, file) {
  const { shard, loads } = plan(times, n);
  const mine = shard[file] || {}, weight = defaultWeight(times);
  return (name) => {
    if (Object.hasOwn(mine, name)) return mine[name];
    const i = lightest(loads);
    loads[i] += weight;
    return i;
  };
}
