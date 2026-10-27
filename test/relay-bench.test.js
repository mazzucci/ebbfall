// The Node relay's HTTP side (relay/server.mjs over relay/bench.js) on a real port: a report POSTed and read back by
// its code, CORS for the page, an oversize body without a length refused as it streams in, a client that gives up
// mid-body (the server lives on), the per-address limit by the socket's address, and anything else is not ours (426).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startRelay } from '../relay/server.mjs';
import { BENCH_MAX, BENCH_IP_PER_MIN } from '../relay/bench.js';

let relay, base;
before(async () => { relay = startRelay({ port: 0 }); await relay.ready; base = `http://127.0.0.1:${relay.port}`; });
after(() => relay.close());

const REPORT = { v: 1, kind: 'ebbfall-bench', summary: { fps: 60 } };
const post = (body, headers = {}) => fetch(`${base}/bench`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...headers } });
/** A POST whose body comes in chunks, with no Content-Length (chunked): `chunks` of `size` bytes, or until `abort`. */
function chunked(chunks, size, { abortAfter = Infinity } = {}) {
  return new Promise((resolve) => {
    const req = request(`${base}/bench`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', 'Transfer-Encoding': 'chunked' } }, (res) => {
      let data = ''; res.on('data', d => { data += d; }); res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', (e) => resolve({ error: e.code }));
    let i = 0;
    const next = () => {
      if (i === abortAfter) { req.destroy(); resolve({ aborted: true }); return; }
      if (i++ >= chunks) { req.end(); return; }
      if (req.write('x'.repeat(size))) setImmediate(next); else req.once('drain', next);
    };
    next();
  });
}

test('the Node relay keeps reports too: POST for a code, GET by it, CORS for the page', async () => {
  const res = await post(JSON.stringify(REPORT));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const { code } = await res.json();
  const got = await (await fetch(`${base}/bench/${code}`)).json();
  assert.deepEqual(got.report, REPORT);
});

test('an oversize body with no length is refused as it comes in; a client that gives up does no harm', async () => {
  const big = await chunked(Math.ceil(2 * BENCH_MAX / 4096), 4096);
  assert.equal(big.status, 413, JSON.stringify(big));
  assert.deepEqual(await chunked(3, 1000, { abortAfter: 2 }), { aborted: true });
  await new Promise(r => setTimeout(r, 50));
  assert.equal((await fetch(`${base}/bench/PERF-BBBBBB`)).status, 404, 'still answering');
});

test('the Node relay limits an address by its socket; other paths are not HTTP', async () => {
  const fresh = startRelay({ port: 0 }); await fresh.ready; // (no reports from this address yet)
  try {
    const statuses = [];
    for (let i = 0; i <= BENCH_IP_PER_MIN; i++) statuses.push((await fetch(`http://127.0.0.1:${fresh.port}/bench`, { method: 'POST', body: JSON.stringify(REPORT), headers: { Origin: 'http://localhost:5173' } })).status);
    assert.deepEqual(statuses, [...Array(BENCH_IP_PER_MIN).fill(201), 429]);
    assert.equal((await fetch(`http://127.0.0.1:${fresh.port}/`)).status, 426);
    assert.equal((await fetch(`http://127.0.0.1:${fresh.port}/elsewhere`, { method: 'POST', body: 'x' })).status, 426);
  } finally { await fresh.close(); }
});
