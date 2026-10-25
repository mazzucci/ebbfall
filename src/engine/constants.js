// Game data as the client sees it. Every number comes from the Rust sim (crates/endfall-sim/src/data/, exported
// into pkg/data.js by `npm run build:wasm`); this file adds only what the player reads: hotkeys and descriptions.
// Costs are [shards, ether]. Distances are in tiles unless named otherwise; speeds in px/s.
import D from './pkg/data.js';
if (!D.schema) throw new Error('src/engine/pkg/ is stale: run npm run build:wasm');

export const TILE = D.consts.tile;
export const MW = D.consts.mw;
export const MH = D.consts.mh;
export const WW = MW * TILE;
export const WH = MH * TILE;
/** Fixed simulation tick, seconds. The sim only ever advances by this. */
export const DT = D.consts.dt;

/** The seats a menu game deals: the player and the scripted opponent (tests and tools; the client itself plays G.me). */
export const PLAYER = D.consts.player;
export const ENEMY = D.consts.enemy;
/** Seconds a unit takes to warp in at a power field (the Vael). */
export const UNIT_WARP = D.consts.unit_warp;

/** Hotkeys and descriptions, by kind key (the numbers and names are the sim's). A fighter's `strong`/`weak`: the kinds
 *  it beats, and is beaten by, in a cost-equal fight (measured with the duels of tests/gameplay/balance.rs). Whatever a
 *  fighter is strong against lists it as a weakness. */
const UNIT_TEXT = {
  harvester: { hot: 'H', desc: 'Mines shards and ether. Builds structures.' },
  trooper: { hot: 'T', desc: 'Rifle infantry. Cheap and quick; shoots ground and air.', strong: ['scythe', 'wasp'], weak: ['vanguard', 'sovereign'] },
  vanguard: { hot: 'V', desc: 'Heavy walker. Long range, thick plate; shells splash onto nearby ground units. Cannot hit flyers.', strong: ['trooper', 'prism'], weak: ['monolith', 'shrike', 'bastion'] },
  lancer: { hot: 'L', desc: 'Anti-air infantry. Missiles shred flyers, weak against the ground.', strong: ['wasp', 'shrike'], weak: ['trooper', 'scythe', 'prism', 'sovereign'] },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed.' },
  wasp: { hot: 'W', desc: 'Fast gunship. Flies over cliffs and buildings, strafes the ground.', strong: ['monolith', 'scythe'], weak: ['trooper', 'lancer', 'prism', 'shrike'] },
  observer: { hot: 'O', desc: 'Cheap flying scout. Unarmed and fast; sees far and flies over cliffs. Cloaked: unseen unless detected. Detects cloaked units.' },
  bastion: { hot: 'B', desc: 'Capital gunship. Slow and heavily armoured; its cannon splashes the ground and reaches flyers. Hunted by anti-air.', strong: ['vanguard', 'scythe', 'sovereign'], weak: ['lancer', 'prism', 'shrike'] },
  // the Vael
  lumen: { hot: 'L', desc: 'Mines shards and ether. Plants Vael structures.' },
  scythe: { hot: 'S', desc: 'Hover-knight with ceramic blades. Slower than a Trooper. Cannot hit flyers.', strong: ['lancer', 'harvester'], weak: ['trooper', 'wasp', 'bastion'] },
  prism: { hot: 'P', desc: 'Ring of crystal that fires lances at ground and air: the Vael all-rounder and their answer to flyers.', strong: ['wasp', 'lancer'], weak: ['trooper', 'vanguard', 'sovereign'] },
  monolith: { hot: 'M', desc: 'Slow siege slab. Outranges walkers; its shots splash onto nearby ground units. Cannot hit flyers.', strong: ['vanguard'], weak: ['wasp'] },
  shrike: { hot: 'H', desc: 'Fast crescent flyer. Raids workers and hunts gunships.', strong: ['wasp', 'vanguard'], weak: ['lancer', 'trooper'] },
  sovereign: { hot: 'V', desc: 'Capital walker. A towering tripod whose beam splashes the ground from far off. Cannot hit flyers.', strong: ['trooper', 'prism', 'lancer'], weak: ['wasp', 'bastion', 'shrike'] },
  halo: { hot: 'A', desc: 'Unarmed hovering ring that mends the shields of nearby Vael, even under fire. Sees far.' },
};
const BLDG_TEXT = {
  core: { hot: 'C', desc: 'Trains Harvesters. Resource drop-off. +10 supply.' },
  depot: { hot: 'D', desc: '+8 supply.' },
  extractor: { hot: 'E', desc: 'A drilling rig built on an ether vent. Harvesters mine ether from it.' },
  barracks: { hot: 'G', desc: 'Trains Troopers, Lancers, Medics and Vanguards (Medics and Vanguards need a Foundry).' },
  forge: { hot: 'F', desc: 'Researches weapon and armor upgrades; unlocks Medics and Vanguards at the Garrison.' },
  turret: { hot: 'T', desc: 'Static defense against ground and air. Detects cloaked units.' },
  airfield: { hot: 'A', desc: 'Trains Wasps, Observers and the Bastion capital gunship.' },
  // the Vael
  conflux: { hot: 'C', desc: 'The Vael heart. Trains Lumens. Resource drop-off. +10 supply.' },
  spire: { hot: 'S', desc: '+8 supply.' },
  siphon: { hot: 'E', desc: 'Grown on an ether vent. Lumens draw ether from it.' },
  kiln: { hot: 'K', desc: 'Fires Scythes, Prisms, Halos and Monoliths (Halos and Monoliths need a Loom). With its rally point in a power field, they warp in there.' },
  loom: { hot: 'L', desc: 'Weaves the Weapons and Shields upgrades; unlocks Monoliths and the Zenith.' },
  ward: { hot: 'W', desc: 'Crystal sentinel against ground and air. Detects cloaked units.' },
  zenith: { hot: 'Z', desc: 'Launches Shrikes and raises the Sovereign capital walker. With its rally point in a power field, they warp in there.' },
};
const UPGRADE_TEXT = { weapons: { hot: 'W' }, armor: { hot: 'E', desc: '+1 armor per level for all units.' }, shields: { hot: 'S', desc: 'Shields soak 1 more damage of every hit per level (units and buildings).' } };
const DIFF_NAMES = ['Easy', 'Medium', 'Hard'];

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
UPGRADES.weapons.desc = 'More damage for every weapon (' + Object.entries(UP_DMG).map(([k, n]) => `${(UNITS[k] || BUILDINGS[k]).name} +${n}`).join(', ') + ' per level).';
/** The playable sides: headquarters, worker and the Build list's basic and advanced pages. */
export const FACTIONS = D.factions;
const ABILITY_TEXT = {
  stim: { hot: 'T', desc: 'Fire 50% faster and run faster for 10 s. Costs 10 health.' },
  entrench: { hot: 'E', desc: 'Dig in: +3 range, but cannot move (2 s to dig in or pack up). Tap again, or order a move, to pack up.' },
  blink: { hot: 'F', desc: 'Hop 4 tiles towards the target (or straight ahead).' },
  overcharge: { hot: 'O', desc: 'Fire twice as fast for 6 s.' },
};
/** One-tap unit abilities (self-cast or toggle), with their hotkeys and descriptions. */
export const ABILITIES = merge(D.abilities, ABILITY_TEXT);
/** The snapshot record layouts (field names per record) and code names, from crates/endfall-sim/src/snapshot.rs. */
export const SCHEMA = D.schema;
/** AI opponent tuning per difficulty. first/gap: seconds before the first wave and between waves. */
export const DIFF = D.diff.map((d, i) => ({ name: DIFF_NAMES[i], ...d }));
