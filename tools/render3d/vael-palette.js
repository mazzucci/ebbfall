// The Vael's palette (STYLE.md, "The Vael: the palette"): every colour of the Vael's own materials, by variant. Shapes,
// frames and the team glaze (the seat's colour) never change with it. `pearl` is today's look (pearl ceramic,
// blue-violet deeplight); `verdigris` and `lantern` are the two candidates of the palette review (2026-11-07: blind
// testers read white-and-gold shells with violet cores as StarCraft's Protoss). Pick one with ?vael=NAME on
// tools/render3d/index.html, or VAEL_PALETTE=NAME for the Node drivers (tools/art/render3d.mjs passes it on).
// Pure data, no three.js: tools/art/effects2.js (the Lens's beam) reads it in Node too.

/** The pearl texture's marks: the base, the mottling (rgb, alpha range, count) and the seams' colours. */
const PEARL = {
  tex: { base: '#ecebe8', grain: [225, 30, -4], mottle: [[190, 180, 215], 0.04, 0.06, 14], seamW: 1.8,
    seam: 'rgba(45,38,60,0.8)', groove: 'rgba(70,62,90,0.5)', inlay: 'rgba(180,160,255,0.75)', light: 'rgba(255,255,255,0.55)' },
  sheen: 0xd8ccff, ceramic: {},
  shell: 0xcbc2b1, shellLight: 0xdad2c2, shellDark: 0xa39a8b, shellDeep: 0x7e766c, ring: 0xd6cfc0,
  shellDarkExtra: {}, shellDeepExtra: {}, ringExtra: {},
  ink: 0x0f0d16, inkSeam: 0x15121c, inkMatte: 0x0e0c14,
  deeplight: [0x2a3290, 0x7080ff, 1.9], deepCore: [0xc8d0ff, 0xdde2ff, 1.1], deepWhite: 0xf4f2ff,
  deepHalo: [0x6a7cf0, 0x5a68e0, 0x4c58c8],
  pool: [0x0c1024, 0x1a2260, 0.3], poolDeep: [0x06081a, 0x121848, 0.2],
  darkGlass: 0x16142c, petalGlass: [0x1c1840, 0x0e0c22, 0x8c80d8], basin: [0x3a2e74, 0x241a58, 0.55],
  bud: [0x6a5aa8, 0x2c2060, 0xe8e0ff], mouth: [0x1a1830, 0x201c48], tubeDeep: 0x4a4650,
  mend: { light: [0x0a5a4c, 0x12b898, 1.0], glass: [0x1f8c7a, 0x0a4a40], core: [0x9cf4e4, 0xa8fff0], halo: [0x28c4ac, 0x20ac98] },
  beam: { sheath: [112, 128, 255], heart: [230, 236, 255] },
};

/** The glaze's neutral map for a palette other than the pearl: the pearl's marks in greys. */
const GLAZE_TEX = { base: '#ecebe8', grain: [225, 30, 0], mottle: [[200, 200, 200], 0.04, 0.06, 14], seamW: 1.8,
  seam: 'rgba(48,48,48,0.8)', groove: 'rgba(76,76,76,0.5)', inlay: 'rgba(214,214,214,0.75)', light: 'rgba(255,255,255,0.55)' };

/** Verdigris: weathered copper, its exposed plates crusted with pale verdigris and the bare metal showing russet in the
 *  shade, underneath and in the worn seams; the lights a deep teal-blue (leaning blue: never the green of water). */
const VERDIGRIS = {
  tex: { base: '#f2f2ee', grain: [220, 35, 0], mottle: [[196, 124, 86], 0.16, 0.16, 26], seamW: 2.4,
    seam: 'rgba(58,34,22,0.85)', groove: 'rgba(84,50,32,0.55)', inlay: 'rgba(214,140,92,0.8)', light: 'rgba(255,255,255,0.45)' },
  glazeTex: GLAZE_TEX, sheen: 0x94b8ae, ceramic: { metalness: 0.15, roughness: 0.62, clearcoat: 0.2, clearcoatRoughness: 0.4 },
  shell: 0x6c968a, shellLight: 0x7ea89c, shellDark: 0x6e4a36, shellDeep: 0x4a3226, ring: 0x8ab2a6,
  shellDarkExtra: { metalness: 0.5, roughness: 0.45 }, shellDeepExtra: { metalness: 0.45, roughness: 0.55 }, ringExtra: {},
  ink: 0x0a1113, inkSeam: 0x0f181a, inkMatte: 0x0a1012,
  deeplight: [0x0a3a58, 0x1e9ad8, 1.9], deepCore: [0xb8e6ff, 0xcff0ff, 1.1], deepWhite: 0xeefaff,
  deepHalo: [0x2a9ad8, 0x2088c8, 0x1a74b0],
  pool: [0x081620, 0x0e3048, 0.3], poolDeep: [0x040c12, 0x0a2236, 0.2],
  darkGlass: 0x0c1a24, petalGlass: [0x0e2a3e, 0x061422, 0x70b8d8], basin: [0x123a5c, 0x0a2c4e, 0.55],
  bud: [0x2a6688, 0x0c3050, 0xd0eef8], mouth: [0x0c1c2a, 0x0e304a], tubeDeep: 0x3c4642,
  // the mender's light: pale and warm, a candle-white apart from the teal-blue weapons and the verdigris
  mend: { light: [0x6a6250, 0xe8d8b8, 0.9], glass: [0xcfc6b2, 0x3a342a], core: [0xfff8ec, 0xfffaf0], halo: [0xe0d2b4, 0xc8b898] },
  beam: { sheath: [40, 150, 220], heart: [205, 238, 255] },
};

/** Fen lantern: bone, a warm off-white aged to ivory at the edges with dark seams and horn-brown undersides; the lights
 *  a soft lantern glow, a peach-orange (hue about 22, off seat 0's gold at 35) with a cream heart (dim halos: a lantern, not a fire). */
const LANTERN = {
  tex: { base: '#f0ece2', grain: [218, 34, -10], mottle: [[196, 168, 120], 0.10, 0.12, 20], seamW: 2.2,
    seam: 'rgba(40,26,14,0.9)', groove: 'rgba(72,50,30,0.6)', inlay: 'rgba(96,66,36,0.7)', light: 'rgba(255,250,236,0.4)' },
  glazeTex: GLAZE_TEX, sheen: 0xf0e2c8, ceramic: { roughness: 0.6, clearcoat: 0.18, clearcoatRoughness: 0.4 },
  shell: 0xcdc3ad, shellLight: 0xdcd4c2, shellDark: 0x98866a, shellDeep: 0x665642, ring: 0xd4cab4,
  shellDarkExtra: {}, shellDeepExtra: {}, ringExtra: {},
  ink: 0x17110c, inkSeam: 0x1d150e, inkMatte: 0x140f0a,
  deeplight: [0x5a2408, 0xff8c4c, 1.5], deepCore: [0xffe2c8, 0xffe8d0, 1.1], deepWhite: 0xfff4ea,
  deepHalo: [0xf08a54, 0xd8743e, 0xb85e30],
  pool: [0x16100c, 0x2e180a, 0.3], poolDeep: [0x0c0805, 0x1e1008, 0.2],
  darkGlass: 0x1c140c, petalGlass: [0x2c1a0c, 0x2a1406, 0xe0b080], basin: [0x3c2812, 0x4a2608, 0.55],
  bud: [0x8a6e4e, 0x3a1e06, 0xf0e0c8], mouth: [0x20140a, 0x3a2008], tubeDeep: 0x4a4034,
  // the mender's light: a pale sea-glass, cool against the amber weapons and paler than seat 2's teal
  mend: { light: [0x2a6a62, 0x7ad8c8, 0.9], glass: [0x5a9a90, 0x1a3a36], core: [0xd8fff8, 0xe0fffa], halo: [0x70d0c0, 0x60b8aa] },
  beam: { sheath: [255, 140, 80], heart: [255, 236, 210] },
};

export const VAEL_PALETTES = { pearl: PEARL, verdigris: VERDIGRIS, lantern: LANTERN };
const asked = (globalThis.location && new URLSearchParams(globalThis.location.search).get('vael')) || globalThis.process?.env?.VAEL_PALETTE || 'pearl';
if (!VAEL_PALETTES[asked]) throw new Error(`no Vael palette ${asked}: ${Object.keys(VAEL_PALETTES).join(', ')}`);
export const VAEL_PALETTE = asked, VP = VAEL_PALETTES[asked];
