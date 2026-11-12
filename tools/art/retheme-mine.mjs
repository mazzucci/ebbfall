// The gold mine's review pictures (tools/render3d/mine.js; 2026-11-11): node tools/art/retheme-mine.mjs [outdir]
// Renders the three stages in the approved look (the polish at the game's 40-degree camera and 420 sun) and writes,
// on the real countryside tiles (terrain3.js grass), to <outdir> (default target/mine-review/round-1):
//   stages.png      the three stages large: at 4x (nearest-neighbor doubled from 2x), at 2x and at 1x (CSS px)
//   scene-100.png   a landscape phone at zoom 1.0 (1688x780 at 2x): the three mines between a Castle and a Data
//                   center, a Barracks below them for the size, Villagers at the full mine, Bots at the low one; -1x the CSS-px copy, -grey in grayscale
//   scene-075.png   the same scene at zoom 0.75 (+ -1x)
//   alone/<stage>.png  each stage alone at 1x on grass, no label (for a cold look)
// Prints each stage's drawn size (CSS px at zoom 1.0), how far it rises over its footprint's (MINE_N tiles) north edge, and the gold's
// share of its solid pixels (the stages must step).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, half, resample, crop, paste, grey, meanValue, label, makeScene } from './retheme-scene.mjs';
import { seatTints } from './retheme-paint.mjs';
import { groundTile } from '../../src/client/gl/ground.js';
import { mulberry } from '../../src/engine/util.js';
const MINE_N = 2; // (mine.js MINE_N; the model's module needs the page's canvas, so the number is copied here)

const argv = process.argv.slice(2);
const outDir = argv.find(a => !a.startsWith('--')) ?? 'target/mine-review/round-1';
mkdirSync(join(outDir, 'alone'), { recursive: true });
const T = 64, W = 1688, H = 780;
const STAGES = ['full', 'low', 'empty'], NAMES = STAGES.map(s => `rt_mine_${s}`);
const FILTER = '^rt_mine_|^bldg_(kg_castle|kg_barracks|ex_hall)$|^kg_villager_(0|1|15|9|4)_[01]$|^kg_guard_0_0$|^ex_bot_(8|9|7|0|12)_[01]$|^ex_marine_8_0$';
const t0 = Date.now();
const sprites = await render3d(FILTER, { polish: true });
console.log(`rendered ${sprites.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const P = makeScene(sprites, seatTints(sprites.tints));

// ---- the ground: the countryside's grass tiles, picked as the client picks them (retheme-ground.mjs's open ground) ----
const tiles = {}; const getTile = (v) => tiles[v] ??= tile(0, v);
const MARK_SCALE = 0.35;
function grassVariant(r, i, j, seed) { let v = groundTile(r, i, j, seed, false); if (v >= 8 && hash2(i, j, seed + 77) > MARK_SCALE) v = Math.floor(hash2(i, j, seed + 78) * 8); return v; }
function grass(c, seed) {
  const rnd = mulberry(seed * 7 + 3), tw = Math.ceil(c.w / T) + 1, th = Math.ceil(c.h / T) + 1;
  for (let j = -1; j < th; j++) for (let i = -1; i < tw; i++) {
    const t = getTile(grassVariant(rnd(), i, j, seed)), x0 = i * T + T / 2, y0 = j * T + T / 2;
    for (let y = 0; y < T; y++) { const py = y0 + y; if (py < 0 || py >= c.h) continue; for (let x = 0; x < T; x++) { const px = x0 + x; if (px < 0 || px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), ((py) * c.w + px) * 4); } }
  }
}
const save = (name, c) => writeFileSync(join(outDir, name), encodePNG(c));
function scale2(c) { const o = canvas(c.w * 2, c.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(c.data.subarray(((y >> 1) * c.w + (x >> 1)) * 4, ((y >> 1) * c.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4); return o; }
const DARK = (c) => { for (let i = 0; i < c.data.length; i += 4) c.data.set([30, 30, 30, 255], i); return c; };

// ---- the measures: drawn size, the rise over the footprint, the gold's share ----
console.log('each stage at zoom 1.0 (CSS px): its box, how far its top rises over the footprint\'s north edge, the gold\'s share of its solid pixels');
const measures = {};
for (const name of NAMES) {
  const sp = P.get(name), { w, h, data } = sp.img, ay = sp.anchor.y * h;
  let top = h, x0 = w, x1 = -1, n = 0, gold = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (data[i + 3] !== 255 || !(data[i] | data[i + 1] | data[i + 2])) continue;
    n++; top = Math.min(top, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    if (data[i] > 150 && data[i + 1] > 110 && data[i + 2] < 120 && data[i] - data[i + 2] > 70) gold++;
  }
  const [bw, bh] = P.size(name), rise = (ay - top) / 2 - MINE_N * 16; // (the footprint's north edge is N * 16 game px north of the anchor, drawn as many CSS px up: the ground is square on screen)
  measures[name] = { w: bw, h: bh, rise: +rise.toFixed(1), gold: +(gold / n).toFixed(3) };
  console.log(`  ${name.padEnd(14)} ${bw} x ${bh}   rises ${rise.toFixed(0)} px over the footprint's north edge   gold ${(gold / n * 100).toFixed(1)}%`);
}
writeFileSync(join(outDir, 'measures.json'), JSON.stringify(measures, null, 1));

// ---- stages.png: each stage at 4x, 2x and 1x ----
{
  const C4 = 300, cell = (name, n) => { const c = canvas(C4, C4); grass(c, 7 + n); P.draw(c, name, C4 / 2, C4 / 2 + 50); return c; };
  const two = NAMES.map((nm, k) => cell(nm, k)), four = two.map(scale2), one = two.map(half);
  const out = DARK(canvas(C4 * 2 * 3 + 16, C4 * 2 + C4 + C4 / 2 + 60));
  four.forEach((c, k) => paste(out, c, k * (C4 * 2 + 8), 0));
  two.forEach((c, k) => paste(out, c, k * (C4 + 8), C4 * 2 + 8));
  one.forEach((c, k) => paste(out, c, C4 * 3 + 40 + k * (C4 / 2 + 8), C4 * 2 + 8));
  STAGES.forEach((st, k) => label(out, `${st.toUpperCase()}  GOLD ${(measures[NAMES[k]].gold * 100).toFixed(0)}%`, k * (C4 * 2 + 8) + 6, C4 * 2 - 30, 3));
  label(out, 'THE GOLD MINE: FULL, LOW, EMPTY AT 4X; BELOW AT 2X (LEFT) AND AT 1X, A PHONE\'S SIZE (RIGHT)', 6, C4 * 3 + 20, 3);
  save('stages.png', out);
}

// ---- the scene: zoom 1.0 and 0.75 ----
const BW = 2250, BH = 1040;
const SCENE = [
  ['bldg_kg_castle', 380, 560, 0], ['bldg_kg_barracks', 1150, 790, 0], ['bldg_ex_hall', 1880, 560, 1],
  ['rt_mine_full', 830, 520], ['rt_mine_low', 1150, 530], ['rt_mine_empty', 1470, 520],
  ['kg_villager_1_0', 760, 600, 0], ['kg_villager_0_1', 800, 640, 0], ['kg_villager_15_0', 870, 630, 0], ['kg_villager_9_1', 700, 560, 0], ['kg_villager_4_0', 840, 680, 0], ['kg_guard_0_0', 620, 700, 0],
  ['ex_bot_8_0', 1040, 640, 1], ['ex_bot_9_1', 1290, 630, 1], ['ex_bot_7_0', 1320, 700, 1], ['ex_bot_12_1', 1560, 640, 1], ['ex_bot_0_0', 1700, 620, 1], ['ex_marine_8_0', 1620, 700, 1],
];
{
  const b = canvas(BW, BH); grass(b, 4242); P.place(b, SCENE);
  const z100 = crop(b, (BW - W) / 2, (BH - H) / 2, W, H);
  for (const st of STAGES) { const c = canvas(260, 300); grass(c, 11); P.draw(c, `rt_mine_${st}`, 130, 190); save(join('alone', `${st}.png`), half(c)); }
  save('scene-100-grey.png', grey(z100));
  label(z100, `CASTLE, THE MINE FULL / LOW / EMPTY, DATA CENTER, A BARRACKS BELOW; VILLAGERS AND BOTS. ZOOM 1.0  GROUND ${meanValue(z100, 0, H).toFixed(2)}`, 12, 12, 2);
  save('scene-100.png', z100); save('scene-100-1x.png', half(z100));
  const r = resample(b, 0.75), z075 = crop(r, (r.w - W) / 2, (r.h - H) / 2, W, H);
  label(z075, 'THE SAME AT ZOOM 0.75', 12, 12, 2);
  save('scene-075.png', z075); save('scene-075-1x.png', half(z075));
}
console.log('mine pictures ->', outDir);
