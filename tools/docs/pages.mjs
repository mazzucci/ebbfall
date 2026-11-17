// The docs' pages (tools/docs/build.mjs): each page's copy (tools/docs/copy/<page>.html: a comment with its title and
// description, then the main column's HTML) with its tokens filled from the game's data and art. The copy holds words
// only: every figure, name, unit list, screenshot and diagram comes from a token, so a page cannot drift from the game.
//
// Tokens, `{{name args}}`:
//   {{n key}}            a figure from the data (data.mjs FIGURES: popMax, gridMax, marketSeconds, ...)
//   {{name kind}}        a unit's or building's name (trooper -> Guard)
//   {{facts}}            a people page's facts strip (resource, cap, headquarters, workers)
//   {{roster}}           a people page's buildings, each with the units it trains, from the data and the crops
//   {{figure shot | key=label | alt=... | caption=...}}
//                        a screenshot (tools/docs/shots.json, made by tools/docs/shots.mjs) with its caption; each
//                        key=label puts a numbered note on the box the shot recorded under that key (the top bar, the
//                        command card, ...) and says the label in a list under it; alt= and caption= replace the shot's
//   {{w key}}            the same figure in words when ten or less ("four")
//   {{diagram loop|economy|cap|expedition}}   a small picture from the data (diagrams.mjs)
//   {{tree}}             a people page's buildings and units at a glance
//   {{research}}         a people page's research, one line each
//   {{peoples tag | tag}} the home's two tiles, a link to each people (the Kingdom's line, the Expedition's)
//   {{artstrip}}         About's four large sprites
//   {{clip}}             the gameplay clip (public/docs/media/trailer.*: the trailer replaces it by taking its name)
//   {{version}}          the game's version and last update, as the build stamp says them
//   {{flow A > B > C}}   steps in a row with arrows
//   {{pages}}            links to the other pages, with their descriptions
//   {{play}}             the PLAY button
import { readFileSync, readdirSync } from 'node:fs';
import { esc, TABS } from './html.mjs';
import { PEOPLES, FIGURES, nameOf, aName, inWords } from './data.mjs';
import { loop, economy, cap, expedition, tree, peoples, artStrip, research } from './diagrams.mjs';
import { SPRITE_URL, cropOf } from './sprites.mjs';

const COPY = new URL('./copy/', import.meta.url);
export const SHOTS_URL = '/docs/img/shots/';
export const SHOTS = new URL('./shots.json', import.meta.url);
const shots = () => JSON.parse(readFileSync(SHOTS, 'utf8'));

/** The pages, in the sitemap's order: [copy file, path]. */
export const PAGES = [['home', '/docs/'], ['how-to-play', '/docs/how-to-play/'], ['kingdom', '/docs/kingdom/'], ['expedition', '/docs/expedition/'], ['about', '/docs/about/']];

/** A copy file: its head comment's fields (title, description, crumb, people) and the body after it. */
export function readCopy(name) {
  const src = readFileSync(new URL(`${name}.html`, COPY), 'utf8');
  const m = src.match(/^<!--([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`docs: copy/${name}.html starts with no <!-- title: ... --> comment`);
  const meta = Object.fromEntries(m[1].split('\n').map(l => l.match(/^\s*(\w+):\s*(.*\S)\s*$/)).filter(Boolean).map(([, k, v]) => [k, v]));
  for (const k of ['title', 'description']) if (!meta[k]) throw new Error(`docs: copy/${name}.html has no ${k}`);
  return { meta, body: src.slice(m[0].length) };
}

/** A crop on its plate: the phone's file on a phone, the desktop's elsewhere (a phone never loads the 2x desktop crop). */
function plate(e, people) {
  const c = cropOf(e.key), [desk, dw] = c.files.desktop, [phone, pw] = c.files.phone;
  const alt = `The ${e.name}, ${people.short === 'Kingdom' ? 'a Kingdom' : 'an Expedition'} ${e.kind}, in blue`;
  return `<picture class="plate"><source media="(max-width:640px)" srcset="${SPRITE_URL}${phone}" width="${pw}" height="${pw}"><img src="${SPRITE_URL}${desk}" width="${dw}" height="${dw}" alt="${esc(alt)}" loading="lazy" decoding="async"></picture>`;
}

/** An entry's chips: its cost (the people's glyph), its population or grid, what it needs first. */
function chips(e, people) {
  const glyph = people.money === 'gold' ? '<i class="coin" aria-hidden="true"></i>' : '<i class="bolt" aria-hidden="true"></i>';
  const supply = e.supply ? `<span class="chip"><em>${people.cap}</em><b>${e.kind === 'building' ? '+' : ''}${e.supply}</b></span>` : '';
  const needs = e.needs ? `<span class="chip need">Needs ${esc(aName(e.needs))}</span>` : '';
  return `<div class="chips"><span class="cost">${glyph}<b>${e.cost}</b><span class="sr"> ${people.money}</span></span>${supply}${needs}</div>`;
}
const attrs = (e) => `id="${e.key}" data-kind="${e.key}" data-cost="${e.cost}" data-supply="${e.supply}"${e.needs ? ` data-needs="${esc(e.needs)}"` : ''}`;

function roster(people) {
  const role = (e) => (e.role ? `<span class="role" data-of="${e.key}">${esc(e.role)}</span>` : '');
  const desc = (e) => (e.desc ? `<p class="desc" data-of="${e.key}">${esc(e.desc)}</p>` : '');
  const sig = (e) => (e.signal ? '<i class="sig" title="Needs signal" aria-label="needs signal"></i>' : '');
  const unit = (u) => `<li class="unit" ${attrs(u)}>${plate(u, people)}<div class="head"><h4>${esc(u.name)}${sig(u)}</h4>${role(u)}${chips(u, people)}</div>${desc(u)}</li>`;
  const note = (b) => (b.note ? `<p class="signal" data-of="${b.key}"><i class="sig" aria-hidden="true"></i>${esc(b.note)}</p>` : '');
  const bld = (b) => `<li class="bld" ${attrs(b)}>${plate(b, people)}<div class="body"><div class="head"><h3>${esc(b.name)}</h3>${role(b)}${chips(b, people)}</div>${desc(b)}${note(b)}${b.units.length ? `<ul class="units" aria-label="${esc(b.name)} trains">${b.units.map(unit).join('')}</ul>` : ''}</div></li>`;
  const legend = people.buildings.some(b => b.note) ? '<span><i class="sig" aria-hidden="true"></i>needs signal</span>' : '';
  return `<p class="side"><span><i class="blue"></i>Your side plays in blue</span>${legend}</p><ul class="roster">${people.buildings.map(bld).join('\n')}</ul>`;
}

/** A screenshot as a figure (see the tokens above). `first`: the page's first image, loaded at once; others lazily. */
function figure(args, first) {
  const [name, ...rest] = args.split('|').map(s => s.trim());
  const s = shots()[name];
  const opts = Object.fromEntries(rest.map(p => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  if (!s) throw new Error(`docs: no screenshot "${name}" in tools/docs/shots.json (node tools/docs/shots.mjs)`);
  const alt = opts.alt || s.alt, caption = opts.caption || s.caption;
  const notes = Object.entries(opts).filter(([k]) => k !== 'alt' && k !== 'caption');
  for (const [k] of notes) if (!s.boxes?.[k]) throw new Error(`docs: shot ${name} has no box "${k}" (it has ${Object.keys(s.boxes || {}).join(', ')})`);
  const marks = notes.map(([k], i) => { const [x, y, w, h] = s.boxes[k]; return `<span class="note" style="left:${((x + w / 2) * 100).toFixed(1)}%;top:${((y + h / 2) * 100).toFixed(1)}%" aria-hidden="true">${i + 1}</span>`; }).join('');
  const load = first ? 'fetchpriority="high"' : 'loading="lazy"';
  const img = `<picture><source media="(max-width:640px)" srcset="${SHOTS_URL}${s.files.phone}" width="${s.phoneW}" height="${s.phoneH}"><img src="${SHOTS_URL}${s.files.desktop}" width="${s.w}" height="${s.h}" alt="${esc(alt)}" ${load} decoding="async"></picture>`;
  return `<figure><div class="shot">${img}${marks}</div>${notes.length ? `<ol class="notes">${notes.map(([, l]) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}<figcaption>${esc(caption)}</figcaption></figure>`;
}

/** The gameplay clip under the home's hero, where the trailer goes: muted, looped, its poster first; played once it is
 *  in view (a phone on a slow line downloads it only then), with the browser's controls where scripts do not run. */
function clip() {
  const t = shots().trailer;
  if (!t) return '';
  return `<figure class="clip"><div class="vid"><span class="tag" aria-hidden="true">▶ Gameplay clip</span><video src="/docs/media/${t.file}" poster="/docs/media/${t.poster}" width="${t.w}" height="${t.h}" muted loop playsinline preload="none" controls aria-label="${esc(t.alt)}"></video></div>
<script>(function(){var v=document.currentScript.previousElementSibling.querySelector('video');v.controls=false;if(!('IntersectionObserver' in window)){v.play().catch(function(){});return;}new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)v.play().catch(function(){});else v.pause();});}).observe(v);})();</script>
<figcaption>Real play, recorded from the game.</figcaption></figure>`;
}

const flow = (args) => `<ol class="flow" aria-label="${esc(args.replace(/\s*>\s*/g, ', then '))}">${args.split('>').map(s => `<li><span>${esc(s.trim())}</span></li>`).join('')}</ol>`;

/** Fill a page's tokens. `ctx`: { people, pages } */
export function fill(body, ctx) {
  let images = 0; // (the page's first image loads at once, every later one lazily)
  return body.replace(/\{\{\s*(\w+)\s*([^}]*?)\s*\}\}/g, (all, tok, args) => {
    const out = token(all, tok, args);
    images += (out.match(/<img\b/g) || []).length;
    return out;
  });
  function token(all, tok, args) {
    switch (tok) {
      case 'n': case 'w': if (!(args in FIGURES)) throw new Error(`docs: no figure "${args}"`); return tok === 'n' ? String(FIGURES[args]) : inWords(FIGURES[args]);
      case 'diagram': { const d = { loop, economy, cap, expedition }[args]; if (!d) throw new Error(`docs: no diagram "${args}"`); return d(); }
      case 'tree': return tree(ctx.people);
      case 'research': return research(ctx.people);
      case 'peoples': return peoples(args.split('|').map(t => t.trim()));
      case 'artstrip': return artStrip();
      case 'clip': return clip();
      case 'version': return esc(ctx.version || 'Version dev');
      case 'name': { const n = nameOf(args); if (!n) throw new Error(`docs: no kind "${args}"`); return esc(n); }
      case 'facts': return `<ul class="facts">${ctx.people.facts.map(([k, v]) => `<li>${k} <b>${esc(v)}</b></li>`).join('')}</ul>`;
      case 'roster': return roster(ctx.people);
      case 'figure': return figure(args, images === 0);
      case 'flow': return flow(args);
      case 'pages': return `<ul class="cards">${ctx.pages.filter(p => p.path !== '/docs/').map(p => `<li><a href="${p.path}"><b>${esc(p.crumb)}</b><span>${esc(p.description)}</span></a></li>`).join('')}</ul>`;
      case 'play': return '<p class="cta"><a class="play" href="/">Play Ebbfall</a></p>';
      default: throw new Error(`docs: unknown token ${all}`);
    }
  }
}

/** Every page: { name, path, title, description, crumb, body } with its tokens filled. */
export function pages(version = '') {
  const list = PAGES.map(([name, path]) => {
    const { meta, body } = readCopy(name);
    const tab = TABS.find(([p]) => p === path);
    return { name, path, title: meta.title, description: meta.description, crumb: meta.crumb || (tab ? tab[1] : null), people: PEOPLES.find(p => p.slug === meta.people) || null, raw: body };
  });
  for (const p of list) p.body = fill(p.raw, { people: p.people, pages: list, version });
  return list;
}
/** The copy files there are (a test checks each is a page). */
export const copyFiles = () => readdirSync(COPY).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5));
