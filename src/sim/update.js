// The per-tick update: unit behaviour, movement and separation, production, turrets, projectiles.
// step(dt) is the only thing the client calls to advance the game.
import { TILE, PLAYER, ENEMY, DIFF, WW, WH, UNITS } from './constants.js';
import { clamp, dist } from './util.js';
import { map, idx, blocked, nearestFree } from './map.js';
import { astar } from './path.js';
import { G, emit, rebuildHash, nearby, closestPt, edgeDist, findTarget, damage, visibleEnt, recalcSupply, spawnFrom, updateFog } from './state.js';
import { tileOf, pathTo, attackMove, moveTo, startGather, nearestNode } from './commands.js';
import { aiTick } from './ai.js';

function stepPath(u, dt) {
  if (!u.path || !u.path.length) return true;
  const w = u.path[0], d = dist(u, w), mv = u.d.speed * dt;
  u.face = Math.atan2(w.y - u.y, w.x - u.x);
  if (d <= mv + 1) { u.x = w.x; u.y = w.y; u.path.shift(); return u.path.length === 0; }
  u.x += (w.x - u.x) / d * mv; u.y += (w.y - u.y) / d * mv; return false;
}

/** Move toward target until within reach. Returns true once in reach. */
function approach(u, target, reach, dt) {
  const p = target.kind === 'bldg' ? closestPt(target, u) : target; const d = edgeDist(target, u);
  if (d <= reach) { u.path = null; u.face = Math.atan2(p.y - u.y, p.x - u.x); return true; }
  u.repath -= dt;
  if (!u.path || u.repath <= 0) {
    if (target.kind === 'bldg') { const t = tileOf(u); const g = tileOf(p); u.path = astar(t.x, t.y, g.x, g.y); u.repath = 0.7; }
    else pathTo(u, target.x, target.y);
  }
  if (u.path && u.path.length) stepPath(u, dt);
  else { const mv = u.d.speed * dt, nx = u.x + (p.x - u.x) / d * mv, ny = u.y + (p.y - u.y) / d * mv; if (!blocked((nx / TILE) | 0, (ny / TILE) | 0)) { u.x = nx; u.y = ny; } }
  return false;
}

function fire(u, t) {
  u.cd = u.d.cd; const p = u.kind === 'bldg' ? { x: u.x, y: u.y } : u;
  if (u.d.proj) {
    G.projs.push({ x: p.x, y: p.y, target: t, speed: u.d.proj === 'shell' ? 300 : 460, dmg: u.d.dmg, type: u.d.proj, by: u, team: u.team });
    if (u.team === PLAYER || visibleEnt(u)) emit({ t: 'sfx', name: u.d.proj === 'shell' ? 'shell' : 'bolt' });
  } else damage(t, u.d.dmg, u);
}

function resumeAfter(u) {
  if (u.type === 'harvester') { const nd = u.lastNode && u.lastNode.amount > 0 ? u.lastNode : nearestNode(u, 'shard', 500); if (nd && startGather(u, nd)) return; }
  u.task = { t: 'idle' }; u.path = null;
}

function updateUnit(u, dt) {
  u.cd -= dt; u.flash -= dt;
  const T = u.task, range = u.d.range * TILE, combat = u.type !== 'harvester';
  switch (T.t) {
    case 'idle': case 'hold': {
      u.aggroCd -= dt;
      if (combat && u.aggroCd <= 0) {
        u.aggroCd = 0.3;
        const t = findTarget(u, T.t === 'hold' ? range + u.r : u.d.sight * TILE * 0.85);
        if (t) { if (T.t === 'hold') { if (u.cd <= 0) fire(u, t); u.face = Math.atan2(t.y - u.y, t.x - u.x); } else u.task = { t: 'attack', target: t, back: { x: u.x, y: u.y } }; }
      }
      break;
    }
    case 'move': {
      u.repath -= dt; if (!u.path && u.repath <= 0) pathTo(u, T.x, T.y);
      if (!u.path || stepPath(u, dt)) { if (dist(u, T) < 40 || !u.path) { u.task = { t: 'idle' }; u.path = null; } }
      break;
    }
    case 'amove': {
      u.aggroCd -= dt;
      if (u.aggroCd <= 0) { u.aggroCd = 0.3; const t = findTarget(u, u.d.sight * TILE * 0.85); if (t && combat) { u.task = { t: 'attack', target: t, back: { x: T.x, y: T.y, amove: true } }; break; } }
      u.repath -= dt; if (!u.path && u.repath <= 0) pathTo(u, T.x, T.y);
      if (!u.path || stepPath(u, dt)) { if (dist(u, T) < 40 || !u.path) { u.task = { t: 'idle' }; u.path = null; } }
      break;
    }
    case 'attack': {
      const t = T.target;
      if (!t || t.dead) { if (T.back) { if (T.back.amove) attackMove(u, T.back.x, T.back.y); else moveTo(u, T.back.x, T.back.y); } else resumeAfter(u); break; }
      if (combat && u.aggroCd <= 0 && t.kind === 'bldg') { u.aggroCd = 0.5; const t2 = findTarget(u, range + u.r, true); if (t2) T.target = t2; }
      u.aggroCd -= dt;
      if (approach(u, t, range + u.r * 0.5, dt)) { if (u.cd <= 0) fire(u, t); }
      break;
    }
    case 'gather': {
      const n = T.node;
      if (!n || n.amount <= 0 || (n.type === 'ether' && !(n.extractor && n.extractor.done && !n.extractor.dead))) {
        if (T.phase === 'mine' && n) n.miners--;
        const nd = nearestNode(u, n ? n.type : 'shard', 600) || nearestNode(u, 'shard', 900);
        if (nd) { u.lastNode = nd; T.node = nd; T.phase = u.carry ? 'return' : 'go'; } else { u.task = { t: 'idle' }; u.path = null; }
        break;
      }
      if (T.phase === 'go' || T.phase === 'wait') {
        const tgt = n.type === 'ether' ? n.extractor : n;
        if (approach(u, tgt, n.type === 'ether' ? u.r + 6 : u.r + 13, dt)) { if (n.miners < 2) { n.miners++; T.phase = 'mine'; T.timer = (n.type === 'ether' ? 2.8 : 2.0) / (u.team === ENEMY ? DIFF[G.diff].income : 1); } else T.phase = 'wait'; }
      } else if (T.phase === 'mine') {
        T.timer -= dt;
        if (T.timer <= 0) {
          n.miners--; const take = Math.min(n.amount, n.type === 'ether' ? 6 : 8);
          if (n.type !== 'ether') n.amount -= take;
          u.carry = take; u.carryType = n.type; T.phase = 'return';
          if (n.amount <= 0 && n.type === 'shard') { map.occ[idx(n.tx, n.ty)] = 0; map.nodes.splice(map.nodes.indexOf(n), 1); if (G.vis[idx(n.tx, n.ty)]) emit({ t: 'toast', msg: 'A shard field ran dry' }); }
        }
      } else if (T.phase === 'return') {
        let best = null, bd = 1e9;
        for (const b of G.bldgs) if (b.team === u.team && b.done && b.d.dropoff && !b.dead) { const d = edgeDist(b, u); if (d < bd) { bd = d; best = b; } }
        if (!best) { u.task = { t: 'idle' }; u.path = null; break; }
        if (approach(u, best, u.r + 6, dt)) { G.res[u.team][u.carryType === 'ether' ? 1 : 0] += Math.round(u.carry * (u.team === ENEMY ? DIFF[G.diff].income : 1)); u.carry = 0; T.phase = 'go'; if (u.team === PLAYER) emit({ t: 'sfx', name: 'coin' }); }
      }
      break;
    }
    case 'build': {
      const b = T.b;
      if (!b || b.dead || b.done) { resumeAfter(u); break; }
      if (approach(u, b, u.r + 8, dt)) {
        b.progress += dt / b.d.build; b.hp = Math.min(b.maxhp, b.hp + dt / b.d.build * b.maxhp * 0.9); b.builders = 2;
        if (b.progress >= 1) {
          b.done = true; b.progress = 1; b.hp = Math.min(b.maxhp, b.hp); recalcSupply(b.team);
          if (b.team === PLAYER) { emit({ t: 'toast', msg: b.d.name + ' complete' }); emit({ t: 'sfx', name: 'done' }); }
          for (const o of G.units) if (o !== u && o.task.t === 'build' && o.task.b === b) resumeAfter(o);
          resumeAfter(u);
        }
      }
      break;
    }
  }
}

/** Push overlapping units apart and out of blocked tiles. */
function separate() {
  for (const u of G.units) {
    if (u.task.t === 'hold') continue;
    for (const o of nearby(u.x, u.y, 40)) {
      if (o === u) continue;
      const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = u.r + o.r;
      if (d < min) { const push = (min - d) * 0.5 * (o.task.t === 'hold' ? 1 : 0.5); u.x += dx / d * push; u.y += dy / d * push; }
    }
    u.x = clamp(u.x, 16, WW - 16); u.y = clamp(u.y, 16, WH - 16);
    const t = tileOf(u);
    if (blocked(t.x, t.y)) { const f = nearestFree(t.x, t.y, 4); if (f) { const cx = f.x * TILE + 16, cy = f.y * TILE + 16, d = dist(u, { x: cx, y: cy }); if (d < 24) { u.x = cx; u.y = cy; } else { u.x += (cx - u.x) / d * 6; u.y += (cy - u.y) / d * 6; } u.repath = 0; } }
  }
}

function updateBuilding(b, dt) {
  b.flash -= dt; b.cd -= dt;
  if (!b.done) return;
  if (b.d.range) { if (b.cd <= 0) { const t = findTarget(b, b.d.range * TILE); if (t) { b.aim = Math.atan2(t.y - b.y, t.x - b.x); fire(b, t); } } }
  if (b.queue.length) { const q = b.queue[0]; b.prog += dt / UNITS[q].build; if (b.prog >= 1) { b.prog = 0; b.queue.shift(); spawnFrom(b, q); } }
}

function updateProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i]; const t = p.target;
    if (!t || t.dead) { G.projs.splice(i, 1); continue; }
    const tp = t.kind === 'bldg' ? closestPt(t, p) : t; const d = dist(p, tp), mv = p.speed * dt;
    if (d <= mv + (t.r || 0) * 0.3) { damage(t, p.dmg, p.by); emit({ t: 'hit', x: tp.x, y: tp.y, big: p.type === 'shell' }); G.projs.splice(i, 1); }
    else { p.x += (tp.x - p.x) / d * mv; p.y += (tp.y - p.y) / d * mv; }
  }
}

/** Advance the world by one fixed tick. dt must always be DT for determinism. */
export function step(dt) {
  G.time += dt; G.tick++;
  rebuildHash();
  for (const u of G.units.slice()) if (!u.dead) updateUnit(u, dt);
  separate();
  for (const b of G.bldgs.slice()) if (!b.dead) updateBuilding(b, dt);
  updateProjs(dt);
  updateFog();
  aiTick(dt);
}

/** Cheap state fingerprint for desync detection between lockstep peers. */
export function stateHash() {
  let h = 2166136261;
  const mix = (v) => { h ^= (v | 0); h = Math.imul(h, 16777619) >>> 0; };
  mix(G.tick); mix(G.res[0][0]); mix(G.res[0][1]); mix(G.res[1][0]); mix(G.res[1][1]);
  for (const u of G.units) { mix(u.id); mix(u.x * 16); mix(u.y * 16); mix(u.hp * 16); }
  for (const b of G.bldgs) { mix(b.id); mix(b.hp * 16); mix(b.progress * 1024); mix(b.queue.length); }
  return h >>> 0;
}
