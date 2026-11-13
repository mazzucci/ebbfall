// How kinds look and sound beyond their sprites, by kind key: lights, turret heads, chimney smoke, radio voices, poses.
// The renderer and the sound engine read this table instead of naming kinds, so a new race adds rows here.

/** Seat colors, by seat: the team paint of every unit, building and turret head (the art is rendered once in a neutral
 *  white with a team mask the renderer tints, Notion: Ebbfall art), the menus' swatches and the minimap's dots. Seat 0
 *  royal blue (gold is the resource's color now, so no seat is gold, amber or yellow), then magenta, teal, lilac,
 *  green, aqua, plum, red. Apart from each other in normal vision and under protanopia and deuteranopia (Machado et al.
 *  2009 at full severity, CIEDE2000, the re-theme's pick of 2026-11-10: every pair at least 19.7 apart in normal vision,
 *  14.1 under protanopia, 10.6 under deuteranopia, where gold, magenta, blue and violet had come down to 5.4), from the
 *  dark ground, the selection marks and both peoples' bodies (the step-2 judge, 2026-11-06: no white, lost on canvas and
 *  bone; seat 2's teal dark, as a light one turned pale beige under protanopia). Seat 6 was a violet that read as seat
 *  0's blue to the red-green color-blind; seat 5 a second blue. Shared with the art tools (tools/render3d). */
export const SEAT_COLORS = [0x2f63d6, 0xe0386e, 0x0e9478, 0xc293e0, 0x79d85a, 0x61ded1, 0x943886, 0xe5553a];
/** Units are rendered this much larger than their size in the sim (tools/render3d/main.js), so they read at the
 *  re-theme's lower camera (buildings keep their footprints). The renderer's hit test and selection rings scale by it. */
export const UNIT_ART_SCALE = 1.4;
/** Each game seat's spot on the menus' board (seats.js): a player keeps its spot's color in the game, whatever seat
 *  its side gives it. Set when a game starts (single player's `startSetup`, a room's `setup.spots`); none: a seat's
 *  own number. */
let spotOf = [];
export const setSpots = (spots) => { spotOf = Array.isArray(spots) ? spots.slice() : []; };
/** The color (an index into SEAT_COLORS) seat `seat` plays in. */
export const colorOf = (seat) => spotOf[seat] ?? seat;


/** Buildings: `glow` [color, size, strength, px above the center (negative: below), flicker, px east of the center], `head` (a head sprite
 * drawn over the base in 16 frames: by default it turns to aim, a turret's; `spin` [frames a second]: it cycles through
 * them on the renderer's clock, a rotor; `pan` [frames either side, seconds a sweep]: it sweeps slowly to and fro about
 * its first frame, a dish), `smoke` (points in px from the footprint's top-left corner: a puff rises from one of them now and then,
 * only while the building works, `chimneyActive`: training or researching; the sprites carry no baked smoke). Each
 * measured on its model (tools/render3d/kingdom-buildings.js, expedition-buildings.js), turned and scaled as the atlas
 * draws it (retheme.js BLDG_YAW): a point (x, y, z) of a model centered on its footprint, turned `yaw` about the vertical
 * and scaled k, lands at x' = k (x cos yaw + z sin yaw), z' = k (z cos yaw - x sin yaw), and is drawn x' east and
 * k y * 1.19 - z' above the center at the 40-degree camera. The smoke points are the chimney caps' tops. The Cottage has
 * no smoke: nobody works there. */
export const BLDG_LOOK = {
  core: { smoke: [[97, 4]] },                                                        // (the Castle, +11 at 0.88: the great hall's chimney; no light)
  barracks: { smoke: [[37, -26]] },                                                  // (the Barracks, -30: the chimney at the hall's west end)
  forge: { glow: [0xff5a1e, 0.6, 0.45, -3, true, 1], smoke: [[22, -24], [35, 21]] }, // (the Blacksmith, -20: the ember on the hearth out in the yard; its stack's smoke and the flue's behind the hearth)
  turret: { head: 'turret_head' },                                                   // (the Watchtower's archer turns)
  // the Expedition: its cyan lights (tools/render3d/expedition-buildings.js `cyanLed`, the neon: never warm, never a seat's)
  conflux: { glow: [0x20d8ff, 1.0, 0.3, 48, false, 1] },                            // (the Data center, the server hall at -20: the chip's die glowing on its roof, cyan as its neon; the die's center at (0, 39.3, -3))
  siphon: { glow: [0x3fe0ff, 0.45, 0.45, 0, false, -2] },                            // (the Recruiting post, the tavern hall at -20: the cyan work lamp by its door, at (2, 10.8, 13))
  loom: { glow: [0x3fe0ff, 1.0, 0.3, 20, false, 0] },                                // (the Lab, the dome at -20: the glow inside it, at (0, 18, 0); the Factory's roof lights are in its sprite)
  ward: { head: 'ward_head' },                                                      // (the Sentry gun turns to its target)
  spire: { head: 'spire_head', spin: 10 },                                           // (the Wind turbine's rotor: three blades, so 16 frames a third of a turn)
  uplink: { head: 'uplink_head', pan: [3, 9] },                                      // (the Uplink's dish pans 3 facings either way)
  eclipse: { head: 'eclipse_head', spin: 4, portal: true, glow: [0x3fe0ff, 1.1, 0.55, 8, false, 0] }, // (its cyan light, only as a unit comes through)                          // (the Portal's dust spiral: brighter and faster as a unit comes through, `portalOpen`)
};
/** The Portal's swirl brightens each time a unit comes through, then settles (Stelian, R2); it stays multi-use and
 *  keeps training. Returns how bright it is above its settled state, 0 to 1, and keeps its own clock in `st` (one object
 *  per Portal, the renderer's): it rises as a unit's training nears its end, holds while the unit steps out, then fades.
 *  `b` is the client's mirror of the building (its queue and `prog`, the front unit's progress), `now` the renderer's
 *  clock in seconds. A unit gone from the queue has stepped out; setting `st.outAt = now` plays the hold and the fade. */
export const PORTAL = { rise: 0.2, hold: 0.5, fade: 1.2 };
export function portalOpen(st, b, now) {
  const n = b.done ? b.queue.length : 0;
  if (st.n !== undefined && n < st.n) st.outAt = now; // (one came out)
  st.n = n;
  const rising = n ? Math.max(0, Math.min(1, (b.prog - (1 - PORTAL.rise)) / PORTAL.rise)) : 0;
  const since = st.outAt === undefined ? Infinity : now - st.outAt;
  const after = since < PORTAL.hold ? 1 : Math.max(0, 1 - (since - PORTAL.hold) / PORTAL.fade);
  return Math.max(rising, after);
}
/** A selected building's mark: a flat oval on the ground under it, sized to its footprint (center and radii, world
 *  px; `b` has the sim's center x, y and footprint w, h in tiles). A unit has its broken ring; a placement ghost stays
 *  square. */
export const selOval = (b) => ({ x: b.x, y: b.y + b.h * 32 * 0.06, rx: b.w * 32 * 0.64, ry: b.h * 32 * 0.5 });
/** The head's frame (0-15) for a building's look `look` at `now` (the renderer's clock, s) aiming at `aim` (radians):
 *  a rotor's by the clock, a dish's sweep, a turret's by its aim. `phase` (s) sets one rotor apart from the next. */
export function headFrame(look, aim, now, phase = 0) {
  if (look.spin) return Math.floor((now + phase) * look.spin) % 16;
  if (look.pan) { const [amp, period] = look.pan; return (Math.round(amp * Math.sin((now + phase) * Math.PI * 2 / period)) + 16) % 16; }
  return ((Math.round((aim || 0) / (Math.PI * 2) * 16) % 16) + 16) % 16;
}

/** Units: the pitch of their radio chirp (Hz): heavy machines low, flyers and medics high. */
export const UNIT_VOICE = { harvester: 330, trooper: 520, lancer: 600, medic: 760, siegeTank: 230, observer: 1040, lumen: 700, scythe: 460, prism: 820, monolith: 220, shrike: 960, halo: 940, umbra: 400, bastion: 300, rider: 640, knight: 260, bruiser: 280 };

/** The shots (tools/art/effects3.js): each projectile's sprite by its shooter's kind (`SHOT_LOOK`), else by its people
 *  and projectile kind (`PEOPLE_SHOT`); a building's shot (no shooter kind: the Watchtower's, the Radio tower's) by its
 *  people (`TOWER_SHOT`). The kingdom shoots arrows, ballista bolts and cannonballs; the Expedition rifle tracers,
 *  rockets and the Drone's darts. Each sprite points +x with its tip at its anchor (a cannonball: its middle). */
export const SHOT_LOOK = { lancer: 'arrow', bastion: 'ballista_bolt', siegeTank: 'cannonball', umbra: 'tracer', monolith: 'rocket', shrike: 'dart' };
export const PEOPLE_SHOT = { humans: { bolt: 'arrow', shell: 'cannonball', missile: 'ballista_bolt' }, vael: { bolt: 'tracer', shell: 'rocket', missile: 'rocket' } };
export const TOWER_SHOT = { humans: 'arrow', vael: 'tower_shot' };
/** The sprite of a shot fired by a unit of kind `by` (undefined: a building) of people `people`, its projectile kind `type`. */
export const shotArt = (by, type, people) => SHOT_LOOK[by] ?? (by ? PEOPLE_SHOT[people]?.[type] : TOWER_SHOT[people]) ?? 'arrow';
/** Whether a building's chimney smokes right now: it stands and works (a unit in its queue or a research under way;
 *  `b` is the client's mirror of it, src/engine/core.js). */
export const chimneyActive = (b) => !!(b.done && (b.queue.length || b.research));

/** Muzzle smoke: the unit kinds that leave a puff where they fire (a `fire` event at the shooter), and how big. */
export const MUZZLE_SMOKE = { siegeTank: 1.4 };
/** The top units (the Knight, the Cannon, the Android, the Rover) hit heavier than the basic lines, so they read as
 *  more powerful at a glance: `flash`, the size of the flash where they fire (a ranged one's; 0: none), `hit` the impact
 *  where they land ('blast': an explosion, the Cannon's and the Rover's; 'blow': a bright flash and sparks, the Knight's
 *  sword and the Android's rifle) at `size`, in the light `light`, and `shake` (px) the screen's jolt when one lands in
 *  view (capped, so a battery of them does not blur the field). */
export const HEAVY = {
  knight: { flash: 0, hit: 'blow', size: 1.0, light: 0xffe0a8 },
  siegeTank: { flash: 1.0, hit: 'blast', size: 1.0, light: 0xff9a3a, shake: 3 },
  umbra: { flash: 0.7, hit: 'blow', size: 0.8, light: 0x9fe8ff },
  monolith: { flash: 0.8, hit: 'blast', size: 0.85, light: 0xffa050, shake: 2.5 },
};
/** A shot's trail (an animation the renderer drops behind it in flight): the rocket's smoke. */
export const SHOT_TRAIL = { rocket: 'trail' };
/** The shots that carry a light of their own (a small warm glow under them): the tracers, the tower's shot, the rocket's flame. */
export const SHOT_LIT = new Set(['tracer', 'tower_shot', 'rocket']);

/** Animation frames per second by unit type (default: 14 for flyers with frames to cycle; 8 for walkers while they
 *  move). 0 holds the first frame: the Balloon (observer) has one. The Drone (shrike) spins its blades at the flyers'
 *  14/s; the Ballista (bastion), on the ground, turns its wheels only on the move, as every walker. */
export const UNIT_FPS = { observer: 0 };

/** Units whose frames are poses, not one cycle: `walk` frames for the march (0 to walk - 1), then the frame shown
 *  while its toggle settles in or packs up (`swap`) and the one while it is on (`on`). The Cannon (siegeTank): two
 *  frames rolling, half set, set up: the barrel raised, rolled back on its wheels (tools/render3d/kingdom-units.js `cannon`). The Guard (trooper) has no such pose: braced, it
 *  stands. */
export const UNIT_POSE = { siegeTank: { walk: 2, swap: 2, on: 3 } };
