// Scripted bot vs. the AI for ten minutes per difficulty, on the Rust sim (WASM). Prints snapshots for balance
// tuning. Usage: node scripts/headless.js [seed]   (needs npm run build:wasm)
import { readFileSync } from 'node:fs';
const pkg = new URL('../src/engine/pkg/', import.meta.url);
(await import(new URL('endfall_sim.js', pkg))).initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
const { G, DT, DIFF, PLAYER, ENEMY, resetGame, step, queueUnit, placeBuilding, canPlace, attackMove } = await import('../src/engine/core.js');

const seed = +(process.argv[2] || 1);
for (let diff = 0; diff < DIFF.length; diff++) {
  resetGame(seed, diff);
  let placed = false, raxed = false;
  console.log(`\n== difficulty ${diff} seed ${seed} ==`);
  for (let i = 0; i < 30 * 600 && !G.over; i++) {
    step(DT);
    const core = G.bldgs.find(b => b.team === PLAYER && b.type === 'core');
    if (!core) continue;
    const tryPlace = (type) => {
      const h = G.units.find(u => u.team === PLAYER && u.type === 'harvester' && u.task.t !== 'build');
      for (let r = 3; r < 10; r++) for (let a = 0; a < 12; a++) {
        const tx = Math.round(core.tx + 2 + Math.cos(a / 12 * 6.28) * r - 1), ty = Math.round(core.ty + 2 + Math.sin(a / 12 * 6.28) * r - 1);
        if (canPlace(type, tx, ty, PLAYER) && !placeBuilding(PLAYER, type, tx, ty, h)) return true;
      }
      return false;
    };
    if (!placed && G.res[PLAYER][0] >= 100) placed = tryPlace('depot');
    if (placed && !raxed && G.res[PLAYER][0] >= 150) raxed = tryPlace('barracks');
    const rax = G.bldgs.find(b => b.team === PLAYER && b.type === 'barracks' && b.done);
    if (rax && rax.queue.length < 2 && G.res[PLAYER][0] >= 50) queueUnit(rax, 'trooper');
    if (core.queue.length === 0 && G.units.filter(u => u.team === PLAYER && u.type === 'harvester').length < 10 && G.res[PLAYER][0] >= 50) queueUnit(core, 'harvester');
    if (i === 30 * 360) { const eb = G.bldgs.find(b => b.team === ENEMY); for (const u of G.units) if (u.team === PLAYER && u.type === 'trooper' && eb) attackMove(u, eb.x, eb.y); }
    if (i % (30 * 120) === 0) {
      const pU = G.units.filter(u => u.team === PLAYER).length, eU = G.units.filter(u => u.team === ENEMY).length;
      console.log(`t=${(i / 30) | 0}s res P=${G.res[PLAYER]} E=${G.res[ENEMY]} units P=${pU} E=${eU} bldgs P=${G.bldgs.filter(b => b.team === PLAYER).length} E=${G.bldgs.filter(b => b.team === ENEMY).length} sup P=${G.sup[PLAYER]} E=${G.sup[ENEMY]}`);
    }
  }
  console.log(G.over ? `game over at ${G.time | 0}s, winner ${G.winner === PLAYER ? 'player' : 'AI'}` : 'no result after 10 min', JSON.stringify(G.stats[PLAYER]));
}
