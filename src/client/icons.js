// HUD icons: simple line drawings (24x24, stroked in the current text color) for commands, the top bar and the menu,
// and the command card's unit and building symbols (`glyph`). No imports: the menu (src/boot.js) draws them before the
// game has loaded. Sprite portraits (the selection console, the guided first game): gl/render.js `portrait`.
// An entry is a line drawing, or [line drawing, fill]: the fill, under the lines in the same color but faint, makes a
// flat two-tone symbol.

const P = {
  move: 'M5 19 19 5M9 5h10v10',
  stop: 'M7 4h10l3 3v10l-3 3H7l-3-3V7z',
  attack: 'M12 5a7 7 0 1 0 .01 0M12 2v6M12 16v6M2 12h6M16 12h6',
  hold: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z',
  gather: ['M2 20.5 3.6 16h7.8l1.6 4.5zM11 20.5l1.6-4.5h7.8l1.6 4.5zM6.5 12.5 8.1 8h7.8l1.6 4.5z', 'M2 20.5 3.6 16h7.8l1.6 4.5zM11 20.5l1.6-4.5h7.8l1.6 4.5zM6.5 12.5 8.1 8h7.8l1.6 4.5z'], // (a stack of gold bars)
  build: 'M13 7l4 4M4 20l8.5-8.5M10 5l3-2 8 8-2 3z',
  advanced: 'M13 7l4 4M4 20l8.5-8.5M10 5l3-2 8 8-2 3zM18 15v6M15 18h6', // (Build's hammer, and a +: the advanced page)
  rally: 'M6 21V4M6 4h11l-3 4 3 4H6',
  repair: 'M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4 16.4 7.6 20l6.3-6.3A4.5 4.5 0 0 0 20 9.5l-2.6 2.6-2.9-.5-.5-2.9L16.6 6a4.5 4.5 0 0 0-2.1-2z',
  back: 'M10 6 4 12l6 6M4 12h16',
  x: 'M6 6l12 12M18 6 6 18',
  resume: 'M8 5v14l11-7z',
  weapons: 'M5 19 16 8M13 5h6v6M7 14l3 3M5 5v4M3 7h4',
  dmg: 'M19 5v4L9.5 18.5l-4-4L15 5zM7.5 16.5 4 20M6 13l5 5',
  air: 'M12 3c1 1 1.5 2.5 1.5 4.5v3l7 4v2l-7-2v3.5l2.5 2V21L12 20l-4 1v-1l2.5-2v-3.5l-7 2v-2l7-4v-3C10.5 5.5 11 4 12 3z',
  heal: 'M12 5v14M5 12h14',
  health: 'M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  ground: 'M2 20h20M4 20l5-8 3.5 4.5L15 13l5 7', // (hills on a horizon: what walks, rolls or stands)
  armor: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6zM12 9v6M9 12h6',
  speed: 'M5 6l6 6-6 6M12 6l6 6-6 6',
  shields: 'M12 3a9 9 0 1 0 0.01 0M12 7a5 5 0 1 0 0.01 0M12 3v4M21 12h-4M12 21v-4M3 12h4',
  full: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  unfull: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  pause: 'M8 5v14M16 5v14',
  home: 'M3 11 12 4l9 7M5 9.5V20h5v-6h4v6h5V9.5',
  army: 'M9 5a3 3 0 1 0 .01 0M3 20v-1a6 6 0 0 1 12 0v1M16 6a2.5 2.5 0 1 0 .01 0M17 13.2a5 5 0 0 1 4 4.8v2', // (a group: two figures, one behind; crossed swords read as Deselect's X)
  frames: 'M4 20V9l8-5 8 5v11M3 20h18M4 9h16M4 9l16 11M20 9 4 20',
  entrench: 'M12 3 6.5 5.2V10c0 3.2 2.3 5.4 5.5 6.8 3.2-1.4 5.5-3.6 5.5-6.8V5.2zM3 21h18M6 21l2.5-4M18 21l-2.5-4', // (Brace: a shield planted in the ground)
  drills: 'M9 2h6v5H9zM7 7h10M9.5 7 12 22l2.5-15M10.2 10.5l3.6 2M10.9 14.5l2.4 1.4', // (a drill bit under its chuck)
  help: 'M12 3a9 9 0 1 0 .01 0M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  horseshoe: ['M4 3h4v8a4 4 0 0 0 8 0V3h4v8a8 8 0 0 1-16 0zM6 6.5h.01M18 6.5h.01M6.8 12h.01M17.2 12h.01', 'M4 3h4v8a4 4 0 0 0 8 0V3h4v8a8 8 0 0 1-16 0z'],
  bolt: ['M13.5 2 4.5 13.5h7L10 22l9.5-12h-7z', 'M13.5 2 4.5 13.5h7L10 22l9.5-12h-7z'], // (Overclock: a lightning bolt)
};

// The command card's units and buildings, both peoples, by kind: a symbol each, none like another (test/cards.test.js
// draws every unit and building button). `glyph(kind)`.
const U = {
  // the Kingdom's units
  harvester: ['M5 21 15.5 6.5M9 3c5-1.4 9.6.6 12 5.5', 'M9 3c5-1.4 9.6.6 12 5.5-3.6-2.6-7.6-4-12-5.5z'], // Villager: a pickaxe
  trooper: ['M19 22V3M16.5 6.5 19 2l2.5 4.5M10 7.5a6 6 0 1 0 .01 0M10 13.5h.01', 'M10 7.5a6 6 0 1 0 .01 0z'], // Guard: a round shield and a spear
  lancer: ['M8 3Q19 12 8 21M8 3v18M3 12h18M18 9l3 3-3 3M3 12l-1-2M3 12l-1 2', 'M8 3Q19 12 8 21z'], // Archer: a bow and an arrow
  rider: ['M18 21c0-8-1-14-4-17l-1-2-1.5 3C8 7 5 10 3.5 12.5L5 15h3l3-2c0 3-1 6-2 8zM10 8.5h.01', 'M18 21c0-8-1-14-4-17l-1-2-1.5 3C8 7 5 10 3.5 12.5L5 15h3l3-2c0 3-1 6-2 8z'], // Rider: a horse's head
  knight: ['M5 21V11.5C5 7 8 5 12 5s7 2 7 6.5V21zM5 13.5h14M12 16.5v3M12 5C12.5 2.5 15.5 1 20 1.8c-2.6 1-4.4 2.8-5.3 5.2', 'M5 21V11.5C5 7 8 5 12 5s7 2 7 6.5V21zM12 5C12.5 2.5 15.5 1 20 1.8c-2.6 1-4.4 2.8-5.3 5.2z'], // Knight: a great helm with a plume sweeping back (the glyph round after #277: the bare helm read as a bucket)
  bastion: ['M4 15.5 19.5 6M16 2.5q5.5 3.5 1.5 9.5M6.5 18.5h11M6.5 18.5a3 3 0 1 0 .01 0M17.5 18.5a3 3 0 1 0 .01 0', 'M6.5 18.5a3 3 0 1 0 .01 0zM17.5 18.5a3 3 0 1 0 .01 0z'], // Ballista, side on: a stock angled up with its bow arm at the head, on a two-wheel carriage (the glyph round: the front view was a tangle)
  siegeTank: ['M3 13.3 18 4.3l2 3.4-15 9zM10 12.5a4.5 4.5 0 1 0 .01 0M10 17h.01', 'M3 13.3 18 4.3l2 3.4-15 9z'], // Cannon: a barrel on a wheel
  observer: ['M12 1.5a8.5 8.5 0 0 0-8.5 8.5c0 4.5 5.5 6.5 7 8h3c1.5-1.5 7-3.5 7-8A8.5 8.5 0 0 0 12 1.5zM10 18v2.5M14 18v2.5M9 20.5h6V23H9z', 'M12 1.5a8.5 8.5 0 0 0-8.5 8.5c0 4.5 5.5 6.5 7 8h3c1.5-1.5 7-3.5 7-8A8.5 8.5 0 0 0 12 1.5z'], // Balloon: a wide teardrop envelope over a hanging basket (the glyph round: the narrow one read as a light bulb)
  medic: ['M12 3a9 9 0 1 0 .01 0M12 8v8M8 12h8', 'M12 3a9 9 0 1 0 .01 0z'], // Healer (no building trains one)
  // the Kingdom's buildings
  core: ['M3 21V5h4v3h3.5V5h3v3H17V5h4v16zM9.5 21v-4a2.5 2.5 0 0 1 5 0v4', 'M3 21V5h4v3h3.5V5h3v3H17V5h4v16z'], // Castle: a wall, three merlons and a gate
  barracks: ['M3 3l3.5 1 8 8-2.5 2.5-8-8zM10.5 17.5l7-7M15.5 15.5l3.5 3.5M20 20h.01M21 3l-3.5 1-8 8 2.5 2.5 8-8zM13.5 17.5l-7-7M8.5 15.5 5 19M4 20h.01', 'M3 3l3.5 1 8 8-2.5 2.5-8-8zM21 3l-3.5 1-8 8 2.5 2.5 8-8z'], // crossed swords
  depot: ['M3.5 11.5 12 4l8.5 7.5M6 9.5V20h12V9.5M10.5 20v-5h3v5M16 7.5V4h2v5.5', 'M6 9.5 12 4.5l6 5V20H6z'], // Cottage: a house
  airfield: ['M2.5 11 6 5l6-3 6 3 3.5 6v10h-19zM7.5 21v-7h9v7M7.5 14l9 7M16.5 14l-9 7', 'M2.5 11 6 5l6-3 6 3 3.5 6v10h-19z'], // Stables: a barn
  forge: ['M2 7h15v1c0 2 2 3 4 3v1h-5l-1 4h3v4H6v-4h3l-1-4C5 12 3 10 2 7z', 'M2 7h15v1c0 2 2 3 4 3v1h-5l-1 4h3v4H6v-4h3l-1-4C5 12 3 10 2 7z'], // Blacksmith: an anvil
  factory: ['M19.1 9.8 21.8 10.2v3.6l-2.7.4-.5 1.2 1.6 2.3-2.5 2.5-2.3-1.6-1.2.5-.4 2.7h-3.6l-.4-2.7-1.2-.5-2.3 1.6-2.5-2.5 1.6-2.3-.5-1.2-2.7-.4v-3.6l2.7-.4.5-1.2-1.6-2.3 2.5-2.5 2.3 1.6 1.2-.5.4-2.7h3.6l.4 2.7 1.2.5 2.3-1.6 2.5 2.5-1.6 2.3zM12 9a3 3 0 1 0 .01 0', 'M19.1 9.8 21.8 10.2v3.6l-2.7.4-.5 1.2 1.6 2.3-2.5 2.5-2.3-1.6-1.2.5-.4 2.7h-3.6l-.4-2.7-1.2-.5-2.3 1.6-2.5-2.5 1.6-2.3-.5-1.2-2.7-.4v-3.6l2.7-.4.5-1.2-1.6-2.3 2.5-2.5 2.3 1.6 1.2-.5.4-2.7h3.6l.4 2.7 1.2.5 2.3-1.6 2.5 2.5-1.6 2.3z'], // Workshop: a gear
  extractor: ['M12 3v17M7 21h10M4 6.5h16M4 6.5 1.5 13M4 6.5 6.5 13M20 6.5 17.5 13M20 6.5l2.5 6.5M1.5 13a2.5 2.5 0 0 0 5 0zM17.5 13a2.5 2.5 0 0 0 5 0z', 'M1.5 13a2.5 2.5 0 0 0 5 0zM17.5 13a2.5 2.5 0 0 0 5 0z'], // Market: scales
  turret: ['M6 9 12 2l6 7zM8 9v12h8V9M11 13h2v3h-2zM6 21h12', 'M6 9 12 2l6 7zM8 9h8v12H8z'], // Watchtower: a tower with a pointed roof
  // the Expedition's units
  lumen: ['M5 8h14v11H5zM12 8V4.5M12 3h.01M3 12v3M21 12v3M8.5 11.5h2v2h-2zM13.5 11.5h2v2h-2zM9 16.5h6', 'M5 8h14v11H5z'], // Bot: a robot's head
  scythe: ['M2 16v-3.5l3-1 2.5-4h8l3 4 3.5 1V16zM7 14a2.5 2.5 0 1 0 .01 0M17 14a2.5 2.5 0 1 0 .01 0', 'M2 16v-3.5l3-1 2.5-4h8l3 4 3.5 1V16z'], // Buggy: a car on two wheels
  shrike: ['M7.5 7.5l9 9M16.5 7.5l-9 9M10 10h4v4h-4zM6 3a3 3 0 1 0 .01 0M18 3a3 3 0 1 0 .01 0M6 15a3 3 0 1 0 .01 0M18 15a3 3 0 1 0 .01 0', 'M6 3a3 3 0 1 0 .01 0zM18 3a3 3 0 1 0 .01 0zM6 15a3 3 0 1 0 .01 0zM18 15a3 3 0 1 0 .01 0z'], // Drone: four rotors on an X
  monolith: ['M12 2c3 2 4 6 4 10v5H8v-5c0-4 1-8 4-10zM8 13l-3 4v3.5l3-2M16 13l3 4v3.5l-3-2M10 20l2 2.5 2-2.5M12 8.5h.01', 'M12 2c3 2 4 6 4 10v5H8v-5c0-4 1-8 4-10z'], // Rover: a rocket
  umbra: ['M8 8.5a4 4 0 0 1 8 0V12a4 4 0 0 1-8 0zM8.5 9.5h7M4 22c0-4 3.5-6 8-6s8 2 8 6', 'M8 8.5a4 4 0 0 1 8 0V12a4 4 0 0 1-8 0zM4 22c0-4 3.5-6 8-6s8 2 8 6z'], // Android: a head with a visor, its shoulders
  prism: ['M12 2l2 3v11h-4V5zM6.5 16h11M12 16v4M12 21.8h.01', 'M12 2l2 3v11h-4V5z'], // Sellsword: a sword
  bruiser: ['M3.5 20.5 14.5 9.5M21.2 9.1 18.1 12.2 11.8 5.9 14.9 2.8z', 'M21.2 9.1 18.1 12.2 11.8 5.9 14.9 2.8z'], // Bruiser: a maul at an angle, its big block head up right (the glyph round: the upright one read as a T)
  halo: ['M12 2.5 20.2 7.2v9.6L12 21.5l-8.2-4.7V7.2zM12 8v8M8 12h8', 'M12 2.5 20.2 7.2v9.6L12 21.5l-8.2-4.7V7.2z'], // Medic (no building trains one)
  // the Expedition's buildings
  conflux: ['M5 3h14v18H5zM5 9h14M5 15h14M8 6h.01M8 12h.01M8 18h.01M11.5 6H16M11.5 12H16M11.5 18H16', 'M5 3h14v18H5z'], // Data center: a server rack
  siphon: ['M2 20 12 4l10 16zM9 20l3-6 3 6M12 4V1.5h3.5l-1 1.2 1 1.3H12', 'M2 20 12 4l10 16z'], // Recruiting post: a tent and its pennant
  spire: ['M12 10.5V22M9 22h6M12 7.5Q13.8 5 12 1Q11.4 5 12 7.5zM13.3 9.8Q14.6 12.6 18.9 13Q15.8 10.5 13.3 9.8zM10.7 9.8Q7.6 9.4 5.1 13Q8.8 11.5 10.7 9.8zM12 9h.01', 'M12 7.5Q13.8 5 12 1Q11.4 5 12 7.5zM13.3 9.8Q14.6 12.6 18.9 13Q15.8 10.5 13.3 9.8zM10.7 9.8Q7.6 9.4 5.1 13Q8.8 11.5 10.7 9.8z'], // Turbine: three blades on a mast
  kiln: ['M2 21V11l5 3v-3l5 3v-3l5 3V4h4v17zM6 17.5h2M11 17.5h2', 'M2 21V11l5 3v-3l5 3v-3l5 3V4h4v17z'], // Factory: a sawtooth roof and a chimney
  loom: ['M9 3h6M10 3v6L4.5 19.2A1.3 1.3 0 0 0 5.6 21h12.8a1.3 1.3 0 0 0 1.1-1.8L14 9V3M7 15h10', 'M7 15h10l2.5 4.2a1.3 1.3 0 0 1-1.1 1.8H5.6a1.3 1.3 0 0 1-1.1-1.8z'], // Lab: a flask
  ward: ['M3 21h18M5 21v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5M11 12.5 20.2 3l2 2-9.2 9.5', 'M5 21v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5zM11 12.5 20.2 3l2 2-9.2 9.5z'], // Sentry gun: a squat drum on its plate with a long barrel up right, like the sprite (the glyph round: the mast read as an A)
  uplink: ['M4 5a10 10 0 0 0 13 13zM10.5 11.5 16 6M17 5h.01M8.5 15.5 6 21h7l-2-4', 'M4 5a10 10 0 0 0 13 13z'], // Uplink: a dish
  eclipse: ['M12 2c4 0 6 4.5 6 10s-2 10-6 10-6-4.5-6-10 2-10 6-10zM12 7.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z', 'M12 2c4 0 6 4.5 6 10s-2 10-6 10-6-4.5-6-10 2-10 6-10z'], // Portal: a ring and a spark
};

/** Give a top-bar button an icon and a label (the label shows on wide screens only). */
/** An icon button's content: its icon and label. `alt`, the label it switches to (SOUND ON / SOUND OFF), is laid
 *  under it unseen, so the button keeps one width and the bar does not move when it switches. */
export function setIconButton(el, name, label, alt = '') {
  el.innerHTML = icon(name) + `<span class="t"><span>${label}</span>${alt ? `<span class="alt" aria-hidden="true">${alt}</span>` : ''}</span>`;
}

// A tech shows the icon of what it gives.
Object.assign(P, { afterburners: P.horseshoe, slipstream: P.bolt, rapidConstruction: P.frames, entrenching: P.entrench });
/** Whether `name` has a drawing (test/cards.test.js: every key the command card shows has one). */
export const hasIcon = (name) => !!P[name];
/** Whether unit or building kind `kind` has a symbol (test/cards.test.js: every one a card shows). */
export const hasGlyph = (kind) => !!U[kind];
const svg = (d, cls) => {
  const [line, fill] = Array.isArray(d) ? d : [d || ''];
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${fill ? `<path class="f" d="${fill}"/>` : ''}<path d="${line}"/></svg>`;
};
/** Inline SVG markup for a line icon. */
export const icon = (name) => svg(P[name], 'ico');
/** Inline SVG markup for a unit or building kind's symbol on the command card (a larger icon: `.ico.gl`). */
export const glyph = (kind) => svg(U[kind], 'ico gl');

