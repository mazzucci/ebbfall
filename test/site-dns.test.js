// site/dns.mjs: GitHub Pages' DNS records cleared for the site Worker's custom domains, on a fake Cloudflare API. Only
// the apex's and www's A/AAAA/CNAME records that point to GitHub are deleted (never relay.ebbfall.com, mail, TXT or
// anything else); a second run deletes nothing; a rollback creates them again, once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPagesRecord, removePages, restore, api } from '../site/dns.mjs';

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

/** A fake Cloudflare API over `recs` (the zone's records), keeping the calls it was given. */
function cloudflare(recs) {
  const calls = [], zone = 'z1';
  let next = 100;
  const fetchFn = async (url, { method, headers, body }) => {
    const u = new URL(url), path = u.pathname.replace('/client/v4', '');
    calls.push(`${method} ${path}${u.search}`);
    assert.equal(headers.Authorization, 'Bearer tok');
    const ok = (result) => new Response(JSON.stringify({ success: true, result }), { status: 200 });
    if (method === 'GET' && path === '/zones') return ok(u.searchParams.get('name') === 'ebbfall.com' ? [{ id: zone }] : []);
    if (method === 'GET' && path === `/zones/${zone}/dns_records`) return ok(recs.filter(r => r.name === u.searchParams.get('name')));
    if (method === 'DELETE') { const id = path.split('/').pop(), i = recs.findIndex(r => r.id === id); assert.ok(i >= 0, id); recs.splice(i, 1); return ok({ id }); }
    if (method === 'POST') { const r = { id: 'n' + next++, ...JSON.parse(body) }; recs.push(r); return ok(r); }
    return new Response(JSON.stringify({ success: false, errors: [{ message: 'no' }] }), { status: 400 });
  };
  return { recs, calls, call: api('tok', fetchFn) };
}

test("removePages deletes only GitHub's records, logs every record of the hosts, and a second run deletes nothing", async () => {
  const cf = cloudflare([...PAGES, ...OTHERS].map(r => ({ ...r }))), logged = [];
  let saved = null;
  const gone = await removePages(cf.call, (l) => logged.push(l), (list) => { saved = list; assert.ok(!cf.calls.some(c => c.startsWith('DELETE')), 'saved before any is deleted'); });
  assert.deepEqual(saved, gone);
  assert.deepEqual(gone.map(r => r.content).sort(), PAGES.map(r => r.content).sort());
  assert.ok(gone.every(r => !('id' in r)), 'saved without ids: to be created again');
  assert.deepEqual(cf.recs.map(r => r.id).sort(), OTHERS.map(r => r.id).sort());
  assert.ok(logged.some(l => l.startsWith('keep') && l.includes('MX ebbfall.com')));
  assert.equal(logged.filter(l => l.startsWith('delete')).length, PAGES.length);
  assert.ok(!cf.calls.some(c => c.includes('relay') || c.includes('other.')), 'the other hosts are never even listed');
  const again = cloudflare(cf.recs);
  assert.deepEqual(await removePages(again.call, () => {}), []);
  assert.ok(!again.calls.some(c => c.startsWith('DELETE')));
});

test('restore creates the saved records again, and only those not there', async () => {
  const cf = cloudflare([...PAGES, ...OTHERS].map(r => ({ ...r })));
  const gone = await removePages(cf.call, () => {});
  cf.recs.push({ id: 'x', ...gone[0] }); // (one put back by hand already)
  await restore(cf.call, gone, () => {});
  for (const r of PAGES) assert.equal(cf.recs.filter(x => x.type === r.type && x.name === r.name && x.content === r.content).length, 1, r.content);
  assert.equal(cf.calls.filter(c => c.startsWith('POST')).length, PAGES.length - 1);
});

test('an API error stops it, with what Cloudflare said', async () => {
  const call = api('tok', async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), { status: 403 }));
  await assert.rejects(removePages(call, () => {}), /403.*Authentication error/);
});
