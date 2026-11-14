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
  spire: { head: 'spire_head', spin: 7 },                                            // (the Wind turbine's rotor: three blades, so 16 frames a third of a turn; 7 a second is a turn in 7 s, a slow calm turbine, not a fan: 10 until 2026-11-14)
  uplink: { head: 'uplink_head', pan: [3, 9] },                                      // (the Uplink's dish pans 3 facings either way)
  eclipse: { head: 'eclipse_head', spin: 4, portal: true, glow: [0x3fe0ff, 1.1, 0.55, 31, false, 0] }, // (its cyan light, only as a unit comes through, at the standing ring's center: 26 up, so 31 px at the 40-degree camera; 8 while the Portal lay flat)                          // (the Portal's dust spiral: brighter and faster as a unit comes through, `portalOpen`)
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
/** A shot's impact by its sprite (`shotArt`): the arrows, the ballista bolt and the Drone's dart glint on steel; the
 *  tracers and the tower's shot spark; the cannonball and the rocket burst (`shell`, `rocket`: the only fire, with a
 *  dying machine's). A repairer's welding (no shot) sparks too. */
export const IMPACT = { arrow: 'glint', ballista_bolt: 'glint', dart: 'glint', tracer: 'spark', tower_shot: 'spark', cannonball: 'shell', rocket: 'rocket' };
/** The impact of a `hit` event (src/engine/core.js gives it the shot's `proj`, its shooter's kind `by` and `people`). */
export const impactOf = (e) => (e.proj ? IMPACT[shotArt(e.by, e.proj, e.people)] ?? 'spark' : 'weld');
/** The units that fall as machines (a small explosion and its light); every other unit falls as a fighter, into a
 *  puff of earth-colored dust (no fire, no scorch), or a flyer into a puff of canvas (AIR_PUFF). */
export const MACHINES = new Set(['siegeTank', 'bastion', 'scythe', 'monolith', 'shrike', 'lumen', 'umbra']);
/** The dust's tint: earth, so a melee blow's puff or a fallen fighter reads as dust, not smoke. Always on the pale
 *  round `trail`, never the `puff`, whose dark third tone the tint turns olive (a stone, not dust). */
export const DUST = 0xd8c49a;
/** A fighter's fall: a puff of dust `dy` px above its ground point, rising a little as it fades. */
export const DEATH_DUST = { anim: 'trail', tint: DUST, scale: 2.0, life: 0.7, vy: -10, fade: 0.8, dy: -4 };
/** A heavy blow's dust (MELEE_PUFF: how it looks by the striker) at the target's feet. */
export const HIT_DUST = { anim: 'trail', tint: DUST };
/** A shot that lands on a flyer (a `hit` event's `air`) plays this much of its drawn height (render.js unitTop) above
 *  its ground point, up on its body: by the flyer's kind (the Balloon: on its basket and the envelope's dark lower
 *  band, where a pale glint shows; higher it would vanish on the pale canvas), else AIR_HIT_LIFT. */
export const HIT_LIFT = { observer: 0.3 };
export const AIR_HIT_LIFT = 0.6;
/** The lift of a shot landing on a flyer of kind `air` (HIT_LIFT). */
export const hitLift = (air) => HIT_LIFT[air] ?? AIR_HIT_LIFT;
/** A fallen flyer that is no machine (the Balloon): no fireball and no dust off the ground, but a puff of pale canvas
 *  where it flew, `lift` of its drawn height (render.js unitTop) above its ground point, sinking as it fades. The
 *  rocket's pale round smoke (`trail`), not the gray `puff`, which under the canvas tint reads as a stone; about as
 *  wide as the envelope. */
export const AIR_PUFF = { anim: 'trail', lift: 0.7, tint: 0xe8dcc0, scale: 4.2, life: 1.0, vy: 20, fade: 0.85 };
/** How a unit of kind `unit` falls (`air`: it flies): 'machine' (it explodes), 'air' (AIR_PUFF) or 'dust' (a
 *  fighter's puff of earth); a building (`unit` null) explodes as a machine does. */
export const deathOf = (unit, air) => (!unit || MACHINES.has(unit) ? 'machine' : air ? 'air' : 'dust');
/** Slowed (an Archer's arrow, `u.slowed` s left): the unit's body (not its team paint) tinted a cold gray-blue, and,
 *  since a tint can only darken, a cold blue added over it (`glow`, at `glowAlpha`: the unit's additive hit-flash
 *  layer, while no hit flash shows; 0.45 read as slowed at a glance where 0.3 read as merely shaded); both back to
 *  nothing over the last `fade` s. The Archer's slow is a rule the player must see. */
export const SLOW = { tint: 0xa8bccc, glow: 0x3f7fc0, glowAlpha: 0.45, fade: 1.5 };
/** How much of the slow's look shows with `slowed` s of slow left: 1 until its last `fade` s, then down to 0. */
export const slowK = (slowed) => (slowed > 0 ? Math.min(1, slowed / SLOW.fade) : 0);
/** A unit's additive flash layer (over its body) with `flash` s of hit flash and `slowed` s of slow left: shown while
 *  either lasts; a hit's white at 0.6 over the slow's cold blue (SLOW.glow at SLOW.glowAlpha × slowK). */
export function flashLayer(flash, slowed) {
  const hit = flash > 0, k = slowK(slowed);
  return { visible: hit || k > 0, tint: hit ? 0xffffff : SLOW.glow, alpha: hit ? 0.6 : SLOW.glowAlpha * k };
}
/** The body's tint for `slowed` s of slow left (0: none, white). */
export function slowTint(slowed) {
  const k = slowK(slowed); if (!k) return 0xffffff;
  const ch = (s) => Math.round(255 + (((SLOW.tint >> s) & 255) - 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** Muzzle flash: the shooters (unit kinds, and building types by their `fire` event at the building's center) that show
 *  a short flash at the gun's mouth when they fire: where it is, `fwd` px ahead along the aim and `up` px above the
 *  ground point at zoom 1 (measured on the models: the Android's rifle low across its hips, the Sentry gun's barrel
 *  end on its turret, the Buggy's crew firing over the roll cage's front edge: the model shows no gun), and how big: a
 *  rifle's cone (`muzzle`, pale, turned to the aim) on every shot. No flash for the Drone. */
export const MUZZLE_FLASH = { umbra: { fwd: 18, up: 14, scale: 0.6 }, scythe: { fwd: 6, up: 22, scale: 0.6 }, ward: { fwd: 42, up: 23, scale: 0.85 } };
/** A melee blow landing (a `fire` event at a melee shooter): a glint of steel at its target (glint_f: small and pale, the fiery spark being the gunpowder's), and for the heavy hitters (the
 *  Knight's lance, the Bruiser's hammer) a small puff of dust there too (HIT_DUST): its size, opacity at the start, life (s) and drift (px/s at the start,
 *  away from the striker). The Knight's lance kicks up more and flings it farther. */
export const MELEE_PUFF = { knight: { scale: 1.5, fade: 0.85, life: 0.6, drift: 28 }, bruiser: { scale: 1.0, fade: 0.7, life: 0.5, drift: 12 } };
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
/** The melee units' strike poses (tools/render3d: `<kind>_<dir>_wind` and `<kind>_<dir>_strike`, 16 facings, not in
 *  the walk animation): only the weapon arm moves, the feet planted, the body and the anchor where they stand. The
 *  strike (the weapon thrust or chopped) shows for `HOLD` s after the blow, when the cooldown starts again; the
 *  wind-up (the weapon drawn back or raised) whenever the unit stands with its target in reach otherwise: as the next
 *  blow nears, and on guard between blows (two frames, so the wait is the wind-up held: a fighter never stands frozen
 *  mid-stride). */
export const STRIKE = { kinds: new Set(['trooper', 'rider', 'knight', 'prism', 'bruiser']), HOLD: 0.15 };
/** The edge distance from (x, y) to `t` (a unit: its center less its radius; a building: the nearest point of its
 *  footprint), in world px: the sim's `Geo::edge_dist`. */
function edgeDist(x, y, t) {
  if (t.kind !== 'bldg') return Math.hypot(t.x - x, t.y - y) - t.r;
  const cx = Math.min(Math.max(x, t.tx * 32), (t.tx + t.w) * 32), cy = Math.min(Math.max(y, t.ty * 32), (t.ty + t.h) * 32);
  return Math.hypot(cx - x, cy - y);
}
/** Whether melee unit `u` has its target in reach (the sim's: its range in tiles plus half its radius, from the
 *  target's edge; a little slack for the frames between ticks). */
export function inReach(u, t = u.task?.target) {
  const w = u.d?.weapon;
  return !!(w && t && !t.dead && edgeDist(u.x, u.y, t) <= w.range * 32 + u.r * 0.5 + 2);
}
/** The strike pose a unit shows now ('wind', 'strike' or null: its walk or toggle), from the client's mirror: its
 *  cooldown `u.cd` (s; the sim sets it to the weapon's `cd` as the blow lands and counts it down, past zero while
 *  nothing is fought) and its target (`u.task.target`). Not whether it moves: with its target in reach a fighter
 *  stands (the sim's `approach` stops it there), and what moves it then is the crowd's shove, which must not flash
 *  the walk's stride. */
export function strikePose(u) {
  if (!STRIKE.kinds.has(u.type) || u.inside) return null;
  const cd = u.d?.weapon?.cd; if (!cd) return null;
  if (u.cd > cd - STRIKE.HOLD) return 'strike'; // (the blow just landed)
  if (!inReach(u)) return null;
  return 'wind'; // (the blow coming, or on guard till then)
}
