// The sides board's rules (src/client/seats.js): the rows into the game's seats (allies side by side: your team first,
// you first), team ids in that order, a new AI's side, number and likeness, sides without gaps, who may be removed, the
// sides' names and colours, the level the record counts, a saved setup checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange, startSetup, legacyRows, oneTeam, freeTeam, compact, validRows, enemyLevel, newAi, canRemove, sidesOf, seatName, seatColor } from '../src/client/seats.js';
import { teamList } from '../src/client/maps.js';

const rows = (...teams) => teams.map((team, i) => (i ? { race: 'humans', team, diff: 0 } : { race: 'humans', team }));

test('the rows in seat order: your team first, you first in it, then the other teams as their first rows come', () => {
  assert.deepEqual(arrange(rows(0, 1)), { order: [0, 1], teams: [] }, 'a duel: as always');
  assert.deepEqual(arrange(rows(0, 1, 2, 3)), { order: [0, 1, 2, 3], teams: [] }, 'free for all: no teams (the sim\'s default)');
  assert.deepEqual(arrange(rows(5, 2, 7, 0)), { order: [0, 1, 2, 3], teams: [] }, 'any numbers, each alone: free for all');
  assert.deepEqual(arrange(rows(0, 1, 1, 1)), { order: [0, 1, 2, 3], teams: [0, 1, 1, 1] }, 'you against three AIs together (1v3)');
  assert.deepEqual(arrange(rows(1, 0, 0, 0)), { order: [0, 1, 2, 3], teams: [0, 1, 1, 1] }, 'your team is 0 whatever its number');
  assert.deepEqual(arrange(rows(0, 1, 0, 1)), { order: [0, 2, 1, 3], teams: [0, 0, 1, 1] }, 'your ally (the second AI) beside you');
  assert.deepEqual(arrange(rows(2, 0, 1, 2, 0, 1)), { order: [0, 3, 1, 4, 2, 5], teams: [0, 0, 1, 1, 2, 2] }, 'three pairs');
  assert.deepEqual(arrange(rows(1, 3, 1, 0, 3)), { order: [0, 2, 1, 4, 3], teams: [0, 0, 1, 1, 2] }, 'the others as their first rows come, not by number');
  // Whatever the rows: you are seat 0, every team's seats follow each other, ids from 0 in seat order.
  for (let n = 2; n <= 8; n++) for (let k = 0; k < 200; k++) {
    const r = rows(...Array.from({ length: n }, (_, i) => (i * 7 + k * 13 + (k >> 3) * i * i) % n));
    const { order, teams } = arrange(r);
    assert.equal(order[0], 0); assert.deepEqual([...order].sort((a, b) => a - b), [...Array(n).keys()]);
    const t = teams.length ? teams : [...Array(n).keys()];
    assert.ok(t.every((x, s) => (s === 0 ? x === 0 : x === t[s - 1] || x === t[s - 1] + 1)), `consecutive seats, ids in order: ${t}`);
    assert.ok(order.every((i, s) => order.every((j, q) => (r[i].team === r[j].team) === (t[s] === t[q]))), 'allies stay allies');
  }
});

test('one team, a new AI\'s team, numbers without gaps', () => {
  assert.ok(oneTeam(rows(2, 2, 2))); assert.ok(!oneTeam(rows(0, 0, 1)));
  assert.equal(freeTeam(rows(0, 1, 2)), 3); assert.equal(freeTeam(rows(0, 2, 2)), 1);
  assert.deepEqual(compact(rows(0, 2, 2, 5)).map(r => r.team), [0, 1, 1, 2]);
  assert.deepEqual(compact(rows(3, 0, 3)).map(r => r.team), [0, 1, 0]);
});

test('a saved setup: a good one as it is, anything else not at all', () => {
  const good = [{ race: 'vael', team: 0 }, { race: 'random', team: 1, diff: 3, n: 4 }, { race: 'humans', team: 1, diff: 0, n: 2 }];
  assert.deepEqual(validRows(good, 8), good, 'the AIs\' numbers kept');
  assert.deepEqual(validRows([{ race: 'vael', team: 0, diff: 2, x: 1 }, { race: 'humans', team: 1, diff: 1 }], 8), [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 1, n: 1 }], 'only what a row holds; no numbers: counted');
  assert.deepEqual(validRows([good[0], { ...good[1], n: 2 }, good[2]], 8).map(r => r.n), [undefined, 1, 2], 'the same number twice: counted again');
  for (const bad of [null, 'x', {}, [], [good[0]], Array(9).fill(good[1]), [good[0], { race: 'orcs', team: 1, diff: 0 }], [good[0], { race: 'humans', team: 2, diff: 0 }],
    [good[0], { race: 'humans', team: 1 }], [good[0], { race: 'humans', team: 1, diff: 4 }], [good[0], { race: 'humans', team: 1.5, diff: 0 }], [good[0], null]]) assert.equal(validRows(bad, 8), null, JSON.stringify(bad));
});

test('START GAME: the seats in team order, each AI\'s difficulty (none when all alike), the hardest the game\'s', () => {
  const r = [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 0 }, { race: 'random', team: 0, diff: 3 }, { race: 'humans', team: 1, diff: 2 }];
  assert.deepEqual(startSetup(r, (k) => (k === 'random' ? 'vael' : k)), { races: ['vael', 'vael', 'humans', 'humans'], ai: [false, true, true, true], teams: [0, 0, 1, 1], diffs: [0, 3, 0, 2], diff: 2 },
    'you and AI 2 against AI 1 and AI 3: AI 2 sits beside you, its RANDOM drawn; the record counts the enemies\' hardest, Hard (not the Brutal ally)');
  assert.equal(startSetup([{ race: 'humans', team: 0 }, { race: 'humans', team: 0, diff: 3 }, { race: 'humans', team: 1, diff: 0 }]).diff, 0, 'a Brutal ally and an Easy enemy: an Easy game');
  const alike = [{ race: 'humans', team: 0 }, { race: 'humans', team: 1, diff: 2 }, { race: 'humans', team: 2, diff: 2 }];
  assert.deepEqual(startSetup(alike), { races: ['humans', 'humans', 'humans'], ai: [false, true, true], teams: [], diffs: [], diff: 2 }, 'every AI alike: the game\'s diff, as before');
  assert.deepEqual(startSetup([{ race: 'humans', team: 3 }, { race: 'vael', team: 0, diff: 1 }]), { races: ['humans', 'vael'], ai: [false, true], teams: [], diffs: [], diff: 1 }, 'a duel');
});

test('the old menu\'s saved choices make the first rows: players, teams, races, difficulty', () => {
  assert.deepEqual(legacyRows({ race: 'vael', enemy: 'random', diff: 2, players: 4, teams: teamList(4, '2v2') }, 8),
    [{ race: 'vael', team: 0 }, { race: 'random', team: 0, diff: 2, n: 1 }, { race: 'random', team: 1, diff: 2, n: 2 }, { race: 'random', team: 1, diff: 2, n: 3 }]);
  assert.deepEqual(legacyRows({ race: null, enemy: null, diff: null, players: 0, teams: [] }, 8), [{ race: 'humans', team: 0 }, { race: 'humans', team: 1, diff: 0, n: 1 }], 'nothing saved: you and an AI on Easy');
  assert.deepEqual(legacyRows({ race: 'orcs', enemy: 'vael', diff: 9, players: 3 }, 8), [{ race: 'humans', team: 0 }, { race: 'vael', team: 1, diff: 0, n: 1 }, { race: 'vael', team: 2, diff: 0, n: 2 }], 'free for all; nonsense: the defaults');
  assert.ok(validRows(legacyRows({ players: 8, teams: teamList(8, '2v2v2v2') }, 8), 8), 'a good setup');
});

test('a new AI: as its side\'s last (else the last AI), the lowest free number; names kept while others go', () => {
  const r = [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 3, n: 1 }, { race: 'random', team: 0, diff: 1, n: 3 }];
  assert.deepEqual(newAi(r, 0), { race: 'random', team: 0, diff: 1, n: 2 }, '+ ALLY: like the ally');
  assert.deepEqual(newAi(r, 1), { race: 'humans', team: 1, diff: 3, n: 2 }, '+ AI: like the enemy');
  assert.deepEqual(newAi(r, 2), { race: 'random', team: 2, diff: 1, n: 2 }, '+ SIDE: like the last AI');
  assert.deepEqual(newAi([{ race: 'vael', team: 0 }], 1), { race: 'humans', team: 1, diff: 0, n: 1 }, 'no AI yet: Humans on Easy');
  assert.deepEqual([0, 1, 2].map(i => seatName(r, i)), ['YOU', 'AI 1', 'AI 3'], 'AI 3 stays AI 3 with AI 2 gone');
});

test('REMOVE: an AI, past two seats, never the last enemy', () => {
  const r = (...teams) => teams.map((team, i) => (i ? { race: 'humans', team, diff: 0, n: i } : { race: 'humans', team }));
  assert.deepEqual([0, 1].map(i => canRemove(r(0, 1), i)), [false, false], 'a duel: nobody');
  assert.deepEqual([0, 1, 2, 3].map(i => canRemove(r(0, 1, 1, 0), i)), [false, true, true, true], 'two enemies and an ally: any AI');
  assert.deepEqual([0, 1, 2].map(i => canRemove(r(0, 0, 1), i)), [false, true, false], 'the last enemy stays; an ally may go');
  assert.deepEqual([0, 1, 2].map(i => canRemove(r(0, 0, 0), i)), [false, true, true], 'nobody to fight: any AI (START waits anyway)');
});

test('the sides: yours first, ENEMIES with two, SIDE k with more; a chip\'s name; the colour of each side\'s first seat', () => {
  const two = [{ race: 'humans', team: 1 }, { race: 'humans', team: 0, diff: 0, n: 1 }, { race: 'humans', team: 1, diff: 0, n: 2 }];
  assert.deepEqual(sidesOf(two), [{ team: 1, name: 'YOUR SIDE', label: 'Your side', chip: 'YOURS', color: seatColor(0) }, { team: 0, name: 'ENEMIES', label: 'Enemies', chip: 'SIDE 2', color: seatColor(2) }]);
  const three = [...two, { race: 'humans', team: 2, diff: 0, n: 3 }];
  assert.deepEqual(sidesOf(three).map(s => [s.name, s.label, s.chip]), [['YOUR SIDE', 'Your side', 'YOURS'], ['SIDE 2', 'Side 2', 'SIDE 2'], ['SIDE 3', 'Side 3', 'SIDE 3']]);
});

test('the record\'s level: the enemies\' hardest; with nobody to fight, the hardest AI', () => {
  const r = (...ds) => [{ race: 'humans', team: 0 }, ...ds.map(([team, diff], i) => ({ race: 'humans', team, diff, n: i + 1 }))];
  assert.equal(enemyLevel(r([0, 3], [1, 0])), 0, 'a Brutal ally, an Easy enemy');
  assert.equal(enemyLevel(r([1, 1], [2, 2], [0, 3])), 2);
  assert.equal(enemyLevel(r([0, 1], [0, 2])), 2, 'one side');
});
