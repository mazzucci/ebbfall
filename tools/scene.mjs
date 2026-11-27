// The battle the field under the menu's first page shows (tools/menu-art.mjs), composed by tools/field.mjs. og.png
// (tools/og.mjs) is a picture painted over this battle when the Kingdom stood on the left; it keeps that picture.
//
// The Expedition from the left in seat 1's color, since single player starts as the Expedition: its Uplink, a Wind
// turbine and the Data center, the gold mine with Bots at it, Androids and Rovers in front, a Sellsword and a Bruiser
// behind them, the Buggy on the flank, all facing east (facing 0). The Kingdom from the right in seat 0's color: its
// Watchtower, Castle and Stables, a Villager hammering at the Stables, the Cannon, Archers behind Guards behind two
// Knights in front, all facing west (8; the Archers 7, so their faces show), the Balloon over the base. Three Drones over
// the clear grass between the two fronts (about 15% of the width) and two small blasts in it. The ground: the game's
// grass, worn earth round each base and the mine, one track between them. Recomposed, not mirrored: every frame is the
// art's own at its facing, so the light and the cast shadows keep the game's sun. The two poses with one facing only
// (the Villager's hammer stroke, k1_2, and the Cannon's raised barrel, fire_0) are kept as they are: the Villager on the
// Stables' left, where it was, and the Cannon at its standing frame facing west.
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
  ['earth', .87, .80, 210], ['earth', .15, .80, 220], ['earth', .27, .60, 110], ['earth', .71, .52, 130], ['track', 0, .80, 1, .86],
  ['land', 'land_tree_3', .98, .30], ['land', 'land_tree_7', .78, .26], ['land', 'land_tree_1', .53, .28], ['land', 'land_crag_2', .60, .36], ['land', 'land_tree_9', .34, .27], ['land', 'land_boulder_1', .01, .40], ['land', 'land_bush_1', .44, .40], ['land', 'land_low_2', .50, .97],
  // the Expedition, from the left, facing east (0)
  ['bldg', 'uplink', .045, .55, E, 'uplink_head_15'], ['bldg', 'spire', .18, .44, E, 'spire_head_5'], ['bldg', 'conflux', .14, .85, E],
  ['mine', .27, .56], ['unit', 'bot', 12, .30, .68, E, 1.3], ['unit', 'bot', 5, .235, .66, E, 1.3], ['unit', 'bot', 3, .265, .71, E, 1.3],
  ['unit', 'android', 0, .415, .60, E, 1.2], ['unit', 'rover', 0, .40, .76, E, 1.15], ['unit', 'android', 0, .42, .93, E, 1.2],
  ['unit', 'sellsword', 0, .355, .68, E, 1.2], ['unit', 'bruiser', 0, .34, .84, E, 1.2], ['unit', 'rover', 0, .335, .97, E, 1.15], ['unit', 'buggy', 0, .36, .53, E, 1.2],
  // the Kingdom, from the right, facing west (8)
  ['bldg', 'turret', .95, .52, K, 'turret_head_8'], ['bldg', 'airfield', .71, .48, K], ['bldg', 'core', .86, .82, K],
  ['unit', 'villager', 'k1_2', .665, .62, K, 1.2], ['unit', 'balloon', 6, .785, .46, K, 1.2],
  ['unit', 'archer', 7, .705, .64, K, 1.2], ['unit', 'archer', 7, .695, .80, K, 1.2], ['unit', 'archer', 7, .70, .95, K, 1.2],
  ['unit', 'guard', 8, .632, .61, K, 1.2], ['unit', 'guard', 8, .645, .76, K, 1.2], ['unit', 'guard', 8, .65, .92, K, 1.2],
  ['unit', 'knight', 8, .595, .69, K, 1.35], ['unit', 'knight', 8, .59, .90, K, 1.35], ['unit', 'cannon', 8, .765, .96, K, 1.3],
  ['boom', 'boom_small_1', .50, .80, 1.5], ['boom', 'boom_small_b_3', .535, .70, 1.2],
  ['unit', 'drone', 0, .53, .60, E, 1.6], ['unit', 'drone', 0, .48, .50, E, 1.6], ['unit', 'drone', 0, .465, .68, E, 1.6],
];
