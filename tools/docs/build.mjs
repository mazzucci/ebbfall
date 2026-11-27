// The docs microsite at /docs/ (PRD "Docs microsite"), built with the game (`npm run build`, the Vite plugin `docs()`)
// into dist/: dist/docs/**/index.html (pages.mjs, from tools/docs/copy/ and the game's data), their stylesheet and script
// (dist/docs/docs.css: html.mjs docsCss; docs.js), the fonts beside them (dist/docs/fonts/: IBM Plex Sans from
// public/docs/fonts/, the game's two from src/fonts/), /sitemap.xml and /llms.txt.
// The crops and screenshots in public/docs/img/ are copied by Vite as they are. None of it is stored for offline play
// (tools/offline/plugin.mjs WEB_ONLY). `node tools/docs/build.mjs [outDir]` builds the pages alone (default dist/).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { layout, ORIGIN, REPO, FONTS, resetStyles, docsCss } from './html.mjs';
import { pages, clipLd, controlsLd, CONTROLS_LOOP, DESKTOP_LOOP } from './pages.mjs';
import { SHOWN } from './data.mjs';

const root = new URL('../../', import.meta.url);

/**
 * The game's structured data (schema.org VideoGame): written once, in index.html's head (the game's own page, where a
 * crawler meets it first), and read from there for the docs home, so the two say the same: the name, the premise as its
 * description, the genre, the browser, single player and multiplayer, free, its author. test/docs.test.js checks both
 * pages' blocks against schema.org's properties.
 */
export function videoGame() {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('docs: index.html has no <script type="application/ld+json"> (the VideoGame the docs home repeats)');
  return JSON.parse(m[1]);
}

/** The date the docs last changed: the newest commit under their inputs (the copy, the data, the art), else today. */
export function lastmod() {
  try {
    const d = execSync('git log -1 --format=%cs -- tools/docs public/docs src/engine/constants.js crates/endfall-sim/src/data', { cwd: fileURLToPath(root), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch { /* no git: today */ }
  return new Date().toISOString().slice(0, 10);
}

/** sitemap.xml: the game's page and every docs page, each with its lastmod. */
export function sitemapXml(list, date) {
  const locs = ['/', ...list.map(p => p.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map(l => `  <url><loc>${ORIGIN}${l}</loc><lastmod>${date}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

/** /llms.txt (llmstxt.org): a short plain-text guide for agents, linking to the pages. */
export function llmsTxt(list) {
  const page = (path) => list.find(p => p.path === path);
  const link = (p) => `- [${p.crumb || 'Field manual'}](${ORIGIN}${p.path}): ${p.description}`;
  const people = (p) => `- ${p.name}: ${p.facts.map(([k, v]) => `${k.toLowerCase()} ${v}`).join('; ')}. Buildings: ${p.buildings.map(b => b.units.length ? `${b.name} (trains ${b.units.map(u => u.name).join(', ')})` : b.name).join(', ')}.`;
  return `# Ebbfall

> Ebbfall is a free, open-source real-time strategy game for the browser, on a phone or a desktop: a medieval kingdom against an expedition from 2047. Play against the computer or with friends online through a room link, with no install and no account. Play at ${ORIGIN}/

## How to play, in brief

Choose a people. Send workers to mine gold, build up your base and its population (or the Expedition's grid), train an army, and destroy the enemy's base before they destroy yours. A side is out when its last building falls, or when it has nothing left to fight with and no gold to train more. The pages below are generated from the game's own data at every build, so their numbers are the game's.

## Docs

${list.map(link).join('\n')}

## The two peoples

${SHOWN.map(people).join('\n')}

## Optional

- [Source code](${REPO}): MIT license.
`;
}

/** Build the docs into `outDir` (a built game's dist/). Returns the pages written. */
export function buildDocs(outDir, version = '') {
  resetStyles();
  const list = pages(version);
  for (const p of list) {
    const dir = join(outDir, p.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), layout({ path: p.path, title: p.title, description: p.description, body: p.body, crumb: p.path === '/docs/' ? null : p.crumb, ld: p.path === '/docs/' ? [videoGame(), clipLd(ORIGIN)] : p.path === '/docs/how-to-play/' ? [controlsLd(ORIGIN, 'controls-loop', CONTROLS_LOOP), controlsLd(ORIGIN, 'desktop-loop', DESKTOP_LOOP)] : [] }));
  }
  writeFileSync(join(outDir, 'docs', 'docs.css'), docsCss()); // (after the pages: their `styled` classes)
  copyFileSync(new URL('docs.js', import.meta.url), join(outDir, 'docs', 'docs.js'));
  const fonts = join(outDir, 'docs', 'fonts');
  mkdirSync(fonts, { recursive: true });
  for (const [, , file] of FONTS) if (!file.startsWith('ibm-')) copyFileSync(new URL(`src/fonts/${file}`, root), join(fonts, file));
  for (const [, , file] of FONTS) if (file.startsWith('ibm-')) copyFileSync(new URL(`public/docs/fonts/${file}`, root), join(fonts, file)); // (Vite copies public/ too; alone, this does)
  writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml(list, lastmod()));
  writeFileSync(join(outDir, 'llms.txt'), llmsTxt(list));
  return list;
}

/** The Vite plugin: the docs written once the game's files are, before the service worker's list is made. */
export function docs() {
  let outDir = 'dist', version = '';
  return {
    name: 'endfall-docs',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
      const def = (k) => { try { return JSON.parse(c.define?.[k] ?? '""'); } catch { return ''; } }; // (vite.config.js)
      const build = def('__SIM_BUILD__') || 'dev', commit = def('__COMMIT__') || 'dev';
      version = `Version ${build} (last game update ${commit === 'dev' ? 'dev' : commit.slice(0, 7)})`;
    },
    writeBundle: { sequential: true, order: 'post', handler() { buildDocs(outDir, version); } },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] || fileURLToPath(new URL('dist/', root));
  console.log(`docs: ${buildDocs(out).length} pages into ${out}`);
}
