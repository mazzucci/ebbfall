// GitHub Pages' DNS records for the site's hostnames, out of the way of the Worker's custom domains (wrangler.toml), and
// back for a rollback (docs/MULTIPLAYER.md, Hosting). Through Cloudflare's API with CLOUDFLARE_API_TOKEN (DNS edit on
// the zone); CI's deploy job runs it before `wrangler deploy`.
//
//   node site/dns.mjs remove-pages <file.json>   delete ebbfall.com's and www.ebbfall.com's A/AAAA/CNAME records that
//                                                point to GitHub Pages; they are written to the file (and to the job
//                                                summary) before the first is deleted. Nothing else is touched (relay.ebbfall.com, MX,
//                                                TXT, ...); with nothing of GitHub's left it deletes nothing.
//   node site/dns.mjs restore <file.json>        create those records again (any already there are left as they are).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ZONE = 'ebbfall.com';
export const HOSTS = ['ebbfall.com', 'www.ebbfall.com'];

// GitHub Pages' addresses (https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).
const PAGES_A = new Set(['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153']);
const PAGES_AAAA = new Set(['2606:50c0:8000::153', '2606:50c0:8001::153', '2606:50c0:8002::153', '2606:50c0:8003::153']);

/** Whether a DNS record (Cloudflare's shape: type, name, content) is one of GitHub Pages' for `hosts`. */
export function isPagesRecord(r, hosts = HOSTS) {
  const name = String(r.name).toLowerCase().replace(/\.$/, ''), content = String(r.content).toLowerCase().replace(/\.$/, '');
  if (!hosts.includes(name)) return false;
  if (r.type === 'A') return PAGES_A.has(content);
  if (r.type === 'AAAA') return PAGES_AAAA.has(content);
  if (r.type === 'CNAME') return content.endsWith('.github.io');
  return false;
}

/** What a record is recreated from. */
export const kept = (r) => ({ type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied, comment: r.comment ?? undefined });

/** Cloudflare's API: `call(method, path, body)` -> result, throwing on an error. */
export function api(token, fetchFn = fetch) {
  return async (method, path, body) => {
    const res = await fetchFn('https://api.cloudflare.com/client/v4' + path, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(j.errors ?? j)}`);
    return j.result;
  };
}

async function zoneId(call) {
  const zones = await call('GET', `/zones?name=${ZONE}`);
  if (!zones?.length) throw new Error(`zone ${ZONE} not found with this token`);
  return zones[0].id;
}

/** The hostnames' records, each host's in full. */
async function records(call, zone) {
  const all = [];
  for (const h of HOSTS) all.push(...await call('GET', `/zones/${zone}/dns_records?name=${h}&per_page=100`));
  return all.filter(r => HOSTS.includes(String(r.name).toLowerCase()));
}

const line = (r) => `${r.type} ${r.name} ${r.content}${r.proxied ? ' (proxied)' : ''}`;

/**
 * Delete GitHub Pages' records; returns them (and logs every record of the hostnames, kept or not). `save` gets them
 * before the first is deleted: a run cut short halfway can still be put back.
 */
export async function removePages(call, log = console.log, save = () => {}) {
  const zone = await zoneId(call), recs = await records(call, zone), gone = recs.filter(r => isPagesRecord(r));
  for (const r of recs) log(`${isPagesRecord(r) ? 'delete' : 'keep  '} ${line(r)}`);
  save(gone.map(kept));
  for (const r of gone) await call('DELETE', `/zones/${zone}/dns_records/${r.id}`);
  return gone.map(kept);
}

/** Create `saved` records again, but those already there. */
export async function restore(call, saved, log = console.log) {
  const zone = await zoneId(call), recs = await records(call, zone);
  for (const r of saved) {
    if (recs.some(x => x.type === r.type && x.name === r.name && x.content === r.content)) { log(`there  ${line(r)}`); continue; }
    await call('POST', `/zones/${zone}/dns_records`, r);
    log(`create ${line(r)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, file] = process.argv.slice(2), token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token || !file || !['remove-pages', 'restore'].includes(cmd)) {
    console.error('usage: CLOUDFLARE_API_TOKEN=... node site/dns.mjs remove-pages|restore <file.json>');
    process.exit(2);
  }
  const call = api(token);
  if (cmd === 'restore') await restore(call, JSON.parse(readFileSync(file, 'utf8')));
  else {
    const gone = await removePages(call, console.log, (list) => {
      writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
      const summary = process.env.GITHUB_STEP_SUMMARY;
      if (!summary || !list.length) return;
      appendFileSync(summary, '### GitHub Pages DNS records deleted\n\nFor a rollback (docs/MULTIPLAYER.md, Hosting): '
        + '`node site/dns.mjs restore records.json` with the JSON below as records.json, or by hand in the dashboard.\n\n'
        + '| type | name | content | proxied | ttl |\n|---|---|---|---|---|\n'
        + list.map(r => `| ${r.type} | ${r.name} | ${r.content} | ${r.proxied} | ${r.ttl} |`).join('\n')
        + '\n\n```json\n' + JSON.stringify(list, null, 2) + '\n```\n');
    });
    console.log(gone.length ? `deleted ${gone.length} GitHub Pages record(s)` : 'no GitHub Pages records left: nothing to delete');
  }
}
