// The new look, behind a switch (`?art=new`; without it nothing here is fetched and the game is today's, byte for byte).
// Its pictures are not in the repo: tools/newart builds them from a local folder into public/art/new/ (ignored by git).
// art/new/index.json lists the groups (`bldg`, `land`, `unit`): `{ groups: { <name>: { pages: ['<group>-0.json', ...],
// unitTops?, animations?, ...whatever the group's own code reads } } }`; a page is a PixiJS spritesheet at any scale, as
// atlas.json's are. A frame that has the name of one of today's takes its place (`bldg_core`, `bldg_core_m`, ...), a new
// name is added; `animations` (atlas.json's shape) replaces today's lists of those names. A group comes whole or not at
// all: one that is missing, malformed or fails to load leaves today's art.
export const artNew = new URLSearchParams(location.search).get('art') === 'new';

/** The packs' index, or null: the switch is off, or nothing is built (an index missing or not JSON: the dev server
 *  answers a missing file with the page). */
export async function newArtIndex(base) {
  if (!artNew) return null;
  try {
    const r = await fetch(base + 'new/index.json');
    return r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : null;
  } catch { return null; }
}

/** The groups that loaded whole, over `load(path)` (a page's path under art/ to its sheet): `{ name, group, pages:
 *  [[path, sheet], ...] }`, in index order. One that does not is dropped, with a warning. */
export async function loadGroups(ix, load) {
  const out = [];
  for (const [name, group] of Object.entries(ix?.groups || {})) {
    try {
      if (!group || !Array.isArray(group.pages)) throw new Error('no pages');
      out.push({ name, group, pages: await Promise.all(group.pages.map(async p => ['new/' + p, await load('new/' + p)])) });
    } catch (e) { console.warn(`new art: the group ${name} is left out (${e?.message ?? e})`); }
  }
  return out;
}

/** The names of today's team masks a group's frames leave stale: a frame it replaces without a mask of its own. */
export const staleMasks = (names, today) => [...names].filter(n => !n.endsWith('_m') && today.has(n) && today.has(n + '_m') && !names.has(n + '_m')).map(n => n + '_m');

/** How large the new look's units are drawn, of the size their frames are packed at (tools/newart/unit: Notion's
 *  "Units: one story each", rule 9, which drew an army as large figures standing on each other): the Knight and the
 *  Rover stood over the buildings beside them, the Android over its own side. A kind not named here is drawn
 *  UNIT_SIZE_REST. One table, so a size is tuned here and no pack is built again. */
export const UNIT_SIZE = { knight: 0.78, monolith: 0.78, umbra: 0.85 }, UNIT_SIZE_REST = 0.9;
/** The factor on a unit of `type`: its row with the new look's frames of it loaded (`packed`), 1 with today's. The
 *  sprite, its drawn height (the health bar, the hit test, the silhouette), its drawn radius and its selection ring go
 *  by it (render.js); the sim's radius and collision do not. */
export const unitSize = (type, packed) => (packed ? UNIT_SIZE[type] ?? UNIT_SIZE_REST : 1);

/** How a builder with work frames of its own (`_k0` the tool or the arm out, `_k1` the stroke) works at its site, by
 *  kind. `nudge`: its body leans into each strike for two frames, as today's builders do; `turns`: its arm changes frame
 *  at each strike (out for one, down for the next: a calm 1.1 s) instead of flashing the stroke for 0.18 s after each.
 *  The Bot (`lumen`): its whole white box jumped 1.5 px for two frames every 0.55 s as its arm flicked down for five,
 *  and read as trembling; a machine stands still and lets its arm work. A kind not named leans and flashes (a person
 *  swinging a pick does lean into the blow). */
export const WORK_LOOK = { lumen: { nudge: false, turns: true } };
const WORK_REST = { nudge: true, turns: false };
/** `type`'s row with the new look's work frames of it loaded (`packed`), today's way without. */
export const workLook = (type, packed) => (packed && WORK_LOOK[type]) || WORK_REST;
