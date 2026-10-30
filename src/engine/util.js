// Small helpers for the client and tests. Nothing here touches the DOM or global state.

/** The difficulties' names, in the sim's order (the menus' chips write them in capitals): here, with no import, so the
 *  site's challenge cards (src/client/challenge.js) name them too; constants.js passes them on, and
 *  test/challenge.test.js keeps them as many as the sim's levels. */
export const DIFF_NAMES = ['Easy', 'Medium', 'Hard', 'Brutal'];

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
