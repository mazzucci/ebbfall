// The maps the menus offer (src/client/maps.js): every map whatever the players, each size its own maps, a map seating
// the players if it has a start each (else the smallest that does), a label with the players it seats, and an online
// setup that always plays a map that seats it, at the map's own size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, SIZES, MAX_PLAYERS, sizeFor, seatsOf, fits, fitMap, mapLabel, mapName, onlineMap, teamsFor, teamList } from '../src/client/maps.js';

const named = (name) => MAPS.findIndex(m => m.name === name);

test('every map seats as many players as it has starts: two on 64x64, four on 96x96, eight on 128x128; each size its own maps', () => {
  assert.equal(MAX_PLAYERS, 8);
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(sizeFor), [64, 96, 96, 128, 128, 128, 128]);
  assert.deepEqual(MAPS.map((_, i) => seatsOf(i)), [2, 2, 2, 2, 4, 4, 4, 4, 8, 8, 8, 8]);
  assert.ok(fits(named('Iron Compass'), 2), 'a duel on an eight-start map');
  assert.ok(fits(named('Dust Quarter'), 4) && !fits(named('Dust Quarter'), 5));
  assert.ok(!fits(-1, 2) && !fits(99, 2) && !fits(1.5, 2), 'no such map');
  assert.equal(mapLabel(named('Iron Compass')), 'Iron Compass · up to 8');
  assert.deepEqual(MAPS.map((m, i) => m.random && mapLabel(i)).filter(Boolean), ['Random · up to 2', 'Random · up to 4', 'Random · up to 8']);
  // Each size its own fixed maps: names of their own (the generator lays a seed out differently at another size).
  const fixed = MAPS.filter(m => !m.random);
  assert.equal(new Set(fixed.map(m => m.name)).size, fixed.length, 'no name twice');
  assert.equal(new Set(fixed.map(m => `${m.seed}:${m.kind}:${m.size}`)).size, fixed.length);
  assert.deepEqual(SIZES.map(s => s.size), [...new Set(MAPS.map(m => m.size))]);
});

test('a map that does not seat the players gives way to the smallest that does (a random one to a random one); one that does stays', () => {
  assert.equal(fitMap(1, 2), 1);
  assert.equal(fitMap(named('Iron Compass'), 2), named('Iron Compass'), 'fewer players than starts: kept');
  assert.equal(fitMap(1, 4), named('Dust Quarter'), 'the first 96x96 map');
  assert.equal(fitMap(1, 5), named('Iron Compass'));
  assert.equal(fitMap(5, 3), 5);
  assert.equal(fitMap(3, 3), 7, 'Random (64) with three: Random (96)');
  assert.equal(fitMap(7, 6), 11, 'Random (96) with six: Random (128)');
  assert.equal(fitMap(99, 2), 0, 'no such map: the first');
  assert.equal(fitMap(-1, 6), named('Iron Compass'));
});

test('teams: free for all for any number, and even splits of consecutive seats for four, six and eight', () => {
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(teamsFor), [['ffa'], ['ffa'], ['ffa', '2v2'], ['ffa'], ['ffa', '3v3'], ['ffa'], ['ffa', '4v4', '2v2v2v2']]);
  assert.deepEqual(teamList(4, '2v2'), [0, 0, 1, 1]);
  assert.deepEqual(teamList(6, '3v3'), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(teamList(8, '4v4'), [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(teamList(8, '2v2v2v2'), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([teamList(4, 'ffa'), teamList(6, '2v2'), teamList(5, '3v3'), teamList(8, 'nonsense')], [[], [], [], []], 'free for all, or a split these players are not offered');
});

test('an online setup plays its map at the map\'s size, the room\'s seed for a random one; one that does not seat the room, the smallest that does', () => {
  const setup = (map, n) => ({ seed: 1234, map, races: Array(n).fill('humans') });
  assert.deepEqual(onlineMap(setup(0, 2)), { seed: 4242, kind: 0, name: 'Ashen Basin', size: 64 });
  const r = onlineMap(setup(7, 4));
  assert.deepEqual(r, { seed: 1234, kind: 1234 % 6, name: mapName(1234), size: 96 });
  assert.equal(onlineMap(setup(4, 2)).size, 96, 'a 96x96 pick with two seats: that map');
  assert.deepEqual(onlineMap(setup(named('Iron Compass'), 2)), { seed: 5, kind: 0, name: 'Iron Compass', size: 128 }, 'two on an eight-start map');
  assert.equal(onlineMap(setup(4, 8)).size, 128, 'a 96x96 pick with eight seats: a 128x128 map');
  assert.deepEqual(onlineMap(setup(11, 6)), { seed: 1234, kind: 1234 % 6, name: mapName(1234), size: 128 });
});
