// Game data as the client sees it. Every number comes from the Rust sim (crates/endfall-sim/src/data/, exported
// into pkg/data.js by `npm run build:wasm`); this file adds only what the player reads: hotkeys and descriptions.
// Costs are [shards, ether]. Distances are in tiles unless named otherwise; speeds in px/s.
import D from './pkg/data.js';
import { DIFF_NAMES } from './util.js';
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
/** Seconds a unit takes to warp in at a power field (the Vael). */
export const UNIT_WARP = D.consts.unit_warp;
/** A speed tech's multiple for its flyer. */
export const TECH_SPEED = D.consts.tech_speed;
/** A construction tech's multiple for its side's building rate. */
export const TECH_BUILD = D.consts.tech_build;

/** Hotkeys and descriptions, by kind key (the numbers and names are the sim's). A description says what the unit does,
 *  never which enemy units it beats or loses to: players find the counters themselves (the duels of
 *  tests/gameplay/balance.rs keep the design's counter loops). */
const UNIT_TEXT = {
  harvester: { hot: 'H', desc: 'Mines shards and ether. Builds structures.' },
  trooper: { hot: 'T', desc: 'Rifle infantry. Cheap and quick; shoots ground and air.' },
  vanguard: { hot: 'V', desc: 'Heavy walker. Long range, thick plate; shells splash onto nearby ground units. Cannot hit flyers.' },
  lancer: { hot: 'L', desc: 'Anti-air infantry. Missiles shred flyers, weak against the ground.' },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed.' },
  wasp: { hot: 'W', desc: 'Fast gunship. Flies over cliffs and buildings, strafes the ground. Can cloak (Cloaking Field).' },
  observer: { hot: 'O', desc: 'Cheap flying scout. Unarmed and fast; sees far and flies over cliffs. Cloaked: unseen unless detected. Detects cloaked units.' },
  siegeTank: { hot: 'S', desc: 'Tracked artillery. Deployed, its siege gun outranges everything on the ground and its shells splash hard, but nothing inside its blind ring can be hit, nor flyers, and it fires as far as your side can see. On its tracks it has only a light gun. Behind a line it breaks massed infantry and towers; alone it is easy prey.' },
  bastion: { hot: 'B', desc: 'Capital gunship. Slow and heavily armoured; its cannon splashes the ground and reaches flyers. Hunted by anti-air.' },
  // the Vael
  lumen: { hot: 'L', desc: 'Mines shards and ether. Plants Vael structures.' },
  scythe: { hot: 'S', desc: 'Hover-knight with ceramic blades. Fights up close: it has to catch its target first. Cannot hit flyers.' },
  prism: { hot: 'P', desc: 'Ring of crystal that fires lances at ground and air: the Vael all-rounder and their answer to flyers.' },
  monolith: { hot: 'M', desc: 'Slow siege slab. Long range; its shots splash onto nearby ground units. Cannot hit flyers.' },
  shrike: { hot: 'H', desc: 'Fast crescent flyer. Raids workers and hunts other flyers. Can veil itself (Veil Weave).' },
  sovereign: { hot: 'V', desc: 'Capital barge. A great shell gliding low over the ground, its beam splashing the ground from far off. Cannot hit flyers.' },
  halo: { hot: 'A', desc: 'Unarmed hovering ring that mends the shields of nearby Vael, even under fire. Sees far. Detects cloaked units.' },
};
const BLDG_TEXT = {
  core: { hot: 'C', desc: 'Trains Harvesters. Resource drop-off. +10 supply.' },
  depot: { hot: 'D', desc: '+8 supply.' },
  extractor: { hot: 'E', desc: 'A drilling rig built on an ether vent. Harvesters mine ether from it.' },
  barracks: { hot: 'G', desc: 'Trains Troopers, Lancers and Medics (Medics need a Foundry).' },
  forge: { hot: 'F', desc: 'Researches weapon and armor upgrades, Entrenching, Cloaking Field and Rapid Construction; unlocks Medics at the Garrison and vehicles at the Factory.' },
  factory: { hot: 'R', desc: 'Builds vehicles: Vanguards and Siege Tanks (both need a Foundry).' },
  turret: { hot: 'T', desc: 'Static defense against ground and air. Detects cloaked units.' },
  airfield: { hot: 'A', desc: 'Trains Wasps, Observers and the Bastion capital gunship.' },
  // the Vael
  conflux: { hot: 'C', desc: 'The Vael heart. Trains Lumens. Resource drop-off. +10 supply.' },
  spire: { hot: 'S', desc: '+8 supply.' },
  siphon: { hot: 'E', desc: 'Grown on an ether vent. Lumens draw ether from it.' },
  kiln: { hot: 'K', desc: 'Fires Scythes, Prisms, Halos and Monoliths (Halos and Monoliths need a Loom). With its rally point in a power field, they warp in there.' },
  loom: { hot: 'L', desc: 'Weaves the Weapons and Shields upgrades, Overcharge Core and Veil Weave; unlocks Monoliths.' },
  ward: { hot: 'W', desc: 'Crystal sentinel against ground and air. Detects cloaked units.' },
  zenith: { hot: 'Z', desc: 'Launches Shrikes and raises the Sovereign capital barge. With its rally point in a power field, they warp in there.' },
};
const UPGRADE_TEXT = { weapons: { hot: 'W' }, armor: { hot: 'E', desc: '+1 armor per level for all units.' }, shields: { hot: 'S', desc: 'Shields soak 1 more damage of every hit per level (units and buildings).' },
  entrenching: { hot: 'D' }, afterburners: { hot: 'F' }, overchargeCore: { hot: 'O' }, slipstream: { hot: 'F' }, cloakingField: { hot: 'K' }, veilWeave: { hot: 'V' }, rapidConstruction: { hot: 'B' } };

const merge = (data, text) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { ...v, ...text[k] }]));
/** Units and buildings, in the sim's kind order (the snapshot sends kind indices). */
export const UNITS = merge(D.units, UNIT_TEXT);
export const BUILDINGS = merge(D.buildings, BLDG_TEXT);
// "Requires X." comes from the tables, so it can never name the wrong building.
for (const d of [...Object.values(UNITS), ...Object.values(BUILDINGS)]) if (d.req) d.desc += ` Requires ${D.buildings[d.req].name}.`;
/** Extra damage per Weapons level, by unit or building type. */
export const UP_DMG = Object.fromEntries([...Object.entries(UNITS), ...Object.entries(BUILDINGS)].filter(([, d]) => d.weapon?.upDmg).map(([k, d]) => [k, d.weapon.upDmg]));
/** Team-wide upgrades; per level: cost [shards, ether], seconds. */
export const UPGRADES = merge(D.upgrades, UPGRADE_TEXT);
/** A team's levels of every upgrade with this effect ('weapons', 'armor'), added up (`levels`: G.upgrades[team]). */
export const effectLevel = (levels, effect) => Object.entries(UPGRADES).reduce((n, [k, u]) => n + (u.effect === effect ? levels?.[k] || 0 : 0), 0);
/** The playable sides: headquarters, worker and the Build list's basic and advanced pages. */
export const FACTIONS = D.factions;
/** A side's own kinds (`f`: a FACTIONS entry): its buildings and the units they train. */
export const kindsOf = (f) => { const b = [f.hq, ...f.buildBasic, ...f.buildAdvanced]; return new Set([...b, ...b.flatMap(k => BUILDINGS[k].trains || [])]); };
/** Upgrade `k`'s words for side `f`. Weapons, which both races research, names that side's own weapons only. */
export const upgradeDesc = (k, f) => k !== 'weapons' ? UPGRADES[k].desc : 'More damage for every weapon (' + Object.entries(UP_DMG).filter(([t]) => kindsOf(f).has(t))
  .map(([t, n]) => `${(UNITS[t] || BUILDINGS[t]).name} +${n}${UNITS[t]?.light?.upDmg ? `, its light gun +${UNITS[t].light.upDmg}` : ''}`).join(', ') + ' per level).';
const ABILITY_TEXT = {
  stim: { hot: 'T', desc: 'Fire 50% faster and run faster for 10 s. Costs 10 health.' },
  entrench: { hot: 'E', desc: 'Dig in: +3 range, but cannot move (2 s to dig in or pack up). Tap again, or order a move, to pack up.' },
  blink: { hot: 'F', desc: 'Hop 4 tiles towards the target (or straight ahead).' },
  overcharge: { hot: 'O', desc: 'Fire twice as fast for 6 s.' },
  cloak: { hot: 'C', desc: 'Cloaked for 12 s: unseen and untouchable except near a detector.' },
  veil: { hot: 'C', desc: 'Veiled for 12 s: unseen and untouchable except near a detector.' },
  deploy: { hot: 'D', desc: 'Deployed, it fires its siege gun (3 s to deploy or pack up, neither moving nor firing meanwhile); it deploys by itself when it reaches its target. On its tracks it has only a light gun. Tap again, or order a move, to pack up.' },
};
/** One-tap unit abilities (self-cast or toggle), with their hotkeys and descriptions. */
export const ABILITIES = merge(D.abilities, ABILITY_TEXT);
// A tech's words come from what it does: the ability it unlocks (and who has it), the flyer it speeds up.
for (const u of Object.values(UPGRADES)) {
  if (u.effect === 'unlock') u.desc = `Unlocks ${ABILITIES[u.of].name} for ${Object.values(UNITS).filter(d => (d.abilities || []).includes(u.of)).map(d => d.name + 's').join(' and ')}.`;
  if (u.effect === 'speed') u.desc = `${UNITS[u.of].name}s fly ${Math.round((TECH_SPEED - 1) * 100)}% faster.`;
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
