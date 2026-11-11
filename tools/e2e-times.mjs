// The e2e shards' table (test/e2e/times.json, test/e2e/shards.mjs): each test's seconds, the median over green CI runs.
//   node tools/e2e-times.mjs <run id>...   reads the Chromium e2e jobs' logs of those ci.yml runs (gh, signed in) and
//                                          writes the table: every current test found in them, by file, then name
//   node tools/e2e-times.mjs plan [n]      prints the split over n shards (10 by default, as CI): each shard's tests and seconds
// The tests and their files come from the e2e files themselves (the harness's ENDFALL_E2E_LIST: nothing started), as
// node --test's log names a test but not its file. Find green runs with
// gh run list --branch main --workflow ci.yml --status success.
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTimes, assigner, defaultWeight } from '../test/e2e/shards.mjs';

const dir = fileURLToPath(new URL('../test/e2e/', import.meta.url));
const LISTED = 'ENDFALL_E2E_TEST '; // (the harness's LISTED; not imported: the harness would load the browser launcher)

/** Every e2e test as [file, name], each file in its registration order, the files in node --test's order. */
function listTests() {
  const out = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.e2e.mjs')).sort()) {
    const text = execFileSync(process.execPath, [dir + file], { env: { ...process.env, ENDFALL_E2E_LIST: '1', ENDFALL_SHARD: '' }, encoding: 'utf8' });
    for (const line of text.split('\n')) if (line.startsWith(LISTED)) out.push(JSON.parse(line.slice(LISTED.length)));
  }
  return out;
}

const gh = (path) => execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 << 20 });

/** One job's log: each test's name and seconds (node --test's TAP: `ok 3 - name` then `duration_ms: ...`). */
function durations(log) {
  const found = [];
  let name = null;
  for (const raw of log.split('\n')) {
    const line = raw.replace(/^﻿?\S+Z /, '');
    const ok = line.match(/^(?:not )?ok \d+ - (.*)$/);
    if (ok) {
      name = ok[1].replace(/ # (SKIP|TODO)\b.*$/, '').replace(/\\#/g, '#').replace(/\\\\/g, '\\');
      if (name.endsWith('.e2e.mjs') || / # (SKIP|TODO)\b/.test(ok[1])) name = null; // (a file with no test here; a skipped one)
      continue;
    }
    const d = line.match(/^ {2}duration_ms: ([\d.]+)$/);
    if (d && name) { found.push([name, Number(d[1]) / 1000]); name = null; }
  }
  return found;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function refresh(runs) {
  const seen = new Map(); // name -> seconds, one a run
  for (const run of runs) {
    const jobs = JSON.parse(gh(`repos/{owner}/{repo}/actions/runs/${run}/jobs?per_page=100`)).jobs.filter(j => /^e2e \(\d+\)$/.test(j.name));
    if (!jobs.length) throw new Error(`run ${run} has no e2e jobs`);
    for (const job of jobs) {
      if (job.conclusion !== 'success') console.warn(`run ${run}, ${job.name}: ${job.conclusion}, read all the same`);
      for (const [name, s] of durations(gh(`repos/{owner}/{repo}/actions/jobs/${job.id}/logs`))) seen.set(name, [...(seen.get(name) || []), s]);
    }
  }
  const tests = listTests(), times = {}, files = new Map();
  for (const [file, name] of tests) files.set(name, [...(files.get(name) || []), file]);
  for (const [name, fs] of files) if (fs.length > 1) console.warn(`"${name}" is in ${fs.join(' and ')}: timed in each`);
  let missing = 0;
  for (const [file, name] of tests) {
    const s = seen.get(name);
    if (!s) { missing++; console.warn(`not in these runs (it will weigh the median): ${file}: ${name}`); continue; }
    (times[file] ??= {})[name] = Math.round(median(s) * 10) / 10;
  }
  for (const name of seen.keys()) if (!files.has(name)) console.warn(`in the logs but no longer a test: ${name}`);
  const sorted = Object.fromEntries(Object.keys(times).sort().map(f => [f, Object.fromEntries(Object.keys(times[f]).sort().map(n => [n, times[f][n]]))]));
  writeFileSync(dir + 'times.json', JSON.stringify(sorted, null, 1) + '\n');
  console.log(`test/e2e/times.json: ${tests.length - missing} of ${tests.length} tests timed, from ${runs.length} run(s)`);
}

function show(n) {
  const times = loadTimes(), weight = defaultWeight(times), next = new Map(), shards = Array.from({ length: n }, () => ({ s: 0, tests: [] }));
  for (const [file, name] of listTests()) {
    if (!next.has(file)) next.set(file, assigner(times, n, file));
    const s = times[file]?.[name] ?? weight, i = next.get(file)(name);
    shards[i].s += s;
    shards[i].tests.push(`${String(s.toFixed(1)).padStart(6)} s  ${file}: ${name}${times[file]?.[name] === undefined ? '  (not in the table: the median)' : ''}`);
  }
  shards.forEach((sh, i) => console.log(`\nshard ${i + 1}/${n}: ${sh.tests.length} tests, ${(sh.s / 60).toFixed(1)} min\n${sh.tests.join('\n')}`));
  console.log(`\n${shards.map((sh, i) => `${i + 1}/${n} ${(sh.s / 60).toFixed(1)} min`).join(', ')}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'plan') show(Number(rest[0]) || 10);
else if (cmd && /^\d+$/.test(cmd) && rest.every(r => /^\d+$/.test(r))) refresh([cmd, ...rest]);
else { console.error('usage: node tools/e2e-times.mjs <run id>... | plan [n]'); process.exit(1); }
