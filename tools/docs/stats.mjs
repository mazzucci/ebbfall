// A unit's or building's stat rows on the docs, the same two rows as the in-game long-press preview card: row 1
// toughness (Health, Shields for a race that has them, Armour), row 2 attack (damage per hit, what it can hit, then the
// tags Splash, Heals, Flying, Cloaked, Detector); a building has row 1 only. Base stats only, from the sim's tables
// (src/engine/constants.js): no upgrades, range, rate or speed.
// Shaped as the stat-chips branch's src/client/stats.js `statRows` (#188: the same chips `{ k, text, label, ico, dim }`):
// once that is on main, the docs import it from there and this file goes.
import { UNITS, BUILDINGS, FACTIONS, kindsOf } from '../../src/engine/constants.js';

/** The kinds of every race with shields on any of its own kinds (the Vael): they keep a Shields slot. */
const SHIELDED = new Set(Object.values(FACTIONS).map(kindsOf).filter(ks => [...ks].some(k => (UNITS[k] || BUILDINGS[k]).shields > 0)).flatMap(ks => [...ks]));

const num = (n) => String(+n.toFixed(1));
const chip = (k, text, label, ico = k, dim = false) => ({ k, text, label, ico, dim });

/** A weapon's damage per hit as parts: one figure, or ground then air when they differ ("9", "30 air"). */
function hitParts(w, tail = '') {
  if (!w || !(w.dmg || w.dmgAir)) return [];
  if (w.dmg && w.dmgAir && w.dmg !== w.dmgAir) return [num(w.dmg) + tail, num(w.dmgAir) + ' air' + tail];
  return [num(w.dmg || w.dmgAir) + tail];
}

/** The guns a unit fires: a siege gun (only deployed) after the light gun it has on its tracks. */
function guns(d) {
  const w = d.weapon;
  if (!w || d.worker) return [];
  return w.siege ? [[d.light, ''], [w, ' deployed']].filter(([g]) => g) : [[w, '']];
}

/** Stat rows for unit or building kind `k`: a list of rows, each a list of chips `{ k, text, label, ico, dim }`. */
export function statRows(k) {
  const d = UNITS[k] || BUILDINGS[k];
  if (!d) return [];
  const tough = [chip('hp', num(d.hp), `Health ${num(d.hp)}`, 'health')];
  if (SHIELDED.has(k)) tough.push(chip('shields', num(d.shields || 0), `Shields ${num(d.shields || 0)}`, 'shields', !d.shields));
  tough.push(chip('armor', num(d.armor || 0), `Armour ${num(d.armor || 0)}`, 'armor', !d.armor));
  if (!UNITS[k]) return [tough];
  const gs = guns(d), parts = gs.flatMap(([g, tail]) => hitParts(g, tail));
  const attack = [];
  if (parts.length) {
    attack.push(chip('dmg', parts.join(' · '), `Damage ${parts.join(', ')}`));
    const ground = gs.some(([g]) => g.dmg > 0), air = gs.some(([g]) => g.dmgAir > 0);
    const [ico, label] = ground && air ? ['both', 'Hits ground and air'] : air ? ['air', 'Hits air'] : ['ground', 'Hits ground'];
    attack.push(chip('targets', '', label, ico));
  } else attack.push(chip('dmg', '—', 'No weapon', 'dmg', true));
  const tags = [[gs.some(([g]) => g.splash > 0), 'Splash'], [d.heal > 0, 'Heals'], [d.air, 'Flying'], [d.cloaked, 'Cloaked'], [d.detect > 0, 'Detector']];
  const says = { Heals: d.mend ? 'Heals: mends shields' : 'Heals infantry' };
  for (const [on, name] of tags) if (on) attack.push(chip('tag', name, says[name] || name, null));
  return [tough, attack];
}
