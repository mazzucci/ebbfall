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

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Each entry of a people page: { unit, kind, cost, supply, needs, head (its name and chips), role, desc, signal }, in
 *  the page's order. */
function entries(html) {
  const un = (t) => t.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  return [...html.matchAll(/<li class="(bld|unit)" id="(\w+)" data-kind="\w+" data-cost="(\d+)" data-supply="(\d+)"(?: data-needs="([^"]+)")?>/g)].map(m => {
    const [, cls, kind, cost, supply, needs] = m, c = html.indexOf('<div class="chips">', m.index), head = html.slice(m.index, html.indexOf('</div>', c));
    const alt = un(unesc(head.match(/<img [^>]*alt="([^"]*)"/)[1]));
    const role = html.match(new RegExp(`<span class="role" data-of="${kind}">([^<]*)</span>`)), desc = html.match(new RegExp(`<p class="desc" data-of="${kind}">([^<]*)</p>`));
    return { unit: cls === 'unit', kind, cost: +cost, supply: +supply, needs: needs || null, head, alt, role: role ? un(role[1]) : '', desc: desc ? un(desc[1]) : '', signal: head.includes('class="sig"') };
  });
}

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
      // Its picture's alt text: the game, the kind's name, its people and kind, its role line (all the sim's words).
      const role = d.what ? `: ${d.what[0].toLowerCase()}${d.what.slice(1)}` : '';
      assert.equal(e.alt, `Ebbfall's ${d.name}, ${/^[AEIOU]/.test(f.name) ? 'an' : 'a'} ${f.name} ${e.unit ? 'unit' : 'building'}${role}`, `${e.kind}: the picture's alt text`);
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

test('the home: one media block at the top, the clip with its middle frame as its poster, still under reduced motion', { skip }, () => {
  const html = page('/docs/'), main = html.slice(html.indexOf('<main'));
  const shots = JSON.parse(readFileSync(P.SHOTS, 'utf8'));
  assert.equal((main.match(/<video\b/g) || []).length, 1, 'one clip');
  assert.ok(main.indexOf('<video') < main.indexOf('<h2'), 'at the top, before the first section');
  assert.match(main, new RegExp(`<video src="/docs/media/${shots.trailer.file}" poster="/docs/img/shots/${shots['hero-home'].files.desktop}"`), 'its middle frame as its poster');
  assert.ok(!main.includes(`src="/docs/img/shots/${shots['hero-home'].files.desktop}"`), 'not the still again beside it');
  assert.match(main, /muted loop playsinline/);
  assert.match(main, /prefers-reduced-motion: reduce\)'\)\.matches\)return/, 'reduced motion: the poster only');
  assert.equal(shots.trailer.file, 'trailer.mp4', 'the file the trailer takes over');
  // Its words: a title, a label that says what plays (the game named), the caption under it.
  assert.equal(shots.trailer.title, 'Ebbfall gameplay: Archers against Drones');
  assert.ok(main.includes(`title="${shots.trailer.title}"`), 'the title');
  assert.match(shots.trailer.alt, /^Ebbfall gameplay: .*archers.*drones/i);
  assert.ok(main.includes(`aria-label="${shots.trailer.alt.replace(/"/g, '&quot;')}"`), 'the label');
  assert.ok(main.includes('<figcaption>Archers against Drones. Your side plays in blue.</figcaption>'), 'the caption');
  // Small, and short: about six seconds, within the docs' budget for the home.
  const clip = readFileSync(new URL(`../public/docs/media/${shots.trailer.file}`, import.meta.url));
  assert.ok(clip.length < 300 * 1024, `the clip under 300 KB: ${Math.round(clip.length / 1024)} KB`);
  assert.ok(shots.trailer.seconds >= 4 && shots.trailer.seconds <= 8, `about six seconds: ${shots.trailer.seconds}`);
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
      const g = ld.find(d => [d['@type']].flat().includes('VideoGame'));
      assert.ok(g, 'the home: VideoGame');
      assert.equal(g.author.name, 'Stelian Matei');
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
    // Alt text says something; empty only for a decorative plate beside a label that names it (the home's tiles, a
    // people's tree), and then hidden from screen readers.
    for (const img of imgs) if (img.includes('alt=""')) assert.match(img, /aria-hidden="true"/, `${p.path}: empty alt, decorative: ${img}`); else assert.match(img, /alt="[^"]{3,}"/, `${p.path}: ${img}`);
    // Screenshots name the game.
    for (const img of imgs) if (img.includes('/docs/img/shots/')) assert.match(img, /alt="Ebbfall (gameplay|on a)/, `${p.path}: a screenshot's alt names the game: ${img}`);
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
  assert.match(page('/docs/about/'), /<p class="fine">Made by Stelian Matei · <a href="https:\/\/github\.com\/mazzucci\/ebbfall">source on GitHub<\/a><\/p>/, 'About: one quiet line, the author and the source');
  assert.equal((page('/docs/about/').match(/Stelian Matei/g) || []).length, 1, 'About: named once, in that line (structured data aside)');
  assert.doesNotMatch(page('/docs/about/'), /for fun/, 'About: no "made for fun" segment');
  assert.match(page('/docs/about/'), /Version abc \(last game update def\)/);
  assert.doesNotMatch(page('/docs/'), /Made by/, 'no "Made by" in the footer');
});

// ---- the heads and the structured data, the game's page (index.html) with the docs' ----

/** schema.org, as much of it as the pages use: each type's properties (its own and those it inherits: a VideoGame is a
 *  Thing, a CreativeWork, a SoftwareApplication and a Game; a WebApplication adds browserRequirements), each with a
 *  check of its value. A property a type does not have, or a value of the wrong kind, fails. */
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isBool = (v) => typeof v === 'boolean';
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const node = (...types) => (v) => v && typeof v === 'object' && !Array.isArray(v) && [v['@type']].flat().some(t => types.includes(t));
const oneOrMany = (f) => (v) => (Array.isArray(v) ? v.length > 0 && v.every(f) : f(v));
const THING = { '@id': isUrl, name: isText, description: isText, url: isUrl, image: oneOrMany(isUrl) };
const CREATIVE_WORK = { ...THING, author: oneOrMany(node('Person', 'Organization')), creator: oneOrMany(node('Person', 'Organization')), genre: oneOrMany(isText), inLanguage: isText, isAccessibleForFree: isBool, isFamilyFriendly: isBool, license: isUrl, offers: oneOrMany(node('Offer')), thumbnailUrl: isUrl, uploadDate: isDate };
const SCHEMA = {
  VideoGame: { ...CREATIVE_WORK, applicationCategory: isText, operatingSystem: isText, numberOfPlayers: node('QuantitativeValue'), gamePlatform: oneOrMany(isText),
    playMode: oneOrMany((v) => ['https://schema.org/SinglePlayer', 'https://schema.org/MultiPlayer', 'https://schema.org/CoOp'].includes(v)) },
  WebApplication: { ...CREATIVE_WORK, applicationCategory: isText, operatingSystem: isText, browserRequirements: isText },
  VideoObject: { ...CREATIVE_WORK, contentUrl: isUrl, duration: (v) => /^PT(\d+M)?\d+S$/.test(v), width: isNum, height: isNum },
  Offer: { price: (v) => isNum(v) || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)), priceCurrency: (v) => /^[A-Z]{3}$/.test(v), url: isUrl },
  Person: { name: isText, url: isUrl },
  Organization: { name: isText, url: isUrl },
  QuantitativeValue: { minValue: isNum, maxValue: isNum },
  BreadcrumbList: { itemListElement: (v) => Array.isArray(v) && v.length > 0 && v.every(node('ListItem')) },
  ListItem: { position: (v) => Number.isInteger(v) && v > 0, name: isText, item: isUrl },
};
/** What each type must say (Google's and the brief's: the game's page and the docs home say the same). */
const REQUIRED = {
  VideoGame: ['name', 'description', 'genre', 'gamePlatform', 'playMode', 'offers', 'url', 'image', 'author'],
  VideoObject: ['name', 'description', 'thumbnailUrl', 'contentUrl', 'uploadDate', 'duration'],
  Offer: ['price', 'priceCurrency'], Person: ['name'], QuantitativeValue: [], BreadcrumbList: ['itemListElement'], ListItem: ['position', 'name', 'item'], WebApplication: [], Organization: ['name'],
};
/** The problems with one node of structured data (and those inside it), as strings; [] when it is good. */
function schemaProblems(d, where) {
  const types = [d['@type']].flat(), out = [];
  if (!types.length || !types.every(t => SCHEMA[t])) return [`${where}: unknown @type ${JSON.stringify(d['@type'])}`];
  for (const t of types) for (const k of REQUIRED[t]) if (!(k in d)) out.push(`${where}: ${t} without ${k}`);
  for (const [k, v] of Object.entries(d)) {
    if (k === '@context' || k === '@type') continue;
    const checks = types.map(t => SCHEMA[t][k]).filter(Boolean);
    if (!checks.length) { out.push(`${where}: ${types.join('/')} has no property ${k}`); continue; }
    if (!checks.some(f => f(v))) out.push(`${where}: ${k} of the wrong kind: ${JSON.stringify(v)}`);
    for (const x of [v].flat()) if (x && typeof x === 'object' && x['@type']) out.push(...schemaProblems(x, `${where}.${k}`));
  }
  return out;
}
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const gameHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the schema check itself: it finds a missing field, an unknown property, a wrong kind of value, a bad Offer', () => {
  const good = { '@context': 'https://schema.org', '@type': 'VideoGame', name: 'X', description: 'Y', genre: 'Real-time strategy', gamePlatform: 'Web browser', playMode: ['https://schema.org/SinglePlayer'], offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, url: 'https://x.example/', image: 'https://x.example/i.png', author: { '@type': 'Person', name: 'Z' } };
  assert.deepEqual(schemaProblems(good, 'g'), []);
  const { genre, ...noGenre } = good;
  assert.match(schemaProblems(noGenre, 'g').join(), /without genre/);
  assert.match(schemaProblems({ ...good, gamePlatfrom: 'Web' }, 'g').join(), /no property gamePlatfrom/);
  assert.match(schemaProblems({ ...good, playMode: 'single' }, 'g').join(), /playMode of the wrong kind/);
  assert.match(schemaProblems({ ...good, offers: { '@type': 'Offer', price: 'free', priceCurrency: 'usd' } }, 'g').join(), /price of the wrong kind.*priceCurrency of the wrong kind/);
  assert.match(schemaProblems({ ...good, codeRepository: 'https://x.example/' }, 'g').join(), /no property codeRepository/, 'a SoftwareSourceCode property is not a game\'s');
});

test('structured data: every block on the game\'s page and the docs is schema.org\'s, the game\'s VideoGame the same on both', { skip }, () => {
  const blocks = [['/', ldOf(gameHtml)], ...pages.map(p => [p.path, ldOf(page(p.path))])];
  for (const [path, ld] of blocks) {
    assert.ok(ld.length > 0, `${path}: structured data`);
    for (const d of ld) {
      assert.equal(d['@context'], 'https://schema.org', `${path}: @context`);
      assert.deepEqual(schemaProblems(d, `${path} ${[d['@type']].flat().join('/')}`), []);
    }
  }
  const game = ldOf(gameHtml).find(d => [d['@type']].flat().includes('VideoGame'));
  const docsGame = ldOf(page('/docs/')).find(d => [d['@type']].flat().includes('VideoGame'));
  assert.deepEqual(docsGame, game, 'the docs home repeats the game\'s VideoGame as it is (one source: index.html)');
  assert.match(game.description, /^In 2047, time travel was first attempted\./, 'the premise');
  assert.equal(game.genre, 'Real-time strategy'); assert.equal(game.gamePlatform, 'Web browser');
  assert.deepEqual(game.playMode, ['https://schema.org/SinglePlayer', 'https://schema.org/MultiPlayer']);
  assert.equal(game.offers.price, '0'); assert.equal(game.url, 'https://ebbfall.com/'); assert.equal(game.image, 'https://ebbfall.com/og.png');
  assert.deepEqual(game.author, { '@type': 'Person', name: 'Stelian Matei' });
  // The clip, on the docs home: its file and poster as served, its length the clip's.
  const shots = JSON.parse(readFileSync(P.SHOTS, 'utf8'));
  const v = ldOf(page('/docs/')).find(d => d['@type'] === 'VideoObject');
  assert.ok(v, 'the docs home: VideoObject');
  assert.equal(v.contentUrl, `https://ebbfall.com/docs/media/${shots.trailer.file}`);
  assert.equal(v.thumbnailUrl, `https://ebbfall.com/docs/img/shots/${shots['hero-home'].files.desktop}`);
  assert.equal(v.duration, `PT${shots.trailer.seconds}S`);
  for (const f of [shots.trailer.file]) assert.ok(existsSync(new URL(`../public/docs/media/${f}`, import.meta.url)), f);
});

test('every page\'s head, the game\'s and the docs\': its own title and description of search-result length, canonical, Open Graph and X cards that agree with them', { skip }, () => {
  const heads = [['/', gameHtml], ...pages.map(p => [p.path, page(p.path)])], titles = new Set(), descs = new Set();
  for (const [path, html] of heads) {
    const head = html.slice(0, html.indexOf('</head>')), url = `https://ebbfall.com${path}`;
    const meta = (k) => { const m = [...head.matchAll(new RegExp(`<meta (?:property|name)="${k}" content="([^"]*)">`, 'g'))]; assert.equal(m.length, 1, `${path}: one ${k}`); return unesc(m[0][1]); };
    const title = unesc(head.match(/<title>([^<]+)<\/title>/)[1]), desc = meta('description');
    assert.ok(!titles.has(title) && !descs.has(desc), `${path}: its own title and description`); titles.add(title); descs.add(desc);
    assert.ok(title.length >= 20 && title.length <= 80, `${path}: a title of search-result length (${title.length}): ${title}`);
    assert.ok(/Ebbfall/.test(title), `${path}: the title names the game`);
    assert.ok(desc.length >= 70 && desc.length <= 160, `${path}: a description of search-result length (${desc.length})`);
    assert.equal((head.match(/<link rel="canonical" href="([^"]+)">/g) || []).length, 1, `${path}: one canonical`);
    assert.ok(head.includes(`<link rel="canonical" href="${url}">`), `${path}: canonical ${url}`);
    assert.equal(meta('og:type'), 'website'); assert.equal(meta('og:site_name'), 'Ebbfall');
    assert.equal(meta('og:title'), title, `${path}: og:title`); assert.equal(meta('og:description'), desc, `${path}: og:description`);
    assert.equal(meta('og:url'), url, `${path}: og:url`); assert.equal(meta('og:image'), 'https://ebbfall.com/og.png', `${path}: og:image`);
    assert.ok(meta('og:image:alt').startsWith('Ebbfall'), `${path}: og:image:alt`);
    assert.equal(meta('twitter:card'), 'summary_large_image'); assert.equal(meta('twitter:title'), title); assert.equal(meta('twitter:description'), desc);
    assert.equal(meta('twitter:image'), meta('og:image')); assert.equal(meta('twitter:image:alt'), meta('og:image:alt'));
  }
});

test('At a glance: a tier per requirement in Build-list order, every building in the tier of what it needs, its units in order, a tag only for a need its chain does not imply', { skip }, () => {
  const tiersOf = {
    '/docs/kingdom/': ['Start', 'After a Barracks', 'After a Blacksmith'],
    '/docs/expedition/': ['Start', 'After a Recruiting post', 'After a Lab', 'After an Uplink'],
  };
  for (const [race, path] of [['humans', '/docs/kingdom/'], ['vael', '/docs/expedition/']]) {
    const f = C.FACTIONS[race], html = page(path), at = html.indexOf('<figure class="dia tree');
    assert.ok(at >= 0, `${path}: the tree`);
    const tree = html.slice(at, html.indexOf('</figure>', at));
    // The tiers as the page shows them, each with its buildings, each with its units: [after, label, [[key, [[unit, tag]]]]]
    const tiers = tree.split('<li class="tier" ').slice(1).map(t => {
      const [, after, label] = t.match(/^data-after="([^"]*)"><p class="tl"><span>([^<]*)<\/span>/);
      const cols = t.split('<li class="tcol" ').slice(1).map(c => [c.match(/^data-g="(\w+)"/)[1],
        [...c.matchAll(/<li data-g="(\w+)">.*?<\/span>(?:<em class="need(?: (imp))?">needs ([^<]+)<\/em>)?<\/li>/g)].map(m => [m[1], m[2] ? 'implied' : m[3] || null])]);
      return [after, label, cols];
    });
    const want = [...new Set([f.hq, ...f.buildBasic, ...f.buildAdvanced])];
    assert.deepEqual(tiers.map(t => t[1]), tiersOf[path], `${path}: the tiers, in order`);
    // One tier per distinct requirement, in the order the Build list first meets them.
    assert.deepEqual(tiers.map(t => t[0]), [...new Set(want.map(k => (C.BUILDINGS[k].req ? C.BUILDINGS[C.BUILDINGS[k].req].name : '')))], `${path}: a tier per requirement, in Build-list order`);
    assert.deepEqual(tiers.flatMap(t => t[2].map(c => c[0])).sort(), [...want].sort(), `${path}: every building, once`);
    const standing = [''];
    for (const [after, label, cols] of tiers) {
      assert.ok(standing.includes(after), `${path}: the tier "${after}" comes after the one its requirement stands in`);
      assert.equal(label, after ? `After ${/^[AEIOU]/.test(after) ? 'an' : 'a'} ${after}` : 'Start', `${path}: the tier's label`);
      for (const [k, units] of cols) {
        const d = C.BUILDINGS[k];
        assert.equal(after, d.req ? C.BUILDINGS[d.req].name : '', `${k}: in the tier of what it needs`);
        standing.push(d.name);
        assert.deepEqual(units.map(u => u[0]), d.trains || [], `${k}: its units, in order`);
        if (!(d.trains || []).length) { const c = tree.slice(tree.indexOf(`<li class="tcol" data-g="${k}"`)); assert.ok(c.slice(0, c.indexOf('</li>')).endsWith(`<span class="what">${d.what}</span>`), `${k}: trains nothing, so its role line`); }
        const chain = new Set(); for (let r = d.req; r; r = C.BUILDINGS[r].req) chain.add(C.BUILDINGS[r].name); // what stands before it
        for (const [u, tag] of units) {
          const need = C.UNITS[u].req ? C.BUILDINGS[C.UNITS[u].req].name : null;
          assert.equal(tag, !need ? null : chain.has(need) ? 'implied' : need, `${u}: its tag`);
        }
      }
    }
  }
  // The tag rule on today's data: the Workshop's (factory) siege engines need the Blacksmith its chain does not imply; the
  // Stables already need it, so the Knight's is implied.
  const k = page('/docs/kingdom/');
  assert.match(k, /<li data-g="knight">(?:(?!<li).)*?<em class="need imp">needs Blacksmith<\/em><\/li>/);
  assert.match(k, /<li class="tcol" data-g="factory"(?:(?!class="tcol").)*?<em class="need">needs Blacksmith<\/em><\/li>/);
});
