// The maps the menus offer (src/client/maps.js): the players decide the size, each size its own maps, badges only when
// they tell something, and an online setup always plays a map that seats it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, SIZES, MAX_PLAYERS, sizeFor, seatsOf, mapsFor, fitMap, badge, mapName, onlineMap, teamsFor, teamList } from '../src/client/maps.js';

const MAPS_128 = ['Iron Compass', 'Sunken Court', 'Grey Warrens', 'Random'];

test('the players decide the size: two play a duel\'s maps as before, three and four the 96x96 ones, five to eight the 128x128 ones', () => {
  assert.equal(MAX_PLAYERS, 8);
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(sizeFor), [64, 96, 96, 128, 128, 128, 128]);
  assert.deepEqual(mapsFor(2).map(i => MAPS[i].name), ['Ashen Basin', 'Glass Reach', 'Cinder Divide', 'Random'], 'the duel: unchanged');
  for (const n of [3, 4]) {
    const list = mapsFor(n);
    assert.equal(list.length, 4);
    assert.ok(list.every(i => MAPS[i].size === 96 && seatsOf(i) === 4));
    assert.ok(MAPS[list.at(-1)].random, 'a random one last');
  }
  for (const n of [5, 6, 7, 8]) {
    const list = mapsFor(n);
    assert.deepEqual(list.map(i => MAPS[i].name), MAPS_128, `${n} players: the 128x128 maps`);
    assert.ok(list.every(i => MAPS[i].size === 128 && seatsOf(i) === 8));
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
  for (const n of [5, 6, 7]) for (const i of mapsFor(n)) assert.equal(badge(i, n), 'up to 8');
  for (const i of mapsFor(8)) assert.equal(badge(i, 8), '', 'eight on eight starts: no noise');
});

test('teams: free for all for any number, and even splits of consecutive seats for four, six and eight', () => {
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(teamsFor), [['ffa'], ['ffa'], ['ffa', '2v2'], ['ffa'], ['ffa', '3v3'], ['ffa'], ['ffa', '4v4', '2v2v2v2']]);
  assert.deepEqual(teamList(4, '2v2'), [0, 0, 1, 1]);
  assert.deepEqual(teamList(6, '3v3'), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(teamList(8, '4v4'), [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(teamList(8, '2v2v2v2'), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([teamList(4, 'ffa'), teamList(6, '2v2'), teamList(5, '3v3'), teamList(8, 'nonsense')], [[], [], [], []], 'free for all, or a split these players are not offered');
});

test('an online setup plays its map, the room\'s seed for a random one, at the size that seats the room', () => {
  const setup = (map, n) => ({ seed: 1234, map, races: Array(n).fill('humans') });
  assert.deepEqual(onlineMap(setup(0, 2)), { seed: 4242, kind: 0, name: 'Ashen Basin', size: 64 });
  const r = onlineMap(setup(7, 4));
  assert.deepEqual(r, { seed: 1234, kind: 1234 % 6, name: mapName(1234), size: 96 });
  assert.equal(onlineMap(setup(4, 2)).size, 64, 'a 96x96 pick with two seats: a duel\'s map');
  assert.equal(onlineMap(setup(4, 8)).size, 128, 'a 96x96 pick with eight seats: a 128x128 map');
  assert.deepEqual(onlineMap(setup(11, 6)), { seed: 1234, kind: 1234 % 6, name: mapName(1234), size: 128 });
});
