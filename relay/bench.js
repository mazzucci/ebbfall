// Device test reports (the game's ?bench page, src/client/bench.js): the page POSTs its measurements to /bench and is
// given a code (PERF-XXXXXX) to pass on; GET /bench/<CODE> returns the report. Two halves, both on the Fetch API so the
// Cloudflare Worker (relay/worker.js) and the Node relay (relay/server.mjs) share them: `benchRequest`, the public
// edge (paths, the Origin check, CORS, size, JSON), and `BenchStore`, the reports themselves in a key-value storage
// (a Durable Object's, or a Map in Node). Reports hold measurements and device/browser info only, and expire.

export const BENCH_MAX = 64 * 1024; // bytes of JSON a report may have
export const BENCH_TTL = 7 * 24 * 3600 * 1000; // a report is kept a week
export const BENCH_VERSIONS = [1]; // the report formats taken (src/client/bench.js `v`)
// Limits: an address first (2 a minute, 10 a day, 30 reads a minute), then everyone's (10 a minute, 500 a day: what
// storage can grow by). The addresses' counts live in memory (a restart forgets them: a brake, not a ledger).
export const BENCH_IP_PER_MIN = 2, BENCH_IP_PER_DAY = 10, BENCH_IP_GETS_PER_MIN = 30;
export const BENCH_PER_MIN = 10, BENCH_PER_DAY = 500;
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // (the relay's room codes': no vowels, no look-alikes)
const LETTERS = 6; // 20^6 = 64 million codes for a few thousand reports at most: not guessed
const CODE = new RegExp(`^(?:PERF-)?([${ALPHABET}]{${LETTERS}})$`);
const TRIES = 8;
const DAY = 86400000;
/** The address a request came from, as the edge passes it to the store. */
export const IP_HEADER = 'X-Bench-IP';

const json = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...headers } });
const random = () => crypto.getRandomValues(new Uint32Array(1))[0];
const newCode = () => Array.from({ length: LETTERS }, () => ALPHABET[random() % ALPHABET.length]).join('');
const pad = (t) => String(Math.max(0, Math.floor(t))).padStart(15, '0'); // (index keys sort by time)

/**
 * The public side of /bench, before the store: `origins` (a comma list, or empty: any) may POST; `ip` is the caller's
 * address (the Worker's CF-Connecting-IP, the Node socket's); `store(req)` answers the request the store reads (POST
 * https://bench/ with the report, GET https://bench/?code=XXXXXX, the address in IP_HEADER). Returns null for any other
 * path (not a bench request).
 */
export async function benchRequest(req, { origins, store, ip = '' }) {
  const url = new URL(req.url);
  if (url.pathname !== '/bench' && !url.pathname.startsWith('/bench/')) return null;
  const origin = req.headers.get('Origin');
  const allowed = !!origin && (!origins || origins.split(',').includes(origin));
  const cors = allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  if (req.method === 'OPTIONS') {
    if (!allowed) return new Response('Not from here', { status: 403 });
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }
  if (req.method === 'GET') {
    const m = CODE.exec(url.pathname.slice('/bench/'.length).toUpperCase());
    if (!m) return json({ error: 'No such report' }, 404, cors);
    return withHeaders(await store(new Request(`https://bench/?code=${m[1]}`, { headers: { [IP_HEADER]: ip } })), cors);
  }
  if (req.method !== 'POST' || url.pathname.replace(/\/$/, '') !== '/bench') return json({ error: 'POST /bench or GET /bench/<CODE>' }, 405, cors);
  if (!allowed) return json({ error: 'Not from here' }, 403);
  const text = await readCapped(req, BENCH_MAX);
  if (text === null) return json({ error: 'Too large' }, 413, cors);
  let report;
  try { report = JSON.parse(text); } catch { return json({ error: 'Not JSON' }, 400, cors); }
  if (!report || typeof report !== 'object' || report.kind !== 'ebbfall-bench' || !BENCH_VERSIONS.includes(report.v)) return json({ error: 'Not a report' }, 400, cors);
  return withHeaders(await store(new Request('https://bench/', { method: 'POST', body: text, headers: { [IP_HEADER]: ip } })), cors);
}
/** The body as text, or null past `max` bytes (read no further: a body may claim no length). */
async function readCapped(req, max) {
  if (Number(req.headers.get('Content-Length')) > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0; for (const p of parts) { all.set(p, at); at += p.length; }
  return new TextDecoder().decode(all);
}
/** A response with more headers (a Durable Object's response is read-only). */
function withHeaders(res, headers) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

/**
 * The reports, in `storage` (get, put, delete of one key or a list, list({ prefix, end, limit }) to a Map, as a Durable
 * Object's): `r:<CODE>` the report and when it came, `t:<time>:<CODE>` an index by time for the week's sweep, `day` the
 * day's count. One store takes every report (relay/worker.js: one Durable Object), so its limits are everyone's.
 */
export class BenchStore {
  constructor(storage, now = () => Date.now()) { this.storage = storage; this.now = now; this.recent = []; this.ips = new Map(); }

  async fetch(req) {
    const ip = req.headers.get(IP_HEADER) || '';
    if (req.method === 'POST') return this.post(await req.text(), ip);
    return this.get(new URL(req.url).searchParams.get('code') || '', ip);
  }

  /** An address's counts: posts in the last minute and today, reads in the last minute. An IPv6 address counts by its
   *  /64 (one line's); an address with no report today and no read this minute is forgotten when there are many. */
  address(ip, now) {
    const today = Math.floor(now / DAY), key = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
    if (this.ips.size > 5000) for (const [k, a] of this.ips) if (a.day !== today || (!a.n && !a.gets.some(t => now - t < 60000))) this.ips.delete(k);
    let a = this.ips.get(key);
    if (!a) this.ips.set(key, a = { posts: [], gets: [], day: 0, n: 0 });
    a.posts = a.posts.filter(t => now - t < 60000); a.gets = a.gets.filter(t => now - t < 60000);
    if (a.day !== today) { a.day = today; a.n = 0; }
    return a;
  }

  async post(text, ip = '') {
    const now = this.now(), a = this.address(ip, now);
    if (a.posts.length >= BENCH_IP_PER_MIN) return json({ error: 'Too many reports: try again in a minute' }, 429);
    if (a.n >= BENCH_IP_PER_DAY) return json({ error: 'Too many reports from here today' }, 429);
    this.recent = this.recent.filter(t => now - t < 60000);
    if (this.recent.length >= BENCH_PER_MIN) return json({ error: 'Too many reports: try again in a minute' }, 429);
    this.recent.push(now); a.posts.push(now); a.n++; // (counted before the storage's awaits: two at once cannot both pass)
    const day = Math.floor(now / DAY), count = await this.storage.get('day');
    const n = count?.day === day ? count.n : 0;
    if (n >= BENCH_PER_DAY) return json({ error: 'Too many reports today' }, 429);
    await this.sweep(now);
    let code = '';
    for (let i = 0; i < TRIES && !code; i++) { const c = newCode(); if (!(await this.storage.get('r:' + c))) code = c; }
    if (!code) return json({ error: 'No free code' }, 503);
    await this.storage.put({ ['r:' + code]: { at: now, text }, [`t:${pad(now)}:${code}`]: 1, day: { day, n: n + 1 } });
    return json({ code: 'PERF-' + code }, 201);
  }

  async get(code, ip = '') {
    const a = this.address(ip, this.now());
    if (a.gets.length >= BENCH_IP_GETS_PER_MIN) return json({ error: 'Too many reads: try again in a minute' }, 429);
    a.gets.push(this.now());
    const r = await this.storage.get('r:' + code);
    if (!r || this.now() - r.at >= BENCH_TTL) return json({ error: 'No such report (they are kept a week)' }, 404);
    return json(`{"code":"PERF-${code}","received":"${new Date(r.at).toISOString()}","report":${r.text}}`);
  }

  /** Delete the reports older than a week (a few at a time: every new report sweeps). */
  async sweep(now) {
    const old = await this.storage.list({ prefix: 't:', end: `t:${pad(now - BENCH_TTL + 1)}`, limit: 40 });
    const keys = [...old.keys()];
    if (keys.length) await this.storage.delete([...keys, ...keys.map(k => 'r:' + k.split(':')[2])]);
  }
}

/** A Durable Object's storage API over a Map (the Node relay; tests). */
export function memoryStorage() {
  const m = new Map();
  return {
    map: m,
    async get(k) { return m.get(k); },
    async put(k, v) { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v); },
    async delete(k) { for (const key of [].concat(k)) m.delete(key); },
    async list({ prefix = '', end, limit = Infinity } = {}) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix) && (end === undefined || k < end)).sort().slice(0, limit);
      return new Map(keys.map(k => [k, m.get(k)]));
    },
  };
}
