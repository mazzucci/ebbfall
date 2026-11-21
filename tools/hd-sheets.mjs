// HD experiment (branch hd-exp, never merged): the judge's pictures from target/hd/shots (tools/hd-capture.mjs) and
// target/hd/raw (tools/art/hd-render.mjs), drawn on a canvas in one headless Chromium (pixels copied, never smoothed).
//   node tools/hd-sheets.mjs <outdir>
//   full/     the screenshots as shot                       <config>--<view>--<level>.png
//   crops/    one region of each, 1:1, a file per level     <config>--<view>--<level>.png
//   sheets/   the same region of the three levels side by side, 1:1, labeled
//   blind/    the same sheets, the levels in a shuffled order under A, B, C (key.json)
//   details/  small regions round a point of interest, each pixel drawn 3x3, the three levels side by side
//   frames/   the renderer's own frames: sheets of a frame at 1x, 2x, 3x drawn to one size (x6, x3, x2), the PNGs
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';
import { encodePNG } from './art/png.js';

const root = fileURLToPath(new URL('../', import.meta.url)), shots = join(root, 'target/hd/shots'), raw = join(root, 'target/hd/raw');
const out = resolve(process.argv[2]);
for (const d of ['full', 'crops', 'sheets', 'blind', 'details', 'frames']) mkdirSync(join(out, d), { recursive: true });
const LEVELS = [['1x', '1x (today)'], ['2x', '2x'], ['3x', '3x']];
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const browser = await launchChromium();
const key = {};
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.route('http://sheet.local/**', (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' });
    if (!existsSync(p)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: extname(p) === '.png' ? 'image/png' : 'application/octet-stream', body: readFileSync(p) });
  });
  await page.goto('http://sheet.local/');
  await page.evaluate(() => {
    const cache = new Map();
    window.drop = () => { for (const b of cache.values()) b.close(); cache.clear(); };
    const load = async (src) => { if (!cache.has(src)) cache.set(src, await createImageBitmap(await (await fetch(src)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })); return cache.get(src); };
    /** panels: [{ src, sx, sy, sw, sh, label }] drawn `scale` times (whole pixels, no smoothing), side by side with a
     *  `gap`, a label over each and a `title` over all; `bg` under transparent frames. Returns a PNG as base64. */
    window.sheet = async ({ panels, scale = 1, title = '', gap = 8, bg = null, bare = false }) => {
      const imgs = await Promise.all(panels.map(p => load(p.src)));
      const sc = panels.map(p => p.scale ?? scale), pw = panels.map((p, i) => p.sw * sc[i]), ph = Math.max(...panels.map((p, i) => p.sh * sc[i])), head = bare ? 0 : 26, top = bare || !title ? 0 : 28;
      const c = document.createElement('canvas'); c.width = pw.reduce((a, b) => a + b, 0) + gap * (panels.length - 1); c.height = top + head + ph;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      if (!bare) { g.fillStyle = '#14181f'; g.fillRect(0, 0, c.width, c.height); }
      g.font = '15px sans-serif'; g.textBaseline = 'middle';
      if (top) { g.fillStyle = '#c9d2e0'; g.fillText(title, 6, 14); }
      let x = 0;
      panels.forEach((p, i) => {
        if (bg) { g.fillStyle = bg; g.fillRect(x, top + head, pw[i], p.sh * sc[i]); }
        g.drawImage(imgs[i], p.sx, p.sy, p.sw, p.sh, x, top + head, pw[i], p.sh * sc[i]);
        if (!bare) { g.fillStyle = '#ffffff'; g.font = 'bold 15px sans-serif'; g.fillText(p.label, x + 6, top + 13); g.font = '15px sans-serif'; }
        x += pw[i] + gap;
      });
      const blob = await new Promise(r => c.toBlob(r, 'image/png')), buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    };
  });
  const draw = async (file, job) => writeFileSync(file, Buffer.from(await page.evaluate((j) => window.sheet(j), job), 'base64'));
  const url = (p) => 'http://sheet.local' + p.split('/').map(encodeURIComponent).join('/');

  // ---- the game's captures ----
  const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; // (ONLY=t1080,t1440: those captures' pictures again, nothing else)
  for (const config of existsSync(shots) ? readdirSync(shots).sort() : []) {
    if (ONLY && !ONLY.includes(config)) continue;
    const log = JSON.parse(readFileSync(join(shots, config, 'shots.json'), 'utf8')), [W, H] = log.viewport, dpr = log.dpr, PW = W * dpr, PH = H * dpr;
    const what = `${W}x${H} CSS px at DPR ${dpr} (${PW}x${PH} device px), zoom ${log.zoom}`;
    for (const [view, v] of Object.entries(log.views)) {
      const src = (l) => url(join(shots, config, `${view}-${l}.png`));
      for (const [l] of LEVELS) copyFileSync(join(shots, config, `${view}-${l}.png`), join(out, 'full', `${config}--${view}--${l}.png`));
      // the region: round the view's middle (the camera's), at most a third of a 2900 px sheet, the HUD's rows left out
      const cw = Math.min(PW, dpr === 1 ? 720 : 940), ch = Math.min(PH - Math.round(260 * dpr), dpr === 1 ? 560 : 900);
      // (the fight's region: round the Knight nearest an enemy, where the two lines meet, inside the canvas)
      const B = log.canvasBox, hot = view === 'fight' && (v.poi || []).find(p => p.label === 'knight');
      const mx = hot ? ((hot.x - v.cam.x) * v.cam.zoom + B.x) * dpr : PW / 2, my = hot ? ((hot.y - v.cam.y) * v.cam.zoom + B.y) * dpr : PH / 2;
      const sx = Math.round(Math.max(B.x * dpr, Math.min((B.x + B.width) * dpr - cw, mx - cw / 2))), sy = Math.round(Math.max(B.y * dpr, Math.min((B.y + B.height) * dpr - ch, my - ch / 2)));
      const panel = ([l, label]) => ({ src: src(l), sx, sy, sw: cw, sh: ch, label });
      for (const [l] of LEVELS) await draw(join(out, 'crops', `${config}--${view}--${l}.png`), { panels: [panel([l, ''])], bare: true });
      await draw(join(out, 'sheets', `${config}--${view}.png`), { panels: LEVELS.map(panel), title: `${view}: ${what}; one region of the frame at 1:1 (device px), the same instant at each level` });
      const rnd = mulberry([...`${config}${view}`].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7)), order = LEVELS.map((l, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
      key[`${config}--${view}`] = Object.fromEntries(order.map((i, k) => ['ABC'[k], LEVELS[i][0]]));
      await draw(join(out, 'blind', `${config}--${view}.png`), { panels: order.map((i, k) => panel([LEVELS[i][0], 'ABC'[k]])), title: `${view}: ${what}; 1:1` });
      // the trailer's pair: the Castle, the Drones over it and the Knights beside it, 1:1
      if (config.startsWith('t')) {
        const at = (p) => [((p.x - v.cam.x) * v.cam.zoom + log.canvasBox.x) * dpr, ((p.y - v.cam.y) * v.cam.zoom + log.canvasBox.y) * dpr];
        const c = at(v.poi.find(p => p.label === 'castle-base')), d = at(v.poi.find(p => p.label === 'shrike')), tw = Math.min(PW, 900), th = Math.min(PH, 640);
        const tx = Math.round(Math.max(0, Math.min(PW - tw, (c[0] + d[0]) / 2 - tw / 2 - 40 * dpr))), ty = Math.round(Math.max(0, Math.min(PH - th, c[1] - th / 2 - 10 * dpr)));
        await draw(join(out, 'sheets', `${config}--trailer.png`), { panels: LEVELS.map(([l, label]) => ({ src: src(l), sx: tx, sy: ty, sw: tw, sh: th, label })), title: `the trailer's question: ${what}; the Castle, Knights and Drones at 1:1 (device px = video px)` });
        for (const [l] of LEVELS) await draw(join(out, 'crops', `${config}--trailer--${l}.png`), { panels: [{ src: src(l), sx: tx, sy: ty, sw: tw, sh: th, label: '' }], bare: true });
      }
      // the details: 150 x 120 CSS px round each point, each device px drawn 3x3
      for (const [n, p] of (v.poi || []).entries()) {
        const dw = 150 * dpr, dh = 120 * dpr, px = Math.round(((p.x - v.cam.x) * v.cam.zoom + log.canvasBox.x) * dpr), py = Math.round(((p.y - v.cam.y) * v.cam.zoom + log.canvasBox.y) * dpr);
        const dx = Math.max(0, Math.min(PW - dw, px - dw / 2)), dy = Math.max(0, Math.min(PH - dh, py - dh / 2));
        if (px < 0 || py < 0 || px >= PW || py >= PH) continue;
        await draw(join(out, 'details', `${config}--${view}--${n}-${p.label}.png`), { panels: LEVELS.map(([l, label]) => ({ src: src(l), sx: dx, sy: dy, sw: dw, sh: dh, label })), scale: 3, title: `${view}, ${p.label}: ${what}; each device px drawn 3x3` });
      }
      await page.evaluate(() => window.drop());
      console.log(`${config} ${view}`);
    }
  }
  if (!ONLY) writeFileSync(join(out, 'blind', 'key.json'), JSON.stringify(key, null, 1));

  // ---- the renderer's own frames ----
  const tmp = join(root, 'target/hd/frames'); mkdirSync(tmp, { recursive: true });
  const frame = (tag, name) => {
    const ix = JSON.parse(readFileSync(join(raw, tag, 'index.json'), 'utf8')).sprites.find(s => s.name === name); if (!ix) return null;
    const dir = join(out, 'frames', tag); mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.png`);
    if (!existsSync(file)) writeFileSync(file, encodePNG({ w: ix.w, h: ix.h, data: new Uint8ClampedArray(readFileSync(join(raw, tag, `${name}.rgba`))) }));
    return { src: url(file), sx: 0, sy: 0, sw: ix.w, sh: ix.h };
  };
  const NAMES = ['lancer_2_0', 'lancer_6_1', 'lancer_10_0', 'lancer_14_1', 'knight_2_0', 'knight_6_1', 'knight_10_0', 'knight_2_wind', 'knight_2_strike', 'knight_6_strike', 'shrike_2_0', 'shrike_6_1', 'shrike_10_0', 'shrike_14_1',
    'umbra_2_0', 'umbra_6_1', 'umbra_10_0', 'umbra_14_1', 'bldg_core', 'bldg_conflux'];
  const GRASS = '#5f7f3f';
  for (const name of ONLY ? [] : NAMES) {
    for (const m of ['', '_m']) for (const tag of ['1x', '2x', '3x', '2x-px']) if (existsSync(join(raw, tag, 'index.json'))) frame(tag, name + m);
    // one size for all three: a 1x frame px drawn 6x6, a 2x one 3x3, a 3x one 2x2; a building's frame in two regions
    const regions = /^bldg_/.test(name) ? [['--upper', 0.12, 0.16, 0.36, 0.26], ['--lower', 0.3, 0.46, 0.36, 0.26]] : [['', 0, 0, 1, 1]];
    for (const [suffix, fx, fy, fw, fh] of regions) {
      const panels = [];
      for (const [tag, label, sc] of [['1x', '1x (today)', 6], ['2x', '2x', 3], ['3x', '3x', 2]]) {
        if (!existsSync(join(raw, tag, 'index.json'))) continue;
        const f = frame(tag, name), f1 = frame('1x', name), k = 6 / sc; if (!f) continue;
        const r = { sx: Math.round(f1.sw * fx) * k, sy: Math.round(f1.sh * fy) * k, sw: Math.round(f1.sw * fw) * k, sh: Math.round(f1.sh * fh) * k };
        panels.push({ ...f, ...r, sw: Math.min(r.sw, f.sw - r.sx), sh: Math.min(r.sh, f.sh - r.sy), scale: sc, label: `${label}: each frame px ${sc}x${sc}` });
      }
      await draw(join(out, 'frames', `${name}${suffix}.png`), { panels, bg: GRASS, title: `${name}${suffix}: the renderer's frame at each level, drawn to one size (no game, no filtering)` });
    }
    await page.evaluate(() => window.drop());
  }
  // the finish: 2x with its kernels scaled (the one in the game's captures) against 2x with them left in output px
  if (!ONLY && existsSync(join(raw, '2x-px', 'index.json'))) for (const name of ['knight_2_0', 'umbra_6_1', 'bldg_core']) {
    const a = frame('2x', name), b = frame('2x-px', name), s = /^bldg_/.test(name) ? 1 : 3;
    await draw(join(out, 'frames', `finish--${name}.png`), { panels: [{ ...a, label: '2x, the finish scaled with the resolution (used in the captures)' }, { ...b, label: '2x, the finish left in output px (ink and rim lines half as wide)' }], scale: s, bg: GRASS, title: `${name} at 2x, each frame px ${s}x${s}: the two ways to run the polish finish` });
    await page.evaluate(() => window.drop());
  }
} finally { await browser.close(); }
console.log('sheets written to', out);
