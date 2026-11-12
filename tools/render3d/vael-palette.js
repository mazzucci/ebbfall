// The Vael's palette, Fen lantern (STYLE.md, "The Vael: the palette"; Stelian's pick, 2026-11-07, over today's pearl
// and a verdigris: blind testers read white-and-gold shells with violet cores as StarCraft's Protoss): every color of
// the Vael's own materials in one place. Shapes, frames and the team glaze (the seat's color) never change with it.
// Pure data, no three.js: tools/art/effects2.js (the Lens's beam) reads it in Node too.

/** The team glaze's map: the shell's marks in neutral grays, so the team mask carries no hue of the shell's. */
const GLAZE_TEX = { base: '#ecebe8', grain: [225, 30, 0], mottle: [[200, 200, 200], 0.04, 0.06, 14], seamW: 1.8,
  seam: 'rgba(48,48,48,0.8)', groove: 'rgba(76,76,76,0.5)', inlay: 'rgba(214,214,214,0.75)', light: 'rgba(255,255,255,0.55)' };

/** Fen lantern: bone, a warm off-white aged to ivory at the edges with dark seams and horn-brown undersides; the lights
 *  a soft lantern glow, a peach-orange (hue about 22, off seat 0's gold at 35) with a cream heart (dim halos: a lantern, not a fire). */
export const VP = {
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
