// The docs' small pictures (tools/docs/pages.mjs tokens): diagrams that replace paragraphs, drawn from the game's data
// and the sprite crops, in plain HTML (and one inline SVG) that reads whole without JavaScript. Every number in them is
// the data's (data.mjs FIGURES); every plate is a crop (sprites.mjs).
import { esc, styled } from './html.mjs';
import { PEOPLES, SHOWN, FIGURES, nameOf, aName } from './data.mjs';
import { SPRITE_URL, cropOf } from './sprites.mjs';
import { UNITS, BUILDINGS, UPGRADES, RADIO, upgradeDesc, FACTIONS } from '../../src/engine/constants.js';

/** A small plate (`name`: a crop's), `px` CSS pixels, from its smallest file that is still 2x. No `alt`: decorative,
 *  beside a label that names it (`alt=""`, hidden from screen readers). */
export function mini(name, px, alt = '') {
  const c = cropOf(name);
  if (!c) throw new Error(`docs: no crop ${name}`);
  const [file] = Object.values(c.files).sort((a, b) => a[1] - b[1]).find(([, w]) => w >= px) || Object.values(c.files)[0];
  return `<img class="pl" src="${SPRITE_URL}${file}" width="${px}" height="${px}" alt="${esc(alt)}"${alt ? '' : ' aria-hidden="true"'} loading="lazy" decoding="async">`;
}
const step = (img, label) => `<li>${img}<span>${label}</span></li>`;

/** The game in one line: the mine, the workers, a building, an army, their base; and back round. */
export function loop() {
  return `<figure class="dia loop"><ol class="chain" aria-label="How a game goes">
${step(mini('mine', 56, 'A gold mine'), 'MINE')}
${step(`${mini('harvester', 56, 'A Villager')}<i class="coin" aria-hidden="true"></i>`, 'WORKERS')}
${step(mini('barracks', 56, 'A Barracks'), 'BUILD')}
${step(`<span class="pair">${mini('trooper', 48, 'A Guard')}${mini('knight', 48, 'A Knight')}</span>`, 'ARMY')}
${step(mini('conflux-foe', 56, "The enemy's Data center, in their color"), 'THEIR BASE')}
</ol><p class="back"><span>more mines, more army</span></p></figure>`;
}

/** Where gold comes from, for both peoples: the mine and how many work it, the worker, the headquarters, and the
 *  building that earns by itself. */
export function economy() {
  const row = (p) => {
    const f = FACTIONS[p.race], w = UNITS[f.worker], hq = BUILDINGS[f.hq], m = BUILDINGS[f.market];
    const by = p.grid ? `up to ${m.perHq} per ${hq.name}, by itself` : `about a gold every ${FIGURES.marketSeconds} seconds, by itself`;
    return `<div class="erow"><p class="who">${esc(p.name)}</p><ol class="chain">
${step(mini('mine', 48, 'A gold mine'), `${w.mineCap} ${esc(w.name)}s at once`)}
${step(mini(f.worker, 48, p.grid ? aName(w.name) : ''), p.grid ? 'thorium' : esc(w.name))}
${step(mini(f.hq, 48, p.grid ? `The ${hq.name}` : ''), p.grid ? 'energy' : esc(hq.name))}
</ol><p class="branch">${mini(f.market, 48)}<span><b>${esc(m.name)}</b> ${esc(by)}</span></p></div>`;
  };
  return `<figure class="dia econ">${PEOPLES.map(row).join('')}</figure>`;
}

/** The two caps as bars: the headquarters' places, then each house's or Substation's, up to the cap. */
export function cap() {
  const bar = (p) => {
    const f = FACTIONS[p.race], hq = BUILDINGS[f.hq], s = BUILDINGS[f.supply], max = p.grid ? FIGURES.gridMax : FIGURES.popMax;
    const pc = (n) => `${(n / max * 100).toFixed(2)}%`;
    return `<div class="cap"><p class="who">${mini(f.hq, 40, `The ${hq.name}`)}${mini(f.supply, 40, aName(s.name))}<b>${p.grid ? 'GRID' : 'POPULATION'}</b> up to ${max}</p>
<div class="bar" role="img" aria-label="${esc(`${hq.name} +${hq.supply}, then +${s.supply} for each ${s.name}, up to ${max}`)}"><span class="hq ${styled(`width:${pc(hq.supply)}`)}">${esc(hq.name)} +${hq.supply}</span>${[0, 1, 2].map(() => `<span class="${styled(`width:${pc(s.supply)}`)}">+${s.supply}</span>`).join('')}<span class="rest">… ${max}</span></div>
<p class="note2">${esc(s.name)} +${s.supply} each</p></div>`;
  };
  return `<figure class="dia caps">${PEOPLES.map(bar).join('')}<p class="low"><span class="read">POP 36/36</span> the number turns red and pulses when not even a worker fits</p></figure>`;
}

/** The Expedition's signal: the Data center's coverage inside an Uplink's, its machines inside, its hired locals out. */
export function expedition() {
  const dc = RADIO.sources.conflux, up = RADIO.sources.uplink, R = 150, r = R * dc / up;
  const img = (name, x, y, s, alt) => { const c = cropOf(name), [file] = c.files.phone || Object.values(c.files)[0]; return `<image href="${SPRITE_URL}${file}" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}"><title>${esc(alt)}</title></image>`; };
  const machines = [...RADIO.machines];
  const locals = PEOPLES.find(p => p.grid).buildings.flatMap(b => b.units).filter(u => !machines.includes(u.key) && !UNITS[u.key].worker);
  const svg = `<svg viewBox="0 0 640 380" role="img" aria-labelledby="dexT"><title id="dexT">${esc(`The Data center's coverage, ${dc} tiles, inside an Uplink's, ${up} tiles: machines work inside it; hired locals fight anywhere.`)}</title>
<defs><pattern id="dexG" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#263548" stroke-width=".6" opacity=".6"/></pattern></defs>
<rect width="640" height="380" fill="url(#dexG)"/>
<circle cx="250" cy="190" r="${R}" fill="rgba(79,209,197,.06)" stroke="#4fd1c5" stroke-width="1.5" stroke-dasharray="6 5"/>
<circle cx="200" cy="230" r="${r.toFixed(1)}" fill="rgba(79,209,197,.10)" stroke="#4fd1c5" stroke-width="1.5"/>
${img('uplink', 290, 120, 64, 'An Uplink')}${img('conflux', 200, 230, 56, 'A Data center')}
<text x="250" y="${190 - R - 8}" text-anchor="middle" class="t">Uplink: ${up} tiles</text>
<text x="200" y="${230 + r + 16}" text-anchor="middle" class="t">Data center: ${dc} tiles</text>
${machines.map((k, i) => img(k, 170 + (i % 2) * 120 + (i > 1 ? 40 : 0), 110 + Math.floor(i / 2) * 150 - (i === 2 ? 30 : 0), 44, `${aName(UNITS[k].name)}: needs signal`)).join('')}
${locals.map((u, i) => img(u.key, 470 + i * 70, 190, 52, `${aName(u.name)}: fights anywhere`)).join('')}
<text x="505" y="240" text-anchor="middle" class="t">hired locals fight anywhere</text>
</svg>`;
  const strip = `<ol class="chain small" aria-label="Energy">${step(mini('lumen', 40, 'A Bot'), 'thorium')}${step(mini('conflux', 40, 'A Data center'), 'energy')}${step('<i class="bolt" aria-hidden="true"></i>', 'builds and trains')}</ol>`;
  return `<figure class="dia dex">${svg}${strip}<figcaption>Energy builds things; the grid keeps them running.</figcaption></figure>`;
}

/**
 * A people at a glance: its buildings in tiers by what each needs first (the start, then "after a Barracks", ...), in
 * the order the Build list meets them, each building with the units it trains (or, training none, its role line); a unit
 * says what it needs only where its building's chain of needs does not already imply it; the machines' signal dot.
 * A wide screen flattens the tiers into one row of columns in Build-list order (docs.css); a portrait phone shows the
 * tiers as bands, a row per building (the "Ledger").
 */
export function tree(people) {
  const by = new Map();
  for (const b of people.buildings) { const k = b.needs || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(b); }
  // What stands before a building: its need, its need's need, ... (a unit needing one of them says nothing on a phone)
  const before = (b) => { const out = new Set(); for (let r = BUILDINGS[b.key].req; r; r = BUILDINGS[r].req) out.add(BUILDINGS[r].name); return out; };
  const need = (n, implied) => (n ? `<em class="need${implied ? ' imp' : ''}">needs ${esc(n)}</em>` : '');
  const sig = (u) => (RADIO.machines.has(u.key) ? '<i class="sig" title="Needs signal" aria-label="needs signal"></i>' : '');
  const unit = (b) => (u) => `<li data-g="${u.key}">${mini(u.key, 40)}<span>${esc(u.name)}${sig(u)}</span>${need(u.needs, before(b).has(u.needs))}</li>`;
  const col = (b) => `<li class="tcol ${styled(`--i:${people.buildings.indexOf(b)}`)}" data-g="${b.key}">${mini(b.key, 56)}<b>${esc(b.name)}</b>${need(b.needs)}${b.units.length ? `<ul>${b.units.map(unit(b)).join('')}</ul>` : `<span class="what">${esc(b.what)}</span>`}</li>`;
  const tier = ([k, bs]) => `<li class="tier" data-after="${esc(k)}"><p class="tl"><span>${k ? `After ${esc(aName(k))}` : 'Start'}</span></p><ol class="blds">${bs.map(col).join('')}</ol></li>`;
  const legend = people.buildings.some(b => b.units.some(u => RADIO.machines.has(u.key))) ? '<p class="legend"><i class="sig" aria-hidden="true"></i>needs signal: works only inside coverage</p>' : '';
  return `<figure class="dia tree"><div class="scroll" tabindex="0" aria-label="${esc(people.name)}: buildings and what they train"><ol class="tiers">${[...by].map(tier).join('')}</ol></div><p class="swipe" aria-hidden="true">swipe →</p>${legend}</figure>`;
}

/** The home's two tiles, each a link to a people's page (the Expedition first: SHOWN): its headquarters, a unit in front, a
 *  line under its name; `tags` in the same order. */
export function peoples(tags) {
  const tile = (p, i) => {
    const hq = p.buildings[0], unit = p.grid ? 'umbra' : 'knight';
    return `<li><a class="ptile" href="${p.path}"><span class="art">${mini(hq.key, 168, '').replace('class="pl"', 'class="pl hq"')}${mini(unit, 96, '').replace('class="pl"', 'class="pl fr"')}</span><span class="txt"><b>${esc(p.name)}</b><span>${esc(tags[i] || '')}</span><small>Every building and unit →</small></span></a></li>`;
  };
  return `<ul class="peoples">${SHOWN.map(tile).join('')}</ul>`;
}

/**
 * About's network diagram: a phone and a laptop, the same game on both (the same dots, the same tick), the relay
 * between them, orders in (amber) and turns out (teal, dashed). One inline SVG, 328 units wide: 1:1 on a 360 px phone,
 * capped at 560 px on a desktop (docs.css .net), so its 11-12 px labels never shrink. Classes only (the CSP).
 */
export function network() {
  const dots = (ox, oy) => [[8, 12, 'dot'], [16, 22, 'dot'], [9, 32, 'dot'], [38, 14, 'dot2'], [31, 27, 'dot2'], [40, 36, 'dot2']].map(([x, y, c]) => `<circle cx="${ox + x}" cy="${oy + y}" r="3" class="${c}"/>`).join('');
  const arrows = (x0, x1, lx) => `<path d="M${x0} 78H${x1}" class="ord" marker-end="url(#netA)"/><text x="${lx}" y="70" text-anchor="middle" class="t sm ta">orders</text>
<path d="M${x1} 96H${x0}" class="trn" marker-end="url(#netB)"/><text x="${lx}" y="112" text-anchor="middle" class="t sm tt">turns</text>`;
  const tick = 'tick 2 310';
  return `<figure class="dia net"><svg viewBox="0 0 328 192" role="img" aria-labelledby="netT"><title id="netT">A phone and a laptop each run the same game, at the same tick. Orders go to a small relay; the relay sends each turn back to both.</title>
<defs><marker id="netA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="mA"/></marker><marker id="netB" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="mT"/></marker></defs>
<rect x="20" y="26" width="58" height="120" rx="9" class="dev"/><rect x="26" y="36" width="46" height="92" rx="3" class="scr"/><g>${dots(25, 60)}</g><rect x="41" y="136" width="16" height="2" rx="1" class="hbar"/>
<text x="49" y="166" text-anchor="middle" class="tl">PHONE</text><text x="49" y="181" text-anchor="middle" class="t">${tick}</text>
<rect x="232" y="54" width="80" height="64" rx="4" class="dev"/><rect x="237" y="59" width="70" height="52" class="scr"/><g>${dots(248, 61)}</g><path d="M224 118h96l6 8H218z" class="dev"/>
<text x="272" y="166" text-anchor="middle" class="tl">LAPTOP</text><text x="272" y="181" text-anchor="middle" class="t">${tick}</text>
<rect x="138" y="72" width="44" height="28" rx="14" class="hub"/><text x="160" y="90" text-anchor="middle" class="tl sm ta">RELAY</text>
${arrows(84, 134, 109)}
${arrows(226, 186, 204)}
</svg><figcaption>Every device runs the same game. Only your orders travel: the relay bundles them into turns and sends each turn to everyone.</figcaption></figure>`;
}

/** About's strip: four sprites, large. */
export function artStrip() {
  return `<figure class="dia strip"><div class="row">${['trooper', 'knight', 'lumen', 'shrike'].map(k => mini(`${k}-large`, 128, `Ebbfall's ${nameOf(k)}, from the game`)).join('')}</div><figcaption>From the game: a Guard, a Knight, a Bot, a Drone.</figcaption></figure>`;
}

/** A people's research, one line each: its name and levels, where, what it does. */
export function research(people) {
  const f = FACTIONS[people.race], seen = new Set(), items = [];
  for (const b of people.buildings) for (const k of BUILDINGS[b.key].researches || []) {
    if (seen.has(k)) continue; seen.add(k);
    const u = UPGRADES[k], roman = ['', 'I', 'II', 'III'];
    items.push(`<li><b>${esc(u.name)}${u.levels > 1 ? ` ${roman[1]} to ${roman[u.levels]}` : ''}</b> (${esc(b.name)}): ${esc(upgradeDesc(k, f))}</li>`);
  }
  return `<ul class="research">${items.join('')}</ul>`;
}
