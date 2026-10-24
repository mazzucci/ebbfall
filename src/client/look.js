// How kinds look and sound beyond their sprites, by kind key: lights, turret heads, chimney smoke, radio voices.
// The renderer and the sound engine read this table instead of naming kinds, so a new race adds rows here.

/** Buildings: `glow` [colour, size, strength, height above the centre, flicker], `head` (a turret head sprite that
 * turns to aim), `smoke` (points in px from the footprint's top-left corner that puff while the building works). */
export const BLDG_LOOK = {
  core: { glow: [0xffd27a, 1.6, 0.35, 30, false] },
  extractor: { glow: [0xa78bfa, 1.1, 0.5, 12, false] },
  forge: { glow: [0xff8a2a, 1.2, 0.4, 12, true], smoke: [[17, 4], [47, 4]] },
  turret: { head: 'turret_head' },
  // the Vael: violet light from their crystals
  conflux: { glow: [0xb48cff, 1.6, 0.4, 26, false] },
  siphon: { glow: [0xa78bfa, 1.1, 0.55, 14, false] },
  spire: { glow: [0xb48cff, 0.9, 0.35, 34, false] },
  ward: { glow: [0xb48cff, 0.8, 0.35, 20, false] },
};

/** Units: the pitch of their radio chirp (Hz): heavy machines low, flyers and medics high. */
export const UNIT_VOICE = { harvester: 330, trooper: 520, lancer: 600, medic: 760, vanguard: 260, wasp: 880, observer: 1040, lumen: 700, scythe: 460, prism: 820, monolith: 220, shrike: 960, halo: 940 };
