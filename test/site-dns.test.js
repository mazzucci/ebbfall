// site/dns.mjs on a fake Cloudflare API: the site's hostnames' records read and GitHub Pages' among them picked out
// (never relay.ebbfall.com, mail, TXT or anything else); the summary a rollback reads; the switch (proxy) and its
// rollback (unproxy), one batch of PATCHes of `proxied` on those records only, nothing on a second run; a leftover
// custom domain dropped; a restore that creates each missing record once and goes on past one that fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isPagesRecord, snapshot, summary, restore, setProxied, dropDomains, api } from '../site/dns.mjs';

const PAGES = [
  { id: 'a1', type: 'A', name: 'ebbfall.com', content: '185.199.108.153', proxied: false, ttl: 1 },
  { id: 'a2', type: 'A', name: 'ebbfall.com', content: '185.199.109.153', proxied: false, ttl: 1 },
  { id: 'a3', type: 'A', name: 'ebbfall.com', content: '185.199.110.153', proxied: false, ttl: 1 },
  { id: 'a4', type: 'A', name: 'ebbfall.com', content: '185.199.111.153', proxied: false, ttl: 1 },
  { id: 'q1', type: 'AAAA', name: 'ebbfall.com', content: '2606:50c0:8000::153', proxied: false, ttl: 1 },
  { id: 'q4', type: 'AAAA', name: 'ebbfall.com', content: '2606:50C0:8003::153', proxied: false, ttl: 1 },
  { id: 'w1', type: 'CNAME', name: 'www.ebbfall.com', content: 'mazzucci.github.io', proxied: false, ttl: 1 },
];
const OTHERS = [
  { id: 'r1', type: 'AAAA', name: 'relay.ebbfall.com', content: '100::', proxied: true, ttl: 1 }, // (the relay's custom domain)
  { id: 'r2', type: 'CNAME', name: 'relay.ebbfall.com', content: 'mazzucci.github.io', proxied: false, ttl: 1 }, // (not a site host)
  { id: 'm1', type: 'MX', name: 'ebbfall.com', content: 'mx.example.com', proxied: false, ttl: 1 },
  { id: 't1', type: 'TXT', name: 'ebbfall.com', content: '185.199.108.153', proxied: false, ttl: 1 },
  { id: 't2', type: 'TXT', name: '_github-pages-challenge-mazzucci.ebbfall.com', content: 'abc', proxied: false, ttl: 1 },
  { id: 'o1', type: 'A', name: 'ebbfall.com', content: '192.0.2.1', proxied: true, ttl: 1 }, // (somewhere else: not GitHub's)
  { id: 'o2', type: 'CNAME', name: 'www.ebbfall.com', content: 'github.io.example.com', proxied: false, ttl: 1 },
  { id: 'o3', type: 'A', name: 'other.ebbfall.com', content: '185.199.108.153', proxied: false, ttl: 1 },
];

test("GitHub Pages' records for the apex and www, and nothing else", () => {
  for (const r of PAGES) assert.ok(isPagesRecord(r), `${r.type} ${r.name} ${r.content}`);
  for (const r of OTHERS) assert.ok(!isPagesRecord(r), `${r.type} ${r.name} ${r.content}`);
  assert.ok(isPagesRecord({ type: 'CNAME', name: 'WWW.ebbfall.com.', content: 'Mazzucci.GitHub.io.' }), 'case and a final dot');
});

/** A fake Cloudflare API over `recs` (the zone's records), keeping the calls it was given; `failPost` content fails. */
function cloudflare(recs, { failPost = null, domains = [] } = {}) {
  const calls = [], zone = 'z1';
  let next = 100;
  const fetchFn = async (url, { method, headers, body }) => {
    const u = new URL(url), path = u.pathname.replace('/client/v4', '');
    calls.push(`${method} ${path}${u.search}`);
    assert.equal(headers.Authorization, 'Bearer tok');
    const ok = (result) => new Response(JSON.stringify({ success: true, result }), { status: 200 });
    const no = (status, message) => new Response(JSON.stringify({ success: false, errors: [{ message }] }), { status });
    if (method === 'GET' && path === '/zones') return ok(u.searchParams.get('name') === 'ebbfall.com' ? [{ id: zone }] : []);
    if (method === 'GET' && path === `/zones/${zone}/dns_records`) return ok(recs.filter(r => r.name === u.searchParams.get('name')));
    if (method === 'POST' && path === `/zones/${zone}/dns_records/batch`) {
      const b = JSON.parse(body);
      for (const p of b.patches) { const r = recs.find(x => x.id === p.id); assert.ok(r, p.id); Object.assign(r, p); }
      return ok({ patches: b.patches });
    }
    if (method === 'GET' && path === '/accounts/acc/workers/domains') return ok(domains.filter(d => d.service === u.searchParams.get('service')));
    if (method === 'DELETE' && path.startsWith('/accounts/acc/workers/domains/')) { const id = path.split('/').pop(); domains.splice(domains.findIndex(d => d.id === id), 1); return ok(null); }
    if (method === 'POST') {
      const r = JSON.parse(body);
      if (r.content === failPost) return no(400, 'record rejected');
      recs.push({ id: 'n' + next++, ...r });
      return ok(r);
    }
    return no(400, 'no');
  };
  return { recs, calls, domains, call: api('tok', fetchFn) };
}

test("snapshot reads the two hostnames' records, writes nothing, and picks GitHub's out for a rollback", async () => {
  const cf = cloudflare([...PAGES, ...OTHERS].map(r => ({ ...r })));
  const s = await snapshot(cf.call);
  assert.ok(cf.calls.every(c => c.startsWith('GET ')), cf.calls.join());
  assert.ok(!cf.calls.some(c => c.includes('relay') || c.includes('other.')), 'the other hosts are never even listed');
  assert.equal(cf.recs.length, PAGES.length + OTHERS.length);
  assert.deepEqual(s.pages.map(r => r.content).sort(), PAGES.map(r => r.content).sort());
  assert.ok(s.pages.every(r => !('id' in r)), 'kept without ids: to be created again');
  assert.ok(s.all.some(r => r.type === 'MX'), 'every record of the hosts is in the log');
  const md = summary(s);
  assert.match(md, /\| MX \| ebbfall\.com \| mx\.example\.com \| false \| 1 \| {2}\|/);
  assert.match(md, /\| CNAME \| www\.ebbfall\.com \| mazzucci\.github\.io \| false \| 1 \| yes \|/);
  assert.deepEqual(JSON.parse(md.match(/```json\n([\s\S]*?)```/)[1]), JSON.parse(JSON.stringify(s.pages)));
});

test("proxy: one batch PATCHing only `proxied` on GitHub Pages' records; nothing on a second run; unproxy puts them back", async () => {
  const cf = cloudflare([...PAGES, ...OTHERS].map(r => ({ ...r }))), logged = [];
  const changed = await setProxied(cf.call, true, (l) => logged.push(l));
  assert.equal(changed.length, PAGES.length);
  const writes = cf.calls.filter(c => !c.startsWith('GET '));
  assert.deepEqual(writes, ['POST /zones/z1/dns_records/batch'], 'one batch, no delete, no create');
  for (const r of cf.recs) {
    const before = [...PAGES, ...OTHERS].find(x => x.id === r.id);
    if (PAGES.includes(before)) assert.deepEqual(r, { ...before, proxied: true }, `${r.id}: proxied, nothing else changed`);
    else assert.deepEqual(r, before, `${r.id} untouched`);
  }
  assert.ok(!cf.calls.some(c => c.includes('relay') || c.includes('other.')), 'the other hosts are never even listed');
  assert.ok(logged.some(l => l.startsWith('before A ebbfall.com 185.199.108.153')) && logged.some(l => l.startsWith('after  A ebbfall.com 185.199.108.153 (proxied)')));
  const again = cloudflare(cf.recs);
  assert.deepEqual(await setProxied(again.call, true, () => {}), []);
  assert.ok(again.calls.every(c => c.startsWith('GET ')), 'idempotent: no write');
  const back = cloudflare(cf.recs);
  assert.equal((await setProxied(back.call, false, () => {})).length, PAGES.length);
  for (const r of back.recs) assert.deepEqual(r, [...PAGES, ...OTHERS].find(x => x.id === r.id), `${r.id} as it was`);
});

test('the batch sends only ids and proxied, for those not proxied yet', async () => {
  const recs = [...PAGES, ...OTHERS].map(r => ({ ...r }));
  recs[0].proxied = true; // (one already proxied: by hand, or a run cut short)
  let body;
  const call = api('tok', async (url, o) => {
    if (o.method === 'POST') body = JSON.parse(o.body);
    const u = new URL(url), path = u.pathname.replace('/client/v4', '');
    const result = path === '/zones' ? [{ id: 'z1' }] : o.method === 'GET' ? recs.filter(r => r.name === u.searchParams.get('name')) : {};
    return new Response(JSON.stringify({ success: true, result }), { status: 200 });
  });
  await setProxied(call, true, () => {});
  assert.deepEqual(Object.keys(body), ['patches']);
  assert.deepEqual(body.patches, PAGES.slice(1).map(r => ({ id: r.id, proxied: true })));
});

test("drop-domains deletes only ebbfall-site's custom domains on the two hostnames, and nothing when there are none", async () => {
  const domains = [
    { id: 'd1', hostname: 'ebbfall.com', service: 'ebbfall-site' },
    { id: 'd2', hostname: 'relay.ebbfall.com', service: 'ebbfall-relay' },
    { id: 'd3', hostname: 'relay.ebbfall.com', service: 'ebbfall-site' },
  ];
  const cf = cloudflare([], { domains });
  assert.deepEqual(await dropDomains(cf.call, 'acc', 'ebbfall-site', () => {}), ['ebbfall.com']);
  assert.deepEqual(cf.domains.map(d => d.id), ['d2', 'd3']);
  const none = cloudflare([], { domains: [{ id: 'd2', hostname: 'relay.ebbfall.com', service: 'ebbfall-relay' }] });
  assert.deepEqual(await dropDomains(none.call, 'acc', 'ebbfall-site', () => {}), []);
  assert.ok(none.calls.every(c => c.startsWith('GET ')));
});

test('restore creates the saved records again, only those not there, and goes on past one that fails', async () => {
  const saved = (await snapshot(cloudflare(PAGES.map(r => ({ ...r }))).call)).pages;
  const cf = cloudflare([{ id: 'x', ...saved[0] }, { id: 'w', type: 'AAAA', name: 'ebbfall.com', content: '100::', proxied: true, ttl: 1 }], { failPost: '185.199.110.153' });
  const logged = [];
  assert.equal(await restore(cf.call, saved, (l) => logged.push(l)), 1);
  for (const r of saved) assert.equal(cf.recs.filter(x => x.type === r.type && x.name === r.name && x.content === r.content).length, r.content === '185.199.110.153' ? 0 : 1, r.content);
  assert.equal(cf.calls.filter(c => c.startsWith('POST')).length, saved.length - 1);
  assert.ok(logged.some(l => l.startsWith('FAILED') && l.includes('185.199.110.153') && l.includes('record rejected')));
});

test('an API error says what Cloudflare said', async () => {
  const call = api('tok', async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), { status: 403 }));
  await assert.rejects(snapshot(call), /403.*Authentication error/);
});

test('the CLI: usage without a token or a command; `log` only warns when the reads fail (the deploy goes on)', () => {
  const script = fileURLToPath(new URL('../site/dns.mjs', import.meta.url));
  const run = (args, env) => spawnSync(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(run(['log', 'x.json'], {}).status, 2);
  assert.equal(run(['delete'], { CLOUDFLARE_API_TOKEN: 't' }).status, 2);
  const r = run(['log', '/nonexistent-dir/x.json'], { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_API_BASE: 'http://127.0.0.1:9/client/v4' }); // (nothing listens there)
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /::warning::Could not read the DNS records/);
});
