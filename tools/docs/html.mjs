// The docs' page shell (tools/docs/build.mjs): head (title, description, canonical, Open Graph and X tags, the
// breadcrumbs' JSON-LD), header (the wordmark to /docs/, the sections, PLAY), breadcrumbs, footer; plain HTML that
// works without JavaScript, its style inlined (docs.css, a few KB: one request a page).
import { readFileSync } from 'node:fs';

export const ORIGIN = 'https://ebbfall.com';
export const REPO = 'https://github.com/mazzucci/ebbfall';
const CSS = readFileSync(new URL('./docs.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '');

/** Text for HTML (text and attribute values). */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The header's sections, in order (a future /blog/ goes here too). */
export const NAV = [
  ['/docs/races/', 'Races'], ['/docs/units/', 'Units'], ['/docs/buildings/', 'Buildings'], ['/docs/tech/', 'Tech'],
  ['/docs/how-to-play/', 'How to play'], ['/docs/about/', 'About'],
];

const MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="32" fill="#0b0f16"/><g transform="translate(32 33) scale(0.7) translate(-32 -27)"><path d="M6 30c6-12 12-12 18 0s12 12 18 0 9 8 16 20" fill="none" stroke="#f5a524" stroke-width="7" stroke-linecap="round"/><path d="M15 4l7 9-7 9-7-9z" fill="#4fd1c5"/><path d="M41 10l5 6-5 6-5-6z" fill="#4fd1c5"/></g></svg>';

/** The fonts' @font-face rules, for the game's own files in dist/assets/ (`fonts`: name -> its URL). */
function fontFaces(fonts) {
  const face = (family, weight, file) => (fonts[file] ? `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('${fonts[file]}') format('woff2')}` : '');
  return face('Chakra Petch', 500, 'chakra-petch-500') + face('Chakra Petch', 700, 'chakra-petch-700') + face('Share Tech Mono', 400, 'share-tech-mono-400');
}

/**
 * A whole page. `path`: its URL path (/docs/units/trooper/); `crumbs`: [[path, name], ...] after Docs, the page last;
 * `section`: the header's section it is in; `noindex`: the 404.
 */
export function layout({ path, title, description, body, crumbs = [], section = null, fonts = {}, noindex = false, image = null }) {
  const url = ORIGIN + path, img = image || { src: '/og.png', w: 1200, h: 630, alt: 'Ebbfall, a free browser RTS in the 1998 mold: gold Human soldiers and a walker clash with the pale Vael on a dark battlefield' };
  const trail = [['/docs/', 'Docs'], ...crumbs];
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([p, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: ORIGIN + p })) };
  const crumbHtml = trail.length > 1 ? `<nav class="crumbs" aria-label="Breadcrumb"><ol>${trail.map(([p, n], i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${p}">${esc(n)}</a></li>`)).join('')}</ol></nav>` : '';
  const nav = NAV.map(([p, n]) => `<a href="${p}"${section === p ? ' aria-current="true"' : ''}>${n}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0f16">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ebbfall">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}${img.src}">
<meta property="og:image:width" content="${img.w}">
<meta property="og:image:height" content="${img.h}">
<meta property="og:image:alt" content="${esc(img.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}${img.src}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${fontFaces(fonts)}${CSS}</style>
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/docs/" aria-label="Ebbfall docs">${MARK}EBBFALL</a><nav class="nav" aria-label="Sections">${nav}</nav><a class="btn play" href="/">Play</a></div></header>
<main class="wrap">
${crumbHtml}
${body}
</main>
<footer><div class="wrap"><span>Ebbfall: free and open source (MIT)</span><a href="${REPO}">Source on GitHub</a><a href="/docs/about/">About</a><a href="/">Play</a></div></footer>
</body>
</html>
`;
}
