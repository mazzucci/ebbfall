// The re-theme's comparison models (the kingdom, kingdom.js; the Expedition, expedition.js), rendered only when a
// filter asks for them by name (main.js calls `rethemeSprites` with the filter's `want`), never into the atlas:
// tools/art/retheme-compare.mjs builds Stelian's comparison picture from them. Names: `kg{A,B,C}_<kind>_<dir>_<frame>`
// and `ex{A,B,C}_<kind>_<dir>_<frame>` for the units (16 facings, two frames), `bldg_kg{A,B,C}_castle` and
// `bldg_ex{A,B,C}_hall` for the main buildings, `rt_coins` for the gold deposit (not team). Each variant letter is a
// palette (KINGDOM_PALETTES, EXPEDITION_PALETTES) over one set of shapes. The camera: `elev` degrees (RT_ELEV by
// default), lower than the game's 55 so the cells are taller (`liftAt`).
import { liftAt, S } from './scene.js';
import { NEUTRAL } from './materials.js';
import { makeKingdomMats, villager, spearman, knight, castle } from './kingdom.js';
import { makeExpeditionMats, traveller, buggy, marine, dataCentre, coins } from './expedition.js';

export const RT_ELEV = 40;
export const VARIANTS = ['A', 'B', 'C'];
/** The units: kind -> builder, sim-ish cell radius and height (the cell holds every facing and frame). */
export const RT_UNITS = {
  kg: { villager: { build: villager, r: 13, h: 24 }, spearman: { build: spearman, r: 22, h: 26 }, knight: { build: knight, r: 27, h: 32 } },
  ex: { traveller: { build: traveller, r: 13, h: 18 }, buggy: { build: buggy, r: 16, h: 14 }, marine: { build: marine, r: 15, h: 20 } },
};
export const RT_BUILDINGS = { kg: { castle: { build: castle, n: 4, h: 76 } }, ex: { hall: { build: dataCentre, n: 4, h: 46 } } };
const MATS = { kg: makeKingdomMats, ex: makeExpeditionMats };
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

/** Yields [name, object, cell, shootOpts, isTeam] for every re-theme sprite `want(name)` asks for. */
export function* rethemeSprites(want, elevDeg = RT_ELEV) {
  const elev = (elevDeg ?? RT_ELEV) * Math.PI / 180, lift = liftAt(elev), o = { elev };
  for (const side of ['kg', 'ex']) for (const v of VARIANTS) {
    let M = null; const mats = () => M ??= MATS[side](NEUTRAL, v);
    for (const [kind, m] of Object.entries(RT_UNITS[side])) {
      const cell = unitCell(m.r, m.h, lift);
      for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < 2; f++) {
        const name = `${side}${v}_${kind}_${dir}_${f}`; if (!want(name)) continue;
        const obj = m.build(mats(), f); obj.rotation.y = -dir / FACINGS * Math.PI * 2;
        yield [name, obj, cell, o, true];
      }
    }
    for (const [kind, b] of Object.entries(RT_BUILDINGS[side])) {
      const name = `bldg_${side}${v}_${kind}`; if (!want(name)) continue;
      yield [name, b.build(mats()), bldgCell(b.n, b.h, lift), o, true];
    }
  }
  if (want('rt_coins')) yield ['rt_coins', coins(makeExpeditionMats(NEUTRAL, 'A')), unitCell(30, 8, lift), o, false];
}
