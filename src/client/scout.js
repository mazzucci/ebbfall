// What this side has seen of the enemy's army: every enemy fighter counted once, with when it was last in view (fog
// and cloak respected). Shown on demand only: the pause card (lately) and the end card (the whole game).
import { G, UNITS, visibleEnt, enemies } from '../engine/index.js';
import { portrait } from './gl/render.js';

const LATELY = 90; // seconds the pause card looks back
const sightings = new Map(); // unit id -> { u (the mirror object: u.dead once it is gone), type, team, last }
let noted = -1;

export function resetSightings() { sightings.clear(); noted = -1; }

/** Note the enemy fighters in view now (four times a game second is plenty). */
export function noteSightings() {
  if (G.time - noted < 0.25 && noted <= G.time) return;
  noted = G.time;
  for (const u of G.units) {
    if (!enemies(G.me, u.team) || u.d.worker || !visibleEnt(u)) continue;
    const s = sightings.get(u.id);
    if (s) s.last = G.time; else sightings.set(u.id, { u, type: u.type, team: u.team, last: G.time });
  }
}

/** [type, count, team] of the fighters seen since game time `t` (`alive`: only those not since destroyed), most first. */
export function seenSince(t, alive = false) {
  const n = new Map();
  for (const s of sightings.values()) if (s.last >= t && !(alive && s.u.dead)) { const e = n.get(s.type) || [s.type, 0, s.team]; e[1]++; n.set(s.type, e); }
  return [...n.values()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/** One line of portraits and counts for what was seen since `t` (in their own colours), or `none`. */
export function seenLine(t, lead, none, alive = false) {
  const seen = seenSince(t, alive);
  if (!seen.length) return none;
  return lead + seen.map(([type, n, team]) => `<span class="seen" title="${n} ${UNITS[type].name}" aria-label="${n} ${UNITS[type].name}">${portrait('unit', type, 22, team)}<b>${n}</b></span>`).join('');
}

/** The pause card's line: what is still out there, as far as it was seen in the last 90 s (the dead do not count). */
export const seenLately = () => seenLine(G.time - LATELY, 'Seen lately: ', 'Nothing of theirs seen lately.', true);
