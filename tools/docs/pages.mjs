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
import { esc, styled, TABS } from './html.mjs';
import { PEOPLES, FIGURES, nameOf, aName, inWords } from './data.mjs';
import { loop, economy, cap, expedition, network, tree, peoples, artStrip, research } from './diagrams.mjs';
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

/** A roster plate's alt text, from the data: the game's name, the kind's, its people and kind, and its role line
 *  ("Ebbfall's Guard, a Kingdom unit: holds the line, cheaply"; test/docs.test.js rebuilds it from the sim's tables). */
export function plateAlt(e, people) {
  const role = e.what ? `: ${e.what[0].toLowerCase()}${e.what.slice(1)}` : '';
  return `Ebbfall's ${e.name}, ${/^[AEIOU]/.test(people.short) ? 'an' : 'a'} ${people.short} ${e.kind}${role}`;
}

/** A crop on its plate: the phone's file on a phone, the desktop's elsewhere (a phone never loads the 2x desktop crop). */
function plate(e, people) {
  const c = cropOf(e.key), [desk, dw] = c.files.desktop, [phone, pw] = c.files.phone;
  const alt = plateAlt(e, people);
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
  const at = placeNotes(s, notes.map(([k]) => k));
  const pos = (a, d, gap) => (d ? `calc(${(a * 100).toFixed(2)}% ${d > 0 ? '+' : '-'} (var(--n) / 2 + ${gap}px))` : `${(a * 100).toFixed(2)}%`);
  const marks = at.map((p, i) => `<span class="note ${styled(`left:${pos(p.ax, p.dx, p.gap)};top:${pos(p.ay, p.dy, p.gap)}`)}" aria-hidden="true">${i + 1}</span>`).join('');
  const load = first ? 'fetchpriority="high"' : 'loading="lazy"';
  const img = `<picture><source media="(max-width:640px)" srcset="${SHOTS_URL}${s.files.phone}" width="${s.phoneW}" height="${s.phoneH}"><img src="${SHOTS_URL}${s.files.desktop}" width="${s.w}" height="${s.h}" alt="${esc(alt)}" ${load} decoding="async"></picture>`;
  return `<figure><div class="shot">${img}${marks}</div>${notes.length ? `<ol class="notes">${notes.map(([, l]) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}<figcaption>${esc(caption)}</figcaption></figure>`;
}

/**
 * The home's hero: the gameplay clip, muted and looped, with its middle frame (`hero-home`) as its poster: the poster
 * first, the clip played only while in view (a phone on a slow line downloads it only then), never under reduced
 * motion (the still alone), the browser's controls where scripts do not run (docs.js plays it). The trailer takes its place later by taking
 * its file's name (public/docs/media/trailer.mp4).
 */
function clip() {
  const t = shots().trailer, poster = shots()[t?.poster];
  if (!t || !poster) throw new Error('docs: no clip or no poster in tools/docs/shots.json (node tools/docs/shots.mjs)');
  return `<figure class="clip"><div class="vid"><span class="tag" aria-hidden="true">▶ Gameplay clip</span><video src="/docs/media/${t.file}" poster="${SHOTS_URL}${poster.files.desktop}" width="${t.w}" height="${t.h}" muted loop playsinline preload="none" controls title="${esc(t.title)}" aria-label="${esc(t.alt)}"></video></div>
<figcaption>${esc(poster.caption)}</figcaption></figure>`;
}

/**
 * The clip's structured data (schema.org VideoObject) for the docs home: its title and words, its poster, its file, the
 * day it was recorded and its length, from tools/docs/shots.json (tools/docs/shots.mjs writes them with the clip).
 */
export function clipLd(origin) {
  const t = shots().trailer, poster = shots()[t.poster];
  return {
    '@context': 'https://schema.org', '@type': 'VideoObject', name: t.title, description: t.alt,
    thumbnailUrl: `${origin}${SHOTS_URL}${poster.files.desktop}`, contentUrl: `${origin}/docs/media/${t.file}`,
    uploadDate: t.uploaded, duration: `PT${t.seconds}S`, width: t.w, height: t.h, isFamilyFriendly: true,
  };
}

/**
 * The numbered notes' sizes, CSS px, and the widths their shot is shown at (style: .shot --n): on a desktop, 22 px on a
 * 1000 px image; on a phone, 18 px on a 358 px one. A note is placed so that it fits both.
 */
export const NOTE_SIZES = [{ n: 22, width: 1000 }, { n: 18, width: 358 }];
/** The farthest a note stands off its target's box, px. */
export const NOTE_GAP_MAX = 12;

/** A note's box, in shares of the shot, for a placement `p` ({ ax, ay, dx, dy, gap }) at size `z` of NOTE_SIZES. */
export function noteRect(p, z, aspect) {
  const W = z.width, H = z.width / aspect, r = z.n / 2 + p.gap;
  const cx = p.ax + (p.dx * r) / W, cy = p.ay + (p.dy * r) / H, hw = z.n / 2 / W, hh = z.n / 2 / H;
  return [cx - hw, cy - hh, 2 * hw, 2 * hh];
}
export const overlaps = ([x, y, w, h], [X, Y, W, H]) => x < X + W && x + w > X && y < Y + H && y + h > Y;

/**
 * Where each note goes: touching its target's box (a point on one of its edges, the note just outside it, `gap` px
 * off), at the nearest spot that lies inside the shot and covers nothing: no annotated box, nothing the shot records to
 * avoid (`s.avoid`: the top bar, the sprites on the map, but those under the HUD's panels), no note placed before it; at both sizes. Returns one placement
 * per key ({ ax, ay, dx, dy, gap }: the edge point, in shares of the shot, the way out of the box, the gap in px).
 */
export function placeNotes(s, keys) {
  const aspect = s.w / s.h, boxes = s.boxes, placed = [];
  // (a sprite under a panel of the HUD is not seen there: what overlaps an annotated box without holding it is dropped;
  // the top bar, which holds the figures it shows, stays)
  const holds = ([X, Y, W, H], [x, y, w, h]) => X <= x && Y <= y && X + W >= x + w && Y + H >= y + h;
  const avoid = (s.avoid || []).filter(a => !Object.values(boxes).some(b => overlaps(a, b) && !holds(a, b)));
  return keys.map((k) => {
    const [x, y, w, h] = boxes[k], c = [];
    for (const f of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      c.push({ ax: x + w * f, ay: y + h, dx: 0, dy: 1 }, { ax: x, ay: y + h * f, dx: -1, dy: 0 }, { ax: x + w, ay: y + h * f, dx: 1, dy: 0 }, { ax: x + w * f, ay: y, dx: 0, dy: -1 });
    }
    for (let gap = 2; gap <= NOTE_GAP_MAX; gap += 1) {
      for (const cand of c) {
        const p = { ...cand, gap };
        const clear = NOTE_SIZES.every(z => {
          const r = noteRect(p, z, aspect);
          return r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 1 && r[1] + r[3] <= 1
            && !Object.values(boxes).some(b => overlaps(r, b)) && !avoid.some(b => overlaps(r, b))
            && !placed.some(q => overlaps(r, noteRect(q, z, aspect)));
        });
        if (clear) { placed.push(p); return p; }
      }
    }
    throw new Error(`docs: no free spot touching "${k}" for its note`);
  });
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
      case 'diagram': { const d = { loop, economy, cap, expedition, network }[args]; if (!d) throw new Error(`docs: no diagram "${args}"`); return d(); }
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
    return { name, path, title: meta.title, description: meta.description, crumb: meta.crumb || (tab && path !== '/docs/' ? tab[1] : null), people: PEOPLES.find(p => p.slug === meta.people) || null, raw: body };
  });
  for (const p of list) p.body = fill(p.raw, { people: p.people, pages: list, version });
  return list;
}
/** The copy files there are (a test checks each is a page). */
export const copyFiles = () => readdirSync(COPY).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5));
