// Game data as the client sees it. Every number comes from the Rust sim (crates/endfall-sim/src/data/, exported
// into pkg/data.js by `npm run build:wasm`); this file adds only what the player reads: hotkeys and descriptions.
// Costs are [gold, 0] (the second slot was ether, gone with the conversion). Distances are in tiles unless named otherwise; speeds in px/s.
import D from './pkg/data.js';
import { DIFF_NAMES, plural } from './util.js';
if (!D.schema) throw new Error('src/engine/pkg/ is stale: run npm run build:wasm');

export const TILE = D.consts.tile;
/** A two-seat map's size in tiles: the menu's maps (a game's own size is MW x MH in core.js, set when it starts). */
export const DUEL_MW = D.consts.mw;
export const DUEL_MH = D.consts.mh;
/** Fixed simulation tick, seconds. The sim only ever advances by this. */
export const DT = D.consts.dt;

/** The seats a menu game deals: the player and the scripted opponent (tests and tools; the client itself plays G.me). */
export const PLAYER = D.consts.player;
export const ENEMY = D.consts.enemy;
/** A speed tech's multiple for its unit. */
export const TECH_SPEED = D.consts.tech_speed;
/** A construction tech's multiple for its side's building rate. */
export const TECH_BUILD = D.consts.tech_build;

/** Hotkeys, descriptions and `what` (a short line, a verb first and about 25 characters, under the health bar on the selection console;
 *  none for a kind players cannot get),
 *  by kind key (the numbers and names are the sim's). A description says what the unit does;
 *  its partner and its killer are a line of their own (`PAIRS`), the counters made visible. */
const UNIT_TEXT = {
  // the Kingdom (sim race `humans`)
  harvester: { hot: 'G', what: 'Mines gold, builds, repairs', desc: 'Mines gold. Builds and repairs.' },
  trooper: { hot: 'K', what: 'Holds the line, cheaply', desc: 'Spearman, cheap and steady. Fights up close, ground only. Can Brace (no moving, more armor) after Shield Drill.' },
  lancer: { hot: 'H', what: 'Shoots ground and air', desc: 'Shoots ground and air, hits flyers hard. What it hits slows down for 3 s.' },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed.' },
  observer: { hot: 'S', what: 'Scouts far, unarmed', desc: 'Unarmed. Slow, sees far, floats over cliffs.' },
  siegeTank: { hot: 'A', what: 'Hurls stones from afar', desc: 'Sets up where it stops and hurls stones far, with splash. Can\'t hit anything close.' },
  bastion: { hot: 'B', what: 'Shoots down flyers', desc: 'Bolt thrower on wheels: the answer to flyers, and it hits the ground too.' },
  rider: { hot: 'E', what: 'Raids workers, fast', desc: 'Fast light cavalry that raids workers. Faster after Horseshoes.' },
  knight: { hot: 'N', what: 'Charges in heavy armor', desc: 'Heavy cavalry in plate: tough, hits hard up close.' },
  // the Expedition (`vael`)
  lumen: { hot: 'G', what: 'Mines gold, builds', desc: 'Mines gold. Stays at each building until it stands. A machine.' },
  scythe: { hot: 'N', what: 'Raids workers, fast', desc: 'Fast raider with a light gun. Can\'t hit flyers. A machine.' },
  prism: { hot: 'L', what: 'Shoots ground and air', desc: 'Hired local mercenary with a rifle. Shoots ground and air: the Expedition\'s line and its answer to flyers.' },
  monolith: { hot: 'C', what: 'Fires rockets on the move', desc: 'Rocket artillery: long range, fires on the move, splashes nearby ground units. Can\'t hit flyers. A machine.' },
  shrike: { hot: 'E', what: 'Flies fast, raids workers', desc: 'Fast low flyer. Hits ground and air, raids workers. Stays near radio range. Faster after Overclock. A machine.' },
  halo: { hot: 'T', desc: 'Mends nearby allies, even under fire.' },
  umbra: { hot: 'U', what: 'Strikes hard from range', desc: 'Elite soldier: long reach, hits hard, ground and air.' },
  bruiser: { hot: 'B', what: 'Tanks hits, can\'t hit flyers', desc: 'Hired local mercenary with a riot shield and a heavy gun: the toughest on foot. Can\'t hit flyers.' },
};
// ("Needs a X." is added from the tables, so a description never names its requirement itself.)
const BLDG_TEXT = {
  core: { hot: 'L', what: 'Trains Villagers, stores gold', desc: 'Trains Villagers and stores gold. +20 population.' },
  depot: { hot: 'W', what: 'Supplies +8 population', desc: '+8 population.' },
  // (the Market: its verb, `verb` and `doing`, for the panel and the guide)
  extractor: { hot: 'X', what: 'Earns gold, no workers', verb: 'earns', doing: 'Earning', desc: 'Earns gold by itself, with no workers. One per Castle.' },
  barracks: { hot: 'C', what: 'Trains Guards and Archers', desc: 'Trains Guards and Archers.' },
  forge: { hot: 'K', what: 'Researches upgrades', desc: 'Researches Weapons, Armor, Shield Drill and Master Builders. Unlocks Knights, Trebuchets and Ballistas.' },
  factory: { hot: 'S', what: 'Builds siege and Balloon', desc: 'Builds Ballistas, Trebuchets and the Balloon.' },
  turret: { hot: 'O', what: 'Shoots ground and air', desc: 'Archers on a tower. Shoots ground and air.' },
  airfield: { hot: 'F', what: 'Trains Riders and Knights', desc: 'Trains Riders and Knights. Researches Horseshoes.' },
  // the Expedition
  conflux: { hot: 'T', what: 'Trains Bots, stores gold', desc: 'Trains Bots and stores gold. +20 population. Radio range 18 tiles.' },
  spire: { hot: 'S', what: 'Supplies +8 population', desc: '+8 population.' },
  siphon: { hot: 'I', what: 'Hires Sellswords, Bruisers', desc: 'Hires Sellswords, and Bruisers once a Lab stands. Build as many as you like.' },
  kiln: { hot: 'C', what: 'Builds Buggies, Rovers, Drones', desc: 'Builds Buggies, Rovers and Drones.' },
  loom: { hot: 'G', what: 'Researches upgrades', desc: 'Researches Weapons, Armor and Overclock. Unlocks Rovers and Bruisers.' },
  ward: { hot: 'A', what: 'Powers machines nearby', desc: 'Guns on a mast. Shoots ground and air. Radio range 12 tiles.' },
  eclipse: { hot: 'D', what: 'Trains Marines', desc: 'Trains Marines.' },
};
const UPGRADE_TEXT = { weapons: { hot: 'W' }, armor: { hot: 'L', desc: '+1 armor per level for all units.' }, shields: { hot: 'H', desc: 'Shields soak 1 more damage of every hit per level.' },
  afterburners: { hot: 'T' }, slipstream: { hot: 'F' }, entrenching: { hot: 'S' }, rapidConstruction: { hot: 'A' } };

const merge = (data, text) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { ...v, ...text[k] }]));
/** Each fighting unit's partner (what it fights best beside) and killer (what beats it), from cost-equal
 *  duels (the re-theme's first numbers): one line in its train button's details (`pairLine`). Workers have none. Every killer is held by a
 *  cost-equal duel (crates/endfall-sim/tests/gameplay/balance.rs `every_units_killer_on_its_card_beats_it`). */
export const PAIRS = {
  trooper: ['lancer', 'monolith'], lancer: ['trooper', 'scythe'], siegeTank: ['knight', 'shrike'], bastion: ['trooper', 'prism'],
  rider: ['knight', 'umbra'], knight: ['siegeTank', 'shrike'], observer: ['siegeTank', 'shrike'],
  prism: ['monolith', 'knight'], scythe: ['prism', 'trooper'], umbra: ['prism', 'knight'], bruiser: ['prism', 'knight'],
  monolith: ['prism', 'siegeTank'], shrike: ['umbra', 'bastion'],
};
/** Units and buildings, in the sim's kind order (the snapshot sends kind indices). */
export const UNITS = merge(D.units, UNIT_TEXT);
/** A unit's partner and killer as one line ("Best with Archers. Beaten by Rovers."), or '' for a worker. */
export function pairLine(k) {
  const p = PAIRS[k];
  return p ? `Best with ${plural(UNITS[p[0]].name)}. Beaten by ${plural(UNITS[p[1]].name)}.` : '';
}
export const BUILDINGS = merge(D.buildings, BLDG_TEXT);
// "Needs a X." comes from the tables, so it can never name the wrong building.
for (const d of [...Object.values(UNITS), ...Object.values(BUILDINGS)]) if (d.req) { const n = D.buildings[d.req].name; d.desc += ` Needs ${/^[AEIOU]/.test(n) ? 'an' : 'a'} ${n}.`; }
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
 *  the Trebuchet's Deploy), which the unit uses by itself and which has no button or key. */
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
