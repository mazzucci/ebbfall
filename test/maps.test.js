// The maps the menus offer (src/client/maps.js): the players decide the size, each size its own maps, badges only when
// they tell something, and an online setup always plays a map that seats it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, SIZES, MAX_PLAYERS, sizeFor, seatsOf, mapsFor, fitMap, badge, mapName, onlineMap } from '../src/client/maps.js';

test('the players decide the size: two play a duel\'s maps as before, three and four the 96x96 ones', () => {
  assert.equal(MAX_PLAYERS, 4);
  assert.deepEqual([2, 3, 4].map(sizeFor), [64, 96, 96]);
  assert.deepEqual(mapsFor(2).map(i => MAPS[i].name), ['Ashen Basin', 'Glass Reach', 'Cinder Divide', 'Random'], 'the duel: unchanged');
  for (const n of [3, 4]) {
    const list = mapsFor(n);
    assert.equal(list.length, 4);
    assert.ok(list.every(i => MAPS[i].size === 96 && seatsOf(i) === 4));
    assert.ok(MAPS[list.at(-1)].random, 'a random one last');
  }
  // Each size its own fixed maps: names of their own (the generator lays a seed out differently at another size).
  const fixed = MAPS.filter(m => !m.random);
  assert.equal(new Set(fixed.map(m => m.name)).size, fixed.length, 'no name twice');
  assert.equal(new Set(fixed.map(m => `${m.seed}:${m.kind}:${m.size}`)).size, fixed.length);
  assert.deepEqual(SIZES.map(s => s.size), [...new Set(MAPS.map(m => m.size))]);
});

test('a map that does not seat the players gives way to the first that does', () => {
  assert.equal(fitMap(1, 2), 1);
  assert.equal(fitMap(1, 4), mapsFor(4)[0]);
  assert.equal(fitMap(5, 3), 5);
  assert.equal(fitMap(5, 2), 0);
  assert.equal(fitMap(99, 2), 0, 'no such map');
});

test('badges only when they tell something: a map seats more than the players chosen', () => {
  for (const i of mapsFor(2)) assert.equal(badge(i, 2), '', 'a duel: no noise');
  for (const i of mapsFor(4)) assert.equal(badge(i, 4), '', 'four on four starts: no noise');
  for (const i of mapsFor(3)) assert.equal(badge(i, 3), 'up to 4', 'three: a fourth could join, or a start stays free');
});

test('an online setup plays its map, the room\'s seed for a random one, at the size that seats the room', () => {
  const setup = (map, n) => ({ seed: 1234, map, races: Array(n).fill('humans') });
  assert.deepEqual(onlineMap(setup(0, 2)), { seed: 4242, kind: 0, name: 'Ashen Basin', size: 64 });
  const r = onlineMap(setup(7, 4));
  assert.deepEqual(r, { seed: 1234, kind: 1234 % 6, name: mapName(1234), size: 96 });
  assert.equal(onlineMap(setup(4, 2)).size, 64, 'a 96x96 pick with two seats: a duel\'s map');
});
