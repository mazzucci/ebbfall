// How kinds look and sound beyond their sprites, by kind key: lights, turret heads, chimney smoke, radio voices.
// The renderer and the sound engine read this table instead of naming kinds, so a new race adds rows here.

/** Seat colours, by seat: the team paint of every unit, building and turret head (the art is rendered once in a neutral
 *  white with a team mask the renderer tints, docs/ART.md), and the minimap's dots with more than two seats. Seats 0
 *  and 1 keep the two-player gold and magenta; then teal, lilac, green, blue, white, red: apart from each other (also
 *  with red-green colour blindness, as far as eight allow: there lightness parts gold from green and red), from the
 *  dark ground, the selection marks and the resources' teal and violet. Shared with the art tools (tools/render3d). */
export const SEAT_COLORS = [0xd98a1f, 0xc22a5a, 0x15bd96, 0xc293e0, 0x79d85a, 0x388ef1, 0xe8e8e8, 0xe5553a];
/** Each game seat's spot on the menus' board (seats.js): a player keeps its spot's colour in the game, whatever seat
 *  its side gives it. Set when a game starts (single player's `startSetup`, a room's `setup.spots`); none: a seat's
 *  own number. */
let spotOf = [];
export const setSpots = (spots) => { spotOf = Array.isArray(spots) ? spots.slice() : []; };
/** The colour (an index into SEAT_COLORS) seat `seat` plays in. */
export const colorOf = (seat) => spotOf[seat] ?? seat;

/** Buildings: `glow` [colour, size, strength, height above the centre, flicker], `head` (a turret head sprite that
 * turns to aim), `smoke` (points in px from the footprint's top-left corner that puff while the building works). */
export const BLDG_LOOK = {
  core: { glow: [0xffd27a, 1.6, 0.35, 30, false] },
  extractor: { glow: [0xa78bfa, 1.1, 0.5, 12, false] },
  forge: { glow: [0xff8a2a, 1.2, 0.4, 12, true], smoke: [[17, 4], [47, 4]] },
  turret: { head: 'turret_head' },
  // the Vael: violet light from their crystals
  conflux: { glow: [0xb48cff, 1.6, 0.4, 26, false] },
  siphon: { glow: [0xa78bfa, 1.1, 0.55, 14, false] },
  spire: { glow: [0xb48cff, 0.9, 0.35, 34, false] },
  ward: { glow: [0xb48cff, 0.8, 0.35, 20, false] },
};

/** Units: the pitch of their radio chirp (Hz): heavy machines low, flyers and medics high. */
export const UNIT_VOICE = { harvester: 330, trooper: 520, lancer: 600, medic: 760, vanguard: 260, wasp: 880, observer: 1040, lumen: 700, scythe: 460, prism: 820, monolith: 220, shrike: 960, halo: 940, bastion: 180, sovereign: 160 };

/** Animation frames per second by unit type (default: 14 for flyers, whose rotors always spin; 8 for walkers while
 *  they move). 0 holds the first frame: the Shrike glides on its swept wing (its two poses flickered at 14/s). The
 *  Sovereign's four hover frames (a bob, its lift ring turning) run at 4/s: a heavy barge, not a bounce. */
export const UNIT_FPS = { shrike: 0, sovereign: 4 };
