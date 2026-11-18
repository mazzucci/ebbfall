// How hard a hit lands (src/client/look.js hitTier, HIT_LOOK): one scale for every unit and tower, by the weapon's
// damage per hit (base, against the ground) read from the live data. The pinned list below is today's data; a
// rebalance that moves a unit across a line updates it on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hitTier, HIT_TIERS, HIT_LOOK, towerOf } from '../src/client/look.js';
import { UNITS, BUILDINGS, FACTIONS } from '../src/engine/constants.js';

const TIERS = {
  light: ['harvester', 'lumen', 'shrike', 'trooper', 'rider', 'scythe', 'bastion', 'prism'], // (Villager, Bot, Drone, Guard, Rider, Buggy, Ballista, Sellsword)
  medium: ['lancer', 'turret', 'ward', 'bruiser'], // (Archer, Watchtower, Sentry mast, Bruiser)
  heavy: ['knight', 'umbra'], // (Knight, Android)
  siege: ['siegeTank', 'monolith'], // (Cannon, Rover)
};

test('every unit and tower with a weapon falls in its tier, from its damage per hit in the data', () => {
  const armed = [...Object.entries(UNITS), ...Object.entries(BUILDINGS)].filter(([, d]) => d.weapon);
  const got = {};
  for (const [k, d] of armed) (got[hitTier(d.weapon)] ??= []).push(k);
  for (const tier of Object.keys(TIERS)) assert.deepEqual((got[tier] ?? []).sort(), TIERS[tier].slice().sort(), `${tier}: ${(got[tier] ?? []).map(k => `${k} ${(UNITS[k] ?? BUILDINGS[k]).weapon.dmg}`).join(', ')}`);
  assert.equal(armed.length, Object.values(TIERS).flat().length, 'every armed unit and tower pinned');
});

test('the lines: light to 12, medium to 30, heavy to 80, siege above with splash; no weapon is light', () => {
  assert.deepEqual(HIT_TIERS, { light: 12, medium: 30, heavy: 80 });
  const w = (dmg, splash = 0) => ({ dmg, splash });
  assert.deepEqual([w(12), w(13), w(30), w(31), w(80), w(81, 0.5), w(120, 0)].map(hitTier), ['light', 'medium', 'medium', 'heavy', 'heavy', 'siege', 'heavy']);
  assert.equal(hitTier(null), 'light');
  assert.equal(hitTier({ ...w(10), dmgAir: 200 }), 'light', 'by the damage against the ground');
});

test('the light tier keeps today\'s hits; the rest step up, and their sound with them', () => {
  assert.deepEqual(HIT_LOOK.light, { weight: 0 }, 'light: no extra look, today\'s sound');
  assert.ok(!HIT_LOOK.medium.hit && HIT_LOOK.medium.flash > 0, 'medium: the shot\'s own impact with a modest flash');
  assert.equal(HIT_LOOK.heavy.hit, 'blow'); assert.equal(HIT_LOOK.siege.hit, 'blast');
  assert.deepEqual(['light', 'medium', 'heavy', 'siege'].map(t => HIT_LOOK[t].weight), [0, 1, 2, 3]);
});

test('a tower\'s shot (no shooter kind) is told by its people\'s tower', () => {
  assert.equal(towerOf('humans', FACTIONS, BUILDINGS), 'turret');
  assert.equal(towerOf('vael', FACTIONS, BUILDINGS), 'ward');
  assert.equal(towerOf('nobody', FACTIONS, BUILDINGS), undefined);
});

test('no camera shake from hits: only a headquarters\' fall shakes it', () => {
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  assert.equal(src.match(/quake = \{/g)?.length, 1, 'one place starts a shake');
  assert.ok(src.includes('if (plan.shake && nearView(x, y, 0)) quake = { ...plan.shake, t: 0 };'), 'a fall\'s');
});
