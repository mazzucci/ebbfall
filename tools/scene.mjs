// The battle both pictures draw: og.png's band (tools/og.mjs) and the field under the menu's first page
// (tools/menu-art.mjs), composed by tools/field.mjs. One definition, so the card and the page never drift apart.
//
// The Kingdom from the left in seat 0's color: its Watchtower, Castle and Stables, a Villager hammering at the Stables,
// the Cannon firing east, Archers behind Guards behind two Knights in front, all facing east (facing 0; the Archers 1, so
// their faces show), the Balloon over the base. The Expedition from the right in seat 1's color: its Uplink, a Wind
// turbine and the Data center, the gold mine with Bots at it, Androids and Rovers in front, a Sellsword and a Bruiser
// behind them, the Buggy on the flank, all facing west (8); three Drones over the clear grass between the two fronts
// (about 15% of the width) and two small blasts in it. The ground: the game's grass, worn earth round each base and the
// mine, one track between them.
//
// Each item is [what, ...]: ['earth', x, y, radius (world px)] a soft patch of worn earth; ['track', x0, y0, x1, y1];
// ['land', frame, x, y] a piece of the land (public/art/new land-0); ['bldg', type, x, y, tint, head?];
// ['mine', x, y]; ['unit', picture, facing or pose, x, y, tint, scale?] (a sharp picture, <picture>_<pose>.png in the
// local pictures folder, scaled by the game's drawn height of its kind, `scale` times); ['boom', fx frame, x, y, scale?]
// (src/client/gl/fx.js). x and y are the ground point as shares of the picture's width and height; order is the
// painter's (the marks first, then by y, flyers last).
const K = 0x2a5ddf, E = 0xee376a; // (the seats' tints, public/art/new index.json)
/** World px a px of the picture's height: 2.1 px a world px on the 480 px tall desktop band. */
export const P_PER_H = 2.1 / 480;
export const SCENE = [
  // the ground's marks and the land
  ['earth', .13, .80, 210], ['earth', .85, .80, 220], ['earth', .73, .60, 110], ['earth', .29, .52, 130], ['track', 0, .86, 1, .80],
  ['land', 'land_tree_3', .02, .30], ['land', 'land_tree_7', .22, .26], ['land', 'land_tree_1', .47, .28], ['land', 'land_crag_2', .40, .36], ['land', 'land_tree_9', .66, .27], ['land', 'land_boulder_1', .99, .40], ['land', 'land_bush_1', .56, .40], ['land', 'land_low_2', .50, .97],
  // the Kingdom, from the left, facing east (0)
  ['bldg', 'turret', .05, .52, K, 'turret_head_0'], ['bldg', 'airfield', .29, .48, K], ['bldg', 'core', .14, .82, K],
  ['unit', 'villager', 'k1_2', .245, .62, K, 1.2], ['unit', 'balloon', 2, .215, .46, K, 1.2],
  ['unit', 'archer', 1, .295, .64, K, 1.2], ['unit', 'archer', 1, .305, .80, K, 1.2], ['unit', 'archer', 1, .30, .95, K, 1.2],
  ['unit', 'guard', 0, .35, .60, K, 1.2], ['unit', 'guard', 0, .355, .76, K, 1.2], ['unit', 'guard', 0, .35, .92, K, 1.2],
  ['unit', 'knight', 0, .405, .69, K, 1.35], ['unit', 'knight', 0, .41, .90, K, 1.35], ['unit', 'cannon', 'fire_0', .235, .96, K, 1.3],
  // the Expedition, from the right, facing west (8)
  ['bldg', 'uplink', .955, .55, E, 'uplink_head_15'], ['bldg', 'spire', .82, .44, E, 'spire_head_5'], ['bldg', 'conflux', .86, .85, E],
  ['mine', .73, .56], ['unit', 'bot', 12, .70, .68, E, 1.3], ['unit', 'bot', 3, .765, .66, E, 1.3], ['unit', 'bot', 5, .735, .71, E, 1.3],
  ['unit', 'android', 8, .585, .60, E, 1.2], ['unit', 'rover', 8, .60, .76, E, 1.15], ['unit', 'android', 8, .58, .93, E, 1.2],
  ['unit', 'sellsword', 8, .645, .68, E, 1.2], ['unit', 'bruiser', 8, .66, .84, E, 1.2], ['unit', 'rover', 8, .665, .97, E, 1.15], ['unit', 'buggy', 8, .64, .53, E, 1.2],
  ['boom', 'boom_small_1', .50, .80, 1.5], ['boom', 'boom_small_b_3', .465, .70, 1.2],
  ['unit', 'drone', 8, .47, .60, E, 1.6], ['unit', 'drone', 8, .52, .50, E, 1.6], ['unit', 'drone', 8, .535, .68, E, 1.6],
];
