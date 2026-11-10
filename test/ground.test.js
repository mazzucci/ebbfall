// The ground's picks (src/client/gl/ground.js): which countryside tile a cell draws, and each rock region's kind, a
// forest or a rocky hill, chosen once per region from the map alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundTile, rockTile, rockKinds, GROUND_BASES, GROUND_MARKS, MARK_MAX } from '../src/client/gl/ground.js';

/** A map from rows of '#' (rock) and '.' (open). */
const grid = (rows) => ({ w: rows[0].length, h: rows.length, rock: (x, y) => rows[y][x] === '#' });
const MAP = grid([
  '##......##',
  '#.......#.',
  '....#.....',
  '...#......', // (a region joined only through a corner: one region)
  '..........',
  '.......###',
  '.......###',
]);

test('every tile of one rock region is one kind, also through a corner', () => {
  for (let seed = 0; seed < 40; seed++) {
    const k = rockKinds(MAP.w, MAP.h, MAP.rock, seed);
    assert.equal(k.kindAt(4, 2), k.kindAt(3, 3), 'the corner-joined pair');
    for (const [x, y] of [[1, 0], [0, 1]]) assert.equal(k.kindAt(x, y), k.kindAt(0, 0));
    for (const [x, y] of [[8, 5], [9, 6], [7, 6]]) assert.equal(k.kindAt(x, y), k.kindAt(7, 5));
    assert.equal(k.kindAt(5, 4), null, 'open ground has no kind');
    for (const [x, y] of [[0, 0], [8, 1], [4, 2], [9, 6]]) assert.ok(['forest', 'hill'].includes(k.kindAt(x, y)));
  }
});

test('the kinds are fixed by the map and its seed, and maps get both', () => {
  const kinds = (seed) => [[0, 0], [8, 0], [4, 2], [7, 5]].map(([x, y]) => rockKinds(MAP.w, MAP.h, MAP.rock, seed).kindAt(x, y));
  for (let seed = 0; seed < 10; seed++) assert.deepEqual(kinds(seed), kinds(seed));
  const all = new Set(); for (let seed = 0; seed < 40; seed++) for (const k of kinds(seed)) all.add(k);
  assert.deepEqual([...all].sort(), ['forest', 'hill']);
  let mixed = 0; for (let seed = 0; seed < 40; seed++) if (new Set(kinds(seed)).size > 1) mixed++;
  assert.ok(mixed > 10, `one map mixes forests and hills (${mixed} of 40 seeds)`);
});

test('off the map a tile takes the kind of the rock beside it, else the border\'s own', () => {
  for (let seed = 0; seed < 20; seed++) {
    const k = rockKinds(MAP.w, MAP.h, MAP.rock, seed);
    assert.equal(k.kindAt(-1, 0), k.kindAt(0, 0)); assert.equal(k.kindAt(10, 6), k.kindAt(9, 6));
    assert.ok(['forest', 'hill'].includes(k.kindAt(-1, 4)), 'beside open ground: the border\'s kind');
    assert.equal(k.kindAt(-1, 4), k.kindAt(5, -1), 'one border kind');
  }
});

test('a rock cell draws its kind\'s half of the variants; grass shows a patch on at most MARK_MAX of the cells', () => {
  assert.equal(rockTile(15, 0, 'hill'), 'rock_15_0'); assert.equal(rockTile(15, 0.999, 'hill'), 'rock_15_5');
  assert.equal(rockTile(15, 0, 'forest'), 'rock_15_6'); assert.equal(rockTile(15, 0.999, 'forest'), 'rock_15_11');
  assert.equal(rockTile(3, 0.5, 'forest'), 'rock_3_4'); assert.equal(rockTile(3, 0.5), 'rock_3_1');
  let marks = 0, n = 0;
  for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
    const v = groundTile(((i * 7919 + j * 104729) % 1000) / 1000, i, j, 4242, false); n++;
    assert.ok(Number.isInteger(v) && v >= 0 && v < GROUND_BASES + GROUND_MARKS);
    if (v >= GROUND_BASES) marks++;
  }
  assert.ok(marks > 0 && marks / n <= MARK_MAX, `patches on ${(marks / n).toFixed(3)} of the cells`);
  assert.equal(groundTile(0, 3, 3, 1, true) < GROUND_BASES, true, 'no patch in the water');
});
