// The new look's land (src/client/gl/newland.js, `?art=new`): where the trees and rocks stand, checked against the
// pieces' measured table (src/client/gl/newland-pieces.js: numbers, the pictures are not in the repo). The rule: where a
// unit cannot walk reads exactly. A piece that stands has its whole base on blocked cells; no walkable cell's center is
// in a base; a piece's art reaches over walkable ground no deeper than the cap allows; at half a tile no walkable
// cell's center is under any crown. The same land from the same map and seed, whoever is seated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { planLand, groundMix, cover, allowance, stands, LAND, TILE, MIX_K, WORN, wornAt, wearMix } from '../src/client/gl/newland.js';
import { PIECES, SLICE } from '../src/client/gl/newland-pieces.js';
import { rockKinds } from '../src/client/gl/ground.js';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';
let E;
if (built) {
  const sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  E = await import('../src/engine/core.js');
}
const APRON = 13; // (gl/render.js)

/** The land of a map as gl/render.js lays it. */
const landOf = (w, h, rock, seed, cap, apron = APRON) => {
  const kinds = rockKinds(w, h, (x, y) => rock[y * w + x] !== 0, seed);
  return { kinds, ...planLand({ w, h, rock, kindAt: kinds.kindAt, seed, apron, cap }) };
};
/** Check a plan against the rule, the test's own way (cells looked up one by one); returns its numbers. */
function check(w, h, rock, plan, cap, name) {
  const inMap = (x, y) => x >= 0 && y >= 0 && x < w && y < h, blocked = (x, y) => !inMap(x, y) || rock[y * w + x] !== 0;
  const n = { pieces: plan.pieces.length, standing: 0, live: 0, low: 0 };
  for (const o of plan.pieces) {
    const p = PIECES[o.i];
    assert.equal(o.low, !stands(p.kind), `${name}: ${p.name} lies low only if its kind does`);
    if (o.low) { n.low++; assert.equal(o.live, false, `${name}: a low piece is never among the units`); continue; }
    n.standing++; if (o.live) n.live++;
    // (its base: `fw` across, a rock's the core of it, the middle LAND.hill.core that carries it; `fd` deep, from its ground point up)
    const rock0 = p.kind === 'crag' || p.kind === 'boulder', bw = p.fw * (rock0 ? LAND.hill.core : 1);
    const x0 = o.x - bw * o.s / 2, x1 = o.x + bw * o.s / 2, y0 = o.y - p.fd * o.s, y1 = o.y;
    for (let cy = Math.floor(y0 / TILE); cy <= Math.floor((y1 - 1e-6) / TILE); cy++) for (let cx = Math.floor(x0 / TILE); cx <= Math.floor((x1 - 1e-6) / TILE); cx++) {
      assert.ok(blocked(cx, cy), `${name}: ${p.name} at ${o.x.toFixed(1)}, ${o.y.toFixed(1)} has its base on the walkable cell ${cx}, ${cy}`);
    }
    // (a walkable cell's center in its base: none, said outright)
    const mx = Math.floor((x0 + x1) / 2 / TILE), my = Math.floor((y0 + y1) / 2 / TILE);
    for (let cy = my - 1; cy <= my + 1; cy++) for (let cx = mx - 2; cx <= mx + 2; cx++) {
      const px = (cx + 0.5) * TILE, py = (cy + 0.5) * TILE;
      if (!blocked(cx, cy)) assert.ok(!(px >= x0 && px < x1 && py >= y0 && py < y1), `${name}: the center of walkable cell ${cx}, ${cy} is in ${p.name}'s base`);
    }
    // (live: exactly the pieces whose art, a unit's half width wider, reaches a walkable cell)
    let reach = false;
    const a0 = o.x - p.l * o.s - LAND.reach, a1 = o.x + p.r * o.s + LAND.reach, b0 = o.y - p.h * o.s;
    for (let cy = Math.floor(b0 / TILE); cy <= Math.floor((o.y - 1e-6) / TILE); cy++) for (let cx = Math.floor(a0 / TILE); cx <= Math.floor((a1 - 1e-6) / TILE); cx++) if (!blocked(cx, cy)) reach = true;
    assert.equal(o.live, reach, `${name}: ${p.name} is drawn among the units exactly when a unit could stand behind it`);
  }
  for (let i = 1; i < plan.pieces.length; i++) assert.ok(plan.pieces[i].z >= plan.pieces[i - 1].z, `${name}: the pieces come north to south`);
  // A hill's border cells (beside walkable ground): the widest rock whose ground point is in each: never open gravel.
  const widest = new Float32Array(w * h), kindOf = plan.kinds?.kindAt;
  for (const o of plan.pieces) { const p = PIECES[o.i]; if (p.kind !== 'crag' && p.kind !== 'boulder') continue; const cx = Math.floor(o.x / TILE), cy = Math.floor((o.y - 1e-6) / TILE); if (inMap(cx, cy)) widest[cy * w + cx] = Math.max(widest[cy * w + cx], p.w * o.s); }
  n.rim = 0; n.rimWide = 0; n.rimLeast = Infinity;
  if (kindOf) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!rock[y * w + x] || kindOf(x, y) !== 'hill') continue;
    let open = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!blocked(x + dx, y + dy)) open = true;
    if (!open) continue;
    n.rim++; n.rimLeast = Math.min(n.rimLeast, widest[y * w + x]); if (widest[y * w + x] >= TILE) n.rimWide++;
    assert.ok(widest[y * w + x] >= 24, `${name}: the hill's border cell ${x}, ${y} has a rock standing on it (the widest: ${widest[y * w + x].toFixed(1)} px)`);
  }
  // The art over the walkable cells, from the pieces' profiles.
  const cv = cover(w, h, plan.pieces), allow = allowance(w, h, blocked, cap);
  let walk = 0, under = 0, sum = 0, max = 0, centers = 0, deepest = 0;
  for (let i = 0; i < w * h; i++) {
    if (rock[i]) continue;
    walk++;
    assert.ok(cv.deep[i] <= allow[i], `${name}: a piece reaches ${cv.deep[i].toFixed(1)} px into walkable cell ${i % w}, ${(i / w) | 0}, the cap ${cap} allows ${allow[i]}`);
    if (cv.share[i] > 0) { under++; sum += cv.share[i]; max = Math.max(max, cv.share[i]); }
    centers += cv.center[i]; deepest = Math.max(deepest, cv.deep[i]);
  }
  return { ...n, walk, under, mean: under ? sum / under : 0, max, centers, deepest };
}

test('the table: every piece has a base no wider than its art and a profile inside its box', () => {
  assert.ok(PIECES.length >= 30);
  for (const k of ['tree', 'bush', 'crag', 'boulder', 'scree', 'low']) assert.ok(PIECES.some(p => p.kind === k), `a ${k} in the table`);
  for (const p of PIECES) {
    assert.ok(p.w > 0 && p.h > 0 && p.fw > 0 && p.fd > 0 && p.fw <= p.w + 0.5 && p.fd <= p.h, `${p.name}: a base inside its art`);
    assert.ok(Math.abs(p.l + p.r - p.w) <= 0.5, `${p.name}: left and right of its ground point make its width`);
    assert.equal(p.rows.length, Math.ceil(p.h / SLICE), `${p.name}: a profile slice per ${SLICE} px of height`);
    for (const [l, r] of p.rows) assert.ok(l <= p.l + 0.25 && r <= p.r + 0.25, `${p.name}: its profile inside its box`);
  }
});

/** A hand-made map from rows: '#' blocked, '.' open. */
function handMap(rows) {
  const h = rows.length, w = rows[0].length, rock = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') rock[y * w + x] = 1; }));
  return { w, h, rock };
}
const HAND = ['################', '#......#.......#', '#..##..#..###..#', '#..##.....###..#', '#.........###..#', '#..#...........#', '#..#....##.....#', '#.......##..#..#', '#..............#', '################'];

test('a hand-made map, any seed and cap: bases on blocked cells, the cap kept, something on every blocked cell', () => {
  const { w, h, rock } = handMap(HAND);
  for (const seed of [1, 7, 42, 1291, 99991]) for (const cap of [0.5, 1, 2]) {
    const plan = landOf(w, h, rock, seed, cap, 2), n = check(w, h, rock, plan, cap, `hand map, seed ${seed}, cap ${cap}`);
    if (cap === 0.5) assert.equal(n.centers, 0, 'at half a tile no walkable cell\'s center is under a standing piece');
    // (every blocked cell of the map has a standing piece's ground point in it or beside it: nothing blocked reads as open)
    const has = new Uint8Array(w * h);
    for (const o of plan.pieces) if (!o.low) { const cx = Math.floor(o.x / TILE), cy = Math.floor((o.y - 1e-6) / TILE); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < w && cy + dy < h) has[(cy + dy) * w + cx + dx] = 1; }
    for (let i = 0; i < w * h; i++) if (rock[i]) assert.ok(has[i], `seed ${seed}, cap ${cap}: blocked cell ${i % w}, ${(i / w) | 0} has a tree or a rock on it or next to it`);
  }
});

test('the same land from the same map and seed; another seed, another land', () => {
  const { w, h, rock } = handMap(HAND);
  const a = landOf(w, h, rock, 7, 1).pieces, b = landOf(w, h, rock, 7, 1).pieces, c = landOf(w, h, rock, 8, 1).pieces;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map(o => [o.i, o.x, o.y]), c.map(o => [o.i, o.x, o.y]));
});

test('the ground\'s mix: forest floor and scree exactly on the blocked cells, none at a walkable cell\'s center', () => {
  const { w, h, rock } = handMap(HAND), kinds = rockKinds(w, h, (x, y) => rock[y * w + x] !== 0, 7), A = 2;
  const dirt = new Float32Array(w * h); dirt[8 * w + 5] = dirt[8 * w + 6] = 1;
  const mix = groundMix({ w, h, rock, kindAt: kinds.kindAt, dirt, seed: 7, apron: A });
  assert.deepEqual([mix.w, mix.h, mix.k], [(w + 2 * A) * MIX_K, (h + 2 * A) * MIX_K, MIX_K]);
  const at = (cx, cy, ch) => { let s = 0; for (const [dx, dy] of [[1, 1], [2, 1], [1, 2], [2, 2]]) s += mix.data[(((cy + A) * MIX_K + dy) * mix.w + (cx + A) * MIX_K + dx) * 4 + ch]; return s / 4; }; // (a cell's four middle texels)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ground = at(x, y, 1) + at(x, y, 2);
    if (rock[y * w + x]) assert.ok(ground > 200, `blocked cell ${x}, ${y}: floor or scree at its middle (${ground})`);
    else assert.ok(ground < 110, `walkable cell ${x}, ${y}: mostly grass at its middle (${ground}: the stony fade ends about there)`);
    if (rock[y * w + x]) assert.equal(at(x, y, kinds.kindAt(x, y) === 'forest' ? 2 : 1) < 110, true, 'a forest has no scree, a hill no forest floor');
  }
  assert.ok(at(5, 8, 0) > 100 && at(12, 5, 0) === 0, 'worn dirt where the plan has it only');
  { // (a gold mine's tiles: trodden earth under it, whatever the plan laid there)
    const mm = groundMix({ w, h, rock, kindAt: kinds.kindAt, dirt: null, seed: 7, apron: A, mines: [{ tx: 5, ty: 3, w: 2, h: 2 }] });
    assert.ok(mm.data[(((3 + A) * MIX_K + 2) * mm.w + (5 + A) * MIX_K + 2) * 4] > 200, 'earth on the mine\'s tile');
  }
  for (let i = 3; i < mix.data.length; i += 4) assert.equal(mix.data[i], 255, 'a dry map: alpha full');
  // (water: alpha 0 at a wet tile's middle, full at a dry one's two tiles off; no low piece on a wet tile)
  const wet = (x, y) => y === 8 && x >= 9 && x <= 13, wm = groundMix({ w, h, rock, kindAt: kinds.kindAt, dirt: null, seed: 7, apron: A, wet });
  assert.equal(at(11, 8, 3) === 255 && (() => { let s = 0; for (const [dx, dy] of [[1, 1], [2, 2]]) s += wm.data[(((8 + A) * MIX_K + dy) * wm.w + (11 + A) * MIX_K + dx) * 4 + 3]; return s; })() === 0, true, 'under water the mix says so');
  for (const o of planLand({ w, h, rock, kindAt: kinds.kindAt, seed: 7, apron: A, wet }).pieces) if (o.low) assert.ok(!wet(Math.floor(o.x / TILE), Math.floor((o.y - 1) / TILE)) || rock[Math.floor((o.y - 1) / TILE) * w + Math.floor(o.x / TILE)], 'no fern or stone laid on a tile under water');
});

// Many seeds and every map kind (0-5 at 96 and 128 tiles, the Shore at 64), at the cap the game uses; the other two
// caps of the stills on a few. The numbers it prints are the ones reported (new-art/land/README.md).
const MAPS = [];
for (const kind of [0, 1, 2, 3, 4, 5]) for (const seed of [1291, 2026, 77]) MAPS.push([seed, kind, 96]);
for (const [seed, kind] of [[5, 0], [9, 3], [2, 4], [31, 1], [8, 5]]) MAPS.push([seed, kind, 128]);
for (const seed of [1, 12, 400]) MAPS.push([seed, 6, 64]);

test('every map kind, many seeds: bases on blocked cells, no walkable center in a base, the cap kept', { skip }, () => {
  const tot = { maps: 0, standing: 0, live: 0, walk: 0, under: 0, sum: 0, max: 0, centers: 0, deepest: 0, rim: 0, rimWide: 0, rimLeast: Infinity };
  for (const [seed, kind, size] of MAPS) {
    E.resetGameSeats(seed, 1, kind, 0, ['humans', 'vael'], [], [false, true], 0, size);
    const { MW, MH, map, G } = E, plan = landOf(MW, MH, map.rock, G.seed, LAND.cap);
    const n = check(MW, MH, map.rock, plan, LAND.cap, `map ${size} kind ${kind} seed ${seed}`);
    assert.ok(n.standing > 100, 'trees and rocks stand');
    tot.maps++; tot.standing += n.standing; tot.live += n.live; tot.walk += n.walk; tot.under += n.under; tot.sum += n.mean * n.under; tot.max = Math.max(tot.max, n.max); tot.centers += n.centers; tot.deepest = Math.max(tot.deepest, n.deepest);
    tot.rim += n.rim; tot.rimWide += n.rimWide; tot.rimLeast = Math.min(tot.rimLeast, n.rimLeast);
  }
  assert.ok(tot.deepest <= LAND.cap * TILE, 'no piece deeper over walkable ground than the cap');
  assert.ok(tot.rimWide >= 0.9 * tot.rim, 'nine in ten of the hills\' border cells carry a rock wider than the cell');
  if (LAND.cap <= 0.5) assert.equal(tot.centers, 0, 'at the game\'s cap no walkable cell\'s center is under a standing piece');
  console.log(`newland, cap ${LAND.cap}: ${tot.maps} maps, ${tot.standing} standing pieces (${tot.live} live), all bases on blocked cells; of ${tot.walk} walkable cells ${tot.under} (${(100 * tot.under / tot.walk).toFixed(1)}%) have art over them, ${(100 * tot.sum / tot.under).toFixed(0)}% of such a cell on average (the most ${(100 * tot.max).toFixed(0)}%), ${tot.centers} (${(100 * tot.centers / tot.walk).toFixed(2)}%) have their center under art; the deepest reach ${tot.deepest.toFixed(1)} px; of ${tot.rim} hill cells at a border ${tot.rimWide} (${(100 * tot.rimWide / tot.rim).toFixed(1)}%) carry a rock wider than the cell, the narrowest widest rock ${tot.rimLeast.toFixed(1)} px`);
});

test('the caps of the stills (half a tile, one, two): each kept; at half a tile no walkable center under a crown', { skip }, () => {
  for (const cap of [0.5, 1, 2]) {
    const tot = { walk: 0, under: 0, sum: 0, max: 0, centers: 0, deepest: 0, standing: 0 };
    for (const [seed, kind, size] of [[1291, 0, 96], [2026, 4, 96], [5, 0, 128], [9, 3, 128], [1, 6, 64]]) {
      E.resetGameSeats(seed, 1, kind, 0, ['humans', 'vael'], [], [false, true], 0, size);
      const { MW, MH, map, G } = E, n = check(MW, MH, map.rock, landOf(MW, MH, map.rock, G.seed, cap), cap, `cap ${cap}, map ${size} kind ${kind} seed ${seed}`);
      tot.walk += n.walk; tot.under += n.under; tot.sum += n.mean * n.under; tot.max = Math.max(tot.max, n.max); tot.centers += n.centers; tot.deepest = Math.max(tot.deepest, n.deepest); tot.standing += n.standing;
    }
    if (cap === 0.5) assert.equal(tot.centers, 0, 'at half a tile no walkable cell\'s center is under a standing piece');
    assert.ok(tot.deepest <= Math.min(1, cap) * TILE);
    console.log(`newland, cap ${cap}: ${tot.standing} standing pieces on 5 maps; ${tot.under} of ${tot.walk} walkable cells (${(100 * tot.under / tot.walk).toFixed(1)}%) have art over them, ${(100 * tot.sum / tot.under).toFixed(0)}% of such a cell on average (the most ${(100 * tot.max).toFixed(0)}%), ${tot.centers} centers under art (${(100 * tot.centers / tot.walk).toFixed(2)}%), the deepest reach ${tot.deepest.toFixed(1)} px`);
  }
});

test('the same land whoever is seated where', { skip }, () => {
  let first = null;
  for (const [n, side] of [[2, 0], [2, 1], [3, 2], [4, 1]]) {
    const races = Array.from({ length: n }, (_, s) => (s % 2 ? 'vael' : 'humans'));
    E.resetGameSeats(1291, 1, 0, side, races, [], races.map((_, s) => s > 0), 0, 96);
    const p = landOf(E.MW, E.MH, E.map.rock, E.G.seed, LAND.cap).pieces.map(o => [o.i, o.x, o.y, o.s, o.live]);
    if (!first) first = p; else assert.deepEqual(p, first, `${n} seated from side ${side} see the first setup's land`);
  }
});

// The trodden earth under a building (newland.js wearMix): the ground's own dirt over its footprint.
test('a building\'s earth fills its square, rounds its corners, fades out past it, and leaves with it', () => {
  const w = 24, h = 20, apron = 3, rock = new Uint8Array(w * h), dirt = new Float32Array(w * h);
  for (let x = 2; x < 6; x++) dirt[4 * w + x] = 1; // (a worn track of the map's own)
  const mix = groundMix({ w, h, rock, kindAt: () => 'hill', dirt, seed: 7, apron }), k = mix.k, W = mix.w;
  const base = new Uint8Array(mix.w * mix.h); for (let i = 0; i < base.length; i++) base[i] = mix.data[i * 4];
  const other = new Uint8Array(mix.data); // (green, blue and alpha must stay as the map laid them)
  const red = (px, py) => mix.data[(Math.floor((py / TILE + apron) * k) * W + Math.floor((px / TILE + apron) * k)) * 4];
  const hall = { tx: 10, ty: 8, w: 3, h: 3, type: 'barracks' }, mast = { tx: 16, ty: 4, w: 2, h: 2, type: 'spire' }, onTrack = { tx: 3, ty: 3, w: 2, h: 2, type: 'depot' };
  wearMix(mix, base, [hall, mast, onTrack], { apron, seed: 7 });
  const full = Math.round(255 * WORN.rest);
  // the whole square, edge to edge and corner to corner inside its rounding
  for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.08], [0.5, 0.92], [0.2, 0.2], [0.8, 0.8]]) assert.equal(red((hall.tx + hall.w * fx) * TILE, (hall.ty + hall.h * fy) * TILE), full, `the hall at ${fx}, ${fy}`);
  assert.equal(red((mast.tx + 1) * TILE, (mast.ty + 1) * TILE), 255, 'the Wind turbine\'s is the strongest');
  // its very corner is rounded off, and the earth is gone a tile out
  assert.ok(red(hall.tx * TILE - 6, hall.ty * TILE - 6) < 0.4 * red(hall.tx * TILE - 6, (hall.ty + 1.5) * TILE), 'a rounded corner: 6 px out past it holds far less than 6 px out past an edge');
  for (const [dx, dy] of [[-1, 1.5], [4, 1.5], [1.5, -1], [1.5, 4], [-0.8, -0.8]]) assert.equal(red((hall.tx + dx) * TILE, (hall.ty + dy) * TILE), 0, `nothing ${dx}, ${dy} tiles from its corner`);
  assert.ok(red(hall.tx * TILE - 8, (hall.ty + 1.5) * TILE) > 0 && red(hall.tx * TILE - 8, (hall.ty + 1.5) * TILE) < full, 'fading past its edge');
  // never less than the map's own dirt; nothing but red touched
  for (let i = 0; i < base.length; i++) assert.ok(mix.data[i * 4] >= base[i]);
  for (let i = 0; i < other.length; i++) if (i % 4) assert.equal(mix.data[i], other[i]);
  // the same from the same list in another order; and a building gone takes only its own earth
  const a = new Uint8Array(mix.data); wearMix(mix, base, [onTrack, mast, hall], { apron, seed: 7 }); assert.deepEqual(new Uint8Array(mix.data), a);
  wearMix(mix, base, [mast], { apron, seed: 7 });
  assert.equal(red((hall.tx + 1.5) * TILE, (hall.ty + 1.5) * TILE), 0, 'the hall\'s is gone');
  assert.equal(red((mast.tx + 1) * TILE, (mast.ty + 1) * TILE), 255);
  wearMix(mix, base, [], { apron, seed: 7 });
  for (let i = 0; i < base.length; i++) assert.equal(mix.data[i * 4], base[i]);
  // (the patch's own shape: 1 inside, 0 past its fade, whatever the waver)
  assert.equal(wornAt(11.5 * TILE, 9.5 * TILE, hall, 0.5), 1); assert.equal(wornAt((hall.tx - 1) * TILE, 9.5 * TILE, hall, -0.5), 0);
});
