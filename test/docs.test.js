// The docs at /docs/ (tools/docs), built into a temporary folder as `npm run build` builds them: a page for every unit
// and building of both races, every internal link resolving (to a page, a file of the build or the game), the
// sitemap listing exactly the pages, data.json the sim's tables, every page with its title, description, canonical
// and cards, How to play the game's own text, no counter lists and no race's page naming the other race's units or
// buildings, no "AI" (the game says "the computer"), and the in-game links into the docs. Skipped without the WASM
// build (src/engine/pkg/: its data.js holds the tables), as test/engine.test.js is.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const built = existsSync(new URL('../src/engine/pkg/data.js', import.meta.url));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';

let out, list, D, C, P, B;
before(async () => {
  if (skip) return;
  [D, C, P, B] = await Promise.all([import('../tools/docs/data.mjs'), import('../src/engine/constants.js'), import('../tools/docs/pages.mjs'), import('../tools/docs/build.mjs')]);
  out = mkdtempSync(join(tmpdir(), 'endfall-docs-'));
  list = B.buildDocs(out);
});
after(() => { if (out) rmSync(out, { recursive: true, force: true }); });

const ROOT = new URL('../', import.meta.url);
const files = (dir) => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const html = () => files(join(out, 'docs')).filter(f => f.endsWith('.html')).map(f => [relative(out, f), readFileSync(f, 'utf8')]);
/** A page's file for its URL path (/docs/units/trooper/ -> docs/units/trooper/index.html). */
const fileOf = (path) => join(out, path.endsWith('/') ? `${path}index.html` : path);
const main = (h) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

test('a page for every unit and every building of both races, and for each race', { skip }, () => {
  for (const r of D.RACES) {
    assert.ok(existsSync(fileOf(`/docs/races/${r.key}/`)), r.key);
    for (const k of r.units) assert.ok(existsSync(fileOf(`/docs/units/${k}/`)), k);
    for (const k of r.buildings) assert.ok(existsSync(fileOf(`/docs/buildings/${k}/`)), k);
  }
  // Every kind the sim has belongs to a race and so has its page.
  for (const k of Object.keys(C.UNITS)) assert.ok(D.raceOf(k), `unit ${k} in a race`);
  for (const k of Object.keys(C.BUILDINGS)) assert.ok(D.raceOf(k), `building ${k} in a race`);
  for (const k of [...Object.keys(C.UNITS), ...Object.keys(C.BUILDINGS)]) assert.ok(existsSync(join(out, 'docs-img', 'sprites', `${k}.png`)), `${k}'s sprite`);
});

test('every internal link resolves: a docs page (and its #anchor), a file of the build, or the game', { skip }, () => {
  const game = new Set(['/', '/?first', '/selftest.html', '/og.png', '/icon.svg', '/apple-touch-icon.png']);
  for (const p of game) if (p.endsWith('.html') || p.endsWith('.png') || p.endsWith('.svg')) assert.ok(existsSync(new URL(p.slice(1), ROOT)) || existsSync(new URL(`public${p}`, ROOT)), p);
  let n = 0;
  for (const [f, h] of html()) {
    for (const [, href] of h.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      n++;
      const [path, hash] = href.split('#');
      if (game.has(path) || path.startsWith('/assets/')) continue;
      if (path.startsWith('/docs-img/shots/')) { assert.ok(existsSync(new URL(`public${path}`, ROOT)), `${f}: ${href} (committed in public/)`); continue; }
      assert.ok(existsSync(fileOf(path)), `${f}: ${href}`);
      if (hash) assert.match(readFileSync(fileOf(path), 'utf8'), new RegExp(`id="${hash}"`), `${f}: ${href}'s anchor`);
    }
  }
  assert.ok(n > 500, `${n} links`);
});

test('every page: its own title, a description, a canonical, Open Graph and X cards, breadcrumbs\' JSON-LD; no script but that', { skip }, () => {
  const titles = new Set();
  for (const p of list) {
    const h = readFileSync(fileOf(p.path), 'utf8');
    const tag = (k) => h.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]*)">`))?.[1];
    const title = h.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && !titles.has(title), `${p.path}: a title of its own`); titles.add(title);
    assert.ok(tag('description')?.length > 40, `${p.path}: a description`);
    for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:image']) assert.ok(tag(k), `${p.path}: ${k}`);
    if (p.noindex) { assert.match(h, /<meta name="robots" content="noindex">/); continue; }
    assert.equal(h.match(/<link rel="canonical" href="([^"]+)">/)?.[1], `https://ebbfall.com${p.path}`, `${p.path}: canonical`);
    assert.equal(tag('og:url'), `https://ebbfall.com${p.path}`);
    const ld = JSON.parse(h.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(ld['@type'], 'BreadcrumbList');
    assert.equal(ld.itemListElement.at(-1).item, `https://ebbfall.com${p.path}`, `${p.path}: the trail ends here`);
    assert.equal((h.match(/<script\b/g) || []).length, 1, `${p.path}: no script to run`);
    assert.equal((h.match(/<h1>/g) || []).length, 1, `${p.path}: one h1`);
  }
});

test('the sitemap lists the game and exactly the docs pages (not the 404); robots.txt names it', { skip }, () => {
  const locs = [...readFileSync(join(out, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
  const pages = html().map(([f]) => f).filter(f => f.endsWith('index.html')).map(f => `https://ebbfall.com/${f.replace(/index\.html$/, '')}`);
  assert.deepEqual([...locs].sort(), ['https://ebbfall.com/', ...pages].sort());
  assert.match(readFileSync(new URL('public/robots.txt', ROOT), 'utf8'), /^Sitemap: https:\/\/ebbfall\.com\/sitemap\.xml$/m);
});

test('data.json: every unit, building and upgrade with the sim\'s numbers and relations', { skip }, () => {
  const j = JSON.parse(readFileSync(join(out, 'docs', 'data.json'), 'utf8'));
  assert.deepEqual(Object.keys(j.units).sort(), Object.keys(C.UNITS).sort());
  assert.deepEqual(Object.keys(j.buildings).sort(), Object.keys(C.BUILDINGS).sort());
  for (const [k, u] of Object.entries(j.units)) {
    const d = C.UNITS[k];
    assert.deepEqual([u.name, u.cost, u.supply, u.buildTime, u.health, u.shields, u.armor, u.flying, u.requires], [d.name, d.cost, d.supply, d.build, d.hp, d.shields, d.armor, d.air, d.req], k);
    if (!d.worker && d.weapon) assert.deepEqual([u.weapon.damage, u.weapon.damageAir, u.weapon.range], [d.weapon.dmg, d.weapon.dmgAir, d.weapon.range], k);
    for (const b of u.trainedAt) assert.ok(C.BUILDINGS[b].trains.includes(k), `${k} at ${b}`);
    assert.ok(u.trainedAt.length > 0, `${k} is trained somewhere`);
  }
  for (const [k, b] of Object.entries(j.buildings)) {
    const d = C.BUILDINGS[k];
    assert.deepEqual([b.name, b.cost, b.buildTime, b.health, b.shields, b.armor, b.supply, b.trains, b.researches, b.requires], [d.name, d.cost, d.build, d.hp, d.shields, d.armor, d.supply, d.trains || [], d.researches || [], d.req], k);
    for (const u of b.unlocks.units) assert.equal(C.UNITS[u].req, k);
  }
  const researched = new Set(Object.values(C.BUILDINGS).flatMap(b => b.researches || []));
  assert.deepEqual(Object.keys(j.upgrades).sort(), [...researched].sort(), 'every upgrade a building researches (and none that no building does)');
  for (const [k, u] of Object.entries(j.upgrades)) assert.deepEqual([u.name, u.levels, u.cost], [C.UPGRADES[k].name, C.UPGRADES[k].levels, C.UPGRADES[k].cost.slice(0, C.UPGRADES[k].levels)], k);
  assert.ok(readFileSync(join(out, 'docs', 'data.json')).length < 64 * 1024, 'small');
});

test('a kind\'s page: its sprite, its stats as the preview card has them, cost, where it is made, what it needs', { skip }, () => {
  const tank = readFileSync(fileOf('/docs/units/siegeTank/'), 'utf8'), t = text(main(tank));
  const d = C.UNITS.siegeTank;
  assert.match(tank, /<img src="\/docs-img\/sprites\/siegeTank\.png"/);
  assert.match(t, new RegExp(`${d.hp} Health .*${d.armor} Armour`));
  assert.match(t, new RegExp(`${d.light.dmg} · ${d.weapon.dmg} deployed Damage`), 'the light gun, then the siege gun deployed');
  assert.match(t, /Hits ground/); assert.match(t, /Splash/);
  assert.doesNotMatch(t, /\b(range|cooldown|speed)\b/i, 'base stats only: no range, rate or speed');
  assert.match(tank, /Trained at<\/dt><dd><a href="\/docs\/buildings\/factory\/">Factory<\/a>/);
  assert.match(tank, /Requires<\/dt><dd><a href="\/docs\/buildings\/forge\/">Foundry<\/a>/);
  const factory = text(main(readFileSync(fileOf('/docs/buildings/factory/'), 'utf8')));
  for (const u of C.BUILDINGS.factory.trains) assert.match(factory, new RegExp(C.UNITS[u].name), `the Factory trains ${u}`);
  const loom = text(main(readFileSync(fileOf('/docs/buildings/loom/'), 'utf8')));
  for (const u of C.BUILDINGS.loom.researches) assert.match(loom, new RegExp(C.UPGRADES[u].name), `the Loom researches ${u}`);
  // The Vael's pages keep a Shields slot; the Humans' have none.
  assert.match(text(main(readFileSync(fileOf('/docs/units/umbra/'), 'utf8'))), /Shields/);
  assert.doesNotMatch(t, /Shields/);
});

test('no counter lists, and no race\'s pages name the other race\'s units or buildings', { skip }, () => {
  for (const r of D.RACES) {
    const theirs = D.RACES.filter(o => o !== r).flatMap(o => [...o.units, ...o.buildings]).map(k => (C.UNITS[k] || C.BUILDINGS[k]).name);
    const techs = r.upgrades.map(u => C.UPGRADES[u].name); // (a tech's own name may hold a word that is a building's)
    const paths = [`/docs/races/${r.key}/`, ...r.units.map(k => `/docs/units/${k}/`), ...r.buildings.map(k => `/docs/buildings/${k}/`)];
    for (const p of paths) {
      const t = techs.reduce((s, n) => s.replaceAll(n, ''), text(main(readFileSync(fileOf(p), 'utf8'))));
      for (const n of theirs) assert.doesNotMatch(t, new RegExp(`\\b${n}s?\\b`), `${p} names ${n}`);
    }
  }
  // The docs' own words never list counters (the game's descriptions, which say what a unit does, are test/engine.test.js's).
  const descs = Object.keys({ ...C.UNITS, ...C.BUILDINGS }).map(k => text(D.descOf(k)).trim());
  for (const [f, h] of html()) {
    const t = descs.reduce((s, d) => s.replaceAll(d, ''), text(main(h)));
    assert.doesNotMatch(t, /\b(strong|weak|good|bad) (against|vs\.?)\b|\bcounter(s|ed|ing)?\b|\bbeats\b/i, `${f}: no counters`);
  }
});

test('the docs say "the computer", never "AI"', { skip }, () => {
  for (const [f, h] of [...html(), ['llms.txt', readFileSync(join(out, 'llms.txt'), 'utf8')], ['data.json', readFileSync(join(out, 'docs', 'data.json'), 'utf8')]]) {
    assert.doesNotMatch(text(h), /\bAI\b/, f);
  }
});

test('How to play is the game\'s own card, word for word; the hand-written pages take their numbers from the game', { skip }, () => {
  const card = P.howToPlayHtml();
  assert.match(card, /^<p>Mine <b/);
  assert.ok(readFileSync(new URL('index.html', ROOT), 'utf8').includes(card));
  assert.ok(readFileSync(fileOf('/docs/how-to-play/'), 'utf8').includes(card));
  assert.throws(() => P.howToPlayHtml('<html></html>'), /How to play card/);
  const home = text(main(readFileSync(fileOf('/docs/'), 'utf8')));
  assert.match(home, new RegExp(C.DIFF.map(d => d.name).slice(0, -1).join(', ') + ' and ' + C.DIFF.at(-1).name));
  assert.match(home, /Up to 8 players/);
  for (const p of ['/docs/', '/docs/about/']) assert.match(readFileSync(fileOf(p), 'utf8'), /href="\/\?first"/, `${p}: the guided first game`);
  assert.doesNotMatch(readFileSync(fileOf('/docs/'), 'utf8'), /\{\{/, 'every placeholder filled');
});

test('/llms.txt: what Ebbfall is, and links to the docs and the data', { skip }, () => {
  const t = readFileSync(join(out, 'llms.txt'), 'utf8');
  assert.match(t, /^# Ebbfall\n\n> /);
  for (const p of ['/docs/', '/docs/how-to-play/', '/docs/tech/', '/docs/data.json', '/docs/units/umbra/']) assert.ok(t.includes(`https://ebbfall.com${p}`), p);
  for (const [, u] of t.matchAll(/\]\(https:\/\/ebbfall\.com(\/[^)]*)\)/g)) assert.ok(existsSync(fileOf(u)), u);
});

test('the game\'s first page links to the docs (About Ebbfall, Docs), in a tab of their own; no About page in the game', () => {
  const page = readFileSync(new URL('index.html', ROOT), 'utf8');
  const foot = page.match(/<p class="foot" id="homeFoot">.*<\/p>/)[0];
  assert.match(foot, /<a id="aboutLink" href="\/docs\/about\/" target="_blank" rel="noopener">About Ebbfall<\/a>/);
  assert.match(foot, /<a id="docsLink" href="\/docs\/" target="_blank" rel="noopener">Docs<\/a>/);
  assert.match(foot, /id="docsOffline" hidden> \(online only\)/);
  assert.doesNotMatch(page, /id="menuAbout"|id="btnAbout"/);
  assert.doesNotMatch(page, /Made by Stelian Matei\. Everything is generated by code/, 'the long text lives on the docs\' About page only');
  assert.match(readFileSync(new URL('tools/docs/pages/about.html', ROOT), 'utf8'), /Made by Stelian Matei\. Everything is generated by code/);
});
