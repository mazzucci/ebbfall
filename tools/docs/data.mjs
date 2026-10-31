// The docs' view of the game's data (tools/docs/build.mjs): every number and name from the sim's tables through
// src/engine/constants.js (crates/endfall-sim/src/data/, exported by `npm run build:wasm`), arranged as the docs need
// it: each race's buildings and units in the order its Build menu and factories list them, what trains or researches
// what, what a building unlocks. And /docs/data.json, the same for agents and tools. Nothing here is hand-written per
// unit: a rebalance or a new kind changes the docs at the next build.
import { UNITS, BUILDINGS, UPGRADES, ABILITIES, FACTIONS, DIFF, UNIT_WARP, upgradeDesc, unlockOf } from '../../src/engine/constants.js';

/** A race's own kinds, in the game's order: its headquarters, the Build menu's basic then advanced page (once each),
 *  then the units each building trains, building by building. */
function race(key) {
  const f = FACTIONS[key];
  const buildings = [...new Set([f.hq, ...f.buildBasic, ...f.buildAdvanced])];
  const units = [...new Set(buildings.flatMap(b => BUILDINGS[b].trains || []))];
  const upgrades = [...new Set(buildings.flatMap(b => BUILDINGS[b].researches || []))];
  return { key, name: f.name, f, buildings, units, upgrades };
}
export const RACES = Object.keys(FACTIONS).map(race);
export const raceOf = (k) => RACES.find(r => r.units.includes(k) || r.buildings.includes(k));
export const raceOfUpgrade = (u) => RACES.filter(r => r.upgrades.includes(u));
export { UNITS, BUILDINGS, UPGRADES, ABILITIES, DIFF, UNIT_WARP, upgradeDesc, unlockOf };

/** A kind's description without the "Requires X." constants.js adds (the docs say it in the facts). */
export function descOf(k) {
  const d = UNITS[k] || BUILDINGS[k];
  const tail = d.req ? ` Requires ${BUILDINGS[d.req].name}.` : '';
  return tail && d.desc.endsWith(tail) ? d.desc.slice(0, -tail.length) : d.desc;
}
/** The buildings of its race that train unit `k`. */
export const trainedAt = (k) => raceOf(k).buildings.filter(b => (BUILDINGS[b].trains || []).includes(k));
/** The buildings of its race that research upgrade `u` (for race `r`). */
export const researchedAt = (u, r) => r.buildings.filter(b => (BUILDINGS[b].researches || []).includes(u));
/** What building `b` unlocks: its race's units and buildings that require it. */
export function unlocks(b) {
  const r = raceOf(b);
  return { units: r.units.filter(k => UNITS[k].req === b), buildings: r.buildings.filter(k => BUILDINGS[k].req === b) };
}
/** The buildings that place a building of race `r`: its worker builds them all. */
export const builder = (r) => r.f.worker;
/** The race's power-field casters (the Vael: what lets its other buildings work), with their radius in tiles. */
export const powerCasters = (r) => r.buildings.filter(b => BUILDINGS[b].power > 0);

const weapon = (w) => w && { damage: w.dmg, damageAir: w.dmgAir, range: w.range, minRange: w.minRange, cooldown: w.cd, splash: w.splash, splashRadius: w.splashR / 32, melee: w.melee, deployedOnly: w.siege };

/** /docs/data.json: every unit, building and upgrade of both races with base stats and relations (see `about`). */
export function dataJson() {
  const units = {}, buildings = {}, upgrades = {};
  for (const r of RACES) {
    for (const k of r.units) {
      const d = UNITS[k];
      units[k] = {
        name: d.name, race: r.key, description: descOf(k), cost: d.cost, supply: d.supply, buildTime: d.build,
        health: d.hp, shields: d.shields, armor: d.armor, flying: d.air, worker: !!d.worker, capital: !!d.capital, cloaked: !!d.cloaked,
        detector: d.detect > 0, heals: d.heal > 0 ? (d.mend ? 'shields' : 'infantry') : null, speed: +(d.speed / 32).toFixed(3), sight: d.sight,
        weapon: d.worker ? null : weapon(d.weapon), mobileWeapon: weapon(d.light),
        abilities: (d.abilities || []).map(a => ({ key: a, name: ABILITIES[a].name, description: ABILITIES[a].desc, unlockedBy: unlockOf(a) })),
        trainedAt: trainedAt(k), requires: d.req,
      };
    }
    for (const k of r.buildings) {
      const d = BUILDINGS[k];
      buildings[k] = {
        name: d.name, race: r.key, description: descOf(k), cost: d.cost, buildTime: d.build, size: [d.w, d.h],
        health: d.hp, shields: d.shields, armor: d.armor, supply: d.supply, detector: d.detect > 0,
        weapon: weapon(d.weapon), headquarters: !!d.hq, dropoff: !!d.dropoff, onEtherVent: !!d.onVent,
        needsPower: !!d.needsPower, powerRadius: d.power || 0, builtBy: r.f.worker,
        trains: d.trains || [], researches: d.researches || [], requires: d.req, unlocks: unlocks(k),
      };
    }
    for (const u of r.upgrades) {
      const d = UPGRADES[u];
      (upgrades[u] ||= { name: d.name, effect: d.effect, levels: d.levels, cost: d.cost.slice(0, d.levels), time: d.time.slice(0, d.levels), researchedAt: [], description: {} });
      upgrades[u].researchedAt.push(...researchedAt(u, r));
      upgrades[u].description[r.key] = upgradeDesc(u, r.f);
    }
  }
  return {
    game: 'Ebbfall', url: 'https://ebbfall.com/', docs: 'https://ebbfall.com/docs/',
    about: 'Base stats of every unit, building and upgrade, generated from the game\'s own tables at build time (no upgrades applied). '
      + 'Costs are [shards, ether]; times in seconds; health, shields, armor and damage in hit points; ranges, radii, sight and speed in tiles (speed per second). '
      + 'A weapon\'s damage is per hit, damageAir against flyers (0: cannot hit them); cooldown is seconds between shots; deployedOnly: fires only deployed. '
      + 'Keys name units, buildings and upgrades; requires is the building that must stand first.',
    races: Object.fromEntries(RACES.map(r => [r.key, { name: r.name, headquarters: r.f.hq, worker: r.f.worker, supply: r.f.supply, ether: r.f.ether, power: r.f.power, workersRepair: r.f.repairs, warpIn: r.f.warp, buildings: r.buildings, units: r.units, upgrades: r.upgrades }])),
    units, buildings, upgrades,
    difficulties: DIFF.map(d => d.name),
  };
}
