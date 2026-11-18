// The maps the menus offer (src/client/maps.js): every map offered whatever the players (the 64x64 ones hidden, kept under
// their indices), each size its own maps, a map seating the players if it has a start each (else the smallest offered
// that does), a label with the players it seats, and an online setup that always plays a map that seats it, at the
// map's own size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, MAP_KINDS, RANDOM_KINDS, SIZES, MAX_PLAYERS, DEFAULT_MAP, offered, sizeFor, seatsOf, fits, fitMap, mapLabel, mapName, mapNoteOf, onlineMap, teamsFor, teamList } from '../src/client/maps.js';

const named = (name) => MAPS.findIndex(m => m.name === name);

test('every map seats as many players as it has starts: two on 64x64, four on 96x96, eight on 128x128; each size its own maps', () => {
  assert.equal(MAX_PLAYERS, 8);
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(sizeFor), [96, 96, 96, 128, 128, 128, 128], 'the smallest offered size (64x64 is hidden)');
  assert.deepEqual(MAPS.map((_, i) => seatsOf(i)), [2, 2, 2, 2, 4, 4, 4, 4, 8, 8, 8, 8, 2, 2], '(the Shore map last: appended)');
  assert.ok(fits(named('Iron Compass'), 2), 'a duel on an eight-start map');
  assert.ok(fits(named('Dust Quarter'), 4) && !fits(named('Dust Quarter'), 5));
  assert.ok(!fits(-1, 2) && !fits(99, 2) && !fits(1.5, 2), 'no such map');
  assert.equal(mapLabel(named('Iron Compass')), 'Iron Compass · up to 8');
  assert.deepEqual(MAPS.map((m, i) => m.random && mapLabel(i)).filter(Boolean), ['Random · up to 2', 'Random · up to 4', 'Random · up to 8', 'Random Lake · up to 2']);
  // Each size its own fixed maps: names of their own (the generator lays a seed out differently at another size).
  const fixed = MAPS.filter(m => !m.random);
  assert.equal(new Set(fixed.map(m => m.name)).size, fixed.length, 'no name twice');
  assert.equal(new Set(fixed.map(m => `${m.seed}:${m.kind}:${m.size}`)).size, fixed.length);
  assert.deepEqual(SIZES.map(s => s.size), [...new Set(MAPS.map(m => m.size))]);
});

test('the 64x64 maps are hidden, under their indices; the default is Dust Quarter, two players on a 96x96 map', () => {
  assert.deepEqual(MAPS.flatMap((m, i) => (offered(i) ? [] : [m.name])), ['Ashen Basin', 'Glass Reach', 'Cinder Divide', 'Random', 'Mirror Lake', 'Random Lake']);
  assert.ok(MAPS.every((m, i) => offered(i) === (m.size !== 64)), 'hidden: every 64x64 map, nothing else');
  assert.deepEqual([named('Ashen Basin'), named('Mirror Lake'), named('Random Lake')], [0, 12, 13], 'the indices a room or a link names: unchanged');
  assert.ok(!offered(-1) && !offered(99) && !offered(1.5), 'no such map');
  assert.equal(DEFAULT_MAP, named('Dust Quarter'));
  assert.deepEqual([MAPS[DEFAULT_MAP].size, seatsOf(DEFAULT_MAP), MAPS[DEFAULT_MAP].kind], [96, 4, 0], 'the standard character, at 96x96');
  assert.ok(fits(0, 2) && fits(12, 2), 'a hidden map still seats its two (an old room or link plays it)');
});

test('a map that does not seat the players gives way to the smallest offered that does (a random one to a random one); one that does stays', () => {
  assert.equal(fitMap(1, 2), 1, 'a hidden map that seats them: kept (a room or a challenge named it)');
  assert.equal(fitMap(named('Iron Compass'), 2), named('Iron Compass'), 'fewer players than starts: kept');
  assert.equal(fitMap(1, 4), named('Dust Quarter'), 'the first 96x96 map');
  assert.equal(fitMap(1, 5), named('Iron Compass'));
  assert.equal(fitMap(5, 3), 5);
  assert.equal(fitMap(3, 3), 7, 'Random (64) with three: Random (96)');
  assert.equal(fitMap(7, 6), 11, 'Random (96) with six: Random (128)');
  assert.equal(fitMap(99, 2), DEFAULT_MAP, 'no such map: the first offered one that seats them');
  assert.equal(fitMap(13, 3), 7, 'Random Lake with three: Random (96)');
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

test('the Shore map: a named map and a random one at 64x64 with their line; random maps of the other kinds never draw it', () => {
  const shore = MAPS.map((m, i) => [m, i]).filter(([m]) => m.kind === 6);
  assert.deepEqual(shore.map(([m]) => [m.name, m.size, !!m.random]), [['Mirror Lake', 64, false], ['Random Lake', 64, true]]);
  for (const [m, i] of shore) assert.match(mapNoteOf(i), /^Map: .* \(up to 2\)\. A lake: each side holds a cove, with the shallows between\.$/, m.name);
  assert.equal(mapNoteOf(0), 'Map: Ashen Basin (up to 2)', 'a map without a line');
  // A random room keeps the old kinds for every seed (Shore is not among them), a random Shore stays a Shore.
  const random64 = MAPS.findIndex(m => m.random && m.size === 64), randomShore = MAPS.findIndex(m => m.random && m.kind === 6);
  for (const seed of [0, 5, 6, 12, 99, 123456789]) {
    assert.equal(onlineMap({ map: random64, races: ['humans', 'vael'], seed }).kind, seed % RANDOM_KINDS);
    assert.equal(onlineMap({ map: randomShore, races: ['humans', 'vael'], seed }).kind, 6);
  }
  assert.equal(RANDOM_KINDS, MAP_KINDS.length - 1);
});
