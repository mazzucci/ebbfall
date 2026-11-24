// The new look's land (`?art=new`), pure (no DOM, no PixiJS): where every tree, rock and low plant stands on a map, and
// the ground's mix (grass, worn dirt, forest floor, scree) as a small image, from the map's blocked cells, the ground
// plan (gl/groundplan.js) and the seed alone, so every player sees the same land whoever sits where. Decoration only:
// the sim never sees it. Exact arithmetic only (+ - * / floor on doubles, integer hashes: ground.js `hash`, `noise`),
// no Math.random, no trig. gl/newlandgl.js draws it; test/newland.test.js checks it.
//
// The rule it keeps: where a unit cannot walk reads exactly. A piece that stands (a tree, a bush, a crag, a boulder)
// has its base inside blocked cells, whole; only its top may show over walkable ground, and no farther than the cap
// (`LAND.cap`, tiles): a walkable cell beside the blocked ground may be covered `cap` of a tile deep, the next one
// `cap - 1`, and so on (`allowance`). At the cap's edge shorter and narrower pieces are picked, then bushes. Low
// pieces (ferns, tufts, small stones: a unit walks over them) may lie past the edge.
import { hash, noise } from './ground.js';
import { PIECES, SLICE } from './newland-pieces.js';

export const TILE = 32;
/** Every tuned number of the placement. */
export const LAND = {
  /** How far a standing piece's top may reach over walkable ground, in tiles (`?landcap=` tries another; stills at
   *  0.5, 1 and 2 for the PM's choice). Half a tile: no walkable cell's center is ever under a crown, a unit at a
   *  forest's edge keeps its head and shoulders in the open, and the edge still reads as a wood (young trees and
   *  bushes in front, the tall ones from the second row). At 1 a unit beside a forest can be hidden to the neck. */
  cap: 0.5,
  /** A forest: a candidate spot per quarter cell (a 2x2 lattice a cell, each moved up to `jitter` px), kept this often:
   *  on cells beside walkable ground, inside a forest, and past the map's edge (the apron). `brush`: how often a
   *  cell at the wood's border gets a bush on its open side as well (undergrowth: the border is filled, not drawn),
   *  `brushWidth` px wide. */
  forest: { edge: 0.6, inside: 0.36, apron: 0.13, jitter: 10, scale: [0.82, 1.12], shrink: [1, 0.85, 0.7], brush: 0.8, brushWidth: [22, 30] },
  /** A hill: the widths (px) a crag, a boulder group and a small rock are scaled to; `clump`: the rock every cell at a
   *  hill's border gets first, wider than its cell (a blocked cell never reads as open gravel: a one-cell hill is a
   *  clump of rock); `core`: a rock's base, the middle share of its width that carries it (its flanks are loose
   *  stones and lean out over the edge, as far as the cap lets art go: half a tile; the base stays on blocked ground);
   *  `apart`: how near two rocks' ground points may be, of the sum of their widths (`deep`: a step north or south
   *  counts this much more, as a base is wider than deep); `jitter` px a spot is moved; `apron`: the spots tried past
   *  the map's rim. */
  hill: { crag: [54, 64], clump: [44, 52], boulder: [38, 48], small: [24, 30], core: 0.58, apart: 0.4, deep: 1.5, jitter: 10, apron: 0.3 },
  /** Low pieces past the edge: on a walkable cell beside a forest or a hill this often, at these scales. */
  low: { forest: 0.55, hill: 0.4, scale: [0.55, 0.8] },
  /** A unit's half width (px): a piece whose art, widened by it, reaches over walkable ground is drawn live, sorted
   *  with the units (one could stand behind it); the rest is laid once, under everything that moves. */
  reach: 12,
};

const KINDS = {};
PIECES.forEach((p, i) => (KINDS[p.kind] ||= []).push(i));
/** Whether a kind stands (it hides what is behind it and must keep to blocked ground) or lies low. */
export const stands = (kind) => kind === 'tree' || kind === 'bush' || kind === 'crag' || kind === 'boulder';
/** How wide a piece's base is at scale 1 (px): a rock's the core of its width (LAND.hill.core), anything else's as measured. */
export const baseWidth = (p) => (p.kind === 'crag' || p.kind === 'boulder' ? LAND.hill.core : 1) * p.fw;

/** A draw in [0, 1) for spot `site`, its `n`-th, on a map seeded `seed`. */
const draw = (site, n, seed) => hash(site * 16 + n, (seed | 0) * 31 + 101);

/**
 * How deep (px, 0 to TILE) a standing piece's art may cover each walkable cell: by its steps (through sides and
 * corners) to the nearest blocked cell, `cap` tiles in all. `blocked(x, y)` for any cell (past the map's edge: blocked).
 * A Float32Array of w x h; 0 on blocked cells.
 */
export function allowance(w, h, blocked, cap) {
  const out = new Float32Array(w * h), reach = Math.max(1, Math.ceil(cap));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (blocked(x, y)) continue;
    let d = reach + 1;
    for (let r = 1; r <= reach && d > reach; r++) {
      for (let k = -r; k <= r && d > reach; k++) if (blocked(x + k, y - r) || blocked(x + k, y + r) || blocked(x - r, y + k) || blocked(x + r, y + k)) d = r;
    }
    out[y * w + x] = Math.max(0, Math.min(1, cap - (d - 1))) * TILE;
  }
  return out;
}

/**
 * The land of a map of w x h tiles: `rock` (a byte a tile, as the sim's), `kindAt(x, y)` and its regions' kinds as
 * ground.js rockKinds gives them ('forest' or 'hill', also past the edge), `seed`, `apron` (tiles of blocked ground
 * laid past each edge), `cap` (tiles; LAND.cap), `wet(x, y)` (a tile under water: no low piece lies there). Returns `{ pieces, allow }`: `pieces` in drawing order (north to
 * south), each `{ i, x, y, s, z, live, low, apron }`: PIECES[i] with its ground point at (x, y) world px at scale s,
 * sorted by z (its base's middle line); `live`: it may hide a unit (drawn with the units); `low`: it lies flat
 * (a unit walks over it); `apron`: it stands past the map's edge.
 */
export function planLand({ w, h, rock, kindAt, seed, apron = 0, cap = LAND.cap, wet = null }) {
  const A = apron, W2 = w + 2 * A, inMap = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const blocked = (x, y) => !inMap(x, y) || rock[y * w + x] !== 0, walk = (x, y) => inMap(x, y) && rock[y * w + x] === 0;
  const allow = allowance(w, h, blocked, cap), out = [];
  const site = (cx, cy, k = 0) => ((cy + A) * W2 + (cx + A)) * 8 + k;
  const cell = (v) => Math.floor(v / TILE);
  /** Whether the rectangle (world px, right and bottom edges open) lies on blocked cells only. */
  const onBlocked = (x0, y0, x1, y1) => {
    for (let cy = cell(y0); cy <= cell(y1 - 1e-6); cy++) for (let cx = cell(x0); cx <= cell(x1 - 1e-6); cx++) if (!blocked(cx, cy)) return false;
    return true;
  };
  /** Whether art over the rectangle keeps to the cap: every walkable cell under it covered no deeper than allowed. */
  const underCap = (x0, y0, x1, y1) => {
    for (let cy = cell(y0); cy <= cell(y1 - 1e-6); cy++) for (let cx = cell(x0); cx <= cell(x1 - 1e-6); cx++) {
      if (!walk(cx, cy)) continue;
      const ix = Math.min(x1, (cx + 1) * TILE) - Math.max(x0, cx * TILE), iy = Math.min(y1, (cy + 1) * TILE) - Math.max(y0, cy * TILE);
      if (Math.min(ix, iy) > allow[cy * w + cx] - 1) return false; // (a px short of the allowance: at half a tile a cell's center stays clear)
    }
    return true;
  };
  const touchesWalk = (x0, y0, x1, y1) => {
    for (let cy = cell(y0); cy <= cell(y1 - 1e-6); cy++) for (let cx = cell(x0); cx <= cell(x1 - 1e-6); cx++) if (walk(cx, cy)) return true;
    return false;
  };
  const nearWalk = (cx, cy) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walk(cx + dx, cy + dy)) return true; return false; };
  /** Put PIECES[i] with its ground point at (x, y) at scale s, if its base is on blocked ground and its top under the
   *  cap; true if it stands. */
  const stand = (i, x, y, s) => {
    const p = PIECES[i], half = baseWidth(p) * s / 2;
    if (!onBlocked(x - half, y - p.fd * s, x + half, y) || !underCap(x - p.l * s, y - p.h * s, x + p.r * s, y)) return false;
    out.push({ i, x, y, s, z: p.kind === 'tree' ? y : y - p.fd * s / 2, low: false, apron: !inMap(cell(x), cell(y - 1e-6)),
      live: touchesWalk(x - p.l * s - LAND.reach, y - p.h * s, x + p.r * s + LAND.reach, y) });
    return true;
  };
  const lay = (i, x, y, s) => out.push({ i, x, y, s, z: y - PIECES[i].fd * s / 2, low: true, live: false, apron: !inMap(cell(x), cell(y - 1e-6)) });
  /** A base kept inside its own cell: the ground point moved the least that does it. */
  const inCell = (v, c, half) => Math.max(c * TILE + half + 0.5, Math.min((c + 1) * TILE - half - 0.5, v));

  const F = LAND.forest, HL = LAND.hill, trees = KINDS.tree, bushes = KINDS.bush, crags = KINDS.crag, boulders = KINDS.boulder, screes = KINDS.scree, lows = KINDS.low;
  const tk = (cx, cy) => (cy + A) * W2 + cx + A;
  const hill = (cx, cy) => cx >= -A && cy >= -A && cx < w + A && cy < h + A && blocked(cx, cy) && kindAt(cx, cy) === 'hill';
  for (let cy = -A; cy < h + A; cy++) for (let cx = -A; cx < w + A; cx++) {
    if (!blocked(cx, cy) || kindAt(cx, cy) !== 'forest') continue;
    const far = !inMap(cx, cy) && !nearWalk(cx, cy) && (cx < -1 || cy < -1 || cx > w || cy > h); // (the apron beyond the map's own rim: thinner)
    {
      const keep = nearWalk(cx, cy) ? F.edge : far ? F.apron : F.inside;
      let stood = 0;
      for (let k = 0; k < 4; k++) {
        const st = site(cx, cy, k);
        if (draw(st, 0, seed) >= keep) continue;
        const x0 = cx * TILE + 8 + (k & 1) * 16 + (draw(st, 1, seed) - 0.5) * F.jitter, y0 = cy * TILE + 8 + (k >> 1) * 16 + (draw(st, 2, seed) - 0.5) * F.jitter;
        const s0 = F.scale[0] + (F.scale[1] - F.scale[0]) * draw(st, 3, seed), first = Math.floor(draw(st, 4, seed) * trees.length);
        let done = false;
        // (the first tree of the round, from a drawn one, that stands here: at the cap's edge the narrow and the short)
        for (const sh of F.shrink) {
          for (let n = 0; n < trees.length && !done; n++) {
            const i = trees[(first + n) % trees.length], p = PIECES[i], s = s0 * sh;
            done = stand(i, inCell(x0, cx, p.fw * s / 2), Math.max(cy * TILE + p.fd * s + 0.5, y0), s);
          }
          if (done) break;
        }
        for (let n = 0; n < bushes.length && !done; n++) for (const sh of [1, 0.8]) { // (no tree fits: a bush, its base in its cell)
          const i = bushes[(first + n) % bushes.length], p = PIECES[i], s = Math.min(1, 30 / p.fw) * sh;
          if ((done = stand(i, inCell(x0, cx, p.fw * s / 2), Math.max(cy * TILE + p.fd * s + 0.5, y0), s))) break;
        }
        if (done) stood++;
      }
      // (never a blocked cell with nothing standing on it: a bush small enough to stand whole inside the cell)
      if (!stood && !far) { const i = bushes[Math.floor(draw(site(cx, cy, 4), 0, seed) * bushes.length)], p = PIECES[i]; stand(i, (cx + 0.5) * TILE, (cy + 1) * TILE - 1, Math.min(28 / p.w, 28 / p.h)); }
      // (undergrowth at the wood's border: a bush on each open side of the cell, its base in the cell)
      for (const [n, [dx, dy]] of [[0, 1], [1, 0], [-1, 0], [0, -1]].entries()) {
        const st = site(cx, cy, 7) * 4 + n;
        if (!walk(cx + dx, cy + dy) || draw(st, 0, seed) >= F.brush) continue;
        const i = bushes[Math.floor(draw(st, 1, seed) * bushes.length)], p = PIECES[i], s = (F.brushWidth[0] + (F.brushWidth[1] - F.brushWidth[0]) * draw(st, 2, seed)) / p.w, t = (draw(st, 3, seed) - 0.5) * 0.6;
        const x = (cx + 0.5 + dx * 0.3 + (dx ? 0 : t)) * TILE, y = (cy + 0.5 + dy * 0.3 + (dy ? 0 : t)) * TILE + p.fd * s / 2;
        stand(i, inCell(x, cx, p.fw * s / 2), Math.max(cy * TILE + p.fd * s + 0.5, Math.min((cy + 1) * TILE - 0.5, y)), s);
      }
    }
  }
  // A hill: rock over all of it. First a clump on every cell at its border, wider than the cell, its foot on the
  // cell's south edge: the border is said by rock, not by a line. Then three rounds over a lattice of spots (four a
  // cell), the largest first: crags, boulder groups, small rocks; a rock only where it keeps its distance from those
  // standing (`apart` of their widths: they overlap into one mass).
  const near = new Array(W2 * (h + 2 * A)); // (cell -> the rocks whose ground point is in it)
  const clear = (x, y, fw) => {
    for (let cy = Math.max(-A, cell(y) - 2); cy <= Math.min(h + A - 1, cell(y) + 2); cy++) for (let cx = Math.max(-A, cell(x) - 2); cx <= Math.min(w + A - 1, cell(x) + 2); cx++) for (const o of near[tk(cx, cy)] || []) {
      const d = HL.apart * (fw + o.fw), dx = x - o.x, dy = (y - o.y) * HL.deep;
      if (dx * dx + dy * dy < d * d) return false;
    }
    return true;
  };
  const rocks = [...boulders, ...crags];
  for (let cy = -1; cy <= h; cy++) for (let cx = -1; cx <= w; cx++) {
    if (!hill(cx, cy) || !nearWalk(cx, cy)) continue;
    const st = site(cx, cy, 4), i = rocks[Math.floor(draw(st, 0, seed) * rocks.length)], p = PIECES[i], fw0 = HL.clump[0] + (HL.clump[1] - HL.clump[0]) * draw(st, 1, seed);
    for (const sh of [1, 0.88, 0.76, 0.6]) { // (as wide as the cap lets it lean; smaller where a walkable cell is close on two sides)
      const fw = fw0 * sh, s = fw / p.fw, half = baseWidth(p) * s / 2;
      const x = inCell((cx + 0.5) * TILE + (draw(st, 2, seed) - 0.5) * 6, cx, half), y = (cy + 1) * TILE - 1 - draw(st, 3, seed) * 3;
      if (!stand(i, x, y, s)) continue;
      (near[tk(cx, cy)] ||= []).push({ x, y, fw: fw * 0.8 }); // (the rounds after may stand a little nearer it than to each other)
      break;
    }
  }
  for (const [round, list, fit] of [[0, crags, HL.crag], [1, boulders, HL.boulder], [2, rocks, HL.small]]) {
    for (let cy = -A; cy < h + A; cy++) for (let cx = -A; cx < w + A; cx++) {
      if (!hill(cx, cy)) continue;
      const far = !inMap(cx, cy) && !nearWalk(cx, cy) && (cx < -1 || cy < -1 || cx > w || cy > h);
      for (let k = 0; k < 4; k++) {
        const st = site(cx, cy, k) * 4 + round;
        if (far && draw(st, 0, seed) >= HL.apron) continue;
        const i = list[Math.floor(draw(st, 1, seed) * list.length)], p = PIECES[i], fw = fit[0] + (fit[1] - fit[0]) * draw(st, 2, seed), s = fw / p.fw;
        const x = cx * TILE + 8 + (k & 1) * 16 + (draw(st, 3, seed) - 0.5) * HL.jitter, y = cy * TILE + 16 + (k >> 1) * 16 + (draw(st, 4, seed) - 0.5) * HL.jitter;
        if (!clear(x, y, fw) || !stand(i, x, y, s)) continue;
        (near[tk(cell(x), cell(y))] ||= []).push({ x, y, fw });
      }
    }
  }
  // Low pieces past the edge: ferns and tufts beside a forest, small stones beside a hill, half over the line.
  const L = LAND.low;
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    if (!walk(cx, cy) || (wet && wet(cx, cy))) continue;
    const st = site(cx, cy, 6), dirs = [[0, 1], [1, 0], [-1, 0], [0, -1]], from = Math.floor(draw(st, 0, seed) * 4);
    for (let n = 0; n < 4; n++) {
      const [dx, dy] = dirs[(from + n) % 4]; if (!blocked(cx + dx, cy + dy)) continue;
      const kind = kindAt(cx + dx, cy + dy), list = kind === 'forest' ? lows : screes;
      if (draw(st, 1, seed) >= (kind === 'forest' ? L.forest : L.hill)) break;
      const i = list[Math.floor(draw(st, 2, seed) * list.length)], s = L.scale[0] + (L.scale[1] - L.scale[0]) * draw(st, 3, seed), t = draw(st, 4, seed) - 0.5;
      lay(i, (cx + 0.5 + dx * 0.5 + (dx ? 0 : t * 0.7)) * TILE, (cy + 0.5 + dy * 0.5 + (dy ? 0 : t * 0.7)) * TILE + PIECES[i].fd * s / 2, s);
      break;
    }
  }
  // (drawing order: by the base's middle line, then west to east, then as placed: total)
  const order = out.map((o, n) => [o, n]).sort((a, b) => a[0].z - b[0].z || a[0].x - b[0].x || a[1] - b[1]).map(([o]) => o);
  return { pieces: order, allow };
}

/** The texels a tile of the ground's mix. */
export const MIX_K = 4;
/** Where the forest floor and the scree begin and are full, between a walkable cell's middle (0) and a blocked one's
 *  (1; the cells' border is 0.5): they fade out over about half a tile past the border, along an outline of the
 *  blocked cells that linear blending rounds by about half a cell at every corner, wobbled a little by the seed. The
 *  ground's contact shadow follows the same outline (gl/newlandgl.js GROUND.rim). */
export const MIX_RIM = [0.08, 0.62];
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * The ground's mix for a map of w x h tiles with `apron` tiles past each edge: an RGBA image of MIX_K texels a tile,
 * `(w + 2 apron) MIX_K` across: red how much worn dirt (the plan's `dirt`, 0-1 a tile), green forest floor, blue
 * scree (the blocked cells by kind, full on them, fading out over about half a tile past their border: MIX_RIM;
 * wobbled by an eighth of a tile at most); alpha how dry: 255 on land, 0 on tiles under water (`wet(x, y)`; the
 * line a little to the land's side, so the shore's first px take the water's ground too). Drawn linear-filtered:
 * `{ w, h, k, data }`. `mines`: the gold mines' tiles (`{ tx, ty, w, h }`): full worn dirt on them.
 */
export function groundMix({ w, h, rock, kindAt, dirt, seed, apron = 0, wet = null, mines = [] }) {
  const A = apron, W2 = w + 2 * A, H2 = h + 2 * A, n = W2 * H2, fo = new Float32Array(n), hi = new Float32Array(n), di = new Float32Array(n), we = new Float32Array(n);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const cx = x - A, cy = y - A, inside = cx >= 0 && cy >= 0 && cx < w && cy < h, i = y * W2 + x;
    if (!inside || rock[cy * w + cx]) { if (kindAt(cx, cy) === 'forest') fo[i] = 1; else hi[i] = 1; } else if (wet && wet(cx, cy)) we[i] = 1; else di[i] = dirt ? dirt[cy * w + cx] : 0;
  }
  // (a gold mine's tiles: trodden earth all over its square, whatever the plan laid there)
  for (const m of mines) for (let y = m.ty; y < m.ty + m.h; y++) for (let x = m.tx; x < m.tx + m.w; x++) if (x >= 0 && y >= 0 && x < w && y < h && !rock[y * w + x]) di[(y + A) * W2 + x + A] = 1;
  const k = MIX_K, W = W2 * k, H = H2 * k, data = new Uint8ClampedArray(W * H * 4), so = (seed | 0) % 977;
  // (what a cell and its neighbors hold: 0 nothing, so plain grass; 1 forest all round, 2 hill all round, 4 water all
  // round; 3 an edge or dirt)
  const state = new Uint8Array(n);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    let f = 0, s = 0, d = 0, c = 0, q = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = Math.max(0, Math.min(W2 - 1, x + dx)), Y = Math.max(0, Math.min(H2 - 1, y + dy)), i = Y * W2 + X;
      f += fo[i]; s += hi[i]; q += we[i]; if (di[i] > 0) d++; c++;
    }
    state[y * W2 + x] = f === c ? 1 : s === c ? 2 : q === c ? 4 : f + s + d + q === 0 ? 0 : 3;
  }
  const cl = (v, m) => (v < 0 ? 0 : v > m ? m : v);
  for (let ty = 0; ty < H; ty++) {
    const fy = (ty + 0.5) / k - 0.5, y0 = Math.floor(fy), v = fy - y0, r0 = cl(y0, H2 - 1) * W2, r1 = cl(y0 + 1, H2 - 1) * W2, cy = Math.floor(ty / k) * W2;
    for (let tx = 0; tx < W; tx++) {
      const o = (ty * W + tx) * 4, st = state[cy + Math.floor(tx / k)];
      data[o + 3] = 255;
      if (st === 0) continue;
      if (st === 4) { data[o + 3] = 0; continue; }
      if (st < 3) { data[o + st] = 255; continue; }
      const fx = (tx + 0.5) / k - 0.5, x0 = Math.floor(fx), u = fx - x0, c0 = cl(x0, W2 - 1), c1 = cl(x0 + 1, W2 - 1);
      const wa = (1 - u) * (1 - v), wb = u * (1 - v), wc = (1 - u) * v, wd = u * v, a = r0 + c0, b = r0 + c1, c = r1 + c0, e = r1 + c1;
      const f = fo[a] * wa + fo[b] * wb + fo[c] * wc + fo[e] * wd, s = hi[a] * wa + hi[b] * wb + hi[c] * wc + hi[e] * wd, d = di[a] * wa + di[b] * wb + di[c] * wc + di[e] * wd;
      const m = we[a] * wa + we[b] * wb + we[c] * wc + we[e] * wd;
      if (m > 0) data[o + 3] = Math.round(255 * (1 - smooth(0.2, 0.5, m)));
      if (f <= 0 && s <= 0 && d <= 0) continue;
      const wob = noise(fx * 2.3 + so, fy * 2.3 - so) - 0.5;
      data[o] = Math.round(255 * smooth(0.22, 0.78, d + (d > 0.02 ? wob * 0.3 : 0)));
      data[o + 1] = Math.round(255 * smooth(MIX_RIM[0], MIX_RIM[1], f + (f > 0 && f < 1 ? wob * 0.22 : 0)));
      data[o + 2] = Math.round(255 * smooth(MIX_RIM[0], MIX_RIM[1], s + (s > 0 && s < 1 ? wob * 0.22 : 0)));
    }
  }
  return { w: W, h: H, k, data };
}

/**
 * How the standing pieces of a plan cover the walkable cells, from the pieces' measured profiles (the table's `rows`):
 * for test/newland.test.js and the numbers reported. `{ share, center, deep }`: per cell (w x h) the share of its
 * area under a standing piece's art (on a 4 px grid), whether its center is under one, and the deepest any one piece
 * reaches into it (px: the lesser of how wide and how tall that piece's art over the cell is).
 */
export function cover(w, h, pieces) {
  const G = TILE / 4, bits = new Uint8Array(w * G * h * G), deep = new Float32Array(w * h);
  for (const o of pieces) {
    const p = PIECES[o.i]; if (!stands(p.kind)) continue;
    const box = new Map(); // (cell -> [x0, y0, x1, y1] of this piece's art over it)
    p.rows.forEach(([l, r], n) => {
      const y1 = o.y - n * SLICE * o.s, y0 = Math.max(y1 - SLICE * o.s, o.y - p.h * o.s), x0 = o.x - l * o.s, x1 = o.x + r * o.s; // (the top slice: as far as the piece is tall)
      if (x1 <= x0) return;
      for (let gy = Math.floor(y0 / 4); gy <= Math.floor((y1 - 1e-6) / 4); gy++) for (let gx = Math.floor(x0 / 4); gx <= Math.floor((x1 - 1e-6) / 4); gx++) {
        if (gx < 0 || gy < 0 || gx >= w * G || gy >= h * G) continue;
        if ((gx + 0.5) * 4 >= x0 && (gx + 0.5) * 4 < x1 && (gy + 0.5) * 4 >= y0 && (gy + 0.5) * 4 < y1) bits[gy * w * G + gx] = 1; // (a grid square by its middle)
      }
      for (let cy = Math.floor(y0 / TILE); cy <= Math.floor((y1 - 1e-6) / TILE); cy++) for (let cx = Math.floor(x0 / TILE); cx <= Math.floor((x1 - 1e-6) / TILE); cx++) {
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        const k = cy * w + cx, b = box.get(k), c = [Math.max(x0, cx * TILE), Math.max(y0, cy * TILE), Math.min(x1, (cx + 1) * TILE), Math.min(y1, (cy + 1) * TILE)];
        if (!b) box.set(k, c); else { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[2]); b[3] = Math.max(b[3], c[3]); }
      }
    });
    for (const [k, b] of box) deep[k] = Math.max(deep[k], Math.min(b[2] - b[0], b[3] - b[1]));
  }
  const share = new Float32Array(w * h), center = new Uint8Array(w * h);
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    let c = 0; for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) c += bits[(cy * G + y) * w * G + cx * G + x];
    share[cy * w + cx] = c / (G * G);
    const m = G / 2; center[cy * w + cx] = bits[(cy * G + m) * w * G + cx * G + m] && bits[(cy * G + m - 1) * w * G + cx * G + m - 1] && bits[(cy * G + m - 1) * w * G + cx * G + m] && bits[(cy * G + m) * w * G + cx * G + m - 1] ? 1 : 0;
  }
  return { share, center, deep };
}
