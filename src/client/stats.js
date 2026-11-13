// The long-press preview's stat chips (card.js `showDetail`), and only there: two fixed rows, the same for every unit.
// Row 1, toughness: Health, Shields (every kind of a race that has shields: none since the re-theme), Armor (shown
// at 0 too, dimmed). Row 2, attack: damage per hit, what it can hit (ground, air or both), then tags (Splash, Slows,
// Heals, Flying); an unarmed unit (workers too, as in the selection console) shows a dimmed "—" in the damage slot.
// Base stats only, read from the sim's tables (src/engine/constants.js): no upgrades, range, rate or speed.
// A building's card has row 1 only, smaller (`small`: its gold the larger figure).
import { UNITS, BUILDINGS, FACTIONS, kindsOf } from '../engine/constants.js';
import { icon } from './icons.js';

/** The kinds of every race with shields on any of its own kinds: their cards keep a Shields slot (none since the
 *  re-theme: the shield rules stay in the sim, as data). */
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
  if (!w || d.worker) return []; // (a worker's tool is no weapon: the console shows it unarmed too)
  return w.siege ? [[d.light, ''], [w, ' deployed']].filter(([g]) => g) : [[w, '']];
}

/** Stat rows for unit or building kind `k`: a list of rows, each a list of chips
 *  `{ k, text, label, ico, dim }` (`k`: hp, shields, armor, dmg, targets or tag; `ico`: its icons.js icon, or null). */
export function statRows(k) {
  const d = UNITS[k] || BUILDINGS[k];
  if (!d) return [];
  const tough = [chip('hp', num(d.hp), `Health ${num(d.hp)}`, 'health')];
  if (SHIELDED.has(k)) tough.push(chip('shields', num(d.shields || 0), `Shields ${num(d.shields || 0)}`, 'shields', !d.shields));
  tough.push(chip('armor', num(d.armor || 0), `Armor ${num(d.armor || 0)}`, 'armor', !d.armor));
  if (!UNITS[k]) return [tough];
  const gs = guns(d), parts = gs.flatMap(([g, tail]) => hitParts(g, tail));
  const attack = [];
  if (parts.length) {
    attack.push(chip('dmg', parts.join(' · '), `Damage ${parts.join(', ')}`));
    const ground = gs.some(([g]) => g.dmg > 0), air = gs.some(([g]) => g.dmgAir > 0);
    const [ico, label] = ground && air ? ['both', 'Hits ground and air'] : air ? ['air', 'Hits air'] : ['ground', 'Hits ground'];
    attack.push(chip('targets', '', label, ico));
  } else attack.push(chip('dmg', '—', 'No weapon', 'dmg', true));
  const tags = [[gs.some(([g]) => g.splash > 0), 'Splash'], [gs.some(([g]) => g.slow > 0), 'Slows'], [d.heal > 0, 'Heals'], [d.air, 'Flying']];
  const says = { Heals: d.mend ? 'Heals: mends shields' : 'Heals infantry', Slows: 'Slows what it hits' };
  for (const [on, name] of tags) if (on) attack.push(chip('tag', name, says[name] || name, null));
  return [tough, attack];
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** A target slot's icons: one for ground or air, both side by side. */
const targetIcons = (ico) => ico === 'both' ? icon('ground') + icon('air') : icon(ico);
function chipHtml(c) {
  const a = `title="${esc(c.label)}" aria-label="${esc(c.label)}"`;
  if (c.k === 'tag') return `<span class="tg" ${a}>${esc(c.text)}</span>`;
  const pic = c.k === 'targets' ? targetIcons(c.ico) : icon(c.ico);
  return `<span class="sc ${c.k}${c.dim ? ' dim' : ''}" role="img" ${a}>${pic}${c.text ? `<span class="n">${esc(c.text)}</span>` : ''}</span>`;
}

/** The chips' markup for the preview card of kind `k` ('' for a kind with none). */
export function statsHtml(k) {
  const rows = statRows(k);
  return rows.length ? `<span class="stats${UNITS[k] ? '' : ' small'}">${rows.map(r => `<span class="sr">${r.map(chipHtml).join('')}</span>`).join('')}</span>` : '';
}
