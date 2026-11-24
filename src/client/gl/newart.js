// The new look, behind a switch (`?art=new`; without it nothing here is fetched and the game is today's, byte for byte).
// Its pictures are not in the repo: tools/newart builds them from a local folder into public/art/new/ (ignored by git).
// A pack is one JSON per group (`bldg`, `land`, `unit`), listed in art/new/index.json: `{ groups: { <name>: { pages:
// ['<page>.json', ...], unitTops?, ...whatever the group's own code reads } } }`; a page is a PixiJS spritesheet at scale
// 2 as atlas.json's are. A frame that has the name of one of today's takes its place (`bldg_core`, `bldg_core_m`, ...), a
// frame with a new name is added; a group that is not built is simply absent.
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
/** Every group's pages, in order, as paths under `art/`. */
export const newArtPages = (ix) => Object.values(ix?.groups || {}).flatMap(g => g.pages.map(p => 'new/' + p));
