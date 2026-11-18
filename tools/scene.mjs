// The battle both pictures draw: og.png's band (tools/og.mjs) and the field under the menu's first page
// (tools/menu-art.mjs). One definition, so the card and the page never drift apart.
//
// The Kingdom from the left (seat 0's color): the Castle and a Watchtower, four Archers at the front with their bows
// drawn and raised at the Drones, Knights and a Guard behind them facing east, a Rider, the Balloon. The Expedition from
// the right (seat 1's color): the Data center and a Wind turbine standing clean at the edge, the Drones front and
// center, large, hovering over the clash, Androids in the first rank, the Buggies and the Launcher a step into the
// field, a Veteran (the Bruiser) at the blast. No gold crystals (the mines replaced them; a mine is not a thing of a
// battle), a crater and some debris. Medieval against machines reads first; few, large figures rather than a crowd.
//
// Each scene is [frame, x, y, seat, scale]: `frame` an atlas frame's name (public/art; the painters draw the 3D ones with
// their team mask tinted for `seat`, 0 the Kingdom, 1 the Expedition, null for the effects and the ground's marks),
// x and y its anchor (a unit's ground point) as fractions of the band's width and height, `scale` (1 when absent) a
// figure drawn that much larger than the rest (the Drones, the Archers) or smaller (the blast). Units face +x at dir 0,
// clockwise in 16: east 0, south 4, west 8, north 12. The Archer holds its bow drawn and raised, best seen from dirs
// 0-2 (east to east-south-east: the bow in profile, the arm up); the Kingdom faces east (0, 15, 1), the Expedition west
// (7, 8, 9). A flyer's anchor is the ground under it; its body hangs about a third of its cell above. Order is the
// painter's: the ground's marks first, then by y, the flyers last. Every ground point is above 0.86: the foot of the
// band is dark and the lowest tide line crosses it there. The band's top 0.45 fades (the menu) or sits under the card's
// veil (og), and the menu's footer line sits in the middle of that top on short screens: nothing bright stands in the
// top 0.4, and the Drones' bodies hang just under it.
export const KINGDOM = 0, EXPEDITION = 1;
const K = KINGDOM, E = EXPEDITION, N = null;

/** The band proper, 4:1: og.png's bottom 300 px and the menu's desktop image. */
export const BAND = [
  ['doodad_ruin_0', .12, .42, N], ['doodad_debris_0', .36, .52, N], ['doodad_boulders_0', .91, .50, N], ['doodad_crater_0', .50, .93, N], ['doodad_debris_1', .72, .95, N],
  ['bldg_turret', .04, .58, K], ['bldg_core', .15, .84, K],
  ['rider_0_1', .235, .66, K], ['knight_1_0', .31, .60, K], ['trooper_0_1', .255, .84, K], ['knight_15_0', .33, .84, K],
  ['lancer_1_0', .40, .58, K, 1.1], ['lancer_2_0', .44, .70, K, 1.1], ['lancer_1_1', .405, .84, K, 1.1], ['lancer_0_0', .455, .86, K, 1.1],
  ['bldg_spire', .955, .54, E], ['bldg_conflux', .85, .84, E],
  ['monolith_8_0', .72, .60, E], ['umbra_8_0', .60, .70, E], ['scythe_8_0', .705, .76, E], ['umbra_9_1', .635, .80, E],
  ['bruiser_8_1', .555, .86, E], ['umbra_7_0', .68, .86, E], ['scythe_9_0', .745, .86, E],
  ['flash_1', .49, .72, N], ['boom_big_3', .515, .80, N, .75], ['spark_1', .545, .90, N],
  ['observer_1_0', .27, .40, K],
  ['shrike_9_0', .655, .70, E, 1.2], ['shrike_8_0', .53, .66, E, 1.3], ['shrike_7_1', .595, .58, E, 1.3],
];
/** The 21:9 band (5.33:1): the same, the bases three quarters of the way out to the edges, the armies spread a little. */
const wideX = (x, building) => +(building ? (x < .5 ? x * .75 : 1 - (1 - x) * .75) : .5 + (x - .5) * .9).toFixed(3);
export const WIDE = BAND.map(([n, x, y, s, k]) => { const o = [n, wideX(x, n.startsWith('bldg_')), y, s]; return k === undefined ? o : [...o, k]; });
/** A short phone on its side (6.3:1): fewer figures, the Drones low over the clash (the band is a strip there). */
export const LANDSCAPE = [
  ['doodad_debris_0', .36, .56, N], ['doodad_boulders_0', .92, .56, N], ['doodad_crater_0', .50, .95, N],
  ['bldg_turret', .035, .60, K], ['bldg_core', .13, .84, K],
  ['knight_1_0', .31, .64, K], ['trooper_0_1', .25, .85, K], ['knight_15_0', .33, .86, K],
  ['lancer_1_0', .40, .62, K, 1.1], ['lancer_2_0', .44, .76, K, 1.1], ['lancer_1_1', .405, .87, K, 1.1],
  ['bldg_spire', .965, .58, E], ['bldg_conflux', .87, .84, E],
  ['monolith_8_0', .72, .62, E], ['umbra_8_0', .60, .74, E], ['scythe_8_0', .705, .78, E], ['umbra_9_1', .635, .84, E], ['bruiser_8_1', .555, .87, E], ['umbra_7_0', .68, .87, E], ['scythe_9_0', .745, .87, E],
  ['flash_1', .49, .74, N], ['boom_big_3', .515, .82, N, .75],
  ['observer_1_0', .26, .50, K],
  ['shrike_9_0', .655, .76, E, 1.2], ['shrike_8_0', .53, .72, E, 1.3], ['shrike_7_1', .595, .64, E, 1.3],
];
/** An upright phone (1.96:1): the two bases, the Archers, the Drones and the first rank. */
export const PORTRAIT = [
  ['doodad_debris_0', .34, .54, N], ['doodad_crater_0', .50, .94, N],
  ['bldg_core', .14, .84, K],
  ['lancer_1_0', .36, .62, K, 1.1], ['lancer_2_0', .40, .78, K, 1.1], ['lancer_1_1', .33, .87, K, 1.1],
  ['bldg_conflux', .86, .84, E],
  ['umbra_8_0', .62, .74, E], ['bruiser_8_1', .55, .87, E], ['umbra_9_1', .66, .86, E],
  ['flash_1', .46, .74, N], ['boom_big_3', .50, .82, N, .7],
  ['observer_1_0', .24, .42, K],
  ['shrike_9_0', .60, .72, E, 1.1], ['shrike_8_0', .50, .62, E, 1.3], ['shrike_7_1', .58, .52, E, 1.2],
];
export const SCENES = { band: BAND, wide: WIDE, landscape: LANDSCAPE, portrait: PORTRAIT };

/** The ground: the terrain's plain cells as the game lays them, a hash per cell picking the variant. */
export const groundTile = (tx, ty) => `ground_${(tx * 7 + ty * 13 + tx * ty + 23) % 8}`;
/** Every 3D frame a scene draws (the effects and the ground are the atlas's painted ones). */
export const frames3d = (scene) => [...new Set(scene.map(s => s[0]).filter(n => !/^(ground|boom|flash|spark|puff|muzzle)_/.test(n)))];
