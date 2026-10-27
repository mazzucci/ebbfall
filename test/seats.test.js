// The single-player seat list's rules (src/client/seats.js): the rows into the game's seats (allies side by side: your
// team first, you first), team ids in that order, a new AI's team, numbers without gaps, a saved setup checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange, startSetup, legacyRows, oneTeam, freeTeam, compact, validRows } from '../src/client/seats.js';
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
  const good = [{ race: 'vael', team: 0 }, { race: 'random', team: 1, diff: 3 }, { race: 'humans', team: 1, diff: 0 }];
  assert.deepEqual(validRows(good, 8), good);
  assert.deepEqual(validRows([{ race: 'vael', team: 0, diff: 2, x: 1 }, { race: 'humans', team: 1, diff: 1 }], 8), [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 1 }], 'only what a row holds');
  for (const bad of [null, 'x', {}, [], [good[0]], Array(9).fill(good[1]), [good[0], { race: 'orcs', team: 1, diff: 0 }], [good[0], { race: 'humans', team: 2, diff: 0 }],
    [good[0], { race: 'humans', team: 1 }], [good[0], { race: 'humans', team: 1, diff: 4 }], [good[0], { race: 'humans', team: 1.5, diff: 0 }], [good[0], null]]) assert.equal(validRows(bad, 8), null, JSON.stringify(bad));
});

test('START GAME: the seats in team order, each AI\'s difficulty (none when all alike), the hardest the game\'s', () => {
  const r = [{ race: 'vael', team: 0 }, { race: 'humans', team: 1, diff: 0 }, { race: 'random', team: 0, diff: 3 }, { race: 'humans', team: 1, diff: 2 }];
  assert.deepEqual(startSetup(r, (k) => (k === 'random' ? 'vael' : k)), { races: ['vael', 'vael', 'humans', 'humans'], ai: [false, true, true, true], teams: [0, 0, 1, 1], diffs: [0, 3, 0, 2], diff: 3 },
    'you and AI 2 against AI 1 and AI 3: AI 2 sits beside you, its RANDOM drawn; the record counts it at Brutal');
  const alike = [{ race: 'humans', team: 0 }, { race: 'humans', team: 1, diff: 2 }, { race: 'humans', team: 2, diff: 2 }];
  assert.deepEqual(startSetup(alike), { races: ['humans', 'humans', 'humans'], ai: [false, true, true], teams: [], diffs: [], diff: 2 }, 'every AI alike: the game\'s diff, as before');
  assert.deepEqual(startSetup([{ race: 'humans', team: 3 }, { race: 'vael', team: 0, diff: 1 }]), { races: ['humans', 'vael'], ai: [false, true], teams: [], diffs: [], diff: 1 }, 'a duel');
});

test('the old menu\'s saved choices make the first rows: players, teams, races, difficulty', () => {
  assert.deepEqual(legacyRows({ race: 'vael', enemy: 'random', diff: 2, players: 4, teams: teamList(4, '2v2') }, 8),
    [{ race: 'vael', team: 0 }, { race: 'random', team: 0, diff: 2 }, { race: 'random', team: 1, diff: 2 }, { race: 'random', team: 1, diff: 2 }]);
  assert.deepEqual(legacyRows({ race: null, enemy: null, diff: null, players: 0, teams: [] }, 8), [{ race: 'humans', team: 0 }, { race: 'humans', team: 1, diff: 0 }], 'nothing saved: you and an AI on Easy');
  assert.deepEqual(legacyRows({ race: 'orcs', enemy: 'vael', diff: 9, players: 3 }, 8), [{ race: 'humans', team: 0 }, { race: 'vael', team: 1, diff: 0 }, { race: 'vael', team: 2, diff: 0 }], 'free for all; nonsense: the defaults');
  assert.ok(validRows(legacyRows({ players: 8, teams: teamList(8, '2v2v2v2') }, 8), 8), 'a good setup');
});
