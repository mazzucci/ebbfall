// The re-theme's models (the kingdom, kingdom.js and kingdom-units.js; the Expedition, expedition.js and
// expedition-units.js), rendered only when a filter asks for them by name (main.js calls `rethemeSprites` with the
// filter's `want`), never into the atlas: tools/art/retheme-compare.mjs (the slice) and tools/art/retheme-units.mjs
// (the units family) build Stelian's pictures from them. Names: `kg_<kind>_<dir>_<frame>` and `ex_<kind>_<dir>_<frame>`
// for the units (16 facings, two frames unless `frames` says otherwise: the Trebuchet's four poses, the Balloon's
// one), `bldg_kg_castle` and `bldg_ex_hall` for the main buildings, `rt_coins` for the gold deposit (not team). The
// kingdom is palette B (slate) and the Expedition its one dark-kit look (Stelian, 2026-11-10). The camera: `elev`
// degrees (RT_ELEV by default), lower than the game's 55 so the cells are taller (`liftAt`). Units are drawn
// UNIT_SCALE larger than their sim size (Stelian: "a bit larger so they can be distinguished"; visual only, the
// footprint and radius unchanged); buildings stay their footprint's.
// The buildings family adds `bldg_kg_<kind>` and `bldg_ex_<kind>` for the rest of both rosters and
// `kg_towerhead_<dir>` / `ex_radiohead_<dir>` for the two turning heads (RT_HEADS); the ground family the gold, the
// scenery and each people's construction and rubble.
import { liftAt, S } from './scene.js';
import { NEUTRAL } from './materials.js';
import { makeKingdomMats, villager, guard, knight, castle } from './kingdom.js';
import { archer, rider, ballista, trebuchet, balloon } from './kingdom-units.js';
import { makeExpeditionMats, utilityBot, buggy, marine, dataCentre, coins } from './expedition.js';
import { mercenary, veteran, rover, drone } from './expedition-units.js';
import { goldField, GOLD_VARIANT_COUNT, RT_SCENERY, RT_SITES } from './country.js';
import { countryPolish } from './country.js'; // (the polish pass, the ground family: the country's own materials follow the render's `polish`)
import * as KB from './kingdom-buildings.js';
import * as EB from './expedition-buildings.js';

export const RT_ELEV = 40;
export const UNIT_SCALE = 1.4;
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
export const RT_BUILDINGS = { kg: { castle: { build: castle, n: 4, h: 76 } }, ex: { hall: { build: dataCentre, n: 4, h: 50 } } };
// ---- the buildings family (kingdom-buildings.js, expedition-buildings.js; the slot each takes is in the brief) ----
Object.assign(RT_BUILDINGS.kg, {
  cottage: { build: KB.cottage, n: 2, h: 34 }, market: { build: KB.market, n: 2, h: 36 }, barracks: { build: KB.barracks, n: 3, h: 48 },
  blacksmith: { build: KB.blacksmith, n: 2, h: 40 }, workshop: { build: KB.workshop, n: 3, h: 56 }, tower: { build: KB.watchtower, n: 2, h: 82 },
  stables: { build: KB.stables, n: 3, h: 30 },
});
Object.assign(RT_BUILDINGS.ex, {
  bunkhouse: { build: EB.bunkhouse, n: 2, h: 46 }, post: { build: EB.recruitingPost, n: 2, h: 34 }, factory: { build: EB.factory, n: 3, h: 44 },
  lab: { build: EB.lab, n: 2, h: 50 }, radio: { build: EB.radioTower, n: 2, h: 62 }, portal: { build: EB.portal, n: 2, h: 46 },
});
/** The turning heads (16 facings, no shadow, drawn over their base as the game draws the turret's): the Watchtower's
 *  archer and the Radio tower's turret; the cell is the base's footprint with the head's height. */
export const RT_HEADS = { kg: { towerhead: { build: KB.watchtowerArcher, n: 2, h: 82 } }, ex: { radiohead: { build: EB.radioTurret, n: 2, h: 62 } } };
const MATS = { kg: (tc, polish) => makeKingdomMats(tc, 'B', polish), ex: (tc, polish) => makeExpeditionMats(tc, polish) };
const FACINGS = 16;

/** Cells as main.js lays them out, with the lift of this camera. */
function unitCell(r, h, lift) {
  const left = r + 2, right = r + h * 0.55 + 4, up = r + h * lift + 2, down = r + h * 0.45 + 3;
  return { w: Math.ceil((left + right) * S), h: Math.ceil((up + down) * S), ax: Math.round(left * S), ay: Math.round(up * S) };
}
function bldgCell(n, h, lift) {
  const W = n * 32, left = 4, right = h * 0.5 + 6, up = h * lift + 6, down = h * 0.4 + 6;
  return { w: Math.ceil((left + W + right) * S), h: Math.ceil((up + W + down) * S), ax: Math.round((left + W / 2) * S), ay: Math.round((up + W / 2) * S) };
}

/** Yields [name, object, cell, shootOpts, isTeam] for every re-theme sprite `want(name)` asks for. `opts` are the
 *  render's (render3d.mjs): `elev` the camera's elevation in degrees (RT_ELEV), `sun` the sun's height (scene.js), and
 *  `polish` the polished finish and materials (polish.js: true, or an object of finish settings). */
export function* rethemeSprites(want, opts = {}) {
  if (typeof opts === 'number') opts = { elev: opts };
  const elev = (opts.elev ?? RT_ELEV) * Math.PI / 180, lift = liftAt(elev), o = { elev };
  if (opts.sun) o.sun = opts.sun;
  if (opts.polish) o.polish = opts.polish;
  countryPolish(!!opts.polish); // (country.js: the gold's and the scenery's materials, plain or polished)
  const ou = opts.polish ? { ...o, polish: { ...(typeof opts.polish === 'object' ? opts.polish : {}), unit: true } } : o; // (the units take polish.js's unit lights and banding)
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
    for (const [kind, b] of Object.entries(RT_BUILDINGS[side])) {
      const name = `bldg_${side}_${kind}`; if (!want(name)) continue;
      yield [name, b.build(mats()), bldgCell(b.n, b.h, lift), o, true];
    }
    for (const [kind, b] of Object.entries(RT_HEADS[side])) for (let dir = 0; dir < FACINGS; dir++) {
      const name = `${side}_${kind}_${dir}`; if (!want(name)) continue;
      const obj = b.build(mats()); obj.rotation.y = -dir / FACINGS * Math.PI * 2;
      yield [name, obj, bldgCell(b.n, b.h, lift), { ...o, shadow: false }, true];
    }
  }
  if (want('rt_coins')) yield ['rt_coins', coins(makeExpeditionMats(NEUTRAL, !!opts.polish)), unitCell(30, 12, lift), o, false];
  // The ground family (country.js): the gold outcrop `rt_gold_<stage>_<v>` (the game's shard_k / shard_k_v), the
  // scenery `rt_doodad_<name>` (the game's doodad_<name>), and each people's construction and rubble
  // `rt_<kg|ex>_<foundation|scaffold|rubble>_<n>` (the game's foundation_n, scaffold_n, rubble_n, picked by people;
  // the scaffolds without a shadow, as today's; team on their cloth and flags).
  for (let st = 0; st < 4; st++) for (let v = 0; v < GOLD_VARIANT_COUNT; v++) { const name = `rt_gold_${st}_${v}`; if (want(name)) yield [name, goldField(st, v), unitCell(28, 26, lift), o, false]; }
  for (const list of Object.values(RT_SCENERY)) for (const [nm, build, r, h] of list) { const name = `rt_doodad_${nm}`; if (want(name)) yield [name, build(), unitCell(r, h, lift), o, false]; }
  for (const side of ['kg', 'ex']) for (const n of [2, 3, 4]) for (const kind of ['foundation', 'scaffold', 'rubble']) {
    const name = `rt_${side}_${kind}_${n}`; if (!want(name)) continue;
    const h = kind === 'scaffold' ? 10 + n * 6 + (side === 'ex' ? 20 : 8) : kind === 'rubble' ? 14 : 8;
    yield [name, RT_SITES[side][kind](n, MATS[side](NEUTRAL, !!opts.polish)), bldgCell(n, h, lift), { ...o, shadow: kind !== 'scaffold' }, true];
  }
}
