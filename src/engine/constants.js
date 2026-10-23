// Game data as the client sees it (names, costs, sizes, hotkeys, descriptions). The rules use the copy in
// crates/endfall-sim/src/data.rs; test/engine.test.js checks that the two agree.
// Costs are [shards, ether]. Distances are in tiles unless named otherwise; speeds in px/s.

export const TILE = 32;
export const MW = 64;
export const MH = 64;
export const WW = MW * TILE;
export const WH = MH * TILE;
/** Fixed simulation tick, seconds. The sim only ever advances by this. */
export const DT = 1 / 30;

export const PLAYER = 0;
export const ENEMY = 1;

export const UNITS = {
  harvester: { name: 'Harvester', cost: [50, 0], supply: 1, hp: 40, armor: 0, speed: 96, range: 0.6, dmg: 4, dmgAir: 0, cd: 1, sight: 7, r: 9, build: 12, hot: 'H', melee: true, desc: 'Mines shards and ether. Builds structures.' },
  trooper: { name: 'Trooper', cost: [50, 0], supply: 1, hp: 48, armor: 0, speed: 92, range: 4.5, dmg: 7, dmgAir: 7, cd: 0.8, sight: 8, r: 9, build: 15, hot: 'T', proj: 'bolt', bio: true, desc: 'Rifle infantry. Cheap and quick; shoots ground and air.' },
  vanguard: { name: 'Vanguard', cost: [125, 75], supply: 3, hp: 170, armor: 2, speed: 68, range: 6, dmg: 30, dmgAir: 0, cd: 1.7, sight: 9, r: 14, build: 28, hot: 'V', proj: 'shell', req: 'forge', desc: 'Heavy walker. Long range, thick plate; shells splash onto nearby ground units. Cannot hit flyers. Requires War Forge.' },
  lancer: { name: 'Lancer', cost: [75, 25], supply: 1, hp: 60, armor: 0, speed: 88, range: 6, dmg: 5, dmgAir: 30, cd: 1.2, sight: 9, r: 9, build: 18, hot: 'L', proj: 'missile', bio: true, desc: 'Anti-air infantry. Missiles shred flyers, weak against the ground.' },
  medic: { name: 'Medic', cost: [40, 20], supply: 1, hp: 45, armor: 0, speed: 90, range: 0, dmg: 0, dmgAir: 0, cd: 1, sight: 8, r: 9, build: 20, hot: 'M', bio: true, heal: 14, req: 'forge', desc: 'Heals nearby infantry. Unarmed. Requires War Forge.' },
  wasp: { name: 'Wasp', cost: [100, 60], supply: 2, hp: 100, armor: 0, speed: 150, range: 3, dmg: 9, dmgAir: 0, cd: 0.7, sight: 9, r: 10, build: 24, hot: 'W', proj: 'bolt', air: true, desc: 'Fast gunship. Flies over cliffs and buildings, strafes the ground.' },
  observer: { name: 'Observer', cost: [25, 25], supply: 1, hp: 40, armor: 0, speed: 175, range: 0, dmg: 0, dmgAir: 0, cd: 1, sight: 10, r: 8, build: 14, hot: 'O', air: true, desc: 'Cheap flying scout. Unarmed and fast; sees far and flies over cliffs.' },
};

export const BUILDINGS = {
  core: { name: 'Command Core', cost: [400, 0], w: 4, h: 4, hp: 1300, armor: 2, supply: 10, build: 75, sight: 10, trains: ['harvester'], hot: 'C', dropoff: true, desc: 'Trains Harvesters. Resource drop-off. +10 supply.' },
  depot: { name: 'Supply Depot', cost: [100, 0], w: 2, h: 2, hp: 360, armor: 1, supply: 8, build: 22, sight: 5, hot: 'D', desc: '+8 supply.' },
  extractor: { name: 'Ether Extractor', cost: [75, 0], w: 2, h: 2, hp: 420, armor: 1, build: 25, sight: 5, hot: 'E', onVent: true, desc: 'Build on an ether vent. Harvesters mine ether from it.' },
  barracks: { name: 'Barracks', cost: [150, 0], w: 3, h: 3, hp: 720, armor: 1, build: 40, sight: 7, trains: ['trooper', 'lancer', 'medic', 'vanguard'], hot: 'B', desc: 'Trains Troopers, Lancers, Medics and Vanguards (Medics and Vanguards need a War Forge).' },
  forge: { name: 'War Forge', cost: [150, 100], w: 3, h: 3, hp: 820, armor: 1, build: 45, sight: 7, trains: [], hot: 'F', req: 'barracks', desc: 'Researches weapon and armor upgrades; unlocks Medics and Vanguards at the Barracks. Requires Barracks.' },
  turret: { name: 'Sentinel Turret', cost: [100, 0], w: 2, h: 2, hp: 320, armor: 1, build: 20, sight: 9, hot: 'R', req: 'barracks', range: 7, dmg: 18, dmgAir: 26, cd: 1.1, proj: 'bolt', desc: 'Static defense against ground and air. Requires Barracks.' },
  airfield: { name: 'Airfield', cost: [150, 100], w: 3, h: 3, hp: 760, armor: 1, build: 50, sight: 8, trains: ['wasp', 'observer'], hot: 'A', req: 'forge', desc: 'Trains Wasps and Observers. Requires War Forge.' },
};

/** Team-wide upgrades researched at the War Forge; per level: shards = ether cost, seconds. */
export const UPGRADES = {
  weapons: { name: 'Weapons', hot: 'W', cost: [100, 175, 250], time: [60, 75, 90], desc: 'More damage for every weapon (Trooper +1, Lancer +2, Vanguard +3, Wasp +1, Turret +2 per level).' },
  armor: { name: 'Armor', hot: 'E', cost: [100, 175, 250], time: [60, 75, 90], desc: '+1 armor per level for all units.' },
};
/** Extra damage per Weapons level, by unit or building type. */
export const UP_DMG = { trooper: 1, lancer: 2, vanguard: 3, wasp: 1, turret: 2 };

/** Order the Build command card lists structures in. */
export const BUILD_ORDER = ['depot', 'barracks', 'extractor', 'turret', 'forge', 'airfield', 'core']; // the Build menu: basics on the first row, tech and expansion on the second

/** AI opponent tuning per difficulty. first/gap: seconds before the first wave and between waves. */
export const DIFF = [
  { name: 'Easy', income: 0.75, wave: 5, waveGrow: 2, harv: 10, rax: 1, first: 240, gap: 75 },
  { name: 'Normal', income: 1.0, wave: 7, waveGrow: 3, harv: 13, rax: 2, first: 170, gap: 60 },
  { name: 'Hard', income: 1.35, wave: 9, waveGrow: 4, harv: 16, rax: 3, first: 120, gap: 45 },
];

/** Top-left tile of each team's starting Command Core. Index = team. */
