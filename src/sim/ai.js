// The scripted opponent. Runs twice a second: assigns workers, follows a build order, keeps supply
// ahead, defends its base, and attacks in growing waves. Uses G.rng only, never Math.random.
import { TILE, PLAYER, ENEMY, DIFF, BUILDINGS, UNITS, BASES } from './constants.js';
import { dist } from './util.js';
import { map } from './map.js';
import { G, canPlace, hasReq, canAfford, queueUnit, recalcSupply } from './state.js';
import { startGather, nearestNode, placeBuilding, attackEnt, attackMove, moveTo } from './commands.js';

export function initAI() {
  const c = G.bldgs.find(b => b.team === ENEMY && b.type === 'core');
  G.ai = { t: 0, wave: DIFF[G.diff].wave, lastWave: -20, attacking: false, attackers: null, core: c, rally: null };
}

function findSpot(type, cx, cy) {
  const d = BUILDINGS[type];
  if (d.onVent) {
    let best = null, bd = 1e9;
    for (const n of map.nodes) if (n.type === 'ether' && !n.extractor) { const dd = Math.hypot(n.tx - cx, n.ty - cy); if (dd < bd && dd < 16) { bd = dd; best = n; } }
    return best ? { x: best.tx, y: best.ty } : null;
  }
  const a0 = G.rng() * Math.PI * 2;
  for (let r = 3.5; r < 15; r += 1) for (let k = 0; k < 20; k++) {
    const a = a0 + k / 20 * Math.PI * 2;
    const tx = Math.round(cx + Math.cos(a) * r - d.w / 2), ty = Math.round(cy + Math.sin(a) * r - d.h / 2);
    if (!canPlace(type, tx, ty, ENEMY)) continue;
    let ok = true;
    for (const n of map.nodes) { if (Math.hypot(n.tx + 0.5 - (tx + d.w / 2), n.ty + 0.5 - (ty + d.h / 2)) < 4.5) { ok = false; break; } }
    if (ok) return { x: tx, y: ty };
  }
  return null;
}

export function aiTick(dt) {
  const A = G.ai; if (!A || G.over) return;
  A.t += dt; if (A.t < 0.5) return; A.t = 0;
  const D = DIFF[G.diff], E = ENEMY, t = G.time;
  const myB = G.bldgs.filter(b => b.team === E && !b.dead), myU = G.units.filter(u => u.team === E && !u.dead);
  const core = myB.find(b => b.type === 'core' && b.done) || myB.find(b => b.type === 'core'); A.core = core;
  const harv = myU.filter(u => u.type === 'harvester'), army = myU.filter(u => u.type !== 'harvester');
  const cx = core ? core.tx + core.w / 2 : BASES[1].x + 2, cy = core ? core.ty + core.h / 2 : BASES[1].y + 2;
  const cnt = k => myB.filter(b => b.type === k).length, done = k => myB.filter(b => b.type === k && b.done).length, building = myB.filter(b => !b.done);
  if (!A.rally) { const pb = BASES[0]; const ang = Math.atan2(pb.y - cy, pb.x - cx); A.rally = { x: (cx + Math.cos(ang) * 9) * TILE, y: (cy + Math.sin(ang) * 9) * TILE }; }

  // Workers: idle ones mine; keep up to three on ether once an extractor stands.
  const ext = myB.find(b => b.type === 'extractor' && b.done); let ether = 0;
  for (const h of harv) if (h.task.t === 'gather' && h.task.node.type === 'ether') ether++;
  for (const h of harv) { if (h.task.t === 'idle') { const want = ext && ether < 3 ? 'ether' : 'shard'; const n = nearestNode(h, want, 800) || nearestNode(h, 'shard', 1200); if (n) { startGather(h, n); if (want === 'ether') ether++; } } }
  if (ext && ether < 3) { const h = harv.find(x => x.task.t === 'gather' && x.task.node.type === 'shard' && x.task.phase !== 'mine' && !x.carry); if (h) { const n = nearestNode(h, 'ether', 800); if (n) { startGather(h, n); ether++; } } }

  // Economy and build order.
  const queuedH = myB.reduce((s, b) => s + b.queue.filter(q => q === 'harvester').length, 0);
  if (core && core.done && harv.length + queuedH < D.harv && core.queue.length < 1) queueUnit(core, 'harvester');
  const [used, cap] = G.sup[E]; let want = null;
  if (cap - used <= 4 && cap < 200 && !building.some(b => b.type === 'depot')) want = 'depot';
  else if (harv.length >= 7 && cnt('extractor') === 0) want = 'extractor';
  else if (cnt('barracks') < (D.rax + (t > 300 ? 1 : 0) + (t > 540 ? 1 : 0))) want = 'barracks';
  else if (done('barracks') >= 1 && ext && cnt('forge') === 0 && t > 150) want = 'forge';
  else if (done('barracks') >= 1 && cnt('turret') < (t > 240 ? 1 : 0) + (t > 480 ? 1 : 0)) want = 'turret';
  if (want && building.length < 2 && hasReq(E, want) && canAfford(E, BUILDINGS[want].cost)) {
    const spot = findSpot(want, cx, cy);
    if (spot) { const b = harv.filter(h => h.task.t !== 'build' && !h.carry).sort((p, q) => dist(p, { x: spot.x * TILE, y: spot.y * TILE }) - dist(q, { x: spot.x * TILE, y: spot.y * TILE }))[0]; if (b) placeBuilding(E, want, spot.x, spot.y, b); }
  }

  // Production.
  for (const b of myB) {
    if (!b.done || !b.d.trains || b.type === 'core') continue;
    if (!b.rally) b.rally = A.rally;
    if (b.queue.length < 2) { const u = b.d.trains[0]; if (canAfford(E, UNITS[u].cost) && (want !== 'depot' || G.res[E][0] > UNITS[u].cost[0] + 100)) queueUnit(b, u); }
  }

  // Defense: anything near our buildings gets jumped by the idle army.
  let intruder = null;
  for (const u of G.units) { if (u.team !== PLAYER || u.dead) continue; for (const b of myB) { if (dist(u, b) < 420 + b.r) { intruder = u; break; } } if (intruder) break; }
  if (intruder) { for (const a of army) if (a.task.t === 'idle' || a.task.t === 'move' || (a.task.t === 'amove' && !a.task.target && dist(a, A.rally) < 300)) attackEnt(a, intruder); }

  // Waves.
  const pBuild = G.bldgs.filter(b => b.team === PLAYER && !b.dead);
  if (pBuild.length && army.length >= A.wave && t - A.lastWave > D.gap && t > D.first) {
    A.lastWave = t; A.wave += D.waveGrow; A.attacking = true;
    const tgt = pBuild.find(b => b.type === 'core') || pBuild[0];
    for (const a of army) attackMove(a, tgt.x + (G.rng() - 0.5) * 80, tgt.y + (G.rng() - 0.5) * 80);
    A.attackers = new Set(army.map(a => a.id));
  }
  if (A.attacking && A.attackers) {
    const alive = army.filter(a => A.attackers.has(a.id));
    if (!alive.length) A.attacking = false;
    else for (const a of alive) { if (a.task.t === 'idle' && pBuild.length) { let best = null, bd = 1e9; for (const b of pBuild) { const d = dist(a, b); if (d < bd) { bd = d; best = b; } } if (bd < 700) attackEnt(a, best); else attackMove(a, best.x, best.y); } }
  } else for (const a of army) if (a.task.t === 'idle' && dist(a, A.rally) > 160) moveTo(a, A.rally.x + (G.rng() - 0.5) * 120, A.rally.y + (G.rng() - 0.5) * 120);
  recalcSupply(E);
}
