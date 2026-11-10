// The re-theme's slice (the kingdom, kingdom.js; the Expedition, expedition.js), rendered only when a filter asks
// for them by name (main.js calls `rethemeSprites` with the filter's `want`), never into the atlas:
// tools/art/retheme-compare.mjs builds Stelian's pictures from them. Names: `kg_<kind>_<dir>_<frame>` and
// `ex_<kind>_<dir>_<frame>` for the units (16 facings, two frames), `bldg_kg_castle` and `bldg_ex_hall` for the main
// buildings, `rt_coins` for the gold deposit (not team). The kingdom is palette B (slate) and the Expedition its one
// dark-kit look (Stelian, 2026-11-10). The camera: `elev` degrees (RT_ELEV by default), lower than the game's 55 so
// the cells are taller (`liftAt`). Units are drawn UNIT_SCALE larger than their sim size (Stelian: "a bit larger so
// they can be distinguished"; visual only, the footprint and radius unchanged); buildings stay their footprint's.
import { liftAt, S } from './scene.js';
import { NEUTRAL } from './materials.js';
import { makeKingdomMats, villager, guard, knight, castle } from './kingdom.js';
import { makeExpeditionMats, utilityBot, buggy, marine, dataCentre, coins } from './expedition.js';

export const RT_ELEV = 40;
export const UNIT_SCALE = 1.4;
/** The units: kind -> builder and the cell's radius and height at sim scale (scaled by UNIT_SCALE for the render). */
export const RT_UNITS = {
  kg: { villager: { build: villager, r: 13, h: 24 }, guard: { build: guard, r: 22, h: 26 }, knight: { build: knight, r: 27, h: 32 } },
  ex: { bot: { build: utilityBot, r: 15, h: 13 }, buggy: { build: buggy, r: 16, h: 14 }, marine: { build: marine, r: 15, h: 20 } },
};
export const RT_BUILDINGS = { kg: { castle: { build: castle, n: 4, h: 76 } }, ex: { hall: { build: dataCentre, n: 4, h: 50 } } };
const MATS = { kg: (tc) => makeKingdomMats(tc, 'B'), ex: makeExpeditionMats };
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

/** Yields [name, object, cell, shootOpts, isTeam] for every slice sprite `want(name)` asks for. */
export function* rethemeSprites(want, elevDeg = RT_ELEV) {
  const elev = (elevDeg ?? RT_ELEV) * Math.PI / 180, lift = liftAt(elev), o = { elev };
  for (const side of ['kg', 'ex']) {
    let M = null; const mats = () => M ??= MATS[side](NEUTRAL);
    for (const [kind, m] of Object.entries(RT_UNITS[side])) {
      const cell = unitCell(m.r * UNIT_SCALE, m.h * UNIT_SCALE, lift);
      for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < 2; f++) {
        const name = `${side}_${kind}_${dir}_${f}`; if (!want(name)) continue;
        const obj = m.build(mats(), f); obj.rotation.y = -dir / FACINGS * Math.PI * 2; obj.scale.multiplyScalar(UNIT_SCALE);
        yield [name, obj, cell, o, true];
      }
    }
    for (const [kind, b] of Object.entries(RT_BUILDINGS[side])) {
      const name = `bldg_${side}_${kind}`; if (!want(name)) continue;
      yield [name, b.build(mats()), bldgCell(b.n, b.h, lift), o, true];
    }
  }
  if (want('rt_coins')) yield ['rt_coins', coins(makeExpeditionMats(NEUTRAL)), unitCell(30, 12, lift), o, false];
}
