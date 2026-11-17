// The docs microsite (tools/docs): built into a temporary folder from the copy, the game's data and the committed crops
// and screenshots. Every unit and building of both peoples on its page, in the Build list's order, each figure the
// data's (a cost, a population or grid, what it needs, its description); How to play's figures (the Market's rate, the
// caps, the mines, the coverage) the data's; the crops cut from today's art; every screenshot the copy names made;
// each page's head (title, description, canonical, cards, structured data); images with alt, sizes and lazy loading;
// the sitemap and llms.txt; American English without em dashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pkg = new URL('../src/engine/pkg/data.js', import.meta.url);
const skip = !existsSync(pkg) && 'no WASM built (npm run build:wasm)';
const C = skip ? null : await import('../src/engine/constants.js');
const docs = skip ? null : await import('../tools/docs/build.mjs');
const D = skip ? null : await import('../tools/docs/data.mjs');
const S = skip ? null : await import('../tools/docs/sprites.mjs');
const P = skip ? null : await import('../tools/docs/pages.mjs');

let out = null, pages = null;
const page = (path) => readFileSync(join(out, path, 'index.html'), 'utf8');
if (!skip) { out = mkdtempSync(join(tmpdir(), 'ebbfall-docs-')); pages = docs.buildDocs(out, 'Version abc (last game update def)'); }
test.after(() => out && rmSync(out, { recursive: true, force: true }));

/** Each entry of a people page: { unit, kind, cost, supply, needs, head (its name and chips), role, desc, signal }, in
 *  the page's order. */
function entries(html) {
  const un = (t) => t.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  return [...html.matchAll(/<li class="(bld|unit)" id="(\w+)" data-kind="\w+" data-cost="(\d+)" data-supply="(\d+)"(?: data-needs="([^"]+)")?>/g)].map(m => {
    const [, cls, kind, cost, supply, needs] = m, c = html.indexOf('<div class="chips">', m.index), head = html.slice(m.index, html.indexOf('</div>', c));
    const role = html.match(new RegExp(`<span class="role" data-of="${kind}">([^<]*)</span>`)), desc = html.match(new RegExp(`<p class="desc" data-of="${kind}">([^<]*)</p>`));
    return { unit: cls === 'unit', kind, cost: +cost, supply: +supply, needs: needs || null, head, role: role ? un(role[1]) : '', desc: desc ? un(desc[1]) : '', signal: head.includes('class="sig"') };
  });
}
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('every unit and building of each people is on its page, in its order, each figure the data\'s', { skip }, () => {
  for (const [race, path] of [['humans', '/docs/kingdom/'], ['vael', '/docs/expedition/']]) {
    const f = C.FACTIONS[race], es = entries(page(path));
    // What the game offers, from the sim's own lists (not through the docs' code): the Build list's buildings, each
    // followed by what it trains.
    const want = [...new Set([f.hq, ...f.buildBasic, ...f.buildAdvanced])].flatMap(b => [b, ...(C.BUILDINGS[b].trains || [])]);
    assert.deepEqual(es.map(e => e.kind), want, `${path}: every kind, in order`);
    for (const e of es) {
      const d = e.unit ? C.UNITS[e.kind] : C.BUILDINGS[e.kind];
      assert.equal(e.cost, d.cost[0], `${e.kind}: cost`);
      assert.equal(e.supply, d.supply || 0, `${e.kind}: places`);
      assert.equal(e.needs, d.req ? C.BUILDINGS[d.req].name : null, `${e.kind}: needs`);
      // The chips say the same figures the attributes do.
      assert.match(e.head, new RegExp(`<b>${d.cost[0]}</b>`), `${e.kind}: the cost shown`);
      if (d.supply) assert.match(e.head, new RegExp(`<em>${f.grid ? 'GRID' : 'POP'}</em><b>${e.unit ? '' : '\\+'}${d.supply}</b>`), `${e.kind}: the places shown`);
      if (d.req) assert.match(e.head, new RegExp(`Needs an? ${C.BUILDINGS[d.req].name}<`), `${e.kind}: what it needs, shown`);
      assert.match(e.head, new RegExp(`<h[34]>${d.name}(<i class="sig"|</h)`), `${e.kind}: its name`);
      // Its lines are the game's: the role line and the description, without the "Needs a X." the chip says and the
      // machines' "Needs signal" sentence (their building says it once, the dot marks them); one of the two when it
      // says no more than the other.
      const need = d.req ? ` Needs ${/^[AEIOU]/.test(C.BUILDINGS[d.req].name) ? 'an' : 'a'} ${C.BUILDINGS[d.req].name}.` : '';
      const signal = d.desc.match(/ Needs signal: [^.]*\./)?.[0] || '';
      const full = d.desc.slice(0, d.desc.length - need.length).replace(signal, '');
      assert.ok(e.role || e.desc, `${e.kind}: a line`);
      if (e.role) assert.equal(e.role, d.what, `${e.kind}: the role line`);
      if (e.desc) assert.equal(e.desc, full, `${e.kind}: the description`);
      assert.equal(e.signal, !!signal, `${e.kind}: the signal dot on a machine`);
      const w = (t) => new Set(t.toLowerCase().match(/[a-z0-9]+/g).filter(x => !['a', 'an', 'and', 'the', 'with', 'by', 'its', 'it', 'itself', 'no', 'of', 'to'].includes(x)));
      const inside = (a, b) => [...w(a)].every(x => w(b).has(x));
      if (e.role && e.desc) assert.ok(!inside(e.role, e.desc) && !inside(e.desc, e.role), `${e.kind}: two lines that say different things`);
      if (!e.desc) assert.ok(inside(full, d.what), `${e.kind}: the description left out says no more than the role line`);
      if (!e.role) assert.ok(inside(d.what, full), `${e.kind}: the role line left out says no more than the description`);
      assert.doesNotMatch(e.desc, /Needs an? |Needs signal/, `${e.kind}: the need said once`);
    }
  }
});

test('the machines\' signal said once, on the building that makes them, with a legend for the dot', { skip }, () => {
  const html = page('/docs/expedition/');
  const makers = Object.entries(C.BUILDINGS).filter(([, b]) => (b.trains || []).some(u => C.RADIO.machines.has(u))).map(([k]) => k);
  assert.ok(makers.length >= 2, makers.join());
  for (const k of makers) assert.match(html, new RegExp(`<p class="signal" data-of="${k}"><i class="sig" aria-hidden="true"></i>Its machines need signal: they work only inside`), k);
  assert.equal((html.match(/need signal: they work only inside/g) || []).length, makers.length, 'once for each maker');
  assert.match(html, /<i class="sig" aria-hidden="true"><\/i>needs signal</, 'the legend');
  assert.doesNotMatch(page('/docs/kingdom/'), /class="signal"/, 'none for the Kingdom');
});

test('a kind trained nowhere (the healers) is on no page; nothing on a page is from the other people', { skip }, () => {
  const all = pages.map(p => page(p.path)).join('');
  for (const k of ['medic', 'halo']) assert.ok(!new RegExp(`data-kind="${k}"`).test(all), k);
  for (const [path, other] of [['/docs/kingdom/', 'vael'], ['/docs/expedition/', 'humans']]) {
    const mine = entries(page(path)).map(e => e.kind), f = C.FACTIONS[other];
    const theirs = [f.hq, ...f.buildBasic, ...f.buildAdvanced].flatMap(b => [b, ...(C.BUILDINGS[b].trains || [])]);
    assert.deepEqual(mine.filter(k => theirs.includes(k)), [], path);
  }
});

test('How to play: its figures are the data\'s (the Market\'s rate, the caps, the mines, the coverage)', { skip }, () => {
  const html = page('/docs/how-to-play/');
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  assert.match(html, new RegExp(`Market earns about a gold every ${words[Math.round(1 / C.PUMP_RATE)]} seconds`));
  const K = C.FACTIONS.humans, X = C.FACTIONS.vael;
  assert.ok(html.includes(`the Castle gives ${C.BUILDINGS[K.hq].supply}, each Cottage ${C.BUILDINGS[K.supply].supply}, up to ${C.POP_MAX}`));
  assert.ok(html.includes(`the Data center gives ${C.BUILDINGS[X.hq].supply}, each Substation ${C.BUILDINGS[X.supply].supply}, up to ${C.GRID_MAX}`));
  assert.ok(html.includes(`Up to ${words[C.UNITS[K.worker].mineCap]} Villagers, or ${words[C.UNITS[X.worker].mineCap]} Bots, work a mine at once`));
  assert.ok(html.includes(`Data center (${C.RADIO.sources.conflux} tiles) or an Uplink (${C.RADIO.sources.uplink} tiles)`));
  assert.ok(html.includes(`up to ${words[C.BUILDINGS[X.market].perHq]} per Data center`));
  // The diagrams' figures too.
  assert.ok(html.includes(`${C.UNITS[K.worker].mineCap} Villagers at once`) && html.includes(`${C.UNITS[X.worker].mineCap} Bots at once`), 'the economy diagram');
  assert.ok(html.includes(`Uplink: ${C.RADIO.sources.uplink} tiles`), 'the signal diagram');
});

test('every figure token names a figure, every diagram and screenshot exists (an unknown one fails the build)', { skip }, () => {
  assert.throws(() => P.fill('{{n nope}}', {}), /no figure/);
  assert.throws(() => P.fill('{{nope}}', {}), /unknown token/);
  assert.throws(() => P.fill('{{diagram nope}}', {}), /no diagram/);
  assert.throws(() => P.fill('{{figure shot-desktop-hud | nope=x}}', {}), /no box "nope"/);
  assert.deepEqual(P.copyFiles().sort(), P.PAGES.map(([n]) => n).sort(), 'each copy file is a page');
  const shots = JSON.parse(readFileSync(P.SHOTS, 'utf8'));
  for (const p of P.PAGES) {
    const { body } = P.readCopy(p[0]);
    for (const [, name] of body.matchAll(/\{\{\s*figure\s+([\w-]+)/g)) {
      assert.ok(shots[name], `${p[0]}: shot ${name} made (node tools/docs/shots.mjs)`);
      for (const f of Object.values(shots[name].files)) assert.ok(existsSync(new URL(`../public/docs/img/shots/${f}`, import.meta.url)), f);
    }
  }
  assert.ok(shots.trailer && existsSync(new URL(`../public/docs/media/${shots.trailer.file}`, import.meta.url)), 'the clip');
  const clip = readFileSync(new URL(`../public/docs/media/${shots.trailer.file}`, import.meta.url));
  assert.ok(clip.length < 2 * 1024 * 1024, `the clip is small: ${Math.round(clip.length / 1024)} KB`);
});

test('the annotated shots: each note touching its target, inside the shot, on nothing else, at both sizes', { skip }, () => {
  const shots = JSON.parse(readFileSync(P.SHOTS, 'utf8'));
  for (const name of ['shot-desktop-hud', 'shot-phone-land']) {
    const s = shots[name], keys = Object.keys(s.boxes), aspect = s.w / s.h, at = P.placeNotes(s, keys);
    assert.ok(Array.isArray(s.avoid) && s.avoid.length > 1, `${name}: the shot records what to avoid`);
    for (const z of P.NOTE_SIZES) {
      const W = z.width, H = z.width / aspect;
      at.forEach((p, i) => {
        const [x, y, w, h] = P.noteRect(p, z, aspect), what = `${name} at ${z.width} px: note ${i + 1}`;
        assert.ok(x >= 0 && y >= 0 && x + w <= 1 && y + h <= 1, `${what} inside the shot`);
        const hit = (b) => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1];
        for (const [k, b] of Object.entries(s.boxes)) assert.ok(!hit(b), `${what} clear of ${k}`);
        const holds = (A, B) => A[0] <= B[0] && A[1] <= B[1] && A[0] + A[2] >= B[0] + B[2] && A[1] + A[3] >= B[1] + B[3];
        s.avoid.filter(a => !Object.values(s.boxes).some(b => P.overlaps(a, b) && !holds(a, b))).forEach((b, j) => assert.ok(!hit(b), `${what} clear of obstacle ${j}`));
        const [bx, by, bw, bh] = s.boxes[keys[i]];
        const gapX = Math.max(bx - (x + w), x - (bx + bw), 0) * W, gapY = Math.max(by - (y + h), y - (by + bh), 0) * H;
        assert.ok(Math.hypot(gapX, gapY) <= P.NOTE_GAP_MAX + 0.5, `${what} within ${P.NOTE_GAP_MAX} px of ${keys[i]} (${gapX.toFixed(1)}, ${gapY.toFixed(1)})`);
        at.forEach((q, j) => { if (j !== i) assert.ok(!hit(P.noteRect(q, z, aspect)), `${what} apart from note ${j + 1}`); });
      });
    }
  }
});

test('the home: one media block at the top, the clip with the hero still as its poster, still under reduced motion', { skip }, () => {
  const html = page('/docs/'), main = html.slice(html.indexOf('<main'));
  const shots = JSON.parse(readFileSync(P.SHOTS, 'utf8'));
  assert.equal((main.match(/<video\b/g) || []).length, 1, 'one clip');
  assert.ok(main.indexOf('<video') < main.indexOf('<h2'), 'at the top, before the first section');
  assert.match(main, new RegExp(`<video src="/docs/media/${shots.trailer.file}" poster="/docs/img/shots/${shots['hero-home'].files.desktop}"`), 'the hero still as its poster');
  assert.ok(!main.includes(`src="/docs/img/shots/${shots['hero-home'].files.desktop}"`), 'not the still again beside it');
  assert.match(main, /muted loop playsinline/);
  assert.match(main, /prefers-reduced-motion: reduce\)'\)\.matches\)return/, 'reduced motion: the poster only');
  assert.equal(shots.trailer.file, 'trailer.mp4', 'the file the trailer takes over');
});

test('the crops are cut from today\'s art: each one there, and from the frames it was cut from (else run tools/docs/crops.mjs)', { skip }, () => {
  const made = S.manifest();
  const crops = S.crops();
  for (const k of D.ROSTER.flatMap(r => [...r.buildings, ...r.units])) assert.ok(crops.some(c => c.name === k), `${k}: a crop`);
  for (const c of crops) {
    for (const [file] of Object.values(c.files)) assert.ok(existsSync(new URL(file, S.SPRITE_DIR)), file);
    assert.equal(made[c.name], S.sourceHash(c), `${c.name}: cut from the art as it is now`);
  }
});

test('each page\'s head: its own title and description, canonical, cards; structured data; one h1', { skip }, () => {
  const titles = new Set(), descs = new Set();
  for (const p of pages) {
    const html = page(p.path), url = `https://ebbfall.com${p.path}`;
    const title = unesc(html.match(/<title>([^<]+)<\/title>/)[1]), desc = unesc(html.match(/<meta name="description" content="([^"]+)">/)[1]);
    assert.ok(!titles.has(title) && !descs.has(desc), `${p.path}: its own title and description`); titles.add(title); descs.add(desc);
    assert.ok(desc.length >= 70, `${p.path}: a description`);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${p.path}: canonical`);
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url']) assert.match(html, new RegExp(`<meta property="${tag}" content="[^"]+">`), `${p.path}: ${tag}`);
    for (const tag of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.match(html, new RegExp(`<meta name="${tag}" content="[^"]+">`), `${p.path}: ${tag}`);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${p.path}: one h1`);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(m => JSON.parse(m[1]));
    if (p.path === '/docs/') {
      const g = ld.find(d => d['@type'] === 'VideoGame');
      assert.ok(g, 'the home: VideoGame');
      assert.equal(g.creator.name, 'Stelian Matei');
      assert.equal(g.offers.price, '0'); assert.equal(g.isAccessibleForFree, true); assert.equal(g.gamePlatform, 'Web browser');
    } else {
      const b = ld.find(d => d['@type'] === 'BreadcrumbList');
      assert.ok(b, `${p.path}: breadcrumbs`);
      assert.deepEqual(b.itemListElement.map(i => i.item), ['https://ebbfall.com/docs/', url]);
    }
    // Every page links to every other, and to the game.
    for (const q of pages) assert.ok(html.includes(`href="${q.path}"`), `${p.path} links to ${q.path}`);
    assert.ok(html.includes('href="/"'), `${p.path}: PLAY`);
  }
});

test('images: alt text, width and height, WebP, lazy below the first; a phone gets its own files', { skip }, () => {
  for (const p of pages) {
    const html = page(p.path), imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    assert.ok(imgs.length > 0, p.path);
    imgs.forEach((img, i) => {
      assert.match(img, /\swidth="\d+"/, `${p.path}: width: ${img}`);
      assert.match(img, /\sheight="\d+"/, `${p.path}: height: ${img}`);
      assert.match(img, /\salt="[^"]*"/, `${p.path}: alt: ${img}`);
      assert.match(img, /src="[^"]+\.webp"/, `${p.path}: WebP: ${img}`);
      if (i > 0) assert.match(img, /loading="lazy"/, `${p.path}: lazy: ${img}`);
    });
    // Alt text says something (empty only for a plate beside its own name: the home's tiles).
    for (const img of imgs) if (!img.includes('class="pl hq"') && !img.includes('class="pl fr"')) assert.match(img, /alt="[^"]{3,}"/, `${p.path}: ${img}`);
    for (const pic of html.matchAll(/<picture[^>]*>([\s\S]*?)<\/picture>/g)) assert.match(pic[1], /<source media="\(max-width:640px\)" srcset="[^"]+\.webp"/, `${p.path}: a phone's file`);
  }
});

test('the sitemap lists the game and every page with a date; llms.txt links every page; robots.txt names the sitemap', { skip }, () => {
  const sm = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  assert.deepEqual([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]), ['https://ebbfall.com/', ...pages.map(p => `https://ebbfall.com${p.path}`)]);
  assert.equal((sm.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length, pages.length + 1);
  const llms = readFileSync(join(out, 'llms.txt'), 'utf8');
  assert.match(llms, /^# Ebbfall\n\n> /);
  for (const p of pages) assert.ok(llms.includes(`(https://ebbfall.com${p.path})`), `llms.txt: ${p.path}`);
  for (const n of ['Castle', 'Data center', 'Villager', 'Bot']) assert.ok(llms.includes(n), `llms.txt names the ${n}`);
});

test('the copy: American English, no em dashes, the About page names Stelian, the game\'s version', { skip }, () => {
  for (const p of pages) {
    const html = page(p.path);
    assert.doesNotMatch(html, /\u2014|&mdash;/, `${p.path}: no em dash`);
    for (const w of ['colour', 'armour', 'centre', 'licence', 'favourite', 'grey']) assert.ok(!new RegExp(`\\b${w}`, 'i').test(html.replace(/<style>[\s\S]*?<\/style>/, '')), `${p.path}: ${w}`);
  }
  assert.match(page('/docs/about/'), /Stelian Matei/);
  assert.match(page('/docs/about/'), /Version abc \(last game update def\)/);
  assert.doesNotMatch(page('/docs/'), /Made by/, 'no "Made by" in the footer');
});
