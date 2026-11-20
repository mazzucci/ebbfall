// Cloudflare's static assets as site/wrangler.toml configures them, for the tests: which file answers an address
// (html_handling = "auto-trailing-slash"), the headers dist/_headers gives it, and what is left to the Worker (not a
// file). test/site-worker.test.js checks the site's routing on it, and the browser tests' server (test/e2e/harness.mjs)
// serves dist/ through it, so every scenario loads the game as ebbfall.com serves it, with no Worker for a file.

/**
 * How the assets answer a GET or HEAD for `pathname`, over the files of dist/ (`has('/docs/index.html')`: whether that
 * file exists): `{ file }`, served 200; `{ redirect }`, a 307 there (the query kept: the caller adds it); or null, not a
 * file: the Worker's. Cloudflare's table for auto-trailing-slash
 * (developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/): a file foo.html is served at /foo,
 * a folder's index.html at /folder/, every other spelling of either sent there; any other file at its own path. Checked
 * against wrangler 4.156's own asset server (`wrangler dev`), which sends a folder's other spellings straight to the
 * folder's address where the published table goes through /folder first.
 */
export function resolve(pathname, has) {
  const html = (x) => has(`${x}.html`), folder = (x) => has(`${x}/index.html`);
  for (const suffix of ['/index.html', '/index', '.html']) {
    if (!pathname.endsWith(suffix)) continue;
    const x = pathname.slice(0, -suffix.length);
    if (folder(x)) return { redirect: `${x}/` }; // (straight to the folder's address: /docs/kingdom/index.html -> /docs/kingdom/, /index.html -> /)
    if (x && html(x)) return { redirect: x };
  }
  if (pathname.endsWith('/')) {
    if (has(`${pathname}index.html`)) return { file: `${pathname}index.html` };
    const x = pathname.slice(0, -1);
    return x && html(x) ? { redirect: x } : null;
  }
  if (has(pathname)) return { file: pathname };
  if (html(pathname)) return { file: `${pathname}.html` };
  if (folder(pathname)) return { redirect: `${pathname}/` };
  return null;
}

/** A _headers file's rules (Cloudflare's format: a path, `*` for any run of characters, then its headers indented). */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({ path: line.trim(), headers: {} }); continue; }
    const at = line.indexOf(':');
    rules.at(-1).headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return rules;
}

/** The headers `rules` give a request for `pathname` (the request's path, not the file's): every rule that matches,
 *  a header set by two of them joined, as Cloudflare does. */
export function headersFor(rules, pathname) {
  const out = {};
  for (const { path, headers } of rules) {
    const re = new RegExp(`^${path.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    if (!re.test(pathname)) continue;
    for (const [k, v] of Object.entries(headers)) out[k] = k in out ? `${out[k]}, ${v}` : v;
  }
  return out;
}
