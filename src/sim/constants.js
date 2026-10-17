// Game data. Everything the balance of the game depends on lives here.
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
  harvester: { name: 'Harvester', cost: [50, 0], supply: 1, hp: 40, armor: 0, speed: 96, range: 0.6, dmg: 4, cd: 1, sight: 7, r: 9, build: 12, hot: 'H', melee: true, desc: 'Mines shards and ether. Builds structures.' },
  trooper: { name: 'Trooper', cost: [50, 0], supply: 1, hp: 48, armor: 0, speed: 92, range: 4.5, dmg: 7, cd: 0.8, sight: 8, r: 9, build: 15, hot: 'T', proj: 'bolt', desc: 'Rifle infantry. Cheap and quick.' },
  vanguard: { name: 'Vanguard', cost: [125, 75], supply: 3, hp: 170, armor: 2, speed: 68, range: 6, dmg: 30, cd: 1.7, sight: 9, r: 14, build: 28, hot: 'V', proj: 'shell', desc: 'Heavy walker. Long range, thick plate.' },
};

export const BUILDINGS = {
  core: { name: 'Command Core', cost: [400, 0], w: 4, h: 4, hp: 1300, armor: 2, supply: 10, build: 75, sight: 10, trains: ['harvester'], hot: 'C', dropoff: true, desc: 'Trains Harvesters. Resource drop-off. +10 supply.' },
  depot: { name: 'Supply Depot', cost: [100, 0], w: 2, h: 2, hp: 360, armor: 1, supply: 8, build: 22, sight: 5, hot: 'D', desc: '+8 supply.' },
  extractor: { name: 'Ether Extractor', cost: [75, 0], w: 2, h: 2, hp: 420, armor: 1, build: 25, sight: 5, hot: 'E', onVent: true, desc: 'Build on an ether vent. Harvesters mine ether from it.' },
  barracks: { name: 'Barracks', cost: [150, 0], w: 3, h: 3, hp: 720, armor: 1, build: 40, sight: 7, trains: ['trooper'], hot: 'B', desc: 'Trains Troopers.' },
  forge: { name: 'War Forge', cost: [150, 100], w: 3, h: 3, hp: 820, armor: 1, build: 45, sight: 7, trains: ['vanguard'], hot: 'F', req: 'barracks', desc: 'Trains Vanguards. Requires Barracks.' },
  turret: { name: 'Sentinel Turret', cost: [100, 0], w: 2, h: 2, hp: 320, armor: 1, build: 20, sight: 9, hot: 'R', req: 'barracks', range: 7, dmg: 18, cd: 1.1, proj: 'bolt', desc: 'Static defense. Requires Barracks.' },
};

/** Order the Build command card lists structures in. */
export const BUILD_ORDER = ['depot', 'barracks', 'extractor', 'forge', 'turret', 'core'];

/** AI opponent tuning per difficulty. first/gap: seconds before the first wave and between waves. */
export const DIFF = [
  { name: 'Easy', income: 0.75, wave: 5, waveGrow: 2, harv: 10, rax: 1, first: 240, gap: 75 },
  { name: 'Normal', income: 1.0, wave: 7, waveGrow: 3, harv: 13, rax: 2, first: 170, gap: 60 },
  { name: 'Hard', income: 1.35, wave: 9, waveGrow: 4, harv: 16, rax: 3, first: 120, gap: 45 },
];

/** Top-left tile of each team's starting Command Core. Index = team. */
export const BASES = [{ x: 9, y: 54 }, { x: 54, y: 9 }];
