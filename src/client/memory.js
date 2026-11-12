// What this side remembers of enemy buildings: each one's state as last seen (kind, place, seat, how far built), drawn
// in the fog in its place, on the field and the minimap, and picked there, instead of the live one. A building never
// seen is not drawn at all; a remembered one that fell out of sight stays until its ground is seen again. Our own and
// our allies' buildings are always live (shared vision).
import { G, enemies, visibleEnt, idx } from '../engine/core.js'; // (core.js, not index.js: no WASM loading of its own, so Node tests use it too)

/** Building id -> its last-seen state (a copy, `ghost: true`). */
const ghosts = new Map();

/** Forget everything (a new game, another seat). */
export function resetMemory() { ghosts.clear(); }

/** Whether any tile of a building's footprint is in sight. */
const inSight = (b) => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (G.vis[idx(b.tx + x, b.ty + y)]) return true; return false; };

/** A building as it is now, kept: what the field, the minimap and the panel read (no queue, research or rally). */
const keep = (b) => ({ ...b, queue: [], research: null, rally: null, prog: 0, flash: 0, ghost: true });

/** Each frame: an enemy building in sight is remembered as it is; a remembered one whose ground is in sight again
 *  and shows nothing there (it is gone) is forgotten. */
export function noteBuildings() {
  const live = new Map();
  for (const b of G.bldgs) {
    if (b.team === G.me || !enemies(G.me, b.team)) continue;
    live.set(b.id, b);
    if (visibleEnt(b)) ghosts.set(b.id, keep(b));
  }
  for (const [id, g] of ghosts) {
    const b = live.get(id);
    if (!(b && visibleEnt(b)) && inSight(g)) ghosts.delete(id);
  }
}

/** The buildings this side may draw, map and pick: its own and its allies' live, an enemy's live while in sight, and
 *  in the fog the remembered ones. */
export function shownBldgs() {
  const out = [], ids = new Set();
  for (const b of G.bldgs) if (b.team === G.me || !enemies(G.me, b.team) || visibleEnt(b)) { out.push(b); ids.add(b.id); }
  for (const [id, g] of ghosts) if (!ids.has(id)) out.push(g);
  return out;
}
