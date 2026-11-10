// How kinds look and sound beyond their sprites, by kind key: lights, turret heads, chimney smoke, radio voices, poses.
// The renderer and the sound engine read this table instead of naming kinds, so a new race adds rows here.

/** Seat colours, by seat: the team paint of every unit, building and turret head (the art is rendered once in a neutral
 *  white with a team mask the renderer tints, Notion: Ebbfall art), the menus' swatches and the minimap's dots. Seat 0
 *  royal blue (gold is the resource's colour now, so no seat is gold, amber or yellow), then magenta, teal, lilac,
 *  green, aqua, plum, red. Apart from each other in normal vision and under protanopia and deuteranopia (Machado et al.
 *  2009 at full severity, CIEDE2000, the re-theme's pick of 2026-11-10: every pair at least 19.7 apart in normal vision,
 *  14.1 under protanopia, 10.6 under deuteranopia, where gold, magenta, blue and violet had come down to 5.4), from the
 *  dark ground, the selection marks and both peoples' bodies (the step-2 judge, 2026-11-06: no white, lost on canvas and
 *  bone; seat 2's teal dark, as a light one turned pale beige under protanopia). Seat 6 was a violet that read as seat
 *  0's blue to the red-green colour-blind; seat 5 a second blue. Shared with the art tools (tools/render3d). */
export const SEAT_COLORS = [0x2f63d6, 0xe0386e, 0x0e9478, 0xc293e0, 0x79d85a, 0x61ded1, 0x943886, 0xe5553a];
/** Units are rendered this much larger than their size in the sim (tools/render3d/main.js), so they read at the
 *  re-theme's lower camera (buildings keep their footprints). The renderer's hit test and selection rings scale by it. */
export const UNIT_ART_SCALE = 1.4;
/** Each game seat's spot on the menus' board (seats.js): a player keeps its spot's colour in the game, whatever seat
 *  its side gives it. Set when a game starts (single player's `startSetup`, a room's `setup.spots`); none: a seat's
 *  own number. */
let spotOf = [];
export const setSpots = (spots) => { spotOf = Array.isArray(spots) ? spots.slice() : []; };
/** The colour (an index into SEAT_COLORS) seat `seat` plays in. */
export const colorOf = (seat) => spotOf[seat] ?? seat;

/** The Expedition's lights: neutral white LEDs (tools/render3d/expedition-buildings.js: never warm, never a seat's). */
const LED = 0xe6f0ff;

/** Buildings: `glow` [colour, size, strength, px above the centre (negative: below), flicker, px east of the centre], `head` (a turret head sprite that
 * turns to aim), `smoke` (points in px from the footprint's top-left corner that puff while the building works). Each
 * measured on its model (tools/render3d/kingdom-buildings.js, expedition-buildings.js): a point (x, y, z) of a model
 * centred on its footprint is drawn x east and y * 1.19 - z above the centre at the 40-degree camera. The smoke rises
 * from the top of the grey puffs drawn over each stack, so the live puffs carry them on. */
export const BLDG_LOOK = {
  core: { smoke: [[106, 4]] },                                                       // (the Castle: the great hall's chimney; no light)
  depot: { smoke: [[42, -28]] },                                                     // (the Cottage's chimney at its east gable)
  barracks: { smoke: [[25, -31]] },                                                  // (the Barracks' chimney at the hall's west end)
  forge: { glow: [0xff5a1e, 0.6, 0.45, -1, true, 6], smoke: [[21, -35], [41, 9]] }, // (the Blacksmith's ember on the hearth out in the yard; its stack's smoke and the flue's behind the hearth)
  turret: { head: 'turret_head' },                                                   // (the Watchtower's archer turns)
  // the Expedition: its white LEDs
  conflux: { glow: [LED, 1.1, 0.28, 0, false, -14] },                                // (the Data centre's three lit fans in its south face)
  siphon: { glow: [LED, 0.5, 0.45, -3, false, 14] },                                // (the Recruiting post's tent: the lantern on its pole at the door; the population building, a timber booth, has no light)
  kiln: { glow: [LED, 0.7, 0.4, 18, false, -4] },                                    // (the Factory's work lamp over the bay)
  loom: { glow: [LED, 1.0, 0.3, 5, false, -4] },                                     // (the Lab's lit glass front)
  ward: { head: 'ward_head', glow: [LED, 0.35, 0.5, 70, false, 0] },                 // (the Radio tower's turret turns; the LED on its mast top)
  eclipse: { glow: [LED, 0.9, 0.35, 34, false, 0] },                                 // (the Portal's lit cabinet at the back of its platform)
};

/** Units: the pitch of their radio chirp (Hz): heavy machines low, flyers and medics high. */
export const UNIT_VOICE = { harvester: 330, trooper: 520, lancer: 600, medic: 760, vanguard: 260, siegeTank: 230, interceptor: 380, raider: 880, observer: 1040, lumen: 700, scythe: 460, prism: 820, monolith: 220, shrike: 960, halo: 940, umbra: 400, bastion: 180, sovereign: 160 };

/** The shots (tools/art/effects3.js): each projectile's sprite by its shooter's kind (`SHOT_LOOK`), else by its people
 *  and projectile kind (`PEOPLE_SHOT`); a building's shot (no shooter kind: the Watchtower's, the Radio tower's) by its
 *  people (`TOWER_SHOT`). The kingdom shoots arrows, ballista bolts and trebuchet stones; the Expedition rifle tracers,
 *  rockets and the Drone's darts. Each sprite points +x with its tip at its anchor (a stone: its middle). */
export const SHOT_LOOK = { lancer: 'arrow', bastion: 'ballista_bolt', siegeTank: 'stone', prism: 'tracer', monolith: 'rocket', shrike: 'dart' };
export const PEOPLE_SHOT = { humans: { bolt: 'arrow', shell: 'stone', missile: 'ballista_bolt' }, vael: { bolt: 'tracer', shell: 'rocket', missile: 'rocket' } };
export const TOWER_SHOT = { humans: 'arrow', vael: 'tower_shot' };
/** The sprite of a shot fired by a unit of kind `by` (undefined: a building) of people `people`, its projectile kind `type`. */
export const shotArt = (by, type, people) => SHOT_LOOK[by] ?? (by ? PEOPLE_SHOT[people]?.[type] : TOWER_SHOT[people]) ?? 'arrow';
/** A shot's trail (an animation the renderer drops behind it in flight): the rocket's smoke. */
export const SHOT_TRAIL = { rocket: 'trail' };
/** The shots that carry a light of their own (a small warm glow under them): the tracers, the tower's shot, the rocket's flame. */
export const SHOT_LIT = new Set(['tracer', 'tower_shot', 'rocket']);

/** Animation frames per second by unit type (default: 14 for flyers with frames to cycle; 8 for walkers while they
 *  move). 0 holds the first frame. The Balloon (observer) has one frame, and the Ballista (bastion, a flyer in today's
 *  rules) holds its first: a cart whose wheels would turn standing still. The Drone (shrike) spins its blades at the
 *  flyers' 14/s. The retiring kinds keep theirs: the Kite (raider) glides, the Argonaut's (sovereign) four hover
 *  frames run at 4/s. */
export const UNIT_FPS = { sovereign: 4, raider: 0, observer: 0, bastion: 0 };

/** Units whose frames are poses, not one cycle: `walk` frames for the march (0 to walk - 1), then the frame shown
 *  while its toggle settles in or packs up (`swap`) and the one while it is on (`on`). The Trebuchet (siegeTank): two
 *  frames rolling, half set, set up (tools/render3d/kingdom-units.js). The Breakwater (vanguard, retiring): two strides,
 *  settling, beached with its spades out (tools/render3d/harbour-machines.js). The Guard (trooper) and the Marine
 *  (umbra) have no such pose: a dug-in Guard stands, a lurking Marine shimmers (gl/render.js). */
export const UNIT_POSE = { siegeTank: { walk: 2, swap: 2, on: 3 }, vanguard: { walk: 2, swap: 2, on: 3 } };
