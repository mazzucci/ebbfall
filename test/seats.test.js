// The board's rules (src/client/seats.js): eight fixed spots; the spots into the game's seats (allies side by side:
// your side first, you first; each seat's spot for its colour), team ids in that order, a new AI's spot, side and
// likeness, who may be removed, the sides a sheet offers and their colours, the level the record counts, a saved board
// checked (and one saved before the spots).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange, startSetup, legacyRows, oneTeam, freeTeam, firstEmpty, filled, validRows, enemyLevel, newAi, canRemove, sideChoices, sideColor, seatName, seatColor, SPOTS } from '../src/client/seats.js';
import { teamList } from '../src/client/maps.js';

/** A board: a side number per spot (null: empty), you in spot 0. */
const board = (...teams) => Array.from({ length: SPOTS }, (_, i) => (teams[i] == null ? null : i ? { race: 'humans', team: teams[i], diff: 0 } : { race: 'humans', team: teams[i] }));

test('the spots in seat order: your side first, you first in it, then the other sides as their first spots come', () => {
  assert.deepEqual(arrange(board(0, 1)), { order: [0, 1], teams: [] }, 'a duel: as always');
  assert.deepEqual(arrange(board(0, 1, 2, 3)), { order: [0, 1, 2, 3], teams: [] }, 'free for all: no teams (the sim\'s default)');
  assert.deepEqual(arrange(board(5, 2, 7, 0)), { order: [0, 1, 2, 3], teams: [] }, 'any numbers, each alone: free for all');
  assert.deepEqual(arrange(board(0, 1, 1, 1)), { order: [0, 1, 2, 3], teams: [0, 1, 1, 1] }, 'you against three AIs together (1v3)');
  assert.deepEqual(arrange(board(1, 0, 0, 0)), { order: [0, 1, 2, 3], teams: [0, 1, 1, 1] }, 'your side is 0 whatever its number');
  assert.deepEqual(arrange(board(0, 1, 0, 1)), { order: [0, 2, 1, 3], teams: [0, 0, 1, 1] }, 'your ally (in spot 2) beside you in the game');
  assert.deepEqual(arrange(board(2, 0, 1, 2, 0, 1)), { order: [0, 3, 1, 4, 2, 5], teams: [0, 0, 1, 1, 2, 2] }, 'three pairs');
  assert.deepEqual(arrange(board(0, null, 1, null, 0)), { order: [0, 4, 2], teams: [0, 0, 1] }, 'empty spots skipped');
  // Whatever the board: you are seat 0, every side's seats follow each other, ids from 0 in seat order.
  for (let n = 2; n <= 8; n++) for (let k = 0; k < 200; k++) {
    const t0 = Array.from({ length: SPOTS }, (_, i) => (i === 0 || (i * 5 + k) % 3 ? (i * 7 + k * 13 + (k >> 3) * i * i) % n : null));
    const b = board(...t0), at = filled(b);
    const { order, teams } = arrange(b);
    assert.equal(order[0], 0); assert.deepEqual([...order].sort((x, y) => x - y), at);
    const t = teams.length ? teams : order.map((_, s) => s);
    assert.ok(t.every((x, s) => (s === 0 ? x === 0 : x === t[s - 1] || x === t[s - 1] + 1)), `consecutive seats, ids in order: ${t}`);
    assert.ok(order.every((i, s) => order.every((j, q) => (b[i].team === b[j].team) === (t[s] === t[q]))), 'allies stay allies');
  }
});

test('one side, the lowest empty spot, a new AI on a side of its own', () => {
  assert.ok(oneTeam(board(2, 2, null, 2))); assert.ok(!oneTeam(board(0, 0, 1)));
  assert.equal(freeTeam(board(0, 1, 2)), 3); assert.equal(freeTeam(board(0, 2, 2)), 1);
  assert.equal(firstEmpty(board(0, 1, null, 2)), 2); assert.equal(firstEmpty(board(0, 1, 2, 3, 4, 5, 6, 7)), -1);
  const b = [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 3 }, null, { race: 'random', team: 1, diff: 1 }, ...Array(4).fill(null)];
  assert.deepEqual(newAi(b), { race: 'random', team: 2, diff: 1 }, 'like the last AI, a side of its own');
  assert.deepEqual(newAi(board(0)), { race: 'humans', team: 1, diff: 0 }, 'no AI yet: Humans on Easy');
  assert.deepEqual([0, 1, 3].map(seatName), ['YOU', 'Computer 1', 'Computer 3'], 'an AI is named by its spot');
});

test('a saved board: a good one as it is, one saved before the spots in the first spots, anything else not at all', () => {
  const good = [{ race: 'vael', team: 0 }, null, { race: 'random', team: 1, diff: 3 }, null, null, { race: 'humans', team: 1, diff: 0 }, null, null];
  assert.deepEqual(validRows(good), good);
  assert.deepEqual(validRows([{ race: 'vael', team: 0, diff: 2, x: 1 }, { race: 'humans', team: 1, diff: 1, n: 4 }]), [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 1 }, ...Array(6).fill(null)], 'a list from before the spots: only what a seat holds');
  for (const bad of [null, 'x', {}, [], [good[0]], [null, good[2]], [good[0], null, null], Array(9).fill(good[2]), [good[0], { race: 'orcs', team: 1, diff: 0 }], [good[0], { race: 'humans', team: 8, diff: 0 }],
    [good[0], { race: 'humans', team: 1 }], [good[0], { race: 'humans', team: 1, diff: 4 }], [good[0], { race: 'humans', team: 1.5, diff: 0 }], [good[0], 7]]) assert.equal(validRows(bad), null, JSON.stringify(bad));
});

test('START GAME: the seats in side order, each seat\'s spot, each AI\'s difficulty (none when all alike), the hardest the game\'s', () => {
  const b = [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 0 }, null, { race: 'random', team: 0, diff: 3 }, { race: 'humans', team: 1, diff: 2 }, null, null, null];
  assert.deepEqual(startSetup(b, (k) => (k === 'random' ? 'vael' : k)), { races: ['vael', 'vael', 'humans', 'humans'], ai: [false, true, true, true], teams: [0, 0, 1, 1], diffs: [0, 3, 0, 2], diff: 2, spots: [0, 3, 1, 4] },
    'you and AI 3 against AI 1 and AI 4: AI 3 sits beside you (in its own colour), its RANDOM drawn; the record counts the enemies\' hardest, Hard (not the Brutal ally)');
  assert.equal(startSetup(board(0, 0, 1)).diff, 0);
  const alike = [{ race: 'humans', team: 0 }, { race: 'humans', team: 1, diff: 2 }, { race: 'humans', team: 2, diff: 2 }, ...Array(5).fill(null)];
  assert.deepEqual(startSetup(alike), { races: ['humans', 'humans', 'humans'], ai: [false, true, true], teams: [], diffs: [], diff: 2, spots: [0, 1, 2] }, 'every AI alike: the game\'s diff, as before');
});

test('the old menu\'s saved choices make the first spots: players, teams, races, difficulty', () => {
  assert.deepEqual(legacyRows({ race: 'vael', enemy: 'random', diff: 2, players: 4, teams: teamList(4, '2v2') }),
    [{ race: 'vael', team: 0 }, { race: 'random', team: 0, diff: 2 }, { race: 'random', team: 1, diff: 2 }, { race: 'random', team: 1, diff: 2 }, null, null, null, null]);
  assert.deepEqual(legacyRows({ race: null, enemy: null, diff: null, players: 0, teams: [] }).slice(0, 3), [{ race: 'humans', team: 0 }, { race: 'humans', team: 1, diff: 0 }, null], 'nothing saved: you and an AI on Easy');
  assert.ok(validRows(legacyRows({ players: 8, teams: teamList(8, '2v2v2v2') })), 'a good setup');
});

test('REMOVE: an AI, past two players, never the last enemy', () => {
  assert.deepEqual([0, 1].map(i => canRemove(board(0, 1), i)), [false, false], 'a duel: nobody');
  assert.deepEqual([0, 1, 2, 3].map(i => canRemove(board(0, 1, 1, 0), i)), [false, true, true, true], 'two enemies and an ally: any AI');
  assert.deepEqual([0, 1, 2].map(i => canRemove(board(0, 0, 1), i)), [false, true, false], 'the last enemy stays; an ally may go');
  assert.equal(canRemove(board(0, 1, null, 1), 2), false, 'an empty spot: nothing to remove');
});

test('the sides a sheet offers: as many as the players (any higher one in use too), each its first player\'s colour', () => {
  assert.deepEqual(sideChoices(board(0, 1)).map(s => s.chip), ['SIDE 1', 'SIDE 2']);
  assert.deepEqual(sideChoices(board(0, 0, 0, 0)).map(s => s.team), [0, 1, 2, 3], 'four players: up to four sides');
  assert.deepEqual(sideChoices(board(0, 5, null, 1)).map(s => s.team), [0, 1, 2, 3, 4, 5], 'a side numbered past them: offered too');
  const b = board(1, 0, 1, null, 0);
  assert.deepEqual([sideColor(b, 1), sideColor(b, 0), sideColor(b, 2)], [seatColor(0), seatColor(1), '#5b6b80'], 'by first spot; nobody: grey');
});

test('the record\'s level: the enemies\' hardest; with nobody to fight, the hardest AI', () => {
  const b = (...ds) => [{ race: 'humans', team: 0 }, ...ds.map(([team, diff]) => (team == null ? null : { race: 'humans', team, diff })), ...Array(8).fill(null)].slice(0, SPOTS);
  assert.equal(enemyLevel(b([0, 3], [1, 0])), 0, 'a Brutal ally, an Easy enemy');
  assert.equal(enemyLevel(b([1, 1], [null], [2, 2], [0, 3])), 2);
  assert.equal(enemyLevel(b([0, 1], [0, 2])), 2, 'one side');
});
