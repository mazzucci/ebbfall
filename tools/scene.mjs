// The battle both pictures draw: og.png's band (tools/og.mjs) and the field under the menu's first page
// (tools/menu-art.mjs). One definition, so the card and the page never drift apart.
//
// The Kingdom from the left (seat 0's color): the Castle and a Watchtower, Archers turned up toward the Drones, Knights
// and a Guard facing east, a Rider, the Balloon. The Expedition from the right (seat 1's color): the Data center and a
// Wind turbine, the Drones front and center, large, hovering over the clash, Androids in the first rank, Buggies, a
// Veteran (the Bruiser), a Launcher. No gold crystals (the mines replaced them; a mine is not a thing of a battle), a
// crater and some debris. Medieval against machines reads first; few, large figures rather than a crowd.
//
// Each scene is [frame, x, y, seat, scale]: `frame` an atlas frame's name (public/art; the painters draw the 3D ones with
// their team mask tinted for `seat`, 0 the Kingdom, 1 the Expedition, null for the effects and the ground's marks),
// x and y its anchor (a unit's ground point) as fractions of the band's width and height, `scale` (1 when absent) a
// figure drawn that much larger than the rest (the Drones) or smaller (the blast). Units face +x at dir 0, clockwise in
// 16: east 0, south 4, west 8, north 12; so the Kingdom faces east (0, 15, 1) and up at the Drones (13, 14), the
// Expedition west (7, 8, 9). A flyer's anchor is the ground under it; its body hangs about a third of its cell above.
// Order is the painter's: the ground's marks first, then by y, the flyers last. Every ground point is above 0.86: the
// foot of the band is dark and the lowest tide line crosses it there. The band's top 0.45 fades (the menu) or sits
// under the card's veil (og), and the menu's footer line sits in the middle of that top on short screens: nothing
// bright stands in the top 0.4, and the Drones' bodies hang just under it.
export const KINGDOM = 0, EXPEDITION = 1;
const K = KINGDOM, E = EXPEDITION, N = null;

/** The band proper, 4:1: og.png's bottom 300 px and the menu's desktop image. */
export const BAND = [
  ['doodad_ruin_0', .12, .42, N], ['doodad_debris_0', .44, .56, N], ['doodad_boulders_0', .91, .50, N], ['doodad_crater_0', .50, .93, N], ['doodad_debris_1', .72, .95, N],
  ['bldg_turret', .04, .58, K], ['bldg_core', .15, .84, K],
  ['rider_0_1', .23, .68, K], ['lancer_14_0', .30, .64, K], ['knight_1_0', .40, .62, K],
  ['trooper_0_1', .455, .74, K], ['lancer_13_0', .27, .82, K], ['lancer_14_1', .35, .82, K], ['knight_15_0', .43, .86, K],
  ['bldg_spire', .955, .54, E], ['bldg_conflux', .85, .84, E],
  ['monolith_8_0', .80, .60, E], ['umbra_7_0', .69, .58, E], ['umbra_8_0', .64, .68, E], ['scythe_8_0', .75, .72, E],
  ['umbra_9_1', .67, .82, E], ['bruiser_8_1', .56, .85, E], ['scythe_9_0', .78, .86, E],
  ['flash_1', .455, .66, N], ['boom_big_3', .505, .80, N, .75], ['spark_1', .53, .90, N],
  ['observer_1_0', .27, .40, K],
  ['shrike_9_0', .635, .72, E, 1.2], ['shrike_8_0', .50, .68, E, 1.3], ['shrike_7_1', .57, .60, E, 1.3],
];
/** The 21:9 band (5.33:1): the same, the bases farther out and the armies spread a little. */
export const WIDE = BAND.map(([n, x, y, s, k]) => { const o = [n, +(0.5 + (x - 0.5) * (n.startsWith('bldg_') ? 1.3 : 0.9)).toFixed(3), y, s]; return k === undefined ? o : [...o, k]; });
/** A short phone on its side (6.3:1): fewer figures, the Drones low over the clash (the band is a strip there). */
export const LANDSCAPE = [
  ['doodad_debris_0', .44, .60, N], ['doodad_boulders_0', .92, .56, N], ['doodad_crater_0', .50, .95, N],
  ['bldg_turret', .035, .60, K], ['bldg_core', .13, .84, K],
  ['lancer_14_0', .30, .70, K], ['knight_1_0', .41, .66, K], ['trooper_0_1', .25, .85, K], ['lancer_14_1', .36, .86, K], ['knight_15_0', .455, .85, K],
  ['bldg_spire', .965, .58, E], ['bldg_conflux', .87, .84, E],
  ['monolith_8_0', .81, .64, E], ['umbra_7_0', .70, .62, E], ['umbra_8_0', .65, .72, E], ['scythe_8_0', .76, .74, E], ['umbra_9_1', .68, .86, E], ['bruiser_8_1', .56, .86, E], ['scythe_9_0', .79, .87, E],
  ['flash_1', .46, .70, N], ['boom_big_3', .505, .82, N, .75],
  ['observer_1_0', .26, .50, K],
  ['shrike_9_0', .635, .80, E, 1.2], ['shrike_8_0', .50, .76, E, 1.3], ['shrike_7_1', .57, .68, E, 1.3],
];
/** An upright phone (1.96:1): the two bases and the heart of the clash. */
export const PORTRAIT = [
  ['doodad_debris_0', .42, .58, N], ['doodad_crater_0', .50, .94, N],
  ['bldg_core', .14, .84, K],
  ['lancer_14_0', .34, .64, K], ['lancer_13_0', .29, .82, K], ['knight_15_0', .42, .86, K],
  ['bldg_conflux', .86, .84, E],
  ['umbra_8_0', .64, .66, E], ['umbra_9_1', .68, .84, E], ['bruiser_8_1', .57, .87, E],
  ['flash_1', .45, .72, N], ['boom_big_3', .50, .80, N, .7],
  ['observer_1_0', .24, .42, K],
  ['shrike_9_0', .61, .62, E, 1.1], ['shrike_8_0', .48, .60, E, 1.3], ['shrike_7_1', .56, .50, E, 1.2],
];
export const SCENES = { band: BAND, wide: WIDE, landscape: LANDSCAPE, portrait: PORTRAIT };

/** The ground: the terrain's plain cells as the game lays them, a hash per cell picking the variant. */
export const groundTile = (tx, ty) => `ground_${(tx * 7 + ty * 13 + tx * ty + 23) % 8}`;
/** Every 3D frame a scene draws (the effects and the ground are the atlas's painted ones). */
export const frames3d = (scene) => [...new Set(scene.map(s => s[0]).filter(n => !/^(ground|boom|flash|spark|puff|muzzle)_/.test(n)))];
