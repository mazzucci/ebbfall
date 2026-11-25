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
/** Each seat color's paint: the tint that, multiplied into the art's neutral team masks, comes out as that seat's color
 *  on the field (fitted on the older renders, whose masks the painted ones match in value; the art's index carried
 *  them until the last of the older pages went: test/newart.test.js pins them to the older atlas's). */
export const SEAT_TINTS = [0x2a5ddf, 0xee376a, 0x21a679, 0xdfafed, 0xa6ed6e, 0x96f0e7, 0xa62985, 0xf25a32];
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


/** Buildings: `head` (a head sprite drawn over the base in 16 frames: by default it turns to aim, a turret's; `spin`
 * [frames a second]: it cycles through them on the renderer's clock, a rotor; `pan` [frames either side, seconds a
 * sweep]: it sweeps slowly to and fro about its first frame, a dish), `portal` (its swirl). The renderer (render.js
 * `bldgLook`) lays the art's own points over these (index.json `looks`, measured on the pictures by tools/newart/bldg):
 * `glow` [color, size, strength, px above the center, flicker, px east of it], `smoke` (points in px from the
 * footprint's top-left corner: a puff rises from one of them now and then, only while the building works,
 * `chimneyActive`; null: none), `z` and `base` (its outline on the ground). */
export const BLDG_LOOK = {
  turret: { head: 'turret_head' },                           // (the Watchtower's archer turns)
  ward: { head: 'ward_head' },                               // (the Sentry gun turns to its target)
  spire: { head: 'spire_head', spin: 7 },                    // (the Wind turbine's rotor: three blades, so 16 frames a third of a turn; 7 a second is a turn in 7 s, a slow calm turbine, not a fan: 10 until 2026-11-14)
  uplink: { head: 'uplink_head', pan: [3, 9] },              // (the Uplink's dish pans 3 facings either way)
  eclipse: { head: 'eclipse_head', spin: 4, portal: true },  // (the Portal's swirl: brighter and faster as a unit comes through)
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
export const SHOT_LOOK = { lancer: 'arrow', bastion: 'ballista_bolt', siegeTank: 'cannonball', umbra: 'tracer', monolith: 'rocket', shrike: 'tower_shot' }; // (the Drone: the Sentry mast's short LED tracer; its charcoal `dart` was a 1 px dash, lost on a phone)
export const PEOPLE_SHOT = { humans: { bolt: 'arrow', shell: 'cannonball', missile: 'ballista_bolt' }, vael: { bolt: 'tracer', shell: 'rocket', missile: 'rocket' } };
export const TOWER_SHOT = { humans: 'arrow', vael: 'tower_shot' };
/** The sprite of a shot fired by a unit of kind `by` (undefined: a building) of people `people`, its projectile kind `type`. */
export const shotArt = (by, type, people) => SHOT_LOOK[by] ?? (by ? PEOPLE_SHOT[people]?.[type] : TOWER_SHOT[people]) ?? 'arrow';
/** How each shot is drawn so that it reads at a phone's zoom (1 world px a CSS px), by its sprite. The Kingdom's shafts
 *  are timber, drawn `scale` times their sprite over a dark bar `bar` world px thick (a silhouette: a pale shaft on a dark
 *  line reads on grass and rock alike), and never glow. The Expedition's are light: every tracer is tinted `tint`, a
 *  cool LED white, and carries a glow (SHOT_LIT, SHOT_GLOW). The cannonball and the rocket keep their own look. */
export const SHOT_STYLE = { arrow: { scale: 1.25, bar: 2.4 }, ballista_bolt: { scale: 1.6, bar: 3.2 }, tracer: { tint: 0xdff6ff }, tower_shot: { tint: 0xdff6ff } };
/** The dark of a Kingdom shot's bar, and its opacity. */
export const SHOT_BAR = { tint: 0x10161e, alpha: 0.6 };
/** The glow under an Expedition tracer (SHOT_LIT): the same cool LED white. The rocket keeps its warm flame. */
export const SHOT_GLOW = 0xbfefff;
/** A heavy shot (hitTier against what it flies at: the Android's tracer, a Ballista bolt at a flyer) drags a copy of
 *  itself stretched `px` world px back along its flight at `alpha`: a motion streak in the shot's own colors (a Kingdom
 *  shaft's timber, never cooled, never lit; a tracer's its cool LED white), nothing more. */
export const HEAVY_TRAIL = { px: 30, alpha: 0.4 };
/** Whether a building's chimney smokes right now: it stands and works (a unit in its queue or a research under way;
 *  `b` is the client's mirror of it, src/engine/core.js). */
export const chimneyActive = (b) => !!(b.done && (b.queue.length || b.research));

/** Muzzle smoke: the unit kinds that leave a puff where they fire (a `fire` event at the shooter), and how big. */
export const MUZZLE_SMOKE = { siegeTank: 1.4 };
/** A shot's impact by its sprite (`shotArt`): the arrows, the ballista bolt and the Drone's dart glint on steel; the
 *  tracers and the tower's shot spark; the cannonball and the rocket burst (`shell`, `rocket`: the only fire, with a
 *  dying machine's). A repairer's welding (no shot) sparks too. */
export const IMPACT = { arrow: 'glint', ballista_bolt: 'glint', tracer: 'glint', tower_shot: 'glint', cannonball: 'shell', rocket: 'rocket' };
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
 *  fighter's puff of earth); a building (`unit` null): 'collapse' (BLDG_DEATH). */
export const deathOf = (unit, air) => (!unit ? 'collapse' : MACHINES.has(unit) ? 'machine' : air ? 'air' : 'dust');
/** The gray of a fall's smoke: on the soft round `trail` (the chunky `puff` breaks up at 3x above scale 2), at `fade`. */
export const GRAY_SMOKE = { tint: 0x8c8c8c, fade: 0.8 };
/** A building's fall (Stelian, 2026-11-15, the designer's option C, and the designer's notes on it): it collapses, it
 *  does not explode. No fireball, no fire sparks, no orange light and no scorch; its rubble and its debris (fx.js burst)
 *  as before. Its sprite stays on as a ghost for `ghost.life` s after the sim drops it, sinking `sink` px (eased in) and
 *  squashed to `squash` of its height, fading out over the last `fadeLast` s, and dimmed to `dim` as it goes (eased in)
 *  with its team paint, whose opacity is the ghost's: a flag fading sooner left the art's white cloth under it, a pale
 *  pane by the rubble; dimmed, the flag goes down into the dust with its walls (`ghostAt`). Only a headquarters shakes the camera: ±(`base` + `perTile` × its
 *  width in tiles) px, dying away over `life` s. By people (G.factions): the Kingdom's stone falls into dust (DUST on
 *  the pale `trail`, `n` puffs at random points of its footprint, `stagger` s apart, scale r/`perR`), settling; the
 *  Expedition's metal into gray smoke (GRAY_SMOKE, at most `max`: about 38 px, never above 1.2 tiles; a bigger
 *  footprint gets more puffs, not bigger ones: `nBig` from `bigW` tiles wide), rising, with cold glints and a brief
 *  pale flash; either way gray smoke off its roof line. By type, over the people's: the Data center's small reactor goes
 *  off on its roof first (`boom`: a white core `coreLife` s, then the fire, about a tile across), its smoke after it
 *  (`smokeAt`); the Portal loses its power instead (`portal`: BLDG_DEATH.portal, `portalGhost`), into cold steel rubble
 *  (`rubbleTint`, a cyan glow on `rubbleGlow` of its chunks). The random points are the client's, never the sim's. */
export const BLDG_DEATH = {
  ghost: { life: 0.45, sink: 14, squash: 0.8, fadeLast: 0.25, dim: 0.5 },
  shake: { base: 0.5, perTile: 0.5, life: 0.3 },
  humans: {
    dust: { anim: 'trail', tint: DUST, n: 4, stagger: 0.1, perR: 16, life: 1.2, vy: -8, fade: 0.85 },
    smoke: { anim: 'trail', ...GRAY_SMOKE, n: 2, scale: 2.0, life: 1.5, vy: -12 },
  },
  vael: {
    dust: { anim: 'trail', ...GRAY_SMOKE, n: 4, nBig: 7, bigW: 4, stagger: 0.1, perR: 12, max: 3.2, life: 1.2, vy: -12 },
    smoke: { anim: 'trail', ...GRAY_SMOKE, n: 2, scale: 2.0, life: 1.5, vy: -12 },
    glint: { n: 3, over: 0.4, tint: 0xa8f0ff, light: 0x7fd8ff, lightScale: 0.3, life: 0.3, scale: 1.5 },
    flash: { scale: 0.5, tint: 0xbfefff, life: 0.12 },
  },
  types: {
    conflux: { // (the Data center's small reactor, on its roof: cause, then its smoke)
      boom: { at: 0.25, coreLife: 0.067, core: { anim: 'flash', tint: 0xffffff, scale: 2.25 }, fire: { anim: 'boom_small', scale: 1.3, light: 0xff9a3a, lightScale: 0.7, life: 0.4 } },
      smokeAt: 0.35,
    },
    eclipse: { portal: true, rubbleTint: 0xc4cedb, rubbleGlow: 2 }, // (the Portal: its power lost)
  },
  /** The Portal (the coder lead's spec, 2026-11-15): no sink, no shake, no scorch, no boom. Till `hold` s the ghost
   *  holds while its additive flash layer fades in cyan to `flash.alpha` and its glow light swells from `glow.from` to
   *  `glow.peak`; then till `end` the glow shrinks to nothing and the ghost narrows to `squeezeX` of its width, fading
   *  out, as `glints.n` glints fly in from `glints.out` px to its ring; at `end` a cyan blink on the ring (a light alone,
   *  `blink.scale` down to 0 over `blink.life` s), then gray smoke rising off its base (`puffs`, ±`spread` px) and its
   *  rubble. Power lost, not a blast. */
  portal: {
    hold: 0.2, end: 0.5, squeezeX: 0.85,
    flash: { tint: 0x3fe0ff, alpha: 0.6 },
    glow: { tint: 0x3fe0ff, from: 1.1, peak: 2.2 },
    glints: { n: 4, out: 40, speed: 120, life: 0.3, tint: 0xa8f0ff, light: 0x7fd8ff, lightScale: 0.2 },
    blink: { tint: 0x3fe0ff, scale: 2.4, life: 0.15 },
    puffs: { anim: 'trail', ...GRAY_SMOKE, n: 3, spread: 12, scale: 2.1, life: 1.5, vy: -12 },
  },
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** A dying building's ghost `t` s after the sim dropped it: how far it has sunk (px), its height's scale, its opacity
 *  (its team paint's too) and how bright it is drawn (`tint`: a gray, multiplied into its body and its paint). */
export function ghostAt(t) {
  const { life, sink, squash, fadeLast, dim } = BLDG_DEATH.ghost, k = clamp01(t / life), e = k * k; // (eased in)
  const g = Math.round(255 * (1 - (1 - dim) * e));
  return { dy: sink * e, scaleY: 1 - (1 - squash) * e, alpha: clamp01((life - t) / fadeLast), tint: (g << 16) | (g << 8) | g };
}
/** A dying Portal `t` s after the sim dropped it (BLDG_DEATH.portal): its ghost's width scale and opacity, its cyan flash
 *  layer's opacity and its glow light's scale. */
export function portalGhost(t) {
  const { hold, end, squeezeX, flash, glow } = BLDG_DEATH.portal;
  if (t < hold) { const k = Math.max(0, t / hold); return { scaleX: 1, alpha: 1, flash: flash.alpha * k, glow: glow.from + (glow.peak - glow.from) * k }; }
  const k = Math.min(1, (t - hold) / (end - hold));
  return { scaleX: 1 - (1 - squeezeX) * k, alpha: 1 - k, flash: flash.alpha * (1 - k), glow: glow.peak * (1 - k) };
}
/** The camera's shake for a fall of a `w`-tile-wide building (`hq`: a headquarters; none for anything else): its reach
 *  (± px) and how long it lasts (s). */
export const fallShake = (w, hq) => (hq ? { px: BLDG_DEATH.shake.base + BLDG_DEATH.shake.perTile * w, life: BLDG_DEATH.shake.life } : null);
/** How building `b` falls (its footprint `tx, ty, w, h` in tiles, its center `x, y` and radius `r` in world px, its
 *  `type`), of people `people`: its ghost's life (s), the shake (fallShake), when its rubble lies down (s), its rubble's
 *  tint and glowing chunks (`rubble`: { tint, glow: [[x, y]...] }) and every effect to spawn, `at` s after the fall:
 *  `{ at, anim, x, y, o }` (o: addEffect's options) or `{ at, blink, x, y }` (a light alone). `hq`: a headquarters;
 *  `roof`: the y of its art's top; `core`: its light's point (the Portal's ring, the Data center's chip on its roof);
 *  `rand`: the client's RNG (Math.random), for the random points. */
export function bldgDeath(b, people, { hq = false, roof = b.y - 40, core = { x: b.x, y: b.y }, rand = Math.random } = {}) {
  const T = BLDG_DEATH.types[b.type] || {}, steps = [], x0 = b.tx * 32, y0 = b.ty * 32, w = b.w * 32, h = b.h * 32;
  const spot = () => [x0 + 8 + rand() * (w - 16), y0 + 8 + rand() * (h - 16)];
  const smoke = ({ anim, tint, fade, scale, life, vy }) => ({ anim, o: { scale, life, vy, tint, fade } });
  if (T.portal) {
    const P = BLDG_DEATH.portal, g = P.glints, p = P.puffs;
    for (let i = 0; i < g.n; i++) { // (from all round the ring, each a little off a square's corners)
      const a = (i + rand() * 0.5) / g.n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      steps.push({ at: P.hold, anim: 'glint', x: core.x + c * g.out, y: core.y + s * g.out, o: { vx: -c * g.speed, vy: -s * g.speed, life: g.life, tint: g.tint, light: g.light, lightScale: g.lightScale } });
    }
    steps.push({ at: P.end, blink: P.blink, x: core.x, y: core.y });
    for (let i = 0; i < p.n; i++) steps.push({ at: P.end, x: b.x + (p.n > 1 ? (i / (p.n - 1) * 2 - 1) * p.spread : 0), y: b.y, ...smoke(p) }); // (off its base, not the ring)
    const glow = Array.from({ length: T.rubbleGlow }, spot);
    return { portal: true, life: P.end, shake: null, rubbleAt: P.end, rubble: { tint: T.rubbleTint, glow }, steps };
  }
  const L = BLDG_DEATH[people === 'vael' ? 'vael' : 'humans'], d = L.dust, sm = L.smoke, from = T.smokeAt || 0;
  const n = d.nBig && b.w >= d.bigW ? d.nBig : d.n, scale = Math.min(d.max ?? Infinity, b.r / d.perR);
  for (let i = 0; i < n; i++) { const [x, y] = spot(); steps.push({ at: from + i * d.stagger, anim: d.anim, x, y, o: { scale, life: d.life, vy: d.vy, fade: d.fade, tint: d.tint } }); }
  for (let i = 0; i < sm.n; i++) steps.push({ at: from, x: b.x + (i - (sm.n - 1) / 2) * w * 0.4, y: roof, ...smoke(sm) });
  if (L.glint) { const g = L.glint; for (let i = 0; i < g.n; i++) { const [x, y] = spot(); steps.push({ at: i * g.over / g.n, anim: 'glint', x, y: y - 10, o: { life: g.life, scale: g.scale, tint: g.tint, light: g.light, lightScale: g.lightScale } }); } }
  if (L.flash) steps.push({ at: 0, anim: 'flash', x: b.x, y: b.y - 8, o: { scale: L.flash.scale, tint: L.flash.tint, life: L.flash.life } });
  if (T.boom) {
    const B = T.boom, { anim: ca, ...co } = B.core, { anim: fa, ...fo } = B.fire;
    steps.push({ at: B.at, anim: ca, x: core.x, y: core.y, o: { ...co, life: B.coreLife } });
    steps.push({ at: B.at + B.coreLife, anim: fa, x: core.x, y: core.y, o: fo });
  }
  return { portal: false, life: BLDG_DEATH.ghost.life, shake: fallShake(b.w, hq), rubbleAt: 0, rubble: null, steps };
}
/** A building burning (below a quarter of its health): on each of its smoke's puffs, with this chance, a brief orange
 *  flash with a light of this scale (every other puff at full light strobed). */
export const BURN_FLASH = { chance: 0.25, light: 0xff8a2a, lightScale: 0.4 };
/** Muzzle flash: the shooters (unit kinds, and building types by their `fire` event at the building's center) that show
 *  a short flash at the gun's mouth when they fire: where it is, `fwd` px ahead along the aim and `up` px above the
 *  ground point at zoom 1 (measured on the models: the Android's rifle low across its hips, the Sentry gun's barrels'
 *  ends over its mast, `depth`: how far they reach up and down the screen, of sideways, as the picture's camera sees them, the Buggy's crew firing over the roll cage's front edge: the model shows no gun), and how big: a
 *  rifle's cone (`muzzle`, pale, turned to the aim) on every shot. No flash for the Drone. */
export const MUZZLE_FLASH = { umbra: { fwd: 18, up: 14, scale: 0.6 }, scythe: { fwd: 6, up: 22, scale: 0.6 }, ward: { fwd: 40, up: 33, depth: 0.56, scale: 0.85 } };
/** Where a shooter at ground point (x, y) aiming along `face` (radians) has its gun's mouth (a MUZZLE_FLASH row). */
export function muzzlePoint(x, y, face, { fwd, up, depth = 1 }) {
  const c = Math.cos(face), s = Math.sin(face), d = fwd / Math.hypot(c, s / depth);
  return { x: x + c * d, y: y + s * d - up };
}
/** The shots of a tower drawn from its gun's mouth, not from the ground under it (the sim flies every shot from its
 *  shooter's center): the tower types, whose mouth MUZZLE_FLASH says (the Sentry mast's, between its two barrels). */
export const SHOT_FROM = new Set(['ward']);
/** Which of `towers` (its own side's, drawn from the mouth) fired the shot `p` at (p.x, p.y) flying at (p.ax, p.ay): the
 *  one it flies straight away from, or null (it fell meanwhile). The sim's shot names no building. */
export function firedBy(p, towers) {
  let best = null, off = 32;
  const dx = p.ax - p.x, dy = p.ay - p.y, d = Math.hypot(dx, dy) || 1;
  for (const b of towers) {
    const bx = p.x - b.x, by = p.y - b.y, far = Math.hypot(bx, by);
    if (far > 32 && bx * dx + by * dy <= 0) continue; // (behind it: it flies toward this one)
    const o = far <= 8 ? far / 8 : Math.abs(bx * dy - by * dx) / d;
    if (o < off) { off = o; best = b; }
  }
  return best;
}
/** Where a tower's shot `p` is drawn, and the way it points: on the line from the gun's mouth of the tower `b` to its aim, as far
 *  along it as the sim's is from the tower's center. */
export function shotDrawn(p, b, muzzle = MUZZLE_FLASH[b.type]) {
  const gone = Math.hypot(p.x - b.x, p.y - b.y), left = Math.hypot(p.ax - p.x, p.ay - p.y), k = gone / (gone + left || 1);
  const m = muzzlePoint(b.x, b.y, Math.atan2(p.ay - b.y, p.ax - b.x), muzzle);
  return { x: m.x + (p.ax - m.x) * k, y: m.y + (p.ay - m.y) * k, rot: Math.atan2(p.ay - m.y, p.ax - m.x) };
}
/** A melee blow landing (a `fire` event at a melee shooter): a glint of steel at its target (glint_f: small and pale, the fiery spark being the gunpowder's), and for the heavy hitters (the
 *  Knight's lance, the Bruiser's hammer) a small puff of dust there too (HIT_DUST): its size, opacity at the start, life (s) and drift (px/s at the start,
 *  away from the striker). The Knight's lance kicks up more and flings it farther. */
export const MELEE_PUFF = { knight: { scale: 1.5, fade: 0.85, life: 0.6, drift: 28 }, bruiser: { scale: 1.0, fade: 0.7, life: 0.5, drift: 12 } };
/** How hard a hit lands, one scale for every unit and tower (Stelian, 2026-11-18): by its weapon's damage per hit
 *  against what it struck (its base `dmg` on the ground, `dmgAir` on a flyer (`air`); upgrades stay in its tier), read
 *  from the data, so a new unit or a rebalance follows by itself. A Ballista bolt into a Guard is a medium hit (24),
 *  into a Drone a heavy one (56). 'light' up to `light` (most of a fight), 'medium' up to `medium`, 'heavy' up to
 *  `heavy`, and 'siege' above it with splash (above it without splash: still 'heavy'). No weapon (a repairer's
 *  welding): 'light'. */
export const HIT_TIERS = { light: 12, medium: 30, heavy: 80 };
export function hitTier(weapon, air = false) {
  const d = (air && weapon?.dmgAir > 0 ? weapon.dmgAir : weapon?.dmg) ?? 0;
  if (d <= HIT_TIERS.light) return 'light';
  if (d <= HIT_TIERS.medium) return 'medium';
  return d <= HIT_TIERS.heavy || !(weapon.splash > 0) ? 'heavy' : 'siege';
}
/** Steel's cool white-blue: every shot's hit, light to heavy, is this color (its star, its flash, its chips), and no
 *  muzzle flash is: a gun's mouth stays warm orange. Fire lands only with a shell, a rocket or a siege blast. */
export const HIT_STEEL = 0xcfe4ff;
/** A shot that lands on a walker plays this much of its drawn height (render.js unitTop) above its ground point, on its
 *  body (a melee blow's glint lands there too, render.js meleeHit): the `hit` event carries the target's ground point. */
export const WALKER_HIT_LIFT = 0.5;
/** Each tier's look over the shot's or the blow's own (IMPACT, meleeHit), none for 'light'. `flash`: a round flash where
 *  it lands, at that scale, tinted and lit `light` (`lightScale`); `hit`: in place of the shot's own impact, 'blow' (a
 *  bright flash and three flung chips of steel, `chip.anim`: glints, no fire on a lance, a hammer or a bolt) or 'blast'
 *  (an explosion, a flash and fiery sparks), at `size`, its flash `flashK` times and its chips `chip.scale` times their
 *  own size, living `chip.life` times as long; `scuff`, a melee blow's ring of dust kicked out round the target's feet
 *  (`n` puffs on a ring `r` px out, flying out at `speed` px/s, at `scale`, for `life` s); `muzzle`: a ranged one's big
 *  round flash where it fires (at the gun's mouth: MUZZLE_FLASH's spot when it has one, else `fwd`/`up`), at that
 *  scale, in `muzzleLight` (warm: a hit is steel's cool, HIT_STEEL); `weight`: the impact sound's (audio.js `hit`: 0
 *  today's tick, 3 the shell's thud). */
export const HIT_LOOK = {
  light: { weight: 0 },
  medium: { flash: 0.7, light: HIT_STEEL, lightScale: 0.3, weight: 1 },
  heavy: { hit: 'blow', size: 0.9, flashK: 1.7, chip: { anim: 'glint', scale: 1.5, life: 1.3 }, scuff: { n: 6, r: 10, speed: 45, scale: 0.8, life: 0.4 }, light: HIT_STEEL, muzzle: 0.7, muzzleLight: 0xfff0d0, weight: 2 },
  siege: { hit: 'blast', size: 1.0, flashK: 1, chip: { anim: 'spark', scale: 1, life: 1 }, light: 0xff9a3a, muzzle: 0.9, muzzleLight: 0xff9a3a, weight: 3 },
};
/** Where a gun's round flash goes without a MUZZLE_FLASH spot of its own (the Cannon's barrel, the Rover's launcher). */
export const MUZZLE_AT = { fwd: 14, up: 10 };
/** The tower of people `people` (its builds: the one with a weapon), whose shots carry no shooter kind. */
export const towerOf = (people, FACTIONS, BUILDINGS) => {
  const f = FACTIONS[people]; return f ? [...f.buildBasic, ...f.buildAdvanced].find(k => BUILDINGS[k]?.weapon) : undefined;
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
