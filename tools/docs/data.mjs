// The docs' view of the game's data (tools/docs/build.mjs): every name and number from the sim's tables (pkg/data.js,
// written by `npm run build:wasm`) and the words of src/engine/constants.js, arranged as the docs pages show them: each
// people's buildings in its Build list's order, each with the units it trains under it. Nothing here is written per
// unit: a rebalance, a renamed unit or a new kind changes the pages at the next build.
import { UNITS, BUILDINGS, FACTIONS, POP_MAX, GRID_MAX, PUMP_RATE, RADIO } from '../../src/engine/constants.js';

/** Each people's page: its URL slug, the page's title, and the sim's race key. */
const PAGES = { humans: 'kingdom', vael: 'expedition' };

/** "a Barracks", "an Uplink" (constants.js adds the same words to a description). */
export const aName = (n) => `${/^[AEIOU]/.test(n) ? 'an' : 'a'} ${n}`;

/** A kind's description without the "Needs a X." constants.js adds (the docs show it as a chip). */
export function plainDesc(d) {
  const tail = d.req ? ` Needs ${aName(BUILDINGS[d.req].name)}.` : '';
  return tail && d.desc.endsWith(tail) ? d.desc.slice(0, -tail.length) : d.desc;
}

/** One entry of a people's list: what its chips and lines show (`supply`: a unit's places, a building's +places). */
function entry(k, d, kind) {
  return {
    key: k, kind, name: d.name, what: d.what || '', cost: d.cost[0], supply: d.supply || 0,
    needs: d.req ? BUILDINGS[d.req].name : null, desc: plainDesc(d),
  };
}

/** A people: its facts strip and its buildings (headquarters first, then the Build list's basic and advanced pages),
 *  each with the units it trains. A kind trained nowhere (the two healers the sim keeps) is on no page. */
function people(race) {
  const f = FACTIONS[race], slug = PAGES[race];
  const keys = [...new Set([f.hq, ...f.buildBasic, ...f.buildAdvanced])];
  const buildings = keys.map(k => ({ ...entry(k, BUILDINGS[k], 'building'), units: (BUILDINGS[k].trains || []).map(u => entry(u, UNITS[u], 'unit')) }));
  return {
    race, slug, path: `/docs/${slug}/`, name: `The ${f.name}`, short: f.name,
    grid: !!f.grid, cap: f.grid ? 'GRID' : 'POP', money: f.money,
    facts: [
      ['Resource', f.money === 'gold' ? 'gold' : `${f.money}, from ${f.ore}`],
      ['Cap', f.grid ? `the grid, up to ${GRID_MAX}` : `population, up to ${POP_MAX}`],
      ['Headquarters', BUILDINGS[f.hq].name],
      ['Workers', `${UNITS[f.worker].name}s`],
    ],
    buildings,
  };
}

export const PEOPLES = Object.keys(PAGES).map(people);
/** Every unit and building on the docs, by people (what a page must list: test/docs.test.js and the e2e check it). */
export const ROSTER = PEOPLES.map(p => ({ slug: p.slug, buildings: p.buildings.map(b => b.key), units: p.buildings.flatMap(b => b.units.map(u => u.key)) }));

/**
 * The figures the pages' copy may name (`{{n key}}` in tools/docs/copy/, `{{w key}}` in words): from the data, never
 * typed in the text.
 */
export const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const K = FACTIONS.humans, X = FACTIONS.vael;
export const FIGURES = {
  popMax: POP_MAX,
  gridMax: GRID_MAX,
  marketSeconds: Math.round(1 / PUMP_RATE),
  castlePop: BUILDINGS[K.hq].supply,
  cottagePop: BUILDINGS[K.supply].supply,
  dataCenterGrid: BUILDINGS[X.hq].supply,
  substationGrid: BUILDINGS[X.supply].supply,
  villagersPerMine: UNITS[K.worker].mineCap,
  botsPerMine: UNITS[X.worker].mineCap,
  turbinesPerHq: BUILDINGS[X.market].perHq,
  dataCenterCoverage: RADIO.sources[X.hq],
  uplinkCoverage: RADIO.sources.uplink,
};
/** A figure in words when it is ten or less ("four"), else its digits. */
export const inWords = (n) => WORDS[n] ?? String(n);
/** A kind's name by key (`{{name trooper}}` in the copy). */
export const nameOf = (k) => (UNITS[k] || BUILDINGS[k])?.name;
