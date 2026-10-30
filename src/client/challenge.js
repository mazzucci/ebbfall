// A challenge: SHARE after a victory against the AI sends a link that opens Ebbfall on the same single-player setup,
// ready to play (menu.js applies it; site/preview.js gives the link its own card in a chat). The link carries only the
// setup, as enumerated values and numbers, in one short parameter, `?vs=`: the map, where the seats sit round it, each
// spot of the board (seats.js: a race, a side, an AI's level), a random map's character and seed, and the winner's
// game time in seconds. No free text (no name, no message): every word a card or a share says is made here from those
// values, so nobody can craft an ebbfall.com card that says something else.
//
// The code, version 1: `1.<map>.<side>.<secs>.<spots>[.<kind>.<seed>]`, numbers in base 36 (lower case, no leading
// zeros), the last two for a random map only. <map> is maps.js MAPS' index; <side> how the seats turn round the starts
// (the sim's `side`, taken modulo what it can change: starts x players); <spots> the board's spots up to its last
// player, each `x` (empty) or a race letter (h, v), its side (0-7, numbered as they first appear: yours 0) and an AI's
// level (0-3; yours 0). Only letters, digits and dots, never one at the end: a chat's link detection keeps all of it.
// Parsing is strict: a code is good only if it is exactly what encoding its values gives back (anything else, another
// version included, opens the plain menu). <kind> is one digit: a tenth map kind needs version 2.
// Pure: no DOM, no WASM (test/challenge.test.js; the site's Worker imports it).
import { MAPS, MAP_KINDS, seatsOf, mapName } from './maps.js';
import { DIFF_NAMES } from '../engine/util.js';

/** The link's parameter. */
export const PARAM = 'vs';
/** The races by the letter a code gives them (the format's own: a race is never re-lettered; seats.js RACES, and the
 *  names raceTitle gives, a test keeps equal). */
const RACE_OF = { h: 'humans', v: 'vael' };
const LETTER = { humans: 'h', vael: 'v' };
const RACE_TITLE = { humans: 'Humans', vael: 'Vael' };
/** The board's spots (seats.js SPOTS). */
const SPOTS = 8;
/** The longest game a challenge names: just under 100 hours. */
export const MAX_SECS = 100 * 3600 - 1;
const b36 = (n) => n.toString(36);
const CODE = /^1\.([0-9a-z]{1,2})\.([0-9a-z]{1,2})\.([0-9a-z]{1,4})\.((?:x|[hv][0-7][0-3]){2,8})(?:\.([0-9])\.([0-9a-z]{1,7}))?$/;

/** A challenge's code, or null for one that is not a game the menu could have played (`c`: `{ map, side, secs, spots
 *  (a spot each, null when empty, `{ race, team, diff }`; yours spot 0), kind, seed (a random map's) }`). The sides
 *  are numbered afresh as they first appear (the game is the same: seats.js `arrange` numbers them so), the side
 *  taken modulo what changes the starts. */
export function encode(c) {
  if (!c || !Number.isInteger(c.map) || !MAPS[c.map] || !Array.isArray(c.spots) || c.spots.length > SPOTS) return null;
  const m = MAPS[c.map], starts = seatsOf(c.map);
  const spots = Array.from({ length: SPOTS }, (_, i) => c.spots[i] ?? null), at = spots.flatMap((r, i) => (r ? [i] : []));
  if (!spots[0] || at.length < 2 || at.length > starts) return null;
  const sides = [], side = (t) => { if (!sides.includes(t)) sides.push(t); return sides.indexOf(t); };
  let board = '';
  for (let i = 0; i <= at.at(-1); i++) {
    const r = spots[i], d = i ? r?.diff : 0;
    if (!r) { board += 'x'; continue; }
    if (typeof r !== 'object' || !LETTER[r.race] || !Number.isInteger(r.team) || !Number.isInteger(d) || d < 0 || d >= DIFF_NAMES.length) return null;
    board += LETTER[r.race] + side(r.team) + d;
  }
  if (sides.length < 2) return null; // (everyone on one side: nobody to beat)
  if (!Number.isInteger(c.side) || c.side < 0 || !Number.isInteger(c.secs) || c.secs < 1 || c.secs > MAX_SECS) return null;
  const parts = ['1', b36(c.map), b36(c.side % (starts * at.length)), b36(c.secs), board];
  if (m.random) {
    if (!Number.isInteger(c.kind) || c.kind < 0 || c.kind >= MAP_KINDS.length || !Number.isInteger(c.seed) || c.seed < 0 || c.seed > 0xffffffff) return null;
    parts.push(String(c.kind), b36(c.seed));
  }
  return parts.join('.');
}

/** The challenge a code names (`encode`'s values, the sides numbered from 0 as they first appear, eight spots), or
 *  null: anything not exactly a code `encode` makes. */
export function decode(code) {
  const m = typeof code === 'string' && code.length <= 64 ? CODE.exec(code) : null;
  if (!m) return null;
  const spots = [...m[4].matchAll(/x|[hv][0-7][0-3]/g)].map(([t], i) => (t === 'x' ? null : { race: RACE_OF[t[0]], team: +t[1], ...(i ? { diff: +t[2] } : {}) }));
  const c = { map: parseInt(m[1], 36), side: parseInt(m[2], 36), secs: parseInt(m[3], 36), spots: Array.from({ length: SPOTS }, (_, i) => spots[i] ?? null) };
  if (m[5] !== undefined) Object.assign(c, { kind: +m[5], seed: parseInt(m[6], 36) });
  return encode(c) === code ? c : null;
}

/** The challenge of a game the menu played (menu.js `menu`: `map`, `kind`, `seed`, `side`; the `board` and how
 *  START GAME seated it: `races` and `spots`, seat by seat, a RANDOM race as it was drawn) won in `secs`: or null. */
export function fromSetup({ map, kind, seed, side, board, races = [], spots = [] }, secs) {
  if (!Array.isArray(board)) return null;
  const drawn = new Map(spots.map((spot, s) => [spot, races[s]]));
  const seats = board.map((r, i) => r && { race: drawn.get(i) ?? r.race, team: r.team, ...(i ? { diff: r.diff } : {}) });
  const c = { map, side, secs: Math.max(1, Math.round(secs)), spots: seats, ...(MAPS[map]?.random ? { kind, seed } : {}) };
  return decode(encode(c));
}

/** The map a challenge plays: its seed, character, name and size (a random map's from the code). */
export function mapOf(c) {
  const m = MAPS[c.map];
  return m.random ? { seed: c.seed, kind: c.kind, name: mapName(c.seed), size: m.size } : { seed: m.seed, kind: m.kind, name: m.name, size: m.size };
}

/** A game time as a clock: 12:34, 5:07, 75:12. */
export const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// ---- The words, all made from the values above. ----
/** Your side (you and your AI allies) and the AIs against it. */
function camps(c) {
  const at = c.spots.flatMap((r, i) => (r ? [r] : [])), me = at[0];
  return { mine: at.filter(r => r.team === me.team), foes: at.filter(r => r.team !== me.team) };
}
/** The AIs against you by level: "Brutal" (all one level) or "up to Brutal". */
function levels(foes) {
  const ds = foes.map(r => r.diff), top = DIFF_NAMES[Math.max(...ds)];
  return ds.every(d => d === ds[0]) ? top : `up to ${top}`;
}
/** "a Brutal AI" ("1 Brutal AI" when `counted`), "3 Brutal AIs", "3 AIs up to Brutal". */
function ais(foes, counted = false) {
  const l = levels(foes), n = foes.length;
  return n === 1 ? `${counted ? 1 : 'a'} ${l} AI` : l.startsWith('up to') ? `${n} AIs ${l}` : `${n} ${l} AIs`;
}
/** The races of some players, each once: "Vael", "Humans and Vael". */
const raceList = (rs) => [...new Set(rs.map(r => r.race))].map(k => RACE_TITLE[k]).join(' and ');

/** The link's card in a chat: `{ title, description }`. */
export function card(c) {
  const { mine, foes } = camps(c);
  return {
    title: `Can you beat this? ${mine.length} vs ${ais(foes, true)} on ${mapOf(c).name}`,
    description: `${raceList(mine)} vs ${raceList(foes)} · won in ${clock(c.secs)} · free, in your browser`,
  };
}
/** What SHARE says with the link. */
export function shareText(c) {
  const { mine, foes } = camps(c), allies = mine.length - 1;
  const help = allies ? ` with ${allies === 1 ? 'an AI ally' : `${allies} AI allies`}` : '';
  return `I beat ${ais(foes)}${help} on ${mapOf(c).name} in ${clock(c.secs)} in Ebbfall. Can you?`;
}
/** The single-player page's line while a challenge is set. */
export const line = (c) => `CHALLENGE · won in ${clock(c.secs)} · beat it`;
/** The link to a challenge on the game at `origin` (and `path`: the game's page). */
export const link = (c, origin, path = '/') => `${origin}${path}?${PARAM}=${encode(c)}`;
