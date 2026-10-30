// The site's hostnames' DNS records (ebbfall.com, www.ebbfall.com) and the Worker in front of them (docs/MULTIPLAYER.md,
// Hosting), through Cloudflare's API with CLOUDFLARE_API_TOKEN (DNS edit; Workers Scripts edit for `drop-domains`).
// The Worker answers the hostnames through zone routes (wrangler.toml), which see only proxied traffic: switching the
// site over is turning the proxy on for GitHub Pages' own records, an edit in place (never a delete: the hostnames
// resolve throughout, to GitHub until the edit, to Cloudflare and so the Worker after it); rolling back is turning it
// off. (A custom domain would need the records gone first: Cloudflare refuses one on a hostname with records of its
// own, wrangler's override notwithstanding, code 100117.)
//
//   node site/dns.mjs log <file.json>     (CI, before the deploy) both hostnames' records into the job summary, GitHub
//                                         Pages' among them (A 185.199.108-111.153, AAAA 2606:50c0:8000-8003::153, a
//                                         CNAME to *.github.io) also as JSON, into the file and the summary. Reads
//                                         only; a read that fails is a warning, never a failed deploy.
//   node site/dns.mjs check               the same reads, printed (exits non-zero when they fail: the token's rights).
//   node site/dns.mjs proxy               (CI, after the deploy) GitHub Pages' records proxied, in one batch of PATCHes
//                                         (only `proxied`, only those records: never relay.ebbfall.com or another);
//                                         nothing to do once they are.
//   node site/dns.mjs unproxy             the rollback: the same records DNS-only again, straight to GitHub Pages.
//   node site/dns.mjs drop-domains        Workers custom domains of ebbfall-site on the two hostnames deleted, if any
//                                         (with CLOUDFLARE_ACCOUNT_ID; a failed attempt could leave one; reads only
//                                         when there is none).
//   node site/dns.mjs restore <file.json> create logged records again, each on its own (any already there are left
//                                         as they are; one failing does not stop the others; exits non-zero if any did).
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

/** Cloudflare's API: `call(method, path, body)` -> result, throwing on an error. (`base`: the tests' unreachable one.) */
export function api(token, fetchFn = fetch, base = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4') {
  return async (method, path, body) => {
    const res = await fetchFn(base + path, {
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

/** The hostnames' records, each host's in full, read only. */
async function records(call, zone) {
  const all = [];
  for (const h of HOSTS) all.push(...await call('GET', `/zones/${zone}/dns_records?name=${h}&per_page=100`));
  return all.filter(r => HOSTS.includes(String(r.name).toLowerCase()));
}

/** Every record of the hostnames, and GitHub Pages' among them (as they would be recreated). Reads only. */
export async function snapshot(call) {
  const all = await records(call, await zoneId(call));
  return { all, pages: all.filter(r => isPagesRecord(r)).map(kept) };
}

const line = (r) => `${r.type} ${r.name} ${r.content}${r.proxied ? ' (proxied)' : ''}`;

/** The job summary's section: every record, GitHub's marked, and GitHub's as JSON for `restore`. */
export function summary({ all, pages }) {
  return '### DNS records of ebbfall.com and www.ebbfall.com, before this deploy\n\n'
    + 'For a rollback (docs/MULTIPLAYER.md, Hosting): `node site/dns.mjs unproxy`; should records be missing, '
    + '`node site/dns.mjs restore records.json` with the JSON below as records.json, or by hand in the dashboard.\n\n| type | name | content | proxied | ttl | GitHub Pages |\n|---|---|---|---|---|---|\n'
    + all.map(r => `| ${r.type} | ${r.name} | ${r.content} | ${r.proxied} | ${r.ttl} | ${isPagesRecord(r) ? 'yes' : ''} |`).join('\n')
    + '\n\n```json\n' + JSON.stringify(pages, null, 2) + '\n```\n';
}

/**
 * GitHub Pages' records proxied (`on`) or DNS-only, in one batch (Cloudflare applies it in one transaction: all or none),
 * PATCHing `proxied` only; the records already so are left out, and with none left nothing is sent. Logs each record
 * before and after; returns the records changed.
 */
export async function setProxied(call, on, log = console.log) {
  const zone = await zoneId(call), recs = await records(call, zone);
  const todo = recs.filter(r => isPagesRecord(r) && !!r.proxied !== on);
  for (const r of recs.filter(x => isPagesRecord(x))) log(`before ${line(r)}`);
  if (!todo.length) { log(`nothing to change: GitHub Pages' records are ${on ? 'proxied' : 'DNS-only'} already`); return []; }
  await call('POST', `/zones/${zone}/dns_records/batch`, { patches: todo.map(r => ({ id: r.id, proxied: on })) });
  for (const r of (await records(call, zone)).filter(x => isPagesRecord(x))) log(`after  ${line(r)}`);
  return todo.map(r => ({ ...kept(r), proxied: on }));
}

/** The Worker's custom domains on the hostnames (left by a failed attempt), deleted; returns their hostnames. */
export async function dropDomains(call, account, service = 'ebbfall-site', log = console.log) {
  const found = (await call('GET', `/accounts/${account}/workers/domains?service=${service}`))
    .filter(d => d.service === service && HOSTS.includes(String(d.hostname).toLowerCase()));
  if (!found.length) log(`no custom domains of ${service} on ${HOSTS.join(', ')}`);
  for (const d of found) {
    await call('DELETE', `/accounts/${account}/workers/domains/${d.id}`);
    log(`deleted the custom domain ${d.hostname} (${service})`);
  }
  return found.map(d => d.hostname);
}

/** Create `saved` records again, but those already there, each on its own; returns how many failed. */
export async function restore(call, saved, log = console.log) {
  const zone = await zoneId(call), recs = await records(call, zone);
  let failed = 0;
  for (const r of saved) {
    if (recs.some(x => x.type === r.type && x.name === r.name && x.content === r.content)) { log(`there  ${line(r)}`); continue; }
    try {
      await call('POST', `/zones/${zone}/dns_records`, r);
      log(`create ${line(r)}`);
    } catch (err) {
      failed++;
      log(`FAILED ${line(r)}: ${err.message}`);
    }
  }
  return failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, file] = process.argv.slice(2), token = process.env.CLOUDFLARE_API_TOKEN;
  const COMMANDS = ['log', 'check', 'proxy', 'unproxy', 'drop-domains', 'restore'];
  if (!token || !COMMANDS.includes(cmd) || (['log', 'restore'].includes(cmd) && !file)) {
    console.error(`usage: CLOUDFLARE_API_TOKEN=... node site/dns.mjs log <file.json> | check | proxy | unproxy | drop-domains | restore <file.json>`);
    process.exit(2);
  }
  const call = api(token);
  if (cmd === 'restore') {
    const failed = await restore(call, JSON.parse(readFileSync(file, 'utf8')));
    if (failed) { console.error(`${failed} record(s) not restored`); process.exit(1); }
  } else if (cmd === 'proxy' || cmd === 'unproxy') {
    await setProxied(call, cmd === 'proxy');
  } else if (cmd === 'drop-domains') {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) { console.error('drop-domains needs CLOUDFLARE_ACCOUNT_ID'); process.exit(2); }
    try { await dropDomains(call, process.env.CLOUDFLARE_ACCOUNT_ID); } catch (err) { // (none was ever made: a warning)
      console.log(`::warning::Could not check the Worker's custom domains: ${err.message}`);
    }
  } else if (cmd === 'check') {
    const s = await snapshot(call);
    for (const r of s.all) console.log(`${isPagesRecord(r) ? 'pages ' : 'other '} ${line(r)}`);
  } else {
    try {
      const s = await snapshot(call);
      for (const r of s.all) console.log(`${isPagesRecord(r) ? 'pages ' : 'other '} ${line(r)}`);
      writeFileSync(file, JSON.stringify(s.pages, null, 2) + '\n');
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(s));
    } catch (err) { // (nothing below needs these reads)
      console.log(`::warning::Could not read the DNS records for the rollback log (the token's DNS read right?): ${err.message}`);
    }
  }
}
