// Game data as the client sees it. Every number comes from the Rust sim (crates/endfall-sim/src/data/, exported
// into pkg/data.js by `npm run build:wasm`); this file adds only what the player reads: hotkeys and descriptions.
// Costs are [salt, 0] (the second slot was ether, gone with the conversion). Distances are in tiles unless named otherwise; speeds in px/s.
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
/** The tower range (crates/endfall-sim/src/data/radio.rs): the unit kinds that need it (`machines`, a Set), what each
 *  source building gives (`sources`, tiles by kind), the speed a machine keeps out of it (`slow`) and the Drone's leash
 *  past its edge (`leash`, tiles). */
export const RADIO = { ...D.radio, machines: new Set(D.radio.machines) };

/** Hotkeys and descriptions, by kind key (the numbers and names are the sim's). A description says what the unit does;
 *  its partner and its killer are a line of their own (`PAIRS`), the counters made visible. */
const UNIT_TEXT = {
  // the Kingdom (sim race `humans`; display names stay the sim's until the words PR)
  harvester: { hot: 'G', desc: 'Mines salt. Builds structures and repairs them.' },
  trooper: { hot: 'K', desc: 'Spear infantry, cheap and steady. Fights up close, the ground only. Braces once Sandbags is researched.' },
  lancer: { hot: 'H', desc: 'Slow-firing archer whose shot reaches ground and air and hits flyers hard. What it hits moves at half speed and uses no ability for 3 s.' },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed.' },
  observer: { hot: 'S', desc: 'Unarmed flying scout. Slow, sees far, floats over cliffs.' },
  siegeTank: { hot: 'A', desc: 'Siege engine. Sets up by itself where it stops and hurls from afar with heavy splash, but not up close; it cannot fire on the move.' },
  bastion: { hot: 'B', desc: 'Bolt thrower on wheels: the answer to flyers, and its bolts reach the ground too, lighter.' },
  rider: { hot: 'E', desc: 'Fast light cavalry. Raids workers. Faster once Tailwind is researched.' },
  knight: { hot: 'N', desc: 'Heavy cavalry in plate: tough, and hits hard up close.' },
  // the Expedition (`vael`)
  lumen: { hot: 'G', desc: 'Mines salt. Builds structures, staying with each until it stands. A machine: slower out of range.' },
  scythe: { hot: 'N', desc: 'Fast raider vehicle with a light gun. Raids workers. Cannot hit flyers. A machine: slower out of range.' },
  prism: { hot: 'L', desc: 'Soldier for hire who fires at ground and air: the Expedition\'s line and its answer to flyers.' },
  monolith: { hot: 'C', desc: 'Rocket artillery: long range, fires on the move, and its rockets splash onto nearby ground units. Cannot hit flyers. A machine: slower out of range.' },
  shrike: { hot: 'E', desc: `Fast low flyer. Hits ground and air, raids workers. Faster once Spindrift is researched. A machine: slower out of range, and goes at most ${D.radio.leash} tiles past it.` },
  halo: { hot: 'T', desc: 'Unarmed. Mends nearby allies, even under fire.' },
  umbra: { hot: 'U', desc: 'Elite soldier: long reach, hits hard, ground and air.' },
  bruiser: { hot: 'B', desc: 'A hired local with a riot shield and a heavy gun: the toughest on foot. Cannot hit flyers.' },
};
const BLDG_TEXT = {
  core: { hot: 'L', desc: 'Trains Riggers. Salt drop-off. +20 population.' },
  depot: { hot: 'W', desc: '+8 population.' },
  // (the Market: its verb, `verb` and `doing`, for the panel and the guide)
  extractor: { hot: 'X', verb: 'earns', doing: 'Earning', desc: 'Built in your base: earns salt by itself, half a salt a second, with no workers. One per Lighthouse.' },
  barracks: { hot: 'C', desc: 'Trains Pickets and Harpooners.' },
  forge: { hot: 'K', desc: 'Researches Weapons, Plating, Sandbags and All Hands; unlocks Knights and the Slipway\'s machines.' },
  factory: { hot: 'S', desc: 'Builds the machines, Windjammers and Anchor Guns (both need a Workshop), and the Spyglass.' },
  turret: { hot: 'O', desc: 'Static defence against ground and air.' },
  airfield: { hot: 'F', desc: 'Trains Riders, and Knights (they need a Workshop). Researches Tailwind.' }, // ("Requires Excavator." added from the tables)
  // the Expedition
  conflux: { hot: 'T', desc: `Trains Glints. Salt drop-off. +20 population. Gives your machines range ${D.radio.sources.conflux} tiles around it.` },
  spire: { hot: 'S', desc: '+8 population.' },
  // (still on a mine shaft until the economy PR, which frees it of the shaft and its salt)
  siphon: { hot: 'I', desc: 'Recruits Lenses, and Bruisers (they need a Glasshouse). Build as many as you like, anywhere.' },
  kiln: { hot: 'C', desc: 'Builds Needles, Conchs and Petrels (Conchs need a Glasshouse).' },
  loom: { hot: 'G', desc: 'Researches Weapons, Plating and Spindrift; unlocks Conchs and Bruisers.' },
  ward: { hot: 'A', desc: `Sentinel against ground and air. Gives your machines range ${D.radio.sources.ward} tiles around it.` },
  // (its name is the sim's, vael.rs: the words here never repeat it)
  eclipse: { hot: 'D', desc: 'Trains Undertows.' },
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
/** A unit's partner and killer as one line ("Best with Harpooners. Beaten by Conchs."), or '' for a worker. */
export function pairLine(k) {
  const p = PAIRS[k];
  return p ? `Best with ${plural(UNITS[p[0]].name)}. Beaten by ${plural(UNITS[p[1]].name)}.` : '';
}
export const BUILDINGS = merge(D.buildings, BLDG_TEXT);
// "Requires X." comes from the tables, so it can never name the wrong building.
for (const d of [...Object.values(UNITS), ...Object.values(BUILDINGS)]) if (d.req) d.desc += ` Requires ${D.buildings[d.req].name}.`;
/** Extra damage per Weapons level, by unit or building type. */
export const UP_DMG = Object.fromEntries([...Object.entries(UNITS), ...Object.entries(BUILDINGS)].filter(([, d]) => d.weapon?.upDmg).map(([k, d]) => [k, d.weapon.upDmg]));
/** Team-wide upgrades; per level: cost [salt, 0], seconds. */
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
  entrench: { hot: 'D', desc: 'Brace: 4 more armour, but no moving, until you lift it (1 s each way).' },
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
