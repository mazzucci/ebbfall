// Small helpers for the client and tests. Nothing here touches the DOM or global state.

/** The difficulties' names, in the sim's order (the menus' chips write them in capitals): here, with no import, so the
 *  site's challenge cards (src/client/challenge.js) name them too; constants.js passes them on, and
 *  test/challenge.test.js keeps them as many as the sim's levels. */
export const DIFF_NAMES = ['Easy', 'Medium', 'Hard', 'Hard'];
/** The levels the menus offer, as the sim's difficulty indices: three at launch (Stelian, Nov 11), Easy, Medium and
 *  Hard, which is the sim's level 3; the sim's level 2 (its table keeps it, and the lab) is not offered. */
export const LEVELS = [0, 1, 3];
/** A saved or linked level as the menus offer it: an old Hard (2, from a saved board, a challenge link or a room) is
 *  today's Hard (3); anything else as it is. */
export const levelOf = (d) => (d === 2 ? 3 : d);

/** A name's plural, as the game's names take it: Buggy: Buggies; Barracks, Stables: already plural; -sh, -x: -es;
 *  anything else -s. */
export const plural = (name) => (/[^aeiou]y$/.test(name) ? name.slice(0, -1) + 'ies' : /s$/.test(name) ? name : name + (/(sh|x)$/.test(name) ? 'es' : 's'));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const fmt = (s) => {
  s = Math.floor(s);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/** A room's races, seat by seat, each 'random' drawn from the setup's seed and the seat's index (`keys`: the faction
 *  keys): the same on every client, so the relay passes race strings through untouched. */
export function seatRaces(races, seed, keys) {
  return races.map((k, i) => (k === 'random' ? keys[Math.floor(mulberry((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)() * keys.length)] : k));
}

/** Seeded PRNG (mulberry32). Deterministic across engines: integer math only. */
export function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
