// How the units of the painted art are drawn, by kind: their size, their selection ring, how their builders work. The art
// itself is src/client/gl/artload.js's to load: public/art/new/index.json lists its groups (`bldg`, `land`,
// `unit`): `{ pages: ['<group>-0.json', ...], unitTops?, animations?, ...whatever the group's own code reads }`; a page is
// a PixiJS spritesheet at any scale.

/** How large the units are drawn, of the size their frames are packed at (tools/newart/unit). The frames
 *  come at their final sizes (each drawn to its own, painted at a true camera), so every kind is 1 but the Rover (its
 *  hull, wider than its ground, stood over its neighbors). A
 *  kind that stands out among the rest is tuned here, by a row, and no pack is built again (the first pack's Knight
 *  and Rover were 0.78, its Android 0.85, the rest 0.9). A kind not named is drawn UNIT_SIZE_REST. */
export const UNIT_SIZE = { monolith: 0.9 }, UNIT_SIZE_REST = 1;
/** The factor on a unit of `type`. The
 *  sprite, its drawn height (the health bar, the hit test, the silhouette), its drawn radius and its selection ring go
 *  by it (render.js); the sim's radius and collision do not. */
export const unitSize = (type) => UNIT_SIZE[type] ?? UNIT_SIZE_REST;

/** The selection ring's size, of the ring the rule gives their kind (render.js UnitObj:
 *  a small or a large ring by the sim's radius, at the art's scale). The people on foot are slim at the painter's true
 *  camera, and that ring, sized for a squat figure, stood well clear of their feet: theirs is a fifth smaller. Horses
 *  and machines fill theirs. Only the drawn ring: the hit test, the health bar and the silhouette go by `unitSize`, the
 *  sim's radius and collision by nothing here. */
export const RING_SIZE = { harvester: 0.8, trooper: 0.8, lancer: 0.8, prism: 0.8, bruiser: 0.8, umbra: 0.8 };
/** The radius a unit's marks (its selection ring, its health bar) go by: the sim's, a flyer's at most 10. The Balloon's
 *  body in the sim is as wide as its envelope (16, so a group of them hangs apart); its marks stay small ones. */
export const markRadius = (u) => (u.d.air ? Math.min(u.r, 10) : u.r);

/** The ring's factor for a unit of `type`. */
export const ringSize = (type) => RING_SIZE[type] ?? 1;

/** How a builder with work frames of its own (`_k0` the tool or the arm out, `_k1` the stroke) works at its site, by
 *  kind. `nudge`: its body leans into each strike for two frames; `turns`: its arm changes frame
 *  at each strike (out for one, down for the next: a calm 1.1 s) instead of flashing the stroke for 0.18 s after each.
 *  The Bot (`lumen`): its whole white box jumped 1.5 px for two frames every 0.55 s as its arm flicked down for five,
 *  and read as trembling; a machine stands still and lets its arm work. A kind not named leans and flashes (a person
 *  swinging a pick does lean into the blow). */
export const WORK_LOOK = { lumen: { nudge: false, turns: true } };
const WORK_REST = { nudge: true, turns: false };
/** How a builder of `type` works. */
export const workLook = (type) => WORK_LOOK[type] || WORK_REST;
