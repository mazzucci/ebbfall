// The new look's units (`?art=new`, src/client/gl/newart.js), packed into public/art/new/unit-<n>.webp + .json with the
// `unit` entry of public/art/new/index.json (the other groups' entries are kept). One table (UNITS) says where each of
// the fifteen kinds comes from and which of its frames is what:
//  - a folder of finished frames, <EBBFALL_PICTURES>/units3d/frames/<from>/ with its frames.json (rendered and painted
//    in the article folder: 2 px a game px, a true 31-degree camera with the facings at equal angles on screen, the
//    shadow baked, a team mask each, already in the new look's light: no tone curve here);
//  - `guard3d`, off unless named: the Guard's own 3D model (guard.js on the rig, stage.js), rendered here in headless
//    Chromium, its textures rectangles of a design sheet read from <EBBFALL_PICTURES>/units/ as it runs.
// EBBFALL_PICTURES defaults to the article folder's nano-test. Nothing is written in the pictures' folder; the pages
// this writes are the only pictures of it that go in the repo.
//   node tools/newart/unit/build.mjs --webp q90   every unit of the table whose folder is whole (a folder without all
//                                               its frames is left out with a line saying so: today's art stays): the
//                                               pack that ships
//     --from bot=p_bot3,rover=p_rover  another folder for a row (a unit painted again, or an older one to compare)
//   node tools/newart/unit/build.mjs guard bot  only these (a trial: the pack holds no other unit; use --out)
//     --webp q90       the pages as lossy WebP at that quality (alpha kept exact) instead of lossless
//     --out DIR        another folder than public/art/new (its own index.json)
//     --check FILE     also a contact sheet per unit (PNG; `%` in FILE is the unit's name): every facing and frame in
//                      seat 0's paint on grass, a cross on the ground point, at the page's scale and at half
//     --fresh          render the model again even when target/newart/cache holds these very frames
//     --scale 3|4 --walk 2 --elev 30.8 --true   the model's trials (frame folders are 2 px a game px only)
// Same pictures, same pack.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../../chromium.mjs';
import { encodeWebP } from '../../art/webp.mjs';
import { encodePNG, decodePNG } from '../../art/png.js';
import { SHADOW } from '../tone.mjs';
import { stamp } from '../bytes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../../..');
const PICTURES = process.env.EBBFALL_PICTURES || '/home/mazzucci/projects/ebbfall-article/nano-test';
const VALUED = ['--scale', '--walk', '--elev', '--webp', '--out', '--check', '--px', '--from'];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; }, flag = (k) => process.argv.includes(k);
const NAMED = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !VALUED.includes(all[i - 1]));

// ---------------------------------------------------------------- the tuned numbers
const Z = +arg('--scale', 2), WALK = +arg('--walk', 4);
/**
 * The units: a row's name -> where it comes from, the game's kind (src/engine/constants.js) and which frame is what.
 *  `from`   its folder under units3d/frames (`--from name=folder` names another);
 *  `stand`  the pose a standing unit holds (the game's frame 0);
 *  `walk`   the march, the roll or the rotor (frames 1..n; with no `stand`, frames 0..n-1, cycled as today's); a
 *           frame named twice, or the standing one named in it, is one picture under several names;
 *  `strike` [wind, strike]: a melee unit's two poses (look.js STRIKE: `_wind`, `_strike`);
 *  `fire`   { aim, shot, after }: a shooter with its target in reach, as its shot leaves, just after (`_aim`, `_shot`, `_after`);
 *  `carry`  { stand, walk }: a worker with a load (`_c0`, `_c1`..);  `work` [raised, struck]: a builder at its site (`_k0`, `_k1`);
 *  `set`    a unit set up or setting up (look.js UNIT_POSE: `_set`);
 *  `top`    its drawn height above its ground point (game px) where the measure is wrong (see unitTop);
 *  `fps`    the walk's frames a second where today's 8 is wrong (the horses' four frames: a first guess, not measured
 *           against their stride);
 *  `model`  the unit rendered here from that file (stage.js), `px` its 2x-sprite px per model unit, `cell` the room a
 *           frame is shot in (game px, the ground point at ax, ay); `off`: packed only when named.
 * Whatever a source lacks of today's frames of its kind takes its standing frame (no new body ever wears an old pose).
 * Not used: the Bot's `f_k0`, `f_k1` (working with a full bin): the client has no such pose.
 * Sizes are the frames' own (each frames.json's `drawn`); the client draws them at 1 (gl/newart.js UNIT_SIZE).
 */
// (a man's walk: his two strides with the standing pose between them, as the painter's own walk shows: four frames of
// three pictures, at today's 8 a second: two steps in half a second, about a stride a step at these units' 78 to 92 px a second)
const W2 = ['w0', 'idle', 'w1', 'idle'], W4 = ['w0', 'w1', 'w2', 'w3'], MELEE = ['wind', 'strike'];
const UNITS = {
  villager: { from: 'p_villager', kind: 'harvester', stand: 'idle', walk: W2, carry: { stand: 'c_idle', walk: ['c_w0', 'c_idle', 'c_w1', 'c_idle'] }, work: ['k0', 'k1'] },
  guard: { from: 'p_guard', kind: 'trooper', stand: 'idle', walk: W2, strike: MELEE },
  archer: { from: 'p_archer', kind: 'lancer', stand: 'idle', walk: W2, fire: { aim: 's0', shot: 's1' } },
  rider: { from: 'p_rider', kind: 'rider', stand: 'idle', walk: W4, strike: MELEE, fps: 10 },
  knight: { from: 'p_knight', kind: 'knight', stand: 'idle', walk: W4, strike: MELEE, fps: 8 },
  ballista: { from: 'p_ballista', kind: 'bastion', stand: 'idle', walk: ['r0', 'r1'], fire: { aim: 'drawn', shot: 'fired' } },
  cannon: { from: 'p_cannon', kind: 'siegeTank', stand: 'idle', walk: ['r0', 'r1'], set: 'setup', fire: { shot: 'fire' } },
  balloon: { from: 'p_balloon', kind: 'observer', walk: ['idle'] },
  bot: { from: 'p_bot3', kind: 'lumen', stand: 'e_idle', walk: ['e_d0', 'e_d1'], carry: { stand: 'f_idle', walk: ['f_d0', 'f_d1'] }, work: ['e_k0', 'e_k1'] },
  buggy: { from: 'p_buggy', kind: 'scythe', stand: 'idle', walk: ['d0', 'd1'], fire: { shot: 's0', after: 's1' } },
  sellsword: { from: 'p_sellsword', kind: 'prism', stand: 'idle', walk: W2, strike: MELEE },
  bruiser: { from: 'p_bruiser', kind: 'bruiser', stand: 'idle', walk: W2, strike: MELEE },
  android: { from: 'p_android', kind: 'umbra', stand: 'idle', walk: W2, fire: { aim: 's0', shot: 's1' } },
  rover: { from: 'p_rover', kind: 'monolith', stand: 'idle', walk: ['d0', 'd1'], fire: { aim: 'aim', shot: 'shoot' } },
  drone: { from: 'p_drone', kind: 'shrike', walk: ['r0', 'r1', 'r2', 'r3'] },
  guard3d: { off: true, model: 'guard', kind: 'trooper', px: +arg('--px', 0.655), stand: 'idle', walk: WALK === 2 ? ['w0', 'w2'] : W4, strike: MELEE, fps: WALK === 2 ? 7 : 14, cell: { w: 200, h: 170, ax: 100, ay: 110 } },
};
for (const pair of arg('--from', '').split(',').filter(Boolean)) { const [name, dir] = pair.split('='); if (!UNITS[name] || !dir) throw new Error(`--from ${pair}: no such row`); UNITS[name].from = dir; }
/** The model's stage (stage.js setup): the flat map's camera, as the frame folders' (40 degrees, the ground square).
 *  `shadow`: the model's silhouette laid 0.38 across and 0.12 down for each px of height on the ground (the frame
 *  folders' sun: a third of the drawn height), tone.mjs's cool dark blue, its edge a quarter of a game px soft.
 *  `edge`: the darker line round the body, game px. `tone`: the pack curve on the body, for a model lit the overcast
 *  way; this one is lit as the other units are, so it is off (never both). */
const VIEW = {
  Z, SS: 3, elev: +arg('--elev', 40), square: !flag('--true'), tone: flag('--tone'),
  shadow: { len: SHADOW.reach, dir: [0.38, 0.12], color: SHADOW.color, alpha: SHADOW.alpha, soft: 0.25 },
  edge: { px: 0.5, soft: 0.35, alpha: 0.7, color: '#141a22' },
};
const FACINGS = 16, PAGE = 2048, GAP = 2 * Z, BLEED = Z;  // the pages' size limit; the gap between frames (mip levels 0 to 2 clean at any scale); the color bled under clear pixels
const BODY = 0.35;                                        // unitTops: count rows at least this wide relative to the widest, so a raised spear doesn't set the height
const OUT = resolve(arg('--out', join(REPO, 'public/art/new')));
const LOSSY = /^q(\d+)$/.exec(arg('--webp', ''))?.[1];

// ---------------------------------------------------------------- the sources
/** A folder's frames: { cell, list: [{ k, pose, img, mask }] } (img, mask: { x, y, w, h, data } in the cell's 2x px,
 *  the mask cut to its paint), or a string saying what is missing. */
function folder(name) {
  // (its index: frames.json, or <name>.json beside it where that one is the newer)
  const dir = join(PICTURES, 'units3d/frames', name), own = join(dir, 'frames.json'), other = join(dir, `${name}.json`);
  const file = existsSync(other) && (!existsSync(own) || statSync(other).mtimeMs > statSync(own).mtimeMs) ? other : own;
  if (!existsSync(file)) return 'no frames.json';
  const J = JSON.parse(readFileSync(file, 'utf8')), list = [];
  if (J.facings !== FACINGS) return `${J.facings} facings`;
  for (let k = 0; k < FACINGS; k++) for (const pose of J.frames) {
    const key = `${k}_${pose}`, r = J.rects[key], png = join(dir, key + '.png'), m = join(dir, key + '_m.png');
    if (!r || !existsSync(png) || !existsSync(m)) return `frame ${key} is not there yet`;
    const im = decodePNG(readFileSync(png)), mk = decodePNG(readFileSync(m));
    if (im.w !== r[2] || im.h !== r[3] || mk.w !== r[2] || mk.h !== r[3]) return `frame ${key} is not its rect's size`;
    // the mask cut to its paint
    let x0 = mk.w, y0 = mk.h, x1 = -1, y1 = -1;
    for (let y = 0; y < mk.h; y++) for (let x = 0; x < mk.w; x++) if (mk.data[(y * mk.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    let mask = null;
    if (x1 >= 0) { const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) data.set(mk.data.subarray(((y0 + y) * mk.w + x0) * 4, ((y0 + y) * mk.w + x1 + 1) * 4), y * w * 4); mask = { x: r[0] + x0, y: r[1] + y0, w, h, data }; }
    // the body cut to its paint too (a painted folder's rect is its whole cell)
    let bx0 = im.w, by0 = im.h, bx1 = -1, by1 = -1;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] > 2) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (bx1 < 0) return `frame ${key} is empty`;
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, body = new Uint8ClampedArray(bw * bh * 4);
    for (let y = 0; y < bh; y++) body.set(im.data.subarray(((by0 + y) * im.w + bx0) * 4, ((by0 + y) * im.w + bx1 + 1) * 4), y * bw * 4);
    list.push({ k, pose, img: { x: r[0] + bx0, y: r[1] + by0, w: bw, h: bh, data: body }, mask });
  }
  return { cell: { ax: J.anchor.x / 2, ay: J.anchor.y / 2 }, list, drawn: J.drawn || J.size || '' };
}
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' };
const ROOTS = [['/tone.mjs', join(HERE, '../tone.mjs')], ['/three/addons/', join(REPO, 'node_modules/three/examples/jsm/')], ['/three/', join(REPO, 'node_modules/three/build/')], ['/sheet/', join(PICTURES, 'units/')]];
const HTML = `<!doctype html><script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script><script type="module" src="/page.js"></script>`;
const CODE = ['page.js', 'stage.js', 'rig.js', 'guard.js', '../tone.mjs'];
let tRender = 0, cached = 0;
/** The model's frames, rendered (or from target/newart/cache, under a hash of everything they come from: this
 *  folder's browser code, the sheet, the stage and the unit's numbers): the same shape as `folder`'s. */
async function model(name, u) {
  const poses = [u.stand, ...u.walk, ...(u.strike || [])], view = { ...VIEW, px: u.px };
  const sheets = [...readFileSync(join(HERE, `${u.model}.js`), 'utf8').matchAll(/sheet: '([^']+)'/g)].map(m => m[1]);
  const key = createHash('sha256').update(JSON.stringify([view, u, FACINGS])).update(CODE.map(f => readFileSync(join(HERE, f), 'utf8')).join('\0'));
  for (const f of sheets) { if (!existsSync(join(PICTURES, 'units', f))) return `its sheet ${f} is not there`; key.update(readFileSync(join(PICTURES, 'units', f))); }
  const cacheFile = join(REPO, 'target/newart/cache', `${name}-${key.digest('hex').slice(0, 16)}.json`);
  let list;
  if (!flag('--fresh') && existsSync(cacheFile)) { list = JSON.parse(readFileSync(cacheFile, 'utf8')); cached++; }
  else {
    const t0 = Date.now(), browser = await launchChromium(), page = await browser.newPage(), clipped = [];
    page.on('pageerror', e => { console.error('page error:', e.message, e.stack); process.exitCode = 1; });
    page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.route('http://newart.local/**', (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: HTML });
      const r = ROOTS.find(([pre]) => p.startsWith(pre)), file = r ? join(r[1], p.slice(r[0].length)) : join(HERE, p);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'no ' + p });
      route.fulfill({ contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    });
    await page.goto('http://newart.local/'); await page.waitForFunction('window.ready', null, { timeout: 60000 });
    const have = await page.evaluate(([k, v]) => window.init(k, v), [u.kind, view]); list = [];
    for (const f of poses) if (!have.includes(f)) throw new Error(`${name}: the model has no pose ${f}`);
    for (let k = 0; k < FACINGS; k++) for (const pose of poses) {
      const s = await page.evaluate(([k, f, cell]) => window.shot(k, f, cell), [k, pose, u.cell]);
      if (!s.img) throw new Error(`${name} ${k}_${pose}: nothing drawn`);
      if (s.edge) clipped.push(`${k}_${pose}`);
      list.push({ k, pose, img: s.img, mask: s.mask });
    }
    await browser.close();
    if (clipped.length) console.warn(`${name}: ${clipped.length} frames touch the cell's edge: ${clipped.slice(0, 6).join(' ')}`);
    tRender += Date.now() - t0;
    mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, JSON.stringify(list));
  }
  const px = (c) => c && { ...c, data: new Uint8ClampedArray(Buffer.from(c.data, 'base64')) };
  return { cell: { ax: u.cell.ax, ay: u.cell.ay }, list: list.map(s => ({ ...s, img: px(s.img), mask: px(s.mask) })) };
}

// Pose suffixes from the original unit frames, shared by all 16 facings, and the reference heights for the build report.
const legacyFrames = JSON.parse(readFileSync(join(HERE, 'frames.json'), 'utf8'));

// ---------------------------------------------------------------- the frames
/** Color bled `n` px into the clear pixels round the paint (alpha stays 0): a filter never pulls black in. */
function bleed({ w, h, data }, n) {
  for (let pass = 0; pass < n; pass++) {
    const src = new Uint8ClampedArray(data), seen = (i) => src[i + 3] || src[i] || src[i + 1] || src[i + 2];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (seen(i)) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = (ny * w + nx) * 4; if (seen(j)) { r += src[j]; g += src[j + 1]; b += src[j + 2]; c++; } }
      if (c) { data[i] = Math.max(1, r / c); data[i + 1] = g / c; data[i + 2] = b / c; }
    }
  }
}
/** `src` ({ x, y, w, h, data } in the cell) redrawn into the rect [x0, y0, w, h] of the cell. */
function into(src, x0, y0, w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < src.h; r++) { const y = src.y + r - y0; if (y < 0 || y >= h) continue; for (let c = 0; c < src.w; c++) { const x = src.x + c - x0; if (x >= 0 && x < w) data.set(src.data.subarray((r * src.w + c) * 4, (r * src.w + c) * 4 + 4), (y * w + x) * 4); } }
  return { w, h, data };
}
/** A unit's drawn height (game px above its ground point), as the older atlas's was measured: the solid
 *  pixels' first row at least BODY of the widest, the median over the frames it stands and walks in. */
function unitTop(frames, ay, z) {
  const rises = [];
  for (const s of frames) {
    const { w, h, data, y } = s.img, row = new Uint16Array(h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (data[(r * w + c) * 4 + 3] === 255) row[r]++;
    const most = Math.max(...row); let top = h; for (let r = 0; r < h; r++) if (row[r] && row[r] >= BODY * most) { top = r; break; }
    rises.push(Math.max(0, ay * z - (y + top)) / z);
  }
  rises.sort((a, b) => a - b); return Math.round(rises[rises.length >> 1] * 2) / 2;
}
const sprites = [], group = { unitTops: {}, animations: {}, stand: [], fps: {}, carry: [], work: [], fire: {}, set: [] }, stats = [], shown = {};
const want = NAMED.length ? NAMED : Object.keys(UNITS).filter(n => !UNITS[n].off);
for (const name of want) {
  const u = UNITS[name]; if (!u) throw new Error(`no unit ${name} in the table (UNITS)`);
  const z = u.model ? Z : 2; // (a folder's frames are 2 px a game px)
  if (!u.model && Z !== 2) continue;
  const src = u.model ? await model(name, u) : folder(u.from);
  if (typeof src === 'string') { if (NAMED.length || !/no frames.json/.test(src)) console.warn(`${name} is left out: ${src}`); continue; }
  const kind = u.kind, ax = src.cell.ax * z, ay = src.cell.ay * z, by = (pose, k) => src.list.find(s => s.pose === pose && s.k === k);
  // the game's name for each of the source's frames
  const names = new Map(), walkFrom = u.stand ? 1 : 0;
  if (u.stand) names.set('0', u.stand);
  u.walk.forEach((f, i) => names.set(String(walkFrom + i), f));
  (u.strike || []).forEach((f, i) => names.set(['wind', 'strike'][i], f));
  for (const [as, f] of Object.entries(u.fire || {})) names.set(as, f);
  if (u.carry) { names.set('c0', u.carry.stand); u.carry.walk.forEach((f, i) => names.set(`c${i + 1}`, f)); }
  (u.work || []).forEach((f, i) => names.set(`k${i}`, f));
  if (u.set) names.set('set', u.set);
  for (const [as, f] of names) if (!by(f, 0)) throw new Error(`${name}: no frame ${f} (for ${kind}_<k>_${as})`);
  for (let k = 0; k < FACINGS; k++) {
    const made = new Map(), drawn = new Map(); // (by the game's name; by the source's frame: one drawn twice is one picture under two names)
    for (const [as, f] of names) {
      const s = by(f, k), full = `${kind}_${k}_${as}`;
      if (drawn.has(f)) { const [body, mask] = drawn.get(f); sprites.push({ name: full, alias: body }); if (mask) sprites.push({ name: full + '_m', alias: mask }); made.set(as, [body, mask]); continue; }
      // The body, cut to its paint and a clear border, the anchor counted from the cut (no trim: the client reads a
      // body's frame as it is; its portraits are cut by the paint's box, render.js `portrait`).
      const x0 = s.img.x - 1, y0 = s.img.y - 1, w = s.img.w + 2, h = s.img.h + 2;
      const anchor = { x: (ax - x0) / w, y: (ay - y0) / h }, img = into(s.img, x0, y0, w, h);
      bleed(img, BLEED);
      const body = { name: full, img, json: { anchor, sourceSize: { w, h }, spriteSourceSize: { x: 0, y: 0, w, h } } }; sprites.push(body);
      let mask = null;
      if (s.mask) { mask = { name: full + '_m', img: { w: s.mask.w, h: s.mask.h, data: s.mask.data }, json: { anchor, trimmed: true, sourceSize: { w, h }, spriteSourceSize: { x: s.mask.x - x0, y: s.mask.y - y0, w: s.mask.w, h: s.mask.h } } }; sprites.push(mask); }
      made.set(as, [body, mask]); drawn.set(f, [body, mask]);
    }
    // Keep missing poses addressable using this facing's standing body and its matching mask.
    for (const pose of legacyFrames[kind]?.poses ?? []) {
      if (made.has(pose)) continue;
      const frame = `${kind}_${k}_${pose}`;
      const [body, mask] = made.get('0') || made.get(String(walkFrom));
      sprites.push({ name: frame, alias: body });
      if (mask) sprites.push({ name: frame + '_m', alias: mask });
      (shown[name] ||= new Set()).add(pose);
    }
    group.animations[`${kind}_${k}`] = u.walk.map((f, i) => `${kind}_${k}_${walkFrom + i}`);
  }
  group.unitTops[kind] = u.top ?? unitTop(src.list.filter(s => s.pose === u.stand || u.walk.includes(s.pose)), src.cell.ay, z);
  if (u.stand) group.stand.push(kind);
  if (u.fps) group.fps[kind] = u.fps;
  if (u.carry) group.carry.push(kind);
  if (u.work) group.work.push(kind);
  if (u.fire) group.fire[kind] = Object.keys(u.fire);
  if (u.set) group.set.push(kind);
  // (the team paint's value: the mean of the masks' solid pixels; today's masks run 196 to 234, and the seats' tints are fitted to them)
  let sum = 0, n = 0; for (const s of src.list) if (s.mask) for (let i = 0; i < s.mask.data.length; i += 4) if (s.mask.data[i + 3] === 255) { sum += 0.3 * s.mask.data[i] + 0.59 * s.mask.data[i + 1] + 0.11 * s.mask.data[i + 2]; n++; }
  stats.push(`${name} -> ${kind}: ${names.size * FACINGS} frames, top ${group.unitTops[kind]} (today ${legacyFrames[kind]?.top}), team mask's mean ${n ? Math.round(sum / n) : 'none'}${shown[name] ? `, today's ${[...shown[name]].join(' ')} take its standing frame` : ''}`);
  // (what is drawn, for the folder's own word on it: the standing frame at facing 0, its pixels more solid than a shadow)
  { const f = by(names.get('0'), 0).img; let x0 = f.w, y0 = f.h, x1 = -1, y1 = -1; for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.data[(y * f.w + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    stats[stats.length - 1] += `; facing 0 standing ${Math.round((x1 - x0 + 1) * 2 / z)} x ${Math.round((y1 - y0 + 1) * 2 / z)} px solid${src.drawn ? ` (its folder: ${src.drawn})` : ''}`; }
  if (arg('--check')) check(name, src, z);
}
if (!stats.length) throw new Error('nothing to pack');

// ---------------------------------------------------------------- the pages: shelves, tallest first, in the smallest power-of-two pages that hold them
const real = sprites.filter(s => !s.alias);
function shelves(W) {
  const order = real.map((s, i) => i).sort((a, b) => real[b].img.h - real[a].img.h || real[b].img.w - real[a].img.w || a - b);
  const pages = []; let p = null;
  for (const i of order) {
    const { w, h } = real[i].img; if (w > W || h > PAGE) return null;
    if (!p) pages.push(p = { x: 0, y: 0, shelf: 0, items: [] });
    if (p.x + w > W) { p.x = 0; p.y += p.shelf + GAP; p.shelf = 0; }
    if (p.y + h > PAGE) pages.push(p = { x: 0, y: 0, shelf: 0, items: [] });
    p.items.push({ i, x: p.x, y: p.y }); p.x += w + GAP; p.shelf = Math.max(p.shelf, h);
  }
  for (const q of pages) { q.w = W; q.h = 2 ** Math.ceil(Math.log2(Math.max(...q.items.map(it => it.y + real[it.i].img.h)))); }
  return pages;
}
const t1 = Date.now(), size = (ps) => ps.reduce((s, q) => s + q.w * q.h, 0);
let pages = null; for (const W of [2048, 1024, 512]) { const p = shelves(W); if (p && (!pages || size(p) < size(pages))) pages = p; }
if (!pages) throw new Error('a frame is larger than a page');
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (/^unit-\d+\.(json|webp)$/.test(f)) rmSync(join(OUT, f));
const files = []; let bytes = 0, gpu = 0;
for (const [n, p] of pages.entries()) {
  const data = new Uint8ClampedArray(p.w * p.h * 4), frames = {};
  for (const { i, x, y } of p.items) {
    const s = real[i], { w, h, data: src } = s.img;
    for (let r = 0; r < h; r++) data.set(src.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * p.w + x) * 4);
    frames[s.name] = s.frame = { frame: { x, y, w, h }, ...s.json }; s.page = n;
  }
  for (const s of sprites) if (s.alias && s.alias.page === n) frames[s.name] = s.alias.frame;
  const webp = await encodeWebP({ w: p.w, h: p.h, data }, LOSSY ? { lossless: 0, quality: +LOSSY, alpha_quality: 100, exact: 0, use_sharp_yuv: 1 } : undefined);
  const json = JSON.stringify({ frames, meta: { app: 'ebbfall tools/newart/unit', image: `unit-${n}.webp`, format: 'RGBA8888', size: { w: p.w, h: p.h }, scale: String(Z) } });
  writeFileSync(join(OUT, `unit-${n}.webp`), webp); writeFileSync(join(OUT, `unit-${n}.json`), json);
  files.push(`unit-${n}.json`); bytes += webp.length + json.length; gpu += p.w * p.h * 4 * 4 / 3; // (with its mipmaps)
}
// The index: this group's entry, the others' kept. What render.js UnitObj reads of it: `stand` (the kinds whose frame
// 0 is the standing pose, their walk in frames 1..n), `fps`, `carry`, `work`, `fire`, `set` (the kinds with those poses).
const ixFile = join(OUT, 'index.json'); let ix = {};
try { ix = JSON.parse(readFileSync(ixFile, 'utf8')); } catch { /* none yet */ }
ix.groups = { ...ix.groups, unit: { pages: files, scale: Z, ...group } };
writeFileSync(ixFile, JSON.stringify(ix, null, 1)); stamp(OUT);
for (const s of stats) console.log(s);
console.log(`unit: ${stats.length} units on ${pages.length} page(s) ${pages.map(p => `${p.w}x${p.h}`).join(' ')} at scale ${Z} (${Math.round(real.reduce((s, x) => s + x.img.w * x.img.h, 0) / size(pages) * 100)}% used), ${LOSSY ? `lossy WebP q${LOSSY}` : 'lossless WebP'}: ${bytes} B to download, ${(gpu / 2 ** 20).toFixed(1)} MB on the GPU with mipmaps; the model's render ${tRender ? (tRender / 1000).toFixed(1) + ' s' : cached ? 'from the cache' : 'not asked'}, pack ${((Date.now() - t1) / 1000).toFixed(1)} s`);

// ---------------------------------------------------------------- the contact sheet (--check): every facing of every frame in seat 0's paint on grass, then the same at half
function check(name, src, z) {
  const TINT = [0x2a, 0x5d, 0xdf], GRASS = [96, 132, 52], poses = [...new Set(src.list.map(s => s.pose))];
  const l = Math.max(...src.list.map(s => src.cell.ax * z - s.img.x)), r = Math.max(...src.list.map(s => s.img.x + s.img.w - src.cell.ax * z)), up = Math.max(...src.list.map(s => src.cell.ay * z - s.img.y)), dn = Math.max(...src.list.map(s => s.img.y + s.img.h - src.cell.ay * z));
  const cw = Math.ceil(l + r) + 4, ch = Math.ceil(up + dn) + 4, W = FACINGS * cw, H = poses.length * ch, big = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) big.set([...GRASS, 255], i * 4);
  const over = (s, ox, oy, tint) => { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = (y * s.w + x) * 4, a = s.data[j + 3] / 255, i = (Y * W + X) * 4; if (!a) continue; for (let q = 0; q < 3; q++) big[i + q] = big[i + q] * (1 - a) + (tint ? s.data[j + q] * tint[q] / 255 : s.data[j + q]) * a; } };
  for (const s of src.list) { const ox = Math.round(s.k * cw + 2 + l - src.cell.ax * z), oy = Math.round(poses.indexOf(s.pose) * ch + 2 + up - src.cell.ay * z); over(s.img, ox + s.img.x, oy + s.img.y); if (s.mask) over(s.mask, ox + s.mask.x, oy + s.mask.y, TINT); }
  // (the ground point: a small red cross on each frame)
  for (let k = 0; k < FACINGS; k++) for (let q = 0; q < poses.length; q++) { const gx = Math.round(k * cw + 2 + l), gy = Math.round(q * ch + 2 + up); for (let d = -3; d <= 3; d++) for (const [X, Y] of [[gx + d, gy], [gx, gy + d]]) if (X >= 0 && Y >= 0 && X < W && Y < H) big.set([255, 40, 40, 255], (Y * W + X) * 4); }
  const w1 = W >> 1, h1 = H >> 1, all = { w: W, h: H + h1, data: new Uint8ClampedArray(W * (H + h1) * 4) };
  all.data.set(big); for (let i = W * H; i < W * (H + h1); i++) all.data.set([...GRASS, 255], i * 4);
  for (let y = 0; y < h1; y++) for (let x = 0; x < w1; x++) for (let q = 0; q < 3; q++) all.data[((H + y) * W + x) * 4 + q] = (big[((y * 2) * W + x * 2) * 4 + q] + big[((y * 2) * W + x * 2 + 1) * 4 + q] + big[((y * 2 + 1) * W + x * 2) * 4 + q] + big[((y * 2 + 1) * W + x * 2 + 1) * 4 + q]) / 4;
  const file = resolve(arg('--check').replace('%', name)); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, encodePNG(all));
  console.log(`check: ${file}`);
}
