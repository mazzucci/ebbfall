// The re-theme's models (the kingdom, kingdom.js and kingdom-units.js; the Expedition, expedition.js and
// expedition-units.js; the countryside, country.js). Two ways out: `atlasSprites` (below) renders them into the atlas
// under today's sprite names (main.js, for tools/art/generate.mjs), and `rethemeSprites` renders them by filter under
// their own names for the review pictures (tools/art/retheme-*.mjs). Those names: `kg_<kind>_<dir>_<frame>` and
// `ex_<kind>_<dir>_<frame>` for the units (16 facings, two frames unless `frames` says otherwise: the Trebuchet's four
// poses, the Balloon's one), `bldg_kg_<kind>` and `bldg_ex_<kind>` for the buildings, `kg_towerhead_<dir>` /
// `ex_radiohead_<dir>` for the two turning heads (RT_HEADS), `rt_coins` for the gold deposit (not team), the
// ground family's `rt_*` (the gold, the scenery, each people's construction and rubble) and `rt_mine_<stage>` for the
// gold mine (mine.js: full, low, empty; neutral, 2x2). The kingdom is palette B
// (slate) and the Expedition its one dark-kit look (Stelian, 2026-11-10). The camera: `elev` degrees (RT_ELEV, the
// game's 40, by default). Units are drawn UNIT_SCALE larger than their sim size (Stelian: "a bit larger so they can
// be distinguished"; visual only, the footprint and radius unchanged); buildings stay their footprint's. Three
// buildings are turned a fixed angle about the vertical (BLDG_YAW) and fitted to their footprint; the rest stand square.
import * as THREE from 'three';
import { liftAt, S } from './scene.js';
import { NEUTRAL } from './materials.js';
import { makeKingdomMats, villager, guard, knight, castle } from './kingdom.js';
import { archer, rider, ballista, trebuchet, balloon } from './kingdom-units.js';
import { makeExpeditionMats, utilityBot, buggy, marine, coins } from './expedition.js';
import { mercenary, veteran, rover, drone } from './expedition-units.js';
import { goldField, GOLD_VARIANT_COUNT, RT_SCENERY, RT_SITES } from './country.js';
import { countryPolish } from './country.js'; // (the polish pass, the ground family: the country's own materials follow the render's `polish`)
import { goldMine, MINE_STAGES, MINE_H, MINE_N } from './mine.js';
import { POLISH } from './polish.js';
import { UNIT_ART_SCALE } from '../../src/client/look.js';
import * as KB from './kingdom-buildings.js';
import * as EB from './expedition-buildings.js';

export const RT_ELEV = 40;
export const UNIT_SCALE = UNIT_ART_SCALE; // (look.js: the game draws its units this much larger than the sim's size)
/** The sun's height for the units (scene.js SUN_UP 420 for everything else): a shade higher, so a unit's cast shadow is
 *  0.31 of its height long instead of 0.36 and sits closer under it (the legibility pass, 2026-11-11). */
export const UNIT_SUN = 480;
/** The units: kind -> builder, the cell's radius and height at sim scale (scaled by UNIT_SCALE for the render) and its
 *  frames (2 by default: the walk). Flyers' cells hold the flyer and its shadow (0.4 of the height east, 0.3 south). */
export const RT_UNITS = {
  kg: {
    villager: { build: villager, r: 13, h: 24 }, guard: { build: guard, r: 22, h: 26 }, knight: { build: knight, r: 27, h: 32 },
    archer: { build: archer, r: 18, h: 26 }, rider: { build: rider, r: 24, h: 32 },
    ballista: { build: ballista, r: 18, h: 22 }, trebuchet: { build: trebuchet, r: 24, h: 30, frames: 4 }, balloon: { build: balloon, r: 22, h: 42, frames: 1 },
  },
  ex: {
    bot: { build: utilityBot, r: 15, h: 13 }, buggy: { build: buggy, r: 16, h: 24 }, marine: { build: marine, r: 15, h: 20 },
    mercenary: { build: mercenary, r: 15, h: 19 }, veteran: { build: veteran, r: 18, h: 24 },
    rover: { build: rover, r: 20, h: 20 }, drone: { build: drone, r: 16, h: 24 },
  },
};
/** The two main buildings; `hall` is the Data center (expedition-buildings.js `dataBlock`, Stelian's pick of the two
 *  options drawn on 2026-11-11; `serverHall` the other, kept under `datahall` for the record and the pictures). */
export const RT_BUILDINGS = { kg: { castle: { build: castle, n: 4, h: 76 } }, ex: { hall: { build: EB.dataBlock, n: 4, h: 88 }, datahall: { build: EB.serverHall, n: 4, h: 66 } } };
// ---- the buildings family (kingdom-buildings.js, expedition-buildings.js; the slot each takes is in the brief) ----
Object.assign(RT_BUILDINGS.kg, {
  cottage: { build: KB.cottage, n: 2, h: 34 }, market: { build: KB.market, n: 2, h: 36 }, barracks: { build: KB.barracks, n: 3, h: 48 },
  blacksmith: { build: KB.blacksmith, n: 2, h: 40 }, workshop: { build: KB.workshop, n: 3, h: 56 }, tower: { build: KB.watchtower, n: 2, h: 82 },
  stables: { build: KB.stables, n: 3, h: 30 },
});
Object.assign(RT_BUILDINGS.ex, {
  // Swapped (Stelian, 2026-11-11, after four blind checks read each as the other's role): the windowed booth is the
  // population building (the "Cabin"), the big khaki tent the Recruiting post.
  bunkhouse: { build: EB.recruitingPost, n: 2, h: 34 }, post: { build: EB.bunkhouse, n: 2, h: 46 }, factory: { build: EB.factory, n: 3, h: 44 },
  lab: { build: EB.lab, n: 2, h: 50 }, radio: { build: EB.sentryGun, n: 2, h: 36 }, portal: { build: EB.portal, n: 2, h: 46 }, // (`radio`: the Sentry gun since A1, 2026-11-11, Stelian: low and squat; the mast `EB.radioTower` stays for the record)
  // A1 (2026-11-11): the Wind turbine (the Power source, to replace the Cabin under `spire`; `windfarm` the other
  // option, three small turbines on one pad, kept for the pictures) and the Uplink (3x3, the sim key `uplink`).
  turbine: { build: EB.windTurbine, n: 2, h: 84 }, windfarm: { build: EB.windFarm, n: 2, h: 50 }, uplink: { build: EB.uplink, n: 3, h: 44 },
  // Round 3 (Stelian): the Lab's dome under `labdome` and the Portal's energy gate under `gate` (`lab` and `portal` stay today's, for the pictures).
  labdome: { build: EB.labDome, n: 2, h: 40 }, gate: { build: EB.energyGate, n: 2, h: 60 }, gatetube: { build: EB.energyGateTube, n: 2, h: 60 }, ring: { build: EB.acceleratorRing, n: 2, h: 20 }, // (round 4's three Portal options, rejected; kept for the record)
  pad: { build: EB.landingPad, n: 2, h: 36 }, // (the Portal as a landing spot: the pad, the dropship its head `padhead`)
  posttent: { build: EB.postTent, n: 2, h: 36 }, posttavern: { build: EB.postTavern, n: 2, h: 40 }, posthouse: { build: EB.postHouse, n: 2, h: 36 }, // (the Recruiting post's three options)
  hangar: { build: EB.hangar, n: 3, h: 74 }, // (the Factory as a metal hangar with a cog)
});
/** The turning heads (16 facings, no shadow, drawn over their base as the game draws the turret's): the Watchtower's
 *  archer and the Radio tower's turret; the cell is the base's footprint with the head's height. A head marked `spin`
 *  is a rotor: its 16 frames are phases of a `spin`-th of a turn about its own axis (3 for three blades, which repeat
 *  every third; 1 for a whole cycle, the gate's shimmer), the builder taking the phase, and nothing turns it about the vertical; its base is square (BLDG_YAW 0), so the head
 *  needs no fit. The turbines' rotors (expedition-buildings.js `turbineRotor`, `windFarmRotor`). A head marked `shadow`
 *  is shot with its cast shadow (the Uplink's dish: the base has only the stand). */
export const RT_HEADS = {
  kg: { towerhead: { build: KB.watchtowerArcher, n: 2, h: 82 } },
  ex: { radiohead: { build: EB.sentryGunHead, n: 2, h: 36 }, turbinehead: { build: EB.turbineRotor, n: 2, h: 84, spin: true }, windfarmhead: { build: EB.windFarmRotor, n: 2, h: 50, spin: true },
    uplinkhead: { build: EB.uplinkDish, n: 3, h: 72, shadow: true }, gatehead: { build: EB.gateLight, n: 2, h: 60, spin: 1 }, gatetubehead: { build: EB.gateLight, n: 2, h: 60, spin: 1 }, ringhead: { build: EB.ringSwirl, n: 2, h: 20, spin: 1 },
    padhead: { build: EB.dropship, n: 2, h: 60, spin: 1, shadow: true } }, // (the dropship: 16 lift heights, frame 0 landed, with its shadow) // (the dish pans about the column, with its shadow, a bowl that big; the gate's light shimmers)
};
/** A head's object for frame `dir`: a rotor at its phase, any other turned about the vertical. */
function head(b, mats, dir) {
  if (b.spin) return b.build(mats, dir / FACINGS * Math.PI * 2 / b.spin);
  const obj = b.build(mats); obj.rotation.y = -dir / FACINGS * Math.PI * 2; return obj;
}
const MATS = { kg: (tc, polish) => makeKingdomMats(tc, 'B', polish), ex: (tc, polish) => makeExpeditionMats(tc, polish) };
const FACINGS = 16;
/** The buildings turned about the vertical, in degrees, one fixed angle per type (Stelian, 2026-11-11, after the yaw
 *  review: a base of squares all facing the camera read as a grid, and no per-building variants). Each angle was
 *  picked from -30 to +30 by what shows the building's signature at 1x (tools/art/retheme-bases.mjs --trial): the
 *  Castle +11 (its gatehouse and the hall's gable), the Cottage -20 (its gable and the long thatch), the Market +30
 *  (the striped stalls face the camera), the Barracks -30 (the long hall over its drill yard and dummies), the
 *  Blacksmith -20 (the open front, the hearth and the anvil), the Workshop -20 (the siege frame's triangle beside the
 *  balloon), the Stables -20 (the pen and the horse before the long stable), the Cabin -20 (its window grid and panel),
 *  the Recruiting post -10 (the tent's open front), the Factory -10 (the arm before the bay), the Lab +20 (the lit
 *  glass front and the dish), the Portal -20 (the ramp down from the round platform), the Data center -20 (its redraw
 *  of 2026-11-11: the block's south and east faces with their strips, and the chip on its lid; a 0.94 fit). Square:
 *  the round towers (their heads turn on their own). A turned building is fitted to its footprint
 *  (`fitTurned`): the footprint, hit area and rules never change, and the client's smoke and glow points for a turned
 *  building (look.js BLDG_LOOK) are measured on the turned model. */
export const BLDG_YAW = {
  kg: { castle: 11, cottage: -20, market: 30, barracks: -30, blacksmith: -20, workshop: -20, tower: 0, stables: -20 },
  ex: { hall: -20, datahall: -10, bunkhouse: -20, post: -10, factory: -10, lab: 20, radio: 0, portal: -20, turbine: 0, windfarm: 0, uplink: 0, labdome: 20, gate: 0, gatetube: 0, ring: 0, pad: 0, posttent: -10, posttavern: -10, posthouse: -10, hangar: -10 }, // (the pad square; its ship is turned in the model) // (the gate square: its light is a head) // (the Uplink's dish is turned in the model: round on the ground, so square)
};
/** The ground outline: a model's vertices up to this many units high (the earth plate and the walls' feet). */
const GROUND_Y = 4;
/** Room on every side of a turned building's cell, world px: its corners swing past the square one's. */
const TURN_ROOM = 6;

/** Cells as main.js lays them out, with the lift of this camera. */
function unitCell(r, h, lift) {
  const left = r + 2, right = r + h * 0.55 + 4, up = r + h * lift + 2, down = r + h * 0.45 + 3;
  return { w: Math.ceil((left + right) * S), h: Math.ceil((up + down) * S), ax: Math.round(left * S), ay: Math.round(up * S) };
}
function bldgCell(n, h, lift, extra = 0) { // (`extra`: room on every side for a turned building's corners)
  const W = n * 32, left = 4 + extra, right = h * 0.5 + 6 + extra, up = h * lift + 6 + extra, down = h * 0.4 + 6 + extra;
  return { w: Math.ceil((left + W + right) * S), h: Math.ceil((up + W + down) * S), ax: Math.round((left + W / 2) * S), ay: Math.round((up + W / 2) * S) };
}
/** The farthest any ground-level vertex of `obj` (world y <= GROUND_Y) lies from its axis along x or z. */
function groundReach(obj) {
  obj.updateMatrixWorld(true);
  let reach = 0; const v = new THREE.Vector3();
  obj.traverse(o => {
    if (!o.isMesh) return; const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (v.y <= GROUND_Y) reach = Math.max(reach, Math.abs(v.x), Math.abs(v.z)); }
  });
  return reach;
}
const FIT = {}; // side_kind@yaw -> the fit's scale (geometry never changes with the materials: measured once)
/** Turns a building `yaw` degrees and scales it down just enough that its ground outline spills past its n-tile
 *  footprint no more than the square model's does (never up: a model that fits keeps its size). Returns the scale. */
function fitTurned(obj, side, kind, b, mats, yaw) {
  obj.rotation.y = yaw * Math.PI / 180;
  const scale = FIT[`${side}_${kind}@${yaw}`] ??= Math.min(1, Math.max(b.n * 16, groundReach(b.build(mats))) / groundReach(obj));
  obj.scale.multiplyScalar(scale);
  return scale;
}
/** A building of `side`/`kind` built and placed: square, or turned by `yaw` (BLDG_YAW's by default) and fitted.
 *  Returns [object, cell, { yaw, scale }] (the last goes out with the sprite, for the review pictures' table). */
function building(side, kind, mats, lift, yaw = BLDG_YAW[side][kind] ?? 0) {
  const b = RT_BUILDINGS[side][kind], obj = b.build(mats);
  if (!yaw) return [obj, bldgCell(b.n, b.h, lift), { yaw: 0, scale: 1 }];
  const scale = fitTurned(obj, side, kind, b, mats, yaw);
  return [obj, bldgCell(b.n, b.h, lift, TURN_ROOM), { yaw, scale }];
}

/** Yields [name, object, cell, shootOpts, isTeam, extra] for every re-theme sprite `want(name)` asks for (`extra`: a
 *  building's `turn`, its angle and fit scale). `opts` are the
 *  render's (render3d.mjs): `elev` the camera's elevation in degrees (RT_ELEV), `sun` the sun's height (scene.js), and
 *  `polish` the polished finish and materials (polish.js: true, or an object of finish settings), and `yaws`, angles
 *  that override BLDG_YAW by `<side>_<kind>` (a review's trial; 0 for square). */
export function* rethemeSprites(want, opts = {}) {
  if (typeof opts === 'number') opts = { elev: opts };
  const elev = (opts.elev ?? RT_ELEV) * Math.PI / 180, lift = liftAt(elev), o = { elev };
  if (opts.sun) o.sun = opts.sun;
  if (opts.sunDir) o.sunDir = opts.sunDir; // (a picture's trial key direction, scene.js `shoot`)
  if (opts.polish) o.polish = opts.polish;
  countryPolish(!!opts.polish); // (country.js: the gold's and the scenery's materials, plain or polished)
  const ou = opts.polish ? { ...o, sun: opts.sun ?? UNIT_SUN, polish: { ...(typeof opts.polish === 'object' ? opts.polish : {}), unit: true } } : o; // (the units take polish.js's unit lights, shadow and banding, and the units' sun)
  for (const side of ['kg', 'ex']) {
    let M = null; const mats = () => M ??= MATS[side](NEUTRAL, !!opts.polish);
    for (const [kind, m] of Object.entries(RT_UNITS[side])) {
      const cell = unitCell(m.r * UNIT_SCALE, m.h * UNIT_SCALE, lift);
      for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < (m.frames ?? 2); f++) {
        const name = `${side}_${kind}_${dir}_${f}`; if (!want(name)) continue;
        const obj = m.build(mats(), f); obj.rotation.y = -dir / FACINGS * Math.PI * 2; obj.scale.multiplyScalar(UNIT_SCALE);
        yield [name, obj, cell, ou, true];
      }
    }
    for (const kind of Object.keys(RT_BUILDINGS[side])) {
      const name = `bldg_${side}_${kind}`; if (!want(name)) continue;
      const [obj, cell, turn] = building(side, kind, mats(), lift, opts.yaws?.[`${side}_${kind}`]);
      yield [name, obj, cell, o, true, { turn }];
    }
    for (const [kind, b] of Object.entries(RT_HEADS[side])) for (let dir = 0; dir < FACINGS; dir++) {
      const name = `${side}_${kind}_${dir}`; if (!want(name)) continue;
      yield [name, head(b, mats(), dir), bldgCell(b.n, b.h, lift), { ...o, shadow: !!b.shadow }, true];
    }
  }
  if (want('rt_coins')) yield ['rt_coins', coins(makeExpeditionMats(NEUTRAL, !!opts.polish)), unitCell(30, 12, lift), o, false];
  // The ground family (country.js): the gold outcrop `rt_gold_<stage>_<v>` (the game's shard_k / shard_k_v), the
  // scenery `rt_doodad_<name>` (the game's doodad_<name>), and each people's construction and rubble
  // `rt_<kg|ex>_<foundation|scaffold|rubble>_<n>` (the game's foundation_n, scaffold_n, rubble_n, picked by people;
  // the scaffolds without a shadow, as today's; team on their cloth and flags).
  for (let st = 0; st < 4; st++) for (let v = 0; v < GOLD_VARIANT_COUNT; v++) { const name = `rt_gold_${st}_${v}`; if (want(name)) yield [name, goldField(st, v), unitCell(28, 26, lift), o, false]; }
  for (const st of MINE_STAGES) { const name = `rt_mine_${st}`; if (want(name)) yield [name, goldMine(st), bldgCell(MINE_N, MINE_H, lift), o, false]; } // the gold mine (mine.js; the game's mine_<stage>): 2x2, neutral
  for (const list of Object.values(RT_SCENERY)) for (const [nm, build, r, h] of list) { const name = `rt_doodad_${nm}`; if (want(name)) yield [name, build(), unitCell(r, h, lift), o, false]; }
  for (const side of ['kg', 'ex']) for (const n of [2, 3, 4]) for (const kind of ['foundation', 'scaffold', 'rubble']) {
    const name = `rt_${side}_${kind}_${n}`; if (!want(name)) continue;
    const h = kind === 'scaffold' ? 10 + n * 6 + (side === 'ex' ? 20 : 8) : kind === 'rubble' ? 14 : 8;
    const so = kind === 'scaffold' ? { ...o, shadow: false, ...(o.polish ? { polish: { ...(typeof o.polish === 'object' ? o.polish : {}), contact: { ...POLISH.contact, alpha: 0 } } } : {}) } : o; // (a scaffold casts no shadow, and under the polish no contact ellipse either: the judge saw dots at the poles' feet over the rising building)
    yield [name, RT_SITES[side][kind](n, MATS[side](NEUTRAL, !!opts.polish)), bldgCell(n, h, lift), so, true];
  }
}

// ---- the atlas (PR 1 of the re-theme): the new models under today's sprite names, in the approved look ----
// The approved look is the polish on, at the game's camera (40 degrees) and sun (420): scene.js's defaults, so only
// `polish` is passed. The sim's kinds take the new models by role (the roster's Rider and Knight their own, the
// Bruiser the Veteran); the two healers the sim keeps but trains nowhere (medic, halo) keep their old models (main.js).
/** Unit kind -> [people, model] (RT_UNITS). */
export const ATLAS_UNITS = {
  harvester: ['kg', 'villager'], trooper: ['kg', 'guard'], lancer: ['kg', 'archer'], siegeTank: ['kg', 'trebuchet'], bastion: ['kg', 'ballista'], observer: ['kg', 'balloon'],
  lumen: ['ex', 'bot'], scythe: ['ex', 'buggy'], prism: ['ex', 'mercenary'], umbra: ['ex', 'marine'], monolith: ['ex', 'rover'], shrike: ['ex', 'drone'],
  rider: ['kg', 'rider'], knight: ['kg', 'knight'], bruiser: ['ex', 'veteran'],
};
/** Building type -> [people, model] (RT_BUILDINGS); each footprint is its type's (n tiles). */
export const ATLAS_BUILDINGS = {
  core: ['kg', 'castle'], depot: ['kg', 'cottage'], extractor: ['kg', 'market'], barracks: ['kg', 'barracks'], forge: ['kg', 'blacksmith'],
  factory: ['kg', 'workshop'], turret: ['kg', 'tower'], airfield: ['kg', 'stables'],
  conflux: ['ex', 'hall'], spire: ['ex', 'bunkhouse'], siphon: ['ex', 'post'], kiln: ['ex', 'factory'], loom: ['ex', 'lab'], ward: ['ex', 'radio'], eclipse: ['ex', 'portal'],
};
/** Turning heads (look.js BLDG_LOOK `head`, `<name>_<dir>`) -> [people, model] (RT_HEADS). */
export const ATLAS_HEADS = { turret_head: ['kg', 'towerhead'], ward_head: ['ex', 'radiohead'] };
/** Construction and rubble, by the names the client picks by people (gl/render.js): the kingdom's foundation, scaffold
 *  and rubble, the Expedition's scaffold (the client's `bud`) and rubble (`rubble_vael`). The scaffolds carry team on
 *  their cloth and flags; the foundations and rubble none. */
const ATLAS_SITES = { foundation: ['kg', 'foundation'], scaffold: ['kg', 'scaffold'], rubble: ['kg', 'rubble'], bud: ['ex', 'scaffold'], rubble_vael: ['ex', 'rubble'] };
const siteH = (side, kind, n) => (kind === 'scaffold' ? 10 + n * 6 + (side === 'ex' ? 20 : 8) : kind === 'rubble' ? 14 : 8);

/** Yields [name, object, cell, shootOpts, isTeam, extra] for every atlas sprite the re-theme draws (`extra`: a unit
 *  frame's `anim` and `frame`). `want(name)` filters, as main.js's. */
export function* atlasSprites(want = () => true) {
  const lift = liftAt(RT_ELEV * Math.PI / 180), o = { polish: true }, ou = { polish: { unit: true }, sun: UNIT_SUN };
  countryPolish(true);
  const M = {}, mats = (side) => (M[side] ??= MATS[side](NEUTRAL, true));
  for (const [kind, [side, model]] of Object.entries(ATLAS_UNITS)) {
    const m = RT_UNITS[side][model], cell = unitCell(m.r * UNIT_SCALE, m.h * UNIT_SCALE, lift);
    for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < (m.frames ?? 2); f++) {
      const name = `${kind}_${dir}_${f}`; if (!want(name)) continue;
      const obj = m.build(mats(side), f); obj.rotation.y = -dir / FACINGS * Math.PI * 2; obj.scale.multiplyScalar(UNIT_SCALE);
      yield [name, obj, cell, ou, true, { anim: `${kind}_${dir}`, frame: f }];
    }
  }
  for (const [type, [side, model]] of Object.entries(ATLAS_BUILDINGS)) {
    const name = `bldg_${type}`; if (!want(name)) continue;
    const [obj, cell, turn] = building(side, model, mats(side), lift);
    yield [name, obj, cell, o, true, { turn }];
  }
  for (const [name0, [side, model]] of Object.entries(ATLAS_HEADS)) for (let dir = 0; dir < FACINGS; dir++) {
    const b = RT_HEADS[side][model], name = `${name0}_${dir}`; if (!want(name)) continue;
    yield [name, head(b, mats(side), dir), bldgCell(b.n, b.h, lift), { ...o, shadow: !!b.shadow }, true]; // (drawn over its base, which has the shadow, unless the head carries its own)
  }
  for (const [prefix, [side, kind]] of Object.entries(ATLAS_SITES)) for (const n of [2, 3, 4]) {
    const name = `${prefix}_${n}`; if (!want(name)) continue;
    const scaffold = kind === 'scaffold', so = scaffold ? { shadow: false, polish: { contact: { ...POLISH.contact, alpha: 0 } } } : o; // (a scaffold casts no shadow and has no contact ellipse: it stands round the rising building)
    yield [name, RT_SITES[side][kind](n, mats(side)), bldgCell(n, siteH(side, kind, n), lift), so, scaffold];
  }
  for (let st = 0; st < 4; st++) for (let v = 0; v < GOLD_VARIANT_COUNT; v++) { const name = v ? `shard_${st}_${v}` : `shard_${st}`; if (want(name)) yield [name, goldField(st, v), unitCell(28, 26, lift), o, false]; } // (variant 0 keeps the plain name: the portrait's)
  for (const st of MINE_STAGES) { const name = `mine_${st}`; if (want(name)) yield [name, goldMine(st), bldgCell(MINE_N, MINE_H, lift), o, false]; } // the gold mine, one per field (mine.js): drawn by nothing yet; the rules change that puts one mine per field takes it up
  for (const list of Object.values(RT_SCENERY)) for (const [nm, build, r, h] of list) { const name = `doodad_${nm}`; if (want(name)) yield [name, build(), unitCell(r, h, lift), o, false]; }
}
