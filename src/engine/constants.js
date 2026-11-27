// Game data as the client sees it. Every number comes from the Rust sim (crates/endfall-sim/src/data/, exported
// into pkg/data.js by `npm run build:wasm`); this file adds only what the player reads: hotkeys and descriptions.
// Costs are [gold, 0] (the second slot, once a second resource, is always 0). Distances are in tiles unless named otherwise; speeds in px/s.
import D from './pkg/data.js';
import { DIFF_NAMES, plural } from './util.js';
if (!D.schema) throw new Error('src/engine/pkg/ is stale: run npm run build:wasm');

export const TILE = D.consts.tile;
/** A two-seat map's size in tiles: the menu's maps (a game's own size is MW x MH in core.js, set when it starts). */
export const DUEL_MW = D.consts.mw;
export const DUEL_MH = D.consts.mh;
/** Fixed simulation tick, seconds. The sim only ever advances by this. */
export const DT = D.consts.dt;
/** Gold a second a finished Market pays (`PUMP_RATE`). */
export const PUMP_RATE = D.consts.pump_rate;
/** A Market's pay by Trade level (0, 1, 2), as a multiple of its rate. */
export const TRADE_RATE = D.consts.trade_rate;
/** The most population (the Kingdom) and grid (the Expedition) a seat can have, on every map. */
export const POP_MAX = D.consts.pop_max;
export const GRID_MAX = D.consts.grid_max;

/** The seats a menu game deals: the player and the scripted opponent (tests and tools; the client itself plays G.me). */
export const PLAYER = D.consts.player;
export const ENEMY = D.consts.enemy;
/** A speed tech's multiple for its unit. */
export const TECH_SPEED = D.consts.tech_speed;
/** A construction tech's multiple for its side's building rate. */
export const TECH_BUILD = D.consts.tech_build;
/** The Data center's area and the signal (crates/endfall-sim/src/data/radio.rs): the unit kinds the signal speeds up
 *  (`machines`, a Set), the area each building gives (`areas`, tiles by kind, a circle round its center: the Data
 *  center's), the buildings that give the signal across the whole map (`wide`, a Set: the Uplink), a machine's speed
 *  with the signal (`boost`) and without (`slow`), multiples, and the buildings placed only inside the area (`within`,
 *  a Set: the Expedition's but the Data center and the Uplink). */
export const RADIO = { ...D.radio, machines: new Set(D.radio.machines), within: new Set(D.radio.within), wide: new Set(D.radio.wide) };
/** The area a building of `type` gives, tiles (the same on every map). */
export const areaOf = (type) => RADIO.areas[type] || 0;
/** Whether a building of `type` goes up only inside its side's area (its center, by exact distance: the sim's rule). */
export const needsArea = (type) => RADIO.within.has(type);

/** Hotkeys, descriptions and `what` (a short line, a verb first and about 25 characters, under the health bar on the selection console;
 *  none for a kind players cannot get),
 *  by kind key (the numbers and names are the sim's). A description says what the unit does, and its strengths and weaknesses in
 *  general terms (air, armor, infantry, machines, splash): a unit's text never names another unit, of either people (Stelian,
 *  2026-11-11; test/engine.test.js holds it). */
const UNIT_TEXT = {
  // the Kingdom (sim race `humans`)
  harvester: { hot: 'G', what: 'Mines gold, builds, repairs', desc: 'Mines gold. Builds and repairs.' },
  trooper: { hot: 'K', what: 'Holds the line, cheaply', desc: 'Cheap and steady. Fights up close, ground only. Weak against splash. Can Brace (no moving, more armor) after Shield Wall.' },
  lancer: { hot: 'H', what: 'Shoots ground and air', desc: 'Shoots ground and air, hits flyers hard. Fragile up close.' },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed.' },
  observer: { hot: 'S', what: 'Scouts far, unarmed', desc: 'Unarmed. Slow, sees far, floats over cliffs.' },
  siegeTank: { hot: 'A', what: 'Fires cannonballs from afar', desc: 'Sets up where it stops and fires cannonballs far, with splash. Can\'t hit flyers or anything close.' },
  bastion: { hot: 'B', what: 'Shoots down flyers', desc: 'The answer to flyers: heavy bolts, slow to reload, that hit the ground too. Weak against infantry.' },
  rider: { hot: 'E', what: 'Raids workers, fast', desc: 'Fast, raids workers. Faster after Horseshoes. Light armor: falls fast under ranged fire.' },
  knight: { hot: 'N', what: 'Charges in heavy armor', desc: 'Fast and tough in heavy armor, hits hard up close. Faster after Horseshoes. Can\'t hit flyers.' },
  // the Expedition (`vael`)
  lumen: { hot: 'G', what: 'Mines thorium, builds, repairs', desc: 'Mines thorium, which the Data center turns into energy. Builds, staying at each building until it stands, and repairs buildings. Goes anywhere.' },
  scythe: { hot: 'N', what: 'Fast, escorts and defends', desc: 'Fast, with a light gun: catches raiders and escorts. Hits ground and air. Weak against infantry in numbers. Needs signal: slower outside a Data center\'s area unless an Uplink stands.' },
  prism: { hot: 'L', what: 'Fights up close, hired', desc: 'Cheap and quick to field. Fights up close, ground only. Weak against armor. Fights anywhere.' },
  monolith: { hot: 'C', what: 'Fires rockets on the move', desc: 'Long-range rockets that hit an area. Fires while moving; can\'t hit what is close or flying, and sees no farther than others: it needs spotters. Needs signal: slower outside a Data center\'s area unless an Uplink stands.' },
  shrike: { hot: 'E', what: 'Swarms, fast and small', desc: `A small, fast attack drone: weak alone, dangerous in a swarm. Fragile. Hits ground and air. Needs signal: slower outside a Data center's area unless an Uplink stands.` },
  halo: { hot: 'T', desc: 'Mends nearby allies, even under fire.' },
  umbra: { hot: 'U', what: 'Elite, strikes from range', desc: 'Tough, with a long reach; hits ground and air. Costly. Needs signal: slower outside a Data center\'s area unless an Uplink stands.' },
  bruiser: { hot: 'B', what: 'Holds the front line', desc: 'The toughest on foot. Fights up close, ground only. Slow, and weak against heavy armor. Fights anywhere.' },
};
// ("Needs a X." is added from the tables, so a description never names its requirement itself.)
const BLDG_TEXT = {
  core: { hot: 'L', what: 'Trains Villagers, stores gold', desc: 'Trains Villagers and stores gold. +20 population. A new base: build it by a gold mine.' },
  depot: { hot: 'W', what: 'Supplies +8 population', desc: '+8 population.' },
  // (the Market: its verb, `verb` and `doing`, for the panel and the guide)
  extractor: { hot: 'X', what: 'Earns gold, no workers', verb: 'earns', doing: 'Earning', desc: 'Earns gold by itself, with no workers. One per Castle. Researches Trade, for more gold.' },
  barracks: { hot: 'C', what: 'Trains Guards and Archers', desc: 'Trains Guards and Archers.' },
  forge: { hot: 'K', what: 'Researches upgrades', desc: 'Researches Weapons, Armor and Shield Wall. Unlocks Knights, Cannons and Ballistas.' },
  factory: { hot: 'S', what: 'Builds siege and Balloon', desc: 'Builds Ballistas, Cannons and the Balloon.' },
  turret: { hot: 'O', what: 'Shoots ground and air', desc: 'Shoots ground and air.' },
  airfield: { hot: 'F', what: 'Trains Riders and Knights', desc: 'Trains Riders and Knights. Researches Horseshoes.' },
  // the Expedition
  conflux: { hot: 'T', what: 'Trains Bots, makes energy', desc: `Trains Bots. Its small reactor turns thorium into energy, stored without limit. +${D.buildings.conflux.supply} grid. Buildings go up only within its ${D.radio.areas.conflux} tiles, and with no Uplink its small receiver gives machines the signal there. A new base: build it by a gold mine.` },
  // (the Wind turbine, the Expedition's Market: its verb and `doing`, as the Market's)
  spire: { hot: 'S', what: 'Generates energy, no workers', verb: 'generates', doing: 'Generating', desc: `Generates energy over time, with no workers. Each Data center's computers run up to ${D.buildings.spire.perHq}.` },
  substation: { hot: 'W', what: `Expands the grid: +${D.buildings.substation.supply}`, desc: `Expands the grid: more can run at once. +${D.buildings.substation.supply} grid.` },
  siphon: { hot: 'I', what: 'Hires Sellswords, Bruisers', desc: 'Locals sign on here for the Expedition\'s pay. Hires Sellswords, and Bruisers once a Lab stands.' },
  kiln: { hot: 'C', what: 'Builds Drones and Buggies', desc: 'Builds Drones, and Buggies once a Lab stands.' },
  loom: { hot: 'G', what: 'Researches upgrades', desc: 'Researches Weapons and Energy efficiency. Unlocks Buggies, Bruisers, the Uplink and the Portal.' },
  ward: { hot: 'A', what: 'Early defense, ground and air', desc: 'Early defense against ground and air.' },
  uplink: { hot: 'U', what: 'Signal for machines, whole map', desc: 'A large dish: while it stands, your machines have the signal across the whole map and move faster everywhere. It is their control signal, not the buildings\' power: buildings still go up only near a Data center. Can go up anywhere explored.' },
  // (the Portal teleports what it makes: `training`, its word for Training in the panel)
  eclipse: { hot: 'D', what: 'Teleports Rovers, Androids', training: 'Teleporting', desc: 'Teleports Rovers and Androids from the future. Only one.' },
};
const UPGRADE_TEXT = { weapons: { hot: 'W' }, armor: { hot: 'L', desc: '+1 armor per level for all units.' }, shields: { hot: 'H', desc: 'Shields soak 1 more damage of every hit per level.' },
  afterburners: { hot: 'T' }, entrenching: { hot: 'S' },
  drills: { hot: 'D', desc: `Bots mine more per trip: ${D.consts.drill_load[1]} more, ${D.consts.drill_load[2]} at level 2.` },
  energyEfficiency: { hot: 'G', desc: `Machines cost ${Math.round((1 - D.consts.energy_cost[1]) * 100)}% less energy per level.` },
  trade: { hot: 'T', desc: `Every Market pays more gold: ${Math.round((D.consts.trade_rate[1] - 1) * 100)}% more, then ${Math.round((D.consts.trade_rate[2] - 1) * 100)}% more.` } };

const merge = (data, text) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { ...v, ...text[k] }]));
/** Units and buildings, in the sim's kind order (the snapshot sends kind indices). */
export const UNITS = merge(D.units, UNIT_TEXT);
export const BUILDINGS = merge(D.buildings, BLDG_TEXT);
// "Needs a X." comes from the tables, so it can never name the wrong building.
for (const d of [...Object.values(UNITS), ...Object.values(BUILDINGS)]) if (d.req) { const n = D.buildings[d.req].name; d.desc += ` Needs ${/^[AEIOU]/.test(n) ? 'an' : 'a'} ${n}.`; }
/** Extra damage per Weapons level, by unit or building type. */
export const UP_DMG = Object.fromEntries([...Object.entries(UNITS), ...Object.entries(BUILDINGS)].filter(([, d]) => d.weapon?.upDmg).map(([k, d]) => [k, d.weapon.upDmg]));
/** Team-wide upgrades; per level: cost [gold, 0], seconds. */
export const UPGRADES = merge(D.upgrades, UPGRADE_TEXT);
/** A team's levels of every upgrade with this effect ('weapons', 'armor'), added up (`levels`: G.upgrades[team]). */
export const effectLevel = (levels, effect) => Object.entries(UPGRADES).reduce((n, [k, u]) => n + (u.effect === effect ? levels?.[k] || 0 : 0), 0);
/** The places a unit of type `t` takes: its supply, population or grid (the sim's `World::takes`). */
export const takes = (t) => UNITS[t].supply;
/** What a unit of type `t` costs a team with upgrade levels `levels` (G.upgrades[team]): its cost, a machine's (any
 *  unit but a living one) less by Energy efficiency, rounded to whole energy (the sim's `World::unit_cost`; Math.round
 *  is jsmath's round). */
export const unitCost = (levels, t) => {
  const d = UNITS[t], l = Math.min(effectLevel(levels, 'energy'), 2);
  return l && !d.bio ? d.cost.map(c => Math.round(c * D.consts.energy_cost[l])) : d.cost;
};
/** The playable sides: headquarters, worker and the Build list's basic and advanced pages. */
export const FACTIONS = D.factions;
/** A side's own kinds (`f`: a FACTIONS entry): its buildings and the units they train. */
export const kindsOf = (f) => { const b = [f.hq, ...f.buildBasic, ...f.buildAdvanced]; return new Set([...b, ...b.flatMap(k => BUILDINGS[k].trains || [])]); };
/** Upgrade `k`'s words for side `f`. Weapons, which both races research, names that side's own weapons only. */
export const upgradeDesc = (k, f) => k !== 'weapons' ? UPGRADES[k].desc : 'More damage per level: ' + Object.entries(UP_DMG).filter(([t]) => kindsOf(f).has(t))
  .map(([t, n]) => `${(UNITS[t] || BUILDINGS[t]).name} +${n}`).join(', ') + '.';
const ABILITY_TEXT = {
  entrench: { hot: 'D', desc: 'Brace: 4 more armor, but no moving, until you lift it (1 s each way).' },
  deploy: { desc: 'Sets up whenever it stops (3 s, no moving or firing meanwhile), and packs up when it has to move: it fires only set up.' },
};
/** Unit abilities, with their hotkeys and descriptions: one tap each on the card, but for an automatic one (`auto`:
 *  the Cannon's Deploy), which the unit uses by itself and which has no button or key. */
export const ABILITIES = merge(D.abilities, ABILITY_TEXT);
// A tech's words come from what it does: the ability it unlocks (and who has it), the unit it speeds up.
for (const u of Object.values(UPGRADES)) {
  const who = (k) => Object.values(UNITS).filter(d => (d.abilities || []).includes(k)).map(d => plural(d.name)).join(' and ');
  if (u.effect === 'unlock') u.desc = `Unlocks ${ABILITIES[u.of].name} for ${who(u.of)}.`;
  if (u.effect === 'speed') u.desc = `${u.of.split(',').map(k => plural(UNITS[k].name)).join(' and ')} move faster.`;
  if (u.effect === 'build') u.desc = `Buildings go up ${Math.round((TECH_BUILD - 1) * 100)}% faster, those already rising too.`;
}
/** The tech that unlocks ability `k` (its key), or null when none does. */
export const unlockOf = (k) => Object.keys(UPGRADES).find(u => UPGRADES[u].effect === 'unlock' && UPGRADES[u].of === k) || null;
/** The snapshot record layouts (field names per record) and code names, from crates/endfall-sim/src/snapshot.rs. */
export const SCHEMA = D.schema;
/** Units a building's production queue holds (`QUEUE_MAX` in crates/endfall-sim/src/data/mod.rs): the console's slots. */
export const QUEUE_MAX = D.schema.queueSlots;
/** The difficulties' names (util.js: pure, as the site's challenge cards name the levels too). */
export { DIFF_NAMES };
/** AI opponent tuning per difficulty. first/gap: seconds before the first wave and between waves. */
export const DIFF = D.diff.map((d, i) => ({ name: DIFF_NAMES[i], ...d }));
