// The maps the menus offer (single player and the multiplayer lobby): fixed ones with made-up names and hidden
// characters (MapKind in the sim; the end screen tells the story), and a random one generated each time, at each size
// the menus offer. The number of players decides the size (the smallest that seats them all: a duel's 64x64, 96x96 for
// three or four), and each size has its own maps: the generator lays a seed out differently at another size, so a
// 96x96 map is a map of its own, with its own name. Pure: no DOM, no WASM (test/maps.test.js).
import { mulberry } from '../engine/util.js';

/** Map characters, in the sim's MapKind order, with the story the end screen tells. */
export const MAP_KINDS = [
  { story: 'Old mining country: balanced fields and winding passes.' }, // Standard
  { story: 'The crystal here ran ten times deeper than anywhere else.' }, // DeepFields
  { story: 'An ether storm: vents everywhere, each three times as rich.' }, // EtherStorm
  { story: 'Open plains: barely any rock to hide behind, so the attacks came fast.' }, // OpenPlains
  { story: 'A labyrinth of rock and narrow passes, made for holding chokepoints.' }, // Labyrinth
  { story: 'Picked nearly clean long ago: small fields, expand or starve.' }, // Barren
];

/** The sizes the menus offer (tiles across) and the players each seats (its starts: crates/endfall-sim map::max_starts).
 *  128x128 (eight) waits for group paths (docs/MULTIPLAYER.md, M4 2d). */
export const SIZES = [{ size: 64, seats: 2 }, { size: 96, seats: 4 }];
/** The most players a game may have. */
export const MAX_PLAYERS = SIZES.at(-1).seats;

/** The maps: always the same layout (like the maps of 1998), plus a random one per size, generated each time. Indices
 *  are what a room's `map` names: append only. */
export const MAPS = [
  { name: 'Ashen Basin', seed: 4242, kind: 0, size: 64 },
  { name: 'Glass Reach', seed: 1998, kind: 1, size: 64 },
  { name: 'Cinder Divide', seed: 2077, kind: 4, size: 64 },
  { name: 'Random', random: true, size: 64 },
  // (96x96, four starts. Picked from 60 seeds per character by four Medium AIs, free for all and two against two, on two
  // turns of the seats: every game ends, in 7 to 21 minutes, won from different starts, the worst tick under 40 ms
  // natively; two maps with the starts in the corners, one in the middles of the sides)
  { name: 'Dust Quarter', seed: 1291, kind: 0, size: 96 },
  { name: 'Shard Crown', seed: 2940, kind: 1, size: 96 },
  { name: 'Long Steppe', seed: 1582, kind: 3, size: 96 },
  { name: 'Random', random: true, size: 96 },
];

/** Tiles across for a game of `players`: the smallest size that seats them all. */
export const sizeFor = (players) => (SIZES.find(s => s.seats >= players) || SIZES.at(-1)).size;
/** How many players map `i` seats. */
export const seatsOf = (i) => SIZES.find(s => s.size === MAPS[i].size).seats;
/** The maps a game of `players` is offered (indices into MAPS): those of its size, the fixed ones first. */
export const mapsFor = (players) => MAPS.map((_, i) => i).filter(i => MAPS[i].size === sizeFor(players));
/** Map `i` if it is offered to `players`, else the first one that is. */
export const fitMap = (i, players) => (mapsFor(players).includes(i) ? i : mapsFor(players)[0]);
/** Map `i`'s badge among those offered to `players`: "up to 4" when some of them seat more than the players chosen
 *  (another could still join, or a start stays free); '' otherwise (no noise). */
export const badge = (i, players) => (mapsFor(players).some(j => seatsOf(j) > players) ? `up to ${seatsOf(i)}` : '');

const FIRST = ['Ashen', 'Glass', 'Hollow', 'Iron', 'Sunken', 'Cinder', 'Pale', 'Shattered', 'Silent', 'Rust', 'Frozen', 'Amber', 'Broken', 'Ember', 'Grey', 'Last'];
const SECOND = ['Basin', 'Ridge', 'Reach', 'Mesa', 'Hollows', 'Expanse', 'Crossing', 'Wastes', 'Divide', 'Plateau', 'Gorge', 'Flats', 'Rim', 'Fields', 'Shelf', 'Sink'];
/** A name for a random map, the same every time for its seed. */
export function mapName(seed) { const r = mulberry(seed ^ 0x5bd1e995); return FIRST[Math.floor(r() * FIRST.length)] + ' ' + SECOND[Math.floor(r() * SECOND.length)]; }

/** The map a room's setup plays: its map if it seats the room's players (else the first that does), a fixed one's
 *  layout or, for a random one, the room's seed (a character from it); and its size. */
export function onlineMap(setup) {
  const i = fitMap(setup.map, setup.races.length), m = MAPS[i];
  return m.random ? { seed: setup.seed, kind: setup.seed % MAP_KINDS.length, name: mapName(setup.seed), size: m.size } : { seed: m.seed, kind: m.kind, name: m.name, size: m.size };
}
