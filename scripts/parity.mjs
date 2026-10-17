// Runs the JS sim (src/sim) and the Rust sim (WASM) side by side and compares their state hashes every tick.
// Both get the same seed, difficulty and player commands; the first tick where they disagree is reported
// with the entities that differ. Usage: node scripts/parity.mjs [ticks=9000] [seeds=1,2,3] (needs build:wasm)
import { readFileSync } from 'node:fs';
import * as js from '../src/sim/index.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const sim = await import(new URL('endfall_sim.js', pkg));
sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });

const TICKS = +(process.argv[2] || 9000);
const SEEDS = (process.argv[3] || '1,2,3,4242,31337').split(',').map(Number);
const { G, PLAYER, ENEMY, DT } = js;
const UNIT_KINDS = ['harvester', 'trooper', 'vanguard'];

/** A scripted player that sends identical commands to both sims (it reads the JS state to decide). */
function bot(g, i) {
  const core = G.bldgs.find(b => b.team === PLAYER && b.type === 'core');
  if (!core) return;
  const place = (type) => {
    const h = G.units.find(u => u.team === PLAYER && u.type === 'harvester' && u.task.t !== 'build');
    for (let r = 3; r < 10; r++) for (let a = 0; a < 12; a++) {
      const tx = Math.round(core.tx + 2 + Math.cos(a / 12 * 6.28) * r - 1), ty = Math.round(core.ty + 2 + Math.sin(a / 12 * 6.28) * r - 1);
      if (js.canPlace(type, tx, ty, PLAYER)) {
        const a1 = js.placeBuilding(PLAYER, type, tx, ty, h), b1 = g.placeBuilding(PLAYER, type, tx, ty, h ? h.id : 0);
        if ((a1 || '') !== b1) throw new Error(`placeBuilding differs: ${a1} vs ${b1}`);
        return !a1;
      }
    }
    return false;
  };
  const S = bot.state;
  if (!S.depot && G.res[PLAYER][0] >= 100) S.depot = place('depot');
  if (S.depot && !S.rax && G.res[PLAYER][0] >= 150) S.rax = place('barracks');
  if (S.rax && !S.ext && G.res[PLAYER][0] >= 75 && G.units.filter(u => u.team === PLAYER).length > 8) S.ext = place('extractor') || true;
  const rax = G.bldgs.find(b => b.team === PLAYER && b.type === 'barracks' && b.done);
  if (rax && rax.queue.length < 2 && G.res[PLAYER][0] >= 50) {
    const a1 = js.queueUnit(rax, 'trooper'), b1 = g.queueUnit(rax.id, 'trooper');
    if ((a1 || '') !== b1) throw new Error(`queueUnit differs: ${a1} vs ${b1}`);
  }
  if (core.queue.length === 0 && G.units.filter(u => u.team === PLAYER && u.type === 'harvester').length < 12 && G.res[PLAYER][0] >= 50) {
    js.queueUnit(core, 'harvester'); g.queueUnit(core.id, 'harvester');
  }
  if (i === 30 * 200 && rax) { js.cancelQueue(rax, rax.queue.length - 1); g.cancelQueue(rax.id, rax.queue.length); }
  if (i === 30 * 240 && rax) { const n = js.map.nodes[0]; rax.rally = { x: core.x + 200, y: core.y - 200, node: null }; g.setRally(rax.id, core.x + 200, core.y - 200, 0); void n; }
  if (i % (30 * 90) === 0 && i > 0) {
    const army = G.units.filter(u => u.team === PLAYER && u.type !== 'harvester');
    const eb = G.bldgs.find(b => b.team === ENEMY);
    if (army.length >= 6 && eb) { for (const u of army) { js.attackMove(u, eb.x, eb.y); g.attackMove(u.id, eb.x, eb.y); } }
    else if (army.length) { js.formation(army, core.x + 150, core.y - 150); g.formation(Uint32Array.from(army.map(u => u.id)), core.x + 150, core.y - 150); }
  }
  if (i === 30 * 300) { const u = G.units.find(x => x.team === PLAYER && x.type === 'trooper'); if (u) { js.holdUnit(u); g.holdUnit(u.id); } }
  if (i === 30 * 320) { const u = G.units.find(x => x.team === PLAYER && x.type === 'trooper'); if (u) { js.stopUnit(u); g.stopUnit(u.id); } }
}

function diff(g) {
  const out = [];
  const U = g.units(), US = 16;
  if (U.length / US !== G.units.length) out.push(`unit count js=${G.units.length} rust=${U.length / US}`);
  for (let k = 0; k < Math.min(G.units.length, U.length / US); k++) {
    const u = G.units[k], o = k * US;
    const f = { id: U[o], x: U[o + 3], y: U[o + 4], hp: U[o + 5] };
    if (u.id !== f.id || u.x !== f.x || u.y !== f.y || u.hp !== f.hp) out.push(`unit ${u.id} ${UNIT_KINDS.indexOf(u.type)} task=${u.task.t}/${u.task.phase || ''} js=(${u.x}, ${u.y}, ${u.hp}) rust=(id ${f.id}: ${f.x}, ${f.y}, ${f.hp}) task=${U[o + 12]}/${U[o + 13]}`);
    if (out.length > 8) break;
  }
  const I = g.info();
  if (I[2] !== G.res[0][0] || I[3] !== G.res[0][1] || I[4] !== G.res[1][0] || I[5] !== G.res[1][1]) out.push(`res js=${G.res} rust=${[I[2], I[3], I[4], I[5]]}`);
  const B = g.buildings(), BS = 24;
  if (B.length / BS !== G.bldgs.length) out.push(`building count js=${G.bldgs.length} rust=${B.length / BS}`);
  for (let k = 0; k < Math.min(G.bldgs.length, B.length / BS); k++) {
    const b = G.bldgs[k], o = k * BS;
    if (b.id !== B[o] || b.hp !== B[o + 5] || b.progress !== B[o + 7] || b.queue.length !== B[o + 16]) out.push(`bldg ${b.id} ${b.type} js=(${b.hp}, ${b.progress}, q${b.queue.length}) rust=(id ${B[o]}: ${B[o + 5]}, ${B[o + 7]}, q${B[o + 16]})`);
  }
  return out;
}

let failed = 0;
for (const seed of SEEDS) for (const d of [0, 1, 2]) for (const withBot of [false, true]) {
  js.resetGame(seed, d); const g = new sim.Game(seed, d); bot.state = {};
  let bad = js.stateHash() !== g.stateHash() ? 0 : -1, t = 0;
  for (; bad < 0 && t < TICKS && !G.over; t++) {
    if (withBot) bot(g, t);
    js.step(DT); g.step();
    if (js.stateHash() !== g.stateHash()) bad = t + 1;
  }
  const tag = `seed ${seed} diff ${d} ${withBot ? 'bot ' : 'idle'}`;
  if (bad >= 0) { failed++; console.log(`DIVERGED ${tag} at tick ${bad} (${(bad / 30).toFixed(1)}s)\n  ` + diff(g).join('\n  ')); }
  else console.log(`ok       ${tag} ${t} ticks${G.over ? `, game over, winner ${G.winner === PLAYER ? 'player' : 'AI'}` : ''} (rust over=${g.info()[10]}, winner=${g.info()[11]})`);
  g.free();
}
process.exit(failed ? 1 : 0);
