// Headless simulation tests. No DOM: the sim must run in plain Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G, DT, PLAYER, ENEMY, resetGame, step, stateHash, queueUnit, placeBuilding, canPlace, attackMove, map } from '../src/sim/index.js';

function runSeconds(s) { for (let i = 0; i < s * 30; i++) step(DT); }

test('a fresh game has two cores, eight harvesters and resource nodes', () => {
  resetGame(12345, 1);
  assert.equal(G.bldgs.length, 2);
  assert.equal(G.units.length, 8);
  assert.ok(map.nodes.length > 20);
  assert.deepEqual(G.sup[PLAYER], [4, 10]);
});

test('harvesters bring shards home', () => {
  resetGame(777, 1);
  runSeconds(60);
  assert.ok(G.res[PLAYER][0] > 50, 'player income after a minute: ' + G.res[PLAYER][0]);
  assert.ok(G.res[ENEMY][0] >= 0);
});

test('the same seed and commands produce the same state hash', () => {
  const play = () => {
    resetGame(4242, 2);
    for (let i = 0; i < 30 * 90; i++) {
      step(DT);
      if (i === 30 * 20) { const core = G.bldgs.find(b => b.team === PLAYER); queueUnit(core, 'harvester'); }
      if (i === 30 * 40) { const u = G.units.find(x => x.team === PLAYER); const e = G.bldgs.find(b => b.team === ENEMY); attackMove(u, e.x, e.y); }
    }
    return stateHash();
  };
  const a = play(), b = play();
  assert.equal(a, b);
});

test('placing a depot costs 100 shards and a harvester builds it', () => {
  resetGame(99, 0);
  G.res[PLAYER][0] = 500;
  const core = G.bldgs.find(b => b.team === PLAYER);
  const h = G.units.find(u => u.team === PLAYER);
  let placed = null;
  for (let r = 3; r < 9 && !placed; r++) for (let a = 0; a < 12 && !placed; a++) {
    const tx = Math.round(core.tx + 2 + Math.cos(a / 12 * 6.28) * r - 1), ty = Math.round(core.ty + 2 + Math.sin(a / 12 * 6.28) * r - 1);
    if (canPlace('depot', tx, ty, PLAYER)) { assert.equal(placeBuilding(PLAYER, 'depot', tx, ty, h), null); placed = { tx, ty }; }
  }
  assert.ok(placed);
  assert.equal(G.res[PLAYER][0], 400);
  runSeconds(45);
  const depot = G.bldgs.find(b => b.type === 'depot' && b.team === PLAYER);
  assert.ok(depot && depot.done, 'depot finished');
  assert.equal(G.sup[PLAYER][1], 18);
});

test('the AI expands and eventually ends the game against an idle player', () => {
  resetGame(31337, 2);
  for (let i = 0; i < 30 * 900 && !G.over; i++) step(DT);
  assert.ok(G.bldgs.filter(b => b.team === ENEMY).length > 3, 'AI built structures');
  assert.ok(G.over, 'game ended within 15 minutes');
  assert.equal(G.winner, ENEMY);
});
