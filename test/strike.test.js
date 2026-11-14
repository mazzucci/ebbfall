// The melee units' strike poses (src/client/look.js STRIKE, strikePose; tools/render3d/retheme.js STRIKE_POSES): which
// pose a unit shows from its cooldown and target, and the frames in the atlas for every facing, each with its
// team mask lined up, kept out of the walk animation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRIKE, strikePose, inReach, MUZZLE_FLASH, MELEE_PUFF, IMPACT, impactOf, MACHINES, SHOT_LOOK, PEOPLE_SHOT, TOWER_SHOT, deathOf, AIR_PUFF, DUST, SLOW, slowTint } from '../src/client/look.js';
import { fx, burst, partSize, updateFx } from '../src/client/fx.js';
import { UNITS, BUILDINGS } from '../src/engine/constants.js';

const art = new URL('../public/art/', import.meta.url), index = JSON.parse(readFileSync(new URL('atlas.json', art))), frames = {};
for (const p of index.pages) Object.assign(frames, JSON.parse(readFileSync(new URL(p, art))).frames);

/** A melee unit of `type` at (100, 100) with cooldown `cd` and a target (a unit `gap` px from its edge, or none). */
function fighter(type, cd, gap = 0) {
  const d = UNITS[type], target = gap === null ? null : { kind: 'unit', x: 100 + d.r + 10 + gap, y: 100, r: 10, dead: false };
  return { type, d, x: 100, y: 100, r: d.r, cd, task: { t: target ? 'attack' : 'idle', target } };
}

test('the five melee fighters, and only they, have strike poses', () => {
  assert.deepEqual([...STRIKE.kinds].sort(), ['bruiser', 'knight', 'prism', 'rider', 'trooper']);
  for (const k of STRIKE.kinds) assert.ok(UNITS[k].weapon?.melee, `${k} fights hand to hand`);
});

test('a fighter strikes for a moment after its blow, and stands in its wind-up between blows', () => {
  for (const k of STRIKE.kinds) {
    const cd = UNITS[k].weapon.cd;
    assert.equal(strikePose(fighter(k, cd)), 'strike', `${k}: the blow just landed`);
    assert.equal(strikePose(fighter(k, cd - STRIKE.HOLD + 0.01)), 'strike', `${k}: still striking`);
    assert.equal(strikePose(fighter(k, cd - STRIKE.HOLD - 0.01)), 'wind', `${k}: back on guard`);
    assert.equal(strikePose(fighter(k, 0.1)), 'wind', `${k}: the next blow coming`);
    assert.equal(strikePose(fighter(k, -3)), 'wind', `${k}: ready, the target in reach`);
    assert.equal(strikePose(fighter(k, -3, 60)), null, `${k}: the target out of reach`);
    assert.equal(strikePose(fighter(k, -3, null)), null, `${k}: nothing to fight`);
  }
  const archer = { ...fighter('trooper', 0), type: 'lancer', d: UNITS.lancer };
  assert.equal(strikePose(archer), null, 'a ranged unit has none');
});

test('reach is the sim\'s: the weapon\'s range plus half the striker\'s radius, from the target\'s edge or a building\'s wall', () => {
  const u = fighter('trooper', 0), reach = UNITS.trooper.weapon.range * 32 + u.r * 0.5;
  assert.ok(inReach(u, { kind: 'unit', x: 100 + reach + 10, y: 100, r: 10 }));
  assert.ok(!inReach(u, { kind: 'unit', x: 100 + reach + 10 + 5, y: 100, r: 10 }));
  const b = { kind: 'bldg', tx: 4, ty: 2, w: 2, h: 2 }; // (its west wall at x = 128)
  assert.ok(inReach({ ...u, x: 128 - reach + 1, y: 90 }, b));
  assert.ok(!inReach({ ...u, x: 128 - reach - 5, y: 90 }, b));
  assert.ok(!inReach(u, { kind: 'unit', x: 110, y: 100, r: 10, dead: true }), 'not a dead one');
});

test('every melee fighter has its two strike frames in all facings, each with its team mask, outside the walk', () => {
  for (const k of STRIKE.kinds) for (let d = 0; d < index.facings; d++) {
    for (const pose of ['wind', 'strike']) {
      const name = `${k}_${d}_${pose}`, b = frames[name], m = frames[`${name}_m`];
      assert.ok(b && m, `${name} and its mask`);
      assert.deepEqual(m.sourceSize, b.sourceSize, `${name}_m has ${name}'s full size`);
      assert.deepEqual(m.anchor, b.anchor, `${name}_m has ${name}'s anchor`);
    }
    assert.ok(!index.animations[`${k}_${d}`].some(n => /_(wind|strike)$/.test(n)), `${k}_${d}: the walk has no strike frame`);
  }
});

test('the muzzle flashes and the melee dust name real shooters', () => {
  for (const k of Object.keys(MUZZLE_FLASH)) assert.ok((UNITS[k] ?? BUILDINGS[k])?.weapon && !(UNITS[k] ?? BUILDINGS[k]).weapon.melee, `${k} shoots`);
  for (const k of Object.keys(MELEE_PUFF)) assert.ok(UNITS[k].weapon.melee, `${k} fights hand to hand`);
});

test('impacts: steel glints for arrows, bolts and darts, sparks for tracers, fire only for the cannonball and the rocket', () => {
  const shots = new Set([...Object.values(SHOT_LOOK), ...Object.values(PEOPLE_SHOT).flatMap(Object.values), ...Object.values(TOWER_SHOT)]);
  for (const s of shots) assert.ok(IMPACT[s], `${s} has an impact`);
  assert.deepEqual(Object.keys(IMPACT).filter(s => ['shell', 'rocket'].includes(IMPACT[s])).sort(), ['cannonball', 'rocket']);
  assert.equal(impactOf({ proj: 'missile', by: 'lancer', people: 'humans' }), 'glint', 'an Archer\'s arrow');
  assert.equal(impactOf({ proj: 'bolt', by: 'umbra', people: 'vael' }), 'spark', 'an Android\'s tracer');
  assert.equal(impactOf({ proj: 'missile', by: 'monolith', people: 'vael' }), 'rocket', 'a Rover\'s rocket');
  assert.equal(impactOf({ proj: 'shell', by: 'siegeTank', people: 'humans' }), 'shell', 'a cannonball');
  assert.equal(impactOf({ proj: 'bolt', by: undefined, people: 'humans' }), 'glint', 'the Watchtower\'s arrow');
  assert.equal(impactOf({}), 'weld', 'a repairer\'s welding');
});

test('only machines explode when they fall; fighters turn to dust', () => {
  for (const k of MACHINES) assert.ok(UNITS[k], `${k} is a unit`);
  for (const k of [...STRIKE.kinds, 'lancer', 'harvester', 'halo']) assert.ok(!MACHINES.has(k), `${k} falls as a fighter`);
  for (const k of ['siegeTank', 'bastion', 'scythe', 'monolith', 'shrike', 'lumen', 'umbra']) assert.ok(MACHINES.has(k), `${k} explodes`);
});

test('a fallen Balloon puffs as canvas up where it flew; fighters turn to dust; machines and buildings explode', () => {
  assert.equal(deathOf('observer', true), 'air', 'the Balloon');
  assert.equal(deathOf('shrike', true), 'machine', 'the Drone, a flying machine');
  assert.equal(deathOf('trooper', false), 'dust');
  assert.equal(deathOf('siegeTank', false), 'machine');
  assert.equal(deathOf(null, false), 'machine', 'a building');
  assert.ok(!MACHINES.has('observer'), 'the Balloon stays out of the machines');
  assert.equal(AIR_PUFF.tint, 0xe8dcc0, 'canvas, not dust');
  assert.notEqual(AIR_PUFF.tint, DUST);
  assert.ok(AIR_PUFF.vy > 0 && AIR_PUFF.lift > 0, 'up where it flew, sinking');
});

test('slowed: the body tinted cold gray-blue, back to white over the last 1.5 s', () => {
  assert.equal(slowTint(0), 0xffffff, 'not slowed');
  assert.equal(slowTint(-0.1), 0xffffff);
  assert.equal(slowTint(undefined), 0xffffff);
  assert.equal(slowTint(3), SLOW.tint, 'freshly hit');
  assert.equal(slowTint(1.5), 0xbcc8d4, 'still full at 1.5 s left');
  const ch = (c, s) => (c >> s) & 255, half = slowTint(0.75), end = slowTint(0.01);
  for (const s of [16, 8, 0]) {
    assert.equal(ch(half, s), Math.round((ch(SLOW.tint, s) + 255) / 2), 'half way back at 0.75 s left');
    assert.ok(ch(end, s) >= 254, 'nearly white as it wears off');
  }
  assert.ok(ch(SLOW.tint, 0) > ch(SLOW.tint, 16), 'cold: bluer than red');
});

test('a death\'s team debris is thin: a third of the pieces, 1 to 2 px, gone in 0.3 to 0.5 s', () => {
  fx.list = [];
  burst(100, 100, '#ff0000', 24);
  assert.equal(fx.list.length, 8);
  burst(100, 100, '#ff0000', 10);
  assert.equal(fx.list.length, 8 + 4);
  for (const f of fx.list) {
    assert.ok(f.r >= 1 && f.r <= 2, `size ${f.r}`);
    assert.ok(f.life >= 0.3 && f.life <= 0.5, `life ${f.life}`);
    for (const k of [1, 0.5, 0]) assert.ok([1, 2].includes(partSize(f, k)), `drawn 1 or 2 px (${partSize(f, k)})`);
  }
  for (let i = 0; i < 20; i++) updateFx(0.03);
  assert.equal(fx.list.length, 0, 'all gone within 0.6 s');
});
