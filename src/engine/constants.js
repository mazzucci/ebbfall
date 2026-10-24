// Game data as the client sees it. Every number comes from the Rust sim (crates/endfall-sim/src/data.rs, exported
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

export const PLAYER = D.consts.player;
export const ENEMY = D.consts.enemy;

/** Hotkeys and descriptions, by kind key (the numbers and names are the sim's). */
const UNIT_TEXT = {
  harvester: { hot: 'H', desc: 'Mines shards and ether. Builds structures.' },
  trooper: { hot: 'T', desc: 'Rifle infantry. Cheap and quick; shoots ground and air.' },
  vanguard: { hot: 'V', desc: 'Heavy walker. Long range, thick plate; shells splash onto nearby ground units. Cannot hit flyers. Requires Foundry.' },
  lancer: { hot: 'L', desc: 'Anti-air infantry. Missiles shred flyers, weak against the ground.' },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed. Requires Foundry.' },
  wasp: { hot: 'W', desc: 'Fast gunship. Flies over cliffs and buildings, strafes the ground.' },
  observer: { hot: 'O', desc: 'Cheap flying scout. Unarmed and fast; sees far and flies over cliffs.' },
};
const BLDG_TEXT = {
  core: { hot: 'C', desc: 'Trains Harvesters. Resource drop-off. +10 supply.' },
  depot: { hot: 'D', desc: '+8 supply.' },
  extractor: { hot: 'E', desc: 'A drilling rig built on an ether vent. Harvesters mine ether from it.' },
  barracks: { hot: 'G', desc: 'Trains Troopers, Lancers, Medics and Vanguards (Medics and Vanguards need a Foundry).' },
  forge: { hot: 'F', desc: 'Researches weapon and armor upgrades; unlocks Medics and Vanguards at the Garrison. Requires Garrison.' },
  turret: { hot: 'T', desc: 'Static defense against ground and air. Requires Garrison.' },
  airfield: { hot: 'A', desc: 'Trains Wasps and Observers. Requires Foundry.' },
};
const UPGRADE_TEXT = { weapons: { hot: 'W' }, armor: { hot: 'E', desc: '+1 armor per level for all units.' } };
const DIFF_NAMES = ['Easy', 'Medium', 'Hard'];

const merge = (data, text) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { ...v, ...text[k] }]));
/** Units and buildings, in the sim's kind order (the snapshot sends kind indices). */
export const UNITS = merge(D.units, UNIT_TEXT);
export const BUILDINGS = merge(D.buildings, BLDG_TEXT);
/** Extra damage per Weapons level, by unit or building type. */
export const UP_DMG = Object.fromEntries([...Object.entries(UNITS), ...Object.entries(BUILDINGS)].filter(([, d]) => d.upDmg).map(([k, d]) => [k, d.upDmg]));
/** Team-wide upgrades; per level: shards = ether cost, seconds. */
export const UPGRADES = merge(D.upgrades, UPGRADE_TEXT);
UPGRADES.weapons.desc = 'More damage for every weapon (' + Object.entries(UP_DMG).map(([k, n]) => `${(UNITS[k] || BUILDINGS[k]).name} +${n}`).join(', ') + ' per level).';
/** The playable sides: headquarters, worker and the Build list's basic and advanced pages. */
export const FACTIONS = D.factions;
/** The snapshot record layouts (field names per record) and code names, from crates/endfall-sim/src/snapshot.rs. */
export const SCHEMA = D.schema;
/** AI opponent tuning per difficulty. first/gap: seconds before the first wave and between waves. */
export const DIFF = D.diff.map((d, i) => ({ name: DIFF_NAMES[i], ...d }));
