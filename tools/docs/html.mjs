// The docs' page shell (tools/docs/build.mjs): the head (title, description, canonical, Open Graph and X tags, the
// structured data), the slim top bar (the wordmark and DOCS, four tabs, PLAY), the footer. Plain HTML
// that reads whole without JavaScript. Nothing inline but the structured data: the site's CSP (site/cache.js) allows no
// <style>, style="" or inline script, so the style is one stylesheet, /docs/docs.css (docs.css, the fonts and each
// page's positions and sizes as classes: `styled`), and the script one file, /docs/docs.js (written by build.mjs).
import { readFileSync } from 'node:fs';

export const ORIGIN = 'https://ebbfall.com';
export const REPO = 'https://github.com/mazzucci/ebbfall';

/** Text for HTML (text and attribute values). */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The top bar's tabs, in order: [path, label]. The docs home is the wordmark's link. */
export const TABS = [['/docs/how-to-play/', 'How to play'], ['/docs/kingdom/', 'The Kingdom'], ['/docs/expedition/', 'The Expedition'], ['/docs/about/', 'About']];
/** A tab's word on a phone, where the four must fit the bar's width. */
const SHORT = { 'The Kingdom': 'Kingdom', 'The Expedition': 'Expedition' };

/** The game's coin and bolt glyphs (src/style.css), for the chips. */
function glyphs() {
  const css = readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');
  const of = (cls) => css.match(new RegExp(`\\.dot\\.${cls}\\{background:([^}]*)\\}`))[1];
  return { coin: of('shard'), bolt: of('bolt') };
}
const g = glyphs();
export const CSS = readFileSync(new URL('./docs.css', import.meta.url), 'utf8')
  .replace('/*COIN*/', g.coin).replace('/*BOLT*/', g.bolt)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '');

/** The self-hosted fonts (dist/docs/fonts/, build.mjs): family, weight, file. */
export const FONTS = [
  ['IBM Plex Sans', 400, 'ibm-plex-sans-400.woff2'], ['IBM Plex Sans', 600, 'ibm-plex-sans-600.woff2'],
  ['Chakra Petch', 600, 'chakra-petch-600.woff2'], ['Chakra Petch', 700, 'chakra-petch-700.woff2'],
  ['Share Tech Mono', 400, 'share-tech-mono-400.woff2'],
];
const fontFaces = FONTS.map(([f, w, file]) => `@font-face{font-family:'${f}';font-style:normal;font-weight:${w};font-display:swap;src:url('/docs/fonts/${file}') format('woff2')}`).join('');

/**
 * An inline style as a class: `class="${styled('width:25%')}"` in place of `style="width:25%"`, which the CSP forbids.
 * Each distinct declaration gets one class (`s0`, `s1`, ... in the order first asked for), its rule in docsCss().
 */
const STYLES = new Map();
export const styled = (decl) => { if (!STYLES.has(decl)) STYLES.set(decl, `s${STYLES.size}`); return STYLES.get(decl); };
/** Forget the classes (build.mjs, before a build's pages). */
export const resetStyles = () => STYLES.clear();
/** The docs' stylesheet, /docs/docs.css: the fonts, docs.css, then every `styled` class the pages asked for. */
export const docsCss = () => fontFaces + CSS + [...STYLES].map(([d, c]) => `.${c}{${d}}`).join('');

/** The share card (og:image) every page uses unless it names its own. */
const OG = { src: '/og.png', w: 1200, h: 630, alt: "Ebbfall: a medieval kingdom's archers and knights against an expedition's bots and drones" };

/**
 * A whole page. `path`: its URL path (/docs/kingdom/); `title`, `description`: its own; `body`: the main column's HTML;
 * `crumb`: its name in the breadcrumbs (none on the docs home); `ld`: extra structured data (the home's VideoGame).
 */
export function layout({ path, title, description, body, crumb = null, ld = [] }) {
  const url = ORIGIN + path;
  const data = [...ld];
  if (crumb) data.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['/docs/', 'Docs'], [path, crumb]].map(([p, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: ORIGIN + p })) });
  const tabs = TABS.map(([p, n]) => `<a href="${p}"${p === path ? ' aria-current="page"' : ''}>${SHORT[n] ? `<span class="l">${n}</span><span class="s">${SHORT[n]}</span>` : n}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0f16">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ebbfall">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}${OG.src}">
<meta property="og:image:width" content="${OG.w}">
<meta property="og:image:height" content="${OG.h}">
<meta property="og:image:alt" content="${esc(OG.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}${OG.src}">
<meta name="twitter:image:alt" content="${esc(OG.alt)}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/docs/fonts/ibm-plex-sans-400.woff2" as="font" type="font/woff2" crossorigin>
${data.map(d => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`).join('\n')}
<link rel="stylesheet" href="/docs/docs.css">
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header class="top"><div class="in"><a class="brand" href="/docs/"${path === '/docs/' ? ' aria-current="page"' : ''}>Ebbfall<small>DOCS</small></a><nav class="tabs" aria-label="Docs">${tabs}</nav><a class="play" href="/">Play</a></div></header>
<main id="main">
${body}
</main>
<footer><div class="in"><span>Ebbfall is free and open source</span><a href="${REPO}">Source on GitHub</a><a href="${REPO}/blob/main/LICENSE">MIT license</a><a class="play" href="/">Play</a></div></footer>
<script src="/docs/docs.js"></script>
</body>
</html>
`;
}
