// The melee units' strike poses (src/client/look.js STRIKE, strikePose; tools/render3d/retheme.js STRIKE_POSES): which
// pose a unit shows from its cooldown, target and movement, and the frames in the atlas for every facing, each with its
// team mask lined up, kept out of the walk animation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRIKE, strikePose, inReach, MUZZLE_FLASH, MELEE_PUFF } from '../src/client/look.js';
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
    assert.equal(strikePose(fighter(k, cd), false), 'strike', `${k}: the blow just landed`);
    assert.equal(strikePose(fighter(k, cd - STRIKE.HOLD + 0.01), false), 'strike', `${k}: still striking`);
    assert.equal(strikePose(fighter(k, cd - STRIKE.HOLD - 0.01), false), 'wind', `${k}: back on guard`);
    assert.equal(strikePose(fighter(k, 0.1), false), 'wind', `${k}: the next blow coming`);
    assert.equal(strikePose(fighter(k, -3), false), 'wind', `${k}: ready, the target in reach`);
    assert.equal(strikePose(fighter(k, -3), true), null, `${k}: on the move it walks`);
    assert.equal(strikePose(fighter(k, -3, 60), false), null, `${k}: the target out of reach`);
    assert.equal(strikePose(fighter(k, -3, null), false), null, `${k}: nothing to fight`);
  }
  const archer = { ...fighter('trooper', 0), type: 'lancer', d: UNITS.lancer };
  assert.equal(strikePose(archer, false), null, 'a ranged unit has none');
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
