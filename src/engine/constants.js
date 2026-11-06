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
/** Seconds a unit takes to warp in at a power field (the Vael). */
export const UNIT_WARP = D.consts.unit_warp;
/** A speed tech's multiple for its flyer. */
export const TECH_SPEED = D.consts.tech_speed;
/** A construction tech's multiple for its side's building rate. */
export const TECH_BUILD = D.consts.tech_build;

/** Hotkeys and descriptions, by kind key (the numbers and names are the sim's). A description says what the unit does;
 *  its partner and its killer are a line of their own (`PAIRS`), the counters made visible (Roster v2). */
const UNIT_TEXT = {
  harvester: { hot: 'G', desc: 'Mines salt. Builds structures and repairs them.' },
  trooper: { hot: 'K', desc: 'Line infantry, cheap and steady. Shoots the ground only. Digs in for more reach once Sandbags is researched.' },
  vanguard: { hot: 'B', desc: 'Armoured walker for the front. Beaches itself where it fights: armour 6 and a splashing gun; on the move only a light gun.' },
  lancer: { hot: 'H', desc: 'Slow-firing crewman whose harpoon reaches ground and air and hits flyers hard. What it hits moves at half speed and uses no ability for 3 s.' },
  medic: { hot: 'M', desc: 'Heals nearby infantry. Unarmed.' },
  raider: { hot: 'K', desc: 'Fast light flyer. Flies over cliffs and buildings, strafes the ground. Faster once Tailwind is researched.' },
  observer: { hot: 'S', desc: 'Unarmed flying scout. Fast, sees far, flies over cliffs, and spots hidden units near it.' },
  siegeTank: { hot: 'A', desc: 'Artillery. Anchors by itself where it stops and shells from afar with heavy splash, but not up close; it cannot fire on the move.' },
  interceptor: { hot: 'N', desc: 'Fast, armoured anti-air gun on wheels: keeps the sky clear over your line. Cannot hit the ground.' },
  bastion: { hot: 'W', desc: 'Flying capital ship. Slow and heavily armoured; its guns splash the ground and reach flyers.' },
  // the Vael
  lumen: { hot: 'G', desc: 'Mines salt. Plants Vael structures, which grow by themselves.' },
  scythe: { hot: 'N', desc: 'Fast blade in a shell of nacre. Fights up close: it has to catch its target first. Cannot hit flyers.' },
  prism: { hot: 'L', desc: 'A lens that fires at ground and air: the Vael all-rounder and their answer to flyers. Surges once Surge Chamber is researched.' },
  monolith: { hot: 'C', desc: 'Slow heavy shell. Long range; its shots splash onto nearby ground units. Surfaces a short way off. Cannot hit flyers.' },
  shrike: { hot: 'E', desc: 'Fast flyer. Raids workers and hunts other flyers. Hidden for good once Seaglass is researched.' },
  sovereign: { hot: 'A', desc: 'Capital barge gliding low, its beam splashing the ground from far off; its lantern spots hidden units. Cannot hit flyers.' },
  halo: { hot: 'T', desc: 'Unarmed. Mends the nacre, then the hull, of nearby Vael, even under fire. Sees far and spots hidden units.' },
  umbra: { hot: 'U', desc: 'Melee assassin. Hidden while still. Put it on Hold to lie in wait: its first strike comes from hiding, and it shows when it moves or strikes. Something that spots hidden units sees it anyway.' },
};
const BLDG_TEXT = {
  core: { hot: 'L', desc: 'Trains Riggers. Salt drop-off. +10 energy.' },
  depot: { hot: 'W', desc: '+8 energy.' },
  extractor: { hot: 'U', desc: 'Built on a brine seep: pays salt by itself, half a salt a second, with no workers.' },
  barracks: { hot: 'C', desc: 'Trains Pickets, Harpooners and Menders (Menders need a Workshop).' },
  forge: { hot: 'K', desc: 'Researches Weapons, Plating, Sandbags and All Hands; unlocks Menders and the Slipway\'s machines.' },
  factory: { hot: 'S', desc: 'Builds the machines: Breakwaters, Anchor Guns and Netters (all need a Workshop).' },
  turret: { hot: 'O', desc: 'Static defence against ground and air. Spots hidden units.' },
  airfield: { hot: 'F', desc: 'Trains Kites, Spyglasses and the Windjammer capital ship. Researches Tailwind.' },
  // the Vael
  conflux: { hot: 'T', desc: 'The Vael heart, a pool of deeplight. Trains Glints. Salt drop-off. +10 energy.' },
  spire: { hot: 'S', desc: '+8 energy.' },
  siphon: { hot: 'I', desc: 'Grown on a brine seep: pays salt by itself, half a salt a second, with no workers.' },
  kiln: { hot: 'C', desc: 'Grows Needles, Lenses, Conchs and Tenders (the last two need a Glasshouse).' },
  loom: { hot: 'G', desc: 'Researches Weapons, Hardshell and Surge Chamber; unlocks Conchs and Tenders.' },
  ward: { hot: 'A', desc: 'Sentinel against ground and air. Spots hidden units.' },
  zenith: { hot: 'Y', desc: 'Launches Petrels, hidden Undertows and the Argonaut capital barge.' },
  // (its name is the sim's, vael.rs: the words here never repeat it)
  eclipse: { hot: 'D', desc: 'Where the Vael keep their dark. Unlocks Undertows and researches the Petrels\' Seaglass and Spindrift.' },
};
const UPGRADE_TEXT = { weapons: { hot: 'W' }, armor: { hot: 'L', desc: '+1 armor per level for all units.' }, shields: { hot: 'H', desc: 'Nacre soaks 1 more damage of every hit per level.' },
  afterburners: { hot: 'T' }, overchargeCore: { hot: 'S' }, slipstream: { hot: 'F' }, cloakingField: { hot: 'K' }, entrenching: { hot: 'S' }, veilWeave: { hot: 'S' }, rapidConstruction: { hot: 'A' } };

const merge = (data, text) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { ...v, ...text[k] }]));
/** Each fighting unit's partner (what it fights best beside) and killer (what beats it), from Roster v2's
 *  compositions: one line in its train button's details (`pairLine`). Workers have none. Every killer is held by a
 *  cost-equal duel (crates/endfall-sim/tests/gameplay/balance.rs `every_units_killer_on_its_card_beats_it`). */
export const PAIRS = {
  trooper: ['lancer', 'monolith'], lancer: ['trooper', 'scythe'], medic: ['trooper', 'scythe'],
  vanguard: ['siegeTank', 'monolith'], siegeTank: ['vanguard', 'shrike'], interceptor: ['bastion', 'scythe'],
  raider: ['interceptor', 'prism'], observer: ['siegeTank', 'shrike'], bastion: ['interceptor', 'shrike'],
  scythe: ['halo', 'vanguard'], prism: ['monolith', 'siegeTank'], halo: ['scythe', 'trooper'],
  monolith: ['prism', 'raider'], umbra: ['shrike', 'trooper'], shrike: ['umbra', 'interceptor'],
  sovereign: ['prism', 'raider'],
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
  stim: { hot: 'T', desc: 'Fire 50% faster and run faster for 10 s. Costs 10 health.' }, // (retired with Roster v2)
  entrench: { hot: 'D', desc: 'Dig in: 2 more tiles of reach, but no moving, until you dig out (2 s each way).' },
  blink: { hot: 'F', desc: 'Sink and surface up to 4 tiles towards the target (or straight ahead).' },
  overcharge: { hot: 'U', desc: 'Fire twice as fast for 6 s.' },
  cloak: { desc: 'Always hidden once researched: unseen and untouchable except near a spotter.' }, // (retired with Roster v2)
  veil: { desc: 'Always hidden once Seaglass is researched: unseen and untouchable except near a spotter.' },
  deploy: { desc: 'Anchors whenever it stops (3 s, no moving or firing meanwhile), and weighs anchor when it has to move: it fires only anchored.' },
  beach: { desc: 'Beaches itself where it fights (2 s): armour 6 and its splashing gun. Gets under way again when it has to move.' },
};
/** Unit abilities, with their hotkeys and descriptions: one tap each on the card, but for an automatic one (`auto`:
 *  the Siege Tank's Deploy), which the unit uses by itself and which has no button or key. */
export const ABILITIES = merge(D.abilities, ABILITY_TEXT);
// A tech's words come from what it does: the ability it unlocks (and who has it), the flyer it speeds up.
for (const u of Object.values(UPGRADES)) {
  const who = (k) => Object.values(UNITS).filter(d => (d.abilities || []).includes(k)).map(d => plural(d.name)).join(' and ');
  if (u.effect === 'unlock') u.desc = ABILITIES[u.of].auto ? `${who(u.of)} are always cloaked: unseen except near a detector.` : `Unlocks ${ABILITIES[u.of].name} for ${who(u.of)}.`;
  if (u.effect === 'speed') u.desc = `${plural(UNITS[u.of].name)} fly ${Math.round((TECH_SPEED - 1) * 100)}% faster.`;
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
