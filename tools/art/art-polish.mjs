// The art polish's before/after sheets (2026-11-13; the design review's items: distinct silhouettes, lighter values,
// trim-only team color). Renders in the approved look (the polish at the game's camera and sun) on the countryside's
// grass tiles with the game's seat colors, and compares today's sprites (kept in old.json before the models change)
// with the branch's:
//   node tools/art/art-polish.mjs --save-old [item...]  before any model change: renders every sprite the items (all by default) touch into <out>/old.json
//   node tools/art/art-polish.mjs <item>...              one sheet per item at 1x, 2x (desktop) and 3x: per sprite, seat 0 above seat 1 below,
//                                                        today's facing E and S, then the new one facing E and S (a building once); a table
//                                                        of team share and the darkest material's luminance, before and after
//   node tools/art/art-polish.mjs contact [dir]         the contact sheets for the lead: per people at 1x and 3x, every changed sprite,
//                                                        before above, after below (default dir: <out>/contact)
// <out> is target/art-polish. Items: the keys of ITEMS below (the brief's numbers).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.js';
import { render3d } from './render3d.mjs';
import { tile } from './terrain3.js';
import { hash2 } from './raster.js';
import { canvas, half, resample, paste, label, makeScene } from './retheme-scene.mjs';

const argv = process.argv.slice(2), OUT = 'target/art-polish', OLD = join(OUT, 'old.json');
mkdirSync(OUT, { recursive: true });

/** The items and the sprites each touches (base names: a unit `<side>_<kind>`, a building `bldg_<side>_<kind>`, a
 *  ground piece `rt_...`). A building's turning head is drawn over it (HEADS). */
export const ITEMS = {
  1: ['bldg_kg_barracks', 'bldg_kg_stables'],
  2: ['kg_archer', 'kg_guard', 'kg_villager', 'ex_android', 'ex_veteran'],
  3: ['bldg_kg_blacksmith', 'ex_buggy', 'bldg_kg_castle', 'bldg_kg_tower'],
  4: ['bldg_ex_vortex', 'bldg_ex_turbine'],
  5: ['ex_launcher', 'ex_buggy', 'ex_drone', 'bldg_kg_castle', 'kg_balloon', 'kg_knight'],
  6: ['kg_knight', 'kg_rider', 'ex_drone', 'ex_launcher', 'ex_bot'],
  7: ['kg_ballista', 'bldg_kg_workshop'],
  8: ['bldg_ex_datahall', 'bldg_ex_uplink'],
  10: ['ex_mercenary', 'ex_veteran'],
  11: ['rt_kg_scaffold_2', 'rt_kg_scaffold_3', 'rt_ex_scaffold_2', 'rt_ex_scaffold_3'],
  12: ['rt_doodad_boulders_0', 'rt_doodad_boulders_1', 'rt_doodad_boulders_2'],
  13: ['ex_bot', 'ex_drone'], // (the follow-up round after #277: the Bot off the gold, the Drone's body and lighter shadow)
  14: ['bldg_ex_turbine'], // (after #277: the Wind turbine's blades without the blur disc)
};
const HEADS = { bldg_ex_vortex: 'ex_vortexhead_0', bldg_ex_turbine: 'ex_turbinehead_0', bldg_ex_uplink: 'ex_uplinkhead_0', bldg_kg_tower: 'kg_towerhead_4' };
const isUnit = (n) => /^(kg|ex)_/.test(n);
const DIRS = { E: 0, S: 4 };
/** The render names a base name expands to: a unit facing E and S (frame 0), a building or ground piece as it is, plus its head. */
const expand = (base) => (isUnit(base) ? Object.values(DIRS).map(d => `${base}_${d}_0`) : [base, ...(HEADS[base] ? [HEADS[base]] : [])]);
const ALL = [...new Set(Object.values(ITEMS).flat())];
const filterOf = (bases) => bases.flatMap(expand).map(n => `^${n}$`).join('|');

const pack = (s) => ({ ...s, img: undefined, w: s.img.w, h: s.img.h, data: Buffer.from(s.img.data).toString('base64') });
const unpack = (s) => ({ ...s, w: undefined, h: undefined, data: undefined, img: { w: s.w, h: s.h, data: new Uint8ClampedArray(Buffer.from(s.data, 'base64')) } });
if (argv.includes('--save-old')) {
  const only = argv.filter(a => ITEMS[a]), bases = only.length ? [...new Set(only.flatMap(i => ITEMS[i]))] : ALL;
  const t0 = Date.now(), old = await render3d(filterOf(bases), { polish: true });
  writeFileSync(OLD, JSON.stringify({ tints: old.tints, sprites: old.map(pack) }));
  console.log(`kept today's ${old.length} sprites in ${OLD} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(0);
}
if (!existsSync(OLD)) throw new Error(`${OLD} missing: run with --save-old before changing the models`);
const oldAll = JSON.parse(readFileSync(OLD, 'utf8')).sprites.map(unpack);
const oldName = (n) => `old_${n}`;
const asOld = (s) => ({ ...s, name: oldName(s.name), anim: s.anim && oldName(s.anim) });

// ---- the ground: the countryside's grass tiles ----
const T = 64, tiles = {}; const getTile = (v) => tiles[v] ??= tile(0, v);
function grass(c, seed) {
  const tw = Math.ceil(c.w / T) + 1, th = Math.ceil(c.h / T) + 1;
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const r = hash2(i, j, seed + 5), v = r > 0.9 ? 8 + Math.floor(hash2(i, j, seed + 6) * 12) : Math.floor(hash2(i, j, seed + 7) * 8), t = getTile(v);
    for (let y = 0; y < T; y++) { const py = j * T + y; if (py >= c.h) continue; for (let x = 0; x < T; x++) { const px = i * T + x; if (px >= c.w) continue; c.data.set(t.data.subarray((y * T + x) * 4, (y * T + x) * 4 + 4), (py * c.w + px) * 4); } }
  }
}
const save = (name, c) => writeFileSync(name, encodePNG(c));
const DARK = (c) => { for (let i = 0; i < c.data.length; i += 4) c.data.set([30, 30, 30, 255], i); return c; };

// ---- the measures ----
/** Luminance percentiles (0..255) of a sprite's solid pixels that are not the ground shadow (black): the darkest
 *  material is about the 10th percentile (the ink lines sit under it), the body the median. */
function values(P, name) {
  const { data } = P.get(name).img, L = [];
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] !== 255) continue; if (!data[i] && !data[i + 1] && !data[i + 2]) continue; L.push(0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]); }
  L.sort((a, b) => a - b); const q = (p) => Math.round(L[Math.min(L.length - 1, Math.floor(L.length * p))] ?? 0);
  return { p10: q(0.25), p50: q(0.5) }; // (`p10`: the 25th percentile since the first sheets: the lowest tenth is the ink lines and the shade faces under the harsh key, on every sprite)
}
function row(P, name, old) {
  const sh = P.share(name), v = values(P, name), [w, h] = P.size(name), o = old ? { sh: P.share(old), v: values(P, old) } : null;
  return `${name.padEnd(26)} team ${o ? `${o.sh.toFixed(3)} -> ` : ''}${sh.toFixed(3)}${sh < 0.06 ? ' LOW' : sh > 0.16 ? ' HIGH' : ''}   darkest p25 ${o ? `${o.v.p10} -> ` : ''}${v.p10}${v.p10 < 80 ? ' DARK' : ''}   mid ${o ? `${o.v.p50} -> ` : ''}${v.p50}   ${w}x${h} css px`;
}

/** One block: a sprite before and after, seat 0 above seat 1 below; a unit facing E and S each, a building once (its
 *  head over it). Returns the 2x canvas. */
function block(P, base, cell, neutral = false) {
  const names = expand(base).filter(n => !Object.values(HEADS).includes(n)), head = HEADS[base], cols = names.length * 2, seats = neutral ? [null] : [0, 1];
  const c = canvas(cols * cell.w, seats.length * cell.h + 24); grass(c, base.length * 13 + 7);
  const list = [];
  seats.forEach((seat, r) => names.forEach((n, k) => { for (const [j, nm] of [[k, oldName(n)], [names.length + k, n]]) list.push([nm, j * cell.w + cell.w / 2, 24 + r * cell.h + cell.h * cell.gy, seat, head ? (j < names.length ? oldName(head) : head) : undefined]); }));
  P.place(c, list);
  label(c, `${base}: ${neutral ? '' : 'SEAT 0 OVER SEAT 1; '}TODAY ${isUnit(base) ? 'E S ' : ''}| NEW ${isUnit(base) ? 'E S' : ''}`, 4, 4, 2);
  return c;
}
/** A sprite's cell: its box plus room, the ground point `gy` of the way down (a flyer's shadow lies well under it). */
function cellOf(P, base) {
  const names = expand(base).flatMap(n => [n, oldName(n)]).filter(n => P.has(n));
  let w = 0, h = 0, below = 0; for (const n of names) { const s = P.get(n); w = Math.max(w, s.img.w); h = Math.max(h, s.img.h); below = Math.max(below, s.img.h * (1 - s.anchor.y)); }
  return { w: w + 12, h: h + 12, gy: (h - below + 6) / (h + 12) };
}
function stack(blocks, title) {
  const W = Math.max(...blocks.map(b => b.w)), H = blocks.reduce((t, b) => t + b.h + 6, 0) + 30, c = DARK(canvas(W, H));
  label(c, title, 4, 4, 3); let y = 30; for (const b of blocks) { paste(c, b, 0, y); y += b.h + 6; }
  return c;
}
const three = (c, path) => { save(`${path}-2x.png`, c); save(`${path}-1x.png`, half(c)); save(`${path}-3x.png`, resample(c, 1.5)); };

/** The scene bound to today's sprites (as `old_*`) and the fresh render of `bases`. */
async function scene(bases) {
  const t0 = Date.now(), fresh = await render3d(filterOf(bases), { polish: true });
  console.log(`rendered ${fresh.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const want = new Set(bases.flatMap(expand).flatMap(n => [n, `${n}_m`]));
  const P = makeScene([...oldAll.filter(s => want.has(s.name)).map(asOld), ...fresh], fresh.tints);
  P.has = (n) => { try { P.get(n); return true; } catch { return false; } };
  return P;
}

if (argv[0] === 'contact') {
  const dir = argv[1] ?? join(OUT, 'contact'); mkdirSync(dir, { recursive: true });
  const P = await scene(ALL);
  for (const side of ['kg', 'ex']) {
    const bases = ALL.filter(b => b.includes(`${side}_`) || (side === 'kg' && b.startsWith('rt_doodad')));
    const cells = bases.map(b => cellOf(P, b)), W = cells.reduce((t, c) => t + c.w, 0), H = Math.max(...cells.map(c => c.h));
    const c = canvas(W, H * 2 + 28); grass(c, 99);
    const list = []; let x = 0;
    bases.forEach((b, k) => {
      const n = isUnit(b) ? `${b}_0_0` : b, head = HEADS[b], seat = b.startsWith('rt_doodad') ? null : 0, cell = cells[k];
      list.push([oldName(n), x + cell.w / 2, 28 + cell.h * cell.gy, seat, head && oldName(head)], [n, x + cell.w / 2, 28 + H + cell.h * cell.gy, seat, head]); x += cell.w;
    });
    P.place(c, list);
    label(c, `${side === 'kg' ? 'THE KINGDOM' : 'THE EXPEDITION'}: BEFORE (ABOVE) AND AFTER (BELOW), SEAT 0, FACING E. ${bases.join(' ')}`, 4, 4, 2);
    save(join(dir, `contact-${side}-1x.png`), half(c)); save(join(dir, `contact-${side}-3x.png`), resample(c, 1.5));
  }
  console.log('contact sheets ->', dir);
  process.exit(0);
}

const items = argv.filter(a => ITEMS[a]); if (!items.length) throw new Error(`which item? ${Object.keys(ITEMS).join(' ')}`);
const P = await scene([...new Set(items.flatMap(i => ITEMS[i]))]);
for (const it of items) {
  const bases = ITEMS[it], blocks = bases.map(b => block(P, b, cellOf(P, b), b.startsWith('rt_doodad')));
  three(stack(blocks, `ITEM ${it}: TODAY (LEFT) AGAINST THE NEW (RIGHT), POLISH, 40 DEG, ZOOM 1.0 AT 2X`), join(OUT, `item${it}`));
  console.log(`item ${it}: team share (mask px over solid px) and luminance, today -> new`);
  for (const b of bases) for (const n of expand(b)) console.log('  ' + row(P, n, oldName(n)));
}
console.log('sheets ->', OUT);
