// The docs micro-site at /docs/ (docs/MULTIPLAYER.md, Hosting: "The docs"), built with the game (`npm run build`, the
// Vite plugin `docs()` below) into dist/: dist/docs/**/index.html (tools/docs/pages.mjs), the sprites cut from the
// atlas into dist/docs-img/sprites/ (sprites.mjs), /docs/data.json (data.mjs), /llms.txt and /sitemap.xml. None of it
// is stored for offline play (tools/offline/plugin.mjs WEB_ONLY). `node tools/docs/build.mjs [outDir]` builds it alone,
// into dist/ by default (fonts are then looked up in that dist/assets/).
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, ORIGIN } from './html.mjs';
import { pages } from './pages.mjs';
import { sprites } from './sprites.mjs';
import { RACES, dataJson } from './data.mjs';

/** The game's fonts in a build's assets/ (Vite names them by content): name -> URL (`/assets/chakra-petch-500-xxxx.woff2`). */
function fonts(outDir) {
  const dir = join(outDir, 'assets'), out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const m = f.match(/^([a-z-]+-\d{3})-[\w-]+\.woff2$/);
    if (m) out[m[1]] = `/assets/${f}`;
  }
  return out;
}

/** sitemap.xml for the game's page and every docs page (not the 404). */
export function sitemapXml(list) {
  const locs = ['/', ...list.filter(p => !p.noindex).map(p => p.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map(l => `  <url><loc>${ORIGIN}${l}</loc></url>`).join('\n')}\n</urlset>\n`;
}

/** /llms.txt (llmstxt.org): what Ebbfall is, and links to the docs and the data. */
export function llmsTxt(list) {
  const by = (pre) => list.filter(p => p.path.startsWith(pre) && p.path !== pre && !p.noindex);
  const line = (p) => `- [${p.title.replace(/ · Ebbfall$/, '')}](${ORIGIN}${p.path}): ${p.description}`;
  const page = (path) => list.find(p => p.path === path);
  return `# Ebbfall

> Ebbfall is a free, open-source real-time strategy game in the spirit of the 1998 classics, played in the browser on a phone or a desktop: two races (the Humans and the Vael), against the computer at four levels or with friends online through a room link, no install and no account. Single player works offline once loaded. Play at ${ORIGIN}/

The docs below are generated from the game's own data at every build, so their numbers are the game's. Costs are [shards, ether].

## Docs

${['/docs/', '/docs/how-to-play/', '/docs/races/', '/docs/units/', '/docs/buildings/', '/docs/tech/', '/docs/about/'].map(p => line(page(p))).join('\n')}

## Data

- [Game data (JSON)](${ORIGIN}/docs/data.json): every unit, building and upgrade of both races with base stats (cost, supply, build time, health, shields, armour, weapon, speed) and relations (trained at, researched at, requires, unlocks); its "about" field explains the units.
- [Source code](https://github.com/mazzucci/ebbfall): MIT licence; the game's numbers live in crates/endfall-sim/src/data/.

## Races

${RACES.map(r => line(page(`/docs/races/${r.key}/`))).join('\n')}

## Optional

${[...by('/docs/units/'), ...by('/docs/buildings/')].map(line).join('\n')}
`;
}

/** Build the docs into `outDir` (a built game's dist/). Returns the pages written. */
export function buildDocs(outDir) {
  const art = sprites(RACES.flatMap(r => r.units), RACES.flatMap(r => r.buildings));
  const sizes = Object.fromEntries(Object.entries(art).map(([k, s]) => [k, { w: s.w, h: s.h }]));
  const spriteDir = join(outDir, 'docs-img', 'sprites');
  mkdirSync(spriteDir, { recursive: true });
  for (const [k, s] of Object.entries(art)) writeFileSync(join(spriteDir, `${k}.png`), s.png);
  const list = pages(sizes), font = fonts(outDir);
  for (const p of list) {
    const file = join(outDir, p.path.endsWith('/') ? `${p.path}index.html` : p.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, layout({ ...p, fonts: font }));
  }
  writeFileSync(join(outDir, 'docs', 'data.json'), JSON.stringify(dataJson(), null, 1) + '\n');
  writeFileSync(join(outDir, 'llms.txt'), llmsTxt(list));
  writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml(list));
  return list;
}

/** The Vite plugin: the docs written into the build's output once the game's files are (after them: the fonts). */
export function docs() {
  let outDir = 'dist';
  return {
    name: 'endfall-docs',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    writeBundle: { sequential: true, order: 'post', handler() { buildDocs(outDir); } },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] || fileURLToPath(new URL('../../dist/', import.meta.url));
  console.log(`docs: ${buildDocs(out).length} pages into ${out}`);
}
