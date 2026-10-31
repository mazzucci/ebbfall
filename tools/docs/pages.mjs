// Every page of the docs (tools/docs/build.mjs writes them): the reference pages made from the game's data
// (tools/docs/data.mjs: the races, a page per unit and per building, the tech trees, the lists), the few hand-written
// ones (tools/docs/pages/*.html: the docs home, About), and How to play, taken from the game's own card in index.html
// at build time (one text for both). Each page: { path, title, description, crumbs, section, body }.
import { existsSync, readFileSync } from 'node:fs';
import { esc, REPO } from './html.mjs';
import { statRows } from './stats.mjs';
import { SHOTS, shotFile } from './shots.mjs';
import { MAX_PLAYERS } from '../../src/client/maps.js';
import {
  RACES, UNITS, BUILDINGS, UPGRADES, ABILITIES, DIFF, UNIT_WARP, raceOf, descOf, trainedAt, unlocks, powerCasters, upgradeDesc, unlockOf,
} from './data.mjs';

const ROOT = new URL('../../', import.meta.url);
const SHOT_DIR = new URL('public/docs-img/shots/', ROOT);

/** Where a kind's page is. */
export const unitPath = (k) => `/docs/units/${k}/`;
export const bldgPath = (k) => `/docs/buildings/${k}/`;
export const racePath = (r) => `/docs/races/${r}/`;
const kindPath = (k) => (UNITS[k] ? unitPath(k) : bldgPath(k));
const nameOf = (k) => (UNITS[k] || BUILDINGS[k]).name;
const link = (k) => `<a href="${kindPath(k)}">${esc(nameOf(k))}</a>`;
/** "A, B and C". */
const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n) => (/s$/.test(n) ? n : `${n}s`);

/** A sprite's <img> (`sizes`: tools/docs/sprites.mjs's widths and heights, by kind), at `scale` of its pixels. */
function sprite(sizes, k, scale = 1, lazy = true) {
  const s = sizes[k];
  if (!s) return '';
  return `<img src="/docs-img/sprites/${k}.png" width="${Math.round(s.w * scale)}" height="${Math.round(s.h * scale)}" alt="${esc(`${nameOf(k)}, ${raceOf(k).name} ${UNITS[k] ? 'unit' : 'building'}`)}"${lazy ? ' loading="lazy"' : ''} decoding="async">`;
}
const cost = (c) => `<span class="cost">${c[0] ? `<span><i class="s"></i>${c[0]}<span class="sr-only"> shards</span></span>` : ''}${c[1] ? `<span><i class="e"></i>${c[1]}<span class="sr-only"> ether</span></span>` : ''}${!c[0] && !c[1] ? 'free' : ''}</span>`;
const costText = (c) => [c[0] && `${c[0]} shards`, c[1] && `${c[1]} ether`].filter(Boolean).join(', ') || 'free';

/** A screenshot as a figure (nothing when it has not been captured: tools/docs-shots.mjs). */
export function shot(key, caption = '') {
  const s = SHOTS[key];
  if (!s || !existsSync(new URL(shotFile(key), SHOT_DIR))) return '';
  const scale = s.frame === 'desktop' ? 1 : 1;
  return `<figure class="shot ${s.frame === 'desktop' ? 'desktop' : `phone ${s.frame}`}"><img src="/docs-img/shots/${shotFile(key)}" width="${s.w * scale}" height="${s.h * scale}" alt="${esc(s.alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

/** The two rows of the in-game preview card (tools/docs/stats.mjs), as HTML. */
function stats(k) {
  const rows = statRows(k);
  const chipHtml = (c) => {
    if (c.k === 'tag') return `<span class="tag" title="${esc(c.label)}">${esc(c.text)}</span>`;
    if (c.k === 'targets') return `<span class="sc targets"><small>${esc(c.label)}</small></span>`;
    const name = { hp: 'Health', shields: 'Shields', armor: 'Armour', dmg: c.dim ? 'No weapon' : 'Damage' }[c.k];
    return `<span class="sc ${c.k}${c.dim ? ' dim' : ''}">${c.dim && c.k === 'dmg' ? '' : `<b>${esc(c.text)}</b>`} <small>${name}</small></span>`;
  };
  return `<div class="stats" aria-label="Base stats">${rows.map(r => `<div class="sr">${r.map(chipHtml).join('')}</div>`).join('')}</div>`;
}

/** A grid of kinds, each a card linking to its page. */
function kindGrid(sizes, ks) {
  return `<ul class="grid">${ks.map(k => `<li><a class="card kind" href="${kindPath(k)}"><span class="pic">${sprite(sizes, k)}</span><b>${esc(nameOf(k))}</b>${cost((UNITS[k] || BUILDINGS[k]).cost)}</a></li>`).join('')}</ul>`;
}
const mini = (sizes, k) => `<span class="mini">${sprite(sizes, k, 0.5)}${link(k)}</span>`;

// ---- the races ----

/** A race's mechanics, in a few factual lines, from its faction's flags and tables (crates/endfall-sim/src/data/). */
function raceFacts(r) {
  const f = r.f, B = BUILDINGS, U = UNITS, w = U[f.worker].name, hq = B[f.hq], sup = B[f.supply];
  const facts = [];
  facts.push(`Every base starts from a ${link(f.hq)}: it trains ${plural(w)} and takes their loads. ${plural(w)} mine shards and ether.`);
  facts.push(f.warp
    ? `<b>Warp-in construction.</b> A ${link(f.worker)} plants a building and is free at once; the building then grows by itself.`
    : `<b>Workers build.</b> A ${link(f.worker)} stays with a building until it stands; the work stops while no one builds, and resumes when a ${w} comes back.`);
  facts.push(f.repairs
    ? `<b>Repair.</b> ${plural(w)} repair damaged buildings; a full repair costs a quarter of the building's price.`
    : '<b>No repair.</b> Hull damage never heals by itself; shields come back.');
  facts.push(`<b>Supply.</b> The ${esc(hq.name)} gives ${hq.supply}, every ${link(f.supply)} ${sup.supply} more.`);
  facts.push(`<b>Ether</b> comes from a ${link(f.ether)} on an ether vent; every base has two vents.`);
  const shielded = [...r.units, ...r.buildings].filter(k => (U[k] || B[k]).shields > 0);
  if (shielded.length) facts.push(`<b>Shields.</b> ${shielded.length === r.units.length + r.buildings.length ? 'Every unit and building' : and(shielded.map(link))} has shields over its hull: they take hits first and recharge a few seconds after the last one.`);
  const casters = powerCasters(r), powered = r.buildings.filter(k => B[k].needsPower);
  if (casters.length) {
    facts.push(`<b>Power fields.</b> ${cap(and(casters.map(k => `the ${link(k)} (${B[k].power} tiles)`)))} cast power fields. The ${and(powered.map(link))} must be placed inside one, and stop working outside one: no training, research or firing.`);
  }
  if (f.warp) {
    const factories = r.buildings.filter(k => !B[k].hq && (B[k].trains || []).some(u => !U[u].worker));
    facts.push(`<b>Warp-in units.</b> With the rally point of a ${and(factories.map(link)).replace(/ and /, ' or ')} inside a power field, its new units warp in there (${UNIT_WARP} s).`);
  }
  const healers = r.units.filter(k => U[k].heal > 0);
  if (healers.length) facts.push(`<b>Healing.</b> ${cap(and(healers.map(k => `the ${link(k)} ${U[k].mend ? 'mends shields' : 'heals infantry'}`)))}.`);
  const detectors = [...r.units, ...r.buildings].filter(k => (U[k] || B[k]).detect > 0);
  if (detectors.length) facts.push(`<b>Detection.</b> Cloaked units are seen only near a detector: ${and(detectors.map(link))}.`);
  return `<ul class="list prose">${facts.map(x => `<li>${x}</li>`).join('')}</ul>`;
}

const RACE_INTRO = {
  humans: 'Colonists of steel: Harvesters that build and repair, infantry from the Garrison, vehicles from the Factory, gunships from the Airfield.',
  vael: 'Hovering ceramic constructs of living ether: every unit and building shielded, buildings grown from power fields, units warped in where the field reaches.',
};

function racePage(r, sizes) {
  const shotKey = { humans: 'siege', vael: 'umbra' }[r.key];
  return {
    path: racePath(r.key), section: '/docs/races/', crumbs: [['/docs/races/', 'Races'], [racePath(r.key), r.name]],
    title: `The ${r.name}: units, buildings and how they play · Ebbfall`,
    description: `The ${r.name} in Ebbfall, a free browser RTS: how the race plays, and its ${r.units.length} units and ${r.buildings.length} buildings with costs and stats.`,
    body: `<h1>The ${esc(r.name)}</h1>
<p class="lead">${esc(RACE_INTRO[r.key] || '')}</p>
${shot(shotKey)}
<h2>How they play</h2>
${raceFacts(r)}
<h2 id="units">Units</h2>
${kindGrid(sizes, r.units)}
<h2 id="buildings">Buildings</h2>
${kindGrid(sizes, r.buildings)}
<p>What needs what: <a href="/docs/tech/#${r.key}">the ${esc(r.name)}' tech tree</a>.</p>`,
  };
}

// ---- a unit, a building ----

function unitPage(k, sizes) {
  const d = UNITS[k], r = raceOf(k), at = trainedAt(k);
  const facts = [
    ['Cost', cost(d.cost)], ['Supply', d.supply], ['Build time', `${d.build} s`],
    ['Trained at', and(at.map(link))],
    ['Requires', d.req ? link(d.req) : 'nothing more'],
  ];
  const abilities = (d.abilities || []).map(a => {
    const A = ABILITIES[a], tech = unlockOf(a);
    return `<li><b>${esc(A.name)}</b>: ${esc(A.desc)}${tech ? ` Unlocked by ${esc(UPGRADES[tech].name)} (${and(r.buildings.filter(b => (BUILDINGS[b].researches || []).includes(tech)).map(link))}).` : ''}</li>`;
  });
  const kin = at.flatMap(b => BUILDINGS[b].trains).filter(x => x !== k);
  return {
    path: unitPath(k), section: '/docs/units/', crumbs: [['/docs/units/', 'Units'], [unitPath(k), d.name]],
    title: `${d.name}: ${r.name} unit · Ebbfall`,
    description: `${d.name}, a ${r.name} unit in Ebbfall: ${descOf(k)} Cost ${costText(d.cost)}, supply ${d.supply}.`.slice(0, 300),
    body: `<div class="hero"><span class="pic">${sprite(sizes, k, 1.5, false)}</span><div class="who">
<h1>${esc(d.name)}</h1>
<p><a class="tag" href="${racePath(r.key)}">${esc(r.name)}</a>${d.air ? '<span class="tag">Flying</span>' : ''}${d.capital ? '<span class="tag">Capital</span>' : ''}${d.worker ? '<span class="tag">Worker</span>' : ''}</p>
<p class="lead">${esc(descOf(k))}</p>
${stats(k)}
</div></div>
<dl class="facts">${facts.map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('')}</dl>
${abilities.length ? `<h2>Abilities</h2><ul class="list">${abilities.join('')}</ul>` : ''}
<p class="muted">Base stats, before upgrades.</p>
${kin.length ? `<h2>Also from the ${esc(and(at.map(nameOf)))}</h2><p>${kin.map(x => mini(sizes, x)).join(' ')}</p>` : ''}
<p>All <a href="${racePath(r.key)}#units">${esc(r.name)} units</a> · <a href="/docs/tech/#${r.key}">${esc(r.name)} tech tree</a></p>`,
  };
}

function bldgPage(k, sizes) {
  const d = BUILDINGS[k], r = raceOf(k), un = unlocks(k);
  const facts = [
    ['Cost', cost(d.cost)], ['Build time', `${d.build} s`], ['Size', `${d.w} × ${d.h} tiles`],
    ['Built by', `${link(r.f.worker)}${(r.f.buildAdvanced.includes(k) && !r.f.buildBasic.includes(k)) ? ' (Build, Advanced)' : ' (Build)'}`],
    ['Requires', d.req ? link(d.req) : 'nothing more'],
  ];
  if (d.supply) facts.push(['Supply', `+${d.supply}`]);
  if (d.power) facts.push(['Power field', `${d.power} tiles`]);
  if (d.needsPower) facts.push(['Power', `must stand in a power field (${and(powerCasters(r).map(link))})`]);
  if (d.onVent) facts.push(['Placed', 'on an ether vent']);
  if (d.dropoff) facts.push(['Drop-off', 'workers bring shards and ether here']);
  const trains = (d.trains || []).map(u => `<li>${mini(sizes, u)} ${cost(UNITS[u].cost)}${UNITS[u].req && UNITS[u].req !== k ? ` <span class="muted">needs a ${esc(BUILDINGS[UNITS[u].req].name)}</span>` : ''}</li>`);
  const research = (d.researches || []).map(u => {
    const U = UPGRADES[u];
    return `<li><b>${esc(U.name)}</b>${U.levels > 1 ? ` (${U.levels} levels)` : ''}: ${esc(upgradeDesc(u, r.f))} <span class="muted">${U.cost.slice(0, U.levels).map(c => costText(c)).join(' · ')}</span></li>`;
  });
  const unlocked = [...un.units.map(u => `${mini(sizes, u)} <span class="muted">at the ${esc(and(trainedAt(u).map(nameOf)))}</span>`), ...un.buildings.map(b => mini(sizes, b))];
  return {
    path: bldgPath(k), section: '/docs/buildings/', crumbs: [['/docs/buildings/', 'Buildings'], [bldgPath(k), d.name]],
    title: `${d.name}: ${r.name} building · Ebbfall`,
    description: `${d.name}, a ${r.name} building in Ebbfall: ${descOf(k)} Cost ${costText(d.cost)}.`.slice(0, 300),
    body: `<div class="hero"><span class="pic">${sprite(sizes, k, 0.75, false)}</span><div class="who">
<h1>${esc(d.name)}</h1>
<p><a class="tag" href="${racePath(r.key)}">${esc(r.name)}</a>${d.hq ? '<span class="tag">Headquarters</span>' : ''}${d.detect > 0 ? '<span class="tag">Detector</span>' : ''}</p>
<p class="lead">${esc(descOf(k))}</p>
${stats(k)}
</div></div>
<dl class="facts">${facts.map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('')}</dl>
${trains.length ? `<h2>Trains</h2><ul class="list">${trains.join('')}</ul>` : ''}
${research.length ? `<h2>Researches</h2><ul class="list">${research.join('')}</ul>` : ''}
${unlocked.length ? `<h2>Unlocks</h2><ul class="list">${unlocked.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
<p class="muted">Base stats, before upgrades.</p>
<p>All <a href="${racePath(r.key)}#buildings">${esc(r.name)} buildings</a> · <a href="/docs/tech/#${r.key}">${esc(r.name)} tech tree</a></p>`,
  };
}

// ---- the lists and the tech trees ----

function listPage(kind, sizes) {
  const units = kind === 'units', path = `/docs/${kind}/`, Name = units ? 'Units' : 'Buildings';
  return {
    path, section: path, crumbs: [[path, Name]],
    title: `${Name} of both races · Ebbfall`,
    description: `Every ${units ? 'unit' : 'building'} in Ebbfall, the Humans' and the Vael's, with costs; each links to its stats${units ? ', where it is trained' : ', what it trains and researches'} and what it needs.`,
    body: `<h1>${Name}</h1>
${RACES.map(r => `<h2 id="${r.key}"><a href="${racePath(r.key)}">${esc(r.name)}</a></h2>${kindGrid(sizes, units ? r.units : r.buildings)}`).join('\n')}`,
  };
}

function racesPage(sizes) {
  return {
    path: '/docs/races/', section: '/docs/races/', crumbs: [['/docs/races/', 'Races']],
    title: 'The two races: Humans and Vael · Ebbfall',
    description: 'Ebbfall\'s two races, the Humans and the Vael: how each plays, their units and buildings.',
    body: `<h1>Races</h1>
<ul class="grid wide">${RACES.map(r => `<li><a class="card kind" href="${racePath(r.key)}"><span class="pic">${sprite(sizes, r.f.hq, 0.35)}</span><b>${esc(r.name)}</b><span class="muted">${esc(RACE_INTRO[r.key] || '')}</span><small>${r.units.length} units · ${r.buildings.length} buildings</small></a></li>`).join('')}</ul>`,
  };
}

/** A race's tech tree: its headquarters at the root, each building under the one it requires (none: the root), with
 *  what it trains and researches, and the units it unlocks elsewhere marked. */
function tree(r, sizes) {
  const B = BUILDINGS, U = UNITS;
  const children = (p) => r.buildings.filter(k => k !== r.f.hq && (B[k].req || r.f.hq) === p);
  const node = (k) => {
    const d = B[k], un = unlocks(k).units.filter(u => !(d.trains || []).includes(u));
    const rows = [];
    if (d.trains?.length) rows.push(`Trains ${d.trains.map(u => (U[u].req && U[u].req !== k ? `${link(u)} <span class="need">(needs ${esc(B[U[u].req].name)})</span>` : link(u))).join(', ')}`);
    if (d.researches?.length) rows.push(`Researches ${d.researches.map(u => esc(UPGRADES[u].name)).join(', ')}`);
    if (un.length) rows.push(`<span class="need">Unlocks</span> ${un.map(link).join(', ')}`);
    if (d.needsPower) rows.push('Needs power');
    if (d.power) rows.push(`Casts a power field (${d.power} tiles)`);
    if (d.supply && !d.hq) rows.push(`+${d.supply} supply`);
    const kids = children(k);
    return `<li><div class="node"><span class="pic">${sprite(sizes, k, 0.22)}</span><div><b>${link(k)}</b>${rows.map(x => `<div class="row">${x}</div>`).join('')}</div></div>${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}</li>`;
  };
  return `<ul class="tree">${node(r.f.hq)}</ul>`;
}

function techPage(sizes) {
  return {
    path: '/docs/tech/', section: '/docs/tech/', crumbs: [['/docs/tech/', 'Tech trees']],
    title: 'Tech trees of the Humans and the Vael · Ebbfall',
    description: 'What each building in Ebbfall needs, and what it trains, researches and unlocks: the Humans\' and the Vael\'s tech trees.',
    body: `<h1>Tech trees</h1>
<p class="lead">Each building stands under the one it needs. It lists what it trains and researches, and the units it unlocks at another building.</p>
${RACES.map(r => `<h2 id="${r.key}"><a href="${racePath(r.key)}">${esc(r.name)}</a></h2>\n${tree(r, sizes)}`).join('\n')}`,
  };
}

// ---- the hand-written pages, and How to play ----

/** A hand-written page (tools/docs/pages/NAME.html): its first comment holds `title:` and `description:` lines; in its
 *  body, {{shot:KEY}} is a screenshot and {{NAME}} one of `vars`. */
function written(name, vars) {
  const src = readFileSync(new URL(`./pages/${name}.html`, import.meta.url), 'utf8');
  const head = src.match(/^<!--([\s\S]*?)-->/)[1], meta = (k) => head.match(new RegExp(`^\\s*${k}:\\s*(.+)$`, 'm'))[1].trim();
  const body = src.slice(src.indexOf('-->') + 3).trim()
    .replace(/\{\{shot:(\w+)(?:\|([^}]*))?\}\}/g, (_, k, cap) => shot(k, cap || ''))
    .replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`docs: ${name}.html: no {{${k}}}`); return vars[k]; });
  return { title: meta('title'), description: meta('description'), body };
}

/** The game's How to play card (index.html #help), as the game has it: its paragraphs and list, without the card's
 *  buttons. */
export function howToPlayHtml(indexHtml = readFileSync(new URL('index.html', ROOT), 'utf8')) {
  const m = indexHtml.match(/<div class="screen" id="help"[\s\S]*?<h2>How to play<\/h2>([\s\S]*?)<div class="row">/);
  if (!m) throw new Error('docs: index.html has no How to play card (#help)');
  return m[1].trim();
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const VARS = () => ({
  levels: and(DIFF.map(d => d.name)), levelCount: WORDS[DIFF.length] || String(DIFF.length), maxPlayers: String(MAX_PLAYERS), maxComputers: WORDS[MAX_PLAYERS - 1] || String(MAX_PLAYERS - 1), repo: REPO,
  raceLinks: and(RACES.map(r => `<a href="${racePath(r.key)}">${esc(r.name)}</a>`)),
});

function homePage() {
  const w = written('home', VARS());
  return { path: '/docs/', section: null, crumbs: [], ...w, image: null };
}
function aboutPage() {
  return { path: '/docs/about/', section: '/docs/about/', crumbs: [['/docs/about/', 'About']], ...written('about', VARS()) };
}
function howToPage() {
  return {
    path: '/docs/how-to-play/', section: '/docs/how-to-play/', crumbs: [['/docs/how-to-play/', 'How to play']],
    title: 'How to play Ebbfall: controls, economy and army · Ebbfall',
    description: 'How to play Ebbfall, the free browser RTS: mining shards and ether, supply, building an army, and the mouse, keyboard and touch controls.',
    body: `<h1>How to play</h1>
${shot('battle')}
<div class="prose">${howToPlayHtml()}</div>
<div class="shots">${shot('base')}</div>
<p>New to it? <a href="/?first">Start the guided first game</a>: a short checklist shows you the way. Then the <a href="/docs/races/">races</a>, their <a href="/docs/units/">units</a> and <a href="/docs/tech/">tech trees</a>.</p>`,
  };
}

/** The docs' 404 (served by site/worker.js for an unknown /docs/ path, with a 404 status). */
function notFoundPage() {
  return {
    path: '/docs/404.html', crumbs: [], noindex: true, title: 'Not found · Ebbfall docs', description: 'This page of the Ebbfall docs does not exist.',
    body: `<h1>Not found</h1><p class="lead">There is no such page in the Ebbfall docs. It may have been renamed: units and buildings change as the game does.</p>
<div class="ctas"><a class="btn" href="/docs/">Docs home</a><a class="btn alt" href="/docs/units/">Units</a><a class="btn alt" href="/docs/buildings/">Buildings</a><a class="btn alt" href="/">Play</a></div>`,
  };
}

/** Every page (`sizes`: the sprites' sizes by kind). */
export function pages(sizes) {
  return [
    homePage(), aboutPage(), howToPage(), racesPage(sizes), ...RACES.map(r => racePage(r, sizes)),
    listPage('units', sizes), ...RACES.flatMap(r => r.units).map(k => unitPage(k, sizes)),
    listPage('buildings', sizes), ...RACES.flatMap(r => r.buildings).map(k => bldgPage(k, sizes)),
    techPage(sizes), notFoundPage(),
  ];
}
