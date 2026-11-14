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

/** The seats a menu game deals: the player and the scripted opponent (tests and tools; the client itself plays G.me). */
export const PLAYER = D.consts.player;
export const ENEMY = D.consts.enemy;
/** A speed tech's multiple for its unit. */
export const TECH_SPEED = D.consts.tech_speed;
/** A construction tech's multiple for its side's building rate. */
export const TECH_BUILD = D.consts.tech_build;
/** The range (crates/endfall-sim/src/data/radio.rs): the unit kinds it speeds up (`machines`, a Set), what each
 *  source building gives (`sources`, tiles by kind, a circle round its center), a machine's speed inside it (`boost`,
 *  a multiple) and the Drone's leash past its edge (`leash`, tiles). */
export const RADIO = { ...D.radio, machines: new Set(D.radio.machines) };
/** The coverage a source of `type` gives, tiles (the same on every map). */
export const coverageOf = (type) => RADIO.sources[type] || 0;

/** Hotkeys, descriptions and `what` (a short line, a verb first and about 25 characters, under the health bar on the selection console;
 *  none for a kind players cannot get),
 *  by kind key (the numbers and names are the sim's). A description says what the unit does, and its strengths and weaknesses in
 *  general terms (air, armor, infantry, machines, splash): a unit's text never names another unit, of either people (Stelian,
 *  2026-11-11; test/engine.test.js holds it). */
const UNIT_TEXT = {
  // the Kingdom (sim race `humans`)
  harvester: { hot: 'G', what: 'Mines gold, builds, repairs', desc: 'Mines gold. Builds and repairs.' },
  trooper: { hot: 'K', what: 'Holds the line, cheaply', desc: 'Cheap and steady. Fights up close, ground only. Weak against splash. Can Brace (no moving, more armor) after Shield Drill.' },
  lancer: { hot: 'H', what: 'Shoots ground and air', desc: 'Shoots ground and air, hits flyers hard. What it hits slows down for 3 s. Fragile up close.' },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed.' },
  observer: { hot: 'S', what: 'Scouts far, unarmed', desc: 'Unarmed. Slow, sees far, floats over cliffs.' },
  siegeTank: { hot: 'A', what: 'Fires cannonballs from afar', desc: 'Sets up where it stops and fires cannonballs far, with splash. Can\'t hit flyers or anything close.' },
  bastion: { hot: 'B', what: 'Shoots down flyers', desc: 'The answer to flyers, and it hits the ground too. Weak against infantry.' },
  rider: { hot: 'E', what: 'Raids workers, fast', desc: 'Fast, raids workers. Faster after Horseshoes. Light armor: falls fast under ranged fire.' },
  knight: { hot: 'N', what: 'Charges in heavy armor', desc: 'Fast and tough in heavy armor, hits hard up close. Can\'t hit flyers.' },
  // the Expedition (`vael`)
  lumen: { hot: 'G', what: 'Mines gold, builds, repairs', desc: 'Mines gold. Builds, staying at each building until it stands, and repairs buildings. Goes anywhere.' },
  scythe: { hot: 'N', what: 'Fast, escorts and defends', desc: 'Fast, with a light gun: catches raiders and escorts. Can\'t hit flyers. Weak against infantry in numbers. Needs signal: works only inside the Data center\'s or an Uplink\'s coverage.' },
  prism: { hot: 'L', what: 'Fights up close, hired', desc: 'Cheap and quick to field. Fights up close, ground only. Weak against armor. Takes a hired place. Fights anywhere.' },
  monolith: { hot: 'C', what: 'Fires rockets on the move', desc: 'Long-range rockets that hit an area. Fires while moving; can\'t hit what is close or flying, and sees no farther than others: it needs spotters. Needs signal: works only inside the Data center\'s or an Uplink\'s coverage.' },
  shrike: { hot: 'E', what: 'Swarms, fast and small', desc: `A small, fast attack drone: weak alone, dangerous in a swarm. Fragile. Hits ground and air. Faster after Overclock. Needs signal: works only inside the Data center's or an Uplink's coverage.` },
  halo: { hot: 'T', desc: 'Mends nearby allies, even under fire.' },
  umbra: { hot: 'U', what: 'Elite, strikes from range', desc: 'Tough and armored, with a long reach; hits ground and air. Costly. Needs signal: works only inside the Data center\'s or an Uplink\'s coverage.' },
  bruiser: { hot: 'B', what: 'Holds the front line', desc: 'The toughest on foot. Fights up close, ground only. Slow, and weak against heavy armor. Takes two hired places. Fights anywhere.' },
};
// ("Needs a X." is added from the tables, so a description never names its requirement itself.)
const BLDG_TEXT = {
  core: { hot: 'L', what: 'Trains Villagers, stores gold', desc: 'Trains Villagers and stores gold. +20 population.' },
  depot: { hot: 'W', what: 'Supplies +8 population', desc: '+8 population.' },
  // (the Market: its verb, `verb` and `doing`, for the panel and the guide)
  extractor: { hot: 'X', what: 'Earns gold, no workers', verb: 'earns', doing: 'Earning', desc: 'Earns gold by itself, with no workers. One per Castle.' },
  barracks: { hot: 'C', what: 'Trains Guards and Archers', desc: 'Trains Guards and Archers.' },
  forge: { hot: 'K', what: 'Researches upgrades', desc: 'Researches Weapons, Armor and Shield Drill. Unlocks Knights, Cannons and Ballistas.' },
  factory: { hot: 'S', what: 'Builds siege and Balloon', desc: 'Builds Ballistas, Cannons and the Balloon.' },
  turret: { hot: 'O', what: 'Shoots ground and air', desc: 'Shoots ground and air.' },
  airfield: { hot: 'F', what: 'Trains Riders and Knights', desc: 'Trains Riders and Knights. Researches Horseshoes.' },
  // the Expedition
  conflux: { hot: 'T', what: 'Trains Bots, stores gold', desc: `Trains Bots and stores gold. +${D.buildings.conflux.supply} Power. Its small receiver gives coverage: machines work within ${D.radio.sources.conflux} tiles, and move faster there.` },
  spire: { hot: 'S', what: `Makes +${D.buildings.spire.supply} Power`, desc: `+${D.buildings.spire.supply} Power.` },
  siphon: { hot: 'I', what: 'Hires Sellswords, Bruisers', desc: `+${D.buildings.siphon.supply} hired places. Hires Sellswords, and Bruisers once a Lab stands. Build as many as you like.` },
  kiln: { hot: 'C', what: 'Builds Buggies and Drones', desc: 'Builds Buggies, and Drones once a Lab stands.' },
  loom: { hot: 'G', what: 'Researches upgrades', desc: 'Researches Weapons, Armor, Overclock and Better drills. Unlocks Drones, Bruisers and the Uplink.' },
  ward: { hot: 'A', what: 'Early defense, ground and air', desc: 'Early defense against ground and air.' },
  uplink: { hot: 'U', what: 'Coverage for machines, opens Portal', desc: `A large dish that extends the signal's range. Coverage: machines work within ${D.radio.sources.uplink} tiles, and move faster there. Unlocks the Portal.` },
  eclipse: { hot: 'D', what: 'Trains Androids and Rovers', desc: 'Trains Androids and Rovers, while an Uplink stands. Only one.' },
};
const UPGRADE_TEXT = { weapons: { hot: 'W' }, armor: { hot: 'L', desc: '+1 armor per level for all units.' }, shields: { hot: 'H', desc: 'Shields soak 1 more damage of every hit per level.' },
  afterburners: { hot: 'T' }, slipstream: { hot: 'F' }, entrenching: { hot: 'S' },
  drills: { hot: 'D', desc: `Bots carry more gold a trip: ${D.consts.drill_load[1]} more, ${D.consts.drill_load[2]} at level 2.` } };

const merge = (data, text) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { ...v, ...text[k] }]));
/** Units and buildings, in the sim's kind order (the snapshot sends kind indices). */
export const UNITS = merge(D.units, UNIT_TEXT);
export const BUILDINGS = merge(D.buildings, BLDG_TEXT);
// "Needs a X." comes from the tables, so it can never name the wrong building.
for (const d of [...Object.values(UNITS), ...Object.values(BUILDINGS)]) if (d.req) { const n = D.buildings[d.req].name; d.desc += ` Needs ${/^[AEIOU]/.test(n) ? 'an' : 'a'} ${n}.`; }
// (a building that holds Power while it stands says so, from the tables)
for (const d of Object.values(BUILDINGS)) if (d.uses) d.desc += ` Uses ${d.uses} Power while it stands.`;
/** Extra damage per Weapons level, by unit or building type. */
export const UP_DMG = Object.fromEntries([...Object.entries(UNITS), ...Object.entries(BUILDINGS)].filter(([, d]) => d.weapon?.upDmg).map(([k, d]) => [k, d.weapon.upDmg]));
/** Team-wide upgrades; per level: cost [gold, 0], seconds. */
export const UPGRADES = merge(D.upgrades, UPGRADE_TEXT);
/** A team's levels of every upgrade with this effect ('weapons', 'armor'), added up (`levels`: G.upgrades[team]). */
export const effectLevel = (levels, effect) => Object.entries(UPGRADES).reduce((n, [k, u]) => n + (u.effect === effect ? levels?.[k] || 0 : 0), 0);
/** The playable sides: headquarters, worker and the Build list's basic and advanced pages. */
export const FACTIONS = D.factions;
/** A side's own kinds (`f`: a FACTIONS entry): its buildings and the units they train. */
export const kindsOf = (f) => { const b = [f.hq, ...f.buildBasic, ...f.buildAdvanced]; return new Set([...b, ...b.flatMap(k => BUILDINGS[k].trains || [])]); };
/** Upgrade `k`'s words for side `f`. Weapons, which both races research, names that side's own weapons only. */
export const upgradeDesc = (k, f) => k !== 'weapons' ? UPGRADES[k].desc : 'More damage per level: ' + Object.entries(UP_DMG).filter(([t]) => kindsOf(f).has(t))
  .map(([t, n]) => `${(UNITS[t] || BUILDINGS[t]).name} +${n}${UNITS[t]?.light?.upDmg ? ` (light gun +${UNITS[t].light.upDmg})` : ''}`).join(', ') + '.';
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
  if (u.effect === 'speed') u.desc = `${plural(UNITS[u.of].name)} move ${Math.round((TECH_SPEED - 1) * 100)}% faster.`;
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
