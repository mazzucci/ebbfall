// How hard a hit lands (src/client/look.js hitTier, HIT_LOOK): one scale for every unit and tower, by the weapon's
// damage per hit (base, against the ground) read from the live data. The pinned list below is today's data; a
// rebalance that moves a unit across a line updates it on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

// (an effect frame's size in world px: the atlas is drawn at 2x)
const art = new URL('../public/art/', import.meta.url), frames = {};
for (const f of readdirSync(art).filter(f => /^atlas-\d+\.json$/.test(f))) Object.assign(frames, JSON.parse(readFileSync(new URL(f, art))).frames);
const px = (name) => frames[name].sourceSize.w / 2;
/** The largest thing a tier's hit draws (world px across), as render.js tierHit draws it. */
function footprint(tier) {
  const L = HIT_LOOK[tier];
  if (!L.hit) return px('flash_0') * L.flash;
  const k = L.size, sizes = [px('flash_0') * 0.9 * k * L.flashK, px('spark_0') * L.chip.scale];
  if (L.hit === 'blast') sizes.push(px('boom_small_0') * 1.1 * k);
  return Math.max(...sizes);
}

test('at a glance: a heavy hit clearly bigger than a medium one, clearly smaller than a siege one', () => {
  const [m, h, s] = ['medium', 'heavy', 'siege'].map(footprint);
  assert.ok(h >= 1.6 * m, `heavy ${h.toFixed(1)} px against medium ${m.toFixed(1)}`);
  assert.ok(s >= 1.3 * h, `siege ${s.toFixed(1)} px against heavy ${h.toFixed(1)}`);
  assert.ok(HIT_LOOK.heavy.chip.scale > HIT_LOOK.siege.chip.scale && HIT_LOOK.heavy.chip.life > 1, 'heavy chips larger and longer-lived');
  assert.ok(HIT_LOOK.heavy.scuff?.n > 0, 'a heavy melee blow scuffs the ground');
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
