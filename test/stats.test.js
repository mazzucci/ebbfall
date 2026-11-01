// The long-press preview's stat chips (src/client/stats.js) for every kind in the sim's tables: two rows of the same
// shape for every unit (Health, Shields for the Vael only, Armour; damage, what it hits, tags), a dimmed "—" for the
// unarmed, both guns of a siege unit, one row for a building, and markup with a label on every chip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, BUILDINGS, FACTIONS, kindsOf } from '../src/engine/constants.js';
import { statRows, statsHtml } from '../src/client/stats.js';

const vael = kindsOf(FACTIONS.vael), humans = kindsOf(FACTIONS.humans);
const TAGS = ['Splash', 'Heals', 'Flying', 'Cloaked', 'Detector'];
const armed = (d) => !d.worker && !!(d.weapon?.dmg || d.weapon?.dmgAir || d.light?.dmg || d.light?.dmgAir);

test('every unit gets the same two rows: toughness, then attack', () => {
  for (const [k, d] of Object.entries(UNITS)) {
    const rows = statRows(k);
    assert.equal(rows.length, 2, `${k}: two rows`);
    const [tough, attack] = rows;
    assert.deepEqual(tough.map(c => c.k), vael.has(k) ? ['hp', 'shields', 'armor'] : ['hp', 'armor'], `${k}: Health, Shields for the Vael only, Armour`);
    assert.equal(tough[0].text, String(d.hp), `${k}: its health`);
    assert.equal(tough.at(-1).text, String(d.armor), `${k}: its armour`);
    assert.equal(tough.at(-1).dim, !d.armor, `${k}: no armour is dimmed, not gone`);
    if (vael.has(k)) assert.equal(tough[1].text, String(d.shields), `${k}: its shields`);
    assert.equal(attack[0].k, 'dmg', `${k}: damage first`);
    const rest = attack.slice(armed(d) ? 2 : 1);
    if (armed(d)) assert.equal(attack[1].k, 'targets', `${k}: what it hits second`);
    assert.ok(rest.every(c => c.k === 'tag'), `${k}: then tags`);
    const tags = rest.map(c => c.text);
    assert.deepEqual(tags, TAGS.filter(t => tags.includes(t)), `${k}: tags in one order`);
    assert.equal(tags.includes('Flying'), !!d.air, `${k}: Flying when it flies`);
    assert.equal(tags.includes('Detector'), d.detect > 0, `${k}: Detector when it detects`);
    assert.equal(tags.includes('Cloaked'), !!d.cloaked, `${k}: Cloaked when always cloaked`);
    assert.equal(tags.includes('Heals'), d.heal > 0, `${k}: Heals when it heals or mends`);
    for (const c of [...tough, ...attack]) {
      assert.ok(c.label && !/undefined|NaN|null/.test(c.label + c.text), `${k}: ${c.k} is well formed (${c.label}, ${c.text})`);
    }
  }
  assert.ok(humans.size && vael.size);
});

test('an unarmed unit shows a dimmed "—" and its tags (workers too)', () => {
  const unarmed = Object.keys(UNITS).filter(k => !armed(UNITS[k]));
  for (const k of ['medic', 'observer', 'halo', FACTIONS.humans.worker, FACTIONS.vael.worker]) assert.ok(unarmed.includes(k), `${k} is unarmed`);
  for (const k of unarmed) {
    const [dmg, ...rest] = statRows(k)[1];
    assert.deepEqual([dmg.text, dmg.dim], ['—', true], `${k}: a dimmed dash`);
    assert.ok(rest.every(c => c.k === 'tag'), `${k}: no target slot, only tags`);
  }
  assert.deepEqual(statRows('halo')[1].map(c => c.text), ['—', 'Heals', 'Detector']);
});

test('what a unit hits, and damage that differs on the ground and in the air', () => {
  for (const [k, d] of Object.entries(UNITS).filter(([, d]) => armed(d))) {
    const guns = [d.weapon, d.light].filter(Boolean), g = guns.some(w => w.dmg > 0), a = guns.some(w => w.dmgAir > 0);
    assert.equal(statRows(k)[1][1].ico, g && a ? 'both' : a ? 'air' : 'ground', k);
  }
  const both = Object.keys(UNITS).find(k => !UNITS[k].weapon?.siege && UNITS[k].weapon?.dmg && UNITS[k].weapon.dmgAir && UNITS[k].weapon.dmg !== UNITS[k].weapon.dmgAir);
  assert.ok(both, 'a unit with different ground and air damage');
  assert.equal(statRows(both)[1][0].text, `${UNITS[both].weapon.dmg} · ${UNITS[both].weapon.dmgAir} air`);
  const same = Object.keys(UNITS).find(k => UNITS[k].weapon?.dmg && UNITS[k].weapon.dmg === UNITS[k].weapon.dmgAir);
  assert.equal(statRows(same)[1][0].text, String(UNITS[same].weapon.dmg), `${same}: one figure for both`);
});

test('the Siege Tank shows both guns: on its tracks, then deployed', () => {
  const d = UNITS.siegeTank;
  assert.ok(d.weapon.siege && d.light, 'a siege gun and a light gun');
  const [dmg, targets, ...tags] = statRows('siegeTank')[1];
  assert.equal(dmg.text, `${d.light.dmg} · ${d.weapon.dmg} deployed`);
  assert.equal(targets.ico, 'ground');
  assert.deepEqual(tags.map(t => t.text), ['Splash']);
});

test('a building gets the toughness row only', () => {
  for (const [k, d] of Object.entries(BUILDINGS)) {
    const rows = statRows(k);
    assert.equal(rows.length, 1, k);
    assert.deepEqual(rows[0].map(c => c.k), vael.has(k) ? ['hp', 'shields', 'armor'] : ['hp', 'armor'], k);
    assert.equal(rows[0][0].text, String(d.hp), k);
  }
  assert.deepEqual(statRows('nothing'), []);
  assert.equal(statsHtml('nothing'), '');
});

test('the markup: two rows, a label on every chip, an icon on every slot but the tags', () => {
  for (const k of [...Object.keys(UNITS), ...Object.keys(BUILDINGS)]) {
    const h = statsHtml(k), rows = statRows(k), chips = rows.flat();
    assert.equal((h.match(/class="sr"/g) || []).length, rows.length, k);
    assert.equal((h.match(/aria-label="/g) || []).length, chips.length, `${k}: every chip labelled`);
    assert.equal((h.match(/<svg/g) || []).length, chips.reduce((n, c) => n + (c.k === 'tag' ? 0 : c.ico === 'both' ? 2 : 1), 0), `${k}: icons`);
  }
  assert.match(statsHtml('trooper'), new RegExp(`aria-label="Health ${UNITS.trooper.hp}"`));
});
